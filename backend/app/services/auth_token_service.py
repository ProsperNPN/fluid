from __future__ import annotations

from datetime import UTC, datetime
from hashlib import sha256
from hmac import compare_digest

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, create_refresh_token
from app.repositories import RefreshTokenRepository
from app.schemas import TokenPair, TokenPayload


class AuthTokenService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.refresh_tokens = RefreshTokenRepository(db)

    @staticmethod
    def hash_token(token: str) -> str:
        return sha256(token.encode("utf-8")).hexdigest()

    async def issue_token_pair(self, subject: str) -> TokenPair:
        access_token, access_expires_at = create_access_token(subject)
        refresh_token, refresh_expires_at, jti = create_refresh_token(subject)

        await self.refresh_tokens.create(
            user_id=subject,
            jti=jti,
            token_hash=self.hash_token(refresh_token),
            expires_at=refresh_expires_at,
        )

        return TokenPair(
            access_token=access_token,
            refresh_token=refresh_token,
            access_token_expires_at=access_expires_at,
            refresh_token_expires_at=refresh_expires_at,
        )

    async def is_refresh_token_active(self, payload: TokenPayload, raw_token: str) -> bool:
        stored = await self.refresh_tokens.get_by_jti(payload.jti or "")
        if not stored:
            return False
        if stored.revoked_at is not None:
            return False
        if stored.expires_at <= datetime.now(UTC):
            return False
        return compare_digest(stored.token_hash, self.hash_token(raw_token))

    async def revoke_refresh_token(self, jti: str) -> bool:
        return await self.refresh_tokens.revoke_by_jti(jti)
