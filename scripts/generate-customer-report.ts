import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { chromium } from 'playwright';

type AnyRecord = Record<string, any>;
type FindingLevel = 'good' | 'warn' | 'bad';
type PageStatus = 'pass' | 'warn' | 'bad' | 'neutral';

type Finding = {
  level: FindingLevel;
  title: string;
  description: string;
  source?: string;
};

type ScreenshotItem = {
  key: string;
  title: string;
  caption: string;
  sourcePath?: string;
  hasImage: boolean;
  href?: string;
  status: PageStatus;
};

type ChecklistItem = {
  label: string;
  status: PageStatus;
  note: string;
};

const ROOT = path.resolve(process.cwd());
const INPUT_CANDIDATES = [
  path.join(ROOT, 'screenshots', 'production-review', 'customer-final', 'report.json'),
  path.join(ROOT, 'screenshots', 'production-review', 'report.json'),
  path.join(ROOT, 'screenshots', 'production-review', 'final-recheck-report.json'),
  path.join(ROOT, 'screenshots', 'production-review', 'post-fix-report.json'),
];
const SCREENSHOT_DIR_CANDIDATES = [
  path.join(ROOT, 'screenshots', 'production-review', 'customer-final'),
  path.join(ROOT, 'screenshots', 'production-review'),
];
const OUTPUT_BASE_DEFAULT = path.join(ROOT, 'reports', 'customer-install-report');
const CSS_PATH = path.join(ROOT, 'reports', 'customer-report.css');

const SCREENSHOT_ORDER = [
  'login',
  'dashboard',
  'rooms',
  'room-detail',
  'tenants',
  'billing',
  'invoices',
  'payments',
  'overdue',
  'expenses',
  'broadcast',
  'reports',
  'reports-occupancy',
  'reports-revenue',
  'reports-collections',
  'system-health',
  'settings',
  'settings-integrations',
  'documents',
  'dashboard-mobile',
  'rooms-mobile',
];

const LABELS: Record<string, string> = {
  login: 'หน้าเข้าสู่ระบบ',
  dashboard: 'แดชบอร์ดหลัก',
  rooms: 'หน้ารายการห้อง',
  'room-detail': 'หน้ารายละเอียดห้อง',
  tenants: 'หน้าผู้เช่า',
  billing: 'หน้าบิล',
  invoices: 'หน้าใบแจ้งหนี้',
  payments: 'หน้ารับชำระเงิน',
  overdue: 'หน้าติดตามค้างชำระ',
  expenses: 'หน้าค่าใช้จ่าย',
  broadcast: 'หน้าแจ้งประกาศ',
  reports: 'หน้ารายงาน',
  'reports-occupancy': 'รายงานอัตราห้องพัก',
  'reports-revenue': 'รายงานรายได้',
  'reports-collections': 'รายงานการเก็บเงิน',
  'system-health': 'หน้าสถานะระบบ',
  settings: 'หน้าตั้งค่าระบบ',
  'settings-integrations': 'หน้าการเชื่อมต่อ',
  documents: 'หน้าเอกสาร',
  'dashboard-mobile': 'แดชบอร์ดบนมือถือ',
  'rooms-mobile': 'หน้าห้องพักบนมือถือ',
};

function argValue(args: string[], name: string) {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
}

function hasArg(args: string[], name: string) {
  return args.includes(`--${name}`);
}

function pickExisting(candidates: string[]) {
  return candidates.find((candidate) => candidate && fs.existsSync(candidate));
}

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson<T = AnyRecord>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function maskPassword(value: string) {
  if (value.length <= 4) return '•'.repeat(value.length);
  return `${value.slice(0, 2)}${'•'.repeat(Math.max(4, value.length - 4))}${value.slice(-2)}`;
}

function formatDate(value: unknown) {
  const date = value ? new Date(String(value)) : new Date();
  if (Number.isNaN(date.getTime())) return 'ไม่ระบุ';
  return new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'Asia/Bangkok',
  }).format(date);
}

function normalizeToken(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function flattenList(value: unknown) {
  const input = Array.isArray(value) ? value : value ? [value] : [];
  return input
    .flatMap((item) => {
      if (typeof item === 'string') return [item];
      if (!item || typeof item !== 'object') return [];
      const record = item as AnyRecord;
      const text = record.message ?? record.error ?? record.text ?? record.url;
      return text ? [String(text)] : [];
    })
    .filter(Boolean)
    .map(String);
}

function collectImages(directories: string[]) {
  const files: string[] = [];
  const stack = [...directories.filter(Boolean)];
  const seen = new Set<string>();

  while (stack.length > 0) {
    const current = stack.pop()!;
    if (!fs.existsSync(current) || seen.has(current)) continue;
    seen.add(current);

    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (/\.(png|jpg|jpeg|webp)$/i.test(entry.name)) files.push(full);
    }
  }

  return files;
}

function scoreMatch(expectedKey: string, candidateStem: string) {
  const a = normalizeToken(expectedKey);
  const b = normalizeToken(candidateStem);
  if (!a || !b) return 0;
  if (a === b) return 1000;
  if (b === `${a}-mobile` || b === `${a}-desktop`) return 950;
  if (a === `${b}-mobile` || a === `${b}-desktop`) return 900;
  if (b.includes(a)) return 800 - (b.length - a.length);
  if (a.includes(b)) return 760 - (a.length - b.length);
  const overlap = a.split('-').filter((part) => b.includes(part)).length;
  return overlap * 20;
}

function findScreenshotPath(key: string, files: string[], preferred: string[] = []) {
  const tokens = [...preferred, key, `${key}-mobile`, `${key}-desktop`];
  let best: { path: string; score: number } | null = null;

  for (const file of files) {
    const stem = path.basename(file, path.extname(file));
    let score = 0;
    for (const token of tokens) score = Math.max(score, scoreMatch(token, stem));
    if (score > 0 && (!best || score > best.score)) best = { path: file, score };
  }

  return best?.path;
}

function toDataUrl(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  const mime =
    ext === '.png' ? 'image/png' :
    ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' :
    ext === '.webp' ? 'image/webp' : 'application/octet-stream';
  const content = fs.readFileSync(filePath);
  return `data:${mime};base64,${content.toString('base64')}`;
}

function buildFontCss() {
  const weights = [400, 500, 700, 800];
  return weights.map((weight) => {
    const file = path.join(ROOT, 'node_modules', '@fontsource', 'sarabun', 'files', `sarabun-latin-${weight}-normal.woff2`);
    return `@font-face{font-family:'Sarabun';src:url('${pathToFileURL(file).href}') format('woff2');font-style:normal;font-weight:${weight};font-display:swap;}`;
  }).join('\n');
}

function selectReportInput(preferred?: string) {
  if (preferred && fs.existsSync(preferred)) return preferred;
  for (const candidate of INPUT_CANDIDATES) {
    if (!fs.existsSync(candidate)) continue;
    try {
      const raw = readJson<AnyRecord>(candidate);
      const size =
        Array.isArray(raw.pages) ? raw.pages.length :
        Array.isArray(raw.results) ? raw.results.length :
        Array.isArray(raw.summary) ? raw.summary.length :
        0;
      if (size > 0) return candidate;
    } catch {
      // ignore parse errors and continue
    }
  }
  return preferred && fs.existsSync(preferred) ? preferred : pickExisting(INPUT_CANDIDATES);
}

function normalizeReport(report: AnyRecord) {
  const generatedAt = report.generatedAt ?? report.checkedAt ?? report.createdAt ?? new Date().toISOString();
  const baseUrl = report.baseURL ?? report.baseUrl ?? 'http://localhost:3000';
  const rawPages =
    Array.isArray(report.pages) ? report.pages :
    Array.isArray(report.results) ? report.results :
    Array.isArray(report.summary) ? report.summary :
    [];
  const deep = report.deepHealth ?? report.health?.deepHealth ?? report.health ?? {};
  const deepData = deep?.data ?? deep?.json?.data ?? {};
  const services = deepData?.services ?? deep?.services ?? {};
  const servicesDetailed = deepData?.servicesDetailed ?? deep?.servicesDetailed ?? {};
  const missingEnv = Array.isArray(deepData?.missingEnv) ? deepData.missingEnv : [];
  const reportIssues = Array.isArray(report.issues) ? report.issues : [];

  const pages = rawPages.map((item: AnyRecord) => {
    const key = String(item.key ?? item.name ?? item.path ?? 'page');
    const pageErrors = flattenList(item.pageErrors).concat(flattenList(item.newPageErrors));
    const consoleErrors = flattenList(item.consoleErrors).concat(flattenList(item.newConsoleErrors));
    const networkIssues = flattenList(item.networkIssues).concat(flattenList(item.newNetworkIssues));
    const alerts = flattenList(item.alerts).concat(flattenList(item.visibleErrors));
    const hasIssues =
      pageErrors.length > 0 ||
      consoleErrors.length > 0 ||
      networkIssues.some((text) => /404|422|500|FAILED|ERR_ABORTED/i.test(text)) ||
      alerts.some((text) => /404|422|500|FAILED|ERR_ABORTED/i.test(text)) ||
      Boolean(item.hasKnownErrorText);
    return {
      key,
      label: String(item.label ?? item.name ?? item.key ?? item.path ?? key),
      path: String(item.path ?? item.url ?? ''),
      url: String(item.url ?? ''),
      h1: String(item.h1 ?? item.heading ?? ''),
      summaryText: String(item.summaryText ?? ''),
      alerts,
      buttons: flattenList(item.buttons),
      pageErrors,
      consoleErrors,
      networkIssues,
      hasIssues,
    };
  });

  const findings: Finding[] = [];
  const seen = new Set<string>();
  const addFinding = (level: FindingLevel, title: string, description: string, source?: string) => {
    const key = `${level}|${title}|${description}|${source ?? ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    findings.push({ level, title, description, source });
  };

  for (const page of pages) {
    if (page.pageErrors.length > 0) addFinding('bad', `เกิด page error บน ${page.key}`, page.pageErrors.slice(0, 2).join(' | '), page.url || page.path);
    if (page.consoleErrors.length > 0) addFinding('warn', `มี console warning บน ${page.key}`, page.consoleErrors.slice(0, 2).join(' | '), page.url || page.path);
    const failed = [...page.alerts, ...page.networkIssues].filter((text) => /404|422|500|FAILED|ERR_ABORTED/i.test(text));
    if (failed.length > 0) addFinding('bad', `มี request fail บน ${page.key}`, failed.slice(0, 2).join(' | '), page.url || page.path);
    if (/invalid request data/i.test(page.summaryText) || /filter is not a function/i.test(page.summaryText)) {
      addFinding('bad', `หน้าจอ ${page.key} มีข้อความผิดปกติ`, page.summaryText, page.url || page.path);
    }
  }

  for (const issue of reportIssues) {
    const message = String(issue?.message ?? issue?.title ?? issue?.description ?? '');
    if (!message) continue;
    const severity = String(issue?.severity ?? issue?.level ?? '').toLowerCase();
    addFinding(severity === 'warn' ? 'warn' : 'bad', message, String(issue?.detail ?? issue?.source ?? ''), String(issue?.page ?? issue?.source ?? ''));
  }

  const servicePairs: Array<[string, any]> = [
    ['database', services.database ?? servicesDetailed?.database?.status],
    ['redis', services.redis ?? servicesDetailed?.redis?.status],
    ['app', services.app ?? servicesDetailed?.app?.status],
    ['worker', services.worker?.status ?? servicesDetailed?.worker?.status],
    ['backup', services.backup?.status ?? servicesDetailed?.backup?.status],
    ['env', services.env],
  ];
  for (const [name, status] of servicePairs) {
    if (!status) continue;
    const value = String(status).toLowerCase();
    if (['ok', 'connected', 'alive', 'true'].includes(value)) continue;
    addFinding(/not_configured/i.test(String(status)) ? 'warn' : 'bad', `บริการ ${name} อยู่ในสถานะ ${status}`, 'ตรวจสอบ environment, Redis, backup และ worker บนเครื่องปลายทางอีกครั้ง', 'deep health');
  }

  if (missingEnv.length > 0) {
    addFinding('warn', 'Optional integrations are not fully configured', missingEnv.join(', '), 'deep health');
  }

  const badCount = findings.filter((item) => item.level === 'bad').length;
  const warnCount = findings.filter((item) => item.level === 'warn').length;
  const readyLevel = badCount === 0 ? (warnCount === 0 ? 'ready' : 'ready-with-notes') : 'needs-work';

  return {
    generatedAt,
    baseUrl,
    deep,
    services,
    pages,
    findings,
    readyLevel,
    pagesPassed: pages.filter((page) => !page.hasIssues).length,
    pagesFailed: pages.filter((page) => page.hasIssues).length,
  };
}

function extractCredentials(report: AnyRecord) {
  const source = report.credentials ?? report.install?.credentials ?? report.handOff?.credentials ?? null;
  if (source && typeof source === 'object') {
    return {
      ownerUser: String(source.ownerUser ?? source.owner ?? source.adminUser ?? 'owner'),
      staffUser: String(source.staffUser ?? source.staff ?? 'staff'),
      ownerPassword: source.ownerPassword ? String(source.ownerPassword) : null,
      staffPassword: source.staffPassword ? String(source.staffPassword) : null,
      notes: flattenList(source.notes),
    };
  }

  return {
    ownerUser: 'owner',
    staffUser: 'staff',
    ownerPassword: null,
    staffPassword: null,
    notes: [
      'รหัสผ่านเริ่มต้นถูกสร้างใหม่เฉพาะการติดตั้งครั้งนั้น และควรเปลี่ยนทันทีหลังเข้าใช้งานครั้งแรก',
      'ถ้าผู้ส่งมอบมีไฟล์ `.env.customer` ให้เก็บเป็นข้อมูลทางเทคนิค ไม่ควรแจกต่อให้ผู้ใช้ทั่วไป',
    ],
  };
}

function createUsageSteps(report: ReturnType<typeof normalizeReport>) {
  const base = report.baseUrl.replace(/\/$/, '');
  return [
    { step: '1', title: 'ติดตั้งและเปิดระบบ', body: `รัน customer stack แล้วเปิดระบบผ่าน ${base} จากนั้นตรวจว่าหน้า login โหลดได้` },
    { step: '2', title: 'เข้าใช้งานด้วยบัญชี owner', body: 'ล็อกอินด้วยบัญชีผู้ดูแลเพื่อยืนยันว่า dashboard และเมนูหลักพร้อมใช้งาน' },
    { step: '3', title: 'เปลี่ยนรหัสผ่านทันที', body: 'หลังล็อกอินครั้งแรกให้เปลี่ยนรหัสผ่านของ owner/staff แล้วเก็บ credential ใหม่ไว้ในที่ปลอดภัย' },
    { step: '4', title: 'ตรวจงานประจำวัน', body: 'เปิดห้องพัก ผู้เช่า ใบแจ้งหนี้ รับชำระเงิน และรายงาน เพื่อดูว่าข้อมูลวิ่งครบทุกโมดูล' },
    { step: '5', title: 'เช็คสุขภาพระบบ', body: 'เปิด System Health ก่อนส่งมอบจริงทุกครั้ง เพื่อดู database, worker, Redis และ backup ว่าพร้อมอยู่' },
  ];
}

function buildScreens(report: ReturnType<typeof normalizeReport>, images: string[]) {
  const selected: ScreenshotItem[] = [];
  const seen = new Set<string>();

  for (const key of SCREENSHOT_ORDER) {
    const source = report.pages.find((page) => normalizeToken(page.key) === normalizeToken(key))
      ?? report.pages.find((page) => normalizeToken(page.key).includes(normalizeToken(key)))
      ?? report.pages.find((page) => normalizeToken(page.label).includes(normalizeToken(key)));
    const shotPath = findScreenshotPath(key, images, [String(source?.key ?? ''), String(source?.label ?? ''), String(source?.path ?? '')]);
    if (!source && !shotPath) continue;
    if (shotPath) seen.add(shotPath);
    selected.push({
      key,
      title: LABELS[key] ?? key,
      caption: source
        ? `${LABELS[key] ?? key} (${source.path || source.url || 'flow'})${source.h1 ? ` · หัวเรื่อง: ${source.h1}` : ''}`
        : `${LABELS[key] ?? key} จาก evidence`,
      sourcePath: shotPath,
      hasImage: Boolean(shotPath),
      href: source?.url || `${report.baseUrl.replace(/\/$/, '')}${source?.path ?? ''}`,
      status: source?.hasIssues ? 'bad' : 'pass',
    });
  }

  for (const filePath of images) {
    if (seen.has(filePath)) continue;
    const stem = normalizeToken(path.basename(filePath, path.extname(filePath)));
    const source = report.pages.find((page) => normalizeToken(page.key).includes(stem) || stem.includes(normalizeToken(page.key)))
      ?? report.pages.find((page) => normalizeToken(page.label).includes(stem) || stem.includes(normalizeToken(page.label)));
    const key = normalizeToken(source?.key ?? stem);
    selected.push({
      key,
      title: LABELS[source?.key ?? stem] ?? path.basename(filePath, path.extname(filePath)),
      caption: source
        ? `${LABELS[source.key] ?? source.key} (${source.path || source.url || 'flow'})${source.h1 ? ` · หัวเรื่อง: ${source.h1}` : ''}`
        : `ภาพหน้าจอ ${path.basename(filePath)}`,
      sourcePath: filePath,
      hasImage: true,
      href: source?.url || `${report.baseUrl.replace(/\/$/, '')}${source?.path ?? ''}`,
      status: source?.hasIssues ? 'bad' : 'neutral',
    });
  }

  return selected.sort((a, b) => {
    const ai = SCREENSHOT_ORDER.indexOf(a.key);
    const bi = SCREENSHOT_ORDER.indexOf(b.key);
    if (ai === -1 && bi === -1) return a.key.localeCompare(b.key);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}

function buildChecklist(report: ReturnType<typeof normalizeReport>): ChecklistItem[] {
  const byKey = new Map(report.pages.map((page) => [normalizeToken(page.key), page] as const));
  const hasCleanPage = (keys: string[]) => {
    const item = keys.map((key) => byKey.get(normalizeToken(key))).find(Boolean);
    return item ? !item.hasIssues : false;
  };

  return [
    { label: 'ติดตั้งและเปิดระบบด้วย customer stack', status: report.findings.some((item) => item.level === 'bad') ? 'warn' : 'pass', note: 'เช็คว่าระบบ install ขึ้นและหน้าแรกโหลดได้โดยไม่ล้ม' },
    { label: 'เข้าสู่ระบบและเข้าถึงแดชบอร์ดได้', status: hasCleanPage(['dashboard']) ? 'pass' : 'warn', note: 'ใช้ยืนยัน login และ quick action หลักของผู้ดูแล' },
    { label: 'รายการห้องและรายละเอียดห้องเปิดได้', status: hasCleanPage(['rooms', 'room-detail']) ? 'pass' : 'warn', note: 'ยืนยัน flow การ drill-down ของห้องและกรณี room id มี /' },
    { label: 'ผู้เช่า ใบแจ้งหนี้ รับชำระ และค้างชำระทำงาน', status: hasCleanPage(['tenants', 'invoices', 'payments', 'overdue']) ? 'pass' : 'warn', note: 'ครอบคลุมงานรายวันของผู้ดูแลอาคาร' },
    { label: 'รายงานและ System Health เปิดได้', status: hasCleanPage(['reports', 'reports-occupancy', 'system-health']) ? 'pass' : 'warn', note: 'ใช้ดูความพร้อมของระบบก่อนขึ้น production' },
    { label: 'ไม่มี console/page/network error สำคัญ', status: report.findings.length === 0 ? 'pass' : 'bad', note: report.findings.length === 0 ? 'ไม่มีข้อค้นพบจากผลเทสต์รอบล่าสุด' : `${report.findings.length} ข้อค้นพบ ต้องเก็บก่อนส่งมอบ` },
  ];
}

function buildSummaryCards(report: ReturnType<typeof normalizeReport>, screenshots: ScreenshotItem[]) {
  const deep = report.deep?.data ?? report.deep ?? {};
  const workerAlive = deep.services?.worker?.alive ?? deep.worker?.alive;
  const backupStatus = deep.services?.backup?.status ?? deep.backup?.status ?? 'n/a';
  const readyText =
    report.readyLevel === 'ready'
      ? 'พร้อมส่งมอบ'
      : report.readyLevel === 'ready-with-notes'
        ? 'พร้อมส่งมอบ แต่มีหมายเหตุ'
        : 'ยังมีจุดที่ต้องเก็บ';

  return [
    { label: 'หน้า/flow ที่ตรวจ', value: String(report.pages.length || screenshots.length || 0), sub: 'รวมหน้าจอและ flow ที่มี evidence' },
    { label: 'ผ่านแบบไม่มี error', value: String(report.pagesPassed), sub: `${report.pagesFailed} flow มี issue` },
    { label: 'สุขภาพระบบ', value: String(deep.status ?? 'unknown'), sub: `worker: ${String(workerAlive ?? 'n/a')}` },
    { label: 'ความพร้อมส่งมอบ', value: readyText, sub: `backup: ${String(backupStatus)}` },
  ];
}

function statusText(status: PageStatus) {
  switch (status) {
    case 'pass':
      return 'ผ่าน';
    case 'warn':
      return 'เตือน';
    case 'bad':
      return 'มีปัญหา';
    default:
      return 'ข้อมูล';
  }
}

function statusClass(status: PageStatus) {
  switch (status) {
    case 'pass':
      return 'status-pass';
    case 'warn':
      return 'status-warn';
    case 'bad':
      return 'status-bad';
    default:
      return 'status-neutral';
  }
}

function renderScreenshotCard(shot: ScreenshotItem) {
  const image = shot.hasImage && shot.sourcePath
    ? `<img src="${escapeHtml(toDataUrl(shot.sourcePath))}" alt="${escapeHtml(shot.title)}" />`
    : `<div style="height:212px; display:grid; place-items:center; background:#f8fafc; color:#94a3b8; border-radius:14px; border:1px dashed #cbd5e1; font-size:13px; font-weight:700;">ไม่พบภาพ</div>`;
  return `
    <div class="shot-card">
      <div class="shot-frame">${image}</div>
      <div class="shot-meta">
        <h3 class="shot-title">${escapeHtml(shot.title)}</h3>
        <p class="shot-caption">${escapeHtml(shot.caption)}</p>
        <div class="shot-foot">${escapeHtml(shot.key)} · <span class="status-chip ${statusClass(shot.status)}">${statusText(shot.status)}</span></div>
      </div>
    </div>
  `;
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

function renderHtml(model: {
  title: string;
  report: ReturnType<typeof normalizeReport>;
  credentials: ReturnType<typeof extractCredentials>;
  screenshots: ScreenshotItem[];
  checklist: ChecklistItem[];
  usage: { step: string; title: string; body: string }[];
  summaryCards: { label: string; value: string; sub: string }[];
  sourceReport: string;
  screenshotRoot: string;
  outputPdf: string;
}) {
  const creds = model.credentials ?? {
    ownerUser: 'owner',
    staffUser: 'staff',
    ownerPassword: null,
    staffPassword: null,
    notes: [],
  };
  const findings = model.report.findings.length > 0
    ? model.report.findings
    : [{ level: 'good' as const, title: 'ไม่พบข้อค้นพบเชิงบล็อกเกอร์', description: 'ผลตรวจรอบนี้ไม่มี page error, console error หรือ request fail สำคัญ' }];
  const screenshotGroups = chunk(model.screenshots, 4);
  const credentialNotes = (creds.notes ?? []).map((note: string) => `<li>${escapeHtml(note)}</li>`).join('');
  const installCards = model.summaryCards.map((card) => `
    <div class="mini-card"><div class="mini-label">${escapeHtml(card.label)}</div><div class="mini-value" style="font-size:20px;">${escapeHtml(card.value)}</div><div class="mini-desc">${escapeHtml(card.sub)}</div></div>
  `).join('');
  const usageHtml = model.usage.map((item) => `
    <div class="step"><div class="step-num">${escapeHtml(item.step)}</div><div><h4>${escapeHtml(item.title)}</h4><p>${escapeHtml(item.body)}</p></div></div>
  `).join('');
  const checklistHtml = model.checklist.map((item) => `
    <tr><td>${escapeHtml(item.label)}</td><td><span class="status-chip ${statusClass(item.status)}">${statusText(item.status)}</span></td><td>${escapeHtml(item.note)}</td></tr>
  `).join('');
  const findingsHtml = findings.map((item) => `
    <div class="finding ${item.level}"><div class="dot"></div><div><h4>${escapeHtml(item.title)}</h4><p>${escapeHtml(item.description)}${item.source ? ` <span class="muted">(${escapeHtml(item.source)})</span>` : ''}</p></div></div>
  `).join('');
  const summaryPills = model.summaryCards.map((card) => `<span class="pill">${escapeHtml(card.label)}: ${escapeHtml(card.value)}</span>`).join('');
  const readyText =
    model.report.readyLevel === 'ready'
      ? 'ระบบพร้อมใช้งานเชิง business flow และเอกสารนี้ใช้ส่งมอบลูกค้าได้ทันที'
      : model.report.readyLevel === 'ready-with-notes'
        ? 'ระบบใช้งานได้ แต่ยังมีหมายเหตุด้าน infra หรือ health ที่ควรเก็บก่อนส่งมอบจริง'
        : 'ยังไม่ควรประกาศว่า ideal เต็ม 100% จนกว่าจะปิดข้อค้นพบทั้งหมดและตรวจซ้ำอีกรอบ';

  const screenshotHtml = screenshotGroups.length > 0
    ? screenshotGroups.map((group, index) => `
        <section class="page">
          <div class="page-inner">
            <div class="page-header">
              <div>
                <div class="eyebrow"><span>04</span> หน้าจอสำคัญ</div>
                <h2 class="title-compact mt-12">ภาพจากการใช้งานจริง</h2>
                <p class="section-lead">กลุ่มภาพนี้ดึงจาก screenshot ที่ตรวจพบในโฟลเดอร์ evidence เพื่อให้ลูกค้าเห็น flow จริงแบบเป็นขั้นตอน</p>
              </div>
              <div class="mini-card"><div class="mini-label">ชุดภาพ</div><div class="mini-value">${index + 1}/${screenshotGroups.length}</div><div class="mini-desc">แสดงภาพตามลำดับการใช้งาน</div></div>
            </div>
            <div class="screenshot-grid">${group.map(renderScreenshotCard).join('')}</div>
          </div>
        </section>
      `).join('')
    : `
      <section class="page"><div class="page-inner"><div class="banner"><div class="icon">!</div><div><h3>ไม่พบไฟล์ภาพหน้าจอ</h3><p>สคริปต์พบ report JSON แต่ยังไม่พบ screenshot ในโฟลเดอร์ที่ระบุ จึงสร้างรายงานโดยแสดงส่วนสรุปแทน หากต้องการภาพจริง ให้รันชุด capture-screenshots ก่อน</p></div></div></div></section>
    `;

  return `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(model.title)}</title>
  <style>${buildFontCss()}\n${fs.readFileSync(CSS_PATH, 'utf8')}</style>
</head>
<body>
  <div class="report-shell">
    <section class="page cover">
      <div class="page-inner">
        <div>
          <div class="eyebrow eyebrow-dark"><span>Apartment ERP</span> Customer Verification</div>
          <h1>${escapeHtml(model.title)}</h1>
          <p class="subtitle" style="color: rgba(255,255,255,0.88); max-width: 62ch;">
            รายงานตรวจรับติดตั้งและคู่มือใช้งานเบื้องต้นจากการทดสอบจริงแบบลูกค้าใช้งานจริง
            ครอบคลุมการติดตั้งระบบ การเข้าใช้งานหน้าหลัก การเปิดหน้าสำคัญ และการสรุปความพร้อมก่อนส่งมอบ
          </p>
          <div class="pill-row">
            <span class="pill">Generated: ${escapeHtml(formatDate(model.report.generatedAt))}</span>
            <span class="pill">Base URL: ${escapeHtml(model.report.baseUrl)}</span>
            <span class="pill">Health: ${escapeHtml(String(model.report.deep?.status ?? 'unknown'))}</span>
            <span class="pill">Pages: ${escapeHtml(String(model.report.pages.length || model.screenshots.length || 0))}</span>
          </div>
        </div>
        <div class="cover-grid">
          <div class="hero-copy"><div class="stat-grid">${installCards}</div></div>
          <div class="hero-panel">
            <h2>สรุปสั้น</h2>
            <div class="hero-note">${escapeHtml(readyText)}</div>
            <div class="mt-16"><div class="hero-note" style="margin-bottom:10px;">สถานะบริการที่เห็นจาก deep health</div><div class="pill-row" style="margin-top:0;">${summaryPills}</div></div>
          </div>
        </div>
      </div>
    </section>

    <section class="page"><div class="page-inner">
      <div class="page-header">
        <div><div class="eyebrow"><span>01</span> install summary</div><h2 class="title-compact mt-12">ภาพรวมการติดตั้งและความพร้อมก่อนใช้งาน</h2><p class="section-lead">ข้อมูลชุดนี้ใช้เป็นหน้าตรวจรับเบื้องต้นว่าระบบติดตั้งขึ้นได้ ตรวจ health แล้ว และเปิดหน้าหลักสำคัญได้จริง</p></div>
        <div class="mini-card"><div class="mini-label">ความพร้อม</div><div class="mini-value">${escapeHtml(model.report.readyLevel === 'ready' ? 'Ready' : model.report.readyLevel === 'ready-with-notes' ? 'Ready+' : 'Review')}</div><div class="mini-desc">${escapeHtml(model.report.pagesFailed > 0 ? `${model.report.pagesFailed} page(s) มี issue` : 'ไม่พบ page failure สำคัญ')}</div></div>
      </div>
      <div class="info-grid">
        <div class="info-card"><div class="label">ฐานตรวจรับ</div><div class="value">${escapeHtml(formatDate(model.report.generatedAt))}</div><div class="desc">Base URL: ${escapeHtml(model.report.baseUrl)}</div></div>
        <div class="info-card"><div class="label">ไฟล์ต้นทาง</div><div class="value">${escapeHtml(model.sourceReport)}</div><div class="desc">Screenshot root: ${escapeHtml(model.screenshotRoot)}</div></div>
        <div class="info-card"><div class="label">สถานะการตรวจ</div><div class="value">${escapeHtml(model.report.readyLevel === 'ready' ? 'ผ่าน' : model.report.readyLevel === 'ready-with-notes' ? 'ผ่านพร้อมหมายเหตุ' : 'ต้องเก็บเพิ่มเติม')}</div><div class="desc">พบข้อค้นพบ ${escapeHtml(String(model.report.findings.length))} รายการ</div></div>
      </div>
      <div class="section mt-18"><div class="banner"><div class="icon">i</div><div><h3>ข้อแนะนำสำหรับลูกค้า</h3><p>หลังเปิดระบบครั้งแรก ให้เปลี่ยนรหัสผ่านของบัญชีเริ่มต้นทันที และใช้ credential ที่สร้างเฉพาะการติดตั้งครั้งนั้นเท่านั้น อย่าแชร์ไฟล์ env.customer หรือไฟล์ handoff กับคนที่ไม่เกี่ยวข้อง</p></div></div></div>
      <div class="section mt-18"><div class="three-col">${installCards}</div></div>
    </div></section>

    <section class="page"><div class="page-inner">
      <div class="page-header">
        <div><div class="eyebrow"><span>02</span> วิธีใช้งาน</div><h2 class="title-compact mt-12">คู่มือใช้งานระบบแบบย่อสำหรับลูกค้า</h2><p class="section-lead">สรุปเป็น flow ที่ใช้สอนลูกค้าได้ทันที เรียงจากเปิดระบบจนถึงตรวจสุขภาพระบบ</p></div>
        <div class="mini-card"><div class="mini-label">ฐานใช้งาน</div><div class="mini-value" style="font-size:18px;">${escapeHtml(model.report.baseUrl)}</div><div class="mini-desc">เปิดระบบจาก browser แล้วเริ่มที่หน้า login</div></div>
      </div>
      <div class="two-col">
        <div class="card card-pad"><h3 class="section-title">ลำดับการใช้งานหลัก</h3><div class="step-list">${usageHtml}</div></div>
        <div class="card card-pad credential-card"><h3 class="section-title">ข้อมูลบัญชีเริ่มต้นและข้อควรระวัง</h3>
          <div class="credential-grid mt-12">
            <div class="credential-keys">
              <div class="credential-row"><div class="k">บัญชีเจ้าของระบบ</div><div class="v">${escapeHtml(creds.ownerUser)}</div></div>
              <div class="credential-row"><div class="k">บัญชีเจ้าหน้าที่</div><div class="v">${escapeHtml(creds.staffUser)}</div></div>
              <div class="credential-row"><div class="k">รหัสผ่าน owner</div><div class="v">${escapeHtml(creds.ownerPassword ? maskPassword(creds.ownerPassword) : 'เก็บใน handoff')}</div></div>
              <div class="credential-row"><div class="k">รหัสผ่าน staff</div><div class="v">${escapeHtml(creds.staffPassword ? maskPassword(creds.staffPassword) : 'เก็บใน handoff')}</div></div>
            </div>
            <div class="callout"><p><strong>Change password note</strong><br />บัญชีเริ่มต้นถูกสร้างเพื่อใช้ส่งมอบครั้งแรกเท่านั้น ลูกค้าควรเปลี่ยนรหัสผ่านทันทีหลังล็อกอิน และเก็บไฟล์ handoff ไว้ในที่ปลอดภัย หากมีการใช้งานหลายสาขา แนะนำแยก credential ต่อไซต์</p><ul class="mt-12" style="margin:12px 0 0; padding-left:18px; line-height:1.7;">${credentialNotes}</ul></div>
          </div>
        </div>
      </div>
    </div></section>

    <section class="page"><div class="page-inner">
      <div class="page-header">
        <div><div class="eyebrow"><span>03</span> checklist</div><h2 class="title-compact mt-12">ผลตรวจรับและเช็กลิสต์การใช้งาน</h2><p class="section-lead">สรุปว่าหน้าหลักเปิดได้หรือไม่ และมีข้อค้นพบระดับไหนบ้างจาก smoke test รอบล่าสุด</p></div>
        <div class="mini-card"><div class="mini-label">ข้อค้นพบ</div><div class="mini-value">${escapeHtml(String(model.report.findings.length))}</div><div class="mini-desc">bad: ${escapeHtml(String(model.report.findings.filter((f) => f.level === 'bad').length))}, warn: ${escapeHtml(String(model.report.findings.filter((f) => f.level === 'warn').length))}</div></div>
      </div>
      <div class="two-col">
        <div><h3 class="section-title">ข้อค้นพบสำคัญ</h3><div class="finding-list">${findingsHtml}</div></div>
        <div><h3 class="section-title">เช็กลิสต์ตรวจรับ</h3><div class="table-wrap"><table class="report-table"><thead><tr><th>รายการ</th><th>สถานะ</th><th>หมายเหตุ</th></tr></thead><tbody>${checklistHtml}</tbody></table></div><div class="footer-note">เช็กลิสต์นี้ออกแบบให้ส่งต่อทีมลูกค้าได้เลย โดยใช้ร่วมกับภาพหน้าจอและ summary ด้านบน</div></div>
      </div>
    </div></section>

    ${screenshotHtml}

    <section class="page"><div class="page-inner">
      <div class="page-header">
        <div><div class="eyebrow"><span>05</span> final readiness</div><h2 class="title-compact mt-12">สรุปความพร้อมก่อนส่งมอบ</h2><p class="section-lead">หน้าสุดท้ายสรุปภาพรวมทั้งหมด เพื่อให้ลูกค้าหรือทีมส่งมอบตัดสินใจได้เร็วว่า ideal พอสำหรับขึ้น production หรือยัง</p></div>
        <div class="mini-card"><div class="mini-label">ready level</div><div class="mini-value">${escapeHtml(model.report.readyLevel === 'ready' ? 'READY' : model.report.readyLevel === 'ready-with-notes' ? 'READY+' : 'REVIEW')}</div><div class="mini-desc">${escapeHtml(model.report.readyLevel === 'ready' ? 'ผ่านครบ' : model.report.readyLevel === 'ready-with-notes' ? 'ผ่านพร้อมหมายเหตุ' : 'ยังต้องแก้')}</div></div>
      </div>
      <div class="mini-grid">
        <div class="mini-card"><div class="mini-label">Pages passed</div><div class="mini-value">${escapeHtml(String(model.report.pagesPassed))}</div><div class="mini-desc">หน้าที่เปิดได้โดยไม่มี issue สำคัญ</div></div>
        <div class="mini-card"><div class="mini-label">Findings</div><div class="mini-value">${escapeHtml(String(model.report.findings.length))}</div><div class="mini-desc">รวมข้อค้นพบเชิง review และ infra</div></div>
        <div class="mini-card"><div class="mini-label">System Health</div><div class="mini-value">${escapeHtml(String(model.report.deep?.status ?? 'unknown'))}</div><div class="mini-desc">อ่านจาก deep health endpoint</div></div>
        <div class="mini-card"><div class="mini-label">Screens</div><div class="mini-value">${escapeHtml(String(model.screenshots.length))}</div><div class="mini-desc">ภาพที่แนบใน PDF นี้</div></div>
      </div>
      <div class="section mt-18"><div class="banner"><div class="icon">✓</div><div><h3>ข้อสรุปสุดท้าย</h3><p>${escapeHtml(readyText)}</p></div></div></div>
      <div class="mt-18"><div class="pill-row" style="color: var(--muted);">${summaryPills}</div><p class="footer-note">เอกสารนี้สร้างจาก smoke-test JSON และ screenshot evidence ที่แนบในโฟลเดอร์ตรวจรับจริง</p></div>
    </div></section>
  </div>
</body>
</html>`;
}

async function main() {
  const args = process.argv.slice(2);
  if (hasArg(args, 'help')) {
    console.log([
      'Usage:',
      '  npx tsx scripts/generate-customer-report.ts [--input path] [--screenshots dir] [--output base]',
      '',
      'Default input candidates:',
      ...INPUT_CANDIDATES.map((value) => `  - ${value}`),
      '',
      'Default screenshot dirs:',
      ...SCREENSHOT_DIR_CANDIDATES.map((value) => `  - ${value}`),
      '',
      `Default output base:`,
      `  - ${OUTPUT_BASE_DEFAULT}`,
    ].join('\n'));
    return;
  }

  const inputPath = selectReportInput(argValue(args, 'input') ? path.resolve(argValue(args, 'input')!) : undefined);
  if (!inputPath) {
    throw new Error(`Cannot find smoke-test JSON. Looked in:\n- ${INPUT_CANDIDATES.join('\n- ')}`);
  }

  const screenshotDir = pickExisting([
    argValue(args, 'screenshots') ? path.resolve(argValue(args, 'screenshots')!) : '',
    ...SCREENSHOT_DIR_CANDIDATES,
  ]);
  const outputBase = argValue(args, 'output') ? path.resolve(argValue(args, 'output')!.replace(/\.(pdf|html)$/i, '')) : OUTPUT_BASE_DEFAULT;
  ensureDir(path.dirname(outputBase));
  const sourceReport = path.relative(ROOT, inputPath);
  const screenshotRoot = path.relative(ROOT, screenshotDir ?? SCREENSHOT_DIR_CANDIDATES[0]);

  const raw = readJson<AnyRecord>(inputPath);
  const report = normalizeReport(raw);
  const credentials = extractCredentials(raw);
  const images = screenshotDir ? collectImages([screenshotDir]) : [];
  const screenshots = buildScreens(report, images);
  const checklist = buildChecklist(report);
  const usage = createUsageSteps(report);
  const summaryCards = buildSummaryCards(report, screenshots);
  const title = 'รายงานตรวจรับติดตั้งและคู่มือใช้งานระบบ Apartment ERP';
  const outputHtml = `${outputBase}.html`;
  const outputPdf = `${outputBase}.pdf`;

  const html = renderHtml({
    title,
    report,
    credentials,
    screenshots,
    checklist,
    usage,
    summaryCards,
    sourceReport,
    screenshotRoot,
    outputPdf,
  });

  fs.writeFileSync(outputHtml, html, 'utf8');

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1240, height: 1754 }, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: 'networkidle' });
    await page.emulateMedia({ media: 'print' });
    await page.evaluate(() => document.fonts.ready);
    await page.pdf({
      path: outputPdf,
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '12mm', right: '12mm', bottom: '12mm', left: '12mm' },
    });
  } finally {
    await browser.close();
  }

  console.log(`Created report from: ${inputPath}`);
  console.log(`Screenshots dir: ${screenshotDir ?? 'not found'}`);
  console.log(`HTML: ${outputHtml}`);
  console.log(`PDF : ${outputPdf}`);
  console.log(`Pages checked: ${report.pages.length}`);
  console.log(`Findings: ${report.findings.length}`);
  console.log(`Readiness: ${report.readyLevel}`);
}

main().catch((error) => {
  console.error('\nERROR:', error instanceof Error ? error.message : error);
  if (error instanceof Error && error.stack) {
    console.error(error.stack);
  }
  process.exitCode = 1;
});
