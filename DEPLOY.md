# Deployment Guide

เอกสารนี้สรุป deployment path ที่รองรับทั้งหมด โดยเรียงจากง่ายที่สุดไปยืดหยุ่นที่สุด

## ทางที่แนะนำ

ถ้าจะส่งระบบให้ลูกค้าหรือทีมปลายทางใช้งานเอง ให้ใช้ [CUSTOMER_DEPLOY.md](./CUSTOMER_DEPLOY.md) และ `docker-compose.customer.yml`

จุดเด่นของ path นี้:
- มี PostgreSQL มาให้ในชุดเดียว
- start ครั้งแรกแล้ว migrate + seed อัตโนมัติ
- มีสคริปต์ `customer-stack` สำหรับ Windows และ Linux/macOS
- ไม่ต้องให้ลูกค้าจำหลายคำสั่ง

## Path 1: Customer Stack

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

ไฟล์ที่ใช้:
- `docker-compose.customer.yml`
- `.env.customer`
- `.env.customer.example`

เหมาะสำหรับ:
- ส่งให้ลูกค้าเป็น zip หรือ git checkout
- deploy บน PC, mini server, NAS, หรือ VPS ที่มี Docker อยู่แล้ว
- single-instance deployment

## Path 2: Production Compose

ใช้ `docker-compose.prod.yml` ถ้าทีม deploy ต้องการควบคุม environment เองมากขึ้น เช่น domain จริง, external secret management, หรือการแยก volume/backup ชัดเจนกว่า customer stack

```bash
cp .env.example .env.production
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

เหมาะสำหรับ:
- ทีมเทคนิคที่ดูแลระบบเอง
- production ที่ต้องการแก้ค่า env แบบละเอียด
- deployment ที่มี checklist และ sign-off ชัดเจน

## Path 3: Standalone Node

ใช้เมื่อเครื่องปลายทางมี PostgreSQL พร้อมอยู่แล้ว และไม่ต้องการ Docker

```bash
npm ci
npx prisma generate
npx prisma migrate deploy
npx next build --no-lint
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public
node .next/standalone/server.js
```

เหมาะสำหรับ:
- managed hosting ที่มี Node.js พร้อม
- ทีม ops ที่ไม่ต้องการรัน container

หมายเหตุ:
- path นี้ต้องจัดการ `DATABASE_URL`, process manager, reverse proxy, และ restart policy เอง
- ถ้าใช้ `output: standalone` ต้อง copy `.next/static` และ `public/` ทุกครั้ง

## ค่าขั้นต่ำที่ระบบต้องมี

ดูรายการเต็มที่ [ENV_REQUIRED.md](./ENV_REQUIRED.md)

ขั้นต่ำสุดสำหรับระบบจริง:
- `DATABASE_URL`
- `NEXTAUTH_SECRET`
- `APP_BASE_URL`
- `NODE_ENV=production`

เพิ่มตาม feature ที่เปิดใช้:
- `CRON_SECRET`
- `LINE_*`
- `AWS_*` และ `BACKUP_S3_BUCKET`
- `REDIS_URL` ถ้า deploy หลาย instance

## หลัง deploy ต้องเช็คอะไร

- [PRODUCTION_CHECKLIST.md](./PRODUCTION_CHECKLIST.md)
- [SMOKE_TEST_CHECKLIST.md](./SMOKE_TEST_CHECKLIST.md)

ขั้นต่ำสุดที่ต้องผ่าน:
- `/login` เข้าได้
- `/admin/dashboard` โหลดไม่มี runtime error
- `/api/health` ตอบ `status: ok`
- `/api/health/deep` ตอบได้

## Rollback

rollback reference:
- [docs/ROLLBACK_PROCEDURE.md](./docs/ROLLBACK_PROCEDURE.md)
- [docs/BACKUP_PROCEDURE.md](./docs/BACKUP_PROCEDURE.md)
