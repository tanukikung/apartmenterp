# Smoke Test Checklist

Run this after every deploy to a new environment. Mark each item pass/fail.

**Preconditions:** database migrated, seed run, server reachable at `$APP_BASE_URL`.

---

## 1. Login

- [ ] Navigate to `/login`
- [ ] Enter `owner` / `Owner@12345` → redirected to `/admin/dashboard`
- [ ] Verify username displayed in top-right or nav
- [ ] Log out → redirected to `/login`
- [ ] Attempt login with wrong password → error message shown, not logged in
- [ ] Log back in as `owner` for remaining steps

---

## 2. Dashboard

- [ ] Navigate to `/admin/dashboard`
- [ ] KPI cards render without errors (Rooms, Tenants, Revenue, Open Tickets)
- [ ] No `NaN` or `undefined` values visible
- [ ] Recent activity or quick-action section visible

---

## 3. Room Detail

- [ ] Navigate to `/admin/rooms`
- [ ] Room list loads (239 rooms expected on fresh seed)
- [ ] Click any room → detail page loads
- [ ] Room status, floor, and room number displayed correctly
- [ ] If room has a tenant: tenant name and contract dates shown

---

## 4. Tenant Registration

- [ ] Navigate to `/admin/tenant-registrations`
- [ ] Page loads without error
- [ ] If a pending registration exists: Approve and Reject buttons present
- [ ] Create a test registration via `/sign-up` (tenant-facing) and verify it appears in the admin queue
- [ ] Approve the registration → status changes to Approved

---

## 5. Billing Import

- [ ] Navigate to `/admin/billing/import`
- [ ] Upload the sample template from `/billing-import-template.xlsx` (or `.md`)
- [ ] Preview step shows parsed rows
- [ ] Confirm import → success message with count of created billing items
- [ ] Navigate to `/admin/billing` → new batch appears in list

---

## 6. Document Generation and Send

### Document Template

- [ ] Navigate to `/admin/document-templates`
- [ ] Create a new template: Type = `INVOICE`, body = `Payment due within 7 days.`
- [ ] Template appears in list

### Invoice PDF

- [ ] Navigate to `/admin/invoices`
- [ ] Open any invoice with status `GENERATED` or `SENT`
- [ ] Click Download PDF (or `GET /api/invoices/[id]/pdf`)
- [ ] PDF downloads and opens without error
- [ ] If a Document Template of type `INVOICE` exists: Notes/Terms section appears at the bottom of the PDF
- [ ] Response header `x-document-template-id` is present (check browser DevTools → Network → response headers)

### Invoice Send (LINE)

- [ ] With LINE credentials configured: click Send on an invoice
- [ ] Audit log entry created (visible in `/admin/audit-logs`)
- [ ] Without LINE credentials: send completes without error; outbox event created but not dispatched

---

## 7. Payment Upload, Review, and Match

### Upload

- [ ] Navigate to `/admin/payments/upload-statement`
- [ ] Select a CSV or Excel bank statement file
- [ ] Preview step shows first rows
- [ ] Click Import → success banner shows `X transaction(s) saved. Y auto-matched, Z pending review.`
- [ ] "Review Queue" button links directly to `/admin/payments/review-match`

### Review and Match

- [ ] Navigate to `/admin/payments/review-match`
- [ ] Unmatched transactions listed
- [ ] Click Confirm Match on a transaction → status updates to Matched
- [ ] Click Reject on a transaction → transaction removed from queue or marked Rejected
- [ ] Navigate to `/admin/payments` → matched payment appears in list

---

## 8. Overdue Reminder

- [ ] Navigate to `/admin/overdue`
- [ ] Overdue invoices listed (if any exist)
- [ ] Click Send Reminder for one invoice
- [ ] With LINE configured: LINE message dispatched
- [ ] Without LINE: action completes silently; audit log entry created
- [ ] Audit log at `/admin/audit-logs` shows `REMINDER_SENT` or equivalent entry

---

## 9. Chat

- [ ] Navigate to `/admin/chat`
- [ ] Conversation list loads (may be empty on fresh install)
- [ ] Message template dropdown loads saved templates from DB (not hardcoded stubs)
- [ ] Select a conversation → message history shown
- [ ] Type a message and send → message appears in timeline
- [ ] With LINE configured: message dispatched to tenant's LINE

---

## 10. Settings Update

- [ ] Navigate to `/admin/settings`
- [ ] Current billing day, due day, overdue day displayed
- [ ] Change billing day to `5` → Save → success confirmation
- [ ] Reload page → new value persists
- [ ] Verify unknown/extra fields are rejected: `PUT /api/admin/settings` with `{ billingDay: 1, dueDay: 5, overdueDay: 15, injected: true }` → returns `400`

---

## 11. Reports

- [ ] Navigate to `/admin/reports` (or individual report pages)
- [ ] Revenue report loads without error
- [ ] Occupancy report loads without error
- [ ] Collection report loads without error
- [ ] Audit log report at `/admin/audit-logs` shows recent activity from steps above

---

## 12. System Health

- [ ] `GET /api/health` → `{ "status": "ok" }` (200)
- [ ] `GET /api/health/deep` → returns without 500 error
- [ ] `GET /api/metrics` → returns memory, uptime, DB stats
- [ ] Navigate to `/admin/system` → health indicators green
- [ ] If `STORAGE_DRIVER=local`: upload a file via `/admin/documents` → file stored and retrievable
- [ ] Check application logs for any ERROR-level entries from startup sequence

---

## Sign-off

| Tester | Date | Environment | Result |
|--------|------|------------|--------|
| | | | Pass / Fail |
