import pytest
from pydantic import ValidationError
from app.core.config import Settings


def config(**changes):
    return Settings(_env_file=None, ENVIRONMENT="production", JWT_SECRET_KEY="x" * 48,
                    **changes)


def test_deployed_configuration_accepts_explicit_secure_settings():
    assert config(APP_DEBUG=False, CORS_ORIGINS=["https://fluid.example"]).ENVIRONMENT == "production"


@pytest.mark.parametrize("environment", ["production", "staging"])
def test_deployed_configuration_rejects_default_secret(environment):
    with pytest.raises(ValidationError, match="unique JWT secret"):
        Settings(_env_file=None, ENVIRONMENT=environment, JWT_SECRET_KEY="change-me-super-secret-key")


@pytest.mark.parametrize("changes", [{"APP_DEBUG": True}, {"CORS_ORIGINS": ["*"]}])
def test_deployed_configuration_rejects_debug_and_wildcard_cors(changes):
    with pytest.raises(ValidationError):
        config(**changes)
