import { EconomySystem } from './EconomySystem.ts';

export interface EmployeeRole {
  id: string;
  name: string;
  title: string;
  wagePerHour: number;
  hiredCount: number;
  maxCount: number;
  hiringCost: number;
  perkDescription: string;
  icon: string;
}

export class StaffSystem {
  private economy: EconomySystem;
  public roles: EmployeeRole[] = [
    {
      id: 'receptionist',
      name: 'Front Desk Cashier',
      title: 'Reception Staff',
      wagePerHour: 15,
      hiredCount: 1, // Start with 1 receptionist
      maxCount: 3,
      hiringCost: 150,
      perkDescription: 'Speeds up customer check-in and queue throughput by +35%.',
      icon: '🎫'
    },
    {
      id: 'technician',
      name: 'IT Systems Engineer',
      title: 'Hardware Tech',
      wagePerHour: 30,
      hiredCount: 0,
      maxCount: 2,
      hiringCost: 350,
      perkDescription: 'Optimizes PC frame rates & overclocking. +25% Station Satisfaction.',
      icon: '🔧'
    },
    {
      id: 'janitor',
      name: 'Lounge Custodian',
      title: 'Hygiene & Cleanliness',
      wagePerHour: 12,
      hiredCount: 0,
      maxCount: 2,
      hiringCost: 100,
      perkDescription: 'Maintains pristine tables and floors. +10 Lounge Reputation.',
      icon: '🧹'
    }
  ];

  private wageTimer: number = 0;

  constructor(economy: EconomySystem) {
    this.economy = economy;
  }

  public getTotalHourlyWages(): number {
    return this.roles.reduce((sum, role) => sum + role.wagePerHour * role.hiredCount, 0);
  }

  public hire(roleId: string): boolean {
    const role = this.roles.find((r) => r.id === roleId);
    if (!role || role.hiredCount >= role.maxCount) return false;

    if (this.economy.spend(role.hiringCost)) {
      role.hiredCount++;
      if (role.id === 'janitor') {
        this.economy.addReputation(10);
      }
      return true;
    }
    return false;
  }

  public fire(roleId: string): boolean {
    const role = this.roles.find((r) => r.id === roleId);
    if (!role || role.hiredCount <= 0) return false;
    // Keep at least 1 receptionist
    if (role.id === 'receptionist' && role.hiredCount <= 1) return false;

    role.hiredCount--;
    return true;
  }

  public update(deltaTime: number) {
    // Deduct staff wages every in-game hour (15 real seconds = 1 in-game hour)
    this.wageTimer += deltaTime;
    if (this.wageTimer >= 15.0) {
      this.wageTimer = 0;
      const totalWages = this.getTotalHourlyWages();
      if (totalWages > 0) {
        this.economy.spend(totalWages);
      }
    }
  }
}

