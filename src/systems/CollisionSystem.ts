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
  public roomBounds = { minX: -5.8, maxX: 5.8, minZ: -1.8, maxZ: 7.8 };

  constructor(placementSystem: PlacementSystem) {
    this.placementSystem = placementSystem;
  }

  public setRoomBounds(minX: number, maxX: number, minZ: number, maxZ: number) {
    this.roomBounds = { minX, maxX, minZ, maxZ };
  }

  /**
   * Dynamically gathers all physical solid bounding boxes from all placed items in the room.
   */
  public getObstacles(ignoreStationId?: string): SolidObstacle[] {
    const obstacles: SolidObstacle[] = [];

    // 1. Reception Desks + Staff Area
    for (const desk of this.placementSystem.receptionDesks.values()) {
      const pos = desk.group.position;
      const rot = desk.rotationIndex % 4;

      if (rot === 0) {
        obstacles.push({
          id: desk.id,
          minX: pos.x - 1.26,
          maxX: pos.x + 1.26,
          minZ: pos.z - 1.55,
          maxZ: pos.z + 0.88,
          type: 'reception'
        });
      } else if (rot === 1) {
        obstacles.push({
          id: desk.id,
          minX: pos.x - 1.55,
          maxX: pos.x + 0.88,
          minZ: pos.z - 1.26,
          maxZ: pos.z + 1.26,
          type: 'reception'
        });
      } else if (rot === 2) {
        obstacles.push({
          id: desk.id,
          minX: pos.x - 1.26,
          maxX: pos.x + 1.26,
          minZ: pos.z - 0.88,
          maxZ: pos.z + 1.55,
          type: 'reception'
        });
      } else {
        obstacles.push({
          id: desk.id,
          minX: pos.x - 0.88,
          maxX: pos.x + 1.55,
          minZ: pos.z - 1.26,
          maxZ: pos.z + 1.26,
          type: 'reception'
        });
      }
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

    // 5. Placed Building Structures (Solid walls, columns, windows)
    for (let i = 0; i < this.placementSystem.buildingObjects.length; i++) {
      const bObj = this.placementSystem.buildingObjects[i];
      if (bObj.userData && bObj.userData.isWalkable) continue;

      const halfW = bObj.userData.halfW || 0.45;
      const halfD = bObj.userData.halfD || 0.45;
      obstacles.push({
        id: `building_${i}`,
        minX: bObj.position.x - halfW,
        maxX: bObj.position.x + halfW,
        minZ: bObj.position.z - halfD,
        maxZ: bObj.position.z + halfD,
        type: 'wall'
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

    // 2. Room Outer Perimeter Walls (except door opening at Z = 7.5 between X = -1.2 and +1.2)
    pos.x = Math.max(this.roomBounds.minX + radius, Math.min(this.roomBounds.maxX - radius, pos.x));
    pos.z = Math.max(this.roomBounds.minZ + radius, pos.z);

    // Entrance wall: only allow passage through doorway (width between X = -0.95 and +0.95)
    if (pos.z > this.roomBounds.maxZ - radius) {
      if (Math.abs(pos.x) > 0.95) {
        pos.z = this.roomBounds.maxZ - radius;
      }
    }

    return pos;
  }

  /**
   * Tests if a line segment between p1 and p2 intersects any solid obstacle.
   * Uses radius 0.45m for safe obstacle margin around 0.28m character body.
   */
  public isSegmentBlocked(
    p1: THREE.Vector3,
    p2: THREE.Vector3,
    radius: number = 0.45,
    ignoreStationId?: string
  ): boolean {
    const obstacles = this.getObstacles(ignoreStationId);
    const dist = p1.distanceTo(p2);
    const steps = Math.max(2, Math.ceil(dist / 0.15));

    // Check intermediate points along the segment
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

  /**
   * Check if a single world point (circle) overlaps any obstacle or room boundary.
   */
  public isPointBlocked(
    x: number,
    z: number,
    radius: number = 0.30,
    ignoreStationId?: string
  ): boolean {
    // 1. Room boundaries
    if (
      x < this.roomBounds.minX + radius ||
      x > this.roomBounds.maxX - radius ||
      z < this.roomBounds.minZ + radius
    ) {
      return true;
    }
    // Entrance wall: only doorway (X in [-0.95, +0.95]) allows passing z > roomBounds.maxZ - radius
    if (z > this.roomBounds.maxZ - radius) {
      if (Math.abs(x) > 0.95) return true;
    }

    // 2. Solid obstacles
    const obstacles = this.getObstacles(ignoreStationId);
    for (const obs of obstacles) {
      const closestX = Math.max(obs.minX, Math.min(x, obs.maxX));
      const closestZ = Math.max(obs.minZ, Math.min(z, obs.maxZ));
      const dx = x - closestX;
      const dz = z - closestZ;
      if (dx * dx + dz * dz < radius * radius) {
        return true;
      }
    }

    return false;
  }
}

