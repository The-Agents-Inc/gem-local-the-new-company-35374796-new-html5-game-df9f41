import { Container, Graphics } from "pixi.js";
import { Pool } from "./pool";
import { Enemy, Projectile } from "./entities";

// ---------------------------------------------------------------------------
// Weapon types
// ---------------------------------------------------------------------------
export enum WeaponType {
  PlasmaBolt = "PlasmaBolt",
  ScatterShot = "ScatterShot",
  OrbitalShield = "OrbitalShield",
  LightningChain = "LightningChain",
  FlameTrail = "FlameTrail",
}

export const WEAPON_NAMES: Record<WeaponType, string> = {
  [WeaponType.PlasmaBolt]: "Plasma Bolt",
  [WeaponType.ScatterShot]: "Scatter Shot",
  [WeaponType.OrbitalShield]: "Orbital Shield",
  [WeaponType.LightningChain]: "Lightning Chain",
  [WeaponType.FlameTrail]: "Flame Trail",
};

export const WEAPON_COLORS: Record<WeaponType, number> = {
  [WeaponType.PlasmaBolt]: 0xffee55,
  [WeaponType.ScatterShot]: 0x55ccff,
  [WeaponType.OrbitalShield]: 0x88ff88,
  [WeaponType.LightningChain]: 0xcc88ff,
  [WeaponType.FlameTrail]: 0xff8833,
};

export interface WeaponStats {
  damage: number;
  cooldown: number; // seconds
  range: number; // px
  projectileCount: number;
  projectileSpeed: number;
  extra: Record<string, number>; // weapon-specific params
}

// ---------------------------------------------------------------------------
// Stats per weapon per level (index 0 = level 1, etc.)
// ---------------------------------------------------------------------------
export const WEAPON_DEFS: Record<WeaponType, WeaponStats[]> = {
  [WeaponType.PlasmaBolt]: [
    { damage: 12, cooldown: 0.35, range: 500, projectileCount: 1, projectileSpeed: 450, extra: {} },
    { damage: 18, cooldown: 0.30, range: 550, projectileCount: 1, projectileSpeed: 500, extra: {} },
    { damage: 25, cooldown: 0.25, range: 600, projectileCount: 2, projectileSpeed: 550, extra: {} },
  ],
  [WeaponType.ScatterShot]: [
    { damage: 8, cooldown: 0.6, range: 400, projectileCount: 3, projectileSpeed: 380, extra: { spread: 0.4 } },
    { damage: 10, cooldown: 0.5, range: 450, projectileCount: 4, projectileSpeed: 400, extra: { spread: 0.5 } },
    { damage: 13, cooldown: 0.4, range: 500, projectileCount: 5, projectileSpeed: 420, extra: { spread: 0.6 } },
  ],
  [WeaponType.OrbitalShield]: [
    { damage: 8, cooldown: 0, range: 60, projectileCount: 3, projectileSpeed: 3, extra: { orbRadius: 60 } },
    { damage: 12, cooldown: 0, range: 70, projectileCount: 4, projectileSpeed: 3.5, extra: { orbRadius: 70 } },
    { damage: 18, cooldown: 0, range: 80, projectileCount: 5, projectileSpeed: 4, extra: { orbRadius: 80 } },
  ],
  [WeaponType.LightningChain]: [
    { damage: 15, cooldown: 1.0, range: 350, projectileCount: 1, projectileSpeed: 0, extra: { chains: 2, chainRange: 150 } },
    { damage: 20, cooldown: 0.8, range: 400, projectileCount: 1, projectileSpeed: 0, extra: { chains: 3, chainRange: 180 } },
    { damage: 28, cooldown: 0.6, range: 450, projectileCount: 1, projectileSpeed: 0, extra: { chains: 4, chainRange: 200 } },
  ],
  [WeaponType.FlameTrail]: [
    { damage: 5, cooldown: 0.3, range: 0, projectileCount: 1, projectileSpeed: 0, extra: { zoneRadius: 16, zoneDuration: 2.0 } },
    { damage: 8, cooldown: 0.25, range: 0, projectileCount: 1, projectileSpeed: 0, extra: { zoneRadius: 20, zoneDuration: 2.5 } },
    { damage: 12, cooldown: 0.2, range: 0, projectileCount: 1, projectileSpeed: 0, extra: { zoneRadius: 25, zoneDuration: 3.0 } },
  ],
};

// ---------------------------------------------------------------------------
// Weapon instance (player holds these)
// ---------------------------------------------------------------------------
export class WeaponInstance {
  type: WeaponType;
  level: number; // 0-based
  cooldownTimer = 0;

  constructor(type: WeaponType, level = 0) {
    this.type = type;
    this.level = level;
  }

  get stats(): WeaponStats {
    return WEAPON_DEFS[this.type][this.level];
  }

  get maxLevel(): number {
    return WEAPON_DEFS[this.type].length - 1;
  }
}

// ---------------------------------------------------------------------------
// Orbital orb entity
// ---------------------------------------------------------------------------
export class OrbitalOrb extends Container {
  angle = 0;
  damage = 8;
  radius = 8;
  orbRadius = 60;
  rotSpeed = 3; // rad/s
  hitCooldowns = new Map<Enemy, number>();
  private body: Graphics;

  constructor() {
    super();
    this.body = new Graphics().circle(0, 0, this.radius).fill({ color: WEAPON_COLORS[WeaponType.OrbitalShield] });
    this.addChild(this.body);
  }

  configure(angle: number, damage: number, orbRadius: number, rotSpeed: number) {
    this.angle = angle;
    this.damage = damage;
    this.orbRadius = orbRadius;
    this.rotSpeed = rotSpeed;
    this.hitCooldowns.clear();
    this.visible = true;
  }
}

// ---------------------------------------------------------------------------
// Flame zone entity
// ---------------------------------------------------------------------------
export class FlameZone extends Container {
  damage = 5;
  radius = 16;
  lifetime = 0;
  maxLifetime = 2.0;
  alive = true;
  tickTimer = 0;
  readonly tickInterval = 0.3; // damage tick rate
  private body: Graphics;

  constructor() {
    super();
    this.body = new Graphics();
    this.addChild(this.body);
  }

  configure(x: number, y: number, damage: number, radius: number, duration: number) {
    this.position.set(x, y);
    this.damage = damage;
    this.radius = radius;
    this.maxLifetime = duration;
    this.lifetime = 0;
    this.alive = true;
    this.visible = true;
    this.tickTimer = 0;
    this.alpha = 1;
    this.body.clear().circle(0, 0, this.radius).fill({ color: WEAPON_COLORS[WeaponType.FlameTrail], alpha: 0.6 });
  }
}

// ---------------------------------------------------------------------------
// Lightning visual effect
// ---------------------------------------------------------------------------
export class LightningEffect extends Container {
  lifetime = 0;
  readonly maxLifetime = 0.25;
  alive = true;
  private gfx: Graphics;

  constructor() {
    super();
    this.gfx = new Graphics();
    this.addChild(this.gfx);
  }

  drawChain(points: { x: number; y: number }[]) {
    this.lifetime = 0;
    this.alive = true;
    this.visible = true;
    this.alpha = 1;
    this.gfx.clear();
    if (points.length < 2) return;
    this.gfx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      // Jagged lightning segments
      const prev = points[i - 1];
      const cur = points[i];
      const mx = (prev.x + cur.x) / 2 + (Math.random() - 0.5) * 30;
      const my = (prev.y + cur.y) / 2 + (Math.random() - 0.5) * 30;
      this.gfx.lineTo(mx, my).lineTo(cur.x, cur.y);
    }
    this.gfx.stroke({ width: 3, color: WEAPON_COLORS[WeaponType.LightningChain], alpha: 0.9 });
    // Bright core
    this.gfx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      this.gfx.lineTo(points[i].x, points[i].y);
    }
    this.gfx.stroke({ width: 1, color: 0xffffff, alpha: 0.8 });
  }
}

// ---------------------------------------------------------------------------
// Weapon manager — handles firing logic for all active weapons
// ---------------------------------------------------------------------------
export interface WeaponManagerDeps {
  getPlayerPos: () => { x: number; y: number };
  getEnemies: () => Enemy[];
  spawnProjectile: (x: number, y: number, vx: number, vy: number, damage: number, color: number, piercing?: boolean) => void;
  spawnFlameZone: (x: number, y: number, damage: number, radius: number, duration: number) => void;
  spawnLightning: (points: { x: number; y: number }[]) => void;
  damageEnemy: (enemy: Enemy, damage: number) => void;
}

export class WeaponManager {
  weapons: WeaponInstance[] = [];
  orbs: OrbitalOrb[] = [];
  private orbPool: Pool<OrbitalOrb>;
  private world: Container;
  private deps: WeaponManagerDeps;

  constructor(world: Container, deps: WeaponManagerDeps) {
    this.world = world;
    this.deps = deps;
    this.orbPool = new Pool(
      () => {
        const o = new OrbitalOrb();
        world.addChild(o);
        return o;
      },
      () => {},
    );
  }

  addWeapon(type: WeaponType): WeaponInstance {
    // Check if already owned — upgrade instead
    const existing = this.weapons.find((w) => w.type === type);
    if (existing) {
      if (existing.level < existing.maxLevel) {
        existing.level++;
      }
      if (type === WeaponType.OrbitalShield) this.rebuildOrbs();
      return existing;
    }
    const inst = new WeaponInstance(type);
    this.weapons.push(inst);
    if (type === WeaponType.OrbitalShield) this.rebuildOrbs();
    return inst;
  }

  private rebuildOrbs() {
    // Remove existing orbs
    for (const orb of this.orbs) {
      orb.visible = false;
      this.orbPool.release(orb);
    }
    this.orbs.length = 0;

    const shield = this.weapons.find((w) => w.type === WeaponType.OrbitalShield);
    if (!shield) return;

    const stats = shield.stats;
    for (let i = 0; i < stats.projectileCount; i++) {
      const orb = this.orbPool.get();
      const angle = (i / stats.projectileCount) * Math.PI * 2;
      orb.configure(angle, stats.damage, stats.extra.orbRadius, stats.projectileSpeed);
      this.orbs.push(orb);
    }
  }

  update(dt: number) {
    const pos = this.deps.getPlayerPos();
    const enemies = this.deps.getEnemies();

    for (const weapon of this.weapons) {
      weapon.cooldownTimer -= dt;
      if (weapon.cooldownTimer > 0) continue;

      const stats = weapon.stats;

      switch (weapon.type) {
        case WeaponType.PlasmaBolt:
          this.firePlasmaBolt(weapon, pos, enemies);
          break;
        case WeaponType.ScatterShot:
          this.fireScatterShot(weapon, pos, enemies);
          break;
        case WeaponType.OrbitalShield:
          // Orbs are continuous, no cooldown-based firing
          break;
        case WeaponType.LightningChain:
          this.fireLightningChain(weapon, pos, enemies);
          break;
        case WeaponType.FlameTrail:
          this.fireFlameTrail(weapon, pos);
          break;
      }
    }

    // Update orbital orbs position
    this.updateOrbs(dt, pos, enemies);
  }

  private findNearest(pos: { x: number; y: number }, enemies: Enemy[], range: number, exclude?: Set<Enemy>): Enemy | null {
    let nearest: Enemy | null = null;
    let nearestDist = range * range;
    for (const e of enemies) {
      if (!e.alive) continue;
      if (exclude && exclude.has(e)) continue;
      const dx = pos.x - e.x;
      const dy = pos.y - e.y;
      const d = dx * dx + dy * dy;
      if (d < nearestDist) {
        nearestDist = d;
        nearest = e;
      }
    }
    return nearest;
  }

  private firePlasmaBolt(weapon: WeaponInstance, pos: { x: number; y: number }, enemies: Enemy[]) {
    const stats = weapon.stats;
    const target = this.findNearest(pos, enemies, stats.range);
    if (!target) return;

    weapon.cooldownTimer = stats.cooldown;
    const color = WEAPON_COLORS[WeaponType.PlasmaBolt];

    for (let i = 0; i < stats.projectileCount; i++) {
      const angle = Math.atan2(target.y - pos.y, target.x - pos.x);
      // At level 3 (projectileCount=2), slight offset
      const offset = stats.projectileCount > 1 ? (i - (stats.projectileCount - 1) / 2) * 0.15 : 0;
      const a = angle + offset;
      this.deps.spawnProjectile(
        pos.x, pos.y,
        Math.cos(a) * stats.projectileSpeed,
        Math.sin(a) * stats.projectileSpeed,
        stats.damage, color,
      );
    }
  }

  private fireScatterShot(weapon: WeaponInstance, pos: { x: number; y: number }, enemies: Enemy[]) {
    const stats = weapon.stats;
    const target = this.findNearest(pos, enemies, stats.range);
    if (!target) return;

    weapon.cooldownTimer = stats.cooldown;
    const baseAngle = Math.atan2(target.y - pos.y, target.x - pos.x);
    const spread = stats.extra.spread;
    const color = WEAPON_COLORS[WeaponType.ScatterShot];

    for (let i = 0; i < stats.projectileCount; i++) {
      const t = stats.projectileCount > 1 ? i / (stats.projectileCount - 1) - 0.5 : 0;
      const a = baseAngle + t * spread * 2;
      this.deps.spawnProjectile(
        pos.x, pos.y,
        Math.cos(a) * stats.projectileSpeed,
        Math.sin(a) * stats.projectileSpeed,
        stats.damage, color,
      );
    }
  }

  private fireLightningChain(weapon: WeaponInstance, pos: { x: number; y: number }, enemies: Enemy[]) {
    const stats = weapon.stats;
    const target = this.findNearest(pos, enemies, stats.range);
    if (!target) return;

    weapon.cooldownTimer = stats.cooldown;
    const chainCount = stats.extra.chains;
    const chainRange = stats.extra.chainRange;
    const hit = new Set<Enemy>();
    const points: { x: number; y: number }[] = [{ x: pos.x, y: pos.y }];

    let current = target;
    for (let i = 0; i <= chainCount && current; i++) {
      hit.add(current);
      points.push({ x: current.x, y: current.y });
      this.deps.damageEnemy(current, stats.damage);
      // Find next chain target
      current = this.findNearest({ x: current.x, y: current.y }, enemies, chainRange, hit)!;
    }

    this.deps.spawnLightning(points);
  }

  private fireFlameTrail(weapon: WeaponInstance, pos: { x: number; y: number }) {
    const stats = weapon.stats;
    weapon.cooldownTimer = stats.cooldown;
    this.deps.spawnFlameZone(
      pos.x, pos.y,
      stats.damage,
      stats.extra.zoneRadius,
      stats.extra.zoneDuration,
    );
  }

  private updateOrbs(dt: number, pos: { x: number; y: number }, enemies: Enemy[]) {
    for (const orb of this.orbs) {
      orb.angle += orb.rotSpeed * dt;
      orb.x = pos.x + Math.cos(orb.angle) * orb.orbRadius;
      orb.y = pos.y + Math.sin(orb.angle) * orb.orbRadius;

      // Reduce hit cooldowns
      for (const [enemy, t] of orb.hitCooldowns) {
        const next = t - dt;
        if (next <= 0) orb.hitCooldowns.delete(enemy);
        else orb.hitCooldowns.set(enemy, next);
      }

      // Check hits
      for (const e of enemies) {
        if (!e.alive) continue;
        if (orb.hitCooldowns.has(e)) continue;
        const dx = orb.x - e.x;
        const dy = orb.y - e.y;
        if (dx * dx + dy * dy < (orb.radius + e.radius) * (orb.radius + e.radius)) {
          this.deps.damageEnemy(e, orb.damage);
          orb.hitCooldowns.set(e, 0.5);
        }
      }
    }
  }

  reset() {
    this.weapons.length = 0;
    for (const orb of this.orbs) {
      orb.visible = false;
      this.orbPool.release(orb);
    }
    this.orbs.length = 0;
  }

  /** Get level-up options: 3 random choices (new weapon or upgrade existing) */
  getLevelUpChoices(count = 3): { type: WeaponType; level: number; isNew: boolean }[] {
    const allTypes = Object.values(WeaponType) as WeaponType[];
    const options: { type: WeaponType; level: number; isNew: boolean }[] = [];

    // Weapons that can be upgraded
    for (const w of this.weapons) {
      if (w.level < w.maxLevel) {
        options.push({ type: w.type, level: w.level + 1, isNew: false });
      }
    }

    // Weapons not yet acquired
    const owned = new Set(this.weapons.map((w) => w.type));
    for (const t of allTypes) {
      if (!owned.has(t)) {
        options.push({ type: t, level: 0, isNew: true });
      }
    }

    // Shuffle and pick
    for (let i = options.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [options[i], options[j]] = [options[j], options[i]];
    }
    return options.slice(0, count);
  }
}
