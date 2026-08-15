# Excise Cowork Demo

Demo Workspace สำหรับแสดงศักยภาพของ **Claude Cowork** ในงานกรมสรรพสามิต — ตั้งแต่อ่านกฎหมาย ถามตอบเอกสาร วิเคราะห์ข้อมูลภาษี ตรวจสอบความถูกต้อง จนถึงสร้างรายงานและอีเมลถึงผู้บริหาร

## โครงสร้าง Workspace

```
Excise-Cowork-Demo/
├── 01-Law/          ← กฎหมายและเอกสารเกี่ยวกับการผลิตสุรา
├── 02-Manual/       ← คู่มือราชการ
├── 03-Strategy/     ← แผนและยุทธศาสตร์
├── 04-Tax-Data/     ← ข้อมูลการจัดเก็บภาษี (CSV)
└── Output/          ← ผลลัพธ์ที่ Claude สร้างขึ้น
```

## Showcases

| # | Use Case | สิ่งที่ Claude ทำได้ |
|---|---|---|
| 01 | สรุปกฎหมายภาษีสรรพสามิต | อ่านกฎหมาย สรุปสาระสำคัญ และสร้าง HTML + PowerPoint |
| 02 | ถามตอบจากเอกสารราชการ | Cross-document reasoning รวมคำตอบจากหลายเอกสาร |
| 03 | วิเคราะห์ข้อมูลการจัดเก็บภาษี | เปรียบเทียบ หาแนวโน้ม ตรวจจับ anomaly สร้าง Excel summary |
| 04 | ตรวจสอบความถูกต้องของข้อมูล | ตรวจ missing/duplicate/formula ผิด ข้อมูลขัดแย้งระหว่างไฟล์ |
| 05 | สร้าง PowerPoint สำหรับผู้บริหาร | 6 หน้า เน้น visualization พร้อมระบุแหล่งข้อมูล |
| 06 | Email ถึงผู้บริหาร | ร่าง draft สรุปประเด็นสำคัญ พร้อมรายการไฟล์แนบ |

## วิธีใช้

เปิด Claude Desktop / Claude Code ที่เชื่อมกับ Claude 3P Platform แล้วเรียกใช้ Workspace นี้ ดูตัวอย่าง prompt ได้ที่ [Show Case](../main-menu/html/showcase.html) ใน Main Menu

## ข้อจำกัด

Claude Cowork ควรใช้ภายใต้ Governance ขององค์กร — ดูรายละเอียดที่ [Show Case → ข้อจำกัดและข้อแนะนำ](../main-menu/html/showcase.html#limitations)