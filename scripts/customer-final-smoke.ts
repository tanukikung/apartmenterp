import { chromium, type BrowserContext, type ConsoleMessage, type Page, devices } from '@playwright/test';
import fs from 'fs';
import path from 'path';

type Issue = {
  type: 'console' | 'pageerror' | 'requestfailed' | 'http' | 'visible-error';
  page: string;
  message: string;
  url?: string;
  status?: number;
};

type PageResult = {
  key: string;
  label: string;
  path: string;
  screenshot: string;
  title: string;
  heading: string | null;
  visibleErrors: string[];
};

type SmokeReport = {
  generatedAt: string;
  baseUrl: string;
  credentials: {
    username: string;
    passwordSource: string;
  };
  health: Record<string, unknown>;
  pages: PageResult[];
  issues: Issue[];
  summary: {
    pageCount: number;
    issueCount: number;
    blockingIssueCount: number;
  };
};

const OUTPUT_DIR = path.join(
  process.cwd(),
  'screenshots',
  'production-review',
  'customer-final',
);
const ENV_PATH = path.join(process.cwd(), '.env.customer');

const PAGE_SPECS = [
  { key: 'login', label: 'หน้าเข้าสู่ระบบ', path: '/login', requiresAuth: false },
  { key: 'dashboard', label: 'แดชบอร์ด', path: '/admin/dashboard', requiresAuth: true },
  { key: 'rooms', label: 'รายการห้อง', path: '/admin/rooms', requiresAuth: true },
  { key: 'room-798-1', label: 'รายละเอียดห้อง 798/1', path: '/admin/rooms/798%2F1', requiresAuth: true },
  { key: 'tenants', label: 'ผู้เช่า', path: '/admin/tenants', requiresAuth: true },
  { key: 'invoices', label: 'ใบแจ้งหนี้', path: '/admin/invoices', requiresAuth: true },
  { key: 'payments', label: 'การชำระเงิน', path: '/admin/payments', requiresAuth: true },
  { key: 'overdue', label: 'ค้างชำระ', path: '/admin/overdue', requiresAuth: true },
  { key: 'expenses', label: 'ค่าใช้จ่าย', path: '/admin/expenses', requiresAuth: true },
  { key: 'broadcast', label: 'ประกาศ', path: '/admin/broadcast', requiresAuth: true },
  { key: 'reports', label: 'รายงาน', path: '/admin/reports', requiresAuth: true },
  { key: 'documents', label: 'เอกสาร', path: '/admin/documents', requiresAuth: true },
  { key: 'integrations', label: 'ตั้งค่าการเชื่อมต่อ', path: '/admin/settings/integrations', requiresAuth: true },
  { key: 'system-health', label: 'สุขภาพระบบ', path: '/admin/system-health', requiresAuth: true },
];

const VISIBLE_ERROR_PATTERNS = [
  /Unhandled Runtime Error/i,
  /Something went wrong/i,
  /Application error/i,
  /Invalid request data/i,
  /expenses\.filter is not a function/i,
  /\b(?:404|500)\s+(?:error|page|not found|internal server error)\b/i,
  /\bInternal Server Error\b/i,
  /\bNot Found\b/i,
];

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function loadEnvFile(filePath: string): Record<string, string> {
  const env: Record<string, string> = {};
  const raw = fs.readFileSync(filePath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index === -1) continue;
    env[trimmed.slice(0, index)] = trimmed.slice(index + 1);
  }
  return env;
}

function sanitizeFileName(key: string): string {
  return key.replace(/[^a-z0-9-_]/gi, '-').toLowerCase();
}

function buildIssuesCollector(issues: Issue[], page: Page, pageLabel: string): void {
  page.on('pageerror', (error) => {
    issues.push({ type: 'pageerror', page: pageLabel, message: error.message });
  });

  page.on('console', (message: ConsoleMessage) => {
    if (message.type() !== 'error') return;
    issues.push({
      type: 'console',
      page: pageLabel,
      message: message.text(),
      url: page.url(),
    });
  });

  page.on('requestfailed', (request) => {
    issues.push({
      type: 'requestfailed',
      page: pageLabel,
      message: request.failure()?.errorText || 'Request failed',
      url: request.url(),
    });
  });

  page.on('response', (response) => {
    const status = response.status();
    if (status < 400) return;
    issues.push({
      type: 'http',
      page: pageLabel,
      message: `${status} ${response.statusText()}`,
      status,
      url: response.url(),
    });
  });
}

async function waitForStablePage(page: Page): Promise<void> {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(1200);
  try {
    await page.waitForLoadState('networkidle', { timeout: 10000 });
  } catch {
    // Some pages keep polling; domcontentloaded + small delay is good enough for smoke.
  }
  await page.waitForTimeout(1000);
}

async function findVisibleErrors(page: Page): Promise<string[]> {
  const bodyText = await page.locator('body').innerText().catch(() => '');
  const matches = VISIBLE_ERROR_PATTERNS
    .filter((pattern) => pattern.test(bodyText))
    .map((pattern) => pattern.toString());
  return [...new Set(matches)];
}

async function capturePage(
  context: BrowserContext,
  issues: Issue[],
  spec: (typeof PAGE_SPECS)[number],
  baseUrl: string,
): Promise<PageResult> {
  const page = await context.newPage();
  buildIssuesCollector(issues, page, spec.key);

  await page.goto(`${baseUrl}${spec.path}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitForStablePage(page);

  const title = await page.title();
  const heading = await page.locator('h1').first().textContent().catch(() => null);
  const visibleErrors = await findVisibleErrors(page);
  for (const visibleError of visibleErrors) {
    issues.push({
      type: 'visible-error',
      page: spec.key,
      message: visibleError,
      url: page.url(),
    });
  }

  const fileName = `${sanitizeFileName(spec.key)}.png`;
  const absolutePath = path.join(OUTPUT_DIR, fileName);
  await page.screenshot({ path: absolutePath, fullPage: true });
  await page.close();

  return {
    key: spec.key,
    label: spec.label,
    path: spec.path,
    screenshot: absolutePath,
    title,
    heading,
    visibleErrors,
  };
}

async function login(page: Page, baseUrl: string, username: string, password: string): Promise<void> {
  await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.getByRole('textbox', { name: /username|ชื่อผู้ใช้/i }).fill(username);
  await page.getByRole('textbox', { name: /password|รหัสผ่าน/i }).fill(password);
  await Promise.all([
    page.waitForURL('**/admin/**', { timeout: 20000 }),
    page.getByRole('button', { name: /sign in|เข้าสู่ระบบ/i }).click(),
  ]);
  await waitForStablePage(page);
}

async function fetchJson(context: BrowserContext, url: string): Promise<unknown> {
  const response = await context.request.get(url);
  return {
    ok: response.ok(),
    status: response.status(),
    json: await response.json().catch(async () => ({ text: await response.text() })),
  };
}

async function main(): Promise<void> {
  ensureDir(OUTPUT_DIR);

  const env = loadEnvFile(ENV_PATH);
  const baseUrl = env.APP_BASE_URL || 'http://localhost:3000';
  const username = 'owner';
  const password = env.SEED_OWNER_PASSWORD;

  if (!password) {
    throw new Error('SEED_OWNER_PASSWORD is missing in .env.customer');
  }

  const issues: Issue[] = [];
  const pageResults: PageResult[] = [];
  const browser = await chromium.launch({ headless: true });
  const desktopContext = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    locale: 'th-TH',
    timezoneId: 'Asia/Bangkok',
  });

  const loginPage = await desktopContext.newPage();
  buildIssuesCollector(issues, loginPage, 'login');
  await loginPage.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitForStablePage(loginPage);
  const loginScreenshot = path.join(OUTPUT_DIR, 'login.png');
  await loginPage.screenshot({ path: loginScreenshot, fullPage: true });
  pageResults.push({
    key: 'login',
    label: 'หน้าเข้าสู่ระบบ',
    path: '/login',
    screenshot: loginScreenshot,
    title: await loginPage.title(),
    heading: await loginPage.locator('h1').first().textContent().catch(() => null),
    visibleErrors: await findVisibleErrors(loginPage),
  });
  await login(loginPage, baseUrl, username, password);
  await loginPage.close();

  for (const spec of PAGE_SPECS.filter((page) => page.requiresAuth)) {
    const result = await capturePage(desktopContext, issues, spec, baseUrl);
    pageResults.push(result);
  }

  const storageStatePath = path.join(OUTPUT_DIR, 'storage-state.json');
  await desktopContext.storageState({ path: storageStatePath });

  const mobileContext = await browser.newContext({
    ...devices['iPhone 13'],
    locale: 'th-TH',
    timezoneId: 'Asia/Bangkok',
    storageState: storageStatePath,
  });

  const mobileDashboard = await capturePage(
    mobileContext,
    issues,
    { key: 'dashboard-mobile', label: 'แดชบอร์ดมือถือ', path: '/admin/dashboard', requiresAuth: true },
    baseUrl,
  );
  const mobileRooms = await capturePage(
    mobileContext,
    issues,
    { key: 'rooms-mobile', label: 'รายการห้องมือถือ', path: '/admin/rooms', requiresAuth: true },
    baseUrl,
  );
  pageResults.push(mobileDashboard, mobileRooms);

  const health = {
    apiHealth: await fetchJson(desktopContext, `${baseUrl}/api/health`),
    deepHealth: await fetchJson(desktopContext, `${baseUrl}/api/health/deep`),
  };

  await mobileContext.close();
  await desktopContext.close();
  await browser.close();

  const blockingIssueCount = issues.filter((issue) => {
    if (issue.type === 'pageerror' || issue.type === 'requestfailed') return true;
    if (issue.type === 'http') return (issue.status || 0) >= 400;
    return true;
  }).length;

  const report: SmokeReport = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    credentials: {
      username,
      passwordSource: '.env.customer (SEED_OWNER_PASSWORD)',
    },
    health,
    pages: pageResults,
    issues,
    summary: {
      pageCount: pageResults.length,
      issueCount: issues.length,
      blockingIssueCount,
    },
  };

  fs.writeFileSync(path.join(OUTPUT_DIR, 'report.json'), JSON.stringify(report, null, 2), 'utf8');
  console.log(`Customer smoke report written to ${path.join(OUTPUT_DIR, 'report.json')}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
