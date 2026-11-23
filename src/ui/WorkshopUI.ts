import { getPart, HARDWARE_PARTS } from '../data/parts.ts';
import type { PartSlot } from '../data/parts.ts';
import { BOARD_SIZE, MatchBoard } from '../puzzle/MatchBoard.ts';
import type { PuzzleCell, ResolutionStep } from '../puzzle/MatchBoard.ts';
import { BUILD_PATHS, getLevel, PIECES, PIECE_LABELS, PUZZLE_LEVELS } from '../puzzle/catalog.ts';
import { LIFELINES, lifelineIcon, partIcon } from '../puzzle/presentation.ts';
import { SoundManager } from '../services/SoundManager.ts';
import { rewardChangeCost, WIN_DIAMONDS } from '../systems/WorkshopSystem.ts';
import type { BoosterKind, WorkshopSystem } from '../systems/WorkshopSystem.ts';
import { escapeHtml } from './html.ts';

export class WorkshopUI {
  private system: WorkshopSystem;
  private backdrop: HTMLDivElement;
  private launcher: HTMLDivElement;
  private view: 'puzzle' | 'inventory' | null = null;
  private selected: number | null = null;
  private booster: BoosterKind | null = null;
  private changingReward = false;
  private message = '';
  private error = '';
  private hint: number[] = [];
  private busy = false;
  private showGuide = false;
  private showMap = false;
  private visualCells: PuzzleCell[] | null = null;
  private animationStep: ResolutionStep | null = null;
  private phase = '';
  private effect: BoosterKind | null = null;
  private effectTargets: number[] = [];
  private swapPair: number[] = [];
  private animationId = 0;
  private lastFocus: HTMLElement | null = null;
  private gesture: { index: number; x: number; y: number } | null = null;
  private suppressClick = false;
  public onModalChange?: (open: boolean) => void;
  public canOpen: () => boolean = () => true;
  public getStations: () => { id: string; name: string }[] = () => [];

  constructor(parent: HTMLElement, system: WorkshopSystem) {
    this.system = system;
    this.launcher = document.createElement('div');
    this.launcher.className = 'workshop-launcher';
    (parent.querySelector('.topbar-actions') ?? parent).prepend(this.launcher);
    this.backdrop = document.createElement('div');
    this.backdrop.className = 'workshop-backdrop';
    this.backdrop.hidden = true;
    parent.append(this.backdrop);
    this.launcher.addEventListener('click', (event) => {
      const action = (event.target as HTMLElement).closest<HTMLElement>('[data-open]')?.dataset.open;
      if (action === 'puzzle' || action === 'inventory') this.open(action);
    });
    this.backdrop.addEventListener('click', (event) => this.click(event));
    this.backdrop.addEventListener('change', () => this.updateEquipButton());
    this.backdrop.addEventListener('pointermove', (event) => {
      const cell = (event.target as HTMLElement).closest<HTMLElement>('[data-cell]');
      this.previewTarget(cell ? Number(cell.dataset.cell) : null);
    });
    this.backdrop.addEventListener('pointerleave', () => this.previewTarget(null));
    this.backdrop.addEventListener('pointerdown', (event) => {
      const cell = (event.target as HTMLElement).closest<HTMLElement>('[data-cell]');
      if (cell) this.gesture = { index: Number(cell.dataset.cell), x: event.clientX, y: event.clientY };
    });
    this.backdrop.addEventListener('pointerup', (event) => {
      const gesture = this.gesture; this.gesture = null;
      if (!gesture) return;
      const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return;
      this.suppressClick = true;
      setTimeout(() => { this.suppressClick = false; }, 0);
      const offset = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : -1) : (dy > 0 ? BOARD_SIZE : -BOARD_SIZE);
      const target = gesture.index + offset;
      if (target >= 0 && target < 49 && (Math.abs(offset) === 7 || Math.floor(target / 7) === Math.floor(gesture.index / 7))) {
        this.selected = gesture.index; this.selectCell(target);
      }
    });
    this.backdrop.addEventListener('pointercancel', () => { this.gesture = null; });
    // Capture before the tycoon's window shortcuts. Modal input never rotates or moves furniture.
    window.addEventListener('keydown', (event) => {
      if (!this.isOpen) return;
      event.stopImmediatePropagation();
      if (event.key === 'Escape') {
        event.preventDefault();
        if (this.booster && !this.busy) { this.booster = null; this.selected = null; this.message = 'Lifeline cancelled. No charge used.'; this.render(); }
        else if (this.showGuide || this.showMap) { this.showGuide = false; this.showMap = false; this.render(); }
        else if (this.changingReward) { this.changingReward = false; this.render(); }
        else this.close();
      } else if (event.key === 'Tab') {
        const elements = [...this.backdrop.querySelectorAll<HTMLElement>('button:not(:disabled), select:not(:disabled), [tabindex="0"]')];
        const first = elements[0], last = elements[elements.length - 1];
        if (event.shiftKey && (document.activeElement === first || !this.backdrop.contains(document.activeElement))) {
          event.preventDefault(); last?.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !this.backdrop.contains(document.activeElement))) {
          event.preventDefault(); first?.focus();
        }
      } else if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
        const current = (document.activeElement as HTMLElement)?.dataset.cell;
        if (current === undefined) return;
        event.preventDefault();
        const index = Number(current);
        const target = index + ({ ArrowUp: -7, ArrowDown: 7, ArrowLeft: -1, ArrowRight: 1 }[event.key] ?? 0);
        if (target >= 0 && target < 49 && (Math.abs(target - index) === 7 || Math.floor(target / 7) === Math.floor(index / 7))) {
          this.backdrop.querySelector<HTMLElement>(`[data-cell="${target}"]`)?.focus();
        }
      }
    }, true);
    system.subscribe(() => { this.renderLauncher(); if (this.isOpen && !this.busy) this.render(); });
    this.renderLauncher();
  }

  get isOpen(): boolean { return this.view !== null; }

  open(view: 'puzzle' | 'inventory'): void {
    if (!this.canOpen()) return;
    this.lastFocus = document.activeElement as HTMLElement;
    this.view = view; this.error = ''; this.message = ''; this.selected = null; this.booster = null;
    this.resetAnimation(); this.showGuide = false; this.showMap = false;
    this.changingReward = false; this.hint = [];
    this.backdrop.hidden = false;
    this.onModalChange?.(true);
    this.render();
    this.backdrop.querySelector<HTMLElement>('[data-action="close"]')?.focus();
  }

  private close(): void {
    const view = this.view;
    this.view = null; this.backdrop.hidden = true; this.gesture = null;
    this.resetAnimation();
    this.onModalChange?.(false);
    if (this.lastFocus?.isConnected) this.lastFocus.focus();
    else this.launcher.querySelector<HTMLElement>(`[data-open="${view}"]`)?.focus();
  }

  private renderLauncher(): void {
    const state = this.system.state;
    this.launcher.innerHTML = `<span class="diamond-pill" aria-label="${state.diamonds} diamonds">💎 <b data-diamonds>${state.diamonds}</b></span>
      <button class="topbar-btn puzzle-launch" data-open="puzzle">🧩 <span>Puzzle Lab</span></button>
      <button class="topbar-btn" data-open="inventory">▣ <span>Inventory</span><b class="inventory-badge">${state.parts.filter((part) => !part.stationId).length}</b></button>`;
  }

  private render(): void {
    const scroll = this.backdrop.querySelector('.workshop-dialog')?.scrollTop ?? 0;
    const focusCell = (document.activeElement as HTMLElement)?.dataset.cell;
    const active = this.backdrop.contains(document.activeElement) ? document.activeElement as HTMLElement : null;
    const focusAction = active?.dataset.action;
    const focusBooster = active?.dataset.booster;
    const focusId = active?.id;
    this.backdrop.innerHTML = `<section class="workshop-dialog ${this.view === 'puzzle' ? 'puzzle-dialog' : ''}" role="dialog" aria-modal="true" aria-labelledby="workshop-title">
      <header class="workshop-header"><div><span class="workshop-eyebrow">BUILD & BOOT · HARDWARE WORKSHOP</span>
      <h2 id="workshop-title">${this.view === 'puzzle' ? 'Puzzle Lab' : 'Parts Inventory'}</h2></div>
      <div class="workshop-header-actions">${this.view === 'puzzle' ? `<button class="workshop-secondary" data-action="map" aria-pressed="${this.showMap}">Build paths</button><button class="workshop-secondary" data-action="help" aria-expanded="${this.showGuide}">How to play</button>` : ''}<span class="diamond-pill">💎 ${this.system.state.diamonds}</span><button data-action="close" class="workshop-icon-btn" aria-label="Close workshop">✕</button></div></header>
      <p class="workshop-error" role="alert" ${this.error ? '' : 'hidden'}>${escapeHtml(this.error)}</p>
      ${this.showGuide && this.view === 'puzzle' ? this.guideContent() : ''}
      ${this.view === 'puzzle' ? this.puzzleContent() : this.inventoryContent()}
      <footer class="workshop-footer"><span class="pause-dot"></span> Lounge paused · Progress saves automatically in this browser</footer>
    </section>`;
    this.updateEquipButton();
    this.backdrop.querySelector('.workshop-dialog')!.scrollTop = scroll;
    if (focusCell !== undefined) this.backdrop.querySelector<HTMLElement>(`[data-cell="${focusCell}"]`)?.focus();
    else if (focusAction) this.backdrop.querySelector<HTMLElement>(`[data-action="${focusAction}"]`)?.focus({ preventScroll: true });
    else if (focusBooster) this.backdrop.querySelector<HTMLElement>(`[data-booster="${focusBooster}"]`)?.focus({ preventScroll: true });
    else if (focusId) this.backdrop.querySelector<HTMLElement>(`#${CSS.escape(focusId)}`)?.focus({ preventScroll: true });
  }

  private puzzleContent(): string {
    const state = this.system.state, session = state.session;
    if (this.showMap) return this.campaignContent();
    if (!session) return `<div class="puzzle-welcome"><div class="workshop-hero-chip">CPU</div><span class="workshop-eyebrow">MATCH. COLLECT. CONNECT.</span>
      <h3>Your next upgrade starts here.</h3><p>Match three hardware tiles. Finish the objective before moves run out to earn a PC part and ${WIN_DIAMONDS} diamonds.</p>
      <div class="puzzle-feature-row"><span>7 × 7 circuits</span><span>100 levels</span><span>24 hardware parts</span></div>
      <button class="workshop-primary" data-action="start">Start Puzzle 1 →</button>
      <p class="workshop-muted">100 welcome diamonds · Reward changes cost 5, 10, 20, then 25 each.</p></div>`;
    const level = getLevel(session.level), reward = getPart(session.rewardPartId), cost = rewardChangeCost(session.changeCount);
    const playing = session.status === 'playing';
    const remaining = session.board.cells.filter((cell) => cell.obstacle !== 'none').length;
    const hazard = session.board.hazardKind ?? session.board.cells.find((cell) => cell.obstacle !== 'none')?.obstacle ?? level.obstacle;
    const pool = HARDWARE_PARTS.filter((part) => part.tier === level.rewardTier && part.id !== reward.id);
    return `<div class="puzzle-reward"><div class="part-chip chip-${reward.slot}">${partIcon(reward.slot === 'psu' ? 'power' : reward.slot === 'cooling' ? 'fan' : reward.slot)}</div>
      <div class="reward-copy"><span class="workshop-eyebrow">${session.status === 'won' ? 'ADDED TO INVENTORY' : 'COMPLETE TO EARN · ×1'}</span><h3 data-reward-name>${reward.name}</h3><p>${reward.detail} · Tier ${reward.tier}</p></div>
      <button class="workshop-secondary" data-action="reward-picker" ${!playing ? 'disabled' : ''}>Change reward · 💎${cost}</button></div>
      ${this.changingReward && playing ? `<div class="reward-picker"><label for="reward-choice">Choose a different Tier ${reward.tier} part</label>
      <div><select id="reward-choice">${pool.map((part) => `<option value="${part.id}">${part.name} · ${part.detail}</option>`).join('')}</select>
      <button class="workshop-primary" data-action="change-reward" ${state.diamonds < cost ? 'disabled' : ''}>Confirm · 💎${cost}</button>
      <button class="workshop-secondary" data-action="cancel-reward">Cancel</button></div>
      <p>${state.diamonds < cost ? 'Not enough diamonds. Complete a puzzle to earn 5 more.' : 'Choose your replacement. The puzzle and objectives stay the same.'} Changes made: ${session.changeCount}.</p></div>` : ''}
      <div class="puzzle-build-heading"><span>BUILD ${Math.ceil(level.number / 10).toString().padStart(2, '0')} · ${BUILD_PATHS[Math.floor((level.number - 1) / 10)].name}</span><b>${level.buildPart}</b></div>
      <div class="puzzle-layout"><aside class="puzzle-objectives"><span class="workshop-eyebrow">LEVEL ${level.number} / 100</span><h3>${level.name}</h3>
      <div class="objective-card"><span>Collect ${PIECE_LABELS[level.target]} tiles</span><strong data-objective>${Math.min(session.collected, level.targetCount)} <small>/ ${level.targetCount}</small></strong>
      <progress value="${Math.min(session.collected, level.targetCount)}" max="${level.targetCount}"></progress></div>
      <div class="puzzle-metrics"><div><span>Moves left</span><strong data-moves>${session.movesLeft}</strong></div><div><span>Score</span><strong>${session.score.toLocaleString()}</strong></div></div>
      <div class="hazard-info"><b>${hazard === 'none' ? 'No hazards' : `${remaining} ${hazard} tiles left`}</b><p>${{
        none: 'Collect the target tiles to finish.', dust: 'Clear a match on dusty tiles to clean them.', heat: 'Match over hot tiles, or use Cooling Wave.',
        cable: 'Locked tiles cannot swap. Match beside them to clear cables.', virus: 'Match on or beside viruses. They spread every third move.'
      }[hazard]}</p>${session.board.virusPauseTurns ? `<strong class="hazard-pause">❄ Hazards paused · ${session.board.virusPauseTurns} moves</strong>` : ''}</div>
      <details class="puzzle-tip"><summary>Build tip</summary><p>${level.tip}</p><small>First clear: +1 ${LIFELINES[level.rewardBooster].name}</small></details>
      <button class="workshop-secondary hint-btn" data-action="hint" ${!playing ? 'disabled' : ''}>Show a possible move</button></aside>
      <div class="puzzle-board-wrap">${this.booster ? `<div class="lifeline-selected-banner" data-selected-lifeline="${this.booster}"><strong>${LIFELINES[this.booster].name} selected</strong><span>${this.booster === 'mouse' && this.selected !== null ? 'Choose the destination tile.' : LIFELINES[this.booster].instruction}</span><button data-action="cancel-booster" aria-label="Cancel lifeline">✕</button></div>` : ''}
      ${this.boardContent(playing)}<p class="puzzle-status" role="status">${escapeHtml(this.message || 'Tap two neighbors or swipe. Match 4 for a blaster; 5 for an RGB core.')}</p></div>
      ${this.lifelinesContent(playing)}</div>
      ${session.status !== 'playing' && !this.busy ? `<div class="puzzle-result ${session.status === 'won' ? 'result-win' : 'result-loss'}" role="status">
      <div><span class="workshop-eyebrow">${session.status === 'won' ? 'CIRCUIT COMPLETE' : 'OUT OF MOVES'}</span><h3>${session.status === 'won' ? `${reward.name} earned!` : 'One more route. You can do this.'}</h3>
      <p>${session.status === 'won' ? `×1 part added to inventory · +${WIN_DIAMONDS} diamonds. This reward is already saved.` : 'No part awarded. Retry keeps your reward and change-price progress.'}</p><p class="puzzle-completion-tip">${session.status === 'won' ? level.tip : ''}</p></div>
      ${session.status === 'won' ? `<div class="result-actions"><button class="workshop-primary" data-action="next">${session.level === 100 ? 'Play Again' : 'Next Puzzle →'}</button>
      <button class="workshop-secondary" data-action="inventory">Open Inventory</button>
      <label class="replay-label">Replay level <select id="replay-level" aria-label="Replay level">${PUZZLE_LEVELS.filter((entry) => entry.number <= state.highestUnlocked).map((entry) => `<option value="${entry.number}">${entry.number}</option>`).join('')}</select></label><button class="workshop-secondary" data-action="replay">Play</button></div>`
      : '<button class="workshop-primary" data-action="retry">Retry puzzle</button>'}</div>` : ''}`;
  }

  private lifelinesContent(playing: boolean): string {
    const state = this.system.state;
    return `<aside class="puzzle-lifelines" aria-label="Lifeline bay"><div class="lifeline-heading"><span class="workshop-eyebrow">LIFELINE BAY</span><strong>Power systems</strong></div>
      <div class="lifeline-charge" role="meter" aria-label="Lifeline charge" aria-valuenow="${state.charge}" aria-valuemin="0" aria-valuemax="6"><span>Match charge <b data-charge>${state.charge}/6</b></span><i><b style="width:${state.charge / 6 * 100}%"></b></i><small>Combos charge faster · next: ${LIFELINES[(['mouse', 'cpu', 'cooling', 'gpu'] as const)[(state.lifelinesEarned ?? 0) % 4]].name}</small></div>
      <div class="lifeline-buttons">${(['gpu', 'cpu', 'mouse', 'cooling'] as const).map((kind) => `<button class="workshop-secondary lifeline-card ${this.booster === kind ? 'lifeline-active' : ''}" data-booster="${kind}" aria-pressed="${this.booster === kind}" ${!playing || this.busy || state.boosters[kind] <= 0 ? 'disabled' : ''} title="${LIFELINES[kind].instruction}">
      <span class="lifeline-device">${lifelineIcon(kind)}</span><span><strong>${LIFELINES[kind].name}</strong><small>${LIFELINES[kind].detail}</small></span><b data-booster-count="${kind}">×${state.boosters[kind]}</b></button>`).join('')}</div><small class="lifeline-note">No moves spent. Earn charges from matches and first clears.</small></aside>`;
  }

  private boardContent(playing: boolean): string {
    const cells = this.visualCells ?? this.system.state.session!.board.cells;
    return `<div class="puzzle-board ${this.busy ? 'board-resolving' : ''} ${this.booster ? `targeting-${this.booster}` : ''} phase-${this.phase} effect-${this.effect ?? 'none'}" data-animation-phase="${this.phase}" role="grid" aria-label="Hardware match-three board" aria-busy="${this.busy}">
      ${cells.map((cell, index) => {
        const falling = this.phase === 'drop' ? this.animationStep?.falling.find((item) => item.toRow * 7 + item.column === index) : undefined;
        const moving = falling && falling.toRow !== falling.fromRow;
        const pairIndex = this.swapPair.indexOf(index), other = this.swapPair[1 - pairIndex];
        const swap = this.phase === 'swap' && pairIndex >= 0 ? `--swap-x:${other % 7 - index % 7};--swap-y:${Math.floor(other / 7) - Math.floor(index / 7)};` : '';
        return `<button role="gridcell" class="puzzle-tile tile-${cell.piece} hazard-${cell.obstacle} special-${cell.special} ${this.selected === index ? 'tile-selected' : ''} ${this.hint.includes(index) ? 'tile-hint' : ''} ${this.effectTargets.includes(index) ? 'effect-target' : ''} ${this.animationStep?.cleared.includes(index) ? 'match-target' : ''} ${moving ? 'falling-tile' : ''} ${swap ? 'swapping-tile' : ''}"
        data-cell="${index}" data-piece="${cell.piece}" style="grid-row:${Math.floor(index / 7) + 1};grid-column:${index % 7 + 1};--hit-order:${Math.max(0, this.effectTargets.indexOf(index))};${swap}${moving ? `--fall-rows:${falling.toRow - falling.fromRow};--fall-delay:${falling.column * 8}ms;` : ''}" aria-label="Row ${Math.floor(index / 7) + 1} column ${index % 7 + 1} ${PIECE_LABELS[cell.piece]}${cell.special !== 'none' ? ` ${cell.special === 'line' ? 'line blaster' : 'RGB core'} special` : ''}${cell.obstacle !== 'none' ? ` ${cell.obstacle}` : ''}" aria-selected="${this.selected === index}" ${!playing || this.busy ? 'disabled' : ''}>
        ${partIcon(cell.piece)}${cell.special !== 'none' ? `<span class="tile-special">${cell.special === 'rgb' ? 'RGB' : '✛'}</span>` : ''}
        ${cell.obstacle !== 'none' ? '<span class="tile-hazard" aria-hidden="true"><i></i></span>' : ''}</button>`;
      }).join('')}
      ${this.phase === 'special' ? (this.animationStep?.activations ?? []).map((activation) => activation.kind === 'line'
        ? `<span class="power-beam beam-row" aria-hidden="true" style="grid-row:${Math.floor(activation.origin / 7) + 1};grid-column:1/-1"></span><span class="power-beam beam-column" aria-hidden="true" style="grid-column:${activation.origin % 7 + 1};grid-row:1/-1"></span>`
        : `<span class="rgb-burst" aria-hidden="true" style="grid-row:${Math.floor(activation.origin / 7) + 1};grid-column:${activation.origin % 7 + 1}">RGB</span>${activation.affected.map((index) => `<span class="rgb-hit" aria-hidden="true" style="grid-row:${Math.floor(index / 7) + 1};grid-column:${index % 7 + 1}"></span>`).join('')}`).join('') : ''}
      ${this.phase === 'charge' || this.phase === 'cooling' ? `<span class="booster-effect-label" data-booster-effect="${this.effect}">${this.effect ? LIFELINES[this.effect].name : ''}</span>` : ''}
      ${this.animationStep && this.phase === 'match' ? `<span class="cascade-badge">${this.animationStep.cascade > 1 ? `CASCADE ×${this.animationStep.cascade}` : this.animationStep.cascade === 1 ? 'CIRCUIT MATCH' : 'SYSTEM ACTIVATED'}</span>` : ''}</div>`;
  }

  private guideContent(): string {
    return `<section class="puzzle-guide" aria-label="Puzzle guide"><h3>Match. Build. Power on.</h3><div class="tile-legend">${PIECES.map((piece) => `<span>${partIcon(piece)}<b>${PIECE_LABELS[piece]}</b></span>`).join('')}</div>
      <p>Swap neighboring parts to match three, or swipe one in any direction. An invalid swap costs no move. Collect the target <strong>and clear every hazard</strong> to earn the displayed inventory part.</p>
      <div class="puzzle-guide-rules"><p><b>Match 4 → Line blaster</b>Match it again to clear its entire row and column. It can trigger other specials.</p><p><b>Match 5 → RGB core</b>Match it again to clear every tile of its own part type. Cascades can create and activate more specials.</p>
      <p><b>Dust & heat</b>Match directly over them. Cooling Wave removes all heat.</p><p><b>Cable & virus</b>Match on or beside them. Cable tiles cannot swap. Virus spreads every third normal move; Cooling pauses it for three moves.</p></div>
      <p>All four lifelines spend their own charges and <strong>zero moves</strong>. Each normal match adds 1 charge, or 2–3 for cascades. At 6, earn Free Move → CPU → Cooling → GPU in order. A level's first clear also earns its listed booster. Click a selected lifeline again, Cancel, or Escape to cancel it without spending a charge.</p><button class="workshop-secondary" data-action="help">Back to puzzle</button></section>`;
  }

  private campaignContent(): string {
    const state = this.system.state, session = state.session;
    return `<section class="puzzle-campaign"><h3>Motherboard paths</h3><p>${state.completed.length}/100 circuits complete · Ten builds, ten parts each. Your lounge inventory rewards are shown before every puzzle.</p>
      ${session && session.status !== 'won' ? '<p>Finish or retry your current circuit before starting another. Its reward offer is preserved.</p>' : ''}
      <div class="build-paths">${BUILD_PATHS.map((build) => `<article><span class="workshop-eyebrow">BUILD ${build.number.toString().padStart(2, '0')} · ${build.tier}</span><h4>${build.name}</h4><p>${build.description}</p><div class="build-nodes">${PUZZLE_LEVELS.filter((level) => Math.ceil(level.number / 10) === build.number).map((level) => `<button data-level="${level.number}" class="${state.completed.includes(level.number) ? 'node-complete' : ''}" title="${level.buildPart}" ${level.number > state.highestUnlocked || (session && session.status !== 'won' && session.level !== level.number) ? 'disabled' : ''}>${state.completed.includes(level.number) ? '✓' : level.number}<small>${level.buildPartShort}</small></button>`).join('')}</div></article>`).join('')}</div><button class="workshop-primary" data-action="map">${session ? 'Resume current puzzle' : 'Back to workshop'}</button></section>`;
  }

  private previewTarget(index: number | null): void {
    if (!this.booster || this.busy) return;
    const cells = this.system.state.session?.board.cells;
    if (!cells) return;
    for (const tile of this.backdrop.querySelectorAll<HTMLElement>('[data-cell]')) {
      const candidate = Number(tile.dataset.cell);
      const included = index !== null && (this.booster === 'gpu'
        ? Math.abs(Math.floor(candidate / 7) - Math.floor(index / 7)) <= 1 && Math.abs(candidate % 7 - index % 7) <= 1
        : this.booster === 'cpu' ? cells[candidate].piece === cells[index].piece : candidate === index || candidate === this.selected);
      tile.classList.toggle('target-preview', included);
    }
  }

  private inventoryContent(): string {
    const state = this.system.state, stations = this.getStations();
    const available = state.parts.filter((part) => !part.stationId).length;
    return `<div class="inventory-summary"><div><strong>${state.parts.length}</strong><span>Total owned</span></div><div><strong>${available}</strong><span>Available</span></div><div><strong>${state.parts.length - available}</strong><span>Installed</span></div></div>
      <p class="workshop-muted">Earn parts in Puzzle Lab, then attach them to any PC. View installed parts in its inspector, or detach them to use in another PC.</p>
      ${!state.parts.length ? '<div class="inventory-empty"><span>▣</span><h3>Your next upgrade is waiting.</h3><p>Win your first puzzle to collect a part.</p><button class="workshop-primary" data-action="puzzle">Play a puzzle →</button></div>' : `<div class="inventory-grid">${HARDWARE_PARTS.filter((definition) => state.parts.some((part) => part.partId === definition.id)).map((definition) => {
        const copies = state.parts.filter((part) => part.partId === definition.id);
        const free = copies.filter((part) => !part.stationId);
        return `<article class="inventory-card"><div class="part-chip chip-${definition.slot}">${definition.slot.toUpperCase()}</div><span class="workshop-eyebrow">TIER ${definition.tier} · ${definition.detail}</span><h3>${definition.name}</h3>
        <p><b>${free.length}</b> available · ${copies.length - free.length} installed · ${copies.length} owned</p>
        ${free.length && stations.length ? `<label>Attach to PC<select data-equip-station="${definition.id}">${stations.map((station) => `<option value="${escapeHtml(station.id)}">${escapeHtml(station.name)}</option>`).join('')}</select></label>
        <button class="workshop-primary" data-attach="${escapeHtml(free[0].id)}" data-part="${definition.id}" data-slot="${definition.slot}">Attach part</button><small class="equip-note" data-note="${definition.id}"></small>` : `<p class="workshop-muted">${!stations.length ? 'Build a PC to install this part.' : 'All copies are installed.'}</p>`}
        ${copies.filter((part) => part.stationId).map((part) => `<div class="installed-copy"><span>${escapeHtml(stations.find((station) => station.id === part.stationId)?.name ?? 'PC')}</span>
        <button class="workshop-secondary" data-detach="${escapeHtml(part.id)}" data-station="${escapeHtml(part.stationId!)}">Detach</button></div>`).join('')}</article>`;
      }).join('')}</div>`}`;
  }

  private updateEquipButton(): void {
    for (const select of this.backdrop.querySelectorAll<HTMLSelectElement>('[data-equip-station]')) {
      const partId = select.dataset.equipStation!, slot = getPart(partId).slot;
      const installed = this.system.state.parts.find((part) => part.stationId === select.value && getPart(part.partId).slot === slot);
      const button = this.backdrop.querySelector<HTMLElement>(`[data-part="${partId}"]`);
      const note = this.backdrop.querySelector<HTMLElement>(`[data-note="${partId}"]`);
      if (button) button.textContent = installed ? 'Replace installed part' : 'Attach part';
      if (note) note.textContent = installed ? `${getPart(installed.partId).name} will return to inventory.` : '';
    }
  }

  private run(action: () => void): void {
    if (this.busy) return;
    this.error = '';
    try { action(); } catch (error) { this.error = error instanceof Error ? error.message : 'Please try again.'; }
    this.render();
  }

  private click(event: MouseEvent): void {
    if (this.suppressClick) { this.suppressClick = false; return; }
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!button || button.disabled || this.busy) return;
    const action = button.dataset.action;
    if (action === 'close') { this.close(); return; }
    if (button.dataset.cell !== undefined) { this.selectCell(Number(button.dataset.cell)); return; }
    this.run(() => {
      if (action === 'start' || action === 'next' || action === 'replay') {
        const level = action === 'replay' ? Number(this.backdrop.querySelector<HTMLSelectElement>('#replay-level')?.value)
          : action === 'next' ? Math.min(100, (this.system.state.session?.level ?? 0) + 1) : 1;
        this.system.start(level); this.selected = null; this.booster = null; this.hint = []; this.message = ''; this.changingReward = false;
      } else if (action === 'map') { this.showMap = !this.showMap; this.showGuide = false; this.booster = null; this.selected = null; }
      else if (action === 'help') { this.showGuide = !this.showGuide; this.showMap = false; }
      else if (action === 'cancel-booster') { this.booster = null; this.selected = null; this.message = 'Lifeline cancelled. No charge used.'; }
      else if (button.dataset.level) {
        const number = Number(button.dataset.level);
        if (this.system.state.session?.level !== number || this.system.state.session.status === 'won') this.system.start(number);
        this.showMap = false; this.selected = null; this.booster = null; this.message = '';
      } else if (action === 'retry') { this.system.retry(); this.selected = null; this.booster = null; this.hint = []; this.message = ''; }
      else if (action === 'reward-picker') this.changingReward = !this.changingReward;
      else if (action === 'cancel-reward') this.changingReward = false;
      else if (action === 'change-reward') {
        const choice = this.backdrop.querySelector<HTMLSelectElement>('#reward-choice')!.value;
        this.system.changeReward(choice); this.changingReward = false; this.message = 'Reward updated and saved. Finish the puzzle to earn it.';
      } else if (action === 'inventory' || action === 'puzzle') { this.view = action; this.selected = null; this.booster = null; this.message = ''; }
      else if (action === 'hint') {
        const session = this.system.state.session!;
        this.hint = new MatchBoard(getLevel(session.level), 1, session.board).legalMoves()[0] ?? [];
        this.message = 'Try swapping the two highlighted tiles. Hints are free.';
      } else if (button.dataset.booster) {
        const kind = button.dataset.booster as BoosterKind;
        this.selected = null;
        if (kind === 'cooling') { this.booster = kind; void this.resolveMove(() => this.system.useBooster(kind)); }
        else { this.booster = this.booster === kind ? null : kind; this.message = this.booster ? LIFELINES[kind].instruction : 'Lifeline cancelled. No charge used.'; }
      } else if (button.dataset.attach) {
        const station = this.backdrop.querySelector<HTMLSelectElement>(`[data-equip-station="${button.dataset.part}"]`)!.value;
        this.system.attach(button.dataset.attach, station, button.dataset.slot as PartSlot);
      } else if (button.dataset.detach) this.system.detach(button.dataset.detach, button.dataset.station!);
    });
    if (button.dataset.booster && this.booster && event.detail === 0) {
      this.backdrop.querySelector<HTMLElement>('[data-cell="24"]')?.focus({ preventScroll: true });
    }
  }

  private selectCell(index: number): void {
    if (this.busy || this.system.state.session?.status !== 'playing') return;
    if (this.booster === 'cpu' || this.booster === 'gpu') {
      const kind = this.booster;
      void this.resolveMove(() => this.system.useBooster(kind, index), [index]);
    } else if (this.selected === null) { this.selected = index; this.hint = []; this.render(); }
    else if (this.selected === index) { this.selected = null; this.render(); }
    else {
      const first = this.selected, booster = this.booster === 'mouse' ? 'mouse' : undefined;
      void this.resolveMove(() => this.system.play(first, index, booster), [first, index]);
    }
  }

  private resetAnimation(): void {
    this.animationId++; this.busy = false; this.visualCells = null; this.animationStep = null;
    this.phase = ''; this.effect = null; this.effectTargets = []; this.swapPair = [];
  }

  private async resolveMove(action: () => ReturnType<WorkshopSystem['play']>, targets: number[] = []): Promise<void> {
    this.error = '';
    const id = ++this.animationId, before = this.system.state.session!.board.cells, kind = this.booster;
    const wait = async (milliseconds: number) => {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) milliseconds = 0;
      if (milliseconds) await new Promise((resolve) => setTimeout(resolve, milliseconds));
      return id === this.animationId;
    };
    this.busy = true;
    try {
      const result = action();
      this.selected = null; this.booster = null; this.hint = [];
      this.visualCells = before; this.effect = kind;
      this.message = kind ? `${LIFELINES[kind].name} · zero moves used` : 'Routing parts…';
      if (kind && kind !== 'mouse') {
        this.phase = kind === 'cooling' ? 'cooling' : 'charge'; this.effectTargets = result.boosterTargets;
        SoundManager.getInstance().playPuzzle(kind); this.render(); if (!await wait(440)) return;
      } else if (targets.length === 2) {
        this.phase = 'swap'; this.swapPair = targets;
        SoundManager.getInstance().playPuzzle(kind === 'mouse' ? 'mouse' : 'select');
        this.render(); if (!await wait(150)) return; this.swapPair = [];
      }
      for (const step of result.steps) {
        this.animationStep = step; this.visualCells = step.before; this.phase = 'match';
        this.message = step.cascade > 1 ? `Cascade ×${step.cascade} · ${step.cleared.length} parts cleared` : 'Circuit connected';
        SoundManager.getInstance().playPuzzle('match'); this.render(); if (!await wait(140)) return;
        if (step.activations.length) {
          this.phase = 'special'; SoundManager.getInstance().playPuzzle(step.activations.some((activation) => activation.kind === 'rgb') ? 'rgb' : 'line');
          this.render(); if (!await wait(320)) return;
        }
        this.phase = 'clear'; this.render(); if (!await wait(140)) return;
        this.visualCells = step.after; this.phase = 'drop'; this.render(); if (!await wait(340)) return;
      }
      this.message = `${result.message}${result.cascades > 1 ? ` ${result.cascades}× cascade!` : ''}${result.shuffled ? ' Board rerouted; specials preserved.' : ''}`;
      if (result.lifelineReward) this.message += ` Lifeline ready: +1 ${LIFELINES[result.lifelineReward].name}!`;
      else if (result.chargeGained) this.message += ` Match charge +${result.chargeGained}.`;
      if (result.firstClearReward) this.message += ` First clear: +1 ${LIFELINES[result.firstClearReward].name}!`;
      if (result.lifelineReward || result.firstClearReward || this.system.state.session?.status === 'won') SoundManager.getInstance().playPuzzle('reward');
    } catch (error) {
      this.selected = null;
      this.error = error instanceof Error ? error.message : 'Please try again.';
      SoundManager.getInstance().playPuzzle('invalid');
    } finally {
      if (id === this.animationId) {
        this.resetAnimation();
        if (this.isOpen) {
          this.render();
          if (targets.length) this.backdrop.querySelector<HTMLElement>(`[data-cell="${targets.at(-1)}"]`)?.focus({ preventScroll: true });
        }
      }
    }
  }
}
