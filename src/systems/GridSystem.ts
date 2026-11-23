import * as THREE from 'three';
import { findNavigationPath } from './Navigation.ts';
import type { WorldBounds } from '../data/world-layout.ts';

export interface GridCell {
  x: number; // grid coordinate
  z: number;
  worldX: number;
  worldZ: number;
  occupied: boolean;
  occupantId?: string;
  isWalkable: boolean;
  isUnlocked: boolean;
  roomType: 'lobby' | 'gaming' | 'vip' | 'none';
}

export class GridSystem {
  public readonly width: number;
  public readonly depth: number;
  public readonly cellSize: number = 1.0;
  private cells: Map<string, GridCell> = new Map();
  private owners = new Map<string, Set<string>>();
  public unlockedBounds: WorldBounds = { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
  public gridGroup: THREE.Group = new THREE.Group();
  public floorGroup: THREE.Group = new THREE.Group();

  constructor(width: number = 24, depth: number = 24) {
    this.width = width;
    this.depth = depth;
    this.initGrid();
  }

  private getKey(x: number, z: number): string {
    return `${x},${z}`;
  }

  private initGrid() {
    const halfW = Math.floor(this.width / 2);
    const halfD = Math.floor(this.depth / 2);

    for (let x = -halfW; x < halfW; x++) {
      for (let z = -halfD; z < halfD; z++) {
        const cell: GridCell = {
          x,
          z,
          worldX: x * this.cellSize + this.cellSize / 2,
          worldZ: z * this.cellSize + this.cellSize / 2,
          occupied: false,
          isWalkable: false,
          isUnlocked: false,
          roomType: 'gaming'
        };
        this.cells.set(this.getKey(x, z), cell);
      }
    }
  }

  public async buildFloor(scene: THREE.Scene) {
    scene.add(this.floorGroup);
    scene.add(this.gridGroup);
  }

  public async rebuildFloor(minX: number, maxX: number, minZ: number, maxZ: number) {
    // Clear existing floor and grid
    while (this.floorGroup.children.length > 0) {
      const child = this.floorGroup.children[0];
      this.floorGroup.remove(child);
    }
    while (this.gridGroup.children.length > 0) {
      const child = this.gridGroup.children[0];
      this.gridGroup.remove(child);
    }

    const width = maxX - minX;
    const depth = maxZ - minZ;
    const centerX = (minX + maxX) / 2;
    const centerZ = (minZ + maxZ) / 2;

    // 1. Continuous, seamless bright white floor plane covering the entire room bounds
    const floorGeo = new THREE.PlaneGeometry(width, depth);
    floorGeo.rotateX(-Math.PI / 2);
    floorGeo.computeBoundingBox();
    floorGeo.computeBoundingSphere();

    const floorMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,       // Pure bright clean white
      roughness: 0.18,       // Sleek polished gaming lounge sheen
      metalness: 0.04
    });

    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.position.set(centerX, 0.0, centerZ);
    floorMesh.receiveShadow = true;
    floorMesh.name = 'ContinuousWhiteFloor';
    this.floorGroup.add(floorMesh);

    // Foundation slab base beneath floor
    const baseGeo = new THREE.BoxGeometry(width + 0.1, 0.15, depth + 0.1);
    const baseMat = new THREE.MeshBasicMaterial({ color: 0x0f172a });
    const baseMesh = new THREE.Mesh(baseGeo, baseMat);
    baseMesh.position.set(centerX, -0.08, centerZ);
    this.floorGroup.add(baseMesh);

    // Grid group kept hidden during normal play to keep floor seamless and continuous
    this.gridGroup.visible = false;
  }

  public getCell(x: number, z: number): GridCell | undefined {
    return this.cells.get(this.getKey(x, z));
  }

  public worldToGrid(worldX: number, worldZ: number): { x: number; z: number } {
    return {
      x: Math.floor(worldX / this.cellSize),
      z: Math.floor(worldZ / this.cellSize)
    };
  }

  public gridToWorld(gridX: number, gridZ: number): { x: number; z: number } {
    return {
      x: gridX * this.cellSize + this.cellSize / 2,
      z: gridZ * this.cellSize + this.cellSize / 2
    };
  }

  public canOccupy(gridX: number, gridZ: number, width: number = 1, depth: number = 1, ignoreOwner?: string): boolean {
    for (let x = 0; x < width; x++) {
      for (let z = 0; z < depth; z++) {
        const cell = this.getCell(gridX + x, gridZ + z);
        const owners = this.owners.get(this.getKey(gridX + x, gridZ + z));
        if (!cell || !cell.isUnlocked || (cell.occupied && (!ignoreOwner || !owners || [...owners].some((owner) => owner !== ignoreOwner)))) {
          return false;
        }
      }
    }
    return true;
  }

  public setOccupied(
    gridX: number,
    gridZ: number,
    width: number,
    depth: number,
    occupied: boolean,
    occupantId?: string
  ) {
    for (let x = 0; x < width; x++) {
      for (let z = 0; z < depth; z++) {
        const cell = this.getCell(gridX + x, gridZ + z);
        if (cell) {
          const key = this.getKey(gridX + x, gridZ + z), owners = this.owners.get(key) ?? new Set<string>();
          if (occupied) owners.add(occupantId ?? 'anonymous');
          else if (occupantId) owners.delete(occupantId);
          else owners.clear();
          this.owners.set(key, owners);
          cell.occupied = owners.size > 0;
          cell.isWalkable = cell.isUnlocked && !cell.occupied;
          cell.occupantId = owners.values().next().value;
        }
      }
    }
  }

  public setZoneUnlocked(minX: number, maxX: number, minZ: number, maxZ: number, unlocked: boolean = true) {
    for (let x = minX; x <= maxX; x++) {
      for (let z = minZ; z <= maxZ; z++) {
        if (unlocked && !this.getCell(x, z)) this.cells.set(this.getKey(x, z), {
          x, z, worldX: x + .5, worldZ: z + .5, occupied: false, isWalkable: true, isUnlocked: true, roomType: 'gaming'
        });
        const cell = this.getCell(x, z);
        if (cell) {
          cell.isUnlocked = unlocked;
          cell.isWalkable = unlocked && !cell.occupied;
        }
      }
    }
    const cells = [...this.cells.values()].filter((cell) => cell.isUnlocked);
    if (cells.length) this.unlockedBounds = { minX: Math.min(...cells.map((cell) => cell.x)), maxX: Math.max(...cells.map((cell) => cell.x)) + 1,
      minZ: Math.min(...cells.map((cell) => cell.z)), maxZ: Math.max(...cells.map((cell) => cell.z)) + 1 };
  }

  public releaseOwner(id: string): void {
    for (const [key, owners] of this.owners) {
      if (!owners.delete(id)) continue;
      const cell = this.cells.get(key)!;
      cell.occupied = owners.size > 0; cell.isWalkable = cell.isUnlocked && !cell.occupied;
      cell.occupantId = owners.values().next().value;
    }
  }

  public isCellUnlocked(gridX: number, gridZ: number): boolean {
    const cell = this.getCell(gridX, gridZ);
    return !!cell && cell.isUnlocked;
  }

  public getRandomWalkableCell(): GridCell | null {
    const walkable: GridCell[] = [];
    this.cells.forEach((c) => {
      if (c.isUnlocked && c.isWalkable && !c.occupied) walkable.push(c);
    });
    if (walkable.length === 0) return null;
    return walkable[Math.floor(Math.random() * walkable.length)];
  }

  /** Physical navigation can traverse reserved access tiles, but never solid or locked areas. */
  public findPath(start: THREE.Vector3, target: THREE.Vector3,
    isBlocked?: (a: THREE.Vector3, b: THREE.Vector3) => boolean): THREE.Vector3[] {
    const blocked = (a: THREE.Vector3, b: THREE.Vector3) => {
      if (isBlocked?.(a, b)) return true;
      const steps = Math.max(1, Math.ceil(a.distanceTo(b) / .2));
      for (let index = 0; index <= steps; index++) {
        const t = index / steps, cell = this.getCell(Math.floor(a.x + (b.x - a.x) * t), Math.floor(a.z + (b.z - a.z) * t));
        if (!cell?.isUnlocked || (!isBlocked && !cell.isWalkable)) return true;
      }
      return false;
    };
    return findNavigationPath(start, target, this.unlockedBounds, blocked);
  }
}
