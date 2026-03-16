'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCopy,
  Info,
  Loader2,
  MessageSquare,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TemplateType =
  | 'INVOICE_SEND'
  | 'PAYMENT_REMINDER'
  | 'OVERDUE_NOTICE'
  | 'CUSTOM';

interface MessageTemplate {
  id: string;
  name: string;
  type: TemplateType;
  body: string;
  variables?: string[];
  createdAt?: string;
  updatedAt?: string;
}

interface TemplateFormData {
  name: string;
  type: TemplateType;
  body: string;
}

// ---------------------------------------------------------------------------
// Demo / default templates
// ---------------------------------------------------------------------------

const DEFAULT_TEMPLATES: MessageTemplate[] = [
  {
    id: 'default-1',
    name: 'Invoice Notification',
    type: 'INVOICE_SEND',
    body: 'เรียนคุณ {{tenant_name}}\n\nใบแจ้งหนี้ประจำเดือน {{month_year}} ห้อง {{room_number}} มียอดชำระ {{amount}} บาท\nกรุณาชำระภายในวันที่ {{due_date}}\nขอบคุณครับ/ค่ะ',
    variables: ['{{tenant_name}}', '{{month_year}}', '{{room_number}}', '{{amount}}', '{{due_date}}'],
  },
  {
    id: 'default-2',
    name: 'Payment Reminder',
    type: 'PAYMENT_REMINDER',
    body: 'แจ้งเตือนคุณ {{tenant_name}}\n\nยังไม่ได้รับการชำระค่าห้อง {{room_number}} ประจำเดือน {{month_year}}\nยอดค้างชำระ: {{amount}} บาท\nกรุณาชำระก่อนวันที่ {{due_date}} เพื่อหลีกเลี่ยงค่าปรับ',
    variables: ['{{tenant_name}}', '{{room_number}}', '{{month_year}}', '{{amount}}', '{{due_date}}'],
  },
  {
    id: 'default-3',
    name: 'Overdue Warning',
    type: 'OVERDUE_NOTICE',
    body: 'แจ้งเตือนเร่งด่วน คุณ {{tenant_name}}\n\nค่าเช่าห้อง {{room_number}} เดือน {{month_year}} เกินกำหนดชำระแล้ว\nยอดค้างชำระรวมค่าปรับ: {{amount}} บาท\nกรุณาติดต่อสำนักงานโดยด่วน',
    variables: ['{{tenant_name}}', '{{room_number}}', '{{month_year}}', '{{amount}}'],
  },
];

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TYPE_OPTIONS: { value: TemplateType; label: string }[] = [
  { value: 'INVOICE_SEND', label: 'Invoice Send' },
  { value: 'PAYMENT_REMINDER', label: 'Payment Reminder' },
  { value: 'OVERDUE_NOTICE', label: 'Overdue Notice' },
  { value: 'CUSTOM', label: 'Custom' },
];

const VARIABLE_HINTS: { label: string; value: string }[] = [
  { label: '{{tenant_name}}', value: '{{tenant_name}}' },
  { label: '{{room_number}}', value: '{{room_number}}' },
  { label: '{{amount}}', value: '{{amount}}' },
  { label: '{{due_date}}', value: '{{due_date}}' },
  { label: '{{month_year}}', value: '{{month_year}}' },
];

const TYPE_BADGE: Record<TemplateType, { cls: string; label: string }> = {
  INVOICE_SEND: { cls: 'bg-blue-100 text-blue-700 border-blue-200', label: 'INVOICE' },
  PAYMENT_REMINDER: { cls: 'bg-amber-100 text-amber-700 border-amber-200', label: 'REMINDER' },
  OVERDUE_NOTICE: { cls: 'bg-red-100 text-red-700 border-red-200', label: 'OVERDUE' },
  CUSTOM: { cls: 'bg-slate-100 text-slate-600 border-slate-200', label: 'CUSTOM' },
};

const EMPTY_FORM: TemplateFormData = {
  name: '',
  type: 'INVOICE_SEND',
  body: '',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractVariables(body: string): string[] {
  const matches = body.match(/\{\{[^}]+\}\}/g);
  return matches ? Array.from(new Set(matches)) : [];
}

function generateId() {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// ---------------------------------------------------------------------------
// Type badge
// ---------------------------------------------------------------------------

function TypeBadge({ type }: { type: TemplateType }) {
  const { cls, label } = TYPE_BADGE[type] ?? {
    cls: 'bg-slate-100 text-slate-600 border-slate-200',
    label: type,
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold tracking-wide ${cls}`}>
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Variable chip
// ---------------------------------------------------------------------------

function VarChip({ value }: { value: string }) {
  return (
    <code className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-xs text-slate-600">
      {value}
    </code>
  );
}

// ---------------------------------------------------------------------------
// Confirm delete modal
// ---------------------------------------------------------------------------

function ConfirmDeleteModal({
  templateName,
  onConfirm,
  onCancel,
  deleting,
}: {
  templateName: string;
  onConfirm: () => void;
  onCancel: () => void;
  deleting: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
      <div className="relative z-10 w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-100 text-red-600">
          <Trash2 className="h-5 w-5" />
        </div>
        <h3 className="mb-1 text-base font-semibold text-slate-900">Delete Template</h3>
        <p className="mb-5 text-sm text-slate-500">
          Are you sure you want to delete{' '}
          <span className="font-medium text-slate-700">&ldquo;{templateName}&rdquo;</span>? This action cannot
          be undone.
        </p>
        <div className="flex gap-2">
          <button
            onClick={onConfirm}
            disabled={deleting}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
          >
            {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
            Delete
          </button>
          <button
            onClick={onCancel}
            disabled={deleting}
            className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Template form (add / edit)
// ---------------------------------------------------------------------------

interface TemplateFormProps {
  initial?: TemplateFormData;
  onSave: (data: TemplateFormData) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
  error: string | null;
  title: string;
}

function TemplateForm({ initial, onSave, onCancel, saving, error, title }: TemplateFormProps) {
  const [form, setForm] = useState<TemplateFormData>(initial ?? EMPTY_FORM);
  // textareaRef reserved for future cursor-position insertion

  function insertVariable(v: string) {
    setForm((f) => ({ ...f, body: f.body + v }));
  }

  const vars = extractVariables(form.body);

  return (
    <div className="rounded-2xl border border-indigo-200 bg-indigo-50/40 p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-semibold text-slate-800">{title}</h3>
        <button
          onClick={onCancel}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0 text-red-500" />
          {error}
        </div>
      )}

      <div className="space-y-4">
        {/* Name */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">
            Template Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="e.g. Monthly Invoice — Thai"
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          />
        </div>

        {/* Type */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">
            Type <span className="text-red-500">*</span>
          </label>
          <select
            value={form.type}
            onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as TemplateType }))}
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          >
            {TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        {/* Variable hints */}
        <div>
          <p className="mb-2 text-xs font-medium text-slate-500">Insert variable</p>
          <div className="flex flex-wrap gap-1.5">
            {VARIABLE_HINTS.map((hint) => (
              <button
                key={hint.value}
                type="button"
                onClick={() => insertVariable(hint.value)}
                className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 font-mono text-xs text-slate-600 shadow-sm transition-colors hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
              >
                <Plus className="h-3 w-3" />
                {hint.label}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">
            Message Body <span className="text-red-500">*</span>
          </label>
          <textarea
            value={form.body}
            onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
            placeholder="Write your message here. Use variables like {{tenant_name}} to personalise."
            rows={6}
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 font-mono text-sm text-slate-900 placeholder-slate-400 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 resize-y"
          />
          <p className="mt-1.5 text-xs text-slate-400">{form.body.length} characters</p>
        </div>

        {/* Detected variables */}
        {vars.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-slate-500">Detected:</span>
            {vars.map((v) => (
              <VarChip key={v} value={v} />
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <button
            onClick={() => void onSave(form)}
            disabled={saving || !form.name.trim() || !form.body.trim()}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save Template
          </button>
          <button
            onClick={onCancel}
            disabled={saving}
            className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Template card
// ---------------------------------------------------------------------------

interface TemplateCardProps {
  template: MessageTemplate;
  onEdit: (t: MessageTemplate) => void;
  onDelete: (t: MessageTemplate) => void;
  onDuplicate: (t: MessageTemplate) => void;
}

function TemplateCard({ template, onEdit, onDelete, onDuplicate }: TemplateCardProps) {
  const preview =
    template.body.length > 100
      ? template.body.slice(0, 100).replace(/\n/g, ' ') + '…'
      : template.body.replace(/\n/g, ' ');
  const vars = template.variables ?? extractVariables(template.body);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600">
            <MessageSquare className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="truncate font-semibold text-slate-900">{template.name}</div>
          </div>
        </div>
        <TypeBadge type={template.type} />
      </div>

      {/* Preview */}
      <p className="mt-3 text-sm text-slate-500 leading-relaxed break-words">{preview}</p>

      {/* Variables */}
      {vars.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-slate-400">Variables:</span>
          {vars.map((v) => (
            <VarChip key={v} value={v} />
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-4">
        <button
          onClick={() => onEdit(template)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
        >
          <Pencil className="h-3.5 w-3.5" />
          Edit
        </button>
        <button
          onClick={() => onDuplicate(template)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50"
        >
          <ClipboardCopy className="h-3.5 w-3.5" />
          Duplicate
        </button>
        <button
          onClick={() => onDelete(template)}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-red-100 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:border-red-200 hover:bg-red-100"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function MessageTemplatesPage() {
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [usingDefaults, setUsingDefaults] = useState(false);

  // Form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<MessageTemplate | null>(null);
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Delete state
  const [deletingTemplate, setDeletingTemplate] = useState<MessageTemplate | null>(null);
  const [deleteInProgress, setDeleteInProgress] = useState(false);

  // Toast
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);

  // ---------------------------------------------------------------------------
  // Load
  // ---------------------------------------------------------------------------

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/message-templates', { cache: 'no-store' });
      if (res.status === 404 || !res.ok) throw new Error('not found');
      const json = await res.json();
      const list: MessageTemplate[] = Array.isArray(json)
        ? json
        : Array.isArray(json?.data)
        ? json.data
        : Array.isArray(json?.data?.templates)
        ? json.data.templates
        : [];
      setTemplates(list);
      setUsingDefaults(false);
    } catch {
      setTemplates(DEFAULT_TEMPLATES);
      setUsingDefaults(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // ---------------------------------------------------------------------------
  // Toast helper
  // ---------------------------------------------------------------------------

  function showToast(ok: boolean, msg: string) {
    setToast({ ok, msg });
    setTimeout(() => setToast(null), 3500);
  }

  // ---------------------------------------------------------------------------
  // Add
  // ---------------------------------------------------------------------------

  async function handleAdd(data: TemplateFormData) {
    setFormSaving(true);
    setFormError(null);
    try {
      if (usingDefaults) {
        // Local only
        const newT: MessageTemplate = {
          id: generateId(),
          ...data,
          variables: extractVariables(data.body),
        };
        setTemplates((prev) => [newT, ...prev]);
        setShowAddForm(false);
        showToast(true, 'Template added (demo mode — not persisted to API).');
        return;
      }
      const res = await fetch('/api/message-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok || json.success === false) {
        throw new Error(json.error?.message ?? json.message ?? 'Failed to create');
      }
      setShowAddForm(false);
      showToast(true, 'Template created successfully.');
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to save template');
    } finally {
      setFormSaving(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Edit
  // ---------------------------------------------------------------------------

  async function handleEdit(data: TemplateFormData) {
    if (!editingTemplate) return;
    setFormSaving(true);
    setFormError(null);
    try {
      if (usingDefaults) {
        setTemplates((prev) =>
          prev.map((t) =>
            t.id === editingTemplate.id
              ? { ...t, ...data, variables: extractVariables(data.body) }
              : t
          )
        );
        setEditingTemplate(null);
        showToast(true, 'Template updated (demo mode — not persisted).');
        return;
      }
      const res = await fetch(`/api/message-templates/${editingTemplate.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok || json.success === false) {
        throw new Error(json.error?.message ?? json.message ?? 'Failed to update');
      }
      setEditingTemplate(null);
      showToast(true, 'Template updated successfully.');
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to update template');
    } finally {
      setFormSaving(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Delete
  // ---------------------------------------------------------------------------

  async function handleConfirmDelete() {
    if (!deletingTemplate) return;
    setDeleteInProgress(true);
    try {
      if (usingDefaults) {
        setTemplates((prev) => prev.filter((t) => t.id !== deletingTemplate.id));
        setDeletingTemplate(null);
        showToast(true, 'Template removed (demo mode).');
        return;
      }
      const res = await fetch(`/api/message-templates/${deletingTemplate.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error?.message ?? 'Failed to delete');
      }
      setDeletingTemplate(null);
      showToast(true, 'Template deleted.');
      await load();
    } catch (err) {
      showToast(false, err instanceof Error ? err.message : 'Delete failed');
      setDeletingTemplate(null);
    } finally {
      setDeleteInProgress(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Duplicate
  // ---------------------------------------------------------------------------

  async function handleDuplicate(template: MessageTemplate) {
    const data: TemplateFormData = {
      name: `${template.name} (copy)`,
      type: template.type,
      body: template.body,
    };
    if (usingDefaults) {
      const newT: MessageTemplate = {
        id: generateId(),
        ...data,
        variables: extractVariables(data.body),
      };
      setTemplates((prev) => [...prev, newT]);
      showToast(true, 'Template duplicated (demo mode).');
      return;
    }
    try {
      const res = await fetch('/api/message-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok || json.success === false) {
        throw new Error(json.error?.message ?? json.message ?? 'Failed to duplicate');
      }
      showToast(true, 'Template duplicated.');
      await load();
    } catch (err) {
      showToast(false, err instanceof Error ? err.message : 'Duplicate failed');
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <main className="admin-page">
      {/* Toast */}
      {toast && (
        <div
          className={[
            'fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-medium shadow-lg',
            toast.ok
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-red-200 bg-red-50 text-red-700',
          ].join(' ')}
        >
          {toast.ok ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          ) : (
            <AlertTriangle className="h-4 w-4 shrink-0 text-red-500" />
          )}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <section className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Message Templates</h1>
          <p className="admin-page-subtitle">
            Manage reusable LINE message templates for invoices, reminders, and notices.
          </p>
        </div>
        <div className="admin-toolbar">
          <button
            onClick={() => {
              setEditingTemplate(null);
              setFormError(null);
              setShowAddForm(true);
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700"
          >
            <Plus className="h-4 w-4" />
            Add Template
          </button>
        </div>
      </section>

      {/* Demo notice */}
      {!loading && usingDefaults && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <span className="font-semibold">Demo mode.</span> The{' '}
            <code className="font-mono text-xs">/api/message-templates</code> endpoint is not
            available. Showing built-in default templates — changes will not be persisted.
          </span>
        </div>
      )}

      {/* Add form */}
      {showAddForm && !editingTemplate && (
        <TemplateForm
          title="New Template"
          onSave={handleAdd}
          onCancel={() => {
            setShowAddForm(false);
            setFormError(null);
          }}
          saving={formSaving}
          error={formError}
        />
      )}

      {/* Loading skeleton */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="animate-pulse rounded-2xl border border-slate-200 bg-white p-5 space-y-3"
            >
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-slate-200" />
                <div className="h-4 w-32 rounded bg-slate-200" />
              </div>
              <div className="h-3 w-full rounded bg-slate-100" />
              <div className="h-3 w-3/4 rounded bg-slate-100" />
              <div className="h-8 w-24 rounded-lg bg-slate-100" />
            </div>
          ))}
        </div>
      ) : templates.length === 0 && !showAddForm ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white py-20 text-center">
          <MessageSquare className="mb-3 h-12 w-12 text-slate-300" />
          <p className="font-semibold text-slate-600">No templates yet</p>
          <p className="mt-1 text-sm text-slate-400">
            Create your first message template to get started.
          </p>
          <button
            onClick={() => setShowAddForm(true)}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700"
          >
            <Plus className="h-4 w-4" />
            Add Template
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {templates.map((t) =>
            editingTemplate?.id === t.id ? (
              <div key={t.id} className="sm:col-span-2 xl:col-span-3">
                <TemplateForm
                  key={t.id}
                  title={`Edit: ${t.name}`}
                  initial={{ name: t.name, type: t.type, body: t.body }}
                  onSave={handleEdit}
                  onCancel={() => {
                    setEditingTemplate(null);
                    setFormError(null);
                  }}
                  saving={formSaving}
                  error={formError}
                />
              </div>
            ) : (
              <TemplateCard
                key={t.id}
                template={t}
                onEdit={(tmpl) => {
                  setShowAddForm(false);
                  setFormError(null);
                  setEditingTemplate(tmpl);
                }}
                onDelete={setDeletingTemplate}
                onDuplicate={handleDuplicate}
              />
            )
          )}
        </div>
      )}

      {/* Template count */}
      {!loading && templates.length > 0 && (
        <p className="text-right text-xs text-slate-400">
          {templates.length} template{templates.length !== 1 ? 's' : ''}
        </p>
      )}

      {/* Delete confirmation */}
      {deletingTemplate && (
        <ConfirmDeleteModal
          templateName={deletingTemplate.name}
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeletingTemplate(null)}
          deleting={deleteInProgress}
        />
      )}
    </main>
  );
}
