import { z } from 'zod';

// ============================================================================
// Room Types
// ============================================================================

// RoomStatus: VACANT (available for rent), OCCUPIED (has tenant), MAINTENANCE (under repair), OWNER_USE
export const roomStatusSchema = z.enum(['VACANT', 'OCCUPIED', 'MAINTENANCE', 'OWNER_USE']);
export type RoomStatus = z.infer<typeof roomStatusSchema>;

// Legacy aliases kept for any code that still references old status names
export type RoomUsageType = 'RENTAL' | 'SELF_USE' | 'RESERVED' | 'STORAGE';
export type RoomBillingStatus = 'BILLABLE' | 'NON_BILLABLE' | 'SUSPENDED';

// ============================================================================
// Create Room DTO
// ============================================================================

export const createRoomSchema = z.object({
  roomNo: z.string().min(1, 'Room number is required').max(20, 'Room number must be at most 20 characters'),
  floorNo: z.number().int().min(1, 'Floor number must be at least 1'),
  defaultAccountId: z.string().min(1, 'Default account is required'),
  defaultRuleCode: z.string().min(1, 'Default rule code is required'),
  defaultRentAmount: z.number().min(0, 'Rent amount cannot be negative'),
  hasFurniture: z.boolean().default(false),
  defaultFurnitureAmount: z.number().min(0).default(0),
  roomStatus: roomStatusSchema.default('VACANT'),
  lineUserId: z.string().optional(),
});

export type CreateRoomInput = z.infer<typeof createRoomSchema>;

// ============================================================================
// Update Room DTO
// ============================================================================

export const updateRoomSchema = z.object({
  floorNo: z.number().int().min(1).optional(),
  defaultAccountId: z.string().optional(),
  defaultRuleCode: z.string().optional(),
  defaultRentAmount: z.number().min(0).optional(),
  hasFurniture: z.boolean().optional(),
  defaultFurnitureAmount: z.number().min(0).optional(),
  roomStatus: roomStatusSchema.optional(),
  lineUserId: z.string().optional().nullable(),
});

export type UpdateRoomInput = z.infer<typeof updateRoomSchema>;

// ============================================================================
// Change Room Status DTO
// ============================================================================

export const changeRoomStatusSchema = z.object({
  roomStatus: roomStatusSchema,
  reason: z.string().max(500).optional(),
});

export type ChangeRoomStatusInput = z.infer<typeof changeRoomStatusSchema>;

// ============================================================================
// List Rooms Query DTO
// ============================================================================

export const listRoomsQuerySchema = z.object({
  floorNo: z.coerce.number().int().optional(),
  roomStatus: roomStatusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(300).default(20),
  search: z.string().optional(),
  sortBy: z.enum(['roomNo', 'floorNo', 'roomStatus', 'createdAt']).default('roomNo'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

export type ListRoomsQuery = z.infer<typeof listRoomsQuerySchema>;

// ============================================================================
// Response DTOs
// ============================================================================

export interface RoomResponse {
  roomNo: string;
  /** Alias for roomNo — used by many frontend pages */
  roomNumber: string;
  floorNo: number;
  defaultAccountId: string;
  defaultRuleCode: string;
  defaultRentAmount: number;
  hasFurniture: boolean;
  defaultFurnitureAmount: number;
  roomStatus: RoomStatus;
  lineUserId?: string | null;
}

export interface RoomStatusCounts {
  VACANT: number;
  OCCUPIED: number;
  MAINTENANCE: number;
  OWNER_USE: number;
}

export interface RoomListResponse {
  data: RoomResponse[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  /** Global (unfiltered) status counts across ALL rooms in the building. */
  statusCounts: RoomStatusCounts;
}

// ============================================================================
// Event Payloads
// ============================================================================

export interface RoomCreatedPayload {
  roomNo: string;
  floorNo: number;
  defaultAccountId: string;
  defaultRuleCode: string;
  createdBy?: string;
}

export interface RoomUpdatedPayload {
  roomNo: string;
  changes: Record<string, { old: unknown; new: unknown }>;
  updatedBy?: string;
}

export interface RoomStatusChangedPayload {
  roomNo: string;
  previousStatus: RoomStatus;
  newStatus: RoomStatus;
  reason?: string;
  changedBy?: string;
}
