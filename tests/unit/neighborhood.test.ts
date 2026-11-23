import test from 'node:test';
import assert from 'node:assert/strict';
import { NeighborhoodSystem, newNeighborhoodState, FRONTAGE_PRICES } from '../../src/systems/NeighborhoodSystem.ts';
import { DISTRICT_PLACES, RESERVED_PROPERTY, ROOM_FOOTPRINTS, overlaps, lightPeriod } from '../../src/data/world-layout.ts';

function setup() {
  const system = new NeighborhoodSystem(); let cash = 10000, reputation = 0;
  system.getCash = () => cash;
  system.persist = (_state, amount, rep) => { cash += amount; reputation += rep; return true; };
  return { system, cash: () => cash, reputation: () => reputation };
}

test('every expansion fits reserved land and all neighboring buildings stay outside it', () => {
  for (const bounds of ROOM_FOOTPRINTS) {
    assert.ok(bounds.minX >= RESERVED_PROPERTY.minX && bounds.maxX <= RESERVED_PROPERTY.maxX);
    assert.ok(bounds.minZ >= RESERVED_PROPERTY.minZ && bounds.maxZ <= RESERVED_PROPERTY.maxZ);
  }
  for (const place of DISTRICT_PLACES) if (place.footprint) assert.equal(overlaps(place.footprint, RESERVED_PROPERTY), false, place.id);
});
test('storefront has three paid visual tiers, reputation increases and a hard cap', () => {
  const { system, cash, reputation } = setup();
  for (let i = 0; i < 3; i++) system.upgradeFrontage();
  assert.equal(system.state.frontageLevel, 3); assert.equal(cash(), 10000 - FRONTAGE_PRICES.reduce((a, b) => a + b));
  assert.equal(reputation(), 6); assert.throws(() => system.upgradeFrontage(), /fully upgraded/);
});
test('cafe partnership is paid once, improves satisfaction, and persists on reload', () => {
  const { system, cash } = setup(); system.partnerCafe();
  assert.equal(cash(), 9250); assert.equal(system.getSatisfactionBonus(), 5);
  assert.throws(() => system.partnerCafe(), /already active/);
  assert.equal(new NeighborhoodSystem(system.state).getSatisfactionBonus(), 5);
});
test('tournament grants once after three paid customer visits and can start a new run', () => {
  const { system, cash, reputation } = setup(); system.startEvent();
  system.recordCustomer(); system.recordCustomer(); assert.equal(cash(), 10000);
  system.recordCustomer(); system.recordCustomer();
  assert.equal(system.state.event!.status, 'won'); assert.equal(system.state.eventsWon, 1);
  assert.equal(cash(), 10500); assert.equal(reputation(), 5);
  system.startEvent(); assert.equal(system.state.event!.served, 0);
});
test('expired tournaments grant no reward and their saved timer resumes', () => {
  const { system, cash } = setup(); system.startEvent(); system.update(119);
  const restored = new NeighborhoodSystem(system.state); restored.update(1); restored.recordCustomer();
  assert.equal(restored.state.event!.status, 'expired'); assert.equal(cash(), 10000);
});
test('bus arrives on schedule and caller-controlled pause does not advance time', () => {
  const { system } = setup(); let arrivals = 0; system.onBusArrival = () => { arrivals++; };
  system.update(23); assert.equal(arrivals, 0); system.update(1); assert.equal(arrivals, 1);
  system.update(0); assert.equal(system.state.busIn, 60); system.update(60); assert.equal(arrivals, 2);
});
test('invalid names, insufficient cash and persistence failures cannot change upgrades', () => {
  const { system } = setup(); system.rename('Darshan & Friends'); assert.equal(system.state.shopName, 'Darshan & Friends');
  assert.throws(() => system.rename('<script>'), /2–28/);
  system.getCash = () => 1; assert.throws(() => system.upgradeFrontage(), /Not enough/);
  system.getCash = () => 10000; system.persist = () => false; const before = system.state;
  assert.throws(() => system.partnerCafe(), /Could not save/); assert.deepEqual(system.state, before);
});
test('lighting cycle and visitor demand follow bounded rules', () => {
  assert.deepEqual([lightPeriod(8 * 60), lightPeriod(18 * 60), lightPeriod(23 * 60)], ['day', 'evening', 'night']);
  const { system } = setup(); assert.ok(system.getSpawnInterval(100) < system.getSpawnInterval(0));
  system.setLighting('auto'); assert.equal(system.getLighting(19 * 60), 'evening');
  const invalid = newNeighborhoodState(); invalid.frontageLevel = 4;
  assert.throws(() => new NeighborhoodSystem(invalid), /invalid/);
});
