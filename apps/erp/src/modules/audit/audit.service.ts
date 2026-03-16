import { v4 as uuidv4 } from 'uuid';
import { prisma } from '@/lib/db/client';
import { auditLogger } from '@/lib/utils/logger';

export type AuditAction =
  | 'PAYMENT_CONFIRMED'
  | 'PAYMENT_REJECTED'
  | 'INVOICE_GENERATED'
  | 'INVOICE_REGENERATED'
  | 'CHAT_MESSAGE_SENT'
  | 'MAINTENANCE_TICKET_CREATED'
  | 'MAINTENANCE_TICKET_CLOSED'
  | 'MAINTENANCE_STATUS_UPDATED';

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
