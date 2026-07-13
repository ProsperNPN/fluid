from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import case, distinct, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models import BloodRequest, User
from app.schemas.dashboard import DashboardMetric, DashboardSummaryRead

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/summary", response_model=DashboardSummaryRead)
async def get_dashboard_summary(
    scope: str = Query(default="donor", pattern="^(donor|hospital|admin)$"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DashboardSummaryRead:
    total_users_stmt = select(func.count(User.id))
    total_hospitals_stmt = select(func.count(distinct(BloodRequest.hospital_name)))

    total_users = int((await db.execute(total_users_stmt)).scalar_one() or 0)
    total_hospitals = int((await db.execute(total_hospitals_stmt)).scalar_one() or 0)

    if scope == "admin":
        if not current_user.is_superuser:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")

        aggregate_stmt = select(
            func.count(BloodRequest.id),
            func.sum(case((BloodRequest.status == "open", 1), else_=0)),
            func.sum(case((BloodRequest.status == "urgent", 1), else_=0)),
            func.sum(case((BloodRequest.status == "filled", 1), else_=0)),
        )
        total_requests, open_requests, urgent_requests, filled_requests = (await db.execute(aggregate_stmt)).one()

        metrics = [
            DashboardMetric(label="Total Users", value=str(total_users)),
            DashboardMetric(label="Active Hospitals", value=str(total_hospitals)),
            DashboardMetric(label="Open Requests", value=str(int(open_requests or 0))),
            DashboardMetric(label="Filled Requests", value=str(int(filled_requests or 0))),
        ]

        return DashboardSummaryRead(
            role="admin",
            metrics=metrics,
            total_requests=int(total_requests or 0),
            open_requests=int(open_requests or 0),
            urgent_requests=int(urgent_requests or 0),
            filled_requests=int(filled_requests or 0),
            total_hospitals=total_hospitals,
            total_users=total_users,
        )

    if scope == "hospital":
        aggregate_stmt = select(
            func.count(BloodRequest.id),
            func.sum(case((BloodRequest.status == "open", 1), else_=0)),
            func.sum(case((BloodRequest.status == "urgent", 1), else_=0)),
            func.sum(case((BloodRequest.status == "filled", 1), else_=0)),
        ).where(BloodRequest.created_by_user_id == current_user.id)

        total_requests, open_requests, urgent_requests, filled_requests = (await db.execute(aggregate_stmt)).one()

        metrics = [
            DashboardMetric(label="My Total Requests", value=str(int(total_requests or 0))),
            DashboardMetric(label="My Open Requests", value=str(int(open_requests or 0))),
            DashboardMetric(label="My Urgent Requests", value=str(int(urgent_requests or 0))),
            DashboardMetric(label="My Filled Requests", value=str(int(filled_requests or 0))),
        ]

        return DashboardSummaryRead(
            role="hospital",
            metrics=metrics,
            total_requests=int(total_requests or 0),
            open_requests=int(open_requests or 0),
            urgent_requests=int(urgent_requests or 0),
            filled_requests=int(filled_requests or 0),
            total_hospitals=total_hospitals,
            total_users=total_users,
        )

    aggregate_stmt = select(
        func.count(BloodRequest.id),
        func.sum(case((BloodRequest.status == "open", 1), else_=0)),
        func.sum(case((BloodRequest.status == "urgent", 1), else_=0)),
        func.sum(case((BloodRequest.status == "filled", 1), else_=0)),
    )
    total_requests, open_requests, urgent_requests, filled_requests = (await db.execute(aggregate_stmt)).one()

    metrics = [
        DashboardMetric(label="Total Active Requests", value=str(int(total_requests or 0))),
        DashboardMetric(label="Urgent Requests", value=str(int(urgent_requests or 0))),
        DashboardMetric(label="Open Requests", value=str(int(open_requests or 0))),
        DashboardMetric(label="Supported Hospitals", value=str(total_hospitals)),
    ]

    return DashboardSummaryRead(
        role="donor",
        metrics=metrics,
        total_requests=int(total_requests or 0),
        open_requests=int(open_requests or 0),
        urgent_requests=int(urgent_requests or 0),
        filled_requests=int(filled_requests or 0),
        total_hospitals=total_hospitals,
        total_users=total_users,
    )
