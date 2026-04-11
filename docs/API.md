# Apartment ERP API Reference

Base URL: `http://localhost:3001`

All endpoints return JSON. Successful responses follow the format:

```json
{ "success": true, "data": { ... } }
```

Error responses:

```json
{ "success": false, "error": { "message": "...", "code": "...", "name": "...", "statusCode": 400 } }
```

---

## Authentication

### POST `/api/auth/login`

**Auth:** PUBLIC

**Request body:**

```json
{ "username": "owner", "password": "Owner@12345" }
```

**Response:**

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "username": "owner",
      "displayName": "Owner",
      "role": "ADMIN",
      "forcePasswordChange": false,
      "buildingId": null
    }
  }
}
```

---

### POST `/api/auth/logout`

**Auth:** AUTHENTICATED

Clears auth cookies.

**Response:**

```json
{ "success": true }
```

---

### GET `/api/auth/me`

**Auth:** PUBLIC (reads session cookie)

**Response (authenticated):**

```json
{
  "success": true,
  "data": {
    "authenticated": true,
    "user": {
      "id": "uuid",
      "username": "owner",
      "displayName": "Owner",
      "role": "ADMIN",
      "forcePasswordChange": false,
      "buildingId": null
    }
  }
}
```

---

### POST `/api/auth/change-password`

**Auth:** AUTHENTICATED (requires session)

**Request body:**

```json
{ "currentPassword": "...", "newPassword": "..." }
```

---

### POST `/api/auth/forgot-password`

**Auth:** PUBLIC

**Request body:**

```json
{ "username": "owner" }
```

---

### GET `/api/auth/bootstrap-status`

**Auth:** PUBLIC

Returns whether the system has been set up (i.e., at least one ADMIN user exists).

---

## Rooms

### GET `/api/rooms`

**Auth:** ADMIN, STAFF

**Query params:** `floorNo`, `roomStatus`, `page`, `pageSize`, `search`, `sortBy`, `sortOrder`

**Response:**

```json
{ "success": true, "data": { "rows": [...], "total": 100 } }
```

---

### POST `/api/rooms`

**Auth:** ADMIN

**Request body:**

```json
{ "roomNo": "101", "floorNo": 1, "roomStatus": "VACANT", "monthlyRate": 15000 }
```

---

### GET `/api/rooms/[id]`

**Auth:** ADMIN, STAFF

Returns room details including active tenants.

---

### PATCH `/api/rooms/[id]`

**Auth:** ADMIN

**Request body:**

```json
{ "roomNo": "101", "monthlyRate": 16000 }
```

---

### DELETE `/api/rooms/[id]`

**Auth:** ADMIN

---

### PATCH `/api/rooms/[id]/status`

**Auth:** ADMIN

**Request body:**

```json
{ "roomStatus": "MAINTENANCE" }
```

---

### GET `/api/rooms/[id]/tenants`

**Auth:** ADMIN, STAFF

Lists tenants assigned to a room.

---

### GET `/api/floors`

**Auth:** ADMIN, STAFF

Returns list of floors derived from room data.

**Response:**

```json
{ "success": true, "data": [{ "floorNo": 1, "label": "ชั้น 1" }] }
```

---

## Tenants

### GET `/api/tenants`

**Auth:** ADMIN, STAFF

**Query params:** `roomId`, `lineUserId`, `search`, `page`, `pageSize`, `sortBy`, `sortOrder`

**Response:**

```json
{ "success": true, "data": { "rows": [...], "total": 50 } }
```

---

### POST `/api/tenants`

**Auth:** ADMIN

**Request body:**

```json
{
  "firstName": "สมชาย",
  "lastName": "ใจดี",
  "phone": "0812345678",
  "email": "somchai@example.com",
  "roomId": "uuid"
}
```

---

### GET `/api/tenants/[id]`

**Auth:** ADMIN, STAFF

---

### PATCH `/api/tenants/[id]`

**Auth:** ADMIN

**Request body:**

```json
{ "phone": "0812345679", "lineUserId": "U123..." }
```

---

### DELETE `/api/tenants/[id]`

**Auth:** ADMIN

Not implemented (501) — tenants have active relationships.

---

### GET `/api/tenants/[id]/line`

**Auth:** ADMIN, STAFF

Returns LINE user info for a tenant.

---

## Contracts

### GET `/api/contracts`

**Auth:** ADMIN, STAFF

**Query params:** `roomId`, `tenantId`, `status`, `expiringBefore`, `expiringAfter`, `page`, `pageSize`

**Response:**

```json
{ "success": true, "data": { "rows": [...], "total": 20 } }
```

---

### POST `/api/contracts`

**Auth:** ADMIN

**Request body:**

```json
{
  "roomId": "uuid",
  "tenantId": "uuid",
  "startDate": "2024-01-01",
  "endDate": "2025-01-01",
  "monthlyRate": 15000
}
```

---

### GET `/api/contracts/[id]`

**Auth:** ADMIN, STAFF

---

### POST `/api/contracts/[id]/renew`

**Auth:** ADMIN

Extends contract end date.

---

### POST `/api/contracts/[id]/terminate`

**Auth:** ADMIN

---

## Billing

### GET `/api/billing`

**Auth:** AUTHENTICATED (STAFF, ADMIN)

**Query params:** `roomNo`, `billingPeriodId`, `year`, `month`, `status`, `page`, `pageSize`

**Response:**

```json
{ "success": true, "data": { "rows": [...], "total": 100 } }
```

---

### POST `/api/billing`

**Auth:** ADMIN, STAFF

**Request body:**

```json
{
  "roomNo": "101",
  "billingPeriodId": "uuid",
  "year": 2024,
  "month": 6,
  "electricityFee": 1500,
  "waterFee": 300,
  "rentFee": 15000,
  "otherFees": 0
}
```

---

### GET `/api/billing/[id]`

**Auth:** AUTHENTICATED

---

### POST `/api/billing/[id]/lock`

**Auth:** ADMIN

Locks a billing record before invoice generation.

**Request body:**

```json
{ "force": false }
```

---

### POST `/api/billing/periods/[id]/generate-invoices`

**Auth:** ADMIN

Generates invoices for all LOCKED billing records in a period.

**Response:**

```json
{
  "success": true,
  "data": { "generated": 50, "skipped": 5, "errors": 0, "errorDetails": [] }
}
```

---

### GET `/api/billing/import/batches`

**Auth:** ADMIN

**Query params:** `status` (PENDING, PROCESSING, COMPLETED, FAILED), `page`, `pageSize`

**Response:**

```json
{ "success": true, "data": { "data": [...], "total": 10 } }
```

---

### POST `/api/billing/monthly-data/import`

**Auth:** ADMIN, STAFF

Import monthly billing data.

---

## Invoices

### GET `/api/invoices`

**Auth:** ADMIN, STAFF

**Query params:** `roomId`, `billingCycleId`, `year`, `month`, `status`, `page`, `pageSize`

**Response:**

```json
{ "success": true, "data": { "rows": [...], "total": 100 } }
```

---

### POST `/api/invoices/generate`

**Auth:** ADMIN

Generates an invoice from a billing record.

**Request body:**

```json
{ "billingRecordId": "uuid" }
```

---

### GET `/api/invoices/[id]`

**Auth:** ADMIN, STAFF

---

### POST `/api/invoices/[id]/send`

**Auth:** ADMIN, STAFF

Sends invoice to tenant via LINE.

**Request body:**

```json
{
  "messageTemplateId": "uuid",
  "documentTemplateId": "uuid"
}
```

**Response:**

```json
{
  "success": true,
  "data": { "invoice": {...} },
  "meta": {
    "lineConfigured": true,
    "hasLineRecipient": true,
    "deliveryStatus": "QUEUED"
  }
}
```

---

### GET `/api/invoices/[id]/pdf`

**Auth:** ADMIN, STAFF

Returns PDF of invoice.

---

### POST `/api/invoices/[id]/pay`

**Auth:** ADMIN, STAFF

Records payment for an invoice.

---

## Payments

### GET `/api/payments`

**Auth:** AUTHENTICATED

**Query params:** `status`, `page`, `pageSize`

**Response:**

```json
{ "success": true, "data": { "data": [...], "total": 100, "page": 1, "pageSize": 20 } }
```

---

### POST `/api/payments`

**Auth:** ADMIN, STAFF

**Request body:**

```json
{
  "invoiceId": "uuid",
  "amount": 15000,
  "method": "CASH",
  "paidAt": "2024-06-15T10:00:00Z"
}
```

---

### POST `/api/payments/statement-upload`

**Auth:** ADMIN, STAFF

Upload bank statement (CSV or XLSX, max 10MB) for auto-matching.

**Form field:** `file`

**Response:**

```json
{
  "success": true,
  "data": {
    "totalEntries": 20,
    "imported": 20,
    "matched": 15,
    "unmatched": 5
  }
}
```

---

### POST `/api/payments/match/confirm`

**Auth:** ADMIN, STAFF

Manually confirm a payment-invoice match.

**Request body:**

```json
{ "transactionId": "uuid", "invoiceId": "uuid" }
```

---

### POST `/api/payments/match/reject`

**Auth:** ADMIN, STAFF

Reject a matched payment.

---

## Analytics

### GET `/api/analytics/summary`

**Auth:** ADMIN, STAFF

Returns monthly revenue, invoice counts.

**Response:**

```json
{
  "success": true,
  "data": {
    "monthlyRevenue": 150000,
    "unpaidInvoices": 10,
    "paidInvoices": 45,
    "overdueInvoices": 3
  }
}
```

---

### GET `/api/analytics/revenue`

**Auth:** ADMIN, STAFF

Revenue analytics by period.

---

### GET `/api/metrics`

**Auth:** ADMIN, STAFF

System metrics.

---

## LINE

### POST `/api/line/webhook`

**Auth:** PUBLIC (LINE signature verified)

Receives LINE webhook events. Handles:
- Follow/unfollow
- Incoming text, image, sticker, postback
- Balance inquiry (`ยอดค้าง`, `ดูยอด`)
- Maintenance requests (`แจ้งซ่อม`)
- Payment confirmation postback

**Headers:** `X-Line-Signature` required

---

### POST `/api/line/rich-menu`

**Auth:** ADMIN

Creates or updates the tenant-facing rich menu.

**Response:**

```json
{ "success": true, "data": { "menuId": "...", "name": "เมนูหลัก - ยอดค้าง" } }
```

---

### DELETE `/api/line/rich-menu`

**Auth:** ADMIN

Deletes the rich menu.

---

## Conversations

### GET `/api/conversations`

**Auth:** ADMIN, STAFF

**Query params:** `page`, `pageSize`, `lineUserId`, `tenantId`

**Response:**

```json
{
  "success": true,
  "data": {
    "data": [...],
    "total": 50,
    "page": 1,
    "pageSize": 20,
    "totalPages": 3
  }
}
```

---

### PATCH `/api/conversations`

**Auth:** ADMIN, STAFF

Mark conversation messages as read.

**Query params:** `conversationId`

---

### GET `/api/conversations/[id]`

**Auth:** ADMIN, STAFF

---

### GET `/api/conversations/[id]/messages`

**Auth:** ADMIN, STAFF

---

### POST `/api/conversations/[id]/invoices/latest`

**Auth:** ADMIN, STAFF

Gets latest invoice for a conversation.

---

### POST `/api/conversations/[id]/files/send`

**Auth:** ADMIN, STAFF

Send file via LINE to conversation.

---

## Maintenance

### GET `/api/admin/maintenance`

**Auth:** ADMIN, STAFF

**Query params:** `tenantId`, `status` (OPEN, IN_PROGRESS, WAITING_PARTS, DONE, CLOSED), `pageSize`

**Response:**

```json
{ "success": true, "data": { "data": [...], "total": 10 } }
```

---

### POST `/api/admin/maintenance`

**Auth:** ADMIN

Create maintenance ticket.

---

### POST `/api/admin/maintenance/update-status`

**Auth:** ADMIN, STAFF

**Request body:**

```json
{ "ticketId": "uuid", "status": "IN_PROGRESS" }
```

---

### POST `/api/admin/maintenance/assign`

**Auth:** ADMIN

Assigns/staffs a maintenance ticket.

---

### POST `/api/admin/maintenance/comment`

**Auth:** ADMIN, STAFF

Adds comment to maintenance ticket.

---

### GET `/api/maintenance/my`

**Auth:** AUTHENTICATED (STAFF)

Returns maintenance tickets assigned to the current staff user.

---

## Documents

### POST `/api/documents/generate`

**Auth:** ADMIN, STAFF

Generate documents from template.

**Request body:**

```json
{
  "templateId": "uuid",
  "roomIds": ["uuid"],
  "data": {}
}
```

---

### POST `/api/documents/generate/batch`

**Auth:** ADMIN, STAFF

Batch document generation.

---

### GET `/api/documents`

**Auth:** ADMIN, STAFF

List generated documents.

---

### GET `/api/documents/[id]/pdf`

**Auth:** ADMIN, STAFF

Download document PDF.

---

### POST `/api/documents/[id]/send`

**Auth:** ADMIN, STAFF

Send document via LINE.

---

### POST `/api/documents/[id]/regenerate`

**Auth:** ADMIN, STAFF

---

## Templates

### GET `/api/templates`

**Auth:** ADMIN, STAFF

---

### POST `/api/templates`

**Auth:** ADMIN

---

### GET `/api/templates/[id]`

**Auth:** ADMIN, STAFF

---

### GET `/api/templates/[id]/preview`

**Auth:** ADMIN, STAFF

---

### GET `/api/templates/[id]/fields`

**Auth:** ADMIN, STAFF

---

### GET `/api/templates/[id]/editor-config`

**Auth:** ADMIN

---

### POST `/api/templates/[id]/upload`

**Auth:** ADMIN

Upload template file.

---

### GET `/api/templates/[id]/versions`

**Auth:** ADMIN

---

### POST `/api/templates/[id]/versions/[versionId]/validate`

**Auth:** ADMIN

---

### GET `/api/templates/[id]/versions/[versionId]/content`

**Auth:** ADMIN

---

### POST `/api/templates/[id]/activate-version`

**Auth:** ADMIN

---

## Message Templates

### GET `/api/message-templates`

**Auth:** ADMIN, STAFF

---

### POST `/api/message-templates`

**Auth:** ADMIN

---

### GET `/api/message-templates/[id]`

**Auth:** ADMIN, STAFF

---

### PATCH `/api/message-templates/[id]`

**Auth:** ADMIN

---

### DELETE `/api/message-templates/[id]`

**Auth:** ADMIN

---

## Admin Users

### GET `/api/admin/users`

**Auth:** ADMIN, STAFF

**Response:**

```json
{
  "success": true,
  "data": {
    "users": [...],
    "pendingRequests": [...]
  }
}
```

---

### POST `/api/admin/users`

**Auth:** ADMIN

**Request body:**

```json
{
  "username": "staff2",
  "displayName": "Staff Two",
  "email": "staff2@example.com",
  "password": "Staff@123456",
  "role": "STAFF"
}
```

---

### GET `/api/admin/users/[id]`

**Auth:** ADMIN

---

### POST `/api/admin/users/[id]/reset-password`

**Auth:** ADMIN

Reset a user's password.

---

### POST `/api/admin/registration-requests/[id]/approve`

**Auth:** ADMIN

Approve a staff registration request.

---

### POST `/api/admin/registration-requests/[id]/reject`

**Auth:** ADMIN

Reject a staff registration request.

---

## Jobs

### GET `/api/admin/jobs`

**Auth:** ADMIN, STAFF

**Response:**

```json
{
  "success": true,
  "data": {
    "jobs": [...],
    "workerAvailable": true
  }
}
```

---

### POST `/api/admin/jobs/[jobId]/run`

**Auth:** ADMIN

Manually trigger a job run.

---

## System

### GET `/api/health/deep`

**Auth:** ADMIN

Returns detailed system health including database, Redis, outbox queue, worker heartbeat.

**Response:**

```json
{
  "success": true,
  "data": {
    "status": "ok",
    "services": {
      "database": "connected",
      "redis": "connected",
      "outbox": { "queueLength": 0, "failedCount": 0 },
      "worker": { "alive": true, "lastHeartbeatMsAgo": 5000 }
    },
    "timestamp": "2024-06-15T10:00:00.000Z"
  }
}
```

---

### POST `/api/system/backup/run`

**Auth:** SYSTEM (internal) or ADMIN

Triggers a manual database backup.

**Response:**

```json
{ "success": true, "data": { "triggered": true, "durationMs": 5000, "at": "..." } }
```

---

### GET `/api/system/backup-status`

**Auth:** ADMIN

Returns backup status.

---

### GET `/api/system/alerts`

**Auth:** ADMIN

---

### GET `/api/admin/dashboard-alerts`

**Auth:** ADMIN

---

### GET `/api/admin/setup/status`

**Auth:** ADMIN

---

### POST `/api/admin/setup/reset`

**Auth:** ADMIN

Resets system setup state.

---

## Tenant Registrations

### GET `/api/tenant-registrations`

**Auth:** ADMIN

List pending tenant registration requests.

---

### POST `/api/tenant-registrations`

**Auth:** PUBLIC

Tenant self-registration.

---

## Files

### GET `/api/files/[...key]`

**Auth:** AUTHENTICATED

Serve uploaded file by key.

---

### POST `/api/files`

**Auth:** ADMIN, STAFF

Upload a file.

---

## Chat

### POST `/api/chat/reply`

**Auth:** ADMIN, STAFF

Send a chat reply to a conversation.

---

### POST `/api/chat/quick-reply`

**Auth:** ADMIN, STAFF

Send a quick reply preset.

---

## Delivery Orders

### GET `/api/delivery-orders`

**Auth:** ADMIN, STAFF

---

### POST `/api/delivery-orders`

**Auth:** ADMIN, STAFF

Create a delivery order.

---

### GET `/api/delivery-orders/[id]`

**Auth:** ADMIN, STAFF

---

### POST `/api/delivery-orders/[id]/send`

**Auth:** ADMIN, STAFF

Send delivery order via LINE.

---

### POST `/api/delivery-orders/[id]/items/[itemId]/resend`

**Auth:** ADMIN, STAFF

Resend a specific item.

---

## Admin Settings

### GET `/api/admin/settings`

**Auth:** ADMIN

---

### PATCH `/api/admin/settings`

**Auth:** ADMIN

Update system settings.
