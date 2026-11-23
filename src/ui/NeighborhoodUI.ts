import * as THREE from 'three';
import { BUS_PASSENGERS, DISTRICT_PLACES } from '../data/world-layout.ts';
import type { WorldLocation } from '../data/world-layout.ts';
import { CAFE_PRICE, EVENT_GOAL, FRONTAGE_NAMES, FRONTAGE_PRICES } from '../systems/NeighborhoodSystem.ts';
import type { NeighborhoodSystem, WorldLighting, WorldView } from '../systems/NeighborhoodSystem.ts';
import { escapeHtml } from './html.ts';

export class NeighborhoodUI {
  private root: HTMLDivElement;
  private toolbar: HTMLDivElement;
  private labels: HTMLDivElement;
  private dialog: HTMLDivElement;
  private system: NeighborhoodSystem;
  private selected: WorldLocation | 'guide' | null = null;
  private error = '';
  private lastFocus: HTMLElement | null = null;
  public onView?: (view: WorldView) => void;
  public onPuzzle?: () => void;
  public onExpand?: () => Promise<boolean>;
  public onZoom?: (factor: number) => void;
  public onModalChange?: (open: boolean) => void;
  public canOpen: () => boolean = () => true;
  public getExpansion: () => { stage: number; price: number; name: string } = () => ({ stage: 0, price: 500, name: 'North VIP Wing' });

  constructor(parent: HTMLElement, system: NeighborhoodSystem) {
    this.system = system;
    this.root = document.createElement('div'); this.root.className = 'district-ui';
    this.toolbar = document.createElement('div'); this.toolbar.className = 'district-toolbar';
    this.labels = document.createElement('div'); this.labels.className = 'district-labels';
    this.dialog = document.createElement('div'); this.dialog.className = 'district-backdrop'; this.dialog.hidden = true;
    this.labels.innerHTML = DISTRICT_PLACES.map((place) => `<button class="world-hotspot" data-place="${place.id}"><span>${({ lounge: '⌂', workshop: '🧩', cafe: '☕', plaza: '🏆', bus: '▣', parking: 'P', expansion: '+' })[place.id]}</span>${place.label}</button>`).join('');
    this.root.append(this.labels, this.toolbar, this.dialog); parent.append(this.root);
    this.root.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
      if (!button || button.disabled || !this.canOpen()) return;
      if (button.dataset.place) this.open(button.dataset.place as WorldLocation);
      else if (button.dataset.view) { this.close(); this.onView?.(button.dataset.view as WorldView); }
      else if (button.dataset.zoom) this.onZoom?.(Number(button.dataset.zoom));
      else void this.action(button.dataset.worldAction ?? '');
    });
    this.root.addEventListener('change', (event) => {
      if ((event.target as HTMLElement).id === 'district-lighting') {
        this.run(() => this.system.setLighting((event.target as HTMLSelectElement).value as WorldLighting));
      }
    });
    window.addEventListener('keydown', (event) => {
      if (!this.isOpen) return;
      event.stopImmediatePropagation();
      if (event.key === 'Escape') { event.preventDefault(); this.close(); }
      if (event.key === 'Tab') {
        const controls = [...this.dialog.querySelectorAll<HTMLElement>('button:not(:disabled), input, select')];
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && (document.activeElement === first || !this.dialog.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || !this.dialog.contains(document.activeElement))) { event.preventDefault(); first?.focus(); }
      }
    }, true);
    system.subscribe(() => this.updateSummary()); this.renderToolbar();
  }

  get isOpen(): boolean { return this.selected !== null; }
  close(): void { this.selected = null; this.dialog.hidden = true; this.onModalChange?.(false); this.lastFocus?.focus(); }
  open(place: WorldLocation | 'guide'): void {
    if (!this.canOpen()) return;
    if (place === 'lounge') { this.close(); this.onView?.('lounge'); return; }
    if (place === 'workshop') { this.close(); this.onPuzzle?.(); return; }
    this.lastFocus = document.activeElement as HTMLElement; this.selected = place; this.error = ''; this.dialog.hidden = false;
    this.onModalChange?.(true); this.renderDialog(); this.dialog.querySelector<HTMLElement>('[data-world-action="close"]')?.focus();
  }

  refresh(): void { this.renderToolbar(); this.updateSummary(); if (this.isOpen) this.renderDialog(); }
  private renderToolbar(): void {
    const state = this.system.state;
    this.toolbar.innerHTML = `<div class="district-title"><span>PIXEL DISTRICT</span><strong data-shop-name>${escapeHtml(state.shopName)}</strong><small data-district-status></small></div>
      <div class="world-view-switch" role="group" aria-label="Camera view"><button data-view="lounge" aria-pressed="${state.view === 'lounge'}">⌂ Lounge</button><button data-view="neighborhood" aria-pressed="${state.view === 'neighborhood'}">▦ Neighborhood</button></div>
      <div class="district-tools"><label>Lighting<select id="district-lighting"><option value="evening">Evening</option><option value="day">Day</option><option value="night">Night</option><option value="auto">Day / night cycle</option></select></label>
      <button data-zoom="0.8" aria-label="Zoom in">+</button><button data-zoom="1.25" aria-label="Zoom out">−</button><button data-world-action="guide">District guide</button><button data-place="expansion">Property</button></div>`;
    this.toolbar.querySelector<HTMLSelectElement>('#district-lighting')!.value = state.lighting;
    this.root.dataset.view = state.view; this.updateSummary();
  }

  private updateSummary(): void {
    const state = this.system.state;
    this.root.dataset.view = state.view;
    this.toolbar.querySelector('[data-shop-name]')!.textContent = state.shopName;
    this.toolbar.querySelector('[data-district-status]')!.textContent = state.event?.status === 'active'
      ? `Cup: ${state.event.served}/${EVENT_GOAL} served · ${Math.ceil(state.event.remaining)}s left`
      : `Next bus in ${Math.ceil(state.busIn)}s · ${FRONTAGE_NAMES[state.frontageLevel]}`;
    this.toolbar.querySelectorAll<HTMLElement>('[data-view]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.view === state.view)));
    const status = this.dialog.querySelector('[data-event-status]');
    if (status) status.textContent = state.event?.status === 'active'
      ? `${state.event.served}/${EVENT_GOAL} customers served · ${Math.ceil(state.event.remaining)} seconds remaining`
      : state.event?.status === 'won' ? 'Champion! $500 and +5 reputation have been saved.'
        : state.event?.status === 'expired' ? 'Time is up. Your next attempt is free.' : 'Ready for your first neighborhood title?';
    const start = this.dialog.querySelector<HTMLButtonElement>('[data-world-action="tournament"]'); if (start) start.disabled = state.event?.status === 'active';
    const bus = this.dialog.querySelector('[data-bus-status]'); if (bus) bus.textContent = `Next scheduled bus in ${Math.ceil(state.busIn)} seconds.`;
  }

  private renderDialog(): void {
    const state = this.system.state, expansion = this.getExpansion();
    const title = this.selected === 'guide' ? 'Welcome to Pixel District' : DISTRICT_PLACES.find((place) => place.id === this.selected)?.label ?? 'Your property';
    let content = '';
    if (this.selected === 'expansion') content = `<p>Your gaming lounge has room for six wings. Neighboring businesses stay outside the reserved land.</p>
      <label>Lounge name<input id="lounge-name" maxlength="28" value="${escapeHtml(state.shopName)}" autocomplete="off"></label><button data-world-action="rename" class="workshop-secondary">Save lounge name</button>
      <div class="district-card"><span>STOREFRONT · LEVEL ${state.frontageLevel}/3</span><h3>${FRONTAGE_NAMES[state.frontageLevel]}</h3><p>Neon signs, awnings, planters and entrance lights make your lounge a district landmark. Each upgrade adds +2 reputation and attracts visitors faster.</p>
      <button class="workshop-primary" data-world-action="frontage" ${state.frontageLevel >= 3 ? 'disabled' : ''}>${state.frontageLevel >= 3 ? 'Frontage complete' : `Upgrade frontage · $${FRONTAGE_PRICES[state.frontageLevel]}`}</button></div>
      <div class="district-card"><span>BUILDING · ${expansion.stage}/6 WINGS</span><h3>${escapeHtml(expansion.name)}</h3><p>New floor space, a larger roof and a short construction animation. Existing PCs and attached parts stay in place.</p>
      <button class="workshop-primary" data-world-action="expand" ${expansion.stage >= 6 ? 'disabled' : ''}>${expansion.stage >= 6 ? 'All six wings complete' : `Build next wing · $${expansion.price.toLocaleString()}`}</button></div>`;
    else if (this.selected === 'cafe') content = `<div class="district-hero">☕</div><h3>Good games. Great neighbors.</h3><p>Partner with Pixel Bites to offer snacks to your players. Every gaming customer receives +5 satisfaction while the partnership is active.</p>
      <button class="workshop-primary" data-world-action="cafe" ${state.cafePartner ? 'disabled' : ''}>${state.cafePartner ? 'Café partnership active · +5 satisfaction' : `Partner with the café · $${CAFE_PRICE}`}</button>`;
    else if (this.selected === 'plaza') content = `<div class="district-hero">🏆</div><h3>Neighborhood Cup</h3><p>Serve ${EVENT_GOAL} paying gaming customers within 120 seconds to earn $500 and +5 reputation. Entry is free. Time pauses while you play puzzles or manage your parts.</p>
      <div class="district-card"><strong data-event-status></strong><p>District titles won: ${state.eventsWon}</p></div><button class="workshop-primary" data-world-action="tournament">Start tournament</button>`;
    else if (this.selected === 'bus') content = `<div class="district-hero">▣</div><h3>Circuit Line arrivals</h3><p>Each bus brings ${BUS_PASSENGERS} visitors. They use the zebra crossing and wait outside until a reception place or lounge facility opens up.</p><p data-bus-status></p>`;
    else if (this.selected === 'parking') content = `<div class="district-hero">P</div><h3>Visitor parking & bicycle racks</h3><p>A small parking area and bicycle stands give the street a welcoming entrance. The pavement and doorway remain clear for customers.</p>`;
    else content = `<p>Your lounge is the heart of a compact gaming neighborhood. Pan with right-drag or one finger; zoom with the wheel, pinch or the + / − buttons.</p>
      <div class="district-guide">${DISTRICT_PLACES.map((place) => `<button class="workshop-secondary" data-place="${place.id}">${place.label} →</button>`).join('')}</div>
      <p>Grow from a local gaming corner into the district flagship. Play puzzles at Build & Boot, connect earned hardware to your PCs, partner with the café and compete in the Neighborhood Cup.</p>`;
    this.dialog.innerHTML = `<section class="district-dialog" role="dialog" aria-modal="true" aria-labelledby="district-dialog-title"><header><div><span>PIXEL DISTRICT</span><h2 id="district-dialog-title">${title}</h2></div><button data-world-action="close" aria-label="Close district panel">✕</button></header>
      <p class="workshop-error" role="alert" ${this.error ? '' : 'hidden'}>${escapeHtml(this.error)}</p>${content}<footer>Your lounge stays open while you explore the district.</footer></section>`;
    this.updateSummary();
  }

  private run(action: () => void): void {
    this.error = '';
    try { action(); } catch (error) { this.error = error instanceof Error ? error.message : 'Please try again.'; }
    this.renderToolbar(); if (this.isOpen) this.renderDialog();
  }

  private async action(action: string): Promise<void> {
    if (action === 'close') { this.close(); return; }
    if (action === 'guide') { this.open('guide'); return; }
    if (action === 'expand') {
      const button = this.dialog.querySelector<HTMLButtonElement>('[data-world-action="expand"]'); if (button) button.disabled = true;
      try { if (!await this.onExpand?.()) this.error = 'This wing could not be built. Check your cash and try again.'; }
      catch (error) { this.error = error instanceof Error ? error.message : 'Please try again.'; }
      this.renderDialog(); return;
    }
    this.run(() => {
      if (action === 'rename') this.system.rename(this.dialog.querySelector<HTMLInputElement>('#lounge-name')!.value);
      else if (action === 'frontage') this.system.upgradeFrontage();
      else if (action === 'cafe') this.system.partnerCafe();
      else if (action === 'tournament') this.system.startEvent();
    });
  }

  update(camera: THREE.Camera): void {
    const state = this.system.state;
    this.labels.hidden = state.view !== 'neighborhood';
    if (this.labels.hidden) return;
    for (const place of DISTRICT_PLACES) {
      const point = new THREE.Vector3(place.x, place.y, place.z).project(camera);
      const button = this.labels.querySelector<HTMLElement>(`[data-place="${place.id}"]`)!;
      button.hidden = Math.abs(point.x) > .98 || Math.abs(point.y) > .95 || point.z < -1 || point.z > 1;
      button.style.left = `${(point.x + 1) / 2 * window.innerWidth}px`;
      button.style.top = `${(1 - point.y) / 2 * window.innerHeight}px`;
    }
  }
}
