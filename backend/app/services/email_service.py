import smtplib
from email.message import EmailMessage

from app.core.config import settings


def send_email(recipient: str | None, subject: str, body: str) -> bool:
    if not recipient or not settings.SMTP_HOST or not settings.SMTP_FROM_EMAIL:
        return False
    message = EmailMessage()
    message["From"] = settings.SMTP_FROM_EMAIL
    message["To"] = recipient
    message["Subject"] = subject
    message.set_content(body)
    try:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15) as client:
            client.starttls()
            if settings.SMTP_USERNAME and settings.SMTP_PASSWORD:
                client.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
            client.send_message(message)
        return True
    except (OSError, smtplib.SMTPException):
        # Delivery failure must not roll back an already committed verification action.
        return False
