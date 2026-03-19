# Security & Data Integrity Stabilization Report

## Scope
- Workspace: `apps/erp`
- Phase: release-blocking authentication, authorization, payment integrity, billing durability, audit trust, file/message security, and conversation contract stabilization
- Route inventory: [security-route-inventory.md](./security-route-inventory.md)

## Root Cause Summary
1. API auth was inconsistent because many back-office routes relied on page middleware or ad hoc checks instead of a shared API-boundary policy.
2. Some privileged paths trusted the plain `role` cookie instead of the signed `auth_session`.
3. Payment state integrity was wrong because invoice settlement logic treated any confirmed payment as full settlement.
4. Billing lock durability was wrong because invoice-generation dispatch depended on in-process event publishing instead of a transactional outbox write.
5. Audit actor trust was wrong because some mutation routes accepted actor identity from request payloads or defaulted to `system`.
6. File and outbound messaging surfaces were too open because raw file keys and send/enqueue routes were callable without verified operator context.
7. Conversation detail drifted from the canonical message contract because it reshaped messages independently of the paginated message endpoint.

## Code Changes

### Central auth and verified actor
- `src/lib/auth/api-policy.ts`
- `src/lib/auth/guards.ts`
- `src/lib/auth/session.ts`
- `src/lib/utils/errors.ts`

### Billing durability
- `src/modules/billing/billing.service.ts`
- `src/app/api/billing/[id]/lock/route.ts`

### Payment integrity
- `src/modules/payments/invoice-payment-state.ts`
- `src/modules/payments/payment.service.ts`
- `src/modules/payments/payment-matching.service.ts`
- `src/app/api/payments/route.ts`
- `src/app/api/payments/statement-upload/route.ts`

### Audit actor trust
- `src/app/api/admin/maintenance/assign/route.ts`
- `src/app/api/admin/maintenance/comment/route.ts`
- `src/app/api/admin/maintenance/update-status/route.ts`
- `src/app/api/chat/reply/route.ts`
- `src/app/api/conversations/[id]/messages/route.ts`
- `src/app/api/reminders/send/route.ts`
- `src/app/api/receipts/[id]/send/route.ts`
- `src/app/api/tenants/[id]/notify/route.ts`
- `src/app/api/document-templates/route.ts`
- `src/app/api/document-templates/[id]/route.ts`

### File and messaging security
- `src/lib/files/access.ts`
- `src/lib/onlyoffice/documents.ts`
- `src/app/api/files/[...key]/route.ts`
- `src/app/api/messages/send-file/route.ts`
- `src/app/api/conversations/[id]/files/send/route.ts`
- `src/app/api/system/backup/run/route.ts`

### Conversation contract
- `src/modules/messaging/message-dto.ts`
- `src/app/api/conversations/[id]/route.ts`
- `src/app/api/conversations/[id]/messages/route.ts`

### Plain-cookie privilege removal / route hardening
- `src/app/api/tenants/[id]/route.ts`

## Tests Added or Updated
- `tests/helpers/auth.ts`
- `tests/mocks/prisma.ts`
- `tests/api/supertest-routes.test.ts`
- `tests/api/payments.test.ts`
- `tests/payments.test.ts`
- `tests/api/payment-duplicate.test.ts`
- `tests/payment-integrity.test.ts`
- `tests/integration/billing-race-condition.test.ts`
- `tests/integration/billing-lock-durability.integration.test.ts`
- `tests/security/api-auth-boundary.test.ts`
- `tests/security/audit-actor-trust.test.ts`
- `tests/security/file-message-auth.test.ts`
- `tests/api/conversation-contract.test.ts`
- `tests/api/conversation-detail.test.ts`
- `tests/api/conversation-send-file.test.ts`
- `tests/api/files-upload.test.ts`
- `tests/api/files-upload-limit.test.ts`
- `tests/api/backup-run.test.ts`
- `tests/documents-generate-route.test.ts`
- `tests/maintenance.test.ts`
- `tests/admin-reply.test.ts`
- `tests/api/tenant-notify.test.ts`

## Validation
- `npm test`
  - Passed: `87` files, `241` tests
- `npm run lint`
  - Passed
- `npm run build`
  - Passed

## Explicit Proof Coverage
- Auth boundary:
  - anonymous denied
  - forged plain role cookie denied
  - insufficient role denied
  - signed operator/admin allowed
  - proof files: `tests/security/api-auth-boundary.test.ts`, `tests/api/supertest-routes.test.ts`
- Payment semantics:
  - partial / exact / overpay / multiple payments
  - proof file: `tests/payment-integrity.test.ts`
- Durable billing flow:
  - lock state + invoice-generation request written via outbox
  - race guarded to single winner
  - proof files: `tests/integration/billing-lock-durability.integration.test.ts`, `tests/integration/billing-race-condition.test.ts`
- Audit actor trust:
  - spoofed actor payload fields ignored in favor of verified session actor
  - proof file: `tests/security/audit-actor-trust.test.ts`
- File/message security:
  - anonymous file download denied unless signed URL
  - anonymous outbound file enqueue denied
  - proof files: `tests/security/file-message-auth.test.ts`, `tests/api/files-upload.test.ts`
- Conversation contract:
  - detail and paginated messages endpoints share one canonical DTO preserving `metadata.status`
  - proof files: `tests/api/conversation-contract.test.ts`, `tests/api/conversation-detail.test.ts`

## Remaining Risks
- The route inventory `Audit` column is route-local. Some domain services still own audit writes, so that column is conservative rather than exhaustive.
- Public routes intentionally remain public for health checks, auth flows, LINE webhooks, ONLYOFFICE callbacks, invoice public PDF/view endpoints, and legacy tenant maintenance submission paths.
- The shared auth policy now protects routes that flow through `asyncHandler`; future API routes that bypass that wrapper would need the same boundary discipline or they could regress.
