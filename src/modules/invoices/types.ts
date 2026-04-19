import { z } from 'zod';

// ============================================================================
// Invoice Types
// ============================================================================

export const invoiceStatusSchema = z.enum(['GENERATED', 'SENT', 'VIEWED', 'PAID', 'OVERDUE', 'CANCELLED']);
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
  paidAt: z
    .string()
    .optional()
    .refine((value) => !value || !Number.isNaN(new Date(value).getTime()), 'Invalid paidAt date'),
});

export type PayInvoiceInput = z.infer<typeof payInvoiceSchema>;

// ============================================================================
// List Invoices Query
// ============================================================================

export const listInvoicesQuerySchema = z.object({
  q: z.string().trim().min(1).max(100).optional(),
  roomNo: z.string().optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  status: invoiceStatusSchema.optional(),
  billingCycleId: z.string().optional(),
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
  /** New schema: roomNo is the string PK of Room */
  roomNo: string;
  /** New schema: FK to RoomBilling */
  roomBillingId: string;
  /** FK to BillingPeriod — used for navigation to billing cycle */
  billingPeriodId: string;
  year: number;
  month: number;
  status: InvoiceStatus;
  totalAmount: number;
  dueDate: Date;
  issuedAt: Date | null;
  sentAt: Date | null;
  paidAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  room?: {
    roomNo: string;
    roomNumber: string;
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

export interface InvoicesListResponse {
  data: InvoiceResponse[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface MeterReadingDetail {
  /** Meter reading before (null = flat-rate mode) */
  prev: number | null;
  /** Meter reading after */
  curr: number | null;
  /** Units consumed (curr - prev, or manual) */
  units: number;
  /** Charge per unit (บาท/หน่วย) */
  ratePerUnit: number;
  /** Usage charge (units × rate) */
  usageCharge: number;
  /** Fixed service fee */
  serviceFee: number;
  /** Grand total for this utility */
  total: number;
}

export interface InvoicePreviewResponse {
  invoiceId: string;
  /** Formatted invoice number e.g. INV-202501-101 */
  invoiceNumber?: string;
  year: number;
  month: number;
  roomNo: string;
  floorNo?: number | null;
  tenantName: string | null;
  tenantPhone?: string | null;
  items: InvoiceItemSnapshot[];
  totalAmount: number;
  dueDate: string;
  /** ISO string of when the invoice was issued */
  issuedAt?: string | null;
  /** Invoice status for watermark */
  status?: string;
  /** Meter reading details for water and electric */
  meterReadings?: {
    water?: MeterReadingDetail;
    electric?: MeterReadingDetail;
  };
}

// ============================================================================
// Event Payloads
// ============================================================================

export interface InvoiceGeneratedPayload {
  invoiceId: string;
  roomNo: string;
  roomBillingId: string;
  year: number;
  month: number;
  totalAmount: number;
  dueDate: string;
  generatedBy?: string;
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
