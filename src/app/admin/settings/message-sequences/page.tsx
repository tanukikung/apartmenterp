'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { useToast } from '@/components/providers/ToastProvider';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  X,
  XCircle,
  MessageSquare,
  Zap,
  ChevronUp,
  ChevronDown,
  GripVertical,
  Send,
} from 'lucide-react';
import { useApiData } from '@/hooks/useApi';
import { AnimatePresence, motion } from 'framer-motion';

// ── Types ────────────────────────────────────────────────────────────────────

type MessageSequence = {
  id: string;
  name: string;
  trigger: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  stepCount?: number;
  steps?: MessageSequenceStep[];
};

type MessageSequenceStep = {
  id: string;
  sequenceId: string;
  stepOrder: number;
  delayDays: number;
  subject: string | null;
  contentTh: string;
  contentEn: string | null;
  messageType: 'TEXT' | 'FLEX_INVOICE' | 'FLEX_REMINDER' | 'FLEX_RECEIPT';
  responseType: 'NONE' | 'ROOM_NO' | 'NAME' | 'PHONE' | 'YES_NO' | 'FREE_TEXT';
  invalidReply: string | null;
};

type ApiResp<T = unknown> = {
  success: boolean;
  data?: T;
  error?: { message?: string };
};

type ListResp = {
  items: MessageSequence[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

// ── Constants ────────────────────────────────────────────────────────────────

const TRIGGER_LABELS: Record<string, string> = {
  RegistrationApproved: 'ลงทะเบียนสำเร็จ — ส่งเมื่อผู้เช่าใหม่อนุมัติสัญญา',
  MoveOutConfirmed: 'ย้ายออก — ส่งเมื่อผู้เช่าแจ้งย้ายออก',
  ContractExpiringSoon: 'สัญญาใกล้หมด — ส่งก่อนสัญญาหมดอายุ',
  Manual: 'ส่งเอง — ส่งด้วยตัวเองเมื่อต้องการ',
};


const MESSAGE_TYPE_OPTIONS = [
  { value: 'TEXT', label: 'ข้อความธรรมดา', hint: 'ส่งเป็น text ธรรมดาไป LINE' },
  { value: 'FLEX_REMINDER', label: 'การ์ดแจ้งเตือน', hint: 'แสดงเป็นการ์ดสวยงามใน LINE' },
  { value: 'FLEX_INVOICE', label: 'การ์ดใบแจ้งหนี้', hint: 'แสดงข้อมูลใบแจ้งหนี้เป็นการ์ด' },
  { value: 'FLEX_RECEIPT', label: 'การ์ดใบเสร็จ', hint: 'แสดงใบเสร็จเป็นการ์ดสวยงาม' },
];

const RESPONSE_TYPE_OPTIONS = [
  { value: 'NONE', label: 'ไม่ต้องรับคำตอบ', hint: 'ส่งข้อความอย่างเดียว รอไม่นาน' },
  { value: 'ROOM_NO', label: 'ตอบเลขห้อง', hint: 'ผู้เช่าส่งเลขห้อง 4 หลัก mis: 0301' },
  { value: 'NAME', label: 'ตอบชื่อ', hint: 'ผู้เช่าส่งชื่อของตนเอง mis: สมชาย' },
  { value: 'PHONE', label: 'ตอบเบอร์โทร', hint: 'ผู้เช่าส่งเบอร์โทร mis: 0812345678' },
  { value: 'YES_NO', label: 'ตอบ ใช่/ไม่ใช่', hint: 'ผู้เช่าตอบ ตกลง หรือไม่ mis: ใช่, yes, y, ครับ/ค่ะ' },
  { value: 'FREE_TEXT', label: 'ตอบข้อความอิสระ', hint: 'รับทุกข้อความที่ส่งมา' },
];

const VALID_TRIGGERS = ['RegistrationApproved', 'MoveOutConfirmed', 'ContractExpiringSoon', 'Manual'] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function interpolateMessage(template: string, vars?: {
  roomNo?: string; tenantName?: string; month?: string; amount?: string;
}): string {
  return (template || '')
    .replace(/\{\{roomNo\}\}/g, vars?.roomNo ?? '0301')
    .replace(/\{\{tenantName\}\}/g, vars?.tenantName ?? 'คุณสมชาย')
    .replace(/\{\{month\}\}/g, vars?.month ?? 'เม.ย. 2568')
    .replace(/\{\{amount\}\}/g, vars?.amount ?? '฿8,500.00');
}

function delayLabel(days: number): string {
  if (days === 0) return 'ทันที';
  if (days === 1) return '1 วัน';
  return `${days} วัน`;
}

// ── Preview Modal ─────────────────────────────────────────────────────────────

function StepPreviewModal({
  open,
  onClose,
  step,
  sequenceName,
}: {
  open: boolean;
  onClose: () => void;
  step: MessageSequenceStep | null;
  sequenceName: string;
}) {
  if (!step) return null;

  const sampleText = interpolateMessage(step.contentTh);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          <div className="absolute inset-0 bg-black/60-sm" onClick={onClose} />
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="relative w-full max-w-md rounded-2xl border border-[hsl(var(--color-border))]  p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-[hsl(var(--card-foreground))]">ตัวอย่าง: {step.subject || `Step ${step.stepOrder}`}</h3>
              <button onClick={onClose} className="rounded-lg p-1 hover:bg-[hsl(var(--on-surface))]/10 transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>

            {step.messageType === 'TEXT' && (
              <div className="rounded-2xl bg-[hsl(var(--primary))] text-white px-4 py-3 text-sm leading-relaxed shadow-md">
                <div className="flex items-start gap-3">
                  <div className="h-8 w-8 shrink-0 rounded-full bg-white/20 flex items-center justify-center text-xs font-bold">AP</div>
                  <div className="flex-1">
                    <div className="text-xs text-white/60 mb-1">{sequenceName} • ข้อความ</div>
                    <p className="whitespace-pre-wrap">{sampleText}</p>
                  </div>
                </div>
              </div>
            )}

            {step.messageType !== 'TEXT' && (
              <div className="space-y-3">
                <div className="rounded-2xl bg-[hsl(var(--primary))] text-white px-4 py-3 text-sm leading-relaxed shadow-md">
                  <div className="flex items-start gap-3">
                    <div className="h-8 w-8 shrink-0 rounded-full bg-white/20 flex items-center justify-center text-xs font-bold">AP</div>
                    <div className="flex-1">
                      <div className="text-xs text-white/60 mb-1">{sequenceName} • {MESSAGE_TYPE_OPTIONS.find(m => m.value === step.messageType)?.label}</div>
                      <p className="whitespace-pre-wrap">{sampleText}</p>
                    </div>
                  </div>
                </div>
                <div className="rounded-xl border border-[hsl(var(--color-border))]  p-3 text-xs text-[hsl(var(--on-surface-variant))]">
                  <p>📌 Flex message จะแสดงเป็นการ์ดสวยงามใน LINE — ตัวอย่างข้อความด้านบนเป็น text fallback</p>
                </div>
              </div>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              {step.responseType !== 'NONE' && (
                <span className="rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 px-3 py-1 text-xs font-medium">
                  รอตอบ: {RESPONSE_TYPE_OPTIONS.find(r => r.value === step.responseType)?.label}
                </span>
              )}
              <span className="rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30 px-3 py-1 text-xs font-medium">
                ส่งหลัง: {delayLabel(step.delayDays)}
              </span>
            </div>

            <button onClick={onClose} className="mt-5 w-full rounded-xl border border-[hsl(var(--color-border))]  px-4 py-2 text-sm font-medium text-[hsl(var(--card-foreground))] hover:border-[hsl(var(--primary))]/40 transition-all">
              ปิด
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── Step Row ──────────────────────────────────────────────────────────────────

function StepRow({
  step,
  index,
  isSelected,
  onSelect,
  onMoveUp,
  onMoveDown,
  onEdit,
  onDelete,
  onPreview,
  canMoveUp,
  canMoveDown,
}: {
  step: MessageSequenceStep;
  index: number;
  isSelected: boolean;
  onSelect: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onPreview: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!isSelected) return;
      if (document.activeElement && document.activeElement.tagName === 'TEXTAREA') return;
      if (document.activeElement && document.activeElement.tagName === 'INPUT') return;

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        onMoveUp();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        onMoveDown();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSelected, onMoveUp, onMoveDown]);

  return (
    <motion.div
      ref={ref}
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      onClick={onSelect}
      className={[
        'group relative rounded-xl border p-4 cursor-pointer transition-all',
        isSelected
          ? 'border-[hsl(var(--primary))]/50 bg-[hsl(var(--primary))]/5 shadow-[0_0_0_2px_hsl(var(--primary)/30%)]'
          : 'border-[hsl(var(--color-border))]  hover:border-[hsl(var(--primary))]/30',
      ].join(' ')}
    >
      {/* Step number badge */}
      <div className="absolute -left-3 top-1/2 -translate-y-1/2">
        <div className={[
          'flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold shadow-md',
          isSelected ? 'bg-[hsl(var(--primary))] text-white' : 'bg-[hsl(var(--color-surface))] border border-[hsl(var(--color-border))] text-[hsl(var(--on-surface-variant))]',
        ].join(' ')}>
          {index + 1}
        </div>
      </div>

      {/* Drag handle (decorative) */}
      <div className="absolute left-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-40 transition-opacity">
        <GripVertical className="h-4 w-4 text-[hsl(var(--on-surface-variant))]" />
      </div>

      <div className="ml-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="text-sm font-semibold text-[hsl(var(--card-foreground))]">
                {step.subject || `Step ${step.stepOrder}`}
              </span>
              <span className="rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30 px-2 py-0.5 text-[10px] font-medium">
                +{step.delayDays}d
              </span>
              {step.messageType !== 'TEXT' && (
                <span className="rounded-full bg-purple-500/20 text-purple-400 border border-purple-500/30 px-2 py-0.5 text-[10px] font-medium">
                  {MESSAGE_TYPE_OPTIONS.find(m => m.value === step.messageType)?.label.split(' ')[0]}
                </span>
              )}
              {step.responseType !== 'NONE' && (
                <span className="rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2 py-0.5 text-[10px] font-medium">
                  ถาม: {RESPONSE_TYPE_OPTIONS.find(r => r.value === step.responseType)?.label}
                </span>
              )}
            </div>
            <p className="text-xs text-[hsl(var(--on-surface-variant))] line-clamp-2 mt-1">
              {step.contentTh.substring(0, 100)}{step.contentTh.length > 100 ? '...' : ''}
            </p>
          </div>

          {/* Arrow controls (visible when selected) */}
          <div className={`flex items-center gap-1 shrink-0 ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-60'} transition-opacity`}>
            <button
              onClick={(e) => { e.stopPropagation(); onMoveUp(); }}
              disabled={!canMoveUp}
              title="ย้ายขึ้น (↑)"
              className="h-7 w-7 flex items-center justify-center rounded-lg border border-[hsl(var(--color-border))]  text-[hsl(var(--on-surface-variant))] hover:text-[hsl(var(--card-foreground))] disabled:opacity-30 transition-all"
            >
              <ChevronUp className="h-4 w-4" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onMoveDown(); }}
              disabled={!canMoveDown}
              title="ย้ายลง (↓)"
              className="h-7 w-7 flex items-center justify-center rounded-lg border border-[hsl(var(--color-border))]  text-[hsl(var(--on-surface-variant))] hover:text-[hsl(var(--card-foreground))] disabled:opacity-30 transition-all"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Actions (visible when selected) */}
        {isSelected && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="flex items-center gap-2 mt-3 pt-3 border-t border-[hsl(var(--color-border))]"
          >
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(); }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[hsl(var(--primary))]/30 bg-[hsl(var(--primary))]/10 px-3 py-1.5 text-xs font-medium text-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))]/20 transition-all"
            >
              <Pencil className="h-3.5 w-3.5" /> แก้ไข
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onPreview(); }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[hsl(var(--color-border))]  px-3 py-1.5 text-xs font-medium text-[hsl(var(--card-foreground))] hover:border-blue-500/40 hover:text-blue-400 transition-all"
            >
              <Eye className="h-3.5 w-3.5" /> ดูตัวอย่าง
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/20 transition-all ml-auto"
            >
              <Trash2 className="h-3.5 w-3.5" /> ลบ
            </button>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

// ── Step Editor Form ──────────────────────────────────────────────────────────

function StepEditorForm({
  step,
  _sequenceId,
  onSave,
  onCancel,
  saving,
}: {
  step: MessageSequenceStep | null;
  _sequenceId: string;
  onSave: (data: Omit<MessageSequenceStep, 'id' | 'sequenceId'>) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [subject, setSubject] = useState(step?.subject ?? '');
  const [contentTh, setContentTh] = useState(step?.contentTh ?? '');
  const [delayDays, setDelayDays] = useState(step?.delayDays ?? 0);
  const [messageType, setMessageType] = useState<MessageSequenceStep['messageType']>(step?.messageType ?? 'TEXT');
  const [responseType, setResponseType] = useState<MessageSequenceStep['responseType']>(step?.responseType ?? 'NONE');
  const [invalidReply, setInvalidReply] = useState(step?.invalidReply ?? '');

  useEffect(() => {
    if (step) {
      setSubject(step.subject ?? '');
      setContentTh(step.contentTh ?? '');
      setDelayDays(step.delayDays);
      setMessageType(step.messageType);
      setResponseType(step.responseType);
      setInvalidReply(step.invalidReply ?? '');
    } else {
      setSubject('');
      setContentTh('');
      setDelayDays(0);
      setMessageType('TEXT');
      setResponseType('NONE');
      setInvalidReply('');
    }
  }, [step]);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function insertVariable(v: string) {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const newVal = contentTh.slice(0, start) + v + contentTh.slice(end);
    setContentTh(newVal);
    setTimeout(() => {
      ta.setSelectionRange(start + v.length, start + v.length);
      ta.focus();
    }, 0);
  }

  function handleSubmit() {
    if (!contentTh.trim()) return;
    onSave({
      stepOrder: step?.stepOrder ?? 1,
      delayDays,
      subject: subject || null,
      contentTh: contentTh.trim(),
      contentEn: null,
      messageType,
      responseType,
      invalidReply: invalidReply || null,
    });
  }

  return (
    <div className="rounded-2xl border border-[hsl(var(--color-border))]  p-5 space-y-4">
      <h3 className="font-semibold text-[hsl(var(--card-foreground))]">
        {step ? 'แก้ไข Step' : 'เพิ่ม Step ใหม่'}
      </h3>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-[hsl(var(--on-surface-variant))]">ชื่อ step (ไม่บังคับ)</label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="เช่น แนะนำตัว"
            className="w-full rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-3 py-2 text-sm text-[hsl(var(--card-foreground))] focus:border-[hsl(var(--primary))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/20"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[hsl(var(--on-surface-variant))]">ส่งหลัง (วัน)</label>
          <input
            type="number"
            value={delayDays}
            onChange={(e) => setDelayDays(Number(e.target.value))}
            min={0} max={365}
            className="w-full rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-3 py-2 text-sm text-[hsl(var(--card-foreground))] focus:border-[hsl(var(--primary))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/20"
          />
          <p className="mt-1 text-xs text-[hsl(var(--on-surface-variant))]">0 = ทันที, 1 = 1 วัน</p>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[hsl(var(--on-surface-variant))]">ประเภทข้อความ</label>
          <select
            value={messageType}
            onChange={(e) => setMessageType(e.target.value as MessageSequenceStep['messageType'])}
            className="w-full rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-3 py-2 text-sm text-[hsl(var(--card-foreground))] focus:border-[hsl(var(--primary))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/20"
          >
            {MESSAGE_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Variable pills */}
      <div className="flex flex-wrap gap-2">
        {['{{roomNo}}', '{{tenantName}}', '{{month}}', '{{amount}}'].map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => insertVariable(v)}
            className="rounded-full border border-[hsl(var(--primary))]/30 bg-[hsl(var(--primary))]/5 px-2.5 py-1 text-[11px] font-mono text-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))]/10 transition-colors"
          >
            {v}
          </button>
        ))}
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-[hsl(var(--on-surface-variant))]">ข้อความ (TH) *</label>
        <textarea
          ref={textareaRef}
          value={contentTh}
          onChange={(e) => setContentTh(e.target.value)}
          rows={4}
          placeholder="สวัสดีค่ะ {{tenantName}} ยินดีต้อนรับ..."
          className="w-full rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-3 py-2 text-sm text-[hsl(var(--card-foreground))] placeholder:text-[hsl(var(--on-surface-variant))]/50 focus:border-[hsl(var(--primary))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/20 transition-all"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-[hsl(var(--on-surface-variant))]">รอรับคำตอบจากผู้เช่า</label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {RESPONSE_TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setResponseType(opt.value as MessageSequenceStep['responseType'])}
              className={[
                'rounded-xl border px-3 py-2 text-left transition-all',
                responseType === opt.value
                  ? 'border-[hsl(var(--primary))]/50 bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]'
                  : 'border-[hsl(var(--color-border))]  text-[hsl(var(--on-surface-variant))] hover:border-[hsl(var(--primary))]/30',
              ].join(' ')}
            >
              <div className="text-xs font-medium">{opt.label}</div>
              <div className="text-[10px] mt-0.5 opacity-70">{opt.hint}</div>
            </button>
          ))}
        </div>
      </div>

      {responseType !== 'NONE' && (
        <div>
          <label className="mb-1 block text-xs font-medium text-[hsl(var(--on-surface-variant))]">ข้อความเมื่อตอบผิด (ไม่บังคับ)</label>
          <input
            type="text"
            value={invalidReply}
            onChange={(e) => setInvalidReply(e.target.value)}
            placeholder="กรุณาพิมพ์เลขห้อง 4 หลัก เช่น 0301 ค่ะ"
            className="w-full rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-3 py-2 text-sm text-[hsl(var(--card-foreground))] placeholder:text-[hsl(var(--on-surface-variant))]/50 focus:border-[hsl(var(--primary))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/20"
          />
          <p className="mt-1 text-xs text-[hsl(var(--on-surface-variant))]">เว้นว่าง = ใช้ข้อความตั้งต้นอัตโนมัติ</p>
        </div>
      )}

      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={handleSubmit}
          disabled={saving || !contentTh.trim()}
          className="inline-flex items-center gap-2 rounded-xl bg-[hsl(var(--primary))] text-white px-4 py-2 text-sm font-semibold shadow-sm transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {saving ? 'กำลังบันทึก...' : 'บันทึก Step'}
        </button>
        <button
          onClick={onCancel}
          className="inline-flex items-center gap-2 rounded-xl border border-[hsl(var(--color-border))]  px-4 py-2 text-sm font-medium text-[hsl(var(--card-foreground))] shadow-sm transition-all hover:scale-105 active:scale-95"
        >
          ยกเลิก
        </button>
      </div>
    </div>
  );
}

// ── Create Sequence Dialog ────────────────────────────────────────────────────

function CreateSequenceDialog({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (data: { name: string; trigger: string; description?: string }) => void;
}) {
  const [name, setName] = useState('');
  const [trigger, setTrigger] = useState<string>('RegistrationApproved');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setName('');
      setTrigger('RegistrationApproved');
      setDescription('');
    }
  }, [open]);

  function handleCreate() {
    if (!name.trim()) return;
    setSaving(true);
    onCreate({ name: name.trim(), trigger, description: description.trim() || undefined });
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60-sm" onClick={onClose} />
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="relative w-full max-w-md rounded-2xl border border-[hsl(var(--color-border))]  p-6"
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-semibold text-[hsl(var(--card-foreground))]">สร้าง Message Sequence ใหม่</h3>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-[hsl(var(--on-surface))]/10">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-[hsl(var(--card-foreground))]">ชื่อ Sequence *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="เช่น ยินดีต้อนรับผู้เช่าใหม่"
              className="w-full rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-3 py-2 text-sm text-[hsl(var(--card-foreground))] focus:border-[hsl(var(--primary))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/20"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-[hsl(var(--card-foreground))]">เหตุการณ์ที่ทำให้เริ่ม</label>
            <div className="space-y-2">
              {VALID_TRIGGERS.map((t) => (
                <label
                  key={t}
                  className={[
                    'flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-all',
                    trigger === t
                      ? 'border-[hsl(var(--primary))]/50 bg-[hsl(var(--primary))]/10'
                      : 'border-[hsl(var(--color-border))]  hover:border-[hsl(var(--primary))]/30',
                  ].join(' ')}
                >
                  <input
                    type="radio"
                    name="trigger"
                    value={t}
                    checked={trigger === t}
                    onChange={() => setTrigger(t)}
                    className="h-4 w-4 accent-[hsl(var(--primary))]"
                  />
                  <span className="text-sm text-[hsl(var(--card-foreground))]">{TRIGGER_LABELS[t]}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-[hsl(var(--card-foreground))]">คำอธิบาย (ไม่บังคับ)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="รายละเอียดเพิ่มเติม..."
              className="w-full rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-3 py-2 text-sm text-[hsl(var(--card-foreground))] placeholder:text-[hsl(var(--on-surface-variant))]/50 focus:border-[hsl(var(--primary))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/20"
            />
          </div>
        </div>

        <div className="flex items-center gap-3 mt-6">
          <button
            onClick={handleCreate}
            disabled={saving || !name.trim()}
            className="inline-flex items-center gap-2 rounded-xl bg-[hsl(var(--primary))] text-white px-5 py-2.5 text-sm font-semibold shadow-sm transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            สร้าง Sequence
          </button>
          <button
            onClick={onClose}
            className="inline-flex items-center gap-2 rounded-xl border border-[hsl(var(--color-border))]  px-4 py-2 text-sm font-medium text-[hsl(var(--card-foreground))] shadow-sm transition-all"
          >
            ยกเลิก
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function MessageSequencesPage() {
  const { toast } = useToast();

  const [selectedSeqId, setSelectedSeqId] = useState<string | null>(null);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingStep, setEditingStep] = useState<MessageSequenceStep | null>(null);
  const [showStepForm, setShowStepForm] = useState(false);
  const [previewStep, setPreviewStep] = useState<MessageSequenceStep | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean; title: string; description?: string; dangerous?: boolean; onConfirm: () => void;
  }>({ open: false, title: '', onConfirm: () => {} });
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [savingStep, setSavingStep] = useState(false);
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());

  // Fetch all sequences
  const { data: listData, isLoading, error: fetchError, refetch } = useApiData<ApiResp<ListResp>>(
    '/api/messaging-sequences?pageSize=100',
    ['messaging-sequences']
  );

  const sequences: MessageSequence[] = listData?.data?.items ?? [];

  // Fetch selected sequence with steps
  const { data: detailData, refetch: refetchDetail } = useApiData<ApiResp<MessageSequence>>(
    selectedSeqId ? `/api/messaging-sequences/${selectedSeqId}` : null,
    selectedSeqId ? ['messaging-sequence', selectedSeqId] : []
  );

  const selectedSeq = detailData?.data;

  // Set first sequence as selected on load
  useEffect(() => {
    const seqList: MessageSequence[] = listData?.data?.items ?? [];
    if (seqList.length > 0 && !selectedSeqId) {
      setSelectedSeqId(seqList[0].id);
    }
  }, [listData, selectedSeqId]);

  // Clear step selection when sequence changes
  useEffect(() => {
    setSelectedStepId(null);
    setShowStepForm(false);
    setEditingStep(null);
  }, [selectedSeqId]);

  async function handleToggle(seq: MessageSequence) {
    setTogglingIds((prev) => new Set(prev).add(seq.id));
    try {
      const res = await fetch(`/api/messaging-sequences/${seq.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !seq.isActive }),
      });
      const json: ApiResp<MessageSequence> = await res.json();
      if (!json.success) throw new Error(json.error?.message ?? 'อัปเดตไม่สำเร็จ');
      void refetch();
      if (selectedSeqId === seq.id) void refetchDetail();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'อัปเดตไม่สำเร็จ', 'error');
    } finally {
      setTogglingIds((prev) => {
        const next = new Set(prev);
        next.delete(seq.id);
        return next;
      });
    }
  }

  async function handleCreateSequence(data: { name: string; trigger: string; description?: string }) {
    try {
      const res = await fetch('/api/messaging-sequences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, isActive: true }),
      });
      const json: ApiResp<MessageSequence> = await res.json();
      if (!json.success) throw new Error(json.error?.message ?? 'สร้างไม่สำเร็จ');
      setShowCreateDialog(false);
      setSuccessMsg('สร้าง Sequence เรียบร้อยแล้ว');
      void refetch();
      setSelectedSeqId(json.data!.id);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'สร้างไม่สำเร็จ', 'error');
    }
  }

  async function handleDeleteSequence(seq: MessageSequence) {
    setConfirmDialog({
      open: true,
      title: 'ลบ Sequence',
      description: `ลบ "${seq.name}" และ step ทั้งหมด?`,
      dangerous: true,
      onConfirm: async () => {
        setConfirmDialog((p) => ({ ...p, open: false }));
        try {
          const res = await fetch(`/api/messaging-sequences/${seq.id}`, { method: 'DELETE' });
          const json: ApiResp<{ deleted: boolean }> = await res.json();
          if (!json.success) throw new Error(json.error?.message ?? 'ลบไม่สำเร็จ');
          void refetch();
          if (selectedSeqId === seq.id) setSelectedSeqId(null);
          setSuccessMsg('ลบ Sequence เรียบร้อยแล้ว');
        } catch (err) {
          toast(err instanceof Error ? err.message : 'ลบไม่สำเร็จ', 'error');
        }
      },
    });
  }

  async function handleSaveStep(data: Omit<MessageSequenceStep, 'id' | 'sequenceId'>) {
    if (!selectedSeqId) return;
    setSavingStep(true);
    try {
      if (editingStep) {
        // Update existing step
        const res = await fetch(`/api/messaging-sequences/${selectedSeqId}/steps`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stepId: editingStep.id, ...data }),
        });
        const json: ApiResp<MessageSequenceStep> = await res.json();
        if (!json.success) throw new Error(json.error?.message ?? 'อัปเดตไม่สำเร็จ');
        setSuccessMsg('อัปเดต Step เรียบร้อยแล้ว');
      } else {
        // Create new step
        const res = await fetch(`/api/messaging-sequences/${selectedSeqId}/steps`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        const json: ApiResp<MessageSequenceStep> = await res.json();
        if (!json.success) throw new Error(json.error?.message ?? 'เพิ่มไม่สำเร็จ');
        setSuccessMsg('เพิ่ม Step เรียบร้อยแล้ว');
      }
      setShowStepForm(false);
      setEditingStep(null);
      void refetchDetail();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'ไม่สำเร็จ', 'error');
    } finally {
      setSavingStep(false);
    }
  }

  async function handleDeleteStep(step: MessageSequenceStep) {
    setConfirmDialog({
      open: true,
      title: 'ลบ Step',
      description: `ลบ Step ${step.stepOrder}?`,
      dangerous: true,
      onConfirm: async () => {
        setConfirmDialog((p) => ({ ...p, open: false }));
        try {
          const res = await fetch(`/api/messaging-sequences/${selectedSeqId}/steps`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ stepId: step.id }),
          });
          const json: ApiResp<{ deleted: boolean }> = await res.json();
          if (!json.success) throw new Error(json.error?.message ?? 'ลบไม่สำเร็จ');
          void refetchDetail();
          if (selectedStepId === step.id) setSelectedStepId(null);
          setSuccessMsg('ลบ Step เรียบร้อยแล้ว');
        } catch (err) {
          toast(err instanceof Error ? err.message : 'ลบไม่สำเร็จ', 'error');
        }
      },
    });
  }

  async function handleMoveStep(stepId: string, direction: 'up' | 'down') {
    if (!selectedSeq?.steps) return;
    const sorted = [...selectedSeq.steps].sort((a, b) => a.stepOrder - b.stepOrder);
    const idx = sorted.findIndex((s) => s.id === stepId);
    if (idx === -1) return;
    if (direction === 'up' && idx === 0) return;
    if (direction === 'down' && idx === sorted.length - 1) return;

    const targetStep = sorted[direction === 'up' ? idx - 1 : idx + 1];
    const currentStep = sorted[idx];

    try {
      // Swap stepOrder via API
      await fetch(`/api/messaging-sequences/${selectedSeqId}/steps`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stepId: currentStep.id, stepOrder: targetStep.stepOrder }),
      });
      await fetch(`/api/messaging-sequences/${selectedSeqId}/steps`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stepId: targetStep.id, stepOrder: currentStep.stepOrder }),
      });
      void refetchDetail();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'ย้ายไม่สำเร็จ', 'error');
    }
  }

  const sortedSteps = selectedSeq?.steps ? [...selectedSeq.steps].sort((a, b) => a.stepOrder - b.stepOrder) : [];

  return (
    <main className="space-y-6">
      {/* Header */}
      <section className="relative overflow-hidden rounded-xl border border-[hsl(var(--color-border))] px-6 py-5" style={{ background: 'hsl(var(--card))' }}>
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute inset-0 opacity-20" style={{ background: 'linear-gradient(135deg, hsl(217 100% 67% / 0.2) 0%, transparent 60%)' }} />
        </div>
        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/admin/settings" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[hsl(var(--color-border))]  shadow-sm transition-all hover:scale-105 active:scale-95">
              <ArrowLeft className="h-4 w-4 text-[hsl(var(--primary))]" />
            </Link>
            <div>
              <h1 className="text-lg font-semibold text-[hsl(var(--card-foreground))]">ข้อความอัตโนมัติ</h1>
              <p className="text-xs text-[hsl(var(--on-surface-variant))] mt-0.5">สร้างลำดับข้อความที่ส่งให้ผู้เช่าอัตโนมัติ</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => void refetch()} className="inline-flex items-center gap-2 rounded-lg border border-[hsl(var(--color-border))]  px-4 py-2 text-sm font-medium text-[hsl(var(--card-foreground))] shadow-sm transition-all hover:scale-105">
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} /> รีเฟรช
            </button>
            <button
              onClick={() => setShowCreateDialog(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-[hsl(var(--primary))] text-white px-5 py-2.5 text-sm font-semibold shadow-sm transition-all hover:scale-105 active:scale-95"
            >
              <Plus className="h-4 w-4" /> สร้าง Sequence ใหม่
            </button>
          </div>
        </div>
      </section>

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-[hsl(var(--on-surface-variant))]">
        <Link href="/admin/settings" className="flex items-center gap-1 hover:text-[hsl(var(--card-foreground))]">ตั้งค่า</Link>
        <span>/</span>
        <span className="text-[hsl(var(--card-foreground))]">ข้อความอัตโนมัติ</span>
      </div>

      {/* Alerts */}
      {successMsg && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 rounded-xl border border-emerald-500/30 px-4 py-3 text-sm font-medium" style={{ background: 'rgba(34,197,94,0.1)', color: '#4ade80' }}
        >
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          {successMsg}
        </motion.div>
      )}
      {fetchError && (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/30 px-4 py-3 text-sm font-medium" style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171' }}>
          <XCircle className="h-5 w-5 shrink-0" />
          {fetchError instanceof Error ? fetchError.message : String(fetchError)}
        </div>
      )}

      {/* Keyboard hint */}
      <div className="flex items-center gap-2 rounded-xl border border-[hsl(var(--color-border))] px-4 py-2 text-xs text-[hsl(var(--on-surface-variant))] ">
        <span className="font-medium">💡</span>
        กด <kbd className="rounded bg-[hsl(var(--on-surface))]/10 px-1.5 py-0.5 font-mono text-[10px]">↑↓</kbd> บนแป้นคีย์บอร์ดเพื่อย้าย step ขึ้น-ลง
      </div>

      {/* Two-column layout */}
      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        {/* Left: Sequence list */}
        <div className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-[hsl(var(--on-surface-variant))] opacity-60">
            Sequences ({sequences.length})
          </h2>

          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-[hsl(var(--primary))]" />
            </div>
          )}

          {!isLoading && sequences.length === 0 && (
            <div className="rounded-2xl border border-dashed border-[hsl(var(--color-border))] p-8 text-center">
              <MessageSquare className="h-10 w-10 mx-auto text-[hsl(var(--on-surface-variant))]/40 mb-3" />
              <p className="text-sm text-[hsl(var(--on-surface-variant))]">ยังไม่มี Sequence</p>
              <button
                onClick={() => setShowCreateDialog(true)}
                className="mt-3 text-xs text-[hsl(var(--primary))] font-medium hover:underline"
              >
                สร้าง Sequence แรก →
              </button>
            </div>
          )}

          <div className="space-y-2">
            {sequences.map((seq) => (
              <div
                key={seq.id}
                onClick={() => setSelectedSeqId(seq.id)}
                className={[
                  'group rounded-xl border p-4 cursor-pointer transition-all',
                  selectedSeqId === seq.id
                    ? 'border-[hsl(var(--primary))]/40 bg-[hsl(var(--primary))]/5'
                    : 'border-[hsl(var(--color-border))]  hover:border-[hsl(var(--primary))]/30',
                ].join(' ')}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-semibold text-[hsl(var(--card-foreground))] truncate">{seq.name}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-[hsl(var(--on-surface-variant))]">
                        {TRIGGER_LABELS[seq.trigger] ?? seq.trigger}
                      </span>
                      <span className="text-xs text-[hsl(var(--on-surface-variant))]/60">{seq.stepCount ?? 0} steps</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={(e) => { e.stopPropagation(); void handleToggle(seq); }}
                      disabled={togglingIds.has(seq.id)}
                      className={[
                        'rounded-lg px-2 py-1 text-[10px] font-semibold transition-all',
                        seq.isActive
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : 'border border-[hsl(var(--color-border))] text-[hsl(var(--on-surface-variant))] hover:border-emerald-500/40',
                      ].join(' ')}
                    >
                      {togglingIds.has(seq.id) ? <Loader2 className="h-3 w-3 animate-spin" /> : seq.isActive ? 'ON' : 'OFF'}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); void handleDeleteSequence(seq); }}
                      className="rounded-lg p-1.5 text-[hsl(var(--on-surface-variant))]/40 hover:text-red-400 hover:bg-red-500/10 transition-all"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Step editor */}
        <div className="space-y-4">
          {!selectedSeq ? (
            <div className="rounded-2xl border border-dashed border-[hsl(var(--color-border))] p-12 text-center">
              <Zap className="h-10 w-10 mx-auto text-[hsl(var(--on-surface-variant))]/40 mb-3" />
              <p className="text-sm text-[hsl(var(--on-surface-variant))]">เลือก Sequence ด้านซ้ายเพื่อดู step</p>
            </div>
          ) : (
            <>
              {/* Sequence header */}
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-[hsl(var(--card-foreground))]">{selectedSeq.name}</h2>
                  <p className="text-xs text-[hsl(var(--on-surface-variant))] mt-0.5">
                    {TRIGGER_LABELS[selectedSeq.trigger] ?? selectedSeq.trigger}
                    {selectedSeq.description && ` — ${selectedSeq.description}`}
                  </p>
                </div>
                <button
                  onClick={() => { setEditingStep(null); setShowStepForm(true); }}
                  className="inline-flex items-center gap-2 rounded-xl bg-[hsl(var(--primary))] text-white px-4 py-2 text-sm font-semibold shadow-sm transition-all hover:scale-105 active:scale-95"
                >
                  <Plus className="h-4 w-4" /> เพิ่ม Step
                </button>
              </div>

              {/* Step form */}
              {showStepForm && (
                <StepEditorForm
                  step={editingStep}
                  _sequenceId={selectedSeqId!}
                  onSave={handleSaveStep}
                  onCancel={() => { setShowStepForm(false); setEditingStep(null); }}
                  saving={savingStep}
                />
              )}

              {/* Steps list */}
              {sortedSteps.length === 0 && !showStepForm && (
                <div className="rounded-2xl border border-dashed border-[hsl(var(--color-border))] p-8 text-center">
                  <MessageSquare className="h-8 w-8 mx-auto text-[hsl(var(--on-surface-variant))]/40 mb-2" />
                  <p className="text-sm text-[hsl(var(--on-surface-variant))]">ยังไม่มี step — กด &quot;เพิ่ม Step&quot; ข้างบน</p>
                </div>
              )}

              <div className="space-y-3">
                <AnimatePresence>
                  {sortedSteps.map((step, i) => (
                    <StepRow
                      key={step.id}
                      step={step}
                      index={i}
                      isSelected={selectedStepId === step.id}
                      onSelect={() => {
                        setSelectedStepId(step.id === selectedStepId ? null : step.id);
                        setShowStepForm(false);
                        setEditingStep(null);
                      }}
                      onMoveUp={() => void handleMoveStep(step.id, 'up')}
                      onMoveDown={() => void handleMoveStep(step.id, 'down')}
                      onEdit={() => {
                        setEditingStep(step);
                        setShowStepForm(true);
                        setSelectedStepId(null);
                      }}
                      onDelete={() => void handleDeleteStep(step)}
                      onPreview={() => {
                        setPreviewStep(step);
                        setPreviewOpen(true);
                      }}
                      canMoveUp={i > 0}
                      canMoveDown={i < sortedSteps.length - 1}
                    />
                  ))}
                </AnimatePresence>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Modals */}
      <CreateSequenceDialog
        open={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        onCreate={handleCreateSequence}
      />

      <StepPreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        step={previewStep}
        sequenceName={selectedSeq?.name ?? ''}
      />

      <ConfirmDialog
        open={confirmDialog.open}
        title={confirmDialog.title}
        description={confirmDialog.description}
        dangerous={confirmDialog.dangerous}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog((p) => ({ ...p, open: false }))}
      />
    </main>
  );
}