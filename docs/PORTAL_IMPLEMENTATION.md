# Donor and hospital portals

The portals use the existing authenticated Next.js frontend and FastAPI/PostgreSQL backend. The public website, FLUID SVG logo, password reset and hospital approval workflows remain in place.

## Implemented workflows

- Donors: compatible request search, urgency filters, distance sorting, response and saved requests; hospital-coordinated appointments; completed donation records and downloadable confirmations; availability, notification preferences and location; private conversations and profile editing.
- Hospitals: draft/published requests, invitations and response review, laboratory blood-type confirmation, scheduling and clinical screening confirmation, request fulfillment and closure; inventory batches, reservations, consumption, thresholds and transaction history; date-filtered analytics and CSV export; staff and verification/profile management.
- Both portals: responsive collapsible desktop navigation, compact mobile header and bottom navigation, accessible native dialogs, keyboard controls, reduced-motion support, real database totals and periodic refresh while visible.

Hospital operations require an active, approved facility and an operational staff role. Staff administration requires hospital administrator permission. Viewer accounts can access their facility profile but cannot perform operational actions. Donors cannot complete appointments, assert clinical eligibility or access another donor's conversations. Hospital data is scoped to its facility. Request closure cancels open associated appointments and responses.

## Main implementation files

Frontend: `frontend/components/portal/`, `frontend/app/portal.css`, donor and hospital route pages, `frontend/hooks/use-portal-query.ts`, and corresponding services under `frontend/services/`.

Backend: portal endpoints in `backend/app/api/v1/endpoints/` (appointments, donor_matches, blood_requests, inventory, messages, workspace, profiles and staff), `backend/app/services/blood_matching.py`, `request_lifecycle.py`, and migration `20261014_0010_portal_workflows.py`. Integration coverage is in `backend/tests/test_portal_journey.py`.

## Run locally

Use the existing private backend `.env` and frontend `.env.local`; never commit credentials. PostgreSQL must be running. From `backend`:

```powershell
.venv/Scripts/python.exe -m alembic upgrade head
.venv/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

From `frontend`:

```powershell
npm.cmd install
npm.cmd run dev
```

Open http://localhost:3000 and sign in with your actual donor or approved hospital account. Browser verification uses disposable test schemas and does not install demo records in the application database.

## Clinical configuration required before production matching

Matching defaults to disabled: `DONATION_POLICY_APPROVED=False`. A locally responsible clinical team must validate the rules, then configure the environment and restart the backend. Configurable referral defaults are `DONOR_MIN_AGE=18`, `DONOR_MAX_AGE=65`, and `DONATION_INTERVAL_DAYS=112`. These are conservative referral defaults, not an asserted Ghana donation policy. Hospital screening and compatibility testing remain necessary even after enabling referrals.

Red-cell referrals use ABO/Rh compatibility; plasma uses reverse ABO compatibility. Whole-blood and platelet referrals conservatively require identical recorded ABO/Rh. Unknown blood type, absent birth date/location, an active deferral or an unapproved policy excludes automated matching. Existing donor blood types require explicit confirmation as known; reported blood types remain distinct from hospital-verified results.

Clinical reference sources: [WHO donor selection](https://www.who.int/publications/i/item/blood-donor-selection-guidelines-on-assessing-donor-suitability-for-blood-donation), [Canadian Blood Services compatibility tables](https://www.blood.ca/en/hospital-services/inventory-ordering/ordering/compatibility-and-substitutions), and [clinical blood administration](https://professionaleducation.blood.ca/en/transfusion/clinical-guide/blood-administration). Local rules take precedence over these general references.

Inventory expiration warning defaults to `INVENTORY_EXPIRY_WARNING_DAYS=7`. New batches require an expiration date. Legacy stock without a known expiration is excluded from usable totals and cannot be reserved or consumed. Collection/expiration dates, stock movements and threshold changes are tracked; row locks prevent concurrent over-reservation. Manual request receipts do not fabricate donor donation records or inventory batches.

## Verification

Backend: `.venv/Scripts/python.exe -m pytest -q` runs isolated PostgreSQL tests, including the complete registration/approval/request/message/appointment/stock journey, cross-tenant access, expiry, closure and concurrent reservations. Frontend checks: `npx.cmd tsc --noEmit`, `npm.cmd run lint`, and `npm.cmd run build`.

Chrome verification covers donor and hospital routes, navigation, dialogs, widths from 320 to 1440 pixels, reduced motion, and automated WCAG accessibility checks. Predictive analytics is explicitly marked unavailable; charts and exports report actual stored activity. Notifications are database-backed; external email delivery needs the existing SMTP configuration.
