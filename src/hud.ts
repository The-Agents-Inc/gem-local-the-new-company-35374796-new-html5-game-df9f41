import { Container, Graphics, Text, TextStyle } from "pixi.js";
import { WeaponType, WEAPON_NAMES, WEAPON_COLORS, WEAPON_DEFS } from "./weapons";
import { ALL_UPGRADES, canAffordUpgrade, purchaseUpgrade } from "./upgrades";
import { SaveManager } from "./save";
import { ALL_CHARACTERS, CharacterDef, CharacterId } from "./characters";

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
  private goldText: Text;
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

    this.goldText = new Text({ text: "Gold: 0", style: new TextStyle({ fontFamily: "monospace", fontSize: 16, fill: 0xffcc33 }) });
    this.goldText.position.set(12, 100);
    this.addChild(this.goldText);

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
    runGold = 0,
  ) {
    this.hpText.text = `HP: ${Math.ceil(hp)} / ${maxHp}`;
    this.killText.text = `Kills: ${kills}`;
    this.goldText.text = `Gold: ${runGold}`;
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
// Run Summary Screen — animated post-death stats + gold reward
// ---------------------------------------------------------------------------
export interface RunSummaryData {
  kills: number;
  elapsed: number;
  level: number;
  weapons: { type: WeaponType; level: number }[];
  goldEarned: number;
  score: number;
  isNewHighScore: boolean;
  totalGold: number;
}

const STAT_LABEL_STYLE = new TextStyle({ fontFamily: "monospace", fontSize: 14, fill: 0x999999 });
const STAT_VAL_STYLE = new TextStyle({ fontFamily: "monospace", fontSize: 22, fill: 0xffffff, fontWeight: "bold" });
const GOLD_VAL_STYLE = new TextStyle({ fontFamily: "monospace", fontSize: 26, fill: 0xffcc33, fontWeight: "bold" });

class AnimatedStat {
  current = 0;
  target: number;
  delay: number;
  speed: number;
  done = false;
  format: (v: number) => string;

  constructor(target: number, delay: number, format: (v: number) => string) {
    this.target = target;
    this.delay = delay;
    this.speed = Math.max(1, target / 0.8);
    this.format = format;
  }

  tick(dt: number): string {
    if (this.delay > 0) { this.delay -= dt; return this.format(0); }
    if (!this.done) {
      this.current += this.speed * dt;
      if (this.current >= this.target) { this.current = this.target; this.done = true; }
    }
    return this.format(Math.floor(this.current));
  }
}

export class RunSummaryScreen extends Container {
  private onShop: (() => void) | null = null;
  private onRestart: (() => void) | null = null;
  private animEntries: { stat: AnimatedStat; display: Text }[] = [];
  private goldAnim: AnimatedStat;
  private goldDisplay: Text;

  constructor(
    data: RunSummaryData,
    screenWidth: number,
    screenHeight: number,
    onShopCb: () => void,
    onRestartCb: () => void,
  ) {
    super();
    this.onShop = onShopCb;
    this.onRestart = onRestartCb;

    // Full-screen overlay
    const overlay = new Graphics()
      .rect(0, 0, screenWidth, screenHeight)
      .fill({ color: 0x000000, alpha: 0.8 });
    this.addChild(overlay);

    const cx = screenWidth / 2;
    let y = screenHeight * 0.08;

    // Title
    const title = new Text({ text: "RUN COMPLETE", style: TITLE_STYLE });
    title.anchor.set(0.5, 0);
    title.position.set(cx, y);
    this.addChild(title);
    y += 65;

    // Animated stat rows
    const timeFmt = (v: number) => {
      const m = Math.floor(v / 60);
      const s = Math.floor(v % 60).toString().padStart(2, "0");
      return `${m}:${s}`;
    };

    // New high score callout
    if (data.isNewHighScore) {
      const hsText = new Text({
        text: "NEW HIGH SCORE!",
        style: new TextStyle({ fontFamily: "monospace", fontSize: 28, fill: 0xffcc33, fontWeight: "bold" }),
      });
      hsText.anchor.set(0.5, 0);
      hsText.position.set(cx, y);
      this.addChild(hsText);
      y += 40;
    }

    const rows = [
      { label: "SCORE", target: data.score, format: (v: number) => `${v}`, delay: 0.1 },
      { label: "TIME SURVIVED", target: data.elapsed, format: timeFmt, delay: 0.3 },
      { label: "ENEMIES KILLED", target: data.kills, format: (v: number) => `${v}`, delay: 0.6 },
      { label: "LEVEL REACHED", target: data.level, format: (v: number) => `${v}`, delay: 0.9 },
    ];

    for (const r of rows) {
      const lbl = new Text({ text: r.label, style: STAT_LABEL_STYLE });
      lbl.anchor.set(0.5, 0);
      lbl.position.set(cx, y);
      this.addChild(lbl);

      const val = new Text({ text: r.format(0), style: STAT_VAL_STYLE });
      val.anchor.set(0.5, 0);
      val.position.set(cx, y + 18);
      this.addChild(val);

      this.animEntries.push({ stat: new AnimatedStat(r.target, r.delay, r.format), display: val });
      y += 52;
    }

    // Weapons row
    y += 8;
    const wLbl = new Text({ text: "WEAPONS", style: STAT_LABEL_STYLE });
    wLbl.anchor.set(0.5, 0);
    wLbl.position.set(cx, y);
    this.addChild(wLbl);
    y += 22;

    const wRow = new Container();
    wRow.position.set(cx, y);
    const totalW = data.weapons.length * 36 - 6;
    for (let i = 0; i < data.weapons.length; i++) {
      const w = data.weapons[i];
      const color = WEAPON_COLORS[w.type];
      const xOff = i * 36 - totalW / 2;
      const icon = new Graphics()
        .roundRect(xOff, 0, 30, 30, 4).fill({ color: 0x1a1a2e })
        .roundRect(xOff, 0, 30, 30, 4).stroke({ color, width: 2 })
        .circle(xOff + 15, 15, 8).fill({ color });
      wRow.addChild(icon);

      const nm = new Text({
        text: WEAPON_NAMES[w.type],
        style: new TextStyle({ fontFamily: "monospace", fontSize: 10, fill: color }),
      });
      nm.anchor.set(0.5, 0);
      nm.position.set(xOff + 15, 34);
      wRow.addChild(nm);
    }
    this.addChild(wRow);
    y += 56;

    // Divider
    this.addChild(new Graphics().rect(cx - 100, y, 200, 1).fill({ color: 0x444444 }));
    y += 16;

    // Gold earned (animated)
    const gLbl = new Text({ text: "GOLD EARNED", style: STAT_LABEL_STYLE });
    gLbl.anchor.set(0.5, 0);
    gLbl.position.set(cx, y);
    this.addChild(gLbl);

    this.goldDisplay = new Text({ text: "+0", style: GOLD_VAL_STYLE });
    this.goldDisplay.anchor.set(0.5, 0);
    this.goldDisplay.position.set(cx, y + 18);
    this.addChild(this.goldDisplay);
    this.goldAnim = new AnimatedStat(data.goldEarned, 1.2, (v) => `+${v}`);

    const gTotal = new Text({
      text: `Total: ${data.totalGold}`,
      style: new TextStyle({ fontFamily: "monospace", fontSize: 14, fill: 0xffcc33 }),
    });
    gTotal.anchor.set(0.5, 0);
    gTotal.position.set(cx, y + 48);
    this.addChild(gTotal);
    y += 78;

    // Buttons
    y += 10;
    this.addChild(this.buildBtn("UPGRADE SHOP", cx, y, 0xffcc33, 0x2a1a4e, (e) => {
      e.stopPropagation();
      if (this.onShop) this.onShop();
    }));
    y += 48;
    this.addChild(this.buildBtn("PLAY AGAIN", cx, y, 0x55ffaa, 0x1a2e1a, () => {
      if (this.onRestart) this.onRestart();
    }));
  }

  private buildBtn(label: string, x: number, y: number, accent: number, bg: number, handler: (e: { stopPropagation: () => void }) => void): Container {
    const btn = new Container();
    btn.position.set(x, y);
    btn.eventMode = "static";
    btn.cursor = "pointer";

    const bgGfx = new Graphics()
      .roundRect(-90, -18, 180, 36, 8).fill({ color: bg })
      .roundRect(-90, -18, 180, 36, 8).stroke({ color: accent, width: 2 });
    btn.addChild(bgGfx);

    const txt = new Text({
      text: label,
      style: new TextStyle({ fontFamily: "monospace", fontSize: 16, fill: accent, fontWeight: "bold" }),
    });
    txt.anchor.set(0.5);
    btn.addChild(txt);

    btn.on("pointerover", () => { bgGfx.tint = 0xcccccc; });
    btn.on("pointerout", () => { bgGfx.tint = 0xffffff; });
    btn.on("pointerdown", handler);
    return btn;
  }

  /** Call each frame to drive count-up animations. */
  updateAnim(dt: number) {
    for (const { stat, display } of this.animEntries) {
      display.text = stat.tick(dt);
    }
    this.goldDisplay.text = this.goldAnim.tick(dt);
  }

  destroy(options?: { children?: boolean }) {
    this.onShop = null;
    this.onRestart = null;
    super.destroy(options);
  }
}

// ---------------------------------------------------------------------------
// Upgrade Shop Screen
// ---------------------------------------------------------------------------
const SHOP_TITLE_STYLE = new TextStyle({
  fontFamily: "monospace",
  fontSize: 36,
  fill: 0xffcc33,
  fontWeight: "bold",
});

const SHOP_GOLD_STYLE = new TextStyle({
  fontFamily: "monospace",
  fontSize: 22,
  fill: 0xffcc33,
});

const UPGRADE_NAME_STYLE = new TextStyle({
  fontFamily: "monospace",
  fontSize: 16,
  fill: 0xffffff,
  fontWeight: "bold",
});

const UPGRADE_DESC_STYLE = new TextStyle({
  fontFamily: "monospace",
  fontSize: 12,
  fill: 0xaaaaaa,
});

export class UpgradeShopScreen extends Container {
  private saveMgr: SaveManager;
  private goldDisplay!: Text;
  private cardContainer!: Container;
  private onClose: (() => void) | null = null;
  private screenW: number;
  private screenH: number;

  constructor(saveMgr: SaveManager, screenWidth: number, screenHeight: number, onCloseCallback: () => void) {
    super();
    this.saveMgr = saveMgr;
    this.onClose = onCloseCallback;
    this.screenW = screenWidth;
    this.screenH = screenHeight;

    // Overlay
    const overlay = new Graphics()
      .rect(0, 0, screenWidth, screenHeight)
      .fill({ color: 0x0a0a1e, alpha: 0.95 });
    this.addChild(overlay);

    // Title
    const title = new Text({ text: "UPGRADE SHOP", style: SHOP_TITLE_STYLE });
    title.anchor.set(0.5, 0);
    title.position.set(screenWidth / 2, 30);
    this.addChild(title);

    // Gold
    this.goldDisplay = new Text({ text: `Gold: ${saveMgr.save.gold}`, style: SHOP_GOLD_STYLE });
    this.goldDisplay.anchor.set(0.5, 0);
    this.goldDisplay.position.set(screenWidth / 2, 75);
    this.addChild(this.goldDisplay);

    // Upgrade cards
    this.cardContainer = new Container();
    this.addChild(this.cardContainer);
    this.rebuildCards();

    // Close button
    const closeBtn = new Container();
    closeBtn.position.set(screenWidth / 2, screenHeight - 50);
    closeBtn.eventMode = "static";
    closeBtn.cursor = "pointer";

    const closeBg = new Graphics()
      .roundRect(-100, -20, 200, 40, 8)
      .fill({ color: 0x1a1a2e })
      .roundRect(-100, -20, 200, 40, 8)
      .stroke({ color: 0x55ffaa, width: 2 });
    closeBtn.addChild(closeBg);

    const closeText = new Text({ text: "BACK TO GAME", style: new TextStyle({ fontFamily: "monospace", fontSize: 16, fill: 0x55ffaa, fontWeight: "bold" }) });
    closeText.anchor.set(0.5);
    closeBtn.addChild(closeText);

    closeBtn.on("pointerover", () => { closeBg.tint = 0xcccccc; });
    closeBtn.on("pointerout", () => { closeBg.tint = 0xffffff; });
    closeBtn.on("pointerdown", () => {
      if (this.onClose) this.onClose();
    });
    this.addChild(closeBtn);
  }

  private rebuildCards() {
    this.cardContainer.removeChildren();
    const upgrades = ALL_UPGRADES;
    const cols = 3;
    const cardW = 200;
    const cardH = 140;
    const gapX = 16;
    const gapY = 16;
    const totalW = cols * cardW + (cols - 1) * gapX;
    const startX = (this.screenW - totalW) / 2;
    const startY = 115;

    for (let i = 0; i < upgrades.length; i++) {
      const def = upgrades[i];
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = startX + col * (cardW + gapX);
      const y = startY + row * (cardH + gapY);
      const card = this.buildUpgradeCard(def, x, y, cardW, cardH);
      this.cardContainer.addChild(card);
    }
  }

  private buildUpgradeCard(def: typeof ALL_UPGRADES[0], x: number, y: number, w: number, h: number): Container {
    const card = new Container();
    card.position.set(x, y);

    const tier = this.saveMgr.getUpgradeTier(def.id);
    const maxed = tier >= def.maxTier;
    const affordable = canAffordUpgrade(this.saveMgr, def.id);

    // Background
    const borderColor = maxed ? 0x444444 : (affordable ? def.color : 0x333333);
    const bg = new Graphics()
      .roundRect(0, 0, w, h, 10)
      .fill({ color: 0x12122a })
      .roundRect(0, 0, w, h, 10)
      .stroke({ color: borderColor, width: 2 });
    card.addChild(bg);

    // Color accent bar
    const accent = new Graphics()
      .roundRect(0, 0, 6, h - 20, 3)
      .fill({ color: def.color, alpha: maxed ? 0.3 : 0.8 });
    accent.position.set(10, 10);
    card.addChild(accent);

    // Name
    const name = new Text({ text: def.name, style: UPGRADE_NAME_STYLE });
    name.position.set(24, 10);
    card.addChild(name);

    // Description
    const desc = new Text({ text: def.description, style: UPGRADE_DESC_STYLE });
    desc.position.set(24, 30);
    card.addChild(desc);

    // Tier pips
    for (let t = 0; t < def.maxTier; t++) {
      const pip = new Graphics()
        .roundRect(24 + t * 18, 52, 14, 6, 2)
        .fill({ color: t < tier ? def.color : 0x333333 });
      card.addChild(pip);
    }

    // Current bonus
    if (tier > 0) {
      const bonusText = new Text({
        text: `+${def.values[tier - 1]}${def.unit}`,
        style: new TextStyle({ fontFamily: "monospace", fontSize: 12, fill: def.color }),
      });
      bonusText.position.set(24, 64);
      card.addChild(bonusText);
    }

    // Buy button or maxed label
    if (maxed) {
      const maxLabel = new Text({ text: "MAXED", style: new TextStyle({ fontFamily: "monospace", fontSize: 14, fill: 0x666666, fontWeight: "bold" }) });
      maxLabel.position.set(24, h - 35);
      card.addChild(maxLabel);
    } else {
      const cost = def.costs[tier];
      const nextBonus = def.values[tier];

      const buyBtn = new Container();
      buyBtn.position.set(24, h - 38);
      buyBtn.eventMode = "static";
      buyBtn.cursor = affordable ? "pointer" : "default";

      const btnBg = new Graphics()
        .roundRect(0, 0, w - 48, 28, 6)
        .fill({ color: affordable ? 0x2a1a4e : 0x1a1a1a })
        .roundRect(0, 0, w - 48, 28, 6)
        .stroke({ color: affordable ? 0xffcc33 : 0x333333, width: 1 });
      buyBtn.addChild(btnBg);

      const costText = new Text({
        text: `${cost}g  \u2192  +${nextBonus}${def.unit}`,
        style: new TextStyle({ fontFamily: "monospace", fontSize: 12, fill: affordable ? 0xffcc33 : 0x555555 }),
      });
      costText.position.set(8, 6);
      buyBtn.addChild(costText);

      if (affordable) {
        buyBtn.on("pointerover", () => { btnBg.tint = 0xcccccc; });
        buyBtn.on("pointerout", () => { btnBg.tint = 0xffffff; });
        buyBtn.on("pointerdown", () => {
          purchaseUpgrade(this.saveMgr, def.id);
          this.goldDisplay.text = `Gold: ${this.saveMgr.save.gold}`;
          this.rebuildCards();
        });
      }

      card.addChild(buyBtn);
    }

    return card;
  }

  destroy(options?: { children?: boolean }) {
    this.onClose = null;
    super.destroy(options);
  }
}

// ---------------------------------------------------------------------------
// Character Select Screen — pre-run character picker
// ---------------------------------------------------------------------------
const CHAR_SELECT_TITLE = new TextStyle({
  fontFamily: "monospace",
  fontSize: 36,
  fill: 0x55ffaa,
  fontWeight: "bold",
});

const CHAR_NAME_STYLE = new TextStyle({
  fontFamily: "monospace",
  fontSize: 22,
  fill: 0xffffff,
  fontWeight: "bold",
});

const CHAR_TITLE_STYLE = new TextStyle({
  fontFamily: "monospace",
  fontSize: 11,
  fill: 0xaaaaaa,
  wordWrap: true,
  wordWrapWidth: 180,
});

const CHAR_STAT_STYLE = new TextStyle({
  fontFamily: "monospace",
  fontSize: 12,
  fill: 0xcccccc,
});

const PASSIVE_NAME_STYLE = new TextStyle({
  fontFamily: "monospace",
  fontSize: 13,
  fill: 0xffcc33,
  fontWeight: "bold",
});

const PASSIVE_DESC_STYLE = new TextStyle({
  fontFamily: "monospace",
  fontSize: 11,
  fill: 0xccccaa,
  wordWrap: true,
  wordWrapWidth: 170,
});

export class CharacterSelectScreen extends Container {
  private onSelect: ((charId: CharacterId) => void) | null = null;
  private saveMgr: SaveManager;
  private cardContainer: Container;
  private goldDisplay: Text;
  private screenW: number;
  private screenH: number;

  constructor(
    saveMgr: SaveManager,
    screenWidth: number,
    screenHeight: number,
    onSelectCallback: (charId: CharacterId) => void,
  ) {
    super();
    this.saveMgr = saveMgr;
    this.onSelect = onSelectCallback;
    this.screenW = screenWidth;
    this.screenH = screenHeight;

    // Full-screen overlay
    const overlay = new Graphics()
      .rect(0, 0, screenWidth, screenHeight)
      .fill({ color: 0x0a0a1e, alpha: 0.95 });
    this.addChild(overlay);

    // Title
    const title = new Text({ text: "SELECT CHARACTER", style: CHAR_SELECT_TITLE });
    title.anchor.set(0.5, 0);
    title.position.set(screenWidth / 2, 30);
    this.addChild(title);

    // Gold display
    this.goldDisplay = new Text({
      text: `Gold: ${saveMgr.save.gold}`,
      style: new TextStyle({ fontFamily: "monospace", fontSize: 18, fill: 0xffcc33 }),
    });
    this.goldDisplay.anchor.set(0.5, 0);
    this.goldDisplay.position.set(screenWidth / 2, 72);
    this.addChild(this.goldDisplay);

    // Character cards
    this.cardContainer = new Container();
    this.addChild(this.cardContainer);
    this.rebuildCards();
  }

  private rebuildCards() {
    this.cardContainer.removeChildren();
    this.goldDisplay.text = `Gold: ${this.saveMgr.save.gold}`;

    const chars = ALL_CHARACTERS;
    const cardW = 200;
    const cardH = 320;
    const gap = 20;
    const totalW = chars.length * cardW + (chars.length - 1) * gap;
    const startX = (this.screenW - totalW) / 2;
    const cardY = 105;

    for (let i = 0; i < chars.length; i++) {
      const def = chars[i];
      const x = startX + i * (cardW + gap);
      const card = this.buildCharCard(def, x, cardY, cardW, cardH);
      this.cardContainer.addChild(card);
    }
  }

  private buildCharCard(def: CharacterDef, x: number, y: number, w: number, h: number): Container {
    const card = new Container();
    card.position.set(x, y);

    const unlocked = this.saveMgr.isCharacterUnlocked(def.id);
    const selected = this.saveMgr.save.selectedCharacter === def.id;
    const canAfford = this.saveMgr.save.gold >= def.unlockCost;

    const borderColor = selected ? 0x55ffaa : (unlocked ? def.color : (canAfford ? 0xffcc33 : 0x444444));

    // Background
    const bg = new Graphics()
      .roundRect(0, 0, w, h, 12)
      .fill({ color: selected ? 0x1a2e1a : 0x12122a })
      .roundRect(0, 0, w, h, 12)
      .stroke({ color: borderColor, width: selected ? 3 : 2 });
    card.addChild(bg);

    // Character icon (simple shape)
    const iconY = 40;
    const icon = new Graphics()
      .circle(w / 2, iconY, 28)
      .fill({ color: def.color, alpha: unlocked ? 0.3 : 0.1 })
      .circle(w / 2, iconY, 16)
      .fill({ color: def.color, alpha: unlocked ? 1 : 0.3 });
    card.addChild(icon);

    // Name
    const name = new Text({
      text: def.name,
      style: new TextStyle({
        fontFamily: "monospace",
        fontSize: 22,
        fill: unlocked ? 0xffffff : 0x666666,
        fontWeight: "bold",
      }),
    });
    name.anchor.set(0.5, 0);
    name.position.set(w / 2, iconY + 34);
    card.addChild(name);

    // Title/flavor
    const title = new Text({
      text: def.title,
      style: new TextStyle({
        fontFamily: "monospace",
        fontSize: 11,
        fill: unlocked ? 0xaaaaaa : 0x555555,
        wordWrap: true,
        wordWrapWidth: w - 30,
      }),
    });
    title.anchor.set(0.5, 0);
    title.position.set(w / 2, iconY + 60);
    card.addChild(title);

    // Stats
    let statY = iconY + 95;
    const stats = [
      { label: "HP", value: `${def.baseHp}`, color: 0xff4466 },
      { label: "Speed", value: `${def.baseSpeed}`, color: 0x55ccff },
      { label: "Weapon", value: WEAPON_NAMES[def.startingWeapon], color: WEAPON_COLORS[def.startingWeapon] },
    ];
    for (const s of stats) {
      const lbl = new Text({
        text: `${s.label}: `,
        style: new TextStyle({ fontFamily: "monospace", fontSize: 12, fill: 0x888888 }),
      });
      lbl.position.set(15, statY);
      card.addChild(lbl);

      const val = new Text({
        text: s.value,
        style: new TextStyle({ fontFamily: "monospace", fontSize: 12, fill: unlocked ? s.color : 0x555555 }),
      });
      val.position.set(80, statY);
      card.addChild(val);
      statY += 18;
    }

    // Passive
    statY += 6;
    const passiveLbl = new Text({
      text: def.passiveName,
      style: new TextStyle({
        fontFamily: "monospace",
        fontSize: 13,
        fill: unlocked ? 0xffcc33 : 0x555533,
        fontWeight: "bold",
      }),
    });
    passiveLbl.position.set(15, statY);
    card.addChild(passiveLbl);

    const passiveDesc = new Text({
      text: def.passiveDesc,
      style: new TextStyle({
        fontFamily: "monospace",
        fontSize: 11,
        fill: unlocked ? 0xccccaa : 0x444422,
        wordWrap: true,
        wordWrapWidth: w - 30,
      }),
    });
    passiveDesc.position.set(15, statY + 18);
    card.addChild(passiveDesc);

    // Action button
    const btnY = h - 45;
    if (unlocked) {
      if (selected) {
        // Currently selected — show "SELECTED" label + "START" button
        const selLabel = new Text({
          text: "SELECTED",
          style: new TextStyle({ fontFamily: "monospace", fontSize: 12, fill: 0x55ffaa }),
        });
        selLabel.anchor.set(0.5, 0);
        selLabel.position.set(w / 2, btnY - 16);
        card.addChild(selLabel);

        const startBtn = this.buildActionBtn("START RUN", w / 2, btnY + 8, 0x55ffaa, 0x1a2e1a, w - 30, () => {
          if (this.onSelect) this.onSelect(def.id);
        });
        card.addChild(startBtn);
      } else {
        // Unlocked but not selected — "SELECT" button
        const selectBtn = this.buildActionBtn("SELECT", w / 2, btnY, def.color, 0x1a1a2e, w - 30, () => {
          this.saveMgr.selectCharacter(def.id);
          this.rebuildCards();
        });
        card.addChild(selectBtn);
      }
    } else {
      // Locked — show unlock cost
      if (canAfford) {
        const unlockBtn = this.buildActionBtn(`UNLOCK (${def.unlockCost}g)`, w / 2, btnY, 0xffcc33, 0x2a1a4e, w - 30, () => {
          if (this.saveMgr.unlockCharacter(def.id, def.unlockCost)) {
            this.saveMgr.selectCharacter(def.id);
            this.rebuildCards();
          }
        });
        card.addChild(unlockBtn);
      } else {
        // Can't afford
        const lockLabel = new Text({
          text: `LOCKED (${def.unlockCost}g)`,
          style: new TextStyle({ fontFamily: "monospace", fontSize: 13, fill: 0x555555 }),
        });
        lockLabel.anchor.set(0.5, 0);
        lockLabel.position.set(w / 2, btnY);
        card.addChild(lockLabel);
      }
    }

    return card;
  }

  private buildActionBtn(label: string, x: number, y: number, accent: number, bgColor: number, width: number, handler: () => void): Container {
    const btn = new Container();
    btn.position.set(x, y);
    btn.eventMode = "static";
    btn.cursor = "pointer";

    const halfW = width / 2;
    const bgGfx = new Graphics()
      .roundRect(-halfW, -14, width, 28, 6)
      .fill({ color: bgColor })
      .roundRect(-halfW, -14, width, 28, 6)
      .stroke({ color: accent, width: 2 });
    btn.addChild(bgGfx);

    const txt = new Text({
      text: label,
      style: new TextStyle({ fontFamily: "monospace", fontSize: 13, fill: accent, fontWeight: "bold" }),
    });
    txt.anchor.set(0.5);
    btn.addChild(txt);

    btn.on("pointerover", () => { bgGfx.tint = 0xcccccc; });
    btn.on("pointerout", () => { bgGfx.tint = 0xffffff; });
    btn.on("pointerdown", handler);
    return btn;
  }

  destroy(options?: { children?: boolean }) {
    this.onSelect = null;
    super.destroy(options);
  }
}
