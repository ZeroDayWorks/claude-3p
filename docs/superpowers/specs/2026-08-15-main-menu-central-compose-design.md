# Main Menu + Central Docker Compose — Design

**Date:** 2026-08-15
**Status:** Approved

## Goal

สร้าง central `docker-compose.yml` ที่ root เพื่อให้ `docker compose up -d` คำสั่งเดียวระบบทั้งหมดพร้อมใช้ และสร้าง static web "main menu" สำหรับเป็นจุดเข้าของระบบ พร้อม docs และ runbook แบบ static

## Scope

- ระบบที่รวมใน central compose (ทั้งหมดใช้ `include:`):
  1. `gateway-auth/compose.yml` (Authentik + Claude Gateway + LiteLLM)
  2. `cowork-search/docker-compose.yml` (SearXNG + adapter)
  3. `cowork-otel-grafana/docker-compose.yml` (Loki + OTel + Grafana)
  4. `mcp/gmail-mcp/compose.yaml` (Gmail / Workspace / Maps MCP)
- main-menu web service (ใหม่ ที่ root compose)

## Non-goals

- ไม่แก้ compose ย่อยของแต่ละระบบ (ใช้ของเดิมตามที่เป็น)
- ไม่สร้าง dynamic service registry (ใช้ static HTML)
- ไม่เปลี่ยน ports ของ service ที่มีอยู่

## Architecture

### Central compose

```
docker-compose.yml (root)
├── include: gateway-auth/compose.yml
├── include: cowork-search/docker-compose.yml
├── include: cowork-otel-grafana/docker-compose.yml
├── include: mcp/gmail-mcp/compose.yaml
└── services:
    └── main-menu (nginx:1.27-alpine, port 16580:80)
```

- ใช้ `include:` ทั้งหมด ไม่ flatten
- main-menu เป็น service ใหม่ที่ root ใช้ network ของตัวเอง (`main-menu`)
- Profile ที่มีอยู่แล้ว (`tunnel`, `auth`, `auth-workspace`) คงไว้

### main-menu static web

- แสดงการ์ดทุกระบบ: ชื่อ, คำอธิบาย, port, ปุ่มเปิด, ปุ่ม docs, ปุ่ม runbook
- ไม่มี build step แก้ HTML/CSS แล้วรีเฟรชได้ทันที
- มี dark/light theme และ search box
- ไฟล์: `index.html`, `docs.html`, `runbook.html`, `assets/style.css`, `assets/app.js`

## Services reference (ports)

| Service | Container | Port |
|---|---|---|
| main-menu | claude-3p-main-menu | 16580 |
| Claude Gateway | claude-local-gateway | 4100 |
| LiteLLM | ollama-litellm | 127.0.0.1:4000 |
| Authentik server | authentik-server | 9000 (internal) |
| SearXNG | cowork-searxng | 8888 |
| Search adapter | cowork-search-adapter | 8090 |
| Grafana | cowork-poc-grafana | 127.0.0.1:23000 |
| OTel collector | cowork-poc-otel | 24318 |
| Gmail MCP | (built) | 127.0.0.1:3001 |
| Workspace MCP | (built) | 127.0.0.1:3003 |
| Maps MCP | (built) | 127.0.0.1:3004 |

## File layout (new)

```
claude-3P/
├── docker-compose.yml          ← root central compose (ใหม่)
├── main-menu/
│   ├── html/
│   │   ├── index.html
│   │   ├── docs.html
│   │   ├── runbook.html
│   │   └── assets/
│   │       ├── style.css
│   │       └── app.js
│   └── README.md
└── (existing folders unchanged)
```

## Backup strategy

ก่อนสร้าง root compose จะสำรอง compose ย่อยของแต่ละระบบเป็น `<file>.bak` ในโฟลเดอร์เดิม (เผื่อมี conflict จาก include)

## Verification

- `docker compose config` ต้องผ่าน
- ทุก service ปรากฏใน `docker compose ps --all`
- เข้า `http://localhost:16580` เห็น dashboard