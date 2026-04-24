# Deploy บน Vercel

ตอนนี้ Vercel เชื่อม Git Repository แล้ว ขั้นต่อไปคือให้มีไฟล์เว็บใน GitHub repo

## วิธีทำ
1. เปิดไฟล์ `src/App.jsx`
2. Copy โค้ดทั้งหมดจาก Canvas: `Health Assessment Hn Web Prototype`
3. วางทับไฟล์ `src/App.jsx`
4. อัปโหลดไฟล์ทั้งหมดในโฟลเดอร์นี้เข้า GitHub repo `hpc9-lm-health`
5. ไป Vercel > Environment Variables แล้วใส่:
   - `VITE_SUPABASE_URL` = `https://ddyfnrsdypnegmkctglg.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = `sb_publishable_Oc0SbX4_1OGHngBYmAsmOA_etGM303Z`
6. ไป Deployments > Redeploy

หมายเหตุ: โค้ด Canvas ตอนนี้ยังเป็น localStorage prototype ถ้าต้องการเชื่อม Supabase จริง ให้ใช้ Production Kit ต่อกับ `healthRepository.ts`
