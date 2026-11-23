import { STAFF_ROLES, validateWorkforce } from '../data/employees.ts';
import type { SavedWorkforce } from '../data/employees.ts';
import type { ShiftResult } from '../systems/LoungeOperations.ts';
import { WorkshopSystem, newWorkshopState } from '../systems/WorkshopSystem.ts';
import type { WorkshopState } from '../systems/WorkshopSystem.ts';
import { NeighborhoodSystem } from '../systems/NeighborhoodSystem.ts';
import type { NeighborhoodState } from '../systems/NeighborhoodSystem.ts';

export interface SavedStationData {
  id: string;
  gridX: number;
  gridZ: number;
  rotationIndex: number;
  sessionsSinceService?: number;
  pcLevel: number;
  chairLevel: number;
  monitorLevel: number;
  deskLevel: number;
  keyboardLevel: number;
  mouseLevel: number;
  speakerLevel: number;
}

export interface SavedFacilityData {
  salesSinceRefill?: number;
  playsSinceService?: number;
  id: string;
  itemId: string;
  gridX: number;
  gridZ: number;
  rotationIndex: number;
  level?: number;
}

export interface SavedStaffRoleData {
  id: string;
  hiredCount: number;
}

export interface SavedReceptionData {
  id: string;
  gridX: number;
  gridZ: number;
  rotationIndex: number;
  level: number;
}

export interface SavedObjectData {
  id: string;
  itemId: string;
  gridX: number;
  gridZ: number;
  rotationIndex: number;
}

export interface GameSaveState {
  workforce?: SavedWorkforce;
  receptionist?: { x: number; z: number };
  shift?: ShiftResult;
  previousShift?: ShiftResult;
  version: number;
  timestamp: number;
  economy: {
    cash: number;
    reputation: number;
    day: number;
    timeMinutes: number;
  };
  receptionLevel?: number;
  stations: SavedStationData[];
  facilities: SavedFacilityData[];
  staff: SavedStaffRoleData[];
  expansionCount?: number;
  receptions?: SavedReceptionData[];
  objects?: SavedObjectData[];
  workshop: WorkshopState;
  neighborhood?: NeighborhoodState;
}

const SAVE_KEY = 'gaming_zone_tycoon_save_v1';

export class SaveManager {
  private static instance: SaveManager;

  private storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  private knownRaw: string | null | undefined;

  constructor(storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = localStorage) {
    this.storage = storage;
  }

  public static getInstance(): SaveManager {
    if (!SaveManager.instance) {
      SaveManager.instance = new SaveManager();
    }
    return SaveManager.instance;
  }

  public save(state: GameSaveState): boolean {
    try {
      validateSave(state);
      const previous = this.storage.getItem(SAVE_KEY);
      if ((this.knownRaw !== undefined && previous !== this.knownRaw) || (this.knownRaw === undefined && previous !== null)) {
        throw new Error('Progress changed in another tab. Reload before saving.');
      }
      const serialized = JSON.stringify(state);
      this.storage.setItem(SAVE_KEY, serialized);
      this.knownRaw = serialized;
      return true;
    } catch (e) {
      console.error('[SaveManager] Failed to save state:', e);
      return false;
    }
  }

  public load(): GameSaveState | null {
    const raw = this.storage.getItem(SAVE_KEY);
    this.knownRaw = raw;
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GameSaveState;
    if (!parsed || ![1, 2].includes(parsed.version)) throw new Error('Unsupported save version. Your existing save has been kept.');
    if (parsed.version === 1) {
      parsed.version = 2;
      parsed.workshop = newWorkshopState();
    }
    validateSave(parsed);
    return parsed;
  }

  public clear(): void {
    this.storage.removeItem(SAVE_KEY);
    this.knownRaw = null;
  }

  public hasSave(): boolean {
    return this.storage.getItem(SAVE_KEY) !== null;
  }
}

function validateSave(state: GameSaveState): void {
  const whole = (value: unknown, min: number, max: number): value is number =>
    typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
  const finite = (value: unknown, min: number, max: number): value is number =>
    typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
  const identifier = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,150}$/.test(value);
  const array = (value: unknown): value is unknown[] => Array.isArray(value) && value.length <= 10000;
  if (!state || state.version !== 2 || !finite(state.timestamp, 0, Number.MAX_SAFE_INTEGER) || !state.economy ||
    !finite(state.economy.cash, 0, Number.MAX_SAFE_INTEGER) || !finite(state.economy.reputation, 0, 100) ||
    !whole(state.economy.day, 1, Number.MAX_SAFE_INTEGER) || !finite(state.economy.timeMinutes, 0, 1440) ||
    !array(state.stations) || !array(state.facilities) || !array(state.staff) ||
    (state.receptions !== undefined && !array(state.receptions)) || (state.objects !== undefined && !array(state.objects)) ||
    (state.expansionCount !== undefined && !whole(state.expansionCount, 0, 6))) {
    throw new Error('Invalid game save. Your existing save has been kept.');
  }
  for (const result of [state.shift, state.previousShift]) {
    if (result !== undefined && (!result || !whole(result.day, 1, state.economy.day) ||
      !finite(result.waitSeconds, 0, Number.MAX_SAFE_INTEGER) ||
      !finite(result.downtime ?? 0, 0, Number.MAX_SAFE_INTEGER) ||
      [result.wages ?? 0,result.jobs ?? 0,result.served,result.lost,result.waitSamples,result.pc,result.vending,result.arcade].some(v => !whole(v,0,Number.MAX_SAFE_INTEGER)))) throw new Error('Invalid shift totals.');
  }
  if (state.receptionist !== undefined && (!state.receptionist || !finite(state.receptionist.x,-100,100) ||
    !finite(state.receptionist.z,-100,100))) throw new Error('Invalid receptionist position.');
  const ids = new Set<string>();
  const placement = (entry: { id: string; gridX: number; gridZ: number; rotationIndex: number }) => {
    if (!entry || !identifier(entry.id) || ids.has(entry.id) || !finite(entry.gridX, -100, 100) ||
      !finite(entry.gridZ, -100, 100) || !whole(entry.rotationIndex, 0, 3)) throw new Error('Invalid saved placement.');
    ids.add(entry.id);
  };
  for (const station of state.stations) {
    placement(station);
    if (!whole(station.sessionsSinceService ?? 0,0,4)) throw new Error('Invalid PC condition.');
    if ([station.pcLevel, station.chairLevel, station.monitorLevel, station.deskLevel,
      station.keyboardLevel, station.mouseLevel, station.speakerLevel].some((level) => !whole(level, 1, 4))) throw new Error('Invalid saved PC tier.');
  }
  for (const facility of state.facilities) {
    placement(facility);
    if (!whole(facility.salesSinceRefill ?? 0,0,2+2*(facility.level ?? 1)) ||
      !whole(facility.playsSinceService ?? 0,0,3)) throw new Error('Invalid facility condition.');
    if (!['sofa', 'vending', 'arcade'].includes(facility.itemId) || !whole(facility.level ?? 1, 1, 4)) throw new Error('Invalid saved facility.');
  }
  for (const desk of state.receptions ?? []) { placement(desk); if (!whole(desk.level, 1, 4)) throw new Error('Invalid saved reception tier.'); }
  for (const object of state.objects ?? []) { placement(object); if (!identifier(object.itemId)) throw new Error('Invalid saved object.'); }
  const roleIds = new Set<string>();
  for (const role of state.staff) {
    if (!role || roleIds.has(role.id) || !STAFF_ROLES.some(id => id === role.id) ||
      !whole(role.hiredCount, role.id === 'receptionist' ? 1 : 0, role.id === 'receptionist' ? 3 : 2)) throw new Error('Invalid saved staff.');
    roleIds.add(role.id);
  }
  if (state.workforce !== undefined) validateWorkforce(state.workforce, state.staff);
  WorkshopSystem.validate(state.workshop);
  if (state.neighborhood !== undefined) NeighborhoodSystem.validate(state.neighborhood);
  const stationIds = new Set(state.stations.map((station) => station.id));
  if (state.workshop.parts.some((part) => part.stationId !== null && !stationIds.has(part.stationId))) throw new Error('A saved part refers to a missing PC.');
}
