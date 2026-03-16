'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Download,
  ExternalLink,
  FileCode2,
  FolderOutput,
  RotateCcw,
} from 'lucide-react';

type GeneratedDocument = {
  id: string;
  title: string;
  subject: string | null;
  status: string;
  documentType: string;
  documentVersion: number;
  sourceScope: string;
  year: number | null;
  month: number | null;
  generatedAt: string;
  template: { id: string; name: string };
  templateVersion: { id: string; version: number; label: string | null };
  room: { id: string; roomNumber: string; floorNumber: number | null };
  tenantName: string | null;
  billingCycleId: string | null;
  billingRecordId: string | null;
  invoiceId: string | null;
  files: Array<{
    id: string;
    role: string;
    format: string;
    isPrimary: boolean;
    fileName: string;
    url: string;
    size: number;
    mimeType: string;
  }>;
  renderContext?: Record<string, unknown> | null;
  validation?: Record<string, unknown> | null;
  auditTrail?: Array<{
    id: string;
    action: string;
    userName: string;
    createdAt: string;
    details?: Record<string, unknown> | null;
  }>;
};

export default function DocumentDetailPage() {
  const params = useParams<{ documentId: string }>();
  const [document, setDocument] = useState<GeneratedDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/documents/${params.documentId}`, { cache: 'no-store' });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error?.message ?? 'Unable to load document');
      }
      setDocument(json.data as GeneratedDocument);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to load document');
    } finally {
      setLoading(false);
    }
  }, [params.documentId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function regenerate() {
    setWorking(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/documents/${params.documentId}/regenerate`, {
        method: 'POST',
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error?.message ?? 'Unable to regenerate document');
      }
      setMessage('Regeneration job completed. New document version created.');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to regenerate document');
    } finally {
      setWorking(false);
    }
  }

  const prettyContext = useMemo(() => {
    return document?.renderContext ? JSON.stringify(document.renderContext, null, 2) : null;
  }, [document]);

  return (
    <main className="admin-page">
      <section className="admin-page-header">
        <div className="flex items-center gap-4">
          <Link href="/admin/documents" className="admin-button flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            Documents
          </Link>
          <div>
            <h1 className="admin-page-title">{document?.title ?? 'Document Detail'}</h1>
            <p className="admin-page-subtitle">
              Generated output, template lineage, source context, and downloadable files.
            </p>
          </div>
        </div>
        <div className="admin-toolbar">
          <button type="button" className="admin-button" onClick={() => void regenerate()} disabled={working}>
            <RotateCcw className="h-4 w-4" />
            {working ? 'Regenerating...' : 'Regenerate'}
          </button>
        </div>
      </section>

      {message ? <div className="auth-alert auth-alert-success">{message}</div> : null}
      {error ? <div className="auth-alert auth-alert-error">{error}</div> : null}

      {loading ? (
        <div className="py-16 text-center text-slate-500">Loading generated document...</div>
      ) : !document ? null : (
        <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
          <div className="space-y-6">
            <section className="admin-card">
              <div className="admin-card-header">
                <div className="admin-card-title">Metadata</div>
              </div>
              <div className="space-y-4 p-5 text-sm text-slate-600">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Status</div>
                  <div className="mt-1"><span className="admin-badge">{document.status}</span></div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Type</div>
                  <div className="mt-1 text-slate-900">{document.documentType.replace(/_/g, ' ')}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Template</div>
                  <div className="mt-1 text-slate-900">{document.template.name} · v{document.templateVersion.version}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Room</div>
                  <div className="mt-1 text-slate-900">
                    {document.room.roomNumber} · Floor {document.room.floorNumber ?? '—'}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Tenant</div>
                  <div className="mt-1 text-slate-900">{document.tenantName ?? 'No tenant linked'}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Generated</div>
                  <div className="mt-1 text-slate-900">{new Date(document.generatedAt).toLocaleString('th-TH')}</div>
                </div>
              </div>
            </section>

            <section className="admin-card">
              <div className="admin-card-header">
                <div className="admin-card-title flex items-center gap-2">
                  <FolderOutput className="h-4 w-4 text-indigo-500" />
                  Output Files
                </div>
              </div>
              <div className="space-y-3 p-5">
                {document.files.map((file) => (
                  <div key={file.id} className="rounded-[1.5rem] border border-slate-200 bg-slate-50/70 px-4 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium text-slate-900">{file.fileName}</div>
                        <div className="mt-1 text-xs text-slate-500">
                          {file.role} · {file.mimeType} · {(file.size / 1024).toFixed(1)} KB
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <a href={file.url} className="admin-button text-xs">
                          <Download className="h-3.5 w-3.5" />
                        </a>
                        <a href={file.url} target="_blank" rel="noreferrer" className="admin-button text-xs">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <section className="admin-card overflow-hidden">
            <div className="admin-card-header">
              <div className="admin-card-title flex items-center gap-2">
                <FileCode2 className="h-4 w-4 text-indigo-500" />
                Render Context Snapshot
              </div>
            </div>
            <div className="p-5">
              <pre className="min-h-[640px] overflow-auto rounded-[2rem] border border-slate-200 bg-slate-950 p-5 text-xs leading-6 text-slate-100">
                {prettyContext ?? 'No render context captured.'}
              </pre>
            </div>
            <div className="border-t border-slate-200 p-5">
              <div className="mb-3 text-sm font-semibold text-slate-900">Audit Trail</div>
              <div className="space-y-3">
                {(document.auditTrail ?? []).length ? (
                  document.auditTrail?.map((entry) => (
                    <div key={entry.id} className="rounded-[1.5rem] border border-slate-200 bg-slate-50/70 px-4 py-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-medium text-slate-900">{entry.action}</div>
                        <div className="text-xs text-slate-500">{new Date(entry.createdAt).toLocaleString('th-TH')}</div>
                      </div>
                      <div className="mt-1 text-xs text-slate-500">Actor: {entry.userName}</div>
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-slate-500">No audit entries yet.</div>
                )}
              </div>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
