import * as THREE from 'three';
import { GridSystem } from './GridSystem.ts';
import { EconomySystem } from './EconomySystem.ts';
import { AssetManager } from '../services/AssetManager.ts';
import { SoundManager } from '../services/SoundManager.ts';
import { ParticleSystem } from '../services/ParticleSystem.ts';
import { type BuildableItem, BUILDABLE_ITEMS } from '../data/assets.ts';
import { GamingStation } from '../entities/GamingStation.ts';
import { ReceptionDesk } from '../entities/ReceptionDesk.ts';
import { FacilityEntity, type FacilityType } from '../entities/FacilityEntity.ts';
import type { GameSaveState } from '../services/SaveManager.ts';
import { CollisionSystem } from './CollisionSystem.ts';
import { circleOverlaps, geometryFor, overlaps, wallOffset } from './LayoutGeometry.ts';
import type { PlacementGeometry } from './LayoutGeometry.ts';
import { CUSTOMER_RADIUS, NAVIGATION_RADIUS } from '../data/simulation.ts';
import { NAVIGATION } from '../data/world-layout.ts';

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
  public collisionSystem: CollisionSystem;
  public layoutRevision = 0;
  public validationMessage = '';
  public onValidationChanged?: (message: string) => void;
  public getCustomerBodies: () => { x: number; z: number; stationId?: string }[] = () => [];
  public getTechnicianMultiplier: () => number = () => 1;
  public busy = false;
  private scene: THREE.Scene;
  public gridSystem: GridSystem;
  private economySystem: EconomySystem;
  public particleSystem?: ParticleSystem;
  
  public activeItem?: BuildableItem;
  public rotationIndex: number = 0; // 0, 1, 2, 3

  private ghostGroup: THREE.Group = new THREE.Group();
  private ghostModel?: THREE.Group;
  private ghostLoadToken: number = 0;
  private previewError = '';
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
    this.collisionSystem = new CollisionSystem(this);

    // Semi-transparent 3D hologram ghost group
    this.ghostGroup.name = 'BuildGhostGroup';
    this.ghostGroup.visible = false;
    this.scene.add(this.ghostGroup);

    // Dynamic ground footprint tile highlight group
    this.footprintGroup.name = 'BuildFootprintGroup';
    this.footprintGroup.visible = false;
    this.scene.add(this.footprintGroup);
  }

  public getPlacedGeometries(): PlacementGeometry[] {
    const result: PlacementGeometry[] = [], stationItem = BUILDABLE_ITEMS.find((item) => item.category === 'station')!;
    for (const station of this.stations.values()) if (station.group.visible) result.push(geometryFor(stationItem, station.gridX, station.gridZ, station.rotationIndex, station.id, station.currentChair.level, station.currentDesk.level));
    for (const desk of this.receptionDesks.values()) if (desk.group.visible) result.push(geometryFor(BUILDABLE_ITEMS.find((item) => item.id.startsWith('reception'))!, desk.gridX, desk.gridZ, desk.rotationIndex, desk.id));
    for (const facility of this.facilities.values()) if (facility.group.visible) result.push(geometryFor(BUILDABLE_ITEMS.find((item) => item.id.startsWith(facility.type))!, facility.gridX, facility.gridZ, facility.rotationIndex, facility.id, undefined, undefined, facility.currentTier.level));
    for (const object of [...this.decorObjects, ...this.buildingObjects]) {
      if (!object.visible) continue;
      const data = object.userData, id = data.persistentId ?? object.uuid;
      if (data.item) result.push(geometryFor(data.item, data.gridX, data.gridZ, data.rotationIndex ?? 0, id));
      else if (!data.isWalkable) {
        const box = { minX: object.position.x - (data.halfW ?? .5), maxX: object.position.x + (data.halfW ?? .5),
          minZ: object.position.z - (data.halfD ?? .5), maxZ: object.position.z + (data.halfD ?? .5) };
        result.push({ id, item: BUILDABLE_ITEMS.find((item) => item.id === 'plant_indoor')!, reserved: box, center: object.position,
          solids: [{ ...box, id, type: 'wall' }], access: [] });
      }
    }
    return result;
  }

  private movingId(): string | undefined {
    const ctx = this.movingItemContext;
    return ctx?.station?.id ?? ctx?.reception?.id ?? ctx?.facility?.id ?? ctx?.object?.userData.persistentId ?? ctx?.object?.uuid;
  }

  private candidate(): PlacementGeometry | undefined {
    if (!this.activeItem) return;
    const station = this.movingItemContext?.station;
    return geometryFor(this.activeItem, this.currentGridPos.x, this.currentGridPos.z, this.rotationIndex,
      this.movingId() ?? 'candidate', station?.currentChair.level, station?.currentDesk.level, this.movingItemContext?.facility?.currentTier.level);
  }

  private reserve(item: BuildableItem, x: number, z: number, rotation: number, id: string): void {
    if (item.category === 'building' && (item.id.startsWith('floor_') || item.id.includes('doorway'))) return;
    const box = geometryFor(item, x, z, rotation).reserved;
    this.gridSystem.setOccupied(box.minX, box.minZ, box.maxX - box.minX, box.maxZ - box.minZ, true, id);
  }

  public routeTo(point: { x: number; z: number }, geometry = this.getPlacedGeometries()): THREE.Vector3[] {
    const query = this.collisionSystem.createNavigationQuery(NAVIGATION_RADIUS, undefined, geometry.flatMap((entry) => entry.solids));
    return this.gridSystem.findPath(new THREE.Vector3(NAVIGATION.doorX, 0, NAVIGATION.insideZ), new THREE.Vector3(point.x, 0, point.z), query);
  }

  public validateGeometry(candidate: PlacementGeometry): string {
    const bounds = this.gridSystem.unlockedBounds, area = candidate.reserved;
    if (area.minX < bounds.minX || area.maxX > bounds.maxX || area.minZ < bounds.minZ || area.maxZ > bounds.maxZ ||
      candidate.solids.some((box) => box.minX < bounds.minX - .001 || box.maxX > bounds.maxX + .001 || box.minZ < bounds.minZ - .001 || box.maxZ > bounds.maxZ + .001)) return 'Keep the furniture and its chair/staff space inside the room.';
    if (!candidate.solids.length) return '';
    if (!this.gridSystem.canOccupy(area.minX, area.minZ, area.maxX - area.minX, area.maxZ - area.minZ, candidate.id)) return 'This space is reserved by furniture, a chair approach or reception staff.';
    if (overlaps(area, { minX: -1.1, maxX: 1.1, minZ: 6.65, maxZ: NAVIGATION.doorZ + .2 })) return 'Keep the entrance clear for arriving and departing customers.';
    const existing = this.getPlacedGeometries().filter((entry) => entry.id !== candidate.id);
    if (existing.some((entry) => entry.solids.length && overlaps(area, entry.reserved))) return 'Leave the highlighted chair and staff access areas clear.';
    if (candidate.solids.some((box) => existing.some((entry) => entry.solids.some((other) => overlaps(box, other))))) return 'Furniture bodies cannot overlap.';
    if (this.getCustomerBodies().some((person) => person.stationId !== candidate.id && candidate.solids.some((box) => circleOverlaps(person, CUSTOMER_RADIUS, box)))) return 'A customer is in the way. Wait for them to pass.';
    const proposed = [...existing, candidate];
    if (candidate.entryPoints) {
      const query = this.collisionSystem.createNavigationQuery(NAVIGATION_RADIUS, undefined,
        proposed.flatMap((entry) => entry.solids).filter((box) => box.id !== `${candidate.id}_chair`));
      if (!candidate.entryPoints.some((point) => !query(new THREE.Vector3(point.x, 0, point.z), new THREE.Vector3(point.x, 0, point.z)))) return 'Keep one side of the chair clear for sitting and standing.';
    }
    if (candidate.access.some((point) => !this.routeTo(point, proposed).length)) return 'Leave a clear route to the chair, service point or reception queue.';
    if (candidate.seat && existing.some((entry) => entry.solids.some((box) => circleOverlaps(candidate.seat!, CUSTOMER_RADIUS, box)))) return 'Another object blocks this chair.';
    for (const entry of existing) for (const point of entry.access) {
      if (this.routeTo(point, existing).length && !this.routeTo(point, proposed).length) return 'This would block access to an existing chair, service point or reception queue.';
    }
    for (const person of this.getCustomerBodies()) {
      if (this.routeTo(person, existing).length && !this.routeTo(person, proposed).length) return 'This would trap a customer. Keep a route to the exit open.';
    }
    return '';
  }

  public refreshLayout(): void {
    this.layoutRevision++;
    const entries = this.getPlacedGeometries();
    for (const station of this.stations.values()) {
      const entry = entries.find((item) => item.id === station.id);
      station.accessIssue = !entry ? 'Being moved' : entry.seat && entries.some((other) => other.id !== entry.id && other.solids.some((box) => circleOverlaps(entry.seat!, CUSTOMER_RADIUS, box)))
        ? 'Chair blocked by furniture' : station.getEntryWorldPositions().every((point) => this.collisionSystem.isPointBlocked(point.x, point.z, NAVIGATION_RADIUS, station.id))
          ? 'Chair entry sides are blocked' : !this.routeTo(entry.access[0], entries).length ? 'No clear route to chair' : '';
    }
    const blocked = [...this.stations.values()].filter((station) => station.group.visible && station.accessIssue).length;
    this.onValidationChanged?.(blocked ? `${blocked} PC${blocked === 1 ? ' has' : 's have'} blocked chair access. Move nearby furniture to clear a route.` : '');
  }

  private registerFacility(facility: FacilityEntity, item: BuildableItem): void {
    facility.validateUpgrade = (tier) => {
      const error = this.validateGeometry(geometryFor(item, facility.gridX, facility.gridZ, facility.rotationIndex,
        facility.id, undefined, undefined, tier.level));
      if (error) throw new Error(error);
    };
    facility.onLayoutChanged = () => this.refreshLayout();
    this.facilities.set(facility.id, facility);
  }

  private configureStation(station: GamingStation): void {
    station.getTechnicianMultiplier = () => this.getTechnicianMultiplier();
    station.validateLayoutChange = (chairLevel, deskLevel) => {
      if (station.isOccupied) throw new Error('Wait for this customer to leave before changing the desk or chair.');
      const error = this.validateGeometry(geometryFor(BUILDABLE_ITEMS.find((item) => item.category === 'station')!, station.gridX, station.gridZ, station.rotationIndex, station.id, chairLevel, deskLevel));
      if (error) throw new Error(error);
    };
    station.onLayoutChanged = () => this.refreshLayout();
  }

  public getBuildingWallOffset(
    item: BuildableItem,
    rotationIndex: number
  ): { x: number; z: number } {
    return wallOffset(item, rotationIndex);

  }

  public async setBuildItem(item?: BuildableItem) {
    if (this.busy) return;
    if (!item) {
      if (this.isMovingItem) {
        this.cancelMove();
        return;
      }
      this.activeItem = undefined;
      this.validationMessage = '';
      this.previewError = '';
      this.ghostGroup.visible = false;
      this.footprintGroup.visible = false;
      this.clearGhostModel();
      this.refreshLayout();
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
    if (this.busy) return;
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
    if (this.busy) return;
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

    const candidate = this.candidate()!;
    const area = candidate.reserved;
    const width = area.maxX - area.minX, depth = area.maxZ - area.minZ;
    const previous = this.footprintGroup.userData.size;
    if (previous !== `${width}:${depth}`) {
      this.updateFootprintGeometry(width, depth);
      this.footprintGroup.userData.size = `${width}:${depth}`;
    }
    this.footprintGroup.position.set((area.minX + area.maxX) / 2, .015, (area.minZ + area.maxZ) / 2);
    this.validationMessage = this.previewError || this.validateGeometry(candidate) ||
      (!this.isMovingItem && !this.economySystem.canAfford(this.activeItem.price) ? 'Not enough cash.' : '');
    this.onValidationChanged?.(this.validationMessage);
    const canPlace = !this.validationMessage;

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
    this.previewError = '';
    this.clearGhostModel();

    if (!this.activeItem) return;

    let model: THREE.Group | undefined;

    try {
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
        const facility = new FacilityEntity('ghost_facility', type, 0, 0, 0, this.movingItemContext?.facility?.currentTier.level);
        await facility.build();
        model = facility.group;
      } else {
        const assetMgr = AssetManager.getInstance();
        model = await assetMgr.loadModel(this.activeItem.modelPath);
      }
    } catch (error) {
      if (currentToken === this.ghostLoadToken && this.activeItem) {
        this.validationMessage = error instanceof Error ? error.message : 'The preview could not be loaded. Please try again.';
        this.previewError = this.validationMessage;
        this.onValidationChanged?.(this.validationMessage);
      }
      return;
    }

    if (currentToken !== this.ghostLoadToken || !this.activeItem || !model) {
      return;
    }

    // Hide selection highlight rings if any exist in the model
    model.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        // Preview cleanup must never dispose geometry shared with real furniture or the model cache.
        mesh.geometry = mesh.geometry.clone();
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
    if (this.busy) return false;
    this.busy = true;
    try { return await this.placeCurrent(); }
    catch (error) {
      this.validationMessage = error instanceof Error ? error.message : 'The model could not be loaded. Please try again.';
      this.onValidationChanged?.(this.validationMessage);
      return false;
    }
    finally { this.busy = false; }
  }

  private async placeCurrent(): Promise<boolean> {
    this.updateGhostValidity();
    if (!this.activeItem || !this.isGhostValid) return false;
    const item = this.activeItem, x = this.currentGridPos.x, z = this.currentGridPos.z, rotation = this.rotationIndex;
    const geometry = this.candidate()!;
    const { center } = geometry;
    const ctx = this.movingItemContext;
    if (ctx) {
      const entity = ctx.station ?? ctx.reception ?? ctx.facility;
      const group = entity?.group ?? ctx.object!;
      if (entity) { entity.gridX = x; entity.gridZ = z; entity.rotationIndex = rotation; }
      else {
        Object.assign(group.userData, { gridX: x, gridZ: z, rotationIndex: rotation });
        const box = geometry.solids[0];
        if (box) Object.assign(group.userData, { halfW: (box.maxX - box.minX) / 2, halfD: (box.maxZ - box.minZ) / 2 });
      }
      const offset = ctx.object ? wallOffset(item, rotation) : { x: 0, z: 0 };
      group.position.set(center.x + offset.x, 0, center.z + offset.z);
      group.rotation.y = rotation * Math.PI / 2;
      group.visible = true;
      this.reserve(item, x, z, rotation, this.movingId()!);
      this.isMovingItem = false;
      this.movingItemContext = undefined;
      this.activeItem = undefined;
      this.clearGhostModel();
      this.ghostGroup.visible = this.footprintGroup.visible = false;
      this.refreshLayout();
      if (ctx.reception) this.onReceptionMoved?.(ctx.reception);
      this.onMoveModeChanged?.(false);
    } else {
      const id = `item_${crypto.randomUUID()}`;
      let group: THREE.Group;
      let station: GamingStation | undefined, desk: ReceptionDesk | undefined, facility: FacilityEntity | undefined;
      if (item.category === 'station') {
        station = new GamingStation(id, x, z, rotation);
        await station.build();
        group = station.group;
      } else if (item.id.startsWith('reception')) {
        desk = new ReceptionDesk(id, x, z, rotation);
        await desk.build(); group = desk.group;
      } else if (['sofa', 'vending', 'arcade'].some((type) => item.id.startsWith(type))) {
        const type = ['sofa', 'vending', 'arcade'].find((type) => item.id.startsWith(type)) as FacilityType;
        facility = new FacilityEntity(id, type, x, z, rotation);
        await facility.build(); group = facility.group;
      } else {
        group = await AssetManager.getInstance().loadRequiredModel(item.modelPath);
        const building = item.category === 'building';
        const box = geometry.solids[0];
        Object.assign(group.userData, { item, persistentId: id, gridX: x, gridZ: z, rotationIndex: rotation,
          isBuildingItem: building, isDecor: !building, isWalkable: !geometry.solids.length,
          halfW: box ? (box.maxX - box.minX) / 2 : 0, halfD: box ? (box.maxZ - box.minZ) / 2 : 0 });
        if (building) group.traverse((child) => {
          if (!(child as THREE.Mesh).isMesh) return;
          const material = (child as THREE.Mesh).material;
          for (const mat of Array.isArray(material) ? material : [material]) if (mat.name === 'glass') {
            mat.transparent = true; mat.opacity = .35; mat.depthWrite = false;
          }
        });
      }
      // Cash and entity become visible in the same synchronous commit after loading.
      const error = this.validateGeometry(geometry);
      if (error || !this.economySystem.spend(item.price)) {
        this.validationMessage = error || 'Not enough cash.';
        this.onValidationChanged?.(this.validationMessage);
        return false;
      }
      const offset = !station && !desk && !facility ? wallOffset(item, rotation) : { x: 0, z: 0 };
      group.position.set(center.x + offset.x, 0, center.z + offset.z);
      group.rotation.y = rotation * Math.PI / 2;
      this.scene.add(group);
      if (station) { this.configureStation(station); this.stations.set(id, station); }
      else if (desk) this.receptionDesks.set(id, desk);
      else if (facility) this.registerFacility(facility, item);
      else (item.category === 'building' ? this.buildingObjects : this.decorObjects).push(group);
      this.reserve(item, x, z, rotation, id);
      if (item.reputationBonus) this.economySystem.addReputation(item.reputationBonus);
      this.refreshLayout();
      if (desk) this.onReceptionPlaced?.(desk);
      this.updateGhostValidity();
    }
    SoundManager.getInstance().playPlacement();
    this.particleSystem?.spawnBurst(new THREE.Vector3(center.x, .4, center.z), 0x0d9488, 25);
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

  public getPickTargets(): THREE.Object3D[] {
    return [...this.stations.values()].map((station) => station.group)
      .concat([...this.receptionDesks.values()].map((desk) => desk.group),
        [...this.facilities.values()].map((facility) => facility.group), this.decorObjects, this.buildingObjects)
      .filter((group) => group.visible);
  }

  /** Recreate persistent entities directly: restoring never spends cash or grants bonuses. */
  public async restore(saved: GameSaveState): Promise<void> {
    const place = (group: THREE.Group, entry: { id: string; gridX: number; gridZ: number; rotationIndex: number }, item: BuildableItem, block = true) => {
      const w = entry.rotationIndex % 2 === 0 ? item.width : item.height;
      const h = entry.rotationIndex % 2 === 0 ? item.height : item.width;
      group.position.set(entry.gridX + w / 2, 0, entry.gridZ + h / 2);
      group.rotation.y = entry.rotationIndex * Math.PI / 2;
      this.scene.add(group);
      if (block) this.reserve(item, entry.gridX, entry.gridZ, entry.rotationIndex, entry.id);
      return { w, h };
    };
    const stationItem = BUILDABLE_ITEMS.find((item) => item.id === 'station_bundle')!;
    for (const entry of saved.stations) {
      const station = new GamingStation(entry.id, entry.gridX, entry.gridZ, entry.rotationIndex);
      await station.loadTiers(entry.pcLevel, entry.chairLevel, entry.monitorLevel, entry.deskLevel,
        entry.keyboardLevel, entry.mouseLevel, entry.speakerLevel);
      place(station.group, entry, stationItem);
      this.configureStation(station);
      this.stations.set(entry.id, station);
    }
    // Version 1 did not serialize reception desks; preserve the original starter counter.
    const desks = saved.receptions ?? [{ id: 'legacy_reception', gridX: -2, gridZ: 2, rotationIndex: 0, level: saved.receptionLevel ?? 1 }];
    const receptionItem = BUILDABLE_ITEMS.find((item) => item.id === 'reception_counter')!;
    for (const entry of desks) {
      const desk = new ReceptionDesk(entry.id, entry.gridX, entry.gridZ, entry.rotationIndex, entry.level);
      await desk.build();
      place(desk.group, entry, receptionItem);
      this.receptionDesks.set(entry.id, desk);

    }
    for (const entry of saved.facilities) {
      const type = entry.itemId as FacilityType;
      const facility = new FacilityEntity(entry.id, type, entry.gridX, entry.gridZ, entry.rotationIndex, entry.level ?? 1);
      await facility.build();
      const item = BUILDABLE_ITEMS.find((candidate) => candidate.id.startsWith(type))!;
      place(facility.group, entry, item);
      this.registerFacility(facility, item);
    }
    for (const entry of saved.objects ?? []) {
      const item = BUILDABLE_ITEMS.find((candidate) => candidate.id === entry.itemId);
      if (!item) throw new Error(`Saved building item ${entry.itemId} is not in the catalog.`);
      const model = await AssetManager.getInstance().loadModel(item.modelPath);
      const offset = this.getBuildingWallOffset(item, entry.rotationIndex);
      const building = item.category === 'building';
      if (building) model.traverse((child) => {
        if (!(child as THREE.Mesh).isMesh) return;
        const mesh = child as THREE.Mesh;
        for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
          if (material.name === 'glass') { material.transparent = true; material.opacity = 0.35; material.depthWrite = false; }
        }
      });
      const walkable = building && (item.id.startsWith('floor_') || item.id.includes('doorway'));
      const { w, h } = place(model, entry, item, !walkable);
      model.position.x += offset.x; model.position.z += offset.z;
      const wall = offset.x !== 0 || offset.z !== 0 || item.id.startsWith('wall_') || item.id.startsWith('door_');
      model.userData = { ...model.userData, item, persistentId: entry.id, gridX: entry.gridX, gridZ: entry.gridZ,
        rotationIndex: entry.rotationIndex, isBuildingItem: building, isDecor: !building, isWalkable: walkable,
        halfW: wall ? (entry.rotationIndex % 2 === 0 ? 0.15 : w * 0.48) : w * 0.48,
        halfD: wall ? (entry.rotationIndex % 2 === 0 ? h * 0.48 : 0.15) : h * 0.48 };
      (building ? this.buildingObjects : this.decorObjects).push(model);
    }
    this.refreshLayout();
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
    if (this.busy || this.isMovingItem || this.activeItem) return false;

    if (this.selectedStation) {
      const station = this.selectedStation;
      if (station.serviceOwner || station.isOccupied || station.currentGamerId || station.isUpgrading) return false;
      this.startMoveStation(station);
      return true;
    }
    if (this.selectedReception) {
      const desk = this.selectedReception;
      if (desk.isUpgrading) return false;
      this.startMoveReception(desk);
      return true;
    }
    if (this.selectedFacility) {
      const facility = this.selectedFacility;
      if (facility.isUpgrading || facility.serviceOwner || facility.reservedBy) return false;
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

  public async startMoveStation(station: GamingStation): Promise<void> {
    if (station.serviceOwner || station.isOccupied || station.currentGamerId || station.isUpgrading) return;
    await this.startMove({ type: 'station', station, item: BUILDABLE_ITEMS.find((item) => item.category === 'station')!,
      originalGridX: station.gridX, originalGridZ: station.gridZ, originalRotationIndex: station.rotationIndex });
  }

  public async startMoveReception(desk: ReceptionDesk): Promise<void> {
    if (desk.isUpgrading) return;
    await this.startMove({ type: 'reception', reception: desk, item: BUILDABLE_ITEMS.find((item) => item.id.startsWith('reception'))!,
      originalGridX: desk.gridX, originalGridZ: desk.gridZ, originalRotationIndex: desk.rotationIndex });
  }

  public async startMoveFacility(facility: FacilityEntity): Promise<void> {
    if (facility.isUpgrading || facility.serviceOwner || facility.reservedBy) return;
    await this.startMove({ type: 'facility', facility, item: BUILDABLE_ITEMS.find((item) => item.id.startsWith(facility.type))!,
      originalGridX: facility.gridX, originalGridZ: facility.gridZ, originalRotationIndex: facility.rotationIndex });
  }

  public async startMoveObject(object: THREE.Object3D): Promise<void> {
    if (!object.userData.item) return;
    await this.startMove({ type: 'object', object, item: object.userData.item,
      originalGridX: object.userData.gridX, originalGridZ: object.userData.gridZ, originalRotationIndex: object.userData.rotationIndex ?? 0 });
  }

  private async startMove(context: MovingItemContext): Promise<void> {
    if (this.busy || this.isMovingItem || this.activeItem) return;
    this.deselectAll();
    this.movingItemContext = context;
    this.gridSystem.releaseOwner(this.movingId()!);
    this.isMovingItem = true;
    (context.station?.group ?? context.reception?.group ?? context.facility?.group ?? context.object!).visible = false;
    this.activeItem = context.item;
    this.rotationIndex = context.originalRotationIndex;
    this.currentGridPos = { x: context.originalGridX, z: context.originalGridZ };
    this.ghostGroup.rotation.y = this.rotationIndex * Math.PI / 2;
    this.updateHover(new THREE.Vector3(context.originalGridX, 0, context.originalGridZ));
    this.refreshLayout();
    this.onMoveModeChanged?.(true);
    await this.updateGhostModel();
    if (!this.isMovingItem) return;
    this.updateGhostValidity();
    this.ghostGroup.visible = this.footprintGroup.visible = true;
  }

  public cancelMove(): void {
    if (this.busy || !this.movingItemContext) return;
    const ctx = this.movingItemContext;
    const group = ctx.station?.group ?? ctx.reception?.group ?? ctx.facility?.group ?? ctx.object!;
    group.visible = true;
    this.reserve(ctx.item, ctx.originalGridX, ctx.originalGridZ, ctx.originalRotationIndex, this.movingId()!);
    this.isMovingItem = false;
    this.movingItemContext = undefined;
    this.activeItem = undefined;
    this.clearGhostModel();
    this.ghostGroup.visible = this.footprintGroup.visible = false;
    this.refreshLayout();
    if (ctx.reception) this.onReceptionMoved?.(ctx.reception);
    this.onMoveModeChanged?.(false);
  }

  public getAvailableStation(): GamingStation | null {
    for (const station of this.stations.values()) {
      if (station.group.visible && !station.serviceOwner && !station.isUpgrading && !station.needsService && !station.accessIssue && !station.isOccupied) {
        return station;
      }
    }
    return null;
  }
}

