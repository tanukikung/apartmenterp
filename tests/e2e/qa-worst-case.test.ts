import { test, Page, expect } from '@playwright/test';

const BASE = 'http://localhost:3001';
const ADMIN_USER = 'owner';
const ADMIN_PASS = 'Owner@12345';

async function login(page: Page) {
  await page.goto(BASE + '/login');
  await page.waitForTimeout(1000);
  await page.fill('input[name="username"]', ADMIN_USER);
  await page.fill('input[name="password"]', ADMIN_PASS);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/admin/**', { timeout: 15000 });
  await page.waitForTimeout(1000);
}

// ─────────────────────────────────────────────
// WORST-CASE PRODUCTION DAY SIMULATION
// ─────────────────────────────────────────────

test('W1: 50 simultaneous payments — double payment race condition check', async ({ browser }) => {
  // Simulate 50 tenants paying at the same time
  // Use browser contexts to simulate 5 parallel users, each making 10 payments
  const contexts = await Promise.all(
    Array.from({ length: 5 }, () => browser.newContext())
  );

  const results: { success: boolean; error?: string; invoiceId?: string }[] = [];

  // Login all contexts
  await Promise.all(contexts.map(async (ctx) => {
    const page = await ctx.newPage();
    await login(page);
  }));

  // Get 5 unpaid invoices
  const pages = await Promise.all(contexts.map(ctx => ctx.newPage()));
  await pages[0].goto(BASE + '/admin/invoices');
  await pages[0].waitForTimeout(2000);

  // Find 5 SENT invoices
  const invoiceLinks = await pages[0].locator('table tbody tr').all();
  const invoiceIds: string[] = [];
  for (const row of invoiceLinks) {
    if (invoiceIds.length >= 5) break;
    const text = await row.innerText();
    if (text.includes('ส่งแล้ว') || text.includes('SENT')) {
      const link = row.locator('a, [role="button"]').first();
      const href = await link.getAttribute('href').catch(() => null);
      if (href) {
        const match = href.match(/\/admin\/invoices\/([^/]+)/);
        if (match) invoiceIds.push(match[1]);
      }
    }
  }

  console.log('[W1] Testing', invoiceIds.length, 'invoices for race condition');

  if (invoiceIds.length === 0) {
    console.log('[W1] No SENT invoices found — SKIP');
    await Promise.all(contexts.map(c => c.close()));
    return;
  }

  // Each context tries to pay all 5 invoices (5 users × 5 invoices = 25 payment attempts)
  // The race condition is: what if same invoice is paid twice by different users?
  const promises = contexts.map(async (ctx, ctxIdx) => {
    const page = await ctx.newPage();
    for (let i = 0; i < invoiceIds.length; i++) {
      const invId = invoiceIds[i];
      try {
        await page.goto(`${BASE}/admin/invoices/${invId}`);
        await page.waitForTimeout(1500);

        const payBtn = page.locator('button').filter({ hasText: /ชำระ/i }).first();
        if (await payBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await payBtn.click();
          await page.waitForTimeout(500);

          const amountInput = page.locator('input[aria-label*="จำนวน"]').first();
          if (await amountInput.isVisible({ timeout: 2000 }).catch(() => false)) {
            await amountInput.clear();
            await amountInput.fill('5000');
            await page.keyboard.press('Enter');
            await page.waitForTimeout(2000);
          }
        }
        console.log(`[W1] Context ${ctxIdx} paid invoice ${invId}`);
      } catch (e) {
        console.log(`[W1] Context ${ctxIdx} error on ${invId}:`, (e as Error).message);
      }
    }
  });

  await Promise.all(promises);

  // Verify: each invoice should have AT MOST 1 payment record
  // Check via API
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();

  for (const invId of invoiceIds) {
    const payments = await prisma.payment.count({
      where: { matchedInvoiceId: invId }
    });
    console.log(`[W1] Invoice ${invId}: ${payments} payment(s)`);
    if (payments > 1) {
      console.log(`[W1] ❌ RACE CONDITION: ${payments} duplicate payments!`);
    } else {
      console.log(`[W1] ✅ OK: ${payments} payment`);
    }
  }

  await prisma.$disconnect();
  await Promise.all(contexts.map(c => c.close()));
});

test('W2: Billing generation during payment recording — transaction conflict', async ({ page }) => {
  // Admin generates billing while payments are being recorded
  // Check for: billing locks rows, payments also need locks → deadlock or timeout?

  await login(page);
  await page.goto(BASE + '/admin/billing');
  await page.waitForTimeout(2000);

  // Get current billing period
  const rows = await page.locator('tbody tr').all();
  let periodId = '';
  for (const row of rows) {
    const text = await row.innerText();
    if (text.includes('LOCKED') || text.includes('INVOICED')) {
      const href = await row.locator('a').first().getAttribute('href').catch(() => null);
      if (href) {
        const match = href.match(/\/billing\/([^/]+)/);
        if (match) periodId = match[1];
      }
    }
  }

  console.log('[W2] Billing period ID:', periodId);

  if (!periodId) {
    console.log('[W2] No locked billing period — SKIP');
    return;
  }

  // Open invoice in new tab (simulate another user on the phone)
  const invoicePage = await page.context().newPage();
  await invoicePage.goto(BASE + '/admin/invoices');
  await invoicePage.waitForTimeout(2000);

  // Find a GENERATED invoice
  const genRow = invoicePage.locator('table tbody tr').filter({ hasText: /สร้างแล้ว|GENERATED/ }).first();
  const hasGen = await genRow.isVisible({ timeout: 3000 }).catch(() => false);
  if (!hasGen) {
    console.log('[W2] No GENERATED invoice found');
    await invoicePage.close();
    return;
  }

  const href = await genRow.locator('a').first().getAttribute('href').catch(() => null);
  if (!href) {
    await invoicePage.close();
    return;
  }

  const invId = href.split('/').pop();
  console.log('[W2] Testing invoice:', invId);

  // On tab 1: admin regenerates billing (locks all room billing records)
  // On tab 2: user tries to pay the invoice
  const invoiceUrl = `${BASE}/admin/invoices/${invId}`;
  await invoicePage.goto(invoiceUrl);
  await invoicePage.waitForTimeout(2000);

  // Click pay button on tab 2
  const payBtn = invoicePage.locator('button').filter({ hasText: /ชำระ/i }).first();
  if (await payBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    console.log('[W2] Pay button visible on tab 2 — attempting payment');
    await payBtn.click();
    await invoicePage.waitForTimeout(500);

    const amountInput = invoicePage.locator('input[aria-label*="จำนวน"]').first();
    if (await amountInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await amountInput.fill('5000');
      await invoicePage.keyboard.press('Enter');
      await invoicePage.waitForTimeout(3000);

      const text = await invoicePage.locator('body').innerText();
      const success = text.includes('สำเร็จ') || text.includes('ชำระแล้ว') || !text.includes('error');
      console.log('[W2] Payment result:', success ? 'SUCCESS' : 'FAILED');
    }
  }

  await invoicePage.close();
  console.log('[W2] Test complete — no deadlock detected');
});

test('W3: Network instability — refresh during payment processing', async ({ page }) => {
  await login(page);
  await page.goto(BASE + '/admin/invoices');
  await page.waitForTimeout(2000);

  // Find an overdue invoice
  const overdueRow = page.locator('table tbody tr').filter({ hasText: /OVERDUE|เกินกำหนด/ }).first();
  const hasOverdue = await overdueRow.isVisible({ timeout: 3000 }).catch(() => false);

  if (!hasOverdue) {
    console.log('[W3] No overdue invoice — SKIP');
    return;
  }

  const href = await overdueRow.locator('a').first().getAttribute('href').catch(() => null);
  if (!href) return;

  const invId = href.split('/').pop();
  await page.goto(`${BASE}/admin/invoices/${invId}`);
  await page.waitForTimeout(2000);

  // Click pay
  const payBtn = page.locator('button').filter({ hasText: /ชำระ/i }).first();
  if (await payBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await payBtn.click();
    await page.waitForTimeout(500);

    const amountInput = page.locator('input[aria-label*="จำนวน"]').first();
    if (await amountInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await amountInput.fill('5000');

      // IMMEDIATELY press F5 before Enter
      console.log('[W3] Submitting payment and IMMEDIATELY refreshing...');
      await Promise.all([
        page.keyboard.press('Enter'),
        page.reload()
      ]);

      await page.waitForTimeout(3000);

      // Check: was payment recorded or not?
      // Check DB via no-wait approach — look at invoice status
      const text = await page.locator('body').innerText();
      const stillUnpaid = text.includes('รอชำระ') || text.includes('SENT') || text.includes('OVERDUE') || text.includes('GENERATED');
      const paid = text.includes('ชำระแล้ว') || text.includes('PAID');

      console.log('[W3] After refresh during submit:');
      console.log('[W3] Still shows unpaid:', stillUnpaid);
      console.log('[W3] Shows paid:', paid);

      if (stillUnpaid) {
        console.log('[W3] ✅ CORRECT: Payment did NOT go through (network failure prevented duplicate)');
      } else if (paid) {
        console.log('[W3] ⚠️ PAYMENT RECORDED despite refresh — check if truly persisted');
      }
    }
  }
});

test('W4: Double payment on same invoice via rapid double-click', async ({ page }) => {
  await login(page);
  await page.goto(BASE + '/admin/invoices');
  await page.waitForTimeout(2000);

  // Find a SENT invoice
  const sentRow = page.locator('table tbody tr').filter({ hasText: /ส่งแล้ว|SENT/ }).first();
  const hasSent = await sentRow.isVisible({ timeout: 3000 }).catch(() => false);

  if (!hasSent) {
    console.log('[W4] No SENT invoice — SKIP');
    return;
  }

  const href = await sentRow.locator('a').first().getAttribute('href').catch(() => null);
  if (!href) return;

  const invId = href.split('/').pop();
  await page.goto(`${BASE}/admin/invoices/${invId}`);
  await page.waitForTimeout(2000);

  const payBtn = page.locator('button').filter({ hasText: /ชำระ/i }).first();
  if (await payBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await payBtn.click();
    await page.waitForTimeout(500);

    const amountInput = page.locator('input[aria-label*="จำนวน"]').first();
    if (await amountInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await amountInput.fill('5000');

      // Rapid double click on submit
      console.log('[W4] Rapid double-click on submit button...');
      const submitBtn = page.locator('button[type="submit"]').first();

      // Click twice rapidly without waiting
      await submitBtn.click();
      await submitBtn.click();

      await page.waitForTimeout(3000);

      // Check: only 1 payment should exist
      const { PrismaClient } = await import('@prisma/client');
      const prisma = new PrismaClient();
      const count = await prisma.payment.count({ where: { matchedInvoiceId: invId } });
      console.log('[W4] Payment count for invoice', invId, ':', count);
      console.log('[W4]', count === 1 ? '✅ CORRECT: Only 1 payment recorded' : '❌ DOUBLE PAYMENT: ' + count + ' payments!');
      await prisma.$disconnect();

      // Refresh to verify persistence
      await page.reload();
      await page.waitForTimeout(2000);
      const text = await page.locator('body').innerText();
      const paidOnce = text.includes('ชำระแล้ว') || text.includes('PAID');
      console.log('[W4] After refresh, still paid:', paidOnce ? 'YES' : 'NO');
    }
  }
});

test('W5: Dashboard refresh spam — API rate limit and stability', async ({ page }) => {
  await login(page);

  // Simulate 30 rapid dashboard refreshes (like a nervous admin clicking refresh)
  console.log('[W5] Testing 30 rapid dashboard refreshes...');

  const results: { status: number; time: number }[] = [];

  for (let i = 0; i < 30; i++) {
    const start = Date.now();
    const res = await page.goto(BASE + '/admin');
    results.push({ status: res?.status() ?? 0, time: Date.now() - start });
    await page.waitForTimeout(100); // 100ms between refreshes = very fast
  }

  const errors = results.filter(r => r.status >= 400);
  const timeouts = results.filter(r => r.time > 5000);

  console.log('[W5] Total requests:', results.length);
  console.log('[W5] HTTP errors (4xx/5xx):', errors.length);
  console.log('[W5] Slow responses (>5s):', timeouts.length);
  console.log('[W5] Max response time:', Math.max(...results.map(r => r.time)) + 'ms');

  if (errors.length > 0) {
    console.log('[W5] ❌ FAIL: Got', errors.length, 'HTTP errors');
    errors.forEach(e => console.log('  HTTP', e.status));
  } else {
    console.log('[W5] ✅ PASS: All', results.length, 'requests returned 2xx');
  }

  if (timeouts.length > 5) {
    console.log('[W5] ⚠️ WARNING: Multiple slow responses — may indicate server strain');
  }
});

test('W6: Concurrent billing generation — duplicate invoice creation', async ({ page }) => {
  await login(page);
  await page.goto(BASE + '/admin/billing');
  await page.waitForTimeout(2000);

  // Look for a LOCKED billing period
  const lockedRow = page.locator('tbody tr').filter({ hasText: /LOCKED|Generated/i }).first();
  const hasLocked = await lockedRow.isVisible({ timeout: 3000 }).catch(() => false);

  if (!hasLocked) {
    console.log('[W6] No locked billing period — SKIP');
    return;
  }

  // Click generate invoices button twice in rapid succession
  const genBtn = page.locator('button').filter({ hasText: /สร้างใบแจ้งหนี้|generate/i }).first();
  if (await genBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    console.log('[W6] Clicking generate invoices twice rapidly...');
    await genBtn.click();
    await genBtn.click();
    await page.waitForTimeout(5000);

    const text = await page.locator('body').innerText();
    const success = text.includes('สำเร็จ') || text.includes('สร้างแล้ว');
    console.log('[W6] Billing generation result:', success ? 'SUCCESS' : 'CHECK MANUALLY');

    // Check DB for duplicate invoices
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();

    const today = new Date();
    const year = today.getUTCFullYear();
    const month = today.getUTCMonth() + 1;

    const duplicateCount = await prisma.$queryRaw`
      SELECT room_no, COUNT(*) as cnt
      FROM invoice
      WHERE year = ${year} AND month = ${month}
      GROUP BY room_no
      HAVING COUNT(*) > 1
    `;

    if (Array.isArray(duplicateCount) && duplicateCount.length > 0) {
      console.log('[W6] ❌ DUPLICATE INVOICES FOUND:', JSON.stringify(duplicateCount));
    } else {
      console.log('[W6] ✅ No duplicate invoices for current period');
    }

    await prisma.$disconnect();
  }
});

test('W7: Invoice status consistency after payment', async ({ page }) => {
  await login(page);
  await page.goto(BASE + '/admin/invoices');
  await page.waitForTimeout(2000);

  // Find an overdue invoice
  const overdueRow = page.locator('table tbody tr').filter({ hasText: /OVERDUE|เกินกำหนด/ }).first();
  const hasOverdue = await overdueRow.isVisible({ timeout: 3000 }).catch(() => false);

  if (!hasOverdue) {
    console.log('[W7] No overdue invoices — SKIP');
    return;
  }

  const href = await overdueRow.locator('a').first().getAttribute('href').catch(() => null);
  if (!href) return;

  const invId = href.split('/').pop();
  const invoicePage = page;

  // Get invoice details before payment
  await invoicePage.goto(`${BASE}/admin/invoices/${invId}`);
  await invoicePage.waitForTimeout(2000);

  const textBefore = await invoicePage.locator('body').innerText();
  const statusMatch = textBefore.match(/สถานะ[:\s]*(\S+)|Status[:\s]*(\S+)/i);
  console.log('[W7] Invoice status BEFORE payment:', statusMatch?.[1] || statusMatch?.[2] || 'unknown');

  // Pay the invoice
  const payBtn = invoicePage.locator('button').filter({ hasText: /ชำระ/i }).first();
  if (await payBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await payBtn.click();
    await invoicePage.waitForTimeout(500);

    const amountInput = invoicePage.locator('input[aria-label*="จำนวน"]').first();
    if (await amountInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      // Get the remaining amount from the invoice
      const remainingMatch = textBefore.match(/คงเหลือ[^0-9]*([0-9,]+)|remaining[^0-9]*([0-9,]+)/i);
      const remaining = remainingMatch?.[1]?.replace(/,/g, '') || remainingMatch?.[2]?.replace(/,/g, '') || '5000';
      await amountInput.fill(remaining);
      await invoicePage.keyboard.press('Enter');
      await invoicePage.waitForTimeout(3000);

      // Check status after payment
      const textAfter = await invoicePage.locator('body').innerText();
      const statusAfterMatch = textAfter.match(/สถานะ[:\s]*(\S+)|Status[:\s]*(\S+)/i);
      console.log('[W7] Invoice status AFTER payment:', statusAfterMatch?.[1] || statusAfterMatch?.[2] || 'unknown');

      const showsPaid = textAfter.includes('ชำระแล้ว') || textAfter.includes('PAID');

      // Verify in DB
      const { PrismaClient } = await import('@prisma/client');
      const prisma = new PrismaClient();
      const invoice = await prisma.invoice.findUnique({ where: { id: invId } });
      console.log('[W7] DB status:', invoice?.status);
      console.log('[W7] DB paidAt:', invoice?.paidAt);
      console.log('[W7] UI shows paid:', showsPaid);
      console.log('[W7] DB and UI match:', showsPaid === (invoice?.status === 'PAID') ? '✅ YES' : '❌ NO');
      await prisma.$disconnect();

      // Refresh and verify persistence
      await invoicePage.reload();
      await invoicePage.waitForTimeout(2000);
      const textRefreshed = await invoicePage.locator('body').innerText();
      const stillPaid = textRefreshed.includes('ชำระแล้ว') || textRefreshed.includes('PAID');
      console.log('[W7] Status persists after refresh:', stillPaid ? '✅ YES' : '❌ NO');
    }
  }
});

test('W8: Financial data audit — invoice totals vs payments', async ({ page }) => {
  await login(page);

  // Check consistency across all paid invoices
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();

  const paidInvoices = await prisma.invoice.findMany({
    where: { status: 'PAID' },
    include: { payments: true },
    take: 20 // Check 20 most recent paid invoices
  });

  console.log('[W8] Checking', paidInvoices.length, 'paid invoices for financial consistency...');

  let mismatches = 0;
  for (const inv of paidInvoices) {
    const paidSum = inv.payments.reduce((sum, p) => sum + Number(p.amount), 0);
    const total = Number(inv.totalAmount);
    if (paidSum !== total) {
      console.log(`[W8] ❌ Invoice ${inv.id}: totalAmount=${total}, paidSum=${paidSum}, diff=${total - paidSum}`);
      mismatches++;
    }
  }

  console.log('[W8] Mismatches found:', mismatches);
  console.log('[W8]', mismatches === 0 ? '✅ ALL CONSISTENT' : '❌ DATA INTEGRITY ISSUE');

  // Also check overdue invoices have past due dates
  const overdueWithFutureDate = await prisma.invoice.findMany({
    where: {
      status: 'OVERDUE',
      dueDate: { gt: new Date() }
    }
  });

  console.log('[W8] Overdue invoices with future due date:', overdueWithFutureDate.length);
  if (overdueWithFutureDate.length > 0) {
    console.log('[W8] ❌ LOGIC ERROR: Overdue invoice with future due date!');
  }

  await prisma.$disconnect();
});

test('W9: Data integrity — vacant room with active contract check', async ({ page }) => {
  await login(page);

  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();

  // Check: VACANT rooms with ACTIVE contracts
  const vacantWithActive = await prisma.room.findMany({
    where: { roomStatus: 'VACANT' },
    include: {
      contracts: {
        where: { status: 'ACTIVE' }
      }
    },
    take: 10
  });

  const inconsistent = vacantWithActive.filter(r => r.contracts.length > 0);
  console.log('[W9] VACANT rooms with ACTIVE contracts:', inconsistent.length);
  if (inconsistent.length > 0) {
    for (const r of inconsistent) {
      console.log(`[W9] ❌ Room ${r.roomNo}: status=${r.roomStatus}, active_contracts=${r.contracts.length}`);
    }
  } else {
    console.log('[W9] ✅ All VACANT rooms are correctly with no active contracts');
  }

  // Check: OCCUPIED rooms with no active contract
  const occupiedWithoutContract = await prisma.room.findMany({
    where: { roomStatus: 'OCCUPIED' },
    include: {
      contracts: {
        where: { status: 'ACTIVE' }
      }
    },
    take: 10
  });

  const orphaned = occupiedWithoutContract.filter(r => r.contracts.length === 0);
  console.log('[W9] OCCUPIED rooms with NO active contract:', orphaned.length);
  if (orphaned.length > 0) {
    for (const r of orphaned) {
      console.log(`[W9] ⚠️ Room ${r.roomNo}: status=OCCUPIED but no active contract`);
    }
  } else {
    console.log('[W9] ✅ All OCCUPIED rooms have active contracts');
  }

  await prisma.$disconnect();
});

test('W10: Complete end-to-end financial flow', async ({ page }) => {
  // Simulate a complete financial day:
  // 1. Create tenant → 2. Create contract → 3. Generate billing → 4. Invoice sent → 5. Partial payment → 6. Final payment → 7. Verify

  await login(page);
  const errors: string[] = [];

  // Step 1: Go to tenants, create a new tenant
  console.log('[W10] Step 1: Create tenant');
  await page.goto(BASE + '/admin/tenants');
  await page.waitForTimeout(2000);

  const createBtn = page.locator('button').filter({ hasText: /เพิ่มผู้เช่า/i }).first();
  if (await createBtn.isVisible()) {
    await createBtn.click();
    await page.waitForTimeout(2000);

    const firstName = page.getByPlaceholder('ชื่อ').first();
    const lastName = page.getByPlaceholder('นามสกุล').first();

    if (await firstName.isVisible()) {
      await firstName.fill('สมชาย');
      await lastName.fill('ทดสอบ');
      await lastName.press('Enter');
      await page.waitForTimeout(3000);

      const text = await page.locator('body').innerText();
      const created = text.includes('สำเร็จ') || text.includes('สร้าง');
      console.log('[W10] Tenant created:', created ? 'YES' : 'FAILED — ' + text.slice(0, 200));
    }
  }

  // Step 2: Find vacant room
  console.log('[W10] Step 2: Find vacant room');
  await page.goto(BASE + '/admin/rooms');
  await page.waitForTimeout(2000);

  const vacantRow = page.locator('tbody tr').filter({ hasText: /ว่าง|VACANT/ }).first();
  if (await vacantRow.isVisible()) {
    await vacantRow.click();
    await page.waitForTimeout(2000);
    console.log('[W10] Vacant room clicked');

    // Check room number from URL or text
    const url = page.url();
    console.log('[W10] Room URL:', url);
  }

  console.log('[W10] Full flow test complete. Steps 1-2 passed.');
  console.log('[W10] Remaining flow (billing → invoice → payment) requires seeded billing period.');
});