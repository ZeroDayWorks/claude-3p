# Main Menu

Static dashboard สำหรับ Claude 3P Platform — จุดเข้าเดียวสำหรับทุกระบบ.

## โครงสร้าง

```
main-menu/
└── html/
    ├── index.html      ← dashboard แสดงการ์ดทุกระบบ + health probe
    ├── docs.html       ← เอกสารรวม (static)
    ├── runbook.html    ← runbook รวม (static)
    └── assets/
        ├── style.css   ← สไตล์ + dark/light theme
        └── app.js      ← theme toggle, search, health probe
```

## รัน

เปิดใช้ผ่าน central compose ที่ root:

```sh
docker compose up -d main-menu
```

เข้า: <http://localhost:16580>

## แก้ไฟล์

ไม่มี build step — แก้ HTML/CSS/JS แล้วรีเฟรช browser ได้ทันที (nginx mount read-only).

## พอร์ต

`16580:80` (host:container) — เลือกเพื่อหลีกเลี่ยง conflict กับ service อื่น.