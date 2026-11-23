import { lightPeriod } from '../data/world-layout.ts';

export type WorldView = 'lounge' | 'neighborhood';
export type WorldLighting = 'auto' | 'day' | 'evening' | 'night';
export interface NeighborhoodEvent {
  id: string;
  status: 'active' | 'won' | 'expired';
  served: number;
  remaining: number;
}
export interface NeighborhoodState {
  shopName: string;
  frontageLevel: number;
  cafePartner: boolean;
  view: WorldView;
  lighting: WorldLighting;
  event: NeighborhoodEvent | null;
  eventsWon: number;
  busIn: number;
}
export const FRONTAGE_PRICES = [500, 1200, 2500];
export const FRONTAGE_NAMES = ['Local Gaming Corner', 'Neon Street Lounge', 'Esports Destination', 'District Flagship'];
export const CAFE_PRICE = 750;
export const EVENT_GOAL = 3;
export const EVENT_SECONDS = 120;

export function newNeighborhoodState(): NeighborhoodState {
  return { shopName: 'ZONE Gaming Lounge', frontageLevel: 0, cafePartner: false,
    view: 'neighborhood', lighting: 'evening', event: null, eventsWon: 0, busIn: 24 };
}

export class NeighborhoodSystem {
  private value: NeighborhoodState;
  private listeners = new Set<() => void>();
  private uiTimer = 0;
  public persist: (state: NeighborhoodState, cashChange: number, reputationChange: number) => boolean = () => false;
  public getCash: () => number = () => 0;
  public onBusArrival?: () => void;

  constructor(state = newNeighborhoodState()) {
    NeighborhoodSystem.validate(state);
    this.value = structuredClone(state);
  }
  get state(): NeighborhoodState { return structuredClone(this.value); }
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  private notify(): void { for (const listener of this.listeners) listener(); }

  static validate(state: NeighborhoodState): void {
    const whole = (value: number, max: number) => Number.isSafeInteger(value) && value >= 0 && value <= max;
    if (!state || typeof state.shopName !== 'string' || !/^[\p{L}\p{N} .&'!-]{2,28}$/u.test(state.shopName) ||
      state.shopName.trim() !== state.shopName || !whole(state.frontageLevel, 3) || typeof state.cafePartner !== 'boolean' ||
      !['lounge', 'neighborhood'].includes(state.view) || !['auto', 'day', 'evening', 'night'].includes(state.lighting) ||
      !whole(state.eventsWon, Number.MAX_SAFE_INTEGER) || !Number.isFinite(state.busIn) || state.busIn < 0 || state.busIn > 60) {
      throw new Error('The saved neighborhood is invalid.');
    }
    const event = state.event;
    if (event !== null && (!event || typeof event.id !== 'string' || !event.id ||
      !['active', 'won', 'expired'].includes(event.status) || !whole(event.served, EVENT_GOAL) ||
      !Number.isFinite(event.remaining) || event.remaining < 0 || event.remaining > EVENT_SECONDS ||
      (event.status === 'won' && event.served !== EVENT_GOAL))) throw new Error('The saved tournament is invalid.');
  }

  private transact(change: (draft: NeighborhoodState) => void, cashChange = 0, reputationChange = 0): void {
    if (this.getCash() + cashChange < 0) throw new Error('Not enough cash for this improvement.');
    const draft = this.state; change(draft); NeighborhoodSystem.validate(draft);
    if (!this.persist(draft, cashChange, reputationChange)) throw new Error('Could not save. No cash or improvements changed. Please retry.');
    this.value = draft; this.notify();
  }

  rename(name: string): void {
    const trimmed = name.trim();
    if (!/^[\p{L}\p{N} .&'!-]{2,28}$/u.test(trimmed)) throw new Error('Use 2–28 letters, numbers, spaces or simple punctuation for your lounge name.');
    this.transact((state) => { state.shopName = trimmed; });
  }
  setView(view: WorldView): void { this.transact((state) => { state.view = view; }); }
  setLighting(lighting: WorldLighting): void { this.transact((state) => { state.lighting = lighting; }); }
  upgradeFrontage(): void {
    const cost = FRONTAGE_PRICES[this.value.frontageLevel];
    if (cost === undefined) throw new Error('Your frontage is fully upgraded.');
    this.transact((state) => { state.frontageLevel++; }, -cost, 2);
  }
  partnerCafe(): void {
    if (this.value.cafePartner) throw new Error('Your café partnership is already active.');
    this.transact((state) => { state.cafePartner = true; }, -CAFE_PRICE);
  }
  startEvent(): void {
    if (this.value.event?.status === 'active') throw new Error('A neighborhood tournament is already running.');
    this.transact((state) => {
      state.event = { id: crypto.randomUUID(), status: 'active', served: 0, remaining: EVENT_SECONDS };
    });
  }
  recordCustomer(): void {
    if (this.value.event?.status !== 'active') return;
    const winning = this.value.event.served + 1 >= EVENT_GOAL;
    this.transact((state) => {
      state.event!.served++;
      if (winning) { state.event!.status = 'won'; state.eventsWon++; }
    }, winning ? 500 : 0, winning ? 5 : 0);
  }
  update(deltaTime: number): void {
    if (!Number.isFinite(deltaTime) || deltaTime < 0) return;
    this.value.busIn = Math.max(0, this.value.busIn - deltaTime);
    if (this.value.busIn <= 0) { this.value.busIn = 60; this.onBusArrival?.(); }
    if (this.value.event?.status === 'active') {
      this.value.event.remaining = Math.max(0, this.value.event.remaining - deltaTime);
      if (this.value.event.remaining === 0) this.value.event.status = 'expired';
    }
    this.uiTimer += deltaTime;
    if (this.uiTimer >= 1) { this.uiTimer = 0; this.notify(); }
  }
  getSatisfactionBonus(): number { return this.value.cafePartner ? 5 : 0; }
  getSpawnInterval(reputation: number): number { return Math.max(2, 5 - Math.max(0, Math.min(100, reputation)) / 50 - this.value.frontageLevel * .25); }
  getLighting(minutes: number): 'day' | 'evening' | 'night' {
    return this.value.lighting === 'auto' ? lightPeriod(minutes) : this.value.lighting;
  }
}
