"""Synthetic-only browser fixture. Refuses application databases."""
import asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.engine import make_url
from app.core.config import settings
from app.core.database import engine, AsyncSessionLocal, get_db
from app.main import create_application
from app.models import Base
from tests.test_portal_journey import approved_hospital
from tests.test_intelligent_matching import donor


async def main():
    assert make_url(settings.DATABASE_URL).database.startswith("fluid_notification_browser_qa_")
    assert not settings.ALERT_EMAIL_ENABLED and not settings.ALERT_SMS_ENABLED
    assert not settings.SMTP_HOST
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    async with AsyncSessionLocal() as db:
        app = create_application()
        async def session(): yield db
        app.dependency_overrides[get_db] = session
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            _, _, profile = await approved_hospital(client, db, "browser-hospital@test.invalid")
            profile.hospital_name = "Synthetic Browser Hospital"
            profile.latitude, profile.longitude, profile.address = 5.6, -.18, "Synthetic test facility"
            await db.commit()
            await donor(client, "browser-a", km=0)
            await donor(client, "browser-b", km=0, blood_type="B+")
    await engine.dispose()
    print("Synthetic browser fixtures ready")


if __name__ == "__main__": asyncio.run(main())
