import * as THREE from 'three';
import { AssetManager } from '../services/AssetManager.ts';

export interface ReceptionTier {
  level: number;
  name: string;
  price: number;
  model: string;
  desktopItems: string;
  perkDescription: string;
  reputationBonus: number;
  checkInMultiplier: number;
}

export const RECEPTION_TIERS: ReceptionTier[] = [
  {
    level: 1,
    name: 'Starter Front Desk',
    price: 300,
    model: '/assets/models/furniture/counters/reception_lvl1.glb',
    desktopItems: 'Guest Sign-in Book (lvl 1), Welcome Nameplate (lvl 1.1) & Pen Mug (lvl 1.2)',
    perkDescription: 'Starter check-in counter for greeting visitors.',
    reputationBonus: 10,
    checkInMultiplier: 1
  },
  {
    level: 2,
    name: 'Executive Reception Counter',
    price: 650,
    model: '/assets/models/furniture/counters/reception_lvl2.glb',
    desktopItems: 'Intercom Desk Phone with Handset (lvl 2.1) & Filing Organizer (lvl 2)',
    perkDescription: 'Speeds up customer check-in throughput by +25%.',
    reputationBonus: 20,
    checkInMultiplier: 1.25
  },
  {
    level: 3,
    name: 'Tech Bar Counter',
    price: 1200,
    model: '/assets/models/furniture/counters/reception_lvl3.glb',
    desktopItems: 'Staff Laptop (lvl 3.1), Customer Card Scanner (lvl 3) & Accessory Tray (lvl 3.2)',
    perkDescription: 'Digital check-in reduces queue wait times by +50%.',
    reputationBonus: 35,
    checkInMultiplier: 1.5
  },
  {
    level: 4,
    name: 'Cyberpunk POS Arena Terminal',
    price: 2400,
    model: '/assets/models/furniture/counters/reception_lvl4.glb',
    desktopItems: 'Touchscreen POS Machine & Cash Drawer (lvl 4), Thermal Receipt Printer (lvl 4.1)',
    perkDescription: 'Automated ticketing: +75% check-in throughput. Maximum prestige!',
    reputationBonus: 60,
    checkInMultiplier: 1.75
  }
];

export class ReceptionDesk {
  public readonly id: string;
  public group: THREE.Group = new THREE.Group();
  public gridX: number;
  public gridZ: number;
  public rotationIndex: number = 0;

  public currentTier: ReceptionTier = RECEPTION_TIERS[0];
  private mesh?: THREE.Group;
  private selectionRing?: THREE.Mesh;
  public isSelected: boolean = false;
  public isUpgrading = false;

  constructor(
    id: string,
    gridX: number,
    gridZ: number,
    rotationIndex: number = 0,
    initialLevel: number = 1
  ) {
    this.id = id;
    this.gridX = gridX;
    this.gridZ = gridZ;
    this.rotationIndex = rotationIndex;
    this.group.name = `ReceptionDesk_${id}`;
    this.group.rotation.y = rotationIndex * (Math.PI / 2);

    const tier = RECEPTION_TIERS.find((t) => t.level === initialLevel);
    if (tier) this.currentTier = tier;
  }

  private alignMesh(mesh: THREE.Group) {
    // Untilt raw model (eliminates Blender ~14.6° yaw and ~3° pitch/roll tilts)
    // and align customer counter ledge to +Z, employee drawers to -Z, sitting flush on floor (Y=0)
    mesh.rotation.set(-0.058378, -2.886298, 0.025500, 'YXZ');
    mesh.position.set(-0.0383, -0.0664, -0.0787);
  }

  public async build() {
    const assetMgr = AssetManager.getInstance();
    this.mesh = await assetMgr.loadRequiredModel(this.currentTier.model);
    this.alignMesh(this.mesh);
    this.group.add(this.mesh);

    const marker = new THREE.Mesh(new THREE.RingGeometry(.39, .51, 48),
      new THREE.MeshBasicMaterial({ color: 0x50f2cf, side: THREE.DoubleSide }));
    marker.rotation.x = -Math.PI / 2;
    marker.position.set(0, .035, -2.08);
    this.group.add(marker);

    // Selection highlight ring around reception table
    const ringGeo = new THREE.RingGeometry(1.45, 1.6, 32);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
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

  public async upgrade(nextTier: ReceptionTier, beforeCommit: () => boolean = () => true): Promise<void> {
    if (this.isUpgrading || !this.group.visible || nextTier.level !== this.currentTier.level + 1) throw new Error('This upgrade is no longer available.');
    this.isUpgrading = true;
    try {
      const model = await AssetManager.getInstance().loadRequiredModel(nextTier.model);
      this.alignMesh(model);
      if (!beforeCommit()) throw new Error('Not enough cash.');
      if (this.mesh) this.group.remove(this.mesh);
      this.currentTier = nextTier;
      this.mesh = model;
      this.group.add(model);
    } finally { this.isUpgrading = false; }
  }

  public getStaffPosition(): THREE.Vector3 {
    // Receptionist position behind desk (clear of counter edge so employee never clips table)
    const local = new THREE.Vector3(0, 0, -2.08);
    local.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.group.rotation.y);
    return this.group.position.clone().add(local);
  }

  public getCustomerQueuePosition(queueIndex: number = 0): THREE.Vector3 {
    // Customer waiting spot in front of desk counter.
    // Index 0 is served at counter front (1.85m), index 1, 2, ... queue behind (0.85m apart).
    const local = new THREE.Vector3(0, 0, 1.85 + queueIndex * 0.85);
    local.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.group.rotation.y);
    return this.group.position.clone().add(local);
  }
}

