import * as THREE from 'three';
import { AssetManager } from '../services/AssetManager.ts';
import { pcUpgrades, PCUpgrade } from '../data/pc-upgrades.ts';
import { chairUpgrades, ChairUpgrade } from '../data/chair-upgrades.ts';
import { monitorUpgrades, MonitorUpgrade } from '../data/monitor-upgrades.ts';
import { deskUpgrades, DeskUpgrade } from '../data/desk-upgrades.ts';
import {
  keyboardUpgrades,
  mouseUpgrades,
  speakerUpgrades,
  PeripheralUpgrade
} from '../data/peripheral-upgrades.ts';

export interface ComponentDimensions {
  w: number;
  d: number;
  h: number;
}

export interface DeskSurfaceBounds {
  frontZ: number;    // Usable front edge of tabletop surface where keyboard & mouse sit
  backZ: number;     // Usable rear edge where monitor stand sits
  rightX: number;    // Right-side anchor position for PC tower
  maxRightX: number; // Absolute perimeter bound on the right so PC never hangs off
  surfaceY: number;  // Tabletop height (0.720m)
}

// Measured usable desktop surface zones (accounting for oval curvature and bevels)
export const DESK_SURFACES: Record<number, DeskSurfaceBounds> = {
  1: { frontZ: 0.32, backZ: -0.30, rightX: 0.46, maxRightX: 0.65, surfaceY: 0.720 },
  2: { frontZ: 0.38, backZ: -0.32, rightX: 0.50, maxRightX: 0.72, surfaceY: 0.720 },
  3: { frontZ: 0.35, backZ: -0.32, rightX: 0.54, maxRightX: 0.78, surfaceY: 0.720 },
  4: { frontZ: 0.28, backZ: -0.36, rightX: 0.55, maxRightX: 0.78, surfaceY: 0.720 }
};

export const CHAIR_DIMS: Record<number, ComponentDimensions> = {
  1: { w: 0.544, d: 0.609, h: 0.850 },
  2: { w: 0.539, d: 0.631, h: 0.950 },
  3: { w: 0.584, d: 0.548, h: 1.060 },
  4: { w: 0.844, d: 0.747, h: 1.180 }
};

export const MONITOR_DIMS: Record<number, ComponentDimensions> = {
  1: { w: 0.480, d: 0.147, h: 0.363 },
  2: { w: 0.580, d: 0.198, h: 0.525 },
  3: { w: 0.700, d: 0.182, h: 0.609 },
  4: { w: 0.880, d: 0.748, h: 0.645 }
};

export const KEYBOARD_DIMS: Record<number, ComponentDimensions> = {
  1: { w: 0.400, d: 0.141, h: 0.023 },
  2: { w: 0.460, d: 0.165, h: 0.023 },
  3: { w: 0.520, d: 0.195, h: 0.020 },
  4: { w: 0.580, d: 0.214, h: 0.030 }
};

export const MOUSE_DIMS: Record<number, ComponentDimensions> = {
  1: { w: 0.065, d: 0.110, h: 0.027 },
  2: { w: 0.072, d: 0.125, h: 0.044 },
  3: { w: 0.084, d: 0.140, h: 0.094 },
  4: { w: 0.101, d: 0.155, h: 0.133 }
};

// Level 4 CPU rotated facing front (W: 0.365m, D: 0.195m, H: 0.550m)
export const PC_DIMS: Record<number, ComponentDimensions> = {
  1: { w: 0.202, d: 0.422, h: 0.420 },
  2: { w: 0.179, d: 0.433, h: 0.460 },
  3: { w: 0.230, d: 0.539, h: 0.500 },
  4: { w: 0.365, d: 0.195, h: 0.550 }
};

export const SPEAKER_DIMS: Record<number, ComponentDimensions> = {
  1: { w: 0.123, d: 0.087, h: 0.160 },
  2: { w: 0.096, d: 0.069, h: 0.200 },
  3: { w: 0.106, d: 0.081, h: 0.240 },
  4: { w: 0.156, d: 0.123, h: 0.280 }
};

export class GamingStation {
  public readonly id: string;
  public group: THREE.Group = new THREE.Group();
  public gridX: number;
  public gridZ: number;
  public rotationIndex: number = 0; // 0, 1, 2, 3 (0, 90, 180, 270 deg)

  // Current Upgrade Tiers
  public currentPC: PCUpgrade = pcUpgrades[0];
  public currentChair: ChairUpgrade = chairUpgrades[0];
  public currentMonitor: MonitorUpgrade = monitorUpgrades[0];
  public currentDesk: DeskUpgrade = deskUpgrades[0];
  public currentKeyboard: PeripheralUpgrade = keyboardUpgrades[0];
  public currentMouse: PeripheralUpgrade = mouseUpgrades[0];
  public currentSpeaker: PeripheralUpgrade = speakerUpgrades[0];

  // Component Model References
  private deskMesh?: THREE.Group;
  private chairMesh?: THREE.Group;
  private pcMesh?: THREE.Group;
  private monitorMesh?: THREE.Group;
  private keyboardMesh?: THREE.Group;
  private mouseMesh?: THREE.Group;
  private speakerMesh?: THREE.Group;

  // Dynamically computed physical layout state
  public computedChairZ: number = 0.66;

  // Selection & Highlight ring
  private selectionRing?: THREE.Mesh;
  public isSelected: boolean = false;

  // Station status
  public isOccupied: boolean = false;
  public currentGamerId?: string;

  constructor(id: string, gridX: number, gridZ: number, rotationIndex: number = 0) {
    this.id = id;
    this.gridX = gridX;
    this.gridZ = gridZ;
    this.rotationIndex = rotationIndex;
    this.group.name = `Station_${id}`;
    this.group.rotation.y = rotationIndex * (Math.PI / 2);
  }

  public async loadTiers(
    pcLvl: number,
    chairLvl: number,
    monitorLvl: number,
    deskLvl: number,
    kbLvl: number,
    mouseLvl: number,
    speakerLvl: number
  ) {
    this.currentPC = pcUpgrades.find((u) => u.level === pcLvl) || pcUpgrades[0];
    this.currentChair = chairUpgrades.find((u) => u.level === chairLvl) || chairUpgrades[0];
    this.currentMonitor = monitorUpgrades.find((u) => u.level === monitorLvl) || monitorUpgrades[0];
    this.currentDesk = deskUpgrades.find((u) => u.level === deskLvl) || deskUpgrades[0];
    this.currentKeyboard = keyboardUpgrades.find((u) => u.level === kbLvl) || keyboardUpgrades[0];
    this.currentMouse = mouseUpgrades.find((u) => u.level === mouseLvl) || mouseUpgrades[0];
    this.currentSpeaker = speakerUpgrades.find((u) => u.level === speakerLvl) || speakerUpgrades[0];
    await this.build();
  }

  /**
   * Recalculates exact physical positions ensuring EVERY object sits completely
   * on the tabletop surface without overhang or floating.
   */
  public updateLayout() {
    const desk = DESK_SURFACES[this.currentDesk.level] || DESK_SURFACES[1];
    const chair = CHAIR_DIMS[this.currentChair.level] || CHAIR_DIMS[1];
    const monitor = MONITOR_DIMS[this.currentMonitor.level] || MONITOR_DIMS[1];
    const kb = KEYBOARD_DIMS[this.currentKeyboard.level] || KEYBOARD_DIMS[1];
    const mouse = MOUSE_DIMS[this.currentMouse.level] || MOUSE_DIMS[1];
    const pc = PC_DIMS[this.currentPC.level] || PC_DIMS[1];
    const spk = SPEAKER_DIMS[this.currentSpeaker.level] || SPEAKER_DIMS[1];

    const deskTopY = desk.surfaceY; // 0.720m tabletop surface

    // 1. Desk: Origin at (0, 0, 0)
    if (this.deskMesh) {
      this.deskMesh.position.set(0, 0, 0);
    }

    // 2. Keyboard:
    // Placed comfortably on the desk surface with a safe margin from the front edge.
    // Guaranteed to stay 100% on the table with no overhang.
    const wristMargin = 0.05;
    const kbZ = desk.frontZ - wristMargin - kb.d / 2;
    const kbX = -0.05; // Slightly left-aligned so typing cluster is centered
    if (this.keyboardMesh) {
      this.keyboardMesh.position.set(kbX, deskTopY, kbZ);
    }

    // 3. Mouse:
    // Placed on dedicated mousepad zone to the right of the keyboard.
    // Matches the keyboard depth (Z) so it never overhangs the front curved rim.
    const mouseGap = 0.08;
    const mouseX = kbX + kb.w / 2 + mouseGap + mouse.w / 2;
    const mouseZ = kbZ;
    if (this.mouseMesh) {
      this.mouseMesh.position.set(mouseX, deskTopY, mouseZ);
    }

    // 4. PC Tower (CPU):
    // Positioned safely on the right side of the desk surface towards the back.
    // Clamped strictly within maxRightX so it NEVER floats off the table.
    let pcX = Math.max(desk.rightX, mouseX + mouse.w / 2 + pc.w / 2 + 0.03);
    if (pcX + pc.w / 2 > desk.maxRightX) {
      pcX = desk.maxRightX - pc.w / 2;
    }
    const pcZ = -0.08;
    if (this.pcMesh) {
      this.pcMesh.position.set(pcX, deskTopY, pcZ);
    }

    // 5. Monitor:
    // Positioned centered (or offset if ultra-wide requires lateral clearance for PC)
    // Sits firmly on the desk surface behind the keyboard.
    let monX = 0;
    if (pcX - pc.w / 2 < monitor.w / 2 + 0.03) {
      monX = Math.min(0, pcX - pc.w / 2 - monitor.w / 2 - 0.03);
    }
    const monZ = Math.min(desk.backZ + monitor.d / 2, kbZ - kb.d / 2 - 0.08 - monitor.d / 2);
    // Move level 4 monitor on the Y axis so the display stand sits firmly on the desk
    const monY = this.currentMonitor.level === 4 ? deskTopY - 0.20 : deskTopY;
    if (this.monitorMesh) {
      this.monitorMesh.position.set(monX, monY, monZ);
    }

    // 6. Speaker:
    // Placed on the left flank of the monitor, positioned forward so it stays firmly on the desk surface.
    let spkX = monX - (monitor.w / 2 + spk.w / 2 + 0.04);
    const minSpkX = -desk.maxRightX + spk.w / 2 + 0.03;
    spkX = Math.max(spkX, minSpkX);
    // Move speaker forward (+Z direction) so it never hangs off the curved rear edge
    const spkZ = Math.max(0.04, monZ + 0.22);
    if (this.speakerMesh) {
      this.speakerMesh.position.set(spkX, deskTopY, spkZ);
    }

    // 7. Chair:
    // Distance from table calculated from the table's front edge and chair depth.
    // Sits pulled up to the desk so front of seat is naturally positioned for the gamer.
    const seatGap = 0.03;
    const chairZ = desk.frontZ + seatGap + chair.d / 2;
    this.computedChairZ = chairZ;
    if (this.chairMesh) {
      this.chairMesh.position.set(0, 0, chairZ);
    }

    // 8. Update Selection Highlight Ring
    this.updateSelectionRing(desk.maxRightX * 2, chairZ, chair.d);
  }

  private updateSelectionRing(deskW: number, chairZ: number, chairD: number) {
    if (this.selectionRing) {
      this.group.remove(this.selectionRing);
      this.selectionRing.geometry.dispose();
    }
    const stationRadius = Math.max(deskW / 2 + 0.15, (chairZ + chairD / 2) * 0.72);
    const ringGeo = new THREE.RingGeometry(stationRadius, stationRadius + 0.08, 32);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x0d9488,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: this.isSelected ? 0.9 : 0.0
    });
    this.selectionRing = new THREE.Mesh(ringGeo, ringMat);
    this.selectionRing.position.y = 0.02;
    this.group.add(this.selectionRing);
  }

  public async build() {
    const assetMgr = AssetManager.getInstance();

    this.deskMesh = await assetMgr.loadModel(this.currentDesk.model);
    this.group.add(this.deskMesh);

    this.chairMesh = await assetMgr.loadModel(this.currentChair.model);
    this.group.add(this.chairMesh);

    this.pcMesh = await assetMgr.loadModel(this.currentPC.model);
    this.group.add(this.pcMesh);

    this.monitorMesh = await assetMgr.loadModel(this.currentMonitor.model);
    this.group.add(this.monitorMesh);

    this.keyboardMesh = await assetMgr.loadModel(this.currentKeyboard.model);
    this.group.add(this.keyboardMesh);

    this.mouseMesh = await assetMgr.loadModel(this.currentMouse.model);
    this.group.add(this.mouseMesh);

    this.speakerMesh = await assetMgr.loadModel(this.currentSpeaker.model);
    this.group.add(this.speakerMesh);

    this.updateLayout();
  }

  public setSelected(selected: boolean) {
    this.isSelected = selected;
    if (this.selectionRing) {
      const mat = this.selectionRing.material as THREE.MeshBasicMaterial;
      mat.opacity = selected ? 0.9 : 0.0;
    }
  }

  // Upgrade methods (seamless model swap + full dynamic layout recalculation)
  public async upgradePC(newTier: PCUpgrade) {
    this.currentPC = newTier;
    if (this.pcMesh) this.group.remove(this.pcMesh);
    const assetMgr = AssetManager.getInstance();
    this.pcMesh = await assetMgr.loadModel(newTier.model);
    this.group.add(this.pcMesh);
    this.updateLayout();
  }

  public async upgradeChair(newTier: ChairUpgrade) {
    this.currentChair = newTier;
    if (this.chairMesh) this.group.remove(this.chairMesh);
    const assetMgr = AssetManager.getInstance();
    this.chairMesh = await assetMgr.loadModel(newTier.model);
    this.group.add(this.chairMesh);
    this.updateLayout();
  }

  public async upgradeMonitor(newTier: MonitorUpgrade) {
    this.currentMonitor = newTier;
    if (this.monitorMesh) this.group.remove(this.monitorMesh);
    const assetMgr = AssetManager.getInstance();
    this.monitorMesh = await assetMgr.loadModel(newTier.model);
    this.group.add(this.monitorMesh);
    this.updateLayout();
  }

  public async upgradeDesk(newTier: DeskUpgrade) {
    this.currentDesk = newTier;
    if (this.deskMesh) this.group.remove(this.deskMesh);
    const assetMgr = AssetManager.getInstance();
    this.deskMesh = await assetMgr.loadModel(newTier.model);
    this.group.add(this.deskMesh);
    this.updateLayout();
  }

  public async upgradeKeyboard(newTier: PeripheralUpgrade) {
    this.currentKeyboard = newTier;
    if (this.keyboardMesh) this.group.remove(this.keyboardMesh);
    const assetMgr = AssetManager.getInstance();
    this.keyboardMesh = await assetMgr.loadModel(newTier.model);
    this.group.add(this.keyboardMesh);
    this.updateLayout();
  }

  public async upgradeMouse(newTier: PeripheralUpgrade) {
    this.currentMouse = newTier;
    if (this.mouseMesh) this.group.remove(this.mouseMesh);
    const assetMgr = AssetManager.getInstance();
    this.mouseMesh = await assetMgr.loadModel(newTier.model);
    this.group.add(this.mouseMesh);
    this.updateLayout();
  }

  public async upgradeSpeaker(newTier: PeripheralUpgrade) {
    this.currentSpeaker = newTier;
    if (this.speakerMesh) this.group.remove(this.speakerMesh);
    const assetMgr = AssetManager.getInstance();
    this.speakerMesh = await assetMgr.loadModel(newTier.model);
    this.group.add(this.speakerMesh);
    this.updateLayout();
  }

  public getHourlyRevenue(): number {
    return (
      this.currentPC.hourlyRevenue +
      (this.currentKeyboard.bonus ? Math.floor(this.currentKeyboard.bonus / 5) : 0) +
      (this.currentMouse.bonus ? Math.floor(this.currentMouse.bonus / 5) : 0) +
      (this.currentSpeaker.bonus ? Math.floor(this.currentSpeaker.bonus / 5) : 0)
    );
  }

  public getSatisfactionScore(): number {
    return (
      this.currentPC.performance +
      this.currentChair.comfort +
      this.currentMonitor.satisfactionBonus +
      this.currentKeyboard.bonus +
      this.currentMouse.bonus +
      this.currentSpeaker.bonus
    );
  }

  public getSeatingWorldPosition(): THREE.Vector3 {
    // World position where the customer sits (directly on chair cushion facing the desk)
    // Shift forward along Z (-0.08m towards desk) so the character's back does not clip out through the rear backrest.
    // Elevate along Y (+0.18m) so buttocks rest flush on top of the seat cushion rather than sinking through to the floor.
    const chairZ = this.computedChairZ - 0.08;
    const localSeat = new THREE.Vector3(0, 0.18, chairZ);
    localSeat.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.group.rotation.y);
    return this.group.position.clone().add(localSeat);
  }

  public update(time: number) {
    // Animate RGB glow when active
    if (this.isOccupied) {
      const pulse = 1.0 + Math.sin(time * 6) * 0.25;
      if (this.pcMesh) {
        this.pcMesh.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            const mat = mesh.material as THREE.MeshStandardMaterial;
            if (mat && mat.emissive && mat.emissiveIntensity !== undefined) {
              mat.emissiveIntensity = pulse * 1.5;
            }
          }
        });
      }
    }
  }
}
