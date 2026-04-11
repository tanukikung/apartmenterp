---
name: reminders-broadcast
description: Auto Payment Reminders + Broadcast System — configurable reminder schedules, late fee auto-calculation, LINE-based broadcast to tenants
type: reference
created: 2026-04-10
---

# Auto Payment Reminders + Broadcast System

## Overview

Implements P2 features:
- **Configurable reminder schedule**: 7/3/0/-3/-7 days around due date, stored in `ReminderConfig` DB model
- **Late payment fee auto-calculation**: `penaltyPerDay * daysOverdue` capped at `maxPenalty`, applied via `lateFeeAmount` on `Invoice`
- **LINE-based broadcast**: admin sends message to all tenants, filtered by floor/room

---

## Prisma Schema Changes

### BillingRule — added late fee fields
```prisma
penaltyPerDay     Decimal @default(0) @db.Decimal(10, 2)
maxPenalty        Decimal @default(0) @db.Decimal(10, 2)
gracePeriodDays   Int     @default(0)
```

### Invoice — added late fee tracking
```prisma
lateFeeAmount    Decimal @default(0) @db.Decimal(10, 2)
lateFeeAppliedAt DateTime?
```

### ReminderConfig — new model
```prisma
periodDays   Int               // negative = overdue, positive = before due, 0 = due today
messageTh    String            @db.Text
messageEn    String            @db.Text
isActive     Boolean           @default(true)
priority     ReminderPriority  @default(NORMAL)
appliesTo    ReminderAppliesTo @default(ALL)
@@unique([periodDays])
```

Enums: `ReminderPriority { LOW NORMAL HIGH URGENT }`, `ReminderAppliesTo { ALL OVERDUE DUE_SOON }`

### Broadcast — new model
```prisma
message      String
target       BroadcastTarget @default(ALL)  // ALL | FLOORS | ROOMS
targetFloors Int[]
targetRooms  String[]
sentBy       String
sentByName   String?
sentAt       DateTime @default(now)
lineMessageId String?
totalCount   Int @default(0)
sentCount    Int @default(0)
failedCount  Int @default(0)
status       BroadcastStatus @default(PENDING)  // PENDING | SENDING | COMPLETED | PARTIAL | FAILED
```

---

## Key Source Files

### API Routes

| File | Description |
|------|-------------|
| `src/app/api/reminders/config/route.ts` | CRUD for ReminderConfig |
| `src/app/api/broadcast/route.ts` | List + Create/Send broadcast |
| `src/app/api/broadcast/[id]/route.ts` | Get single, cancel broadcast |
| `src/app/api/reminders/send/route.ts` | Manual single reminder (existing) |
| `src/app/api/reminders/bulk-send/route.ts` | Bulk reminder send (existing) |

### Service Files

| File | Description |
|------|-------------|
| `src/modules/reminders/reminder.service.ts` | Enhanced ReminderService with configurable schedules + late fee calc |
| `src/modules/jobs/late-fee.job.ts` | Late fee job — reads BillingRule.penaltyPerDay, applies to OVERDUE invoices |
| `src/modules/jobs/job-runner.ts` | Updated `runLateFee()` to use `late-fee.job.ts` |
| `src/modules/messaging/reminder-notifier.ts` | Added `ConfigurableReminder` handler for custom message templates |

### UI Pages

| File | Description |
|------|-------------|
| `src/app/admin/settings/reminders/page.tsx` | Admin UI for managing ReminderConfig |
| `src/app/admin/broadcast/page.tsx` | Existing broadcast/overdue reminder UI |

---

## API Design

### ReminderConfig CRUD
- `GET /api/reminders/config` — list all configs
- `POST /api/reminders/config` — create (periodDays must be unique)
- `PUT /api/reminders/config` — update by id
- `DELETE /api/reminders/config?id=` — delete by id

### Broadcast
- `GET /api/broadcast` — list broadcasts (paginated)
- `POST /api/broadcast` — create and immediately send broadcast
  - Body: `{ message, target: "ALL"|"FLOORS"|"ROOMS", targetFloors?: number[], targetRooms?: string[] }`
  - Resolves occupied rooms with LINE-linked primary tenants
  - Sends LINE push message to each, tracks sentCount/failedCount
- `GET /api/broadcast?id=` — get single broadcast
- `PATCH /api/broadcast?id=` — cancel pending/sending broadcast

---

## Reminder Flow

1. **Job scheduler** (`instrumentation.ts`) fires `reminder-scheduler` cron job
2. **`ReminderService.runDaily()`** reads active `ReminderConfig` rows
   - For each config, finds invoices matching the period (before/after due date)
   - Creates `OutboxEvent` with `eventType: 'ConfigurableReminder'` and per-config message
3. **`OutboxProcessor`** processes outbox events → publishes to `EventBus`
4. **`ConfigurableReminder` handler** in `reminder-notifier.ts` receives event
   - Looks up invoice + tenant LINE userId
   - Substitutes `{{roomNo}}`, `{{amount}}`, `{{dueDate}}`, `{{daysOverdue}}` in messageTh
   - Sends via LINE

Fallback: If no `ReminderConfig` rows exist, falls back to default 3/0/-3 day schedule.

---

## Late Fee Flow

1. **`late-fee` job** runs daily (scheduled in `instrumentation.ts` via `SCHEDULES`)
2. **`runLateFeeJob()`** iterates all `OVERDUE` invoices
   - Reads `effectiveRule.penaltyPerDay`, `effectiveRule.maxPenalty`, `gracePeriodDays`
   - `daysOverdue = floor((now - dueDate - gracePeriodDays) / 86400000)`
   - `lateFee = min(daysOverdue * penaltyPerDay, maxPenalty)`
   - Updates `Invoice.lateFeeAmount` and `lateFeeAppliedAt`
3. `Invoice.totalAmount` + `lateFeeAmount` = total amount owed

---

## Message Template Variables

In ReminderConfig `messageTh` (and `messageEn`):
- `{{roomNo}}` — room number
- `{{amount}}` — formatted currency amount
- `{{dueDate}}` — localized date string
- `{{daysOverdue}}` — calculated days overdue (0 if not overdue)

---

## Tests

| File | Coverage |
|------|----------|
| `tests/late-fee.test.ts` | Unit tests for `calculateLateFee()` |
| `tests/api/broadcast.test.ts` | API: list, create, FLOORS target, validation |
| `tests/api/reminder-config.test.ts` | API: CRUD with duplicate prevention |