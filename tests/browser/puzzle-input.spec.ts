import { test, expect } from '@playwright/test';
import { MatchBoard } from '../../src/puzzle/MatchBoard.ts';
import { getLevel } from '../../src/puzzle/catalog.ts';
import type { GameSaveState } from '../../src/services/SaveManager.ts';

const KEY = 'gaming_zone_tycoon_save_v1';

test('paused puzzle stops redundant 3D draws, redraws on resize, and resumes on close', async ({ page }) => {
  await page.addInitScript(() => {
    const stats = { draws: 0 };
    (window as unknown as { renderProbe: typeof stats }).renderProbe = stats;
    for (const constructor of [WebGLRenderingContext, WebGL2RenderingContext]) {
      const prototype = constructor.prototype as unknown as Record<string, (...args: unknown[]) => unknown>;
      for (const name of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
        const original = prototype[name];
        if (typeof original === 'function') prototype[name] = function (...args) { stats.draws++; return Reflect.apply(original, this, args); };
      }
    }
  });
  const draws = () => page.evaluate(() => (window as unknown as { renderProbe: { draws: number } }).renderProbe.draws);
  await page.goto('/'); await expect(page.locator('body')).toHaveAttribute('data-game-ready', 'true', { timeout: 60000 });
  await page.locator('[data-open="puzzle"]').click(); await page.locator('[data-action="start"]').click();
  await page.waitForTimeout(200);
  const paused = await draws(); await page.waitForTimeout(400); expect(await draws()).toBe(paused);
  const viewport = page.viewportSize()!; await page.setViewportSize({ ...viewport, width: viewport.width + 8 });
  await expect.poll(draws).toBeGreaterThan(paused); await page.waitForTimeout(200);
  const resized = await draws(); await page.waitForTimeout(300); expect(await draws()).toBe(resized);
  await page.locator('[data-action="close"]').click(); await expect.poll(draws).toBeGreaterThan(resized);
});

test('legacy creator board retains virus guidance and supports keyboard lifeline targeting and cancellation', async ({ page }) => {
  await page.goto('/'); await expect(page.locator('body')).toHaveAttribute('data-game-ready', 'true', { timeout: 60000 });
  const fixture: GameSaveState = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), KEY);
  const board = new MatchBoard(getLevel(12), 123).snapshot(); delete board.hazardKind;
  board.cells.forEach((cell) => { cell.obstacle = 'none'; }); board.cells[48].obstacle = 'virus';
  delete fixture.workshop.lifelinesEarned;
  fixture.workshop.highestUnlocked = 12;
  fixture.workshop.session = { id: 'legacy-creator-fixture', level: 12, rewardPartId: 'cpu_t1', changeCount: 0,
    board, movesLeft: 24, collected: 0, score: 0, status: 'playing' };
  await page.goto('about:blank');
  await page.addInitScript(({ fixture, key }) => {
    if (location.hostname === '127.0.0.1' && !sessionStorage.getItem('legacy-fixture')) {
      localStorage.setItem(key, JSON.stringify(fixture)); sessionStorage.setItem('legacy-fixture', 'used');
    }
  }, { fixture, key: KEY });
  await page.goto('/'); await expect(page.locator('body')).toHaveAttribute('data-game-ready', 'true', { timeout: 60000 });
  await page.locator('[data-open="puzzle"]').click(); await expect(page.locator('.hazard-info')).toContainText('virus');
  await page.locator('[data-booster="gpu"]').focus(); await page.keyboard.press('Enter');
  await expect(page.locator('[data-cell="24"]')).toBeFocused(); await page.keyboard.press('Escape');
  await expect(page.locator('.lifeline-selected-banner')).toHaveCount(0);
  await page.locator('[data-booster="cpu"]').focus(); await page.keyboard.press('Enter');
  await expect(page.locator('[data-cell="24"]')).toBeFocused(); await page.keyboard.press('ArrowRight');
  await expect(page.locator('[data-cell="25"]')).toBeFocused(); await page.keyboard.press('Enter');
  await expect(page.locator('.board-resolving')).toHaveCount(0);
  const state = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).workshop, KEY);
  expect(state.boosters.gpu).toBe(2); expect(state.boosters.cpu).toBe(1);
  expect(state.session.movesLeft).toBe(24); expect(state.session.board.hazardKind).toBe('virus');
});
