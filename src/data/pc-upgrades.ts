export interface PCUpgrade {
  level: number;
  id: string;
  name: string;
  model: string;
  price: number;
  performance: number;
  hourlyRevenue: number;
  description: string;
}

export const pcUpgrades: PCUpgrade[] = [
  {
    level: 1,
    id: 'pc_lvl1',
    name: 'Starter PC Rig (Lvl 1)',
    model: '/assets/models/equipment/pcs/pc_lvl1.glb',
    price: 300,
    performance: 25,
    hourlyRevenue: 25,
    description: 'Compact desktop tower. Plays basic esports titles.'
  },
  {
    level: 2,
    id: 'pc_lvl2',
    name: 'Gamer Rig (Lvl 2)',
    model: '/assets/models/equipment/pcs/pc_lvl2.glb',
    price: 850,
    performance: 55,
    hourlyRevenue: 60,
    description: 'Mid-tower gaming chassis with dedicated GPU and cooling.'
  },
  {
    level: 3,
    id: 'pc_lvl3',
    name: 'Esports Battle Rig (Lvl 3)',
    model: '/assets/models/equipment/pcs/pc_lvl3.glb',
    price: 2200,
    performance: 85,
    hourlyRevenue: 110,
    description: 'Liquid-cooled high-refresh system for ranked tournament play.'
  },
  {
    level: 4,
    id: 'pc_lvl4',
    name: 'Cyber Super-Tower (Lvl 4)',
    model: '/assets/models/equipment/pcs/pc_lvl4.glb',
    price: 5500,
    performance: 120,
    hourlyRevenue: 220,
    description: 'Ultimate enthusiast open-chassis rig with top-tier flagship hardware.'
  }
];
