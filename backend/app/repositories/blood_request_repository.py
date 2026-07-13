from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import BloodRequest


class BloodRequestRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create(
        self,
        *,
        created_by_user_id: str,
        hospital_name: str,
        blood_type: str,
        units: int,
        location: str,
        status: str,
        hospital_profile_id: str | None = None,
        **fields,
    ) -> BloodRequest:
        blood_request = BloodRequest(
            created_by_user_id=created_by_user_id,
            hospital_name=hospital_name,
            blood_type=blood_type,
            units=units,
            location=location,
            status=status,
            hospital_profile_id=hospital_profile_id,
            **fields,
        )
        self.db.add(blood_request)
        await self.db.flush()
        return blood_request

    async def list_requests(self, *, created_by_user_id: str | None = None) -> list[BloodRequest]:
        stmt: Select[tuple[BloodRequest]] = select(BloodRequest).order_by(BloodRequest.created_at.desc())

        if created_by_user_id:
            stmt = stmt.where(BloodRequest.created_by_user_id == created_by_user_id)

        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def list_requests_page(
        self,
        *,
        created_by_user_id: str | None = None,
        page: int = 1,
        page_size: int = 10,
    ) -> tuple[list[BloodRequest], int]:
        count_stmt = select(func.count(BloodRequest.id))
        stmt: Select[tuple[BloodRequest]] = select(BloodRequest).order_by(BloodRequest.created_at.desc())

        if created_by_user_id:
            count_stmt = count_stmt.where(BloodRequest.created_by_user_id == created_by_user_id)
            stmt = stmt.where(BloodRequest.created_by_user_id == created_by_user_id)

        offset = (page - 1) * page_size
        stmt = stmt.offset(offset).limit(page_size)

        total = int((await self.db.execute(count_stmt)).scalar_one() or 0)
        result = await self.db.execute(stmt)
        return list(result.scalars().all()), total
