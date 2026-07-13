from datetime import date, datetime, timedelta, timezone
from types import SimpleNamespace

from app.services.blood_matching import can_donate_to, distance_km, is_donor_eligible, match_request


def profile(**overrides):
    values = dict(blood_type="O-", is_available=True, is_eligible=True, last_donation_date=None, latitude=5.6037, longitude=-0.1870, preferred_radius_km=25, city="Accra")
    values.update(overrides)
    return SimpleNamespace(**values)


def request(**overrides):
    values = dict(blood_type="A+", status="published", urgency="urgent", expires_at=datetime.now(timezone.utc) + timedelta(hours=8), latitude=5.61, longitude=-0.20, location="Accra")
    values.update(overrides)
    return SimpleNamespace(**values)


def test_red_cell_compatibility_rules():
    assert can_donate_to("O-", "AB+")
    assert can_donate_to("A+", "AB+")
    assert not can_donate_to("A+", "O+")
    assert not can_donate_to("AB+", "A+")


def test_recent_donation_blocks_eligibility():
    assert not is_donor_eligible(profile(last_donation_date=date.today() - timedelta(days=20)))
    assert is_donor_eligible(profile(last_donation_date=date.today() - timedelta(days=60)))


def test_matching_respects_distance_and_expiration():
    assert match_request(profile(), request())[0]
    assert not match_request(profile(preferred_radius_km=1), request(latitude=6.0, longitude=-0.2))[0]
    assert not match_request(profile(), request(expires_at=datetime.now(timezone.utc) - timedelta(minutes=1)))[0]


def test_distance_is_stable_and_symmetric():
    first = distance_km(5.6037, -0.1870, 5.61, -0.20)
    second = distance_km(5.61, -0.20, 5.6037, -0.1870)
    assert first == second
    assert first is not None and first > 0
