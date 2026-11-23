import { RECEPTIONIST_CHARACTER } from '../data/characters.ts';
import { applyCharacterAppearance, randomCharacterAppearance } from '../characters/CharacterAppearance.ts';
import * as THREE from 'three';
import { BASE_CHECK_IN_SECONDS } from '../data/simulation.ts';
import { NAVIGATION } from '../data/world-layout.ts';
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
  public getSpawnInterval: () => number = () => 5;
  public onCustomerServed?: () => void;
  private busVisitors = 0;
  private spawning = false;
  public queueBusArrival(): void { this.busVisitors = Math.min(6, this.busVisitors + 3); }
  public getCrossingCount(): number {
    return [...this.customers.values()].filter((customer) => customer.group.position.z > 12.8 && customer.group.position.z < 18.8).length;
  }
  public getStreetCount(): number {
    return [...this.customers.values()].filter((customer) => customer.group.position.z > NAVIGATION.doorZ).length;
  }
  private scene: THREE.Scene;
  private placementSystem: PlacementSystem;
  private economySystem: EconomySystem;
  public collisionSystem: CollisionSystem;

  private customers: Map<string, Customer> = new Map();
  // Multi-desk queues (keyed by deskId)
  private deskQueues: Map<string, Customer[]> = new Map();
  public getCashierMultiplier: () => number = () => 1;
  private serviceTimers = new Map<string, { customerId: string; elapsed: number }>();
  private observedLayout = -1;
  private deskLayouts = new Map<string, string>();
  private waitTimers = new Map<string, number>();
  private spawnTimer: number = 0;
  private spawnInterval: number = 5.0; // seconds

  // Multi-Receptionist Registry (keyed by deskId)
  public receptionists: Map<string, ReceptionistStaff> = new Map();
  private receptionistLoads = new Map<string, Promise<void>>();

  public onFloatingText?: (text: string, worldPos: THREE.Vector3, color?: string) => void;

  constructor(scene: THREE.Scene, placementSystem: PlacementSystem, economySystem: EconomySystem) {
    this.scene = scene;
    this.placementSystem = placementSystem;
    this.economySystem = economySystem;
    this.collisionSystem = placementSystem.collisionSystem;
    placementSystem.getCustomerBodies = () => [...this.customers.values()].filter((customer) => customer.state !== 'DESPAWNED')
      .map((customer) => ({ x: customer.group.position.x, z: customer.group.position.z, stationId: customer.assignedStation?.id }));
  }

  public setupReceptionistForDesk(desk: ReceptionDesk): Promise<void> {
    const existing = this.receptionists.get(desk.id);
    if (existing) {
      existing.group.position.copy(desk.getStaffPosition()); existing.group.rotation.y = desk.group.rotation.y;
      return Promise.resolve();
    }
    const pending = this.receptionistLoads.get(desk.id);
    if (pending) return pending;
    const loading = this.createReceptionistForDesk(desk).finally(() => { this.receptionistLoads.delete(desk.id); });
    this.receptionistLoads.set(desk.id, loading);
    return loading;
  }

  private async createReceptionistForDesk(desk: ReceptionDesk) {
    const assetMgr = AssetManager.getInstance();

    // If a staff member already exists for this desk, remove it first
    const existing = this.receptionists.get(desk.id);
    if (existing) {
      existing.group.position.copy(desk.getStaffPosition());
      existing.group.rotation.y = desk.group.rotation.y;
      return;
    }

    // Original uniform, face and gesture rig, authored in metres.
    const receptionistModel = await assetMgr.loadRequiredModel(RECEPTIONIST_CHARACTER.gamePath);
    applyCharacterAppearance(receptionistModel, randomCharacterAppearance(RECEPTIONIST_CHARACTER.gender, 'receptionist'));

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

    const animations = (receptionistModel.userData.animations as THREE.AnimationClip[]) ?? [];
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
        ) ||
        animations.find((a) => a.name.toLowerCase().includes('standing')) ||
        animations[0];
      const clapClip = animations.find((a) => a.name.toLowerCase().includes('clap'));
      const waveClip = animations.find((a) => a.name.toLowerCase().includes('wave')) || clapClip;
      const interactClip = animations.find((a) => a.name === 'CheckIn') || clapClip;

      if (idleClip) idleAction = mixer.clipAction(idleClip);
      if (waveClip) waveAction = mixer.clipAction(waveClip);
      if (interactClip) interactAction = mixer.clipAction(interactClip);

      idleAction?.play();
      mixer.addEventListener('finished', (event) => {
        if (event.action === waveAction || event.action === interactAction) {
          event.action.fadeOut(.15); idleAction?.reset().fadeIn(.15).play();
        }
      });
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

  public getCheckInSeconds(desk: ReceptionDesk): number {
    return BASE_CHECK_IN_SECONDS / (desk.currentTier.checkInMultiplier * this.getCashierMultiplier());
  }

  private advanceQueue(desk: ReceptionDesk): void {
    const queue = this.deskQueues.get(desk.id) ?? [];
    queue.forEach((customer, index) => customer.moveTo(desk.getCustomerQueuePosition(index), 'WALKING_TO_RECEPTION'));
    this.serviceTimers.delete(desk.id);
  }

  public update(deltaTime: number): void {
    const layoutChanged = this.observedLayout !== this.placementSystem.layoutRevision;
    this.observedLayout = this.placementSystem.layoutRevision;
    for (const desk of this.placementSystem.receptionDesks.values()) {
      const staff = this.receptionists.get(desk.id);
      if (staff) {
        staff.group.visible = desk.group.visible;
        staff.group.position.copy(desk.getStaffPosition()); staff.group.rotation.y = desk.group.rotation.y;
        staff.mixer.update(deltaTime);
      }
      const layout = `${desk.gridX}:${desk.gridZ}:${desk.rotationIndex}:${desk.group.visible}`;
      if (layoutChanged && desk.group.visible) {
        if (this.deskLayouts.get(desk.id) !== layout) this.advanceQueue(desk);
        else (this.deskQueues.get(desk.id) ?? []).forEach((customer, index) => {
          if (customer.state === 'WALKING_TO_RECEPTION') customer.moveTo(desk.getCustomerQueuePosition(index), 'WALKING_TO_RECEPTION');
        });
      }
      this.deskLayouts.set(desk.id, layout);
    }
    this.spawnTimer += deltaTime;
    if (this.spawnTimer >= Math.min(this.spawnInterval, this.busVisitors ? 1 : this.getSpawnInterval())) {
      this.spawnTimer = 0; void this.trySpawnCustomer();
    }
    for (const customer of this.customers.values()) {
      const queued = customer.state === 'WALKING_TO_RECEPTION' || customer.state === 'WAITING_CHECKIN';
      if (queued && customer.targetDesk && !customer.targetDesk.group.visible) continue;
      customer.update(deltaTime);
      if (customer.state === 'WAITING_CHECKIN') {
        const waited = (this.waitTimers.get(customer.id) ?? 0) + deltaTime;
        this.waitTimers.set(customer.id, waited);
        if (waited > 60) { this.waitTimers.delete(customer.id); customer.leave(); }
      }
    }
    for (const desk of this.placementSystem.receptionDesks.values()) {
      const old = this.deskQueues.get(desk.id) ?? [];
      const queue = old.filter((customer) => ['WALKING_TO_RECEPTION', 'WAITING_CHECKIN'].includes(customer.state));
      this.deskQueues.set(desk.id, queue);
      if (!desk.group.visible) continue;
      if (queue.length !== old.length) this.advanceQueue(desk);
      const head = queue[0];
      if (!head || head.state !== 'WAITING_CHECKIN' || desk.isUpgrading) { this.serviceTimers.delete(desk.id); continue; }
      let timer = this.serviceTimers.get(desk.id);
      if (!timer || timer.customerId !== head.id) { timer = { customerId: head.id, elapsed: 0 }; this.serviceTimers.set(desk.id, timer); }
      timer.elapsed += deltaTime;
      if (timer.elapsed < this.getCheckInSeconds(desk)) continue;
      const station = [...this.placementSystem.stations.values()].find((candidate) => candidate.group.visible && !candidate.isUpgrading &&
        !candidate.isOccupied && !candidate.accessIssue && head.pathTo(candidate.getApproachWorldPosition()).length > 0);
      if (!station) continue;
      head.assignedStation = station; station.isOccupied = true; station.currentGamerId = head.id;
      head.moveTo(station.getApproachWorldPosition(), 'WALKING_TO_STATION');
      queue.shift(); this.waitTimers.delete(head.id);
      this.advanceQueue(desk);
    }
  }

  private async trySpawnCustomer() {
    if (this.spawning) return;
    this.spawning = true;
    try { await this.spawnCustomer(); }
    catch (error) { console.warn('An original customer could not be prepared; arrival will retry.', error); }
    finally { this.spawning = false; }
  }

  private async spawnCustomer() {
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
      if (desk.group.visible && q.length < 3 && q.length < minQueueLen && this.placementSystem.routeTo(desk.getCustomerQueuePosition(q.length)).length) {
        minQueueLen = q.length;
        bestDesk = desk;
      }
    }

    if (!bestDesk) return;

    const id = `cust_${Date.now()}_${Math.floor(Math.random() * 100)}`;
    const customer = new Customer(id);

    // Spawn outside on the exterior city sidewalk
    const isLeft = Math.random() > 0.5;
    const fromBus = this.busVisitors > 0;
    const spawnX = fromBus ? NAVIGATION.busX : isLeft ? NAVIGATION.spawnLeft : NAVIGATION.spawnRight;
    const spawnPos = new THREE.Vector3(spawnX, 0.04, fromBus ? NAVIGATION.busStopZ : NAVIGATION.sidewalkZ);

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

    if (!bestDesk.group.visible || (this.deskQueues.get(bestDesk.id)?.length ?? 0) >= 3) return;
    this.scene.add(customer.group);
    this.customers.set(id, customer);
    if (fromBus) this.busVisitors--;

    // Revenue callback
    customer.onPayment = (amount, worldPos) => {
      this.economySystem.earn(amount);
      this.onCustomerServed?.();
      SoundManager.getInstance().playCash();
      if (this.onFloatingText) {
        this.onFloatingText(`+$${amount} 💵`, worldPos, '#10b981');
      }
    };

    // Customer check-in greeting callback (specific to assigned desk's receptionist)
    customer.onCheckIn = (cust) => {
      SoundManager.getInstance().playClick();
      const receptionist = cust.targetDeskId ? this.receptionists.get(cust.targetDeskId) : undefined;
      const gesture = receptionist?.interactAction ?? receptionist?.waveAction;
      if (gesture) {
        receptionist?.idleAction?.fadeOut(.15);
        gesture.reset().setLoop(THREE.LoopOnce, 1).fadeIn(.15).play();
        gesture.clampWhenFinished = true;
      }
      const staff = cust.targetDeskId ? this.receptionists.get(cust.targetDeskId) : this.receptionists.values().next().value;
      if (staff && this.onFloatingText) {
        const greetPos = staff.group.position.clone().add(new THREE.Vector3(0, 2.0, 0));
        this.onFloatingText('Welcome to Zone! ⭐', greetPos, '#38bdf8');
      }
    };

    customer.onRouteFailed = (cust) => { cust.leave(); };

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
      this.waitTimers.delete(cust.id);
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
    const insidePath = this.placementSystem.routeTo(waitSpot);
    if (!insidePath.length) { customer.leave(); return; }
    customer.setWaypoints([
      ...(fromBus ? [new THREE.Vector3(NAVIGATION.doorX, 0, NAVIGATION.busStopZ)] : []),
      new THREE.Vector3(NAVIGATION.doorX, 0, NAVIGATION.sidewalkZ),
      new THREE.Vector3(NAVIGATION.doorX, 0, NAVIGATION.doorZ), ...insidePath
    ], 'WALKING_TO_RECEPTION');
  }

  public getActiveCustomerCount(): number {
    return this.customers.size;
  }
}
