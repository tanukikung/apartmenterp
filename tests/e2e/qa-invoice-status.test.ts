import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:3001';

test.describe('QA: Invoice Status Count Bug', () => {

  test('Debug status totals API responses', async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.waitForLoadState('networkidle');
    await page.locator('input[name="username"], input[type="text"]').first().fill('owner');
    await page.locator('input[name="password"], input[type="password"]').first().fill('Owner@12345');
    await page.locator('button[type="submit"]').first().click();
    await page.waitForURL('**/admin/**', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(2000);

    const statuses = ['GENERATED', 'SENT', 'VIEWED', 'PAID', 'OVERDUE'];
    const results: Record<string, any> = {};

    for (const s of statuses) {
      const res = await page.evaluate(
        (status) => fetch(`/api/invoices?status=${status}&pageSize=1&page=1`).then(r => r.json()),
        s
      );
      results[s] = res;
      console.log(`${s} API response:`, JSON.stringify(res, null, 2).substring(0, 300));
    }

    // Now check: the issue is total from the status-specific query
    const counts = Object.fromEntries(
      statuses.map(s => [s, (results[s] as any)?.data?.total ?? '(no total)'])
    );
    console.log('\nExtracted totals:');
    console.log(JSON.stringify(counts, null, 2));
  });

  test('Direct DB: count each status', async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.waitForLoadState('networkidle');
    await page.locator('input[name="username"], input[type="text"]').first().fill('owner');
    await page.locator('input[name="password"], input[type="password"]').first().fill('Owner@12345');
    await page.locator('button[type="submit"]').first().click();
    await page.waitForURL('**/admin/**', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(2000);

    // Use the analytics summary which has the correct counts
    const summary = await page.evaluate(() =>
      fetch('/api/analytics/summary').then(r => r.json())
    );

    console.log('Summary API (authoritative counts):');
    console.log('  unpaidInvoices:', summary.data?.unpaidInvoices, '(should = GENERATED + SENT + VIEWED)');
    console.log('  paidInvoices:', summary.data?.paidInvoices);
    console.log('  overdueInvoices:', summary.data?.overdueInvoices);

    // Now call each status count directly
    const statuses = ['GENERATED', 'SENT', 'VIEWED', 'PAID', 'OVERDUE'];
    const directCounts: Record<string, number> = {};
    for (const s of statuses) {
      const res = await page.evaluate(
        (status) => fetch(`/api/invoices?status=${status}&pageSize=1&page=1`).then(r => r.json()),
        s
      );
      // Try different paths for the total
      const total = (res as any)?.data?.total
        ?? (res as any)?.total
        ?? (Array.isArray((res as any)?.data) ? (res as any).data.length : 'unknown');
      directCounts[s] = total as any;
    }

    console.log('\nDirect status counts (API):');
    console.log(JSON.stringify(directCounts, null, 2));
    console.log('\nSum of GENERATED+SENT+VIEWED:', directCounts['GENERATED'] + directCounts['SENT'] + (directCounts['VIEWED'] as any || 0));
    console.log('Expected unpaidInvoices:', summary.data?.unpaidInvoices);
  });

  test('Invoices page: check status totals object', async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.waitForLoadState('networkidle');
    await page.locator('input[name="username"], input[type="text"]').first().fill('owner');
    await page.locator('input[name="password"], input[type="password"]').first().fill('Owner@12345');
    await page.locator('button[type="submit"]').first().click();
    await page.waitForURL('**/admin/**', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(2000);

    // Go to invoices page
    await page.goto(`${BASE}/admin/invoices`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(4000);

    // Extract visible tab counts
    const content = await page.locator('body').innerText();

    // The page shows tabs with counts - extract them
    const tabs: Record<string, string | null> = {};
    const patterns = [
      /ทั้งหมด\s+(\S+)/,
      /สร้างแล้ว\s+(\S+)/,
      /ส่งแล้ว\s+(\S+)/,
      /เปิดดูแล้ว\s+(\S+)/,
      /ชำระแล้ว\s+(\S+)/,
      /เกินกำหนด\s+(\S+)/,
    ];

    for (const [label, pattern] of [['ทั้งหมด', patterns[0]], ['สร้างแล้ว', patterns[1]], ['ส่งแล้ว', patterns[2]], ['เปิดดูแล้ว', patterns[3]], ['ชำระแล้ว', patterns[4]], ['เกินกำหนด', patterns[5]]]) {
      const m = content.match(pattern);
      tabs[label] = m ? m[1] : 'NOT FOUND';
    }

    console.log('UI Tab counts:', JSON.stringify(tabs, null, 2));

    // Get summary for comparison
    const summary = await page.evaluate(() =>
      fetch('/api/analytics/summary').then(r => r.json())
    );
    console.log('\nSummary API counts:');
    console.log('  unpaidInvoices:', summary.data?.unpaidInvoices);
    console.log('  paidInvoices:', summary.data?.paidInvoices);
    console.log('  overdueInvoices:', summary.data?.overdueInvoices);
  });
});
