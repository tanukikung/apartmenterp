# Database Schema Documentation

## 1. Schema Overview

### 1.1 Tables Summary

| Category | Tables |
|----------|--------|
| **Location** | `buildings`, `floors`, `rooms` |
| **Tenant** | `tenants`, `room_tenants`, `contracts` |
| **Billing** | `billing_item_types`, `billing_records`, `billing_items` |
| **Invoice** | `invoices`, `invoice_versions`, `invoice_changes` |
| **Payment** | `payments`, `payment_matches` |
| **Messaging** | `line_users`, `conversations`, `messages`, `notifications` |
| **System** | `audit_logs`, `configs` |

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
│billing_records│────▶│  billing_items │     │   invoices  │
└──────┬───────┘     └─────────────────┘     └──────┬──────┘
       │                                             │
       │              ┌─────────────────┐            │
       └─────────────▶│    payments     │◀──────────┘
                      └────────┬────────┘
                               │
                      ┌────────┴────────┐
                      │ payment_matches │
                      └─────────────────┘


┌──────────────┐
│  audit_logs  │  (all entities reference this)
└──────────────┘
```

---

## 2. Index Strategy

### 2.1 Primary Indexes (Primary Keys)
- All tables have `id` as UUID primary key

### 2.2 Foreign Key Indexes

| Table | Index | Purpose |
|-------|-------|---------|
| floors | `buildingId` | Find floors in building |
| rooms | `floorId` | Find rooms on floor |
| room_tenants | `roomId`, `tenantId` | Find tenants in room |
| contracts | `roomId`, `status` | Find active contract for room |
| contracts | `primaryTenantId` | Find contracts for tenant |
| billing_records | `roomId` | Find billing for room |
| billing_items | `billingRecordId` | Find items in billing |
| invoices | `roomId`, `billingRecordId` | Find invoices |
| payments | `status`, `paidAt` | Payment processing |
| payment_matches | `paymentId`, `invoiceId` | Match lookup |
| conversations | `tenantId`, `roomId` | Find conversation |
| messages | `conversationId` | Find messages |

### 2.3 Composite Indexes

| Table | Index | Purpose |
|-------|-------|---------|
| billing_records | `[roomId, year, month]` | Unique billing per room/month |
| invoices | `[roomId, year, month, version]` | Unique invoice per room/month/version |
| rooms | `[floorId, roomNumber]` | Unique room per floor |
| contracts | `[roomId, status]` | One active contract per room |
| invoices | `[status, dueDate]` | Overdue invoice queries |

### 2.4 Query-Specific Indexes

| Table | Index | Purpose |
|-------|-------|---------|
| rooms | `status` | Find vacant/occupied rooms |
| billing_records | `status` | Find draft/locked billing |
| conversations | `unreadCount` | Find unread conversations |
| notifications | `status`, `scheduledAt` | Find pending notifications |
| audit_logs | `[entityType, entityId]`, `createdAt` | Audit trail queries |
| tenants | `lineUserId`, `phone`, `email` | Tenant lookups |

---

## 3. Data Integrity Rules

### 3.1 Foreign Key Constraints

| Parent | Child | Constraint |
|--------|-------|------------|
| Building | Floor | `ON DELETE CASCADE` |
| Floor | Room | `ON DELETE CASCADE` |
| Room | RoomTenant | `ON DELETE CASCADE` |
| RoomTenant | - | `ON DELETE RESTRICT` on Tenant |
| Room | Contract | `ON DELETE CASCADE` |
| Contract | Tenant | `ON DELETE RESTRICT` |
| Room | BillingRecord | `ON DELETE CASCADE` |
| BillingRecord | BillingItem | `ON DELETE CASCADE` |
| BillingItem | BillingItemType | `ON DELETE RESTRICT` |
| BillingRecord | Invoice | `ON DELETE RESTRICT` |
| Invoice | InvoiceVersion | `ON DELETE CASCADE` |
| Invoice | InvoiceChange | `ON DELETE CASCADE` |
| Payment | PaymentMatch | `ON DELETE CASCADE` |
| Invoice | PaymentMatch | `ON DELETE RESTRICT` |
| Conversation | LineUser | `ON DELETE RESTRICT` |
| Conversation | Tenant | `ON DELETE SET NULL` |
| Conversation | Room | `ON DELETE SET NULL` |
| Conversation | Message | `ON DELETE CASCADE` |

### 3.2 Unique Constraints

| Table | Constraint | Purpose |
|-------|------------|---------|
| floors | `[buildingId, floorNumber]` | One floor per building |
| rooms | `[floorId, roomNumber]` | One room per floor |
| room_tenants | `[roomId, tenantId]` | One tenant assignment per room |
| contracts | `[roomId, status]` | One active contract per room |
| billing_records | `[roomId, year, month]` | One billing per room/month |
| invoices | `[roomId, year, month, version]` | Versioned invoices |
| invoice_versions | `[invoiceId, version]` | Unique version |
| payment_matches | `[paymentId, invoiceId]` | One match per payment/invoice |
| line_users | `lineUserId` | One LINE user profile |
| conversations | `lineUserId` | One conversation per LINE user |
| messages | `lineMessageId` | No duplicate messages |
| configs | `key` | One value per config key |

### 3.3 Default Values

| Field | Default |
|-------|---------|
| Room.status | `VACANT` |
| Room.maxResidents | `2` |
| RoomTenant.moveOutDate | `NULL` |
| Contract.status | `ACTIVE` |
| Contract.deposit | `NULL` |
| BillingRecord.status | `DRAFT` |
| BillingRecord.subtotal | `0` |
| BillingRecord.isPaid | `false` |
| BillingItem.quantity | `1` |
| BillingItem.amount | `quantity * unitPrice` |
| Invoice.version | `1` |
| Invoice.status | `DRAFT` |
| Invoice.sentAt | `NULL` |
| Invoice.paidAt | `NULL` |
| Payment.status | `PENDING` |
| Payment.matchedAt | `NULL` |
| Payment.confirmedAt | `NULL` |
| Payment.rejectedAt | `NULL` |
| PaymentMatch.status | `PENDING` |
| PaymentMatch.isAutoMatched | `false` |
| Conversation.unreadCount | `0` |
| Conversation.status | `ACTIVE` |
| Message.isRead | `false` |
| Notification.status | `PENDING` |

### 3.4 Decimal Precision

| Field | Precision | Use Case |
|-------|----------|----------|
| monthlyRent | `DECIMAL(10, 2)` | Up to 99,999,999.99 |
| deposit | `DECIMAL(10, 2)` | Up to 99,999,999.99 |
| quantity | `DECIMAL(10, 2)` | For usage-based billing |
| unitPrice | `DECIMAL(10, 2)` | Per-unit price |
| amount | `DECIMAL(12, 2)` | Line item totals |
| subtotal | `DECIMAL(12, 2)` | Invoice/billing subtotals |
| total | `DECIMAL(12, 2)` | Invoice total |

---

## 4. Scalability Considerations

### 4.1 Capacity

| Resource | Current | Max |
|----------|---------|-----|
| Buildings | 1 | Expandable (add buildingId to queries) |
| Floors | 8 | Per building |
| Rooms | 239 | Per floor |
| Tenants | ~478 | Max 2 per room |
| Billing Records | ~2,868/year | 239 rooms × 12 months |
| Invoices | ~2,868/year | 1 per billing record |
| Invoice Versions | ~8,604/year | Average 3 versions per invoice |
| Payments | Variable | Based on collection |
| Messages | Variable | Based on tenant activity |

### 4.2 Performance Notes

- **Billing queries**: Indexed by `[roomId, year, month]`
- **Invoice queries**: Indexed by `[roomId, year, month, version]` and `[status, dueDate]`
- **Payment matching**: Indexed by `[status, paidAt, amount]`
- **Conversations**: Indexed by `[unreadCount]` for admin inbox
- **Audit logs**: Indexed by `[entityType, entityId]` for traceability

### 4.3 Future Scaling

If scaling beyond single building:
- Add `buildingId` to rooms, invoices, payments queries
- Consider partitioning billing_records by year
- Consider archiving old invoices/payments
- Add read replicas for analytics queries

---

## 5. Predefined Data

### 5.1 Billing Item Types

```sql
INSERT INTO billing_item_types (code, name, description, isRecurring, defaultAmount) VALUES
('RENT', 'Monthly Rent', 'Base monthly rent', true, NULL),
('ELECTRIC', 'Electricity', 'Electricity usage', true, NULL),
('WATER', 'Water', 'Water usage', true, NULL),
('PARKING', 'Parking Fee', 'Monthly parking', true, 0),
('FACILITY', 'Facility Fee', 'Common area maintenance', true, 0),
('FEE_LATE', 'Late Fee', 'Late payment penalty', false, 0),
('FEE_OTHER', 'Other Fee', 'Miscellaneous fees', false, 0);
```

### 5.2 Initial Config

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
