import { Prisma, InvoiceStatus } from '@prisma/client';
import { prisma } from '@/lib/db/client';
import { buildInvoiceAccessUrl } from '@/lib/invoices/access';
import { logger } from '@/lib/utils/logger';

/**
 * Result of a tenant's balance inquiry.
 */
export interface BalanceInquiryResult {
  hasOutstanding: boolean;
  roomNo: string | null;
  invoiceId: string | null;
  invoiceNumber: string | null;
  /** ISO date string of the due date */
  dueDate: string | null;
  periodLabel: string | null;
  totalAmount: number | null;
  status: string | null;
  pdfUrl: string | null;
  /** True when the room has no linked LINE user at all */
  notLinked: boolean;
  /** True when LINE is not configured on the server side */
  lineNotConfigured: boolean;
}

/**
 * THAI_MONTHS[month-1] -> "มกราคม" .. "ธันวาคม"
 */
const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

function formatThaiMonth(month: number, year: number): string {
  return `${THAI_MONTHS[month - 1]} ${year + 543}`;
}

/**
 * Look up the most recent invoice with an unpaid status for a given LINE user.
 *
 * Unpaid = GENERATED | SENT | VIEWED | OVERDUE
 *
 * Returns null if no unpaid invoice exists or if the LINE user is not linked
 * to any active tenant/room.
 */
export async function getLatestUnpaidInvoiceForLineUser(
  lineUserId: string
): Promise<BalanceInquiryResult> {
  // Find the active conversation (or LineUser) to get roomNo
  const conversation = await prisma.conversation.findUnique({
    where: { lineUserId },
    include: {
      room: {
        include: {
          tenants: {
            where: { role: 'PRIMARY', moveOutDate: null },
            include: { tenant: true },
            take: 1,
          },
        },
      },
    },
  });

  const roomNo = conversation?.roomNo ?? conversation?.room?.roomNo ?? null;

  // Also try the LineUser -> Conversation -> Tenant -> Room path
  // (LineUser has no direct tenant relation; tenant is accessed through Conversation)
  const conversationWithTenant = await prisma.conversation.findUnique({
    where: { lineUserId },
    include: {
      tenant: {
        include: {
          roomTenants: {
            where: { role: 'PRIMARY', moveOutDate: null },
            include: { room: true },
            take: 1,
          },
        },
      },
    },
  });

  // Determine the effective room number
  let effectiveRoomNo: string | null = roomNo;
  if (!effectiveRoomNo && conversationWithTenant?.tenant) {
    effectiveRoomNo =
      conversationWithTenant.tenant.roomTenants?.[0]?.room?.roomNo ?? null;
  }
  if (!effectiveRoomNo && conversationWithTenant?.tenant?.roomTenants?.[0]?.room) {
    effectiveRoomNo = conversationWithTenant.tenant.roomTenants[0].room.roomNo;
  }

  if (!effectiveRoomNo) {
    logger.warn({ type: 'balance_inquiry_no_room', lineUserId });
    return {
      hasOutstanding: false,
      roomNo: null,
      invoiceId: null,
      invoiceNumber: null,
      dueDate: null,
      periodLabel: null,
      totalAmount: null,
      status: null,
      pdfUrl: null,
      notLinked: true,
      lineNotConfigured: false,
    };
  }

  // Find the most recent unpaid invoice for this room
  const unpaidStatuses: InvoiceStatus[] = [
    'GENERATED',
    'SENT',
    'VIEWED',
    'OVERDUE',
  ];

  const invoice = await prisma.invoice.findFirst({
    where: {
      roomNo: effectiveRoomNo,
      status: { in: unpaidStatuses },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!invoice) {
    return {
      hasOutstanding: false,
      roomNo: effectiveRoomNo,
      invoiceId: null,
      invoiceNumber: null,
      dueDate: null,
      periodLabel: null,
      totalAmount: null,
      status: null,
      pdfUrl: null,
      notLinked: false,
      lineNotConfigured: false,
    };
  }

  const invoiceNumber = `INV-${invoice.year}${String(invoice.month).padStart(2, '0')}-${invoice.roomNo}`;
  const dueDateStr = invoice.dueDate.toISOString().split('T')[0];
  const periodLabel = formatThaiMonth(invoice.month, invoice.year);
  const baseUrl = process.env.APP_BASE_URL || '';
  const pdfUrl = buildInvoiceAccessUrl(invoice.id, {
    absoluteBaseUrl: baseUrl,
    signed: true,
    expiresInSeconds: 60 * 60, // 1 hour for payment link
  });

  return {
    hasOutstanding: true,
    roomNo: invoice.roomNo,
    invoiceId: invoice.id,
    invoiceNumber,
    dueDate: dueDateStr,
    periodLabel,
    totalAmount: Number(invoice.totalAmount),
    status: invoice.status,
    pdfUrl,
    notLinked: false,
    lineNotConfigured: false,
  };
}
