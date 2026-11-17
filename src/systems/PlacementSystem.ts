import * as THREE from 'three';
import { GridSystem } from './GridSystem.ts';
import { EconomySystem } from './EconomySystem.ts';
import { AssetManager } from '../services/AssetManager.ts';
import { SoundManager } from '../services/SoundManager.ts';
import { ParticleSystem } from '../services/ParticleSystem.ts';
import { BuildableItem, BUILDABLE_ITEMS } from '../data/assets.ts';
import { GamingStation } from '../entities/GamingStation.ts';
import { ReceptionDesk } from '../entities/ReceptionDesk.ts';
import { FacilityEntity, FacilityType } from '../entities/FacilityEntity.ts';

export interface MovingItemContext {
  type: 'station' | 'reception' | 'facility' | 'object';
  station?: GamingStation;
  reception?: ReceptionDesk;
  facility?: FacilityEntity;
  object?: THREE.Object3D;
  item: BuildableItem;
  originalGridX: number;
  originalGridZ: number;
  originalRotationIndex: number;
}

export class PlacementSystem {
  private scene: THREE.Scene;
  public gridSystem: GridSystem;
  private economySystem: EconomySystem;
  public particleSystem?: ParticleSystem;
  
  public activeItem?: BuildableItem;
  public rotationIndex: number = 0; // 0, 1, 2, 3

  private ghostGroup: THREE.Group = new THREE.Group();
  private ghostModel?: THREE.Group;
  private ghostLoadToken: number = 0;
  private footprintGroup: THREE.Group = new THREE.Group();
  private footprintMesh?: THREE.Mesh;
  private footprintLines?: THREE.LineSegments;
  private isGhostValid: boolean = false;
  private currentGridPos: { x: number; z: number } = { x: 0, z: 0 };

  // Placed entities registry
  public stations: Map<string, GamingStation> = new Map();
  public facilities: Map<string, FacilityEntity> = new Map();
  public decorObjects: THREE.Group[] = [];
  public buildingObjects: THREE.Group[] = [];
  public receptionDesks: Map<string, ReceptionDesk> = new Map();
  public get receptionDesk(): ReceptionDesk | undefined {
    return this.receptionDesks.values().next().value;
  }
  public get receptionPosition(): THREE.Vector3 | undefined {
    const d = this.receptionDesk;
    return d ? d.group.position : undefined;
  }

  public onStationSelected?: (station: GamingStation | null) => void;
  public onReceptionSelected?: (desk: ReceptionDesk | null) => void;
  public onFacilitySelected?: (facility: FacilityEntity | null) => void;
  public onObjectSelected?: (object: THREE.Object3D | null) => void;
  public onReceptionPlaced?: (desk: ReceptionDesk) => void;
  public onReceptionMoved?: (desk: ReceptionDesk) => void;
  public onMoveModeChanged?: (inMoveMode: boolean) => void;

  public selectedStation: GamingStation | null = null;
  public selectedReception: ReceptionDesk | null = null;
  public selectedFacility: FacilityEntity | null = null;
  public selectedObject: THREE.Object3D | null = null;

  public isMovingItem: boolean = false;
  public movingItemContext?: MovingItemContext;

  constructor(scene: THREE.Scene, gridSystem: GridSystem, economySystem: EconomySystem) {
    this.scene = scene;
    this.gridSystem = gridSystem;
    this.economySystem = economySystem;

    // Semi-transparent 3D hologram ghost group
    this.ghostGroup.name = 'BuildGhostGroup';
    this.ghostGroup.visible = false;
    this.scene.add(this.ghostGroup);

    // Dynamic ground footprint tile highlight group
    this.footprintGroup.name = 'BuildFootprintGroup';
    this.footprintGroup.visible = false;
    this.scene.add(this.footprintGroup);
  }

  public getBuildingWallOffset(
    item: BuildableItem,
    rotationIndex: number
  ): { x: number; z: number } {
    const isWall =
      item.category === 'building' &&
      (item.id.startsWith('wall_') ||
        item.id.startsWith('door_') ||
        item.id.startsWith('barricade_') ||
        item.id.startsWith('border_')) &&
      !item.id.includes('corner') &&
      !item.id.includes('column') &&
      !item.id.startsWith('floor_') &&
      !item.id.startsWith('roof_');

    if (!isWall) {
      return { x: 0, z: 0 };
    }

    const offsetDist = 0.40;
    const rot = ((rotationIndex % 4) + 4) % 4;
    if (rot === 0) return { x: offsetDist, z: 0 };
    if (rot === 1) return { x: 0, z: offsetDist };
    if (rot === 2) return { x: -offsetDist, z: 0 };
    return { x: 0, z: -offsetDist };
  }

  public async setBuildItem(item?: BuildableItem) {
    if (!item) {
      if (this.isMovingItem) {
        this.cancelMove();
        return;
      }
      this.activeItem = undefined;
      this.ghostGroup.visible = false;
      this.footprintGroup.visible = false;
      this.clearGhostModel();
      return;
    }

    this.activeItem = item;
    this.rotationIndex = 0;
    this.ghostGroup.rotation.y = 0;

    this.deselectAll();

    if (item) {
      this.ghostGroup.visible = true;
      this.footprintGroup.visible = true;

      const w = this.rotationIndex % 2 === 0 ? item.width : item.height;
      const h = this.rotationIndex % 2 === 0 ? item.height : item.width;
      this.updateFootprintGeometry(w, h);
      const posX = this.currentGridPos.x + w * 0.5;
      const posZ = this.currentGridPos.z + h * 0.5;
      const wallOffset = this.getBuildingWallOffset(item, this.rotationIndex);
      this.ghostGroup.position.set(posX + wallOffset.x, 0, posZ + wallOffset.z);
      this.footprintGroup.position.set(posX, 0.015, posZ);

      await this.updateGhostModel();
      this.updateGhostValidity();
    } else {
      this.ghostGroup.visible = false;
      this.footprintGroup.visible = false;
      this.clearGhostModel();
    }
  }

  public rotate() {
    this.rotationIndex = (this.rotationIndex + 1) % 4;
    this.ghostGroup.rotation.y = this.rotationIndex * (Math.PI / 2);

    if (this.activeItem) {
      const w = this.rotationIndex % 2 === 0 ? this.activeItem.width : this.activeItem.height;
      const h = this.rotationIndex % 2 === 0 ? this.activeItem.height : this.activeItem.width;
      this.updateFootprintGeometry(w, h);
      const posX = this.currentGridPos.x + w * 0.5;
      const posZ = this.currentGridPos.z + h * 0.5;
      const wallOffset = this.getBuildingWallOffset(this.activeItem, this.rotationIndex);
      this.ghostGroup.position.set(posX + wallOffset.x, 0, posZ + wallOffset.z);
      this.footprintGroup.position.set(posX, 0.015, posZ);
    }

    this.updateGhostValidity();
  }

  public updateHover(worldPos: THREE.Vector3) {
    const grid = this.gridSystem.worldToGrid(worldPos.x, worldPos.z);
    this.currentGridPos = grid;

    if (this.activeItem) {
      const w = this.rotationIndex % 2 === 0 ? this.activeItem.width : this.activeItem.height;
      const h = this.rotationIndex % 2 === 0 ? this.activeItem.height : this.activeItem.width;
      const posX = grid.x + w * 0.5;
      const posZ = grid.z + h * 0.5;
      const wallOffset = this.getBuildingWallOffset(this.activeItem, this.rotationIndex);

      this.ghostGroup.position.set(posX + wallOffset.x, 0, posZ + wallOffset.z);
      this.footprintGroup.position.set(posX, 0.015, posZ);
    } else {
      const wPos = this.gridSystem.gridToWorld(grid.x, grid.z);
      this.ghostGroup.position.set(wPos.x, 0, wPos.z);
    }

    this.updateGhostValidity();
  }

  private updateGhostValidity() {
    if (!this.activeItem) return;

    const w = this.rotationIndex % 2 === 0 ? this.activeItem.width : this.activeItem.height;
    const h = this.rotationIndex % 2 === 0 ? this.activeItem.height : this.activeItem.width;

    const canPlace =
      this.gridSystem.canOccupy(this.currentGridPos.x, this.currentGridPos.z, w, h) &&
      (this.isMovingItem || this.economySystem.canAfford(this.activeItem.price));

    this.isGhostValid = canPlace;

    // 1. Update Floor Tile Footprint Colors
    if (this.footprintMesh) {
      const mat = this.footprintMesh.material as THREE.MeshBasicMaterial;
      mat.color.setHex(canPlace ? 0x10b981 : 0xef4444);
    }
    if (this.footprintLines) {
      const mat = this.footprintLines.material as THREE.LineBasicMaterial;
      mat.color.setHex(canPlace ? 0x34d399 : 0xf87171);
    }

    // 2. Update Hologram Preview Model Tint
    if (this.ghostModel) {
      const emissiveColor = canPlace ? 0x0d9488 : 0xef4444;
      const intensity = canPlace ? 0.35 : 0.65;
      this.ghostModel.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mat = (child as THREE.Mesh).material;
          if (mat) {
            const mats = Array.isArray(mat) ? mat : [mat];
            for (const m of mats) {
              if ((m as THREE.MeshStandardMaterial).emissive) {
                (m as THREE.MeshStandardMaterial).emissive.setHex(emissiveColor);
                (m as THREE.MeshStandardMaterial).emissiveIntensity = intensity;
              }
            }
          }
        }
      });
    }
  }

  private updateFootprintGeometry(w: number, h: number) {
    if (this.footprintMesh) {
      this.footprintGroup.remove(this.footprintMesh);
      this.footprintMesh.geometry.dispose();
      (this.footprintMesh.material as THREE.Material).dispose();
      this.footprintMesh = undefined;
    }
    if (this.footprintLines) {
      this.footprintGroup.remove(this.footprintLines);
      this.footprintLines.geometry.dispose();
      (this.footprintLines.material as THREE.Material).dispose();
      this.footprintLines = undefined;
    }

    // Ground semi-transparent floor highlight covering the exact w x h tiles
    const planeGeo = new THREE.PlaneGeometry(w, h);
    planeGeo.rotateX(-Math.PI / 2);
    const planeMat = new THREE.MeshBasicMaterial({
      color: 0x10b981,
      transparent: true,
      opacity: 0.38,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    this.footprintMesh = new THREE.Mesh(planeGeo, planeMat);
    this.footprintGroup.add(this.footprintMesh);

    // Grid tile lines (outer perimeter border + individual 1x1 tile borders)
    const linePositions: number[] = [];
    const halfW = w / 2;
    const halfH = h / 2;

    // Perimeter border
    linePositions.push(
      -halfW, 0.005, -halfH,   halfW, 0.005, -halfH,
       halfW, 0.005, -halfH,   halfW, 0.005,  halfH,
       halfW, 0.005,  halfH,  -halfW, 0.005,  halfH,
      -halfW, 0.005,  halfH,  -halfW, 0.005, -halfH
    );

    // Inner tile grid lines along X
    for (let i = 1; i < w; i++) {
      const x = -halfW + i;
      linePositions.push(x, 0.005, -halfH, x, 0.005, halfH);
    }
    // Inner tile grid lines along Z
    for (let j = 1; j < h; j++) {
      const z = -halfH + j;
      linePositions.push(-halfW, 0.005, z, halfW, 0.005, z);
    }

    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
    const lineMat = new THREE.LineBasicMaterial({
      color: 0x34d399,
      transparent: true,
      opacity: 0.85,
      linewidth: 2,
      depthWrite: false
    });
    this.footprintLines = new THREE.LineSegments(lineGeo, lineMat);
    this.footprintGroup.add(this.footprintLines);
  }

  private clearGhostModel() {
    if (this.ghostModel) {
      this.ghostGroup.remove(this.ghostModel);
      this.ghostModel.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          mesh.geometry?.dispose();
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach((m) => m.dispose());
          } else if (mesh.material) {
            mesh.material.dispose();
          }
        }
      });
      this.ghostModel = undefined;
    }
  }

  private async updateGhostModel() {
    const currentToken = ++this.ghostLoadToken;
    this.clearGhostModel();

    if (!this.activeItem) return;

    let model: THREE.Group | undefined;

    if (this.activeItem.category === 'station') {
      const station = new GamingStation('ghost_station', 0, 0, 0);
      await station.build();
      model = station.group;
    } else if (this.activeItem.id.startsWith('reception')) {
      const desk = new ReceptionDesk('ghost_reception', 0, 0, 0, 1);
      await desk.build();
      model = desk.group;
    } else if (
      this.activeItem.id.startsWith('sofa') ||
      this.activeItem.id.startsWith('vending') ||
      this.activeItem.id.startsWith('arcade')
    ) {
      const type: FacilityType = this.activeItem.id.startsWith('sofa')
        ? 'sofa'
        : this.activeItem.id.startsWith('vending')
        ? 'vending'
        : 'arcade';
      const facility = new FacilityEntity('ghost_facility', type, 0, 0, 0, 1);
      await facility.build();
      model = facility.group;
    } else {
      const assetMgr = AssetManager.getInstance();
      model = await assetMgr.loadModel(this.activeItem.modelPath);
    }

    if (currentToken !== this.ghostLoadToken || !this.activeItem || !model) {
      return;
    }

    // Hide selection highlight rings if any exist in the model
    model.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        if (mesh.geometry && mesh.geometry.type === 'RingGeometry') {
          mesh.visible = false;
        } else {
          mesh.castShadow = false;
          mesh.receiveShadow = false;
          if (Array.isArray(mesh.material)) {
            mesh.material = mesh.material.map((m) => this.toGhostMaterial(m));
          } else if (mesh.material) {
            mesh.material = this.toGhostMaterial(mesh.material);
          }
        }
      }
    });

    this.ghostModel = model;
    this.ghostGroup.add(model);
    this.updateGhostValidity();
  }

  private toGhostMaterial(orig: THREE.Material): THREE.Material {
    const mat = orig.clone() as THREE.MeshStandardMaterial;
    mat.transparent = true;
    mat.opacity = 0.60;
    mat.depthWrite = false;
    return mat;
  }

  public async tryPlace(): Promise<boolean> {
    if (!this.activeItem || !this.isGhostValid) return false;

    // Moving an already placed item is FREE and preserves its upgraded entity state
    if (this.isMovingItem && this.movingItemContext) {
      const ctx = this.movingItemContext;
      const w = this.rotationIndex % 2 === 0 ? ctx.item.width : ctx.item.height;
      const h = this.rotationIndex % 2 === 0 ? ctx.item.height : ctx.item.width;
      const posX = this.currentGridPos.x + w * 0.5;
      const posZ = this.currentGridPos.z + h * 0.5;

      if (ctx.type === 'station' && ctx.station) {
        ctx.station.gridX = this.currentGridPos.x;
        ctx.station.gridZ = this.currentGridPos.z;
        ctx.station.rotationIndex = this.rotationIndex;
        ctx.station.group.position.set(posX, 0, posZ);
        ctx.station.group.rotation.y = this.rotationIndex * (Math.PI / 2);
        ctx.station.group.visible = true;
        this.gridSystem.setOccupied(this.currentGridPos.x, this.currentGridPos.z, w, h, true, ctx.station.id);
      } else if (ctx.type === 'reception' && ctx.reception) {
        ctx.reception.gridX = this.currentGridPos.x;
        ctx.reception.gridZ = this.currentGridPos.z;
        ctx.reception.rotationIndex = this.rotationIndex;
        ctx.reception.group.position.set(posX, 0, posZ);
        ctx.reception.group.rotation.y = this.rotationIndex * (Math.PI / 2);
        ctx.reception.group.visible = true;
        this.gridSystem.setOccupied(this.currentGridPos.x, this.currentGridPos.z, w, h, true, ctx.reception.id);
        if (this.rotationIndex === 0) {
          this.gridSystem.setOccupied(this.currentGridPos.x, this.currentGridPos.z - 1, w, 1, true, `${ctx.reception.id}_staff_zone`);
        } else if (this.rotationIndex === 1) {
          this.gridSystem.setOccupied(this.currentGridPos.x - 1, this.currentGridPos.z, 1, h, true, `${ctx.reception.id}_staff_zone`);
        } else if (this.rotationIndex === 2) {
          this.gridSystem.setOccupied(this.currentGridPos.x, this.currentGridPos.z + h, w, 1, true, `${ctx.reception.id}_staff_zone`);
        } else {
          this.gridSystem.setOccupied(this.currentGridPos.x + w, this.currentGridPos.z, 1, h, true, `${ctx.reception.id}_staff_zone`);
        }
        if (this.onReceptionMoved) {
          this.onReceptionMoved(ctx.reception);
        }
      } else if (ctx.type === 'facility' && ctx.facility) {
        ctx.facility.gridX = this.currentGridPos.x;
        ctx.facility.gridZ = this.currentGridPos.z;
        ctx.facility.rotationIndex = this.rotationIndex;
        ctx.facility.group.position.set(posX, 0, posZ);
        ctx.facility.group.rotation.y = this.rotationIndex * (Math.PI / 2);
        ctx.facility.group.visible = true;
        this.gridSystem.setOccupied(this.currentGridPos.x, this.currentGridPos.z, w, h, true, ctx.facility.id);
      } else if (ctx.type === 'object' && ctx.object) {
        const wallOffset = ctx.item ? this.getBuildingWallOffset(ctx.item, this.rotationIndex) : { x: 0, z: 0 };
        ctx.object.position.set(posX + wallOffset.x, 0, posZ + wallOffset.z);
        ctx.object.rotation.y = this.rotationIndex * (Math.PI / 2);
        ctx.object.visible = true;
        if (ctx.object.userData) {
          ctx.object.userData.gridX = this.currentGridPos.x;
          ctx.object.userData.gridZ = this.currentGridPos.z;
          ctx.object.userData.rotationIndex = this.rotationIndex;
          if (!ctx.object.userData.isWalkable) {
            this.gridSystem.setOccupied(this.currentGridPos.x, this.currentGridPos.z, w, h, true, ctx.object.uuid);
          }
        }
      }

      SoundManager.getInstance().playPlacement();
      if (this.particleSystem) {
        this.particleSystem.spawnBurst(new THREE.Vector3(posX, 0.4, posZ), 0x0284c7, 25);
      }

      this.isMovingItem = false;
      this.movingItemContext = undefined;
      this.activeItem = undefined;
      this.clearGhostModel();
      this.ghostGroup.visible = false;
      this.footprintGroup.visible = false;
      this.onMoveModeChanged?.(false);
      return true;
    }

    if (!this.economySystem.spend(this.activeItem.price)) return false;

    const w = this.rotationIndex % 2 === 0 ? this.activeItem.width : this.activeItem.height;
    const h = this.rotationIndex % 2 === 0 ? this.activeItem.height : this.activeItem.width;
    const id = `item_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    const posX = this.currentGridPos.x + w * 0.5;
    const posZ = this.currentGridPos.z + h * 0.5;

    if (this.activeItem.category === 'station') {
      const station = new GamingStation(id, this.currentGridPos.x, this.currentGridPos.z, this.rotationIndex);
      await station.build();
      station.group.position.set(posX, 0, posZ);
      this.scene.add(station.group);
      this.stations.set(id, station);

      this.gridSystem.setOccupied(this.currentGridPos.x, this.currentGridPos.z, w, h, true, id);
    } else if (this.activeItem.id.startsWith('reception')) {
      const desk = new ReceptionDesk(id, this.currentGridPos.x, this.currentGridPos.z, this.rotationIndex, 1);
      await desk.build();
      desk.group.position.set(posX, 0, posZ);
      this.scene.add(desk.group);
      this.receptionDesks.set(id, desk);

      if (this.onReceptionPlaced) {
        this.onReceptionPlaced(desk);
      }

      this.gridSystem.setOccupied(this.currentGridPos.x, this.currentGridPos.z, w, h, true, id);
      // Staff-only barrier behind counter: prevents customers from routing behind the desk
      if (this.rotationIndex === 0) {
        this.gridSystem.setOccupied(this.currentGridPos.x, this.currentGridPos.z - 1, w, 1, true, `${id}_staff_zone`);
      } else if (this.rotationIndex === 1) {
        this.gridSystem.setOccupied(this.currentGridPos.x - 1, this.currentGridPos.z, 1, h, true, `${id}_staff_zone`);
      } else if (this.rotationIndex === 2) {
        this.gridSystem.setOccupied(this.currentGridPos.x, this.currentGridPos.z + h, w, 1, true, `${id}_staff_zone`);
      } else {
        this.gridSystem.setOccupied(this.currentGridPos.x + w, this.currentGridPos.z, 1, h, true, `${id}_staff_zone`);
      }
    } else if (
      this.activeItem.id.startsWith('sofa') ||
      this.activeItem.id.startsWith('vending') ||
      this.activeItem.id.startsWith('arcade')
    ) {
      const type: FacilityType = this.activeItem.id.startsWith('sofa')
        ? 'sofa'
        : this.activeItem.id.startsWith('vending')
        ? 'vending'
        : 'arcade';
      const facility = new FacilityEntity(
        id,
        type,
        this.currentGridPos.x,
        this.currentGridPos.z,
        this.rotationIndex,
        1
      );
      await facility.build();
      facility.group.position.set(posX, 0, posZ);
      this.scene.add(facility.group);
      this.facilities.set(id, facility);

      this.gridSystem.setOccupied(this.currentGridPos.x, this.currentGridPos.z, w, h, true, id);
    } else if (this.activeItem.category === 'building') {
      const assetMgr = AssetManager.getInstance();
      const model = await assetMgr.loadModel(this.activeItem.modelPath);
      const wallOffset = this.getBuildingWallOffset(this.activeItem, this.rotationIndex);
      model.position.set(posX + wallOffset.x, 0, posZ + wallOffset.z);
      model.rotation.y = this.rotationIndex * (Math.PI / 2);

      // Handle window glass transparency
      model.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (const m of mats) {
            if (m && m.name === 'glass') {
              m.transparent = true;
              m.opacity = 0.35;
              m.depthWrite = false;
            }
          }
        }
      });

      const isFloor = this.activeItem.id.startsWith('floor_');
      const isDoorway = this.activeItem.id.includes('doorway');
      const isWall =
        wallOffset.x !== 0 ||
        wallOffset.z !== 0 ||
        this.activeItem.id.startsWith('wall_') ||
        this.activeItem.id.startsWith('door_');

      const halfW = isWall ? (this.rotationIndex % 2 === 0 ? 0.15 : w * 0.48) : w * 0.48;
      const halfD = isWall ? (this.rotationIndex % 2 === 0 ? h * 0.48 : 0.15) : h * 0.48;

      model.userData = {
        isBuildingItem: true,
        item: this.activeItem,
        gridX: this.currentGridPos.x,
        gridZ: this.currentGridPos.z,
        rotationIndex: this.rotationIndex,
        isWalkable: isFloor || isDoorway,
        halfW,
        halfD
      };

      this.scene.add(model);
      this.buildingObjects.push(model);

      // Floors and open doorways don't block walking; solid walls/windows/columns do!
      if (!isFloor && !isDoorway) {
        this.gridSystem.setOccupied(this.currentGridPos.x, this.currentGridPos.z, w, h, true, id);
      }
    } else {
      const assetMgr = AssetManager.getInstance();
      const model = await assetMgr.loadModel(this.activeItem.modelPath);
      model.position.set(posX, 0, posZ);
      model.rotation.y = this.rotationIndex * (Math.PI / 2);

      model.userData = {
        isDecor: true,
        item: this.activeItem,
        gridX: this.currentGridPos.x,
        gridZ: this.currentGridPos.z,
        rotationIndex: this.rotationIndex
      };

      this.scene.add(model);
      this.decorObjects.push(model);

      this.gridSystem.setOccupied(this.currentGridPos.x, this.currentGridPos.z, w, h, true, id);
    }

    // Audio & Visual Placement Feedback
    SoundManager.getInstance().playPlacement();
    if (this.particleSystem) {
      this.particleSystem.spawnBurst(new THREE.Vector3(posX, 0.4, posZ), 0x0d9488, 25);
    }

    if (this.activeItem.reputationBonus) {
      this.economySystem.addReputation(this.activeItem.reputationBonus);
    }

    this.updateGhostValidity();
    return true;
  }

  public handleClickSelect(raycastHitObject: THREE.Object3D | null) {
    if (this.activeItem) return; // In build mode

    if (!raycastHitObject) {
      this.deselectAll();
      return;
    }

    // Traverse upwards to check what was clicked
    let current: THREE.Object3D | null = raycastHitObject;
    let foundStation: GamingStation | null = null;
    let foundReception: ReceptionDesk | null = null;
    let foundFacility: FacilityEntity | null = null;
    let foundObject: THREE.Object3D | null = null;

    while (current) {
      if (current.userData && current.userData.facility) {
        foundFacility = current.userData.facility;
        break;
      }
      if (current.name && current.name.startsWith('Station_')) {
        const id = current.name.replace('Station_', '');
        foundStation = this.stations.get(id) || null;
        break;
      }
      if (current.name && current.name.startsWith('ReceptionDesk_')) {
        const deskId = current.name.replace('ReceptionDesk_', '');
        foundReception = this.receptionDesks.get(deskId) || null;
        if (foundReception) break;
      }
      if (current.name && current.name.startsWith('Facility_')) {
        const facId = current.name.replace('Facility_', '');
        foundFacility = this.facilities.get(facId) || null;
        if (foundFacility) break;
      }
      if (current.userData && (current.userData.isDecor || current.userData.isBuildingItem)) {
        foundObject = current;
        break;
      }
      current = current.parent;
    }

    if (foundStation) {
      this.deselectAll();
      this.selectedStation = foundStation;
      foundStation.setSelected(true);

      if (this.onStationSelected) this.onStationSelected(foundStation);
    } else if (foundReception) {
      this.deselectAll();
      this.selectedReception = foundReception;
      foundReception.setSelected(true);

      if (this.onReceptionSelected) this.onReceptionSelected(foundReception);
    } else if (foundFacility) {
      this.deselectAll();
      this.selectedFacility = foundFacility;
      foundFacility.setSelected(true);

      if (this.onFacilitySelected) this.onFacilitySelected(foundFacility);
    } else if (foundObject) {
      this.deselectAll();
      this.selectedObject = foundObject;
      if (this.onObjectSelected) this.onObjectSelected(foundObject);
    } else {
      this.deselectAll();
    }
  }

  public deselectAll() {
    if (this.selectedStation) {
      this.selectedStation.setSelected(false);
      this.selectedStation = null;
      if (this.onStationSelected) this.onStationSelected(null);
    }
    if (this.selectedReception) {
      this.selectedReception.setSelected(false);
      this.selectedReception = null;
    }
    for (const desk of this.receptionDesks.values()) {
      desk.setSelected(false);
    }
    if (this.onReceptionSelected) this.onReceptionSelected(null);
    if (this.selectedFacility) {
      this.selectedFacility.setSelected(false);
      this.selectedFacility = null;
      if (this.onFacilitySelected) this.onFacilitySelected(null);
    }
    if (this.selectedObject) {
      this.selectedObject = null;
      if (this.onObjectSelected) this.onObjectSelected(null);
    }
  }

  public moveSelectedItem(): boolean {
    if (this.isMovingItem || this.activeItem) return false;

    if (this.selectedStation) {
      const station = this.selectedStation;
      this.startMoveStation(station);
      return true;
    }
    if (this.selectedReception) {
      const desk = this.selectedReception;
      this.startMoveReception(desk);
      return true;
    }
    if (this.selectedFacility) {
      const facility = this.selectedFacility;
      this.startMoveFacility(facility);
      return true;
    }
    if (this.selectedObject) {
      const obj = this.selectedObject;
      this.startMoveObject(obj);
      return true;
    }
    return false;
  }

  public async startMoveStation(station: GamingStation) {
    this.deselectAll();
    const item = BUILDABLE_ITEMS.find((i) => i.category === 'station') || {
      id: 'station_pc',
      name: 'Gaming Station',
      category: 'station',
      price: 0,
      width: 2,
      height: 2,
      modelPath: ''
    };

    const w = station.rotationIndex % 2 === 0 ? item.width : item.height;
    const h = station.rotationIndex % 2 === 0 ? item.height : item.width;

    // Free original grid occupancy
    this.gridSystem.setOccupied(station.gridX, station.gridZ, w, h, false);

    this.movingItemContext = {
      type: 'station',
      station,
      item: item as BuildableItem,
      originalGridX: station.gridX,
      originalGridZ: station.gridZ,
      originalRotationIndex: station.rotationIndex
    };
    this.isMovingItem = true;
    station.group.visible = false;

    this.activeItem = item as BuildableItem;
    this.rotationIndex = station.rotationIndex;
    this.ghostGroup.rotation.y = this.rotationIndex * (Math.PI / 2);

    const curW = this.rotationIndex % 2 === 0 ? item.width : item.height;
    const curH = this.rotationIndex % 2 === 0 ? item.height : item.width;
    this.updateFootprintGeometry(curW, curH);

    this.currentGridPos = { x: station.gridX, z: station.gridZ };
    const posX = station.gridX + curW * 0.5;
    const posZ = station.gridZ + curH * 0.5;
    this.ghostGroup.position.set(posX, 0, posZ);
    this.footprintGroup.position.set(posX, 0.015, posZ);

    await this.updateGhostModel();
    this.updateGhostValidity();
    this.ghostGroup.visible = true;
    this.footprintGroup.visible = true;
    this.onMoveModeChanged?.(true);
  }

  public async startMoveReception(desk: ReceptionDesk) {
    this.deselectAll();
    const item = BUILDABLE_ITEMS.find((i) => i.id.startsWith('reception')) || {
      id: 'reception_counter',
      name: 'Reception Desk',
      category: 'facility',
      price: 0,
      width: 4,
      height: 3,
      modelPath: desk.currentTier.model
    };

    const w = desk.rotationIndex % 2 === 0 ? item.width : item.height;
    const h = desk.rotationIndex % 2 === 0 ? item.height : item.width;

    // Free original grid occupancy + staff barrier
    this.gridSystem.setOccupied(desk.gridX, desk.gridZ, w, h, false);
    if (desk.rotationIndex === 0) {
      this.gridSystem.setOccupied(desk.gridX, desk.gridZ - 1, w, 1, false);
    } else if (desk.rotationIndex === 1) {
      this.gridSystem.setOccupied(desk.gridX - 1, desk.gridZ, 1, h, false);
    } else if (desk.rotationIndex === 2) {
      this.gridSystem.setOccupied(desk.gridX, desk.gridZ + h, w, 1, false);
    } else {
      this.gridSystem.setOccupied(desk.gridX + w, desk.gridZ, 1, h, false);
    }

    this.movingItemContext = {
      type: 'reception',
      reception: desk,
      item: item as BuildableItem,
      originalGridX: desk.gridX,
      originalGridZ: desk.gridZ,
      originalRotationIndex: desk.rotationIndex
    };
    this.isMovingItem = true;
    desk.group.visible = false;

    this.activeItem = item as BuildableItem;
    this.rotationIndex = desk.rotationIndex;
    this.ghostGroup.rotation.y = this.rotationIndex * (Math.PI / 2);

    const curW = this.rotationIndex % 2 === 0 ? item.width : item.height;
    const curH = this.rotationIndex % 2 === 0 ? item.height : item.width;
    this.updateFootprintGeometry(curW, curH);

    this.currentGridPos = { x: desk.gridX, z: desk.gridZ };
    const posX = desk.gridX + curW * 0.5;
    const posZ = desk.gridZ + curH * 0.5;
    this.ghostGroup.position.set(posX, 0, posZ);
    this.footprintGroup.position.set(posX, 0.015, posZ);

    await this.updateGhostModel();
    this.updateGhostValidity();
    this.ghostGroup.visible = true;
    this.footprintGroup.visible = true;
    this.onMoveModeChanged?.(true);
  }

  public async startMoveFacility(facility: FacilityEntity) {
    this.deselectAll();
    const item = BUILDABLE_ITEMS.find((i) => i.id.startsWith(facility.type)) || {
      id: facility.type,
      name: facility.type.toUpperCase(),
      category: 'facility',
      price: 0,
      width: facility.type === 'sofa' ? 3 : 1,
      height: facility.type === 'sofa' ? 2 : 1,
      modelPath: facility.currentTier.model
    };

    const w = facility.rotationIndex % 2 === 0 ? item.width : item.height;
    const h = facility.rotationIndex % 2 === 0 ? item.height : item.width;

    // Free original grid occupancy
    this.gridSystem.setOccupied(facility.gridX, facility.gridZ, w, h, false);

    this.movingItemContext = {
      type: 'facility',
      facility,
      item: item as BuildableItem,
      originalGridX: facility.gridX,
      originalGridZ: facility.gridZ,
      originalRotationIndex: facility.rotationIndex
    };
    this.isMovingItem = true;
    facility.group.visible = false;

    this.activeItem = item as BuildableItem;
    this.rotationIndex = facility.rotationIndex;
    this.ghostGroup.rotation.y = this.rotationIndex * (Math.PI / 2);

    const curW = this.rotationIndex % 2 === 0 ? item.width : item.height;
    const curH = this.rotationIndex % 2 === 0 ? item.height : item.width;
    this.updateFootprintGeometry(curW, curH);

    this.currentGridPos = { x: facility.gridX, z: facility.gridZ };
    const posX = facility.gridX + curW * 0.5;
    const posZ = facility.gridZ + curH * 0.5;
    this.ghostGroup.position.set(posX, 0, posZ);
    this.footprintGroup.position.set(posX, 0.015, posZ);

    await this.updateGhostModel();
    this.updateGhostValidity();
    this.ghostGroup.visible = true;
    this.footprintGroup.visible = true;
    this.onMoveModeChanged?.(true);
  }

  public async startMoveObject(obj: THREE.Object3D) {
    this.deselectAll();
    const item: BuildableItem = obj.userData?.item || {
      id: 'generic_decor',
      name: 'Decor Item',
      category: 'decor',
      price: 0,
      width: 1,
      height: 1,
      modelPath: ''
    };

    const origGridX = obj.userData?.gridX ?? Math.floor(obj.position.x);
    const origGridZ = obj.userData?.gridZ ?? Math.floor(obj.position.z);
    const origRot = obj.userData?.rotationIndex ?? Math.round(obj.rotation.y / (Math.PI / 2));

    const w = origRot % 2 === 0 ? item.width : item.height;
    const h = origRot % 2 === 0 ? item.height : item.width;

    if (!obj.userData?.isWalkable) {
      this.gridSystem.setOccupied(origGridX, origGridZ, w, h, false);
    }

    this.movingItemContext = {
      type: 'object',
      object: obj,
      item,
      originalGridX: origGridX,
      originalGridZ: origGridZ,
      originalRotationIndex: origRot
    };
    this.isMovingItem = true;
    obj.visible = false;

    this.activeItem = item;
    this.rotationIndex = origRot;
    this.ghostGroup.rotation.y = this.rotationIndex * (Math.PI / 2);

    const curW = this.rotationIndex % 2 === 0 ? item.width : item.height;
    const curH = this.rotationIndex % 2 === 0 ? item.height : item.width;
    this.updateFootprintGeometry(curW, curH);

    this.currentGridPos = { x: origGridX, z: origGridZ };
    const posX = origGridX + curW * 0.5;
    const posZ = origGridZ + curH * 0.5;
    const wallOffset = this.getBuildingWallOffset(item, this.rotationIndex);
    this.ghostGroup.position.set(posX + wallOffset.x, 0, posZ + wallOffset.z);
    this.footprintGroup.position.set(posX, 0.015, posZ);

    await this.updateGhostModel();
    this.updateGhostValidity();
    this.ghostGroup.visible = true;
    this.footprintGroup.visible = true;
    this.onMoveModeChanged?.(true);
  }

  public cancelMove() {
    if (!this.isMovingItem || !this.movingItemContext) return;
    const ctx = this.movingItemContext;
    const origW = ctx.originalRotationIndex % 2 === 0 ? ctx.item.width : ctx.item.height;
    const origH = ctx.originalRotationIndex % 2 === 0 ? ctx.item.height : ctx.item.width;

    if (ctx.type === 'station' && ctx.station) {
      ctx.station.group.visible = true;
      this.gridSystem.setOccupied(
        ctx.originalGridX,
        ctx.originalGridZ,
        origW,
        origH,
        true,
        ctx.station.id
      );
    } else if (ctx.type === 'reception' && ctx.reception) {
      ctx.reception.group.visible = true;
      this.gridSystem.setOccupied(
        ctx.originalGridX,
        ctx.originalGridZ,
        origW,
        origH,
        true,
        ctx.reception.id
      );
      if (ctx.originalRotationIndex === 0) {
        this.gridSystem.setOccupied(
          ctx.originalGridX,
          ctx.originalGridZ - 1,
          origW,
          1,
          true,
          `${ctx.reception.id}_staff_zone`
        );
      } else if (ctx.originalRotationIndex === 1) {
        this.gridSystem.setOccupied(
          ctx.originalGridX - 1,
          ctx.originalGridZ,
          1,
          origH,
          true,
          `${ctx.reception.id}_staff_zone`
        );
      } else if (ctx.originalRotationIndex === 2) {
        this.gridSystem.setOccupied(
          ctx.originalGridX,
          ctx.originalGridZ + origH,
          origW,
          1,
          true,
          `${ctx.reception.id}_staff_zone`
        );
      } else {
        this.gridSystem.setOccupied(
          ctx.originalGridX + origW,
          ctx.originalGridZ,
          1,
          origH,
          true,
          `${ctx.reception.id}_staff_zone`
        );
      }
    } else if (ctx.type === 'facility' && ctx.facility) {
      ctx.facility.group.visible = true;
      this.gridSystem.setOccupied(
        ctx.originalGridX,
        ctx.originalGridZ,
        origW,
        origH,
        true,
        ctx.facility.id
      );
    } else if (ctx.type === 'object' && ctx.object) {
      ctx.object.visible = true;
      if (!ctx.object.userData?.isWalkable) {
        this.gridSystem.setOccupied(
          ctx.originalGridX,
          ctx.originalGridZ,
          origW,
          origH,
          true,
          ctx.object.uuid
        );
      }
    }

    this.isMovingItem = false;
    this.movingItemContext = undefined;
    this.activeItem = undefined;
    this.clearGhostModel();
    this.ghostGroup.visible = false;
    this.footprintGroup.visible = false;
    this.onMoveModeChanged?.(false);
  }

  public getAvailableStation(): GamingStation | null {
    for (const station of this.stations.values()) {
      if (!station.isOccupied) {
        return station;
      }
    }
    return null;
  }
}

