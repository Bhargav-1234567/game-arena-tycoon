export interface PeripheralUpgrade {
  level: number;
  id: string;
  name: string;
  model: string;
  price: number;
  bonus: number;
  description: string;
}

export const keyboardUpgrades: PeripheralUpgrade[] = [
  { level: 1, id: 'kb_lvl1', name: 'Membrane Office Keyboard', model: '/assets/models/equipment/keyboards/keyboard_lvl1.glb', price: 30, bonus: 5, description: 'Basic USB membrane keyboard.' },
  { level: 2, id: 'kb_lvl2', name: 'RGB Backlit Keyboard', model: '/assets/models/equipment/keyboards/keyboard_lvl2.glb', price: 80, bonus: 15, description: 'Single-zone LED gaming keyboard.' },
  { level: 3, id: 'kb_lvl3', name: 'Mechanical Blue Switches', model: '/assets/models/equipment/keyboards/keyboard_lvl3.glb', price: 160, bonus: 30, description: 'Tactile clicky mechanical switches with PBT keycaps.' },
  { level: 4, id: 'kb_lvl4', name: 'Custom Hall-Effect Magnetic', model: '/assets/models/equipment/keyboards/keyboard_lvl4.glb', price: 320, bonus: 55, description: 'Rapid trigger magnetic switch keyboard for instant actuation.' }
];

export const mouseUpgrades: PeripheralUpgrade[] = [
  { level: 1, id: 'mouse_lvl1', name: 'Optical Office Mouse', model: '/assets/models/equipment/mice/mouse_lvl1.glb', price: 20, bonus: 5, description: 'Standard optical mouse.' },
  { level: 2, id: 'mouse_lvl2', name: 'Gaming Mouse 6400 DPI', model: '/assets/models/equipment/mice/mouse_lvl2.glb', price: 60, bonus: 15, description: 'Ergonomic shape with side thumb buttons.' },
  { level: 3, id: 'mouse_lvl3', name: 'Ultralight Honeycomb 16K', model: '/assets/models/equipment/mice/mouse_lvl3.glb', price: 120, bonus: 30, description: '58g ultralight perforated shell with flawless sensor.' },
  { level: 4, id: 'mouse_lvl4', name: 'Wireless 8000Hz Esports Mouse', model: '/assets/models/equipment/mice/mouse_lvl4.glb', price: 240, bonus: 50, description: 'Hyper-polling wireless esports mouse with optical switches.' }
];

export const speakerUpgrades: PeripheralUpgrade[] = [
  { level: 1, id: 'spk_lvl1', name: 'USB Stereo Speakers', model: '/assets/models/equipment/speakers/speaker_lvl1.glb', price: 40, bonus: 5, description: 'Compact stereo desktop speakers.' },
  { level: 2, id: 'spk_lvl2', name: 'RGB Gaming Soundbar', model: '/assets/models/equipment/speakers/speaker_lvl2.glb', price: 95, bonus: 15, description: 'Under-monitor soundbar with bass radiator.' },
  { level: 3, id: 'spk_lvl3', name: 'Hi-Fi Studio Monitors', model: '/assets/models/equipment/speakers/speaker_lvl3.glb', price: 220, bonus: 35, description: 'Wooden enclosure studio monitors with crystal highs.' },
  { level: 4, id: 'spk_lvl4', name: 'Surround Sound Tower Audio', model: '/assets/models/equipment/speakers/speaker_lvl4.glb', price: 500, bonus: 65, description: 'High-power audiophile sound system with subwoofer.' }
];

