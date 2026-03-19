import { v4 as uuidv4 } from 'uuid';
import { prisma, EventBus, logger, EventTypes } from '@/lib';
import { Json } from '@/types/prisma-json';
import {
  CreateTenantInput,
  UpdateTenantInput,
  AssignTenantInput,
  RemoveTenantInput,
  LinkLineAccountInput,
  ListTenantsQuery,
  TenantResponse,
  TenantListResponse,
  RoomTenantResponse,
  TenantCreatedPayload,
  TenantUpdatedPayload,
  TenantAssignedToRoomPayload,
  TenantRemovedFromRoomPayload,
  TenantLineLinkedPayload,
} from './types';
import type { TenantRole } from './types';
import {
  NotFoundError,
  ConflictError,
} from '@/lib/utils/errors';

// ============================================================================
// Tenant Service
// ============================================================================

export class TenantService {
  private eventBus: EventBus;

  constructor(eventBus?: EventBus) {
    this.eventBus = eventBus || EventBus.getInstance();
  }

  /**
   * Create a new tenant
   */
  async createTenant(
    input: CreateTenantInput,
    createdBy?: string
  ): Promise<TenantResponse> {
    logger.info({ type: 'tenant_create', input: { ...input, phone: '***' } });

    // Check if LINE user ID is already linked
    if (input.lineUserId) {
      const existingWithLine = await prisma.tenant.findUnique({
        where: { lineUserId: input.lineUserId },
      });

      if (existingWithLine) {
        throw new ConflictError('LINE account already linked to another tenant');
      }
    }

    const tenant = await prisma.$transaction(async (tx) => {
      const created = await tx.tenant.create({
        data: {
          id: uuidv4(),
          firstName: input.firstName,
          lastName: input.lastName,
          phone: input.phone,
          email: input.email || null,
          lineUserId: input.lineUserId || null,
          emergencyContact: input.emergencyContact || null,
          emergencyPhone: input.emergencyPhone || null,
        },
      });
      await tx.outboxEvent.create({
        data: {
          id: uuidv4(),
          aggregateType: 'Tenant',
          aggregateId: created.id,
          eventType: EventTypes.TENANT_CREATED,
          payload: {
            tenantId: created.id,
            fullName: `${created.firstName} ${created.lastName}`,
            phone: created.phone,
            email: created.email || undefined,
            lineUserId: created.lineUserId || undefined,
            createdBy,
          } as unknown as Json,
          retryCount: 0,
        },
      });
      return created;
    });

    const tenantWithRelations = await prisma.tenant.findUnique({
      where: { id: tenant.id },
      include: {
        roomTenants: {
          where: { moveOutDate: null },
          include: {
            room: true,
          },
        },
      },
    });

    // Publish event
    const payload: TenantCreatedPayload = {
      tenantId: tenant.id,
      fullName: `${tenant.firstName} ${tenant.lastName}`,
      phone: tenant.phone,
      email: tenant.email || undefined,
      lineUserId: tenant.lineUserId || undefined,
      createdBy,
    };

    await this.eventBus.publish(
      EventTypes.TENANT_CREATED,
      'Tenant',
      tenant.id,
      payload as unknown as Record<string, unknown>,
      { userId: createdBy }
    );

    return this.formatTenantResponse(
      tenantWithRelations ?? {
        ...tenant,
        roomTenants: [],
      }
    );
  }

  /**
   * Get tenant by ID
   */
  async getTenantById(id: string): Promise<TenantResponse> {
    const tenant = await prisma.tenant.findUnique({
      where: { id },
      include: {
        roomTenants: {
          where: { moveOutDate: null },
          include: {
            room: true,
          },
        },
      },
    });

    if (!tenant) {
      throw new NotFoundError('Tenant', id);
    }

    return this.formatTenantResponse(tenant);
  }

  /**
   * Get tenant by LINE user ID
   */
  async getTenantByLineUserId(lineUserId: string): Promise<TenantResponse | null> {
    const tenant = await prisma.tenant.findUnique({
      where: { lineUserId },
      include: {
        roomTenants: {
          where: { moveOutDate: null },
          include: {
            room: true,
          },
        },
      },
    });

    if (!tenant) {
      return null;
    }

    return this.formatTenantResponse(tenant);
  }

  /**
   * List tenants with filtering and pagination
   */
  async listTenants(query: ListTenantsQuery): Promise<TenantListResponse> {
    const { roomId, lineUserId, search, page, pageSize, sortBy, sortOrder } = query;

    // Build where clause
    const where: Record<string, unknown> = {};

    if (roomId) {
      where.roomTenants = {
        some: {
          roomNo: roomId,
          moveOutDate: null,
        },
      };
    }

    if (lineUserId) {
      where.lineUserId = lineUserId;
    }

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Get total count
    const total = await prisma.tenant.count({ where });

    // Get tenants with pagination
    const tenants = await prisma.tenant.findMany({
      where,
      include: {
        roomTenants: {
          where: { moveOutDate: null },
          include: {
            room: true,
          },
        },
      },
      orderBy: {
        [sortBy]: sortOrder,
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    return {
      data: tenants.map((tenant) => this.formatTenantResponse(tenant)),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * Update a tenant
   */
  async updateTenant(
    id: string,
    input: UpdateTenantInput,
    updatedBy?: string
  ): Promise<TenantResponse> {
    logger.info({ type: 'tenant_update', id, input: { ...input, phone: input.phone ? '***' : undefined } });

    // Check if tenant exists
    const existingTenant = await prisma.tenant.findUnique({
      where: { id },
    });

    if (!existingTenant) {
      throw new NotFoundError('Tenant', id);
    }

    // Note: LINE account updates are handled via linkLineAccount()

    // Track changes for audit
    const changes: Record<string, { old: unknown; new: unknown }> = {};
    
    const updateData: Record<string, unknown> = {};
    
    if (input.firstName && input.firstName !== existingTenant.firstName) {
      changes.firstName = { old: existingTenant.firstName, new: input.firstName };
      updateData.firstName = input.firstName;
    }
    
    if (input.lastName && input.lastName !== existingTenant.lastName) {
      changes.lastName = { old: existingTenant.lastName, new: input.lastName };
      updateData.lastName = input.lastName;
    }
    
    if (input.phone && input.phone !== existingTenant.phone) {
      changes.phone = { old: existingTenant.phone, new: input.phone };
      updateData.phone = input.phone;
    }
    
    if (input.email !== undefined) {
      const newEmail = input.email || null;
      if (newEmail !== existingTenant.email) {
        changes.email = { old: existingTenant.email, new: newEmail };
        updateData.email = newEmail;
      }
    }
    
    // lineUserId is intentionally not updatable here

    // Update tenant
    const tenant = await prisma.tenant.update({
      where: { id },
      data: updateData,
      include: {
        roomTenants: {
          where: { moveOutDate: null },
          include: {
            room: true,
          },
        },
      },
    });

    // Publish event if there were changes
    if (Object.keys(changes).length > 0) {
      const payload: TenantUpdatedPayload = {
        tenantId: tenant.id,
        fullName: `${tenant.firstName} ${tenant.lastName}`,
        changes,
        updatedBy,
      };

      await this.eventBus.publish(
        EventTypes.TENANT_UPDATED,
        'Tenant',
        tenant.id,
        payload as unknown as Record<string, unknown>,
        { userId: updatedBy }
      );
    }

    return this.formatTenantResponse(tenant);
  }

  /**
   * Assign tenant to a room
   */
  async assignTenantToRoom(
    roomId: string,
    input: AssignTenantInput,
    assignedBy?: string
  ): Promise<RoomTenantResponse> {
    logger.info({ type: 'tenant_assign', roomId, tenantId: input.tenantId, role: input.role });

    // Check if room exists
    const room = await prisma.room.findUnique({
      where: { roomNo: roomId },
      include: {
        tenants: {
          where: { moveOutDate: null },
        },
      },
    });

    if (!room) {
      throw new NotFoundError('Room', roomId);
    }

    // Check if tenant exists
    const tenant = await prisma.tenant.findUnique({
      where: { id: input.tenantId },
    });

    if (!tenant) {
      throw new NotFoundError('Tenant', input.tenantId);
    }

    // Business rule: Only one PRIMARY tenant per room
    if (input.role === 'PRIMARY') {
      const existingPrimary = (room.tenants as Array<{ role: string }>).find(rt => rt.role === 'PRIMARY');
      if (existingPrimary) {
        throw new ConflictError('Room already has a PRIMARY tenant');
      }
    }

    // Check if tenant is already assigned to this room
    const existingAssignment = await prisma.roomTenant.findFirst({
      where: {
        tenantId: input.tenantId,
        roomNo: roomId,
        moveOutDate: null,
      },
    });

    if (existingAssignment) {
      throw new ConflictError('Tenant is already assigned to this room');
    }

    const roomTenant = await prisma.$transaction(async (tx) => {
      const created = await tx.roomTenant.create({
        data: {
          id: uuidv4(),
          roomNo: roomId,
          tenantId: input.tenantId,
          role: input.role,
          moveInDate: new Date(input.moveInDate),
        },
        include: {
          room: true,
        },
      });
      await tx.outboxEvent.create({
        data: {
          id: uuidv4(),
          aggregateType: 'Tenant',
          aggregateId: tenant.id,
          eventType: EventTypes.TENANT_ASSIGNED_TO_ROOM,
          payload: {
            tenantId: tenant.id,
            fullName: `${tenant.firstName} ${tenant.lastName}`,
            roomNo: room.roomNo,
            role: input.role,
            moveInDate: input.moveInDate,
            assignedBy,
          } as unknown as Json,
          retryCount: 0,
        },
      });
      return created;
    });

    // Publish event
    const payload: TenantAssignedToRoomPayload = {
      tenantId: tenant.id,
      fullName: `${tenant.firstName} ${tenant.lastName}`,
      roomNo: room.roomNo,
      role: input.role,
      moveInDate: input.moveInDate,
      assignedBy,
    };

    await this.eventBus.publish(
      EventTypes.TENANT_ASSIGNED_TO_ROOM,
      'Tenant',
      tenant.id,
      payload as unknown as Record<string, unknown>,
      { userId: assignedBy }
    );

    return this.formatRoomTenantResponse(roomTenant);
  }

  /**
   * Remove tenant from a room
   */
  async removeTenantFromRoom(
    roomId: string,
    tenantId: string,
    input: RemoveTenantInput,
    removedBy?: string
  ): Promise<void> {
    logger.info({ type: 'tenant_remove', roomId, tenantId });

    // Check if assignment exists
    const roomTenant = await prisma.roomTenant.findFirst({
      where: {
        roomNo: roomId,
        tenantId,
        moveOutDate: null,
      },
      include: {
        room: true,
        tenant: true,
      },
    });

    if (!roomTenant) {
      throw new NotFoundError('Tenant assignment to room');
    }

    await prisma.$transaction(async (tx) => {
      await tx.roomTenant.update({
        where: { id: roomTenant.id },
        data: {
          moveOutDate: new Date(input.moveOutDate),
        },
      });
      await tx.outboxEvent.create({
        data: {
          id: uuidv4(),
          aggregateType: 'Tenant',
          aggregateId: tenantId,
          eventType: EventTypes.TENANT_REMOVED_FROM_ROOM,
          payload: {
            tenantId: roomTenant.tenant.id,
            fullName: `${roomTenant.tenant.firstName} ${roomTenant.tenant.lastName}`,
            roomNo: roomTenant.room.roomNo,
            role: roomTenant.role,
            moveOutDate: input.moveOutDate,
            removedBy,
          } as unknown as Json,
          retryCount: 0,
        },
      });
    });

    // Publish event
    const payload: TenantRemovedFromRoomPayload = {
      tenantId: roomTenant.tenant.id,
      fullName: `${roomTenant.tenant.firstName} ${roomTenant.tenant.lastName}`,
      roomNo: roomTenant.room.roomNo,
      role: roomTenant.role,
      moveOutDate: input.moveOutDate,
      removedBy,
    };

    await this.eventBus.publish(
      EventTypes.TENANT_REMOVED_FROM_ROOM,
      'Tenant',
      tenantId,
      payload as unknown as Record<string, unknown>,
      { userId: removedBy }
    );
  }

  /**
   * Link LINE account to tenant
   */
  async linkLineAccount(
    tenantId: string,
    input: LinkLineAccountInput,
    linkedBy?: string
  ): Promise<TenantResponse> {
    logger.info({ type: 'tenant_link_line', tenantId, lineUserId: input.lineUserId });

    // Check if tenant exists
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new NotFoundError('Tenant', tenantId);
    }

    // Check if LINE user ID is already linked to another tenant
    const existingWithLine = await prisma.tenant.findUnique({
      where: { lineUserId: input.lineUserId },
    });

    if (existingWithLine && existingWithLine.id !== tenantId) {
      throw new ConflictError('LINE account already linked to another tenant');
    }

    // Update tenant
    const updatedTenant = await prisma.tenant.update({
      where: { id: tenantId },
      data: { lineUserId: input.lineUserId },
      include: {
        roomTenants: {
          where: { moveOutDate: null },
          include: {
            room: true,
          },
        },
      },
    });

    // Publish event
    const payload: TenantLineLinkedPayload = {
      tenantId: updatedTenant.id,
      fullName: `${updatedTenant.firstName} ${updatedTenant.lastName}`,
      lineUserId: input.lineUserId,
      linkedBy,
    };

    await this.eventBus.publish(
      EventTypes.TENANT_LINE_LINKED,
      'Tenant',
      tenantId,
      payload as unknown as Record<string, unknown>,
      { userId: linkedBy }
    );

    return this.formatTenantResponse(updatedTenant);
  }

  /**
   * Get tenants for a room
   */
  async getTenantsByRoom(roomId: string): Promise<TenantResponse[]> {
    const roomTenants = await prisma.roomTenant.findMany({
      where: {
        roomNo: roomId,
        moveOutDate: null,
      },
      include: {
        tenant: {
          include: {
            roomTenants: {
              where: { moveOutDate: null },
              include: {
                room: true,
              },
            },
          },
        },
      },
    });

    return roomTenants.map((rt) => this.formatTenantResponse(rt.tenant));
  }

  /**
   * Format tenant for response
   */
  private formatTenantResponse(
    tenant: {
      id: string;
      firstName: string;
      lastName: string;
      phone: string;
      email: string | null;
      lineUserId: string | null;
      emergencyContact: string | null;
      emergencyPhone: string | null;
      createdAt: Date;
      updatedAt: Date;
      roomTenants: Array<{
        id: string;
        roomNo: string;
        tenantId: string;
        role: string;
        moveInDate: Date;
        moveOutDate: Date | null;
        room?: { roomNo: string };
      }>;
    }
  ): TenantResponse {
    return {
      id: tenant.id,
      firstName: tenant.firstName,
      lastName: tenant.lastName,
      fullName: `${tenant.firstName} ${tenant.lastName}`,
      phone: tenant.phone,
      email: tenant.email,
      lineUserId: tenant.lineUserId,
      emergencyContact: tenant.emergencyContact,
      emergencyPhone: tenant.emergencyPhone,
      createdAt: tenant.createdAt,
      updatedAt: tenant.updatedAt,
      roomTenants: tenant.roomTenants.map((rt) => ({
        id: rt.id,
        roomNo: rt.roomNo,
        tenantId: rt.tenantId,
        role: rt.role as TenantRole,
        moveInDate: rt.moveInDate,
        moveOutDate: rt.moveOutDate,
        room: rt.room
          ? {
              roomNo: rt.room.roomNo,
            }
          : undefined,
      })),
    };
  }

  /**
   * Format room tenant for response
   */
  private formatRoomTenantResponse(
    roomTenant: {
      id: string;
      roomNo: string;
      tenantId: string;
      role: string;
      moveInDate: Date;
      moveOutDate: Date | null;
      room?: { roomNo: string };
    }
  ): RoomTenantResponse {
    return {
      id: roomTenant.id,
      roomNo: roomTenant.roomNo,
      tenantId: roomTenant.tenantId,
      role: roomTenant.role as TenantRole,
      moveInDate: roomTenant.moveInDate,
      moveOutDate: roomTenant.moveOutDate,
      room: roomTenant.room
        ? {
            roomNo: roomTenant.room.roomNo,
          }
        : undefined,
    };
  }
}

// ============================================================================
// Factory
// ============================================================================

let tenantServiceInstance: TenantService | null = null;

export function getTenantService(eventBus?: EventBus): TenantService {
  if (!tenantServiceInstance) {
    tenantServiceInstance = new TenantService(eventBus);
  }
  return tenantServiceInstance;
}

export function createTenantService(eventBus?: EventBus): TenantService {
  return new TenantService(eventBus);
}
