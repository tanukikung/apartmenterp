'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Building2, DoorOpen, RefreshCw, Wrench } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RoomStatus = 'VACANT' | 'OCCUPIED' | 'MAINTENANCE' | 'SELF_USE' | 'UNAVAILABLE';

type OccupancyData = {
  totalRooms?: number;
  occupied?: number;
  vacant?: number;
  maintenance?: number;
  selfUse?: number;
  unavailable?: number;
  occupancyRate?: number;
  byFloor?: FloorOccupancy[];
};

type FloorOccupancy = {
  floorId?: string;
  floorNumber: number;
  total: number;
  occupied: number;
  vacant: number;
  maintenance?: number;
  occupancyRate?: number;
};

type Room = {
  id: string;
  roomNumber: string;
  status: RoomStatus;
  floor?: { id: string; floorNumber: number } | null;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<string, { bar: string; label: string; text: string }> = {
  OCCUPIED: { bar: 'bg-indigo-500', label: 'Occupied', text: 'text-indigo-700' },
  VACANT: { bar: 'bg-emerald-500', label: 'Vacant', text: 'text-emerald-700' },
  MAINTENANCE: { bar: 'bg-amber-400', label: 'Maintenance', text: 'text-amber-700' },
  SELF_USE: { bar: 'bg-slate-400', label: 'Self Use', text: 'text-slate-600' },
  UNAVAILABLE: { bar: 'bg-red-400', label: 'Unavailable', text: 'text-red-700' },
};

const STATUS_ORDER: RoomStatus[] = ['OCCUPIED', 'VACANT', 'MAINTENANCE', 'SELF_USE', 'UNAVAILABLE'];

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = [CURRENT_YEAR - 2, CURRENT_YEAR - 1, CURRENT_YEAR];
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pct(part: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((part / total) * 100);
}

function rateColor(rate: number): string {
  if (rate >= 85) return 'text-emerald-700';
  if (rate >= 65) return 'text-amber-600';
  return 'text-red-600';
}

function rateBarColor(rate: number): string {
  if (rate >= 85) return 'bg-emerald-500';
  if (rate >= 65) return 'bg-amber-400';
  return 'bg-red-500';
}

function deriveFromRooms(rooms: Room[]): {
  counts: Record<RoomStatus, number>;
  byFloor: FloorOccupancy[];
  total: number;
} {
  const counts: Record<RoomStatus, number> = {
    OCCUPIED: 0,
    VACANT: 0,
    MAINTENANCE: 0,
    SELF_USE: 0,
    UNAVAILABLE: 0,
  };

  const floorMap = new Map<
    number,
    { floorNumber: number; total: number; occupied: number; vacant: number; maintenance: number }
  >();

  for (const room of rooms) {
    const s = room.status;
    if (s in counts) counts[s]++;
    const fn = room.floor?.floorNumber ?? 0;
    if (!floorMap.has(fn)) {
      floorMap.set(fn, { floorNumber: fn, total: 0, occupied: 0, vacant: 0, maintenance: 0 });
    }
    const fl = floorMap.get(fn)!;
    fl.total++;
    if (s === 'OCCUPIED') fl.occupied++;
    if (s === 'VACANT') fl.vacant++;
    if (s === 'MAINTENANCE') fl.maintenance++;
  }

  const byFloor: FloorOccupancy[] = Array.from(floorMap.values())
    .sort((a, b) => a.floorNumber - b.floorNumber)
    .map((f) => ({
      ...f,
      occupancyRate: pct(f.occupied, f.total),
    }));

  return { counts, byFloor, total: rooms.length };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function KpiCard({
  label,
  value,
  sub,
  icon,
  iconBg,
  iconColor,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
}) {
  return (
    <div className="admin-kpi">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="admin-kpi-label">{label}</div>
          <div className="admin-kpi-value">{value}</div>
          {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
        </div>
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border shadow-sm ${iconBg} ${iconColor}`}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function OccupancyReportPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [fromMonth, setFromMonth] = useState(1);
  const [toMonth, setToMonth] = useState(now.getMonth() + 1);

  const [occupancy, setOccupancy] = useState<OccupancyData | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [occRes, roomsRes] = await Promise.all([
        fetch('/api/analytics/occupancy', { cache: 'no-store' }).then((r) => r.json()),
        fetch('/api/rooms?pageSize=100', { cache: 'no-store' }).then((r) => r.json()),
      ]);

      if (occRes.success) {
        setOccupancy(occRes.data as OccupancyData);
      }

      if (roomsRes.success) {
        const list: Room[] = roomsRes.data?.data ?? roomsRes.data ?? [];
        setRooms(list);
      } else {
        throw new Error(roomsRes.error?.message || 'Unable to load rooms');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load occupancy data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Derive stats from rooms data (rooms API is always available)
  const derived = useMemo(() => deriveFromRooms(rooms), [rooms]);

  // Prefer API occupancy data if available, otherwise derive from rooms
  const totalRooms = occupancy?.totalRooms ?? derived.total;
  const occupied = occupancy?.occupied ?? derived.counts.OCCUPIED;
  const vacant = occupancy?.vacant ?? derived.counts.VACANT;
  const maintenance = occupancy?.maintenance ?? derived.counts.MAINTENANCE;
  const selfUse = occupancy?.selfUse ?? derived.counts.SELF_USE;
  const unavailable = occupancy?.unavailable ?? derived.counts.UNAVAILABLE;
  const occupancyRate = occupancy?.occupancyRate ?? pct(occupied, totalRooms);

  const byFloor: FloorOccupancy[] =
    (occupancy?.byFloor && occupancy.byFloor.length > 0)
      ? occupancy.byFloor
      : derived.byFloor;

  // Status distribution data
  const distribution: { status: RoomStatus; count: number }[] = [
    { status: 'OCCUPIED', count: occupied },
    { status: 'VACANT', count: vacant },
    { status: 'MAINTENANCE', count: maintenance },
    { status: 'SELF_USE', count: selfUse },
    { status: 'UNAVAILABLE', count: unavailable },
  ];

  return (
    <main className="admin-page">
      {/* Header */}
      <section className="admin-page-header">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/reports"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white shadow-sm hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4 text-slate-600" />
          </Link>
          <div>
            <h1 className="admin-page-title">Occupancy Report</h1>
            <p className="admin-page-subtitle">Room occupancy breakdown across floors and status categories</p>
          </div>
        </div>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="admin-button flex items-center gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </section>

      {error && <div className="auth-alert auth-alert-error">{error}</div>}

      {/* Date range selector */}
      <section className="admin-card p-4">
        <div className="flex flex-wrap items-center gap-4">
          <span className="text-sm font-medium text-slate-600">Period:</span>
          <div className="flex items-center gap-2">
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="admin-select"
            >
              {YEARS.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-500">Month:</span>
            <select
              value={fromMonth}
              onChange={(e) => setFromMonth(Number(e.target.value))}
              className="admin-select"
            >
              {MONTHS.map((m) => (
                <option key={m} value={m}>
                  {new Date(2000, m - 1).toLocaleString('en', { month: 'short' })}
                </option>
              ))}
            </select>
            <span className="text-sm text-slate-400">–</span>
            <select
              value={toMonth}
              onChange={(e) => setToMonth(Number(e.target.value))}
              className="admin-select"
            >
              {MONTHS.map((m) => (
                <option key={m} value={m}>
                  {new Date(2000, m - 1).toLocaleString('en', { month: 'short' })}
                </option>
              ))}
            </select>
          </div>
          <span className="text-xs text-slate-400">
            Current snapshot — filters shown for reference
          </span>
        </div>
      </section>

      {/* KPI cards */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard
          label="Total Rooms"
          value={loading ? '...' : totalRooms}
          icon={<Building2 className="h-5 w-5" />}
          iconBg="border-slate-200 bg-slate-50"
          iconColor="text-slate-600"
        />
        <KpiCard
          label="Occupied"
          value={loading ? '...' : occupied}
          sub={`${pct(occupied, totalRooms)}% of total`}
          icon={<DoorOpen className="h-5 w-5" />}
          iconBg="border-indigo-200 bg-indigo-50"
          iconColor="text-indigo-600"
        />
        <KpiCard
          label="Vacant"
          value={loading ? '...' : vacant}
          sub={`${pct(vacant, totalRooms)}% of total`}
          icon={<DoorOpen className="h-5 w-5" />}
          iconBg="border-emerald-200 bg-emerald-50"
          iconColor="text-emerald-600"
        />
        <KpiCard
          label="Maintenance"
          value={loading ? '...' : maintenance}
          sub={`${pct(maintenance, totalRooms)}% of total`}
          icon={<Wrench className="h-5 w-5" />}
          iconBg="border-amber-200 bg-amber-50"
          iconColor="text-amber-600"
        />
        <KpiCard
          label="Occupancy Rate"
          value={
            loading ? '...' : (
              <span className={rateColor(occupancyRate)}>{occupancyRate}%</span>
            )
          }
          sub="occupied / total"
          icon={
            <span className={`text-base font-bold ${rateColor(occupancyRate)}`}>
              {loading ? '?' : `${occupancyRate}%`}
            </span>
          }
          iconBg="border-violet-200 bg-violet-50"
          iconColor="text-violet-600"
        />
      </section>

      {/* Two-column layout: floor table + distribution */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        {/* Occupancy by floor */}
        <section className="admin-card overflow-hidden">
          <div className="admin-card-header">
            <div className="admin-card-title">Occupancy by Floor</div>
            <span className="admin-badge">{byFloor.length} floors</span>
          </div>
          <div className="overflow-auto">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Floor</th>
                  <th>Total</th>
                  <th>Occupied</th>
                  <th>Vacant</th>
                  <th>Maintenance</th>
                  <th>Occupancy %</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-500">
                      Loading floor data...
                    </td>
                  </tr>
                ) : byFloor.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-500">
                      No floor data available.
                    </td>
                  </tr>
                ) : (
                  byFloor.map((fl) => {
                    const rate = fl.occupancyRate ?? pct(fl.occupied, fl.total);
                    return (
                      <tr key={fl.floorNumber}>
                        <td>
                          <span className="font-semibold text-slate-800">
                            ชั้น {fl.floorNumber}
                          </span>
                        </td>
                        <td className="tabular-nums font-medium text-slate-700">{fl.total}</td>
                        <td>
                          <span className="font-semibold text-indigo-700 tabular-nums">
                            {fl.occupied}
                          </span>
                        </td>
                        <td>
                          <span className="font-medium text-emerald-700 tabular-nums">
                            {fl.vacant}
                          </span>
                        </td>
                        <td>
                          <span className="font-medium text-amber-600 tabular-nums">
                            {fl.maintenance ?? 0}
                          </span>
                        </td>
                        <td>
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100">
                              <div
                                className={`h-full rounded-full transition-all ${rateBarColor(rate)}`}
                                style={{ width: `${Math.min(rate, 100)}%` }}
                              />
                            </div>
                            <span className={`text-sm font-semibold tabular-nums ${rateColor(rate)}`}>
                              {rate}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Status distribution */}
        <section className="admin-card p-5">
          <div className="admin-card-title mb-4">Status Distribution</div>
          {loading ? (
            <div className="py-8 text-center text-sm text-slate-500">Loading...</div>
          ) : (
            <div className="flex flex-col gap-4">
              {/* Stacked bar */}
              <div className="flex h-4 w-full overflow-hidden rounded-full">
                {distribution
                  .filter((d) => d.count > 0)
                  .map((d) => {
                    const width = pct(d.count, totalRooms);
                    const cfg = STATUS_COLORS[d.status];
                    return (
                      <div
                        key={d.status}
                        className={`${cfg.bar} transition-all first:rounded-l-full last:rounded-r-full`}
                        style={{ width: `${width}%` }}
                        title={`${cfg.label}: ${d.count} (${width}%)`}
                      />
                    );
                  })}
              </div>

              {/* Legend + bars */}
              <div className="flex flex-col gap-3">
                {STATUS_ORDER.map((status) => {
                  const entry = distribution.find((d) => d.status === status);
                  const count = entry?.count ?? 0;
                  const cfg = STATUS_COLORS[status];
                  const rate = pct(count, totalRooms);
                  return (
                    <div key={status} className="flex flex-col gap-1">
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <span className={`h-3 w-3 rounded-sm ${cfg.bar}`} />
                          <span className="font-medium text-slate-700">{cfg.label}</span>
                        </div>
                        <div className="flex items-center gap-2 tabular-nums">
                          <span className={`font-semibold ${cfg.text}`}>{count}</span>
                          <span className="text-slate-400">·</span>
                          <span className="text-slate-500">{rate}%</span>
                        </div>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={`h-full rounded-full ${cfg.bar}`}
                          style={{ width: `${rate}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Total */}
              <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-3">
                <span className="text-sm font-semibold text-slate-600">Total Rooms</span>
                <span className="text-lg font-bold text-slate-800 tabular-nums">{totalRooms}</span>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
