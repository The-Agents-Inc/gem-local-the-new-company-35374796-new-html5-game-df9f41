import { Container, Graphics, Text, TextStyle } from "pixi.js";
import { WeaponType, WEAPON_NAMES, WEAPON_COLORS, WEAPON_DEFS } from "./weapons";

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
// HUD
// ---------------------------------------------------------------------------
export class HUD extends Container {
  private hpText: Text;
  private killText: Text;
  private timerText: Text;
  private levelText: Text;
  private xpBarBg: Graphics;
  private xpBarFill: Graphics;
  private weaponIcons: Container;

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

    // Weapon icons row (bottom-left)
    this.weaponIcons = new Container();
    this.addChild(this.weaponIcons);
  }

  update(
    hp: number,
    maxHp: number,
    kills: number,
    elapsed: number,
    level: number,
    xpProgress: number,
    screenWidth: number,
    screenHeight: number,
    ownedWeapons: { type: WeaponType; level: number }[],
  ) {
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
    this.xpBarBg.clear().rect(0, 0, screenWidth, barH).fill({ color: 0x222222 });
    this.xpBarFill
      .clear()
      .rect(0, 0, screenWidth * Math.min(1, xpProgress), barH)
      .fill({ color: 0x55ffaa });

    // Weapon icons at bottom-left
    this.weaponIcons.removeChildren();
    this.weaponIcons.position.set(12, screenHeight - 40);
    for (let i = 0; i < ownedWeapons.length; i++) {
      const w = ownedWeapons[i];
      const color = WEAPON_COLORS[w.type];
      const icon = new Graphics()
        .roundRect(i * 36, 0, 30, 30, 4)
        .fill({ color: 0x1a1a2e })
        .roundRect(i * 36, 0, 30, 30, 4)
        .stroke({ color, width: 2 })
        .circle(i * 36 + 15, 15, 8)
        .fill({ color });
      this.weaponIcons.addChild(icon);

      // Level pips
      for (let l = 0; l <= w.level; l++) {
        const pip = new Graphics()
          .circle(i * 36 + 8 + l * 8, 28, 2)
          .fill({ color: 0xffffff });
        this.weaponIcons.addChild(pip);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Level Up Screen — weapon choices
// ---------------------------------------------------------------------------
export interface WeaponChoice {
  type: WeaponType;
  level: number; // target level (0-based)
  isNew: boolean;
}

const CARD_STYLE = new TextStyle({
  fontFamily: "monospace",
  fontSize: 18,
  fill: 0xffffff,
  fontWeight: "bold",
});
const CARD_DESC_STYLE = new TextStyle({
  fontFamily: "monospace",
  fontSize: 13,
  fill: 0xcccccc,
  wordWrap: true,
  wordWrapWidth: 140,
});
const LEVEL_TITLE_STYLE = new TextStyle({
  fontFamily: "monospace",
  fontSize: 36,
  fill: 0x55ffaa,
  fontWeight: "bold",
});

const WEAPON_DESCRIPTIONS: Record<WeaponType, string> = {
  [WeaponType.PlasmaBolt]: "Aimed shot at nearest enemy",
  [WeaponType.ScatterShot]: "Fires spread of projectiles",
  [WeaponType.OrbitalShield]: "Orbs rotate around you",
  [WeaponType.LightningChain]: "Chains through multiple foes",
  [WeaponType.FlameTrail]: "Leaves fire behind you",
};

function getUpgradeText(choice: WeaponChoice): string {
  const stats = WEAPON_DEFS[choice.type][choice.level];
  if (choice.isNew) return WEAPON_DESCRIPTIONS[choice.type];
  // Show what improved
  const prev = WEAPON_DEFS[choice.type][choice.level - 1];
  const parts: string[] = [];
  if (stats.damage > prev.damage) parts.push(`DMG ${prev.damage}→${stats.damage}`);
  if (stats.cooldown < prev.cooldown) parts.push(`Faster fire`);
  if (stats.projectileCount > prev.projectileCount) parts.push(`+${stats.projectileCount - prev.projectileCount} proj`);
  return parts.join(", ") || "Improved stats";
}

export class LevelUpScreen extends Container {
  private onSelect: ((choice: WeaponChoice) => void) | null = null;

  constructor(
    choices: WeaponChoice[],
    screenWidth: number,
    screenHeight: number,
    callback: (choice: WeaponChoice) => void,
  ) {
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

    const subtitle = new Text({ text: "Choose a weapon", style: SUB_STYLE });
    subtitle.anchor.set(0.5);
    subtitle.position.set(screenWidth / 2, screenHeight * 0.2 + 44);
    this.addChild(subtitle);

    // Cards
    const cardW = 160;
    const cardH = 210;
    const gap = 24;
    const totalW = choices.length * cardW + (choices.length - 1) * gap;
    const startX = (screenWidth - totalW) / 2;
    const cardY = screenHeight * 0.4;

    for (let i = 0; i < choices.length; i++) {
      const card = this.buildCard(choices[i], startX + i * (cardW + gap), cardY, cardW, cardH);
      this.addChild(card);
    }
  }

  private buildCard(choice: WeaponChoice, x: number, y: number, w: number, h: number): Container {
    const card = new Container();
    card.position.set(x, y);
    card.eventMode = "static";
    card.cursor = "pointer";

    const color = WEAPON_COLORS[choice.type];

    // Background
    const bg = new Graphics()
      .roundRect(0, 0, w, h, 12)
      .fill({ color: 0x1a1a2e })
      .roundRect(0, 0, w, h, 12)
      .stroke({ color, width: 2 });
    card.addChild(bg);

    // Icon
    const icon = new Graphics()
      .circle(w / 2, 38, 20)
      .fill({ color, alpha: 0.3 })
      .circle(w / 2, 38, 12)
      .fill({ color });
    card.addChild(icon);

    // New / Upgrade badge
    const badge = new Text({
      text: choice.isNew ? "NEW" : `Lv ${choice.level + 1}`,
      style: new TextStyle({ fontFamily: "monospace", fontSize: 11, fill: choice.isNew ? 0x55ffaa : 0xffcc33 }),
    });
    badge.anchor.set(0.5, 0);
    badge.position.set(w / 2, 62);
    card.addChild(badge);

    // Name
    const name = new Text({ text: WEAPON_NAMES[choice.type], style: CARD_STYLE });
    name.anchor.set(0.5, 0);
    name.position.set(w / 2, 78);
    card.addChild(name);

    // Description
    const desc = new Text({ text: getUpgradeText(choice), style: CARD_DESC_STYLE });
    desc.anchor.set(0.5, 0);
    desc.position.set(w / 2, 108);
    card.addChild(desc);

    // Hover
    card.on("pointerover", () => {
      bg.tint = 0xcccccc;
    });
    card.on("pointerout", () => {
      bg.tint = 0xffffff;
    });

    // Select
    card.on("pointerdown", () => {
      if (this.onSelect) {
        const cb = this.onSelect;
        this.onSelect = null;
        cb(choice);
      }
    });

    return card;
  }

  destroy(options?: { children?: boolean }) {
    this.onSelect = null;
    super.destroy(options);
  }
}

// ---------------------------------------------------------------------------
// Game Over Screen
// ---------------------------------------------------------------------------
export class GameOverScreen extends Container {
  constructor(kills: number, elapsed: number) {
    super();

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
