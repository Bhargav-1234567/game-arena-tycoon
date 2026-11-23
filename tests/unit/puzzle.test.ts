import test from 'node:test';
import assert from 'node:assert/strict';
import { MatchBoard } from '../../src/puzzle/MatchBoard.ts';
import { getLevel, PIECES, PUZZLE_LEVELS } from '../../src/puzzle/catalog.ts';

function fixture(level = 1): MatchBoard {
  const board = new MatchBoard(getLevel(level), 123);
  board.cells.forEach((cell, i) => Object.assign(cell, {
    piece: PIECES[(Math.floor(i / 7) + i % 7) % 6], special: 'none', obstacle: 'none'
  }));
  return board;
}

test('100 levels progressively expose hardware and hazards', () => {
  assert.equal(PUZZLE_LEVELS.length, 100);
  assert.equal(getLevel(1).targetCount, 10);
  assert.equal(getLevel(100).rewardTier, 4);
  assert.ok(getLevel(100).targetCount > getLevel(1).targetCount);
});

test('every level generates full, match-free, playable boards across 20 seeds', () => {
  for (const level of PUZZLE_LEVELS) for (let seed = 1; seed <= 20; seed++) {
    const board = new MatchBoard(level, seed);
    assert.equal(board.cells.length, 49);
    assert.equal(board.findMatches().length, 0, `immediate match: ${level.number}/${seed}`);
    assert.ok(board.legalMoves().length, `deadlock: ${level.number}/${seed}`);
    assert.equal(board.remainingObstacles(), level.obstacleCount);
  }
});

test('snapshot restores exact next-move resolution and random state', () => {
  const original = new MatchBoard(getLevel(6), 42);
  const restored = new MatchBoard(getLevel(6), 1, original.snapshot());
  const [a, b] = original.legalMoves()[0];
  assert.deepEqual(original.swap(a, b), restored.swap(a, b));
  assert.deepEqual(original.snapshot(), restored.snapshot());
});

test('invalid swaps, row wrapping, same cell and locked tiles leave state unchanged', () => {
  const board = fixture();
  for (const [a, b] of [[0, 48], [6, 7], [0, 0], [-1, 0], [1.5, 2], [0, 1]]) {
    const before = board.snapshot();
    assert.equal(board.swap(a, b).valid, false);
    assert.deepEqual(board.snapshot(), before);
  }
  board.cells[0].obstacle = 'cable';
  assert.equal(board.swap(0, 1, true).valid, false);
});

test('match clears dust, adjacent cable and refills without leaving gaps', () => {
  const board = fixture();
  [0, 1, 9].forEach((i) => { board.cells[i].piece = 'cpu'; });
  board.cells[2].piece = 'ram';
  board.cells[0].obstacle = 'dust'; board.cells[7].obstacle = 'cable';
  const result = board.swap(2, 9);
  assert.equal(result.valid, true);
  assert.equal(result.consumesMove, true);
  assert.ok((result.pieces.cpu ?? 0) >= 3);
  assert.equal(board.cells[0].obstacle, 'none');
  assert.equal(board.cells[7].obstacle, 'none');
  assert.ok(board.cells.every((cell) => PIECES.includes(cell.piece)));
  assert.ok(board.legalMoves().length);
});

test('match four creates a line blaster; match five creates an RGB core', () => {
  for (const length of [4, 5]) {
    const board = fixture();
    for (let i = 0; i < length - 1; i++) board.cells[i].piece = 'cpu';
    board.cells[length - 1].piece = 'ram'; board.cells[length + 6].piece = 'cpu';
    const result = board.swap(length - 1, length + 6);
    assert.equal(result.valid, true);
    assert.ok(board.cells.some((cell) => cell.special === (length === 4 ? 'line' : 'rgb')));
  }
});

test('existing specials expand and chain their clear area', () => {
  const board = fixture();
  board.cells[24].special = 'line'; board.cells[27].special = 'rgb';
  const result = board.useBooster('gpu', 24);
  assert.ok(result.cleared.includes(21)); assert.ok(result.cleared.includes(27));
  assert.ok(result.cleared.includes(3)); assert.ok(result.cleared.includes(45));
});

test('GPU and CPU boosters do not consume moves; cooling clears heat and pauses hazards', () => {
  const board = fixture(3);
  board.cells[0].obstacle = 'heat';
  const cooling = board.useBooster('cooling');
  assert.equal(cooling.consumesMove, false); assert.equal(board.remainingObstacles(), 0);
  assert.equal(board.snapshot().virusPauseTurns, 3);
  const gpu = board.useBooster('gpu', 0);
  assert.equal(gpu.consumesMove, false); assert.ok(gpu.cleared.includes(8));
  const cpu = board.useBooster('cpu', 24);
  assert.equal(cpu.consumesMove, false); assert.equal(cpu.valid, true);
});

test('free move swaps distant unlocked cells without charging a move', () => {
  const board = fixture();
  assert.equal(board.swap(0, 48, true).consumesMove, false);
});

test('virus advances every third paid move and cooling delays growth', () => {
  const board = new MatchBoard(getLevel(6), 26);
  for (let i = 0; i < 10; i++) {
    const before = board.snapshot();
    const result = board.swap(...board.legalMoves()[0]);
    assert.equal(result.valid, true);
    assert.equal(board.snapshot().paidMoves, before.paidMoves + 1);
    if (i === 0) board.useBooster('cooling');
    if (i >= 1 && i <= 3) assert.equal(board.snapshot().virusPauseTurns, 3 - i);
  }
});

test('dead board reroutes while preserving specials and hazards', () => {
  const board = fixture();
  assert.equal(board.legalMoves().length, 0);
  board.cells[0].special = 'line'; board.cells[48].special = 'rgb';
  board.cells[5].obstacle = 'dust'; board.cells[16].obstacle = 'cable';
  board.ensurePlayable(true);
  assert.ok(board.legalMoves().length); assert.equal(board.findMatches().length, 0);
  assert.equal(board.cells[0].special, 'line'); assert.equal(board.cells[48].special, 'rgb');
  assert.equal(board.cells[5].obstacle, 'dust'); assert.equal(board.cells[16].obstacle, 'cable');
});

test('malformed board snapshots are rejected', () => {
  const snapshot = fixture().snapshot(); snapshot.cells.pop();
  assert.throws(() => new MatchBoard(getLevel(1), 1, snapshot), /invalid/);
  const invalidCell = fixture().snapshot(); invalidCell.cells[0] = null as unknown as typeof invalidCell.cells[number];
  assert.throws(() => new MatchBoard(getLevel(1), 1, invalidCell), /invalid/);
});

test('visual steps retain the actual cleared cells, special activations and gravity destinations', () => {
  const board = fixture(); board.cells[24].special = 'line'; board.cells[27].special = 'rgb';
  const result = board.useBooster('gpu', 24), step = result.steps[0];
  assert.equal(step.cascade, 0); assert.equal(step.before[24].special, 'line');
  assert.deepEqual(result.boosterTargets, [16, 17, 18, 23, 24, 25, 30, 31, 32]);
  assert.ok(step.activations.some((activation) => activation.kind === 'line' && activation.origin === 24));
  assert.ok(step.activations.some((activation) => activation.kind === 'rgb' && activation.origin === 27));
  assert.ok(step.activations.find((activation) => activation.kind === 'line')!.affected.includes(3));
  assert.equal(step.falling.length, 49);
  for (const falling of step.falling) {
    assert.equal(step.after[falling.toRow * 7 + falling.column].piece, falling.piece);
    assert.ok(falling.fromRow <= falling.toRow);
    assert.equal(falling.isNew, falling.fromRow < 0);
  }
  step.after[0].piece = 'ram'; assert.notDeepEqual(step.after, board.cells);
});

test('CPU targets at most six matching parts and corner GPU targets exactly four before cascades', () => {
  const board = fixture(), piece = board.cells[24].piece;
  const cpu = board.useBooster('cpu', 24);
  assert.ok(cpu.boosterTargets.length <= 6); assert.ok(cpu.boosterTargets.length > 0);
  assert.ok(cpu.boosterTargets.every((index) => cpu.steps[0].before[index].piece === piece));
  assert.deepEqual(fixture().useBooster('gpu', 0).boosterTargets, [0, 1, 7, 8]);
});

test('legacy active virus boards preserve their growth rules after catalog corrections', () => {
  const board = fixture(6), snapshot = board.snapshot(); delete snapshot.hazardKind;
  snapshot.cells[48].obstacle = 'virus'; snapshot.paidMoves = 2;
  const restored = new MatchBoard(getLevel(12), 1, snapshot);
  assert.equal(restored.snapshot().hazardKind, 'virus');
  assert.equal(restored.snapshot().paidMoves, 2);
});

test('creator path uses the original names, hazards and counts rather than generated approximations', () => {
  assert.equal(getLevel(11).name, 'Blueprint Online');
  assert.equal(getLevel(12).buildPart, 'Creator CPU');
  assert.equal(getLevel(20).name, 'Creator Launch');
  assert.deepEqual(Array.from({ length: 10 }, (_, index) => getLevel(index + 11).obstacle),
    ['dust', 'cable', 'heat', 'virus', 'cable', 'virus', 'heat', 'dust', 'virus', 'cable']);
  assert.deepEqual(Array.from({ length: 10 }, (_, index) => getLevel(index + 11).obstacleCount), [8, 8, 9, 9, 10, 11, 11, 12, 13, 14]);
  assert.ok(PUZZLE_LEVELS.every((level) => level.tip && level.buildPart && level.rewardBooster));
});

test('3,000 live moves and boosters leave valid playable boards across all campaigns', () => {
  for (const level of PUZZLE_LEVELS) {
    let board = new MatchBoard(level, level.number * 57);
    for (let turn = 0; turn < 30; turn++) {
      const moves = board.legalMoves();
      const result = turn % 7 === 0 ? board.useBooster('gpu', turn % 49) : board.swap(...moves[turn % moves.length]);
      assert.equal(result.valid, true);
      assert.equal(board.findMatches().length, 0);
      assert.ok(board.legalMoves().length);
      MatchBoard.validate(board.snapshot());
      if (turn % 5 === 0) board = new MatchBoard(level, 1, board.snapshot());
    }
  }
});
