import * as THREE from 'three';
import { PlacementSystem } from './PlacementSystem.ts';

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
  private roomBounds = { minX: -7.6, maxX: 7.6, minZ: -7.6, maxZ: 7.6 };

  constructor(placementSystem: PlacementSystem) {
    this.placementSystem = placementSystem;
  }

  /**
   * Dynamically gathers all physical solid bounding boxes from all placed items in the room.
   */
  public getObstacles(ignoreStationId?: string): SolidObstacle[] {
    const obstacles: SolidObstacle[] = [];

    // 1. Reception Desk
    if (this.placementSystem.receptionDesk) {
      const desk = this.placementSystem.receptionDesk;
      const pos = desk.group.position;
      const rot = desk.rotationIndex % 2 === 0;
      // Reception desk is 2.5m wide x 1.76m deep
      const halfW = rot ? 1.30 : 0.92;
      const halfD = rot ? 0.92 : 1.30;
      obstacles.push({
        id: desk.id,
        minX: pos.x - halfW,
        maxX: pos.x + halfW,
        minZ: pos.z - halfD,
        maxZ: pos.z + halfD,
        type: 'reception'
      });
    }

    // 2. Gaming Stations (Desk and Chair)
    for (const [id, station] of this.placementSystem.stations.entries()) {
      const pos = station.group.position;
      const rot = station.rotationIndex % 2 === 0;

      // Desk tabletop body (solid desk: 1.5m wide x 0.85m deep)
      const deskHalfW = rot ? 0.80 : 0.45;
      const deskHalfD = rot ? 0.45 : 0.80;
      obstacles.push({
        id: `${id}_desk`,
        minX: pos.x - deskHalfW,
        maxX: pos.x + deskHalfW,
        minZ: pos.z - deskHalfD,
        maxZ: pos.z + deskHalfD,
        type: 'desk'
      });

      // Chair body (if not the assigned station of the moving customer)
      if (id !== ignoreStationId) {
        const chairPos = station.getSeatingWorldPosition();
        obstacles.push({
          id: `${id}_chair`,
          minX: chairPos.x - 0.35,
          maxX: chairPos.x + 0.35,
          minZ: chairPos.z - 0.35,
          maxZ: chairPos.z + 0.35,
          type: 'chair'
        });
      }
    }

    // 3. Facilities (Arcade, Vending, Sofa)
    for (const [id, facility] of this.placementSystem.facilities.entries()) {
      const pos = facility.group.position;
      const rot = facility.rotationIndex % 2 === 0;

      if (facility.type === 'sofa') {
        // Sofa is 2.0m wide x 1.0m deep
        const halfW = rot ? 1.05 : 0.55;
        const halfD = rot ? 0.55 : 1.05;
        obstacles.push({
          id,
          minX: pos.x - halfW,
          maxX: pos.x + halfW,
          minZ: pos.z - halfD,
          maxZ: pos.z + halfD,
          type: 'facility'
        });
      } else {
        // Arcade / Vending: 1.0m x 1.0m
        obstacles.push({
          id,
          minX: pos.x - 0.52,
          maxX: pos.x + 0.52,
          minZ: pos.z - 0.52,
          maxZ: pos.z + 0.52,
          type: 'facility'
        });
      }
    }

    // 4. Decor Objects (Planter, etc.)
    for (let i = 0; i < this.placementSystem.decorObjects.length; i++) {
      const decor = this.placementSystem.decorObjects[i];
      obstacles.push({
        id: `decor_${i}`,
        minX: decor.position.x - 0.50,
        maxX: decor.position.x + 0.50,
        minZ: decor.position.z - 0.50,
        maxZ: decor.position.z + 0.50,
        type: 'decor'
      });
    }

    return obstacles;
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

    for (let iter = 0; iter < 2; iter++) {
      for (const obs of obstacles) {
        const closestX = Math.max(obs.minX, Math.min(pos.x, obs.maxX));
        const closestZ = Math.max(obs.minZ, Math.min(pos.z, obs.maxZ));

        const dx = pos.x - closestX;
        const dz = pos.z - closestZ;
        const distSq = dx * dx + dz * dz;

        if (distSq < radius * radius) {
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
    }

    // 2. Room Outer Perimeter Walls (except door opening at Z = 7.5 between X = -1.2 and +1.2)
    pos.x = Math.max(this.roomBounds.minX + radius, Math.min(this.roomBounds.maxX - radius, pos.x));
    pos.z = Math.max(this.roomBounds.minZ + radius, pos.z);

    // Entrance wall: only allow passage through doorway
    if (pos.z > this.roomBounds.maxZ - radius) {
      if (Math.abs(pos.x) > 1.2) {
        pos.z = this.roomBounds.maxZ - radius;
      }
    }

    return pos;
  }

  /**
   * Tests if a line segment between p1 and p2 intersects any solid obstacle.
   */
  public isSegmentBlocked(
    p1: THREE.Vector3,
    p2: THREE.Vector3,
    radius: number = 0.20,
    ignoreStationId?: string
  ): boolean {
    const obstacles = this.getObstacles(ignoreStationId);
    const steps = Math.ceil(p1.distanceTo(p2) / 0.3);
    if (steps <= 1) return false;

    // Check intermediate points along the segment (excluding the start and target endpoints)
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const testX = p1.x + (p2.x - p1.x) * t;
      const testZ = p1.z + (p2.z - p1.z) * t;

      for (const obs of obstacles) {
        const closestX = Math.max(obs.minX, Math.min(testX, obs.maxX));
        const closestZ = Math.max(obs.minZ, Math.min(testZ, obs.maxZ));
        const dx = testX - closestX;
        const dz = testZ - closestZ;
        if (dx * dx + dz * dz < radius * radius) {
          return true;
        }
      }
    }

    return false;
  }
}

