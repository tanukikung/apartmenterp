# Customer Deploy Guide

เอกสารนี้คือวิธีที่ง่ายที่สุดเวลาจะส่ง Apartment ERP ให้ลูกค้าติดตั้งเอง

## แนวคิด

ลูกค้าไม่ต้องติดตั้ง Node.js, PostgreSQL, Prisma, หรือรัน migration เอง

สิ่งที่ต้องมีมีแค่:
- Docker Desktop บน Windows หรือ Docker Engine บน Linux/macOS
- โฟลเดอร์โปรเจกต์นี้

ระบบจะทำสิ่งต่อไปนี้ให้อัตโนมัติเมื่อ start ครั้งแรก:
- สร้าง container ของ app และ PostgreSQL
- รัน `prisma migrate deploy`
- seed ข้อมูลตั้งต้น
- สร้างผู้ใช้ `owner` และ `staff`
- สุ่มรหัสผ่านแรกเข้าให้แต่ละ installation

## สำหรับ Windows

### 1. ติดตั้ง Docker Desktop

ดาวน์โหลดจาก [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop) แล้วเปิดให้ Docker ทำงานก่อน

### 2. เปิด PowerShell ในโฟลเดอร์โปรเจกต์

### 3. สร้างไฟล์ config สำหรับลูกค้า

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\customer-stack.ps1 init
```

คำสั่งนี้จะสร้าง `.env.customer` พร้อม:
- รหัสผ่าน PostgreSQL แบบสุ่ม
- `NEXTAUTH_SECRET`
- `CRON_SECRET`
- `SEED_OWNER_PASSWORD`
- `SEED_STAFF_PASSWORD`
- ค่าเริ่มต้น `APP_BASE_URL=http://localhost:3000`

ถ้าลูกค้าจะเปิดจาก domain จริง:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\customer-stack.ps1 init -BaseUrl https://erp.customer.com -AppPort 3000
```

### 4. เปิดระบบ

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\customer-stack.ps1 up
```

### 5. เข้าใช้งาน

- URL: `http://localhost:3000`
- Admin: `owner / <ดูค่า SEED_OWNER_PASSWORD ใน .env.customer>`
- Staff: `staff / <ดูค่า SEED_STAFF_PASSWORD ใน .env.customer>`

ควรเปลี่ยนรหัสผ่านทันทีหลัง login ครั้งแรก

## สำหรับ Linux หรือ macOS

```bash
chmod +x scripts/customer-stack.sh
./scripts/customer-stack.sh init
./scripts/customer-stack.sh up
```

ถ้าจะใช้ domain จริง:

```bash
./scripts/customer-stack.sh init https://erp.customer.com 3000
./scripts/customer-stack.sh up
```

## คำสั่งที่ลูกค้าใช้บ่อย

Windows:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\customer-stack.ps1 status
powershell -ExecutionPolicy Bypass -File .\scripts\customer-stack.ps1 logs
powershell -ExecutionPolicy Bypass -File .\scripts\customer-stack.ps1 restart
powershell -ExecutionPolicy Bypass -File .\scripts\customer-stack.ps1 down
```

Linux / macOS:

```bash
./scripts/customer-stack.sh status
./scripts/customer-stack.sh logs
./scripts/customer-stack.sh restart
./scripts/customer-stack.sh down
```

## ลูกค้าต้องแก้อะไรบ้างใน `.env.customer`

ขั้นต่ำ:
- ไม่ต้องแก้อะไร ถ้าใช้งานบนเครื่องเดียวผ่าน `http://localhost:3000`

ถ้าใช้งานจริงผ่าน domain:
- เปลี่ยน `APP_BASE_URL`

ถ้าจะใช้ LINE:
- `LINE_CHANNEL_ID`
- `LINE_CHANNEL_SECRET`
- `LINE_ACCESS_TOKEN` หรือ `LINE_CHANNEL_ACCESS_TOKEN`

ถ้าจะใช้ backup ไป S3:
- `BACKUP_S3_BUCKET`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION`

## สิ่งที่ path นี้เหมาะที่สุด

- ส่งมอบให้ลูกค้าในรูป zip หรือ git checkout
- เครื่องเดียวจบทั้ง app + database
- ไม่มีทีม infra ประจำ
- ต้องการวิธี install ที่สั้นและทำตามได้ง่าย

## สิ่งที่ควรทำหลังติดตั้ง

- เปลี่ยนรหัสผ่าน `owner` และ `staff`
- รันตาม [SMOKE_TEST_CHECKLIST.md](./SMOKE_TEST_CHECKLIST.md) อย่างน้อยใน flow หลัก
- ถ้าใช้ HTTPS จริง ให้ตรวจว่า `APP_BASE_URL` เป็น domain จริงและเข้า `/api/health` ได้
