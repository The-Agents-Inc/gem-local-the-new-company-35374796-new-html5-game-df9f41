// ---------------------------------------------------------------------------
// Character Roster — Nova, Kira, Aegis
// ---------------------------------------------------------------------------
import { WeaponType } from "./weapons";

export enum CharacterId {
  Nova = "nova",
  Kira = "kira",
  Aegis = "aegis",
}

export interface CharacterDef {
  id: CharacterId;
  name: string;
  title: string;
  color: number;
  startingWeapon: WeaponType;
  baseHp: number;
  baseSpeed: number;
  passiveName: string;
  passiveDesc: string;
  unlockCost: number; // 0 = free
}

export const CHARACTER_DEFS: Record<CharacterId, CharacterDef> = {
  [CharacterId.Nova]: {
    id: CharacterId.Nova,
    name: "NOVA",
    title: "Balanced recruit. Good at everything, master of nothing.",
    color: 0x00ffcc,
    startingWeapon: WeaponType.PlasmaBolt,
    baseHp: 100,
    baseSpeed: 200,
    passiveName: "Adaptive Shield",
    passiveDesc: "After 4s without damage, gain a shield equal to 10% max HP.",
    unlockCost: 0,
  },
  [CharacterId.Kira]: {
    id: CharacterId.Kira,
    name: "KIRA",
    title: "Glass cannon. High risk, high reward.",
    color: 0xff4466,
    startingWeapon: WeaponType.ScatterShot,
    baseHp: 70,
    baseSpeed: 230,
    passiveName: "Adrenaline",
    passiveDesc: "Below 50% HP: +25% DMG, +20% speed. Below 25%: doubled.",
    unlockCost: 1500,
  },
  [CharacterId.Aegis]: {
    id: CharacterId.Aegis,
    name: "AEGIS",
    title: "The fortress. Slow and steady wins the war.",
    color: 0x8888ff,
    startingWeapon: WeaponType.OrbitalShield,
    baseHp: 140,
    baseSpeed: 170,
    passiveName: "Thorns",
    passiveDesc: "Enemies that deal contact damage take 15 reflected damage.",
    unlockCost: 2500,
  },
};

export const ALL_CHARACTERS = Object.values(CHARACTER_DEFS);
