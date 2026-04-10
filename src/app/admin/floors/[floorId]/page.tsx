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

const STATUS_CARD_STYLE: Record<RoomStatus, string> = {
  VACANT: 'border-emerald-200 bg-emerald-50 hover:bg-emerald-100',
  OCCUPIED: 'border-indigo-200 bg-indigo-50 hover:bg-indigo-100',
  MAINTENANCE: 'border-amber-200 bg-amber-50 hover:bg-amber-100',
  SELF_USE: 'border-slate-200 bg-slate-50 hover:bg-slate-100',
  UNAVAILABLE: 'border-red-200 bg-red-50 hover:bg-red-100',
};

const STATUS_BADGE_STYLE: Record<RoomStatus, string> = {
  VACANT: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  OCCUPIED: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  MAINTENANCE: 'bg-amber-100 text-amber-700 border-amber-200',
  SELF_USE: 'bg-slate-100 text-slate-600 border-slate-200',
  UNAVAILABLE: 'bg-red-100 text-red-700 border-red-200',
};

const STATUS_NUMBER_COLOR: Record<RoomStatus, string> = {
  VACANT: 'text-emerald-800',
  OCCUPIED: 'text-indigo-800',
  MAINTENANCE: 'text-amber-800',
  SELF_USE: 'text-slate-700',
  UNAVAILABLE: 'text-red-800',
};

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: 'ALL', label: 'ทั้งหมด' },
  { key: 'VACANT', label: 'ว่าง' },
  { key: 'OCCUPIED', label: 'มีผู้เช่า' },
  { key: 'MAINTENANCE', label: 'ซ่อมบำรุง' },
];

function SkeletonRoomCard() {
  return (
    <div className="animate-pulse rounded-2xl border border-slate-200 bg-slate-50 p-3">
      <div className="mb-2 h-5 w-12 rounded-full bg-slate-200" />
      <div className="mb-1 h-3 w-16 rounded-full bg-slate-200" />
      <div className="h-3 w-10 rounded-full bg-slate-200" />
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
      <nav className="flex items-center gap-1.5 text-sm text-[var(--on-surface-variant)]">
        <Link href="/admin/dashboard" className="hover:text-[var(--primary)]">
          แดชบอร์ด
        </Link>
        <ChevronRight className="h-3.5 w-3.5 flex-shrink-0" />
        <Link href="/admin/floors" className="hover:text-[var(--primary)]">
          ชั้น
        </Link>
        <ChevronRight className="h-3.5 w-3.5 flex-shrink-0" />
        <span className="font-medium text-[var(--on-surface)]">{floorLabel}</span>
      </nav>

      {/* Page header */}
      <section className="rounded-2xl border border-[var(--outline-variant)]/10 bg-gradient-to-br from-[var(--primary-container)] to-[var(--primary)] px-6 py-5">
        <div className="flex items-center gap-4">
          <Link
            href="/admin/floors"
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border border-[var(--outline-variant)]/20 bg-[var(--surface-container-lowest)] shadow-sm transition-colors hover:border-[var(--primary)]/30 hover:bg-[var(--surface-container)]"
          >
            <ArrowLeft className="h-4 w-4 text-[var(--on-primary)]" />
          </Link>
          <div>
            <h1 className="text-xl font-semibold text-[var(--on-primary)]">{floorLabel}</h1>
            <p className="text-sm text-[var(--on-primary)]/80">
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
        <div className="bg-[var(--surface-container-lowest)] rounded-xl border border-[var(--outline-variant)]/10 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--on-surface-variant)]">ห้องทั้งหมด</div>
              <div className="text-xl font-semibold text-[var(--on-surface)] mt-0.5">{loading ? '...' : stats.total}</div>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--primary)]/20 bg-primary/10 shadow-sm">
              <DoorOpen className="h-5 w-5 text-[var(--primary)]" />
            </div>
          </div>
        </div>

        <div className="bg-[var(--surface-container-lowest)] rounded-xl border border-[var(--outline-variant)]/10 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--on-surface-variant)]">มีผู้เช่า</div>
              <div className="text-xl font-semibold text-[var(--on-surface)] mt-0.5">{loading ? '...' : stats.occupied}</div>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 shadow-sm">
              <Users className="h-5 w-5 text-emerald-600" />
            </div>
          </div>
        </div>

        <div className="bg-[var(--surface-container-lowest)] rounded-xl border border-[var(--outline-variant)]/10 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--on-surface-variant)]">ว่าง</div>
              <div className="text-xl font-semibold text-[var(--on-surface)] mt-0.5">{loading ? '...' : stats.vacant}</div>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-sky-200 bg-sky-50 shadow-sm">
              <Building2 className="h-5 w-5 text-sky-500" />
            </div>
          </div>
        </div>

        <div className="bg-[var(--surface-container-lowest)] rounded-xl border border-[var(--outline-variant)]/10 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--on-surface-variant)]">ซ่อมบำรุง</div>
              <div className="text-xl font-semibold text-[var(--on-surface)] mt-0.5">{loading ? '...' : stats.maintenance}</div>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-amber-200 bg-amber-50 shadow-sm">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
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
              className={`flex items-center gap-1.5 rounded-2xl border px-4 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? 'border-indigo-300 bg-indigo-100 text-indigo-700 shadow-sm'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600'
              }`}
            >
              {tab.label}
              <span
                className={`rounded-full px-1.5 py-0.5 text-xs font-semibold ${
                  isActive ? 'bg-indigo-200 text-indigo-800' : 'bg-slate-100 text-slate-500'
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
          <div className="col-span-5 rounded-3xl border border-slate-200 bg-white p-10 text-center text-slate-500 shadow-sm">
            ไม่มีห้องที่ตรงกับตัวกรองที่เลือก
          </div>
        ) : (
          filteredRooms.map((room) => (
            <Link
              key={room.id}
              href={`/admin/rooms/${room.id}`}
              className={`group flex flex-col rounded-2xl border p-3 shadow-sm transition-all hover:shadow-md ${STATUS_CARD_STYLE[room.roomStatus as RoomStatus]}`}
            >
              {/* Room number */}
              <div className={`mb-1.5 text-lg font-bold leading-tight ${STATUS_NUMBER_COLOR[room.roomStatus as RoomStatus]}`}>
                {room.roomNumber}
              </div>

              {/* Status badge */}
              <span
                className={`mb-2 inline-flex w-fit items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${STATUS_BADGE_STYLE[room.roomStatus as RoomStatus]}`}
              >
                {STATUS_LABELS[room.roomStatus as RoomStatus]}
              </span>

              {/* Capacity */}
              <div className="mt-auto flex items-center gap-1 text-xs text-slate-500">
                <Users className="h-3 w-3 flex-shrink-0" />
                <span>ความจุ {room.capacity}</span>
              </div>
            </Link>
          ))
        )}
      </section>
    </main>
  );
}
