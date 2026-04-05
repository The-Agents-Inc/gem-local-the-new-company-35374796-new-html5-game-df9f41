import { Container, Graphics, Text, TextStyle } from "pixi.js";

const STYLE = new TextStyle({
  fontFamily: "monospace",
  fontSize: 16,
  fill: 0xffffff,
});

const TITLE_STYLE = new TextStyle({
  fontFamily: "monospace",
  fontSize: 48,
  fill: 0xff4466,
  fontWeight: "bold",
});

const SUB_STYLE = new TextStyle({
  fontFamily: "monospace",
  fontSize: 20,
  fill: 0xffffff,
});

// ---------------------------------------------------------------------------
// Ability definitions
// ---------------------------------------------------------------------------
export interface Ability {
  id: string;
  name: string;
  description: string;
  color: number;
  apply: (player: { speed: number; attackCooldown: number; maxHp: number; hp: number; projectileDamage: number; projectileCount: number; pickupRadius: number; drawHpBar: () => void }) => void;
}

export const ALL_ABILITIES: Ability[] = [
  {
    id: "speed_up",
    name: "Swift Boots",
    description: "+15% move speed",
    color: 0x55ccff,
    apply: (p) => { p.speed *= 1.15; },
  },
  {
    id: "rapid_fire",
    name: "Rapid Fire",
    description: "+20% attack speed",
    color: 0xffaa33,
    apply: (p) => { p.attackCooldown *= 0.8; },
  },
  {
    id: "max_hp_up",
    name: "Vitality",
    description: "+25 max HP, heals 25",
    color: 0x33ff66,
    apply: (p) => { p.maxHp += 25; p.hp = Math.min(p.hp + 25, p.maxHp); p.drawHpBar(); },
  },
  {
    id: "damage_up",
    name: "Sharp Rounds",
    description: "+4 projectile damage",
    color: 0xff5555,
    apply: (p) => { p.projectileDamage += 4; },
  },
  {
    id: "multi_shot",
    name: "Multi Shot",
    description: "+1 projectile per shot",
    color: 0xffee55,
    apply: (p) => { p.projectileCount += 1; },
  },
  {
    id: "magnet",
    name: "Magnet",
    description: "+50% pickup radius",
    color: 0xaa55ff,
    apply: (p) => { p.pickupRadius *= 1.5; },
  },
  {
    id: "heal",
    name: "Healing Surge",
    description: "Restore 30 HP",
    color: 0x55ff99,
    apply: (p) => { p.hp = Math.min(p.hp + 30, p.maxHp); p.drawHpBar(); },
  },
];

/** Pick N unique random abilities */
export function pickRandomAbilities(n: number): Ability[] {
  const pool = [...ALL_ABILITIES];
  const result: Ability[] = [];
  for (let i = 0; i < n && pool.length > 0; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    result.push(pool.splice(idx, 1)[0]);
  }
  return result;
}

export class HUD extends Container {
  private hpText: Text;
  private killText: Text;
  private timerText: Text;
  private levelText: Text;
  private xpBarBg: Graphics;
  private xpBarFill: Graphics;

  constructor() {
    super();
    this.hpText = new Text({ text: "HP: 100", style: STYLE });
    this.hpText.position.set(12, 12);
    this.addChild(this.hpText);

    this.killText = new Text({ text: "Kills: 0", style: STYLE });
    this.killText.position.set(12, 34);
    this.addChild(this.killText);

    this.timerText = new Text({ text: "0:00", style: STYLE });
    this.timerText.position.set(12, 56);
    this.addChild(this.timerText);

    this.levelText = new Text({ text: "Lv 1", style: STYLE });
    this.levelText.position.set(12, 78);
    this.addChild(this.levelText);

    // XP bar across top of screen
    this.xpBarBg = new Graphics();
    this.addChild(this.xpBarBg);
    this.xpBarFill = new Graphics();
    this.addChild(this.xpBarFill);
  }

  update(hp: number, maxHp: number, kills: number, elapsed: number, level: number, xpProgress: number, screenWidth: number) {
    this.hpText.text = `HP: ${Math.ceil(hp)} / ${maxHp}`;
    this.killText.text = `Kills: ${kills}`;
    const mins = Math.floor(elapsed / 60);
    const secs = Math.floor(elapsed % 60)
      .toString()
      .padStart(2, "0");
    this.timerText.text = `${mins}:${secs}`;
    this.levelText.text = `Lv ${level}`;

    // XP bar at very top
    const barH = 6;
    const w = screenWidth;
    this.xpBarBg.clear().rect(0, 0, w, barH).fill({ color: 0x222222 });
    this.xpBarFill.clear().rect(0, 0, w * Math.min(1, xpProgress), barH).fill({ color: 0x55ffaa });
  }
}

// ---------------------------------------------------------------------------
// Level Up Screen — 3 ability cards, click/tap to select
// ---------------------------------------------------------------------------
const CARD_STYLE = new TextStyle({ fontFamily: "monospace", fontSize: 22, fill: 0xffffff, fontWeight: "bold" });
const CARD_DESC_STYLE = new TextStyle({ fontFamily: "monospace", fontSize: 14, fill: 0xcccccc, wordWrap: true, wordWrapWidth: 140 });
const LEVEL_TITLE_STYLE = new TextStyle({ fontFamily: "monospace", fontSize: 36, fill: 0x55ffaa, fontWeight: "bold" });

export class LevelUpScreen extends Container {
  private onSelect: ((ability: Ability) => void) | null = null;

  constructor(abilities: Ability[], screenWidth: number, screenHeight: number, callback: (ability: Ability) => void) {
    super();
    this.onSelect = callback;

    // Dim overlay
    const overlay = new Graphics()
      .rect(0, 0, screenWidth, screenHeight)
      .fill({ color: 0x000000, alpha: 0.75 });
    this.addChild(overlay);

    // Title
    const title = new Text({ text: "LEVEL UP!", style: LEVEL_TITLE_STYLE });
    title.anchor.set(0.5);
    title.position.set(screenWidth / 2, screenHeight * 0.2);
    this.addChild(title);

    const subtitle = new Text({ text: "Choose an upgrade", style: SUB_STYLE });
    subtitle.anchor.set(0.5);
    subtitle.position.set(screenWidth / 2, screenHeight * 0.2 + 44);
    this.addChild(subtitle);

    // Cards
    const cardW = 160;
    const cardH = 200;
    const gap = 24;
    const totalW = abilities.length * cardW + (abilities.length - 1) * gap;
    const startX = (screenWidth - totalW) / 2;
    const cardY = screenHeight * 0.42;

    for (let i = 0; i < abilities.length; i++) {
      const ab = abilities[i];
      const cx = startX + i * (cardW + gap);
      const card = this.buildCard(ab, cx, cardY, cardW, cardH);
      this.addChild(card);
    }
  }

  private buildCard(ab: Ability, x: number, y: number, w: number, h: number): Container {
    const card = new Container();
    card.position.set(x, y);
    card.eventMode = "static";
    card.cursor = "pointer";

    // Card background
    const bg = new Graphics()
      .roundRect(0, 0, w, h, 12)
      .fill({ color: 0x1a1a2e })
      .roundRect(0, 0, w, h, 12)
      .stroke({ color: ab.color, width: 2 });
    card.addChild(bg);

    // Icon circle
    const icon = new Graphics()
      .circle(w / 2, 40, 20)
      .fill({ color: ab.color, alpha: 0.3 })
      .circle(w / 2, 40, 12)
      .fill({ color: ab.color });
    card.addChild(icon);

    // Name
    const name = new Text({ text: ab.name, style: CARD_STYLE });
    name.anchor.set(0.5, 0);
    name.position.set(w / 2, 70);
    card.addChild(name);

    // Description
    const desc = new Text({ text: ab.description, style: CARD_DESC_STYLE });
    desc.anchor.set(0.5, 0);
    desc.position.set(w / 2, 105);
    card.addChild(desc);

    // Hover effect
    card.on("pointerover", () => { bg.tint = 0xcccccc; });
    card.on("pointerout", () => { bg.tint = 0xffffff; });

    // Click to select
    card.on("pointerdown", () => {
      if (this.onSelect) {
        const cb = this.onSelect;
        this.onSelect = null; // prevent double-select
        cb(ab);
      }
    });

    return card;
  }

  destroy(options?: { children?: boolean }) {
    this.onSelect = null;
    super.destroy(options);
  }
}

export class GameOverScreen extends Container {
  constructor(kills: number, elapsed: number) {
    super();

    // Dim overlay
    const overlay = new Graphics()
      .rect(0, 0, 2000, 2000)
      .fill({ color: 0x000000, alpha: 0.7 });
    overlay.position.set(-1000, -1000);
    this.addChild(overlay);

    const title = new Text({ text: "GAME OVER", style: TITLE_STYLE });
    title.anchor.set(0.5);
    title.position.set(0, -40);
    this.addChild(title);

    const mins = Math.floor(elapsed / 60);
    const secs = Math.floor(elapsed % 60)
      .toString()
      .padStart(2, "0");
    const stats = new Text({
      text: `Survived: ${mins}:${secs}  |  Kills: ${kills}`,
      style: SUB_STYLE,
    });
    stats.anchor.set(0.5);
    stats.position.set(0, 20);
    this.addChild(stats);

    const restart = new Text({
      text: "[SPACE] or [TAP] to restart",
      style: SUB_STYLE,
    });
    restart.anchor.set(0.5);
    restart.position.set(0, 60);
    this.addChild(restart);
  }
}
