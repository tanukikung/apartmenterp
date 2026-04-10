import { v4 as uuidv4 } from 'uuid';
import { prisma, logger } from '@/lib';
import type { Json } from '@/types/prisma-json';
import type { MoveOutStatus, MoveOutItemCondition } from './types';
import {
  CreateMoveOutInput,
  UpdateMoveOutInput,
  CreateMoveOutItemInput,
  UpdateMoveOutItemInput,
  CalculateDepositInput,
  ConfirmMoveOutInput,
  MarkRefundInput,
  ListMoveOutsQuery,
  MoveOutResponse,
  MoveOutListResponse,
  MoveOutItemResponse,
} from './types';
import { NotFoundError, BadRequestError, ConflictError } from '@/lib/utils/errors';

// ============================================================================
// MoveOut Service
// ============================================================================

export class MoveOutService {
  /**
   * Create a new move-out record
   */
  async createMoveOut(input: CreateMoveOutInput, createdBy?: string): Promise<MoveOutResponse> {
    logger.info({ type: 'moveout_create', contractId: input.contractId });

    // Check if contract exists
    const contract = await prisma.contract.findUnique({
      where: { id: input.contractId },
      include: {
        primaryTenant: true,
        room: true,
      },
    });

    if (!contract) {
      throw new NotFoundError('Contract', input.contractId);
    }

    if (contract.status !== 'ACTIVE') {
      throw new BadRequestError('Can only create move-out for active contracts');
    }

    // Check if move-out already exists for this contract
    const existingMoveOut = await prisma.moveOut.findUnique({
      where: { contractId: input.contractId },
    });

    if (existingMoveOut) {
      throw new ConflictError('Move-out record already exists for this contract');
    }

    const moveOut = await prisma.moveOut.create({
      data: {
        id: uuidv4(),
        contractId: input.contractId,
        moveOutDate: new Date(input.moveOutDate),
        depositAmount: contract.deposit || 0,
        notes: input.notes,
        status: 'PENDING',
      },
      include: {
        contract: {
          include: {
            primaryTenant: true,
            room: true,
          },
        },
        items: true,
      },
    });

    // Update contract status to TERMINATED
    await prisma.contract.update({
      where: { id: input.contractId },
      data: {
        status: 'TERMINATED',
        terminationDate: new Date(input.moveOutDate),
      },
    });

    // Update room status to VACANT
    await prisma.room.update({
      where: { roomNo: contract.roomNo },
      data: { roomStatus: 'VACANT' },
    });

    // Update room tenant move-out date
    await prisma.roomTenant.updateMany({
      where: {
        roomNo: contract.roomNo,
        tenantId: contract.primaryTenantId,
        moveOutDate: null,
      },
      data: {
        moveOutDate: new Date(input.moveOutDate),
      },
    });

    logger.info({
      type: 'moveout_created',
      moveOutId: moveOut.id,
      contractId: input.contractId,
      roomNo: contract.roomNo,
    });

    return this.formatMoveOutResponse(moveOut);
  }

  /**
   * Get move-out by ID
   */
  async getMoveOutById(id: string): Promise<MoveOutResponse> {
    const moveOut = await prisma.moveOut.findUnique({
      where: { id },
      include: {
        contract: {
          include: {
            primaryTenant: true,
            room: true,
          },
        },
        items: true,
      },
    });

    if (!moveOut) {
      throw new NotFoundError('MoveOut', id);
    }

    return this.formatMoveOutResponse(moveOut);
  }

  /**
   * Get move-out by contract ID
   */
  async getMoveOutByContractId(contractId: string): Promise<MoveOutResponse | null> {
    const moveOut = await prisma.moveOut.findUnique({
      where: { contractId },
      include: {
        contract: {
          include: {
            primaryTenant: true,
            room: true,
          },
        },
        items: true,
      },
    });

    if (!moveOut) {
      return null;
    }

    return this.formatMoveOutResponse(moveOut);
  }

  /**
   * List move-outs with filtering and pagination
   */
  async listMoveOuts(query: ListMoveOutsQuery): Promise<MoveOutListResponse> {
    const {
      contractId,
      roomNo,
      status,
      fromDate,
      toDate,
      page,
      pageSize,
      sortBy,
      sortOrder,
    } = query;

    // Build where clause
    const where: Record<string, unknown> = {};

    if (contractId) {
      where.contractId = contractId;
    }

    if (roomNo) {
      where.contract = { roomNo };
    }

    if (status) {
      where.status = status;
    }

    if (fromDate || toDate) {
      where.moveOutDate = {};
      if (fromDate) {
        (where.moveOutDate as Record<string, Date>).gte = new Date(fromDate);
      }
      if (toDate) {
        (where.moveOutDate as Record<string, Date>).lte = new Date(toDate);
      }
    }

    // Get total count
    const total = await prisma.moveOut.count({ where });

    // Get move-outs with pagination
    const moveOuts = await prisma.moveOut.findMany({
      where,
      include: {
        contract: {
          include: {
            primaryTenant: true,
            room: true,
          },
        },
        items: true,
      },
      orderBy: {
        [sortBy]: sortOrder,
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    return {
      data: moveOuts.map((m) => this.formatMoveOutResponse(m)),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * Update move-out record
   */
  async updateMoveOut(id: string, input: UpdateMoveOutInput): Promise<MoveOutResponse> {
    logger.info({ type: 'moveout_update', id });

    const existing = await prisma.moveOut.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundError('MoveOut', id);
    }

    if (existing.status === 'REFUNDED' || existing.status === 'CANCELLED') {
      throw new BadRequestError('Cannot update move-out in final status');
    }

    const updateData: Record<string, unknown> = {};

    if (input.moveOutDate) {
      updateData.moveOutDate = new Date(input.moveOutDate);
    }

    if (input.notes !== undefined) {
      updateData.notes = input.notes;
    }

    if (input.status) {
      // Validate status transitions
      this.validateStatusTransition(existing.status as MoveOutStatus, input.status);
      updateData.status = input.status;
    }

    const moveOut = await prisma.moveOut.update({
      where: { id },
      data: updateData,
      include: {
        contract: {
          include: {
            primaryTenant: true,
            room: true,
          },
        },
        items: true,
      },
    });

    return this.formatMoveOutResponse(moveOut);
  }

  /**
   * Add inspection item to move-out
   */
  async addItem(moveOutId: string, input: CreateMoveOutItemInput): Promise<MoveOutItemResponse> {
    logger.info({ type: 'moveout_item_add', moveOutId, item: input.item });

    const moveOut = await prisma.moveOut.findUnique({
      where: { id: moveOutId },
    });

    if (!moveOut) {
      throw new NotFoundError('MoveOut', moveOutId);
    }

    if (moveOut.status === 'REFUNDED' || moveOut.status === 'CANCELLED') {
      throw new BadRequestError('Cannot add items to move-out in final status');
    }

    const item = await prisma.moveOutItem.create({
      data: {
        id: uuidv4(),
        moveOutId,
        category: input.category,
        item: input.item,
        condition: input.condition,
        cost: input.cost,
        notes: input.notes,
      },
    });

    // Update status to INSPECTION_DONE if it was PENDING
    if (moveOut.status === 'PENDING') {
      await prisma.moveOut.update({
        where: { id: moveOutId },
        data: { status: 'INSPECTION_DONE' },
      });
    }

    // Recalculate deductions
    await this.recalculateDeductions(moveOutId);

    return this.formatItemResponse(item);
  }

  /**
   * Update inspection item
   */
  async updateItem(itemId: string, input: UpdateMoveOutItemInput): Promise<MoveOutItemResponse> {
    logger.info({ type: 'moveout_item_update', itemId });

    const item = await prisma.moveOutItem.findUnique({
      where: { id: itemId },
    });

    if (!item) {
      throw new NotFoundError('MoveOutItem', itemId);
    }

    const updateData: Record<string, unknown> = {};

    if (input.category) updateData.category = input.category;
    if (input.item) updateData.item = input.item;
    if (input.condition) updateData.condition = input.condition;
    if (input.cost !== undefined) updateData.cost = input.cost;
    if (input.notes !== undefined) updateData.notes = input.notes;

    const updated = await prisma.moveOutItem.update({
      where: { id: itemId },
      data: updateData,
    });

    // Recalculate deductions
    await this.recalculateDeductions(item.moveOutId);

    return this.formatItemResponse(updated);
  }

  /**
   * Delete inspection item
   */
  async deleteItem(itemId: string): Promise<void> {
    logger.info({ type: 'moveout_item_delete', itemId });

    const item = await prisma.moveOutItem.findUnique({
      where: { id: itemId },
    });

    if (!item) {
      throw new NotFoundError('MoveOutItem', itemId);
    }

    await prisma.moveOutItem.delete({
      where: { id: itemId },
    });

    // Recalculate deductions
    await this.recalculateDeductions(item.moveOutId);
  }

  /**
   * Calculate deposit deductions and final refund
   */
  async calculateDeposit(moveOutId: string, input: CalculateDepositInput): Promise<MoveOutResponse> {
    logger.info({ type: 'moveout_deposit_calculate', moveOutId });

    const moveOut = await prisma.moveOut.findUnique({
      where: { id: moveOutId },
    });

    if (!moveOut) {
      throw new NotFoundError('MoveOut', moveOutId);
    }

    if (moveOut.status === 'REFUNDED' || moveOut.status === 'CANCELLED') {
      throw new BadRequestError('Cannot calculate deposit for move-out in final status');
    }

    const totalDeduction = input.cleaningFee + input.damageRepairCost + input.otherDeductions;
    const finalRefund = Math.max(0, Number(moveOut.depositAmount) - totalDeduction);

    // Create deduction items if they don't exist
    const existingCategories = await prisma.moveOutItem.findMany({
      where: { moveOutId },
      select: { category: true },
    });

    const existingCategorySet = new Set(existingCategories.map((i) => i.category));

    await prisma.$transaction(async (tx) => {
      // Add cleaning fee item if not exists
      if (!existingCategorySet.has('cleaning') && input.cleaningFee > 0) {
        await tx.moveOutItem.create({
          data: {
            id: uuidv4(),
            moveOutId,
            category: 'cleaning',
            item: 'Cleaning Fee',
            condition: 'FAIR',
            cost: input.cleaningFee,
          },
        });
      }

      // Add damage repair item if not exists
      if (!existingCategorySet.has('damage') && input.damageRepairCost > 0) {
        await tx.moveOutItem.create({
          data: {
            id: uuidv4(),
            moveOutId,
            category: 'damage',
            item: 'Damage Repair Cost',
            condition: 'DAMAGED',
            cost: input.damageRepairCost,
          },
        });
      }

      // Add other deductions item if not exists
      if (!existingCategorySet.has('other') && input.otherDeductions > 0) {
        await tx.moveOutItem.create({
          data: {
            id: uuidv4(),
            moveOutId,
            category: 'other',
            item: 'Other Deductions',
            condition: 'FAIR',
            cost: input.otherDeductions,
          },
        });
      }

      // Update move-out totals
      await tx.moveOut.update({
        where: { id: moveOutId },
        data: {
          totalDeduction,
          finalRefund,
          status: 'DEPOSIT_CALCULATED',
        },
      });
    });

    const updated = await prisma.moveOut.findUnique({
      where: { id: moveOutId },
      include: {
        contract: {
          include: {
            primaryTenant: true,
            room: true,
          },
        },
        items: true,
      },
    });

    return this.formatMoveOutResponse(updated!);
  }

  /**
   * Confirm move-out
   */
  async confirmMoveOut(id: string, input: ConfirmMoveOutInput, confirmedBy?: string): Promise<MoveOutResponse> {
    logger.info({ type: 'moveout_confirm', id });

    const moveOut = await prisma.moveOut.findUnique({
      where: { id },
    });

    if (!moveOut) {
      throw new NotFoundError('MoveOut', id);
    }

    if (moveOut.status !== 'DEPOSIT_CALCULATED') {
      throw new BadRequestError('Can only confirm move-out after deposit calculation');
    }

    const updated = await prisma.moveOut.update({
      where: { id },
      data: {
        status: 'CONFIRMED',
        confirmedAt: new Date(),
        confirmedBy,
        notes: input.notes ? `${moveOut.notes || ''}\n${input.notes}`.trim() : moveOut.notes,
      },
      include: {
        contract: {
          include: {
            primaryTenant: true,
            room: true,
          },
        },
        items: true,
      },
    });

    return this.formatMoveOutResponse(updated);
  }

  /**
   * Mark deposit as refunded
   */
  async markRefund(id: string, input: MarkRefundInput, refundedBy?: string): Promise<MoveOutResponse> {
    logger.info({ type: 'moveout_refund', id });

    const moveOut = await prisma.moveOut.findUnique({
      where: { id },
    });

    if (!moveOut) {
      throw new NotFoundError('MoveOut', id);
    }

    if (moveOut.status !== 'CONFIRMED') {
      throw new BadRequestError('Can only refund after confirmation');
    }

    const updated = await prisma.moveOut.update({
      where: { id },
      data: {
        status: 'REFUNDED',
        refundAt: new Date(),
        refundBy: refundedBy,
        notes: input.notes ? `${moveOut.notes || ''}\n${input.notes}`.trim() : moveOut.notes,
      },
      include: {
        contract: {
          include: {
            primaryTenant: true,
            room: true,
          },
        },
        items: true,
      },
    });

    return this.formatMoveOutResponse(updated);
  }

  /**
   * Cancel move-out
   */
  async cancelMoveOut(id: string, reason?: string): Promise<MoveOutResponse> {
    logger.info({ type: 'moveout_cancel', id });

    const moveOut = await prisma.moveOut.findUnique({
      where: { id },
      include: { contract: true },
    });

    if (!moveOut) {
      throw new NotFoundError('MoveOut', id);
    }

    if (moveOut.status === 'REFUNDED') {
      throw new BadRequestError('Cannot cancel move-out that has been refunded');
    }

    // Restore contract status
    await prisma.contract.update({
      where: { id: moveOut.contractId },
      data: {
        status: 'ACTIVE',
        terminationDate: null,
      },
    });

    // Restore room status
    await prisma.room.update({
      where: { roomNo: moveOut.contract.roomNo },
      data: { roomStatus: 'OCCUPIED' },
    });

    // Clear tenant move-out date
    await prisma.roomTenant.updateMany({
      where: {
        roomNo: moveOut.contract.roomNo,
        tenantId: moveOut.contract.primaryTenantId,
      },
      data: {
        moveOutDate: null,
      },
    });

    const updated = await prisma.moveOut.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        notes: reason ? `${moveOut.notes || ''}\nCancellation: ${reason}`.trim() : moveOut.notes,
      },
      include: {
        contract: {
          include: {
            primaryTenant: true,
            room: true,
          },
        },
        items: true,
      },
    });

    return this.formatMoveOutResponse(updated);
  }

  /**
   * Recalculate total deductions and final refund
   */
  private async recalculateDeductions(moveOutId: string): Promise<void> {
    const items = await prisma.moveOutItem.findMany({
      where: { moveOutId },
    });

    const totalDeduction = items.reduce((sum, item) => sum + Number(item.cost), 0);

    const moveOut = await prisma.moveOut.findUnique({
      where: { id: moveOutId },
    });

    if (moveOut) {
      const finalRefund = Math.max(0, Number(moveOut.depositAmount) - totalDeduction);
      await prisma.moveOut.update({
        where: { id: moveOutId },
        data: {
          totalDeduction,
          finalRefund,
        },
      });
    }
  }

  /**
   * Validate status transition
   */
  private validateStatusTransition(current: MoveOutStatus, next: MoveOutStatus): void {
    const validTransitions: Record<MoveOutStatus, MoveOutStatus[]> = {
      PENDING: ['INSPECTION_DONE', 'CANCELLED'],
      INSPECTION_DONE: ['DEPOSIT_CALCULATED', 'PENDING', 'CANCELLED'],
      DEPOSIT_CALCULATED: ['CONFIRMED', 'INSPECTION_DONE', 'CANCELLED'],
      CONFIRMED: ['REFUNDED', 'CANCELLED'],
      REFUNDED: [],
      CANCELLED: [],
    };

    if (!validTransitions[current].includes(next)) {
      throw new BadRequestError(`Cannot transition from ${current} to ${next}`);
    }
  }

  /**
   * Format move-out for response
   */
  private formatMoveOutResponse(
    moveOut: {
      id: string;
      contractId: string;
      moveOutDate: Date;
      depositAmount: unknown;
      totalDeduction: unknown;
      finalRefund: unknown;
      status: string;
      notes: string | null;
      lineNoticeSentAt: Date | null;
      confirmedAt: Date | null;
      confirmedBy: string | null;
      refundAt: Date | null;
      refundBy: string | null;
      createdAt: Date;
      updatedAt: Date;
      contract?: {
        id: string;
        roomNo: string;
        monthlyRent: unknown;
        deposit: unknown | null;
        status: string;
        primaryTenant?: {
          id: string;
          firstName: string;
          lastName: string;
          phone: string;
          lineUserId: string | null;
        };
      };
      items: {
        id: string;
        moveOutId: string;
        category: string;
        item: string;
        condition: string;
        cost: unknown;
        notes: string | null;
        createdAt: Date;
        updatedAt: Date;
      }[];
    }
  ): MoveOutResponse {
    return {
      id: moveOut.id,
      contractId: moveOut.contractId,
      moveOutDate: moveOut.moveOutDate,
      depositAmount: Number(moveOut.depositAmount),
      totalDeduction: Number(moveOut.totalDeduction),
      finalRefund: Number(moveOut.finalRefund),
      status: moveOut.status as MoveOutStatus,
      notes: moveOut.notes,
      lineNoticeSentAt: moveOut.lineNoticeSentAt,
      confirmedAt: moveOut.confirmedAt,
      confirmedBy: moveOut.confirmedBy,
      refundAt: moveOut.refundAt,
      refundBy: moveOut.refundBy,
      createdAt: moveOut.createdAt,
      updatedAt: moveOut.updatedAt,
      contract: moveOut.contract
        ? {
            id: moveOut.contract.id,
            roomNo: moveOut.contract.roomNo,
            monthlyRent: Number(moveOut.contract.monthlyRent),
            deposit: moveOut.contract.deposit ? Number(moveOut.contract.deposit) : null,
            status: moveOut.contract.status,
            primaryTenant: moveOut.contract.primaryTenant
              ? {
                  id: moveOut.contract.primaryTenant.id,
                  firstName: moveOut.contract.primaryTenant.firstName,
                  lastName: moveOut.contract.primaryTenant.lastName,
                  fullName: `${moveOut.contract.primaryTenant.firstName} ${moveOut.contract.primaryTenant.lastName}`,
                  phone: moveOut.contract.primaryTenant.phone,
                  lineUserId: moveOut.contract.primaryTenant.lineUserId,
                }
              : undefined,
          }
        : undefined,
      items: moveOut.items.map((item) => this.formatItemResponse(item)),
    };
  }

  /**
   * Format item for response
   */
  private formatItemResponse(
    item: {
      id: string;
      moveOutId: string;
      category: string;
      item: string;
      condition: string;
      cost: unknown;
      notes: string | null;
      createdAt: Date;
      updatedAt: Date;
    }
  ): MoveOutItemResponse {
    return {
      id: item.id,
      moveOutId: item.moveOutId,
      category: item.category,
      item: item.item,
      condition: item.condition as MoveOutItemCondition,
      cost: Number(item.cost),
      notes: item.notes,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createMoveOutService(): MoveOutService {
  return new MoveOutService();
}
