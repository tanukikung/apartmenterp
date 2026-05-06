/**
 * Comprehensive Audit Script
 * Tests all pages and API routes for errors, hydration issues, and runtime problems
 */

const BASE_URL = 'http://localhost:3001';
const PAGES = [
  '/admin',
  '/admin/dashboard',
  '/admin/billing',
  '/admin/billing/batches',
  '/admin/billing/import',
  '/admin/billing/wizard',
  '/admin/invoices',
  '/admin/payments',
  '/admin/payments/review',
  '/admin/payments/review-match',
  '/admin/payments/upload-statement',
  '/admin/late-fees',
  '/admin/overdue',
  '/admin/rooms',
  '/admin/floors',
  '/admin/tenants',
  '/admin/tenant-registrations',
  '/admin/contracts',
  '/admin/moveouts',
  '/admin/maintenance',
  '/admin/deliveries',
  '/admin/expenses',
  '/admin/chat',
  '/admin/documents',
  '/admin/templates',
  '/admin/message-templates',
  '/admin/reports',
  '/admin/reports/audit',
  '/admin/reports/collections',
  '/admin/reports/occupancy',
  '/admin/reports/profit-loss',
  '/admin/reports/revenue',
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
  '/admin/setup',
  '/admin/system',
  '/admin/system-jobs',
  '/admin/system-health',
  '/admin/outbox',
  '/admin/audit-logs',
  '/admin/users',
  '/admin/broadcast',
  '/admin/analytics',
  '/admin/notifications',
  '/admin/docs',
];

const API_ROUTES = [
  '/api/health',
  '/api/health/deep',
  '/api/audit-logs',
  '/api/admin/dashboard-alerts',
  '/api/admin/maintenance',
  '/api/admin/outbox',
  '/api/admin/registration-requests',
  '/api/admin/system-health/alerts',
  '/api/admin/users',
  '/api/analytics/occupancy',
  '/api/analytics/revenue',
  '/api/analytics/summary',
  '/api/bank-accounts',
  '/api/billing',
  '/api/billing-cycles',
  '/api/billing-rules',
  '/api/broadcast',
  '/api/chat/quick-reply',
  '/api/chat/reply',
  '/api/contracts',
  '/api/conversations',
  '/api/deliveries',
  '/api/delivery-orders',
  '/api/diag/endpoint-timings',
  '/api/diag/perf',
  '/api/diag/slow-queries',
  '/api/documents',
  '/api/expenses',
  '/api/financial-audit',
  '/api/floors',
  '/api/invoices',
  '/api/late-fees',
  '/api/maintenance',
  '/api/message-templates',
  '/api/messages/failed',
  '/api/messaging-sequences',
  '/api/metrics',
  '/api/moveouts',
  '/api/notifications',
  '/api/payments',
  '/api/payments/review',
  '/api/payments/matched',
  '/api/reconciliation/issues',
  '/api/reminders/config',
  '/api/reports/collections',
  '/api/reports/profit-loss',
  '/api/reports/revenue',
  '/api/rooms',
  '/api/rooms/fix-status',
  '/api/search',
  '/api/settings/automation',
  '/api/settings/bank-accounts',
  '/api/settings/building',
  '/api/settings/integrations',
  '/api/settings/modules',
  '/api/system/alerts',
  '/api/system/backup-status',
  '/api/templates',
  '/api/tenant-registrations',
  '/api/tenants',
];

async function fetchPage(url, cookies = '') {
  try {
    const response = await fetch(url, {
      headers: {
        'Accept': 'text/html',
        ...(cookies && { 'Cookie': cookies }),
      },
    });
    const text = await response.text();
    return {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      text: text.substring(0, 5000), // First 5KB for quick analysis
      textLength: text.length,
    };
  } catch (error) {
    return { status: 'ERROR', error: error.message };
  }
}

async function fetchApi(url, method = 'GET', body = null, cookies = '') {
  try {
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(cookies && { 'Cookie': cookies }),
      },
    };
    if (body) options.body = JSON.stringify(body);

    const response = await fetch(url, options);
    const contentType = response.headers.get('content-type') || '';

    let data;
    let text;
    if (contentType.includes('application/json')) {
      data = await response.json();
      text = JSON.stringify(data).substring(0, 3000);
    } else {
      text = await response.text();
    }

    return {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      data,
      text,
    };
  } catch (error) {
    return { status: 'ERROR', error: error.message };
  }
}

async function login() {
  const response = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'owner', password: 'Owner@12345' }),
    redirect: 'manual',
  });

  const setCookieHeader = response.headers.get('set-cookie');
  return setCookieHeader || '';
}

async function runAudit() {
  console.log('=== COMPREHENSIVE SYSTEM AUDIT ===\n');

  // First login to get session
  console.log('--- Logging in as owner ---');
  const cookies = await login();
  if (!cookies) {
    console.log('ERROR: Could not login\n');
    return;
  }
  console.log('Login successful\n');

  const results = { pages: [], apis: [], issues: [] };

  // Audit pages
  console.log('--- AUDITING PAGES ---\n');
  for (const page of PAGES) {
    const url = `${BASE_URL}${page}`;
    const result = await fetchPage(url, cookies);

    if (result.error) {
      results.issues.push({ type: 'PAGE_ERROR', url, error: result.error });
      console.log(`❌ ${page}: ERROR - ${result.error}`);
    } else if (result.status !== 200) {
      results.issues.push({ type: 'PAGE_STATUS', url, status: result.status });
      console.log(`⚠️  ${page}: Status ${result.status}`);
    } else {
      // Check for common error patterns in HTML
      const text = result.text;
      const hasErrors = text.includes('Unhandled Promise Rejection') ||
                        text.includes('TypeError:') ||
                        text.includes('ReferenceError:') ||
                        text.includes('Internal Server Error') ||
                        text.includes('Application error');

      if (hasErrors) {
        results.issues.push({ type: 'PAGE_CONTENT_ERROR', url, text: text.substring(0, 500) });
        console.log(`❌ ${page}: Contains error content`);
      } else {
        console.log(`✅ ${page}: OK`);
      }
    }
    results.pages.push({ url, result });
  }

  // Audit API routes
  console.log('\n--- AUDITING API ROUTES ---\n');
  for (const route of API_ROUTES) {
    const url = `${BASE_URL}${route}`;
    const result = await fetchApi(url, 'GET', null, cookies);

    if (result.error) {
      results.issues.push({ type: 'API_ERROR', url, error: result.error });
      console.log(`❌ ${route}: ERROR - ${result.error}`);
    } else if (typeof result.status === 'number' && result.status >= 400) {
      results.issues.push({ type: 'API_STATUS', url, status: result.status, text: result.text });
      console.log(`⚠️  ${route}: Status ${result.status}`);
    } else if (result.data && typeof result.data === 'object') {
      // Check for API error envelope
      if (result.data.error && !result.data.success) {
        results.issues.push({ type: 'API_ERROR_RESPONSE', url, data: result.data });
        console.log(`❌ ${route}: API error - ${result.text.substring(0, 100)}`);
      } else if (result.data.success === false) {
        results.issues.push({ type: 'API_FALSE_SUCCESS', url, data: result.data });
        console.log(`❌ ${route}: success=false`);
      } else {
        console.log(`✅ ${route}: OK`);
      }
    } else {
      console.log(`✅ ${route}: OK`);
    }
    results.apis.push({ url, result });
  }

  // Summary
  console.log('\n=== AUDIT SUMMARY ===');
  console.log(`Pages checked: ${results.pages.length}`);
  console.log(`API routes checked: ${results.apis.length}`);
  console.log(`Issues found: ${results.issues.length}`);

  if (results.issues.length > 0) {
    console.log('\n--- CRITICAL ISSUES ---');
    results.issues.forEach((issue, i) => {
      console.log(`\n[${i + 1}] ${issue.type}: ${issue.url}`);
      console.log(JSON.stringify(issue, null, 2).substring(0, 500));
    });
  }

  return results;
}

runAudit().then(() => process.exit(0)).catch(e => {
  console.error(e);
  process.exit(1);
});
