'use client';

import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ─── Client-safe types (no server imports) ───────────────────────────────────

interface DiffChange {
  field: string;
  before: unknown;
  after: unknown;
}

interface DiffResult {
  changes: DiffChange[];
  hasChanges: boolean;
}

interface FinancialAuditEntry {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  before: unknown;
  after: unknown;
  diff: DiffResult;
  performedBy: string;
  performedByName: string | null;
  correlationId: string | null;
  timestamp: string;
  metadata: Record<string, unknown> | null;
}

interface FinancialAuditTimelineProps {
  entityType: string;
  entityId: string;
}

// ─── Action labels ─────────────────────────────────────────────────────────────

function actionLabel(action: string): string {
  const labels: Record<string, { th: string }> = {
    INVOICE_CANCELLED:     { th: 'ยกเลิกใบแจ้งหนี้' },
    INVOICE_CANCEL_UNDONE: { th: 'ยกเลิกการยกเลิก' },
    PAYMENT_CONFIRMED:     { th: 'บันทึกชำระเงิน' },
    PAYMENT_MATCH_UNDONE: { th: 'ยกเลิกการจับคู่' },
    PAYMENT_CREATED:      { th: 'สร้างรายการชำระเงิน' },
    INVOICE_RESTORED:      { th: 'กู้คืนใบแจ้งหนี้' },
    PAYMENT_RESTORED:     { th: 'กู้คืนการชำระเงิน' },
    INVOICE_PAYMENT_UNDONE:{ th: 'ย้อนการชำระเงิน' },
  };
  return labels[action]?.th ?? action;
}

const ACTION_STYLES: Record<string, { border: string; bg: string; text: string }> = {
  INVOICE_CANCELLED:      { border: 'border-red-200',   bg: 'bg-red-50',    text: 'text-red-600' },
  INVOICE_CANCEL_UNDONE:  { border: 'border-emerald-200',bg: 'bg-emerald-50', text: 'text-emerald-600' },
  PAYMENT_CONFIRMED:     { border: 'border-blue-200',   bg: 'bg-blue-50',    text: 'text-blue-600' },
  PAYMENT_MATCH_UNDONE:   { border: 'border-orange-200', bg: 'bg-orange-50',  text: 'text-orange-600' },
  PAYMENT_CREATED:       { border: 'border-blue-200',   bg: 'bg-blue-50',    text: 'text-blue-600' },
  INVOICE_RESTORED:      { border: 'border-amber-200',  bg: 'bg-amber-50',  text: 'text-amber-600' },
  PAYMENT_RESTORED:     { border: 'border-amber-200',  bg: 'bg-amber-50',  text: 'text-amber-600' },
  INVOICE_PAYMENT_UNDONE: { border: 'border-purple-200', bg: 'bg-purple-50', text: 'text-purple-600' },
};

// ─── Diff summary ──────────────────────────────────────────────────────────────

function DiffSummary({ diff }: { diff: DiffResult }) {
  const [expanded, setExpanded] = useState(false);
  if (!diff.changes?.length) return null;

  return (
    <div className="mt-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-xs text-gray-500 hover:text-gray-700 underline"
      >
        {expanded ? 'ซ่อนรายละเอียด' : `ดู ${diff.changes.length} การเปลี่ยนแปลง`}
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-1 space-y-1"
          >
            {diff.changes.map((c) => (
              <div key={c.field} className="text-xs flex items-start gap-2 font-mono">
                <span className="text-gray-400 min-w-[80px]">{c.field}</span>
                <span className="text-red-400 line-through">{JSON.stringify(c.before)}</span>
                <span className="text-gray-300">→</span>
                <span className="text-emerald-600">{JSON.stringify(c.after)}</span>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Single entry ──────────────────────────────────────────────────────────────

function AuditEntry({ entry }: { entry: FinancialAuditEntry }) {
  const [showFull, setShowFull] = useState(false);
  const style = ACTION_STYLES[entry.action] ?? { border: 'border-gray-200', bg: 'bg-gray-50', text: 'text-gray-600' };

  return (
    <div className={`relative pl-6 pb-5 border-l-2 ${style.border}`}>
      {/* Timeline dot */}
      <div className={`absolute -left-[5px] top-1.5 w-2 h-2 rounded-full bg-current ${style.text}`} />

      <div className={`rounded-lg border p-3 ${style.border} ${style.bg}`}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <span className={`font-semibold text-sm ${style.text}`}>{actionLabel(entry.action)}</span>
            <p className="text-xs text-gray-500 mt-0.5">{entry.performedByName ?? entry.performedBy}</p>
          </div>
          <time className="text-xs text-gray-400 whitespace-nowrap">
            {format(new Date(entry.timestamp), 'dd MMM yyyy, HH:mm', { locale: th })}
          </time>
        </div>

        {entry.diff?.changes?.length ? <DiffSummary diff={entry.diff} /> : null}

        {showFull && (
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs font-mono">
            <div>
              <p className="text-gray-500 font-semibold mb-1">ก่อน</p>
              <pre className="bg-white/60 rounded p-2 overflow-auto max-h-40">{JSON.stringify(entry.before, null, 2)}</pre>
            </div>
            <div>
              <p className="text-gray-500 font-semibold mb-1">หลัง</p>
              <pre className="bg-white/60 rounded p-2 overflow-auto max-h-40">{JSON.stringify(entry.after, null, 2)}</pre>
            </div>
          </div>
        )}
        <button onClick={() => setShowFull(!showFull)} className="text-xs text-gray-400 hover:text-gray-600 mt-2">
          {showFull ? 'ซ่อน' : 'ดูทั้งหมด'}
        </button>
      </div>
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────────

export function FinancialAuditTimeline({ entityType, entityId }: FinancialAuditTimelineProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['financial-audit', entityType, entityId],
    queryFn: async () => {
      const res = await fetch(`/api/financial-audit?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}&limit=50`);
      if (!res.ok) throw new Error('Failed to fetch financial audit');
      const json = await res.json() as { data?: FinancialAuditEntry[] };
      return json.data ?? [];
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 rounded-lg bg-gray-100 animate-pulse" />
        ))}
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400">
        <p className="text-sm">ยังไม่มีประวัติการแก้ไข</p>
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {data.map((entry) => (
        <AuditEntry key={entry.id} entry={entry} />
      ))}
    </div>
  );
}