import { getPart, HARDWARE_PARTS } from '../data/parts.ts';
import type { PartSlot } from '../data/parts.ts';
import { getLevel } from '../puzzle/catalog.ts';
import type { BoosterKind } from '../puzzle/catalog.ts';
import { MatchBoard } from '../puzzle/MatchBoard.ts';
import type { BoardSnapshot, MoveResult } from '../puzzle/MatchBoard.ts';

export type { BoosterKind } from '../puzzle/catalog.ts';
export interface OwnedPart { id: string; partId: string; stationId: string | null; }
export interface PuzzleSession {
  id: string;
  level: number;
  rewardPartId: string;
  changeCount: number;
  board: BoardSnapshot;
  movesLeft: number;
  collected: number;
  score: number;
  status: 'playing' | 'won' | 'lost';
}
export interface WorkshopState {
  diamonds: number;
  highestUnlocked: number;
  completed: number[];
  wins: number;
  parts: OwnedPart[];
  boosters: Record<BoosterKind, number>;
  charge: number;
  lifelinesEarned?: number;
  session: PuzzleSession | null;
}

export const STARTING_DIAMONDS = 100;
export const WIN_DIAMONDS = 5;
export const rewardChangeCost = (changeCount: number): number => [5, 10, 20, 25][Math.min(3, changeCount)];
const integer = (value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;

export function newWorkshopState(): WorkshopState {
  return { diamonds: STARTING_DIAMONDS, highestUnlocked: 1, completed: [], wins: 0, parts: [],
    boosters: { gpu: 2, cpu: 2, mouse: 2, cooling: 2 }, charge: 0, lifelinesEarned: 0, session: null };
}

/** One owner per part; every money/reward/equipment operation is persisted before publication. */
export class WorkshopSystem {
  private value: WorkshopState;
  private listeners = new Set<() => void>();
  public persist: (state: WorkshopState) => boolean = () => false;
  public stationExists: (id: string) => boolean = () => false;

  constructor(state = newWorkshopState()) {
    WorkshopSystem.validate(state);
    this.value = structuredClone(state);
  }

  get state(): WorkshopState { return structuredClone(this.value); }
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }

  static validate(state: WorkshopState): void {
    if (!state || !integer(state.diamonds) || !integer(state.highestUnlocked, 1, 100) ||
      !integer(state.wins) || !integer(state.charge, 0, 5) ||
      (state.lifelinesEarned !== undefined && !integer(state.lifelinesEarned)) || !Array.isArray(state.completed) ||
      state.completed.some((level) => !integer(level, 1, 100)) || new Set(state.completed).size !== state.completed.length ||
      !Array.isArray(state.parts) || state.parts.length > 100000 || !state.boosters ||
      (['gpu', 'cpu', 'mouse', 'cooling'] as const).some((kind) => !integer(state.boosters[kind]))) {
      throw new Error('The saved workshop is invalid.');
    }
    const ids = new Set<string>(), installed = new Set<string>();
    for (const part of state.parts) {
      if (!part || typeof part.id !== 'string' || !part.id || ids.has(part.id) ||
        (part.stationId !== null && (typeof part.stationId !== 'string' || !part.stationId))) {
        throw new Error('The saved inventory contains invalid or duplicate parts.');
      }
      ids.add(part.id);
      const definition = getPart(part.partId);
      if (part.stationId) {
        const key = `${part.stationId}:${definition.slot}`;
        if (installed.has(key)) throw new Error('A PC has two parts in the same slot.');
        installed.add(key);
      }
    }
    const session = state.session;
    if (session !== null) {
      if (!session || typeof session.id !== 'string' || !session.id || !integer(session.level, 1, state.highestUnlocked) ||
        !integer(session.changeCount) || !integer(session.movesLeft, 0, getLevel(session.level).moves) ||
        !integer(session.collected) || !integer(session.score) || !['playing', 'won', 'lost'].includes(session.status)) {
        throw new Error('The saved puzzle session is invalid.');
      }
      if (getPart(session.rewardPartId).tier !== getLevel(session.level).rewardTier) throw new Error('Invalid puzzle reward tier.');
      MatchBoard.validate(session.board);
      const complete = session.collected >= getLevel(session.level).targetCount && session.board.cells.every((cell) => cell.obstacle === 'none');
      if ((session.status === 'won') !== complete || (session.status === 'lost' && session.movesLeft !== 0) ||
        (session.status === 'playing' && session.movesLeft === 0)) throw new Error('Invalid puzzle completion state.');
    }
  }

  private transact(change: (draft: WorkshopState) => void): void {
    const draft = this.state;
    change(draft);
    WorkshopSystem.validate(draft);
    if (!this.persist(draft)) throw new Error('Could not save. No parts or diamonds were changed. Check browser storage and try again.');
    this.value = draft;
    for (const listener of this.listeners) listener();
  }

  start(levelNumber = this.value.highestUnlocked): void {
    this.transact((draft) => {
      if (draft.session && draft.session.status !== 'won') throw new Error('Finish or retry your current puzzle first. Your reward offer is preserved.');
      if (!integer(levelNumber, 1, draft.highestUnlocked)) throw new Error('This puzzle is locked.');
      const level = getLevel(levelNumber);
      const pool = HARDWARE_PARTS.filter((part) => part.tier === level.rewardTier);
      draft.session = {
        id: crypto.randomUUID(), level: levelNumber, rewardPartId: pool[draft.wins % pool.length].id,
        changeCount: 0, board: new MatchBoard(level).snapshot(), movesLeft: level.moves,
        collected: 0, score: 0, status: 'playing'
      };
    });
  }

  changeReward(partId: string): void {
    this.transact((draft) => {
      const session = draft.session;
      if (!session || session.status !== 'playing') throw new Error('Reward changes are available before winning only.');
      if (partId === session.rewardPartId) throw new Error('Choose a different reward.');
      if (getPart(partId).tier !== getLevel(session.level).rewardTier) throw new Error('Choose a reward from this puzzle tier.');
      const cost = rewardChangeCost(session.changeCount);
      if (draft.diamonds < cost) throw new Error(`You need ${cost} diamonds to change this reward.`);
      draft.diamonds -= cost;
      session.rewardPartId = partId;
      session.changeCount++;
    });
  }

  retry(): void {
    this.transact((draft) => {
      const session = draft.session;
      if (!session || session.status !== 'lost') throw new Error('Retry is available after running out of moves.');
      const level = getLevel(session.level);
      Object.assign(session, { board: new MatchBoard(level).snapshot(), movesLeft: level.moves, collected: 0, score: 0, status: 'playing' });
    });
  }

  play(a: number, b: number, booster?: 'mouse'): MoveResult {
    return this.perform((board) => board.swap(a, b, booster === 'mouse'), booster);
  }

  useBooster(kind: Exclude<BoosterKind, 'mouse'>, target = 0): MoveResult {
    return this.perform((board) => board.useBooster(kind, target), kind);
  }

  private perform(action: (board: MatchBoard) => MoveResult, booster?: BoosterKind): MoveResult {
    let result: MoveResult | undefined;
    this.transact((draft) => {
      const session = draft.session;
      if (!session || session.status !== 'playing') throw new Error('This puzzle is no longer in progress.');
      if (booster && draft.boosters[booster] <= 0) throw new Error('No charges of this lifeline remain.');
      const level = getLevel(session.level);
      const board = new MatchBoard(level, 1, session.board);
      result = action(board);
      if (!result.valid) throw new Error(result.message);
      if (booster) draft.boosters[booster]--;
      if (result.consumesMove) {
        session.movesLeft--;
        result.chargeGained = 1 + Math.min(2, Math.max(0, result.cascades - 1));
        draft.charge += result.chargeGained;
        if (draft.charge >= 6) {
          draft.charge -= 6;
          const kinds: BoosterKind[] = ['mouse', 'cpu', 'cooling', 'gpu'];
          result.lifelineReward = kinds[(draft.lifelinesEarned ?? 0) % kinds.length];
          draft.lifelinesEarned = (draft.lifelinesEarned ?? 0) + 1;
          draft.boosters[result.lifelineReward]++;
        }
      }
      session.collected += result.pieces[level.target] ?? 0;
      session.score += result.score;
      session.board = board.snapshot();
      if (session.collected >= level.targetCount && board.remainingObstacles() === 0) {
        session.status = 'won';
        // The reward and completion flag live in the same atomic save as the move.
        draft.parts.push({ id: crypto.randomUUID(), partId: session.rewardPartId, stationId: null });
        draft.diamonds += WIN_DIAMONDS;
        draft.wins++;
        if (!draft.completed.includes(session.level)) {
          draft.completed.push(session.level);
          result.firstClearReward = level.rewardBooster;
          draft.boosters[level.rewardBooster]++;
        }
        draft.highestUnlocked = Math.max(draft.highestUnlocked, Math.min(100, session.level + 1));
      } else if (!session.movesLeft) {
        session.status = 'lost';
      }
    });
    return result!;
  }

  attach(instanceId: string, stationId: string, slot: PartSlot): void {
    this.transact((draft) => {
      if (!this.stationExists(stationId)) throw new Error('This PC no longer exists.');
      const part = draft.parts.find((entry) => entry.id === instanceId);
      if (!part || part.stationId !== null) throw new Error('That part is no longer available.');
      if (getPart(part.partId).slot !== slot) throw new Error('This part does not fit that slot.');
      for (const existing of draft.parts) {
        if (existing.stationId === stationId && getPart(existing.partId).slot === slot) existing.stationId = null;
      }
      part.stationId = stationId;
    });
  }

  detach(instanceId: string, stationId: string): void {
    this.transact((draft) => {
      const part = draft.parts.find((entry) => entry.id === instanceId && entry.stationId === stationId);
      if (!part) throw new Error('This part is no longer attached to that PC.');
      part.stationId = null;
    });
  }
}
