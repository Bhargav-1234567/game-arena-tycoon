import * as THREE from 'three';

export class SceneManager {
  public scene: THREE.Scene;
  public renderer: THREE.WebGLRenderer;
  public ambientLight: THREE.AmbientLight;
  public dirLight: THREE.DirectionalLight;

  constructor(canvas: HTMLCanvasElement) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0f172a); // Deep modern navy background

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    // 1. Soft Ambient Fill
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    this.scene.add(this.ambientLight);

    // 2. Main Key Directional Light (Isometric Sun)
    this.dirLight = new THREE.DirectionalLight(0xfff7ed, 1.2);
    this.dirLight.position.set(15, 25, 20);
    this.dirLight.castShadow = true;
    this.dirLight.shadow.mapSize.width = 2048;
    this.dirLight.shadow.mapSize.height = 2048;
    this.dirLight.shadow.camera.near = 0.5;
    this.dirLight.shadow.camera.far = 80;
    this.dirLight.shadow.bias = -0.0005;

    const d = 16;
    this.dirLight.shadow.camera.left = -d;
    this.dirLight.shadow.camera.right = d;
    this.dirLight.shadow.camera.top = d;
    this.dirLight.shadow.camera.bottom = -d;
    this.scene.add(this.dirLight);

    // 3. Cyber Neon Mood Accent Lights
    const cyanLight = new THREE.PointLight(0x0d9488, 3.0, 14);
    cyanLight.position.set(-5, 4, -4);
    this.scene.add(cyanLight);

    const purpleLight = new THREE.PointLight(0x8b5cf6, 3.5, 16);
    purpleLight.position.set(5, 4, 4);
    this.scene.add(purpleLight);

    // Window resize
    window.addEventListener('resize', () => {
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    });
  }

  public render(camera: THREE.Camera) {
    this.renderer.render(this.scene, camera);
  }
}

