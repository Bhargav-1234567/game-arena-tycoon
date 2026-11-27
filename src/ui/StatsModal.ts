import type { Workforce } from '../systems/Workforce.ts';
import { JOB_SECONDS, MAX_RAISES, ROLE_JOB, efficiency, wage } from '../data/employees.ts';
import type { Employee } from '../data/employees.ts';
import { escapeHtml } from './html.ts';
import type { LoungeOperations, ShiftResult } from '../systems/LoungeOperations.ts';
import { EconomySystem } from '../systems/EconomySystem.ts';
import { StaffSystem } from '../systems/StaffSystem.ts';
import { PlacementSystem } from '../systems/PlacementSystem.ts';
import { SaveManager } from '../services/SaveManager.ts';
import { SoundManager } from '../services/SoundManager.ts';

export class StatsModal {
  public operations?: LoungeOperations;
  public workforce?: Workforce;
  public onLocate?: (id: string) => void;
  private refreshTime = 0;

  public update(dt: number) {
    if (!this.isOpen) return;
    this.refreshTime += dt;
    if (this.refreshTime < .4) return;
    this.refreshTime = 0;
    for (const e of this.staff.employees) {
      const text = this.element.querySelector<HTMLElement>(`[data-staff-status="${e.id}"]`);
      if (text) text.textContent = this.employeeStatus(e);
    }
    const current = this.element.querySelector('[data-current-shift]');
    if (current && this.operations) current.innerHTML = this.report(this.operations.shift, 'Live Shift');
  }

  private employeeStatus(e: Employee) {
    const w = this.workforce?.workers.get(e.id);
    const progress = w?.progress === undefined ? '' : ' '+Math.round(w.progress*100)+'%';
    return (w?.status ?? 'Arriving')+progress+' · '+e.jobs+(e.jobs===1 ? ' job completed' : ' jobs completed');
  }

  private employeeCard(e: Employee) {
    const next = { ...e, raises:e.raises+1 };
    const role = this.staff.roles.find(r=>r.id===e.role)!;
    const seconds = (entry: Employee) => (e.role === 'receptionist' ? 2/(1+.35*efficiency(entry)) :
      JOB_SECONDS[ROLE_JOB[e.role]]/efficiency(entry)).toFixed(1);
    const options = this.workforce?.priorityOptions(e) ?? [];
    const stars = '★'.repeat(e.raises + 1) + '☆'.repeat(Math.max(0, MAX_RAISES - e.raises));
    return `<article class="employee-card">
      <div class="employee-card-top">
        <div class="employee-avatar">${role.icon}</div>
        <div class="employee-meta">
          <div class="employee-name-row">
            <button class="employee-locate" data-locate="${e.id}" title="Find employee in lounge">${escapeHtml(e.name)} ↗</button>
            <span class="employee-stars" title="Skill Rank">${stars}</span>
          </div>
          <span class="employee-role-badge">${role.name} · <b>$${wage(e)}/hr</b></span>
        </div>
      </div>
      <p class="employee-status-line" data-staff-status="${e.id}">${escapeHtml(this.employeeStatus(e))}</p>
      <label class="employee-select-label"><span>${e.role==='receptionist' ? 'Assigned counter' : 'Priority'}</span> <select data-priority="${e.id}">${options.map(([id,name])=>`<option value="${escapeHtml(id)}" ${id===e.priority?'selected':''}>${escapeHtml(name)}</option>`).join('')}</select></label>
      <div class="staff-actions-row">
      ${e.raises<MAX_RAISES ? `<button class="staff-action-btn promote-btn" data-raise="${e.id}">⬆ Promote ($${wage(next)}/hr · ${seconds(e)}→${seconds(next)}s)</button>` : '<span class="max-rank-pill">★ MAX RANK</span>'}
      <button class="staff-action-btn fire-btn" data-dismiss="${e.id}">Dismiss</button></div></article>`;
  }
  private notice?: HTMLButtonElement;

  public showShiftResult() {
    this.notice?.remove();
    const day = this.operations?.previous?.day;
    if (!day) return;
    const notice = document.createElement('button');
    notice.className = 'shift-notice';
    notice.textContent = '🏆 Day '+day+' complete · View results';
    notice.onclick = () => this.open();
    this.element.parentElement?.append(notice);
    this.notice = notice;
    if (this.isOpen) this.render();
  }

  private report(shift: ShiftResult, title: string) {
    const average = shift.waitSamples ? (shift.waitSeconds / shift.waitSamples).toFixed(1)+' s' : '—';
    const gross = shift.pc + shift.vending + shift.arcade;
    const net = gross - (shift.wages ?? 0);
    return `<section class="shift-report">
      <div class="shift-report-head">
        <h4>${title}</h4>
        <span class="shift-day-pill">DAY ${shift.day}</span>
      </div>
      <div class="shift-score-grid">
        <div class="shift-score-tile"><span>Guests</span><b>${shift.served} served · ${shift.lost} lost</b><small>Avg wait ${average}</small></div>
        <div class="shift-score-tile"><span>Revenue</span><b class="text-teal">$${gross}</b><small>PC $${shift.pc} · Vend $${shift.vending} · Arc $${shift.arcade}</small></div>
        <div class="shift-score-tile"><span>Payroll & Net</span><b class="${net >= 0 ? 'text-amber' : 'text-red'}">${net >= 0 ? '+' : ''}$${net}</b><small>Wages $${shift.wages ?? 0}</small></div>
        <div class="shift-score-tile"><span>Operations</span><b>${shift.jobs ?? 0} jobs</b><small>${Math.round(shift.downtime ?? 0)}s downtime</small></div>
      </div>
    </section>`;
  }
  public onSave?: () => boolean;
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
    this.notice?.remove();
    this.isOpen = true;
    this.element.style.display = 'flex';
    this.render();
    this.element.querySelector('.stats-modal-card')!.scrollTop = 0;
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
    const scrollTop = this.element.querySelector('.stats-modal-card')?.scrollTop ?? 0;
    const tier = this.getLoungeTier();
    let totalStationRev = 0;
    this.placement.stations.forEach((s) => {
      totalStationRev += s.getHourlyRevenue();
    });

    const wages = this.staff.getTotalHourlyWages();
    const netHourly = totalStationRev - wages;
    const valuation = Math.round(this.economy.cash + this.placement.stations.size * 1200 + this.economy.reputation * 30);

    this.element.innerHTML = `
      <div class="stats-modal-card" role="dialog" aria-modal="true" aria-label="Lounge management">
        <div class="modal-header">
          <div class="modal-title-wrap">
            <span class="tier-badge" style="background: ${tier.color};">${tier.badge}</span>
            <div>
              <span class="modal-eyebrow">LOUNGE HQ</span>
              <h3>${tier.name}</h3>
            </div>
          </div>
          <button id="close-stats-btn" class="close-btn game-close-btn" aria-label="Close management">✕</button>
        </div>

        <nav class="management-links" aria-label="Staff management">
          <button type="button" class="staff-action-btn jump-pill" data-jump="roster">👥 Crew Roster</button>
          <button type="button" class="staff-action-btn jump-pill" data-jump="hiring">🤝 Recruit Staff</button>
        </nav>
        ${this.operations?.previous ? this.report(this.operations.previous, 'Completed Shift') : ''}
        <div data-current-shift>${this.operations ? this.report(this.operations.shift, 'Live Shift') : ''}</div>
        <div class="dashboard-grid">
          <div class="dash-card dash-accent-teal">
            <span class="dash-label">⚡ Net PC Income</span>
            <span class="dash-val ${netHourly >= 0 ? 'text-teal' : 'text-red'}">
              ${netHourly >= 0 ? '+' : ''}$${netHourly}/hr
            </span>
          </div>

          <div class="dash-card dash-accent-amber">
            <span class="dash-label">🏆 Arena Valuation</span>
            <span class="dash-val text-amber">$${valuation.toLocaleString()}</span>
          </div>

          <div class="dash-card dash-accent-purple">
            <span class="dash-label">🖥️ Active Rigs</span>
            <span class="dash-val">${this.placement.stations.size} Units</span>
          </div>

          <div class="dash-card dash-accent-slate">
            <span class="dash-label">💳 Staff Payroll</span>
            <span class="dash-val text-muted">-$${wages}/hr</span>
          </div>
        </div>

        <h4 id="roster" class="section-title">Active Shift Crew</h4>
        <div class="employee-roster">
          <div class="player-crew-banner">
            <span class="employee-avatar">🎮</span>
            <div><strong>Isha · Player Receptionist</strong><small>Lead Operator · $15/hr</small></div>
            <span class="player-crew-tag">YOU</span>
          </div>
          ${this.staff.employees.map(e=>this.employeeCard(e)).join('')}
          ${this.staff.owed ? `<p class="owed-payroll-alert">⚠️ Outstanding payroll: $${this.staff.owed}</p>` : ''}
        </div>
        <h4 id="hiring" class="section-title">Recruit Crew</h4>
        <div class="staff-list">
          ${this.staff.roles
            .map((role) => {
              const player = Number(role.id === 'receptionist');
              const canHire = this.economy.canAfford(role.hiringCost) && role.hiredCount < role.maxCount;


              return `
              <div class="staff-card">
                <div class="staff-header-row">
                  <span class="staff-icon-badge">${role.icon}</span>
                  <div class="staff-info-col">
                    <div class="staff-name-row">
                      <span class="staff-name">${role.name}</span>
                      <span class="staff-count-pill">${role.hiredCount-player}/${role.maxCount-player}</span>
                    </div>
                    <span class="staff-desc">${role.perkDescription}</span>
                  </div>
                  <span class="staff-wage">$${role.wagePerHour}/hr</span>
                </div>
                <div class="staff-actions-row">
                  <button class="staff-action-btn hire-btn" data-role="${role.id}" ${!canHire ? 'disabled' : ''}>
                    Hire ${role.name} · $${role.hiringCost}
                  </button>

                </div>
              </div>
            `;
            })
            .join('')}
        </div>

        <p id="save-toast" class="save-toast" role="status" hidden></p>
        <div class="manage-actions-row" style="margin-top: 18px;">
          <button id="save-game-btn" class="modal-action-btn primary-action-btn">
            💾 Save Progress
          </button>
          <button id="reset-game-btn" class="modal-action-btn danger-btn">
            ⚠️ Reset Lounge
          </button>
        </div>
      </div>
    `;

    this.element.querySelector('.stats-modal-card')!.scrollTop = scrollTop;
    this.element.querySelector('#close-stats-btn')?.addEventListener('click', () => this.close());

    this.element.querySelectorAll<HTMLButtonElement>('[data-jump]').forEach(button => {
      button.onclick = () => this.element.querySelector('#'+button.dataset.jump)?.scrollIntoView({block:'start'});
    });

    // Staff Hire & Dismiss event listeners
    this.element.querySelectorAll('.hire-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const target = e.currentTarget as HTMLElement;
        const roleId = target.dataset.role;
        if (roleId && this.staff.hire(roleId)) {
          SoundManager.getInstance().playCash();
          this.render();
          if (roleId === 'receptionist') {
            const employee = this.staff.employees[this.staff.employees.length-1];
            const select = this.element.querySelector<HTMLSelectElement>(`[data-priority="${employee.id}"]`);
            select?.scrollIntoView({block:'center'});
            select?.focus({preventScroll:true});
          }
        }
      });
    });

    for (const e of this.staff.employees) {
      const button = (attr: string) => this.element.querySelector<HTMLButtonElement>(`[data-${attr}="${e.id}"]`);
      button('locate')?.addEventListener('click', () => { this.close(); this.onLocate?.(e.id); });
      button('raise')?.addEventListener('click', () => { if (this.staff.raise(e.id)) this.render(); });
      button('dismiss')?.addEventListener('click', () => { if (this.staff.fire(e.role,e.id)) this.render(); });
      const priority = this.element.querySelector<HTMLSelectElement>(`[data-priority="${e.id}"]`);
      priority?.addEventListener('change', () => {
        this.workforce?.setPriority(e,priority.value);
        if (e.role === 'receptionist') this.render();
      });
    }

    // Save Game Progress
    this.element.querySelector('#save-game-btn')?.addEventListener('click', () => {
      const toast = this.element.querySelector<HTMLElement>('#save-toast');
      if (this.onSave?.()) {
        SoundManager.getInstance().playUpgrade();
        if (toast) {
          toast.textContent = '✅ Lounge, parts, diamonds and puzzle progress saved!';
          toast.className = 'save-toast success';
          toast.hidden = false;
        }
      } else if (toast) {
        toast.textContent = '⚠️ Could not save. Finish placing or moving your item and try again.';
        toast.className = 'save-toast error';
        toast.hidden = false;
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
