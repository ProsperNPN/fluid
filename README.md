# FLUID - The Living Connection

FLUID coordinates blood donation referrals between donors and verified hospitals. Matching indicates potential compatibility and requires clinical screening and confirmation.

The monorepo uses Next.js App Router, React, TypeScript and Tailwind in `frontend/`; FastAPI, async SQLAlchemy and Alembic in `backend/`; and PostgreSQL. Implemented modules include authentication, hospital verification, donor/hospital/admin portals, blood requests, consent-aware matching, notifications/SSE, appointments, inventory traceability, messaging, staff roles and analytics.

See [current audit evidence and unfinished checks](docs/SYSTEM_AUDIT_PROGRESS.md) before treating a module as verified. The source contains substantial implementation; this is no longer a foundation-only scaffold.

## Local setup (PowerShell)

Copy `.env.example` to `.env` and configure database credentials and a unique JWT secret. Start the database with `docker compose up -d postgres`. To use an existing database, configure DATABASE_URL instead; preserve existing data.

From `backend`:

```powershell
python -m venv .venv
.venv/Scripts/python.exe -m pip install -r requirements.txt
.venv/Scripts/python.exe -m alembic upgrade head
.venv/Scripts/python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

From `frontend`, copy its `.env.example` to `.env.local`, configure NEXT_PUBLIC_API_URL, then run:

```powershell
npm.cmd ci
npm.cmd run dev
```

Frontend: http://localhost:3000. API health: http://127.0.0.1:8000/api/v1/health. API schema: http://127.0.0.1:8000/docs.

Run the notification/appointment worker separately from `backend`:

```powershell
.venv/Scripts/python.exe -m app.scripts.run_alert_worker
```

Public registration supports donors and hospitals. Use the existing [Super Admin bootstrap instructions](backend/README.md) for privileged accounts. Operational hospital access requires verification. Matching remains disabled until a qualified reviewer approves the local clinical policy and DONATION_POLICY_APPROVED is explicitly configured. Do not enable external alert channels for synthetic tests against real accounts.

Password recovery sends instructions through the configured SMTP service and FRONTEND_URL. It never returns reset credentials to the requesting browser. Configure a safe test mailbox/provider to validate delivery.

## Validation

From `backend`: `.venv/Scripts/python.exe -m pytest -q`. Tests use disposable PostgreSQL schemas and require permission to create/drop their own schemas.

From `frontend`:

```powershell
npx.cmd tsc --noEmit
npm.cmd run lint
npm.cmd run build
```

See [publishing](docs/REQUEST_PUBLISHING.md), [matching](docs/INTELLIGENT_MATCHING.md), [alerts](docs/EMERGENCY_ALERTS.md), [appointments](docs/APPOINTMENT_SCHEDULING.md), [inventory](docs/SMART_INVENTORY.md) and [location](docs/LOCATION_SYSTEM.md) for module configuration. Historical validation claims in those documents must be distinguished from the current audit run.
