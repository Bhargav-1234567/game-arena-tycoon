import './style.css';
import './workshop.css';
import './puzzle.css';
import './neighborhood.css';
import { Game } from './game/Game.ts';

window.addEventListener('DOMContentLoaded', async () => {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  const uiContainer = document.getElementById('ui-layer') as HTMLElement;

  if (!canvas || !uiContainer) {
    console.error('Failed to find game container elements');
    return;
  }

  try {
    const game = new Game(canvas, uiContainer);
    await game.start();
    document.body.dataset.gameReady = 'true';
    console.log('Gaming Zone Tycoon initialized successfully!');
  } catch (error) {
    console.error('Game startup failed:', error);
    const panel = document.createElement('section');
    panel.className = 'startup-error';
    panel.setAttribute('role', 'alert');
    const heading = document.createElement('h2'); heading.textContent = 'Your lounge could not be opened';
    const detail = document.createElement('p'); detail.textContent = `${error instanceof Error ? error.message : 'Please retry.'} Existing browser progress has not been overwritten.`;
    const retry = document.createElement('button'); retry.className = 'workshop-primary'; retry.textContent = 'Retry'; retry.onclick = () => location.reload();
    const reset = document.createElement('button'); reset.className = 'workshop-secondary'; reset.textContent = 'Reset saved game';
    reset.onclick = () => {
      if (confirm('Delete this browser’s saved lounge, parts, diamonds and puzzle progress?')) {
        localStorage.removeItem('gaming_zone_tycoon_save_v1'); location.reload();
      }
    };
    panel.append(heading, detail, retry, reset); uiContainer.append(panel);
  }
});

