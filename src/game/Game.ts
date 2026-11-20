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
import { ExpansionSystem } from '../systems/ExpansionSystem.ts';
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
  public expansionSystem: ExpansionSystem;
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
  private facilityRevenueTimer: number = 0;

  constructor(canvas: HTMLCanvasElement, uiContainer: HTMLElement) {
    this.sceneManager = new SceneManager(canvas);
    this.cameraController = new CameraController(canvas);
    this.gridSystem = new GridSystem(24, 24);
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

    this.expansionSystem = new ExpansionSystem(
      this.sceneManager.scene,
      this.gridSystem,
      this.economySystem,
      this.particleSystem
    );
    this.expansionSystem.collisionSystem = this.customerSystem.collisionSystem;

    // Setup UI components
    this.topBar = new TopBar(uiContainer, this.economySystem);
    this.buildMenu = new BuildMenu(uiContainer, this.placementSystem, this.economySystem);
    this.stationInspector = new StationInspector(uiContainer, this.economySystem, this.particleSystem);
    this.statsModal = new StatsModal(uiContainer, this.economySystem, this.staffSystem, this.placementSystem);
    this.floatingTextManager = new FloatingTextManager(uiContainer, this.cameraController.camera);

    this.expansionSystem.onFloatingText = (text, pos, color) => {
      this.floatingTextManager.spawn(text, pos, color);
    };

    this.expansionSystem.onExpansionChanged = (_stage, nextPrice) => {
      this.buildMenu.updateExpandButton(nextPrice);
    };

    this.buildMenu.onExpandClick = async () => {
      await this.expansionSystem.tryExpand();
    };

    this.topBar.onOpenStats = () => {
      this.statsModal.open();
    };

    this.placementSystem.onReceptionPlaced = (desk) => {
      this.customerSystem.setupReceptionistForDesk(desk);
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

    this.placementSystem.onFacilitySelected = (facility) => {
      this.stationInspector.inspectFacility(facility);
    };

    this.placementSystem.onObjectSelected = (obj) => {
      this.stationInspector.inspectObject(obj);
    };

    this.stationInspector.onMoveRequested = (target) => {
      this.stationInspector.closeAll();
      if (target.type === 'station') {
        this.placementSystem.startMoveStation(target.entity);
      } else if (target.type === 'reception') {
        this.placementSystem.startMoveReception(target.entity);
      } else if (target.type === 'facility') {
        this.placementSystem.startMoveFacility(target.entity);
      } else if (target.type === 'object') {
        this.placementSystem.startMoveObject(target.entity);
      }
      this.buildMenu.showBuildControls(true);
    };

    this.placementSystem.onMoveModeChanged = (inMoveMode) => {
      this.buildMenu.showBuildControls(inMoveMode);
      if (inMoveMode) {
        this.stationInspector.closeAll();
      }
    };

    this.placementSystem.onReceptionMoved = (desk) => {
      this.customerSystem.setupReceptionistForDesk(desk);
    };

    this.setupPointerEvents(canvas);
  }

  public async start() {
    // 1. Preload user 3D assets for instant rendering
    const assetMgr = AssetManager.getInstance();
    await assetMgr.preload([
      // Building Kit Environment
      '/assets/models/game creation/Building Kit/Floor.glb',
      '/assets/models/game creation/Building Kit/Wall.glb',
      '/assets/models/game creation/Building Kit/Wall Window Square.glb',
      '/assets/models/game creation/Building Kit/Wall Doorway Square.glb',
      '/assets/models/game creation/Building Kit/Modern door.glb',
      '/assets/models/game creation/Building Kit/Wall Corner Column.glb',
      '/assets/models/decorations/neon_sign_game.glb',
      // Equipment & Peripherals (Lvl 1)
      '/assets/models/furniture/desks/desk_lvl1.glb',
      '/assets/models/equipment/chairs/chair_lvl1.glb',
      '/assets/models/equipment/pcs/pc_lvl1.glb',
      '/assets/models/equipment/monitors/monitor_lvl1.glb',
      '/assets/models/equipment/keyboards/keyboard_lvl1.glb',
      '/assets/models/equipment/mice/mouse_lvl1.glb',
      '/assets/models/equipment/speakers/speaker_lvl1.glb',
      // Facilities (Lvl 1 - 4)
      '/assets/models/furniture/counters/reception_lvl1.glb',
      '/assets/models/furniture/counters/reception_lvl2.glb',
      '/assets/models/furniture/counters/reception_lvl3.glb',
      '/assets/models/furniture/counters/reception_lvl4.glb',
      '/assets/models/business/arcade/arcade_lvl1.glb',
      '/assets/models/business/arcade/arcade_lvl2.glb',
      '/assets/models/business/arcade/arcade_lvl3.glb',
      '/assets/models/business/arcade/arcade_lvl4.glb',
      '/assets/models/business/vending/vending_lvl1.glb',
      '/assets/models/business/vending/vending_lvl2.glb',
      '/assets/models/business/vending/vending_lvl3.glb',
      '/assets/models/business/vending/vending_lvl4.glb',
      '/assets/models/furniture/sofas/sofa_lvl1.glb',
      '/assets/models/furniture/sofas/sofa_lvl2.glb',
      '/assets/models/furniture/sofas/sofa_lvl3.glb',
      '/assets/models/furniture/sofas/sofa_lvl4.glb',
      // Characters & Animation Suite
      '/assets/models/characters/women/Woman.glb',
      '/assets/models/characters/women/Woman in Dress.glb',
      '/assets/models/characters/women/Woman Casual.glb',
      '/assets/models/characters/women/Woman in Tank Top.glb',
      '/assets/models/characters/men/Man.glb',
      '/assets/models/characters/men/Man in Long Sleeves.glb',
      '/assets/models/characters/men/Man in Suit.glb',
      '/assets/models/characters/men/Man-fjHyMd5Wxw.glb'
    ]);

    // Ensure both Men and Women character animation suites are ready
    await Promise.all([
      assetMgr.loadMenAnimations(),
      assetMgr.loadWomenAnimations()
    ]);

    // 2. Build Floor Grid
    await this.gridSystem.buildFloor(this.sceneManager.scene);

    // 3. Build Perimeter Walls & Doorway from Building Kit
    await this.expansionSystem.setup();
    this.buildMenu.updateExpandButton(this.expansionSystem.getCurrentPrice());

    // 4. Place Initial Starting Assets (Reception Counter + Receptionist + 2 Gaming Stations + Facilities)
    await this.setupInitialGamingRoom();

    // 5. Spawn starting customer immediately
    await this.customerSystem.spawnInitialCustomer();

    // 6. Start Game Render Loop
    this.animate();
  }

  private async setupInitialGamingRoom() {
    // 1. Reception Counter at lobby entrance (centered at X = 0, Z = 3.5)
    this.placementSystem.setBuildItem(BUILDABLE_ITEMS.find((i) => i.id === 'reception_counter'));
    this.placementSystem.updateHover(new THREE.Vector3(-1.5, 0, 2.5));
    await this.placementSystem.tryPlace();

    // 2. Setup Receptionist behind the reception desk facing entrance
    await this.customerSystem.setupReceptionist();

    // 3. Station 1 on the left side (centered at X = -3.0, Z = 0.5)
    this.placementSystem.setBuildItem(BUILDABLE_ITEMS.find((i) => i.id === 'station_bundle'));
    this.placementSystem.updateHover(new THREE.Vector3(-3.5, 0, 0));
    await this.placementSystem.tryPlace();

    // 4. Station 2 on the right side (centered at X = +3.0, Z = 0.5)
    this.placementSystem.setBuildItem(BUILDABLE_ITEMS.find((i) => i.id === 'station_bundle'));
    this.placementSystem.updateHover(new THREE.Vector3(2.5, 0, 0));
    await this.placementSystem.tryPlace();

    // 5. Indoor Plant for ambiance
    this.placementSystem.setBuildItem(BUILDABLE_ITEMS.find((i) => i.id === 'plant_indoor'));
    this.placementSystem.updateHover(new THREE.Vector3(-5, 0, 5));
    await this.placementSystem.tryPlace();

    // 6. Vending Machine (Lvl 1) along right wall
    this.placementSystem.setBuildItem(BUILDABLE_ITEMS.find((i) => i.id === 'vending_lvl1'));
    this.placementSystem.updateHover(new THREE.Vector3(4.5, 0, 5));
    await this.placementSystem.tryPlace();

    // 7. Retro Arcade Cabinet (Lvl 1) along right wall
    this.placementSystem.setBuildItem(BUILDABLE_ITEMS.find((i) => i.id === 'arcade_lvl1'));
    this.placementSystem.updateHover(new THREE.Vector3(4.5, 0, 3));
    await this.placementSystem.tryPlace();

    // 8. Lounge Sofa (Lvl 1) along left wall
    this.placementSystem.setBuildItem(BUILDABLE_ITEMS.find((i) => i.id === 'sofa_lvl1'));
    this.placementSystem.updateHover(new THREE.Vector3(-5, 0, 2));
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
        this.expansionSystem.setHovered(false);
      } else {
        // Raycast against 3D floor expansion marker
        this.raycaster.setFromCamera(this.mousePos, this.cameraController.camera);
        const targets = this.expansionSystem.getRaycastTargets();
        const hits = this.raycaster.intersectObjects(targets, true);
        if (hits.length > 0) {
          this.expansionSystem.setHovered(true);
          canvas.style.cursor = 'pointer';
        } else {
          this.expansionSystem.setHovered(false);
          canvas.style.cursor = 'default';
        }
      }
    });

    canvas.addEventListener('pointerup', async (e) => {
      const dist = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
      if (dist > 10) return; // Allow small mouse movement during click

      this.mousePos.x = (e.clientX / window.innerWidth) * 2 - 1;
      this.mousePos.y = -(e.clientY / window.innerHeight) * 2 + 1;
      this.raycaster.setFromCamera(this.mousePos, this.cameraController.camera);

      if (this.placementSystem.activeItem) {
        if (e.button === 0) {
          await this.placementSystem.tryPlace();
        } else if (e.button === 2) {
          this.placementSystem.setBuildItem(undefined);
          this.buildMenu.showBuildControls(false);
        }
      } else {
        if (e.button === 0) {
          // 1. Check if clicked the floor expansion marker or preview zone
          const expansionTargets = this.expansionSystem.getRaycastTargets();
          const expansionHits = this.raycaster.intersectObjects(expansionTargets, true);
          if (expansionHits.length > 0) {
            await this.expansionSystem.tryExpand();
            return;
          }

          // 2. Normal selection raycast
          const intersects = this.raycaster.intersectObjects(this.sceneManager.scene.children, true);
          if (intersects.length > 0) {
            this.placementSystem.handleClickSelect(intersects[0].object);
          } else {
            this.placementSystem.handleClickSelect(null);
          }
        }
      }
    });

    // M key shortcut: Move selected item or item under cursor
    window.addEventListener('keydown', (e) => {
      if (e.key === 'm' || e.key === 'M') {
        if (!this.placementSystem.isMovingItem && !this.placementSystem.activeItem) {
          if (!this.placementSystem.moveSelectedItem()) {
            this.raycaster.setFromCamera(this.mousePos, this.cameraController.camera);
            const intersects = this.raycaster.intersectObjects(this.sceneManager.scene.children, true);
            if (intersects.length > 0) {
              this.placementSystem.handleClickSelect(intersects[0].object);
              this.placementSystem.moveSelectedItem();
            }
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
    this.expansionSystem.update(elapsedTime);

    // Update stations RGB animations
    this.placementSystem.stations.forEach((station) => {
      station.update(elapsedTime);
    });

    // Facility passive revenue tick (Every in-game hour ~ 15 real seconds)
    this.facilityRevenueTimer += deltaTime;
    if (this.facilityRevenueTimer >= 15.0) {
      this.facilityRevenueTimer = 0;
      this.placementSystem.facilities.forEach((fac) => {
        const rev = fac.currentTier.hourlyRevenueBonus;
        if (rev && rev > 0) {
          this.economySystem.earn(rev);
          const icon = fac.type === 'arcade' ? '🕹️' : '🥤';
          this.floatingTextManager.spawn(
            `+$${rev} ${icon}`,
            fac.group.position.clone().add(new THREE.Vector3(0, 1.8, 0)),
            fac.type === 'arcade' ? '#c084fc' : '#34d399'
          );
        }
      });
    }

    // Update TopBar HUD
    this.topBar.updateValues(this.customerSystem.getActiveCustomerCount());

    // Render 3D Scene
    this.sceneManager.render(this.cameraController.camera);
  };
}
