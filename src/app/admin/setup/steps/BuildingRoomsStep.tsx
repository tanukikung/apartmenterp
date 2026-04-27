'use client';

import { Building2, Home, Hash, CheckCircle, Layers, Landmark, Smartphone } from 'lucide-react';
import { useState } from 'react';
import type { BuildingData, RoomsData, BankAccountData, CustomRoomEntry } from '../hooks/useSetupWizard';

interface BuildingRoomsStepProps {
  building: BuildingData;
  rooms: RoomsData;
  bankAccount: BankAccountData;
  onBuildingChange: (data: Partial<BuildingData>) => void;
  onRoomsChange: (data: Partial<RoomsData>) => void;
  onBankAccountChange: (data: Partial<BankAccountData>) => void;
  errors?: Record<string, string>;
}

function FieldRow({
  label,
  icon,
  children,
  hint,
}: {
  label: React.ReactNode;
  icon: React.ReactNode;
  children: React.ReactNode;
  hint?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-4">
      <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: 'hsl(var(--color-surface))', color: 'hsl(var(--color-text-3))' }}>
        {icon}
      </div>
      <div className="flex-1">
        <label className="mb-1.5 block text-sm font-medium" style={{ color: 'hsl(var(--color-text-2))' }}>{label}</label>
        {children}
        {hint && <p className="mt-1 text-xs" style={{ color: 'hsl(var(--color-text-3))' }}>{hint}</p>}
      </div>
    </div>
  );
}

const FORMAT_OPTIONS = [
  { value: 'SIMPLE', label: 'แบบง่าย', desc: '101, 102... 201, 202... (เบอร์เรียงกันไป)' },
  { value: 'HOTEL', label: 'โฮเต็ล', desc: '101, 102... 201, 202... (ค่าเช่าต่อห้องอาจต่างกัน)' },
  { value: 'CUSTOM_PREFIX', label: 'มี Prefix', desc: 'A101, A102... B101, B102... (มีตัวอักษรนำหน้า)' },
  { value: 'MIXED', label: 'ผสม', desc: 'ชั้น 1 ห้องเลขพิเศษ + ชั้นอื่นมาตรฐาน' },
  { value: 'CUSTOM', label: 'กำหนดเองทุกห้อง', desc: 'พิมพ์เลขห้องทีละห้อง เช่น "101, 5900" ต่อบรรทัด' },
] as const;

export function BuildingRoomsStep({
  building,
  rooms,
  bankAccount,
  onBuildingChange,
  onRoomsChange,
  onBankAccountChange,
  errors = {},
}: BuildingRoomsStepProps) {
  const [customInput, setCustomInput] = useState('');
  const [customError, setCustomError] = useState('');

  const totalRooms = rooms.format === 'CUSTOM'
    ? rooms.customRooms.length
    : rooms.format === 'MIXED'
    ? (rooms.mixedSpecialFloor?.roomNumbers.length ?? 0) + (rooms.floors - 1) * rooms.roomsPerFloor
    : rooms.floors * rooms.roomsPerFloor;

  function parseCustomRooms(text: string): CustomRoomEntry[] {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const entries: CustomRoomEntry[] = [];
    for (const line of lines) {
      const parts = line.split(/[,=]/).map(p => p.trim());
      if (parts.length < 2) {
        setCustomError('รูปแบบไม่ถูกต้อง: "' + line + '" — ใช้ "เลขห้อง, ค่าเช่า" เช่น "101, 5900"');
        return [];
      }
      const roomNo = parts[0];
      const rent = parseFloat(parts[1]);
      if (!roomNo || isNaN(rent)) {
        setCustomError('รูปแบบไม่ถูกต้อง: "' + line + '" — ค่าเช่าต้องเป็นตัวเลข');
        return [];
      }
      entries.push({ roomNo, floorNo: 1, rent });
    }
    setCustomError('');
    return entries;
  }

  function handleCustomInputChange(text: string) {
    setCustomInput(text);
    if (!text.trim()) {
      onRoomsChange({ customRooms: [] });
      setCustomError('');
      return;
    }
    const entries = parseCustomRooms(text);
    if (entries.length > 0) {
      onRoomsChange({ customRooms: entries });
    }
  }

  function handleFormatChange(format: string) {
    onRoomsChange({
      format: format as RoomsData['format'],
      customRooms: format === 'CUSTOM' ? rooms.customRooms : [],
      mixedSpecialFloor: format === 'MIXED' ? { floorNo: 1, roomNumbers: [] } : null,
    });
    setCustomInput('');
    setCustomError('');
  }

  function handleSpecialFloorChange(floorNo: number, roomNosText: string) {
    const nums = roomNosText.split(/[,;\s]+/).map(s => s.trim()).filter(Boolean);
    onRoomsChange({ mixedSpecialFloor: { floorNo, roomNumbers: nums } });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border" style={{ borderColor: 'hsl(var(--color-border))', background: 'hsl(var(--color-surface))' }}>
          <Building2 className="h-5 w-5" style={{ color: 'hsl(var(--primary))' }} />
        </div>
        <div>
          <h2 className="text-lg font-semibold" style={{ color: 'hsl(var(--color-text))' }}>ข้อมูลอาคารและห้องพัก</h2>
          <p className="text-sm" style={{ color: 'hsl(var(--color-text-3))' }}>กรอกข้อมูลพื้นฐานของอาคารและกำหนดจำนวนห้องพัก</p>
        </div>
      </div>

      {/* ข้อมูลอาคาร */}
      <div className="rounded-xl border p-5 space-y-5" style={{ borderColor: 'hsl(var(--color-border))', background: 'hsl(var(--color-surface))' }}>
        <h3 className="text-sm font-semibold uppercase tracking-wide" style={{ color: 'hsl(var(--color-text-3))' }}>ข้อมูลอาคาร</h3>

        <FieldRow label="ชื่ออาคาร *" icon={<Building2 className="h-4 w-4" />}>
          <input
            type="text"
            value={building.name}
            onChange={(e) => onBuildingChange({ name: e.target.value })}
            placeholder="อาคารชื่อ..."
            className="w-full rounded-xl border px-3 py-2.5 text-sm transition-all"
            style={{ borderColor: 'hsl(var(--color-border))', background: 'hsl(var(--color-surface))', color: 'hsl(var(--color-text))' }}
          />
          {errors.name && <p className="mt-1 text-xs" style={{ color: 'hsl(var(--color-danger))' }}>{errors.name}</p>}
        </FieldRow>

        <FieldRow label="ที่อยู่ *" icon={<Home className="h-4 w-4" />}>
          <textarea
            value={building.address}
            onChange={(e) => onBuildingChange({ address: e.target.value })}
            placeholder="123 ถนน... ตำบล... อำเภอ..."
            rows={2}
            className="w-full rounded-xl border px-3 py-2.5 text-sm transition-all resize-none"
            style={{ borderColor: 'hsl(var(--color-border))', background: 'hsl(var(--color-surface))', color: 'hsl(var(--color-text))' }}
          />
          {errors.address && <p className="mt-1 text-xs" style={{ color: 'hsl(var(--color-danger))' }}>{errors.address}</p>}
        </FieldRow>

        <div className="grid grid-cols-2 gap-4">
          <FieldRow label="โทรศัพท์ *" icon={<Building2 className="h-4 w-4" />}>
            <input
              type="text"
              value={building.phone}
              onChange={(e) => onBuildingChange({ phone: e.target.value })}
              placeholder="02-xxx-xxxx"
              className="w-full rounded-xl border px-3 py-2.5 text-sm transition-all"
              style={{ borderColor: 'hsl(var(--color-border))', background: 'hsl(var(--color-surface))', color: 'hsl(var(--color-text))' }}
            />
            {errors.phone && <p className="mt-1 text-xs" style={{ color: 'hsl(var(--color-danger))' }}>{errors.phone}</p>}
          </FieldRow>

          <FieldRow label="อีเมล" icon={<Building2 className="h-4 w-4" />}>
            <input
              type="email"
              value={building.email}
              onChange={(e) => onBuildingChange({ email: e.target.value })}
              placeholder="contact@building.com"
              className="w-full rounded-xl border px-3 py-2.5 text-sm transition-all"
              style={{ borderColor: 'hsl(var(--color-border))', background: 'hsl(var(--color-surface))', color: 'hsl(var(--color-text))' }}
            />
          </FieldRow>
        </div>

        <FieldRow label="เลขผู้เสียภาษี" icon={<Hash className="h-4 w-4" />}>
          <input
            type="text"
            value={building.taxId}
            onChange={(e) => onBuildingChange({ taxId: e.target.value })}
            placeholder="0-0000-00000-00-0"
            className="w-full rounded-xl border px-3 py-2.5 text-sm transition-all"
            style={{ borderColor: 'hsl(var(--color-border))', background: 'hsl(var(--color-surface))', color: 'hsl(var(--color-text))' }}
          />
        </FieldRow>
      </div>

      {/* ข้อมูลห้องพัก */}
      <div className="rounded-xl border p-5 space-y-5" style={{ borderColor: 'hsl(var(--color-border))', background: 'hsl(var(--color-surface))' }}>
        <h3 className="text-sm font-semibold uppercase tracking-wide" style={{ color: 'hsl(var(--color-text-3))' }}>ข้อมูลห้องพัก</h3>

        {/* Format Selector */}
        <div>
          <label className="mb-2 block text-sm font-medium" style={{ color: 'hsl(var(--color-text-2))' }}>รูปแบบเลขห้อง *</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {FORMAT_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleFormatChange(opt.value)}
                className="rounded-xl border p-3 text-left transition-all"
                style={{
                  borderColor: rooms.format === opt.value ? 'hsl(var(--primary))' : 'hsl(var(--color-border))',
                  background: rooms.format === opt.value ? 'hsl(var(--primary)/8)' : 'hsl(var(--color-surface))',
                }}
              >
                <span className="text-sm font-semibold" style={{ color: rooms.format === opt.value ? 'hsl(var(--primary))' : 'hsl(var(--color-text))' }}>
                  {opt.label}
                </span>
                <p className="mt-0.5 text-xs" style={{ color: 'hsl(var(--color-text-3))' }}>{opt.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* SIMPLE / HOTEL */}
        {(rooms.format === 'SIMPLE' || rooms.format === 'HOTEL') && (
          <>
            <div className="grid grid-cols-2 gap-4">
              <FieldRow label="จำนวนชั้น *" icon={<Layers className="h-4 w-4" />}>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={rooms.floors}
                  onChange={(e) => onRoomsChange({ floors: Math.max(1, Math.min(20, parseInt(e.target.value) || 1)) })}
                  className="w-full rounded-xl border px-3 py-2.5 text-sm transition-all"
                  style={{ borderColor: 'hsl(var(--color-border))', background: 'hsl(var(--color-surface))', color: 'hsl(var(--color-text))' }}
                />
              </FieldRow>

              <FieldRow label="ห้องต่อชั้น *" icon={<Hash className="h-4 w-4" />}>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={rooms.roomsPerFloor}
                  onChange={(e) => onRoomsChange({ roomsPerFloor: Math.max(1, Math.min(100, parseInt(e.target.value) || 1)) })}
                  className="w-full rounded-xl border px-3 py-2.5 text-sm transition-all"
                  style={{ borderColor: 'hsl(var(--color-border))', background: 'hsl(var(--color-surface))', color: 'hsl(var(--color-text))' }}
                />
              </FieldRow>
            </div>

            <FieldRow label="ค่าเช่าเริ่มต้น (บาท/เดือน) *" icon={<Hash className="h-4 w-4" />}>
              <input
                type="number"
                min={0}
                step={100}
                value={rooms.defaultRentAmount}
                onChange={(e) => onRoomsChange({ defaultRentAmount: Math.max(0, parseInt(e.target.value) || 0) })}
                className="w-full rounded-xl border px-3 py-2.5 text-sm transition-all"
                style={{ borderColor: 'hsl(var(--color-border))', background: 'hsl(var(--color-surface))', color: 'hsl(var(--color-text))' }}
              />
            </FieldRow>

            <div className="rounded-lg border px-4 py-3" style={{ borderColor: 'hsl(var(--primary)/20)', background: 'hsl(var(--primary)/5)' }}>
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="h-4 w-4" style={{ color: 'hsl(var(--primary))' }} />
                <span className="text-sm font-semibold" style={{ color: 'hsl(var(--primary))' }}>ตัวอย่างเลขห้อง</span>
              </div>
              <div className="space-y-1 text-sm" style={{ color: 'hsl(var(--color-text-2))' }}>
                <p>ชั้น 1: 101-{100 + rooms.roomsPerFloor} ({rooms.roomsPerFloor} ห้อง)</p>
                <p>ชั้น 2: 201-{200 + rooms.roomsPerFloor} ({rooms.roomsPerFloor} ห้อง)</p>
                {rooms.floors > 2 && (
                  <p>ชั้น {rooms.floors}: {rooms.floors}01-{rooms.floors * 100 + rooms.roomsPerFloor} ({rooms.roomsPerFloor} ห้อง)</p>
                )}
                <p className="pt-1 font-semibold">
                  รวม <span style={{ color: 'hsl(var(--primary))' }}>{rooms.floors}</span> ชั้น · <span style={{ color: 'hsl(var(--primary))' }}>{rooms.floors * rooms.roomsPerFloor}</span> ห้อง
                </p>
              </div>
            </div>
          </>
        )}

        {/* CUSTOM_PREFIX */}
        {rooms.format === 'CUSTOM_PREFIX' && (
          <>
            <FieldRow label="Prefix (ตัวอักษรนำหน้า)" icon={<Hash className="h-4 w-4" />} hint="เช่น A, B, 1A — ว่างไว้ใช้ตัวเลขอย่างเดียว">
              <input
                type="text"
                value={rooms.prefix}
                onChange={(e) => onRoomsChange({ prefix: e.target.value.toUpperCase() })}
                placeholder="A"
                maxLength={4}
                className="w-full rounded-xl border px-3 py-2.5 text-sm transition-all"
                style={{ borderColor: 'hsl(var(--color-border))', background: 'hsl(var(--color-surface))', color: 'hsl(var(--color-text))' }}
              />
            </FieldRow>

            <div className="grid grid-cols-2 gap-4">
              <FieldRow label="จำนวนชั้น *" icon={<Layers className="h-4 w-4" />}>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={rooms.floors}
                  onChange={(e) => onRoomsChange({ floors: Math.max(1, Math.min(20, parseInt(e.target.value) || 1)) })}
                  className="w-full rounded-xl border px-3 py-2.5 text-sm transition-all"
                  style={{ borderColor: 'hsl(var(--color-border))', background: 'hsl(var(--color-surface))', color: 'hsl(var(--color-text))' }}
                />
              </FieldRow>

              <FieldRow label="ห้องต่อชั้น *" icon={<Hash className="h-4 w-4" />}>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={rooms.roomsPerFloor}
                  onChange={(e) => onRoomsChange({ roomsPerFloor: Math.max(1, Math.min(100, parseInt(e.target.value) || 1)) })}
                  className="w-full rounded-xl border px-3 py-2.5 text-sm transition-all"
                  style={{ borderColor: 'hsl(var(--color-border))', background: 'hsl(var(--color-surface))', color: 'hsl(var(--color-text))' }}
                />
              </FieldRow>
            </div>

            <FieldRow label="ค่าเช่าเริ่มต้น (บาท/เดือน) *" icon={<Hash className="h-4 w-4" />}>
              <input
                type="number"
                min={0}
                step={100}
                value={rooms.defaultRentAmount}
                onChange={(e) => onRoomsChange({ defaultRentAmount: Math.max(0, parseInt(e.target.value) || 0) })}
                className="w-full rounded-xl border px-3 py-2.5 text-sm transition-all"
                style={{ borderColor: 'hsl(var(--color-border))', background: 'hsl(var(--color-surface))', color: 'hsl(var(--color-text))' }}
              />
            </FieldRow>

            <div className="rounded-lg border px-4 py-3" style={{ borderColor: 'hsl(var(--primary)/20)', background: 'hsl(var(--primary)/5)' }}>
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="h-4 w-4" style={{ color: 'hsl(var(--primary))' }} />
                <span className="text-sm font-semibold" style={{ color: 'hsl(var(--primary))' }}>ตัวอย่างเลขห้อง</span>
              </div>
              <div className="space-y-1 text-sm" style={{ color: 'hsl(var(--color-text-2))' }}>
                <p>ชั้น 1: {(rooms.prefix || '1')}01-{(rooms.prefix || '1')}{100 + rooms.roomsPerFloor} ({rooms.roomsPerFloor} ห้อง)</p>
                <p>ชั้น 2: {(rooms.prefix || '2')}01-{(rooms.prefix || '2')}{200 + rooms.roomsPerFloor} ({rooms.roomsPerFloor} ห้อง)</p>
                {rooms.floors > 2 && (
                  <p>ชั้น {rooms.floors}: {(rooms.prefix || String(rooms.floors))}01-{(rooms.prefix || String(rooms.floors))}{rooms.floors * 100 + rooms.roomsPerFloor}</p>
                )}
                <p className="pt-1 font-semibold">
                  รวม <span style={{ color: 'hsl(var(--primary))' }}>{rooms.floors}</span> ชั้น · <span style={{ color: 'hsl(var(--primary))' }}>{rooms.floors * rooms.roomsPerFloor}</span> ห้อง
                </p>
              </div>
            </div>
          </>
        )}

        {/* MIXED */}
        {rooms.format === 'MIXED' && (
          <>
            <div className="grid grid-cols-2 gap-4">
              <FieldRow label="ชั้นพิเศษ *" icon={<Layers className="h-4 w-4" />}>
                <input
                  type="number"
                  min={1}
                  max={rooms.floors}
                  value={rooms.mixedSpecialFloor?.floorNo ?? 1}
                  onChange={(e) => handleSpecialFloorChange(
                    Math.max(1, Math.min(rooms.floors, parseInt(e.target.value) || 1)),
                    rooms.mixedSpecialFloor?.roomNumbers.join(', ') ?? ''
                  )}
                  className="w-full rounded-xl border px-3 py-2.5 text-sm transition-all"
                  style={{ borderColor: 'hsl(var(--color-border))', background: 'hsl(var(--color-surface))', color: 'hsl(var(--color-text))' }}
                />
              </FieldRow>

              <FieldRow label="จำนวนชั้น (รวมพิเศษ) *" icon={<Layers className="h-4 w-4" />}>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={rooms.floors}
                  onChange={(e) => onRoomsChange({ floors: Math.max(1, Math.min(20, parseInt(e.target.value) || 1)) })}
                  className="w-full rounded-xl border px-3 py-2.5 text-sm transition-all"
                  style={{ borderColor: 'hsl(var(--color-border))', background: 'hsl(var(--color-surface))', color: 'hsl(var(--color-text))' }}
                />
              </FieldRow>
            </div>

            <FieldRow label={"ห้องพิเศษ (ชั้น " + (rooms.mixedSpecialFloor?.floorNo ?? 1) + ") *"} icon={<Hash className="h-4 w-4" />} hint="พิมพ์เลขห้องคั่นด้วยเครื่องหมาย , เช่น 798/1, 798/2, 798/3">
              <textarea
                value={rooms.mixedSpecialFloor?.roomNumbers.join(', ') ?? ''}
                onChange={(e) => handleSpecialFloorChange(rooms.mixedSpecialFloor?.floorNo ?? 1, e.target.value)}
                placeholder="798/1, 798/2, 798/3, 798/4..."
                rows={2}
                className="w-full rounded-xl border px-3 py-2.5 text-sm transition-all resize-none"
                style={{ borderColor: 'hsl(var(--color-border))', background: 'hsl(var(--color-surface))', color: 'hsl(var(--color-text))' }}
              />
            </FieldRow>

            <div className="grid grid-cols-2 gap-4">
              <FieldRow label="ห้องต่อชั้น (ชั้นอื่น) *" icon={<Hash className="h-4 w-4" />}>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={rooms.roomsPerFloor}
                  onChange={(e) => onRoomsChange({ roomsPerFloor: Math.max(1, Math.min(100, parseInt(e.target.value) || 1)) })}
                  className="w-full rounded-xl border px-3 py-2.5 text-sm transition-all"
                  style={{ borderColor: 'hsl(var(--color-border))', background: 'hsl(var(--color-surface))', color: 'hsl(var(--color-text))' }}
                />
              </FieldRow>

              <FieldRow label="ค่าเช่าเริ่มต้น (บาท/เดือน) *" icon={<Hash className="h-4 w-4" />}>
                <input
                  type="number"
                  min={0}
                  step={100}
                  value={rooms.defaultRentAmount}
                  onChange={(e) => onRoomsChange({ defaultRentAmount: Math.max(0, parseInt(e.target.value) || 0) })}
                  className="w-full rounded-xl border px-3 py-2.5 text-sm transition-all"
                  style={{ borderColor: 'hsl(var(--color-border))', background: 'hsl(var(--color-surface))', color: 'hsl(var(--color-text))' }}
                />
              </FieldRow>
            </div>

            <div className="rounded-lg border px-4 py-3" style={{ borderColor: 'hsl(var(--primary)/20)', background: 'hsl(var(--primary)/5)' }}>
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="h-4 w-4" style={{ color: 'hsl(var(--primary))' }} />
                <span className="text-sm font-semibold" style={{ color: 'hsl(var(--primary))' }}>ตัวอย่างเลขห้อง</span>
              </div>
              <div className="space-y-1 text-sm" style={{ color: 'hsl(var(--color-text-2))' }}>
                <p>ชั้น {rooms.mixedSpecialFloor?.floorNo ?? 1} (พิเศษ): {(rooms.mixedSpecialFloor?.roomNumbers || []).join(', ')} ({(rooms.mixedSpecialFloor?.roomNumbers || []).length} ห้อง)</p>
                {Array.from({ length: Math.max(0, rooms.floors - 1) }, (_, i) => i + 1).filter(f => f !== (rooms.mixedSpecialFloor?.floorNo ?? 1)).slice(0, 3).map(f => (
                  <p key={f}>ชั้น {f}: {f}01-{f * 100 + rooms.roomsPerFloor} ({rooms.roomsPerFloor} ห้อง)</p>
                ))}
                {rooms.floors > 4 && <p>...</p>}
                <p className="pt-1 font-semibold">
                  รวม <span style={{ color: 'hsl(var(--primary))' }}>{rooms.floors}</span> ชั้น · <span style={{ color: 'hsl(var(--primary))' }}>{totalRooms}</span> ห้อง
                </p>
              </div>
            </div>
          </>
        )}

        {/* CUSTOM */}
        {rooms.format === 'CUSTOM' && (
          <>
            <FieldRow label="รายการห้อง (แต่ละบรรทัด: เลขห้อง, ค่าเช่า) *" icon={<Hash className="h-4 w-4" />} hint="พิมพ์ทุกห้องเอง แต่ละบรรทัด: เลขห้อง, ค่าเช่า เช่น 101, 5900">
              <textarea
                value={customInput}
                onChange={(e) => handleCustomInputChange(e.target.value)}
                placeholder={"101, 5900\n102, 5900\n201, 6500\n202, 6500\n203, 7500"}
                rows={6}
                className="w-full rounded-xl border px-3 py-2.5 text-sm transition-all font-mono resize-none"
                style={{ borderColor: 'hsl(var(--color-border))', background: 'hsl(var(--color-surface))', color: 'hsl(var(--color-text))' }}
              />
              {customError && <p className="mt-1 text-xs" style={{ color: 'hsl(var(--color-danger))' }}>{customError}</p>}
              <p className="mt-1 text-xs" style={{ color: 'hsl(var(--color-text-3))' }}>
                {rooms.customRooms.length > 0
                  ? rooms.customRooms.length + ' ห้อง กำลังจะสร้าง'
                  : 'ยังไม่ได้กรอก — พิมพ์ด้านบนแล้วกด Enter'}
              </p>
            </FieldRow>

            {rooms.customRooms.length > 0 && (
              <div className="rounded-lg border px-4 py-3" style={{ borderColor: 'hsl(var(--primary)/20)', background: 'hsl(var(--primary)/5)' }}>
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className="h-4 w-4" style={{ color: 'hsl(var(--primary))' }} />
                  <span className="text-sm font-semibold" style={{ color: 'hsl(var(--primary))' }}>ตัวอย่างเลขห้อง ({rooms.customRooms.length} ห้อง)</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {rooms.customRooms.slice(0, 30).map((r, i) => (
                    <span key={i} className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs" style={{ borderColor: 'hsl(var(--primary)/30)', color: 'hsl(var(--primary))' }}>
                      {r.roomNo}
                    </span>
                  ))}
                  {rooms.customRooms.length > 30 && (
                    <span className="text-xs px-2 py-0.5" style={{ color: 'hsl(var(--color-text-3))' }}>
                      +{rooms.customRooms.length - 30} ห้องอื่น
                    </span>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* บัญชีธนาคาร (optional) */}
      <div className="rounded-xl border p-5 space-y-5" style={{ borderColor: 'hsl(var(--color-border))', background: 'hsl(var(--color-surface))' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Landmark className="h-4 w-4" style={{ color: 'hsl(var(--primary))' }} />
            <h3 className="text-sm font-semibold" style={{ color: 'hsl(var(--color-text))' }}>บัญชีธนาคารสำหรับรับเงิน</h3>
          </div>
          <span className="text-xs px-2 py-1 rounded-full" style={{ background: 'hsl(var(--color-bg))', color: 'hsl(var(--color-text-3))' }}>ละเว้นได้</span>
        </div>
        <p className="text-xs -mt-2" style={{ color: 'hsl(var(--color-text-3))' }}>
          ใช้แสดงในใบแจ้งหนี้และสร้าง QR PromptPay · เพิ่มหรือแก้ไขทีหลังได้ที่ ตั้งค่า → บัญชีธนาคาร
        </p>

        <FieldRow label="ชื่อธนาคาร" icon={<Landmark className="h-4 w-4" />} hint="เช่น ธนาคารกสิกรไทย, ธนาคารไทยพาณิชย์">
          <input
            type="text"
            value={bankAccount.bankName}
            onChange={(e) => onBankAccountChange({ bankName: e.target.value })}
            placeholder="ธนาคารกสิกรไทย"
            className="w-full rounded-xl border px-3 py-2.5 text-sm transition-all"
            style={{ borderColor: 'hsl(var(--color-border))', background: 'hsl(var(--color-surface))', color: 'hsl(var(--color-text))' }}
          />
        </FieldRow>

        <FieldRow label="เลขที่บัญชี" icon={<Landmark className="h-4 w-4" />} hint="เช่น 123-4-56789-0">
          <input
            type="text"
            value={bankAccount.bankAccountNo}
            onChange={(e) => onBankAccountChange({ bankAccountNo: e.target.value })}
            placeholder="123-4-56789-0"
            className="w-full rounded-xl border px-3 py-2.5 text-sm transition-all"
            style={{ borderColor: 'hsl(var(--color-border))', background: 'hsl(var(--color-surface))', color: 'hsl(var(--color-text))' }}
          />
        </FieldRow>

        <FieldRow label="ชื่อบัญชี" icon={<Landmark className="h-4 w-4" />}>
          <input
            type="text"
            value={bankAccount.bankAccountName}
            onChange={(e) => onBankAccountChange({ bankAccountName: e.target.value })}
            placeholder="บัญชีออมทรัพย์ ชื่อ..."
            className="w-full rounded-xl border px-3 py-2.5 text-sm transition-all"
            style={{ borderColor: 'hsl(var(--color-border))', background: 'hsl(var(--color-surface))', color: 'hsl(var(--color-text))' }}
          />
        </FieldRow>

        <FieldRow label="เบอร์ PromptPay (สำหรับ QR)" icon={<Smartphone className="h-4 w-4" />} hint="เบอร์มือถือ 10 หลัก เช่น 0812345678">
          <input
            type="text"
            value={bankAccount.promptpay}
            onChange={(e) => onBankAccountChange({ promptpay: e.target.value })}
            placeholder="0812345678"
            maxLength={13}
            className="w-full rounded-xl border px-3 py-2.5 text-sm transition-all"
            style={{ borderColor: 'hsl(var(--color-border))', background: 'hsl(var(--color-surface))', color: 'hsl(var(--color-text))' }}
          />
        </FieldRow>
      </div>
    </div>
  );
}