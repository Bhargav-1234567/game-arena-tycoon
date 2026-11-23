// Historical pre-fix diagnostic. Use tests/browser/lounge.spec.ts for current acceptance checks.
// Normal UI repros plus explicitly labeled in-browser component probes.
// Exposes the existing Game instance through an intercepted development response; source is unchanged.
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const folder = resolve('test-results/lounge-audit', new Date().toISOString().replace(/[:.]/g, '-'));
await mkdir(folder, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
const page = await context.newPage();
const findings: Record<string, unknown> = {};
const errors: string[] = [];
page.on('pageerror', (error) => errors.push(error.message));
await page.route(/\/src\/main\.ts(?:\?.*)?$/, async (route) => {
  const response = await route.fetch(), body = await response.text();
  assert.ok(body.includes('const game = new Game(canvas, uiContainer);'));
  await route.fulfill({ response, body: body.replace('const game = new Game(canvas, uiContainer);', 'const game = new Game(canvas, uiContainer); window.__auditGame = game;') });
});
const base = 'http://127.0.0.1:4173/';
findings.audit = { mode: process.argv.includes('--quick') ? 'quick' : 'full', browser: 'Chromium', viewport: '1440x1000', url: base,
  observationSeconds: process.argv.includes('--quick') ? 0 : 60 };
console.log(`Audit folder: ${folder}`);
async function fresh() {
  await page.goto('about:blank');
  await page.goto(base); await page.waitForSelector('body[data-game-ready="true"]', { timeout: 60000 });
  await page.evaluate(() => { const game = (window as any).__auditGame; game.workshopUI.open('puzzle'); });
  // Pause simulation for deterministic diagnostics, then clear only this isolated browser save.
  await page.evaluate(() => localStorage.removeItem('gaming_zone_tycoon_save_v1'));
}
async function reset() {
  await page.goto('about:blank');
  await page.goto(base); await page.waitForSelector('body[data-game-ready="true"]', { timeout: 60000 });
  await page.locator('button[data-view="lounge"]').click();
  await page.waitForTimeout(100);
  await page.waitForSelector('body[data-camera-moving="false"]');
}
async function point(x: number, z: number, y = 0) {
  return page.evaluate(({ x, y, z }) => {
    const camera = (window as any).__auditGame.cameraController.camera;
    const value = camera.position.clone().set(x, y, z).project(camera);
    return { x: (value.x + 1) * innerWidth / 2, y: (1 - value.y) * innerHeight / 2 };
  }, { x, y, z });
}
async function uiPlace(name: string, x: number, z: number) {
  await page.locator('#btn-toggle-build').click();
  await page.locator('.item-card').filter({ hasText: name }).locator('.buy-btn').click();
  const target = await point(x + .2, z + .2);
  await page.mouse.move(target.x, target.y, { steps: 5 }); await page.waitForTimeout(100);
  const preview = await page.evaluate(() => ({ valid: (window as any).__auditGame.placementSystem.isGhostValid,
    grid: (window as any).__auditGame.placementSystem.currentGridPos }));
  await page.mouse.click(target.x, target.y); await page.waitForTimeout(200);
  await page.keyboard.press('Escape');
  return preview;
}

try {
  await fresh(); await reset();
  findings.initial = await page.evaluate(() => {
    const game = (window as any).__auditGame;
    return { stations: [...game.placementSystem.stations.values()].map((station: any) => ({ id: station.id, x: station.gridX, z: station.gridZ, seat: station.getSeatingWorldPosition().toArray() })), cash: game.economySystem.cash };
  });
  console.log('Auditing chair clearance');

  findings.chairBlockingPreview = await uiPlace('Modern Indoor Planter', -3, 1);
  findings.chairBlocked = await page.evaluate(() => {
    const game = (window as any).__auditGame, station = [...game.placementSystem.stations.values()][0] as any;
    const seat = station.getSeatingWorldPosition();
    return { seat: seat.toArray(), blockedByOtherFurniture: game.customerSystem.collisionSystem.isPointBlocked(seat.x, seat.z, .28, station.id),
      seatTile: game.gridSystem.getCell(Math.floor(seat.x), Math.floor(seat.z)) };
  });
  await page.screenshot({ path: resolve(folder, '01-planter-on-chair.png') });
  const samples: unknown[] = [];
  for (let index = 0; index < (process.argv.includes('--quick') ? 0 : 12); index++) {
    await page.waitForTimeout(5000);
    samples.push(await page.evaluate(() => {
      const game = (window as any).__auditGame;
      return [...game.customerSystem.customers.values()].map((customer: any) => ({ id: customer.id, state: customer.state,
        station: customer.assignedStation?.id, position: customer.group.position.toArray(), target: customer.targetPosition.toArray(), stuckTimer: customer.stuckTimer }));
    }));
  }
  findings.blockedChairTimeline = samples;
  await page.screenshot({ path: resolve(folder, '02-blocked-chair-after-60s.png') });
  console.log('Chair observation complete');

  if (!process.argv.includes('--quick')) {
    await page.waitForFunction(() => [...(window as any).__auditGame.customerSystem.customers.values()].some((customer: any) => customer.state === 'GAMING'), undefined, { timeout: 30000 });
    const occupied = await page.evaluate(() => {
      const game = (window as any).__auditGame;
      const customer = [...game.customerSystem.customers.values()].find((candidate: any) => candidate.state === 'GAMING') as any;
      const station = customer.assignedStation;
      return { customerId: customer.id, stationId: station.id, x: station.gridX + 1.46, z: station.gridZ + .5 };
    });
    const hit = await point(occupied.x, occupied.z, 1.05); await page.mouse.click(hit.x, hit.y);
    await page.locator('#move-item-btn').click();
    findings.occupiedPcHidden = await page.evaluate(({ stationId, customerId }) => {
      const game = (window as any).__auditGame, station = game.placementSystem.stations.get(stationId), customer = game.customerSystem.customers.get(customerId);
      return { moving: game.placementSystem.isMovingItem, visible: station.group.visible, customerState: customer?.state, position: customer?.group.position.toArray() };
    }, occupied);
    await page.keyboard.press('r'); await page.keyboard.press('r');
    const edge = await point(-.8, -1.8); await page.mouse.move(edge.x, edge.y, { steps: 8 }); await page.waitForTimeout(100);
    findings.outsideChairPreview = await page.evaluate(() => ({ valid: (window as any).__auditGame.placementSystem.isGhostValid, grid: (window as any).__auditGame.placementSystem.currentGridPos }));
    await page.mouse.click(edge.x, edge.y); await page.waitForTimeout(900);
    findings.occupiedPcMoved = await page.evaluate(({ stationId, customerId }) => {
      const game = (window as any).__auditGame, station = game.placementSystem.stations.get(stationId), customer = game.customerSystem.customers.get(customerId);
      return { moving: game.placementSystem.isMovingItem, visible: station.group.visible, seat: station.getSeatingWorldPosition().toArray(),
        customerState: customer?.state, position: customer?.group.position.toArray(), bounds: game.expansionSystem.currentBounds };
    }, occupied);
    await page.screenshot({ path: resolve(folder, '04-occupied-pc-moved-outside-chair.png') });
  }

  await fresh(); await reset();
  console.log('Auditing entrance blockage');
  await page.locator('[data-zoom="1.25"]').click(); await page.locator('[data-zoom="1.25"]').click();
  await page.waitForTimeout(100);
  await page.waitForSelector('body[data-camera-moving="false"]');
  findings.doorLeft = await uiPlace('Modern Indoor Planter', -1, 7);
  findings.doorRight = await uiPlace('Modern Indoor Planter', 0, 7);
  findings.doorPassage = await page.evaluate(() => {
    const game = (window as any).__auditGame, collision = game.customerSystem.collisionSystem;
    return Array.from({ length: 9 }, (_, index) => { const x = -.8 + index * .2; return { x, blocked: collision.isPointBlocked(x, 7.5, .28) }; });
  });
  await page.screenshot({ path: resolve(folder, '03-blocked-entrance.png') });

  await fresh(); await reset();
  console.log('Auditing rapid upgrades');
  const tower = await point(-2.54, .5, 1.05); await page.mouse.click(tower.x, tower.y);
  await page.route('**/pc_lvl2.glb', async (route) => { await new Promise((resolve) => setTimeout(resolve, 1000)); await route.continue(); });
  const upgradeBefore = await page.evaluate(() => ({ cash: (window as any).__auditGame.economySystem.cash, tier: [...(window as any).__auditGame.placementSystem.stations.values()][0].currentPC.level }));
  await page.locator('#upgrade-pc-btn').dblclick({ delay: 40 }); await page.waitForTimeout(1500);
  findings.doubleUpgrade = { before: upgradeBefore, after: await page.evaluate(() => ({ cash: (window as any).__auditGame.economySystem.cash,
    tier: [...(window as any).__auditGame.placementSystem.stations.values()][0].currentPC.level })) };
  await page.screenshot({ path: resolve(folder, '05-double-upgrade.png') });

  // Component probes below call the same live systems with controlled setup in the isolated save.
  findings.componentProbes = await page.evaluate(async () => {
    const { GridSystem } = await import('/src/systems/GridSystem.ts');
    const { PlacementSystem } = await import('/src/systems/PlacementSystem.ts');
    const { CollisionSystem } = await import('/src/systems/CollisionSystem.ts');
    const { EconomySystem } = await import('/src/systems/EconomySystem.ts');
    const { GamingStation } = await import('/src/entities/GamingStation.ts');
    const { ReceptionDesk } = await import('/src/entities/ReceptionDesk.ts');
    const { Customer } = await import('/src/entities/Customer.ts');
    const { StaffSystem } = await import('/src/systems/StaffSystem.ts');
    const { CustomerSystem } = await import('/src/systems/CustomerSystem.ts');
    const { BUILDABLE_ITEMS } = await import('/src/data/assets.ts');
    const { ROOM_FOOTPRINTS } = await import('/src/data/world-layout.ts');
    const { Scene, Vector3, Group } = await import('/node_modules/.vite/deps/three.js');
    const create = () => { const grid = new GridSystem(24, 24); grid.setZoneUnlocked(-6, 5, -2, 7); const economy = new EconomySystem(), scene = new Scene();
      const placement = new PlacementSystem(scene, grid, economy); return { scene, grid, economy, placement, collision: new CollisionSystem(placement) }; };
    const out: Record<string, unknown> = {};
    const path = create();
    for (let x = -6; x <= 5; x++) path.grid.setOccupied(x, 2, 1, 1, true, 'sealed-wall');
    const start = new Vector3(0, 0, 0), target = new Vector3(0, 0, 5);
    const seal = new Group(); seal.position.set(0, 0, 2.5); seal.userData = { halfW: 6, halfD: .45 }; path.placement.buildingObjects.push(seal);
    out.impossiblePath = { returned: path.grid.findPath(start, target, (a: any, b: any) => path.collision.isSegmentBlocked(a, b)).map((point: any) => point.toArray()), directBlocked: path.collision.isSegmentBlocked(start, target) };
    const blockedTarget = create(); blockedTarget.grid.setOccupied(0, 4, 1, 1, true, 'target-solid');
    const targetPlant = new Group(); targetPlant.position.set(.5, 0, 4.5); blockedTarget.placement.decorObjects.push(targetPlant);
    out.blockedEndpoint = { returned: blockedTarget.grid.findPath(new Vector3(0, 0, 0), new Vector3(.5, 0, 4.5), (a: any, b: any) => blockedTarget.collision.isSegmentBlocked(a, b)).map((point: any) => point.toArray()), targetBlocked: blockedTarget.collision.isPointBlocked(.5, 4.5) };
    const own = create(), station = new GamingStation('assigned', 0, 0, 2); station.updateLayout(); station.group.position.set(1, 0, .5); own.placement.stations.set(station.id, station);
    const from = new Vector3(1, 0, 3), seat = station.getSeatingWorldPosition();
    out.ignoreOwnDesk = { from: from.toArray(), seat: seat.toArray(), blockedNormally: own.collision.isSegmentBlocked(from, seat, .28),
      blockedWhenAssigned: own.collision.isSegmentBlocked(from, seat, .28, station.id) };
    const clearance = create(), tight = new GamingStation('clearance', 0, 0); tight.updateLayout(); tight.group.position.set(1, 0, .5);
    clearance.placement.stations.set(tight.id, tight); clearance.grid.setOccupied(0, 0, 2, 1, true, tight.id);
    const clearanceStart = new Vector3(-1.5, 0, 1.5), clearanceEnd = new Vector3(3.5, 0, 1.5);
    const planned = clearance.grid.findPath(clearanceStart, clearanceEnd, (a: any, b: any) => clearance.collision.isSegmentBlocked(a, b, .55));
    out.unsafePathSegments = { path: planned.map((point: any) => point.toArray()), collisions: planned.map((point: any, index: number) => clearance.collision.isSegmentBlocked(index ? planned[index - 1] : clearanceStart, point, .55)) };
    const moving = create(), hidden = new GamingStation('hidden', 0, 0); hidden.updateLayout(); hidden.group.position.set(1, 0, .5);
    moving.placement.stations.set(hidden.id, hidden); await moving.placement.startMoveStation(hidden);
    out.hiddenStation = { visible: hidden.group.visible, selectedAsAvailable: moving.placement.getAvailableStation()?.id,
      stillCollision: moving.collision.getObstacles().some((obstacle: any) => obstacle.id === 'hidden_desk') };
    moving.placement.cancelMove();
    const counter = create();
    await counter.placement.setBuildItem(BUILDABLE_ITEMS.find((item: any) => item.id === 'plant_indoor'));
    counter.placement.updateHover(new Vector3(-1.8, 0, -.8)); await counter.placement.tryPlace();
    await counter.placement.setBuildItem(BUILDABLE_ITEMS.find((item: any) => item.id === 'reception_counter'));
    counter.placement.updateHover(new Vector3(-1.8, 0, .2)); const before = { ...counter.grid.getCell(-2, -1) };
    const valid = (counter.placement as any).isGhostValid, placed = await counter.placement.tryPlace();
    const after = { ...counter.grid.getCell(-2, -1) }, desk = counter.placement.receptionDesk!;
    await counter.placement.startMoveReception(desk);
    out.counterZoneOverwrite = { valid, placed, before, after, whileMoving: { ...counter.grid.getCell(-2, -1) } };
    const queue = create(); await queue.placement.setBuildItem(BUILDABLE_ITEMS.find((item: any) => item.id === 'reception_counter'));
    queue.placement.updateHover(new Vector3(-5.8, 0, -1.8)); queue.placement.rotate(); queue.placement.rotate();
    const queueValid = (queue.placement as any).isGhostValid; await queue.placement.tryPlace();
    out.counterAgainstWall = { valid: queueValid, queue: [0, 1, 2].map((index) => queue.placement.receptionDesk!.getCustomerQueuePosition(index).toArray()), bounds: queue.collision.roomBounds };
    const queueMove = create(), crowd = new CustomerSystem(queueMove.scene, queueMove.placement, queueMove.economy);
    await queueMove.placement.setBuildItem(BUILDABLE_ITEMS.find((item: any) => item.id === 'reception_counter'));
    queueMove.placement.updateHover(new Vector3(-1.8, 0, 2.2)); await queueMove.placement.tryPlace(); await queueMove.placement.setBuildItem(undefined);
    const movingCounter = queueMove.placement.receptionDesk!, waiting = new Customer('waiting-fixture');
    waiting.targetDesk = movingCounter; waiting.targetDeskId = movingCounter.id;
    waiting.group.position.copy(movingCounter.getCustomerQueuePosition(0)); waiting.moveTo(movingCounter.getCustomerQueuePosition(0), 'WAITING_CHECKIN');
    (crowd as any).customers.set(waiting.id, waiting); (crowd as any).deskQueues.set(movingCounter.id, [waiting]);
    queueMove.placement.onReceptionMoved = (desk: any) => { void crowd.setupReceptionistForDesk(desk); };
    await queueMove.placement.startMoveReception(movingCounter); queueMove.placement.updateHover(new Vector3(-1.8, 0, 4.2)); await queueMove.placement.tryPlace();
    out.receptionQueueAfterMove = { customer: waiting.group.position.toArray(), oldTarget: (waiting as any).targetPosition.toArray(),
      newQueuePoint: movingCounter.getCustomerQueuePosition(0).toArray(), customerInsideCounter: queueMove.collision.isPointBlocked(waiting.group.position.x, waiting.group.position.z, .28), state: waiting.state };
    const wall = create(); await wall.placement.setBuildItem(BUILDABLE_ITEMS.find((item: any) => item.id === 'wall_solid'));
    wall.placement.updateHover(new Vector3(3.2, 0, .2)); await wall.placement.tryPlace(); await wall.placement.setBuildItem(undefined);
    const object = wall.placement.buildingObjects[0], original = { halfW: object.userData.halfW, halfD: object.userData.halfD };
    await wall.placement.startMoveObject(object); wall.placement.rotate(); wall.placement.updateHover(new Vector3(2.2, 0, 3.2)); await wall.placement.tryPlace();
    out.rotatedWall = { original, after: { halfW: object.userData.halfW, halfD: object.userData.halfD, rotation: object.userData.rotationIndex }, collider: wall.collision.getObstacles()[0] };
    const expansion = new GridSystem(24, 24), bounds = ROOM_FOOTPRINTS[6]; expansion.setZoneUnlocked(bounds.minX, bounds.maxX - 1, bounds.minZ, bounds.maxZ - 1);
    let missing = 0; for (let x = bounds.minX; x < bounds.maxX; x++) for (let z = bounds.minZ; z < bounds.maxZ; z++) if (!expansion.getCell(x, z)) missing++;
    out.expansion = { bounds, missingCells: missing, eastCellExists: !!expansion.getCell(12, 0), northCellExists: !!expansion.getCell(0, -13) };
    const staff = create(), pc = new GamingStation('benefits', 0, 0), employees = new StaffSystem(staff.economy);
    const satisfactionBefore = pc.getSatisfactionScore(); employees.hire('technician');
    out.technicianBenefit = { before: satisfactionBefore, after: pc.getSatisfactionScore(), hired: employees.roles.find((role: any) => role.id === 'technician')!.hiredCount };
    const customer = new Customer('billing'); customer.assignedStation = pc; customer.gamingDuration = 20; let paid = 0;
    customer.onPayment = (amount: number) => { paid = amount; }; customer.finishSession();
    out.billing = { hourlyRate: pc.getHourlyRevenue(), durationSeconds: 20, paid, expectedAt15SecondsPerHour: Math.round(pc.getHourlyRevenue() * 20 / 15) };
    return out;
  });
  console.log(JSON.stringify(findings.componentProbes, null, 2));
} catch (error) {
  await page.screenshot({ path: resolve(folder, 'audit-error.png') }).catch(() => {});
  throw error;
} finally {
  await writeFile(resolve(folder, 'findings.json'), JSON.stringify(findings, null, 2));
  await writeFile(resolve(folder, 'browser-errors.json'), JSON.stringify(errors, null, 2));
  console.log(`Audit evidence: ${folder}`); await browser.close();
}
