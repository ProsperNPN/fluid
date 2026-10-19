"""PostgreSQL outbox worker. SMTP acceptance is not delivery confirmation."""
import asyncio
import logging
import re
import ssl
import smtplib
from email.message import EmailMessage
from datetime import datetime, timedelta, timezone
import httpx
from sqlalchemy import select
from app.core.config import settings
from app.models import AlertDelivery, EmergencyAlert, Notification, BloodRequest, DonorProfile, DonorResponse, User, HospitalProfile
from app.services.emergency_alerts import queue_alerts, ACTIVE
from app.services.blood_matching import match_request
from app.services.request_lifecycle import expire_requests

logger = logging.getLogger(__name__)


class DeliveryFailure(Exception):
    def __init__(self, code, retry=False, ambiguous=False):
        self.code, self.retry, self.ambiguous = code, retry, ambiguous


def send_email(address, title, body, job_id):
    if not settings.SMTP_HOST or not settings.SMTP_FROM_EMAIL:
        raise DeliveryFailure("smtp_not_configured")
    message = EmailMessage()
    message["From"], message["To"], message["Subject"] = settings.SMTP_FROM_EMAIL, address, title
    message["Message-ID"] = f"<{job_id}@alerts.fluid>"
    message.set_content(body)
    submitted = False
    try:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15) as smtp:
            smtp.starttls(context=ssl.create_default_context())
            if settings.SMTP_USERNAME and settings.SMTP_PASSWORD:
                smtp.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
            submitted = True
            refused = smtp.send_message(message)
            if refused:
                raise DeliveryFailure("smtp_recipient_refused")
    except smtplib.SMTPRecipientsRefused as exc:
        retry = bool(exc.recipients) and all(400 <= result[0] < 500 for result in exc.recipients.values())
        raise DeliveryFailure("smtp_recipient_refused", retry=retry) from None
    except smtplib.SMTPResponseException as exc:
        raise DeliveryFailure(f"smtp_{exc.smtp_code}", retry=400 <= exc.smtp_code < 500) from None
    except (OSError, smtplib.SMTPException):
        raise DeliveryFailure("smtp_transport_error", retry=not submitted, ambiguous=submitted) from None
    return "accepted", None


async def send_sms(phone, body, provider_id=None):
    if not all((settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN, settings.TWILIO_FROM_NUMBER)):
        raise DeliveryFailure("sms_not_configured")
    url = f"https://api.twilio.com/2010-04-01/Accounts/{settings.TWILIO_ACCOUNT_SID}/Messages"
    async with httpx.AsyncClient(timeout=15, auth=(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)) as client:
        try:
            result = await client.get(f"{url}/{provider_id}.json") if provider_id else await client.post(
                f"{url}.json", data={"To": phone, "From": settings.TWILIO_FROM_NUMBER, "Body": body})
        except (httpx.ConnectError, httpx.ConnectTimeout):
            raise DeliveryFailure("sms_connect_error", retry=True) from None
        except httpx.HTTPError:
            raise DeliveryFailure("sms_transport_error", retry=bool(provider_id), ambiguous=not provider_id) from None
        if result.status_code >= 400:
            raise DeliveryFailure(f"sms_http_{result.status_code}", retry=result.status_code == 429 or (bool(provider_id) and result.status_code >= 500), ambiguous=not provider_id and result.status_code >= 500)
        data = result.json()
        state = data.get("status")
        if state in {"failed", "undelivered", "canceled"}:
            return "failed", data.get("sid")
        return ("delivered" if state == "delivered" else "accepted"), data.get("sid")


async def scan_requests(factory):
    async with factory() as db:
        await expire_requests(db)
        ids = list((await db.execute(select(BloodRequest.id).where(BloodRequest.status.in_(ACTIVE),
            BloodRequest.urgency.in_(["urgent", "critical"])))).scalars())
    for request_id in ids:
        async with factory() as db:
            request = (await db.execute(select(BloodRequest).where(BloodRequest.id == request_id)
                .with_for_update(skip_locked=True))).scalar_one_or_none()
            if request:
                hospital = await db.get(HospitalProfile, request.hospital_profile_id)
                if hospital and hospital.verification_status == "verified":
                    await queue_alerts(db, request)
                await db.commit()


async def process_delivery(factory):
    now = datetime.now(timezone.utc)
    async with factory() as db:
        # A crashed process might have submitted a message: do not blindly resend.
        stale = (await db.execute(select(AlertDelivery).where(AlertDelivery.status == "processing",
            AlertDelivery.lease_until < now).with_for_update(skip_locked=True))).scalars().all()
        for job in stale:
            job.status, job.error_code = "unknown", "worker_lease_expired"
        await db.commit()
        job = (await db.execute(select(AlertDelivery).where(AlertDelivery.status.in_(["queued", "retry", "accepted"]),
            AlertDelivery.next_attempt_at <= now).order_by(AlertDelivery.next_attempt_at).with_for_update(skip_locked=True).limit(1))).scalar_one_or_none()
        if not job:
            return False
        # Accepted SMTP messages cannot be confirmed by this SMTP transport.
        if job.status == "accepted" and job.channel == "email":
            job.next_attempt_at = now + timedelta(days=36500)
            await db.commit()
            return True
        alert = await db.get(EmergencyAlert, job.alert_id)
        request = await db.get(BloodRequest, alert.blood_request_id)
        profile = (await db.execute(select(DonorProfile).where(DonorProfile.user_id == alert.donor_user_id))).scalar_one_or_none()
        user = await db.get(User, alert.donor_user_id)
        hospital = await db.get(HospitalProfile, request.hospital_profile_id)
        notification = await db.get(Notification, alert.notification_id) if alert.notification_id else None
        enabled = settings.ALERT_EMAIL_ENABLED if job.channel == "email" else settings.ALERT_SMS_ENABLED
        response = (await db.execute(select(DonorResponse).where(DonorResponse.blood_request_id == request.id, DonorResponse.donor_user_id == alert.donor_user_id))).scalar_one_or_none()
        consent = profile and (profile.notify_email_alerts if job.channel == "email" else profile.notify_sms_alerts)
        if not enabled:
            job.status, job.error_code = "skipped", "channel_disabled"
            await db.commit()
            return True
        if not job.provider_id and not (notification and user and user.is_active and consent and profile.notify_urgent_requests and response and response.status == "invited" and
                hospital and hospital.verification_status == "verified" and request.urgency != "routine" and match_request(profile, request)[0]):
            job.status, job.error_code = "cancelled", "request_or_consent_inactive"
            await db.commit()
            return True
        if job.attempts >= settings.ALERT_RETRY_LIMIT and not job.provider_id:
            job.status, job.error_code = "failed", "retry_limit"
            await db.commit()
            return True
        if job.provider_id and (now - alert.created_at).total_seconds() > 86400:
            job.status, job.error_code = "unknown", "receipt_timeout"
            await db.commit()
            return True
        job.status, job.lease_until = "processing", now + timedelta(seconds=90)
        job.attempts += 1
        job_id, channel, provider_id = job.id, job.channel, job.provider_id
        address = user.email if channel == "email" else profile.phone
        title = notification.title if notification else "FLUID emergency request"
        body = (notification.message if notification else "FLUID emergency request") + f" Review request: {settings.FRONTEND_URL}/donor/notifications. Availability is subject to clinical screening."
        await db.commit()
    code = None
    try:
        if not address:
            raise DeliveryFailure("recipient_missing")
        if channel == "sms" and not provider_id and not re.fullmatch(r"\+[1-9]\d{6,14}", address):
            raise DeliveryFailure("sms_requires_e164_phone")
        state, reference = await asyncio.to_thread(send_email, address, title, body, job_id) if channel == "email" else await send_sms(address, body, provider_id)
    except DeliveryFailure as failure:
        state = "unknown" if failure.ambiguous else "retry" if failure.retry else "failed"
        reference, code = provider_id, failure.code
        logger.warning("Alert delivery %s: %s", job_id, code)
    except Exception:
        # Do not leak phone numbers, email addresses, credentials, or provider bodies.
        state, reference, code = "unknown", provider_id, "unexpected_provider_result"
        logger.warning("Alert delivery %s: unexpected provider result", job_id)
    async with factory() as db:
        job = (await db.execute(select(AlertDelivery).where(AlertDelivery.id == job_id).with_for_update())).scalar_one_or_none()
        if job and job.status == "processing":
            job.status, job.provider_id, job.error_code = state, reference, code
            job.next_attempt_at = datetime.now(timezone.utc) + timedelta(seconds=min(1800, 30 * 2 ** min(job.attempts, 6)))
            await db.commit()
    return True
