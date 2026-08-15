# Architecture

## OIDC login flow (Claude Desktop, public client + PKCE)

```mermaid
sequenceDiagram
    autonumber
    participant CD as Claude Desktop
    participant BR as System Browser
    participant AK as Authentik (auth.company.com)
    participant AI as AI Gateway (out of scope)

    CD->>CD: Generate code_verifier + code_challenge (S256)
    CD->>CD: Start loopback listener on http://127.0.0.1:<ephemeral>/callback
    CD->>BR: Open /application/o/authorize/?client_id=claude-desktop&...&code_challenge=...&scope=openid+profile+email+offline_access+inference
    BR->>AK: GET authorize
    AK->>BR: Redirect to identification / login flow
    BR->>AK: User authenticates (password / MFA / external IdP)
    AK->>BR: Consent screen (default-provider-authorization-explicit-consent)
    BR->>AK: Consent granted
    AK->>BR: 302 to http://127.0.0.1:<port>/callback?code=<code>&state=<state>
    BR->>CD: Loopback delivers code
    CD->>AK: POST /application/o/token/  (code + code_verifier + client_id)
    AK->>CD: id_token + access_token (15m, aud=ai-gateway) + refresh_token (8h)
    CD->>AI: Bearer <access_token> on downstream API requests
    Note over AI: Gateway validates JWT signature via JWKS,<br/>checks aud and groups[] claims.
```

Key properties:

- **Public client**, no client secret. PKCE S256 required.
- Redirect URI is a **regex** allowing any loopback port
  (`^http://127\.0\.0\.1:[0-9]{1,5}/callback$`) per RFC 8252.
- Access token lifetime **15 minutes**; refresh token **8 hours**.
- `id_token` includes claims.
- Custom `inference` scope adds `groups`, `roles`, and `aud=ai-gateway` to the
  access token so downstream can enforce audience-based authorization.

## Service topology

```mermaid
flowchart LR
    subgraph Internet
        U[User Browser]
        C[Claude Desktop]
    end

    subgraph Edge
        NG[nginx TLS/HTTP2<br/>rate limits + security headers]
    end

    subgraph Docker[Docker network: internal]
        SRV[authentik-server<br/>ghcr.io/goauthentik/server:2025.10.0]
        WRK[authentik-worker<br/>same image, cmd=worker]
        DB[(postgres:16-alpine)]
        RD[(redis:7-alpine)]
    end

    U -- HTTPS 443 --> NG
    C -- HTTPS 443 --> NG
    NG -- HTTP :9000 --> SRV
    NG -- WSS /ws/ --> SRV
    SRV --- DB
    SRV --- RD
    WRK --- DB
    WRK --- RD

    classDef ext fill:#eef,stroke:#66f;
    classDef edge fill:#efe,stroke:#6a6;
    classDef svc fill:#fff5cc,stroke:#c90;
    class U,C ext
    class NG edge
    class SRV,WRK,DB,RD svc
```

- Only `nginx` is exposed to the internet.
- DB and Redis have **no** host port bindings.
- Server + worker share the same image; role is chosen by `command:`.
- Blueprints live in `./blueprints/` bind-mounted at `/blueprints/custom` (read-only).
