import * as THREE from 'three';
import type { Litter } from '../data/employees.ts';

const materials = new Map<number, THREE.MeshStandardMaterial>();
function part(geo: THREE.BufferGeometry, color: number, x: number, y: number, z: number) {
  if (!materials.has(color)) materials.set(color, new THREE.MeshStandardMaterial({ color, roughness: .72 }));
  const mesh = new THREE.Mesh(geo, materials.get(color));
  mesh.position.set(x,y,z);
  mesh.castShadow = true;
  return mesh;
}
const box = (w: number,h: number,d: number,c: number,x=0,y=0,z=0) => part(new THREE.BoxGeometry(w,h,d),c,x,y,z);
export function makeBin() {
  const group = new THREE.Group();
  group.add(box(.44,.54,.38,0x28665e,0,.27),box(.48,.07,.42,0x9fc6b4,0,.56),
    box(.30,.012,.20,0x172b30,0,.601), box(.15,.09,.015,0xe3e6d4,0,.35,.20));
  return group;
}
export function makeLitter(kind: Litter['kind']) {
  if (kind === 'cup') {
    const cup = part(new THREE.CylinderGeometry(.075,.05,.14,12),0xffbc67,0,.08,0);
    cup.rotation.z = .9;
    return cup;
  }
  if (kind === 'wrapper') {
    const wrapper = box(.20,.045,.13,0xe17b9c,0,.035);
    wrapper.rotation.y = .44;
    return wrapper;
  }
  const spill = part(new THREE.CylinderGeometry(.28,.31,.015,14),0x64b5c2,0,.018,0);
  spill.scale.z = .68;
  return spill;
}
export function makeCrate() {
  const crate = new THREE.Group();
  crate.add(box(.40,.23,.28,0xb9824e,0,.12),box(.06,.015,.28,0xecce93,0,.244));
  return crate;
}
export function makeTools() {
  const mop = new THREE.Group();
  mop.add(box(.035,.92,.035,0xd6c79d,0,.49),box(.29,.06,.13,0x75b6aa,0,.045));
  const crate = makeCrate();
  const kit = new THREE.Group(), lid = box(.33,.045,.19,0xefd267,0,.145);
  kit.add(box(.33,.13,.19,0x34495e,0,.065),lid);
  const bag = part(new THREE.SphereGeometry(.13,10,8),0x304c48,0,0,0);
  bag.scale.y = 1.25;
  const scanner = box(.10,.035,.15,0x88dad4);
  const panel = new THREE.Group();
  panel.name = 'Vending service hatch';
  panel.add(box(.27,.32,.025,0x526771,.135),box(.03,.065,.035,0xdce3cc,.23,0,.025));
  return { mop, crate, kit, lid, bag, scanner, panel };
}
