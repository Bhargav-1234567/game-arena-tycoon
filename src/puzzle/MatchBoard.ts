import { PIECES } from './catalog.ts';
import type { BoosterKind, ObstacleKind, PieceKind, PuzzleLevel } from './catalog.ts';

export type SpecialKind = 'none' | 'line' | 'rgb';
export interface PuzzleCell { piece: PieceKind; special: SpecialKind; obstacle: ObstacleKind; }
export interface BoardSnapshot {
  cells: PuzzleCell[];
  randomState: number;
  paidMoves: number;
  virusPauseTurns: number;
  hazardKind?: ObstacleKind;
}
export interface SpecialActivation { kind: SpecialKind; origin: number; piece: PieceKind; affected: number[]; }
export interface FallingPiece { piece: PieceKind; special: SpecialKind; column: number; fromRow: number; toRow: number; isNew: boolean; }
export interface ResolutionStep {
  cascade: number;
  before: PuzzleCell[];
  after: PuzzleCell[];
  cleared: number[];
  created: { index: number; special: SpecialKind }[];
  activations: SpecialActivation[];
  falling: FallingPiece[];
}
export interface MoveResult {
  valid: boolean;
  consumesMove: boolean;
  message: string;
  score: number;
  pieces: Partial<Record<PieceKind, number>>;
  cascades: number;
  cleared: number[];
  shuffled: boolean;
  steps: ResolutionStep[];
  boosterTargets: number[];
  chargeGained?: number;
  lifelineReward?: BoosterKind;
  firstClearReward?: BoosterKind;
}

export const BOARD_SIZE = 7;
const CELL_COUNT = BOARD_SIZE * BOARD_SIZE;
const emptyResult = (message: string): MoveResult => ({
  valid: false, consumesMove: false, message, score: 0, pieces: {}, cascades: 0, cleared: [], shuffled: false, steps: [], boosterTargets: []
});

/** Browser-native adaptation of Build & Boot's rules. Random state is saved for exact resume. */
export class MatchBoard {
  public cells: PuzzleCell[];
  private randomState: number;
  private paidMoves = 0;
  private virusPauseTurns = 0;
  private hazardKind: ObstacleKind;
  public readonly level: PuzzleLevel;

  constructor(level: PuzzleLevel, seed = Date.now(), snapshot?: BoardSnapshot) {
    this.level = level;
    this.hazardKind = level.obstacle;
    this.randomState = (seed >>> 0) || 1;
    this.cells = [];
    if (snapshot) {
      MatchBoard.validate(snapshot);
      // Validate before reading cells; old active boards retain their original hazards.
      this.hazardKind = snapshot.hazardKind ?? snapshot.cells.find((cell) => cell.obstacle !== 'none')?.obstacle ?? level.obstacle;
      this.cells = structuredClone(snapshot.cells);
      this.randomState = snapshot.randomState;
      this.paidMoves = snapshot.paidMoves;
      this.virusPauseTurns = snapshot.virusPauseTurns;
    } else {
      this.cells = Array.from({ length: CELL_COUNT }, () => ({ piece: 'cpu', special: 'none', obstacle: 'none' }));
      this.generatePieces();
      const positions = this.shuffle(Array.from({ length: CELL_COUNT }, (_, i) => i));
      for (const index of positions.slice(0, level.obstacleCount)) this.cells[index].obstacle = level.obstacle;
      this.ensurePlayable();
    }
  }

  static validate(snapshot: BoardSnapshot): void {
    if (!snapshot || !Array.isArray(snapshot.cells) || snapshot.cells.length !== CELL_COUNT ||
      !Number.isInteger(snapshot.randomState) || snapshot.randomState < 1 || snapshot.randomState > 0xffffffff ||
      !Number.isInteger(snapshot.paidMoves) || snapshot.paidMoves < 0 ||
      !Number.isInteger(snapshot.virusPauseTurns) || snapshot.virusPauseTurns < 0 || snapshot.virusPauseTurns > 3 ||
      (snapshot.hazardKind !== undefined && !['none', 'dust', 'cable', 'heat', 'virus'].includes(snapshot.hazardKind)) ||
      snapshot.cells.some((cell) => !cell || !PIECES.includes(cell.piece) ||
        !['none', 'line', 'rgb'].includes(cell.special) || !['none', 'dust', 'cable', 'heat', 'virus'].includes(cell.obstacle))) {
      throw new Error('The saved puzzle board is invalid.');
    }
  }

  snapshot(): BoardSnapshot {
    return { cells: structuredClone(this.cells), randomState: this.randomState,
      paidMoves: this.paidMoves, virusPauseTurns: this.virusPauseTurns, hazardKind: this.hazardKind };
  }

  private random(): number {
    let state = this.randomState;
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    this.randomState = state >>> 0;
    return this.randomState / 0x100000000;
  }

  private pickPiece(): PieceKind { return PIECES[Math.floor(this.random() * PIECES.length)]; }
  private shuffle<T>(values: T[]): T[] {
    for (let i = values.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      [values[i], values[j]] = [values[j], values[i]];
    }
    return values;
  }

  private inside(index: number): boolean { return Number.isInteger(index) && index >= 0 && index < CELL_COUNT; }
  private neighbors(index: number): number[] {
    const row = Math.floor(index / BOARD_SIZE), col = index % BOARD_SIZE;
    return [row > 0 ? index - BOARD_SIZE : -1, row < 6 ? index + BOARD_SIZE : -1,
      col > 0 ? index - 1 : -1, col < 6 ? index + 1 : -1].filter((value) => value >= 0);
  }

  private swapContents(a: number, b: number): void {
    [this.cells[a].piece, this.cells[b].piece] = [this.cells[b].piece, this.cells[a].piece];
    [this.cells[a].special, this.cells[b].special] = [this.cells[b].special, this.cells[a].special];
  }

  findMatches(): number[][] {
    const groups: number[][] = [];
    for (const vertical of [false, true]) {
      for (let line = 0; line < BOARD_SIZE; line++) {
        let run: number[] = [];
        for (let offset = 0; offset <= BOARD_SIZE; offset++) {
          const index = vertical ? offset * BOARD_SIZE + line : line * BOARD_SIZE + offset;
          if (offset < BOARD_SIZE && (!run.length || this.cells[index].piece === this.cells[run[0]].piece)) {
            run.push(index);
          } else {
            if (run.length >= 3) groups.push(run);
            run = offset < BOARD_SIZE ? [index] : [];
          }
        }
      }
    }
    return groups;
  }

  legalMoves(): [number, number][] {
    const moves: [number, number][] = [];
    for (let a = 0; a < CELL_COUNT; a++) {
      for (const b of this.neighbors(a).filter((index) => index > a)) {
        if (this.cells[a].obstacle === 'cable' || this.cells[b].obstacle === 'cable') continue;
        this.swapContents(a, b);
        const matches = this.findMatches().length > 0;
        this.swapContents(a, b);
        if (matches) moves.push([a, b]);
      }
    }
    return moves;
  }

  remainingObstacles(): number { return this.cells.filter((cell) => cell.obstacle !== 'none').length; }

  swap(a: number, b: number, free = false): MoveResult {
    if (!this.inside(a) || !this.inside(b) || a === b) return emptyResult('Choose two different tiles.');
    if (!free && !this.neighbors(a).includes(b)) return emptyResult('Choose neighboring tiles.');
    if (this.cells[a].obstacle === 'cable' || this.cells[b].obstacle === 'cable') {
      return emptyResult('Cable locked. Match beside this tile first.');
    }
    this.swapContents(a, b);
    if (!free && !this.findMatches().length) {
      this.swapContents(a, b);
      return emptyResult('That swap creates no match. No move used.');
    }
    const result = this.resolve(b);
    result.consumesMove = !free;
    result.message = free ? 'Free move used.' : 'Circuit matched!';
    if (!free) this.advanceHazards();
    // Hazard growth can change which swaps are available.
    result.shuffled = this.ensurePlayable() || result.shuffled;
    return result;
  }

  useBooster(kind: 'gpu' | 'cpu' | 'cooling', target = 0): MoveResult {
    if (!this.inside(target)) return emptyResult('Choose a tile on the board.');
    const result = emptyResult('');
    result.valid = true;
    if (kind === 'cooling') {
      result.boosterTargets = this.cells.flatMap((cell, index) => cell.obstacle === 'heat' ? [index] : []);
      for (const cell of this.cells) if (cell.obstacle === 'heat') cell.obstacle = 'none';
      this.virusPauseTurns = 3;
      result.message = 'Cooling wave: heat cleared; virus paused for 3 moves.';
      return result;
    }
    let positions: number[];
    if (kind === 'cpu') {
      positions = this.shuffle(this.cells.map((_, i) => i).filter((i) => this.cells[i].piece === this.cells[target].piece)).slice(0, 6);
      result.message = 'CPU chain processed up to 6 matching tiles.';
    } else {
      const row = Math.floor(target / BOARD_SIZE), col = target % BOARD_SIZE;
      positions = this.cells.map((_, i) => i).filter((i) => Math.abs(Math.floor(i / BOARD_SIZE) - row) <= 1 && Math.abs(i % BOARD_SIZE - col) <= 1);
      result.message = 'GPU render cleared a 3 × 3 area.';
    }
    result.boosterTargets = [...positions];
    const before = structuredClone(this.cells), clear = new Set(positions);
    const activations = this.expandSpecials(clear);
    const falling = this.clear(clear, result, 1);
    result.steps.push({ cascade: 0, before, after: structuredClone(this.cells), cleared: [...clear], created: [], activations, falling });
    this.mergeResult(result, this.resolve(-1));
    return result;
  }

  private mergeResult(target: MoveResult, source: MoveResult): void {
    target.score += source.score;
    target.cascades += source.cascades;
    target.shuffled ||= source.shuffled;
    target.cleared = [...new Set([...target.cleared, ...source.cleared])];
    target.steps.push(...source.steps);
    for (const piece of PIECES) target.pieces[piece] = (target.pieces[piece] ?? 0) + (source.pieces[piece] ?? 0);
  }

  private resolve(preferred: number): MoveResult {
    const result = emptyResult('Circuit matched!'); result.valid = true;
    let groups = this.findMatches();
    while (groups.length && result.cascades < 20) {
      result.cascades++;
      const before = structuredClone(this.cells);
      const retained = new Map<number, SpecialKind>();
      for (const group of groups.filter((entry) => entry.length >= 4)) {
        const index = group.includes(preferred) ? preferred : group[Math.floor(group.length / 2)];
        if (retained.get(index) !== 'rgb') retained.set(index, group.length >= 5 ? 'rgb' : 'line');
      }
      const positions = new Set(groups.flat());
      // Existing specials are expanded before new ones are created.
      const activations = this.expandSpecials(positions);
      for (const index of retained.keys()) positions.delete(index);
      for (const [index, special] of retained) { this.cells[index].special = special; this.cells[index].obstacle = 'none'; }
      const falling = this.clear(positions, result, result.cascades);
      result.steps.push({ cascade: result.cascades, before, after: structuredClone(this.cells), cleared: [...positions],
        created: [...retained].map(([index, special]) => ({ index, special })), activations, falling });
      groups = this.findMatches(); preferred = -1;
    }
    result.shuffled = this.ensurePlayable(groups.length > 0);
    return result;
  }

  private expandSpecials(positions: Set<number>): SpecialActivation[] {
    const queue = [...positions], seen = new Set<number>();
    const activations: SpecialActivation[] = [];
    while (queue.length) {
      const index = queue.shift()!;
      if (seen.has(index)) continue;
      seen.add(index);
      const cell = this.cells[index];
      const extras = cell.special === 'line'
        ? this.cells.map((_, i) => i).filter((i) => Math.floor(i / 7) === Math.floor(index / 7) || i % 7 === index % 7)
        : cell.special === 'rgb' ? this.cells.map((_, i) => i).filter((i) => this.cells[i].piece === cell.piece) : [];
      if (cell.special !== 'none') activations.push({ kind: cell.special, origin: index, piece: cell.piece, affected: extras });
      for (const extra of extras) if (!positions.has(extra)) { positions.add(extra); queue.push(extra); }
    }
    return activations;
  }

  private clear(positions: Set<number>, result: MoveResult, multiplier: number): FallingPiece[] {
    result.cleared = [...new Set([...result.cleared, ...positions])];
    const adjacent = new Set<number>();
    for (const index of positions) {
      const cell = this.cells[index];
      result.pieces[cell.piece] = (result.pieces[cell.piece] ?? 0) + 1;
      cell.obstacle = 'none';
      for (const neighbor of this.neighbors(index)) adjacent.add(neighbor);
    }
    for (const index of adjacent) if (['cable', 'virus'].includes(this.cells[index].obstacle)) this.cells[index].obstacle = 'none';
    result.score += positions.size * 100 * multiplier;
    const falling: FallingPiece[] = [];
    for (let col = 0; col < BOARD_SIZE; col++) {
      const survivors: { piece: PieceKind; special: SpecialKind; row: number }[] = [];
      for (let row = BOARD_SIZE - 1; row >= 0; row--) {
        const index = row * BOARD_SIZE + col;
        if (!positions.has(index)) survivors.push({ piece: this.cells[index].piece, special: this.cells[index].special, row });
      }
      const newCount = BOARD_SIZE - survivors.length;
      for (let row = BOARD_SIZE - 1; row >= 0; row--) {
        const survivor = survivors.shift(), piece = survivor?.piece ?? this.pickPiece(), special = survivor?.special ?? 'none';
        Object.assign(this.cells[row * BOARD_SIZE + col], { piece, special });
        falling.push({ piece, special, column: col, fromRow: survivor?.row ?? row - newCount, toRow: row, isNew: !survivor });
      }
    }
    return falling;
  }

  private advanceHazards(): void {
    this.paidMoves++;
    if (this.virusPauseTurns > 0) { this.virusPauseTurns--; return; }
    if (this.hazardKind !== 'virus' || this.paidMoves % 3 !== 0) return;
    for (const index of this.shuffle(this.cells.map((_, i) => i).filter((i) => this.cells[i].obstacle === 'virus'))) {
      const target = this.shuffle(this.neighbors(index)).find((i) => this.cells[i].obstacle === 'none');
      if (target !== undefined) { this.cells[target].obstacle = 'virus'; return; }
    }
  }

  private generatePieces(): void {
    for (let index = 0; index < CELL_COUNT; index++) {
      const candidates = PIECES.filter((piece) =>
        !(index % 7 >= 2 && this.cells[index - 1].piece === piece && this.cells[index - 2].piece === piece) &&
        !(index >= 14 && this.cells[index - 7].piece === piece && this.cells[index - 14].piece === piece));
      this.cells[index].piece = candidates[Math.floor(this.random() * candidates.length)];
    }
  }

  ensurePlayable(force = false): boolean {
    if (!force && this.legalMoves().length) return false;
    const ordinary = this.cells.map((_, i) => i).filter((i) => this.cells[i].special === 'none');
    const pieces = ordinary.map((i) => this.cells[i].piece);
    for (let attempt = 0; attempt < 1200; attempt++) {
      if (attempt < 400) {
        this.shuffle(pieces); ordinary.forEach((index, i) => { this.cells[index].piece = pieces[i]; });
      } else {
        // Preserve specials and every hazard; only regenerate ordinary pieces.
        for (const index of ordinary) this.cells[index].piece = this.pickPiece();
      }
      if (!this.findMatches().length && this.legalMoves().length) return true;
    }
    throw new Error('Unable to route a playable puzzle board. Retry this puzzle.');
  }
}
