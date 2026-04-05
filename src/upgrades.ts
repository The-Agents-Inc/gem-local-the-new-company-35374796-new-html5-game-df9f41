// ---------------------------------------------------------------------------
// Persistent Upgrade System — meta-progression between runs
// ---------------------------------------------------------------------------
import { SaveManager } from "./save";

export enum UpgradeId {
  MaxHealth = "maxHealth",
  MoveSpeed = "moveSpeed",
  XpGain = "xpGain",
  PickupRadius = "pickupRadius",
  WeaponDamage = "weaponDamage",
  Armor = "armor",
}

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  description: string;
  maxTier: number;
  costs: number[];        // gold cost per tier (length = maxTier)
  values: number[];       // stat bonus per tier (cumulative)
  unit: string;           // display unit e.g. "%" or "HP"
  color: number;
}

export const UPGRADE_DEFS: Record<UpgradeId, UpgradeDef> = {
  [UpgradeId.MaxHealth]: {
    id: UpgradeId.MaxHealth,
    name: "Max Health",
    description: "Increase starting HP",
    maxTier: 5,
    costs: [50, 100, 200, 400, 800],
    values: [20, 40, 60, 100, 150],
    unit: "HP",
    color: 0xff4466,
  },
  [UpgradeId.MoveSpeed]: {
    id: UpgradeId.MoveSpeed,
    name: "Move Speed",
    description: "Move faster",
    maxTier: 5,
    costs: [40, 80, 160, 320, 640],
    values: [10, 25, 40, 60, 80],
    unit: "%",
    color: 0x55ccff,
  },
  [UpgradeId.XpGain]: {
    id: UpgradeId.XpGain,
    name: "XP Gain",
    description: "Earn more XP per gem",
    maxTier: 5,
    costs: [60, 120, 240, 480, 960],
    values: [15, 30, 50, 75, 100],
    unit: "%",
    color: 0x55ffaa,
  },
  [UpgradeId.PickupRadius]: {
    id: UpgradeId.PickupRadius,
    name: "Pickup Radius",
    description: "Collect gems from farther",
    maxTier: 5,
    costs: [30, 60, 120, 240, 480],
    values: [15, 30, 50, 75, 100],
    unit: "%",
    color: 0xffcc33,
  },
  [UpgradeId.WeaponDamage]: {
    id: UpgradeId.WeaponDamage,
    name: "Weapon Damage",
    description: "All weapons deal more damage",
    maxTier: 5,
    costs: [80, 160, 320, 640, 1200],
    values: [10, 20, 35, 50, 75],
    unit: "%",
    color: 0xff8833,
  },
  [UpgradeId.Armor]: {
    id: UpgradeId.Armor,
    name: "Armor",
    description: "Reduce incoming damage",
    maxTier: 5,
    costs: [60, 120, 240, 480, 960],
    values: [5, 10, 18, 25, 35],
    unit: "%",
    color: 0x8888ff,
  },
};

export const ALL_UPGRADES = Object.values(UPGRADE_DEFS);

/** Get bonus value for an upgrade at a given tier. 0 if tier is 0. */
export function getUpgradeBonus(saveMgr: SaveManager, id: UpgradeId): number {
  const tier = saveMgr.getUpgradeTier(id);
  if (tier <= 0) return 0;
  return UPGRADE_DEFS[id].values[tier - 1];
}

/** Check if player can afford next tier. */
export function canAffordUpgrade(saveMgr: SaveManager, id: UpgradeId): boolean {
  const tier = saveMgr.getUpgradeTier(id);
  const def = UPGRADE_DEFS[id];
  if (tier >= def.maxTier) return false;
  return saveMgr.save.gold >= def.costs[tier];
}

/** Purchase next tier. Returns true on success. */
export function purchaseUpgrade(saveMgr: SaveManager, id: UpgradeId): boolean {
  const tier = saveMgr.getUpgradeTier(id);
  const def = UPGRADE_DEFS[id];
  if (tier >= def.maxTier) return false;
  return saveMgr.buyUpgrade(id, def.costs[tier]);
}

/** Gold earned per kill — scales with elapsed time. */
export function goldPerKill(elapsedSeconds: number): number {
  return 1 + Math.floor(elapsedSeconds / 30);
}
