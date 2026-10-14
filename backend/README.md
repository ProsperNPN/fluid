# Backend

FLUID backend is a FastAPI scaffold with PostgreSQL connectivity, CORS, JWT/password security utilities, and a versioned health endpoint at `/api/v1/health`.

The backend reads the repository root `.env` file, and Alembic migration scaffolding is included under `backend/alembic/`.

For JWT auth groundwork, configure at least:

- `JWT_SECRET_KEY`
- `JWT_ALGORITHM`
- `ACCESS_TOKEN_EXPIRE_MINUTES`
- `REFRESH_TOKEN_EXPIRE_DAYS`

Auth endpoints:

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`
- `GET /api/v1/users/me`

Protected starter endpoints:

- `GET /api/v1/protected/profile` (authenticated)
- `GET /api/v1/protected/admin/audit` (superuser only)

Security hardening middleware adds baseline headers, disables caching on auth responses, and rejects oversized authorization headers.

## Run locally

```bash
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt

# Run migrations
alembic upgrade head

# Start development server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## Run tests

```bash
cd backend
pytest

# Run with coverage
pytest --cov=app
```

## Run with Docker

From the project root:

```bash
docker-compose up --build

# Migrations run automatically on backend container startup
```

## Super Admin bootstrap and recovery

Public registration only accepts donor and hospital roles. Create the single initial
Super Admin from the backend directory with:

```powershell
python -m app.scripts.create_super_admin
```

The command privately prompts for full name, email, password, and password
confirmation. It refuses to create another account when a Super Admin already
exists. Sign in through `/auth/login`; the account is redirected to `/admin`.

Reset the Super Admin password without placing it in source code, environment
files, command history, or logs:

```powershell
python -m app.scripts.reset_super_admin_password
```

The reset command prompts privately for the new password and confirmation and
records the action in the audit log.

Hospital verification documents are stored under `VERIFICATION_UPLOAD_DIR`, which
must remain private and must not be served as a static directory. Access is only
through authenticated hospital-verification endpoints. Configure notification
delivery with the `ADMIN_VERIFICATION_EMAIL` and `SMTP_*` environment variables.

Portal workflows, clinical configuration, permissions and local setup: [Portal implementation](../docs/PORTAL_IMPLEMENTATION.md).
