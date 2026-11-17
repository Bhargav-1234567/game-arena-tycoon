export interface SavedStationData {
  id: string;
  gridX: number;
  gridZ: number;
  rotationIndex: number;
  pcLevel: number;
  chairLevel: number;
  monitorLevel: number;
  deskLevel: number;
  keyboardLevel: number;
  mouseLevel: number;
  speakerLevel: number;
}

export interface SavedFacilityData {
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

export interface GameSaveState {
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
}

const SAVE_KEY = 'gaming_zone_tycoon_save_v1';

export class SaveManager {
  private static instance: SaveManager;

  private constructor() {}

  public static getInstance(): SaveManager {
    if (!SaveManager.instance) {
      SaveManager.instance = new SaveManager();
    }
    return SaveManager.instance;
  }

  public save(state: GameSaveState): boolean {
    try {
      const serialized = JSON.stringify(state);
      localStorage.setItem(SAVE_KEY, serialized);
      return true;
    } catch (e) {
      console.error('[SaveManager] Failed to save state:', e);
      return false;
    }
  }

  public load(): GameSaveState | null {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as GameSaveState;
      if (parsed && parsed.version) {
        return parsed;
      }
      return null;
    } catch (e) {
      console.warn('[SaveManager] Corrupted save data, ignoring:', e);
      return null;
    }
  }

  public clear(): void {
    localStorage.removeItem(SAVE_KEY);
  }

  public hasSave(): boolean {
    return localStorage.getItem(SAVE_KEY) !== null;
  }
}
