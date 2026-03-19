import { z } from 'zod';

// ============================================================================
// Tenant Types
// ============================================================================

export const tenantRoleSchema = z.enum(['PRIMARY', 'SECONDARY']);
export type TenantRole = z.infer<typeof tenantRoleSchema>;

// ============================================================================
// Create Tenant DTO
// ============================================================================

export const createTenantSchema = z.object({
  firstName: z.string()
    .min(1, 'First name is required')
    .max(100, 'First name must be at most 100 characters'),
  lastName: z.string()
    .min(1, 'Last name is required')
    .max(100, 'Last name must be at most 100 characters'),
  phone: z.string()
    .min(1, 'Phone is required')
    .max(20, 'Phone must be at most 20 characters'),
  email: z.string()
    .email('Invalid email format')
    .optional()
    .or(z.literal('')),
  lineUserId: z.string()
    .optional(),
  emergencyContact: z.string()
    .max(200, 'Emergency contact must be at most 200 characters')
    .optional(),
  emergencyPhone: z.string()
    .max(20, 'Emergency phone must be at most 20 characters')
    .optional(),
});

export type CreateTenantInput = z.infer<typeof createTenantSchema>;

// ============================================================================
// Update Tenant DTO
// ============================================================================

export const updateTenantSchema = z.object({
  firstName: z.string()
    .min(1, 'First name is required')
    .max(100, 'First name must be at most 100 characters')
    .optional(),
  lastName: z.string()
    .min(1, 'Last name is required')
    .max(100, 'Last name must be at most 100 characters')
    .optional(),
  phone: z.string()
    .min(1, 'Phone is required')
    .max(20, 'Phone must be at most 20 characters')
    .optional(),
  email: z.string()
    .email('Invalid email format')
    .optional()
    .or(z.literal('')),
  emergencyContact: z.string()
    .max(200, 'Emergency contact must be at most 200 characters')
    .optional(),
  emergencyPhone: z.string()
    .max(20, 'Emergency phone must be at most 20 characters')
    .optional(),
});

export type UpdateTenantInput = z.infer<typeof updateTenantSchema>;

// ============================================================================
// Assign Tenant to Room DTO
// ============================================================================

export const assignTenantSchema = z.object({
  tenantId: z.string().uuid('Invalid tenant ID'),
  role: tenantRoleSchema,
  moveInDate: z.string().date('Invalid move-in date'),
});

export type AssignTenantInput = z.infer<typeof assignTenantSchema>;

// ============================================================================
// Remove Tenant from Room DTO
// ============================================================================

export const removeTenantSchema = z.object({
  moveOutDate: z.string().date('Invalid move-out date'),
});

export type RemoveTenantInput = z.infer<typeof removeTenantSchema>;

// ============================================================================
// Link LINE Account DTO
// ============================================================================

export const linkLineAccountSchema = z.object({
  lineUserId: z.string().min(1, 'LINE user ID is required'),
});

export type LinkLineAccountInput = z.infer<typeof linkLineAccountSchema>;

// ============================================================================
// List Tenants Query DTO
// ============================================================================

export const listTenantsQuerySchema = z.object({
  roomId: z.string().optional(),
  lineUserId: z.string().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(['firstName', 'lastName', 'createdAt']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

export type ListTenantsQuery = z.infer<typeof listTenantsQuerySchema>;

// ============================================================================
// Response DTOs
// ============================================================================

export interface TenantResponse {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  phone: string;
  email: string | null;
  lineUserId: string | null;
  emergencyContact: string | null;
  emergencyPhone: string | null;
  createdAt: Date;
  updatedAt: Date;
  roomTenants?: RoomTenantResponse[];
}

export interface RoomTenantResponse {
  id: string;
  roomNo: string;
  tenantId: string;
  role: TenantRole;
  moveInDate: Date;
  moveOutDate: Date | null;
  room?: {
    roomNo: string;
  };
}

export interface TenantListResponse {
  data: TenantResponse[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ============================================================================
// Event Payloads
// ============================================================================

export interface TenantCreatedPayload {
  tenantId: string;
  fullName: string;
  phone: string;
  email?: string;
  lineUserId?: string;
  createdBy?: string;
}

export interface TenantUpdatedPayload {
  tenantId: string;
  fullName: string;
  changes: Record<string, { old: unknown; new: unknown }>;
  updatedBy?: string;
}

export interface TenantAssignedToRoomPayload {
  tenantId: string;
  fullName: string;
  roomNo: string;
  role: TenantRole;
  moveInDate: string;
  assignedBy?: string;
}

export interface TenantRemovedFromRoomPayload {
  tenantId: string;
  fullName: string;
  roomNo: string;
  role: TenantRole;
  moveOutDate: string;
  removedBy?: string;
}

export interface TenantLineLinkedPayload {
  tenantId: string;
  fullName: string;
  lineUserId: string;
  linkedBy?: string;
}
