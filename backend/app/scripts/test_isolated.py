"""Run pytest in a disposable, separate local PostgreSQL database.

Usage from backend: python -m app.scripts.test_isolated [pytest arguments]
The local development role must have CREATEDB. Existing application data is untouched.
"""
import asyncio
import os
import subprocess
import sys
from uuid import uuid4
import asyncpg
from sqlalchemy.engine import make_url
from app.core.config import settings


async def main():
    base = make_url(settings.DATABASE_URL)
    if settings.ENVIRONMENT != "development" or base.host not in {"localhost", "127.0.0.1", "::1"}:
        raise RuntimeError("Disposable database runner requires local development PostgreSQL")
    name = "fluid_notification_qa_" + uuid4().hex
    connection = await asyncpg.connect(user=base.username, password=base.password,
        host=base.host, port=base.port or 5432, database=base.database)
    created = False
    try:
        await connection.execute(f'CREATE DATABASE "{name}"')
        created = True
        print("Created disposable QA database", name, flush=True)
        env = {**os.environ, "DATABASE_URL": base.set(database=name).render_as_string(hide_password=False)}
        result = await asyncio.to_thread(subprocess.run,
            [sys.executable, "-m", "pytest", *(sys.argv[1:] or ["-q"])], env=env)
        return result.returncode
    finally:
        if created:
            assert name.startswith("fluid_notification_qa_") and len(name) == 54
            await connection.execute(f'DROP DATABASE "{name}" WITH (FORCE)')
            print("Removed owned QA database", name, flush=True)
        await connection.close()


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
