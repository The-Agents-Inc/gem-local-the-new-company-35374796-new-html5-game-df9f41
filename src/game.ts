import { Application, Container } from "pixi.js";
import { Keyboard } from "./input";
import { Pool } from "./pool";
import { Player, Enemy, Projectile, DamageNumber, XpGem } from "./entities";
import { HUD, GameOverScreen, LevelUpScreen, WeaponChoice } from "./hud";
import { WeaponManager, WeaponType, FlameZone, LightningEffect } from "./weapons";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function dist2(ax: number, ay: number, bx: number, by: number) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

function circleHit(
  ax: number,
  ay: number,
  ar: number,
  bx: number,
  by: number,
  br: number,
) {
  return dist2(ax, ay, bx, by) < (ar + br) * (ar + br);
}

// ---------------------------------------------------------------------------
// Game
// ---------------------------------------------------------------------------
export class Game {
  private app: Application;
  private kb: Keyboard;

  // Layers
  private world = new Container({ isRenderGroup: true });
  private hudLayer = new Container();

  // Entities
  private player: Player;
  private enemies: Enemy[] = [];
  private projectiles: Projectile[] = [];
  private dmgNumbers: DamageNumber[] = [];
  private xpGems: XpGem[] = [];

  // Pools
  private enemyPool: Pool<Enemy>;
  private projPool: Pool<Projectile>;
  private dmgPool: Pool<DamageNumber>;
  private gemPool: Pool<XpGem>;

  // Weapons
  private weaponMgr!: WeaponManager;
  private flameZones: FlameZone[] = [];
  private lightningEffects: LightningEffect[] = [];
  private flamePool!: Pool<FlameZone>;
  private lightningPool!: Pool<LightningEffect>;

  // HUD
  private hud: HUD;
  private gameOverScreen: GameOverScreen | null = null;
  private levelUpScreen: LevelUpScreen | null = null;

  // State
  private kills = 0;
  private elapsed = 0;
  private spawnTimer = 0;
  private spawnInterval = 1.5; // seconds between spawns, decreases over time
  private gameOver = false;
  private restartQueued = false;
  private paused = false; // true during level-up selection
  private pendingLevelUps = 0; // queued level-ups

  constructor(app: Application) {
    this.app = app;
    this.kb = new Keyboard();

    app.stage.addChild(this.world);
    app.stage.addChild(this.hudLayer);

    // Player
    this.player = new Player();
    this.world.addChild(this.player);

    // Pools
    this.enemyPool = new Pool(
      () => {
        const e = new Enemy();
        this.world.addChild(e);
        return e;
      },
      (e) => e.resetEnemy(),
    );

    this.projPool = new Pool(
      () => {
        const p = new Projectile();
        this.world.addChild(p);
        return p;
      },
      (p) => p.resetProjectile(),
    );

    this.dmgPool = new Pool(
      () => {
        const d = new DamageNumber();
        this.world.addChild(d);
        return d;
      },
      (_d) => {},
    );

    this.gemPool = new Pool(
      () => {
        const g = new XpGem();
        this.world.addChild(g);
        return g;
      },
      (g) => g.resetGem(),
    );

    // Extra entity pools
    this.flamePool = new Pool(
      () => { const f = new FlameZone(); this.world.addChild(f); return f; },
      () => {},
    );
    this.lightningPool = new Pool(
      () => { const l = new LightningEffect(); this.world.addChild(l); return l; },
      () => {},
    );

    // Weapon manager
    this.weaponMgr = new WeaponManager(this.world, {
      getPlayerPos: () => ({ x: this.player.x, y: this.player.y }),
      getEnemies: () => this.enemies,
      spawnProjectile: (x, y, vx, vy, damage, _color) => {
        const p = this.projPool.get();
        p.position.set(x, y);
        p.vx = vx;
        p.vy = vy;
        p.damage = damage;
        p.rotation = Math.atan2(vy, vx);
        this.projectiles.push(p);
      },
      spawnFlameZone: (x, y, damage, radius, duration) => {
        const f = this.flamePool.get();
        f.configure(x, y, damage, radius, duration);
        this.flameZones.push(f);
      },
      spawnLightning: (points) => {
        const l = this.lightningPool.get();
        l.drawChain(points);
        this.lightningEffects.push(l);
      },
      damageEnemy: (enemy, damage) => {
        enemy.hp -= damage;
        enemy.flashDamage();
        this.spawnDmgNumber(damage, enemy.x, enemy.y - 15);
        if (enemy.hp <= 0) {
          const idx = this.enemies.indexOf(enemy);
          if (idx >= 0) this.killEnemy(idx);
        }
      },
    });
    // Start with PlasmaBolt as default weapon
    this.weaponMgr.addWeapon(WeaponType.PlasmaBolt);

    // HUD
    this.hud = new HUD();
    this.hudLayer.addChild(this.hud);

    // Restart listeners
    window.addEventListener("keydown", (e) => {
      if (this.gameOver && e.code === "Space") this.restartQueued = true;
    });
    app.stage.eventMode = "static";
    app.stage.hitArea = app.screen;
    app.stage.on("pointerdown", () => {
      if (this.gameOver) this.restartQueued = true;
    });
  }

  // Called every frame by app.ticker
  update(ticker: { deltaTime: number }) {
    if (this.restartQueued) {
      this.restart();
      return;
    }
    if (this.gameOver) return;
    if (this.paused) return; // paused during level-up selection

    const dt = ticker.deltaTime / 60; // convert frame-delta to seconds

    this.elapsed += dt;

    this.updatePlayer(dt);
    this.weaponMgr.update(dt);
    this.updateProjectiles(dt);
    this.updateEnemies(dt);
    this.checkProjectileEnemyCollisions();
    this.checkEnemyPlayerCollisions();
    this.updateXpGems(dt);
    this.updateFlameZones(dt);
    this.updateLightningEffects(dt);
    this.updateDamageNumbers(dt);
    this.updateSpawner(dt);
    this.updateCamera();
    const ownedWeapons = this.weaponMgr.weapons.map(w => ({ type: w.type, level: w.level }));
    this.hud.update(this.player.hp, this.player.maxHp, this.kills, this.elapsed, this.player.level, this.player.xpProgress, this.app.screen.width, this.app.screen.height, ownedWeapons);

    if (this.player.hp <= 0) {
      this.triggerGameOver();
    }
  }

  // ------- Player movement -------
  private updatePlayer(dt: number) {
    let dx = 0;
    let dy = 0;
    if (this.kb.isDown("KeyW") || this.kb.isDown("ArrowUp")) dy -= 1;
    if (this.kb.isDown("KeyS") || this.kb.isDown("ArrowDown")) dy += 1;
    if (this.kb.isDown("KeyA") || this.kb.isDown("ArrowLeft")) dx -= 1;
    if (this.kb.isDown("KeyD") || this.kb.isDown("ArrowRight")) dx += 1;

    // Normalize diagonal
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len > 0) {
      dx /= len;
      dy /= len;
    }

    this.player.x += dx * this.player.speed * dt;
    this.player.y += dy * this.player.speed * dt;

    // Face movement direction
    if (len > 0) {
      this.player.rotation = Math.atan2(dy, dx);
    }

    // Invulnerability timer
    if (this.player.invulnTimer > 0) {
      this.player.invulnTimer -= dt;
      this.player.alpha = Math.sin(this.elapsed * 30) > 0 ? 0.4 : 1;
    } else {
      this.player.alpha = 1;
    }
  }

  // ------- Projectile update -------
  private updateProjectiles(dt: number) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.lifetime += dt;

      if (p.lifetime >= p.maxLifetime) {
        this.killProjectile(i);
      }
    }
  }

  private killProjectile(index: number) {
    const p = this.projectiles[index];
    p.alive = false;
    p.visible = false;
    this.projectiles.splice(index, 1);
    this.projPool.release(p);
  }

  // ------- Enemy spawner -------
  private updateSpawner(dt: number) {
    // Difficulty ramp: spawn faster over time, cap at 0.3s
    this.spawnInterval = Math.max(0.3, 1.5 - this.elapsed * 0.01);

    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;
    this.spawnTimer = this.spawnInterval;

    // Spawn outside visible area
    const screen = this.app.screen;
    const margin = 80;
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.max(screen.width, screen.height) / 2 + margin;

    const enemy = this.enemyPool.get();
    enemy.x = this.player.x + Math.cos(angle) * dist;
    enemy.y = this.player.y + Math.sin(angle) * dist;
    this.enemies.push(enemy);
  }

  // ------- Enemy AI: chase player -------
  private updateEnemies(dt: number) {
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const dx = this.player.x - e.x;
      const dy = this.player.y - e.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len > 1) {
        e.x += (dx / len) * e.speed * dt;
        e.y += (dy / len) * e.speed * dt;
      }
      e.contactTimer = Math.max(0, e.contactTimer - dt);
    }
  }

  // ------- Collision: projectiles ↔ enemies -------
  private checkProjectileEnemyCollisions() {
    for (let pi = this.projectiles.length - 1; pi >= 0; pi--) {
      const p = this.projectiles[pi];
      for (let ei = this.enemies.length - 1; ei >= 0; ei--) {
        const e = this.enemies[ei];
        if (!e.alive) continue;
        if (circleHit(p.x, p.y, p.radius, e.x, e.y, e.radius)) {
          e.hp -= p.damage;
          e.flashDamage();
          this.spawnDmgNumber(p.damage, e.x, e.y - 15);

          this.killProjectile(pi);

          if (e.hp <= 0) {
            this.killEnemy(ei);
          }
          break; // projectile used up
        }
      }
    }
  }

  // ------- Collision: enemies ↔ player -------
  private checkEnemyPlayerCollisions() {
    if (this.player.invulnTimer > 0) return;

    for (const e of this.enemies) {
      if (!e.alive || e.contactTimer > 0) continue;
      if (
        circleHit(
          this.player.x,
          this.player.y,
          this.player.radius,
          e.x,
          e.y,
          e.radius,
        )
      ) {
        this.player.hp -= e.damage;
        this.player.invulnTimer = 0.3;
        this.player.drawHpBar();
        this.player.flashDamage();
        e.contactTimer = e.contactCooldown;
        this.spawnDmgNumber(e.damage, this.player.x, this.player.y - 20);
        break; // one hit per frame
      }
    }
  }

  private killEnemy(index: number) {
    const e = this.enemies[index];
    // Drop XP gem at enemy position
    this.spawnXpGem(e.x, e.y);
    e.alive = false;
    e.visible = false;
    this.enemies.splice(index, 1);
    this.enemyPool.release(e);
    this.kills++;
  }

  // ------- XP Gems -------
  private spawnXpGem(x: number, y: number) {
    const gem = this.gemPool.get();
    gem.position.set(x, y);
    // Small random scatter
    const angle = Math.random() * Math.PI * 2;
    const force = 30 + Math.random() * 50;
    gem.vx = Math.cos(angle) * force;
    gem.vy = Math.sin(angle) * force;
    this.xpGems.push(gem);
  }

  private updateXpGems(dt: number) {
    const pr2 = this.player.pickupRadius * this.player.pickupRadius;

    for (let i = this.xpGems.length - 1; i >= 0; i--) {
      const g = this.xpGems[i];

      // Apply scatter velocity with friction
      if (Math.abs(g.vx) > 0.5 || Math.abs(g.vy) > 0.5) {
        g.x += g.vx * dt;
        g.y += g.vy * dt;
        g.vx *= Math.max(0, 1 - g.friction * dt);
        g.vy *= Math.max(0, 1 - g.friction * dt);
      }

      // Check if within pickup radius — magnet pull
      const dx = this.player.x - g.x;
      const dy = this.player.y - g.y;
      const d2 = dx * dx + dy * dy;

      if (d2 < pr2) {
        // Pull toward player
        const len = Math.sqrt(d2);
        if (len > 1) {
          const pullSpeed = 350;
          g.x += (dx / len) * pullSpeed * dt;
          g.y += (dy / len) * pullSpeed * dt;
        }
      }

      // Collect if very close
      if (d2 < 20 * 20) {
        const levelsGained = this.player.addXp(g.xpValue);
        if (levelsGained > 0) {
          this.pendingLevelUps += levelsGained;
          this.showLevelUpScreen();
        }
        g.alive = false;
        g.visible = false;
        this.xpGems.splice(i, 1);
        this.gemPool.release(g);
      }
    }
  }

  // ------- Level Up -------
  private showLevelUpScreen() {
    if (this.levelUpScreen || this.pendingLevelUps <= 0) return;
    this.paused = true;
    const choices = this.weaponMgr.getLevelUpChoices(3);
    this.levelUpScreen = new LevelUpScreen(
      choices,
      this.app.screen.width,
      this.app.screen.height,
      (chosen: WeaponChoice) => this.onWeaponChosen(chosen),
    );
    this.hudLayer.addChild(this.levelUpScreen);
  }

  private onWeaponChosen(choice: WeaponChoice) {
    this.weaponMgr.addWeapon(choice.type);
    // Clean up screen
    if (this.levelUpScreen) {
      this.hudLayer.removeChild(this.levelUpScreen);
      this.levelUpScreen.destroy({ children: true });
      this.levelUpScreen = null;
    }
    this.pendingLevelUps--;
    if (this.pendingLevelUps > 0) {
      this.showLevelUpScreen();
    } else {
      this.paused = false;
    }
  }

  // ------- Flame Zones -------
  private updateFlameZones(dt: number) {
    for (let i = this.flameZones.length - 1; i >= 0; i--) {
      const f = this.flameZones[i];
      f.lifetime += dt;
      f.alpha = 1 - f.lifetime / f.maxLifetime * 0.5;
      f.tickTimer -= dt;

      // Damage enemies on tick
      if (f.tickTimer <= 0) {
        f.tickTimer = f.tickInterval;
        for (const e of this.enemies) {
          if (!e.alive) continue;
          if (circleHit(f.x, f.y, f.radius, e.x, e.y, e.radius)) {
            e.hp -= f.damage;
            e.flashDamage();
            this.spawnDmgNumber(f.damage, e.x, e.y - 15);
            if (e.hp <= 0) {
              const idx = this.enemies.indexOf(e);
              if (idx >= 0) this.killEnemy(idx);
            }
          }
        }
      }

      if (f.lifetime >= f.maxLifetime) {
        f.alive = false;
        f.visible = false;
        this.flameZones.splice(i, 1);
        this.flamePool.release(f);
      }
    }
  }

  // ------- Lightning Effects -------
  private updateLightningEffects(dt: number) {
    for (let i = this.lightningEffects.length - 1; i >= 0; i--) {
      const l = this.lightningEffects[i];
      l.lifetime += dt;
      l.alpha = 1 - l.lifetime / l.maxLifetime;
      if (l.lifetime >= l.maxLifetime) {
        l.alive = false;
        l.visible = false;
        this.lightningEffects.splice(i, 1);
        this.lightningPool.release(l);
      }
    }
  }

  // ------- Damage numbers -------
  private spawnDmgNumber(dmg: number, x: number, y: number) {
    const d = this.dmgPool.get();
    d.init(dmg, x, y);
    this.dmgNumbers.push(d);
  }

  private updateDamageNumbers(dt: number) {
    for (let i = this.dmgNumbers.length - 1; i >= 0; i--) {
      const d = this.dmgNumbers[i];
      d.lifetime += dt;
      d.y += d.vy * dt;
      d.alpha = 1 - d.lifetime / d.maxLife;

      if (d.lifetime >= d.maxLife) {
        d.alive = false;
        d.visible = false;
        this.dmgNumbers.splice(i, 1);
        this.dmgPool.release(d);
      }
    }
  }

  // ------- Camera -------
  private updateCamera() {
    const screen = this.app.screen;
    this.world.x = -this.player.x + screen.width / 2;
    this.world.y = -this.player.y + screen.height / 2;
  }

  // ------- Game Over -------
  private triggerGameOver() {
    this.gameOver = true;
    this.gameOverScreen = new GameOverScreen(this.kills, this.elapsed);
    // Position at screen center (hudLayer is in screen space)
    this.gameOverScreen.position.set(
      this.app.screen.width / 2,
      this.app.screen.height / 2,
    );
    this.hudLayer.addChild(this.gameOverScreen);
  }

  // ------- Restart -------
  private restart() {
    // Clean up all entities
    for (const e of this.enemies) {
      e.visible = false;
      this.enemyPool.release(e);
    }
    this.enemies.length = 0;

    for (const p of this.projectiles) {
      p.visible = false;
      this.projPool.release(p);
    }
    this.projectiles.length = 0;

    for (const d of this.dmgNumbers) {
      d.visible = false;
      this.dmgPool.release(d);
    }
    this.dmgNumbers.length = 0;

    for (const g of this.xpGems) {
      g.visible = false;
      this.gemPool.release(g);
    }
    this.xpGems.length = 0;

    for (const f of this.flameZones) {
      f.visible = false;
      this.flamePool.release(f);
    }
    this.flameZones.length = 0;

    for (const l of this.lightningEffects) {
      l.visible = false;
      this.lightningPool.release(l);
    }
    this.lightningEffects.length = 0;

    // Reset weapons and re-add default
    this.weaponMgr.reset();
    this.weaponMgr.addWeapon(WeaponType.PlasmaBolt);

    // Reset player
    this.player.maxHp = 100;
    this.player.hp = this.player.maxHp;
    this.player.invulnTimer = 0;
    this.player.pickupRadius = 60;
    this.player.xp = 0;
    this.player.level = 1;
    this.player.alpha = 1;
    this.player.position.set(0, 0);
    this.player.drawHpBar();

    // Reset state
    this.kills = 0;
    this.elapsed = 0;
    this.spawnTimer = 0;
    this.gameOver = false;
    this.restartQueued = false;
    this.paused = false;
    this.pendingLevelUps = 0;

    // Remove overlays
    if (this.levelUpScreen) {
      this.hudLayer.removeChild(this.levelUpScreen);
      this.levelUpScreen.destroy({ children: true });
      this.levelUpScreen = null;
    }
    if (this.gameOverScreen) {
      this.hudLayer.removeChild(this.gameOverScreen);
      this.gameOverScreen.destroy({ children: true });
      this.gameOverScreen = null;
    }
  }
}
