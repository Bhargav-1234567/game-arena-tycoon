import { test, expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';

test('walk-in visitors use all twelve facility models and pay only on completion', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('response', (response) => { if (response.status() >= 400) errors.push(response.url()); });
  await page.route(/\/src\/main\.ts(?:\?.*)?$/, async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, body: (await response.text()).replace('const game = new Game(canvas, uiContainer);',
      'const game = new Game(canvas, uiContainer); window.facilityGame = game;') });
  });
  await page.goto('/');
  await expect(page.locator('body')).toHaveAttribute('data-game-ready', 'true', { timeout: 60000 });
  const key = 'gaming_zone_tycoon_save_v1';
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), key);
  expect(saved.facilities).toHaveLength(3);
  // A saved lounge with just these facilities isolates their actual revenue from PC payments.
  saved.stations = []; saved.receptions = []; saved.objects = [];
  saved.neighborhood.view = 'lounge';
  saved.facilities = [
    { id: 'sofa', itemId: 'sofa', gridX: -4, gridZ: 1, rotationIndex: 1, level: 1 },
    { id: 'vending', itemId: 'vending', gridX: 0, gridZ: 0, rotationIndex: 0, level: 1 },
    { id: 'arcade', itemId: 'arcade', gridX: 3, gridZ: 4, rotationIndex: 3, level: 1 }
  ];
  await page.addInitScript(({ key, saved }) => {
    if (sessionStorage.getItem('facility-fixture')) return;
    localStorage.setItem(key, JSON.stringify(saved));
    sessionStorage.setItem('facility-fixture', '1');
  }, { key, saved });
  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-game-ready', 'true', { timeout: 60000 });
  await page.evaluate(() => {
    const game = (window as any).facilityGame;
    game.clock.getDelta = () => 0;
    game.staffSystem.hire('technician');
    game.customerSystem.spawnInterval = Infinity;
    game.customerSystem.getSpawnInterval = () => Infinity;
  });

  for (let level = 1; level <= 4; level++) {
    for (const type of ['sofa', 'vending', 'arcade']) {
      await page.evaluate((type) => {
        const game = (window as any).facilityGame;
        game.stationInspector.inspectFacility(game.placementSystem.facilities.get(type));
      }, type);
      if (level > 1) await page.locator('#upgrade-facility-btn').click();
      await expect(page.locator('.inspector-header h3')).toHaveText(`LEVEL ${level}/4`);
      const visit = await page.evaluate(async (type) => {
        const game = (window as any).facilityGame, system = game.customerSystem;
        if (!system.customers.size) await system.spawnInitialCustomer();
        const customer = [...system.customers.values()][0] as any;
        const facility = customer.facility;
        if (facility?.type !== type) throw new Error('Unexpected visit: ' + facility?.type);
        const before = game.economySystem.cash;
        for (let tick = 0; tick < 900 && !facility.inUse; tick++) system.update(.05);
        if (!facility.inUse) throw new Error('Visitor failed to reach ' + type);
        system.update(.5);
        game.stationInspector.updateStatus();
        return { before, during: game.economySystem.cash, error: customer.group.position.distanceTo(facility.getUsePosition()),
          pose: customer.currentAction.getClip().name };
      }, type);
      const label = type === 'vending' ? 'Drink' : type === 'arcade' ? 'Arcade' : 'Sofa';
      const progress = page.getByRole('progressbar', { name: label, exact: true });
      await expect(progress).toBeVisible();
      const initialProgress = await progress.evaluate((bar: HTMLProgressElement) => bar.value);
      expect(initialProgress).toBeGreaterThan(0);
      await page.evaluate(() => {
        const g = (window as any).facilityGame;
        g.customerSystem.update(.25);
        g.receptionUI.render(g.customerSystem, g.placementSystem, g.cameraController.camera);
      });
      expect(await progress.evaluate((bar: HTMLProgressElement) => bar.value)).toBeGreaterThan(initialProgress);
      expect(visit.during).toBe(visit.before);
      expect(visit.error).toBeLessThan(.002);
      expect(visit.pose).toBe(type === 'sofa' || (type === 'arcade' && level === 4) ? 'Gaming' : 'Idle');
      await expect(page.locator('#move-item-btn')).toBeDisabled();
      if (level < 4) await expect(page.locator('#upgrade-facility-btn')).toBeDisabled();

      // Capture the actual animated/sized meshes from the running scene in a close-up.
      const captured = await page.evaluate(async (type) => {
        const game = (window as any).facilityGame, customer = [...game.customerSystem.customers.values()][0] as any;
        const facility = customer.facility, parent = game.sceneManager.scene;
        const threeUrl = performance.getEntriesByType('resource').find((e) => new URL(e.name).pathname.endsWith('/three.js'))!.name;
        const T = await import(/* @vite-ignore */ threeUrl);
        const scene = new T.Scene(); scene.background = new T.Color(0xdbe1e4);
        scene.add(new T.HemisphereLight(0xffffff, 0x98949a, 1.9));
        const positions = new T.Box3().setFromObject(facility.mesh, true);
        positions.expandByPoint(customer.group.position);
        const target = positions.getCenter(new T.Vector3()); target.y = type === 'sofa' ? .78 : 1;
        const camera = new T.OrthographicCamera(-1.78, 1.78, 1.39, -1.39, .01, 32);
        const offset = new T.Vector3(type === 'sofa' ? 1.6 : 2.8, 1.05, 1.9)
          .applyAxisAngle(new T.Vector3(0, 1, 0), facility.group.rotation.y);
        camera.position.copy(target).add(offset); camera.lookAt(target);
        const light = new T.DirectionalLight(0xffffff, 2.1); light.position.copy(offset); scene.add(light);
        const renderer = new T.WebGLRenderer({ antialias: true });
        try {
          renderer.setSize(400, 312);
          scene.add(facility.group, customer.group); renderer.render(scene, camera);
          let cushionError = 0, handError = 0;
          const { seat, controls } = facility.layout;
          if (seat) {
            const origin = facility.getUsePosition(); origin.y = 2.5;
            const hit = new T.Raycaster(origin, new T.Vector3(0, -1, 0)).intersectObject(facility.mesh, true)[0];
            cushionError = hit ? Math.abs(hit.point.y - seat[1]) : Infinity;
          }
          if (controls) {
            const wrist = customer.avatar.bone('Hand.L').getWorldPosition(new T.Vector3());
            const aim = customer.group.localToWorld(new T.Vector3(-.14, controls[0], controls[1]));
            handError = wrist.distanceTo(aim);
          }
          return { image: renderer.domElement.toDataURL('image/png').split(',')[1], cushionError, handError };
        } finally {
          parent.add(facility.group, customer.group); renderer.dispose(); renderer.forceContextLoss();
        }
      }, type);
      writeFileSync(info.outputPath(`${type}-level-${level}.png`), Buffer.from(captured.image, 'base64'));
      expect(captured.cushionError, `${type} ${level} cushion`).toBeLessThan(.025);
      expect(captured.handError, `${type} ${level} controls`).toBeLessThan(.095);
      const result = await page.evaluate(() => {
        const game = (window as any).facilityGame, system = game.customerSystem;
        const customer = [...system.customers.values()][0] as any, facility = customer.facility;
        for (let tick = 0; tick < 1000 && system.customers.size; tick++) system.update(.05);
        return { cash: game.economySystem.cash, count: system.customers.size, owner: facility.reservedBy ?? null,
          exit: Math.abs(customer.group.position.x) };
      });
      const price = type === 'sofa' ? 0 : (type === 'arcade' ? [20, 45, 85, 180] : [15, 35, 70, 130])[level - 1];
      expect(result.cash - visit.before).toBe(price);
      expect(result.count).toBe(0); expect(result.owner).toBeNull(); expect(result.exit).toBeGreaterThan(13);
    }
  }
  // Run the game loop for two in-game hours with empty machines. Staff wages may still be deducted.
  const earnings = await page.evaluate(() => {
    const game = (window as any).facilityGame, credits: number[] = [];
    const schedule = window.requestAnimationFrame, render = game.sceneManager.render;
    const earn = game.economySystem.earn.bind(game.economySystem);
    game.economySystem.earn = (n: number) => { credits.push(n); earn(n); };
    try {
      window.requestAnimationFrame = () => 0; game.sceneManager.render = () => {};
      game.clock.getDelta = () => .1;
      for (let i = 0; i < 310; i++) game.animate();
    } finally {
      window.requestAnimationFrame = schedule; game.clock.getDelta = () => 0;
      game.sceneManager.render = render; game.economySystem.earn = earn;
    }
    return credits;
  });
  expect(earnings).toEqual([]);
  const finalCash = await page.evaluate(() => {
    const game = (window as any).facilityGame;
    if (!game.save()) throw new Error('Could not save the completed visits');
    return game.economySystem.cash;
  });
  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-game-ready', 'true', { timeout: 60000 });
  expect(await page.evaluate(() => {
    const game = (window as any).facilityGame;
    return { cash: game.economySystem.cash, levels: [...game.placementSystem.facilities.values()].map((f: any) => f.currentTier.level) };
  })).toEqual({ cash: finalCash, levels: [4, 4, 4] });
  expect(errors).toEqual([]);
});
