import pytest

from app.scripts.approve_local_test_hospital import require_local_development


@pytest.mark.parametrize("environment,url", [
    ("production", "postgresql+asyncpg://user:password@localhost/fluid_db"),
    ("development", "postgresql+asyncpg://user:password@production.example/fluid_db"),
    ("development", "postgresql+asyncpg://user:password@localhost/production"),
    ("test", "postgresql+asyncpg://user:password@localhost/fluid_db"),
])
def test_local_approval_rejects_other_environments(environment, url):
    with pytest.raises(RuntimeError):
        require_local_development(environment, url)


def test_local_approval_accepts_only_expected_development_database():
    require_local_development("development", "postgresql+asyncpg://user:password@127.0.0.1/fluid_db")
