from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models import BloodRequest, User
from app.schemas.portal import (
    AdminPortalDataRead,
    DonationHistoryRead,
    DonorAppointmentRead,
    DonorPortalDataRead,
    HospitalDonorResponseRead,
    HospitalPortalDataRead,
    PendingHospitalRead,
    PlatformActivityRead,
)

router = APIRouter(prefix="/portal", tags=["Portal"])


def _city_from_location(location: str) -> str:
    parts = [item.strip() for item in location.split(",") if item.strip()]
    return parts[0] if parts else location


@router.get("/donor-data", response_model=DonorPortalDataRead)
async def get_donor_portal_data(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> DonorPortalDataRead:
    history_stmt = (
        select(BloodRequest)
        .where(BloodRequest.status == "filled")
        .order_by(BloodRequest.created_at.desc())
        .limit(10)
    )
    appointments_stmt = (
        select(BloodRequest)
        .where(BloodRequest.status.in_(["open", "urgent"]))
        .order_by(BloodRequest.created_at.desc())
        .limit(5)
    )

    history_rows = list((await db.execute(history_stmt)).scalars().all())
    appointment_rows = list((await db.execute(appointments_stmt)).scalars().all())

    donation_history = [
        DonationHistoryRead(
            id=row.id,
            hospital=row.hospital_name,
            date=row.created_at.strftime("%Y-%m-%d"),
            blood_type=row.blood_type,
            status="completed",
        )
        for row in history_rows
    ]

    appointments = [
        DonorAppointmentRead(
            id=row.id,
            title=f"Donation Slot - {row.hospital_name}",
            date=(row.created_at + timedelta(days=1)).strftime("%Y-%m-%d %I:%M %p"),
            location=row.location,
        )
        for row in appointment_rows
    ]

    return DonorPortalDataRead(donation_history=donation_history, appointments=appointments)


@router.get("/hospital-data", response_model=HospitalPortalDataRead)
async def get_hospital_portal_data(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> HospitalPortalDataRead:
    requests_stmt = (
        select(BloodRequest)
        .where(BloodRequest.created_by_user_id == current_user.id)
        .order_by(BloodRequest.created_at.desc())
        .limit(20)
    )

    rows = list((await db.execute(requests_stmt)).scalars().all())

    donor_responses: list[HospitalDonorResponseRead] = []
    for idx, row in enumerate(rows[:8], start=1):
        response = "Accepted" if row.status == "filled" else "Pending"
        eta = "Done" if row.status == "filled" else ("30 min" if row.status == "urgent" else "2 hrs")
        donor_responses.append(
            HospitalDonorResponseRead(
                donor=f"Donor Match #{idx}",
                blood_type=row.blood_type,
                response=response,
                eta=eta,
            )
        )

    appointments = [
        DonorAppointmentRead(
            id=row.id,
            title=f"Donor Slot - {row.blood_type}",
            date=(row.created_at + timedelta(hours=6)).strftime("%Y-%m-%d %I:%M %p"),
            location=row.location,
        )
        for row in rows
        if row.status in {"open", "urgent"}
    ][:6]

    return HospitalPortalDataRead(donor_responses=donor_responses, appointments=appointments)


@router.get("/admin-data", response_model=AdminPortalDataRead)
async def get_admin_portal_data(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AdminPortalDataRead:
    if not current_user.is_superuser:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")

    rows_stmt = select(BloodRequest).order_by(BloodRequest.created_at.desc()).limit(100)
    rows = list((await db.execute(rows_stmt)).scalars().all())

    pending_hospitals: list[PendingHospitalRead] = []
    seen_hospitals: set[str] = set()

    for row in rows:
        if row.status not in {"open", "urgent"}:
            continue
        if row.hospital_name in seen_hospitals:
            continue

        seen_hospitals.add(row.hospital_name)
        pending_hospitals.append(
            PendingHospitalRead(
                name=row.hospital_name,
                city=_city_from_location(row.location),
                submitted=row.created_at.strftime("%Y-%m-%d"),
            )
        )

        if len(pending_hospitals) >= 10:
            break

    platform_activity = [
        PlatformActivityRead(
            event=f"Request {row.id[:8]} ({row.blood_type}) marked {row.status}",
            actor=row.hospital_name,
            time=f"{max(1, int((rows[0].created_at - row.created_at).total_seconds() // 60))}m ago" if rows else "just now",
        )
        for row in rows[:20]
    ]

    return AdminPortalDataRead(
        pending_hospitals=pending_hospitals,
        platform_activity=platform_activity,
    )
