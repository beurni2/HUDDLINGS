// Tests for rasterizing in child processes, from characters/build/raster.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rasterize, type Drawing } from "../atlas.ts";
import { rasterKey, rasterizeAll } from "../raster.ts";

const doc = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="64" viewBox="-40 -56 80 64">${body}</svg>`;
const blob = "M-30 -40C-10 -50 10 -48 26 -36C34 -20 33 -6 22 0C0 2 -24 -4 -34 -18Z";
const good: Drawing = { region: "good/front", svg: doc(`<path d="${blob}" fill="#FFF4E8" stroke="#91694A"/>`), anchor: [40, 56] };
const other: Drawing = { region: "other/front", svg: doc(`<circle cx="0" cy="-20" r="15" fill="#D9A379"/>`), anchor: [40, 20] };
// The shape that aborts resvg 2.6.2 (geom.rs:27): a rect far larger than the canvas under a mask holding a blur.
const crash: Drawing = {
  region: "crash/front",
  anchor: [0, 0],
  svg: doc(`<defs><clipPath id="c"><path d="${blob}"/></clipPath><filter id="b" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3"/></filter>` +
    `<mask id="m" maskUnits="userSpaceOnUse" x="-500" y="-500" width="1000" height="1000"><path d="${blob}" fill="#fff"/><g filter="url(#b)"><path d="${blob}" fill="#000" transform="translate(-8 -8)"/></g></mask></defs>` +
    `<g clip-path="url(#c)" style="isolation:isolate"><path d="${blob}" fill="#FFF4E8"/><rect x="-500" y="-500" width="1000" height="1000" fill="#fdeddc" mask="url(#m)" style="mix-blend-mode:multiply"/></g>`),
};

test("child processes draw the same pixels as the build's own process", async () => {
  const rasters = await rasterizeAll([good, other], [1, 3]);
  for (const d of [good, other]) {
    for (const scale of [1, 3]) {
      const here = rasterize(d, scale), there = rasters.get(`${scale}:${d.region}`)!;
      assert.deepEqual({ ...there, data: undefined }, { ...here, data: undefined });
      assert.ok(Buffer.compare(there.data, here.data) === 0, `${d.region} at ${scale}x differs`);
    }
  }
});

test("a drawing that aborts resvg fails the build by name, and only it", async () => {
  await assert.rejects(rasterizeAll([good, crash, other], [3], { batch: 3 }), (error: Error) => {
    assert.match(error.message, /drawing crash\/front at 3x could not be drawn \((killed by SIGABRT|exit 134)/);
    assert.doesNotMatch(error.message, /good|other/);
    return true;
  });
});

test("a drawing the worker refuses is named with the worker's reason", async () => {
  const odd: Drawing = { region: "odd/front", svg: good.svg.replace('width="80"', 'width="80.5"').replace("80 64", "80.5 64"), anchor: [0, 0] };
  await assert.rejects(rasterizeAll([odd], [1]), /drawing odd\/front at 1x could not be drawn \(exit 1: Error: drawing odd\/front: 80.5 × 64 pt at scale 1 is not a whole number of pixels\)/);
});

test("rasters are cached by what makes them, and a cached raster is the one drawn", async () => {
  const cache = mkdtempSync(join(tmpdir(), "raster-cache-"));
  try {
    const first = await rasterizeAll([good], [2], { cache });
    assert.deepEqual(readdirSync(cache), [`${rasterKey(good.svg, 2)}.rgba`]);
    const again = await rasterizeAll([good, { ...good, region: "twin/front", anchor: [10, 10] }], [2], { cache });
    assert.deepEqual(readdirSync(cache), [`${rasterKey(good.svg, 2)}.rgba`], "the same SVG is drawn once");
    assert.ok(Buffer.compare(again.get("2:good/front")!.data, first.get("2:good/front")!.data) === 0);
    // The same pixels under another name keep their own anchor.
    assert.equal(again.get("2:twin/front")!.anchorX, first.get("2:good/front")!.anchorX - 60);
    assert.notEqual(rasterKey(good.svg, 2), rasterKey(good.svg, 3));
    assert.notEqual(rasterKey(good.svg, 2), rasterKey(other.svg, 2));
  } finally {
    rmSync(cache, { recursive: true, force: true });
  }
});
