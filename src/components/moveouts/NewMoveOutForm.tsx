'use client';

import React from 'react';
import { AlertCircle, RefreshCw, ChevronRight } from 'lucide-react';
import type { ContractOption } from './types';
import { EMPTY_NEW_FORM } from './types';

interface NewMoveOutFormProps {
  form: typeof EMPTY_NEW_FORM;
  setForm: React.Dispatch<React.SetStateAction<typeof EMPTY_NEW_FORM>>;
  contracts: ContractOption[];
  contractsLoading: boolean;
  onSubmit: (e: React.FormEvent) => void;
  saving: boolean;
  error: string | null;
  onCancel: () => void;
}

export function NewMoveOutForm({
  form,
  setForm,
  contracts,
  contractsLoading,
  onSubmit,
  saving,
  error,
  onCancel,
}: NewMoveOutFormProps) {
  const patch = (k: keyof typeof EMPTY_NEW_FORM, v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  const selectedContract = contracts.find((c) => c.id === form.contractId);

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <p className="text-[12px] text-on-surface-variant leading-relaxed">
        บันทึกการย้ายออกสำหรับสัญญาเช่าที่กำลังใช้งาน ระบบจะอัปเดตสถานะห้องเป็นว่างและยกเลิกสัญญาเช่า
      </p>

      {/* Contract select */}
      <div>
        <label className="mb-1 block text-[12px] font-semibold text-on-surface">
          สัญญาเช่า <span className="text-red-500">*</span>
        </label>
        {contractsLoading ? (
          <div className="flex h-10 items-center rounded-md border border-outline-variant px-3 text-xs text-on-surface-variant animate-pulse">
            กำลังโหลดสัญญา...
          </div>
        ) : (
          <select
            className="w-full rounded-xl border border-outline bg-surface-container-lowest px-3 py-2.5 text-sm text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            required
            value={form.contractId}
            onChange={(e) => patch('contractId', e.target.value)}
          >
            <option value="">— เลือกสัญญาเช่า —</option>
            {contracts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.roomNo} - {c.tenantName} (มัดจำ: {c.deposit.toLocaleString()} ฿)
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Move-out date */}
      <div>
        <label className="mb-1 block text-[12px] font-semibold text-on-surface">
          วันที่ย้ายออก <span className="text-red-500">*</span>
        </label>
        <input
          type="date"
          className="w-full rounded-xl border border-outline bg-surface-container-lowest px-3 py-2.5 text-sm text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          required
          value={form.moveOutDate}
          onChange={(e) => patch('moveOutDate', e.target.value)}
        />
      </div>

      {/* Notes */}
      <div>
        <label className="mb-1 block text-[12px] font-semibold text-on-surface">
          หมายเหตุ
        </label>
        <textarea
          className="w-full rounded-xl border border-outline bg-surface-container-lowest px-3 py-2.5 text-sm text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
          rows={3}
          placeholder="หมายเหตุเพิ่มเติม..."
          value={form.notes}
          onChange={(e) => patch('notes', e.target.value)}
        />
      </div>

      {/* Selected contract info */}
      {selectedContract && (
        <div className="rounded-lg border border-outline-variant bg-surface-container-lowest px-4 py-3 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
              ห้อง
            </span>
            <span className="font-medium text-on-surface">
              {selectedContract.roomNo}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
              เงินมัดจำ
            </span>
            <span className="font-medium text-on-surface">
              {selectedContract.deposit.toLocaleString()} ฿
            </span>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-error-container bg-error-container/20 px-3 py-2.5 text-xs font-medium text-on-error-container">
          <AlertCircle size={13} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-lg border border-outline bg-surface-container-lowest px-4 py-2 text-sm font-medium text-on-surface shadow-sm transition-colors hover:bg-surface-container"
          onClick={onCancel}
        >
          ยกเลิก
        </button>
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-on-primary shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? (
            <>
              <RefreshCw size={12} className="animate-spin" />
              กำลังบันทึก...
            </>
          ) : (
            <>
              <ChevronRight size={13} />
              บันทึก
            </>
          )}
        </button>
      </div>
    </form>
  );
}
