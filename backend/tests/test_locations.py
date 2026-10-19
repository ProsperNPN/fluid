from datetime import datetime, timezone, timedelta
import pytest
from sqlalchemy import select
from app.core.config import settings
from app.models import HospitalProfile
from app.schemas.location import LocationSelection
from app.services.geocoding import parse_photon
from tests.test_portal_journey import register, approved_hospital

ACCRA = {"latitude": 5.6037, "longitude": -0.187, "address": "Test clinic, Accra", "city": "Accra", "region": "Greater Accra", "country": "Ghana", "confirmed": True, "source": "manual"}


@pytest.mark.asyncio
async def test_location_matching_privacy_and_refresh(client, db_session, monkeypatch):
    monkeypatch.setattr(settings, "DONATION_POLICY_APPROVED", True)
    _, hospital, hp = await approved_hospital(client, db_session)
    _, donor = await register(client, "location-donor@journey.test", "donor")
    assert (await client.patch("/api/v1/locations/me", headers=hospital, json=ACCRA)).status_code == 200
    profile = {"full_name": "Location Donor", "blood_type": "A+", "blood_type_known": True, "date_of_birth": "1990-01-01", "city": "Accra", "is_available": True, "matching_opt_in": True}
    assert (await client.put("/api/v1/profiles/donor/me", headers=donor, json=profile)).status_code == 200
    saved = await client.patch("/api/v1/locations/me", headers=donor, json={**ACCRA, "preferred_radius_km": 5, "source": "gps", "accuracy_m": 15})
    assert saved.status_code == 200, saved.text
    assert saved.json()["confirmed_at"] and saved.json()["updated_at"]
    assert saved.headers["cache-control"] == "no-store"
    assert "geolocation=(self)" in saved.headers["permissions-policy"]
    request = await client.post("/api/v1/blood-requests", headers=hospital, json={"blood_type": "A+", "component": "red_cells", "units": 2, "urgency": "urgent", "status": "published", "location": "Accra", "required_by": (datetime.now(timezone.utc)+timedelta(days=2)).isoformat(), "expires_at": (datetime.now(timezone.utc)+timedelta(days=1)).isoformat()})
    assert request.status_code == 201, request.text
    nearby = (await client.get("/api/v1/locations/nearby", headers=donor)).json()
    assert nearby["hospitals"][0]["id"] == hp.id
    assert nearby["requests"][0]["id"] == request.json()["id"]
    assert nearby["requests"][0]["distance_km"] == 0
    assert not (await client.get("/api/v1/locations/nearby?urgency=critical", headers=donor)).json()["requests"]
    # Hospitals get only their own location; never donor coordinates.
    assert (await client.get("/api/v1/locations/nearby", headers=hospital)).status_code == 403
    own = (await client.get("/api/v1/locations/me", headers=hospital)).json()
    assert own["latitude"] == ACCRA["latitude"]
    assert (await client.get("/api/v1/locations/me")).status_code == 401
    assert (await client.patch("/api/v1/locations/radius?radius_km=10", headers=donor)).status_code == 200
    assert (await client.patch("/api/v1/locations/radius?radius_km=500", headers=donor)).status_code == 422
    assert (await client.patch("/api/v1/locations/radius?radius_km=5", headers=hospital)).status_code == 403
    # Explicitly refreshing a donor location immediately changes matching.
    assert (await client.patch("/api/v1/locations/me", headers=donor, json={**ACCRA, "latitude": 6.5244, "longitude": 3.3792, "city": "Lagos", "country": "Nigeria"})).status_code == 200
    distant = (await client.get("/api/v1/locations/nearby", headers=donor)).json()
    assert not distant["requests"] and not distant["hospitals"]
    # Legacy profile updates invalidate confirmation rather than silently moving a confirmed pin.
    updated = await client.patch("/api/v1/profiles/donor/me/location", headers=donor, json={"city": "Accra", "latitude": 5.6, "longitude": -0.2})
    assert updated.status_code == 200
    assert (await client.get("/api/v1/locations/me", headers=donor)).json()["confirmed_at"] is None


@pytest.mark.asyncio
async def test_unverified_location_is_prepared_not_approved(client, db_session):
    uid, hospital = await register(client, "unverified-location@journey.test", "hospital")
    result = await client.patch("/api/v1/locations/me", headers=hospital, json=ACCRA)
    assert result.status_code == 200 and result.json()["confirmed_at"] is None
    profile = (await db_session.execute(select(HospitalProfile).where(HospitalProfile.user_id == uid))).scalar_one()
    assert profile.verification_status == "incomplete"
    assert (await client.get("/api/v1/inventory", headers=hospital)).status_code == 403
    assert (await client.patch("/api/v1/locations/me", headers=hospital, json={**ACCRA, "source": "live"})).status_code == 422
    assert (await client.patch("/api/v1/locations/me", headers=hospital, json={**ACCRA, "latitude": 91})).status_code == 422
    assert (await client.patch("/api/v1/locations/me", headers=hospital, json={**ACCRA, "confirmed": False})).status_code == 422


@pytest.mark.asyncio
async def test_registration_saves_location_without_verification(client):
    response = await client.post("/api/v1/auth/register", json={"email": "located-registration@journey.test", "password": "Testing-secure-123!", "full_name": "Registration Hospital", "role": "hospital", "location": ACCRA})
    assert response.status_code == 201
    login = await client.post("/api/v1/auth/login", json={"email": "located-registration@journey.test", "password": "Testing-secure-123!"})
    headers = {"Authorization": "Bearer " + login.json()["access_token"]}
    result = (await client.get("/api/v1/locations/me", headers=headers)).json()
    assert result["latitude"] == ACCRA["latitude"] and result["confirmed_at"] is None


def test_photon_international_result_and_non_finite_validation():
    places = parse_photon({"features": [{"geometry": {"coordinates": [2.3522, 48.8566]}, "properties": {"name": "Paris", "city": "Paris", "state": "Île-de-France", "country": "France"}}]})
    assert places[0].city == "Paris" and places[0].latitude == 48.8566
    assert not parse_photon({"features": [{"geometry": {"coordinates": [0, 0]}, "properties": {}}]})
    with pytest.raises(ValueError):
        LocationSelection(**{**ACCRA, "longitude": float("nan")})


def test_distance_crosses_date_line_and_uses_shortest_arc():
    from app.services.blood_matching import distance_km
    assert distance_km(0, 0, 0, 1) == pytest.approx(111.2, abs=0.1)
    assert distance_km(0, 179.9, 0, -179.9) == pytest.approx(22.2, abs=0.1)
    assert distance_km(90, 0, 90, 100) == 0
    assert distance_km(None, 0, 0, 0) is None


@pytest.mark.asyncio
async def test_confirmed_facility_relocation_requires_review(client, db_session):
    _, hospital, _ = await approved_hospital(client, db_session)
    assert (await client.patch("/api/v1/locations/me", headers=hospital, json=ACCRA)).json()["confirmed_at"]
    response = await client.patch("/api/v1/locations/me", headers=hospital, json={**ACCRA, "latitude": 6.6885, "longitude": -1.6244, "city": "Kumasi"})
    assert response.status_code == 200 and response.json()["confirmed_at"] is None
    assert (await client.get("/api/v1/profiles/hospital/me", headers=hospital)).json()["verification_status"] == "more_information_required"
    assert (await client.get("/api/v1/inventory", headers=hospital)).status_code == 403


@pytest.mark.asyncio
async def test_geocoding_adapter_and_failure(client, monkeypatch):
    from app.api.v1.endpoints import locations
    from fastapi import HTTPException
    async def successful(path, params):
        assert path == "/api/" and params["q"] == "Accra"
        return [{k: v for k, v in ACCRA.items() if k not in {"source", "confirmed"}}]
    monkeypatch.setattr(locations, "geocode", successful)
    response = await client.post("/api/v1/locations/search", json={"q": "Accra"})
    assert response.status_code == 200 and response.json()[0]["country"] == "Ghana"
    async def unavailable(path, params):
        raise HTTPException(503, "Address lookup unavailable")
    monkeypatch.setattr(locations, "geocode", unavailable)
    assert (await client.post("/api/v1/locations/reverse", json={"latitude": 5.6, "longitude": -0.2})).status_code == 503
    assert (await client.post("/api/v1/locations/reverse", json={"latitude": 91, "longitude": 0})).status_code == 422
