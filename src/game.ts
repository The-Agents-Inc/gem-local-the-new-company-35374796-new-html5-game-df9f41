import { Application, Container, Text, TextStyle } from "pixi.js";
import { Keyboard } from "./input";
import { Pool } from "./pool";
import { Player, Enemy, Projectile, DamageNumber, XpGem } from "./entities";
import { HUD, RunSummaryScreen, LevelUpScreen, WeaponChoice, UpgradeShopScreen, CharacterSelectScreen, LeaderboardScreen } from "./hud";
import { WeaponManager, WeaponType, WEAPON_COLORS, FlameZone, LightningEffect } from "./weapons";
import { SaveManager } from "./save";
import { goldPerKill, getUpgradeBonus, UpgradeId } from "./upgrades";
import { CharacterId, CHARACTER_DEFS } from "./characters";
import { SpatialHash } from "./spatial";
import { ParticleSystem, ScreenFlash } from "./juice";

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
  private runSummaryScreen: RunSummaryScreen | null = null;
  private levelUpScreen: LevelUpScreen | null = null;
  private upgradeShopScreen: UpgradeShopScreen | null = null;
  private charSelectScreen: CharacterSelectScreen | null = null;
  private leaderboardScreen: LeaderboardScreen | null = null;

  // Persistence
  private saveMgr: SaveManager;

  // State
  private kills = 0;
  private elapsed = 0;
  private spawnTimer = 0;
  private spawnInterval = 1.5; // seconds between spawns, decreases over time
  private gameOver = false;
  private restartQueued = false;
  private paused = false; // true during level-up selection
  private pendingLevelUps = 0; // queued level-ups
  private runGold = 0; // gold accumulated this run
  private waitingForCharSelect = true; // show char select before first run
  private activeCharId: CharacterId = CharacterId.Nova;

  // Passive state — Nova: Adaptive Shield
  private lastDamageTime = 0;
  private shieldHp = 0;
  private shieldActive = false;

  // Spatial hash for broad-phase collision
  private enemyGrid = new SpatialHash<Enemy>(64);
  // Reusable query buffer to avoid per-frame allocations
  private queryBuf: Enemy[] = [];

  // Enemy count cap — prevents late-game runaway
  private readonly MAX_ENEMIES = 300;

  // Monotonic query stamp for spatial hash dedup (avoids Set allocation)
  private queryStamp = 0;

  // Off-screen cull distance squared (entities beyond this are recycled)
  private readonly CULL_DIST_SQ = 1600 * 1600;

  // Juice — particles & screen flash
  private particles!: ParticleSystem;
  private screenFlash!: ScreenFlash;

  // FPS / debug overlay
  private fpsText: Text | null = null;
  private fpsAccum = 0;
  private fpsFrames = 0;
  private fpsDisplay = 0;

  constructor(app: Application) {
    this.app = app;
    this.kb = new Keyboard();
    this.saveMgr = new SaveManager();

    app.stage.addChild(this.world);
    app.stage.addChild(this.hudLayer);

    // Particle system (world-space, rendered above entities)
    this.particles = new ParticleSystem();
    this.world.addChild(this.particles);

    // Screen flash (HUD-space overlay)
    this.screenFlash = new ScreenFlash();
    this.hudLayer.addChild(this.screenFlash);

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
      spawnProjectile: (x, y, vx, vy, damage, _color, weaponType) => {
        const dmgMult = 1 + getUpgradeBonus(this.saveMgr, UpgradeId.WeaponDamage) / 100;
        const p = this.projPool.get();
        p.position.set(x, y);
        p.vx = vx;
        p.vy = vy;
        p.damage = Math.round(damage * dmgMult);
        p.rotation = Math.atan2(vy, vx);
        p.weaponType = weaponType ?? "";
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
        // Lightning chain hit particles — sparks at each hit point (skip first = player)
        for (let i = 1; i < points.length; i++) {
          this.particles.burstSpark(
            points[i].x, points[i].y,
            5 + Math.floor(Math.random() * 3), // 5-7 sparks
            [WEAPON_COLORS[WeaponType.LightningChain], 0xffffff],
            100, 180, 0.2, 2,
          );
        }
      },
      damageEnemy: (enemy, damage) => {
        const dmgMult = 1 + getUpgradeBonus(this.saveMgr, UpgradeId.WeaponDamage) / 100;
        const finalDmg = Math.round(damage * dmgMult);
        enemy.hp -= finalDmg;
        enemy.flashDamage();
        this.spawnDmgNumber(finalDmg, enemy.x, enemy.y - 15);
        if (enemy.hp <= 0) {
          const idx = this.enemies.indexOf(enemy);
          if (idx >= 0) this.killEnemy(idx);
        }
      },
    });
    // HUD
    this.hud = new HUD();
    this.hudLayer.addChild(this.hud);

    // Show character select on startup
    this.showCharacterSelect();

    // Dev-mode FPS overlay (toggle with ` key)
    this.fpsText = new Text({
      text: "",
      style: new TextStyle({ fontFamily: "monospace", fontSize: 12, fill: 0x00ff00 }),
    });
    this.fpsText.position.set(4, this.app.screen.height - 16);
    this.fpsText.visible = false;
    this.hudLayer.addChild(this.fpsText);
    window.addEventListener("keydown", (ev) => {
      if (ev.code === "Backquote" && this.fpsText) {
        this.fpsText.visible = !this.fpsText.visible;
      }
    });
  }

  // Called every frame by app.ticker
  update(ticker: { deltaTime: number }) {
    if (this.waitingForCharSelect) return;
    if (this.restartQueued) {
      this.showCharacterSelect();
      return;
    }
    if (this.gameOver) {
      // Drive summary screen animations
      const dt = ticker.deltaTime / 60;
      if (this.runSummaryScreen) this.runSummaryScreen.updateAnim(dt);
      return;
    }
    if (this.paused) return; // paused during level-up selection

    const dt = Math.min(ticker.deltaTime / 60, 0.05); // cap dt to avoid spiral of death

    this.elapsed += dt;

    this.updatePlayer(dt);
    this.player.updateFlash(dt);
    this.updatePassives(dt);
    this.weaponMgr.update(dt);
    this.updateProjectiles(dt);
    this.updateEnemies(dt);

    // Build spatial hash once per frame for all collision queries
    this.enemyGrid.build(this.enemies);

    this.checkProjectileEnemyCollisions();
    this.checkEnemyPlayerCollisions();
    this.updateXpGems(dt);
    this.updateFlameZones(dt);
    this.updateLightningEffects(dt);
    this.updateDamageNumbers(dt);
    this.particles.update(dt);
    this.screenFlash.update(dt);
    this.updateSpawner(dt);
    this.cullOffScreen();
    this.updateCamera();
    const ownedWeapons = this.weaponMgr.weapons.map(w => ({ type: w.type, level: w.level }));
    this.hud.update(this.player.hp, this.player.maxHp, this.kills, this.elapsed, this.player.level, this.player.xpProgress, this.app.screen.width, this.app.screen.height, ownedWeapons, this.runGold);

    // FPS overlay
    this.fpsAccum += dt;
    this.fpsFrames++;
    if (this.fpsAccum >= 0.5) {
      this.fpsDisplay = Math.round(this.fpsFrames / this.fpsAccum);
      this.fpsFrames = 0;
      this.fpsAccum = 0;
      if (this.fpsText && this.fpsText.visible) {
        this.fpsText.text = `FPS:${this.fpsDisplay} E:${this.enemies.length} P:${this.projectiles.length} G:${this.xpGems.length} FX:${this.particles.activeCount}`;
        this.fpsText.position.y = this.app.screen.height - 16;
      }
    }

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
    // Swap-remove: O(1) instead of splice O(n)
    const last = this.projectiles.length - 1;
    if (index < last) this.projectiles[index] = this.projectiles[last];
    this.projectiles.length = last;
    this.projPool.release(p);
  }

  // ------- Enemy spawner -------
  private updateSpawner(dt: number) {
    // Difficulty ramp: spawn faster over time, cap at 0.3s
    this.spawnInterval = Math.max(0.3, 1.5 - this.elapsed * 0.01);

    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;
    this.spawnTimer = this.spawnInterval;

    // Enforce enemy count cap
    if (this.enemies.length >= this.MAX_ENEMIES) return;

    // Spawn outside visible area
    const screen = this.app.screen;
    const margin = 80;
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.max(screen.width, screen.height) / 2 + margin;

    const enemy = this.enemyPool.get();
    enemy.x = this.player.x + Math.cos(angle) * dist;
    enemy.y = this.player.y + Math.sin(angle) * dist;
    enemy._arrIdx = this.enemies.length;
    this.enemies.push(enemy);
  }

  // ------- Enemy AI: chase player -------
  private updateEnemies(dt: number) {
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (!e.alive) continue;
      const dx = this.player.x - e.x;
      const dy = this.player.y - e.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len > 1) {
        e.x += (dx / len) * e.speed * dt;
        e.y += (dy / len) * e.speed * dt;
      }
      e.contactTimer = Math.max(0, e.contactTimer - dt);
      e.updateFlash(dt);
    }
  }

  // ------- Collision: projectiles ↔ enemies (spatial hash accelerated) -------
  private checkProjectileEnemyCollisions() {
    for (let pi = this.projectiles.length - 1; pi >= 0; pi--) {
      const p = this.projectiles[pi];
      // Query only nearby enemies via spatial hash
      this.queryStamp++;
      this.enemyGrid.query(p.x, p.y, p.radius + 12, this.queryBuf);
      for (let qi = 0; qi < this.queryBuf.length; qi++) {
        const e = this.queryBuf[qi];
        if (!e.alive || e._queryStamp === this.queryStamp) continue;
        e._queryStamp = this.queryStamp;
        if (circleHit(p.x, p.y, p.radius, e.x, e.y, e.radius)) {
          e.hp -= p.damage;
          e.flashDamage();
          this.spawnDmgNumber(p.damage, e.x, e.y - 15);
          this.spawnWeaponHitParticles(p.weaponType, e.x, e.y, p.vx, p.vy);

          this.killProjectile(pi);

          if (e.hp <= 0 && e._arrIdx >= 0) {
            this.killEnemy(e._arrIdx, p.vx, p.vy);
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
        const armorReduction = 1 - getUpgradeBonus(this.saveMgr, UpgradeId.Armor) / 100;
        let incomingDmg = Math.max(1, Math.round(e.damage * armorReduction));

        // Nova passive: Adaptive Shield absorbs damage
        if (this.shieldActive && this.shieldHp > 0) {
          const absorbed = Math.min(this.shieldHp, incomingDmg);
          this.shieldHp -= absorbed;
          incomingDmg -= absorbed;
          if (this.shieldHp <= 0) {
            this.shieldActive = false;
            this.shieldHp = 0;
          }
        }

        if (incomingDmg > 0) {
          this.player.hp -= incomingDmg;
        }
        this.lastDamageTime = this.elapsed;
        this.player.invulnTimer = 0.3;
        this.player.drawHpBar();
        this.player.flashDamage();
        e.contactTimer = e.contactCooldown;
        this.spawnDmgNumber(e.damage, this.player.x, this.player.y - 20);

        // Aegis passive: Thorns — reflect damage back to enemy
        if (this.activeCharId === CharacterId.Aegis) {
          const armorTier = this.saveMgr.getUpgradeTier(UpgradeId.Armor);
          const thornsDmg = 15 + armorTier * 5;
          e.hp -= thornsDmg;
          e.flashDamage();
          this.spawnDmgNumber(thornsDmg, e.x, e.y - 15);
          if (e.hp <= 0 && e._arrIdx >= 0) {
            this.killEnemy(e._arrIdx);
          }
        }

        break; // one hit per frame
      }
    }
  }

  private killEnemy(index: number, projVx = 0, projVy = 0) {
    const e = this.enemies[index];
    // Enemy death burst — 10-14 red particles with 30% directional inheritance
    const inheritVx = projVx * 0.3;
    const inheritVy = projVy * 0.3;
    this.particles.burstRadial(
      e.x, e.y,
      10 + Math.floor(Math.random() * 5),
      0xff4466,
      80, 160, 0.4, 3,
      inheritVx, inheritVy,
    );
    // Drop XP gem at enemy position
    this.spawnXpGem(e.x, e.y);
    e.alive = false;
    e.visible = false;
    e._arrIdx = -1;
    // Swap-remove: O(1) instead of splice O(n)
    const last = this.enemies.length - 1;
    if (index < last) {
      this.enemies[index] = this.enemies[last];
      this.enemies[index]._arrIdx = index;
    }
    this.enemies.length = last;
    this.enemyPool.release(e);
    this.kills++;
    this.runGold += goldPerKill(this.elapsed);
  }

  // ------- Per-weapon hit particles -------
  private spawnWeaponHitParticles(weaponType: string, x: number, y: number, vx: number, vy: number) {
    switch (weaponType) {
      case WeaponType.PlasmaBolt:
        // 6-8 yellow radial burst
        this.particles.burstRadial(x, y, 6 + Math.floor(Math.random() * 3), WEAPON_COLORS[WeaponType.PlasmaBolt], 80, 140, 0.3, 3);
        break;
      case WeaponType.ScatterShot: {
        // 3-4 cyan cone forward per pellet
        const angle = Math.atan2(vy, vx);
        this.particles.burstCone(x, y, 3 + Math.floor(Math.random() * 2), WEAPON_COLORS[WeaponType.ScatterShot], angle, 0.6, 60, 100, 0.25, 2);
        break;
      }
      default:
        // Fallback: small white burst
        this.particles.burstRadial(x, y, 3, 0xffffff, 40, 80, 0.2, 2);
        break;
    }
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
          // XP gem magnet trail — 3-5 green particles trailing toward player
          if (Math.random() < 0.3) {
            this.particles.trail(g.x, g.y, this.player.x, this.player.y, 1, 0x44ff88, 200, 0.25, 2);
          }
        }
      }

      // Collect if very close
      if (d2 < 20 * 20) {
        const xpMultiplier = 1 + getUpgradeBonus(this.saveMgr, UpgradeId.XpGain) / 100;
        const levelsGained = this.player.addXp(Math.round(g.xpValue * xpMultiplier));
        if (levelsGained > 0) {
          this.pendingLevelUps += levelsGained;
          // Level-up ring — 20-30 particles in circle outward, white→yellow
          this.particles.burstRing(
            this.player.x, this.player.y,
            20 + Math.floor(Math.random() * 11),
            0xffee55, 200, 300, 0.5, 3,
          );
          // Screen flash — white, 0.15s
          this.screenFlash.flash(0xffffff, 0.3, 0.15, this.app.screen.width, this.app.screen.height);
          this.showLevelUpScreen();
        }
        g.alive = false;
        g.visible = false;
        // Swap-remove: O(1)
        const lastGem = this.xpGems.length - 1;
        if (i < lastGem) this.xpGems[i] = this.xpGems[lastGem];
        this.xpGems.length = lastGem;
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

      // Damage enemies on tick (spatial hash accelerated)
      if (f.tickTimer <= 0) {
        f.tickTimer = f.tickInterval;
        this.queryStamp++;
        this.enemyGrid.query(f.x, f.y, f.radius + 12, this.queryBuf);
        for (let qi = 0; qi < this.queryBuf.length; qi++) {
          const e = this.queryBuf[qi];
          if (!e.alive || e._queryStamp === this.queryStamp) continue;
          e._queryStamp = this.queryStamp;
          if (circleHit(f.x, f.y, f.radius, e.x, e.y, e.radius)) {
            e.hp -= f.damage;
            e.flashDamage();
            this.spawnDmgNumber(f.damage, e.x, e.y - 15);
            if (e.hp <= 0 && e._arrIdx >= 0) {
              this.killEnemy(e._arrIdx);
            }
          }
        }
      }

      if (f.lifetime >= f.maxLifetime) {
        f.alive = false;
        f.visible = false;
        // Swap-remove: O(1) instead of splice O(n)
        const lastF = this.flameZones.length - 1;
        if (i < lastF) this.flameZones[i] = this.flameZones[lastF];
        this.flameZones.length = lastF;
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
        // Swap-remove: O(1)
        const lastL = this.lightningEffects.length - 1;
        if (i < lastL) this.lightningEffects[i] = this.lightningEffects[lastL];
        this.lightningEffects.length = lastL;
        this.lightningPool.release(l);
      }
    }
  }

  // ------- Damage numbers -------
  private spawnDmgNumber(dmg: number, x: number, y: number) {
    const d = this.dmgPool.get();
    // Random X spread (±15px) to prevent stacking
    const spreadX = (Math.random() - 0.5) * 30;
    d.init(dmg, x + spreadX, y);
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
        // Swap-remove: O(1)
        const lastD = this.dmgNumbers.length - 1;
        if (i < lastD) this.dmgNumbers[i] = this.dmgNumbers[lastD];
        this.dmgNumbers.length = lastD;
        this.dmgPool.release(d);
      }
    }
  }

  // ------- Off-screen culling — recycle entities too far from player -------
  private cullOffScreen() {
    const px = this.player.x;
    const py = this.player.y;
    // Cull enemies
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      const dx = e.x - px;
      const dy = e.y - py;
      if (dx * dx + dy * dy > this.CULL_DIST_SQ) {
        e.alive = false;
        e.visible = false;
        e._arrIdx = -1;
        const last = this.enemies.length - 1;
        if (i < last) {
          this.enemies[i] = this.enemies[last];
          this.enemies[i]._arrIdx = i;
        }
        this.enemies.length = last;
        this.enemyPool.release(e);
      }
    }
    // Cull XP gems
    for (let i = this.xpGems.length - 1; i >= 0; i--) {
      const g = this.xpGems[i];
      const dx = g.x - px;
      const dy = g.y - py;
      if (dx * dx + dy * dy > this.CULL_DIST_SQ) {
        g.alive = false;
        g.visible = false;
        const last = this.xpGems.length - 1;
        if (i < last) this.xpGems[i] = this.xpGems[last];
        this.xpGems.length = last;
        this.gemPool.release(g);
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

    // Save run to persistent storage
    const weaponNames = this.weaponMgr.weapons.map(w => w.type as string);
    const isNewHighScore = this.saveMgr.recordRun(this.kills, this.elapsed, this.player.level, weaponNames, this.runGold, this.activeCharId);
    const score = Math.round(this.kills * (this.elapsed / 60));

    const save = this.saveMgr.save;
    const ownedWeapons = this.weaponMgr.weapons.map(w => ({ type: w.type, level: w.level }));
    this.runSummaryScreen = new RunSummaryScreen(
      {
        kills: this.kills,
        elapsed: this.elapsed,
        level: this.player.level,
        weapons: ownedWeapons,
        goldEarned: this.runGold,
        totalGold: save.gold,
        score,
        isNewHighScore,
      },
      this.app.screen.width,
      this.app.screen.height,
      () => this.openUpgradeShop(),
      () => { this.restartQueued = true; },
    );
    this.hudLayer.addChild(this.runSummaryScreen);
  }

  /** Clear all save data (for settings / debug). */
  resetSave() {
    this.saveMgr.reset();
  }

  private openUpgradeShop() {
    if (this.upgradeShopScreen) return;
    // Hide summary screen while shop is open
    if (this.runSummaryScreen) this.runSummaryScreen.visible = false;
    this.upgradeShopScreen = new UpgradeShopScreen(
      this.saveMgr,
      this.app.screen.width,
      this.app.screen.height,
      () => this.closeUpgradeShop(),
    );
    this.hudLayer.addChild(this.upgradeShopScreen);
  }

  private closeUpgradeShop() {
    if (this.upgradeShopScreen) {
      this.hudLayer.removeChild(this.upgradeShopScreen);
      this.upgradeShopScreen.destroy({ children: true });
      this.upgradeShopScreen = null;
    }
    if (this.runSummaryScreen) this.runSummaryScreen.visible = true;
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

    // Clear particles
    this.particles.clearAll();

    // Reset weapons and re-add default
    this.weaponMgr.reset();
    this.weaponMgr.addWeapon(WeaponType.PlasmaBolt);

    // Reset player with upgrade bonuses applied
    const baseHp = 100;
    const baseSpeed = 200;
    const basePickup = 60;

    this.player.maxHp = baseHp + getUpgradeBonus(this.saveMgr, UpgradeId.MaxHealth);
    this.player.hp = this.player.maxHp;
    this.player.invulnTimer = 0;
    this.player.speed = baseSpeed * (1 + getUpgradeBonus(this.saveMgr, UpgradeId.MoveSpeed) / 100);
    this.player.pickupRadius = basePickup * (1 + getUpgradeBonus(this.saveMgr, UpgradeId.PickupRadius) / 100);
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
    this.runGold = 0;

    // Remove overlays
    if (this.levelUpScreen) {
      this.hudLayer.removeChild(this.levelUpScreen);
      this.levelUpScreen.destroy({ children: true });
      this.levelUpScreen = null;
    }
    if (this.runSummaryScreen) {
      this.hudLayer.removeChild(this.runSummaryScreen);
      this.runSummaryScreen.destroy({ children: true });
      this.runSummaryScreen = null;
    }
    if (this.upgradeShopScreen) {
      this.hudLayer.removeChild(this.upgradeShopScreen);
      this.upgradeShopScreen.destroy({ children: true });
      this.upgradeShopScreen = null;
    }
    if (this.leaderboardScreen) {
      this.hudLayer.removeChild(this.leaderboardScreen);
      this.leaderboardScreen.destroy({ children: true });
      this.leaderboardScreen = null;
    }
  }

  // ------- Character Select (main menu) -------
  private showCharacterSelect() {
    this.waitingForCharSelect = true;
    this.restart();

    this.charSelectScreen = new CharacterSelectScreen(
      this.saveMgr,
      this.app.screen.width,
      this.app.screen.height,
      (charId: CharacterId) => this.onCharacterSelected(charId),
      () => this.showLeaderboard(),
    );
    this.hudLayer.addChild(this.charSelectScreen);
  }

  private onCharacterSelected(charId: CharacterId) {
    this.activeCharId = charId;
    const charDef = CHARACTER_DEFS[charId];

    // Apply character stats
    this.player.maxHp = charDef.baseHp + getUpgradeBonus(this.saveMgr, UpgradeId.MaxHealth);
    this.player.hp = this.player.maxHp;
    this.player.speed = charDef.baseSpeed * (1 + getUpgradeBonus(this.saveMgr, UpgradeId.MoveSpeed) / 100);
    this.player.drawHpBar();

    // Set starting weapon
    this.weaponMgr.reset();
    this.weaponMgr.addWeapon(charDef.startingWeapon);

    // Reset passives
    this.lastDamageTime = 0;
    this.shieldHp = 0;
    this.shieldActive = false;

    // Close char select
    if (this.charSelectScreen) {
      this.hudLayer.removeChild(this.charSelectScreen);
      this.charSelectScreen.destroy({ children: true });
      this.charSelectScreen = null;
    }
    this.waitingForCharSelect = false;
  }

  // ------- Passives -------
  private updatePassives(_dt: number) {
    // Nova: Adaptive Shield — after 4s without damage, gain shield = 10% maxHp
    if (this.activeCharId === CharacterId.Nova) {
      const timeSinceDmg = this.elapsed - this.lastDamageTime;
      if (timeSinceDmg >= 4 && !this.shieldActive) {
        this.shieldActive = true;
        this.shieldHp = Math.round(this.player.maxHp * 0.1);
      }
    }

    // Kira: Adrenaline — below 50% HP: +25% dmg/+20% speed; below 25%: doubled
    if (this.activeCharId === CharacterId.Kira) {
      const hpRatio = this.player.hp / this.player.maxHp;
      const charDef = CHARACTER_DEFS[CharacterId.Kira];
      const baseSpeed = charDef.baseSpeed * (1 + getUpgradeBonus(this.saveMgr, UpgradeId.MoveSpeed) / 100);
      if (hpRatio <= 0.25) {
        this.player.speed = baseSpeed * 1.4;
      } else if (hpRatio <= 0.5) {
        this.player.speed = baseSpeed * 1.2;
      } else {
        this.player.speed = baseSpeed;
      }
    }

    // Aegis: Thorns — handled in checkEnemyPlayerCollisions
  }

  // ------- Leaderboard -------
  private showLeaderboard() {
    if (this.leaderboardScreen) return;
    if (this.charSelectScreen) this.charSelectScreen.visible = false;
    this.leaderboardScreen = new LeaderboardScreen(
      this.saveMgr,
      this.app.screen.width,
      this.app.screen.height,
      () => this.closeLeaderboard(),
    );
    this.hudLayer.addChild(this.leaderboardScreen);
  }

  private closeLeaderboard() {
    if (this.leaderboardScreen) {
      this.hudLayer.removeChild(this.leaderboardScreen);
      this.leaderboardScreen.destroy({ children: true });
      this.leaderboardScreen = null;
    }
    if (this.charSelectScreen) this.charSelectScreen.visible = true;
  }
}
