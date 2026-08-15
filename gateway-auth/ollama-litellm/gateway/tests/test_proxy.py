import asyncio
import json
import logging
import time

import httpx
import pytest
import respx

from app.config import Settings
from app.main import create_app
from oidc_helpers import build_jwks, generate_rsa_keypair, make_token


class AsyncChunkStream(httpx.AsyncByteStream):
    def __init__(self, chunks: list[bytes]):
        self.chunks = chunks

    async def __aiter__(self):
        for chunk in self.chunks:
            await asyncio.sleep(0)
            yield chunk


@respx.mock
async def test_proxy_preserves_query_string(client, auth_headers):
    route = respx.get("http://litellm:4000/v1/models?limit=10").mock(
        return_value=httpx.Response(200, json={"data": []})
    )

    response = await client.get("/v1/models?limit=10", headers=auth_headers)

    assert response.status_code == 200
    assert route.called


@respx.mock
async def test_proxy_preserves_json_body(client, auth_headers):
    async def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads((await request.aread()).decode())
        assert body == {"model": "glm-5.2", "messages": [{"role": "user", "content": "OK"}]}
        return httpx.Response(200, json={"ok": True})

    respx.post("http://litellm:4000/v1/chat/completions").mock(side_effect=handler)

    response = await client.post(
        "/v1/chat/completions",
        headers=auth_headers,
        json={"model": "glm-5.2", "messages": [{"role": "user", "content": "OK"}]},
    )

    assert response.status_code == 200
    assert response.json() == {"ok": True}


@respx.mock
async def test_proxy_forwards_authorization_header(client, auth_headers):
    async def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["authorization"] == "Bearer sk-test"
        return httpx.Response(200, json={"data": []})

    respx.get("http://litellm:4000/v1/models").mock(side_effect=handler)

    response = await client.get("/v1/models", headers=auth_headers)

    assert response.status_code == 200


@respx.mock
async def test_proxy_supports_v1_messages(client, auth_headers):
    respx.post("http://litellm:4000/v1/messages").mock(return_value=httpx.Response(200, json={"id": "msg_1"}))

    response = await client.post(
        "/v1/messages",
        headers={**auth_headers, "anthropic-version": "2023-06-01"},
        json={"model": "claude-sonnet-4-5", "max_tokens": 10, "messages": []},
    )

    assert response.status_code == 200
    assert response.json() == {"id": "msg_1"}


@respx.mock
async def test_proxy_supports_v1_chat_completions(client, auth_headers):
    respx.post("http://litellm:4000/v1/chat/completions").mock(
        return_value=httpx.Response(200, json={"choices": []})
    )

    response = await client.post(
        "/v1/chat/completions",
        headers=auth_headers,
        json={"model": "glm-5.2", "messages": []},
    )

    assert response.status_code == 200
    assert response.json() == {"choices": []}


@respx.mock
async def test_sse_streaming_payload_is_not_modified(client, auth_headers):
    chunks = [b"event: message_start\n", b"data: {\"id\":\"1\"}\n\n"]
    respx.post("http://litellm:4000/v1/messages").mock(
        return_value=httpx.Response(
            200,
            headers={"content-type": "text/event-stream", "cache-control": "no-cache"},
            stream=AsyncChunkStream(chunks),
        )
    )

    async with client.stream(
        "POST",
        "/v1/messages",
        headers=auth_headers,
        json={"model": "claude-sonnet-4-5", "stream": True, "messages": []},
    ) as response:
        body = b"".join([chunk async for chunk in response.aiter_bytes()])

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    assert body == b"".join(chunks)


@respx.mock
async def test_connection_error_maps_to_502(client, auth_headers):
    respx.get("http://litellm:4000/v1/models").mock(side_effect=httpx.ConnectError("no route"))

    response = await client.get("/v1/models", headers=auth_headers)

    assert response.status_code == 502
    assert response.json() == {"detail": "LiteLLM connection error"}


@respx.mock
async def test_timeout_maps_to_504(client, auth_headers):
    respx.get("http://litellm:4000/v1/models").mock(side_effect=httpx.ReadTimeout("slow"))

    response = await client.get("/v1/models", headers=auth_headers)

    assert response.status_code == 504
    assert response.json() == {"detail": "LiteLLM timeout"}


@respx.mock
async def test_large_request_over_limit_maps_to_413(auth_headers):
    settings = Settings(
        litellm_base_url="http://litellm:4000",
        litellm_master_key="sk-test",
        max_request_body_mb=1,
    )
    app = create_app(settings)
    transport = httpx.ASGITransport(app=app)
    respx.post("http://litellm:4000/v1/chat/completions").mock(return_value=httpx.Response(200, json={"ok": True}))

    async with httpx.AsyncClient(transport=transport, base_url="http://gateway.test") as limited_client:
        response = await limited_client.post(
            "/v1/chat/completions",
            headers=auth_headers,
            content=b"x" * (1024 * 1024 + 1),
        )

    assert response.status_code == 413


@respx.mock
async def test_request_id_is_created_and_forwarded(client, auth_headers):
    async def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers.get("x-request-id")
        return httpx.Response(200, json={"data": []})

    respx.get("http://litellm:4000/v1/models").mock(side_effect=handler)

    response = await client.get("/v1/models", headers=auth_headers)

    assert response.status_code == 200
    assert response.headers.get("x-request-id")


async def test_authorization_is_not_logged(client, auth_headers, caplog):
    caplog.set_level(logging.INFO, logger="claude_gateway.access")

    response = await client.get("/api/web/domain_info?domain=github.com", headers=auth_headers)

    assert response.status_code == 200
    assert "sk-test" not in caplog.text
    assert "authorization" not in caplog.text.lower()


async def test_access_log_records_auth_method_for_master_key(client, auth_headers, caplog):
    caplog.set_level(logging.INFO, logger="claude_gateway.access")

    response = await client.get("/api/web/domain_info?domain=github.com", headers=auth_headers)

    assert response.status_code == 200
    records = [r for r in caplog.records if r.message == "request_complete"]
    assert records[-1].auth_method == "master_key"
    assert records[-1].user is None


@respx.mock
async def test_access_log_records_user_and_auth_method_for_jwt(oidc_client, oidc_settings, caplog):
    caplog.set_level(logging.INFO, logger="claude_gateway.access")
    private_key = generate_rsa_keypair()
    respx.get(oidc_settings.oidc_jwks_url).mock(return_value=httpx.Response(200, json=build_jwks(private_key)))
    token = make_token(
        private_key,
        iss=oidc_settings.oidc_issuer,
        aud=oidc_settings.oidc_audience,
        preferred_username="alice",
        groups=["claude-users"],
    )

    response = await oidc_client.get(
        "/api/web/domain_info?domain=github.com",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    records = [r for r in caplog.records if r.message == "request_complete"]
    assert records[-1].user == "alice"
    assert records[-1].auth_method == "jwt"


async def test_catch_all_proxy_requires_authentication(client):
    response = await client.get("/v1/models")

    assert response.status_code == 401
    assert response.headers.get("www-authenticate") == "Bearer"


async def test_persistent_jwks_cache_from_lifespan_is_used_for_jwt_verification(oidc_app, oidc_client, oidc_settings):
    from jwt import PyJWK

    from app.oidc import JWKSCache
    from oidc_helpers import build_jwks, generate_rsa_keypair, make_token

    private_key = generate_rsa_keypair()
    jwk = PyJWK.from_dict(build_jwks(private_key)["keys"][0], algorithm="RS256")
    cache = JWKSCache(httpx.AsyncClient(), oidc_settings.oidc_jwks_url, oidc_settings.oidc_jwks_cache_ttl_seconds)
    cache._keys = {"test-kid": jwk}
    cache._fetched_at = time.monotonic()
    oidc_app.state.jwks_cache = cache

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
async def test_jwt_identity_is_swapped_for_master_key_before_upstream(oidc_client, oidc_settings):
    private_key = generate_rsa_keypair()
    respx.get(oidc_settings.oidc_jwks_url).mock(return_value=httpx.Response(200, json=build_jwks(private_key)))
    token = make_token(
        private_key,
        iss=oidc_settings.oidc_issuer,
        aud=oidc_settings.oidc_audience,
        sub="user-42",
        preferred_username="alice",
        groups=["claude-users"],
    )

    async def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["authorization"] == f"Bearer {oidc_settings.litellm_master_key}"
        assert request.headers["x-authenticated-user"] == "alice"
        assert request.headers["x-authenticated-sub"] == "user-42"
        return httpx.Response(200, json={"data": []})

    respx.get("http://litellm:4000/v1/models").mock(side_effect=handler)

    response = await oidc_client.get("/v1/models", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200


@respx.mock
async def test_client_supplied_identity_headers_are_stripped(client, auth_headers):
    async def handler(request: httpx.Request) -> httpx.Response:
        assert "x-authenticated-user" not in request.headers
        assert "x-authenticated-sub" not in request.headers
        return httpx.Response(200, json={"data": []})

    respx.get("http://litellm:4000/v1/models").mock(side_effect=handler)

    response = await client.get(
        "/v1/models",
        headers={**auth_headers, "x-authenticated-user": "spoofed", "x-authenticated-sub": "spoofed"},
    )

    assert response.status_code == 200
