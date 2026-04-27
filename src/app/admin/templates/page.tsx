'use client';

import Link from 'next/link';
import { useState } from 'react';

import { ClientOnly } from '@/components/ui/ClientOnly';
import { ExternalLink, FilePlus2, Grid2X2, Layers3, List, PencilLine } from 'lucide-react';
import { useApiData } from '@/hooks/useApi';

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
  ACTIVE: 'bg-emerald-500/15 text-emerald-600 border border-emerald-500/20',
  ARCHIVED: 'bg-red-500/15 text-red-400 border border-red-500/20',
  DRAFT: 'bg-amber-500/15 text-amber-600 border border-amber-500/20',
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
  const { data: templatesData, isLoading, error: fetchError } = useApiData<{ success: boolean; data?: { data: TemplateRow[] } }>('/api/templates?pageSize=100', ['templates']);
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');

  const templates: TemplateRow[] = templatesData?.data?.data ?? [];

  return (
    <main className="space-y-6">
      {/* Hero Header */}
      <section className="relative overflow-hidden rounded-2xl border border-[hsl(var(--glass-border))] bg-[hsl(var(--card))] backdrop-blur shadow-[0_4px_16px_rgba(0,0,0,0.08)] px-6 py-5">
        <div className="absolute inset-0 bg-gradient-to-br from-[hsl(var(--primary)/0.1)] via-transparent to-violet-500/10 pointer-events-none" />
        <div className="absolute top-0 right-0 w-64 h-64 bg-[hsl(var(--primary)/0.05)] rounded-full blur-3xl pointer-events-none" />
        <div className="relative flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[hsl(var(--primary)/0.2)] border border-[hsl(var(--primary)/0.3)] shadow-[var(--glow-primary)]">
              <Layers3 className="h-5 w-5 text-[hsl(var(--primary))]" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-[hsl(var(--card-foreground))]">เทมเพลต</h1>
              <p className="text-sm text-[hsl(var(--on-surface-variant))] mt-0.5">
                เทมเพลตเอกสารเวอร์ชันต่างๆ พร้อมการผูกข้อมูลฟิลด์ ERP และการแสดงตัวอย่าง
              </p>
            </div>
          </div>
          <Link
            href="/admin/templates/new/edit"
            className="inline-flex items-center gap-2 rounded-xl border border-[hsl(var(--primary)/0.3)] bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))] hover:bg-[hsl(var(--primary)/0.2)] hover:border-[hsl(var(--primary)/0.5)] hover:shadow-[var(--glow-primary)] px-4 py-2 text-sm font-medium shadow-sm transition-all duration-200 active:scale-[0.98]"
          >
            <FilePlus2 className="h-4 w-4" />
            เทมเพลตใหม่
          </Link>
        </div>
      </section>

      {fetchError ? (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400 backdrop-blur-sm">
          {fetchError instanceof Error ? fetchError.message : String(fetchError)}
        </div>
      ) : null}

      {/* Main Card */}
      <section className="rounded-2xl border border-[hsl(var(--glass-border))] bg-[hsl(var(--card))] backdrop-blur shadow-[0_4px_16px_rgba(0,0,0,0.08)] overflow-hidden">
        {/* Table Header */}
        <div className="px-5 py-4 border-b border-[hsl(var(--glass-border))] flex items-center justify-between bg-[hsl(var(--card))]">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-[hsl(var(--card-foreground))]">
              <Layers3 className="h-4 w-4 text-[hsl(var(--primary))]" />
              ทะเบียนเทมเพลต
            </div>
            <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold bg-[hsl(var(--card))] text-[hsl(var(--on-surface-variant))] border border-[hsl(var(--glass-border))]">
              {templates.length} เทมเพลต
            </span>
          </div>
          {/* View toggle */}
          <div className="flex items-center gap-1 rounded-xl border border-[hsl(var(--glass-border))] bg-[hsl(var(--card))] p-0.5 backdrop-blur">
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-200 ${
                viewMode === 'table'
                  ? 'bg-[hsl(var(--primary)/0.2)] text-[hsl(var(--primary))] border border-[hsl(var(--primary)/0.3)] shadow-[var(--glow-primary)]'
                  : 'text-[hsl(var(--on-surface-variant))] hover:text-[hsl(var(--card-foreground))] hover:bg-[hsl(var(--card))]'
              }`}
            >
              <List className="h-3.5 w-3.5" />
              ตาราง
            </button>
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-200 ${
                viewMode === 'grid'
                  ? 'bg-[hsl(var(--primary)/0.2)] text-[hsl(var(--primary))] border border-[hsl(var(--primary)/0.3)] shadow-[var(--glow-primary)]'
                  : 'text-[hsl(var(--on-surface-variant))] hover:text-[hsl(var(--card-foreground))] hover:bg-[hsl(var(--card))]'
              }`}
            >
              <Grid2X2 className="h-3.5 w-3.5" />
              การ์ด
            </button>
          </div>
        </div>

        <div className="overflow-auto">
          {viewMode === 'table' ? (
            <table className="w-full text-sm text-left">
              <thead className="bg-[hsl(var(--card))]">
                <tr>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))]">ชื่อ</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))]">ประเภท</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))]">สถานะ</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))]">เวอร์ชันที่ใช้งาน</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))]">อัปเดต</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))]">การดำเนินการ</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-sm text-[hsl(var(--on-surface-variant))]">
                      กำลังโหลดเทมเพลต...
                    </td>
                  </tr>
                ) : templates.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-sm text-[hsl(var(--on-surface-variant))]">
                      ยังไม่มีเทมเพลต สร้างเทมเพลตแรกเพื่อเริ่มสร้างเอกสารแบบแบตช์
                    </td>
                  </tr>
                ) : (
                  templates.map((template, idx) => (
                    <tr
                      key={template.id}
                      className="border-t border-[hsl(var(--glass-border))] hover:bg-[hsl(var(--primary))]/5 transition-colors duration-150 group"
                      style={{ animationDelay: `${idx * 30}ms` }}
                    >
                      <td>
                        <div className="font-semibold text-[hsl(var(--card-foreground))] group-hover:text-blue-600 transition-colors">{template.name}</div>
                        {template.description ? (
                          <div className="mt-1 max-w-[380px] text-xs text-[hsl(var(--on-surface-variant))] line-clamp-1">{template.description}</div>
                        ) : null}
                      </td>
                      <td>
                        <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold bg-[hsl(var(--card))] text-[hsl(var(--on-surface-variant))] border border-[hsl(var(--glass-border))]">
                          {TEMPLATE_TYPE_LABELS[template.type] ?? template.type.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${TEMPLATE_STATUS_STYLES[template.status] ?? ''}`}
                        >
                          {TEMPLATE_STATUS_LABELS[template.status] ?? '—'}
                        </span>
                      </td>
                      <td>
                        {template.activeVersion ? (
                          <div className="space-y-1">
                            <div className="font-medium text-[hsl(var(--card-foreground))]">v{template.activeVersion.version}</div>
                            <div className="text-xs text-[hsl(var(--on-surface-variant))]">{template.activeVersion.status}</div>
                          </div>
                        ) : (
                          <span className="text-sm text-[hsl(var(--on-surface-variant))]">ไม่มีเวอร์ชันที่ใช้งาน</span>
                        )}
                      </td>
                      <td className="text-[hsl(var(--on-surface-variant))]"><ClientOnly fallback="-">{new Date(template.updatedAt).toLocaleString('th-TH')}</ClientOnly></td>
                      <td>
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/admin/templates/${template.id}`}
                            className="inline-flex items-center gap-1 rounded-lg border border-[hsl(var(--glass-border))] bg-[hsl(var(--card))] px-3 py-1.5 text-xs font-medium text-[hsl(var(--card-foreground))] shadow-sm transition-all duration-200 hover:bg-[hsl(var(--primary)/0.1)] hover:border-[hsl(var(--primary)/0.3)] active:scale-[0.98]"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            รายละเอียด
                          </Link>
                          <Link
                            href={`/admin/templates/${template.id}/edit`}
                            className="inline-flex items-center gap-1 rounded-lg border border-[hsl(var(--primary)/0.2)] bg-[hsl(var(--primary)/0.1)] px-3 py-1.5 text-xs font-medium text-[hsl(var(--primary))] shadow-sm transition-all duration-200 hover:bg-[hsl(var(--primary)/0.2)] hover:border-[hsl(var(--primary)/0.4)] hover:shadow-[var(--glow-primary)] active:scale-[0.98]"
                          >
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
          ) : (
            /* ── Grid Card View ── */
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-4">
              {isLoading ? (
                <div className="col-span-full py-12 text-center text-sm text-[hsl(var(--on-surface-variant))]">กำลังโหลดเทมเพลต...</div>
              ) : templates.length === 0 ? (
                <div className="col-span-full py-12 text-center text-sm text-[hsl(var(--on-surface-variant))]">ยังไม่มีเทมเพลต</div>
              ) : (
                templates.map((template) => (
                  <Link
                    key={template.id}
                    href={`/admin/templates/${template.id}/edit`}
                    className="group flex flex-col rounded-xl border border-[hsl(var(--glass-border))] bg-[hsl(var(--card))] overflow-hidden hover:border-[hsl(var(--primary)/0.3)] hover:shadow-[var(--glow-primary)] transition-all duration-300 active:scale-[0.98]"
                  >
                    {/* Paper thumbnail */}
                    <div className="relative h-36 bg-gradient-to-br from-[hsl(var(--primary))]/10 to-[hsl(var(--primary))]/5 overflow-hidden">
                      <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-violet-500/5" />
                      <div className="absolute inset-0 flex items-center justify-center">
                        {/* Mini paper mockup */}
                        <div className="relative w-20 bg-[hsl(var(--card))] rounded-sm shadow-lg border border-[hsl(var(--glass-border))] overflow-hidden">
                          <div className="h-2 bg-gradient-to-r from-blue-500/60 to-blue-400/30" />
                          <div className="p-1.5 space-y-1">
                            <div className="h-1.5 bg-[hsl(var(--on-surface-variant))]/20 rounded w-3/4" />
                            <div className="h-1.5 bg-[hsl(var(--on-surface-variant))]/20 rounded w-1/2" />
                            <div className="h-1.5 bg-[hsl(var(--on-surface-variant))]/20 rounded w-5/6" />
                            <div className="mt-2 h-1 bg-[hsl(var(--on-surface-variant))]/10 rounded" />
                            <div className="h-1 bg-[hsl(var(--on-surface-variant))]/10 rounded w-2/3" />
                          </div>
                        </div>
                      </div>
                      {/* Type badge */}
                      <div className="absolute top-2 left-2">
                        <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold bg-[hsl(var(--card)/0.8)] text-[hsl(var(--primary))] border border-[hsl(var(--primary)/0.3)] shadow-md backdrop-blur">
                          {TEMPLATE_TYPE_LABELS[template.type] ?? template.type.replace(/_/g, ' ')}
                        </span>
                      </div>
                      {/* Status dot */}
                      <div className="absolute top-2 right-2">
                        <span className={`inline-flex h-2 w-2 rounded-full ${template.status === 'ACTIVE' ? 'bg-emerald-400 shadow-[0_0_6px_rgba(34,197,94,0.6)]' : template.status === 'DRAFT' ? 'bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.6)]' : 'bg-[hsl(var(--on-surface-variant))]/30'}`} />
                      </div>
                    </div>
                    {/* Info */}
                    <div className="p-3 flex-1 bg-[hsl(var(--card))]">
                      <div className="font-semibold text-[hsl(var(--card-foreground))] text-sm leading-tight group-hover:text-blue-600 transition-colors line-clamp-1">
                        {template.name || 'ไม่มีชื่อ'}
                      </div>
                      {template.description ? (
                        <div className="mt-1 text-xs text-[hsl(var(--on-surface-variant))] line-clamp-2 leading-relaxed">
                          {template.description}
                        </div>
                      ) : null}
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-[10px] text-[hsl(var(--on-surface-variant))]">
                          {template.activeVersion ? `v${template.activeVersion.version}` : 'ร่าง'}
                        </span>
                        <span className="text-[10px] text-[hsl(var(--on-surface-variant))]">
                          <ClientOnly fallback="">{new Date(template.updatedAt).toLocaleString('th-TH', { month: 'short', day: 'numeric' })}</ClientOnly>
                        </span>
                      </div>
                    </div>
                  </Link>
                ))
              )}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
