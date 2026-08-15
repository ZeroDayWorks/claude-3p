## สรุป COWORK_3P.md

เอกสารนี้อธิบายการนำ **Claude Cowork หรือ Claude Desktop** ไปใช้งานในองค์กร โดยให้เรียกโมเดล Claude ผ่าน **Amazon Bedrock** แทนการใช้ระบบ inference ของ Anthropic โดยตรง และให้ผู้ใช้ล็อกอินผ่าน Identity Provider ขององค์กร เช่น Entra ID, Okta, Auth0, Cognito หรือ OIDC อื่น ๆ

### ภาพรวมสถาปัตยกรรม

ระบบเดียวกับที่ใช้ติดตั้ง **Claude Code with Bedrock** สามารถใช้กับ Claude Cowork ได้ด้วย ไม่ต้องสร้าง AWS infrastructure ชุดใหม่

```text
Claude Desktop
   │
   ├─ Credential Helper / AWS Profile
   │       │
   │       └─ OIDC / Entra ID / Okta / Cognito
   │
   ├─ Amazon Bedrock → Claude Models
   ├─ Managed / Local MCP Servers
   └─ Optional OTEL Telemetry
```

ข้อดีหลักคือ:

* ค่าใช้จ่ายคิดผ่าน AWS แบบ consumption-based
* ไม่ต้องซื้อ Anthropic seat license
* ใช้ระบบ SSO และ credential infrastructure เดียวกับ Claude Code
* Prompt, file, tool input/output และ model response อยู่ในขอบเขต AWS account ตามคำอธิบายของโซลูชัน
* รองรับ Projects, Artifacts, Memory, file upload/export และ MCP server

แต่ Third-Party Platform Mode จะไม่มีฟีเจอร์บางส่วนที่ต้องใช้ Anthropic-hosted inference เช่น:

* Chat tab
* Computer Use
* Skills Marketplace

---

## วิธีติดตั้งที่แนะนำ

ถ้ามี deployment ของ Claude Code with Bedrock อยู่แล้ว ให้รัน:

```bash
poetry run ccwb cowork generate
```

คำสั่งนี้จะสร้างไฟล์สำหรับ deploy ผ่าน MDM ไว้ใน:

```text
dist/cowork-3p/
```

ไฟล์ที่สร้างได้ประกอบด้วย:

* JSON
* macOS `.mobileconfig`
* Windows `.reg`

ตัวอย่างเลือกเฉพาะ format หรือ model:

```bash
poetry run ccwb cowork generate --format mobileconfig

poetry run ccwb cowork generate \
  --models opus,sonnet,haiku

poetry run ccwb cowork generate \
  --profile Production
```

สำหรับ deployment ใหม่ สามารถใช้ `ccwb package` ซึ่งจะสร้าง CoWork 3P configuration พร้อม distribution package ให้อัตโนมัติ

---

## Configuration หลัก

ค่าขั้นต่ำประมาณนี้:

```json
{
  "inferenceProvider": "bedrock",
  "inferenceBedrockRegion": "us-west-2",
  "inferenceBedrockProfile": "ClaudeCode",
  "inferenceModels": ["opus", "sonnet", "haiku"]
}
```

ความหมาย:

| Key                       | หน้าที่                                         |
| ------------------------- | ----------------------------------------------- |
| `inferenceProvider`       | ต้องเป็น `bedrock`                              |
| `inferenceBedrockRegion`  | Region ที่ใช้เรียก Bedrock                      |
| `inferenceBedrockProfile` | ชื่อ AWS profile ใน `~/.aws/config`             |
| `inferenceModels`         | รายชื่อโมเดลที่ให้ผู้ใช้เลือก                   |
| `inferenceBedrockBaseUrl` | ใช้ override endpoint เช่น Bedrock VPC endpoint |

จุดที่ต้องระวังคือค่าประเภท array ใน MDM จริง ๆ ต้องส่งเป็น **JSON-encoded string** เช่น:

```json
"inferenceModels": "[\"opus\", \"sonnet\", \"haiku\"]"
```

ไม่ใช่ native JSON array ใน preference store

---

## การ Map Model

Claude Desktop รองรับ 2 รูปแบบ

### แบบง่าย

```json
"inferenceModels": ["opus", "sonnet", "haiku"]
```

Claude Desktop จะ resolve model ID ภายในเอง

### แบบระบุ Model ID ชัดเจน

```json
"inferenceModels": [
  {
    "name": "global.anthropic.claude-opus-4-8",
    "labelOverride": "Claude Opus 4.8",
    "anthropicFamilyTier": "opus",
    "isFamilyDefault": true
  }
]
```

เหมาะเมื่อองค์กรใช้ Bedrock CRIS หรือ inference profile ID เฉพาะ และต้องการ map ปุ่ม `opus`, `sonnet`, `haiku` ไปยัง model ID ที่กำหนดเอง

จุดสำคัญคือ **CoWork 3P รองรับ Claude family model เป็นหลัก** ไม่ใช่เอา model OpenAI-compatible ใด ๆ มาใส่แล้วจะทำงานได้ทันที

---

## Credential Mode มี 2 แบบ

### 1. Credential Helper — แนะนำ

ตั้งแต่ v2.6.0 วิธีนี้เป็นค่าเริ่มต้น

Claude Desktop จะเรียก binary โดยตรง:

```text
credential-process
```

ลำดับการทำงาน:

1. Desktop เรียก helper
2. Helper ส่ง temporary AWS credentials ออกทาง stdout
3. Desktop cache credential ประมาณ 3,500 วินาที
4. เมื่อหมดอายุ Desktop เรียก helper ใหม่
5. ถ้า credential ถูก reject ระหว่าง session จะทำ silent refresh อัตโนมัติ

Context ที่ helper รองรับ:

```text
interactive
mid-session-refresh
background
setup-test
```

ข้อดีสำคัญคือ **ไม่ต้อง restart Claude Desktop เมื่อ STS token หมดอายุ**

ควรมีค่าประมาณนี้:

```json
{
  "inferenceCredentialKind": "helper-script",
  "inferenceCredentialHelper": "/absolute/path/credential-process",
  "inferenceCredentialHelperTtlSec": 3500
}
```

`inferenceCredentialKind=helper-script` สำคัญ เพราะถ้ามีทั้ง helper และ profile แต่ไม่กำหนด kind ชัดเจน Claude Desktop อาจเลือก AWS profile ผิดเส้นทางจน authentication fail

### 2. AWS Profile Mode — Legacy

Claude Desktop อ่าน AWS profile:

```ini
[profile ClaudeCode]
credential_process = /path/credential-process --profile ClaudeCode
region = us-west-2
```

แล้ว AWS SDK จะเรียก `credential_process`

ปัญหาหลักคือไฟล์นี้:

```text
~/.aws/credentials
```

มี priority สูงกว่า:

```text
~/.aws/config
```

ถ้าใน `~/.aws/credentials` มี block ชื่อเดียวกัน เช่น:

```ini
[ClaudeCode]
aws_access_key_id = ...
aws_secret_access_key = ...
aws_session_token = ...
```

AWS SDK อาจใช้ static credential ตรงนั้นและไม่เรียก `credential_process` ส่งผลให้หลัง token หมดอายุเกิด:

```text
403 The security token included in the request is invalid
```

ดังนั้นเอกสารแนะนำ:

* ใช้ Credential Helper Mode
* ใช้ Keyring storage
* ลบ stale profile ใน `~/.aws/credentials`

---

## Web Search และ WebFetch

ส่วนนี้ตรงกับปัญหาที่คุณกำลังทำอยู่มากที่สุด

Claude Cowork บล็อก sandbox outbound egress โดยค่าเริ่มต้น ดังนั้นแม้ Web Search จะคืน URL มาได้ แต่ WebFetch อาจเปิดหน้าเว็บไม่ได้ถ้าไม่ได้ตั้ง:

```json
{
  "coworkEgressAllowedHosts": "[\"*\"]",
  "coworkWebSearchEnabled": "true"
}
```

Custom keys ที่เกี่ยวข้อง:

| Key                        | หน้าที่                              |
| -------------------------- | ------------------------------------ |
| `coworkEgressAllowedHosts` | อนุญาต outbound host สำหรับ WebFetch |
| `coworkWebSearchEnabled`   | เปิด Web Search                      |
| `managedMcpServers`        | deploy MCP server ให้องค์กร          |
| `disabledBuiltinTools`     | ปิด tool ที่ไม่อนุญาต                |
| `allowedWorkspaceFolders`  | จำกัด folder ที่ Cowork เข้าถึงได้   |

ตัวอย่าง profile:

```json
{
  "cowork_3p_enabled": true,
  "cowork_3p_extra_keys": {
    "coworkEgressAllowedHosts": "[\"*\"]",
    "coworkWebSearchEnabled": "true",
    "allowedWorkspaceFolders": "[\"/Users\",\"/home\"]"
  }
}
```

เอกสารเตือนว่า:

```json
["*"]
```

เปิดออกทุก host เหมาะสำหรับทดสอบ แต่ production ควรจำกัด domain เช่น:

```json
{
  "coworkEgressAllowedHosts": "[\"github.com\",\"docs.aws.amazon.com\",\"*.amazonaws.com\"]"
}
```

เพราะ Web Search กับ WebFetch เป็นคนละส่วน:

* **Web Search** คืน title, URL และ snippet
* **WebFetch** ต้องมี egress permission เพื่อเปิด URL จริง

---

## AWS-native Web Search ผ่าน AgentCore

โซลูชันนี้รองรับ Web Search ผ่าน **Amazon Bedrock AgentCore Gateway** โดย query ไม่ต้องออกไปยัง third-party search API

ขั้นตอน:

```bash
ccwb init
ccwb deploy websearch
ccwb package
```

ระบบจะ inject remote MCP ชื่อ:

```text
agentcore-websearch
```

ตัวอย่าง config:

```json
{
  "name": "agentcore-websearch",
  "url": "https://<gateway-id>.gateway.bedrock-agentcore.us-east-1.amazonaws.com/mcp",
  "headersHelper": "/absolute/path/websearch-headers",
  "headersHelperTtlSec": 900
}
```

Authentication ใช้:

```json
{
  "Authorization": "Bearer <id_token>"
}
```

ผ่าน `headersHelper` ซึ่งจะ silent-refresh token โดยไม่เปิด browser

ข้อจำกัด:

* AgentCore Managed Web Search อยู่ที่ `us-east-1`
* Search query หรือ prompt fragment จะถูกประมวลผลใน `us-east-1`
* ค่าใช้จ่ายในเอกสารระบุประมาณ `$7 / 1,000 queries`
* ต้องใช้ remote MCP แบบมาตรฐาน ไม่ใช่ built-in custom websearch connector เพราะ request body ไม่ตรงกับ AgentCore Gateway และอาจแสดง “No results” แม้ authentication สำเร็จ

---

## MCP และ Policy ที่องค์กรควบคุมได้

องค์กรสามารถกำหนดได้ว่า:

* เปิด Code tab หรือไม่
* ให้ติดตั้ง Desktop Extension เองหรือไม่
* ต้องใช้ signed extension หรือไม่
* อนุญาต local MCP หรือไม่
* บังคับ managed MCP server
* ปิด built-in tool บางตัว
* จำกัด workspace folder
* จำกัด token usage ต่อช่วงเวลา

ตัวอย่าง managed MCP:

```json
{
  "managedMcpServers": "[{\"name\":\"internal-search\",\"url\":\"https://mcp.example.com/mcp\"}]"
}
```

---

## Monitoring

ถ้ามี monitoring stack อยู่แล้ว `ccwb cowork generate` จะใส่ OTLP endpoint ให้โดยอัตโนมัติ

Metrics ที่เก็บได้:

* Input/output/cache tokens
* Estimated cost
* Session count
* Model breakdown
* Platform distribution
* Usage ราย device

แต่ `user.id` เป็น device UUID ไม่ใช่ตัวตนผู้ใช้จริง จึงต้อง map กับข้อมูล MDM enrollment เอง หากต้องการ chargeback รายบุคคล

---

## ข้อสรุปสำหรับระบบของคุณ

เอกสารนี้ยืนยันว่า Claude Cowork On-Prem/Enterprise ผ่าน Bedrock ควรออกแบบเป็น:

```text
Claude Desktop
 + MDM / Registry Policy
 + Credential Helper
 + Corporate OIDC
 + Amazon Bedrock
 + Managed MCP
 + Explicit Egress Policy
 + OTEL Monitoring
```

สิ่งที่ควรเลือกสำหรับ production:

1. ใช้ **Credential Helper Mode** ไม่ใช้ AWS Profile legacy เป็นหลัก
2. ตั้ง `inferenceCredentialKind=helper-script`
3. ใช้ absolute path ของ helper โดยเฉพาะ macOS เพราะ `~` ไม่ถูก expand
4. ใช้ Keyring และป้องกัน stale credential ใน `~/.aws/credentials`
5. กำหนด `coworkEgressAllowedHosts` ให้ชัดเจน
6. ใช้ `["*"]` เฉพาะตอนทดสอบ
7. ใช้ Managed MCP ผ่าน MDM แทนให้ user เพิ่ม MCP เอง
8. ถ้าต้องการ web search ที่ข้อมูลไม่ออก AWS ให้ใช้ AgentCore Gateway
9. ตรวจ region และ data-residency เพราะ AgentCore Web Search ทำงานใน `us-east-1`

ประเด็นสำคัญสุดคือ **WebFetch egress ไม่ได้แก้ที่ LiteLLM หรือ Bedrock gateway** แต่ต้องแก้ที่ policy ของ Claude Cowork ด้วย `coworkEgressAllowedHosts` โดยตรง.
