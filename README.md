# Apartment ERP

Full-featured apartment management system built for Thai property operators. Covers the complete tenant lifecycle — from room management and contracts through billing, invoicing, payment reconciliation, and LINE-based tenant communication.

---

## Features

| Domain | Capabilities |
|--------|-------------|
| **Rooms & Floors** | Multi-floor building layout, room status tracking, per-room billing rules and bank accounts |
| **Tenant Management** | Tenant profiles, LINE account linking, registration requests, document storage |
| **Contracts** | Create / renew / terminate lease contracts, overlap detection, multi-tenant support |
| **Billing** | Monthly billing cycles, metered water + electric (flat or tiered), common-area water allocation, Excel import |
| **Invoices** | Auto-generation from billing cycles, PDF export (Thai font), status lifecycle (DRAFT → SENT → PAID → CANCELLED) |
| **Payments** | Bank statement upload + fuzzy matching, manual confirmation, payment history, duplicate detection |
| **Late Fees & Overdue** | Configurable grace period, daily penalty accrual, overdue dashboard |
| **Move-outs** | Structured move-out flow with itemised deposit deductions |
| **Documents** | Template engine with field catalog, PDF generation, versioned templates, diff view |
| **LINE Messaging** | Send invoices / payment receipts / reminders via LINE, broadcast, chat inbox, message sequences |
| **Maintenance** | Ticket creation (including via LINE), assignment, status tracking, comments |
| **Analytics & Reports** | Revenue, occupancy, collection rate, profit & loss, audit trail |
| **Audit** | Append-only audit log with SHA-256 hash chain, tamper detection, chain verification API |
| **System** | Background job scheduler, transactional outbox, dead-letter queue, system health dashboard |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript 5 |
| UI | React 18, Tailwind CSS, Radix UI primitives |
| Database | PostgreSQL 15+ |
| ORM | Prisma 5 |
| Messaging | LINE Messaging API |
| Cache / Rate limit | Redis 7 (optional in dev) |
| PDF | Puppeteer (Chromium headless) |
| Auth | Custom JWT (cookie-based), bcrypt |
| Logging | Pino (structured JSON) |
| Monitoring | Prometheus + Grafana |
| Error tracking | Sentry (optional) |
| Tests | Vitest + Playwright |
| Deploy | Docker + Docker Compose |

---

## Prerequisites

- **Node.js** 20+
- **PostgreSQL** 15+
- **npm** 10+
- **Redis** 7 (optional — only required for LINE messaging state in production)
- **Chromium / Chrome** (for PDF generation — installed automatically via Puppeteer)

---

## Quick Start

### Option A — Local development (recommended for first run)

```bash
# 1. Clone and install
git clone <repo-url>
cd apartment_erp
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env — minimum required: DATABASE_URL, NEXTAUTH_SECRET, NEXTAUTH_URL

# 3. Run database migrations and seed data
npm run db:migrate
npm run db:seed

# 4. Start the dev server
npm run dev
```

App runs at **http://localhost:3001**

### Option B — Docker Compose (database + app together)

```bash
cp .env.example .env
# Edit .env with your preferred passwords

docker compose up -d
```

### Option C — Customer deployment (self-contained stack)

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

---

## Environment Variables

Copy `.env.example` to `.env` and fill in values.

### Required

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `NEXTAUTH_SECRET` | 32-byte random secret for session signing |
| `NEXTAUTH_URL` | Public URL of the app (e.g. `http://localhost:3001`) |
| `APP_BASE_URL` | Same as `NEXTAUTH_URL` |
| `AUTH_SECRET` | 32-byte random secret for auth tokens |

### Optional

| Group | Variables |
|-------|-----------|
| LINE Messaging | `LINE_CHANNEL_ID`, `LINE_CHANNEL_SECRET`, `LINE_ACCESS_TOKEN`, `LINE_USER_ID` |
| Redis | `REDIS_URL` |
| Sentry | `SENTRY_DSN` |
| S3 Backup | `BACKUP_S3_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION` |
| Monitoring | `METRICS_TOKEN`, `GRAFANA_ADMIN_USER`, `GRAFANA_ADMIN_PASSWORD` |

See [`.env.example`](.env.example) for full descriptions and all available variables.

---

## Database

### Migrations

```bash
# Apply all pending migrations (development)
npm run db:migrate

# Apply in production (no prompts, no shadow DB)
npm run db:migrate:deploy

# Open Prisma Studio GUI
npm run db:studio
```

### Seed data

The seed script creates:
- 239 rooms across 8 floors
- Default billing rules
- Default document templates (contract, invoice, payment notice, receipt)
- 2 admin users (see [Default Credentials](#default-credentials))

```bash
npm run db:seed
```

### Schema overview

`prisma/schema.prisma` — 56 models:

```
Rooms, BillingRule, BankAccount
Tenant, Contract, RoomTenant
BillingPeriod, RoomBilling, ImportBatch, ImportSession
Invoice, InvoiceDelivery, Payment, PaymentTransaction, PaymentMatch
MoveOut, MoveOutItem
DocumentTemplate, DocumentTemplateVersion, GeneratedDocument
Message, Conversation, Broadcast, MessageTemplate, MessageSequence
MaintenanceTicket, MaintenanceComment
AuditLog, BillingAuditLog, FinancialAuditLog
OutboxEvent, IdempotencyRecord, CronJobRun
AdminUser, Notification, Expense, Config
```

---

## Development

```bash
npm run dev           # Start Next.js dev server on port 3001
npm run dev:ws        # Start with WebSocket support (custom server)
npm run build         # Production build
npm run start         # Start production server
npm run start:cluster # Start with Node.js cluster (multi-core)
npm run lint          # ESLint check
npm run db:generate   # Regenerate Prisma client after schema changes
```

### Project structure

```
src/
├── app/
│   ├── admin/          # All admin UI pages (Next.js App Router)
│   └── api/            # REST API routes
├── components/         # Shared React components
├── config/             # App-level configuration
├── hooks/              # Custom React hooks
├── infrastructure/     # Cross-cutting: circuit breaker, metrics, rate limiter
├── instrumentation.ts  # Bootstraps background workers on server start
├── lib/
│   ├── auth/           # JWT, session, guards
│   ├── db/             # Prisma client singleton
│   ├── guards/         # Kill switch, mutation guards
│   └── utils/          # Errors, logger, rate limit, money
├── modules/            # Domain modules (see Module Map below)
├── queues/             # Billing job queue
├── server/             # Custom server, cron, WebSocket
└── types/              # Shared TypeScript types

prisma/
├── schema.prisma       # Database schema
├── migrations/         # Prisma migration history
└── seed.ts             # Seed script

tests/
├── unit/               # Pure logic tests (Vitest)
├── integration/        # Service layer with real database
├── e2e/                # Full browser flows (Playwright)
├── security/           # Auth boundary, RBAC, CSRF, secret leakage
├── performance/        # Benchmarks and large-dataset tests
└── stabilization/      # Production-scenario regression tests

scripts/
├── backup-db.ts                # Manual database backup
├── restore-db.ts               # Database restore
├── backup-restore/             # Backup / DR drill shell scripts
├── backup-scheduler.ts         # Automated backup scheduler
├── seed-document-templates.ts  # Re-seed default document templates
├── audit-data-integrity.ts     # Data integrity audit
├── sync-invoice-status.ts      # Fix invoice status drift
├── generate-billing-excel.ts   # Generate billing import Excel template
├── find-users.ts               # Admin utility: list users
└── customer-stack.sh / .ps1    # Customer deployment helpers

deploy/
├── docker-compose.prod.yml     # Production stack (app + postgres + redis)
├── docker-compose.dev.yml      # Dev stack (postgres + redis only)
├── Dockerfile                  # Production Docker image
├── entrypoint.sh               # Container entrypoint: migrate + seed + start
├── nginx.conf                  # Reverse proxy config
└── logrotate.conf              # Log rotation
```

---

## Module Map

Each module under `src/modules/` owns its domain logic independently:

| Module | Responsibility |
|--------|---------------|
| `rooms` | Room CRUD, status, occupancy |
| `tenants` | Tenant profiles, LINE linking |
| `contracts` | Lease lifecycle, overlap detection |
| `billing` | Billing period management, calculator, Excel import, period closing |
| `invoices` | Invoice generation, PDF rendering, status transitions, EMV QR code |
| `payments` | Statement parsing, fuzzy matching, confirmation, duplicate guard |
| `moveouts` | Move-out flow, deposit deductions |
| `documents` | Template engine, field catalog, PDF generation, versioning |
| `messaging` | LINE message dispatch, invoice notifier, payment notifier, welcome, reminders |
| `messaging-sequence` | Automated multi-step message sequences |
| `maintenance` | Ticket management, LINE-triggered tickets |
| `reminders` | Configurable reminder schedules |
| `deliveries` | Message delivery tracking and retry |
| `expenses` | Operating expense tracking |
| `reconciliation` | Invoice ↔ payment reconciliation issues |
| `audit` | Append-only audit log with SHA-256 hash chain |
| `financial-audit` | Financial ledger integrity checks |
| `analytics` | Revenue, occupancy, collection rate aggregations |
| `jobs` | Background job runner and store |
| `soft-delete` | Shared soft-delete service |

---

## Key Workflows

### Monthly billing cycle

```
1. Create billing period          POST /api/billing/periods
2. Import meter readings (Excel)  POST /api/billing/import/...
3. Preview & validate rows        GET  /api/billing/import/batches/:id
4. Execute import                 POST /api/billing/import/execute
5. Generate invoices              POST /api/billing/periods/:id/generate-invoices
6. Invoices dispatched via LINE   (outbox processor handles delivery)
7. Close period                   POST /api/billing/periods/:id/close
```

### Payment reconciliation

```
1. Upload bank statement (CSV/Excel)    POST /api/payments/upload-statement
2. Auto-match to open invoices          (fuzzy amount + date + reference)
3. Review unmatched transactions        GET  /api/payments/review
4. Confirm or manually override         POST /api/payments/match/confirm
5. Invoice → PAID, receipt sent via LINE
```

### Document generation

```
1. Edit template in rich-text editor ({{field}} placeholders)
2. Template saved with full version history
3. Generate document                    POST /api/documents/generate
   (system resolves all field values from DB automatically)
4. PDF rendered via Puppeteer, stored in .data/
5. Download                             GET  /api/documents/:id/pdf
```

---

## Testing

```bash
npm test                    # All unit + integration tests (Vitest)
npm run test:watch          # Watch mode
npm run test:coverage       # Coverage report

# E2E tests (requires running app server)
npx playwright test --config=tests/e2e/playwright.config.ts
```

---

## Deployment

### Production Docker stack

```bash
# Copy and configure environment
cp .env.example .env
# Set NODE_ENV=production, COOKIE_SECURE=true, real DATABASE_URL, strong secrets

# Start production stack
docker compose -f deploy/docker-compose.prod.yml up -d

# View logs
docker compose -f deploy/docker-compose.prod.yml logs -f app
```

The container entrypoint automatically runs `db:migrate:deploy` and `db:seed` on first boot.

### Backup & restore

```bash
# Manual backup
npx ts-node scripts/backup-db.ts

# Restore
npx ts-node scripts/restore-db.ts --file <backup-file>

# DR drill
bash scripts/backup-restore/dr-drill.sh
```

### Monitoring

- Prometheus metrics: `GET /api/metrics` (requires `METRICS_TOKEN` header)
- Grafana dashboards auto-provisioned from `grafana/provisioning/`

---

## Default Credentials

Created by `npm run db:seed`:

| Role | Username | Password |
|------|----------|----------|
| Owner (Admin) | `owner` | `Owner@12345` |
| Staff | `staff` | `Staff@12345` |

**Change these immediately in any non-development environment.**

---

## API Overview

All routes return `{ success: true, data: ... }` on success and  
`{ success: false, error: { name, message, code, statusCode } }` on error.

| Prefix | Domain |
|--------|--------|
| `/api/auth/*` | Login, logout, session, password reset |
| `/api/rooms/*` | Room CRUD and status |
| `/api/tenants/*` | Tenant management |
| `/api/contracts/*` | Lease contracts |
| `/api/billing/*` | Billing periods, import, wizard |
| `/api/billing-cycles/*` | Billing cycle queries |
| `/api/invoices/*` | Invoice lifecycle, PDF |
| `/api/payments/*` | Payment upload, matching, confirmation |
| `/api/moveouts/*` | Move-out records |
| `/api/documents/*` | Document templates and generation |
| `/api/broadcast/*` | LINE broadcast messages |
| `/api/conversations/*` | LINE chat inbox |
| `/api/maintenance/*` | Maintenance tickets |
| `/api/analytics/*` | Revenue, occupancy, summary |
| `/api/audit-logs/*` | Audit trail with chain verification |
| `/api/admin/*` | System jobs, health, users, outbox, kill switch |

---

## Architecture Notes

### Background worker

There is no separate worker process. All background work runs inside Next.js via `src/instrumentation.ts`, which bootstraps on server start:

- **Cron scheduler** — billing auto-run, audit integrity checks, late fee accrual
- **Outbox processor** — polls every 5 s with `FOR UPDATE SKIP LOCKED`, delivers LINE messages
- **Messaging runtime** — LINE event handler, message sequence executor
- **Heartbeat** — system health metrics

### Transactional outbox

All LINE messages are written to `OutboxEvent` in the same DB transaction as the triggering business operation. A background processor picks them up and delivers to LINE API. No message is lost if LINE is temporarily unavailable.

### Audit hash chain

Every write operation is logged to `AuditLog` with a SHA-256 hash chain:

- `eventHash = SHA256(sequenceNum | actorId | actorRole | action | entityType | entityId | metadata | createdAt)`
- `prevHash` = `eventHash` of the previous record (genesis = `"000...000"`)

Verify chain integrity: `GET /api/admin/audit-logs/verify-chain`

### Kill switch

`POST /api/admin/system/kill-switch` disables all write operations instantly without a deploy. Reads and health checks remain available.

---

## Document Templates

Default templates are seeded at `prisma/seed.ts` and can be re-seeded:

```bash
npx ts-node scripts/seed-document-templates.ts
```

HTML source templates live in `src/modules/invoices/`:

| File | Purpose |
|------|---------|
| `invoice-template.html` | Monthly invoice |
| `receipt-template.html` | Payment receipt |
| `contract-template.html` | Lease agreement |
| `payment-notice-template.html` | Overdue payment notice |

Field placeholders use `{{fieldName}}` syntax. All available fields are defined in `src/modules/documents/field-catalog.ts`.

---

## License

Private — all rights reserved.
