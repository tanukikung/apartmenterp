'use client';

import React from 'react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import {
  XCircle,
  Send,
  Calculator,
  CheckCircle2,
  Trash2,
} from 'lucide-react';
import type {
  MoveOutRecord,
  MoveOutItemRecord,
} from './types';
import {
  EMPTY_DEDUCTION_FORM,
} from './types';
import { fmtDate, fmtMoney } from './utils';
import { MoveOutStatusBadge } from './MoveOutStatusBadge';

interface MoveOutDetailPanelProps {
  moveOut: MoveOutRecord;
  deductionForm: typeof EMPTY_DEDUCTION_FORM;
  setDeductionForm: React.Dispatch<React.SetStateAction<typeof EMPTY_DEDUCTION_FORM>>;
  newItemForm: {
    category: string;
    item: string;
    condition: 'GOOD' | 'FAIR' | 'DAMAGED' | 'MISSING';
    cost: string;
    notes: string;
  };
  setNewItemForm: React.Dispatch<
    React.SetStateAction<{
      category: string;
      item: string;
      condition: 'GOOD' | 'FAIR' | 'DAMAGED' | 'MISSING';
      cost: string;
      notes: string;
    }>
  >;
  onCalculate: (e: React.FormEvent) => void;
  onAddItem: (e: React.FormEvent) => void;
  onDeleteItem: (itemId: string) => void;
  onConfirm: () => void;
  onRefund: () => void;
  onCancel: () => void;
  onSendNotice: () => void;
  calculating: boolean;
  calcError: string | null;
  itemSaving: boolean;
  confirmDialog: {
    open: boolean;
    title: string;
    description?: string;
    dangerous?: boolean;
    onConfirm: () => void;
  };
  setConfirmDialog: React.Dispatch<
    React.SetStateAction<{
      open: boolean;
      title: string;
      description?: string;
      dangerous?: boolean;
      onConfirm: () => void;
    }>
  >;
}

export function MoveOutDetailPanel({
  moveOut,
  deductionForm,
  setDeductionForm,
  newItemForm,
  setNewItemForm,
  onCalculate,
  onAddItem,
  onDeleteItem,
  onConfirm,
  onRefund,
  onCancel,
  onSendNotice,
  calculating,
  calcError,
  itemSaving,
  confirmDialog,
  setConfirmDialog,
}: MoveOutDetailPanelProps) {
  const canCalculate =
    moveOut.status === 'PENDING' || moveOut.status === 'INSPECTION_DONE';
  const canConfirm = moveOut.status === 'DEPOSIT_CALCULATED';
  const canRefund = moveOut.status === 'CONFIRMED';
  const canCancel = moveOut.status !== 'REFUNDED' && moveOut.status !== 'CANCELLED';

  const patchDeduction = (k: keyof typeof EMPTY_DEDUCTION_FORM, v: string) =>
    setDeductionForm((f) => ({ ...f, [k]: v }));

  const patchItem = (k: string, v: string) =>
    setNewItemForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="flex flex-col gap-5">
      {/* Status and Actions */}
      <div className="flex items-center justify-between">
        <MoveOutStatusBadge status={moveOut.status} />
        <div className="flex gap-2">
          {canCancel && (
            <button
              onClick={onCancel}
              className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100"
            >
              <XCircle size={12} />
              ยกเลิก
            </button>
          )}
          {moveOut.contract?.primaryTenant?.lineUserId && (
            <button
              onClick={onSendNotice}
              className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
            >
              <Send size={12} />
              ส่ง LINE
            </button>
          )}
        </div>
      </div>

      {/* Summary Card */}
      <div className="rounded-lg border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] px-4 py-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--on-surface-variant)]">
            ห้อง
          </span>
          <span className="font-semibold text-[var(--on-surface)]">
            {moveOut.contract?.roomNo ?? '—'}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--on-surface-variant)]">
            ผู้เช่า
          </span>
          <span className="text-[var(--on-surface)]">
            {moveOut.contract?.primaryTenant?.fullName ?? '—'}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--on-surface-variant)]">
            วันที่ย้ายออก
          </span>
          <span className="text-[var(--on-surface)]">
            {fmtDate(moveOut.moveOutDate)}
          </span>
        </div>
      </div>

      {/* Deposit Summary */}
      <div className="rounded-lg border border-[var(--primary-container)]/30 bg-[var(--primary-container)]/30 px-4 py-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--on-surface-variant)]">
            เงินมัดจำ
          </span>
          <span className="font-semibold text-[var(--on-surface)]">
            {fmtMoney(moveOut.depositAmount)}
          </span>
        </div>
        <div className="flex items-center justify-between text-red-600">
          <span className="text-[11px] font-semibold uppercase tracking-wider">
            หักลงาด
          </span>
          <span className="font-semibold">-{fmtMoney(moveOut.totalDeduction)}</span>
        </div>
        <div className="border-t border-[var(--outline-variant)] pt-2 flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--on-surface-variant)]">
            คืนเงินสุทธิ
          </span>
          <span className="font-bold text-lg text-emerald-600">
            {fmtMoney(moveOut.finalRefund)}
          </span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-2">
        {canCalculate && (
          <button
            onClick={onCalculate}
            disabled={calculating}
            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-amber-600 disabled:opacity-50"
          >
            <Calculator size={14} />
            {calculating ? 'กำลังคำนวณ...' : 'คำนวณมัดจำ'}
          </button>
        )}
        {canConfirm && (
          <button
            onClick={onConfirm}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-600"
          >
            <CheckCircle2 size={14} />
            ยืนยันการย้ายออก
          </button>
        )}
        {canRefund && (
          <button
            onClick={onRefund}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-600"
          >
            <CheckCircle2 size={14} />
            บันทึกคืนเงิน
          </button>
        )}
      </div>

      {/* Deduction Form */}
      {canCalculate && (
        <form
          onSubmit={onCalculate}
          className="rounded-lg border border-[var(--outline-variant)] p-4 space-y-3"
        >
          <h4 className="text-[12px] font-semibold text-[var(--on-surface)]">
            รายการหักลบ
          </h4>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[11px] font-medium text-[var(--on-surface)]">
                ค่าทำความสะอาด
              </label>
              <input
                type="number"
                min="0"
                step="1"
                className="w-full rounded-lg border border-[var(--outline)] bg-[var(--surface-container-lowest)] px-3 py-2 text-sm text-[var(--on-surface)]"
                value={deductionForm.cleaningFee}
                onChange={(e) => patchDeduction('cleaningFee', e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-[var(--on-surface)]">
                ค่าซ่อมแซม
              </label>
              <input
                type="number"
                min="0"
                step="1"
                className="w-full rounded-lg border border-[var(--outline)] bg-[var(--surface-container-lowest)] px-3 py-2 text-sm text-[var(--on-surface)]"
                value={deductionForm.damageRepairCost}
                onChange={(e) =>
                  patchDeduction('damageRepairCost', e.target.value)
                }
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-[var(--on-surface)]">
              หักอื่นๆ
            </label>
            <input
              type="number"
              min="0"
              step="1"
              className="w-full rounded-lg border border-[var(--outline)] bg-[var(--surface-container-lowest)] px-3 py-2 text-sm text-[var(--on-surface)]"
              value={deductionForm.otherDeductions}
              onChange={(e) =>
                patchDeduction('otherDeductions', e.target.value)
              }
            />
          </div>
          {calcError && (
            <div className="text-xs text-red-600">{calcError}</div>
          )}
          <button
            type="submit"
            disabled={calculating}
            className="w-full rounded-lg bg-amber-500 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
          >
            {calculating ? 'กำลังคำนวณ...' : 'คำนวณและบันทึก'}
          </button>
        </form>
      )}

      {/* Add Item Form */}
      {canCalculate && (
        <form
          onSubmit={onAddItem}
          className="rounded-lg border border-[var(--outline-variant)] p-4 space-y-3"
        >
          <h4 className="text-[12px] font-semibold text-[var(--on-surface)]">
            เพิ่มรายการตรวจสอบ
          </h4>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[11px] font-medium text-[var(--on-surface)]">
                หมวดหมู่
              </label>
              <select
                className="w-full rounded-lg border border-[var(--outline)] bg-[var(--surface-container-lowest)] px-3 py-2 text-sm text-[var(--on-surface)]"
                value={newItemForm.category}
                onChange={(e) => patchItem('category', e.target.value)}
              >
                <option value="wall">ผนัง</option>
                <option value="floor">พื้น</option>
                <option value="bathroom">ห้องน้ำ</option>
                <option value="kitchen">ห้องครัว</option>
                <option value="furniture">เฟอร์นิเจอร์</option>
                <option value="other">อื่นๆ</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-[var(--on-surface)]">
                สภาพ
              </label>
              <select
                className="w-full rounded-lg border border-[var(--outline)] bg-[var(--surface-container-lowest)] px-3 py-2 text-sm text-[var(--on-surface)]"
                value={newItemForm.condition}
                onChange={(e) => patchItem('condition', e.target.value)}
              >
                <option value="GOOD">ดี</option>
                <option value="FAIR">พอใช้</option>
                <option value="DAMAGED">เสียหาย</option>
                <option value="MISSING">หาย</option>
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-[var(--on-surface)]">
              รายการ
            </label>
            <input
              type="text"
              className="w-full rounded-lg border border-[var(--outline)] bg-[var(--surface-container-lowest)] px-3 py-2 text-sm text-[var(--on-surface)]"
              placeholder="เช่น ผนังทาสี, กระเบื้องแตก"
              value={newItemForm.item}
              onChange={(e) => patchItem('item', e.target.value)}
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-[var(--on-surface)]">
              ค่าใช้จ่าย (฿)
            </label>
            <input
              type="number"
              min="0"
              step="1"
              className="w-full rounded-lg border border-[var(--outline)] bg-[var(--surface-container-lowest)] px-3 py-2 text-sm text-[var(--on-surface)]"
              value={newItemForm.cost}
              onChange={(e) => patchItem('cost', e.target.value)}
            />
          </div>
          <button
            type="submit"
            disabled={itemSaving}
            className="w-full rounded-lg bg-primary py-2 text-sm font-semibold text-[var(--on-primary)] hover:bg-primary/90 disabled:opacity-50"
          >
            {itemSaving ? 'กำลังเพิ่ม...' : 'เพิ่มรายการ'}
          </button>
        </form>
      )}

      {/* Inspection Items */}
      {moveOut.items.length > 0 && (
        <div className="rounded-lg border border-[var(--outline-variant)] p-4 space-y-3">
          <h4 className="text-[12px] font-semibold text-[var(--on-surface)]">
            รายการตรวจสอบ
          </h4>
          <div className="space-y-2">
            {moveOut.items.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between rounded-lg bg-[var(--surface-container)] px-3 py-2"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-[var(--on-surface)]">
                      {item.item}
                    </span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded ${
                        item.condition === 'GOOD'
                          ? 'bg-emerald-100 text-emerald-700'
                          : item.condition === 'FAIR'
                            ? 'bg-amber-100 text-amber-700'
                            : item.condition === 'DAMAGED'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {item.condition === 'GOOD'
                        ? 'ดี'
                        : item.condition === 'FAIR'
                          ? 'พอใช้'
                          : item.condition === 'DAMAGED'
                            ? 'เสียหาย'
                            : 'หาย'}
                    </span>
                  </div>
                  <div className="text-[11px] text-[var(--on-surface-variant)]">
                    {item.category}{' '}
                    {item.notes && `- ${item.notes}`}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-red-600">
                    {fmtMoney(item.cost)}
                  </span>
                  {canCalculate && (
                    <button
                      onClick={() => onDeleteItem(item.id)}
                      className="text-red-500 hover:text-red-700"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Notes */}
      {moveOut.notes && (
        <div className="rounded-lg border border-[var(--outline-variant)] p-4">
          <h4 className="text-[12px] font-semibold text-[var(--on-surface)] mb-2">
            หมายเหตุ
          </h4>
          <p className="text-sm text-[var(--on-surface-variant)] whitespace-pre-wrap">
            {moveOut.notes}
          </p>
        </div>
      )}

      {/* Timeline */}
      <div className="rounded-lg border border-[var(--outline-variant)] p-4 space-y-2">
        <h4 className="text-[12px] font-semibold text-[var(--on-surface)]">
          ประวัติ
        </h4>
        <div className="text-xs text-[var(--on-surface-variant)] space-y-1">
          <div>สร้าง: {fmtDate(moveOut.createdAt)}</div>
          {moveOut.lineNoticeSentAt && (
            <div>ส่ง LINE: {fmtDate(moveOut.lineNoticeSentAt)}</div>
          )}
          {moveOut.confirmedAt && (
            <div>ยืนยัน: {fmtDate(moveOut.confirmedAt)}</div>
          )}
          {moveOut.refundAt && (
            <div>คืนเงิน: {fmtDate(moveOut.refundAt)}</div>
          )}
        </div>
      </div>

      {/* Confirm Dialog */}
      <ConfirmDialog
        open={confirmDialog.open}
        title={confirmDialog.title}
        description={confirmDialog.description}
        dangerous={confirmDialog.dangerous}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog((p) => ({ ...p, open: false }))}
      />
    </div>
  );
}
