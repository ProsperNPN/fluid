"""Bounded Photon adapter. No user-supplied URLs or coordinate logging."""
import asyncio
import ssl
from collections import OrderedDict
from time import monotonic
import httpx
from fastapi import HTTPException
from app.core.config import settings
from app.schemas.location import GeocodedPlace

_lock = asyncio.Lock()
_last_call = 0.0
_cache: OrderedDict[tuple, tuple[float, list[GeocodedPlace]]] = OrderedDict()


def parse_photon(data: dict) -> list[GeocodedPlace]:
    places = []
    for feature in data.get("features", [])[:5]:
        p = feature.get("properties", {})
        coordinates = feature.get("geometry", {}).get("coordinates", [])
        if len(coordinates) < 2 or not p.get("country"):
            continue
        city = p.get("city") or p.get("town") or p.get("village") or p.get("district") or p.get("name") or p.get("county") or ""
        region = p.get("state") or p.get("county")
        street = " ".join(str(v) for v in [p.get("housenumber"), p.get("street")] if v)
        parts = list(dict.fromkeys(str(v) for v in [p.get("name"), street, city, region, p.get("country")] if v))
        try:
            place = GeocodedPlace(latitude=coordinates[1], longitude=coordinates[0], city=str(city)[:120], region=str(region)[:120] if region else None, country=p["country"][:120], address=", ".join(parts)[:255])
            if -90 <= place.latitude <= 90 and -180 <= place.longitude <= 180:
                places.append(place)
        except (ValueError, TypeError):
            continue
    return places


async def geocode(path: str, params: dict) -> list[GeocodedPlace]:
    global _last_call
    if not settings.GEOCODING_ENABLED:
        raise HTTPException(503, "Address lookup is disabled. Enter an address and coordinates manually.")
    key = (path, tuple(sorted(params.items())))
    cached = _cache.get(key)
    if cached and cached[0] > monotonic():
        return cached[1]
    # A short process-wide timeout prevents request queues during provider failures.
    try:
        async with asyncio.timeout(12):
            async with _lock:
                await asyncio.sleep(max(0, settings.GEOCODING_MIN_INTERVAL_SECONDS - (monotonic() - _last_call)))
                _last_call = monotonic()
                async with httpx.AsyncClient(timeout=6, follow_redirects=False, verify=ssl.create_default_context()) as client:
                    response = await client.get(settings.GEOCODING_BASE_URL.rstrip("/") + path, params=params, headers={"User-Agent": settings.GEOCODING_USER_AGENT, "Accept": "application/json"})
                    response.raise_for_status()
                    if len(response.content) > 1000000:
                        raise ValueError("Oversized geocoder response")
                    places = parse_photon(response.json())
                _cache[key] = (monotonic() + 60, places)
                while len(_cache) > 128:
                    _cache.popitem(last=False)
                return places
    except (TimeoutError, httpx.HTTPError, ValueError, TypeError, KeyError):
        raise HTTPException(503, "Address lookup is temporarily unavailable. Manual address and coordinate entry still works.") from None
