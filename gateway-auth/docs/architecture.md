# Gateway Auth — Architecture

## System Overview

```mermaid
graph TB
    subgraph Internet["Internet"]
        USER["User / Claude Desktop"]
        CF["Cloudflare Edge"]
    end

    subgraph Docker["Docker Host"]
        subgraph net_internal["network: internal"]
            DB[("PostgreSQL<br/>db:5432")]
            REDIS[("Redis<br/>redis:6379")]
            AUTH_SERVER["Authentik Server<br/>authentik-server:9000"]
            AUTH_WORKER["Authentik Worker"]
            CF_TUNNEL["cloudflared<br/>(profile: tunnel)"]
        end

        subgraph net_ai["network: ai-gateway"]
            GW["Claude Gateway<br/>:4100"]
            LITELLM["LiteLLM<br/>litellm:4000"]
        end
    end

    subgraph Upstream["Upstream"]
        OLLAMA["Ollama Cloud<br/>ollama.com/v1"]
    end

    USER -->|"OAuth (browser)"| CF
    CF -->|"HTTPS tunnel"| CF_TUNNEL
    CF_TUNNEL -->|"HTTP :9000"| AUTH_SERVER
    USER -->|"API requests<br/>Bearer JWT"| GW
    GW -->|"JWKS fetch<br/>HTTP internal"| AUTH_SERVER
    GW -->|"proxy + credential swap<br/>Bearer master_key"| LITELLM
    LITELLM -->|"OpenAI-compatible API"| OLLAMA
    AUTH_SERVER --> DB
    AUTH_SERVER --> REDIS
    AUTH_WORKER --> DB
    AUTH_WORKER --> REDIS
```

## Authentication Flow (OIDC + PKCE)

```mermaid
sequenceDiagram
    actor User
    participant CD as Claude Desktop
    participant Browser
    participant Auth as Authentik
    participant GW as Gateway
    participant LLM as LiteLLM

    Note over CD: Generate code_verifier + code_challenge (S256)

    CD->>Browser: Open system browser to /authorize
    Browser->>Auth: GET /application/o/authorize/?<br/>client_id=claude-desktop&<br/>code_challenge=S256&<br/>scope=openid profile email offline_access inference&<br/>redirect_uri=http://127.0.0.1:{port}/callback

    Auth->>Browser: Redirect to login flow
    User->>Auth: Authenticate (password / MFA / external IdP)
    Auth->>Browser: Consent screen
    User->>Auth: Grant consent
    Auth->>Browser: 302 → http://127.0.0.1:{port}/callback?code=XYZ

    Browser->>CD: Loopback delivers authorization code
    CD->>Auth: POST /application/o/token/<br/>code + code_verifier
    Auth->>CD: id_token + access_token + refresh_token

    loop Every API call
        CD->>GW: POST /v1/chat/completions<br/>Authorization: Bearer {access_token}
        GW->>GW: Verify JWT (RS256, iss, aud, exp, groups)
        GW->>LLM: POST /v1/chat/completions<br/>Authorization: Bearer {master_key}<br/>x-authenticated-user: {username}
        LLM->>LLM: Route model → upstream
        LLM-->>GW: Streaming response
        GW-->>CD: Streaming response
    end
```

## Request Flow (Inference)

```mermaid
flowchart TD
    REQ["Incoming Request<br/>Authorization: Bearer {token}"]
    CHECK_HEADER{"Authorization<br/>header present?"}
    E401A["401 + WWW-Authenticate"]

    CHECK_MASTER{"Matches<br/>master key?<br/>(constant-time)"}
    MASTER_OK["identity = None<br/>auth_method = master_key"]

    OIDC_ON{"OIDC<br/>enabled?"}
    E401B["401"]

    DECODE["Decode JWT header<br/>extract kid"]
    JWKS_CACHE{"kid in<br/>JWKS cache?"}
    FETCH["Fetch JWKS from<br/>authentik-server:9000"]
    FETCH_OK{"Fetch<br/>success?"}
    STALE{"Stale<br/>cache?"}
    E503["503 Service Unavailable"]
    STALE_OK["Serve stale cache"]

    VERIFY["Verify JWT:<br/>RS256, iss, aud, exp"]
    VERIFY_OK{"Valid?"}
    E401C["401"]

    RBAC{"Groups check"}
    DENIED{"claude-suspended?"}
    E403A["403 Forbidden"]
    ALLOWED{"claude-users<br/>or claude-admins?"}
    E403B["403 Forbidden"]

    SWAP["Swap Authorization → master_key<br/>Inject x-authenticated-user<br/>Strip spoofed headers"]
    PROXY["Proxy to LiteLLM :4000"]
    RESP["Return response"]

    REQ --> CHECK_HEADER
    CHECK_HEADER -->|No| E401A
    CHECK_HEADER -->|Yes| CHECK_MASTER
    CHECK_MASTER -->|Yes| MASTER_OK
    CHECK_MASTER -->|No| OIDC_ON
    OIDC_ON -->|No| E401B
    OIDC_ON -->|Yes| DECODE
    DECODE --> JWKS_CACHE
    JWKS_CACHE -->|Yes| VERIFY
    JWKS_CACHE -->|No| FETCH
    FETCH --> FETCH_OK
    FETCH_OK -->|Yes| VERIFY
    FETCH_OK -->|No| STALE
    STALE -->|Yes| STALE_OK
    STALE -->|No| E503
    STALE_OK --> VERIFY
    VERIFY --> VERIFY_OK
    VERIFY_OK -->|No| E401C
    VERIFY_OK -->|Yes| RBAC
    RBAC --> DENIED
    DENIED -->|Yes| E403A
    DENIED -->|No| ALLOWED
    ALLOWED -->|No| E403B
    ALLOWED -->|Yes| SWAP
    MASTER_OK --> SWAP
    SWAP --> PROXY
    PROXY --> RESP
```

## Service Topology

```mermaid
graph LR
    subgraph Host["Host Machine"]
        subgraph internal["network: internal (bridge)"]
            db[(PostgreSQL 16)]
            redis[(Redis 7)]
            server[Authentik Server<br/>:9000 :9443]
            worker[Authentik Worker]
            cloudflared[cloudflared<br/>profile: tunnel]
        end
        subgraph ai_gateway["network: ai-gateway (bridge)"]
            gateway[Claude Gateway<br/>:4100 → host:4100]
            litellm[LiteLLM<br/>:4000 exposed only]
        end
    end

    gateway -.->|dual-homed| internal
    gateway --> litellm
    server --> db
    server --> redis
    worker --> db
    worker --> redis
    cloudflared --> server
```

## Container Details

| Service | Image | Port (container) | Port (host) | Network | Healthcheck |
|---------|-------|------------------|-------------|---------|-------------|
| `db` | `postgres:16-alpine` | 5432 | — | `internal` | `pg_isready` |
| `redis` | `redis:7-alpine` | 6379 | — | `internal` | `redis-cli ping` |
| `server` | `goauthentik/server:2025.10.0` | 9000, 9443 | — (dev: 127.0.0.1:9000) | `internal` | `ak healthcheck` |
| `worker` | `goauthentik/server:2025.10.0` | — | — | `internal` | `ak healthcheck` |
| `claude-gateway` | custom `gateway/Dockerfile` | 4100 | 4100 | `ai-gateway` + `internal` | `GET /health` |
| `litellm` | `berriai/litellm:main-latest` | 4000 | — | `ai-gateway` | `GET /health/liveliness` |
| `cloudflared` | `cloudflare/cloudflared:latest` | — | — | `internal` | — |

## Gateway API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/health` | No | Gateway health check |
| `GET` | `/ready` | No | Gateway + LiteLLM readiness |
| `GET` | `/` | No | HTML dashboard |
| `GET` | `/web` | No | HTML dashboard |
| `GET` | `/api/gateway/info` | No | Dashboard JSON |
| `GET` | `/api/web/domain_info?domain=` | Yes | Domain allowlist check |
| `GET` | `/claude-desktop/api/web/domain_info?domain=` | Yes | Claude Desktop domain check |
| `ANY` | `/{path:path}` | Yes | Catch-all proxy → LiteLLM |

## Auth Decision Matrix

| Scenario | Response |
|----------|----------|
| No `Authorization` header | `401` + `WWW-Authenticate: Bearer` |
| Valid master key | `identity=None`, pass through |
| Valid JWT, allowed group | `identity` set, credential swapped |
| Valid JWT, `claude-suspended` | `403 Forbidden` |
| Valid JWT, no allowed group | `403 Forbidden` |
| Expired JWT | `401` |
| Wrong `aud` / `iss` | `401` |
| Wrong signing key | `401` |
| HS256 algorithm (confusion attack) | `401` |
| JWKS unreachable, no cache | `503` |
| JWKS unreachable, stale cache | `200` (stale-while-error) |
| OIDC disabled + JWT | `401` (master key only) |

## Model Routing

| Client Model | Upstream |
|-------------|----------|
| `glm-5.2` | `openai/glm-5.2:cloud` |
| `deepseek-v4-pro` | `openai/deepseek-v4-pro:cloud` |
| `kimi-k2.7-code` | `openai/kimi-k2.7-code:cloud` |
| `sonnet` / `claude-sonnet-4-5` / `anthropic/claude-sonnet-4-5` | `openai/kimi-k2.7-code:cloud` |
| `opus` / `mythos` | `openai/deepseek-v4-pro:cloud` |
| `haiku` / `fable` | `openai/glm-5.2:cloud` |

All models route to `https://ollama.com/v1` via OpenAI-compatible API.

## Authentik Blueprint (Provisioned Automatically)

| Resource | Value |
|----------|-------|
| **Groups** | `claude-users`, `claude-admins`, `claude-suspended` |
| **Client ID** | `claude-desktop` (public, PKCE) |
| **Redirect URIs** | `^http://127\.0\.0\.1:[0-9]{1,5}/callback$` |
| **Grant Types** | `authorization_code`, `refresh_token` |
| **Access Token TTL** | 8h (demo) |
| **Refresh Token TTL** | 24h |
| **Signing Key** | Authentik self-signed certificate |
| **Policy** | Deny `claude-suspended`; require `claude-users` or `claude-admins` |

## Key Design Decisions

1. **Dual-homed gateway** — `claude-gateway` connects to both `ai-gateway` (LiteLLM) and `internal` (Authentik JWKS), avoiding internet round-trips for token verification.

2. **Credential swapping** — User JWT is replaced with LiteLLM master key before proxying. LiteLLM never sees user tokens. Identity forwarded via `x-authenticated-user` / `x-authenticated-sub`.

3. **Anti-spoofing** — Client-supplied `x-authenticated-user` and `x-authenticated-sub` headers are always stripped.

4. **Algorithm lockdown** — Only `RS256` accepted. HS256 and others rejected to prevent algorithm confusion attacks.

5. **Stale-while-error** — JWKS cache serves stale data if Authentik is unreachable (availability over freshness).

6. **LiteLLM port hardening** — Port 4000 is `expose`d but not `ports`-published. All traffic must go through the gateway.

7. **Inference bypasses Cloudflare** — Only OAuth browser flows use the tunnel. Inference stays local to avoid Cloudflare's 100s idle timeout on streaming.

8. **Single Compose project** — Uses `include:` to merge three compose files, enabling cross-service networking without external networks.

## Directory Structure

```
gateway-auth/
├── compose.yml                    # Root compose (includes sub-compose + cloudflared profile)
├── .env                           # All secrets (git-ignored)
├── .env.example                   # Env template
├── runbook.md                     # Setup runbook
├── cloudflare.md                  # Cloudflare tunnel config
├── docs/
│   └── architecture.md            # This file
├── authentik/
│   ├── compose.yml                # db, redis, server, worker
│   ├── compose.override.yml       # Dev: expose 9000/9443 on loopback
│   ├── blueprints/
│   │   └── claude-desktop.yaml    # Idempotent blueprint
│   ├── nginx/                     # TLS + reverse proxy (VM+DNS mode)
│   ├── scripts/                   # generate-secrets, bootstrap, verify-oidc, backup, restore
│   └── docs/                      # Authentik-specific docs
└── ollama-litellm/
    ├── docker-compose.yml         # claude-gateway + litellm
    ├── config.yaml                # Model routing
    └── gateway/
        ├── Dockerfile
        ├── app/
        │   ├── main.py            # FastAPI app + routes
        │   ├── config.py          # Pydantic settings
        │   ├── auth.py            # Dual auth (master key + JWT)
        │   ├── oidc.py            # JWKS cache + JWT verification
        │   ├── proxy.py           # Request proxying + credential swap
        │   ├── middleware.py       # Request context + access logging
        │   ├── domain_policy.py   # Domain allowlist
        │   ├── dashboard.py       # HTML dashboard
        │   └── logging_config.py  # JSON log formatter
        └── tests/
            ├── test_auth.py
            ├── test_oidc.py
            ├── test_proxy.py
            ├── test_domain_policy.py
            ├── test_dashboard.py
            └── test_config.py
```
