import { z } from 'zod';

const stripHtml = (v: string) => v.replace(/<[^>]*>/g, '').trim();

// ============================================================================
// Contract Types
// ============================================================================

export const contractStatusSchema = z.enum(['ACTIVE', 'EXPIRED', 'TERMINATED']);
export type ContractStatus = z.infer<typeof contractStatusSchema>;

// ============================================================================
// Create Contract DTO
// ============================================================================

export const createContractSchema = z.object({
  roomId: z.string().min(1, 'Invalid room number'),
  primaryTenantId: z.string().uuid('Invalid tenant ID'),
  startDate: z.string().date('Invalid start date'),
  endDate: z.string().date('Invalid end date'),
  rentAmount: z.number()
    .positive('Rent amount must be positive')
    .max(999999.99, 'Rent amount too large'),
  depositAmount: z.number()
    .min(0, 'Deposit cannot be negative')
    .max(999999.99, 'Deposit amount too large')
    .optional()
    .default(0),
});

export type CreateContractInput = z.infer<typeof createContractSchema>;

// ============================================================================
// Update Contract DTO
// ============================================================================

export const updateContractSchema = z.object({
  startDate: z.string().date().optional(),
  endDate: z.string().date().optional(),
  rentAmount: z.number()
    .positive()
    .max(999999.99)
    .optional(),
  depositAmount: z.number()
    .min(0)
    .max(999999.99)
    .optional(),
});

export type UpdateContractInput = z.infer<typeof updateContractSchema>;

// ============================================================================
// Renew Contract DTO
// ============================================================================

export const renewContractSchema = z.object({
  newEndDate: z.string().date('Invalid end date'),
  newRentAmount: z.number()
    .positive()
    .max(999999.99)
    .optional(),
  newDepositAmount: z.number()
    .min(0)
    .max(999999.99)
    .optional(),
});

export type RenewContractInput = z.infer<typeof renewContractSchema>;

// ============================================================================
// Terminate Contract DTO
// ============================================================================

export const terminateContractSchema = z.object({
  terminationDate: z.string().date('Invalid termination date'),
  terminationReason: z.string()
    .max(500, 'Reason too long')
    .transform(stripHtml)
    .optional(),
  /** Override: force termination even if unpaid invoices exist */
  forceTermination: z.boolean().optional().default(false),
});

export type TerminateContractInput = z.infer<typeof terminateContractSchema>;

// ============================================================================
// List Contracts Query DTO
// ============================================================================

export const listContractsQuerySchema = z.object({
  roomId: z.string().optional(),
  tenantId: z.string().uuid().optional(),
  status: contractStatusSchema.optional(),
  expiringBefore: z.string().date().optional(),
  expiringAfter: z.string().date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(['startDate', 'endDate', 'rentAmount', 'createdAt']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type ListContractsQuery = z.infer<typeof listContractsQuerySchema>;

// ============================================================================
// Response DTOs
// ============================================================================

export interface ContractResponse {
  id: string;
  roomNo: string;
  primaryTenantId: string;
  startDate: Date;
  endDate: Date;
  rentAmount: number;
  depositAmount: number;
  status: ContractStatus;
  terminationDate: Date | null;
  terminationReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  room?: {
    roomNo: string;
  };
  primaryTenant?: {
    id: string;
    firstName: string;
    lastName: string;
    fullName: string;
    phone: string;
  };
}

export interface ContractListResponse {
  data: ContractResponse[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ============================================================================
// Event Payloads
// ============================================================================

export interface ContractCreatedPayload {
  contractId: string;
  roomNo: string;
  tenantId: string;
  tenantName: string;
  startDate: string;
  endDate: string;
  rentAmount: number;
  depositAmount: number;
  createdBy?: string;
}

export interface ContractRenewedPayload {
  contractId: string;
  roomNo: string;
  tenantId: string;
  tenantName: string;
  oldEndDate: string;
  newEndDate: string;
  newRentAmount?: number;
  newDepositAmount?: number;
  renewedBy?: string;
}

export interface ContractTerminatedPayload {
  contractId: string;
  roomNo: string;
  tenantId: string;
  tenantName: string;
  terminationDate: string;
  terminationReason?: string;
  terminatedBy?: string;
}

export interface ContractExpiredPayload {
  contractId: string;
  roomNo: string;
  tenantId: string;
  tenantName: string;
  endDate: string;
}

export interface ContractExpiringSoonPayload {
  contractId: string;
  roomNo: string;
  tenantId: string;
  tenantName: string;
  endDate: string;
  daysUntilExpiry: number;
}
