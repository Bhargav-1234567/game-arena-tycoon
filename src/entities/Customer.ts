import * as THREE from 'three';
import { applyCharacterAppearance, randomCharacterAppearance } from '../characters/CharacterAppearance.ts';
import { NAVIGATION } from '../data/world-layout.ts';
import { AssetManager } from '../services/AssetManager.ts';
import { GamingStation, DESK_SURFACES, KEYBOARD_DIMS, MOUSE_DIMS } from './GamingStation.ts';
import { CUSTOMER_CHARACTERS } from '../data/characters.ts';
import { OriginalCharacterMotion, CHAIR_CUSHION_HEIGHTS, SEAT_APPROACH_SECONDS, SIT_TRANSITION_SECONDS, CHAIR_EXIT_SECONDS } from '../characters/OriginalCharacterMotion.ts';
import { CollisionSystem } from '../systems/CollisionSystem.ts';
import { CUSTOMER_RADIUS, NAVIGATION_RADIUS, SECONDS_PER_GAME_HOUR, CHAIR_ENTRY_SIDE } from '../data/simulation.ts';
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

export const MEN_CHARACTER_MODELS = CUSTOMER_CHARACTERS.filter((character) => character.gender === 'male').map((character) => character.gamePath);
export const WOMEN_CHARACTER_MODELS = CUSTOMER_CHARACTERS.filter((character) => character.gender === 'female').map((character) => character.gamePath);
export const CUSTOMER_CHARACTER_MODELS = CUSTOMER_CHARACTERS.map((character) => character.gamePath);

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
  private walkSpeed: number = 1.4; // meters per second
  private stuckTimer: number = 0;
  private bestRemaining = Infinity;
  private routeRetries = 0;
  private journeyTime = 0;
  private transitionTimer = 0;
  private transitionStart = new THREE.Vector3();
  private transitionActionStarted = false;
  private chairSide = -1;
  private avatar?: OriginalCharacterMotion;
  private greetingTimer = 0;
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
  private sitDownAction?: THREE.AnimationAction;
  private standUpAction?: THREE.AnimationAction;
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

    this.isMale = CUSTOMER_CHARACTERS.find((character) => (character.gamePath === modelUrl || character.path === modelUrl))?.gender === 'male';
    const model = await assetMgr.loadRequiredModel(modelUrl);
    applyCharacterAppearance(model, randomCharacterAppearance(this.isMale ? 'male' : 'female'));
    this.group.add(model);
    this.avatar = new OriginalCharacterMotion(model, this.group);
    this.group.position.copy(spawnPos);
    this.targetPosition.copy(spawnPos);
    const animations = (model.userData.animations as THREE.AnimationClip[]) ?? [];
    const required = (name: string) => {
      const clip = animations.find((clip) => clip.name === name);
      if (!clip) throw new Error(`Original character ${modelUrl} is missing its ${name} animation.`);
      return clip;
    };
    this.mixer = new THREE.AnimationMixer(model);
    this.walkAction = this.mixer.clipAction(required('Walk'));
    this.walkAction.timeScale = this.walkSpeed / this.avatar.metadata.walkSpeed;
    this.idleAction = this.mixer.clipAction(required('Idle'));
    this.sitAction = this.mixer.clipAction(required('Gaming'));
    this.sitDownAction = this.mixer.clipAction(required('SitDown'));
    this.standUpAction = this.mixer.clipAction(required('StandUp'));
    this.waveAction = this.mixer.clipAction(required('Wave'));
    this.playAction(this.walkAction);
  }

  public playAction(action?: THREE.AnimationAction) {
    if (!action || action === this.currentAction) return;

    if (this.currentAction) {
      this.currentAction.fadeOut(0.2);
    }

    const once = ['SitDown', 'StandUp', 'Wave', 'CheckIn'].includes(action.getClip().name);
    action.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
    action.clampWhenFinished = once;
    action.reset().fadeIn(0.16).play();
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
    try {
      this.avatar?.restoreAnimationPose();
      this.mixer?.update(deltaTime);
      if (this.state === 'SEATING' || this.state === 'UNSEATING') {
        const station = this.assignedStation;
        if (!station) { this.leave(); return; }
        this.transitionTimer += deltaTime;
        const seating = this.state === 'SEATING';
        const seat = station.getSeatingWorldPosition(), approach = station.getApproachWorldPosition();
        const side = station.getEntryWorldPositions()[this.chairSide === -1 ? 0 : 1];
        const previous = this.group.position.clone();
        if (seating) {
          const walk = Math.min(1, this.transitionTimer / SEAT_APPROACH_SECONDS);
          if (this.transitionTimer < SEAT_APPROACH_SECONDS) {
            const control = approach.clone().add(new THREE.Vector3(this.chairSide * CHAIR_ENTRY_SIDE, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), station.group.rotation.y));
            this.group.position.copy(new THREE.QuadraticBezierCurve3(this.transitionStart, control, side).getPoint(walk));
          } else {
            if (!this.transitionActionStarted) { this.playAction(this.sitDownAction); this.transitionActionStarted = true; }
            const progress = THREE.MathUtils.smoothstep(this.transitionTimer - SEAT_APPROACH_SECONDS, 0, SIT_TRANSITION_SECONDS);
            this.group.position.lerpVectors(side, seat, progress);
          }
        } else if (this.transitionTimer <= SIT_TRANSITION_SECONDS) {
          this.group.position.copy(seat);
        } else {
          if (!this.transitionActionStarted) { this.playAction(this.walkAction); this.transitionActionStarted = true; }
          const elapsed = this.transitionTimer - SIT_TRANSITION_SECONDS;
          if (elapsed < .55) this.group.position.lerpVectors(seat, side, elapsed / .55);
          else {
            const control = approach.clone().add(new THREE.Vector3(this.chairSide * CHAIR_ENTRY_SIDE, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), station.group.rotation.y));
            this.group.position.copy(new THREE.QuadraticBezierCurve3(side, control, approach).getPoint(Math.min(1, (elapsed - .55) / (CHAIR_EXIT_SECONDS - .55))));
          }
        }
        const heading = seating && this.transitionTimer >= SEAT_APPROACH_SECONDS ? station.group.rotation.y + Math.PI
          : !seating && this.transitionTimer <= SIT_TRANSITION_SECONDS ? station.group.rotation.y + Math.PI
            : Math.atan2(this.group.position.x - previous.x, this.group.position.z - previous.z);
        const turn = THREE.MathUtils.euclideanModulo(heading - this.group.rotation.y + Math.PI, Math.PI * 2) - Math.PI;
        this.group.rotation.y += turn * Math.min(1, deltaTime * 14);
        if (this.transitionTimer >= SIT_TRANSITION_SECONDS + (seating ? SEAT_APPROACH_SECONDS : CHAIR_EXIT_SECONDS)) {
          if (seating) {
            this.group.position.copy(seat); this.group.rotation.y = station.group.rotation.y + Math.PI;
            this.state = 'GAMING'; this.gamingTimer = 0;
            this.playAction(this.sitAction);
          } else { this.group.position.copy(approach); this.releaseStation(); this.leave(); }
        }
        return;
      }
      if (this.state === 'GAMING') {
        this.gamingTimer += deltaTime;
        if (this.gamingTimer >= this.gamingDuration) this.finishSession();
        return;
      }
      if (this.state === 'WAITING_CHECKIN') { this.greetingTimer -= deltaTime; if (this.greetingTimer <= 0) this.playAction(this.idleAction); return; }
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
    } finally { this.fitAvatar(); }
  }

  private availableChairSide(): number | undefined {
    const station = this.assignedStation;
    if (!station) return;
    const index = station.getEntryWorldPositions().findIndex((point) => !this.collisionSystem?.isPointBlocked(point.x, point.z, NAVIGATION_RADIUS, station.id));
    return index < 0 ? undefined : index === 0 ? -1 : 1;
  }

  private fitAvatar(): void {
    if (!this.avatar) return;
    const station = this.assignedStation;
    const blend = this.state === 'GAMING' ? 1 : this.state === 'SEATING'
      ? THREE.MathUtils.smoothstep(this.transitionTimer - SEAT_APPROACH_SECONDS, 0, SIT_TRANSITION_SECONDS)
      : this.state === 'UNSEATING' ? 1 - THREE.MathUtils.smoothstep(this.transitionTimer, 0, SIT_TRANSITION_SECONDS) : 0;
    if (!station) { this.avatar.fit(0, .4, .72, .28, .29, this.group.position.z > NAVIGATION.doorZ ? .04 : 0); return; }
    const surface = DESK_SURFACES[station.currentDesk.level], keyboard = KEYBOARD_DIMS[station.currentKeyboard.level];
    const mouse = MOUSE_DIMS[station.currentMouse.level];
    const keyboardZ = surface.frontZ - .05 - keyboard.d / 2;
    const wristDistance = station.computedChairZ - .08 - keyboardZ - .10;
    this.avatar.fit(blend, CHAIR_CUSHION_HEIGHTS[station.currentChair.level], surface.surfaceY, wristDistance, -.05 + keyboard.w / 2 + .08 + mouse.w / 2);
  }

  private onReachedTarget(): void {
    if (this.state === 'WALKING_TO_RECEPTION') {
      this.state = 'WAITING_CHECKIN';
      if (this.targetDesk) {
        const direction = this.targetDesk.group.position.clone().sub(this.group.position);
        this.group.rotation.y = Math.atan2(direction.x, direction.z);
      }
      this.greetingTimer = 1.2;
      this.playAction(this.waveAction || this.idleAction);
      this.onCheckIn?.(this);
    } else if (this.state === 'WALKING_TO_STATION') {
      const side = this.availableChairSide();
      if (side === undefined) { this.leave(); return; }
      this.chairSide = side;
      this.state = 'SEATING'; this.transitionTimer = 0; this.transitionActionStarted = false;
      this.transitionStart.copy(this.group.position);
      this.playAction(this.walkAction);
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
    this.chairSide = this.availableChairSide() ?? this.chairSide;
    this.state = 'UNSEATING';
    this.transitionStart.copy(this.group.position); this.transitionTimer = 0; this.transitionActionStarted = false;
    this.playAction(this.standUpAction);
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
