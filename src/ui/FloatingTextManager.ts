import * as THREE from 'three';

interface FloatItem {
  element: HTMLElement;
  worldPos: THREE.Vector3;
  life: number;
  maxLife: number;
}

export class FloatingTextManager {
  private container: HTMLElement;
  private camera: THREE.Camera;
  private items: FloatItem[] = [];

  constructor(parent: HTMLElement, camera: THREE.Camera) {
    this.camera = camera;
    this.container = document.createElement('div');
    this.container.className = 'floating-text-container';
    parent.appendChild(this.container);
  }

  public spawn(text: string, worldPos: THREE.Vector3, color: string = '#10b981') {
    const el = document.createElement('div');
    el.className = 'floating-text';
    el.textContent = text;
    el.style.color = color;
    this.container.appendChild(el);

    this.items.push({
      element: el,
      worldPos: worldPos.clone(),
      life: 0,
      maxLife: 1.5
    });
  }

  public update(deltaTime: number) {
    const width = window.innerWidth;
    const height = window.innerHeight;

    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i];
      item.life += deltaTime;

      if (item.life >= item.maxLife) {
        this.container.removeChild(item.element);
        this.items.splice(i, 1);
        continue;
      }

      // Project world to screen
      const currentPos = item.worldPos.clone();
      currentPos.y += item.life * 0.8; // rise up

      const proj = currentPos.project(this.camera);
      const x = ((proj.x + 1) * width) / 2;
      const y = ((-proj.y + 1) * height) / 2;

      const progress = item.life / item.maxLife;
      item.element.style.transform = `translate(-50%, -50%) scale(${1 + (1 - progress) * 0.3})`;
      item.element.style.left = `${x}px`;
      item.element.style.top = `${y}px`;
      item.element.style.opacity = `${1 - progress}`;
    }
  }
}

