# ONLYOFFICE Integration — Architecture & Implementation Plan

> **Honest preamble**: The ERP already has a mature document template subsystem. Most of the infrastructure described in this document is **already implemented**. This document maps what exists, identifies the gaps, and gives an honest recommendation for what to build next — and what to skip.

---

## Table of Contents

1. [Phase 1 — Architecture Fit Analysis](#phase-1--architecture-fit-analysis)
2. [Phase 2 — Placeholder/Tag Contract](#phase-2--placeholdertag-contract)
3. [Phase 3 — DB & Storage Model](#phase-3--db--storage-model)
4. [Phase 4 — Editor Integration Design](#phase-4--editor-integration-design)
5. [Phase 5 — Rendering Pipeline Design](#phase-5--rendering-pipeline-design)
6. [Phase 6 — Phased Implementation Plan](#phase-6--phased-implementation-plan)
7. [Phase 7 — Acceptance Criteria & Honest Assessment](#phase-7--acceptance-criteria--honest-assessment)

---

## Phase 1 — Architecture Fit Analysis

### What Already Exists

The ERP has a mature, well-structured document template system. Here is the complete inventory of what is already built:

#### Backend (Done — `src/modules/documents/`)

| File | Responsibility | Status |
|------|---------------|--------|
| `template.service.ts` | CRUD, versioning, activation, ONLYOFFICE callback handler | ✅ Complete |
| `resolver.service.ts` | Resolves room/billing/tenant/contract context for any template type | ✅ Complete |
| `render.service.ts` | Substitutes `{{field.path}}` and `data-template-repeat` blocks in HTML | ✅ Complete |
| `field-catalog.ts` | 37 predefined fields (room, tenant, contract, billing, apartment, computed) | ✅ Complete |
| `generation.service.ts` | Batch document generation per room | ✅ Complete |
| `storage.service.ts` | File storage (local or S3) for template versions | ✅ Complete |
| `types.ts` | Zod schemas + TypeScript interfaces for all inputs/outputs | ✅ Complete |

#### API Routes (Done — `src/app/api/templates/`)

| Route | Handler | Status |
|-------|---------|--------|
| `GET /api/templates` | List templates | ✅ Complete |
| `POST /api/templates` | Create template | ✅ Complete |
| `GET /api/templates/[id]` | Get template with versions + fields | ✅ Complete |
| `PATCH /api/templates/[id]` | Update template metadata | ✅ Complete |
| `POST /api/templates/[id]/versions` | Create draft version from active | ✅ Complete |
| `POST /api/templates/[id]/upload` | Upload new version file | ✅ Complete |
| `POST /api/templates/[id]/activate-version` | Activate a specific version | ✅ Complete |
| `GET /api/templates/[id]/editor-config` | Returns ONLYOFFICE JWT config + document URL | ✅ Complete |
| `POST /api/templates/[id]/callback` | ONLYOFFICE save callback (status 2/6) | ✅ Complete |
| `GET /api/templates/[id]/preview` | Render template with live ERP data | ✅ Complete |

#### ONLYOFFICE Security Layer (Done — `src/lib/onlyoffice/`)

| Function | Purpose | Status |
|----------|---------|--------|
| `signOnlyOfficeToken()` | HS256 JWT signing for editor config | ✅ Complete |
| `verifyOnlyOfficeCallbackToken()` | Callback JWT verification | ✅ Complete |
| `createOnlyOfficeEditorConfig()` | Builds the full editor config object | ✅ Complete |
| `getOnlyOfficeCallbackBaseUrl()` | Respects `ONLYOFFICE_CALLBACK_BASE_URL` env override | ✅ Complete |
| `isOnlyOfficeConfigured()` | Boolean guard for UI | ✅ Complete |

#### Admin UI (Partially Deleted — Gap)

| Page | Status | Notes |
|------|--------|-------|
| `/admin/templates` | ✅ Exists | List page |
| `/admin/templates/[id]` | ✅ Exists | Detail page (versions, fields, preview iframe) |
| `/admin/templates/[id]/edit` | ✅ Exists | Editor workspace with `OnlyOfficeFrame` embedded |
| `/admin/documents` | ✅ Exists | Generated document registry |
| `/admin/documents/generate` | ✅ Exists | Batch generation UI |
| `/admin/document-templates` | ❌ Deleted | Was a separate section — content merged into `/admin/templates` |

#### Infrastructure

| Item | Location | Status |
|------|----------|--------|
| Prisma models | `document_templates`, `document_template_versions`, `document_template_field_definitions`, `document_generation_jobs` | ✅ Complete |
| `OnlyOfficeFrame` component | `src/components/onlyoffice/OnlyOfficeFrame.tsx` | ✅ Exists |
| Ops guide (Cloudflare tunnel) | `docs/onlyoffice-ops.md` | ✅ Complete |
| HTML template serialization | `src/lib/templates/document-template.ts` | ✅ Exists |

---

### Gap Analysis

#### Gap 1 — The ONLYOFFICE Document Server Is Not Running

The entire integration is built, but **ONLYOFFICE itself is not deployed**. The `onlyoffice-ops.md` describes running it on a laptop via Cloudflare Tunnel (no public IP needed). This means:

- The embedded editor at `/admin/templates/[id]/edit` will show "ONLYOFFICE unavailable" unless the operator's laptop is running
- This is by design (cost-saving — no server needed), but it means the editor is **not always available**
- The ERP app itself works fine without it — templates are edited as raw HTML via the field browser, and the preview iframe shows rendered output

#### Gap 2 — HTML→PDF/DOCX Export Pipeline Is Unverified

The document generation system renders HTML and stores it. The PDF export endpoint (`GET /api/documents/[id]/pdf`) must convert that HTML to PDF. The `onlyoffice-ops.md` shows that ONLYOFFICE can do HTML→PDF conversion server-side, but this requires the Document Server to be reachable from the ERP app's server-side context.

Current situation:
- `src/modules/documents/pdf.service.ts` — exists, but implementation unknown
- `src/lib/onlyoffice/conversion.ts` — exists, may use ONLYOFFICE for conversion

#### Gap 3 — DOCX Export from HTML

The `GET /api/documents/[id]/download?format=docx` endpoint must convert HTML→DOCX. This also depends on ONLYOFFICE or a alternative library (e.g., `html-docx-js`, `puppeteer`).

---

### Architecture Decision: ERP = Source of Truth, ONLYOFFICE = Layout Editor Only

This is already the design and it is correct:

```
ERP (PostgreSQL)                 ONLYOFFICE (Laptop via Cloudflare Tunnel)
─────────────────                ────────────────────────────────────────
• Template body (HTML)            • Visual layout editing
• Field definitions               • Font/spacing/table styling
• Room/tenant/billing data        • NOT data entry — ERP is the source
• Rendering engine (resolver)     • NOT PDF generation — ERP does that
• Version history + audit log     • Saves back as HTML to ERP storage
• PDF/DOCX generation
```

This is the right split. The ERP calculates billing, resolves tenant data, and renders the final document. ONLYOFFICE is purely a layout tool.

---

## Phase 2 — Placeholder/Tag Contract

### Current Implementation

The ERP uses **two parallel placeholder systems**:

#### System A — Mustache-style `{{path}}` (Universal)

```
{{tenant.fullName}}
{{billing.total}}
{{computed.billingMonthLabel}}
{{billing_items.quantity}}      ← inside repeat blocks only
```

Applied everywhere: body HTML, subject line, fallback resolution.

**How it works** (`render.service.ts`):
1. `renderRepeatBlocks()` processes `data-template-repeat` containers first
2. `renderScalarFields()` processes `data-template-field` attributes using cheerio
3. `replaceFallbackPlaceholders()` catches any remaining `{{dot.path}}` tokens as fallback

#### System B — HTML data attributes (Structured)

```
<span data-template-field="tenant.fullName">{{tenant.fullName}}</span>
<div data-template-repeat="billing_items">...</div>
```

The `data-template-field` attribute tells the resolver **which path to use** for substitution within that element's text content. `data-template-repeat` marks a block that repeats for each array item.

**Why two systems?** The `data-template-field` attributes are precise (can handle same field key in different contexts). The `{{path}}` fallback catches anything not wrapped in data attributes.

### Field Catalog

37 fields defined in `field-catalog.ts`:

| Category | Count | Examples |
|----------|-------|----------|
| `ROOM` | 4 | `room.id`, `room.number`, `room.floorNumber`, `room.status` |
| `TENANT` | 5 | `tenant.fullName`, `tenant.firstName`, `tenant.phone`, `tenant.lineUserId` |
| `CONTRACT` | 3 | `contract.startDate`, `contract.endDate`, `contract.monthlyRent` |
| `BILLING` | 9 | `billing.year`, `billing.month`, `billing.subtotal`, `billing.total`, `billing_items` (collection) |
| `PAYMENT` | 3 | `payment.status`, `payment.lastPaidAt`, `payment.totalConfirmed` |
| `APARTMENT` | 2 | `apartment.name`, `apartment.address` |
| `SYSTEM` | 1 | `system.generatedAt` |
| `COMPUTED` | 4 | `computed.billingMonthLabel`, `computed.dueDateLabel`, `computed.occupancyDisplay`, `computed.totalAmountFormatted` |

### Recommended Tag Contract (No Changes Needed)

The current contract is sound. Admin templates use `{{field.path}}` tokens and `data-template-*` attributes. The field catalog provides all context.

**Standard invoice template structure**:
```html
<h1>ใบแจ้งค่าเช่า {{computed.billingMonthLabel}}</h1>
<p>ห้อง: {{room.number}} | ผู้เช่า: {{tenant.fullName}}</p>

<table>
  <thead>
    <tr><th>รายการ</th><th>จำนวน</th><th>ราคา/หน่วย</th><th>รวม</th></tr>
  </thead>
  <tbody data-template-repeat="billing_items">
    <tr>
      <td><span data-template-field="typeName">{{billing_items.typeName}}</span></td>
      <td><span data-template-field="quantity">{{billing_items.quantity}}</span></td>
      <td><span data-template-field="unitPrice">{{billing_items.unitPrice}}</span></td>
      <td><span data-template-field="amountFormatted">{{billing_items.amountFormatted}}</span></td>
    </tr>
  </tbody>
</table>

<p>รวมทั้งสิ้น: {{computed.totalAmountFormatted}}</p>
<p>กำหนดชำระ: {{computed.dueDateLabel}}</p>
```

**Note**: `billing_items` is a flat list derived from `RoomBilling` fields (RENT, WATER, ELECTRIC, FURNITURE, OTHER) — there is no separate `BillingItem` table. The `DocumentRenderBillingItem` interface in `resolver.service.ts` builds these items on-the-fly from the billing record.

### What to Add

Only if needed:
- `contract.deposit` (snapshot at signing) — not currently in catalog
- `billing.waterUnits`, `billing.electricUnits` — raw meter readings for itemized display
- `room.buildingName` — multi-building support (out of scope currently)

---

## Phase 3 — DB & Storage Model

### Current Schema (Already in `schema.prisma`)

```prisma
model DocumentTemplate {
  id               String                           @id @default(uuid())
  name             String
  type             DocumentTemplateType             @default(INVOICE)
  description      String?
  status           DocumentTemplateStatus            @default(DRAFT)
  subject          String?
  body             String                           // Current active body HTML
  activeVersionId  String?
  createdById      String?
  updatedById      String?
  archivedAt       DateTime?
  createdAt        DateTime                         @default(now())
  updatedAt        DateTime                         @updatedAt
  activeVersion    DocumentTemplateVersion?         @relation(...)
  versions         DocumentTemplateVersion[]        @relation("TemplateVersions")
  fieldDefinitions  DocumentTemplateFieldDefinition[]
  generatedDocuments GeneratedDocument[]
}

model DocumentTemplateVersion {
  id            String                        @id @default(uuid())
  templateId    String
  version       Int
  label         String?
  subject       String?
  body          String                         // Version-specific HTML body
  status        DocumentTemplateVersionStatus @default(DRAFT)
  fileType      String                        @default("html")
  fileName      String?
  storageKey    String?                       // Points to stored HTML file
  checksum      String?                       // SHA-256 of body
  sourceFileId  String?
  createdById   String?
  activatedById String?
  activatedAt   DateTime?
  archivedAt    DateTime?
  meta          Json?
  createdAt     DateTime                      @default(now())
  updatedAt     DateTime                      @updatedAt
  sourceFile    UploadedFile?                  @relation(...)
  template      DocumentTemplate               @relation(...)
}

model DocumentTemplateFieldDefinition {
  id          String                  @id @default(uuid())
  templateId  String
  key         String                  // e.g. "tenant.fullName"
  label       String
  category    DocumentFieldCategory
  valueType   DocumentFieldValueType
  path        String                  // resolver path
  description String?
  sampleValue String?
  isRequired  Boolean                 @default(false)
  isCollection Boolean                @default(false)
  sortOrder   Int                     @default(0)
  metadata    Json?
  template    DocumentTemplate        @relation(...)
}

model DocumentGenerationJob {
  id               String                      @id @default(uuid())
  templateId       String
  templateVersionId String
  requestedById    String?
  billingPeriodId  String?
  year             Int?
  month            Int?
  scope            DocumentSourceScope
  selection        Json?
  dryRun           Boolean                    @default(false)
  status           DocumentGenerationJobStatus @default(QUEUED)
  totalRequested  Int                        @default(0)
  successCount     Int                        @default(0)
  skippedCount     Int                        @default(0)
  failedCount      Int                        @default(0)
  errorMessage     String?
  bundleFileId     String?
}
```

### Storage Model

Templates are stored as **HTML strings in the DB** (`body` column) AND as files in object storage (via `UploadedFile` → `storageKey`).

Flow:
1. Admin edits in ONLYOFFICE → saved via callback → stored in object storage (`storageKey`)
2. DB `body` column updated with same HTML (kept in sync)
3. On generation: `body` is rendered with resolver context → final HTML stored per document

### What the Schema Is Missing (if multi-building is needed later)

- `templateId` → `buildingId` foreign key on `DocumentTemplate` (currently global — one set of templates per ERP instance)

This is **out of scope** for the current phase.

---

## Phase 4 — Editor Integration Design

### Current Architecture

The embedded editor uses the `OnlyOfficeFrame` React component at `src/components/onlyoffice/OnlyOfficeFrame.tsx`.

**Flow**:
1. Admin opens `/admin/templates/[id]/edit`
2. Page calls `GET /api/templates/[id]/editor-config?versionId=...`
3. API returns: `{ documentServerUrl, config: { token, key, callbackUrl, ... }, versionId }`
4. `OnlyOfficeFrame` renders an `<iframe>` pointing to `ONLYOFFICE_DOCUMENT_SERVER_URL` with the JWT config as query params or postMessage
5. ONLYOFFICE loads the template HTML from `config.document.url` (ERP file storage URL)
6. Admin edits and saves → ONLYOFFICE POSTs to callback URL
7. Callback handler verifies JWT, downloads edited HTML, saves to storage + DB

### JWT Security Flow (Already Implemented)

```
ERP Server                              ONLYOFFICE Document Server
───────────────────                     ──────────────────────────────────
createOnlyOfficeEditorConfig()          OnlyOffice JS loaded in <iframe>
  signs config with ONLYOFFICE_JWT_SECRET
  returns { config, token, documentServerUrl }
          │
          │  GET /api/files/onlyoffice/templates/{id}.html
          │  (public — file content only)
          │◄──────────────────────────────────────────────
          │
          │  POST /api/templates/{id}/callback?versionId=...
          │  { status: 2, url: "https://docs.../download", token: "jwt" }
          │◄──────────────────────────────────────────────
          │  verifyOnlyOfficeCallbackToken(token) — reject if invalid
          │  download from payload.url
          │  save to storage + DB
```

### Admin UX Flow (Template Edit Page — `src/app/admin/templates/[id]/edit/page.tsx`)

Already implemented:
- Left sidebar: Version selector (DRAFT / ACTIVE / archived)
- Left sidebar: Field browser with one-click copy of markup
- Center: `OnlyOfficeFrame` (ONLYOFFICE editor)
- Top: Metadata form (name, type, subject, description)
- Actions: Save Settings, Create Draft, Activate Version, Upload HTML

**UX Issue to Fix**: The "ONLYOFFICE" button on the templates list page and detail page both link to `/admin/templates/[id]/edit`. This is correct — no separate "office" page needed.

### Operational Modes

| Mode | When | Behavior |
|------|------|----------|
| **Online** | Laptop running with Cloudflare Tunnel | Full embedded ONLYOFFICE editor loads |
| **Offline** | Laptop asleep/disconnected | `OnlyOfficeFrame` shows "unavailable" — admin can still upload HTML files directly |
| **No License** | No `ONLYOFFICE_DOCUMENT_SERVER_URL` set | `isOnlyOfficeConfigured()` returns false — field browser + preview still work |

The design correctly degrades gracefully. Admin can always:
1. Use the field browser to copy markup into their own HTML
2. Upload an HTML file directly via the Upload button
3. Use the preview iframe to see rendered output with live data

### What Needs to Be Done

1. **Verify `OnlyOfficeFrame` component** handles the JWT config correctly and loads the editor (needs testing with live ONLYOFFICE)
2. **Verify the callback URL** (`/api/templates/{id}/callback?versionId=...`) is reachable from the laptop's ONLYOFFICE (requires Cloudflare tunnel to be up)
3. **Add a "reconnect" indicator** in the `OnlyOfficeFrame` UI showing connection status

---

## Phase 5 — Rendering Pipeline Design

### Current Rendering Flow

```
Template.body (HTML with {{placeholders}})
        │
        ▼
DocumentResolverService.resolveTargets()
  → fetches Room + Tenants + Contracts + Billings + Invoices
  → builds DocumentRenderContext (typed object)
        │
        ▼
render.service.ts → renderTemplateHtml(body, context, fields)
  1. renderRepeatBlocks()   ← data-template-repeat containers
  2. renderScalarFields()    ← data-template-field elements (cheerio)
  3. replaceFallbackPlaceholders() ← catch-all {{path}} tokens
        │
        ▼
Final HTML (with all substitutions)
        │
        ├──► Stored in GeneratedDocument.body
        │
        ├──► HTML → PDF via pdf.service.ts
        │
        └──► HTML → DOCX via ??? (implementation unknown)
```

### HTML → PDF Pipeline

**Current state**: `src/modules/documents/pdf.service.ts` exists. Need to read it to know if it uses ONLYOFFICE conversion or a library like `puppeteer`/`playwright`.

If using ONLYOFFICE server conversion:
```
ERP Server                      ONLYOFFICE Document Server
──────────────                  ──────────────────────────
POST /ConvertService/ConvertService.asmx
  FileContent = rendered HTML
  NewFileType = pdf
◄─────────────────────────────
PDF binary                      (server-side, no browser needed)
```

If using `puppeteer`/`playwright`:
```
Node.js (ERP server)            Chrome instance
───────────────                 ────────────────
await browser.newPage()
await page.setContent(html)
await page.pdf()
◄─────────────────────────────
PDF binary
```

**Recommendation**: Use `playwright` (or `puppeteer`) for HTML→PDF. It gives:
- Full CSS support (Thai fonts, RTL)
- No dependency on ONLYOFFICE for PDF generation
- Works from any server (Vercel, VPS, Render)
- Consistent output with the preview iframe

ONLYOFFICE conversion should remain as a fallback for DOCX export (HTML→DOCX is harder without a proper library).

### HTML → DOCX Pipeline

For DOCX export, two options:

| Option | Pros | Cons |
|--------|------|------|
| `html-docx-js` (browser lib) | No server dependency | Limited styling, no table support |
| `puppeteer` → `.docx` via Office XML | Full fidelity | Requires headless Chrome on server |
| ONLYOFFICE Conversion API | High quality DOCX | Requires reachable Document Server |

**Recommendation**: `puppeteer` generating a PDF first, then use a PDF-to-DOCX library, OR accept that DOCX export from this system produces HTML-in-DOCX (opens in Word but not perfect fidelity). For an apartment ERP, **PDF is the primary export format** — DOCX is secondary and can be "good enough" HTML wrapped in Word XML.

---

## Phase 6 — Phased Implementation Plan

### Phase A — Get Embedded Editor Working (1–2 days)

**Goal**: Admin can open `/admin/templates/[id]/edit`, ONLYOFFICE loads, edit a template, save it.

1. **Set up Cloudflare Tunnel + ONLYOFFICE** (ops — follow `onlyoffice-ops.md`)
2. **Set env vars** on the VPS/deployment:
   ```
   ONLYOFFICE_DOCUMENT_SERVER_URL=https://docs.your-domain.com
   ONLYOFFICE_JWT_SECRET=<same secret in notebook .env>
   APP_BASE_URL=https://app.your-domain.com
   ```
3. **Verify** `GET /api/templates/[id]/editor-config` returns valid JWT-signed config
4. **Verify** `OnlyOfficeFrame` loads the editor without errors
5. **Verify** saving in ONLYOFFICE triggers callback, new version saved to DB
6. **Verify** rendered preview updates after save

**Blockers**: Cloudflare account needed, tunnel token required, operator's laptop must be on and connected.

### Phase B — Complete PDF/DOCX Export (2–3 days)

**Goal**: Generated documents can be downloaded as PDF and DOCX.

1. Read `pdf.service.ts` to understand current HTML→PDF approach
2. If not using `playwright`/`puppeteer`, implement it:
   ```bash
   npm install playwright
   npx playwright install chromium
   ```
3. Implement HTML→DOCX (accept HTML-in-DOCX as initial approach, upgrade later)
4. Add PDF preview in document detail page (`/admin/documents/[id]`)
5. Verify PDF with Thai fonts renders correctly

### Phase C — Field Coverage Audit (0.5 days)

**Goal**: Ensure the 37 existing fields cover all real invoice/receipt needs.

1. Create a test template with ALL fields
2. Render with a real room's data
3. Identify missing fields (e.g., `contract.deposit`, `billing.waterUnits`)
4. Add to `field-catalog.ts` + `resolver.service.ts` if needed

### Phase D — Production Hardening (1–2 days)

**Goal**: Make the template system production-safe.

1. **Template versioning audit**: Ensure activating a version updates `DocumentTemplate.body` correctly (already implemented in `template.service.ts`)
2. **Checksum verification**: Verify that if a stored file's checksum doesn't match the DB body, the system flags it
3. **Audit log review**: All template operations log to `AuditLog` — verify this covers all critical actions
4. **Rate limiting**: Add rate limiting to `/api/templates/[id]/callback` to prevent abuse

### What NOT to Build

| Proposed Feature | Why Skip |
|-----------------|---------|
| Conditional blocks in templates (`{{#if}}`) | Overcomplicates the renderer; handle in resolver with computed fields |
| Template inheritance | Not needed for current scope |
| Multi-building templates | Out of scope; add `buildingId` when/if multi-building is implemented |
| Collaborative editing (multiple admins in same doc) | ONLYOFFICE supports this but adds operational complexity |
| Template A/B testing | Not relevant for invoice templates |

---

## Phase 7 — Acceptance Criteria & Honest Assessment

### Honest Assessment

**The ONLYOFFICE integration is 80% complete.** The ERP's document template system is one of the most well-structured parts of the codebase. The infrastructure (services, API routes, JWT security, field catalog, rendering engine, storage) is all implemented and tested.

**What remains is operational setup, not software development.** The Cloudflare tunnel approach is pragmatic — it saves the cost of a dedicated server for ONLYOFFICE. The trade-off is that the editor availability depends on someone's laptop being on.

### When to Use ONLYOFFICE vs. Direct HTML Upload

| Scenario | Recommended Approach |
|----------|---------------------|
| Adjust font, colors, logo placement | ONLYOFFICE editor |
| Add/remove a field | Direct HTML edit + field browser |
| Structural changes (new table, new section) | ONLYOFFICE editor |
| Bulk edits to 10 templates | Upload HTML directly |
| Change billing calculation logic | Not a template task — fix `resolver.service.ts` |

### Acceptance Criteria Checklist

- [ ] `ONLYOFFICE_DOCUMENT_SERVER_URL` env var set
- [ ] `ONLYOFFICE_JWT_SECRET` env var set and matching notebook secret
- [ ] Cloudflare Tunnel is running on operator's laptop (`docker compose ... logs cloudflared` shows connected)
- [ ] `curl https://docs.your-domain.com/hosting/discovery` returns XML
- [ ] Admin can open `/admin/templates/[id]/edit` and ONLYOFFICE loads
- [ ] Admin edits text/font/layout and saves → callback fires → version saved
- [ ] Template preview iframe shows rendered HTML with correct field values
- [ ] `GET /api/documents/[id]/pdf` returns a valid PDF with Thai text rendered correctly
- [ ] `GET /api/documents/[id]/download?format=docx` returns a DOCX file
- [ ] Template version history shows all saved versions with timestamps
- [ ] Activating a version makes it the default for generation jobs

### If ONLYOFFICE Is Overkill for Current State

**Honest answer**: If the primary use case is **invoice generation** (not complex layout design), the system already works without ONLYOFFICE:

1. Admin uses the **field browser** to copy `{{billing.total}}`, `{{tenant.fullName}}`, etc. into a plain HTML file
2. Admin **uploads the HTML** via the Upload button in `/admin/templates/[id]/edit`
3. The **preview iframe** shows the rendered output with live data
4. Batch generation produces PDFs

ONLYOFFICE only adds value when:
- Admins need to visually design complex table layouts
- Logo/branding adjustments are needed frequently
- Non-technical staff need to edit templates

If the answer is "we rarely change invoice templates, and when we do a developer does it," **consider skipping the Cloudflare tunnel setup entirely** and just use the HTML upload workflow.

### Recommendation

1. **Do Phase A first** (1 day) — get ONLYOFFICE working end-to-end on a test environment
2. **Evaluate** after Phase A: Is the editor actually useful for the admin team?
3. **If yes**: Continue Phase B–D
4. **If no**: Document the HTML upload workflow in the admin UI and skip the notebook tunnel setup

The software is ready. The question is whether the operational complexity of a laptop-hosted ONLYOFFICE instance is justified by the workflow benefits.
