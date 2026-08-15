import httpx
import respx


async def test_health(client):
    response = await client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


@respx.mock
async def test_ready_reachable(client):
    respx.get("http://litellm:4000/health/liveliness").mock(
        return_value=httpx.Response(200, json={"status": "ok"})
    )

    response = await client.get("/ready")

    assert response.status_code == 200
    assert response.json() == {"status": "ready", "litellm": "reachable"}


@respx.mock
async def test_ready_returns_503_when_litellm_is_down(client):
    respx.get("http://litellm:4000/health/liveliness").mock(
        side_effect=httpx.ConnectError("connection failed")
    )

    response = await client.get("/ready")

    assert response.status_code == 503
    assert response.json() == {"status": "not_ready", "litellm": "unreachable"}
