// The stills renderer (runtime-web/lab/still.ts) on the test character with two
// still clips added: the files follow the contract, the white and black passes
// give the package's own alpha, the ID pass paints each part flat where it draws
// and keeps the clip to head.base, model points land on rootPx + ppp·(x, y), and
// the same still renders the same bytes twice. The reference is composited on the
// CPU straight from the atlas page, for every part drawn unrotated on whole pixels.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PNG } from "pngjs";
import { buildPackage, pngChunks, readSource, writePackage } from "../../characters/build/build.ts";
import type { Clip } from "../src/format.ts";
import { compile, drawList, evaluatePose, type DrawItem } from "../src/rig.ts";
import { MASK_ALPHA } from "../src/renderer.ts";
import { hex, idColour, inPart, largestAlpha, recolour } from "../lab/ids.ts";
import { MARGIN, openStills, type StillInfo, type Stills } from "../lab/still.ts";

const PPP = 3;
const still = (name: string, view: string): Clip => ({ name, lengthMs: 1000, views: { body: [[0, view]], head: [[0, view]] } });
const source = await readSource("test");
const pkg = await buildPackage({ ...source, clips: [...source.clips, still("still_front", "front"), still("still_side.R", "side.R")] });
const set = pkg.atlas.sets.find((s) => s.name === "3x")!;
const pages = set.pages.map((p) => PNG.sync.read(pkg.files.get(p.file)!));
const rig = compile(source.rig);
const views = { body: "front", head: "front" };
// The frame a still shows: the rest pose, springs at rest, default states.
const items = drawList(rig, evaluatePose(rig, { channels: {}, views }), set, { views, states: {} });

const dir = mkdtempSync(join(tmpdir(), "huddlings-still-"));
writePackage(pkg, join(dir, "package"));
let stills: Stills;
let info: StillInfo;
let white: PNG, black: PNG, ids: PNG;
const read = (folder: string, name: string) => readFileSync(join(dir, folder, name));

before(async () => {
  stills = await openStills(join(dir, "package"));
  await stills.load(PPP);
  info = await stills.render("still_front", join(dir, "a"));
  white = PNG.sync.read(read("a", "white.png"));
  black = PNG.sync.read(read("a", "black.png"));
  ids = PNG.sync.read(read("a", "ids.png"));
});
after(async () => {
  await stills?.close();
  rmSync(dir, { recursive: true, force: true });
});

/** A part drawn unrotated on whole pixels, one texel per pixel (3x set at 3 px/pt): where it lands on the canvas. */
interface Placed {
  item: DrawItem;
  left: number;
  top: number;
  w: number;
  h: number;
}

function place(item: DrawItem): Placed | undefined {
  if (item.rows !== 1) return undefined;
  const px = item.positions.map((v, k) => info.rootPx[k % 2]! + PPP * v);
  const whole = px.map(Math.round);
  if (px.some((v, k) => Math.abs(v - whole[k]!) > 1e-9)) return undefined;
  const [l, t, r, t2, l2, b] = whole as [number, number, number, number, number, number];
  if (t !== t2 || l !== l2) return undefined;
  return { item, left: l, top: t, w: r - l, h: b - t };
}

/** A part's texel alpha (0..255) under pixel (i, j). */
function alphaAt(p: Placed, i: number, j: number): number {
  if (i < p.left || i >= p.left + p.w || j < p.top || j >= p.top + p.h) return 0;
  const region = set.regions[p.item.region]!;
  const page = pages[region.page]!;
  return page.data[((region.y + j - p.top) * page.width + region.x + i - p.left) * 4 + 3]!;
}

/** Whether the part's texel under pixel (i, j) is in its part for the ID pass: at least half its region's largest alpha. */
function inItsPart(p: Placed, i: number, j: number): boolean {
  return inPart(alphaAt(p, i, j), largest(p.item.region));
}
const largestOf = new Map<string, number>();
function largest(name: string): number {
  const region = set.regions[name]!;
  if (!largestOf.has(name)) largestOf.set(name, largestAlpha(pages[region.page]!.data, pages[region.page]!.width, region));
  return largestOf.get(name)!;
}

/** The pixels a part's quads could touch, a pixel wider all round. */
function box(item: DrawItem): [number, number, number, number] {
  const xs = item.positions.filter((_, k) => k % 2 === 0).map((v) => info.rootPx[0] + PPP * v);
  const ys = item.positions.filter((_, k) => k % 2 === 1).map((v) => info.rootPx[1] + PPP * v);
  return [Math.floor(Math.min(...xs)) - 1, Math.floor(Math.min(...ys)) - 1, Math.ceil(Math.max(...xs)) + 1, Math.ceil(Math.max(...ys)) + 1];
}

/** Every part placed, its mask's placing, and the bending tail's box, where the CPU reference does not reach. */
function reference() {
  const placed = items.map((item) => [item, place(item)] as const);
  const bent = placed.filter(([, p]) => !p).map(([item]) => item);
  assert.deepEqual(bent.map((i) => i.part), ["tail"], "every part but the bending tail is drawn unrotated on whole pixels");
  const tail = box(bent[0]!);
  const inTail = (i: number, j: number) => i >= tail[0] && i <= tail[2] && j >= tail[1] && j <= tail[3];
  const byPart = new Map(placed.filter(([, p]) => p).map(([item, p]) => [item.part, p!]));
  const maskOf = (p: Placed) => (p.item.clipTo === undefined ? undefined : byPart.get(items[p.item.clipTo]!.part)!);
  return { placed: [...byPart.values()], inTail, byPart, maskOf };
}

const pixel = (png: PNG, i: number, j: number) => [...png.data.subarray((j * png.width + i) * 4, (j * png.width + i) * 4 + 4)];

test("a still writes 8-bit RGBA PNGs and still.json as the contract says", () => {
  assert.equal(info.species, "test");
  assert.equal(info.still, "still_front");
  assert.equal(info.clip, "still_front");
  assert.deepEqual(info.views, views);
  assert.equal(info.ppp, PPP);
  for (const name of ["white", "black", "ids"]) {
    const bytes = read("a", `${name}.png`);
    const png = PNG.sync.read(bytes);
    assert.deepEqual([png.width, png.height], info.sizePx, name);
    for (const bad of ["gAMA", "cHRM", "iCCP", "sRGB"]) assert.ok(!pngChunks(bytes).includes(bad), `${name}.png has ${bad}`);
    assert.equal(bytes[24], 8, `${name}.png bit depth`);
    assert.equal(bytes[25], 6, `${name}.png colour type`);
    for (let k = 3; k < png.data.length; k += 4) assert.equal(png.data[k], 255, `${name}.png is opaque`);
  }
  assert.ok(info.rootPx.every(Number.isInteger));
  assert.deepEqual(JSON.parse(read("a", "still.json").toString("utf8")), info);
  // Every part of the rig, in its order, with its own ID colour; never black, the ID pass's background.
  assert.deepEqual(Object.keys(info.parts), source.rig.parts.map((p) => p.name));
  source.rig.parts.forEach((p, i) => {
    assert.deepEqual(info.parts[p.name], { id: hex(idColour(i)), bone: p.bone, ...(p.clipTo ? { clipTo: p.clipTo } : {}) });
  });
  const colours = Object.values(info.parts).map((p) => p.id);
  assert.equal(new Set(colours).size, colours.length, "ID colours are unique");
  assert.ok(!colours.includes("#000000"));
  assert.deepEqual(info.drawn, items.map((i) => i.part), "drawn is the draw list, in order");
  // The whole character fits with the margin to spare.
  const xs = items.flatMap((i) => i.positions.filter((_, k) => k % 2 === 0)).map((v) => info.rootPx[0] + PPP * v);
  const ys = items.flatMap((i) => i.positions.filter((_, k) => k % 2 === 1)).map((v) => info.rootPx[1] + PPP * v);
  assert.ok(Math.min(...xs) >= MARGIN * PPP && Math.min(...ys) >= MARGIN * PPP, "margin left and top");
  assert.ok(Math.max(...xs) <= info.sizePx[0] - MARGIN * PPP && Math.max(...ys) <= info.sizePx[1] - MARGIN * PPP, "margin right and bottom");
});

test("alpha from the white and black passes is the package's own alpha", (t) => {
  const { placed, inTail, maskOf } = reference();
  const [w, h] = info.sizePx;
  let worst = 0, compared = 0, soft = 0;
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const W = pixel(white, i, j), B = pixel(black, i, j);
      // Over white and over black every channel moves by the same 255·(1 − alpha).
      const gaps = [0, 1, 2].map((c) => W[c]! - B[c]!);
      assert.ok(Math.max(...gaps) - Math.min(...gaps) <= 1 && Math.min(...gaps) >= 0, `pixel ${i}, ${j}: white ${W} and black ${B} disagree`);
      if (inTail(i, j)) continue;
      // Premultiplied "over" in draw order, a clipped part only where its mask's alpha is 0.05 or more.
      let alpha = 0;
      for (const p of placed) {
        const mask = maskOf(p);
        if (mask && alphaAt(mask, i, j) / 255 < MASK_ALPHA) continue;
        const a = alphaAt(p, i, j) / 255;
        alpha = a + (1 - a) * alpha;
      }
      const measured = 1 - (gaps[0]! + gaps[1]! + gaps[2]!) / 3 / 255;
      worst = Math.max(worst, Math.abs(measured - alpha));
      compared++;
      if (alpha > 0 && alpha < 1) soft++;
    }
  }
  t.diagnostic(`alpha: ${compared} pixels (${soft} soft), worst difference ${(worst * 255).toFixed(2)}/255`);
  assert.ok(soft > 1000, "the comparison covers soft edges and the shadow");
  assert.ok(worst <= 2 / 255, `alpha differs by up to ${(worst * 255).toFixed(2)}/255`);
});

test("the ID pass paints each part flat where its alpha is half its largest or more, inside its mask", () => {
  const { placed, inTail, byPart, maskOf } = reference();
  const [w, h] = info.sizePx;
  const colourOf = new Map(Object.entries(info.parts).map(([name, p]) => [p.id, name]));
  let wrong = 0;
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const got = hex(pixel(ids, i, j).slice(0, 3));
      assert.ok(got === "#000000" || colourOf.has(got), `pixel ${i}, ${j} is ${got}, no part's colour`);
      if (inTail(i, j)) continue;
      // The topmost part at half its largest alpha or more there, whose mask (cut the same way in this pass) covers it.
      let want = "#000000";
      for (const p of placed) {
        const mask = maskOf(p);
        if (mask && !inItsPart(mask, i, j)) continue;
        if (inItsPart(p, i, j)) want = info.parts[p.item.part]!.id;
      }
      if (got !== want) wrong++;
    }
  }
  assert.equal(wrong, 0, `${wrong} pixels show the wrong part`);
  // The stripe runs past the head on both sides; there the clip hides it.
  const marking = byPart.get("head.marking")!, head = byPart.get("head.base")!;
  let outside = 0, shown = 0;
  for (let j = marking.top; j < marking.top + marking.h; j++) {
    for (let i = marking.left; i < marking.left + marking.w; i++) {
      if (!inItsPart(marking, i, j)) continue;
      const here = hex(pixel(ids, i, j).slice(0, 3));
      if (!inItsPart(head, i, j)) {
        outside++;
        assert.notEqual(here, info.parts["head.marking"]!.id, `the stripe shows outside head.base at ${i}, ${j}`);
      } else if (here === info.parts["head.marking"]!.id) shown++;
    }
  }
  assert.ok(outside > 500 && shown > 1000, `stripe: ${outside} pixels outside the head, ${shown} shown inside`);
  for (const eye of ["eye.L", "eye.R"]) assert.ok(ids.data.some((_, k) => k % 4 === 0 && hex([...ids.data.subarray(k, k + 3)]) === info.parts[eye]!.id), `${eye} shows`);
});

test("model points land on rootPx + ppp·(x, y)", () => {
  // Round parts on the head bone, centred on known model points (the test drawings; the head's pivot is at (0, -62)).
  const centres: Record<string, [number, number]> = { nose: [0, -98], "eye.L": [18, -112], "eye.R": [-18, -112] };
  const head = evaluatePose(rig, { channels: {}, views }).world[rig.index.get("head")!]!;
  assert.deepEqual([head.tx, head.ty], [0, -62]);
  /** The centroid of pixel centres where a test holds, in pixels. */
  const centroid = (w: number, h: number, hit: (i: number, j: number) => boolean) => {
    let n = 0, sx = 0, sy = 0;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (hit(i, j)) (n++, (sx += i + 0.5), (sy += j + 0.5));
    return [sx / n, sy / n, n] as const;
  };
  for (const [part, [x, y]] of Object.entries(centres)) {
    const [cx, cy, n] = centroid(ids.width, ids.height, (i, j) => hex(pixel(ids, i, j).slice(0, 3)) === info.parts[part]!.id);
    assert.ok(n > 50, `${part} draws`);
    // Exactly where its own raster puts it, relative to the pivot: the placing is exact.
    const item = items.find((i) => i.part === part)!;
    const region = set.regions[item.region]!;
    const page = pages[region.page]!;
    const most = largestAlpha(page.data, page.width, region);
    const [rx, ry] = centroid(region.w, region.h, (i, j) => inPart(page.data[((region.y + j) * page.width + region.x + i) * 4 + 3]!, most));
    const exact = [info.rootPx[0] + PPP * head.tx + rx - region.anchorX, info.rootPx[1] + PPP * head.ty + ry - region.anchorY];
    assert.ok(Math.abs(cx - exact[0]!) < 1e-9 && Math.abs(cy - exact[1]!) < 1e-9, `${part} at ${cx}, ${cy}, its raster puts it at ${exact}`);
    // And on its model point, within resvg's own antialiasing bias (0.07 px down for the nose at 3x).
    const model = [info.rootPx[0] + PPP * x, info.rootPx[1] + PPP * y];
    assert.ok(Math.abs(cx - model[0]!) <= 0.1 && Math.abs(cy - model[1]!) <= 0.1, `${part} centred at ${cx}, ${cy}, its model point is at ${model}`);
  }
});

test("the same still renders the same bytes again, after another still", async () => {
  await stills.render("still_side.R", join(dir, "side"));
  await stills.render("still_front", join(dir, "b"));
  for (const name of ["white.png", "black.png", "ids.png", "still.json"]) assert.ok(read("a", name).equals(read("b", name)), `${name} changed`);
  assert.notDeepEqual(read("side", "white.png"), read("a", "white.png"));
});

test("a clip that does not set both views is not a still", async () => {
  await assert.rejects(stills.render("idle", join(dir, "idle")), /idle must set both the body and the head view/);
  await assert.rejects(stills.render("still_back", join(dir, "back")), /no clip still_back/);
});

/** Loads another package in the same page for the length of a test, then the test's own again. */
async function withPackage(other: typeof pkg, ppp: number, run: () => Promise<void>): Promise<void> {
  writePackage(other, join(dir, "package"));
  try {
    await stills.load(ppp);
    await run();
  } finally {
    writePackage(pkg, join(dir, "package"));
    await stills.load(PPP);
  }
}

test("a pass that fails leaves the still's folder as it was, and no half-written folder beside it", async () => {
  // Two parts sharing a region build, but the ID pass refuses them: the third pass fails after white and black.
  const left = source.rig.parts.find((p) => p.name === "eye.L")!;
  const parts = source.rig.parts.map((p) => (p.name === "eye.R" ? { ...p, regions: { ...p.regions, "front:open": left.regions["front:open"]! } } : p));
  const shared = await buildPackage({ ...source, clips: [...source.clips, still("still_front", "front")], rig: { ...source.rig, parts }, drawings: source.drawings.filter((d) => d.region !== "eye.R/front:open") });
  const out = join(dir, "kept");
  await stills.render("still_front", out);
  const before = new Map(readdirSync(out).map((name) => [name, readFileSync(join(out, name))]));
  await withPackage(shared, PPP, async () => {
    await assert.rejects(stills.render("still_front", out), /region eye\.L\/front:open belongs to both eye\.L and eye\.R/);
  });
  assert.deepEqual(readdirSync(out).sort(), [...before.keys()].sort());
  for (const [name, bytes] of before) assert.ok(readFileSync(join(out, name)).equals(bytes), `${name} changed`);
  assert.deepEqual(readdirSync(dir).filter((name) => name.includes("partial")), []);
});

test("a canvas Chromium will not give at full size fails instead of drawing the still smaller", async () => {
  await withPackage(pkg, 60, async () => {
    await assert.rejects(stills.render("still_front", join(dir, "huge")), /Chromium gave the canvas \d+ × \d+ px, not the \d+ × \d+ px the still needs/);
  });
  assert.ok(!existsSync(join(dir, "huge")));
});

test("the ID pages keep each region's texels from half its largest alpha up, its ring included, and nothing else", () => {
  // A 10 × 4 page: a 3 × 2 region at (4, 1) with alphas 127, 128, 255 on each row, an opaque texel two to its left (the ring) and three to its right (not).
  const page = new Uint8Array(10 * 4 * 4);
  const alpha = (x: number, y: number, a: number) => page.set([9, 9, 9, a], (y * 10 + x) * 4);
  for (const y of [1, 2]) [127, 128, 255].forEach((a, k) => alpha(4 + k, y, a));
  alpha(2, 1, 255);
  alpha(9, 1, 255);
  const out = recolour(page, 10, 4, [{ x: 4, y: 1, w: 3, h: 2, colour: [10, 20, 30] }]);
  const at = (x: number, y: number) => [...out.subarray((y * 10 + x) * 4, (y * 10 + x) * 4 + 4)];
  assert.deepEqual(at(4, 1), [0, 0, 0, 0], "127 is below half of 255");
  assert.deepEqual(at(5, 1), [10, 20, 30, 255], "128 is half of 255 or more");
  assert.deepEqual(at(6, 2), [10, 20, 30, 255]);
  assert.deepEqual(at(2, 1), [10, 20, 30, 255], "the ring");
  assert.deepEqual(at(9, 1), [0, 0, 0, 0], "outside the ring");
  // A soft region (a shadow at 0.18, the blush at its level) is cut at half its own largest alpha, not at 0.5.
  const soft = new Uint8Array(10 * 4 * 4);
  [0, 22, 23, 46].forEach((a, k) => soft.set([9, 9, 9, a], (1 * 10 + 4 + k) * 4));
  const shadow = recolour(soft, 10, 4, [{ x: 4, y: 1, w: 4, h: 1, colour: [10, 20, 30] }]);
  const of = (x: number) => shadow[(1 * 10 + x) * 4 + 3];
  assert.deepEqual([4, 5, 6, 7].map(of), [0, 0, 255, 255], "of 46: 0 and 22 are out, 23 and 46 in");
  assert.deepEqual([inPart(0, 0), inPart(1, 1), inPart(64, 128), inPart(63, 128)], [false, true, true, false]);
});

test("the ground shadow, a soft part, shows in the ID pass", () => {
  // The test character's shadow is 0.18 opaque: under the old 0.5 cut it never showed.
  const shadow = info.parts.shadow!.id;
  let n = 0;
  for (let k = 0; k < ids.data.length; k += 4) if (hex([...ids.data.subarray(k, k + 3)]) === shadow) n++;
  assert.ok(n > 1000, `the shadow shows on ${n} pixels`);
});

test("ID colours are fixed by a part's index, distinct and never black", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 1024; i++) {
    const c = idColour(i);
    assert.ok(Math.max(...c) >= 160, `colour ${i} is too dark`);
    seen.add(hex(c));
  }
  assert.equal(seen.size, 1024);
  assert.equal(hex(idColour(0)), "#ff0000");
});
