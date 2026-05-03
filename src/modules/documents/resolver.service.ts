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
import { BadRequestError } from '@/lib/utils/errors';
import type { DocumentGenerateInput, DocumentGenerationPreviewTarget, TemplatePreviewRequest } from './types';
import { buildPromptPayPayload } from '@/modules/invoices/emv-qr';

type SelectedRoom = Prisma.RoomGetPayload<{
  include: {
    defaultAccount: { select: { id: true, bankName: true, bankAccountNo: true, name: true, promptpay: true } };
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
    number: string;
    startDate: string;
    endDate: string;
    monthlyRent: number;
    deposit: number | null;
    furnitureFee: number | null;
    landlordName?: string | null;
    landlordAddress?: string | null;
    landlordPhone?: string | null;
    signDate?: string | null;
    monthlyRentText?: string | null;
    depositText?: string | null;
    rentDueDay?: number | null;
    specialTerms?: string | null;
    parkingSpaces?: string | null;
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
    extraCharges?: Array<{ description: string; amount: number }>;
    monthName?: string | null;
    issueDate?: string | null;
    isOverdue?: boolean;
    notes?: string | null;
    lateFeeAmount?: number | null;
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
  bankAccount: {
    bankName: string | null;
    accountNo: string | null;
    accountName: string | null;
    promptpayNumber: string | null;
  } | null;
  system: {
    generatedAt: string;
    generatedById: string | null;
  };
  computed: {
    billingMonthLabel: string | null;
    dueDateLabel: string | null;
    issuedDateLabel: string | null;
    occupancyDisplay: string;
    totalAmountFormatted: string | null;
    invoiceNumber: string | null;
    qrPayload: string | null;
    emvQrPayload: string | null;
    qrDataUrl: string | null;
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

async function buildRoomContext(room: SelectedRoom, billingRecord: SelectedRoom['billings'][number] | null, generatedById?: string | null): Promise<DocumentRenderContext> {
  const contract = pickContract(room, billingRecord?.billingPeriod.year, billingRecord?.billingPeriod.month);
  const tenant = contract?.primaryTenant ?? room.tenants[0]?.tenant ?? null;
  const payment = mapPaymentSummary(billingRecord);
  const billingItems = mapBillingItemsFromRoomBilling(billingRecord);
  const latestInvoiceRecord = billingRecord?.invoice ?? null;
  const billingPeriodDueDay = billingRecord?.billingPeriod.dueDay ?? 25;
  const dueDate = billingRecord ? buildBillingDueDate(billingRecord, billingPeriodDueDay) : null;
  const totalAmount = billingRecord ? toNumber(billingRecord.totalDue) : null;

  // Apartment info — read from Config table
  const configs = await prisma.config.findMany({
    where: { key: { in: ['building.name', 'building.address'] } },
  });
  const readString = (key: string): string => {
    const found = configs.find((c) => c.key === key);
    if (!found) return '';
    return typeof found.value === 'string' ? found.value : String(found.value ?? '');
  };
  const apartmentName = readString('building.name') || 'Apartment';
  const apartmentAddress = readString('building.address');

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
          number: contract.id,
          startDate: toIsoDate(contract.startDate) ?? '',
          endDate: toIsoDate(contract.endDate) ?? '',
          monthlyRent: toNumber(contract.monthlyRent),
          monthlyRentText: contract.monthlyRent ? money(toNumber(contract.monthlyRent)) : null,
          deposit: contract.deposit ? toNumber(contract.deposit) : null,
          depositText: contract.deposit ? money(toNumber(contract.deposit)) : null,
          furnitureFee: contract.furnitureFee ? toNumber(contract.furnitureFee) : null,
          landlordName: 'บริษัท เจ้าพ่อคอนโด จำกัด',
          landlordAddress: '123 ถนนสุขุมวิท กรุงเทพฯ 10110',
          landlordPhone: '02-123-4567',
          signDate: contract.startDate ? toIsoDate(contract.startDate) : null,
          parkingSpaces: null,
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
    bankAccount: room.defaultAccount
      ? {
          bankName: room.defaultAccount.bankName ?? null,
          accountNo: room.defaultAccount.bankAccountNo ?? null,
          accountName: room.defaultAccount.name ?? null,
          promptpayNumber: room.defaultAccount.promptpay ?? null,
        }
      : null,
    system: {
      generatedAt: new Date().toISOString(),
      generatedById: generatedById ?? null,
    },
    computed: {
      billingMonthLabel: billingRecord ? format(new Date(Date.UTC(billingRecord.billingPeriod.year, billingRecord.billingPeriod.month - 1, 1)), 'MMMM yyyy') : null,
      dueDateLabel: dueDate ? format(dueDate, 'dd MMMM yyyy') : null,
      issuedDateLabel: latestInvoiceRecord?.issuedAt
        ? (() => {
            const d = new Date(latestInvoiceRecord.issuedAt);
            const dd = String(d.getDate()).padStart(2, '0');
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            return `${dd}/${mm}/${d.getFullYear() + 543}`;
          })()
        : null,
      occupancyDisplay: buildOccupancyDisplay(room),
      totalAmountFormatted: totalAmount === null ? null : money(totalAmount),
      invoiceNumber: latestInvoiceRecord && billingRecord
        ? invoiceNumber(latestInvoiceRecord.id, billingRecord.billingPeriod.year, billingRecord.billingPeriod.month, room.roomNo)
        : null,
      qrPayload: latestInvoiceRecord && billingRecord
        ? `${apartmentName}|${room.roomNo}|${billingRecord.billingPeriod.year}-${String(billingRecord.billingPeriod.month).padStart(2, '0')}|${toNumber(billingRecord.totalDue)}`
        : null,
      emvQrPayload: (() => {
        if (!latestInvoiceRecord || !billingRecord || !room.defaultAccount?.promptpay) return null;
        return buildPromptPayPayload(
          room.defaultAccount.promptpay,
          toNumber(billingRecord.totalDue),
          apartmentName,
        );
      })(),
      qrDataUrl: null, // populated asynchronously in previewTemplate
    },
  };
}

async function findRoomsForScope(input: DocumentGenerateInput, templateType: DocumentTemplateType): Promise<SelectedRoom[]> {
  const baseWhere: Prisma.RoomWhereInput = {
    roomStatus: { in: ['VACANT', 'OCCUPIED'] },
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
      defaultAccount: { select: { id: true, bankName: true, bankAccountNo: true, name: true, promptpay: true } },
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

  // Natural roomNo sort (handles "798/1", "798/10" correctly within each floor)
  const compareRoomNo = (a: string, b: string): number => {
    const parseParts = (s: string) => {
      const slashIdx = s.indexOf('/');
      if (slashIdx === -1) return { prefix: parseInt(s, 10), suffix: 0 };
      return { prefix: parseInt(s.substring(0, slashIdx), 10), suffix: parseInt(s.substring(slashIdx + 1), 10) };
    };
    const aP = parseParts(a);
    const bP = parseParts(b);
    if (aP.prefix !== bP.prefix) return aP.prefix - bP.prefix;
    return aP.suffix - bP.suffix;
  };

  const sortedRooms = [...rooms].sort((a, b) => {
    if (a.floorNo !== b.floorNo) return a.floorNo - b.floorNo;
    return compareRoomNo(a.roomNo, b.roomNo);
  });

  if (input.onlyRoomsWithBillingRecord || input.scope === 'ROOMS_WITH_BILLING') {
    return sortedRooms.filter((room) => room.billings.length > 0);
  }

  if (BILLING_TEMPLATE_TYPES.has(templateType) && input.scope === 'ELIGIBLE_FOR_MONTH') {
    return sortedRooms.filter((room) => room.billings.length > 0);
  }

  return sortedRooms;
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

    return Promise.all(rooms.map(async (room) => {
      const record = matchBillingRecord(room, input.billingCycleId, input.year, input.month);
      const context = await buildRoomContext(room, record, generatedById ?? null);

      return {
        roomId: room.roomNo,
        roomNumber: room.roomNo,
        floorNumber: room.floorNo,
        tenantName: context.tenant?.fullName ?? null,
        billingRecordId: record?.id ?? null,
        invoiceId: context.billing?.invoiceId ?? null,
        context,
      };
    }));
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
      // Fallback: return a sample context so preview always works
      const year = request.year ?? new Date().getFullYear();
      const month = request.month ?? new Date().getMonth() + 1;
      return this.buildSampleContext(templateType, year, month, generatedById);
    }
    return first.context;
  }

  private buildSampleContext(templateType: DocumentTemplateType, year: number, month: number, generatedById?: string | null): DocumentRenderContext {
    const TH_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
    const monthName = TH_MONTHS[month - 1] ?? '';
    const issueDate = new Date().toLocaleDateString('th-TH', { day: '2-digit', month: 'long', year: 'numeric' });
    const dueDateStr = new Date(year, month - 1, 25).toLocaleDateString('th-TH', { day: '2-digit', month: 'long', year: 'numeric' });

    return {
      room: {
        id: 'sample-room-3801',
        number: '3801',
        floorNumber: 3,
        status: 'OCCUPIED',
        billingStatus: 'PENDING',
        usageType: 'RESIDENTIAL',
        maxResidents: 2,
      },
      tenant: {
        id: 'sample-tenant-1',
        firstName: 'สมชาย',
        lastName: 'ใจดี',
        fullName: 'สมชาย ใจดี',
        phone: '081-234-5678',
        email: null,
        lineUserId: null,
      },
      contract: {
        id: 'sample-contract-1',
        number: 'SC-2569-001',
        startDate: `${year}-01-01`,
        endDate: `${year + 1}-12-31`,
        monthlyRent: 2900,
        deposit: 5800,
        furnitureFee: 0,
        landlordName: 'บริษัท เจ้าพ่อคอนโด จำกัด',
        landlordAddress: '123 ถนนสุขุมวิท กรุงเทพฯ 10110',
        landlordPhone: '02-123-4567',
        signDate: issueDate,
        monthlyRentText: 'สองพันเก้าร้อยบาทถ้วน',
        depositText: 'ห้าพันแปดร้อยบาทถ้วน',
        rentDueDay: 5,
        specialTerms: null,
        parkingSpaces: null,
      },
      billing: {
        recordId: 'sample-billing-1',
        billingCycleId: null,
        year,
        month,
        subtotal: 3696,
        total: 3696,
        dueDate: dueDateStr,
        billingDay: 1,
        dueDay: 25,
        overdueDay: 30,
        status: 'PENDING' as RoomBillingStatus,
        invoiceId: null,
        invoiceNumber: null,
        invoiceStatus: null,
        waterUnits: 15,
        waterUsageCharge: 300,
        waterServiceFee: 30,
        waterTotal: 330,
        electricUnits: 120,
        electricUsageCharge: 744,
        electricServiceFee: 0,
        electricTotal: 744,
        rentAmount: 2900,
        furnitureFee: 0,
        otherFee: 0,
        waterPrev: 1185,
        waterCurr: 1200,
        electricPrev: null,
        electricCurr: null,
        extraCharges: [],
        monthName: `${monthName} ${year}`,
        issueDate,
        isOverdue: false,
        notes: null,
        lateFeeAmount: null,
      },
      billingItems: [],
      payment: {
        status: null,
        lastPaidAt: null,
        totalConfirmed: 0,
        totalConfirmedFormatted: '0',
      },
      apartment: {
        id: null,
        name: 'Apartment',
        address: '123 ถนนสุขุมวิท กรุงเทพฯ 10110',
      },
      bankAccount: null,
      system: {
        generatedAt: new Date().toISOString(),
        generatedById: generatedById ?? null,
      },
      computed: {
        billingMonthLabel: `${monthName} ${year}`,
        dueDateLabel: dueDateStr,
        issuedDateLabel: null,
        occupancyDisplay: 'ผู้เช่า 1 คน',
        totalAmountFormatted: '3,696',
        invoiceNumber: null,
        qrPayload: null,
        emvQrPayload: null,
        qrDataUrl: null,
      },
    };
  }
}

let resolverService: DocumentResolverService | null = null;

export function getDocumentResolverService(): DocumentResolverService {
  if (!resolverService) {
    resolverService = new DocumentResolverService();
  }
  return resolverService;
}
