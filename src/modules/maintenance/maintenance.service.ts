import { v4 as uuidv4 } from 'uuid';
import { prisma } from '@/lib';
import { logAudit } from '@/modules/audit';
import { BadRequestError } from '@/lib/utils/errors';

type MaintenancePriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
type MaintenanceStatus = 'OPEN' | 'IN_PROGRESS' | 'WAITING_PARTS' | 'DONE' | 'CLOSED';

export interface CreateMaintenanceTicketInput {
  roomId: string;
  tenantId: string;
  title: string;
  description: string;
  priority: MaintenancePriority;
  attachments?: Array<{
    fileUrl: string;
    fileType: string;
  }>;
}

export interface UpdateMaintenanceStatusInput {
  ticketId: string;
  status: MaintenanceStatus;
}

export interface AssignMaintenanceInput {
  ticketId: string;
  staffId: string;
}

export interface AddCommentInput {
  ticketId: string;
  authorId: string;
  message: string;
}

interface MaintenanceAuditActor {
  actorId: string;
  actorRole: string;
}

export class MaintenanceService {
  private asMaintenance(client: unknown) {
    type TicketMinimal = {
      id: string;
      roomId?: string;
      tenantId?: string;
      status: MaintenanceStatus;
      assignedStaffId?: string | null;
      priority?: MaintenancePriority;
    };
    type MaintenanceClient = {
      maintenanceTicket: {
        create(args: { data: unknown }): Promise<TicketMinimal>;
        update(args: { where: { id: string }; data: unknown }): Promise<TicketMinimal>;
        findMany(args?: unknown): Promise<Array<Record<string, unknown>>>;
      };
      maintenanceAttachment: { create(args: { data: unknown }): Promise<unknown> };
      maintenanceComment: { create(args: { data: unknown }): Promise<{ id: string }> };
    };
    return client as MaintenanceClient;
  }

  async createTicket(
    input: CreateMaintenanceTicketInput,
    auditActor: MaintenanceAuditActor
  ) {
    const ticket = await prisma.$transaction(async (tx) => {
      // Validate tenant belongs to this room before accepting the ticket.
      // This prevents anonymous users from spoofing tickets for arbitrary rooms.
      const assignment = await tx.roomTenant.findFirst({
        where: {
          roomNo: input.roomId,
          tenantId: input.tenantId,
          moveOutDate: null,
        },
      });
      if (!assignment) {
        throw new BadRequestError('Tenant is not assigned to this room');
      }

      const mtx = this.asMaintenance(tx);
      const created = await mtx.maintenanceTicket.create({
        data: {
          id: uuidv4(),
          roomNo: input.roomId,
          tenantId: input.tenantId,
          title: input.title,
          description: input.description,
          priority: input.priority,
        },
      });

      if (input.attachments && input.attachments.length > 0) {
        for (const a of input.attachments) {
          // Validate URL format and protocol before storing
          if (!a.fileUrl || typeof a.fileUrl !== 'string') {
            throw new BadRequestError('Attachment fileUrl must be a non-empty string');
          }
          let url: URL;
          try {
            url = new URL(a.fileUrl);
          } catch {
            throw new BadRequestError(`Invalid attachment URL: ${a.fileUrl}`);
          }
          if (url.protocol !== 'https:') {
            throw new BadRequestError(`Attachment URL must use HTTPS: ${a.fileUrl}`);
          }

          await mtx.maintenanceAttachment.create({
            data: {
              id: uuidv4(),
              ticketId: created.id,
              fileUrl: a.fileUrl,
              fileType: a.fileType,
            },
          });
        }
      }

      return created;
    });

    await logAudit({
      actorId: auditActor.actorId,
      actorRole: auditActor.actorRole,
      action: 'MAINTENANCE_TICKET_CREATED',
      entityType: 'MAINTENANCE_TICKET',
      entityId: ticket.id,
      metadata: {
        roomId: ticket.roomId,
        tenantId: ticket.tenantId,
        submittedTenantId: input.tenantId,
        priority: ticket.priority,
      },
    });

    return ticket;
  }

  async listTenantTickets(tenantId: string) {
    const m = this.asMaintenance(prisma);
    return m.maintenanceTicket.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async listTickets() {
    const m = this.asMaintenance(prisma);
    return m.maintenanceTicket.findMany({
      include: {
        room: true,
        tenant: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async assignStaff(input: AssignMaintenanceInput, actorId: string) {
    const m = this.asMaintenance(prisma);
    const ticket = await m.maintenanceTicket.update({
      where: { id: input.ticketId },
      data: {
        assignedStaffId: input.staffId,
      },
    });

    await logAudit({
      actorId,
      actorRole: 'ADMIN',
      action: 'MAINTENANCE_STATUS_UPDATED',
      entityType: 'MAINTENANCE_TICKET',
      entityId: ticket.id,
      metadata: {
        assignedStaffId: input.staffId,
      },
    });

    return ticket;
  }

  async updateStatus(input: UpdateMaintenanceStatusInput, actorId: string) {
    const m = this.asMaintenance(prisma);
    const ticket = await m.maintenanceTicket.update({
      where: { id: input.ticketId },
      data: {
        status: input.status,
      },
    });

    await logAudit({
      actorId,
      actorRole: 'ADMIN',
      action: 'MAINTENANCE_STATUS_UPDATED',
      entityType: 'MAINTENANCE_TICKET',
      entityId: ticket.id,
      metadata: {
        status: ticket.status,
      },
    });

    if (ticket.status === 'CLOSED') {
      await logAudit({
        actorId,
        actorRole: 'ADMIN',
        action: 'MAINTENANCE_TICKET_CLOSED',
        entityType: 'MAINTENANCE_TICKET',
        entityId: ticket.id,
      });
    }

    return ticket;
  }

  async addComment(input: AddCommentInput, actorId: string) {
    const m = this.asMaintenance(prisma);
    const comment = await m.maintenanceComment.create({
      data: {
        id: uuidv4(),
        ticketId: input.ticketId,
        authorId: input.authorId,
        message: input.message,
      },
    });

    await logAudit({
      actorId,
      actorRole: 'ADMIN',
      action: 'MAINTENANCE_STATUS_UPDATED',
      entityType: 'MAINTENANCE_TICKET',
      entityId: input.ticketId,
      metadata: {
        commentId: comment.id,
      },
    });

    return comment;
  }
}

export function createMaintenanceService(): MaintenanceService {
  return new MaintenanceService();
}
