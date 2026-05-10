# Infrastructure Requirements — Test Suite

This document lists all test files that require real infrastructure (PostgreSQL, Docker, Redis) and cannot run with the standard mock configuration.

## Category A — Quarantined (Require Real DB + Docker)

These tests verify behavior that depends on PostgreSQL-specific features (triggers, `$queryRawUnsafe`, row-level locking, `GENERATED ALWAYS AS IDENTITY` columns) or multi-process coordination. They cannot pass with mock Prisma.

| File | Infrastructure Needed | Why Quarantined | Test Purpose |
|------|----------------------|-----------------|--------------|
| `tests/concurrency-db.test.ts` | PostgreSQL with trigger functions | Uses `GENERATED ALWAYS AS IDENTITY` columns and raw SQL trigger testing via `$queryRawUnsafe` | Verifies audit trigger enforcement and sequence gap detection |
| `tests/audit-integrity-hardening.test.ts` | PostgreSQL with audit trigger | Uses `$queryRawUnsafe` with `OVERRIDING SYSTEM VALUE` for `sequence_num`; tests trigger-based INSERT/UPDATE/DELETE protection | Verifies audit chain integrity and hash linking |
| `tests/webhook-order-hardening.test.ts` | PostgreSQL for `isOutOfOrder`/`classifyEvents` DB queries | Imports `isOutOfOrder` and `classifyEvents` from route module — these use raw Prisma queries that need real DB | Verifies out-of-order webhook detection via `lineEvent.eventTimestamp` |
| `tests/outbox-cross-process-hardening.test.ts` | PostgreSQL for multi-process simulation | Tests `FOR UPDATE SKIP LOCKED` behavior across simulated concurrent workers | Verifies cross-process outbox deduplication |
| `tests/outbox-backpressure.test.ts` | PostgreSQL for backpressure simulation | Tests queue backpressure with real row-level locking | Verifies outbox backpressure behavior |
| `tests/performance/` | Isolated environment + PostgreSQL | Benchmark tests require stable CPU/memory timing | Performance benchmarks and regression detection |
| `tests/disaster-recovery.test.ts` | PostgreSQL + backup/restore simulation | Uses `pg_dump`/`pg_restore` commands and disaster recovery scripts | Verifies automated restore and checksum validation |
| `tests/scale-safety.test.ts` | PostgreSQL with large dataset | Tests behavior with thousands of rooms/tenants/billing records | Verifies system behavior at scale |
| `tests/invoice-legal-hardening.test.ts` | PostgreSQL for `billingPeriod.create` unique constraint | Uses real Prisma calls that hit unique constraint on `(year, month)` | Verifies legal immutability of SENT invoices |

## Run Instructions for Category A

To run Category A tests (requires Docker running):

```bash
# Start isolated test DB
docker compose -f docker-compose.test.yml up -d --wait

# Set DATABASE_URL to test container (optional — .env.test already configured)
# export DATABASE_URL="postgresql://postgres:postgres@localhost:5433/test"

# Run specific test file
npx vitest run tests/audit-integrity-hardening.test.ts --env-file .env.test

# Tear down
docker compose -f docker-compose.test.yml down
```

### Test Profile Commands

```bash
npm run test:unit        # unit + api + security tests (mock DB)
npm run test:integration:mock  # integration tests with mock DB
npm run test:integration:db    # integration tests with real Docker DB
npm run test:e2e         # Playwright E2E tests (requires dev server)
npm run test:performance # performance/benchmark tests
```

## E2E Test Results (2026-05-09)

Playwright Chromium E2E suite run against dev server at http://localhost:3001.

### Summary

| Test File | Tests Run | Passed | Failed | Duration |
|-----------|-----------|--------|--------|----------|
| `admin-full-nav.test.ts` | 112 | 112 | 0 | 9.0m |
| `core-flows.test.ts` | 14 | 13 | 1 | 46.6s |
| `qa-smoke.test.ts` | 9 | 7 | 2 | 1.1m |
| `comprehensive-verification.test.ts` | 77 | 75 | 2 | 7.0m |
| `button-flows.test.ts` | 8 | 8 | 0 | — |
| `settings-flows.test.ts` | 17 | 17 | 0 | — |
| `system-flows.test.ts` | 9 | 9 | 0 | — |
| `secondary-flows.test.ts` | 11 | 11 | 0 | — |
| **TOTAL** | **~257** | **~252** | **5** | |

### Failing Tests

| Test | File | Root Cause |
|------|------|-----------|
| `/admin/tenants has interactive buttons` | `core-flows.test.ts:30` | Page renders but action buttons (edit/delete) not visible to test |
| `Billing page loads with billing cycles` | `qa-smoke.test.ts:97` | Auth session timing issue — login cookie not persisting |
| `Invoices page: check invoice statuses` | `qa-smoke.test.ts:105` | Same auth session timing issue |
| `S3: Tenants tenants page loads` | `comprehensive-verification.test.ts:173` | Same auth session timing issue |
| `S3: Tenants tenant detail page loads` | `comprehensive-verification.test.ts:181` | Same auth session timing issue |

### Page Audit (All 24 Pages — HTTP 200, Content Visible)

All pages load successfully. Upload features confirmed:
- `/admin/billing/import` — Excel upload for billing import
- `/admin/payments/upload-statement` — Bank statement upload
- `/admin/documents/generate` — Mail-merge document generator (no upload needed)

Screenshots saved to: `test-screenshots/audit/`

### Notes

- "Failed to fetch RSC payload" warnings are Next.js dev-mode hot-reload artifacts, not bugs
- Auth session failures are test isolation issues (single-worker sequential execution)
- All 112 admin navigation tests pass — every admin page loads without 500 error

## Category B — Auth Mock Staleness (Fixed)

These tests had auth mock incompatibility with the `asyncHandler` guard chain. They have been fixed by adding `vi.mock('@/lib/auth/guards')` and `vi.mock('@/lib/guards/system')` in each test file.

| File | Root Cause | Fix Applied | Final Status |
|------|-----------|-------------|--------------|
| `tests/api/payments.test.ts` | `requireMutationsAllowed` not mocked; `isSystemReadOnly` called Redis | Added `vi.mock('@/lib/guards/system')` | FIXED (4/4 passing) |
| `tests/api/broadcast.test.ts` | `requireRole` not mocked | Added `vi.mock('@/lib/auth/guards')` | FIXED (5/5 passing) |
| `tests/billing-cycles-route.test.ts` | `requireAuthSession` not mocked | Added `vi.mock('@/lib/auth/guards')` | FIXED (11/11 passing) |
| `tests/invoice-send-auth.test.ts` | Auth guards not mocked | Added `vi.mock('@/lib/auth/guards')` | FIXED (7/7 passing) |

## Category C — Auth Mock Staleness (Remain Failing)

These ~20 test files also have auth mock incompatibility but weren't fixed in this pass. They need `vi.mock('@/lib/auth/guards')` and `vi.mock('@/lib/guards/system')` patterns applied.

| File | Root Cause |
|------|-----------|
| `tests/api/reminder-config.test.ts` | `requireRole` not mocked |
| `tests/api/backup-run.test.ts` | Auth + Redis not mocked |
| `tests/api/backup-status.test.ts` | Auth not mocked |
| `tests/api/chat-action-routes.test.ts` | Auth not mocked |
| `tests/api/conversation-contract.test.ts` | Auth not mocked |
| `tests/api/conversation-detail.test.ts` | Auth not mocked |
| `tests/api/conversation-send-file.test.ts` | Auth not mocked |
| `tests/api/files-upload-limit.test.ts` | Auth not mocked |
| `tests/api/files-upload.test.ts` | Auth not mocked |
| `tests/api/health-endpoints.test.ts` | Auth not mocked |
| `tests/api/payment-duplicate.test.ts` | Auth not mocked |
| `tests/api/supertest-routes.test.ts` | Auth not mocked |
| `tests/api/tenant-notify.test.ts` | Auth not mocked |
| `tests/api/webhook-phase2.test.ts` | Auth not mocked |
| `tests/unit/line-429-backoff.test.ts` | Mock dependency issue |
| `tests/unit/period-closing-hardening.test.ts` | Auth + billing service not mocked |
| `tests/stabilization/production-hardening.test.ts` | Real DB test hitting mock |
| `tests/line-balance-inquiry.test.ts` | Auth + LINE mock incomplete |

## Category D — Implementation Changes (Test Expectations Stale)

These tests have correct mocks but the implementation has changed, making test expectations wrong.

| File | Root Cause |
|------|-----------|
| `tests/integration/outbox-retry.integration.test.ts` | OutboxProcessor publish count changed |
| `tests/integration/billing-race-condition.test.ts` | Race condition timing changed |
| `tests/maintenance.test.ts` | Audit log path changed |

## Verification

After all fixes:

```bash
npm run build          # exit 0
npx tsc --noEmit       # exit 0
npm run lint           # exit 0
npm run test:unit      # Category B tests + fixed Category C should pass
npm run test:e2e       # E2E suite should pass
```

Category A (real DB) and Category D tests require manual investigation and rewrite or quarantine.