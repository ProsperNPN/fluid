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


@pytest.mark.asyncio
async def test_password_recovery_keeps_token_private_and_single_use(client, test_user, monkeypatch):
    import re
    delivered = []
    monkeypatch.setattr("app.api.v1.endpoints.auth.send_email",
                        lambda *args: delivered.append(args) or True)
    login = await client.post("/api/v1/auth/login", json={
        "email": test_user.email, "password": "test-password-123"})
    refresh = login.json()["refresh_token"]
    existing = await client.post("/api/v1/auth/forgot-password", json={"email": test_user.email})
    missing = await client.post("/api/v1/auth/forgot-password", json={"email": "missing@example.com"})
    assert existing.status_code == missing.status_code == 200
    assert existing.json() == missing.json()
    assert existing.json().get("reset_token") is None
    assert len(delivered) == 1 and delivered[0][0] == test_user.email
    token = re.search(r"[?]token=([^\s]+)", delivered[0][2]).group(1)
    assert token not in existing.text
    payload = {"token": token, "new_password": "replacement-password-123"}
    assert (await client.post("/api/v1/auth/reset-password", json=payload)).status_code == 200
    assert (await client.post("/api/v1/auth/reset-password", json=payload)).status_code == 400
    assert (await client.post("/api/v1/auth/login", json={
        "email": test_user.email, "password": "test-password-123"})).status_code == 401
    assert (await client.post("/api/v1/auth/login", json={
        "email": test_user.email, "password": payload["new_password"]})).status_code == 200
    assert (await client.post("/api/v1/auth/refresh", json={"refresh_token": refresh})).status_code == 401


@pytest.mark.asyncio
async def test_password_recovery_delivery_failure_does_not_disclose_account(client, test_user, monkeypatch):
    monkeypatch.setattr("app.api.v1.endpoints.auth.send_email", lambda *args: False)
    response = await client.post("/api/v1/auth/forgot-password", json={"email": test_user.email})
    missing = await client.post("/api/v1/auth/forgot-password", json={"email": "absent@example.com"})
    assert response.status_code == 200 and response.json() == missing.json()


@pytest.mark.asyncio
async def test_concurrent_refresh_token_rotation_has_one_winner(client, app, test_user, db_session):
    import asyncio
    from sqlalchemy.ext.asyncio import AsyncSession
    from httpx import ASGITransport, AsyncClient
    from app.core.database import get_db
    login = await client.post("/api/v1/auth/login", json={
        "email": test_user.email, "password": "test-password-123"})
    token = login.json()["refresh_token"]
    async def independent_db():
        async with AsyncSession(bind=db_session.bind, expire_on_commit=False) as session:
            yield session
    app.dependency_overrides[get_db] = independent_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as independent:
        responses = await asyncio.gather(*[
            independent.post("/api/v1/auth/refresh", json={"refresh_token": token}) for _ in range(2)])
    assert sorted(response.status_code for response in responses) == [200, 401]


@pytest.mark.asyncio
async def test_concurrent_password_reset_has_one_winner(client, app, test_user, db_session, monkeypatch):
    import asyncio
    import re
    from sqlalchemy.ext.asyncio import AsyncSession
    from httpx import ASGITransport, AsyncClient
    from app.core.database import get_db
    delivered = []
    monkeypatch.setattr("app.api.v1.endpoints.auth.send_email",
                        lambda *args: delivered.append(args) or True)
    await client.post("/api/v1/auth/forgot-password", json={"email": test_user.email})
    token = re.search(r"[?]token=([^\s]+)", delivered[0][2]).group(1)
    async def independent_db():
        async with AsyncSession(bind=db_session.bind, expire_on_commit=False) as session:
            yield session
    app.dependency_overrides[get_db] = independent_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as independent:
        responses = await asyncio.gather(*[
            independent.post("/api/v1/auth/reset-password", json={
                "token": token, "new_password": f"replacement-password-{index}"}) for index in range(2)])
        assert sorted(response.status_code for response in responses) == [200, 400]
        winner = next(index for index, response in enumerate(responses) if response.status_code == 200)
        login = await independent.post("/api/v1/auth/login", json={
            "email": test_user.email, "password": f"replacement-password-{winner}"})
        assert login.status_code == 200
