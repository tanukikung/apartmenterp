// ============================================================================
// Room Number Format Types
// ============================================================================

export type RoomNumberFormat = 'SIMPLE' | 'HOTEL' | 'CUSTOM_PREFIX' | 'MIXED';

export interface MixedSpecialFloor {
  floorNo: number;
  roomNumbers: string[];
}

export interface GenerateRoomNumbersOptions {
  prefix?: string;
  mixedSpecialFloor?: MixedSpecialFloor;
}

// ============================================================================
// Room Number Generator
// ============================================================================

/**
 * Generates room numbers based on format, floors, and rooms per floor.
 *
 * Formats:
 * - SIMPLE:   floor N → N01, N02...    (N=1→101,102; N=8→801,802)
 * - HOTEL:    floor N → N*100+1...     (N=1→001,002; N=8→801,802)
 * - CUSTOM_PREFIX: prefix "32" → 3201,3202... (prefix*100 + roomIndex)
 * - MIXED:    special floor uses custom room numbers, others use CUSTOM_PREFIX logic
 */
export function generateRoomNumbers(
  format: RoomNumberFormat,
  floors: number,
  roomsPerFloor: number,
  options?: GenerateRoomNumbersOptions
): string[] {
  const { prefix, mixedSpecialFloor } = options || {};

  // For MIXED format, we return custom room numbers directly
  if (format === 'MIXED' && mixedSpecialFloor) {
    const result: string[] = [];

    // First, add the special floor's custom room numbers
    result.push(...mixedSpecialFloor.roomNumbers);

    // Then, add rooms for other floors
    // User wants: Floor 2 → 3201-3232, Floor 8 → 3801-3832
    // Pattern: prefix "32" means base 30 + floor number
    // So for floor N: roomNo = (30 + N) * 100 + roomIndex + 1
    for (let floor = 1; floor <= floors; floor++) {
      if (floor === mixedSpecialFloor.floorNo) continue;
      for (let room = 0; room < roomsPerFloor; room++) {
        if (prefix) {
          const prefixNum = parseInt(prefix, 10);
          if (!isNaN(prefixNum)) {
            // prefix "32" means: 30 is base, floor 2 starts there
            // Formula: roomPrefix = prefixNum + (floor - 2)
            const floorPrefix = prefixNum + (floor - 2);
            result.push(String(floorPrefix * 100 + (room + 1)));
          } else {
            result.push(`${floor}${String(room + 1).padStart(2, '0')}`);
          }
        } else {
          result.push(`${floor}${String(room + 1).padStart(2, '0')}`);
        }
      }
    }

    return result;
  }

  // Standard formats (SIMPLE, HOTEL, CUSTOM_PREFIX)
  const roomDefs: { floorNo: number; index: number }[] = [];

  for (let floor = 1; floor <= floors; floor++) {
    for (let room = 0; room < roomsPerFloor; room++) {
      roomDefs.push({ floorNo: floor, index: room });
    }
  }

  return roomDefs.map(({ floorNo, index }) => {
    switch (format) {
      case 'SIMPLE':
        return `${floorNo}${String(index + 1).padStart(2, '0')}`;

      case 'HOTEL':
        return String(floorNo * 100 + (index + 1)).padStart(3, '0');

      case 'CUSTOM_PREFIX':
        if (prefix) {
          const prefixNum = parseInt(prefix, 10);
          if (!isNaN(prefixNum)) {
            return String(prefixNum * 100 + (index + 1));
          }
        }
        return `${floorNo}${String(index + 1).padStart(2, '0')}`;

      default:
        return `${floorNo}${String(index + 1).padStart(2, '0')}`;
    }
  });
}

// ============================================================================
// Preview generators for UI
// ============================================================================

/**
 * Get a preview of room numbers for display in the wizard UI.
 * Returns up to 5 rooms per floor for the first 2 floors.
 */
export function getRoomNumberPreview(
  format: RoomNumberFormat,
  floors: number,
  roomsPerFloor: number,
  options?: GenerateRoomNumbersOptions
): { floorNo: number; rooms: string[] }[] {
  const previewFloors = Math.min(floors, 2);
  const previewRoomsPerFloor = Math.min(roomsPerFloor, 5);

  const result: { floorNo: number; rooms: string[] }[] = [];

  for (let floor = 1; floor <= previewFloors; floor++) {
    const floorRooms: string[] = [];
    for (let room = 0; room < previewRoomsPerFloor; room++) {
      let roomNo: string;
      switch (format) {
        case 'SIMPLE':
          roomNo = `${floor}${String(room + 1).padStart(2, '0')}`;
          break;
        case 'HOTEL':
          roomNo = String(floor * 100 + (room + 1)).padStart(3, '0');
          break;
        case 'CUSTOM_PREFIX':
        case 'MIXED':
          if (options?.prefix) {
            const prefixNum = parseInt(options.prefix, 10);
            if (!isNaN(prefixNum)) {
              roomNo = String(prefixNum * 100 + (room + 1));
              break;
            }
          }
          roomNo = `${floor}${String(room + 1).padStart(2, '0')}`;
          break;
        default:
          roomNo = `${floor}${String(room + 1).padStart(2, '0')}`;
      }
      floorRooms.push(roomNo);
    }
    result.push({ floorNo: floor, rooms: floorRooms });
  }

  return result;
}
