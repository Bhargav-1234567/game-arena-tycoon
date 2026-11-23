import { NAVIGATION } from '../data/world-layout.ts';
import { NAVIGATION_RADIUS } from '../data/simulation.ts';
import type { GridSystem } from './GridSystem.ts';
import type { CollisionSystem } from './CollisionSystem.ts';
import { Vector3 } from 'three';
import type { WorldBounds } from '../data/world-layout.ts';

/** Radius-aware half-metre navigation. An impossible or blocked destination has no path. */
export function findNavigationPath(start: Vector3, target: Vector3, bounds: WorldBounds,
  blocked: (a: Vector3, b: Vector3) => boolean): Vector3[] {
  const inside = (point: Vector3) => point.x >= bounds.minX && point.x < bounds.maxX && point.z >= bounds.minZ && point.z < bounds.maxZ;
  if (!inside(start) || !inside(target) || blocked(start, start) || blocked(target, target)) return [];
  if (!blocked(start, target)) return [target.clone()];
  interface Node { x: number; z: number; g: number; f: number; parent?: Node; }
  const heap: Node[] = [], costs = new Map<string, number>(), closed = new Set<string>();
  const key = (x: number, z: number) => `${x},${z}`;
  const push = (node: Node) => {
    heap.push(node); let index = heap.length - 1;
    while (index > 0) { const parent = (index - 1) >> 1; if (heap[parent].f <= node.f) break; heap[index] = heap[parent]; index = parent; } heap[index] = node;
  };
  const pop = () => {
    const first = heap[0], last = heap.pop()!;
    if (heap.length) {
      let index = 0;
      while (index * 2 + 1 < heap.length) {
        let child = index * 2 + 1;
        if (child + 1 < heap.length && heap[child + 1].f < heap[child].f) child++;
        if (heap[child].f >= last.f) break;
        heap[index] = heap[child]; index = child;
      } heap[index] = last;
    } return first;
  };
  const point = (x: number, z: number) => new Vector3(x * .5, start.y, z * .5);
  const centerX = Math.round(start.x * 2), centerZ = Math.round(start.z * 2);
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
    const x = centerX + dx, z = centerZ + dz, position = point(x, z);
    if (!inside(position) || blocked(start, position)) continue;
    const g = start.distanceTo(position), node = { x, z, g, f: g + position.distanceTo(target) };
    costs.set(key(x, z), g); push(node);
  }
  const valid = new Map<string, boolean>();
  let end: Node | undefined;
  while (heap.length) {
    const current = pop(), currentKey = key(current.x, current.z);
    if (closed.has(currentKey) || current.g > (costs.get(currentKey) ?? Infinity)) continue;
    closed.add(currentKey);
    const from = point(current.x, current.z);
    if (from.distanceTo(target) <= .8 && !blocked(from, target)) { end = current; break; }
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      if (!dx && !dz) continue;
      const x = current.x + dx, z = current.z + dz, nextKey = key(x, z);
      if (closed.has(nextKey)) continue;
      const to = point(x, z);
      if (!valid.has(nextKey)) valid.set(nextKey, inside(to) && !blocked(to, to));
      if (!valid.get(nextKey) || blocked(from, to)) continue;
      const g = current.g + Math.hypot(dx, dz) * .5;
      if (g >= (costs.get(nextKey) ?? Infinity)) continue;
      costs.set(nextKey, g); push({ x, z, g, f: g + to.distanceTo(target), parent: current });
    }
  }
  if (!end) return [];
  const raw: Vector3[] = [target.clone()];
  for (let node: Node | undefined = end; node; node = node.parent) raw.unshift(point(node.x, node.z));
  raw.unshift(start.clone());
  const result: Vector3[] = []; let index = 0;
  while (index < raw.length - 1) {
    let next = raw.length - 1;
    while (next > index + 1 && blocked(raw[index], raw[next])) next--;
    if (blocked(raw[index], raw[next])) return [];
    result.push(raw[next]); index = next;
  }
  return result;
}

export function loungeRoute(position: Vector3, destination: Vector3, grid?: GridSystem, collision?: CollisionSystem): Vector3[] {
    const inside = new Vector3(NAVIGATION.doorX, 0, NAVIGATION.insideZ);
    const query = collision?.createNavigationQuery(NAVIGATION_RADIUS);
    const find = (start: Vector3, end: Vector3) => grid
      ? grid.findPath(start, end, query) : query?.(start, end) ? [] : [end.clone()];
    if (destination.z > NAVIGATION.doorZ) {
      if (position.z > NAVIGATION.doorZ) return position.z > 12.8
        ? [new Vector3(NAVIGATION.doorX, 0, position.z), new Vector3(NAVIGATION.doorX, 0, NAVIGATION.sidewalkZ), destination.clone()]
        : [destination.clone()];
      const route = find(position, inside);
      return route.length ? [...route, new Vector3(0, 0, NAVIGATION.doorZ), new Vector3(0, 0, NAVIGATION.sidewalkZ), destination.clone()] : [];
    }
    if (position.z > NAVIGATION.doorZ) {
      const route = find(inside, destination);
      if (!route.length) return [];
      return [
        ...(position.z > 12.8 ? [new Vector3(0, 0, position.z)] : []),
        new Vector3(0, 0, NAVIGATION.sidewalkZ), new Vector3(0, 0, NAVIGATION.doorZ), inside, ...route
      ];
    }
    return find(position, destination);
}
