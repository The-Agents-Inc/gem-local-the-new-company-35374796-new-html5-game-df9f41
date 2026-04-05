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
// Screen Shake — exponential decay, stacking (max 3), directional bias
// ---------------------------------------------------------------------------
interface ShakeInstance {
  intensity: number;
  duration: number;
  elapsed: number;
  biasX: number;
  biasY: number;
}

const MAX_SHAKE_STACK = 3;

export class ScreenShake {
  private shakes: ShakeInstance[] = [];
  /** Current frame offset — apply to world container position */
  offsetX = 0;
  offsetY = 0;

  /**
   * Add a shake. biasX/biasY are optional directional bias (0-1 range).
   * If not provided, shake is omnidirectional.
   */
  add(intensity: number, duration: number, biasX = 0, biasY = 0) {
    if (this.shakes.length >= MAX_SHAKE_STACK) {
      // Replace weakest shake
      let weakest = 0;
      for (let i = 1; i < this.shakes.length; i++) {
        const remI = this.remaining(this.shakes[i]);
        const remW = this.remaining(this.shakes[weakest]);
        if (remI < remW) weakest = i;
      }
      this.shakes[weakest] = { intensity, duration, elapsed: 0, biasX, biasY };
    } else {
      this.shakes.push({ intensity, duration, elapsed: 0, biasX, biasY });
    }
  }

  private remaining(s: ShakeInstance): number {
    const t = s.elapsed / s.duration;
    return s.intensity * Math.exp(-3 * t) * (1 - t);
  }

  update(dt: number) {
    this.offsetX = 0;
    this.offsetY = 0;

    for (let i = this.shakes.length - 1; i >= 0; i--) {
      const s = this.shakes[i];
      s.elapsed += dt;
      if (s.elapsed >= s.duration) {
        // Swap-remove
        const last = this.shakes.length - 1;
        if (i < last) this.shakes[i] = this.shakes[last];
        this.shakes.length = last;
        continue;
      }
      const t = s.elapsed / s.duration;
      const amp = s.intensity * Math.exp(-3 * t);
      // Random shake + directional bias
      const rx = (Math.random() - 0.5) * 2;
      const ry = (Math.random() - 0.5) * 2;
      this.offsetX += (rx + s.biasX) * amp;
      this.offsetY += (ry + s.biasY) * amp;
    }
  }

  get active(): boolean {
    return this.shakes.length > 0;
  }

  reset() {
    this.shakes.length = 0;
    this.offsetX = 0;
    this.offsetY = 0;
  }
}

// ---------------------------------------------------------------------------
// Freeze Frame — pauses game update for a brief duration
// ---------------------------------------------------------------------------
export class FreezeFrame {
  private remaining = 0;

  /** Request a freeze. Longest freeze wins if called multiple times. */
  freeze(durationSec: number) {
    this.remaining = Math.max(this.remaining, durationSec);
  }

  /** Returns true when the game should skip its update this frame. */
  consume(dt: number): boolean {
    if (this.remaining <= 0) return false;
    this.remaining -= dt;
    return true;
  }

  get active(): boolean {
    return this.remaining > 0;
  }

  reset() {
    this.remaining = 0;
  }
}

// ---------------------------------------------------------------------------
// Camera Zoom — smooth scale with ease-out-quad
// ---------------------------------------------------------------------------
export class CameraZoom {
  targetScale = 1;
  currentScale = 1;
  private phase: "idle" | "zoom_in" | "hold" | "zoom_out" = "idle";
  private timer = 0;
  private zoomInDuration = 0;
  private holdDuration = 0;
  private zoomOutDuration = 0;
  private peakScale = 1;

  /**
   * Trigger a zoom pulse: scale up, hold, scale back.
   */
  pulse(peakScale: number, zoomInMs: number, holdMs: number, zoomOutMs: number) {
    this.peakScale = peakScale;
    this.zoomInDuration = zoomInMs / 1000;
    this.holdDuration = holdMs / 1000;
    this.zoomOutDuration = zoomOutMs / 1000;
    this.phase = "zoom_in";
    this.timer = 0;
  }

  update(dt: number) {
    if (this.phase === "idle") {
      this.currentScale = 1;
      return;
    }

    this.timer += dt;

    if (this.phase === "zoom_in") {
      if (this.timer >= this.zoomInDuration) {
        this.currentScale = this.peakScale;
        this.phase = "hold";
        this.timer = 0;
      } else {
        const t = this.timer / this.zoomInDuration;
        // ease-out-quad: t*(2-t)
        const e = t * (2 - t);
        this.currentScale = 1 + (this.peakScale - 1) * e;
      }
    } else if (this.phase === "hold") {
      this.currentScale = this.peakScale;
      if (this.timer >= this.holdDuration) {
        this.phase = "zoom_out";
        this.timer = 0;
      }
    } else if (this.phase === "zoom_out") {
      if (this.timer >= this.zoomOutDuration) {
        this.currentScale = 1;
        this.phase = "idle";
        this.timer = 0;
      } else {
        const t = this.timer / this.zoomOutDuration;
        const e = t * (2 - t);
        this.currentScale = this.peakScale + (1 - this.peakScale) * e;
      }
    }
  }

  get active(): boolean {
    return this.phase !== "idle";
  }

  reset() {
    this.phase = "idle";
    this.currentScale = 1;
    this.timer = 0;
  }
}

// ---------------------------------------------------------------------------
// Death Sequence — orchestrates the 5-step player death animation
// Phase: freeze → slow-mo → shake → flash/fade → done (callback)
// ---------------------------------------------------------------------------
export type DeathPhase = "idle" | "freeze" | "slowmo" | "shake" | "fade" | "done";

export class DeathSequence {
  phase: DeathPhase = "idle";
  private timer = 0;
  /** Time scale multiplier — applied to game dt during slow-mo */
  timeScale = 1;
  private onComplete: (() => void) | null = null;

  // Config
  private readonly FREEZE_DUR = 0.1;       // 100ms freeze
  private readonly SLOWMO_DUR = 0.8;       // 800ms at 0.2× speed
  private readonly SLOWMO_SCALE = 0.2;
  private readonly SHAKE_INTENSITY = 10;
  private readonly SHAKE_DUR = 0.4;        // 400ms
  private readonly FADE_DUR = 0.6;         // 600ms sprite fade + flash

  /** Player sprite alpha during fade phase (0→1 means fading out) */
  playerAlpha = 1;

  start(onComplete: () => void) {
    this.phase = "freeze";
    this.timer = 0;
    this.timeScale = 0; // frozen
    this.playerAlpha = 1;
    this.onComplete = onComplete;
  }

  /**
   * Called every raw frame (before dt scaling).
   * Returns shake request {intensity, duration} when entering shake phase, or null.
   */
  update(rawDt: number): { shakeIntensity: number; shakeDuration: number } | null {
    if (this.phase === "idle" || this.phase === "done") return null;

    this.timer += rawDt;
    let shakeReq: { shakeIntensity: number; shakeDuration: number } | null = null;

    if (this.phase === "freeze") {
      this.timeScale = 0;
      if (this.timer >= this.FREEZE_DUR) {
        this.phase = "slowmo";
        this.timer = 0;
        this.timeScale = this.SLOWMO_SCALE;
      }
    } else if (this.phase === "slowmo") {
      this.timeScale = this.SLOWMO_SCALE;
      if (this.timer >= this.SLOWMO_DUR) {
        this.phase = "shake";
        this.timer = 0;
        this.timeScale = 1;
        shakeReq = { shakeIntensity: this.SHAKE_INTENSITY, shakeDuration: this.SHAKE_DUR };
      }
    } else if (this.phase === "shake") {
      this.timeScale = 1;
      if (this.timer >= this.SHAKE_DUR) {
        this.phase = "fade";
        this.timer = 0;
      }
    } else if (this.phase === "fade") {
      this.timeScale = 1;
      const t = Math.min(1, this.timer / this.FADE_DUR);
      this.playerAlpha = 1 - t;
      if (this.timer >= this.FADE_DUR) {
        this.phase = "done";
        this.timeScale = 1;
        if (this.onComplete) this.onComplete();
      }
    }

    return shakeReq;
  }

  get active(): boolean {
    return this.phase !== "idle" && this.phase !== "done";
  }

  reset() {
    this.phase = "idle";
    this.timer = 0;
    this.timeScale = 1;
    this.playerAlpha = 1;
    this.onComplete = null;
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
