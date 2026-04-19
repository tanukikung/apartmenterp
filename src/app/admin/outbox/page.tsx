'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, RotateCcw, Trash2, RefreshCw, Mail } from 'lucide-react';
import { PromptDialog } from '@/components/ui/PromptDialog';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { StatusBadge } from '@/components/ui/status-badge';
import { useToast } from '@/components/providers/ToastProvider';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DeadLetterEvent {
  id: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  createdAt: string;
  retryCount: number;
  lastError: string | null;
  payload: unknown;
}

interface ListResponse {
  items: DeadLetterEvent[];
  total: number;
  page: number;
  pageSize: number;
  threshold: number;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function OutboxDeadLetterPage() {
  const [items, setItems] = useState<DeadLetterEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [threshold, setThreshold] = useState(3);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [eventType, setEventType] = useState<string>('');
  const [dropTarget, setDropTarget] = useState<DeadLetterEvent | null>(null);
  const [confirmRequeue, setConfirmRequeue] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const toast = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const url = new URL('/api/admin/outbox/dead-letter', window.location.origin);
      url.searchParams.set('pageSize', '100');
      if (eventType) url.searchParams.set('eventType', eventType);
      const res = await fetch(url.toString()).then((r) => r.json());
      if (res.success) {
        const data = res.data as ListResponse;
        setItems(data.items);
        setTotal(data.total);
        setThreshold(data.threshold);
      } else {
        toast.error(res.error?.message ?? 'ไม่สามารถโหลดรายการ DLQ');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'ไม่สามารถโหลดรายการ DLQ');
    } finally {
      setLoading(false);
    }
  }, [eventType, toast]);

  useEffect(() => { load(); }, [load]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelected((prev) => {
      if (prev.size === items.length) return new Set();
      return new Set(items.map((i) => i.id));
    });
  };

  const requeueSelected = async () => {
    if (selected.size === 0) return;
    setConfirmRequeue(false);
    try {
      const res = await fetch('/api/admin/outbox/dead-letter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventIds: Array.from(selected) }),
      }).then((r) => r.json());
      if (res.success) {
        toast.success(`ส่งกลับคิว ${res.data?.requeued ?? selected.size} รายการแล้ว`);
        setSelected(new Set());
        await load();
      } else {
        toast.error(res.error?.message ?? 'ไม่สามารถส่งกลับคิวได้');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'ไม่สามารถส่งกลับคิวได้');
    }
  };

  const dropEvent = async (reason: string) => {
    if (!dropTarget) return;
    try {
      const res = await fetch('/api/admin/outbox/dead-letter', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventIds: [dropTarget.id], reason }),
      }).then((r) => r.json());
      setDropTarget(null);
      if (res.success) {
        toast.success('ลบ event ออกจากคิวแล้ว');
        await load();
      } else {
        toast.error(res.error?.message ?? 'ไม่สามารถลบ event ได้');
      }
    } catch (err) {
      setDropTarget(null);
      toast.error(err instanceof Error ? err.message : 'ไม่สามารถลบ event ได้');
    }
  };

  const eventTypes = useMemo(() => {
    const s = new Set(items.map((i) => i.eventType));
    return Array.from(s).sort();
  }, [items]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-on-surface flex items-center gap-3">
            <AlertTriangle className="text-amber-500" size={28} />
            Outbox Dead-Letter Queue
          </h1>
          <p className="mt-1 text-sm text-on-surface-variant max-w-2xl">
            เหตุการณ์ที่ retry ล้มเหลวครบ {threshold} ครั้งแล้วค้างอยู่ — ต้องมนุษย์มาจัดการ
            เช่น ส่ง LINE ไม่สำเร็จ, ออก PDF ไม่ได้, ส่งอีเมลล้มเหลว
          </p>
        </div>
        <button
          onClick={load}
          className="inline-flex items-center gap-2 rounded-lg border border-outline bg-surface-container-lowest px-4 py-2 text-sm font-semibold text-on-surface hover:bg-surface-container transition-colors"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          รีเฟรช
        </button>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">ประเภท:</span>
          <select
            value={eventType}
            onChange={(e) => setEventType(e.target.value)}
            className="rounded-lg border border-outline bg-surface-container-lowest px-3 py-1.5 text-sm text-on-surface"
          >
            <option value="">ทั้งหมด</option>
            {eventTypes.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="rounded-full bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300 px-3 py-0.5 text-xs font-bold">
            {total} ค้าง
          </span>
        </div>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary-container/10 px-4 py-3"
        >
          <span className="text-sm font-semibold text-on-surface">
            เลือก {selected.size} รายการ
          </span>
          <button
            onClick={() => setConfirmRequeue(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-on-primary px-3 py-1.5 text-xs font-bold hover:brightness-110 transition"
          >
            <RotateCcw size={14} />
            สั่ง retry ใหม่ ({selected.size})
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="rounded-lg border border-outline px-3 py-1.5 text-xs font-medium text-on-surface-variant hover:bg-surface-container transition"
          >
            ยกเลิก
          </button>
        </motion.div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-outline-variant/10 bg-surface-container-lowest overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-container-low text-on-surface-variant">
            <tr>
              <th className="w-10 px-4 py-3 text-left">
                <input
                  type="checkbox"
                  checked={items.length > 0 && selected.size === items.length}
                  onChange={toggleSelectAll}
                  aria-label="เลือกทั้งหมด"
                />
              </th>
              <th className="px-4 py-3 text-left font-semibold uppercase tracking-wider text-xs">Event</th>
              <th className="px-4 py-3 text-left font-semibold uppercase tracking-wider text-xs">Aggregate</th>
              <th className="px-4 py-3 text-left font-semibold uppercase tracking-wider text-xs">Retries</th>
              <th className="px-4 py-3 text-left font-semibold uppercase tracking-wider text-xs">สร้างเมื่อ</th>
              <th className="px-4 py-3 text-left font-semibold uppercase tracking-wider text-xs">Error</th>
              <th className="w-32 px-4 py-3 text-right font-semibold uppercase tracking-wider text-xs">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/10">
            {loading && items.length === 0 ? (
              <tr><td colSpan={7} className="p-8 text-center text-on-surface-variant">กำลังโหลด...</td></tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-12 text-center">
                  <Mail className="mx-auto mb-3 text-emerald-500" size={40} />
                  <p className="text-sm font-semibold text-on-surface">ไม่มี event ค้างใน dead-letter queue</p>
                  <p className="text-xs text-on-surface-variant mt-1">ระบบส่งข้อความทำงานปกติ</p>
                </td>
              </tr>
            ) : items.map((ev) => (
              <React.Fragment key={ev.id}>
                <tr className="hover:bg-surface-container/50 transition-colors">
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(ev.id)}
                      onChange={() => toggleSelect(ev.id)}
                    />
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    <button
                      onClick={() => setExpandedId(expandedId === ev.id ? null : ev.id)}
                      className="text-primary hover:underline"
                    >
                      {ev.eventType}
                    </button>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-on-surface-variant">
                    {ev.aggregateType}/{ev.aggregateId.slice(0, 8)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge variant="warning">{ev.retryCount}/{threshold}</StatusBadge>
                  </td>
                  <td className="px-4 py-3 text-xs text-on-surface-variant">
                    {new Date(ev.createdAt).toLocaleString('th-TH')}
                  </td>
                  <td className="px-4 py-3 text-xs text-red-600 dark:text-red-400 max-w-xs truncate" title={ev.lastError || ''}>
                    {ev.lastError || '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex gap-1">
                      <button
                        onClick={async () => {
                          await fetch('/api/admin/outbox/dead-letter', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ eventIds: [ev.id] }),
                          });
                          load();
                        }}
                        title="Retry เดี่ยว"
                        className="rounded-lg border border-outline bg-surface-container-lowest p-1.5 text-on-surface-variant hover:bg-primary hover:text-on-primary hover:border-primary transition"
                      >
                        <RotateCcw size={14} />
                      </button>
                      <button
                        onClick={() => setDropTarget(ev)}
                        title="ทิ้งถาวร"
                        className="rounded-lg border border-outline bg-surface-container-lowest p-1.5 text-red-600 dark:text-red-400 hover:bg-red-500 hover:text-white hover:border-red-500 transition"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
                {expandedId === ev.id && (
                  <tr>
                    <td colSpan={7} className="bg-surface-container-low/50 p-4">
                      <pre className="text-xs font-mono overflow-x-auto max-h-64 rounded-lg border border-outline-variant/20 bg-surface-container-lowest p-3 whitespace-pre-wrap break-words">
                        {JSON.stringify(ev.payload, null, 2)}
                      </pre>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* Confirm requeue */}
      <ConfirmDialog
        open={confirmRequeue}
        title="ยืนยันการ requeue"
        description={`ระบบจะรีเซ็ต retry count ของ ${selected.size} event และส่งกลับเข้าคิวเพื่อประมวลผลใหม่`}
        confirmLabel="Requeue"
        onConfirm={requeueSelected}
        onCancel={() => setConfirmRequeue(false)}
      />

      {/* Drop prompt */}
      {dropTarget && (
        <PromptDialog
          open
          title="ทิ้ง event นี้ถาวร"
          description={`${dropTarget.eventType} / ${dropTarget.aggregateId.slice(0, 8)}... การทิ้งจะไม่สามารถกู้คืนได้`}
          label="เหตุผล (บันทึกใน audit log)"
          placeholder="เช่น: payload มีข้อมูลผิด ไม่มีผลกระทบต่อธุรกิจ"
          confirmLabel="ทิ้งถาวร"
          onConfirm={(reason) => {
            if (reason.trim().length >= 3) dropEvent(reason.trim());
          }}
          onCancel={() => setDropTarget(null)}
        />
      )}
    </motion.div>
  );
}
