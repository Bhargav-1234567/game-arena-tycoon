import * as THREE from 'three';
import { Customer } from '../entities/Customer.ts';
import { PlacementSystem } from './PlacementSystem.ts';
import { EconomySystem } from './EconomySystem.ts';
import { AssetManager } from '../services/AssetManager.ts';
import { SoundManager } from '../services/SoundManager.ts';
import { CollisionSystem } from './CollisionSystem.ts';
import { ReceptionDesk } from '../entities/ReceptionDesk.ts';

export interface ReceptionistStaff {
  deskId: string;
  group: THREE.Group;
  mixer: THREE.AnimationMixer;
  idleAction?: THREE.AnimationAction;
  waveAction?: THREE.AnimationAction;
  interactAction?: THREE.AnimationAction;
}

export class CustomerSystem {
  private scene: THREE.Scene;
  private placementSystem: PlacementSystem;
  private economySystem: EconomySystem;
  public collisionSystem: CollisionSystem;

  private customers: Map<string, Customer> = new Map();
  // Multi-desk queues (keyed by deskId)
  private deskQueues: Map<string, Customer[]> = new Map();
  private spawnTimer: number = 0;
  private spawnInterval: number = 5.0; // seconds

  // Multi-Receptionist Registry (keyed by deskId)
  public receptionists: Map<string, ReceptionistStaff> = new Map();

  public onFloatingText?: (text: string, worldPos: THREE.Vector3, color?: string) => void;

  constructor(scene: THREE.Scene, placementSystem: PlacementSystem, economySystem: EconomySystem) {
    this.scene = scene;
    this.placementSystem = placementSystem;
    this.economySystem = economySystem;
    this.collisionSystem = new CollisionSystem(placementSystem);
  }

  public async setupReceptionistForDesk(desk: ReceptionDesk) {
    const assetMgr = AssetManager.getInstance();

    // If a staff member already exists for this desk, remove it first
    const existing = this.receptionists.get(desk.id);
    if (existing) {
      this.scene.remove(existing.group);
      this.receptionists.delete(desk.id);
    }

    // Uniformed corporate receptionist model from Women pack
    const receptionistModel = await assetMgr.loadModel('/assets/models/characters/women/Suit.glb');
    receptionistModel.scale.setScalar(1.0);

    receptionistModel.traverse((child) => {
      if ((child as THREE.SkinnedMesh).isSkinnedMesh) {
        child.frustumCulled = false;
        child.castShadow = true;
      }
    });

    const staffGroup = new THREE.Group();
    staffGroup.name = `Receptionist_Employee_${desk.id}`;
    staffGroup.add(receptionistModel);

    // Position behind the counter with clear spacing so employee never clips desk
    const pos = desk.getStaffPosition();
    staffGroup.position.copy(pos);
    staffGroup.rotation.y = desk.group.rotation.y;
    this.scene.add(staffGroup);

    // Setup animations: prioritize model's own native animations (matching its exact skeleton and bind pose)
    let animations = (receptionistModel.userData.animations as THREE.AnimationClip[]) || [];
    if (!animations || animations.length === 0) {
      const fallbackClips = await assetMgr.loadWomenAnimations();
      animations = fallbackClips.map((c) => assetMgr.sanitizeClip(c, false));
    }

    let mixer: THREE.AnimationMixer | undefined;
    let idleAction: THREE.AnimationAction | undefined;
    let waveAction: THREE.AnimationAction | undefined;
    let interactAction: THREE.AnimationAction | undefined;

    if (animations && animations.length > 0) {
      mixer = new THREE.AnimationMixer(receptionistModel);

      const idleClip =
        animations.find(
          (a) =>
            a.name.toLowerCase().includes('idle') &&
            !a.name.toLowerCase().includes('gun') &&
            !a.name.toLowerCase().includes('sword')
        ) || animations[0];
      const waveClip = animations.find((a) => a.name.toLowerCase().includes('wave'));
      const interactClip = animations.find((a) => a.name.toLowerCase().includes('interact'));

      if (idleClip) idleAction = mixer.clipAction(idleClip);
      if (waveClip) waveAction = mixer.clipAction(waveClip);
      if (interactClip) interactAction = mixer.clipAction(interactClip);

      idleAction?.play();
    }

    if (mixer) {
      this.receptionists.set(desk.id, {
        deskId: desk.id,
        group: staffGroup,
        mixer,
        idleAction,
        waveAction,
        interactAction
      });
    }

    if (!this.deskQueues.has(desk.id)) {
      this.deskQueues.set(desk.id, []);
    }
  }

  public async setupReceptionist() {
    for (const desk of this.placementSystem.receptionDesks.values()) {
      await this.setupReceptionistForDesk(desk);
    }
  }

  public async spawnInitialCustomer() {
    await this.trySpawnCustomer();
  }

  public update(deltaTime: number) {
    // Update all receptionist animations
    for (const staff of this.receptionists.values()) {
      staff.mixer.update(deltaTime);
    }

    // Customer spawn tick
    this.spawnTimer += deltaTime;
    if (this.spawnTimer >= this.spawnInterval) {
      this.spawnTimer = 0;
      this.trySpawnCustomer();
    }

    // Update active customers
    for (const customer of this.customers.values()) {
      customer.update(deltaTime);
    }

    // Clean up queues for any customer that left or got assigned
    for (const [deskId, queue] of this.deskQueues.entries()) {
      const activeQueue = queue.filter(
        (c) => c.state === 'WALKING_TO_RECEPTION' || c.state === 'WAITING_CHECKIN'
      );
      this.deskQueues.set(deskId, activeQueue);
    }

    // Front-of-line customer check-in for each active reception desk
    for (const desk of this.placementSystem.receptionDesks.values()) {
      const queue = this.deskQueues.get(desk.id) || [];
      if (queue.length > 0) {
        const headCustomer = queue[0];
        if (headCustomer.state === 'WAITING_CHECKIN') {
          const station = this.placementSystem.getAvailableStation();
          if (station) {
            headCustomer.assignedStation = station;
            station.isOccupied = true;
            station.currentGamerId = headCustomer.id;

            // Remove served customer from queue
            queue.shift();

            // Move head customer smoothly to assigned station
            headCustomer.moveTo(station.getSeatingWorldPosition(), 'WALKING_TO_STATION');

            // Receptionist interaction reaction for this specific desk
            const staff = this.receptionists.get(desk.id);
            if (staff && (staff.waveAction || staff.interactAction)) {
              const action = staff.waveAction || staff.interactAction;
              action?.reset().setLoop(THREE.LoopOnce, 1).play();
              setTimeout(() => {
                staff.idleAction?.reset().fadeIn(0.2).play();
              }, 1200);
            }

            // Advance remaining waiting customers forward in queue for this desk
            for (let i = 0; i < queue.length; i++) {
              const waitingCust = queue[i];
              const nextSpot = desk.getCustomerQueuePosition(i);
              waitingCust.moveTo(nextSpot, 'WALKING_TO_RECEPTION');
            }
          }
        }
      }
    }

    // Soft crowd separation: prevents overlapping when walking or waiting
    const custList = Array.from(this.customers.values());
    for (let i = 0; i < custList.length; i++) {
      for (let j = i + 1; j < custList.length; j++) {
        const c1 = custList[i];
        const c2 = custList[j];
        if (c1.state === 'DESPAWNED' || c2.state === 'DESPAWNED') continue;

        const p1 = c1.group.position;
        const p2 = c2.group.position;
        const dx = p1.x - p2.x;
        const dz = p1.z - p2.z;
        const distSq = dx * dx + dz * dz;
        const minDist = 0.50; // 2 x 0.25m character radius

        if (distSq < minDist * minDist && distSq > 0.0001) {
          const dist = Math.sqrt(distSq);
          const overlap = (minDist - dist) * 0.35;
          const nx = dx / dist;
          const nz = dz / dist;
          // Sidestep tangential slide: both rotate to their right relative to each other
          const tx = -nz * 0.35;
          const tz = nx * 0.35;

          if (c1.state !== 'GAMING') {
            p1.x += (nx + tx) * overlap;
            p1.z += (nz + tz) * overlap;
            this.collisionSystem.resolveCollision(p1, 0.26, c1.assignedStation?.id);
          }
          if (c2.state !== 'GAMING') {
            p2.x -= (nx - tx) * overlap;
            p2.z -= (nz - tz) * overlap;
            this.collisionSystem.resolveCollision(p2, 0.26, c2.assignedStation?.id);
          }
        }
      }
    }
  }

  private async trySpawnCustomer() {
    // Only spawn if there is at least one reception counter and at least one gaming station
    if (this.placementSystem.receptionDesks.size === 0 || this.placementSystem.stations.size === 0) {
      return;
    }

    // Do not spawn if room capacity is reached or reception queues are full
    const maxCapacity = Math.max(6, this.placementSystem.stations.size * 2);
    if (this.customers.size >= maxCapacity) {
      return;
    }

    let totalWaiting = 0;
    for (const q of this.deskQueues.values()) {
      totalWaiting += q.length;
    }
    if (totalWaiting >= this.placementSystem.receptionDesks.size * 3) {
      return;
    }

    // Intelligently select the reception desk with the shortest queue
    let bestDesk: ReceptionDesk | null = null;
    let minQueueLen = Infinity;
    for (const desk of this.placementSystem.receptionDesks.values()) {
      const q = this.deskQueues.get(desk.id) || [];
      if (q.length < minQueueLen) {
        minQueueLen = q.length;
        bestDesk = desk;
      }
    }

    if (!bestDesk) return;

    const id = `cust_${Date.now()}_${Math.floor(Math.random() * 100)}`;
    const customer = new Customer(id);

    // Spawn directly at the entrance doorway opening
    const spawnPos = new THREE.Vector3(0, 0, 7.8);
    customer.collisionSystem = this.collisionSystem;
    customer.gridSystem = this.placementSystem.gridSystem;
    customer.getOtherCustomerPositions = () => {
      const positions: THREE.Vector3[] = [];
      for (const other of this.customers.values()) {
        if (other !== customer && other.state !== 'DESPAWNED') {
          positions.push(other.group.position);
        }
      }
      return positions;
    };
    await customer.build(spawnPos);

    this.scene.add(customer.group);
    this.customers.set(id, customer);

    // Revenue callback
    customer.onPayment = (amount, worldPos) => {
      this.economySystem.earn(amount);
      SoundManager.getInstance().playCash();
      if (this.onFloatingText) {
        this.onFloatingText(`+$${amount} 💵`, worldPos, '#10b981');
      }
    };

    // Customer check-in greeting callback (specific to assigned desk's receptionist)
    customer.onCheckIn = (cust) => {
      SoundManager.getInstance().playClick();
      const staff = cust.targetDeskId ? this.receptionists.get(cust.targetDeskId) : this.receptionists.values().next().value;
      if (staff && this.onFloatingText) {
        const greetPos = staff.group.position.clone().add(new THREE.Vector3(0, 2.0, 0));
        this.onFloatingText('Welcome to Zone! ⭐', greetPos, '#38bdf8');
      }
    };

    // Removal callback
    customer.onFinished = (cust) => {
      if (cust.targetDeskId) {
        const q = this.deskQueues.get(cust.targetDeskId);
        if (q) {
          this.deskQueues.set(
            cust.targetDeskId,
            q.filter((c) => c.id !== cust.id)
          );
        }
      }
      this.scene.remove(cust.group);
      this.customers.delete(cust.id);
    };

    // Queue up at the selected reception desk with proper index spacing
    customer.targetDeskId = bestDesk.id;
    customer.targetDesk = bestDesk;
    const q = this.deskQueues.get(bestDesk.id) || [];
    const queueIndex = q.length;
    q.push(customer);
    this.deskQueues.set(bestDesk.id, q);

    const waitSpot = bestDesk.getCustomerQueuePosition(queueIndex);
    customer.moveTo(waitSpot, 'WALKING_TO_RECEPTION');
  }

  public getActiveCustomerCount(): number {
    return this.customers.size;
  }
}
