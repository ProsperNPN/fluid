from sqlalchemy import select
from app.models import DonorProfile, Notification
async def notify(db, user_id, **content):
    profile = (await db.execute(select(DonorProfile).where(DonorProfile.user_id == user_id))).scalar_one_or_none()
    if profile and content.get("type") == "appointment" and not profile.notify_appointments: return
    if profile and content.get("type") == "eligibility" and not profile.notify_eligibility: return
    db.add(Notification(user_id=user_id, **content))
