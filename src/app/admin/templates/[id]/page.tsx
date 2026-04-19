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
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-primary-container to-primary px-6 py-5 shadow-lg">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(255,255,255,0.15),_transparent_60%)]" />
        <div className="relative flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link href="/admin/templates" className="inline-flex items-center gap-2 rounded-lg border border-white/30 bg-white/20 px-4 py-2 text-sm font-medium text-on-primary shadow-sm transition-colors hover:bg-white/30">
              <ArrowLeft className="h-4 w-4" />
              กลับ
            </Link>
            <div>
              <h1 className="text-base font-semibold text-on-primary">รายละเอียดเทมเพลต</h1>
              <p className="text-xs text-on-primary/80 mt-0.5">
                ตรวจสอบเวอร์ชัน การผูกฟิลด์ ตัวอย่างการแสดงผล และความพร้อมในการสร้างเอกสาร
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link href={`/admin/templates/${params.id}/edit`} className="inline-flex items-center gap-2 rounded-lg border border-white/30 bg-white/20 px-4 py-2 text-sm font-medium text-on-primary shadow-sm transition-colors hover:bg-white/30">
              เปิดพื้นที่แก้ไข
            </Link>
          </div>
        </div>
      </div>

      {error ? <div className="auth-alert auth-alert-error">{error}</div> : null}

      {loading ? (
        <div className="py-16 text-center text-on-surface-variant">กำลังโหลดเทมเพลต...</div>
      ) : !template ? null : (
        <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
          <div className="space-y-6">
            <section className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 overflow-hidden">
              <div className="px-5 py-4 border-b border-outline-variant">
                <div className="flex items-center gap-2 text-sm font-semibold text-on-surface">
                  <Layers3 className="h-4 w-4 text-primary" />
                  ข้อมูลเทมเพลต
                </div>
              </div>
              <div className="space-y-4 p-5 text-sm text-on-surface-variant">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-outline-variant">ประเภท</div>
                  <div className="mt-1 font-medium text-on-surface">{template.type.replace(/_/g, ' ')}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-outline-variant">สถานะ</div>
                  <div className="mt-1">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-container px-2.5 py-0.5 text-xs font-semibold text-on-surface">{template.status}</span>
                  </div>
                </div>
                {template.subject ? (
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-outline-variant">หัวข้อ</div>
                    <div className="mt-1 text-on-surface">{template.subject}</div>
                  </div>
                ) : null}
                {template.description ? (
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-outline-variant">รายละเอียด</div>
                    <div className="mt-1 text-on-surface">{template.description}</div>
                  </div>
                ) : null}
              </div>
            </section>

            <section className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 overflow-hidden">
              <div className="px-5 py-4 border-b border-outline-variant flex items-center justify-between">
                <div className="text-sm font-semibold text-on-surface">เวอร์ชัน</div>
                <div className="flex items-center gap-2">
                  {(template.versions?.length ?? 0) >= 2 ? (
                    <Link
                      href={`/admin/templates/${params.id}/diff`}
                      className="inline-flex items-center gap-1.5 rounded-full bg-primary-container px-2.5 py-0.5 text-xs font-semibold text-on-primary-container hover:bg-primary-container/80"
                    >
                      เปรียบเทียบ
                    </Link>
                  ) : null}
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-container px-2.5 py-0.5 text-xs font-semibold text-on-surface">{template.versions?.length ?? 0}</span>
                </div>
              </div>
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-outline-variant bg-surface-container-lowest">
                      <th className="px-4 py-3 text-left font-medium text-on-surface">เวอร์ชัน</th>
                      <th className="px-4 py-3 text-left font-medium text-on-surface">สถานะ</th>
                      <th className="px-4 py-3 text-left font-medium text-on-surface">ไฟล์</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(template.versions ?? []).map((version) => (
                      <tr key={version.id} className="border-b border-outline-variant/50">
                        <td className="px-4 py-3 font-semibold text-on-surface">v{version.version}</td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-container px-2.5 py-0.5 text-xs font-semibold text-on-surface">{version.status}</span>
                        </td>
                        <td className="px-4 py-3 text-on-surface-variant">{version.fileType.toUpperCase()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          <div className="space-y-6">
            <section className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 overflow-hidden">
              <div className="px-5 py-4 border-b border-outline-variant">
                <div className="flex items-center gap-2 text-sm font-semibold text-on-surface">
                  <FileCode2 className="h-4 w-4 text-primary" />
                  รายการฟิลด์
                </div>
              </div>
              <div className="grid gap-4 p-5 md:grid-cols-2">
                {groupedFields.map(([group, fields]) => (
                  <div key={group} className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
                    <div className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-outline-variant">{group}</div>
                    <div className="space-y-3">
                      {fields.map((field) => (
                        <div key={field.key} className="rounded-xl bg-surface-container-lowest border border-outline-variant/30 px-3 py-3 shadow-sm">
                          <div className="flex items-center gap-2">
                            <div className="font-medium text-on-surface">{field.label}</div>
                            {field.isRequired ? <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700">จำเป็น</span> : null}
                            {field.isCollection ? <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">คอลเลกชัน</span> : null}
                          </div>
                          <div className="mt-1 font-mono text-xs text-primary">{field.key}</div>
                          {field.description ? <div className="mt-1 text-xs text-on-surface-variant">{field.description}</div> : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 overflow-hidden">
              <div className="px-5 py-4 border-b border-outline-variant flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-semibold text-on-surface">
                  <Eye className="h-4 w-4 text-primary" />
                  ตัวอย่างการแสดงผล
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-container px-2.5 py-0.5 text-xs font-semibold text-on-surface">{previewLoading ? 'กำลังสร้าง...' : 'พร้อม'}</span>
              </div>
              {preview?.missingFields?.length ? (
                <div className="px-5 pt-4 text-sm text-amber-700">
                  ฟิลด์ที่ขาด: {preview.missingFields.map((field) => field.key).join(', ')}
                </div>
              ) : null}
              <div className="p-5">
                <div className="overflow-hidden rounded-2xl border border-outline-variant bg-white">
                  {previewLoading ? (
                    <div className="px-6 py-16 text-center text-sm text-on-surface-variant">กำลังสร้างตัวอย่าง...</div>
                  ) : preview ? (
                    <iframe
                      title="Template preview"
                      className="min-h-[540px] w-full bg-white"
                      srcDoc={preview.html}
                    />
                  ) : (
                    <div className="px-6 py-16 text-center text-sm text-on-surface-variant">ไม่สามารถแสดงตัวอย่างได้</div>
                  )}
                </div>
              </div>
              <div className="border-t border-outline-variant px-5 py-4 text-sm text-on-surface-variant">
                <div className="flex items-center gap-2 font-medium text-on-surface">
                  <Sparkles className="h-4 w-4 text-primary" />
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
