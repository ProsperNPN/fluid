from datetime import datetime, timezone
from sqlalchemy import select, or_, update
from app.models import BloodRequest, DonorResponse

async def expire_requests(db, hospital_id=None):
    query = select(BloodRequest).where(BloodRequest.status.in_(["published", "partially_fulfilled"]), or_(BloodRequest.expires_at <= datetime.now(timezone.utc), BloodRequest.required_by <= datetime.now(timezone.utc))).with_for_update(skip_locked=True)
    if hospital_id: query = query.where(BloodRequest.hospital_profile_id == hospital_id)
    rows = (await db.execute(query)).scalars().all()
    for row in rows:
        row.status = "expired"
        from app.services.emergency_alerts import request_changed
        await request_changed(db, row)
        await db.execute(update(DonorResponse).where(DonorResponse.blood_request_id == row.id, DonorResponse.status.in_(["invited", "pending"])).values(status="expired"))
    if rows: await db.commit()
