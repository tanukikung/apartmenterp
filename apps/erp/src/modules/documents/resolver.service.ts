import { format } from 'date-fns';
import {
  BillingStatus,
  DocumentTemplateType,
  InvoiceStatus,
  PaymentTransactionStatus,
  Prisma,
  RoomStatus,
  TenantRole,
} from '@prisma/client';
import { prisma } from '@/lib/db/client';
import { BadRequestError, NotFoundError } from '@/lib/utils/errors';
import type { DocumentGenerateInput, DocumentGenerationPreviewTarget, TemplatePreviewRequest } from './types';

type SelectedRoom = Prisma.RoomGetPayload<{
  include: {
    floor: { include: { building: true } };
    roomTenants: { where: { role: 'PRIMARY'; moveOutDate: null }; include: { tenant: true } };
    contracts: { include: { primaryTenant: true } };
    billingRecords: {
      include: {
        items: { include: { itemType: true } };
        invoices: {
          include: {
            paymentTransactions: true;
            deliveries: true;
          };
        };
      };
    };
  };
}>;

export interface DocumentRenderBillingItem {
  typeCode: string;
  typeName: string;
  description: string | null;
  quantity: number;
  unitPrice: number;
  unitPriceFormatted: string;
  amount: number;
  amountFormatted: string;
}

export interface DocumentRenderContext {
  room: {
    id: string;
    number: string;
    floorNumber: number | null;
    status: RoomStatus;
    billingStatus: string;
    usageType: string;
    maxResidents: number;
  };
  tenant: {
    id: string;
    firstName: string;
    lastName: string;
    fullName: string;
    phone: string;
    email: string | null;
    lineUserId: string | null;
  } | null;
  contract: {
    id: string;
    startDate: string;
    endDate: string;
    monthlyRent: number;
    deposit: number | null;
    furnitureFee: number | null;
  } | null;
  billing: {
    recordId: string;
    billingCycleId: string | null;
    year: number;
    month: number;
    subtotal: number;
    total: number;
    dueDate: string | null;
    billingDay: number;
    dueDay: number;
    overdueDay: number;
    status: BillingStatus;
    invoiceId: string | null;
    invoiceNumber: string | null;
    invoiceStatus: InvoiceStatus | null;
  } | null;
  billingItems: DocumentRenderBillingItem[];
  payment: {
    status: string | null;
    lastPaidAt: string | null;
    totalConfirmed: number;
    totalConfirmedFormatted: string;
  };
  apartment: {
    id: string | null;
    name: string;
    address: string;
  };
  system: {
    generatedAt: string;
    generatedById: string | null;
  };
  computed: {
    billingMonthLabel: string | null;
    dueDateLabel: string | null;
    occupancyDisplay: string;
    totalAmountFormatted: string | null;
    invoiceNumber: string | null;
    qrPayload: string | null;
  };
}

export interface ResolvedDocumentTarget {
  roomId: string;
  roomNumber: string;
  floorNumber: number | null;
  tenantName: string | null;
  billingRecordId: string | null;
  invoiceId: string | null;
  context: DocumentRenderContext;
}

const BILLING_TEMPLATE_TYPES = new Set<DocumentTemplateType>([
  DocumentTemplateType.INVOICE,
  DocumentTemplateType.NOTICE,
  DocumentTemplateType.RECEIPT,
]);

function money(value: number): string {
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function toNumber(value: Prisma.Decimal | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  return Number(value);
}

function startOfMonthUtc(year: number, month: number): Date {
  return new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
}

function endOfMonthUtc(year: number, month: number): Date {
  return new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
}

function toIsoDate(date: Date | null | undefined): string | null {
  if (!date) return null;
  return format(date, 'yyyy-MM-dd');
}

function pickContract(room: SelectedRoom, year?: number, month?: number) {
  if (!room.contracts.length) return null;
  if (!year || !month) {
    return room.contracts.find((contract) => contract.status === 'ACTIVE') ?? room.contracts[0] ?? null;
  }

  const monthStart = startOfMonthUtc(year, month);
  const monthEnd = endOfMonthUtc(year, month);

  return (
    room.contracts.find((contract) => contract.startDate <= monthEnd && contract.endDate >= monthStart) ??
    room.contracts.find((contract) => contract.status === 'ACTIVE') ??
    room.contracts[0] ??
    null
  );
}

function invoiceNumber(invoiceId: string, year: number, month: number, roomNumber: string): string {
  return `INV-${year}-${String(month).padStart(2, '0')}-${roomNumber}-${invoiceId.slice(0, 6).toUpperCase()}`;
}

function buildBillingDueDate(record: SelectedRoom['billingRecords'][number]): Date {
  return new Date(Date.UTC(record.year, record.month - 1, record.dueDay, 0, 0, 0, 0));
}

function latestInvoice(record: SelectedRoom['billingRecords'][number]) {
  return [...record.invoices].sort((left, right) => right.version - left.version)[0] ?? null;
}

function buildOccupancyDisplay(room: SelectedRoom): string {
  const names = room.roomTenants
    .map((roomTenant) => {
      const tenant = roomTenant.tenant;
      return `${tenant.firstName} ${tenant.lastName}`.trim();
    })
    .filter(Boolean);

  if (!names.length) return 'No active resident';
  return names.join(', ');
}

function mapBillingItems(record: SelectedRoom['billingRecords'][number] | null): DocumentRenderBillingItem[] {
  if (!record) return [];

  return record.items.map((item) => {
    const unitPrice = toNumber(item.unitPrice);
    const amount = toNumber(item.amount);
    return {
      typeCode: item.itemType.code,
      typeName: item.itemType.name,
      description: item.description,
      quantity: toNumber(item.quantity),
      unitPrice,
      unitPriceFormatted: money(unitPrice),
      amount,
      amountFormatted: money(amount),
    };
  });
}

function mapPaymentSummary(record: SelectedRoom['billingRecords'][number] | null) {
  if (!record) {
    return {
      status: null,
      lastPaidAt: null,
      totalConfirmed: 0,
      totalConfirmedFormatted: money(0),
    };
  }

  const invoice = latestInvoice(record);
  if (!invoice) {
    return {
      status: null,
      lastPaidAt: null,
      totalConfirmed: 0,
      totalConfirmedFormatted: money(0),
    };
  }

  const confirmedPayments = invoice.paymentTransactions.filter(
    (paymentTransaction) => paymentTransaction.status === PaymentTransactionStatus.CONFIRMED,
  );
  const totalConfirmed = confirmedPayments.reduce((sum, paymentTransaction) => sum + toNumber(paymentTransaction.amount), 0);
  const lastPaidAt = [...confirmedPayments]
    .sort((left, right) => right.transactionDate.getTime() - left.transactionDate.getTime())[0]?.transactionDate;

  return {
    status: invoice.status,
    lastPaidAt: toIsoDate(lastPaidAt),
    totalConfirmed,
    totalConfirmedFormatted: money(totalConfirmed),
  };
}

function matchBillingRecord(room: SelectedRoom, billingCycleId?: string, year?: number, month?: number) {
  if (billingCycleId) {
    return room.billingRecords.find((record) => record.billingCycleId === billingCycleId) ?? null;
  }

  if (year && month) {
    return room.billingRecords.find((record) => record.year === year && record.month === month) ?? null;
  }

  return [...room.billingRecords].sort((left, right) => {
    const leftScore = left.year * 100 + left.month;
    const rightScore = right.year * 100 + right.month;
    return rightScore - leftScore;
  })[0] ?? null;
}

function buildRoomContext(room: SelectedRoom, billingRecord: SelectedRoom['billingRecords'][number] | null, generatedById?: string | null): DocumentRenderContext {
  const contract = pickContract(room, billingRecord?.year, billingRecord?.month);
  const tenant = contract?.primaryTenant ?? room.roomTenants[0]?.tenant ?? null;
  const payment = mapPaymentSummary(billingRecord);
  const billingItems = mapBillingItems(billingRecord);
  const latestInvoiceRecord = billingRecord ? latestInvoice(billingRecord) : null;
  const dueDate = billingRecord ? buildBillingDueDate(billingRecord) : null;
  const building = room.floor.building;
  const totalAmount = billingRecord ? toNumber(billingRecord.total ?? billingRecord.subtotal) : null;

  return {
    room: {
      id: room.id,
      number: room.roomNumber,
      floorNumber: room.floor.floorNumber,
      status: room.status,
      billingStatus: room.billingStatus,
      usageType: room.usageType,
      maxResidents: room.maxResidents,
    },
    tenant: tenant
      ? {
          id: tenant.id,
          firstName: tenant.firstName,
          lastName: tenant.lastName,
          fullName: `${tenant.firstName} ${tenant.lastName}`.trim(),
          phone: tenant.phone,
          email: tenant.email,
          lineUserId: tenant.lineUserId,
        }
      : null,
    contract: contract
      ? {
          id: contract.id,
          startDate: toIsoDate(contract.startDate) ?? '',
          endDate: toIsoDate(contract.endDate) ?? '',
          monthlyRent: toNumber(contract.monthlyRent),
          deposit: contract.deposit ? toNumber(contract.deposit) : null,
          furnitureFee: contract.furnitureFee ? toNumber(contract.furnitureFee) : null,
        }
      : null,
    billing: billingRecord
      ? {
          recordId: billingRecord.id,
          billingCycleId: billingRecord.billingCycleId ?? null,
          year: billingRecord.year,
          month: billingRecord.month,
          subtotal: toNumber(billingRecord.subtotal),
          total: toNumber(billingRecord.total ?? billingRecord.subtotal),
          dueDate: toIsoDate(dueDate),
          billingDay: billingRecord.billingDay,
          dueDay: billingRecord.dueDay,
          overdueDay: billingRecord.overdueDay,
          status: billingRecord.status,
          invoiceId: latestInvoiceRecord?.id ?? null,
          invoiceNumber: latestInvoiceRecord
            ? invoiceNumber(latestInvoiceRecord.id, billingRecord.year, billingRecord.month, room.roomNumber)
            : null,
          invoiceStatus: latestInvoiceRecord?.status ?? null,
        }
      : null,
    billingItems,
    payment,
    apartment: {
      id: building.id,
      name: building.name,
      address: building.address,
    },
    system: {
      generatedAt: new Date().toISOString(),
      generatedById: generatedById ?? null,
    },
    computed: {
      billingMonthLabel: billingRecord ? format(new Date(Date.UTC(billingRecord.year, billingRecord.month - 1, 1)), 'MMMM yyyy') : null,
      dueDateLabel: dueDate ? format(dueDate, 'dd MMMM yyyy') : null,
      occupancyDisplay: buildOccupancyDisplay(room),
      totalAmountFormatted: totalAmount === null ? null : money(totalAmount),
      invoiceNumber: latestInvoiceRecord && billingRecord
        ? invoiceNumber(latestInvoiceRecord.id, billingRecord.year, billingRecord.month, room.roomNumber)
        : null,
      qrPayload: latestInvoiceRecord && billingRecord
        ? `${building.name}|${room.roomNumber}|${billingRecord.year}-${String(billingRecord.month).padStart(2, '0')}|${toNumber(billingRecord.total ?? billingRecord.subtotal)}`
        : null,
    },
  };
}

async function findRoomsForScope(input: DocumentGenerateInput, templateType: DocumentTemplateType): Promise<SelectedRoom[]> {
  const baseWhere: Prisma.RoomWhereInput = {
    isActive: true,
  };

  switch (input.scope) {
    case 'SINGLE_ROOM':
      if (!input.roomId) {
        throw new BadRequestError('roomId is required for SINGLE_ROOM generation');
      }
      baseWhere.id = input.roomId;
      break;
    case 'SELECTED_ROOMS':
      if (!input.roomIds.length) {
        throw new BadRequestError('roomIds is required for SELECTED_ROOMS generation');
      }
      baseWhere.id = { in: input.roomIds };
      break;
    case 'FLOOR':
      if (!input.floorNumber) {
        throw new BadRequestError('floorNumber is required for FLOOR generation');
      }
      baseWhere.floor = { floorNumber: input.floorNumber };
      break;
    case 'OCCUPIED_ROOMS':
      baseWhere.status = RoomStatus.OCCUPIED;
      if (input.floorNumber) {
        baseWhere.floor = { floorNumber: input.floorNumber };
      }
      break;
    case 'ROOMS_WITH_BILLING':
    case 'ELIGIBLE_FOR_MONTH':
      if (input.floorNumber) {
        baseWhere.floor = { floorNumber: input.floorNumber };
      }
      break;
    default:
      break;
  }

  if (input.onlyOccupiedRooms) {
    baseWhere.status = RoomStatus.OCCUPIED;
  }

  const billingRecordsWhere: Prisma.BillingRecordWhereInput = {};
  if (input.billingCycleId) {
    billingRecordsWhere.billingCycleId = input.billingCycleId;
  } else {
    if (input.year) billingRecordsWhere.year = input.year;
    if (input.month) billingRecordsWhere.month = input.month;
  }

  const rooms = await prisma.room.findMany({
    where: baseWhere,
    include: {
      floor: {
        include: {
          building: true,
        },
      },
      roomTenants: {
        where: {
          role: TenantRole.PRIMARY,
          moveOutDate: null,
        },
        include: {
          tenant: true,
        },
      },
      contracts: {
        include: {
          primaryTenant: true,
        },
      },
      billingRecords: {
        where: Object.keys(billingRecordsWhere).length ? billingRecordsWhere : undefined,
        include: {
          items: {
            include: {
              itemType: true,
            },
          },
          invoices: {
            include: {
              paymentTransactions: true,
              deliveries: true,
            },
          },
        },
      },
    },
    orderBy: [{ floor: { floorNumber: 'asc' } }, { roomNumber: 'asc' }],
  });

  if (input.onlyRoomsWithBillingRecord || input.scope === 'ROOMS_WITH_BILLING') {
    return rooms.filter((room) => room.billingRecords.length > 0);
  }

  if (BILLING_TEMPLATE_TYPES.has(templateType) && input.scope === 'ELIGIBLE_FOR_MONTH') {
    return rooms.filter((room) => room.billingRecords.length > 0);
  }

  return rooms;
}

function toPreviewTarget(target: ResolvedDocumentTarget): DocumentGenerationPreviewTarget {
  return {
    roomId: target.roomId,
    roomNumber: target.roomNumber,
    floorNumber: target.floorNumber,
    tenantName: target.tenantName,
    billingRecordId: target.billingRecordId,
    invoiceId: target.invoiceId,
    status: 'READY',
    reason: null,
  };
}

export class DocumentResolverService {
  async resolveTargets(input: DocumentGenerateInput, templateType: DocumentTemplateType, generatedById?: string | null): Promise<ResolvedDocumentTarget[]> {
    const rooms = await findRoomsForScope(input, templateType);

    if (!rooms.length) {
      return [];
    }

    return rooms.map((room) => {
      const record = matchBillingRecord(room, input.billingCycleId, input.year, input.month);
      const context = buildRoomContext(room, record, generatedById ?? null);

      return {
        roomId: room.id,
        roomNumber: room.roomNumber,
        floorNumber: room.floor.floorNumber,
        tenantName: context.tenant?.fullName ?? null,
        billingRecordId: record?.id ?? null,
        invoiceId: context.billing?.invoiceId ?? null,
        context,
      };
    });
  }

  async previewTargets(input: DocumentGenerateInput, templateType: DocumentTemplateType) {
    const resolved = await this.resolveTargets(input, templateType);

    return {
      templateId: input.templateId,
      templateVersionId: input.templateVersionId ?? '',
      scope: input.scope,
      totalRequested: resolved.length,
      readyCount: resolved.length,
      skippedCount: 0,
      failedCount: 0,
      targets: resolved.map(toPreviewTarget),
    };
  }

  async resolvePreviewContext(templateType: DocumentTemplateType, request: TemplatePreviewRequest, generatedById?: string | null): Promise<DocumentRenderContext> {
    const previewInput: DocumentGenerateInput = {
      templateId: 'preview',
      scope: request.roomId ? 'SINGLE_ROOM' : 'ELIGIBLE_FOR_MONTH',
      roomId: request.roomId,
      roomIds: [],
      floorNumber: undefined,
      onlyOccupiedRooms: false,
      onlyRoomsWithBillingRecord: BILLING_TEMPLATE_TYPES.has(templateType),
      dryRun: true,
      includeZipBundle: false,
      billingCycleId: request.billingCycleId,
      year: request.year,
      month: request.month,
      templateVersionId: undefined,
    };

    const targets = await this.resolveTargets(previewInput, templateType, generatedById);
    const first = targets[0];
    if (!first) {
      throw new NotFoundError('Document preview source');
    }
    return first.context;
  }
}

let resolverService: DocumentResolverService | null = null;

export function getDocumentResolverService(): DocumentResolverService {
  if (!resolverService) {
    resolverService = new DocumentResolverService();
  }
  return resolverService;
}
