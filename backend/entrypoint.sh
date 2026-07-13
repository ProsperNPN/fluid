#!/bin/bash
set -e

echo "Waiting for PostgreSQL to be ready..."
while ! pg_isready -h postgres -U "${POSTGRES_USER:-fluid_user}" -d "${POSTGRES_DB:-fluid_db}" -q; do
  sleep 1
done

echo "Running Alembic migrations..."
cd /app/backend
alembic upgrade head

echo "Starting FastAPI application..."
uvicorn app.main:app --host "${BACKEND_HOST:-0.0.0.0}" --port "${BACKEND_PORT:-8000}"
