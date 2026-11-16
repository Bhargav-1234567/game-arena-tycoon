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

  // Reception Tables (Levels 1 to 4)
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
  {
    id: 'reception_lvl2',
    name: 'Executive Reception (Lvl 2)',
    category: 'facility',
    price: 650,
    width: 2,
    height: 2,
    modelPath: '/assets/models/furniture/counters/reception_lvl2.glb',
    description: 'Executive counter equipped with office phone intercom & desktop organizer.',
    reputationBonus: 20
  },
  {
    id: 'reception_lvl3',
    name: 'Tech Bar Counter (Lvl 3)',
    category: 'facility',
    price: 1200,
    width: 2,
    height: 2,
    modelPath: '/assets/models/furniture/counters/reception_lvl3.glb',
    description: 'Tech check-in bar equipped with staff laptop, customer card scanner & tray.',
    reputationBonus: 35
  },
  {
    id: 'reception_lvl4',
    name: 'Cyberpunk POS Arena Desk (Lvl 4)',
    category: 'facility',
    price: 2400,
    width: 2,
    height: 2,
    modelPath: '/assets/models/furniture/counters/reception_lvl4.glb',
    description: 'Flagship arena terminal with touchscreen POS machine, cash drawer & receipt printer.',
    reputationBonus: 60
  },

  // Arcade Machines (Levels 1 to 4)
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
  {
    id: 'arcade_lvl2',
    name: 'Deluxe Fighting Arcade (Lvl 2)',
    category: 'facility',
    price: 900,
    width: 1,
    height: 1,
    modelPath: '/assets/models/business/arcade/arcade_lvl2.glb',
    description: 'Dual-player fighting cabinet with high-def CRT and stereo sound.',
    hourlyRevenueBonus: 45,
    reputationBonus: 25
  },
  {
    id: 'arcade_lvl3',
    name: 'Rhythm Dance Stage (Lvl 3)',
    category: 'facility',
    price: 1800,
    width: 1,
    height: 1,
    modelPath: '/assets/models/business/arcade/arcade_lvl3.glb',
    description: 'Illuminated rhythm stage that draws spectators and competitive dancers.',
    hourlyRevenueBonus: 85,
    reputationBonus: 45
  },
  {
    id: 'arcade_lvl4',
    name: 'VR Motion Simulator (Lvl 4)',
    category: 'facility',
    price: 3600,
    width: 2,
    height: 2,
    modelPath: '/assets/models/business/arcade/arcade_lvl4.glb',
    description: 'Full-motion hydraulic simulator cockpit. Top attraction!',
    hourlyRevenueBonus: 180,
    reputationBonus: 80
  },

  // Vending Machines (Levels 1 to 4)
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
  {
    id: 'vending_lvl2',
    name: 'Snack & Energy Drink (Lvl 2)',
    category: 'facility',
    price: 750,
    width: 1,
    height: 1,
    modelPath: '/assets/models/business/vending/vending_lvl2.glb',
    description: 'Energy drinks and chips to fuel late-night gaming sessions.',
    hourlyRevenueBonus: 35,
    reputationBonus: 15
  },
  {
    id: 'vending_lvl3',
    name: 'Hot Coffee & Meal Vendor (Lvl 3)',
    category: 'facility',
    price: 1500,
    width: 1,
    height: 1,
    modelPath: '/assets/models/business/vending/vending_lvl3.glb',
    description: 'Fresh espresso and noodle bowls for marathon gamers.',
    hourlyRevenueBonus: 70,
    reputationBonus: 30
  },
  {
    id: 'vending_lvl4',
    name: 'Gamer Fuel Smart Mart (Lvl 4)',
    category: 'facility',
    price: 2800,
    width: 1,
    height: 1,
    modelPath: '/assets/models/business/vending/vending_lvl4.glb',
    description: 'Robotic automated snack vendor with touch-screen ordering.',
    hourlyRevenueBonus: 130,
    reputationBonus: 55
  },

  // Sofas (Levels 1 to 4)
  {
    id: 'sofa_lvl1',
    name: 'Compact Lobby Bench (Lvl 1)',
    category: 'decor',
    price: 180,
    width: 2,
    height: 1,
    modelPath: '/assets/models/furniture/sofas/sofa_lvl1.glb',
    description: 'Simple waiting bench for lounge visitors.',
    reputationBonus: 8
  },
  {
    id: 'sofa_lvl2',
    name: 'Modern 2-Seat Sofa (Lvl 2)',
    category: 'decor',
    price: 380,
    width: 2,
    height: 1,
    modelPath: '/assets/models/furniture/sofas/sofa_lvl2.glb',
    description: 'Comfortable cushioned sofa for relaxing between games.',
    reputationBonus: 18
  },
  {
    id: 'sofa_lvl3',
    name: 'Executive Leather Couch (Lvl 3)',
    category: 'decor',
    price: 750,
    width: 2,
    height: 1,
    modelPath: '/assets/models/furniture/sofas/sofa_lvl3.glb',
    description: 'Supple leather seating with deep cushions.',
    reputationBonus: 32
  },
  {
    id: 'sofa_lvl4',
    name: 'VIP Sectional Lounge (Lvl 4)',
    category: 'decor',
    price: 1500,
    width: 2,
    height: 1,
    modelPath: '/assets/models/furniture/sofas/sofa_lvl4.glb',
    description: 'Spacious sectional sofa with built-in USB ports.',
    reputationBonus: 55
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
