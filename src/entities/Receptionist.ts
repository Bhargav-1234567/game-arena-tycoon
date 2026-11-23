import * as THREE from 'three';
import { RECEPTIONIST_CHARACTER } from '../data/characters.ts';
import { applyCharacterAppearance, randomCharacterAppearance } from '../characters/CharacterAppearance.ts';
import { AssetManager } from '../services/AssetManager.ts';
import type { CollisionSystem } from '../systems/CollisionSystem.ts';

export class Receptionist {
  readonly group = new THREE.Group();
  readonly input = new THREE.Vector2();
  enabled = false;
  onDuty = true;
  private mixer?: THREE.AnimationMixer;
  private actions = new Map<string, THREE.AnimationAction>();
  private action?: THREE.AnimationAction;

  async build(scene: THREE.Scene) {
    const model = await AssetManager.getInstance().loadRequiredModel(RECEPTIONIST_CHARACTER.gamePath);
    applyCharacterAppearance(model, randomCharacterAppearance('female', 'receptionist'));
    this.group.name = 'Receptionist_Isha';
    this.group.add(model);
    scene.add(this.group);
    this.mixer = new THREE.AnimationMixer(model);
    for (const clip of model.userData.animations as THREE.AnimationClip[]) this.actions.set(clip.name, this.mixer.clipAction(clip));
    this.enabled = true;
  }

  update(delta: number, collision: CollisionSystem, working: boolean) {
    if (!this.enabled) return;
    const p = this.group.position;
    const before = p.clone();
    if (this.onDuty && this.input.lengthSq() > .001) {
      const { x, y } = this.input.clone().clampLength(0, 1);
      const speed = delta * 2.8 * Math.SQRT1_2;
      for (const [dx, dz] of [[(x+y)*speed, 0], [0, (y-x)*speed]]) {
        const next = p.clone().set(p.x + dx, 0, p.z + dz);
        if (next.z <= collision.roomBounds.maxZ - .25 && !collision.isSegmentBlocked(p, next, .23)) p.copy(next);
      }
    }
    const moving = before.distanceToSquared(p) > 1e-8;
    if (moving) this.group.rotation.y = Math.atan2(p.x-before.x, p.z-before.z);
    const action = this.actions.get(moving ? 'Walk' : working ? 'CheckIn' : 'Idle');
    if (action && action !== this.action) {
      this.action?.fadeOut(.12);
      action.reset().fadeIn(.12).play();
      this.action = action;
    }
    this.mixer?.update(delta);
  }
}
