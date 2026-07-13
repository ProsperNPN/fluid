from datetime import UTC, datetime

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import PasswordResetToken


class PasswordResetTokenRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create(self, *, user_id: str, token_hash: str, expires_at: datetime) -> PasswordResetToken:
        token = PasswordResetToken(
            user_id=user_id,
            token_hash=token_hash,
            expires_at=expires_at,
        )
        self.db.add(token)
        await self.db.flush()
        return token

    async def get_active_by_hash(self, token_hash: str) -> PasswordResetToken | None:
        stmt = select(PasswordResetToken).where(
            PasswordResetToken.token_hash == token_hash,
            PasswordResetToken.used_at.is_(None),
            PasswordResetToken.expires_at > datetime.now(UTC),
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def mark_used(self, token_id: str) -> bool:
        stmt = (
            update(PasswordResetToken)
            .where(PasswordResetToken.id == token_id, PasswordResetToken.used_at.is_(None))
            .values(used_at=datetime.now(UTC))
        )
        result = await self.db.execute(stmt)
        return bool(result.rowcount)

    async def invalidate_all_for_user(self, user_id: str) -> int:
        stmt = (
            update(PasswordResetToken)
            .where(PasswordResetToken.user_id == user_id, PasswordResetToken.used_at.is_(None))
            .values(used_at=datetime.now(UTC))
        )
        result = await self.db.execute(stmt)
        return int(result.rowcount or 0)

    async def delete_expired(self, now: datetime | None = None) -> int:
        current_time = now or datetime.now(UTC)
        stmt = delete(PasswordResetToken).where(PasswordResetToken.expires_at < current_time)
        result = await self.db.execute(stmt)
        return int(result.rowcount or 0)
