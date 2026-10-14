import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_read_me_success(client: AsyncClient, auth_headers) -> None:
    response = await client.get("/api/v1/users/me", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["email"] == "test@example.com"
    assert data["full_name"] == "Test User"


@pytest.mark.asyncio
async def test_read_me_unauthorized(client: AsyncClient) -> None:
    response = await client.get("/api/v1/users/me")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_protected_profile_success(client: AsyncClient, auth_headers) -> None:
    response = await client.get("/api/v1/protected/profile", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["email"] == "test@example.com"


@pytest.mark.asyncio
async def test_protected_profile_unauthorized(client: AsyncClient) -> None:
    response = await client.get("/api/v1/protected/profile")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_admin_audit_superuser_success(client: AsyncClient, admin_headers) -> None:
    response = await client.get("/api/v1/protected/admin/audit", headers=admin_headers)
    assert response.status_code == 200
    assert response.json()["message"] == "Admin-only resource access granted"


@pytest.mark.asyncio
async def test_admin_audit_regular_user_forbidden(client: AsyncClient, auth_headers) -> None:
    response = await client.get("/api/v1/protected/admin/audit", headers=auth_headers)
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_admin_audit_unauthorized(client: AsyncClient) -> None:
    response = await client.get("/api/v1/protected/admin/audit")
    assert response.status_code == 401
