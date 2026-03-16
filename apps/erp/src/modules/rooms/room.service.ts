import { v4 as uuidv4 } from 'uuid';
import { prisma, EventBus, logger, EventTypes } from '@/lib';
import { Json } from '@/types/prisma-json';
import {
  CreateRoomInput,
  UpdateRoomInput,
  ChangeRoomStatusInput,
  ListRoomsQuery,
  RoomResponse,
  RoomListResponse,
  RoomCreatedPayload,
  RoomUpdatedPayload,
  RoomStatusChangedPayload,
} from './types';
import type { RoomStatus, RoomUsageType, RoomBillingStatus } from './types';
import {
  NotFoundError,
  ConflictError,
  BadRequestError,
} from '@/lib/utils/errors';

// ============================================================================
// Room Service
// ============================================================================

export class RoomService {
  private eventBus: EventBus;

  constructor(eventBus?: EventBus) {
    this.eventBus = eventBus || EventBus.getInstance();
  }

  /**
   * Create a new room
   */
  async createRoom(
    input: CreateRoomInput,
    createdBy?: string
  ): Promise<RoomResponse> {
    logger.info({ type: 'room_create', input });

    // Check if floor exists
    const floor = await prisma.floor.findUnique({
      where: { id: input.floorId },
      include: { building: true },
    });

    if (!floor) {
      throw new NotFoundError('Floor', input.floorId);
    }

    // Check if room number already exists on this floor
    const existingRoom = await prisma.room.findUnique({
      where: {
        floorId_roomNumber: {
          floorId: input.floorId,
          roomNumber: input.roomNumber,
        },
      },
    });

    if (existingRoom) {
      throw new ConflictError(
        `Room ${input.roomNumber} already exists on this floor`
      );
    }

    const room = await prisma.$transaction(async (tx) => {
      const created = await tx.room.create({
        data: {
          id: uuidv4(),
          floorId: input.floorId,
          roomNumber: input.roomNumber,
          status: input.status,
          maxResidents: input.capacity,
          usageType: input.usageType ?? 'RENTAL',
          billingStatus: input.billingStatus ?? 'BILLABLE',
          defaultFurnitureFee: input.defaultFurnitureFee,
          sortOrder: input.sortOrder,
          note: input.note,
          isActive: input.isActive ?? true,
        },
        include: {
          floor: {
            include: { building: true },
          },
        },
      });
      await tx.outboxEvent.create({
        data: {
          id: uuidv4(),
          aggregateType: 'Room',
          aggregateId: created.id,
          eventType: EventTypes.ROOM_CREATED,
          payload: {
            roomId: created.id,
            roomNumber: created.roomNumber,
            floorId: created.floorId,
            floorNumber: floor.floorNumber,
            buildingId: floor.buildingId,
            capacity: created.maxResidents,
            createdBy,
          } as unknown as Json,
          retryCount: 0,
        },
      });
      return created;
    });

    // Publish event
    const payload: RoomCreatedPayload = {
      roomId: room.id,
      roomNumber: room.roomNumber,
      floorId: room.floorId,
      floorNumber: floor.floorNumber,
      buildingId: floor.buildingId,
      capacity: room.maxResidents,
      createdBy,
    };

    await this.eventBus.publish(
      EventTypes.ROOM_CREATED,
      'Room',
      room.id,
      payload as unknown as Record<string, unknown>,
      { userId: createdBy }
    );

    return this.formatRoomResponse(room);
  }

  /**
   * Get room by ID
   */
  async getRoomById(id: string): Promise<RoomResponse> {
    const room = await prisma.room.findUnique({
      where: { id },
      include: {
        floor: {
          include: { building: true },
        },
      },
    });

    if (!room) {
      throw new NotFoundError('Room', id);
    }

    return this.formatRoomResponse(room);
  }

  /**
   * Get room by room number
   */
  async getRoomByNumber(roomNumber: string): Promise<RoomResponse | null> {
    const room = await prisma.room.findFirst({
      where: { roomNumber },
      include: {
        floor: {
          include: { building: true },
        },
      },
    });

    if (!room) {
      return null;
    }

    return this.formatRoomResponse(room);
  }

  /**
   * List rooms with filtering and pagination
   */
  async listRooms(query: ListRoomsQuery): Promise<RoomListResponse> {
    const { floorId, status, page, pageSize, search, sortBy, sortOrder } = query;

    // Build where clause
    const where: Record<string, unknown> = {};

    if (floorId) {
      where.floorId = floorId;
    }

    if (status) {
      where.status = status;
    }

    if (query.usageType) {
      where.usageType = query.usageType;
    }
    if (query.billingStatus) {
      where.billingStatus = query.billingStatus;
    }
    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }

    if (search) {
      where.roomNumber = {
        contains: search,
        mode: 'insensitive',
      };
    }

    // Get total count
    const total = await prisma.room.count({ where });

    // Get rooms with pagination
    const rooms = await prisma.room.findMany({
      where,
      include: {
        floor: {
          include: { building: true },
        },
      },
      orderBy: {
        [sortBy]: sortOrder,
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    return {
      data: rooms.map((room) => this.formatRoomResponse(room)),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * Update a room
   */
  async updateRoom(
    id: string,
    input: UpdateRoomInput,
    updatedBy?: string
  ): Promise<RoomResponse> {
    logger.info({ type: 'room_update', id, input });

    // Check if room exists
    const existingRoom = await prisma.room.findUnique({
      where: { id },
    });

    if (!existingRoom) {
      throw new NotFoundError('Room', id);
    }

    // Check for duplicate room number if being changed
    if (input.roomNumber && input.roomNumber !== existingRoom.roomNumber) {
      const duplicate = await prisma.room.findUnique({
        where: {
          floorId_roomNumber: {
            floorId: existingRoom.floorId,
            roomNumber: input.roomNumber,
          },
        },
      });

      if (duplicate) {
        throw new ConflictError(
          `Room ${input.roomNumber} already exists on this floor`
        );
      }
    }

    // Track changes for audit
    const changes: Record<string, { old: unknown; new: unknown }> = {};
    
    if (input.roomNumber && input.roomNumber !== existingRoom.roomNumber) {
      changes.roomNumber = {
        old: existingRoom.roomNumber,
        new: input.roomNumber,
      };
    }
    
    if (input.capacity && input.capacity !== existingRoom.maxResidents) {
      changes.capacity = {
        old: existingRoom.maxResidents,
        new: input.capacity,
      };
    }

    const room = await prisma.$transaction(async (tx) => {
      const updated = await tx.room.update({
        where: { id },
        data: {
          roomNumber: input.roomNumber,
          maxResidents: input.capacity,
          usageType: input.usageType,
          billingStatus: input.billingStatus,
          defaultFurnitureFee: input.defaultFurnitureFee,
          sortOrder: input.sortOrder,
          note: input.note,
          isActive: input.isActive,
        },
        include: {
          floor: {
            include: { building: true },
          },
        },
      });
      if (Object.keys(changes).length > 0) {
        await tx.outboxEvent.create({
          data: {
            id: uuidv4(),
            aggregateType: 'Room',
            aggregateId: updated.id,
            eventType: EventTypes.ROOM_UPDATED,
            payload: {
              roomId: updated.id,
              roomNumber: updated.roomNumber,
              changes,
              updatedBy,
            } as unknown as Json,
            retryCount: 0,
          },
        });
      }
      return updated;
    });

    // Publish event if there were changes
    if (Object.keys(changes).length > 0) {
      const payload: RoomUpdatedPayload = {
        roomId: room.id,
        roomNumber: room.roomNumber,
        changes,
        updatedBy,
      };

    await this.eventBus.publish(
        EventTypes.ROOM_UPDATED,
        'Room',
        room.id,
      payload as unknown as Record<string, unknown>,
        { userId: updatedBy }
      );
    }

    return this.formatRoomResponse(room);
  }

  /**
   * Change room status
   */
  async changeRoomStatus(
    id: string,
    input: ChangeRoomStatusInput,
    changedBy?: string
  ): Promise<RoomResponse> {
    logger.info({ type: 'room_status_change', id, input });

    // Check if room exists
    const existingRoom = await prisma.room.findUnique({
      where: { id },
    });

    if (!existingRoom) {
      throw new NotFoundError('Room', id);
    }

    // Don't allow status change if no actual change
    if (existingRoom.status === input.status) {
      throw new BadRequestError('Room is already in this status');
    }

    // Business rule: Cannot change to OCCUPIED if capacity is 0
    if (input.status === 'OCCUPIED' && existingRoom.maxResidents === 0) {
      throw new BadRequestError('Cannot set room to occupied - capacity is 0');
    }

    const room = await prisma.$transaction(async (tx) => {
      const updated = await tx.room.update({
        where: { id },
        data: {
          status: input.status,
        },
        include: {
          floor: {
            include: { building: true },
          },
        },
      });
      await tx.outboxEvent.create({
        data: {
          id: uuidv4(),
          aggregateType: 'Room',
          aggregateId: updated.id,
          eventType: EventTypes.ROOM_STATUS_CHANGED,
          payload: {
            roomId: updated.id,
            roomNumber: updated.roomNumber,
            previousStatus: existingRoom.status,
            newStatus: input.status,
            reason: input.reason,
            changedBy,
          } as unknown as Json,
          retryCount: 0,
        },
      });
      return updated;
    });

    // Publish event
    const payload: RoomStatusChangedPayload = {
      roomId: room.id,
      roomNumber: room.roomNumber,
      previousStatus: existingRoom.status,
      newStatus: input.status,
      reason: input.reason,
      changedBy,
    };

    await this.eventBus.publish(
      EventTypes.ROOM_STATUS_CHANGED,
      'Room',
      room.id,
      payload as unknown as Record<string, unknown>,
      { userId: changedBy }
    );

    return this.formatRoomResponse(room);
  }

  /**
   * Delete a room (soft delete check - prevent if occupied)
   */
  async deleteRoom(id: string): Promise<void> {
    const room = await prisma.room.findUnique({
      where: { id },
      include: {
        roomTenants: {
          where: {
            moveOutDate: null,
          },
        },
      },
    });

    if (!room) {
      throw new NotFoundError('Room', id);
    }

    // Check if room has active tenants
    if (room.roomTenants.length > 0) {
      throw new ConflictError(
        `Cannot delete room with ${room.roomTenants.length} active tenant(s)`
      );
    }

    // Check if room has active contracts
    const activeContract = await prisma.contract.findFirst({
      where: {
        roomId: id,
        status: 'ACTIVE',
      },
    });

    if (activeContract) {
      throw new ConflictError('Cannot delete room with active contract');
    }

    await prisma.room.delete({
      where: { id },
    });

    logger.info({ type: 'room_deleted', id });
  }

  /**
   * Get room statistics
   */
  async getRoomStats(floorId?: string): Promise<{
    total: number;
    vacant: number;
    occupied: number;
    maintenance: number;
    occupancyRate: number;
  }> {
    const where: Record<string, unknown> = floorId ? { floorId } : {};

    const [total, vacant, occupied, maintenance] = await Promise.all([
      prisma.room.count({ where }),
      prisma.room.count({ where: { ...where, status: 'VACANT' } }),
      prisma.room.count({ where: { ...where, status: 'OCCUPIED' } }),
      prisma.room.count({ where: { ...where, status: 'MAINTENANCE' } }),
    ]);

    return {
      total,
      vacant,
      occupied,
      maintenance,
      occupancyRate: total > 0 ? (occupied / total) * 100 : 0,
    };
  }

  /**
   * Get rooms by floor
   */
  async getRoomsByFloor(floorId: string): Promise<RoomResponse[]> {
    const rooms = await prisma.room.findMany({
      where: { floorId },
      include: {
        floor: {
          include: { building: true },
        },
      },
      orderBy: { roomNumber: 'asc' },
    });

    return rooms.map((room) => this.formatRoomResponse(room));
  }

  /**
   * Format room for response
   */
  private formatRoomResponse(
    room: {
      id: string;
      floorId: string;
      roomNumber: string;
      status: string;
      maxResidents: number;
      usageType?: string;
      billingStatus?: string;
      defaultFurnitureFee?: unknown;
      sortOrder?: number | null;
      note?: string | null;
      isActive?: boolean;
      createdAt: Date;
      updatedAt: Date;
      floor?: {
        id: string;
        floorNumber: number;
        buildingId: string;
      };
    }
  ): RoomResponse {
    return {
      id: room.id,
      floorId: room.floorId,
      roomNumber: room.roomNumber,
      status: room.status as RoomStatus,
      capacity: room.maxResidents,
      usageType: (room.usageType as RoomUsageType) ?? 'RENTAL',
      billingStatus: (room.billingStatus as RoomBillingStatus) ?? 'BILLABLE',
      defaultFurnitureFee: room.defaultFurnitureFee != null ? Number(room.defaultFurnitureFee) : null,
      sortOrder: room.sortOrder ?? null,
      note: room.note ?? null,
      isActive: room.isActive ?? true,
      createdAt: room.createdAt,
      updatedAt: room.updatedAt,
      floor: room.floor
        ? {
            id: room.floor.id,
            floorNumber: room.floor.floorNumber,
            buildingId: room.floor.buildingId,
          }
        : undefined,
    };
  }
}

// ============================================================================
// Factory
// ============================================================================

let roomServiceInstance: RoomService | null = null;

export function getRoomService(eventBus?: EventBus): RoomService {
  if (!roomServiceInstance) {
    roomServiceInstance = new RoomService(eventBus);
  }
  return roomServiceInstance;
}

export function createRoomService(eventBus?: EventBus): RoomService {
  return new RoomService(eventBus);
}
