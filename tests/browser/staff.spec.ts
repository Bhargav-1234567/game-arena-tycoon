import { test, expect, type Page } from '@playwright/test';

async function openLounge(page: Page) {
  await page.route(/\/src\/main\.ts(?:\?.*)?$/, async route => {
    const response=await route.fetch();
    await route.fulfill({response,body:(await response.text()).replace('const game = new Game(canvas, uiContainer);',
      'const game = new Game(canvas, uiContainer); window.staffGame = game;')});
  });
  await page.goto('/');
  await ready(page);
  await page.locator('button[data-view="lounge"]').click();
  await page.waitForFunction(()=>!(window as any).staffGame.cameraController.isTransitioning);
  await freeze(page);
}
async function ready(page:Page) {
  await expect(page.locator('body')).toHaveAttribute('data-game-ready','true',{timeout:60000});
}
async function freeze(page:Page) {
  await page.evaluate(()=>{
    const g=(window as any).staffGame, s=g.customerSystem;
    g.clock.getDelta=()=>0; s.getSpawnInterval=()=>Infinity; s.spawnInterval=Infinity;
    (window as any).tickStaff=(seconds:number)=>{
      for(let i=0;i<Math.round(seconds*20);i++) s.update(.05);
      g.receptionUI.render(s,g.placementSystem,g.cameraController.camera);
    };
  });
}
async function step(page:Page,seconds:number) {
  await page.evaluate(n=>(window as any).tickStaff(n),seconds);
}
async function hire(page:Page,roles:string[]) {
  await page.getByRole('button',{name:/Management/}).click();
  for(const role of roles) await page.locator('.hire-btn[data-role="'+role+'"]').click();
  await page.waitForFunction(()=>[...(window as any).staffGame.workforce.workers.values()].every((w:any)=>w.avatar.ready));
}
test('hired people repair, operate reception and restock with individual pay, reservations and a saved mid-repair',async({page},info)=>{
  const errors:string[]=[]; page.on('pageerror',e=>errors.push(e.message));
  await openLounge(page);
  const before=await page.evaluate(()=>(window as any).staffGame.economySystem.cash);
  await hire(page,['technician','attendant','receptionist']);
  const tech=page.locator('.employee-card').filter({hasText:'Technician'});
  await expect(tech).toContainText('Raise to $40/hr · 5.0 → 4.0 s');
  await tech.locator('[data-raise]').click();
  await tech.locator('select').selectOption({label:'PC 2'});
  await tech.locator('[data-locate]').click();
  const setup=await page.evaluate(()=>{
    const g=(window as any).staffGame, s=g.customerSystem,p=g.placementSystem;
    const pcs=[...p.stations.values()] as any[], vendor=[...p.facilities.values()].find((f:any)=>f.type==='vending') as any;
    pcs.forEach(pc=>pc.sessionsSinceService=4); vendor.salesSinceRefill=4;
    const tech=g.staffSystem.employees.find((e:any)=>e.role==='technician');
    return {cash:g.economySystem.cash,techId:tech.id,seed:tech.seed,pc:pcs[1].id,names:g.staffSystem.employees.map((e:any)=>e.name),
      avatars:[...g.workforce.workers.values()].map((w:any)=>[w.avatar.ready,w.avatar.group.name]),revenue:s.operations.shift.vending};
  });
  expect(setup.cash).toBe(before-350-180-150);
  expect(setup.names).toHaveLength(3);expect(new Set(setup.names).size).toBe(3);
  expect(setup.avatars.every(([ready,name]:[boolean,string])=>ready && name.startsWith('Employee_'))).toBe(true);
  await step(page,.15);
  expect(await page.evaluate(()=>(window as any).staffGame.staffSystem.employees.every((e:any)=>e.jobs===0))).toBe(true);
  const snapshot=await page.evaluate(()=>{
    const g=(window as any).staffGame,e=g.staffSystem.employees.find((e:any)=>e.role==='technician'),w=g.workforce.workers.get(e.id);
    const attendant=g.staffSystem.employees.find((e:any)=>e.role==='attendant'), a=g.workforce.workers.get(attendant.id);
    const poses=new Set<string>();
    for(let i=0;i<900 && !(w.avatar.pose==='Repair' && e.job.elapsed>=1);i++){
      (window as any).tickStaff(.05);poses.add(a.avatar.pose);
    }
    const pc=g.placementSystem.stations.get(e.priority);
    if(w.avatar.pose!=='Repair') throw new Error(JSON.stringify({status:w.status,position:[e.x,e.z],pc:pc.group.position,job:e.job}));
    const state={pose:w.avatar.pose,poses:[...poses],job:{...e.job},owner:pc.serviceOwner,distance:w.avatar.group.position.distanceTo(w.goal),
      kit:w.avatar.tools.kit.visible,progress:w.progress,save:g.save(),cash:g.economySystem.cash};
    return state;
  });
  expect(snapshot.job.target).toBe(setup.pc);expect(snapshot.owner).toBe(setup.techId);
  expect(snapshot.distance).toBeLessThan(.07);expect(snapshot.kit).toBe(true);
  expect(snapshot.progress).toBeGreaterThan(0);expect(snapshot.save).toBe(true);
  await page.screenshot({path:info.outputPath('staff-working.png')});
  await page.reload();await ready(page); await freeze(page);
  await page.waitForFunction(()=>[...(window as any).staffGame.workforce.workers.values()].every((w:any)=>w.avatar.ready));
  const restored=await page.evaluate(()=>{
    const g=(window as any).staffGame, e=g.staffSystem.employees.find((e:any)=>e.role==='technician');
    return {id:e.id,seed:e.seed,raises:e.raises,priority:e.priority,elapsed:e.job?.elapsed,cash:g.economySystem.cash};
  });
  expect(restored).toMatchObject({id:setup.techId,seed:setup.seed,raises:1,priority:setup.pc,cash:snapshot.cash});
  expect(restored.elapsed).toBeGreaterThanOrEqual(snapshot.job.elapsed-.001);
  const result=await page.evaluate(()=>{
    const g=(window as any).staffGame, s=g.customerSystem, p=g.placementSystem;
    const employee=(role:string)=>g.staffSystem.employees.find((e:any)=>e.role===role);
    const tech=employee('technician'), attendant=employee('attendant'), cashier=employee('receptionist');
    const aw=g.workforce.workers.get(attendant.id);
    const pcs=[...p.stations.values()] as any[],vendor=[...p.facilities.values()].find((f:any)=>f.type==='vending') as any;
    const desk=p.receptionDesks.values().next().value;
    const poses=new Set<string>(),remaining=tech.job.elapsed;
    let repairTime=0,afterFirst=0;
    for(let i=0;i<480;i++) {
      (window as any).tickStaff(.05);
      if(!afterFirst){repairTime+=.05;if(!pcs[1].needsService){afterFirst=1;s.player.group.position.copy(pcs[0].getApproachWorldPosition());}}
      poses.add(aw.avatar.pose);
    }
    const away={duration:s.getCheckInSeconds(desk),pending:s.pending.length,helped:cashier.jobs};
    return {repairTime,remaining,techJobs:tech.jobs,refills:attendant.jobs,stock:vendor.stock,capacity:vendor.capacity,
      poses:[...poses],away,broken:pcs.filter(pc=>pc.needsService).length,
      sales:s.operations.shift.vending, downtime:s.operations.shift.downtime,jobs:s.operations.shift.jobs};
  });
  expect(result.repairTime).toBeCloseTo((5-result.remaining)/1.25,0);
  expect(result.broken).toBe(0);expect(result.techJobs).toBe(1);expect(result.refills).toBe(1);
  expect(result.stock).toBe(result.capacity);expect(result.sales).toBe(setup.revenue);
  expect([...snapshot.poses,...result.poses]).toEqual(expect.arrayContaining(['Collect','CarryCrate','Restock']));
  expect(result.away).toEqual({duration:2,pending:0,helped:0});
  expect(result.downtime).toBeGreaterThan(0);expect(result.jobs).toBe(2);
  await page.getByRole('button',{name:/Management/}).click();
  const assignment=page.getByLabel('Assigned counter');
  await expect(assignment).toHaveValue('unassigned');
  await assignment.selectOption({label:'Counter 1'});
  await page.getByRole('button',{name:'Close management'}).click();
  const reception=await page.evaluate(()=>{
    const g=(window as any).staffGame,s=g.customerSystem;
    const cashier=g.staffSystem.employees.find((e:any)=>e.role==='receptionist');
    const worker=g.workforce.workers.get(cashier.id);
    let progress=0;
    for(let i=0;i<320 && !cashier.jobs;i++){
      (window as any).tickStaff(.05);
      if(worker.avatar.pose==='Assist') progress=Math.max(progress,worker.progress??0);
    }
    return {progress, jobs:cashier.jobs, playerAtCounter:!!s.activeDesk,
      reserved:[...g.placementSystem.stations.values()].filter((pc:any)=>pc.isOccupied).length};
  });
  expect(reception).toMatchObject({jobs:1,playerAtCounter:false,reserved:1});
  expect(reception.progress).toBeGreaterThan(0);
  await page.evaluate(()=>{const g=(window as any).staffGame;g.staffSystem.update(15);});
  await page.getByRole('button',{name:/Management/}).click();
  await expect(page.locator('[data-current-shift]')).toContainText('Staff jobs 3');
  await expect(page.locator('[data-current-shift]')).toContainText(/Wages paid \$[1-9]/);
  await page.screenshot({path:info.outputPath('management-roster.png')});
  await info.attach('staff-results.json',{body:JSON.stringify(result),contentType:'application/json'});
  expect(errors).toEqual([]);
});

test('a completed drink creates delayed litter, a custodian carries and mops, and guests use a placed bin',async({page},info)=>{
  await openLounge(page);
  const waste=await page.evaluate(async()=>{
    const g=(window as any).staffGame,s=g.customerSystem,w=g.workforce;
    const vendor=[...g.placementSystem.facilities.values()].find((f:any)=>f.type==='vending') as any;
    const visitor=await s.createCustomer('drink',vendor.getApproachPosition());
    if(!visitor.visitFacility(vendor)) throw new Error('Could not reserve vendor');
    s.addCustomer(visitor);
    const oldRandom=Math.random; Math.random=()=>.6;
    try {
      for(let i=0;i<400 && !w.litter.length;i++) s.update(.05);
      const dirt=w.litter[0];
      if(!dirt) throw new Error('No litter after purchase');
      const origin=vendor.getApproachPosition(),early=w.patienceRate(origin);
      (window as any).tickStaff(4);
      return {early,near:w.patienceRate(origin),far:w.patienceRate(origin.clone().set(-4,0,5)),kind:dirt.kind,sales:s.operations.shift.vending,delay:dirt.delay};
    } finally{Math.random=oldRandom;}
  });
  expect(waste).toMatchObject({early:1,near:1.35,far:1,kind:'cup',delay:0});expect(waste.sales).toBeGreaterThan(0);
  await hire(page,['janitor']);
  const card=page.locator('.employee-card').filter({hasText:'Cleaner'});
  await card.locator('select').selectOption('sofas');
  await card.locator('[data-locate]').click();
  const carried=await page.evaluate(()=>{
    const g=(window as any).staffGame,e=g.staffSystem.employees[0],w=g.workforce.workers.get(e.id);
    const poses=new Set<string>();
    for(let i=0;i<600 && w.avatar.pose!=='CarryBag';i++){(window as any).tickStaff(.05);poses.add(w.avatar.pose);}
    return {poses:[...poses],stage:e.job?.stage,bag:w.avatar.tools.bag.visible,save:g.save(),id:e.id};
  });
  expect(carried.poses).toEqual(expect.arrayContaining(['PickUp','CarryBag']));expect(carried.stage).toBe('dispose');
  expect(carried.bag).toBe(true);expect(carried.save).toBe(true);
  await page.reload();await ready(page);await freeze(page);
  await page.waitForFunction(()=>[...(window as any).staffGame.workforce.workers.values()].every((w:any)=>w.avatar.ready));
  const cleaned=await page.evaluate(()=>{
    const g=(window as any).staffGame, wf=g.workforce,e=g.staffSystem.employees[0],w=wf.workers.get(e.id);
    const pos=w.avatar.group.position.clone().set(0,0,6.5);
    const poses=new Set<string>();
    for(let i=0;i<900 && e.jobs===0;i++){(window as any).tickStaff(.05);poses.add(w.avatar.pose);}
    const disposed=wf.litter.length;
    wf.drop('spill',pos);
    for(let i=0;i<900 && wf.litter.length;i++){(window as any).tickStaff(.05);poses.add(w.avatar.pose);}
    (window as any).tickStaff(.1);
    return {disposed,poses:[...poses],jobs:e.jobs,near:wf.patienceRate(pos),litter:wf.litter.length};
  });
  expect(cleaned).toMatchObject({disposed:0,jobs:2,near:1,litter:0});
  expect(cleaned.poses).toEqual(expect.arrayContaining(['CarryBag','Dispose','Mop']));
  const bin=await page.evaluate(async()=>{
    const g=(window as any).staffGame,p=g.placementSystem,w=g.workforce,s=g.customerSystem;
    const {BUILDABLE_ITEMS}=await import('/src/data/assets.ts');
    const vendor=[...p.facilities.values()].find((f:any)=>f.type==='vending') as any;
    const origin=vendor.getApproachPosition(),item=BUILDABLE_ITEMS.find((i:any)=>i.id==='waste_bin');
    p.setBuildItem(item);
    for(const [dx,dz] of [[-1,0],[-1,1],[0,1],[-2,0],[0,-1],[1,0],[-2,1]]) {
      const at=origin.clone().set(Math.floor(origin.x)+dx+.05,0,Math.floor(origin.z)+dz+.05);
      p.updateHover(at);
      if(await p.tryPlace()) break;
    }
    p.setBuildItem(undefined);
    if(!w.nearbyBin(origin)) throw new Error('No reachable bin near vending machine: '+p.validationMessage);
    const c=await s.createCustomer('bin',origin);
    if(!c.visitFacility(vendor)) throw new Error('Vendor busy');
    s.addCustomer(c);
    const states=new Set<string>(),oldRandom=Math.random;Math.random=()=>.5;
    try { for(let i=0;i<600 && c.state!=='DESPAWNED';i++){s.update(.05);states.add(c.state);} }
    finally{Math.random=oldRandom;}
    const save=g.save();
    return {states:[...states],count:w.litter.length,save,items:JSON.parse(localStorage.getItem('gaming_zone_tycoon_save_v1')!).objects.map((o:any)=>o.itemId)};
  });
  expect(bin.states).toEqual(expect.arrayContaining(['WALKING_TO_BIN','USING_BIN','DESPAWNED']));
  expect(bin.count).toBe(0);expect(bin.save).toBe(true);expect(bin.items).toContain('waste_bin');
  await info.attach('cleaning-results.json',{body:JSON.stringify({waste,cleaned,bin}),contentType:'application/json'});
});


test('staff service all four tiers of rotated vending and arcade machines',async({page},info)=>{
  await openLounge(page);
  const key='gaming_zone_tycoon_save_v1';
  const fixture=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),key);
  fixture.expansionCount=2;
  fixture.facilities=[
    {id:'test-vendor',itemId:'vending',gridX:-4,gridZ:-4,rotationIndex:1,level:1},
    {id:'test-arcade',itemId:'arcade',gridX:5,gridZ:-4,rotationIndex:3,level:1}
  ];
  fixture.neighborhood.view='lounge';
  await page.addInitScript(({key,fixture})=>{
    if(!sessionStorage.getItem('staff-facilities')){
      sessionStorage.setItem('staff-facilities','1');localStorage.setItem(key,JSON.stringify(fixture));
    }
  },{key,fixture});
  await page.reload();await ready(page);await freeze(page);
  await hire(page,['technician','attendant']);
  await page.getByRole('button',{name:'Close management'}).click();
  for(let tier=1;tier<=4;tier++){
    const service=await page.evaluate(async tier=>{
      const g=(window as any).staffGame,s=g.customerSystem;
      const {ARCADE_TIERS,VENDING_TIERS}=await import('/src/entities/FacilityEntity.ts');
      const vendor=g.placementSystem.facilities.get('test-vendor'),arcade=g.placementSystem.facilities.get('test-arcade');
      if(tier>1){
        // Allow staff to leave the old service positions before enlarging the cabinets.
        (window as any).tickStaff(20);
        await vendor.upgrade(VENDING_TIERS[tier-1]);await arcade.upgrade(ARCADE_TIERS[tier-1]);
      }
      vendor.salesSinceRefill=vendor.capacity;arcade.playsSinceService=3;
      const employee=(role:string)=>g.staffSystem.employees.find((e:any)=>e.role===role);
      const aw=g.workforce.workers.get(employee('attendant').id),tw=g.workforce.workers.get(employee('technician').id);
      let hatchOpened=false,repairedAtCabinet=false,carried=false;
      for(let i=0;i<800 && (vendor.stock<vendor.capacity || arcade.needsService);i++){
        s.update(.05);
        const panel=aw.avatar.tools.panel;
        if(aw.avatar.pose==='CarryCrate') carried=aw.avatar.tools.crate.visible;
        if(aw.avatar.pose==='Restock' && panel.visible && panel.rotation.y < -.5){
          hatchOpened=panel.parent===vendor.group && Math.abs(panel.position.z-vendor.layout.halfDepth)<.02
            && aw.avatar.group.position.distanceTo(vendor.getApproachPosition())<.07;
        }
        if(tw.avatar.pose==='Repair') repairedAtCabinet=tw.avatar.group.position.distanceTo(arcade.getApproachPosition())<.07;
      }
      return {hatchOpened,repairedAtCabinet,carried,stock:vendor.stock,capacity:vendor.capacity,broken:arcade.needsService,
        visits:s.operations.shift.vending+s.operations.shift.arcade,jobs:[employee('attendant').jobs,employee('technician').jobs]};
    },tier);
    expect(service).toMatchObject({hatchOpened:true,repairedAtCabinet:true,carried:true,broken:false,visits:0,jobs:[tier,tier]});
    expect(service.stock).toBe(service.capacity);
    await info.attach('tier-'+tier+'.json',{body:JSON.stringify(service),contentType:'application/json'});
  }
});


test('two assigned receptionists independently run both counters and keep their posts after reload',async({page},info)=>{
  await openLounge(page);
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  const key='gaming_zone_tycoon_save_v1';
  const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),key);
  saved.expansionCount=2;
  saved.receptions.push({id:'east-counter',gridX:5,gridZ:-4,rotationIndex:0,level:2});
  saved.facilities=[];
  await page.addInitScript(({key,saved})=>{
    if(sessionStorage.getItem('two-desks')) return;
    sessionStorage.setItem('two-desks','yes');localStorage.setItem(key,JSON.stringify(saved));
  },{key,saved});
  await page.reload();await ready(page);await freeze(page);
  expect(await page.evaluate(()=>(window as any).staffGame.workforce.workers.size)).toBe(0);
  await hire(page,['receptionist','receptionist']);
  const assignments=page.getByLabel('Assigned counter');
  await expect(assignments).toHaveCount(2);
  await expect(assignments.nth(0)).toHaveValue('unassigned');
  await expect(assignments.nth(1)).toHaveValue('unassigned');
  await page.getByRole('button',{name:'Close management'}).click();
  const target=await page.evaluate(()=>{
    const g=(window as any).staffGame,d=g.placementSystem.receptionDesks.get('east-counter');
    const cam=g.cameraController;
    cam.setCenter(d.group.position);cam.update(1);
    const projected=d.group.localToWorld(d.group.position.clone().set(0,.9,0)).project(cam.camera);
    return {x:(projected.x+1)*innerWidth/2,y:(1-projected.y)*innerHeight/2, id:g.workforce.receptionists[1].id};
  });
  if(info.project.name==='mobile') await page.touchscreen.tap(target.x,target.y);
  else await page.mouse.click(target.x,target.y);
  const counterSelect=page.getByLabel('Assigned receptionist');
  await counterSelect.selectOption(target.id);
  await expect(counterSelect).toHaveValue(target.id);
  await page.locator('#close-inspector-btn').click();
  // The initial guest queued at the unattended first desk. The second desk invites them across.
  await step(page,32);
  expect(await page.evaluate(()=>(window as any).staffGame.workforce.receptionists.map((e:any)=>e.jobs))).toEqual([0,1]);
  await page.getByRole('button',{name:/Management/}).click();
  await assignments.nth(0).selectOption({label:'Counter 1'});
  await page.getByRole('button',{name:'Close management'}).click();
  await step(page,26);
  const run=await page.evaluate(async()=>{
    const g=(window as any).staffGame,s=g.customerSystem,p=g.placementSystem;
    const desks=[...p.receptionDesks.values()] as any[],cashiers=g.workforce.receptionists;
    const before=cashiers.map((e:any)=>e.jobs);
    for(const desk of desks){
      const guest=await s.createCustomer('two-counters',desk.getCustomerQueuePosition());
      if(!s.assignVisit(guest)) throw new Error('Guest could not reach reception');
      s.addCustomer(guest);
    }
    let simultaneous=false;
    for(let i=0;i<160;i++){
      (window as any).tickStaff(.05);
      if(cashiers.every((e:any)=>{const w=g.workforce.workers.get(e.id);return w.avatar.pose==='Assist' && w.progress>0;})) simultaneous=true;
    }
    const customers=[...s.customers.values()].filter((c:any)=>c.id.startsWith('two-counters')) as any[];
    return {simultaneous,playerPresent:!!s.activeDesk,before,after:cashiers.map((e:any)=>e.jobs),
      stationIds:customers.map(c=>c.assignedStation?.id),cashiers:cashiers.map((e:any)=>[e.id,e.priority]),saved:g.save()};
  });
  expect(run.before[0]+run.before[1]).toBe(1);
  expect(run.simultaneous).toBe(true);expect(run.playerPresent).toBe(false);
  expect(run.after).toEqual(run.before.map((n:number)=>n+1));
  expect(run.stationIds).toHaveLength(2);expect(run.stationIds.every(Boolean)).toBe(true);
  expect(new Set(run.stationIds).size).toBe(2);expect(run.saved).toBe(true);
  await page.reload();await ready(page);await freeze(page);
  await page.getByRole('button',{name:/Management/}).click();
  await expect(assignments.nth(1)).toHaveValue('east-counter');
  await expect(assignments.nth(0)).toHaveValue(run.cashiers[0][1]);
  await assignments.nth(1).selectOption(run.cashiers[0][1]);
  await expect(assignments.nth(0)).toHaveValue('unassigned');
  await expect(assignments.nth(1)).toHaveValue(run.cashiers[0][1]);
  await assignments.nth(1).selectOption('unassigned');
  await page.getByRole('button',{name:'Close management'}).click();
  await step(page,22);
  expect(await page.evaluate(()=>(window as any).staffGame.workforce.receptionists.map((e:any)=>e.jobs))).toEqual(run.after);
  await info.attach('independent-counters.json',{body:JSON.stringify(run),contentType:'application/json'});
  expect(errors).toEqual([]);
});


test('players can hire all three roles and a receptionist runs the first PC session hands-free',async({page},info)=>{
  const errors:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',message=>{if(message.type()==='error') errors.push(message.text());});
  await page.goto(process.env.LOUNGE_TEST_URL ?? '/');
  await ready(page);
  const readSave=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('gaming_zone_tycoon_save_v1')!));
  expect((await readSave()).workforce.employees).toHaveLength(0);
  await page.locator('button[data-view="lounge"]').click();
  await page.getByRole('button',{name:/Management/}).click();
  await page.getByRole('button',{name:'Hire staff',exact:true}).click();
  for(const label of ['Hire Cleaner ($100)','Hire Technician ($350)','Hire Receptionist ($150)']){
    await page.getByRole('button',{name:label,exact:true}).click();
  }
  const assignment=page.getByLabel('Assigned counter');
  await expect(assignment).toHaveValue('unassigned');
  await assignment.selectOption({label:'Counter 1'});
  const staff=(await readSave()).workforce.employees;
  const receptionist=staff.find((e:any)=>e.role==='receptionist');
  expect(staff.map((e:any)=>e.role).sort()).toEqual(['janitor','receptionist','technician']);
  expect(receptionist.priority).toBe((await readSave()).receptions[0].id);
  await page.getByRole('button',{name:'Close management'}).click();
  await expect(page.locator('.reception-hint')).toContainText('Reception staffed',{timeout:60000});
  await expect(page.getByRole('progressbar',{name:'Gaming',exact:true}).first()).toBeVisible({timeout:60000});
  await page.screenshot({path:info.outputPath('receptionist-running-lounge.png')});
  await expect.poll(async()=>{
    const employee=(await readSave()).workforce.employees.find((e:any)=>e.id===receptionist.id);
    return employee.jobs;
  },{timeout:30000}).toBeGreaterThan(0);
  await page.reload();await ready(page);
  await page.getByRole('button',{name:/Management/}).click();
  await expect(assignment).toHaveValue(receptionist.priority);
  await assignment.scrollIntoViewIfNeeded();
  await page.screenshot({path:info.outputPath('assigned-receptionist.png')});
  expect(errors).toEqual([]);
});
