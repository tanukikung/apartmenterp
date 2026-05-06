import { chromium } from 'playwright';

interface TestResult {
  url: string;
  status: 'PASS' | 'FAIL' | 'ERROR';
  statusCode?: number;
  error?: string;
  consoleErrors?: string[];
  loadTime?: number;
}

const BASE_URL = 'http://localhost:3001';
const USERNAME = 'owner';
const PASSWORD = 'Owner@12345';

// All pages to test (prioritized by importance)
const PAGES_TO_TEST = [
  // Main dashboard & core
  '/admin/dashboard',
  '/admin',

  // Core business pages
  '/admin/rooms',
  '/admin/tenants',
  '/admin/contracts',
  '/admin/invoices',
  '/admin/payments',
  '/admin/billing',

  // Sub-pages under Billing
  '/admin/billing/batches',
  '/admin/billing/import',
  '/admin/billing/wizard',

  // Sub-pages under Payments
  '/admin/payments/review',
  '/admin/payments/review-match',
  '/admin/payments/upload-statement',

  // Administrative pages
  '/admin/documents',
  '/admin/documents/generate',
  '/admin/expenses',
  '/admin/maintenance',
  '/admin/deliveries',
  '/admin/moveouts',
  '/admin/tenant-registrations',

  // Reports & Analytics
  '/admin/analytics',
  '/admin/reports',
  '/admin/reports/audit',
  '/admin/reports/collections',
  '/admin/reports/documents',
  '/admin/reports/occupancy',
  '/admin/reports/profit-loss',
  '/admin/reports/revenue',

  // Compliance & Audit
  '/admin/audit-logs',
  '/admin/late-fees',
  '/admin/overdue',

  // Communication
  '/admin/broadcast',
  '/admin/chat',
  '/admin/message-templates',

  // System & Settings
  '/admin/system-health',
  '/admin/system-jobs',
  '/admin/outbox',
  '/admin/settings',
  '/admin/settings/account',
  '/admin/settings/automation',
  '/admin/settings/bank-accounts',
  '/admin/settings/billing-policy',
  '/admin/settings/billing-rules',
  '/admin/settings/building',
  '/admin/settings/integrations',
  '/admin/settings/message-sequences',
  '/admin/settings/modules',
  '/admin/settings/reminders',
  '/admin/settings/roles',
  '/admin/settings/rooms',
  '/admin/settings/staff-requests',
  '/admin/settings/system',
  '/admin/settings/users',

  // Templates
  '/admin/templates',

  // Floors
  '/admin/floors',

  // Docs
  '/admin/docs',

  // Notifications
  '/admin/notifications',
];

async function runTests() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const results: TestResult[] = [];
  const consoleErrorsByPage = new Map<string, string[]>();

  try {
    // Login
    console.log('\n🔐 Logging in...');
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await page.fill('input[name="username"]', USERNAME);
    await page.fill('input[name="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 });
    console.log('✅ Login successful\n');

    // Test each page
    for (const pageUrl of PAGES_TO_TEST) {
      const fullUrl = `${BASE_URL}${pageUrl}`;
      const consoleErrors: string[] = [];

      // Capture console errors
      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          consoleErrors.push(msg.text());
        }
      });

      try {
        const startTime = Date.now();
        const response = await page.goto(fullUrl, {
          waitUntil: 'domcontentloaded',
          timeout: 15000
        });
        const loadTime = Date.now() - startTime;

        if (!response) {
          results.push({
            url: pageUrl,
            status: 'ERROR',
            error: 'No response from server',
          });
          console.log(`❌ ${pageUrl} - No response`);
          continue;
        }

        const statusCode = response.status();

        // Check if page loaded successfully
        if (statusCode >= 200 && statusCode < 300) {
          // Wait a bit for any async content to load
          await page.waitForTimeout(500);

          const result: TestResult = {
            url: pageUrl,
            status: consoleErrors.length === 0 ? 'PASS' : 'FAIL',
            statusCode,
            loadTime,
          };

          if (consoleErrors.length > 0) {
            result.consoleErrors = consoleErrors;
            consoleErrorsByPage.set(pageUrl, consoleErrors);
          }

          const icon = result.status === 'PASS' ? '✅' : '⚠️';
          console.log(`${icon} ${pageUrl} (${loadTime}ms)`);
          results.push(result);
        } else {
          results.push({
            url: pageUrl,
            status: 'FAIL',
            statusCode,
            error: `HTTP ${statusCode}`,
          });
          console.log(`❌ ${pageUrl} - HTTP ${statusCode}`);
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        results.push({
          url: pageUrl,
          status: 'ERROR',
          error: errorMsg,
        });
        console.log(`❌ ${pageUrl} - ${errorMsg}`);
      }

      // Remove console listener
      page.removeAllListeners('console');
    }

    // Summary
    console.log('\n' + '='.repeat(80));
    console.log('TEST SUMMARY');
    console.log('='.repeat(80));

    const passed = results.filter(r => r.status === 'PASS').length;
    const failed = results.filter(r => r.status === 'FAIL').length;
    const errors = results.filter(r => r.status === 'ERROR').length;

    console.log(`\n✅ PASSED: ${passed}`);
    console.log(`❌ FAILED: ${failed}`);
    console.log(`⚠️  ERRORS: ${errors}`);
    console.log(`📊 TOTAL:  ${results.length}`);
    console.log(`🎯 PASS RATE: ${((passed / results.length) * 100).toFixed(1)}%\n`);

    if (failed > 0) {
      console.log('Failed pages:');
      results
        .filter(r => r.status === 'FAIL')
        .forEach(r => {
          console.log(`  - ${r.url} (HTTP ${r.statusCode}): ${r.error}`);
        });
      console.log('');
    }

    if (errors > 0) {
      console.log('Error pages:');
      results
        .filter(r => r.status === 'ERROR')
        .forEach(r => {
          console.log(`  - ${r.url}: ${r.error}`);
        });
      console.log('');
    }

    if (consoleErrorsByPage.size > 0) {
      console.log('Pages with console errors:');
      consoleErrorsByPage.forEach((errors, url) => {
        console.log(`  ${url}:`);
        errors.slice(0, 3).forEach(err => {
          console.log(`    - ${err.substring(0, 100)}`);
        });
        if (errors.length > 3) {
          console.log(`    ... and ${errors.length - 3} more`);
        }
      });
      console.log('');
    }

    // Return exit code based on results
    const hasFailures = failed > 0 || errors > 0;
    process.exit(hasFailures ? 1 : 0);

  } catch (error) {
    console.error('Test suite error:', error);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

runTests();
