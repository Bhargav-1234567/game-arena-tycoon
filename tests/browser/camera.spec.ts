import { test, expect } from '@playwright/test';

test('district camera pans and zooms with native mouse or touch input', async ({ page, context }, info) => {
  await page.goto('/');
  await expect(page.locator('body')).toHaveAttribute('data-game-ready', 'true', { timeout: 60000 });
  const location = page.locator('.world-hotspot[data-place="workshop"]');
  const position = async () => {
    const box = (await location.boundingBox())!;
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };
  const distance = async () => {
    const a = await position(), b = (await page.locator('.world-hotspot[data-place="plaza"]').boundingBox())!;
    return Math.hypot(a.x - b.x - b.width / 2, a.y - b.y - b.height / 2);
  };
  const point = await page.evaluate(() => {
    for (let y = 280; y < 550; y += 35) for (let x = 100; x < window.innerWidth - 100; x += 40) {
      if ([-70, 0, 70].every((dx) => document.elementFromPoint(x + dx, y)?.tagName === 'CANVAS')) return { x, y };
    }
    throw new Error('No unobstructed canvas area found for camera input.');
  });
  const before = await position();
  if (info.project.name === 'mobile') {
    const cdp = await context.newCDPSession(page);
    const touch = (x: number, y: number, id: number) => ({ x, y, id, radiusX: 3, radiusY: 3 });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touch(point.x, point.y, 1)] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [touch(point.x + 40, point.y + 20, 1)] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(async () => Math.abs((await position()).x - before.x)).toBeGreaterThan(10);
    const span = await distance();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touch(point.x - 30, point.y, 1), touch(point.x + 30, point.y, 2)] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [touch(point.x - 65, point.y, 1), touch(point.x + 65, point.y, 2)] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(distance).toBeGreaterThan(span * 1.5);
  } else {
    await page.mouse.move(point.x, point.y); await page.mouse.down({ button: 'right' });
    await page.mouse.move(point.x + 60, point.y + 20, { steps: 8 }); await page.mouse.up({ button: 'right' });
    await expect.poll(async () => Math.abs((await position()).x - before.x)).toBeGreaterThan(10);
    const span = await distance(); await page.mouse.wheel(0, -100);
    await expect.poll(distance).toBeGreaterThan(span * 1.1);
  }
  await page.locator('button[data-view="neighborhood"]').click();
  await expect(page.locator('body')).toHaveAttribute('data-camera-moving', 'false');
  await expect.poll(async () => Math.abs((await position()).x - before.x)).toBeLessThan(2);
});
