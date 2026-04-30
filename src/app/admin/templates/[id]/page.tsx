'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Eye, FileCode2, Layers3, Sparkles } from 'lucide-react';

type TemplateField = {
  id?: string;
  key: string;
  label: string;
  category: string;
  description: string | null;
  isRequired: boolean;
  isCollection: boolean;
  sampleValue: string | null;
};

type TemplateVersion = {
  id: string;
  version: number;
  label: string | null;
  status: string;
  fileType: string;
  createdAt: string;
  activatedAt: string | null;
};

type TemplateDetail = {
  id: string;
  name: string;
  description: string | null;
  type: string;
  status: string;
  subject: string | null;
  activeVersionId: string | null;
  activeVersion?: TemplateVersion | null;
  versions?: TemplateVersion[];
  fields?: TemplateField[];
};

type TemplatePreview = {
  html: string;
  missingFields: Array<{ key: string; message: string }>;
  context: Record<string, unknown>;
};

export default function TemplateDetailPage() {
  const params = useParams<{ id: string }>();
  const [template, setTemplate] = useState<TemplateDetail | null>(null);
  const [preview, setPreview] = useState<TemplatePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/templates/${params.id}`, { cache: 'no-store' });
        const json = await response.json();
        if (!response.ok || !json.success) {
          throw new Error(json.error?.message ?? 'ไม่สามารถโหลดเทมเพลต');
        }
        setTemplate(json.data as TemplateDetail);
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : 'ไม่สามารถโหลดเทมเพลต');
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [params.id]);

  useEffect(() => {
    async function loadPreview() {
      if (!template) return;
      setPreviewLoading(true);
      try {
        const response = await fetch(`/api/templates/${params.id}/preview`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ useSampleData: true }),
        });
        const json = await response.json();
        if (!response.ok || !json.success) {
          throw new Error(json.error?.message ?? 'ไม่สามารถสร้างตัวอย่าง');
        }
        setPreview(json.data as TemplatePreview);
      } catch (nextError) {
        setPreview(null);
        setError(nextError instanceof Error ? nextError.message : 'ไม่สามารถสร้างตัวอย่าง');
      } finally {
        setPreviewLoading(false);
      }
    }

    void loadPreview();
  }, [params.id, template]);

  const groupedFields = useMemo(() => {
    const groups = new Map<string, TemplateField[]>();
    for (const field of template?.fields ?? []) {
      const key = field.category.toLowerCase();
      const current = groups.get(key) ?? [];
      current.push(field);
      groups.set(key, current);
    }
    return Array.from(groups.entries());
  }, [template]);

  return (
    <main className="space-y-6">
      {/* Hero Header */}
      <div className="relative overflow-hidden rounded-2xl border border-[hsl(var([hsl(var(--color-border))]))] bg-[hsl(var(--card))] shadow-[0_4px_16px_rgba(0,0,0,0.08)] px-6 py-5">
        <div className="absolute inset-0 bg-gradient-to-br from-[hsl(var(--primary)/0.1)] via-transparent to-violet-500/10 pointer-events-none" />
        <div className="absolute top-0 right-0 w-64 h-64 bg-[hsl(var(--primary)/0.05)] rounded-full blur-3xl pointer-events-none" />
        <div className="relative flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link
              href="/admin/templates"
              className="inline-flex items-center gap-2 rounded-xl border border-[hsl(var([hsl(var(--color-border))]))] bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))] hover:bg-[hsl(var(--primary)/0.1)] hover:border-[hsl(var(--primary)/0.3)] px-4 py-2 text-sm font-medium shadow-sm transition-all duration-200 active:scale-[0.98]"
            >
              <ArrowLeft className="h-4 w-4" />
              กลับ
            </Link>
            <div>
              <h1 className="text-base font-semibold text-[hsl(var(--card-foreground))]">รายละเอียดเทมเพลต</h1>
              <p className="text-xs text-[hsl(var(--on-surface-variant))] mt-0.5">
                ตรวจสอบเวอร์ชัน การผูกฟิลด์ ตัวอย่างการแสดงผล และความพร้อมในการสร้างเอกสาร
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href={`/admin/templates/${params.id}/edit`}
              className="inline-flex items-center gap-2 rounded-xl border border-[hsl(var(--primary)/0.3)] bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))] hover:bg-[hsl(var(--primary)/0.2)] hover:border-[hsl(var(--primary)/0.5)] hover:shadow-[0_1px_3px_rgba(0,0,0,0.5)] px-4 py-2 text-sm font-medium shadow-sm transition-all duration-200 active:scale-[0.98]"
            >
              เปิดพื้นที่แก้ไข
            </Link>
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="py-16 text-center text-sm text-[hsl(var(--on-surface-variant))]">กำลังโหลดเทมเพลต...</div>
      ) : !template ? null : (
        <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
          {/* Left Column */}
          <div className="space-y-6">
            {/* Template Info Card */}
            <section className="rounded-2xl border border-[hsl(var([hsl(var(--color-border))]))] bg-[hsl(var(--card))] shadow-[0_4px_16px_rgba(0,0,0,0.08)] overflow-hidden">
              <div className="px-5 py-4 border-b border-[hsl(var([hsl(var(--color-border))]))] bg-[hsl(var(--card))]">
                <div className="flex items-center gap-2 text-sm font-semibold text-[hsl(var(--card-foreground))]">
                  <Layers3 className="h-4 w-4 text-[hsl(var(--primary))]" />
                  ข้อมูลเทมเพลต
                </div>
              </div>
              <div className="space-y-4 p-5 text-sm">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))] mb-1">ประเภท</div>
                  <div className="font-medium text-[hsl(var(--card-foreground))]">{template.type.replace(/_/g, ' ')}</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))] mb-1">สถานะ</div>
                  <div className="mt-1">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-0.5 text-xs font-semibold ${
                      template.status === 'ACTIVE'
                        ? 'bg-emerald-500/15 text-emerald-600 border border-emerald-500/20'
                        : template.status === 'DRAFT'
                          ? 'bg-amber-500/15 text-amber-600 border border-amber-500/20'
                          : 'bg-[hsl(var(--card))] text-[hsl(var(--on-surface-variant))] border border-[hsl(var([hsl(var(--color-border))]))]'
                    }`}>
                      {template.status}
                    </span>
                  </div>
                </div>
                {template.subject ? (
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))] mb-1">หัวข้อ</div>
                    <div className="text-[hsl(var(--card-foreground))]">{template.subject}</div>
                  </div>
                ) : null}
                {template.description ? (
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))] mb-1">รายละเอียด</div>
                    <div className="text-[hsl(var(--on-surface-variant))]">{template.description}</div>
                  </div>
                ) : null}
              </div>
            </section>

            {/* Versions Card */}
            <section className="rounded-2xl border border-[hsl(var([hsl(var(--color-border))]))] bg-[hsl(var(--card))] shadow-[0_4px_16px_rgba(0,0,0,0.08)] overflow-hidden">
              <div className="px-5 py-4 border-b border-[hsl(var([hsl(var(--color-border))]))] flex items-center justify-between bg-[hsl(var(--card))]">
                <div className="text-sm font-semibold text-[hsl(var(--card-foreground))]">เวอร์ชัน</div>
                <div className="flex items-center gap-2">
                  {(template.versions?.length ?? 0) >= 2 ? (
                    <Link
                      href={`/admin/templates/${params.id}/diff`}
                      className="inline-flex items-center gap-1.5 rounded-full bg-[hsl(var(--primary)/0.15)] text-[hsl(var(--primary))] px-2.5 py-0.5 text-xs font-semibold hover:bg-[hsl(var(--primary)/0.25)] transition-colors"
                    >
                      เปรียบเทียบ
                    </Link>
                  ) : null}
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[hsl(var(--card))] text-[hsl(var(--on-surface-variant))] px-2.5 py-0.5 text-xs font-semibold border border-[hsl(var([hsl(var(--color-border))]))]">
                    {template.versions?.length ?? 0}
                  </span>
                </div>
              </div>
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[hsl(var([hsl(var(--color-border))]))] bg-[hsl(var(--card))]">
                      <th className="px-4 py-3 text-left font-medium text-[hsl(var(--on-surface-variant))] text-[10px] uppercase tracking-wider">เวอร์ชัน</th>
                      <th className="px-4 py-3 text-left font-medium text-[hsl(var(--on-surface-variant))] text-[10px] uppercase tracking-wider">สถานะ</th>
                      <th className="px-4 py-3 text-left font-medium text-[hsl(var(--on-surface-variant))] text-[10px] uppercase tracking-wider">ไฟล์</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(template.versions ?? []).map((version) => (
                      <tr key={version.id} className="border-b border-[hsl(var([hsl(var(--color-border))]))] hover:bg-[hsl(var(--primary))]/5 transition-colors">
                        <td className="px-4 py-3 font-semibold text-[hsl(var(--card-foreground))]">v{version.version}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            version.status === 'ACTIVE'
                              ? 'bg-emerald-500/15 text-emerald-600 border border-emerald-500/20'
                              : 'bg-[hsl(var(--card))] text-[hsl(var(--on-surface-variant))] border border-[hsl(var([hsl(var(--color-border))]))]'
                          }`}>
                            {version.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-[hsl(var(--on-surface-variant))]">{version.fileType.toUpperCase()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          {/* Right Column */}
          <div className="space-y-6">
            {/* Fields Card */}
            <section className="rounded-2xl border border-[hsl(var([hsl(var(--color-border))]))] bg-[hsl(var(--card))] shadow-[0_4px_16px_rgba(0,0,0,0.08)] overflow-hidden">
              <div className="px-5 py-4 border-b border-[hsl(var([hsl(var(--color-border))]))] bg-[hsl(var(--card))]">
                <div className="flex items-center gap-2 text-sm font-semibold text-[hsl(var(--card-foreground))]">
                  <FileCode2 className="h-4 w-4 text-[hsl(var(--primary))]" />
                  รายการฟิลด์
                </div>
              </div>
              <div className="grid gap-4 p-5 md:grid-cols-2">
                {groupedFields.map(([group, fields]) => (
                  <div key={group} className="rounded-xl border border-[hsl(var([hsl(var(--color-border))]))] bg-[hsl(var(--card))] p-4">
                    <div className="mb-3 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))]">{group}</div>
                    <div className="space-y-2">
                      {fields.map((field) => (
                        <div key={field.key} className="rounded-lg bg-[hsl(var(--card))] border border-[hsl(var([hsl(var(--color-border))]))] px-3 py-3 shadow-sm">
                          <div className="flex items-center gap-2 flex-wrap">
                            <div className="font-medium text-[hsl(var(--card-foreground))] text-sm">{field.label}</div>
                            {field.isRequired ? (
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-semibold text-red-600 border border-red-500/20">
                                จำเป็น
                              </span>
                            ) : null}
                            {field.isCollection ? (
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-600 border border-amber-500/20">
                                คอลเลกชัน
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-1 font-mono text-[10px] text-blue-600">{field.key}</div>
                          {field.description ? (
                            <div className="mt-1 text-xs text-[hsl(var(--on-surface-variant))] leading-snug">{field.description}</div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Preview Card */}
            <section className="rounded-2xl border border-[hsl(var([hsl(var(--color-border))]))] bg-[hsl(var(--card))] shadow-[0_4px_16px_rgba(0,0,0,0.08)] overflow-hidden">
              <div className="px-5 py-4 border-b border-[hsl(var([hsl(var(--color-border))]))] flex items-center justify-between bg-[hsl(var(--card))]">
                <div className="flex items-center gap-2 text-sm font-semibold text-[hsl(var(--card-foreground))]">
                  <Eye className="h-4 w-4 text-[hsl(var(--primary))]" />
                  ตัวอย่างการแสดงผล
                </div>
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  previewLoading
                    ? 'bg-amber-500/15 text-amber-600 border border-amber-500/20'
                    : 'bg-emerald-500/15 text-emerald-600 border border-emerald-500/20'
                }`}>
                  {previewLoading ? 'กำลังสร้าง...' : 'พร้อม'}
                </span>
              </div>
              {preview?.missingFields?.length ? (
                <div className="px-5 pt-4 text-sm text-amber-600 bg-amber-500/5">
                  ฟิลด์ที่ขาด: {preview.missingFields.map((field) => field.key).join(', ')}
                </div>
              ) : null}
              <div className="p-5">
                <div className="overflow-hidden rounded-xl border border-[hsl(var([hsl(var(--color-border))]))] bg-[hsl(var(--card))] shadow-inner">
                  {previewLoading ? (
                    <div className="px-6 py-16 text-center text-sm text-[hsl(var(--on-surface-variant))]">กำลังสร้างตัวอย่าง...</div>
                  ) : preview ? (
                    <iframe
                      title="Template preview"
                      className="min-h-[540px] w-full bg-white"
                      srcDoc={preview.html}
                    />
                  ) : (
                    <div className="px-6 py-16 text-center text-sm text-[hsl(var(--on-surface-variant))]">ไม่สามารถแสดงตัวอย่างได้</div>
                  )}
                </div>
              </div>
              <div className="border-t border-[hsl(var([hsl(var(--color-border))]))] px-5 py-4 bg-[hsl(var(--card))]">
                <div className="flex items-center gap-2 text-sm text-[hsl(var(--on-surface-variant))]">
                  <Sparkles className="h-4 w-4 text-[hsl(var(--primary))]" />
                  ตัวอย่างนี้สร้างจากข้อมูลจริงของระบบ ERP ไม่ใช่ข้อมูลจำลอง
                </div>
              </div>
            </section>
          </div>
        </div>
      )}
    </main>
  );
}
