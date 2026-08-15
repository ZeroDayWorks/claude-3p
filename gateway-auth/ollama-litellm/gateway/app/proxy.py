from collections.abc import AsyncIterator
from urllib.parse import urljoin

import httpx
from fastapi import Request
from fastapi.responses import JSONResponse, StreamingResponse

from app.config import Settings

HOP_BY_HOP_HEADERS = {
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
    "trailers",
    "transfer-encoding",
    "upgrade",
}

IDENTITY_HEADERS = {"x-authenticated-user", "x-authenticated-sub"}


class RequestBodyTooLarge(Exception):
    pass


def make_timeout(settings: Settings) -> httpx.Timeout:
    return httpx.Timeout(
        timeout=settings.request_timeout_seconds,
        connect=settings.connect_timeout_seconds,
        read=settings.stream_read_timeout_seconds,
        write=settings.request_timeout_seconds,
        pool=settings.connect_timeout_seconds,
    )


def filtered_request_headers(request: Request, settings: Settings) -> dict[str, str]:
    headers = {
        key: value
        for key, value in request.headers.items()
        if key.lower() not in HOP_BY_HOP_HEADERS
        and key.lower() not in {"host", "content-length"}
        and key.lower() not in IDENTITY_HEADERS
    }
    headers["x-request-id"] = request.state.request_id

    identity = getattr(request.state, "identity", None)
    if identity is not None:
        headers["authorization"] = f"Bearer {settings.litellm_master_key}"
        headers["x-authenticated-user"] = identity.username
        headers["x-authenticated-sub"] = identity.sub
    return headers


def filtered_response_headers(headers: httpx.Headers) -> dict[str, str]:
    return {
        key: value
        for key, value in headers.items()
        if key.lower() not in HOP_BY_HOP_HEADERS and key.lower() not in {"content-length"}
    }


async def limited_request_body(request: Request, max_bytes: int) -> AsyncIterator[bytes]:
    total = 0
    async for chunk in request.stream():
        total += len(chunk)
        if total > max_bytes:
            raise RequestBodyTooLarge
        yield chunk


def upstream_url(settings: Settings, path: str, query: str) -> str:
    base = settings.litellm_base_url.rstrip("/") + "/"
    joined = urljoin(base, path.lstrip("/"))
    return joined + (f"?{query}" if query else "")


async def proxy_to_litellm(request: Request) -> StreamingResponse | JSONResponse:
    settings: Settings = request.app.state.settings
    url = upstream_url(settings, request.url.path, request.url.query)
    headers = filtered_request_headers(request, settings)
    body_stream = limited_request_body(request, settings.max_request_body_bytes)

    client = getattr(request.app.state, "http_client", None)
    owns_client = client is None
    if client is None:
        client = httpx.AsyncClient(timeout=make_timeout(settings), follow_redirects=False)

    stream_context = client.stream(
        request.method,
        url,
        headers=headers,
        content=body_stream,
        follow_redirects=False,
    )

    try:
        upstream_response = await stream_context.__aenter__()
    except RequestBodyTooLarge:
        request.state.error_type = "RequestBodyTooLarge"
        if owns_client:
            await client.aclose()
        return JSONResponse({"detail": "Request body too large"}, status_code=413)
    except httpx.TimeoutException:
        request.state.error_type = "UpstreamTimeout"
        if owns_client:
            await client.aclose()
        return JSONResponse({"detail": "LiteLLM timeout"}, status_code=504)
    except httpx.ConnectError:
        request.state.error_type = "UpstreamConnectionError"
        if owns_client:
            await client.aclose()
        return JSONResponse({"detail": "LiteLLM connection error"}, status_code=502)
    except httpx.InvalidURL:
        request.state.error_type = "InvalidUpstreamURL"
        if owns_client:
            await client.aclose()
        return JSONResponse({"detail": "Invalid upstream request"}, status_code=400)
    except httpx.RequestError:
        request.state.error_type = "UpstreamRequestError"
        if owns_client:
            await client.aclose()
        return JSONResponse({"detail": "LiteLLM request error"}, status_code=502)

    request.state.upstream_status = upstream_response.status_code

    async def stream_chunks() -> AsyncIterator[bytes]:
        try:
            async for chunk in upstream_response.aiter_raw():
                yield chunk
        finally:
            await stream_context.__aexit__(None, None, None)
            if owns_client:
                await client.aclose()

    return StreamingResponse(
        stream_chunks(),
        status_code=upstream_response.status_code,
        headers=filtered_response_headers(upstream_response.headers),
    )
