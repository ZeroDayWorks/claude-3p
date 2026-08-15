# show-case

> ตัวอย่าง output จริงจาก Claude Desktop / Claude Code ที่ใช้งานผ่าน `gateway-auth/`
> เก็บไว้เพื่อเป็นหลักฐานว่าระบบทำงานได้จริง และเป็นตัวอย่าง use case ให้ผู้สนใจ

## case01 — Legal research (Liquor Excise Act)

ไฟล์ต้นทาง: [case01/case01.pdf](case01/case01.pdf)
Prompt: [case01/case01.txt](case01/case01.txt)
Output: [case01/summary_liquor_excise.html](case01/summary_liquor_excise.html)

ให้ Claude อ่าน PDF พ.ร.บ. สุรา แล้วสรุปใจความสำคัญเป็น HTML ที่จัดหมวดหมู่ดี

## case02-schedule — OT roster automation

ไฟล์ input: 5 ไฟล์ Excel ([OT_1 ถึง OT_5](case02-schedule/)) — ตารางกะ OT ของพนักงาน 5 คน

Use case: ให้ Claude aggregate ตาราง OT หลายไฟล์, คำนวณชั่วโมงรวม, และ flag กรณีที่เกิน
ขีดจำกัด OT ต่อสัปดาห์ (ตาม พ.ร.บ. คุ้มครองแรงงาน)

> ไฟล์ xlsx เป็นข้อมูลสมมติ (ชื่อพนักงานใช้นามสมมติ)
