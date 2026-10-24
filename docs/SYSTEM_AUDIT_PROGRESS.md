# FLUID system audit progress

Subsequent matching/notification/session repairs are recorded in [Notification isolation](NOTIFICATION_ISOLATION.md). In particular, access-token revocation and browser testing limitations below describe the earlier audit, not the current repaired session behavior.

Audit dates: 2026-10-18 to 2026-10-19. This is a resumable audit record, not production certification.

Source inventory: [pages, API declarations, models, services, migrations and configuration keys](SYSTEM_ROUTE_INVENTORY.md).

## Scope and preservation

The workspace contained extensive uncommitted implementation changes before this audit. Those changes were preserved. Confirmed stack: Next.js 14 App Router, React 18, TypeScript, FastAPI, SQLAlchemy async, PostgreSQL and Alembic. Existing routes cover donor/hospital/admin portals, authentication, verification, requests, matching, notifications/SSE, appointments, inventory units, analytics, messaging, staff and locations.

Tests create random, disposable PostgreSQL schemas and synthetic records. No application schemas were dropped, existing user records overwritten, or real emergency messages sent. Migration status is already `20261018_0016`, matching the repository head; no application migration was applied by this audit.

## Repairs made in this audit

1. Critical account takeover: unauthenticated forgot-password returned the raw recovery token for a supplied email. Removed token disclosure in all environments, connected the existing SMTP delivery service using a worker thread, and removed the frontend development-token panel. Existing reset page consumes the emailed token link. Known and unknown accounts retain the same response body. SMTP failure also returns the generic response without revealing account existence.
2. Refresh rotation race: two requests could both check an active refresh token before either revoked it. Require successful atomic conditional revocation before issuing replacement credentials; a losing transaction rolls back and returns 401.
3. Recovery consumption race: require successful atomic single-use reset-token update before committing a password change; a losing transaction rolls back and returns 400.
4. Added staging/production startup validation rejecting the example or short JWT secret, debug mode and wildcard CORS. Local development remains usable. Five configuration tests passed.
5. Added actual API/PostgreSQL regression tests for mailbox-only recovery, identical account lookup responses, single-use reset, old-password rejection, new-password login, refresh revocation, failed email delivery and concurrent refresh rotation.

No new endpoint or database column was required. Backend configuration now validates deployed security settings at startup. The forgot-password response retains the nullable `reset_token` property for compatibility but never populates it.

## Phase checklist and current evidence

| Phase | Status | Evidence / unfinished validation |
| --- | --- | --- |
| 1 Inspection | PARTIALLY WORKING | Enumerated source/routes, dependencies, configuration and tests; inspected priority services and integration paths. Full line-by-line review remains. |
| 2 Authentication | FIXED AND VERIFIED (targeted recovery); PARTIALLY WORKING overall | Registration, login, refresh/logout and recovery tests; rate limiting and immediate access-token revocation remain follow-up work. |
| 3 Verification / admin | PARTIALLY WORKING | Synthetic document upload and legitimate admin approval in journey test; local Prosper Nasangma account already verified (read-only check). Browser review/rejection/restart validation remains. |
| 4 Donor portal | PARTIALLY WORKING | Real profile, response, appointment and donation statistics exercised through API; every UI action not browser-tested. |
| 5 Hospital portal | PARTIALLY WORKING | Core request/response/appointment/inventory workflows and tenant checks exercised; full browser navigation remains. |
| 6 GPS / location | PARTIALLY WORKING | Location API tests present and run in full suite; physical mobile GPS, permission UI and real geocoding not exercised in this audit. |
| 7 Publishing | VERIFIED WORKING (API/PostgreSQL) | Saved-coordinate fallback, persisted retrieval using a fresh session, invalid quantities/deadlines/coordinates, drafts, permissions and repeated publication tests. Publish button browser test remains. |
| 8 Matching | VERIFIED WORKING (synthetic API/PostgreSQL) | Component filtering, radius/consent/exclusions/privacy, expansion, live recalculation and concurrent invitations. Clinical approval remains an external gate. |
| 9 Emergency alerts | VERIFIED WORKING (synthetic API/PostgreSQL) | Fanout, persistence, SSE catch-up, read state, consent, retries, terminal stop, concurrent workers; providers replaced in tests. Real delivery not tested. |
| 10 Donor responses | VERIFIED WORKING (API/PostgreSQL) | Invitation accept/decline, response persistence, hospital synchronization and duplicate prevention. Acceptance is separate from completed donation. |
| 11 Appointments | VERIFIED WORKING (synthetic API/PostgreSQL) | Proposal/confirmation, reschedule/capacity, concurrency, reminders, check-in, outcomes, timezone filters, cancellation and migration tests. |
| 12 Inventory | VERIFIED WORKING (synthetic API/PostgreSQL) | Quarantine/release/reserve/use, traceability, expiry/low stock, tenant checks, duplicate IDs, concurrent reservation and legacy preservation. Camera hardware untested. |
| 13 Analytics | PARTIALLY WORKING | Journey asserts real completed donations and total requests; every chart/filter calculation not independently audited. |
| 14 Messaging / staff | PARTIALLY WORKING | Journey asserts private history/unread state and unauthorized access; role enforcement tests exist. Staff invitation acceptance UX needs review. |
| 15 Responsive UI / accessibility | BLOCKED / NOT TESTED | No browser automation harness installed in frontend or backend environment; no new browser/contrast/mobile claims. |
| 16 API connections | PARTIALLY WORKING | Service/payload inspection and compile/build checks; actual HTTPS tunnel/CORS/mobile deployment not tested. |
| 17 Database integrity | PARTIALLY WORKING | Current Alembic head, isolated real PostgreSQL tests, concurrency and migration tests; full independent constraints/deletion audit remains. |
| 18 Security | PARTIALLY WORKING | Recovery disclosure and token reuse repairs; tenant/role/verification tests. Full deployment hardening remains. |
| 19 Regression | PARTIALLY WORKING | Backend suite and deployment configuration tests passed; frontend types/lint/build passed. Browser/component tests remain unexecuted. |
| 20 Final verification | PARTIALLY WORKING | Core API workflows covered; browser, external delivery, clinical and deployment review remain. |

## External requirements and follow-up

Observed local settings (no secret values printed): development environment; clinical policy disabled; SMTP not configured; external email/SMS alerts disabled; example JWT secret in use. Set a unique secret and explicitly set ENVIRONMENT=production in the deployed API process/container before public deployment; development defaults are not a deployment profile. Staging/production now refuse this example secret.


- Configure SMTP_HOST, SMTP_PORT, SMTP_FROM_EMAIL and any SMTP credentials with a safe test mailbox/provider; configure FRONTEND_URL to the trusted HTTPS frontend. Real email delivery was not attempted. Without SMTP configuration, recovery email cannot arrive; tokens are never exposed as a fallback.
- Matching remains fail-closed unless DONATION_POLICY_APPROVED is enabled after local clinical review. Tests override this only for synthetic data. Compatibility tables and screening policy still require qualified clinical approval; this audit does not provide it.
- Run the documented alert worker for delivery/reminders; verify deployment supervision, provider credentials and provider callbacks with a sandbox.
- Security follow-up: shared auth rate limiting, session/access-token invalidation on logout/password reset, browser token storage/XSS review and consent-based staff onboarding. Current access JWTs remain valid until expiry; refresh tokens are revoked on recovery.
- Run browser journeys A-H using disposable data, including Publish button, field errors/loading, role redirects, expiry, SSE reconnect, camera scanner, mobile widths, keyboard/contrast, GPS denial and real phone HTTPS. No installed Playwright package was found; cached browser binaries alone do not constitute a test harness. An offline `npm exec --package=@playwright/test -- playwright --version` attempt failed with ENOTCACHED. Install a browser runner in a network-enabled environment to continue.
- Review same-origin API proxy and production/tunnel configuration; do not expose development accounts or bypass flags publicly.
- Root README was updated with current module scope, correct versioned health URL, migration command, worker startup, recovery configuration and validation commands.

## Commands and results

- Baseline backend: `.venv/Scripts/python.exe -m pytest -q` - **91 passed in 309.82 seconds**.
- Targeted auth after recovery repair: **13 passed**; after refresh race test: **14 passed**. Final full backend regression including the reset race test: **95 passed in 274.62 seconds**. The five deployment-configuration tests were added afterward and passed in a separate targeted run; no combined 100-test run is claimed.
- Frontend: `npx.cmd tsc --noEmit` - passed; `npm.cmd run lint` - passed with no warnings/errors (also rerun after UI changes).
- Frontend: `npm.cmd run build` - passed, compiled and generated all pages (40 static generation tasks; route table includes a dynamic verification page). Webpack emitted nonfatal cache snapshot warnings.
- Initial PowerShell npm/npx launcher attempts were blocked by execution policy; `.cmd` launchers succeeded without changing execution policy.
- Alembic `current` and `heads` - both `20261018_0016`.
- Existing local hospital approval script dry-run - Prosper Nasangma is already `verified`; no approval was changed.
- Real local uvicorn startup and production Next.js startup - successful. HTTP GET health, OpenAPI (91 API paths), homepage, recovery page and hospital requests shell - all 200. These shell checks do not exercise browser hydration, authentication redirects or the Publish button. Temporary local server processes stopped after checks.
- Deployment configuration regression: **5 passed** (`tests/test_deployment_config.py`).
- `git diff --check` passed (Git emitted existing LF/CRLF normalization notices).
- No browser/component test harness executed; no real SMTP/SMS messages or external deployment performed.

Earlier documentation test counts are historical and are not evidence from this audit.
