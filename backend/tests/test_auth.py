import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_register_success(client: AsyncClient) -> None:
    response = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "newuser@example.com",
            "password": "secure-password-123",
            "full_name": "New User",
        },
    )
    assert response.status_code == 201
    data = response.json()
    assert data["email"] == "newuser@example.com"
    assert data["full_name"] == "New User"
    assert "id" in data


@pytest.mark.asyncio
async def test_register_duplicate_email(client: AsyncClient) -> None:
    await client.post(
        "/api/v1/auth/register",
        json={
            "email": "duplicate@example.com",
            "password": "password-123",
        },
    )
    response = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "duplicate@example.com",
            "password": "password-456",
        },
    )
    assert response.status_code == 409


@pytest.mark.asyncio
async def test_register_short_password(client: AsyncClient) -> None:
    response = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "user@example.com",
            "password": "short",
        },
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_register_password_too_long(client: AsyncClient) -> None:
    too_long_password = "a" * 73
    response = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "toolong@example.com",
            "password": too_long_password,
        },
    )
    assert response.status_code == 422
    detail = response.json().get("detail", [])
    assert isinstance(detail, list)
    assert any("Password must be 72 characters or fewer." in (item.get("msg") or "") for item in detail)


@pytest.mark.asyncio
async def test_register_missing_password(client: AsyncClient) -> None:
    response = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "missingpass@example.com",
        },
    )
    assert response.status_code == 422
    detail = response.json().get("detail", [])
    assert isinstance(detail, list)
    assert any((item.get("loc") or [None])[-1] == "password" for item in detail)


@pytest.mark.asyncio
async def test_login_success(client: AsyncClient, test_user) -> None:
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": "test@example.com", "password": "test-password-123"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["token_type"] == "bearer"


@pytest.mark.asyncio
async def test_login_invalid_credentials(client: AsyncClient, test_user) -> None:
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": "test@example.com", "password": "wrong-password"},
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_login_inactive_user(client: AsyncClient, db_session) -> None:
    from app.models import User
    from app.core.security import get_password_hash

    user = User(
        email="inactive@example.com",
        hashed_password=get_password_hash("password-123"),
        is_active=False,
    )
    db_session.add(user)
    await db_session.flush()

    response = await client.post(
        "/api/v1/auth/login",
        json={"email": "inactive@example.com", "password": "password-123"},
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_refresh_token_success(client: AsyncClient, test_user) -> None:
    login_response = await client.post(
        "/api/v1/auth/login",
        json={"email": "test@example.com", "password": "test-password-123"},
    )
    refresh_token = login_response.json()["refresh_token"]

    response = await client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": refresh_token},
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in data


@pytest.mark.asyncio
async def test_refresh_token_invalid(client: AsyncClient) -> None:
    response = await client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": "invalid-token"},
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_logout_success(client: AsyncClient, test_user, auth_headers) -> None:
    login_response = await client.post(
        "/api/v1/auth/login",
        json={"email": "test@example.com", "password": "test-password-123"},
    )
    refresh_token = login_response.json()["refresh_token"]

    response = await client.post(
        "/api/v1/auth/logout",
        json={"refresh_token": refresh_token},
        headers=auth_headers,
    )
    assert response.status_code == 200
    assert response.json()["message"] == "Logged out successfully"
