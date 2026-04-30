# Apartment ERP

ระบบจัดการอพาร์ตเมนต์อัตโนมัติ — จัดการห้องเช่า ผู้เช่า สัญญาเช่า บิล การชำระเงิน ซ่อมบำรุง และสื่อสารกับผู้เช่าผ่าน LINE

## Quick Start

```bash
npm install
cp .env.example .env    # fill in DATABASE_URL + NEXTAUTH_SECRET
docker compose up -d    # PostgreSQL + Redis
npx prisma migrate dev
npx prisma db seed       # first run only
npm run dev
```

เปิด http://localhost:3001 · ล็อกอิน: `owner / Owner@12345`

## Tech Stack

| ส่วน | เทคโนโลยี |
|------|---------|
| Frontend | Next.js 14 · React 18 · TypeScript · Tailwind CSS |
| Backend | Next.js API Routes · Node.js |
| Database | PostgreSQL 15+ · Prisma ORM |
| Messaging | LINE Messaging API |
| Error tracking | Sentry |
| Container | Docker · Docker Compose |

## Docker Deployment

```bash
# Development (all-in-one)
docker compose up -d

# Production (self-contained)
docker compose -f deploy/docker-compose.prod.yml up -d
```

Deploy อ่านเพิ่มได้ที่ `docs/DEPLOY.md`

## Key Features

- **บิลอัตโนมัติ** — คำนวณค่าเช่า น้ำ ไฟ ค่าปรับล่าช้า
- **จับคู่ชำระเงิน** — อัปโหลดสถานะบัญชี จับคู่อัตโนมัติ
- **จัดการสัญญา** — ต่อสัญญา ยกเลิก คำนวณค่ามัดจำ
- **แจ้งเตือน LINE** — ส่งใบแจ้งหนี้ ยืนยันชำระ งานซ่อม
- **LINE Webhook** — รับข้อความจากผู้เช่า ตอบอัตโนมัติ

## Health Checks

| Endpoint | การเข้าถึง | รายละเอียด |
|----------|-----------|------------|
| `GET /api/health` | public | health เบสิก |
| `GET /api/health/deep` | admin | DB + Redis + outbox + disk |
| `GET /api/metrics` | token | Prometheus metrics |

## Documentation

| ไฟล์ | เนื้อหา |
|------|---------|
| `docs/ARCHITECTURE.md` | โครงสร้างระบบ การไหลของข้อมูล |
| `docs/DEPLOY.md` | วิธีติดตั้ง Docker + production |
| `CONTRIBUTING.md` | มารยาทในการพัฒนา |

## API Response Format

```json
{ "success": true, "data": { ... } }
```

Errors:

```json
{ "success": false, "error": { "message": "...", "code": "...", "statusCode": 400 } }
```

## Project Structure

```
src/
├── app/
│   ├── admin/          # Admin panel pages
│   ├── api/            # API routes
│   └── login/          # Login
├── components/ui/      # Shared UI components
├── lib/
│   ├── auth/           # Auth + role guards
│   ├── db/             # Prisma client
│   └── utils/          # Logger, errors, rate-limit
├── modules/            # Business logic (billing, invoices, payments, ...)
└── server/             # Cron scheduler
```
