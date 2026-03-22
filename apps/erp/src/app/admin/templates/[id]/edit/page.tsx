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
import { OnlyOfficeFrame } from '@/components/onlyoffice/OnlyOfficeFrame';
import { createRepeatBlockMarkup, createScalarFieldMarkup } from '@/modules/documents/field-catalog';

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
  const [saving, setSaving] = useState(false);
  const [working, setWorking] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [onlyofficeStatus, setOnlyofficeStatus] = useState<{
    enabled: boolean;
    configured: boolean;
    connected: boolean;
    error?: string;
  } | null>(null);
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
        throw new Error(json.error?.message ?? 'Unable to load template');
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
      setError(nextError instanceof Error ? nextError.message : 'Unable to load template');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isNew) return;
    void loadTemplate(params.id);
  }, [isNew, params.id]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/health/onlyoffice', { cache: 'no-store' });
        const json = await res.json();
        if (json?.success && json?.data) {
          setOnlyofficeStatus({
            enabled: json.data.enabled,
            configured: json.data.configured,
            connected: json.data.connected,
            error: json.data.error,
          });
        }
      } catch {
        // Silently fail — OnlyOfficeFrame handles its own error display
      }
    })();
  }, []);

  const groupedFields = useMemo(() => {
    const groups = new Map<string, TemplateField[]>();
    for (const field of template?.fields ?? []) {
      const key = field.category.toLowerCase();
      groups.set(key, [...(groups.get(key) ?? []), field]);
    }
    return Array.from(groups.entries());
  }, [template]);

  const editorConfigUrl = !isNew && selectedVersionId
    ? `/api/templates/${params.id}/editor-config?versionId=${selectedVersionId}`
    : null;

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
          throw new Error(json.error?.message ?? 'Unable to create template');
        }
        const created = json.data as TemplateDetail;
        setMessage('Template created. Opening editor...');
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
        throw new Error(json.error?.message ?? 'Unable to save template');
      }
      setMessage('Template settings saved.');
      await loadTemplate(params.id);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to save template');
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
        throw new Error(json.error?.message ?? 'Unable to create draft version');
      }
      await loadTemplate(params.id);
      setMessage('Draft version created.');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to create draft version');
    } finally {
      setWorking(null);
    }
  }

  async function activateVersion(versionId: string) {
    setWorking(versionId);
    setError(null);
    try {
      const response = await fetch(`/api/templates/${params.id}/activate-version`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ versionId }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error?.message ?? 'Unable to activate version');
      }
      await loadTemplate(params.id);
      setMessage('Version activated.');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to activate version');
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
        throw new Error(json.error?.message ?? 'Unable to upload version');
      }
      await loadTemplate(params.id);
      setMessage('Template version uploaded.');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to upload version');
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
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-primary-container to-primary px-6 py-5 shadow-lg">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(255,255,255,0.15),_transparent_60%)]" />
        <div className="relative flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link href={isNew ? '/admin/templates' : `/admin/templates/${params.id}`} className="inline-flex items-center gap-2 rounded-lg border border-white/30 bg-white/20 px-4 py-2 text-sm font-medium text-on-primary shadow-sm transition-colors hover:bg-white/30">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Link>
            <div>
              <h1 className="text-base font-semibold text-on-primary">{isNew ? 'Create Template' : 'Template Editor Workspace'}</h1>
              <p className="text-xs text-on-primary/80 mt-0.5">
                Manage metadata, versions, structured fields, and edit the document in ONLYOFFICE.
              </p>
            </div>
            {!isNew && onlyofficeStatus ? (
              <div className="ml-auto flex items-center gap-2">
                {onlyofficeStatus.enabled ? (
                  onlyofficeStatus.configured ? (
                    onlyofficeStatus.connected ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-medium text-emerald-200 border border-emerald-400/30">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                        ONLYOFFICE Connected
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/20 px-3 py-1 text-xs font-medium text-amber-200 border border-amber-400/30">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                        ONLYOFFICE Unreachable
                      </span>
                    )
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-500/20 px-3 py-1 text-xs font-medium text-slate-300 border border-slate-400/30">
                      <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                      ONLYOFFICE Not Configured
                    </span>
                  )
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-500/20 px-3 py-1 text-xs font-medium text-slate-300 border border-slate-400/30">
                    <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                    ONLYOFFICE Disabled
                  </span>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {message ? <div className="auth-alert auth-alert-success">{message}</div> : null}
      {error ? <div className="auth-alert auth-alert-error">{error}</div> : null}

      {loading ? (
        <div className="py-16 text-center text-on-surface-variant">Loading template workspace...</div>
      ) : (
        <div className="space-y-6">
          <section className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 overflow-hidden">
            <div className="px-5 py-4 border-b border-outline-variant">
              <div className="text-sm font-semibold text-on-surface">Template Settings</div>
            </div>
            <div className="grid gap-4 p-5 lg:grid-cols-4">
              <div className="lg:col-span-2">
                <label className="mb-1.5 block text-sm font-medium text-on-surface">Name</label>
                <input
                  className="w-full rounded-lg border border-outline bg-surface-container-lowest px-3 py-2 text-sm text-on-surface"
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Monthly Invoice"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-on-surface">Type</label>
                <select
                  className="w-full rounded-lg border border-outline bg-surface-container-lowest px-3 py-2 text-sm text-on-surface"
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
                <label className="mb-1.5 block text-sm font-medium text-on-surface">Subject</label>
                <input
                  className="w-full rounded-lg border border-outline bg-surface-container-lowest px-3 py-2 text-sm text-on-surface"
                  value={form.subject}
                  onChange={(event) => setForm((current) => ({ ...current, subject: event.target.value }))}
                  placeholder="Invoice for Room {{room.number}}"
                />
              </div>
              <div className="lg:col-span-4">
                <label className="mb-1.5 block text-sm font-medium text-on-surface">Description</label>
                <textarea
                  className="w-full rounded-lg border border-outline bg-surface-container-lowest px-3 py-2 text-sm text-on-surface min-h-[96px]"
                  value={form.description}
                  onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                  placeholder="What this template is used for and when it should be generated."
                />
              </div>
            </div>
            <div className="border-t border-outline-variant px-5 py-4">
              <button
                type="button"
                onClick={() => void saveMetadata()}
                className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-indigo-500 to-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:from-indigo-600 hover:to-indigo-700"
                disabled={saving}
              >
                <Save className="h-4 w-4" />
                {saving ? 'Saving...' : isNew ? 'Create Template' : 'Save Settings'}
              </button>
            </div>
          </section>

          {!isNew ? (
            <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
              <div className="space-y-6">
                <section className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 overflow-hidden">
                  <div className="px-5 py-4 border-b border-outline-variant">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-2 text-sm font-semibold text-on-surface">
                        <Layers3 className="h-4 w-4 text-primary" />
                        Versions
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void createDraft()}
                          className="inline-flex items-center gap-2 rounded-lg border border-outline bg-surface-container-lowest px-3 py-1.5 text-xs font-medium text-on-surface shadow-sm transition-colors hover:bg-surface-container"
                          disabled={working === 'draft'}
                        >
                          <FilePlus2 className="h-3.5 w-3.5" />
                          {working === 'draft' ? 'Creating...' : 'New Draft'}
                        </button>
                        <button
                          type="button"
                          onClick={() => fileRef.current?.click()}
                          className="inline-flex items-center gap-2 rounded-lg border border-outline bg-surface-container-lowest px-3 py-1.5 text-xs font-medium text-on-surface shadow-sm transition-colors hover:bg-surface-container"
                          disabled={working === 'upload'}
                        >
                          <UploadCloud className="h-3.5 w-3.5" />
                          Upload
                        </button>
                        <input
                          ref={fileRef}
                          type="file"
                          accept=".html,.htm"
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
                            ? 'border-primary bg-primary-container/50'
                            : 'border-outline-variant bg-surface-container-lowest'
                        }`}
                      >
                        <button
                          type="button"
                          className="w-full text-left"
                          onClick={() => setSelectedVersionId(version.id)}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="font-semibold text-on-surface">v{version.version}</div>
                              <div className="text-xs text-on-surface-variant">{version.fileType.toUpperCase()} · {version.status}</div>
                            </div>
                            {template.activeVersionId === version.id ? (
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">Active</span>
                            ) : null}
                          </div>
                        </button>
                        <div className="mt-3 flex gap-2">
                          {template.activeVersionId !== version.id ? (
                            <button
                              type="button"
                              onClick={() => void activateVersion(version.id)}
                              className="inline-flex items-center gap-2 rounded-lg border border-outline bg-surface-container-lowest px-3 py-1.5 text-xs font-medium text-on-surface shadow-sm transition-colors hover:bg-surface-container flex-1"
                              disabled={working === version.id}
                            >
                              {working === version.id ? 'Activating...' : 'Activate'}
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => void loadTemplate(params.id)}
                            className="inline-flex items-center gap-2 rounded-lg border border-outline bg-surface-container-lowest px-3 py-1.5 text-xs font-medium text-on-surface shadow-sm transition-colors hover:bg-surface-container"
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 overflow-hidden">
                  <div className="px-5 py-4 border-b border-outline-variant">
                    <div className="text-sm font-semibold text-on-surface">Field Browser</div>
                  </div>
                  <div className="space-y-4 p-4">
                    {groupedFields.map(([group, fields]) => (
                      <div key={group}>
                        <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-outline-variant">{group}</div>
                        <div className="space-y-2">
                          {fields.map((field) => (
                            <div key={field.key} className="rounded-xl border border-outline-variant bg-surface-container-lowest px-3 py-3">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <div className="font-medium text-on-surface">{field.label}</div>
                                  <div className="mt-1 font-mono text-[11px] text-primary">{field.key}</div>
                                  {field.description ? (
                                    <div className="mt-1 text-xs text-on-surface-variant">{field.description}</div>
                                  ) : null}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => void copyFieldMarkup(field)}
                                  className="inline-flex items-center gap-1 rounded-lg border border-outline bg-surface-container-lowest px-2.5 py-1.5 text-xs font-medium text-on-surface shadow-sm transition-colors hover:bg-surface-container"
                                >
                                  <Copy className="h-3.5 w-3.5" />
                                  Copy
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

              <section className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 overflow-hidden">
                <div className="px-5 py-4 border-b border-outline-variant flex items-center justify-between">
                  <div className="text-sm font-semibold text-on-surface">ONLYOFFICE Editor</div>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-container px-2.5 py-0.5 text-xs font-semibold text-on-surface">
                    {selectedVersionId ? `Version ${template?.versions?.find((version) => version.id === selectedVersionId)?.version ?? '-'}` : 'No version selected'}
                  </span>
                </div>
                <div className="p-5">
                  {editorConfigUrl ? (
                    <OnlyOfficeFrame configUrl={editorConfigUrl} />
                  ) : (
                    <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest px-6 py-20 text-center text-sm text-on-surface-variant">
                      Select or create a version to start editing.
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
