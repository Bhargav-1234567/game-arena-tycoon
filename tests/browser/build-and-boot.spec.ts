import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { MatchBoard } from '../../src/puzzle/MatchBoard.ts';
import { getLevel, PIECES } from '../../src/puzzle/catalog.ts';
import { newWorkshopState } from '../../src/systems/WorkshopSystem.ts';
import type { GameSaveState } from '../../src/services/SaveManager.ts';

const KEY = 'gaming_zone_tycoon_save_v1';
const saved = (page: Page): Promise<GameSaveState> => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), KEY);
const settled = (page: Page) => expect(page.locator('.board-resolving')).toHaveCount(0);
async function ready(page: Page) {
  await page.goto('/'); await expect(page.locator('body')).toHaveAttribute('data-game-ready', 'true', { timeout: 60000 });
}
async function open(page: Page) { await page.locator('[data-open="puzzle"]').click(); }

/** Explicit seeded fixtures isolate specials and hazards; ordinary campaign tests earn their wins. */
async function seed(page: Page, levelNumber: number, arrange: (state: GameSaveState) => void = () => {}) {
  const state = await saved(page), level = getLevel(levelNumber), board = new MatchBoard(level, 123);
  board.cells.forEach((cell, index) => Object.assign(cell, { piece: PIECES[(Math.floor(index / 7) + index % 7) % 6], special: 'none', obstacle: 'none' }));
  state.workshop = { ...newWorkshopState(), highestUnlocked: levelNumber, session: {
    id: 'seeded-parity-fixture', level: levelNumber, rewardPartId: `cpu_t${level.rewardTier}`, changeCount: 0,
    board: board.snapshot(), movesLeft: level.moves, collected: 0, score: 0, status: 'playing'
  } };
  arrange(state);
  await page.goto('about:blank');
  const marker = `fixture-${Date.now()}-${Math.random()}`;
  await page.addInitScript(({ key, state, marker }) => {
    if (location.hostname === '127.0.0.1' && !sessionStorage.getItem(marker)) {
      localStorage.setItem(key, JSON.stringify(state)); sessionStorage.setItem(marker, 'used');
    }
  }, { key: KEY, state, marker });
  await ready(page); await open(page);
}

test('original hardware art, visible lifeline bay, targeting preview and cancel, guide and ten build paths', async ({ page }, info) => {
  await ready(page); await open(page); await page.locator('[data-action="start"]').click();
  for (const piece of PIECES) await expect(page.locator(`.puzzle-board .bb-${piece}`).first()).toBeVisible();
  for (const kind of ['gpu', 'cpu', 'mouse', 'cooling']) {
    const button = page.locator(`[data-booster="${kind}"]`); const box = (await button.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(0); expect(box.y + box.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  }
  const before = (await saved(page)).workshop;
  await page.locator('[data-booster="gpu"]').click(); await page.locator('[data-cell="24"]').hover();
  await expect(page.locator('.target-preview')).toHaveCount(9);
  await expect(page.locator('[data-selected-lifeline="gpu"]')).toContainText('center tile');
  await page.locator('[data-action="cancel-booster"]').click();
  expect((await saved(page)).workshop).toEqual(before);
  await page.locator('[data-booster="cpu"]').click(); await page.locator('[data-cell="24"]').hover();
  const piece = before.session!.board.cells[24].piece;
  await expect(page.locator('.target-preview')).toHaveCount(before.session!.board.cells.filter((cell) => cell.piece === piece).length);
  await page.keyboard.press('Escape'); expect((await saved(page)).workshop).toEqual(before);
  await page.locator('[data-action="help"]').click(); await expect(page.getByRole('region', { name: 'Puzzle guide' })).toContainText('Line blaster');
  await page.locator('[data-action="help"]').last().click();
  await page.locator('[data-action="map"]').first().click(); await expect(page.locator('.build-paths article')).toHaveCount(10);
  await expect(page.locator('[data-level="100"]')).toBeDisabled();
  await page.locator('[data-action="map"]').last().click();
  await page.screenshot({ path: info.outputPath('hardware-and-lifelines.png') });
});

test('seeded fixture: all four lifelines animate, use zero moves, and persist exact charges', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  await ready(page); await seed(page, 100, (state) => {
    const board = state.workshop.session!.board; board.hazardKind = 'virus';
    board.cells[0].obstacle = 'heat'; board.cells[1].obstacle = 'heat'; board.cells[2].obstacle = 'cable';
    board.cells[3].obstacle = 'virus'; board.cells[4].obstacle = 'dust';
  });
  const initial = (await saved(page)).workshop;
  await page.locator('[data-booster="cooling"]').click();
  await expect(page.locator('[data-animation-phase="cooling"]')).toBeVisible();
  await settled(page); expect((await saved(page)).workshop.session!.board.virusPauseTurns).toBe(3);
  expect((await saved(page)).workshop.session!.board.cells.some((cell) => cell.obstacle === 'heat')).toBe(false);
  await page.locator('[data-booster="gpu"]').click(); await page.locator('[data-cell="24"]').click();
  await expect(page.locator('[data-booster-effect="gpu"]')).toBeVisible();
  await page.screenshot({ path: info.outputPath('gpu-render.png') }); await settled(page);
  await page.locator('[data-booster="cpu"]').click(); await page.locator('[data-cell="24"]').click();
  await expect(page.locator('[data-booster-effect="cpu"]')).toBeVisible(); await settled(page);
  await page.locator('[data-booster="mouse"]').click();
  const current = (await saved(page)).workshop.session!.board;
  const unlocked = current.cells.flatMap((cell, index) => cell.obstacle !== 'cable' ? [index] : []);
  await page.locator(`[data-cell="${unlocked[0]}"]`).click(); await page.locator(`[data-cell="${unlocked.at(-1)}"]`).click();
  await settled(page);
  const after = (await saved(page)).workshop;
  expect(after.session!.movesLeft).toBe(initial.session!.movesLeft); expect(after.charge).toBe(initial.charge);
  expect(after.boosters).toEqual({ gpu: 1, cpu: 1, mouse: 1, cooling: 1 });
  expect(after.session!.board.virusPauseTurns).toBe(3);
  await page.reload(); await expect(page.locator('body')).toHaveAttribute('data-game-ready', 'true', { timeout: 60000 });
  expect((await saved(page)).workshop).toEqual(after); expect(errors).toEqual([]);
});

test('seeded fixtures: actual four and five matches create specials, then GPU triggers row-column and RGB effects', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' }); await ready(page);
  for (const length of [4, 5]) {
    await seed(page, 1, (state) => {
      const cells = state.workshop.session!.board.cells;
      for (let index = 0; index < length - 1; index++) cells[index].piece = 'cpu';
      cells[length - 1].piece = 'ram'; cells[length + 6].piece = 'cpu';
    });
    await page.locator(`[data-cell="${length - 1}"]`).click(); await page.locator(`[data-cell="${length + 6}"]`).click();
    await settled(page);
    const special = length === 4 ? 'line' : 'rgb';
    const index = (await saved(page)).workshop.session!.board.cells.findIndex((cell) => cell.special === special);
    expect(index).toBeGreaterThanOrEqual(0);
    await expect(page.locator(`[data-cell="${index}"] .tile-special`)).toHaveText(length === 4 ? '✛' : 'RGB');
    await page.locator('[data-booster="gpu"]').click();
    // The effect lasts 320 ms. Observe it in the rendering page even when the test runner is busy.
    await page.evaluate(selector => {
      document.body.removeAttribute('data-observed-effect');
      const observer = new MutationObserver(() => {
        const effect = document.querySelector(selector);
        if (!effect?.getBoundingClientRect().width || !effect.getBoundingClientRect().height) return;
        document.body.dataset.observedEffect = selector;
        observer.disconnect();
      });
      observer.observe(document.body, { subtree: true, childList: true });
    }, length === 4 ? '.power-beam' : '.rgb-burst');
    await page.locator(`[data-cell="${index}"]`).click();
    await expect(page.locator('body')).toHaveAttribute('data-observed-effect', length === 4 ? '.power-beam' : '.rgb-burst');
    await page.screenshot({ path: info.outputPath(`${special}-activation.png`) }); await settled(page);
    expect((await saved(page)).workshop.session!.movesLeft).toBe(19);
  }
});

test('seeded final move: first-clear and charge rewards save once and an interrupted animation cannot spend twice', async ({ page }) => {
  await ready(page); await seed(page, 1, (state) => {
    const session = state.workshop.session!; session.collected = 9; session.movesLeft = 1; state.workshop.charge = 5;
    [0, 1, 9].forEach((index) => { session.board.cells[index].piece = 'power'; }); session.board.cells[2].piece = 'ram';
  });
  await page.locator('[data-cell="2"]').click(); await page.locator('[data-cell="9"]').click(); await settled(page);
  const won = (await saved(page)).workshop; expect(won.session!.status).toBe('won'); expect(won.parts).toHaveLength(1);
  expect(won.boosters.mouse).toBe(4); expect(won.lifelinesEarned).toBe(1);
  await page.reload(); await expect(page.locator('body')).toHaveAttribute('data-game-ready', 'true', { timeout: 60000 });
  expect((await saved(page)).workshop).toEqual(won);
  await page.emulateMedia({ reducedMotion: 'no-preference' }); await seed(page, 100);
  await page.locator('[data-booster="gpu"]').click(); await page.locator('[data-cell="24"]').click();
  await expect(page.locator('.board-resolving')).toBeVisible(); await page.keyboard.press('Escape');
  await open(page); await settled(page);
  expect((await saved(page)).workshop.boosters.gpu).toBe(1);
  expect((await saved(page)).workshop.session!.movesLeft).toBe(getLevel(100).moves);
});
