import * as THREE from 'three';
import { NAVIGATION } from '../data/world-layout.ts';
import { AssetManager } from '../services/AssetManager.ts';
import { GamingStation } from './GamingStation.ts';
import { CollisionSystem } from '../systems/CollisionSystem.ts';
import { CUSTOMER_RADIUS, NAVIGATION_RADIUS, SECONDS_PER_GAME_HOUR } from '../data/simulation.ts';
import type { ReceptionDesk } from './ReceptionDesk.ts';
import { GridSystem } from '../systems/GridSystem.ts';

export type CustomerState =
  | 'SPAWNING'
  | 'WALKING_TO_RECEPTION'
  | 'WAITING_CHECKIN'
  | 'WALKING_TO_STATION'
  | 'SEATING'
  | 'UNSEATING'
  | 'GAMING'
  | 'LEAVING'
  | 'DESPAWNED';

export const MEN_CHARACTER_MODELS = [
  '/assets/models/characters/men/Man.glb',
  '/assets/models/characters/men/Man in Long Sleeves.glb',
  '/assets/models/characters/men/Man in Suit.glb',
  '/assets/models/characters/men/Man-fjHyMd5Wxw.glb'
];

export const WOMEN_CHARACTER_MODELS = [
  '/assets/models/characters/women/Woman.glb',
  '/assets/models/characters/women/Woman Casual.glb',
  '/assets/models/characters/women/Woman in Dress.glb',
  '/assets/models/characters/women/Woman in Tank Top.glb'
];

export const CUSTOMER_CHARACTER_MODELS = [
  ...MEN_CHARACTER_MODELS,
  ...WOMEN_CHARACTER_MODELS
];

export class Customer {
  public readonly id: string;
  public group: THREE.Group = new THREE.Group();
  public state: CustomerState = 'SPAWNING';
  public isMale: boolean = true;

  public assignedStation?: GamingStation;
  public targetDeskId?: string;
  public targetDesk?: ReceptionDesk;
  public gamingDuration: number = 20; // seconds
  private gamingTimer: number = 0;

  private targetPosition: THREE.Vector3 = new THREE.Vector3();
  private waypoints: THREE.Vector3[] = [];
  private currentWaypointIndex: number = 0;
  private walkSpeed: number = 2.2; // meters per second
  private stuckTimer: number = 0;
  private bestRemaining = Infinity;
  private routeRetries = 0;
  private journeyTime = 0;
  private transitionTimer = 0;
  private transitionStart = new THREE.Vector3();
  private exitX: number = NAVIGATION.exitRight;
  public onRouteFailed?: (customer: Customer) => void;

  public collisionSystem?: CollisionSystem;
  public gridSystem?: GridSystem;
  public getOtherCustomerPositions?: () => THREE.Vector3[];

  // Animation mixer and actions
  private mixer?: THREE.AnimationMixer;
  private walkAction?: THREE.AnimationAction;
  private idleAction?: THREE.AnimationAction;
  private sitAction?: THREE.AnimationAction;
  private clapAction?: THREE.AnimationAction;
  private interactAction?: THREE.AnimationAction;
  private waveAction?: THREE.AnimationAction;
  private currentAction?: THREE.AnimationAction;

  public onPayment?: (amount: number, worldPos: THREE.Vector3) => void;
  public onFinished?: (customer: Customer) => void;
  public onCheckIn?: (customer: Customer) => void;

  constructor(id: string) {
    this.id = id;
    this.group.name = `Customer_${id}`;
  }

  public async build(spawnPos: THREE.Vector3, customModelUrl?: string) {
    const assetMgr = AssetManager.getInstance();

    // 50/50 gender selection if not specified
    const pickMale = Math.random() > 0.5;
    const modelUrl =
      customModelUrl ||
      (pickMale
        ? MEN_CHARACTER_MODELS[Math.floor(Math.random() * MEN_CHARACTER_MODELS.length)]
        : WOMEN_CHARACTER_MODELS[Math.floor(Math.random() * WOMEN_CHARACTER_MODELS.length)]);

    this.isMale = modelUrl.includes('/men/');

    const model = await assetMgr.loadModel(modelUrl);
    // Scale new human models to 0.30 to naturally fit gaming chairs, desks, armrests and environment
    model.scale.setScalar(0.30);

    // Ensure all submeshes have shadows and avoid frustum culling disappearance
    model.traverse((child) => {
      if ((child as THREE.SkinnedMesh).isSkinnedMesh) {
        child.frustumCulled = false;
        child.castShadow = true;
      }
    });

    this.group.add(model);
    this.group.position.copy(spawnPos);
    this.targetPosition.copy(spawnPos);

    // Prioritize model's own native animations (which match its exact skeleton, joints, and proportions)
    let animations = (model.userData.animations as THREE.AnimationClip[]) || [];
    if (!animations || animations.length === 0) {
      const fallbackClips = this.isMale
        ? await assetMgr.loadMenAnimations()
        : await assetMgr.loadWomenAnimations();
      animations = fallbackClips.map((c) => assetMgr.sanitizeClip(c, false));
    }

    if (animations && animations.length > 0) {
      this.mixer = new THREE.AnimationMixer(model);

      const walkClip = animations.find((a) => a.name.toLowerCase().includes('walk'));
      const idleClip =
        animations.find(
          (a) =>
            a.name.toLowerCase().includes('idle') &&
            !a.name.toLowerCase().includes('gun') &&
            !a.name.toLowerCase().includes('sword')
        ) ||
        animations.find((a) => a.name.toLowerCase().includes('standing')) ||
        animations[0];
      const sitClip = animations.find((a) => a.name.toLowerCase().includes('sit'));
      const clapClip = animations.find((a) => a.name.toLowerCase().includes('clap'));
      const waveClip = animations.find((a) => a.name.toLowerCase().includes('wave')) || clapClip;
      const interactClip = animations.find((a) => a.name.toLowerCase().includes('interact')) || sitClip;

      if (walkClip) this.walkAction = this.mixer.clipAction(walkClip);
      if (idleClip) this.idleAction = this.mixer.clipAction(idleClip);
      if (sitClip) this.sitAction = this.mixer.clipAction(sitClip);
      if (clapClip) this.clapAction = this.mixer.clipAction(clapClip);
      if (waveClip) this.waveAction = this.mixer.clipAction(waveClip);
      if (interactClip) this.interactAction = this.mixer.clipAction(interactClip);

      this.playAction(this.walkAction || this.idleAction);
    }
  }

  public playAction(action?: THREE.AnimationAction) {
    if (!action || action === this.currentAction) return;

    if (this.currentAction) {
      this.currentAction.fadeOut(0.2);
    }

    action.reset().fadeIn(0.2).play();
    this.currentAction = action;
  }

  public pathTo(destination: THREE.Vector3): THREE.Vector3[] {
    const position = this.group.position;
    const inside = new THREE.Vector3(NAVIGATION.doorX, 0, NAVIGATION.insideZ);
    const query = this.collisionSystem?.createNavigationQuery(NAVIGATION_RADIUS);
    const find = (start: THREE.Vector3, end: THREE.Vector3) => this.gridSystem
      ? this.gridSystem.findPath(start, end, query) : query?.(start, end) ? [] : [end.clone()];
    if (destination.z > NAVIGATION.doorZ) {
      if (position.z > NAVIGATION.doorZ) return [new THREE.Vector3(0, 0, NAVIGATION.sidewalkZ), destination.clone()];
      const route = find(position, inside);
      return route.length ? [...route, new THREE.Vector3(0, 0, NAVIGATION.doorZ), new THREE.Vector3(0, 0, NAVIGATION.sidewalkZ), destination.clone()] : [];
    }
    if (position.z > NAVIGATION.doorZ) {
      const route = find(inside, destination);
      if (!route.length) return [];
      return [
        ...(position.z > 12.8 ? [new THREE.Vector3(0, 0, position.z)] : []),
        new THREE.Vector3(0, 0, NAVIGATION.sidewalkZ), new THREE.Vector3(0, 0, NAVIGATION.doorZ), ...route
      ];
    }
    return find(position, destination);
  }

  public moveTo(destination: THREE.Vector3, nextState?: CustomerState): boolean {
    if (nextState) this.state = nextState;
    this.targetPosition.copy(destination);
    this.setRoute(this.pathTo(destination));
    this.routeRetries = 0;
    this.journeyTime = 0;
    return this.waypoints.length > 0;
  }

  private setRoute(waypoints: THREE.Vector3[]): void {
    this.waypoints = waypoints;
    this.currentWaypointIndex = 0;
    this.stuckTimer = 0;
    this.bestRemaining = Infinity;
    this.playAction(this.walkAction);
  }

  public setWaypoints(waypoints: THREE.Vector3[], nextState?: CustomerState): void {
    if (nextState) this.state = nextState;
    if (waypoints.length) this.targetPosition.copy(waypoints[waypoints.length - 1]);
    this.setRoute(waypoints);
    this.journeyTime = this.routeRetries = 0;
  }

  public update(deltaTime: number): void {
    if (this.state === 'DESPAWNED') return;
    this.mixer?.update(deltaTime);
    if (this.state === 'SEATING' || this.state === 'UNSEATING') {
      const station = this.assignedStation;
      if (!station) { this.leave(); return; }
      this.transitionTimer += deltaTime;
      const destination = this.state === 'SEATING' ? station.getSeatingWorldPosition() : station.getApproachWorldPosition();
      this.group.position.lerpVectors(this.transitionStart, destination, Math.min(1, this.transitionTimer / .65));
      this.group.rotation.y = station.group.rotation.y + Math.PI;
      if (this.transitionTimer >= .65) {
        if (this.state === 'SEATING') {
          this.state = 'GAMING'; this.gamingTimer = 0;
          this.playAction(this.sitAction || this.interactAction || this.idleAction);
        } else { this.releaseStation(); this.leave(); }
      }
      return;
    }
    if (this.state === 'GAMING') {
      this.gamingTimer += deltaTime;
      if (this.gamingTimer >= this.gamingDuration) this.finishSession();
      return;
    }
    if (this.state === 'WAITING_CHECKIN') { this.playAction(this.idleAction); return; }
    if (!['WALKING_TO_RECEPTION', 'WALKING_TO_STATION', 'LEAVING'].includes(this.state)) return;
    this.journeyTime += deltaTime;
    let target = this.waypoints[this.currentWaypointIndex];
    if (target) {
      const distance = Math.hypot(target.x - this.group.position.x, target.z - this.group.position.z);
      const step = Math.min(distance, this.walkSpeed * deltaTime);
      if (distance > .001) {
        const next = this.group.position.clone();
        next.x += (target.x - next.x) / distance * step;
        next.z += (target.z - next.z) / distance * step;
        if (!this.collisionSystem?.isSegmentBlocked(this.group.position, next, CUSTOMER_RADIUS)) {
          const angle = Math.atan2(next.x - this.group.position.x, next.z - this.group.position.z);
          let diff = angle - this.group.rotation.y;
          while (diff < -Math.PI) diff += Math.PI * 2;
          while (diff > Math.PI) diff -= Math.PI * 2;
          this.group.rotation.y += diff * Math.min(1, 12 * deltaTime);
          this.group.position.copy(next); this.group.position.y = 0;
        }
      }
      if (Math.hypot(target.x - this.group.position.x, target.z - this.group.position.z) < .025) {
        this.currentWaypointIndex++;
        this.bestRemaining = Infinity; this.stuckTimer = 0;
        if (this.currentWaypointIndex >= this.waypoints.length) { this.onReachedTarget(); return; }
        target = this.waypoints[this.currentWaypointIndex];
      }
      const remaining = Math.hypot(target.x - this.group.position.x, target.z - this.group.position.z);
      if (remaining < this.bestRemaining - .03) { this.bestRemaining = remaining; this.stuckTimer = 0; }
      else this.stuckTimer += deltaTime;
    } else this.stuckTimer += deltaTime;
    if (this.stuckTimer >= 2) {
      this.routeRetries++;
      this.setRoute(this.pathTo(this.targetPosition));
    }
    if (this.routeRetries >= 3 || this.journeyTime > 45) {
      this.releaseStation();
      if (this.state === 'LEAVING') this.despawn();
      else if (this.onRouteFailed) this.onRouteFailed(this);
      else this.leave();
    }
  }

  private onReachedTarget(): void {
    if (this.state === 'WALKING_TO_RECEPTION') {
      this.state = 'WAITING_CHECKIN';
      if (this.targetDesk) {
        const direction = this.targetDesk.group.position.clone().sub(this.group.position);
        this.group.rotation.y = Math.atan2(direction.x, direction.z);
      }
      this.playAction(this.waveAction || this.clapAction || this.idleAction);
      this.onCheckIn?.(this);
    } else if (this.state === 'WALKING_TO_STATION') {
      this.state = 'SEATING'; this.transitionTimer = 0;
      this.transitionStart.copy(this.group.position);
    } else if (this.state === 'LEAVING') this.despawn();
  }

  public releaseStation(): void {
    if (this.assignedStation?.currentGamerId === this.id) {
      this.assignedStation.isOccupied = false;
      this.assignedStation.currentGamerId = undefined;
    }
    this.assignedStation = undefined;
  }

  public finishSession(): void {
    if (this.state !== 'GAMING' || !this.assignedStation) return;
    const revenue = Math.round(this.assignedStation.getHourlyRevenue() * this.gamingDuration / SECONDS_PER_GAME_HOUR);
    this.onPayment?.(revenue, this.group.position.clone().add(new THREE.Vector3(0, 1.8, 0)));
    this.state = 'UNSEATING';
    this.transitionStart.copy(this.group.position); this.transitionTimer = 0;
    this.playAction(this.idleAction);
  }

  public leave(): void {
    this.releaseStation();
    this.exitX = Math.random() > .5 ? NAVIGATION.exitLeft : NAVIGATION.exitRight;
    this.moveTo(new THREE.Vector3(this.exitX, 0, NAVIGATION.sidewalkZ), 'LEAVING');
  }

  private despawn(): void {
    this.releaseStation(); this.state = 'DESPAWNED'; this.onFinished?.(this);
  }
}
