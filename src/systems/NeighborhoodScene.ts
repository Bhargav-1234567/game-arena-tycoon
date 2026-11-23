import * as THREE from 'three';
import { AssetManager } from '../services/AssetManager.ts';
import { DISTRICT_PLACES, NAVIGATION, RESERVED_PROPERTY } from '../data/world-layout.ts';
import type { WorldBounds } from '../data/world-layout.ts';
import type { NeighborhoodState, WorldView } from './NeighborhoodSystem.ts';
import { FRONTAGE_NAMES } from './NeighborhoodSystem.ts';

interface Vehicle { mesh: THREE.Group; speed: number; direction: number; }
interface Walker { group: THREE.Group; mixer?: THREE.AnimationMixer; minX: number; maxX: number; speed: number; direction: number; }

export class NeighborhoodScene {
  public group = new THREE.Group();
  private property = new THREE.Group();
  private roof = new THREE.Group();
  private construction = new THREE.Group();
  private vehicles: Vehicle[] = [];
  private walkers: Walker[] = [];
  private lamps: THREE.Mesh[] = [];
  private poster?: THREE.Mesh;
  private shopKey = '';
  private posterKey = '';
  private view: WorldView = 'neighborhood';
  private constructionTime = 0;
  private elapsed = 0;
  private treeCrowns?: THREE.InstancedMesh;
  private bus?: THREE.Group;
  private busPhase: 'away' | 'arriving' | 'stopped' | 'leaving' = 'away';
  private busStopTime = 0;
  public onBusStop?: () => void;
  public crossingOccupied: () => boolean = () => false;

  constructor(scene: THREE.Scene) {
    this.group.name = 'PixelDistrict';
    this.property.name = 'LoungeFrontage'; this.roof.name = 'LoungeRoof';
    this.group.add(this.property, this.roof, this.construction);
    scene.add(this.group);
  }

  async init(): Promise<void> {
    this.ground(); this.buildWorkshop(); this.buildCafe(); this.buildPlaza(); this.streetFurniture();
    await this.buildNeighbors(); await this.initTraffic(); await this.initWalkers();
  }

  private box(parent: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number, color: number, emissive = false): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({
      color, roughness: .8, emissive: emissive ? color : 0, emissiveIntensity: emissive ? .65 : 0
    }));
    mesh.position.set(x, y, z); mesh.castShadow = !emissive; mesh.receiveShadow = true;
    parent.add(mesh); return mesh;
  }

  private text(parent: THREE.Object3D, title: string, subtitle: string, width: number, x: number, y: number, z: number,
    color = '#8af5d5', background = '#142d3b'): THREE.Mesh {
    const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = background; ctx.fillRect(0, 0, 1024, 256);
    ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.font = 'bold 64px system-ui'; ctx.fillText(title, 512, 112, 950);
    ctx.font = '28px system-ui'; ctx.fillStyle = '#dde8e8'; ctx.fillText(subtitle, 512, 185, 950);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, width / 4), new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }));
    mesh.position.set(x, y, z); parent.add(mesh); return mesh;
  }

  private disposeGroup(group: THREE.Group): void {
    for (const child of [...group.children]) {
      child.traverse((node) => {
        if (!(node as THREE.Mesh).isMesh) return;
        const mesh = node as THREE.Mesh; mesh.geometry.dispose();
        for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
          (material as THREE.MeshBasicMaterial).map?.dispose(); material.dispose();
        }
      });
      group.remove(child);
    }
  }

  private ground(): void {
    this.box(this.group, 66, .7, 60, 0, -.5, 5, 0x3d625a);
    this.box(this.group, 58, .14, 46, 0, -.1, 5, 0x76887c);
    this.box(this.group, 62, .12, 5.6, 0, -.01, NAVIGATION.roadCenterZ, 0x283d4b);
    this.box(this.group, 60, .15, 5, 0, -.04, NAVIGATION.sidewalkZ, 0xb6b9a8);
    this.box(this.group, 60, .15, 12, 0, -.04, 25, 0xb0b5a3);
    this.box(this.group, 8, .12, 22, -18, -.06, -3, 0xa4aea0);
    this.box(this.group, 10, .12, 22, 21, -.06, -3, 0xa4aea0);
    this.box(this.group, 26, .04, 24, 2, -.07, -3, 0x788b76);
    const stripes = new THREE.InstancedMesh(new THREE.BoxGeometry(1.5, .02, .12), new THREE.MeshBasicMaterial({ color: 0xf2d38c }), 18);
    const transform = new THREE.Object3D();
    for (let i = 0; i < 18; i++) { transform.position.set(-28 + i * 3.3, .065, 15.75); transform.updateMatrix(); stripes.setMatrixAt(i, transform.matrix); }
    this.group.add(stripes);
    for (let x = -1.6; x < 1.8; x += .7) this.box(this.group, .4, .025, 5, x, .07, 15.75, 0xe9e6d8);
    for (const z of [12.9, 18.6]) this.box(this.group, 60, .18, .2, 0, .04, z, 0xd8dacb);
    this.box(this.group, 6.5, .08, 11, -25.5, -.01, 4, 0x52646a);
    for (let z = 0; z <= 9; z += 3) this.box(this.group, 5.4, .02, .09, -25.5, .05, z, 0xe9e6d8);
    const reserve = RESERVED_PROPERTY;
    for (let z = reserve.minZ; z < reserve.maxZ; z += 2) this.box(this.group, .1, .05, 1, reserve.minX - .3, .04, z, 0xd7cb95);
    for (let x = reserve.minX; x < reserve.maxX; x += 2) this.box(this.group, 1, .05, .1, x, .04, reserve.minZ - .3, 0xd7cb95);
    this.text(this.group, 'ROOM TO GROW', 'Six unlockable lounge wings', 7, 2, .9, -14.3, '#f1d699');
  }

  private buildWorkshop(): void {
    const x = -18, z = 2;
    this.box(this.group, 8, 3.8, 7, x, 1.9, z, 0x335a67);
    this.box(this.group, 8.6, .38, 7.6, x, 3.9, z, 0x233d51);
    for (const offset of [-2.6, 2.6]) this.box(this.group, 1.8, 1.7, .08, x + offset, 1.8, z + 3.55, 0x8cc4ce, true);
    this.box(this.group, 1.4, 2.5, .1, x, 1.25, z + 3.56, 0x183b49);
    this.text(this.group, 'BUILD & BOOT', 'PUZZLE LAB • HARDWARE WORKSHOP', 7.3, x, 3.05, z + 3.64);
    this.box(this.group, 8.5, .16, 1.3, x, 2.55, z + 4, 0x56c4a6);
    this.text(this.group, 'MATCH • EARN • CONNECT', 'Collect your next PC upgrade', 6.2, x, 1.1, z + 3.72);
  }

  private buildCafe(): void {
    const x = 21, z = 2;
    this.box(this.group, 8, 4.1, 7, x, 2.05, z, 0xb7795f);
    this.box(this.group, 8.7, .4, 7.5, x, 4.2, z, 0x714c46);
    this.box(this.group, 6.2, 1.7, .08, x, 1.8, z + 3.56, 0xe8be8a, true);
    this.text(this.group, 'PIXEL BITES', 'COFFEE • SNACKS • GOOD COMPANY', 7.3, x, 3.3, z + 3.65, '#ffe4ae', '#5c3d38');
    for (let i = 0; i < 8; i++) this.box(this.group, 1, .15, 1.5, x - 3.5 + i, 2.6, z + 4, i % 2 ? 0xf0d6aa : 0xc8785f);
    for (const offset of [-2.5, 2.5]) {
      this.box(this.group, 1.3, .12, 1.3, x + offset, .85, 8.6, 0xdec49a);
      this.box(this.group, .15, .8, .15, x + offset, .4, 8.6, 0x535452);
      for (const side of [-.9, .9]) this.box(this.group, .6, .5, .6, x + offset + side, .25, 8.6, 0x3e756a);
    }
  }

  private buildPlaza(): void {
    this.box(this.group, 14, .18, 10, 12, .05, 25, 0x7b8fa1);
    this.box(this.group, 9, .45, 3.5, 12, .35, 27, 0x344d6b);
    this.box(this.group, 9.8, .2, .3, 12, 4.2, 28, 0x8b92cb);
    for (const x of [7.3, 16.7]) this.box(this.group, .3, 4.2, .3, x, 2.1, 28, 0x3d526b);
    for (let x = 7; x <= 17; x += 2) this.box(this.group, 1.3, .35, .8, x, .3, 23.2, 0xa5b1bf);
    this.box(this.group, 13, .1, 10, -20, .03, 25, 0x749b78);
    const windows = new THREE.InstancedMesh(new THREE.BoxGeometry(.65, .8, .05), new THREE.MeshStandardMaterial({ color: 0xe9cda0, emissive: 0xa78453, emissiveIntensity: .3 }), 108);
    const transform = new THREE.Object3D(); let windowIndex = 0;
    for (let i = 0; i < 9; i++) {
      const height = 4 + (i % 3) * 1.5, x = -27 + i * 6.5;
      this.box(this.group, 4.2, height, 4, x, height / 2, -20, [0x8a9a91, 0x8b8d83, 0x83959b][i % 3]);
      this.box(this.group, 4.5, .18, 4.4, x, height + .1, -20, 0x536a6c);
      for (let row = 0; row < 4; row++) for (let column = 0; column < 3; column++) {
        transform.position.set(x - 1.2 + column * 1.2, .65 + row * (height - 1) / 4, -17.97);
        transform.updateMatrix(); windows.setMatrixAt(windowIndex++, transform.matrix);
      }
    }
    this.group.add(windows);
  }

  private streetFurniture(): void {
    const points = [[-5, 12], [5, 12], [-11, 12], [12, 12], [-27, 13], [27, 13], [-25, 23], [-17, 27], [-22, 29], [-9, 25], [23, 25], [26, 29]];
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(.16, .23, 1.7, 6), new THREE.MeshStandardMaterial({ color: 0x725a46 }), points.length);
    const foliage = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.3, 0), new THREE.MeshStandardMaterial({ color: 0x4e8c69, roughness: .95 }), points.length);
    const transform = new THREE.Object3D();
    points.forEach(([x, z], index) => {
      transform.position.set(x, .85, z); transform.scale.set(1, 1, 1); transform.updateMatrix(); trunk.setMatrixAt(index, transform.matrix);
      transform.position.y = 2.6; transform.scale.set(1, 1.25, 1); transform.updateMatrix(); foliage.setMatrixAt(index, transform.matrix);
      foliage.setColorAt(index, new THREE.Color(index % 3 ? 0x659b77 : 0x88a578));
    });
    trunk.castShadow = true; foliage.castShadow = true; this.treeCrowns = foliage; this.group.add(trunk, foliage);
    for (const x of [-28, -12, 12, 28]) for (const z of [12, 20]) {
      this.box(this.group, .12, 3.6, .12, x, 1.8, z, 0x354957);
      this.box(this.group, 1.1, .12, .2, x + .4, 3.6, z, 0x354957);
      this.lamps.push(this.box(this.group, .7, .1, .3, x + .7, 3.5, z, 0xffd99e, true));
    }
    for (const x of [-3.6, 3.6]) {
      this.box(this.group, 2, .18, .65, x, .55, 11.6, 0xa77c52);
      this.box(this.group, 2, .6, .12, x, .9, 11.9, 0xa77c52);
      for (const side of [-.7, .7]) this.box(this.group, .13, .5, .55, x + side, .25, 11.6, 0x40545b);
    }
    this.box(this.group, 5, .15, 1.8, -5, 2.8, 21.2, 0x527b91);
    for (const x of [-7.3, -2.7]) this.box(this.group, .12, 2.8, .12, x, 1.4, 21.2, 0x3d5967);
    this.box(this.group, 4.6, 1.8, .1, -5, 1.65, 21.6, 0x8bb6bc);
    this.text(this.group, 'CIRCUIT LINE', 'BUS EVERY 60s • LOUNGE VISITORS', 4.6, -5, 2.65, 22, '#f2e3b7');
    for (const x of [-8, -7]) {
      const rack = new THREE.Mesh(new THREE.TorusGeometry(.45, .055, 5, 14, Math.PI), new THREE.MeshStandardMaterial({ color: 0x546d74 }));
      rack.position.set(x, .08, 9.7); this.group.add(rack);
    }
  }

  private async fitModel(path: string, width: number, height: number, depth: number): Promise<THREE.Group> {
    const model = await AssetManager.getInstance().loadModel(path); model.updateMatrixWorld(true);
    const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
    model.scale.multiplyScalar(Math.min(width / Math.max(.001, size.x), height / Math.max(.001, size.y), depth / Math.max(.001, size.z)));
    model.updateMatrixWorld(true);
    const fitted = new THREE.Box3().setFromObject(model), center = fitted.getCenter(new THREE.Vector3());
    model.position.sub(new THREE.Vector3(center.x, fitted.min.y, center.z));
    const wrapper = new THREE.Group(); wrapper.add(model); return wrapper;
  }

  private async buildNeighbors(): Promise<void> {
    for (const [name, x, z] of [['Building Green', -5, -18], ['Brown Building', -15, -18], ['Building Red', 16, -18]] as const) {
      const model = await this.fitModel(`/assets/models/environment/city/${name}.glb`, 7, 5.5, 5);
      model.position.set(x, 0, z); this.group.add(model);
    }
    for (const [name, x, z] of [['Bicycle', -7.6, 9.5], ['Car', -25.5, 1.5], ['Sports Car', -25.5, 7.5]] as const) {
      const model = await this.fitModel(`/assets/models/environment/city/${name}.glb`, 2, 1.5, 3.7);
      model.position.set(x, 0, z); this.group.add(model);
    }
  }

  private async initTraffic(): Promise<void> {
    for (const [name, x, z, direction, speed] of [['Car', -20, 14.3, 1, 3.2], ['Sports Car', 5, 14.3, 1, 3.7], ['SUV', 20, 16.9, -1, 3.2], ['Police Car', -12, 16.9, -1, 3.4]] as const) {
      const model = await this.fitModel(`/assets/models/environment/city/${name}.glb`, 1.7, 1.5, 3.3);
      model.position.set(x, .06, z); model.rotation.y = direction * Math.PI / 2;
      this.group.add(model); this.vehicles.push({ mesh: model, speed, direction });
    }
    this.bus = await this.fitModel('/assets/models/environment/city/Bus.glb', 2.1, 2.3, 6);
    this.bus.rotation.y = -Math.PI / 2; this.bus.position.set(35, .06, NAVIGATION.busLaneZ); this.bus.visible = false; this.group.add(this.bus);
  }

  private async initWalkers(): Promise<void> {
    for (const [name, minX, maxX, z] of [['Man in Long Sleeves', -14, -3, 11.6], ['Woman Casual', 3, 14, 11.6], ['Woman in Tank Top', -10, 4, 20]] as const) {
      const model = await AssetManager.getInstance().loadModel(`/assets/models/characters/${name.startsWith('Man') ? 'men' : 'women'}/${name}.glb`);
      model.scale.setScalar(.3);
      const wrapper = new THREE.Group(); wrapper.add(model); wrapper.position.set(minX, .04, z); wrapper.rotation.y = Math.PI / 2; this.group.add(wrapper);
      const clips = (model.userData.animations as THREE.AnimationClip[]) ?? [], mixer = clips.length ? new THREE.AnimationMixer(model) : undefined;
      if (mixer) mixer.clipAction(clips.find((clip) => /walk/i.test(clip.name)) ?? clips[0]).play();
      this.walkers.push({ group: wrapper, mixer, minX, maxX, speed: .9, direction: 1 });
    }
  }

  setView(view: WorldView): void {
    this.view = view; this.roof.visible = view === 'neighborhood' && this.constructionTime <= 0;
    this.property.visible = view === 'neighborhood';
    if (this.treeCrowns) this.treeCrowns.visible = view === 'neighborhood';
  }

  setProperty(bounds: WorldBounds, state: NeighborhoodState, construction = false): void {
    const key = `${JSON.stringify(bounds)}:${state.shopName}:${state.frontageLevel}`;
    if (key === this.shopKey) return;
    this.shopKey = key; this.disposeGroup(this.property); this.disposeGroup(this.roof);
    const width = bounds.maxX - bounds.minX, depth = bounds.maxZ - bounds.minZ, centerX = (bounds.minX + bounds.maxX) / 2, centerZ = (bounds.minZ + bounds.maxZ) / 2;
    this.box(this.roof, width + .35, .4, depth + .35, centerX, 3, centerZ, 0x2e5060);
    for (const z of [bounds.minZ, bounds.maxZ]) this.box(this.roof, width + .5, .18, .18, centerX, 3.25, z, 0x78bdb1, true);
    for (const x of [bounds.minX, bounds.maxX]) this.box(this.roof, .18, .18, depth, x, 3.25, centerZ, 0x78bdb1, true);
    for (const [start, end] of [[bounds.minX, -1.1], [1.1, bounds.maxX]]) {
      const glass = this.box(this.property, end - start, 2.4, .1, (start + end) / 2, 1.3, 8.05, 0x7cafba);
      const material = glass.material as THREE.MeshStandardMaterial; material.transparent = true; material.opacity = .6;
      for (let x = start; x < end; x += 1.5) this.box(this.property, .08, 2.8, .13, x, 1.4, 8.13, 0x315462);
    }
    this.text(this.property, state.shopName.toUpperCase(), FRONTAGE_NAMES[state.frontageLevel].toUpperCase(), Math.min(width - .5, 11), centerX, 3, 8.27);
    this.text(this.property, 'OPEN 24 / 7', 'PLAY • BUILD • BELONG', 2.2, 3.5, 1.25, 8.3, '#ffe6b3');
    this.text(this.property, 'NEIGHBORHOOD CUP', 'COMPETE AT TOURNAMENT PLAZA', 2.1, -3.5, 1.3, 8.3, '#ded0ff');
    if (state.frontageLevel >= 1) for (let x = bounds.minX; x < bounds.maxX; x++) this.box(this.property, 1, .15, 1.1, x + .5, 2.55, 8.65, Math.floor(x) % 2 ? 0x64b9a7 : 0x476e93);
    if (state.frontageLevel >= 2) for (const x of [-2, 2]) {
      this.box(this.property, .65, .6, .65, x, .3, 9, 0x6a8175); this.box(this.property, .6, .6, .6, x, .85, 9, 0x81b08a);
    }
    if (state.frontageLevel >= 3) {
      for (const x of [-1.3, 1.3]) this.box(this.property, .18, 2.8, .18, x, 1.4, 8.45, 0xa49bdc, true);
      this.box(this.property, 2, .03, 1.8, 0, .09, 9.1, 0x785c95);
    }
    if (construction) {
      this.constructionTime = 3.5; this.disposeGroup(this.construction);
      for (let x = bounds.minX; x <= bounds.maxX; x += 3) {
        this.box(this.construction, .12, 3.8, .12, x, 1.9, bounds.minZ - .25, 0xe5b66a);
        this.box(this.construction, 2.7, .2, .2, x + 1.35, 2.4, bounds.minZ - .25, 0xe5b66a);
      }
      this.text(this.construction, 'BUILDING YOUR NEXT CHAPTER', 'NEW WING OPENING', 8, centerX, 4.2, bounds.maxZ, '#ffe0a3');
    }
    this.setView(this.view);
  }

  updatePoster(state: NeighborhoodState): void {
    const event = state.event, key = `${event?.status}:${event?.served}:${state.eventsWon}`;
    if (key === this.posterKey) return;
    this.posterKey = key;
    if (this.poster) { (this.poster.material as THREE.MeshBasicMaterial).map?.dispose(); this.poster.geometry.dispose(); (this.poster.material as THREE.Material).dispose(); this.group.remove(this.poster); }
    this.poster = this.text(this.group, event?.status === 'active' ? 'NEIGHBORHOOD CUP • LIVE' : event?.status === 'won' ? 'DISTRICT CHAMPION!' : 'NEIGHBORHOOD CUP',
      event?.status === 'active' ? `${event.served} / 3 PLAYERS SERVED • $500 PRIZE` : `WIN $500 + REPUTATION • ${state.eventsWon} TITLES WON`, 8.5, 12, 2.8, 28.1, '#e1cdff', '#343455');
  }

  setLighting(period: 'day' | 'evening' | 'night'): void {
    for (const lamp of this.lamps) (lamp.material as THREE.MeshStandardMaterial).emissiveIntensity = period === 'day' ? .05 : 1.8;
  }
  arriveBus(): void {
    if (!this.bus || this.busPhase !== 'away') return;
    this.bus.visible = true; this.bus.position.x = 34; this.busPhase = 'arriving';
  }
  update(delta: number): void {
    this.elapsed += delta;
    if (this.treeCrowns) this.treeCrowns.rotation.z = Math.sin(this.elapsed * .7) * .0015;
    if (this.constructionTime > 0) { this.constructionTime -= delta; if (this.constructionTime <= 0) { this.disposeGroup(this.construction); this.setView(this.view); } }
    for (const vehicle of this.vehicles) {
      if ((this.busPhase === 'stopped' || this.crossingOccupied()) &&
        (vehicle.direction > 0 ? vehicle.mesh.position.x > -5 && vehicle.mesh.position.x < -2.4 : vehicle.mesh.position.x < 5 && vehicle.mesh.position.x > 2.4)) continue;
      vehicle.mesh.position.x += vehicle.speed * vehicle.direction * delta;
      if (Math.abs(vehicle.mesh.position.x) > 34) vehicle.mesh.position.x = -34 * vehicle.direction;
    }
    for (const walker of this.walkers) {
      walker.mixer?.update(delta); walker.group.position.x += walker.speed * walker.direction * delta;
      if (walker.group.position.x > walker.maxX || walker.group.position.x < walker.minX) { walker.direction *= -1; walker.group.rotation.y = walker.direction * Math.PI / 2; }
    }
    if (this.bus) {
      if (this.busPhase === 'arriving') {
        this.bus.position.x = Math.max(NAVIGATION.busX, this.bus.position.x - 7 * delta);
        if (this.bus.position.x <= NAVIGATION.busX) { this.busPhase = 'stopped'; this.busStopTime = 7; this.onBusStop?.(); }
      } else if (this.busPhase === 'stopped') { this.busStopTime -= delta; if (this.busStopTime <= 0) this.busPhase = 'leaving'; }
      else if (this.busPhase === 'leaving') { this.bus.position.x -= 7 * delta; if (this.bus.position.x < -35) { this.bus.visible = false; this.busPhase = 'away'; } }
    }
  }
  getLocationPoint(id: string): THREE.Vector3 | null {
    const place = DISTRICT_PLACES.find((entry) => entry.id === id);
    return place ? new THREE.Vector3(place.x, place.y, place.z) : null;
  }
}
