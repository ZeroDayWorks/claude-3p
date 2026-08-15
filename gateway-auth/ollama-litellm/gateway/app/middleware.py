import logging
import time
import uuid
from collections.abc import Awaitable, Callable

from fastapi import Request, Response

LOGGER = logging.getLogger("claude_gateway.access")


async def request_context_middleware(
    request: Request,
    call_next: Callable[[Request], Awaitable[Response]],
) -> Response:
    request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
    request.state.request_id = request_id
    started = time.perf_counter()
    status_code = 500
    error_type = None

    try:
        response = await call_next(request)
        status_code = response.status_code
        response.headers["x-request-id"] = request_id
        return response
    except Exception as exc:
        error_type = exc.__class__.__name__
        raise
    finally:
        duration_ms = round((time.perf_counter() - started) * 1000, 2)
        identity = getattr(request.state, "identity", None)
        LOGGER.info(
            "request_complete",
            extra={
                "request_id": request_id,
                "method": request.method,
                "path": request.url.path,
                "status_code": status_code,
                "duration_ms": duration_ms,
                "upstream_status": getattr(request.state, "upstream_status", None),
                "error_type": error_type or getattr(request.state, "error_type", None),
                "user": identity.username if identity is not None else None,
                "auth_method": getattr(request.state, "auth_method", None),
            },
        )
