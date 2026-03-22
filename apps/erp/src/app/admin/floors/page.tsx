'use client';

import { useEffect, useState } from 'react';
import { Building2, DoorOpen, Users, AlertTriangle, ChevronRight } from 'lucide-react';
import Link from 'next/link';

type FloorOption = {
  floorNo: number;
  label: string;
};

type Room = {
  roomNo: string;
  floorNo: number;
  roomStatus: 'ACTIVE' | 'INACTIVE';
};

type FloorStats = {
  floor: FloorOption;
  total: number;
  active: number;
  inactive: number;
};

function occupancyColor(rate: number): string {
  if (rate >= 70) return 'border-emerald-200 bg-emerald-50';
  if (rate >= 40) return 'border-amber-200 bg-amber-50';
  return 'border-sky-200 bg-sky-50';
}

function occupancyBarColor(rate: number): string {
  if (rate >= 70) return 'bg-emerald-500';
  if (rate >= 40) return 'bg-amber-400';
  return 'bg-sky-400';
}

function occupancyTextColor(rate: number): string {
  if (rate >= 70) return 'text-emerald-700';
  if (rate >= 40) return 'text-amber-700';
  return 'text-sky-700';
}

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 h-7 w-24 rounded-full bg-slate-200" />
      <div className="mb-3 grid grid-cols-2 gap-2">
        <div className="h-14 rounded-2xl bg-slate-100" />
        <div className="h-14 rounded-2xl bg-slate-100" />
        <div className="h-14 rounded-2xl bg-slate-100" />
        <div className="h-14 rounded-2xl bg-slate-100" />
      </div>
      <div className="mb-3 h-2 rounded-full bg-slate-200" />
      <div className="h-9 rounded-2xl bg-slate-100" />
    </div>
  );
}

export default function AdminFloorsPage() {
  const [floorStats, setFloorStats] = useState<FloorStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const floorsRes = await fetch('/api/floors', { cache: 'no-store' }).then((r) => r.json());
        if (!floorsRes.success) throw new Error(floorsRes.error?.message || 'Unable to load floors');

        const floors: FloorOption[] = floorsRes.data;

        const roomResults = await Promise.all(
          floors.map((floor) =>
            fetch(`/api/rooms?floorNo=${floor.floorNo}&pageSize=100`, { cache: 'no-store' })
              .then((r) => r.json())
              .then((res) => {
                const rooms: Room[] = res.success ? (res.data?.data ?? res.data ?? []) : [];
                return { floor, rooms };
              })
          )
        );

        const stats: FloorStats[] = roomResults.map(({ floor, rooms }) => ({
          floor,
          total: rooms.length,
          active: rooms.filter((r) => r.roomStatus === 'ACTIVE').length,
          inactive: rooms.filter((r) => r.roomStatus === 'INACTIVE').length,
        }));

        stats.sort((a, b) => a.floor.floorNo - b.floor.floorNo);
        setFloorStats(stats);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to load floor data');
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, []);

  const totals = floorStats.reduce(
    (acc, fs) => ({
      floors: acc.floors + 1,
      rooms: acc.rooms + fs.total,
      active: acc.active + fs.active,
      inactive: acc.inactive + fs.inactive,
    }),
    { floors: 0, rooms: 0, active: 0, inactive: 0 }
  );

  return (
    <main className="space-y-6">
      <section className="rounded-2xl border border-outline-variant/10 bg-gradient-to-br from-primary-container to-primary px-6 py-5">
        <div>
          <h1 className="text-xl font-semibold text-on-primary">Floors</h1>
          <p className="text-sm text-on-primary/80">Building floor overview &amp; room management</p>
        </div>
      </section>

      {error ? (
        <div className="auth-alert auth-alert-error">{error}</div>
      ) : null}

      {/* Stats row */}
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Total Floors</div>
              <div className="text-xl font-semibold text-on-surface mt-0.5">{loading ? '...' : totals.floors}</div>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 shadow-sm">
              <Building2 className="h-5 w-5 text-primary" />
            </div>
          </div>
        </div>

        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Total Rooms</div>
              <div className="text-xl font-semibold text-on-surface mt-0.5">{loading ? '...' : totals.rooms}</div>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-outline-variant bg-surface-container shadow-sm">
              <DoorOpen className="h-5 w-5 text-on-surface-variant" />
            </div>
          </div>
        </div>

        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Active Rooms</div>
              <div className="text-xl font-semibold text-on-surface mt-0.5">{loading ? '...' : totals.active}</div>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 shadow-sm">
              <Users className="h-5 w-5 text-emerald-600" />
            </div>
          </div>
        </div>

        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Inactive Rooms</div>
              <div className="text-xl font-semibold text-on-surface mt-0.5">{loading ? '...' : totals.inactive}</div>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-sky-200 bg-sky-50 shadow-sm">
              <AlertTriangle className="h-5 w-5 text-sky-500" />
            </div>
          </div>
        </div>
      </section>

      {/* Floor cards grid */}
      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
        ) : floorStats.length === 0 ? (
          <div className="col-span-3 rounded-3xl border border-slate-200 bg-white p-10 text-center text-slate-500 shadow-sm">
            No floors found. Make sure the database is seeded.
          </div>
        ) : (
          floorStats.map((fs) => {
            const rate = fs.total > 0 ? Math.round((fs.active / fs.total) * 100) : 0;
            return (
              <div
                key={fs.floor.floorNo}
                className={`rounded-3xl border p-5 shadow-sm transition-shadow hover:shadow-md ${occupancyColor(rate)}`}
              >
                {/* Floor header */}
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Building2 className={`h-5 w-5 ${occupancyTextColor(rate)}`} />
                    <span className={`text-xl font-bold ${occupancyTextColor(rate)}`}>
                      ชั้น {fs.floor.floorNo}
                    </span>
                  </div>
                  <span className="rounded-full border border-white/60 bg-white/70 px-3 py-0.5 text-xs font-semibold text-slate-600 shadow-sm">
                    {rate}% active
                  </span>
                </div>

                {/* Room counts */}
                <div className="mb-4 grid grid-cols-2 gap-2">
                  <div className="rounded-2xl border border-white/60 bg-white/70 p-3 text-center">
                    <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Total</div>
                    <div className="mt-0.5 text-2xl font-bold text-slate-800">{fs.total}</div>
                  </div>
                  <div className="rounded-2xl border border-white/60 bg-white/70 p-3 text-center">
                    <div className="text-xs font-medium uppercase tracking-wide text-emerald-600">Active</div>
                    <div className="mt-0.5 text-2xl font-bold text-emerald-700">{fs.active}</div>
                  </div>
                  <div className="rounded-2xl border border-white/60 bg-white/70 p-3 text-center">
                    <div className="text-xs font-medium uppercase tracking-wide text-sky-600">Inactive</div>
                    <div className="mt-0.5 text-2xl font-bold text-sky-700">{fs.inactive}</div>
                  </div>
                  <div className="rounded-2xl border border-white/60 bg-white/70 p-3 text-center">
                    <div className="text-xs font-medium uppercase tracking-wide text-amber-600">Occupancy</div>
                    <div className="mt-0.5 text-2xl font-bold text-amber-700">{rate}%</div>
                  </div>
                </div>

                {/* Occupancy progress bar */}
                <div className="mb-4">
                  <div className="h-2.5 overflow-hidden rounded-full bg-white/60">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${occupancyBarColor(rate)}`}
                      style={{ width: `${rate}%` }}
                    />
                  </div>
                </div>

                {/* View Rooms button */}
                <Link
                  href={`/admin/rooms?floorNo=${fs.floor.floorNo}`}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/60 bg-white/80 px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-white hover:text-indigo-700"
                >
                  View Rooms
                  <ChevronRight className="h-4 w-4" />
                </Link>
              </div>
            );
          })
        )}
      </section>
    </main>
  );
}
