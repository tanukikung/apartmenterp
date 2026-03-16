# Repository Audit — Apartment ERP

Scope: apps/erp (Next.js 14, TypeScript, Prisma, PostgreSQL, Vitest, Tailwind)
Date: 2026-03-13

## Architecture Risks
- Event publishing occurs outside DB transactions in multiple services, risking non-atomic domain changes vs. event emissions.
- Several domain changes publish directly to the in-process event bus without writing to the outbox, breaking the outbox pattern for external effects.
- External side effects executed inline in services (e.g., LINE send during invoice send) risk timeouts, retries, and partial failures.
- Prisma helper exposes unsafe rawQueryUnsafe; although unused, it increases attack surface if referenced.
- TypeScript strict mode is disabled, diverging from blueprint and allowing implicit any/loose narrowing.
- Lack of event subscribers means emitted in-process events may have no effect; only outbox-driven processing ensures delivery.

## Unsafe Casts and Conversions
- Widespread use of `as unknown as` and forced casts to Prisma.InputJsonValue in outbox writes.
- Frequent `Number()` conversions of Decimal fields in event payload snapshots; acceptable for payloads but must never feed back into persistence.
- Currency formatting utilities include `parseFloat` for display; acceptable for UI strings but must not be reused for calculations.

## Broken or Weak Transaction Flows
- Room service: create/update/status-change perform DB writes and then publish events without outbox writes in the same transaction.
- Tenant service: create publishes event post-write without outbox; assignment/removal already use transactions and outbox.
- Contract service: renew/terminate update multiple tables and publish events without outbox writes in the same transaction.
- Invoice service: generation uses a transaction with outbox; sending performs external call inline and publishes, not outbox-first.

## Outbox Gaps
- Missing outbox writes for: RoomCreated, RoomUpdated, RoomStatusChanged, TenantCreated, ContractCreated/Renewed/Terminated/Expired, InvoiceSent/Viewed/Paid.
- Outbox processor exists but no global bootstrap to start it in runtime; ensure a deploy-mode worker runs it.

## Domain Rule Observations
- Room capacity mapped to DB `maxResidents`; creation/update convert capacity ↔ maxResidents consistently.
- Tenant assignment enforce max tenants and exactly one PRIMARY; implemented with transaction and room status update.
- Invoice generation creates versioned records and writes outbox; version uniqueness enforced per invoice.

## Potential Runtime Crashes/Instability
- External LINE send inside invoice send path can throw and delay request; handled with try/catch but still mixes concerns.
- Lack of transactional boundary around contract renew/terminate can leave inconsistent states on partial failures.
- Absence of strict TypeScript increases risk of runtime type mismatches.

## Security Baseline
- API middleware checks x-admin-token when configured; health endpoint bypasses auth.
- No direct user SQL input; presence of rawQueryUnsafe helper is noted; no production usage detected.
- Input validation with Zod for DTOs and API query parameters is used broadly.

## Recommendations
- Add outbox writes inside the same transactions for room, tenant create, contract renew/terminate, and invoice send/view/paid flows.
- Remove inline external calls from services; trigger via outbox and dedicated handlers/workers.
- Introduce a worker or server-side job to run the outbox processor in deploy environments.
- Keep Decimal arithmetic only in money utils and persistence; never use float arithmetic for domain state.
- Plan transition to TypeScript strict with incremental fixes after stabilizing transactions/outbox.
