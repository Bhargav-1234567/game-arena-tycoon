export interface MonitorUpgrade {
  level: number;
  id: string;
  name: string;
  model: string;
  price: number;
  refreshRate: number;
  satisfactionBonus: number;
  description: string;
}

export const monitorUpgrades: MonitorUpgrade[] = [
  {
    level: 1,
    id: 'monitor_lvl1',
    name: '24" Flat 60Hz (Lvl 1)',
    model: '/assets/models/equipment/monitors/monitor_lvl1.glb',
    price: 140,
    refreshRate: 60,
    satisfactionBonus: 10,
    description: 'Basic 1080p flat desktop display.'
  },
  {
    level: 2,
    id: 'monitor_lvl2',
    name: '27" Gaming 144Hz (Lvl 2)',
    model: '/assets/models/equipment/monitors/monitor_lvl2.glb',
    price: 360,
    refreshRate: 144,
    satisfactionBonus: 25,
    description: 'Crisp IPS gaming monitor with high refresh rate.'
  },
  {
    level: 3,
    id: 'monitor_lvl3',
    name: '32" Curved 240Hz (Lvl 3)',
    model: '/assets/models/equipment/monitors/monitor_lvl3.glb',
    price: 780,
    refreshRate: 240,
    satisfactionBonus: 50,
    description: 'Curved panoramic display with 1ms response time.'
  },
  {
    level: 4,
    id: 'monitor_lvl4',
    name: '49" Super-Ultrawide OLED (Lvl 4)',
    model: '/assets/models/equipment/monitors/monitor_lvl4.glb',
    price: 1800,
    refreshRate: 360,
    satisfactionBonus: 90,
    description: 'Immense super-ultrawide OLED curved display with HDR1000.'
  }
];
