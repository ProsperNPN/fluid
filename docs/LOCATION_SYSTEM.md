# Location and nearby-care system

## Use

- Donors: Profile → donation location, or **Location & Nearby** in the sidebar (`/donor/location`). Confirm a location, choose a 5/10/25/50/100 km radius, and switch between nearby maps and lists. Hospital markers represent active verified facilities with confirmed coordinates. Compatible request markers also require the existing clinical policy, known blood type, availability, eligibility, component compatibility and non-expired request rules.
- Hospitals: Registration optionally captures a location. After approval, an administrator confirms the fixed facility location in Hospital Profile or **Facility Location** (`/hospital/location`). Unverified facilities may prepare an address but do not receive confirmed status or operational permission. A confirmed city/country change or a coordinate relocation over 1 km requires verification review. Existing profile identity-change verification rules remain in effect.
- GPS only runs after a button click. It requires HTTPS or localhost. Permission refusal, timeouts and unavailable providers leave manual address/coordinate entry usable. GPS coordinates remain available if reverse geocoding fails. Search results and map clicks update a draft; **Confirm & Save Location** persists the selection.
- Donor Live Location is off by default and opt-in for the current location page only. It stops immediately when disabled, hidden, navigated away from, logged out or closed, and must be explicitly enabled again. Accepted updates are limited to once per minute; inaccurate fixes over 1000 m are ignored. The last update timestamp and reported accuracy are shown. Only the latest location is stored, not a travel history. During provider outages, a live fix may keep the last confirmed address; the UI explicitly says so.

## Backend and database

Migration `20261016_0011` adds nullable location update/confirmation timestamps, source and accuracy to donor/hospital profiles, plus database coordinate bounds. No coordinates are fabricated for existing profiles. Apply from `backend`:

```powershell
.venv/Scripts/python.exe -m alembic upgrade head
```

`/api/v1/locations/me` supports authenticated GET/PATCH of the caller's own location. Hospital writes require an active hospital administrator membership. `/locations/radius` stores the donor's radius; `/locations/nearby` returns facilities and compatible requests using PostgreSQL spherical distance filtering and the existing component-specific matching service. Distances are straight-line kilometres, not driving routes or travel times. Very large result sets are bounded and explicitly marked `has_more`; narrowing radius/urgency refines them.

Location APIs never accept a target donor ID or return another donor's coordinates. Authorized hospital matching continues to show approximate city and calculated distance. No donor markers or exact donor positions appear in hospital APIs. Responses use `Cache-Control: no-store`. Address lookup uses POST bodies so addresses and GPS coordinates do not enter ordinary access-log query strings; application code does not log these values. Hospital confirmations are audited without exact coordinate payloads. General profile edits invalidate a previously confirmed pin if location fields change.

The application uses the existing PostgreSQL authentication/access model. In deployment, use encrypted database volumes/backups, TLS for browser/API traffic, and existing restricted database credentials. Do not enable body logging for location endpoints. No public donor location endpoint or background worker was added.

## Providers

The real geocoder is Photon. Configure a Photon-compatible hosted or self-hosted provider in the backend environment:

```dotenv
GEOCODING_ENABLED=true
GEOCODING_BASE_URL=https://photon.komoot.io
GEOCODING_USER_AGENT=FLUID/0.1 location lookup
GEOCODING_MIN_INTERVAL_SECONDS=1.0
```

The adapter normalizes worldwide city/town/village, region and country results. Lookups are debounced in the browser, bounded to five results, limited to 30 requests per minute per source IP, serialized with a provider interval, timed out, and cached briefly in bounded process memory. Public search/reverse routes support pre-authentication hospital registration; they expose provider address data, never application profile data. For multiple API workers or a reverse proxy, configure a shared edge rate limiter with correct trusted-client-IP handling and a production provider capacity agreement. The public demo geocoder and public OSM tiles provide no application-specific availability guarantee.

Leaflet is bundled locally with TypeScript definitions. Default tiles are `https://tile.openstreetmap.org/{z}/{x}/{y}.png`. Override `NEXT_PUBLIC_MAP_TILE_URL` and `NEXT_PUBLIC_MAP_ATTRIBUTION` at frontend build time to use another licensed tile provider. Map attribution remains visible; tiles are not bulk-downloaded, prefetched for offline use or proxied. Address lookups and map views disclose a location/area to those external providers; the selector explains this before confirmation. Manual coordinate entry remains possible if the provider fails.

References: [Photon API](https://github.com/komoot/photon/blob/master/docs/api-v1.md), [Leaflet documentation](https://leafletjs.com/reference.html), [OpenStreetMap tile policy](https://operations.osmfoundation.org/policies/tiles/).

## Validation

The full backend suite covers saved locations, role/verification restrictions, registration persistence, international parsing, geographic filtering after movement, urgency, non-finite coordinates, radius choices, provider failures, anti-meridian distances and facility relocation review. Existing authentication and portal tests remain included.

Final checks passed: **50 backend tests**, TypeScript, ESLint without warnings, and the Next.js production build (39 routes). Chrome checks passed for actual permission denial, GPS success with an emulated sensor position, real address autocomplete/reverse lookup, manual PostgreSQL persistence, radius/map/list results, live disable/hidden-tab shutdown, provider outage and timeout recovery, hospital settings/registration, responsive widths from 320–1440 px, and automated WCAG checks with no violations on the location workspace. Disposable QA schemas and temporary HTTPS certificates were removed; existing user records and hospital approvals were preserved.

Chrome checks use disposable PostgreSQL schemas and real Photon/OSM integrations. GPS hardware positions are supplied by Chrome's test geolocation facility; permission handling is real browser permission handling. Outage and timeout responses are injected only by test scripts. The application contains no mocked providers or fabricated hospital data. TypeScript, lint and production build are required checks.

Localhost and a temporary local HTTPS preview were exercised with real reverse geocoding. The HTTPS test used a temporary self-signed test certificate accepted only in Chrome's test context; it did not install a trust certificate or publish a deployment. Deployed GPS requires a valid HTTPS certificate, an HTTPS API URL, correctly configured CORS and outbound HTTPS access to the geocoder. Next.js and FastAPI explicitly allow same-origin geolocation in `Permissions-Policy`; camera/microphone restrictions in the API remain intact. Confirm on an actual phone outdoors because device GPS accuracy varies. No external deployment is created by this task.

Clinical matching remains fail-closed until `DONATION_POLICY_APPROVED` is explicitly enabled after local clinical validation; location implementation does not alter that requirement or any existing hospital approval.
