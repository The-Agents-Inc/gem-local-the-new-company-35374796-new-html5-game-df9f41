import { Application } from "pixi.js";
import { Game } from "./game";

async function init() {
  const app = new Application();

  await app.init({
    background: "#1a0a2e",
    resizeTo: window,
    antialias: true,
  });

  document.body.appendChild(app.canvas);

  const game = new Game(app);
  app.ticker.add((ticker) => game.update(ticker));
}

init();
