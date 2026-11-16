import * as THREE from 'three';
import { AssetManager } from '../services/AssetManager.ts';

export interface GridCell {
  x: number; // grid coordinate
  z: number;
  worldX: number;
  worldZ: number;
  occupied: boolean;
  occupantId?: string;
  isWalkable: boolean;
  roomType: 'lobby' | 'gaming' | 'vip' | 'none';
}

export class GridSystem {
  public readonly width: number;
  public readonly depth: number;
  public readonly cellSize: number = 1.0;
  private cells: Map<string, GridCell> = new Map();
  public gridGroup: THREE.Group = new THREE.Group();
  public floorGroup: THREE.Group = new THREE.Group();

  constructor(width: number = 16, depth: number = 16) {
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
          isWalkable: true,
          roomType: 'gaming'
        };
        this.cells.set(this.getKey(x, z), cell);
      }
    }
  }

  public async buildFloor(scene: THREE.Scene) {
    scene.add(this.floorGroup);
    scene.add(this.gridGroup);

    // Create a subtle stylish grid helper plane for tycoon feel
    const gridHelper = new THREE.GridHelper(
      Math.max(this.width, this.depth),
      Math.max(this.width, this.depth),
      0x0d9488,
      0x27364b
    );
    gridHelper.position.y = 0.002;
    this.gridGroup.add(gridHelper);

    // Load Floor Tile model once and instance/clone across the floor
    const assetMgr = AssetManager.getInstance();
    const floorModel = await assetMgr.loadModel('/assets/models/environment/floors/floor_tile.glb');

    const halfW = Math.floor(this.width / 2);
    const halfD = Math.floor(this.depth / 2);

    for (let x = -halfW; x < halfW; x++) {
      for (let z = -halfD; z < halfD; z++) {
        const tile = floorModel.clone();
        tile.position.set(x + 0.5, 0, z + 0.5);
        this.floorGroup.add(tile);
      }
    }
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

  public canOccupy(gridX: number, gridZ: number, width: number = 1, depth: number = 1): boolean {
    for (let x = 0; x < width; x++) {
      for (let z = 0; z < depth; z++) {
        const cell = this.getCell(gridX + x, gridZ + z);
        if (!cell || cell.occupied) {
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
          cell.occupied = occupied;
          cell.isWalkable = !occupied;
          cell.occupantId = occupied ? occupantId : undefined;
        }
      }
    }
  }

  public getRandomWalkableCell(): GridCell | null {
    const walkable: GridCell[] = [];
    this.cells.forEach((c) => {
      if (c.isWalkable && !c.occupied) walkable.push(c);
    });
    if (walkable.length === 0) return null;
    return walkable[Math.floor(Math.random() * walkable.length)];
  }

  /**
   * A* Pathfinding: Computes a collision-free waypoint path around all solid obstacles.
   */
  public findPath(
    startWorld: THREE.Vector3,
    targetWorld: THREE.Vector3,
    isBlockedFn?: (p1: THREE.Vector3, p2: THREE.Vector3) => boolean
  ): THREE.Vector3[] {
    let startGrid = this.worldToGrid(startWorld.x, startWorld.z);
    let targetGrid = this.worldToGrid(targetWorld.x, targetWorld.z);

    // If start cell is occupied, find nearest walkable neighbor
    const startCell = this.getCell(startGrid.x, startGrid.z);
    if (!startCell || !startCell.isWalkable) {
      const startCandidates: { x: number; z: number; dist: number }[] = [];
      for (let dx = -2; dx <= 2; dx++) {
        for (let dz = -2; dz <= 2; dz++) {
          if (dx === 0 && dz === 0) continue;
          const nx = startGrid.x + dx;
          const nz = startGrid.z + dz;
          const nc = this.getCell(nx, nz);
          if (nc && nc.isWalkable) {
            const wPos = this.gridToWorld(nx, nz);
            const dist = Math.hypot(wPos.x - startWorld.x, wPos.z - startWorld.z);
            startCandidates.push({ x: nx, z: nz, dist });
          }
        }
      }
      startCandidates.sort((a, b) => a.dist - b.dist);
      if (startCandidates.length > 0) {
        startGrid = { x: startCandidates[0].x, z: startCandidates[0].z };
      }
    }

    // If target cell is not walkable (e.g. inside desk/chair bounds), find closest walkable adjacent cell
    const targetCell = this.getCell(targetGrid.x, targetGrid.z);
    if (!targetCell || !targetCell.isWalkable) {
      const candidates: { x: number; z: number; dist: number }[] = [];
      for (let dx = -2; dx <= 2; dx++) {
        for (let dz = -2; dz <= 2; dz++) {
          if (dx === 0 && dz === 0) continue;
          const nx = targetGrid.x + dx;
          const nz = targetGrid.z + dz;
          const nc = this.getCell(nx, nz);
          if (nc && nc.isWalkable) {
            const wPos = this.gridToWorld(nx, nz);
            const dist = Math.hypot(wPos.x - targetWorld.x, wPos.z - targetWorld.z);
            candidates.push({ x: nx, z: nz, dist });
          }
        }
      }
      candidates.sort((a, b) => a.dist - b.dist);
      if (candidates.length > 0) {
        targetGrid = { x: candidates[0].x, z: candidates[0].z };
      }
    }

    // Direct Line of Sight shortcut: if no obstacles in between, return direct target!
    if (isBlockedFn && !isBlockedFn(startWorld, targetWorld)) {
      return [targetWorld.clone()];
    }

    interface PathNode {
      x: number;
      z: number;
      g: number;
      h: number;
      f: number;
      parent?: PathNode;
    }

    const openMap = new Map<string, PathNode>();
    const closedSet = new Set<string>();

    const startH = Math.hypot(targetGrid.x - startGrid.x, targetGrid.z - startGrid.z);
    const startNode: PathNode = {
      x: startGrid.x,
      z: startGrid.z,
      g: 0,
      h: startH,
      f: startH
    };
    openMap.set(this.getKey(startGrid.x, startGrid.z), startNode);

    let endNode: PathNode | undefined;

    const DIRS = [
      { x: 1, z: 0, cost: 1.0 },
      { x: -1, z: 0, cost: 1.0 },
      { x: 0, z: 1, cost: 1.0 },
      { x: 0, z: -1, cost: 1.0 },
      { x: 1, z: 1, cost: 1.414 },
      { x: 1, z: -1, cost: 1.414 },
      { x: -1, z: 1, cost: 1.414 },
      { x: -1, z: -1, cost: 1.414 }
    ];

    let iterations = 0;
    while (openMap.size > 0 && iterations < 500) {
      iterations++;

      // Find node with lowest f
      let current: PathNode | undefined;
      let currentKey: string = '';
      for (const [k, node] of openMap.entries()) {
        if (!current || node.f < current.f) {
          current = node;
          currentKey = k;
        }
      }

      if (!current) break;

      if (current.x === targetGrid.x && current.z === targetGrid.z) {
        endNode = current;
        break;
      }

      openMap.delete(currentKey);
      closedSet.add(currentKey);

      for (const d of DIRS) {
        const nx = current.x + d.x;
        const nz = current.z + d.z;
        const nKey = this.getKey(nx, nz);

        if (closedSet.has(nKey)) continue;

        const cell = this.getCell(nx, nz);
        if (!cell || !cell.isWalkable) continue;

        // Diagonal corner cutting prevention: check both orthogonal neighbors
        if (d.x !== 0 && d.z !== 0) {
          const c1 = this.getCell(current.x + d.x, current.z);
          const c2 = this.getCell(current.x, current.z + d.z);
          if (!c1 || !c1.isWalkable || !c2 || !c2.isWalkable) {
            continue;
          }
        }

        const tentativeG = current.g + d.cost;
        const existing = openMap.get(nKey);

        if (!existing || tentativeG < existing.g) {
          const h = Math.hypot(targetGrid.x - nx, targetGrid.z - nz);
          const neighborNode: PathNode = {
            x: nx,
            z: nz,
            g: tentativeG,
            h,
            f: tentativeG + h,
            parent: current
          };
          openMap.set(nKey, neighborNode);
        }
      }
    }

    if (!endNode) {
      // Fallback: direct line to target
      return [targetWorld.clone()];
    }

    // Reconstruct grid path
    const rawWaypoints: THREE.Vector3[] = [];
    let curr: PathNode | undefined = endNode;
    while (curr) {
      const wPos = this.gridToWorld(curr.x, curr.z);
      rawWaypoints.unshift(new THREE.Vector3(wPos.x, 0, wPos.z));
      curr = curr.parent;
    }

    // Path smoothing (string pulling): eliminate redundant waypoints with line-of-sight
    const smoothed: THREE.Vector3[] = [];
    if (rawWaypoints.length > 0) {
      smoothed.push(rawWaypoints[0]);
      let currentIdx = 0;

      while (currentIdx < rawWaypoints.length - 1) {
        let furthestClear = currentIdx + 1;
        for (let checkIdx = rawWaypoints.length - 1; checkIdx > currentIdx + 1; checkIdx--) {
          if (isBlockedFn && !isBlockedFn(rawWaypoints[currentIdx], rawWaypoints[checkIdx])) {
            furthestClear = checkIdx;
            break;
          }
        }
        smoothed.push(rawWaypoints[furthestClear]);
        currentIdx = furthestClear;
      }
    }

    // Ensure the final waypoint is the exact target destination
    if (smoothed.length > 0) {
      smoothed[smoothed.length - 1].copy(targetWorld);
    } else {
      smoothed.push(targetWorld.clone());
    }

    return smoothed;
  }
}

