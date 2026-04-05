// ---------------------------------------------------------------------------
// Save / Load system — localStorage persistence with versioning
// ---------------------------------------------------------------------------

const STORAGE_KEY = "survivor_save";
const SAVE_VERSION = 1;

// ---------------------------------------------------------------------------
// Save data types
// ---------------------------------------------------------------------------
export interface RunRecord {
  kills: number;
  timeSurvived: number; // seconds
  level: number;
  weapons: string[]; // weapon type names held at end of run
  goldEarned: number;
  date: number; // Date.now()
}

export interface SaveData {
  version: number;
  gold: number;
  upgrades: string[]; // legacy — kept for migration
  upgradeTiers: Record<string, number>; // upgrade id → tier (0 = not purchased)
  unlockedCharacters: string[]; // character ids
  selectedCharacter: string; // currently selected character id
  runHistory: RunRecord[];
  bestKills: number;
  bestTime: number; // seconds
  bestLevel: number;
  totalRuns: number;
}

function createFreshSave(): SaveData {
  return {
    version: SAVE_VERSION,
    gold: 0,
    upgrades: [],
    upgradeTiers: {},
    unlockedCharacters: ["nova"],
    selectedCharacter: "nova",
    runHistory: [],
    bestKills: 0,
    bestTime: 0,
    bestLevel: 0,
    totalRuns: 0,
  };
}

// ---------------------------------------------------------------------------
// Migration — bump this when save format changes
// ---------------------------------------------------------------------------
function migrate(raw: Record<string, unknown>): SaveData {
  const v = typeof raw.version === "number" ? raw.version : 0;

  // v0 → v1: add missing fields
  if (v < 1) {
    raw.version = 1;
    raw.gold ??= 0;
    raw.upgrades ??= [];
    raw.upgradeTiers ??= {};
    raw.unlockedCharacters ??= ["nova"];
    raw.selectedCharacter ??= "nova";
    raw.runHistory ??= [];
    raw.bestKills ??= 0;
    raw.bestTime ??= 0;
    raw.bestLevel ??= 0;
    raw.totalRuns ??= 0;
  }

  return raw as unknown as SaveData;
}

// ---------------------------------------------------------------------------
// SaveManager
// ---------------------------------------------------------------------------
export class SaveManager {
  private data: SaveData;

  constructor() {
    this.data = this.loadFromStorage();
  }

  /** Current save data (read-only snapshot). */
  get save(): Readonly<SaveData> {
    return this.data;
  }

  /** Record a completed run and persist. */
  recordRun(kills: number, timeSurvived: number, level: number, weapons: string[], goldEarned: number): void {
    const record: RunRecord = {
      kills,
      timeSurvived,
      level,
      weapons,
      goldEarned,
      date: Date.now(),
    };

    this.data.runHistory.push(record);
    // Cap history at 50 entries
    if (this.data.runHistory.length > 50) {
      this.data.runHistory = this.data.runHistory.slice(-50);
    }

    this.data.gold += goldEarned;
    this.data.totalRuns++;
    if (kills > this.data.bestKills) this.data.bestKills = kills;
    if (timeSurvived > this.data.bestTime) this.data.bestTime = timeSurvived;
    if (level > this.data.bestLevel) this.data.bestLevel = level;

    this.persist();
  }

  /** Persist current state to localStorage. */
  persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch {
      // localStorage full or unavailable — silently ignore
    }
  }

  /** Get current tier for a specific upgrade. */
  getUpgradeTier(upgradeId: string): number {
    return this.data.upgradeTiers[upgradeId] ?? 0;
  }

  /** Attempt to purchase an upgrade tier. Returns true if successful. */
  buyUpgrade(upgradeId: string, cost: number): boolean {
    if (this.data.gold < cost) return false;
    this.data.gold -= cost;
    this.data.upgradeTiers[upgradeId] = (this.data.upgradeTiers[upgradeId] ?? 0) + 1;
    this.persist();
    return true;
  }

  /** Check if a character is unlocked. */
  isCharacterUnlocked(charId: string): boolean {
    return this.data.unlockedCharacters.includes(charId);
  }

  /** Attempt to unlock a character. Returns true if successful. */
  unlockCharacter(charId: string, cost: number): boolean {
    if (this.data.unlockedCharacters.includes(charId)) return true;
    if (this.data.gold < cost) return false;
    this.data.gold -= cost;
    this.data.unlockedCharacters.push(charId);
    this.persist();
    return true;
  }

  /** Set the selected character. */
  selectCharacter(charId: string): void {
    this.data.selectedCharacter = charId;
    this.persist();
  }

  /** Reset all save data and clear storage. */
  reset(): void {
    this.data = createFreshSave();
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }

  // ---- internal ----

  private loadFromStorage(): SaveData {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return createFreshSave();
      const parsed = JSON.parse(raw);
      if (typeof parsed !== "object" || parsed === null) return createFreshSave();
      return migrate(parsed);
    } catch {
      // Corrupted data — start fresh
      return createFreshSave();
    }
  }
}
