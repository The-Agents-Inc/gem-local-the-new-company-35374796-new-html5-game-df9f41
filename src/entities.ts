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
export class Player extends Container implements HasHealth {
  hp: number;
  maxHp: number;
  invulnTimer = 0;

  readonly speed = 200; // px/s
  readonly radius = 14;
  readonly attackCooldown = 0.35; // seconds between shots
  attackTimer = 0;

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
    setTimeout(() => {
      this.body.tint = 0xffffff;
    }, 100);
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
    this.speed = 60 + Math.random() * 40;
    this.body.tint = 0xffffff;
  }

  flashDamage() {
    this.body.tint = 0xffffff;
    setTimeout(() => {
      if (this.alive) this.body.tint = 0xffffff;
    }, 80);
    this.body.tint = 0xffff00;
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
  readonly damage = 12;
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
}

// ---------------------------------------------------------------------------
// Damage number (floating text substitute — uses Graphics for zero-asset M0)
// ---------------------------------------------------------------------------
export class DamageNumber extends Container {
  lifetime = 0;
  readonly maxLife = 0.6;
  vy = -60;
  alive = true;

  constructor() {
    super();
  }

  init(dmg: number, x: number, y: number) {
    this.position.set(x, y);
    this.lifetime = 0;
    this.alive = true;
    this.visible = true;
    this.alpha = 1;

    // Draw number as small circles for digit representation (simple approach)
    this.removeChildren();
    const txt = new Graphics();
    // Simple pip for each 10 damage
    const pips = Math.max(1, Math.round(dmg / 5));
    for (let i = 0; i < pips; i++) {
      txt.circle(i * 5 - (pips * 5) / 2, 0, 2).fill({ color: 0xffee55 });
    }
    this.addChild(txt);
  }
}
