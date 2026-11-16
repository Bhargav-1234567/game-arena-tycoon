export interface DeskUpgrade {
  level: number;
  id: string;
  name: string;
  model: string;
  price: number;
  styleBonus: number;
  description: string;
}

export const deskUpgrades: DeskUpgrade[] = [
  {
    level: 1,
    id: 'desk_lvl1',
    name: 'Minimalist Wood Desk (Lvl 1)',
    model: '/assets/models/furniture/desks/desk_lvl1.glb',
    price: 150,
    styleBonus: 10,
    description: 'Clean compact desk with solid legs.'
  },
  {
    level: 2,
    id: 'desk_lvl2',
    name: 'Gamer Steel Desk (Lvl 2)',
    model: '/assets/models/furniture/desks/desk_lvl2.glb',
    price: 380,
    styleBonus: 30,
    description: 'Steel reinforcement with headphone hook and cable manager.'
  },
  {
    level: 3,
    id: 'desk_lvl3',
    name: 'Carbon Corner BattleDesk (Lvl 3)',
    model: '/assets/models/furniture/desks/desk_lvl3.glb',
    price: 750,
    styleBonus: 60,
    description: 'Textured carbon desktop with integrated power strip.'
  },
  {
    level: 4,
    id: 'desk_lvl4',
    name: 'Cyberpunk Motorized Desk (Lvl 4)',
    model: '/assets/models/furniture/desks/desk_lvl4.glb',
    price: 1600,
    styleBonus: 100,
    description: 'Electric sit-stand dual-motor carbon desk with RGB channels.'
  }
];
