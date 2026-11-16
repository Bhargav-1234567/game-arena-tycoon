import * as THREE from 'three';
import { GridSystem } from './GridSystem.ts';
import { EconomySystem } from './EconomySystem.ts';
import { AssetManager } from '../services/AssetManager.ts';
import { SoundManager } from '../services/SoundManager.ts';
import { ParticleSystem } from '../services/ParticleSystem.ts';
import { BuildableItem } from '../data/assets.ts';
import { GamingStation } from '../entities/GamingStation.ts';
import { ReceptionDesk } from '../entities/ReceptionDesk.ts';
import { FacilityEntity, FacilityType } from '../entities/FacilityEntity.ts';

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
  public receptionPosition?: THREE.Vector3;
  public receptionDesk?: ReceptionDesk;

  public onStationSelected?: (station: GamingStation | null) => void;
  public onReceptionSelected?: (desk: ReceptionDesk | null) => void;
  public onFacilitySelected?: (facility: FacilityEntity | null) => void;
  public onReceptionPlaced?: (pos: THREE.Vector3) => void;
  public selectedStation: GamingStation | null = null;
  public selectedFacility: FacilityEntity | null = null;

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

  public async setBuildItem(item?: BuildableItem) {
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
      this.footprintGroup.position.set(
        this.currentGridPos.x + w * 0.5,
        0.015,
        this.currentGridPos.z + h * 0.5
      );

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
      this.footprintGroup.position.set(
        this.currentGridPos.x + w * 0.5,
        0.015,
        this.currentGridPos.z + h * 0.5
      );
    }

    this.updateGhostValidity();
  }

  public updateHover(worldPos: THREE.Vector3) {
    const grid = this.gridSystem.worldToGrid(worldPos.x, worldPos.z);
    this.currentGridPos = grid;

    const wPos = this.gridSystem.gridToWorld(grid.x, grid.z);
    this.ghostGroup.position.set(wPos.x, 0, wPos.z);

    if (this.activeItem) {
      const w = this.rotationIndex % 2 === 0 ? this.activeItem.width : this.activeItem.height;
      const h = this.rotationIndex % 2 === 0 ? this.activeItem.height : this.activeItem.width;
      this.footprintGroup.position.set(
        grid.x + w * 0.5,
        0.015,
        grid.z + h * 0.5
      );
    }

    this.updateGhostValidity();
  }

  private updateGhostValidity() {
    if (!this.activeItem) return;

    const w = this.rotationIndex % 2 === 0 ? this.activeItem.width : this.activeItem.height;
    const h = this.rotationIndex % 2 === 0 ? this.activeItem.height : this.activeItem.width;

    const canPlace =
      this.gridSystem.canOccupy(this.currentGridPos.x, this.currentGridPos.z, w, h) &&
      this.economySystem.canAfford(this.activeItem.price);

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

    if (!this.economySystem.spend(this.activeItem.price)) return false;

    const w = this.rotationIndex % 2 === 0 ? this.activeItem.width : this.activeItem.height;
    const h = this.rotationIndex % 2 === 0 ? this.activeItem.height : this.activeItem.width;
    const id = `item_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    const wPos = this.gridSystem.gridToWorld(this.currentGridPos.x, this.currentGridPos.z);

    if (this.activeItem.category === 'station') {
      const station = new GamingStation(id, this.currentGridPos.x, this.currentGridPos.z, this.rotationIndex);
      await station.build();
      station.group.position.set(wPos.x, 0, wPos.z);
      this.scene.add(station.group);
      this.stations.set(id, station);

      this.gridSystem.setOccupied(this.currentGridPos.x, this.currentGridPos.z, w, h, true, id);
    } else if (this.activeItem.id.startsWith('reception')) {
      if (this.receptionDesk) {
        this.scene.remove(this.receptionDesk.group);
      }
      const desk = new ReceptionDesk(id, this.currentGridPos.x, this.currentGridPos.z, this.rotationIndex, 1);
      await desk.build();
      desk.group.position.set(wPos.x, 0, wPos.z);
      this.scene.add(desk.group);
      this.receptionDesk = desk;
      this.receptionPosition = desk.group.position;

      if (this.onReceptionPlaced) {
        this.onReceptionPlaced(desk.getStaffPosition());
      }

      this.gridSystem.setOccupied(this.currentGridPos.x, this.currentGridPos.z, w, h, true, id);
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
      facility.group.position.set(wPos.x, 0, wPos.z);
      this.scene.add(facility.group);
      this.facilities.set(id, facility);

      this.gridSystem.setOccupied(this.currentGridPos.x, this.currentGridPos.z, w, h, true, id);
    } else {
      const assetMgr = AssetManager.getInstance();
      const model = await assetMgr.loadModel(this.activeItem.modelPath);
      model.position.set(wPos.x, 0, wPos.z);
      model.rotation.y = this.rotationIndex * (Math.PI / 2);
      this.scene.add(model);
      this.decorObjects.push(model);

      this.gridSystem.setOccupied(this.currentGridPos.x, this.currentGridPos.z, w, h, true, id);
    }

    // Audio & Visual Placement Feedback
    SoundManager.getInstance().playPlacement();
    if (this.particleSystem) {
      this.particleSystem.spawnBurst(new THREE.Vector3(wPos.x, 0.4, wPos.z), 0x0d9488, 25);
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
      if (this.receptionDesk && (current === this.receptionDesk.group || (current.name && current.name.startsWith('ReceptionDesk_')))) {
        foundReception = this.receptionDesk;
        break;
      }
      if (current.name && current.name.startsWith('Facility_')) {
        const facId = current.name.replace('Facility_', '');
        foundFacility = this.facilities.get(facId) || null;
        if (foundFacility) break;
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
      foundReception.setSelected(true);

      if (this.onReceptionSelected) this.onReceptionSelected(foundReception);
    } else if (foundFacility) {
      this.deselectAll();
      this.selectedFacility = foundFacility;
      foundFacility.setSelected(true);

      if (this.onFacilitySelected) this.onFacilitySelected(foundFacility);
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
    if (this.receptionDesk) {
      this.receptionDesk.setSelected(false);
      if (this.onReceptionSelected) this.onReceptionSelected(null);
    }
    if (this.selectedFacility) {
      this.selectedFacility.setSelected(false);
      this.selectedFacility = null;
      if (this.onFacilitySelected) this.onFacilitySelected(null);
    }
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

