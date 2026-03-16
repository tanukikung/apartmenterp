'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ExternalLink, FileOutput, FolderOpen, Layers3 } from 'lucide-react';

type GeneratedDocument = {
  id: string;
  title: string;
  subject: string | null;
  status: string;
  documentType: string;
  documentVersion: number;
  year: number | null;
  month: number | null;
  generatedAt: string;
  template: { id: string; name: string };
  templateVersion: { id: string; version: number; label: string | null };
  room: { id: string; roomNumber: string; floorNumber: number | null };
  tenantName: string | null;
  files: Array<{ role: string; format: string; url: string }>;
};

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<GeneratedDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch('/api/documents?pageSize=100', { cache: 'no-store' });
        const json = await response.json();
        if (!response.ok || !json.success) {
          throw new Error(json.error?.message ?? 'Unable to load documents');
        }
        setDocuments(json.data?.data ?? []);
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : 'Unable to load documents');
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
          <h1 className="admin-page-title">Generated Documents</h1>
          <p className="admin-page-subtitle">
            Saved per-room outputs with template lineage, version history, and downloadable files.
          </p>
        </div>
        <div className="admin-toolbar">
          <Link href="/admin/documents/generate" className="admin-button admin-button-primary">
            Generate Documents
          </Link>
          <Link href="/admin/templates" className="admin-button">
            Templates
          </Link>
        </div>
      </section>

      {error ? <div className="auth-alert auth-alert-error">{error}</div> : null}

      <section className="admin-card overflow-hidden">
        <div className="admin-card-header">
          <div className="admin-card-title flex items-center gap-2">
            <Layers3 className="h-4 w-4 text-indigo-500" />
            Document Registry
          </div>
          <span className="admin-badge">{documents.length} documents</span>
        </div>
        <div className="overflow-auto">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Type</th>
                <th>Room</th>
                <th>Template</th>
                <th>Version</th>
                <th>Generated</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-500">
                    Loading generated documents...
                  </td>
                </tr>
              ) : documents.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-500">
                    No generated documents yet.
                  </td>
                </tr>
              ) : (
                documents.map((document) => (
                  <tr key={document.id}>
                    <td>
                      <div className="font-semibold text-slate-900">{document.title}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        {document.year && document.month ? `${document.year}-${String(document.month).padStart(2, '0')}` : 'No billing period'}
                      </div>
                    </td>
                    <td>
                      <span className="admin-badge">{document.documentType.replace(/_/g, ' ')}</span>
                    </td>
                    <td>
                      <div className="font-semibold text-slate-900">{document.room.roomNumber}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        Floor {document.room.floorNumber ?? '—'} · {document.tenantName ?? 'No tenant'}
                      </div>
                    </td>
                    <td>
                      <div className="font-medium text-slate-900">{document.template.name}</div>
                      <div className="mt-1 text-xs text-slate-500">Template version v{document.templateVersion.version}</div>
                    </td>
                    <td>Doc v{document.documentVersion}</td>
                    <td>{new Date(document.generatedAt).toLocaleString('th-TH')}</td>
                    <td>
                      <span className={`admin-badge ${
                        document.status === 'GENERATED' || document.status === 'EXPORTED'
                          ? 'admin-status-good'
                          : document.status === 'FAILED'
                            ? 'admin-status-bad'
                            : 'admin-status-warn'
                      }`}
                      >
                        {document.status}
                      </span>
                    </td>
                    <td>
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/admin/documents/${document.id}`} className="admin-button flex items-center gap-1 text-xs">
                          <FolderOpen className="h-3.5 w-3.5" />
                          Detail
                        </Link>
                        <a href={`/api/documents/${document.id}/pdf`} target="_blank" rel="noreferrer" className="admin-button flex items-center gap-1 text-xs">
                          <ExternalLink className="h-3.5 w-3.5" />
                          PDF
                        </a>
                        <a href={`/api/documents/${document.id}/download?format=docx`} className="admin-button flex items-center gap-1 text-xs">
                          <FileOutput className="h-3.5 w-3.5" />
                          DOCX
                        </a>
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
