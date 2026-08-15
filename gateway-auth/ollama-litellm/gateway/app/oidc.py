import asyncio
import time
from dataclasses import dataclass

import httpx
import jwt
from jwt import PyJWK


class JWKSUnavailable(Exception):
    pass


class TokenValidationError(Exception):
    pass


class TokenForbidden(Exception):
    def __init__(self, reason: str):
        self.reason = reason
        super().__init__(reason)


@dataclass
class Identity:
    sub: str
    username: str
    groups: list[str]


class JWKSCache:
    def __init__(self, http_client: httpx.AsyncClient, jwks_url: str, ttl_seconds: int):
        self._http_client = http_client
        self._jwks_url = jwks_url
        self._ttl_seconds = ttl_seconds
        self._keys: dict[str, PyJWK] = {}
        self._fetched_at: float = 0.0
        self._lock = asyncio.Lock()

    async def get_key(self, kid: str) -> PyJWK:
        if kid not in self._keys or self._is_expired():
            await self._refresh(kid)
        try:
            return self._keys[kid]
        except KeyError as exc:
            raise TokenValidationError(f"Unknown key id: {kid}") from exc

    def _is_expired(self) -> bool:
        return (time.monotonic() - self._fetched_at) > self._ttl_seconds

    async def _refresh(self, kid: str) -> None:
        async with self._lock:
            if kid in self._keys and not self._is_expired():
                return  # another caller already refreshed while we waited
            try:
                response = await self._http_client.get(self._jwks_url)
                response.raise_for_status()
                data = response.json()
            except (httpx.HTTPError, ValueError) as exc:
                if self._keys:
                    return  # stale-while-error: keep serving what we have
                raise JWKSUnavailable("Unable to fetch JWKS and no cached keys available") from exc

            keys: dict[str, PyJWK] = {}
            for jwk_dict in data.get("keys", []):
                jwk_kid = jwk_dict.get("kid")
                if not jwk_kid:
                    continue
                keys[jwk_kid] = PyJWK.from_dict(jwk_dict, algorithm="RS256")

            if keys:
                self._keys = keys
                self._fetched_at = time.monotonic()
            elif not self._keys:
                raise JWKSUnavailable("JWKS response contained no usable keys")


async def verify_jwt(
    token: str,
    *,
    issuer: str,
    audience: str,
    allowed_groups: set[str],
    denied_groups: set[str],
    jwks_cache: JWKSCache,
) -> Identity:
    try:
        header = jwt.get_unverified_header(token)
    except jwt.PyJWTError as exc:
        raise TokenValidationError("Malformed token header") from exc

    kid = header.get("kid")
    if not kid:
        raise TokenValidationError("Token header missing kid")

    key = await jwks_cache.get_key(kid)

    try:
        claims = jwt.decode(
            token,
            key=key.key,
            algorithms=["RS256"],
            audience=audience,
            issuer=issuer,
            options={"require": ["exp", "iss", "aud", "sub"]},
            leeway=30,
        )
    except jwt.PyJWTError as exc:
        raise TokenValidationError(str(exc)) from exc

    groups = set(claims.get("groups") or [])
    if groups & denied_groups:
        raise TokenForbidden("subject is in a denied group")
    if not (groups & allowed_groups):
        raise TokenForbidden("subject has no allowed group")

    sub = claims["sub"]
    username = claims.get("preferred_username") or sub
    return Identity(sub=sub, username=username, groups=sorted(groups))
