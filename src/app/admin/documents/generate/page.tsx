'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { FileOutput, Layers3, Search, Wand2 } from 'lucide-react';

type TemplateOption = {
  id: string;
  name: string;
  type: string;
  status: string;
  activeVersionId: string | null;
};

type FloorOption = {
  floorNo: number;
  label: string;
};

type RoomOption = {
  roomNo: string;
  floorNo: number;
  roomTenants?: Array<{ tenant?: { firstName?: string; lastName?: string } }>;
};

type PreviewResponse = {
  totalRequested: number;
  readyCount: number;
  skippedCount: number;
  failedCount: number;
  targets: Array<{
    roomId: string;
    roomNumber: string;
    floorNumber: number | null;
    tenantName: string | null;
    status: string;
    reason: string | null;
  }>;
};

type JobResponse = {
  id: string;
  successCount: number;
  skippedCount: number;
  failedCount: number;
  bundleUrl: string | null;
  targets: Array<{
    id: string;
    roomId: string;
    roomNumber: string;
    floorNumber: number | null;
    tenantName: string | null;
    status: string;
    reason: string | null;
    generatedDocumentId: string | null;
  }>;
};

const SCOPES = [
  { value: 'SINGLE_ROOM', label: 'ห้องเดียว' },
  { value: 'SELECTED_ROOMS', label: 'ห้องที่เลือก' },
  { value: 'FLOOR', label: 'ทุกห้องในชั้น' },
  { value: 'ELIGIBLE_FOR_MONTH', label: 'ทุกห้องที่มีสิทธิ์ในเดือน' },
  { value: 'OCCUPIED_ROOMS', label: 'เฉพาะห้องที่มีผู้เช่า' },
  { value: 'ROOMS_WITH_BILLING', label: 'เฉพาะห้องที่มีการเรียกเก็บ' },
] as const;

export default function GenerateDocumentsPage() {
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [floors, setFloors] = useState<FloorOption[]>([]);
  const [rooms, setRooms] = useState<RoomOption[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [scope, setScope] = useState<(typeof SCOPES)[number]['value']>('ELIGIBLE_FOR_MONTH');
  const [selectedRoomId, setSelectedRoomId] = useState('');
  const [selectedRoomIds, setSelectedRoomIds] = useState<string[]>([]);
  const [floorNumber, setFloorNumber] = useState<number | ''>('');
  const [search, setSearch] = useState('');
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [includeZipBundle, setIncludeZipBundle] = useState(true);
  const [onlyOccupiedRooms, setOnlyOccupiedRooms] = useState(false);
  const [onlyRoomsWithBillingRecord, setOnlyRoomsWithBillingRecord] = useState(false);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [job, setJob] = useState<JobResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<'preview' | 'generate' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [templatesResponse, floorsResponse, roomsResponse] = await Promise.all([
          fetch('/api/templates?pageSize=100', { cache: 'no-store' }).then((response) => response.json()),
          fetch('/api/floors', { cache: 'no-store' }).then((response) => response.json()),
          fetch('/api/rooms?pageSize=100&page=1', { cache: 'no-store' }).then((response) => response.json()),
        ]);

        setTemplates((templatesResponse.data?.data ?? []).filter((template: TemplateOption) => template.activeVersionId));
        setFloors(floorsResponse.data ?? []);
        setRooms(roomsResponse.data?.data ?? []);
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : 'ไม่สามารถโหลดข้อมูลสำหรับสร้างเอกสาร');
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, []);

  useEffect(() => {
    if (!selectedTemplateId && templates.length) {
      setSelectedTemplateId(templates[0].id);
    }
  }, [templates, selectedTemplateId]);

  const filteredRooms = useMemo(() => {
    return rooms.filter((room) => room.roomNo.toLowerCase().includes(search.toLowerCase()));
  }, [rooms, search]);

  const requestBody = useMemo(() => ({
    templateId: selectedTemplateId,
    scope,
    roomId: selectedRoomId || undefined,
    roomIds: selectedRoomIds,
    floorNumber: floorNumber === '' ? undefined : Number(floorNumber),
    year,
    month,
    onlyOccupiedRooms,
    onlyRoomsWithBillingRecord,
    includeZipBundle,
  }), [
    selectedTemplateId,
    scope,
    selectedRoomId,
    selectedRoomIds,
    floorNumber,
    year,
    month,
    onlyOccupiedRooms,
    onlyRoomsWithBillingRecord,
    includeZipBundle,
  ]);

  async function runPreview() {
    setWorking('preview');
    setError(null);
    setJob(null);
    try {
      const response = await fetch('/api/documents/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...requestBody, dryRun: true }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error?.message ?? 'ไม่สามารถดูตัวอย่างการสร้างเอกสาร');
      }
      setPreview(json.data as PreviewResponse);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'ไม่สามารถดูตัวอย่างการสร้างเอกสาร');
    } finally {
      setWorking(null);
    }
  }

  async function runGeneration() {
    setWorking('generate');
    setError(null);
    try {
      const response = await fetch('/api/documents/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...requestBody, dryRun: false }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error?.message ?? 'ไม่สามารถสร้างเอกสาร');
      }
      setJob(json.data as JobResponse);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'ไม่สามารถสร้างเอกสาร');
    } finally {
      setWorking(null);
    }
  }

  return (
    <main className="space-y-6">
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-primary-container to-primary px-6 py-5 shadow-lg">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(255,255,255,0.15),_transparent_60%)]" />
        <div className="relative flex items-center justify-between">
          <div>
            <h1 className="text-base font-semibold text-on-primary">สร้างเอกสาร</h1>
            <p className="text-xs text-on-primary/80 mt-0.5">
              สร้างเอกสารแบบ mail-merge ที่สร้างเอกสารที่บันทึกหนึ่งฉบับต่อห้องจากข้อมูล ERP จริง
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/admin/templates" className="inline-flex items-center gap-2 rounded-lg border border-white/30 bg-white/20 px-4 py-2 text-sm font-medium text-on-primary shadow-sm transition-colors hover:bg-white/30">
              จัดการเทมเพลต
            </Link>
            <Link href="/admin/documents" className="inline-flex items-center gap-2 rounded-lg border border-white/30 bg-white/20 px-4 py-2 text-sm font-medium text-on-primary shadow-sm transition-colors hover:bg-white/30">
              ดูทะเบียน
            </Link>
          </div>
        </div>
      </div>

      {error ? <div className="auth-alert auth-alert-error">{error}</div> : null}

      {loading ? (
        <div className="py-16 text-center text-slate-500">กำลังโหลดข้อมูลสำหรับสร้างเอกสาร...</div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
          <section className="bg-surface-container-lowest rounded-xl border border-outline-variant/10">
            <div className="px-5 py-4 border-b border-outline-variant">
              <div className="text-sm font-semibold text-primary flex items-center gap-2">
                <Wand2 className="h-4 w-4 text-primary" />
                ขอบเขตการสร้าง
              </div>
            </div>
            <div className="space-y-4 p-5">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-on-surface">เทมเพลต</label>
                <select className="w-full rounded-xl border border-outline bg-surface-container-lowest px-3 py-2.5 text-sm text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" value={selectedTemplateId} onChange={(event) => setSelectedTemplateId(event.target.value)}>
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name} · {template.type.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-on-surface">ขอบเขต</label>
                <select className="w-full rounded-xl border border-outline bg-surface-container-lowest px-3 py-2.5 text-sm text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" value={scope} onChange={(event) => setScope(event.target.value as (typeof SCOPES)[number]['value'])}>
                  {SCOPES.map((scopeOption) => (
                    <option key={scopeOption.value} value={scopeOption.value}>
                      {scopeOption.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-on-surface">ปี</label>
                  <input className="w-full rounded-xl border border-outline bg-surface-container-lowest px-3 py-2.5 text-sm text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" type="number" value={year} onChange={(event) => setYear(Number(event.target.value))} />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-on-surface">เดือน</label>
                  <input className="w-full rounded-xl border border-outline bg-surface-container-lowest px-3 py-2.5 text-sm text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" type="number" min={1} max={12} value={month} onChange={(event) => setMonth(Number(event.target.value))} />
                </div>
              </div>

              {scope === 'SINGLE_ROOM' ? (
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-on-surface">ห้อง</label>
                  <select className="w-full rounded-xl border border-outline bg-surface-container-lowest px-3 py-2.5 text-sm text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" value={selectedRoomId} onChange={(event) => setSelectedRoomId(event.target.value)}>
                    <option value="">เลือกห้อง</option>
                    {rooms.map((room) => (
                      <option key={room.roomNo} value={room.roomNo}>
                        {room.roomNo}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              {scope === 'SELECTED_ROOMS' ? (
                <div className="space-y-3">
                  <label className="block text-sm font-medium text-on-surface">ห้องที่เลือก</label>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant" />
                    <input
                      className="w-full rounded-xl border border-outline bg-surface-container-lowest pl-9 pr-3 py-2.5 text-sm text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                      placeholder="ค้นหาหมายเลขห้อง..."
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                    />
                  </div>
                  <div className="max-h-[220px] space-y-2 overflow-auto rounded-xl border border-outline-variant/10 bg-surface-container p-3">
                    {filteredRooms.map((room) => (
                      <label key={room.roomNo} className="flex items-center gap-3 rounded-lg bg-surface-container-lowest px-3 py-2.5 text-sm text-on-surface shadow-sm">
                        <input
                          type="checkbox"
                          checked={selectedRoomIds.includes(room.roomNo)}
                          onChange={(event) => {
                            setSelectedRoomIds((current) =>
                              event.target.checked
                                ? [...current, room.roomNo]
                                : current.filter((roomId) => roomId !== room.roomNo),
                            );
                          }}
                        />
                        <span className="font-medium">{room.roomNo}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}

              {scope === 'FLOOR' ? (
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-on-surface">ชั้น</label>
                  <select className="w-full rounded-xl border border-outline bg-surface-container-lowest px-3 py-2.5 text-sm text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" value={floorNumber} onChange={(event) => setFloorNumber(event.target.value ? Number(event.target.value) : '')}>
                    <option value="">เลือกชั้น</option>
                    {floors.map((floor) => (
                      <option key={floor.floorNo} value={floor.floorNo}>
                        {floor.label}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              <label className="flex items-center gap-3 rounded-xl border border-outline-variant bg-surface-container px-4 py-3 text-sm text-on-surface">
                <input type="checkbox" checked={onlyOccupiedRooms} onChange={(event) => setOnlyOccupiedRooms(event.target.checked)} />
                เฉพาะห้องที่มีผู้เช่า
              </label>
              <label className="flex items-center gap-3 rounded-xl border border-outline-variant bg-surface-container px-4 py-3 text-sm text-on-surface">
                <input type="checkbox" checked={onlyRoomsWithBillingRecord} onChange={(event) => setOnlyRoomsWithBillingRecord(event.target.checked)} />
                เฉพาะห้องที่มีบันทึกการเรียกเก็บ
              </label>
              <label className="flex items-center gap-3 rounded-xl border border-outline-variant bg-surface-container px-4 py-3 text-sm text-on-surface">
                <input type="checkbox" checked={includeZipBundle} onChange={(event) => setIncludeZipBundle(event.target.checked)} />
                สร้างไฟล์ ZIP สำหรับ PDF ที่สำเร็จ
              </label>

              <div className="flex gap-3 pt-2">
                <button type="button" className="inline-flex items-center gap-2 rounded-lg border border-outline bg-surface-container-lowest px-4 py-2 text-sm font-medium text-on-surface shadow-sm transition-colors hover:bg-surface-container flex-1" onClick={() => void runPreview()} disabled={working !== null || !selectedTemplateId}>
                  {working === 'preview' ? 'กำลังดูตัวอย่าง...' : 'ดูตัวอย่าง'}
                </button>
                <button type="button" className="inline-flex items-center gap-2 rounded-lg border border-outline bg-primary text-on-primary hover:bg-primary/90 px-4 py-2 text-sm font-medium shadow-sm transition-colors flex-1" onClick={() => void runGeneration()} disabled={working !== null || !selectedTemplateId}>
                  {working === 'generate' ? 'กำลังสร้าง...' : 'สร้างเอกสาร'}
                </button>
              </div>
            </div>
          </section>

          <div className="space-y-6">
            <section className="bg-surface-container-lowest rounded-xl border border-outline-variant/10">
              <div className="px-5 py-4 border-b border-outline-variant">
                <div className="text-sm font-semibold text-primary flex items-center gap-2">
                  <Layers3 className="h-4 w-4 text-primary" />
                  ผลการดูตัวอย่าง
                </div>
              </div>
              {preview ? (
                <>
                  <div className="grid gap-4 p-5 sm:grid-cols-4">
                    <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-5">
                      <div className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">ร้องขอ</div>
                      <div className="text-xl font-semibold text-on-surface mt-0.5">{preview.totalRequested}</div>
                    </div>
                    <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-5">
                      <div className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">พร้อม</div>
                      <div className="text-xl font-semibold text-on-surface mt-0.5">{preview.readyCount}</div>
                    </div>
                    <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-5">
                      <div className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">ข้าม</div>
                      <div className="text-xl font-semibold text-on-surface mt-0.5">{preview.skippedCount}</div>
                    </div>
                    <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-5">
                      <div className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">ล้มเหลว</div>
                      <div className="text-xl font-semibold text-on-surface mt-0.5">{preview.failedCount}</div>
                    </div>
                  </div>
                  <div className="overflow-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-surface-container">
                        <tr>
                          <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">ห้อง</th>
                          <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">ชั้น</th>
                          <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">ผู้เช่า</th>
                          <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">สถานะ</th>
                          <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">เหตุผล</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.targets.map((target) => (
                          <tr key={target.roomId}>
                            <td className="font-semibold text-on-surface">{target.roomNumber}</td>
                            <td>{target.floorNumber ?? '—'}</td>
                            <td>{target.tenantName ?? '—'}</td>
                            <td>
                              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                target.status === 'READY'
                                  ? 'bg-tertiary-container text-on-tertiary-container'
                                  : target.status === 'FAILED'
                                    ? 'bg-error-container text-on-error-container'
                                    : 'bg-amber-50 text-amber-700 border border-amber-200'
                              }`}
                              >
                                {target.status}
                              </span>
                            </td>
                            <td className="text-sm text-on-surface-variant">{target.reason ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <div className="px-6 py-16 text-center text-sm text-on-surface-variant">
                  รันดูตัวอย่างก่อนเพื่อดูว่าจะสร้างเอกสารสำหรับกี่ห้อง
                </div>
              )}
            </section>

            <section className="bg-surface-container-lowest rounded-xl border border-outline-variant/10">
              <div className="px-5 py-4 border-b border-outline-variant">
                <div className="text-sm font-semibold text-primary flex items-center gap-2">
                  <FileOutput className="h-4 w-4 text-primary" />
                  ผลการสร้างเอกสาร
                </div>
              </div>
              {job ? (
                <>
                  <div className="grid gap-4 p-5 sm:grid-cols-3">
                    <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-5">
                      <div className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">สำเร็จ</div>
                      <div className="text-xl font-semibold text-on-surface mt-0.5">{job.successCount}</div>
                    </div>
                    <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-5">
                      <div className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">ข้าม</div>
                      <div className="text-xl font-semibold text-on-surface mt-0.5">{job.skippedCount}</div>
                    </div>
                    <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-5">
                      <div className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">ล้มเหลว</div>
                      <div className="text-xl font-semibold text-on-surface mt-0.5">{job.failedCount}</div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-3 px-5 pb-5">
                    <Link href="/admin/documents" className="inline-flex items-center gap-2 rounded-lg border border-outline bg-surface-container-lowest px-4 py-2 text-sm font-medium text-on-surface shadow-sm transition-colors hover:bg-surface-container">
                      เปิดทะเบียนเอกสาร
                    </Link>
                    {job.bundleUrl ? (
                      <a href={job.bundleUrl} className="inline-flex items-center gap-2 rounded-lg border border-outline bg-primary text-on-primary hover:bg-primary/90 px-4 py-2 text-sm font-medium shadow-sm transition-colors">
                        ดาวน์โหลดไฟล์ ZIP
                      </a>
                    ) : null}
                  </div>
                  <div className="overflow-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-surface-container">
                        <tr>
                          <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">ห้อง</th>
                          <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">สถานะ</th>
                          <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">เหตุผล</th>
                          <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">เอกสาร</th>
                        </tr>
                      </thead>
                      <tbody>
                        {job.targets.map((target) => (
                          <tr key={target.id}>
                            <td className="font-semibold text-on-surface">{target.roomNumber}</td>
                            <td>
                              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                target.status === 'SUCCESS'
                                  ? 'bg-tertiary-container text-on-tertiary-container'
                                  : target.status === 'FAILED'
                                    ? 'bg-error-container text-on-error-container'
                                    : 'bg-amber-50 text-amber-700 border border-amber-200'
                              }`}
                              >
                                {target.status}
                              </span>
                            </td>
                            <td className="text-sm text-on-surface-variant">{target.reason ?? '—'}</td>
                            <td>
                              {target.generatedDocumentId ? (
                                <Link href={`/admin/documents/${target.generatedDocumentId}`} className="inline-flex items-center gap-1 rounded-lg border border-outline bg-surface-container-lowest px-3 py-1.5 text-xs font-medium text-on-surface shadow-sm transition-colors hover:bg-surface-container">
                                  Open
                                </Link>
                              ) : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <div className="px-6 py-16 text-center text-sm text-on-surface-variant">
                  Generated results will appear here after the batch finishes.
                </div>
              )}
            </section>
          </div>
        </div>
      )}
    </main>
  );
}
