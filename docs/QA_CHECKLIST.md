# Release QA Checklist — Apartment ERP

> Run this checklist before every production release.
> All items must be ✅ before merging to main / tagging a release.

---

## A. Thai PDF Rendering

| # | Check | How to verify | Pass criteria |
|---|-------|---------------|---------------|
| A1 | Thai text renders in invoice PDF | Create a DocumentTemplate with Thai body (e.g. `กรุณาชำระเงิน`), generate PDF via `GET /api/invoices/<id>/pdf` | PDF opens in browser; Thai characters visible, not replaced by `?` or boxes |
| A2 | No WinAnsi font in PDF binary | Open PDF in hex editor or `strings invoice.pdf \| grep -i helvetica` | Zero hits for `Helvetica`, `WinAnsi`, or `StandardFont` |
| A3 | Sarabun embedded in PDF | `strings invoice.pdf \| grep -i sarabun` | Hit on `Sarabun` confirms TTF is embedded |
| A4 | Mixed Thai+Latin renders correctly | Template body: `เช่าห้อง 101 — Rent THB 5,000` | Both scripts visible in PDF |
| A5 | Thai name in tenant field | Tenant with Thai name (e.g. `สมชาย ใจดี`) | Name prints correctly in "Tenant:" line |

---

## B. PDF Endpoint

| # | Check | How to verify | Pass criteria |
|---|-------|---------------|---------------|
| B1 | Returns 200 | `curl -I http://localhost:3001/api/invoices/<id>/pdf` | HTTP/1.1 200 |
| B2 | Content-Type = application/pdf | Same curl | `content-type: application/pdf` |
| B3 | Content-Disposition inline | Same curl | `content-disposition: inline; filename="invoice_<id>.pdf"` |
| B4 | Cache-Control: no-store | Same curl | `cache-control: no-store` |
| B5 | x-document-template-id header (when template exists) | Create INVOICE template, call PDF endpoint | `x-document-template-id: <uuid>` present in response |
| B6 | No x-document-template-id (when no template) | Delete all INVOICE templates, call PDF endpoint | Header absent |

---

## C. Document Template CRUD

| # | Check | How to verify | Pass criteria |
|---|-------|---------------|---------------|
| C1 | POST creates template + audit log | `POST /api/document-templates` with valid body | 201 response; `DOCUMENT_TEMPLATE_CREATED` entry in audit_logs |
| C2 | Body > 10,000 chars rejected | POST with 10,001 char body | 400 Validation failed |
| C3 | PATCH updates + audit log | `PATCH /api/document-templates/<id>` | 200; `DOCUMENT_TEMPLATE_UPDATED` in audit_logs with `changedFields` |
| C4 | DELETE removes + audit log | `DELETE /api/document-templates/<id>` | 200; `DOCUMENT_TEMPLATE_DELETED` in audit_logs with `name` and `type` |
| C5 | GET by type filter | `GET /api/document-templates?type=INVOICE` | Returns only INVOICE templates |

---

## D. Invoice Send / LINE Delivery States

| # | Check | How to verify | Pass criteria |
|---|-------|---------------|---------------|
| D1 | InvoiceDelivery created as PENDING | `POST /api/invoices/<id>/send`, then `SELECT * FROM invoice_deliveries` | `status = PENDING` immediately after send |
| D2 | lineConfigured=false when no LINE env | Blank `LINE_CHANNEL_ACCESS_TOKEN`, call send | Response `meta.lineConfigured = false`, message mentions "LINE not configured" |
| D3 | lineConfigured=true when LINE configured | Set real LINE env vars, call send | Response `meta.lineConfigured = true` |
| D4 | Audit log includes lineConfigured + deliveryStatus | Check audit_logs after send | `metadata.lineConfigured` and `metadata.deliveryStatus = PENDING` |
| D5 | Outbox event includes templateBody | Check outbox_events table after send | `payload.templateBody` present when INVOICE_SEND template exists |

---

## E. Audit Log Coverage

| # | Check | How to verify | Pass criteria |
|---|-------|---------------|---------------|
| E1 | PDF generation logged | Generate PDF → check audit_logs (route logs `invoice_pdf_template_applied`) | Log entry present with `invoiceId` and `templateId` |
| E2 | Invoice send logged | `POST /api/invoices/<id>/send` → audit_logs | `INVOICE_SEND_REQUESTED` entry |
| E3 | Template create logged | POST document-template → audit_logs | `DOCUMENT_TEMPLATE_CREATED` entry |
| E4 | Template update logged | PATCH document-template → audit_logs | `DOCUMENT_TEMPLATE_UPDATED` entry with `changedFields` |
| E5 | Template delete logged | DELETE document-template → audit_logs | `DOCUMENT_TEMPLATE_DELETED` entry with `name` and `type` snapshot |

---

## F. Automated Test Suite

| # | Check | How to verify | Pass criteria |
|---|-------|---------------|---------------|
| F1 | `npm test` passes | `cd apps/erp && npm test` | All tests green, 0 failures |
| F2 | Thai PDF unit tests pass | `npx vitest run tests/invoice-pdf-thai.test.ts` | All 8 assertions pass |
| F3 | Endpoint tests pass | `npx vitest run tests/invoice-pdf-endpoint.test.ts` | All 5 assertions pass |
| F4 | TypeScript clean | `npm run typecheck` (or `tsc --noEmit`) | 0 errors |
| F5 | Lint clean | `npm run lint` | 0 errors (warnings acceptable) |
| F6 | Build succeeds | `npm run build` | `✓ Compiled successfully` |

---

## G. Security / Validation

| # | Check | How to verify | Pass criteria |
|---|-------|---------------|---------------|
| G1 | Template body capped at 10,000 chars | POST 10,001 chars → 400 | Confirmed via C2 above |
| G2 | Unauthenticated GET rejected | Call GET /api/document-templates without session | 401 Unauthorized |
| G3 | STAFF cannot delete templates | Authenticate as staff, call DELETE | 403 Forbidden |
| G4 | PDF endpoint does not expose raw DB ids unnecessarily | Inspect PDF content | No internal DB ids or stack traces in PDF |

---

## H. Infrastructure

| # | Check | How to verify | Pass criteria |
|---|-------|---------------|---------------|
| H1 | Sarabun TTF files present | `ls apps/erp/public/fonts/` | `Sarabun-Regular.ttf` and `Sarabun-Bold.ttf` present |
| H2 | @pdf-lib/fontkit installed | `cat apps/erp/package.json \| grep fontkit` | `@pdf-lib/fontkit` in dependencies |
| H3 | Health check passes | `GET /api/health` | `{"status":"ok"}` |
| H4 | DB migration current | `npx prisma migrate status` | "Database schema is up to date" |

---

## I. Regression: No Character Stripping

| # | Check | How to verify | Pass criteria |
|---|-------|---------------|---------------|
| I1 | Thai chars NOT stripped in template body | Search codebase: `grep -r "replace.*\\\\x00.*\\\\xFF" apps/erp/src` | Zero matches — the character-stripping workaround must NOT exist |
| I2 | Thai chars NOT stripped in PDF notes path | Read `apps/erp/src/app/api/invoices/[id]/pdf/route.ts` | `template.body` passed directly to `generateInvoicePdf` with no `.replace()` |
| I3 | WinAnsi font NOT used anywhere | `grep -r "StandardFonts" apps/erp/src` | Zero matches in production code |

---

_Last updated: 2026-03-16_
_Maintainer: ERP project team_
