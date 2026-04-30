'use client';

import { useEffect, useState } from 'react';
import { Building2, DoorOpen, Users, AlertTriangle, ArrowLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

type RoomStatus = 'VACANT' | 'OCCUPIED' | 'MAINTENANCE' | 'SELF_USE' | 'UNAVAILABLE';

type Room = {
  id?: string;
  roomNo: string;
  roomNumber: string;
  roomStatus: string;
  status?: RoomStatus;
  capacity?: number;
  usageType?: string;
  billingStatus?: string;
  isActive?: boolean;
  floorNo?: number;
  floor?: { floorNumber: number };
};

type Floor = {
  id: string;
  floorNumber: number;
  buildingId: string;
};

type FilterTab = 'ALL' | RoomStatus;

const STATUS_LABELS: Record<RoomStatus, string> = {
  VACANT: 'ว่าง',
  OCCUPIED: 'มีผู้เช่า',
  MAINTENANCE: 'ซ่อมบำรุง',
  SELF_USE: 'ใช้งานส่วนตัว',
  UNAVAILABLE: 'ไม่พร้อม',
};

const STATUS_CARD_STYLE: Record<RoomStatus, { border: string; bg: string; hover: string }> = {
  VACANT: {
    border: 'border-emerald-500/30 hover:border-emerald-500/50',
    bg: 'bg-emerald-500/5',
    hover: 'hover:shadow-[0_0_20px_rgba(34,197,94,0.15)]',
  },
  OCCUPIED: {
    border: 'border-blue-500/30 hover:border-blue-500/50',
    bg: 'bg-blue-500/5',
    hover: 'hover:shadow-[0_0_20px_rgba(59,130,246,0.15)]',
  },
  MAINTENANCE: {
    border: 'border-amber-500/30 hover:border-amber-500/50',
    bg: 'bg-amber-500/5',
    hover: 'hover:shadow-[0_0_20px_rgba(251,191,36,0.15)]',
  },
  SELF_USE: {
    border: 'border-[hsl(var(--color-border))] hover:border-white/20',
    bg: 'bg-[hsl(var(--color-surface))]',
    hover: 'hover:shadow-[0_0_20px_rgba(0,0,0,0.2)]',
  },
  UNAVAILABLE: {
    border: 'border-red-500/30 hover:border-red-500/50',
    bg: 'bg-red-500/5',
    hover: 'hover:shadow-[0_0_20px_rgba(239,68,68,0.15)]',
  },
};

const STATUS_BADGE_STYLE: Record<RoomStatus, string> = {
  VACANT: 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20',
  OCCUPIED: 'bg-blue-500/10 text-blue-600 border border-blue-500/20',
  MAINTENANCE: 'bg-amber-500/10 text-amber-600 border border-amber-500/20',
  SELF_USE: 'bg-white/10 text-[hsl(var(--on-surface-variant))] border border-[hsl(var(--color-border))]',
  UNAVAILABLE: 'bg-red-500/10 text-red-400 border border-red-500/20',
};

const STATUS_NUMBER_COLOR: Record<RoomStatus, string> = {
  VACANT: 'text-emerald-600',
  OCCUPIED: 'text-blue-600',
  MAINTENANCE: 'text-amber-600',
  SELF_USE: 'text-[hsl(var(--on-surface))]',
  UNAVAILABLE: 'text-red-400',
};

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: 'ALL', label: 'ทั้งหมด' },
  { key: 'VACANT', label: 'ว่าง' },
  { key: 'OCCUPIED', label: 'มีผู้เช่า' },
  { key: 'MAINTENANCE', label: 'ซ่อมบำรุง' },
];

function SkeletonRoomCard() {
  return (
    <div className="animate-pulse rounded-xl border border-white/5 bg-[hsl(var(--color-surface))] p-3">
      <div className="mb-2 h-5 w-12 rounded-full bg-[hsl(var(--color-surface))]" />
      <div className="mb-1 h-3 w-16 rounded-full bg-[hsl(var(--color-surface))]" />
      <div className="h-3 w-10 rounded-full bg-[hsl(var(--color-surface))]" />
    </div>
  );
}

export default function FloorDetailPage() {
  const params = useParams();
  const floorId = params?.floorId as string;

  const [floor, setFloor] = useState<Floor | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterTab>('ALL');

  useEffect(() => {
    if (!floorId) return;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [floorsRes, roomsRes] = await Promise.all([
          fetch('/api/floors', { cache: 'no-store' }).then((r) => r.json()),
          fetch(`/api/rooms?floorNo=${floorId}&pageSize=100`, { cache: 'no-store' }).then((r) => r.json()),
        ]);

        if (floorsRes.success) {
          const found = (floorsRes.data as Floor[]).find((f) => f.id === floorId);
          if (found) setFloor(found);
        }

        if (roomsRes.success) {
          const roomList: Room[] = roomsRes.data?.data ?? roomsRes.data ?? [];
          roomList.sort((a, b) => a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true }));
          setRooms(roomList);
        } else {
          throw new Error(roomsRes.error?.message || 'ไม่สามารถโหลดห้อง');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'ไม่สามารถโหลดข้อมูลชั้น');
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [floorId]);

  const stats = {
    total: rooms.length,
    occupied: rooms.filter((r) => r.roomStatus === 'OCCUPIED').length,
    vacant: rooms.filter((r) => r.roomStatus === 'VACANT').length,
    maintenance: rooms.filter((r) => r.roomStatus === 'MAINTENANCE').length,
  };

  const filteredRooms =
    activeFilter === 'ALL' ? rooms : rooms.filter((r) => r.roomStatus === activeFilter);

  const floorLabel = floor ? `ชั้น ${floor.floorNumber}` : `ชั้น ...`;

  return (
    <main className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-[hsl(var(--on-surface-variant))]">
        <Link href="/admin/dashboard" className="hover:text-primary transition-colors opacity-70">
          แดชบอร์ด
        </Link>
        <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 opacity-40" />
        <Link href="/admin/floors" className="hover:text-primary transition-colors opacity-70">
          ชั้น
        </Link>
        <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 opacity-40" />
        <span className="font-medium text-[hsl(var(--on-surface))]">{floorLabel}</span>
      </nav>

      {/* Page header */}
      <section className="rounded-2xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-6 py-5"
        style={{ boxShadow: '0 4px 16px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.04)' }}
      >
        <div className="flex items-center gap-4">
          <Link
            href="/admin/floors"
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] transition-all duration-200 hover:border-primary/30 hover:bg-primary/10 active:scale-[0.98]"
          >
            <ArrowLeft className="h-4 w-4 text-[hsl(var(--on-surface))]" />
          </Link>
          <div>
            <h1 className="text-xl font-semibold text-[hsl(var(--on-surface))]">{floorLabel}</h1>
            <p className="text-sm text-[hsl(var(--on-surface-variant))] opacity-70">
              {loading ? 'กำลังโหลดห้อง...' : `ห้องทั้งหมด ${stats.total} ห้อง`}
            </p>
          </div>
        </div>
      </section>

      {error ? (
        <div className="auth-alert auth-alert-error">{error}</div>
      ) : null}

      {/* Stats row */}
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] p-5 transition-all duration-300 hover:shadow-[0_2px_8px_rgba(0,0,0,0.08)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))] opacity-70">ห้องทั้งหมด</div>
              <div className="text-xl font-semibold text-[hsl(var(--on-surface))] mt-0.5">{loading ? '...' : stats.total}</div>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 shadow-[0_0_12px_rgba(99,102,241,0.15)]">
              <DoorOpen className="h-5 w-5 text-primary" />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-emerald-500/20 bg-[hsl(var(--color-surface))] p-5 transition-all duration-300 hover:shadow-[0_2px_8px_rgba(34,197,94,0.15)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))] opacity-70">มีผู้เช่า</div>
              <div className="text-xl font-semibold text-emerald-600 mt-0.5">{loading ? '...' : stats.occupied}</div>
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
              <div className="text-xl font-semibold text-blue-600 mt-0.5">{loading ? '...' : stats.vacant}</div>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-blue-500/20 bg-blue-500/10 shadow-[0_0_12px_rgba(59,130,246,0.15)]">
              <Building2 className="h-5 w-5 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-amber-500/20 bg-[hsl(var(--color-surface))] p-5 transition-all duration-300 hover:shadow-[0_2px_8px_rgba(251,191,36,0.15)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))] opacity-70">ซ่อมบำรุง</div>
              <div className="text-xl font-semibold text-amber-600 mt-0.5">{loading ? '...' : stats.maintenance}</div>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-amber-500/20 bg-amber-500/10 shadow-[0_0_12px_rgba(251,191,36,0.15)]">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
            </div>
          </div>
        </div>
      </section>

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-2">
        {FILTER_TABS.map((tab) => {
          const count =
            tab.key === 'ALL'
              ? rooms.length
              : rooms.filter((r) => r.roomStatus === tab.key).length;
          const isActive = activeFilter === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveFilter(tab.key)}
              className={`flex items-center gap-1.5 rounded-xl border px-4 py-2 text-sm font-medium transition-all duration-200 active:scale-[0.98] ${
                isActive
                  ? 'border-primary/40 bg-primary/15 text-primary shadow-[0_0_12px_rgba(99,102,241,0.15)]'
                  : 'border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] text-[hsl(var(--on-surface-variant))] hover:border-white/20 hover:bg-[hsl(var(--color-surface))]'
              }`}
            >
              {tab.label}
              <span
                className={`rounded-full px-1.5 py-0.5 text-xs font-semibold ${
                  isActive ? 'bg-primary/20 text-primary' : 'bg-[hsl(var(--color-surface))] text-[hsl(var(--on-surface-variant))] opacity-60'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Room grid */}
      <section className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
        {loading ? (
          Array.from({ length: 20 }).map((_, i) => <SkeletonRoomCard key={i} />)
        ) : filteredRooms.length === 0 ? (
          <div className="col-span-5 rounded-2xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] p-10 text-center text-[hsl(var(--on-surface-variant))]">
            ไม่มีห้องที่ตรงกับตัวกรองที่เลือก
          </div>
        ) : (
          filteredRooms.map((room) => {
            const status = room.roomStatus as RoomStatus;
            const style = STATUS_CARD_STYLE[status] ?? STATUS_CARD_STYLE.SELF_USE;
            return (
              <Link
                key={room.id}
                href={`/admin/rooms/${room.id}`}
                className={`group flex flex-col rounded-xl border ${style.border} ${style.bg} p-3 transition-all duration-200 active:scale-[0.98] ${style.hover}`}
                style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.04)' }}
              >
                {/* Room number */}
                <div className={`mb-1.5 text-lg font-bold leading-tight ${STATUS_NUMBER_COLOR[status]}`}>
                  {room.roomNumber}
                </div>

                {/* Status badge */}
                <span
                  className={`mb-2 inline-flex w-fit items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${STATUS_BADGE_STYLE[status]}`}
                >
                  {STATUS_LABELS[status]}
                </span>

                {/* Capacity */}
                <div className="mt-auto flex items-center gap-1 text-xs text-[hsl(var(--on-surface-variant))] opacity-60">
                  <Users className="h-3 w-3 flex-shrink-0" />
                  <span>ความจุ {room.capacity}</span>
                </div>
              </Link>
            );
          })
        )}
      </section>
    </main>
  );
}
