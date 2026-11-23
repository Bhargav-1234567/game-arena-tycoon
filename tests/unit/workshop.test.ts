import test from 'node:test';
import assert from 'node:assert/strict';
import { WorkshopSystem, newWorkshopState, rewardChangeCost } from '../../src/systems/WorkshopSystem.ts';
import { getLevel, PIECES } from '../../src/puzzle/catalog.ts';
import type { WorkshopState } from '../../src/systems/WorkshopSystem.ts';

const setup = (state = newWorkshopState()) => {
  const system = new WorkshopSystem(state); system.persist = () => true;
  system.stationExists = (id) => ['pc_a', 'pc_b'].includes(id);
  return system;
};

function winningState(): WorkshopState {
  const system = setup(); system.start();
  const state = system.state, session = state.session!;
  session.collected = getLevel(1).targetCount - 1; session.movesLeft = 1;
  session.board.cells.forEach((cell, i) => Object.assign(cell, {
    piece: PIECES[(Math.floor(i / 7) + i % 7) % 6], special: 'none', obstacle: 'none'
  }));
  [0, 1, 9].forEach((i) => { session.board.cells[i].piece = 'power'; });
  session.board.cells[2].piece = 'ram';
  return state;
}

test('reward-change charges are 5, 10, 20, then 25 forever', () => {
  assert.deepEqual(Array.from({ length: 7 }, (_, i) => rewardChangeCost(i)), [5, 10, 20, 25, 25, 25, 25]);
  const state = newWorkshopState(); state.diamonds = 1000;
  const system = setup(state); system.start();
  for (let i = 0; i < 7; i++) {
    const before = system.state.diamonds;
    system.changeReward(i % 2 ? 'cpu_t1' : 'gpu_t1');
    assert.equal(before - system.state.diamonds, rewardChangeCost(i));
  }
  assert.equal(system.state.parts.length, 0);
});

test('insufficient funds, same reward, wrong tier and unknown parts cannot charge', () => {
  const state = newWorkshopState(); state.diamonds = 4;
  const system = setup(state); system.start(); const before = system.state;
  assert.throws(() => system.changeReward('gpu_t1'), /need 5/);
  assert.throws(() => system.changeReward(before.session!.rewardPartId), /different/);
  assert.throws(() => system.changeReward('gpu_t4'), /tier/);
  assert.throws(() => system.changeReward('fake'), /Unknown/);
  assert.deepEqual(system.state, before);
});

test('win on final move grants exactly one selected part and five diamonds', () => {
  const system = setup(winningState()); system.changeReward('gpu_t1');
  const before = system.state.diamonds;
  system.play(2, 9);
  assert.equal(system.state.session!.status, 'won');
  assert.equal(system.state.parts.length, 1); assert.equal(system.state.parts[0].partId, 'gpu_t1');
  assert.equal(system.state.diamonds, before + 5); assert.equal(system.state.highestUnlocked, 2);
  const won = system.state;
  assert.throws(() => system.play(2, 9), /no longer/);
  assert.throws(() => system.changeReward('cpu_t1'), /before winning/);
  assert.throws(() => setup(won).play(2, 9), /no longer/);
  assert.deepEqual(system.state, won);
  system.start(); assert.equal(system.state.session!.changeCount, 0); assert.equal(system.state.session!.level, 2);
});

test('six-point lifelines rotate independently of score and survive reloads', () => {
  const rotation = ['mouse', 'cpu', 'cooling', 'gpu', 'mouse', 'cpu', 'cooling', 'gpu'] as const;
  for (let index = 0; index < rotation.length; index++) {
    const state = winningState(); state.completed = [1]; state.charge = 5; state.lifelinesEarned = index;
    state.session!.score = index * 1700 + 400;
    const system = setup(state), result = system.play(2, 9);
    assert.equal(result.lifelineReward, rotation[index]); assert.equal(system.state.boosters[rotation[index]], 3);
    assert.equal(system.state.lifelinesEarned, index + 1);
    assert.equal(setup(system.state).state.lifelinesEarned, index + 1);
    assert.ok(system.state.charge < 6);
  }
});

test('first clears award the catalog booster once while replays can still earn hardware', () => {
  const system = setup(winningState()), result = system.play(2, 9);
  assert.equal(result.firstClearReward, 'mouse'); assert.equal(system.state.boosters.mouse, 3);
  const replay = winningState(); replay.completed = [1];
  const second = setup(replay), replayResult = second.play(2, 9);
  assert.equal(replayResult.firstClearReward, undefined); assert.equal(second.state.boosters.mouse, 2);
  assert.equal(second.state.parts.length, 1);
});

test('old saves without a rotation counter retain inventory and start the next rotation at Free Move', () => {
  const state = winningState(); delete state.lifelinesEarned; state.charge = 5; state.completed = [1];
  const system = setup(state), result = system.play(2, 9);
  assert.equal(result.lifelineReward, 'mouse'); assert.equal(system.state.lifelinesEarned, 1);
  const malformed = system.state; malformed.lifelinesEarned = -1;
  assert.throws(() => setup(malformed), /invalid/);
});

test('failure awards nothing; retry and reload preserve offer and price counter', () => {
  const state = winningState(); state.session!.collected = 0;
  const system = setup(state); system.changeReward('gpu_t1');
  system.play(2, 9);
  assert.equal(system.state.session!.status, 'lost'); assert.equal(system.state.parts.length, 0);
  assert.throws(() => system.start(), /Finish or retry/);
  const restored = setup(system.state); restored.retry();
  assert.equal(restored.state.session!.changeCount, 1); assert.equal(restored.state.session!.rewardPartId, 'gpu_t1');
  assert.equal(restored.state.diamonds, 95); assert.equal(restored.state.session!.movesLeft, 20);
});

test('inventory attachment, replacement and detachment conserve ownership across PCs', () => {
  const state = newWorkshopState();
  state.parts = [1, 2, 3].map((id) => ({ id: `gpu_${id}`, partId: id === 3 ? 'gpu_t2' : 'gpu_t1', stationId: null }));
  const system = setup(state);
  system.attach('gpu_1', 'pc_a', 'gpu'); system.attach('gpu_2', 'pc_b', 'gpu');
  assert.equal(system.state.parts.filter((part) => !part.stationId).length, 1);
  assert.throws(() => system.attach('gpu_1', 'pc_b', 'gpu'), /no longer available/);
  assert.throws(() => system.attach('gpu_3', 'missing', 'gpu'), /no longer exists/);
  assert.throws(() => system.attach('gpu_3', 'pc_a', 'cpu'), /does not fit/);
  system.attach('gpu_3', 'pc_a', 'gpu');
  assert.equal(system.state.parts.find((part) => part.id === 'gpu_1')!.stationId, null);
  system.detach('gpu_3', 'pc_a');
  assert.equal(system.state.parts.length, 3);
  assert.equal(system.state.parts.filter((part) => !part.stationId).length, 2);
  assert.throws(() => system.detach('gpu_3', 'pc_a'), /no longer attached/);
});

test('failed persistence rolls back reward changes, board moves, completion and equipment', () => {
  const system = setup(winningState()); const before = system.state;
  system.persist = () => false;
  assert.throws(() => system.changeReward('gpu_t1'), /Could not save/);
  assert.throws(() => system.play(2, 9), /Could not save/);
  assert.deepEqual(system.state, before);
  const inventory = newWorkshopState(); inventory.parts = [{ id: 'owned', partId: 'gpu_t1', stationId: null }];
  const equipment = setup(inventory); equipment.persist = () => false;
  assert.throws(() => equipment.attach('owned', 'pc_a', 'gpu'), /Could not save/);
  assert.deepEqual(equipment.state, inventory);
});

test('mutating a returned snapshot cannot alter the real inventory', () => {
  const system = setup(); system.state.diamonds = 100000;
  assert.equal(system.state.diamonds, 100);
});

test('malformed balances, duplicate instances and duplicate PC slots are rejected', () => {
  const invalid = newWorkshopState(); invalid.diamonds = -1;
  assert.throws(() => setup(invalid), /invalid/);
  const duplicate = newWorkshopState(); duplicate.parts = [1, 2].map(() => ({ id: 'same', partId: 'gpu_t1', stationId: null }));
  assert.throws(() => setup(duplicate), /duplicate/);
  duplicate.parts[1].id = 'other'; duplicate.parts.forEach((part) => { part.stationId = 'pc_a'; });
  assert.throws(() => setup(duplicate), /same slot/);
});

test('each new replay can earn a fresh copy, but cannot select a locked level', () => {
  const system = setup(winningState()); system.play(2, 9);
  assert.throws(() => system.start(100), /locked/);
  system.start(1); assert.equal(system.state.session!.level, 1); assert.equal(system.state.parts.length, 1);
});

test('invalid move never spends a lifeline or changes saved state', () => {
  const system = setup(winningState());
  const before = system.state;
  assert.throws(() => system.play(0, 48), /neighboring/);
  assert.deepEqual(system.state, before);
});

test('exact diamond balance can pay a change without becoming negative', () => {
  const state = newWorkshopState(); state.diamonds = 5;
  const system = setup(state); system.start(); system.changeReward('gpu_t1');
  assert.equal(system.state.diamonds, 0);
  assert.throws(() => system.changeReward('cpu_t1'), /need 10/);
  assert.equal(system.state.session!.changeCount, 1);
});

test('2,000 mixed equipment operations preserve every copy and one part per slot', () => {
  const state = newWorkshopState();
  state.parts = Array.from({ length: 12 }, (_, index) => ({ id: `copy_${index}`, partId: `gpu_t${index % 4 + 1}`, stationId: null }));
  let system = setup(state);
  for (let step = 0; step < 2000; step++) {
    const snapshot = system.state;
    const chosen = snapshot.parts[(step * 7 + Math.floor(step / 11)) % snapshot.parts.length];
    if (chosen.stationId) system.detach(chosen.id, chosen.stationId);
    else system.attach(chosen.id, step % 2 ? 'pc_a' : 'pc_b', 'gpu');
    const updated = system.state;
    assert.equal(updated.parts.length, 12); assert.equal(new Set(updated.parts.map((part) => part.id)).size, 12);
    for (const station of ['pc_a', 'pc_b']) assert.ok(updated.parts.filter((part) => part.stationId === station).length <= 1);
    if (step % 25 === 0) system = setup(updated);
  }
});
