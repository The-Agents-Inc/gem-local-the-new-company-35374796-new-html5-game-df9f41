import { Container, Graphics, Text, TextStyle } from "pixi.js";
import { WeaponType, WEAPON_NAMES, WEAPON_COLORS, WEAPON_DEFS } from "./weapons";
import { SaveData, ALL_UPGRADES, getUpgradeTier, canAfford, purchaseUpgrade } from "./upgrades";

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
// Game Over Screen
// ---------------------------------------------------------------------------
export class GameOverScreen extends Container {
  private onShop: (() => void) | null = null;

  constructor(kills: number, elapsed: number, goldEarned: number, totalGold: number, onShopCallback: () => void) {
    super();
    this.onShop = onShopCallback;

    const overlay = new Graphics()
      .rect(0, 0, 2000, 2000)
      .fill({ color: 0x000000, alpha: 0.7 });
    overlay.position.set(-1000, -1000);
    this.addChild(overlay);

    const title = new Text({ text: "GAME OVER", style: TITLE_STYLE });
    title.anchor.set(0.5);
    title.position.set(0, -70);
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
    stats.position.set(0, -10);
    this.addChild(stats);

    const goldStyle = new TextStyle({ fontFamily: "monospace", fontSize: 20, fill: 0xffcc33 });
    const goldInfo = new Text({ text: `+${goldEarned} gold  (Total: ${totalGold})`, style: goldStyle });
    goldInfo.anchor.set(0.5);
    goldInfo.position.set(0, 25);
    this.addChild(goldInfo);

    // Shop button
    const shopBtn = new Container();
    shopBtn.position.set(0, 70);
    shopBtn.eventMode = "static";
    shopBtn.cursor = "pointer";

    const btnBg = new Graphics()
      .roundRect(-80, -18, 160, 36, 8)
      .fill({ color: 0x2a1a4e })
      .roundRect(-80, -18, 160, 36, 8)
      .stroke({ color: 0xffcc33, width: 2 });
    shopBtn.addChild(btnBg);

    const btnText = new Text({ text: "UPGRADE SHOP", style: new TextStyle({ fontFamily: "monospace", fontSize: 16, fill: 0xffcc33, fontWeight: "bold" }) });
    btnText.anchor.set(0.5);
    shopBtn.addChild(btnText);

    shopBtn.on("pointerover", () => { btnBg.tint = 0xcccccc; });
    shopBtn.on("pointerout", () => { btnBg.tint = 0xffffff; });
    shopBtn.on("pointerdown", (e) => {
      e.stopPropagation();
      if (this.onShop) this.onShop();
    });
    this.addChild(shopBtn);

    const restart = new Text({
      text: "[SPACE] or [TAP] to restart",
      style: SUB_STYLE,
    });
    restart.anchor.set(0.5);
    restart.position.set(0, 120);
    this.addChild(restart);
  }

  destroy(options?: { children?: boolean }) {
    this.onShop = null;
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
  private save: SaveData;
  private goldDisplay!: Text;
  private cardContainer!: Container;
  private onClose: (() => void) | null = null;
  private screenW: number;
  private screenH: number;

  constructor(save: SaveData, screenWidth: number, screenHeight: number, onCloseCallback: () => void) {
    super();
    this.save = save;
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
    this.goldDisplay = new Text({ text: `Gold: ${save.gold}`, style: SHOP_GOLD_STYLE });
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

    const tier = getUpgradeTier(this.save, def.id);
    const maxed = tier >= def.maxTier;
    const affordable = canAfford(this.save, def.id);

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
          purchaseUpgrade(this.save, def.id);
          this.goldDisplay.text = `Gold: ${this.save.gold}`;
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
