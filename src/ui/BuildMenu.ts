import { BUILDABLE_ITEMS, BuildableItem } from '../data/assets.ts';
import { PlacementSystem } from '../systems/PlacementSystem.ts';
import { EconomySystem } from '../systems/EconomySystem.ts';

export class BuildMenu {
  private element: HTMLElement;
  private placementSystem: PlacementSystem;
  private economySystem: EconomySystem;
  private activeCategory: string = 'all';

  constructor(parent: HTMLElement, placementSystem: PlacementSystem, economySystem: EconomySystem) {
    this.placementSystem = placementSystem;
    this.economySystem = economySystem;

    this.element = document.createElement('div');
    this.element.className = 'build-container';
    this.render();
    parent.appendChild(this.element);

    this.setupListeners();
  }

  private render() {
    this.element.innerHTML = `
      <div class="build-controls-bar">
        <button id="btn-toggle-build" class="primary-action-btn">
          <span>🛠️ Build Mode</span>
        </button>
        <button id="btn-rotate-build" class="secondary-btn" style="display: none;">
          <span>🔄 Rotate (R)</span>
        </button>
        <button id="btn-cancel-build" class="danger-btn" style="display: none;">
          <span>✖ Cancel</span>
        </button>
      </div>

      <div id="build-panel" class="build-panel" style="display: none;">
        <div class="build-tabs">
          <button class="tab-btn active" data-cat="all">All</button>
          <button class="tab-btn" data-cat="station">Stations</button>
          <button class="tab-btn" data-cat="facility">Facilities</button>
          <button class="tab-btn" data-cat="decor">Decor</button>
        </div>
        <div id="build-items-grid" class="build-items-grid"></div>
      </div>
    `;

    this.renderItems();
  }

  private renderItems() {
    const grid = this.element.querySelector('#build-items-grid')!;
    grid.innerHTML = '';

    const filtered = BUILDABLE_ITEMS.filter(
      (item) => this.activeCategory === 'all' || item.category === this.activeCategory
    );

    filtered.forEach((item) => {
      const card = document.createElement('div');
      card.className = 'item-card';
      const canAfford = this.economySystem.canAfford(item.price);
      if (!canAfford) card.classList.add('disabled');

      card.innerHTML = `
        <div class="item-name">${item.name}</div>
        <div class="item-desc">${item.description}</div>
        <div class="item-footer">
          <span class="item-price">$${item.price}</span>
          <button class="buy-btn" ${!canAfford ? 'disabled' : ''}>Buy</button>
        </div>
      `;

      card.querySelector('.buy-btn')?.addEventListener('click', () => {
        this.selectItem(item);
      });

      grid.appendChild(card);
    });
  }

  private selectItem(item: BuildableItem) {
    this.placementSystem.setBuildItem(item);
    this.showBuildControls(true);
  }

  public showBuildControls(inBuildMode: boolean) {
    const rotateBtn = this.element.querySelector('#btn-rotate-build') as HTMLElement;
    const cancelBtn = this.element.querySelector('#btn-cancel-build') as HTMLElement;
    const toggleBtn = this.element.querySelector('#btn-toggle-build') as HTMLElement;
    const panel = this.element.querySelector('#build-panel') as HTMLElement;

    if (inBuildMode) {
      rotateBtn.style.display = 'inline-flex';
      cancelBtn.style.display = 'inline-flex';
      toggleBtn.style.display = 'none';
      panel.style.display = 'none';
    } else {
      rotateBtn.style.display = 'none';
      cancelBtn.style.display = 'none';
      toggleBtn.style.display = 'inline-flex';
    }
  }

  private setupListeners() {
    const toggleBtn = this.element.querySelector('#btn-toggle-build')!;
    const panel = this.element.querySelector('#build-panel') as HTMLElement;
    const rotateBtn = this.element.querySelector('#btn-rotate-build')!;
    const cancelBtn = this.element.querySelector('#btn-cancel-build')!;

    toggleBtn.addEventListener('click', () => {
      const isVisible = panel.style.display !== 'none';
      panel.style.display = isVisible ? 'none' : 'block';
      if (!isVisible) this.renderItems();
    });

    rotateBtn.addEventListener('click', () => {
      this.placementSystem.rotate();
    });

    cancelBtn.addEventListener('click', () => {
      this.placementSystem.setBuildItem(undefined);
      this.showBuildControls(false);
    });

    // Tab buttons
    this.element.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        this.element.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
        const target = e.currentTarget as HTMLElement;
        target.classList.add('active');
        this.activeCategory = target.dataset.cat || 'all';
        this.renderItems();
      });
    });

    // Keyboard shortcut R for rotate, Esc for cancel
    window.addEventListener('keydown', (e) => {
      if (e.key === 'r' || e.key === 'R') {
        this.placementSystem.rotate();
      } else if (e.key === 'Escape') {
        this.placementSystem.setBuildItem(undefined);
        this.showBuildControls(false);
      }
    });

    this.economySystem.subscribe(() => {
      if (panel.style.display !== 'none') {
        this.renderItems();
      }
    });
  }
}

