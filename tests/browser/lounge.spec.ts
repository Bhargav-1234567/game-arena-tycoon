import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

const KEY = 'gaming_zone_tycoon_save_v1';
const saved = (page: Page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), KEY);

async function ready(page: Page) {
  await page.route(/\/src\/main\.ts(?:\?.*)?$/, async (route) => {
    const response = await route.fetch();
    const body = (await response.text()).replace('const game = new Game(canvas, uiContainer);',
      'const game = new Game(canvas, uiContainer); window.__loungeGame = game;');
    await route.fulfill({ response, body });
  });
  await page.goto('/');
  await expect(page.locator('body')).toHaveAttribute('data-game-ready', 'true', { timeout: 60000 });
  await page.locator('[data-view="lounge"]').click();
  await page.waitForFunction(() => !(window as any).__loungeGame.cameraController.isTransitioning);
  if (page.viewportSize()!.width < 750) {
    for (let i = 0; i < 6; i++) await page.locator('[data-zoom="1.25"]').click();
    await page.waitForFunction(() => !(window as any).__loungeGame.cameraController.isTransitioning);
  }
}

async function point(page: Page, x: number, z: number, y = 0) {
  return page.evaluate(({ x, y, z }) => {
    const camera = (window as any).__loungeGame.cameraController.camera;
    const projected = camera.position.clone().set(x, y, z).project(camera);
    return { x: (projected.x + 1) * innerWidth / 2, y: (1 - projected.y) * innerHeight / 2 };
  }, { x, y, z });
}

async function hover(page: Page, x: number, z: number) {
  const position = await point(page, x + .2, z + .2);
  await page.mouse.move(position.x, position.y, { steps: 3 });
  await expect.poll(() => page.evaluate(() => (window as any).__loungeGame.placementSystem.currentGridPos)).toEqual({ x, z });
  return position;
}

async function choose(page: Page, name: string) {
  await page.locator('#btn-toggle-build').click();
  await page.locator('.item-card').filter({ hasText: name }).locator('.buy-btn').click();
}

async function inspectPc(page: Page, id?: string) {
  const location = await page.evaluate((id) => {
    const stations = [...(window as any).__loungeGame.placementSystem.stations.values()] as any[];
    const station = stations.find((entry) => entry.id === id) ?? stations[0];
    return { x: station.group.position.x + .46, z: station.group.position.z, id: station.id };
  }, id);
  const position = await point(page, location.x, location.z, 1.05);
  await page.mouse.click(position.x, position.y);
  await expect(page.locator('.hardware-slots')).toBeVisible();
  return location.id;
}

test.beforeEach(async ({ page }) => {
  (page as any).loungeErrors = [];
  page.on('pageerror', (error) => (page as any).loungeErrors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') (page as any).loungeErrors.push(message.text()); });
  page.on('response', (response) => { if (response.status() >= 400) (page as any).loungeErrors.push(`${response.status()} ${response.url()}`); });
});
test.afterEach(async ({ page }) => { expect((page as any).loungeErrors).toEqual([]); });

test('UI rejects chair, entrance and off-floor PC placements without charging', async ({ page }, info) => {
  await ready(page);
  if (info.project.name === 'desktop') {
    await page.locator('[data-zoom="1.25"]').click(); await page.locator('[data-zoom="1.25"]').click();
    await page.waitForFunction(() => !(window as any).__loungeGame.cameraController.isTransitioning);
  }
  for (const [x, z, reason] of [[-3, 1, /reserved|chair/], [-1, 7, /entrance/], [0, 7, /entrance/]] as const) {
    await choose(page, 'Modern Indoor Planter');
    const position = await hover(page, x, z);
    await expect(page.locator('#placement-status')).toContainText(reason);
    const before = await page.evaluate(() => (window as any).__loungeGame.placementSystem.decorObjects.length);
    await page.mouse.click(position.x, position.y);
    expect(await page.evaluate(() => (window as any).__loungeGame.placementSystem.decorObjects.length)).toBe(before);
    await page.screenshot({ path: info.outputPath(`rejected-${x}-${z}.png`) });
    await page.locator('#btn-cancel-build').click();
  }
  await choose(page, 'Gaming BattleStation');
  await page.locator('#btn-rotate-build').click(); await page.locator('#btn-rotate-build').click();
  const outside = await hover(page, -1, -2);
  await expect(page.locator('#placement-status')).toContainText('inside');
  await page.mouse.click(outside.x, outside.y);
  expect(await page.evaluate(() => (window as any).__loungeGame.placementSystem.stations.size)).toBe(2);
  await page.locator('#btn-cancel-build').click();
});

test('UI moves and cancels an idle PC while preserving ownership and valid access', async ({ page }, info) => {
  await ready(page); const before = await saved(page), id = await inspectPc(page);
  await page.locator('#move-item-btn').click();
  expect(await page.evaluate((id) => {
    const game = (window as any).__loungeGame, station = game.placementSystem.stations.get(id);
    return { hidden: !station.group.visible, available: game.placementSystem.getAvailableStation()?.id === id,
      collider: game.customerSystem.collisionSystem.getObstacles().some((entry: any) => entry.id.startsWith(id)) };
  }, id)).toEqual({ hidden: true, available: false, collider: false });
  await page.locator('#btn-cancel-build').click();
  await inspectPc(page, id); await page.locator('#move-item-btn').click();
  await page.locator('#btn-rotate-build').click();
  const target = await hover(page, -4, -2);
  await expect(page.locator('#placement-status')).toBeHidden();
  await page.mouse.click(target.x, target.y);
  await expect(page.locator('#btn-toggle-build')).toBeVisible();
  expect(await page.evaluate((id) => {
    const station = (window as any).__loungeGame.placementSystem.stations.get(id);
    return { x: station.gridX, z: station.gridZ, rotation: station.rotationIndex, issue: station.accessIssue, visible: station.group.visible };
  }, id)).toEqual({ x: -4, z: -2, rotation: 1, issue: '', visible: true });
  await page.screenshot({ path: info.outputPath('rotated-idle-pc.png') });
  await page.getByRole('button', { name: /Management/ }).click();
  page.once('dialog', (dialog) => dialog.accept()); await page.locator('#save-game-btn').click();
  const moved = await saved(page); expect(moved.stations[0].id).toBe(before.stations[0].id);
  await page.reload(); await expect(page.locator('body')).toHaveAttribute('data-game-ready', 'true', { timeout: 60000 });
  expect((await saved(page)).stations).toEqual(moved.stations);
});

test('real customers walk, sit, pay once, leave and release PCs; occupied move is blocked', async ({ page }, info) => {
  test.setTimeout(150000);
  await ready(page);
  await page.waitForFunction(() => [...(window as any).__loungeGame.customerSystem.customers.values()].some((customer: any) => customer.state === 'GAMING'), undefined, { timeout: 60000 });
  const seated = await page.evaluate(() => {
    const game = (window as any).__loungeGame;
    const customer = [...game.customerSystem.customers.values()].find((entry: any) => entry.state === 'GAMING') as any;
    const payments: number[] = []; (window as any).__sessionPayments = payments;
    const original = customer.onPayment; customer.onPayment = (amount: number, position: any) => { payments.push(amount); original?.(amount, position); };
    return { customer: customer.id, pc: customer.assignedStation.id, rate: customer.assignedStation.getHourlyRevenue(), duration: customer.gamingDuration,
      distance: customer.group.position.distanceTo(customer.assignedStation.getSeatingWorldPosition()) };
  });
  expect(seated.distance).toBeLessThan(.01);
  await inspectPc(page, seated.pc); await expect(page.locator('#move-item-btn')).toBeDisabled();
  await expect(page.locator('#upgrade-chair-btn')).toBeDisabled(); await expect(page.locator('#upgrade-desk-btn')).toBeDisabled();
  await page.keyboard.press('m');
  expect(await page.evaluate(() => (window as any).__loungeGame.placementSystem.isMovingItem)).toBe(false);
  await page.screenshot({ path: info.outputPath('seated-and-protected.png') });
  await page.locator('#close-inspector-btn').click();
  await page.waitForFunction((id) => !(window as any).__loungeGame.customerSystem.customers.has(id), seated.customer, { timeout: 75000 });
  expect(await page.evaluate(() => (window as any).__sessionPayments)).toEqual([Math.round(seated.rate * seated.duration / 15)]);
  expect(await page.evaluate(({ pc, customer }) => (window as any).__loungeGame.placementSystem.stations.get(pc).currentGamerId === customer, seated)).toBe(false);
  await page.screenshot({ path: info.outputPath('session-finished.png') });
});

test('controlled slow-load fixture: all upgrade buttons commit once and failed loading keeps cash and models', async ({ page }, info) => {
  await ready(page);
  // Explicit component fixture: remove active visitors and delay model preparation, leaving real UI handlers unchanged.
  await page.evaluate(async () => {
    const game = (window as any).__loungeGame;
    for (const customer of game.customerSystem.customers.values()) { customer.releaseStation(); game.sceneManager.scene.remove(customer.group); }
    game.customerSystem.customers.clear(); game.customerSystem.deskQueues.clear();
    game.customerSystem.spawnInterval = Infinity; game.customerSystem.getSpawnInterval = () => Infinity;
    const path = performance.getEntriesByType('resource').find((entry) => new URL(entry.name).pathname === '/src/services/AssetManager.ts')!.name;
    const { AssetManager } = await import(/* @vite-ignore */ path);
    const manager = AssetManager.getInstance(), original = manager.loadRequiredModel.bind(manager);
    manager.loadRequiredModel = async (url: string) => {
      await new Promise((resolve) => { (window as any).__finishModelLoad = resolve; });
      if ((window as any).__failUpgrade) { (window as any).__failUpgrade = false; throw new Error('Controlled model-loading failure. Cash kept.'); }
      return original(url);
    };
    const spend = game.economySystem.spend.bind(game.economySystem); (window as any).__upgradeCharges = [];
    game.economySystem.spend = (amount: number) => { (window as any).__upgradeCharges.push(amount); return spend(amount); };
  });
  const id = await inspectPc(page);
  for (const [button, field] of [['pc', 'PC'], ['monitor', 'Monitor'], ['chair', 'Chair'], ['desk', 'Desk'], ['kb', 'Keyboard'], ['mouse', 'Mouse'], ['speaker', 'Speaker']]) {
    await page.evaluate(() => { (window as any).__upgradeCharges = []; });
    await page.locator(`#upgrade-${button}-btn`).dblclick();
    expect(await page.evaluate((id) => (window as any).__loungeGame.placementSystem.stations.get(id).currentPC.level, id)).toBe(button === 'pc' ? 1 : 2);
    await page.evaluate(() => (window as any).__finishModelLoad());
    await expect.poll(() => page.evaluate(({ id, field }) => (window as any).__loungeGame.placementSystem.stations.get(id)[`current${field}`].level, { id, field })).toBe(2);
    expect((await page.evaluate(() => (window as any).__upgradeCharges)).filter((amount: number) => amount !== 15)).toHaveLength(1);
  }
  await page.evaluate(() => { (window as any).__failUpgrade = true; (window as any).__upgradeCharges = []; });
  await page.locator('#upgrade-pc-btn').click();
  await page.evaluate(() => (window as any).__finishModelLoad());
  await expect(page.locator('.upgrade-error')).toContainText('Cash kept');
  expect(await page.evaluate((id) => (window as any).__loungeGame.placementSystem.stations.get(id).currentPC.level, id)).toBe(2);
  expect((await page.evaluate(() => (window as any).__upgradeCharges)).filter((amount: number) => amount !== 15)).toHaveLength(0);
  await page.screenshot({ path: info.outputPath('failed-upgrade-kept-model.png') });
  await page.locator('#close-inspector-btn').click();
  // Reception/facility component selection is explicit; their upgrade buttons still receive real double clicks.
  for (const category of ['reception', 'facility']) {
    await page.evaluate((category) => {
      const game = (window as any).__loungeGame;
      const entity = [...(category === 'reception' ? game.placementSystem.receptionDesks : game.placementSystem.facilities).values()][0];
      game.stationInspector[category === 'reception' ? 'inspectReception' : 'inspectFacility'](entity);
      (window as any).__upgradeCharges = [];
    }, category);
    await page.locator(`#upgrade-${category}-btn`).dblclick();
    await page.evaluate(() => (window as any).__finishModelLoad());
    await expect.poll(() => page.evaluate((category) => {
      const game = (window as any).__loungeGame;
      return ([...(category === 'reception' ? game.placementSystem.receptionDesks : game.placementSystem.facilities).values()][0] as any).currentTier.level;
    }, category)).toBe(2);
    expect((await page.evaluate(() => (window as any).__upgradeCharges)).filter((amount: number) => amount !== 15)).toHaveLength(1);
    await page.locator('#close-inspector-btn').click();
  }
});

test('legacy blocked chair save is preserved, skipped by assignment and repairable by moving its planter', async ({ page }, info) => {
  await ready(page); const fixture = await saved(page), originalIds = fixture.stations.map((station: any) => station.id);
  fixture.objects.push({ id: 'legacy_blocking_plant', itemId: 'plant_indoor', gridX: -3, gridZ: 1, rotationIndex: 0 });
  await page.addInitScript(({ key, raw }) => {
    if (!sessionStorage.getItem('legacy-layout-fixture')) { localStorage.setItem(key, raw); sessionStorage.setItem('legacy-layout-fixture', 'true'); }
  }, { key: KEY, raw: JSON.stringify(fixture) });
  await page.reload(); await expect(page.locator('body')).toHaveAttribute('data-game-ready', 'true', { timeout: 60000 });
  await page.waitForFunction(() => !(window as any).__loungeGame.cameraController.isTransitioning);
  if (info.project.name === 'mobile') {
    for (let i = 0; i < 6; i++) await page.locator('[data-zoom="1.25"]').click();
    await page.waitForFunction(() => !(window as any).__loungeGame.cameraController.isTransitioning);
  }
  expect((await saved(page)).stations.map((station: any) => station.id)).toEqual(originalIds);
  await expect(page.locator('#placement-status')).toContainText('blocked chair access');
  expect(await page.evaluate(() => [...(window as any).__loungeGame.placementSystem.stations.values()][0].accessIssue)).toBeTruthy();
  expect(await page.evaluate(() => {
    const placement = (window as any).__loungeGame.placementSystem;
    return placement.getAvailableStation()?.id === [...placement.stations.values()][0].id;
  })).toBe(false);
  const plant = await page.evaluate(async () => {
    const game = (window as any).__loungeGame, object = game.placementSystem.decorObjects.find((entry: any) => entry.userData.persistentId === 'legacy_blocking_plant');
    const path = performance.getEntriesByType('resource').find((entry) => new URL(entry.name).pathname.endsWith('/three.js'))!.name;
    const { Box3, Vector3 } = await import(/* @vite-ignore */ path);
    const box = new Box3().setFromObject(object);
    for (const height of [.8, .5, .2]) for (const width of [.5, .25, .75]) for (const depth of [.5, .25, .75]) {
      const vector = new Vector3(box.min.x + (box.max.x - box.min.x) * width, box.min.y + (box.max.y - box.min.y) * height,
        box.min.z + (box.max.z - box.min.z) * depth).project(game.cameraController.camera);
      game.mousePos.set(vector.x, vector.y); game.raycaster.setFromCamera(game.mousePos, game.cameraController.camera);
      const hit = game.raycaster.intersectObjects(game.placementSystem.getPickTargets(), true)[0];
      let ancestor = hit?.object;
      while (ancestor) { if (ancestor === object) return { x: (vector.x + 1) * innerWidth / 2, y: (1 - vector.y) * innerHeight / 2 }; ancestor = ancestor.parent; }
    }
    throw new Error('The saved planter has no visible pick target');
  });
  await page.mouse.click(plant.x, plant.y);
  await expect(page.locator('.station-inspector')).toContainText('Modern Indoor Planter');
  await page.locator('#move-item-btn').click();
  const destination = await hover(page, -5, -1);
  await expect(page.locator('#placement-status')).toBeHidden(); await page.mouse.click(destination.x, destination.y);
  await expect.poll(() => page.evaluate(() => [...(window as any).__loungeGame.placementSystem.stations.values()][0].accessIssue)).toBe('');
  expect(await page.evaluate(() => (window as any).__loungeGame.gridSystem.getCell(-3, 1).occupied)).toBe(true); // PC still owns its chair space.
  await page.screenshot({ path: info.outputPath('legacy-layout-repaired.png') });
});

test('all six expansions support edge building, reception relocation retargets queues, and staff perks work', async ({ page }, info) => {
  await ready(page);
  for (let stage = 1; stage <= 6; stage++) {
    await page.locator('#btn-expand-room').click();
    await expect.poll(() => page.evaluate(() => (window as any).__loungeGame.expansionSystem.currentStage)).toBe(stage);
  }
  await expect(page.locator('body')).toHaveAttribute('data-camera-moving', 'false');
  expect(await page.evaluate(() => {
    const grid = (window as any).__loungeGame.gridSystem; let missing = 0;
    for (let x = -10; x < 14; x++) for (let z = -14; z < 8; z++) if (!grid.getCell(x, z)?.isUnlocked) missing++;
    return missing;
  })).toBe(0);
  await choose(page, 'Modern Indoor Planter'); const edge = await hover(page, 13, -13);
  await expect(page.locator('#placement-status')).toBeHidden(); await page.mouse.click(edge.x, edge.y);
  await page.locator('#btn-cancel-build').click();
  expect(await page.evaluate(() => (window as any).__loungeGame.placementSystem.decorObjects.some((object: any) => object.userData.gridX === 13 && object.userData.gridZ === -13))).toBe(true);
  await page.waitForFunction(() => [...(window as any).__loungeGame.customerSystem.deskQueues.values()].some((queue: any) => queue.length), undefined, { timeout: 30000 });
  const desk = await point(page, 0, 3.5, .9); await page.mouse.click(desk.x, desk.y);
  await expect(page.locator('#upgrade-reception-btn')).toBeVisible();
  const staffBefore = await page.evaluate(() => [...(window as any).__loungeGame.customerSystem.receptionists.values()][0].group.uuid);
  await page.locator('#move-item-btn').click(); const moved = await hover(page, -2, -5);
  await expect(page.locator('#placement-status')).toBeHidden(); await page.mouse.click(moved.x, moved.y);
  await expect.poll(() => page.evaluate(() => {
    const game = (window as any).__loungeGame, desk = [...game.placementSystem.receptionDesks.values()][0] as any;
    return (game.customerSystem.deskQueues.get(desk.id) ?? []).every((customer: any, index: number) => customer.targetPosition.distanceTo(desk.getCustomerQueuePosition(index)) < .001);
  })).toBe(true);
  expect(await page.evaluate(() => [...(window as any).__loungeGame.customerSystem.receptionists.values()][0].group.uuid)).toBe(staffBefore);
  await page.getByRole('button', { name: /Management/ }).click();
  const base = await page.evaluate(() => [...(window as any).__loungeGame.placementSystem.stations.values()][0].getSatisfactionScore());
  await page.locator('.hire-btn[data-role="technician"]').click();
  expect(await page.evaluate(() => [...(window as any).__loungeGame.placementSystem.stations.values()][0].getSatisfactionScore())).toBe(Math.round(base * 1.25));
  await page.locator('.hire-btn[data-role="receptionist"]').click();
  expect(await page.evaluate(() => { const game = (window as any).__loungeGame; return game.customerSystem.getCheckInSeconds([...game.placementSystem.receptionDesks.values()][0]); })).toBe(2 / 1.35);
  await page.locator('#close-stats-btn').click();
  await page.screenshot({ path: info.outputPath('expanded-floor-and-relocated-queue.png') });
});

test('browser component fixtures verify failed paths, recovery, rotated wall collision and measured check-in speeds', async ({ page }, info) => {
  await ready(page);
  const results = await page.evaluate(async () => {
    const load = (path: string) => {
      const actual = performance.getEntriesByType('resource').find((entry) => new URL(entry.name).pathname === path)?.name ?? path;
      return import(/* @vite-ignore */ actual);
    };
    const [{ Scene, Vector3, Group }, { GridSystem }, { PlacementSystem }, { EconomySystem }, { Customer }, { CustomerSystem }, { RECEPTION_TIERS }, { BUILDABLE_ITEMS }] = await Promise.all([
      load('/node_modules/.vite/deps/three.js'), load('/src/systems/GridSystem.ts'), load('/src/systems/PlacementSystem.ts'), load('/src/systems/EconomySystem.ts'),
      load('/src/entities/Customer.ts'), load('/src/systems/CustomerSystem.ts'), load('/src/entities/ReceptionDesk.ts'), load('/src/data/assets.ts')
    ]);
    const scene = new Scene(), grid = new GridSystem(), economy = new EconomySystem();
    grid.setZoneUnlocked(-6, 5, -2, 7);
    const placement = new PlacementSystem(scene, grid, economy), collision = placement.collisionSystem;
    const place = async (id: string, x: number, z: number) => {
      await placement.setBuildItem(BUILDABLE_ITEMS.find((item: any) => item.id === id));
      placement.updateHover(new Vector3(x + .2, 0, z + .2)); const result = await placement.tryPlace();
      await placement.setBuildItem(undefined); return result;
    };
    const wallItem = BUILDABLE_ITEMS.find((item: any) => item.id.startsWith('wall_') && item.height > 1);
    if (!await place(wallItem.id, -4, -1)) throw new Error('Wall fixture failed to place');
    const wall = placement.buildingObjects[0], oldShape = collision.getObstacles()[0];
    await placement.startMoveObject(wall); placement.rotate(); placement.updateHover(new Vector3(-1.8, 0, -.8));
    const wallMoved = await placement.tryPlace(), rotatedShape = collision.getObstacles()[0];
    scene.remove(wall); placement.buildingObjects.length = 0; grid.releaseOwner(wall.userData.persistentId);
    const barrier = new Group(); barrier.position.set(0, 0, 3); barrier.userData = { halfW: 6, halfD: .5 };
    placement.buildingObjects.push(barrier);
    const noRoute = grid.findPath(new Vector3(0, 0, 0), new Vector3(0, 0, 5), collision.createNavigationQuery());
    const blockedTarget = grid.findPath(new Vector3(0, 0, 0), new Vector3(0, 0, 3), collision.createNavigationQuery());
    placement.buildingObjects.length = 0;
    if (!await place('station_bundle', -4, 0) || !await place('reception_counter', -2, 2)) throw new Error('Service fixtures failed to place');
    const station = [...placement.stations.values()][0], desk = [...placement.receptionDesks.values()][0];
    const start = new Vector3(-5, 0, 1.5), end = new Vector3(-1.5, 0, 1.5), query = collision.createNavigationQuery();
    const route = grid.findPath(start, end, query); let previous = start, unsafeSegments = 0;
    for (const point of route) { if (query(previous, point)) unsafeSegments++; previous = point; }
    const unreachable = new Customer('unreachable'); unreachable.gridSystem = grid; unreachable.collisionSystem = collision;
    unreachable.group.position.set(0, 0, 6); unreachable.assignedStation = station; station.isOccupied = true; station.currentGamerId = unreachable.id;
    unreachable.moveTo(station.group.position.clone(), 'WALKING_TO_STATION');
    for (let tick = 0; tick < 80; tick++) unreachable.update(.1);
    const recovered = !station.isOccupied && !unreachable.assignedStation && unreachable.state !== 'WALKING_TO_STATION';
    const deskStillSolidForOwner = collision.isPointBlocked(station.group.position.x, station.group.position.z, .28, station.id);
    const measure = (counterLevel: number, cashierMultiplier: number) => {
      station.isOccupied = false; station.currentGamerId = undefined;
      desk.currentTier = RECEPTION_TIERS[counterLevel - 1];
      const system = new CustomerSystem(scene, placement, economy); system.getCashierMultiplier = () => cashierMultiplier;
      system.spawnInterval = Infinity; system.getSpawnInterval = () => Infinity; system.observedLayout = placement.layoutRevision;
      const customer = new Customer('timed'); customer.gridSystem = grid; customer.collisionSystem = collision;
      customer.group.position.copy(desk.getCustomerQueuePosition()); customer.state = 'WAITING_CHECKIN';
      system.customers.set(customer.id, customer); system.deskQueues.set(desk.id, [customer]);
      let seconds = 0;
      while (customer.state === 'WAITING_CHECKIN' && seconds < 4) { system.update(.01); seconds += .01; }
      customer.releaseStation();
      return { seconds, state: customer.state };
    };
    return { wallMoved, oldShape, rotatedShape, noRoute: noRoute.length, blockedTarget: blockedTarget.length,
      pathSegments: route.length, unsafeSegments, recovered, deskStillSolidForOwner,
      base: measure(1, 1), cashier: measure(1, 1.35), upgradedCounter: measure(2, 1.35) };
  });
  expect(results.wallMoved).toBe(true);
  expect(results.oldShape.maxZ - results.oldShape.minZ).toBeGreaterThan(results.oldShape.maxX - results.oldShape.minX);
  expect(results.rotatedShape.maxX - results.rotatedShape.minX).toBeGreaterThan(results.rotatedShape.maxZ - results.rotatedShape.minZ);
  expect(results.noRoute).toBe(0); expect(results.blockedTarget).toBe(0); expect(results.pathSegments).toBeGreaterThan(0); expect(results.unsafeSegments).toBe(0);
  expect(results.recovered).toBe(true); expect(results.deskStillSolidForOwner).toBe(true);
  for (const measurement of [results.base, results.cashier, results.upgradedCounter]) expect(measurement.state).toBe('WALKING_TO_STATION');
  expect(results.base.seconds).toBeCloseTo(2, 1);
  expect(results.cashier.seconds).toBeLessThan(results.base.seconds);
  expect(results.upgradedCounter.seconds).toBeLessThan(results.cashier.seconds);
  await info.attach('lounge-component-measurements.json', { body: JSON.stringify(results, null, 2), contentType: 'application/json' });
});
