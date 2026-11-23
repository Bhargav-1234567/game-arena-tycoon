import test from 'node:test';
import assert from 'node:assert/strict';
import { Scene, Vector3, Group } from 'three';
import { GridSystem } from '../../src/systems/GridSystem.ts';
import { PlacementSystem } from '../../src/systems/PlacementSystem.ts';
import { EconomySystem } from '../../src/systems/EconomySystem.ts';
import { StaffSystem } from '../../src/systems/StaffSystem.ts';
import { Workforce } from '../../src/systems/Workforce.ts';
import { CustomerSystem } from '../../src/systems/CustomerSystem.ts';
import { GamingStation } from '../../src/entities/GamingStation.ts';
import { Customer } from '../../src/entities/Customer.ts';
import { ReceptionDesk, RECEPTION_TIERS } from '../../src/entities/ReceptionDesk.ts';
import { FacilityEntity, VENDING_TIERS } from '../../src/entities/FacilityEntity.ts';
import { geometryFor } from '../../src/systems/LayoutGeometry.ts';
import { BUILDABLE_ITEMS } from '../../src/data/assets.ts';
import { BUS_PASSENGERS, NAVIGATION, ROOM_FOOTPRINTS } from '../../src/data/world-layout.ts';
import { NeighborhoodScene } from '../../src/systems/NeighborhoodScene.ts';
import { pcUpgrades } from '../../src/data/pc-upgrades.ts';
import { AssetManager } from '../../src/services/AssetManager.ts';
import { chairUpgrades } from '../../src/data/chair-upgrades.ts';

const item = (id: string) => BUILDABLE_ITEMS.find((entry) => entry.id === id)!;
function setup() {
  const scene = new Scene(), grid = new GridSystem(), economy = new EconomySystem();
  grid.setZoneUnlocked(-6, 5, -2, 7);
  const placement = new PlacementSystem(scene, grid, economy);
  return { scene, grid, economy, placement, collision: placement.collisionSystem };
}
function stationAt(placement: PlacementSystem, x = -4, z = 0, rotation = 0) {
  const station = new GamingStation(`pc_${placement.stations.size}`, x, z, rotation);
  station.group.position.set(x + (rotation % 2 ? .5 : 1), 0, z + (rotation % 2 ? 1 : .5));
  station.updateLayout(); placement.stations.set(station.id, station);
  (placement as any).reserve(item('station_bundle'), x, z, rotation, station.id);
  (placement as any).configureStation(station);
  placement.refreshLayout();
  return station;
}

test('L01/L02: every rotated PC reserves its chair and rejects off-floor access', () => {
  const { placement } = setup();
  stationAt(placement);
  assert.match(placement.validateGeometry(geometryFor(item('plant_indoor'), -3, 1, 0)), /reserved|chair/);
  assert.match(placement.validateGeometry(geometryFor(item('station_bundle'), -1, -2, 2)), /inside/);
  for (let rotation = 0; rotation < 4; rotation++) {
    const geometry = geometryFor(item('station_bundle'), 0, 0, rotation, 'pc', 4, 4);
    assert.equal((geometry.reserved.maxX - geometry.reserved.minX) * (geometry.reserved.maxZ - geometry.reserved.minZ), 6);
    const approach = geometry.access[0];
    assert.ok(approach.x >= geometry.reserved.minX && approach.x <= geometry.reserved.maxX);
    assert.ok(approach.z >= geometry.reserved.minZ && approach.z <= geometry.reserved.maxZ);
  }
});

test('L03: the entrance and existing service routes stay connected', () => {
  const { placement } = setup();
  stationAt(placement);
  for (const x of [-1, 0]) assert.match(placement.validateGeometry(geometryFor(item('plant_indoor'), x, 7, 0)), /entrance/);
  // A sealed physical wall is rejected even when its catalog reservation does not cover a PC.
  const candidate = geometryFor(item('plant_indoor'), 0, 4, 0);
  candidate.reserved = { minX: -6, maxX: 6, minZ: 4, maxZ: 5 };
  candidate.solids = [{ ...candidate.reserved, id: 'barrier', type: 'wall' }];
  assert.match(placement.validateGeometry(candidate), /block access/);
});

test('L05/L06: impossible paths and blocked endpoints return no route', () => {
  const { grid } = setup();
  grid.setOccupied(-6, 3, 12, 1, true, 'wall');
  assert.deepEqual(grid.findPath(new Vector3(0, 0, 0), new Vector3(0, 0, 5)), []);
  assert.deepEqual(grid.findPath(new Vector3(0, 0, 0), new Vector3(0, 0, 3.5)), []);
});

test('L07/L08: all returned path segments have radius clearance; desk stays solid for its owner', () => {
  const { placement, grid, collision } = setup();
  const station = stationAt(placement, 0, 0);
  const start = new Vector3(-1.5, 0, 1.5), end = new Vector3(3.5, 0, 1.5);
  const blocked = collision.createNavigationQuery(.32);
  const path = grid.findPath(start, end, blocked);
  assert.ok(path.length);
  let previous = start;
  for (const waypoint of path) { assert.equal(blocked(previous, waypoint), false); previous = waypoint; }
  assert.equal(collision.isPointBlocked(1, .5, .28, station.id), true);
  assert.ok(collision.getObstacles(station.id).some((obstacle) => obstacle.type === 'desk'));
  assert.equal(collision.getObstacles(station.id).some((obstacle) => obstacle.type === 'chair'), false);
});

test('L04: an impossible arrival releases the PC without paying for an unplayed session', () => {
  const { placement, grid, collision } = setup();
  const station = stationAt(placement);
  const customer = new Customer('blocked'); customer.gridSystem = grid; customer.collisionSystem = collision;
  customer.group.position.set(0, 0, 6);
  customer.assignedStation = station; station.currentGamerId = customer.id; station.isOccupied = true;
  let paid = 0; customer.onPayment = () => paid++;
  customer.moveTo(new Vector3(-3, 0, .5), 'WALKING_TO_STATION');
  for (let tick = 0; tick < 80; tick++) customer.update(.1);
  assert.equal(station.isOccupied, false); assert.equal(station.currentGamerId, undefined);
  assert.equal(customer.assignedStation, undefined); assert.notEqual(customer.state, 'WALKING_TO_STATION'); assert.equal(paid, 0);
});

test('L09/L10: assigned PCs cannot move; hidden moving PCs neither collide nor accept assignments', async () => {
  const { placement, collision } = setup(); const station = stationAt(placement);
  station.isOccupied = true; station.currentGamerId = 'walking_customer';
  await placement.startMoveStation(station);
  assert.equal(placement.isMovingItem, false); assert.equal(station.group.visible, true);
  station.isOccupied = false; station.currentGamerId = undefined; station.group.visible = false;
  assert.equal(placement.getAvailableStation(), null);
  assert.equal(collision.getObstacles().some((obstacle) => obstacle.id.startsWith(station.id)), false);
});

test('L11: reception validates staff space and releasing overlapping legacy owners preserves other furniture', () => {
  const { placement, grid } = setup();
  grid.setOccupied(-2, -1, 1, 1, true, 'plant');
  assert.match(placement.validateGeometry(geometryFor(item('reception_counter'), -2, 0, 0)), /reserved/);
  grid.setOccupied(-2, -1, 4, 4, true, 'legacy_counter');
  grid.releaseOwner('legacy_counter');
  assert.equal(grid.getCell(-2, -1)?.occupied, true); assert.equal(grid.getCell(-2, -1)?.occupantId, 'plant');
  assert.equal(grid.canOccupy(-2, -1), false);
});

test('L12: all reception queue points must be inside and reachable', () => {
  const { placement } = setup();
  assert.match(placement.validateGeometry(geometryFor(item('reception_counter'), -6, -2, 2)), /route|inside/);
  assert.equal(placement.validateGeometry(geometryFor(item('reception_counter'), -2, 2, 0)), '');
});

test('L13: waiting queues retarget on layout changes and the playable receptionist stays in place', () => {
  const { scene, placement, economy } = setup(); const system = new CustomerSystem(scene, placement, economy);
  const desk = new ReceptionDesk('desk', -2, 2); desk.group.position.set(0, 0, 3.5); placement.receptionDesks.set(desk.id, desk);
  const customer = new Customer('queue'); customer.state = 'WAITING_CHECKIN'; customer.targetDesk = desk;
  customer.group.position.copy(desk.getCustomerQueuePosition());
  (system as any).deskQueues.set(desk.id, [customer]); (system as any).customers.set(customer.id, customer);
  system.player.enabled = true; system.player.group.position.copy(desk.getStaffPosition());
  desk.gridX = 0; desk.group.position.x = 2; placement.layoutRevision++;
  system.update(.01);
  assert.equal((customer as any).targetPosition.x, 2);
  assert.equal(system.player.group.position.x, 0); assert.equal(system.activeDesk, undefined);
});

test('L14: rotated walls use matching visual and collision orientation', () => {
  const wall = BUILDABLE_ITEMS.find((entry) => entry.id.startsWith('wall_') && entry.height > 1)!;
  const first = geometryFor(wall, -4, -1, 0).solids[0], rotated = geometryFor(wall, -4, -1, 1).solids[0];
  assert.ok(first.maxZ - first.minZ > first.maxX - first.minX);
  assert.ok(rotated.maxX - rotated.minX > rotated.maxZ - rotated.minZ);
});

test('L15: every visible expansion cell is usable, including all 528 final cells', () => {
  const { grid } = setup();
  for (const bounds of ROOM_FOOTPRINTS) {
    grid.setZoneUnlocked(bounds.minX, bounds.maxX - 1, bounds.minZ, bounds.maxZ - 1);
    let count = 0;
    for (let x = bounds.minX; x < bounds.maxX; x++) for (let z = bounds.minZ; z < bounds.maxZ; z++) {
      assert.equal(grid.getCell(x, z)?.isUnlocked, true); count++;
    }
    assert.equal(count, (bounds.maxX - bounds.minX) * (bounds.maxZ - bounds.minZ));
  }
  assert.ok(grid.findPath(new Vector3(0, 0, 7), new Vector3(13.5, 0, -13.5)).length);
});

test('L16: delayed component upgrade commits once, with no charge or tier change while loading', async () => {
  const station = new GamingStation('upgrade', 0, 0), manager = AssetManager.getInstance();
  const original = manager.loadModel;
  let resolve!: (model: Group) => void;
  manager.loadModel = () => new Promise<Group>((done) => { resolve = done; });
  let charges = 0;
  try {
    const first = station.upgradePC(pcUpgrades[1], () => { charges++; return true; });
    await assert.rejects(station.upgradePC(pcUpgrades[1], () => { charges++; return true; }));
    assert.equal(charges, 0); assert.equal(station.currentPC.level, 1);
    resolve(new Group()); await first;
    assert.equal(charges, 1); assert.equal(station.currentPC.level, 2); assert.equal(station.isUpgrading, false);
  } finally { manager.loadModel = original; }
});

test('failed station, reception and facility upgrades keep cash and current tiers', async () => {
  const manager = AssetManager.getInstance(), original = manager.loadModel;
  manager.loadModel = async () => { throw new Error('Network unavailable'); };
  let charges = 0; const commit = () => { charges++; return true; };
  const station = new GamingStation('pc', 0, 0), desk = new ReceptionDesk('desk', 0, 0), facility = new FacilityEntity('vendor', 'vending', 0, 0);
  try {
    await assert.rejects(station.upgradePC(pcUpgrades[1], commit));
    await assert.rejects(desk.upgrade(RECEPTION_TIERS[1], commit));
    await assert.rejects(facility.upgrade(VENDING_TIERS[1], commit));
    assert.equal(charges, 0); assert.equal(station.currentPC.level, 1); assert.equal(desk.currentTier.level, 1); assert.equal(facility.currentTier.level, 1);
  } finally { manager.loadModel = original; }
});

test('L17/L18: technicians and cashier/counter upgrades apply the advertised benefits', () => {
  const { scene, placement, economy } = setup(); const staff = new StaffSystem(economy), station = stationAt(placement);
  placement.getTechnicianMultiplier = () => staff.getTechnicianMultiplier();
  const base = station.getSatisfactionScore(); staff.hire('technician'); assert.equal(station.getSatisfactionScore(), Math.round(base * 1.25));
  staff.fire('technician'); assert.equal(station.getSatisfactionScore(), base);
  const system = new CustomerSystem(scene, placement, economy), desk = new ReceptionDesk('service', -2, 2);
  system.getCashierMultiplier = () => staff.getCashierMultiplier();
  assert.equal(system.getCheckInSeconds(desk), 2);
  staff.hire('receptionist'); assert.equal(system.getCheckInSeconds(desk), 2 / 1.35);
  desk.currentTier = RECEPTION_TIERS[1]; assert.equal(system.getCheckInSeconds(desk), 2 / (1.35 * 1.25));
});

test('L19: session billing follows the displayed clock and pays exactly once', () => {
  const station = new GamingStation('billing', 0, 0), customer = new Customer('paid'), economy = new EconomySystem();
  customer.assignedStation = station; station.isOccupied = true; station.currentGamerId = customer.id; customer.state = 'GAMING';
  const payments: number[] = []; customer.onPayment = (amount) => payments.push(amount);
  const start = economy.timeMinutes; economy.update(20); customer.finishSession(); customer.finishSession();
  assert.deepEqual(payments, [Math.round(station.getHourlyRevenue() * (economy.timeMinutes - start) / 60)]);
  assert.equal(customer.state, 'UNSEATING'); assert.equal(station.isOccupied, true);
  customer.update(.7); assert.equal(station.isOccupied, true);
  customer.update(1.3); assert.equal(station.isOccupied, false);
});

test('building unrelated furniture does not restart a waiting customer\'s service timer', () => {
  const { scene, placement, economy, grid } = setup(); const station = stationAt(placement);
  const desk = new ReceptionDesk('busy_counter', -2, 2); desk.group.position.set(0, 0, 3.5); placement.receptionDesks.set(desk.id, desk);
  const system = new CustomerSystem(scene, placement, economy), customer = new Customer('waiting_while_building');
  customer.gridSystem = grid; customer.collisionSystem = placement.collisionSystem;
  customer.state = 'WAITING_CHECKIN'; customer.group.position.copy(desk.getCustomerQueuePosition()); customer.targetDesk = desk;
  (system as any).customers.set(customer.id, customer); (system as any).deskQueues.set(desk.id, [customer]);
  system.player.enabled = true;
  system.player.group.position.copy(desk.getStaffPosition());
  for (let tick = 0; tick < 22; tick++) { placement.layoutRevision++; system.update(.1); }
  assert.equal(customer.state, 'WAITING_PC');
  assert.equal(system.assignStation(station), true);
  assert.equal(customer.assignedStation, station); assert.equal(customer.state, 'WALKING_TO_STATION');
});

test('occupied chair/desk changes fail before preparing a model or charging cash', async () => {
  const { placement } = setup(), station = stationAt(placement), manager = AssetManager.getInstance();
  const original = manager.loadModel; let loads = 0, charges = 0;
  manager.loadModel = async () => { loads++; return new Group(); };
  station.isOccupied = true;
  try {
    const { chairUpgrades } = await import('../../src/data/chair-upgrades.ts');
    const { deskUpgrades } = await import('../../src/data/desk-upgrades.ts');
    await assert.rejects(station.upgradeChair(chairUpgrades[1], () => { charges++; return true; }), /customer/);
    await assert.rejects(station.upgradeDesk(deskUpgrades[1], () => { charges++; return true; }), /customer/);
    assert.equal(loads, 0); assert.equal(charges, 0); assert.equal(station.currentChair.level, 1); assert.equal(station.currentDesk.level, 1);
  } finally { manager.loadModel = original; }
});

test('failed placement model preparation retains cash and creates no partial entity', async () => {
  const { placement, economy } = setup(), manager = AssetManager.getInstance(), original = manager.loadModel;
  manager.loadModel = async () => { const fallback = new Group(); fallback.userData.assetFallback = true; return fallback; };
  try {
    await placement.setBuildItem(item('station_bundle'));
    placement.updateHover(new Vector3(-3.8, 0, .2)); const cash = economy.cash;
    assert.equal(await placement.tryPlace(), false);
    assert.equal(economy.cash, cash); assert.equal(placement.stations.size, 0); assert.equal(placement.busy, false);
    assert.match(placement.validationMessage, /cash has been kept/);
  } finally { manager.loadModel = original; }
});

test('chair entry and exit choose a clear side and keep the customer inside perimeter walls in every rotation', () => {
  for (const [x, z, rotation] of [[-6, 0, 0], [-6, -2, 1], [3, 5, 2], [5, 1, 3]]) {
    const { placement, grid, collision } = setup(), station = stationAt(placement, x, z, rotation);
    station.currentChair = chairUpgrades[3]; station.updateLayout(); placement.refreshLayout();
    const customer = new Customer(`edge_${rotation}`); customer.gridSystem = grid; customer.collisionSystem = collision;
    customer.assignedStation = station; station.isOccupied = true; station.currentGamerId = customer.id;
    customer.group.position.copy(station.getApproachWorldPosition());
    customer.moveTo(station.getApproachWorldPosition(), 'WALKING_TO_STATION'); customer.update(1 / 60);
    for (let frame = 0; frame < 150 && customer.state !== 'GAMING'; frame++) {
      customer.update(1 / 60);
      assert.equal(collision.isOutsideWorld(customer.group.position.x, customer.group.position.z, .28), false, `entry rotation ${rotation}`);
    }
    assert.equal(customer.state, 'GAMING'); assert.ok(customer.group.position.distanceTo(station.getSeatingWorldPosition()) < .001);
    customer.finishSession();
    for (let frame = 0; frame < 150 && customer.state === 'UNSEATING'; frame++) {
      customer.update(1 / 60);
      assert.equal(collision.isOutsideWorld(customer.group.position.x, customer.group.position.z, .28), false, `exit rotation ${rotation}`);
    }
    assert.equal(customer.state, 'LEAVING'); assert.equal(station.isOccupied, false);
  }
});

test('all 12 facility designs have reachable rotated anchors and pay once after completed use', () => {
  for (const type of ['sofa', 'vending', 'arcade'] as const) for (let level = 1; level <= 4; level++) {
    for (let rotation = 0; rotation < 4; rotation++) {
      const { placement, grid, collision } = setup();
      const facility = new FacilityEntity('fixture', type, 0, 2, rotation, level);
      const geometry = geometryFor(item(type + '_lvl1'), 0, 2, rotation, facility.id, undefined, undefined, level);
      facility.group.position.set(geometry.center.x, 0, geometry.center.z);
      placement.facilities.set(facility.id, facility);
      const approach = facility.getApproachPosition();
      assert.ok(Math.hypot(approach.x - geometry.access[0].x, approach.z - geometry.access[0].z) < 1e-8);
      assert.ok(placement.routeTo(approach).length, `${type} level ${level}, rotation ${rotation}`);
      const customer = new Customer('visitor');
      customer.gridSystem = grid; customer.collisionSystem = collision;
      customer.group.position.set(-2, 0, 5);
      const payments: number[] = [];
      customer.onFacilityPayment = (amount) => payments.push(amount);
      assert.ok(customer.visitFacility(facility));
      assert.equal(new Customer('other').visitFacility(facility), false);
      assert.equal(facility.completeUse(customer.id), 0);
      let interacted = false;
      for (let tick = 0; tick < 650 && customer.facility; tick++) {
        customer.update(.05);
        if (facility.inUse) {
          interacted = true;
          assert.ok(customer.group.position.distanceTo(facility.getUsePosition()) < .002);
          assert.deepEqual(payments, []);
        }
      }
      assert.ok(interacted);
      assert.equal(customer.state, 'LEAVING');
      assert.equal(facility.reservedBy, undefined);
      assert.equal(facility.completeUse(customer.id), 0);
      assert.deepEqual(payments, type === 'sofa' ? [] : [facility.currentTier.pricePerUse]);
      assert.ok(customer.group.position.distanceTo(approach) < .002);
    }
  }
});

test('unreachable, interrupted and reserved facilities cannot charge or move under a visitor', async () => {
  const { placement, collision, grid } = setup();
  const machine = new FacilityEntity('vendor', 'vending', 0, 2);
  machine.group.position.set(.5, 0, 2.5);
  placement.facilities.set(machine.id, machine);
  const visitor = new Customer('visitor');
  visitor.onFacilityPayment = () => assert.fail('Unexpected charge');
  visitor.gridSystem = grid; visitor.collisionSystem = collision;
  visitor.group.position.set(-20, 0, 2);
  assert.equal(visitor.visitFacility(machine), false);
  assert.equal(machine.reservedBy, undefined);
  visitor.group.position.copy(machine.getApproachPosition());
  assert.ok(visitor.visitFacility(machine));
  visitor.update(.1);
  assert.ok(machine.inUse);
  await placement.startMoveFacility(machine);
  assert.equal(placement.isMovingItem, false);
  await assert.rejects(machine.upgrade(VENDING_TIERS[1]), /visitor/);
  visitor.update(1);
  visitor.leave();
  visitor.update(5);
  assert.equal(machine.reservedBy, undefined);
  assert.equal(machine.completeUse(visitor.id), 0);
});

test('each bus unloads a full crowd even when the lounge is full; waiting passengers leave if no space opens', async (t) => {
  const { scene, placement, economy } = setup();
  const district = new NeighborhoodScene(scene), bus = new Group();
  (district as any).bus = bus;
  const system = new CustomerSystem(scene, placement, economy);
  const customers: Map<string, Customer> = (system as any).customers;
  const places = new Set<string>();
  for (let i = 0; i < 6; i++) {
    const existing = new Customer('existing-' + i);
    customers.set(existing.id, existing);
  }
  t.mock.method(Customer.prototype, 'build', async function (this: Customer, point: Vector3) {
    this.group.position.copy(point);
  });
  let unloaded = 0;
  district.onBusPassenger = async (index) => {
    assert.equal((district as any).busPhase, 'stopped');
    assert.equal(index, unloaded % BUS_PASSENGERS);
    await system.spawnBusPassenger(index);
    unloaded++;
  };
  for (let run = 1; run <= 2; run++) {
    district.arriveBus();
    let peakCrossing = 0, peakWaiting = 0;
    // Include the farthest waiting spot and the longer of the two sidewalk exits.
    for (let frame = 0; frame < 900; frame++) {
      district.update(.1); system.update(.1);
      await Promise.resolve();
      peakCrossing = Math.max(peakCrossing, system.getCrossingCount());
      const outside = [...customers.values()].filter((c) => c.state === 'WAITING_OUTSIDE');
      peakWaiting = Math.max(peakWaiting, outside.length);
      for (const visitor of outside) places.add(visitor.group.position.x.toFixed(1));
      for (const c of customers.values()) {
        const { x, z } = c.group.position;
        if (z > 12.8 && z < 18.8) assert.ok(Math.abs(x - NAVIGATION.doorX) < .5);
      }
    }
    assert.equal(unloaded, BUS_PASSENGERS * run);
    assert.equal((district as any).busPhase, 'away');
    assert.ok(peakCrossing >= 5);
    assert.equal(peakWaiting, BUS_PASSENGERS);
    assert.equal(places.size, BUS_PASSENGERS);
    assert.equal(customers.size, 6);
  }
});

test('two counters retain independent FIFO heads and paused timers with one player', () => {
  const {scene,placement,economy} = setup();
  const system = new CustomerSystem(scene,placement,economy);
  system.player.enabled = true;
  const desks = [new ReceptionDesk('north',0,0),new ReceptionDesk('east',0,0)];
  desks[1].group.position.x = 4;
  for (const desk of desks) {
    placement.receptionDesks.set(desk.id,desk);
    const customer = new Customer(desk.id);
    customer.targetDesk = desk; customer.state = 'WAITING_CHECKIN';
    customer.group.position.copy(desk.getCustomerQueuePosition());
    (system as any).customers.set(customer.id, customer);
    (system as any).deskQueues.set(desk.id, [customer]);
  }
  const stand = (i: number) => system.player.group.position.copy(desks[i].getStaffPosition());
  stand(0); for (let i=0;i<10;i++) system.update(.1);
  const first = (system as any).serviceTimers.get('north').elapsed;
  stand(1); for (let i=0;i<24;i++) system.update(.1);
  assert.deepEqual(system.pending.map(c => c.id),['east']);
  assert.equal((system as any).serviceTimers.get('north').elapsed,first);
  stand(0); for (let i=0;i<14;i++) system.update(.1);
  assert.deepEqual(system.pending.map(c => c.id),['east','north']);
});

test('stock and wear require completed visits and manual service requires an operator at the machine', () => {
  const {scene,placement,economy} = setup();
  const system = new CustomerSystem(scene,placement,economy), ops = system.operations;
  const pc = stationAt(placement);
  const vendor = new FacilityEntity('v','vending',0,3), arcade = new FacilityEntity('a','arcade',3,2);
  placement.facilities.set(vendor.id,vendor); placement.facilities.set(arcade.id,arcade);
  for (const [machine,uses] of [[vendor,4],[arcade,3]] as const) {
    for (let i=0;i<uses;i++) {
      assert.ok(machine.reserve('guest'));
      assert.equal(machine.completeUse('guest'),0);
      machine.inUse=true;
      assert.ok(machine.completeUse('guest')>0);
      assert.equal(machine.completeUse('guest'),0);
      machine.release('guest');
    }
    assert.equal(machine.reserve('extra'),false);
  }
  pc.sessionsSinceService=4;
  ops.update(2,placement,vendor.getApproachPosition());
  ops.update(2,placement);
  assert.equal(vendor.stock,0); assert.equal(pc.needsService,true);
  ops.update(1,placement,vendor.getApproachPosition());
  assert.equal(vendor.stock,4); assert.equal(pc.needsService,true); assert.equal(arcade.needsService,true);
  ops.update(5,placement,pc.getApproachWorldPosition()); assert.equal(pc.needsService,false);
  ops.update(5,placement,arcade.getApproachPosition()); assert.equal(arcade.needsService,false);
});

test('waiting on a sofa keeps the PC reservation through standing and pays one matched performance bonus', () => {
  const {scene,placement,economy,grid,collision} = setup();
  const system = new CustomerSystem(scene,placement,economy), pc=stationAt(placement);
  system.hasPerformancePart=()=>true;
  const sofa = new FacilityEntity('couch','sofa',2,4); sofa.group.position.set(3,0,4.5);
  placement.facilities.set(sofa.id,sofa);
  const guest = new Customer('first');
  guest.gridSystem=grid; guest.collisionSystem=collision;
  guest.group.position.copy(sofa.getApproachPosition());
  guest.waitingForPc=guest.wantsPerformance=true;
  assert.ok(guest.visitFacility(sofa));
  for(let i=0;i<170;i++) guest.update(.1);
  assert.equal(sofa.inUse,true); assert.equal(guest.state,'USING_FACILITY');
  system.pending.push(guest); assert.ok(system.assignStation(pc));
  assert.equal(sofa.reservedBy,guest.id); assert.equal(pc.currentGamerId,guest.id);
  const payments: number[]=[]; guest.onPayment=amount=>payments.push(amount);
  for(let i=0;i<550;i++) guest.update(.1);
  assert.equal(sofa.reservedBy,undefined); assert.equal(pc.isOccupied,false);
  assert.deepEqual(payments,[Math.round(pc.getHourlyRevenue()*20/15*1.25)]);
});

test('player movement stops at the counter, the entrance boundary, and while controls are suspended', () => {
  const {scene,placement,economy,collision} = setup();
  const system = new CustomerSystem(scene,placement,economy);
  const desk = new ReceptionDesk('test_counter',-2,2);
  desk.group.position.set(0,0,3.5); placement.receptionDesks.set(desk.id,desk);
  const player = system.player; player.enabled = true;
  player.group.position.copy(desk.getStaffPosition());
  player.input.set(-1,1);
  for(let i=0;i<40;i++) {
    player.update(.05,collision,false);
    const {x,z} = player.group.position;
    assert.equal(collision.isPointBlocked(x,z,.23),false);
  }
  assert.ok(player.group.position.z > desk.getStaffPosition().z);
  assert.ok(player.group.position.z < desk.group.position.z);
  player.group.position.set(0,0,7);
  for(let i=0;i<30;i++) player.update(.05,collision,false);
  assert.ok(player.group.position.z <= collision.roomBounds.maxZ-.23);
  const before=player.group.position.clone(); player.onDuty=false; player.input.set(1,0);
  player.update(.1,collision,false); assert.ok(player.group.position.equals(before));
});


test('cleaners reserve separate reachable jobs and retry blocked litter when a route opens', () => {
  const {scene,placement,economy}=setup(), staff=new StaffSystem(economy);
  const system=new CustomerSystem(scene,placement,economy);
  const workforce=new Workforce(scene,placement,staff,system.operations);
  staff.hire('janitor'); staff.hire('janitor');
  for (const e of staff.employees) {
    const group=new Group(); group.position.set(0,0,6);
    const avatar={ready:true,group,animate() {},dispose() {}};
    e.x=0; e.z=6;
    workforce.workers.set(e.id,{avatar,status:'On call',arrived:false,duty:false,path:[],revision:-1,retry:0,entering:false} as any);
  }
  const blocked={id:'spill_under_desk',kind:'spill' as const,x:-3,z:.5,delay:0};
  const pc=stationAt(placement);
  workforce.litter=[blocked,{id:'spill_at_door',kind:'spill',x:0,z:6,delay:0}];
  workforce.update(.1);
  assert.equal(staff.employees.filter(e=>e.job?.target==='spill_at_door').length,1);
  assert.equal(staff.employees.filter(e=>e.job?.target===blocked.id).length,0);
  assert.ok([...workforce.workers.values()].some(w=>w.status.startsWith('Blocked')));
  pc.group.visible=false;
  placement.refreshLayout();
  for(let i=0;i<400 && workforce.litter.length;i++) workforce.update(.05);
  assert.equal(workforce.litter.length,0);
  assert.equal(system.operations.shift.jobs,2);
  assert.deepEqual(staff.employees.map(e=>e.jobs).sort(),[1,1]);
});

test('uncollected litter is capped both locally and across the lounge', () => {
  const {scene,placement,economy}=setup(),staff=new StaffSystem(economy);
  const workforce=new Workforce(scene,placement,staff,new CustomerSystem(scene,placement,economy).operations);
  const origin=new Vector3(0,0,6);
  for(let i=0;i<8;i++) workforce.drop('cup',origin);
  assert.equal(workforce.litter.length,2);
  for(let x=-5;x<=5;x+=2.5) for(let z=-1;z<=7;z+=2.5) {
    for(let i=0;i<3;i++) workforce.drop('wrapper',new Vector3(x,0,z));
  }
  assert.equal(workforce.litter.length,24);
});


test('a receptionist can move between counters without finishing a guest remotely or duplicating progress', () => {
  const {scene,placement,economy} = setup();
  const system = new CustomerSystem(scene,placement,economy);
  const staff = new StaffSystem(economy);
  const workforce = new Workforce(scene,placement,staff,system.operations);
  system.workforce = workforce;
  system.getCashierMultiplier = desk => workforce.cashierRate(desk);
  const internals = system as any;
  internals.spawnInterval = Infinity;
  system.getSpawnInterval = () => Infinity;
  const first = new ReceptionDesk('north',-5,2), second = new ReceptionDesk('east',1,2);
  for (const desk of [first,second]) desk.group.position.set(desk.gridX+2,0,desk.gridZ+1.5);
  for (const desk of [first,second]) placement.receptionDesks.set(desk.id,desk);
  staff.hire('receptionist');
  const employee = staff.employees[0], group = new Group();
  group.position.set(0,0,6);
  workforce.workers.set(employee.id,{avatar:{group,ready:true,animate() {},dispose() {}},status:'',path:[],
    retry:0,revision:-1,arrived:false,duty:false,entering:false} as any);
  const guest = new Customer('waiting');
  guest.group.position.copy(first.getCustomerQueuePosition());
  guest.targetDesk = first;
  guest.state = 'WAITING_CHECKIN';
  internals.customers.set(guest.id,guest);
  internals.deskQueues.set(first.id,[guest]);
  internals.observedLayout=placement.layoutRevision;
  const tick = () => system.update(.05);
  assert.equal(workforce.assignReceptionist('missing-counter',employee.id),false);
  assert.equal(workforce.assignReceptionist(first.id,employee.id),true);
  tick();
  assert.equal(internals.serviceTimers.get(first.id).elapsed,0);
  for(let i=0;i<200 && !internals.serviceTimers.get(first.id).elapsed;i++) tick();
  const progress=internals.serviceTimers.get(first.id).elapsed;
  assert.ok(progress>0);
  workforce.assignReceptionist(second.id,employee.id);
  assert.equal(workforce.receptionistAt(first),undefined);
  for(let i=0;i<120;i++) tick();
  assert.equal(internals.serviceTimers.get(first.id).elapsed,progress);
  assert.equal(employee.jobs,0);
  assert.equal(workforce.receptionistAt(second)?.id,employee.id,workforce.workers.get(employee.id)?.status);
  workforce.assignReceptionist(first.id,employee.id);
  for(let i=0;i<200 && !system.pending.length;i++) tick();
  assert.equal(employee.jobs,1);
  assert.deepEqual(system.pending.map(c=>c.id),['waiting']);
  for(let i=0;i<50;i++) tick();
  assert.equal(employee.jobs,1);
});

test('legacy cashier preferences migrate to exclusive, existing counters without charging for hires', () => {
  const {scene,placement,economy}=setup(),staff=new StaffSystem(economy);
  const workforce=new Workforce(scene,placement,staff,new CustomerSystem(scene,placement,economy).operations);
  const desk=new ReceptionDesk('front',0,2);
  placement.receptionDesks.set(desk.id,desk);
  staff.hire('receptionist'); staff.hire('receptionist');
  const [implicit,explicit]=staff.employees;
  implicit.priority='auto';
  implicit.job={kind:'assist',stage:'work',target:desk.id,elapsed:0};
  explicit.priority=desk.id;
  const cash=economy.cash;
  workforce.restoreCounterAssignments();
  assert.equal(explicit.priority,desk.id);
  assert.equal(implicit.priority,'unassigned');
  assert.equal(implicit.job,undefined);
  explicit.priority='missing-desk';
  implicit.priority='auto';
  implicit.job={kind:'assist',stage:'work',target:desk.id,elapsed:0};
  workforce.restoreCounterAssignments();
  assert.equal(implicit.priority,desk.id);
  assert.equal(explicit.priority,'unassigned');
  assert.equal(economy.cash,cash);
});
