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
          throw new Error(json.error?.message ?? 'Unable to load template');
        }
        setTemplate(json.data as TemplateDetail);
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : 'Unable to load template');
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
          throw new Error(json.error?.message ?? 'Unable to build preview');
        }
        setPreview(json.data as TemplatePreview);
      } catch (nextError) {
        setPreview(null);
        setError(nextError instanceof Error ? nextError.message : 'Unable to build preview');
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
    <main className="admin-page">
      <section className="admin-page-header">
        <div className="flex items-center gap-4">
          <Link href="/admin/templates" className="admin-button flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            Templates
          </Link>
          <div>
            <h1 className="admin-page-title">{template?.name ?? 'Template Detail'}</h1>
            <p className="admin-page-subtitle">
              Inspect versions, field bindings, sample preview, and generation readiness.
            </p>
          </div>
        </div>
        <div className="admin-toolbar">
          <Link href={`/admin/templates/${params.id}/edit`} className="admin-button admin-button-primary">
            Open Editor Workspace
          </Link>
        </div>
      </section>

      {error ? <div className="auth-alert auth-alert-error">{error}</div> : null}

      {loading ? (
        <div className="py-16 text-center text-slate-500">Loading template...</div>
      ) : !template ? null : (
        <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
          <div className="space-y-6">
            <section className="admin-card">
              <div className="admin-card-header">
                <div className="admin-card-title flex items-center gap-2">
                  <Layers3 className="h-4 w-4 text-indigo-500" />
                  Metadata
                </div>
              </div>
              <div className="space-y-4 p-5 text-sm text-slate-600">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Type</div>
                  <div className="mt-1 font-medium text-slate-900">{template.type.replace(/_/g, ' ')}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Status</div>
                  <div className="mt-1">
                    <span className="admin-badge">{template.status}</span>
                  </div>
                </div>
                {template.subject ? (
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Subject</div>
                    <div className="mt-1 text-slate-800">{template.subject}</div>
                  </div>
                ) : null}
                {template.description ? (
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Description</div>
                    <div className="mt-1 text-slate-800">{template.description}</div>
                  </div>
                ) : null}
              </div>
            </section>

            <section className="admin-card overflow-hidden">
              <div className="admin-card-header">
                <div className="admin-card-title">Versions</div>
                <span className="admin-badge">{template.versions?.length ?? 0}</span>
              </div>
              <div className="overflow-auto">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Version</th>
                      <th>Status</th>
                      <th>File</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(template.versions ?? []).map((version) => (
                      <tr key={version.id}>
                        <td className="font-semibold text-slate-900">v{version.version}</td>
                        <td>
                          <span className="admin-badge">{version.status}</span>
                        </td>
                        <td>{version.fileType.toUpperCase()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          <div className="space-y-6">
            <section className="admin-card">
              <div className="admin-card-header">
                <div className="admin-card-title flex items-center gap-2">
                  <FileCode2 className="h-4 w-4 text-indigo-500" />
                  Field Catalog
                </div>
              </div>
              <div className="grid gap-4 p-5 md:grid-cols-2">
                {groupedFields.map(([group, fields]) => (
                  <div key={group} className="rounded-[1.5rem] border border-slate-200 bg-slate-50/70 p-4">
                    <div className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{group}</div>
                    <div className="space-y-3">
                      {fields.map((field) => (
                        <div key={field.key} className="rounded-[1.25rem] bg-white px-3 py-3 shadow-sm">
                          <div className="flex items-center gap-2">
                            <div className="font-medium text-slate-900">{field.label}</div>
                            {field.isRequired ? <span className="admin-badge admin-status-bad">Required</span> : null}
                            {field.isCollection ? <span className="admin-badge admin-status-warn">Collection</span> : null}
                          </div>
                          <div className="mt-1 font-mono text-xs text-indigo-600">{field.key}</div>
                          {field.description ? <div className="mt-1 text-xs text-slate-500">{field.description}</div> : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="admin-card">
              <div className="admin-card-header">
                <div className="admin-card-title flex items-center gap-2">
                  <Eye className="h-4 w-4 text-indigo-500" />
                  Sample Preview
                </div>
                <span className="admin-badge">{previewLoading ? 'Building…' : 'Ready'}</span>
              </div>
              {preview?.missingFields?.length ? (
                <div className="px-5 pt-4 text-sm text-amber-700">
                  Missing fields: {preview.missingFields.map((field) => field.key).join(', ')}
                </div>
              ) : null}
              <div className="p-5">
                <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white">
                  {previewLoading ? (
                    <div className="px-6 py-16 text-center text-sm text-slate-500">Building preview...</div>
                  ) : preview ? (
                    <iframe
                      title="Template preview"
                      className="min-h-[540px] w-full bg-white"
                      srcDoc={preview.html}
                    />
                  ) : (
                    <div className="px-6 py-16 text-center text-sm text-slate-500">Preview unavailable.</div>
                  )}
                </div>
              </div>
              <div className="border-t border-slate-200 px-5 py-4 text-sm text-slate-500">
                <div className="flex items-center gap-2 font-medium text-slate-700">
                  <Sparkles className="h-4 w-4 text-indigo-500" />
                  Preview is rendered from live ERP resolver data, not fake frontend placeholders.
                </div>
              </div>
            </section>
          </div>
        </div>
      )}
    </main>
  );
}
