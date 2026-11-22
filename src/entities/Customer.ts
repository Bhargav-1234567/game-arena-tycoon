import * as THREE from 'three';
import { AssetManager } from '../services/AssetManager.ts';
import { GamingStation } from './GamingStation.ts';
import { CollisionSystem } from '../systems/CollisionSystem.ts';
import { GridSystem } from '../systems/GridSystem.ts';

export type CustomerState =
  | 'SPAWNING'
  | 'WALKING_TO_RECEPTION'
  | 'WAITING_CHECKIN'
  | 'WALKING_TO_STATION'
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
  public targetDesk?: any;
  public gamingDuration: number = 20; // seconds
  private gamingTimer: number = 0;

  private targetPosition: THREE.Vector3 = new THREE.Vector3();
  private waypoints: THREE.Vector3[] = [];
  private currentWaypointIndex: number = 0;
  private walkSpeed: number = 2.2; // meters per second
  private stuckTimer: number = 0;
  private lastPosition: THREE.Vector3 = new THREE.Vector3();
  private currentIgnoreStationId?: string;

  public collisionSystem?: CollisionSystem;
  public gridSystem?: GridSystem;
  public getOtherCustomerPositions?: () => THREE.Vector3[];

  // 16 radial directions covering full 360° (+X, -X, +Z, -Z, and all diagonals)
  private static readonly ALL_DIRECTIONS: { x: number; z: number }[] = (() => {
    const dirs: { x: number; z: number }[] = [];
    for (let i = 0; i < 16; i++) {
      const angle = (i / 16) * Math.PI * 2;
      dirs.push({ x: Math.sin(angle), z: Math.cos(angle) });
    }
    return dirs;
  })();

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

  public moveTo(destination: THREE.Vector3, nextState?: CustomerState, ignoreStationId?: string) {
    if (nextState) this.state = nextState;
    this.targetPosition.copy(destination);
    this.currentIgnoreStationId = ignoreStationId || this.assignedStation?.id;

    const stationId = this.currentIgnoreStationId;

    if (this.gridSystem) {
      const isBlocked = (p1: THREE.Vector3, p2: THREE.Vector3) =>
        this.collisionSystem?.isSegmentBlocked(p1, p2, 0.55, stationId) ?? false;
      this.waypoints = this.gridSystem.findPath(this.group.position, destination, isBlocked);
    } else {
      this.waypoints = [destination.clone()];
    }

    this.currentWaypointIndex = 0;
    this.stuckTimer = 0;
    this.playAction(this.walkAction);
  }

  public setWaypoints(waypoints: THREE.Vector3[], nextState?: CustomerState, ignoreStationId?: string) {
    if (nextState) this.state = nextState;
    if (waypoints.length > 0) {
      this.targetPosition.copy(waypoints[waypoints.length - 1]);
    }
    this.currentIgnoreStationId = ignoreStationId || this.assignedStation?.id;
    this.waypoints = waypoints;
    this.currentWaypointIndex = 0;
    this.stuckTimer = 0;
    this.playAction(this.walkAction);
  }

  public update(deltaTime: number) {
    if (this.state === 'DESPAWNED') return;

    if (this.mixer) {
      this.mixer.update(deltaTime);
    }

    if (
      this.state === 'WALKING_TO_RECEPTION' ||
      this.state === 'WALKING_TO_STATION' ||
      this.state === 'LEAVING'
    ) {
      // Exterior exit check: leaving customers despawn after visibly walking down the exterior city sidewalk
      if (
        this.state === 'LEAVING' &&
        Math.abs(this.group.position.x) >= 13.5 &&
        this.group.position.z >= 9.5
      ) {
        this.state = 'DESPAWNED';
        if (this.onFinished) {
          this.onFinished(this);
        }
        return;
      }

      const ignoreStationId =
      this.currentIgnoreStationId ||
        (this.state === 'WALKING_TO_STATION' ? this.assignedStation?.id : undefined);

      if (this.currentWaypointIndex < this.waypoints.length) {
        const isFinal = this.currentWaypointIndex === this.waypoints.length - 1;
        const currentTarget = this.waypoints[this.currentWaypointIndex];
        const dir = currentTarget.clone().sub(this.group.position);
        dir.y = 0;
        const distance = dir.length();
        const threshold = isFinal ? 0.25 : 0.40;

        if (distance > threshold) {
          dir.normalize();
          const step = this.walkSpeed * deltaTime;
          const pos = this.group.position;
          const lookahead = Math.max(step * 3, 0.28);

          // 1. Check if direct path ahead has a static obstacle collision
          const directTestX = pos.x + dir.x * lookahead;
          const directTestZ = pos.z + dir.z * lookahead;
          const isDirectBlocked = this.collisionSystem?.isPointBlocked(
            directTestX,
            directTestZ,
            0.26,
            ignoreStationId
          );

          let chosenDir: { x: number; z: number } = { x: dir.x, z: dir.z };

          if (isDirectBlocked) {
            // Direct path is blocked by a solid obstacle!
            // Check all 16 directions (+X, -X, +Z, -Z, and all diagonals)
            // to find the closest open path towards the target!
            let bestScore = -Infinity;
            let bestDir: { x: number; z: number } | null = null;

            for (const d of Customer.ALL_DIRECTIONS) {
              const testX = pos.x + d.x * lookahead;
              const testZ = pos.z + d.z * lookahead;

              // Check if direction is clear of static obstacles
              if (this.collisionSystem?.isPointBlocked(testX, testZ, 0.24, ignoreStationId)) {
                continue;
              }

              // Direction is open!
              // Score based on alignment with destination and minimizing remaining distance
              const dot = d.x * dir.x + d.z * dir.z;
              const distSq = (testX - currentTarget.x) ** 2 + (testZ - currentTarget.z) ** 2;
              const score = dot * 2.0 - Math.sqrt(distSq);

              if (score > bestScore) {
                bestScore = score;
                bestDir = d;
              }
            }

            if (bestDir) {
              chosenDir = bestDir;
            } else {
              // Corner fallback: test orthogonal directions with tighter margin (+X, -X, +Z, -Z)
              const fallbacks = [
                { x: 1, z: 0 },
                { x: -1, z: 0 },
                { x: 0, z: 1 },
                { x: 0, z: -1 },
                { x: 0.707, z: 0.707 },
                { x: -0.707, z: 0.707 },
                { x: 0.707, z: -0.707 },
                { x: -0.707, z: -0.707 }
              ];
              for (const fb of fallbacks) {
                if (
                  !this.collisionSystem?.isPointBlocked(
                    pos.x + fb.x * 0.15,
                    pos.z + fb.z * 0.15,
                    0.18,
                    ignoreStationId
                  )
                ) {
                  chosenDir = fb;
                  break;
                }
              }
            }
          }

          // 2. Dynamic Pedestrian Steering: steer smoothly around other customers
          const otherPositions = this.getOtherCustomerPositions
            ? this.getOtherCustomerPositions()
            : [];
          let steerX = chosenDir.x;
          let steerZ = chosenDir.z;

          for (let i = 0; i < otherPositions.length; i++) {
            const op = otherPositions[i];
            const dx = pos.x - op.x;
            const dz = pos.z - op.z;
            const dist = Math.hypot(dx, dz);

            if (dist < 0.65 && dist > 0.001) {
              const repulse = (0.65 - dist) / 0.65;
              // Repulsion away from other customer
              steerX += (dx / dist) * repulse * 0.85;
              steerZ += (dz / dist) * repulse * 0.85;

              // Lateral slip (steer to right so characters slide past each other smoothly)
              const lateralX = -dz / dist;
              const lateralZ = dx / dist;
              steerX += lateralX * repulse * 0.55;
              steerZ += lateralZ * repulse * 0.55;
            }
          }

          const steerLen = Math.hypot(steerX, steerZ);
          if (steerLen > 0.001) {
            steerX /= steerLen;
            steerZ /= steerLen;
          }

          // Apply movement step
          pos.x += steerX * step;
          pos.z += steerZ * step;

          // Smooth rotation to face movement direction
          const targetAngle = Math.atan2(steerX, steerZ);
          let diff = targetAngle - this.group.rotation.y;
          while (diff < -Math.PI) diff += Math.PI * 2;
          while (diff > Math.PI) diff -= Math.PI * 2;
          this.group.rotation.y += diff * Math.min(1.0, 12 * deltaTime);
        } else {
          this.currentWaypointIndex++;
          this.stuckTimer = 0;
          if (this.currentWaypointIndex >= this.waypoints.length) {
            // Reached destination
            this.group.position.copy(currentTarget);
            this.onReachedTarget();
          }
        }
      }

      // Check for stuck / blocked movement against an obstacle
      const moveDelta = this.group.position.distanceTo(this.lastPosition);
      this.lastPosition.copy(this.group.position);

      if (moveDelta < 0.05 * deltaTime * this.walkSpeed) {
        this.stuckTimer += deltaTime;
        if (this.stuckTimer > 0.4) {
          this.stuckTimer = 0;
          const distToFinal = Math.hypot(
            this.group.position.x - this.targetPosition.x,
            this.group.position.z - this.targetPosition.z
          );
          if (distToFinal <= 0.50) {
            // Truly at destination
            this.group.position.copy(this.targetPosition);
            this.onReachedTarget();
          } else if (this.currentWaypointIndex < this.waypoints.length - 1) {
            // Advance to next waypoint to smoothly slip past any minor obstacle contact
            this.currentWaypointIndex++;
          } else if (this.gridSystem) {
            // Recompute path around current blockage with 0.40m clearance
            const isBlocked = (p1: THREE.Vector3, p2: THREE.Vector3) =>
            this.collisionSystem?.isSegmentBlocked(p1, p2, 0.40, ignoreStationId) ?? false;
            const newPath = this.gridSystem.findPath(this.group.position, this.targetPosition, isBlocked);
            if (newPath && newPath.length > 0) {
              this.waypoints = newPath;
              this.currentWaypointIndex = 0;
            }
          }
        }
      } else {
        this.stuckTimer = 0;
      }

      // Rigid Solid Collision: guarantees character CANNOT walk inside or through solid items
      if (this.collisionSystem) {
        this.collisionSystem.resolveCollision(this.group.position, 0.28, ignoreStationId);
      }
    } else if (this.state === 'WAITING_CHECKIN') {
      const waitAction = this.clapAction || this.waveAction || this.idleAction;
      if (waitAction && (!this.currentAction || this.currentAction === this.walkAction)) {
        this.playAction(waitAction);
      }
    } else if (this.state === 'GAMING') {
      this.gamingTimer += deltaTime;
      if (this.assignedStation) {
        // Keep customer aligned with dynamic chair position if station upgrades mid-session
        const seatPos = this.assignedStation.getSeatingWorldPosition();
        this.group.position.lerp(seatPos, 0.1);
      }
      if (this.gamingTimer >= this.gamingDuration) {
        this.finishSession();
      }
    }
  }

  private onReachedTarget() {
    if (this.state === 'WALKING_TO_RECEPTION') {
      this.state = 'WAITING_CHECKIN';
      // Dynamically face the reception desk
      if (this.targetDesk) {
        const dir = new THREE.Vector3().subVectors(this.targetDesk.group.position, this.group.position);
        this.group.rotation.y = Math.atan2(dir.x, dir.z);
      } else {
        this.group.rotation.y = Math.PI;
      }
      this.playAction(this.clapAction || this.waveAction || this.idleAction);
      if (this.onCheckIn) {
        this.onCheckIn(this);
      }
    } else if (this.state === 'WALKING_TO_STATION') {
      this.state = 'GAMING';
      this.gamingTimer = 0;
      if (this.assignedStation) {
        this.assignedStation.isOccupied = true;
        this.assignedStation.currentGamerId = this.id;

        // Position at station facing the monitor
        const stationPos = this.assignedStation.getSeatingWorldPosition();
        this.group.position.copy(stationPos);
        this.group.rotation.y = this.assignedStation.group.rotation.y + Math.PI;

        // Play sitting animation when customer is gaming at the station chair
        this.playAction(this.sitAction || this.interactAction || this.idleAction);
      }
    } else if (this.state === 'LEAVING') {
      this.state = 'DESPAWNED';
      if (this.onFinished) {
        this.onFinished(this);
      }
    }
  }

  public finishSession() {
    let oldStationId: string | undefined;
    if (this.assignedStation) {
      oldStationId = this.assignedStation.id;
      const rev = Math.round(
        this.assignedStation.getHourlyRevenue() * (this.gamingDuration / 10)
      );
      if (this.onPayment) {
        this.onPayment(rev, this.group.position.clone().add(new THREE.Vector3(0, 1.8, 0)));
      }

      this.assignedStation.isOccupied = false;
      this.assignedStation.currentGamerId = undefined;
      this.assignedStation = undefined;
    }

    // Reset Y back to floor level (0) when standing up from chair
    this.group.position.y = 0;

    // Route customer out through the doorway and onto the exterior sidewalk
    const exitX = Math.random() > 0.5 ? -15.0 : 15.0;
    const exitWaypoints: THREE.Vector3[] = [];

    // 1. Pathfind inside from current station chair to inside door approach (0, 0, 7.0)
    if (this.gridSystem) {
      const isBlocked = (p1: THREE.Vector3, p2: THREE.Vector3) =>
        this.collisionSystem?.isSegmentBlocked(p1, p2, 0.45, oldStationId) ?? false;
      const insidePath = this.gridSystem.findPath(
        this.group.position,
        new THREE.Vector3(0, 0, 7.0),
        isBlocked
      );
      if (insidePath && insidePath.length > 0) {
        exitWaypoints.push(...insidePath);
      } else {
        exitWaypoints.push(new THREE.Vector3(0, 0, 7.0));
      }
    } else {
      exitWaypoints.push(new THREE.Vector3(0, 0, 7.0));
    }

    // 2. Cross doorway (0, 0, 8.0)
    exitWaypoints.push(new THREE.Vector3(0, 0, 8.0));

    // 3. Walk through entrance forecourt (0, 0, 10.5)
    exitWaypoints.push(new THREE.Vector3(0, 0, 10.5));

    // 4. Stroll down exterior city sidewalk to despawn point
    exitWaypoints.push(new THREE.Vector3(exitX, 0, 10.5));

    this.setWaypoints(exitWaypoints, 'LEAVING', oldStationId);
  }
}
