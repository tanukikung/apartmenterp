'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Home,
  AlertTriangle,
  DollarSign,
  Wrench,
  Receipt,
  ArrowRight,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import { MagneticCard, FadeIn, StaggerList, StaggerItem } from '@/components/motion/motion-primitives';
import { useTheme } from '@/hooks/useTheme';
import { useQuery } from '@tanstack/react-query';

// ============================================================================
// Types
// ============================================================================

type OccupancyData = {
  totalRooms: number;
  occupiedRooms: number;
  vacantRooms: number;
  maintenanceRooms: number;
};

type SummaryData = {
  monthlyRevenue: number;
  unpaidInvoices: number;
  paidInvoices: number;
  overdueInvoices: number;
};

// ============================================================================
// Components
// ============================================================================

function MetricCard({
  icon: Icon,
  label,
  value,
  trend,
  color,
}: {
  icon: typeof Home;
  label: string;
  value: string | number;
  trend?: { value: number; isPositive: boolean };
  color: string;
}) {
  const t = useTheme();

  return (
    <motion.div
      className="rounded-2xl border overflow-hidden transition-all hover:shadow-lg"
      style={{
        backgroundColor: t.colors.background.primary,
        borderColor: t.colors.border.light,
      }}
      whileHover={{ y: -4 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
    >
      <div className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div
            className="p-3 rounded-lg"
            style={{ backgroundColor: color + '20' }}
          >
            <Icon className="h-6 w-6" style={{ color }} />
          </div>
          {trend && (
            <div
              className="text-sm font-semibold"
              style={{
                color: trend.isPositive ? t.colors.success.main : t.colors.error.main,
              }}
            >
              {trend.isPositive ? '↑' : '↓'} {trend.value}%
            </div>
          )}
        </div>
        <p className="text-sm" style={{ color: t.colors.text.secondary }}>
          {label}
        </p>
        <p className="text-3xl font-bold mt-2" style={{ color: t.colors.text.primary }}>
          {value}
        </p>
      </div>
    </motion.div>
  );
}

function AlertCard({
  icon: Icon,
  title,
  count,
  severity,
}: {
  icon: typeof AlertTriangle;
  title: string;
  count: number;
  severity: 'danger' | 'warning' | 'info';
}) {
  const t = useTheme();

  const severityConfig = {
    danger: { bg: t.colors.error.light, text: t.colors.error.main, icon: t.colors.error.main },
    warning: { bg: t.colors.warning.light, text: t.colors.warning.main, icon: t.colors.warning.main },
    info: { bg: t.colors.info.light, text: t.colors.info.main, icon: t.colors.info.main },
  };

  const config = severityConfig[severity];

  return (
    <motion.div
      className="rounded-xl border p-4 flex items-start gap-4 cursor-pointer transition-all hover:shadow-md"
      style={{
        backgroundColor: config.bg,
        borderColor: config.text,
      }}
      whileHover={{ scale: 1.02 }}
    >
      <Icon className="h-5 w-5 mt-0.5 flex-shrink-0" style={{ color: config.icon }} />
      <div className="flex-1 min-w-0">
        <h4 className="font-semibold text-sm" style={{ color: config.text }}>
          {title}
        </h4>
        <p className="text-lg font-bold mt-1" style={{ color: config.text }}>
          {count}
        </p>
      </div>
    </motion.div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export default function DashboardPage() {
  const t = useTheme();

  // Fetch dashboard data
  const { data: occupancy } = useQuery({
    queryKey: ['dashboard-occupancy'],
    queryFn: async () => {
      const res = await fetch('/api/analytics/occupancy');
      if (!res.ok) throw new Error('Failed to fetch occupancy');
      const json = await res.json();
      return json.data as OccupancyData;
    },
  });

  const { data: summary } = useQuery({
    queryKey: ['dashboard-summary'],
    queryFn: async () => {
      const res = await fetch('/api/analytics/summary');
      if (!res.ok) throw new Error('Failed to fetch summary');
      const json = await res.json();
      return json.data as SummaryData;
    },
  });

  return (
    <motion.div className="space-y-8">
      {/* Header */}
      <FadeIn>
        <div>
          <h1 className="text-4xl font-bold" style={{ color: t.colors.text.primary }}>
            Dashboard
          </h1>
          <p className="mt-2 text-lg" style={{ color: t.colors.text.secondary }}>
            ยินดีต้อนรับกลับมา! นี่คือภาพรวมของระบบจัดการ
          </p>
        </div>
      </FadeIn>

      {/* Key Metrics */}
      <StaggerList>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StaggerItem>
            <MetricCard
              icon={Home}
              label="ห้องที่เช่า"
              value={occupancy?.occupiedRooms ?? 0}
              trend={{ value: 12, isPositive: true }}
              color={t.colors.primary[500]}
            />
          </StaggerItem>
          <StaggerItem>
            <MetricCard
              icon={DollarSign}
              label="รายได้เดือนนี้"
              value={`฿${(summary?.monthlyRevenue ?? 0).toLocaleString()}`}
              trend={{ value: 8, isPositive: true }}
              color={t.colors.success.main}
            />
          </StaggerItem>
          <StaggerItem>
            <MetricCard
              icon={Receipt}
              label="บิลค้างชำระ"
              value={summary?.unpaidInvoices ?? 0}
              trend={{ value: 5, isPositive: false }}
              color={t.colors.warning.main}
            />
          </StaggerItem>
          <StaggerItem>
            <MetricCard
              icon={Wrench}
              label="ปัญหาที่รอแก้"
              value={0}
              color={t.colors.error.main}
            />
          </StaggerItem>
        </div>
      </StaggerList>

      {/* Alerts Section */}
      <div>
        <h2 className="text-xl font-bold mb-4" style={{ color: t.colors.text.primary }}>
          แจ้งเตือน
        </h2>
        <StaggerList>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StaggerItem>
              <AlertCard
                icon={AlertTriangle}
                title="บิลเกินกำหนด"
                count={summary?.overdueInvoices ?? 0}
                severity="danger"
              />
            </StaggerItem>
            <StaggerItem>
              <AlertCard
                icon={Clock}
                title="รอการตรวจสอบ"
                count={0}
                severity="warning"
              />
            </StaggerItem>
            <StaggerItem>
              <AlertCard
                icon={CheckCircle2}
                title="ปัญหาที่แก้แล้ว"
                count={0}
                severity="info"
              />
            </StaggerItem>
          </div>
        </StaggerList>
      </div>

      {/* Quick Links */}
      <div>
        <h2 className="text-xl font-bold mb-4" style={{ color: t.colors.text.primary }}>
          ลิงค์ด่วน
        </h2>
        <StaggerList>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <StaggerItem>
              <MagneticCard>
                <Link
                  href="/admin/billing"
                  className="block rounded-xl border p-6 transition-all hover:shadow-lg"
                  style={{
                    backgroundColor: t.colors.background.primary,
                    borderColor: t.colors.border.light,
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold" style={{ color: t.colors.text.primary }}>
                        จัดการบิล
                      </h3>
                      <p className="text-sm mt-1" style={{ color: t.colors.text.secondary }}>
                        สร้างและดูแลบิลประจำเดือน
                      </p>
                    </div>
                    <ArrowRight className="h-5 w-5" style={{ color: t.colors.primary[500] }} />
                  </div>
                </Link>
              </MagneticCard>
            </StaggerItem>
            <StaggerItem>
              <MagneticCard>
                <Link
                  href="/admin/contracts"
                  className="block rounded-xl border p-6 transition-all hover:shadow-lg"
                  style={{
                    backgroundColor: t.colors.background.primary,
                    borderColor: t.colors.border.light,
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold" style={{ color: t.colors.text.primary }}>
                        สัญญาเช่า
                      </h3>
                      <p className="text-sm mt-1" style={{ color: t.colors.text.secondary }}>
                        ดูแลและอัปเดตสัญญาเช่า
                      </p>
                    </div>
                    <ArrowRight className="h-5 w-5" style={{ color: t.colors.primary[500] }} />
                  </div>
                </Link>
              </MagneticCard>
            </StaggerItem>
          </div>
        </StaggerList>
      </div>
    </motion.div>
  );
}
