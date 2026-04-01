import { v4 as uuidv4 } from 'uuid';
import { prisma } from '@/lib/db/client';
import { auditLogger } from '@/lib/utils/logger';

export type AuditAction =
  // Payment & Billing
  | 'PAYMENT_CONFIRMED'
  | 'PAYMENT_REJECTED'
  | 'PAYMENT_IMPORTED'
  | 'INVOICE_GENERATED'
  | 'INVOICE_REGENERATED'
  | 'INVOICE_CANCELLED'
  | 'INVOICE_SEND_REQUESTED'
  // Chat & Messaging
  | 'CHAT_MESSAGE_SENT'
  | 'REMINDER_SEND_REQUESTED'
  | 'BULK_REMINDER_SEND_REQUESTED'
  | 'RECEIPT_SEND_REQUESTED'
  // Maintenance
  | 'MAINTENANCE_TICKET_CREATED'
  | 'MAINTENANCE_TICKET_CLOSED'
  | 'MAINTENANCE_STATUS_UPDATED'
  // Admin Users
  | 'ADMIN_USER_CREATED'
  | 'ADMIN_USER_UPDATED'
  | 'ADMIN_RESET_LINK_ISSUED'
  | 'ADMIN_RESET_LINK_REVOKED'
  // Auth
  | 'PASSWORD_CHANGED'
  | 'PASSWORD_RESET_REQUESTED'
  // System
  | 'SYSTEM_RESET'
  | 'DB_CLEANUP_STARTED'
  | 'DB_CLEANUP_COMPLETED'
  // Documents & Templates
  | 'DOCUMENT_TEMPLATE_CREATED'
  | 'DOCUMENT_TEMPLATE_VERSION_CREATED'
  | 'DOCUMENT_TEMPLATE_VERSION_UPLOADED'
  | 'DOCUMENT_TEMPLATE_VERSION_ACTIVATED'
  | 'DOCUMENT_TEMPLATE_VERSION_SAVED'
  | 'DOCUMENT_GENERATION_REQUESTED'
  | 'GENERATED_DOCUMENT_CREATED'
  | 'DOCUMENT_GENERATION_COMPLETED'
  | 'GENERATED_DOCUMENT_REGENERATE_REQUESTED'
  | 'GENERATED_DOCUMENT_PDF_EXPORTED'
  | 'GENERATED_DOCUMENT_FILE_EXPORTED'
  // Tenant Registrations
  | 'TENANT_REGISTRATION_APPROVED'
  | 'TENANT_REGISTRATION_REJECTED'
  // Payments & Banking
  | 'BANK_STATEMENT_UPLOADED'
  | 'BANK_ACCOUNT_CREATED'
  | 'BANK_ACCOUNT_UPDATED'
  | 'BANK_ACCOUNT_DEACTIVATED'
  // Settings
  | 'LINE_INTEGRATION_UPDATED'
  | 'BUILDING_SETTINGS_UPDATED'
  | 'AUTOMATION_SETTINGS_UPDATED'
  // Deliveries
  | 'DELIVERY_RESEND_REQUESTED';

export interface LogAuditInput {
  actorId: string;
  actorRole?: string;
  action: AuditAction | string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
}

export async function logAudit(input: LogAuditInput): Promise<void> {
  const {
    actorId,
    actorRole,
    action,
    entityType,
    entityId,
    metadata,
    ipAddress,
  } = input;

  try {
    await prisma.auditLog.create({
      data: {
        id: uuidv4(),
        action,
        entityType,
        entityId,
        userId: actorId,
        userName: actorRole || 'SYSTEM',
        details: {
          actorRole: actorRole || 'SYSTEM',
          ...metadata,
        },
        ipAddress: ipAddress ?? null,
      },
    });

    auditLogger.info(action, entityType, entityId, metadata);
  } catch (error) {
    auditLogger.error(action, entityType, entityId, error as Error);
  }
}
