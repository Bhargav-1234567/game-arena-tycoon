import * as THREE from 'three';
import { AssetManager } from '../services/AssetManager.ts';

import { FACILITY_LAYOUTS, type FacilityType } from '../data/facility-layout.ts';
export type { FacilityType } from '../data/facility-layout.ts';

export interface FacilityTier {
  level: number;
  name: string;
  price: number;
  model: string;
  perkDescription: string;
  reputationBonus: number;
  pricePerUse?: number;
  rotationOffset?: number;
  yOffset?: number;
}

export const SOFA_TIERS: FacilityTier[] = [
  {
    level: 1,
    name: 'Compact Lobby Bench',
    price: 180,
    model: '/assets/models/furniture/sofas/sofa_lvl1.glb',
    perkDescription: 'Simple waiting bench for lounge visitors.',
    reputationBonus: 8,
    rotationOffset: 0
  },
  {
    level: 2,
    name: 'Modern 2-Seat Sofa',
    price: 380,
    model: '/assets/models/furniture/sofas/sofa_lvl2.glb',
    perkDescription: 'Plush cushions improve customer patience and comfort.',
    reputationBonus: 18,
    rotationOffset: 0
  },
  {
    level: 3,
    name: 'Executive Leather Couch',
    price: 750,
    model: '/assets/models/furniture/sofas/sofa_lvl3.glb',
    perkDescription: 'Supple leather seating with deep cushions.',
    reputationBonus: 32,
    rotationOffset: 0
  },
  {
    level: 4,
    name: 'VIP Sectional Lounge',
    price: 1500,
    model: '/assets/models/furniture/sofas/sofa_lvl4.glb',
    perkDescription: 'Spacious sectional sofa with built-in USB ports. Maximum comfort!',
    reputationBonus: 55,
    rotationOffset: 0
  }
];

export const VENDING_TIERS: FacilityTier[] = [
  {
    level: 1,
    name: 'Soda Vending Machine',
    price: 350,
    model: '/assets/models/business/vending/vending_lvl1.glb',
    perkDescription: 'Cold sodas and water bottles for thirsty players.',
    pricePerUse: 15,
    reputationBonus: 5,
    rotationOffset: 0
  },
  {
    level: 2,
    name: 'Snack & Energy Drink Vendor',
    price: 750,
    model: '/assets/models/business/vending/vending_lvl2.glb',
    perkDescription: 'Energy drinks and chips fuel late-night gaming sessions.',
    pricePerUse: 35,
    reputationBonus: 15,
    rotationOffset: 0
  },
  {
    level: 3,
    name: 'Hot Coffee & Meal Vendor',
    price: 1500,
    model: '/assets/models/business/vending/vending_lvl3.glb',
    perkDescription: 'Fresh espresso and noodle bowls for marathon gamers.',
    pricePerUse: 70,
    reputationBonus: 30,
    rotationOffset: 0
  },
  {
    level: 4,
    name: 'Gamer Fuel Smart Mart',
    price: 2800,
    model: '/assets/models/business/vending/vending_lvl4.glb',
    perkDescription: 'Robotic automated snack vendor with touch-screen ordering.',
    pricePerUse: 130,
    reputationBonus: 55,
    rotationOffset: 0
  }
];

export const ARCADE_TIERS: FacilityTier[] = [
  {
    level: 1,
    name: 'Classic Retro Arcade',
    price: 450,
    model: '/assets/models/business/arcade/arcade_lvl1.glb',
    perkDescription: '8-bit retro gaming cabinet with joystick controls.',
    pricePerUse: 20,
    reputationBonus: 12,
    rotationOffset: 0
  },
  {
    level: 2,
    name: 'Deluxe Fighting Arcade',
    price: 900,
    model: '/assets/models/business/arcade/arcade_lvl2.glb',
    perkDescription: 'Dual-player fighting cabinet with high-def CRT and stereo sound.',
    pricePerUse: 45,
    reputationBonus: 25,
    rotationOffset: 0
  },
  {
    level: 3,
    name: 'Neon Arcade Cabinet',
    price: 1800,
    model: '/assets/models/business/arcade/arcade_lvl3.glb',
    perkDescription: 'Low joystick and button deck beneath a neon marquee.',
    pricePerUse: 85,
    reputationBonus: 45,
    rotationOffset: 0
  },
  {
    level: 4,
    name: 'Seated Racing Simulator',
    price: 3600,
    model: '/assets/models/business/arcade/arcade_lvl4.glb',
    perkDescription: 'Take the racing seat and steer on the widescreen racing simulator.',
    pricePerUse: 180,
    reputationBonus: 80,
    rotationOffset: 0
  }
];

export class FacilityEntity {
  public readonly id: string;
  public readonly type: FacilityType;
  public group: THREE.Group = new THREE.Group();
  public gridX: number;
  public gridZ: number;
  public rotationIndex: number = 0;

  public currentTier: FacilityTier;
  private mesh?: THREE.Group;
  private selectionRing?: THREE.Mesh;
  public isSelected: boolean = false;
  public isUpgrading = false;
  public reservedBy?: string;
  public serviceOwner?: string;
  public inUse = false;
  public salesSinceRefill = 0;
  public playsSinceService = 0;
  public get capacity() { return 2 + 2 * this.currentTier.level; }
  public get stock() { return this.capacity - this.salesSinceRefill; }
  public get needsService() { return this.type === 'arcade' && this.playsSinceService >= 3; }
  public validateUpgrade?: (tier: FacilityTier) => void;
  public onLayoutChanged?: () => void;

  public get layout() { return FACILITY_LAYOUTS[this.type][this.currentTier.level - 1]; }

  public getApproachPosition(): THREE.Vector3 {
    const [x, z] = this.layout.entry;
    return this.group.localToWorld(new THREE.Vector3(x, 0, z));
  }

  public getUsePosition(): THREE.Vector3 {
    const seat = this.layout.seat;
    return seat ? this.group.localToWorld(new THREE.Vector3(seat[0], 0, seat[2])) : this.getApproachPosition();
  }

  public reserve(customerId: string): boolean {
    if ((this.type === 'vending' && this.stock <= 0) || this.needsService || this.serviceOwner || this.reservedBy || this.isUpgrading || !this.group.visible) return false;
    this.reservedBy = customerId;
    return true;
  }

  public completeUse(customerId: string): number {
    if (this.reservedBy !== customerId || !this.inUse || !this.group.visible) return 0;
    this.inUse = false;
    if (this.type === 'vending') this.salesSinceRefill++;
    if (this.type === 'arcade') this.playsSinceService++;
    return this.currentTier.pricePerUse ?? 0;
  }

  public release(customerId: string): void {
    if (this.reservedBy !== customerId) return;
    this.inUse = false;
    this.reservedBy = undefined;
  }

  constructor(
    id: string,
    type: FacilityType,
    gridX: number,
    gridZ: number,
    rotationIndex: number = 0,
    initialLevel: number = 1
  ) {
    this.id = id;
    this.type = type;
    this.gridX = gridX;
    this.gridZ = gridZ;
    this.rotationIndex = rotationIndex;
    this.group.name = `Facility_${id}`;
    this.group.userData.facility = this;
    this.group.rotation.y = rotationIndex * (Math.PI / 2);

    const tiers = this.getTiers();
    const tier = tiers.find((t) => t.level === initialLevel) || tiers[0];
    this.currentTier = tier;
  }

  public getTiers(): FacilityTier[] {
    switch (this.type) {
      case 'sofa':
        return SOFA_TIERS;
      case 'vending':
        return VENDING_TIERS;
      case 'arcade':
        return ARCADE_TIERS;
    }
  }

  public getThemeColorHex(): number {
    switch (this.type) {
      case 'sofa':
        return 0xf59e0b; // Amber
      case 'vending':
        return 0x10b981; // Emerald
      case 'arcade':
        return 0x8b5cf6; // Purple
    }
  }

  public async build() {
    await this.applyTierModel(this.currentTier);

    // Selection ring
    const radius = this.type === 'sofa' ? 1.35 : 0.85;
    const ringGeo = new THREE.RingGeometry(radius, radius + 0.12, 32);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: this.getThemeColorHex(),
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.0
    });
    this.selectionRing = new THREE.Mesh(ringGeo, ringMat);
    this.selectionRing.position.y = 0.02;
    this.group.add(this.selectionRing);
  }

  private async applyTierModel(tier: FacilityTier) {
    const assetMgr = AssetManager.getInstance();
    const model = await assetMgr.loadRequiredModel(tier.model);
    if (this.mesh) this.group.remove(this.mesh);
    this.mesh = model;
    this.mesh.position.set(0, tier.yOffset ?? 0, 0);
    this.mesh.rotation.y = tier.rotationOffset ?? 0;
    this.mesh.userData.facility = this;
    this.mesh.traverse((child) => {
      child.userData.facility = this;
    });
    this.group.add(this.mesh);
  }

  public setSelected(selected: boolean) {
    this.isSelected = selected;
    if (this.selectionRing) {
      const mat = this.selectionRing.material as THREE.MeshBasicMaterial;
      mat.opacity = selected ? 0.9 : 0.0;
    }
  }

  public async upgrade(nextTier: FacilityTier, beforeCommit: () => boolean = () => true): Promise<void> {
    if (this.serviceOwner) throw new Error('Wait for the employee to finish servicing the machine.');
    if (this.reservedBy) throw new Error('Wait for the visitor to finish before upgrading.');
    if (this.isUpgrading || !this.group.visible || nextTier.level !== this.currentTier.level + 1) throw new Error('This upgrade is no longer available.');
    this.isUpgrading = true;
    try {
      const model = await AssetManager.getInstance().loadRequiredModel(nextTier.model);
      model.position.set(0, nextTier.yOffset ?? 0, 0);
      model.rotation.y = nextTier.rotationOffset ?? 0;
      model.traverse((child) => { child.userData.facility = this; });
      this.validateUpgrade?.(nextTier);
      if (!beforeCommit()) throw new Error('Not enough cash.');
      if (this.mesh) this.group.remove(this.mesh);
      this.currentTier = nextTier;
      this.mesh = model;
      this.group.add(model);
      this.onLayoutChanged?.();
    } finally { this.isUpgrading = false; }
  }
}
