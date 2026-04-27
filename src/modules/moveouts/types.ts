import { z } from 'zod';

// ============================================================================
// MoveOut Types
// ============================================================================

export const moveOutStatusSchema = z.enum([
  'PENDING',
  'INSPECTION_DONE',
  'DEPOSIT_CALCULATED',
  'CONFIRMED',
  'REFUNDED',
  'CANCELLED',
]);
export type MoveOutStatus = z.infer<typeof moveOutStatusSchema>;

export const moveOutItemConditionSchema = z.enum(['GOOD', 'FAIR', 'DAMAGED', 'MISSING']);
export type MoveOutItemCondition = z.infer<typeof moveOutItemConditionSchema>;

// ============================================================================
// Create MoveOut DTO
// ============================================================================

export const createMoveOutSchema = z.object({
  contractId: z.string().uuid('Invalid contract ID'),
  moveOutDate: z.string().datetime({ message: 'Invalid move-out date' }).or(z.string().date()),
  notes: z.string().max(2000).optional(),
  // Move-out meter readings — required when tenant moves out mid-month so the
  // system can compute a final settlement bill (prorated rent + utilities).
  // If not provided, the system will use the last billed readings as-is.
  moveOutWaterReading: z.number().min(0).optional(),
  moveOutElectricReading: z.number().min(0).optional(),
});

export type CreateMoveOutInput = z.infer<typeof createMoveOutSchema>;

// ============================================================================
// Update MoveOut DTO
// ============================================================================

export const updateMoveOutSchema = z.object({
  moveOutDate: z.string().datetime().or(z.string().date()).optional(),
  notes: z.string().max(2000).optional(),
  status: moveOutStatusSchema.optional(),
});

export type UpdateMoveOutInput = z.infer<typeof updateMoveOutSchema>;

// ============================================================================
// MoveOutItem DTOs
// ============================================================================

export const createMoveOutItemSchema = z.object({
  category: z.string().min(1, 'Category is required').max(100),
  item: z.string().min(1, 'Item name is required').max(200),
  condition: moveOutItemConditionSchema,
  cost: z.number().min(0).max(999999.99).default(0),
  notes: z.string().max(500).optional(),
});

export type CreateMoveOutItemInput = z.infer<typeof createMoveOutItemSchema>;

export const updateMoveOutItemSchema = z.object({
  category: z.string().min(1).max(100).optional(),
  item: z.string().min(1).max(200).optional(),
  condition: moveOutItemConditionSchema.optional(),
  cost: z.number().min(0).max(999999.99).optional(),
  notes: z.string().max(500).optional(),
});

export type UpdateMoveOutItemInput = z.infer<typeof updateMoveOutItemSchema>;

// ============================================================================
// Calculate Deposit DTO
// ============================================================================

export const calculateDepositSchema = z.object({
  cleaningFee: z.number().min(0).max(999999.99).default(0),
  damageRepairCost: z.number().min(0).max(999999.99).default(0),
  otherDeductions: z.number().min(0).max(999999.99).default(0),
});

export type CalculateDepositInput = z.infer<typeof calculateDepositSchema>;

// ============================================================================
// Confirm MoveOut DTO
// ============================================================================

export const confirmMoveOutSchema = z.object({
  notes: z.string().max(2000).optional(),
});

export type ConfirmMoveOutInput = z.infer<typeof confirmMoveOutSchema>;

// ============================================================================
// Mark Refund DTO
// ============================================================================

export const markRefundSchema = z.object({
  notes: z.string().max(2000).optional(),
});

export type MarkRefundInput = z.infer<typeof markRefundSchema>;

// ============================================================================
// List Query DTO
// ============================================================================

export const listMoveOutsQuerySchema = z.object({
  contractId: z.string().uuid().optional(),
  roomNo: z.string().optional(),
  status: moveOutStatusSchema.optional(),
  fromDate: z.string().date().optional(),
  toDate: z.string().date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(['moveOutDate', 'createdAt', 'finalRefund']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type ListMoveOutsQuery = z.infer<typeof listMoveOutsQuerySchema>;

// ============================================================================
// Response DTOs
// ============================================================================

export interface MoveOutItemResponse {
  id: string;
  moveOutId: string;
  category: string;
  item: string;
  condition: MoveOutItemCondition;
  cost: number;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MoveOutResponse {
  id: string;
  contractId: string;
  moveOutDate: Date;
  depositAmount: number;
  totalDeduction: number;
  finalRefund: number;
  status: MoveOutStatus;
  notes: string | null;
  lineNoticeSentAt: Date | null;
  confirmedAt: Date | null;
  confirmedBy: string | null;
  refundAt: Date | null;
  refundBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  contract?: {
    id: string;
    roomNo: string;
    monthlyRent: number;
    deposit: number | null;
    status: string;
    primaryTenant?: {
      id: string;
      firstName: string;
      lastName: string;
      fullName: string;
      phone: string;
      lineUserId: string | null;
    };
  };
  items: MoveOutItemResponse[];
}

export interface MoveOutListResponse {
  data: MoveOutResponse[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ============================================================================
// LINE Notify DTO
// ============================================================================

export const sendMoveOutNoticeSchema = z.object({
  message: z.string().max(2000).optional(),
});

export type SendMoveOutNoticeInput = z.infer<typeof sendMoveOutNoticeSchema>;
