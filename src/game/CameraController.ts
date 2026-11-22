import * as THREE from 'three';

export class CameraController {
  public camera: THREE.OrthographicCamera;
  private target: THREE.Vector3 = new THREE.Vector3(0, 0, 0);
  private currentTarget: THREE.Vector3 = new THREE.Vector3(0, 0, 0);
  
  public zoomLevel: number = 8;
  private targetZoom: number = 8;
  private minZoom: number = 4;
  private maxZoom: number = 24;

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
      if (e.button === 2 || e.button === 1 || (e.button === 0 && e.shiftKey)) {
        this.isDragging = true;
        this.dragStart.set(e.clientX, e.clientY);
        this.domElement.style.cursor = 'grab';
      }
    });

    window.addEventListener('pointermove', (e) => {
      if (!this.isDragging) return;

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

    window.addEventListener('pointerup', () => {
      this.isDragging = false;
      this.domElement.style.cursor = 'default';
    });

    // Zoom via Wheel
    this.domElement.addEventListener('wheel', (e) => {
      e.preventDefault();
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

