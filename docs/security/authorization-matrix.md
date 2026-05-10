# Authorization Matrix — Apartment ERP

## Overview

All write routes are protected by cookie-session auth + role guards.
No fine-grained permission system exists; role-based guards (`requireRole`, `requireOwner`, `requireOwnerOrAdmin`) are used throughout.

## Role Definitions

| Role | Description |
|------|-------------|
| OWNER | Building owner — full access |
| ADMIN | System administrator — full access except certain owner-only operations |
| STAFF | Staff member — access to operational routes (payments, moveouts, invoice send) but not administrative or financial operations |

## Auth Mechanism

- **Cookie session**: `auth_session` cookie containing a signed JWT
- **Guard chain**: `requireAuthSession` → role check → (optional) building access check
- **System actors**: Cron routes accept `x-cron-secret` header and bypass session auth

## Route Authorization Table

| Method | Path | Required Roles | Staff Allowed? | Guard |
|--------|------|----------------|----------------|-------|
| POST | /api/payments | ADMIN, STAFF, OWNER | YES | `requireRole` via `getVerifiedActor` |
| POST | /api/contracts | ADMIN, OWNER | NO | `requireRole` + `requireBuildingAccess` |
| POST | /api/broadcast | ADMIN, OWNER | NO | `requireRole` |
| POST | /api/billing/wizard (create-period) | OWNER, ADMIN, STAFF | YES | `requireOperator` |
| POST | /api/billing/monthly-data/import/execute | ADMIN, STAFF, OWNER | YES | `requireRole` |
| POST | /api/billing/periods/[id]/close | ADMIN, OWNER | NO | `requireRole` |
| POST | /api/billing/periods/[id]/lock | ADMIN, OWNER | NO | `requireRole` |
| POST | /api/billing/periods/[id]/lock-all | ADMIN, OWNER | NO | `requireRole` |
| POST | /api/billing/periods/[id]/archive | ADMIN, OWNER | NO | `requireRole` |
| POST | /api/billing/periods/[id]/generate-invoices | ADMIN, OWNER | NO | `requireRole` |
| POST | /api/invoices/[id]/send | ADMIN, STAFF, OWNER | YES | `requireRole` |
| POST | /api/moveouts | ADMIN, STAFF, OWNER | YES | `requireRole` |
| POST | /api/moveouts/[id]/confirm | ADMIN, STAFF, OWNER | YES | `requireRole` |
| POST | /api/moveouts/[id]/refund | ADMIN, STAFF, OWNER | YES | `requireRole` |
| POST | /api/moveouts/[id]/cancel | ADMIN, STAFF, OWNER | YES | `requireRole` |
| POST | /api/admin/audit-logs/verify-chain | OWNER, ADMIN | NO | `requireOwnerOrAdmin` |
| POST | /api/admin/registration-requests/[id]/approve | ADMIN, OWNER | NO | `requireRole` |

## Guard Functions Reference

| Function | Allowed Roles | Use Case |
|----------|---------------|----------|
| `requireAuthSession` | Any authenticated | Basic session check |
| `requireRole(roles)` | Configurable | General role check |
| `requireOperator` | OWNER, ADMIN, STAFF | Operational routes |
| `requireOwner` | OWNER only | Owner-exclusive operations |
| `requireOwnerOrAdmin` | OWNER, ADMIN | Admin or owner operations |
| `requireBuildingAccess(session, resourceBuildingId)` | — | Building isolation (failsafe) |
| `getVerifiedActor` | Configurable + system | Audit actor identification |

## Security Properties

1. Unauthenticated requests → 401 UnauthorizedError
2. Authenticated wrong role → 403 ForbiddenError
3. Session buildingId mismatch → 403 ForbiddenError (when building-scoped)
4. Force-password-change sessions blocked on all non-exempt write routes
5. Cron system actors bypass session auth via `x-cron-secret`
