import * as THREE from 'three';
import { GridSystem } from './GridSystem.ts';
import { EconomySystem } from './EconomySystem.ts';
import { ParticleSystem } from '../services/ParticleSystem.ts';
import { SoundManager } from '../services/SoundManager.ts';
import { AssetManager } from '../services/AssetManager.ts';
import { CollisionSystem } from './CollisionSystem.ts';
import { SaveManager } from '../services/SaveManager.ts';

export interface ExpansionStageDef {
  stage: number;
  price: number;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  previewBounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  markerPos: THREE.Vector3;
  name: string;
}

export class ExpansionSystem {
  private scene: THREE.Scene;
  private gridSystem: GridSystem;
  private economySystem: EconomySystem;
  private particleSystem: ParticleSystem;
  public collisionSystem?: CollisionSystem;

  public currentStage: number = 0;
  public maxStage: number = 6;

  // Expansion Stages (Initial $500, +$500 per upgrade)
  public stages: ExpansionStageDef[] = [
    {
      stage: 1,
      price: 500,
      bounds: { minX: -6, maxX: 6, minZ: -6, maxZ: 8 },
      previewBounds: { minX: -6, maxX: 6, minZ: -6, maxZ: -2 },
      markerPos: new THREE.Vector3(0, 0.04, -1.0),
      name: 'North VIP Wing (+4m Depth)'
    },
    {
      stage: 2,
      price: 1000,
      bounds: { minX: -6, maxX: 10, minZ: -6, maxZ: 8 },
      previewBounds: { minX: 6, maxX: 10, minZ: -6, maxZ: 8 },
      markerPos: new THREE.Vector3(5.0, 0.04, 1.0),
      name: 'East Arcade Hall (+4m Width)'
    },
    {
      stage: 3,
      price: 1500,
      bounds: { minX: -6, maxX: 10, minZ: -10, maxZ: 8 },
      previewBounds: { minX: -6, maxX: 10, minZ: -10, maxZ: -6 },
      markerPos: new THREE.Vector3(2.0, 0.04, -5.0),
      name: 'Pro Gaming Arena (+4m Depth)'
    },
    {
      stage: 4,
      price: 2000,
      bounds: { minX: -6, maxX: 14, minZ: -10, maxZ: 8 },
      previewBounds: { minX: 10, maxX: 14, minZ: -10, maxZ: 8 },
      markerPos: new THREE.Vector3(9.0, 0.04, 1.0),
      name: 'Tournament Hall (+4m Width)'
    },
    {
      stage: 5,
      price: 2500,
      bounds: { minX: -10, maxX: 14, minZ: -10, maxZ: 8 },
      previewBounds: { minX: -10, maxX: -6, minZ: -10, maxZ: 8 },
      markerPos: new THREE.Vector3(-5.0, 0.04, 1.0),
      name: 'West Streamer Lounge (+4m Width)'
    },
    {
      stage: 6,
      price: 3000,
      bounds: { minX: -10, maxX: 14, minZ: -14, maxZ: 8 },
      previewBounds: { minX: -10, maxX: 14, minZ: -14, maxZ: -10 },
      markerPos: new THREE.Vector3(2.0, 0.04, -9.0),
      name: 'Grand Esports Colosseum (+4m Depth)'
    }
  ];

  // Current active room bounds
  public currentBounds = { minX: -6, maxX: 6, minZ: -2, maxZ: 8 };

  // Building Kit Models Cache
  private wallSolidModel?: THREE.Group;
  private wallWindowModel?: THREE.Group;
  private wallHalfModel?: THREE.Group;
  private wallDoorwayModel?: THREE.Group;
  private doorModel?: THREE.Group;
  private neonSignModel?: THREE.Group;

  // Scene Groups
  public wallsGroup: THREE.Group = new THREE.Group();
  public markerGroup: THREE.Group = new THREE.Group();
  public previewGroup: THREE.Group = new THREE.Group();

  // Marker Elements
  public markerDiscMesh?: THREE.Mesh;
  private markerBorderMesh?: THREE.Mesh;
  private markerPulseMesh?: THREE.Mesh;
  private markerCanvas?: HTMLCanvasElement;
  private markerTexture?: THREE.CanvasTexture;
  private previewMesh?: THREE.Mesh;
  private previewLines?: THREE.LineSegments;

  private isHovered: boolean = false;
  private markerScaleTarget: number = 1.0;

  public onFloatingText?: (text: string, worldPos: THREE.Vector3, color?: string) => void;
  public onExpansionChanged?: (stage: number, nextPrice: number) => void;

  constructor(
    scene: THREE.Scene,
    gridSystem: GridSystem,
    economySystem: EconomySystem,
    particleSystem: ParticleSystem
  ) {
    this.scene = scene;
    this.gridSystem = gridSystem;
    this.economySystem = economySystem;
    this.particleSystem = particleSystem;

    this.wallsGroup.name = 'BuildingKit_Walls';
    this.markerGroup.name = 'FloorExpansion_Marker';
    this.previewGroup.name = 'FloorExpansion_Preview';

    this.scene.add(this.wallsGroup);
    this.scene.add(this.markerGroup);
    this.scene.add(this.previewGroup);

    // Initial starter room grid unlock (Stage 0: [-6, 5] x [-2, 7])
    this.gridSystem.setZoneUnlocked(
      this.currentBounds.minX,
      this.currentBounds.maxX - 1,
      this.currentBounds.minZ,
      this.currentBounds.maxZ - 1,
      true
    );
  }

  public async setup() {
    const assetMgr = AssetManager.getInstance();

    // Load Building Kit models with vibrant Red Door
    const [wallSolid, wallWindow, wallHalf, wallDoorway, door, neon] = await Promise.all([
      assetMgr.loadModel('/assets/models/game creation/Building Kit/Wall.glb'),
      assetMgr.loadModel('/assets/models/game creation/Building Kit/Wall Window Square.glb'),
      assetMgr.loadModel('/assets/models/game creation/Building Kit/Wall Half.glb'),
      assetMgr.loadModel('/assets/models/game creation/Building Kit/Wall Doorway Square.glb'),
      assetMgr.loadModel('/assets/models/game creation/Building Kit/Red Door.glb'),
      assetMgr.loadModel('/assets/models/decorations/neon_sign_game.glb')
    ]);

    // Make window glass transparent
    wallWindow.traverse((child) => {
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

    this.wallSolidModel = wallSolid;
    this.wallWindowModel = wallWindow;
    this.wallHalfModel = wallHalf;
    this.wallDoorwayModel = wallDoorway;
    this.doorModel = door;
    this.neonSignModel = neon;

    // Restore save if available
    const save = SaveManager.getInstance().load();
    if (save && save.expansionCount !== undefined && save.expansionCount > 0) {
      this.currentStage = Math.min(save.expansionCount, this.maxStage);
      if (this.currentStage > 0) {
        const stageDef = this.stages[this.currentStage - 1];
        this.currentBounds = { ...stageDef.bounds };
        this.gridSystem.setZoneUnlocked(
          this.currentBounds.minX,
          this.currentBounds.maxX - 1,
          this.currentBounds.minZ,
          this.currentBounds.maxZ - 1,
          true
        );
      }
    }

    // Rebuild floor strictly inside current room bounds (NO floor outside/behind walls!)
    await this.gridSystem.rebuildFloor(
      this.currentBounds.minX,
      this.currentBounds.maxX,
      this.currentBounds.minZ,
      this.currentBounds.maxZ
    );

    // Build Building Kit perimeter walls
    this.rebuildWalls();

    // Create current floor marker
    this.createFloorMarker();

    // Synchronize initial collision bounds
    this.updateCollisionBounds();
  }

  public getCurrentStageDef(): ExpansionStageDef | null {
    if (this.currentStage >= this.stages.length) return null;
    return this.stages[this.currentStage];
  }

  public getCurrentPrice(): number {
    const nextStage = this.getCurrentStageDef();
    return nextStage ? nextStage.price : 0;
  }

  /**
   * Rebuilds perimeter walls, window walls, front doorway with door, and neon sign using Building Kit.
   * All 4 walls seamlessly enclose the room with clean 90-degree corners.
   */
  public rebuildWalls() {
    if (!this.wallSolidModel || !this.wallHalfModel || !this.wallDoorwayModel) return;

    // Clear existing walls
    while (this.wallsGroup.children.length > 0) {
      const child = this.wallsGroup.children[0];
      this.wallsGroup.remove(child);
    }

    const { minX, maxX, minZ, maxZ } = this.currentBounds;

    // 1. Back Wall (along Z = minZ, from minX to maxX) - Clean solid walls
    for (let x = minX; x < maxX; x += 2) {
      const wall = this.wallSolidModel.clone();
      wall.position.set(x + 1.0, 0, minZ);
      wall.rotation.y = Math.PI / 2;
      this.wallsGroup.add(wall);
    }

    // 2. Left Wall (along X = minX, from minZ to maxZ) - Solid walls with only 1 centered window
    const leftMidZ = Math.floor((minZ + maxZ) / 4) * 2;
    for (let z = minZ; z < maxZ; z += 2) {
      const isWindow = (z === leftMidZ);
      const model = (isWindow && this.wallWindowModel ? this.wallWindowModel : this.wallSolidModel).clone();
      model.position.set(minX, 0, z + 1.0);
      model.rotation.y = 0;
      this.wallsGroup.add(model);
    }

    // 3. Right Wall (along X = maxX, from minZ to maxZ) - Solid walls with only 1 centered window
    const rightMidZ = Math.floor((minZ + maxZ) / 4) * 2;
    for (let z = minZ; z < maxZ; z += 2) {
      const isWindow = (z === rightMidZ);
      const model = (isWindow && this.wallWindowModel ? this.wallWindowModel : this.wallSolidModel).clone();
      model.position.set(maxX, 0, z + 1.0);
      model.rotation.y = Math.PI;
      this.wallsGroup.add(model);
    }

    // 4. Front Wall & Red Doorway (along Z = maxZ, from minX to maxX)
    // Left of Doorway: from minX to -1 (All clean solid walls, no window clutter!)
    for (let x = minX; x < -2; x += 2) {
      const model = this.wallSolidModel.clone();
      model.position.set(x + 1.0, 0, maxZ);
      model.rotation.y = -Math.PI / 2;
      this.wallsGroup.add(model);
    }
    // 1m Wall Half connecting to left of doorway (from X = -2 to -1)
    const leftHalfWall = this.wallHalfModel.clone();
    leftHalfWall.position.set(-1.5, 0, maxZ);
    leftHalfWall.rotation.y = -Math.PI / 2;
    this.wallsGroup.add(leftHalfWall);

    // Doorway & Red Door (from X = -1 to +1)
    const doorway = this.wallDoorwayModel.clone();
    doorway.position.set(0, 0, maxZ);
    doorway.rotation.y = -Math.PI / 2;
    this.wallsGroup.add(doorway);

    if (this.doorModel) {
      const door = this.doorModel.clone();
      // Doorway frame opening is between local Z = -0.45 and +0.45
      // Red Door hinge is at Z = 0 and leaf reaches 0.90m.
      // Seating hinge at Z = -0.45 makes door fit exactly within the doorway frame!
      door.position.set(0, 0, -0.45);
      // Propped open welcomingly inward into the lounge (approx 65 deg)
      door.rotation.y = -Math.PI * 0.38;
      doorway.add(door);
    }

    // 1m Wall Half connecting to right of doorway (from X = +1 to +2)
    const rightHalfWall = this.wallHalfModel.clone();
    rightHalfWall.position.set(1.5, 0, maxZ);
    rightHalfWall.rotation.y = -Math.PI / 2;
    this.wallsGroup.add(rightHalfWall);

    // Right of Doorway: from +2 to maxX (All clean solid walls, no window clutter!)
    for (let x = 2; x < maxX; x += 2) {
      const model = this.wallSolidModel.clone();
      model.position.set(x + 1.0, 0, maxZ);
      model.rotation.y = -Math.PI / 2;
      this.wallsGroup.add(model);
    }

    // 5. Glowing "GAME ON" Neon Sign (centered on back wall)
    if (this.neonSignModel) {
      const neon = this.neonSignModel.clone();
      const centerX = (minX + maxX) / 2;
      neon.position.set(centerX, 1.85, minZ + 0.15);
      this.wallsGroup.add(neon);
    }
  }

  /**
   * Constructs the clean floor marker and preview highlight for the next expansion.
   */
  private createFloorMarker() {
    // Clear previous marker & preview
    while (this.markerGroup.children.length > 0) {
      this.markerGroup.remove(this.markerGroup.children[0]);
    }
    while (this.previewGroup.children.length > 0) {
      this.previewGroup.remove(this.previewGroup.children[0]);
    }

    const nextStage = this.getCurrentStageDef();
    if (!nextStage) {
      this.markerGroup.visible = false;
      this.previewGroup.visible = false;
      return;
    }

    this.markerGroup.visible = true;
    this.markerGroup.position.copy(nextStage.markerPos);

    // 1. High-resolution canvas texture for the floor icon
    this.markerCanvas = document.createElement('canvas');
    this.markerCanvas.width = 512;
    this.markerCanvas.height = 512;
    this.renderMarkerCanvas(nextStage.price, nextStage.name);

    this.markerTexture = new THREE.CanvasTexture(this.markerCanvas);
    this.markerTexture.needsUpdate = true;
    this.markerTexture.generateMipmaps = true;

    // 2. Disc mesh lying flat on floor (1.2m radius)
    const discGeo = new THREE.CircleGeometry(1.2, 36);
    discGeo.rotateX(-Math.PI / 2);
    discGeo.computeBoundingBox();
    discGeo.computeBoundingSphere();
    const discMat = new THREE.MeshBasicMaterial({
      map: this.markerTexture,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    this.markerDiscMesh = new THREE.Mesh(discGeo, discMat);
    this.markerDiscMesh.position.y = 0.025;
    this.markerDiscMesh.userData = { isFloorExpansionMarker: true };
    this.markerGroup.add(this.markerDiscMesh);

    // 3. Glowing neon border ring
    const borderGeo = new THREE.RingGeometry(1.18, 1.25, 36);
    borderGeo.rotateX(-Math.PI / 2);
    borderGeo.computeBoundingBox();
    borderGeo.computeBoundingSphere();
    const borderMat = new THREE.MeshBasicMaterial({
      color: 0x06b6d4, // Cyan
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    this.markerBorderMesh = new THREE.Mesh(borderGeo, borderMat);
    this.markerBorderMesh.position.y = 0.027;
    this.markerGroup.add(this.markerBorderMesh);

    // 4. Outer pulsing ring
    const pulseGeo = new THREE.RingGeometry(1.28, 1.38, 36);
    pulseGeo.rotateX(-Math.PI / 2);
    pulseGeo.computeBoundingBox();
    pulseGeo.computeBoundingSphere();
    const pulseMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    this.markerPulseMesh = new THREE.Mesh(pulseGeo, pulseMat);
    this.markerPulseMesh.position.y = 0.029;
    this.markerGroup.add(this.markerPulseMesh);

    // 5. Invisible large hit target mesh (1.8m radius) for effortless click detection
    const hitGeo = new THREE.CircleGeometry(1.8, 24);
    hitGeo.rotateX(-Math.PI / 2);
    hitGeo.computeBoundingBox();
    hitGeo.computeBoundingSphere();
    const hitMat = new THREE.MeshBasicMaterial({ visible: false });
    const hitMesh = new THREE.Mesh(hitGeo, hitMat);
    hitMesh.position.y = 0.035;
    hitMesh.userData = { isFloorExpansionHitTarget: true };
    this.markerGroup.add(hitMesh);

    // 6. Zone preview highlight overlay for the tiles about to be added (visibly tinted)
    const pb = nextStage.previewBounds;
    const pWidth = pb.maxX - pb.minX;
    const pDepth = pb.maxZ - pb.minZ;
    const pCenterX = (pb.minX + pb.maxX) / 2;
    const pCenterZ = (pb.minZ + pb.maxZ) / 2;

    const planeGeo = new THREE.PlaneGeometry(pWidth, pDepth);
    planeGeo.rotateX(-Math.PI / 2);
    planeGeo.computeBoundingBox();
    planeGeo.computeBoundingSphere();
    const planeMat = new THREE.MeshBasicMaterial({
      color: 0x10b981,
      transparent: true,
      opacity: 0.22, // Visibly tinted by default!
      side: THREE.DoubleSide,
      depthWrite: false
    });
    this.previewMesh = new THREE.Mesh(planeGeo, planeMat);
    this.previewMesh.position.set(pCenterX, 0.015, pCenterZ);
    this.previewMesh.userData = { isFloorExpansionPreview: true };
    this.previewGroup.add(this.previewMesh);

    // Preview boundary outline
    const halfW = pWidth / 2;
    const halfD = pDepth / 2;
    const linePositions = [
      -halfW, 0.02, -halfD,   halfW, 0.02, -halfD,
       halfW, 0.02, -halfD,   halfW, 0.02,  halfD,
       halfW, 0.02,  halfD,  -halfW, 0.02,  halfD,
      -halfW, 0.02,  halfD,  -halfW, 0.02, -halfD
    ];
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
    const lineMat = new THREE.LineBasicMaterial({
      color: 0x34d399,
      transparent: true,
      opacity: 0.70, // Visibly outlined by default!
      linewidth: 2,
      depthWrite: false
    });
    this.previewLines = new THREE.LineSegments(lineGeo, lineMat);
    this.previewLines.position.set(pCenterX, 0, pCenterZ);
    this.previewGroup.add(this.previewLines);

    this.markerGroup.updateMatrixWorld(true);
    this.previewGroup.updateMatrixWorld(true);
  }

  private renderMarkerCanvas(price: number, name: string) {
    if (!this.markerCanvas) return;
    const ctx = this.markerCanvas.getContext('2d')!;
    const w = this.markerCanvas.width;
    const h = this.markerCanvas.height;

    ctx.clearRect(0, 0, w, h);

    // Dark cyber disc background
    const bgGrad = ctx.createRadialGradient(w / 2, h / 2, 40, w / 2, h / 2, 230);
    bgGrad.addColorStop(0, 'rgba(15, 23, 42, 0.96)');
    bgGrad.addColorStop(0.75, 'rgba(15, 23, 42, 0.90)');
    bgGrad.addColorStop(1, 'rgba(10, 15, 29, 0.98)');

    ctx.beginPath();
    ctx.arc(w / 2, h / 2, 230, 0, Math.PI * 2);
    ctx.fillStyle = bgGrad;
    ctx.fill();

    // Outer cyan glowing border
    ctx.save();
    ctx.shadowColor = '#06b6d4';
    ctx.shadowBlur = 18;
    ctx.lineWidth = 10;
    ctx.strokeStyle = '#06b6d4';
    ctx.stroke();
    ctx.restore();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // 1. Expand Icon & Header
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 36px "Segoe UI", Inter, sans-serif';
    ctx.fillText('⤢ EXPAND ROOM', w / 2, 115);

    // 2. Big Bold Gold Price Tag
    ctx.save();
    ctx.fillStyle = '#fbbf24';
    ctx.font = '900 84px "Segoe UI", Inter, sans-serif';
    ctx.shadowColor = 'rgba(251, 191, 36, 0.65)';
    ctx.shadowBlur = 22;
    ctx.fillText(`$${price.toLocaleString()}`, w / 2, 225);
    ctx.restore();

    // 3. Action Subtitle
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 32px "Segoe UI", Inter, sans-serif';
    ctx.fillText('CLICK TO UNLOCK', w / 2, 320);

    // 4. Area Name Pill
    ctx.fillStyle = '#34d399';
    ctx.font = '600 24px "Segoe UI", Inter, sans-serif';
    ctx.fillText(name.toUpperCase(), w / 2, 385);
  }

  public getRaycastTargets(): THREE.Object3D[] {
    if (!this.markerGroup.visible) return [];
    const targets: THREE.Object3D[] = [];
    this.markerGroup.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        targets.push(child);
      }
    });
    if (this.previewMesh) targets.push(this.previewMesh);
    return targets;
  }

  public setHovered(hovered: boolean) {
    if (this.isHovered === hovered) return;
    this.isHovered = hovered;
    this.markerScaleTarget = hovered ? 1.08 : 1.0;

    if (this.markerBorderMesh) {
      const mat = this.markerBorderMesh.material as THREE.MeshBasicMaterial;
      mat.color.setHex(hovered ? 0xfbbf24 : 0x06b6d4);
    }

    // Toggle preview highlight visibility
    if (this.previewMesh) {
      (this.previewMesh.material as THREE.MeshBasicMaterial).opacity = hovered ? 0.45 : 0.22;
    }
    if (this.previewLines) {
      (this.previewLines.material as THREE.LineBasicMaterial).opacity = hovered ? 1.0 : 0.70;
    }
  }

  public async tryExpand(): Promise<boolean> {
    const nextStage = this.getCurrentStageDef();
    if (!nextStage) return false;

    const price = nextStage.price;

    // Check money
    if (!this.economySystem.spend(price)) {
      SoundManager.getInstance().playPlacement();
      if (this.onFloatingText) {
        this.onFloatingText(
          `Need $${price.toLocaleString()} to Expand!`,
          nextStage.markerPos.clone().add(new THREE.Vector3(0, 1.2, 0)),
          '#ef4444'
        );
      }
      return false;
    }

    // Expansion Succeeded!
    this.currentStage++;

    // 1. Audio Fanfare & VFX
    SoundManager.getInstance().playUpgrade();
    this.particleSystem.spawnBurst(
      nextStage.markerPos.clone().add(new THREE.Vector3(0, 0.4, 0)),
      0x10b981,
      40
    );
    this.particleSystem.spawnBurst(
      nextStage.markerPos.clone().add(new THREE.Vector3(0, 0.4, 0)),
      0xfbbf24,
      30
    );

    if (this.onFloatingText) {
      this.onFloatingText(
        `🎉 ${nextStage.name} Unlocked! -$${price.toLocaleString()}`,
        nextStage.markerPos.clone().add(new THREE.Vector3(0, 1.5, 0)),
        '#34d399'
      );
    }

    // 2. Update room bounds
    this.currentBounds = { ...nextStage.bounds };

    // 3. Unlock grid cells
    this.gridSystem.setZoneUnlocked(
      this.currentBounds.minX,
      this.currentBounds.maxX - 1,
      this.currentBounds.minZ,
      this.currentBounds.maxZ - 1,
      true
    );

    // 4. Rebuild floor strictly inside new room bounds (NO floor outside!)
    await this.gridSystem.rebuildFloor(
      this.currentBounds.minX,
      this.currentBounds.maxX,
      this.currentBounds.minZ,
      this.currentBounds.maxZ
    );

    // 5. Rebuild Building Kit walls around new room perimeter
    this.rebuildWalls();

    // 6. Update physical collision bounds
    this.updateCollisionBounds();

    // 7. Create next floor marker (with new price: +$500)
    this.setHovered(false);
    this.createFloorMarker();

    // 8. Auto-save
    this.saveState();

    // 9. Notify UI listeners (e.g. HUD button update)
    if (this.onExpansionChanged) {
      this.onExpansionChanged(this.currentStage, this.getCurrentPrice());
    }

    return true;
  }

  private updateCollisionBounds() {
    if (!this.collisionSystem) return;
    this.collisionSystem.setRoomBounds(
      this.currentBounds.minX + 0.2,
      this.currentBounds.maxX - 0.2,
      this.currentBounds.minZ + 0.2,
      this.currentBounds.maxZ - 0.2
    );
  }

  public update(elapsedTime: number) {
    if (!this.markerGroup.visible) return;

    // Smooth scale lerp
    const curScale = this.markerGroup.scale.x;
    const nextScale = THREE.MathUtils.lerp(curScale, this.markerScaleTarget, 0.2);
    this.markerGroup.scale.set(nextScale, nextScale, nextScale);

    // Subtle pulsing ring
    if (this.markerPulseMesh) {
      const pulseScale = 1.0 + Math.sin(elapsedTime * 3.5) * 0.05;
      this.markerPulseMesh.scale.set(pulseScale, pulseScale, pulseScale);
      (this.markerPulseMesh.material as THREE.MeshBasicMaterial).opacity =
        0.35 + Math.sin(elapsedTime * 3.5) * 0.25;
    }

    // Gentle hover bobbing
    const nextStage = this.getCurrentStageDef();
    if (nextStage) {
      this.markerGroup.position.y = nextStage.markerPos.y + Math.sin(elapsedTime * 2.5) * 0.006;
    }
  }

  private saveState() {
    const saveMgr = SaveManager.getInstance();
    const existing = saveMgr.load();
    if (existing) {
      existing.expansionCount = this.currentStage;
      saveMgr.save(existing);
    }
  }
}
