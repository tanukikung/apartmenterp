import { z } from 'zod';

// ============================================================================
// Room Types
// ============================================================================

export const roomStatusSchema = z.enum(['VACANT', 'OCCUPIED', 'MAINTENANCE', 'SELF_USE', 'UNAVAILABLE']);

export type RoomStatus = z.infer<typeof roomStatusSchema>;

export const roomUsageTypeSchema = z.enum(['RENTAL', 'SELF_USE', 'RESERVED', 'STORAGE']);
export type RoomUsageType = z.infer<typeof roomUsageTypeSchema>;

export const roomBillingStatusSchema = z.enum(['BILLABLE', 'NON_BILLABLE', 'SUSPENDED']);
export type RoomBillingStatus = z.infer<typeof roomBillingStatusSchema>;

// ============================================================================
// Create Room DTO
// ============================================================================

export const createRoomSchema = z.object({
  floorId: z.string().uuid('Invalid floor ID'),
  roomNumber: z.string()
    .min(1, 'Room number is required')
    .max(10, 'Room number must be at most 10 characters'),
  capacity: z.number()
    .int()
    .min(1, 'Capacity must be at least 1')
    .max(10, 'Capacity must be at most 10')
    .default(2),
  status: roomStatusSchema.default('VACANT'),
  usageType: roomUsageTypeSchema.default('RENTAL'),
  billingStatus: roomBillingStatusSchema.default('BILLABLE'),
  defaultFurnitureFee: z.number().min(0).optional(),
  sortOrder: z.number().int().optional(),
  note: z.string().max(500).optional(),
  isActive: z.boolean().default(true),
});

export type CreateRoomInput = z.infer<typeof createRoomSchema>;

// ============================================================================
// Update Room DTO
// ============================================================================

export const updateRoomSchema = z.object({
  roomNumber: z.string()
    .min(1, 'Room number is required')
    .max(10, 'Room number must be at most 10 characters')
    .optional(),
  capacity: z.number()
    .int()
    .min(1, 'Capacity must be at least 1')
    .max(10, 'Capacity must be at most 10')
    .optional(),
  status: roomStatusSchema.optional(),
  usageType: roomUsageTypeSchema.optional(),
  billingStatus: roomBillingStatusSchema.optional(),
  defaultFurnitureFee: z.number().min(0).optional(),
  sortOrder: z.number().int().optional(),
  note: z.string().max(500).optional(),
  isActive: z.boolean().optional(),
});

export type UpdateRoomInput = z.infer<typeof updateRoomSchema>;

// ============================================================================
// Change Room Status DTO
// ============================================================================

export const changeRoomStatusSchema = z.object({
  status: roomStatusSchema,
  reason: z.string().max(500).optional(),
});

export type ChangeRoomStatusInput = z.infer<typeof changeRoomStatusSchema>;

// ============================================================================
// List Rooms Query DTO
// ============================================================================

export const listRoomsQuerySchema = z.object({
  floorId: z.string().uuid().optional(),
  status: roomStatusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  sortBy: z.enum(['roomNumber', 'status', 'createdAt']).default('roomNumber'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
  usageType: roomUsageTypeSchema.optional(),
  billingStatus: roomBillingStatusSchema.optional(),
  isActive: z.coerce.boolean().optional(),
});

export type ListRoomsQuery = z.infer<typeof listRoomsQuerySchema>;

// ============================================================================
// Response DTOs
// ============================================================================

export interface RoomResponse {
  id: string;
  floorId: string;
  roomNumber: string;
  status: RoomStatus;
  capacity: number;
  usageType: RoomUsageType;
  billingStatus: RoomBillingStatus;
  defaultFurnitureFee?: number | null;
  sortOrder?: number | null;
  note?: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  floor?: {
    id: string;
    floorNumber: number;
    buildingId: string;
  };
}

export interface RoomListResponse {
  data: RoomResponse[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ============================================================================
// Event Payloads
// ============================================================================

export interface RoomCreatedPayload {
  roomId: string;
  roomNumber: string;
  floorId: string;
  floorNumber: number;
  buildingId: string;
  capacity: number;
  createdBy?: string;
}

export interface RoomUpdatedPayload {
  roomId: string;
  roomNumber: string;
  changes: Record<string, { old: unknown; new: unknown }>;
  updatedBy?: string;
}

export interface RoomStatusChangedPayload {
  roomId: string;
  roomNumber: string;
  previousStatus: RoomStatus;
  newStatus: RoomStatus;
  reason?: string;
  changedBy?: string;
}
