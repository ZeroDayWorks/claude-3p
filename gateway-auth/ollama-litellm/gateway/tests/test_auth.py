import httpx
import respx

from app.auth import extract_bearer_token, is_authorized
from oidc_helpers import build_jwks, generate_rsa_keypair, make_token


async def test_domain_info_requires_token(client):
    response = await client.get("/api/web/domain_info?domain=github.com")

    assert response.status_code == 401


async def test_domain_info_rejects_wrong_token(client):
    response = await client.get(
        "/api/web/domain_info?domain=github.com",
        headers={"Authorization": "Bearer wrong"},
    )

    assert response.status_code == 401


def test_extract_bearer_token():
    assert extract_bearer_token("Bearer sk-test") == "sk-test"
    assert extract_bearer_token("Basic abc") is None
    assert extract_bearer_token(None) is None


def test_is_authorized_uses_expected_token(settings):
    assert is_authorized("Bearer sk-test", settings) is True
    assert is_authorized("Bearer wrong", settings) is False


@respx.mock
async def test_valid_jwt_with_allowed_group_is_authorized(oidc_client, oidc_settings):
    private_key = generate_rsa_keypair()
    respx.get(oidc_settings.oidc_jwks_url).mock(return_value=httpx.Response(200, json=build_jwks(private_key)))
    token = make_token(
        private_key,
        iss=oidc_settings.oidc_issuer,
        aud=oidc_settings.oidc_audience,
        groups=["claude-users"],
    )

    response = await oidc_client.get(
        "/api/web/domain_info?domain=github.com",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200


@respx.mock
async def test_master_key_still_works_when_oidc_enabled(oidc_client, oidc_settings):
    response = await oidc_client.get(
        "/api/web/domain_info?domain=github.com",
        headers={"Authorization": f"Bearer {oidc_settings.litellm_master_key}"},
    )

    assert response.status_code == 200


@respx.mock
async def test_suspended_group_returns_403(oidc_client, oidc_settings):
    private_key = generate_rsa_keypair()
    respx.get(oidc_settings.oidc_jwks_url).mock(return_value=httpx.Response(200, json=build_jwks(private_key)))
    token = make_token(
        private_key,
        iss=oidc_settings.oidc_issuer,
        aud=oidc_settings.oidc_audience,
        groups=["claude-users", "claude-suspended"],
    )

    response = await oidc_client.get(
        "/api/web/domain_info?domain=github.com",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 403


@respx.mock
async def test_expired_jwt_returns_401(oidc_client, oidc_settings):
    import time

    private_key = generate_rsa_keypair()
    respx.get(oidc_settings.oidc_jwks_url).mock(return_value=httpx.Response(200, json=build_jwks(private_key)))
    now = int(time.time())
    token = make_token(
        private_key,
        iss=oidc_settings.oidc_issuer,
        aud=oidc_settings.oidc_audience,
        iat=now - 1000,
        exp=now - 100,
    )

    response = await oidc_client.get(
        "/api/web/domain_info?domain=github.com",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 401
    assert response.headers.get("www-authenticate") == "Bearer"


@respx.mock
async def test_jwks_unreachable_returns_503(oidc_client, oidc_settings):
    private_key = generate_rsa_keypair()
    respx.get(oidc_settings.oidc_jwks_url).mock(side_effect=httpx.ConnectError("refused"))
    token = make_token(private_key, iss=oidc_settings.oidc_issuer, aud=oidc_settings.oidc_audience)

    response = await oidc_client.get(
        "/api/web/domain_info?domain=github.com",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 503


async def test_jwt_shaped_token_rejected_when_oidc_disabled(client):
    private_key = generate_rsa_keypair()
    token = make_token(private_key, iss="https://auth.example.com/application/o/claude-desktop/", aud="ai-gateway")

    response = await client.get(
        "/api/web/domain_info?domain=github.com",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 401
