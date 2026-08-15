import secrets

import httpx
from fastapi import HTTPException, Request, status

from app.config import Settings
from app.oidc import Identity, JWKSCache, JWKSUnavailable, TokenForbidden, TokenValidationError, verify_jwt


def extract_bearer_token(authorization: str | None) -> str | None:
    if not authorization:
        return None
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        return None
    return token.strip()


def is_authorized(authorization: str | None, settings: Settings) -> bool:
    token = extract_bearer_token(authorization)
    if token is None:
        return False
    return secrets.compare_digest(token, settings.litellm_master_key)


def _unauthorized() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Unauthorized",
        headers={"WWW-Authenticate": "Bearer"},
    )


async def _verify_with_cache(token: str, settings: Settings, cache: JWKSCache) -> Identity:
    return await verify_jwt(
        token,
        issuer=settings.oidc_issuer,
        audience=settings.oidc_audience,
        allowed_groups=set(settings.oidc_allowed_group_list),
        denied_groups=set(settings.oidc_denied_group_list),
        jwks_cache=cache,
    )


async def authenticate(request: Request) -> Identity | None:
    settings: Settings = request.app.state.settings
    token = extract_bearer_token(request.headers.get("authorization"))
    if token is None:
        raise _unauthorized()

    if secrets.compare_digest(token, settings.litellm_master_key):
        request.state.auth_method = "master_key"
        return None

    if not settings.oidc_enabled:
        raise _unauthorized()

    try:
        cache = getattr(request.app.state, "jwks_cache", None)
        if cache is not None:
            identity = await _verify_with_cache(token, settings, cache)
        else:
            async with httpx.AsyncClient() as temp_client:
                temp_cache = JWKSCache(temp_client, settings.oidc_jwks_url, settings.oidc_jwks_cache_ttl_seconds)
                identity = await _verify_with_cache(token, settings, temp_cache)
    except TokenForbidden as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden") from exc
    except JWKSUnavailable as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Authentication service unavailable"
        ) from exc
    except TokenValidationError as exc:
        raise _unauthorized() from exc

    request.state.auth_method = "jwt"
    return identity


async def require_bearer_token(request: Request) -> None:
    identity = await authenticate(request)
    request.state.identity = identity
