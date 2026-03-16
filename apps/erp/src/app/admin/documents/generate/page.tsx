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
  id: string;
  floorNumber: number;
  buildingName: string;
};

type RoomOption = {
  id: string;
  roomNumber: string;
  floorId: string;
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
  { value: 'SINGLE_ROOM', label: 'Single room' },
  { value: 'SELECTED_ROOMS', label: 'Selected rooms' },
  { value: 'FLOOR', label: 'All rooms in floor' },
  { value: 'ELIGIBLE_FOR_MONTH', label: 'All eligible rooms for month' },
  { value: 'OCCUPIED_ROOMS', label: 'Only occupied rooms' },
  { value: 'ROOMS_WITH_BILLING', label: 'Only rooms with billing' },
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
          fetch('/api/rooms?pageSize=400', { cache: 'no-store' }).then((response) => response.json()),
        ]);

        setTemplates((templatesResponse.data?.data ?? []).filter((template: TemplateOption) => template.activeVersionId));
        setFloors(floorsResponse.data ?? []);
        setRooms(roomsResponse.data?.data ?? []);
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : 'Unable to load generation inputs');
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
    return rooms.filter((room) => room.roomNumber.toLowerCase().includes(search.toLowerCase()));
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
        throw new Error(json.error?.message ?? 'Unable to preview generation');
      }
      setPreview(json.data as PreviewResponse);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to preview generation');
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
        throw new Error(json.error?.message ?? 'Unable to generate documents');
      }
      setJob(json.data as JobResponse);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to generate documents');
    } finally {
      setWorking(null);
    }
  }

  return (
    <main className="admin-page">
      <section className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Generate Documents</h1>
          <p className="admin-page-subtitle">
            Mail-merge style generation that produces one saved document per room from live ERP data.
          </p>
        </div>
        <div className="admin-toolbar">
          <Link href="/admin/templates" className="admin-button">
            Manage Templates
          </Link>
          <Link href="/admin/documents" className="admin-button">
            View Registry
          </Link>
        </div>
      </section>

      {error ? <div className="auth-alert auth-alert-error">{error}</div> : null}

      {loading ? (
        <div className="py-16 text-center text-slate-500">Loading generation inputs...</div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
          <section className="admin-card">
            <div className="admin-card-header">
              <div className="admin-card-title flex items-center gap-2">
                <Wand2 className="h-4 w-4 text-indigo-500" />
                Generation Scope
              </div>
            </div>
            <div className="space-y-4 p-5">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Template</label>
                <select className="admin-select" value={selectedTemplateId} onChange={(event) => setSelectedTemplateId(event.target.value)}>
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name} · {template.type.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Scope</label>
                <select className="admin-select" value={scope} onChange={(event) => setScope(event.target.value as (typeof SCOPES)[number]['value'])}>
                  {SCOPES.map((scopeOption) => (
                    <option key={scopeOption.value} value={scopeOption.value}>
                      {scopeOption.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">Year</label>
                  <input className="admin-input" type="number" value={year} onChange={(event) => setYear(Number(event.target.value))} />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">Month</label>
                  <input className="admin-input" type="number" min={1} max={12} value={month} onChange={(event) => setMonth(Number(event.target.value))} />
                </div>
              </div>

              {scope === 'SINGLE_ROOM' ? (
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">Room</label>
                  <select className="admin-select" value={selectedRoomId} onChange={(event) => setSelectedRoomId(event.target.value)}>
                    <option value="">Select room</option>
                    {rooms.map((room) => (
                      <option key={room.id} value={room.id}>
                        {room.roomNumber}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              {scope === 'SELECTED_ROOMS' ? (
                <div className="space-y-3">
                  <label className="block text-sm font-medium text-slate-700">Selected Rooms</label>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      className="admin-input pl-9"
                      placeholder="Search room number..."
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                    />
                  </div>
                  <div className="max-h-[220px] space-y-2 overflow-auto rounded-[1.5rem] border border-slate-200 bg-slate-50/70 p-3">
                    {filteredRooms.map((room) => (
                      <label key={room.id} className="flex items-center gap-3 rounded-[1rem] bg-white px-3 py-2.5 text-sm text-slate-700 shadow-sm">
                        <input
                          type="checkbox"
                          checked={selectedRoomIds.includes(room.id)}
                          onChange={(event) => {
                            setSelectedRoomIds((current) =>
                              event.target.checked
                                ? [...current, room.id]
                                : current.filter((roomId) => roomId !== room.id),
                            );
                          }}
                        />
                        <span className="font-medium">{room.roomNumber}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}

              {scope === 'FLOOR' ? (
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">Floor</label>
                  <select className="admin-select" value={floorNumber} onChange={(event) => setFloorNumber(event.target.value ? Number(event.target.value) : '')}>
                    <option value="">Select floor</option>
                    {floors.map((floor) => (
                      <option key={floor.id} value={floor.floorNumber}>
                        Floor {floor.floorNumber} · {floor.buildingName}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              <label className="flex items-center gap-3 rounded-[1.25rem] border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm text-slate-700">
                <input type="checkbox" checked={onlyOccupiedRooms} onChange={(event) => setOnlyOccupiedRooms(event.target.checked)} />
                Only occupied rooms
              </label>
              <label className="flex items-center gap-3 rounded-[1.25rem] border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm text-slate-700">
                <input type="checkbox" checked={onlyRoomsWithBillingRecord} onChange={(event) => setOnlyRoomsWithBillingRecord(event.target.checked)} />
                Only rooms with billing record
              </label>
              <label className="flex items-center gap-3 rounded-[1.25rem] border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm text-slate-700">
                <input type="checkbox" checked={includeZipBundle} onChange={(event) => setIncludeZipBundle(event.target.checked)} />
                Create ZIP bundle for successful PDFs
              </label>

              <div className="flex gap-3 pt-2">
                <button type="button" className="admin-button flex-1" onClick={() => void runPreview()} disabled={working !== null || !selectedTemplateId}>
                  {working === 'preview' ? 'Previewing...' : 'Dry-run Preview'}
                </button>
                <button type="button" className="admin-button admin-button-primary flex-1" onClick={() => void runGeneration()} disabled={working !== null || !selectedTemplateId}>
                  {working === 'generate' ? 'Generating...' : 'Generate'}
                </button>
              </div>
            </div>
          </section>

          <div className="space-y-6">
            <section className="admin-card">
              <div className="admin-card-header">
                <div className="admin-card-title flex items-center gap-2">
                  <Layers3 className="h-4 w-4 text-indigo-500" />
                  Dry-run Result
                </div>
              </div>
              {preview ? (
                <>
                  <div className="grid gap-4 p-5 sm:grid-cols-4">
                    <div className="admin-kpi">
                      <div className="admin-kpi-label">Requested</div>
                      <div className="admin-kpi-value">{preview.totalRequested}</div>
                    </div>
                    <div className="admin-kpi">
                      <div className="admin-kpi-label">Ready</div>
                      <div className="admin-kpi-value">{preview.readyCount}</div>
                    </div>
                    <div className="admin-kpi">
                      <div className="admin-kpi-label">Skipped</div>
                      <div className="admin-kpi-value">{preview.skippedCount}</div>
                    </div>
                    <div className="admin-kpi">
                      <div className="admin-kpi-label">Failed</div>
                      <div className="admin-kpi-value">{preview.failedCount}</div>
                    </div>
                  </div>
                  <div className="overflow-auto">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Room</th>
                          <th>Floor</th>
                          <th>Tenant</th>
                          <th>Status</th>
                          <th>Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.targets.map((target) => (
                          <tr key={target.roomId}>
                            <td className="font-semibold text-slate-900">{target.roomNumber}</td>
                            <td>{target.floorNumber ?? '—'}</td>
                            <td>{target.tenantName ?? '—'}</td>
                            <td>
                              <span className={`admin-badge ${
                                target.status === 'READY'
                                  ? 'admin-status-good'
                                  : target.status === 'FAILED'
                                    ? 'admin-status-bad'
                                    : 'admin-status-warn'
                              }`}
                              >
                                {target.status}
                              </span>
                            </td>
                            <td className="text-sm text-slate-500">{target.reason ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <div className="px-6 py-16 text-center text-sm text-slate-500">
                  Run dry-run preview first to see how many room-specific documents will be generated.
                </div>
              )}
            </section>

            <section className="admin-card">
              <div className="admin-card-header">
                <div className="admin-card-title flex items-center gap-2">
                  <FileOutput className="h-4 w-4 text-indigo-500" />
                  Generation Result
                </div>
              </div>
              {job ? (
                <>
                  <div className="grid gap-4 p-5 sm:grid-cols-3">
                    <div className="admin-kpi">
                      <div className="admin-kpi-label">Success</div>
                      <div className="admin-kpi-value">{job.successCount}</div>
                    </div>
                    <div className="admin-kpi">
                      <div className="admin-kpi-label">Skipped</div>
                      <div className="admin-kpi-value">{job.skippedCount}</div>
                    </div>
                    <div className="admin-kpi">
                      <div className="admin-kpi-label">Failed</div>
                      <div className="admin-kpi-value">{job.failedCount}</div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-3 px-5 pb-5">
                    <Link href="/admin/documents" className="admin-button">
                      Open Document Registry
                    </Link>
                    {job.bundleUrl ? (
                      <a href={job.bundleUrl} className="admin-button admin-button-primary">
                        Download ZIP Bundle
                      </a>
                    ) : null}
                  </div>
                  <div className="overflow-auto">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Room</th>
                          <th>Status</th>
                          <th>Reason</th>
                          <th>Document</th>
                        </tr>
                      </thead>
                      <tbody>
                        {job.targets.map((target) => (
                          <tr key={target.id}>
                            <td className="font-semibold text-slate-900">{target.roomNumber}</td>
                            <td>
                              <span className={`admin-badge ${
                                target.status === 'SUCCESS'
                                  ? 'admin-status-good'
                                  : target.status === 'FAILED'
                                    ? 'admin-status-bad'
                                    : 'admin-status-warn'
                              }`}
                              >
                                {target.status}
                              </span>
                            </td>
                            <td className="text-sm text-slate-500">{target.reason ?? '—'}</td>
                            <td>
                              {target.generatedDocumentId ? (
                                <Link href={`/admin/documents/${target.generatedDocumentId}`} className="admin-button text-xs">
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
                <div className="px-6 py-16 text-center text-sm text-slate-500">
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
