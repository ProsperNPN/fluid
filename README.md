# FLUID Monorepo (Scaffold)

FLUID is an intelligent blood donation platform connecting verified hospitals with eligible blood donors in real time.

This commit contains **project foundation only**:
- Next.js frontend scaffold (App Router, TypeScript, Tailwind, ESLint)
- FastAPI backend scaffold (config, DB setup, health endpoint, CORS)
- PostgreSQL local container setup
- Initial architecture and planning docs

## Monorepo Structure

- frontend/
- backend/
- docs/
- docker/
- .github/workflows/
- README.md
- .env.example
- .gitignore
- docker-compose.yml

## Quick Start

1) Copy env template:

```bash
Copy-Item .env.example .env
```

2) Start PostgreSQL:

```bash
docker-compose up -d
```

3) Run backend:

```bash
cd backend
python -m venv .venv
# Windows PowerShell
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

4) Run frontend:

```bash
cd frontend
npm install
npm run dev
```

- Frontend: http://localhost:3000
- Backend health: http://localhost:8000/health

## Scope Notes

- Authentication, blood request logic, matching, scheduling, notifications, and analytics are intentionally **not implemented yet**.
- Structure is organized for clean architecture and production scaling.
