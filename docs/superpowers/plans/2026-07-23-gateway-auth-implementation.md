# Gateway Auth (Authentik OIDC for Claude Gateway) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure `authentik-deployment/` + `ollama-litellm/` into a single `gateway-auth/` Docker Compose project, then add Authentik-issued JWT validation to the FastAPI gateway as a second auth path alongside the existing LiteLLM master key, so Claude Desktop users authenticate via SSO while automation keeps using the master key.

**Architecture:** The gateway (`gateway-auth/ollama-litellm/gateway`) gains a `dual auth` check on every proxied request: try the static master key first (existing behavior, `secrets.compare_digest`), and if that fails, validate the bearer token as an RS256 JWT signed by Authentik — verifying signature via a cached JWKS fetch, `iss`, `aud=ai-gateway`, `exp`, and an allow/deny group check (`claude-users`/`claude-admins` vs `claude-suspended`). On a valid JWT, the gateway swaps the outbound `Authorization` header to the LiteLLM master key before proxying (LiteLLM never sees the JWT) and forwards `x-authenticated-user`/`x-authenticated-sub` for audit logging, stripping any client-supplied copies of those headers first. Both stacks move into one `gateway-auth/` directory joined by a shared `internal` Docker network so the gateway can reach Authentik's JWKS endpoint directly by container hostname (`authentik-server:9000`), while the JWT's `iss` claim stays a public HTTPS URL built from `AUTH_DOMAIN`.

**Tech Stack:** Python 3.12, FastAPI, httpx, PyJWT (`PyJWT[crypto]` for RS256 via `cryptography`), pytest + pytest-asyncio + respx, Docker Compose v2 (`include:`), Authentik 2025.10.0 blueprints, Cloudflare Tunnel (`cloudflared`).

## Global Constraints

- No git repository governs this work (`gateway-auth/` is created fresh, not bound to git; the existing `ollama-litellm/.git` is left behind and NOT carried into the new location). **Do not run `git add`/`git commit`/`git mv` for any step in this plan.** Every task ends with a run/verification command instead of a commit.
- This is a DEMO deployment. Access token lifetime is intentionally long (8h) — every place this shows up must stay reversible to a short (`minutes=15`) production value via a single blueprint `context` edit (see Task 2).
- RS256 only for JWT verification (`algorithms=["RS256"]` explicitly passed to `jwt.decode`) — never accept `alg: none` or HS256, even though PyJWT would otherwise trust the token's own `alg` header.
- Two config values must never be conflated: `OIDC_ISSUER` (public HTTPS URL, must exactly match the JWT's `iss` claim, built from `AUTH_DOMAIN`) vs `OIDC_JWKS_URL` (internal Docker-network URL the gateway actually fetches). Every task touching OIDC config keeps these as two separate settings.
- Cloudflare (tunnel or DNS) is used only for the Authentik auth flow (`AUTH_DOMAIN`). The gateway's inference endpoint (port 4100) is not routed through Cloudflare in this plan — Claude Desktop reaches it directly (localhost/LAN).
- All new Python code follows the existing style in `gateway/app/`: plain functions/dataclasses, no framework beyond FastAPI/httpx/pydantic, type hints on every signature, no docstrings unless documenting a non-obvious constraint.
- Existing tests (`gateway/tests/test_*.py`) must keep passing after every task — this plan never breaks master-key-only behavior for callers who never set `OIDC_ENABLED`.

---

## File Structure

```
gateway-auth/                              # NEW root — created in Task 1
├── compose.yml                            # NEW — include: + cloudflared (profile: tunnel)
├── .env.example                           # NEW — consolidated env for both stacks
├── authentik/                             # moved from authentik-deployment/ (Task 1)
│   ├── compose.yml                        # edited: server gets alias authentik-server (Task 1)
│   ├── compose.override.yml               # moved as-is (still opt-in via -f, Task 1)
│   ├── blueprints/claude-desktop.yaml     # edited: token lifetime via context (Task 2)
│   ├── nginx/ certs/ media/ custom-templates/ scripts/ docs/ ...  # moved as-is
└── ollama-litellm/                        # moved from ollama-litellm/ (Task 1, .git stripped)
    ├── docker-compose.yml                 # edited: internal network + OIDC env (Task 1)
    ├── config.yaml
    ├── gateway-auth-plan.md               # moved from ollama-litellm/ (Task 1)
    └── gateway/
        ├── requirements.txt                # edited: + PyJWT[crypto] (Task 4)
        └── app/
            ├── config.py                   # edited: OIDC settings (Task 3)
            ├── oidc.py                     # NEW: JWKSCache + verify_jwt (Task 4)
            ├── auth.py                     # edited: authenticate() dual path (Task 5)
            ├── main.py                     # edited: enforce auth + lifespan jwks_cache (Task 5, 6)
            ├── proxy.py                    # edited: credential swap + header strip (Task 7)
            └── middleware.py               # edited: log identity/auth_method (Task 8)
        └── tests/
            ├── oidc_helpers.py             # NEW: RSA/JWKS/JWT test helpers (Task 4)
            ├── test_config.py              # NEW (Task 3)
            ├── test_oidc.py                # NEW (Task 4)
            ├── conftest.py                 # edited: oidc_settings/oidc_app/oidc_client fixtures (Task 5)
            ├── test_auth.py                # edited: dual-auth cases (Task 5)
            ├── test_proxy.py               # edited: catch-all auth, credential swap, header strip, log fields (Task 6, 7, 8)
```

---

### Task 1: Restructure into `gateway-auth/`

**Files:**
- Move: `authentik-deployment/` → `gateway-auth/authentik/`
- Move: `ollama-litellm/` → `gateway-auth/ollama-litellm/` (drop `.git`, `.pytest_cache`, `__pycache__`)
- Move: `ollama-litellm/gateway-auth-plan.md` → `gateway-auth/gateway-auth-plan.md`
- Create: `gateway-auth/compose.yml`
- Create: `gateway-auth/.env.example`
- Create: `gateway-auth/.gitignore` (`.env` — the file itself is never tracked, this just makes it explicit for `git add`)
- Modify: `gateway-auth/authentik/compose.yml` (network alias for `server`)
- Modify: `gateway-auth/ollama-litellm/docker-compose.yml` (join `internal` network, add OIDC env passthrough)

**Interfaces:**
- Produces: Docker network `internal` (declared in `authentik/compose.yml`, consumed by `ollama-litellm/docker-compose.yml`'s `claude-gateway` service) with the alias `authentik-server` resolving to Authentik's `server` container. All later tasks assume the gateway container can reach `http://authentik-server:9000/...`.
- Produces: single Compose project named `gateway-auth`, brought up with `docker compose up -d` from `gateway-auth/` (or `docker compose --profile tunnel up -d` for local tunnel mode).

- [ ] **Step 1: Create the target directory and move both stacks (plain filesystem move, no git)**

Run from the `@claude-3P` root:

```bash
mkdir -p "gateway-auth"
mv "authentik-deployment" "gateway-auth/authentik"
mv "ollama-litellm" "gateway-auth/ollama-litellm"
rm -rf "gateway-auth/ollama-litellm/.git"
find "gateway-auth" -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null
mv "gateway-auth/ollama-litellm/gateway-auth-plan.md" "gateway-auth/gateway-auth-plan.md"
```

Expected: `gateway-auth/authentik/` and `gateway-auth/ollama-litellm/` exist; the original `authentik-deployment/` and `ollama-litellm/` directories no longer exist at the root; `gateway-auth/ollama-litellm/.git` does not exist; `gateway-auth/gateway-auth-plan.md` exists.

- [ ] **Step 2: Add the `authentik-server` network alias in `gateway-auth/authentik/compose.yml`**

Find the `server:` service block. Its current `networks:` field is:

```yaml
    networks:
      - internal
```

Replace it with:

```yaml
    networks:
      internal:
        aliases:
          - authentik-server
```

Leave `worker:`, `db:`, and `redis:` service network blocks unchanged (still `- internal` list form).

- [ ] **Step 3: Join `internal` network and add OIDC env vars in `gateway-auth/ollama-litellm/docker-compose.yml`**

Replace the entire file with:

```yaml
# This file is included by ../compose.yml (Docker Compose `include:`).
# It is not intended to be run standalone — the `internal` network it
# references is declared in ../authentik/compose.yml.
services:
  claude-gateway:
    build:
      context: ./gateway
    container_name: claude-local-gateway
    ports:
      - "4100:4100"
    volumes:
      - ./config.yaml:/app/config.yaml:ro
    environment:
      LITELLM_BASE_URL: http://litellm:4000
      LITELLM_MASTER_KEY: ${LITELLM_MASTER_KEY}
      LITELLM_CONFIG_PATH: /app/config.yaml
      ALLOW_ALL_DOMAINS: ${ALLOW_ALL_DOMAINS:-true}
      ALLOWED_DOMAINS: ${ALLOWED_DOMAINS:-}
      MAX_REQUEST_BODY_MB: ${MAX_REQUEST_BODY_MB:-100}
      CONNECT_TIMEOUT_SECONDS: ${CONNECT_TIMEOUT_SECONDS:-15}
      REQUEST_TIMEOUT_SECONDS: ${REQUEST_TIMEOUT_SECONDS:-600}
      STREAM_READ_TIMEOUT_SECONDS: ${STREAM_READ_TIMEOUT_SECONDS:-600}
      LOG_LEVEL: ${LOG_LEVEL:-INFO}
      OIDC_ENABLED: ${OIDC_ENABLED:-true}
      OIDC_ISSUER: https://${AUTH_DOMAIN}/application/o/claude-desktop/
      OIDC_JWKS_URL: ${OIDC_JWKS_URL:-http://authentik-server:9000/application/o/claude-desktop/jwks/}
      OIDC_AUDIENCE: ${OIDC_AUDIENCE:-ai-gateway}
      OIDC_ALLOWED_GROUPS: ${OIDC_ALLOWED_GROUPS:-claude-users,claude-admins}
      OIDC_DENIED_GROUPS: ${OIDC_DENIED_GROUPS:-claude-suspended}
      OIDC_JWKS_CACHE_TTL_SECONDS: ${OIDC_JWKS_CACHE_TTL_SECONDS:-3600}
    depends_on:
      litellm:
        condition: service_healthy
    healthcheck:
      test:
        - CMD
        - python
        - -c
        - "import urllib.request; urllib.request.urlopen('http://127.0.0.1:4100/health', timeout=5).read()"
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 10s
    restart: unless-stopped
    networks:
      - ai-gateway
      - internal

  litellm:
    image: ghcr.io/berriai/litellm:main-latest
    container_name: ollama-litellm
    expose:
      - "4000"
    ports:
      - "4000:4000"
    volumes:
      - ./config.yaml:/app/config.yaml:ro
    environment:
      OLLAMA_API_KEY: ${OLLAMA_API_KEY}
      LITELLM_MASTER_KEY: ${LITELLM_MASTER_KEY}
    command:
      - "--config"
      - "/app/config.yaml"
      - "--port"
      - "4000"
    healthcheck:
      test:
        - CMD
        - python
        - -c
        - "import urllib.request; urllib.request.urlopen('http://127.0.0.1:4000/health/liveliness', timeout=5).read()"
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 30s
    restart: unless-stopped
    networks:
      - ai-gateway

networks:
  ai-gateway:
    driver: bridge
```

(`OIDC_ENABLED` defaults to `true` here because this file is the demo target state; Task 3 makes the gateway itself default `oidc_enabled` to `False` when unset so existing non-Compose test/dev usage is unaffected.)

- [ ] **Step 4: Write the root `gateway-auth/compose.yml`**

```yaml
name: gateway-auth

include:
  - path: authentik/compose.yml
  - path: ollama-litellm/docker-compose.yml

services:
  # Local dev + demo ingress: `docker compose --profile tunnel up -d`.
  # Configure the tunnel's Public Hostname in the Cloudflare Zero Trust
  # dashboard to point AUTH_DOMAIN at http://authentik-server:9000 (see
  # Task 10). Not used in VM+DNS mode (Task 11).
  cloudflared:
    image: cloudflare/cloudflared:latest
    profiles: [tunnel]
    restart: unless-stopped
    command: tunnel run
    environment:
      # Compose interpolates every service's env block during `docker compose
      # config`/`up` regardless of which profiles are active, so a required
      # (":?") var here would break plain `docker compose config` even
      # without --profile tunnel. Default to empty instead; cloudflared
      # itself fails loudly at container start if TUNNEL_TOKEN is unset,
      # which only matters when this profile is actually used (Task 10).
      TUNNEL_TOKEN: ${CLOUDFLARE_TUNNEL_TOKEN:-}
    networks:
      - internal
    depends_on:
      - server
```

- [ ] **Step 5: Write the consolidated `gateway-auth/.env.example`**

```bash
# =============================================================================
# gateway-auth consolidated environment (Authentik + LiteLLM gateway).
# Copy to .env and fill in real secrets. NEVER commit the resulting .env.
# Generate secrets with: openssl rand -base64 36 / openssl rand -hex 64
# =============================================================================

# ---- Public hostname for Authentik (used by both deploy modes) -------------
# Local+tunnel: the hostname mapped to your Cloudflare Tunnel (Task 10).
# VM+DNS: the hostname your Cloudflare DNS record points at this VM (Task 11).
AUTH_DOMAIN=auth.example.com

# ---- Cloudflare Tunnel (only read when running with --profile tunnel) ------
CLOUDFLARE_TUNNEL_TOKEN=

# ---- PostgreSQL (Authentik) --------------------------------------------------
PG_USER=authentik
PG_DB=authentik
PG_PASS=CHANGE_ME_generate_with_openssl_rand_base64_36

# ---- Authentik core -----------------------------------------------------------
AUTHENTIK_SECRET_KEY=CHANGE_ME_generate_with_openssl_rand_hex_64
AUTHENTIK_LOG_LEVEL=info
AUTHENTIK_ERROR_REPORTING__ENABLED=false
AUTHENTIK_AVATARS=initials

# ---- Outbound email (optional; leave blank to disable) -----------------------
AUTHENTIK_EMAIL__HOST=
AUTHENTIK_EMAIL__PORT=587
AUTHENTIK_EMAIL__USERNAME=
AUTHENTIK_EMAIL__PASSWORD=
AUTHENTIK_EMAIL__USE_TLS=true
AUTHENTIK_EMAIL__USE_SSL=false
AUTHENTIK_EMAIL__FROM=authentik@example.com

# ---- TLS for VM+DNS mode's host nginx (not used in tunnel mode) ------------
TLS_CERT_PATH=/etc/nginx/certs/auth.example.com.fullchain.pem
TLS_KEY_PATH=/etc/nginx/certs/auth.example.com.key.pem

# ---- Ollama / LiteLLM ----------------------------------------------------------
OLLAMA_API_KEY=CHANGE_ME
LITELLM_MASTER_KEY=CHANGE_ME_generate_with_openssl_rand_hex_32

# ---- Gateway: domain allowlist + limits ---------------------------------------
ALLOW_ALL_DOMAINS=true
ALLOWED_DOMAINS=
MAX_REQUEST_BODY_MB=100
CONNECT_TIMEOUT_SECONDS=15
REQUEST_TIMEOUT_SECONDS=600
STREAM_READ_TIMEOUT_SECONDS=600
LOG_LEVEL=INFO

# ---- Gateway: Authentik OIDC (dual auth) ---------------------------------------
OIDC_ENABLED=true
# OIDC_ISSUER is not read from here - it's always computed in
# ollama-litellm/docker-compose.yml as https://${AUTH_DOMAIN}/application/o/claude-desktop/.
# There is no override; setting OIDC_ISSUER in this file has no effect.
OIDC_JWKS_URL=http://authentik-server:9000/application/o/claude-desktop/jwks/
OIDC_AUDIENCE=ai-gateway
OIDC_ALLOWED_GROUPS=claude-users,claude-admins
OIDC_DENIED_GROUPS=claude-suspended
OIDC_JWKS_CACHE_TTL_SECONDS=3600
```

- [ ] **Step 6: Validate the merged Compose project**

```bash
cd "gateway-auth"
cp .env.example .env
docker compose config --quiet
```

Expected: exit code 0, no errors. If it fails with `network internal not found` or similar, re-check Step 2/3's network blocks — do not proceed until this passes.

- [ ] **Step 7: Confirm the existing gateway test suite still passes from the new path**

```bash
cd "gateway-auth/ollama-litellm/gateway"
pip install -r requirements.txt
python -m pytest -q
```

Expected: all existing tests pass (same count as before the move — nothing here has changed gateway behavior yet, only its location).

---

### Task 2: Blueprint — DEMO token lifetime (8h access / 24h refresh)

**Files:**
- Modify: `gateway-auth/authentik/blueprints/claude-desktop.yaml`

**Interfaces:**
- Produces: Authentik OAuth2 provider `Claude Desktop OIDC` issuing access tokens valid 8 hours and refresh tokens valid 24 hours (was 15 minutes / 8 hours). Downstream (Task 4/5) JWT verification only checks `exp`, not lifetime policy, so no other task depends on the exact values — only on `exp` being present and honored.

- [ ] **Step 1: Add lifetime values to the blueprint's `context` block**

In `gateway-auth/authentik/blueprints/claude-desktop.yaml`, find:

```yaml
context:
  authorization_flow: default-provider-authorization-explicit-consent
  invalidation_flow:  default-provider-invalidation-flow
  signing_key_name:   authentik Self-signed Certificate
```

Replace with:

```yaml
context:
  authorization_flow: default-provider-authorization-explicit-consent
  invalidation_flow:  default-provider-invalidation-flow
  signing_key_name:   authentik Self-signed Certificate
  # DEMO values. Production: access_token_validity should drop back to
  # "minutes=15" (this is the only place that needs to change).
  access_token_validity: hours=8
  refresh_token_validity: hours=24
```

- [ ] **Step 2: Wire the context values into the provider's `attrs`**

Find, inside the `authentik_providers_oauth2.oauth2provider` entry:

```yaml
      access_code_validity: minutes=1
      access_token_validity: minutes=15
      refresh_token_validity: hours=8
```

Replace with:

```yaml
      access_code_validity: minutes=1
      access_token_validity: !Context access_token_validity
      refresh_token_validity: !Context refresh_token_validity
```

- [ ] **Step 3: Sanity-check the YAML is still parseable**

Authentik blueprints use custom tags (`!Find`, `!Context`, `!KeyOf`) that plain `yaml.safe_load` doesn't know. Register no-op constructors so the parser can at least confirm the document structure is valid YAML:

```bash
cd "gateway-auth/authentik"
python3 - <<'PY'
import yaml

class BlueprintLoader(yaml.SafeLoader):
    pass

for tag in ("!Find", "!Context", "!KeyOf", "!Env", "!Format"):
    BlueprintLoader.add_constructor(tag, lambda loader, node: None)

with open("blueprints/claude-desktop.yaml", encoding="utf-8") as f:
    doc = yaml.load(f, Loader=BlueprintLoader)

assert doc["context"]["access_token_validity"] == "hours=8"
assert doc["context"]["refresh_token_validity"] == "hours=24"
print("OK: blueprint YAML is valid and lifetime context values are set")
PY
```

Expected: prints `OK: ...` and exits 0. (Full validation — that Authentik actually accepts and applies this blueprint — happens in Task 10's deploy checklist, since it requires a running Authentik worker.)

---

### Task 3: Gateway config — OIDC settings

**Files:**
- Modify: `gateway-auth/ollama-litellm/gateway/app/config.py`
- Create: `gateway-auth/ollama-litellm/gateway/tests/test_config.py`

**Interfaces:**
- Produces: `Settings` fields `oidc_enabled: bool`, `oidc_issuer: str`, `oidc_jwks_url: str`, `oidc_audience: str`, `oidc_allowed_groups: str`, `oidc_denied_groups: str`, `oidc_jwks_cache_ttl_seconds: int`, plus properties `oidc_allowed_group_list: list[str]` and `oidc_denied_group_list: list[str]`. Constructing `Settings(oidc_enabled=True)` without `oidc_issuer`/`oidc_jwks_url` raises `pydantic.ValidationError` at construction time. Task 5 (`auth.py`) and Task 6 (`main.py`) read these fields/properties directly.

- [ ] **Step 1: Write the failing tests**

Create `gateway-auth/ollama-litellm/gateway/tests/test_config.py`:

```python
import sys
from pathlib import Path

import pytest
from pydantic import ValidationError

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import Settings


def test_oidc_disabled_by_default_does_not_require_issuer():
    settings = Settings(litellm_master_key="sk-test")

    assert settings.oidc_enabled is False


def test_oidc_enabled_requires_issuer_and_jwks_url():
    with pytest.raises(ValidationError):
        Settings(litellm_master_key="sk-test", oidc_enabled=True)


def test_oidc_enabled_with_issuer_and_jwks_url_is_valid():
    settings = Settings(
        litellm_master_key="sk-test",
        oidc_enabled=True,
        oidc_issuer="https://auth.example.com/application/o/claude-desktop/",
        oidc_jwks_url="http://authentik-server:9000/application/o/claude-desktop/jwks/",
    )

    assert settings.oidc_enabled is True
    assert settings.oidc_issuer == "https://auth.example.com/application/o/claude-desktop/"


def test_oidc_allowed_group_list_parses_csv_and_trims_whitespace():
    settings = Settings(litellm_master_key="sk-test", oidc_allowed_groups="claude-users, claude-admins ,")

    assert settings.oidc_allowed_group_list == ["claude-users", "claude-admins"]


def test_oidc_denied_group_list_parses_csv():
    settings = Settings(litellm_master_key="sk-test", oidc_denied_groups="claude-suspended")

    assert settings.oidc_denied_group_list == ["claude-suspended"]


def test_oidc_defaults_match_documented_groups():
    settings = Settings(litellm_master_key="sk-test")

    assert settings.oidc_allowed_group_list == ["claude-users", "claude-admins"]
    assert settings.oidc_denied_group_list == ["claude-suspended"]
    assert settings.oidc_audience == "ai-gateway"
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd "gateway-auth/ollama-litellm/gateway"
python -m pytest tests/test_config.py -v
```

Expected: `AttributeError: 'Settings' object has no attribute 'oidc_enabled'` (or similar) on every test.

- [ ] **Step 3: Implement the settings fields**

In `gateway-auth/ollama-litellm/gateway/app/config.py`, change the import line:

```python
from pydantic import Field, field_validator
```

to:

```python
from pydantic import Field, field_validator, model_validator
```

Add these fields to the `Settings` class, right after `litellm_config_path: str = "/app/config.yaml"`:

```python
    oidc_enabled: bool = False
    oidc_issuer: str = ""
    oidc_jwks_url: str = ""
    oidc_audience: str = "ai-gateway"
    oidc_allowed_groups: str = "claude-users,claude-admins"
    oidc_denied_groups: str = "claude-suspended"
    oidc_jwks_cache_ttl_seconds: Annotated[int, Field(gt=0)] = 3600
```

Add this validator right after the existing `validate_litellm_base_url` validator:

```python
    @model_validator(mode="after")
    def validate_oidc_requires_issuer_and_jwks(self) -> "Settings":
        if self.oidc_enabled and (not self.oidc_issuer or not self.oidc_jwks_url):
            raise ValueError("OIDC_ISSUER and OIDC_JWKS_URL must be set when OIDC_ENABLED=true")
        return self
```

Add these properties right after `allowed_domain_list`:

```python
    @property
    def oidc_allowed_group_list(self) -> list[str]:
        return [item.strip() for item in self.oidc_allowed_groups.split(",") if item.strip()]

    @property
    def oidc_denied_group_list(self) -> list[str]:
        return [item.strip() for item in self.oidc_denied_groups.split(",") if item.strip()]
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
python -m pytest tests/test_config.py -v
```

Expected: 6 passed.

- [ ] **Step 5: Run the full suite to confirm no regressions**

```bash
python -m pytest -q
```

Expected: all tests pass (previous count + 6).

---

### Task 4: `app/oidc.py` — JWKS cache + JWT verification

**Files:**
- Modify: `gateway-auth/ollama-litellm/gateway/requirements.txt`
- Create: `gateway-auth/ollama-litellm/gateway/app/oidc.py`
- Create: `gateway-auth/ollama-litellm/gateway/tests/oidc_helpers.py`
- Create: `gateway-auth/ollama-litellm/gateway/tests/test_oidc.py`

**Interfaces:**
- Consumes: nothing from earlier tasks (standalone module; uses `httpx.AsyncClient` directly).
- Produces:
  - `class Identity` (dataclass): fields `sub: str`, `username: str`, `groups: list[str]`.
  - `class JWKSUnavailable(Exception)`, `class TokenValidationError(Exception)`, `class TokenForbidden(Exception)` (with `.reason: str` attribute).
  - `class JWKSCache: def __init__(self, http_client: httpx.AsyncClient, jwks_url: str, ttl_seconds: int)`, `async def get_key(self, kid: str) -> jwt.PyJWK`.
  - `async def verify_jwt(token: str, *, issuer: str, audience: str, allowed_groups: set[str], denied_groups: set[str], jwks_cache: JWKSCache) -> Identity` — raises `TokenValidationError` (bad signature/expired/wrong iss or aud/malformed), `TokenForbidden` (valid token, disallowed group), or `JWKSUnavailable` (can't fetch keys and no cache).
  - Test helpers module `tests/oidc_helpers.py` exports `generate_rsa_keypair()`, `build_jwks(private_key, kid="test-kid")`, `make_token(private_key, kid="test-kid", **claim_overrides)` — reused by Task 5, 6, 7, 8 tests.

- [ ] **Step 1: Add the PyJWT dependency**

In `gateway-auth/ollama-litellm/gateway/requirements.txt`, add a new line after `respx>=0.22,<1.0`:

```
PyJWT[crypto]>=2.10,<3.0
```

Install it:

```bash
cd "gateway-auth/ollama-litellm/gateway"
pip install -r requirements.txt
```

- [ ] **Step 2: Write the test helper module**

Create `gateway-auth/ollama-litellm/gateway/tests/oidc_helpers.py`:

```python
import json
import time

import jwt
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.asymmetric.rsa import RSAPrivateKey
from jwt.algorithms import RSAAlgorithm


def generate_rsa_keypair() -> RSAPrivateKey:
    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


def build_jwks(private_key: RSAPrivateKey, kid: str = "test-kid") -> dict:
    public_jwk = json.loads(RSAAlgorithm.to_jwk(private_key.public_key()))
    public_jwk["kid"] = kid
    public_jwk["use"] = "sig"
    public_jwk["alg"] = "RS256"
    return {"keys": [public_jwk]}


def make_token(private_key: RSAPrivateKey, kid: str = "test-kid", **claim_overrides) -> str:
    now = int(time.time())
    claims = {
        "iss": "https://auth.example.com/application/o/claude-desktop/",
        "aud": "ai-gateway",
        "sub": "user-123",
        "preferred_username": "alice",
        "groups": ["claude-users"],
        "iat": now,
        "exp": now + 900,
    }
    claims.update(claim_overrides)
    return jwt.encode(claims, private_key, algorithm="RS256", headers={"kid": kid})
```

- [ ] **Step 3: Write the failing tests**

Create `gateway-auth/ollama-litellm/gateway/tests/test_oidc.py`:

```python
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
```

- [ ] **Step 4: Run the tests to verify they fail**

```bash
python -m pytest tests/test_oidc.py -v
```

Expected: `ModuleNotFoundError: No module named 'app.oidc'` on collection.

- [ ] **Step 5: Implement `app/oidc.py`**

Create `gateway-auth/ollama-litellm/gateway/app/oidc.py`:

```python
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
            # Guard on the specific kid being sought, not just "do we have
            # *any* keys" - a truthy-only check would let a concurrent
            # refresh for a different (already-cached) kid silently skip
            # fetching a newly-rotated key, permanently rejecting tokens
            # signed with it as "unknown kid" until the TTL expires.
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
```

- [ ] **Step 6: Run the tests to verify they pass**

```bash
python -m pytest tests/test_oidc.py -v
```

Expected: 13 passed.

- [ ] **Step 7: Run the full suite to confirm no regressions**

```bash
python -m pytest -q
```

Expected: all tests pass (previous count + 13).

---

### Task 5: `app/auth.py` — dual-path `authenticate()`

**Files:**
- Modify: `gateway-auth/ollama-litellm/gateway/app/auth.py`
- Modify: `gateway-auth/ollama-litellm/gateway/app/main.py` (only the `domain_info` call site)
- Modify: `gateway-auth/ollama-litellm/gateway/tests/conftest.py` (add OIDC fixtures)
- Modify: `gateway-auth/ollama-litellm/gateway/tests/test_auth.py` (dual-auth cases)

**Interfaces:**
- Consumes: `app.oidc.{Identity, JWKSCache, JWKSUnavailable, TokenForbidden, TokenValidationError, verify_jwt}` (Task 4); `app.config.Settings` OIDC fields (Task 3).
- Produces: `async def authenticate(request: Request) -> Identity | None` — returns `None` for a valid master-key request, an `Identity` for a valid JWT, raises `HTTPException(401)` (no/invalid credential), `HTTPException(403)` (valid JWT, disallowed group), or `HTTPException(503)` (JWKS unreachable and uncached). Also sets `request.state.auth_method` to `"master_key"` or `"jwt"` on success. `async def require_bearer_token(request: Request) -> None` delegates to `authenticate`. Task 6 (`main.py` catch-all) and Task 8 (`middleware.py`) both read `request.state.auth_method`; Task 6/7 read the `Identity` returned by `authenticate`.

- [ ] **Step 1: Add OIDC fixtures to `conftest.py`**

In `gateway-auth/ollama-litellm/gateway/tests/conftest.py`, add after the existing `auth_headers` fixture:

```python
@pytest.fixture
def oidc_settings() -> Settings:
    return Settings(
        litellm_base_url="http://litellm:4000",
        litellm_master_key="sk-test",
        oidc_enabled=True,
        oidc_issuer="https://auth.example.com/application/o/claude-desktop/",
        oidc_jwks_url="https://auth.example.com/application/o/claude-desktop/jwks/",
        oidc_audience="ai-gateway",
        oidc_allowed_groups="claude-users,claude-admins",
        oidc_denied_groups="claude-suspended",
    )


@pytest.fixture
def oidc_app(oidc_settings: Settings):
    return create_app(oidc_settings)


@pytest.fixture
async def oidc_client(oidc_app):
    transport = httpx.ASGITransport(app=oidc_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://gateway.test") as test_client:
        yield test_client
```

- [ ] **Step 2: Write the failing tests**

Append to `gateway-auth/ollama-litellm/gateway/tests/test_auth.py` (add these imports at the top, alongside the existing ones):

```python
import httpx
import respx

from oidc_helpers import build_jwks, generate_rsa_keypair, make_token
```

Then append these test functions to the file:

```python
@respx.mock
async def test_valid_jwt_with_allowed_group_is_authorized(oidc_client, oidc_settings):
    private_key = generate_rsa_keypair()
    respx.get(oidc_settings.oidc_jwks_url).mock(return_value=httpx.Response(200, json=build_jwks(private_key)))
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
async def test_master_key_still_works_when_oidc_enabled(oidc_client, oidc_settings):
    response = await oidc_client.get(
        "/api/web/domain_info?domain=github.com",
        headers={"Authorization": f"Bearer {oidc_settings.litellm_master_key}"},
    )

    assert response.status_code == 200


@respx.mock
async def test_suspended_group_returns_403(oidc_client, oidc_settings):
    private_key = generate_rsa_keypair()
    respx.get(oidc_settings.oidc_jwks_url).mock(return_value=httpx.Response(200, json=build_jwks(private_key)))
    token = make_token(
        private_key,
        iss=oidc_settings.oidc_issuer,
        aud=oidc_settings.oidc_audience,
        groups=["claude-users", "claude-suspended"],
    )

    response = await oidc_client.get(
        "/api/web/domain_info?domain=github.com",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 403


@respx.mock
async def test_expired_jwt_returns_401(oidc_client, oidc_settings):
    import time

    private_key = generate_rsa_keypair()
    respx.get(oidc_settings.oidc_jwks_url).mock(return_value=httpx.Response(200, json=build_jwks(private_key)))
    now = int(time.time())
    token = make_token(
        private_key,
        iss=oidc_settings.oidc_issuer,
        aud=oidc_settings.oidc_audience,
        iat=now - 1000,
        exp=now - 100,
    )

    response = await oidc_client.get(
        "/api/web/domain_info?domain=github.com",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 401
    assert response.headers.get("www-authenticate") == "Bearer"


@respx.mock
async def test_jwks_unreachable_returns_503(oidc_client, oidc_settings):
    private_key = generate_rsa_keypair()
    respx.get(oidc_settings.oidc_jwks_url).mock(side_effect=httpx.ConnectError("refused"))
    token = make_token(private_key, iss=oidc_settings.oidc_issuer, aud=oidc_settings.oidc_audience)

    response = await oidc_client.get(
        "/api/web/domain_info?domain=github.com",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 503


async def test_jwt_shaped_token_rejected_when_oidc_disabled(client):
    private_key = generate_rsa_keypair()
    token = make_token(private_key, iss="https://auth.example.com/application/o/claude-desktop/", aud="ai-gateway")

    response = await client.get(
        "/api/web/domain_info?domain=github.com",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 401
```

- [ ] **Step 3: Run the tests to verify they fail**

```bash
python -m pytest tests/test_auth.py -v
```

Expected: fixture errors (`oidc_settings`/`oidc_client` not found until Step 1 is picked up by pytest — should already pass collection since Step 1 added them) and/or 401s instead of 200s, since `authenticate()`/JWT support doesn't exist in `auth.py` yet. At minimum, `test_valid_jwt_with_allowed_group_is_authorized` and `test_suspended_group_returns_403` fail.

- [ ] **Step 4: Implement dual auth in `app/auth.py`**

Replace the entire contents of `gateway-auth/ollama-litellm/gateway/app/auth.py`:

```python
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
```

(Originally this discarded `authenticate()`'s return value. That left `request.state.identity` unset for every route that authenticates via `require_bearer_token` instead of calling `authenticate()` directly — currently only `domain_info`. Task 6 later sets `request.state.identity` itself on the catch-all route, so the gap was invisible until Task 8's access-logging tests exercised `domain_info` with a JWT and expected `user` to be populated. Fixed here so both auth entry points behave identically for anything downstream that reads `request.state.identity`, not just logging.)

- [ ] **Step 5: Update the `domain_info` call site in `main.py`**

In `gateway-auth/ollama-litellm/gateway/app/main.py`, find:

```python
    async def domain_info(request: Request, domain: str | None = None) -> dict[str, bool | str]:
        require_bearer_token(request)
```

Replace with:

```python
    async def domain_info(request: Request, domain: str | None = None) -> dict[str, bool | str]:
        await require_bearer_token(request)
```

- [ ] **Step 6: Run the tests to verify they pass**

```bash
python -m pytest tests/test_auth.py -v
```

Expected: all tests in the file pass (existing + 6 new).

- [ ] **Step 7: Run the full suite to confirm no regressions**

```bash
python -m pytest -q
```

Expected: all tests pass.

---

### Task 6: `app/main.py` — enforce auth on the catch-all proxy route

**Files:**
- Modify: `gateway-auth/ollama-litellm/gateway/app/main.py`
- Modify: `gateway-auth/ollama-litellm/gateway/tests/test_proxy.py`

**Interfaces:**
- Consumes: `app.auth.authenticate` (Task 5), `app.oidc.JWKSCache` (Task 4).
- Produces: every request to the catch-all route (`/{path:path}`) is authenticated before proxying; `request.state.identity` holds the `Identity | None` result for Task 7 (`proxy.py`) to read. `app.state.jwks_cache` is a persistent `JWKSCache` created in `lifespan`, reused across requests (the per-request fallback in `authenticate()` from Task 5 becomes dead code in production once this lands, but keeps working in tests that don't run lifespan).

- [ ] **Step 1: Write the failing test**

Add to `gateway-auth/ollama-litellm/gateway/tests/test_proxy.py` (imports already present: `httpx`, `pytest`, `respx`):

```python
async def test_catch_all_proxy_requires_authentication(client):
    response = await client.get("/v1/models")

    assert response.status_code == 401
    assert response.headers.get("www-authenticate") == "Bearer"
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd "gateway-auth/ollama-litellm/gateway"
python -m pytest tests/test_proxy.py::test_catch_all_proxy_requires_authentication -v
```

Expected: FAIL — currently the catch-all proxy has no auth check, so an unauthenticated request reaches the (unmocked) upstream and the test gets a 502/other status instead of 401.

- [ ] **Step 3: Enforce auth in `main.py` and create the persistent JWKS cache**

In `gateway-auth/ollama-litellm/gateway/app/main.py`, update the import line:

```python
from app.auth import require_bearer_token
```

to:

```python
from app.auth import authenticate, require_bearer_token
from app.oidc import JWKSCache
```

Update `lifespan`:

```python
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
```

Update `catch_all_proxy`:

```python
    @app.api_route(
        "/{path:path}",
        methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
    )
    async def catch_all_proxy(request: Request):
        identity = await authenticate(request)
        request.state.identity = identity
        return await proxy_to_litellm(request)
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
python -m pytest tests/test_proxy.py::test_catch_all_proxy_requires_authentication -v
```

Expected: PASS.

- [ ] **Step 5: Run the full suite to confirm no regressions**

```bash
python -m pytest -q
```

Expected: all tests pass — every existing `test_proxy.py` test already sends `auth_headers` (the master key), so they continue to succeed under the new enforcement.

---

### Task 7: `app/proxy.py` — credential swap + identity header forwarding

**Files:**
- Modify: `gateway-auth/ollama-litellm/gateway/app/proxy.py`
- Modify: `gateway-auth/ollama-litellm/gateway/tests/test_proxy.py`

**Interfaces:**
- Consumes: `request.state.identity` (`Identity | None`, set by Task 6's `catch_all_proxy`).
- Produces: when `request.state.identity` is not `None`, the outbound `Authorization` header to LiteLLM becomes `Bearer <LITELLM_MASTER_KEY>` and `x-authenticated-user`/`x-authenticated-sub` are added; any client-supplied `x-authenticated-user`/`x-authenticated-sub` headers are always stripped first, regardless of auth method.

- [ ] **Step 1: Write the failing tests**

Add to `gateway-auth/ollama-litellm/gateway/tests/test_proxy.py` (add `from oidc_helpers import build_jwks, generate_rsa_keypair, make_token` to the imports):

```python
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
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
python -m pytest tests/test_proxy.py::test_jwt_identity_is_swapped_for_master_key_before_upstream tests/test_proxy.py::test_client_supplied_identity_headers_are_stripped -v
```

Expected: `test_jwt_identity_is_swapped_for_master_key_before_upstream` fails (the JWT itself is still forwarded as-is, no swap yet). `test_client_supplied_identity_headers_are_stripped` currently passes trivially by accident (nothing sets those headers today) but will be exercised meaningfully once Step 3 lands — run it anyway to confirm no regression later.

- [ ] **Step 3: Implement the swap in `app/proxy.py`**

In `gateway-auth/ollama-litellm/gateway/app/proxy.py`, replace `HOP_BY_HOP_HEADERS` and `filtered_request_headers`:

```python
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
```

Update the call site in `proxy_to_litellm`:

```python
async def proxy_to_litellm(request: Request) -> StreamingResponse | JSONResponse:
    settings: Settings = request.app.state.settings
    url = upstream_url(settings, request.url.path, request.url.query)
    headers = filtered_request_headers(request, settings)
```

(the rest of `proxy_to_litellm` is unchanged)

- [ ] **Step 4: Run the tests to verify they pass**

```bash
python -m pytest tests/test_proxy.py -v
```

Expected: all tests in the file pass, including both new ones. Note `test_proxy_forwards_authorization_header` (existing test, master-key path, no `identity` set) still asserts `request.headers["authorization"] == "Bearer sk-test"` — confirm this still passes, since the swap only triggers when `identity is not None`.

- [ ] **Step 5: Run the full suite to confirm no regressions**

```bash
python -m pytest -q
```

Expected: all tests pass.

---

### Task 8: `app/middleware.py` — log identity and auth method

**Files:**
- Modify: `gateway-auth/ollama-litellm/gateway/app/middleware.py`
- Modify: `gateway-auth/ollama-litellm/gateway/tests/test_proxy.py`

**Interfaces:**
- Consumes: `request.state.identity` (Task 6), `request.state.auth_method` (Task 5).
- Produces: the `request_complete` log record gains `user` (identity's username, or `None`) and `auth_method` (`"jwt"`, `"master_key"`, or `None`) fields.

- [ ] **Step 1: Write the failing tests**

Add to `gateway-auth/ollama-litellm/gateway/tests/test_proxy.py`:

```python
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
```

(`logging`, `respx`, `httpx`, and the `oidc_helpers` imports are already present in the file from earlier tasks.)

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd "gateway-auth/ollama-litellm/gateway"
python -m pytest tests/test_proxy.py::test_access_log_records_auth_method_for_master_key tests/test_proxy.py::test_access_log_records_user_and_auth_method_for_jwt -v
```

Expected: `AttributeError: 'LogRecord' object has no attribute 'auth_method'`.

- [ ] **Step 3: Implement logging in `app/middleware.py`**

In `gateway-auth/ollama-litellm/gateway/app/middleware.py`, replace the `LOGGER.info(...)` call inside the `finally` block:

```python
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
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
python -m pytest tests/test_proxy.py -v
```

Expected: all tests in the file pass, including both new ones.

- [ ] **Step 5: Run the full suite to confirm no regressions**

```bash
python -m pytest -q
```

Expected: all tests pass. This is the last gateway code task — record the total test count for reference in Task 10/11's checklists.

---

### Task 9: Local rebuild + `docker compose config` re-validation

**Files:**
- None (verification-only task, closes out the coding phase before deploy).

**Interfaces:**
- Consumes: everything from Tasks 1–8.
- Produces: confidence that the Docker image builds with the new `PyJWT[crypto]` dependency and the full merged Compose project still validates.

- [ ] **Step 1: Rebuild the gateway image**

```bash
cd "gateway-auth"
docker compose build claude-gateway
```

Expected: build succeeds, `pip install -r requirements.txt` inside the image installs `PyJWT` and `cryptography` without errors.

- [ ] **Step 2: Re-validate the full Compose project**

```bash
docker compose config --quiet
docker compose --profile tunnel config --quiet
```

Expected: both exit 0.

- [ ] **Step 3: Bring up everything except Cloudflare ingress and check health**

```bash
docker compose up -d db redis server worker litellm claude-gateway
docker compose ps
```

Expected: all listed services reach `healthy` (or `running` for ones without a healthcheck) within ~2 minutes. Investigate any that don't before proceeding to Task 10/11.

- [ ] **Step 4: Confirm the gateway can resolve Authentik internally**

```bash
docker compose exec claude-gateway python -c "import urllib.request; print(urllib.request.urlopen('http://authentik-server:9000/application/o/claude-desktop/jwks/', timeout=5).status)"
```

Expected: prints `200` (or `404`/`400` if Authentik hasn't finished reconciling the blueprint yet — re-check after `docker compose logs worker | grep -i blueprint` shows it applied; do not proceed to Task 10 until this returns `200`).

---

### Task 10: Deploy checklist — Local + Cloudflare Tunnel (manual, operator-run)

This task is an operational runbook, not a coding task — there is no subagent-executable test. Run it yourself (or hand it to whoever owns the demo) after Task 9 passes.

**Files:** none.

- [ ] **Step 1: Create the tunnel in Cloudflare Zero Trust**

In the Cloudflare dashboard: Zero Trust → Networks → Tunnels → Create a tunnel (type: Cloudflared) → name it (e.g. `gateway-auth-demo`) → copy the generated token.

- [ ] **Step 2: Configure the Public Hostname**

In the same tunnel's configuration, add a Public Hostname:
- Subdomain/domain: matches `AUTH_DOMAIN` in `gateway-auth/.env`
- Service type: `HTTP`
- URL: `authentik-server:9000`

- [ ] **Step 3: Set secrets and bring up the tunnel profile**

```bash
cd "gateway-auth"
# Edit .env: set CLOUDFLARE_TUNNEL_TOKEN to the value copied in Step 1.
docker compose --profile tunnel up -d
```

Expected: `docker compose ps` shows `cloudflared` running.

- [ ] **Step 4: Verify OIDC discovery through the tunnel**

```bash
curl -fsS "https://${AUTH_DOMAIN}/application/o/claude-desktop/.well-known/openid-configuration" | jq .issuer
```

Expected: prints the issuer URL, and it matches `OIDC_ISSUER` as computed in `gateway-auth/ollama-litellm/docker-compose.yml` (`https://${AUTH_DOMAIN}/application/o/claude-desktop/`) exactly, including the trailing slash.

- [ ] **Step 5: Create a test user and confirm the full flow**

In the Authentik admin UI (via the tunnel URL): create a user, add it to `claude-users`. Configure Claude Desktop's SSO settings to point at `https://${AUTH_DOMAIN}` with client id `claude-desktop`. Complete a login. Then:

```bash
# Paste the access_token Claude Desktop obtained (check its logs/devtools).
curl -H "Authorization: Bearer <ACCESS_TOKEN>" http://localhost:4100/v1/models
```

Expected: HTTP 200 with a model list. Decode the token (e.g. at jwt.io or `python -c "import jwt; print(jwt.decode('<TOKEN>', options={'verify_signature': False}))"`) and confirm `exp - iat == 28800` (8 hours), matching Task 2's DEMO setting.

- [ ] **Step 6: Confirm the master key still works and suspension is enforced**

```bash
curl -H "Authorization: Bearer ${LITELLM_MASTER_KEY}" http://localhost:4100/v1/models   # expect 200
```

Move the test user into `claude-suspended` in Authentik, request a fresh token, and confirm the gateway now returns 403 for it (a still-valid old token issued before suspension will keep working until it expires — this is the accepted revocation-gap tradeoff from the plan's risk section).

---

### Task 11: Deploy checklist — VM + Cloudflare DNS (manual, operator-run)

Also an operational runbook. Run after Task 10 has proven the code path works, when you're ready to test the second deploy mode.

**Files:** none (touches `gateway-auth/authentik/docs/installation.md`'s existing host-nginx steps, unchanged).

- [ ] **Step 1: Provision the VM and copy the project**

Provision a Linux VM (Docker Engine 24+, Compose v2 plugin — see `gateway-auth/authentik/docs/installation.md` prerequisites). Copy the entire `gateway-auth/` directory to it (excluding `.env` — recreate secrets on the VM, don't reuse demo secrets from your laptop).

- [ ] **Step 2: Point DNS at the VM**

In Cloudflare DNS, create an A/AAAA record for `AUTH_DOMAIN` pointing at the VM's public IP, proxy status ON (orange-cloud).

- [ ] **Step 3: Install and configure the host nginx**

Follow `gateway-auth/authentik/docs/installation.md`'s "Reverse proxy" and "TLS" sections exactly as written (paths are unaffected by the move — that doc's instructions are all relative to being inside the `authentik/` directory on the VM). This gets you a real TLS cert on the origin, satisfying Cloudflare's Full (strict) mode.

- [ ] **Step 4: Bring up the stack (no tunnel profile — nginx is the ingress here)**

```bash
cd gateway-auth
cp .env.example .env   # then fill in real secrets
docker compose up -d
```

- [ ] **Step 5: Run the existing OIDC verification script**

```bash
cd authentik
./scripts/verify-oidc.sh
```

Expected: all checks print `[PASS]` (this script is unchanged by this plan — it already checks discovery document fields, JWKS reachability, and that JWKS contains no private key material).

- [ ] **Step 6: Repeat Task 10 Steps 4–6 against this deployment**

Confirm discovery issuer match, a real login through Claude Desktop, gateway 200 with a real token, master key still works, and suspension enforcement — same checks, different ingress path. This closes out the "works in both deploy modes" requirement from the design.

---

### Task 12: Hardening — close LiteLLM's port 4000

Only do this once Task 10 or 11 has proven the JWT path works end-to-end — closing this port removes the fallback of hitting LiteLLM directly.

**Files:**
- Modify: `gateway-auth/ollama-litellm/docker-compose.yml`

**Interfaces:** none (infrastructure-only change).

- [ ] **Step 1: Remove the host port mapping**

In `gateway-auth/ollama-litellm/docker-compose.yml`, find the `litellm` service's:

```yaml
    expose:
      - "4000"
    ports:
      - "4000:4000"
```

Replace with:

```yaml
    expose:
      - "4000"
```

- [ ] **Step 2: Recreate and verify**

```bash
cd "gateway-auth"
docker compose config --quiet
docker compose up -d litellm
curl -m 3 http://localhost:4000/health/liveliness
```

Expected: `docker compose config` exits 0; the `curl` from the host fails to connect (connection refused/timeout) — LiteLLM is no longer reachable except through the gateway.

- [ ] **Step 3: Confirm the gateway path still works**

```bash
curl -H "Authorization: Bearer ${LITELLM_MASTER_KEY}" http://localhost:4100/v1/models
```

Expected: HTTP 200 — proxying through the gateway is unaffected by closing LiteLLM's direct port.

---

## Self-Review Notes

- **Spec coverage:** restructure (Task 1) · token lifetime (Task 2) · config (Task 3) · JWKS/JWT verification incl. rotation/stale-cache/algorithm-confusion (Task 4) · dual auth incl. all status-code semantics from the design's test table (Task 5) · catch-all enforcement (Task 6) · credential swap + spoofing defense (Task 7) · audit logging (Task 8) · build/compose re-check (Task 9) · both deploy modes (Task 10, 11) · port 4000 hardening (Task 12) — every section of `gateway-auth-plan.md` maps to a task.
- **No placeholders:** every step has complete, runnable code or exact commands with expected output; no "add error handling"-style steps.
- **No git steps:** consistent with Global Constraints — every task ends in a run/verify command, never a commit.
- **Type/name consistency checked:** `Identity`, `JWKSCache`, `JWKSUnavailable`, `TokenForbidden`, `TokenValidationError`, `verify_jwt` (Task 4) are used with identical names/signatures in Task 5 (`auth.py`), Task 6 (`main.py`), Task 7 (`proxy.py` reads `request.state.identity`), and Task 8 (`middleware.py` reads `request.state.identity`/`request.state.auth_method`). `oidc_allowed_group_list`/`oidc_denied_group_list`/`oidc_jwks_url`/`oidc_issuer`/`oidc_audience`/`oidc_jwks_cache_ttl_seconds` (Task 3) are used with identical names in Task 4's test fixtures, Task 5's `auth.py`, and Task 6's `main.py`.
