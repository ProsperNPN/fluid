import asyncio
import getpass
import re

from sqlalchemy import func, select, text

from app.core.database import AsyncSessionLocal
from app.core.security import get_password_hash
from app.models import AuditLog, User

EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


async def create() -> None:
    full_name = input("Full name: ").strip()
    email = input("Email: ").strip().lower()
    password = getpass.getpass("Password: ")
    confirmation = getpass.getpass("Confirm password: ")
    if len(full_name) < 2: raise SystemExit("Full name must contain at least 2 characters.")
    if not EMAIL_RE.fullmatch(email): raise SystemExit("Enter a valid email address.")
    if len(password) < 8: raise SystemExit("Password must contain at least 8 characters.")
    if password != confirmation: raise SystemExit("Passwords do not match.")
    async with AsyncSessionLocal() as db:
        async with db.begin():
            await db.execute(text("SELECT pg_advisory_xact_lock(72190411)"))
            count = int((await db.execute(select(func.count(User.id)).where(User.is_superuser.is_(True)))).scalar_one())
            if count:
                print("A Super Admin already exists.")
                return
            if (await db.execute(select(User.id).where(func.lower(User.email) == email))).scalar_one_or_none():
                raise SystemExit("An account with this email already exists.")
            user = User(email=email, hashed_password=get_password_hash(password), full_name=full_name, role="admin", is_superuser=True, is_active=True)
            db.add(user); await db.flush()
            db.add(AuditLog(hospital_profile_id=None, actor_user_id=user.id, action="super_admin.created", entity_type="user", entity_id=user.id))
    print("Super Admin created successfully.")


if __name__ == "__main__":
    asyncio.run(create())
