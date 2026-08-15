# Authentik OIDC deployment for Claude Desktop

Production-adjacent scaffolding to run [Authentik](https://goauthentik.io/) as
an external OIDC Identity Provider for **Claude Desktop** (public client,
authorization_code + PKCE, refresh tokens, `inference` scope with `aud=ai-gateway`).

This repository is **identity only**. It does NOT include the AI Gateway or
LiteLLM. It does NOT validate JWTs. Downstream services own that.

## Version pins

| Component  | Version                                   |
|------------|-------------------------------------------|
| Authentik  | `ghcr.io/goauthentik/server:2025.10.0`    |
| PostgreSQL | `docker.io/library/postgres:16-alpine`    |
| Redis      | `docker.io/library/redis:7-alpine`        |

Never use `latest`.

## Resource requirements

Per the Authentik operator docs, minimum recommended:

- **2 CPU cores**
- **2 GB RAM**
- ~5 GB disk for DB + media (grows with users and event logs)

For >1k users or heavy OIDC traffic, scale to 4 CPU / 4 GB and consider a
managed Postgres.

## Directory layout

> หมายเหตุ: โฟลเดอร์นี้ถูกย้ายมาจาก `authentik-deployment/` เดิม (รวมเข้า
> `gateway-auth/` ผ่าน Docker Compose `include:`) — path ในสคริปต์และ docs
> ภายในอาจยังอ้างชื่อเก่า ให้รันทุกคำสั่งจาก `gateway-auth/` เป็น root

```
gateway-auth/
├── compose.yml                    # root: include authentik + ollama-litellm
└── authentik/                     # (เดิม authentik-deployment/)
    ├── compose.yml                # base stack: db, redis, server, worker
    ├── compose.override.yml       # dev-only: exposes 9000/9443 on 127.0.0.1
    ├── .env.example               # ค่าจาก root .env (interpolated)
    ├── Makefile                   # init / secrets / up / verify / backup / ...
    ├── blueprints/
    │   └── claude-desktop.yaml    # groups, scopes, provider, application, policy
    ├── nginx/
    │   ├── nginx.conf             # main config
    │   └── conf.d/
    │       └── auth.company.com.conf  # TLS vhost + security headers
    ├── scripts/
    │   ├── generate-secrets.sh
    │   ├── bootstrap.sh
    │   ├── verify-oidc.sh
    │   ├── backup.sh
    │   └── restore.sh
    ├── docs/                      # เอกสารเฉพาะ Authentik
    ├── media/                     # persistent, user uploads / branding
    ├── custom-templates/          # persistent, custom email/UI templates
    ├── certs/                     # persistent, Authentik internal cert store
    └── backups/                   # timestamped tarballs (git-ignored)
```

## Quick start

```bash
# 1. Configuration
make init                          # creates .env from .env.example (mode 600)
make secrets                       # fills in strong PG_PASS + AUTHENTIK_SECRET_KEY
$EDITOR .env                       # set AUTH_DOMAIN, SMTP, TLS paths

# 2. TLS
# Put fullchain + key in ./certs/ or wherever TLS_CERT_PATH/TLS_KEY_PATH point.

# 3. Bring up
./scripts/bootstrap.sh             # pulls, starts, waits for health

# 4. Complete the initial setup in the browser
#    Open https://<AUTH_DOMAIN>/if/flow/initial-setup/
#    Set the akadmin password. Enable MFA for it immediately (see docs).

# 5. Blueprint auto-applies from ./blueprints/
make logs | grep -i blueprint

# 6. Verify OIDC discovery
make verify
```

## Security notes

- `.env` is mode 600 and git-ignored. Never commit real secrets.
- Postgres and Redis have **no** host port bindings.
- Authentik's internal 9000/9443 are only exposed by the dev override; in
  production remove `compose.override.yml`.
- All ingress goes through the reverse proxy in `nginx/` with HSTS, HTTPS
  redirect, rate limits, and security headers.
- The `inference` scope adds `aud: ai-gateway` to the access token. The AI
  Gateway (out of scope here) is responsible for validating that audience.
- Backups are unencrypted tarballs by default. See `docs/backup-restore.md`
  for GPG encryption guidance.

## More docs

- [Architecture](docs/architecture.md)
- [Installation](docs/installation.md)
- [Authentik configuration](docs/authentik-configuration.md)
- [Claude Desktop setup](docs/claude-desktop-setup.md)
- [Active Directory](docs/active-directory-setup.md)
- [External IdPs](docs/external-idp-setup.md)
- [Backup and restore](docs/backup-restore.md)
- [Production hardening](docs/production-hardening.md)
- [Troubleshooting](docs/troubleshooting.md)




  Quick start (จาก `gateway-auth/`):
  make -C authentik init && make -C authentik secrets
  $EDITOR .env                  # AUTH_DOMAIN, SMTP, TLS paths
  ./authentik/scripts/bootstrap.sh
  # https://<AUTH_DOMAIN>/if/flow/initial-setup/   (trailing slash required)
  make -C authentik verify