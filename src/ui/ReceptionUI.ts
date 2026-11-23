import { Vector3 } from 'three';
import type { Camera } from 'three';
import type { CustomerSystem } from '../systems/CustomerSystem.ts';
import type { PlacementSystem } from '../systems/PlacementSystem.ts';

const icons: Record<string, string> = { PC: '🖥', Gaming: '🖥', Drink: '🥤', Arcade: '🕹', Sofa: '🛋', Bus: '🚌', Performance: '⚡' };

export class ReceptionUI {
  private root = document.createElement('div');
  private labels = new Map<string, HTMLElement>();
  private keys = new Set<string>();
  private joystick = { x: 0, y: 0 };
  private point = new Vector3();
  private hint: HTMLElement;
  private choices: HTMLElement;
  private lastChoices = '';
  private pointer?: number;

  constructor(parent: HTMLElement, system: CustomerSystem, placement: PlacementSystem, enabled: () => boolean) {
    this.root.className = 'reception-ui';
    this.root.hidden = true;
    this.root.innerHTML = `<div class="reception-panel"><span class="reception-hint"></span><div class="pc-choices"></div></div>
      <div class="reception-stick" role="group" aria-label="Move receptionist"><span></span></div>`;
    parent.append(this.root);
    this.hint = this.root.querySelector('.reception-hint')!;
    this.choices = this.root.querySelector('.pc-choices')!;
    this.choices.onclick = (event) => {
      const button = (event.target as Element).closest<HTMLButtonElement>('button[data-pc]');
      const station = button && placement.stations.get(button.dataset.pc!);
      if (station && enabled()) system.assignStation(station);
    };
    const stick = this.root.querySelector<HTMLElement>('.reception-stick')!;
    const knob = stick.firstElementChild as HTMLElement;
    const reset = () => {
      this.keys.clear();
      this.pointer = undefined;
      this.joystick = { x: 0, y: 0 };
      knob.style.transform = '';
      system.player.input.set(0, 0);
    };
    window.addEventListener('blur', reset);
    document.addEventListener('visibilitychange', reset);
    const arrows = ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'];
    window.addEventListener('keydown', event => {
      if (!arrows.includes(event.key) || !enabled() || (event.target instanceof Element && event.target.closest('input,select,textarea,[contenteditable=true]'))) return;
      event.preventDefault(); this.keys.add(event.key);
    });
    window.addEventListener('keyup', event => this.keys.delete(event.key));
    const drag = (event: PointerEvent) => {
      if (event.pointerId !== this.pointer) return;
      const rect = stick.getBoundingClientRect();
      const x = (event.clientX - rect.left - rect.width/2) / (rect.width * .32);
      const y = (event.clientY - rect.top - rect.height/2) / (rect.height * .32);
      const length = Math.max(1, Math.hypot(x, y));
      this.joystick = { x: x/length, y: y/length };
      knob.style.transform = `translate(${this.joystick.x*18}px,${this.joystick.y*18}px)`;
    };
    stick.onpointerdown = event => {
      if (!enabled() || this.pointer !== undefined) return;
      event.preventDefault();
      this.pointer = event.pointerId;
      stick.setPointerCapture(event.pointerId);
      drag(event);
    };
    stick.onpointermove = drag;
    stick.onpointerup = stick.onpointercancel = stick.onlostpointercapture = event => { if (event.pointerId === this.pointer) reset(); };
    this.readInput = () => {
      const active = enabled();
      system.player.onDuty = active;
      this.root.hidden = !active;
      if (!active) { reset(); return; }
      system.player.input.set(this.joystick.x + Number(this.keys.has('ArrowRight')) - Number(this.keys.has('ArrowLeft')),
        this.joystick.y + Number(this.keys.has('ArrowDown')) - Number(this.keys.has('ArrowUp')));
    };
  }

  readonly readInput: () => void;

  render(system: CustomerSystem, placement: PlacementSystem, camera: Camera) {
    if (this.root.hidden) return;
    const head = system.pending[0];
    const available = [...placement.stations.values()].map((station, i) => ({ station, index: i+1 })).filter(s => s.station.assignable);
    const staffed = [...placement.receptionDesks.values()].some(desk => system.workforce?.receptionistAt(desk));
    this.hint.textContent = head ? (available.length ? (head.wantsPerformance ? 'Assign a PC · GPU or CPU earns +25%' : 'Assign a PC to the next guest') : 'Waiting for a PC')
      : system.activeDesk ? 'Isha · At reception' : staffed ? 'Reception staffed · Automatic check-in' : (matchMedia('(pointer:coarse)').matches ? 'Joystick' : 'Arrow keys')+' · Stand in the mint ring to check in';
    const options = head ? available.map(({ station, index }) => ({ id: station.id,
      name: 'PC '+index+(head.wantsPerformance && system.hasPerformancePart(station.id) ? ' ⚡' : '') })) : [];
    const signature = JSON.stringify(options);
    if (signature !== this.lastChoices) {
      this.choices.replaceChildren(...options.map(option => {
        const b = document.createElement('button'); b.type = 'button'; b.dataset.pc = option.id; b.textContent = option.name; return b;
      }));
      this.lastChoices = signature;
    }
    const visible = new Set<string>();
    for (const row of system.activities()) {
      this.point.copy(row.position);
      this.point.y += row.label.startsWith('Gaming') || row.label === 'Sofa' ? 1.45 : 1.85;
      this.point.project(camera);
      if (Math.abs(this.point.x)>1 || Math.abs(this.point.y)>1 || Math.abs(this.point.z)>1) continue;
      visible.add(row.id);
      let el = this.labels.get(row.id);
      if (!el) {
        el = document.createElement('div'); el.className = 'guest-activity';
        el.innerHTML = '<span></span><progress max="1"></progress><i></i>';
        this.labels.set(row.id, el); this.root.append(el);
      }
      el.style.left = (this.point.x+1)*50+'%'; el.style.top = (1-this.point.y)*50+'%';
      const title = el.children[0] as HTMLElement, bar = el.children[1] as HTMLProgressElement, patience = el.children[2] as HTMLElement;
      const icon = icons[row.label.split(' ')[0]] ?? (row.label.includes('PC') ? '🖥' : '◷');
      title.textContent = icon+' '+row.label;
      bar.hidden = row.progress === undefined;
      if (row.progress !== undefined) { bar.setAttribute('aria-label', row.label); bar.value = row.progress; }
      patience.hidden = row.patience === undefined;
      if (row.patience !== undefined) {
        patience.style.width = Math.round(row.patience*100)+'%';
        patience.style.background = row.patience > .5 ? '#7ee7aa' : row.patience > .2 ? '#ffc65d' : '#ff756e';
        el.title = 'Patience '+Math.ceil(row.patience*100)+'%';
      }
    }
    for (const [id, el] of this.labels) if (!visible.has(id)) { el.remove(); this.labels.delete(id); }
  }
}
