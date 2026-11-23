import { test, expect, type Page } from '@playwright/test';
import { holdDirection } from './reception-controls.ts';

async function openShift(page: Page) {
  await page.route(/\/src\/main\.ts(?:\?.*)?$/, async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: (await response.text()).replace('const game = new Game(canvas, uiContainer);',
      'const game = new Game(canvas, uiContainer); window.shiftGame = game;') });
  });
  await page.goto('/');
  await expect(page.locator('body')).toHaveAttribute('data-game-ready','true',{ timeout:60000 });
  await page.locator('button[data-view="lounge"]').click();
  await expect(page.locator('.reception-hint')).toBeVisible();
  await page.waitForFunction(() => !(window as any).shiftGame.cameraController.isTransitioning);
  await page.evaluate(() => {
    const game = (window as any).shiftGame;
    game.clock.getDelta = () => 0;
    game.customerSystem.spawnInterval = Infinity;
    game.customerSystem.getSpawnInterval = () => Infinity;
  });
}

async function step(page: Page, seconds: number) {
  await page.evaluate(seconds => {
    const game = (window as any).shiftGame;
    for (let i=0; i<Math.round(seconds*20); i++) {
      game.receptionUI.readInput();
      game.customerSystem.update(.05);
      game.floatingTextManager.update(.05);
    }
    game.receptionUI.render(game.customerSystem, game.placementSystem, game.cameraController.camera);
  },seconds);
}

async function move(page: Page, right: boolean, seconds: number) {
  const release = await holdDirection(page,right);
  try { await step(page,seconds); } finally { await release(); }
}

test('manual counter pauses, resumes, dispatches once and reports a completed session on reload', async ({page},info) => {
  const errors: string[] = [];
  page.on('pageerror',e => errors.push(e.message));
  await openShift(page);
  if (info.project.name === 'mobile') {
    // Keep a finger on the camera and move only the joystick with the second finger.
    const cameraTarget = () => page.evaluate(() => (window as any).shiftGame.cameraController.target.toArray());
    const before = await cameraTarget();
    await expect(page.locator('.reception-stick')).toBeVisible();
    const stick = (await page.locator('.reception-stick').boundingBox())!;
    const finger = { id: 1, x: 150, y: 300 };
    const thumb = { id: 2, x: stick.x + stick.width/2, y: stick.y + stick.height/2 };
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type:'touchStart', touchPoints:[finger] });
    await cdp.send('Input.dispatchTouchEvent', { type:'touchStart', touchPoints:[finger,thumb] });
    await cdp.send('Input.dispatchTouchEvent', { type:'touchMove', touchPoints:[finger,{...thumb,x:thumb.x+20}] });
    await cdp.send('Input.dispatchTouchEvent', { type:'touchEnd', touchPoints:[] });
    await cdp.detach();
    expect(await cameraTarget()).toEqual(before);
  }
  await step(page,22);
  const waiting = page.getByRole('progressbar',{name:'Awaiting check-in',exact:true}).first();
  await expect(waiting).toBeVisible();
  await expect(waiting).toHaveJSProperty('value',0);
  await move(page,false,.35);
  await step(page,.35);
  await expect(page.getByRole('progressbar',{name:'Check-in',exact:true})).toBeVisible();
  await move(page,true,.4);
  const paused = page.getByRole('progressbar',{name:'Check-in paused'});
  await expect(paused).toBeVisible();
  const progress = await paused.evaluate((el: HTMLProgressElement) => el.value);
  await step(page,3);
  await expect(paused).toHaveJSProperty('value',progress);
  await page.screenshot({path:info.outputPath('check-in-paused.png')});
  await move(page,false,.4);
  await step(page,2.2);
  const assign = page.locator('.pc-choices button');
  await expect(assign).toHaveCount(2);
  await assign.first().click();
  await step(page,15);
  await expect(page.getByRole('progressbar',{name:'Gaming',exact:true})).toBeVisible();
  await page.screenshot({path:info.outputPath('pc-session.png')});
  const revenue = () => page.evaluate(() => (window as any).shiftGame.customerSystem.operations.shift.pc);
  expect(await revenue()).toBe(0);
  await step(page,25);
  const payout = await revenue();
  expect(payout).toBeGreaterThan(0);
  await step(page,5); expect(await revenue()).toBe(payout);
  await page.evaluate(() => {
    const game = (window as any).shiftGame;
    game.economySystem.timeMinutes = 1439.9;
    game.clock.getDelta = () => .05;
  });
  await page.getByRole('button',{name:'Day 1 complete · View results'}).click();
  const report = page.locator('.shift-report').filter({hasText:'Completed shift'});
  await expect(report).toContainText('Served 1');
  await expect(report).toContainText('PC $'+payout);
  await page.locator('#save-game-btn').click();
  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-game-ready','true',{timeout:60000});
  await page.getByRole('button',{name:/Management/}).click();
  await expect(report).toContainText('PC $'+payout);
  expect(errors).toEqual([]);
});

test('busy lounge receives twelve bus passengers and admits them as places open', async ({page},info) => {
  const errors: string[] = [];
  page.on('pageerror',e => errors.push(e.message));
  await openShift(page);
  await page.locator('button[data-view="neighborhood"]').click();
  const rush = await page.evaluate(async () => {
    const game = (window as any).shiftGame, system = game.customerSystem, world = game.exteriorEnvironmentSystem;
    for (let i=0; i<5; i++) await system.spawnInitialCustomer();
    const initial = system.getActiveCustomerCount();
    const riders = new Set<string>(), admitted = new Set<string>();
    let crossing=0, waiting=0, laneError=0;
    game.neighborhood.update(game.neighborhood.state.busIn+.01);
    for (let i=0; i<440; i++) {
      world.update(.1); system.update(.1);
      if (world.passengerLoading) await new Promise(resolve => setTimeout(resolve,0));
      const people = [...system.customers.values()] as any[];
      crossing = Math.max(crossing,system.getCrossingCount());
      waiting = Math.max(waiting,people.filter(c => c.state==='WAITING_OUTSIDE').length);
      for (const c of people.filter(c => c.id.startsWith('bus_'))) {
        riders.add(c.id);
        if (c.group.position.z>12.8 && c.group.position.z<18.8) laneError=Math.max(laneError,Math.abs(c.group.position.x));
        if (c.targetDesk || c.facility) admitted.add(c.id);
      }
      if (i===160) {
        game.cameraController.setView('neighborhood',game.expansionSystem.currentBounds,true);
        game.sceneManager.render(game.cameraController.camera);
        (window as any).rushImage = game.sceneManager.renderer.domElement.toDataURL();
      }
    }
    return {initial,riders:riders.size,admitted:admitted.size,crossing,waiting,laneError,phase:world.busPhase};
  });
  expect(rush.initial).toBe(6); expect(rush.riders).toBe(12);
  expect(rush.crossing).toBeGreaterThanOrEqual(5); expect(rush.waiting).toBeGreaterThan(0);
  expect(rush.admitted).toBeGreaterThan(0); expect(rush.laneError).toBeLessThan(.51);
  expect(rush.phase).toBe('away');
  const png = await page.evaluate(() => (window as any).rushImage as string);
  await info.attach('bus-rush.png',{body:Buffer.from(png.split(',')[1],'base64'),contentType:'image/png'});
  await info.attach('rush-counts.json',{body:JSON.stringify(rush),contentType:'application/json'});
  expect(errors).toEqual([]);
});

test('two counters, sofa priority, hardware bonus, maintenance, stock and patience in a saved lounge', async ({page},info) => {
  await openShift(page);
  const key = 'gaming_zone_tycoon_save_v1';
  const fixture = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!),key);
  fixture.expansionCount = 2;
  fixture.receptions.push({id:'second-counter',gridX:5,gridZ:-4,rotationIndex:0,level:2});
  fixture.stations.forEach((s: any) => s.sessionsSinceService = 4);
  fixture.facilities.find((f: any)=>f.itemId==='vending').salesSinceRefill=4;
  fixture.facilities.find((f: any)=>f.itemId==='arcade').playsSinceService=3;
  fixture.workshop.parts.push({id:'earned-gpu',partId:'gpu_t3',stationId:fixture.stations[0].id});
  await page.addInitScript(({key,fixture})=>{
    if (sessionStorage.getItem('service-fixture')) return;
    sessionStorage.setItem('service-fixture','1'); localStorage.setItem(key,JSON.stringify(fixture));
  },{key,fixture});
  await page.reload(); await expect(page.locator('body')).toHaveAttribute('data-game-ready','true',{timeout:60000});
  const setup = await page.evaluate(async () => {
    const g=(window as any).shiftGame,s=g.customerSystem;
    g.clock.getDelta=()=>0; s.spawnInterval=Infinity; s.getSpawnInterval=()=>Infinity;
    // The second arrival goes to the other desk. Reserve the sofa for checked-in guests in this fixture.
    s.preferFacility=false; await s.spawnInitialCustomer();
    const guests=[...s.customers.values()] as any[];
    guests[0].wantsPerformance=true;
    return {desks:guests.map(c=>c.targetDeskId),first:guests[0].id,second:guests[1].id};
  });
  expect(new Set(setup.desks).size).toBe(2);
  await step(page,24);
  await move(page,false,.35); await step(page,12);
  const seated=await page.evaluate(id=>{
    const s=(window as any).shiftGame.customerSystem,c=s.customers.get(id);
    return {state:c.state,waiting:c.waitingForPc,sofa:c.facility?.type,people:s.pending.length,
      other:s.serviceTimers.get('second-counter')?.elapsed};
  },setup.first);
  expect(seated).toEqual({state:'USING_FACILITY',waiting:true,sofa:'sofa',people:1,other:0});
  // Start at each marked approach for long-distance travel. Occupancy, repair timers, stock and dispatch run normally.
  await page.evaluate(()=>{
    const g=(window as any).shiftGame,pc=g.placementSystem.stations.values().next().value;
    g.customerSystem.player.group.position.copy(pc.getApproachWorldPosition());
  });
  await step(page,2);
  await expect(page.getByRole('progressbar',{name:'Repairing',exact:true})).toBeVisible();
  await step(page,3.2);
  await page.locator('.pc-choices button').filter({hasText:'⚡'}).click();
  await step(page,14);
  await expect(page.getByRole('progressbar',{name:'Gaming +25%'})).toBeVisible();
  await page.evaluate(()=>{
    const g=(window as any).shiftGame;
    const vendor=[...g.placementSystem.facilities.values()].find((f:any)=>f.type==='vending') as any;
    g.customerSystem.player.group.position.copy(vendor.getApproachPosition());
  });
  await step(page,1);
  await expect(page.getByRole('progressbar',{name:'Refilling'})).toBeVisible();
  await step(page,2.1);
  await page.getByRole('button',{name:/Management/}).click();
  await page.locator('.hire-btn[data-role="technician"]').click(); await page.locator('#close-stats-btn').click();
  await page.waitForFunction(() => [...(window as any).shiftGame.workforce.workers.values()].every((w:any)=>w.avatar.ready));
  await step(page,38);
  const results = await page.evaluate(() => {
    const g=(window as any).shiftGame, ops=g.customerSystem.operations;
    const facilities=[...g.placementSystem.facilities.values()] as any[];
    return {stock:facilities.find(f=>f.type==='vending').stock,broken:facilities.some(f=>f.needsService),
      pending:g.customerSystem.pending.length,shift:ops.shift,brokenPcs:[...g.placementSystem.stations.values()].filter((s:any)=>s.needsService).length,
      cost:g.placementSystem.stations.values().next().value.getHourlyRevenue()};
  });
  expect(results.stock).toBe(4); expect(results.broken).toBe(false); expect(results.brokenPcs).toBe(0);
  expect(results.shift.pc).toBe(Math.round(results.cost*20/15*1.25));
  await step(page,60);
  expect(await page.evaluate(()=>(window as any).shiftGame.customerSystem.operations.shift.lost)).toBe(1);
  await info.attach('service-results.json',{body:JSON.stringify(results),contentType:'application/json'});
});
