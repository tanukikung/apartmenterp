# Architecture

## System Overview

Apartment ERP is a full-stack web application for managing apartment buildings — room assignments, tenant contracts, billing, payments, maintenance requests, and LINE messaging.

```
┌─────────────────────────────────────────────────────────────────┐
│                          Clients                                 │
│  Admin Panel (Next.js)  │  Tenant Portal  │  LINE Messaging Bot  │
└─────────────────────────┴─────────────────┴─────────────────────┘
                               │
                     Next.js API Routes
                               │
          ┌────────────────────┼────────────────────┐
          │                    │                    │
    Domain Services     Infrastructure       Worker Runtime
      (modules/)         (DB/Redis/S3)       (Cron/Outbox)
```

## Tech Stack

| Layer           | Technology                                  |
|-----------------|---------------------------------------------|
| Frontend        | Next.js 14 + React 18 + TypeScript + Tailwind |
| Backend         | Next.js API Routes + Node.js                |
| Database        | PostgreSQL 15+ + Prisma ORM                 |
| Messaging       | LINE Messaging API                          |
| Error Tracking  | Sentry                                      |
| Monitoring      | Prometheus + Grafana                        |
| Container       | Docker + Docker Compose                     |

## Project Structure

```
src/
├── app/                      # Next.js App Router pages
│   ├── admin/                # Admin panel (protected)
│   │   ├── settings/         # Settings pages (automation, billing-policy, building, ...)
│   │   ├── invoices/         # Invoice management
│   │   ├── payments/         # Payment management
│   │   ├── tenants/         # Tenant management
│   │   ├── rooms/           # Room management
│   │   ├── contracts/       # Contract management
│   │   ├── maintenance/    # Maintenance requests
│   │   ├── reports/        # Reports & analytics
│   │   └── *.tsx           # Other admin pages
│   ├── api/                  # API routes
│   │   ├── admin/          # Admin-only endpoints
│   │   ├── billing/        # Billing endpoints
│   │   ├── payments/       # Payment endpoints
│   │   ├── line/           # LINE webhook
│   │   └── health/         # Health checks
│   └── login/               # Login page
├── components/               # Shared React components
│   ├── admin/              # Admin-specific components
│   ├── chat/               # LINE chat components
│   ├── moveouts/           # Move-out components
│   ├── document-editor/   # Document editor (TipTap)
│   ├── providers/         # Context providers
│   └── ui/                 # Base UI components (shadcn/ui)
├── hooks/                    # Custom React hooks
├── lib/                      # Library code
│   ├── auth/               # NextAuth + role guards
│   ├── db/                 # Prisma client
│   ├── line/               # LINE SDK client
│   ├── outbox/             # Outbox pattern (reliable async)
│   └── utils/              # Utilities (rate-limit, logger, errors)
├── modules/                 # Domain business logic
│   ├── billing/           # Invoice generation, late fees
│   ├── contracts/         # Contract lifecycle
│   ├── documents/         # Document template + PDF generation
│   ├── invoices/          # Invoice service
│   ├── jobs/              # Background job runner
│   ├── line-maintenance/ # LINE message handling
│   ├── messaging/         # LINE notifications
│   ├── moveouts/          # Move-out workflow
│   ├── payments/          # Payment matching & processing
│   └── rooms/             # Room service
├── server/                   # Server-only code
│   └── cron.ts             # Cron job definitions
└── instrumentation.ts       # Next.js instrumentation (worker bootstrap)
```

## Authentication & Authorization

### NextAuth Session

Sessions are managed via NextAuth with credentials provider. The session contains:

```typescript
interface Session {
  sub: string;       // user ID
  role: Role;        // 'ADMIN' | 'STAFF'
  username: string;
}
```

### Role Guards

Three roles exist: `ADMIN`, `STAFF`, and implicit `PUBLIC` (unauthenticated).

| Role    | Access                                    |
|---------|------------------------------------------|
| ADMIN   | All admin pages + all API routes         |
| STAFF   | Most admin pages; excluded settings/users, system |
| PUBLIC  | Login page, health endpoints              |

Guards are applied per-route via `requireRole(req, ['ADMIN', 'STAFF'])`.

## Data Flow

### Billing Cycle

```
1. Cron (billing-generate) fires at configured schedule
2. JobRunner picks up job → calls billingService.generateBillingForPeriod()
3. billingService.findEligibleRooms() → rooms with active contracts
4. For each room:
   a. billingCalculator.computeBilling(room, period) → line items
   b. invoiceService.createInvoice() → persisted Invoice + InvoiceLineItems
5. System creates outbox entries for each LINE notification
6. Outbox worker delivers messages (async, with retry)
```

### Payment Flow

```
1. Admin uploads bank statement (CSV) → /api/payments/upload-statement
2. bankStatementParser.parse() → PaymentRecord[]
3. paymentMatchingService.matchPayments(records)
   a. Fuzzy match by amount + date range + room
   b. Unmatched → Manual review panel
4. Admin confirms matches → invoicePaymentState.applyPayment()
5. Invoice balance updated → notifications sent via LINE
```

### LINE Messaging

```
Incoming message → /api/line/webhook
  → signature verification (HMAC-SHA256)
  → deduplication (check lineMessageId)
  → route by content type:
      - Text → conversationService.handleText()
      - Postback → conversationService.handlePostback()
  → store Message in DB
  → create Outbox entry for reply
Outbox worker → LINE Messaging API → delivery confirmation
```

### Outbox Pattern

Reliable async messaging using the Transactional Outbox pattern:

```
API handler → BEGIN transaction
  → persist domain data (Invoice, Payment, etc.)
  → create Outbox entry (message payload)
COMMIT
                    ↓ (async, separate process)
Outbox worker reads pending entries
  → calls external service (LINE API, email, etc.)
  → on success: delete Outbox entry
  → on failure: increment retry count, schedule retry
```

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

## Key Database Patterns

### Prisma Include Pattern

Always use explicit `include` for related data to avoid N+1 queries:

```typescript
// Bad: N+1
const invoice = await prisma.invoice.findUnique({ where: { id } });
const lines = await prisma.invoiceLineItem.findMany({ where: { invoiceId: id } });

// Good: single query
const invoice = await prisma.invoice.findUnique({
  where: { id },
  include: { lineItems: true, room: true, contract: true },
});
```

### Batch Operations

Prefer `updateMany` / `deleteMany` over loops:

```typescript
// Bad
for (const id of overdueIds) {
  await prisma.invoice.update({ where: { id }, data: { status: 'OVERDUE' } });
}

// Good
await prisma.invoice.updateMany({
  where: { id: { in: overdueIds } },
  data: { status: 'OVERDUE' },
});
```

### Distributed Locks (Cron)

Cron jobs use the `Config` table for DB-based distributed locking:

```typescript
const lockKey = `cron.lock.${jobName}`;
const existing = await prisma.config.findUnique({ where: { key: lockKey } });
if (existing && Date.now() - parseInt(existing.value) < ttlMs) {
  return; // Another instance is running
}
await prisma.config.upsert({ where: { key: lockKey }, update: { value: String(Date.now()) }, create: { ... } });
// do work
await prisma.config.delete({ where: { key: lockKey } });
```

## Health Checks

| Endpoint             | Access   | Checks                                          |
|----------------------|----------|-------------------------------------------------|
| `GET /api/health`    | Public   | DB connectivity, env variables                  |
| `GET /api/health/deep`| Admin   | Above + Redis, outbox pending, worker running, disk space |

## Environment Variables

See [`.env.example`](../.env.example) for full reference. Key variables:

| Variable             | Purpose                              | Required |
|---------------------|--------------------------------------|----------|
| `DATABASE_URL`       | PostgreSQL connection string          | Yes      |
| `NEXTAUTH_SECRET`    | Session token signing secret         | Yes      |
| `REDIS_URL`          | Redis URL (optional, in-memory fallback) | No   |
| `LINE_CHANNEL_SECRET`| LINE Messaging API secret            | No       |
| `SENTRY_DSN`         | Sentry error tracking                | No       |
| `ALLOWED_ORIGINS`    | Production CORS origins             | No       |
