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

  public async build() {
    const assetMgr = AssetManager.getInstance();

    // 1. Desk (origin at 0, 0, 0)
    this.deskMesh = await assetMgr.loadModel(this.currentDesk.model);
    this.deskMesh.position.set(0, 0, 0);
    this.group.add(this.deskMesh);

    // 2. Chair (placed at Z = -0.45 facing the desk)
    this.chairMesh = await assetMgr.loadModel(this.currentChair.model);
    this.chairMesh.position.set(0, 0, -0.45);
    this.group.add(this.chairMesh);

    // 3. PC Tower (placed on the right side of desk surface at X = 0.42, Y = 0.72, Z = 0.05)
    this.pcMesh = await assetMgr.loadModel(this.currentPC.model);
    this.pcMesh.position.set(0.42, 0.72, 0.05);
    this.group.add(this.pcMesh);

    // 4. Monitor (center of desk surface at X = 0, Y = 0.72, Z = 0.10)
    this.monitorMesh = await assetMgr.loadModel(this.currentMonitor.model);
    this.monitorMesh.position.set(0, 0.72, 0.10);
    this.group.add(this.monitorMesh);

    // 5. Keyboard (centered in front of monitor at X = -0.05, Y = 0.72, Z = -0.12)
    this.keyboardMesh = await assetMgr.loadModel(this.currentKeyboard.model);
    this.keyboardMesh.position.set(-0.05, 0.72, -0.12);
    this.group.add(this.keyboardMesh);

    // 6. Mouse (right of keyboard at X = 0.30, Y = 0.72, Z = -0.12)
    this.mouseMesh = await assetMgr.loadModel(this.currentMouse.model);
    this.mouseMesh.position.set(0.30, 0.72, -0.12);
    this.group.add(this.mouseMesh);

    // 7. Speaker (left flank of monitor at X = -0.38, Y = 0.72, Z = 0.10)
    this.speakerMesh = await assetMgr.loadModel(this.currentSpeaker.model);
    this.speakerMesh.position.set(-0.38, 0.72, 0.10);
    this.group.add(this.speakerMesh);

    // 8. Selection Highlight Ring
    const ringGeo = new THREE.RingGeometry(0.85, 0.95, 32);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x0d9488,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.0
    });
    this.selectionRing = new THREE.Mesh(ringGeo, ringMat);
    this.selectionRing.position.y = 0.02;
    this.group.add(this.selectionRing);
  }

  public setSelected(selected: boolean) {
    this.isSelected = selected;
    if (this.selectionRing) {
      const mat = this.selectionRing.material as THREE.MeshBasicMaterial;
      mat.opacity = selected ? 0.9 : 0.0;
    }
  }

  // Upgrade methods (swaps model seamlessly in place)
  public async upgradePC(newTier: PCUpgrade) {
    this.currentPC = newTier;
    if (this.pcMesh) this.group.remove(this.pcMesh);
    const assetMgr = AssetManager.getInstance();
    this.pcMesh = await assetMgr.loadModel(newTier.model);
    this.pcMesh.position.set(0.42, 0.72, 0.05);
    this.group.add(this.pcMesh);
  }

  public async upgradeChair(newTier: ChairUpgrade) {
    this.currentChair = newTier;
    if (this.chairMesh) this.group.remove(this.chairMesh);
    const assetMgr = AssetManager.getInstance();
    this.chairMesh = await assetMgr.loadModel(newTier.model);
    this.chairMesh.position.set(0, 0, -0.45);
    this.group.add(this.chairMesh);
  }

  public async upgradeMonitor(newTier: MonitorUpgrade) {
    this.currentMonitor = newTier;
    if (this.monitorMesh) this.group.remove(this.monitorMesh);
    const assetMgr = AssetManager.getInstance();
    this.monitorMesh = await assetMgr.loadModel(newTier.model);
    this.monitorMesh.position.set(0, 0.72, 0.10);
    this.group.add(this.monitorMesh);
  }

  public async upgradeDesk(newTier: DeskUpgrade) {
    this.currentDesk = newTier;
    if (this.deskMesh) this.group.remove(this.deskMesh);
    const assetMgr = AssetManager.getInstance();
    this.deskMesh = await assetMgr.loadModel(newTier.model);
    this.deskMesh.position.set(0, 0, 0);
    this.group.add(this.deskMesh);
  }

  public async upgradeKeyboard(newTier: PeripheralUpgrade) {
    this.currentKeyboard = newTier;
    if (this.keyboardMesh) this.group.remove(this.keyboardMesh);
    const assetMgr = AssetManager.getInstance();
    this.keyboardMesh = await assetMgr.loadModel(newTier.model);
    this.keyboardMesh.position.set(-0.05, 0.72, -0.12);
    this.group.add(this.keyboardMesh);
  }

  public async upgradeMouse(newTier: PeripheralUpgrade) {
    this.currentMouse = newTier;
    if (this.mouseMesh) this.group.remove(this.mouseMesh);
    const assetMgr = AssetManager.getInstance();
    this.mouseMesh = await assetMgr.loadModel(newTier.model);
    this.mouseMesh.position.set(0.30, 0.72, -0.12);
    this.group.add(this.mouseMesh);
  }

  public async upgradeSpeaker(newTier: PeripheralUpgrade) {
    this.currentSpeaker = newTier;
    if (this.speakerMesh) this.group.remove(this.speakerMesh);
    const assetMgr = AssetManager.getInstance();
    this.speakerMesh = await assetMgr.loadModel(newTier.model);
    this.speakerMesh.position.set(-0.38, 0.72, 0.10);
    this.group.add(this.speakerMesh);
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
    // World position where the customer sits (directly in the chair facing the desk)
    const localSeat = new THREE.Vector3(0, 0, -0.45);
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
