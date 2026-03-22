# Apartment ERP

ระบบบริหารจัดการคอนโดและอพาร์ตเมนต์ (Apartment Management System)

## Tech Stack

- **Frontend**: Next.js 14, React 18, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes, Prisma ORM
- **Database**: PostgreSQL 15+
- **Messaging**: LINE Messaging API
- **Document**: OnlyOffice Document Server (optional)

## Quick Start

### 1. Setup Environment

```bash
cd apps/erp
cp .env.example .env
# Edit .env with your database credentials
```

### 2. Install & Database

```bash
npm install
npm run db:generate
npm run db:migrate
npm run db:seed
```

### 3. Run Development Server

```bash
npm run dev
# Open http://localhost:3001
```

### 4. Login

- **Admin**: username=`owner`, password=`Owner@12345`
- **Staff**: username=`staff`, password=`Staff@12345`

## Features

### Billing Management
- Import billing data from Excel files (เดือน1.xlsx - เดือน12.xlsx)
- Support for two import modes:
  - **Standard Template**: FLOOR_*, ACCOUNTS, RULES, ROOM_MASTER sheets
  - **Monthly Data**: ชั้น_x sheets with Thai column headers
- Automatic water/electricity charge calculation
- Meter reset detection (when current < previous reading)

### Invoice Generation
- Auto-generate invoices from locked billing records
- Send invoices via LINE Messaging
- Track invoice delivery status

### Payment Management
- Payment matching with bank statements
- Manual payment review and approval
- Overdue tracking

### Room & Tenant Management
- Room status tracking (ACTIVE/INACTIVE)
- Tenant registration with LINE integration
- Maintenance request tracking

## Project Structure

```
apps/erp/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── admin/             # Admin UI pages
│   │   └── api/               # API routes
│   ├── components/            # React components
│   ├── hooks/                 # Custom React hooks
│   ├── lib/                   # Core libraries
│   │   ├── auth/              # Authentication
│   │   ├── billing/           # Billing calculations
│   │   └── utils/             # Utilities
│   ├── modules/               # Business logic
│   │   ├── billing/           # Billing service
│   │   ├── invoices/          # Invoice service
│   │   ├── payments/          # Payment service
│   │   ├── rooms/             # Room service
│   │   └── tenants/           # Tenant service
│   └── types/                 # TypeScript types
├── prisma/
│   └── schema.prisma          # Database schema
└── tests/                     # Test files
```

## API Reference

### Billing

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/billing` | List billing records |
| POST | `/api/billing` | Create billing record |
| GET | `/api/billing/:id` | Get billing record |
| POST | `/api/billing/:id/lock` | Lock billing and generate invoice |
| POST | `/api/billing/import/preview` | Preview Excel import |
| POST | `/api/billing/import/execute` | Execute Excel import |
| POST | `/api/billing/monthly-data/import` | Upload monthly data file |
| POST | `/api/billing/monthly-data/import/execute` | Execute monthly data import |

### Invoices

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/invoices` | List invoices |
| GET | `/api/invoices/:id` | Get invoice |
| POST | `/api/invoices/:id/send` | Send invoice via LINE |
| POST | `/api/invoices/:id/pay` | Mark invoice as paid |

### Rooms

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/rooms` | List rooms |
| GET | `/api/rooms/:id` | Get room |
| POST | `/api/rooms` | Create room |
| PATCH | `/api/rooms/:id` | Update room |
| PATCH | `/api/rooms/:id/status` | Update room status |

### Tenants

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/tenants` | List tenants |
| GET | `/api/tenants/:id` | Get tenant |
| POST | `/api/tenants` | Create tenant |
| PATCH | `/api/tenants/:id` | Update tenant |
| POST | `/api/tenants/:id/line` | Send LINE message |

## Billing Rules

The system supports multiple billing rule modes:

### Water/Electricity Modes
- `NORMAL`: Calculate units as `current - previous`
- `MANUAL`: Use manually entered units
- `DISABLED`: No charge

### Service Fee Modes
- `NONE`: No service fee
- `FLAT_ROOM`: Fixed fee per room
- `PER_UNIT`: Fee per unit used
- `MANUAL_FEE`: Use manually entered fee

### Minimum Charges
- Water: minimum charge when usage is below threshold
- Electricity: minimum charge when usage is below threshold

## Testing

```bash
# Run all tests
npm test

# Run specific test file
npx vitest run tests/billing.test.ts

# Run with coverage
npm run test:coverage
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `NEXTAUTH_SECRET` | Secret for session encryption | Yes |
| `NEXTAUTH_URL` | Application URL | Yes |
| `APP_BASE_URL` | Base URL for the app | Yes |
| `LINE_CHANNEL_ID` | LINE Messaging API Channel ID | No |
| `LINE_CHANNEL_SECRET` | LINE Messaging API Channel Secret | No |
| `LINE_ACCESS_TOKEN` | LINE Access Token | No |
| `ONLYOFFICE_URL` | OnlyOffice Document Server URL | No |
| `ONLYOFFICE_JWT_SECRET` | OnlyOffice JWT Secret | No |
| `REDIS_URL` | Redis connection string | No |

## Database Schema

The system uses PostgreSQL with Prisma ORM. Key tables:

- `AdminUser` - Admin/staff accounts
- `Room` - Room information
- `Tenant` - Tenant information
- `RoomTenant` - Room-Tenant relationships
- `BillingPeriod` - Billing periods (year/month)
- `BillingRule` - Billing rule configurations
- `BankAccount` - Bank accounts for receiving payments
- `RoomBilling` - Individual room billing records
- `Invoice` - Generated invoices
- `Payment` - Payment records
- `InvoiceDelivery` - Invoice delivery tracking
- `ImportBatch` - Import batch tracking
- `AuditLog` - Audit logging
- `OutboxEvent` - Event outbox for reliable messaging

## Known Limitations & Architecture Notes

### Background Jobs / Scheduler
- The job scheduler runs via Next.js `instrumentation.ts` using `setInterval` (every 60 s).
- **Single-instance safe**: the scheduler is designed for a single server process. If you run
  multiple instances (e.g., PM2 cluster mode, Docker replicas), each instance will independently
  execute scheduled jobs. For multi-instance production deployments, use a dedicated job queue
  (BullMQ + Redis, pg-boss, etc.) or a separate worker process.
- Job run/status history is stored **in-memory** (resets on server restart). This is intentional
  for development / single-node deployments. Status is visible in the System → งานเบื้องหลัง page.
  For durable job history, set `REDIS_URL` — the store falls back to in-memory when Redis is absent.

### Redis
- Redis is **optional**. When `REDIS_URL` is not set:
  - Job status store falls back to in-memory (resets on restart).
  - Outbox event processing still works via DB polling.
- When `REDIS_URL` is set: job statuses persist across restarts and outbox throughput improves.

### LINE Integration
- Chat, tenant registration, and invoice delivery via LINE require valid LINE API credentials.
- Without them the UI pages are available but data will be empty. Set `LINE_CHANNEL_*` env vars.

### OnlyOffice Template Editor
- Template visual editing requires the OnlyOffice Document Server container to be running.
- Start it with: `docker compose up -d onlyoffice`
- Without it, template HTML can still be uploaded as a file. The editor UI shows an honest
  "unavailable" state when the service is not running.

### Security (Production Checklist)
- **NEXTAUTH_SECRET**: generate a cryptographically random value for production:
  `openssl rand -base64 32`
- **CRON_SECRET** and **ONLYOFFICE_JWT_SECRET**: also generate random values for production.
- The `.env` file is in `.gitignore` and must never be committed to version control.
- Change default admin passwords (`Owner@12345` / `Staff@12345`) immediately after first login.

### Port
- Development runs on **port 3001** (`npm run dev`). The Docker Compose production setup uses
  port 3000 internally (mapped to host as configured in `.env`).

## License

Private - All rights reserved
