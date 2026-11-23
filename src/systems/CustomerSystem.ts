import type { Workforce } from './Workforce.ts';
import type { Litter } from '../data/employees.ts';
import * as THREE from 'three';
import { BASE_CHECK_IN_SECONDS } from '../data/simulation.ts';
import { NAVIGATION } from '../data/world-layout.ts';
import { Customer } from '../entities/Customer.ts';
import { PlacementSystem } from './PlacementSystem.ts';
import { EconomySystem } from './EconomySystem.ts';
import { Receptionist } from '../entities/Receptionist.ts';
import type { GamingStation } from '../entities/GamingStation.ts';
import { LoungeOperations } from './LoungeOperations.ts';
import type { Activity } from './LoungeOperations.ts';
import { SoundManager } from '../services/SoundManager.ts';
import { CollisionSystem } from './CollisionSystem.ts';
import { ReceptionDesk } from '../entities/ReceptionDesk.ts';

export class CustomerSystem {
  public getSpawnInterval: () => number = () => 5;
  public onCustomerServed?: () => void;
  private admissionTimer = 0;
  private spawning = false;
  private preferFacility = false;
  private nextFacility = 0;
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
  public getCashierMultiplier: (desk: ReceptionDesk) => number = () => 1;
  private serviceTimers = new Map<string, { customerId: string; elapsed: number }>();
  private observedLayout = -1;
  private deskLayouts = new Map<string, string>();
  private waitTimers = new Map<string, number>();
  private spawnTimer: number = 0;
  private spawnInterval: number = 5.0; // seconds

  public readonly player = new Receptionist();
  public workforce?: Workforce;
  public readonly operations = new LoungeOperations();
  public hasPerformancePart = (_stationId: string) => false;
  public pending: Customer[] = [];
  private requests = 0;
  private waitTotals = new Map<string, number>();
  private playerCheckingIn = false;
  private readonly counterProgress = new Map<string, number>();

  public onFloatingText?: (text: string, worldPos: THREE.Vector3, color?: string) => void;

  constructor(scene: THREE.Scene, placementSystem: PlacementSystem, economySystem: EconomySystem) {
    this.scene = scene;
    this.placementSystem = placementSystem;
    this.economySystem = economySystem;
    this.collisionSystem = placementSystem.collisionSystem;
    placementSystem.getCustomerBodies = () => {
      const bodies = [...this.customers.values()].filter((customer) => customer.state !== 'DESPAWNED')
        .map((customer) => ({ x: customer.group.position.x, z: customer.group.position.z, stationId: customer.assignedStation?.id }));
      if (this.player.enabled) bodies.push({ x: this.player.group.position.x, z: this.player.group.position.z, stationId: undefined });
      for (const worker of this.workforce?.workers.values() ?? []) {
        const {x,z} = worker.avatar.group.position;
        bodies.push({x,z,stationId:undefined});
      }
      return bodies;
    };
  }

  public async setupReceptionist(saved?: { x: number; z: number }) {
    await this.player.build(this.scene);
    const desk = this.placementSystem.receptionDesks.values().next().value;
    const marker = desk?.getStaffPosition() ?? new THREE.Vector3(0, 0, NAVIGATION.insideZ);
    const candidates = [marker.clone().add(new THREE.Vector3(.72, 0, -.72)), marker, new THREE.Vector3(0, 0, NAVIGATION.insideZ)];
    if (saved) candidates.unshift(new THREE.Vector3(saved.x, 0, saved.z));
    const spawn = candidates.find(p => p.z <= this.collisionSystem.roomBounds.maxZ - .23 && !this.collisionSystem.isPointBlocked(p.x,p.z,.23));
    this.player.group.position.copy(spawn ?? marker);
  }

  public get activeDesk() {
    if (!this.player.enabled || !this.player.onDuty) return undefined;
    return [...this.placementSystem.receptionDesks.values()].find(desk => desk.group.visible && !desk.isUpgrading &&
      this.player.group.position.distanceTo(desk.getStaffPosition()) <= .51);
  }

  private available(station: GamingStation) {
    return station.group.visible && !station.serviceOwner && !station.isUpgrading && !station.isOccupied && !station.needsService && !station.accessIssue;
  }

  public assignStation(station: GamingStation): boolean {
    const head = this.pending[0];
    return !!head && this.dispatchGuest(head, station);
  }

  private dispatchGuest(head: Customer, station: GamingStation): boolean {
    if (!this.available(station)) return false;
    // A seated visitor starts its next route from the accessible side of the sofa.
    const destination = station.getApproachWorldPosition();
    const start = head.facility?.getApproachPosition() ?? head.group.position;
    if (!this.placementSystem.gridSystem.findPath(start, destination, this.collisionSystem.createNavigationQuery()).length) return false;
    head.dispatch(station, head.wantsPerformance && this.hasPerformancePart(station.id));
    this.pending.splice(this.pending.indexOf(head), 1);
    this.recordWait(head);
    if (head.targetDesk) this.removeFromCounter(head, head.targetDesk);
    return true;
  }

  private recordWait(customer: Customer) {
    if (this.waitTotals.has(customer.id)) {
      this.operations.shift.waitSamples++;
      this.operations.shift.waitSeconds += this.waitTotals.get(customer.id)!;
    }
    this.waitTotals.delete(customer.id);
    this.waitTimers.delete(customer.id);
  }

  private removeFromCounter(customer: Customer, desk: ReceptionDesk) {
    const queue = this.deskQueues.get(desk.id) ?? [];
    const index = queue.indexOf(customer);
    if (index >= 0) { queue.splice(index, 1); this.advanceQueue(desk); }
  }

  public activities(): Activity[] {
    const rows: Activity[] = [...this.operations.tasks.values(), ...(this.workforce?.activities() ?? [])];
    for (const c of this.customers.values()) {
      if (['LEAVING','DESPAWNED','UNSEATING'].includes(c.state)) continue;
      const type = c.facility?.type;
      const labels = { sofa: 'Sofa', vending: 'Drink', arcade: 'Arcade' };
      let label = c.waitingForPc ? 'Waiting for a PC' : type ? labels[type] : c.wantsPerformance ? 'Performance PC' : 'PC';
      let progress = c.operationProgress;
      if (c.state === 'WALKING_TO_BIN' || c.state === 'USING_BIN') label='Using bin';
      if (c.state === 'GAMING') label = c.performanceBonus ? 'Gaming +25%' : 'Gaming';
      if (c.state === 'WAITING_OUTSIDE' || c.state === 'WALKING_FROM_BUS') label = 'Bus queue';
      if (c.state === 'WAITING_CHECKIN' && c.targetDesk) {
        const timer = this.serviceTimers.get(c.targetDesk.id);
        if (timer?.customerId === c.id) {
          label = this.counterProgress.has(c.targetDesk.id) ? 'Check-in' : timer.elapsed ? 'Check-in paused' : 'Awaiting check-in';
          progress = timer.elapsed * c.targetDesk.currentTier.checkInMultiplier / BASE_CHECK_IN_SECONDS;
        }
      }
      const waited = this.waitTimers.get(c.id);
      rows.push({ id: c.id, position: c.group.position, label, progress,
        patience: waited === undefined ? undefined : Math.max(0, 1-waited/(c.state === 'WAITING_OUTSIDE' ? 30 : 60)) });
    }
    return rows;
  }

  public async spawnInitialCustomer() {
    await this.trySpawnCustomer();
  }

  public getCheckInSeconds(desk: ReceptionDesk): number {
    return BASE_CHECK_IN_SECONDS / (desk.currentTier.checkInMultiplier * this.getCashierMultiplier(desk));
  }

  private advanceQueue(desk: ReceptionDesk): void {
    const queue = this.deskQueues.get(desk.id) ?? [];
    queue.forEach((customer, index) => {
      if (!customer.waitingForPc) customer.moveTo(desk.getCustomerQueuePosition(index), 'WALKING_TO_RECEPTION');
    });
    this.serviceTimers.delete(desk.id);
  }

  public update(deltaTime: number): void {
    this.player.update(deltaTime, this.collisionSystem, this.playerCheckingIn);
    const counter = this.activeDesk;
    this.playerCheckingIn = false;
    this.counterProgress.clear();
    const layoutChanged = this.observedLayout !== this.placementSystem.layoutRevision;
    this.observedLayout = this.placementSystem.layoutRevision;
    for (const desk of this.placementSystem.receptionDesks.values()) {
      const layout = `${desk.gridX}:${desk.gridZ}:${desk.rotationIndex}:${desk.group.visible}`;
      if (layoutChanged && desk.group.visible) {
        if (this.deskLayouts.get(desk.id) !== layout) {
          this.advanceQueue(desk);
          for (const [index, guest] of (this.deskQueues.get(desk.id) ?? []).entries()) {
            if (guest.waitingForPc) guest.moveTo(desk.getCustomerQueuePosition(index), 'WALKING_TO_RECEPTION');
          }
        }
        else (this.deskQueues.get(desk.id) ?? []).forEach((customer, index) => {
          if (customer.state === 'WALKING_TO_RECEPTION') customer.moveTo(desk.getCustomerQueuePosition(index), 'WALKING_TO_RECEPTION');
        });
      }
      this.deskLayouts.set(desk.id, layout);
    }
    this.spawnTimer += deltaTime;
    if (this.spawnTimer >= Math.min(this.spawnInterval, this.getSpawnInterval())) {
      this.spawnTimer = 0; void this.trySpawnCustomer();
    }
    for (const customer of this.customers.values()) {
      const queued = customer.state === 'WALKING_TO_RECEPTION' || customer.state === 'WAITING_CHECKIN';
      if (queued && customer.targetDesk && !customer.targetDesk.group.visible) continue;
      customer.update(deltaTime);
      if (customer.state === 'WAITING_CHECKIN' || customer.state === 'WAITING_OUTSIDE' || customer.waitingForPc) {
        const waited = (this.waitTimers.get(customer.id) ?? 0) + deltaTime * (this.workforce?.patienceRate(customer.group.position) ?? 1);
        this.waitTimers.set(customer.id, waited);
        this.waitTotals.set(customer.id, (this.waitTotals.get(customer.id) ?? 0) + deltaTime);
        if (waited > (customer.state === 'WAITING_OUTSIDE' ? 30 : 60)) {
          this.operations.shift.lost++;
          this.pending = this.pending.filter(c => c !== customer);
          this.recordWait(customer);
          customer.leave();
        }
      }
    }
    this.admissionTimer += deltaTime;
    if (this.admissionTimer >= .5) {
      this.admissionTimer = 0;
      this.inviteWaitingGuests(counter);
      const next = this.firstWaitingOutside();
      if (next && this.hasLoungeSpace() && this.assignVisit(next)) this.waitTimers.delete(next.id);
    }
    for (const desk of this.placementSystem.receptionDesks.values()) {
      const old = this.deskQueues.get(desk.id) ?? [];
      const queue = old.filter((customer) => ['WALKING_TO_RECEPTION', 'WAITING_CHECKIN', 'WAITING_PC'].includes(customer.state));
      this.deskQueues.set(desk.id, queue);
      if (!desk.group.visible) continue;
      if (queue.length !== old.length) this.advanceQueue(desk);
      const head = queue[0];
      if (!head || head.state !== 'WAITING_CHECKIN' || desk.isUpgrading) { this.serviceTimers.delete(desk.id); continue; }
      let timer = this.serviceTimers.get(desk.id);
      if (!timer || timer.customerId !== head.id) { timer = { customerId: head.id, elapsed: 0 }; this.serviceTimers.set(desk.id, timer); }
      const receptionist = this.workforce?.receptionistAt(desk);
      if (counter !== desk && !receptionist) continue;
      if (counter === desk) {
        this.playerCheckingIn = true;
        this.player.group.rotation.y = desk.group.rotation.y;
      }
      timer.elapsed += deltaTime * this.getCashierMultiplier(desk);
      const progress = timer.elapsed * desk.currentTier.checkInMultiplier / BASE_CHECK_IN_SECONDS;
      this.counterProgress.set(desk.id, Math.min(1,progress));
      if (progress < 1) continue;
      this.workforce?.checkedIn(desk);
      head.waitingForPc = true;
      head.state = 'WAITING_PC';
      this.pending.push(head);
      this.serviceTimers.delete(desk.id);
      this.onFloatingText?.('Checked in', desk.group.position, '#50f2cf');
    }
    for (const guest of [...this.pending]) {
      if (!guest.targetDesk || !this.workforce?.receptionistAt(guest.targetDesk)) continue;
      const stations = [...this.placementSystem.stations.values()].filter(station => this.available(station));
      if (!stations.length) break;
      if (guest.wantsPerformance) stations.sort((a,b) => Number(this.hasPerformancePart(b.id))-Number(this.hasPerformancePart(a.id)));
      stations.some(station => this.dispatchGuest(guest, station));
    }
    const openPc = [...this.placementSystem.stations.values()].some(station => this.available(station));
    for (const customer of this.pending) {
      if (customer.state !== 'WAITING_PC' || !customer.targetDesk || (openPc && customer === this.pending[0])) continue;
      const sofa = [...this.placementSystem.facilities.values()].find(f => f.type === 'sofa' && customer.visitFacility(f));
      if (sofa) this.removeFromCounter(customer, customer.targetDesk);
    }
    for (const station of this.placementSystem.stations.values()) station.assignable = !!this.pending.length && this.available(station);
    this.operations.update(deltaTime, this.placementSystem, this.player.enabled && this.player.onDuty && !this.playerCheckingIn ? this.player.group.position : undefined);
    this.workforce?.update(deltaTime, this.counterProgress);
  }

  private inviteWaitingGuests(playerDesk?: ReceptionDesk): void {
    for (const desk of this.placementSystem.receptionDesks.values()) {
      if (!this.workforce?.receptionistAt(desk) || this.deskQueues.get(desk.id)?.length) continue;
      for (const other of this.placementSystem.receptionDesks.values()) {
        if (!other.group.visible || other === playerDesk || this.workforce.receptionistAt(other)) continue;
        const guest = this.deskQueues.get(other.id)?.[0];
        if (guest?.state !== 'WAITING_CHECKIN' || this.serviceTimers.get(other.id)?.elapsed) continue;
        const route = guest.pathTo(desk.getCustomerQueuePosition());
        if (!route.length) continue;
        this.removeFromCounter(guest,other);
        guest.targetDesk = desk;
        guest.targetDeskId = desk.id;
        this.deskQueues.set(desk.id,[guest]);
        guest.setWaypoints(route,'WALKING_TO_RECEPTION');
        break;
      }
    }
  }

  private async trySpawnCustomer() {
    if (this.spawning) return;
    this.spawning = true;
    try { await this.spawnCustomer(); }
    catch (error) { console.warn('An original customer could not be prepared; arrival will retry.', error); }
    finally { this.spawning = false; }
  }

  private firstWaitingOutside(): Customer | undefined {
    return [...this.customers.values()].find((customer) => customer.state === 'WAITING_OUTSIDE');
  }

  private hasLoungeSpace(): boolean {
    let visitors = 0;
    for (const customer of this.customers.values()) {
      if (customer.state === 'WALKING_FROM_BUS' || customer.state === 'WAITING_OUTSIDE') continue;
      if (customer.state === 'LEAVING' && customer.group.position.z > NAVIGATION.doorZ) continue;
      visitors++;
    }
    return visitors < Math.max(6, this.placementSystem.stations.size * 2);
  }

  private async spawnCustomer(): Promise<void> {
    if (!this.hasLoungeSpace() || this.firstWaitingOutside()) return;
    if (!this.placementSystem.facilities.size && !(this.placementSystem.stations.size && this.placementSystem.receptionDesks.size)) return;
    const x = Math.random() > .5 ? NAVIGATION.spawnLeft : NAVIGATION.spawnRight;
    const customer = await this.createCustomer('cust', new THREE.Vector3(x, .04, NAVIGATION.sidewalkZ));
    if (!this.hasLoungeSpace() || !this.assignVisit(customer)) { customer.dispose(); return; }
    this.addCustomer(customer);
  }

  public async spawnBusPassenger(index: number): Promise<void> {
    const curb = new THREE.Vector3(NAVIGATION.busX - 1.55, .04, 19.12);
    const customer = await this.createCustomer('bus', curb);
    const side = index % 2 === 0 ? -1 : 1;
    const laneX = NAVIGATION.doorX + side * .43;
    const waitX = NAVIGATION.doorX + side * (1.35 + Math.floor(index / 2) * .74);
    customer.setWaypoints([
      new THREE.Vector3(laneX, 0, NAVIGATION.busStopZ + side * .34),
      new THREE.Vector3(laneX, 0, NAVIGATION.sidewalkZ),
      new THREE.Vector3(waitX, 0, NAVIGATION.sidewalkZ),
      new THREE.Vector3(waitX, 0, NAVIGATION.sidewalkZ - .78)
    ], 'WALKING_FROM_BUS');
    this.addCustomer(customer);
  }

  private async createCustomer(prefix: string, position: THREE.Vector3): Promise<Customer> {
    const customer = new Customer(`${prefix}_${crypto.randomUUID()}`);
    customer.collisionSystem = this.collisionSystem;
    customer.gridSystem = this.placementSystem.gridSystem;
    await customer.build(position);
    return customer;
  }

  private assignVisit(customer: Customer): boolean {
    let bestDesk: ReceptionDesk | undefined;
    let deskRoute: THREE.Vector3[] = [];
    let bestScore = Infinity;
    const playerDesk = this.activeDesk;
    if (this.placementSystem.stations.size) {
      for (const desk of this.placementSystem.receptionDesks.values()) {
        const length = this.deskQueues.get(desk.id)?.length ?? 0;
        if (!desk.group.visible || desk.isUpgrading || length >= 3) continue;
        const score = length + (desk === playerDesk || this.workforce?.receptionistAt(desk) ? 0 : 3);
        if (score >= bestScore) continue;
        const route = customer.pathTo(desk.getCustomerQueuePosition(length));
        if (!route.length) continue;
        bestDesk = desk; bestScore = score; deskRoute = route;
      }
    }
    if (this.preferFacility || !bestDesk) {
      const facilities = [...this.placementSystem.facilities.values()];
      for (let offset = 0; offset < facilities.length; offset++) {
        const index = (this.nextFacility + offset) % facilities.length;
        if (!customer.visitFacility(facilities[index])) continue;
        this.nextFacility = (index + 1) % facilities.length;
        this.preferFacility = false;
        return true;
      }
    }
    if (!bestDesk) return false;
    customer.setWaypoints(deskRoute, 'WALKING_TO_RECEPTION');
    customer.wantsPerformance = ++this.requests % 3 === 0;
    customer.targetDeskId = bestDesk.id;
    customer.targetDesk = bestDesk;
    const queue = this.deskQueues.get(bestDesk.id) ?? [];
    queue.push(customer);
    this.deskQueues.set(bestDesk.id, queue);
    this.preferFacility = true;
    return true;
  }

  private addCustomer(customer: Customer): void {
    this.scene.add(customer.group);
    this.customers.set(customer.id, customer);
    const waste = (kind: Litter['kind'], origin?: THREE.Vector3) => {
      if (!this.workforce || !origin) return;
      const bin = kind === 'spill' ? undefined : this.workforce.nearbyBin(origin);
      if (bin && Math.random()<.78) customer.binStop = bin;
      else this.workforce.drop(kind,origin);
    };
    customer.onSofaFinished = () => {
      waste('wrapper',customer.facility?.getApproachPosition());
      this.operations.shift.served++; this.recordWait(customer);
    };
    // Revenue callback
    customer.onPayment = (amount, worldPos) => {
      this.economySystem.earn(amount);
      waste('cup',customer.assignedStation?.getApproachWorldPosition());
      this.operations.shift.pc += amount;
      this.operations.shift.served++;
      this.onCustomerServed?.();
      SoundManager.getInstance().playCash();
      if (this.onFloatingText) {
        this.onFloatingText(`+$${amount} 💵`, worldPos, '#10b981');
      }
    };
    customer.onFacilityPayment = (amount, facility) => {
      this.economySystem.earn(amount);
      SoundManager.getInstance().playCash();
      this.operations.shift.served++;
      this.recordWait(customer);
      const arcade = facility.type === 'arcade';
      waste(arcade ? 'wrapper' : Math.random()<.3 ? 'spill' : 'cup',facility.getApproachPosition());
      this.operations.shift[arcade ? 'arcade' : 'vending'] += amount;
      this.onFloatingText?.(`+$${amount} ${arcade ? '🕹️' : '🥤'}`,
        facility.group.position.clone().add(new THREE.Vector3(0, 1.8, 0)), arcade ? '#c084fc' : '#34d399');
    };

    customer.onRouteFailed = (cust) => {
      this.pending = this.pending.filter(c => c !== cust);
      if (cust.waitingForPc || cust.state === 'WALKING_TO_RECEPTION') {
        this.operations.shift.lost++;
        this.recordWait(cust);
      }
      cust.leave();
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
      this.waitTimers.delete(cust.id);
      this.waitTotals.delete(cust.id);
      this.pending = this.pending.filter(c => c !== cust);
      this.scene.remove(cust.group);
      this.customers.delete(cust.id);
      cust.dispose();
    };
  }

  public getActiveCustomerCount(): number {
    return this.customers.size;
  }
}
