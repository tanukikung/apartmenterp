'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Building2, DoorOpen, Users, AlertTriangle, ChevronRight } from 'lucide-react';
import Link from 'next/link';

type FloorOption = {
  floorNo: number;
  label: string;
};

type Room = {
  roomNo: string;
  floorNo: number;
  roomStatus: 'VACANT' | 'OCCUPIED' | 'MAINTENANCE' | 'OWNER_USE';
};

type FloorStats = {
  floor: FloorOption;
  total: number;
  occupied: number;
  vacant: number;
  maintenance: number;
  ownerUse: number;
};

function occupancyColor(rate: number): string {
  if (rate >= 70) return 'border-emerald-500/30';
  if (rate >= 40) return 'border-amber-500/30';
  return 'border-blue-500/30';
}

function occupancyBarColor(rate: number): string {
  if (rate >= 70) return 'bg-gradient-to-r from-emerald-500 to-emerald-400';
  if (rate >= 40) return 'bg-gradient-to-r from-amber-500 to-amber-400';
  return 'bg-gradient-to-r from-blue-500 to-blue-400';
}

function occupancyTextColor(rate: number): string {
  if (rate >= 70) return 'text-emerald-600';
  if (rate >= 40) return 'text-amber-600';
  return 'text-blue-600';
}

function occupancyGlow(rate: number): string {
  if (rate >= 70) return 'hover:shadow-[0_0_24px_rgba(34,197,94,0.15)]';
  if (rate >= 40) return 'hover:shadow-[0_0_24px_rgba(251,191,36,0.15)]';
  return 'hover:shadow-[0_0_24px_rgba(59,130,246,0.15)]';
}

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-2xl border border-white/5 bg-[hsl(var(--color-surface))] p-5">
      <div className="mb-4 h-7 w-24 rounded-full bg-[hsl(var(--color-surface))]" />
      <div className="mb-3 grid grid-cols-2 gap-2">
        <div className="h-14 rounded-xl bg-[hsl(var(--color-surface))]" />
        <div className="h-14 rounded-xl bg-[hsl(var(--color-surface))]" />
        <div className="h-14 rounded-xl bg-[hsl(var(--color-surface))]" />
        <div className="h-14 rounded-xl bg-[hsl(var(--color-surface))]" />
      </div>
      <div className="mb-3 h-2 rounded-full bg-[hsl(var(--color-surface))]" />
      <div className="h-9 rounded-xl bg-[hsl(var(--color-surface))]" />
    </div>
  );
}

async function fetchFloors(): Promise<{ data: FloorOption[] }> {
  const res = await fetch('/api/floors', { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch floors');
  const json = await res.json();
  if (!json.success) throw new Error(json.error?.message ?? 'Request failed');
  return json.data;
}

async function fetchRooms(): Promise<{ data: Room[] }> {
  const res = await fetch('/api/rooms?pageSize=50', { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch rooms');
  const json = await res.json();
  if (!json.success) throw new Error(json.error?.message ?? 'Request failed');
  return json.data;
}

export default function AdminFloorsPage() {
  const { data: floorsData, isLoading: floorsLoading, error: floorsError } = useQuery<{ data: FloorOption[] }>({
    queryKey: ['floors'],
    queryFn: fetchFloors,
  });
  const { data: roomsData, isLoading: roomsLoading, error: roomsError } = useQuery<{ data: Room[] }>({
    queryKey: ['rooms'],
    queryFn: fetchRooms,
  });

  const isLoading = floorsLoading || roomsLoading;
  const error = floorsError || roomsError;

  const floorStats = useMemo((): FloorStats[] => {
    const floorList: FloorOption[] = floorsData?.data ?? [];
    const roomList: Room[] = roomsData?.data ?? [];
    const roomsByFloor = new Map<number, Room[]>();
    for (const room of roomList) {
      const list = roomsByFloor.get(room.floorNo) ?? [];
      list.push(room);
      roomsByFloor.set(room.floorNo, list);
    }
    return floorList.map((floor) => {
      const rooms = roomsByFloor.get(floor.floorNo) ?? [];
      return {
        floor,
        total: rooms.length,
        occupied: rooms.filter((r) => r.roomStatus === 'OCCUPIED').length,
        vacant: rooms.filter((r) => r.roomStatus === 'VACANT').length,
        maintenance: rooms.filter((r) => r.roomStatus === 'MAINTENANCE').length,
        ownerUse: rooms.filter((r) => r.roomStatus === 'OWNER_USE').length,
      };
    });
  }, [floorsData, roomsData]);

  const totals = floorStats.reduce(
    (acc, fs) => ({
      floors: acc.floors + 1,
      rooms: acc.rooms + fs.total,
      occupied: acc.occupied + fs.occupied,
      vacant: acc.vacant + fs.vacant,
      maintenance: acc.maintenance + fs.maintenance,
      ownerUse: acc.ownerUse + fs.ownerUse,
    }),
    { floors: 0, rooms: 0, occupied: 0, vacant: 0, maintenance: 0, ownerUse: 0 }
  );

  return (
    <main className="space-y-6">
      {/* Page header */}
      <section className="rounded-2xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-6 py-5"
        style={{ boxShadow: '0 4px 16px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.04)' }}
      >
        <div className="flex items-center gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-primary/30 bg-primary/10">
            <Building2 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-[hsl(var(--on-surface))]">ชั้น</h1>
            <p className="text-sm text-[hsl(var(--on-surface-variant))] opacity-70">ภาพรวมชั้นของอาคารและการจัดการห้อง</p>
          </div>
        </div>
      </section>

      {error ? (
        <div className="auth-alert auth-alert-error">{error instanceof Error ? error.message : String(error)}</div>
      ) : null}

      {/* Stats row */}
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <div className="rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] p-5 transition-all duration-300 hover:shadow-[0_2px_8px_rgba(0,0,0,0.08)] hover:border-[hsl(var(--color-border))]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))] opacity-70">จำนวนชั้นทั้งหมด</div>
              <div className="text-xl font-semibold text-[hsl(var(--on-surface))] mt-0.5">{isLoading ? '...' : totals.floors}</div>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 shadow-[0_0_20px_rgba(99,102,241,0.15)]">
              <Building2 className="h-5 w-5 text-primary" />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] p-5 transition-all duration-300 hover:shadow-[0_2px_8px_rgba(0,0,0,0.08)] hover:border-[hsl(var(--color-border))]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))] opacity-70">จำนวนห้องทั้งหมด</div>
              <div className="text-xl font-semibold text-[hsl(var(--on-surface))] mt-0.5">{isLoading ? '...' : totals.rooms}</div>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))]">
              <DoorOpen className="h-5 w-5 text-[hsl(var(--on-surface-variant))]" />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-emerald-500/20 bg-[hsl(var(--color-surface))] p-5 transition-all duration-300 hover:shadow-[0_2px_8px_rgba(34,197,94,0.15)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))] opacity-70">มีผู้เช่า</div>
              <div className="text-xl font-semibold text-emerald-600 mt-0.5">{isLoading ? '...' : totals.occupied}</div>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/10 shadow-[0_0_12px_rgba(34,197,94,0.15)]">
              <Users className="h-5 w-5 text-emerald-600" />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-blue-500/20 bg-[hsl(var(--color-surface))] p-5 transition-all duration-300 hover:shadow-[0_2px_8px_rgba(59,130,246,0.15)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))] opacity-70">ว่าง</div>
              <div className="text-xl font-semibold text-blue-600 mt-0.5">{isLoading ? '...' : totals.vacant}</div>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-blue-500/20 bg-blue-500/10 shadow-[0_0_12px_rgba(59,130,246,0.15)]">
              <AlertTriangle className="h-5 w-5 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-amber-500/20 bg-[hsl(var(--color-surface))] p-5 transition-all duration-300 hover:shadow-[0_2px_8px_rgba(251,191,36,0.15)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))] opacity-70">ซ่อมบำรุง</div>
              <div className="text-xl font-semibold text-amber-600 mt-0.5">{isLoading ? '...' : totals.maintenance}</div>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-amber-500/20 bg-amber-500/10 shadow-[0_0_12px_rgba(251,191,36,0.15)]">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] p-5 transition-all duration-300 hover:shadow-[0_2px_8px_rgba(0,0,0,0.08)] hover:border-[hsl(var(--color-border))]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))] opacity-70">ใช้เอง</div>
              <div className="text-xl font-semibold text-[hsl(var(--on-surface))] mt-0.5">{isLoading ? '...' : totals.ownerUse}</div>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))]">
              <DoorOpen className="h-5 w-5 text-[hsl(var(--on-surface-variant))]" />
            </div>
          </div>
        </div>
      </section>

      {/* Floor cards grid */}
      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
        ) : floorStats.length === 0 ? (
          <div className="col-span-3 rounded-2xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] p-10 text-center text-[hsl(var(--on-surface-variant))] shadow-lg">
            ไม่พบข้อมูลชั้น กรุณาตรวจสอบว่าข้อมูลถูกนำเข้าแล้ว
          </div>
        ) : (
          floorStats.map((fs) => {
            const rate = fs.total > 0 ? Math.round((fs.occupied / fs.total) * 100) : 0;
            return (
              <div
                key={fs.floor.floorNo}
                className={`rounded-2xl border bg-[hsl(var(--color-surface))] ${occupancyColor(rate)} p-5 transition-all duration-300 active:scale-[0.98] ${occupancyGlow(rate)}`}
                style={{ boxShadow: '0 4px 16px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.04)' }}
              >
                {/* Floor header */}
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Building2 className={`h-5 w-5 ${occupancyTextColor(rate)}`} />
                    <span className={`text-xl font-bold ${occupancyTextColor(rate)}`}>
                      ชั้น {fs.floor.floorNo}
                    </span>
                  </div>
                  <span className="rounded-full border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-3 py-0.5 text-xs font-semibold text-[hsl(var(--on-surface-variant))] shadow-[0_0_8px_rgba(0,0,0,0.2)]">
                    {rate}% active
                  </span>
                </div>

                {/* Room counts */}
                <div className="mb-4 grid grid-cols-2 gap-2">
                  <div className="rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] p-3 text-center">
                    <div className="text-[10px] font-medium uppercase tracking-wide text-[hsl(var(--on-surface-variant))] opacity-60">ทั้งหมด</div>
                    <div className="mt-0.5 text-2xl font-bold text-[hsl(var(--on-surface))]">{fs.total}</div>
                  </div>
                  <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-center">
                    <div className="text-[10px] font-medium uppercase tracking-wide text-emerald-600/80">มีผู้เช่า</div>
                    <div className="mt-0.5 text-2xl font-bold text-emerald-600">{fs.occupied}</div>
                  </div>
                  <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-3 text-center">
                    <div className="text-[10px] font-medium uppercase tracking-wide text-blue-600/80">ว่าง</div>
                    <div className="mt-0.5 text-2xl font-bold text-blue-600">{fs.vacant}</div>
                  </div>
                  <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-center">
                    <div className="text-[10px] font-medium uppercase tracking-wide text-amber-600/80">ซ่อมบำรุง</div>
                    <div className="mt-0.5 text-2xl font-bold text-amber-600">{fs.maintenance}</div>
                  </div>
                  <div className="col-span-2 rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] p-3 text-center">
                    <div className="text-[10px] font-medium uppercase tracking-wide text-[hsl(var(--on-surface-variant))] opacity-60">ใช้เอง</div>
                    <div className="mt-0.5 text-2xl font-bold text-[hsl(var(--on-surface))]">{fs.ownerUse}</div>
                  </div>
                </div>

                {/* Occupancy progress bar */}
                <div className="mb-4">
                  <div className="h-2.5 overflow-hidden rounded-full border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))]">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${occupancyBarColor(rate)}`}
                      style={{ width: `${rate}%` }}
                    />
                  </div>
                </div>

                {/* ดูรายการห้อง button */}
                <Link
                  href={`/admin/rooms?floorNo=${fs.floor.floorNo}`}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-4 py-2.5 text-sm font-semibold text-primary shadow-[0_0_12px_rgba(99,102,241,0.1)] transition-all duration-200 hover:bg-primary/20 hover:border-primary/50 active:scale-[0.98]"
                >
                  ดูรายการห้อง
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
