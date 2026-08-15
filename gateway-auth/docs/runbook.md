# Gateway Auth Runbook

## Prerequisites
- Domain on Cloudflare (Free plan works)
- Domain added to Cloudflare with nameservers pointing to Cloudflare

## Setup Steps

### 1. Create Tunnel in Cloudflare Zero Trust
- Go to `one.dash.cloudflare.com` → Networks → Tunnels → Create a tunnel
- Choose Cloudflared connector, name it (e.g. `gateway-auth`)
- Copy the tunnel token (starts with `eyJ...`)

### 2. Bind Public Hostname to Authentik
- In tunnel page → Public Hostname tab → Add a public hostname:
  - **Subdomain**: `auth`
  - **Domain**: your domain
  - **Service Type**: HTTP
  - **URL**: `authentik-server:9000`

### 3. Configure `.env`
```
AUTH_DOMAIN=auth.yourdomain.com
CLOUDFLARE_TUNNEL_TOKEN=eyJ...your-token...
```
> `AUTH_DOMAIN` is critical — it's used to compute `OIDC_ISSUER` for the gateway. Token issuer must match exactly.

### 4. Start with Tunnel Profile
```bash
docker compose --profile tunnel up -d
```
Verify tunnel connection:
```bash
docker compose logs cloudflared --tail 20
```
Look for: `Registered tunnel connection ≥ 1`

### 5. Verify Authentik is Public
- `https://auth.yourdomain.com` → Authentik login page
- `https://auth.yourdomain.com/application/o/claude-desktop/.well-known/openid-configuration` → JSON with correct issuer
- First-time setup: `https://auth.yourdomain.com/if/flow/initial-setup/`

### 6. End-to-End Test
- Configure Claude Desktop using `claude-desktop-setup.md`
- Issuer URL: `https://auth.yourdomain.com/application/o/claude-desktop/`
- Gateway base URL: `http://localhost:4100` (OAuth only via tunnel, inference stays local)
- Debug: `docker compose logs claude-gateway --tail 50`

## Fresh Start (Generate Secrets)
```bash
openssl rand -base64 36   # → PG_PASS
openssl rand -hex 64      # → AUTHENTIK_SECRET_KEY
openssl rand -hex 32      # → LITELLM_MASTER_KEY
```
Place values in `.env`, then:
```bash
docker compose down -v
docker compose --profile tunnel up -d
```
> `down -v` destroys all volumes/DB. Only do this if no data needs preserving.

## Credentials
| Service | Username | Password |
|---------|----------|----------|
| Authentik Admin | `akadmin@authentik.com` | ตั้งเองตอน initial-setup flow (URL ด้านบน) |
| Test User | สร้างเองผ่าน Admin UI หรือ bootstrap | ตั้งเอง |

> **⚠️ Security:** ห้าม commit password เริ่มต้นหรือ credential จริงลง repo
> ตั้ง password ใหม่ทุกครั้งที่ deploy และ enable MFA สำหรับ admin ทันที

## Cloudflare IDs
Zone ID และ Account ID ของ project อยู่ใน Cloudflare dashboard (dash.cloudflare.com)
> **⚠️ Security:** ห้าม commit Zone ID / Account ID / Tunnel token ของจริงลง repo
> เก็บไว้ใน `.env` (git-ignored) หรือ secret manager เท่านั้น
