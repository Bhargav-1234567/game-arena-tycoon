import * as THREE from 'three';
import { GridSystem } from './GridSystem.ts';
import { EconomySystem } from './EconomySystem.ts';
import { AssetManager } from '../services/AssetManager.ts';
import { SoundManager } from '../services/SoundManager.ts';
import { ParticleSystem } from '../services/ParticleSystem.ts';
import { BuildableItem } from '../data/assets.ts';
import { GamingStation } from '../entities/GamingStation.ts';
import { ReceptionDesk } from '../entities/ReceptionDesk.ts';

export class PlacementSystem {
  private scene: THREE.Scene;
  private gridSystem: GridSystem;
  private economySystem: EconomySystem;
  public particleSystem?: ParticleSystem;
  
  public activeItem?: BuildableItem;
  public rotationIndex: number = 0; // 0, 1, 2, 3

  private ghostGroup: THREE.Group = new THREE.Group();
  private ghostBox: THREE.Mesh;
  private isGhostValid: boolean = false;
  private currentGridPos: { x: number; z: number } = { x: 0, z: 0 };

  // Placed entities registry
  public stations: Map<string, GamingStation> = new Map();
  public facilities: THREE.Group[] = [];
  public receptionPosition?: THREE.Vector3;
  public receptionDesk?: ReceptionDesk;

  public onStationSelected?: (station: GamingStation | null) => void;
  public onReceptionSelected?: (desk: ReceptionDesk | null) => void;
  public onReceptionPlaced?: (pos: THREE.Vector3) => void;
  public selectedStation: GamingStation | null = null;

  constructor(scene: THREE.Scene, gridSystem: GridSystem, economySystem: EconomySystem) {
    this.scene = scene;
    this.gridSystem = gridSystem;
    this.economySystem = economySystem;

    // Build Ghost indicator
    const geo = new THREE.BoxGeometry(1, 0.1, 1);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x0d9488,
      transparent: true,
      opacity: 0.5
    });
    this.ghostBox = new THREE.Mesh(geo, mat);
    this.ghostGroup.add(this.ghostBox);
    this.ghostGroup.visible = false;
    this.scene.add(this.ghostGroup);
  }

  public setBuildItem(item?: BuildableItem) {
    this.activeItem = item;
    this.rotationIndex = 0;

    if (this.selectedStation) {
      this.selectedStation.setSelected(false);
      this.selectedStation = null;
      if (this.onStationSelected) this.onStationSelected(null);
    }

    if (item) {
      this.ghostGroup.visible = true;
      const w = this.rotationIndex % 2 === 0 ? item.width : item.height;
      const h = this.rotationIndex % 2 === 0 ? item.height : item.width;
      this.ghostBox.scale.set(w, 1, h);
      this.ghostBox.position.set((w - 1) * 0.5, 0.05, (h - 1) * 0.5);
    } else {
      this.ghostGroup.visible = false;
    }
  }

  public rotate() {
    this.rotationIndex = (this.rotationIndex + 1) % 4;
    this.ghostGroup.rotation.y = this.rotationIndex * (Math.PI / 2);
    if (this.activeItem) {
      const w = this.rotationIndex % 2 === 0 ? this.activeItem.width : this.activeItem.height;
      const h = this.rotationIndex % 2 === 0 ? this.activeItem.height : this.activeItem.width;
      this.ghostBox.scale.set(w, 1, h);
    }
    this.updateGhostValidity();
  }

  public updateHover(worldPos: THREE.Vector3) {
    const grid = this.gridSystem.worldToGrid(worldPos.x, worldPos.z);
    this.currentGridPos = grid;

    const wPos = this.gridSystem.gridToWorld(grid.x, grid.z);
    this.ghostGroup.position.set(wPos.x, 0, wPos.z);

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
    const mat = this.ghostBox.material as THREE.MeshBasicMaterial;
    mat.color.setHex(canPlace ? 0x0d9488 : 0xef4444);
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
    } else {
      const assetMgr = AssetManager.getInstance();
      const model = await assetMgr.loadModel(this.activeItem.modelPath);
      model.position.set(wPos.x, 0, wPos.z);
      model.rotation.y = this.rotationIndex * (Math.PI / 2);
      this.scene.add(model);
      this.facilities.push(model);

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

    while (current) {
      if (current.name && current.name.startsWith('Station_')) {
        const id = current.name.replace('Station_', '');
        foundStation = this.stations.get(id) || null;
        break;
      }
      if (this.receptionDesk && (current === this.receptionDesk.group || (current.name && current.name.startsWith('ReceptionDesk_')))) {
        foundReception = this.receptionDesk;
        break;
      }
      current = current.parent;
    }

    if (foundStation) {
      if (this.receptionDesk) this.receptionDesk.setSelected(false);
      if (this.selectedStation && this.selectedStation !== foundStation) {
        this.selectedStation.setSelected(false);
      }
      this.selectedStation = foundStation;
      foundStation.setSelected(true);

      if (this.onReceptionSelected) this.onReceptionSelected(null);
      if (this.onStationSelected) this.onStationSelected(foundStation);
    } else if (foundReception) {
      if (this.selectedStation) {
        this.selectedStation.setSelected(false);
        this.selectedStation = null;
      }
      foundReception.setSelected(true);

      if (this.onStationSelected) this.onStationSelected(null);
      if (this.onReceptionSelected) this.onReceptionSelected(foundReception);
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

