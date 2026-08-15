# Start Point — Google MCP Expansion

## สถานะ

Design spec และ implementation plan เขียนเสร็จแล้ว รอ execute

## ไฟล์สำคัญ

- **Design spec:** `docs/superpowers/specs/2026-07-24-google-mcp-expansion-design.md`
- **Implementation plan:** `docs/superpowers/plans/2026-07-24-google-mcp-expansion.md`

## สรุปสิ่งที่วางแผนไว้

เพิ่ม 4 Google services เข้า monorepo `google-workspace-mcp` เดิม (ที่มี gmail-mcp + calendar-mcp อยู่แล้ว):

| Service | Port | เครื่องมือ |
|---------|------|-----------|
| workspace-mcp (Sheets + Docs + Drive) | 127.0.0.1:3003 | 20 tools (CRUD ครบ) |
| maps-mcp (Geocoding + Places + Directions) | 127.0.0.1:3004 | 6 tools |

โครงสร้าง:
- `packages/google-auth/` — shared library (OAuth2 flow, MCP server factory, auth CLI)
- `services/workspace-mcp/` — Sheets + Docs + Drive รวมกัน, แชร์ OAuth token เดียว
- `services/maps-mcp/` — ใช้ API Key เป็นหลัก, OAuth optional

## Decisions ที่ตกลงแล้ว

- npm workspaces monorepo (เพิ่มใน repo เดิม)
- Sheets/Docs/Drive รวมเป็น server เดียว (workspace-mcp) เพราะแชร์ token
- Maps แยก server เพราะ auth ต่าง (API Key)
- Shared package `@google-workspace/auth` สำหรับ OAuth + MCP boilerplate
- Docker Compose build context = monorepo root (Dockerfile ใช้ workspace-aware COPY)
- Auth profiles: `auth-workspace` (Sheets/Docs/Drive), Maps ใช้ API Key ใน .env

## วิธีทำต่อ

### Option A: ใช้ subagent ทำทีละ task (แนะนำ)

```
อ่าน docs/superpowers/plans/2026-07-24-google-mcp-expansion.md
แล้ว execute ทีละ task ตามลำดับ (Task 1 → 12)
ใช้ superpowers:subagent-driven-development
```

### Option B: ทำเองใน session เดียว

```
อ่าน docs/superpowers/plans/2026-07-24-google-mcp-expansion.md
แล้ว execute ทีละ task ตามลำดับ
ใช้ superpowers:executing-plans
```

### Prompt สำหรับเริ่ม session ใหม่

> อ่าน `docs/superpowers/plans/2026-07-24-google-mcp-expansion.md` แล้วเริ่ม implement จาก Task 1
> ทำทีละ task, test + typecheck ทุก task, commit ทุก task
> ดู pattern จาก `services/gmail-mcp/src/` เป็นตัวอย่าง
> Tech stack: TypeScript ESM, @modelcontextprotocol/sdk, googleapis, zod, vitest, express
> ไม่ต้องเพิ่ม comments ใน code

## สิ่งที่ต้องเตรียมก่อน run

1. Google Cloud project ที่เปิดใช้: Sheets API, Docs API, Drive API, Maps APIs (Geocoding, Places, Directions)
2. OAuth Desktop app credentials → `secrets/credentials.json`
3. Maps API Key → `.env` (ตัวแปร `MAPS_API_KEY`)
4. Docker (สำหรับ build + run)
