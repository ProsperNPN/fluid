from datetime import datetime, timezone
from sqlalchemy import select
from app.models import BloodRequest

async def expire_requests(db, hospital_id=None):
    query = select(BloodRequest).where(BloodRequest.status.in_(["published", "partially_fulfilled"]), BloodRequest.expires_at <= datetime.now(timezone.utc)).with_for_update(skip_locked=True)
    if hospital_id: query = query.where(BloodRequest.hospital_profile_id == hospital_id)
    rows = (await db.execute(query)).scalars().all()
    for row in rows: row.status = "expired"
    if rows: await db.commit()
