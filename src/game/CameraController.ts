import * as THREE from 'three';
import { DISTRICT_BOUNDS } from '../data/world-layout.ts';
import type { WorldBounds } from '../data/world-layout.ts';
import type { WorldView } from '../systems/NeighborhoodSystem.ts';

export class CameraController {
  public mode: WorldView = 'lounge';
  private roomBounds?: WorldBounds;
  private touches = new Map<number, THREE.Vector2>();
  private pinchDistance = 0;
  public enabled = true;
  public camera: THREE.OrthographicCamera;
  private target: THREE.Vector3 = new THREE.Vector3(0, 0, 0);
  private currentTarget: THREE.Vector3 = new THREE.Vector3(0, 0, 0);
  
  public zoomLevel: number = 8;
  private targetZoom: number = 8;
  private minZoom: number = 4;
  private maxZoom: number = 220;

  // Camera pan target clamp bounds (aligned with exterior city environment)
  private minTargetX: number = -14.0;
  private maxTargetX: number = 18.0;
  private minTargetZ: number = -12.0;
  private maxTargetZ: number = 14.0;

  private isDragging: boolean = false;
  private dragStart: THREE.Vector2 = new THREE.Vector2();
  private domElement: HTMLElement;
  private aspect: number = window.innerWidth / window.innerHeight;

  // Isometric angle constants
  private readonly distance: number = 40;
  private readonly isoAngleY: number = Math.PI / 4; // 45 deg
  private readonly isoAngleX: number = Math.atan(1 / Math.SQRT2); // ~35.264 deg

  constructor(domElement: HTMLElement) {
    this.domElement = domElement;
    this.aspect = window.innerWidth / window.innerHeight;

    this.camera = new THREE.OrthographicCamera(
      (-this.zoomLevel * this.aspect) / 2,
      (this.zoomLevel * this.aspect) / 2,
      this.zoomLevel / 2,
      -this.zoomLevel / 2,
      0.1,
      1000
    );

    this.updateCameraPosition();
    this.setupListeners();
  }

  private updateCameraPosition() {
    const d = this.distance;
    const x = this.currentTarget.x + d * Math.cos(this.isoAngleX) * Math.sin(this.isoAngleY);
    const y = this.currentTarget.y + d * Math.sin(this.isoAngleX);
    const z = this.currentTarget.z + d * Math.cos(this.isoAngleX) * Math.cos(this.isoAngleY);

    this.camera.position.set(x, y, z);
    this.camera.lookAt(this.currentTarget);
  }

  private setupListeners() {
    // Mouse events
    this.domElement.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;
      if (e.pointerType === 'touch') {
        this.touches.set(e.pointerId, new THREE.Vector2(e.clientX, e.clientY));
        this.domElement.setPointerCapture(e.pointerId);
        if (this.touches.size === 2) { const points = [...this.touches.values()]; this.pinchDistance = points[0].distanceTo(points[1]); }
      }
      if (e.pointerType === 'touch' || e.button === 2 || e.button === 1 || (e.button === 0 && e.shiftKey)) {
        this.isDragging = true;
        this.dragStart.set(e.clientX, e.clientY);
        this.domElement.style.cursor = 'grab';
      }
    });

    window.addEventListener('pointermove', (e) => {
      if (!this.enabled || !this.isDragging) return;
      if (e.pointerType === 'touch' && this.touches.has(e.pointerId)) {
        this.touches.set(e.pointerId, new THREE.Vector2(e.clientX, e.clientY));
        if (this.touches.size === 2) {
          const points = [...this.touches.values()], distance = points[0].distanceTo(points[1]);
          if (this.pinchDistance > 0) this.targetZoom = THREE.MathUtils.clamp(this.targetZoom * this.pinchDistance / distance, this.minZoom, this.maxZoom);
          this.pinchDistance = distance; return;
        }
      }

      const deltaX = (e.clientX - this.dragStart.x) * 0.015 * (this.zoomLevel / 8);
      const deltaY = (e.clientY - this.dragStart.y) * 0.015 * (this.zoomLevel / 8);

      // Convert screen delta to isometric ground plane motion
      const right = new THREE.Vector3(1, 0, -1).normalize();
      const forward = new THREE.Vector3(1, 0, 1).normalize();

      this.target.addScaledVector(right, -deltaX);
      this.target.addScaledVector(forward, -deltaY);
      this.clampTarget();

      this.dragStart.set(e.clientX, e.clientY);
    });

    window.addEventListener('pointerup', (event) => {
      this.touches.delete(event.pointerId); this.pinchDistance = 0;
      this.isDragging = false;
      this.domElement.style.cursor = 'default';
    });
    window.addEventListener('pointercancel', (event) => { this.touches.delete(event.pointerId); this.isDragging = false; this.pinchDistance = 0; });

    // Zoom via Wheel
    this.domElement.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (!this.enabled) return;
      const zoomFactor = e.deltaY > 0 ? 1.15 : 0.85;
      this.targetZoom = THREE.MathUtils.clamp(
        this.targetZoom * zoomFactor,
        this.minZoom,
        this.maxZoom
      );
    }, { passive: false });

    // Context menu prevent so right click drag works freely
    this.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

    // Window resize
    window.addEventListener('resize', () => {
      this.aspect = window.innerWidth / window.innerHeight;
      this.updateProjection();
      if (this.roomBounds) this.setView(this.mode, this.roomBounds);
    });
  }

  public updateProjection() {
    this.camera.left = (-this.zoomLevel * this.aspect) / 2;
    this.camera.right = (this.zoomLevel * this.aspect) / 2;
    this.camera.top = this.zoomLevel / 2;
    this.camera.bottom = -this.zoomLevel / 2;
    this.camera.updateProjectionMatrix();
  }

  public setCenter(pos: THREE.Vector3) {
    this.target.copy(pos);
    this.clampTarget();
  }

  public get isTransitioning(): boolean { return this.currentTarget.distanceTo(this.target) > .02 || Math.abs(this.zoomLevel - this.targetZoom) > .02; }

  public setView(view: WorldView, room: WorldBounds, immediate = false): void {
    this.mode = view; this.roomBounds = { ...room }; this.isDragging = false;
    this.touches.clear(); this.pinchDistance = 0;
    if (view === 'lounge' && room.maxX - room.minX === 12 && room.maxZ - room.minZ === 10) {
      this.target.set(0, 0, 0); this.targetZoom = 8;
    } else {
      const bounds = view === 'neighborhood' ? DISTRICT_BOUNDS : room;
      this.target.set((bounds.minX + bounds.maxX) / 2, 0, (bounds.minZ + bounds.maxZ) / 2);
      const width = bounds.maxX - bounds.minX, depth = bounds.maxZ - bounds.minZ;
      const screenWidth = (width + depth) * Math.SQRT1_2;
      const screenHeight = (width + depth) / Math.sqrt(6) + (view === 'neighborhood' ? 5 : 2);
      this.targetZoom = Math.max(screenHeight, screenWidth / this.aspect) * 1.06;
    }
    this.setPanBounds(-27, 27, -20, 29);
    if (immediate) { this.currentTarget.copy(this.target); this.zoomLevel = this.targetZoom; this.updateProjection(); this.updateCameraPosition(); }
  }

  public zoomBy(factor: number): void { this.targetZoom = THREE.MathUtils.clamp(this.targetZoom * factor, this.minZoom, this.maxZoom); }

  public setPanBounds(minX: number, maxX: number, minZ: number, maxZ: number) {
    this.minTargetX = minX;
    this.maxTargetX = maxX;
    this.minTargetZ = minZ;
    this.maxTargetZ = maxZ;
    this.clampTarget();
  }

  private clampTarget() {
    this.target.x = THREE.MathUtils.clamp(this.target.x, this.minTargetX, this.maxTargetX);
    this.target.z = THREE.MathUtils.clamp(this.target.z, this.minTargetZ, this.maxTargetZ);
  }

  public update(deltaTime: number) {
    if (!this.enabled) { this.isDragging = false; return; }
    this.clampTarget();
    // Smooth dampening towards target
    const lerpSpeed = Math.min(1.0, deltaTime * 12);
    this.currentTarget.lerp(this.target, lerpSpeed);

    if (Math.abs(this.zoomLevel - this.targetZoom) > 0.001) {
      this.zoomLevel = THREE.MathUtils.lerp(this.zoomLevel, this.targetZoom, lerpSpeed);
      this.updateProjection();
    }

    this.updateCameraPosition();
  }
}

