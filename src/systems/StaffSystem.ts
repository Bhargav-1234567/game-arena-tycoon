import { MAX_RAISES, efficiency, wage } from '../data/employees.ts';
import type { Employee, StaffRole, SavedWorkforce } from '../data/employees.ts';
import { SECONDS_PER_GAME_HOUR } from '../data/simulation.ts';
import { EconomySystem } from './EconomySystem.ts';

export interface EmployeeRole {
  id: StaffRole;
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
      name: 'Receptionist',
      title: 'Reception Staff',
      wagePerHour: 15,
      hiredCount: 1, // Start with 1 receptionist
      maxCount: 3,
      hiringCost: 150,
      perkDescription: 'Assign a counter to check in guests and send them to available PCs.',
      icon: '🎫'
    },
    {
      id: 'technician',
      name: 'Technician',
      title: 'Hardware Tech',
      wagePerHour: 30,
      hiredCount: 0,
      maxCount: 2,
      hiringCost: 350,
      perkDescription: 'Repairs worn PCs and arcade machines. +25% station satisfaction per technician.',
      icon: '🔧'
    },
    {
      id: 'janitor',
      name: 'Cleaner',
      title: 'Hygiene & Cleanliness',
      wagePerHour: 12,
      hiredCount: 0,
      maxCount: 2,
      hiringCost: 100,
      perkDescription: 'Collects litter and mops spills to restore guest patience.',
      icon: '🧹'
    },
    {
      id: 'attendant', name: 'Vending Attendant', title: 'Stockroom',
      wagePerHour: 18, hiredCount: 0, maxCount: 2, hiringCost: 180,
      perkDescription: 'Collects crates and refills low-stock vending machines.', icon: '📦'
    }
  ];

  public employees: Employee[] = [];
  public payrollSeconds = 0;
  public owed = 0;
  public accruedWages = 0;
  public onWages?: (paid: number) => void;
  public onChange?: () => void;

  private addEmployee(role: StaffRole) {
    const seed = crypto.getRandomValues(new Uint32Array(1))[0];
    const names = seed % 5 < 3 ? ['Dev', 'Nikhil', 'Om', 'Ravi', 'Jay', 'Arun', 'Neel', 'Manav'] :
      ['Tara', 'Diya', 'Pia', 'Kavya', 'Ria', 'Mira', 'Nina', 'Avni'];
    const name = names.map((_,i) => names[(seed % names.length + i) % names.length]).find(n => !this.employees.some(e => e.name === n))!;
    this.employees.push({ id: crypto.randomUUID(), name, role, seed, raises: 0, jobs: 0,
      priority: role === 'receptionist' ? 'unassigned' : 'auto', x: 0, z: 8.85 });
  }

  public restore(counts: { id: string; hiredCount: number }[], saved?: SavedWorkforce) {
    this.employees = saved?.employees ?? [];
    this.payrollSeconds = saved?.payrollSeconds ?? 0;
    this.owed = saved?.owed ?? 0;
    for (const role of this.roles) {
      role.hiredCount = counts.find(c => c.id === role.id)?.hiredCount ?? Number(role.id === 'receptionist');
      if (!saved) for (let i = Number(role.id === 'receptionist'); i < role.hiredCount; i++) this.addEmployee(role.id);
    }
    this.accruedWages = saved?.accruedWages ?? this.payrollSeconds*this.getTotalHourlyWages()/SECONDS_PER_GAME_HOUR;
  }

  public raise(id: string) {
    const e = this.employees.find(e => e.id === id);
    if (!e || e.raises >= MAX_RAISES) return false;
    e.raises++;
    this.onChange?.();
    return true;
  }


  constructor(economy: EconomySystem) {
    this.economy = economy;
  }

  public getTechnicianMultiplier(): number {
    return 1 + .25 * (this.roles.find((role) => role.id === 'technician')?.hiredCount ?? 0);
  }

  public getCashierMultiplier(): number {
    return 1 + .35 * this.employees.filter(e => e.role === 'receptionist').reduce((sum,e) => sum + efficiency(e), 0);
  }

  public getTotalHourlyWages(): number {
    return 15 + this.employees.reduce((sum, e) => sum + wage(e), 0);
  }

  public hire(roleId: string): boolean {
    const role = this.roles.find((r) => r.id === roleId);
    if (!role || role.hiredCount >= role.maxCount) return false;

    if (this.economy.spend(role.hiringCost)) {
      role.hiredCount++;
      this.addEmployee(role.id);
      this.onChange?.();
      return true;
    }
    return false;
  }

  public fire(roleId: string, employeeId?: string): boolean {
    const role = this.roles.find((r) => r.id === roleId);
    if (!role || role.hiredCount <= 0) return false;
    // Keep at least 1 receptionist
    if (role.id === 'receptionist' && role.hiredCount <= 1) return false;

    const index = this.employees.findIndex(e => e.role === roleId && (!employeeId || e.id === employeeId));
    if (index < 0) return false;
    this.employees.splice(index, 1);
    role.hiredCount--;
    this.onChange?.();
    return true;
  }

  public update(deltaTime: number) {
    const hourly = this.getTotalHourlyWages();
    this.accruedWages += deltaTime*hourly/SECONDS_PER_GAME_HOUR;
    this.payrollSeconds += deltaTime;
    if (this.payrollSeconds + 1e-9 < SECONDS_PER_GAME_HOUR) return;
    const hours = Math.floor((this.payrollSeconds+1e-9)/SECONDS_PER_GAME_HOUR);
    this.payrollSeconds = Math.max(0,this.payrollSeconds-hours*SECONDS_PER_GAME_HOUR);
    const currentHour = this.payrollSeconds*hourly/SECONDS_PER_GAME_HOUR;
    const due = Math.floor(this.accruedWages-currentHour+1e-8);
    this.owed += due;
    this.accruedWages = Math.max(0,this.accruedWages-due);
    const paid = Math.min(this.owed, Math.floor(this.economy.cash));
    if (paid > 0 && this.economy.spend(paid)) {
      this.owed -= paid;
      this.onWages?.(paid);
    }
  }
}
