import asyncio
import getpass

from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.core.security import get_password_hash
from app.models import AuditLog, User


async def reset() -> None:
    password = getpass.getpass("New password: ")
    confirmation = getpass.getpass("Confirm new password: ")
    if len(password) < 8: raise SystemExit("Password must contain at least 8 characters.")
    if password != confirmation: raise SystemExit("Passwords do not match.")
    async with AsyncSessionLocal() as db:
        admin = (await db.execute(select(User).where(User.is_superuser.is_(True)))).scalar_one_or_none()
        if not admin: raise SystemExit("No Super Admin exists.")
        admin.hashed_password = get_password_hash(password)
        db.add(AuditLog(hospital_profile_id=None, actor_user_id=admin.id, action="super_admin.password_reset", entity_type="user", entity_id=admin.id))
        await db.commit()
    print("Super Admin password reset successfully.")


if __name__ == "__main__":
    asyncio.run(reset())
