'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import {
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  ShieldAlert,
  XCircle,
  ShieldCheck,
} from 'lucide-react';

interface ReconciliationIssue {
  id: string;
  type: string;
  entityType: string;
  entityId: string;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  description: string;
  metadata: unknown;
  detectedAt: string;
}

function severityIcon(severity: string) {
  if (severity === 'CRITICAL') return <XCircle className="h-4 w-4 text-red-400" />;
  if (severity === 'WARNING') return <AlertTriangle className="h-4 w-4 text-amber-400" />;
  return <CheckCircle2 className="h-4 w-4 text-blue-400" />;
}

function severityStyle(severity: string) {
  if (severity === 'CRITICAL') return 'border-red-500/30 bg-red-50/30';
  if (severity === 'WARNING') return 'border-amber-500/30 bg-amber-50/30';
  return 'border-blue-500/30 bg-blue-50/30';
}

function typeLabel(type: string) {
  const labels: Record<string, string> = {
    INVOICE_PAYMENT_MISMATCH: 'ยอดไม่ตรงกัน',
    PAID_INVOICE_NO_PAYMENT: 'ใบแจ้งหนี้ชำระแล้วแต่ไม่มีการชำระ',
    NEGATIVE_BALANCE: 'ชำระเกินยอด',
    DUPLICATE_PAYMENT_MATCH: 'จับคู่ซ้ำ',
  };
  return labels[type] ?? type;
}

export function DataIssuesPanel() {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [resolveDialog, setResolveDialog] = useState<ReconciliationIssue | null>(null);
  const [resolveType, setResolveType] = useState<'FIXED' | 'IGNORED'>('FIXED');

  const { data, isLoading, refetch: _refetch } = useQuery<{ data: ReconciliationIssue[]; meta: { critical: number; warning: number; info: number } }>({
    queryKey: ['reconciliation-issues'],
    queryFn: async () => {
      const res = await fetch('/api/reconciliation/issues');
      return res.json();
    },
    refetchInterval: 60000, // refresh every minute
  });

  const resolveMutation = useMutation({
    mutationFn: async ({ id, resolution }: { id: string; resolution: string }) => {
      const res = await fetch(`/api/reconciliation/issues/${id}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolution }),
      });
      if (!res.ok) throw new Error('Failed to resolve');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reconciliation-issues'] });
      setResolveDialog(null);
    },
  });

  const runReconciliation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/reconciliation/issues', { method: 'POST' });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reconciliation-issues'] });
    },
  });

  const issues = data?.data ?? [];
  const meta = data?.meta ?? { critical: 0, warning: 0, info: 0 };
  const total = issues.length;

  if (isLoading) {
    return (
      <section className="rounded-xl border border-[hsl(var(--color-border))] overflow-hidden">
        <div className="border-b border-[hsl(var(--color-border))] px-4 py-3 flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-[hsl(var(--primary))]" />
          <span className="text-sm font-medium text-[hsl(var(--card-foreground))]">ปัญหาความสอดคล้องของข้อมูล</span>
        </div>
        <div className="p-4 space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="h-10 rounded-lg bg-gray-100 animate-pulse" />)}
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-[hsl(var(--color-border))] overflow-hidden">
      {/* Header */}
      <div className="border-b border-[hsl(var(--color-border))] px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-[hsl(var(--primary))]" />
          <span className="text-sm font-medium text-[hsl(var(--card-foreground))]">ปัญหาความสอดคล้องของข้อมูล</span>
          {total > 0 ? (
            <div className="flex items-center gap-1.5 ml-2">
              {meta.critical > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold bg-red-500/15 text-red-400 border border-red-500/20">
                  <XCircle className="h-3 w-3" />{meta.critical} วิกฤต
                </span>
              )}
              {meta.warning > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/20">
                  <AlertTriangle className="h-3 w-3" />{meta.warning} เตือน
                </span>
              )}
              {meta.info > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold bg-blue-500/15 text-blue-400 border border-blue-500/20">
                  {meta.info} ข้อมูล
                </span>
              )}
            </div>
          ) : (
            <span className="ml-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
              <ShieldCheck className="h-3 w-3" />ทั้งหมดปกติ
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => runReconciliation.mutate()}
            disabled={runReconciliation.isPending}
            className="flex items-center gap-1.5 rounded-lg border border-[hsl(var(--color-border))] px-3 py-1.5 text-xs font-medium hover:bg-white/5 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3 w-3 ${runReconciliation.isPending ? 'animate-spin' : ''}`} />
            ตรวจสอบเดี๋ยวนี้
          </button>
          {total > 0 && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="rounded-lg border border-[hsl(var(--color-border))] px-3 py-1.5 text-xs font-medium hover:bg-white/5 transition-colors"
            >
              {expanded ? 'ซ่อน' : `ดู ${total} รายการ`}
            </button>
          )}
        </div>
      </div>

      {/* Issue list */}
      {expanded && total > 0 && (
        <div className="divide-y divide-[hsl(var(--color-border))]">
          {issues.map((issue) => (
            <div key={issue.id} className={`flex items-start gap-3 px-4 py-3 ${severityStyle(issue.severity)}`}>
              <div className="mt-0.5 shrink-0">{severityIcon(issue.severity)}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-xs font-semibold text-[hsl(var(--on-surface-variant))]">{typeLabel(issue.type)}</span>
                    <p className="text-sm text-[hsl(var(--card-foreground))] mt-0.5">{issue.description}</p>
                    <p className="text-xs text-[hsl(var(--on-surface-variant))] mt-1">
                      {issue.entityType} · {issue.entityId.substring(0, 8)}... · {format(new Date(issue.detectedAt), 'dd MMM yyyy HH:mm', { locale: th })}
                    </p>
                  </div>
                  <button
                    onClick={() => { setResolveDialog(issue); setResolveType('FIXED'); }}
                    className="shrink-0 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                  >
                    แก้ไข
                  </button>
                </div>
                {/* Resolve dialog */}
                {resolveDialog?.id === issue.id && (
                  <div className="mt-3 flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
                    <select
                      value={resolveType}
                      onChange={(e) => setResolveType(e.target.value as 'FIXED' | 'IGNORED')}
                      className="rounded-lg border border-[hsl(var(--color-border))] bg-[hsl(var(--surface))] px-3 py-1.5 text-xs"
                    >
                      <option value="FIXED">แก้ไขแล้ว (Fixed)</option>
                      <option value="IGNORED">เพิกเฉย (Ignored)</option>
                    </select>
                    <button
                      onClick={() => resolveMutation.mutate({ id: issue.id, resolution: resolveType })}
                      disabled={resolveMutation.isPending}
                      className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
                    >
                      {resolveMutation.isPending ? '...' : 'บันทึก'}
                    </button>
                    <button
                      onClick={() => setResolveDialog(null)}
                      className="rounded-lg border border-[hsl(var(--color-border))] px-3 py-1.5 text-xs font-medium hover:bg-white/5"
                    >
                      ยกเลิก
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {total === 0 && (
        <div className="p-6 text-center">
          <ShieldCheck className="h-8 w-8 mx-auto text-emerald-400 mb-2" />
          <p className="text-sm text-[hsl(var(--on-surface-variant))]">ไม่พบปัญหาความสอดคล้องของข้อมูล</p>
          <p className="text-xs text-[hsl(var(--on-surface-variant))] mt-1">ระบบตรวจสอบอัตโนมัติทุกวันเวลา 05:00 น.</p>
        </div>
      )}
    </section>
  );
}