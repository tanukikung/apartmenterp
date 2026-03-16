import { z } from 'zod';

// Pagination
export const paginationSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(20),
});

export type PaginationParams = z.infer<typeof paginationSchema>;

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// API Response
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Error Response
export interface ApiError {
  success: false;
  error: string;
  code?: string;
  details?: Record<string, string[]>;
}

// Success Response
export interface ApiSuccess<T> {
  success: true;
  data: T;
  message?: string;
}

// Common schemas
export const idParamSchema = z.object({
  id: z.string().uuid(),
});

export const yearMonthSchema = z.object({
  year: z.number().min(2000).max(2100),
  month: z.number().min(1).max(12),
});

// Room types
export const createRoomSchema = z.object({
  floorId: z.string().uuid(),
  roomNumber: z.string().min(1).max(10),
  maxResidents: z.number().min(1).max(10).default(2),
});

export const updateRoomSchema = z.object({
  roomNumber: z.string().min(1).max(10).optional(),
  status: z.enum(['VACANT', 'OCCUPIED', 'MAINTENANCE']).optional(),
  maxResidents: z.number().min(1).max(10).optional(),
});

export type CreateRoomInput = z.infer<typeof createRoomSchema>;
export type UpdateRoomInput = z.infer<typeof updateRoomSchema>;

// Tenant types
export const createTenantSchema = z.object({
  lineUserId: z.string().optional(),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  phone: z.string().min(1).max(20),
  email: z.string().email().optional().or(z.literal('')),
  emergencyContact: z.string().optional(),
  emergencyPhone: z.string().optional(),
});

export const updateTenantSchema = createTenantSchema.partial();

export type CreateTenantInput = z.infer<typeof createTenantSchema>;
export type UpdateTenantInput = z.infer<typeof updateTenantSchema>;

// Room Tenant (assignment)
export const assignTenantSchema = z.object({
  roomId: z.string().uuid(),
  tenantId: z.string().uuid(),
  role: z.enum(['PRIMARY', 'SECONDARY']),
  moveInDate: z.string().date(),
});

export const removeTenantSchema = z.object({
  roomTenantId: z.string().uuid(),
  moveOutDate: z.string().date(),
});

export type AssignTenantInput = z.infer<typeof assignTenantSchema>;
export type RemoveTenantInput = z.infer<typeof removeTenantSchema>;

// Contract types
export const createContractSchema = z.object({
  roomId: z.string().uuid(),
  primaryTenantId: z.string().uuid(),
  startDate: z.string().date(),
  endDate: z.string().date(),
  monthlyRent: z.number().positive(),
  deposit: z.number().positive().optional(),
});

export const updateContractSchema = z.object({
  startDate: z.string().date().optional(),
  endDate: z.string().date().optional(),
  monthlyRent: z.number().positive().optional(),
  deposit: z.number().positive().optional(),
  status: z.enum(['ACTIVE', 'EXPIRED', 'TERMINATED']).optional(),
  terminationDate: z.string().date().optional(),
  terminationReason: z.string().optional(),
});

export type CreateContractInput = z.infer<typeof createContractSchema>;
export type UpdateContractInput = z.infer<typeof updateContractSchema>;

// Billing types
export const createBillingRecordSchema = z.object({
  roomId: z.string().uuid(),
  year: z.number().min(2000).max(2100),
  month: z.number().min(1).max(12),
  billingDay: z.number().min(1).max(31),
  dueDay: z.number().min(1).max(31),
  overdueDay: z.number().min(1).max(31),
});

export const updateBillingItemSchema = z.object({
  itemId: z.string().uuid(),
  quantity: z.number().positive().optional(),
  unitPrice: z.number().min(0).optional(),
  description: z.string().optional(),
});

export const lockBillingSchema = z.object({
  billingRecordId: z.string().uuid(),
});

export type CreateBillingRecordInput = z.infer<typeof createBillingRecordSchema>;
export type UpdateBillingItemInput = z.infer<typeof updateBillingItemSchema>;
export type LockBillingInput = z.infer<typeof lockBillingSchema>;

// Invoice types
export const generateInvoiceSchema = z.object({
  billingRecordId: z.string().uuid(),
});

export const sendInvoiceSchema = z.object({
  invoiceId: z.string().uuid(),
});

export type GenerateInvoiceInput = z.infer<typeof generateInvoiceSchema>;
export type SendInvoiceInput = z.infer<typeof sendInvoiceSchema>;

// Payment types
export const importPaymentSchema = z.object({
  amount: z.number().positive(),
  paidAt: z.string().date(),
  description: z.string().optional(),
  reference: z.string().optional(),
  sourceFile: z.string(),
});

export const confirmPaymentSchema = z.object({
  paymentId: z.string().uuid(),
  invoiceId: z.string().uuid(),
});

export const rejectPaymentSchema = z.object({
  paymentId: z.string().uuid(),
  reason: z.string(),
});

export type ImportPaymentInput = z.infer<typeof importPaymentSchema>;
export type ConfirmPaymentInput = z.infer<typeof confirmPaymentSchema>;
export type RejectPaymentInput = z.infer<typeof rejectPaymentSchema>;

// Messaging types
export const sendMessageSchema = z.object({
  tenantId: z.string().uuid(),
  content: z.string().min(1),
  type: z.enum(['text', 'image', 'template']).default('text'),
});

export const replyConversationSchema = z.object({
  conversationId: z.string().uuid(),
  content: z.string().min(1),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type ReplyConversationInput = z.infer<typeof replyConversationSchema>;

// Setup types
export const setupBuildingSchema = z.object({
  name: z.string().min(1).max(100),
  address: z.string().min(1).max(200),
  totalFloors: z.number().min(1).max(50),
});

export const setupRoomsSchema = z.object({
  roomsPerFloor: z.array(z.number()),
});

export const setupBillingSchema = z.object({
  billingDay: z.number().min(1).max(31),
  dueDay: z.number().min(1).max(31),
  overdueDay: z.number().min(1).max(31),
});

export type SetupBuildingInput = z.infer<typeof setupBuildingSchema>;
export type SetupRoomsInput = z.infer<typeof setupRoomsSchema>;
export type SetupBillingInput = z.infer<typeof setupBillingSchema>;
