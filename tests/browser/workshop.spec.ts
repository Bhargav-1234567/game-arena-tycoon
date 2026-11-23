import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { OrthographicCamera, Vector3 } from 'three';
import { getLevel } from '../../src/puzzle/catalog.ts';
import { MatchBoard } from '../../src/puzzle/MatchBoard.ts';
import type { GameSaveState } from '../../src/services/SaveManager.ts';

const KEY = 'gaming_zone_tycoon_save_v1';
async function saved(page: Page): Promise<GameSaveState> {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), KEY);
}
async function ready(page: Page) {
  await page.goto('/');
  await expect(page.locator('body')).toHaveAttribute('data-game-ready', 'true', { timeout: 60000 });
  await page.locator('button[data-view="lounge"]').click();
  await expect(page.locator('body')).toHaveAttribute('data-camera-moving', 'false');
}
async function openPuzzle(page: Page) { await page.getByRole('button', { name: /Puzzle Lab/ }).click(); }
async function start(page: Page) { await openPuzzle(page); await page.getByRole('button', { name: /Start Puzzle 1/ }).click(); }
async function close(page: Page) { await page.getByRole('button', { name: 'Close workshop' }).click(); }

/** Choose moves from the current saved board; all moves are played through real UI clicks. */
async function solve(page: Page) {
  for (let step = 0; step < 160; step++) {
    const state = (await saved(page)).workshop, session = state.session!;
    if (session.status === 'won') return;
    if (session.status === 'lost') { await page.getByRole('button', { name: 'Retry puzzle' }).click(); continue; }
    const level = getLevel(session.level);
    const board = new MatchBoard(level, 1, session.board);
    const score = (next: MatchBoard, pieces: number, value: number) =>
      Math.min(pieces, Math.max(0, level.targetCount - session.collected)) * 1000 +
      (board.remainingObstacles() - next.remainingObstacles()) * 1300 + value / 100 + next.cells.filter((cell) => cell.special !== 'none').length * 40;
    let best: { a: number; b: number; value: number; booster?: 'cpu' | 'gpu' } | undefined;
    for (const [a, b] of board.legalMoves()) {
      const next = new MatchBoard(level, 1, session.board), result = next.swap(a, b);
      const value = score(next, result.pieces[level.target] ?? 0, result.score);
      if (!best || value > best.value) best = { a, b, value };
    }
    if (session.movesLeft <= 6) for (const kind of ['cpu', 'gpu'] as const) {
      if (!state.boosters[kind]) continue;
      for (let index = 0; index < 49; index++) {
        const next = new MatchBoard(level, 1, session.board), result = next.useBooster(kind, index);
        const value = score(next, result.pieces[level.target] ?? 0, result.score) + 200;
        if (!best || value > best.value) best = { a: index, b: index, value, booster: kind };
      }
    }
    expect(best).toBeTruthy();
    const before = session.board;
    if (best!.booster) {
      await page.locator(`[data-booster="${best!.booster}"]`).click();
      await page.locator(`[data-cell="${best!.a}"]`).click();
    } else {
      await page.locator(`[data-cell="${best!.a}"]`).click();
      await page.locator(`[data-cell="${best!.b}"]`).click();
    }
    await expect.poll(async () => (await saved(page)).workshop.session!.board).not.toEqual(before);
    await expect(page.locator('.board-resolving')).toHaveCount(0);
  }
  throw new Error('Could not complete puzzle through UI within 160 actions.');
}

async function selectPc(page: Page, index = 0) {
  const data = await saved(page), station = data.stations[index], viewport = page.viewportSize()!;
  const camera = new OrthographicCamera(-4 * viewport.width / viewport.height, 4 * viewport.width / viewport.height, 4, -4, .1, 1000);
  const iso = Math.atan(1 / Math.SQRT2);
  camera.position.set(40 * Math.cos(iso) * Math.sin(Math.PI / 4), 40 * Math.sin(iso), 40 * Math.cos(iso) * Math.cos(Math.PI / 4));
  camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
  const center = new Vector3(station.gridX + 1.46, 1.05, station.gridZ + .5).project(camera);
  const x = (center.x + 1) / 2 * viewport.width, y = (1 - center.y) / 2 * viewport.height;
  await page.mouse.click(x, y);
  await expect(page.locator('.hardware-slots')).toBeVisible();
}

test('real puzzle win, inventory attachment, PC popover, detachment and reload', async ({ page }, info) => {
  const errors: string[] = [], failedAssets: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => { if (response.status() >= 400) failedAssets.push(response.url()); });
  await ready(page); const initial = await saved(page); expect(initial.stations).toHaveLength(2);
  await start(page);
  await page.getByRole('button', { name: /Change reward/ }).click();
  await page.locator('#reward-choice').selectOption('gpu_t1');
  await page.getByRole('button', { name: /Confirm/ }).click();
  await expect(page.locator('[data-reward-name]')).toHaveText('Starter Graphics card');
  expect((await saved(page)).workshop.diamonds).toBe(95);
  await page.screenshot({ path: info.outputPath('puzzle.png') });
  await solve(page);
  await expect(page.getByText('Starter Graphics card earned!')).toBeVisible();
  const won = await saved(page); expect(won.workshop.parts).toHaveLength(1); expect(won.workshop.diamonds).toBe(100);
  await page.getByRole('button', { name: 'Open Inventory' }).click();
  await expect(page.locator('.inventory-summary')).toContainText('1');
  await page.getByRole('button', { name: 'Attach part', exact: true }).click();
  expect((await saved(page)).workshop.parts[0].stationId).toBe(initial.stations[0].id);
  await page.screenshot({ path: info.outputPath('inventory-attached.png') });
  await close(page);
  // 3D selection has a desktop camera target; mobile inspector is checked via the inventory and restored assignments.
  if (info.project.name === 'desktop') {
    await selectPc(page);
    await expect(page.locator('[data-hardware-slot="gpu"]')).toContainText('Starter Graphics card');
    await expect(page.locator('.station-inspector')).toHaveCSS('opacity', '1');
    await page.screenshot({ path: info.outputPath('pc-popover.png') });
    await page.locator('[data-hardware-detach]').click();
    expect((await saved(page)).workshop.parts[0].stationId).toBeNull();
    await page.locator('[data-hardware-attach="gpu"]').click();
    expect((await saved(page)).workshop.parts[0].stationId).toBe(initial.stations[0].id);
  }
  await page.reload(); await expect(page.locator('body')).toHaveAttribute('data-game-ready', 'true', { timeout: 60000 });
  const restored = await saved(page);
  expect(restored.stations.map((station) => station.id)).toEqual(initial.stations.map((station) => station.id));
  expect(restored.workshop.parts).toHaveLength(1); expect(restored.workshop.parts[0].stationId).toBe(initial.stations[0].id);
  await page.getByRole('button', { name: /Inventory/ }).click();
  await page.getByRole('button', { name: 'Detach', exact: true }).click();
  expect((await saved(page)).workshop.parts[0].stationId).toBeNull();
  expect(errors).toEqual([]);
  expect(failedAssets).toEqual([]);
});

test('all reward prices, insufficient diamonds, active-board resume and pause', async ({ page }, info) => {
  await ready(page); await start(page);
  const original = await saved(page);
  for (let i = 0; i < 5; i++) {
    const cost = [5, 10, 20, 25, 25][i];
    await expect(page.getByRole('button', { name: /Change reward/ })).toContainText(String(cost));
    await page.getByRole('button', { name: /Change reward/ }).click();
    await page.locator('#reward-choice').selectOption(i % 2 ? 'cpu_t1' : 'gpu_t1');
    await page.getByRole('button', { name: /Confirm/ }).click();
  }
  expect((await saved(page)).workshop.diamonds).toBe(15);
  await page.getByRole('button', { name: /Change reward/ }).click();
  await expect(page.getByRole('button', { name: /Confirm/ })).toBeDisabled();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.keyboard.press('r'); await page.keyboard.press('m');
  await page.waitForTimeout(1200);
  expect((await saved(page)).economy.timeMinutes).toBe(original.economy.timeMinutes);
  await page.screenshot({ path: info.outputPath('prices-and-pause.png') });
  const beforeReload = (await saved(page)).workshop;
  await page.reload(); await expect(page.locator('body')).toHaveAttribute('data-game-ready', 'true', { timeout: 60000 });
  expect((await saved(page)).workshop).toEqual(beforeReload);
  await openPuzzle(page);
  await expect(page.locator('[data-reward-name]')).toHaveText('Starter Graphics card');
  await expect(page.getByRole('button', { name: /Change reward/ })).toContainText('25');
  await page.getByRole('button', { name: /Show a possible move/ }).click();
  await expect(page.locator('.tile-hint')).toHaveCount(2);
  const hinted = await page.locator('.tile-hint').evaluateAll((cells) => cells.map((cell) => Number((cell as HTMLElement).dataset.cell)));
  await page.locator(`[data-cell="${hinted[0]}"]`).click(); await page.locator(`[data-cell="${hinted[1]}"]`).click();
  expect((await saved(page)).workshop.session!.movesLeft).toBe(19);
});

test('lost puzzle can retry without resetting reward-change cost', async ({ page }) => {
  await ready(page); await start(page);
  await page.getByRole('button', { name: /Change reward/ }).click();
  await page.locator('#reward-choice').selectOption('gpu_t1'); await page.getByRole('button', { name: /Confirm/ }).click();
  // A saved near-failure fixture exercises the failure/retry UI; completion tests above use real full puzzles.
  const failureFixture = await saved(page);
  failureFixture.workshop.session!.movesLeft = 1; failureFixture.workshop.session!.collected = 0;
  await page.addInitScript(({ key, data }) => localStorage.setItem(key, data), { key: KEY, data: JSON.stringify(failureFixture) });
  await page.reload(); await expect(page.locator('body')).toHaveAttribute('data-game-ready', 'true', { timeout: 60000 }); await openPuzzle(page);
  const session = (await saved(page)).workshop.session!;
  const board = new MatchBoard(getLevel(1), 1, session.board);
  const move = board.legalMoves().find(([a, b]) => {
    const clone = new MatchBoard(getLevel(1), 1, session.board); return (clone.swap(a, b).pieces.power ?? 0) < 10;
  })!;
  await page.locator(`[data-cell="${move[0]}"]`).click(); await page.locator(`[data-cell="${move[1]}"]`).click();
  await expect(page.getByRole('button', { name: 'Retry puzzle' })).toBeVisible();
  expect((await saved(page)).workshop.parts).toHaveLength(0);
  await expect(page.locator('.board-resolving')).toHaveCount(0);
  await page.getByRole('button', { name: 'Retry puzzle' }).click();
  expect((await saved(page)).workshop.session!.changeCount).toBe(1);
  expect((await saved(page)).workshop.session!.rewardPartId).toBe('gpu_t1');
  await expect(page.locator('[data-moves]')).toHaveText('20');
});

test('storage failure blocks diamond deduction and tells player what happened', async ({ page }) => {
  await ready(page); await start(page); const before = (await saved(page)).workshop;
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new Error('Test quota failure'); }; });
  await page.getByRole('button', { name: /Change reward/ }).click();
  await page.locator('#reward-choice').selectOption('gpu_t1'); await page.getByRole('button', { name: /Confirm/ }).click();
  await expect(page.getByRole('alert')).toContainText('Could not save');
  await expect(page.locator('[data-reward-name]')).toHaveText('Starter Processor');
  expect((await saved(page)).workshop).toEqual(before);
});

test('corrupt save is preserved and reset requires explicit confirmation', async ({ page }) => {
  await page.addInitScript((key) => { if (!localStorage.getItem(key)) localStorage.setItem(key, '{corrupt'); }, KEY);
  await page.goto('/'); await expect(page.getByRole('heading', { name: 'Your lounge could not be opened' })).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), KEY)).toBe('{corrupt');
  page.once('dialog', (dialog) => dialog.dismiss()); await page.getByRole('button', { name: 'Reset saved game' }).click();
  expect(await page.evaluate((key) => localStorage.getItem(key), KEY)).toBe('{corrupt');
});

test('responsive layout and keyboard focus stay inside the dialog', async ({ page }, info) => {
  await ready(page); await start(page);
  const overflow = await page.locator('.workshop-dialog').evaluate((element) => element.scrollWidth > element.clientWidth);
  expect(overflow).toBe(false);
  const bounds = await page.locator('.puzzle-board').boundingBox(); expect(bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.keyboard.press('Tab');
  expect(await page.locator('.workshop-dialog').evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await page.screenshot({ path: info.outputPath('responsive-puzzle.png') });
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Puzzle Lab/ })).toBeFocused();
});

test('swipe plays a real move and lifelines do not consume moves', async ({ page, context }, info) => {
  await ready(page); await start(page);
  const session = (await saved(page)).workshop.session!;
  const board = new MatchBoard(getLevel(1), 1, session.board), [a, b] = board.legalMoves()[0];
  await page.locator(`[data-cell="${a}"]`).scrollIntoViewIfNeeded();
  const from = (await page.locator(`[data-cell="${a}"]`).boundingBox())!;
  const to = (await page.locator(`[data-cell="${b}"]`).boundingBox())!;
  const x1 = from.x + from.width / 2, y1 = from.y + from.height / 2;
  const x2 = to.x + to.width / 2, y2 = to.y + to.height / 2;
  if (info.project.name === 'mobile') {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x1, y: y1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x2, y: y2 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    await page.mouse.move(x1, y1); await page.mouse.down(); await page.mouse.move(x2, y2, { steps: 5 }); await page.mouse.up();
  }
  await expect.poll(async () => (await saved(page)).workshop.session!.movesLeft).toBe(19);
  await expect(page.locator('.board-resolving')).toHaveCount(0);
  const before = (await saved(page)).workshop;
  await page.locator('[data-booster="gpu"]').click(); await page.locator('[data-cell="24"]').click();
  await expect.poll(async () => (await saved(page)).workshop.boosters.gpu).toBe(before.boosters.gpu - 1);
  expect((await saved(page)).workshop.session!.movesLeft).toBe(19);
});

test('play six campaign levels through dust, heat, cable and virus hazards', async ({ page }, info) => {
  test.setTimeout(240000);
  await ready(page); await start(page);
  for (let level = 1; level <= 6; level++) {
    expect((await saved(page)).workshop.session!.level).toBe(level);
    await solve(page);
    expect((await saved(page)).workshop.parts).toHaveLength(level);
    if (level < 6) await page.getByRole('button', { name: 'Next Puzzle →' }).click();
  }
  const state = (await saved(page)).workshop;
  expect(state.completed.sort()).toEqual([1, 2, 3, 4, 5, 6]); expect(state.diamonds).toBe(130);
  await page.screenshot({ path: info.outputPath('campaign-six-wins.png') });
});

test('replace parts across two PCs, upgrade and move a PC, then restore the same ownership', async ({ page }, info) => {
  await ready(page);
  const fixture = await saved(page), firstPc = fixture.stations[0].id, secondPc = fixture.stations[1].id;
  fixture.workshop.parts = [
    { id: 'test_gpu_a', partId: 'gpu_t1', stationId: null },
    { id: 'test_gpu_b', partId: 'gpu_t2', stationId: null },
    { id: 'test_cpu_a', partId: 'cpu_t1', stationId: null }
  ];
  // This fixture isolates equipment operations; rewards are earned through full UI play in other tests.
  await page.addInitScript(({ key, raw }) => {
    if (!sessionStorage.getItem('equipment-fixture')) {
      localStorage.setItem(key, raw); sessionStorage.setItem('equipment-fixture', 'applied');
    }
  }, { key: KEY, raw: JSON.stringify(fixture) });
  await page.reload(); await expect(page.locator('body')).toHaveAttribute('data-game-ready', 'true', { timeout: 60000 });
  await page.getByRole('button', { name: /Inventory/ }).click();
  await page.locator('[data-part="gpu_t1"]').click();
  await expect(page.locator('[data-part="gpu_t2"]')).toHaveText('Replace installed part');
  await page.locator('[data-part="gpu_t2"]').click();
  let state = (await saved(page)).workshop;
  expect(state.parts.find((part) => part.id === 'test_gpu_a')!.stationId).toBeNull();
  expect(state.parts.find((part) => part.id === 'test_gpu_b')!.stationId).toBe(firstPc);
  await page.locator('[data-equip-station="gpu_t1"]').selectOption(secondPc);
  await page.locator('[data-part="gpu_t1"]').click(); await page.locator('[data-part="cpu_t1"]').click();
  state = (await saved(page)).workshop;
  expect(state.parts.filter((part) => !part.stationId)).toHaveLength(0);
  await close(page);
  if (info.project.name === 'desktop') {
    await selectPc(page);
    await page.locator('#upgrade-pc-btn').click();
    await expect(page.locator('.station-inspector')).toContainText('Gamer Rig (Lvl 2)');
    await page.locator('#move-item-btn').click();
    await page.keyboard.press('r');
    const viewport = page.viewportSize()!, camera = new OrthographicCamera(-4 * viewport.width / viewport.height, 4 * viewport.width / viewport.height, 4, -4, .1, 1000);
    const iso = Math.atan(1 / Math.SQRT2);
    camera.position.set(40 * Math.cos(iso) * Math.sin(Math.PI / 4), 40 * Math.sin(iso), 40 * Math.cos(iso) * Math.cos(Math.PI / 4));
    camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
    const target = new Vector3(-3.8, 0, -1.8).project(camera);
    const x = (target.x + 1) / 2 * viewport.width, y = (1 - target.y) / 2 * viewport.height;
    await page.mouse.move(x, y); await page.mouse.click(x, y);
  }
  await page.getByRole('button', { name: /Management/ }).click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: /Save Game Progress/ }).click();
  const before = await saved(page);
  if (info.project.name === 'desktop') {
    expect(before.stations[0].pcLevel).toBe(2); expect(before.stations[0].rotationIndex).toBe(1);
    expect(before.stations[0].gridZ).toBe(-2);
  }
  await page.reload(); await expect(page.locator('body')).toHaveAttribute('data-game-ready', 'true', { timeout: 60000 });
  const after = await saved(page);
  expect(after.workshop.parts).toEqual(before.workshop.parts);
  expect(after.stations).toEqual(before.stations);
  expect(after.objects).toEqual(before.objects); expect(after.receptions).toEqual(before.receptions);
});

test('another tab cannot overwrite newly spent diamonds', async ({ page, context }) => {
  await ready(page); await start(page);
  const second = await context.newPage(); await ready(second); await openPuzzle(second);
  await second.getByRole('button', { name: /Change reward/ }).click();
  await second.locator('#reward-choice').selectOption('gpu_t1');
  await second.getByRole('button', { name: /Confirm/ }).click();
  await expect(page.getByRole('alert')).toContainText('changed in another tab');
  await page.close();
  expect((await saved(second)).workshop.diamonds).toBe(95);
  await second.close();
});
