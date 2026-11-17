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
import {
  keyboardUpgrades,
  mouseUpgrades,
  speakerUpgrades
} from '../data/peripheral-upgrades.ts';

export class StationInspector {
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

  public onMoveRequested?: (target: {
    type: 'station' | 'reception' | 'facility' | 'object';
    entity: any;
  }) => void;

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

    this.element.querySelector('#close-inspector-btn')?.addEventListener('click', () => {
      this.inspectReception(null);
    });

    this.element.querySelector('#move-item-btn')?.addEventListener('click', () => {
      if (this.onMoveRequested) {
        this.onMoveRequested({ type: 'reception', entity: r });
      }
    });

    if (nextTier) {
      this.element.querySelector('#upgrade-reception-btn')?.addEventListener('click', async () => {
        if (this.economySystem.spend(nextTier.price)) {
          const oldRep = r.currentTier.reputationBonus;
          await r.upgrade(nextTier);
          this.economySystem.addReputation(nextTier.reputationBonus - oldRep);
          this.celebrateUpgrade(r.group.position, 0x38bdf8);
          this.renderReception();
        }
      });
    }
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
        metric2Label: 'Passive Income',
        metric2Val: `+$${f.currentTier.hourlyRevenueBonus ?? 0}/hr 💵`
      },
      vending: {
        badgeText: 'VENDING',
        badgeBg: '#10b981',
        themeHex: 0x10b981,
        icon: '🥤',
        title: 'Vending Machine',
        metric2Label: 'Snack Revenue',
        metric2Val: `+$${f.currentTier.hourlyRevenueBonus ?? 0}/hr 💵`
      },
      sofa: {
        badgeText: 'LOUNGE',
        badgeBg: '#f59e0b',
        themeHex: 0xf59e0b,
        icon: '🛋️',
        title: 'Lounge Seating',
        metric2Label: 'Guest Comfort',
        metric2Val: `+${f.currentTier.level * 25}% Mood 😊`
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
      if (this.onMoveRequested) {
        this.onMoveRequested({ type: 'facility', entity: f });
      }
    });

    if (nextTier) {
      this.element.querySelector('#upgrade-facility-btn')?.addEventListener('click', async () => {
        if (!this.economySystem.canAfford(nextTier.price)) return;
        this.isUpgrading = true;
        try {
          if (this.economySystem.spend(nextTier.price)) {
            const oldRep = f.currentTier.reputationBonus;
            await f.upgrade(nextTier);
            this.economySystem.addReputation(nextTier.reputationBonus - oldRep);
            this.celebrateUpgrade(f.group.position, typeConfig.themeHex);
          }
        } finally {
          this.isUpgrading = false;
          this.renderFacility();
        }
      });
    }
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
        <span class="status-text">${s.isOccupied ? 'Gamer In Session 🎮' : 'Available for Customers ⏳'}</span>
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

      <h4 class="section-title">Hardware & Modular Upgrades (7 Components)</h4>

      <div class="upgrade-list">
        <!-- 1. PC Rig -->
        <div class="upgrade-row">
          <div class="upgrade-info">
            <span class="component-tag">🖥️ PC Rig (Tier ${s.currentPC.level}/4)</span>
            <span class="component-name">${s.currentPC.name}</span>
          </div>
          ${
            nextPC
              ? `<button id="upgrade-pc-btn" class="upgrade-action-btn" ${!this.economySystem.canAfford(nextPC.price) ? 'disabled' : ''}>
                  Upgrade ($${nextPC.price})
                </button>`
              : `<span class="max-badge">MAX</span>`
          }
        </div>

        <!-- 2. Display / Monitor -->
        <div class="upgrade-row">
          <div class="upgrade-info">
            <span class="component-tag">📺 Display (Tier ${s.currentMonitor.level}/4)</span>
            <span class="component-name">${s.currentMonitor.name}</span>
          </div>
          ${
            nextMonitor
              ? `<button id="upgrade-monitor-btn" class="upgrade-action-btn" ${!this.economySystem.canAfford(nextMonitor.price) ? 'disabled' : ''}>
                  Upgrade ($${nextMonitor.price})
                </button>`
              : `<span class="max-badge">MAX</span>`
          }
        </div>

        <!-- 3. Gaming Chair -->
        <div class="upgrade-row">
          <div class="upgrade-info">
            <span class="component-tag">💺 Chair (Tier ${s.currentChair.level}/4)</span>
            <span class="component-name">${s.currentChair.name}</span>
          </div>
          ${
            nextChair
              ? `<button id="upgrade-chair-btn" class="upgrade-action-btn" ${!this.economySystem.canAfford(nextChair.price) ? 'disabled' : ''}>
                  Upgrade ($${nextChair.price})
                </button>`
              : `<span class="max-badge">MAX</span>`
          }
        </div>

        <!-- 4. Gaming Desk -->
        <div class="upgrade-row">
          <div class="upgrade-info">
            <span class="component-tag">🪵 Desk (Tier ${s.currentDesk.level}/4)</span>
            <span class="component-name">${s.currentDesk.name}</span>
          </div>
          ${
            nextDesk
              ? `<button id="upgrade-desk-btn" class="upgrade-action-btn" ${!this.economySystem.canAfford(nextDesk.price) ? 'disabled' : ''}>
                  Upgrade ($${nextDesk.price})
                </button>`
              : `<span class="max-badge">MAX</span>`
          }
        </div>

        <!-- 5. Keyboard -->
        <div class="upgrade-row">
          <div class="upgrade-info">
            <span class="component-tag">⌨️ Keyboard (Tier ${s.currentKeyboard.level}/4)</span>
            <span class="component-name">${s.currentKeyboard.name}</span>
          </div>
          ${
            nextKB
              ? `<button id="upgrade-kb-btn" class="upgrade-action-btn" ${!this.economySystem.canAfford(nextKB.price) ? 'disabled' : ''}>
                  Upgrade ($${nextKB.price})
                </button>`
              : `<span class="max-badge">MAX</span>`
          }
        </div>

        <!-- 6. Mouse -->
        <div class="upgrade-row">
          <div class="upgrade-info">
            <span class="component-tag">🖱️ Mouse (Tier ${s.currentMouse.level}/4)</span>
            <span class="component-name">${s.currentMouse.name}</span>
          </div>
          ${
            nextMouse
              ? `<button id="upgrade-mouse-btn" class="upgrade-action-btn" ${!this.economySystem.canAfford(nextMouse.price) ? 'disabled' : ''}>
                  Upgrade ($${nextMouse.price})
                </button>`
              : `<span class="max-badge">MAX</span>`
          }
        </div>

        <!-- 7. Speakers -->
        <div class="upgrade-row">
          <div class="upgrade-info">
            <span class="component-tag">🔊 Sound (Tier ${s.currentSpeaker.level}/4)</span>
            <span class="component-name">${s.currentSpeaker.name}</span>
          </div>
          ${
            nextSpeaker
              ? `<button id="upgrade-speaker-btn" class="upgrade-action-btn" ${!this.economySystem.canAfford(nextSpeaker.price) ? 'disabled' : ''}>
                  Upgrade ($${nextSpeaker.price})
                </button>`
              : `<span class="max-badge">MAX</span>`
          }
        </div>
      </div>
    `;

    // Button event listeners
    this.element.querySelector('#close-inspector-btn')?.addEventListener('click', () => {
      this.inspectStation(null);
    });

    this.element.querySelector('#move-item-btn')?.addEventListener('click', () => {
      if (this.onMoveRequested) {
        this.onMoveRequested({ type: 'station', entity: s });
      }
    });

    if (nextPC) {
      this.element.querySelector('#upgrade-pc-btn')?.addEventListener('click', async () => {
        if (this.economySystem.spend(nextPC.price)) {
          await s.upgradePC(nextPC);
          this.celebrateUpgrade(s.group.position, 0x0d9488);
          this.renderStation();
        }
      });
    }

    if (nextMonitor) {
      this.element.querySelector('#upgrade-monitor-btn')?.addEventListener('click', async () => {
        if (this.economySystem.spend(nextMonitor.price)) {
          await s.upgradeMonitor(nextMonitor);
          this.celebrateUpgrade(s.group.position, 0x0d9488);
          this.renderStation();
        }
      });
    }

    if (nextChair) {
      this.element.querySelector('#upgrade-chair-btn')?.addEventListener('click', async () => {
        if (this.economySystem.spend(nextChair.price)) {
          await s.upgradeChair(nextChair);
          this.celebrateUpgrade(s.group.position, 0x0d9488);
          this.renderStation();
        }
      });
    }

    if (nextDesk) {
      this.element.querySelector('#upgrade-desk-btn')?.addEventListener('click', async () => {
        if (this.economySystem.spend(nextDesk.price)) {
          await s.upgradeDesk(nextDesk);
          this.celebrateUpgrade(s.group.position, 0x0d9488);
          this.renderStation();
        }
      });
    }

    if (nextKB) {
      this.element.querySelector('#upgrade-kb-btn')?.addEventListener('click', async () => {
        if (this.economySystem.spend(nextKB.price)) {
          await s.upgradeKeyboard(nextKB);
          this.celebrateUpgrade(s.group.position, 0x0d9488);
          this.renderStation();
        }
      });
    }

    if (nextMouse) {
      this.element.querySelector('#upgrade-mouse-btn')?.addEventListener('click', async () => {
        if (this.economySystem.spend(nextMouse.price)) {
          await s.upgradeMouse(nextMouse);
          this.celebrateUpgrade(s.group.position, 0x0d9488);
          this.renderStation();
        }
      });
    }

    if (nextSpeaker) {
      this.element.querySelector('#upgrade-speaker-btn')?.addEventListener('click', async () => {
        if (this.economySystem.spend(nextSpeaker.price)) {
          await s.upgradeSpeaker(nextSpeaker);
          this.celebrateUpgrade(s.group.position, 0x0d9488);
          this.renderStation();
        }
      });
    }
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
      if (this.onMoveRequested) {
        this.onMoveRequested({ type: 'object', entity: obj });
      }
    });
  }
}
