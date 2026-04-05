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

export class HUD extends Container {
  private hpText: Text;
  private killText: Text;
  private timerText: Text;

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
  }

  update(hp: number, maxHp: number, kills: number, elapsed: number) {
    this.hpText.text = `HP: ${Math.ceil(hp)} / ${maxHp}`;
    this.killText.text = `Kills: ${kills}`;
    const mins = Math.floor(elapsed / 60);
    const secs = Math.floor(elapsed % 60)
      .toString()
      .padStart(2, "0");
    this.timerText.text = `${mins}:${secs}`;
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
