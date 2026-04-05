import { Application } from "pixi.js";

async function init() {
  const app = new Application();

  await app.init({
    background: "#1a0a2e",
    resizeTo: window,
    antialias: true,
  });

  document.body.appendChild(app.canvas);

  console.log("Void Survivors — PixiJS", app.renderer.type);
}

init();
