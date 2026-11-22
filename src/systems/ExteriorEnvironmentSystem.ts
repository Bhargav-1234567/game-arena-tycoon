import * as THREE from 'three';
import { AssetManager } from '../services/AssetManager.ts';

export interface ExteriorVehicle {
  mesh: THREE.Group;
  laneZ: number;
  speed: number;
  direction: 1 | -1; // 1: West -> East (+X), -1: East -> West (-X)
  minX: number;
  maxX: number;
}

export interface ExteriorPedestrian {
  group: THREE.Group;
  mixer: THREE.AnimationMixer;
  walkAction?: THREE.AnimationAction;
  minX: number;
  maxX: number;
  z: number;
  speed: number;
  direction: 1 | -1;
  turnPauseTimer: number;
}

export class ExteriorEnvironmentSystem {
  public group: THREE.Group = new THREE.Group();
  private scene: THREE.Scene;

  private vehicles: ExteriorVehicle[] = [];
  private pedestrians: ExteriorPedestrian[] = [];

  // Exterior customer navigation waypoints
  public readonly doorwayPoint: THREE.Vector3 = new THREE.Vector3(0, 0, 8.0);
  public readonly forecourtPoint: THREE.Vector3 = new THREE.Vector3(0, 0, 10.5);
  public readonly insideEntryPoint: THREE.Vector3 = new THREE.Vector3(0, 0, 6.8);

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.group.name = 'ExteriorEnvironment';
    this.scene.add(this.group);
  }

  public async init() {
    this.buildGroundNetwork();
    await this.buildBuildings();
    await this.buildStreetProps();
    await this.initVehicles();
    await this.initAmbientPedestrians();
  }

  /**
   * 1. Ground & Road Network:
   * Builds the base terrain, asphalt 2-lane road, road markings, zebra crosswalk, and concrete sidewalks.
   */
  private buildGroundNetwork() {
    // 1.1 Base ground terrain plane
    const baseGeo = new THREE.PlaneGeometry(80, 64);
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x1e2430,
      roughness: 0.95,
      metalness: 0.05
    });
    const baseMesh = new THREE.Mesh(baseGeo, baseMat);
    baseMesh.rotation.x = -Math.PI / 2;
    baseMesh.position.set(2, -0.06, 2);
    baseMesh.receiveShadow = true;
    this.group.add(baseMesh);

    // 1.2 Two-Lane Asphalt Road (Z: 13.0 to 18.5)
    const roadW = 76;
    const roadD = 5.5;
    const roadGeo = new THREE.PlaneGeometry(roadW, roadD);
    const roadMat = new THREE.MeshStandardMaterial({
      color: 0x272a33,
      roughness: 0.88,
      metalness: 0.12
    });
    const roadMesh = new THREE.Mesh(roadGeo, roadMat);
    roadMesh.rotation.x = -Math.PI / 2;
    roadMesh.position.set(2, 0.005, 15.75);
    roadMesh.receiveShadow = true;
    this.group.add(roadMesh);

    // 1.3 Road Markings: Dashed Yellow Center Line & Solid White Edges
    const centerLineGroup = new THREE.Group();
    const dashLength = 1.8;
    const dashGap = 1.5;
    const dashW = 0.16;
    const dashMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b });
    const dashGeo = new THREE.PlaneGeometry(dashLength, dashW);

    for (let x = -34; x < 38; x += dashLength + dashGap) {
      // Leave crosswalk clear (X in [-2, 2])
      if (x > -2.2 && x < 2.2) continue;
      const dash = new THREE.Mesh(dashGeo, dashMat);
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(x + dashLength / 2, 0.015, 15.75);
      centerLineGroup.add(dash);
    }
    this.group.add(centerLineGroup);

    // Solid White Edge Lines
    const edgeMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
    const edgeGeo = new THREE.PlaneGeometry(roadW, 0.14);

    const edgeNorth = new THREE.Mesh(edgeGeo, edgeMat);
    edgeNorth.rotation.x = -Math.PI / 2;
    edgeNorth.position.set(2, 0.015, 13.35);
    this.group.add(edgeNorth);

    const edgeSouth = new THREE.Mesh(edgeGeo, edgeMat);
    edgeSouth.rotation.x = -Math.PI / 2;
    edgeSouth.position.set(2, 0.015, 18.15);
    this.group.add(edgeSouth);

    // White Zebra Crosswalk in front of store entrance (X in [-1.6, 1.6], Z in [13.2, 18.3])
    const crosswalkStripeGeo = new THREE.PlaneGeometry(0.5, 4.8);
    const crosswalkMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.92 });
    for (let x = -1.5; x <= 1.5; x += 0.75) {
      const stripe = new THREE.Mesh(crosswalkStripeGeo, crosswalkMat);
      stripe.rotation.x = -Math.PI / 2;
      stripe.position.set(x, 0.018, 15.75);
      this.group.add(stripe);
    }

    // 1.4 Sidewalks & Curbs
    const sidewalkMat = new THREE.MeshStandardMaterial({
      color: 0x828b9c,
      roughness: 0.82,
      metalness: 0.08
    });
    const curbMat = new THREE.MeshStandardMaterial({
      color: 0x606775,
      roughness: 0.75,
      metalness: 0.15
    });

    // Front Sidewalk (Z: 8.0 to 13.0)
    const frontWalkGeo = new THREE.PlaneGeometry(68, 5.0);
    const frontWalkMesh = new THREE.Mesh(frontWalkGeo, sidewalkMat);
    frontWalkMesh.rotation.x = -Math.PI / 2;
    frontWalkMesh.position.set(2, 0.04, 10.5);
    frontWalkMesh.receiveShadow = true;
    this.group.add(frontWalkMesh);

    // Front Curb (raised 0.10m step along Z = 13.0)
    const frontCurbGeo = new THREE.BoxGeometry(68, 0.12, 0.22);
    const frontCurbMesh = new THREE.Mesh(frontCurbGeo, curbMat);
    frontCurbMesh.position.set(2, 0.05, 12.98);
    frontCurbMesh.receiveShadow = true;
    frontCurbMesh.castShadow = true;
    this.group.add(frontCurbMesh);

    // Opposite Sidewalk (Z: 18.5 to 25.5)
    const oppWalkGeo = new THREE.PlaneGeometry(68, 7.0);
    const oppWalkMesh = new THREE.Mesh(oppWalkGeo, sidewalkMat);
    oppWalkMesh.rotation.x = -Math.PI / 2;
    oppWalkMesh.position.set(2, 0.04, 22.0);
    oppWalkMesh.receiveShadow = true;
    this.group.add(oppWalkMesh);

    // Opposite Curb along Z = 18.5
    const oppCurbGeo = new THREE.BoxGeometry(68, 0.12, 0.22);
    const oppCurbMesh = new THREE.Mesh(oppCurbGeo, curbMat);
    oppCurbMesh.position.set(2, 0.05, 18.52);
    oppCurbMesh.receiveShadow = true;
    oppCurbMesh.castShadow = true;
    this.group.add(oppCurbMesh);

    // Flanking Pavements: West (X: -26 to -10, Z: -14 to 8) and East (X: 14 to 30, Z: -14 to 8)
    const flankWestGeo = new THREE.PlaneGeometry(16, 22);
    const flankWestMesh = new THREE.Mesh(flankWestGeo, sidewalkMat);
    flankWestMesh.rotation.x = -Math.PI / 2;
    flankWestMesh.position.set(-18, 0.03, -3);
    flankWestMesh.receiveShadow = true;
    this.group.add(flankWestMesh);

    const flankEastGeo = new THREE.PlaneGeometry(16, 22);
    const flankEastMesh = new THREE.Mesh(flankEastGeo, sidewalkMat);
    flankEastMesh.rotation.x = -Math.PI / 2;
    flankEastMesh.position.set(22, 0.03, -3);
    flankEastMesh.receiveShadow = true;
    this.group.add(flankEastMesh);

    // Back Alley (Z: -14 to -24, X: -16 to 20)
    const alleyMat = new THREE.MeshStandardMaterial({ color: 0x3d4350, roughness: 0.92 });
    const alleyGeo = new THREE.PlaneGeometry(36, 10);
    const alleyMesh = new THREE.Mesh(alleyGeo, alleyMat);
    alleyMesh.rotation.x = -Math.PI / 2;
    alleyMesh.position.set(2, 0.02, -19);
    alleyMesh.receiveShadow = true;
    this.group.add(alleyMesh);
  }

  /**
   * 2. Neighbouring Buildings:
   * Places commercial low-poly buildings on the opposite side of the avenue and flanking districts.
   */
  private async buildBuildings() {
    const assetMgr = AssetManager.getInstance();

    const buildingDefs = [
      // Opposite side of Avenue (Z = 23.5 to 25.0, facing south towards the gaming shop)
      { path: '/assets/models/environment/city/Big Building.glb', x: 2.0, z: 24.5, rotY: Math.PI, scale: 1.1 },
      { path: '/assets/models/environment/city/Building Green.glb', x: -6.5, z: 24.0, rotY: Math.PI, scale: 1.15 },
      { path: '/assets/models/environment/city/Brown Building.glb', x: 9.5, z: 24.0, rotY: Math.PI, scale: 1.15 },
      { path: '/assets/models/environment/city/Pizza Corner.glb', x: -14.5, z: 24.0, rotY: Math.PI, scale: 1.2 },
      { path: '/assets/models/environment/city/Building Red.glb', x: 17.0, z: 24.0, rotY: Math.PI, scale: 1.15 },
      { path: '/assets/models/environment/city/Brown Building.glb', x: -21.0, z: 24.0, rotY: Math.PI, scale: 1.15 },
      { path: '/assets/models/environment/city/Big Building.glb', x: 24.5, z: 24.5, rotY: Math.PI, scale: 1.1 },

      // West Flanking District (X <= -14.5, framing left side of arena)
      { path: '/assets/models/environment/city/Brown Building.glb', x: -15.5, z: 4.0, rotY: -Math.PI / 2, scale: 1.15 },
      { path: '/assets/models/environment/city/Building Red Corner.glb', x: -15.5, z: -3.0, rotY: -Math.PI / 2, scale: 1.15 },
      { path: '/assets/models/environment/city/Pizza Corner.glb', x: -15.5, z: -9.0, rotY: -Math.PI / 2, scale: 1.15 },

      // East Flanking District (X >= 18.5, framing right side of arena)
      { path: '/assets/models/environment/city/Big Building.glb', x: 20.0, z: 4.0, rotY: Math.PI / 2, scale: 1.1 },
      { path: '/assets/models/environment/city/Building Green.glb', x: 20.0, z: -3.0, rotY: Math.PI / 2, scale: 1.15 },
      { path: '/assets/models/environment/city/Building Red.glb', x: 20.0, z: -9.0, rotY: Math.PI / 2, scale: 1.15 }
    ];

    for (const def of buildingDefs) {
      try {
        const model = await assetMgr.loadModel(def.path);
        model.position.set(def.x, 0.04, def.z);
        model.rotation.y = def.rotY;
        model.scale.setScalar(def.scale);

        model.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });

        this.group.add(model);
      } catch (err) {
        console.warn(`[Exterior] Failed to load building ${def.path}:`, err);
      }
    }
  }

  /**
   * 3. Street Props:
   * Adds trees, benches, street lamps, bus stop, ATM, trash cans, and flower pots.
   */
  private async buildStreetProps() {
    const assetMgr = AssetManager.getInstance();

    // 3.1 Trees along sidewalk curbs (Tree.glb is in cm units, so normalized to 0.013 scale = ~5.5m tall)
    const treePositions = [
      { x: -5.5, z: 12.0 },
      { x: 5.5, z: 12.0 },
      { x: -11.5, z: 12.0 },
      { x: 11.5, z: 12.0 },
      { x: -18.0, z: 12.0 },
      { x: 18.0, z: 12.0 },
      // Opposite sidewalk trees
      { x: -3.5, z: 19.5 },
      { x: 12.5, z: 19.5 },
      { x: -12.5, z: 19.5 },
      { x: 20.5, z: 19.5 }
    ];

    for (const pos of treePositions) {
      try {
        const tree = await assetMgr.loadModel('/assets/models/environment/city/Tree.glb');
        tree.position.set(pos.x, 0.04, pos.z);
        tree.scale.setScalar(0.013);
        tree.traverse((c) => {
          if ((c as THREE.Mesh).isMesh) {
            c.castShadow = true;
            c.receiveShadow = true;
          }
        });
        this.group.add(tree);
      } catch (e) {
        // Fallback procedural low-poly tree if model has texture loader issues
        const trunkGeo = new THREE.CylinderGeometry(0.14, 0.20, 1.8, 6);
        const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.9 });
        const trunk = new THREE.Mesh(trunkGeo, trunkMat);
        trunk.position.set(pos.x, 0.9, pos.z);
        trunk.castShadow = true;

        const foliageGeo = new THREE.ConeGeometry(1.2, 2.6, 6);
        const foliageMat = new THREE.MeshStandardMaterial({ color: 0x2e7d32, roughness: 0.8 });
        const foliage = new THREE.Mesh(foliageGeo, foliageMat);
        foliage.position.set(pos.x, 2.6, pos.z);
        foliage.castShadow = true;

        this.group.add(trunk);
        this.group.add(foliage);
      }
    }

    // 3.2 Benches on the front sidewalk
    const benchPositions = [
      { x: -3.8, z: 10.2, rotY: 0 },
      { x: 3.8, z: 10.2, rotY: 0 }
    ];
    for (const b of benchPositions) {
      try {
        const bench = await assetMgr.loadModel('/assets/models/environment/city/Bench.glb');
        bench.position.set(b.x, 0.04, b.z);
        bench.rotation.y = b.rotY;
        bench.scale.setScalar(0.70);
        bench.traverse((c) => { if ((c as THREE.Mesh).isMesh) c.castShadow = true; });
        this.group.add(bench);
      } catch (err) {}
    }

    // 3.3 Bus Stop on opposite sidewalk (Bus Stop.glb is scaled to 0.035)
    try {
      const busStop = await assetMgr.loadModel('/assets/models/environment/city/Bus Stop.glb');
      busStop.position.set(6.5, 0.04, 19.8);
      busStop.rotation.y = Math.PI;
      busStop.scale.setScalar(0.038);
      busStop.traverse((c) => { if ((c as THREE.Mesh).isMesh) c.castShadow = true; });
      this.group.add(busStop);
    } catch (err) {}

    // 3.4 ATM mounted by the store front wall
    try {
      const atm = await assetMgr.loadModel('/assets/models/environment/city/ATM.glb');
      atm.position.set(3.2, 0.04, 8.35);
      atm.rotation.y = 0;
      atm.scale.setScalar(0.85);
      this.group.add(atm);
    } catch (err) {}

    // 3.5 Trash Can & Flower Pots flanking the doorway
    try {
      const trashCan = await assetMgr.loadModel('/assets/models/environment/city/Trash Can.glb');
      trashCan.position.set(-3.2, 0.04, 8.4);
      trashCan.scale.setScalar(0.35);
      trashCan.traverse((c) => { if ((c as THREE.Mesh).isMesh) c.castShadow = true; });
      this.group.add(trashCan);
    } catch (err) {}

    const potPositions = [
      { x: -1.7, z: 8.3 },
      { x: 1.7, z: 8.3 }
    ];
    for (const potPos of potPositions) {
      try {
        const pot = await assetMgr.loadModel('/assets/models/environment/city/Flower Pot.glb');
        pot.position.set(potPos.x, 0.04, potPos.z);
        pot.scale.setScalar(0.8);
        pot.traverse((c) => { if ((c as THREE.Mesh).isMesh) c.castShadow = true; });
        this.group.add(pot);
      } catch (err) {}
    }

    // 3.6 Back Alley Dumpster & Trash Bags
    try {
      const dumpster = await assetMgr.loadModel('/assets/models/environment/city/Dumpster.glb');
      dumpster.position.set(-2.5, 0.02, -17.5);
      dumpster.rotation.y = Math.PI * 0.15;
      dumpster.scale.setScalar(0.85);
      dumpster.traverse((c) => { if ((c as THREE.Mesh).isMesh) c.castShadow = true; });
      this.group.add(dumpster);
    } catch (err) {}
  }

  /**
   * 4. Vehicle System:
   * 3 low-poly cars that drive smoothly along the 2-lane road and wrap seamlessly.
   */
  private async initVehicles() {
    const assetMgr = AssetManager.getInstance();

    const carConfigs = [
      // Lane 1: West -> East (+X), Z = 14.3
      { model: '/assets/models/environment/city/Car.glb', startX: -18, laneZ: 14.3, speed: 4.8, dir: 1 as const },
      { model: '/assets/models/environment/city/Sports Car.glb', startX: 12, laneZ: 14.3, speed: 5.6, dir: 1 as const },

      // Lane 2: East -> West (-X), Z = 16.9
      { model: '/assets/models/environment/city/SUV.glb', startX: 18, laneZ: 16.9, speed: 4.4, dir: -1 as const },
      { model: '/assets/models/environment/city/Police Car.glb', startX: -8, laneZ: 16.9, speed: 5.2, dir: -1 as const }
    ];

    for (const cfg of carConfigs) {
      try {
        const car = await assetMgr.loadModel(cfg.model);
        car.scale.setScalar(0.95);
        car.position.set(cfg.startX, 0.02, cfg.laneZ);
        car.rotation.y = cfg.dir === 1 ? Math.PI / 2 : -Math.PI / 2;

        car.traverse((c) => {
          if ((c as THREE.Mesh).isMesh) {
            c.castShadow = true;
          }
        });

        this.group.add(car);
        this.vehicles.push({
          mesh: car,
          laneZ: cfg.laneZ,
          speed: cfg.speed,
          direction: cfg.dir,
          minX: -34,
          maxX: 36
        });
      } catch (err) {
        console.warn(`[Exterior] Failed to load vehicle ${cfg.model}:`, err);
      }
    }
  }

  /**
   * 5. Ambient Pedestrians:
   * Visual NPCs that walk back and forth along the sidewalk without interacting with the game economy.
   */
  private async initAmbientPedestrians() {
    const assetMgr = AssetManager.getInstance();

    const pedConfigs = [
      // West sidewalk walker (patrols between X = -14 and -3.0 at Z = 11.2)
      { model: '/assets/models/characters/men/Man in Long Sleeves.glb', minX: -14.0, maxX: -3.0, z: 11.2, speed: 1.4 },
      // East sidewalk walker (patrols between X = +3.0 and +14.0 at Z = 11.2)
      { model: '/assets/models/characters/women/Woman Casual.glb', minX: 3.0, maxX: 14.0, z: 11.2, speed: 1.3 },
      // Opposite sidewalk walker (patrols between X = -10 and +10 at Z = 20.0)
      { model: '/assets/models/characters/women/Woman in Tank Top.glb', minX: -10.0, maxX: 10.0, z: 20.0, speed: 1.5 }
    ];

    for (const cfg of pedConfigs) {
      try {
        const model = await assetMgr.loadModel(cfg.model);
        model.scale.setScalar(0.30);
        const group = new THREE.Group();
        group.add(model);
        group.position.set(cfg.minX, 0.04, cfg.z);

        model.traverse((c) => {
          if ((c as THREE.SkinnedMesh).isSkinnedMesh) {
            c.castShadow = true;
            c.frustumCulled = false;
          }
        });

        const animations = (model.userData.animations as THREE.AnimationClip[]) || [];
        let mixer: THREE.AnimationMixer | undefined;
        let walkAction: THREE.AnimationAction | undefined;

        if (animations.length > 0) {
          mixer = new THREE.AnimationMixer(model);
          const walkClip = animations.find((a) => a.name.toLowerCase().includes('walk')) || animations[0];
          walkAction = mixer.clipAction(walkClip);
          walkAction.play();
        }

        if (mixer) {
          this.group.add(group);
          this.pedestrians.push({
            group,
            mixer,
            walkAction,
            minX: cfg.minX,
            maxX: cfg.maxX,
            z: cfg.z,
            speed: cfg.speed,
            direction: 1,
            turnPauseTimer: 0
          });
        }
      } catch (err) {
        console.warn(`[Exterior] Failed to load ambient pedestrian ${cfg.model}:`, err);
      }
    }
  }

  /**
   * Returns a random exterior sidewalk spawn position.
   */
  public getExteriorSpawnPoint(): THREE.Vector3 {
    const isLeft = Math.random() > 0.5;
    const x = isLeft ? -13.0 : 13.0;
    return new THREE.Vector3(x, 0.04, 10.5);
  }

  /**
   * Returns a random exterior sidewalk despawn destination for leaving customers.
   */
  public getExteriorDespawnPoint(): THREE.Vector3 {
    const isLeft = Math.random() > 0.5;
    const x = isLeft ? -15.0 : 15.0;
    return new THREE.Vector3(x, 0.04, 10.5);
  }

  /**
   * Frame update: called from Game.animate()
   */
  public update(deltaTime: number) {
    // 1. Move vehicles along the road and wrap at boundaries
    for (const v of this.vehicles) {
      v.mesh.position.x += v.speed * v.direction * deltaTime;
      if (v.direction === 1 && v.mesh.position.x > v.maxX) {
        v.mesh.position.x = v.minX;
      } else if (v.direction === -1 && v.mesh.position.x < v.minX) {
        v.mesh.position.x = v.maxX;
      }
    }

    // 2. Move ambient pedestrians
    for (const p of this.pedestrians) {
      p.mixer.update(deltaTime);

      if (p.turnPauseTimer > 0) {
        p.turnPauseTimer -= deltaTime;
        continue;
      }

      p.group.position.x += p.speed * p.direction * deltaTime;

      if (p.direction === 1 && p.group.position.x >= p.maxX) {
        p.direction = -1;
        p.group.rotation.y = -Math.PI / 2;
        p.turnPauseTimer = 0.8;
      } else if (p.direction === -1 && p.group.position.x <= p.minX) {
        p.direction = 1;
        p.group.rotation.y = Math.PI / 2;
        p.turnPauseTimer = 0.8;
      }
    }
  }
}
