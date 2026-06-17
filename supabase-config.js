/*
  ตั้งค่า Supabase ตรงนี้ก่อนอัป GitHub Pages
  วิธีใช้:
  1) ไปที่ Supabase > Project Settings > API
  2) คัดลอก Project URL มาใส่ SUPABASE_URL
  3) คัดลอก anon public key มาใส่ SUPABASE_ANON_KEY
  4) รันไฟล์ supabase-schema.sql ใน SQL Editor ของ Supabase ก่อนใช้งานจริง
*/
window.MINIMUM_STOCK_CONFIG = {
  SUPABASE_URL: "https://jynwsdtoqjsjkkefrhyt.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp5bndzZHRvcWpzamtrZWZyaHl0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE0MTQ3NTMsImV4cCI6MjA5Njk5MDc1M30.0Wfh47c8G5yTV1q6Skrn1RlQFDljPkieuNmVF2Kj6Hk",
  SNAPSHOT_TABLE: "minimum_stock_snapshots",
  CALC_DAYS: 180,

  // เก็บไว้เป็นทางสำรอง ถ้ายังไม่ได้ตั้ง Supabase หรือ Supabase มีปัญหา ระบบจะใช้ Apps Script เดิมก่อน
  GAS_WEB_APP_URL: "https://script.google.com/macros/s/AKfycbzOcuADXBhegKJzgNODfyX2MfafMJmQ0ZP1k0Q0AxeeI5FAj1_716evZDFOCvHn9iIw/exec"
};
