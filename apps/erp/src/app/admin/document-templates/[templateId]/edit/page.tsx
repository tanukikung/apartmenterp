'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowLeft, Save } from 'lucide-react';

type TemplateForm = {
  name: string;
  type: string;
  body: string;
  subject: string;
};

const EMPTY: TemplateForm = { name: '', type: 'INVOICE', body: '', subject: '' };

const TEMPLATE_TYPES = [
  { value: 'INVOICE', label: 'Invoice' },
  { value: 'CONTRACT', label: 'Contract' },
  { value: 'RECEIPT', label: 'Receipt' },
  { value: 'NOTICE', label: 'Notice' },
  { value: 'OTHER', label: 'Other' },
];

const VARIABLES = [
  '{{tenantName}}', '{{roomNumber}}', '{{floorNumber}}',
  '{{invoiceNumber}}', '{{amount}}', '{{dueDate}}',
  '{{buildingName}}', '{{month}}', '{{year}}',
];

export default function DocumentTemplateEditPage() {
  const { templateId } = useParams<{ templateId: string }>();
  const router = useRouter();
  const isNew = templateId === 'new';

  const [form, setForm] = useState<TemplateForm>(EMPTY);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isNew) return;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/document-templates/${templateId}`, { cache: 'no-store' }).then((r) => r.json());
        if (!res.success) throw new Error((res.error?.message as string | undefined) ?? 'Not found');
        const d = res.data as { name?: string; type?: string; body?: string; subject?: string };
        setForm({
          name: typeof d.name === 'string' ? d.name : '',
          type: typeof d.type === 'string' ? d.type : 'INVOICE',
          body: typeof d.body === 'string' ? d.body : '',
          subject: typeof d.subject === 'string' ? d.subject : '',
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to load template');
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [templateId, isNew]);

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const url = isNew ? '/api/document-templates' : `/api/document-templates/${templateId}`;
      const method = isNew ? 'POST' : 'PATCH';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      }).then((r) => r.json());
      if (!res.success) throw new Error((res.error?.message as string | undefined) ?? 'Save failed');
      setMessage(isNew ? 'Template created.' : 'Template saved.');
      if (isNew) {
        const newId = (res.data as { id?: string })?.id;
        if (newId) router.replace(`/admin/document-templates/${newId}/edit`);
        else router.push('/admin/document-templates');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save template');
    } finally {
      setSaving(false);
    }
  }

  function insertVariable(v: string) {
    setForm((f) => ({ ...f, body: f.body + v }));
  }

  return (
    <main className="admin-page">
      <section className="admin-page-header">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/document-templates"
            className="flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" /> Templates
          </Link>
          <span className="text-slate-300">/</span>
          <div>
            <h1 className="admin-page-title">{isNew ? 'New Template' : 'Edit Template'}</h1>
            <p className="admin-page-subtitle">
              {isNew ? 'Create a new document template' : `Editing: ${form.name || templateId}`}
            </p>
          </div>
        </div>
      </section>

      {message ? <div className="auth-alert auth-alert-success">{message}</div> : null}
      {error ? <div className="auth-alert auth-alert-error">{error}</div> : null}

      {loading ? (
        <div className="py-16 text-center text-slate-500">Loading template...</div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_260px]">
          <form onSubmit={(e) => void save(e)} className="space-y-6">
            <section className="admin-card">
              <div className="admin-card-header">
                <div className="admin-card-title">Template Details</div>
              </div>
              <div className="grid gap-4 p-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">Template Name</label>
                  <input
                    className="admin-input"
                    placeholder="e.g. Monthly Invoice – Thai"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">Type</label>
                  <select
                    className="admin-select"
                    value={form.type}
                    onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                  >
                    {TEMPLATE_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">Subject / Title</label>
                  <input
                    className="admin-input"
                    placeholder="Shown as email subject or document title"
                    value={form.subject}
                    onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">Body</label>
                  <textarea
                    className="admin-input min-h-[280px] resize-y font-mono text-xs"
                    placeholder="Template body. Use {{variables}} for dynamic content."
                    value={form.body}
                    onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                  />
                </div>
              </div>
            </section>

            <div className="flex gap-3">
              <button
                type="submit"
                className="admin-button admin-button-primary flex items-center gap-2"
                disabled={saving}
              >
                <Save className="h-4 w-4" />
                {saving ? 'Saving...' : isNew ? 'Create Template' : 'Save Changes'}
              </button>
              <Link href="/admin/document-templates" className="admin-button">
                Cancel
              </Link>
            </div>
          </form>

          {/* Variable picker */}
          <div className="space-y-4">
            <section className="admin-card">
              <div className="admin-card-header">
                <div className="admin-card-title">Available Variables</div>
              </div>
              <div className="grid gap-1.5 p-4">
                <p className="mb-2 text-xs text-slate-500">Click to insert into body:</p>
                {VARIABLES.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => insertVariable(v)}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-left text-xs font-mono text-slate-700 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700 transition-colors"
                  >
                    {v}
                  </button>
                ))}
              </div>
            </section>
          </div>
        </div>
      )}
    </main>
  );
}
