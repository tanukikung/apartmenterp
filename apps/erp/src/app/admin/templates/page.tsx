'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ExternalLink, FilePlus2, FileStack, Layers3, PencilLine } from 'lucide-react';

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
          throw new Error(json.error?.message ?? 'Unable to load templates');
        }
        setTemplates((json.data?.data ?? []) as TemplateRow[]);
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : 'Unable to load templates');
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, []);

  return (
    <main className="admin-page">
      <section className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Templates</h1>
          <p className="admin-page-subtitle">
            Versioned document templates powered by ONLYOFFICE with ERP field bindings and preview.
          </p>
        </div>
        <div className="admin-toolbar">
          <Link href="/admin/templates/new/edit" className="admin-button admin-button-primary flex items-center gap-2">
            <FilePlus2 className="h-4 w-4" />
            New Template
          </Link>
        </div>
      </section>

      {error ? <div className="auth-alert auth-alert-error">{error}</div> : null}

      <section className="admin-card overflow-hidden">
        <div className="admin-card-header">
          <div className="admin-card-title flex items-center gap-2">
            <Layers3 className="h-4 w-4 text-indigo-500" />
            Template Registry
          </div>
          <span className="admin-badge">{templates.length} templates</span>
        </div>
        <div className="overflow-auto">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Status</th>
                <th>Active Version</th>
                <th>Updated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-500">
                    Loading templates...
                  </td>
                </tr>
              ) : templates.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-500">
                    No templates yet. Create the first one to start batch document generation.
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
                      <span className="admin-badge">{template.type.replace(/_/g, ' ')}</span>
                    </td>
                    <td>
                      <span
                        className={`admin-badge ${
                          template.status === 'ACTIVE'
                            ? 'admin-status-good'
                            : template.status === 'ARCHIVED'
                              ? 'admin-status-bad'
                              : 'admin-status-warn'
                        }`}
                      >
                        {template.status}
                      </span>
                    </td>
                    <td>
                      {template.activeVersion ? (
                        <div className="space-y-1">
                          <div className="font-medium text-slate-800">v{template.activeVersion.version}</div>
                          <div className="text-xs text-slate-500">{template.activeVersion.status}</div>
                        </div>
                      ) : (
                        <span className="text-sm text-slate-400">No active version</span>
                      )}
                    </td>
                    <td>{new Date(template.updatedAt).toLocaleString('th-TH')}</td>
                    <td>
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/admin/templates/${template.id}`} className="admin-button flex items-center gap-1 text-xs">
                          <ExternalLink className="h-3.5 w-3.5" />
                          Detail
                        </Link>
                        <Link href={`/admin/templates/${template.id}/edit`} className="admin-button flex items-center gap-1 text-xs">
                          <PencilLine className="h-3.5 w-3.5" />
                          Edit
                        </Link>
                        <Link href={`/admin/templates/${template.id}/edit`} className="admin-button flex items-center gap-1 text-xs">
                          <FileStack className="h-3.5 w-3.5" />
                          ONLYOFFICE
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
