'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ClientOnly } from '@/components/ui/ClientOnly';
import { ExternalLink, FileOutput, FolderOpen, Layers3, Search, Send, Trash2, FileX } from 'lucide-react';
import { useToast } from '@/components/providers/ToastProvider';
import { SkeletonTable } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { BulkActions } from '@/components/ui/bulk-actions';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useUrlState } from '@/hooks/useUrlState';

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
  room: { id?: string; roomNo?: string; roomNumber?: string; floorNumber?: number | null };
  tenantName: string | null;
  files: Array<{ role: string; format: string; url: string }>;
};

async function fetchDocuments(q: string): Promise<{ data: GeneratedDocument[] }> {
  const params = new URLSearchParams({ pageSize: '100' });
  if (q) params.set('q', q);
  const res = await fetch(`/api/documents?${params.toString()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch documents');
  const json = await res.json();
  if (!json.success) throw new Error(json.error?.message ?? 'Request failed');
  return json.data;
}

export default function DocumentsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [sendingIds, setSendingIds] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<GeneratedDocument | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkSending, setBulkSending] = useState(false);

  const [search, setSearch] = useUrlState('q', '');
  const [searchDebounced, setSearchDebounced] = useState(search);
  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data: docsData, isLoading, error: fetchError } = useQuery<{ data: GeneratedDocument[] }>({
    queryKey: ['documents', searchDebounced],
    queryFn: () => fetchDocuments(searchDebounced),
  });

  const documents: GeneratedDocument[] = docsData?.data ?? [];

  async function sendDocument(documentId: string) {
    setSendingIds((prev) => new Set(prev).add(documentId));
    try {
      const response = await fetch(`/api/documents/${documentId}/send`, { method: 'POST' });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error?.message ?? 'ไม่สามารถส่งเอกสาร');
      }
      toast.success('ส่งเอกสารแล้ว');
      void queryClient.invalidateQueries({ queryKey: ['documents'] });
    } catch (nextError) {
      toast.error(nextError instanceof Error ? nextError.message : 'ไม่สามารถส่งเอกสาร');
    } finally {
      setSendingIds((prev) => {
        const next = new Set(prev);
        next.delete(documentId);
        return next;
      });
    }
  }

  async function deleteDocument() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const response = await fetch(`/api/documents/${deleteTarget.id}`, { method: 'DELETE' });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error?.message ?? 'ไม่สามารถลบเอกสาร');
      }
      toast.success('ลบเอกสารแล้ว');
      setDeleteTarget(null);
      void queryClient.invalidateQueries({ queryKey: ['documents'] });
    } catch (nextError) {
      toast.error(nextError instanceof Error ? nextError.message : 'ไม่สามารถลบเอกสาร');
    } finally {
      setDeleting(false);
    }
  }

  async function bulkSend() {
    if (selected.size === 0) return;
    setBulkSending(true);
    const ids = Array.from(selected).filter((id) => {
      const doc = documents.find((d) => d.id === id);
      return doc && doc.status !== 'SENT' && doc.files.some((f) => f.role === 'PDF');
    });
    let okCount = 0;
    let failCount = 0;
    for (const id of ids) {
      try {
        const res = await fetch(`/api/documents/${id}/send`, { method: 'POST' });
        const json = await res.json();
        if (res.ok && json.success) okCount++;
        else failCount++;
      } catch {
        failCount++;
      }
    }
    setBulkSending(false);
    setSelected(new Set());
    if (okCount > 0) toast.success(`ส่งเอกสารแล้ว ${okCount} รายการ`);
    if (failCount > 0) toast.error(`ส่งไม่สำเร็จ ${failCount} รายการ`);
    void queryClient.invalidateQueries({ queryKey: ['documents'] });
  }

  async function bulkDelete() {
    if (selected.size === 0) return;
    setBulkDeleting(true);
    const ids = Array.from(selected);
    let okCount = 0;
    let failCount = 0;
    for (const id of ids) {
      try {
        const res = await fetch(`/api/documents/${id}`, { method: 'DELETE' });
        const json = await res.json();
        if (res.ok && json.success) okCount++;
        else failCount++;
      } catch {
        failCount++;
      }
    }
    setBulkDeleting(false);
    setBulkDeleteOpen(false);
    setSelected(new Set());
    if (okCount > 0) toast.success(`ลบเอกสารแล้ว ${okCount} รายการ`);
    if (failCount > 0) toast.error(`ลบไม่สำเร็จ ${failCount} รายการ`);
    void queryClient.invalidateQueries({ queryKey: ['documents'] });
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === documents.length) setSelected(new Set());
    else setSelected(new Set(documents.map((d) => d.id)));
  }

  return (
    <main className="space-y-6">
      {/* Hero Header */}
      <section className="relative overflow-hidden rounded-2xl border border-[hsl(var([hsl(var(--color-border))]))]  shadow-[0_4px_16px_rgba(0,0,0,0.08)] px-6 py-5">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 via-transparent to-violet-500/10 pointer-events-none" />
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="relative flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-500/20 border border-blue-500/30">
              <FolderOpen className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-[hsl(var(--card-foreground))]">เอกสารที่สร้างแล้ว</h1>
              <p className="text-sm text-[hsl(var(--on-surface-variant))] mt-0.5">
                เอกสารที่บันทึกแยกตามห้องพร้อมข้อมูลต้นแบบเทมเพลต ประวัติเวอร์ชัน และไฟล์ที่ดาวน์โหลดได้
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/admin/documents/generate"
              className="inline-flex items-center gap-2 rounded-xl border border-blue-500/30 bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 hover:border-blue-500/50 px-4 py-2 text-sm font-medium shadow-sm transition-all duration-200 active:scale-[0.98]"
            >
              สร้างเอกสาร
            </Link>
            <Link
              href="/admin/templates"
              className="inline-flex items-center gap-2 rounded-xl border border-[hsl(var([hsl(var(--color-border))]))]  text-[hsl(var(--card-foreground))] px-4 py-2 text-sm font-medium shadow-sm transition-all duration-200 active:scale-[0.98]"
            >
              เทมเพลต
            </Link>
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--on-surface-variant))]" aria-hidden="true" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ค้นหาเอกสาร, ห้อง, หรือผู้เช่า..."
                aria-label="ค้นหาเอกสาร"
                className="w-full rounded-xl border border-[hsl(var([hsl(var(--color-border))]))]  py-2.5 pl-9 pr-4 text-sm text-[hsl(var(--card-foreground))] placeholder:text-[hsl(var(--on-surface-variant))]/50 focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all duration-200"
              />
            </div>
          </div>
        </div>
      </section>

      {fetchError ? (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-600">
          {fetchError instanceof Error ? fetchError.message : String(fetchError)}
        </div>
      ) : null}

      <BulkActions
        count={selected.size}
        onClear={() => setSelected(new Set())}
        actions={[
          {
            label: bulkSending ? 'กำลังส่ง...' : 'ส่ง PDF ที่เลือก',
            icon: <Send className="h-3.5 w-3.5" />,
            onClick: () => void bulkSend(),
          },
          {
            label: 'ลบที่เลือก',
            variant: 'danger',
            icon: <Trash2 className="h-3.5 w-3.5" />,
            onClick: () => setBulkDeleteOpen(true),
          },
        ]}
      />

      <ConfirmDialog
        open={bulkDeleteOpen}
        title="ยืนยันการลบเอกสาร"
        description={`คุณต้องการลบเอกสาร ${selected.size} รายการใช่หรือไม่? การดำเนินการนี้ไม่สามารถย้อนกลับได้`}
        confirmLabel={bulkDeleting ? 'กำลังลบ...' : 'ลบทั้งหมด'}
        cancelLabel="ยกเลิก"
        dangerous
        loading={bulkDeleting}
        onConfirm={() => void bulkDelete()}
        onCancel={() => setBulkDeleteOpen(false)}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="ยืนยันการลบเอกสาร"
        description={deleteTarget ? `คุณต้องการลบเอกสาร "${deleteTarget.title}" หรือไม่? การดำเนินการนี้ไม่สามารถย้อนกลับได้` : ''}
        confirmLabel={deleting ? 'กำลังลบ...' : 'ลบเอกสาร'}
        cancelLabel="ยกเลิก"
        dangerous
        loading={deleting}
        onConfirm={() => void deleteDocument()}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Main Table Card */}
      <section className="rounded-2xl border border-[hsl(var([hsl(var(--color-border))]))]  overflow-hidden shadow-[0_4px_16px_rgba(0,0,0,0.08)]">
        <div className="px-5 py-4 border-b border-[hsl(var([hsl(var(--color-border))]))]">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-[hsl(var(--card-foreground))]">
              <Layers3 className="h-4 w-4 text-blue-600" />
              ทะเบียนเอกสาร
            </div>
            <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold  text-[hsl(var(--on-surface-variant))]">
              {documents.length} เอกสาร
            </span>
          </div>
        </div>
        {isLoading ? (
          <div className="p-5">
            <SkeletonTable rows={6} />
          </div>
        ) : documents.length === 0 ? (
          <EmptyState
            icon={<FileX className="h-7 w-7" />}
            title="ไม่พบเอกสารที่สร้างแล้ว"
            description={searchDebounced ? 'ลองปรับคำค้นหาหรือล้างตัวกรองเพื่อดูเอกสารทั้งหมด' : 'สร้างเอกสารใหม่จากเทมเพลตเพื่อเริ่มต้น'}
            action={searchDebounced ? { label: 'ล้างคำค้นหา', onClick: () => setSearch('') } : { label: 'สร้างเอกสาร', href: '/admin/documents/generate' }}
          />
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-[hsl(var([hsl(var(--color-border))]))]">
                  <th className="px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      aria-label="เลือกทั้งหมด"
                      checked={documents.length > 0 && selected.size === documents.length}
                      onChange={toggleAll}
                      className="rounded border-[hsl(var([hsl(var(--color-border))]))] accent-blue-500"
                    />
                  </th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))]">ชื่อเรื่อง</th>
                  <th className="hidden md:table-cell px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))]">ประเภท</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))]">ห้อง</th>
                  <th className="hidden lg:table-cell px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))]">เทมเพลต</th>
                  <th className="hidden lg:table-cell px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))]">เวอร์ชัน</th>
                  <th className="hidden md:table-cell px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))]">สร้างเมื่อ</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))]">สถานะ</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))]">การดำเนินการ</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((document) => (
                  <tr key={document.id} className="border-t border-[hsl(var([hsl(var(--color-border))]))] hover:bg-[hsl(var(--card))]/50 transition-colors duration-150 group">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        aria-label={`เลือก ${document.title}`}
                        checked={selected.has(document.id)}
                        onChange={() => toggleOne(document.id)}
                        className="rounded border-[hsl(var([hsl(var(--color-border))]))] accent-blue-500"
                      />
                    </td>
                    <td>
                      <div className="font-semibold text-[hsl(var(--card-foreground))] group-hover:text-blue-600 transition-colors">{document.title}</div>
                      <div className="mt-1 text-xs text-[hsl(var(--on-surface-variant))]">
                        {document.year && document.month ? `${document.year}-${String(document.month).padStart(2, '0')}` : 'ไม่มีงวดการเรียกเก็บ'}
                      </div>
                    </td>
                    <td className="hidden md:table-cell">
                      <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold bg-[hsl(var(--card))] text-[hsl(var(--on-surface-variant))] border border-[hsl(var([hsl(var(--color-border))]))]">
                        {document.documentType.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td>
                      <div className="font-semibold text-[hsl(var(--card-foreground))]">{document.room.roomNumber ?? document.room.roomNo ?? '-'}</div>
                      <div className="mt-1 text-xs text-[hsl(var(--on-surface-variant))]">
                        ชั้น {document.room.floorNumber ?? '—'} · {document.tenantName ?? 'ไม่มีผู้เช่า'}
                      </div>
                    </td>
                    <td className="hidden lg:table-cell">
                      <div className="font-medium text-[hsl(var(--card-foreground))]">{document.template.name}</div>
                      <div className="mt-1 text-xs text-[hsl(var(--on-surface-variant))]">เวอร์ชันเทมเพลต v{document.templateVersion.version}</div>
                    </td>
                    <td className="hidden lg:table-cell text-[hsl(var(--on-surface-variant))]">Doc v{document.documentVersion}</td>
                    <td className="hidden md:table-cell text-[hsl(var(--on-surface-variant))]"><ClientOnly fallback="-">{new Date(document.generatedAt).toLocaleString('th-TH')}</ClientOnly></td>
                    <td>
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                        document.status === 'GENERATED' || document.status === 'EXPORTED'
                          ? 'bg-emerald-500/15 text-emerald-600 border border-emerald-500/20'
                          : document.status === 'FAILED'
                            ? 'bg-red-500/15 text-red-600 border border-red-500/20'
                            : document.status === 'SENT'
                              ? 'bg-blue-500/15 text-blue-600 border border-blue-500/20'
                              : 'bg-amber-500/15 text-amber-600 border border-amber-500/20'
                      }`}
                      >
                        {document.status === 'GENERATED' ? 'สร้างแล้ว' : document.status === 'EXPORTED' ? 'ส่งออกแล้ว' : document.status === 'FAILED' ? 'ล้มเหลว' : document.status === 'SENT' ? 'ส่งแล้ว' : document.status}
                      </span>
                    </td>
                    <td>
                      <div className="flex flex-wrap items-center gap-2">
                        {document.files.some((f) => f.role === 'PDF') && document.status !== 'SENT' && (
                          <button
                            type="button"
                            aria-label="ส่ง PDF"
                            className="inline-flex items-center gap-1 rounded-lg border border-blue-500/20 bg-blue-500/10 px-3 py-1.5 text-xs font-medium text-blue-600 shadow-sm transition-all duration-200 hover:bg-blue-500/20 hover:border-blue-500/40 hover:shadow-[0_4px_16px_rgba(0,0,0,0.08)] active:scale-[0.98] disabled:opacity-50"
                            onClick={() => void sendDocument(document.id)}
                            disabled={sendingIds.has(document.id)}
                          >
                            <Send className="h-3.5 w-3.5" />
                            {sendingIds.has(document.id) ? 'กำลังส่ง...' : 'ส่ง PDF'}
                          </button>
                        )}
                        <Link
                          href={`/admin/documents/${document.id}`}
                          aria-label="รายละเอียดเอกสาร"
                          className="inline-flex items-center gap-1 rounded-lg border border-[hsl(var([hsl(var(--color-border))]))] bg-[hsl(var(--card))] px-3 py-1.5 text-xs font-medium text-[hsl(var(--card-foreground))] shadow-sm transition-all duration-200 hover:bg-white/5 hover:border-[hsl(var([hsl(var(--color-border))]))] hover:text-[hsl(var(--card-foreground))] active:scale-[0.98]"
                        >
                          <FolderOpen className="h-3.5 w-3.5" />
                          รายละเอียด
                        </Link>
                        <a
                          href={`/api/documents/${document.id}/pdf`}
                          aria-label="เปิด PDF"
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded-lg border border-[hsl(var([hsl(var(--color-border))]))] bg-[hsl(var(--card))] px-3 py-1.5 text-xs font-medium text-[hsl(var(--card-foreground))] shadow-sm transition-all duration-200 hover:bg-white/5 hover:border-[hsl(var([hsl(var(--color-border))]))] hover:text-[hsl(var(--card-foreground))] active:scale-[0.98]"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          PDF
                        </a>
                        <a
                          href={`/api/documents/${document.id}/download?format=docx`}
                          aria-label="ดาวน์โหลด DOCX"
                          className="inline-flex items-center gap-1 rounded-lg border border-[hsl(var([hsl(var(--color-border))]))] bg-[hsl(var(--card))] px-3 py-1.5 text-xs font-medium text-[hsl(var(--card-foreground))] shadow-sm transition-all duration-200 hover:bg-white/5 hover:border-[hsl(var([hsl(var(--color-border))]))] hover:text-[hsl(var(--card-foreground))] active:scale-[0.98]"
                        >
                          <FileOutput className="h-3.5 w-3.5" />
                          DOCX
                        </a>
                        <button
                          type="button"
                          aria-label="ลบเอกสาร"
                          className="inline-flex items-center gap-1 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-600 shadow-sm transition-all duration-200 hover:bg-red-500/20 hover:border-red-500/40 hover:shadow-[0_4px_16px_rgba(0,0,0,0.08)] active:scale-[0.98]"
                          onClick={() => setDeleteTarget(document)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          ลบ
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
    </main>
  );
}
