export interface BuildableItem {
  id: string;
  name: string;
  category: 'station' | 'facility' | 'decor' | 'structure';
  price: number;
  width: number; // in tiles
  height: number; // in tiles
  modelPath: string;
  description: string;
  hourlyRevenueBonus?: number;
  reputationBonus?: number;
}

export const BUILDABLE_ITEMS: BuildableItem[] = [
  // Stations
  {
    id: 'station_bundle',
    name: 'Gaming BattleStation (Lvl 1)',
    category: 'station',
    price: 640,
    width: 2,
    height: 1,
    modelPath: '/assets/models/furniture/desks/desk_lvl1.glb',
    description: 'Complete station with desk, chair, PC rig, monitor & peripherals.',
    hourlyRevenueBonus: 25,
    reputationBonus: 5
  },

  // Reception Table (Base Lvl 1 - upgradeable in-place)
  {
    id: 'reception_counter',
    name: 'Reception Desk (Lvl 1)',
    category: 'facility',
    price: 300,
    width: 2,
    height: 2,
    modelPath: '/assets/models/furniture/counters/reception_lvl1.glb',
    description: 'Executive front desk equipped with guest sign-in book, nameplate & pen mug.',
    reputationBonus: 10
  },

  // Arcade Machine (Base Lvl 1 - upgradeable in-place)
  {
    id: 'arcade_lvl1',
    name: 'Classic Arcade Cabinet (Lvl 1)',
    category: 'facility',
    price: 450,
    width: 1,
    height: 1,
    modelPath: '/assets/models/business/arcade/arcade_lvl1.glb',
    description: '8-bit retro gaming cabinet with joystick controls.',
    hourlyRevenueBonus: 20,
    reputationBonus: 12
  },

  // Vending Machine (Base Lvl 1 - upgradeable in-place)
  {
    id: 'vending_lvl1',
    name: 'Soda Vending (Lvl 1)',
    category: 'facility',
    price: 350,
    width: 1,
    height: 1,
    modelPath: '/assets/models/business/vending/vending_lvl1.glb',
    description: 'Cold sodas and water bottles for thirsty players.',
    hourlyRevenueBonus: 15,
    reputationBonus: 5
  },

  // Lounge Sofa (Base Lvl 1 - upgradeable in-place)
  {
    id: 'sofa_lvl1',
    name: 'Compact Lobby Bench (Lvl 1)',
    category: 'facility',
    price: 180,
    width: 2,
    height: 1,
    modelPath: '/assets/models/furniture/sofas/sofa_lvl1.glb',
    description: 'Simple waiting bench for lounge visitors.',
    reputationBonus: 8
  },

  // Decor & Walls
  {
    id: 'plant_indoor',
    name: 'Modern Indoor Planter',
    category: 'decor',
    price: 80,
    width: 1,
    height: 1,
    modelPath: '/assets/models/decorations/plant_indoor.glb',
    description: 'Lush greenery to boost lounge ambiance and mood.',
    reputationBonus: 6
  },
  {
    id: 'neon_sign_game',
    name: '"GAME ON" Neon Sign',
    category: 'decor',
    price: 240,
    width: 1,
    height: 1,
    modelPath: '/assets/models/decorations/neon_sign_game.glb',
    description: 'Cyber neon sign with vibrant glow.',
    reputationBonus: 15
  },
  {
    id: 'wall_straight',
    name: 'Acoustic Partition Wall',
    category: 'structure',
    price: 50,
    width: 1,
    height: 1,
    modelPath: '/assets/models/environment/walls/wall_straight.glb',
    description: 'Sound-dampening wall module to organize VIP gaming areas.',
    reputationBonus: 2
  }
];
