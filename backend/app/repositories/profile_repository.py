from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import DonorProfile, HospitalProfile


class ProfileRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_donor_profile(self, user_id: str) -> DonorProfile | None:
        stmt = select(DonorProfile).where(DonorProfile.user_id == user_id)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def create_donor_profile(
        self,
        *,
        user_id: str,
        blood_type: str = "O+",
        city: str = "Accra",
        availability: str = "Not set",
    ) -> DonorProfile:
        profile = DonorProfile(
            user_id=user_id,
            blood_type=blood_type,
            city=city,
            availability=availability,
        )
        self.db.add(profile)
        await self.db.flush()
        return profile

    async def get_hospital_profile(self, user_id: str) -> HospitalProfile | None:
        stmt = select(HospitalProfile).where(HospitalProfile.user_id == user_id)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def create_hospital_profile(
        self,
        *,
        user_id: str,
        hospital_name: str,
        city: str = "Accra",
        address: str = "Not set",
        contact_phone: str | None = None,
    ) -> HospitalProfile:
        profile = HospitalProfile(
            user_id=user_id,
            hospital_name=hospital_name,
            city=city,
            address=address,
            contact_phone=contact_phone,
        )
        self.db.add(profile)
        await self.db.flush()
        return profile
