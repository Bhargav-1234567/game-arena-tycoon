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
}

