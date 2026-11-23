import { CHAIR_DIMS, DESK_SURFACES } from '../entities/GamingStation.ts';
import type { BuildableItem } from '../data/assets.ts';
import type { WorldBounds } from '../data/world-layout.ts';
import { NAVIGATION_RADIUS, CHAIR_ENTRY_SIDE, CHAIR_ENTRY_FORWARD } from '../data/simulation.ts';

export interface LayoutPoint { x: number; z: number; }
export interface LayoutObstacle extends WorldBounds { id: string; type: 'desk' | 'chair' | 'reception' | 'facility' | 'decor' | 'wall'; }
export interface PlacementGeometry {
  id: string;
  item: BuildableItem;
  reserved: WorldBounds;
  solids: LayoutObstacle[];
  access: LayoutPoint[];
  seat?: LayoutPoint;
  entryPoints?: LayoutPoint[];
  center: LayoutPoint;
}
export const overlaps = (a: WorldBounds, b: WorldBounds) => a.minX < b.maxX - .001 && a.maxX > b.minX + .001 && a.minZ < b.maxZ - .001 && a.maxZ > b.minZ + .001;
export function circleOverlaps(point: LayoutPoint, radius: number, box: WorldBounds): boolean {
  const dx = point.x - Math.max(box.minX, Math.min(box.maxX, point.x));
  const dz = point.z - Math.max(box.minZ, Math.min(box.maxZ, point.z));
  return dx * dx + dz * dz < radius * radius - .000001;
}
export function rotatedPoint(center: LayoutPoint, x: number, z: number, rotation: number): LayoutPoint {
  return { x: center.x + [x, z, -x, -z][rotation % 4], z: center.z + [z, -x, -z, x][rotation % 4] };
}
function rotatedBox(center: LayoutPoint, bounds: WorldBounds, rotation: number): WorldBounds {
  const a = rotatedPoint(center, bounds.minX, bounds.minZ, rotation), b = rotatedPoint(center, bounds.maxX, bounds.maxZ, rotation);
  return { minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x), minZ: Math.min(a.z, b.z), maxZ: Math.max(a.z, b.z) };
}
export function wallOffset(item: BuildableItem, rotation: number): LayoutPoint {
  const wall = item.category === 'building' && ['wall_', 'door_', 'barricade_', 'border_'].some((prefix) => item.id.startsWith(prefix)) &&
    !item.id.includes('corner') && !item.id.includes('column');
  return wall ? { x: [.4, 0, -.4, 0][rotation % 4], z: [0, .4, 0, -.4][rotation % 4] } : { x: 0, z: 0 };
}
export function geometryFor(item: BuildableItem, gridX: number, gridZ: number, rotation: number, id = 'candidate', chairLevel = 1, deskLevel = 1): PlacementGeometry {
  const w = rotation % 2 ? item.height : item.width, h = rotation % 2 ? item.width : item.height;
  const center = { x: gridX + w / 2, z: gridZ + h / 2 };
  const result: PlacementGeometry = { id, item, center, reserved: { minX: gridX, maxX: gridX + w, minZ: gridZ, maxZ: gridZ + h }, solids: [], access: [] };
  const box = (bounds: WorldBounds, type: LayoutObstacle['type'], suffix = '') => result.solids.push({ ...rotatedBox(center, bounds, rotation), id: id + suffix, type });
  if (item.category === 'station') {
    const chair = CHAIR_DIMS[chairLevel], surface = DESK_SURFACES[deskLevel];
    const chairZ = surface.frontZ + .03 + chair.d / 2;
    result.reserved = rotatedBox(center, { minX: -1, maxX: 1, minZ: -.5, maxZ: 2.5 }, rotation);
    box({ minX: -.8, maxX: .8, minZ: -.45, maxZ: .45 }, 'desk', '_desk');
    box({ minX: -chair.w / 2 - .02, maxX: chair.w / 2 + .02, minZ: chairZ - chair.d / 2 - .02, maxZ: chairZ + chair.d / 2 + .02 }, 'chair', '_chair');
    result.seat = rotatedPoint(center, 0, chairZ - .08, rotation);
    result.entryPoints = [-1, 1].map((side) => rotatedPoint(center, side * CHAIR_ENTRY_SIDE, chairZ + CHAIR_ENTRY_FORWARD, rotation));
    result.access = [rotatedPoint(center, 0, chairZ + chair.d / 2 + NAVIGATION_RADIUS + .10, rotation)];
  } else if (item.id.startsWith('reception')) {
    result.reserved = rotatedBox(center, { minX: -2, maxX: 2, minZ: -2.5, maxZ: 1.5 }, rotation);
    box({ minX: -1.26, maxX: 1.26, minZ: -1.55, maxZ: .88 }, 'reception');
    result.access = [0, 1, 2].map((index) => rotatedPoint(center, 0, 1.85 + index * .85, rotation));
  } else if (item.id.startsWith('sofa')) box({ minX: -1.05, maxX: 1.05, minZ: -.55, maxZ: .55 }, 'facility');
  else if (item.id.startsWith('vending') || item.id.startsWith('arcade')) box({ minX: -.52, maxX: .52, minZ: -.52, maxZ: .52 }, 'facility');
  else if (item.category === 'building') {
    if (!item.id.startsWith('floor_') && !item.id.includes('doorway')) {
      const offset = wallOffset(item, rotation), wall = offset.x !== 0 || offset.z !== 0 || item.id.startsWith('wall_') || item.id.startsWith('door_');
      const halfW = wall ? (rotation % 2 ? w * .48 : .15) : w * .48;
      const halfD = wall ? (rotation % 2 ? .15 : h * .48) : h * .48;
      result.solids.push({ id, type: 'wall', minX: center.x + offset.x - halfW, maxX: center.x + offset.x + halfW,
        minZ: center.z + offset.z - halfD, maxZ: center.z + offset.z + halfD });
    }
  } else box({ minX: -.5, maxX: .5, minZ: -.5, maxZ: .5 }, 'decor');
  return result;
}
