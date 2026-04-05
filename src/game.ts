import { Application, Container } from "pixi.js";
import { Keyboard } from "./input";
import { Pool } from "./pool";
import { Player, Enemy, Projectile, DamageNumber } from "./entities";
import { HUD, GameOverScreen } from "./hud";

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

  // Pools
  private enemyPool: Pool<Enemy>;
  private projPool: Pool<Projectile>;
  private dmgPool: Pool<DamageNumber>;

  // HUD
  private hud: HUD;
  private gameOverScreen: GameOverScreen | null = null;

  // State
  private kills = 0;
  private elapsed = 0;
  private spawnTimer = 0;
  private spawnInterval = 1.5; // seconds between spawns, decreases over time
  private gameOver = false;
  private restartQueued = false;

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

    const dt = ticker.deltaTime / 60; // convert frame-delta to seconds

    this.elapsed += dt;

    this.updatePlayer(dt);
    this.updateAutoAttack(dt);
    this.updateProjectiles(dt);
    this.updateEnemies(dt);
    this.checkProjectileEnemyCollisions();
    this.checkEnemyPlayerCollisions();
    this.updateDamageNumbers(dt);
    this.updateSpawner(dt);
    this.updateCamera();
    this.hud.update(this.player.hp, this.player.maxHp, this.kills, this.elapsed);

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

  // ------- Auto-attack: fire at nearest enemy -------
  private updateAutoAttack(dt: number) {
    this.player.attackTimer -= dt;
    if (this.player.attackTimer > 0) return;

    // Find nearest enemy
    let nearest: Enemy | null = null;
    let nearestDist = Infinity;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const d = dist2(this.player.x, this.player.y, e.x, e.y);
      if (d < nearestDist) {
        nearestDist = d;
        nearest = e;
      }
    }

    // Only fire if an enemy exists within range (500px)
    if (!nearest || nearestDist > 500 * 500) return;

    this.player.attackTimer = this.player.attackCooldown;

    const proj = this.projPool.get();
    proj.position.set(this.player.x, this.player.y);
    const angle = Math.atan2(
      nearest.y - this.player.y,
      nearest.x - this.player.x,
    );
    proj.vx = Math.cos(angle) * proj.speed;
    proj.vy = Math.sin(angle) * proj.speed;
    proj.rotation = angle;
    this.projectiles.push(proj);
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
    e.alive = false;
    e.visible = false;
    this.enemies.splice(index, 1);
    this.enemyPool.release(e);
    this.kills++;
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

    // Reset player
    this.player.hp = this.player.maxHp;
    this.player.invulnTimer = 0;
    this.player.attackTimer = 0;
    this.player.alpha = 1;
    this.player.position.set(0, 0);
    this.player.drawHpBar();

    // Reset state
    this.kills = 0;
    this.elapsed = 0;
    this.spawnTimer = 0;
    this.gameOver = false;
    this.restartQueued = false;

    // Remove game over screen
    if (this.gameOverScreen) {
      this.hudLayer.removeChild(this.gameOverScreen);
      this.gameOverScreen.destroy({ children: true });
      this.gameOverScreen = null;
    }
  }
}
