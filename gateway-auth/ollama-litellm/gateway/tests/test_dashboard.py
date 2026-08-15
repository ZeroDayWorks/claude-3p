import httpx
import respx

from app.config import Settings
from app.main import create_app


def make_settings() -> Settings:
    return Settings(
        litellm_base_url="http://litellm:4000",
        litellm_master_key="sk-test",
        allow_all_domains=False,
        allowed_domains="github.com,api.github.com",
    )


LITELLM_MODELS_RESPONSE = {
    "data": [
        {
            "model_name": "glm-5.2",
            "litellm_params": {
                "model": "openai/glm-5.2:cloud",
                "api_base": "https://ollama.com/v1",
            },
        },
        {
            "model_name": "haiku",
            "litellm_params": {
                "model": "openai/glm-5.2:cloud",
                "api_base": "https://ollama.com/v1",
            },
        },
    ]
}


@respx.mock
async def test_gateway_info_shows_provider_mapping():
    respx.get("http://litellm:4000/model/info").mock(
        return_value=httpx.Response(200, json=LITELLM_MODELS_RESPONSE)
    )
    app = create_app(make_settings())
    transport = httpx.ASGITransport(app=app)

    async with httpx.AsyncClient(transport=transport, base_url="http://gateway.test") as client:
        response = await client.get("/api/gateway/info")

    assert response.status_code == 200
    payload = response.json()
    assert payload["provider_mappings"] == [
        {
            "model_name": "glm-5.2",
            "provider": "openai",
            "upstream_model": "openai/glm-5.2:cloud",
            "api_base": "https://ollama.com/v1",
        },
        {
            "model_name": "haiku",
            "provider": "openai",
            "upstream_model": "openai/glm-5.2:cloud",
            "api_base": "https://ollama.com/v1",
        },
    ]
    assert payload["domain_policy"] == {
        "allow_all_domains": False,
        "allowed_domains": ["github.com", "api.github.com"],
    }


@respx.mock
async def test_web_dashboard_renders_html():
    respx.get("http://litellm:4000/model/info").mock(
        return_value=httpx.Response(
            200,
            json={
                "data": [
                    {
                        "model_name": "kimi-k2.7-code",
                        "litellm_params": {
                            "model": "openai/kimi-k2.7-code:cloud",
                            "api_base": "https://ollama.com/v1",
                        },
                    }
                ]
            },
        )
    )
    app = create_app(make_settings())
    transport = httpx.ASGITransport(app=app)

    async with httpx.AsyncClient(transport=transport, base_url="http://gateway.test") as client:
        response = await client.get("/web")
        root_response = await client.get("/")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert "Provider Mapping" in response.text
    assert "kimi-k2.7-code" in response.text
    assert "/v1/chat/completions" in response.text
    assert root_response.status_code == 200
    assert "Claude Local Gateway" in root_response.text


@respx.mock
async def test_gateway_info_warns_when_litellm_unreachable():
    respx.get("http://litellm:4000/model/info").mock(
        return_value=httpx.Response(503)
    )
    app = create_app(make_settings())
    transport = httpx.ASGITransport(app=app)

    async with httpx.AsyncClient(transport=transport, base_url="http://gateway.test") as client:
        response = await client.get("/api/gateway/info")

    assert response.status_code == 200
    assert response.json()["provider_mappings"] == []
    assert "unreachable" in response.json()["warning"]