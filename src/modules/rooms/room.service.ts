import { Prisma } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { prisma, EventBus, logger, EventTypes } from '@/lib';
import { ROOM_STATUS, CONTRACT_STATUS } from '@/lib/constants';

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

    // Validate defaultAccountId exists
    if (input.defaultAccountId) {
      const account = await prisma.bankAccount.findFirst({
        where: { id: input.defaultAccountId },
      });
      if (!account) {
        throw new BadRequestError(
          'บัญชีธนาคารที่เลือกไม่ถูกต้อง กรุณาเลือกจากรายการบัญชีที่มีอยู่',
          { field: 'defaultAccountId' }
        );
      }
    }

    // Validate defaultRuleCode exists
    if (input.defaultRuleCode) {
      const rule = await prisma.billingRule.findFirst({
        where: { code: input.defaultRuleCode },
      });
      if (!rule) {
        throw new BadRequestError(
          'รหัสการตั้งค่าค่าเช่าที่เลือกไม่ถูกต้อง กรุณาเลือกจากรายการที่มีอยู่',
          { field: 'defaultRuleCode' }
        );
      }
    }

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
          roomStatus: input.roomStatus ?? ROOM_STATUS.VACANT,
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
      payload,
      { userId: createdBy }
    );

    return this.formatRoomResponse(room);
  }

  // Natural roomNo comparator (handles "798/1", "798/10", "3201" correctly)
  private compareRoomNo(a: string, b: string): number {
    const parseParts = (s: string) => {
      const slashIdx = s.indexOf('/');
      if (slashIdx === -1) return { prefix: parseInt(s, 10), suffix: 0 };
      return { prefix: parseInt(s.substring(0, slashIdx), 10), suffix: parseInt(s.substring(slashIdx + 1), 10) };
    };
    const aP = parseParts(a);
    const bP = parseParts(b);
    if (aP.prefix !== bP.prefix) return aP.prefix - bP.prefix;
    return aP.suffix - bP.suffix;
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
      if (g.roomStatus === ROOM_STATUS.VACANT || g.roomStatus === ROOM_STATUS.OCCUPIED || g.roomStatus === ROOM_STATUS.MAINTENANCE || g.roomStatus === ROOM_STATUS.OWNER_USE) {
        statusCounts[g.roomStatus] = g._count.roomStatus;
      }
    }

    // Get rooms with pagination
    const isRoomNoSort = sortBy === 'roomNo';
    const rooms = await prisma.room.findMany({
      where,
      orderBy: isRoomNoSort ? { roomNo: 'asc' } : { [sortBy]: sortOrder },
      skip: isRoomNoSort ? 0 : (page - 1) * pageSize,
      take: isRoomNoSort ? 1000 : pageSize,
    });

    // Natural roomNo sort: floor first, then natural roomNo within each floor
    let sortedRooms = rooms;
    if (isRoomNoSort) {
      sortedRooms = sortOrder === 'desc'
        ? [...rooms].sort((a, b) => {
            if (a.floorNo !== b.floorNo) return b.floorNo - a.floorNo;
            return this.compareRoomNo(b.roomNo, a.roomNo);
          })
        : [...rooms].sort((a, b) => {
            if (a.floorNo !== b.floorNo) return a.floorNo - b.floorNo;
            return this.compareRoomNo(a.roomNo, b.roomNo);
          });
    }

    const pagedRooms = isRoomNoSort ? sortedRooms.slice((page - 1) * pageSize, page * pageSize) : sortedRooms;

    return {
      data: pagedRooms.map((room) => this.formatRoomResponse(room)),
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

    // Validate defaultAccountId exists (on create or update with new value)
    if (input.defaultAccountId && input.defaultAccountId !== existingRoom.defaultAccountId) {
      const account = await prisma.bankAccount.findFirst({
        where: { id: input.defaultAccountId },
      });
      if (!account) {
        throw new BadRequestError(
          'บัญชีธนาคารไม่พบในระบบ กรุณาเลือกบัญชีจากรายการ',
          { field: 'defaultAccountId' }
        );
      }
    }

    // Validate defaultRuleCode exists (on create or update with new value)
    if (input.defaultRuleCode && input.defaultRuleCode !== existingRoom.defaultRuleCode) {
      const rule = await prisma.billingRule.findFirst({
        where: { code: input.defaultRuleCode },
      });
      if (!rule) {
        throw new BadRequestError(
          'รหัสการตั้งค่าค่าเช่าไม่พบในระบบ กรุณาเลือกจากรายการ',
          { field: 'defaultRuleCode' }
        );
      }
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
    if (input.roomStatus === ROOM_STATUS.VACANT) {
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

    // Guard: cannot set room to MAINTENANCE or OWNER_USE via update if it has unpaid invoices
    // (must use changeRoomStatus which has additional guards including the maintenance-ticket gate)
    if (
      (input.roomStatus === ROOM_STATUS.MAINTENANCE || input.roomStatus === ROOM_STATUS.OWNER_USE) &&
      existingRoom.roomStatus === ROOM_STATUS.OCCUPIED
    ) {
      const unpaidInvoices = await prisma.invoice.findMany({
        where: {
          roomNo,
          status: { in: ['GENERATED', 'SENT', 'VIEWED', 'OVERDUE'] },
        },
      });
      if (unpaidInvoices.length > 0) {
        throw new BadRequestError(
          `ไม่สามารถเปลี่ยนสถานะเป็นไม่ใช้งานได้: ห้องมีใบแจ้งหนี้ที่ยังไม่ชำระ ${unpaidInvoices.length} รายการ กรุณาชำระหนี้ก่อนหรือใช้งานการย้ายออก`
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
          ...(input.lineUserId !== undefined && { lineUserId: input.lineUserId }),
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
        payload,
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
    if (input.roomStatus === ROOM_STATUS.VACANT) {
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
      // Guard: MAINTENANCE requires an open maintenance ticket.
      // Prevents a dishonest staff member from marking a room "under maintenance"
      // to secretly rent it out for cash (Ghost Booking attack).
      if (input.roomStatus === ROOM_STATUS.MAINTENANCE) {
        const hasOpenTicket = await tx.maintenanceTicket.findFirst({
          where: {
            roomNo,
            status: { in: ['OPEN', 'IN_PROGRESS'] },
          },
        });
        if (!hasOpenTicket) {
          throw new BadRequestError(
            'ไม่สามารถตั้งเป็นซ่อมบำรุงได้: ต้องมีรายการแจ้งซ่อมที่เปิดอยู่ก่อน'
          );
        }
      }

      // Guard: MAINTENANCE or OWNER_USE → check for unpaid invoices
      if (input.roomStatus === ROOM_STATUS.MAINTENANCE || input.roomStatus === ROOM_STATUS.OWNER_USE) {
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
      payload,
      { userId: changedBy }
    );

    return this.formatRoomResponse(room);
  }

  /**
   * Delete a room and all related records atomically.
   * Related invoices, billing records, and maintenance tickets are permanently
   * removed — this is an irreversible hard delete (not a soft status change).
   */
  async deleteRoom(roomNo: string): Promise<void> {
    // Check if room exists
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

    // Guard: room must have no active tenants
    if (room.tenants.length > 0) {
      throw new ConflictError(
        `Cannot delete room with ${room.tenants.length} active tenant(s)`
      );
    }

    // Guard: room must have no active contracts
    const activeContract = await prisma.contract.findFirst({
      where: {
        roomNo,
        status: CONTRACT_STATUS.ACTIVE,
      },
    });

    if (activeContract) {
      throw new ConflictError('Cannot delete room with active contract');
    }

    // Atomic delete: remove all related records in the correct dependency order
    await prisma.$transaction(async (tx) => {
      // 1. Maintenance tickets (no cascade from Room, must delete explicitly)
      await tx.maintenanceTicket.deleteMany({ where: { roomNo } });

      // 2. Room billings cascade to invoices (invoice has onDelete: Cascade on roomBillingId)
      await tx.roomBilling.deleteMany({ where: { roomNo } });

      // 3. Delete the room itself
      await tx.room.delete({ where: { roomNo } });
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
      prisma.room.count({ where: { ...where, roomStatus: ROOM_STATUS.VACANT } }),
      prisma.room.count({ where: { ...where, roomStatus: ROOM_STATUS.OCCUPIED } }),
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

    return [...rooms].sort((a, b) => this.compareRoomNo(a.roomNo, b.roomNo)).map((room) => this.formatRoomResponse(room));
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
