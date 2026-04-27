/**
 * System Flow Definitions
 * ======================
 * Edit this file to update the interactive system flow diagrams.
 * Each flow has nodes (steps/services) and edges (connections).
 *
 * Node types:
 *   - trigger   : Entry point (API route, cron, user action)
 *   - service   : Core business logic (module service)
 *   - data      : Database operation (Prisma model)
 *   - external  : External service (LINE API, etc.)
 *   - worker    : Background processor (outbox, notifier)
 *
 * Each node's `files` array links to the actual source files.
 */

export type NodeType = 'trigger' | 'service' | 'data' | 'external' | 'worker' | 'page';
export type FlowCategory = 'billing' | 'payment' | 'tenant' | 'maintenance' | 'document' | 'messaging' | 'system' | 'auth' | 'line' | 'contract' | 'health';

export interface FlowNode {
  id: string;
  label: string;
  type: NodeType;
  description: string;
  files: { path: string; description: string }[];
}

export interface FlowEdge {
  from: string;
  to: string;
  label?: string;
}

export interface FlowDefinition {
  id: string;
  name: string;
  nameTh: string;
  description: string;
  category: FlowCategory;
  /** Linear layout (top → bottom): array of node IDs in order */
  linearLayout: string[];
  nodes: Record<string, FlowNode>;
  edges: FlowEdge[];
  /** Where to start reading the flow */
  entryPoint: string;
}

export const systemFlows: FlowDefinition[] = [
  // ─────────────────────────────────────────────
  // FLOW 1: BILLING — Monthly data import → Invoice
  // ─────────────────────────────────────────────
  {
    id: 'billing-monthly',
    name: 'Billing: Monthly Data Import',
    nameTh: 'บิล: นำเข้าข้อมูลรายเดือน',
    description: 'นำเข้าข้อมูลมิเตอร์น้ำ/ไฟจาก Excel → คำนวณค่าบริการ → สร้างบิล → ออกใบแจ้งหนี้',
    category: 'billing',
    entryPoint: 'excel_upload',
    linearLayout: [
      'excel_upload',
      'parse_workbook',
      'preview_batch',
      'review_warnings',
      'execute_import',
      'upsert_billing',
      'lock_billing',
      'generate_invoice',
      'send_invoice',
    ],
    nodes: {
      excel_upload: {
        id: 'excel_upload',
        label: 'Upload Excel (เดือน*.xlsx)',
        type: 'trigger',
        description: 'Admin อัพโหลดไฟล์ Excel ข้อมูลมิเตอร์รายเดือน',
        files: [
          { path: 'src/app/api/billing/monthly-data/import/route.ts', description: 'API route รับไฟล์' },
        ],
      },
      parse_workbook: {
        id: 'parse_workbook',
        label: 'parseMonthlyDataWorkbook()',
        type: 'service',
        description: 'parse ข้อมูลจาก sheets ชั้น 1–8 อ่าน column headers ภาษาไทย แยก prev/curr meter',
        files: [
          { path: 'src/modules/billing/monthly-data-parser.ts', description: 'Parser หลัก' },
        ],
      },
      preview_batch: {
        id: 'preview_batch',
        label: 'Preview Batch',
        type: 'service',
        description: 'สร้าง ImportBatch (PENDING) แสดง preview + warnings (meter reset, total mismatch)',
        files: [
          { path: 'src/modules/billing/monthly-data-import.service.ts', description: 'createMonthlyDataImportPreviewBatch()' },
        ],
      },
      review_warnings: {
        id: 'review_warnings',
        label: 'Admin Review Warnings',
        type: 'page',
        description: 'Admin ตรวจสอบ warning ก่อน confirm',
        files: [
          { path: 'src/app/admin/billing/import/page.tsx', description: 'หน้า Import UI' },
        ],
      },
      execute_import: {
        id: 'execute_import',
        label: 'executeMonthlyDataImportBatch()',
        type: 'service',
        description: 'รัน import จริง upsert RoomBilling records สถานะ DRAFT',
        files: [
          { path: 'src/modules/billing/monthly-data-import.service.ts', description: 'executeMonthlyDataImportBatch()' },
        ],
      },
      upsert_billing: {
        id: 'upsert_billing',
        label: 'RoomBilling (DRAFT)',
        type: 'data',
        description: 'สร้าง/อัพเดท RoomBilling records สำหรับแต่ละห้อง',
        files: [
          { path: 'prisma/schema.prisma', description: 'RoomBilling model' },
        ],
      },
      lock_billing: {
        id: 'lock_billing',
        label: 'lockBillingRecord()',
        type: 'service',
        description: 'เปลี่ยนสถานะ RoomBilling: DRAFT → LOCKED สร้าง OutboxEvent',
        files: [
          { path: 'src/modules/billing/billing.service.ts', description: 'BillingService.lockBillingRecord()' },
        ],
      },
      generate_invoice: {
        id: 'generate_invoice',
        label: 'generateInvoice()',
        type: 'service',
        description: 'สร้าง Invoice record จาก RoomBilling อัพเดทสถานะ: LOCKED → INVOICED',
        files: [
          { path: 'src/modules/invoices/invoice.service.ts', description: 'InvoiceService.generateInvoice()' },
        ],
      },
      send_invoice: {
        id: 'send_invoice',
        label: 'sendInvoice() → LINE',
        type: 'worker',
        description: 'สร้าง InvoiceDelivery (PENDING) Outbox worker ส่ง LINE message พร้อม PDF link',
        files: [
          { path: 'src/modules/invoices/invoice.service.ts', description: 'InvoiceService.sendInvoice()' },
          { path: 'src/modules/messaging/invoice-notifier.ts', description: 'Outbox worker ส่ง LINE' },
        ],
      },
    },
    edges: [
      { from: 'excel_upload', to: 'parse_workbook' },
      { from: 'parse_workbook', to: 'preview_batch' },
      { from: 'preview_batch', to: 'review_warnings' },
      { from: 'review_warnings', to: 'execute_import' },
      { from: 'execute_import', to: 'upsert_billing' },
      { from: 'upsert_billing', to: 'lock_billing' },
      { from: 'lock_billing', to: 'generate_invoice' },
      { from: 'generate_invoice', to: 'send_invoice' },
    ],
  },

  // ─────────────────────────────────────────────
  // FLOW 2: PAYMENT MATCHING
  // ─────────────────────────────────────────────
  {
    id: 'payment-matching',
    name: 'Payment Receipt & Matching',
    nameTh: 'รับชำระเงิน & จับคู่',
    description: 'อัพโหลดสมุดบัญชีธนาคาร → parse รายการ → จับคู่กับ Invoice → สถานะชำระแล้ว',
    category: 'payment',
    entryPoint: 'bank_statement_upload',
    linearLayout: ['bank_statement_upload', 'parse_statement', 'match_transactions', 'auto_confirm', 'need_review', 'confirm_match', 'update_invoice_status', 'payment_record'],
    nodes: {
      bank_statement_upload: {
        id: 'bank_statement_upload',
        label: 'Upload Bank Statement',
        type: 'trigger',
        description: 'Admin อัพโหลด Excel/CSV สมุดบัญชีธนาคาร',
        files: [
          { path: 'src/app/admin/payments/upload-statement/page.tsx', description: 'หน้า upload' },
          { path: 'src/app/api/payments/statement-upload/route.ts', description: 'API route' },
        ],
      },
      parse_statement: {
        id: 'parse_statement',
        label: 'BankStatementParser',
        type: 'service',
        description: 'parse column headers ภาษาไทย (วันที่, จำนวน, รายละเอียด, reference) สร้าง PaymentTransaction',
        files: [
          { path: 'src/modules/payments/bank-statement-parser.ts', description: 'Parser' },
          { path: 'src/modules/payments/payment-matching.service.ts', description: 'importBankStatement()' },
        ],
      },
      match_transactions: {
        id: 'match_transactions',
        label: 'attemptMatch()',
        type: 'service',
        description: 'จับคู่แต่ละ transaction กับ invoice ตามลำดับความมั่นใจ',
        files: [
          { path: 'src/modules/payments/payment-matching.service.ts', description: 'attemptMatch() logic' },
        ],
      },
      auto_confirm: {
        id: 'auto_confirm',
        label: 'HIGH confidence → Auto-Confirm',
        type: 'service',
        description: 'Invoice number ตรง หรือ reference code ตรง exact → auto สร้าง Payment (CONFIRMED)',
        files: [
          { path: 'src/modules/payments/payment-matching.service.ts', description: 'autoConfirmMatch()' },
        ],
      },
      need_review: {
        id: 'need_review',
        label: 'MEDIUM/LOW → Need Review',
        type: 'service',
        description: 'Amount + room number ลอยๆ → ต้อง staff ตรวจสอบ',
        files: [
          { path: 'src/modules/payments/payment-matching.service.ts', description: 'NEED_REVIEW status' },
        ],
      },
      confirm_match: {
        id: 'confirm_match',
        label: 'Manual Confirm/Reject',
        type: 'page',
        description: 'Staff ยืนยันหรือปฏิเสธรายการที่ need review',
        files: [
          { path: 'src/app/admin/payments/review/page.tsx', description: 'หน้า review' },
        ],
      },
      update_invoice_status: {
        id: 'update_invoice_status',
        label: 'syncInvoicePaymentState()',
        type: 'service',
        description: 'อัพเดท Invoice status → PAID ถ้าชำระครบ เรียกหลัง confirm ทุกครั้ง',
        files: [
          { path: 'src/modules/payments/invoice-payment-state.ts', description: 'syncInvoicePaymentState()' },
        ],
      },
      payment_record: {
        id: 'payment_record',
        label: 'Payment (CONFIRMED)',
        type: 'data',
        description: 'Payment record สถานะ CONFIRMED พร้อม matched invoice',
        files: [
          { path: 'prisma/schema.prisma', description: 'Payment model' },
          { path: 'prisma/schema.prisma', description: 'PaymentMatch model' },
        ],
      },
    },
    edges: [
      { from: 'bank_statement_upload', to: 'parse_statement' },
      { from: 'parse_statement', to: 'match_transactions' },
      { from: 'match_transactions', to: 'auto_confirm', label: 'HIGH' },
      { from: 'match_transactions', to: 'need_review', label: 'MEDIUM/LOW' },
      { from: 'auto_confirm', to: 'update_invoice_status' },
      { from: 'need_review', to: 'confirm_match' },
      { from: 'confirm_match', to: 'update_invoice_status' },
      { from: 'update_invoice_status', to: 'payment_record' },
    ],
  },

  // ─────────────────────────────────────────────
  // FLOW 3: TENANT REGISTRATION
  // ─────────────────────────────────────────────
  {
    id: 'tenant-registration',
    name: 'Tenant Registration',
    nameTh: 'ลงทะเบียนผู้เช่าใหม่',
    description: 'ผู้เช่าสแกน QR ทาง LINE → ลงทะเบียน → Admin approve → ชี้ห้องให้ → สร้างสัญญา',
    category: 'tenant',
    entryPoint: 'line_scan',
    linearLayout: ['line_scan', 'tenant_registration_pending', 'approve_registration', 'assign_room', 'create_contract', 'room_occupied'],
    nodes: {
      line_scan: {
        id: 'line_scan',
        label: 'Tenant Scans LINE QR',
        type: 'trigger',
        description: 'ผู้เช่าใหม่สแกน QR code เพื่อเพิ่ม LINE Official Account',
        files: [
          { path: 'src/app/api/tenant-registrations/[id]/approve/route.ts', description: 'Approval route' },
        ],
      },
      tenant_registration_pending: {
        id: 'tenant_registration_pending',
        label: 'TenantRegistration (PENDING)',
        type: 'data',
        description: 'สร้าง record รอ Admin ตรวจสอบ พร้อม LINE display name และ claimed room',
        files: [
          { path: 'prisma/schema.prisma', description: 'TenantRegistration model' },
          { path: 'src/app/admin/tenant-registrations/page.tsx', description: 'หน้า registration list' },
        ],
      },
      approve_registration: {
        id: 'approve_registration',
        label: 'Approve Registration',
        type: 'page',
        description: 'Admin กด approve → สร้าง Tenant record → link LINE account',
        files: [
          { path: 'src/app/api/tenant-registrations/[id]/approve/route.ts', description: 'API route' },
          { path: 'src/modules/tenants/tenant.service.ts', description: 'createTenant()' },
        ],
      },
      assign_room: {
        id: 'assign_room',
        label: 'assignTenantToRoom()',
        type: 'service',
        description: 'สร้าง RoomTenant record ถ้า PRIMARY tenant → อัพเดทห้องเป็น OCCUPIED',
        files: [
          { path: 'src/modules/tenants/tenant.service.ts', description: 'assignTenantToRoom()' },
        ],
      },
      create_contract: {
        id: 'create_contract',
        label: 'Contract (ACTIVE)',
        type: 'data',
        description: 'สร้างสัญญาเช่าใหม่ระหว่างผู้เช่ากับห้อง กำหนดค่าเช่ารายเดือน',
        files: [
          { path: 'prisma/schema.prisma', description: 'Contract model' },
          { path: 'src/modules/contracts/contract.service.ts', description: 'ContractService' },
        ],
      },
      room_occupied: {
        id: 'room_occupied',
        label: 'Room (OCCUPIED)',
        type: 'data',
        description: 'ห้องพร้อมสถานะ OCCUPIED รอ billing cycle ถัดไป',
        files: [
          { path: 'prisma/schema.prisma', description: 'Room model + status enum' },
        ],
      },
    },
    edges: [
      { from: 'line_scan', to: 'tenant_registration_pending' },
      { from: 'tenant_registration_pending', to: 'approve_registration' },
      { from: 'approve_registration', to: 'assign_room' },
      { from: 'assign_room', to: 'create_contract' },
      { from: 'create_contract', to: 'room_occupied' },
    ],
  },

  // ─────────────────────────────────────────────
  // FLOW 4: MOVE-OUT
  // ─────────────────────────────────────────────
  {
    id: 'moveout',
    name: 'Move-Out Process',
    nameTh: 'ข้อมูลย้ายออก',
    description: 'แจ้งย้ายออก → ตรวจสอบสภาพห้อง → หักค่าปรับ → คืนเงินประกัน',
    category: 'tenant',
    entryPoint: 'create_moveout',
    linearLayout: ['create_moveout', 'terminate_contract', 'vacate_room', 'inspection_items', 'calculate_deposit', 'confirm_moveout', 'send_notice_line', 'refund_deposit', 'room_vacant'],
    nodes: {
      create_moveout: {
        id: 'create_moveout',
        label: 'Create Move-Out',
        type: 'trigger',
        description: 'Admin หรือผู้เช่าแจ้งย้ายออก สร้าง MoveOut record สถานะ PENDING',
        files: [
          { path: 'src/app/api/moveouts/route.ts', description: 'API route POST /api/moveouts' },
          { path: 'src/modules/moveouts/moveout.service.ts', description: 'MoveOutService.createMoveOut()' },
        ],
      },
      terminate_contract: {
        id: 'terminate_contract',
        label: 'Contract → TERMINATED',
        type: 'service',
        description: 'อัพเดทสถานะสัญญาเป็น TERMINATED พร้อมวันที่ย้ายออก',
        files: [
          { path: 'src/modules/contracts/contract.service.ts', description: 'terminate()' },
        ],
      },
      vacate_room: {
        id: 'vacate_room',
        label: 'Room → VACANT',
        type: 'service',
        description: 'อัพเดทห้องเป็น VACANT อัพเดท RoomTenant.moveOutDate',
        files: [
          { path: 'src/modules/moveouts/moveout.service.ts', description: 'createMoveOut() sets room VACANT' },
        ],
      },
      inspection_items: {
        id: 'inspection_items',
        label: 'Add Inspection Items',
        type: 'page',
        description: 'Admin เพิ่มรายการตรวจสอบสภาพห้อง (ผนัง, พื้น, ห้องน้ำ, เฟอร์นิเจอร์)',
        files: [
          { path: 'src/app/admin/moveouts/page.tsx', description: 'หน้า move-out list' },
          { path: 'src/app/api/moveouts/[id]/items/route.ts', description: 'API route' },
        ],
      },
      calculate_deposit: {
        id: 'calculate_deposit',
        label: 'calculateDeposit()',
        type: 'service',
        description: 'คำนวณหักค่าปรับสภาพห้อง จาก inspection items สถานะ → DEPOSIT_CALCULATED',
        files: [
          { path: 'src/modules/moveouts/moveout.service.ts', description: 'calculateDeposit()' },
        ],
      },
      confirm_moveout: {
        id: 'confirm_moveout',
        label: 'confirmMoveOut()',
        type: 'service',
        description: 'Admin ยืนยันย้ายออก สถานะ → CONFIRMED พร้อม confirmBy + confirmedAt',
        files: [
          { path: 'src/modules/moveouts/moveout.service.ts', description: 'confirmMoveOut()' },
        ],
      },
      send_notice_line: {
        id: 'send_notice_line',
        label: 'send LINE Notice',
        type: 'worker',
        description: 'ส่ง LINE message แจ้งผู้เช่าเรื่องย้ายออกพร้อมสรุปค่าหักและคืนเงิน',
        files: [
          { path: 'src/modules/messaging/payment-notifier.ts', description: 'MoveOut LINE notifier' },
          { path: 'src/app/api/moveouts/[id]/send-notice/route.ts', description: 'API route' },
        ],
      },
      refund_deposit: {
        id: 'refund_deposit',
        label: 'markRefund()',
        type: 'service',
        description: 'บันทึกว่าคืนเงินประกันแล้ว สถานะ → REFUNDED พร้อม refundBy + refundAt',
        files: [
          { path: 'src/modules/moveouts/moveout.service.ts', description: 'markRefund()' },
        ],
      },
      room_vacant: {
        id: 'room_vacant',
        label: 'Room → VACANT (cleaned)',
        type: 'data',
        description: 'ห้องพร้อมรับผู้เช่าใหม่',
        files: [
          { path: 'prisma/schema.prisma', description: 'Room.roomStatus: VACANT' },
        ],
      },
    },
    edges: [
      { from: 'create_moveout', to: 'terminate_contract' },
      { from: 'terminate_contract', to: 'vacate_room' },
      { from: 'vacate_room', to: 'inspection_items' },
      { from: 'inspection_items', to: 'calculate_deposit' },
      { from: 'calculate_deposit', to: 'confirm_moveout' },
      { from: 'confirm_moveout', to: 'send_notice_line' },
      { from: 'send_notice_line', to: 'refund_deposit' },
      { from: 'refund_deposit', to: 'room_vacant' },
    ],
  },

  // ─────────────────────────────────────────────
  // FLOW 5: MAINTENANCE
  // ─────────────────────────────────────────────
  {
    id: 'maintenance',
    name: 'Maintenance Requests',
    nameTh: 'แจ้งซ่อม',
    description: 'ผู้เช่าแจ้งซ่อมผ่าน LINE → Admin รับเรื่อง → assign → ติดตามสถานะ → ปิดงาน',
    category: 'maintenance',
    entryPoint: 'create_ticket',
    linearLayout: ['create_ticket', 'assign_staff', 'update_status', 'add_comments', 'close_ticket', 'tenant_notification'],
    nodes: {
      create_ticket: {
        id: 'create_ticket',
        label: 'createTicket() (LINE or Admin)',
        type: 'trigger',
        description: 'ผู้เช่าแจ้งซ่อมผ่าน LINE menu หรือ Admin แจ้งแทน สถานะ OPEN',
        files: [
          { path: 'src/app/api/maintenance/create/route.ts', description: 'Tenant API' },
          { path: 'src/modules/maintenance/maintenance.service.ts', description: 'MaintenanceService.createTicket()' },
        ],
      },
      assign_staff: {
        id: 'assign_staff',
        label: 'assignStaff()',
        type: 'service',
        description: 'Admin มอบหมายงานให้ staff บันทึก assignedStaffId',
        files: [
          { path: 'src/app/api/admin/maintenance/assign/route.ts', description: 'API route' },
          { path: 'src/modules/maintenance/maintenance.service.ts', description: 'assignStaff()' },
        ],
      },
      update_status: {
        id: 'update_status',
        label: 'updateStatus()',
        type: 'service',
        description: 'อัพเดทสถานะ: OPEN → IN_PROGRESS → WAITING_PARTS → DONE → CLOSED',
        files: [
          { path: 'src/app/api/admin/maintenance/update-status/route.ts', description: 'API route' },
        ],
      },
      add_comments: {
        id: 'add_comments',
        label: 'addComment()',
        type: 'service',
        description: 'Admin/staff เพิ่ม comment บันทึกความคืบหน้า',
        files: [
          { path: 'src/app/api/admin/maintenance/comment/route.ts', description: 'API route' },
        ],
      },
      close_ticket: {
        id: 'close_ticket',
        label: 'Status → CLOSED',
        type: 'service',
        description: 'ปิดงานแจ้งซ่อมเรียบร้อย',
        files: [
          { path: 'src/modules/maintenance/maintenance.service.ts', description: 'updateStatus() → CLOSED' },
        ],
      },
      tenant_notification: {
        id: 'tenant_notification',
        label: 'LINE Reply to Tenant',
        type: 'worker',
        description: 'แจ้งสถานะการซ่อมกลับไปยังผู้เช่าทาง LINE',
        files: [
          { path: 'src/modules/line-maintenance/index.ts', description: 'LINE maintenance handler' },
        ],
      },
    },
    edges: [
      { from: 'create_ticket', to: 'assign_staff' },
      { from: 'assign_staff', to: 'update_status' },
      { from: 'update_status', to: 'add_comments' },
      { from: 'add_comments', to: 'close_ticket', label: 'done' },
      { from: 'close_ticket', to: 'tenant_notification' },
    ],
  },

  // ─────────────────────────────────────────────
  // FLOW 6: DOCUMENT GENERATION
  // ─────────────────────────────────────────────
  {
    id: 'document-gen',
    name: 'Document Generation',
    nameTh: 'สร้างเอกสาร',
    description: 'เลือก template → เลือก scope → preview → generate PDF → ดาวน์โหลด/ส่ง LINE',
    category: 'document',
    entryPoint: 'select_template',
    linearLayout: ['select_template', 'select_scope', 'preview_targets', 'confirm_generate', 'render_html', 'generate_pdf', 'store_file', 'create_delivery', 'send_or_download'],
    nodes: {
      select_template: {
        id: 'select_template',
        label: 'Select Template',
        type: 'page',
        description: 'Admin เลือก template (Invoice, Payment Notice, Contract, Receipt)',
        files: [
          { path: 'src/app/admin/templates/page.tsx', description: 'หน้า template list' },
          { path: 'src/app/admin/documents/generate/page.tsx', description: 'หน้า generate' },
        ],
      },
      select_scope: {
        id: 'select_scope',
        label: 'Select Scope',
        type: 'page',
        description: 'เลือก scope: ห้องเดียว, ชั้น, ทั้งหมด, ห้องที่มีบิล',
        files: [
          { path: 'src/app/admin/documents/generate/page.tsx', description: 'หน้า generate' },
        ],
      },
      preview_targets: {
        id: 'preview_targets',
        label: 'previewGeneration()',
        type: 'service',
        description: 'resolve ห้องที่จะสร้างเอกสารให้ แสดง preview ก่อน confirm',
        files: [
          { path: 'src/modules/documents/generation.service.ts', description: 'previewGeneration()' },
          { path: 'src/modules/documents/resolver.service.ts', description: 'DocumentResolverService' },
        ],
      },
      confirm_generate: {
        id: 'confirm_generate',
        label: 'Confirm Generate',
        type: 'trigger',
        description: 'Admin กด generate → สร้าง DocumentGenerationJob (RUNNING)',
        files: [
          { path: 'src/app/api/documents/generate/route.ts', description: 'API route' },
        ],
      },
      render_html: {
        id: 'render_html',
        label: 'renderTemplateHtml()',
        type: 'service',
        description: 'แทนที่ตัวแปร {{tenantName}}, {{roomNumber}} etc. ใน HTML template',
        files: [
          { path: 'src/modules/documents/render.service.ts', description: 'renderTemplateHtml()' },
        ],
      },
      generate_pdf: {
        id: 'generate_pdf',
        label: 'generateDocumentPdf()',
        type: 'service',
        description: 'แปลง HTML → PDF using puppeteer/browser',
        files: [
          { path: 'src/modules/documents/pdf.service.ts', description: 'generateDocumentPdf()' },
          { path: 'src/modules/documents/pdf-html.ts', description: 'HTML to PDF engine' },
        ],
      },
      store_file: {
        id: 'store_file',
        label: 'storeDocumentFile()',
        type: 'service',
        description: 'บันทึกไฟล์ PDF/HTML ไปที่ S3 หรือ local storage',
        files: [
          { path: 'src/modules/documents/storage.service.ts', description: 'storeDocumentFile()' },
        ],
      },
      create_delivery: {
        id: 'create_delivery',
        label: 'Create DeliveryOrder',
        type: 'data',
        description: 'สร้าง DeliveryOrder + DeliveryOrderItem สำหรับแต่ละห้อง',
        files: [
          { path: 'prisma/schema.prisma', description: 'DeliveryOrder model' },
        ],
      },
      send_or_download: {
        id: 'send_or_download',
        label: 'Send (LINE) / Download',
        type: 'worker',
        description: 'ส่ง LINE หรือดาวน์โหลด PDF',
        files: [
          { path: 'src/app/api/documents/[id]/send/route.ts', description: 'API route' },
          { path: 'src/modules/messaging/file-send.service.ts', description: 'File send worker' },
        ],
      },
    },
    edges: [
      { from: 'select_template', to: 'select_scope' },
      { from: 'select_scope', to: 'preview_targets' },
      { from: 'preview_targets', to: 'confirm_generate' },
      { from: 'confirm_generate', to: 'render_html' },
      { from: 'render_html', to: 'generate_pdf' },
      { from: 'generate_pdf', to: 'store_file' },
      { from: 'store_file', to: 'create_delivery' },
      { from: 'create_delivery', to: 'send_or_download' },
    ],
  },

  // ─────────────────────────────────────────────
  // FLOW 7: LINE MESSAGING & OUTBOX
  // ─────────────────────────────────────────────
  {
    id: 'line-messaging',
    name: 'LINE Messaging & Outbox',
    nameTh: 'ระบบส่ง LINE & Outbox',
    description: 'Transactional outbox pattern — events ถูกเขียนลง DB ก่อน แล้วค่อยส่ง async',
    category: 'messaging',
    entryPoint: 'outbox_worker',
    linearLayout: ['outbox_worker', 'poll_events', 'process_event', 'invoice_notifier', 'reminder_notifier', 'file_send_worker', 'line_api', 'update_status', 'dead_letter'],
    nodes: {
      outbox_worker: {
        id: 'outbox_worker',
        label: 'Outbox Worker (instrumentation.ts)',
        type: 'worker',
        description: 'Bootstrap ตอน start รัน outbox processor ใน background',
        files: [
          { path: 'src/instrumentation.ts', description: 'startOutboxWorker() bootstrap' },
          { path: 'src/infrastructure/outbox/outbox.processor.ts', description: 'OutboxProcessor' },
        ],
      },
      poll_events: {
        id: 'poll_events',
        label: 'Poll Unprocessed Events',
        type: 'worker',
        description: 'every 5s → SELECT * FROM OutboxEvent WHERE processedAt IS NULL ORDER BY createdAt',
        files: [
          { path: 'src/infrastructure/outbox/outbox.processor.ts', description: 'poll logic' },
        ],
      },
      process_event: {
        id: 'process_event',
        label: 'Route by eventType',
        type: 'service',
        description: 'อ่าน eventType แยกไป handlers: InvoiceSendRequested → InvoiceNotifier etc.',
        files: [
          { path: 'src/infrastructure/outbox/outbox.processor.ts', description: 'routeEvent()' },
        ],
      },
      invoice_notifier: {
        id: 'invoice_notifier',
        label: 'InvoiceNotifier',
        type: 'worker',
        description: 'อ่าน payload หาข้อมูล invoice + tenant LINE userId ส่ง LINE message + PDF URL',
        files: [
          { path: 'src/modules/messaging/invoice-notifier.ts', description: 'InvoiceNotifier' },
        ],
      },
      reminder_notifier: {
        id: 'reminder_notifier',
        label: 'ReminderNotifier',
        type: 'worker',
        description: 'ส่ง payment reminder ตาม ReminderConfig ที่ตั้งไว้',
        files: [
          { path: 'src/modules/messaging/reminder-notifier.ts', description: 'ReminderNotifier' },
        ],
      },
      file_send_worker: {
        id: 'file_send_worker',
        label: 'FileSendWorker',
        type: 'worker',
        description: 'ส่งไฟล์แนบ (PDF, images) ผ่าน LINE API',
        files: [
          { path: 'src/modules/messaging/file-send.worker.ts', description: 'FileSendWorker' },
          { path: 'src/modules/messaging/file-send.service.ts', description: 'FileSendService' },
        ],
      },
      line_api: {
        id: 'line_api',
        label: 'LINE Messaging API',
        type: 'external',
        description: 'LINE Official Account API สำหรับส่ง message, push, reply',
        files: [
          { path: 'src/lib/line/client.ts', description: 'LINE API client' },
        ],
      },
      update_status: {
        id: 'update_status',
        label: 'Update OutboxEvent.processedAt',
        type: 'data',
        description: 'เมื่อสำเร็จ → set processedAt = now ถ้า fail → increment retryCount + lastError',
        files: [
          { path: 'src/infrastructure/outbox/outbox.processor.ts', description: 'markProcessed()' },
        ],
      },
      dead_letter: {
        id: 'dead_letter',
        label: 'Dead Letter (after 5 retries)',
        type: 'data',
        description: 'OutboxEvent ที่ fail เกิน 5 ครั้ง → mark as dead-letter รอ admin ตรวจสอบ',
        files: [
          { path: 'src/app/admin/outbox/page.tsx', description: 'หน้า outbox' },
          { path: 'src/app/api/admin/outbox/dead-letter/route.ts', description: 'API route' },
        ],
      },
    },
    edges: [
      { from: 'outbox_worker', to: 'poll_events' },
      { from: 'poll_events', to: 'process_event' },
      { from: 'process_event', to: 'invoice_notifier', label: 'InvoiceSendRequested' },
      { from: 'process_event', to: 'reminder_notifier', label: 'ConfigurableReminder' },
      { from: 'process_event', to: 'file_send_worker', label: 'FileSendRequested' },
      { from: 'invoice_notifier', to: 'line_api' },
      { from: 'reminder_notifier', to: 'line_api' },
      { from: 'file_send_worker', to: 'line_api' },
      { from: 'line_api', to: 'update_status' },
      { from: 'update_status', to: 'poll_events', label: 'loop' },
      { from: 'update_status', to: 'dead_letter', label: '>5 retries' },
    ],
  },

  // ─────────────────────────────────────────────
  // FLOW 8: REMINDERS & OVERDUE
  // ─────────────────────────────────────────────
  {
    id: 'reminders-overdue',
    name: 'Reminders & Overdue Detection',
    nameTh: 'Reminder & ตรวจจับค้างชำระ',
    description: 'Cron jobs รัน day by day: ตรวจค้างชำระ → ใส่ค่าปรับ → ส่ง reminder LINE',
    category: 'messaging',
    entryPoint: 'cron_daily',
    linearLayout: ['cron_daily', 'overdue_flag_job', 'late_fee_job', 'mark_overdue', 'apply_late_fee', 'run_reminder_job', 'create_outbox_events', 'outbox_delivers', 'tenant_receives_line'],
    nodes: {
      cron_daily: {
        id: 'cron_daily',
        label: 'Daily Cron (instrumentation.ts)',
        type: 'trigger',
        description: 'รัน jobs ทุกวันตาม schedule ที่กำหนดใน SCHEDULES array',
        files: [
          { path: 'src/instrumentation.ts', description: 'Job registration + schedules' },
          { path: 'src/modules/jobs/job-runner.ts', description: 'JOB_RUNNERS registry' },
        ],
      },
      overdue_flag_job: {
        id: 'overdue_flag_job',
        label: 'overdue-flag job (1:00am)',
        type: 'worker',
        description: 'runOverdueFlag() — หา invoices ที่ dueDate < now และยังไม่ชำระ อัพเดทเป็น OVERDUE',
        files: [
          { path: 'src/modules/jobs/job-runner.ts', description: 'runOverdueFlag()' },
        ],
      },
      late_fee_job: {
        id: 'late_fee_job',
        label: 'late-fee job (2:00am)',
        type: 'worker',
        description: 'runLateFee() — หา OVERDUE invoices คำนวณ late fee ตาม BillingRule',
        files: [
          { path: 'src/modules/jobs/job-runner.ts', description: 'runLateFee()' },
          { path: 'src/modules/jobs/late-fee.job.ts', description: 'Late fee calculation' },
          { path: 'src/modules/reminders/reminder.service.ts', description: 'calculateLateFee()' },
        ],
      },
      mark_overdue: {
        id: 'mark_overdue',
        label: 'Invoice → OVERDUE',
        type: 'data',
        description: 'อัพเดท Invoice.status → OVERDUE เมื่อ dueDate ผ่านไปแล้ว',
        files: [
          { path: 'prisma/schema.prisma', description: 'Invoice.status enum' },
        ],
      },
      apply_late_fee: {
        id: 'apply_late_fee',
        label: 'Invoice.lateFeeAmount updated',
        type: 'data',
        description: 'อัพเดท lateFeeAmount = min(daysOverdue * penaltyPerDay, maxPenalty)',
        files: [
          { path: 'prisma/schema.prisma', description: 'Invoice.lateFeeAmount field' },
        ],
      },
      run_reminder_job: {
        id: 'run_reminder_job',
        label: 'reminder-notify job (8:00am)',
        type: 'worker',
        description: 'runDaily() อ่าน ReminderConfig หา invoices ที่ match periodDays',
        files: [
          { path: 'src/modules/reminders/reminder.service.ts', description: 'runDaily()' },
        ],
      },
      create_outbox_events: {
        id: 'create_outbox_events',
        label: 'Create OutboxEvent per invoice',
        type: 'service',
        description: 'สร้าง ConfigurableReminder event สำหรับแต่ละ invoice ที่ตรงกับ reminder config',
        files: [
          { path: 'src/modules/reminders/reminder.service.ts', description: 'runDaily() creates events' },
        ],
      },
      outbox_delivers: {
        id: 'outbox_delivers',
        label: 'Outbox Worker → LINE API',
        type: 'worker',
        description: 'Outbox processor เรียก ReminderNotifier ส่ง LINE',
        files: [
          { path: 'src/modules/messaging/reminder-notifier.ts', description: 'ReminderNotifier' },
        ],
      },
      tenant_receives_line: {
        id: 'tenant_receives_line',
        label: 'Tenant receives LINE message',
        type: 'external',
        description: 'ผู้เช่าได้รับ LINE reminder พร้อมจำนวนเงิน วันครบกำหนด วิธีชำระ',
        files: [
          { path: 'src/modules/messaging/lineTemplates.ts', description: 'LINE message templates' },
        ],
      },
    },
    edges: [
      { from: 'cron_daily', to: 'overdue_flag_job', label: '1:00am' },
      { from: 'cron_daily', to: 'late_fee_job', label: '2:00am' },
      { from: 'cron_daily', to: 'run_reminder_job', label: '8:00am' },
      { from: 'overdue_flag_job', to: 'mark_overdue' },
      { from: 'late_fee_job', to: 'apply_late_fee' },
      { from: 'run_reminder_job', to: 'create_outbox_events' },
      { from: 'create_outbox_events', to: 'outbox_delivers' },
      { from: 'outbox_delivers', to: 'tenant_receives_line' },
    ],
  },

  // ─────────────────────────────────────────────
  // FLOW 9: AUTHENTICATION
  // ─────────────────────────────────────────────
  {
    id: 'auth',
    name: 'Authentication & Sessions',
    nameTh: 'การเข้าสู่ระบบ & Sessions',
    description: 'Admin login → session ถูกเก็บใน HTTP-only cookie → ทุก request ต้องมี session',
    category: 'auth',
    entryPoint: 'login_page',
    linearLayout: ['login_page', 'post_credentials', 'validate_credentials', 'create_session', 'http_only_cookie', 'auth_middleware', 'get_current_user', 'protected_route'],
    nodes: {
      login_page: {
        id: 'login_page',
        label: '/admin/login',
        type: 'page',
        description: 'หน้า login ให้กรอก username + password',
        files: [
          { path: 'src/app/login/page.tsx', description: 'Login page' },
          { path: 'src/app/login/LoginForm.tsx', description: 'Login form component' },
        ],
      },
      post_credentials: {
        id: 'post_credentials',
        label: 'POST /api/auth/login',
        type: 'trigger',
        description: 'ส่ง credentials ไปยัง API route',
        files: [
          { path: 'src/app/api/auth/login/route.ts', description: 'Login API route' },
        ],
      },
      validate_credentials: {
        id: 'validate_credentials',
        label: 'Validate credentials',
        type: 'service',
        description: 'ตรวจสอบ username + passwordHash กับ AdminUser table',
        files: [
          { path: 'src/lib/auth/session.ts', description: 'Session management' },
        ],
      },
      create_session: {
        id: 'create_session',
        label: 'Create Server Session',
        type: 'service',
        description: 'สร้าง session token เก็บใน server-side store (หรือใน token)',
        files: [
          { path: 'src/lib/auth/session.ts', description: 'createSession()' },
        ],
      },
      http_only_cookie: {
        id: 'http_only_cookie',
        label: 'Set-Cookie (HTTP-only)',
        type: 'service',
        description: 'ส่ง HTTP-only, Secure cookie กลับไปให้ browser',
        files: [
          { path: 'src/lib/auth/session.ts', description: 'Session cookie config' },
        ],
      },
      auth_middleware: {
        id: 'auth_middleware',
        label: 'Auth Middleware',
        type: 'service',
        description: 'Next.js middleware ตรวจ session cookie ทุก /admin/* request',
        files: [
          { path: 'src/middleware.ts', description: 'Auth middleware' },
        ],
      },
      get_current_user: {
        id: 'get_current_user',
        label: 'GET /api/auth/me',
        type: 'trigger',
        description: 'อ่าน session → ดึงข้อมูล userปัจจุบัน',
        files: [
          { path: 'src/app/api/auth/me/route.ts', description: 'Current user API' },
        ],
      },
      protected_route: {
        id: 'protected_route',
        label: 'Protected Route',
        type: 'page',
        description: 'Admin pages ที่ require login ถ้าไม่มี session → redirect ไป /admin/login',
        files: [
          { path: 'src/app/admin/layout.tsx', description: 'Admin layout with auth check' },
        ],
      },
    },
    edges: [
      { from: 'login_page', to: 'post_credentials' },
      { from: 'post_credentials', to: 'validate_credentials' },
      { from: 'validate_credentials', to: 'create_session' },
      { from: 'create_session', to: 'http_only_cookie' },
      { from: 'http_only_cookie', to: 'auth_middleware' },
      { from: 'auth_middleware', to: 'get_current_user' },
      { from: 'get_current_user', to: 'protected_route' },
    ],
  },

  // ─────────────────────────────────────────────
  // FLOW 11: LINE WEBHOOK — Incoming tenant messages
  // ─────────────────────────────────────────────
  {
    id: 'line-webhook',
    name: 'LINE Webhook — Tenant Incoming Messages',
    nameTh: 'LINE Webhook — รับข้อความจากผู้เช่า',
    description: 'LINE server ส่ง events มาที่ webhook → verify signature → route by type → store message → reply',
    category: 'line',
    entryPoint: 'line_webhook_endpoint',
    linearLayout: ['line_webhook_endpoint', 'verify_signature', 'parse_events', 'handle_follow', 'handle_unfollow', 'handle_postback', 'handle_text', 'handle_image', 'store_message', 'reply_or_push', 'balance_inquiry', 'maintenance_flow'],
    nodes: {
      line_webhook_endpoint: {
        id: 'line_webhook_endpoint',
        label: 'POST /api/line/webhook',
        type: 'trigger',
        description: 'LINE server POSTs พร้อม events[] array + x-line-signature header',
        files: [
          { path: 'src/app/api/line/webhook/route.ts', description: 'Webhook route handler' },
        ],
      },
      verify_signature: {
        id: 'verify_signature',
        label: 'verifyLineSignature()',
        type: 'service',
        description: 'ตรวจสอบ HMAC-SHA256 signature ด้วย LINE_CHANNEL_SECRET ถ้าไม่ตรง → reject',
        files: [
          { path: 'src/lib/line/client.ts', description: 'LINE SDK wrapper' },
        ],
      },
      parse_events: {
        id: 'parse_events',
        label: 'Loop events[]',
        type: 'service',
        description: 'วนลูปแต่ละ event แยก handle ตาม event.type',
        files: [
          { path: 'src/app/api/line/webhook/route.ts', description: 'event dispatcher' },
        ],
      },
      handle_follow: {
        id: 'handle_follow',
        label: 'follow event',
        type: 'service',
        description: 'fetch profile via getLineUserProfile() → upsert LineUser → create Conversation → store [Follow] message',
        files: [
          { path: 'src/lib/line/client.ts', description: 'getLineUserProfile()' },
          { path: 'prisma/schema.prisma', description: 'LineUser, Conversation models' },
        ],
      },
      handle_unfollow: {
        id: 'handle_unfollow',
        label: 'unfollow event',
        type: 'service',
        description: 'อัพเดท Conversation.status → ARCHIVED',
        files: [
          { path: 'src/app/api/line/webhook/route.ts', description: 'handle unfollow' },
        ],
      },
      handle_postback: {
        id: 'handle_postback',
        label: 'postback event',
        type: 'service',
        description: 'route by action: confirm_payment → update invoice PAID, confirm_payment_inquiry → balance inquiry, view_invoice → reply PDF URL, send_receipt → reply receipt PDF',
        files: [
          { path: 'src/app/api/line/webhook/route.ts', description: 'handlePostback()' },
          { path: 'src/modules/invoices/balance-inquiry.ts', description: 'handleBalanceInquiry()' },
        ],
      },
      handle_text: {
        id: 'handle_text',
        label: 'text event',
        type: 'service',
        description: 'ถ้า text === "แจ้งซ่อม" → start maintenance flow ถ้า keyword ต่างๆ → handleBalanceInquiry() ถ้า mid-maintenance → delegate to maintenance handler',
        files: [
          { path: 'src/app/api/line/webhook/route.ts', description: 'text handler with trigger words' },
          { path: 'src/modules/line-maintenance/index.ts', description: 'startMaintenanceRequest()' },
        ],
      },
      handle_image: {
        id: 'handle_image',
        label: 'image event',
        type: 'service',
        description: 'ถ้า user mid-maintenance → handleMaintenanceRequestImage() เก็บรูปเป็น attachment',
        files: [
          { path: 'src/modules/line-maintenance/index.ts', description: 'handleMaintenanceRequestImage()' },
        ],
      },
      store_message: {
        id: 'store_message',
        label: 'Store Message (INCOMING)',
        type: 'data',
        description: 'prisma.message.create direction=INCOMING + increment Conversation.unreadCount',
        files: [
          { path: 'prisma/schema.prisma', description: 'Message model + Conversation.unreadCount' },
        ],
      },
      reply_or_push: {
        id: 'reply_or_push',
        label: 'Reply Token / Push Message',
        type: 'external',
        description: 'ใช้ LINE reply API ส่งตอบกลับทันที หรือ push message สำหรับ async notifications',
        files: [
          { path: 'src/lib/line/client.ts', description: 'LINE SDK reply/push methods' },
        ],
      },
      balance_inquiry: {
        id: 'balance_inquiry',
        label: 'handleBalanceInquiry()',
        type: 'service',
        description: 'หายอดค้างล่าสุดของ user จาก Invoice + Payment สร้าง Flex message ตอบกลับ',
        files: [
          { path: 'src/modules/invoices/balance-inquiry.ts', description: 'Balance inquiry logic' },
          { path: 'src/modules/messaging/lineTemplates.ts', description: 'buildInvoiceFlex() Flex bubble' },
        ],
      },
      maintenance_flow: {
        id: 'maintenance_flow',
        label: 'LINE Maintenance State Machine',
        type: 'service',
        description: 'LineMaintenanceState เก็บสถานะ conversation ว่าอยู่ในขั้นตอนแจ้งซ่อมตรงไหน',
        files: [
          { path: 'src/modules/line-maintenance/index.ts', description: 'Full state machine — start, message, image, finalize, clear' },
        ],
      },
    },
    edges: [
      { from: 'line_webhook_endpoint', to: 'verify_signature' },
      { from: 'verify_signature', to: 'parse_events' },
      { from: 'parse_events', to: 'handle_follow', label: 'follow' },
      { from: 'parse_events', to: 'handle_unfollow', label: 'unfollow' },
      { from: 'parse_events', to: 'handle_postback', label: 'postback' },
      { from: 'parse_events', to: 'handle_text', label: 'text' },
      { from: 'parse_events', to: 'handle_image', label: 'image' },
      { from: 'handle_text', to: 'balance_inquiry', label: 'trigger word' },
      { from: 'handle_text', to: 'maintenance_flow', label: 'แจ้งซ่อม' },
      { from: 'handle_image', to: 'maintenance_flow' },
      { from: 'handle_follow', to: 'store_message' },
      { from: 'handle_unfollow', to: 'store_message' },
      { from: 'handle_text', to: 'store_message' },
      { from: 'handle_image', to: 'store_message' },
      { from: 'balance_inquiry', to: 'reply_or_push' },
      { from: 'maintenance_flow', to: 'reply_or_push' },
    ],
  },

  // ─────────────────────────────────────────────
  // FLOW 12: LINE RICH MENU
  // ─────────────────────────────────────────────
  {
    id: 'line-rich-menu',
    name: 'LINE Rich Menu Setup',
    nameTh: 'ตั้งค่า LINE Rich Menu',
    description: 'Admin ตั้งค่า rich menu สำหรับ LINE OA — menu หลักที่ user เห็นเมื่อเปิดแชท',
    category: 'line',
    entryPoint: 'setup_rich_menu',
    linearLayout: ['setup_rich_menu', 'build_menu_body', 'create_or_update_rich_menu', 'set_default', 'verify_menu', 'delete_menu'],
    nodes: {
      setup_rich_menu: {
        id: 'setup_rich_menu',
        label: 'POST /api/line/rich-menu',
        type: 'trigger',
        description: 'Admin กดปุ่ม setup rich menu → require ADMIN role → check LINE credentials',
        files: [
          { path: 'src/app/api/line/rich-menu/route.ts', description: 'Rich menu API route' },
        ],
      },
      build_menu_body: {
        id: 'build_menu_body',
        label: 'buildBalanceRichMenuBody()',
        type: 'service',
        description: 'สร้าง JSON body สำหรับ LINE API — rich menu 2 ปุ่ม (2500×843px): ซ้าย=ยอดค้าง (text), ขวา=ยืนยันชำระ (postback)',
        files: [
          { path: 'src/app/api/line/rich-menu/route.ts', description: 'buildBalanceRichMenuBody()' },
        ],
      },
      create_or_update_rich_menu: {
        id: 'create_or_update_rich_menu',
        label: 'createOrUpdateRichMenu()',
        type: 'external',
        description: 'getRichMenuList() → delete existing same name → create new menu → LINE API',
        files: [
          { path: 'src/lib/line/client.ts', description: 'LINE SDK — getRichMenuList, createRichMenu, deleteRichMenu' },
        ],
      },
      set_default: {
        id: 'set_default',
        label: 'setDefaultRichMenu()',
        type: 'external',
        description: 'เรียก LINE setDefaultRichMenu API ให้ menu นี้เป็น default สำหรับทุก user',
        files: [
          { path: 'src/lib/line/client.ts', description: 'LINE SDK setDefaultRichMenu' },
        ],
      },
      verify_menu: {
        id: 'verify_menu',
        label: 'Verify in LINE Dev Console',
        type: 'external',
        description: 'ตรวจสอบว่า rich menu แสดงใน LINE Official Account ถูกต้อง',
        files: [
          { path: 'LINE Developers Console', description: 'https://developers.line.me/' },
        ],
      },
      delete_menu: {
        id: 'delete_menu',
        label: 'DELETE /api/line/rich-menu',
        type: 'trigger',
        description: 'Admin ลบ rich menu — DELETE method ลบ menu ที่มีชื่อ "เมนูหลัก - ยอดค้าง"',
        files: [
          { path: 'src/app/api/line/rich-menu/route.ts', description: 'DELETE handler' },
        ],
      },
    },
    edges: [
      { from: 'setup_rich_menu', to: 'build_menu_body' },
      { from: 'build_menu_body', to: 'create_or_update_rich_menu' },
      { from: 'create_or_update_rich_menu', to: 'set_default' },
      { from: 'set_default', to: 'verify_menu' },
      { from: 'setup_rich_menu', to: 'delete_menu', label: 'DELETE' },
    ],
  },

  // ─────────────────────────────────────────────
  // FLOW 13: SETUP WIZARD
  // ─────────────────────────────────────────────
  {
    id: 'setup-wizard',
    name: 'First-Time Setup Wizard',
    nameTh: 'ตั้งค่าระบบครั้งแรก',
    description: 'Admin ครั้งแรกตั้งค่าระบบผ่าน wizard → สร้าง building, rooms, admin user, billing rules',
    category: 'system',
    entryPoint: 'setup_page',
    linearLayout: ['setup_page', 'check_bootstrap', 'create_admin_account', 'create_billing_rules', 'create_bank_accounts', 'create_rooms', 'create_document_templates', 'mark_initialized', 'system_ready'],
    nodes: {
      setup_page: {
        id: 'setup_page',
        label: '/admin/setup',
        type: 'page',
        description: 'หน้า setup wizard แสดงขั้นตอนทีละ step ตามลำดับ',
        files: [
          { path: 'src/app/admin/setup/page.tsx', description: 'Setup wizard page' },
          { path: 'src/app/admin/setup/steps/AdminAccountStep.tsx', description: 'Admin account step' },
          { path: 'src/app/admin/setup/steps/BillingPolicyStep.tsx', description: 'Billing policy step' },
          { path: 'src/app/admin/setup/steps/BuildingRoomsStep.tsx', description: 'Building + rooms step' },
          { path: 'src/app/admin/setup/steps/ReviewStep.tsx', description: 'Review + submit step' },
        ],
      },
      check_bootstrap: {
        id: 'check_bootstrap',
        label: 'GET /api/admin/setup/status',
        type: 'service',
        description: 'ตรวจสอบ config.system.initialized + adminUser.count — ถ้า initialized แล้ว → throw ConflictError',
        files: [
          { path: 'src/app/api/admin/setup/status/route.ts', description: 'Setup status API' },
        ],
      },
      create_admin_account: {
        id: 'create_admin_account',
        label: 'POST /api/admin/setup/complete',
        type: 'trigger',
        description: 'สร้าง AdminUser record พร้อม hashed password — ขั้นตอนแรกใน transaction',
        files: [
          { path: 'src/app/api/admin/setup/complete/route.ts', description: 'Setup complete route' },
          { path: 'src/lib/auth/password.ts', description: 'hashPassword()' },
        ],
      },
      create_billing_rules: {
        id: 'create_billing_rules',
        label: 'billingRule.createMany',
        type: 'data',
        description: 'สร้าง 3 billing rules: STANDARD, NO_WATER, NO_ELECTRIC พร้อม step tiers สำหรับน้ำ/ไฟ',
        files: [
          { path: 'prisma/schema.prisma', description: 'BillingRule model' },
          { path: 'src/app/api/admin/setup/complete/route.ts', description: 'createMany rules' },
        ],
      },
      create_bank_accounts: {
        id: 'create_bank_accounts',
        label: 'bankAccount.upsert (×8)',
        type: 'data',
        description: 'สร้าง 8 bank accounts สำหรับแต่ละชั้น (ACC_F1 → ACC_F8)',
        files: [
          { path: 'prisma/schema.prisma', description: 'BankAccount model' },
        ],
      },
      create_rooms: {
        id: 'create_rooms',
        label: 'room.createMany (239 rooms)',
        type: 'data',
        description: 'สร้าง 239 rooms แบ่ง 8 ชั้น: ชั้น 1 มี 15 ห้อง, ชั้น 2–8 มี 32 ห้อง กำหนด rent ตามขนาด',
        files: [
          { path: 'prisma/schema.prisma', description: 'Room model' },
          { path: 'src/app/api/admin/setup/complete/route.ts', description: '239-room layout creation' },
        ],
      },
      create_document_templates: {
        id: 'create_document_templates',
        label: 'DocumentTemplate.create (×4)',
        type: 'data',
        description: 'สร้าง 4 templates เริ่มต้น: INVOICE, RECEIPT, PAYMENT_NOTICE, CONTRACT พร้อม HTML body และ ACTIVE version',
        files: [
          { path: 'prisma/schema.prisma', description: 'DocumentTemplate + DocumentTemplateVersion models' },
        ],
      },
      mark_initialized: {
        id: 'mark_initialized',
        label: 'config.upsert system.initialized=true',
        type: 'data',
        description: 'บันทึก config key "system.initialized" = true — ป้องกันรันซ้ำ',
        files: [
          { path: 'prisma/schema.prisma', description: 'Config model' },
        ],
      },
      system_ready: {
        id: 'system_ready',
        label: 'System Ready → /admin/dashboard',
        type: 'page',
        description: 'Setup complete → redirect ไป dashboard พร้อมใช้งาน',
        files: [
          { path: 'src/app/admin/dashboard/page.tsx', description: 'Dashboard page' },
        ],
      },
    },
    edges: [
      { from: 'setup_page', to: 'check_bootstrap' },
      { from: 'check_bootstrap', to: 'create_admin_account' },
      { from: 'create_admin_account', to: 'create_billing_rules' },
      { from: 'create_billing_rules', to: 'create_bank_accounts' },
      { from: 'create_bank_accounts', to: 'create_rooms' },
      { from: 'create_rooms', to: 'create_document_templates' },
      { from: 'create_document_templates', to: 'mark_initialized' },
      { from: 'mark_initialized', to: 'system_ready' },
    ],
  },

  // ─────────────────────────────────────────────
  // FLOW 14: BROADCAST MESSAGING
  // ─────────────────────────────────────────────
  {
    id: 'broadcast',
    name: 'Broadcast Messaging',
    nameTh: 'ส่งข้อความถึงทุกห้อง',
    description: 'Admin ส่งข้อความ LINE ถึงผู้เช่าทุกห้องพร้อมกัน — รองรับ filter ตามชั้นหรือห้องเฉพาะ',
    category: 'messaging',
    entryPoint: 'create_broadcast',
    linearLayout: ['create_broadcast', 'validate_idempotency', 'query_target_rooms', 'filter_line_users', 'create_broadcast_record', 'push_messages', 'handle_rate_limit', 'update_final_status', 'log_audit'],
    nodes: {
      create_broadcast: {
        id: 'create_broadcast',
        label: 'POST /api/broadcast',
        type: 'trigger',
        description: 'Admin ส่งข้อความ + เลือก target: ALL / FLOORS / ROOMS',
        files: [
          { path: 'src/app/api/broadcast/route.ts', description: 'Broadcast API route' },
          { path: 'src/app/admin/broadcast/page.tsx', description: 'หน้า broadcast UI' },
        ],
      },
      validate_idempotency: {
        id: 'validate_idempotency',
        label: 'Check Idempotency-Key',
        type: 'service',
        description: 'ถ้ามี Idempotency-Key header → หา broadcast ที่มี key เดียวกัน → return existing (ไม่ส่งซ้ำ)',
        files: [
          { path: 'src/app/api/broadcast/route.ts', description: 'Idempotency check logic' },
        ],
      },
      query_target_rooms: {
        id: 'query_target_rooms',
        label: 'Query OCCUPIED rooms',
        type: 'data',
        description: 'กรองห้องตาม target: ทั้งหมด, บางชั้น, บางห้อง — JOIN หา roomTenants',
        files: [
          { path: 'prisma/schema.prisma', description: 'Room + RoomTenant models' },
        ],
      },
      filter_line_users: {
        id: 'filter_line_users',
        label: 'Filter LINE-linked tenants',
        type: 'service',
        description: 'เอาเฉพาะ tenants ที่มี lineUserId — tenants ที่ยังไม่ได้ link LINE จะไม่ได้รับข้อความ',
        files: [
          { path: 'prisma/schema.prisma', description: 'Tenant.lineUserId field' },
        ],
      },
      create_broadcast_record: {
        id: 'create_broadcast_record',
        label: 'broadcast.create (PENDING)',
        type: 'data',
        description: 'สร้าง Broadcast record พร้อม totalCount = จำนวน recipients',
        files: [
          { path: 'prisma/schema.prisma', description: 'Broadcast model' },
        ],
      },
      push_messages: {
        id: 'push_messages',
        label: 'lineClient.pushMessage() (loop)',
        type: 'external',
        description: 'วนลูปทุก lineUserId → pushMessage() ทีละคน พร้อม delay 50ms ระหว่างข้อความ',
        files: [
          { path: 'src/lib/line/client.ts', description: 'LINE SDK pushMessage with rate limit handling' },
        ],
      },
      handle_rate_limit: {
        id: 'handle_rate_limit',
        label: 'HTTP 429 → retry-after',
        type: 'service',
        description: 'ถ้า LINE ตอบ 429 → อ่าน retry-after header → รอ → retry อีกครั้งเดียว',
        files: [
          { path: 'src/lib/line/client.ts', description: 'Rate limit retry logic in pushMessage' },
        ],
      },
      update_final_status: {
        id: 'update_final_status',
        label: 'Broadcast → COMPLETED/PARTIAL/FAILED',
        type: 'data',
        description: 'อัพเดท status + sentCount + failedCount หลังส่งเสร็จ',
        files: [
          { path: 'prisma/schema.prisma', description: 'Broadcast.status enum' },
        ],
      },
      log_audit: {
        id: 'log_audit',
        label: 'logAudit BROADCAST_CREATED',
        type: 'data',
        description: 'บันทึก audit log ทุกครั้งที่สร้าง broadcast',
        files: [
          { path: 'src/modules/audit/audit.service.ts', description: 'logAudit()' },
        ],
      },
    },
    edges: [
      { from: 'create_broadcast', to: 'validate_idempotency' },
      { from: 'validate_idempotency', to: 'query_target_rooms' },
      { from: 'query_target_rooms', to: 'filter_line_users' },
      { from: 'filter_line_users', to: 'create_broadcast_record' },
      { from: 'create_broadcast_record', to: 'push_messages' },
      { from: 'push_messages', to: 'handle_rate_limit', label: '429' },
      { from: 'handle_rate_limit', to: 'push_messages', label: 'retry' },
      { from: 'push_messages', to: 'update_final_status' },
      { from: 'update_final_status', to: 'log_audit' },
    ],
  },

  // ─────────────────────────────────────────────
  // FLOW 15: LINE CHAT REPLY (Admin → Tenant)
  // ─────────────────────────────────────────────
  {
    id: 'line-chat-reply',
    name: 'LINE Chat — Admin Reply to Tenant',
    nameTh: 'แชท LINE — Admin ตอบกลับผู้เช่า',
    description: 'Admin ดู conversation → พิมพ์ตอบ → ส่ง LINE message → บันทึก audit',
    category: 'line',
    entryPoint: 'open_conversation',
    linearLayout: ['open_conversation', 'fetch_messages', 'compose_reply', 'send_line_message', 'store_outgoing_message', 'update_conversation', 'log_audit', 'tenant_receives_reply'],
    nodes: {
      open_conversation: {
        id: 'open_conversation',
        label: '/admin/chat/[conversationId]',
        type: 'page',
        description: 'Admin เปิด conversation ดูข้อความของผู้เช่าคนนั้น',
        files: [
          { path: 'src/app/admin/chat/[conversationId]/page.tsx', description: 'Chat detail page' },
          { path: 'src/app/admin/chat/page.tsx', description: 'Chat list page' },
        ],
      },
      fetch_messages: {
        id: 'fetch_messages',
        label: 'GET /api/conversations/[id]/messages',
        type: 'trigger',
        description: 'ดึง messages ทั้งหมดของ conversation — cursor-based pagination, limit 200',
        files: [
          { path: 'src/app/api/conversations/[id]/messages/route.ts', description: 'GET handler' },
        ],
      },
      compose_reply: {
        id: 'compose_reply',
        label: 'Admin types message',
        type: 'page',
        description: 'Admin พิมพ์ข้อความตอบกลับใน chat composer',
        files: [
          { path: 'src/components/chat/ChatComposer.tsx', description: 'Chat composer component' },
        ],
      },
      send_line_message: {
        id: 'send_line_message',
        label: 'POST /api/conversations/[id]/messages',
        type: 'trigger',
        description: 'เรียก lineClient.pushMessage() ไปยัง lineUserId ของ tenant',
        files: [
          { path: 'src/app/api/conversations/[id]/messages/route.ts', description: 'POST handler — sendLineMessage()' },
          { path: 'src/lib/index.ts', description: 're-exports sendLineMessage from line client' },
        ],
      },
      store_outgoing_message: {
        id: 'store_outgoing_message',
        label: 'message.create (OUTGOING)',
        type: 'data',
        description: 'บันทึกข้อความที่ส่งลง DB พร้อม direction=OUTGOING metadata.status=SENT ถ้า fail → status=FAILED',
        files: [
          { path: 'prisma/schema.prisma', description: 'Message model + MessageDirection enum' },
        ],
      },
      update_conversation: {
        id: 'update_conversation',
        label: 'conversation.lastMessageAt updated',
        type: 'data',
        description: 'อัพเดท lastMessageAt + unreadCount ของ conversation',
        files: [
          { path: 'prisma/schema.prisma', description: 'Conversation.lastMessageAt field' },
        ],
      },
      log_audit: {
        id: 'log_audit',
        label: 'logAudit CHAT_MESSAGE_SENT',
        type: 'data',
        description: 'บันทึก audit log ทุกข้อความที่ส่ง',
        files: [
          { path: 'src/modules/audit/audit.service.ts', description: 'logAudit() — CHAT_MESSAGE_SENT action' },
        ],
      },
      tenant_receives_reply: {
        id: 'tenant_receives_reply',
        label: 'Tenant receives LINE push',
        type: 'external',
        description: 'ผู้เช่าได้รับข้อความใน LINE chat ทันที',
        files: [
          { path: 'src/lib/line/client.ts', description: 'LINE pushMessage API' },
        ],
      },
    },
    edges: [
      { from: 'open_conversation', to: 'fetch_messages' },
      { from: 'fetch_messages', to: 'compose_reply' },
      { from: 'compose_reply', to: 'send_line_message' },
      { from: 'send_line_message', to: 'store_outgoing_message' },
      { from: 'store_outgoing_message', to: 'update_conversation' },
      { from: 'update_conversation', to: 'log_audit' },
      { from: 'send_line_message', to: 'tenant_receives_reply' },
    ],
  },

  // ─────────────────────────────────────────────
  // FLOW 16: SSE NOTIFICATIONS
  // ─────────────────────────────────────────────
  {
    id: 'sse-notifications',
    name: 'Real-Time SSE Notifications',
    nameTh: 'Notifications แบบ Real-time (SSE)',
    description: 'Browser เชื่อมต่อ SSE stream → server broadcast notification events เมื่อมี events เกิดขึ้น',
    category: 'system',
    entryPoint: 'connect_sse',
    linearLayout: ['connect_sse', 'add_sse_client', 'send_initial_event', 'trigger_notification', 'broadcast_to_clients', 'client_receives_event', 'disconnect_cleanup', 'client_reconnects'],
    nodes: {
      connect_sse: {
        id: 'connect_sse',
        label: 'GET /api/notifications/stream',
        type: 'trigger',
        description: 'Browser สร้าง EventSource("/api/notifications/stream", {withCredentials:true}) — ต้อง login ก่อน',
        files: [
          { path: 'src/hooks/useNotificationStream.ts', description: 'useNotificationStream hook' },
        ],
      },
      add_sse_client: {
        id: 'add_sse_client',
        label: 'addSseClient(controller)',
        type: 'service',
        description: 'เพิ่ม ReadableStreamDefaultController เข้า in-memory Set ของ clients',
        files: [
          { path: 'src/lib/sse/broadcaster.ts', description: 'In-memory SSE client registry' },
          { path: 'src/app/api/notifications/stream/route.ts', description: 'SSE route — addSseClient on connect' },
        ],
      },
      send_initial_event: {
        id: 'send_initial_event',
        label: 'event: connected → data: {}',
        type: 'service',
        description: 'ส่ง event เริ่มต้นทันทีหลัง connect เพื่อยืนยันว่า connection ทำงาน',
        files: [
          { path: 'src/app/api/notifications/stream/route.ts', description: 'Initial connected event' },
        ],
      },
      trigger_notification: {
        id: 'trigger_notification',
        label: 'broadcastNotification(payload)',
        type: 'service',
        description: 'เรียกจากที่ไหนก็ได้ใน code — เมื่อมี event ที่ต้องการแจ้ง admin (เช่น new payment, new message)',
        files: [
          { path: 'src/lib/sse/broadcaster.ts', description: 'broadcastNotification() function' },
        ],
      },
      broadcast_to_clients: {
        id: 'broadcast_to_clients',
        label: 'Send event: notification',
        type: 'service',
        description: 'วนลูปทุก client controller → ส่ง event: notification\ndata: <json_payload>',
        files: [
          { path: 'src/lib/sse/broadcaster.ts', description: 'broadcast loop — removes failed clients' },
        ],
      },
      client_receives_event: {
        id: 'client_receives_event',
        label: 'EventSource on notification',
        type: 'page',
        description: 'React hook รับ event → setNotification() → UI แสดง toast/notification badge',
        files: [
          { path: 'src/hooks/useNotificationStream.ts', description: 'on notification handler' },
          { path: 'src/components/providers/ToastProvider.tsx', description: 'Toast notification display' },
        ],
      },
      disconnect_cleanup: {
        id: 'disconnect_cleanup',
        label: 'req.signal.abort → removeSseClient()',
        type: 'service',
        description: 'เมื่อ browser ปิด tab หรือ disconnect → ลบ controller ออกจาก Set',
        files: [
          { path: 'src/app/api/notifications/stream/route.ts', description: 'AbortSignal cleanup' },
        ],
      },
      client_reconnects: {
        id: 'client_reconnects',
        label: 'Reconnect on network restore',
        type: 'trigger',
        description: 'ถ้า connection หลุด → EventSource จะ auto-reconnect หลัง ~3 วินาที',
        files: [
          { path: 'src/hooks/useNotificationStream.ts', description: 'EventSource auto-reconnect behavior' },
        ],
      },
    },
    edges: [
      { from: 'connect_sse', to: 'add_sse_client' },
      { from: 'add_sse_client', to: 'send_initial_event' },
      { from: 'send_initial_event', to: 'trigger_notification', label: 'waiting' },
      { from: 'trigger_notification', to: 'broadcast_to_clients' },
      { from: 'broadcast_to_clients', to: 'client_receives_event' },
      { from: 'client_receives_event', to: 'disconnect_cleanup', label: 'tab close' },
      { from: 'disconnect_cleanup', to: 'client_reconnects', label: 'reconnect' },
    ],
  },

  // ─────────────────────────────────────────────
  // FLOW 17: CONTRACT RENEWAL
  // ─────────────────────────────────────────────
  {
    id: 'contract-renewal',
    name: 'Contract Renewal',
    nameTh: 'ต่อสัญญาเช่า',
    description: 'Admin ต่อสัญญาเช่าห้องเดิม → สร้างสัญญาใหม่ต่อจากสัญญาเดิม → expire สัญญาเดิม',
    category: 'contract',
    entryPoint: 'select_contract',
    linearLayout: ['select_contract', 'check_status', 'validate_new_dates', 'create_new_contract', 'expire_old_contract', 'create_outbox_event', 'publish_contract_renewed', 'return_new_contract'],
    nodes: {
      select_contract: {
        id: 'select_contract',
        label: 'POST /api/contracts/[id]/renew',
        type: 'trigger',
        description: 'Admin เลือก contract ที่จะต่อ + กำหนดวันสิ้นสุดใหม่ + ค่าเช่าใหม่ (optional)',
        files: [
          { path: 'src/app/api/contracts/[id]/renew/route.ts', description: 'Renew route' },
          { path: 'src/app/admin/contracts/page.tsx', description: 'หน้า contracts list' },
        ],
      },
      check_status: {
        id: 'check_status',
        label: 'Validate status = ACTIVE',
        type: 'service',
        description: 'ตรวจสอบว่า contract ปัจจุบัน status = ACTIVE — ถ้า EXPIRED/TERMINATED ไม่สามารถ renew ได้',
        files: [
          { path: 'src/modules/contracts/contract.service.ts', description: 'ContractService.renewContract()' },
        ],
      },
      validate_new_dates: {
        id: 'validate_new_dates',
        label: 'newEndDate > oldEndDate',
        type: 'service',
        description: 'ตรวจสอบว่า newEndDate มากกว่า endDate เดิม — ถ้าไม่ใช่ → throw validation error',
        files: [
          { path: 'src/modules/contracts/contract.service.ts', description: 'Date validation in renewContract()' },
        ],
      },
      create_new_contract: {
        id: 'create_new_contract',
        label: 'New Contract (ACTIVE)',
        type: 'data',
        description: 'สร้าง contract ใหม่: startDate = oldEndDate + 1 day, endDate = newEndDate, monthlyRent = input.newRentAmount ?? existing',
        files: [
          { path: 'prisma/schema.prisma', description: 'Contract model + ContractStatus enum' },
          { path: 'src/modules/contracts/contract.service.ts', description: 'renewContract() creates new record in transaction' },
        ],
      },
      expire_old_contract: {
        id: 'expire_old_contract',
        label: 'Old Contract → EXPIRED',
        type: 'data',
        description: 'อัพเดท contract เดิม status → EXPIRED ภายใน transaction เดียวกัน',
        files: [
          { path: 'prisma/schema.prisma', description: 'Contract.status: EXPIRED' },
        ],
      },
      create_outbox_event: {
        id: 'create_outbox_event',
        label: 'OutboxEvent: CONTRACT_RENEWED',
        type: 'data',
        description: 'สร้าง OutboxEvent สำหรับ contract renewal เพื่อให้ downstream systems ติดตามได้',
        files: [
          { path: 'src/modules/contracts/contract.service.ts', description: 'outboxEvent.create in transaction' },
        ],
      },
      publish_contract_renewed: {
        id: 'publish_contract_renewed',
        label: 'EventBus: CONTRACT_RENEWED',
        type: 'worker',
        description: 'Publish CONTRACT_RENEWED event ไปยัง EventBus เพื่อให้ listeners อื่นๆ ตอบสนอง (ถ้ามี)',
        files: [
          { path: 'src/infrastructure/event-bus.ts', description: 'EventBus publish' },
        ],
      },
      return_new_contract: {
        id: 'return_new_contract',
        label: 'Return formatted response',
        type: 'service',
        description: 'ส่ง response กลับพร้อม new contract data + old contract info',
        files: [
          { path: 'src/app/api/contracts/[id]/renew/route.ts', description: 'Route returns formatted contract DTO' },
        ],
      },
    },
    edges: [
      { from: 'select_contract', to: 'check_status' },
      { from: 'check_status', to: 'validate_new_dates' },
      { from: 'validate_new_dates', to: 'create_new_contract' },
      { from: 'create_new_contract', to: 'expire_old_contract' },
      { from: 'expire_old_contract', to: 'create_outbox_event' },
      { from: 'create_outbox_event', to: 'publish_contract_renewed' },
      { from: 'publish_contract_renewed', to: 'return_new_contract' },
    ],
  },

  // ─────────────────────────────────────────────
  // FLOW 18: DEEP HEALTH CHECK
  // ─────────────────────────────────────────────
  {
    id: 'health-check',
    name: 'System Health Monitoring',
    nameTh: 'System Health Monitoring',
    description: 'GET /api/health/deep ตรวจสอบทุก subsystems: DB, Redis, Outbox queue, Worker heartbeat, Backup status',
    category: 'health',
    entryPoint: 'health_check_request',
    linearLayout: ['health_check_request', 'check_database', 'check_redis', 'check_outbox_queue', 'check_worker_heartbeat', 'check_backup', 'compute_overall_status', 'return_response'],
    nodes: {
      health_check_request: {
        id: 'health_check_request',
        label: 'GET /api/health/deep',
        type: 'trigger',
        description: 'Admin หรือ monitoring system เรียก endpoint นี้เพื่อตรวจสอบสถานะระบบ',
        files: [
          { path: 'src/app/api/health/deep/route.ts', description: 'Deep health API route' },
          { path: 'src/app/admin/system-health/page.tsx', description: 'หน้า system health UI' },
        ],
      },
      check_database: {
        id: 'check_database',
        label: 'SELECT 1 — measure latency',
        type: 'data',
        description: 'prisma.$queryRaw`SELECT 1` — measure DB response latency. ถ้า fail → overall status = error',
        files: [
          { path: 'prisma/schema.prisma', description: 'Database connection via Prisma' },
          { path: 'src/app/api/health/deep/route.ts', description: 'DB health check with latency measurement' },
        ],
      },
      check_redis: {
        id: 'check_redis',
        label: 'redisPing() (optional)',
        type: 'external',
        description: 'ถ้ามี REDIS_URL → redisPing() → pong กลับ ถ้าไม่มี → return { status: "not_configured" } — ไม่ทำให้ overall = error',
        files: [
          { path: 'src/infrastructure/redis.ts', description: 'Redis client + ping' },
        ],
      },
      check_outbox_queue: {
        id: 'check_outbox_queue',
        label: 'OutboxEvent.count(processedAt=null)',
        type: 'data',
        description: 'นับ events ที่ยังไม่ได้ process + นับ events ที่ retryCount >= 3 (stuck) — ถ้า stuck > 0 → warning',
        files: [
          { path: 'prisma/schema.prisma', description: 'OutboxEvent model' },
          { path: 'src/app/api/health/deep/route.ts', description: 'Outbox queue stats in health check' },
        ],
      },
      check_worker_heartbeat: {
        id: 'check_worker_heartbeat',
        label: 'getWorkerHeartbeat()',
        type: 'service',
        description: 'อ่าน heartbeat จาก Redis หรือ in-memory — alive ถ้า last beat < 20 วินาที กลับ heartbeatSource = "redis" หรือ "in_memory"',
        files: [
          { path: 'src/infrastructure/outbox/outbox.processor.ts', description: 'OutboxProcessor heartbeat management' },
        ],
      },
      check_backup: {
        id: 'check_backup',
        label: 'getBackupStatus()',
        type: 'service',
        description: 'ตรวจสอบสถานะ backup — currently returns safe defaults (ยังไม่ implement จริง)',
        files: [
          { path: 'src/app/api/health/deep/route.ts', description: 'getBackupStatus() call — safe defaults' },
        ],
      },
      compute_overall_status: {
        id: 'compute_overall_status',
        label: 'Compute overall status',
        type: 'service',
        description: 'ถ้า DB down → "error", ถ้า DB up 但 worker not alive → "degraded", ถ้าทุกอย่าง ok → "ok". Redis unavailability ไม่ทำให้ error',
        files: [
          { path: 'src/app/api/health/deep/route.ts', description: 'Overall status computation logic' },
        ],
      },
      return_response: {
        id: 'return_response',
        label: 'Return health JSON',
        type: 'service',
        description: 'ส่ง JSON response: { status, subsystems: { db, redis, outbox, worker, backup }, timestamp }',
        files: [
          { path: 'src/app/api/health/deep/route.ts', description: 'Health response DTO' },
        ],
      },
    },
    edges: [
      { from: 'health_check_request', to: 'check_database' },
      { from: 'health_check_request', to: 'check_redis' },
      { from: 'health_check_request', to: 'check_outbox_queue' },
      { from: 'health_check_request', to: 'check_worker_heartbeat' },
      { from: 'health_check_request', to: 'check_backup' },
      { from: 'check_database', to: 'compute_overall_status' },
      { from: 'check_redis', to: 'compute_overall_status' },
      { from: 'check_outbox_queue', to: 'compute_overall_status' },
      { from: 'check_worker_heartbeat', to: 'compute_overall_status' },
      { from: 'check_backup', to: 'compute_overall_status' },
      { from: 'compute_overall_status', to: 'return_response' },
    ],
  },
];

// ─────────────────────────────────────────────
// LOOKUP HELPERS
// ─────────────────────────────────────────────

export function getFlowById(id: string): FlowDefinition | undefined {
  return systemFlows.find(f => f.id === id);
}

export function getFlowsByCategory(category: FlowCategory): FlowDefinition[] {
  return systemFlows.filter(f => f.category === category);
}

export const CATEGORY_LABELS: Record<FlowCategory, { name: string; nameTh: string }> = {
  billing: { name: 'Billing', nameTh: 'บิล' },
  payment: { name: 'Payment', nameTh: 'ชำระเงิน' },
  tenant: { name: 'Tenant', nameTh: 'ผู้เช่า' },
  maintenance: { name: 'Maintenance', nameTh: 'แจ้งซ่อม' },
  document: { name: 'Document', nameTh: 'เอกสาร' },
  messaging: { name: 'Messaging', nameTh: 'LINE & Messaging' },
  system: { name: 'System', nameTh: 'ระบบ' },
  auth: { name: 'Auth', nameTh: 'เข้าสู่ระบบ' },
  line: { name: 'LINE', nameTh: 'LINE Integration' },
  contract: { name: 'Contract', nameTh: 'สัญญาเช่า' },
  health: { name: 'Health', nameTh: 'Health Monitoring' },
};

export const NODE_TYPE_STYLES: Record<NodeType, { bg: string; border: string; text: string; label: string }> = {
  trigger: { bg: '#fef3c7', border: '#f59e0b', text: '#92400e', label: 'Trigger' },
  service: { bg: '#dbeafe', border: '#3b82f6', text: '#1e40af', label: 'Service' },
  data: { bg: '#dcfce7', border: '#22c55e', text: '#166534', label: 'Data' },
  external: { bg: '#fce7f3', border: '#ec4899', text: '#9d174d', label: 'External' },
  worker: { bg: '#e0e7ff', border: '#6366f1', text: '#3730a3', label: 'Worker' },
  page: { bg: '#f3e8ff', border: '#a855f7', text: '#6b21a8', label: 'Page' },
};
