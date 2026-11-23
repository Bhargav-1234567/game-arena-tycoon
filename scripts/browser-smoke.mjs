import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

await mkdir('test-results/manual', { recursive: true });
const browser = await chromium.launch({ headless: false, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => { if (message.type() === 'error') errors.push(`${message.text()} ${message.location().url}`); });
page.on('response', (response) => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
await page.goto(process.argv[2] ?? 'http://127.0.0.1:4173');
await page.waitForSelector('body[data-game-ready="true"]', { timeout: 60000 });
await page.screenshot({ path: 'test-results/manual/neighborhood.png' });
await page.locator('button[data-view="lounge"]').click();
await page.waitForSelector('body[data-camera-moving="false"]');
console.log(await page.evaluate(() => {
  const save = JSON.parse(localStorage.getItem('gaming_zone_tycoon_save_v1'));
  return { stations: save.stations.length, receptions: save.receptions.length, facilities: save.facilities.length, cash: save.economy.cash, diamonds: save.workshop.diamonds };
}));
await page.screenshot({ path: 'test-results/manual/lounge.png' });
await page.getByRole('button', { name: 'Puzzle Lab' }).click();
await page.getByRole('button', { name: 'Start Puzzle 1' }).click();
await page.screenshot({ path: 'test-results/manual/puzzle-desktop.png' });
console.log('Errors:', errors);
await browser.close();
if (errors.length) throw new Error('The browser smoke test reported errors.');
