'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { FileText, Pencil, Plus, Trash2 } from 'lucide-react';

type DocumentTemplate = {
  id: string;
  name: string;
  type: string;
  body: string;
  createdAt: string;
  updatedAt: string;
};

type TemplateList = {
  data: DocumentTemplate[];
  total: number;
};

function typeLabel(type: string): string {
  const map: Record<string, string> = {
    INVOICE: 'Invoice',
    CONTRACT: 'Contract',
    RECEIPT: 'Receipt',
    NOTICE: 'Notice',
    OTHER: 'Other',
  };
  return map[type] ?? type;
}

export default function DocumentTemplatesPage() {
  const [data, setData] = useState<TemplateList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/document-templates?pageSize=50', { cache: 'no-store' }).then((r) => r.json());
      if (!res.success) throw new Error((res.error?.message as string | undefined) ?? 'Unable to load templates');
      const raw = res.data;
      const items: DocumentTemplate[] = Array.isArray(raw) ? raw : (raw?.data ?? []);
      setData({ data: items, total: raw?.total ?? items.length });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load document templates');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function deleteTemplate(id: string) {
    if (!confirm('Delete this template? This cannot be undone.')) return;
    setDeleting(id);
    setMessage(null);
    try {
      const res = await fetch(`/api/document-templates/${id}`, { method: 'DELETE' }).then((r) => r.json());
      if (!res.success) throw new Error((res.error?.message as string | undefined) ?? 'Delete failed');
      setMessage('Template deleted.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete template');
    } finally {
      setDeleting(null);
    }
  }

  return (
    <main className="admin-page">
      <section className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Document Templates</h1>
          <p className="admin-page-subtitle">
            Manage reusable templates for invoices, contracts, receipts, and notices.
          </p>
        </div>
        <div className="admin-toolbar">
          <Link href="/admin/document-templates/new/edit" className="admin-button admin-button-primary flex items-center gap-2">
            <Plus className="h-4 w-4" /> New Template
          </Link>
        </div>
      </section>

      {message ? <div className="auth-alert auth-alert-success">{message}</div> : null}
      {error ? <div className="auth-alert auth-alert-error">{error}</div> : null}

      <section className="admin-card overflow-hidden">
        <div className="admin-card-header">
          <div className="admin-card-title flex items-center gap-2">
            <FileText className="h-4 w-4 text-indigo-500" /> Templates
          </div>
          <span className="admin-badge">{data?.total ?? 0} records</span>
        </div>

        {loading ? (
          <div className="space-y-3 p-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-xl bg-slate-100" />
            ))}
          </div>
        ) : !data?.data.length ? (
          <div className="p-8 text-center text-sm text-slate-500">
            No document templates found.{' '}
            <Link href="/admin/document-templates/new/edit" className="text-indigo-600 hover:underline">
              Create the first one.
            </Link>
          </div>
        ) : (
          <div className="overflow-auto">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Updated</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((tpl) => (
                  <tr key={tpl.id}>
                    <td className="font-medium text-slate-900">{tpl.name}</td>
                    <td>
                      <span className="admin-badge">{typeLabel(tpl.type)}</span>
                    </td>
                    <td>{new Date(tpl.updatedAt).toLocaleDateString()}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/admin/document-templates/${tpl.id}/edit`}
                          className="admin-button flex items-center gap-1 text-xs"
                        >
                          <Pencil className="h-3 w-3" /> Edit
                        </Link>
                        <button
                          className="admin-button flex items-center gap-1 text-xs text-red-600 hover:text-red-700"
                          onClick={() => void deleteTemplate(tpl.id)}
                          disabled={deleting === tpl.id}
                        >
                          <Trash2 className="h-3 w-3" />
                          {deleting === tpl.id ? '...' : 'Delete'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Link to message templates */}
      <div className="rounded-2xl border border-indigo-100 bg-indigo-50/60 px-5 py-4 text-sm text-indigo-800">
        <span className="font-semibold">Note:</span> LINE message templates (for tenant notifications) are managed separately under{' '}
        <Link href="/admin/message-templates" className="font-semibold underline underline-offset-2">
          Message Templates
        </Link>.
      </div>
    </main>
  );
}
