# Intelligent donor referral matching

## What is implemented

Publishing a request evaluates real, active donor profiles and records a `matching.evaluated` audit event. Matching-request notifications are sent to at most the nearest ranked 100 candidates in the initial 10 km search, respecting existing urgent-alert preferences. This identifies potential donors; it does not automatically invite or medically approve anyone. Hospital invitations remain an explicit staff action.

The Hospital → Donor Matches page provides a request selector, ranked candidates, blood-group/status/radius filters, permitted donor details, screening flags, invitation actions, response review and pagination. Initial radius is 10 km; expansion choices are 25, 50 and 100 km. The engine suggests the next radius that adds new candidates when fewer than five uncontacted candidates are present. Five is an operational outreach target, not a prediction of units collected. Each donor's own preferred radius still limits every expansion.

Donor → Blood Requests includes a paginated hospital invitation feed with request urgency, deadline, hospital/collection-site map link, accept/decline actions and response history. Acceptance expresses interest (`pending`); hospital review creates a **pending** appointment. Clinical screening and laboratory confirmation remain mandatory. Dashboard data refreshes while visible, normally within 15 seconds; reopening or refreshing a page reads current database state.

## Consent and clinical safeguards

Migration `20261017_0012` adds `donor_profiles.matching_opt_in`, default **false for existing and new profiles**, and an invitation-origin timestamp. No account is silently enrolled. Donors must enable **Allow location-based matching and hospital invitations** in Availability or Profile, save the form, and separately mark themselves available. Their saved GPS or manually confirmed coordinates are used for distance calculation. Hospitals never receive precise donor coordinates or phone numbers from candidate APIs.

Known incompatible blood groups, unavailable/opted-out/inactive donors, missing coordinates, known age exclusions, existing deferrals and insufficient time since a known donation are excluded. Unknown age or donation history is flagged for clinical screening, never labelled cleared. Unknown blood groups cannot be matched. Candidate details show approximate area/distance and general screening checks; sensitive dates are not exposed before a donor response.

Existing component rules are reused: ABO/Rh red-cell compatibility, reverse ABO plasma compatibility, and conservative identical ABO/Rh referrals for whole blood and platelets. These rules are informed by [Canadian Blood Services compatibility guidance](https://www.blood.ca/en/hospital-services/inventory-ordering/ordering/compatibility-and-substitutions) and [WHO donor selection guidance](https://www.who.int/publications/i/item/9789241548519). These sources are not a substitute for local clinical review. The system does not select or release a transfusion product.

`DONATION_POLICY_APPROVED` remains **false by default**. A responsible local clinical team must review the referral rules, age limits, interval and component handling before enabling it. This implementation does not approve a Ghana policy or change production configuration. Referral settings remain `DONOR_MIN_AGE`, `DONOR_MAX_AGE` and `DONATION_INTERVAL_DAYS`; the current conservative default interval is 112 days. Even a hospital-confirmed blood group is not medical clearance.

The deterministic score ranks outreach only: proximity contributes up to 70 points, recorded hospital blood-group confirmation adds 10, an identical group adds 5, and urgent/critical or ≤24-hour deadlines add 10. It is not a probability or clinical risk score. Every candidate gets an explanation and a screening-required label. Distances are straight-line kilometres from the request's collection-site coordinates, which default to facility coordinates during request creation; they are not travel-time estimates.

## APIs and consistency

- `GET /api/v1/donor-matches/potential?request_id=…&radius_km=10&status=all&blood_type=A%2B&page=1` recomputes candidates using PostgreSQL distance filtering and current profiles. It returns totals, ranked details, expansion counts and policy/status notices. Query filters do not bypass consent or radius limits.
- `POST /api/v1/donor-matches/{request_id}/invite/{donor_id}?radius_km=25` revalidates the live match and explicitly selected radius, then records one invitation, notification and audit event.
- `GET /api/v1/donor-matches/invitations` returns the authenticated donor's own invitations, including stale/closed history. Hospital/collection-site coordinates are public facility data; donor coordinates are never returned here.
- Existing donor response and hospital decision endpoints are reused. Current verification, consent, compatibility, deadlines and active donor status are checked again before acceptance. A donor may decline a stale invitation after changing availability or opting out.

The existing donor/request unique constraint and request/profile/response row locks prevent concurrent duplicate invitations, responses and hospital acceptances. Rejected/declined/expired/cancelled responses cannot silently be resubmitted. Request expiry, including the required-by deadline, expires unanswered invitations and pending interest; closure cancels coordinated activity using the existing workflow. Historical completed donations are preserved. A response is never automatically marked completed.

Radius permissions use unrounded distances internally. Only approximate distances are serialized to hospitals; an internal precise-distance field used for expansion/filtering is stripped from every candidate response. This prevents display rounding from admitting someone just outside a donor-selected or hospital-selected radius.

Candidates are derived on demand, not stored in a stale cache. Publishing triggers an initial evaluation; donor location, availability, blood-group, screening or consent changes affect the next query. Notifications already sent are history, not permission to accept a newly invalid match. Reopening a completed/declined interaction requires a new appropriate request rather than duplicate outreach.

## Run and verify

From `backend`, apply `.venv/Scripts/python.exe -m alembic upgrade head`, then run the existing API. Run the frontend normally. Use your own verified hospital account and consenting donor accounts with real coordinates; no demo users or matching fixtures are inserted into the application database.

Tests include the full request → candidate → invite → accept/decline → hospital review journey, unknown screening flags, incompatible types, missing coordinates, preferred-radius limits, expansion, urgency/deadlines, opt-out, unverified/cross-tenant access, policy gating, recalculation and concurrent duplicates. Chrome testing uses a disposable PostgreSQL schema; it exercises real APIs, UI controls and authentication, not fake API responses.

Verification results: **56 backend tests passed**, including concurrent hospital acceptance and exact-radius boundary checks. TypeScript, ESLint without warnings and the production build passed. Chrome completed the real invitation/response/review flow; server-backed filters, 320–1440 px layouts and automated WCAG checks passed on the settled matching interface. Temporary test schemas and screenshots were removed. The existing local hospital approval remained verified.

Main files: `backend/app/services/intelligent_matching.py`, `blood_matching.py`, donor-match/request/profile endpoints and schemas, migration `20261017_0012`, `backend/tests/test_intelligent_matching.py`, hospital donor page, donor request/overview pages and their existing services.
