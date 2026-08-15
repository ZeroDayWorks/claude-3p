# gateway-auth

> **OIDC SSO + AI Gateway** — หัวใจของ monorepo `claude-3P`
>
> รวม **Authentik** (OIDC Identity Provider) + **LiteLLM** (AI proxy) + **Claude Gateway**
> (FastAPI dual-auth) ไว้ใน Docker Compose project เดียว

## Quick Map

| ไฟล์ / โฟลเดอร์ | เนื้อหา |
|---|---|
| [compose.yml](compose.yml) | Root compose (ใช้ `include:` รวม 2 sub-stack) + `cloudflared` profile |
| [.env.example](.env.example) | ทุก env ของทั้งระบบ |
| [docs/architecture.md](docs/architecture.md) | System overview, sequence diagrams, container table, decision matrix |
| [docs/runbook.md](docs/runbook.md) | Deploy & operations (fresh start, secret gen, end-to-end test) |
| [docs/cloudflare.md](docs/cloudflare.md) | Tunnel + DNS runbook (operator-only) |
| [authentik/](authentik/) | Authentik 2025.10.0 stack (Postgres, Redis, Server, Worker) + blueprints + nginx |
| [ollama-litellm/](ollama-litellm/) | FastAPI gateway + LiteLLM proxy + model routing |

## Quick start

```sh
# จาก root ของ monorepo
cd gateway-auth

# 1. Setup env
cp .env.example .env
./authentik/scripts/generate-secrets.sh >> .env   # PG_PASS, AUTHENTIK_SECRET_KEY
$EDITOR .env                                       # AUTH_DOMAIN, LITELLM_MASTER_KEY, CLOUDFLARE_TUNNEL_TOKEN (optional)

# 2. Start
docker compose up -d                  # โหมด VM + DNS
docker compose --profile tunnel up -d # โหมด local + Cloudflare tunnel

# 3. ตรวจ
docker compose ps
curl http://localhost:4100/health
```

## Architecture

ดูที่ [docs/architecture.md](docs/architecture.md) — มี mermaid diagrams:
- System overview (component graph)
- OIDC + PKCE login sequence
- Inference request flow (decision tree)
- Service topology + container table

## Components

### Authentik
- OIDC provider สำหรับ Claude Desktop
- Blueprint (`claude-desktop.yaml`) สร้าง groups / provider / application แบบ GitOps
- โหมด deploy: 2 แบบ (local + tunnel / VM + DNS) — ดู [docs/cloudflare.md](docs/cloudflare.md)

### Claude Gateway (FastAPI)
- Dual auth: **JWT (RS256, Authentik-issued)** + **master key** (สำหรับ service/automation)
- Proxy → LiteLLM พร้อม credential swap + identity headers
- Anti-spoofing: strip `x-authenticated-user` / `x-authenticated-sub` ที่ client ส่งมาเอง
- ดู source ที่ [ollama-litellm/gateway/](ollama-litellm/gateway/)

### LiteLLM
- OpenAI-compatible proxy → upstream LLMs (Ollama Cloud, OpenCode Zen)
- Model routing ผ่าน [ollama-litellm/config.yaml](ollama-litellm/config.yaml)
- Admin UI (port 4000 → internal only) สำหรับแก้ model ตอน runtime

## Security Model

ดูรายละเอียดที่ [docs/architecture.md](docs/architecture.md#key-design-decisions) — สรุปสั้น:

- **RS256 only** — algorithm confusion (HS256, alg:none) ถูกบล็อก
- **JWKS cache + stale-while-error** — Authentik ล่มชั่วคราวไม่ทำให้ทุก request fail
- **LiteLLM port 4000** — expose เฉพาะ internal network ห้าม publish ออก host
- **Required claims** — `iss`, `aud`, `exp`, `sub` ถูก enforce
- **RBAC** — `claude-suspended` ถูก deny แม้มี allowed group

## Known Trade-offs

| Item | Note |
|---|---|
| 8h access token TTL (demo) | Revocation gap สูงสุด 8 ชม. — แก้ที่ `authentik/blueprints/claude-desktop.yaml` context |
| Single master key | Spend tracking ต่อ user ยังไม่แยก (ปู `x-authenticated-sub` ไว้แล้ว) |
| Inference ไม่ผ่าน Cloudflare | หลีกเลี่ยง 100s idle timeout บน streaming — เรียก gateway ตรง (localhost/LAN) |

## More docs

- [Authentik deployment](authentik/README.md) — install, configure, harden, troubleshoot
- [Claude Gateway source](ollama-litellm/gateway/README.md) — model routing, dev setup
- [3P inference overview](ollama-litellm/claude-3P.md) — Bedrock / third-party platform mode
- [Original SDD plan](../docs/superpowers/plans/2026-07-23-gateway-auth-implementation.md)
