---
name: Expense Tracking + Contract Renewal Alerts + Late Payment Fee Auto
description: |
  Expense tracking with CRUD operations, profit/loss reports, contract expiry
  notifications at 30/60/90 days, and automatic late fee calculation based on
  BillingRule penaltyPerDay/gracePeriodDays/maxPenalty fields.
type: reference
---

# Feature: Expense Tracking + Contract Renewal Alerts + Late Payment Fee Auto

## Schema Changes

### BillingRule — Late Payment Fee Fields
```prisma
penaltyPerDay     Decimal @default(0) @db.Decimal(10, 2)
maxPenalty        Decimal @default(0) @db.Decimal(10, 2)
gracePeriodDays   Int     @default(0)
```

### Expense Model (new)
```prisma
model Expense {
  id          String         @id @default(uuid())
  category    ExpenseCategory
  amount      Decimal        @db.Decimal(12, 2)
  date        DateTime
  description String         @db.Text
  paidTo      String?
  receiptNo   String?
  createdBy   String?
  createdAt   DateTime       @default(now())
  updatedAt   DateTime       @updatedAt
}

enum ExpenseCategory {
  CLEANING
  REPAIR
  UTILITY
  STAFF_SALARY
  MANAGEMENT
  OTHER
}
```

## API Routes

- `GET /api/expenses` — List expenses with filter/pagination
- `POST /api/expenses` — Create expense (ADMIN only)
- `GET /api/expenses/[id]` — Get single expense
- `PATCH /api/expenses/[id]` — Update expense (ADMIN only)
- `DELETE /api/expenses/[id]` — Delete expense (ADMIN only)
- `GET /api/reports/profit-loss?year=&month=` — Profit/loss report

## Job Runners

| Job ID | Schedule | Description |
|--------|----------|-------------|
| `overdue-flag` | 01:00 daily | Marks overdue invoices |
| `billing-generate` | 06:00 on 1st | Creates monthly billing period |
| `invoice-send` | 07:00 on 1st | Sends pending invoices |
| `late-fee` | 02:00 daily | Calculates late fees from BillingRule |
| `db-cleanup` | 03:00 Sundays | Deletes old audit logs |
| `contract-expiry` | 09:00 daily | Notifies contracts expiring 30/60/90 days |

## Late Fee Calculation (late-fee job)

1. Find OVERDUE invoices with a BillingRule that has penaltyPerDay > 0
2. Skip if now <= dueDate + gracePeriodDays
3. daysLate = floor((now - (dueDate + gracePeriodDays)) / 86400000)
4. lateFee = min(daysLate * penaltyPerDay, maxPenalty) if maxPenalty > 0
5. Append note to Invoice, create in-app Notification

## Contract Expiry (contract-expiry job)

1. Check thresholds: 30, 60, 90 days ahead
2. For each contract found: create Notification (NOTICE type) for each active admin
3. Send LINE message to tenant if lineUserId exists
4. Deduplicate: skip if notification with same content exists in last 24h

## Admin Pages

- `src/app/admin/expenses/page.tsx` — Expense list with create form modal
- `src/app/admin/reports/profit-loss/page.tsx` — Profit/loss report with chart

## Key Files

- `src/modules/expenses/` — ExpenseService + types
- `src/modules/jobs/job-runner.ts` — runContractExpiryCheck, updated runLateFee
- `src/modules/jobs/late-fee.job.ts` — Existing late fee logic (called by runLateFee)
- `src/instrumentation.ts` — Added contract-expiry to SCHEDULES
- `prisma/schema.prisma` — Expense model + gracePeriodDays field