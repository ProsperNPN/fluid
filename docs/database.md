# Database

FLUID uses PostgreSQL.

## Initial Notes
- The backend reads the repository root `.env` file for configuration
- `DATABASE_URL` is used by the async SQLAlchemy runtime
- Alembic is scaffolded under `backend/alembic/` and uses a synchronous PostgreSQL driver for migrations
- The first commit does not include production tables yet
