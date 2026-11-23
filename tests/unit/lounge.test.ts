import test from 'node:test';
import assert from 'node:assert/strict';
import { Scene, Vector3, Group } from 'three';
import { GridSystem } from '../../src/systems/GridSystem.ts';
import { PlacementSystem } from '../../src/systems/PlacementSystem.ts';
import { EconomySystem } from '../../src/systems/EconomySystem.ts';
import { StaffSystem } from '../../src/systems/StaffSystem.ts';
import { CustomerSystem } from '../../src/systems/CustomerSystem.ts';
import { GamingStation } from '../../src/entities/GamingStation.ts';
import { Customer } from '../../src/entities/Customer.ts';
import { ReceptionDesk, RECEPTION_TIERS } from '../../src/entities/ReceptionDesk.ts';
import { FacilityEntity, VENDING_TIERS } from '../../src/entities/FacilityEntity.ts';
import { geometryFor } from '../../src/systems/LayoutGeometry.ts';
import { BUILDABLE_ITEMS } from '../../src/data/assets.ts';
import { ROOM_FOOTPRINTS } from '../../src/data/world-layout.ts';
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

test('L13: waiting queues retarget on layout changes and the same receptionist is relocated', () => {
  const { scene, placement, economy } = setup(); const system = new CustomerSystem(scene, placement, economy);
  const desk = new ReceptionDesk('desk', -2, 2); desk.group.position.set(0, 0, 3.5); placement.receptionDesks.set(desk.id, desk);
  const customer = new Customer('queue'); customer.state = 'WAITING_CHECKIN'; customer.targetDesk = desk;
  customer.group.position.copy(desk.getCustomerQueuePosition());
  (system as any).deskQueues.set(desk.id, [customer]); (system as any).customers.set(customer.id, customer);
  const staff = { group: new Group(), mixer: { update() {} } }; system.receptionists.set(desk.id, staff as any);
  desk.gridX = 0; desk.group.position.x = 2; placement.layoutRevision++;
  system.update(.01);
  assert.equal((customer as any).targetPosition.x, 2);
  assert.equal(system.receptionists.get(desk.id), staff); assert.equal(staff.group.position.x, 2);
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
  for (let tick = 0; tick < 22; tick++) { placement.layoutRevision++; system.update(.1); }
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
