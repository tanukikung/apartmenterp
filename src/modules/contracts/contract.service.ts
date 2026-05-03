import { v4 as uuidv4 } from 'uuid';
import { prisma, EventBus, logger, EventTypes } from '@/lib';
import { CONTRACT_STATUS, ROOM_STATUS } from '@/lib/constants';

import {
  CreateContractInput,
  UpdateContractInput,
  RenewContractInput,
  TerminateContractInput,
  ListContractsQuery,
  ContractResponse,
  ContractListResponse,
  ContractCreatedPayload,
  ContractRenewedPayload,
  ContractTerminatedPayload,
  ContractExpiringSoonPayload,
} from './types';
import type { ContractStatus } from './types';
import {
  NotFoundError,
  ConflictError,
  BadRequestError,
} from '@/lib/utils/errors';

// ============================================================================
// Contract Service
// ============================================================================

export class ContractService {
  private eventBus: EventBus;

  constructor(eventBus?: EventBus) {
    this.eventBus = eventBus || EventBus.getInstance();
  }

  /**
   * Create a new contract
   */
  async createContract(
    input: CreateContractInput,
    createdBy?: string,
    requestId?: string,
  ): Promise<ContractResponse> {
    logger.info({ type: 'contract_create', requestId: requestId ?? null, actorId: createdBy ?? null, roomNo: input.roomId, tenantId: input.primaryTenantId });

    // Validate room exists
    const room = await prisma.room.findUnique({
      where: { roomNo: input.roomId },
    });

    if (!room) {
      throw new NotFoundError(`ไม่พบห้อง '${input.roomId}'`, input.roomId);
    }

    // Validate tenant exists
    const tenant = await prisma.tenant.findUnique({
      where: { id: input.primaryTenantId },
    });

    if (!tenant) {
      throw new NotFoundError(`ไม่พบผู้เช่า`, input.primaryTenantId);
    }

    // Validate dates
    if (new Date(input.startDate) > new Date(input.endDate)) {
      throw new BadRequestError('Start date must be before end date');
    }

    const contract = await prisma.$transaction(async (tx) => {
      // Lock the room row to serialise concurrent contract creates for the
      // same room.  This ensures that only one CREATE transaction can proceed
      // to the overlap check below.
      await tx.$executeRaw`
        SELECT "roomNo" FROM rooms
        WHERE "roomNo" = ${input.roomId}
        FOR UPDATE
      `;

      // Business rule: Only one ACTIVE contract per room.
      // Find any existing active contract and lock the row so that the second
      // concurrent request blocks here until the first transaction commits.
      const existingActive = await tx.contract.findFirst({
        where: {
          roomNo: input.roomId,
          status: CONTRACT_STATUS.ACTIVE,
        },
      });

      if (existingActive) {
        // Lock the conflicting row to prevent a race where both transactions
        // pass the initial check before either commits.
        await tx.$executeRaw`
          SELECT id FROM contracts
          WHERE id = ${existingActive.id}
          FOR UPDATE
        `;
        throw new ConflictError('Room already has an active contract');
      }

      // Check if tenant is PRIMARY in this room (must be checked inside
      // transaction so that the roomTenant row can also be locked).
      const roomTenant = await tx.roomTenant.findFirst({
        where: {
          tenantId: input.primaryTenantId,
          roomNo: input.roomId,
          role: 'PRIMARY',
          moveOutDate: null,
        },
      });

      if (!roomTenant) {
        throw new BadRequestError('Tenant must be PRIMARY tenant in this room');
      }

      // Check for overlapping date ranges with any ACTIVE contract.
      // This must also be inside the transaction so that a concurrent
      // ACTIVE contract created between the first check above and this one
      // cannot slip through.
      const overlapping = await tx.contract.findFirst({
        where: {
          roomNo: input.roomId,
          status: CONTRACT_STATUS.ACTIVE,
          OR: [
            {
              AND: [
                { startDate: { lte: new Date(input.startDate) } },
                { endDate: { gte: new Date(input.startDate) } },
              ],
            },
            {
              AND: [
                { startDate: { lte: new Date(input.endDate) } },
                { endDate: { gte: new Date(input.endDate) } },
              ],
            },
          ],
        },
      });

      if (overlapping) {
        throw new ConflictError('Contract dates overlap with existing contract');
      }

      const created = await tx.contract.create({
        data: {
          id: uuidv4(),
          roomNo: input.roomId,
          primaryTenantId: input.primaryTenantId,
          startDate: new Date(input.startDate),
          endDate: new Date(input.endDate),
          monthlyRent: input.rentAmount,
          deposit: input.depositAmount || 0,
          status: CONTRACT_STATUS.ACTIVE,
        },
        include: {
          room: true,
          primaryTenant: true,
        },
      });
      await tx.room.update({
        where: { roomNo: input.roomId },
        data: { roomStatus: ROOM_STATUS.OCCUPIED },
      });
      await tx.outboxEvent.create({
        data: {
          id: uuidv4(),
          aggregateType: 'Contract',
          aggregateId: created.id,
          eventType: EventTypes.CONTRACT_CREATED,
          payload: {
            contractId: created.id,
            roomNo: created.roomNo,
            roomNumber: created.room.roomNo,
            tenantId: created.primaryTenantId,
            tenantName: `${created.primaryTenant.firstName} ${created.primaryTenant.lastName}`,
            startDate: input.startDate,
            endDate: input.endDate,
            rentAmount: Number(created.monthlyRent),
            depositAmount: Number(created.deposit || 0),
            createdBy,
          },
          retryCount: 0,
        },
      });
      return created;
    });

    // Publish event
    const payload: ContractCreatedPayload = {
      contractId: contract.id,
      roomNo: contract.roomNo,
      tenantId: contract.primaryTenantId,
      tenantName: `${contract.primaryTenant.firstName} ${contract.primaryTenant.lastName}`,
      startDate: input.startDate,
      endDate: input.endDate,
      rentAmount: Number(contract.monthlyRent),
      depositAmount: Number(contract.deposit || 0),
      createdBy,
    };

    await this.eventBus.publish(
      EventTypes.CONTRACT_CREATED,
      'Contract',
      contract.id,
      payload,
      { userId: createdBy }
    );

    return this.formatContractResponse(contract);
  }

  /**
   * Get contract by ID
   */
  async getContractById(id: string): Promise<ContractResponse> {
    const contract = await prisma.contract.findUnique({
      where: { id },
      include: {
        room: true,
        primaryTenant: true,
      },
    });

    if (!contract) {
      throw new NotFoundError('Contract', id);
    }

    return this.formatContractResponse(contract);
  }

  /**
   * Get active contract by room
   */
  async getActiveContractByRoom(roomId: string): Promise<ContractResponse | null> {
    const contract = await prisma.contract.findFirst({
      where: {
        roomNo: roomId,
        status: 'ACTIVE',
      },
      include: {
        room: true,
        primaryTenant: true,
      },
    });

    if (!contract) {
      return null;
    }

    return this.formatContractResponse(contract);
  }

  /**
   * List contracts with filtering and pagination
   */
  async listContracts(query: ListContractsQuery): Promise<ContractListResponse> {
    const { roomId, tenantId, status, expiringBefore, expiringAfter, page, pageSize, sortBy, sortOrder } = query;

    // Build where clause
    const where: Record<string, unknown> = {};

    if (roomId) {
      where.roomNo = roomId;
    }

    if (tenantId) {
      where.primaryTenantId = tenantId;
    }

    if (status) {
      where.status = status;
    }

    if (expiringBefore || expiringAfter) {
      where.endDate = {};
      if (expiringBefore) {
        (where.endDate as Record<string, Date>).lte = new Date(expiringBefore);
      }
      if (expiringAfter) {
        (where.endDate as Record<string, Date>).gte = new Date(expiringAfter);
      }
    }

    // Get total count
    const total = await prisma.contract.count({ where });

    // Get contracts with pagination
    const contracts = await prisma.contract.findMany({
      where,
      include: {
        room: true,
        primaryTenant: true,
      },
      orderBy: {
        [sortBy]: sortOrder,
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    return {
      data: contracts.map((c) => this.formatContractResponse(c)),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * Update a contract
   */
  async updateContract(
    id: string,
    input: UpdateContractInput
  ): Promise<ContractResponse> {
    logger.info({ type: 'contract_update', id });

    const existing = await prisma.contract.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundError('Contract', id);
    }

    // Can only update ACTIVE contracts
    if (existing.status !== 'ACTIVE') {
      throw new BadRequestError('Can only update active contracts');
    }

    // Build update data
    const updateData: Record<string, unknown> = {};

    if (input.startDate) {
      updateData.startDate = new Date(input.startDate);
    }

    if (input.endDate) {
      updateData.endDate = new Date(input.endDate);
    }

    if (input.rentAmount !== undefined) {
      updateData.monthlyRent = input.rentAmount;
    }

    if (input.depositAmount !== undefined) {
      updateData.deposit = input.depositAmount;
    }

    const contract = await prisma.contract.update({
      where: { id },
      data: updateData,
      include: {
        room: true,
        primaryTenant: true,
      },
    });

    return this.formatContractResponse(contract);
  }

  /**
   * Renew a contract
   */
  async renewContract(
    id: string,
    input: RenewContractInput,
    renewedBy?: string,
    requestId?: string,
  ): Promise<ContractResponse> {
    logger.info({ type: 'contract_renew', requestId: requestId ?? null, actorId: renewedBy ?? null, entityId: id, newEndDate: input.newEndDate });

    const existing = await prisma.contract.findUnique({
      where: { id },
      include: {
        room: true,
        primaryTenant: true,
      },
    });

    if (!existing) {
      throw new NotFoundError('Contract', id);
    }

    if (existing.status !== 'ACTIVE') {
      throw new BadRequestError('Can only renew active contracts');
    }

    // Validate new end date
    if (new Date(input.newEndDate) <= existing.endDate) {
      throw new BadRequestError('New end date must be after current end date');
    }

    // Create new contract (old one expires)
    const oldEndDate = existing.endDate;

    const newContract = await prisma.$transaction(async (tx) => {
      await tx.contract.update({
        where: { id },
        data: { status: 'EXPIRED' },
      });
      const created = await tx.contract.create({
        data: {
          id: uuidv4(),
          roomNo: existing.roomNo,
          primaryTenantId: existing.primaryTenantId,
          startDate: new Date(oldEndDate.getTime() + 24 * 60 * 60 * 1000),
          endDate: new Date(input.newEndDate),
          monthlyRent: input.newRentAmount || Number(existing.monthlyRent),
          deposit: input.newDepositAmount ?? Number(existing.deposit || 0),
          status: 'ACTIVE',
        },
        include: {
          room: true,
          primaryTenant: true,
        },
      });
      await tx.outboxEvent.create({
        data: {
          id: uuidv4(),
          aggregateType: 'Contract',
          aggregateId: created.id,
          eventType: EventTypes.CONTRACT_RENEWED,
          payload: {
            contractId: created.id,
            roomNo: created.roomNo,
            roomNumber: created.room.roomNo,
            tenantId: created.primaryTenantId,
            tenantName: `${created.primaryTenant.firstName} ${created.primaryTenant.lastName}`,
            oldEndDate: oldEndDate.toISOString().split('T')[0],
            newEndDate: input.newEndDate,
            newRentAmount: input.newRentAmount,
            newDepositAmount: input.newDepositAmount,
            renewedBy,
          },
          retryCount: 0,
        },
      });
      return created;
    });

    // Publish event
    const payload: ContractRenewedPayload = {
      contractId: newContract.id,
      roomNo: newContract.roomNo,
      tenantId: newContract.primaryTenantId,
      tenantName: `${newContract.primaryTenant.firstName} ${newContract.primaryTenant.lastName}`,
      oldEndDate: oldEndDate.toISOString().split('T')[0],
      newEndDate: input.newEndDate,
      newRentAmount: input.newRentAmount,
      newDepositAmount: input.newDepositAmount,
      renewedBy,
    };

    await this.eventBus.publish(
      EventTypes.CONTRACT_RENEWED,
      'Contract',
      newContract.id,
      payload,
      { userId: renewedBy }
    );

    return this.formatContractResponse(newContract);
  }

  /**
   * Terminate a contract
   */
  async terminateContract(
    id: string,
    input: TerminateContractInput,
    terminatedBy?: string,
    requestId?: string,
  ): Promise<ContractResponse> {
    logger.info({ type: 'contract_terminate', requestId: requestId ?? null, id });

    const contract = await prisma.contract.findUnique({
      where: { id },
      include: {
        room: true,
        primaryTenant: true,
      },
    });

    if (!contract) {
      throw new NotFoundError('Contract', id);
    }

    if (contract.status !== 'ACTIVE') {
      throw new BadRequestError('Can only terminate active contracts');
    }

    const updated = await prisma.$transaction(async (tx) => {
      // Acquire exclusive row lock on the contract FIRST so that a concurrent
      // invoice-generation job that runs between the pre-flight check and this
      // transaction cannot create an invoice that we missed (FM-8).
      type LockRow = { id: string };
      const [locked] = await (tx as unknown as { $queryRaw: (s: TemplateStringsArray, ...a: unknown[]) => Promise<LockRow[]> })
        .$queryRaw`SELECT id FROM contracts WHERE id = ${id} FOR UPDATE`;
      if (!locked) throw new NotFoundError('Contract', id);

      // Re-check status inside transaction after lock (state may have changed)
      const fresh = await tx.contract.findUnique({ where: { id } });
      if (!fresh || fresh.status !== 'ACTIVE') {
        throw new BadRequestError('Can only terminate active contracts');
      }

      // Unpaid invoice check INSIDE transaction — after lock — so that any invoice
      // generated concurrently is visible here (they commit before our lock).
      if (!input.forceTerminate) {
        const unpaidCount = await tx.invoice.count({
          where: {
            roomNo: fresh.roomNo,
            status: { in: ['GENERATED', 'SENT', 'VIEWED', 'OVERDUE'] },
          },
        });
        if (unpaidCount > 0) {
          throw new BadRequestError(
            `Cannot terminate: ${unpaidCount} unpaid invoice(s) exist for this room. ` +
            `Collect payment or set forceTerminate=true to override.`,
            { unpaidCount, roomNo: fresh.roomNo }
          );
        }
      }

      const result = await tx.contract.update({
        where: { id },
        data: {
          status: 'TERMINATED',
          terminationDate: new Date(input.terminationDate),
          terminationReason: input.terminationReason || null,
        },
        include: {
          room: true,
          primaryTenant: true,
        },
      });
      await tx.room.update({
        where: { roomNo: result.roomNo },
        data: { roomStatus: 'VACANT' },
      });
      await tx.outboxEvent.create({
        data: {
          id: uuidv4(),
          aggregateType: 'Contract',
          aggregateId: result.id,
          eventType: EventTypes.CONTRACT_TERMINATED,
          payload: {
            contractId: result.id,
            roomNo: result.roomNo,
            tenantId: result.primaryTenantId,
            tenantName: `${result.primaryTenant.firstName} ${result.primaryTenant.lastName}`,
            terminationDate: input.terminationDate,
            terminationReason: input.terminationReason,
            terminatedBy,
          },
          retryCount: 0,
        },
      });
      return result;
    });

    // Publish event
    const payload: ContractTerminatedPayload = {
      contractId: updated.id,
      roomNo: updated.roomNo,
      tenantId: updated.primaryTenantId,
      tenantName: `${updated.primaryTenant.firstName} ${updated.primaryTenant.lastName}`,
      terminationDate: input.terminationDate,
      terminationReason: input.terminationReason,
      terminatedBy,
    };

    await this.eventBus.publish(
      EventTypes.CONTRACT_TERMINATED,
      'Contract',
      updated.id,
      payload,
      { userId: terminatedBy }
    );

    return this.formatContractResponse(updated);
  }

  /**
   * Check for expiring contracts and publish events
   */
  async checkExpiringContracts(daysAhead: number = 30): Promise<void> {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + daysAhead);

    const expiringContracts = await prisma.contract.findMany({
      where: {
        status: 'ACTIVE',
        endDate: {
          lte: futureDate,
          gte: new Date(),
        },
      },
      include: {
        room: true,
        primaryTenant: true,
      },
    });

    if (expiringContracts.length === 0) {
      logger.info({ type: 'expiring_contracts_check', count: 0 });
      return;
    }

    // Build all payloads first, then publish all events concurrently
    const eventPayloads = expiringContracts.map((contract) => {
      const daysUntilExpiry = Math.ceil(
        (contract.endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );
      const payload: ContractExpiringSoonPayload = {
        contractId: contract.id,
        roomNo: contract.roomNo,
        tenantId: contract.primaryTenantId,
        tenantName: `${contract.primaryTenant.firstName} ${contract.primaryTenant.lastName}`,
        endDate: contract.endDate.toISOString().split('T')[0],
        daysUntilExpiry,
      };
      return payload;
    });

    await Promise.all(
      expiringContracts.map((contract, i) =>
        this.eventBus.publish(
          EventTypes.CONTRACT_EXPIRING_SOON,
          'Contract',
          contract.id,
          eventPayloads[i] as unknown
        )
      )
    );

    logger.info({ type: 'expiring_contracts_check', count: expiringContracts.length });
  }

  /**
   * Format contract for response
   */
  private formatContractResponse(
    contract: {
      id: string;
      roomNo: string;
      primaryTenantId: string;
      startDate: Date;
      endDate: Date;
      monthlyRent: unknown;
      deposit: unknown | null;
      status: string;
      terminationDate: Date | null;
      terminationReason: string | null;
      createdAt: Date;
      updatedAt: Date;
      room?: { roomNo: string };
      primaryTenant?: {
        id: string;
        firstName: string;
        lastName: string;
        phone: string;
      };
    }
  ): ContractResponse {
    return {
      id: contract.id,
      roomNo: contract.roomNo,
      primaryTenantId: contract.primaryTenantId,
      startDate: contract.startDate,
      endDate: contract.endDate,
      rentAmount: Number(contract.monthlyRent),
      depositAmount: Number(contract.deposit || 0),
      status: contract.status as ContractStatus,
      terminationDate: contract.terminationDate,
      terminationReason: contract.terminationReason,
      createdAt: contract.createdAt,
      updatedAt: contract.updatedAt,
      room: contract.room
        ? {
            roomNo: contract.room.roomNo,
          }
        : undefined,
      primaryTenant: contract.primaryTenant
        ? {
            id: contract.primaryTenant.id,
            firstName: contract.primaryTenant.firstName,
            lastName: contract.primaryTenant.lastName,
            fullName: `${contract.primaryTenant.firstName} ${contract.primaryTenant.lastName}`,
            phone: contract.primaryTenant.phone,
          }
        : undefined,
    };
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createContractService(eventBus?: EventBus): ContractService {
  return new ContractService(eventBus);
}
