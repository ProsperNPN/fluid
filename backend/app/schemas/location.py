from datetime import datetime
from typing import Literal
from pydantic import BaseModel, Field, ConfigDict


class LocationSelection(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, allow_inf_nan=False)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    city: str = Field(min_length=1, max_length=120)
    region: str | None = Field(default=None, max_length=120)
    country: str = Field(min_length=2, max_length=120)
    address: str = Field(min_length=2, max_length=255)
    source: Literal["gps", "manual", "live"] = "manual"
    accuracy_m: float | None = Field(default=None, ge=0, le=100000)
    confirmed: Literal[True]
    preferred_radius_km: Literal[5, 10, 25, 50, 100] | None = None


class ReverseLookup(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class AddressSearch(BaseModel):
    q: str = Field(min_length=3, max_length=200)


class LocationRead(BaseModel):
    latitude: float | None
    longitude: float | None
    city: str
    region: str | None
    country: str
    address: str | None
    source: str | None
    accuracy_m: float | None
    updated_at: datetime | None
    confirmed_at: datetime | None
    preferred_radius_km: int | None


class GeocodedPlace(BaseModel):
    latitude: float
    longitude: float
    city: str
    region: str | None
    country: str
    address: str
