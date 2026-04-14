# Apartment ERP

ระบบจัดการอพาร์ตเมนต์และหอพักสำหรับทีมแอดมิน ครอบคลุมห้องพัก ผู้เช่า บิลรายเดือน ใบแจ้งหนี้ การรับชำระ ประกาศ แจ้งเตือนผ่าน LINE เอกสาร และรายงานหลังบ้าน

## วิธี deploy ที่แนะนำที่สุด

ถ้าต้องส่งให้ลูกค้าหรือทีมปลายทางใช้งานเอง ให้ใช้ `Docker Compose customer stack` เป็นทางหลัก เพราะง่ายที่สุดและรวมทั้ง app + PostgreSQL ไว้ในชุดเดียว

Windows:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\customer-stack.ps1 init
powershell -ExecutionPolicy Bypass -File .\scripts\customer-stack.ps1 up
```

Linux / macOS:

```bash
chmod +x scripts/customer-stack.sh
./scripts/customer-stack.sh init
./scripts/customer-stack.sh up
```

ค่าเริ่มต้นหลัง seed:
- URL: `http://localhost:3000`
- ชื่อผู้ใช้ `owner` และ `staff` จะถูกสร้างอัตโนมัติ
- รหัสผ่านแรกเข้าเป็นแบบสุ่มต่อ installation และถูกบันทึกไว้ใน `.env.customer`

เอกสารที่ควรอ่านต่อ:
- [CUSTOMER_DEPLOY.md](./CUSTOMER_DEPLOY.md) สำหรับการส่งมอบให้ลูกค้า
- [DEPLOY.md](./DEPLOY.md) สำหรับทีมเทคนิคหรือ deploy แบบปรับแต่ง
- [ENV_REQUIRED.md](./ENV_REQUIRED.md) สำหรับตัวแปรแวดล้อม
- [PRODUCTION_CHECKLIST.md](./PRODUCTION_CHECKLIST.md) สำหรับ go-live gate
- [SMOKE_TEST_CHECKLIST.md](./SMOKE_TEST_CHECKLIST.md) สำหรับตรวจหลัง deploy

## แนวทาง local development

```bash
npm install
npx prisma migrate deploy
npx prisma db seed
npm run dev
```

เปิดใช้งานที่ `http://localhost:3001`

## Deployment paths ที่รองรับ

- `docker-compose.customer.yml`
  ใช้เมื่อส่งให้ลูกค้าหรือทีมที่ต้องการวิธีติดตั้งสั้นที่สุด
- `docker-compose.prod.yml`
  ใช้เมื่อทีม infra ต้องการ compose แบบ production ปรับค่าเอง
- `node .next/standalone/server.js`
  ใช้เมื่อ deploy เองบนเครื่องที่มี Node.js และ PostgreSQL อยู่แล้ว

## หมายเหตุสำคัญ

- Redis เป็น optional สำหรับ single-instance deployment
- ถ้าใช้ HTTPS ให้ตั้ง `APP_BASE_URL` เป็น domain จริง แล้ว script จะสร้าง `COOKIE_SECURE=true` ให้อัตโนมัติเมื่อรัน `init`
- ถ้าจะใช้ LINE, S3 backup, หรือ storage ภายนอก ให้แก้เพิ่มใน `.env.customer` หรือ `.env.production`
