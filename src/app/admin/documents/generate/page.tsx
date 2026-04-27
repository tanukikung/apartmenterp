'use client';

import Link from 'next/link';
import { useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileOutput, Layers3, Search, Wand2 } from 'lucide-react';
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges';

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

async function fetchTemplates(): Promise<{ data: TemplateOption[] }> {
  const res = await fetch('/api/templates?pageSize=100', { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch templates');
  const json = await res.json();
  if (!json.success) throw new Error(json.error?.message ?? 'Request failed');
  return json.data;
}

async function fetchFloors(): Promise<{ data: FloorOption[] }> {
  const res = await fetch('/api/floors', { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch floors');
  const json = await res.json();
  if (!json.success) throw new Error(json.error?.message ?? 'Request failed');
  return json.data;
}

async function fetchRooms(): Promise<{ data: RoomOption[] }> {
  const res = await fetch('/api/rooms?pageSize=100&page=1', { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch rooms');
  const json = await res.json();
  if (!json.success) throw new Error(json.error?.message ?? 'Request failed');
  return json.data;
}

export default function GenerateDocumentsPage() {
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
  const [working, setWorking] = useState<'preview' | 'generate' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const initRef = useRef(false);

  const { data: templatesRaw, isLoading: templatesLoading } = useQuery<{ data: TemplateOption[] }>({
    queryKey: ['templates-for-generate'],
    queryFn: fetchTemplates,
  });
  const { data: floorsRaw, isLoading: floorsLoading } = useQuery<{ data: FloorOption[] }>({
    queryKey: ['floors-for-generate'],
    queryFn: fetchFloors,
  });
  const { data: roomsRaw, isLoading: roomsLoading } = useQuery<{ data: RoomOption[] }>({
    queryKey: ['rooms-for-generate'],
    queryFn: fetchRooms,
  });

  const templates: TemplateOption[] = (templatesRaw?.data ?? []).filter((t: TemplateOption) => t.activeVersionId);
  const floors: FloorOption[] = floorsRaw?.data ?? [];
  const rooms: RoomOption[] = useMemo(() => roomsRaw?.data ?? [], [roomsRaw?.data]);
  const isLoading = templatesLoading || floorsLoading || roomsLoading;

  if (!initRef.current && templates.length > 0 && !selectedTemplateId) {
    initRef.current = true;
    setSelectedTemplateId(templates[0].id);
  }

  const filteredRooms = useMemo(() => {
    return rooms.filter((room) => room.roomNo.toLowerCase().includes(search.toLowerCase()));
  }, [rooms, search]);

  const generateDirty =
    selectedRoomIds.length > 0 ||
    !!selectedRoomId ||
    floorNumber !== '' ||
    working !== null ||
    job !== null ||
    preview !== null;
  useUnsavedChanges(generateDirty);

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
    setActionError(null);
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
      setActionError(nextError instanceof Error ? nextError.message : 'ไม่สามารถดูตัวอย่างการสร้างเอกสาร');
    } finally {
      setWorking(null);
    }
  }

  async function runGeneration() {
    setWorking('generate');
    setActionError(null);
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
      setActionError(nextError instanceof Error ? nextError.message : 'ไม่สามารถสร้างเอกสาร');
    } finally {
      setWorking(null);
    }
  }

  return (
    <main className="space-y-6">
      {/* Hero Header */}
      <div className="relative overflow-hidden rounded-2xl border border-white/5 bg-white/5 backdrop-blur shadow-[0_4px_16px_rgba(0,0,0,0.08)] px-6 py-5">
        <div className="absolute inset-0 bg-gradient-to-br from-[hsl(var(--primary)/0.1)] via-transparent to-violet-500/10 pointer-events-none" />
        <div className="absolute top-0 right-0 w-64 h-64 bg-[hsl(var(--primary)/0.05)] rounded-full blur-3xl pointer-events-none" />
        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[hsl(var(--primary)/0.2)] border border-[hsl(var(--primary)/0.3)] shadow-[var(--glow-primary)]">
              <Wand2 className="h-5 w-5 text-[hsl(var(--primary))]" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-white">สร้างเอกสาร</h1>
              <p className="text-xs text-white/50 mt-0.5">
                สร้างเอกสารแบบ mail-merge ที่สร้างเอกสารที่บันทึกหนึ่งฉบับต่อห้องจากข้อมูล ERP จริง
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/admin/templates"
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white px-4 py-2 text-sm font-medium shadow-sm transition-all duration-200 active:scale-[0.98]"
            >
              จัดการเทมเพลต
            </Link>
            <Link
              href="/admin/documents"
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white px-4 py-2 text-sm font-medium shadow-sm transition-all duration-200 active:scale-[0.98]"
            >
              ดูทะเบียน
            </Link>
          </div>
        </div>
      </div>

      {actionError ? (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400 backdrop-blur-sm">
          {actionError}
        </div>
      ) : null}

      {isLoading ? (
        <div className="py-16 text-center text-sm text-white/40">กำลังโหลดข้อมูลสำหรับสร้างเอกสาร...</div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
          {/* Left Panel - Form */}
          <section className="rounded-2xl border border-white/5 bg-white/5 backdrop-blur shadow-[0_4px_16px_rgba(0,0,0,0.3)]">
            <div className="px-5 py-4 border-b border-white/5 bg-white/[0.02]">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <Wand2 className="h-4 w-4 text-blue-400" />
                ขอบเขตการสร้าง
              </div>
            </div>
            <div className="space-y-4 p-5">
              {/* Template Select */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-white/70">เทมเพลต</label>
                <select
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 backdrop-blur-sm transition-all duration-200"
                  value={selectedTemplateId}
                  onChange={(event) => setSelectedTemplateId(event.target.value)}
                >
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name} · {template.type.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              </div>

              {/* Scope Select */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-white/70">ขอบเขต</label>
                <select
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 backdrop-blur-sm transition-all duration-200"
                  value={scope}
                  onChange={(event) => setScope(event.target.value as (typeof SCOPES)[number]['value'])}
                >
                  {SCOPES.map((scopeOption) => (
                    <option key={scopeOption.value} value={scopeOption.value}>
                      {scopeOption.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Year / Month */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-white/70">ปี</label>
                  <input
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 backdrop-blur-sm transition-all duration-200"
                    type="number"
                    value={year}
                    onChange={(event) => setYear(Number(event.target.value))}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-white/70">เดือน</label>
                  <input
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 backdrop-blur-sm transition-all duration-200"
                    type="number"
                    min={1}
                    max={12}
                    value={month}
                    onChange={(event) => setMonth(Number(event.target.value))}
                  />
                </div>
              </div>

              {/* Single Room */}
              {scope === 'SINGLE_ROOM' ? (
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-white/70">ห้อง</label>
                  <select
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 backdrop-blur-sm transition-all duration-200"
                    value={selectedRoomId}
                    onChange={(event) => setSelectedRoomId(event.target.value)}
                  >
                    <option value="">เลือกห้อง</option>
                    {rooms.map((room) => (
                      <option key={room.roomNo} value={room.roomNo}>
                        {room.roomNo}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              {/* Selected Rooms */}
              {scope === 'SELECTED_ROOMS' ? (
                <div className="space-y-3">
                  <label className="block text-sm font-medium text-white/70">ห้องที่เลือก</label>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
                    <input
                      className="w-full rounded-xl border border-white/10 bg-white/5 pl-9 pr-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 backdrop-blur-sm transition-all duration-200"
                      placeholder="ค้นหาหมายเลขห้อง..."
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                    />
                  </div>
                  <div className="max-h-[220px] space-y-2 overflow-auto rounded-xl border border-white/5 bg-white/[0.02] p-3 backdrop-blur-sm">
                    {filteredRooms.map((room) => (
                      <label
                        key={room.roomNo}
                        className="flex items-center gap-3 rounded-lg bg-white/[0.03] px-3 py-2.5 text-sm text-white shadow-sm cursor-pointer hover:bg-white/[0.06] transition-colors"
                      >
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
                          className="rounded border-white/20 bg-white/5 text-blue-400 focus:ring-blue-500/20"
                        />
                        <span className="font-medium">{room.roomNo}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* Floor Select */}
              {scope === 'FLOOR' ? (
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-white/70">ชั้น</label>
                  <select
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 backdrop-blur-sm transition-all duration-200"
                    value={floorNumber}
                    onChange={(event) => setFloorNumber(event.target.value ? Number(event.target.value) : '')}
                  >
                    <option value="">เลือกชั้น</option>
                    {floors.map((floor) => (
                      <option key={floor.floorNo} value={floor.floorNo}>
                        {floor.label}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              {/* Toggles */}
              <label className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3 text-sm text-white/70 cursor-pointer hover:bg-white/[0.04] transition-colors">
                <input type="checkbox" checked={onlyOccupiedRooms} onChange={(event) => setOnlyOccupiedRooms(event.target.checked)} className="rounded border-white/20 bg-white/5 text-blue-400 focus:ring-blue-500/20" />
                เฉพาะห้องที่มีผู้เช่า
              </label>
              <label className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3 text-sm text-white/70 cursor-pointer hover:bg-white/[0.04] transition-colors">
                <input type="checkbox" checked={onlyRoomsWithBillingRecord} onChange={(event) => setOnlyRoomsWithBillingRecord(event.target.checked)} className="rounded border-white/20 bg-white/5 text-blue-400 focus:ring-blue-500/20" />
                เฉพาะห้องที่มีบันทึกการเรียกเก็บ
              </label>
              <label className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3 text-sm text-white/70 cursor-pointer hover:bg-white/[0.04] transition-colors">
                <input type="checkbox" checked={includeZipBundle} onChange={(event) => setIncludeZipBundle(event.target.checked)} className="rounded border-white/20 bg-white/5 text-blue-400 focus:ring-blue-500/20" />
                สร้างไฟล์ ZIP สำหรับ PDF ที่สำเร็จ
              </label>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white/70 shadow-sm transition-all duration-200 hover:bg-white/10 hover:border-white/20 active:scale-[0.98] disabled:opacity-50 flex-1"
                  onClick={() => void runPreview()}
                  disabled={working !== null || !selectedTemplateId}
                >
                  {working === 'preview' ? 'กำลังดูตัวอย่าง...' : 'ดูตัวอย่าง'}
                </button>
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-xl border border-[hsl(var(--primary)/0.3)] bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))] hover:bg-[hsl(var(--primary)/0.2)] hover:border-[hsl(var(--primary)/0.5)] px-4 py-2 text-sm font-medium shadow-sm transition-all duration-200 active:scale-[0.98] disabled:opacity-50 flex-1"
                  onClick={() => void runGeneration()}
                  disabled={working !== null || !selectedTemplateId}
                >
                  {working === 'generate' ? 'กำลังสร้าง...' : 'สร้างเอกสาร'}
                </button>
              </div>
            </div>
          </section>

          {/* Right Panel - Results */}
          <div className="space-y-6">
            {/* Preview Results */}
            <section className="rounded-2xl border border-white/5 bg-white/5 backdrop-blur shadow-[0_4px_16px_rgba(0,0,0,0.3)]">
              <div className="px-5 py-4 border-b border-white/5 bg-white/[0.02]">
                <div className="flex items-center gap-2 text-sm font-semibold text-white">
                  <Layers3 className="h-4 w-4 text-blue-400" />
                  ผลการดูตัวอย่าง
                </div>
              </div>
              {preview ? (
                <>
                  <div className="grid gap-4 p-5 sm:grid-cols-4">
                    <div className="rounded-xl border border-white/5 bg-white/[0.02] p-5">
                      <div className="text-[10px] font-bold uppercase tracking-widest text-white/30">ร้องขอ</div>
                      <div className="text-xl font-semibold text-white mt-0.5">{preview.totalRequested}</div>
                    </div>
                    <div className="rounded-xl border border-white/5 bg-white/[0.02] p-5">
                      <div className="text-[10px] font-bold uppercase tracking-widest text-white/30">พร้อม</div>
                      <div className="text-xl font-semibold text-emerald-400 mt-0.5">{preview.readyCount}</div>
                    </div>
                    <div className="rounded-xl border border-white/5 bg-white/[0.02] p-5">
                      <div className="text-[10px] font-bold uppercase tracking-widest text-white/30">ข้าม</div>
                      <div className="text-xl font-semibold text-amber-400 mt-0.5">{preview.skippedCount}</div>
                    </div>
                    <div className="rounded-xl border border-white/5 bg-white/[0.02] p-5">
                      <div className="text-[10px] font-bold uppercase tracking-widest text-white/30">ล้มเหลว</div>
                      <div className="text-xl font-semibold text-red-400 mt-0.5">{preview.failedCount}</div>
                    </div>
                  </div>
                  <div className="overflow-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-white/[0.02]">
                        <tr>
                          <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-white/40">ห้อง</th>
                          <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-white/40">ชั้น</th>
                          <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-white/40">ผู้เช่า</th>
                          <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-white/40">สถานะ</th>
                          <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-white/40">เหตุผล</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.targets.map((target) => (
                          <tr key={target.roomId} className="border-t border-white/5 hover:bg-white/[0.02] transition-colors">
                            <td className="font-semibold text-white">{target.roomNumber}</td>
                            <td className="text-white/50">{target.floorNumber ?? '—'}</td>
                            <td className="text-white/50">{target.tenantName ?? '—'}</td>
                            <td>
                              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                                target.status === 'READY'
                                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
                                  : target.status === 'FAILED'
                                    ? 'bg-red-500/15 text-red-400 border border-red-500/20'
                                    : 'bg-amber-500/15 text-amber-400 border border-amber-500/20'
                              }`}
                              >
                                {target.status}
                              </span>
                            </td>
                            <td className="text-sm text-white/40">{target.reason ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <div className="px-6 py-16 text-center text-sm text-white/40">
                  รันดูตัวอย่างก่อนเพื่อดูว่าจะสร้างเอกสารสำหรับกี่ห้อง
                </div>
              )}
            </section>

            {/* Generation Results */}
            <section className="rounded-2xl border border-white/5 bg-white/5 backdrop-blur shadow-[0_4px_16px_rgba(0,0,0,0.3)]">
              <div className="px-5 py-4 border-b border-white/5 bg-white/[0.02]">
                <div className="flex items-center gap-2 text-sm font-semibold text-white">
                  <FileOutput className="h-4 w-4 text-blue-400" />
                  ผลการสร้างเอกสาร
                </div>
              </div>
              {job ? (
                <>
                  <div className="grid gap-4 p-5 sm:grid-cols-3">
                    <div className="rounded-xl border border-white/5 bg-white/[0.02] p-5">
                      <div className="text-[10px] font-bold uppercase tracking-widest text-white/30">สำเร็จ</div>
                      <div className="text-xl font-semibold text-emerald-400 mt-0.5">{job.successCount}</div>
                    </div>
                    <div className="rounded-xl border border-white/5 bg-white/[0.02] p-5">
                      <div className="text-[10px] font-bold uppercase tracking-widest text-white/30">ข้าม</div>
                      <div className="text-xl font-semibold text-amber-400 mt-0.5">{job.skippedCount}</div>
                    </div>
                    <div className="rounded-xl border border-white/5 bg-white/[0.02] p-5">
                      <div className="text-[10px] font-bold uppercase tracking-widest text-white/30">ล้มเหลว</div>
                      <div className="text-xl font-semibold text-red-400 mt-0.5">{job.failedCount}</div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-3 px-5 pb-5">
                    <Link
                      href="/admin/documents"
                      className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white/70 shadow-sm transition-all duration-200 hover:bg-white/10 hover:border-white/20 active:scale-[0.98]"
                    >
                      เปิดทะเบียนเอกสาร
                    </Link>
                    {job.bundleUrl ? (
                      <a
                        href={job.bundleUrl}
                        className="inline-flex items-center gap-2 rounded-xl border border-blue-500/30 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 hover:border-blue-500/50 px-4 py-2 text-sm font-medium shadow-sm transition-all duration-200 active:scale-[0.98]"
                      >
                        ดาวน์โหลดไฟล์ ZIP
                      </a>
                    ) : null}
                  </div>
                  <div className="overflow-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-white/[0.02]">
                        <tr>
                          <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-white/40">ห้อง</th>
                          <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-white/40">สถานะ</th>
                          <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-white/40">เหตุผล</th>
                          <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-white/40">เอกสาร</th>
                        </tr>
                      </thead>
                      <tbody>
                        {job.targets.map((target) => (
                          <tr key={target.id} className="border-t border-white/5 hover:bg-white/[0.02] transition-colors">
                            <td className="font-semibold text-white">{target.roomNumber}</td>
                            <td>
                              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                                target.status === 'SUCCESS'
                                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
                                  : target.status === 'FAILED'
                                    ? 'bg-red-500/15 text-red-400 border border-red-500/20'
                                    : 'bg-amber-500/15 text-amber-400 border border-amber-500/20'
                              }`}
                              >
                                {target.status}
                              </span>
                            </td>
                            <td className="text-sm text-white/40">{target.reason ?? '—'}</td>
                            <td>
                              {target.generatedDocumentId ? (
                                <Link
                                  href={`/admin/documents/${target.generatedDocumentId}`}
                                  className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/70 shadow-sm transition-all duration-200 hover:bg-white/10 hover:border-white/20 active:scale-[0.98]"
                                >
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
                <div className="px-6 py-16 text-center text-sm text-white/40">
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
