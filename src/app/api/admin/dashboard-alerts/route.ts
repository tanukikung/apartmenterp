import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { requireRole } from '@/lib/auth/guards';
import { asyncHandler, ApiResponse } from '@/lib/utils/errors';

export const dynamic = 'force-dynamic';

interface DashboardAlert {
  type: 'billing_missing' | 'contract_expiring' | 'overdue_invoices' | 'unmatched_payments' | 'unsent_invoices';
  priority: 'urgent' | 'normal';
  label: string;
  description: string;
  count: number;
  actionLabel: string;
  actionHref: string;
  actionSecondaryHref?: string;
  actionSecondaryLabel?: string;
}

export interface DashboardAlertsData {
  alerts: DashboardAlert[];
  currentBillingPeriod: {
    exists: boolean;
    year: number;
    month: number;
    status: string | null;
    missingRooms: number;
    totalRooms: number;
  } | null;
  expiringContracts: Array<{
    id: string;
    roomNo: string;
    tenantName: string;
    endDate: string;
    daysLeft: number;
  }>;
}

export const GET = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  requireRole(req);

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  // ── 1. Check current billing period status ──────────────────────────────────
  const currentPeriod = await prisma.billingPeriod.findFirst({
    where: { year: currentYear, month: currentMonth },
  });

  const totalActiveRooms = await prisma.room.count({
    where: { roomStatus: { in: ['VACANT', 'OCCUPIED'] } },
  });

  let missingRooms = totalActiveRooms;
  if (currentPeriod) {
    const recordCount = await prisma.roomBilling.count({
      where: { billingPeriodId: currentPeriod.id },
    });
    missingRooms = totalActiveRooms - recordCount;
  }

  // ── 2. Contracts expiring within 7 days ─────────────────────────────────────
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const expiringContracts = await prisma.contract.findMany({
    where: {
      status: 'ACTIVE',
      endDate: {
        gte: now,
        lte: sevenDaysFromNow,
      },
    },
    include: {
      primaryTenant: true,
    },
    orderBy: { endDate: 'asc' },
    take: 5,
  });

  // ── 3. Count unsent invoices ────────────────────────────────────────────────
  const unsentInvoices = await prisma.invoice.count({
    where: { status: 'GENERATED' },
  });

  // ── 4. Count unmatched payments ────────────────────────────────────────────
  // Mirror the /admin/payments review tab exactly: only NEED_REVIEW transactions
  // are shown to the user there, so the dashboard alert count must agree.
  const unmatchedPayments = await prisma.paymentTransaction.count({
    where: { status: 'NEED_REVIEW' },
  });

  // ── 5. Overdue invoices ─────────────────────────────────────────────────────
  const overdueInvoices = await prisma.invoice.count({
    where: { status: 'OVERDUE' },
  });

  // ── Build alerts ───────────────────────────────────────────────────────────
  const alerts: DashboardAlert[] = [];

  // Billing missing alert — only if today is past the 5th of the month
  const dayOfMonth = now.getDate();
  if (!currentPeriod && dayOfMonth >= 3) {
    alerts.push({
      type: 'billing_missing',
      priority: 'urgent',
      label: 'นำเข้าบิล',
      description: `ยังไม่ได้นำเข้าข้อมูลมิเตอร์สำหรับ ${THAI_MONTHS[currentMonth - 1]} ${currentYear + 543}`,
      count: 0,
      actionLabel: 'นำเข้าบิลเลย',
      actionHref: '/admin/billing/import',
    });
  } else if (currentPeriod && missingRooms > 0) {
    alerts.push({
      type: 'billing_missing',
      priority: 'normal',
      label: 'บิลไม่ครบ',
      description: `ขาดข้อมูล ${missingRooms} ห้อง จาก ${totalActiveRooms} ห้อง (${THAI_MONTHS[currentMonth - 1]})`,
      count: missingRooms,
      actionLabel: 'ดูรายละเอียด',
      actionHref: '/admin/billing',
    });
  }

  // Contract expiring alert
  if (expiringContracts.length > 0) {
    const daysLeft = expiringContracts[0].endDate
      ? Math.ceil((expiringContracts[0].endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      : 0;
    const urgent = daysLeft <= 3;
    alerts.push({
      type: 'contract_expiring',
      priority: urgent ? 'urgent' : 'normal',
      label: 'สัญญาใกล้หมดอายุ',
      description: `ห้อง ${expiringContracts[0].roomNo} — ${expiringContracts[0].primaryTenant ? `${expiringContracts[0].primaryTenant.firstName} ${expiringContracts[0].primaryTenant.lastName}` : 'ไม่มีผู้เช่า'} หมดอายุ ${daysLeft} วัน`,
      count: expiringContracts.length,
      actionLabel: 'ดูสัญญา',
      actionSecondaryLabel: 'ต่อสัญญา',
      actionSecondaryHref: `/admin/contracts?status=ACTIVE&expiringBefore=${sevenDaysFromNow.toISOString().split('T')[0]}`,
      actionHref: `/admin/contracts`,
    });
  }

  // Overdue invoices
  if (overdueInvoices > 0) {
    alerts.push({
      type: 'overdue_invoices',
      priority: 'urgent',
      label: 'ใบแจ้งหนี้เกินกำหนด',
      description: `${overdueInvoices} ใบแจ้งหนี้ที่ผู้เช่ายังไม่ชำระเงิน`,
      count: overdueInvoices,
      actionLabel: 'ดูทั้งหมด',
      actionHref: '/admin/overdue',
    });
  }

  // Unsent invoices
  if (unsentInvoices > 0) {
    alerts.push({
      type: 'unsent_invoices',
      priority: 'normal',
      label: 'ใบแจ้งหนี้รอส่ง',
      description: `${unsentInvoices} ใบแจ้งหนี้ที่ยังไม่ได้ส่งให้ผู้เช่า`,
      count: unsentInvoices,
      actionLabel: 'ส่งทั้งหมด',
      actionHref: '/admin/invoices',
      actionSecondaryLabel: 'ส่งทีละใบ',
      actionSecondaryHref: '/admin/invoices',
    });
  }

  // Unmatched payments
  if (unmatchedPayments > 0) {
    alerts.push({
      type: 'unmatched_payments',
      priority: 'normal',
      label: 'รายการชำระเงินรอตรวจสอบ',
      description: `${unmatchedPayments} รายการที่รอจับคู่กับใบแจ้งหนี้`,
      count: unmatchedPayments,
      actionLabel: 'ตรวจสอบ',
      actionHref: '/admin/payments/review',
    });
  }

  const data: DashboardAlertsData = {
    alerts,
    currentBillingPeriod: currentPeriod
      ? {
          exists: true,
          year: currentPeriod.year,
          month: currentPeriod.month,
          status: currentPeriod.status,
          missingRooms,
          totalRooms: totalActiveRooms,
        }
      : null,
    expiringContracts: expiringContracts.map((c) => ({
      id: c.id,
      roomNo: c.roomNo,
      tenantName: c.primaryTenant
        ? `${c.primaryTenant.firstName} ${c.primaryTenant.lastName}`
        : '—',
      endDate: c.endDate.toISOString().split('T')[0],
      daysLeft: Math.ceil((c.endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
    })),
  };

  return NextResponse.json({ success: true, data } as ApiResponse<DashboardAlertsData>);
});

const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];
