# Google Workspace MCP services

โปรเจกต์นี้แยก Gmail, Google Calendar, Workspace (Sheets/Docs/Drive) และ Maps เป็น MCP server คนละ service และรันด้วย Docker Compose ผ่าน Streamable HTTP

```text
MCP client
  ├── http://127.0.0.1:3001/mcp  -> services/gmail-mcp
  ├── http://127.0.0.1:3002/mcp  -> services/calendar-mcp
  ├── http://127.0.0.1:3003/mcp  -> services/workspace-mcp
  └── http://127.0.0.1:3004/mcp  -> services/maps-mcp
                                         │
                    secrets/credentials.json
                    secrets/gmail-token.json
                    secrets/calendar-token.json
                    secrets/workspace-token.json
```

พอร์ต publish เฉพาะ loopback (`127.0.0.1`) จึงเหมาะกับการใช้งาน local เครื่องเดียว ไม่ควร expose ออกอินเทอร์เน็ตโดยตรงโดยไม่มี reverse proxy, TLS และ authentication

## โครงสร้าง

```text
.
├── compose.yaml
├── packages/
│   └── google-auth/       # shared OAuth + MCP server factory
├── secrets/                 # ignored by Git
│   ├── credentials.json
│   ├── gmail-token.json
│   ├── calendar-token.json
│   ├── workspace-token.json
│   └── maps-token.json
└── services/
    ├── gmail-mcp/
    ├── calendar-mcp/
    ├── workspace-mcp/     # Sheets + Docs + Drive
    └── maps-mcp/
```

## ตั้งค่า Google Cloud

1. เปิดใช้ Gmail API, Google Calendar API, Google Sheets API, Google Docs API และ Google Drive API ใน Google Cloud project เดียวกัน
2. ตั้งค่า OAuth consent screen
3. สร้าง OAuth client ชนิด **Desktop app**
4. สร้าง folder `secrets` แล้วบันทึกไฟล์ client เป็น `secrets/credentials.json`

## Login Gmail ผ่านหน้าเว็บ Localhost

รัน auth web service แบบเปิดค้างไว้ แล้วเปิดหน้าเว็บที่ `http://localhost:3101`:

```sh
docker compose --profile auth up --build -d gmail-auth
```

กดปุ่ม **Re-login with Google** แล้วทำการอนุญาต ระบบจะบันทึกหรืออัปเดต
`secrets/gmail-token.json` อัตโนมัติ แล้วรัน Gmail MCP ตามปกติ

Gmail MCP จะเฝ้าดูไฟล์ token และโหลด token ชุดใหม่เข้า process ที่กำลังรันอยู่
อัตโนมัติ ดังนั้นหลัง Re-login ไม่ต้อง restart `gmail-mcp`

หน้าเว็บจะแสดงวันหมดอายุและเวลาคงเหลือของ access token รวมถึงสถานะ refresh token
โดยจะ refresh สถานะทุก 30 วินาที การหยุด auth web service ใช้คำสั่ง:

```sh
docker compose --profile auth stop gmail-auth
```

หน้าเว็บนี้ bind เฉพาะ `127.0.0.1` และใช้ OAuth callback ที่
`http://localhost:3101/oauth2callback` จึงไม่ต้องเปิด service ออกอินเทอร์เน็ต

สำหรับ service อื่นยังใช้ auth command เดิมได้:

```sh
docker compose --profile auth run --rm --service-ports calendar-auth
docker compose --profile auth-workspace run --rm --service-ports workspace-auth
```

Token แต่ละไฟล์แยกกันเพื่อให้แต่ละ service ขอ scope เฉพาะที่ต้องการใช้

## Google Maps

Maps MCP ใช้ API Key เป็นหลัก ตั้งค่าใน `.env`:

```sh
cp .env.example .env
# แก้ MAPS_API_KEY ใน .env
```

## รัน services

```sh
docker compose up --build -d
docker compose ps
```

Endpoints:

- Gmail MCP: `http://127.0.0.1:3001/mcp`
- Calendar MCP: `http://127.0.0.1:3002/mcp`
- Workspace MCP (Sheets/Docs/Drive): `http://127.0.0.1:3003/mcp`
- Maps MCP: `http://127.0.0.1:3004/mcp`

หยุดระบบ:

```sh
docker compose down
```

## Development โดยไม่ใช้ Docker

แต่ละ service รองรับทั้ง `stdio` (`npm start`) และ Streamable HTTP (`npm run start:http`):

```sh
npm install
npm run check
npm test
npm run build
```

รายละเอียดเครื่องมืออยู่ใน [Gmail service](services/gmail-mcp/README.md) และ [Calendar service](services/calendar-mcp/README.md)
