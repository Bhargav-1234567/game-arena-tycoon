import { GAME_MINUTES_PER_SECOND } from '../data/simulation.ts';
export class EconomySystem {
  public cash: number = 1800000; // Starting capital
  public reputation: number = 75; // 0 - 100
  public day: number = 1;
  public timeMinutes: number = 9 * 60; // Starts at 09:00 AM

  private listeners: (() => void)[] = [];

  constructor() { }

  public subscribe(fn: () => void) {
    this.listeners.push(fn);
  }

  private notify() {
    this.listeners.forEach((fn) => fn());
  }

  public canAfford(amount: number): boolean {
    return this.cash >= amount;
  }

  public spend(amount: number): boolean {
    if (this.canAfford(amount)) {
      this.cash -= amount;
      this.notify();
      return true;
    }
    return false;
  }

  public earn(amount: number) {
    this.cash += amount;
    this.notify();
  }

  public addReputation(points: number) {
    this.reputation = Math.min(100, Math.max(0, this.reputation + points));
    this.notify();
  }

  public update(deltaTime: number) {
    // 1 real second = 4 in-game minutes
    this.timeMinutes += deltaTime * GAME_MINUTES_PER_SECOND;
    if (this.timeMinutes >= 24 * 60) {
      this.timeMinutes -= 24 * 60;
      this.day += 1;
    }
  }

  public getFormattedTime(): string {
    const hours = Math.floor(this.timeMinutes / 60);
    const mins = Math.floor(this.timeMinutes % 60);
    const hStr = hours < 10 ? `0${hours}` : `${hours}`;
    const mStr = mins < 10 ? `0${mins}` : `${mins}`;
    return `Day ${this.day} · ${hStr}:${mStr}`;
  }
}

