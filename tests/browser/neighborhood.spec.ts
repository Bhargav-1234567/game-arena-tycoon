import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

const KEY = 'gaming_zone_tycoon_save_v1';
const saved = (page: Page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), KEY);
async function ready(page: Page) {
  await page.goto('/'); await expect(page.locator('body')).toHaveAttribute('data-game-ready', 'true', { timeout: 60000 });
}

test('neighborhood overview, physical workshop entrance, lighting and lounge cutaway', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  await ready(page);
  await expect(page.locator('body')).toHaveAttribute('data-world-view', 'neighborhood');
  await expect(page.locator('.world-hotspot[data-place="workshop"]')).toBeVisible();
  await page.screenshot({ path: info.outputPath('district-evening.png') });
  await page.locator('#district-lighting').selectOption('night'); expect((await saved(page)).neighborhood.lighting).toBe('night');
  await page.screenshot({ path: info.outputPath('district-night.png') });
  await page.locator('#district-lighting').selectOption('day');
  await page.locator('.world-hotspot[data-place="workshop"]').click();
  await expect(page.getByRole('dialog', { name: 'Puzzle Lab' })).toBeVisible();
  await page.getByRole('button', { name: 'Close workshop' }).click();
  await page.locator('button[data-view="lounge"]').click();
  await expect(page.locator('body')).toHaveAttribute('data-camera-moving', 'false');
  await expect(page.getByRole('button', { name: /Build Mode/ })).toBeVisible();
  await page.reload(); await expect(page.locator('body')).toHaveAttribute('data-game-ready', 'true', { timeout: 60000 });
  await expect(page.locator('body')).toHaveAttribute('data-world-view', 'lounge');
  expect(errors).toEqual([]);
});

test('custom storefront, all frontage tiers, cafe partnership and all six building wings persist', async ({ page }, info) => {
  await ready(page); const before = await saved(page);
  await page.locator('.district-toolbar [data-place="expansion"]').click();
  await page.locator('#lounge-name').fill('Darshan Game Arena'); await page.getByRole('button', { name: 'Save lounge name' }).click();
  for (let i = 0; i < 3; i++) await page.locator('[data-world-action="frontage"]').click();
  await expect(page.locator('[data-world-action="frontage"]')).toBeDisabled();
  for (let i = 0; i < 6; i++) {
    await page.locator('[data-world-action="expand"]').click();
    await expect.poll(async () => (await saved(page)).expansionCount).toBe(i + 1);
  }
  await expect(page.locator('[data-world-action="expand"]')).toBeDisabled();
  await page.getByRole('button', { name: 'Close district panel' }).click();
  await page.locator('.world-hotspot[data-place="cafe"]').click();
  await page.locator('[data-world-action="cafe"]').click(); await expect(page.locator('[data-world-action="cafe"]')).toBeDisabled();
  const after = await saved(page);
  expect(after.economy.cash).toBeLessThanOrEqual(before.economy.cash - 500 - 1200 - 2500 - 750 - 10500);
  expect(after.neighborhood.shopName).toBe('Darshan Game Arena'); expect(after.neighborhood.frontageLevel).toBe(3);
  expect(after.neighborhood.cafePartner).toBe(true); expect(after.stations).toEqual(before.stations);
  await page.getByRole('button', { name: 'Close district panel' }).click();
  await page.waitForTimeout(3700); await page.screenshot({ path: info.outputPath('district-flagship.png') });
  await page.reload(); await expect(page.locator('body')).toHaveAttribute('data-game-ready', 'true', { timeout: 60000 });
  expect((await saved(page)).neighborhood).toMatchObject({ shopName: 'Darshan Game Arena', frontageLevel: 3, cafePartner: true });
  expect((await saved(page)).expansionCount).toBe(6);
});

test('bus visitors use the crossing and real paying customers complete a tournament', async ({ page }) => {
  test.setTimeout(210000);
  await ready(page); await page.locator('.world-hotspot[data-place="plaza"]').click();
  await page.getByRole('button', { name: 'Start tournament', exact: true }).click();
  await expect(page.locator('[data-event-status]')).toContainText('0/3');
  await page.getByRole('button', { name: 'Close district panel' }).click();
  await expect.poll(async () => Number(await page.locator('body').getAttribute('data-crossing-customers')), { timeout: 60000 }).toBeGreaterThan(0);
  await expect.poll(async () => (await saved(page)).neighborhood.event.status, { timeout: 150000 }).toBe('won');
  expect((await saved(page)).neighborhood.eventsWon).toBe(1);
  await page.locator('.world-hotspot[data-place="plaza"]').click();
  await expect(page.locator('[data-event-status]')).toContainText('Champion');
});
