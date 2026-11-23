import type { BoosterKind, PieceKind } from './catalog.ts';

// Original component silhouettes adapted from Build & Boot's PartIcon / app.css.
export function partIcon(piece: PieceKind): string {
  const art: Record<PieceKind, string> = {
    cpu: '<b>CPU</b><i></i>', ram: '<b>RAM</b><i></i><i></i><i></i>',
    gpu: '<i></i><i></i><b>GPU</b>', ssd: '<b>SSD</b><i></i>',
    power: '<b>W</b><i></i>', fan: '<i></i><b>FAN</b>'
  };
  return `<span class="bb-part bb-${piece}" aria-hidden="true">${art[piece]}</span>`;
}
export const LIFELINES: Record<BoosterKind, { name: string; detail: string; instruction: string; icon: PieceKind | 'mouse' }> = {
  gpu: { name: 'GPU Render', detail: 'Draw a 3 × 3 frame', instruction: 'Choose the center tile. Clear up to nine tiles without using a move.', icon: 'gpu' },
  cpu: { name: 'CPU Chain', detail: 'Process 6 matching parts', instruction: 'Choose a part type. Process up to six of that type without using a move.', icon: 'cpu' },
  mouse: { name: 'Free Move', detail: 'Swap any two parts', instruction: 'Choose any two unlocked tiles, even far apart. No match or move cost required.', icon: 'mouse' },
  cooling: { name: 'Cooling Wave', detail: 'Cool heat · pause hazards', instruction: 'Clear all heat and stop virus growth for the next three normal moves. No move cost.', icon: 'fan' }
};
export function lifelineIcon(kind: BoosterKind): string {
  const icon = LIFELINES[kind].icon;
  return icon === 'mouse' ? '<span class="bb-mouse" aria-hidden="true"><i></i></span>' : partIcon(icon);
}
