from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models import BloodRequest, HospitalMembership, User
from app.schemas.analytics import AnalyticsOverviewRead

router = APIRouter(prefix="/analytics", tags=["Analytics"])


@router.get("/overview", response_model=AnalyticsOverviewRead)
async def get_analytics_overview(
    scope: str = Query(default="hospital", pattern="^(hospital|admin|donor)$"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AnalyticsOverviewRead:
    requests_stmt = select(
        func.count(BloodRequest.id),
        func.sum(case((BloodRequest.status.in_(["published", "partially_fulfilled"]), 1), else_=0)),
        func.sum(case((BloodRequest.urgency.in_(["urgent", "critical"]), 1), else_=0)),
        func.sum(case((BloodRequest.status == "fulfilled", 1), else_=0)),
    )

    if scope == "admin":
        if not current_user.is_superuser:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
    elif scope == "hospital":
        hospital_id = (await db.execute(select(HospitalMembership.hospital_profile_id).where(HospitalMembership.user_id == current_user.id, HospitalMembership.is_active.is_(True)))).scalar_one_or_none()
        requests_stmt = requests_stmt.where(BloodRequest.hospital_profile_id == hospital_id)

    total_requests, open_requests, urgent_requests, filled_requests = (await db.execute(requests_stmt)).one()

    blood_type_stmt = (
        select(BloodRequest.blood_type, func.count(BloodRequest.id).label("count"))
        .group_by(BloodRequest.blood_type)
        .order_by(func.count(BloodRequest.id).desc())
    )

    if scope == "hospital":
        blood_type_stmt = blood_type_stmt.where(BloodRequest.hospital_profile_id == hospital_id)

    top_blood_type_result = (await db.execute(blood_type_stmt.limit(1))).first()

    total = int(total_requests or 0)
    open_count = int(open_requests or 0)
    urgent_count = int(urgent_requests or 0)
    filled_count = int(filled_requests or 0)

    fill_rate = round((filled_count / total) * 100, 2) if total else 0.0
    urgent_rate = round((urgent_count / total) * 100, 2) if total else 0.0

    return AnalyticsOverviewRead(
        scope=scope,
        total_requests=total,
        open_requests=open_count,
        urgent_requests=urgent_count,
        filled_requests=filled_count,
        fill_rate_percent=fill_rate,
        urgent_rate_percent=urgent_rate,
        most_requested_blood_type=top_blood_type_result[0] if top_blood_type_result else None,
    )
