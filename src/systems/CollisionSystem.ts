import * as THREE from 'three';
import { NAVIGATION } from '../data/world-layout.ts';
import { circleOverlaps } from './LayoutGeometry.ts';
import { NAVIGATION_RADIUS } from '../data/simulation.ts';
import type { PlacementSystem } from './PlacementSystem.ts';

export interface SolidObstacle {
  id: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  type: 'desk' | 'chair' | 'reception' | 'facility' | 'decor' | 'wall';
}

export class CollisionSystem {
  private placementSystem: PlacementSystem;
  public roomBounds = { minX: -5.8, maxX: 5.8, minZ: -1.8, maxZ: 7.8 };

  constructor(placementSystem: PlacementSystem) {
    this.placementSystem = placementSystem;
  }

  public setRoomBounds(minX: number, maxX: number, minZ: number, maxZ: number) {
    this.roomBounds = { minX, maxX, minZ, maxZ };
  }

  /** A seating exception may ignore a chair, never its desk. Moving objects have no collider. */
  public getObstacles(ignoreChairId?: string): SolidObstacle[] {
    return this.placementSystem.getPlacedGeometries().flatMap((entry) => entry.solids)
      .filter((obstacle) => obstacle.id !== `${ignoreChairId}_chair`);
  }

  public isOutsideWorld(x: number, z: number, radius: number): boolean {
    const room = this.roomBounds;
    if (z <= room.maxZ + .2) {
      return x < room.minX + radius || x > room.maxX - radius || z < room.minZ + radius ||
        (z > room.maxZ - radius && Math.abs(x) > .95 - radius);
    }
    return x < -24 || x > 28 || z > NAVIGATION.busStopZ + .8 ||
      (z > 12.8 && z < 18.8 && Math.abs(x) > 1.3 - radius);
  }

  /** Capture geometry once for a whole route search, including both segment endpoints. */
  public createNavigationQuery(radius = NAVIGATION_RADIUS, ignoreChairId?: string, supplied?: SolidObstacle[]): (a: THREE.Vector3, b: THREE.Vector3) => boolean {
    const obstacles = supplied ?? this.getObstacles(ignoreChairId);
    return (a, b) => {
      const steps = Math.max(1, Math.ceil(a.distanceTo(b) / .12));
      for (let index = 0; index <= steps; index++) {
        const t = index / steps, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
        if (this.isOutsideWorld(x, z, radius) || obstacles.some((obstacle) => circleOverlaps({ x, z }, radius, obstacle))) return true;
      }
      return false;
    };
  }

  /**
   * Resolves physical rigid collision against all solid obstacles and room walls.
   * Modifies pos in-place and returns it.
   */
  public resolveCollision(
    pos: THREE.Vector3,
    radius: number = 0.28,
    ignoreStationId?: string
  ): THREE.Vector3 {
    // 1. Solid Obstacles
    const obstacles = this.getObstacles(ignoreStationId);

    for (let iter = 0; iter < 4; iter++) {
      let pushed = false;
      for (const obs of obstacles) {
        const closestX = Math.max(obs.minX, Math.min(pos.x, obs.maxX));
        const closestZ = Math.max(obs.minZ, Math.min(pos.z, obs.maxZ));

        const dx = pos.x - closestX;
        const dz = pos.z - closestZ;
        const distSq = dx * dx + dz * dz;

        if (distSq < radius * radius) {
          pushed = true;
          if (distSq > 0.00001) {
            const dist = Math.sqrt(distSq);
            const push = radius - dist;
            pos.x += (dx / dist) * push;
            pos.z += (dz / dist) * push;
          } else {
            // Center is completely inside the obstacle: push out along minimal penetration axis
            const distL = pos.x - obs.minX;
            const distR = obs.maxX - pos.x;
            const distB = pos.z - obs.minZ;
            const distF = obs.maxZ - pos.z;
            const minPen = Math.min(distL, distR, distB, distF);

            if (minPen === distL) pos.x = obs.minX - radius;
            else if (minPen === distR) pos.x = obs.maxX + radius;
            else if (minPen === distB) pos.z = obs.minZ - radius;
            else pos.z = obs.maxZ + radius;
          }
        }
      }
      if (!pushed) break;
    }

    // 2. Room Outer Perimeter Walls & Exterior Sidewalk Boundaries
    if (pos.z <= this.roomBounds.maxZ + 0.20) {
      // Inside room bounds
      pos.x = Math.max(this.roomBounds.minX + radius, Math.min(this.roomBounds.maxX - radius, pos.x));
      pos.z = Math.max(this.roomBounds.minZ + radius, pos.z);

      // Entrance wall: only allow passage through doorway (width between X = -0.95 and +0.95)
      if (pos.z > this.roomBounds.maxZ - radius) {
        if (Math.abs(pos.x) > 0.95 - radius) {
          pos.z = this.roomBounds.maxZ - radius;
        }
      }
    } else {
      // Exterior sidewalk & forecourt bounds (X: [-24, 28], Z: [8.0, 12.8] before roadway curb)
      pos.x = Math.max(-24.0, Math.min(28.0, pos.x));
      if (pos.z >= 18.8) pos.z = Math.min(NAVIGATION.busStopZ + .8, pos.z);
      else if (pos.z > 12.8) pos.x = Math.max(-1.3 + radius, Math.min(1.3 - radius, pos.x));
      else pos.z = Math.max(this.roomBounds.maxZ, pos.z);
    }

    return pos;
  }

  public isSegmentBlocked(a: THREE.Vector3, b: THREE.Vector3, radius = NAVIGATION_RADIUS, ignoreChairId?: string): boolean {
    return this.createNavigationQuery(radius, ignoreChairId)(a, b);
  }

  public isPointBlocked(x: number, z: number, radius = .28, ignoreChairId?: string): boolean {
    return this.isOutsideWorld(x, z, radius) || this.getObstacles(ignoreChairId).some((obstacle) => circleOverlaps({ x, z }, radius, obstacle));
  }
}
