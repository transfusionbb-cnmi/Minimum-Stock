# Minimum Stock Web App: GitHub Pages + Supabase

ชุดนี้ปรับจากไฟล์เดิมให้แยกเป็นหลายไฟล์ เพื่อให้ `index.html` เบาลง และเปลี่ยนการโหลดข้อมูลล่าสุดไปใช้ Supabase เป็นหลัก

## ไฟล์ที่ต้องอัปขึ้น GitHub Pages

วางไฟล์ทั้งหมดนี้ไว้ตำแหน่งเดียวกับ `index.html`

```text
index.html
style.css
script.js
supabase-config.js
supabase-backend.js
Code.gs
Minimum Stock Web App.xlsx
.nojekyll
```

`Code.gs` และ `Minimum Stock Web App.xlsx` เก็บไว้เป็นไฟล์อ้างอิง/ทางสำรอง ไม่ได้ถูกโหลดเป็นหน้าเว็บโดยตรง

## ตั้งค่า Supabase

1. เข้า Supabase แล้วเปิด SQL Editor
2. คัดลอกโค้ดใน `supabase-schema.sql` ไปรัน 1 ครั้ง
3. ไปที่ Project Settings > API
4. เปิดไฟล์ `supabase-config.js`
5. ใส่ค่า `SUPABASE_URL` และ `SUPABASE_ANON_KEY`
6. อัปโหลดไฟล์ทั้งหมดขึ้น GitHub Pages
7. เปิดเว็บด้วย Incognito / Private Window เพื่อล้าง cache เดิม

## หลักการทำงานใหม่

- โหลดหน้าเว็บจาก GitHub Pages
- อ่านไฟล์ Excel ในเครื่องผู้ใช้ด้วย browser โดยตรง ไม่ต้องส่งไฟล์ใหญ่ไป Apps Script ก่อน
- คำนวณ Minimum Stock ใน browser
- บันทึกผลคำนวณล่าสุดลง Supabase เป็น snapshot
- Dashboard / Expiry Risk / Mobile Unit Planning โหลดจาก Supabase
- ถ้ายังไม่ได้ใส่ค่า Supabase หรือ Supabase error ระบบจะ fallback ไป Apps Script เดิมก่อน

## จุดที่ช่วยให้ไวขึ้น

- `index.html` ไม่แบก CSS/JS หนัก ๆ แล้ว
- Dashboard โหลด snapshot ล่าสุดจาก Supabase แทนการอ่าน Google Sheet ทุกครั้ง
- อัปโหลดไม่ต้องแปลง Excel ผ่าน Google Drive/Apps Script
- GitHub Pages cache ไฟล์ static ได้ดีกว่าเว็บ Apps Script

## หมายเหตุเรื่องความปลอดภัย

Policy ใน `supabase-schema.sql` เปิดให้ anon อ่านและ insert ได้ เพื่อให้เว็บ static ใช้งานได้ทันทีแบบไม่ต้อง login หากเว็บถูกแชร์ public คนที่เปิดเว็บได้จะสามารถอัปโหลด snapshot ใหม่ได้เช่นกัน ถ้าต้องการล็อกสิทธิ์จริงควรเพิ่ม Supabase Auth หรือ Edge Function รอบถัดไป


## v2.1 Fast Load Patch

- ปรับ Dashboard ให้ดึงเฉพาะคอลัมน์สรุปจาก Supabase ไม่ดึง JSON ก้อนใหญ่ทุกครั้งที่เปิดหน้าเว็บ
- Mobile Unit Planning จะดึงข้อมูลแบบ full เฉพาะตอนเปิดเมนูนั้น
- ตอนบันทึกไฟล์ใหม่ จะไม่ return JSON ก้อนใหญ่กลับมาทันที ทำให้อัปโหลดตอบสนองไวขึ้น
- เปลี่ยน query string version ใน index.html เพื่อบังคับล้าง cache ของ GitHub Pages/browser


## v2.2 Instant Cache
- หน้า Minimum Stock แสดง dashboard summary จาก localStorage ทันที แล้วค่อย sync Supabase เบื้องหลัง
- ลดอาการเปิดหน้าช้าเมื่อ Supabase/Network หน่วง
- ยังใช้ Supabase เป็นแหล่งข้อมูลหลักหลัง sync สำเร็จ


## v2.3 Reset Fresh App

เวอร์ชันนี้เพิ่มระบบล้าง cache อัตโนมัติแบบเฉพาะ Minimum Stock เมื่อเปลี่ยนเวอร์ชันแอพ

- ถ้าอัป ZIP เวอร์ชันใหม่ ระบบจะล้าง cache เก่าของ Minimum Stock ในเครื่องผู้ใช้เอง 1 ครั้ง
- asset version ถูกเปลี่ยนเป็น `20260617-resetfresh-v2-3` เพื่อบังคับให้ browser โหลด JS/CSS ใหม่
- มีปุ่ม "ล้าง Cache แอพนี้" ในหน้า Dashboard กรณีต้องการรีเซ็ตเอง
- ใช้ URL บังคับล้างได้: `?v=20260617-resetfresh-v2-3&fresh=1`

คำแนะนำหลังอัป GitHub:

```text
https://transfusionbb-cnmi.github.io/Minimum-Stock/?v=20260617-resetfresh-v2-3&fresh=1
```

เปิดครั้งแรกด้วยลิงก์นี้ 1 รอบ แล้วครั้งต่อไปใช้ลิงก์ปกติได้


## v2.4 Clear Before Upload

เวอร์ชันนี้เพิ่มระบบ "ล้างข้อมูลเดิมก่อนอัปโหลด" เพื่อให้การอัปโหลดรอบใหม่เหมือนเริ่มแอพใหม่ ไม่เก็บ snapshot เก่าทับซ้อนใน Supabase

ให้รันไฟล์นี้ใน Supabase > SQL Editor 1 ครั้งก่อนใช้งานปุ่มล้างข้อมูล:

```text
supabase-clear-before-upload.sql
```

หลังรันแล้ว เว็บจะทำงานแบบนี้:

```text
กดอัปโหลดไฟล์ใหม่ → ล้าง snapshot เดิมใน Supabase → ล้าง cache ของ Minimum Stock → อ่าน Excel → คำนวณ → บันทึก snapshot ใหม่
```

มีปุ่มใหม่ในหน้า Upload File:

```text
🧹 ล้างข้อมูลเดิมในระบบ
```

ใช้เมื่อต้องการล้าง snapshot เดิมและ cache ก่อนอัปโหลดไฟล์ใหม่เอง

ข้อควรระวัง: ตอนนี้เว็บเป็น static GitHub Pages และใช้ anon key จึงเหมาะกับการใช้งานภายในทีมที่ไว้ใจกัน หากต้องการกันคนกดล้างข้อมูล ควรเพิ่ม Login/Admin role ภายหลัง
