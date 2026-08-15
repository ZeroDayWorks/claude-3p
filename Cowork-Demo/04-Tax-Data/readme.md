# 04-Tax-Data — ข้อมูลการจัดเก็บภาษี

ข้อมูลการจัดเก็บภาษีสรรพสามิตแยกตามประเภท ใช้สำหรับ Claude วิเคราะห์ เปรียบเทียบ และตรวจสอบความถูกต้อง

## ไฟล์ข้อมูล

| ไฟล์ | ประเภทภาษี |
|---|---|
| `การจัดเก็บภาษีสุรา.csv` | ภาษีสุรา |
| `การจัดเก็บภาษีรถยนต์.csv` | ภาษีรถยนต์ |

## Use Cases

| Use Case | ตัวอย่าง Prompt |
|---|---|
| **Analyze** | "วิเคราะห์ข้อมูลการจัดเก็บภาษีทั้งหมด เปรียบเทียบแต่ละประเภท หาแนวโน้มที่น่าสนใจ และระบุข้อมูลผิดปกติที่ควรตรวจสอบ" |
| **Create Summary** | "สร้าง Excel ใหม่ชื่อ `Excise-Tax-Management-Summary.xlsx`" |
| **Validate** | "ตรวจสอบข้อมูลทั้งหมดก่อนนำเสนอผู้บริหาร — ดู missing, duplicate, total ผิด, formula ผิด, วันที่ผิดปกติ" |
| **Trend** | "หาแนวโน้มรายเดือนและเปรียบเทียบ YoY ของแต่ละประเภทภาษี ทำเป็น visualization artifacts" |
| **Output** | "visualization artifacts html, Excise-Tax-Management-Summary.xlsx, send email (lazymarcus005#gmail.com)" |

## Output Structure

เมื่อสั่งสร้าง `Excise-Tax-Management-Summary.xlsx`:

```
Excise-Tax-Management-Summary.xlsx
├── Executive Summary    ← สรุปภาพรวมสำหรับผู้บริหาร
├── Monthly Trend        ← แนวโน้มรายเดือน
├── Tax Category         ← เปรียบเทียบตามประเภทภาษี
├── YoY Comparison       ← เปรียบเทียบกับปีก่อน
├── Anomaly              ← ข้อมูลผิดปกติที่ควรตรวจสอบ
└── Raw Data             ← ข้อมูลต้นฉบับอ้างอิง
```

## Concept

**Business Value Analysis** — ไม่ใช่แค่วิเคราะห์ข้อมูล แต่สร้างผลลัพธ์ที่ผู้บริหารใช้ตัดสินใจได้จริง

## Showcase

ดู [Showcase 03](../../main-menu/html/showcase.html#case03), [Showcase 04](../../main-menu/html/showcase.html#case04) และ [Showcase 05](../../main-menu/html/showcase.html#case05) ใน Main Menu