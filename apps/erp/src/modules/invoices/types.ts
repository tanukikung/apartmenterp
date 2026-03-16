import { z } from 'zod';

// ============================================================================
// Invoice Types
// ============================================================================

export const invoiceStatusSchema = z.enum(['DRAFT', 'GENERATED', 'SENT', 'VIEWED', 'PAID', 'OVERDUE']);
export type InvoiceStatus = z.infer<typeof invoiceStatusSchema>;

// ============================================================================
// Generate Invoice DTO
// ============================================================================

export const generateInvoiceSchema = z.object({
  billingRecordId: z.string().uuid('Invalid billing record ID'),
});

export type GenerateInvoiceInput = z.infer<typeof generateInvoiceSchema>;

// ============================================================================
// Send Invoice DTO
// ============================================================================

export const sendInvoiceSchema = z.object({
  sendToLine: z.boolean().default(true),
  channel: z.enum(['LINE', 'PDF', 'PRINT']).default('LINE'),
  /** Optional ID of a MessageTemplate to use for the LINE notification body. */
  templateId: z.string().optional(),
});

export type SendInvoiceInput = z.infer<typeof sendInvoiceSchema>;

// ============================================================================
// Pay Invoice DTO
// ============================================================================

export const payInvoiceSchema = z.object({
  paymentId: z.string().uuid('Invalid payment ID').optional(),
  paidAt: z.string().date().optional(),
});

export type PayInvoiceInput = z.infer<typeof payInvoiceSchema>;

// ============================================================================
// List Invoices Query
// ============================================================================

export const listInvoicesQuerySchema = z.object({
  roomId: z.string().uuid().optional(),
  billingCycleId: z.string().optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  status: invoiceStatusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(['dueDate', 'totalAmount', 'createdAt', 'status']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type ListInvoicesQuery = z.infer<typeof listInvoicesQuerySchema>;

// ============================================================================
// Response DTOs
// ============================================================================

export interface InvoiceResponse {
  id: string;
  invoiceNumber: string;
  roomId: string;
  billingRecordId: string;
  year: number;
  month: number;
  version: number;
  status: InvoiceStatus;
  subtotal: number;
  totalAmount: number;
  dueDate: Date;
  issuedAt: Date | null;
  sentAt: Date | null;
  sentBy: string | null;
  viewedAt: Date | null;
  paidAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  room?: {
    id: string;
    roomNumber: string;
    floorId: string;
  };
  tenant?: {
    id: string;
    fullName: string;
    phone: string;
  } | null;
  tenantName?: string | null;
  lineUserId?: string | null;
  deliveries?: InvoiceDeliveryResponse[];
  items?: InvoiceItemSnapshot[];
  versions?: InvoiceVersionResponse[];
}

export interface InvoiceDeliveryResponse {
  id: string;
  channel: string;
  status: string;
  recipientRef: string | null;
  sentAt: Date | null;
  viewedAt: Date | null;
  errorMessage: string | null;
  createdAt: Date;
}

export interface InvoiceItemSnapshot {
  typeCode: string;
  typeName: string;
  description: string | null;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface InvoiceVersionResponse {
  id: string;
  invoiceId: string;
  version: number;
  subtotal: number;
  totalAmount: number;
  changeNote: string | null;
  createdAt: Date;
}

export interface InvoiceChangeResponse {
  id: string;
  invoiceId: string;
  version: number;
  changeType: string;
  fieldName: string;
  oldValue: string;
  newValue: string;
  reason: string | null;
  createdAt: Date;
}

export interface InvoicesListResponse {
  data: InvoiceResponse[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface InvoicePreviewResponse {
  invoiceId: string;
  version: number;
  year: number;
  month: number;
  buildingName: string;
  roomNumber: string;
  tenantName: string | null;
  items: InvoiceItemSnapshot[];
  subtotal: number;
  totalAmount: number;
  dueDate: string;
}

// ============================================================================
// Event Payloads
// ============================================================================

export interface InvoiceGeneratedPayload {
  invoiceId: string;
  roomId: string;
  roomNumber: string;
  billingRecordId: string;
  year: number;
  month: number;
  version: number;
  totalAmount: number;
  dueDate: string;
  generatedBy?: string;
}

export interface InvoiceVersionCreatedPayload {
  invoiceVersionId: string;
  invoiceId: string;
  previousVersion: number | null;
  version: number;
  totalAmount: number;
}

export interface InvoiceSentPayload {
  invoiceId: string;
  tenantId: string;
  lineUserId: string | null;
  sentBy: string;
  lineMessageId?: string;
  sentAt: string;
}

export interface InvoiceViewedPayload {
  invoiceId: string;
  tenantId: string;
  viewedAt: string;
}

export interface InvoicePaidPayload {
  invoiceId: string;
  paymentId: string | null;
  paidAt: string;
  amount: number;
}

export interface InvoiceOverduePayload {
  invoiceId: string;
  roomId: string;
  roomNumber: string;
  daysOverdue: number;
  totalAmount: number;
}
