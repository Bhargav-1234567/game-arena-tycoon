export interface WorldBounds { minX: number; maxX: number; minZ: number; maxZ: number; }
export type WorldLocation = 'lounge' | 'workshop' | 'cafe' | 'plaza' | 'bus' | 'parking' | 'expansion';

export const ROOM_FOOTPRINTS: WorldBounds[] = [
  { minX: -6, maxX: 6, minZ: -2, maxZ: 8 },
  { minX: -6, maxX: 6, minZ: -6, maxZ: 8 },
  { minX: -6, maxX: 10, minZ: -6, maxZ: 8 },
  { minX: -6, maxX: 10, minZ: -10, maxZ: 8 },
  { minX: -6, maxX: 14, minZ: -10, maxZ: 8 },
  { minX: -10, maxX: 14, minZ: -10, maxZ: 8 },
  { minX: -10, maxX: 14, minZ: -14, maxZ: 8 }
];
export const RESERVED_PROPERTY = ROOM_FOOTPRINTS[6];
export const DISTRICT_BOUNDS: WorldBounds = { minX: -30, maxX: 30, minZ: -22, maxZ: 32 };
export const BUS_PASSENGERS = 12;
export const NAVIGATION = {
  doorX: 0, doorZ: 8, insideZ: 7, sidewalkZ: 10.5,
  spawnLeft: -13, spawnRight: 13, exitLeft: -15, exitRight: 15,
  busX: -5, busStopZ: 20, roadCenterZ: 15.75, busLaneZ: 16.9
} as const;

export interface DistrictPlace {
  id: WorldLocation;
  label: string;
  x: number;
  z: number;
  y: number;
  footprint?: WorldBounds;
}

export const DISTRICT_PLACES: DistrictPlace[] = [
  { id: 'lounge', label: 'Your Gaming Lounge', x: 0, z: 8.3, y: 4.6 },
  { id: 'workshop', label: 'Build & Boot Workshop', x: -18, z: 2, y: 5.3,
    footprint: { minX: -22, maxX: -14, minZ: -2, maxZ: 6 } },
  { id: 'cafe', label: 'Pixel Bites Café', x: 21, z: 2, y: 5.6,
    footprint: { minX: 17, maxX: 25, minZ: -2, maxZ: 6 } },
  { id: 'plaza', label: 'Tournament Plaza', x: 12, z: 25, y: 3,
    footprint: { minX: 5, maxX: 19, minZ: 20, maxZ: 30 } },
  { id: 'bus', label: 'Circuit Line Bus Stop', x: -5, z: 20.5, y: 3 },
  { id: 'parking', label: 'Visitor Parking', x: -25, z: 4, y: 1.8 },
  { id: 'expansion', label: 'Future Lounge Wings', x: 2, z: -11, y: .8 }
];

export function overlaps(a: WorldBounds, b: WorldBounds): boolean {
  return a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
}

export function lightPeriod(minutes: number): 'day' | 'evening' | 'night' {
  const time = ((minutes % 1440) + 1440) % 1440;
  return time >= 7 * 60 && time < 17 * 60 ? 'day' : time >= 17 * 60 && time < 20 * 60 ? 'evening' : 'night';
}
