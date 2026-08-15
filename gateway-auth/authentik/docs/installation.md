# Installation

## Prerequisites

- Linux host (Ubuntu 22.04+/Debian 12+/RHEL 9+) with:
  - Docker Engine 24+ with Compose v2 plugin
  - 2 CPU / 2 GB RAM minimum (4/4 recommended)
  - `curl`, `jq`, `openssl`, `bash`, `awk`, `tar`, `gzip`, `sha256sum`
- Firewall: 443/tcp inbound to the reverse proxy host; 80/tcp only if you use
  ACME http-01.
- Outbound egress for image pulls (ghcr.io, docker.io), SMTP, and external
  IdP metadata endpoints.

## DNS

Create one A/AAAA record:

```
auth.company.com  ->  <public IP of your reverse proxy>
```

The hostname must match `AUTH_DOMAIN` in `.env` and the `server_name` in
`nginx/conf.d/auth.company.com.conf`. If you use a different FQDN, rename the
conf file and update `AUTH_DOMAIN`.

## TLS

Two supported options:

### Option A: Let's Encrypt (public FQDN)

Use certbot on the reverse proxy host (or a companion container):

```bash
certbot certonly --webroot -w /var/www/acme \
    -d auth.company.com \
    -m ops@company.com --agree-tos --no-eff-email
```

Then point `TLS_CERT_PATH` / `TLS_KEY_PATH` at:

```
TLS_CERT_PATH=/etc/letsencrypt/live/auth.company.com/fullchain.pem
TLS_KEY_PATH=/etc/letsencrypt/live/auth.company.com/privkey.pem
```

Reload nginx on renewal (certbot's deploy hook).

### Option B: Internal CA

Issue a server cert from your internal PKI with `subjectAltName = DNS:auth.company.com`,
place the fullchain PEM and unencrypted key under `./certs/`, and point
`TLS_CERT_PATH` / `TLS_KEY_PATH` at those files.

The internal CA root must be in the trust store of every client (browser,
Claude Desktop host, downstream services). Otherwise `verify-oidc.sh` will
fail the TLS handshake check.

## Step-by-step

```bash
# ให้รันจาก root ของ monorepo (ไม่ใช่จาก authentik/ ย่อย)
cd gateway-auth/

# 1. Bootstrap config
cp authentik/.env.example .env             # หรือใช้ Makefile
make -C authentik init                     # copies .env.example -> .env (mode 600)
make -C authentik secrets                  # fills PG_PASS + AUTHENTIK_SECRET_KEY
$EDITOR .env                               # set AUTH_DOMAIN, SMTP, TLS_* paths

# 2. Reverse proxy
#    Render nginx/conf.d/auth.company.com.conf with envsubst to substitute
#    ${TLS_CERT_PATH} and ${TLS_KEY_PATH}, then install:
envsubst '${TLS_CERT_PATH} ${TLS_KEY_PATH}' \
    < nginx/conf.d/auth.company.com.conf \
    > /etc/nginx/conf.d/auth.company.com.conf
cp nginx/nginx.conf /etc/nginx/nginx.conf
nginx -t && systemctl reload nginx

# 3. Bring up Authentik
./scripts/bootstrap.sh

# 4. Complete initial setup in the browser
#    https://auth.company.com/if/flow/initial-setup/
#    Set the akadmin password. Enable MFA immediately (Directory -> Users -> akadmin).

# 5. Wait ~60 seconds for the worker to reconcile the blueprint, then:
make verify
```

If `make verify` prints all PASS, the Authentik side is done. Continue with
[claude-desktop-setup.md](claude-desktop-setup.md).

## Production checklist before going live

- [ ] `compose.override.yml` removed (or ports stanza deleted)
- [ ] `.env` mode 600, not committed
- [ ] TLS fullchain includes intermediates
- [ ] akadmin has TOTP or WebAuthn enrolled
- [ ] `make backup` runs from cron nightly
- [ ] Log shipping configured (Docker log driver or Filebeat)
- [ ] See [production-hardening.md](production-hardening.md)
