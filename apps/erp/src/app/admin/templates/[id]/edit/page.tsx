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
    <main className="admin-page">
      <section className="admin-page-header">
        <div className="flex items-center gap-4">
          <Link href={isNew ? '/admin/templates' : `/admin/templates/${params.id}`} className="admin-button flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            {isNew ? 'Templates' : 'Template Detail'}
          </Link>
          <div>
            <h1 className="admin-page-title">{isNew ? 'Create Template' : 'Template Editor Workspace'}</h1>
            <p className="admin-page-subtitle">
              Manage metadata, versions, structured fields, and edit the document in ONLYOFFICE.
            </p>
          </div>
        </div>
      </section>

      {message ? <div className="auth-alert auth-alert-success">{message}</div> : null}
      {error ? <div className="auth-alert auth-alert-error">{error}</div> : null}

      {loading ? (
        <div className="py-16 text-center text-slate-500">Loading template workspace...</div>
      ) : (
        <div className="space-y-6">
          <section className="admin-card">
            <div className="admin-card-header">
              <div className="admin-card-title">Template Settings</div>
            </div>
            <div className="grid gap-4 p-5 lg:grid-cols-4">
              <div className="lg:col-span-2">
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Name</label>
                <input
                  className="admin-input"
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Monthly Invoice"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Type</label>
                <select
                  className="admin-select"
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
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Subject</label>
                <input
                  className="admin-input"
                  value={form.subject}
                  onChange={(event) => setForm((current) => ({ ...current, subject: event.target.value }))}
                  placeholder="Invoice for Room {{room.number}}"
                />
              </div>
              <div className="lg:col-span-4">
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Description</label>
                <textarea
                  className="admin-textarea min-h-[96px]"
                  value={form.description}
                  onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                  placeholder="What this template is used for and when it should be generated."
                />
              </div>
            </div>
            <div className="border-t border-slate-200 px-5 py-4">
              <button
                type="button"
                onClick={() => void saveMetadata()}
                className="admin-button admin-button-primary flex items-center gap-2"
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
                <section className="admin-card">
                  <div className="admin-card-header">
                    <div className="admin-card-title flex items-center gap-2">
                      <Layers3 className="h-4 w-4 text-indigo-500" />
                      Versions
                    </div>
                    <div className="admin-toolbar">
                      <button
                        type="button"
                        onClick={() => void createDraft()}
                        className="admin-button flex items-center gap-2 text-xs"
                        disabled={working === 'draft'}
                      >
                        <FilePlus2 className="h-3.5 w-3.5" />
                        {working === 'draft' ? 'Creating...' : 'New Draft'}
                      </button>
                      <button
                        type="button"
                        onClick={() => fileRef.current?.click()}
                        className="admin-button flex items-center gap-2 text-xs"
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
                  <div className="space-y-3 p-4">
                    {(template?.versions ?? []).map((version) => (
                      <div
                        key={version.id}
                        className={`rounded-[1.5rem] border px-4 py-4 ${
                          selectedVersionId === version.id
                            ? 'border-indigo-300 bg-indigo-50/80'
                            : 'border-slate-200 bg-slate-50/70'
                        }`}
                      >
                        <button
                          type="button"
                          className="w-full text-left"
                          onClick={() => setSelectedVersionId(version.id)}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="font-semibold text-slate-900">v{version.version}</div>
                              <div className="text-xs text-slate-500">{version.fileType.toUpperCase()} · {version.status}</div>
                            </div>
                            {template.activeVersionId === version.id ? (
                              <span className="admin-badge admin-status-good">Active</span>
                            ) : null}
                          </div>
                        </button>
                        <div className="mt-3 flex gap-2">
                          {template.activeVersionId !== version.id ? (
                            <button
                              type="button"
                              onClick={() => void activateVersion(version.id)}
                              className="admin-button flex-1 text-xs"
                              disabled={working === version.id}
                            >
                              {working === version.id ? 'Activating...' : 'Activate'}
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => void loadTemplate(params.id)}
                            className="admin-button text-xs"
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="admin-card">
                  <div className="admin-card-header">
                    <div className="admin-card-title">Field Browser</div>
                  </div>
                  <div className="space-y-4 p-4">
                    {groupedFields.map(([group, fields]) => (
                      <div key={group}>
                        <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{group}</div>
                        <div className="space-y-2">
                          {fields.map((field) => (
                            <div key={field.key} className="rounded-[1.25rem] border border-slate-200 bg-slate-50/80 px-3 py-3">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <div className="font-medium text-slate-900">{field.label}</div>
                                  <div className="mt-1 font-mono text-[11px] text-indigo-600">{field.key}</div>
                                  {field.description ? (
                                    <div className="mt-1 text-xs text-slate-500">{field.description}</div>
                                  ) : null}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => void copyFieldMarkup(field)}
                                  className="admin-button flex items-center gap-1 text-xs"
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

              <section className="admin-card overflow-hidden">
                <div className="admin-card-header">
                  <div className="admin-card-title">ONLYOFFICE Editor</div>
                  <span className="admin-badge">
                    {selectedVersionId ? `Version ${template?.versions?.find((version) => version.id === selectedVersionId)?.version ?? '-'}` : 'No version selected'}
                  </span>
                </div>
                <div className="p-5">
                  {editorConfigUrl ? (
                    <OnlyOfficeFrame configUrl={editorConfigUrl} />
                  ) : (
                    <div className="rounded-[2rem] border border-slate-200 bg-slate-50 px-6 py-20 text-center text-sm text-slate-500">
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
