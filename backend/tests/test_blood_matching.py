from datetime import date, datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from app.core.config import settings

@pytest.fixture(autouse=True)
def approved_policy(monkeypatch):
    monkeypatch.setattr(settings, "DONATION_POLICY_APPROVED", True)

from app.services.blood_matching import can_donate_to, distance_km, is_donor_eligible, match_request


def profile(**overrides):
    values = dict(blood_type="O-", blood_type_known=True, date_of_birth=date(1990, 1, 1), is_available=True, is_eligible=True, last_donation_date=None, latitude=5.6037, longitude=-0.1870, preferred_radius_km=25, city="Accra")
    values.update(overrides)
    return SimpleNamespace(**values)


def request(**overrides):
    values = dict(blood_type="A+", component="red_cells", hospital_verified=True, status="published", urgency="urgent", expires_at=datetime.now(timezone.utc) + timedelta(hours=8), latitude=5.61, longitude=-0.20, location="Accra")
    values.update(overrides)
    return SimpleNamespace(**values)


def test_red_cell_compatibility_rules():
    assert can_donate_to("O-", "AB+")
    assert can_donate_to("A+", "AB+")
    assert not can_donate_to("A+", "O+")
    assert not can_donate_to("AB+", "A+")


def test_recent_donation_blocks_eligibility():
    assert not is_donor_eligible(profile(last_donation_date=date.today() - timedelta(days=20)))
    assert is_donor_eligible(profile(last_donation_date=date.today() - timedelta(days=120)))


def test_matching_respects_distance_and_expiration():
    assert match_request(profile(), request())[0]
    assert not match_request(profile(preferred_radius_km=1), request(latitude=6.0, longitude=-0.2))[0]
    assert not match_request(profile(), request(expires_at=datetime.now(timezone.utc) - timedelta(minutes=1)))[0]


def test_distance_is_stable_and_symmetric():
    first = distance_km(5.6037, -0.1870, 5.61, -0.20)
    second = distance_km(5.61, -0.20, 5.6037, -0.1870)
    assert first == second
    assert first is not None and first > 0


def test_components_have_distinct_rules():
    assert not can_donate_to("O-", "A+", "plasma")
    assert can_donate_to("AB+", "O-", "plasma")
    assert not can_donate_to("O-", "A+", "whole_blood")
    assert not can_donate_to("O-", "A+", "platelets")
    assert not can_donate_to("O-", "O-", "unrecognized")

def test_unapproved_policy_and_unknown_blood_type_do_not_match(monkeypatch):
    assert not is_donor_eligible(profile(blood_type_known=False))
    assert not is_donor_eligible(profile(date_of_birth=None))
    monkeypatch.setattr(settings, "DONATION_POLICY_APPROVED", False)
    assert not match_request(profile(), request())[0]

def test_unknown_coordinates_do_not_invent_nearby_matches():
    assert not match_request(profile(latitude=None), request())[0]
    assert not match_request(profile(), request(hospital_verified=False))[0]
