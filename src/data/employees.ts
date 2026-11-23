import { SECONDS_PER_GAME_HOUR } from './simulation.ts';

export const STAFF_ROLES = ['receptionist', 'technician', 'janitor', 'attendant'] as const;
export type StaffRole = typeof STAFF_ROLES[number];
export const JOB_TYPES = ['assist', 'repair', 'clean', 'refill'] as const;
export type JobType = typeof JOB_TYPES[number];
export type JobStage = 'supply' | 'work' | 'dispose';
export const ROLE_JOB: Record<StaffRole, JobType> = {
  receptionist: 'assist', technician: 'repair', janitor: 'clean', attendant: 'refill'
};
export const BASE_WAGES = { receptionist: 15, technician: 30, janitor: 12, attendant: 18 };
export const WAGE_STEPS = { receptionist: 5, technician: 10, janitor: 4, attendant: 6 };
export const JOB_SECONDS = { assist: 2, repair: 5, clean: 3, refill: 3 };
export const MAX_RAISES = 3;
export interface StaffJob { kind: JobType; target: string; stage: JobStage; elapsed: number }
export interface Employee {
  id: string;
  name: string;
  role: StaffRole;
  seed: number;
  raises: number;
  priority: string;
  x: number;
  z: number;
  jobs: number;
  job?: StaffJob;
}
export interface Litter {
  id: string; kind: 'cup' | 'wrapper' | 'spill'; x: number; z: number; delay: number;
}
export interface SavedWorkforce {
  employees: Employee[]; litter: Litter[]; payrollSeconds: number; accruedWages?: number; owed: number;
}
export const wage = (e: Employee) => BASE_WAGES[e.role] + e.raises * WAGE_STEPS[e.role];
export const efficiency = (e: Employee) => 1 + e.raises * .25;

export function validateWorkforce(state: SavedWorkforce, counts: {id: string; hiredCount: number}[]) {
  const whole = (v: number, max: number) => Number.isSafeInteger(v) && v >= 0 && v <= max;
  const coordinate = (v: number) => Number.isFinite(v) && Math.abs(v) <= 100;
  const id = (v: string) => typeof v === 'string' && /^[\w-]{1,150}$/.test(v);
  if (!state || !Array.isArray(state.employees) || state.employees.length > 8 || !Array.isArray(state.litter) ||
    state.litter.length > 24 || !Number.isFinite(state.payrollSeconds) || state.payrollSeconds < 0 || state.payrollSeconds >= SECONDS_PER_GAME_HOUR ||
    (state.accruedWages !== undefined && (!Number.isFinite(state.accruedWages) || state.accruedWages < 0 || state.accruedWages > 500)) ||
    !whole(state.owed, Number.MAX_SAFE_INTEGER)) throw new Error('Invalid staff payroll or roster.');
  const ids = new Set<string>(), targets = new Set<string>();
  for (const e of state.employees) {
    if (!e || !id(e.id) || ids.has(e.id) || !STAFF_ROLES.includes(e.role) || typeof e.name !== 'string' ||
      !e.name.trim() || e.name.length > 40 || !whole(e.seed, 0xffffffff) || !whole(e.raises, MAX_RAISES) ||
      !whole(e.jobs, Number.MAX_SAFE_INTEGER) || !id(e.priority) || !coordinate(e.x) || !coordinate(e.z)) throw new Error('Invalid employee.');
    ids.add(e.id);
    if (e.job) {
      const j = e.job;
      if (j.kind !== ROLE_JOB[e.role] || !id(j.target) || targets.has(j.target) ||
        !['work','dispose','supply'].includes(j.stage) || (j.stage === 'supply' && j.kind !== 'refill') ||
        (j.stage === 'dispose' && j.kind !== 'clean') || !Number.isFinite(j.elapsed) || j.elapsed < 0 || j.elapsed > 6)
        throw new Error('Invalid employee assignment.');
      targets.add(j.target);
    }
  }
  for (const role of STAFF_ROLES) {
    const count = counts.find(r => r.id === role)?.hiredCount ?? (role === 'receptionist' ? 1 : 0);
    if (state.employees.filter(e => e.role === role).length !== count - Number(role === 'receptionist')) throw new Error('Staff roster does not match payroll.');
  }
  for (const l of state.litter) {
    if (!l || !id(l.id) || ids.has(l.id) || !['cup','wrapper','spill'].includes(l.kind) || !coordinate(l.x) || !coordinate(l.z) ||
      !Number.isFinite(l.delay) || l.delay < 0 || l.delay > 10) throw new Error('Invalid saved litter.');
    ids.add(l.id);
  }
}
