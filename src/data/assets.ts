export interface BuildableItem {
  id: string;
  name: string;
  category: 'station' | 'facility' | 'decor' | 'structure' | 'building';
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
    width: 4,
    height: 3,
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
    description: 'Visitors pay $20 per completed game.',
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
    description: 'Visitors pay $15 per completed purchase.',
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
    id: 'waste_bin', name: 'Lounge Waste Bin', category: 'decor', price: 45, width: 1, height: 1,
    modelPath: 'builtin:lounge-bin', description: 'Guests and cleaners can dispose of litter here. Leave the front clear.'
  },
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
  },

  // ==================== BUILDING: FLOORS ====================
  {
    id: 'floor_full',
    name: 'Floor Slab (2x2)',
    category: 'building',
    price: 40,
    width: 2,
    height: 2,
    modelPath: '/assets/models/game creation/Building Kit/Floor.glb',
    description: 'Sturdy 2m x 2m modular floor slab.',
    reputationBonus: 1
  },
  {
    id: 'floor_half',
    name: 'Floor Slab Half (1x2)',
    category: 'building',
    price: 25,
    width: 1,
    height: 2,
    modelPath: '/assets/models/game creation/Building Kit/Floor Half.glb',
    description: '1m x 2m modular interior floor tile.',
    reputationBonus: 1
  },
  {
    id: 'floor_quarter',
    name: 'Floor Tile Quarter (1x1)',
    category: 'building',
    price: 15,
    width: 1,
    height: 1,
    modelPath: '/assets/models/game creation/Building Kit/Floor Quarter.glb',
    description: '1m x 1m compact floor tile.',
    reputationBonus: 1
  },
  {
    id: 'floor_corner_round',
    name: 'Floor Corner Rounded (2x2)',
    category: 'building',
    price: 35,
    width: 2,
    height: 2,
    modelPath: '/assets/models/game creation/Building Kit/Floor Corner Round.glb',
    description: 'Polished 2m x 2m rounded corner floor tile.',
    reputationBonus: 1
  },
  {
    id: 'floor_corner_diagonal',
    name: 'Floor Corner Diagonal (2x2)',
    category: 'building',
    price: 35,
    width: 2,
    height: 2,
    modelPath: '/assets/models/game creation/Building Kit/Floor Corner Diagona.glb',
    description: 'Beveled 2m x 2m diagonal corner floor tile.',
    reputationBonus: 1
  },

  // ==================== BUILDING: WALLS ====================
  {
    id: 'wall_solid',
    name: 'Standard Solid Wall (2m)',
    category: 'building',
    price: 50,
    width: 1,
    height: 2,
    modelPath: '/assets/models/game creation/Building Kit/Wall.glb',
    description: '2m full-height solid wall module for room dividing.',
    reputationBonus: 2
  },
  {
    id: 'wall_half',
    name: 'Half Wall (1m)',
    category: 'building',
    price: 30,
    width: 1,
    height: 1,
    modelPath: '/assets/models/game creation/Building Kit/Wall Half.glb',
    description: '1m wide full-height wall connector.',
    reputationBonus: 1
  },
  {
    id: 'wall_low',
    name: 'Partition Low Wall (2m)',
    category: 'building',
    price: 40,
    width: 1,
    height: 2,
    modelPath: '/assets/models/game creation/Building Kit/Wall Low.glb',
    description: 'Half-height divider wall for organizing lounge zones.',
    reputationBonus: 2
  },
  {
    id: 'wall_corner',
    name: 'Wall Corner 90° (2x2)',
    category: 'building',
    price: 60,
    width: 2,
    height: 2,
    modelPath: '/assets/models/game creation/Building Kit/Wall Corner.glb',
    description: '90-degree outer corner wall junction.',
    reputationBonus: 2
  },
  {
    id: 'wall_corner_round',
    name: 'Wall Corner Rounded (2x2)',
    category: 'building',
    price: 65,
    width: 2,
    height: 2,
    modelPath: '/assets/models/game creation/Building Kit/Wall Corner Round.glb',
    description: 'Curved seamless corner wall module.',
    reputationBonus: 2
  },
  {
    id: 'wall_corner_diag',
    name: 'Wall Corner Diagonal (2x2)',
    category: 'building',
    price: 65,
    width: 2,
    height: 2,
    modelPath: '/assets/models/game creation/Building Kit/Wall Corner Diagonal.glb',
    description: 'Modern 45-degree diagonal wall corner.',
    reputationBonus: 2
  },

  // ==================== BUILDING: WINDOWS ====================
  {
    id: 'wall_win_square',
    name: 'Square Window Wall (2m)',
    category: 'building',
    price: 75,
    width: 1,
    height: 2,
    modelPath: '/assets/models/game creation/Building Kit/Wall Window Square.glb',
    description: 'Large square glass window wall.',
    reputationBonus: 3
  },
  {
    id: 'wall_win_wide',
    name: 'Panoramic Window Wall (4m)',
    category: 'building',
    price: 140,
    width: 1,
    height: 4,
    modelPath: '/assets/models/game creation/Building Kit/Wall Window Wide.glb',
    description: '4m wide floor-to-ceiling panoramic glass window.',
    reputationBonus: 5
  },
  {
    id: 'wall_win_round',
    name: 'Round Window Wall (2m)',
    category: 'building',
    price: 80,
    width: 1,
    height: 2,
    modelPath: '/assets/models/game creation/Building Kit/Wall Window Round.glb',
    description: 'Contemporary circular porthole window wall.',
    reputationBonus: 3
  },
  {
    id: 'wall_win_sq_double',
    name: 'Double Window Wall (2m)',
    category: 'building',
    price: 85,
    width: 1,
    height: 2,
    modelPath: '/assets/models/game creation/Building Kit/Wall Window Square D.glb',
    description: 'Dual-pane architectural window wall.',
    reputationBonus: 3
  },
  {
    id: 'wall_win_wide_round',
    name: 'Panoramic Rounded Window (4m)',
    category: 'building',
    price: 150,
    width: 1,
    height: 4,
    modelPath: '/assets/models/game creation/Building Kit/Wall Window Wide Rou.glb',
    description: '4m wide architectural rounded glass window.',
    reputationBonus: 5
  },
  {
    id: 'wall_win_round_deco',
    name: 'Decorative Window Wall (2m)',
    category: 'building',
    price: 90,
    width: 1,
    height: 2,
    modelPath: '/assets/models/game creation/Building Kit/Wall Window Round De.glb',
    description: 'Decorative circular framed window.',
    reputationBonus: 4
  },

  // ==================== BUILDING: DOORS & DOORWAYS ====================
  {
    id: 'wall_doorway_square',
    name: 'Square Doorway Arch (2m)',
    category: 'building',
    price: 70,
    width: 1,
    height: 2,
    modelPath: '/assets/models/game creation/Building Kit/Wall Doorway Square.glb',
    description: '2m open doorway archway for walkthroughs.',
    reputationBonus: 2
  },
  {
    id: 'wall_doorway_round',
    name: 'Rounded Doorway Arch (2m)',
    category: 'building',
    price: 75,
    width: 1,
    height: 2,
    modelPath: '/assets/models/game creation/Building Kit/Wall Doorway Round.glb',
    description: 'Curved archway opening for walkthroughs.',
    reputationBonus: 2
  },
  {
    id: 'wall_doorway_wide',
    name: 'Wide Double Doorway (4m)',
    category: 'building',
    price: 120,
    width: 1,
    height: 4,
    modelPath: '/assets/models/game creation/Building Kit/Wall Doorway Wide.glb',
    description: 'Grand 4m wide double-door archway.',
    reputationBonus: 4
  },
  {
    id: 'door_red',
    name: 'Classic Red Door (1m)',
    category: 'building',
    price: 60,
    width: 1,
    height: 1,
    modelPath: '/assets/models/game creation/Building Kit/Red Door.glb',
    description: 'Vibrant red entrance door with chrome handle.',
    reputationBonus: 2
  },
  {
    id: 'door_modern',
    name: 'Modern Glass Door (1m)',
    category: 'building',
    price: 70,
    width: 1,
    height: 1,
    modelPath: '/assets/models/game creation/Building Kit/Modern door.glb',
    description: 'Contemporary steel and glass office door.',
    reputationBonus: 2
  },
  {
    id: 'door_grey',
    name: 'Industrial Grey Door (1m)',
    category: 'building',
    price: 55,
    width: 1,
    height: 1,
    modelPath: '/assets/models/game creation/Building Kit/Grey Door.glb',
    description: 'Heavy matte grey security door.',
    reputationBonus: 2
  },
  {
    id: 'door_white',
    name: 'Minimalist White Door (1m)',
    category: 'building',
    price: 60,
    width: 1,
    height: 1,
    modelPath: '/assets/models/game creation/Building Kit/White door.glb',
    description: 'Clean white interior panel door.',
    reputationBonus: 2
  },
  {
    id: 'door_wood',
    name: 'Warm Wooden Door (1m)',
    category: 'building',
    price: 65,
    width: 1,
    height: 1,
    modelPath: '/assets/models/game creation/Building Kit/Wooden Door.glb',
    description: 'Polished natural timber door.',
    reputationBonus: 2
  },
  {
    id: 'door_rounded',
    name: 'Rounded Arch Door (1m)',
    category: 'building',
    price: 70,
    width: 1,
    height: 1,
    modelPath: '/assets/models/game creation/Building Kit/Rounded Door.glb',
    description: 'Curved arch security vault door.',
    reputationBonus: 2
  },
  {
    id: 'door_wood_rounded',
    name: 'Wooden Arch Door (1m)',
    category: 'building',
    price: 75,
    width: 1,
    height: 1,
    modelPath: '/assets/models/game creation/Building Kit/Wooden Door Rounded.glb',
    description: 'Carved natural wood rounded arch door.',
    reputationBonus: 2
  },

  // ==================== BUILDING: COLUMNS ====================
  {
    id: 'column_pillar',
    name: 'Support Column (1x1)',
    category: 'building',
    price: 45,
    width: 1,
    height: 1,
    modelPath: '/assets/models/game creation/Building Kit/Column.glb',
    description: 'Square load-bearing architectural column.',
    reputationBonus: 2
  },
  {
    id: 'column_thin',
    name: 'Slim Pillar Column (1x1)',
    category: 'building',
    price: 35,
    width: 1,
    height: 1,
    modelPath: '/assets/models/game creation/Building Kit/Column Thin.glb',
    description: 'Slim aesthetic pillar for interior detailing.',
    reputationBonus: 1
  },
  {
    id: 'column_wide',
    name: 'Heavy Pillar Column (1x1)',
    category: 'building',
    price: 55,
    width: 1,
    height: 1,
    modelPath: '/assets/models/game creation/Building Kit/Column Wide.glb',
    description: 'Heavy reinforced industrial column.',
    reputationBonus: 2
  },
  {
    id: 'column_corner',
    name: 'Corner Column Junction (2x2)',
    category: 'building',
    price: 70,
    width: 2,
    height: 2,
    modelPath: '/assets/models/game creation/Building Kit/Wall Corner Column.glb',
    description: 'Structural corner column connector.',
    reputationBonus: 2
  },
  {
    id: 'column_corner_b',
    name: 'Beveled Corner Column (2x2)',
    category: 'building',
    price: 75,
    width: 2,
    height: 2,
    modelPath: '/assets/models/game creation/Building Kit/Wall Corner Column B.glb',
    description: 'Beveled corner architectural column.',
    reputationBonus: 2
  },
  {
    id: 'column_corner_s',
    name: 'Slim Corner Column (2x2)',
    category: 'building',
    price: 65,
    width: 2,
    height: 2,
    modelPath: '/assets/models/game creation/Building Kit/Wall Corner Column S.glb',
    description: 'Slimline corner architectural column.',
    reputationBonus: 2
  }
];
