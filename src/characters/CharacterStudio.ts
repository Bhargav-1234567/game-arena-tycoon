import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { AssetManager } from '../services/AssetManager.ts';
import { ORIGINAL_CHARACTERS } from '../data/characters.ts';
import { GamingStation, DESK_SURFACES, KEYBOARD_DIMS, MOUSE_DIMS } from '../entities/GamingStation.ts';
import { OriginalCharacterMotion, CHAIR_CUSHION_HEIGHTS } from './OriginalCharacterMotion.ts';
import { APPEARANCE_SLOTS, applyCharacterAppearance, randomCharacterAppearance } from './CharacterAppearance.ts';
import type { CharacterAppearance } from './CharacterAppearance.ts';

const canvas = document.querySelector<HTMLCanvasElement>('#studio')!;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene(); scene.background = new THREE.Color('#e5e6e5');
const camera = new THREE.PerspectiveCamera(36, innerWidth / innerHeight, .01, 30);
camera.position.set(2.5, 1.45, 3.3);
const controls = new OrbitControls(camera, canvas); controls.target.set(0, .92, 0);
controls.minDistance = .35; controls.maxDistance = 5; controls.maxPolarAngle = Math.PI * .56; controls.update();
scene.add(new THREE.HemisphereLight(0xf5f8ff, 0x667c6a, 1.8));
const key = new THREE.DirectionalLight(0xffeee0, 2.5); key.position.set(-2, 4, 4); key.castShadow = true;
key.shadow.mapSize.set(2048, 2048); key.shadow.camera.left = key.shadow.camera.bottom = -1.5;
key.shadow.camera.right = key.shadow.camera.top = 1.5; key.shadow.bias = -.0001; scene.add(key);
const rim = new THREE.DirectionalLight(0xd7e9ff, 1.8); rim.position.set(2, 3, -3); scene.add(rim);
const floor = new THREE.Mesh(new THREE.CircleGeometry(2.2, 96), new THREE.MeshStandardMaterial({ color: '#cbd2cd', roughness: 1 }));
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; floor.position.y = -.002; scene.add(floor);
let model: THREE.Group | undefined, mixer: THREE.AnimationMixer | undefined, current: THREE.AnimationAction | undefined;
let motion: OriginalCharacterMotion | undefined, station: GamingStation | undefined;
const avatar = new THREE.Group(); scene.add(avatar);
let token = 0;
const select = document.querySelector<HTMLSelectElement>('#character')!, pose = document.querySelector<HTMLSelectElement>('#pose')!;
const chair = document.querySelector<HTMLSelectElement>('#chair')!;
const portrait = document.querySelector<HTMLButtonElement>('#portrait')!;
const wardrobe = document.querySelector<HTMLDivElement>('#wardrobe-panel')!;
let appearance: CharacterAppearance;
function label(value: string): string { return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function updateWardrobe(): void {
  if (!model) return;
  const options = model.userData.customHuman.appearanceOptions as Record<string, string[]>;
  wardrobe.innerHTML = APPEARANCE_SLOTS.map((slot) => `<label>${label(slot)}<select data-appearance="${slot}" aria-label="${label(slot)}">${options[slot].map((value) => `<option value="${value}" ${appearance[slot] === value ? 'selected' : ''}>${label(value)}</option>`).join('')}</select></label>`).join('')
    + (['shirtColor', 'pantsColor', 'shoeColor', 'hairColor', 'accentColor', 'soleColor', 'frameColor'] as const).map((color) => `<label>${label(color.replace('Color', ' colour'))}<input type="color" data-appearance="${color}" aria-label="${color}" value="${appearance[color]}"></label>`).join('');
}
wardrobe.addEventListener('input', (event) => {
  const input = event.target as HTMLInputElement | HTMLSelectElement, key = input.dataset.appearance;
  if (!model || !key) return;
  appearance = { ...appearance, [key]: input.value };
  applyCharacterAppearance(model, appearance);
});
document.querySelector('#random-look')!.addEventListener('click', () => {
  if (!model) return;
  // The studio allows the complete wardrobe even when inspecting the receptionist.
  appearance = randomCharacterAppearance(model.userData.customHuman.gender);
  applyCharacterAppearance(model, appearance); updateWardrobe();
});
select.innerHTML = ORIGINAL_CHARACTERS.map((character) => `<option value="${character.id}">${character.name}</option>`).join('');
const requestedCharacter = new URLSearchParams(location.search).get('character');
if (ORIGINAL_CHARACTERS.some((character) => character.id === requestedCharacter)) select.value = requestedCharacter!;
function seatedPose(): boolean { return ['Gaming', 'SitDown', 'StandUp'].includes(pose.value); }
function frame(): void {
  const close = portrait.getAttribute('aria-pressed') === 'true';
  const head = model?.getObjectByName('Head');
  const target = close && head ? head.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, .05, 0))
    : new THREE.Vector3(0, seatedPose() ? .65 : .92, seatedPose() ? .3 : 0);
  controls.target.copy(target);
  const direction = new THREE.Vector3(close ? .18 : 2.5, close ? .02 : .55, close ? (innerWidth < 600 ? .85 : .58) : (innerWidth < 600 ? 4.2 : 3.3));
  direction.applyAxisAngle(new THREE.Vector3(0, 1, 0), avatar.rotation.y);
  camera.position.copy(target).add(direction); controls.update();
}
function fitPreview(): void {
  if (!motion || !station) return;
  const seated = seatedPose(); station.group.visible = seated;
  avatar.position.copy(seated ? station.getSeatingWorldPosition() : new THREE.Vector3());
  avatar.rotation.y = seated ? Math.PI : 0;
  let blend = pose.value === 'Gaming' ? 1 : pose.value === 'SitDown' ? THREE.MathUtils.smoothstep(current?.time ?? 0, 0, .65)
    : pose.value === 'StandUp' ? 1 - THREE.MathUtils.smoothstep(current?.time ?? 0, 0, .65) : 0;
  const desk = DESK_SURFACES[station.currentDesk.level], keyboard = KEYBOARD_DIMS[station.currentKeyboard.level], mouse = MOUSE_DIMS[station.currentMouse.level];
  const keyboardZ = desk.frontZ - .05 - keyboard.d / 2;
  motion.fit(blend, CHAIR_CUSHION_HEIGHTS[station.currentChair.level], desk.surfaceY,
    station.computedChairZ - .08 - keyboardZ - .10, -.05 + keyboard.w / 2 + .08 + mouse.w / 2);
}
function animatePose(): void {
  if (!model || !mixer) return;
  motion?.restoreAnimationPose();
  current?.stop();
  const clip = (model.userData.animations as THREE.AnimationClip[]).find((clip) => clip.name === pose.value)!;
  current = mixer.clipAction(clip).reset().play();
  if (pose.value === 'SitDown' || pose.value === 'StandUp') { current.setLoop(THREE.LoopOnce, 1); current.clampWhenFinished = true; }
  mixer.update(0); fitPreview(); frame();
  document.body.dataset.pose = pose.value;
}
async function load(): Promise<void> {
  const request = ++token;
  const character = ORIGINAL_CHARACTERS.find((character) => character.id === select.value)!;
  const loaded = await AssetManager.getInstance().loadRequiredModel(character.path);
  if (request !== token) return;
  if (model) { avatar.remove(model); mixer?.stopAllAction(); mixer?.uncacheRoot(model); }
  model = loaded; avatar.add(model); appearance = { ...model.userData.customHuman.defaultAppearance };
  applyCharacterAppearance(model, appearance); updateWardrobe();
  motion = new OriginalCharacterMotion(model, avatar); mixer = new THREE.AnimationMixer(model); animatePose();
  document.querySelector('#status')!.textContent = `${character.name} · original model`;
  document.body.dataset.characterReady = character.id;
  (window as unknown as { characterStudio: unknown }).characterStudio = { model, mixer, scene, camera, renderer, avatar, motion, station };
}
let chairToken = 0;
async function loadChair(): Promise<void> {
  const request = ++chairToken, next = new GamingStation('studio', 0, 0);
  await next.loadTiers(1, Number(chair.value), 1, 1, 1, 1, 1);
  if (request !== chairToken) return;
  if (station) scene.remove(station.group);
  station = next; scene.add(next.group); fitPreview(); frame();
  document.body.dataset.chairReady = chair.value;
  const state = (window as unknown as { characterStudio?: { station: GamingStation } }).characterStudio;
  if (state) state.station = station;
}
select.addEventListener('change', () => { void load(); }); pose.addEventListener('change', animatePose);
chair.addEventListener('change', () => { void loadChair(); });
portrait.addEventListener('click', () => {
  const close = portrait.getAttribute('aria-pressed') !== 'true'; portrait.setAttribute('aria-pressed', String(close));
  frame();
});
function viewFrom(direction: THREE.Vector3): void {
  // Read the orbit distance before moving the camera to its target.
  const distance = camera.position.distanceTo(controls.target);
  camera.position.copy(controls.target).add(direction.normalize().multiplyScalar(distance));
  controls.update();
}
document.querySelector('#front')!.addEventListener('click', () => {
  viewFrom(new THREE.Vector3(0, .01, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), avatar.rotation.y));
});
document.querySelector('#side')!.addEventListener('click', () => { viewFrom(new THREE.Vector3(1, .01, .02)); });
function resize(): void { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
window.addEventListener('resize', resize); resize();
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => { motion?.restoreAnimationPose(); mixer?.update(Math.min(clock.getDelta(), .1)); fitPreview(); controls.update(); renderer.render(scene, camera); });
void Promise.all([loadChair(), load()]).then(frame).catch((error: unknown) => { document.querySelector('#status')!.textContent = error instanceof Error ? error.message : 'Character could not be loaded'; });
