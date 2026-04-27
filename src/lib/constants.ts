/**
 * Centralized constants for the Apartment ERP application.
 *
 * All status enums, magic numbers, and other hardcoded values that are used
 * across multiple modules should be declared here and imported from here.
 * This makes it easy to find all uses of a given constant and prevents typos.
 */

// ============================================================================
// Billing Status — tracks the state of a RoomBilling record
// Corresponds to the Prisma RoomBillingStatus enum and billingStatusSchema
// ============================================================================

export const BILLING_STATUS = {
  DRAFT: 'DRAFT',
  LOCKED: 'LOCKED',
  INVOICED: 'INVOICED',
} as const;

export type BillingStatus = (typeof BILLING_STATUS)[keyof typeof BILLING_STATUS];

// ============================================================================
// Invoice Status — tracks the lifecycle of a tenant invoice
// Corresponds to the Prisma InvoiceStatus enum and invoiceStatusSchema
// ============================================================================

export const INVOICE_STATUS = {
  GENERATED: 'GENERATED',
  SENT: 'SENT',
  VIEWED: 'VIEWED',
  PAID: 'PAID',
  OVERDUE: 'OVERDUE',
  CANCELLED: 'CANCELLED',
} as const;

export type InvoiceStatus = (typeof INVOICE_STATUS)[keyof typeof INVOICE_STATUS];

// ============================================================================
// Room Status — tracks the occupancy state of a room
// Corresponds to the Prisma RoomStatus enum and roomStatusSchema
// ============================================================================

export const ROOM_STATUS = {
  VACANT: 'VACANT',
  OCCUPIED: 'OCCUPIED',
  MAINTENANCE: 'MAINTENANCE',
  OWNER_USE: 'OWNER_USE',
} as const;

export type RoomStatus = (typeof ROOM_STATUS)[keyof typeof ROOM_STATUS];

// ============================================================================
// Contract Status — tracks the lifecycle of a tenancy contract
// Corresponds to the Prisma ContractStatus enum and contractStatusSchema
// ============================================================================

export const CONTRACT_STATUS = {
  ACTIVE: 'ACTIVE',
  EXPIRED: 'EXPIRED',
  TERMINATED: 'TERMINATED',
} as const;

export type ContractStatus = (typeof CONTRACT_STATUS)[keyof typeof CONTRACT_STATUS];

// ============================================================================
// Maintenance Status — tracks the resolution state of a maintenance ticket
// Defined in maintenance.service.ts (not in Prisma schema, so duplicated here)
// ============================================================================

export const MAINTENANCE_STATUS = {
  OPEN: 'OPEN',
  IN_PROGRESS: 'IN_PROGRESS',
  WAITING_PARTS: 'WAITING_PARTS',
  DONE: 'DONE',
  CLOSED: 'CLOSED',
} as const;

export type MaintenanceStatus = (typeof MAINTENANCE_STATUS)[keyof typeof MAINTENANCE_STATUS];

// ============================================================================
// Maintenance Priority — urgency level of a maintenance ticket
// Corresponds to the Prisma MaintenancePriority enum
// ============================================================================

export const MAINTENANCE_PRIORITY = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  URGENT: 'URGENT',
} as const;

export type MaintenancePriority = (typeof MAINTENANCE_PRIORITY)[keyof typeof MAINTENANCE_PRIORITY];

// ============================================================================
// Payment Status — tracks the state of a payment record
// Corresponds to the Prisma PaymentStatus enum
// ============================================================================

export const PAYMENT_STATUS = {
  PENDING: 'PENDING',
  MATCHED: 'MATCHED',
  CONFIRMED: 'CONFIRMED',
  REFUNDED: 'REFUNDED',
  REJECTED: 'REJECTED',
} as const;

export type PaymentStatus = (typeof PAYMENT_STATUS)[keyof typeof PAYMENT_STATUS];

// ============================================================================
// Payment Transaction Status — tracks inline-payment gateway transactions
// Corresponds to the Prisma PaymentTransactionStatus enum
// ============================================================================

export const PAYMENT_TRANSACTION_STATUS = {
  PENDING: 'PENDING',
  AUTO_MATCHED: 'AUTO_MATCHED',
  NEED_REVIEW: 'NEED_REVIEW',
  CONFIRMED: 'CONFIRMED',
  REJECTED: 'REJECTED',
} as const;

export type PaymentTransactionStatus = (typeof PAYMENT_TRANSACTION_STATUS)[keyof typeof PAYMENT_TRANSACTION_STATUS];

// ============================================================================
// Import Batch Status — tracks the state of an Excel billing import batch
// Corresponds to the Prisma ImportBatchStatus enum
// ============================================================================

export const IMPORT_BATCH_STATUS = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
} as const;

export type ImportBatchStatus = (typeof IMPORT_BATCH_STATUS)[keyof typeof IMPORT_BATCH_STATUS];

// ============================================================================
// Billing Period Status — tracks the state of a billing cycle
// Corresponds to the Prisma BillingPeriodStatus enum
// ============================================================================

export const BILLING_PERIOD_STATUS = {
  OPEN: 'OPEN',
  LOCKED: 'LOCKED',
  CLOSED: 'CLOSED',
} as const;

export type BillingPeriodStatus = (typeof BILLING_PERIOD_STATUS)[keyof typeof BILLING_PERIOD_STATUS];

// ============================================================================
// Meter Mode — how a utility (water/electric) reading is processed
// Corresponds to the Prisma MeterMode enum
// ============================================================================

export const METER_MODE = {
  NORMAL: 'NORMAL',
  MANUAL: 'MANUAL',
  FLAT: 'FLAT',
  STEP: 'STEP',
} as const;

export type MeterMode = (typeof METER_MODE)[keyof typeof METER_MODE];

// ============================================================================
// Room Billing Status — alias for BillingStatus kept for backward compatibility
// ============================================================================

export const ROOM_BILLING_STATUS = BILLING_STATUS;
export type RoomBillingStatus = BillingStatus;

// ============================================================================
// Time Constants (in milliseconds)
// ============================================================================

/** Milliseconds per day: 86_400_000 = 24 * 60 * 60 * 1000 */
export const MS_PER_DAY = 86_400_000;

/** Milliseconds per hour: 3_600_000 = 60 * 60 * 1000 */
export const MS_PER_HOUR = 3_600_000;

/** Milliseconds per minute: 60_000 = 60 * 1000 */
export const MS_PER_MINUTE = 60_000;

/** Seconds per day: 86_400 = 24 * 60 * 60 */
export const SECONDS_PER_DAY = 86_400;

// ============================================================================
// Cache / Security Header Constants
// ============================================================================

/**
 * HTTP Strict-Transport-Security max-age value (in seconds).
 * Corresponds to 2 years: 63072000 = 365 * 2 * 24 * 60 * 60
 * Used in middleware.ts for HSTS header.
 */
export const HSTS_MAX_AGE_SECONDS = 63_072_000;

/**
 * HTTP Cache-Control max-age for immutable assets (in seconds).
 * Corresponds to 1 year: 31536000 = 365 * 24 * 60 * 60
 * Used in file download routes for versioned/immutable assets.
 */
export const IMMUTABLE_CACHE_MAX_AGE_SECONDS = 31_536_000;

// ============================================================================
// Audit Log Retention
// ============================================================================

/** Default audit log retention period in days */
export const DEFAULT_AUDIT_RETENTION_DAYS = 90;

// ============================================================================
// Miscellaneous
// ============================================================================

/** Default day of the month for invoice due dates (25th) */
export const DEFAULT_DUE_DAY = 25;

/** Slow query threshold used by the DB client logger (milliseconds) */
export const SLOW_QUERY_THRESHOLD_MS = 1_000;
