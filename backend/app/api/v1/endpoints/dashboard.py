from app.services.request_lifecycle import expire_requests
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import get_current_user, get_hospital_context, require_hospital_operator
from app.core.database import get_db
from app.models import BloodRequest, HospitalProfile, DonorResponse, User
from app.schemas.dashboard import DashboardMetric, DashboardSummaryRead
router = APIRouter(prefix="/dashboard", tags=["Dashboard"])
@router.get("/summary", response_model=DashboardSummaryRead)
async def get_dashboard_summary(scope: str = Query("donor", pattern="^(donor|hospital|admin)$"), db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    await expire_requests(db)
    stmt = select(BloodRequest)
    if scope == "admin":
        if not current_user.is_superuser: raise HTTPException(403, "Insufficient permissions")
        users = int((await db.execute(select(func.count(User.id)))).scalar_one())
        hospitals = int((await db.execute(select(func.count(HospitalProfile.id)).where(HospitalProfile.verification_status == "verified"))).scalar_one())
    elif scope == "hospital":
        context = await require_hospital_operator(await get_hospital_context(db, current_user))
        stmt = stmt.where(BloodRequest.hospital_profile_id == context.hospital.id)
        users, hospitals = 1, 1
    else:
        if current_user.role != "donor": raise HTTPException(403, "Donor access only")
        stmt = stmt.join(DonorResponse, DonorResponse.blood_request_id == BloodRequest.id).where(DonorResponse.donor_user_id == current_user.id)
        users, hospitals = 1, 0
    rows = (await db.execute(stmt)).scalars().all()
    if scope == "donor": hospitals = len({r.hospital_profile_id for r in rows})
    open_count = sum(r.status in {"published", "partially_fulfilled"} for r in rows)
    urgent = sum(r.status in {"published", "partially_fulfilled"} and r.urgency in {"urgent", "critical"} for r in rows)
    filled = sum(r.status == "fulfilled" for r in rows)
    return DashboardSummaryRead(role=scope, metrics=[DashboardMetric(label="Requests", value=str(len(rows))),DashboardMetric(label="Active", value=str(open_count)),DashboardMetric(label="Urgent", value=str(urgent)),DashboardMetric(label="Fulfilled", value=str(filled))], total_requests=len(rows), open_requests=open_count, urgent_requests=urgent, filled_requests=filled, total_hospitals=hospitals, total_users=users)
