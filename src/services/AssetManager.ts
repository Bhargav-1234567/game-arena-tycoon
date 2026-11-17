import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';

export class AssetManager {
  private static instance: AssetManager;
  private loader: GLTFLoader;
  private cache: Map<string, THREE.Group> = new Map();
  private animationsCache: Map<string, THREE.AnimationClip[]> = new Map();
  private loadingPromises: Map<string, Promise<THREE.Group>> = new Map();

  private constructor() {
    this.loader = new GLTFLoader();
  }

  public static getInstance(): AssetManager {
    if (!AssetManager.instance) {
      AssetManager.instance = new AssetManager();
    }
    return AssetManager.instance;
  }

  public async preload(urls: string[]): Promise<void> {
    const promises = urls.map((url) => this.loadModel(url));
    await Promise.all(promises);
    console.log(`[AssetManager] Preloaded ${urls.length} models.`);
  }

  public getAnimations(url: string): THREE.AnimationClip[] {
    return this.animationsCache.get(url) || [];
  }

  public async loadMenAnimations(): Promise<THREE.AnimationClip[]> {
    const animUrl = '/assets/models/characters/men/Casual Character.glb';
    if (!this.animationsCache.has(animUrl)) {
      await this.loadModel(animUrl);
    }
    return this.getAnimations(animUrl);
  }

  public async loadWomenAnimations(): Promise<THREE.AnimationClip[]> {
    const animUrl = '/assets/models/characters/women/Animated Woman.glb';
    if (!this.animationsCache.has(animUrl)) {
      await this.loadModel(animUrl);
    }
    return this.getAnimations(animUrl);
  }

  public async loadCharacterAnimations(): Promise<THREE.AnimationClip[]> {
    return this.loadWomenAnimations();
  }

  /**
   * Sanitizes animation clips for clean playback and retargeting across character models.
   * If isNative is true, retains all native keyframes.
   * If isNative is false (retargeted fallback), filters out limb .position and .scale tracks
   * to guarantee bones (especially feet and legs) never stretch, dislocate, or twist.
   */
  public sanitizeClip(clip: THREE.AnimationClip, isNative: boolean = true): THREE.AnimationClip {
    if (isNative) return clip;
    const safeTracks = clip.tracks.filter((t) => {
      if (t.name.endsWith('.quaternion')) return true;
      if (t.name.endsWith('.position')) {
        const bone = t.name.split('.')[0].toLowerCase();
        return bone === 'root' || bone === 'body' || bone === 'hips';
      }
      return false;
    });
    return new THREE.AnimationClip(clip.name, clip.duration, safeTracks);
  }

  public getModelAnimations(model: THREE.Group, fallbackUrl?: string): THREE.AnimationClip[] {
    const native = (model.userData.animations as THREE.AnimationClip[]) || [];
    if (native && native.length > 0) {
      return native.map((c) => this.sanitizeClip(c, true));
    }
    if (fallbackUrl && this.animationsCache.has(fallbackUrl)) {
      const fallback = this.animationsCache.get(fallbackUrl)!;
      return fallback.map((c) => this.sanitizeClip(c, false));
    }
    return [];
  }

  public async loadModel(url: string): Promise<THREE.Group> {
    if (this.cache.has(url)) {
      return this.cloneModel(this.cache.get(url)!);
    }

    if (this.loadingPromises.has(url)) {
      const cached = await this.loadingPromises.get(url)!;
      return this.cloneModel(cached);
    }

    const loadPromise = new Promise<THREE.Group>((resolve) => {
      this.loader.load(
        url,
        (gltf) => {
          const model = gltf.scene;
          if (gltf.animations && gltf.animations.length > 0) {
            this.animationsCache.set(url, gltf.animations);
            model.userData.animations = gltf.animations;
          }

          model.traverse((child) => {
            if ((child as THREE.SkinnedMesh).isSkinnedMesh) {
              const sm = child as THREE.SkinnedMesh;
              sm.frustumCulled = false;
              sm.castShadow = true;
              sm.receiveShadow = true;
            } else if ((child as THREE.Mesh).isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;
            }
          });

          this.cache.set(url, model);
          resolve(model);
        },
        undefined,
        (err) => {
          console.warn(`[AssetManager] Error loading ${url}, generating fallback:`, err);
          const fallback = this.createFallbackModel(url);
          this.cache.set(url, fallback);
          resolve(fallback);
        }
      );
    });

    this.loadingPromises.set(url, loadPromise);
    const loaded = await loadPromise;
    this.loadingPromises.delete(url);
    return this.cloneModel(loaded);
  }

  private cloneModel(original: THREE.Group): THREE.Group {
    // SkeletonUtils.clone is required for SkinnedMesh hierarchies so each clone has its own skeleton
    const cloned = clone(original) as THREE.Group;

    if (original.userData.animations) {
      cloned.userData.animations = original.userData.animations;
    }

    cloned.traverse((node) => {
      if ((node as THREE.SkinnedMesh).isSkinnedMesh) {
        const sm = node as THREE.SkinnedMesh;
        sm.frustumCulled = false;
        sm.castShadow = true;
        sm.receiveShadow = true;
      }
      if ((node as THREE.Mesh).isMesh) {
        const mesh = node as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        if (Array.isArray(mesh.material)) {
          mesh.material = mesh.material.map((m) => m.clone());
        } else if (mesh.material) {
          mesh.material = mesh.material.clone();
        }
      }
    });

    return cloned;
  }

  private createFallbackModel(url: string): THREE.Group {
    const group = new THREE.Group();
    const geo = new THREE.BoxGeometry(0.8, 0.8, 0.8);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x8b5cf6,
      roughness: 0.5
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = 0.4;
    group.add(mesh);
    group.name = `Fallback_${url}`;
    return group;
  }
}
