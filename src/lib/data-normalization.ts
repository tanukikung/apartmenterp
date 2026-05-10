/**
 * Data Normalization Utilities
 * Removes duplicate/derived fields and normalizes common patterns
 */

// Common patterns
export interface PaginatedResult<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    statusCode: number;
    name: string;
  };
  meta?: Record<string, any>;
}

// Normalize date fields - always return ISO string or null
export function normalizeDate(value: any): string | null {
  if (!value) return null;
  if (typeof value === 'string') return new Date(value).toISOString();
  if (value instanceof Date) return value.toISOString();
  return null;
}

// Normalize money fields - always return number in base units (satang/cents)
export function normalizeMoney(value: any): number {
  if (value === null || value === undefined) return 0;
  const num = Number(value);
  return Number.isFinite(num) ? Math.round(num * 100) : 0;
}

// Normalize phone numbers
export function normalizePhone(value: string): string {
  if (!value) return '';
  return value.replace(/\D/g, '').slice(-10);
}

// Normalize status fields - ensure consistency
export const STATUS_NORMALIZATION = {
  invoice: (status: string) => {
    const map: Record<string, string> = {
      DRAFT: 'GENERATED',
      GENERATED: 'GENERATED',
      SENT: 'SENT',
      VIEWED: 'VIEWED',
      PAID: 'PAID',
      OVERDUE: 'OVERDUE',
      CANCELLED: 'CANCELLED',
    };
    return map[status.toUpperCase()] || 'GENERATED';
  },

  payment: (status: string) => {
    const map: Record<string, string> = {
      PENDING: 'PENDING',
      MATCHED: 'MATCHED',
      UNMATCHED: 'UNMATCHED',
      FAILED: 'FAILED',
    };
    return map[status.toUpperCase()] || 'PENDING';
  },

  contract: (status: string) => {
    const map: Record<string, string> = {
      ACTIVE: 'ACTIVE',
      PENDING: 'PENDING',
      ENDED: 'ENDED',
      CANCELLED: 'CANCELLED',
    };
    return map[status.toUpperCase()] || 'PENDING';
  },

  billing: (status: string) => {
    const map: Record<string, string> = {
      OPEN: 'OPEN',
      LOCKED: 'LOCKED',
      CLOSED: 'CLOSED',
    };
    return map[status.toUpperCase()] || 'OPEN';
  },
};

// Normalize room occupancy status
export type RoomStatus = 'OCCUPIED' | 'VACANT' | 'MAINTENANCE' | 'RESERVED';

export function normalizeRoomStatus(
  activeContracts: number,
  maintenanceMode: boolean
): RoomStatus {
  if (maintenanceMode) return 'MAINTENANCE';
  if (activeContracts > 0) return 'OCCUPIED';
  return 'VACANT';
}

// Remove duplicate computed fields
export function removeDuplicateFields<T extends Record<string, any>>(
  data: T,
  fieldsToRemove: (keyof T)[]
): Omit<T, keyof T> {
  const result = { ...data };
  fieldsToRemove.forEach((field) => {
    delete result[field];
  });
  return result;
}

// Normalize tenant data - remove duplicate/derived fields
export function normalizeTenant(tenant: any) {
  const normalized = {
    id: tenant.id,
    firstName: tenant.firstName?.trim(),
    lastName: tenant.lastName?.trim(),
    phone: normalizePhone(tenant.phone),
    email: tenant.email?.toLowerCase().trim(),
    idNumber: tenant.idNumber,
    createdAt: normalizeDate(tenant.createdAt),
    updatedAt: normalizeDate(tenant.updatedAt),
  };

  return normalized;
}

// Normalize invoice data - remove duplicate/derived fields
export function normalizeInvoice(invoice: any) {
  const normalized = {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    roomId: invoice.roomId,
    tenantId: invoice.tenantId,
    periodMonth: invoice.periodMonth,
    periodYear: invoice.periodYear,
    totalAmount: normalizeMoney(invoice.totalAmount),
    status: STATUS_NORMALIZATION.invoice(invoice.status),
    dueDate: normalizeDate(invoice.dueDate),
    sentAt: normalizeDate(invoice.sentAt),
    viewedAt: normalizeDate(invoice.viewedAt),
    paidAt: normalizeDate(invoice.paidAt),
    createdAt: normalizeDate(invoice.createdAt),
  };

  return normalized;
}

// Normalize contract data
export function normalizeContract(contract: any) {
  const normalized = {
    id: contract.id,
    roomId: contract.roomId,
    tenantId: contract.tenantId,
    startDate: normalizeDate(contract.startDate),
    endDate: normalizeDate(contract.endDate),
    monthlyRent: normalizeMoney(contract.monthlyRent),
    deposit: normalizeMoney(contract.deposit),
    status: STATUS_NORMALIZATION.contract(contract.status),
    createdAt: normalizeDate(contract.createdAt),
  };

  return normalized;
}

// Normalize payment data
export function normalizePayment(payment: any) {
  const normalized = {
    id: payment.id,
    bankAccountId: payment.bankAccountId,
    amount: normalizeMoney(payment.amount),
    reference: payment.reference?.trim(),
    transferDate: normalizeDate(payment.transferDate),
    status: STATUS_NORMALIZATION.payment(payment.status),
    createdAt: normalizeDate(payment.createdAt),
  };

  return normalized;
}

// Normalize room data
export function normalizeRoom(room: any) {
  const normalized = {
    id: room.id,
    roomNumber: room.roomNumber?.trim(),
    floorId: room.floorId,
    rentableArea: Number(room.rentableArea) || 0,
    type: room.type?.trim(),
    maxOccupants: Number(room.maxOccupants) || 1,
    status: normalizeRoomStatus(
      room.activeContractsCount || 0,
      room.maintenanceMode || false
    ),
    createdAt: normalizeDate(room.createdAt),
  };

  return normalized;
}

// Batch normalize array of items
export function normalizeArray<T>(
  items: any[],
  normalizeFn: (item: any) => T
): T[] {
  return items.map(normalizeFn).filter(Boolean);
}
