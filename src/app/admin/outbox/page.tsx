'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, RotateCcw, Trash2, RefreshCw, Mail } from 'lucide-react';
import { PromptDialog } from '@/components/ui/PromptDialog';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/providers/ToastProvider';

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
          <h1 className="text-2xl md:text-3xl font-extrabold text-[hsl(var(--card-foreground))] flex items-center gap-3">
            <AlertTriangle className="text-amber-600" size={28} />
            Outbox Dead-Letter Queue
          </h1>
          <p className="mt-1 text-sm text-[hsl(var(--on-surface-variant))] max-w-2xl">
            เหตุการณ์ที่ retry ล้มเหลวครบ {threshold} ครั้งแล้วค้างอยู่ — ต้องมนุษย์มาจัดการ
          </p>
        </div>
        <button
          onClick={() => void load()}
          className="inline-flex items-center gap-2 rounded-lg border border-[hsl(var([hsl(var(--color-border))]))]  px-4 py-2 text-sm font-semibold text-[hsl(var(--card-foreground))] shadow-sm transition-all hover:scale-105 active:scale-95"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          รีเฟรช
        </button>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-[hsl(var(--on-surface-variant))]">ประเภท:</span>
          <select
            value={eventType}
            onChange={(e) => setEventType(e.target.value)}
            className="rounded-lg border border-[hsl(var([hsl(var(--color-border))]))]  px-3 py-1.5 text-sm text-[hsl(var(--card-foreground))]"
          >
            <option value="">ทั้งหมด</option>
            {eventTypes.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="rounded-full px-3 py-0.5 text-xs font-bold" style={{ background: 'rgba(251,191,36,0.15)', color: '#fbbf24' }}>
            {total} ค้าง
          </span>
        </div>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 rounded-xl border border-[hsl(var(--primary))]/30 px-4 py-3"
          style={{ background: 'rgba(99,102,241,0.1)' }}
        >
          <span className="text-sm font-semibold text-[hsl(var(--card-foreground))]">เลือก {selected.size} รายการ</span>
          <button
            onClick={() => setConfirmRequeue(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[hsl(var(--primary))] text-white px-3 py-1.5 text-xs font-bold hover:bg-[hsl(var(--primary))]/90 transition-all hover:scale-105 active:scale-95"
          >
            <RotateCcw size={14} />สั่ง retry ใหม่ ({selected.size})
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="rounded-lg border border-[hsl(var([hsl(var(--color-border))]))]  px-3 py-1.5 text-xs font-medium text-[hsl(var(--card-foreground))] hover:bg-white/5 transition-all"
          >
            ยกเลิก
          </button>
        </motion.div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-[hsl(var([hsl(var(--color-border))]))]  overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[hsl(var([hsl(var(--color-border))]))]" style={{ background: 'hsl(var(--card))' }}>
              <th className="w-10 px-4 py-3 text-left">
                <input type="checkbox" checked={items.length > 0 && selected.size === items.length} onChange={toggleSelectAll} aria-label="เลือกทั้งหมด" className="h-4 w-4 rounded border-[hsl(var([hsl(var(--color-border))]))] accent-[hsl(var(--primary))]" />
              </th>
              <th className="px-4 py-3 text-left font-semibold uppercase tracking-wider text-xs text-[hsl(var(--on-surface-variant))]">Event</th>
              <th className="px-4 py-3 text-left font-semibold uppercase tracking-wider text-xs text-[hsl(var(--on-surface-variant))]">Aggregate</th>
              <th className="px-4 py-3 text-left font-semibold uppercase tracking-wider text-xs text-[hsl(var(--on-surface-variant))]">Retries</th>
              <th className="px-4 py-3 text-left font-semibold uppercase tracking-wider text-xs text-[hsl(var(--on-surface-variant))]">สร้างเมื่อ</th>
              <th className="px-4 py-3 text-left font-semibold uppercase tracking-wider text-xs text-[hsl(var(--on-surface-variant))]">Error</th>
              <th className="w-32 px-4 py-3 text-right font-semibold uppercase tracking-wider text-xs text-[hsl(var(--on-surface-variant))]">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[hsl(var([hsl(var(--color-border))]))]">
            {loading && items.length === 0 ? (
              <tr><td colSpan={7} className="p-8 text-center text-[hsl(var(--on-surface-variant))]">กำลังโหลด...</td></tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-12 text-center">
                  <Mail className="mx-auto mb-3 text-emerald-500" size={40} />
                  <p className="text-sm font-semibold text-[hsl(var(--card-foreground))]">ไม่มี event ค้างใน dead-letter queue</p>
                  <p className="text-xs text-[hsl(var(--on-surface-variant))] mt-1">ระบบส่งข้อความทำงานปกติ</p>
                </td>
              </tr>
            ) : items.map((ev) => (
              <React.Fragment key={ev.id}>
                <tr className="hover:bg-white/5 transition-colors">
                  <td className="px-4 py-3">
                    <input type="checkbox" checked={selected.has(ev.id)} onChange={() => toggleSelect(ev.id)} className="h-4 w-4 rounded border-[hsl(var([hsl(var(--color-border))]))] accent-[hsl(var(--primary))]" />
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    <button onClick={() => setExpandedId(expandedId === ev.id ? null : ev.id)} className="text-[hsl(var(--primary))] hover:underline">
                      {ev.eventType}
                    </button>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-[hsl(var(--on-surface-variant))]">
                    {ev.aggregateType}/{ev.aggregateId.slice(0, 8)}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold" style={{ background: 'rgba(251,191,36,0.15)', color: '#fbbf24' }}>{ev.retryCount}/{threshold}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-[hsl(var(--on-surface-variant))]">{new Date(ev.createdAt).toLocaleString('th-TH')}</td>
                  <td className="px-4 py-3 text-xs text-red-400/70 max-w-xs truncate" title={ev.lastError || ''}>{ev.lastError || '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex gap-1">
                      <button
                        onClick={async () => { await fetch('/api/admin/outbox/dead-letter', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ eventIds: [ev.id] }) }); load(); }}
                        title="Retry เดี่ยว"
                        className="rounded-lg border border-[hsl(var([hsl(var(--color-border))]))]  p-1.5 text-[hsl(var(--on-surface-variant))] hover:border-[hsl(var(--primary))]/40 hover:text-[hsl(var(--primary))] transition-all hover:scale-105 active:scale-95"
                      >
                        <RotateCcw size={14} />
                      </button>
                      <button
                        onClick={() => setDropTarget(ev)}
                        title="ทิ้งถาวร"
                        className="rounded-lg border border-red-500/30 bg-red-500/10 p-1.5 text-red-400 hover:bg-red-500/20 transition-all hover:scale-105 active:scale-95"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
                {expandedId === ev.id && (
                  <tr>
                    <td colSpan={7} className="p-4" style={{ background: 'rgba(255,255,255,0.03)' }}>
                      <pre className="text-xs font-mono overflow-x-auto max-h-64 rounded-lg border border-[hsl(var([hsl(var(--color-border))]))]  p-3 whitespace-pre-wrap break-words">{JSON.stringify(ev.payload, null, 2)}</pre>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={confirmRequeue}
        title="ยืนยันการ requeue"
        description={`ระบบจะรีเซ็ต retry count ของ ${selected.size} event และส่งกลับเข้าคิวเพื่อประมวลผลใหม่`}
        confirmLabel="Requeue"
        onConfirm={requeueSelected}
        onCancel={() => setConfirmRequeue(false)}
      />

      {dropTarget && (
        <PromptDialog
          open
          title="ทิ้ง event นี้ถาวร"
          description={`${dropTarget.eventType} / ${dropTarget.aggregateId.slice(0, 8)}... การทิ้งจะไม่สามารถกู้คืนได้`}
          label="เหตุผล (บันทึกใน audit log)"
          placeholder="เช่น: payload มีข้อมูลผิด ไม่มีผลกระทบต่อธุรกิจ"
          confirmLabel="ทิ้งถาวร"
          onConfirm={(reason) => { if (reason.trim().length >= 3) dropEvent(reason.trim()); }}
          onCancel={() => setDropTarget(null)}
        />
      )}
    </motion.div>
  );
}