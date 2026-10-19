# Local hospital testing approval

The existing local account is named **Prosper Nasangma** (the request called it Prosper Nasama).

- User ID: `a7d5a517-172a-48c2-b156-fc09de69cb4f`
- Hospital profile ID: `29d37592-491e-43fc-918e-f225f8b5abda`
- Existing active role: `hospital_admin` (unchanged)
- Verification ID: `5ff14433-39b5-4424-8e47-58b9e0d5d346`
- Approval audit ID: `852ab245-edff-46e3-9ebc-e04af0344d26`

On October 16, 2026, the local `fluid_db` hospital profile changed from `incomplete` to `verified`. The existing Super Admin decision workflow recorded the corresponding verification review, audit event and in-app notification. The review note explicitly identifies this as development/testing approval without validated clinical documents. No external email was sent. No password, global permissions, clinical matching configuration or other account was changed.

The controlled script `backend/app/scripts/approve_local_test_hospital.py` targets these exact existing IDs. It refuses non-development environments, remote database hosts and databases other than `fluid_db`. It requires an existing active Super Admin reviewer and an existing active hospital administrator membership. It is not imported into an API router or called during startup, registration or migrations. Running it again after approval makes no additional changes.

From `backend`, inspect with:

```powershell
.venv/Scripts/python.exe -m app.scripts.approve_local_test_hospital
```

Explicitly apply only to the intended local testing database:

```powershell
.venv/Scripts/python.exe -m app.scripts.approve_local_test_hospital --apply
```

Sign in normally at http://localhost:3000/auth/login using the existing account credentials, then visit `/hospital`. Overview, Requests, Donor Matches, Appointments, Inventory, Analytics, Messages, Staff Management and Hospital Profile are available with the existing administrator role. Operational actions still enforce their normal data validation and clinical requirements. No additional Settings route was introduced; settings live in Hospital Profile.

Verification is read from PostgreSQL on authenticated requests, not embedded as a permanent JWT privilege. Existing valid sessions therefore see the new status without a password reset. The portal reloads its profile on navigation, periodic refresh, tab visibility and now window focus. Reload an already-open tab to fetch the status immediately. Approval survives logout/login and process restarts because it is stored in PostgreSQL. Editing facility identity later still invokes the existing re-verification rules.

Tests: the full 43-test backend suite includes production/remote-host guard rejection, authentication, unverified and cross-tenant restrictions, inventory concurrency and the request/appointment/message workflow. TypeScript and ESLint checks cover the window-focus refresh change. The real local approved account is also checked with an authenticated test session against hospital read APIs and browser routes; its password is neither read nor changed.

Local browser verification passed for all nine hospital pages listed above, with no verification blocker or page errors. Eleven authenticated read endpoints returned HTTP 200, including hospital-scoped appointments and administrator staff access. Token refresh, page reload and logout passed. Fresh Python processes confirmed the stored approval and idempotent script behavior. Actual password entry was not tested because the account password was not supplied; normal login behavior is covered by the isolated backend tests.
