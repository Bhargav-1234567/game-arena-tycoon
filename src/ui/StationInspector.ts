import type { Workforce } from '../systems/Workforce.ts';
import { GamingStation } from '../entities/GamingStation.ts';
import { ReceptionDesk, RECEPTION_TIERS } from '../entities/ReceptionDesk.ts';
import { FacilityEntity } from '../entities/FacilityEntity.ts';
import { EconomySystem } from '../systems/EconomySystem.ts';
import { ParticleSystem } from '../services/ParticleSystem.ts';
import { SoundManager } from '../services/SoundManager.ts';
import { pcUpgrades } from '../data/pc-upgrades.ts';
import { chairUpgrades } from '../data/chair-upgrades.ts';
import { monitorUpgrades } from '../data/monitor-upgrades.ts';
import { deskUpgrades } from '../data/desk-upgrades.ts';
import { getPart, PART_SLOTS, SLOT_LABELS } from '../data/parts.ts';
import type { PartSlot } from '../data/parts.ts';
import type { WorkshopSystem } from '../systems/WorkshopSystem.ts';
import { escapeHtml } from './html.ts';
import {
  keyboardUpgrades,
  mouseUpgrades,
  speakerUpgrades
} from '../data/peripheral-upgrades.ts';

export class StationInspector {
  private workshop?: WorkshopSystem;
  private hardwareError = '';
  private upgradeError = '';

  public setWorkshop(workshop: WorkshopSystem): void {
    this.workshop = workshop;
    workshop.subscribe(() => { if (this.currentStation && !this.isUpgrading) this.renderStation(); });
  }
  private element: HTMLElement;
  private currentStation: GamingStation | null = null;
  private currentReception: ReceptionDesk | null = null;
  private currentFacility: FacilityEntity | null = null;
  private currentObject: THREE.Object3D | null = null;
  public get inspectingObject(): THREE.Object3D | null {
    return this.currentObject;
  }
  private economySystem: EconomySystem;
  private particleSystem?: ParticleSystem;
  private isUpgrading: boolean = false;

  public onMoveRequested?: (target:
    { type: 'station'; entity: GamingStation } | { type: 'reception'; entity: ReceptionDesk } |
    { type: 'facility'; entity: FacilityEntity } | { type: 'object'; entity: THREE.Object3D }
  ) => void;

  constructor(parent: HTMLElement, economySystem: EconomySystem, particleSystem?: ParticleSystem) {
    this.economySystem = economySystem;
    this.particleSystem = particleSystem;
    this.element = document.createElement('div');
    this.element.className = 'station-inspector';
    this.element.style.display = 'none';
    parent.appendChild(this.element);

    this.economySystem.subscribe(() => {
      if (this.isUpgrading) return;
      if (this.currentStation) this.renderStation();
      else if (this.currentReception) this.renderReception();
      else if (this.currentFacility) this.renderFacility();
    });
  }

  public setParticleSystem(particleSystem: ParticleSystem) {
    this.particleSystem = particleSystem;
  }

  public inspect(station: GamingStation | null) {
    this.inspectStation(station);
  }

  public inspectStation(station: GamingStation | null) {
    this.hardwareError = '';
    this.upgradeError = '';
    this.currentReception = null;
    this.currentFacility = null;
    this.currentObject = null;
    this.currentStation = station;
    if (!station) {
      this.element.style.display = 'none';
      return;
    }

    this.element.style.display = 'block';
    this.renderStation();
  }

  public inspectReception(reception: ReceptionDesk | null) {
    this.currentStation = null;
    this.currentFacility = null;
    this.currentObject = null;
    this.currentReception = reception;
    if (!reception) {
      this.element.style.display = 'none';
      return;
    }

    this.element.style.display = 'block';
    this.renderReception();
  }

  public inspectFacility(facility: FacilityEntity | null) {
    this.currentStation = null;
    this.currentReception = null;
    this.currentObject = null;
    this.currentFacility = facility;
    if (!facility) {
      this.element.style.display = 'none';
      return;
    }

    this.element.style.display = 'block';
    this.renderFacility();
  }

  public inspectObject(obj: THREE.Object3D | null) {
    this.currentStation = null;
    this.currentReception = null;
    this.currentFacility = null;
    this.currentObject = obj;
    if (!obj) {
      this.element.style.display = 'none';
      return;
    }

    this.element.style.display = 'block';
    this.renderGenericItem(obj);
  }

  public closeAll() {
    this.currentStation = null;
    this.currentReception = null;
    this.currentFacility = null;
    this.currentObject = null;
    this.element.style.display = 'none';
  }

  private celebrateUpgrade(pos: THREE.Vector3, colorHex: number = 0x0d9488) {
    SoundManager.getInstance().playUpgrade();
    if (this.particleSystem) {
      this.particleSystem.spawnBurst(pos, colorHex, 45);
    }
  }

  public updateStatus(): void {
    const facility = this.currentFacility;
    if (facility && !this.isUpgrading) {
      const label = this.element.querySelector('.status-text');
      const activity = facility.type === 'sofa' ? 'Visitor resting' : facility.type === 'arcade' ? 'Game in progress' : 'Visitor purchasing';
      const status = facility.serviceOwner ? 'Employee assigned' : facility.needsService ? 'Repair at the machine' : facility.type === 'vending' && facility.stock === 0 ? 'Empty · refill at the machine' : facility.inUse ? activity : facility.reservedBy ? 'Reserved for a visitor' : 'Available';
      const stock = facility.type === 'vending' ? ` · Stock ${facility.stock}/${facility.capacity}` : '';
      const text = `${facility.currentTier.name} · ${status}${stock}`;
      if (label && label.textContent !== text) label.textContent = text;
      const busy = !!facility.reservedBy || !!facility.serviceOwner || facility.isUpgrading;
      const move = this.element.querySelector<HTMLButtonElement>('#move-item-btn');
      if (move) move.disabled = busy;
      const upgrade = this.element.querySelector<HTMLButtonElement>('#upgrade-facility-btn');
      const next = facility.getTiers()[facility.currentTier.level];
      if (upgrade && next) upgrade.disabled = busy || !this.economySystem.canAfford(next.price);
      return;
    }
    const station = this.currentStation;
    if (!station || this.isUpgrading) return;
    const status = this.element.querySelector('.status-text');
    if (status) status.textContent = station.accessIssue ? `Unavailable: ${station.accessIssue}` : station.serviceOwner ? 'Technician assigned' : station.needsService ? 'Repair at the PC' : station.isOccupied ? 'Reserved for customer 🎮' : 'Available for customers';
    this.element.querySelector('.inspector-status-card')?.classList.toggle('occupied', station.isOccupied);
    const move = this.element.querySelector<HTMLButtonElement>('#move-item-btn');
    if (move) move.disabled = !!station.serviceOwner || station.isOccupied || !!station.currentGamerId || station.isUpgrading;
    for (const [selector, next] of [['#upgrade-chair-btn', chairUpgrades.find((tier) => tier.level === station.currentChair.level + 1)],
      ['#upgrade-desk-btn', deskUpgrades.find((tier) => tier.level === station.currentDesk.level + 1)]] as const) {
      const button = this.element.querySelector<HTMLButtonElement>(selector);
      if (button && next) button.disabled = !!station.serviceOwner || station.isOccupied || station.isUpgrading || !this.economySystem.canAfford(next.price);
    }
  }

  public workforce?: Workforce;

  public refreshReception(): void {
    if (this.currentReception && !this.isUpgrading) this.renderReception();
  }

  private renderReception() {
    if (!this.currentReception) return;
    const r = this.currentReception;
    const nextTier = RECEPTION_TIERS.find((t) => t.level === r.currentTier.level + 1);

    this.element.innerHTML = `
      <div class="inspector-header">
        <div class="inspector-title">
          <span class="inspector-badge" style="background: #0284c7;">RECEPTION</span>
          <h3>LEVEL ${r.currentTier.level}/4</h3>
        </div>
        <div style="display: flex; gap: 8px; align-items: center;">
          <button id="move-item-btn" class="move-item-btn" title="Reposition this reception counter (M)">
            <span>📦 Move (M)</span>
          </button>
          <button id="close-inspector-btn" class="close-btn">✕</button>
        </div>
      </div>

      <div class="inspector-status-card" style="background: rgba(14, 165, 233, 0.15); color: #38bdf8;">
        <span class="status-dot"></span>
        <span class="status-text">${r.currentTier.name} 🎫</span>
      </div>

      <div class="metrics-grid">
        <div class="metric-item">
          <span class="metric-label">Reputation Bonus</span>
          <span class="metric-val text-teal">+${r.currentTier.reputationBonus} pts ⭐</span>
        </div>
        <div class="metric-item">
          <span class="metric-label">Efficiency</span>
          <span class="metric-val text-purple">+${r.currentTier.level * 25}% Speed</span>
        </div>
      </div>

      <div class="prop-info-card" style="background: rgba(15, 23, 42, 0.6); border: 1px solid var(--border-color); border-radius: 10px; padding: 10px 12px; margin-bottom: 14px;">
        <span class="component-tag" style="color: #38bdf8; font-weight: 700;">Desktop Items (Lvl ${r.currentTier.level}):</span>
        <p style="font-size: 12px; margin-top: 4px; line-height: 1.4; color: #cbd5e1;">${r.currentTier.desktopItems}</p>
      </div>

      <label class="counter-assignment">Assigned receptionist
        <select id="counter-employee">
          <option value="">Unassigned</option>
          ${(this.workforce?.receptionists ?? []).map(e => `<option value="${escapeHtml(e.id)}" ${e.priority===r.id ? 'selected' : ''}>${escapeHtml(e.name)}</option>`).join('')}
        </select>
      </label>
      ${this.workforce?.receptionists.length ? '' : '<p class="counter-hire-hint">Hire a receptionist in Management to staff this counter.</p>'}

      <h4 class="section-title">Front Counter Upgrade</h4>

      <div class="upgrade-list">
        <div class="upgrade-row">
          <div class="upgrade-info">
            <span class="component-tag">${nextTier ? `Upgrade to Tier ${nextTier.level}/4` : 'Maximum Tier'}</span>
            <span class="component-name">${nextTier ? nextTier.name : 'Fully Upgraded Arena Desk'}</span>
          </div>
          ${
            nextTier
              ? `<button id="upgrade-reception-btn" class="upgrade-action-btn" ${!this.economySystem.canAfford(nextTier.price) ? 'disabled' : ''}>
                  Upgrade ($${nextTier.price})
                </button>`
              : `<span class="max-badge">MAX</span>`
          }
        </div>
      </div>
    `;

    const assignment = this.element.querySelector<HTMLSelectElement>('#counter-employee')!;
    assignment.disabled = !this.workforce?.receptionists.length;
    assignment.addEventListener('change', () => this.workforce?.assignReceptionist(r.id, assignment.value || undefined));
    this.element.querySelector('#close-inspector-btn')?.addEventListener('click', () => {
      this.inspectReception(null);
    });

    this.element.querySelector('#move-item-btn')?.addEventListener('click', () => {
      if (!this.isUpgrading && this.onMoveRequested) {
        this.onMoveRequested({ type: 'reception', entity: r });
      }
    });

    if (nextTier) this.bindUpgrade('#upgrade-reception-btn', async (commit) => {
      const oldRep = r.currentTier.reputationBonus;
      await r.upgrade(nextTier, () => commit(nextTier.price));
      this.economySystem.addReputation(nextTier.reputationBonus - oldRep);
      this.celebrateUpgrade(r.group.position, 0x38bdf8);
    });
    this.renderUpgradeState();
  }

  private renderFacility() {
    if (!this.currentFacility) return;
    const f = this.currentFacility;
    const tiers = f.getTiers();
    const nextTier = tiers.find((t) => t.level === f.currentTier.level + 1);

    const typeConfig = {
      arcade: {
        badgeText: 'ARCADE',
        badgeBg: '#8b5cf6',
        themeHex: 0x8b5cf6,
        icon: '🕹️',
        title: 'Retro Arcade Cabinet',
        metric2Label: 'Completed game',
        metric2Val: `$${f.currentTier.pricePerUse} / play`
      },
      vending: {
        badgeText: 'VENDING',
        badgeBg: '#10b981',
        themeHex: 0x10b981,
        icon: '🥤',
        title: 'Vending Machine',
        metric2Label: 'Completed purchase',
        metric2Val: `$${f.currentTier.pricePerUse} / sale`
      },
      sofa: {
        badgeText: 'LOUNGE',
        badgeBg: '#f59e0b',
        themeHex: 0xf59e0b,
        icon: '🛋️',
        title: 'Lounge Seating',
        metric2Label: 'Visitor seating',
        metric2Val: 'Free'
      }
    }[f.type];

    this.element.innerHTML = `
      <div class="inspector-header">
        <div class="inspector-title">
          <span class="inspector-badge" style="background: ${typeConfig.badgeBg};">${typeConfig.badgeText}</span>
          <h3>LEVEL ${f.currentTier.level}/4</h3>
        </div>
        <div style="display: flex; gap: 8px; align-items: center;">
          <button id="move-item-btn" class="move-item-btn" title="Reposition this facility (M)">
            <span>📦 Move (M)</span>
          </button>
          <button id="close-inspector-btn" class="close-btn">✕</button>
        </div>
      </div>

      <div class="inspector-status-card" style="background: rgba(15, 23, 42, 0.7); color: #f8fafc; border: 1px solid var(--border-color);">
        <span class="status-dot" style="background: ${typeConfig.badgeBg};"></span>
        <span class="status-text">${f.currentTier.name} ${typeConfig.icon}</span>
      </div>

      <div class="metrics-grid">
        <div class="metric-item">
          <span class="metric-label">Reputation Bonus</span>
          <span class="metric-val text-teal">+${f.currentTier.reputationBonus} pts ⭐</span>
        </div>
        <div class="metric-item">
          <span class="metric-label">${typeConfig.metric2Label}</span>
          <span class="metric-val text-purple">${typeConfig.metric2Val}</span>
        </div>
      </div>

      <div class="prop-info-card" style="background: rgba(15, 23, 42, 0.6); border: 1px solid var(--border-color); border-radius: 10px; padding: 10px 12px; margin-bottom: 14px;">
        <span class="component-tag" style="color: ${typeConfig.badgeBg}; font-weight: 700;">Features & Perks:</span>
        <p style="font-size: 12px; margin-top: 4px; line-height: 1.4; color: #cbd5e1;">${f.currentTier.perkDescription}</p>
      </div>

      <h4 class="section-title">${typeConfig.title} Upgrade</h4>

      <div class="upgrade-list">
        <div class="upgrade-row">
          <div class="upgrade-info">
            <span class="component-tag">${nextTier ? `Upgrade to Tier ${nextTier.level}/4` : 'Maximum Tier Reached'}</span>
            <span class="component-name">${nextTier ? nextTier.name : 'Fully Maxed Out ' + typeConfig.icon}</span>
          </div>
          ${
            nextTier
              ? `<button id="upgrade-facility-btn" class="upgrade-action-btn" ${!this.economySystem.canAfford(nextTier.price) ? 'disabled' : ''}>
                  Upgrade ($${nextTier.price})
                </button>`
              : `<span class="max-badge">MAX</span>`
          }
        </div>
      </div>
    `;

    this.element.querySelector('#close-inspector-btn')?.addEventListener('click', () => {
      this.inspectFacility(null);
    });

    this.element.querySelector('#move-item-btn')?.addEventListener('click', () => {
      if (!this.isUpgrading && this.onMoveRequested) {
        this.onMoveRequested({ type: 'facility', entity: f });
      }
    });

    if (nextTier) this.bindUpgrade('#upgrade-facility-btn', async (commit) => {
      const oldRep = f.currentTier.reputationBonus;
      await f.upgrade(nextTier, () => commit(nextTier.price));
      this.economySystem.addReputation(nextTier.reputationBonus - oldRep);
      this.celebrateUpgrade(f.group.position, typeConfig.themeHex);
    });
    this.renderUpgradeState();
  }

  private renderTierPips(level: number, max: number = 4): string {
    return `<span class="tier-pips" aria-label="Tier ${level} of ${max}">${Array.from({ length: max }, (_, i) => `<i class="${i < level ? 'on' : ''}"></i>`).join('')}</span>`;
  }

  private renderStation() {
    if (!this.currentStation) return;
    const s = this.currentStation;

    const nextPC = pcUpgrades.find((u) => u.level === s.currentPC.level + 1);
    const nextChair = chairUpgrades.find((u) => u.level === s.currentChair.level + 1);
    const nextMonitor = monitorUpgrades.find((u) => u.level === s.currentMonitor.level + 1);
    const nextDesk = deskUpgrades.find((u) => u.level === s.currentDesk.level + 1);
    const nextKB = keyboardUpgrades.find((u) => u.level === s.currentKeyboard.level + 1);
    const nextMouse = mouseUpgrades.find((u) => u.level === s.currentMouse.level + 1);
    const nextSpeaker = speakerUpgrades.find((u) => u.level === s.currentSpeaker.level + 1);

    this.element.innerHTML = `
      <div class="inspector-header">
        <div class="inspector-title">
          <span class="inspector-badge">STATION</span>
          <h3>#${s.id.slice(-4).toUpperCase()}</h3>
        </div>
        <div style="display: flex; gap: 8px; align-items: center;">
          <button id="move-item-btn" class="move-item-btn" title="Reposition this gaming station (M)">
            <span>📦 Move (M)</span>
          </button>
          <button id="close-inspector-btn" class="close-btn">✕</button>
        </div>
      </div>

      <div class="inspector-status-card ${s.isOccupied ? 'occupied' : 'idle'}">
        <span class="status-dot"></span>
        <span class="status-text">${s.accessIssue ? `Unavailable: ${escapeHtml(s.accessIssue)}` : s.isOccupied ? 'Reserved for customer 🎮' : 'Available for customers'}</span>
      </div>

      <div class="metrics-grid">
        <div class="metric-item">
          <span class="metric-label">Hourly Revenue</span>
          <span class="metric-val text-teal">+$${s.getHourlyRevenue()}/hr</span>
        </div>
        <div class="metric-item">
          <span class="metric-label">Satisfaction</span>
          <span class="metric-val text-purple">${s.getSatisfactionScore()} pts</span>
        </div>
      </div>

      ${this.renderHardware(s.id)}
      <h4 class="section-title">Hardware & Modular Upgrades (7 Components)</h4>

      <div class="upgrade-list">
        <!-- 1. PC Rig -->
        <div class="upgrade-row">
          <div class="upgrade-info">
            <div class="upgrade-tag-row"><span class="component-tag">🖥️ PC Rig</span>${this.renderTierPips(s.currentPC.level)}</div>
            <span class="component-name">${s.currentPC.name}</span>
          </div>
          ${
            nextPC
              ? `<button id="upgrade-pc-btn" class="upgrade-action-btn" ${!this.economySystem.canAfford(nextPC.price) ? 'disabled' : ''}>
                  ⬆ $${nextPC.price}
                </button>`
              : `<span class="max-badge">★ MAX</span>`
          }
        </div>

        <!-- 2. Display / Monitor -->
        <div class="upgrade-row">
          <div class="upgrade-info">
            <div class="upgrade-tag-row"><span class="component-tag">📺 Display</span>${this.renderTierPips(s.currentMonitor.level)}</div>
            <span class="component-name">${s.currentMonitor.name}</span>
          </div>
          ${
            nextMonitor
              ? `<button id="upgrade-monitor-btn" class="upgrade-action-btn" ${!this.economySystem.canAfford(nextMonitor.price) ? 'disabled' : ''}>
                  ⬆ $${nextMonitor.price}
                </button>`
              : `<span class="max-badge">★ MAX</span>`
          }
        </div>

        <!-- 3. Gaming Chair -->
        <div class="upgrade-row">
          <div class="upgrade-info">
            <div class="upgrade-tag-row"><span class="component-tag">💺 Chair</span>${this.renderTierPips(s.currentChair.level)}</div>
            <span class="component-name">${s.currentChair.name}</span>
          </div>
          ${
            nextChair
              ? `<button id="upgrade-chair-btn" class="upgrade-action-btn" ${!this.economySystem.canAfford(nextChair.price) ? 'disabled' : ''}>
                  ⬆ $${nextChair.price}
                </button>`
              : `<span class="max-badge">★ MAX</span>`
          }
        </div>

        <!-- 4. Gaming Desk -->
        <div class="upgrade-row">
          <div class="upgrade-info">
            <div class="upgrade-tag-row"><span class="component-tag">🪵 Desk</span>${this.renderTierPips(s.currentDesk.level)}</div>
            <span class="component-name">${s.currentDesk.name}</span>
          </div>
          ${
            nextDesk
              ? `<button id="upgrade-desk-btn" class="upgrade-action-btn" ${!this.economySystem.canAfford(nextDesk.price) ? 'disabled' : ''}>
                  ⬆ $${nextDesk.price}
                </button>`
              : `<span class="max-badge">★ MAX</span>`
          }
        </div>

        <!-- 5. Keyboard -->
        <div class="upgrade-row">
          <div class="upgrade-info">
            <div class="upgrade-tag-row"><span class="component-tag">⌨️ Keyboard</span>${this.renderTierPips(s.currentKeyboard.level)}</div>
            <span class="component-name">${s.currentKeyboard.name}</span>
          </div>
          ${
            nextKB
              ? `<button id="upgrade-kb-btn" class="upgrade-action-btn" ${!this.economySystem.canAfford(nextKB.price) ? 'disabled' : ''}>
                  ⬆ $${nextKB.price}
                </button>`
              : `<span class="max-badge">★ MAX</span>`
          }
        </div>

        <!-- 6. Mouse -->
        <div class="upgrade-row">
          <div class="upgrade-info">
            <div class="upgrade-tag-row"><span class="component-tag">🖱️ Mouse</span>${this.renderTierPips(s.currentMouse.level)}</div>
            <span class="component-name">${s.currentMouse.name}</span>
          </div>
          ${
            nextMouse
              ? `<button id="upgrade-mouse-btn" class="upgrade-action-btn" ${!this.economySystem.canAfford(nextMouse.price) ? 'disabled' : ''}>
                  ⬆ $${nextMouse.price}
                </button>`
              : `<span class="max-badge">★ MAX</span>`
          }
        </div>

        <!-- 7. Speakers -->
        <div class="upgrade-row">
          <div class="upgrade-info">
            <div class="upgrade-tag-row"><span class="component-tag">🔊 Sound</span>${this.renderTierPips(s.currentSpeaker.level)}</div>
            <span class="component-name">${s.currentSpeaker.name}</span>
          </div>
          ${
            nextSpeaker
              ? `<button id="upgrade-speaker-btn" class="upgrade-action-btn" ${!this.economySystem.canAfford(nextSpeaker.price) ? 'disabled' : ''}>
                  ⬆ $${nextSpeaker.price}
                </button>`
              : `<span class="max-badge">★ MAX</span>`
          }
        </div>
      </div>
    `;

    this.element.querySelectorAll<HTMLButtonElement>('[data-hardware-attach], [data-hardware-detach]').forEach((button) => {
      button.addEventListener('click', () => {
        this.hardwareError = '';
        try {
          if (button.dataset.hardwareDetach) this.workshop?.detach(button.dataset.hardwareDetach, s.id);
          else {
            const slot = button.dataset.hardwareAttach as PartSlot;
            const select = this.element.querySelector<HTMLSelectElement>(`[data-hardware-select="${slot}"]`);
            if (select?.value) this.workshop?.attach(select.value, s.id, slot);
          }
        } catch (error) { this.hardwareError = error instanceof Error ? error.message : 'Unable to update this part.'; }
        this.renderStation();
      });
    });

    // Button event listeners
    this.element.querySelector('#close-inspector-btn')?.addEventListener('click', () => {
      this.inspectStation(null);
    });

    this.element.querySelector('#move-item-btn')?.addEventListener('click', () => {
      if (!this.isUpgrading && this.onMoveRequested) {
        this.onMoveRequested({ type: 'station', entity: s });
      }
    });

    if (nextPC) this.bindUpgrade('#upgrade-pc-btn', async (commit) => {
      await s.upgradePC(nextPC, () => commit(nextPC.price));
      this.celebrateUpgrade(s.group.position);
    });
    if (nextMonitor) this.bindUpgrade('#upgrade-monitor-btn', async (commit) => {
      await s.upgradeMonitor(nextMonitor, () => commit(nextMonitor.price));
      this.celebrateUpgrade(s.group.position);
    });
    if (nextChair) this.bindUpgrade('#upgrade-chair-btn', async (commit) => {
      await s.upgradeChair(nextChair, () => commit(nextChair.price));
      this.celebrateUpgrade(s.group.position);
    });
    if (nextDesk) this.bindUpgrade('#upgrade-desk-btn', async (commit) => {
      await s.upgradeDesk(nextDesk, () => commit(nextDesk.price));
      this.celebrateUpgrade(s.group.position);
    });
    if (nextKB) this.bindUpgrade('#upgrade-kb-btn', async (commit) => {
      await s.upgradeKeyboard(nextKB, () => commit(nextKB.price));
      this.celebrateUpgrade(s.group.position);
    });
    if (nextMouse) this.bindUpgrade('#upgrade-mouse-btn', async (commit) => {
      await s.upgradeMouse(nextMouse, () => commit(nextMouse.price));
      this.celebrateUpgrade(s.group.position);
    });
    if (nextSpeaker) this.bindUpgrade('#upgrade-speaker-btn', async (commit) => {
      await s.upgradeSpeaker(nextSpeaker, () => commit(nextSpeaker.price));
      this.celebrateUpgrade(s.group.position);
    });
    const move = this.element.querySelector<HTMLButtonElement>('#move-item-btn')!;
    move.disabled = !!s.serviceOwner || s.isOccupied || !!s.currentGamerId || s.isUpgrading;
    if (move.disabled) move.title = 'Wait for the customer or upgrade to finish before moving this PC.';
    if (s.isOccupied) this.element.querySelectorAll<HTMLButtonElement>('#upgrade-chair-btn, #upgrade-desk-btn').forEach((button) => {
      button.disabled = true; button.title = 'Wait for the customer to leave before changing chair or desk geometry.';
    });
    if (s.accessIssue) {
      const warning = document.createElement('p'); warning.className = 'upgrade-error'; warning.textContent = s.accessIssue;
      this.element.prepend(warning);
    }
    this.renderUpgradeState();
  }

  private renderUpgradeState(): void {
    if (this.upgradeError) {
      const error = document.createElement('p'); error.className = 'upgrade-error'; error.setAttribute('role', 'alert');
      error.textContent = this.upgradeError; this.element.append(error);
    }
    if (this.isUpgrading) this.element.querySelectorAll<HTMLButtonElement>('button:not(#close-inspector-btn)').forEach((button) => { button.disabled = true; });
  }

  private bindUpgrade(selector: string, action: (commit: (price: number) => boolean) => Promise<void>): void {
    this.element.querySelector(selector)?.addEventListener('click', async () => {
      if (this.isUpgrading) return;
      this.isUpgrading = true; this.upgradeError = '';
      this.renderUpgradeState();
      try { await action((price) => this.economySystem.spend(price)); }
      catch (error) { this.upgradeError = error instanceof Error ? error.message : 'The upgrade could not be loaded. Please try again.'; }
      finally {
        this.isUpgrading = false;
        if (this.currentStation) this.renderStation();
        else if (this.currentReception) this.renderReception();
        else if (this.currentFacility) this.renderFacility();
      }
    });
  }

  private renderGenericItem(obj: THREE.Object3D) {
    const item = obj.userData?.item;
    const name = item?.name || obj.name || 'Placed Item';
    const category = item?.category ? item.category.toUpperCase() : 'ITEM';

    this.element.innerHTML = `
      <div class="inspector-header">
        <div class="inspector-title">
          <span class="inspector-badge" style="background: #475569;">${category}</span>
          <h3 style="font-size: 15px;">${name}</h3>
        </div>
        <div style="display: flex; gap: 8px; align-items: center;">
          <button id="move-item-btn" class="move-item-btn" title="Reposition this item (M)">
            <span>📦 Move (M)</span>
          </button>
          <button id="close-inspector-btn" class="close-btn">✕</button>
        </div>
      </div>

      <div class="inspector-status-card" style="background: rgba(15, 23, 42, 0.7); color: #f8fafc; border: 1px solid var(--border-color);">
        <span class="status-dot" style="background: #38bdf8;"></span>
        <span class="status-text">${item?.description || 'Placed in your gaming lounge.'}</span>
      </div>

      <div class="prop-info-card" style="background: rgba(15, 23, 42, 0.6); border: 1px solid var(--border-color); border-radius: 10px; padding: 12px; margin-top: 14px;">
        <p style="font-size: 13px; color: #cbd5e1; line-height: 1.5;">Press <b>M</b> or click <b>📦 Move</b> to pick up this item, rotate with <b>R</b>, and place it in any open floor spot.</p>
      </div>
    `;

    this.element.querySelector('#close-inspector-btn')?.addEventListener('click', () => {
      this.inspectObject(null);
    });

    this.element.querySelector('#move-item-btn')?.addEventListener('click', () => {
      if (!this.isUpgrading && this.onMoveRequested) {
        this.onMoveRequested({ type: 'object', entity: obj });
      }
    });
  }

  private renderHardware(stationId: string): string {
    if (!this.workshop) return '';
    const parts = this.workshop.state.parts;
    return `<section class="hardware-slots"><div class="hardware-slots-head"><h4>⚡ Rig Loadout Slots</h4><span class="hardware-hint">Puzzle Lab Gear</span></div>
      ${PART_SLOTS.map((slot) => {
        const installed = parts.find((part) => part.stationId === stationId && getPart(part.partId).slot === slot);
        const free = parts.filter((part) => !part.stationId && getPart(part.partId).slot === slot);
        const installedDef = installed ? getPart(installed.partId) : null;
        return `<div class="hardware-slot ${installed ? 'equipped' : 'empty'}" data-hardware-slot="${slot}">
          <div class="hardware-slot-top">
            <span class="slot-badge chip-${slot}">${slot.toUpperCase()}</span>
            <div class="slot-title-col">
              <strong>${SLOT_LABELS[slot]}</strong>
              <p class="slot-installed-name">${installedDef ? `${installedDef.name} · T${installedDef.tier}` : 'Empty Socket'}</p>
            </div>
            <small class="slot-avail-pill ${free.length ? 'has-free' : ''}">${free.length} free</small>
          </div>
          ${installed || free.length ? `<div class="hardware-slot-actions">
            ${free.length ? `<select data-hardware-select="${slot}" aria-label="${SLOT_LABELS[slot]} part">${free.map((part) => `<option value="${escapeHtml(part.id)}">${getPart(part.partId).name}</option>`).join('')}</select>
            <button class="slot-attach-btn" data-hardware-attach="${slot}">${installed ? 'Replace (old part returns to inventory)' : 'Equip'}</button>` : ''}
            ${installed ? `<button class="slot-detach-btn" data-hardware-detach="${escapeHtml(installed.id)}">Detach</button>` : ''}
          </div>` : ''}</div>`;
      }).join('')}<p class="hardware-error" role="alert">${escapeHtml(this.hardwareError)}</p></section>`;
  }
}
