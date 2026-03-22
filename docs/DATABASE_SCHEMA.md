# Database Schema Documentation

## 1. Schema Overview

### 1.1 Tables Summary

| Category | Tables |
|----------|--------|
| **Location** | `buildings`, `floors`, `rooms` |
| **Tenant** | `tenants`, `room_tenants`, `contracts` |
| **Billing** | `billing_periods`, `room_billings` |
| **Invoice** | `invoices`, `invoice_deliveries`, `outbox_events` |
| **Payment** | `payments`, `payment_transactions`, `payment_matches` |
| **Messaging** | `line_users`, `conversations`, `messages`, `notifications` |
| **Document** | `document_templates`, `generated_documents`, `document_generation_targets` |
| **System** | `audit_logs`, `configs`, `bank_accounts`, `billing_rules` |

### 1.2 Entity Relationship Diagram

```
┌──────────────┐     ┌──────────┐     ┌─────────────┐
│  buildings   │────▶│  floors  │────▶│    rooms    │
└──────────────┘     └──────────┘     └──────┬──────┘
                                              │
                    ┌─────────────────────────┼─────────────────────────┐
                    │                         │                         │
              ┌─────┴─────┐            ┌──────┴──────┐          ┌──────┴──────┐
              │room_tenants│            │  contracts  │          │conversations│
              └─────┬─────┘            └──────┬──────┘          └──────┬──────┘
                    │                         │                         │
              ┌─────┴─────┐                   │                   ┌─────┴─────┐
              │  tenants  │◀──────────────────┘                   │ line_users│
              └───────────┘                                      └───────────┘


┌──────────────┐     ┌─────────────────┐     ┌─────────────┐
│billing_periods│────▶│  room_billings │     │   invoices  │
└──────────────┘     └────────┬────────┘     └──────┬──────┘
                               │                     │
                               │              ┌───────┴───────┐
                               │              │ invoice_      │
                               └─────────────▶│ deliveries   │
                                              └───────────────┘


┌─────────────────┐     ┌──────────────────┐
│    payments     │────▶│payment_transactions│
└────────┬────────┘     └──────────────────┘
         │
         │              ┌──────────────────┐
         └─────────────▶│ payment_matches  │
                        └──────────────────┘


┌──────────────┐
│  audit_logs  │  (all entities reference this)
└──────────────┘
```

---

## 2. Index Strategy

### 2.1 Primary Indexes (Primary Keys)
- All tables have `id` as UUID primary key (except Room uses roomNo, BankAccount uses id)

### 2.2 Foreign Key Indexes

| Table | Index | Purpose |
|-------|-------|---------|
| floors | `buildingId` | Find floors in building |
| rooms | `floorNo` | Find rooms by floor number |
| room_tenants | `roomNo`, `tenantId` | Find tenants in room |
| contracts | `roomNo`, `status` | Find active contract for room |
| contracts | `primaryTenantId` | Find contracts for tenant |
| room_billings | `billingPeriodId`, `roomNo` | Unique billing per period/room |
| room_billings | `roomNo` | Find billing for room |
| room_billings | `billingPeriodId` | Find all billings in period |
| invoices | `roomBillingId` | Find invoice for billing |
| invoices | `roomNo`, `year`, `month` | Find invoices |
| payments | `status` | Find payments by status |
| payment_matches | `paymentId`, `invoiceId` | Match lookup |
| conversations | `tenantId`, `roomNo` | Find conversation |
| messages | `conversationId` | Find messages |

### 2.3 Composite Indexes

| Table | Index | Purpose |
|-------|-------|---------|
| billing_periods | `[year, month]` | Unique period per month |
| room_billings | `[billingPeriodId, roomNo]` | Unique billing per period/room |
| invoices | `[roomNo, year, month]` | Unique invoice per room/month |
| rooms | `[floorNo, roomNo]` | Unique room per floor |
| contracts | `[roomNo, status]` | One active contract per room |

---

## 3. Data Integrity Rules

### 3.1 Foreign Key Constraints

| Parent | Child | Constraint |
|--------|-------|------------|
| Building | Floor | `ON DELETE CASCADE` |
| Floor | Room | No FK (room stores floorNo directly) |
| Room | RoomTenant | `ON DELETE CASCADE` |
| Room | Contract | `ON DELETE CASCADE` |
| Room | RoomBilling | `ON DELETE CASCADE` |
| Room | Invoice | `ON DELETE CASCADE` |
| BillingPeriod | RoomBilling | `ON DELETE CASCADE` |
| RoomBilling | Invoice | `ON DELETE RESTRICT` |
| Payment | PaymentMatch | `ON DELETE CASCADE` |
| Invoice | PaymentMatch | `ON DELETE RESTRICT` |
| Conversation | Message | `ON DELETE CASCADE` |
| BankAccount | Room | `ON DELETE RESTRICT` |
| BankAccount | PaymentTransaction | `ON DELETE RESTRICT` |

### 3.2 Unique Constraints

| Table | Constraint | Purpose |
|-------|------------|---------|
| floors | `[buildingId, floorNumber]` | One floor per building |
| rooms | `roomNo` | One room per building |
| room_tenants | `[roomNo, tenantId, role]` | One tenant role per room |
| contracts | `[roomNo, status]` | One active contract per room |
| billing_periods | `[year, month]` | One period per month |
| room_billings | `[billingPeriodId, roomNo]` | One billing per period/room |
| invoices | `roomBillingId` | One invoice per billing |
| invoices | `[roomNo, year, month]` | One invoice per room/month |
| payment_matches | `[paymentId, invoiceId]` | One match per payment/invoice |
| line_users | `lineUserId` | One LINE user profile |
| conversations | `lineUserId` | One conversation per LINE user |
| configs | `key` | One value per config key |

### 3.3 Default Values

| Field | Default |
|-------|---------|
| Room.roomStatus | `ACTIVE` |
| Room.hasFurniture | `false` |
| RoomTenant.moveOutDate | `NULL` |
| Contract.status | `ACTIVE` |
| Contract.deposit | `NULL` |
| RoomBilling.status | `DRAFT` |
| RoomBilling.totalDue | `0` |
| Invoice.status | `GENERATED` |
| Invoice.issuedAt | `now()` |
| Invoice.sentAt | `NULL` |
| Invoice.paidAt | `NULL` |
| Payment.status | `PENDING` |
| PaymentTransaction.confirmedAt | `NULL` |
| PaymentMatch.status | `PENDING` |
| PaymentMatch.isAutoMatched | `false` |
| Conversation.unreadCount | `0` |
| Conversation.status | `ACTIVE` |
| Message.isRead | `false` |
| Notification.status | `PENDING` |
| BankAccount.active | `true` |
| BillingPeriod.status | `OPEN` |
| BillingPeriod.dueDay | `25` |

---

## 4. Scalability Considerations

### 4.1 Capacity

| Resource | Current | Max |
|----------|---------|-----|
| Buildings | 1 | Expandable |
| Floors | 8 | Per building |
| Rooms | 239 | Per building |
| Tenants | ~478 | Max 2 per room |
| Billing Periods | ~12/year | One per month |
| Room Billings | ~2,868/year | 239 rooms × 12 months |
| Invoices | ~2,868/year | 1 per billing record |
| Payments | Variable | Based on collection |
| Messages | Variable | Based on tenant activity |

### 4.2 Performance Notes

- **Billing queries**: Indexed by `[billingPeriodId, roomNo]`
- **Invoice queries**: Indexed by `[roomNo, year, month]` and `[status]`
- **Payment matching**: Indexed by `[status, paidAt, amount]`
- **Conversations**: Indexed by `[unreadCount]` for admin inbox
- **Audit logs**: Indexed by `[entityType, entityId]` for traceability

---

## 5. Predefined Data

### 5.1 Billing Rules

```sql
-- Water and electric billing rules stored in billing_rules table
INSERT INTO billing_rules (code, descriptionTh, waterEnabled, waterUnitPrice, waterMinCharge, waterServiceFeeMode, waterServiceFeeAmount, electricEnabled, electricUnitPrice, electricMinCharge, electricServiceFeeMode, electricServiceFeeAmount) VALUES
('DEFAULT', 'Default Billing Rule', true, 12.00, 20.00, 'FLAT', 10.00, true, 4.50, 50.00, 'FLAT', 10.00);
```

### 5.2 Bank Accounts

```sql
-- Default receiving account for billing
INSERT INTO bank_accounts (id, name, bankName, bankAccountNo, promptpay, active) VALUES
('default', 'Default Account', 'Bank Name', '1234567890', null, true);
```

### 5.3 Initial Config

```sql
INSERT INTO configs (key, value, description) VALUES
('billing.billingDay', 1, 'Day of month billing generated'),
('billing.dueDay', 5, 'Payment due day'),
('billing.overdueDay', 15, 'Day after which considered overdue'),
('setup.complete', false, 'Whether setup wizard completed');
```

---

## 6. Migration Strategy

### 6.1 Initial Migration
```bash
npx prisma migrate dev --name init
```

### 6.2 Seed Data
```bash
npx prisma db seed
```

### 6.3 Future Changes
- Add new migrations for schema changes
- Use `prisma migrate diff` to preview changes
- Never modify existing migrations
