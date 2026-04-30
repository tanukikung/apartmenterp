# Apartment ERP

ระบบจัดการอพาร์ตเมนต์อัตโนมัติ — ครอบคลุมการจัดการห้องเช่า ผู้เช่า สัญญาเช่า บิล การชำระเงิน การซ่อมบำรุง และการสื่อสารกับผู้เช่าผ่าน LINE

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Clients                                │
│   Admin Panel (Next.js)  │  Tenant App  │  LINE Messaging    │
└──────────────────────────┴──────────────┴────────────────────┘
                              │
                    Next.js API Routes
                              │
         ┌────────────────────┼────────────────────┐
         │                    │                    │
   Domain Services      Infrastructure       Worker Runtime
   (modules/)           (DB/Redis/S3)        (Cron/Outbox)
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 14 + React 18 + TypeScript + Tailwind CSS |
| Backend | Next.js API Routes + Node.js |
| Database | PostgreSQL 15+ + Prisma ORM |
| Messaging | LINE Messaging API |
| Error Tracking | Sentry |
| Monitoring | Prometheus + Grafana |
| Container | Docker + Docker Compose |

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Then edit .env with your values
```

### 3. Start database

```bash
docker compose up -d postgres redis
```

### 4. Run database migrations + seed

```bash
npx prisma migrate dev
npx prisma db seed
```

### 5. Start development server

```bash
npm run dev
```

Server starts at **http://localhost:3001**

### Default credentials

| Role | Username | Password |
|------|----------|----------|
| Owner | `owner` | `Owner@12345` |
| Admin | `admin` | `Admin@12345` |
| Staff | `staff` | `Staff@12345` |

## Environment Variables

See `.env.example` for all available variables. Key ones:

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | required |
| `NEXTAUTH_SECRET` | Session token secret | required |
| `NEXTAUTH_URL` | App base URL | `http://localhost:3001` |
| `REDIS_URL` | Redis URL (optional) | in-memory fallback |
| `LINE_CHANNEL_SECRET` | LINE Messaging API secret | optional |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE access token | optional |
| `SENTRY_DSN` | Sentry error tracking | optional |

## Docker

### Development stack (all-in-one)

```bash
docker compose up -d
```

Includes: PostgreSQL, Redis, Prometheus, Grafana, pgAdmin, app

### Modular production deployment

```bash
# Start infrastructure only (DB + Redis)
docker network create apartment_net
docker compose -f docker-compose.db.yml up -d

# Start app
docker compose -f docker-compose.app.yml up -d
```

Or use the self-contained production stack:

```bash
docker compose -f deploy/docker-compose.prod.yml up -d
```

Uses `deploy/Dockerfile` (multi-stage, non-root Alpine)

## Health Check Endpoints

| Endpoint | Access | Description |
|----------|--------|-------------|
| `GET /api/health` | Public | Basic health (DB + env) |
| `GET /api/health/deep` | Admin only | Full health (DB, Redis, outbox, worker, disk space) |
| `GET /api/metrics` | Token | Prometheus-compatible metrics |

## Key Modules

- **Billing**: Invoice generation, payment tracking, late fee calculation
- **Contracts**: Tenant contract lifecycle management
- **Maintenance**: Issue tracking and repair workflow
- **Messaging**: LINE bot integration for tenant communication
- **Outbox**: Reliable async message delivery pattern

## API Conventions

All API responses use the `ApiResp<T>` wrapper:

```json
{
  "success": true,
  "data": { ... },
  "message": "Operation completed"
}
```

Error responses:

```json
{
  "success": false,
  "error": {
    "message": "Error description",
    "code": "ERROR_CODE",
    "name": "ErrorType",
    "statusCode": 400
  }
}
```

## Testing

```bash
# Unit + integration tests
npx vitest run

# E2E smoke tests (requires running server on port 3001)
npx tsx tests/smoke-test.ts
```

## CI/CD

GitHub Actions pipeline runs on every push/PR to `master`/`develop`:

```
lint → test → smoke-test → build
```

View workflow at `.github/workflows/ci.yml`.

## Project Structure

```
src/
├── app/
│   ├── admin/          # Admin panel pages
│   ├── api/            # API routes
│   └── login/          # Login page
├── components/
│   └── ui/             # Shared UI components
├── hooks/              # Custom React hooks
├── lib/
│   ├── auth/           # Authentication & authorization
│   └── utils/          # Utilities (logger, errors, rate-limit)
├── modules/            # Domain business logic
│   ├── billing/
│   ├── contracts/
│   ├── invoices/
│   ├── messaging/
│   ├── payments/
│   └── ...
└── server/
    └── cron.ts         # Background job scheduler
```
