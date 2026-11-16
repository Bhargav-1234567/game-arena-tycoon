import * as THREE from 'three';
import { Customer } from '../entities/Customer.ts';
import { PlacementSystem } from './PlacementSystem.ts';
import { EconomySystem } from './EconomySystem.ts';
import { AssetManager } from '../services/AssetManager.ts';
import { SoundManager } from '../services/SoundManager.ts';
import { CollisionSystem } from './CollisionSystem.ts';

export class CustomerSystem {
  private scene: THREE.Scene;
  private placementSystem: PlacementSystem;
  private economySystem: EconomySystem;
  private collisionSystem: CollisionSystem;

  private customers: Map<string, Customer> = new Map();
  private spawnTimer: number = 0;
  private spawnInterval: number = 5.0; // seconds

  // Receptionist Employee
  private receptionistGroup?: THREE.Group;
  private receptionistMixer?: THREE.AnimationMixer;
  private receptionistIdleAction?: THREE.AnimationAction;
  private receptionistWaveAction?: THREE.AnimationAction;
  private receptionistInteractAction?: THREE.AnimationAction;

  public onFloatingText?: (text: string, worldPos: THREE.Vector3, color?: string) => void;

  constructor(scene: THREE.Scene, placementSystem: PlacementSystem, economySystem: EconomySystem) {
    this.scene = scene;
    this.placementSystem = placementSystem;
    this.economySystem = economySystem;
    this.collisionSystem = new CollisionSystem(placementSystem);
  }

  public async setupReceptionist(staffPos?: THREE.Vector3, deskRotationY: number = 0) {
    const assetMgr = AssetManager.getInstance();

    if (this.receptionistGroup) {
      this.scene.remove(this.receptionistGroup);
      this.receptionistGroup = undefined;
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

    this.receptionistGroup = new THREE.Group();
    this.receptionistGroup.name = 'Receptionist_Employee';
    this.receptionistGroup.add(receptionistModel);

    // Position behind the counter with clear spacing so employee never clips desk
    if (this.placementSystem.receptionDesk) {
      const pos = this.placementSystem.receptionDesk.getStaffPosition();
      this.receptionistGroup.position.copy(pos);
      this.receptionistGroup.rotation.y = this.placementSystem.receptionDesk.group.rotation.y;
    } else if (staffPos) {
      this.receptionistGroup.position.copy(staffPos);
      this.receptionistGroup.rotation.y = deskRotationY;
    } else {
      this.receptionistGroup.position.set(0, 0, 2.65);
      this.receptionistGroup.rotation.y = 0;
    }
    this.scene.add(this.receptionistGroup);

    // Setup animations from Women animation suite
    const animations = await assetMgr.loadWomenAnimations();
    if (animations && animations.length > 0) {
      this.receptionistMixer = new THREE.AnimationMixer(receptionistModel);

      const idleClip =
        animations.find(
          (a) =>
            a.name.toLowerCase().includes('idle') &&
            !a.name.toLowerCase().includes('gun') &&
            !a.name.toLowerCase().includes('sword')
        ) || animations[0];
      const waveClip = animations.find((a) => a.name.toLowerCase().includes('wave'));
      const interactClip = animations.find((a) => a.name.toLowerCase().includes('interact'));

      if (idleClip) this.receptionistIdleAction = this.receptionistMixer.clipAction(idleClip);
      if (waveClip) this.receptionistWaveAction = this.receptionistMixer.clipAction(waveClip);
      if (interactClip) this.receptionistInteractAction = this.receptionistMixer.clipAction(interactClip);

      this.receptionistIdleAction?.play();
    }
  }

  public async spawnInitialCustomer() {
    await this.trySpawnCustomer();
  }

  public update(deltaTime: number) {
    // Update receptionist animation
    if (this.receptionistMixer) {
      this.receptionistMixer.update(deltaTime);
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

      // Check if waiting at reception
      if (customer.state === 'WAITING_CHECKIN') {
        const station = this.placementSystem.getAvailableStation();
        if (station) {
          customer.assignedStation = station;
          station.isOccupied = true;
          station.currentGamerId = customer.id;
          customer.moveTo(station.getSeatingWorldPosition(), 'WALKING_TO_STATION');

          // Receptionist interaction reaction
          if (this.receptionistWaveAction || this.receptionistInteractAction) {
            const action = this.receptionistWaveAction || this.receptionistInteractAction;
            action?.reset().setLoop(THREE.LoopOnce, 1).play();
            setTimeout(() => {
              this.receptionistIdleAction?.reset().fadeIn(0.2).play();
            }, 1200);
          }
        }
      }
    }
  }

  private async trySpawnCustomer() {
    // Only spawn if there is a reception counter and at least one gaming station
    if (!this.placementSystem.receptionPosition && this.placementSystem.stations.size === 0) {
      return;
    }

    // Do not spawn if too many customers are already in queue/lounge
    if (this.customers.size >= Math.max(4, this.placementSystem.stations.size * 2)) {
      return;
    }

    const id = `cust_${Date.now()}_${Math.floor(Math.random() * 100)}`;
    const customer = new Customer(id);

    // Spawn near entrance
    const spawnPos = new THREE.Vector3(0, 0, 6.8);
    customer.collisionSystem = this.collisionSystem;
    customer.gridSystem = this.placementSystem.gridSystem;
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

    // Customer check-in greeting callback
    customer.onCheckIn = () => {
      SoundManager.getInstance().playClick();
      if (this.receptionistGroup && this.onFloatingText) {
        const greetPos = this.receptionistGroup.position.clone().add(new THREE.Vector3(0, 2.0, 0));
        this.onFloatingText('Welcome to Zone! ⭐', greetPos, '#38bdf8');
      }
    };

    // Removal callback
    customer.onFinished = (cust) => {
      this.scene.remove(cust.group);
      this.customers.delete(cust.id);
    };

    // First walk to reception (or directly to a station if reception not yet placed)
    if (this.placementSystem.receptionDesk) {
      const waitSpot = this.placementSystem.receptionDesk.getCustomerQueuePosition();
      customer.moveTo(waitSpot, 'WALKING_TO_RECEPTION');
    } else if (this.placementSystem.receptionPosition) {
      const waitSpot = this.placementSystem.receptionPosition.clone().add(new THREE.Vector3(0, 0, 1.45));
      customer.moveTo(waitSpot, 'WALKING_TO_RECEPTION');
    } else {
      customer.state = 'WAITING_CHECKIN';
    }
  }

  public getActiveCustomerCount(): number {
    return this.customers.size;
  }
}
