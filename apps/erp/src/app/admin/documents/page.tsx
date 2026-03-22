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
          throw new Error(json.error?.message ?? 'ไม่สามารถโหลดเอกสาร');
        }
        setDocuments(json.data?.data ?? []);
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : 'ไม่สามารถโหลดเอกสาร');
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, []);

  return (
    <main className="space-y-6">
      <section className="rounded-2xl border border-outline-variant/10 bg-gradient-to-br from-primary-container to-primary px-6 py-5">
        <div>
          <h1 className="text-xl font-semibold text-on-primary">เอกสารที่สร้างแล้ว</h1>
          <p className="text-sm text-on-primary/80">
            เอกสารที่บันทึกแยกตามห้องพร้อมข้อมูลต้นแบบเทมเพลต ประวัติเวอร์ชัน และไฟล์ที่ดาวน์โหลดได้
          </p>
        </div>
        <div className="flex items-center gap-2 mt-4">
          <Link href="/admin/documents/generate" className="inline-flex items-center gap-2 rounded-lg border border-outline bg-primary text-on-primary hover:bg-primary/90 px-4 py-2 text-sm font-medium shadow-sm transition-colors">
            สร้างเอกสาร
          </Link>
          <Link href="/admin/templates" className="inline-flex items-center gap-2 rounded-lg border border-outline bg-surface-container-lowest px-4 py-2 text-sm font-medium text-on-surface shadow-sm transition-colors hover:bg-surface-container">
            เทมเพลต
          </Link>
        </div>
      </section>

      {error ? <div className="auth-alert auth-alert-error">{error}</div> : null}

      <section className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 overflow-hidden">
        <div className="px-5 py-4 border-b border-outline-variant">
          <div className="text-sm font-semibold text-primary flex items-center gap-2">
            <Layers3 className="h-4 w-4 text-primary" />
            ทะเบียนเอกสาร
          </div>
          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold bg-surface-container text-on-surface-variant mt-1">{documents.length} เอกสาร</span>
        </div>
        <div className="overflow-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-surface-container">
              <tr>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">ชื่อเรื่อง</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">ประเภท</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">ห้อง</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">เทมเพลต</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">เวอร์ชัน</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">สร้างเมื่อ</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">สถานะ</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">การดำเนินการ</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-500">
                    กำลังโหลดเอกสารที่สร้างแล้ว...
                  </td>
                </tr>
              ) : documents.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-500">
                    ไม่พบเอกสารที่สร้างแล้ว
                  </td>
                </tr>
              ) : (
                documents.map((document) => (
                  <tr key={document.id}>
                    <td>
                      <div className="font-semibold text-slate-900">{document.title}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        {document.year && document.month ? `${document.year}-${String(document.month).padStart(2, '0')}` : 'ไม่มีงวดการเรียกเก็บ'}
                      </div>
                    </td>
                    <td>
                      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold bg-surface-container text-on-surface-variant">{document.documentType.replace(/_/g, ' ')}</span>
                    </td>
                    <td>
                      <div className="font-semibold text-on-surface">{document.room.roomNumber}</div>
                      <div className="mt-1 text-xs text-on-surface-variant">
                        ชั้น {document.room.floorNumber ?? '—'} · {document.tenantName ?? 'ไม่มีผู้เช่า'}
                      </div>
                    </td>
                    <td>
                      <div className="font-medium text-on-surface">{document.template.name}</div>
                      <div className="mt-1 text-xs text-on-surface-variant">เวอร์ชันเทมเพลต v{document.templateVersion.version}</div>
                    </td>
                    <td>Doc v{document.documentVersion}</td>
                    <td>{new Date(document.generatedAt).toLocaleString('th-TH')}</td>
                    <td>
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        document.status === 'GENERATED' || document.status === 'EXPORTED'
                          ? 'bg-tertiary-container text-on-tertiary-container'
                          : document.status === 'FAILED'
                            ? 'bg-error-container text-on-error-container'
                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}
                      >
                        {document.status}
                      </span>
                    </td>
                    <td>
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/admin/documents/${document.id}`} className="inline-flex items-center gap-1 rounded-lg border border-outline bg-surface-container-lowest px-3 py-1.5 text-xs font-medium text-on-surface shadow-sm transition-colors hover:bg-surface-container">
                          <FolderOpen className="h-3.5 w-3.5" />
                          รายละเอียด
                        </Link>
                        <a href={`/api/documents/${document.id}/pdf`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-outline bg-surface-container-lowest px-3 py-1.5 text-xs font-medium text-on-surface shadow-sm transition-colors hover:bg-surface-container">
                          <ExternalLink className="h-3.5 w-3.5" />
                          PDF
                        </a>
                        <a href={`/api/documents/${document.id}/download?format=docx`} className="inline-flex items-center gap-1 rounded-lg border border-outline bg-surface-container-lowest px-3 py-1.5 text-xs font-medium text-on-surface shadow-sm transition-colors hover:bg-surface-container">
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
