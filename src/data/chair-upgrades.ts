export interface ChairUpgrade {
  level: number;
  id: string;
  name: string;
  model: string;
  price: number;
  comfort: number;
  sessionBonus: number;
  description: string;
}

export const chairUpgrades: ChairUpgrade[] = [
  {
    level: 1,
    id: 'chair_lvl1',
    name: 'Office Swivel (Lvl 1)',
    model: '/assets/models/equipment/chairs/chair_lvl1.glb',
    price: 100,
    comfort: 20,
    sessionBonus: 1.0,
    description: 'Standard swivel desk chair for everyday seating.'
  },
  {
    level: 2,
    id: 'chair_lvl2',
    name: 'Ergonomic Mesh (Lvl 2)',
    model: '/assets/models/equipment/chairs/chair_lvl2.glb',
    price: 280,
    comfort: 45,
    sessionBonus: 1.25,
    description: 'Breathable ergonomic mesh with lumbar cushion support.'
  },
  {
    level: 3,
    id: 'chair_lvl3',
    name: 'Racing Bucket Chair (Lvl 3)',
    model: '/assets/models/equipment/chairs/chair_lvl3.glb',
    price: 650,
    comfort: 70,
    sessionBonus: 1.5,
    description: 'High-bolster racing bucket seat with padded armrests.'
  },
  {
    level: 4,
    id: 'chair_lvl4',
    name: 'VIP Emperor Throne (Lvl 4)',
    model: '/assets/models/equipment/chairs/chair_lvl4.glb',
    price: 1400,
    comfort: 100,
    sessionBonus: 2.0,
    description: 'Luxury memory foam recliner chair designed for streamer marathons.'
  }
];
