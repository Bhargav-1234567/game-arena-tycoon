import test from 'node:test';
import assert from 'node:assert/strict';
import { SaveManager } from '../../src/services/SaveManager.ts';
import type { GameSaveState } from '../../src/services/SaveManager.ts';
import { newWorkshopState } from '../../src/systems/WorkshopSystem.ts';

const KEY = 'gaming_zone_tycoon_save_v1';
function storage() {
  const data = new Map<string, string>();
  return { getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); } };
}
function snapshot(): GameSaveState {
  return { version: 2, timestamp: 1000, economy: { cash: 400, reputation: 75, day: 2, timeMinutes: 800 },
    stations: [{ id: 'pc_a', gridX: 0, gridZ: 0, rotationIndex: 1, pcLevel: 2, chairLevel: 1,
      monitorLevel: 1, deskLevel: 1, keyboardLevel: 1, mouseLevel: 1, speakerLevel: 1 }],
    facilities: [], receptions: [], objects: [], staff: [{ id: 'receptionist', hiredCount: 1 }],
    workshop: newWorkshopState(), expansionCount: 6 };
}

test('full state round-trips through browser storage including assignments and diamonds', () => {
  const save = new SaveManager(storage()), state = snapshot();
  state.workshop.parts = [{ id: 'part_a', partId: 'gpu_t4', stationId: 'pc_a' }];
  state.workshop.diamonds = 42;
  assert.equal(save.save(state), true); assert.deepEqual(save.load(), state);
});

test('version 1 migrates without changing PC IDs, tiers or cash', () => {
  const memory = storage(), legacy = snapshot(); legacy.version = 1;
  const raw = { ...legacy } as Partial<GameSaveState>; delete raw.workshop; delete raw.receptions;
  memory.setItem(KEY, JSON.stringify(raw));
  const restored = new SaveManager(memory).load()!;
  assert.equal(restored.version, 2); assert.deepEqual(restored.stations, legacy.stations);
  assert.equal(restored.economy.cash, 400); assert.equal(restored.workshop.diamonds, 100);
  assert.equal(restored.receptions, undefined);
});

test('corrupt and future saves are retained rather than silently starting over', () => {
  const memory = storage(), save = new SaveManager(memory);
  for (const raw of ['invalid-json', JSON.stringify({ ...snapshot(), version: 99 })]) {
    memory.setItem(KEY, raw); assert.throws(() => save.load()); assert.equal(memory.getItem(KEY), raw);
  }
});

test('invalid station references, duplicate IDs and nonfinite values cannot overwrite a valid save', () => {
  const memory = storage(), save = new SaveManager(memory), valid = snapshot(); save.save(valid);
  const orphan = snapshot(); orphan.workshop.parts = [{ id: 'part_a', partId: 'gpu_t1', stationId: 'missing' }];
  assert.equal(save.save(orphan), false);
  const duplicate = snapshot(); duplicate.stations.push({ ...duplicate.stations[0] });
  assert.equal(save.save(duplicate), false);
  const infinity = snapshot(); infinity.economy.cash = Infinity; assert.equal(save.save(infinity), false);
  assert.deepEqual(save.load(), valid);
});

test('storage failures report failure, and reset removes the entire shared save', () => {
  const memory = storage(), save = new SaveManager(memory); save.save(snapshot());
  assert.equal(save.hasSave(), true); save.clear(); assert.equal(save.load(), null);
  const blocked = new SaveManager({ ...memory, setItem() { throw new Error('Quota exceeded'); } });
  assert.equal(blocked.save(snapshot()), false);
});

test('a stale tab cannot overwrite newer diamonds or inventory', () => {
  const memory = storage(), first = new SaveManager(memory), second = new SaveManager(memory);
  const initial = snapshot(); first.save(initial); second.load();
  const updated = snapshot(); updated.workshop.diamonds = 95; first.save(updated);
  const stale = snapshot(); stale.workshop.diamonds = 500;
  assert.equal(second.save(stale), false); assert.equal(first.load()!.workshop.diamonds, 95);
});
