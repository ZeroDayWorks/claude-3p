# Production hardening

Everything below the "Non-negotiables" line is fair game to relax in a lab.
Above it is not.

## Non-negotiables

- **HSTS on** with `max-age=31536000; includeSubDomains` (see
  `nginx/conf.d/auth.company.com.conf`). Only enable after you are sure
  the domain is HTTPS-only forever - HSTS is sticky.
- **MFA for akadmin** (TOTP or WebAuthn) enrolled during initial setup.
  Bind a "require MFA" stage to the admin authentication flow so it cannot
  be bypassed even if the enrolment is deleted.
- **Rate limits** on `/api/` and `/-/user/authenticate/` (already in the
  nginx config: 30 r/s api, 5 r/s auth). Tune based on legitimate traffic.
- **Image pinning**: never `latest`. This repo pins
  `ghcr.io/goauthentik/server:2025.10.0`, `postgres:16-alpine`,
  `redis:7-alpine`. Upgrades are deliberate: `make upgrade` after bumping
  the tag in `compose.yml`.
- **No Postgres/Redis on the host**: verified by the absence of `ports:`
  blocks on `db` and `redis` in `compose.yml`.
- **JWKS is public-key-only**: `scripts/verify-oidc.sh` asserts the JWKS
  response contains no `d`, `p`, `q`, `dp`, `dq`, `qi`, or `k` fields.
- **Signing key persistence**: the signing certificate is stored in the
  Postgres DB (backed up by `backup.sh`). Rotating the signing key
  invalidates issued tokens. Keep the current key for at least one
  refresh-token lifetime (8h) after rotation.

## Secret rotation

| Secret                   | Rotate on                | How                                              |
|--------------------------|--------------------------|--------------------------------------------------|
| `AUTHENTIK_SECRET_KEY`   | Suspected compromise     | Full outage: rotate then re-encrypt DB. Involved. |
| `PG_PASS`                | Quarterly                | Rotate in DB then update `.env`, `docker compose up -d`. |
| Provider signing cert    | Yearly, or on compromise | New cert in Authentik; blueprint `signing_key_name` swap. |
| SMTP creds               | Provider-dictated        | `.env` update, restart server+worker.            |
| LDAP bind account        | Quarterly                | Rotate in AD, update via LDAP source in UI.      |

## Log rotation

Docker's default `json-file` driver retains logs forever. Configure a size
cap in `/etc/docker/daemon.json`:

```json
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "50m", "max-file": "5" }
}
```

Or ship logs off-host (Filebeat, Vector, Fluent Bit) to your SIEM.

## Never log

The following MUST NOT appear in access logs, application logs, or crash
dumps:

- User passwords (obvious, but includes LDAP bind passwords)
- OAuth client secrets (n/a for Claude Desktop - public client - but
  applicable to any confidential client you add later)
- Authorization codes (query string `code=...`)
- `access_token`, `refresh_token`, `id_token` values
- Session cookies (`authentik_session`, `csrftoken`)
- The `AUTHENTIK_SECRET_KEY`
- PostgreSQL passwords
- SMTP passwords
- Any `Authorization: Bearer ...` header

The nginx log format in this repo intentionally excludes request bodies and
does not log the query string in the default `$request` line beyond what
comes with combined-log format. If you extend the log format, do NOT add
`$request_body` or `$http_authorization`. Redact `code=` from the URI if
you must log query strings.

## Additional hardening

- Turn off Authentik's built-in error reporting (`AUTHENTIK_ERROR_REPORTING__ENABLED=false`).
- Set a strict `Content-Security-Policy` via a brand-level template if you
  cannot tolerate Authentik's default CSP.
- Enable geo-fencing on the reverse proxy (nginx `geoip2`) or via a WAF in
  front of it.
- Turn on the built-in `Impersonation` audit event alerts.
- Run `docker scout cves ghcr.io/goauthentik/server:2025.10.0` on a
  schedule and open a ticket for any HIGH/CRITICAL.
