'use client';

import React from 'react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { XCircle, Send, Calculator, CheckCircle2, Trash2 } from 'lucide-react';
import type { MoveOutRecord } from './types';
import { EMPTY_DEDUCTION_FORM } from './types';
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
              className="inline-flex items-center gap-1 rounded-lg border border-error-container bg-error-container/20 px-3 py-1.5 text-xs font-medium text-on-error-container hover:bg-error-container/30"
            >
              <XCircle size={12} />
              ยกเลิก
            </button>
          )}
          {moveOut.contract?.primaryTenant?.lineUserId && (
            <button
              onClick={onSendNotice}
              className="inline-flex items-center gap-1 rounded-lg border border-info-container bg-info-container/20 px-3 py-1.5 text-xs font-medium text-on-info-container hover:bg-info-container/30"
            >
              <Send size={12} />
              ส่ง LINE
            </button>
          )}
        </div>
      </div>

      {/* Summary Card */}
      <div className="rounded-lg border border-outline-variant bg-surface-container-lowest px-4 py-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
            ห้อง
          </span>
          <span className="font-semibold text-on-surface">
            {moveOut.contract?.roomNo ?? '—'}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
            ผู้เช่า
          </span>
          <span className="text-on-surface">
            {moveOut.contract?.primaryTenant?.fullName ?? '—'}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
            วันที่ย้ายออก
          </span>
          <span className="text-on-surface">
            {fmtDate(moveOut.moveOutDate)}
          </span>
        </div>
      </div>

      {/* Deposit Summary */}
      <div className="rounded-lg border border-primary-container/30 bg-primary-container/30 px-4 py-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
            เงินมัดจำ
          </span>
          <span className="font-semibold text-on-surface">
            {fmtMoney(moveOut.depositAmount)}
          </span>
        </div>
        <div className="flex items-center justify-between text-on-error-container">
          <span className="text-[11px] font-semibold uppercase tracking-wider">
            หักลงาด
          </span>
          <span className="font-semibold">-{fmtMoney(moveOut.totalDeduction)}</span>
        </div>
        <div className="border-t border-outline-variant pt-2 flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
            คืนเงินสุทธิ
          </span>
          <span className="font-bold text-lg text-on-success-container">
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
            className="inline-flex items-center gap-1.5 rounded-lg bg-warning-container px-4 py-2 text-sm font-semibold text-on-warning-container shadow-sm hover:bg-warning-container/80 disabled:opacity-50"
          >
            <Calculator size={14} />
            {calculating ? 'กำลังคำนวณ...' : 'คำนวณมัดจำ'}
          </button>
        )}
        {canConfirm && (
          <button
            onClick={onConfirm}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-700"
          >
            <CheckCircle2 size={14} />
            ยืนยันการย้ายออก
          </button>
        )}
        {canRefund && (
          <button
            onClick={onRefund}
            className="inline-flex items-center gap-1.5 rounded-lg bg-success-container px-4 py-2 text-sm font-semibold text-on-success-container shadow-sm hover:bg-success-container/80"
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
          className="rounded-lg border border-outline-variant p-4 space-y-3"
        >
          <h4 className="text-[12px] font-semibold text-on-surface">
            รายการหักลบ
          </h4>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[11px] font-medium text-on-surface">
                ค่าทำความสะอาด
              </label>
              <input
                type="number"
                min="0"
                step="1"
                className="w-full rounded-lg border border-outline bg-surface-container-lowest px-3 py-2 text-sm text-on-surface"
                value={deductionForm.cleaningFee}
                onChange={(e) => patchDeduction('cleaningFee', e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-on-surface">
                ค่าซ่อมแซม
              </label>
              <input
                type="number"
                min="0"
                step="1"
                className="w-full rounded-lg border border-outline bg-surface-container-lowest px-3 py-2 text-sm text-on-surface"
                value={deductionForm.damageRepairCost}
                onChange={(e) =>
                  patchDeduction('damageRepairCost', e.target.value)
                }
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-on-surface">
              หักอื่นๆ
            </label>
            <input
              type="number"
              min="0"
              step="1"
              className="w-full rounded-lg border border-outline bg-surface-container-lowest px-3 py-2 text-sm text-on-surface"
              value={deductionForm.otherDeductions}
              onChange={(e) =>
                patchDeduction('otherDeductions', e.target.value)
              }
            />
          </div>
          {calcError && (
            <div className="text-xs text-on-error-container">{calcError}</div>
          )}
          <button
            type="submit"
            disabled={calculating}
            className="w-full rounded-lg bg-warning-container py-2 text-sm font-semibold text-on-warning-container hover:bg-warning-container/80 disabled:opacity-50"
          >
            {calculating ? 'กำลังคำนวณ...' : 'คำนวณและบันทึก'}
          </button>
        </form>
      )}

      {/* Add Item Form */}
      {canCalculate && (
        <form
          onSubmit={onAddItem}
          className="rounded-lg border border-outline-variant p-4 space-y-3"
        >
          <h4 className="text-[12px] font-semibold text-on-surface">
            เพิ่มรายการตรวจสอบ
          </h4>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[11px] font-medium text-on-surface">
                หมวดหมู่
              </label>
              <select
                className="w-full rounded-lg border border-outline bg-surface-container-lowest px-3 py-2 text-sm text-on-surface"
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
              <label className="mb-1 block text-[11px] font-medium text-on-surface">
                สภาพ
              </label>
              <select
                className="w-full rounded-lg border border-outline bg-surface-container-lowest px-3 py-2 text-sm text-on-surface"
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
            <label className="mb-1 block text-[11px] font-medium text-on-surface">
              รายการ
            </label>
            <input
              type="text"
              className="w-full rounded-lg border border-outline bg-surface-container-lowest px-3 py-2 text-sm text-on-surface"
              placeholder="เช่น ผนังทาสี, กระเบื้องแตก"
              value={newItemForm.item}
              onChange={(e) => patchItem('item', e.target.value)}
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-on-surface">
              ค่าใช้จ่าย (฿)
            </label>
            <input
              type="number"
              min="0"
              step="1"
              className="w-full rounded-lg border border-outline bg-surface-container-lowest px-3 py-2 text-sm text-on-surface"
              value={newItemForm.cost}
              onChange={(e) => patchItem('cost', e.target.value)}
            />
          </div>
          <button
            type="submit"
            disabled={itemSaving}
            className="w-full rounded-lg bg-primary py-2 text-sm font-semibold text-on-primary hover:bg-primary/90 disabled:opacity-50"
          >
            {itemSaving ? 'กำลังเพิ่ม...' : 'เพิ่มรายการ'}
          </button>
        </form>
      )}

      {/* Inspection Items */}
      {moveOut.items.length > 0 && (
        <div className="rounded-lg border border-outline-variant p-4 space-y-3">
          <h4 className="text-[12px] font-semibold text-on-surface">
            รายการตรวจสอบ
          </h4>
          <div className="space-y-2">
            {moveOut.items.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between rounded-lg bg-surface-container px-3 py-2"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-on-surface">
                      {item.item}
                    </span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded ${
                        item.condition === 'GOOD'
                          ? 'bg-success-container text-on-success-container'
                          : item.condition === 'FAIR'
                            ? 'bg-warning-container text-on-warning-container'
                            : item.condition === 'DAMAGED'
                              ? 'bg-error-container text-on-error-container'
                              : 'bg-surface-container-low text-on-surface-variant'
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
                  <div className="text-[11px] text-on-surface-variant">
                    {item.category}{' '}
                    {item.notes && `- ${item.notes}`}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-on-error-container">
                    {fmtMoney(item.cost)}
                  </span>
                  {canCalculate && (
                    <button
                      onClick={() => onDeleteItem(item.id)}
                      className="text-on-error-container hover:text-error-container"
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
        <div className="rounded-lg border border-outline-variant p-4">
          <h4 className="text-[12px] font-semibold text-on-surface mb-2">
            หมายเหตุ
          </h4>
          <p className="text-sm text-on-surface-variant whitespace-pre-wrap">
            {moveOut.notes}
          </p>
        </div>
      )}

      {/* Timeline */}
      <div className="rounded-lg border border-outline-variant p-4 space-y-2">
        <h4 className="text-[12px] font-semibold text-on-surface">
          ประวัติ
        </h4>
        <div className="text-xs text-on-surface-variant space-y-1">
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
