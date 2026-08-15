# Authentik Implementation — Original Design Brief (historical)

> **หมายเหตุ:** เอกสารนี้คือ brief ต้นทางที่ใช้ generate เอกสารและโครงสร้างทั้งหมด
> ใน `gateway-auth/authentik/` ปัจจุบัน (รวมถึง blueprints, scripts, docs/*, nginx/*)
>
> **Path ที่ระบุในเอกสาร** (`authentik-deployment/`) เป็น path เดิม
> ปัจจุบันถูกย้ายมาเป็น `gateway-auth/authentik/` และรวมเข้า compose project เดียว
> ผ่าน `gateway-auth/compose.yml` (ใช้ `include:`) — เนื้อหา design และ implementation
> ยังคงเดิม เปลี่ยนเฉพาะ path และ env consolidation
>
> **สำหรับคนอ่าน:** อ่านเอกสารนี้เพื่อเข้าใจ design rationale ต้นทาง (ทำไมเลือก Authentik,
> ทำไมใช้ Blueprint, ทำไม `inference` scope + `aud=ai-gateway`)
> สำหรับวิธีใช้งานจริงในโครงสร้างใหม่ → [README.md](README.md)

---

คุณคือ Senior DevOps Engineer, Identity Architect และ OAuth/OIDC Security Engineer

ให้สร้างระบบ Authentication สำหรับ Claude Desktop โดยใช้ Authentik เป็น OIDC Provider ภายใต้โดเมน:

https://auth.company.com

ระบบนี้จะทำหน้าที่เป็น External IdP สำหรับ Claude Desktop โดย Claude Desktop จะใช้:

- OIDC Authorization Code Flow
- PKCE แบบ S256
- System browser
- Public client
- Loopback redirect URI
- Access token
- Refresh token

ขอบเขตงานนี้ทำเฉพาะ Authentik และ Identity Management เท่านั้น

ยังไม่ต้อง implement AI Gateway
ยังไม่ต้องแก้ LiteLLM
ยังไม่ต้อง validate JWT ที่ Gateway

==================================================
เป้าหมาย
==================================================

สร้าง Authentik deployment ที่รองรับ:

1. Local user management
2. Login ผ่าน username/password
3. OIDC Provider สำหรับ Claude Desktop
4. Authorization Code Flow + PKCE S256
5. Access Token แบบ Bearer
6. Refresh Token ผ่าน offline_access
7. Role และ Group สำหรับควบคุมสิทธิ์
8. รองรับการเพิ่ม Active Directory ภายหลัง
9. รองรับการเพิ่ม Entra ID, Google หรือ External IdP ภายหลัง
10. หน้า Login ที่สามารถแสดงตัวเลือก IdP ได้
11. Docker Compose deployment
12. Reverse proxy และ HTTPS
13. Backup และ restore
14. เอกสารตั้งค่า Claude Desktop
15. ขั้นตอนตรวจสอบ OIDC discovery, JWKS และ token claims

==================================================
เทคโนโลยี
==================================================

ใช้:

- Authentik เวอร์ชัน stable แบบระบุ version ชัดเจน
- Docker Compose v2
- PostgreSQL
- Nginx หรือ Caddy เป็น reverse proxy
- TLS certificate จาก Let's Encrypt หรือ certificate ภายในองค์กร
- Authentik Blueprint สำหรับ configuration ที่ทำซ้ำได้
- Environment variables และ Docker secrets เท่าที่เหมาะสม

ห้ามใช้ image tag `latest`

ตรวจสอบ release stable ปัจจุบันจาก official Authentik documentation ก่อนเลือก version

ใช้ official Authentik Docker Compose เป็นฐาน
อย่าเขียน Compose ใหม่ทั้งหมดโดยไม่อิง official Compose

==================================================
Architecture
==================================================

ออกแบบตาม flow นี้:

Claude Desktop
    ↓ เปิด system browser
https://auth.company.com
    ↓
Authentik Login
    ├── Local Account
    ├── Active Directory ในอนาคต
    ├── Microsoft Entra ID ในอนาคต
    └── Google Workspace ในอนาคต
    ↓
Authorization Code + PKCE
    ↓
Access Token + Refresh Token
    ↓
Claude Desktop
    ↓
Authorization: Bearer <access_token>
    ↓
AI Gateway ในอนาคต

Authentik ต้องเป็น issuer เดียว:

https://auth.company.com/application/o/claude-desktop/

หรือ issuer URL จริงที่ Authentik สร้างให้ตาม provider configuration

ห้ามสมมติ issuer path เอง
ต้องดึงค่าจริงจาก OIDC discovery endpoint หลัง deploy

==================================================
Deployment Structure
==================================================

สร้าง project structure:

authentik-deployment/
├── compose.yml
├── compose.override.yml
├── .env.example
├── .gitignore
├── Makefile
├── README.md
├── nginx/
│   ├── nginx.conf
│   └── conf.d/
│       └── auth.company.com.conf
├── blueprints/
│   └── claude-desktop.yaml
├── scripts/
│   ├── generate-secrets.sh
│   ├── bootstrap.sh
│   ├── verify-oidc.sh
│   ├── backup.sh
│   └── restore.sh
├── docs/
│   ├── architecture.md
│   ├── installation.md
│   ├── authentik-configuration.md
│   ├── claude-desktop-setup.md
│   ├── active-directory-setup.md
│   ├── external-idp-setup.md
│   ├── backup-restore.md
│   ├── production-hardening.md
│   └── troubleshooting.md
└── backups/

==================================================
Docker Compose
==================================================

ใช้ official Authentik Compose configuration เป็นฐาน

ประกอบด้วยอย่างน้อย:

- authentik server
- authentik worker
- PostgreSQL
- reverse proxy
- persistent volumes
- health checks
- restart policies
- isolated Docker network

ข้อกำหนด:

- Pin Authentik image version
- Pin PostgreSQL major version
- ห้าม hardcode secret
- ห้าม commit `.env`
- ใช้ persistent volume สำหรับ PostgreSQL
- ใช้ persistent volume สำหรับ Authentik media และ templates ตามความจำเป็น
- ตั้ง container timezone เป็น UTC
- ห้าม mount `/etc/localtime` หรือ `/etc/timezone` เข้า Authentik container
- expose Authentik ผ่าน reverse proxy เท่านั้นใน production
- PostgreSQL ต้องไม่เปิด port สู่ public network
- Authentik internal port ไม่ควรเปิดสู่ public network
- เพิ่ม health checks และ dependency conditions ที่เหมาะสม

Authentik official documentation ระบุว่า Docker Compose เหมาะกับ test และ small-scale production และต้องมีอย่างน้อย 2 CPU cores กับ RAM 2 GB ดังนั้นให้บันทึก resource requirement นี้ใน README

==================================================
Environment Variables
==================================================

สร้าง `.env.example` อย่างน้อย:

AUTHENTIK_VERSION=
PG_DB=authentik
PG_USER=authentik
PG_PASS=
AUTHENTIK_SECRET_KEY=

AUTHENTIK_ERROR_REPORTING__ENABLED=false

AUTHENTIK_EMAIL__HOST=
AUTHENTIK_EMAIL__PORT=587
AUTHENTIK_EMAIL__USERNAME=
AUTHENTIK_EMAIL__PASSWORD=
AUTHENTIK_EMAIL__USE_TLS=true
AUTHENTIK_EMAIL__FROM=auth@company.com

AUTH_DOMAIN=auth.company.com
AUTHENTIK_EXTERNAL_HOST=https://auth.company.com

TLS_CERT_PATH=
TLS_KEY_PATH=

ห้ามใส่ค่าความลับจริงใน `.env.example`

สร้าง `generate-secrets.sh` ให้สร้าง:

- PostgreSQL password
- Authentik secret key

ใช้ cryptographically secure random generation

รองรับทั้ง Linux และ WSL
ถ้าเป็น PowerShell ให้สร้าง script เพิ่มได้

==================================================
Authentik Initial Setup
==================================================

สร้างขั้นตอน bootstrap ดังนี้:

1. Start PostgreSQL
2. Start Authentik server และ worker
3. เปิด initial setup URL
4. สร้าง akadmin password
5. ยืนยันว่า server, worker และ PostgreSQL healthy
6. ตรวจสอบ Authentik version
7. ตรวจสอบ external host
8. Apply Blueprint
9. Verify application และ OAuth provider
10. Verify discovery endpoint

Initial setup URL ต้องมี trailing slash ตามข้อกำหนดของ Authentik

อย่า hardcode admin password

==================================================
Authentik Application
==================================================

สร้าง Authentik Application:

Name:
Claude Desktop

Slug:
claude-desktop

Launch URL:
เว้นว่าง หรือใช้ค่าที่ไม่ทำให้เกิด redirect ผิด

Group:
Company AI

Policy engine mode:
กำหนดแบบที่ deny access เมื่อไม่มี binding

สร้าง Application Binding ให้เฉพาะกลุ่ม:

claude-users
claude-admins

ต้องระวังว่า Authentik อนุญาตทุก user เข้า application หากไม่มี binding ดังนั้น Blueprint ต้องสร้าง binding อย่างชัดเจน

==================================================
OAuth2 / OIDC Provider
==================================================

สร้าง OAuth2/OpenID Provider:

Name:
Claude Desktop OIDC

Client ID:
claude-desktop

Client type:
Public

Client secret:
ไม่มี

Authorization flow:
default-provider-authorization-explicit-consent

หรือเลือก flow ที่เหมาะกับ production และอธิบายเหตุผล

Invalidation flow:
default-provider-invalidation-flow

Grant types:

- authorization_code
- refresh_token

Response types:

- code

PKCE:

- Required
- S256 เท่านั้น
- ไม่รองรับ plain

Scopes:

- openid
- profile
- email
- offline_access
- inference

Access token validity:
15 นาที

Refresh token validity:
8 ชั่วโมงสำหรับ MVP

Refresh token rotation:
เปิด หาก Authentik รองรับใน provider configuration

Include claims:

- sub
- preferred_username
- name
- email
- groups
- roles หรือ equivalent claim
- scope

Audience:

ai-gateway

หาก Authentik ไม่สามารถกำหนด access-token audience แบบ static ผ่าน UI/Blueprint ได้โดยตรง ให้:

1. ตรวจสอบ official Authentik scope/property mapping mechanism
2. สร้าง custom scope mapping หรือ property mapping
3. เพิ่ม `aud` เป็น `ai-gateway`
4. อธิบายข้อจำกัดและวิธีตรวจสอบใน decoded JWT

ห้ามสร้าง token claim ด้วยวิธีที่ไม่รองรับอย่างเป็นทางการ

==================================================
Redirect URI
==================================================

Claude Desktop ใช้ loopback redirect:

http://127.0.0.1:<ephemeral-port>/callback

ต้องตั้ง Redirect URI แบบ regex ใน Authentik เพื่อรองรับ ephemeral port โดยยอมรับเฉพาะ:

- Scheme: http
- Host: 127.0.0.1
- Port: ตัวเลขแบบ ephemeral
- Path: /callback
- ไม่มี query ที่ควบคุมไม่ได้
- ไม่มี host อื่น
- ไม่อนุญาต localhost
- ไม่อนุญาต IPv6
- ไม่อนุญาต path อื่น

ใช้ regex ที่ปลอดภัยประมาณ:

^http://127\.0\.0\.1:[0-9]{1,5}/callback$

แต่ต้องเพิ่ม validation ว่า port อยู่ในช่วง 1–65535 หาก Authentik regex อย่างเดียวตรวจ range ไม่ได้

หากต้องใช้ fixed port สำหรับ compatibility ให้รองรับผ่าน environment variable:

CLAUDE_REDIRECT_PORT=

และใช้:

http://127.0.0.1:${CLAUDE_REDIRECT_PORT}/callback

อธิบาย trade-off ระหว่าง ephemeral port กับ fixed port

==================================================
Scope Mapping
==================================================

สร้าง scope/property mappings:

openid:
- sub

profile:
- preferred_username
- name

email:
- email
- email_verified เท่าที่มี

inference:
- groups
- roles
- tenant หรือ organization identifier ถ้าจำเป็น

ห้ามใส่ password hash, internal database metadata หรือ sensitive attribute ลง token

ตัวอย่าง claims ที่คาดหวัง:

{
  "iss": "https://auth.company.com/application/o/claude-desktop/",
  "sub": "<authentik-user-id>",
  "aud": "ai-gateway",
  "preferred_username": "marcus",
  "name": "Marcus",
  "email": "marcus@company.com",
  "groups": ["claude-users"],
  "scope": "openid profile email inference",
  "exp": 1760000900,
  "iat": 1760000000
}

ต้องระบุชัดว่า issuer จริงต้องอ่านจาก discovery endpoint ไม่ใช่เดาจากตัวอย่าง

==================================================
Groups and Access Control
==================================================

สร้าง groups:

- claude-users
- claude-admins
- claude-suspended

Policy:

- claude-users เข้า Claude Desktop application ได้
- claude-admins เข้าได้และมีสิทธิ์บริหาร Authentik ตามที่กำหนด
- claude-suspended เข้า application ไม่ได้
- User ที่ inactive ห้าม login
- User ที่ไม่มี approved group ห้าม authorize application

สร้าง test users ผ่าน documentation เท่านั้น
ห้าม seed password ที่อ่อนแอหรือ hardcode password

==================================================
Local User Management
==================================================

ใช้ Authentik built-in user management

รองรับ:

- Create user
- Disable user
- Reset password
- Add/remove group
- View login activity
- Revoke sessions
- Assign permissions
- Search user

สร้าง documentation สำหรับ operator:

- เพิ่ม user
- disable user
- reset password
- เพิ่มเข้า claude-users
- remove access
- revoke active sessions
- ตรวจ audit/event logs

==================================================
Login UI
==================================================

ใช้ Authentik default authentication flow ก่อน

ปรับ Branding:

Title:
Company AI

Domain:
auth.company.com

Logo:
ใช้ placeholder และอธิบายตำแหน่งเปลี่ยนไฟล์

Login page ควรแสดง:

Company AI

Username or Email
Password

[ Sign in ]

เตรียมให้เพิ่มตัวเลือกในอนาคต:

[ Sign in with Active Directory ]
[ Sign in with Microsoft Entra ID ]
[ Sign in with Google Workspace ]

อย่าแก้ source code ของ Authentik เพื่อทำ UI

ใช้:

- Brands
- Flows
- Stages
- Sources
- Theme configuration

==================================================
Future Active Directory Integration
==================================================

ยังไม่ต้องเชื่อม AD จริงใน MVP แต่สร้างเอกสารและ optional Blueprint แยกไว้

รองรับ:

- LDAP Source
- LDAPS
- User synchronization
- Group synchronization
- Bind DN
- Base DN
- User object filter
- Group object filter
- Attribute mappings
- Scheduled sync
- Disable removed users ตาม policy

ตัวอย่าง environment variables:

AD_SERVER_URI=ldaps://ad.company.local:636
AD_BIND_CN=
AD_BIND_PASSWORD=
AD_BASE_DN=DC=company,DC=local
AD_USER_OU=OU=Users,DC=company,DC=local
AD_GROUP_OU=OU=Groups,DC=company,DC=local

ห้ามใช้ plain LDAP ใน production

ห้าม disable LDAP signing เพื่อแก้ปัญหา
ให้ใช้ LDAPS และตรวจ certificate trust

Authentik official documentation รองรับ LDAP/Active Directory source และแนะนำ LDAPS สำหรับ secure integration

==================================================
Future External IdP
==================================================

สร้างเอกสารสำหรับเพิ่ม:

- Microsoft Entra ID
- Google Workspace
- Okta
- Generic OIDC

หลังสร้าง source แล้ว ต้องเพิ่ม source เข้า:

default-authentication-identification stage
→ Selected sources

เพื่อให้ปุ่ม IdP แสดงบนหน้า login

อธิบายว่า Authentik จะทำหน้าที่เป็น Identity Broker:

Claude Desktop
→ Authentik
→ Entra / Google / AD / Local
→ Authentik token
→ Claude Desktop

Claude Desktop ต้องเห็น issuer เดียวคือ Authentik

==================================================
Blueprint
==================================================

สร้าง Authentik Blueprint แบบ idempotent สำหรับ:

- Application
- OAuth2/OIDC Provider
- Scope mappings
- Groups
- Policies
- Application bindings
- Branding ที่ automate ได้
- Authentication flow binding เท่าที่จำเป็น

Blueprint ต้อง:

- apply ซ้ำได้
- ไม่สร้าง object ซ้ำ
- ใช้ stable identifiers
- ไม่ hardcode secrets
- อ่านค่าจาก environment variable หรือ placeholder ที่ documented
- ไม่ลบ default Authentik objects โดยไม่จำเป็น

ถ้าบาง configuration ไม่เหมาะกับ Blueprint ให้สร้าง documented manual step พร้อมเหตุผล

==================================================
Claude Desktop Configuration
==================================================

สร้าง `docs/claude-desktop-setup.md`

ให้ผู้ใช้กรอก:

Gateway auth scheme:
bearer

Credential kind:
Interactive sign-in

Client ID:
claude-desktop

Issuer URL:
ใช้ issuer ที่คืนจาก Authentik discovery endpoint

Authorization URL:
ใช้ authorization_endpoint จาก discovery document

Token URL:
ใช้ token_endpoint จาก discovery document

Bearer token:
Access token

Scopes:
openid profile email inference

Append offline_access:
Enabled

Redirect port:
Ephemeral

Additional redirect referrer hosts:
ว่าง

เน้นว่าไม่ควรเดา endpoint
ให้ใช้ discovery endpoint:

<issuer>/.well-known/openid-configuration

สร้างตัวอย่าง flow:

Claude Desktop
→ System Browser
→ Authentik
→ Login
→ Authorization Code + PKCE
→ Access Token
→ Authorization: Bearer
→ Gateway

==================================================
Reverse Proxy
==================================================

ตั้ง Nginx หรือ Caddy ให้:

- รับ HTTPS ที่ auth.company.com
- Forward headers ถูกต้อง
- Forward Host
- Forward X-Forwarded-Proto
- Forward X-Forwarded-For
- รองรับ WebSocket ถ้าจำเป็น
- ตั้ง body size ที่เหมาะสม
- ตั้ง timeout ที่เหมาะสม
- เพิ่ม HSTS หลัง HTTPS พร้อมใช้งาน
- เพิ่ม X-Content-Type-Options
- เพิ่ม Referrer-Policy
- เพิ่ม frame policy ที่ไม่ทำให้ Authentik flow เสีย
- Redirect HTTP → HTTPS
- ไม่เปิด admin port แยกสู่ public network

อธิบาย DNS และ certificate requirements

==================================================
Security
==================================================

ต้อง implement และ document:

- HTTPS only ใน production
- Strong Authentik secret key
- Strong PostgreSQL password
- Pin image versions
- PostgreSQL isolated network
- Admin MFA
- Disable default or unused admin sessions
- Restrict admin access
- Rate limiting ที่ reverse proxy
- Secure headers
- Backup encryption
- Avoid token logging
- Avoid authorization code logging
- Log rotation
- Session revocation
- Update procedure
- Signing key persistence
- Database backup
- Restore drill
- Group-based application access
- No anonymous application access

ตรวจสอบว่า JWKS เผยแพร่เฉพาะ public key

ห้าม log:

- passwords
- client secrets
- authorization codes
- access tokens
- refresh tokens
- session cookies

==================================================
Verification
==================================================

สร้าง `scripts/verify-oidc.sh` ให้ตรวจ:

1. DNS resolve
2. HTTPS certificate
3. Discovery endpoint
4. issuer
5. authorization_endpoint
6. token_endpoint
7. jwks_uri
8. response_types_supported มี code
9. grant_types_supported มี authorization_code และ refresh_token
10. code_challenge_methods_supported มี S256
11. scopes_supported มี openid profile email offline_access inference
12. JWKS endpoint คืน public keys
13. Application และ provider พร้อมใช้งาน
14. Redirect URI ถูกจำกัด
15. Unauthorized user เข้า application ไม่ได้

ใช้ curl และ jq

ห้ามพยายาม automate user password login ผ่าน Resource Owner Password Grant
เพราะ flow นี้ใช้ Authorization Code + PKCE ผ่าน browser

==================================================
Testing
==================================================

สร้าง test checklist สำหรับ manual testing:

1. Local user login สำเร็จ
2. User ไม่มี claude-users ถูกปฏิเสธ
3. User ใน claude-users authorize ได้
4. User ใน claude-suspended ถูกปฏิเสธ
5. Redirect host อื่นถูกปฏิเสธ
6. localhost ถูกปฏิเสธ
7. 127.0.0.1 path อื่นถูกปฏิเสธ
8. Correct ephemeral callback ผ่าน
9. PKCE S256 ผ่าน
10. PKCE plain ถูกปฏิเสธ
11. Access token มี issuer ถูกต้อง
12. Access token มี audience ai-gateway
13. Access token มี scope inference
14. Refresh token ได้เมื่อขอ offline_access
15. Refresh token ใช้ refresh access token ได้
16. Session revoke แล้ว refresh ไม่ได้
17. Disabled user login ไม่ได้
18. Logout ทำงาน
19. JWKS validate token ได้
20. Claude Desktop เปิด browser และ login สำเร็จ

==================================================
Backup and Restore
==================================================

สร้าง scripts:

backup.sh
restore.sh

Backup อย่างน้อย:

- PostgreSQL database
- Authentik media
- custom templates/themes ถ้ามี
- Blueprint files
- environment configuration โดยไม่รวม plaintext secrets ใน archive ปกติ
- TLS configuration เท่าที่เหมาะสม

Backup file ต้อง timestamp
รองรับ retention
ตรวจ exit code
สร้าง checksum
อธิบาย encryption

Restore ต้อง:

- ตรวจ backup file
- หยุด service ที่จำเป็น
- restore PostgreSQL
- restore media
- restart services
- run health check
- verify discovery endpoint

==================================================
Operations
==================================================

สร้าง Makefile:

make init
make secrets
make pull
make up
make down
make restart
make logs
make status
make health
make apply-blueprint
make verify
make backup
make restore
make upgrade

Upgrade process ต้อง:

1. อ่าน release notes
2. สำรองข้อมูล
3. Pin version ใหม่
4. Pull image
5. Start stack
6. ตรวจ migrations
7. ตรวจ health
8. ตรวจ discovery
9. ทดสอบ login
10. rollback ได้

ห้ามใช้ automatic upgrade แบบไม่มี approval

==================================================
Deliverables
==================================================

ส่งมอบ:

1. `compose.yml`
2. `compose.override.yml`
3. `.env.example`
4. `.gitignore`
5. `Makefile`
6. Nginx หรือ Caddy configuration
7. Authentik Blueprint
8. Secret generation script
9. Bootstrap script
10. OIDC verification script
11. Backup script
12. Restore script
13. README
14. Architecture diagram แบบ Mermaid
15. Installation guide
16. Authentik configuration guide
17. Claude Desktop setup guide
18. Active Directory integration guide
19. External IdP guide
20. Production hardening checklist
21. Troubleshooting guide
22. Manual test checklist

==================================================
Implementation Rules
==================================================

- ใช้ official Authentik documentation เป็น source of truth
- ใช้ official Docker Compose เป็นฐาน
- Pin versions
- ห้ามใช้ `latest`
- ห้ามเขียน OAuth/OIDC implementation เอง
- ห้ามเขียน custom user-management application
- ใช้ Authentik built-in users, groups, flows, policies และ providers
- ห้ามแก้ Authentik source code
- ใช้ Blueprint และ documented configuration
- ห้าม hardcode secrets
- ห้ามใช้ weak default password
- ห้ามเปิด PostgreSQL สู่ public
- ห้ามใช้ plain LDAP ใน production
- ห้ามข้าม security validation
- ห้ามใส่ pseudocode ในไฟล์ deployment
- ทุก script ต้องมี `set -euo pipefail`
- ทุก script ต้องตรวจ dependency และ exit code
- ทุก configuration ต้องอธิบายวิธีเปลี่ยนจาก local development ไป production
- หาก property หรือ schema ของ Blueprint เปลี่ยนตาม Authentik version ให้ตรวจ official schema ของ version ที่ pin ก่อนสร้าง
- อย่า implement Gateway หรือ LiteLLM ในงานนี้

==================================================
ลำดับการทำงาน
==================================================

Phase 1:
ตรวจสอบ Authentik stable version และ official Compose

Phase 2:
สรุป architecture, assumptions และ security decisions

Phase 3:
สร้าง project structure, Compose และ environment files

Phase 4:
สร้าง reverse proxy และ HTTPS configuration

Phase 5:
สร้าง Authentik Blueprint สำหรับ Claude Desktop OIDC

Phase 6:
สร้าง groups, policies และ application bindings

Phase 7:
สร้าง bootstrap และ verification scripts

Phase 8:
สร้าง backup/restore scripts

Phase 9:
สร้าง documentation

Phase 10:
รัน validation ทั้งหมด

ก่อนสร้างไฟล์ ให้แสดง:

- Authentik version ที่เลือก
- Official documentation ที่อ้างอิง
- Architecture
- OIDC endpoints ที่คาดหวัง
- Redirect URI strategy
- Token strategy
- รายการไฟล์ที่จะสร้าง

เมื่อจบแต่ละ Phase:

- แสดงไฟล์ที่สร้างหรือแก้ไข
- ตรวจ syntax
- รัน `docker compose config`
- ตรวจ shell scripts ด้วย shellcheck หากมี
- รายงานข้อผิดพลาด
- แก้ไขก่อนเข้าสู่ Phase ถัดไป

เมื่อจบงาน ให้แสดงคำสั่งเริ่มระบบแบบสั้น:

cp .env.example .env
./scripts/generate-secrets.sh
docker compose pull
docker compose up -d

และแสดงขั้นตอนถัดไปสำหรับเปิด initial setup และทดสอบ Claude Desktop