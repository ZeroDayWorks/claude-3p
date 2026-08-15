async def test_domain_info_allows_valid_domain(client, auth_headers):
    response = await client.get("/api/web/domain_info?domain=github.com", headers=auth_headers)

    assert response.status_code == 200
    assert response.json() == {"domain": "github.com", "can_fetch": True}


async def test_claude_desktop_domain_info_path(client, auth_headers):
    response = await client.get(
        "/claude-desktop/api/web/domain_info?domain=docs.github.com",
        headers=auth_headers,
    )

    assert response.status_code == 200
    assert response.json() == {"domain": "docs.github.com", "can_fetch": True}


async def test_domain_info_blocks_disallowed_domain(client, auth_headers):
    response = await client.get("/api/web/domain_info?domain=blocked.example", headers=auth_headers)

    assert response.status_code == 200
    assert response.json() == {"domain": "blocked.example", "can_fetch": False}


async def test_domain_info_rejects_url_with_scheme(client, auth_headers):
    response = await client.get(
        "/api/web/domain_info?domain=https%3A%2F%2Fgithub.com",
        headers=auth_headers,
    )

    assert response.status_code == 200
    assert response.json()["can_fetch"] is False


async def test_domain_info_rejects_domain_with_port(client, auth_headers):
    response = await client.get("/api/web/domain_info?domain=github.com:443", headers=auth_headers)

    assert response.status_code == 200
    assert response.json() == {"domain": "github.com:443", "can_fetch": False}
