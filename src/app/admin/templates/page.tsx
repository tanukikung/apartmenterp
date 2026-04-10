'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ClientOnly } from '@/components/ui/ClientOnly';
import { ExternalLink, FilePlus2, Layers3, PencilLine } from 'lucide-react';

const TEMPLATE_TYPE_LABELS: Record<string, string> = {
  INVOICE: 'ใบแจ้งหนี้',
  PAYMENT_NOTICE: 'แจ้งชำระ',
  RECEIPT: 'ใบเสร็จ',
  CONTRACT: 'สัญญาเช่า',
};

const TEMPLATE_STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'เปิดใช้งาน',
  ARCHIVED: 'เก็บแล้ว',
  DRAFT: 'ร่าง',
};

const TEMPLATE_STATUS_STYLES: Record<string, string> = {
  ACTIVE: 'bg-[var(--tertiary-container)] text-[var(--on-tertiary-container)]',
  ARCHIVED: 'bg-[var(--error-container)] text-[var(--on-error-container)]',
  DRAFT: 'bg-amber-50 text-amber-700 border border-amber-200',
};

type TemplateVersion = {
  id: string;
  version: number;
  status: string;
};

type TemplateRow = {
  id: string;
  name: string;
  description: string | null;
  type: string;
  status: string;
  updatedAt: string;
  activeVersionId: string | null;
  activeVersion?: TemplateVersion | null;
  versions?: TemplateVersion[];
};

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch('/api/templates?pageSize=100', { cache: 'no-store' });
        const json = await response.json();
        if (!response.ok || !json.success) {
          throw new Error(json.error?.message ?? 'ไม่สามารถโหลดเทมเพลต');
        }
        setTemplates((json.data?.data ?? []) as TemplateRow[]);
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : 'ไม่สามารถโหลดเทมเพลต');
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, []);

  return (
    <main className="space-y-6">
      <section className="rounded-2xl border border-[var(--outline-variant)]/10 bg-gradient-to-br from-[var(--primary-container)] to-[var(--primary)] px-6 py-5">
        <div>
          <h1 className="text-xl font-semibold text-[var(--on-primary)]">เทมเพลต</h1>
          <p className="text-sm text-[var(--on-primary)]/80">
            เทมเพลตเอกสารเวอร์ชันต่างๆ พร้อมการผูกข้อมูลฟิลด์ ERP และการแสดงตัวอย่าง
          </p>
        </div>
        <div className="flex items-center gap-2 mt-4">
          <Link href="/admin/templates/new/edit" className="inline-flex items-center gap-2 rounded-lg border border-[var(--outline)] bg-primary text-[var(--on-primary)] hover:bg-primary/90 px-4 py-2 text-sm font-medium shadow-sm transition-colors">
            <FilePlus2 className="h-4 w-4" />
            เทมเพลตใหม่
          </Link>
        </div>
      </section>

      {error ? <div className="auth-alert auth-alert-error">{error}</div> : null}

      <section className="bg-[var(--surface-container-lowest)] rounded-xl border border-[var(--outline-variant)]/10 overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--outline-variant)]">
          <div className="text-sm font-semibold text-[var(--primary)] flex items-center gap-2">
            <Layers3 className="h-4 w-4 text-[var(--primary)]" />
            ทะเบียนเทมเพลต
          </div>
          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold bg-[var(--surface-container)] text-[var(--on-surface-variant)] mt-1">{templates.length} เทมเพลต</span>
        </div>
        <div className="overflow-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-[var(--surface-container)]">
              <tr>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-[var(--on-surface-variant)]">ชื่อ</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-[var(--on-surface-variant)]">ประเภท</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-[var(--on-surface-variant)]">สถานะ</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-[var(--on-surface-variant)]">เวอร์ชันที่ใช้งาน</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-[var(--on-surface-variant)]">อัปเดต</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-[var(--on-surface-variant)]">การดำเนินการ</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-500">
                    กำลังโหลดเทมเพลต...
                  </td>
                </tr>
              ) : templates.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-500">
                    ยังไม่มีเทมเพลต สร้างเทมเพลตแรกเพื่อเริ่มสร้างเอกสารแบบแบตช์
                  </td>
                </tr>
              ) : (
                templates.map((template) => (
                  <tr key={template.id}>
                    <td>
                      <div className="font-semibold text-slate-900">{template.name}</div>
                      {template.description ? (
                        <div className="mt-1 max-w-[380px] text-xs text-slate-500">{template.description}</div>
                      ) : null}
                    </td>
                    <td>
                      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold bg-[var(--surface-container)] text-[var(--on-surface-variant)]">
                        {TEMPLATE_TYPE_LABELS[template.type] ?? template.type.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${TEMPLATE_STATUS_STYLES[template.status] ?? ''}`}
                      >
                        {TEMPLATE_STATUS_LABELS[template.status] ?? '—'}
                      </span>
                    </td>
                    <td>
                      {template.activeVersion ? (
                        <div className="space-y-1">
                          <div className="font-medium text-[var(--on-surface)]">v{template.activeVersion.version}</div>
                          <div className="text-xs text-[var(--on-surface-variant)]">{template.activeVersion.status}</div>
                        </div>
                      ) : (
                        <span className="text-sm text-[var(--on-surface-variant)]">ไม่มีเวอร์ชันที่ใช้งาน</span>
                      )}
                    </td>
                    <td><ClientOnly fallback="-">{new Date(template.updatedAt).toLocaleString('th-TH')}</ClientOnly></td>
                    <td>
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/admin/templates/${template.id}`} className="inline-flex items-center gap-1 rounded-lg border border-[var(--outline)] bg-[var(--surface-container-lowest)] px-3 py-1.5 text-xs font-medium text-[var(--on-surface)] shadow-sm transition-colors hover:bg-[var(--surface-container)]">
                          <ExternalLink className="h-3.5 w-3.5" />
                          รายละเอียด
                        </Link>
                        <Link href={`/admin/templates/${template.id}/edit`} className="inline-flex items-center gap-1 rounded-lg border border-[var(--outline)] bg-[var(--surface-container-lowest)] px-3 py-1.5 text-xs font-medium text-[var(--on-surface)] shadow-sm transition-colors hover:bg-[var(--surface-container)]">
                          <PencilLine className="h-3.5 w-3.5" />
                          แก้ไข
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
