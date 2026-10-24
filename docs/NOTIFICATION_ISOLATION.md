# Matching, private notifications and session isolation repair

Date: 2026-10-19. Existing account profiles, medical fields, preferences and consent were not overwritten.

## Root causes confirmed

A read-only inspection of the local development database found clinical matching disabled (`DONATION_POLICY_APPROVED=false`) and no donor profiles opted in to matching. Most donor profiles also lacked saved coordinates and a known blood group. A published request had valid facility coordinates. Being physically nearby cannot supply these missing saved settings or imply consent. Matching correctly fails closed; this repair does not approve a clinical policy, invent blood types or opt anyone in.

The UI previously reported publication success without explaining this global alert block. Donors could not see why no notifications were expected. Hospital publication now includes a matching notice, and donor notifications show account-specific readiness information.

Routine publication also only processed the first 100 candidates and lacked a durable recipient ledger. This was a separate reproducible reliability defect, now covered by a 101-recipient database regression test.

Server-side notification CRUD already filtered by authenticated `user_id`; no unrestricted notification list or cross-account database exposure was reproduced. The frontend, however, retained account-independent query data and could accept responses from an earlier session after tokens changed. The new account-switch browser regression deliberately delays an old authenticated response across logout/login to verify it cannot restore private cards.

## Repairs

- Preserve the existing `Notification.user_id` field as the mandatory, indexed recipient FK. It is the recipient identifier; renaming it would add migration risk without changing authorization.
- Add `RequestNotificationReceipt` with request/user FKs and a unique `(blood_request_id, user_id)` idempotency key. It survives notification deletion (`notification_id SET NULL`). Existing emergency fanout retains its unique request/donor ledger and transactional provider outbox.
- Process every page of routine matches, recheck the locked donor profile, and acquire donor locks in stable order. Request row locking serializes retries. History deletion does not permit another routine alert for the same request/recipient.
- Add nullable `sync_emitted_at`, `received_at`, and `read_at`. A user-scoped acknowledgement endpoint records receipt evidence without marking a notification read. Receipt writes preserve revision timestamps so acknowledgements cannot create endless SSE refresh loops.
- Mark notification responses `Cache-Control: no-store`. Read/unread, mark-all-read, delete, list, counts and acknowledgement all use the authenticated user. Caller-supplied account IDs never select ownership.
- Bind issued access tokens to their stored refresh session (`sid`). Every authenticated API request checks active session ownership. SSE also rechecks the session during its loop and stops after revocation; access expiry bounds the stream. Legacy access tokens refresh or require sign-in. Independent device sessions remain independent.
- Scope portal query state and auth state to a browser session generation. Clear/hide previous-session state on token/account change; discard in-flight results after changes; stop/reconnect SSE on session changes. Late refresh/logout work cannot overwrite a newer account's tokens.
- Deliver operational hospital alerts only to active memberships with operator roles. Removed the fallback to a former request/appointment owner who might no longer belong to that hospital.
- Share categorized referral exclusion rules between matching and diagnostics. Reject missing, nonfinite and out-of-range coordinates rather than treating an invalid distance as nearby. Existing component-specific clinical rules and explicit clinical-policy gate are preserved.
- Give Publish form controls stable accessible labels.

## Diagnostics and evidence

`GET /api/v1/donor-matches/readiness` is donor-only and reports that authenticated donor's missing setup, consent and availability requirements. It returns no other donor's information.

`GET /api/v1/blood-requests/{request_id}/notification-diagnostics` is available only in development to an authorized hospital administrator for that hospital's own request. It returns aggregate counts/reason codes, current evaluation, latest persisted execution/correlation ID, remaining history, sync-emission evidence, client acknowledgements, reads, and external attempt/failure/delivered counts. It never returns donor identifiers, coordinates, tokens or screening values. It is 404 outside development.

Publication persists `matching.evaluated` audit data, including zero matches and a blocked clinical policy. Counts may list more than one exclusion reason for a donor; do not add reason counts as if they were disjoint.

A created notification is durable history. `sync_emitted_at` records emission of a revision snapshot, not transport receipt of that card. `received_at` records the authenticated client's explicit acknowledgement after fetching history, not that a person read it. `read_at`/`is_read` reflect an explicit read operation. Provider acceptance is not confirmed external delivery; existing outbox/provider status remains separate. The SSE payload contains only an account-specific revision and unread count, not a global notification broadcast.

## Main files changed

| Area | Files |
| --- | --- |
| Matching and aggregate diagnostics | `backend/app/services/blood_matching.py`, `matching_diagnostics.py`; blood request and donor-match endpoints |
| Recipient integrity | `backend/app/models/notification.py`, model exports, notification schema, migration `20261019_0017` |
| Private delivery and receipts | notification endpoints, `notification_stream.py`, notification cache headers, `emergency_alerts.py`, appointment recipient selection |
| Revocable authentication | `backend/app/api/deps.py`, token payload schema, `auth_token_service.py` |
| Account-scoped client lifecycle | token storage, Axios client, auth/portal-query/live-notification hooks, logout service |
| UI and typed API responses | hospital request form/service, notification center/service, blood request response schema |
| QA and setup | `backend/tests/test_notification_isolation.py`, `browser_fixture.py`, disposable database runner, frontend Playwright config/spec, package/lockfile, isolated Next build directories |

## Database migration

`20261019_0017` is additive: three nullable evidence timestamps and a recipient ledger. It backfills the routine ledger from existing payload request references or existing request links, retaining all notification history, including historical duplicates. It does not delete user data. Up/down/backfill preservation is tested in a disposable schema. The upgrade was applied to local development and the backend restarted.

## Validation

- Initial targeted matching/emergency/auth regression: **42 passed**.
- Full regression in a separate disposable PostgreSQL database: **110 passed** before the extra migration test was added.
- Notification isolation and migration regression: **11 passed**.
- Final combined backend regression in a separate disposable database: **111 passed in 274.56 seconds**. The runner removed its owned database afterward.
- TypeScript and ESLint passed. Final production build passed after the accessible-label and error-state handling changes (all 40 static generation tasks). Nonfatal webpack cache snapshot warnings remained.
- Playwright/Chromium: **1 browser journey passed** (56.3 seconds). It uses the actual Publish button, real FastAPI/PostgreSQL, same-location donors, two active donor sessions with Live status, live alert display without refresh, donor acceptance, hospital response notification, a delayed old API response during cross-tab logout/login, cross-account read rejection, reload persistence and an independent second device's history.
- Initial browser attempts exposed an inaccessible exact field label and test locators that were ambiguous in accumulated synthetic history. Labels were fixed and assertions now identify the request's own card. Final successful run supersedes those failed attempts; they were not counted as passes.
- No actual external emergency emails/SMS were sent. Only synthetic QA profiles ran with policy approval overridden in the isolated test process. Clinical approval remains disabled in the normal local environment.

## Repeating automated tests

`backend/app/scripts/test_isolated.py` creates a randomly named database on a local development PostgreSQL server, passes that database to pytest, and removes only the database it created. It requires CREATEDB on the QA server. The existing application's role lacks that permission, so this session used a separate temporary PostgreSQL 16 instance bound only to localhost on port 25432. The application database role was not elevated. The tests still use disposable per-test schemas inside the separate QA database.

```powershell
# Use credentials for a separate LOCAL QA server with CREATEDB; never a production URL.
$env:DATABASE_URL = 'postgresql+asyncpg://QA_USER:QA_PASSWORD@127.0.0.1:25432/postgres'
.venv/Scripts/python.exe -m app.scripts.test_isolated -q
```

The browser fixture `backend/tests/browser_fixture.py` refuses databases whose names do not start `fluid_notification_browser_qa_`. It prepares only synthetic accounts. The browser frontend uses `NEXT_DIST_DIR=.next-qa` and a QA API URL so it cannot interfere with normal local preview build artifacts. `frontend/playwright.config.ts` supports `PLAYWRIGHT_EXECUTABLE_PATH` for an installed Chromium and `FLUID_QA_FRONTEND`/`FLUID_QA_API` for isolated local test servers. Run `npm.cmd run test:e2e` only against those prepared QA services. The test credentials are synthetic fixtures, not application account credentials.

## Remaining constraints

- Real existing-account publication-to-alert verification is blocked by clinical policy approval and donor consent. No profile, blood type, screening or consent was changed to force a match. Read-only inspection was completed; authenticated browser journeys used synthetic accounts rather than resetting real account passwords.
- Donors must explicitly choose availability/matching consent and save their accurate location and blood type. A qualified reviewer must approve the clinical policy before matching can be enabled. A nearby donor may still be excluded by component compatibility, screening policy or either radius.
- Real GPS hardware, actual provider delivery, and external deployment were not tested. Existing SMTP/SMS channels remain disabled/unconfigured locally.
- Package installation reported dependency vulnerabilities in the existing dependency graph. No forced unrelated framework upgrade was applied as part of this notification repair.

Final local smoke checks: backend health 200; unauthenticated notification state 401; frontend login 200; Alembic at `20261019_0017`. Normal frontend/backend remain running. The synthetic browser database and QA services were removed/stopped after testing.
