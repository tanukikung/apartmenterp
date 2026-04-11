---
name: Move-out Workflow + Deposit Return Tracking
description: Manage tenant move-outs with room inspection checklist, deposit deduction calculations, and LINE notification support
type: reference
---

# Move-out Workflow + Deposit Return Tracking

## Overview

The Move-out Workflow feature manages the entire process when a tenant moves out of an apartment, including:
- Creating move-out records when tenants give notice
- Room inspection with condition tracking
- Deposit deduction calculations
- Final refund calculations and tracking
- LINE messaging integration for notifications

## Database Models

### MoveOut Model
- `id` (UUID): Primary key
- `contractId` (UUID, unique): Link to the contract being terminated
- `moveOutDate` (DateTime): Date of move-out
- `depositAmount` (Decimal): Original deposit from contract
- `totalDeduction` (Decimal): Sum of all deductions
- `finalRefund` (Decimal): Amount to be returned (deposit - deductions)
- `status` (enum): PENDING → INSPECTION_DONE → DEPOSIT_CALCULATED → CONFIRMED → REFUNDED (or CANCELLED)
- `notes` (String, nullable): Additional notes
- `lineNoticeSentAt` (DateTime, nullable): When LINE notice was sent
- `confirmedAt` / `confirmedBy` (DateTime/String, nullable): Confirmation tracking
- `refundAt` / `refundBy` (DateTime/String, nullable): Refund tracking

### MoveOutItem Model
- `id` (UUID): Primary key
- `moveOutId` (UUID, FK): Link to MoveOut
- `category` (String): wall, floor, bathroom, kitchen, furniture, other
- `item` (String): Specific item name
- `condition` (enum): GOOD, FAIR, DAMAGED, MISSING
- `cost` (Decimal): Deduction cost
- `notes` (String, nullable): Additional notes

### Contract Relation
- Contract has one MoveOut (1:1)
- On move-out creation: Contract status → TERMINATED, Room status → VACANT

## API Endpoints

### MoveOut CRUD
- `POST /api/moveouts` - Create move-out record
- `GET /api/moveouts` - List move-outs (with filters)
- `GET /api/moveouts/[id]` - Get move-out by ID
- `PATCH /api/moveouts/[id]` - Update move-out

### Inspection Items
- `POST /api/moveouts/[id]/items` - Add inspection item
- `PATCH /api/moveouts/[id]/items/[itemId]` - Update item
- `DELETE /api/moveouts/[id]/items/[itemId]` - Delete item

### Workflow Actions
- `POST /api/moveouts/[id]/calculate` - Calculate deposit deductions
- `POST /api/moveouts/[id]/confirm` - Confirm move-out
- `POST /api/moveouts/[id]/refund` - Mark as refunded
- `POST /api/moveouts/[id]/cancel` - Cancel move-out
- `POST /api/moveouts/[id]/send-notice` - Send LINE notice

## Status Workflow

```
PENDING → INSPECTION_DONE → DEPOSIT_CALCULATED → CONFIRMED → REFUNDED
    ↓            ↓                  ↓
CANCELLED   CANCELLED          CANCELLED
```

## Admin UI

Located at `src/app/admin/moveouts/page.tsx`:
- List view with KPI cards (total, pending, confirmed, refunded, total refund amount)
- Filter by status, search by room/tenant
- Create new move-out from active contracts
- Detail panel with:
  - Status management buttons
  - Deduction calculation form
  - Inspection item checklist
  - LINE notification button

## Usage

### Create Move-Out
1. Select active contract
2. Set move-out date
3. System automatically:
   - Updates contract to TERMINATED
   - Updates room to VACANT
   - Sets move-out to PENDING status

### Inspection & Deductions
1. Add inspection items with category, condition, cost
2. Or use quick deduction form (cleaning fee, damage repair, other)
3. System calculates final refund automatically

### Complete Move-Out
1. Confirm move-out (locks the calculation)
2. Mark as refunded when cash/check is given
3. Optionally send LINE notification to tenant

### Cancel Move-Out
- Available until refunded
- Restores contract status to ACTIVE
- Restores room status to OCCUPIED

## Files Created

- `prisma/schema.prisma` - MoveOut and MoveOutItem models
- `src/modules/moveouts/types.ts` - TypeScript types and Zod schemas
- `src/modules/moveouts/moveout.service.ts` - Business logic
- `src/modules/moveouts/index.ts` - Module exports
- `src/app/api/moveouts/route.ts` - List/Create API
- `src/app/api/moveouts/[id]/route.ts` - Get/Update API
- `src/app/api/moveouts/[id]/items/route.ts` - Add item API
- `src/app/api/moveouts/[id]/items/[itemId]/route.ts` - Update/Delete item API
- `src/app/api/moveouts/[id]/calculate/route.ts` - Calculate deposit API
- `src/app/api/moveouts/[id]/confirm/route.ts` - Confirm API
- `src/app/api/moveouts/[id]/refund/route.ts` - Mark refunded API
- `src/app/api/moveouts/[id]/cancel/route.ts` - Cancel API
- `src/app/api/moveouts/[id]/send-notice/route.ts` - LINE notification API
- `src/app/admin/moveouts/page.tsx` - Admin UI
- `tests/moveouts.test.ts` - Schema validation tests
