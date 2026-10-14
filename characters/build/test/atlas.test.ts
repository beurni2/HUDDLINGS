// Tests for the atlas build, from characters/format/README.md (Atlas).
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAtlas, EXTRUDE, GAP, packRasters, paintPages, rasterize, type Raster } from "../atlas.ts";
import { mulberry32 } from "../../../runtime-web/src/math.ts";
import { PNG } from "pngjs";

const rect = (w: number, h: number, fill: string, opacity = 1) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
  `<rect x="2" y="3" width="${w - 4}" height="${h - 6}" fill="${fill}" fill-opacity="${opacity}"/></svg>`;

test("rasterize scales, trims to the visible pixels and moves the anchor with the trim", () => {
  const r = rasterize({ region: "r", svg: rect(10, 20, "#ff0000"), anchor: [5, 20] }, 2);
  assert.equal(r.w, 12); // (10 − 4) pt × 2
  assert.equal(r.h, 28); // (20 − 6) pt × 2
  assert.equal(r.anchorX, 5 * 2 - 4); // trimmed 2 pt on the left
  assert.equal(r.anchorY, 20 * 2 - 6); // trimmed 3 pt on the top
});

test("rasterize keeps straight alpha, as PNG pages need", () => {
  const r = rasterize({ region: "r", svg: rect(10, 10, "rgb(200,100,50)", 0.5), anchor: [0, 0] }, 1);
  const [red, green, blue, alpha] = r.data.subarray(0, 4);
  assert.ok(Math.abs(alpha! - 128) <= 1, `alpha ${alpha}`);
  assert.ok(Math.abs(red! - 200) <= 2 && Math.abs(green! - 100) <= 2 && Math.abs(blue! - 50) <= 2, `rgb ${red},${green},${blue}`);
});

function randomRasters(n: number, seed: number): Raster[] {
  const rng = mulberry32(seed);
  return Array.from({ length: n }, (_, i) => {
    const w = 1 + Math.floor(rng() * 200);
    const h = 1 + Math.floor(rng() * 200);
    return { region: `r${i}`, w, h, data: Buffer.alloc(w * h * 4, i % 250), anchorX: 0, anchorY: 0 };
  });
}

test("packing gives power-of-two pages and keeps every region 16 px from its neighbours and the edge", () => {
  for (const seed of [1, 2, 3]) {
    const { placed, sizes } = packRasters(randomRasters(60, seed));
    for (const size of sizes) assert.equal(size & (size - 1), 0, `page ${size} is not a power of two`);
    for (const p of placed) {
      const size = sizes[p.page]!;
      assert.ok(p.x >= GAP && p.y >= GAP && p.x + p.raster.w + GAP <= size && p.y + p.raster.h + GAP <= size);
    }
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i]!, b = placed[j]!;
        if (a.page !== b.page) continue;
        const apart = a.x + a.raster.w + GAP <= b.x || b.x + b.raster.w + GAP <= a.x || a.y + a.raster.h + GAP <= b.y || b.y + b.raster.h + GAP <= a.y;
        assert.ok(apart, `${a.raster.region} and ${b.raster.region} are closer than ${GAP} px`);
      }
    }
  }
});

test("a region's edge pixels are extruded by 2 px and the rest of the gap stays clear", () => {
  const data = Buffer.alloc(3 * 2 * 4);
  for (let i = 0; i < 6; i++) data.set([10 * i, 20, 30, 255], i * 4);
  const raster: Raster = { region: "e", w: 3, h: 2, data, anchorX: 0, anchorY: 0 };
  const [page] = paintPages([{ raster, page: 0, x: GAP, y: GAP }], [64]);
  const at = (x: number, y: number) => Array.from(page!.data.subarray((y * 64 + x) * 4, (y * 64 + x) * 4 + 4));
  assert.deepEqual(at(GAP - 1, GAP), at(GAP, GAP)); // left of the first column
  assert.deepEqual(at(GAP - EXTRUDE, GAP), at(GAP, GAP));
  assert.deepEqual(at(GAP + 3 + 1, GAP + 1), at(GAP + 2, GAP + 1)); // right of the last column
  assert.deepEqual(at(GAP - EXTRUDE - 1, GAP), [0, 0, 0, 0]);
  // Above the first row and below the last, the same.
  assert.deepEqual(at(GAP + 1, GAP - 1), at(GAP + 1, GAP));
  assert.deepEqual(at(GAP + 1, GAP - EXTRUDE), at(GAP + 1, GAP));
  assert.deepEqual(at(GAP + 2, GAP + 2 + EXTRUDE - 1), at(GAP + 2, GAP + 1));
  assert.deepEqual(at(GAP + 1, GAP - EXTRUDE - 1), [0, 0, 0, 0]);
  assert.deepEqual(at(GAP + 1, GAP + 2 + EXTRUDE), [0, 0, 0, 0]);
});

test("buildAtlas writes page images whose regions hold the drawings", () => {
  const { atlas, images } = buildAtlas(
    "2x",
    [{ region: "a", svg: rect(20, 10, "#00ff00"), anchor: [10, 5] }, { region: "b", svg: rect(8, 30, "#0000ff"), anchor: [4, 0] }],
    2,
    (i) => `atlas@2x-${i}.png`,
  );
  assert.equal(images.length, 1);
  const page = PNG.sync.read(images[0]!);
  const a = atlas.regions.a!;
  const centre = ((a.y + Math.floor(a.h / 2)) * page.width + a.x + Math.floor(a.w / 2)) * 4;
  assert.deepEqual(Array.from(page.data.subarray(centre, centre + 4)), [0, 255, 0, 255]);
  assert.equal(atlas.pages[0]!.width, page.width);
  assert.equal(atlas.name, "2x");
  assert.equal(atlas.scale, 2);
});

test("a region wider than the area suggests still lands inside its page", () => {
  const wide: Raster = { region: "wide", w: 900, h: 4, data: Buffer.alloc(900 * 4 * 4, 255), anchorX: 0, anchorY: 0 };
  const small: Raster[] = Array.from({ length: 3 }, (_, i) => ({ region: `s${i}`, w: 4, h: 4, data: Buffer.alloc(64, 255), anchorX: 0, anchorY: 0 }));
  const { placed, sizes } = packRasters([wide, ...small]);
  for (const p of placed) assert.ok(p.x + p.raster.w + GAP <= sizes[p.page]!, `${p.raster.region} ends at ${p.x + p.raster.w} on a ${sizes[p.page]} px page`);
});

test("a drawing that is not a whole number of pixels at its scale is refused, never stretched", () => {
  assert.throws(() => rasterize({ region: "odd", svg: rect(10, 21, "#000000"), anchor: [0, 0] }, 0.75), /not a whole number of pixels/);
});
