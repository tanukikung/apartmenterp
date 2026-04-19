import { Prisma } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { prisma, EventBus, logger, EventTypes } from '@/lib';

import {
  CreateRoomInput,
  UpdateRoomInput,
  ChangeRoomStatusInput,
  ListRoomsQuery,
  RoomResponse,
  RoomListResponse,
  RoomStatusCounts,
  RoomCreatedPayload,
  RoomUpdatedPayload,
  RoomStatusChangedPayload,
} from './types';
import type { RoomStatus } from './types';
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

    // Check if room number already exists
    const existingRoom = await prisma.room.findUnique({
      where: { roomNo: input.roomNo },
    });

    if (existingRoom) {
      throw new ConflictError(`Room ${input.roomNo} already exists`);
    }

    const room = await prisma.$transaction(async (tx) => {
      const created = await tx.room.create({
        data: {
          roomNo: input.roomNo,
          floorNo: input.floorNo,
          defaultAccountId: input.defaultAccountId,
          defaultRuleCode: input.defaultRuleCode,
          defaultRentAmount: input.defaultRentAmount,
          hasFurniture: input.hasFurniture ?? false,
          defaultFurnitureAmount: input.defaultFurnitureAmount ?? 0,
          roomStatus: input.roomStatus ?? 'VACANT',
          lineUserId: input.lineUserId,
        },
      });
      await tx.outboxEvent.create({
        data: {
          id: uuidv4(),
          aggregateType: 'Room',
          aggregateId: created.roomNo,
          eventType: EventTypes.ROOM_CREATED,
          payload: {
            roomNo: created.roomNo,
            floorNo: created.floorNo,
            defaultAccountId: created.defaultAccountId,
            defaultRuleCode: created.defaultRuleCode,
            createdBy,
          },
          retryCount: 0,
        },
      });
      return created;
    });

    // Publish event
    const payload: RoomCreatedPayload = {
      roomNo: room.roomNo,
      floorNo: room.floorNo,
      defaultAccountId: room.defaultAccountId,
      defaultRuleCode: room.defaultRuleCode,
      createdBy,
    };

    await this.eventBus.publish(
      EventTypes.ROOM_CREATED,
      'Room',
      room.roomNo,
      payload as any,
      { userId: createdBy }
    );

    return this.formatRoomResponse(room);
  }

  /**
   * Get room by roomNo
   */
  async getRoomById(roomNo: string): Promise<RoomResponse> {
    const room = await prisma.room.findUnique({
      where: { roomNo },
    });

    if (!room) {
      throw new NotFoundError('Room', roomNo);
    }

    return this.formatRoomResponse(room);
  }

  /**
   * Get room by room number (alias for getRoomById since roomNo is the PK)
   */
  async getRoomByNumber(roomNo: string): Promise<RoomResponse | null> {
    const room = await prisma.room.findUnique({
      where: { roomNo },
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
    const { floorNo, roomStatus, page, pageSize, search, q, sortBy, sortOrder } = query;

    // Build where clause
    const where: Record<string, unknown> = {};

    if (floorNo) {
      where.floorNo = floorNo;
    }

    if (roomStatus) {
      where.roomStatus = roomStatus;
    }

    if (search) {
      where.roomNo = {
        contains: search,
        mode: 'insensitive',
      };
    }

    // Free-text search: roomNo OR active tenant first/last name.
    if (q) {
      const trimmed = q.trim();
      where.OR = [
        { roomNo: { contains: trimmed, mode: 'insensitive' } },
        {
          tenants: {
            some: {
              moveOutDate: null,
              tenant: {
                OR: [
                  { firstName: { contains: trimmed, mode: 'insensitive' } },
                  { lastName: { contains: trimmed, mode: 'insensitive' } },
                ],
              },
            },
          },
        },
      ];
    }

    // Get total count
    const total = await prisma.room.count({ where });

    // Compute global status counts
    const statusGroups = await prisma.room.groupBy({
      by: ['roomStatus'],
      _count: { roomStatus: true },
    });
    const statusCounts: RoomStatusCounts = { VACANT: 0, OCCUPIED: 0, MAINTENANCE: 0, OWNER_USE: 0 };
    for (const g of statusGroups) {
      if (g.roomStatus === 'VACANT' || g.roomStatus === 'OCCUPIED' || g.roomStatus === 'MAINTENANCE' || g.roomStatus === 'OWNER_USE') {
        statusCounts[g.roomStatus] = g._count.roomStatus;
      }
    }

    // Get rooms with pagination
    const rooms = await prisma.room.findMany({
      where,
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
      statusCounts,
    };
  }

  /**
   * Update a room
   */
  async updateRoom(
    roomNo: string,
    input: UpdateRoomInput,
    updatedBy?: string
  ): Promise<RoomResponse> {
    logger.info({ type: 'room_update', roomNo, input });

    // Check if room exists
    const existingRoom = await prisma.room.findUnique({
      where: { roomNo },
    });

    if (!existingRoom) {
      throw new NotFoundError('Room', roomNo);
    }

    // Track changes for audit
    const changes: Record<string, { old: unknown; new: unknown }> = {};

    if (input.floorNo !== undefined && input.floorNo !== existingRoom.floorNo) {
      changes.floorNo = { old: existingRoom.floorNo, new: input.floorNo };
    }
    if (input.defaultRentAmount !== undefined && Number(input.defaultRentAmount) !== Number(existingRoom.defaultRentAmount)) {
      changes.defaultRentAmount = { old: Number(existingRoom.defaultRentAmount), new: input.defaultRentAmount };
    }

    // Guard: cannot set room to VACANT via update if it has any active tenants
    if (input.roomStatus === 'VACANT') {
      const activeTenants = await prisma.roomTenant.findMany({
        where: {
          roomNo,
          moveOutDate: null,
        },
      });
      if (activeTenants.length > 0) {
        throw new ConflictError(
          'ไม่สามารถตั้งค่าห้องเป็นว่างได้: ห้องมีผู้เช่าที่ยังอยู่อาศัย กรุณาใช้การย้ายออกแทน'
        );
      }
    }

    const room = await prisma.$transaction(async (tx) => {
      const updated = await tx.room.update({
        where: { roomNo },
        data: {
          floorNo: input.floorNo,
          defaultAccountId: input.defaultAccountId,
          defaultRuleCode: input.defaultRuleCode,
          defaultRentAmount: input.defaultRentAmount,
          hasFurniture: input.hasFurniture,
          defaultFurnitureAmount: input.defaultFurnitureAmount,
          roomStatus: input.roomStatus,
          lineUserId: input.lineUserId,
        },
      });
      if (Object.keys(changes).length > 0) {
        await tx.outboxEvent.create({
          data: {
            id: uuidv4(),
            aggregateType: 'Room',
            aggregateId: updated.roomNo,
            eventType: EventTypes.ROOM_UPDATED,
            payload: {
              roomNo: updated.roomNo,
              changes,
              updatedBy,
            } as Prisma.InputJsonValue,
            retryCount: 0,
          },
        });
      }
      return updated;
    });

    // Publish event if there were changes
    if (Object.keys(changes).length > 0) {
      const payload: RoomUpdatedPayload = {
        roomNo: room.roomNo,
        changes,
        updatedBy,
      };

      await this.eventBus.publish(
        EventTypes.ROOM_UPDATED,
        'Room',
        room.roomNo,
        payload as any,
        { userId: updatedBy }
      );
    }

    return this.formatRoomResponse(room);
  }

  /**
   * Change room status
   */
  async changeRoomStatus(
    roomNo: string,
    input: ChangeRoomStatusInput,
    changedBy?: string
  ): Promise<RoomResponse> {
    logger.info({ type: 'room_status_change', roomNo, input });

    // Check if room exists
    const existingRoom = await prisma.room.findUnique({
      where: { roomNo },
    });

    if (!existingRoom) {
      throw new NotFoundError('Room', roomNo);
    }

    // Don't allow status change if no actual change
    if (existingRoom.roomStatus === input.roomStatus) {
      throw new BadRequestError('Room is already in this status');
    }

    // Guard: cannot set room to VACANT if it has any active tenants
    if (input.roomStatus === 'VACANT') {
      const activeTenants = await prisma.roomTenant.findMany({
        where: {
          roomNo,
          moveOutDate: null,
        },
      });
      if (activeTenants.length > 0) {
        throw new ConflictError(
          'ไม่สามารถตั้งค่าห้องเป็นว่างได้: ห้องมีผู้เช่าที่ยังอยู่อาศัย กรุณาใช้การย้ายออกแทน'
        );
      }
    }

    const room = await prisma.$transaction(async (tx) => {
      // Guard: if going to MAINTENANCE or OWNER_USE (taken out of available pool),
      // block if the room has any unpaid invoices
      if (input.roomStatus === 'MAINTENANCE' || input.roomStatus === 'OWNER_USE') {
        const unpaidInvoices = await tx.invoice.findMany({
          where: {
            roomNo,
            status: { in: ['GENERATED', 'SENT', 'VIEWED', 'OVERDUE'] },
          },
        });
        if (unpaidInvoices.length > 0) {
          throw new BadRequestError(
            `ไม่สามารถเปลี่ยนสถานะเป็นไม่ใช้งานได้: ห้องมีใบแจ้งหนี้ที่ยังไม่ชำระ ${unpaidInvoices.length} รายการ`
          );
        }
      }

      const updated = await tx.room.update({
        where: { roomNo },
        data: {
          roomStatus: input.roomStatus,
        },
      });
      await tx.outboxEvent.create({
        data: {
          id: uuidv4(),
          aggregateType: 'Room',
          aggregateId: updated.roomNo,
          eventType: EventTypes.ROOM_STATUS_CHANGED,
          payload: {
            roomNo: updated.roomNo,
            previousStatus: existingRoom.roomStatus,
            newStatus: input.roomStatus,
            reason: input.reason,
            changedBy,
          },
          retryCount: 0,
        },
      });
      return updated;
    });

    // Publish event
    const payload: RoomStatusChangedPayload = {
      roomNo: room.roomNo,
      previousStatus: existingRoom.roomStatus as RoomStatus,
      newStatus: input.roomStatus,
      reason: input.reason,
      changedBy,
    };

    await this.eventBus.publish(
      EventTypes.ROOM_STATUS_CHANGED,
      'Room',
      room.roomNo,
      payload as any,
      { userId: changedBy }
    );

    return this.formatRoomResponse(room);
  }

  /**
   * Delete a room (prevent if occupied/has active tenants)
   */
  async deleteRoom(roomNo: string): Promise<void> {
    const room = await prisma.room.findUnique({
      where: { roomNo },
      include: {
        tenants: {
          where: {
            moveOutDate: null,
          },
        },
      },
    });

    if (!room) {
      throw new NotFoundError('Room', roomNo);
    }

    // Check if room has active tenants
    if (room.tenants.length > 0) {
      throw new ConflictError(
        `Cannot delete room with ${room.tenants.length} active tenant(s)`
      );
    }

    // Check if room has active contracts
    const activeContract = await prisma.contract.findFirst({
      where: {
        roomNo,
        status: 'ACTIVE',
      },
    });

    if (activeContract) {
      throw new ConflictError('Cannot delete room with active contract');
    }

    await prisma.room.delete({
      where: { roomNo },
    });

    logger.info({ type: 'room_deleted', roomNo });
  }

  /**
   * Get room statistics
   */
  async getRoomStats(floorNo?: number): Promise<{
    total: number;
    vacant: number;
    occupied: number;
    occupancyRate: number;
  }> {
    const where: Record<string, unknown> = floorNo ? { floorNo } : {};

    const [total, vacant, occupied] = await Promise.all([
      prisma.room.count({ where }),
      prisma.room.count({ where: { ...where, roomStatus: 'VACANT' } }),
      prisma.room.count({ where: { ...where, roomStatus: 'OCCUPIED' } }),
    ]);

    return {
      total,
      vacant,
      occupied,
      occupancyRate: total > 0 ? (occupied / total) * 100 : 0,
    };
  }

  /**
   * Get rooms by floor
   */
  async getRoomsByFloor(floorNo: number): Promise<RoomResponse[]> {
    const rooms = await prisma.room.findMany({
      where: { floorNo },
      orderBy: { roomNo: 'asc' },
    });

    return rooms.map((room) => this.formatRoomResponse(room));
  }

  /**
   * Format room for response
   */
  private formatRoomResponse(
    room: {
      roomNo: string;
      floorNo: number;
      defaultAccountId: string;
      defaultRuleCode: string;
      defaultRentAmount: unknown;
      hasFurniture: boolean;
      defaultFurnitureAmount: unknown;
      roomStatus: string;
      lineUserId?: string | null;
    }
  ): RoomResponse {
    return {
      roomNo: room.roomNo,
      roomNumber: room.roomNo,
      floorNo: room.floorNo,
      defaultAccountId: room.defaultAccountId,
      defaultRuleCode: room.defaultRuleCode,
      defaultRentAmount: Number(room.defaultRentAmount),
      hasFurniture: room.hasFurniture,
      defaultFurnitureAmount: Number(room.defaultFurnitureAmount),
      roomStatus: room.roomStatus as RoomStatus,
      lineUserId: room.lineUserId ?? null,
    };
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createRoomService(eventBus?: EventBus): RoomService {
  return new RoomService(eventBus);
}
