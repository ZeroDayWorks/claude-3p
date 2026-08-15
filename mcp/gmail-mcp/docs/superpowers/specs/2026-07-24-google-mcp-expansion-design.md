# Google MCP Expansion — Design Spec

Date: 2026-07-24
Status: Approved

## Overview

ขยาย google-workspace-mcp monorepo เดิม (gmail-mcp, calendar-mcp) เพิ่ม 4 Google services ใหม่:
- Google Sheets
- Google Docs
- Google Drive
- Google Maps

Sheets + Docs + Drive รวมเป็น **workspace-mcp** server เดียว (แชร์ OAuth token ร่วมกัน)
Maps แยกเป็น **maps-mcp** (API Key หลัก + OAuth optional)

## Architecture

```
google-workspace-mcp/
├── package.json              # npm workspaces root
├── compose.yaml              # ทุก services + auth profiles
├── secrets/                  # git-ignored
│   ├── credentials.json      # OAuth client (Desktop app)
│   ├── workspace-token.json  # แชร์ Sheets/Docs/Drive (รวม scope)
│   └── maps-token.json       # Maps OAuth (optional)
├── packages/
│   └── google-auth/          # shared library
└── services/
    ├── gmail-mcp/            # เดิม :3001
    ├── calendar-mcp/         # เดิม :3002
    ├── workspace-mcp/        # ใหม่ :3003 (Sheets + Docs + Drive)
    └── maps-mcp/             # ใหม่ :3004
```

## Shared Package: packages/google-auth

### หน้าที่

1. OAuth2 flow — สร้าง auth URL, รับ callback, save/refresh token
2. MCP server factory — สร้าง MCP server รองรับทั้ง stdio + Streamable HTTP พร้อม /health endpoint
3. Token management — อ่าน/เขียน/refresh token อัตโนมัติ

### API Surface

```ts
// OAuth
createOAuthClient(credentialsPath: string): OAuth2Client
getAuthUrl(client, scopes: string[]): string
exchangeCode(client, code: string): Tokens
loadOrRefreshToken(client, tokenPath: string): OAuth2Client  // auto-refresh

// MCP Server
createMcpServer(name: string, version: string): McpServer
startHttp(server, port: number): void    // Streamable HTTP + /health
startStdio(server): void

// Auth CLI (reusable)
runAuthFlow(options: { credentialsPath, tokenPath, scopes, port }): Promise<void>
```

### ขอบเขต

- รวม: OAuth flow, token refresh, MCP server factory, health endpoint, auth CLI
- ไม่รวม: Google API client logic, tool definitions (แต่ละ service จัดการเอง)

## Services

### workspace-mcp (Sheets + Docs + Drive) — port 3003

Auth: `workspace-token.json` (OAuth shared, รวม scopes: spreadsheets, documents, drive)

#### Sheets Tools

| Tool | รายละเอียด |
|------|-----------|
| `list_spreadsheets` | ค้นหา spreadsheets ใน Drive |
| `get_spreadsheet` | อ่าน metadata (ชื่อ, sheets, properties) |
| `read_range` | อ่านข้อมูลจาก range (A1 notation) |
| `write_range` | เขียน/อัพเดทข้อมูลใน range |
| `append_rows` | เพิ่มข้อมูลต่อท้าย sheet |
| `create_spreadsheet` | สร้าง spreadsheet ใหม่ |
| `batch_update` | แก้ไขหลาย operations พร้อมกัน (add/delete sheet, format) |

#### Docs Tools

| Tool | รายละเอียด |
|------|-----------|
| `get_document` | อ่านเนื้อหา document (โครงสร้าง full) |
| `create_document` | สร้าง document ใหม่ |
| `insert_text` | แทรกข้อความที่ตำแหน่งที่กำหนด |
| `replace_text` | ค้นหาและแทนที่ข้อความ |
| `batch_update` | แก้ไขหลาย operations (insert, delete, format) |

#### Drive Tools

| Tool | รายละเอียด |
|------|-----------|
| `list_files` | แสดงไฟล์/โฟลเดอร์ (รองรับ query, pagination) |
| `search_files` | ค้นหาไฟล์ด้วย query string |
| `get_file_metadata` | อ่าน metadata (ชื่อ, ชนิด, size, modified) |
| `download_file` | ดาวน์โหลดไฟล์ (export สำหรับ Google Docs/Sheets) |
| `upload_file` | อัพโหลดไฟล์ใหม่ |
| `create_folder` | สร้างโฟลเดอร์ |
| `update_file` | แก้ไข metadata / ย้ายไฟล์ |
| `delete_file` | ลบไฟล์ (ย้ายไป trash) |

### maps-mcp — port 3004

Auth: env `MAPS_API_KEY` (หลัก) + `maps-token.json` (OAuth optional)

| Tool | API | รายละเอียด |
|------|-----|-----------|
| `geocode` | Geocoding | แปลงที่อยู่ → พิกัด |
| `reverse_geocode` | Geocoding | แปลงพิกัด → ที่อยู่ |
| `search_places` | Places (New) | ค้นหาร้านค้า/สถานที่ (text search) |
| `nearby_places` | Places (New) | ค้นหาสถานที่ใกล้เคียง (radius) |
| `place_details` | Places (New) | รายละเอียดสถานที่ (rating, hours, reviews) |
| `get_directions` | Directions/Routes | เส้นทาง, ระยะทาง, เวลา (driving/walking/transit) |

## Docker Compose & Deployment

### Port Allocation

| Service | Internal | External |
|---------|----------|----------|
| gmail-mcp | 3000 | 127.0.0.1:3001 |
| calendar-mcp | 3000 | 127.0.0.1:3002 |
| workspace-mcp | 3000 | 127.0.0.1:3003 |
| maps-mcp | 3000 | 127.0.0.1:3004 |

### Environment Variables

workspace-mcp:
```
HOST=0.0.0.0
PORT=3000
WORKSPACE_CREDENTIALS_PATH=/secrets/credentials.json
WORKSPACE_TOKEN_PATH=/secrets/workspace-token.json
```

maps-mcp:
```
HOST=0.0.0.0
PORT=3000
MAPS_API_KEY=<key>
MAPS_CREDENTIALS_PATH=/secrets/credentials.json
MAPS_TOKEN_PATH=/secrets/maps-token.json
```

### Auth Flow

```sh
# 1. ขอ workspace token (Sheets + Docs + Drive)
docker compose --profile auth-workspace run --rm --service-ports workspace-auth

# 2. (Optional) Maps OAuth
docker compose --profile auth-maps run --rm --service-ports maps-auth

# 3. รันทั้งหมด
docker compose up --build -d
```

### Dockerfile Pattern

ทุก service ใช้ multi-stage build:
1. Stage 1: build TypeScript (COPY packages/google-auth + service source)
2. Stage 2: run dist (node)
3. EXPOSE 3000, HEALTHCHECK /health

## Testing & Development

- แต่ละ service มี `npm test` (unit tests สำหรับ tool logic)
- `npm run check` = TypeScript typecheck + lint
- Dev mode: `npm start` (stdio) หรือ `npm run start:http`
- Integration test กับ Google API จริงทำ manual (ไม่รวมใน CI เพราะต้อง auth)
- Root `package.json` มี scripts รัน build/check/test ทุก service พร้อมกัน

## Implementation Order

1. `packages/google-auth` — shared package (OAuth, MCP factory, auth CLI)
2. `workspace-mcp` — Sheets + Docs + Drive tools
3. `maps-mcp` — Geocoding + Places + Directions
4. Docker Compose integration + auth profiles
5. (Optional) Refactor gmail-mcp/calendar-mcp มาใช้ shared package

## Decisions Log

| Decision | Rationale |
|----------|-----------|
| รวม Sheets/Docs/Drive เป็น workspace-mcp เดียว | แชร์ token เดียวกัน, ลด complexity, APIs เกี่ยวข้องกัน |
| Maps แยก server | Auth ต่าง (API Key), แยก concern ชัด |
| npm workspaces + shared package | DRY, 6 services ใช้ OAuth pattern เดียวกัน |
| เพิ่มใน monorepo เดิม | ต่อยอดโครงสร้างที่มี, ใช้ secrets/compose ร่วม |
| รองรับทั้ง API Key + OAuth สำหรับ Maps | ยืดหยุ่น, API Key ง่ายสำหรับ personal use |
