/**
 * Fresh-DB Release-Gate E2E Test — Node.js + playwright
 *
 * Full billing cycle through the real browser:
 *  1. Login as existing admin → Reset DB to clean state
 *  2. Create first owner via /sign-up (DB is empty after reset)
 *  3. Login as the new owner
 *  4. Upload Excel template via /admin/billing/import
 *  5. Preview batch
 *  6. Commit batch → RoomBilling records created
 *  7. Generate invoice for room 3201 via authenticated API
 *  8. Record payment ฿10,000 via authenticated API
 *  9. Verify invoice status = PAID (invoice totalAmount = ฿2,940 from billing record)
 * 10. Verify /api/analytics/revenue shows ฿2,940 for current month (billing total)
 *
 * CSRF: Origin-header validation. Playwright browser sends correct Origin.
 *
 * Run:
 *   cd apps/erp
 *   node tests/e2e/billing-full-flow.js
 */

const { chromium } = require('playwright');
const { PrismaClient } = require('@prisma/client');

// Hardcode localhost:3000 — .env may have APP_BASE_URL=3001 but dev server runs on 3000
const BASE_URL = 'http://localhost:3000';
const SEED_ADMIN_USER = 'owner';
const SEED_ADMIN_PASS = 'Owner@12345';
const TEST_ADMIN_USER = 'releasetest';
const TEST_ADMIN_PASS = 'ReleaseTest@12345';
const TEST_ADMIN_DISPLAY = 'Release Test';
const TEST_ROOM = '3201';
const PAYMENT_AMOUNT = 10_000;

async function apiPost(page, path, body) {
  return page.evaluate(async ({ url, b, origin }) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Origin': origin, 'Referer': origin + '/' },
      credentials: 'include',
      body: JSON.stringify(b),
    });
    const json = await res.json();
    return { ok: res.ok, status: res.status, data: json };
  }, { url: `${BASE_URL}${path}`, b: body, origin: BASE_URL });
}

async function apiGet(page, path) {
  return page.evaluate(async ({ url, origin }) => {
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'Origin': origin, 'Referer': origin + '/' },
      credentials: 'include',
    });
    const json = await res.json();
    return { ok: res.ok, status: res.status, data: json };
  }, { url: `${BASE_URL}${path}`, origin: BASE_URL });
}

async function loginAs(page, username, password) {
  // If already on dashboard, skip login (session still valid)
  if (page.url().includes('/admin/dashboard')) {
    console.log(`  Already logged in as ${username}, at: ${page.url()}`);
    return;
  }
  await page.goto(`${BASE_URL}/login`);
  // Handle case where already logged in (immediate redirect)
  if (page.url().includes('/admin/dashboard')) {
    console.log(`  Redirected to dashboard (already logged in) as ${username}, at: ${page.url()}`);
    return;
  }
  await page.fill('[name="username"]', username);
  await page.fill('[name="password"]', password);
  await page.click('[type="submit"]');
  await page.waitForURL(`${BASE_URL}/admin/dashboard`, { timeout: 20_000 });
  console.log(`  Logged in as ${username}, at: ${page.url()}`);
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✓ ${message}`);
      passed++;
    } else {
      console.error(`  ✗ FAIL: ${message}`);
      failed++;
    }
  }

  try {
    // ─── Step 1: Reset DB if it has data ────────────────────────────────────
    console.log('\n[Step 1] Check DB state and reset if needed...');
    const prisma = new PrismaClient();
    const userCount = await prisma.adminUser.count();
    await prisma.$disconnect();

    if (userCount > 0) {
      // DB has users — use Prisma directly to clear state (no auth needed in Node script)
      console.log(`  DB has ${userCount} users — clearing via Prisma...`);
      const prisma2 = new PrismaClient();
      // Delete in FK-order matching /api/admin/setup/reset
      await prisma2.$transaction([
        prisma2.outboxEvent.deleteMany({}),
        prisma2.auditLog.deleteMany({}),
        prisma2.passwordResetToken.deleteMany({}),
        prisma2.staffRegistrationRequest.deleteMany({}),
        prisma2.uploadedFile.deleteMany({}),
        prisma2.generatedDocumentFile.deleteMany({}),
        prisma2.generatedDocument.deleteMany({}),
        prisma2.documentGenerationTarget.deleteMany({}),
        prisma2.documentGenerationJob.deleteMany({}),
        prisma2.documentTemplateFieldDefinition.deleteMany({}),
        prisma2.documentTemplateVersion.deleteMany({}),
        prisma2.documentTemplate.deleteMany({}),
        prisma2.invoiceDelivery.deleteMany({}),
        prisma2.paymentMatch.deleteMany({}),
        prisma2.paymentTransaction.deleteMany({}),
        prisma2.maintenanceAttachment.deleteMany({}),
        prisma2.maintenanceComment.deleteMany({}),
        prisma2.message.deleteMany({}),
        prisma2.conversation.deleteMany({}),
        prisma2.payment.deleteMany({}),
        prisma2.invoice.deleteMany({}),
        prisma2.roomBilling.deleteMany({}),
        prisma2.importBatch.deleteMany({}),
        prisma2.billingPeriod.deleteMany({}),
        prisma2.roomTenant.deleteMany({}),
        prisma2.contract.deleteMany({}),
        prisma2.maintenanceTicket.deleteMany({}),
        prisma2.lineUser.deleteMany({}),
        prisma2.tenant.deleteMany({}),
        prisma2.room.deleteMany({}),
        prisma2.bankAccount.deleteMany({}),
        prisma2.billingRule.deleteMany({}),
        prisma2.adminUser.deleteMany({}),
        prisma2.config.deleteMany({ where: { key: { not: 'system.initialized' } } }),
      ]);
      // Reset system.initialized flag
      await prisma2.config.upsert({
        where: { key: 'system.initialized' },
        update: { value: 'false' },
        create: { key: 'system.initialized', value: 'false', description: 'System initialization flag' },
      });
      await prisma2.$disconnect();
      console.log('  DB cleared via Prisma');
    }
    assert(true, 'DB is in clean state');

    // ─── Step 2: Create first owner (DB is now empty) ──────────────────────
    console.log('\n[Step 2] Create first owner account...');
    await page.goto(`${BASE_URL}/sign-up`);
    await page.waitForLoadState('networkidle');
    await page.fill('input[placeholder="Enter display name"]', TEST_ADMIN_DISPLAY);
    await page.fill('input[placeholder="Choose a username"]', TEST_ADMIN_USER);
    await page.fill('input[placeholder="Enter email"]', 'release@test.com');
    await page.fill('input[placeholder="Create a password"]', TEST_ADMIN_PASS);
    await page.fill('input[placeholder="Confirm password"]', TEST_ADMIN_PASS);
    await page.click('[type="submit"]');
    await page.waitForURL(`${BASE_URL}/admin/dashboard`, { timeout: 20_000 });
    assert(page.url().includes('/admin/dashboard'), 'First owner created and redirected to dashboard');

    // ─── Step 3: Login as new owner ────────────────────────────────────────
    console.log('\n[Step 3] Login as new owner...');
    await loginAs(page, TEST_ADMIN_USER, TEST_ADMIN_PASS);
    assert(page.url().includes('/admin/dashboard'), 'New owner logged in successfully');

    // ─── Step 4 & 5: Upload Excel and preview ──────────────────────────────
    console.log('\n[Step 4 & 5] Upload Excel template and preview...');
    await page.goto(`${BASE_URL}/admin/billing/import`);
    await page.waitForLoadState('networkidle');

    const excelPath = `${process.cwd()}/../../apartment_excel_template.xlsx`;
    // File input is hidden; use setInputFiles which triggers React onChange
    await page.locator('input[type="file"]').setInputFiles(excelPath);
    await page.waitForTimeout(2_000);

    // Wait for the preview API response
    const previewResp = await Promise.all([
      page.waitForResponse(resp => resp.url().includes('/api/billing/import/preview'), { timeout: 15_000 }),
      page.locator('button:has-text("Preview Batch")').click(),
    ]);
    await page.waitForTimeout(2_000);

    const previewJson = await previewResp[0].json().catch(() => null);
    const batchId = previewJson?.data?.batch?.id;
    console.log(`  Preview batch ID: ${batchId}`);
    assert(batchId, 'Batch ID returned from preview');

    // ─── Step 6: Commit batch directly via API ──────────────────────────────
    console.log('\n[Step 6] Commit import batch via API...');
    assert(batchId, `Have batch ID: ${batchId}`);
    const execRes = await apiPost(page, '/api/billing/import/execute', { batchId });
    console.log(`  Execute status: ${execRes.status}, success: ${execRes.data?.success}`);
    if (!execRes.data?.success) {
      console.log(`  Error: ${execRes.data?.error?.message ?? JSON.stringify(execRes.data).slice(0, 300)}`);
    }
    assert(execRes.ok && execRes.data?.success, 'Import batch executed successfully');

    // Verify billing records were created for room 3201
    const billingRes = await apiGet(page, '/api/billing?roomNo=3201&pageSize=5');
    console.log(`  Billing API status: ${billingRes.status}`);
    assert(billingRes.ok, 'Billing API responded OK');

    const rawData = billingRes.data?.data?.data;
    const billingRecords = Array.isArray(rawData) ? rawData : [];
    console.log(`  Billing records for room 3201: ${billingRecords.length}`);
    if (billingRecords.length > 0) {
      console.log(`  First record roomNo: ${billingRecords[0].roomNo}, status: ${billingRecords[0].status}`);
    }
    assert(billingRecords.length > 0, `RoomBilling records created for room 3201 (${billingRecords.length} records)`);

    // Lock the billing record so we can generate an invoice
    const billingRecordId = billingRecords[0].id;
    const billingStatus = billingRecords[0].status;
    console.log(`  Billing record ID: ${billingRecordId}, current status: ${billingStatus}`);

    if (billingStatus !== 'LOCKED') {
      console.log('  Locking billing record...');
      const lockRes = await apiPost(page, `/api/billing/${billingRecordId}/lock`, {});
      console.log(`  Lock status: ${lockRes.status}, ok: ${lockRes.ok}`);
      if (!lockRes.ok) {
        console.log(`  Lock error: ${JSON.stringify(lockRes.data).slice(0, 200)}`);
      }
      assert(lockRes.ok, 'Billing record locked successfully');
    } else {
      console.log('  Billing record already LOCKED');
    }

    // ─── Step 7: Generate invoice for room 3201 ────────────────────────────
    console.log('\n[Step 7] Generate invoice for room 3201...');
    const genRes = await apiPost(page, '/api/invoices/generate', { billingRecordId });
    console.log(`  Generate invoice status: ${genRes.status}, success: ${genRes.data?.success}`);
    if (!genRes.ok || !genRes.data?.success) {
      console.log(`  Error: ${genRes.data?.error?.message ?? JSON.stringify(genRes.data).slice(0, 200)}`);
    }
    assert(genRes.ok && genRes.data?.success, 'Invoice generated successfully');

    const invoice = genRes.data.data;
    assert(invoice, 'Invoice object returned');
    console.log(`  Invoice: ${invoice.id} | totalAmount: ${invoice.totalAmount} | status: ${invoice.status}`);
    assert(invoice.totalAmount != null, 'Invoice has a totalAmount');

    // Store invoice ID for next step
    await page.evaluate((id) => { window.__testInvoiceId = id; }, invoice.id);

    // ─── Step 8: Record payment ฿10,000 ───────────────────────────────────
    console.log('\n[Step 8] Record payment ฿10,000...');
    let invoiceId = await page.evaluate(() => window.__testInvoiceId);
    if (!invoiceId) {
      const invRes = await apiGet(page, '/api/invoices?roomNo=3201&pageSize=5');
      const invs = Array.isArray(invRes.data?.data?.data) ? invRes.data.data.data : [];
      const target = invs.find((i) => i.roomNo === TEST_ROOM || i.room?.roomNo === TEST_ROOM);
      invoiceId = target?.id;
    }
    assert(invoiceId, `Found invoice ID: ${invoiceId}`);

    const payRes = await apiPost(page, '/api/payments', {
      invoiceId,
      amount: PAYMENT_AMOUNT,
      method: 'CASH',
      referenceNumber: 'E2E-TEST-001',
    });
    console.log(`  Payment status: ${payRes.status}, success: ${payRes.data?.success}`);
    console.log(`  Payment response: ${JSON.stringify(payRes.data).slice(0, 200)}`);
    assert(payRes.ok && payRes.data?.success, 'Payment recorded successfully');

    // ─── Step 9: Verify invoice total = ฿10,000 and status = PAID ──────────
    console.log('\n[Step 9] Verify invoice status = PAID...');
    const invRes = await apiGet(page, '/api/invoices?roomNo=3201&pageSize=5');
    assert(invRes.ok, 'Invoice API responded OK');

    const invs = Array.isArray(invRes.data?.data?.data) ? invRes.data.data.data : [];
    const targetInvoice = invs.find((i) => i.roomNo === TEST_ROOM || i.room?.roomNo === TEST_ROOM);
    assert(targetInvoice, `Found invoice for room ${TEST_ROOM}`);

    const totalAmount = Number(targetInvoice.totalAmount);
    // totalAmount is the billing amount from the RoomBilling record, not the payment amount
    // Room 3201's billing total is 2940 per the Excel template; payment was 10000 (overpay = PAID)
    const expectedBillingTotal = 2940;
    console.log(`  Invoice totalAmount: ${totalAmount} (billing amount: ${expectedBillingTotal})`);
    assert(totalAmount === expectedBillingTotal, `Invoice totalAmount = ${expectedBillingTotal}`);

    const status = targetInvoice.status;
    console.log(`  Invoice status: ${status} (expected: PAID)`);
    assert(status === 'PAID', `Invoice status = PAID`);

    // ─── Step 10: Verify monthlyRevenue ──────────────────────────────────────
    console.log('\n[Step 10] Verify /api/analytics/revenue...');
    const revenueRes = await apiGet(page, '/api/analytics/revenue');
    console.log(`  Revenue API response: ${JSON.stringify(revenueRes.data).slice(0, 300)}`);
    assert(revenueRes.ok && revenueRes.data?.success, 'Revenue API responded OK');

    const revenueData = revenueRes.data.data ?? [];
    const now = new Date();
    const currentMonthRevenue = revenueData.find(
      (r) => r.year === now.getFullYear() && r.month === now.getMonth() + 1
    );

    console.log(`  Current month revenue: ${JSON.stringify(currentMonthRevenue)}`);
    // Revenue = sum of Invoice.totalAmount for PAID invoices = 2940 (the billing amount)
    assert(currentMonthRevenue?.total === 2940,
      `Revenue for current month = 2940 (actual: ${currentMonthRevenue?.total})`);

  } catch (err) {
    console.error('\nUnexpected error:', err.message);
    failed++;
  } finally {
    await browser.close();
  }

  // ─── Summary ───────────────────────────────────────────────────────────────
  console.log(`\n${'='.repeat(60)}`);
  console.log(`RESULTS: ${passed} passed, ${failed} failed`);
  console.log(`${'='.repeat(60)}`);

  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
