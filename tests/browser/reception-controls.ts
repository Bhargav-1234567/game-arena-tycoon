import { expect, type Page } from '@playwright/test';

// Use native touch input on the same control a phone player uses.
export async function holdDirection(page: Page, right: boolean, strength = 1) {
  if (!await page.locator('.reception-stick').isVisible()) {
    const key = right ? 'ArrowRight' : 'ArrowLeft';
    await page.keyboard.down(key);
    return () => page.keyboard.up(key);
  }
  const rect = (await page.locator('.reception-stick').boundingBox())!;
  const client = await page.context().newCDPSession(page);
  const x = rect.x + rect.width/2, y = rect.y + rect.height/2;
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x+(right ? 25 : -25)*strength, y }] });
  return async () => {
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await client.detach();
  };
}

export async function enterCounter(page: Page) {
  const onMarker = () => document.querySelector('.reception-hint')?.textContent === 'Isha · At reception' ||
    !!document.querySelector('.pc-choices button');
  for (const right of [false, true, false]) {
    const release = await holdDirection(page, right, .45);
    try { await page.waitForFunction(onMarker, undefined, { polling: 'raf', timeout: 15000 }); }
    finally { await release(); }
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    if (await page.evaluate(onMarker)) return;
  }
  await expect(page.locator('.reception-hint')).toHaveText('Isha · At reception');
}

export async function checkInFirstGuest(page: Page) {
  await enterCounter(page);
  await page.locator('.pc-choices button').first().click({ timeout: 60000 });
}
