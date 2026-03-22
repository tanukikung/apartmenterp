'use client';

import { useState, useEffect } from 'react';
import { Building2, Home, Hash } from 'lucide-react';
import type { BuildingData, RoomsData, RoomNumberFormat } from '../hooks/useSetupWizard';
import { getRoomNumberPreview } from '../lib/room-number-generator';

interface BuildingRoomsStepProps {
  building: BuildingData;
  rooms: RoomsData;
  onBuildingChange: (data: Partial<BuildingData>) => void;
  onRoomsChange: (data: Partial<RoomsData>) => void;
  errors?: Record<string, string>;
}

const ROOM_FORMAT_OPTIONS: { value: RoomNumberFormat; label: string; description: string }[] = [
  { value: 'SIMPLE', label: 'Simple', description: 'F1→101,102... F8→801,802...' },
  { value: 'HOTEL', label: 'Hotel', description: 'F1→001,002... F8→801,802...' },
  { value: 'CUSTOM_PREFIX', label: 'Custom Prefix', description: 'กำหนด prefix เช่น 32→3201,3202...' },
  { value: 'MIXED', label: 'Mixed', description: 'ชั้นพิเศษ (เช่น ชั้น 1) ใช้เลขต่างกัน' },
];

function FieldRow({
  label,
  icon,
  children,
}: {
  label: React.ReactNode;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-4">
      <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-container text-on-surface-variant">
        {icon}
      </div>
      <div className="flex-1">
        <label className="mb-1.5 block text-sm font-medium text-on-surface">{label}</label>
        {children}
      </div>
    </div>
  );
}

export function BuildingRoomsStep({
  building,
  rooms,
  onBuildingChange,
  onRoomsChange,
  errors = {},
}: BuildingRoomsStepProps) {
  const [prefixInput, setPrefixInput] = useState(rooms.prefix || '');

  useEffect(() => {
    setPrefixInput(rooms.prefix || '');
  }, [rooms.prefix]);

  const preview = getRoomNumberPreview(
    rooms.format,
    rooms.floors,
    rooms.roomsPerFloor,
    {
      prefix: rooms.prefix,
      mixedSpecialFloor: rooms.mixedSpecialFloor || undefined,
    }
  );

  const totalRooms = rooms.floors * rooms.roomsPerFloor;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-container">
          <Building2 className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-on-surface">ข้อมูลอาคารและห้องพัก</h2>
          <p className="text-sm text-on-surface-variant">กำหนดข้อมูลอาคารและรูปแบบเลขห้อง</p>
        </div>
      </div>

      {/* Building Info */}
      <div className="rounded-xl border border-outline-variant/10 bg-surface-container-lowest p-5 space-y-5">
        <h3 className="text-sm font-semibold text-on-surface-variant uppercase tracking-wide">ข้อมูลอาคาร</h3>

        <FieldRow label="ชื่ออาคาร" icon={<Building2 className="h-4 w-4" />}>
          <input
            type="text"
            value={building.name}
            onChange={(e) => onBuildingChange({ name: e.target.value })}
            placeholder="อาคารชื่อ..."
            className="w-full rounded-lg border border-outline bg-surface-container-lowest px-3 py-2.5 text-sm placeholder:text-on-surface-variant/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          {errors.name && <p className="mt-1 text-xs text-error">{errors.name}</p>}
        </FieldRow>

        <FieldRow label="ที่อยู่" icon={<Home className="h-4 w-4" />}>
          <textarea
            value={building.address}
            onChange={(e) => onBuildingChange({ address: e.target.value })}
            placeholder="123 ถนน... ตำบล... อำเภอ..."
            rows={2}
            className="w-full rounded-lg border border-outline bg-surface-container-lowest px-3 py-2.5 text-sm placeholder:text-on-surface-variant/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
          />
          {errors.address && <p className="mt-1 text-xs text-error">{errors.address}</p>}
        </FieldRow>

        <div className="grid grid-cols-2 gap-4">
          <FieldRow label="โทรศัพท์" icon={<Building2 className="h-4 w-4" />}>
            <input
              type="text"
              value={building.phone}
              onChange={(e) => onBuildingChange({ phone: e.target.value })}
              placeholder="02-xxx-xxxx"
              className="w-full rounded-lg border border-outline bg-surface-container-lowest px-3 py-2.5 text-sm placeholder:text-on-surface-variant/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            {errors.phone && <p className="mt-1 text-xs text-error">{errors.phone}</p>}
          </FieldRow>

          <FieldRow label="อีเมล" icon={<Building2 className="h-4 w-4" />}>
            <input
              type="email"
              value={building.email}
              onChange={(e) => onBuildingChange({ email: e.target.value })}
              placeholder="contact@building.com"
              className="w-full rounded-lg border border-outline bg-surface-container-lowest px-3 py-2.5 text-sm placeholder:text-on-surface-variant/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </FieldRow>
        </div>

        <FieldRow label="เลขผู้เสียภาษี" icon={<Hash className="h-4 w-4" />}>
          <input
            type="text"
            value={building.taxId}
            onChange={(e) => onBuildingChange({ taxId: e.target.value })}
            placeholder="0-0000-00000-00-0"
            className="w-full rounded-lg border border-outline bg-surface-container-lowest px-3 py-2.5 text-sm placeholder:text-on-surface-variant/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </FieldRow>
      </div>

      {/* Room Config */}
      <div className="rounded-xl border border-outline-variant/10 bg-surface-container-lowest p-5 space-y-5">
        <h3 className="text-sm font-semibold text-on-surface-variant uppercase tracking-wide">การตั้งค่าห้องพัก</h3>

        <div className="grid grid-cols-2 gap-4">
          <FieldRow label="จำนวนชั้น" icon={<Building2 className="h-4 w-4" />}>
            <input
              type="number"
              min={1}
              max={20}
              value={rooms.floors}
              onChange={(e) => onRoomsChange({ floors: Math.max(1, Math.min(20, parseInt(e.target.value) || 1)) })}
              className="w-full rounded-lg border border-outline bg-surface-container-lowest px-3 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            {errors.floors && <p className="mt-1 text-xs text-error">{errors.floors}</p>}
          </FieldRow>

          <FieldRow label="ห้อง/ชั้น" icon={<Home className="h-4 w-4" />}>
            <input
              type="number"
              min={1}
              max={50}
              value={rooms.roomsPerFloor}
              onChange={(e) => onRoomsChange({ roomsPerFloor: Math.max(1, Math.min(50, parseInt(e.target.value) || 1)) })}
              className="w-full rounded-lg border border-outline bg-surface-container-lowest px-3 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            {errors.roomsPerFloor && <p className="mt-1 text-xs text-error">{errors.roomsPerFloor}</p>}
          </FieldRow>
        </div>

        <FieldRow label="ค่าเช่าเริ่มต้น (บาท/เดือน)" icon={<Hash className="h-4 w-4" />}>
          <input
            type="number"
            min={0}
            value={rooms.defaultRentAmount}
            onChange={(e) => onRoomsChange({ defaultRentAmount: Math.max(0, parseInt(e.target.value) || 0) })}
            className="w-full rounded-lg border border-outline bg-surface-container-lowest px-3 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </FieldRow>

        <FieldRow label="รูปแบบเลขห้อง" icon={<Hash className="h-4 w-4" />}>
          <div className="space-y-2">
            {ROOM_FORMAT_OPTIONS.map((option) => (
              <label
                key={option.value}
                className={[
                  'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-all',
                  rooms.format === option.value
                    ? 'border-primary bg-primary-container/30'
                    : 'border-outline bg-surface-container-lowest hover:border-primary/50',
                ].join(' ')}
              >
                <input
                  type="radio"
                  name="roomFormat"
                  value={option.value}
                  checked={rooms.format === option.value}
                  onChange={() => onRoomsChange({ format: option.value })}
                  className="mt-0.5 h-4 w-4 accent-primary"
                />
                <div>
                  <span className="text-sm font-medium text-on-surface">{option.label}</span>
                  <p className="text-xs text-on-surface-variant">{option.description}</p>
                </div>
              </label>
            ))}
          </div>
        </FieldRow>

        {rooms.format === 'CUSTOM_PREFIX' && (
          <FieldRow label="Prefix" icon={<Hash className="h-4 w-4" />}>
            <input
              type="text"
              value={prefixInput}
              onChange={(e) => {
                setPrefixInput(e.target.value);
                onRoomsChange({ prefix: e.target.value });
              }}
              placeholder="32"
              className="w-full rounded-lg border border-outline bg-surface-container-lowest px-3 py-2.5 text-sm placeholder:text-on-surface-variant/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            {errors.prefix && <p className="mt-1 text-xs text-error">{errors.prefix}</p>}
            <p className="mt-1 text-xs text-on-surface-variant">เช่น กรอก 32 → จะได้ 3201, 3202, ...</p>
          </FieldRow>
        )}

        {rooms.format === 'MIXED' && (
          <div className="space-y-4">
            <FieldRow label="ชั้นพิเศษ" icon={<Building2 className="h-4 w-4" />}>
              <input
                type="number"
                min={1}
                max={rooms.floors}
                value={rooms.mixedSpecialFloor?.floorNo || 1}
                onChange={(e) => {
                  const floorNo = Math.max(1, Math.min(rooms.floors, parseInt(e.target.value) || 1));
                  // Generate default room numbers for the special floor
                  const roomNumbers: string[] = [];
                  for (let i = 1; i <= rooms.roomsPerFloor; i++) {
                    roomNumbers.push(`798/${i}`);
                  }
                  onRoomsChange({
                    mixedSpecialFloor: {
                      floorNo,
                      roomNumbers,
                    },
                  });
                }}
                className="w-full rounded-lg border border-outline bg-surface-container-lowest px-3 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              <p className="mt-1 text-xs text-on-surface-variant">เลือกชั้นที่ใช้เลขห้องต่างจากชั้นอื่น</p>
            </FieldRow>

            <FieldRow label="เลขห้องชั้นพิเศษ (คั่นด้วยลูกน้ำ)" icon={<Hash className="h-4 w-4" />}>
              <textarea
                value={rooms.mixedSpecialFloor?.roomNumbers?.join(', ') || ''}
                onChange={(e) => {
                  const roomNumbers = e.target.value.split(',').map(r => r.trim()).filter(Boolean);
                  onRoomsChange({
                    mixedSpecialFloor: rooms.mixedSpecialFloor
                      ? { ...rooms.mixedSpecialFloor, roomNumbers }
                      : { floorNo: 1, roomNumbers },
                  });
                }}
                placeholder="798/1, 798/2, 798/3, ..."
                rows={2}
                className="w-full rounded-lg border border-outline bg-surface-container-lowest px-3 py-2.5 text-sm placeholder:text-on-surface-variant/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
              />
              <p className="mt-1 text-xs text-on-surface-variant">กรอกเลขห้องที่ต้องการ คั่นด้วยลูกน้ำ (,)</p>
            </FieldRow>

            <FieldRow label="Prefix สำหรับชั้นอื่น" icon={<Hash className="h-4 w-4" />}>
              <input
                type="text"
                value={prefixInput}
                onChange={(e) => {
                  setPrefixInput(e.target.value);
                  onRoomsChange({ prefix: e.target.value });
                }}
                placeholder="32"
                className="w-full rounded-lg border border-outline bg-surface-container-lowest px-3 py-2.5 text-sm placeholder:text-on-surface-variant/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              <p className="mt-1 text-xs text-on-surface-variant">ชั้นอื่นๆ จะใช้ prefix นี้ เช่น 32 → 3201, 3202, ...</p>
            </FieldRow>
          </div>
        )}

        {errors.format && <p className="text-xs text-error">{errors.format}</p>}
      </div>

      {/* Preview */}
      <div className="rounded-xl border border-outline-variant/10 bg-surface-container-lowest p-5">
        <h3 className="text-sm font-semibold text-on-surface-variant uppercase tracking-wide mb-3">
          ตัวอย่างเลขห้อง (แสดง 5 ห้อง/ชั้น 2 ชั้นแรก)
        </h3>
        <div className="grid grid-cols-2 gap-4">
          {preview.map((floor) => (
            <div key={floor.floorNo}>
              <p className="text-xs font-medium text-on-surface-variant mb-1">ชั้น {floor.floorNo}</p>
              <div className="flex flex-wrap gap-1">
                {floor.rooms.map((roomNo) => (
                  <span
                    key={roomNo}
                    className="inline-flex items-center justify-center h-7 min-w-[2.5rem] px-2 rounded bg-primary-container text-xs font-medium text-primary"
                  >
                    {roomNo}
                  </span>
                ))}
                {rooms.roomsPerFloor > 5 && (
                  <span className="inline-flex items-center justify-center h-7 px-2 text-xs text-on-surface-variant">
                    +{rooms.roomsPerFloor - 5} ห้อง
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-sm font-medium text-on-surface">
          รวมทั้งหมด <span className="text-primary">{totalRooms}</span> ห้อง ({rooms.floors} ชั้น × {rooms.roomsPerFloor} ห้อง/ชั้น)
        </p>
      </div>
    </div>
  );
}
