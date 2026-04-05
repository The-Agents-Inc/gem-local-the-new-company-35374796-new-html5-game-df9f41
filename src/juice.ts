import { Container, Graphics } from "pixi.js";

// ---------------------------------------------------------------------------
// Particle
// ---------------------------------------------------------------------------
export class Particle {
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  life = 0;
  maxLife = 0.3;
  size = 3;
  color = 0xffffff;
  alpha = 1;
  active = false;

  reset() {
    this.active = false;
    this.life = 0;
    this.alpha = 1;
  }
}

// ---------------------------------------------------------------------------
// ParticleSystem — lightweight pooled emitter rendered via a single Graphics
// ---------------------------------------------------------------------------
const MAX_PARTICLES = 200;

export class ParticleSystem extends Container {
  private particles: Particle[] = [];
  private pool: Particle[] = [];
  private gfx: Graphics;

  constructor() {
    super();
    this.gfx = new Graphics();
    this.addChild(this.gfx);

    // Pre-allocate the full budget
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.pool.push(new Particle());
    }
  }

  private acquire(): Particle | null {
    if (this.pool.length === 0) return null;
    const p = this.pool.pop()!;
    p.reset();
    p.active = true;
    this.particles.push(p);
    return p;
  }

  private release(index: number) {
    const p = this.particles[index];
    p.active = false;
    // Swap-remove
    const last = this.particles.length - 1;
    if (index < last) this.particles[index] = this.particles[last];
    this.particles.length = last;
    this.pool.push(p);
  }

  get activeCount(): number {
    return this.particles.length;
  }

  // ------- Emit patterns -------

  /** Radial burst — particles fly outward in all directions */
  burstRadial(
    x: number, y: number,
    count: number,
    color: number,
    speedMin: number, speedMax: number,
    lifetime: number,
    size = 3,
    inheritVx = 0, inheritVy = 0,
  ) {
    for (let i = 0; i < count; i++) {
      const p = this.acquire();
      if (!p) break;
      const angle = Math.random() * Math.PI * 2;
      const speed = speedMin + Math.random() * (speedMax - speedMin);
      p.x = x;
      p.y = y;
      p.vx = Math.cos(angle) * speed + inheritVx;
      p.vy = Math.sin(angle) * speed + inheritVy;
      p.color = color;
      p.maxLife = lifetime;
      p.size = size;
    }
  }

  /** Cone burst — particles fly in a cone around a base angle */
  burstCone(
    x: number, y: number,
    count: number,
    color: number,
    baseAngle: number,
    spread: number,
    speedMin: number, speedMax: number,
    lifetime: number,
    size = 3,
  ) {
    for (let i = 0; i < count; i++) {
      const p = this.acquire();
      if (!p) break;
      const angle = baseAngle + (Math.random() - 0.5) * spread;
      const speed = speedMin + Math.random() * (speedMax - speedMin);
      p.x = x;
      p.y = y;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;
      p.color = color;
      p.maxLife = lifetime;
      p.size = size;
    }
  }

  /** Ring burst — particles expand outward from a perfect circle */
  burstRing(
    x: number, y: number,
    count: number,
    color: number,
    speedMin: number, speedMax: number,
    lifetime: number,
    size = 3,
  ) {
    for (let i = 0; i < count; i++) {
      const p = this.acquire();
      if (!p) break;
      const angle = (i / count) * Math.PI * 2;
      const speed = speedMin + Math.random() * (speedMax - speedMin);
      p.x = x;
      p.y = y;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;
      p.color = color;
      p.maxLife = lifetime;
      p.size = size;
    }
  }

  /** Trail — emit particles that drift toward a target (magnet effect) */
  trail(
    x: number, y: number,
    targetX: number, targetY: number,
    count: number,
    color: number,
    speed: number,
    lifetime: number,
    size = 2,
  ) {
    const dx = targetX - x;
    const dy = targetY - y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1) return;
    const nx = dx / len;
    const ny = dy / len;

    for (let i = 0; i < count; i++) {
      const p = this.acquire();
      if (!p) break;
      // Scatter start position slightly
      p.x = x + (Math.random() - 0.5) * 10;
      p.y = y + (Math.random() - 0.5) * 10;
      // Velocity toward target with slight randomness
      const s = speed * (0.8 + Math.random() * 0.4);
      p.vx = nx * s + (Math.random() - 0.5) * 20;
      p.vy = ny * s + (Math.random() - 0.5) * 20;
      p.color = color;
      p.maxLife = lifetime;
      p.size = size;
    }
  }

  /** Spark scatter — random spread with optional color array (for lightning) */
  burstSpark(
    x: number, y: number,
    count: number,
    colors: number[],
    speedMin: number, speedMax: number,
    lifetime: number,
    size = 2,
  ) {
    for (let i = 0; i < count; i++) {
      const p = this.acquire();
      if (!p) break;
      const angle = Math.random() * Math.PI * 2;
      const speed = speedMin + Math.random() * (speedMax - speedMin);
      p.x = x;
      p.y = y;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;
      p.color = colors[Math.floor(Math.random() * colors.length)];
      p.maxLife = lifetime;
      p.size = size;
    }
  }

  // ------- Update & render -------

  update(dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life += dt;
      p.alpha = 1 - p.life / p.maxLife;

      if (p.life >= p.maxLife) {
        this.release(i);
      }
    }

    // Batch-redraw all particles into a single Graphics
    this.gfx.clear();
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      this.gfx.circle(p.x, p.y, p.size * p.alpha).fill({ color: p.color, alpha: p.alpha });
    }
  }

  /** Release all particles back to pool */
  clearAll() {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      this.release(i);
    }
  }
}

// ---------------------------------------------------------------------------
// Screen Flash — full-screen color overlay that fades out
// ---------------------------------------------------------------------------
export class ScreenFlash extends Container {
  private gfx: Graphics;
  private timer = 0;
  private duration = 0;

  constructor() {
    super();
    this.gfx = new Graphics();
    this.addChild(this.gfx);
    this.visible = false;
  }

  flash(color: number, alpha: number, duration: number, screenW: number, screenH: number) {
    this.gfx.clear().rect(0, 0, screenW, screenH).fill({ color, alpha });
    this.timer = duration;
    this.duration = duration;
    this.visible = true;
    this.alpha = 1;
  }

  update(dt: number) {
    if (!this.visible) return;
    this.timer -= dt;
    if (this.timer <= 0) {
      this.visible = false;
      return;
    }
    this.alpha = this.timer / this.duration;
  }
}
