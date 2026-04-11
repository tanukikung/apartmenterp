---
name: LINE Invoice & Balance Inquiry
description: >
  Enables tenants to check their outstanding balance by sending "ยอดค้าง" (or similar
  trigger words) via LINE. The bot replies with a summary of the most recent unpaid
  invoice (invoice number, due date, amount, status, period) and a Flex message
  card with a "ชำระเงิน" (pay now) URI button. Also includes a configurable LINE Rich
  Menu with "ดูยอดค้าง" and "ยืนยันชำระเงิน" tap targets. Admin-only endpoints are provided
  to create/delete the Rich Menu.
type: reference
---

# LINE Invoice & Balance Inquiry Feature

## Feature Summary

When a tenant sends one of the trigger phrases (`ยอดค้าง`, `ดูยอด`, `ยอดค้างชำระ`, `ใบแจ้งหนี้`, `ดูใบแจ้งหนี้`)
to the LINE bot, the system:

1. Looks up the tenant's room from `Conversation.lineUserId` or `LineUser → Tenant → RoomTenant`
2. Finds the most recent invoice with status `GENERATED | SENT | VIEWED | OVERDUE`
3. Replies with a Thai-language summary text including invoice number, due date, amount, and status
4. Follows up with a Flex message card that has a **ชำระเงิน** URI button (links to the signed PDF invoice URL)

If no unpaid invoice exists, replies with a clear "ไม่มียอดค้าง" message.
If the LINE account is not linked to a room, replies with a "ไม่ได้ลงทะเบียน" message.

## New Files

| File | Purpose |
|------|---------|
| `src/modules/invoices/balance-inquiry.ts` | Core inquiry logic — looks up tenant's room and most recent unpaid invoice |
| `src/app/api/line/rich-menu/route.ts` | Admin-only endpoint to create/delete LINE Rich Menu for balance inquiry |

## Modified Files

| File | Change |
|------|--------|
| `src/app/api/line/webhook/route.ts` | Added `handleBalanceInquiry()` handler; text trigger detection for inquiry phrases; fixed `view_invoice` postback to use `encodeURIComponent` |
| `src/modules/invoices/index.ts` | Re-exports `BalanceInquiryResult` type and `getLatestUnpaidInvoiceForLineUser` |

## API Endpoints

### `POST /api/line/rich-menu`
- **Auth**: ADMIN only
- **Purpose**: Creates or updates the LINE Rich Menu (idempotent — uses named match)
- **Response**: `{ success: true, data: { menuId, name } }`

### `DELETE /api/line/rich-menu`
- **Auth**: ADMIN only
- **Purpose**: Deletes the balance inquiry Rich Menu by name
- **Response**: `{ success: true, data: {} }`

## LINE Rich Menu Layout

```
[  ดูยอดค้าง  ] [ ยืนยันชำระเงิน ]
```

- Left cell: `type: "message"`, text `"ยอดค้าง"` → triggers balance inquiry
- Right cell: `type: "postback"`, data `"action=confirm_payment_inquiry"` → triggers confirm payment flow

## Trigger Words

`['ยอดค้าง', 'ดูยอด', 'ยอดค้างชำระ', 'ใบแจ้งหนี้', 'ดูใบแจ้งหนี้']`

## Reply Format

**Outstanding invoice found:**
```
📊 สรุปยอดค้าง — ห้อง 101

🔖 เลขที่ใบแจ้งหนี้: INV-202604-101
📅 ครบกำหนดชำระ: 2026-04-10
💰 ยอดค้าง: ฿18,500.00
📌 สถานะ: เกินกำหนด

📋 ระยะเวลา: เมษายน 2569
```

Plus a Flex card with a `ชำระเงิน` URI button.

**No outstanding balance:**
```
✅ ห้อง 101 — ไม่มียอดค้างชำระ ณ ขณะนี้ค่ะ
```

**Not linked:**
```
❌ บัญชี LINE นี้ยังไม่ได้ลงทะเบียนกับห้องพัก กรุณาติดต่อเจ้าหน้าที่เพื่อลงทะเบียนค่ะ
```

## Dependencies

- `getLatestUnpaidInvoiceForLineUser()` uses existing Prisma models: `Conversation`, `LineUser`, `Tenant`, `RoomTenant`, `Room`, `Invoice`
- PDF URL uses `buildInvoiceAccessUrl()` from `@/lib/invoices/access`
- LINE replies via `sendReplyMessage()`, `sendFlexMessage()`, `sendTextWithQuickReply()` from `@/lib`

## Test File

`tests/line-balance-inquiry.test.ts` — tests trigger dispatch, unpaid invoice lookup, not-linked response, and no-outstanding response.
