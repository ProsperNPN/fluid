"""Explicit, audited approval of one existing local test hospital; never an API route.

Run from backend: python -m app.scripts.approve_local_test_hospital --apply
Without --apply, only validates and reports the exact target.
"""
import argparse
import asyncio
from unittest.mock import patch

from sqlalchemy import select
from sqlalchemy.engine import make_url

from app.api.v1.endpoints.verifications import decide_verification
from app.core.config import settings
from app.core.database import AsyncSessionLocal, engine
from app.models import HospitalMembership, HospitalProfile, HospitalVerification, User
from app.schemas.verification import VerificationDecision

TARGET_USER_ID = "a7d5a517-172a-48c2-b156-fc09de69cb4f"
TARGET_HOSPITAL_ID = "29d37592-491e-43fc-918e-f225f8b5abda"
REVIEWER_ID = "4ac20525-9b1f-48cd-a28d-81125dbb4dfb"
NOTE = "Local development/testing approval explicitly requested by project owner. No clinical documents validated. Not a production accreditation."


def require_local_development(environment: str, database_url: str) -> None:
    url = make_url(database_url)
    if (environment != "development" or url.host not in {"localhost", "127.0.0.1", "::1"}
            or url.database != "fluid_db" or url.get_backend_name() != "postgresql"):
        raise RuntimeError("Approval is restricted to the local development fluid_db database")


async def approve(apply: bool = False) -> None:
    require_local_development(settings.ENVIRONMENT, settings.DATABASE_URL)
    async with AsyncSessionLocal() as db:
        user = await db.get(User, TARGET_USER_ID)
        hospital = (await db.execute(select(HospitalProfile).where(
            HospitalProfile.id == TARGET_HOSPITAL_ID).with_for_update())).scalar_one()
        admin = await db.get(User, REVIEWER_ID)
        membership = (await db.execute(select(HospitalMembership).where(
            HospitalMembership.user_id == TARGET_USER_ID,
            HospitalMembership.hospital_profile_id == TARGET_HOSPITAL_ID,
            HospitalMembership.is_active.is_(True)))).scalar_one()
        if not user or not user.is_active or user.role != "hospital" or hospital.user_id != user.id:
            raise RuntimeError("Target identity is not the expected active hospital owner")
        if membership.role != "hospital_admin":
            raise RuntimeError("Target must already have hospital administrator permission")
        if not admin or not admin.is_active or not admin.is_superuser:
            raise RuntimeError("Existing authorized Super Admin reviewer required")
        print(f"Account: {user.full_name}; user_id={user.id}; hospital_id={hospital.id}; status={hospital.verification_status}")
        if not apply:
            print("Dry run only. Pass --apply to record the development approval.")
            return
        latest = (await db.execute(select(HospitalVerification).where(
            HospitalVerification.hospital_profile_id == hospital.id).order_by(
            HospitalVerification.created_at.desc()).limit(1))).scalar_one_or_none()
        if hospital.verification_status == "verified" and latest and latest.status == "verified":
            print(f"Already approved; verification_id={latest.id}. No changes.")
            return
        if latest is None:
            latest = HospitalVerification(hospital_profile_id=hospital.id, status="pending", hospital_message=NOTE)
            db.add(latest)
            await db.flush()
        # Reuse the existing authorized decision workflow, including review, audit and
        # in-app notification. A local seed must not send external email.
        with patch("app.api.v1.endpoints.verifications.send_email"):
            result = await decide_verification(latest.id, VerificationDecision(action="verified", notes=NOTE), db, admin)
        print(f"Approved locally; verification_id={result.id}; reviewer_id={admin.id}")


async def main(apply: bool) -> None:
    try:
        await approve(apply)
    finally:
        await engine.dispose()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    asyncio.run(main(parser.parse_args().apply))
