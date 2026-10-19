from datetime import datetime, timezone
from typing import Literal
from pydantic import BaseModel, Field, model_validator
from app.schemas.profile import BloodType

Component = Literal["whole_blood", "red_cells", "plasma", "platelets"]
Status = Literal["quarantined", "testing", "available", "reserved", "used", "expired", "discarded"]


class UnitInput(BaseModel):
    model_config = {"str_strip_whitespace": True, "allow_inf_nan": False}
    blood_type: BloodType
    component: Component
    official_identifier: str | None = Field(default=None, min_length=1, max_length=80)
    product_code: str | None = Field(default=None, min_length=1, max_length=40)
    label_standard: Literal["ISBT128", "other"] | None = None
    collected_at: datetime | None = None
    expires_at: datetime | None = None
    storage_location: str = Field(min_length=2, max_length=160)

    @model_validator(mode="after")
    def dates(self):
        import re
        if any(d and d.tzinfo is None for d in (self.collected_at, self.expires_at)):
            raise ValueError("Collection and expiration times must include a time zone")
        if self.collected_at and self.collected_at > datetime.now(timezone.utc): raise ValueError("Collection cannot be in the future")
        if self.expires_at and self.collected_at and self.expires_at <= self.collected_at: raise ValueError("Expiration must follow collection")
        if self.label_standard == "ISBT128":
            if not self.official_identifier or not re.fullmatch(r"[A-Z0-9]{5}\d{8}", self.official_identifier):
                raise ValueError("Enter the normalized 13-character ISBT 128 donation identifier from the official label")
            if not self.product_code or not re.fullmatch(r"[A-Z0-9]{8}", self.product_code):
                raise ValueError("Enter the 8-character product code, including donation type and division, from the official label")
        return self


class UnitEdit(UnitInput):
    expected_version: int = Field(ge=0)
    reason: str = Field(min_length=5, max_length=500)
    clinical_authorization: bool = False


class UnitIntake(UnitInput):
    quantity: int = Field(ge=1, le=100)

    @model_validator(mode="after")
    def unique_labels(self):
        if self.quantity > 1 and (self.official_identifier or self.product_code or self.label_standard):
            raise ValueError("Bulk intake must reconcile each official product label separately")
        return self


class UnitAction(BaseModel):
    model_config = {"allow_inf_nan": False, "str_strip_whitespace": True}
    action: Literal["start_testing", "record_testing", "clinical_release", "reserve", "unreserve", "use", "quarantine", "recall", "discard", "move"]
    expected_version: int = Field(ge=0)
    reason: str = Field(min_length=5, max_length=500)
    clinical_authorization: bool = False
    cold_chain_verified: bool = False
    official_label_verified: bool = False
    compatibility_verified: bool = False
    recall_resolved: bool = False
    testing_status: Literal["passed", "failed"] | None = None
    request_id: str | None = Field(default=None, max_length=36)
    storage_location: str | None = Field(default=None, min_length=2, max_length=160)
    temperature_c: float | None = Field(default=None, ge=-100, le=60)


class ComponentPolicyInput(BaseModel):
    model_config = {"allow_inf_nan": False}
    expected_version: int = Field(default=0, ge=0)
    approved: bool = False
    clinical_authorization: bool = False
    standard_reference: str = Field(default="", max_length=500)
    max_shelf_life_hours: int | None = Field(default=None, ge=1, le=26280)
    temperature_min_c: float | None = Field(default=None, ge=-100, le=60)
    temperature_max_c: float | None = Field(default=None, ge=-100, le=60)
    storage_requirements: str = Field(default="", max_length=1000)
    expiry_warning_hours: int = Field(default=168, ge=1, le=2160)

    @model_validator(mode="after")
    def reviewed(self):
        if self.approved and (not self.clinical_authorization or not self.standard_reference.strip() or not self.storage_requirements.strip()
            or self.max_shelf_life_hours is None or self.temperature_min_c is None or self.temperature_max_c is None):
            raise ValueError("Approval requires authorized clinical review, a standard reference, shelf-life and storage limits")
        if self.temperature_min_c is not None and self.temperature_max_c is not None and self.temperature_min_c > self.temperature_max_c:
            raise ValueError("Minimum temperature cannot exceed maximum")
        return self


class StockPolicyInput(BaseModel):
    blood_type: BloodType
    component: Component
    minimum: int = Field(ge=0, le=10000)
    critical: int = Field(default=0, ge=0, le=10000)

    @model_validator(mode="after")
    def thresholds(self):
        if self.critical > self.minimum: raise ValueError("Critical threshold cannot exceed minimum stock")
        return self


class ScanInput(BaseModel):
    value: str = Field(min_length=1, max_length=200)
