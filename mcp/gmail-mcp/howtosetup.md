# วิธีตั้งค่า OAuth และรันระบบ (How to Setup)

## สถานะ OAuth ปัจจุบัน

ระบบรองรับ OAuth 2.0 แล้ว (Authorization Code flow แบบ Desktop app) ทั้งสอง service:

- `services/gmail-mcp` — ใช้งานได้ครบ (มี `package.json`, `Dockerfile`, `tsconfig.json`)
- `services/calendar-mcp` — โค้ด OAuth/ตัว service เขียนไว้แล้ว (`src/auth.ts`, `src/auth-cli.ts`, `src/config.ts` ฯลฯ) แต่ **ขาดไฟล์ `package.json`, `tsconfig.json`, `Dockerfile`, `.env.example`, `README.md`** ในโฟลเดอร์นี้ มีแต่ `src/` กับ `node_modules/` ที่ install ไว้แล้ว ดังนั้น `docker compose build calendar-mcp` และคำสั่ง dev ในเครื่องของ Calendar จะ **รันไม่ผ่าน** จนกว่าจะกู้/สร้างไฟล์เหล่านี้กลับมา (เทียบโครงสร้างจาก `services/gmail-mcp` ได้เลยเพราะโค้ดคู่ขนานกัน) คู่มือนี้จะอธิบายขั้นตอน OAuth ที่ใช้ได้จริงกับ Gmail และหมายเหตุสิ่งที่ต้องเติมให้ Calendar

กลไก OAuth ที่ใช้ (อ้างอิงจาก `services/gmail-mcp/src/auth.ts` และ `auth-cli.ts`):

- ใช้ OAuth client ชนิด **Desktop app** จาก Google Cloud Console (ไฟล์ `credentials.json`)
- ขอ `access_type: offline` + `prompt: consent` เพื่อให้ได้ **refresh token** ติดมาด้วย ไม่ต้อง login ซ้ำทุกครั้งที่ token หมดอายุ
- เปิด local HTTP server ชั่วคราว (loopback) เพื่อรับ OAuth callback ที่ `/oauth2callback`
- ตรวจสอบ `state` แบบ random เพื่อกัน CSRF และ timeout อัตโนมัติหลัง 5 นาที
- บันทึกผลลัพธ์เป็น `token.json` (permission `0o600`) แยกไฟล์ต่อ service เพื่อให้แต่ละ service ขอ scope เฉพาะที่ตัวเองต้องใช้
- Token/Credentials ถูก ignore โดย Git และไม่ commit เข้า repo (ดู `.gitignore`)

---

## 1. เตรียมโปรเจกต์ใน Google Cloud Console

1. สร้างหรือเลือก Google Cloud project
2. เปิดใช้ API ที่ต้องการ:
   - **Gmail API**
   - **Google Calendar API** (ถ้าจะใช้ calendar-mcp ด้วย)
3. ไปที่ **OAuth consent screen** แล้วตั้งค่าเบื้องต้น (User type ส่วนใหญ่เลือก External + เพิ่ม test user เป็นอีเมลที่จะใช้จริง ถ้า app ยังไม่ publish)
4. ไปที่ **Credentials → Create Credentials → OAuth client ID**
5. เลือกชนิด **Desktop app** (สำคัญ: ต้องเป็น Desktop app ไม่ใช่ Web application เพราะโค้ดใช้ redirect ไป `localhost`/`127.0.0.1` แบบไดนามิก)
6. ดาวน์โหลดไฟล์ JSON ของ client — นี่คือ `credentials.json`

---

## 2. ตั้งค่าแบบ Docker (แนะนำ)

### 2.1 เตรียม secrets

```sh
mkdir secrets
# นำไฟล์ client ที่ดาวน์โหลดจาก Google Cloud มาวางเป็น
# secrets/credentials.json
```

โครงสร้างที่ compose.yaml คาดหวัง:

```
secrets/
├── credentials.json      # OAuth client (ใช้ร่วมกันทั้ง Gmail และ Calendar ได้)
├── gmail-token.json       # จะถูกสร้างหลังขอ OAuth token ของ Gmail
└── calendar-token.json    # จะถูกสร้างหลังขอ OAuth token ของ Calendar
```

### 2.2 ขอ OAuth token ของ Gmail ผ่านหน้าเว็บ Localhost

```sh
docker compose --profile auth up --build -d gmail-auth
```

- เปิด `http://localhost:3101` ใน browser แล้วกด **Re-login with Google**
- หลัง login และกด Allow แล้ว Google จะ redirect กลับไปที่ `http://localhost:3101/oauth2callback`
- เมื่อสำเร็จไฟล์ `secrets/gmail-token.json` จะถูกสร้าง/อัปเดต
- หน้าเว็บจะแสดงวันหมดอายุและอายุคงเหลือของ access token รวมถึงสถานะ refresh token
- ระบบ Gmail MCP จะบันทึก access token ใหม่ลงไฟล์โดยอัตโนมัติเมื่อ refresh token ทำงาน
- Gmail MCP จะ reload token จากไฟล์เมื่อมีการ Re-login ดังนั้นไม่ต้อง restart container
- ต้องทำขั้นตอนนี้ใหม่ทุกครั้งที่เปลี่ยน `GMAIL_SCOPES`/`CALENDAR_SCOPES` เพราะ token เดิมจะไม่มีสิทธิ์ scope ใหม่

auth web จะเปิดค้างไว้แบบ background และ restart อัตโนมัติเมื่อ Docker restart ตั้งแต่ยังไม่ได้สั่ง stop:

```sh
docker compose --profile auth stop gmail-auth
```

สำหรับ Calendar ซึ่งยังใช้ auth CLI:

```sh
docker compose --profile auth run --rm --service-ports calendar-auth
```

> หมายเหตุ: ขั้นตอนนี้สำหรับ `calendar-auth` จะรันไม่ได้จนกว่า `services/calendar-mcp` จะมี `Dockerfile` และ `package.json` — ดูหัวข้อ "สถานะ OAuth ปัจจุบัน" ด้านบน

### 2.3 รัน service หลัก

```sh
docker compose up --build -d
docker compose ps
```

Endpoints (publish เฉพาะ `127.0.0.1` เพื่อความปลอดภัย — อย่า expose ออกอินเทอร์เน็ตตรง ๆ โดยไม่มี reverse proxy + TLS + authentication):

| Service | MCP endpoint | Health check |
| --- | --- | --- |
| Gmail | `http://127.0.0.1:3001/mcp` | `http://127.0.0.1:3001/health` |
| Calendar | `http://127.0.0.1:3002/mcp` | `http://127.0.0.1:3002/health` |

หยุดระบบ:

```sh
docker compose down
```

---

## 3. ตั้งค่าแบบ Local Dev (ไม่ใช้ Docker) — Gmail

ใช้ได้กับ `services/gmail-mcp` เท่านั้น ณ ตอนนี้ (Calendar ขาดไฟล์ config ตามที่ระบุด้านบน)

```sh
cd services/gmail-mcp
npm install
```

ตั้งค่า environment variables (โปรเจกต์นี้**ไม่โหลด `.env` ให้อัตโนมัติ** ต้อง export เข้า shell เอง หรือใช้เครื่องมือ dotenv-cli/ตัวจัดการ env ของคุณเอง) อ้างอิงจาก `.env.example`:

```sh
# ตัวอย่างสำหรับ bash/zsh
export GMAIL_CREDENTIALS_PATH=./credentials.json
export GMAIL_TOKEN_PATH=./token.json
export GMAIL_SCOPES=https://www.googleapis.com/auth/gmail.modify
export PORT=3000
export HOST=127.0.0.1
```

```sh
# วางไฟล์ที่ดาวน์โหลดจาก Google Cloud เป็น credentials.json ในโฟลเดอร์นี้
npm run build
npm run auth       # เปิด browser ให้ authorize แล้วสร้าง token.json
```

รัน server:

```sh
npm start           # stdio transport (สำหรับ MCP client ที่ spawn process โดยตรง)
npm run start:http  # Streamable HTTP transport บน $PORT
```

คำสั่งอื่นที่มีประโยชน์:

```sh
npm run check   # type-check
npm test        # vitest
npm run dev     # รันจาก TypeScript ตรง ๆ ด้วย tsx (ไม่ต้อง build)
npm run auth:dev # รัน auth-cli จาก TypeScript ตรง ๆ ด้วย tsx
```

---

## 4. ตั้งค่า MCP client (เช่น Claude Desktop / Claude Code)

ตัวอย่างสำหรับรันแบบ stdio ตรงจากเครื่อง (ไม่ผ่าน Docker):

```json
{
  "mcpServers": {
    "gmail": {
      "command": "node",
      "args": ["D:/absolute/path/to/gmail-mcp/services/gmail-mcp/dist/index.js"],
      "env": {
        "GMAIL_CREDENTIALS_PATH": "D:/absolute/path/to/gmail-mcp/services/gmail-mcp/credentials.json",
        "GMAIL_TOKEN_PATH": "D:/absolute/path/to/gmail-mcp/services/gmail-mcp/token.json"
      }
    }
  }
}
```

ถ้ารันผ่าน Docker แล้ว ให้ชี้ MCP client ไปที่ Streamable HTTP endpoint แทน (`http://127.0.0.1:3001/mcp` สำหรับ Gmail, `http://127.0.0.1:3002/mcp` สำหรับ Calendar) ตามชนิด client ที่รองรับ

---

## 5. ตัวแปร Environment ที่เกี่ยวกับ OAuth

| ตัวแปร | ใช้ที่ | ค่า default | หมายเหตุ |
| --- | --- | --- | --- |
| `GMAIL_CREDENTIALS_PATH` | gmail-mcp | `./credentials.json` | path ของไฟล์ OAuth client ที่ดาวน์โหลดจาก Google Cloud |
| `GMAIL_TOKEN_PATH` | gmail-mcp | `./token.json` | path ที่จะเก็บ refresh/access token หลัง `npm run auth` |
| `GMAIL_SCOPES` | gmail-mcp | `gmail.modify` | คั่นด้วย space หรือ comma; เปลี่ยนแล้วต้องรัน auth ใหม่ |
| `CALENDAR_CREDENTIALS_PATH` | calendar-mcp | `./credentials.json` | เหมือน Gmail |
| `CALENDAR_TOKEN_PATH` | calendar-mcp | `./token.json` | เหมือน Gmail |
| `CALENDAR_SCOPES` | calendar-mcp | `calendar.events`, `calendar.calendarlist.readonly`, `calendar.freebusy` | เหมือน Gmail |
| `OAUTH_CALLBACK_BIND` | auth-cli (ทั้งคู่) | `127.0.0.1` | ใน Docker ต้องตั้งเป็น `0.0.0.0` เพื่อ publish พอร์ตออกมาได้ (ดูใน `compose.yaml`) |
| `OAUTH_CALLBACK_PORT` | auth-cli (ทั้งคู่) | สุ่ม (0) | ตั้งตายตัวเมื่อรันใน Docker เพื่อให้ publish พอร์ตล่วงหน้าได้ (`3101` gmail, `3102` calendar) |
| `OAUTH_REDIRECT_HOST` | auth-cli (ทั้งคู่) | `127.0.0.1` | host ที่ใส่ใน redirect URI ที่ browser จะเรียกกลับมา |

---

## 6. Re-authorization / เปลี่ยน scope

1. แก้ `GMAIL_SCOPES` หรือ `CALENDAR_SCOPES`
2. รัน auth-cli ใหม่อีกครั้ง (`npm run auth` หรือ `docker compose --profile auth run --rm --service-ports gmail-auth`)
3. `prompt: consent` ถูกบังคับไว้แล้วในโค้ด ดังนั้น Google จะขอ consent ใหม่และออก refresh token ใหม่ให้เสมอ ไม่ต้อง revoke token เดิมด้วยมือ

หากต้องการเพิกถอนสิทธิ์ทั้งหมด ให้ไปที่ https://myaccount.google.com/permissions แล้ว remove app ออก จากนั้นลบไฟล์ token ในเครื่อง/`secrets/` แล้วรัน auth ใหม่

---

## 7. Troubleshooting

- **`Unable to read JSON file .../credentials.json`** — ยังไม่ได้วางไฟล์ credentials หรือ path ผิด ตรวจ `GMAIL_CREDENTIALS_PATH`/`CALENDAR_CREDENTIALS_PATH`
- **`OAuth credentials must contain an installed or web client...`** — โหลดไฟล์ credentials ผิดชนิด ตรวจว่าดาวน์โหลด JSON ของ OAuth client (ไม่ใช่ Service Account key)
- **`OAuth callback state did not match`** — มักเกิดจากเปิด auth flow ค้างไว้หลายอันพร้อมกัน หรือใช้ลิงก์เก่าที่หมดอายุ ให้รันคำสั่ง auth ใหม่ตั้งแต่ต้น
- **`OAuth authorization timed out after 5 minutes`** — ต้องกด Allow ใน browser ให้ทันภายใน 5 นาทีหลังรันคำสั่ง auth
- **Redirect ไม่กลับมาเมื่อรันใน Docker** — ตรวจว่าใช้ `--service-ports` ตอนรัน `docker compose --profile auth run` และพอร์ต `3101`/`3102` ไม่ถูกโปรแกรมอื่นใช้อยู่
- **`docker compose build calendar-mcp` ล้มเหลว / หา Dockerfile ไม่เจอ** — ตามที่ระบุด้านบน `services/calendar-mcp` ยังขาดไฟล์ `package.json`, `tsconfig.json`, `Dockerfile` ต้องสร้าง/กู้คืนไฟล์เหล่านี้ก่อน (ดูโครงสร้างคู่ขนานใน `services/gmail-mcp` เป็นตัวอย่าง)
