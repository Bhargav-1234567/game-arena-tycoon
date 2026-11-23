import * as THREE from 'three';
import { CUSTOMER_CHARACTERS } from '../data/characters.ts';
import type { Employee } from '../data/employees.ts';
import { randomCharacterAppearance, applyCharacterAppearance } from '../characters/CharacterAppearance.ts';
import { OriginalCharacterMotion } from '../characters/OriginalCharacterMotion.ts';
import { AssetManager } from '../services/AssetManager.ts';
import type { FacilityEntity } from './FacilityEntity.ts';
import { makeTools } from './StaffProps.ts';

export type WorkerPose = 'Idle' | 'Walk' | 'Assist' | 'Repair' | 'PickUp' | 'Mop' | 'CarryBag' | 'Dispose' | 'Collect' | 'CarryCrate' | 'Restock';
const colors = { janitor: '#399a88', technician: '#c38636', attendant: '#577fc1', receptionist: '#704b80' };

export class EmployeeAvatar {
  readonly group = new THREE.Group();
  readonly tools = makeTools();
  ready = false;
  private disposed = false;
  private model?: THREE.Group;
  private rig?: OriginalCharacterMotion;
  private mixer?: THREE.AnimationMixer;
  private clips = new Map<string, THREE.AnimationAction>();
  private current?: THREE.AnimationAction;
  private elapsed = 0;
  pose: WorkerPose = 'Idle';

  async build(e: Employee) {
    const person = CUSTOMER_CHARACTERS[e.seed % CUSTOMER_CHARACTERS.length];
    const model = await AssetManager.getInstance().loadRequiredModel(person.gamePath);
    this.model=model;
    this.group.add(model);
    if (this.disposed) { this.dispose(); return; }
    let seed = e.seed;
    const appearance = randomCharacterAppearance(person.gender, 'customer', () => {
      seed = (Math.imul(seed,1664525)+1013904223) >>> 0; return seed/4294967296;
    });
    appearance.top = e.role === 'receptionist' ? 'blazer' : e.role === 'technician' ? 'overshirt' : 'polo';
    appearance.bottoms = 'chinos'; appearance.shirtColor = colors[e.role]; appearance.pantsColor = '#34414f';
    appearance.headwear = e.role === 'attendant' ? 'baseball_cap' : 'none'; appearance.neckwear = 'none';
    applyCharacterAppearance(model,appearance);
    this.rig = new OriginalCharacterMotion(model,this.group);
    this.mixer = new THREE.AnimationMixer(model);
    for (const clip of model.userData.animations as THREE.AnimationClip[]) this.clips.set(clip.name,this.mixer.clipAction(clip));
    const { mop, crate, kit, bag, scanner, panel } = this.tools;
    this.group.add(mop,crate,kit,bag,scanner,panel);
    this.group.name = 'Employee_'+e.name;
    this.ready = true;
    this.animate('Idle',0,1,e.role);
  }

  animate(pose: WorkerPose, delta: number, speed: number, role: Employee['role'], machine?: FacilityEntity) {
    if (!this.ready) return;
    const walking = pose === 'Walk' || pose === 'CarryCrate' || pose === 'CarryBag';
    const action = this.clips.get(walking ? 'Walk' : pose === 'Assist' ? 'CheckIn' : 'Idle') ?? this.clips.get('Idle');
    if (action && this.current !== action) {
      this.current?.fadeOut(.12); action.reset().fadeIn(.12).play(); this.current = action;
    }
    if (this.pose !== pose) this.elapsed = 0;
    this.pose = pose; this.elapsed += delta * speed;
    const t = this.elapsed, swing = Math.sin(t*5);
    this.rig!.restoreAnimationPose();
    this.mixer!.update(delta * speed);
    this.rig!.fit(0);
    const {mop, kit, lid, bag, crate, scanner, panel} = this.tools;
    mop.visible = role === 'janitor' && !['CarryBag','Dispose','PickUp'].includes(pose);
    mop.position.set(-.27,.01,.18+(pose === 'Mop' ? .19*swing : 0)); mop.rotation.x = pose === 'Mop' ? .2*swing : -.08;
    kit.visible = role === 'technician';
    kit.position.set(.24,pose === 'Repair' ? .03 : .64,.10);
    lid.rotation.x = pose === 'Repair' ? -1.12*Math.min(1,t*3) : 0;
    lid.position.z = pose === 'Repair' ? -.09 : 0;
    bag.visible = pose === 'CarryBag' || pose === 'Dispose'; bag.position.set(-.21,.59,.13);
    crate.visible = ['Collect','CarryCrate','Restock'].includes(pose); crate.position.set(0,.76,.30);
    scanner.visible = role === 'receptionist'; scanner.position.set(-.19,pose === 'Assist' ? 1 : .72,.22);
    panel.visible = pose === 'Restock' && machine?.type==='vending';
    if (panel.visible && machine) {
      if (panel.parent!==machine.group) machine.group.add(panel);
      const layout=machine.layout;
      panel.position.set(layout.entry[0]-.15,(layout.controls?.[0] ?? 1)-.2,layout.halfDepth+.015);
      panel.rotation.y = -1.25*Math.min(1,t*4,Math.max(0,(3-t)*4));
    }
    if (pose === 'Mop') this.rig!.useControls(false,.80,.25 + .13*swing,t+.35);
    if (pose === 'PickUp' || pose === 'Dispose' || pose === 'Collect') this.rig!.useControls(true,.88-.50*Math.sin(Math.min(1,t/1.3)*Math.PI),.28,t+.2);
    if (pose === 'Repair') this.rig!.useControls(false,.73+.055*swing,.31,t+.25);
    if (pose === 'CarryCrate') this.rig!.useControls(false,.86,.27,t+.35);
    if (pose === 'Restock') {
      const [height,reach]=machine?.layout.controls ?? [1.06,.36];
      this.rig!.useControls(false,height-.2,reach+.04*swing,t+.35);
    }
    if (pose === 'Assist') this.rig!.useControls(true,.99,.24,t+.3);
  }

  dispose() {
    this.disposed = true; this.ready = false;
    this.mixer?.stopAllAction(); this.group.removeFromParent();
    if (this.model) {
      this.mixer?.uncacheRoot(this.model);
      this.model.traverse(node => {
        const mesh = node as THREE.SkinnedMesh;
        if (!mesh.isMesh) return;
        if (mesh.isSkinnedMesh) mesh.skeleton.dispose();
        for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) material.dispose();
      });
      this.model=undefined;
    }
    const {mop,crate,kit,bag,scanner,panel}=this.tools;
    panel.removeFromParent();
    for (const prop of [mop,crate,kit,bag,scanner,panel]) prop.traverse(node=>{
      const mesh=node as THREE.Mesh;
      if (mesh.isMesh) mesh.geometry.dispose();
    });
    this.group.clear();
  }
}
