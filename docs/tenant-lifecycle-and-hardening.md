# Tenant Lifecycle and Hardening — Apartment ERP

## Overview

This document describes the complete tenant lifecycle in the Apartment ERP system, covering all states, transitions, and the hardening improvements made to ensure data integrity and auditability.

---

## Tenant Lifecycle

### Move-In Flow

```
VACANT ROOM → Contract Created → Tenant Move-In → OCCUPIED Room Status
```

1. **Room becomes VACANT** after a move-out is confirmed
2. **Contract created** (`POST /api/contracts`) with tenant details, room assignment, start date, rent amount
3. **Room status → OCCUPIED** (done manually or via move-in confirmation)
4. **Tenant record created** with personal details, LINE user ID (optional), contact info

### Move-Out Flow (State Machine)

```
PENDING → CONFIRMED → (refund processing) → COMPLETED
         ↓
      CANCELLED (reverses to OCCUPIED)
```

#### State Definitions

| State | Description | Contract | Room | Move-Out Record |
|-------|-------------|----------|------|-----------------|
| `PENDING` | Move-out initiated, pending confirmation | Unchanged (ACTIVE) | Unchanged (OCCUPIED) | Created with PENDING status |
| `CONFIRMED` | Tenant confirmed, terminal state applied | `TERMINATED` | `VACANT` | Confirmed with termination date |
| `CANCELLED` | Move-out cancelled before confirmation | Reverted to ACTIVE (if was CONFIRMED) | Reverted to OCCUPIED (if was CONFIRMED) | Marked CANCELLED |

#### Transition Rules

**`createMoveOut` (PENDING initiation)**
- Creates `MoveOut` record in `PENDING` state only
- Does NOT modify contract, room, or tenant state
- Creates audit log event `TenantMoveOutCreated`

**`confirmMoveOut` (CONFIRMED)**
- Updates contract `status → TERMINATED`, sets `terminationDate`
- Updates room `roomStatus → VACANT`
- Updates `roomTenant.moveOutDate` for the primary tenant
- Creates audit log event `TenantMoveOutConfirmed`
- Uses `FOR UPDATE` row lock on contract and room to prevent concurrent modifications

**`cancelMoveOut`**
- Only operates if move-out is in `CONFIRMED` state
- Restores contract `status → ACTIVE`, clears `terminationDate`
- Restores room `roomStatus → OCCUPIED`
- Restores `roomTenant.moveOutDate → NULL`
- Creates audit log event `TenantMoveOutCancelled`

---

## Invoice Architecture

### Two-Snapshot Model

The invoice system uses a two-snapshot model to freeze financial state at the moment an invoice is sent:

| Field | When Set | Mutability |
|-------|----------|------------|
| `totalAmount` | Invoice generated | Mutable until SENT |
| `snapshotTotal` | `freezeInvoiceFinancialSnapshot()` called at SENT | Immutable after SENT |
| `snapshotLineItems` | `freezeInvoiceFinancialSnapshot()` called at SENT | Immutable after SENT |
| `snapshotLateFee` | `freezeInvoiceFinancialSnapshot()` called at SENT | Immutable after SENT |
| `snapshotHash` | `freezeInvoiceAsLegalSnapshot()` called at SENT | Immutable after SENT |
| `isLegalSnapshot` | `freezeInvoiceAsLegalSnapshot()` called at SENT | Immutable after SENT |

### Why Two Snapshots?

- `snapshotTotal` + line items capture the financial amounts used for payment matching
- `snapshotHash` provides legal evidence of what was billed at a point in time
- Once SENT, the invoice is legally dispatched — modifications must not affect already-matched payments

### Hash Formula

```
SHA256(roomNo | year | month | totalAmount | lateFeeAmount | issuedAt)
```

---

## Payment Matching

### Invoice → Payment Matching Logic

`syncInvoicePaymentState` matches payments to invoices using `snapshotTotal` (not `totalAmount`):

```typescript
const invoiceTotal = Number(invoice.snapshotTotal ?? invoice.totalAmount);
```

This ensures that if billing is adjusted after an invoice is SENT, the payment matching still uses the originally-billed amount.

### Matching Rules

1. **Full match**: Payment amount ≥ `snapshotTotal` → invoice `PAID`
2. **Partial match**: Payment amount < `snapshotTotal` → invoice `PARTIAL`
3. **No match**: No payment found → invoice `SENT` or `OVERDUE`

---

## Broadcast / Outbox Pattern

### Architecture

```
POST /api/broadcast
    → Creates Broadcast record
    → Creates one OutboxEvent per LINE-linked tenant (PENDING)
    → Returns 201 immediately

OutboxProcessor (every 5s via FOR UPDATE SKIP LOCKED)
    → Polls PENDING OutboxEvents
    → Dispatches BroadcastSendRequested to event bus
    → Marks COMPLETED on success, FAILED on error (retry logic applies)
```

### Idempotency

- `POST /api/broadcast` with same `Idempotency-Key` returns existing broadcast (200)
- OutboxEvent `messageHash` unique constraint prevents duplicate sends (P2002 → treated as success)
- LINE's at-least-once delivery combined with idempotent application = effectively-once

### Cancellation

```
PATCH /api/broadcast/[id] { status: 'CANCELLED' }
    → Updates all PENDING OutboxEvents for this broadcast to CANCELLED
    → Updates Broadcast status
    → Atomic transaction
```

---

## LINE Signature Verification

### Security Model

LINE webhooks use HMAC-SHA256 signature verification:

1. LINE appends `X-Line-Signature` header to every webhook request
2. Signature computed as: `HMAC-SHA256(channelSecret, rawRequestBody).digest('base64')`
3. Comparison uses `crypto.timingSafeEqual` (constant-time) to prevent timing oracle attacks

### Implementation

```typescript
const hash = crypto.createHmac('SHA256', channelSecret).update(body).digest('base64');
try {
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(signature));
} catch {
  return false;
}
```

The `try/catch` handles cases where `signature` has invalid length (returns `false` instead of throwing).

---

## Audit Logging

### Event Chain Integrity

All significant operations create audit log events that form a cryptographically verifiable chain:

- `AuditLog.createdAt` used as natural sort order
- Each event stores `previousHash` pointing to the prior event's `hash`
- `verifyChain()` endpoint re-computes all hashes and validates the chain from genesis

### Events Covered

| Event | Trigger |
|-------|---------|
| `BillingPeriodCreated` | Period created |
| `BillingPeriodClosed` | Period closed |
| `BillingPeriodLocked` | Period locked |
| `InvoiceSent` | Invoice sent |
| `PaymentMatched` | Payment matched to invoice |
| `MoveOutCreated` | Move-out initiated |
| `MoveOutConfirmed` | Move-out confirmed |
| `MoveOutCancelled` | Move-out cancelled |
| `AuditChainVerified` | Chain verification requested |

---

## Database Row Locking

### Locking Patterns

| Pattern | Use Case | Syntax |
|---------|----------|--------|
| `FOR UPDATE` | Exclusive lock during modification | `prisma.$queryRaw` tagged template |
| `FOR UPDATE NOWAIT` | Lock with immediate failure on contention | Used for billing period lock |
| `FOR UPDATE SKIP LOCKED` | Queue workers, skip locked rows | Outbox processor poll |

### Key Protected Operations

- **Move-out confirmation**: `contract.id` and `room.roomNo` locked before terminal state update
- **Billing period lock**: `FOR UPDATE NOWAIT` to prevent concurrent lock attempts
- **Outbox processing**: `FOR UPDATE SKIP LOCKED` so multiple workers don't contend

---

## Role-Based Access Control

See [docs/security/authorization-matrix.md](./security/authorization-matrix.md) for the complete route authorization table.

### Role Summary

| Role | Description |
|------|-------------|
| OWNER | Full access — all operations |
| ADMIN | Full access except owner-exclusive operations |
| STAFF | Operational routes only (payments, moveouts, invoice send) |

---

## Hardening Summary (Phase 1–7)

1. **Gap-1**: Audit chain verification with `$queryRawUnsafe` replaced by Prisma ORM
2. **Gap-2**: Invoice snapshot freezing — `snapshotTotal` used for payment matching
3. **Gap-3**: Broadcast outbox pattern — synchronous LINE send replaced with transactional outbox
4. **Gap-4**: Move-out state machine — terminal state changes deferred to CONFIRMED stage
5. **Gap-5**: LINE signature timing-safe comparison
6. **Gap-6**: Schema language clarified — "exactly-once" → "at-least-once + idempotent processing"
7. **Gap-7**: RBAC route authorization matrix documented
