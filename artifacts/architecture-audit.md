# Architecture Audit — Apartment ERP

Scope: apps/erp (Next.js 14, TypeScript, Prisma, PostgreSQL, LINE API)

Date: 2026-03-13

## Summary

- Implemented environment safety with centralized validation and degraded health fallback.
- Replaced ad-hoc DB push with migration artifacts and workflow.
- Hardened billing arithmetic with Decimal and transactional updates.
- Ensured atomic outbox writes for critical flows with retry-safe processor.
- Introduced minimal admin auth guard for API endpoints (opt-in via env).
- Resolved room capacity naming via stable mapping (capacity ↔ maxResidents).
- Added invoice lifecycle timestamp (issuedAt).
- Added health endpoint with env/db/app status.
- Added initial test coverage with Vitest.

## Findings

### Unsafe Casts / Potential Runtime Errors

- Billing arithmetic previously relied on JS number multiplication, causing floating-point errors. Fixed via Decimal and string persistence for money fields.
- Event payload types were loosely typed; ensured Prisma.InputJsonValue when writing to outbox.
- Room capacity mismatch addressed by consistently mapping API field `capacity` to DB `maxResidents`.

### Transaction Safety

- Billing:
  - Added transactions around record creation (+ rent item), item add/update/remove, and locking. Outbox events are now created within the same transaction.
- Invoices:
  - Generation now creates invoice, version, status update, and outbox write atomically.
- Tenants:
  - Room assignment and removal now use transactions, including room status updates and outbox events.

### Outbox Reliability

- Processor:
  - Idempotency set guards intra-process duplication.
  - Max retry with retryCount increment and processedAt markers implemented.
  - Structured logging added for start, processing, and errors.
- Writers:
  - All critical domain changes now write outbox events inside DB transactions.

### Unused Code / Architecture Violations

- No major unused modules detected during build/lint.
- Keep strict layering: modules use services + lib; avoid bypassing event bus.

### Domain Duplication

- Money calculations centralized in `src/lib/utils/money.ts` to avoid repeated ad-hoc rounding logic.

## Recommendations

- Consider adding exponential backoff strategy or next-attempt timestamps for outbox retries at scale.
- Add integration tests with a disposable PostgreSQL for service-level behaviors.
- Extend coverage to payment matching when implemented.
- Consider enabling TypeScript strict mode in tsconfig once broader refactors are complete.

## Implemented Changes (Highlights)

- Env validation: `src/lib/config/env.ts`
- Auth guard: `src/middleware.ts`
- Health endpoint: `src/app/api/health/route.ts`
- Billing service: Decimal + transactions + outbox
- Invoice service: transactional generation + outbox
- Tenant service: transactional assign/remove + outbox
- Money utils + tests
- Vitest configuration & tests
- Prisma migrations bootstrap (`prisma/migrations/0001_init/migration.sql`)

All changes were verified with lint, build, and vitest.
