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
    <main className="space-y-6">
      <section className="rounded-2xl border border-outline-variant/10 bg-gradient-to-br from-primary-container to-primary px-6 py-5">
        <div className="flex items-center gap-4">
          <Link href="/admin/documents" className="inline-flex items-center gap-2 rounded-lg border border-outline bg-surface-container-lowest px-4 py-2 text-sm font-medium text-on-surface shadow-sm transition-colors hover:bg-surface-container">
            <ArrowLeft className="h-4 w-4" />
            Documents
          </Link>
          <div>
            <h1 className="text-xl font-semibold text-on-primary">{document?.title ?? 'Document Detail'}</h1>
            <p className="text-sm text-on-primary/80">
              Generated output, template lineage, source context, and downloadable files.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-4">
          <button type="button" className="inline-flex items-center gap-2 rounded-lg border border-outline bg-surface-container-lowest px-4 py-2 text-sm font-medium text-on-surface shadow-sm transition-colors hover:bg-surface-container" onClick={() => void regenerate()} disabled={working}>
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
            <section className="bg-surface-container-lowest rounded-xl border border-outline-variant/10">
              <div className="px-5 py-4 border-b border-outline-variant">
                <div className="text-sm font-semibold text-primary">Metadata</div>
              </div>
              <div className="space-y-4 p-5 text-sm text-on-surface-variant">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-on-surface-variant">Status</div>
                  <div className="mt-1"><span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold bg-surface-container text-on-surface-variant">{document.status}</span></div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-on-surface-variant">Type</div>
                  <div className="mt-1 text-on-surface">{document.documentType.replace(/_/g, ' ')}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-on-surface-variant">Template</div>
                  <div className="mt-1 text-on-surface">{document.template.name} · v{document.templateVersion.version}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-on-surface-variant">Room</div>
                  <div className="mt-1 text-on-surface">
                    {document.room.roomNumber} · Floor {document.room.floorNumber ?? '—'}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-on-surface-variant">Tenant</div>
                  <div className="mt-1 text-on-surface">{document.tenantName ?? 'No tenant linked'}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-on-surface-variant">Generated</div>
                  <div className="mt-1 text-on-surface">{new Date(document.generatedAt).toLocaleString('th-TH')}</div>
                </div>
              </div>
            </section>

            <section className="bg-surface-container-lowest rounded-xl border border-outline-variant/10">
              <div className="px-5 py-4 border-b border-outline-variant">
                <div className="text-sm font-semibold text-primary flex items-center gap-2">
                  <FolderOutput className="h-4 w-4 text-primary" />
                  Output Files
                </div>
              </div>
              <div className="space-y-3 p-5">
                {document.files.map((file) => (
                  <div key={file.id} className="rounded-xl border border-outline-variant/10 bg-surface-container px-4 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium text-on-surface">{file.fileName}</div>
                        <div className="mt-1 text-xs text-on-surface-variant">
                          {file.role} · {file.mimeType} · {(file.size / 1024).toFixed(1)} KB
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <a href={file.url} className="inline-flex items-center gap-1 rounded-lg border border-outline bg-surface-container-lowest px-3 py-1.5 text-xs font-medium text-on-surface shadow-sm transition-colors hover:bg-surface-container">
                          <Download className="h-3.5 w-3.5" />
                        </a>
                        <a href={file.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-outline bg-surface-container-lowest px-3 py-1.5 text-xs font-medium text-on-surface shadow-sm transition-colors hover:bg-surface-container">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <section className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 overflow-hidden">
            <div className="px-5 py-4 border-b border-outline-variant">
              <div className="text-sm font-semibold text-primary flex items-center gap-2">
                <FileCode2 className="h-4 w-4 text-primary" />
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
