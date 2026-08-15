import sys
from pathlib import Path

import httpx
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import Settings
from app.main import create_app


@pytest.fixture
def settings() -> Settings:
    return Settings(
        litellm_base_url="http://litellm:4000",
        litellm_master_key="sk-test",
        allow_all_domains=False,
        allowed_domains="github.com,api.github.com,medium.com",
        max_request_body_mb=100,
    )


@pytest.fixture
def app(settings: Settings):
    return create_app(settings)


@pytest.fixture
async def client(app):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://gateway.test") as test_client:
        yield test_client


@pytest.fixture
def auth_headers() -> dict[str, str]:
    return {"Authorization": "Bearer sk-test"}


@pytest.fixture
def oidc_settings() -> Settings:
    return Settings(
        litellm_base_url="http://litellm:4000",
        litellm_master_key="sk-test",
        oidc_enabled=True,
        oidc_issuer="https://auth.example.com/application/o/claude-desktop/",
        oidc_jwks_url="https://auth.example.com/application/o/claude-desktop/jwks/",
        oidc_audience="ai-gateway",
        oidc_allowed_groups="claude-users,claude-admins",
        oidc_denied_groups="claude-suspended",
    )


@pytest.fixture
def oidc_app(oidc_settings: Settings):
    return create_app(oidc_settings)


@pytest.fixture
async def oidc_client(oidc_app):
    transport = httpx.ASGITransport(app=oidc_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://gateway.test") as test_client:
        yield test_client
