import * as THREE from 'three';
import { AssetManager } from '../services/AssetManager.ts';
import { GamingStation } from './GamingStation.ts';

export type CustomerState =
  | 'SPAWNING'
  | 'WALKING_TO_RECEPTION'
  | 'WAITING_CHECKIN'
  | 'WALKING_TO_STATION'
  | 'GAMING'
  | 'LEAVING'
  | 'DESPAWNED';

export const MEN_CHARACTER_MODELS = [
  '/assets/models/characters/men/Casual Character.glb',
  '/assets/models/characters/men/Hoodie Character.glb',
  '/assets/models/characters/men/Punk.glb',
  '/assets/models/characters/men/Beach Character.glb',
  '/assets/models/characters/men/Adventurer.glb',
  '/assets/models/characters/men/Business Man.glb',
  '/assets/models/characters/men/Astronaut.glb',
  '/assets/models/characters/men/Farmer.glb',
  '/assets/models/characters/men/King.glb',
  '/assets/models/characters/men/Swat.glb',
  '/assets/models/characters/men/Worker.glb'
];

export const WOMEN_CHARACTER_MODELS = [
  '/assets/models/characters/women/Animated Woman.glb',
  '/assets/models/characters/women/Suit.glb',
  '/assets/models/characters/women/Punk.glb',
  '/assets/models/characters/women/Adventurer.glb',
  '/assets/models/characters/women/Medieval.glb',
  '/assets/models/characters/women/Sci Fi Character.glb',
  '/assets/models/characters/women/Soldier.glb',
  '/assets/models/characters/women/Witch.glb',
  '/assets/models/characters/women/Worker.glb'
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
  public gamingDuration: number = 20; // seconds
  private gamingTimer: number = 0;

  private targetPosition: THREE.Vector3 = new THREE.Vector3();
  private walkSpeed: number = 2.2; // meters per second

  // Animation mixer and actions
  private mixer?: THREE.AnimationMixer;
  private walkAction?: THREE.AnimationAction;
  private idleAction?: THREE.AnimationAction;
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
    // Models are modeled in standard human proportions (~1.8m tall)
    model.scale.setScalar(1.0);

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

    // Load gender-relevant movement animations: Men for Men, Women for Women!
    const animations = this.isMale
      ? await assetMgr.loadMenAnimations()
      : await assetMgr.loadWomenAnimations();

    if (animations && animations.length > 0) {
      this.mixer = new THREE.AnimationMixer(model);

      const walkClip = animations.find((a) => a.name.toLowerCase().includes('walk'));
      const idleClip =
        animations.find(
          (a) =>
            a.name.toLowerCase().includes('idle') &&
            !a.name.toLowerCase().includes('gun') &&
            !a.name.toLowerCase().includes('sword')
        ) || animations[0];
      const interactClip = animations.find((a) => a.name.toLowerCase().includes('interact'));
      const waveClip = animations.find((a) => a.name.toLowerCase().includes('wave'));

      if (walkClip) this.walkAction = this.mixer.clipAction(walkClip);
      if (idleClip) this.idleAction = this.mixer.clipAction(idleClip);
      if (interactClip) this.interactAction = this.mixer.clipAction(interactClip);
      if (waveClip) this.waveAction = this.mixer.clipAction(waveClip);

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

  public moveTo(destination: THREE.Vector3, nextState?: CustomerState) {
    this.targetPosition.copy(destination);
    if (nextState) this.state = nextState;
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
      const dir = this.targetPosition.clone().sub(this.group.position);
      dir.y = 0;
      const distance = dir.length();

      if (distance > 0.12) {
        dir.normalize();
        this.group.position.addScaledVector(dir, this.walkSpeed * deltaTime);

        // Smooth rotation to face movement direction
        const targetAngle = Math.atan2(dir.x, dir.z);
        this.group.rotation.y = THREE.MathUtils.lerp(this.group.rotation.y, targetAngle, 0.25);
      } else {
        // Reached destination
        this.group.position.copy(this.targetPosition);
        this.onReachedTarget();
      }
    } else if (this.state === 'WAITING_CHECKIN') {
      if (this.waveAction && !this.currentAction) {
        this.playAction(this.waveAction);
      } else if (!this.currentAction || this.currentAction === this.walkAction) {
        this.playAction(this.idleAction);
      }
    } else if (this.state === 'GAMING') {
      this.gamingTimer += deltaTime;
      if (this.gamingTimer >= this.gamingDuration) {
        this.finishSession();
      }
    }
  }

  private onReachedTarget() {
    if (this.state === 'WALKING_TO_RECEPTION') {
      this.state = 'WAITING_CHECKIN';
      // Greet the receptionist with a wave or idle
      this.playAction(this.waveAction || this.idleAction);
      if (this.onCheckIn) {
        this.onCheckIn(this);
      }
    } else if (this.state === 'WALKING_TO_STATION') {
      this.state = 'GAMING';
      this.gamingTimer = 0;
      if (this.assignedStation) {
        this.assignedStation.isOccupied = true;
        this.assignedStation.currentGamerId = this.id;

        // Position seated at the station facing the monitor
        const seatPos = this.assignedStation.getSeatingWorldPosition();
        this.group.position.copy(seatPos);
        this.group.rotation.y = this.assignedStation.group.rotation.y + Math.PI;

        // Play interact (hands on keyboard and mouse gaming)
        this.playAction(this.interactAction || this.idleAction);
      }
    } else if (this.state === 'LEAVING') {
      this.state = 'DESPAWNED';
      if (this.onFinished) {
        this.onFinished(this);
      }
    }
  }

  public finishSession() {
    if (this.assignedStation) {
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

    // Walk towards lounge exit
    this.moveTo(new THREE.Vector3(0, 0, 7.5), 'LEAVING');
  }
}
