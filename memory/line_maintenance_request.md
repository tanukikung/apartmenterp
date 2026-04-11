---
name: LINE Maintenance Request Feature
description: Allows tenants to submit maintenance requests via LINE chat — send description + photo → system creates ticket and notifies staff
type: reference
---

# LINE Maintenance Request Feature

## Overview
Tenants can submit maintenance requests directly through the LINE bot. The flow is triggered when a tenant sends "แจ้งซ่อม" or presses the corresponding rich menu option.

## Flow

1. Tenant sends "แจ้งซ่อม" → bot greets with room/tenant confirmation + prompts for description
2. Tenant sends description text → bot acknowledges, prompts for optional photos
3. Tenant sends photos (optional) → bot stores message IDs
4. Tenant sends "เสร็จสิ้น" or "ยืนยัน" → bot creates `MaintenanceTicket` in DB, notifies staff via LINE push, confirms to tenant

## Files

- **Core module**: `src/modules/line-maintenance/index.ts`
  - `startMaintenanceRequest(lineUserId)` — begins the flow, stores AWAITING_DESCRIPTION state
  - `handleMaintenanceRequestMessage(lineUserId, text)` — state machine for text messages
  - `handleMaintenanceRequestImage(lineUserId, imageMessageId)` — stores image message IDs
  - `finalizeMaintenanceRequest(lineUserId)` — creates ticket + notifies staff
  - `getMaintenanceRequestState(lineUserId)` — exported for webhook gate check
  - `clearMaintenanceRequest(lineUserId)` — clears state on cancel/complete

- **Webhook integration**: `src/app/api/line/webhook/route.ts`
  - Text "แจ้งซ่อม" → starts maintenance flow
  - Text during active flow → `handleMaintenanceRequestMessage`
  - Image during active flow → `handleMaintenanceRequestImage`
  - Completion signal "เสร็จสิ้น" → finalize + ticket creation

- **Tests**: `tests/line-maintenance.test.ts`

## State Machine

```
AWAITING_DESCRIPTION ──text──► DESCRIPTION_PROVIDED
                              ├──image──► (accumulate images)
                              └──"เสร็จสิ้น"──► finalize + clear
```

**Cancel**: "ยกเลิก" at any step clears state and confirms cancellation.

## Image Handling
Images are not downloaded at webhook time (avoids blocking the reply). Instead, the LINE message ID is stored. At finalize time, `getMessageContent()` is called to validate the image exists. The LINE CDN URL (`https://obs.line-scdn.net/{messageId}`) is used as the attachment URL (publicly accessible without auth).

## Staff Notification
On ticket creation, a push message is sent to `LINE_USER_ID` (the system staff account) containing:
- Tenant name, room number, priority, description, admin link

## Ticket Data
- `title`: `แจ้งซ่อมจาก LINE — ห้อง {roomNo}`
- `description`: tenant-supplied text
- `priority`: MEDIUM (default)
- `attachments`: LINE CDN URLs for each image
