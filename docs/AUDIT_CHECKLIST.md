# FLUID system audit — implementation checklist

Audit date: 2026-10-24 · Audited commit: `2408123` (`main`) · Scope: backend (FastAPI, async SQLAlchemy, PostgreSQL), frontend (Next.js 14, Tailwind), build/deploy/CI.

This is the single tracking file for the audit. Every item is a checkbox. When you implement a fix, tick the box in the same pull request, and keep the **Done when** line as the acceptance test.

## Contents

- [How to use this checklist](#how-to-use-this-checklist)
- [Summary](#summary)
- [Already solid: keep these](#already-solid-keep-these)
- [Phase 1 — System findings](#phase-1--system-findings)
  - [Part A — Backend and platform](#part-a--backend-and-platform)
    - [A1. Race conditions, atomicity and transactions](#a1-race-conditions-atomicity-and-transactions)
    - [A2. Authentication and authorization](#a2-authentication-and-authorization)
    - [A3. Caching and Redis](#a3-caching-and-redis)
    - [A4. Throughput, latency and code efficiency](#a4-throughput-latency-and-code-efficiency)
    - [A5. Code and file organization](#a5-code-and-file-organization)
    - [A6. Build, deployment and CI](#a6-build-deployment-and-ci)
  - [Part B — User interface](#part-b--user-interface)
    - [B0. Design principles we follow](#b0-design-principles-we-follow)
    - [B1. Typography](#b1-typography)
    - [B2. Spacing and layout](#b2-spacing-and-layout)
    - [B3. Colour and contrast](#b3-colour-and-contrast)
    - [B4. Repetition and component reuse](#b4-repetition-and-component-reuse)
    - [B5. Alignment, proximity and visual hierarchy](#b5-alignment-proximity-and-visual-hierarchy)
    - [B6. Responsive behaviour and accessibility](#b6-responsive-behaviour-and-accessibility)
    - [B7. Copy and microcopy](#b7-copy-and-microcopy)
    - [B8. Frontend code health that affects UX and latency](#b8-frontend-code-health-that-affects-ux-and-latency)
- [Phase 2 — Features failing or not well implemented](#phase-2--features-failing-or-not-well-implemented)
- [Phase 3 — Verification gates](#phase-3--verification-gates)
- [Appendix — Method and evidence](#appendix--method-and-evidence)

## How to use this checklist

Item format:

```
- [ ] **ID · Severity · Title** · verification badge
  - Evidence: file:line references and what the code does
  - Fix: the recommended change
  - Done when: the acceptance test
```

Severity:

| Level | Meaning |
| --- | --- |
| **Critical** | Data loss, tenant takeover, or broken deployment. Fix before any release. |
| **High** | Wrong results under realistic load or concurrency, or a security gap that is reachable today. |
| **Medium** | Degrades latency, throughput, maintainability or UX noticeably. |
| **Low** | Hygiene, consistency, or a defensive improvement. |

Verification badge:

| Badge | Meaning |
| --- | --- |
| 🧪 **Reproduced** | Executed against PostgreSQL 16 during this audit. The observed output is quoted in the item. |
| 🔍 **Code-verified** | Read at the cited lines on commit `2408123`. The behaviour follows directly from the code. |
| 📏 **Measured** | A count or metric computed from the source tree. The command or method is given. |

Phase 2 groups the same findings by feature, so you can work feature by feature. Its items reference Phase 1 IDs instead of repeating them. Tick an item in **one** place: its Phase 1 entry, or its Phase 2 entry if it appears only there.

## Summary

| Area | Critical | High | Medium | Low |
| --- | --- | --- | --- | --- |
| A1 Concurrency / atomicity | 1 | 4 | 4 | 1 |
| A2 Authentication / authorization | 1 | 1 | 4 | 4 |
| A3 Caching | – | – | 3 | 1 |
| A4 Efficiency / throughput | 1 | 6 | 6 | 2 |
| A5 Code organization | – | – | 5 | 3 |
| A6 Build / deploy / CI | – | 3 | 3 | 2 |
| B User interface | – | 9 | 17 | 7 |
| Phase 2 feature gaps | – | 2 | 7 | 2 |

What changes the most:

1. **The concurrency design for clinical flows is mostly sound.** Appointments, inventory, refresh rotation and password reset already use row locks, unique constraints and conditional updates (see [Already solid](#already-solid-keep-these)). The real races are in the **administrative** flows: staff management, verification submission and decisions, and registration. Four of them were reproduced.
2. **Read endpoints write to the database.** Ten GET paths call `expire_requests()`, which locks rows, updates them and commits. Several more GETs take `SELECT … FOR UPDATE` locks. This hurts throughput far more than any single slow query.
3. **Many hot paths scale with total data instead of page size.** The SSE stream polls the whole notification and inventory set of a user every 2 s. Alert fan-out re-runs the full donor scan once per page. Inventory reconciles every unit on every write.
4. **There is no Redis or shared cache.** Several per-process in-memory structures (rate limiters, geocode cache, SSE connection cap) silently stop working once more than one API worker runs.
5. **A fresh install is broken today.** `SQLAlchemy>=2.0.41,<3` resolves to 2.1.x, which no longer installs `greenlet`, so the async engine fails on import. CI does not run any tests, so this was not caught.

## Already solid: keep these

These were checked and are correct. Do not "fix" them, and keep their tests green.

- **Refresh-token rotation is atomic.** It uses a conditional `UPDATE … WHERE revoked_at IS NULL` and checks the row count (`backend/app/api/v1/endpoints/auth.py:165-168`, `backend/app/repositories/refresh_token_repository.py:36-43`). It is covered by `test_concurrent_refresh_token_rotation_has_one_winner`.
- **Password-reset tokens are single-use and stored hashed** (`auth.py:125-140`, `password_reset_token_repository.py:23-39`). A reset revokes all refresh tokens, and access tokens are bound to a refresh session through the `sid` claim (`backend/app/api/deps.py:29-33`). So a reset or logout invalidates access tokens immediately.
- **Appointment capacity is enforced by the database.** `uq_appointment_donor_minute` and `uq_appointment_hospital_minute_seat` (`backend/app/models/appointment_schedule.py:24-25`) back this, plus a documented lock order (`backend/app/services/appointment_scheduling.py:83`), optimistic `version` checks, and `IntegrityError` mapped to 409 (`appointment_scheduling.py:101-104`).
- **Inventory unit transitions are serialized and versioned.** They take a hospital row lock, then a unit `FOR UPDATE`, then an `expected_version` check (`backend/app/api/v1/endpoints/inventory_units.py:26-37`, `backend/app/services/smart_inventory.py:89`).
- **The alert outbox is safe with multiple workers.** It claims jobs with `FOR UPDATE SKIP LOCKED` and reclaims expired leases without blind resends (`backend/app/services/alert_worker.py:93-99`).
- **Invitations, responses, conversations and alerts have unique constraints** (`uq_donor_request_response`, `uq_conversation_donor_request`, `uq_emergency_recipient`, `uq_appointment_donor_request`).
- **The publication rate limit is serialized** by a hospital row lock (`backend/app/api/v1/endpoints/blood_requests.py:45-52`).
- **Upload validation** checks MIME type and magic bytes, enforces a size cap, and stores files under random names outside the web root (`backend/app/services/verification_storage.py`).
- **Deployed-environment config validation** rejects the example JWT secret, debug mode and wildcard CORS (`backend/app/core/config.py:56-65`). See A2-05 for the gap.

---

## Phase 1 — System findings

## Part A — Backend and platform

### A1. Race conditions, atomicity and transactions

- [ ] **A1-01 · Critical · Concurrent staff deactivation can leave a hospital with zero administrators** · 🧪 Reproduced
  - Evidence: `backend/app/api/v1/endpoints/staff.py:59-62` counts active `hospital_admin` rows, then sets `is_active=False`. Nothing locks the membership set, so this is a classic write skew. `update_staff_role` (`staff.py:47-53`) has no last-admin check at all.
  - Reproduced: two admins each deactivated the other concurrently. Output: `statuses [200, 200] active admins 0`. The hospital can no longer manage staff, verification or policies.
  - Fix: lock the hospital row first (`SELECT … FROM hospital_profiles WHERE id=:id FOR UPDATE`, the same lock inventory uses), then count and update. Apply the same last-admin guard to role demotion.
  - Done when: a regression test running both requests through `asyncio.gather` returns one 200 and one 409, with at least one active admin remaining. The same holds for two concurrent demotions.

- [ ] **A1-02 · High · Duplicate "pending" verification submissions, then a permanent 500** · 🧪 Reproduced
  - Evidence: `backend/app/api/v1/endpoints/verifications.py:58-62` checks for a pending row, then inserts one. There is no lock, and there is no partial unique index in `backend/alembic/versions/20260717_0009_create_hospital_verifications.py`.
  - Reproduced: two concurrent submits returned `[201, 201]` and left `pending rows 2`. The next submit raised `MultipleResultsFound` (an HTTP 500), because `scalar_one_or_none()` now sees two rows. The hospital is then stuck.
  - Fix: add a migration with `CREATE UNIQUE INDEX uq_one_pending_verification ON hospital_verifications (hospital_profile_id) WHERE status = 'pending'`. Catch `IntegrityError` and return 409, and delete the already-written files on that path. Optionally also lock the hospital row.
  - Done when: concurrent submits give one 201 and one 409, no orphan files remain on disk, and later submits never return 500.

- [ ] **A1-03 · High · Verification decisions have no lock and no state machine** · 🔍 Code-verified
  - Evidence: `verifications.py:118-128` loads the verification and hospital without `FOR UPDATE`, then overwrites `status` and `hospital.verification_status` whatever the current state is. Two admins deciding at once both commit, and the last write wins. Each writes a review row and sends an email. An **older** verification can also be decided and will overwrite the hospital's current status.
  - Related race: `PUT /profiles/hospital/me` (`backend/app/api/v1/endpoints/profiles.py:136-140`) and `PATCH /locations/me` (`backend/app/api/v1/endpoints/locations.py:79-82`) only downgrade a `verified` hospital if they *read* `verified`. If an admin approves while the hospital is editing its name, registration number or location, the approval commits over unreviewed data.
  - Fix: lock the `hospital_profiles` row in all three paths. Allow decisions only from `pending` (or define explicit transitions such as `verified → suspended`), and only on the latest verification. Return 409 otherwise. Add a `version` column to `hospital_verifications` for optimistic checks from the admin UI.
  - Done when: concurrent decisions give one success and one 409, and an identity edit concurrent with an approval leaves the hospital in `more_information_required`.

- [ ] **A1-04 · High · "One active hospital membership per user" is not enforced by the database** · 🔍 Code-verified
  - Evidence: `staff.py:24-36` enforces it with check-then-act. No partial unique index exists (only `uq_hospital_member (hospital_profile_id, user_id)`, `backend/app/models/hospital_membership.py:11`). `get_hospital_context` then picks `result.first()` with no `ORDER BY` (`deps.py:74`), so a user with two active memberships gets a **non-deterministic tenant** on each request.
  - Fix: add `CREATE UNIQUE INDEX uq_one_active_membership ON hospital_memberships (user_id) WHERE is_active`, map the violation to 409, and use `scalar_one_or_none()` in `get_hospital_context`.
  - Done when: a second active membership cannot be created by any code path, and the tenant context is deterministic.

- [ ] **A1-05 · Medium · Concurrent registration with the same email returns 500 instead of 409** · 🧪 Reproduced
  - Evidence: `auth.py:41-50` checks `get_by_email`, then inserts. The unique index on `users.email` stops the duplicate, but the `IntegrityError` is not handled.
  - Reproduced: `results [201, 'IntegrityError']`.
  - Fix: wrap the insert and flush in `try/except IntegrityError`, roll back, and return 409 "Email already registered".
  - Done when: two concurrent identical registrations return `[201, 409]`.

- [ ] **A1-06 · High · Read (GET) endpoints write and commit inside the request** · 🔍 Code-verified
  - Evidence: `expire_requests()` (`backend/app/services/request_lifecycle.py:5-14`) does `SELECT … FOR UPDATE SKIP LOCKED`, then `request_changed()` for each row (cancelling appointments and notifying hospital members), then `UPDATE donor_responses`, then `COMMIT`. It runs at the top of these GET handlers:
    - `blood_requests.py:128`, `:143`
    - `dashboard.py:12`
    - `donor_matches.py:57`, `:72`
    - `notifications.py:78`
    - `workspace.py:16`
    - `locations.py:127`
    - `emergencies.py:18`
    - It also runs in POST `donor_matches.py:92`.

    Most calls pass no `hospital_id`, so **every donor page view runs a global expiry sweep**. A slow sweep adds latency to an unrelated user's GET, and expiry side effects get attributed to whichever user happened to load a page.
  - Fix: run expiry only in the worker (it already calls `expire_requests` in `alert_worker.py:75`). Make reads filter on `expires_at > now() AND (required_by IS NULL OR required_by > now())`, so an un-swept request never *appears* active. Write paths that need the guarantee should check the deadline under their own lock, which most already do.
  - Done when: `grep -rn "expire_requests(db" backend/app/api` returns only write endpoints (or nothing), and the list/read tests still pass.

- [ ] **A1-07 · Medium · GET endpoints take `SELECT … FOR UPDATE` locks** · 🔍 Code-verified
  - Evidence:
    - `GET /blood-requests/{id}` locks the request row (`blood_requests.py:159`).
    - `GET /appointments/policy` (`backend/app/api/v1/endpoints/appointments.py:53-58`) and `GET /appointments/available-slots` (`:140-147`) lock the **hospital** row through `policy_for(..., lock=True)`.
    - `GET /appointments/{id}/history`, `/calendar` and `/confirmation` (`:287`, `:298`, `:314`) go through `_owned()` (`:32-46`), which locks the request, hospital, donor profile and appointment.

    The hospital row is the mutex shared by inventory writes, publication and booking. So a donor downloading a calendar file blocks behind (and blocks) inventory and booking at that hospital.
  - Fix: split `_owned()` into a read variant without locks and a write variant with locks. Call `policy_for(..., lock=False)` on reads, and create the default policy lazily in a write path or migration.
  - Done when: no GET handler issues `FOR UPDATE`. Check by logging SQL in the test suite and grepping for `FOR UPDATE` in GET traces.

- [ ] **A1-08 · Medium · The documented lock order is not followed by publication** · 🔍 Code-verified
  - Evidence: `appointment_scheduling.py:83` documents "request → facility → donor → appointment". `publish_request` locks the **facility first** (`_publication_limit`, `blood_requests.py:204` → `:47`), then the request (`:205`). Appointment, inventory and invitation paths lock request → facility. No deadlock was reproduced, because publication only touches drafts and the others only touch published requests. That safety comes from the status, not the design, and it will break the first time someone adds facility-locking to another request transition.
  - Fix: in `publish_request`, lock the request first, then call `_publication_limit`. Add a short `LOCKING.md`, or a module docstring in `core/database.py`, listing the global order, and require new code to follow it.
  - Done when: every multi-row lock path acquires request → hospital → donor → appointment/unit in that order.

- [ ] **A1-09 · Medium · Multi-tab token refresh can log the user out of every tab** · 🔍 Code-verified
  - Evidence: refresh tokens are strictly single-use (`auth.py:165-168`). The frontend de-duplicates refresh only within one tab (`frontend/lib/api/client.ts:159-162`, module-level `refreshPromise`). If two tabs refresh with the same token, the loser gets 401. If the winner has not yet written the new token to `localStorage`, the loser's `catch` sees the old token still stored, calls `clearTokens()` (`client.ts:111`), and the `storage` event logs out all tabs.
  - Fix: either take a cross-tab lock (`navigator.locks.request('fluid-refresh', …)`) around the refresh and re-read storage inside the lock, or allow a short reuse grace window on the server (for example, return the already-rotated successor for 10 s). The first option is simpler and keeps strict rotation.
  - Done when: a Playwright test that opens two tabs with an expired access token and fires requests in both stays signed in.

- [ ] **A1-10 · Low · Profile writes are last-write-wins** · 🔍 Code-verified
  - Evidence: `PUT /profiles/donor/me` and `PUT /profiles/hospital/me` (`profiles.py:61-91`, `:131-142`) read without a lock or version. A donor saving the profile form at the same moment as a hospital `verify_blood_type` (which does lock, `donor_matches.py:195`) cannot corrupt the verified type, because the ORM only writes changed columns. But two profile saves from two devices silently overwrite each other.
  - Fix: add a `version` column to `donor_profiles` and `hospital_profiles`, send it from the forms, and return 409 on mismatch. The inventory and appointment code already does this.
  - Done when: a stale form submit returns 409 with "Refresh before saving".

### A2. Authentication and authorization

The session model is sound: short-lived access JWTs bound to a server-side refresh session (`sid`), rotation, revocation on logout and reset, and a bcrypt length check. The gaps are around it.

- [ ] **A2-01 · Critical · A hospital admin can pull another hospital's account into their own hospital without consent** · 🧪 Reproduced
  - Evidence: `staff.py:24-30`. If the invited user already belongs to a hospital that has no blood requests and at most one member, the code **moves** their membership: `existing.hospital_profile_id = context.hospital.id`. That user is the sole admin of their own newly registered hospital. Their hospital is left with no members at all, and they now operate inside the inviter's tenant. Lines `31-36` also add any existing hospital account by email without acceptance.
  - Reproduced: hospital A invited hospital B's admin email. Output: `invite status 201 · memberships left on B own hospital: 0`.
  - Fix: replace direct membership with an **invitation** record (pending, accepted or declined, with an expiry) that the invitee must accept while signed in. Never re-point an existing membership. Moving tenants should be an explicit, audited admin operation, if it exists at all.
  - Done when: the invitee's existing membership is untouched until they accept, and a test covers accept, decline and expiry.

- [ ] **A2-02 · High · No rate limiting or lockout on authentication endpoints** · 🔍 Code-verified
  - Evidence: `auth.py` has no limiter on `/login`, `/register`, `/forgot-password`, `/reset-password` or `/refresh`. The only limiter in the codebase is the per-process geocoding one (`locations.py:21-31`). Each login attempt also runs bcrypt on the event loop (A4-08), so password spraying doubles as CPU exhaustion.
  - Fix: add a shared limiter (Redis, see A3) keyed by IP and normalised email:
    - `/login`: about 5 attempts a minute per email and 20 a minute per IP, with exponential back-off.
    - `/forgot-password`: about 3 an hour per email.
    - `/register`: limit per IP.

    Return 429 with `Retry-After`. Log the events to `audit_logs`.
  - Done when: a test sends N+1 failed logins and receives 429. The limiter state is shared across workers.

- [ ] **A2-03 · Medium · Access and refresh tokens are stored in `localStorage`, with no Content-Security-Policy** · 🔍 Code-verified
  - Evidence: `frontend/lib/api/token-storage.ts:33-47` stores both tokens in `localStorage`, including the 14-day refresh token (`REFRESH_TOKEN_EXPIRE_DAYS=14`, `config.py:21`). `frontend/next.config.mjs` sets only `Permissions-Policy`, and the API middleware sets no CSP (`backend/app/core/middleware.py:18-22`). Any XSS (a dependency, a future `dangerouslySetInnerHTML`, a user-supplied map label) can read and exfiltrate a long-lived session.
  - Fix: move the refresh token to an `HttpOnly; Secure; SameSite=Strict` cookie scoped to `/api/v1/auth`, and keep the access token in memory only. Add a strict CSP in `next.config.mjs` (`default-src 'self'`; `connect-src` for the API and Photon; tile hosts in `img-src`).
  - Done when: `localStorage` holds no token, and the CSP header is present on all pages without console violations.

- [ ] **A2-04 · Medium · Account existence leaks through response timing** · 🔍 Code-verified
  - Evidence:
    - `/login` returns immediately for an unknown email, but runs bcrypt (about 100–300 ms) for a known one (`auth.py:78`).
    - `/forgot-password` returns immediately for unknown accounts, but for known accounts it writes tokens and performs a synchronous SMTP send *before* responding (`auth.py:99-118`).

    The bodies are identical (good), but the latency is not.
  - Fix:
    - `/login`: verify against a constant dummy hash when the user does not exist.
    - `/forgot-password`: commit, then send the email in a background task or the outbox, and return immediately for both cases.
  - Done when: the p50 latency difference between known and unknown emails is under about 20 ms in a micro-benchmark test.

- [ ] **A2-05 · Medium · Docker deployments run with the example JWT secret, and the safety check never fires** · 🔍 Code-verified
  - Evidence: `docker-compose.yml:31` defaults `JWT_SECRET_KEY` to `change-me-super-secret-key`. The guard in `config.py:56-65` only runs when `ENVIRONMENT` is `production` or `staging`, and compose never sets `ENVIRONMENT`, so it defaults to `development` (`config.py:13`). Anyone who knows the public default can mint tokens for any user ID.
  - Fix: reject the example secret in **every** environment except an explicit `ENVIRONMENT=test`, or make compose require the variable (`${JWT_SECRET_KEY:?set JWT_SECRET_KEY}`). Set `ENVIRONMENT` in compose.
  - Done when: `docker compose up` without a secret fails fast with a clear message.

- [ ] **A2-06 · Medium · Password hashing runs on the event loop** · 🔍 Code-verified
  - Evidence: `get_password_hash` and `verify_password` are called directly in async handlers (`auth.py:47`, `:78`, `:136`). See A4-08 for the latency effect. It is listed here because it turns any login burst into an API-wide stall.
  - Fix: `await run_in_threadpool(verify_password, …)` (already imported at `auth.py:6`).
  - Done when: a load test of 20 concurrent logins does not raise the p95 of `GET /health`.

- [ ] **A2-07 · Low · Emails are not validated or normalised by the schema** · 🔍 Code-verified
  - Evidence: `email: str` in `backend/app/schemas/auth.py:27`, `:41` and `:46`. Normalisation is ad hoc with `.lower()` in each handler. `staff.py:21` uses `func.lower(User.email)`, which cannot use the unique index.
  - Fix: use `EmailStr` plus a validator that strips and lowercases once. Store emails lowercased, which already happens, and query with equality.
  - Done when: malformed emails get a 422, and no handler calls `.lower()` itself.

- [ ] **A2-08 · Low · Expired refresh and reset tokens are never purged** · 🔍 Code-verified
  - Evidence: `delete_expired()` exists (`refresh_token_repository.py:54`, `password_reset_token_repository.py:50`) but nothing calls it (`grep -rn delete_expired backend/app`). One refresh-token row is added per login, refresh or tab, forever.
  - Fix: call both from the worker loop once an hour.
  - Done when: the worker removes rows past `expires_at`, and a test covers it.

- [ ] **A2-09 · Low · Missing HSTS and CSP headers on the API, and the timing header is exposed** · 🔍 Code-verified
  - Evidence: `middleware.py:18-22` sets nosniff, frame and referrer headers, but no `Strict-Transport-Security`. `X-Response-Time-Ms` is returned on every response (`middleware.py:28`), which makes the timing oracle in A2-04 easy to read.
  - Fix: add HSTS when served over HTTPS. Emit the timing header only when `DEBUG` is on, or log it instead.
  - Done when: production responses carry HSTS and no timing header.

- [ ] **A2-10 · Low · Route protection in the frontend is client-side only** · 🔍 Code-verified
  - Evidence: there is no `frontend/middleware.ts`. Portal layouts render, then redirect after the auth hook resolves. The API enforces authorization, so this is not a data leak, but users see a flash of the portal shell and requests fire before the redirect.
  - Fix: once A2-03 moves the refresh token to a cookie, add `middleware.ts` that redirects unauthenticated `/donor`, `/hospital` and `/admin` routes to `/auth/login` on the server.
  - Done when: a signed-out request for `/hospital` returns a 307 to login without rendering the shell.

### A3. Caching and Redis

**Status: Redis is not used.** There is no cache library in `backend/requirements.txt`, no `lru_cache`, and no ETag or `Cache-Control` except `no-store`. That is fine today: with no data caches there is nothing to invalidate wrongly. The problem is the **per-process state** that already exists, because it breaks as soon as the API runs more than one worker or replica.

- [ ] **A3-01 · Medium · Per-process rate limiter and geocode throttle** · 🔍 Code-verified
  - Evidence:
    - `locations.py:18-33` keeps an `OrderedDict` per process, keyed by `request.client.host`. Behind a reverse proxy every user shares the proxy IP, so they share one 30-per-minute bucket. With N workers the effective limit is N×30.
    - `backend/app/services/geocoding.py:11-12`: a global `asyncio.Lock` and `_last_call` serialise every cache miss in the process. One slow Photon response queues all other lookups for up to the 12 s timeout. With N workers Photon sees N× the configured rate, which breaks the provider's fair-use policy.
  - Fix: move both into Redis, using a sliding-window counter and a token bucket per provider. Run uvicorn with `--proxy-headers --forwarded-allow-ips=<proxy>` so `client.host` is the real client.

- [ ] **A3-02 · Medium · Geocode cache is per process and stampedes** · 🔍 Code-verified
  - Evidence: `geocoding.py:13` keeps 128 entries with a 60 s TTL. The cache is checked *outside* the lock (`:41-43`), so identical concurrent misses each call upstream. Invalidation is TTL-only, which is correct for geocoding results.
  - Fix: Redis `SET key value EX 86400` (addresses rarely change), with a short lock key to collapse identical concurrent misses.

- [ ] **A3-03 · Medium · The SSE connection cap is per process** · 🔍 Code-verified
  - Evidence: `notifications.py:12`, `:31`: `_connections: dict[str, int]`. With N workers each user can open 5×N streams.
  - Fix: a Redis counter per user with a TTL equal to the stream lifetime, or replace the stream design entirely (A4-01).

- [ ] **A3-04 · Low · Cache-invalidation rules to adopt *before* adding any data cache** · 🔍 Code-verified (no data cache exists today)
  - Cache only data that is **not** used for clinical or authorization decisions: geocoding, the static compatibility tables, public landing content, and analytics aggregates with a TTL of 60 s or more.
  - **Never cache:** eligibility or matching results, verification status, memberships, inventory availability, or appointment capacity. These must always be read inside the locking transaction.
  - Invalidate on commit, not on write. Use an SQLAlchemy `after_commit` session hook that deletes keys collected during the transaction, so a rolled-back write never evicts or poisons the cache.
  - Key every cache entry by tenant (`hospital:{id}:…`, `user:{id}:…`) and never share it across tenants.
  - Done when: this rule set is written into `docs/architecture.md`, and any new cache passes review against it.

### A4. Throughput, latency and code efficiency

These are code-level costs (queries per request, work per tick), not infrastructure scaling.

- [ ] **A4-01 · High · The SSE "live" stream polls the database every 2 s and loads unbounded rows** · 🔍 Code-verified
  - Evidence: `backend/app/services/notification_stream.py:25-52`. Each connection, every 2 s, runs:
    - a user lookup and a refresh-session check;
    - `notification_state()` (`:11-22`), which runs 5 SELECTs, two of them unbounded: every notification the user ever received, and every inventory unit of the hospital (`:18`);
    - a SHA-256 over the `repr()` of all of that;
    - on change, an UPDATE plus COMMIT.

    That is about 7–8 queries per 2 s per connection, and each user may hold 5. The frontend *also* polls `/notifications/state` every 15 s alongside the stream (`frontend/hooks/use-live-notifications.ts:104-112`).
  - Fix: keep a per-user `revision` counter (an integer column bumped by triggers or by the write paths) and compare one integer. Push changes with PostgreSQL `LISTEN/NOTIFY` or Redis pub/sub instead of polling. Drop the 15 s poll while the stream is connected.
  - Done when: an idle connected client costs zero queries between changes, or at most one indexed query per tick.

- [ ] **A4-02 · High · Alert and notification fan-out re-runs the full donor scan once per page** · 🔍 Code-verified
  - Evidence: `blood_requests.py:72-78` and `backend/app/services/emergency_alerts.py:46-53` loop `evaluate_candidates(page=page, page_size=100)`. Each call re-executes the whole donor query and Python ranking (`backend/app/services/intelligent_matching.py:55-79`) and only slices a different page, so cost is pages × donors. Each candidate then runs a `FOR UPDATE` plus 2–3 SELECTs plus 1–2 flushes (`emergency_alerts.py:55-70`). All of this happens inside the publish transaction, holding the request and hospital locks.
  - Fix: call the candidate query once, unpaginated, inside the service. Bulk-load existing alerts and responses with `IN (...)`, lock profiles in one `SELECT … WHERE user_id IN (...) ORDER BY user_id FOR UPDATE`, and bulk-insert notifications, alerts and responses.
  - Done when: publishing to 1,000 synthetic donors issues O(1) queries (not O(donors)), and the existing fan-out tests pass.

- [ ] **A4-03 · High · Matching diagnostics streams every donor in the database on every publish** · 🔍 Code-verified
  - Evidence: `record_execution()` → `matching_summary()` (`backend/app/services/matching_diagnostics.py:10-37`) streams **all** donor profiles (`yield_per=250`, no filter) and evaluates each one. It is called synchronously in publish (`blood_requests.py:69`, `:98`).
  - Fix: compute diagnostics asynchronously in the worker, or only on demand from the development diagnostics endpoint. At minimum, pre-filter with the same SQL radius filter that matching uses.
  - Done when: the publish latency no longer grows with the total donor count.

- [ ] **A4-04 · High · N+1 queries on high-traffic list endpoints** · 🔍 Code-verified
  - `GET /notifications`: `notifications.py:84-91` runs 4 queries per item, and the donor profile is re-fetched on every iteration. With the default `page_size=100`, that is up to about 400 queries.
  - `GET /hospital/emergencies` overview: `emergencies.py:22-34` runs 3 queries per request, up to 100 requests.
  - `GET /messages`: `messages.py:44-52` runs 2 queries per conversation, with **no LIMIT** on conversations.
  - `GET /inventory` (legacy batches): `inventory.py:17-18`, `:34` call `data_for()`, which reloads every unit of the hospital **per batch**.
  - Blood request serialisation: `blood_requests.py:55-57` runs 2 COUNT queries per row, called per row at `:139` (100 rows, so 200 queries) and `:155`.
  - Verification list: `verifications.py:27-28` runs 2 queries per item, called at `:91` with up to 100 items.
  - Fix: batch with `IN (...)` and grouped counts, `selectinload`, or a `LATERAL`/`DISTINCT ON` query for "last message". Paginate `/messages`.
  - Done when: each endpoint's query count is constant with respect to page size. Assert this in tests with a SQLAlchemy `before_cursor_execute` counter.

- [ ] **A4-05 · High · Inventory reconcile is O(units) queries on every write, under the hospital lock** · 🔍 Code-verified
  - Evidence: every inventory write ends in `_commit()` → `reconcile()` (`inventory_units.py:40-46`; `smart_inventory.py:194-220`). It loads every unit, runs `alert()` once per unit with an expiry (one SELECT each, `:185`), and `db.get(BloodRequest)` once per reserved unit. It then calls `summary()`, which loads every unit **again** plus 30 days of movements and makes 30 passes over them (`:174-178`). The worker repeats this for every verified hospital every 10 s (`smart_inventory.py:223-230`; `backend/app/scripts/run_alert_worker.py:16`). The hospital row lock it holds is the same lock appointment booking and publication need.
  - Fix:
    - Reconcile only the units touched by the action.
    - Move full-hospital reconcile to the worker, running only for hospitals with units expiring since the last run (`WHERE expires_at BETWEEN last_run AND now()`).
    - Load alert states in one query.
    - Compute the trend with `GROUP BY date_trunc('day', created_at)`.
  - Done when: a single unit action issues a constant number of queries, and the worker skips unchanged hospitals.

- [ ] **A4-06 · High · Filtering, aggregation and pagination are done in Python on unbounded result sets** · 🔍 Code-verified
  - `GET /donor-matches/compatible`: `donor_matches.py:76` loads **every active request on the platform**, filters `request_id` in Python (`:77`), and paginates in Python (`:84`).
  - Dashboard: `dashboard.py:26-30` loads all requests, or all requests platform-wide for admins, then counts in Python. `analytics.py` already does the same counts in SQL with `case` sums; reuse that.
  - Workspace: `workspace.py:20-21` (donor) runs `match_request` over all active requests. `:39-46` buckets analytics by day with O(days × rows) scans.
  - Fix: push the blood-type compatibility set, distance bounding box, urgency, search and LIMIT/OFFSET into SQL. Use `GROUP BY` for counts and day buckets.
  - Done when: these endpoints' memory and query time are bounded by page size.

- [ ] **A4-07 · Critical · Fresh installs crash: `greenlet` is no longer pulled in by SQLAlchemy** · 🧪 Reproduced
  - Evidence: `backend/requirements.txt:4` `SQLAlchemy>=2.0.41,<3` resolves to **2.1.6** today. 2.1 no longer installs `greenlet` by default, and the async engine raises `ImportError: The SQLAlchemy asyncio module requires that the Python 'greenlet' library`. The suite passed (**111 passed**) only after a manual `pip install greenlet`.
  - Fix: `SQLAlchemy[asyncio]>=2.0.41,<2.2`, and add a lock file (`pip-tools`/`uv lock`). This is also tracked in A6, because CI would have caught it.
  - Done when: `pip install -r requirements.txt` in a clean venv runs the test suite without extra installs.

- [ ] **A4-08 · Medium · Blocking calls on the event loop** · 🔍 Code-verified
  - bcrypt in `auth.py:47`, `:78` and `:136` (A2-06).
  - Synchronous SMTP (`backend/app/services/email_service.py:16`, `timeout=15`) called directly in async handlers at `verifications.py:77` and `:129`. The event loop can stall for up to 15 s per call. `auth.py:114` does it correctly with `run_in_threadpool`.
  - File writes of up to 10 × 10 MB uploads on the loop (`verification_storage.py:24-25`).
  - SHA-256 over unbounded data every 2 s per SSE connection (`notification_stream.py:21`).
  - Fix: `run_in_threadpool` / `anyio.to_thread` for the first three, and send email through the existing outbox. A4-01 removes the hash.
  - Done when: a test that patches `smtplib.SMTP` to sleep 5 s shows `GET /health` still answering in under 50 ms during a verification decision.

- [ ] **A4-09 · Medium · Missing indexes for the hottest predicates** · 🔍 Code-verified
  - Evidence: compared the `WHERE` and `ORDER BY` clauses in endpoints against the indexes in `backend/alembic/versions/*`. Add:
    - `notifications (user_id, created_at DESC, id DESC)`, plus a partial `notifications (user_id) WHERE NOT is_read`. Drop the standalone boolean `ix_notifications_is_read`.
    - `alert_deliveries (status, next_attempt_at)` and `(status, lease_until)`, for the worker claim queries (`alert_worker.py:93-99`).
    - `blood_requests (hospital_profile_id, status, created_at DESC)` and `(status, required_by)`. `created_at` and `required_by` are unindexed today, but every list orders by `created_at` and expiry filters on `required_by`.
    - `audit_logs (hospital_profile_id, action, created_at)` for the publication limit (`blood_requests.py:48-50`), and `audit_logs (entity_id)`.
    - `donor_responses (donor_user_id, invited_at)`.
  - Done when: an Alembic migration adds these, and `EXPLAIN` on each listed query shows an index scan on a seeded dataset.

- [ ] **A4-10 · Medium · Geographic matching is a full-table scan** · 🔍 Code-verified
  - Evidence: the distance filter is an `acos(...)` expression over every donor row (`intelligent_matching.py:52-58`, duplicated in `locations.py:114-117`). No index can serve it.
  - Fix: add a bounding-box pre-filter (`latitude BETWEEN … AND longitude BETWEEN …`) on a composite `(latitude, longitude)` index, together with SQL pre-filters for availability, opt-in and the compatible blood types. Move to PostGIS `geography` with a GiST index when the donor count grows.
  - Done when: `EXPLAIN` uses an index, and the shared helper replaces both copies.

- [ ] **A4-11 · Medium · Appointment occupancy stores one row per minute per booking** · 🔍 Code-verified
  - Evidence: `appointment_scheduling.py:92-100` inserts `slot_minutes` rows per booking, so a 60-minute slot is 60 rows. Slot search loads every minute row for the hospital and donor over up to 15 days (`appointments.py:107-111`) and loops minute by minute (`:115-134`). This is correct, because the unique constraints make it race-free, but write volume is high and search is O(minutes).
  - Fix: keep the guarantee, but store one row per **slot**, keyed `(hospital, slot_start, seat)` and `(donor, slot_start)`, since slots are aligned to `slot_minutes` (`slot_end` enforces alignment, `appointment_scheduling.py:45-46`). Alternatively, use a PostgreSQL exclusion constraint on `tstzrange(start, end)` with `btree_gist`.
  - Done when: a booking writes 1 row, slot search is O(slots), and the concurrency tests in `test_appointment_scheduling.py` still pass.

- [ ] **A4-12 · Medium · The worker is serial and rescans everything every 10 s** · 🔍 Code-verified
  - Evidence: `run_alert_worker.py:11-26`. Each tick:
    - re-runs the full `queue_alerts` candidate scan for **every** active urgent request (`alert_worker.py:73-86`);
    - checks reminders with about 5 queries per upcoming appointment;
    - reconciles every hospital (A4-05);
    - delivers up to 100 jobs one at a time (`:89-160`).
  - Fix: process only requests changed since the last tick (an `updated_at` column or a dirty flag). Batch-claim N delivery jobs and send them concurrently with an `asyncio.Semaphore`.
  - Done when: idle ticks issue a constant number of queries.

- [ ] **A4-13 · Medium · Database pool and timeouts are left at defaults** · 🔍 Code-verified
  - Evidence: `backend/app/core/database.py:5-10`: default pool (5 connections + 10 overflow), with no `pool_timeout`, `pool_recycle` or `statement_timeout`. SSE ticks share this pool with API requests.
  - Fix: set the pool size explicitly for the worker count, and set `connect_args={"server_settings": {"statement_timeout": "5000"}}` for API sessions. Consider PgBouncer in transaction mode.
  - Done when: these settings are configurable via env and documented in `.env.example`.

- [ ] **A4-14 · Low · `ILIKE '%term%'` searches are unescaped and unindexed** · 🔍 Code-verified
  - Evidence: `appointments.py:169`, `blood_requests.py:152`, `inventory_units.py:109`, `verifications.py:86`. A `%` or `_` in user input changes the meaning of the match, and every search is a sequential scan.
  - Fix: escape LIKE metacharacters in one helper. Add `pg_trgm` GIN indexes on `hospital_name` and identifiers if search is used heavily.

- [ ] **A4-15 · Low · New SMTP connection and HTTP client per message** · 🔍 Code-verified
  - Evidence: `alert_worker.py:34` and `:56`, `geocoding.py:50`.
  - Fix: reuse one `httpx.AsyncClient` per process, and batch SMTP sends per tick over one connection.

### A5. Code and file organization

- [ ] **A5-01 · Medium · Business logic lives in endpoint files, and the repository layer is mostly unused** · 📏 Measured
  - Evidence: only 5 repositories exist, used by auth, deps, profiles, locations and one `create` in `blood_requests.py` (`grep -rn "from app.repositories" backend/app`). `BloodRequestRepository.list_requests` and `list_requests_page` (`backend/app/repositories/blood_request_repository.py:37`, `:46`) are never called. Matching fan-out (`blood_requests.py:63-98`), the response state machine (`donor_matches.py:88-148`), and the appointment state machine (`appointments.py:227-278`) all live in route handlers.
  - Fix: adopt the existing three-layer convention for real: endpoints handle HTTP only, services hold the state machines, repositories hold queries. Move one feature at a time, starting with `donor_matches` and `blood_requests`, the largest. Delete the dead repository methods.
  - Done when: no endpoint module issues `select(` directly, except trivial reads, and `docs/folder-structure.md` documents the rule.

- [ ] **A5-02 · Medium · Services depend on the HTTP layer** · 🔍 Code-verified
  - Evidence: `smart_inventory.py:4`, `appointment_scheduling.py:6` and `geocoding.py:7` import and raise `fastapi.HTTPException`. Services cannot be reused by the worker or by scripts without importing FastAPI semantics.
  - Fix: raise domain exceptions (`ConflictError`, `NotFoundError`, `PolicyError`) and map them to HTTP codes in one exception handler in `main.py`.

- [ ] **A5-03 · Medium · Duplicated helpers and constants** · 📏 Measured
  - `require_hospital_operator(await get_hospital_context(db, user))` is hand-called in 10 places (`messages.py:26`, `appointments.py:29`, `blood_requests.py:132`, `:146`, `:163`, `portal.py:18`, `dashboard.py:19`, `analytics.py:30`, `workspace.py:25`, `:36`) instead of using `Depends`.
  - Donor display-name masking is implemented 6 times (`donor_matches.py:18`, `intelligent_matching.py:65`, `appointments.py:19`, `emergencies.py:43`, `messages.py:53`, `portal.py:21`).
  - The SQL great-circle distance appears twice (`locations.py:114`, `intelligent_matching.py:52`).
  - Active-status sets (`{"published","partially_fulfilled"}` and so on) are redefined across many modules.
  - Fix: add a `services/common.py` (or `domain/`) with `display_name()`, `sql_distance_km()` and `RequestStatus`/`AppointmentStatus` enums, and use `Depends` for context.

- [ ] **A5-04 · Medium · Circular imports are worked around with function-level imports** · 📏 Measured
  - Evidence: 39 indented `import`/`from` statements in `backend/app/api` and `backend/app/services` (`grep -rnE "^\s+(from|import) " … | wc -l`). The core cycle is `request_lifecycle → emergency_alerts → appointment_scheduling`. `blood_requests.py:131`, `:145` and `:162` import `get_hospital_context` inside functions, although `app.api.deps` is imported at line 7.
  - Fix: break the cycle with the domain module from A5-03. Have `request_changed` publish an event that the appointment service subscribes to, or move `close_for_request` into a lifecycle module both can import.

- [ ] **A5-05 · Medium · Code density makes review hard** · 📏 Measured
  - Evidence: 23 lines in `backend/app` are over 300 characters (`awk 'length>300'`). `donor_matches.py:24` is **979** characters. Many handlers chain statements with `;` on one line (`blood_requests.py:181`, `:199`, `:211`; `inventory_units.py` throughout). There is no formatter or linter config for Python.
  - Fix: add `ruff` (lint and format, line length 120) and run it once in its own commit so blame stays readable. Enforce it in CI (A6-02).

- [ ] **A5-06 · Low · Two inventory models are both live** · 🔍 Code-verified
  - Evidence: legacy batch counts (`BloodInventory`, `backend/app/api/v1/endpoints/inventory.py`) and traceable units (`InventoryUnit`, `inventory_units.py`) are both exposed. `reconcile()` rewrites batch counts from the units (`smart_inventory.py:214-216`), so batches are a derived cache stored as a table.
  - Fix: make `/inventory` a read-only projection of units (or a SQL view) and remove its write endpoints after the frontend migrates.

- [ ] **A5-07 · Low · Dead or misleading modules** · 🔍 Code-verified
  - Evidence: `backend/app/utils/` is empty. `endpoints/protected.py` is only used by tests. `portal.py:1` says "Legacy", but the frontend still calls it (`frontend/services/portal-service.ts`). `frontend/lib/mock-data.ts` and two phone-demo components are covered in Part B.
  - Fix: delete what is unused, and rename or document what is "legacy but live".

- [ ] **A5-08 · Low · `notify()` costs one extra query per recipient** · 🔍 Code-verified
  - Evidence: `backend/app/services/notification_delivery.py:3-7` loads the donor profile for every call, including hospital staff, who have none. It is called once per hospital member in loops (`appointment_scheduling.py:121-123`).
  - Fix: accept preferences as a parameter, or batch-load them for the recipient set.

### A6. Build, deployment and CI

- [ ] **A6-01 · High · A full Windows virtualenv is committed: 3,930 of 4,250 tracked files, 77 MB** · 📏 Measured
  - Evidence: `git ls-files | grep -c backend/backend/.venv` gives `3930`, and `du -sh backend/backend` gives `77M`. `.gitignore` already lists `.venv/`, but the files were committed anyway (first in `52001b1`). It bloats every clone, Docker context (A6-04) and code search, and pins Windows binaries (`*.pyd`, `*.exe`).
  - Fix: `git rm -r --cached backend/backend` in its own commit. Optionally purge it from history later with `git filter-repo`, coordinated with collaborators.
  - Done when: `git ls-files | wc -l` is about 320.

- [ ] **A6-02 · High · CI runs no tests, lint, type-check or build** · 🔍 Code-verified
  - Evidence: `.github/workflows/ci.yml:13-17` only runs `test -d frontend`, `test -d backend` and `test -f README.md`.
  - Fix: add jobs for:
    - backend `pytest` with a `postgres:16` service (the suite needs only `DATABASE_URL`);
    - `ruff`;
    - `alembic upgrade head` on an empty DB, then `alembic check`;
    - frontend `npm ci`, `tsc --noEmit`, `npm run lint` and `npm run build`;
    - optionally, Playwright smoke tests.
  - Done when: a PR that breaks any of these shows a red check.

- [ ] **A6-03 · High · Unpinned Python dependencies** · 🧪 Reproduced (see A4-07)
  - Evidence: every line of `backend/requirements.txt` is a range, and there is no lock file. The greenlet break shows the risk.
  - Fix: add a lock file and Dependabot or Renovate.

- [ ] **A6-04 · Medium · The backend image runs as root and copies the whole repo** · 🔍 Code-verified
  - Evidence: `Dockerfile.backend` has no `USER`, uses `COPY . .`, and there is no `.dockerignore`, so the image contains `.git`, the frontend, the 77 MB venv and the PNGs. It also uses `python:3.12-slim`, while local development and tests used 3.13.
  - Fix: use a multi-stage build that copies only `backend/`, add a `.dockerignore`, add a non-root `USER`, and pin one Python minor version across Docker, CI and the docs.

- [ ] **A6-05 · Medium · Compose never runs the worker, and exposes the database** · 🔍 Code-verified
  - Evidence: `docker-compose.yml` defines only `postgres` and `backend`. Alerts, reminders, inventory monitoring and expiry never run in a compose deployment. The README says to start the worker separately (`README.md:31-34`). Port `5432:5432` is published to the host (`docker-compose.yml:12`), and `./backend` is bind-mounted over the image (`:39`).
  - Fix: add a `worker` service (`python -m app.scripts.run_alert_worker`), drop the published DB port outside local development, and move the bind mount into a `docker-compose.override.yml` for development.
  - Also tracked as Phase 2 P2-01.

- [ ] **A6-06 · Medium · The entrypoint migrates on every start and does not forward signals** · 🔍 Code-verified
  - Evidence: `backend/entrypoint.sh` runs `alembic upgrade head` in every replica, so they race when several start together. It then starts `uvicorn` without `exec` (so SIGTERM never reaches it), without `--workers`, and without `--proxy-headers`.
  - Fix: run migrations as a one-off job or init container. Use `exec uvicorn … --proxy-headers --forwarded-allow-ips=…`.

- [ ] **A6-07 · Low · QA screenshots in the repo root** · 🔍 Code-verified
  - Evidence: `logo-desktop-check.png` (160 KB) and `logo-mobile-check.png` (98 KB).
  - Fix: delete them, or move them to `docs/assets/` if they are referenced.

- [ ] **A6-08 · Low · There is no `.env` check at startup for required production settings** · 🔍 Code-verified
  - Evidence: `SMTP_*`, `FRONTEND_URL` and `CORS_ORIGINS` silently fall back to localhost defaults (`config.py:25`, `:51-54`).
  - Fix: extend the deployed-environment validator to require them, or log a loud warning, when `ENVIRONMENT` is `production`.

---

## Part B — User interface

Scope: the landing pages (`/`, `/about`, `/contact`), the auth pages, and the donor, hospital and admin portals. Measurements come from the CSS and TSX sources, using scripted counts of declared values and computed WCAG contrast ratios. `npx tsc --noEmit` and `npm run lint` both pass with no errors or warnings, so these are design-system problems, not compile problems.

### B0. Design principles we follow

These are the rules every UI change is reviewed against. Add your own team principles below the list; this section is the single reference.

1. **Contrast: make different things look clearly different.**
   - Use one primary action per view, filled with brand red.
   - Secondary actions are outlined. Tertiary actions are text buttons.
   - Text must meet WCAG 2.2 AA: 4.5:1 for body text, 3:1 for text 18.66 px bold or larger, and 3:1 for UI parts such as borders, icons and chart bars.
   - Status must never be shown by colour alone. Always pair the colour with text or an icon.
2. **Repetition: the same thing always looks and behaves the same way.**
   - Use one `Button`, `Card`/`Panel`, `StatusBadge`, `EmptyState`, `Skeleton`, `DataTable`, `Field`, `Dialog`, `PageHeader` and `AppShell`, all in `components/ui`.
   - Give each concept one name, used in navigation, headings and buttons alike.
   - Render a domain object (blood request, appointment, inventory unit) with **one** component in every portal, varying only the permitted actions.
3. **Alignment: everything sits on a shared grid.**
   - Use a 4 px spacing grid, one container width per surface, and left-aligned text blocks.
   - Put page actions top-right in `PageHeader`.
   - Right-align numbers in tables.
4. **Proximity: related items sit together; unrelated items are separated by space, not lines.**
   - Use 8 px inside a control group, 16 px between fields, 24 px between groups and 32–48 px between sections.
   - Put labels directly above their inputs, and errors directly below.
5. **Visual hierarchy: one clear entry point per screen.**
   - Every route has exactly one `h1`, and heading levels are never skipped.
   - Size, then weight, then colour signal importance, in that order.
6. **Consistent typography.**
   - Use Inter for UI and body text, and Poppins 700 for `h1`/`h2` on **every** surface (landing, auth, donor, hospital, admin).
   - Use only the type scale below. Nothing smaller than 12 px.
7. **Fluent copy.**
   - Write in sentence case, with plain verbs and no internal jargon or raw enum values.
   - Say "Sign in" and "Sign out" everywhere.
   - Give the user the next step: "Confirm your location to see nearby requests", not "Location missing".
8. **Accessibility and resilience.**
   - Every control is reachable by keyboard and shows a visible `:focus-visible` ring.
   - Every input has a `<label>`, and errors are wired with `aria-describedby` and `role="alert"`.
   - Honour `prefers-reduced-motion`, which is already done well.
   - A failed request shows an error state, never an empty state.

**Design tokens to standardise on.** These are grounded in values already in the code, and their contrast was computed.

| Token | Value | Checked pairing |
| --- | --- | --- |
| `--brand` | `#c0392b` | white text on it 5.44:1 ✅ |
| `--brand-hover` | `#a93226` | white text on it, darker than `--brand` ✅ |
| `--brand-soft` | `#fff1f0` | brand text on it 4.94:1 ✅ |
| `--ink` | `#17212b` | on `--bg` 15.6:1 ✅ |
| `--muted` | `#647080` | on `#fff` 5.03:1, on `--bg` 4.81:1 ✅ |
| `--line` | `#e8ecf0` | — |
| `--bg` / `--surface` | `#f8fafc` / `#ffffff` | — |
| `--success` | `#23643e` on `#e5f4e9` | 6.2:1 ✅ |
| `--warning` | `#795517` on `#fff2d6` | 6.1:1 ✅ |
| `--danger` | `#a32621` on `#ffeae6` | 6.4:1 ✅ |
| `--info` | `#0369a1` on `#e0f2fe` | 5.2:1 ✅ |

- **Type scale:** 12 / 14 / 16 / 20 / 24 / 32 px. Line height is 1.5 for body text and 1.2 for headings. Weights are 400, 500, 600 and 700. Form inputs use 16 px, which stops iOS zooming in on focus.
- **Spacing scale:** 4, 8, 12, 16, 24, 32, 48, 64 px, which are Tailwind 1, 2, 3, 4, 6, 8, 12 and 16.
- **Radii:** 8 px for controls, 12 px for cards, 999 px for pills.
- **Breakpoints:** Tailwind defaults only (640 / 768 / 1024 / 1280).
- **Token mapping:** map these into `tailwind.config.ts` (`theme.extend.colors`, `fontFamily`, `spacing`), so CSS files and utilities share one source.

### B1. Typography

- [ ] **B1-01 · High · There is no type scale: 17, 36 and 5 distinct font sizes per stylesheet** · 📏 Measured
  - Evidence:
    - `frontend/app/portal.css` declares 17 sizes: 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 20, 23, 25, 28 and 29 px.
    - `frontend/app/public.css` declares 36, including 5–7 px and 12 different `clamp()`/rem heading expressions.
    - `frontend/app/location.css` declares 5.
    - The TSX adds Tailwind `text-xs` through `text-3xl`, plus arbitrary `text-[10px]`, `[13px]`, `[15px]`, `[28px]`, `[32px]` and `[40px]`.
  - Fix: define the six-step scale from B0 as CSS custom properties and Tailwind `fontSize`, replace raw values, and add a Stylelint rule that forbids raw `font-size`.
  - Done when: each stylesheet uses only scale tokens, and `grep -E "text-\[[0-9]+px\]"` returns nothing.

- [ ] **B1-02 · High · Most portal text is smaller than 12 px** · 📏 Measured
  - Evidence: 74 of 122 `font-size` declarations in `portal.css` (61%) are under 12 px. Examples:
    - every status pill: `.portal-pill` at 8 px (`portal.css:586-595`);
    - `.portal-stat small` at 8 px (`:1744`);
    - chart axes at 8 px (`:898`);
    - message timestamps at 8 px (`:1360`);
    - the mobile bottom nav at 8 px (`:1884`).

    On the landing pages, the footer text is 9 px and drops to 8 px on mobile (`public.css:224`, `:261`).
  - Fix: use 12 px as the floor for metadata, 14 px for body text and 16 px for inputs. Use 12 px weight-600 text for badges.
  - Done when: no rule sets text below 12 px.

- [ ] **B1-03 · Medium · Heading fonts differ by surface** · 🔍 Code-verified
  - Evidence: Inter (`--font-sans`) and Poppins 700 (`--font-brand`) are loaded correctly with `next/font/local` (`frontend/app/layout.tsx:11-18`). But:
    - on the landing pages, h1–h3 use Poppins (`public.css:4`);
    - in the donor and hospital portals only the h1 does (`portal.css:16-18`);
    - auth and admin sit outside both wrappers, so all their headings fall back to Inter.

    `tailwind.config.ts` has no `fontFamily`, so `font-sans` is not wired to the loaded font.
  - Fix: add `fontFamily: { sans: ['var(--font-sans)'], display: ['var(--font-brand)'] }`, and apply one global `h1, h2 { font-family: var(--font-brand) }` rule.
  - Done when: landing, auth, donor, hospital and admin headings render in the same family, checked by screenshot comparison.

- [ ] **B1-04 · Medium · The same heading role has five sizes, and one header class does not exist** · 🔍 Code-verified
  - Evidence: page `h1` sizes are:
    - 29 px in `.portal-welcome h1` (`portal.css:302`);
    - 20 px in `.portal-hospital-identity h1` (`:735`);
    - 16 px in `.portal-messaging aside h1` (`:1266`);
    - 24 px on admin pages (`text-2xl`);
    - 24–30 px on auth pages.

    `.portal-page-title` is used as the page header in `frontend/app/hospital/donors/page.tsx:129` and `frontend/components/location/location-workspace.tsx:64`, but is **defined nowhere**, so those headers are unstyled.
  - Fix: one `PageHeader` component (see B5-01) with h1 at 32 px or 24 px on mobile.

### B2. Spacing and layout

- [ ] **B2-01 · Medium · Most hand-written spacing is off the 4 px grid** · 📏 Measured
  - Evidence:
    - `portal.css`: 36 distinct spacing values, 73% not multiples of 4. The most common are 15 px ×25, 9 px ×19, 5 px ×17 and 13 px ×14. Examples: `.portal-sidebar__brand { padding: 25px 22px 18px }` (`:44`) and `.portal-main { padding: 27px 30px 40px }` (`:280`).
    - `public.css`: 63 distinct values, 69% off-grid.
  - Fix: use the spacing tokens from B0 (`--space-1` to `--space-16`), shared with Tailwind.
  - Done when: a Stylelint check allows only token values for padding, margin and gap.

- [ ] **B2-02 · Medium · Two styling systems are mixed on the same screens** · 📏 Measured
  - Evidence: portal pages mix `portal.css` classes and Tailwind utilities inside the same `.portal-shell`. Counts are portal.css classes vs Tailwind utilities:

    | File | portal.css | Tailwind |
    | --- | --- | --- |
    | `hospital/inventory/page.tsx` | 71 | 47 |
    | `components/portal/appointments-page.tsx` | 59 | 31 |
    | `hospital/staff/page.tsx` | 4 | 68 |
    | `hospital/profile/page.tsx` | 4 | 70 |
    | `donor/profile/page.tsx` | 0 | 81 |

    Pages built in one system look different from neighbours built in the other.
  - Fix: pick one system. Recommended: Tailwind with the B0 tokens, and keep `portal.css` only for layout primitives during migration. Migrate page by page.

- [ ] **B2-03 · Low · `public.css` stacks a second override layer** · 🔍 Code-verified
  - Evidence: `public.css:264` opens "A warmer campaign layer…". It redefines `.public-button` (`:18` and `:271`) and `.public-hero__eyebrow` (`:253`, `:267` and `:314`), and repeats the `@media (max-width:640px)` block (`:250`, `:313`).
  - Fix: merge the overrides into the base rules.

- [ ] **B2-04 · Low · Container widths differ on every surface** · 🔍 Code-verified
  - Evidence:
    - public: `min(1240px, 100% - 96px)` (`public.css:12`);
    - portal: `max-width: 1600px` (`portal.css:278`);
    - admin: no maximum width;
    - auth: `max-w-md` for login and reset, `max-w-lg` for register, `max-w-3xl` for `/auth`.
  - Fix: use two widths, a content width of about 1240 px for landing and portals and a form width of about 480 px for auth, defined as tokens.

### B3. Colour and contrast

- [ ] **B3-01 · High · Brand red has four values, and the defined token is never used** · 🔍 Code-verified
  - Evidence:
    - `portal.css:2` defines `--portal-brand: #c0392b`, but `var(--portal-brand)` appears **0** times, while `#c0392b` is hard-coded 29 times in that file.
    - Tailwind `fluid-600` and `fluid-700` are `#dc2626` and `#b91c1c` (`frontend/tailwind.config.ts:8-13`), and `ui/Button` uses `bg-fluid-700` (`components/ui/button.tsx:13`).
    - The admin active nav uses `bg-red-600`.
    - About 10 slightly different hover reds are used, from `#a93226` to `#9f241b`.
    - Distinct hex values: 104 in `portal.css` and 151 in `public.css`.
  - Fix: one `:root` token set (B0), map Tailwind `fluid` to it, and replace the literals.
  - Done when: `grep -ri "#c0392b"` matches only the token definition.

- [ ] **B3-02 · Medium · Contrast failures** · 📏 Measured (WCAG ratio computed)
  - `.portal-stock--unknown` text: `#80909e` on `#f0f3f6`, **2.95:1** (`portal.css:837`).
  - Landing `.preview-metrics strong`: `#a6adb4` on white, **2.27:1** (`public.css:173`).
  - `text-slate-400` (`#94a3b8`) on white, **2.56:1**, used in admin search and `components/donor/donor-sidebar-item.tsx:31`.
  - `.public-hero__baseline`: `#737981` on `#fafafa`, **4.21:1**, at 10 px (`public.css:70`).
  - UI parts that need 3:1:
    - the "low stock" bar `#d49a24` on white, **2.49:1** (`portal.css:831`);
    - the empty-state icon `#8d9eae` on `#f0f3f6`, **2.47:1** (`portal.css:1041`).
  - Passing, keep as is: body text 16.9:1, white on brand 5.44:1, the portal pills 6.1–6.4:1, and the `ui/Badge` tones 4.84–6.37:1.
  - Fix: use `--muted` (`#647080`) for secondary text, and use about `#b07a12` for amber UI marks.
  - Done when: axe in Playwright reports no `color-contrast` violations on the main routes.

- [ ] **B3-03 · Low · Near-identical backgrounds and text inks** · 📏 Measured
  - Evidence:
    - Backgrounds: `#fcfcfc` (`globals.css:12`), `#f8fafc` (portal), `#fafafa` (public), slate-50 (auth and admin).
    - Inks: `#161b22`, `#17212b`, `#182233`, `#172333`, slate-900 and slate-950.
  - Fix: use `--bg`, `--surface` and `--ink` from B0.

### B4. Repetition and component reuse

- [ ] **B4-01 · High · Admin uses a separate shell; two other layouts are dead** · 🔍 Code-verified
  - Evidence:
    - Donor and hospital use `PortalShell` (`components/portal/portal-shell.tsx`, 401 lines) through 3-line wrappers.
    - Admin uses its own `AdminShell` (`components/admin/admin-shell.tsx`), a single minified line. It has a dark `bg-slate-950` sidebar and `bg-red-600` active state, with no collapse, no notifications and no mobile nav.
    - `components/layout/dashboard-layout.tsx` and `layout/sidebar.tsx` have no importers.
  - Fix: one `AppShell` driven by a per-role nav config (donor, hospital, admin). Delete the unused layouts.
  - Done when: all three portals share one shell component and the same header, sidebar and mobile behaviour.

- [ ] **B4-02 · High · Parallel primitive sets are used side by side** · 🔍 Code-verified
  - Buttons:
    - `.portal-button` (44 px, 8 px radius, 12 px text, `#c0392b`), used about 105 times;
    - `.public-button` (49 px, 10 px radius);
    - `ui/Button` (`rounded-xl`, 14 px text, `#b91c1c`), used about 21 times;
    - a fourth inline button inside `ui/EmptyState` (`components/ui/empty-state.tsx:6`).
  - Empty and loading states: `PortalEmpty`/`PortalSkeleton` (`components/portal/portal-ui.tsx`) and `ui/EmptyState`/`ui/LoadingState` both exist. `hospital/staff/page.tsx` uses **both** sets on one page (`:122`, `:131`, `:133`, `:217`, `:223`).
  - Cards: ad-hoc `rounded-2xl border` appears about 30 times, alongside `<Card>` ×6 and `PortalPanel` ×34.
  - Tables: admin pages hand-build `<table>`, while `ui/table.tsx` (`DataTable`) is unused.
  - Fix: keep one of each in `components/ui`, styled from the B0 tokens, and migrate the call sites.

- [ ] **B4-03 · High · Elements use CSS classes that do not exist, so they render unstyled** · 🔍 Code-verified
  - Evidence:
    - `portal-btn portal-btn--secondary` is used for "Refresh results" (`components/location/location-workspace.tsx:73`) and the "Map, radius & location settings" link (`app/donor/requests/page.tsx:162`). `.portal-btn` is only defined under `.fluid-location-selector` (`location.css:203`), so both render as default browser controls.
    - `portal-page-title` (B1-04) and `portal-donor-list` (`hospital/donors/page.tsx:300`, `:377`) are undefined as well.
  - Fix: switch these to the shared `Button` and `PageHeader`, and add a check that fails when a `className` token matches no rule, for example `stylelint-no-unused-selectors` in reverse, or a small script.

- [ ] **B4-04 · Medium · About 1,800 lines of dead UI code** · 📏 Measured (import search)
  - Evidence: none of these files are imported:
    - `components/sections/{faq-accordion,feature-showcase,phone-showcase}.tsx`;
    - `components/demo/interactive-phone-demo.tsx`, `interactive-phone-demo-v2.tsx` and `demo-screen.tsx`, which are only reachable from those sections;
    - `ui/iphone-frame.tsx`, `ui/badge.tsx` and `ui/table.tsx`;
    - `donor/page-placeholder.tsx`;
    - `layout/dashboard-layout.tsx` and `layout/sidebar.tsx`;
    - `lib/mock-data.ts`, so mock data does **not** leak into production pages.
  - Fix: delete them, or revive `badge.tsx` and `table.tsx` as the canonical primitives from B4-02.

### B5. Alignment, proximity and visual hierarchy

- [ ] **B5-01 · Medium · 14 portal pages have no `h1`, and headers use five different patterns** · 🔍 Code-verified
  - Evidence: these pages have no `h1`, and start at a panel `h2` (`portal-ui.tsx:51`) or `<h2 className="text-sm">`:
    - donor: appointments, history, notifications, availability, profile, resources;
    - hospital: analytics, appointments, emergencies, inventory, notifications, requests, staff;
    - admin: settings.

    The header patterns in use are: the welcome banner, the hospital identity block, the undefined `portal-page-title`, a panel plus Tailwind `h1`, and the messaging aside.
  - Fix: `<PageHeader title description actions />` on every route.
  - Done when: each route renders exactly one `h1`, checked with an axe `page-has-heading-one` test.

- [ ] **B5-02 · Medium · The same data is presented differently in each portal, and status colours are misleading** · 🔍 Code-verified
  - Evidence: a blood request renders in four ways:
    - `RequestCard` with a `StatusPill` (`portal-ui.tsx:98-155`);
    - the notification-centre card in Tailwind, with urgency as plain text (`notification-center.tsx:139-160`);
    - the hospital emergencies page as red text `{urgency} · {status}` (`hospital/emergencies/page.tsx:93-94`);
    - admin pages as plain capitalised text.

    `StatusPill` (`portal-ui.tsx:28-33`) maps only five statuses to green and five to red. Everything else, including `fulfilled`, `available`, `declined`, `quarantined` and `no_show`, falls back to **amber**, the same as `pending`. A fulfilled request looks like a pending one.
  - Fix:
    - One `StatusBadge` with an exhaustive status-to-tone map covering every enum in `frontend/services/`. Type it so a new status fails `tsc`.
    - One `BloodRequestSummary` component used by donor, hospital and admin views.

- [ ] **B5-03 · Low · Admin overview "stat" cards hold text, not numbers** · 🔍 Code-verified
  - Evidence: the cards show values `'Review directory'` and `'Manage access'` and are non-clickable `div`s (`app/admin/page.tsx`).
  - Fix: show real counts (pending verifications, active hospitals, donors), and make each card a link.

### B6. Responsive behaviour and accessibility

- [ ] **B6-01 · High · Admin navigation is unreachable below 1024 px** · 🔍 Code-verified
  - Evidence: the admin sidebar is `hidden w-72 … lg:block` (`components/admin/admin-shell.tsx`). The header has no menu button and there is no bottom nav, so on a phone or tablet an admin cannot navigate.
  - Fix: covered by B4-01, since the shared shell already has a drawer and bottom nav.

- [ ] **B6-02 · Medium · Stock level is shown by colour alone** · 🔍 Code-verified
  - Evidence: the inventory tiles distinguish "low" from "normal" only by bar colour, with a separate legend (`components/portal/inventory-overview.tsx:36-56`, `:61-74`).
  - Fix: print the level ("Low", "Critical") on each tile, next to the colour.

- [ ] **B6-03 · Medium · Form accessibility gaps on auth and admin** · 🔍 Code-verified
  - Evidence:
    - Auth pages have no `aria-describedby` and no `role="alert"`. Field errors are bare `<p class="text-xs text-red-600">` (`app/auth/login/page.tsx:164`, `:178`, `:180`).
    - `ui/Input` uses `outline-none focus:border-fluid-700` (`components/ui/input.tsx:14`), a colour-only focus state. The global `:focus-visible` rules apply only inside `.portal-shell` and `.public-site` (`portal.css:19`, `public.css:10`).
    - In the admin verification list the filter `<select>` has no label and the search input relies on a placeholder. The review `<textarea>` is unlabelled.
    - `<Link><Button>` nests a button inside an anchor (`app/auth/page.tsx:17-19`, `:27-29`).

    `hospital/requests/page.tsx:148-153` does this correctly and is the model to copy.
  - Fix: a shared `Field` component (label, hint, error, `aria-describedby`, `aria-invalid`) and a global focus ring.

- [ ] **B6-04 · Low · Four breakpoint systems** · 📏 Measured
  - Evidence: `portal.css` uses 1250/1023/640. `public.css` uses 1500/1150/960/961/640/360. `location.css` uses 600. Tailwind uses 640/768/1024.
  - Fix: use Tailwind breakpoints only (B0).

Done well, keep these: `prefers-reduced-motion` handling in all four stylesheets, skip links on the landing pages, `next/image` with alt text everywhere (no raw `<img>`), and native `<dialog>` for portal dialogs.

### B7. Copy and microcopy

- [ ] **B7-01 · Medium · Broken characters are visible: "?" where "→" was intended** · 🔍 Code-verified
  - Evidence:
    - "Open live emergency coordination ?" (`app/hospital/page.tsx:58`);
    - "Map, radius & location settings ?" (`app/donor/requests/page.tsx:163`);
    - the tooltip `Notifications ? ${liveStatus}` (`components/portal/portal-shell.tsx:305`).

    `hospital/emergencies/page.tsx:175` renders "→" correctly, which confirms the intent.
  - Fix: restore the arrow, or use an icon component, and save files as UTF-8.

- [ ] **B7-02 · Medium · The words for signing in and out are inconsistent** · 🔍 Code-verified
  - Evidence: "Sign In" (`components/layout/navbar.tsx:41`), "Login" as the h1 with a "Sign in" button (`app/auth/login/page.tsx:147`, `:189`), "Already have an account? Login" (`app/auth/page.tsx:36`), "Logout" (`portal-shell.tsx:204`, admin shell) and "Sign out" (`app/donor/profile/page.tsx:82`).
  - Fix: use "Sign in", "Sign out" and "Create account" everywhere.

- [ ] **B7-03 · Medium · One concept has several names** · 🔍 Code-verified
  - Evidence:
    - The nav item "Blood Requests" (`portal-shell.tsx:49`) opens a page titled "Hospital Invitations" (`app/donor/requests/page.tsx:116`).
    - Emergencies are called "Emergency Coordination", "Emergency invitations near you" (`notification-center.tsx:58`) and "emergency requests".
    - Location is "Location & Nearby", "Location & nearby care" and "Facility Location".
    - Heading case is mixed: "Hospitals Identify Blood Needs." (`app/page.tsx:19`) vs sentence case elsewhere.
  - Fix: write a short glossary in `docs/` (Request, Invitation, Response, Appointment, Unit) and apply it to nav, headings and buttons. Use sentence case throughout.

- [ ] **B7-04 · Medium · Internal states and raw enum values are shown to users** · 🔍 Code-verified
  - Evidence:
    - Transport states "Connecting", "Live", "Polling · reconnecting" and "Offline · retrying" are announced in a `role="status"` region (`portal-shell.tsx:295-300`).
    - "External delivery: sms: 3 sent" (`hospital/emergencies/page.tsx:146-149`).
    - `replaceAll('_',' ')` is used 44 times across 15 files to print enums directly, for example the lowercase role "hospital admin".
    - "Availability unavailable" (`app/donor/availability/page.tsx:44`).
    - Unpluralised "1 units" (`emergencies/page.tsx:90`, `notification-center.tsx:152`).
  - Fix:
    - Add a `labels.ts` map from enum to display string, and a `pluralize()` helper.
    - Show connection state only when the stream is degraded, as plain language: "Live updates paused — reconnecting".

- [ ] **B7-05 · Medium · The role chosen on `/auth` is lost on the registration form** · 🔍 Code-verified
  - Evidence: `/auth` links to `/auth/register?type=donor|hospital` (`app/auth/page.tsx:17`, `:27`), but the register page reads `get("role")` (`app/auth/register/page.tsx:56`).
  - Fix: use one parameter name.
  - Done when: choosing "Hospital" on `/auth` pre-selects the hospital form.

### B8. Frontend code health that affects UX and latency

- [ ] **B8-01 · High · The data hook has no cache or de-duplication, and polls per component** · 🔍 Code-verified
  - Evidence:
    - `frontend/hooks/use-portal-query.ts:7`, `:43`: every instance polls every 15 s, refetches on both `visibilitychange` **and** `focus`, so it fires twice when a tab is refocused (`:46-50`), and refetches on every live event.
    - The shell also refreshes on every route change (`portal-shell.tsx:112-115`).
    - The hospital overview issues about 38 requests a minute, and the hospital profile is fetched by both the shell and the page.
    - Changing the loader resets data to `null` (`:38-42`), and search inputs are not debounced, so **every keystroke shows a skeleton and fires a request** (`hospital/requests/page.tsx:274` → `:316`, `hospital/inventory/page.tsx:442` → `:507`).
  - Fix:
    - Adopt TanStack Query or SWR, with a shared cache, de-duplication, `keepPreviousData` and stale-while-revalidate.
    - Debounce search inputs by 300 ms.
    - Stop interval polling while the live stream is connected (pairs with A4-01).
  - Done when: an idle hospital overview makes zero requests per minute while live, and typing in search does not flash the skeleton.

- [ ] **B8-02 · Medium · Minified source files and very large page components** · 📏 Measured
  - Evidence:
    - All 8 admin pages and `admin-shell.tsx` are committed as single minified lines; `app/admin/page.tsx` is 2,074 characters on 1 line. They cannot be reviewed or diffed.
    - `app/hospital/inventory/page.tsx` is 1,176 lines with 33 `useState` calls, `hospital/requests/page.tsx` is 729 lines, and `components/portal/appointments-page.tsx` is 821.
  - Fix: run Prettier on the admin files in one commit. Split the large pages into feature components (filters, table, detail drawer, action dialogs) with a reducer or form library.

- [ ] **B8-03 · Medium · Failed requests are shown as empty states** · 🔍 Code-verified
  - Evidence: admin fetches have no `.catch` (`app/admin/page.tsx`, `app/admin/donors/page.tsx`), so an API failure reads as "No pending submissions" or "No donors".
  - Fix: use a shared error state with a retry button, which the query library from B8-01 provides.

- [ ] **B8-04 · High · Frontend dependencies carry known vulnerabilities** · 📏 Measured (`npm ci` output)
  - Evidence: `npm ci` reported **19 vulnerabilities (1 critical, 14 high, 4 moderate)** and flagged `next@14.2.5` as having a security vulnerability.
  - Fix: `npm audit`. Upgrade `next` to the latest 14.2.x patch at minimum, then re-run `tsc`, lint and build. Enable Dependabot.
  - Done when: `npm audit --omit=dev` reports no high or critical issues.

- [ ] **B8-05 · Low · App Router features are unused** · 🔍 Code-verified
  - Evidence:
    - There are no `error.tsx` or `not-found.tsx` files.
    - The only `loading.tsx` is the root one, which does not match `PortalSkeleton`.
    - Only `/`, `/about` and `/contact` export `metadata`, so every auth and portal tab is titled "FLUID".
    - `'use client'` is set on trivial wrapper pages (`app/hospital/analytics/page.tsx:1`, `app/donor/notifications/page.tsx:1`).
  - Fix: add route-level `error.tsx`, `not-found.tsx` and portal `loading.tsx`, and add a `metadata.title` per route.

- [ ] **B8-06 · Low · The API base URL falls back to a hard-coded localhost** · 🔍 Code-verified
  - Evidence: `frontend/hooks/use-live-notifications.ts:38` falls back to `http://127.0.0.1:8000`.
  - Fix: fail the build when `NEXT_PUBLIC_API_URL` is unset in production.

Token storage and CSP are tracked in **A2-03**.

---

## Phase 2 — Features failing or not well implemented

The same findings grouped by feature, plus feature-level gaps that are not purely technical. Work through this phase feature by feature after the Critical and High items in Phase 1.

### P2-A. Hospital onboarding, verification and staff

- [ ] Fix the cross-tenant invite and consent problem → **A2-01**
- [ ] Fix the last-admin write skew → **A1-01**
- [ ] Fix duplicate pending verifications → **A1-02**
- [ ] Fix verification decision races and the missing state machine → **A1-03**
- [ ] Enforce one active membership per user → **A1-04**
- [ ] **P2-02 · Medium · Hospital staff cannot open their own hospital's verification documents** · 🔍 Code-verified
  - Evidence: `_authorized_document` allows access only when `HospitalProfile.user_id == current_user.id`, that is, the registering account (`verifications.py:101-107`). Other `hospital_admin` members get 403.
  - Fix: authorize through an active `hospital_admin` membership of `document.hospital_profile_id`.
- [ ] **P2-03 · Medium · Private messages notify only the hospital's original account, not the staff** · 🔍 Code-verified
  - Evidence: `send_message` sets `recipient = … hospital.user_id` (`backend/app/api/v1/endpoints/messages.py:96`). Coordinators who actually handle the request never get a notification.
  - Fix: notify active `hospital_admin`, `blood_bank_manager` and `hospital_staff` members, using the same query as `hospital_notice` (`emergency_alerts.py:33-39`).

### P2-B. Blood requests, matching and alerts

- [ ] Stop running expiry on read paths → **A1-06**
- [ ] Make fan-out O(1) in queries → **A4-02**, **A4-03**
- [ ] Make compatible-request listing SQL-filtered → **A4-06**
- [ ] **P2-04 · Medium · Eligibility rules disagree between screens** · 🔍 Code-verified
  - Evidence: `is_donor_eligible()` (`backend/app/services/blood_matching.py:85-93`) returns **False** when the date of birth is unknown. Matching's `exclusion_reasons()` (`:37-66`) **allows** an unknown date of birth and flags it for screening. The donor profile shows "not eligible" (`profiles.py:34`) while the same donor receives matches and alerts.
  - Fix: derive the profile badge from `exclusion_reasons()`, as one source of truth, and show "Eligibility to be confirmed at screening" for unknown fields.
- [ ] **P2-05 · Medium · Search radius is validated three different ways** · 🔍 Code-verified
  - Evidence:
    - `DonorProfileUpdate.preferred_radius_km` accepts 1–500 (`backend/app/schemas/profile.py:68`).
    - `PATCH /locations/radius` accepts only {5, 10, 25, 50, 100} (`locations.py:106`).
    - Matching never looks beyond 100 km (`intelligent_matching.py:58`).

    A donor who saves 300 km in the profile form sees it accepted but never matched beyond 100 km.
  - Fix: use one `Radius = Literal[5, 10, 25, 50, 100]` type in both schemas.
- [ ] **P2-06 · Low · The donor response status naming is confusing** · 🔍 Code-verified
  - Evidence: a donor "accept" is stored as `pending` (`donor_matches.py:107`). The hospital's accept stores `accepted` (`:142`). Readers of the data and analytics cannot tell "donor interested" from "hospital approved" without reading the code.
  - Fix: rename to explicit states (`donor_interested`, `hospital_accepted`, …) with a migration, or at least document the state machine in `docs/REQUEST_PUBLISHING.md`.

### P2-C. Appointments

- [ ] Remove locks from appointment GETs → **A1-07**
- [ ] Reduce the occupancy write amplification → **A4-11**
- [ ] **P2-07 · Medium · Checked-in appointments are left open when their request closes** · 🔍 Code-verified
  - Evidence: `close_for_request()` cancels only `pending` and `confirmed` appointments (`appointment_scheduling.py:126-132`). A `checked_in` appointment on a cancelled or expired request keeps its occupancy rows and stays "active" (`ACTIVE` includes `checked_in`, `:12`).
  - Fix: decide the clinical rule (most likely: allow completion of an in-progress donation, but flag it), and implement it explicitly, with a test.

### P2-D. Inventory

- [ ] Make reconcile incremental → **A4-05**
- [ ] Retire the dual inventory model → **A5-06**

### P2-E. Notifications and live updates

- [ ] Replace the SSE polling design → **A4-01**
- [ ] Fix the notifications-list N+1 → **A4-04**
- [ ] Share the SSE connection cap → **A3-03**

### P2-F. Profiles and location

- [ ] **P2-08 · High · Full-replacement `PUT` silently resets omitted fields** · 🔍 Code-verified
  - Evidence: `DonorProfileUpdate` gives defaults to fields the user may never have touched:
    - `is_available=False`
    - `preferred_radius_km=25`
    - `notify_email_alerts=False`
    - `notify_urgent_requests=True`
    - `country="Ghana"`

    These are all in `schemas/profile.py:57-81`, and the handler copies every field (`profiles.py:85-88`). `HospitalProfileUpdate.has_blood_bank` defaults to `False` (`schemas/profile.py:144`). Any client that sends a partial body, such as an older frontend, a mobile app or a script, will switch a donor to unavailable or disable a blood bank (which then blocks inventory intake, `inventory_units.py:119`).
  - Fix: use `PATCH` semantics with `model_dump(exclude_unset=True)`, or make these fields required with no defaults.
  - Done when: a request that omits `is_available` leaves it unchanged.
- [ ] Fix the verification and location race → **A1-03**
- [ ] Add optimistic versioning on profile forms → **A1-10**

### P2-G. Deployment and operations

- [ ] **P2-01 · High · In Docker, alerts, reminders, inventory monitoring and expiry never run** → **A6-05**
- [ ] **P2-09 · Medium · There is no observability for the worker** · 🔍 Code-verified
  - Evidence: `run_alert_worker.py:20-21` logs exceptions only. There is no heartbeat, queue depth or last-tick timestamp, so a dead worker is invisible until donors miss alerts.
  - Fix: write a `worker_heartbeats` row, or expose the last tick on `/health`, and alert when it is older than 60 s.
- [ ] **P2-10 · Medium · Synchronous email in the verification flow** → **A4-08**
- [ ] **P2-11 · Low · Clean the repository and image** → **A6-01**, **A6-04**, **A6-07**

---

## Phase 3 — Verification gates

Tick these when the corresponding Phase 1 and 2 work lands. They are what makes the fixes stay fixed.

- [ ] CI runs backend tests against PostgreSQL, Python lint and format, Alembic upgrade and check, and frontend type-check, lint and build (A6-02).
- [ ] Concurrency regression tests exist for A1-01, A1-02, A1-03, A1-04 and A1-05, using the existing `asyncio.gather` and independent-session pattern from `backend/tests/test_auth.py:205-221`.
- [ ] Query-count assertions exist for every endpoint in A4-04 and A4-06.
- [ ] A load smoke test (k6 or Locust) covers login, request list, notifications list and the SSE stream with 200 virtual users, and records p95 latency before and after the A4 work.
- [ ] Playwright journeys cover login, publishing, invitation response, booking, multi-tab refresh (A1-09) and mobile widths. These are the browser journeys listed as outstanding in `docs/SYSTEM_AUDIT_PROGRESS.md`.
- [ ] Automated accessibility checks (axe) run in Playwright, with a contrast budget from Part B.

---

## Appendix — Method and evidence

- **Code reading:** every backend endpoint, service, model, schema and migration on `2408123` was read, together with the frontend API client, token storage, live-notification hook, styles, layouts and portal pages. Line numbers refer to that commit.
- **Test suite:** backend `pytest` against PostgreSQL 16, in a disposable cluster with a schema per test as `tests/conftest.py` does. Result: **111 passed in 119.7 s**, after installing `greenlet` manually (A4-07).
- **Race reproductions** (🧪 items): four throwaway tests used the same independent-session `asyncio.gather` pattern as `test_auth.py:205-221`. They ran against the same PostgreSQL 16 setup. Observed output:
  - `test_invite_moves_other_hospital_admin_without_consent` → `invite status 201 · memberships left on B own hospital: 0`
  - `test_concurrent_admin_deactivation_leaves_no_admin` → `statuses [200, 200] active admins 0`
  - `test_concurrent_verification_submissions` → `statuses [201, 201] pending rows 2 third submit -> MultipleResultsFound`
  - `test_concurrent_duplicate_registration` → `results [201, 'IntegrityError']`

  They were not committed, because they assert the *buggy* behaviour. Turn each into a regression test that asserts the *fixed* behaviour as part of the Phase 3 gate.
- **What was not tested:** real SMTP or SMS delivery, a physical mobile GPS device, production HTTPS or a proxy, and multi-worker uvicorn under load. The per-process findings in A3 follow from the code, not from a multi-worker run.
- This audit complements `docs/SYSTEM_AUDIT_PROGRESS.md` (2026-10-18/19). Where they overlap (rate limiting, consent-based staff onboarding, browser testing), this file is the actionable tracker.
