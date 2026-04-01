import { z } from 'zod';

// ============================================================================
// Billing Types — aligned with BillingPeriod/RoomBilling schema
// ============================================================================

// RoomBillingStatus mirrors Prisma enum
export const billingStatusSchema = z.enum(['DRAFT', 'LOCKED', 'INVOICED']);
export type BillingStatus = z.infer<typeof billingStatusSchema>;

// ============================================================================
// Create Billing Record DTO
// ============================================================================

export const createBillingRecordSchema = z.object({
  roomNo: z.string().min(1, 'Room number is required'),
  year: z.number()
    .int()
    .min(2000, 'Year must be at least 2000')
    .max(2100, 'Year must be at most 2100'),
  month: z.number()
    .int()
    .min(1, 'Month must be between 1 and 12')
    .max(12, 'Month must be between 1 and 12'),
});

export type CreateBillingRecordInput = z.infer<typeof createBillingRecordSchema>;

// ============================================================================
// Billing Item Type Codes (for Excel import compatibility)
// ============================================================================

export const billingItemTypeCodes = [
  'RENT',
  'WATER',
  'ELECTRIC',
  'PARKING',
  'INTERNET',
  'FACILITY',
  'FEE_LATE',
  'OTHER',
] as const;

export const billingItemTypeSchema = z.enum(billingItemTypeCodes);
export type BillingItemTypeCode = z.infer<typeof billingItemTypeSchema>;

// ============================================================================
// Lock Billing DTO
// ============================================================================

export const lockBillingSchema = z.object({
  force: z.boolean().default(false),
});

export type LockBillingInput = z.infer<typeof lockBillingSchema>;

// ============================================================================
// List Billing Records Query
// ============================================================================

export const listBillingRecordsQuerySchema = z.object({
  roomNo: z.string().optional(),
  billingPeriodId: z.string().optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  status: billingStatusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(['year', 'month', 'totalAmount', 'createdAt']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type ListBillingRecordsQuery = z.infer<typeof listBillingRecordsQuerySchema>;

// ============================================================================
// Response DTOs
// ============================================================================

export interface BillingItemResponse {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

export interface BillingRecordResponse {
  id: string;
  /** New PK-based identifier for the room */
  roomNo: string;
  /** Alias for UI compatibility */
  roomNumber: string;
  billingPeriodId: string;
  year: number;
  month: number;
  status: BillingStatus;
  subtotal: number;
  totalAmount: number;
  lockedAt: Date | null;
  lockedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  /** Tenant name derived from room occupants */
  tenantName: string | null;
  /** Room relation for UI */
  room?: { roomNumber: string };
  /** Synthesized billing line items */
  items: BillingItemResponse[];
  contract?: {
    id: string;
    rentAmount: number;
  };
}

export interface BillingItemTypeResponse {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isRecurring: boolean;
  defaultAmount: number | null;
}

export interface BillingRecordsListResponse {
  data: BillingRecordResponse[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ============================================================================
// Event Payloads
// ============================================================================

export const billingRecordCreatedPayloadSchema = z.object({
  billingRecordId: z.string(),
  roomNo: z.string(),
  year: z.number().int(),
  month: z.number().int(),
  createdBy: z.string().optional(),
});
export type BillingRecordCreatedPayload = z.infer<typeof billingRecordCreatedPayloadSchema>;

export const billingLockedPayloadSchema = z.object({
  billingRecordId: z.string(),
  roomNo: z.string(),
  year: z.number().int(),
  month: z.number().int(),
  totalAmount: z.number(),
  lockedBy: z.string().optional(),
});
export type BillingLockedPayload = z.infer<typeof billingLockedPayloadSchema>;

export const invoiceGenerationRequestedPayloadSchema = z.object({
  billingRecordId: z.string(),
  roomNo: z.string(),
  year: z.number().int(),
  month: z.number().int(),
  totalAmount: z.number(),
  requestedBy: z.string().optional(),
});
export type InvoiceGenerationRequestedPayload = z.infer<typeof invoiceGenerationRequestedPayloadSchema>;

// ============================================================================
// Excel Import Types
// ============================================================================

export const billingImportRowSchema = z.object({
  roomNo: z.string().min(1),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  typeCode: billingItemTypeSchema,
  quantity: z.number().positive(),
  unitPrice: z.number().min(0),
  description: z.string().max(500).optional(),
});

export type BillingImportRow = z.infer<typeof billingImportRowSchema>;
