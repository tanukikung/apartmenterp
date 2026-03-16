'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, Save } from 'lucide-react';
import { TemplateWordEditor } from '@/components/document-editor/TemplateWordEditor';

type TemplateForm = {
  name: string;
  type: string;
  body: string;
  subject: string;
};

const EMPTY: TemplateForm = { name: '', type: 'INVOICE', body: '<p></p>', subject: '' };

const TEMPLATE_TYPES = [
  { value: 'INVOICE', label: 'Invoice' },
  { value: 'CONTRACT', label: 'Contract' },
  { value: 'RECEIPT', label: 'Receipt' },
  { value: 'NOTICE', label: 'Notice' },
  { value: 'OTHER', label: 'Other' },
];

const VARIABLES = [
  '{{tenantName}}',
  '{{roomNumber}}',
  '{{floorNumber}}',
  '{{invoiceNumber}}',
  '{{amount}}',
  '{{dueDate}}',
  '{{buildingName}}',
  '{{month}}',
  '{{year}}',
];

const SAMPLE_VALUES: Record<string, string> = {
  '{{tenantName}}': 'Somchai Jaidee',
  '{{roomNumber}}': '3201',
  '{{floorNumber}}': '3',
  '{{invoiceNumber}}': 'INV-2026-12-3201',
  '{{amount}}': 'THB 3,696',
  '{{dueDate}}': '2026-12-05',
  '{{buildingName}}': 'Apartment ERP Residence',
  '{{month}}': 'December',
  '{{year}}': '2026',
};

const QUICK_BLOCKS = [
  {
    label: 'Letterhead',
    html: `
      <h1>{{buildingName}}</h1>
      <p>Room {{roomNumber}} | {{month}} {{year}}</p>
      <p></p>
    `,
  },
  {
    label: 'Summary Table',
    html: `
      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th>Qty</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Rent</td>
            <td>1</td>
            <td>{{amount}}</td>
          </tr>
        </tbody>
      </table>
      <p></p>
    `,
  },
  {
    label: 'Payment Box',
    html: `
      <h2>Payment Instructions</h2>
      <p>Please settle the balance by {{dueDate}}.</p>
      <ul>
        <li>Invoice: {{invoiceNumber}}</li>
        <li>Room: {{roomNumber}}</li>
        <li>Total: {{amount}}</li>
      </ul>
      <p></p>
    `,
  },
  {
    label: 'Signature',
    html: `
      <p></p>
      <p>Approved by ____________________</p>
      <p>Date ____________________</p>
    `,
  },
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

    async function loadTemplate() {
      setLoading(true);
      try {
        const response = await fetch(`/api/document-templates/${templateId}`, {
          cache: 'no-store',
        });
        const json = await response.json();
        if (!response.ok || !json.success) {
          throw new Error(json.error?.message ?? 'Template not found');
        }

        const data = json.data as { name?: string; type?: string; body?: string; subject?: string };
        setForm({
          name: typeof data.name === 'string' ? data.name : '',
          type: typeof data.type === 'string' ? data.type : 'INVOICE',
          body: typeof data.body === 'string' ? data.body : '<p></p>',
          subject: typeof data.subject === 'string' ? data.subject : '',
        });
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Unable to load template');
      } finally {
        setLoading(false);
      }
    }

    void loadTemplate();
  }, [isNew, templateId]);

  async function uploadImage(file: File) {
    const payload = new FormData();
    payload.append('file', file);

    const response = await fetch('/api/files', {
      method: 'POST',
      body: payload,
    });
    const json = await response.json();
    if (!response.ok || !json.success) {
      throw new Error(json.error?.message ?? 'Unable to upload image');
    }

    const url = (json.data as { url?: string })?.url;
    if (!url) {
      throw new Error('Upload response did not include a file URL');
    }

    return {
      url,
      name: file.name,
    };
  }

  async function saveTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const endpoint = isNew ? '/api/document-templates' : `/api/document-templates/${templateId}`;
      const method = isNew ? 'POST' : 'PATCH';
      const payload = {
        ...form,
      };

      const response = await fetch(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error?.message ?? 'Unable to save template');
      }

      setMessage(isNew ? 'Template created.' : 'Template saved.');

      if (isNew) {
        const createdId = (json.data as { id?: string })?.id;
        if (createdId) {
          router.replace(`/admin/document-templates/${createdId}/office`);
        } else {
          router.push('/admin/document-templates');
        }
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save template');
    } finally {
      setSaving(false);
    }
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
            <h1 className="admin-page-title">{isNew ? 'New Template' : 'Template Settings'}</h1>
            <p className="admin-page-subtitle">
              Configure template metadata here. The actual document body is now edited in ONLYOFFICE.
            </p>
          </div>
        </div>
        {!isNew ? (
          <div className="admin-toolbar">
            <Link href={`/admin/document-templates/${templateId}/office`} className="admin-button admin-button-primary">
              Open ONLYOFFICE Editor
            </Link>
          </div>
        ) : null}
      </section>

      {message ? <div className="auth-alert auth-alert-success">{message}</div> : null}
      {error ? <div className="auth-alert auth-alert-error">{error}</div> : null}

      {loading ? (
        <div className="py-16 text-center text-slate-500">Loading template...</div>
      ) : (
        <form onSubmit={(event) => void saveTemplate(event)} className="space-y-6">
          <section className="admin-card">
            <div className="admin-card-header">
              <div className="admin-card-title">Template Details</div>
            </div>
            <div className="grid gap-4 p-4 md:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Template Name</label>
                <input
                  className="admin-input"
                  placeholder="Monthly Invoice - English"
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Type</label>
                <select
                  className="admin-select"
                  value={form.type}
                  onChange={(event) => setForm((current) => ({ ...current, type: event.target.value }))}
                >
                  {TEMPLATE_TYPES.map((templateType) => (
                    <option key={templateType.value} value={templateType.value}>
                      {templateType.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Subject / Document Title</label>
                <input
                  className="admin-input"
                  placeholder="Invoice for {{roomNumber}}"
                  value={form.subject}
                  onChange={(event) => setForm((current) => ({ ...current, subject: event.target.value }))}
                />
              </div>
            </div>
          </section>

          {!isNew ? (
            <div className="rounded-[2rem] border border-slate-200 bg-slate-50 px-5 py-4 text-sm text-slate-600">
              Body editing has moved to ONLYOFFICE so the document behaves like a real office file. Use the button above to open the full editor. This screen remains for metadata such as name, type, and subject.
            </div>
          ) : (
            <TemplateWordEditor
              value={form.body}
              subject={form.subject}
              variables={VARIABLES}
              quickBlocks={QUICK_BLOCKS}
              previewValues={SAMPLE_VALUES}
              onChange={(body) => setForm((current) => ({ ...current, body }))}
              onUploadImage={uploadImage}
            />
          )}

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
      )}
    </main>
  );
}
