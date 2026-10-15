// The WebGL renderer in headless Chromium (characters/format/README.md, Rendering):
// placement to the pixel, premultiplied blending, and SKCropNode's mask rule.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";
import { PNG } from "pngjs";
import type { DrawItem } from "../src/rig.ts";

const here = dirname(fileURLToPath(import.meta.url));
let browser: Browser;
let page: Page;

before(async () => {
  const bundle = await build({ entryPoints: [join(here, "browser-entry.ts")], bundle: true, format: "esm", write: false });
  browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  page = await browser.newPage();
  await page.setContent(`<!doctype html><script type="module">${bundle.outputFiles[0]!.text}</script>`);
  await page.waitForFunction(() => "render" in window);
});
after(async () => browser?.close());

/** A page image as a data URL, from straight-alpha RGBA texels. */
function pagePng(width: number, height: number, texel: (x: number, y: number) => [number, number, number, number]): string {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) png.data.set(texel(x, y), (y * width + x) * 4);
  return `data:image/png;base64,${PNG.sync.write(png).toString("base64")}`;
}

/** A quad covering texels [x0, x0 + w) × [y0, y0 + h) of a page, placed at points (px, py), its size in points w / scale. */
function quad(part: string, page: { width: number; height: number }, x0: number, y0: number, w: number, h: number, scale: number, px: number, py: number, clipTo?: number, alpha = 1): DrawItem {
  const l = px, t = py, r = px + w / scale, b = py + h / scale;
  const u0 = x0 / page.width, v0 = y0 / page.height, u1 = (x0 + w) / page.width, v1 = (y0 + h) / page.height;
  return { part, region: part, page: 0, positions: [l, t, r, t, l, b, r, b], uvs: [u0, v0, u1, v0, u0, v1, u1, v1], columns: 1, rows: 1, clipTo, alpha };
}

async function render(size: [number, number], pages: string[], items: DrawItem[], stage = { x: 0, y: 0, pixelsPerPoint: 2 }, background: [number, number, number] = [1, 1, 1]) {
  const bytes = await page.evaluate(([s, p, i, st, bg]) => (window as unknown as { render: Function }).render(s, p, i, st, bg), [size, pages, items, stage, background] as const);
  return (x: number, y: number) => (bytes as number[]).slice((y * size[0] + x) * 4, (y * size[0] + x) * 4 + 4);
}

test("a quad lands on exactly the pixels its points map to, with no flip", async () => {
  // A 16 × 16 page: red, with a blue texel at the top-left corner.
  const url = pagePng(16, 16, (x, y) => (x === 0 && y === 0 ? [0, 0, 255, 255] : [255, 0, 0, 255]));
  // Scale 2 page drawn at 2 pixels per point: one texel per pixel, the quad's corner at (10, 20) pt = (20, 40) px.
  const at = await render([64, 64], [url], [quad("q", { width: 16, height: 16 }, 0, 0, 16, 16, 2, 10, 20)], { x: 0, y: 0, pixelsPerPoint: 2 });
  assert.deepEqual(at(20, 40), [0, 0, 255, 255], "the top-left texel is at the top-left pixel");
  assert.deepEqual(at(21, 40), [255, 0, 0, 255]);
  assert.deepEqual(at(35, 55), [255, 0, 0, 255], "the last pixel inside");
  assert.deepEqual(at(36, 55), [255, 255, 255, 255], "the first pixel outside, right");
  assert.deepEqual(at(35, 56), [255, 255, 255, 255], "the first pixel outside, below");
  assert.deepEqual(at(19, 40), [255, 255, 255, 255], "the first pixel outside, left");
  assert.deepEqual(at(20, 39), [255, 255, 255, 255], "the first pixel outside, above");
});

test("straight-alpha pages blend premultiplied over the background", async () => {
  // (100, 200, 50) at alpha 128 over white: c · 128/255 + 255 · (1 − 128/255) = (177, 227, 152).
  // Straight alpha drawn as if premultiplied would give (227, 255, 177).
  const url = pagePng(8, 8, () => [100, 200, 50, 128]);
  const at = await render([16, 16], [url], [quad("q", { width: 8, height: 8 }, 0, 0, 8, 8, 2, 2, 2)]);
  const got = at(6, 6);
  const want = [177, 227, 152, 255];
  assert.ok(got.every((v, i) => Math.abs(v - want[i]!) <= 1), `got ${got}, want ${want} within 1`);
});

test("a clipped part shows only where its mask has alpha 0.05 or more", async () => {
  // Page: the mask's texels in columns 0..3 (alpha 13, 12, 255, 0), and an opaque blue block at x 8..11.
  const maskAlpha = [13, 12, 255, 0];
  const url = pagePng(16, 4, (x) => (x < 4 ? [255, 255, 255, maskAlpha[x]!] : x >= 8 && x < 12 ? [0, 0, 255, 255] : [0, 0, 0, 0]));
  const p = { width: 16, height: 4 };
  const items = [quad("mask", p, 0, 0, 4, 4, 2, 0, 0), quad("clipped", p, 8, 0, 4, 4, 2, 0, 0, 0)];
  const at = await render([8, 8], [url], items, { x: 0, y: 0, pixelsPerPoint: 2 }, [0, 0, 0]);
  // 13/255 = 0.051 keeps the blue; 12/255 = 0.047 cuts it; a clear texel cuts it.
  assert.deepEqual(at(0, 1), [0, 0, 255, 255], "alpha 13 keeps");
  assert.notDeepEqual(at(1, 1).slice(0, 3), [0, 0, 255], "alpha 12 cuts");
  assert.deepEqual(at(2, 1), [0, 0, 255, 255], "opaque keeps");
  assert.deepEqual(at(3, 1), [0, 0, 0, 255], "clear cuts");
});

test("a mesh of rows draws the whole region, row by row", async () => {
  // A 4 × 8 region drawn as a mesh of 4 rows must cover the same pixels as a quad.
  const url = pagePng(4, 8, (x, y) => [0, 128 + y * 10, 0, 255]);
  const rows = 4;
  const positions: number[] = [];
  const uvs: number[] = [];
  for (let r = 0; r <= rows; r++) {
    const y = 1 + (4 / rows) * r;
    positions.push(1, y, 3, y);
    uvs.push(0, r / rows, 1, r / rows);
  }
  const mesh: DrawItem = { part: "m", region: "m", page: 0, positions, uvs, columns: 1, rows, alpha: 1 };
  const at = await render([8, 12], [url], [mesh]);
  for (let y = 2; y < 10; y++) for (let x = 2; x < 6; x++) assert.deepEqual(at(x, y), [0, 128 + (y - 2) * 10, 0, 255], `pixel ${x}, ${y}`);
  assert.deepEqual(at(2, 10), [255, 255, 255, 255]);
});
