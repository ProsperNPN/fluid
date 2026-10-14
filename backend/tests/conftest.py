import asyncio
from typing import AsyncGenerator

import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.core.security import get_password_hash
from app.main import create_application
from app.models import Base, User
from app.core.database import get_db


@pytest.fixture(scope="function")
async def db_session():
    # Each test owns an isolated PostgreSQL schema; existing application data is untouched.
    from uuid import uuid4
    from sqlalchemy import text
    schema = "fluid_test_" + uuid4().hex
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.execute(text(f'CREATE SCHEMA "{schema}"'))
    isolated = create_async_engine(settings.DATABASE_URL, echo=False, connect_args={"server_settings": {"search_path": schema}})
    try:
        async with isolated.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        async with AsyncSession(bind=isolated, expire_on_commit=False) as session:
            yield session
    finally:
        await isolated.dispose()
        assert schema.startswith("fluid_test_") and len(schema) == 43
        async with engine.begin() as conn:
            await conn.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        await engine.dispose()


@pytest.fixture
def override_get_db(db_session):
    async def _override_get_db():
        yield db_session

    return _override_get_db


@pytest.fixture
def app(override_get_db):
    app = create_application()
    app.dependency_overrides[get_db] = override_get_db
    return app


@pytest.fixture
async def client(app) -> AsyncGenerator[AsyncClient, None]:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac


@pytest.fixture
async def test_user(db_session: AsyncSession) -> User:
    user = User(
        email="test@example.com",
        hashed_password=get_password_hash("test-password-123"),
        full_name="Test User",
        is_active=True,
        is_superuser=False,
    )
    db_session.add(user)
    await db_session.flush()
    await db_session.refresh(user)
    return user


@pytest.fixture
async def test_superuser(db_session: AsyncSession) -> User:
    user = User(
        email="admin@example.com",
        hashed_password=get_password_hash("admin-password-123"),
        full_name="Admin User",
        is_active=True,
        is_superuser=True,
    )
    db_session.add(user)
    await db_session.flush()
    await db_session.refresh(user)
    return user


@pytest.fixture
async def auth_headers(client: AsyncClient, test_user) -> dict[str, str]:
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": "test@example.com", "password": "test-password-123"},
    )
    tokens = response.json()
    return {"Authorization": f"Bearer {tokens['access_token']}"}


@pytest.fixture
async def admin_headers(client: AsyncClient, test_superuser) -> dict[str, str]:
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": "admin@example.com", "password": "admin-password-123"},
    )
    tokens = response.json()
    return {"Authorization": f"Bearer {tokens['access_token']}"}
