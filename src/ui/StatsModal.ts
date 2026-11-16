import { EconomySystem } from '../systems/EconomySystem.ts';
import { StaffSystem } from '../systems/StaffSystem.ts';
import { PlacementSystem } from '../systems/PlacementSystem.ts';
import { SaveManager, GameSaveState } from '../services/SaveManager.ts';
import { SoundManager } from '../services/SoundManager.ts';

export class StatsModal {
  private element: HTMLElement;
  private economy: EconomySystem;
  private staff: StaffSystem;
  private placement: PlacementSystem;
  private isOpen: boolean = false;

  constructor(
    parent: HTMLElement,
    economy: EconomySystem,
    staff: StaffSystem,
    placement: PlacementSystem
  ) {
    this.economy = economy;
    this.staff = staff;
    this.placement = placement;

    this.element = document.createElement('div');
    this.element.className = 'modal-backdrop';
    this.element.style.display = 'none';
    parent.appendChild(this.element);

    this.setupListeners();
  }

  public open() {
    this.isOpen = true;
    this.element.style.display = 'flex';
    this.render();
    SoundManager.getInstance().playClick();
  }

  public close() {
    this.isOpen = false;
    this.element.style.display = 'none';
  }

  public isModalOpen(): boolean {
    return this.isOpen;
  }

  private getLoungeTier(): { name: string; badge: string; color: string } {
    const stations = this.placement.stations.size;
    const rep = this.economy.reputation;

    if (stations >= 8 && rep >= 90) {
      return { name: 'VIP Cyberplex Arena', badge: 'DIAMOND', color: '#38bdf8' };
    } else if (stations >= 5 && rep >= 80) {
      return { name: 'Esports Championship Centre', badge: 'GOLD', color: '#f59e0b' };
    } else if (stations >= 3 && rep >= 70) {
      return { name: 'Pro Gaming Lounge', badge: 'SILVER', color: '#c084fc' };
    }
    return { name: 'Local Gaming Corner', badge: 'BRONZE', color: '#94a3b8' };
  }

  private render() {
    const tier = this.getLoungeTier();
    let totalStationRev = 0;
    this.placement.stations.forEach((s) => {
      totalStationRev += s.getHourlyRevenue();
    });

    const wages = this.staff.getTotalHourlyWages();
    const netHourly = totalStationRev - wages;
    const valuation = Math.round(this.economy.cash + this.placement.stations.size * 1200 + this.economy.reputation * 30);

    this.element.innerHTML = `
      <div class="stats-modal-card">
        <div class="modal-header">
          <div class="modal-title-wrap">
            <span class="tier-badge" style="background: ${tier.color};">${tier.badge}</span>
            <h3>${tier.name}</h3>
          </div>
          <button id="close-stats-btn" class="close-btn">✕</button>
        </div>

        <div class="dashboard-grid">
          <div class="dash-card">
            <span class="dash-label">Net Hourly Cashflow</span>
            <span class="dash-val ${netHourly >= 0 ? 'text-teal' : 'text-red'}">
              ${netHourly >= 0 ? '+' : ''}$${netHourly}/hr
            </span>
          </div>

          <div class="dash-card">
            <span class="dash-label">Business Valuation</span>
            <span class="dash-val text-amber">$${valuation.toLocaleString()}</span>
          </div>

          <div class="dash-card">
            <span class="dash-label">Operational BattleStations</span>
            <span class="dash-val">${this.placement.stations.size} Units</span>
          </div>

          <div class="dash-card">
            <span class="dash-label">Hourly Payroll (Staff)</span>
            <span class="dash-val text-muted">-$${wages}/hr</span>
          </div>
        </div>

        <h4 class="section-title">Staff Management & Payroll</h4>
        <div class="staff-list">
          ${this.staff.roles
            .map((role) => {
              const canHire = this.economy.canAfford(role.hiringCost) && role.hiredCount < role.maxCount;
              const canFire = role.hiredCount > 0 && !(role.id === 'receptionist' && role.hiredCount <= 1);

              return `
              <div class="staff-card">
                <div class="staff-header-row">
                  <span class="staff-icon">${role.icon}</span>
                  <div class="staff-info-col">
                    <span class="staff-name">${role.name} (${role.hiredCount}/${role.maxCount})</span>
                    <span class="staff-desc">${role.perkDescription}</span>
                  </div>
                  <span class="staff-wage text-muted">$${role.wagePerHour}/hr</span>
                </div>
                <div class="staff-actions-row">
                  <button class="staff-action-btn hire-btn" data-role="${role.id}" ${!canHire ? 'disabled' : ''}>
                    Hire ($${role.hiringCost})
                  </button>
                  <button class="staff-action-btn fire-btn" data-role="${role.id}" ${!canFire ? 'disabled' : ''}>
                    Dismiss
                  </button>
                </div>
              </div>
            `;
            })
            .join('')}
        </div>

        <div class="manage-actions-row" style="margin-top: 18px;">
          <button id="save-game-btn" class="modal-action-btn primary-action-btn">
            💾 Save Game Progress
          </button>
          <button id="reset-game-btn" class="modal-action-btn danger-btn">
            ⚠️ Reset & Start Over
          </button>
        </div>
      </div>
    `;

    this.element.querySelector('#close-stats-btn')?.addEventListener('click', () => this.close());

    // Staff Hire & Dismiss event listeners
    this.element.querySelectorAll('.hire-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const target = e.currentTarget as HTMLElement;
        const roleId = target.dataset.role;
        if (roleId && this.staff.hire(roleId)) {
          SoundManager.getInstance().playCash();
          this.render();
        }
      });
    });

    this.element.querySelectorAll('.fire-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const target = e.currentTarget as HTMLElement;
        const roleId = target.dataset.role;
        if (roleId && this.staff.fire(roleId)) {
          SoundManager.getInstance().playClick();
          this.render();
        }
      });
    });

    // Save Game Progress
    this.element.querySelector('#save-game-btn')?.addEventListener('click', () => {
      const state: GameSaveState = {
        version: 1,
        timestamp: Date.now(),
        economy: {
          cash: this.economy.cash,
          reputation: this.economy.reputation,
          day: this.economy.day,
          timeMinutes: this.economy.timeMinutes
        },
        stations: Array.from(this.placement.stations.values()).map((s) => ({
          id: s.id,
          gridX: s.gridX,
          gridZ: s.gridZ,
          rotationIndex: s.rotationIndex,
          pcLevel: s.currentPC.level,
          chairLevel: s.currentChair.level,
          monitorLevel: s.currentMonitor.level,
          deskLevel: s.currentDesk.level,
          keyboardLevel: s.currentKeyboard.level,
          mouseLevel: s.currentMouse.level,
          speakerLevel: s.currentSpeaker.level
        })),
        facilities: [],
        staff: this.staff.roles.map((r) => ({
          id: r.id,
          hiredCount: r.hiredCount
        }))
      };

      if (SaveManager.getInstance().save(state)) {
        SoundManager.getInstance().playUpgrade();
        alert('Game progress saved successfully! All station tiers, staff, and balance are preserved.');
      }
    });

    // Reset Game Progress
    this.element.querySelector('#reset-game-btn')?.addEventListener('click', () => {
      if (confirm('Are you sure you want to reset your gaming lounge? All progress will be wiped.')) {
        SaveManager.getInstance().clear();
        window.location.reload();
      }
    });
  }

  private setupListeners() {
    this.element.addEventListener('click', (e) => {
      if (e.target === this.element) this.close();
    });
  }
}
