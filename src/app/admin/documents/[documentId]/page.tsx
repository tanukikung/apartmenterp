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

  const statusColors: Record<string, string> = {
    DRAFT: 'bg-white/5 text-white/60 border-white/10',
    GENERATED: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
    SENT: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    FAILED: 'bg-red-500/10 text-red-400 border-red-500/30',
  };

  return (
    <main className="space-y-6">
      {/* Page header */}
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-[hsl(225,25%,6%)] via-[hsl(225,25%,8%)] to-[hsl(225,25%,6%)] px-6 py-5 shadow-xl shadow-black/30">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(99,102,241,0.15),_transparent_60%)]" />
        <div className="absolute -top-24 -right-24 h-48 w-48 rounded-full bg-primary/5 blur-3xl" />
        <div className="relative flex items-center gap-4">
          <Link href="/admin/documents" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 backdrop-blur-md transition-all hover:bg-white/10 hover:scale-105 active:scale-[0.98]">
            <ArrowLeft className="h-4 w-4 text-white/70" />
          </Link>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-white">{document?.title ?? 'รายละเอียดเอกสาร'}</h1>
            <p className="text-xs text-white/50">ไฟล์ที่สร้างแล้ว ข้อมูลเทมเพลตที่ใช้ และไฟล์ที่ดาวน์โหลดได้</p>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-4">
          {document?.files.some((f) => f.role === 'PDF') && document.status !== 'SENT' && (
            <button type="button" className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 backdrop-blur-md px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-white/10 hover:scale-105 active:scale-[0.98]" onClick={() => void sendDocument()} disabled={working}>
              <Send className="h-4 w-4" />
              {working ? 'กำลังส่ง...' : 'ส่ง PDF'}
            </button>
          )}
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 backdrop-blur-md px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-white/10 hover:scale-105 active:scale-[0.98]"
            onClick={() => setConfirmOpen(true)}
            disabled={working || document?.status === 'SENT'}
            title={document?.status === 'SENT' ? 'ไม่สามารถสร้างเอกสารใหม่ได้ เอกสารถูกส่งแล้ว กรุณาสร้างเอกสารใหม่แทน' : undefined}
          >
            <RotateCcw className="h-4 w-4" />
            {working ? 'กำลังสร้างใหม่...' : 'สร้างใหม่'}
          </button>
        </div>
      </div>

      {message ? <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 backdrop-blur-sm px-5 py-4 text-sm text-emerald-400">{message}</div> : null}
      {error ? <div className="rounded-xl border border-red-500/20 bg-red-500/10 backdrop-blur-sm px-5 py-4 text-sm text-red-400">{error}</div> : null}

      {loading ? (
        <div className="py-16 text-center text-white/40">กำลังโหลดเอกสาร...</div>
      ) : !document ? null : (
        <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
          {/* Left column */}
          <div className="space-y-6">
            {/* Metadata card */}
            <div className="rounded-2xl border border-white/10 bg-[hsl(225,25%,6%)] shadow-xl shadow-black/20 overflow-hidden">
              <div className="px-5 py-4 border-b border-white/5">
                <div className="text-sm font-semibold text-white flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                  ข้อมูลเมตา
                </div>
              </div>
              <div className="space-y-4 p-5 text-sm">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/30">สถานะ</div>
                  <div className="mt-1">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold border ${statusColors[document.status] ?? 'bg-white/5 text-white/60 border-white/10'}`}>
                      {document.status}
                    </span>
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/30">ประเภท</div>
                  <div className="mt-1 text-white/80">{document.documentType.replace(/_/g, ' ')}</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/30">เทมเพลต</div>
                  <div className="mt-1 text-white/80">{document.template.name} · v{document.templateVersion.version}</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/30">ห้อง</div>
                  <div className="mt-1 text-white/80">
                    {document.room.roomNumber ?? document.room.roomNo ?? '-'} · Floor {document.room.floorNumber ?? '—'}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/30">ผู้เช่า</div>
                  <div className="mt-1 text-white/80">{document.tenantName ?? 'No tenant linked'}</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/30">สร้างเมื่อ</div>
                  <div className="mt-1 text-white/80"><ClientOnly fallback="-">{new Date(document.generatedAt).toLocaleString('th-TH')}</ClientOnly></div>
                </div>
              </div>
            </div>

            {/* Files card */}
            <div className="rounded-2xl border border-white/10 bg-[hsl(225,25%,6%)] shadow-xl shadow-black/20 overflow-hidden">
              <div className="px-5 py-4 border-b border-white/5">
                <div className="text-sm font-semibold text-white flex items-center gap-2">
                  <FolderOutput className="h-4 w-4 text-primary" />
                  ไฟล์ที่สร้าง
                </div>
              </div>
              <div className="space-y-3 p-5">
                {document.files.map((file) => (
                  <div key={file.id} className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm px-4 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium text-white">{file.fileName}</div>
                        <div className="mt-1 text-xs text-white/40">
                          {file.role} · {file.mimeType} · {(file.size / 1024).toFixed(1)} KB
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <a href={file.url} className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 backdrop-blur-md px-3 py-1.5 text-xs font-medium text-white/70 shadow-sm transition-all hover:bg-white/10 hover:scale-105 active:scale-[0.98]">
                          <Download className="h-3.5 w-3.5" />
                        </a>
                        <a href={file.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 backdrop-blur-md px-3 py-1.5 text-xs font-medium text-white/70 shadow-sm transition-all hover:bg-white/10 hover:scale-105 active:scale-[0.98]">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right column: context + audit trail */}
          <div className="rounded-2xl border border-white/10 bg-[hsl(225,25%,6%)] shadow-xl shadow-black/20 overflow-hidden">
            <div className="px-5 py-4 border-b border-white/5">
              <div className="text-sm font-semibold text-white flex items-center gap-2">
                <FileCode2 className="h-4 w-4 text-primary" />
                บริบทการสร้าง
              </div>
            </div>
            <div className="p-5">
              <pre className="min-h-[640px] overflow-auto rounded-2xl border border-white/10 bg-[hsl(225,25%,4%)] p-5 text-xs leading-6 text-white/70 font-mono">
                {prettyContext ?? 'ไม่มีบริบทการสร้าง'}
              </pre>
            </div>
            <div className="border-t border-white/5 p-5">
              <div className="mb-3 text-sm font-semibold text-white">ประวัติการดำเนินการ</div>
              <div className="space-y-3">
                {(document.auditTrail ?? []).length ? (
                  document.auditTrail?.map((entry) => (
                    <div key={entry.id} className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm px-4 py-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-medium text-white">{entry.action}</div>
                        <div className="text-xs text-white/40"><ClientOnly fallback="-">{new Date(entry.createdAt).toLocaleString('th-TH')}</ClientOnly></div>
                      </div>
                      <div className="mt-1 text-xs text-white/40">ผู้ดำเนินการ: {entry.userName}</div>
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-white/30">ยังไม่มีประวัติการดำเนินการ</div>
                )}
              </div>
            </div>
          </div>
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
