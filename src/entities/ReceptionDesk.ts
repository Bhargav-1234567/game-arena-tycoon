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
}

export const RECEPTION_TIERS: ReceptionTier[] = [
  {
    level: 1,
    name: 'Starter Front Desk',
    price: 300,
    model: '/assets/models/furniture/counters/reception_lvl1.glb',
    desktopItems: 'Guest Sign-in Book (lvl 1), Welcome Nameplate (lvl 1.1) & Pen Mug (lvl 1.2)',
    perkDescription: 'Starter check-in counter for greeting visitors.',
    reputationBonus: 10
  },
  {
    level: 2,
    name: 'Executive Reception Counter',
    price: 650,
    model: '/assets/models/furniture/counters/reception_lvl2.glb',
    desktopItems: 'Intercom Desk Phone with Handset (lvl 2.1) & Filing Organizer (lvl 2)',
    perkDescription: 'Speeds up customer check-in throughput by +25%.',
    reputationBonus: 20
  },
  {
    level: 3,
    name: 'Tech Bar Counter',
    price: 1200,
    model: '/assets/models/furniture/counters/reception_lvl3.glb',
    desktopItems: 'Staff Laptop (lvl 3.1), Customer Card Scanner (lvl 3) & Accessory Tray (lvl 3.2)',
    perkDescription: 'Digital check-in reduces queue wait times by +50%.',
    reputationBonus: 35
  },
  {
    level: 4,
    name: 'Cyberpunk POS Arena Terminal',
    price: 2400,
    model: '/assets/models/furniture/counters/reception_lvl4.glb',
    desktopItems: 'Touchscreen POS Machine & Cash Drawer (lvl 4), Thermal Receipt Printer (lvl 4.1)',
    perkDescription: 'Automated ticketing and POS cashier terminal. Maximum prestige!',
    reputationBonus: 60
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

  public async build() {
    const assetMgr = AssetManager.getInstance();
    this.mesh = await assetMgr.loadModel(this.currentTier.model);
    this.mesh.position.set(0, 0, 0);
    this.group.add(this.mesh);

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

  public async upgrade(nextTier: ReceptionTier) {
    this.currentTier = nextTier;
    if (this.mesh) {
      this.group.remove(this.mesh);
    }
    const assetMgr = AssetManager.getInstance();
    this.mesh = await assetMgr.loadModel(nextTier.model);
    this.mesh.position.set(0, 0, 0);
    this.group.add(this.mesh);
  }

  public getStaffPosition(): THREE.Vector3 {
    // Receptionist position behind desk (clear of counter edge so employee never clips table)
    const local = new THREE.Vector3(0, 0, -1.35);
    local.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.group.rotation.y);
    return this.group.position.clone().add(local);
  }

  public getCustomerQueuePosition(): THREE.Vector3 {
    // Customer waiting spot in front of desk (in open walkable floor aisle)
    const local = new THREE.Vector3(0, 0, 1.85);
    local.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.group.rotation.y);
    return this.group.position.clone().add(local);
  }
}

