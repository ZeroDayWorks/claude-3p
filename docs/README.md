# docs/ — Design & Planning Documents

เอกสาร design / planning ที่ใช้ตอนสร้างระบบ เก็บไว้เป็น historical record

## Structure

```
docs/
├── README.md                                       ← (this file)
└── superpowers/
    └── plans/
        └── 2026-07-23-gateway-auth-implementation.md
                                                        ← SDD plan ต้นฉบับของ gateway-auth
```

## 2026-07-23 — gateway-auth implementation plan

แผน SDD (subagent-driven-development) 12 tasks สำหรับ restructure
`authentik-deployment/` + `ollama-litellm/` เป็น monorepo เดียว และเพิ่ม JWT validation
ที่ gateway

- **Goal:** Restructure + dual auth (JWT + master key) + Cloudflare 2 modes
- **Stack:** Python 3.12, FastAPI, httpx, PyJWT[crypto], Docker Compose v2, Authentik 2025.10.0
- **Result:** ทั้ง 12 tasks complete — ดู [progress ledger](../gateway-auth/.superpowers/sdd/progress.md)
  (อยู่ใน `gateway-auth/.superpowers/sdd/`)
