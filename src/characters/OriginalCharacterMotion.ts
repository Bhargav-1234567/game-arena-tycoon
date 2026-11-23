import * as THREE from 'three';

export interface OriginalHumanMetadata {
  version: number;
  id: string;
  original: boolean;
  height: number;
  walkSpeed: number;
  nativeSeatSurface: number;
  seatedHipHeight: number;
  legUpper: number;
  legLower: number;
  ankleHeight: number;
}

// Cushion surfaces measured by downward mesh raycasts at the actual seating anchors.
export const CHAIR_CUSHION_HEIGHTS: Record<number, number> = { 1: .373, 2: .477, 3: .407, 4: .504 };
export const SEAT_APPROACH_SECONDS = .80;
export const SIT_TRANSITION_SECONDS = .65;
export const CHAIR_EXIT_SECONDS = 1.30;

/** Fits our authored rig to furniture while retaining a floor-based model origin. */
export class OriginalCharacterMotion {
  public readonly metadata: OriginalHumanMetadata;
  public readonly model: THREE.Group;
  private bones = new Map<string, THREE.Bone>();
  private parent: THREE.Group;
  private restForearms = new Map<string, THREE.Vector3>();
  private restHands = new Map<string, THREE.Vector3>();
  private authoredPose = new Map<THREE.Bone, THREE.Quaternion>();

  constructor(model: THREE.Group, parent: THREE.Group) {
    this.model = model;
    this.parent = parent;
    const metadata = model.userData.customHuman as OriginalHumanMetadata | undefined;
    if (!metadata?.original || metadata.version !== 1) throw new Error('The character is missing its original rig metadata.');
    this.metadata = metadata;
    model.traverse((node) => {
      if ((node as THREE.Bone).isBone) this.bones.set(node.name.replaceAll('.', ''), node as THREE.Bone);
      if ((node as THREE.SkinnedMesh).isSkinnedMesh) { node.frustumCulled = false; node.castShadow = true; }
    });
    for (const side of ['L', 'R']) {
      this.restForearms.set(side, this.bone(`Forearm.${side}`).position.clone());
      this.restHands.set(side, this.bone(`Hand.${side}`).position.clone());
    }
  }

  private bone(name: string): THREE.Bone {
    const bone = this.bones.get(name.replaceAll('.', ''));
    if (!bone) throw new Error(`Original character ${this.metadata.id} has no ${name} bone.`);
    return bone;
  }

  public restoreAnimationPose(): void {
    // AnimationMixer skips writes for unchanged tracks. Restore our previous IK edits first.
    for (const [bone, rotation] of this.authoredPose) bone.quaternion.copy(rotation);
    this.authoredPose.clear();
  }

  public fit(seated: number, cushionHeight = .4, deskHeight = .72, handDistance = .28, mouseX = .29, floorHeight = 0): void {
    const blend = THREE.MathUtils.clamp(seated, 0, 1);
    const lift = cushionHeight - this.metadata.nativeSeatSurface;
    this.model.position.y = floorHeight - this.parent.position.y + lift * blend;
    if (blend <= 0) return;
    const spine = this.bone('Spine');
    this.authoredPose.set(spine, spine.quaternion.clone());
    const lean = Math.min(.24, Math.max(0, cushionHeight - .40) * 1.3 + Math.max(0, handDistance - .30) * .65) * blend;
    spine.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), lean));
    for (const side of ['L', 'R']) for (const name of ['Thigh', 'Shin', 'UpperArm', 'Forearm', 'Hand']) {
      const bone = this.bone(`${name}.${side}`);
      this.authoredPose.set(bone, bone.quaternion.clone());
    }
    for (const side of ['L', 'R']) {
      const thigh = this.bone(`Thigh.${side}`), shin = this.bone(`Shin.${side}`);
      const angle = -Math.acos(THREE.MathUtils.clamp(lift / this.metadata.legUpper, -.6, .6));
      const correction = (angle + Math.PI / 2) * blend;
      thigh.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), correction));
      shin.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -correction));
    }
    this.parent.updateWorldMatrix(true, true);
    // One hand rests over the keyboard; the other follows the desk's actual mouse position.
    this.fitArm('R', new THREE.Vector3(.13, deskHeight + .027 - this.parent.position.y, handDistance), blend);
    this.fitArm('L', new THREE.Vector3(-mouseX, deskHeight + .027 - this.parent.position.y, handDistance), blend);
  }

  private fitArm(side: string, localTarget: THREE.Vector3, blend: number): void {
    const upper = this.bone(`UpperArm.${side}`), forearm = this.bone(`Forearm.${side}`), hand = this.bone(`Hand.${side}`);
    const shoulder = upper.getWorldPosition(new THREE.Vector3());
    const target = this.parent.localToWorld(localTarget.clone());
    const vector = target.clone().sub(shoulder), length = vector.length();
    const upperLength = this.restForearms.get(side)!.length(), lowerLength = this.restHands.get(side)!.length();
    const distance = THREE.MathUtils.clamp(length, Math.abs(upperLength - lowerLength) + .001, upperLength + lowerLength - .001);
    const direction = vector.normalize();
    const along = (upperLength ** 2 - lowerLength ** 2 + distance ** 2) / (2 * distance);
    const pole = this.parent.localToWorld(new THREE.Vector3(side === 'L' ? -.34 : .31, localTarget.y - .04, localTarget.z * .45)).sub(shoulder);
    pole.addScaledVector(direction, -pole.dot(direction)).normalize();
    const elbow = shoulder.clone().addScaledVector(direction, along).addScaledVector(pole, Math.sqrt(Math.max(0, upperLength ** 2 - along ** 2)));
    this.orient(upper, this.restForearms.get(side)!, elbow.sub(shoulder), blend);
    upper.updateWorldMatrix(false, true);
    this.orient(forearm, this.restHands.get(side)!, target.sub(forearm.getWorldPosition(new THREE.Vector3())), blend);
    forearm.updateWorldMatrix(false, true);
    const desired = this.parent.getWorldQuaternion(new THREE.Quaternion()).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)));
    const local = forearm.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(desired);
    hand.quaternion.slerp(local, blend);
    hand.updateWorldMatrix(false, true);
  }

  /** Reach for a keypad with one hand or play a standing cabinet with both. */
  public useControls(vending: boolean, height: number, reach: number, time: number): void {
    const blend = THREE.MathUtils.smoothstep(time, 0, .45);
    const drop = Math.max(0, 1.02 - height) * .85 * blend;
    const bend = Math.acos(1 - drop / (this.metadata.legUpper + this.metadata.legLower));
    const tilt = (name: string, angle: number) => {
      const bone = this.bone(name);
      this.authoredPose.set(bone, bone.quaternion.clone());
      bone.rotateX(angle);
    };
    this.model.position.y -= drop;
    for (const side of ['L', 'R']) {
      tilt(`Thigh.${side}`, -bend);
      tilt(`Shin.${side}`, 2 * bend);
      tilt(`Foot.${side}`, -bend);
    }
    tilt('Spine', (.13 + drop) * blend);
    for (const side of vending ? ['L'] : ['R', 'L']) {
      for (const joint of ['UpperArm', 'Forearm', 'Hand']) {
        const bone = this.bone(`${joint}.${side}`);
        this.authoredPose.set(bone, bone.quaternion.clone());
      }
      const tap = .02 * Math.sin(time * (vending ? 4 : 8) + (side === 'L' ? 0 : Math.PI));
      this.fitArm(side, new THREE.Vector3(side === 'L' ? -.14 : .13, height + tap, reach + tap), blend);
    }
  }

  private orient(bone: THREE.Bone, rest: THREE.Vector3, worldDirection: THREE.Vector3, blend: number): void {
    const inverse = bone.parent!.getWorldQuaternion(new THREE.Quaternion()).invert();
    const direction = worldDirection.normalize().applyQuaternion(inverse);
    const rotation = new THREE.Quaternion().setFromUnitVectors(rest.clone().normalize(), direction);
    bone.quaternion.slerp(rotation, blend);
  }
}
