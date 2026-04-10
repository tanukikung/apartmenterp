'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Copy,
  FilePlus2,
  Layers3,
  RefreshCw,
  Save,
  UploadCloud,
} from 'lucide-react';
import { TemplateWordEditor } from '@/components/document-editor/TemplateWordEditor';
import { createRepeatBlockMarkup, createScalarFieldMarkup } from '@/modules/documents/field-catalog';
import { ClientOnly } from '@/components/ui/ClientOnly';
import { ErrorBoundary } from '@/components/error/ErrorBoundary';

type TemplateField = {
  key: string;
  label: string;
  category: string;
  description: string | null;
  isCollection: boolean;
  isRequired: boolean;
};

type TemplateVersion = {
  id: string;
  version: number;
  label: string | null;
  status: string;
  fileType: string;
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
  versions?: TemplateVersion[];
  fields?: TemplateField[];
};

const TEMPLATE_TYPES = [
  'INVOICE',
  'PAYMENT_NOTICE',
  'RECEIPT',
  'CONTRACT',
  'GENERAL_NOTICE',
  'NOTICE',
  'OTHER',
] as const;

export default function TemplateEditPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const isNew = params.id === 'new';

  const [template, setTemplate] = useState<TemplateDetail | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [contentLoading, setContentLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [working, setWorking] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [versionContent, setVersionContent] = useState<string>('<p></p>');
  const [versionSubject, setVersionSubject] = useState<string>('');
  const [form, setForm] = useState({
    name: '',
    description: '',
    type: 'INVOICE',
    subject: '',
    body: '<p></p>',
  });

  async function loadTemplate(id: string) {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/templates/${id}`, { cache: 'no-store' });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error?.message ?? 'ไม่สามารถโหลดเทมเพลต');
      }
      const nextTemplate = json.data as TemplateDetail;
      setTemplate(nextTemplate);
      setForm({
        name: nextTemplate.name,
        description: nextTemplate.description ?? '',
        type: nextTemplate.type,
        subject: nextTemplate.subject ?? '',
        body: '<p></p>',
      });
      const draftVersion = nextTemplate.versions?.find((version) => version.status === 'DRAFT');
      setSelectedVersionId(draftVersion?.id ?? nextTemplate.activeVersionId ?? nextTemplate.versions?.[0]?.id ?? null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'ไม่สามารถโหลดเทมเพลต');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isNew) return;
    void loadTemplate(params.id);
  }, [isNew, params.id]);

  // Load version content when selected version changes
  useEffect(() => {
    if (!selectedVersionId || isNew) return;
    const tid = params.id;
    const vid = selectedVersionId;
    let cancelled = false;
    setContentLoading(true);
    void (async () => {
      try {
        const res = await fetch(`/api/templates/${tid}/versions/${vid}/content`, { cache: 'no-store' });
        const json = await res.json();
        if (cancelled || !json.success) return;
        setVersionContent(json.data.body ?? '<p></p>');
        setVersionSubject(json.data.subject ?? '');
      } catch {
        // silently fail — content will stay as-is
      } finally {
        if (!cancelled) setContentLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isNew, params.id, selectedVersionId]);

  // Debounced auto-save for version content
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function scheduleContentSave(html: string) {
    if (!selectedVersionId || isNew) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        await fetch(`/api/templates/${params.id}/versions/${selectedVersionId}/content`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body: html }),
        });
      } catch {
        // silent — next change will retry
      }
    }, 1500);
  }

  const groupedFields = useMemo(() => {
    const groups = new Map<string, TemplateField[]>();
    for (const field of template?.fields ?? []) {
      const key = field.category.toLowerCase();
      groups.set(key, [...(groups.get(key) ?? []), field]);
    }
    return Array.from(groups.entries());
  }, [template]);

  async function saveMetadata() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      if (isNew) {
        const response = await fetch('/api/templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        });
        const json = await response.json();
        if (!response.ok || !json.success) {
          throw new Error(json.error?.message ?? 'ไม่สามารถสร้างเทมเพลต');
        }
        const created = json.data as TemplateDetail;
        setMessage('สร้างเทมเพลตแล้ว กำลังเปิดตัวแก้ไข...');
        router.replace(`/admin/templates/${created.id}/edit`);
        return;
      }

      const response = await fetch(`/api/templates/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          description: form.description || null,
          type: form.type,
          subject: form.subject || null,
        }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error?.message ?? 'ไม่สามารถบันทึกเทมเพลต');
      }
      setMessage('บันทึกการตั้งค่าเทมเพลตแล้ว');
      await loadTemplate(params.id);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'ไม่สามารถบันทึกเทมเพลต');
    } finally {
      setSaving(false);
    }
  }

  async function createDraft() {
    setWorking('draft');
    setError(null);
    try {
      const response = await fetch(`/api/templates/${params.id}/versions`, {
        method: 'POST',
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error?.message ?? 'ไม่สามารถสร้างฉบับร่าง');
      }
      await loadTemplate(params.id);
      setMessage('สร้างฉบับร่างแล้ว');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'ไม่สามารถสร้างฉบับร่าง');
    } finally {
      setWorking(null);
    }
  }

  async function activateVersion(versionId: string) {
    setWorking(versionId);
    setError(null);
    try {
      // First validate the version
      const validateResponse = await fetch(
        `/api/templates/${params.id}/versions/${versionId}/validate`,
        { method: 'POST' },
      );
      const validateJson = await validateResponse.json();
      if (!validateJson.success || !validateJson.data.valid) {
        const errors = validateJson.data.errors ?? ['Validation failed'];
        throw new Error(`ไม่สามารถเผยแพร่เวอร์ชัน: ${errors.join('; ')}`);
      }

      const response = await fetch(`/api/templates/${params.id}/activate-version`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ versionId }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error?.message ?? 'ไม่สามารถเปิดใช้งานเวอร์ชัน');
      }
      await loadTemplate(params.id);
      setMessage('เปิดใช้งานเวอร์ชันแล้ว พร้อมสำหรับการสร้างเอกสาร');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'ไม่สามารถเปิดใช้งานเวอร์ชัน');
    } finally {
      setWorking(null);
    }
  }

  async function uploadVersion(file: File) {
    setWorking('upload');
    setError(null);
    try {
      const payload = new FormData();
      payload.append('file', file);
      const response = await fetch(`/api/templates/${params.id}/upload`, {
        method: 'POST',
        body: payload,
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error?.message ?? 'ไม่สามารถอัปโหลดเวอร์ชัน');
      }
      await loadTemplate(params.id);
      setMessage('อัปโหลดเวอร์ชันเทมเพลตแล้ว');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'ไม่สามารถอัปโหลดเวอร์ชัน');
    } finally {
      setWorking(null);
    }
  }

  async function copyFieldMarkup(field: TemplateField) {
    const markup = field.isCollection ? createRepeatBlockMarkup(field.key) : createScalarFieldMarkup(field.key, field.label);
    await navigator.clipboard.writeText(markup);
    setMessage(`Copied ${field.label} markup.`);
  }

  return (
    <main className="space-y-6">
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-[var(--primary-container)] to-[var(--primary)] px-6 py-5 shadow-lg">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(255,255,255,0.15),_transparent_60%)]" />
        <div className="relative flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link href={isNew ? '/admin/templates' : `/admin/templates/${params.id}`} className="inline-flex items-center gap-2 rounded-lg border border-white/30 bg-white/20 px-4 py-2 text-sm font-medium text-[var(--on-primary)] shadow-sm transition-colors hover:bg-white/30">
              <ArrowLeft className="h-4 w-4" />
              กลับ
            </Link>
            <div>
              <h1 className="text-base font-semibold text-[var(--on-primary)]">{isNew ? 'สร้างเทมเพลต' : 'พื้นที่แก้ไขเทมเพลต'}</h1>
              <p className="text-xs text-[var(--on-primary)]/80 mt-0.5">
                จัดการข้อมูลเมตา เวอร์ชัน ฟิลด์ที่กำหนดโครงสร้าง และแก้ไขเนื้อหาด้วย TipTap
              </p>
            </div>
          </div>
        </div>
      </div>

      {message ? <div className="auth-alert auth-alert-success">{message}</div> : null}
      {error ? <div className="auth-alert auth-alert-error">{error}</div> : null}

      {loading ? (
        <div className="py-16 text-center text-[var(--on-surface-variant)]">กำลังโหลดพื้นที่เทมเพลต...</div>
      ) : (
        <div className="space-y-6">
          <section className="bg-[var(--surface-container-lowest)] rounded-xl border border-[var(--outline-variant)]/10 overflow-hidden">
            <div className="px-5 py-4 border-b border-[var(--outline-variant)]">
              <div className="text-sm font-semibold text-[var(--on-surface)]">ตั้งค่าเทมเพลต</div>
            </div>
            <div className="grid gap-4 p-5 lg:grid-cols-4">
              <div className="lg:col-span-2">
                <label className="mb-1.5 block text-sm font-medium text-[var(--on-surface)]">ชื่อเทมเพลต</label>
                <input
                  className="w-full rounded-lg border border-[var(--outline)] bg-[var(--surface-container-lowest)] px-3 py-2 text-sm text-[var(--on-surface)]"
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="ใบแจ้งหนี้รายเดือน"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-[var(--on-surface)]">ประเภท</label>
                <select
                  className="w-full rounded-lg border border-[var(--outline)] bg-[var(--surface-container-lowest)] px-3 py-2 text-sm text-[var(--on-surface)]"
                  value={form.type}
                  onChange={(event) => setForm((current) => ({ ...current, type: event.target.value }))}
                >
                  {TEMPLATE_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-[var(--on-surface)]">หัวข้อ</label>
                <input
                  className="w-full rounded-lg border border-[var(--outline)] bg-[var(--surface-container-lowest)] px-3 py-2 text-sm text-[var(--on-surface)]"
                  value={form.subject}
                  onChange={(event) => setForm((current) => ({ ...current, subject: event.target.value }))}
                  placeholder="ใบแจ้งหนี้สำหรับห้อง {{room.number}}"
                />
              </div>
              <div className="lg:col-span-4">
                <label className="mb-1.5 block text-sm font-medium text-[var(--on-surface)]">รายละเอียด</label>
                <textarea
                  className="w-full rounded-lg border border-[var(--outline)] bg-[var(--surface-container-lowest)] px-3 py-2 text-sm text-[var(--on-surface)] min-h-[96px]"
                  value={form.description}
                  onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                  placeholder="รายละเอียดว่าเทมเพลตนี้ใช้สำหรับอะไรและเมื่อใดควรสร้าง"
                />
              </div>
            </div>
            <div className="border-t border-[var(--outline-variant)] px-5 py-4">
              <button
                type="button"
                onClick={() => void saveMetadata()}
                className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-indigo-500 to-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:from-indigo-600 hover:to-indigo-700"
                disabled={saving}
              >
                <Save className="h-4 w-4" />
                {saving ? 'กำลังบันทึก...' : isNew ? 'สร้างเทมเพลต' : 'บันทึกการตั้งค่า'}
              </button>
            </div>
          </section>

          {!isNew ? (
            <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
              <div className="space-y-6">
                <section className="bg-[var(--surface-container-lowest)] rounded-xl border border-[var(--outline-variant)]/10 overflow-hidden">
                  <div className="px-5 py-4 border-b border-[var(--outline-variant)]">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-2 text-sm font-semibold text-[var(--on-surface)]">
                        <Layers3 className="h-4 w-4 text-[var(--primary)]" />
                        เวอร์ชัน
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void createDraft()}
                          className="inline-flex items-center gap-2 rounded-lg border border-[var(--outline)] bg-[var(--surface-container-lowest)] px-3 py-1.5 text-xs font-medium text-[var(--on-surface)] shadow-sm transition-colors hover:bg-[var(--surface-container)]"
                          disabled={working === 'draft'}
                        >
                          <FilePlus2 className="h-3.5 w-3.5" />
                          {working === 'draft' ? 'กำลังสร้าง...' : 'ร่างใหม่'}
                        </button>
                        <button
                          type="button"
                          onClick={() => fileRef.current?.click()}
                          className="inline-flex items-center gap-2 rounded-lg border border-[var(--outline)] bg-[var(--surface-container-lowest)] px-3 py-1.5 text-xs font-medium text-[var(--on-surface)] shadow-sm transition-colors hover:bg-[var(--surface-container)]"
                          disabled={working === 'upload'}
                          title="Upload a .docx file (DOCX support has been removed)"
                        >
                          <UploadCloud className="h-3.5 w-3.5" />
                          อัปโหลด DOCX
                        </button>
                        <input
                          ref={fileRef}
                          type="file"
                          accept=".docx"
                          className="hidden"
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) {
                              void uploadVersion(file);
                            }
                          }}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="space-y-3 p-4">
                    {(template?.versions ?? []).map((version) => (
                      <div
                        key={version.id}
                        className={`rounded-2xl border px-4 py-4 ${
                          selectedVersionId === version.id
                            ? 'border-primary bg-[var(--primary-container)]/50'
                            : 'border-[var(--outline-variant)] bg-[var(--surface-container-lowest)]'
                        }`}
                      >
                        <button
                          type="button"
                          className="w-full text-left"
                          onClick={() => setSelectedVersionId(version.id)}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="font-semibold text-[var(--on-surface)]">v{version.version}</div>
                              <div className="text-xs text-[var(--on-surface-variant)]">{version.fileType.toUpperCase()} · {version.status}</div>
                            </div>
                            {template?.activeVersionId === version.id ? (
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">ใช้งาน</span>
                            ) : null}
                          </div>
                        </button>
                        <div className="mt-3 flex gap-2">
                          {template?.activeVersionId !== version.id ? (
                            <button
                              type="button"
                              onClick={() => void activateVersion(version.id)}
                              className="inline-flex items-center gap-2 rounded-lg border border-[var(--outline)] bg-[var(--surface-container-lowest)] px-3 py-1.5 text-xs font-medium text-[var(--on-surface)] shadow-sm transition-colors hover:bg-[var(--surface-container)] flex-1"
                              disabled={working === version.id}
                            >
                              {working === version.id ? 'กำลังเปิดใช้งาน...' : 'เปิดใช้งาน'}
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => void loadTemplate(params.id)}
                            className="inline-flex items-center gap-2 rounded-lg border border-[var(--outline)] bg-[var(--surface-container-lowest)] px-3 py-1.5 text-xs font-medium text-[var(--on-surface)] shadow-sm transition-colors hover:bg-[var(--surface-container)]"
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="bg-[var(--surface-container-lowest)] rounded-xl border border-[var(--outline-variant)]/10 overflow-hidden">
                  <div className="px-5 py-4 border-b border-[var(--outline-variant)]">
                    <div className="text-sm font-semibold text-[var(--on-surface)]">เบราว์เซอร์ฟิลด์</div>
                  </div>
                  <div className="space-y-4 p-4">
                    {groupedFields.map(([group, fields]) => (
                      <div key={group}>
                        <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-outline-variant">{group}</div>
                        <div className="space-y-2">
                          {fields.map((field) => (
                            <div key={field.key} className="rounded-xl border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] px-3 py-3">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <div className="font-medium text-[var(--on-surface)]">{field.label}</div>
                                  <div className="mt-1 font-mono text-[11px] text-[var(--primary)]">{field.key}</div>
                                  {field.description ? (
                                    <div className="mt-1 text-xs text-[var(--on-surface-variant)]">{field.description}</div>
                                  ) : null}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => void copyFieldMarkup(field)}
                                  className="inline-flex items-center gap-1 rounded-lg border border-[var(--outline)] bg-[var(--surface-container-lowest)] px-2.5 py-1.5 text-xs font-medium text-[var(--on-surface)] shadow-sm transition-colors hover:bg-[var(--surface-container)]"
                                >
                                  <Copy className="h-3.5 w-3.5" />
                                  คัดลอก
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </div>

              <section className="bg-[var(--surface-container-lowest)] rounded-xl border border-[var(--outline-variant)]/10 overflow-hidden">
                <div className="px-5 py-4 border-b border-[var(--outline-variant)] flex items-center justify-between">
                  <div className="text-sm font-semibold text-[var(--on-surface)]">ตัวแก้ไขเทมเพลต</div>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-container)] px-2.5 py-0.5 text-xs font-semibold text-[var(--on-surface)]">
                    {selectedVersionId ? `เวอร์ชัน ${template?.versions?.find((version) => version.id === selectedVersionId)?.version ?? '-'}` : 'ยังไม่เลือกเวอร์ชัน'}
                  </span>
                </div>
                <div className="p-5">
                  {contentLoading ? (
                    <div className="rounded-2xl border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] px-6 py-20 text-center text-sm text-[var(--on-surface-variant)]">
                      กำลังโหลด...
                    </div>
                  ) : selectedVersionId ? (
                    <ClientOnly
                      fallback={
                        <div className="rounded-2xl border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] px-6 py-20 text-center text-sm text-[var(--on-surface-variant)]">
                          กำลังเริ่มตัวแก้ไข...
                        </div>
                      }
                    >
                      <ErrorBoundary
                        fallback={
                          <div className="rounded-2xl border border-red-200 bg-red-50 px-6 py-12 text-center">
                            <p className="text-sm font-medium text-red-700 mb-1">ไม่สามารถโหลดตัวแก้ไขเทมเพลต</p>
                            <p className="text-xs text-red-500">อาจเกิดจากตารางในเอกสารเดิมไม่สมบูรณ์ ลองลบตารางในเทมเพลตแล้วสร้างใหม่</p>
                          </div>
                        }
                      >
                        <TemplateWordEditor
                          value={versionContent}
                          subject={versionSubject}
                          previewValues={Object.fromEntries((template?.fields ?? []).map((f) => [f.key, f.label]))}
                          variables={(template?.fields ?? []).map((f) => f.key)}
                          quickBlocks={[]}
                          templateId={isNew ? undefined : params.id}
                          onChange={(html) => {
                            setVersionContent(html);
                            scheduleContentSave(html);
                          }}
                          onUploadImage={async (file: File) => {
                            const fd = new FormData();
                            fd.append('file', file);
                            const res = await fetch(`/api/templates/${params.id}/upload-image`, { method: 'POST', body: fd });
                            const json = await res.json();
                            if (!json.success) throw new Error(json.error?.message ?? 'Upload failed');
                            return { url: json.data.url, name: file.name };
                          }}
                        />
                      </ErrorBoundary>
                    </ClientOnly>
                  ) : (
                    <div className="rounded-2xl border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] px-6 py-20 text-center text-sm text-[var(--on-surface-variant)]">
                      เลือกหรือสร้างเวอร์ชันเพื่อเริ่มแก้ไข
                    </div>
                  )}
                </div>
              </section>
            </div>
          ) : null}
        </div>
      )}
    </main>
  );
}
