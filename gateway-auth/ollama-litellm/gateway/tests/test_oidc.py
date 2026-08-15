import sys
import time
from pathlib import Path

import httpx
import pytest
import respx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.oidc import (
    Identity,
    JWKSCache,
    JWKSUnavailable,
    TokenForbidden,
    TokenValidationError,
    verify_jwt,
)
from oidc_helpers import build_jwks, generate_rsa_keypair, make_token

JWKS_URL = "https://auth.example.com/application/o/claude-desktop/jwks/"
ISSUER = "https://auth.example.com/application/o/claude-desktop/"
AUDIENCE = "ai-gateway"
ALLOWED = {"claude-users", "claude-admins"}
DENIED = {"claude-suspended"}


@pytest.fixture(scope="module")
def private_key():
    return generate_rsa_keypair()


async def _verify(token: str, jwks_cache: JWKSCache) -> Identity:
    return await verify_jwt(
        token,
        issuer=ISSUER,
        audience=AUDIENCE,
        allowed_groups=ALLOWED,
        denied_groups=DENIED,
        jwks_cache=jwks_cache,
    )


@respx.mock
async def test_valid_token_with_claude_users_group_is_authorized(private_key):
    respx.get(JWKS_URL).mock(return_value=httpx.Response(200, json=build_jwks(private_key)))
    token = make_token(private_key, groups=["claude-users"])
    cache = JWKSCache(httpx.AsyncClient(), JWKS_URL, 3600)

    identity = await _verify(token, cache)

    assert identity == Identity(sub="user-123", username="alice", groups=["claude-users"])


@respx.mock
async def test_valid_token_with_claude_admins_group_is_authorized(private_key):
    respx.get(JWKS_URL).mock(return_value=httpx.Response(200, json=build_jwks(private_key)))
    token = make_token(private_key, groups=["claude-admins"])
    cache = JWKSCache(httpx.AsyncClient(), JWKS_URL, 3600)

    identity = await _verify(token, cache)

    assert identity.groups == ["claude-admins"]


@respx.mock
async def test_expired_token_is_rejected(private_key):
    respx.get(JWKS_URL).mock(return_value=httpx.Response(200, json=build_jwks(private_key)))
    now = int(time.time())
    token = make_token(private_key, iat=now - 1000, exp=now - 100)
    cache = JWKSCache(httpx.AsyncClient(), JWKS_URL, 3600)

    with pytest.raises(TokenValidationError):
        await _verify(token, cache)


@respx.mock
async def test_wrong_audience_is_rejected(private_key):
    respx.get(JWKS_URL).mock(return_value=httpx.Response(200, json=build_jwks(private_key)))
    token = make_token(private_key, aud="some-other-service")
    cache = JWKSCache(httpx.AsyncClient(), JWKS_URL, 3600)

    with pytest.raises(TokenValidationError):
        await _verify(token, cache)


@respx.mock
async def test_wrong_issuer_is_rejected(private_key):
    respx.get(JWKS_URL).mock(return_value=httpx.Response(200, json=build_jwks(private_key)))
    token = make_token(private_key, iss="http://authentik-server:9000/application/o/claude-desktop/")
    cache = JWKSCache(httpx.AsyncClient(), JWKS_URL, 3600)

    with pytest.raises(TokenValidationError):
        await _verify(token, cache)


@respx.mock
async def test_token_signed_by_a_different_key_is_rejected():
    real_key = generate_rsa_keypair()
    attacker_key = generate_rsa_keypair()
    respx.get(JWKS_URL).mock(return_value=httpx.Response(200, json=build_jwks(real_key)))
    token = make_token(attacker_key)
    cache = JWKSCache(httpx.AsyncClient(), JWKS_URL, 3600)

    with pytest.raises(TokenValidationError):
        await _verify(token, cache)


@respx.mock
async def test_hs256_algorithm_confusion_is_rejected(private_key):
    import jwt as pyjwt

    respx.get(JWKS_URL).mock(return_value=httpx.Response(200, json=build_jwks(private_key)))
    # Attacker tries to sign with HS256 using the (public) RSA JWKS material as secret.
    forged = pyjwt.encode(
        {"iss": ISSUER, "aud": AUDIENCE, "sub": "user-123", "groups": ["claude-users"], "exp": int(time.time()) + 900},
        "any-guessed-secret",
        algorithm="HS256",
        headers={"kid": "test-kid"},
    )
    cache = JWKSCache(httpx.AsyncClient(), JWKS_URL, 3600)

    with pytest.raises(TokenValidationError):
        await _verify(forged, cache)


@respx.mock
async def test_suspended_group_is_forbidden_even_with_allowed_group(private_key):
    respx.get(JWKS_URL).mock(return_value=httpx.Response(200, json=build_jwks(private_key)))
    token = make_token(private_key, groups=["claude-users", "claude-suspended"])
    cache = JWKSCache(httpx.AsyncClient(), JWKS_URL, 3600)

    with pytest.raises(TokenForbidden):
        await _verify(token, cache)


@respx.mock
async def test_no_allowed_group_is_forbidden(private_key):
    respx.get(JWKS_URL).mock(return_value=httpx.Response(200, json=build_jwks(private_key)))
    token = make_token(private_key, groups=["some-other-group"])
    cache = JWKSCache(httpx.AsyncClient(), JWKS_URL, 3600)

    with pytest.raises(TokenForbidden):
        await _verify(token, cache)


@respx.mock
async def test_missing_groups_claim_is_forbidden(private_key):
    respx.get(JWKS_URL).mock(return_value=httpx.Response(200, json=build_jwks(private_key)))
    token = make_token(private_key, groups=None)
    cache = JWKSCache(httpx.AsyncClient(), JWKS_URL, 3600)

    with pytest.raises(TokenForbidden):
        await _verify(token, cache)


@respx.mock
async def test_unknown_kid_triggers_refetch_and_finds_rotated_key(private_key):
    old_key = generate_rsa_keypair()
    jwks_route = respx.get(JWKS_URL).mock(return_value=httpx.Response(200, json=build_jwks(private_key, kid="new-kid")))
    cache = JWKSCache(httpx.AsyncClient(), JWKS_URL, 3600)
    # Pre-seed the cache with an old key under a different kid, not expired.
    cache._keys = {"old-kid": None}
    cache._fetched_at = time.monotonic()

    token = make_token(private_key, kid="new-kid")
    identity = await _verify(token, cache)

    assert identity.sub == "user-123"
    assert jwks_route.called


@respx.mock
async def test_jwks_down_with_no_cache_raises_unavailable():
    respx.get(JWKS_URL).mock(side_effect=httpx.ConnectError("refused"))
    cache = JWKSCache(httpx.AsyncClient(), JWKS_URL, 3600)

    with pytest.raises(JWKSUnavailable):
        await cache.get_key("any-kid")


@respx.mock
async def test_jwks_down_with_stale_cache_still_serves_known_key(private_key):
    respx.get(JWKS_URL).mock(side_effect=httpx.ConnectError("refused"))
    cache = JWKSCache(httpx.AsyncClient(), JWKS_URL, ttl_seconds=1)
    from jwt import PyJWK

    jwk = PyJWK.from_dict(build_jwks(private_key)["keys"][0], algorithm="RS256")
    cache._keys = {"test-kid": jwk}
    cache._fetched_at = time.monotonic() - 10  # expired relative to ttl_seconds=1

    key = await cache.get_key("test-kid")

    assert key is jwk
