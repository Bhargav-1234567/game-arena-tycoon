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
    if (current && this.operations) current.innerHTML = this.report(this.operations.shift,'Current shift');
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
    return `<article class="employee-card">
      <button class="employee-locate" data-locate="${e.id}" title="Find employee in lounge">${escapeHtml(e.name)} ↗</button>
      <span>${role.name} · $${wage(e)}/hr</span>
      <p data-staff-status="${e.id}">${escapeHtml(this.employeeStatus(e))}</p>
      <label>${e.role==='receptionist' ? 'Assigned counter' : 'Priority'} <select data-priority="${e.id}">${options.map(([id,name])=>`<option value="${escapeHtml(id)}" ${id===e.priority?'selected':''}>${escapeHtml(name)}</option>`).join('')}</select></label>
      <div class="staff-actions-row">
      ${e.raises<MAX_RAISES ? `<button class="staff-action-btn" data-raise="${e.id}">Raise to $${wage(next)}/hr · ${seconds(e)} → ${seconds(next)} s</button>` : '<span>Highest pay grade</span>'}
      <button class="staff-action-btn fire-btn" data-dismiss="${e.id}">Dismiss</button></div></article>`;
  }
  private notice?: HTMLButtonElement;

  public showShiftResult() {
    this.notice?.remove();
    const day = this.operations?.previous?.day;
    if (!day) return;
    const notice = document.createElement('button');
    notice.className = 'shift-notice';
    notice.textContent = 'Day '+day+' complete · View results';
    notice.onclick = () => this.open();
    this.element.parentElement?.append(notice);
    this.notice = notice;
    if (this.isOpen) this.render();
  }

  private report(shift: ShiftResult, title: string) {
    const average = shift.waitSamples ? (shift.waitSeconds / shift.waitSamples).toFixed(1)+' s' : '—';
    return `<section class="shift-report"><h4>${title} · Day ${shift.day}</h4>
      <p>Served ${shift.served} · Lost ${shift.lost} · Average queue wait ${average}</p>
      <p>PC $${shift.pc} · Vending $${shift.vending} · Arcade $${shift.arcade}</p>
      <p>Wages paid $${shift.wages ?? 0} · After payroll $${shift.pc+shift.vending+shift.arcade-(shift.wages ?? 0)}</p>
      <p>Staff jobs ${shift.jobs ?? 0} · Machine downtime ${Math.round(shift.downtime ?? 0)} machine-seconds</p></section>`;
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
            <h3>${tier.name}</h3>
          </div>
          <button id="close-stats-btn" class="close-btn" aria-label="Close management">✕</button>
        </div>

        <nav class="management-links" aria-label="Staff management">
          <button type="button" class="staff-action-btn" data-jump="hiring">Hire staff</button>
          <button type="button" class="staff-action-btn" data-jump="roster">Manage employees</button>
        </nav>
        ${this.operations?.previous ? this.report(this.operations.previous, 'Completed shift') : ''}
        <div data-current-shift>${this.operations ? this.report(this.operations.shift, 'Current shift') : ''}</div>
        <div class="dashboard-grid">
          <div class="dash-card">
            <span class="dash-label">Estimated PC income after payroll</span>
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

        <h4 id="roster" class="section-title">Employees on shift</h4>
        <div class="employee-roster"><p>Isha · Player receptionist · $15/hr</p>
          ${this.staff.employees.map(e=>this.employeeCard(e)).join('')}
          ${this.staff.owed ? `<p>Outstanding payroll $${this.staff.owed}</p>` : ''}
        </div>
        <h4 id="hiring" class="section-title">Hire staff</h4>
        <div class="staff-list">
          ${this.staff.roles
            .map((role) => {
              const player = Number(role.id === 'receptionist');
              const canHire = this.economy.canAfford(role.hiringCost) && role.hiredCount < role.maxCount;


              return `
              <div class="staff-card">
                <div class="staff-header-row">
                  <span class="staff-icon">${role.icon}</span>
                  <div class="staff-info-col">
                    <span class="staff-name">${role.name} (${role.hiredCount-player}/${role.maxCount-player} hired)</span>
                    <span class="staff-desc">${role.perkDescription}</span>
                  </div>
                  <span class="staff-wage text-muted">$${role.wagePerHour}/hr</span>
                </div>
                <div class="staff-actions-row">
                  <button class="staff-action-btn hire-btn" data-role="${role.id}" ${!canHire ? 'disabled' : ''}>
                    Hire ${role.name} ($${role.hiringCost})
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
      if (this.onSave?.()) {
        SoundManager.getInstance().playUpgrade();
        alert('Lounge, parts, diamonds and puzzle progress saved successfully!');
      } else alert('Could not save. Finish placing or moving your item, check browser storage, and try again.');
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
