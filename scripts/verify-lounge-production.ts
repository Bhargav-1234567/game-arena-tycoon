// Runs against the compiled game without development hooks or shared browser storage.
import { chromium, devices, expect } from '@playwright/test';
import { OrthographicCamera, Vector3 } from 'three';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { checkInFirstGuest } from '../tests/browser/reception-controls.ts';
import { MatchBoard } from '../src/puzzle/MatchBoard.ts';
import { getLevel } from '../src/puzzle/catalog.ts';

const base = process.argv[2] ?? 'http://127.0.0.1:4174/';
const folder = resolve('test-results/production-lounge', new Date().toISOString().replace(/[:.]/g, '-'));
await mkdir(folder, { recursive: true });
const browser = await chromium.launch({ headless: false, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const evidence: Record<string, unknown> = { url: base, browser: browser.version(), started: new Date().toISOString() };
try {
  for (const mobile of [false, true]) {
    const name = mobile ? 'mobile' : 'desktop', viewport = mobile ? { width: 393, height: 851 } : { width: 1440, height: 1000 };
    const context = await browser.newContext({ ...(mobile ? devices['Pixel 7'] : {}), viewport, reducedMotion: 'reduce' });
    const page = await context.newPage(), errors: string[] = [], humanRequests: string[] = [];
    const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('gaming_zone_tycoon_save_v1')!));
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('response', (response) => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
    page.on('request', (request) => { if (/\/characters\/.*\.glb/.test(request.url())) humanRequests.push(request.url()); });
    await page.goto(base);
    await expect(page.locator('body')).toHaveAttribute('data-game-ready', 'true', { timeout: 60000 });
    const initial = await saved(); assert.equal(initial.stations.length, 2); assert.equal(initial.facilities.length, 3);
    await page.screenshot({ path: resolve(folder, `${name}-district.png`) });
    await page.locator('[data-view="lounge"]').click();
    await expect(page.locator('.district-labels')).toBeHidden();
    await expect(page.locator('body')).toHaveAttribute('data-camera-moving', 'false');
    await page.locator('#btn-toggle-build').click();
    await page.locator('.item-card').filter({ hasText: 'Modern Indoor Planter' }).locator('.buy-btn').click();
    const aspect = viewport.width / viewport.height, zoom = mobile ? Math.max(8, 14 / aspect) : 8;
    const camera = new OrthographicCamera(-zoom * aspect / 2, zoom * aspect / 2, zoom / 2, -zoom / 2, .1, 1000);
    camera.position.set(40 / Math.sqrt(3), 40 / Math.sqrt(3), 40 / Math.sqrt(3));
    camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
    const target = new Vector3(-2.8, 0, 1.2).project(camera);
    const x = (target.x + 1) * viewport.width / 2, y = (1 - target.y) * viewport.height / 2;
    await page.mouse.move(x, y, { steps: 4 });
    await expect(page.locator('#placement-status')).toContainText(/reserved|chair/);
    await page.mouse.click(x, y);
    await page.screenshot({ path: resolve(folder, `${name}-chair-placement-rejected.png`) });
    await page.locator('#btn-cancel-build').click();
    await checkInFirstGuest(page);
    await expect(page.getByRole('progressbar', { name: 'Gaming', exact: true }).first()).toBeVisible({ timeout: 60000 });
    await page.screenshot({ path: resolve(folder, `${name}-manual-pc-session.png`) });
    await expect.poll(async () => (await saved()).shift.pc, { timeout: 120000 }).toBeGreaterThan(0);
    await page.getByRole('button', { name: /Puzzle Lab/ }).click();
    await page.getByRole('button', { name: /Start Puzzle 1/ }).click();
    const before = (await saved()).workshop.session;
    const board = new MatchBoard(getLevel(before.level), 1, before.board), [a, b] = board.legalMoves()[0];
    await page.locator(`[data-cell="${a}"]`).click(); await page.locator(`[data-cell="${b}"]`).click();
    await expect.poll(async () => (await saved()).workshop.session.movesLeft).toBe(before.movesLeft - 1);
    await expect(page.locator('.board-resolving')).toHaveCount(0);
    await page.screenshot({ path: resolve(folder, `${name}-puzzle-played.png`) });
    await page.getByRole('button', { name: 'Close workshop' }).click();
    await page.getByRole('button', { name: /Management/ }).click();
    await page.locator('.hire-btn[data-role="technician"]').click();
    page.once('dialog', (dialog) => dialog.accept()); await page.locator('#save-game-btn').click();
    const final = await saved(); assert.equal(final.staff.find((role: any) => role.id === 'technician').hiredCount, 1);
    assert.deepEqual(final.stations.map((station: any) => station.id), initial.stations.map((station: any) => station.id));
    await page.reload(); await expect(page.locator('body')).toHaveAttribute('data-game-ready', 'true', { timeout: 60000 });
    const restored = await saved();
    assert.equal(restored.staff.find((role: any) => role.id === 'technician').hiredCount, 1);
    const hired = final.workforce.employees.find((employee: any) => employee.role === 'technician');
    assert.ok(hired.name && hired.id);
    assert.ok(restored.workforce.employees.some((employee: any) => employee.id === hired.id && employee.seed === hired.seed));
    assert.ok(humanRequests.length >= 6);
    assert.ok(humanRequests.every((url) => url.includes('/characters/original/') && url.endsWith('_game.glb')));
    await page.goto(new URL('custom-characters.html', base).href);
    await expect(page.locator('body')).toHaveAttribute('data-character-ready', 'aarav', { timeout: 60000 });
    for (const id of ['aarav', 'kabir', 'rohan', 'meera', 'anaya', 'isha']) {
      await page.locator('#character').selectOption(id);
      await expect(page.locator('body')).toHaveAttribute('data-character-ready', id);
    }
    await page.screenshot({ path: resolve(folder, `${name}-original-fullbody.png`) });
    await page.locator('#portrait').click();
    await page.screenshot({ path: resolve(folder, `${name}-original-face.png`) });
    await page.locator('#portrait').click();
    await page.locator('#pose').selectOption('Gaming');
    await page.locator('#chair').selectOption('4');
    await expect(page.locator('body')).toHaveAttribute('data-chair-ready', '4');
    await page.locator('#side').click();
    await page.screenshot({ path: resolve(folder, `${name}-original-seated.png`) });
    const initialLook = await page.evaluate(() => JSON.stringify((window as any).characterStudio.model.userData.appearance));
    await page.locator('#random-look').click();
    assert.notEqual(await page.evaluate(() => JSON.stringify((window as any).characterStudio.model.userData.appearance)), initialLook);
    await page.locator('#wardrobe summary').click();
    for (const [slot, option] of [['hair', 'braid'], ['top', 'wrap_blouse'], ['bottoms', 'a_line_skirt'], ['shoes', 'boots'], ['glasses', 'square'], ['headwear', 'beanie'], ['neckwear', 'knit_scarf']]) {
      await page.locator(`[data-appearance="${slot}"]`).selectOption(option);
    }
    await page.locator('[data-appearance="shirtColor"]').fill('#5a7a9c');
    await page.locator('#wardrobe summary').click();
    await page.screenshot({ path: resolve(folder, `${name}-original-mixed-wardrobe.png`) });
    assert.ok(humanRequests.every((url) => url.includes('/characters/original/')));
    evidence[name] = { viewport, initialPcs: initial.stations.length, initialFacilities: initial.facilities.length,
      chairPlacementRejected: true, legalPuzzleMovePlayed: true, hiredTechnicianRestored: true,
      originalRuntimeHumansOnly: true, originalStudioPeople: 6, modularWardrobeAndRandomizer: true, humanRequests, errors };
    assert.deepEqual(errors, []);
    await context.close();
  }
  evidence.completed = new Date().toISOString();
  await writeFile(resolve(folder, 'results.json'), JSON.stringify(evidence, null, 2));
  console.log(`Production smoke passed. Evidence: ${folder}`);
} finally { await browser.close(); }
