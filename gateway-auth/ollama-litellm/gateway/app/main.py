from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, Response

from app.auth import authenticate, require_bearer_token
from app.config import Settings, get_settings
from app.dashboard import dashboard_html, gateway_info
from app.domain_policy import domain_is_allowed
from app.logging_config import configure_logging
from app.middleware import request_context_middleware
from app.oidc import JWKSCache
from app.proxy import make_timeout, proxy_to_litellm


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings: Settings = app.state.settings
    configure_logging(settings.log_level)
    app.state.http_client = httpx.AsyncClient(timeout=make_timeout(settings), follow_redirects=False)
    app.state.jwks_cache = JWKSCache(app.state.http_client, settings.oidc_jwks_url, settings.oidc_jwks_cache_ttl_seconds)
    try:
        yield
    finally:
        await app.state.http_client.aclose()


def create_app(settings: Settings | None = None) -> FastAPI:
    app = FastAPI(title="Claude Local Gateway", lifespan=lifespan)
    app.state.settings = settings or get_settings()
    app.middleware("http")(request_context_middleware)

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/", response_model=None)
    @app.get("/web", response_model=None)
    async def web_dashboard(request: Request):
        return dashboard_html(await gateway_info(request))

    @app.get("/api/gateway/info")
    async def api_gateway_info(request: Request) -> dict:
        return await gateway_info(request)

    @app.get("/admin", response_model=None)
    @app.api_route(
        "/admin/{path:path}",
        methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
    )
    async def admin_proxy(request: Request, path: str = ""):
        settings: Settings = request.app.state.settings
        admin_url = settings.litellm_base_url.rstrip("/") + "/ui"
        if path:
            admin_url = admin_url.rstrip("/") + "/" + path.lstrip("/")
        query = request.url.query
        if query:
            admin_url = admin_url + "?" + query

        headers = {
            key: value
            for key, value in request.headers.items()
            if key.lower() not in {"host", "content-length", "transfer-encoding", "connection"}
        }
        client = getattr(request.app.state, "http_client", None)
        if client is None:
            async with httpx.AsyncClient(timeout=make_timeout(settings), follow_redirects=False) as temp_client:
                upstream = await temp_client.request(request.method, admin_url, headers=headers, content=await request.body())
            return Response(
                content=upstream.content,
                status_code=upstream.status_code,
                headers={k: v for k, v in upstream.headers.items() if k.lower() not in {"transfer-encoding", "content-length", "connection"}},
            )
        upstream = await client.request(request.method, admin_url, headers=headers, content=await request.body())
        return Response(
            content=upstream.content,
            status_code=upstream.status_code,
            headers={k: v for k, v in upstream.headers.items() if k.lower() not in {"transfer-encoding", "content-length", "connection"}},
        )

    @app.get("/ready", response_model=None)
    async def ready(request: Request) -> Response | dict[str, str]:
        current_settings: Settings = request.app.state.settings
        health_url = current_settings.litellm_base_url.rstrip("/") + "/health/liveliness"
        try:
            client = getattr(request.app.state, "http_client", None)
            if client is None:
                async with httpx.AsyncClient(timeout=make_timeout(current_settings), follow_redirects=False) as temp_client:
                    response = await temp_client.get(health_url)
            else:
                response = await client.get(health_url)
            request.state.upstream_status = response.status_code
        except (httpx.TimeoutException, httpx.RequestError):
            request.state.error_type = "ReadinessConnectionError"
            return JSONResponse({"status": "not_ready", "litellm": "unreachable"}, status_code=503)

        if response.status_code >= 500:
            return JSONResponse({"status": "not_ready", "litellm": "unreachable"}, status_code=503)
        return {"status": "ready", "litellm": "reachable"}

    async def domain_info(request: Request, domain: str | None = None) -> dict[str, bool | str]:
        await require_bearer_token(request)
        current_settings: Settings = request.app.state.settings
        normalized_domain, can_fetch = domain_is_allowed(
            domain,
            current_settings.allow_all_domains,
            current_settings.allowed_domain_list,
        )
        return {"domain": normalized_domain, "can_fetch": can_fetch}

    app.add_api_route("/api/web/domain_info", domain_info, methods=["GET"])
    app.add_api_route("/claude-desktop/api/web/domain_info", domain_info, methods=["GET"])

    @app.api_route(
        "/{path:path}",
        methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
    )
    async def catch_all_proxy(request: Request):
        identity = await authenticate(request)
        request.state.identity = identity
        return await proxy_to_litellm(request)

    return app


app = create_app()
