'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ClientOnly } from '@/components/ui/ClientOnly';
import {
  ArrowLeft,
  Download,
  ExternalLink,
  FileCode2,
  FolderOutput,
  RotateCcw,
  Send,
} from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

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
  room: { id?: string; roomNo?: string; roomNumber?: string; floorNumber?: number | null };
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
  const router = useRouter();

  // Guard: /admin/documents/create should go to the generator, not the detail view
  useEffect(() => {
    if (params.documentId === 'create') {
      router.replace('/admin/documents/generate');
    }
  }, [params.documentId, router]);

  const [document, setDocument] = useState<GeneratedDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/documents/${params.documentId}`, { cache: 'no-store' });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error?.message ?? 'ไม่สามารถโหลดเอกสาร');
      }
      setDocument(json.data as GeneratedDocument);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'ไม่สามารถโหลดเอกสาร');
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
        throw new Error(json.error?.message ?? 'ไม่สามารถสร้างเอกสารใหม่ได้');
      }
      setMessage('สร้างเอกสารใหม่เสร็จสิ้น สร้างเวอร์ชันใหม่แล้ว');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'เกิดข้อผิดพลาดในการสร้างเอกสาร');
    } finally {
      setWorking(false);
    }
  }

  async function sendDocument() {
    setWorking(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/documents/${params.documentId}/send`, {
        method: 'POST',
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error?.message ?? 'ไม่สามารถส่งเอกสารได้');
      }
      setMessage('เอกสารถูกส่งผ่าน LINE แล้ว');
      await load();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'เกิดข้อผิดพลาดในการส่งเอกสาร');
    } finally {
      setWorking(false);
    }
  }

  const prettyContext = useMemo(() => {
    return document?.renderContext ? JSON.stringify(document.renderContext, null, 2) : null;
  }, [document]);

  return (
    <main className="space-y-6">
      <section className="rounded-2xl border border-[var(--outline-variant)]/10 bg-gradient-to-br from-[var(--primary-container)] to-[var(--primary)] px-6 py-5">
        <div className="flex items-center gap-4">
          <Link href="/admin/documents" className="inline-flex items-center gap-2 rounded-lg border border-[var(--outline)] bg-[var(--surface-container-lowest)] px-4 py-2 text-sm font-medium text-[var(--on-surface)] shadow-sm transition-colors hover:bg-[var(--surface-container)]">
            <ArrowLeft className="h-4 w-4" />
            เอกสาร
          </Link>
          <div>
            <h1 className="text-xl font-semibold text-[var(--on-primary)]">{document?.title ?? 'รายละเอียดเอกสาร'}</h1>
            <p className="text-sm text-[var(--on-primary)]/80">
              ไฟล์ที่สร้างแล้ว ข้อมูลเทมเพลตที่ใช้ และไฟล์ที่ดาวน์โหลดได้
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-4">
          {document?.files.some((f) => f.role === 'PDF') && document.status !== 'SENT' && (
            <button type="button" className="inline-flex items-center gap-2 rounded-lg border border-[var(--outline)] bg-[var(--surface-container-lowest)] px-4 py-2 text-sm font-medium text-[var(--on-surface)] shadow-sm transition-colors hover:bg-[var(--surface-container)]" onClick={() => void sendDocument()} disabled={working}>
              <Send className="h-4 w-4" />
              {working ? 'กำลังส่ง...' : 'ส่ง PDF'}
            </button>
          )}
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--outline)] bg-[var(--surface-container-lowest)] px-4 py-2 text-sm font-medium text-[var(--on-surface)] shadow-sm transition-colors hover:bg-[var(--surface-container)]"
            onClick={() => setConfirmOpen(true)}
            disabled={working || document?.status === 'SENT'}
            title={document?.status === 'SENT' ? 'ไม่สามารถสร้างเอกสารใหม่ได้ เอกสารถูกส่งแล้ว กรุณาสร้างเอกสารใหม่แทน' : undefined}
          >
            <RotateCcw className="h-4 w-4" />
            {working ? 'กำลังสร้างใหม่...' : 'สร้างใหม่'}
          </button>
        </div>
      </section>

      {message ? <div className="auth-alert auth-alert-success">{message}</div> : null}
      {error ? <div className="auth-alert auth-alert-error">{error}</div> : null}

      {loading ? (
        <div className="py-16 text-center text-slate-500">กำลังโหลดเอกสาร...</div>
      ) : !document ? null : (
        <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
          <div className="space-y-6">
            <section className="bg-[var(--surface-container-lowest)] rounded-xl border border-[var(--outline-variant)]/10">
              <div className="px-5 py-4 border-b border-[var(--outline-variant)]">
                <div className="text-sm font-semibold text-[var(--primary)]">ข้อมูลเมตา</div>
              </div>
              <div className="space-y-4 p-5 text-sm text-[var(--on-surface-variant)]">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--on-surface-variant)]">สถานะ</div>
                  <div className="mt-1"><span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold bg-[var(--surface-container)] text-[var(--on-surface-variant)]">{document.status}</span></div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--on-surface-variant)]">ประเภท</div>
                  <div className="mt-1 text-[var(--on-surface)]">{document.documentType.replace(/_/g, ' ')}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--on-surface-variant)]">เทมเพลต</div>
                  <div className="mt-1 text-[var(--on-surface)]">{document.template.name} · v{document.templateVersion.version}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--on-surface-variant)]">ห้อง</div>
                  <div className="mt-1 text-[var(--on-surface)]">
                    {document.room.roomNumber ?? document.room.roomNo ?? '-'} · Floor {document.room.floorNumber ?? '—'}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--on-surface-variant)]">ผู้เช่า</div>
                  <div className="mt-1 text-[var(--on-surface)]">{document.tenantName ?? 'No tenant linked'}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--on-surface-variant)]">สร้างเมื่อ</div>
                  <div className="mt-1 text-[var(--on-surface)]"><ClientOnly fallback="-">{new Date(document.generatedAt).toLocaleString('th-TH')}</ClientOnly></div>
                </div>
              </div>
            </section>

            <section className="bg-[var(--surface-container-lowest)] rounded-xl border border-[var(--outline-variant)]/10">
              <div className="px-5 py-4 border-b border-[var(--outline-variant)]">
                <div className="text-sm font-semibold text-[var(--primary)] flex items-center gap-2">
                  <FolderOutput className="h-4 w-4 text-[var(--primary)]" />
                  ไฟล์ที่สร้าง
                </div>
              </div>
              <div className="space-y-3 p-5">
                {document.files.map((file) => (
                  <div key={file.id} className="rounded-xl border border-[var(--outline-variant)]/10 bg-[var(--surface-container)] px-4 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium text-[var(--on-surface)]">{file.fileName}</div>
                        <div className="mt-1 text-xs text-[var(--on-surface-variant)]">
                          {file.role} · {file.mimeType} · {(file.size / 1024).toFixed(1)} KB
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <a href={file.url} className="inline-flex items-center gap-1 rounded-lg border border-[var(--outline)] bg-[var(--surface-container-lowest)] px-3 py-1.5 text-xs font-medium text-[var(--on-surface)] shadow-sm transition-colors hover:bg-[var(--surface-container)]">
                          <Download className="h-3.5 w-3.5" />
                        </a>
                        <a href={file.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-[var(--outline)] bg-[var(--surface-container-lowest)] px-3 py-1.5 text-xs font-medium text-[var(--on-surface)] shadow-sm transition-colors hover:bg-[var(--surface-container)]">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <section className="bg-[var(--surface-container-lowest)] rounded-xl border border-[var(--outline-variant)]/10 overflow-hidden">
            <div className="px-5 py-4 border-b border-[var(--outline-variant)]">
              <div className="text-sm font-semibold text-[var(--primary)] flex items-center gap-2">
                <FileCode2 className="h-4 w-4 text-[var(--primary)]" />
                บริบทการสร้าง
              </div>
            </div>
            <div className="p-5">
              <pre className="min-h-[640px] overflow-auto rounded-[2rem] border border-slate-200 bg-slate-950 p-5 text-xs leading-6 text-slate-100">
                {prettyContext ?? 'ไม่มีบริบทการสร้าง'}
              </pre>
            </div>
            <div className="border-t border-slate-200 p-5">
              <div className="mb-3 text-sm font-semibold text-slate-900">ประวัติการดำเนินการ</div>
              <div className="space-y-3">
                {(document.auditTrail ?? []).length ? (
                  document.auditTrail?.map((entry) => (
                    <div key={entry.id} className="rounded-[1.5rem] border border-slate-200 bg-slate-50/70 px-4 py-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-medium text-slate-900">{entry.action}</div>
                        <div className="text-xs text-slate-500"><ClientOnly fallback="-">{new Date(entry.createdAt).toLocaleString('th-TH')}</ClientOnly></div>
                      </div>
                      <div className="mt-1 text-xs text-slate-500">ผู้ดำเนินการ: {entry.userName}</div>
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-slate-500">ยังไม่มีประวัติการดำเนินการ</div>
                )}
              </div>
            </div>
          </section>
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => { setConfirmOpen(false); void regenerate(); }}
        title="สร้างเอกสารใหม่"
        description="จะสร้างเอกสารเวอร์ชันใหม่จากเทมเพลตเดิม ดำเนินการต่อหรือไม่?"
        confirmLabel="สร้างใหม่"
        cancelLabel="ยกเลิก"
      />
    </main>
  );
}
