# Apartment ERP - System Architecture

## 1. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              APARTMENT ERP                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐ │
│  │   LINE      │    │   Admin     │    │  Analytics  │    │   Setup     │ │
│  │   Platform  │    │   Web UI    │    │   Dashboard │    │   Wizard    │ │
│  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘    └──────┬──────┘ │
│         │                  │                  │                  │        │
│         └──────────────────┼──────────────────┼──────────────────┘        │
│                            │                    │                            │
│                    ┌───────┴────────────────────┴───────┐                    │
│                    │         API Gateway (Next.js)       │                    │
│                    │    (Authentication, Rate Limit)    │                    │
│                    └───────────────────┬────────────────┘                    │
│                                        │                                     │
│         ┌──────────────────────────────┼──────────────────────────────┐     │
│         │                              │                              │     │
│  ┌──────┴──────┐              ┌────────┴────────┐            ┌────────┴────────┐
│  │   Core      │              │    Messaging    │            │    Billing      │
│  │   Domain    │              │    Service      │            │    Service      │
│  └──────┬──────┘              └────────┬────────┘            └────────┬────────┘
│         │                               │                               │
│  ┌──────┴──────┐              ┌────────┴────────┐            ┌────────┴────────┐
│  │  PostgreSQL │              │  LINE API       │            │  Document       │
│  │  + Prisma   │              │  Integration    │            │  Storage        │
│  └─────────────┘              └─────────────────┘            └─────────────────┘
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Module Boundaries & Responsibilities

### 2.1 Core Domain Modules

| Module | Responsibility | Public API |
|--------|----------------|------------|
| **Room Management** | Track rooms, floors, occupancy status | `rooms.list()`, `rooms.updateStatus()`, `rooms.assignTenant()` |
| **Tenant Management** | Tenant profiles, primary/secondary residents | `tenants.create()`, `tenants.update()`, `tenants.getHistory()` |
| **Contract Management** | Lease terms, dates, contract holder | `contracts.create()`, `contracts.renew()`, `contracts.terminate()` |
| **Payment Matching** | Bank statement import, auto-matching | `payments.import()`, `payments.match()`, `payments.confirm()` |
| **Audit Logging** | Immutable action log | `audit.log()`, `audit.query()` |

### 2.2 Billing Module

| Sub-Module | Responsibility | Public API |
|------------|----------------|------------|
| **Billing Grid** | Editable grid (Excel-like), pre-invoice | `billing.getGrid()`, `billing.updateRow()`, `billing.lock()` |
| **Invoice Engine** | Generate, version, track invoices | `invoices.generate()`, `invoices.getVersions()`, `invoices.detectChanges()` |
| **Billing Rules** | Rent calculation, utility rates | `billing.calculate()`, `billing.applyFees()` |

### 2.3 Messaging Module

| Sub-Module | Responsibility | Public API |
|------------|----------------|------------|
| **LINE Integration** | Send/receive messages via LINE API | `line.sendMessage()`, `line.receiveWebhook()`, `line.getProfile()` |
| **Chat Inbox** | Admin view of tenant conversations | `inbox.list()`, `inbox.markRead()`, `inbox.reply()` |
| **Message Logger** | All messages stored for history | `messages.log()`, `messages.query()` |
| **Notification Queue** | Scheduled: reminders, notices | `notifications.schedule()`, `notifications.sendReminders()` |

### 2.4 Analytics Module

| Sub-Module | Responsibility | Public API |
|------------|----------------|------------|
| **Revenue Analytics** | Monthly revenue, trends | `analytics.getRevenue()`, `analytics.getTrends()` |
| **Occupancy Analytics** | Occupancy rates, vacancy | `analytics.getOccupancy()` |
| **Payment Analytics** | Overdue rates, collection | `analytics.getOverdue()`, `analytics.getCollectionRate()` |

### 2.5 Setup Module

| Sub-Module | Responsibility | Public API |
|------------|----------------|------------|
| **Configuration** | Building, floors, rooms, billing settings | `setup.configure()`, `setup.validate()` |
| **Initialization** | First-run wizard state | `setup.isComplete()`, `setup.complete()` |

---

## 3. Data Model Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              ENTITY RELATIONSHIPS                            │
└─────────────────────────────────────────────────────────────────────────────┘

Building (1) ──────< Floor (8)
                         │
                         └────< Room (239)
                                   │
                                   ├────< Tenant (1-2 per room)
                                   │        │
                                   │        └────< Contract (1 per primary)
                                   │
                                   ├────< BillingRecord (monthly)
                                   │        │
                                   │        └────< Invoice (versioned)
                                   │
                                   └────< Payment (linked to Invoice)

RoomStatus: VACANT | OCCUPIED | MAINTENANCE

TenantRole: PRIMARY | SECONDARY

InvoiceStatus: DRAFT | GENERATED | SENT | PAID | OVERDUE

PaymentStatus: PENDING | MATCHED | CONFIRMED | REJECTED
```

### Key Tables

| Table | Description |
|-------|-------------|
| `Building` | Single building configuration |
| `Floor` | Floor number, building reference |
| `Room` | Room number, floor, status, max 2 tenants |
| `Tenant` | Profile: name, phone (LINE userId), email |
| `Contract` | Lease: startDate, endDate, rent, primaryTenantId |
| `BillingRecord` | Editable grid row: rent, electric, water, fees |
| `Invoice` | Generated document: roomId, month, version, status |
| `InvoiceVersion` | Each version of an invoice |
| `Payment` | Bank payment record, matched to invoice |
| `Conversation` | LINE chat thread per tenant |
| `Message` | Individual message (sent/received) |
| `AuditLog` | Immutable action log |
| `Config` | System configuration (billingDay, dueDay, etc.) |

---

## 4. API Structure

```
/api
├── /auth
│   ├── POST /login
│   └── POST /logout
│
├── /rooms
│   ├── GET / (list all)
│   ├── GET /:id
│   ├── POST /
│   ├── PATCH /:id
│   └── PATCH /:id/status
│
├── /tenants
│   ├── GET /
│   ├── GET /:id
│   ├── POST /
│   ├── PATCH /:id
│   └── GET /:id/history
│
├── /contracts
│   ├── GET /
│   ├── GET /:id
│   ├── POST /
│   ├── PATCH /:id
│   └── POST /:id/terminate
│
├── /billing
│   ├── GET /grid/:year/:month    # Get editable grid
│   ├── PUT /grid/:year/:month    # Update grid rows
│   ├── POST /grid/:year/:month/lock   # Lock before invoice
│   ├── POST /generate/:year/:month    # Generate invoices
│   └── GET /settings
│
├── /invoices
│   ├── GET /:roomId/:year/:month
│   ├── GET /:roomId/:year/:month/versions
│   ├── POST /:roomId/:year/:month/regenerate
│   └── POST /:id/send
│
├── /payments
│   ├── POST /import              # Upload bank statement
│   ├── GET /matches              # Get auto-matched payments
│   ├── POST /matches/:id/confirm
│   └── POST /matches/:id/reject
│
├── /messaging
│   ├── GET /conversations
│   ├── GET /conversations/:tenantId
│   ├── POST /conversations/:tenantId/reply
│   ├── POST /webhooks/line       # LINE webhook endpoint
│   └── GET /messages/:conversationId
│
├── /analytics
│   ├── GET /revenue
│   ├── GET /occupancy
│   └── GET /overdue
│
├── /audit
│   └── GET / (with filters)
│
├── /setup
│   ├── GET /status
│   ├── POST /building
│   ├── POST /floors
│   ├── POST /rooms
│   └── POST /complete
│
└── /health
    └── GET /
```

---

## 5. Project Directory Structure

```
apartment-erp/
├── prisma/
│   ├── schema.prisma          # Database schema
│   └── migrations/            # Database migrations
│
├── src/
│   ├── app/                   # Next.js App Router
│   │   ├── (auth)/
│   │   │   └── login/
│   │   │
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx
│   │   │   │
│   │   │   ├── rooms/
│   │   │   ├── tenants/
│   │   │   ├── contracts/
│   │   │   ├── billing/
│   │   │   ├── invoices/
│   │   │   ├── payments/
│   │   │   ├── messaging/
│   │   │   ├── analytics/
│   │   │   ├── audit/
│   │   │   └── setup/
│   │   │
│   │   ├── api/
│   │   │   ├── rooms/
│   │   │   ├── tenants/
│   │   │   ├── contracts/
│   │   │   ├── billing/
│   │   │   ├── invoices/
│   │   │   ├── payments/
│   │   │   ├── messaging/
│   │   │   ├── analytics/
│   │   │   ├── audit/
│   │   │   ├── setup/
│   │   │   └── webhooks/
│   │   │       └── line/
│   │   │
│   │   ├── layout.tsx
│   │   └── globals.css
│   │
│   ├── components/
│   │   ├── ui/                # Reusable UI components
│   │   │   ├── Button.tsx
│   │   │   ├── Input.tsx
│   │   │   ├── Table.tsx
│   │   │   └── ...
│   │   │
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx
│   │   │   ├── Header.tsx
│   │   │   └── ...
│   │   │
│   │   ├── rooms/
│   │   ├── tenants/
│   │   ├── billing/
│   │   │   ├── BillingGrid.tsx
│   │   │   └── InvoicePreview.tsx
│   │   ├── messaging/
│   │   │   ├── ChatInbox.tsx
│   │   │   └── MessageThread.tsx
│   │   ├── analytics/
│   │   │   └── Charts.tsx
│   │   └── setup/
│   │       └── Wizard.tsx
│   │
│   ├── lib/
│   │   ├── db.ts              # Prisma client
│   │   ├── auth.ts            # Authentication utilities
│   │   ├── line.ts            # LINE API client
│   │   └── utils.ts           # Common utilities
│   │
│   ├── modules/
│   │   ├── rooms/
│   │   │   ├── room.service.ts
│   │   │   └── room.types.ts
│   │   │
│   │   ├── tenants/
│   │   │   ├── tenant.service.ts
│   │   │   └── tenant.types.ts
│   │   │
│   │   ├── billing/
│   │   │   ├── billing.service.ts
│   │   │   ├── invoice.service.ts
│   │   │   └── billing.types.ts
│   │   │
│   │   ├── messaging/
│   │   │   ├── line.service.ts
│   │   │   ├── chat.service.ts
│   │   │   └── messaging.types.ts
│   │   │
│   │   ├── payments/
│   │   │   ├── payment-matching.service.ts
│   │   │   └── payment.types.ts
│   │   │
│   │   ├── analytics/
│   │   │   ├── analytics.service.ts
│   │   │   └── analytics.types.ts
│   │   │
│   │   ├── audit/
│   │   │   ├── audit.service.ts
│   │   │   └── audit.types.ts
│   │   │
│   │   └── setup/
│   │       ├── setup.service.ts
│   │       └── setup.types.ts
│   │
│   ├── hooks/                 # Custom React hooks
│   ├── types/                 # Shared TypeScript types
│   └── constants/             # App constants
│
├── public/
│   └── images/
│
├── .env.example
├── docker-compose.yml
├── Dockerfile
├── next.config.js
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

---

## 6. Deployment Architecture

### 6.1 Deployment Targets

| Target | Architecture |
|--------|--------------|
| **Vercel** | Serverless: API routes as lambdas, PostgreSQL via connection pooler |
| **Docker** | Single container: Next.js + PostgreSQL (or external) |
| **VPS** | PM2 process manager, Nginx reverse proxy |
| **NAS** | Docker Compose with persistent volumes |

### 6.2 Docker Compose (for VPS/NAS)

```yaml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://user:pass@db:5432/apartment_erp
      - LINE_CHANNEL_ID=${LINE_CHANNEL_ID}
      - LINE_CHANNEL_SECRET=${LINE_CHANNEL_SECRET}
      - LINE_ACCESS_TOKEN=${LINE_ACCESS_TOKEN}
    depends_on:
      - db

  db:
    image: postgres:15
    volumes:
      - pgdata:/var/lib/postgresql/data
    environment:
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=pass
      - POSTGRES_DB=apartment_erp

volumes:
  pgdata:
```

### 6.3 Environment Variables

```
# Database
DATABASE_URL=postgresql://...

# LINE API
LINE_CHANNEL_ID=
LINE_CHANNEL_SECRET=
LINE_ACCESS_TOKEN=
LINE_USER_ID=  # Bot's own user ID

# Auth
NEXTAUTH_SECRET=
NEXTAUTH_URL=http://localhost:3000

# App
NODE_ENV=development|production
```

---

## 7. Security Considerations (OWASP)

| Requirement | Implementation |
|-------------|----------------|
| **A01 - Broken Access Control** | Admin/staff auth, route middleware, role-cookie checks |
| **A02 - Cryptographic Failures** | Encrypt sensitive data, HTTPS only |
| **A03 - Injection** | Prisma ORM prevents SQL injection |
| **A04 - Insecure Design** | Input validation with Zod |
| **A05 - Security Misconfiguration** | Environment-based config, minimal exposure |
| **A06 - Vulnerable Components** | Dependency scanning, update regularly |
| **A07 - Auth Failures** | Rate limiting, session timeout |
| **A08 - Software Integrity** | Verify webhooks signatures (LINE) |
| **A09 - Security Logging** | All actions → AuditLog table |
| **A10 - SSRF** | Validate URLs, restrict internal calls |

---

## 8. Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Invoice versioning** | Legal requirement: track changes after sending |
| **Manual payment confirmation** | Never auto-confirm payments; human must verify |
| **LINE-only resident communication** | Simpler UX, no separate resident web portal needed |
| **Billing grid lock before invoice** | Prevents edits after invoice generation |
| **Prisma ORM** | Type-safe, migration support, works with PostgreSQL |
| **Next.js API routes** | Single codebase, serverless-ready |
| **Module-based service layer** | Clean separation, testable, maintainable |

---

## 9. Future Considerations (Out of Scope)

These can be added later:

- Multi-building support
- Maintenance request tracking
- Owner portal
- Smart lock integration
- SMS backup (LINE may not reach all users)
- Mobile app for admins

---

## Operational Runbooks

For day-to-day operations, refer to the dedicated runbook documents:

| Document | Purpose |
|----------|---------|
| [DEPLOY_RUNBOOK.md](./DEPLOY_RUNBOOK.md) | Full deploy procedure, env vars, prerequisites, failure handling |
| [BACKUP_PROCEDURE.md](./BACKUP_PROCEDURE.md) | Backup scripts, scheduling, retention, verification |
| [RESTORE_GUIDE.md](./RESTORE_GUIDE.md) | Step-by-step restore, validation, destructive warnings |
| [ROLLBACK_PROCEDURE.md](./ROLLBACK_PROCEDURE.md) | App rollback vs DB rollback, safe sequence, risk table |
| [ONLYOFFICE_INTEGRATION_DESIGN.md](./ONLYOFFICE_INTEGRATION_DESIGN.md) | Document template architecture, field contracts, rendering pipeline, editor integration, phased implementation |
