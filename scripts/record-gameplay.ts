import { chromium } from '@playwright/test';
import { mkdir, writeFile, copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { OrthographicCamera, Vector3 } from 'three';
import { MatchBoard } from '../src/puzzle/MatchBoard.ts';
import { getLevel } from '../src/puzzle/catalog.ts';
import { ROOM_FOOTPRINTS } from '../src/data/world-layout.ts';
import type { GameSaveState } from '../src/services/SaveManager.ts';

const runId = new Date().toISOString().replace(/[:.]/g, '-');
const directory = resolve('artifacts/gameplay', runId);
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ headless: false, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, recordVideo: { dir: directory, size: { width: 1600, height: 1000 } } });
const started = Date.now();
const page = await context.newPage();
const chapters: { seconds: number; title: string; detail: string }[] = [];
const errors: string[] = [];
page.on('pageerror', (error) => errors.push(error.message));
const key = 'gaming_zone_tycoon_save_v1';
const saved = (): Promise<GameSaveState> => page.evaluate((storageKey) => JSON.parse(localStorage.getItem(storageKey)!), key);
const hold = (milliseconds = 1400) => page.waitForTimeout(milliseconds);
async function caption(title: string, detail: string): Promise<void> {
  chapters.push({ seconds: (Date.now() - started) / 1000, title, detail });
  await page.evaluate(({ title, detail }) => {
    if (!document.getElementById('gameplay-caption-style')) {
      const style = document.createElement('style'); style.id = 'gameplay-caption-style';
      style.textContent = 'body:has(.workshop-backdrop:not([hidden])) #gameplay-caption{width:165px!important;padding:12px!important}body:has(.workshop-backdrop:not([hidden])) #gameplay-caption strong{font-size:17px!important}body:has(.workshop-backdrop:not([hidden])) #gameplay-caption p{font-size:11px!important}';
      document.head.append(style);
    }
    let box = document.getElementById('gameplay-caption');
    if (!box) { box = document.createElement('aside'); box.id = 'gameplay-caption'; document.body.append(box); }
    box.style.cssText = 'position:fixed;left:18px;top:85px;width:245px;z-index:1000;pointer-events:none;padding:17px;background:#102738f2;color:#edf6ee;border:1px solid #8eb8a6;border-radius:14px;box-shadow:0 10px 30px #0005;font-family:system-ui';
    box.replaceChildren();
    const tag = document.createElement('div'); tag.textContent = 'GAMEPLAY WALKTHROUGH'; tag.style.cssText = 'font-size:9px;letter-spacing:1.6px;color:#b3ddbd;margin-bottom:10px';
    const heading = document.createElement('strong'); heading.textContent = title; heading.style.cssText = 'display:block;font-size:21px;line-height:1.25;margin-bottom:10px';
    const copy = document.createElement('p'); copy.textContent = detail; copy.style.cssText = 'font-size:12px;line-height:1.6;margin:0;color:#c9dcda';
    box.append(tag, heading, copy);
  }, { title, detail });
  console.log(`${Math.round((Date.now() - started) / 1000)}s: ${title}`);
}
async function click(selector: string): Promise<void> {
  const target = page.locator(selector); await target.scrollIntoViewIfNeeded();
  const bounds = await target.boundingBox();
  if (bounds) await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2, { steps: 7 });
  await target.click({ delay: 90 }); await hold(250);
}
async function view(mode: 'lounge' | 'neighborhood'): Promise<void> {
  await click(`button[data-view="${mode}"]`); await hold(100);
  await page.waitForSelector('body[data-camera-moving="false"]');
}
function project(x: number, y: number, z: number, stage: number): { x: number; y: number } {
  const bounds = ROOM_FOOTPRINTS[stage];
  const center = stage === 0 ? new Vector3() : new Vector3((bounds.minX + bounds.maxX) / 2, 0, (bounds.minZ + bounds.maxZ) / 2);
  const sum = bounds.maxX - bounds.minX + bounds.maxZ - bounds.minZ;
  const zoom = stage === 0 ? 8 : Math.max(sum / Math.sqrt(6) + 2, sum * Math.SQRT1_2 / 1.6) * 1.06;
  const camera = new OrthographicCamera(-zoom * 1.6 / 2, zoom * 1.6 / 2, zoom / 2, -zoom / 2, .1, 1000);
  const iso = Math.atan(1 / Math.SQRT2);
  camera.position.copy(center).add(new Vector3(40 * Math.cos(iso) * Math.sin(Math.PI / 4), 40 * Math.sin(iso), 40 * Math.cos(iso) * Math.cos(Math.PI / 4)));
  camera.lookAt(center); camera.updateMatrixWorld();
  const point = new Vector3(x, y, z).project(camera);
  return { x: (point.x + 1) * 800, y: (1 - point.y) * 500 };
}
async function selectPc(index = 0): Promise<void> {
  const data = await saved(), station = data.stations[index];
  const point = project(station.gridX + 1.46, 1.05, station.gridZ + .5, data.expansionCount ?? 0);
  await page.mouse.click(point.x, point.y, { delay: 100 });
  await page.locator('.hardware-slots').waitFor(); await hold(500);
}

async function solve(): Promise<void> {
  for (let step = 0; step < 160; step++) {
    const state = (await saved()).workshop, session = state.session!;
    if (session.status === 'won') return;
    if (session.status === 'lost') { await click('[data-action="retry"]'); continue; }
    const level = getLevel(session.level), board = new MatchBoard(level, 1, session.board);
    let best = { a: 0, b: 0, score: -Infinity, booster: '' };
    const score = (next: MatchBoard, target: number, points: number) => Math.min(target, Math.max(0, level.targetCount - session.collected)) * 1000 +
      (board.remainingObstacles() - next.remainingObstacles()) * 1300 + points / 100 + next.cells.filter((cell) => cell.special !== 'none').length * 40;
    for (const [a, b] of board.legalMoves()) {
      const next = new MatchBoard(level, 1, session.board), result = next.swap(a, b), value = score(next, result.pieces[level.target] ?? 0, result.score);
      if (value > best.score) best = { a, b, score: value, booster: '' };
    }
    if (session.movesLeft <= 6) for (const kind of ['cpu', 'gpu'] as const) {
      if (state.boosters[kind] <= 1) continue; // Reserve a charge for the explicit systems demonstration.
      for (let index = 0; index < 49; index++) {
        const next = new MatchBoard(level, 1, session.board), result = next.useBooster(kind, index), value = score(next, result.pieces[level.target] ?? 0, result.score) + 200;
        if (value > best.score) best = { a: index, b: index, score: value, booster: kind };
      }
    }
    if (best.booster) { await click(`[data-booster="${best.booster}"]`); await click(`[data-cell="${best.a}"]`); }
    else { await click(`[data-cell="${best.a}"]`); await hold(150); await click(`[data-cell="${best.b}"]`); }
    await page.locator('.board-resolving').waitFor({ state: 'detached' });
  }
  throw new Error('Puzzle did not finish within the recording action limit.');
}

async function demonstrateLifelines(): Promise<void> {
  const demonstrated = new Set<string>();
  let specialsCreated: string[] = [];
  await click('[data-open="puzzle"]'); await click('[data-action="next"]');
  for (const kind of ['gpu', 'cpu', 'mouse', 'cooling'] as const) assert.ok((await saved()).workshop.boosters[kind] > 0, `The recording needs an earned ${kind} charge.`);
  await caption('The original hardware tiles', 'CPU chips, memory modules, twin-fan GPUs, SSD contacts, power circuits and cooling fans each have distinct component artwork.');
  await hold(2400);
  await caption('Cooling Wave', 'Level 3 starts with heat. Cooling removes every hot zone and pauses virus growth for three normal moves. It spends one charge and zero moves.');
  const moves = (await saved()).workshop.session!.movesLeft;
  await click('[data-booster="cooling"]'); await page.locator('.board-resolving').waitFor({ state: 'detached' }); await hold(1800);
  demonstrated.add('cooling');
  await caption('CPU Chain', 'Choose a part type. The CPU processes up to six matching components, then gravity and cascades resolve. The move counter stays unchanged.');
  if ((await saved()).workshop.boosters.cpu > 0) {
    await click('[data-booster="cpu"]');
    const cells = (await saved()).workshop.session!.board.cells, target = cells.findIndex((cell) => cell.piece === 'cpu');
    await page.locator(`[data-cell="${target}"]`).hover(); await hold(1400); await click(`[data-cell="${target}"]`);
    await page.locator('.board-resolving').waitFor({ state: 'detached' }); await hold(1500);
    demonstrated.add('cpu');
  }
  await caption('Free Move and special pieces', 'Free Move can swap any two unlocked parts. A four-match creates a row-and-column blaster; a five-match creates an RGB core.');
  const state = (await saved()).workshop, session = state.session!, level = getLevel(session.level);
  if (state.boosters.mouse > 0 && session.status === 'playing') {
    let choice = { a: 0, b: 48, value: -1 };
    for (let a = 0; a < 49; a++) for (let b = a + 1; b < 49; b++) {
      const board = new MatchBoard(level, 1, session.board), result = board.swap(a, b, true);
      if (!result.valid || session.collected + (result.pieces[level.target] ?? 0) >= level.targetCount) continue;
      const value = board.cells.reduce((score, cell) => score + (cell.special === 'rgb' ? 100 : cell.special === 'line' ? 10 : 0), 0);
      if (value > choice.value) choice = { a, b, value };
    }
    await click('[data-booster="mouse"]'); await click(`[data-cell="${choice.a}"]`); await hold(1200); await click(`[data-cell="${choice.b}"]`);
    await page.locator('.board-resolving').waitFor({ state: 'detached' }); await hold(2200);
    demonstrated.add('mouse');
    specialsCreated = (await saved()).workshop.session!.board.cells.filter((cell) => cell.special !== 'none').map((cell) => cell.special);
  }
  await caption('GPU Render and power-up activation', 'Preview the 3 × 3 frame before firing. If it reaches a special, row/column beams or an RGB color clear chain into the cascade.');
  const current = (await saved()).workshop;
  if (current.boosters.gpu > 0 && current.session!.status === 'playing') {
    const special = current.session!.board.cells.findIndex((cell) => cell.special !== 'none');
    const target = special < 0 ? 24 : special;
    await click('[data-booster="gpu"]'); await page.locator(`[data-cell="${target}"]`).hover(); await hold(1800); await click(`[data-cell="${target}"]`);
    await page.locator('.board-resolving').waitFor({ state: 'detached' }); await hold(2200);
    demonstrated.add('gpu');
  }
  assert.deepEqual([...demonstrated].sort(), ['cooling', 'cpu', 'gpu', 'mouse']);
  assert.equal((await saved()).workshop.session!.movesLeft, moves, 'All demonstrated lifelines must cost zero normal moves.');
  await writeFile(resolve(directory, 'lifeline-demonstration.json'), JSON.stringify({ systems: [...demonstrated],
    movesBefore: moves, movesAfter: (await saved()).workshop.session!.movesLeft, specialsCreated }, null, 2));
  await caption('Earned charges and the build paths', 'Normal matches fill the six-point meter. Rewards rotate Free Move, CPU, Cooling, GPU. Every level also grants its listed booster on the first clear.');
  await click('.workshop-header [data-action="map"]'); await hold(2600); await click('.workshop-header [data-action="map"]');
  await click('[data-action="close"]');
}

try {
  await page.goto(process.argv[2] ?? 'http://127.0.0.1:4173');
  await page.waitForSelector('body[data-game-ready="true"]', { timeout: 60000 });
  await caption('A living gaming district', 'Our lounge now belongs to a neighborhood: workshop, café, tournament plaza, parking, pedestrians and moving traffic.'); await hold(3000);
  await click('[data-zoom="0.8"]'); await hold(900);
  await page.mouse.move(1100, 500); await page.mouse.down({ button: 'right' });
  await page.mouse.move(1000, 540, { steps: 20 }); await page.mouse.up({ button: 'right' }); await hold(1200);
  await view('neighborhood');
  await click('#district-lighting'); await page.locator('#district-lighting').selectOption('day'); await hold();
  await caption('Day, evening and night', 'Choose an atmosphere, or let the lighting follow the in-game clock. Streetlights and shop windows stay readable.');
  await page.locator('#district-lighting').selectOption('night'); await hold(2300);
  await page.locator('#district-lighting').selectOption('evening'); await hold();
  await caption('Your lounge. Your identity.', 'Rename the business and upgrade its frontage: neon signs, an awning, planters and a flagship entrance.');
  await click('.district-toolbar [data-place="expansion"]'); await page.locator('#lounge-name').fill('Darshan Game Arena'); await click('[data-world-action="rename"]');
  for (let i = 0; i < 3; i++) { await click('[data-world-action="frontage"]'); await hold(1200); }
  await click('[data-world-action="close"]'); await hold(2200);
  await caption('Neighborhood Cup', 'A free tournament: serve three paying customers in two minutes. Win $500 and reputation. Puzzle and inventory time is paused.');
  await click('.world-hotspot[data-place="plaza"]'); await click('[data-world-action="tournament"]'); await hold(2200); await click('[data-world-action="close"]');
  await view('lounge');
  await caption('Work the counter', 'Use the arrow keys to stand in the mint ring. When check-in finishes, choose a PC for the next guest.');
  await page.keyboard.down('ArrowLeft');
  try { await page.waitForFunction(() => document.querySelector('.reception-hint')?.textContent?.includes('At reception')); }
  finally { await page.keyboard.up('ArrowLeft'); }
  for (let guest = 0; guest < 3; guest++) await page.locator('.pc-choices button').first().click({ timeout: 60000 });
  await page.keyboard.down('ArrowRight');
  try { await page.waitForFunction(() => document.querySelector('.reception-hint')?.textContent?.includes('mint ring')); }
  finally { await page.keyboard.up('ArrowRight'); }
  await view('neighborhood');
  await caption('A café partnership', 'Pixel Bites adds five satisfaction points to every gaming station. The one-time partnership is saved with your lounge.');
  await click('.world-hotspot[data-place="cafe"]'); await click('[data-world-action="cafe"]'); await hold(1800); await click('[data-world-action="close"]');
  await caption('Real street arrivals', 'The Circuit Line bus brings visitors. Customers use the crossing and doorway, and traffic yields while they cross.');
  await click('.world-hotspot[data-place="bus"]'); await hold(3500); await click('[data-world-action="close"]'); await hold(2500);
  await caption('Enter the lounge', 'Switch between neighborhood and lounge views. The roof and foreground walls cut away so every PC stays easy to manage.');
  await view('lounge'); await hold(2600); await view('neighborhood');
  await caption('The physical Build & Boot workshop', 'Clicking the workshop opens Puzzle Lab. Every finished puzzle earns its displayed part and five diamonds.');
  await click('.world-hotspot[data-place="workshop"]'); await click('[data-action="start"]'); await hold(1800);
  await caption('Change the reward with diamonds', 'Choose a different part before winning. Charges are 5, 10, 20, then 25 diamonds each. The offer survives retries and reloads.');
  for (let i = 0; i < 5; i++) {
    await click('[data-action="reward-picker"]'); await page.locator('#reward-choice').selectOption(i % 2 ? 'cpu_t1' : 'gpu_t1');
    await hold(700); await click('[data-action="change-reward"]'); await hold(850);
  }
  await caption('Play to earn the graphics card', 'These are real board moves. Adjacent matches, cascades, special pieces and lifelines work together to complete the objective.');
  await solve(); assert.equal((await saved()).workshop.parts.length, 1); await hold(2400);
  await caption('Collect and attach', 'The selected graphics card is now in inventory. Attach it to PC 1: available decreases, installed increases, total ownership stays the same.');
  await click('[data-action="inventory"]'); await click('[data-part="gpu_t1"]'); await hold(2200); await click('[data-action="close"]');
  await view('lounge'); await selectPc(); await hold(2200);
  await caption('The PC popover', 'Installed hardware appears when a PC is selected. Detach sends the exact copy back to inventory; attach installs it again.');
  await click('[data-hardware-detach]'); await hold(1300); await click('[data-hardware-attach="gpu"]'); await hold(1800);
  await click('#close-inspector-btn');
  await caption('A second puzzle and a second copy', 'Level 2 introduces dust. Earn another card, then replace the installed one and move the spare to a different PC.');
  await click('[data-open="puzzle"]'); await click('[data-action="next"]'); await solve(); await hold(2000);
  await click('[data-action="inventory"]'); await click('[data-part="gpu_t1"]'); await hold(1800);
  const pcs = (await saved()).stations;
  await page.locator('[data-equip-station="gpu_t1"]').selectOption(pcs[1].id); await click('[data-part="gpu_t1"]'); await hold(1800); await click('[data-action="close"]');
  assert.equal((await saved()).workshop.parts.filter((part) => part.stationId).length, 2);
  await demonstrateLifelines();
  await caption('Upgrade, move and rotate', 'A PC keeps its earned hardware when its base rig is upgraded or its station is repositioned.');
  await selectPc(); await click('#upgrade-pc-btn'); await hold(1000); await click('#move-item-btn'); await page.keyboard.press('r');
  const moved = project(-3.8, 0, -1.8, 0); await page.mouse.move(moved.x, moved.y, { steps: 20 }); await hold(700); await page.mouse.click(moved.x, moved.y); await hold(1600);
  await view('neighborhood');
  await caption('Six stages of visible expansion', 'Each new wing adds usable floor space, a larger roof and a construction transition. The entire site was reserved from the start.');
  await click('.district-toolbar [data-place="expansion"]');
  for (let i = 0; i < 6; i++) { await click('[data-world-action="expand"]'); await hold(3700); }
  await click('[data-world-action="close"]'); await hold(2400);
  assert.equal((await saved()).expansionCount, 6);
  await caption('Grow the gaming floor', 'Use the new wings to add stations. Furniture placement and normal business management remain part of the same game.');
  await view('lounge'); await click('#btn-toggle-build');
  const stationCard = page.locator('.item-card').filter({ hasText: 'Gaming BattleStation' }); await stationCard.locator('.buy-btn').click(); await hold(600);
  for (const [x, z] of [[-2.8, -6.8], [2.2, -6.8]]) {
    const spot = project(x, 0, z, 6); await page.mouse.move(spot.x, spot.y, { steps: 15 }); await hold(400); await page.mouse.click(spot.x, spot.y); await hold(900);
  }
  await page.keyboard.press('Escape'); await click('#btn-toggle-build'); await hold(1800);
  await caption('Staff, savings and persistence', 'Hire an engineer and save the business. The storefront, expansions, parts, diamonds, café and puzzle progress restore together.');
  await click('#btn-stats-modal'); await page.locator('.hire-btn[data-role="technician"]').click(); await hold(1400);
  page.once('dialog', (dialog) => dialog.accept()); await click('#save-game-btn'); await click('#close-stats-btn');
  await view('neighborhood');
  for (let i = 0; i < 30 && (await saved()).neighborhood?.event?.status !== 'won'; i++) await hold(2000);
  assert.equal((await saved()).neighborhood?.event?.status, 'won', 'Real customers must finish the tournament.');
  await caption('A district champion', 'Three paying visits completed the Neighborhood Cup. The prize is saved once and the plaza poster celebrates the result.');
  await click('.world-hotspot[data-place="plaza"]'); await hold(3000); await click('[data-world-action="close"]');
  await click('.world-hotspot[data-place="parking"]'); await hold(1800); await click('[data-world-action="close"]');
  await page.reload(); await page.waitForSelector('body[data-game-ready="true"]', { timeout: 60000 });
  const restored = await saved(); assert.equal(restored.neighborhood?.shopName, 'Darshan Game Arena'); assert.equal(restored.expansionCount, 6); assert.ok(restored.workshop.parts.length >= 2);
  await caption('One connected game', 'A thriving street outside. A growing lounge inside. Puzzle-earned hardware, saved progress and room for the next chapter.');
  await page.screenshot({ path: resolve(directory, 'final-neighborhood.png') }); await hold(4000);
  assert.deepEqual(errors, []);
} catch (error) {
  await page.screenshot({ path: resolve(directory, 'recording-error.png') }).catch(() => {});
  throw error;
} finally {
  const video = page.video(); await context.close();
  if (video) await copyFile(await video.path(), resolve(directory, 'Game_Arena_Tycoon_Gameplay.webm'));
  await writeFile(resolve(directory, 'chapters.json'), JSON.stringify(chapters, null, 2));
  await writeFile(resolve(directory, 'browser-errors.json'), JSON.stringify(errors, null, 2));
  console.log(`Recording folder: ${directory}`); await browser.close();
}
