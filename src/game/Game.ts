import * as THREE from 'three';
import { SceneManager } from './SceneManager.ts';
import { CameraController } from './CameraController.ts';
import { GridSystem } from '../systems/GridSystem.ts';
import { PlacementSystem } from './../systems/PlacementSystem.ts';
import { CustomerSystem } from '../systems/CustomerSystem.ts';
import { EconomySystem } from '../systems/EconomySystem.ts';
import { StaffSystem } from '../systems/StaffSystem.ts';
import { ParticleSystem } from '../services/ParticleSystem.ts';
import { AssetManager } from '../services/AssetManager.ts';
import { TopBar } from '../ui/TopBar.ts';
import { BuildMenu } from '../ui/BuildMenu.ts';
import { StationInspector } from '../ui/StationInspector.ts';
import { StatsModal } from '../ui/StatsModal.ts';
import { FloatingTextManager } from '../ui/FloatingTextManager.ts';
import { BUILDABLE_ITEMS } from '../data/assets.ts';

export class Game {
  public sceneManager: SceneManager;
  public cameraController: CameraController;
  public gridSystem: GridSystem;
  public placementSystem: PlacementSystem;
  public customerSystem: CustomerSystem;
  public economySystem: EconomySystem;
  public staffSystem: StaffSystem;
  public particleSystem: ParticleSystem;

  public topBar: TopBar;
  public buildMenu: BuildMenu;
  public stationInspector: StationInspector;
  public statsModal: StatsModal;
  public floatingTextManager: FloatingTextManager;

  private raycaster: THREE.Raycaster = new THREE.Raycaster();
  private mousePos: THREE.Vector2 = new THREE.Vector2();
  private groundPlane: THREE.Plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private clock: THREE.Clock = new THREE.Clock();

  constructor(canvas: HTMLCanvasElement, uiContainer: HTMLElement) {
    this.sceneManager = new SceneManager(canvas);
    this.cameraController = new CameraController(canvas);
    this.gridSystem = new GridSystem(14, 14);
    this.economySystem = new EconomySystem();
    this.staffSystem = new StaffSystem(this.economySystem);
    this.particleSystem = new ParticleSystem(this.sceneManager.scene);

    this.placementSystem = new PlacementSystem(
      this.sceneManager.scene,
      this.gridSystem,
      this.economySystem
    );
    this.placementSystem.particleSystem = this.particleSystem;

    this.customerSystem = new CustomerSystem(
      this.sceneManager.scene,
      this.placementSystem,
      this.economySystem
    );

    // Setup UI components
    this.topBar = new TopBar(uiContainer, this.economySystem);
    this.buildMenu = new BuildMenu(uiContainer, this.placementSystem, this.economySystem);
    this.stationInspector = new StationInspector(uiContainer, this.economySystem, this.particleSystem);
    this.statsModal = new StatsModal(uiContainer, this.economySystem, this.staffSystem, this.placementSystem);
    this.floatingTextManager = new FloatingTextManager(uiContainer, this.cameraController.camera);

    this.topBar.onOpenStats = () => {
      this.statsModal.open();
    };

    this.placementSystem.onReceptionPlaced = (pos) => {
      this.customerSystem.setupReceptionist(pos);
    };

    this.customerSystem.onFloatingText = (text, pos, color) => {
      this.floatingTextManager.spawn(text, pos, color);
    };

    this.placementSystem.onStationSelected = (station) => {
      this.stationInspector.inspectStation(station);
    };

    this.placementSystem.onReceptionSelected = (desk) => {
      this.stationInspector.inspectReception(desk);
    };

    this.setupPointerEvents(canvas);
  }

  public async start() {
    // 1. Preload user 3D assets for instant rendering
    const assetMgr = AssetManager.getInstance();
    await assetMgr.preload([
      '/assets/models/environment/floors/floor_tile.glb',
      '/assets/models/environment/walls/wall_straight.glb',
      '/assets/models/decorations/neon_sign_game.glb',
      // Equipment & Peripherals (Lvl 1)
      '/assets/models/furniture/desks/desk_lvl1.glb',
      '/assets/models/equipment/chairs/chair_lvl1.glb',
      '/assets/models/equipment/pcs/pc_lvl1.glb',
      '/assets/models/equipment/monitors/monitor_lvl1.glb',
      '/assets/models/equipment/keyboards/keyboard_lvl1.glb',
      '/assets/models/equipment/mice/mouse_lvl1.glb',
      '/assets/models/equipment/speakers/speaker_lvl1.glb',
      // Facilities (Lvl 1)
      '/assets/models/furniture/counters/reception_lvl1.glb',
      '/assets/models/business/arcade/arcade_lvl1.glb',
      '/assets/models/business/vending/vending_lvl1.glb',
      '/assets/models/furniture/sofas/sofa_lvl1.glb',
      // Characters & Animation Suite
      '/assets/models/characters/women/Animated Woman.glb',
      '/assets/models/characters/women/Suit.glb',
      '/assets/models/characters/men/Casual Character.glb',
      '/assets/models/characters/men/Hoodie Character.glb',
      '/assets/models/characters/men/Punk.glb'
    ]);

    // Ensure both Men and Women character animation suites are ready
    await Promise.all([
      assetMgr.loadMenAnimations(),
      assetMgr.loadWomenAnimations()
    ]);

    // 2. Build Floor Grid
    await this.gridSystem.buildFloor(this.sceneManager.scene);

    // 3. Build Back Perimeter Walls & Neon Sign
    await this.buildRoomBoundaries();

    // 4. Place Initial Starting Assets (Reception Counter + Receptionist + 2 Gaming Stations + Facilities)
    await this.setupInitialGamingRoom();

    // 5. Spawn starting customer immediately
    await this.customerSystem.spawnInitialCustomer();

    // 6. Start Game Render Loop
    this.animate();
  }

  private async buildRoomBoundaries() {
    const assetMgr = AssetManager.getInstance();
    const wallModel = await assetMgr.loadModel('/assets/models/environment/walls/wall_straight.glb');

    const halfW = Math.floor(this.gridSystem.width / 2);
    const halfD = Math.floor(this.gridSystem.depth / 2);

    // Back wall (Z = -halfD)
    for (let x = -halfW; x < halfW; x++) {
      const wall = wallModel.clone();
      wall.position.set(x + 0.5, 0, -halfD);
      this.sceneManager.scene.add(wall);
    }

    // Left wall (X = -halfW)
    for (let z = -halfD; z < halfD; z++) {
      const wall = wallModel.clone();
      wall.rotation.y = Math.PI / 2;
      wall.position.set(-halfW, 0, z + 0.5);
      this.sceneManager.scene.add(wall);
    }

    // Add glowing "GAME ON" neon sign on the back wall
    const neonModel = await assetMgr.loadModel('/assets/models/decorations/neon_sign_game.glb');
    neonModel.position.set(0, 1.8, -halfD + 0.15);
    this.sceneManager.scene.add(neonModel);
  }

  private async setupInitialGamingRoom() {
    // 1. Reception Counter at lobby entrance
    this.placementSystem.setBuildItem(BUILDABLE_ITEMS.find((i) => i.id === 'reception_counter'));
    this.placementSystem.updateHover(new THREE.Vector3(0, 0, 4));
    await this.placementSystem.tryPlace();

    // 2. Setup Receptionist behind the reception desk facing entrance
    await this.customerSystem.setupReceptionist(new THREE.Vector3(0, 0, 4));

    // 3. Station 1 on the left side
    this.placementSystem.setBuildItem(BUILDABLE_ITEMS.find((i) => i.id === 'station_bundle'));
    this.placementSystem.updateHover(new THREE.Vector3(-3.5, 0, 0));
    await this.placementSystem.tryPlace();

    // 4. Station 2 on the right side
    this.placementSystem.setBuildItem(BUILDABLE_ITEMS.find((i) => i.id === 'station_bundle'));
    this.placementSystem.updateHover(new THREE.Vector3(1.5, 0, 0));
    await this.placementSystem.tryPlace();

    // 5. Indoor Plant for ambiance
    this.placementSystem.setBuildItem(BUILDABLE_ITEMS.find((i) => i.id === 'plant_indoor'));
    this.placementSystem.updateHover(new THREE.Vector3(-5, 0, 5));
    await this.placementSystem.tryPlace();

    // 6. Vending Machine (Lvl 1)
    this.placementSystem.setBuildItem(BUILDABLE_ITEMS.find((i) => i.id === 'vending_lvl1'));
    this.placementSystem.updateHover(new THREE.Vector3(4, 0, 5));
    await this.placementSystem.tryPlace();

    // 7. Retro Arcade Cabinet (Lvl 1)
    this.placementSystem.setBuildItem(BUILDABLE_ITEMS.find((i) => i.id === 'arcade_lvl1'));
    this.placementSystem.updateHover(new THREE.Vector3(5.5, 0, 5));
    await this.placementSystem.tryPlace();

    // 8. Lounge Sofa (Lvl 1) in waiting corner
    this.placementSystem.setBuildItem(BUILDABLE_ITEMS.find((i) => i.id === 'sofa_lvl1'));
    this.placementSystem.updateHover(new THREE.Vector3(-4, 0, 3));
    await this.placementSystem.tryPlace();

    // Clear active build item
    this.placementSystem.setBuildItem(undefined);
    this.buildMenu.showBuildControls(false);
  }

  private setupPointerEvents(canvas: HTMLCanvasElement) {
    let pointerDownPos = new THREE.Vector2();

    canvas.addEventListener('pointerdown', (e) => {
      pointerDownPos.set(e.clientX, e.clientY);
    });

    canvas.addEventListener('pointermove', (e) => {
      this.mousePos.x = (e.clientX / window.innerWidth) * 2 - 1;
      this.mousePos.y = -(e.clientY / window.innerHeight) * 2 + 1;

      if (this.placementSystem.activeItem) {
        this.raycaster.setFromCamera(this.mousePos, this.cameraController.camera);
        const intersectPoint = new THREE.Vector3();
        if (this.raycaster.ray.intersectPlane(this.groundPlane, intersectPoint)) {
          this.placementSystem.updateHover(intersectPoint);
        }
      }
    });

    canvas.addEventListener('pointerup', async (e) => {
      const dist = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
      if (dist > 5) return; // Dragging/panning, not a click

      if (this.placementSystem.activeItem) {
        if (e.button === 0) {
          await this.placementSystem.tryPlace();
        } else if (e.button === 2) {
          this.placementSystem.setBuildItem(undefined);
          this.buildMenu.showBuildControls(false);
        }
      } else {
        // Selection raycast
        if (e.button === 0) {
          this.raycaster.setFromCamera(this.mousePos, this.cameraController.camera);
          const intersects = this.raycaster.intersectObjects(this.sceneManager.scene.children, true);
          if (intersects.length > 0) {
            this.placementSystem.handleClickSelect(intersects[0].object);
          } else {
            this.placementSystem.handleClickSelect(null);
          }
        }
      }
    });
  }

  private animate = () => {
    requestAnimationFrame(this.animate);

    const deltaTime = Math.min(this.clock.getDelta(), 0.1);
    const elapsedTime = this.clock.getElapsedTime();

    // System Updates
    this.cameraController.update(deltaTime);
    this.economySystem.update(deltaTime);
    this.customerSystem.update(deltaTime);
    this.staffSystem.update(deltaTime);
    this.particleSystem.update(deltaTime);
    this.floatingTextManager.update(deltaTime);

    // Update stations RGB animations
    this.placementSystem.stations.forEach((station) => {
      station.update(elapsedTime);
    });

    // Update TopBar HUD
    this.topBar.updateValues(this.customerSystem.getActiveCustomerCount());

    // Render 3D Scene
    this.sceneManager.render(this.cameraController.camera);
  };
}
