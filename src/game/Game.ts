import { ORIGINAL_CHARACTERS } from '../data/characters.ts';
import { SECONDS_PER_GAME_HOUR } from '../data/simulation.ts';
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
import { ExteriorEnvironmentSystem } from '../systems/ExteriorEnvironmentSystem.ts';
import { TopBar } from '../ui/TopBar.ts';
import { BuildMenu } from '../ui/BuildMenu.ts';
import { StationInspector } from '../ui/StationInspector.ts';
import { StatsModal } from '../ui/StatsModal.ts';
import { FloatingTextManager } from '../ui/FloatingTextManager.ts';
import { BUILDABLE_ITEMS } from '../data/assets.ts';
import { SaveManager } from '../services/SaveManager.ts';
import type { GameSaveState } from '../services/SaveManager.ts';
import { WorkshopSystem } from '../systems/WorkshopSystem.ts';
import type { WorkshopState } from '../systems/WorkshopSystem.ts';
import { WorkshopUI } from '../ui/WorkshopUI.ts';
import { NeighborhoodSystem } from '../systems/NeighborhoodSystem.ts';
import type { NeighborhoodState, WorldView } from '../systems/NeighborhoodSystem.ts';
import { NeighborhoodUI } from '../ui/NeighborhoodUI.ts';

export class Game {
  public neighborhood: NeighborhoodSystem;
  public neighborhoodUI: NeighborhoodUI;
  public workshop: WorkshopSystem;
  public workshopUI: WorkshopUI;
  private restored = SaveManager.getInstance().load();
  private ready = false;
  private autoSaveTimer = 0;
  private pausedBackgroundDirty = true;
  public sceneManager: SceneManager;
  public cameraController: CameraController;
  public gridSystem: GridSystem;
  public placementSystem: PlacementSystem;
  public customerSystem: CustomerSystem;
  public expansionSystem: ExpansionSystem;
  public exteriorEnvironmentSystem: ExteriorEnvironmentSystem;
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
    this.placementSystem.getTechnicianMultiplier = () => this.staffSystem.getTechnicianMultiplier();

    this.customerSystem = new CustomerSystem(
      this.sceneManager.scene,
      this.placementSystem,
      this.economySystem
    );

    this.customerSystem.getCashierMultiplier = () => this.staffSystem.getCashierMultiplier();

    this.expansionSystem = new ExpansionSystem(
      this.sceneManager.scene,
      this.gridSystem,
      this.economySystem,
      this.particleSystem
    );
    this.expansionSystem.collisionSystem = this.customerSystem.collisionSystem;
    this.exteriorEnvironmentSystem = new ExteriorEnvironmentSystem(this.sceneManager.scene);

    // Setup UI components
    this.topBar = new TopBar(uiContainer, this.economySystem);
    this.buildMenu = new BuildMenu(uiContainer, this.placementSystem, this.economySystem);
    this.stationInspector = new StationInspector(uiContainer, this.economySystem, this.particleSystem);
    this.statsModal = new StatsModal(uiContainer, this.economySystem, this.staffSystem, this.placementSystem);
    this.floatingTextManager = new FloatingTextManager(uiContainer, this.cameraController.camera);
    this.workshop = new WorkshopSystem(this.restored?.workshop);
    this.workshop.stationExists = (id) => this.placementSystem.stations.has(id);
    this.workshop.persist = (draft) => this.save(draft);
    this.workshopUI = new WorkshopUI(uiContainer, this.workshop);
    this.neighborhood = new NeighborhoodSystem(this.restored?.neighborhood);
    this.neighborhood.getCash = () => this.economySystem.cash;
    this.neighborhood.persist = (draft, cash, reputation) => {
      if (!this.save(this.workshop.state, draft, cash, reputation)) return false;
      this.economySystem.cash += cash;
      this.economySystem.reputation = Math.min(100, Math.max(0, this.economySystem.reputation + reputation));
      return true;
    };
    this.neighborhoodUI = new NeighborhoodUI(uiContainer, this.neighborhood);
    this.neighborhoodUI.canOpen = () => this.ready && !this.workshopUI.isOpen && !this.placementSystem.busy && !this.placementSystem.isMovingItem;
    this.neighborhoodUI.onView = (view) => this.switchView(view);
    this.neighborhoodUI.onPuzzle = () => this.workshopUI.open('puzzle');
    this.neighborhoodUI.onZoom = (factor) => this.cameraController.zoomBy(factor);
    this.neighborhoodUI.onExpand = () => this.expansionSystem.tryExpand();
    this.neighborhoodUI.getExpansion = () => ({ stage: this.expansionSystem.currentStage,
      price: this.expansionSystem.getCurrentPrice(), name: this.expansionSystem.getCurrentStageDef()?.name ?? 'District flagship complete' });
    this.neighborhoodUI.onModalChange = (open) => { this.cameraController.enabled = !open && !this.workshopUI.isOpen; this.statsModal.close(); };
    this.neighborhood.subscribe(() => this.updateNeighborhood());
    this.neighborhood.onBusArrival = () => this.exteriorEnvironmentSystem.arriveBus();
    this.exteriorEnvironmentSystem.onBusStop = () => this.customerSystem.queueBusArrival();
    this.exteriorEnvironmentSystem.crossingOccupied = () => this.customerSystem.getCrossingCount() > 0;
    this.customerSystem.getSpawnInterval = () => this.neighborhood.getSpawnInterval(this.economySystem.reputation);
    this.customerSystem.onCustomerServed = () => {
      try { this.neighborhood.recordCustomer(); } catch (error) { console.warn('Tournament progress could not be saved:', error); }
    };
    this.workshopUI.getStations = () => [...this.placementSystem.stations.values()].map((station, i) => ({
      id: station.id, name: `PC ${i + 1} · ${station.currentPC.name}`
    }));
    this.workshopUI.canOpen = () => this.ready && !this.placementSystem.busy && !this.placementSystem.isMovingItem;
    this.workshopUI.onModalChange = (open) => {
      this.pausedBackgroundDirty = true;
      this.cameraController.enabled = !open;
      if (open) {
        this.neighborhoodUI.close();
        this.statsModal.close();
        void this.placementSystem.setBuildItem(undefined);
        this.buildMenu.hide();
        this.stationInspector.closeAll();
      }
    };
    this.stationInspector.setWorkshop(this.workshop);
    this.statsModal.onSave = () => this.save();
    this.expansionSystem.onSave = () => { this.save(); };
    window.addEventListener('pagehide', () => { this.save(); });
    window.addEventListener('resize', () => { this.pausedBackgroundDirty = true; });
    window.addEventListener('storage', (event) => {
      if (event.key !== 'gaming_zone_tycoon_save_v1' || !this.ready) return;
      this.ready = false;
      this.cameraController.enabled = false;
      const warning = document.createElement('section');
      warning.className = 'startup-error'; warning.setAttribute('role', 'alert');
      const detail = document.createElement('p'); detail.textContent = 'This lounge changed in another tab. Reload to continue with the latest progress.';
      const reload = document.createElement('button'); reload.className = 'workshop-primary'; reload.textContent = 'Reload lounge'; reload.onclick = () => location.reload();
      warning.append(detail, reload); uiContainer.append(warning);
    });

    this.expansionSystem.onFloatingText = (text, pos, color) => {
      this.floatingTextManager.spawn(text, pos, color);
    };

    this.expansionSystem.onExpansionChanged = (_stage, nextPrice) => {
      this.placementSystem.refreshLayout();
      this.buildMenu.updateExpandButton(nextPrice);
      this.exteriorEnvironmentSystem.setProperty(this.expansionSystem.currentBounds, this.neighborhood.state, true);
      this.applyView(this.neighborhood.state.view);
      this.neighborhoodUI.refresh();
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
      if (this.placementSystem.busy || this.placementSystem.isMovingItem) return;
      if (target.type === 'station' && (target.entity.isOccupied || target.entity.currentGamerId || target.entity.isUpgrading)) {
        this.stationInspector.inspectStation(target.entity);
        return;
      }
      if ((target.type === 'reception' || target.type === 'facility') && target.entity.isUpgrading) return;
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
      // Original in-house meshes, rigs, textures and animation clips.
      ...ORIGINAL_CHARACTERS.map((character) => character.gamePath),
      // Exterior City Environment & Vehicles
      '/assets/models/environment/city/Big Building.glb',
      '/assets/models/environment/city/Building Green.glb',
      '/assets/models/environment/city/Brown Building.glb',
      '/assets/models/environment/city/Building Red.glb',
      '/assets/models/environment/city/Pizza Corner.glb',
      '/assets/models/environment/city/Car.glb',
      '/assets/models/environment/city/Sports Car.glb',
      '/assets/models/environment/city/SUV.glb',
      '/assets/models/environment/city/Police Car.glb'
    ]);

    // 2. Build Floor Grid
    await this.gridSystem.buildFloor(this.sceneManager.scene);

    // 3. Build Perimeter Walls & Doorway from Building Kit
    await this.expansionSystem.setup();
    this.buildMenu.updateExpandButton(this.expansionSystem.getCurrentPrice());

    // 4. Initialize Exterior City Environment & Camera Borders
    this.cameraController.setPanBounds(-14.0, 18.0, -12.0, 14.0);
    await this.exteriorEnvironmentSystem.init();

    // 5. Place Initial Starting Assets (Reception Counter + Receptionist + 2 Gaming Stations + Facilities)
    if (this.restored) {
      await this.placementSystem.restore(this.restored);
      const economy = this.restored.economy;
      this.economySystem.cash = economy.cash;
      this.economySystem.reputation = economy.reputation;
      this.economySystem.day = economy.day;
      this.economySystem.timeMinutes = economy.timeMinutes;
      for (const role of this.staffSystem.roles) {
        role.hiredCount = this.restored.staff.find((entry) => entry.id === role.id)?.hiredCount ?? role.hiredCount;
      }
      await this.customerSystem.setupReceptionist();
    } else {
      await this.setupInitialGamingRoom();
    }

    // 6. Spawn starting customer immediately
    await this.customerSystem.spawnInitialCustomer();
    this.ready = true;
    this.updateNeighborhood();
    this.applyView(this.neighborhood.state.view, true);
    if (!this.save()) {
      const warning = document.createElement('p');
      warning.className = 'save-warning';
      warning.setAttribute('role', 'alert');
      warning.textContent = 'Browser storage is unavailable. Puzzle rewards and inventory changes require saving. Enable storage and reload.';
      document.getElementById('ui-layer')?.append(warning);
    }

    // 7. Start Game Render Loop
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
    this.placementSystem.updateHover(new THREE.Vector3(-5, 0, 3));
    await this.placementSystem.tryPlace();

    // Clear active build item
    this.placementSystem.setBuildItem(undefined);
    this.buildMenu.showBuildControls(false);
  }

  private setupPointerEvents(canvas: HTMLCanvasElement) {
    let pointerDownPos = new THREE.Vector2();

    canvas.addEventListener('pointerdown', (e) => {
      if (this.workshopUI.isOpen || this.neighborhoodUI.isOpen) return;
      pointerDownPos.set(e.clientX, e.clientY);
    });

    canvas.addEventListener('pointermove', (e) => {
      if (this.workshopUI.isOpen || this.neighborhoodUI.isOpen || this.neighborhood.state.view === 'neighborhood') return;
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
      if (this.workshopUI.isOpen || this.neighborhoodUI.isOpen || this.neighborhood.state.view === 'neighborhood' || this.placementSystem.busy) return;
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
          const intersects = this.raycaster.intersectObjects(this.placementSystem.getPickTargets(), true);
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
      if (this.workshopUI.isOpen || this.neighborhoodUI.isOpen || this.statsModal.isModalOpen() || this.neighborhood.state.view === 'neighborhood') return;
      if (e.key === 'm' || e.key === 'M') {
        if (!this.placementSystem.isMovingItem && !this.placementSystem.activeItem) {
          if (!this.placementSystem.moveSelectedItem()) {
            this.raycaster.setFromCamera(this.mousePos, this.cameraController.camera);
            const intersects = this.raycaster.intersectObjects(this.placementSystem.getPickTargets(), true);
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
    this.cameraController.update(deltaTime);
    this.neighborhoodUI.update(this.cameraController.camera);
    document.body.dataset.cameraMoving = String(this.cameraController.isTransitioning);
    document.body.dataset.streetCustomers = String(this.customerSystem.getStreetCount());
    document.body.dataset.crossingCustomers = String(this.customerSystem.getCrossingCount());
    if (this.workshopUI.isOpen) {
      // The paused lounge is static. Keep its composited frame behind the puzzle.
      if (this.pausedBackgroundDirty) {
        this.sceneManager.render(this.cameraController.camera);
        this.pausedBackgroundDirty = false;
      }
      return;
    }
    this.pausedBackgroundDirty = true;
    if (!this.ready || this.placementSystem.busy) {
      this.sceneManager.render(this.cameraController.camera);
      return;
    }
    this.autoSaveTimer += deltaTime;
    if (this.autoSaveTimer >= 10) { this.autoSaveTimer = 0; this.save(); }

    // System Updates
    this.neighborhood.update(deltaTime);
    const period = this.neighborhood.getLighting(this.economySystem.timeMinutes);
    this.sceneManager.setLighting(period);
    this.exteriorEnvironmentSystem.setLighting(period);
    this.economySystem.update(deltaTime);
    this.customerSystem.update(deltaTime);
    this.stationInspector.updateStatus();
    this.staffSystem.update(deltaTime);
    this.particleSystem.update(deltaTime);
    this.floatingTextManager.update(deltaTime);
    this.expansionSystem.update(elapsedTime);
    this.exteriorEnvironmentSystem.update(deltaTime);

    // Update stations RGB animations
    this.placementSystem.stations.forEach((station) => {
      station.neighborhoodSatisfactionBonus = this.neighborhood.getSatisfactionBonus();
      station.update(elapsedTime);
    });

    // Facility passive revenue tick (Every in-game hour ~ 15 real seconds)
    this.facilityRevenueTimer += deltaTime;
    if (this.facilityRevenueTimer >= SECONDS_PER_GAME_HOUR) {
      this.facilityRevenueTimer -= SECONDS_PER_GAME_HOUR;
      this.placementSystem.facilities.forEach((fac) => {
        const rev = fac.group.visible ? fac.currentTier.hourlyRevenueBonus : 0;
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

  private switchView(view: WorldView): void {
    try { this.neighborhood.setView(view); this.applyView(view); }
    catch (error) { console.warn('View could not be saved:', error); }
  }

  private applyView(view: WorldView, immediate = false): void {
    document.body.dataset.worldView = view;
    this.cameraController.setView(view, this.expansionSystem.currentBounds, immediate);
    this.expansionSystem.setCutaway(view === 'lounge');
    this.exteriorEnvironmentSystem.setView(view);
    if (view === 'neighborhood') { this.stationInspector.closeAll(); this.buildMenu.hide(); void this.placementSystem.setBuildItem(undefined); }
  }

  private updateNeighborhood(): void {
    const state = this.neighborhood.state;
    this.exteriorEnvironmentSystem.setProperty(this.expansionSystem.currentBounds, state);
    this.exteriorEnvironmentSystem.updatePoster(state);
    document.body.dataset.worldView = state.view;
    document.body.dataset.frontageLevel = String(state.frontageLevel);
    if (this.cameraController.mode !== state.view && this.ready) this.applyView(state.view);
  }

  private save(workshop: WorkshopState = this.workshop.state, neighborhood: NeighborhoodState = this.neighborhood.state, cashChange = 0, reputationChange = 0): boolean {
    if (!this.ready || this.placementSystem.busy || this.placementSystem.isMovingItem) return false;
    const snapshot: GameSaveState = {
      version: 2, timestamp: Date.now(), workshop, neighborhood,
      economy: { cash: this.economySystem.cash + cashChange, reputation: Math.min(100, Math.max(0, this.economySystem.reputation + reputationChange)),
        day: this.economySystem.day, timeMinutes: this.economySystem.timeMinutes },
      expansionCount: this.expansionSystem.currentStage,
      stations: [...this.placementSystem.stations.values()].map((station) => ({
        id: station.id, gridX: station.gridX, gridZ: station.gridZ, rotationIndex: station.rotationIndex,
        pcLevel: station.currentPC.level, chairLevel: station.currentChair.level, monitorLevel: station.currentMonitor.level,
        deskLevel: station.currentDesk.level, keyboardLevel: station.currentKeyboard.level,
        mouseLevel: station.currentMouse.level, speakerLevel: station.currentSpeaker.level
      })),
      receptions: [...this.placementSystem.receptionDesks.values()].map((desk) => ({
        id: desk.id, gridX: desk.gridX, gridZ: desk.gridZ, rotationIndex: desk.rotationIndex, level: desk.currentTier.level
      })),
      facilities: [...this.placementSystem.facilities.values()].map((facility) => ({
        id: facility.id, itemId: facility.type, gridX: facility.gridX, gridZ: facility.gridZ,
        rotationIndex: facility.rotationIndex, level: facility.currentTier.level
      })),
      objects: [...this.placementSystem.buildingObjects, ...this.placementSystem.decorObjects].map((object) => ({
        id: object.userData.persistentId ?? object.uuid, itemId: object.userData.item.id,
        gridX: object.userData.gridX, gridZ: object.userData.gridZ, rotationIndex: object.userData.rotationIndex
      })),
      staff: this.staffSystem.roles.map((role) => ({ id: role.id, hiredCount: role.hiredCount }))
    };
    return SaveManager.getInstance().save(snapshot);
  }
}
