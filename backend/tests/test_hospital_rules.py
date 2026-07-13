from datetime import datetime, timedelta, timezone
import pytest
from pydantic import ValidationError
from app.schemas.blood_request import BloodRequestCreate
from app.schemas.inventory import InventoryAdjust, InventoryCreate


def valid_request(**overrides):
    now = datetime.now(timezone.utc)
    values = dict(blood_type="O+", units=2, location="Accra", required_by=now + timedelta(days=2), expires_at=now + timedelta(days=1))
    values.update(overrides)
    return BloodRequestCreate(**values)


def test_request_dates_must_expire_before_required_time():
    now = datetime.now(timezone.utc)
    with pytest.raises(ValidationError): valid_request(required_by=now + timedelta(hours=2), expires_at=now + timedelta(hours=3))


def test_request_units_must_be_positive():
    with pytest.raises(ValidationError): valid_request(units=0)


def test_inventory_cannot_start_negative():
    with pytest.raises(ValidationError): InventoryCreate(blood_type="A+", units_available=-1, storage_location="Main bank")


def test_inventory_adjustment_requires_positive_units():
    with pytest.raises(ValidationError): InventoryAdjust(action="reserve", units=0)
