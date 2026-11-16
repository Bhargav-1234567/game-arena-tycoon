import './style.css';
import { Game } from './game/Game.ts';

window.addEventListener('DOMContentLoaded', async () => {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  const uiContainer = document.getElementById('ui-layer') as HTMLElement;

  if (!canvas || !uiContainer) {
    console.error('Failed to find game container elements');
    return;
  }

  const game = new Game(canvas, uiContainer);
  await game.start();
  console.log('Gaming Zone Tycoon initialized successfully!');
});

