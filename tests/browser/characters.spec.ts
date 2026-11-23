import { test, expect } from '@playwright/test';
import { ORIGINAL_CHARACTERS } from '../../src/data/characters.ts';
import { APPEARANCE_SLOTS, wardrobeFor } from '../../src/characters/CharacterAppearance.ts';

test.beforeEach(async ({ page }) => {
  (page as any).characterErrors = []; (page as any).humanRequests = [];
  page.on('pageerror', (error) => (page as any).characterErrors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') (page as any).characterErrors.push(message.text()); });
  page.on('response', (response) => { if (response.status() >= 400) (page as any).characterErrors.push(`${response.status()} ${response.url()}`); });
  page.on('request', (request) => { if (/\/characters\/.*\.glb/.test(request.url())) (page as any).humanRequests.push(request.url()); });
});
test.afterEach(async ({ page }) => {
  expect((page as any).characterErrors).toEqual([]);
  expect((page as any).humanRequests.length).toBeGreaterThan(0);
  expect((page as any).humanRequests.every((url: string) => url.includes('/characters/original/'))).toBe(true);
});

test('modular wardrobes mix male and female hair, clothes, shoes and colours without changing other instances', async ({ page }, info) => {
  await page.goto('/custom-characters.html');
  await expect(page.locator('body')).toHaveAttribute('data-character-ready', 'aarav', { timeout: 60000 });
  await page.locator('#wardrobe summary').click();
  for (const [id, gender] of [['aarav', 'male'], ['meera', 'female']] as const) {
    await page.locator('#character').selectOption(id);
    await expect(page.locator('body')).toHaveAttribute('data-character-ready', id);
    for (const slot of APPEARANCE_SLOTS) for (const option of wardrobeFor(gender)[slot]) {
      await page.locator(`[data-appearance="${slot}"]`).selectOption(option);
      const visible = await page.evaluate((slot) => {
        const parts: string[] = [];
        (window as any).characterStudio.model.traverseVisible((node: any) => {
          if (node.userData.customAppearance?.slot === slot) parts.push(node.userData.customAppearance.option);
        });
        return parts;
      }, slot);
      expect(visible, `${gender} ${slot} ${option}`).toEqual(option === 'none' ? [] : [option]);
    }
    await page.locator('[data-appearance="shirtColor"]').fill(gender === 'male' ? '#437c8c' : '#9967aa');
    await page.locator('[data-appearance="top"]').selectOption(gender === 'male' ? 'hoodie' : 'wrap_blouse');
    await page.locator('[data-appearance="hair"]').selectOption(gender === 'male' ? 'curls' : 'bob');
    await page.locator('[data-appearance="bottoms"]').selectOption(gender === 'male' ? 'shorts' : 'pleated_skirt');
    await page.locator('[data-appearance="headwear"]').selectOption(gender === 'male' ? 'baseball_cap' : 'headphones');
    await page.locator('[data-appearance="neckwear"]').selectOption(gender === 'male' ? 'knit_scarf' : 'neckerchief');
    await page.locator('[data-appearance="shoes"]').selectOption(gender === 'male' ? 'high_tops' : 'loafers');
    await page.locator('#wardrobe summary').click();
    await page.screenshot({ path: info.outputPath(`custom-${gender}-wardrobe.png`) });
    await page.locator('#pose').selectOption('Walk');
    await page.screenshot({ path: info.outputPath(`custom-${gender}-walking.png`) });
    await page.locator('#pose').selectOption('Gaming');
    await page.locator('#side').click();
    await page.screenshot({ path: info.outputPath(`custom-${gender}-wardrobe-gaming.png`) });
    await page.locator('#pose').selectOption('Idle');
    await page.locator('#wardrobe summary').click();
  }
  await page.locator('#wardrobe summary').click();
  const varied = new Set<string>();
  for (let i = 0; i < 12; i++) {
    await page.locator('#random-look').click();
    varied.add(await page.evaluate(() => JSON.stringify((window as any).characterStudio.model.userData.appearance)));
  }
  expect(varied.size).toBeGreaterThan(10);
  const isolation = await page.evaluate(async () => {
    const { AssetManager } = await import('/src/services/AssetManager.ts');
    const path = '/assets/models/characters/original/customer_meera.glb';
    const second = await AssetManager.getInstance().loadRequiredModel(path);
    const defaults = second.userData.customHuman.defaultAppearance;
    const current = (window as any).characterStudio.model;
    const a: any[] = [], b: any[] = [];
    current.traverse((node: any) => { if (node.isMesh) a.push(...(Array.isArray(node.material) ? node.material : [node.material])); });
    second.traverse((node: any) => { if (node.isMesh) b.push(...(Array.isArray(node.material) ? node.material : [node.material])); });
    return { unchanged: JSON.stringify(second.userData.appearance) === JSON.stringify(defaults), sharedMaterials: a.some((surface) => b.includes(surface)) };
  });
  expect(isolation).toEqual({ unchanged: true, sharedMaterials: false });
});

test('original character studio shows all six people, all seven poses, close faces and every chair tier', async ({ page }, info) => {
  await page.goto('/custom-characters.html');
  await expect(page.locator('body')).toHaveAttribute('data-character-ready', 'aarav', { timeout: 60000 });
  await expect(page.locator('body')).toHaveAttribute('data-chair-ready', '1');
  for (const character of ORIGINAL_CHARACTERS) {
    await page.locator('#character').selectOption(character.id);
    await expect(page.locator('body')).toHaveAttribute('data-character-ready', character.id);
    for (const pose of ['Idle', 'Walk', 'SitDown', 'Gaming', 'StandUp', 'Wave', 'CheckIn']) {
      await page.locator('#pose').selectOption(pose);
      await expect(page.locator('body')).toHaveAttribute('data-pose', pose);
    }
    expect(await page.evaluate(() => {
      const state = (window as any).characterStudio;
      return { original: state.model.userData.customHuman.original, height: state.model.userData.customHuman.height,
        scale: state.model.scale.toArray(), drawn: state.renderer.info.render.triangles };
    })).toMatchObject({ original: true, scale: [1, 1, 1] });
  }
  await page.locator('#pose').selectOption('Idle'); await page.locator('#portrait').click();
  await page.screenshot({ path: info.outputPath('original-receptionist-face.png') });
  await page.locator('#portrait').click(); await page.locator('#pose').selectOption('Gaming');
  for (const tier of ['1', '2', '3', '4']) {
    await page.locator('#chair').selectOption(tier); await expect(page.locator('body')).toHaveAttribute('data-chair-ready', tier);
  }
  const distance = () => page.evaluate(() => {
    const { camera, avatar } = (window as any).characterStudio;
    return camera.position.distanceTo(avatar.position);
  });
  const beforeView = await distance();
  await page.locator('#front').click();
  expect(await distance()).toBeGreaterThan(beforeView * .75);
  await page.locator('#side').click();
  expect(await distance()).toBeGreaterThan(beforeView * .75);
  await page.screenshot({ path: info.outputPath('original-character-seated-tier4.png') });
});

test('controlled rig fixtures keep original feet on the floor and hands at the desk across people, chairs and rotations', async ({ page }, info) => {
  await page.goto('/custom-characters.html'); await expect(page.locator('body')).toHaveAttribute('data-character-ready', 'aarav', { timeout: 60000 });
  const results = await page.evaluate(async () => {
    const load = (path: string) => import(/* @vite-ignore */ (performance.getEntriesByType('resource').find((entry) => new URL(entry.name).pathname === path)?.name ?? path));
    const [T, { AssetManager }, { ORIGINAL_CHARACTERS }, { OriginalCharacterMotion, CHAIR_CUSHION_HEIGHTS }, { GamingStation, DESK_SURFACES, KEYBOARD_DIMS, MOUSE_DIMS }] = await Promise.all([
      load('/node_modules/.vite/deps/three.js'), load('/src/services/AssetManager.ts'), load('/src/data/characters.ts'), load('/src/characters/OriginalCharacterMotion.ts'), load('/src/entities/GamingStation.ts')
    ]);
    const measurements = [];
    for (const character of ORIGINAL_CHARACTERS) for (let tier = 1; tier <= 4; tier++) {
      const station = new GamingStation('fixture', 0, 0);
      await station.loadTiers(1, tier, 1, tier, tier, tier, 1);
      const model = await AssetManager.getInstance().loadRequiredModel(character.gamePath), actor = new T.Group(); actor.add(model);
      const motion = new OriginalCharacterMotion(model, actor), mixer = new T.AnimationMixer(model);
      const action = mixer.clipAction(model.userData.animations.find((clip: any) => clip.name === 'Gaming')); action.play();
      const desk = DESK_SURFACES[tier], keyboard = KEYBOARD_DIMS[tier], mouse = MOUSE_DIMS[tier];
      const handDistance = station.computedChairZ - .08 - (desk.frontZ - .05 - keyboard.d / 2) - .1;
      let maxFootError = 0, maxHandError = 0, maxDrift = 0;
      for (let rotation = 0; rotation < 4; rotation++) {
        actor.position.set(2, .18, -3); actor.rotation.y = rotation * Math.PI / 2;
        let previous: any;
        for (let frame = 0; frame < 90; frame++) {
          motion.restoreAnimationPose(); mixer.update(1 / 60);
          motion.fit(1, CHAIR_CUSHION_HEIGHTS[tier], desk.surfaceY, handDistance, -.05 + keyboard.w / 2 + .08 + mouse.w / 2);
          actor.updateWorldMatrix(true, true);
          const feet = ['FootL', 'FootR'].map((name) => model.getObjectByName(name).getWorldPosition(new T.Vector3()));
          const hands = ['HandL', 'HandR'].map((name) => model.getObjectByName(name).getWorldPosition(new T.Vector3()));
          maxFootError = Math.max(maxFootError, ...feet.map((point: any) => Math.abs(point.y - model.userData.customHuman.ankleHeight)));
          maxHandError = Math.max(maxHandError, ...hands.map((point: any) => Math.abs(point.y - desk.surfaceY - .027)));
          if (previous) maxDrift = Math.max(maxDrift, ...feet.map((point: any, index: number) => point.distanceTo(previous[index])));
          previous = feet;
        }
      }
      measurements.push({ character: character.id, tier, maxFootError, maxHandError, maxDrift });
      mixer.stopAllAction(); mixer.uncacheRoot(model);
    }
    return measurements;
  });
  expect(results).toHaveLength(24);
  for (const entry of results) {
    expect(entry.maxFootError, `${entry.character} chair ${entry.tier} feet`).toBeLessThan(.005);
    expect(entry.maxHandError, `${entry.character} chair ${entry.tier} hands`).toBeLessThan(.008);
    expect(entry.maxDrift, `${entry.character} chair ${entry.tier} pose drift`).toBeLessThan(.0001);
  }
  await info.attach('original-rig-fit-measurements.json', { body: JSON.stringify(results, null, 2), contentType: 'application/json' });
});

test('real original customers sit, type, stand and leave while the original receptionist serves them', async ({ page }, info) => {
  test.setTimeout(150000);
  await page.route(/\/src\/main\.ts(?:\?.*)?$/, async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, body: (await response.text()).replace('const game = new Game(canvas, uiContainer);', 'const game = new Game(canvas, uiContainer); window.__originalGame = game;') });
  });
  await page.goto('/'); await expect(page.locator('body')).toHaveAttribute('data-game-ready', 'true', { timeout: 60000 });
  await page.locator('[data-view="lounge"]').click();
  await page.waitForFunction(() => !(window as any).__originalGame.cameraController.isTransitioning);
  await page.waitForFunction(() => [...(window as any).__originalGame.customerSystem.customers.values()].some((customer: any) => customer.state === 'GAMING'), undefined, { timeout: 60000 });
  const customer = await page.evaluate(() => {
    const game = (window as any).__originalGame;
    const customer = [...game.customerSystem.customers.values()].find((customer: any) => customer.state === 'GAMING') as any;
    const payments: number[] = [], original = customer.onPayment;
    customer.onPayment = (amount: number, point: any) => { payments.push(amount); original?.(amount, point); };
    (window as any).__originalPayments = payments;
    const finished = customer.onFinished;
    customer.onFinished = (leaving: any) => {
      (window as any).__originalExit = { x: leaving.group.position.x, z: leaving.group.position.z, retries: leaving.routeRetries, journey: leaving.journeyTime };
      finished?.(leaving);
    };
    const staff = [...game.customerSystem.receptionists.values()][0] as any;
    return { id: customer.id, clip: customer.currentAction.getClip().name, original: customer.group.children[0].userData.customHuman.original,
      appearance: customer.group.children[0].userData.appearance,
      staffAppearance: staff.group.children[0].userData.appearance,
      looks: [...game.customerSystem.customers.values()].map((person: any) => JSON.stringify(person.group.children[0].userData.appearance)),
      staffOriginal: staff.group.children[0].userData.customHuman.original,
      staffCount: game.sceneManager.scene.children.filter((node: any) => node.name.startsWith('Receptionist_Employee_')).length,
      deskCount: game.placementSystem.receptionDesks.size, rate: customer.assignedStation.getHourlyRevenue(), duration: customer.gamingDuration };
  });
  expect(customer.original).toBe(true); expect(customer.staffOriginal).toBe(true); expect(customer.clip).toBe('Gaming'); expect(customer.staffCount).toBe(customer.deskCount);
  expect(customer.appearance).toEqual(expect.objectContaining({ top: expect.any(String), hair: expect.any(String), shoes: expect.any(String), shirtColor: expect.stringMatching(/^#[0-9a-f]{6}$/i) }));
  expect(customer.staffAppearance).toMatchObject({ top: 'blazer', bottoms: 'chinos', shirtColor: '#273c53' });
  expect(new Set(customer.looks).size).toBe(customer.looks.length);
  await page.screenshot({ path: info.outputPath('original-people-in-lounge.png') });
  await page.waitForFunction((id) => (window as any).__originalGame.customerSystem.customers.get(id)?.state === 'UNSEATING', customer.id, { timeout: 45000 });
  expect(await page.evaluate((id) => (window as any).__originalGame.customerSystem.customers.get(id).currentAction.getClip().name, customer.id)).toBe('StandUp');
  await page.waitForFunction((id) => !(window as any).__originalGame.customerSystem.customers.has(id), customer.id, { timeout: 60000 });
  expect(await page.evaluate(() => (window as any).__originalPayments)).toEqual([Math.round(customer.rate * customer.duration / 15)]);
  const exit = await page.evaluate(() => (window as any).__originalExit);
  expect(Math.abs(exit.x)).toBeGreaterThanOrEqual(13.5); expect(exit.z).toBeGreaterThanOrEqual(9.5);
  expect(exit.retries).toBeLessThan(3); expect(exit.journey).toBeLessThan(45);
});
