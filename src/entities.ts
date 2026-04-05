import { Container, Graphics } from "pixi.js";

// ---------------------------------------------------------------------------
// Shared health component
// ---------------------------------------------------------------------------
export interface HasHealth {
  hp: number;
  maxHp: number;
  invulnTimer: number;
}

// ---------------------------------------------------------------------------
// Player
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// XP level curve: XP needed to reach level N (1-indexed, level 1 = 0 XP)
// ---------------------------------------------------------------------------
export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  // Quadratic curve: each level requires progressively more XP
  return Math.floor(10 * (level - 1) * (level - 1) + 10 * (level - 1));
}

export class Player extends Container implements HasHealth {
  hp: number;
  maxHp: number;
  invulnTimer = 0;

  speed = 200; // px/s (mutable for upgrades)
  readonly radius = 14;
  attackCooldown = 0.35; // seconds between shots (mutable for upgrades)
  attackTimer = 0;
  projectileDamage = 12; // base projectile damage (mutable for upgrades)
  projectileCount = 1; // number of projectiles per shot (mutable for upgrades)
  pickupRadius = 60; // magnet range for XP gems (mutable for upgrades)

  // XP / Level
  xp = 0;
  level = 1;

  // Tick-based flash (replaces setTimeout)
  flashTimer = 0;

  private body: Graphics;
  private hpBar: Graphics;

  constructor() {
    super();
    this.maxHp = 100;
    this.hp = this.maxHp;

    // Simple triangle ship pointing right
    this.body = new Graphics()
      .poly([
        { x: 18, y: 0 },
        { x: -10, y: -12 },
        { x: -6, y: 0 },
        { x: -10, y: 12 },
      ])
      .fill({ color: 0x00ffcc });
    this.addChild(this.body);

    // HP bar above player
    this.hpBar = new Graphics();
    this.addChild(this.hpBar);
    this.drawHpBar();
  }

  drawHpBar() {
    const w = 30;
    const h = 4;
    const frac = Math.max(0, this.hp / this.maxHp);
    this.hpBar
      .clear()
      .rect(-w / 2, -24, w, h)
      .fill({ color: 0x333333 })
      .rect(-w / 2, -24, w * frac, h)
      .fill({ color: frac > 0.3 ? 0x00ff66 : 0xff3333 });
  }

  flashDamage() {
    this.body.tint = 0xff0000;
    this.flashTimer = 0.1;
  }

  updateFlash(dt: number) {
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) {
        this.body.tint = 0xffffff;
      }
    }
  }

  /** Returns number of levels gained */
  addXp(amount: number): number {
    this.xp += amount;
    let levelsGained = 0;
    while (this.xp >= xpForLevel(this.level + 1)) {
      this.level++;
      levelsGained++;
    }
    return levelsGained;
  }

  get xpProgress(): number {
    const currentLevelXp = xpForLevel(this.level);
    const nextLevelXp = xpForLevel(this.level + 1);
    return (this.xp - currentLevelXp) / (nextLevelXp - currentLevelXp);
  }
}

// ---------------------------------------------------------------------------
// Enemy
// ---------------------------------------------------------------------------
export class Enemy extends Container implements HasHealth {
  hp: number;
  maxHp: number;
  invulnTimer = 0;

  speed = 60 + Math.random() * 40; // px/s
  readonly radius = 12;
  readonly damage = 10; // per contact tick
  readonly contactCooldown = 0.5; // seconds between contact damage
  contactTimer = 0;
  alive = true;

  /** Index in Game.enemies[] — maintained by swap-remove for O(1) kills. */
  _arrIdx = -1;
  /** Frame stamp for spatial hash dedup — avoids double-processing per query. */
  _queryStamp = -1;

  // Tick-based flash (replaces setTimeout)
  flashTimer = 0;

  private body: Graphics;

  constructor() {
    super();
    this.maxHp = 30;
    this.hp = this.maxHp;

    this.body = new Graphics().circle(0, 0, this.radius).fill({ color: 0xff4466 });
    this.addChild(this.body);
  }

  resetEnemy() {
    this.hp = this.maxHp;
    this.alive = true;
    this.visible = true;
    this.alpha = 1;
    this.contactTimer = 0;
    this.flashTimer = 0;
    this.speed = 60 + Math.random() * 40;
    this.body.tint = 0xffffff;
  }

  flashDamage() {
    this.body.tint = 0xffff00;
    this.flashTimer = 0.08;
  }

  updateFlash(dt: number) {
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) {
        this.body.tint = 0xffffff;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Projectile
// ---------------------------------------------------------------------------
export class Projectile extends Container {
  vx = 0;
  vy = 0;
  readonly speed = 450; // px/s
  readonly radius = 4;
  damage = 12;
  alive = true;
  lifetime = 0;
  readonly maxLifetime = 1.5; // seconds

  private body: Graphics;

  constructor() {
    super();
    this.body = new Graphics().circle(0, 0, this.radius).fill({ color: 0xffee55 });
    this.addChild(this.body);
  }

  resetProjectile() {
    this.alive = true;
    this.visible = true;
    this.lifetime = 0;
  }

  configure(damage: number, color: number) {
    this.damage = damage;
    this.body.clear().circle(0, 0, this.radius).fill({ color });
  }
}

// ---------------------------------------------------------------------------
// XP Gem — dropped by enemies, collected by player
// ---------------------------------------------------------------------------
export class XpGem extends Container {
  readonly radius = 6;
  readonly xpValue = 5;
  alive = true;
  // Slight scatter velocity on spawn
  vx = 0;
  vy = 0;
  friction = 4; // deceleration multiplier

  private body: Graphics;

  constructor() {
    super();
    // Diamond shape in green/cyan
    this.body = new Graphics()
      .poly([
        { x: 0, y: -7 },
        { x: 5, y: 0 },
        { x: 0, y: 7 },
        { x: -5, y: 0 },
      ])
      .fill({ color: 0x55ffaa });
    this.addChild(this.body);
  }

  resetGem() {
    this.alive = true;
    this.visible = true;
    this.alpha = 1;
    this.vx = 0;
    this.vy = 0;
  }
}

// ---------------------------------------------------------------------------
// Damage number (floating text substitute — uses Graphics for zero-asset M0)
// ---------------------------------------------------------------------------
export class DamageNumber extends Container {
  lifetime = 0;
  readonly maxLife = 0.6;
  vy = -60;
  alive = true;

  private gfx: Graphics;

  constructor() {
    super();
    this.gfx = new Graphics();
    this.addChild(this.gfx);
  }

  init(dmg: number, x: number, y: number) {
    this.position.set(x, y);
    this.lifetime = 0;
    this.alive = true;
    this.visible = true;
    this.alpha = 1;

    // Redraw pips on the single reusable Graphics (no removeChildren / new Graphics)
    this.gfx.clear();
    const pips = Math.max(1, Math.round(dmg / 5));
    for (let i = 0; i < pips; i++) {
      this.gfx.circle(i * 5 - (pips * 5) / 2, 0, 2).fill({ color: 0xffee55 });
    }
  }
}
