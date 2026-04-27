/**
 * System Map — Comprehensive Index
 * ================================
 * All pages, API routes, navigation structure, and cross-links.
 * Edit this file to keep the system map up-to-date.
 */

// ─── NAVIGATION SECTIONS ───────────────────────

export interface NavItem {
  label: string;
  labelTh: string;
  href: string;
  badge?: string;
  description?: string;
}

export interface NavSection {
  id: string;
  name: string;
  nameTh: string;
  icon: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    id: 'rooms',
    name: 'Rooms',
    nameTh: 'ห้อง',
    icon: '🏠',
    items: [
      { label: 'Room List', labelTh: 'รายการห้อง', href: '/admin/rooms' },
      { label: 'Floor Management', labelTh: 'จัดการชั้น', href: '/admin/floors' },
      { label: 'Vacant Rooms', labelTh: 'ห้องว่าง', href: '/admin/rooms?status=vacant' },
    ],
  },
  {
    id: 'tenants',
    name: 'Tenants',
    nameTh: 'ผู้เช่า',
    icon: '👥',
    items: [
      { label: 'Tenant List', labelTh: 'รายชื่อ', href: '/admin/tenants' },
      { label: 'Contracts', labelTh: 'สัญญา', href: '/admin/contracts' },
      { label: 'New Registration', labelTh: 'ลงทะเบียนใหม่', href: '/admin/tenant-registrations' },
      { label: 'Move-Outs', labelTh: 'ย้ายออก', href: '/admin/moveouts' },
    ],
  },
  {
    id: 'billing',
    name: 'Billing',
    nameTh: 'บิล',
    icon: '💰',
    items: [
      { label: 'Billing', labelTh: 'วางบิล', href: '/admin/billing' },
      { label: 'Invoices', labelTh: 'ใบแจ้งหนี้', href: '/admin/invoices' },
      { label: 'Import Data', labelTh: 'นำเข้าข้อมูล', href: '/admin/billing/import' },
      { label: 'Late Fees', labelTh: 'ค่าปรับล่าช้า', href: '/admin/late-fees' },
      { label: 'Expenses', labelTh: 'รายจ่าย', href: '/admin/expenses' },
      { label: 'Billing Policy', labelTh: 'กติกาค่าบริการ', href: '/admin/settings/billing-policy' },
    ],
  },
  {
    id: 'payments',
    name: 'Payments',
    nameTh: 'เงิน',
    icon: '💳',
    items: [
      { label: 'Payment List', labelTh: 'รายการ', href: '/admin/payments' },
      { label: 'Review Slips', labelTh: 'ตรวจสลิป', href: '/admin/payments/review' },
      { label: 'Match Payments', labelTh: 'จับคู่', href: '/admin/payments/review-match' },
      { label: 'Upload Statement', labelTh: 'อัพโหลดสมุด', href: '/admin/payments/upload-statement' },
      { label: 'Overdue', labelTh: 'ค้างชำระ', href: '/admin/overdue' },
    ],
  },
  {
    id: 'documents',
    name: 'Documents',
    nameTh: 'เอกสาร',
    icon: '📄',
    items: [
      { label: 'Templates', labelTh: 'เทมเพลต', href: '/admin/templates' },
      { label: 'Generate', labelTh: 'สร้างเอกสาร', href: '/admin/documents/generate' },
      { label: 'All Documents', labelTh: 'เอกสารทั้งหมด', href: '/admin/documents' },
      { label: 'Deliveries', labelTh: 'จัดส่ง', href: '/admin/deliveries' },
    ],
  },
  {
    id: 'maintenance',
    name: 'Maintenance',
    nameTh: 'ซ่อม',
    icon: '🔧',
    items: [
      { label: 'Maintenance', labelTh: 'แจ้งซ่อม', href: '/admin/maintenance' },
    ],
  },
  {
    id: 'reports',
    name: 'Reports',
    nameTh: 'รายงาน',
    icon: '📊',
    items: [
      { label: 'Reports Overview', labelTh: 'รายงานต่างๆ', href: '/admin/reports' },
      { label: 'Profit & Loss', labelTh: 'กำไรขาดทุน', href: '/admin/reports/profit-loss' },
      { label: 'Audit Logs', labelTh: 'Audit Log', href: '/admin/audit-logs' },
      { label: 'Analytics', labelTh: 'Analytics', href: '/admin/analytics' },
      { label: 'Collections', labelTh: 'รายได้', href: '/admin/reports/collections' },
      { label: 'Occupancy', labelTh: 'อัตราการครอง', href: '/admin/reports/occupancy' },
      { label: 'Revenue', labelTh: 'รายได้', href: '/admin/reports/revenue' },
    ],
  },
  {
    id: 'messaging',
    name: 'Messaging',
    nameTh: 'แชท & แจ้งเตือน',
    icon: '💬',
    items: [
      { label: 'Chat', labelTh: 'แชท', href: '/admin/chat' },
      { label: 'Broadcast', labelTh: 'ส่งถึงทุกห้อง', href: '/admin/broadcast' },
      { label: 'Notifications', labelTh: 'การแจ้งเตือน', href: '/admin/notifications' },
      { label: 'Message Templates', labelTh: 'แม่แบบข้อความ', href: '/admin/message-templates' },
      { label: 'Outbox (DLQ)', labelTh: 'Outbox', href: '/admin/outbox' },
    ],
  },
  {
    id: 'settings',
    name: 'Settings',
    nameTh: 'ตั้งค่า',
    icon: '⚙️',
    items: [
      { label: 'Settings Overview', labelTh: 'ระบบ', href: '/admin/settings' },
      { label: 'Users', labelTh: 'ผู้ใช้', href: '/admin/settings/users' },
      { label: 'Admin Users', labelTh: 'ผู้ดูแล', href: '/admin/users' },
      { label: 'Roles', labelTh: 'บทบาท', href: '/admin/settings/roles' },
      { label: 'LINE Integration', labelTh: 'LINE', href: '/admin/settings/integrations' },
      { label: 'Room Settings', labelTh: 'ข้อมูลห้อง', href: '/admin/settings/rooms' },
      { label: 'Building Info', labelTh: 'ข้อมูลอาคาร', href: '/admin/settings/building' },
      { label: 'Bank Accounts', labelTh: 'บัญชีธนาคาร', href: '/admin/settings/bank-accounts' },
      { label: 'Reminders', labelTh: 'การแจ้งเตือน', href: '/admin/settings/reminders' },
      { label: 'Automation', labelTh: 'ระบบอัตโนมัติ', href: '/admin/settings/automation' },
    ],
  },
  {
    id: 'system',
    name: 'System',
    nameTh: 'ระบบ',
    icon: '🖥️',
    items: [
      { label: 'System Overview', labelTh: 'ภาพรวม', href: '/admin/system' },
      { label: 'Health', labelTh: 'สุขภาพระบบ', href: '/admin/system-health' },
      { label: 'Jobs', labelTh: 'Jobs', href: '/admin/system-jobs' },
      { label: 'Setup Wizard', labelTh: 'ตั้งค่าเริ่มต้น', href: '/admin/setup' },
      { label: 'System Docs', labelTh: 'เอกสารระบบ', href: '/admin/docs' },
    ],
  },
];

// ─── ADMIN PAGES ───────────────────────────────

export interface AdminPage {
  path: string;
  section: string;
  sectionTh: string;
  title: string;
  titleTh: string;
  description: string;
  /** API routes this page calls */
  apiCalls: string[];
  /** File path of the page component */
  file: string;
  /** Features / keywords for search */
  tags: string[];
  /** Is this a dynamic route (has [id] or [...path] segments) */
  dynamic?: boolean;
}

export const ADMIN_PAGES: AdminPage[] = [
  // ── Dashboard & Overview ──
  {
    path: '/admin',
    section: 'dashboard', sectionTh: 'หน้าแรก',
    title: 'Admin Home', titleTh: 'หน้าแรก',
    description: 'Redirect to dashboard or show overview',
    apiCalls: [],
    file: 'src/app/admin/page.tsx',
    tags: ['home', 'redirect'],
  },
  {
    path: '/admin/dashboard',
    section: 'dashboard', sectionTh: 'หน้าแรก',
    title: 'Dashboard', titleTh: 'แดชบอร์ด',
    description: 'Main dashboard — KPIs, alerts, recent activity',
    apiCalls: [
      'GET /api/analytics/summary',
      'GET /api/admin/dashboard-alerts',
      'GET /api/admin/maintenance?status=OPEN',
      'GET /api/audit-logs?limit=10',
    ],
    file: 'src/app/admin/dashboard/page.tsx',
    tags: ['dashboard', 'kpi', 'alerts', 'activity'],
  },
  {
    path: '/admin/analytics',
    section: 'reports', sectionTh: 'รายงาน',
    title: 'Analytics', titleTh: 'Analytics',
    description: 'Revenue, occupancy, collection analytics',
    apiCalls: [
      'GET /api/analytics/summary',
      'GET /api/analytics/revenue',
      'GET /api/analytics/occupancy',
    ],
    file: 'src/app/admin/analytics/page.tsx',
    tags: ['analytics', 'revenue', 'occupancy'],
  },

  // ── Rooms ──
  {
    path: '/admin/rooms',
    section: 'rooms', sectionTh: 'ห้อง',
    title: 'Room List', titleTh: 'รายการห้อง',
    description: 'List all rooms, filter by floor/status, manage room details',
    apiCalls: ['GET /api/rooms', 'POST /api/rooms', 'PATCH /api/rooms/[id]'],
    file: 'src/app/admin/rooms/page.tsx',
    tags: ['room', 'floor', 'status', 'vacant'],
  },
  {
    path: '/admin/rooms/[roomId]',
    section: 'rooms', sectionTh: 'ห้อง',
    title: 'Room Detail', titleTh: 'รายละเอียดห้อง',
    description: 'Room detail — tenants, billing history, contracts',
    apiCalls: ['GET /api/rooms/[id]', 'GET /api/rooms/[id]/tenants', 'GET /api/billing?roomNo='],
    file: 'src/app/admin/rooms/[roomId]/page.tsx',
    tags: ['room', 'detail', 'tenant', 'billing'],
    dynamic: true,
  },
  {
    path: '/admin/floors',
    section: 'rooms', sectionTh: 'ห้อง',
    title: 'Floor Management', titleTh: 'จัดการชั้น',
    description: 'List floors, manage rooms per floor',
    apiCalls: ['GET /api/floors', 'POST /api/floors', 'PATCH /api/floors/[id]'],
    file: 'src/app/admin/floors/page.tsx',
    tags: ['floor', 'room'],
  },
  {
    path: '/admin/floors/[floorId]',
    section: 'rooms', sectionTh: 'ห้อง',
    title: 'Floor Detail', titleTh: 'รายละเอียดชั้น',
    description: 'Floor detail with room list',
    apiCalls: ['GET /api/floors/[id]'],
    file: 'src/app/admin/floors/[floorId]/page.tsx',
    tags: ['floor', 'detail'],
    dynamic: true,
  },

  // ── Tenants ──
  {
    path: '/admin/tenants',
    section: 'tenants', sectionTh: 'ผู้เช่า',
    title: 'Tenant List', titleTh: 'รายชื่อผู้เช่า',
    description: 'List all tenants, search, filter by room',
    apiCalls: ['GET /api/tenants', 'POST /api/tenants', 'PATCH /api/tenants/[id]'],
    file: 'src/app/admin/tenants/page.tsx',
    tags: ['tenant', 'search', 'filter'],
  },
  {
    path: '/admin/tenants/[tenantId]',
    section: 'tenants', sectionTh: 'ผู้เช่า',
    title: 'Tenant Detail', titleTh: 'รายละเอียดผู้เช่า',
    description: 'Tenant profile, contracts, billing, payments',
    apiCalls: ['GET /api/tenants/[id]', 'GET /api/contracts?tenantId=', 'GET /api/invoices?tenantId='],
    file: 'src/app/admin/tenants/[tenantId]/page.tsx',
    tags: ['tenant', 'detail', 'contract', 'invoice'],
    dynamic: true,
  },
  {
    path: '/admin/tenant-registrations',
    section: 'tenants', sectionTh: 'ผู้เช่า',
    title: 'Tenant Registrations', titleTh: 'ลงทะเบียนผู้เช่าใหม่',
    description: 'Approve/reject LINE-based tenant registrations',
    apiCalls: [
      'GET /api/tenant-registrations',
      'POST /api/tenant-registrations/[id]/approve',
      'POST /api/tenant-registrations/[id]/reject',
    ],
    file: 'src/app/admin/tenant-registrations/page.tsx',
    tags: ['tenant', 'registration', 'approve', 'line'],
  },

  // ── Contracts ──
  {
    path: '/admin/contracts',
    section: 'tenants', sectionTh: 'ผู้เช่า',
    title: 'Contract List', titleTh: 'สัญญาเช่า',
    description: 'List all contracts, filter by status/room',
    apiCalls: [
      'GET /api/contracts',
      'POST /api/contracts',
      'PATCH /api/contracts/[id]',
      'POST /api/contracts/[id]/renew',
      'POST /api/contracts/[id]/terminate',
    ],
    file: 'src/app/admin/contracts/page.tsx',
    tags: ['contract', 'renew', 'terminate', 'rent'],
  },

  // ── Billing ──
  {
    path: '/admin/billing',
    section: 'billing', sectionTh: 'บิล',
    title: 'Billing List', titleTh: 'วางบิล',
    description: 'List billing records by period, lock & generate invoices',
    apiCalls: [
      'GET /api/billing',
      'GET /api/billing-cycles',
      'POST /api/billing/[id]/lock',
      'POST /api/billing/periods/[id]/generate-invoices',
    ],
    file: 'src/app/admin/billing/page.tsx',
    tags: ['billing', 'period', 'lock', 'invoice'],
  },
  {
    path: '/admin/billing/[billingId]',
    section: 'billing', sectionTh: 'บิล',
    title: 'Billing Detail', titleTh: 'รายละเอียดบิล',
    description: 'Billing detail for a specific period/room',
    apiCalls: ['GET /api/billing/[id]', 'PATCH /api/billing/[id]'],
    file: 'src/app/admin/billing/[billingId]/page.tsx',
    tags: ['billing', 'detail'],
    dynamic: true,
  },
  {
    path: '/admin/billing/import',
    section: 'billing', sectionTh: 'บิล',
    title: 'Billing Import', titleTh: 'นำเข้าข้อมูลบิล',
    description: 'Import monthly meter data from Excel',
    apiCalls: [
      'POST /api/billing/monthly-data/import',
      'POST /api/billing/monthly-data/import/execute',
      'GET /api/billing/import/batches',
    ],
    file: 'src/app/admin/billing/import/page.tsx',
    tags: ['billing', 'import', 'excel', 'meter'],
  },
  {
    path: '/admin/billing/batches',
    section: 'billing', sectionTh: 'บิล',
    title: 'Import Batches', titleTh: ' batches',
    description: 'View past import batches and row details',
    apiCalls: ['GET /api/billing/import/batches', 'GET /api/billing/import/batches/[id]/rows'],
    file: 'src/app/admin/billing/batches/page.tsx',
    tags: ['billing', 'import', 'batch'],
  },
  {
    path: '/admin/billing/batches/[batchId]',
    section: 'billing', sectionTh: 'บิล',
    title: 'Batch Detail', titleTh: 'รายละเอียด batch',
    description: 'Review individual batch rows and errors',
    apiCalls: ['GET /api/billing/import/batches/[id]'],
    file: 'src/app/admin/billing/batches/[batchId]/page.tsx',
    tags: ['billing', 'import', 'batch', 'row'],
    dynamic: true,
  },
  {
    path: '/admin/billing/wizard',
    section: 'billing', sectionTh: 'บิล',
    title: 'Billing Wizard', titleTh: 'วางบิล wizard',
    description: 'Step-by-step billing wizard for new period',
    apiCalls: ['GET /api/billing-cycles', 'POST /api/billing/wizard'],
    file: 'src/app/admin/billing/wizard/page.tsx',
    tags: ['billing', 'wizard', 'period'],
  },

  // ── Invoices ──
  {
    path: '/admin/invoices',
    section: 'billing', sectionTh: 'บิล',
    title: 'Invoice List', titleTh: 'ใบแจ้งหนี้',
    description: 'List all invoices, filter by status/room/month',
    apiCalls: ['GET /api/invoices', 'POST /api/invoices/[id]/send'],
    file: 'src/app/admin/invoices/page.tsx',
    tags: ['invoice', 'send', 'status'],
  },
  {
    path: '/admin/invoices/[id]',
    section: 'billing', sectionTh: 'บิล',
    title: 'Invoice Detail', titleTh: 'รายละเอียดใบแจ้งหนี้',
    description: 'Invoice detail with PDF preview, delivery status',
    apiCalls: ['GET /api/invoices/[id]', 'GET /api/invoices/[id]/pdf', 'POST /api/invoices/[id]/send'],
    file: 'src/app/admin/invoices/[id]/page.tsx',
    tags: ['invoice', 'detail', 'pdf', 'send'],
    dynamic: true,
  },

  // ── Late Fees ──
  {
    path: '/admin/late-fees',
    section: 'billing', sectionTh: 'บิล',
    title: 'Late Fees', titleTh: 'ค่าปรับล่าช้า',
    description: 'View late fee configuration and applied fees',
    apiCalls: ['GET /api/late-fees'],
    file: 'src/app/admin/late-fees/page.tsx',
    tags: ['late fee', 'penalty', 'overdue'],
  },

  // ── Payments ──
  {
    path: '/admin/payments',
    section: 'payments', sectionTh: 'เงิน',
    title: 'Payment List', titleTh: 'รายการชำระเงิน',
    description: 'All payments, filter by status/date/room',
    apiCalls: ['GET /api/payments', 'POST /api/payments', 'PATCH /api/payments/[id]'],
    file: 'src/app/admin/payments/page.tsx',
    tags: ['payment', 'list', 'filter'],
  },
  {
    path: '/admin/payments/[paymentId]',
    section: 'payments', sectionTh: 'เงิน',
    title: 'Payment Detail', titleTh: 'รายละเอียดการชำระ',
    description: 'Payment detail with matched invoices',
    apiCalls: ['GET /api/payments/[id]'],
    file: 'src/app/admin/payments/[paymentId]/page.tsx',
    tags: ['payment', 'detail'],
    dynamic: true,
  },
  {
    path: '/admin/payments/review',
    section: 'payments', sectionTh: 'เงิน',
    title: 'Review Payments', titleTh: 'ตรวจสลิป',
    description: 'Review imported bank statement entries',
    apiCalls: ['GET /api/payments/review', 'POST /api/payments/match/confirm', 'POST /api/payments/match/reject'],
    file: 'src/app/admin/payments/review/page.tsx',
    tags: ['payment', 'review', 'match', 'bank statement'],
  },
  {
    path: '/admin/payments/review-match',
    section: 'payments', sectionTh: 'เงิน',
    title: 'Match Review', titleTh: 'จับคู่',
    description: 'Review matched payment-invoice pairs',
    apiCalls: ['GET /api/payments/matched'],
    file: 'src/app/admin/payments/review-match/page.tsx',
    tags: ['payment', 'match', 'invoice'],
  },
  {
    path: '/admin/payments/upload-statement',
    section: 'payments', sectionTh: 'เงิน',
    title: 'Upload Bank Statement', titleTh: 'อัพโหลดสมุดบัญชี',
    description: 'Upload Excel/CSV bank statement for payment import',
    apiCalls: ['POST /api/payments/statement-upload'],
    file: 'src/app/admin/payments/upload-statement/page.tsx',
    tags: ['payment', 'upload', 'bank', 'statement'],
  },

  // ── Overdue ──
  {
    path: '/admin/overdue',
    section: 'payments', sectionTh: 'เงิน',
    title: 'Overdue Invoices', titleTh: 'ค้างชำระ',
    description: 'List overdue invoices across all rooms',
    apiCalls: ['GET /api/invoices?status=OVERDUE'],
    file: 'src/app/admin/overdue/page.tsx',
    tags: ['overdue', 'invoice', 'unpaid'],
  },
  {
    path: '/admin/overdue/[roomId]',
    section: 'payments', sectionTh: 'เงิน',
    title: 'Room Overdue', titleTh: 'ค้างชำระ (ห้อง)',
    description: 'Overdue history for specific room',
    apiCalls: ['GET /api/invoices?roomNo=&status=OVERDUE'],
    file: 'src/app/admin/overdue/[roomId]/page.tsx',
    tags: ['overdue', 'room'],
    dynamic: true,
  },

  // ── Expenses ──
  {
    path: '/admin/expenses',
    section: 'billing', sectionTh: 'บิล',
    title: 'Expense List', titleTh: 'รายจ่าย',
    description: 'Track and manage apartment expenses',
    apiCalls: ['GET /api/expenses', 'POST /api/expenses', 'PATCH /api/expenses/[id]', 'DELETE /api/expenses/[id]'],
    file: 'src/app/admin/expenses/page.tsx',
    tags: ['expense', 'cost', 'category'],
  },

  // ── Move-Outs ──
  {
    path: '/admin/moveouts',
    section: 'tenants', sectionTh: 'ผู้เช่า',
    title: 'Move-Out List', titleTh: 'ย้ายออก',
    description: 'Manage move-out process: inspection, deposit, refund',
    apiCalls: [
      'GET /api/moveouts',
      'POST /api/moveouts',
      'POST /api/moveouts/[id]/calculate',
      'POST /api/moveouts/[id]/confirm',
      'POST /api/moveouts/[id]/refund',
      'POST /api/moveouts/[id]/send-notice',
    ],
    file: 'src/app/admin/moveouts/page.tsx',
    tags: ['moveout', 'deposit', 'refund', 'inspection'],
  },

  // ── Maintenance ──
  {
    path: '/admin/maintenance',
    section: 'maintenance', sectionTh: 'แจ้งซ่อม',
    title: 'Maintenance Tickets', titleTh: 'แจ้งซ่อม',
    description: 'View, assign, update maintenance tickets',
    apiCalls: [
      'GET /api/admin/maintenance',
      'POST /api/admin/maintenance/assign',
      'POST /api/admin/maintenance/update-status',
      'POST /api/admin/maintenance/comment',
    ],
    file: 'src/app/admin/maintenance/page.tsx',
    tags: ['maintenance', 'ticket', 'repair', 'assign'],
  },

  // ── Documents ──
  {
    path: '/admin/documents',
    section: 'documents', sectionTh: 'เอกสาร',
    title: 'Document List', titleTh: 'เอกสารทั้งหมด',
    description: 'List all generated documents',
    apiCalls: ['GET /api/documents', 'POST /api/documents/[id]/send'],
    file: 'src/app/admin/documents/page.tsx',
    tags: ['document', 'list', 'generate'],
  },
  {
    path: '/admin/documents/generate',
    section: 'documents', sectionTh: 'เอกสาร',
    title: 'Generate Document', titleTh: 'สร้างเอกสาร',
    description: 'Select template + scope, preview, generate PDF',
    apiCalls: ['POST /api/documents/generate', 'GET /api/templates'],
    file: 'src/app/admin/documents/generate/page.tsx',
    tags: ['document', 'generate', 'pdf', 'template'],
  },

  // ── Templates ──
  {
    path: '/admin/templates',
    section: 'documents', sectionTh: 'เอกสาร',
    title: 'Template List', titleTh: 'เทมเพลต',
    description: 'Manage document templates',
    apiCalls: ['GET /api/templates', 'POST /api/templates', 'PATCH /api/templates/[id]', 'DELETE /api/templates/[id]'],
    file: 'src/app/admin/templates/page.tsx',
    tags: ['template', 'document', 'html'],
  },
  {
    path: '/admin/templates/[id]',
    section: 'documents', sectionTh: 'เอกสาร',
    title: 'Template Detail', titleTh: 'รายละเอียดเทมเพลต',
    description: 'View template with version history',
    apiCalls: ['GET /api/templates/[id]', 'GET /api/templates/[id]/versions'],
    file: 'src/app/admin/templates/[id]/page.tsx',
    tags: ['template', 'version'],
    dynamic: true,
  },
  {
    path: '/admin/templates/[id]/edit',
    section: 'documents', sectionTh: 'เอกสาร',
    title: 'Edit Template', titleTh: 'แก้ไขเทมเพลต',
    description: 'Tiptap rich text editor for template body',
    apiCalls: ['PATCH /api/templates/[id]', 'POST /api/templates/[id]/versions'],
    file: 'src/app/admin/templates/[id]/edit/page.tsx',
    tags: ['template', 'edit', 'tiptap'],
    dynamic: true,
  },
  {
    path: '/admin/templates/[id]/diff',
    section: 'documents', sectionTh: 'เอกสาร',
    title: 'Template Diff', titleTh: 'เปรียบเทียบเทมเพลต',
    description: 'Side-by-side diff of template versions',
    apiCalls: ['GET /api/templates/[id]/versions'],
    file: 'src/app/admin/templates/[id]/diff/page.tsx',
    tags: ['template', 'diff', 'version'],
    dynamic: true,
  },

  // ── Deliveries ──
  {
    path: '/admin/deliveries',
    section: 'documents', sectionTh: 'เอกสาร',
    title: 'Delivery Management', titleTh: 'จัดส่ง',
    description: 'Track delivery status of documents',
    apiCalls: ['GET /api/deliveries', 'POST /api/delivery-orders/[id]/send'],
    file: 'src/app/admin/deliveries/page.tsx',
    tags: ['delivery', 'send', 'line'],
  },

  // ── Chat ──
  {
    path: '/admin/chat',
    section: 'messaging', sectionTh: 'แชท',
    title: 'Chat List', titleTh: 'รายการแชท',
    description: 'List all LINE conversations with tenants',
    apiCalls: ['GET /api/conversations'],
    file: 'src/app/admin/chat/page.tsx',
    tags: ['chat', 'conversation', 'line', 'tenant'],
  },
  {
    path: '/admin/chat/[conversationId]',
    section: 'messaging', sectionTh: 'แชท',
    title: 'Chat Detail', titleTh: 'แชท',
    description: 'View/reply to specific tenant conversation',
    apiCalls: [
      'GET /api/conversations/[id]',
      'GET /api/conversations/[id]/messages',
      'POST /api/conversations/[id]/messages',
      'POST /api/conversations/[id]/files/send',
    ],
    file: 'src/app/admin/chat/[conversationId]/page.tsx',
    tags: ['chat', 'conversation', 'reply', 'line'],
    dynamic: true,
  },

  // ── Messaging ──
  {
    path: '/admin/broadcast',
    section: 'messaging', sectionTh: 'แชท',
    title: 'Broadcast', titleTh: 'ส่งถึงทุกห้อง',
    description: 'Send LINE message to all tenants or filtered rooms',
    apiCalls: ['GET /api/broadcast', 'POST /api/broadcast', 'PATCH /api/broadcast/[id]'],
    file: 'src/app/admin/broadcast/page.tsx',
    tags: ['broadcast', 'line', 'message', 'all'],
  },
  {
    path: '/admin/notifications',
    section: 'messaging', sectionTh: 'แชท',
    title: 'Notifications', titleTh: 'การแจ้งเตือน',
    description: 'View all notifications',
    apiCalls: ['GET /api/notifications'],
    file: 'src/app/admin/notifications/page.tsx',
    tags: ['notification', 'sse'],
  },
  {
    path: '/admin/message-templates',
    section: 'messaging', sectionTh: 'แชท',
    title: 'Message Templates', titleTh: 'แม่แบบข้อความ',
    description: 'Manage LINE message templates',
    apiCalls: [
      'GET /api/message-templates',
      'POST /api/message-templates',
      'PATCH /api/message-templates/[id]',
      'DELETE /api/message-templates/[id]',
    ],
    file: 'src/app/admin/message-templates/page.tsx',
    tags: ['message', 'template', 'line'],
  },
  {
    path: '/admin/outbox',
    section: 'messaging', sectionTh: 'แชท',
    title: 'Outbox / Dead Letter', titleTh: 'Outbox',
    description: 'View failed outbox events, retry or dead-letter',
    apiCalls: ['GET /api/admin/outbox/dead-letter'],
    file: 'src/app/admin/outbox/page.tsx',
    tags: ['outbox', 'dead letter', 'failed', 'retry'],
  },

  // ── Reports ──
  {
    path: '/admin/reports',
    section: 'reports', sectionTh: 'รายงาน',
    title: 'Reports Overview', titleTh: 'รายงานต่างๆ',
    description: 'Hub for all report pages',
    apiCalls: [],
    file: 'src/app/admin/reports/page.tsx',
    tags: ['report', 'overview'],
  },
  {
    path: '/admin/reports/profit-loss',
    section: 'reports', sectionTh: 'รายงาน',
    title: 'Profit & Loss', titleTh: 'กำไรขาดทุน',
    description: 'Monthly P&L report',
    apiCalls: ['GET /api/reports/profit-loss'],
    file: 'src/app/admin/reports/profit-loss/page.tsx',
    tags: ['report', 'profit', 'loss', 'financial'],
  },
  {
    path: '/admin/reports/audit',
    section: 'reports', sectionTh: 'รายงาน',
    title: 'Audit Log Report', titleTh: 'Audit Log',
    description: 'Audit log explorer',
    apiCalls: ['GET /api/audit-logs'],
    file: 'src/app/admin/reports/audit/page.tsx',
    tags: ['audit', 'log', 'report'],
  },

  // ── Settings ──
  {
    path: '/admin/settings',
    section: 'settings', sectionTh: 'ตั้งค่า',
    title: 'Settings Hub', titleTh: 'ตั้งค่าระบบ',
    description: 'Hub linking to all settings sub-pages',
    apiCalls: [],
    file: 'src/app/admin/settings/page.tsx',
    tags: ['settings', 'hub'],
  },
  {
    path: '/admin/settings/building',
    section: 'settings', sectionTh: 'ตั้งค่า',
    title: 'Building Settings', titleTh: 'ข้อมูลอาคาร',
    description: 'Building name, address, phone, tax ID',
    apiCalls: ['GET /api/settings/building', 'POST /api/settings/building'],
    file: 'src/app/admin/settings/building/page.tsx',
    tags: ['settings', 'building', 'info'],
  },
  {
    path: '/admin/settings/billing-policy',
    section: 'settings', sectionTh: 'ตั้งค่า',
    title: 'Billing Policy', titleTh: 'กติกาค่าบริการ',
    description: 'Billing day, due day, reminder days, late fee settings',
    apiCalls: ['GET /api/admin/settings', 'PUT /api/admin/settings'],
    file: 'src/app/admin/settings/billing-policy/page.tsx',
    tags: ['settings', 'billing', 'policy', 'due day'],
  },
  {
    path: '/admin/settings/integrations',
    section: 'settings', sectionTh: 'ตั้งค่า',
    title: 'LINE Integration', titleTh: 'LINE Integration',
    description: 'LINE channel credentials, webhook URL, rich menu',
    apiCalls: [
      'GET /api/settings/integrations',
      'POST /api/settings/integrations',
      'POST /api/line/rich-menu',
    ],
    file: 'src/app/admin/settings/integrations/page.tsx',
    tags: ['settings', 'line', 'integration', 'webhook'],
  },
  {
    path: '/admin/settings/automation',
    section: 'settings', sectionTh: 'ตั้งค่า',
    title: 'Automation Settings', titleTh: 'ระบบอัตโนมัติ',
    description: 'Enable/disable cron jobs, configure schedules',
    apiCalls: ['GET /api/settings/automation', 'POST /api/settings/automation'],
    file: 'src/app/admin/settings/automation/page.tsx',
    tags: ['settings', 'automation', 'cron', 'job'],
  },
  {
    path: '/admin/settings/reminders',
    section: 'settings', sectionTh: 'ตั้งค่า',
    title: 'Reminder Settings', titleTh: 'การแจ้งเตือน',
    description: 'Configure reminder schedules (before/after due date)',
    apiCalls: ['GET /api/reminders/config', 'POST /api/reminders/config'],
    file: 'src/app/admin/settings/reminders/page.tsx',
    tags: ['settings', 'reminder', 'notification'],
  },
  {
    path: '/admin/settings/bank-accounts',
    section: 'settings', sectionTh: 'ตั้งค่า',
    title: 'Bank Accounts', titleTh: 'บัญชีธนาคาร',
    description: 'Manage bank accounts used for receiving payments',
    apiCalls: [
      'GET /api/bank-accounts',
      'POST /api/bank-accounts',
      'PATCH /api/settings/bank-accounts/[id]',
    ],
    file: 'src/app/admin/settings/bank-accounts/page.tsx',
    tags: ['settings', 'bank', 'account'],
  },
  {
    path: '/admin/settings/rooms',
    section: 'settings', sectionTh: 'ตั้งค่า',
    title: 'Room Settings', titleTh: 'ข้อมูลห้อง',
    description: 'Default rent, furniture, rules per room',
    apiCalls: ['GET /api/rooms'],
    file: 'src/app/admin/settings/rooms/page.tsx',
    tags: ['settings', 'room', 'rent', 'furniture'],
  },
  {
    path: '/admin/settings/users',
    section: 'settings', sectionTh: 'ตั้งค่า',
    title: 'User Management', titleTh: 'ผู้ใช้งาน',
    description: 'Manage staff users (non-admin)',
    apiCalls: ['GET /api/admin/users', 'POST /api/admin/users', 'PATCH /api/admin/users/[id]'],
    file: 'src/app/admin/settings/users/page.tsx',
    tags: ['settings', 'user', 'staff'],
  },
  {
    path: '/admin/settings/roles',
    section: 'settings', sectionTh: 'ตั้งค่า',
    title: 'Roles', titleTh: 'บทบาท',
    description: 'Role management',
    apiCalls: ['GET /api/admin/users'],
    file: 'src/app/admin/settings/roles/page.tsx',
    tags: ['settings', 'role', 'permission'],
  },

  // ── System ──
  {
    path: '/admin/users',
    section: 'system', sectionTh: 'ระบบ',
    title: 'Admin Users', titleTh: 'ผู้ดูแลระบบ',
    description: 'Manage admin/staff accounts',
    apiCalls: ['GET /api/admin/users', 'POST /api/admin/users/[id]/reset-password'],
    file: 'src/app/admin/users/AdminUsersClient.tsx',
    tags: ['admin', 'user', 'password'],
  },
  {
    path: '/admin/system-health',
    section: 'system', sectionTh: 'ระบบ',
    title: 'System Health', titleTh: 'สุขภาพระบบ',
    description: 'DB, Redis, Outbox, Worker heartbeat status',
    apiCalls: ['GET /api/health/deep', 'GET /api/admin/system-health/alerts'],
    file: 'src/app/admin/system-health/page.tsx',
    tags: ['system', 'health', 'db', 'redis', 'outbox'],
  },
  {
    path: '/admin/system-jobs',
    section: 'system', sectionTh: 'ระบบ',
    title: 'System Jobs', titleTh: 'System Jobs',
    description: 'View and manually trigger scheduled jobs',
    apiCalls: ['GET /api/admin/jobs', 'POST /api/admin/jobs/[jobId]/run'],
    file: 'src/app/admin/system-jobs/page.tsx',
    tags: ['system', 'job', 'cron', 'trigger'],
  },
  {
    path: '/admin/system',
    section: 'system', sectionTh: 'ระบบ',
    title: 'System Overview', titleTh: 'ภาพรวมระบบ',
    description: 'System info, version, backup controls',
    apiCalls: ['GET /api/system/backup-status', 'POST /api/system/backup/run'],
    file: 'src/app/admin/system/page.tsx',
    tags: ['system', 'backup', 'overview'],
  },
  {
    path: '/admin/audit-logs',
    section: 'reports', sectionTh: 'รายงาน',
    title: 'Audit Logs', titleTh: 'Audit Logs',
    description: 'Browse all audit log entries',
    apiCalls: ['GET /api/audit-logs'],
    file: 'src/app/admin/audit-logs/page.tsx',
    tags: ['audit', 'log', 'system'],
  },
  {
    path: '/admin/setup',
    section: 'system', sectionTh: 'ระบบ',
    title: 'Setup Wizard', titleTh: 'ตั้งค่าเริ่มต้น',
    description: 'First-time system setup wizard',
    apiCalls: ['GET /api/admin/setup/status', 'POST /api/admin/setup/complete'],
    file: 'src/app/admin/setup/page.tsx',
    tags: ['setup', 'wizard', 'init', 'first time'],
  },
  {
    path: '/admin/docs',
    section: 'system', sectionTh: 'ระบบ',
    title: 'System Docs', titleTh: 'เอกสารระบบ',
    description: 'Interactive flow diagrams and system map',
    apiCalls: [],
    file: 'src/app/admin/docs/page.tsx',
    tags: ['docs', 'flow', 'diagram', 'system map'],
  },
  {
    path: '/admin/login',
    section: 'auth', sectionTh: 'เข้าสู่ระบบ',
    title: 'Login', titleTh: 'เข้าสู่ระบบ',
    description: 'Admin login page',
    apiCalls: ['POST /api/auth/login', 'GET /api/auth/bootstrap-status'],
    file: 'src/app/admin/login/page.tsx',
    tags: ['login', 'auth', 'password'],
  },
];

// ─── API ROUTES ───────────────────────────────

export interface ApiRoute {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  path: string;
  /** Brief description */
  description: string;
  /** Pages that call this route */
  calledBy: string[];
  /** Files (API route handlers) */
  files: string[];
  /** Auth required */
  auth: boolean;
  tags: string[];
}

export const API_ROUTES: ApiRoute[] = [
  // Auth
  { method: 'POST', path: '/api/auth/login', description: 'Admin login', calledBy: ['/admin/login'], files: ['src/app/api/auth/login/route.ts'], auth: false, tags: ['auth', 'login'] },
  { method: 'POST', path: '/api/auth/logout', description: 'Admin logout', calledBy: [], files: ['src/app/api/auth/logout/route.ts'], auth: false, tags: ['auth', 'logout'] },
  { method: 'GET', path: '/api/auth/me', description: 'Get current session user', calledBy: ['/admin/layout'], files: ['src/app/api/auth/me/route.ts'], auth: true, tags: ['auth', 'session'] },
  { method: 'POST', path: '/api/auth/signup', description: 'Staff registration request', calledBy: [], files: ['src/app/api/auth/signup/route.ts'], auth: false, tags: ['auth', 'signup'] },
  { method: 'POST', path: '/api/auth/forgot-password', description: 'Request password reset', calledBy: [], files: ['src/app/api/auth/forgot-password/route.ts'], auth: false, tags: ['auth', 'password'] },
  { method: 'POST', path: '/api/auth/reset-password', description: 'Reset password with token', calledBy: [], files: ['src/app/api/auth/reset-password/route.ts'], auth: false, tags: ['auth', 'password'] },
  { method: 'POST', path: '/api/auth/change-password', description: 'Change password while logged in', calledBy: [], files: ['src/app/api/auth/change-password/route.ts'], auth: true, tags: ['auth', 'password'] },
  { method: 'GET', path: '/api/auth/bootstrap-status', description: 'Check if system needs setup', calledBy: ['/admin/login'], files: ['src/app/api/auth/bootstrap-status/route.ts'], auth: false, tags: ['auth', 'setup'] },

  // Admin Users
  { method: 'GET', path: '/api/admin/users', description: 'List admin users', calledBy: ['/admin/users', '/admin/settings/users', '/admin/settings/roles'], files: ['src/app/api/admin/users/route.ts'], auth: true, tags: ['admin', 'user'] },
  { method: 'POST', path: '/api/admin/users', description: 'Create admin user', calledBy: ['/admin/users', '/admin/settings/users'], files: ['src/app/api/admin/users/route.ts'], auth: true, tags: ['admin', 'user'] },
  { method: 'PATCH', path: '/api/admin/users/[id]', description: 'Update admin user', calledBy: ['/admin/settings/users'], files: ['src/app/api/admin/users/[id]/route.ts'], auth: true, tags: ['admin', 'user'] },
  { method: 'POST', path: '/api/admin/users/[id]/reset-password', description: 'Reset user password', calledBy: ['/admin/users'], files: ['src/app/api/admin/users/[id]/reset-password/route.ts'], auth: true, tags: ['admin', 'password'] },
  { method: 'POST', path: '/api/admin/registration-requests/[id]/approve', description: 'Approve staff registration', calledBy: [], files: ['src/app/api/admin/registration-requests/[id]/approve/route.ts'], auth: true, tags: ['admin', 'registration'] },
  { method: 'POST', path: '/api/admin/registration-requests/[id]/reject', description: 'Reject staff registration', calledBy: [], files: ['src/app/api/admin/registration-requests/[id]/reject/route.ts'], auth: true, tags: ['admin', 'registration'] },

  // Admin Setup
  { method: 'GET', path: '/api/admin/setup/status', description: 'Get setup wizard status', calledBy: ['/admin/setup'], files: ['src/app/api/admin/setup/status/route.ts'], auth: true, tags: ['setup', 'wizard'] },
  { method: 'POST', path: '/api/admin/setup/complete', description: 'Complete first-time setup', calledBy: ['/admin/setup'], files: ['src/app/api/admin/setup/complete/route.ts'], auth: true, tags: ['setup', 'wizard'] },
  { method: 'POST', path: '/api/admin/setup/reset', description: 'Reset system setup', calledBy: [], files: ['src/app/api/admin/setup/reset/route.ts'], auth: true, tags: ['setup'] },

  // Admin Jobs
  { method: 'GET', path: '/api/admin/jobs', description: 'List all system jobs', calledBy: ['/admin/system-jobs'], files: ['src/app/api/admin/jobs/route.ts'], auth: true, tags: ['job', 'cron', 'system'] },
  { method: 'POST', path: '/api/admin/jobs/[jobId]/run', description: 'Manually trigger a system job', calledBy: ['/admin/system-jobs'], files: ['src/app/api/admin/jobs/[jobId]/run/route.ts'], auth: true, tags: ['job', 'trigger'] },

  // Admin Maintenance
  { method: 'GET', path: '/api/admin/maintenance', description: 'List all maintenance tickets', calledBy: ['/admin/maintenance', '/admin/dashboard'], files: ['src/app/api/admin/maintenance/route.ts'], auth: true, tags: ['maintenance', 'ticket'] },
  { method: 'POST', path: '/api/admin/maintenance/assign', description: 'Assign ticket to staff', calledBy: ['/admin/maintenance'], files: ['src/app/api/admin/maintenance/assign/route.ts'], auth: true, tags: ['maintenance', 'assign'] },
  { method: 'POST', path: '/api/admin/maintenance/update-status', description: 'Update ticket status', calledBy: ['/admin/maintenance'], files: ['src/app/api/admin/maintenance/update-status/route.ts'], auth: true, tags: ['maintenance', 'status'] },
  { method: 'POST', path: '/api/admin/maintenance/comment', description: 'Add comment to ticket', calledBy: ['/admin/maintenance'], files: ['src/app/api/admin/maintenance/comment/route.ts'], auth: true, tags: ['maintenance', 'comment'] },

  // Admin System Health
  { method: 'GET', path: '/api/admin/system-health/alerts', description: 'Get system health alerts', calledBy: ['/admin/system-health'], files: ['src/app/api/admin/system-health/alerts/route.ts'], auth: true, tags: ['health', 'alert'] },
  { method: 'GET', path: '/api/admin/dashboard-alerts', description: 'Get dashboard alerts', calledBy: ['/admin/dashboard'], files: ['src/app/api/admin/dashboard-alerts/route.ts'], auth: true, tags: ['dashboard', 'alert'] },
  { method: 'GET', path: '/api/admin/outbox/dead-letter', description: 'Get dead letter outbox events', calledBy: ['/admin/outbox'], files: ['src/app/api/admin/outbox/dead-letter/route.ts'], auth: true, tags: ['outbox', 'dead letter'] },
  { method: 'GET', path: '/api/admin/settings', description: 'Get system settings', calledBy: [], files: ['src/app/api/admin/settings/route.ts'], auth: true, tags: ['settings'] },
  { method: 'PATCH', path: '/api/admin/settings', description: 'Update system settings', calledBy: [], files: ['src/app/api/admin/settings/route.ts'], auth: true, tags: ['settings'] },

  // Analytics
  { method: 'GET', path: '/api/analytics/summary', description: 'Get analytics summary', calledBy: ['/admin/dashboard', '/admin/analytics'], files: ['src/app/api/analytics/summary/route.ts'], auth: true, tags: ['analytics', 'summary'] },
  { method: 'GET', path: '/api/analytics/revenue', description: 'Get revenue analytics', calledBy: ['/admin/analytics', '/admin/reports/revenue'], files: ['src/app/api/analytics/revenue/route.ts'], auth: true, tags: ['analytics', 'revenue'] },
  { method: 'GET', path: '/api/analytics/occupancy', description: 'Get occupancy analytics', calledBy: ['/admin/analytics', '/admin/reports/occupancy'], files: ['src/app/api/analytics/occupancy/route.ts'], auth: true, tags: ['analytics', 'occupancy'] },

  // Audit Logs
  { method: 'GET', path: '/api/audit-logs', description: 'Browse audit logs', calledBy: ['/admin/audit-logs', '/admin/reports/audit', '/admin/dashboard'], files: ['src/app/api/audit-logs/route.ts'], auth: true, tags: ['audit', 'log'] },

  // Bank Accounts
  { method: 'GET', path: '/api/bank-accounts', description: 'List bank accounts', calledBy: ['/admin/settings/bank-accounts'], files: ['src/app/api/bank-accounts/route.ts'], auth: true, tags: ['bank', 'account'] },
  { method: 'POST', path: '/api/bank-accounts', description: 'Create bank account', calledBy: ['/admin/settings/bank-accounts'], files: ['src/app/api/bank-accounts/route.ts'], auth: true, tags: ['bank', 'account'] },

  // Billing Cycles
  { method: 'GET', path: '/api/billing-cycles', description: 'List billing cycles', calledBy: ['/admin/billing', '/admin/billing/wizard'], files: ['src/app/api/billing-cycles/route.ts'], auth: true, tags: ['billing', 'cycle', 'period'] },
  { method: 'POST', path: '/api/billing-cycles', description: 'Create billing cycle', calledBy: ['/admin/billing/wizard'], files: ['src/app/api/billing-cycles/route.ts'], auth: true, tags: ['billing', 'cycle'] },
  { method: 'GET', path: '/api/billing-cycles/[id]', description: 'Get billing cycle detail', calledBy: [], files: ['src/app/api/billing-cycles/[id]/route.ts'], auth: true, tags: ['billing', 'cycle'] },
  { method: 'PATCH', path: '/api/billing-cycles/[id]', description: 'Update billing cycle', calledBy: [], files: ['src/app/api/billing-cycles/[id]/route.ts'], auth: true, tags: ['billing', 'cycle'] },

  // Billing Rules
  { method: 'GET', path: '/api/billing-rules', description: 'List billing rules', calledBy: ['/admin/late-fees'], files: ['src/app/api/billing-rules/route.ts'], auth: true, tags: ['billing', 'rule'] },

  // Billing
  { method: 'GET', path: '/api/billing', description: 'List billing records', calledBy: ['/admin/billing', '/admin/rooms/[roomId]'], files: ['src/app/api/billing/route.ts'], auth: true, tags: ['billing'] },
  { method: 'POST', path: '/api/billing', description: 'Create billing record', calledBy: [], files: ['src/app/api/billing/route.ts'], auth: true, tags: ['billing'] },
  { method: 'GET', path: '/api/billing/[id]', description: 'Get billing detail', calledBy: ['/admin/billing/[billingId]'], files: ['src/app/api/billing/[id]/route.ts'], auth: true, tags: ['billing'] },
  { method: 'PATCH', path: '/api/billing/[id]', description: 'Update billing record', calledBy: [], files: ['src/app/api/billing/[id]/route.ts'], auth: true, tags: ['billing'] },
  { method: 'POST', path: '/api/billing/[id]/lock', description: 'Lock billing record & generate invoices', calledBy: ['/admin/billing'], files: ['src/app/api/billing/[id]/lock/route.ts'], auth: true, tags: ['billing', 'lock'] },
  { method: 'POST', path: '/api/billing/wizard', description: 'Billing wizard step', calledBy: ['/admin/billing/wizard'], files: ['src/app/api/billing/wizard/route.ts'], auth: true, tags: ['billing', 'wizard'] },
  { method: 'POST', path: '/api/billing/periods/[id]/generate-invoices', description: 'Generate invoices for billing period', calledBy: ['/admin/billing'], files: ['src/app/api/billing/periods/[id]/generate-invoices/route.ts'], auth: true, tags: ['billing', 'invoice'] },
  { method: 'POST', path: '/api/billing/periods/[id]/lock-all', description: 'Lock all billing records in period', calledBy: [], files: ['src/app/api/billing/periods/[id]/lock-all/route.ts'], auth: true, tags: ['billing', 'lock'] },

  // Billing Import
  { method: 'GET', path: '/api/billing/import/batches', description: 'List import batches', calledBy: ['/admin/billing/batches', '/admin/billing/import'], files: ['src/app/api/billing/import/batches/route.ts'], auth: true, tags: ['billing', 'import', 'batch'] },
  { method: 'POST', path: '/api/billing/import/batches', description: 'Create import batch', calledBy: [], files: ['src/app/api/billing/import/batches/route.ts'], auth: true, tags: ['billing', 'import'] },
  { method: 'GET', path: '/api/billing/import/batches/[id]', description: 'Get batch detail', calledBy: ['/admin/billing/batches/[batchId]'], files: ['src/app/api/billing/import/batches/[id]/route.ts'], auth: true, tags: ['billing', 'import', 'batch'] },
  { method: 'PATCH', path: '/api/billing/import/batches/[id]/rows/[rowId]', description: 'Update batch row', calledBy: [], files: ['src/app/api/billing/import/batches/[id]/rows/[rowId]/route.ts'], auth: true, tags: ['billing', 'import', 'row'] },
  { method: 'POST', path: '/api/billing/import/execute', description: 'Execute billing import', calledBy: ['/admin/billing/import'], files: ['src/app/api/billing/import/execute/route.ts'], auth: true, tags: ['billing', 'import', 'excel'] },
  { method: 'POST', path: '/api/billing/monthly-data/import', description: 'Preview monthly data import', calledBy: ['/admin/billing/import'], files: ['src/app/api/billing/monthly-data/import/route.ts'], auth: true, tags: ['billing', 'import', 'monthly', 'meter'] },
  { method: 'POST', path: '/api/billing/monthly-data/import/execute', description: 'Execute monthly data import', calledBy: ['/admin/billing/import'], files: ['src/app/api/billing/monthly-data/import/execute/route.ts'], auth: true, tags: ['billing', 'import', 'meter'] },

  // Broadcast
  { method: 'GET', path: '/api/broadcast', description: 'List broadcasts', calledBy: ['/admin/broadcast'], files: ['src/app/api/broadcast/route.ts'], auth: true, tags: ['broadcast', 'line'] },
  { method: 'POST', path: '/api/broadcast', description: 'Create and send broadcast', calledBy: ['/admin/broadcast'], files: ['src/app/api/broadcast/route.ts'], auth: true, tags: ['broadcast', 'line'] },
  { method: 'GET', path: '/api/broadcast/[id]', description: 'Get broadcast status', calledBy: [], files: ['src/app/api/broadcast/[id]/route.ts'], auth: true, tags: ['broadcast'] },
  { method: 'DELETE', path: '/api/broadcast/[id]', description: 'Delete broadcast', calledBy: [], files: ['src/app/api/broadcast/[id]/route.ts'], auth: true, tags: ['broadcast'] },

  // Chat
  { method: 'POST', path: '/api/chat/quick-reply', description: 'Get quick reply options', calledBy: [], files: ['src/app/api/chat/quick-reply/route.ts'], auth: true, tags: ['chat', 'quick reply'] },
  { method: 'POST', path: '/api/chat/reply', description: 'Send chat reply', calledBy: [], files: ['src/app/api/chat/reply/route.ts'], auth: true, tags: ['chat', 'reply'] },

  // Conversations
  { method: 'GET', path: '/api/conversations', description: 'List LINE conversations', calledBy: ['/admin/chat'], files: ['src/app/api/conversations/route.ts'], auth: true, tags: ['chat', 'conversation', 'line'] },
  { method: 'GET', path: '/api/conversations/[id]', description: 'Get conversation detail', calledBy: ['/admin/chat/[conversationId]'], files: ['src/app/api/conversations/[id]/route.ts'], auth: true, tags: ['chat', 'conversation'] },
  { method: 'GET', path: '/api/conversations/[id]/messages', description: 'Get messages in conversation', calledBy: ['/admin/chat/[conversationId]'], files: ['src/app/api/conversations/[id]/messages/route.ts'], auth: true, tags: ['chat', 'message'] },
  { method: 'POST', path: '/api/conversations/[id]/messages', description: 'Send message in conversation', calledBy: ['/admin/chat/[conversationId]'], files: ['src/app/api/conversations/[id]/messages/route.ts'], auth: true, tags: ['chat', 'send', 'line'] },
  { method: 'POST', path: '/api/conversations/[id]/files/send', description: 'Send file in conversation', calledBy: ['/admin/chat/[conversationId]'], files: ['src/app/api/conversations/[id]/files/send/route.ts'], auth: true, tags: ['chat', 'file', 'line'] },
  { method: 'GET', path: '/api/conversations/[id]/invoices/latest', description: 'Get latest invoice for conversation', calledBy: [], files: ['src/app/api/conversations/[id]/invoices/latest/route.ts'], auth: true, tags: ['chat', 'invoice'] },

  // Contracts
  { method: 'GET', path: '/api/contracts', description: 'List contracts', calledBy: ['/admin/contracts', '/admin/tenants/[tenantId]'], files: ['src/app/api/contracts/route.ts'], auth: true, tags: ['contract'] },
  { method: 'POST', path: '/api/contracts', description: 'Create contract', calledBy: ['/admin/contracts'], files: ['src/app/api/contracts/route.ts'], auth: true, tags: ['contract'] },
  { method: 'GET', path: '/api/contracts/[id]', description: 'Get contract detail', calledBy: [], files: ['src/app/api/contracts/[id]/route.ts'], auth: true, tags: ['contract'] },
  { method: 'PATCH', path: '/api/contracts/[id]', description: 'Update contract', calledBy: [], files: ['src/app/api/contracts/[id]/route.ts'], auth: true, tags: ['contract'] },
  { method: 'POST', path: '/api/contracts/[id]/renew', description: 'Renew contract', calledBy: ['/admin/contracts'], files: ['src/app/api/contracts/[id]/renew/route.ts'], auth: true, tags: ['contract', 'renew'] },
  { method: 'POST', path: '/api/contracts/[id]/terminate', description: 'Terminate contract', calledBy: [], files: ['src/app/api/contracts/[id]/terminate/route.ts'], auth: true, tags: ['contract', 'terminate'] },

  // Deliveries
  { method: 'GET', path: '/api/deliveries', description: 'List deliveries', calledBy: ['/admin/deliveries'], files: ['src/app/api/deliveries/route.ts'], auth: true, tags: ['delivery', 'send'] },
  { method: 'POST', path: '/api/deliveries', description: 'Create delivery', calledBy: [], files: ['src/app/api/deliveries/route.ts'], auth: true, tags: ['delivery'] },
  { method: 'GET', path: '/api/deliveries/[id]', description: 'Get delivery detail', calledBy: [], files: ['src/app/api/deliveries/[id]/route.ts'], auth: true, tags: ['delivery'] },
  { method: 'POST', path: '/api/deliveries/[id]/resend', description: 'Resend delivery', calledBy: [], files: ['src/app/api/deliveries/[id]/resend/route.ts'], auth: true, tags: ['delivery', 'resend'] },
  { method: 'POST', path: '/api/delivery-orders/[id]/send', description: 'Send delivery order', calledBy: ['/admin/deliveries'], files: ['src/app/api/delivery-orders/[id]/send/route.ts'], auth: true, tags: ['delivery', 'send'] },

  // Documents
  { method: 'POST', path: '/api/documents/generate', description: 'Generate documents', calledBy: ['/admin/documents/generate'], files: ['src/app/api/documents/generate/route.ts'], auth: true, tags: ['document', 'generate', 'pdf'] },
  { method: 'POST', path: '/api/documents/generate/batch', description: 'Batch generate documents', calledBy: [], files: ['src/app/api/documents/generate/batch/route.ts'], auth: true, tags: ['document', 'batch'] },
  { method: 'GET', path: '/api/documents/[id]', description: 'Get generated document', calledBy: [], files: ['src/app/api/documents/[id]/route.ts'], auth: true, tags: ['document'] },
  { method: 'POST', path: '/api/documents/[id]/regenerate', description: 'Regenerate document', calledBy: [], files: ['src/app/api/documents/[id]/regenerate/route.ts'], auth: true, tags: ['document', 'regenerate'] },
  { method: 'POST', path: '/api/documents/[id]/send', description: 'Send document via LINE', calledBy: ['/admin/documents'], files: ['src/app/api/documents/[id]/send/route.ts'], auth: true, tags: ['document', 'send', 'line'] },
  { method: 'GET', path: '/api/documents/[id]/pdf', description: 'Download document PDF', calledBy: [], files: ['src/app/api/documents/[id]/pdf/route.ts'], auth: true, tags: ['document', 'pdf'] },

  // Expenses
  { method: 'GET', path: '/api/expenses', description: 'List expenses', calledBy: ['/admin/expenses'], files: ['src/app/api/expenses/route.ts'], auth: true, tags: ['expense'] },
  { method: 'POST', path: '/api/expenses', description: 'Create expense', calledBy: ['/admin/expenses'], files: ['src/app/api/expenses/route.ts'], auth: true, tags: ['expense'] },
  { method: 'PATCH', path: '/api/expenses/[id]', description: 'Update expense', calledBy: [], files: ['src/app/api/expenses/[id]/route.ts'], auth: true, tags: ['expense'] },
  { method: 'DELETE', path: '/api/expenses/[id]', description: 'Delete expense', calledBy: [], files: ['src/app/api/expenses/[id]/route.ts'], auth: true, tags: ['expense'] },

  // Files
  { method: 'POST', path: '/api/files', description: 'Upload file', calledBy: ['/admin/documents/generate'], files: ['src/app/api/files/route.ts'], auth: true, tags: ['file', 'upload'] },

  // Floors
  { method: 'GET', path: '/api/floors', description: 'List floors', calledBy: ['/admin/floors'], files: ['src/app/api/floors/route.ts'], auth: true, tags: ['floor', 'room'] },
  { method: 'POST', path: '/api/floors', description: 'Create floor', calledBy: ['/admin/floors'], files: ['src/app/api/floors/route.ts'], auth: true, tags: ['floor'] },
  { method: 'GET', path: '/api/floors/[id]', description: 'Get floor detail', calledBy: ['/admin/floors/[floorId]'], files: ['src/app/api/floors/[id]/route.ts'], auth: true, tags: ['floor'] },
  { method: 'PATCH', path: '/api/floors/[id]', description: 'Update floor', calledBy: [], files: ['src/app/api/floors/[id]/route.ts'], auth: true, tags: ['floor'] },

  // Health
  { method: 'GET', path: '/api/health', description: 'Basic health check', calledBy: [], files: ['src/app/api/health/route.ts'], auth: false, tags: ['health'] },
  { method: 'GET', path: '/api/health/live', description: 'Liveness probe', calledBy: [], files: ['src/app/api/health/live/route.ts'], auth: false, tags: ['health'] },
  { method: 'GET', path: '/api/health/ready', description: 'Readiness probe', calledBy: [], files: ['src/app/api/health/ready/route.ts'], auth: false, tags: ['health'] },
  { method: 'GET', path: '/api/health/deep', description: 'Deep health check (DB, Redis, Outbox, Worker)', calledBy: ['/admin/system-health'], files: ['src/app/api/health/deep/route.ts'], auth: false, tags: ['health', 'deep'] },

  // Invoices
  { method: 'GET', path: '/api/invoices', description: 'List invoices', calledBy: ['/admin/invoices', '/admin/overdue', '/admin/tenants/[tenantId]'], files: ['src/app/api/invoices/route.ts'], auth: true, tags: ['invoice'] },
  { method: 'GET', path: '/api/invoices/[id]', description: 'Get invoice detail', calledBy: ['/admin/invoices/[id]'], files: ['src/app/api/invoices/[id]/route.ts'], auth: true, tags: ['invoice'] },
  { method: 'PATCH', path: '/api/invoices/[id]', description: 'Update invoice', calledBy: [], files: ['src/app/api/invoices/[id]/route.ts'], auth: true, tags: ['invoice'] },
  { method: 'POST', path: '/api/invoices/[id]/send', description: 'Send invoice (LINE/PDF/Print)', calledBy: ['/admin/invoices', '/admin/invoices/[id]'], files: ['src/app/api/invoices/[id]/send/route.ts'], auth: true, tags: ['invoice', 'send', 'line'] },
  { method: 'GET', path: '/api/invoices/[id]/pdf', description: 'Get invoice PDF', calledBy: ['/admin/invoices/[id]'], files: ['src/app/api/invoices/[id]/pdf/route.ts'], auth: true, tags: ['invoice', 'pdf'] },
  { method: 'POST', path: '/api/invoices/[id]/pay', description: 'Mark invoice as paid', calledBy: [], files: ['src/app/api/invoices/[id]/pay/route.ts'], auth: true, tags: ['invoice', 'paid'] },
  { method: 'GET', path: '/api/invoices/print-queue', description: 'Get print queue', calledBy: [], files: ['src/app/api/invoices/print-queue/route.ts'], auth: true, tags: ['invoice', 'print'] },
  { method: 'POST', path: '/api/invoices/deliveries/[id]/mark-printed', description: 'Mark invoice delivery as printed', calledBy: [], files: ['src/app/api/invoices/deliveries/[id]/mark-printed/route.ts'], auth: true, tags: ['invoice', 'print'] },
  { method: 'GET', path: '/api/late-fees', description: 'Get late fees overview', calledBy: ['/admin/late-fees'], files: ['src/app/api/late-fees/route.ts'], auth: true, tags: ['late fee', 'overdue'] },

  // LINE Webhook
  { method: 'POST', path: '/api/line/webhook', description: 'LINE webhook receiver (follow, message, postback)', calledBy: ['LINE servers'], files: ['src/app/api/line/webhook/route.ts'], auth: false, tags: ['line', 'webhook'] },
  { method: 'POST', path: '/api/line/rich-menu', description: 'Setup LINE rich menu', calledBy: ['/admin/settings/integrations'], files: ['src/app/api/line/rich-menu/route.ts'], auth: true, tags: ['line', 'rich menu'] },

  // Maintenance
  { method: 'POST', path: '/api/maintenance/create', description: 'Tenant create maintenance ticket (LINE)', calledBy: ['LINE message'], files: ['src/app/api/maintenance/create/route.ts'], auth: false, tags: ['maintenance', 'ticket', 'line'] },
  { method: 'GET', path: '/api/maintenance/my', description: 'Get tenant own tickets', calledBy: [], files: ['src/app/api/maintenance/my/route.ts'], auth: false, tags: ['maintenance', 'tenant'] },

  // Message Templates
  { method: 'GET', path: '/api/message-templates', description: 'List message templates', calledBy: ['/admin/message-templates'], files: ['src/app/api/message-templates/route.ts'], auth: true, tags: ['message', 'template'] },
  { method: 'POST', path: '/api/message-templates', description: 'Create message template', calledBy: ['/admin/message-templates'], files: ['src/app/api/message-templates/route.ts'], auth: true, tags: ['message', 'template'] },
  { method: 'PATCH', path: '/api/message-templates/[id]', description: 'Update message template', calledBy: [], files: ['src/app/api/message-templates/[id]/route.ts'], auth: true, tags: ['message', 'template'] },
  { method: 'DELETE', path: '/api/message-templates/[id]', description: 'Delete message template', calledBy: [], files: ['src/app/api/message-templates/[id]/route.ts'], auth: true, tags: ['message', 'template'] },

  // Move-Outs
  { method: 'GET', path: '/api/moveouts', description: 'List move-outs', calledBy: ['/admin/moveouts'], files: ['src/app/api/moveouts/route.ts'], auth: true, tags: ['moveout'] },
  { method: 'POST', path: '/api/moveouts', description: 'Create move-out', calledBy: ['/admin/moveouts'], files: ['src/app/api/moveouts/route.ts'], auth: true, tags: ['moveout'] },
  { method: 'GET', path: '/api/moveouts/[id]', description: 'Get move-out detail', calledBy: [], files: ['src/app/api/moveouts/[id]/route.ts'], auth: true, tags: ['moveout'] },
  { method: 'PATCH', path: '/api/moveouts/[id]', description: 'Update move-out', calledBy: [], files: ['src/app/api/moveouts/[id]/route.ts'], auth: true, tags: ['moveout'] },
  { method: 'POST', path: '/api/moveouts/[id]/calculate', description: 'Calculate deposit deduction', calledBy: ['/admin/moveouts'], files: ['src/app/api/moveouts/[id]/calculate/route.ts'], auth: true, tags: ['moveout', 'deposit'] },
  { method: 'POST', path: '/api/moveouts/[id]/confirm', description: 'Confirm move-out', calledBy: ['/admin/moveouts'], files: ['src/app/api/moveouts/[id]/confirm/route.ts'], auth: true, tags: ['moveout', 'confirm'] },
  { method: 'POST', path: '/api/moveouts/[id]/cancel', description: 'Cancel move-out', calledBy: [], files: ['src/app/api/moveouts/[id]/cancel/route.ts'], auth: true, tags: ['moveout', 'cancel'] },
  { method: 'POST', path: '/api/moveouts/[id]/refund', description: 'Mark deposit refunded', calledBy: ['/admin/moveouts'], files: ['src/app/api/moveouts/[id]/refund/route.ts'], auth: true, tags: ['moveout', 'refund'] },
  { method: 'POST', path: '/api/moveouts/[id]/send-notice', description: 'Send LINE move-out notice', calledBy: ['/admin/moveouts'], files: ['src/app/api/moveouts/[id]/send-notice/route.ts'], auth: true, tags: ['moveout', 'line'] },
  { method: 'GET', path: '/api/moveouts/[id]/items', description: 'Get move-out items', calledBy: [], files: ['src/app/api/moveouts/[id]/items/route.ts'], auth: true, tags: ['moveout', 'item'] },
  { method: 'POST', path: '/api/moveouts/[id]/items', description: 'Add move-out inspection item', calledBy: ['/admin/moveouts'], files: ['src/app/api/moveouts/[id]/items/route.ts'], auth: true, tags: ['moveout', 'inspection'] },
  { method: 'PATCH', path: '/api/moveouts/[id]/items/[itemId]', description: 'Update move-out item', calledBy: [], files: ['src/app/api/moveouts/[id]/items/[itemId]/route.ts'], auth: true, tags: ['moveout', 'item'] },
  { method: 'DELETE', path: '/api/moveouts/[id]/items/[itemId]', description: 'Delete move-out item', calledBy: [], files: ['src/app/api/moveouts/[id]/items/[itemId]/route.ts'], auth: true, tags: ['moveout', 'item'] },

  // Notifications
  { method: 'GET', path: '/api/notifications', description: 'List notifications', calledBy: ['/admin/notifications'], files: ['src/app/api/notifications/route.ts'], auth: true, tags: ['notification'] },
  { method: 'GET', path: '/api/notifications/stream', description: 'SSE real-time notification stream', calledBy: ['useNotificationStream hook'], files: ['src/app/api/notifications/stream/route.ts'], auth: true, tags: ['notification', 'sse', 'real-time'] },

  // Payments
  { method: 'GET', path: '/api/payments', description: 'List payments', calledBy: ['/admin/payments'], files: ['src/app/api/payments/route.ts'], auth: true, tags: ['payment'] },
  { method: 'POST', path: '/api/payments', description: 'Create payment', calledBy: [], files: ['src/app/api/payments/route.ts'], auth: true, tags: ['payment'] },
  { method: 'GET', path: '/api/payments/[id]', description: 'Get payment detail', calledBy: ['/admin/payments/[paymentId]'], files: ['src/app/api/payments/[id]/route.ts'], auth: true, tags: ['payment'] },
  { method: 'PATCH', path: '/api/payments/[id]', description: 'Update payment', calledBy: [], files: ['src/app/api/payments/[id]/route.ts'], auth: true, tags: ['payment'] },
  { method: 'POST', path: '/api/payments/import', description: 'Import payments from file', calledBy: [], files: ['src/app/api/payments/import/route.ts'], auth: true, tags: ['payment', 'import'] },
  { method: 'POST', path: '/api/payments/statement-upload', description: 'Upload bank statement', calledBy: ['/admin/payments/upload-statement'], files: ['src/app/api/payments/statement-upload/route.ts'], auth: true, tags: ['payment', 'bank', 'statement'] },
  { method: 'GET', path: '/api/payments/matched', description: 'Get matched payment-invoice pairs', calledBy: ['/admin/payments/review-match'], files: ['src/app/api/payments/matched/route.ts'], auth: true, tags: ['payment', 'match'] },
  { method: 'GET', path: '/api/payments/review', description: 'Get payment review queue', calledBy: ['/admin/payments/review'], files: ['src/app/api/payments/review/route.ts'], auth: true, tags: ['payment', 'review'] },
  { method: 'POST', path: '/api/payments/match/confirm', description: 'Confirm payment match', calledBy: ['/admin/payments/review'], files: ['src/app/api/payments/match/confirm/route.ts'], auth: true, tags: ['payment', 'match', 'confirm'] },
  { method: 'POST', path: '/api/payments/match/reject', description: 'Reject payment match', calledBy: ['/admin/payments/review'], files: ['src/app/api/payments/match/reject/route.ts'], auth: true, tags: ['payment', 'match', 'reject'] },

  // Receipts
  { method: 'POST', path: '/api/receipts/[id]/send', description: 'Send receipt via LINE', calledBy: [], files: ['src/app/api/receipts/[id]/send/route.ts'], auth: true, tags: ['receipt', 'send', 'line'] },

  // Reminders
  { method: 'GET', path: '/api/reminders/config', description: 'Get reminder configs', calledBy: ['/admin/settings/reminders'], files: ['src/app/api/reminders/config/route.ts'], auth: true, tags: ['reminder', 'config'] },
  { method: 'POST', path: '/api/reminders/config', description: 'Create/update reminder config', calledBy: ['/admin/settings/reminders'], files: ['src/app/api/reminders/config/route.ts'], auth: true, tags: ['reminder', 'config'] },
  { method: 'POST', path: '/api/reminders/send', description: 'Send single reminder', calledBy: [], files: ['src/app/api/reminders/send/route.ts'], auth: true, tags: ['reminder', 'send'] },
  { method: 'POST', path: '/api/reminders/bulk-send', description: 'Bulk send reminders', calledBy: [], files: ['src/app/api/reminders/bulk-send/route.ts'], auth: true, tags: ['reminder', 'bulk'] },

  // Reports
  { method: 'GET', path: '/api/reports/profit-loss', description: 'Get profit & loss report', calledBy: ['/admin/reports/profit-loss'], files: ['src/app/api/reports/profit-loss/route.ts'], auth: true, tags: ['report', 'profit', 'loss'] },

  // Rooms
  { method: 'GET', path: '/api/rooms', description: 'List rooms', calledBy: ['/admin/rooms', '/admin/settings/rooms', '/admin/tenants/[tenantId]'], files: ['src/app/api/rooms/route.ts'], auth: true, tags: ['room'] },
  { method: 'POST', path: '/api/rooms', description: 'Create room', calledBy: ['/admin/rooms'], files: ['src/app/api/rooms/route.ts'], auth: true, tags: ['room'] },
  { method: 'GET', path: '/api/rooms/[id]', description: 'Get room detail', calledBy: ['/admin/rooms/[roomId]'], files: ['src/app/api/rooms/[id]/route.ts'], auth: true, tags: ['room'] },
  { method: 'PATCH', path: '/api/rooms/[id]', description: 'Update room', calledBy: [], files: ['src/app/api/rooms/[id]/route.ts'], auth: true, tags: ['room'] },
  { method: 'GET', path: '/api/rooms/[id]/status', description: 'Get room status', calledBy: [], files: ['src/app/api/rooms/[id]/status/route.ts'], auth: true, tags: ['room', 'status'] },
  { method: 'POST', path: '/api/rooms/[id]/status', description: 'Update room status', calledBy: [], files: ['src/app/api/rooms/[id]/status/route.ts'], auth: true, tags: ['room', 'status'] },
  { method: 'GET', path: '/api/rooms/[id]/tenants', description: 'Get room tenants', calledBy: ['/admin/rooms/[roomId]'], files: ['src/app/api/rooms/[id]/tenants/route.ts'], auth: true, tags: ['room', 'tenant'] },

  // Search
  { method: 'GET', path: '/api/search', description: 'Global search', calledBy: ['/admin/layout (top bar)'], files: ['src/app/api/search/route.ts'], auth: true, tags: ['search'] },

  // Settings Building
  { method: 'GET', path: '/api/settings/building', description: 'Get building settings', calledBy: ['/admin/settings/building'], files: ['src/app/api/settings/building/route.ts'], auth: true, tags: ['settings', 'building'] },
  { method: 'POST', path: '/api/settings/building', description: 'Update building settings', calledBy: ['/admin/settings/building'], files: ['src/app/api/settings/building/route.ts'], auth: true, tags: ['settings', 'building'] },

  // Settings Integrations
  { method: 'GET', path: '/api/settings/integrations', description: 'Get LINE integration settings', calledBy: ['/admin/settings/integrations'], files: ['src/app/api/settings/integrations/route.ts'], auth: true, tags: ['settings', 'line'] },
  { method: 'POST', path: '/api/settings/integrations', description: 'Update LINE integration settings', calledBy: ['/admin/settings/integrations'], files: ['src/app/api/settings/integrations/route.ts'], auth: true, tags: ['settings', 'line'] },

  // Settings Automation
  { method: 'GET', path: '/api/settings/automation', description: 'Get automation settings', calledBy: ['/admin/settings/automation'], files: ['src/app/api/settings/automation/route.ts'], auth: true, tags: ['settings', 'automation'] },
  { method: 'POST', path: '/api/settings/automation', description: 'Update automation settings', calledBy: ['/admin/settings/automation'], files: ['src/app/api/settings/automation/route.ts'], auth: true, tags: ['settings', 'automation'] },

  // System
  { method: 'GET', path: '/api/system/alerts', description: 'Get system alerts', calledBy: [], files: ['src/app/api/system/alerts/route.ts'], auth: true, tags: ['system', 'alert'] },
  { method: 'GET', path: '/api/system/backup-status', description: 'Get backup status', calledBy: ['/admin/system'], files: ['src/app/api/system/backup-status/route.ts'], auth: true, tags: ['system', 'backup'] },
  { method: 'POST', path: '/api/system/backup/run', description: 'Trigger manual backup', calledBy: ['/admin/system'], files: ['src/app/api/system/backup/run/route.ts'], auth: true, tags: ['system', 'backup'] },

  // Templates
  { method: 'GET', path: '/api/templates', description: 'List document templates', calledBy: ['/admin/templates', '/admin/documents/generate'], files: ['src/app/api/templates/route.ts'], auth: true, tags: ['template', 'document'] },
  { method: 'POST', path: '/api/templates', description: 'Create template', calledBy: ['/admin/templates'], files: ['src/app/api/templates/route.ts'], auth: true, tags: ['template'] },
  { method: 'GET', path: '/api/templates/[id]', description: 'Get template detail', calledBy: ['/admin/templates/[id]'], files: ['src/app/api/templates/[id]/route.ts'], auth: true, tags: ['template'] },
  { method: 'PATCH', path: '/api/templates/[id]', description: 'Update template', calledBy: [], files: ['src/app/api/templates/[id]/route.ts'], auth: true, tags: ['template'] },
  { method: 'DELETE', path: '/api/templates/[id]', description: 'Delete template', calledBy: [], files: ['src/app/api/templates/[id]/route.ts'], auth: true, tags: ['template'] },
  { method: 'POST', path: '/api/templates/[id]/versions', description: 'Create template version', calledBy: ['/admin/templates/[id]/edit'], files: ['src/app/api/templates/[id]/versions/route.ts'], auth: true, tags: ['template', 'version'] },
  { method: 'POST', path: '/api/templates/[id]/activate-version', description: 'Activate template version', calledBy: [], files: ['src/app/api/templates/[id]/activate-version/route.ts'], auth: true, tags: ['template', 'version', 'activate'] },
  { method: 'GET', path: '/api/templates/[id]/versions', description: 'List template versions', calledBy: ['/admin/templates/[id]', '/admin/templates/[id]/diff'], files: ['src/app/api/templates/[id]/versions/route.ts'], auth: true, tags: ['template', 'version'] },
  { method: 'GET', path: '/api/templates/[id]/fields', description: 'Get template field catalog', calledBy: [], files: ['src/app/api/templates/[id]/fields/route.ts'], auth: true, tags: ['template', 'field'] },
  { method: 'POST', path: '/api/templates/[id]/fields', description: 'Define template field', calledBy: [], files: ['src/app/api/templates/[id]/fields/route.ts'], auth: true, tags: ['template', 'field'] },
  { method: 'POST', path: '/api/templates/[id]/preview', description: 'Preview template render', calledBy: [], files: ['src/app/api/templates/[id]/preview/route.ts'], auth: true, tags: ['template', 'preview'] },
  { method: 'POST', path: '/api/templates/[id]/upload-image', description: 'Upload image to template', calledBy: [], files: ['src/app/api/templates/[id]/upload-image/route.ts'], auth: true, tags: ['template', 'image', 'upload'] },
  { method: 'POST', path: '/api/templates/[id]/duplicate', description: 'Duplicate template', calledBy: [], files: ['src/app/api/templates/[id]/duplicate/route.ts'], auth: true, tags: ['template', 'duplicate'] },
  { method: 'GET', path: '/api/templates/[id]/comments', description: 'Get template comments', calledBy: [], files: ['src/app/api/templates/[id]/comments/route.ts'], auth: true, tags: ['template', 'comment'] },
  { method: 'POST', path: '/api/templates/[id]/comments', description: 'Add template comment', calledBy: [], files: ['src/app/api/templates/[id]/comments/route.ts'], auth: true, tags: ['template', 'comment'] },
  { method: 'DELETE', path: '/api/templates/[id]/comments/[commentId]', description: 'Delete template comment', calledBy: [], files: ['src/app/api/templates/[id]/comments/[commentId]/route.ts'], auth: true, tags: ['template', 'comment'] },
  { method: 'GET', path: '/api/templates/[id]/images', description: 'Get template images', calledBy: [], files: ['src/app/api/templates/[id]/images/route.ts'], auth: true, tags: ['template', 'image'] },
  { method: 'POST', path: '/api/templates/[id]/images', description: 'Upload template image', calledBy: [], files: ['src/app/api/templates/[id]/images/route.ts'], auth: true, tags: ['template', 'image'] },
  { method: 'DELETE', path: '/api/templates/[id]/images/[imageId]', description: 'Delete template image', calledBy: [], files: ['src/app/api/templates/[id]/images/[imageId]/route.ts'], auth: true, tags: ['template', 'image'] },

  // Tenant Registrations
  { method: 'GET', path: '/api/tenant-registrations', description: 'List tenant registrations', calledBy: ['/admin/tenant-registrations'], files: ['src/app/api/tenant-registrations/route.ts'], auth: true, tags: ['tenant', 'registration'] },
  { method: 'GET', path: '/api/tenant-registrations/[id]', description: 'Get tenant registration', calledBy: [], files: ['src/app/api/tenant-registrations/[id]/route.ts'], auth: true, tags: ['tenant', 'registration'] },
  { method: 'PATCH', path: '/api/tenant-registrations/[id]', description: 'Update tenant registration', calledBy: [], files: ['src/app/api/tenant-registrations/[id]/route.ts'], auth: true, tags: ['tenant', 'registration'] },
  { method: 'POST', path: '/api/tenant-registrations/[id]/approve', description: 'Approve tenant registration', calledBy: ['/admin/tenant-registrations'], files: ['src/app/api/tenant-registrations/[id]/approve/route.ts'], auth: true, tags: ['tenant', 'registration', 'approve'] },
  { method: 'POST', path: '/api/tenant-registrations/[id]/reject', description: 'Reject tenant registration', calledBy: ['/admin/tenant-registrations'], files: ['src/app/api/tenant-registrations/[id]/reject/route.ts'], auth: true, tags: ['tenant', 'registration', 'reject'] },

  // Tenants
  { method: 'GET', path: '/api/tenants', description: 'List tenants', calledBy: ['/admin/tenants'], files: ['src/app/api/tenants/route.ts'], auth: true, tags: ['tenant'] },
  { method: 'POST', path: '/api/tenants', description: 'Create tenant', calledBy: ['/admin/tenants'], files: ['src/app/api/tenants/route.ts'], auth: true, tags: ['tenant'] },
  { method: 'GET', path: '/api/tenants/[id]', description: 'Get tenant detail', calledBy: ['/admin/tenants/[tenantId]'], files: ['src/app/api/tenants/[id]/route.ts'], auth: true, tags: ['tenant'] },
  { method: 'PATCH', path: '/api/tenants/[id]', description: 'Update tenant', calledBy: [], files: ['src/app/api/tenants/[id]/route.ts'], auth: true, tags: ['tenant'] },
  { method: 'POST', path: '/api/tenants/[id]/notify', description: 'Send LINE notification to tenant', calledBy: [], files: ['src/app/api/tenants/[id]/notify/route.ts'], auth: true, tags: ['tenant', 'notify', 'line'] },
  { method: 'POST', path: '/api/tenants/[id]/line', description: 'Link tenant LINE account', calledBy: [], files: ['src/app/api/tenants/[id]/line/route.ts'], auth: true, tags: ['tenant', 'line'] },
];

// ─── LOOKUP HELPERS ───────────────────────────

export function getPageByPath(path: string): AdminPage | undefined {
  // Normalize: remove query params, trailing slash
  const normalized = path.split('?')[0].replace(/\/$/, '');
  return ADMIN_PAGES.find(p => {
    const normP = p.path.replace(/\/$/, '');
    if (normP === normalized) return true;
    // Handle dynamic routes: /admin/rooms/[roomId] matches /admin/rooms/101
    const pParts = normP.split('/').filter(Boolean);
    const pathParts = normalized.split('/').filter(Boolean);
    if (pParts.length !== pathParts.length) return false;
    return pParts.every((part, i) =>
      part.startsWith('[') ? true : part === pathParts[i]
    );
  });
}

export function getRouteByPath(method: string, path: string): ApiRoute | undefined {
  const normalized = path.replace(/\/$/, '');
  return API_ROUTES.find(r => {
    if (r.method !== method) return false;
    const rPath = r.path.replace(/\/$/, '');
    if (rPath === normalized) return true;
    const rParts = rPath.split('/').filter(Boolean);
    const pathParts = normalized.split('/').filter(Boolean);
    if (rParts.length !== pathParts.length) return false;
    return rParts.every((part, i) =>
      part.startsWith('[') ? true : part === pathParts[i]
    );
  });
}

export function getPagesBySection(section: string): AdminPage[] {
  return ADMIN_PAGES.filter(p => p.section === section);
}

export function getRoutesByTag(tag: string): ApiRoute[] {
  return API_ROUTES.filter(r => r.tags.includes(tag));
}

export function searchPages(query: string): AdminPage[] {
  const q = query.toLowerCase();
  return ADMIN_PAGES.filter(p =>
    p.path.toLowerCase().includes(q) ||
    p.title.toLowerCase().includes(q) ||
    p.titleTh.includes(query) ||
    p.description.toLowerCase().includes(q) ||
    p.tags.some(t => t.toLowerCase().includes(q))
  );
}

export function searchRoutes(query: string): ApiRoute[] {
  const q = query.toLowerCase();
  return API_ROUTES.filter(r =>
    r.path.toLowerCase().includes(q) ||
    r.method.toLowerCase().includes(q) ||
    r.description.toLowerCase().includes(q) ||
    r.tags.some(t => t.toLowerCase().includes(q))
  );
}

export function searchAll(query: string): { pages: AdminPage[]; routes: ApiRoute[]; flows: string[] } {
  return {
    pages: searchPages(query),
    routes: searchRoutes(query),
    flows: [], // flows are searched by name in the UI
  };
}