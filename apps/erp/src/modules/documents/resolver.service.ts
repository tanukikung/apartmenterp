import { format } from 'date-fns';
import {
  RoomBillingStatus,
  DocumentTemplateType,
  InvoiceStatus,
  PaymentTransactionStatus,
  Prisma,
  TenantRole,
} from '@prisma/client';
import { prisma } from '@/lib/db/client';
import { BadRequestError, NotFoundError } from '@/lib/utils/errors';
import type { DocumentGenerateInput, DocumentGenerationPreviewTarget, TemplatePreviewRequest } from './types';

type SelectedRoom = Prisma.RoomGetPayload<{
  include: {
    tenants: { where: { role: 'PRIMARY'; moveOutDate: null }; include: { tenant: true } };
    contracts: { include: { primaryTenant: true } };
    billings: {
      include: {
        billingPeriod: true;
        invoice: {
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
    status: string;
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
    status: RoomBillingStatus;
    invoiceId: string | null;
    invoiceNumber: string | null;
    invoiceStatus: InvoiceStatus | null;
    // Meter readings
    waterUnits: number;
    waterUsageCharge: number;
    waterServiceFee: number;
    waterTotal: number;
    electricUnits: number;
    electricUsageCharge: number;
    electricServiceFee: number;
    electricTotal: number;
    // Fee breakdown
    rentAmount: number;
    furnitureFee: number;
    otherFee: number;
    // Raw meter values
    waterPrev: number | null;
    waterCurr: number | null;
    electricPrev: number | null;
    electricCurr: number | null;
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

function invoiceNumber(invoiceId: string, year: number, month: number, roomNo: string): string {
  return `INV-${year}-${String(month).padStart(2, '0')}-${roomNo}-${invoiceId.slice(0, 6).toUpperCase()}`;
}

function buildBillingDueDate(record: SelectedRoom['billings'][number], billingPeriodDueDay: number): Date {
  return new Date(Date.UTC(record.billingPeriod.year, record.billingPeriod.month - 1, billingPeriodDueDay, 0, 0, 0, 0));
}

function mapPaymentSummary(record: SelectedRoom['billings'][number] | null) {
  if (!record || !record.invoice) {
    return {
      status: null,
      lastPaidAt: null,
      totalConfirmed: 0,
      totalConfirmedFormatted: money(0),
    };
  }

  const invoice = record.invoice;

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

function matchBillingRecord(room: SelectedRoom, billingCycleId?: string, year?: number, month?: number): SelectedRoom['billings'][number] | null {
  if (billingCycleId) {
    return room.billings.find((record) => record.billingPeriodId === billingCycleId) ?? null;
  }

  if (year && month) {
    return room.billings.find((record) => record.billingPeriod.year === year && record.billingPeriod.month === month) ?? null;
  }

  return [...room.billings].sort((left, right) => {
    const leftScore = left.billingPeriod.year * 100 + left.billingPeriod.month;
    const rightScore = right.billingPeriod.year * 100 + right.billingPeriod.month;
    return rightScore - leftScore;
  })[0] ?? null;
}

function buildOccupancyDisplay(room: SelectedRoom): string {
  const names = room.tenants
    .map((roomTenant) => {
      const tenant = roomTenant.tenant;
      return `${tenant.firstName} ${tenant.lastName}`.trim();
    })
    .filter(Boolean);

  if (!names.length) return 'No active resident';
  return names.join(', ');
}

// Derive billing items from RoomBilling flat fields (no separate items table in new schema)
function mapBillingItemsFromRoomBilling(record: SelectedRoom['billings'][number] | null): DocumentRenderBillingItem[] {
  if (!record) return [];

  const items: DocumentRenderBillingItem[] = [];

  const rent = toNumber(record.rentAmount);
  if (rent > 0) {
    items.push({
      typeCode: 'RENT',
      typeName: 'ค่าเช่า',
      description: null,
      quantity: 1,
      unitPrice: rent,
      unitPriceFormatted: money(rent),
      amount: rent,
      amountFormatted: money(rent),
    });
  }

  const waterTotal = toNumber(record.waterTotal);
  if (waterTotal > 0) {
    items.push({
      typeCode: 'WATER',
      typeName: 'ค่าน้ำ',
      description: null,
      quantity: toNumber(record.waterUnits),
      unitPrice: waterTotal > 0 && toNumber(record.waterUnits) > 0 ? waterTotal / toNumber(record.waterUnits) : waterTotal,
      unitPriceFormatted: money(0),
      amount: waterTotal,
      amountFormatted: money(waterTotal),
    });
  }

  const electricTotal = toNumber(record.electricTotal);
  if (electricTotal > 0) {
    items.push({
      typeCode: 'ELECTRIC',
      typeName: 'ค่าไฟ',
      description: null,
      quantity: toNumber(record.electricUnits),
      unitPrice: electricTotal > 0 && toNumber(record.electricUnits) > 0 ? electricTotal / toNumber(record.electricUnits) : electricTotal,
      unitPriceFormatted: money(0),
      amount: electricTotal,
      amountFormatted: money(electricTotal),
    });
  }

  const furnitureFee = toNumber(record.furnitureFee);
  if (furnitureFee > 0) {
    items.push({
      typeCode: 'FURNITURE',
      typeName: 'ค่าเฟอร์นิเจอร์',
      description: null,
      quantity: 1,
      unitPrice: furnitureFee,
      unitPriceFormatted: money(furnitureFee),
      amount: furnitureFee,
      amountFormatted: money(furnitureFee),
    });
  }

  const otherFee = toNumber(record.otherFee);
  if (otherFee > 0) {
    items.push({
      typeCode: 'OTHER',
      typeName: 'อื่นๆ',
      description: null,
      quantity: 1,
      unitPrice: otherFee,
      unitPriceFormatted: money(otherFee),
      amount: otherFee,
      amountFormatted: money(otherFee),
    });
  }

  return items;
}

function buildRoomContext(room: SelectedRoom, billingRecord: SelectedRoom['billings'][number] | null, generatedById?: string | null): DocumentRenderContext {
  const contract = pickContract(room, billingRecord?.billingPeriod.year, billingRecord?.billingPeriod.month);
  const tenant = contract?.primaryTenant ?? room.tenants[0]?.tenant ?? null;
  const payment = mapPaymentSummary(billingRecord);
  const billingItems = mapBillingItemsFromRoomBilling(billingRecord);
  const latestInvoiceRecord = billingRecord?.invoice ?? null;
  const billingPeriodDueDay = billingRecord?.billingPeriod.dueDay ?? 25;
  const dueDate = billingRecord ? buildBillingDueDate(billingRecord, billingPeriodDueDay) : null;
  const totalAmount = billingRecord ? toNumber(billingRecord.totalDue) : null;

  // Apartment info — no Building model; use placeholder values
  const apartmentName = 'Apartment';
  const apartmentAddress = '';

  return {
    room: {
      id: room.roomNo,
      number: room.roomNo,
      floorNumber: room.floorNo,
      status: room.roomStatus,
      billingStatus: billingRecord?.status ?? '',
      usageType: '',
      maxResidents: 0,
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
          billingCycleId: billingRecord.billingPeriodId,
          year: billingRecord.billingPeriod.year,
          month: billingRecord.billingPeriod.month,
          subtotal: toNumber(billingRecord.totalDue),
          total: toNumber(billingRecord.totalDue),
          dueDate: toIsoDate(dueDate),
          billingDay: 1,
          dueDay: billingPeriodDueDay,
          overdueDay: billingPeriodDueDay + 5,
          status: billingRecord.status,
          invoiceId: latestInvoiceRecord?.id ?? null,
          invoiceNumber: latestInvoiceRecord
            ? invoiceNumber(latestInvoiceRecord.id, billingRecord.billingPeriod.year, billingRecord.billingPeriod.month, room.roomNo)
            : null,
          invoiceStatus: latestInvoiceRecord?.status ?? null,
          // Meter readings
          waterUnits: toNumber(billingRecord.waterUnits),
          waterUsageCharge: toNumber(billingRecord.waterUsageCharge),
          waterServiceFee: toNumber(billingRecord.waterServiceFee),
          waterTotal: toNumber(billingRecord.waterTotal),
          electricUnits: toNumber(billingRecord.electricUnits),
          electricUsageCharge: toNumber(billingRecord.electricUsageCharge),
          electricServiceFee: toNumber(billingRecord.electricServiceFee),
          electricTotal: toNumber(billingRecord.electricTotal),
          // Fee breakdown
          rentAmount: toNumber(billingRecord.rentAmount),
          furnitureFee: toNumber(billingRecord.furnitureFee),
          otherFee: toNumber(billingRecord.otherFee),
          // Raw meter values
          waterPrev: billingRecord.waterPrev ? toNumber(billingRecord.waterPrev) : null,
          waterCurr: billingRecord.waterCurr ? toNumber(billingRecord.waterCurr) : null,
          electricPrev: billingRecord.electricPrev ? toNumber(billingRecord.electricPrev) : null,
          electricCurr: billingRecord.electricCurr ? toNumber(billingRecord.electricCurr) : null,
        }
      : null,
    billingItems,
    payment,
    apartment: {
      id: null,
      name: apartmentName,
      address: apartmentAddress,
    },
    system: {
      generatedAt: new Date().toISOString(),
      generatedById: generatedById ?? null,
    },
    computed: {
      billingMonthLabel: billingRecord ? format(new Date(Date.UTC(billingRecord.billingPeriod.year, billingRecord.billingPeriod.month - 1, 1)), 'MMMM yyyy') : null,
      dueDateLabel: dueDate ? format(dueDate, 'dd MMMM yyyy') : null,
      occupancyDisplay: buildOccupancyDisplay(room),
      totalAmountFormatted: totalAmount === null ? null : money(totalAmount),
      invoiceNumber: latestInvoiceRecord && billingRecord
        ? invoiceNumber(latestInvoiceRecord.id, billingRecord.billingPeriod.year, billingRecord.billingPeriod.month, room.roomNo)
        : null,
      qrPayload: latestInvoiceRecord && billingRecord
        ? `${apartmentName}|${room.roomNo}|${billingRecord.billingPeriod.year}-${String(billingRecord.billingPeriod.month).padStart(2, '0')}|${toNumber(billingRecord.totalDue)}`
        : null,
    },
  };
}

async function findRoomsForScope(input: DocumentGenerateInput, templateType: DocumentTemplateType): Promise<SelectedRoom[]> {
  const baseWhere: Prisma.RoomWhereInput = {
    roomStatus: 'ACTIVE',
  };

  switch (input.scope) {
    case 'SINGLE_ROOM':
      if (!input.roomId) {
        throw new BadRequestError('roomId is required for SINGLE_ROOM generation');
      }
      baseWhere.roomNo = input.roomId;
      break;
    case 'SELECTED_ROOMS':
      if (!input.roomIds.length) {
        throw new BadRequestError('roomIds is required for SELECTED_ROOMS generation');
      }
      baseWhere.roomNo = { in: input.roomIds };
      break;
    case 'FLOOR':
      if (!input.floorNumber) {
        throw new BadRequestError('floorNumber is required for FLOOR generation');
      }
      baseWhere.floorNo = input.floorNumber;
      break;
    case 'OCCUPIED_ROOMS':
      // Occupied = has active tenants
      baseWhere.tenants = { some: { moveOutDate: null } };
      if (input.floorNumber) {
        baseWhere.floorNo = input.floorNumber;
      }
      break;
    case 'ROOMS_WITH_BILLING':
    case 'ELIGIBLE_FOR_MONTH':
      if (input.floorNumber) {
        baseWhere.floorNo = input.floorNumber;
      }
      break;
    default:
      break;
  }

  if (input.onlyOccupiedRooms) {
    baseWhere.tenants = { some: { moveOutDate: null } };
  }

  const billingsWhere: Prisma.RoomBillingWhereInput = {};
  if (input.billingCycleId) {
    billingsWhere.billingPeriodId = input.billingCycleId;
  } else {
    if (input.year || input.month) {
      billingsWhere.billingPeriod = {};
      if (input.year) billingsWhere.billingPeriod.year = input.year;
      if (input.month) billingsWhere.billingPeriod.month = input.month;
    }
  }

  const rooms = await prisma.room.findMany({
    where: baseWhere,
    include: {
      tenants: {
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
      billings: {
        where: Object.keys(billingsWhere).length ? billingsWhere : undefined,
        include: {
          billingPeriod: true,
          invoice: {
            include: {
              paymentTransactions: true,
              deliveries: true,
            },
          },
        },
      },
    },
    orderBy: [{ floorNo: 'asc' }, { roomNo: 'asc' }],
  });

  if (input.onlyRoomsWithBillingRecord || input.scope === 'ROOMS_WITH_BILLING') {
    return rooms.filter((room) => room.billings.length > 0);
  }

  if (BILLING_TEMPLATE_TYPES.has(templateType) && input.scope === 'ELIGIBLE_FOR_MONTH') {
    return rooms.filter((room) => room.billings.length > 0);
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
        roomId: room.roomNo,
        roomNumber: room.roomNo,
        floorNumber: room.floorNo,
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
