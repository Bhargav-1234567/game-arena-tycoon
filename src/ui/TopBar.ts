import { EconomySystem } from '../systems/EconomySystem.ts';
import { SoundManager } from '../services/SoundManager.ts';

export class TopBar {
  private element: HTMLElement;
  private economy: EconomySystem;
  private cashDisplay!: HTMLElement;
  private timeDisplay!: HTMLElement;
  private repDisplay!: HTMLElement;
  private gamersDisplay!: HTMLElement;
  private soundBtn!: HTMLButtonElement;

  public onOpenStats?: () => void;

  constructor(parent: HTMLElement, economy: EconomySystem) {
    this.economy = economy;
    this.element = document.createElement('header');
    this.element.className = 'topbar';
    this.render();
    parent.appendChild(this.element);

    this.economy.subscribe(() => this.updateValues());
  }

  private render() {
    this.element.innerHTML = `
      <div class="brand">
        <span class="brand-badge">ZONE</span>
        <span class="brand-title">Gaming Zone Tycoon</span>
      </div>
      <div class="stats-group">
        <div class="stat-pill cash-pill">
          <span class="stat-icon">💵</span>
          <span id="cash-value" class="stat-val">$${this.economy.cash.toLocaleString()}</span>
        </div>
        <div class="stat-pill">
          <span class="stat-icon">⭐</span>
          <span id="rep-value" class="stat-val">${this.economy.reputation}%</span>
        </div>
        <div class="stat-pill">
          <span class="stat-icon">🎮</span>
          <span id="gamers-value" class="stat-val">0 Gamers</span>
        </div>
        <div class="stat-pill time-pill">
          <span class="stat-icon">🕒</span>
          <span id="time-value" class="stat-val">${this.economy.getFormattedTime()}</span>
        </div>
      </div>
      <div class="topbar-actions">
        <button id="btn-stats-modal" class="topbar-btn" title="Business Financials & Management">
          <span>📊 Management</span>
        </button>
        <button id="btn-sound-toggle" class="topbar-btn icon-btn" title="Toggle Sound">
          <span id="sound-icon">🔊</span>
        </button>
      </div>
    `;

    this.cashDisplay = this.element.querySelector('#cash-value')!;
    this.repDisplay = this.element.querySelector('#rep-value')!;
    this.gamersDisplay = this.element.querySelector('#gamers-value')!;
    this.timeDisplay = this.element.querySelector('#time-value')!;
    this.soundBtn = this.element.querySelector('#btn-sound-toggle')!;

    const statsBtn = this.element.querySelector('#btn-stats-modal');
    statsBtn?.addEventListener('click', () => {
      if (this.onOpenStats) this.onOpenStats();
    });

    this.soundBtn.addEventListener('click', () => {
      const isMuted = SoundManager.getInstance().toggleMute();
      const icon = this.element.querySelector('#sound-icon');
      if (icon) {
        icon.textContent = isMuted ? '🔇' : '🔊';
      }
    });
  }

  public updateValues(gamersCount: number = 0) {
    this.cashDisplay.textContent = `$${this.economy.cash.toLocaleString()}`;
    this.repDisplay.textContent = `${this.economy.reputation}%`;
    this.gamersDisplay.textContent = `${gamersCount} Gamers`;
    this.timeDisplay.textContent = this.economy.getFormattedTime();
  }
}
