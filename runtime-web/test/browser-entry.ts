// What the renderer's browser tests run in the page: draw a draw list from
// pages given as data URLs, and hand back the canvas's bytes.
import { CONTEXT_ATTRIBUTES, Renderer, type Stage } from "../src/renderer.ts";
import type { DrawItem } from "../src/rig.ts";

async function image(url: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.src = url;
  await img.decode();
  return img;
}

async function render(size: [number, number], pages: string[], items: DrawItem[], stage: Stage, background: [number, number, number]) {
  const canvas = document.createElement("canvas");
  canvas.width = size[0];
  canvas.height = size[1];
  const gl = canvas.getContext("webgl2", CONTEXT_ATTRIBUTES);
  if (!gl) throw new Error("no WebGL2");
  const renderer = new Renderer(gl);
  renderer.loadPages(await Promise.all(pages.map(image)));
  renderer.draw(items, stage, background);
  return Array.from(renderer.readPixels());
}

(window as unknown as { render: typeof render }).render = render;
