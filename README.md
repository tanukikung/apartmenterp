# Apartment ERP

ระบบจัดการอพาร์ตเมนต์ครบวงจร — ห้อง, ผู้เช่า, บิลรายเดือน, ใบแจ้งหนี้, รับชำระ, LINE Chat, แจ้งซ่อม, analytics

ระบบเป็น admin-only web interface ผู้เช่าสื่อสารผ่าน LINE Official Account

---

## วิธีรัน Production (Docker — แนะนำ)

> ✅ migrate + seed ทำอัตโนมัติเมื่อ start ครั้งแรก — ไม่ต้องรันคำสั่งเพิ่ม

### 1. ติดตั้ง Docker Desktop

โหลดจาก [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop) → ติดตั้ง → restart

### 2. สร้างไฟล์ `.env`

```bash
# Linux / Mac
cp .env.example .env

# Windows
copy .env.example .env
```

แก้ไขค่าในไฟล์ `.env`:

```env
APP_HOST=localhost          # VPS: ใส่ IP เช่น 103.21.45.67
DB_PASSWORD=ตั้งรหัสเอง
REDIS_PASSWORD=ตั้งรหัสเอง
NEXTAUTH_SECRET=ตั้งรหัสเอง
ONLYOFFICE_JWT_SECRET=ตั้งรหัสเอง
```

### 3. Build และรัน

```bash
docker compose up -d --build
```

รอ ~10-15 นาที (build ครั้งแรก) → ครั้งต่อไป ~1 นาที

### 4. เปิดใช้งาน

| | URL |
|---|---|
| ERP System | `http://localhost:3001` |
| OnlyOffice | `http://localhost:8080` |

**Default credentials** (เปลี่ยนทันทีหลัง login):

| Role | Username | Password |
|------|----------|----------|
| Admin | `owner` | `Owner@12345` |
| Staff | `staff` | `Staff@12345` |

---

## คำสั่งที่ใช้บ่อย

```bash
docker compose up -d          # เปิดระบบ
docker compose down           # ปิดระบบ
docker compose ps             # เช็ค status
docker compose logs -f app    # ดู log แบบ real-time
docker compose restart app    # restart เฉพาะ app
```

---

## Deploy บน VPS

### ตัวเลือก A — Coolify (แนะนำ มี UI)

```bash
# รันบน VPS ครั้งเดียว
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
```

เปิด `http://YOUR_VPS_IP:8000` → เชื่อม GitHub repo → กด Deploy → ได้ HTTPS อัตโนมัติ

### ตัวเลือก B — Manual Docker

```bash
# บน VPS
curl -fsSL https://get.docker.com | sh
git clone <your-repo-url> apartment-erp && cd apartment-erp
cp .env.example .env          # แก้ APP_HOST=YOUR_VPS_IP
docker compose up -d --build
```

---

## LINE Webhook

ต้องมี HTTPS domain ก่อน (Coolify ทำให้อัตโนมัติ) จึงจะใช้ LINE ได้

```
Webhook URL: https://yourdomain.com/api/line/webhook
```

เพิ่มค่าใน `.env`:

```env
LINE_CHANNEL_ID=
LINE_CHANNEL_SECRET=
LINE_ACCESS_TOKEN=
LINE_CHANNEL_ACCESS_TOKEN=
```

---

## วิธีรัน Development (Local)

```bash
cd apps/erp
cp .env.example .env          # แก้ DATABASE_URL ให้ตรงกับ local PostgreSQL
npm install
npx prisma migrate deploy
npx prisma db seed
npm run dev                   # http://localhost:3001
```

---

## Billing Template

ดาวน์โหลด template: `billing_template.xlsx` จากหน้า **Billing → Import**

- กรอกข้อมูลมิเตอร์น้ำ/ไฟ + ค่าเช่าในแต่ละ sheet `ชั้น_1` ถึง `ชั้น_8`
- Upload ในหน้า **Billing → Import → Monthly Data**
- ระบบ validate และ preview ก่อน commit

---

## Make Commands

```
make help          ดู commands ทั้งหมด
make dev           รัน dev server (port 3001)
make build         build production
make test          รัน tests
make typecheck     TypeScript check
make lint          ESLint
make migrate       รัน migrations
make seed          seed ข้อมูลตั้งต้น
make studio        เปิด Prisma Studio
make docker-up     docker compose up -d
make docker-down   docker compose down
make docker-logs   tail app logs
make backup        dump PostgreSQL backup
```

---

## Environment Variables

| Variable | จำเป็น | คำอธิบาย |
|---|---|---|
| `APP_HOST` | ✅ | IP หรือ domain ของ server (localhost สำหรับ laptop) |
| `DB_PASSWORD` | ✅ | รหัส PostgreSQL |
| `REDIS_PASSWORD` | ✅ | รหัส Redis |
| `NEXTAUTH_SECRET` | ✅ | Secret สำหรับ session (random string) |
| `ONLYOFFICE_JWT_SECRET` | ✅ | JWT secret สำหรับ OnlyOffice |
| `LINE_CHANNEL_ID` | optional | LINE OA integration |
| `LINE_CHANNEL_SECRET` | optional | LINE OA integration |
| `LINE_ACCESS_TOKEN` | optional | LINE OA integration |
| `CRON_SECRET` | optional | ป้องกัน cron job endpoints |

ดูตัวอย่างครบได้ที่ [.env.example](.env.example)

---

## โครงสร้างโปรเจกต์

```
apartment_erp/
├── apps/erp/
│   ├── prisma/              # Schema, migrations, seed
│   ├── src/
│   │   ├── app/             # Admin UI pages + API routes
│   │   ├── components/      # Shared React components
│   │   ├── infrastructure/  # Redis, S3, outbox adapters
│   │   ├── lib/             # Auth, config, utilities
│   │   └── modules/         # Domain services (billing, invoices, payments…)
│   ├── tests/               # Unit, API, integration, security tests
│   ├── Dockerfile           # Multi-stage production build
│   ├── entrypoint.sh        # Auto-migrate + seed on first start
│   └── public/
│       └── billing_template.xlsx  # Excel template สำหรับ import บิล
├── docs/                    # Architecture, schema, runbooks
├── docker-compose.yml       # 4 services: postgres, redis, onlyoffice, app
├── .env.example             # Template สำหรับ copy เป็น .env
├── Makefile
└── setup.mjs                # Interactive setup wizard
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14, React 18, TypeScript, Tailwind CSS |
| API | Next.js App Router API routes |
| Database | PostgreSQL 15+ with Prisma ORM |
| Messaging | LINE Official Account API |
| Document Editor | OnlyOffice Document Server |
| Infrastructure | Docker, Redis |

---

## License

MIT
