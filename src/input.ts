/** Keyboard state tracker for continuous input polling. */
export class Keyboard {
  private keys = new Set<string>();
  private onDown = (e: KeyboardEvent) => this.keys.add(e.code);
  private onUp = (e: KeyboardEvent) => this.keys.delete(e.code);

  constructor() {
    window.addEventListener("keydown", this.onDown);
    window.addEventListener("keyup", this.onUp);
  }

  isDown(code: string): boolean {
    return this.keys.has(code);
  }

  destroy() {
    window.removeEventListener("keydown", this.onDown);
    window.removeEventListener("keyup", this.onUp);
  }
}
