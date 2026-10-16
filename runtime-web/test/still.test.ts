// The stills renderer (runtime-web/lab/still.ts) on the test character with three
// still clips added: the files follow the contract, the white and black passes
// give the package's own alpha (times each part's), the ID pass paints each part's
// footprint flat, at any alpha above 0 and never at 0, and keeps the clip to
// head.base, whatever the parts' alphas (the dog's blush too), model points land on rootPx + ppp·(x, y), and the same still renders the same
// bytes twice. The reference is composited on the
// CPU straight from the atlas page, for every part drawn unrotated on whole pixels.
// A still never comes out half-written or at another size, and the look loop
// (look.ts) never reads a crash of the sheet match as failed checks; its faces
// mode renders every face clip with the rest front and checks each.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import { buildPackage, pngChunks, readSource, writePackage } from "../../characters/build/build.ts";
import type { Clip } from "../src/format.ts";
import { compile, drawList, evaluatePose, type DrawItem } from "../src/rig.ts";
import { MASK_ALPHA } from "../src/renderer.ts";
import { hex, idColour, inPart, largestAlpha, MASK_ONLY, recolour } from "../lab/ids.ts";
import { faceClips, failures, lookFaces, matchVerdict } from "../lab/look.ts";
import { MARGIN, openStills, type StillInfo, type Stills } from "../lab/still.ts";

const PPP = 3;
const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const still = (name: string, view: string): Clip => ({ name, lengthMs: 1000, views: { body: [[0, view]], head: [[0, view]] } });
// The front with parts faded: the mask head.base (its own ID colour gone, its clip group whole), a clipped
// part, the soft shadow, and an eye at 0.
const fadedAlpha: Record<string, number> = { "head.base": 0.3, "head.marking": 0.6, shadow: 0.5, "eye.L": 0, nose: 0.9 };
const faded: Clip = { ...still("still_faded", "front"), alpha: Object.fromEntries(Object.entries(fadedAlpha).map(([part, a]) => [part, [[0, a]]])) };
const source = await readSource("test");
const pkg = await buildPackage({ ...source, clips: [...source.clips, still("still_front", "front"), still("still_side.R", "side.R"), faded] });
const set = pkg.atlas.sets.find((s) => s.name === "3x")!;
const pages = set.pages.map((p) => PNG.sync.read(pkg.files.get(p.file)!));
const rig = compile(source.rig);
const views = { body: "front", head: "front" };
// The frame a still shows: the rest pose, springs at rest, default states; and the faded one, each part at its alpha.
const items = drawList(rig, evaluatePose(rig, { channels: {}, views }), set, { views, states: {} });
const fadedItems = drawList(rig, evaluatePose(rig, { channels: {}, views }), set, { views, states: {}, alpha: fadedAlpha });

const dir = mkdtempSync(join(tmpdir(), "huddlings-still-"));
writePackage(pkg, join(dir, "package"));
let stills: Stills;
let info: StillInfo;
let white: PNG, black: PNG, ids: PNG;
/** A rendered still with the draw list it shows. */
interface Shot {
  info: StillInfo;
  items: DrawItem[];
  white: PNG;
  black: PNG;
  ids: PNG;
}
let front: Shot, fadedShot: Shot;
const read = (folder: string, name: string) => readFileSync(join(dir, folder, name));

async function shoot(name: string, folder: string, shown: DrawItem[]): Promise<Shot> {
  const still = await stills.render(name, join(dir, folder));
  return { info: still, items: shown, white: PNG.sync.read(read(folder, "white.png")), black: PNG.sync.read(read(folder, "black.png")), ids: PNG.sync.read(read(folder, "ids.png")) };
}

before(async () => {
  stills = await openStills(join(dir, "package"));
  await stills.load(PPP);
  front = await shoot("still_front", "a", items);
  ({ info, white, black, ids } = front);
  fadedShot = await shoot("still_faded", "faded", fadedItems);
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

function place(item: DrawItem, at = info): Placed | undefined {
  if (item.rows !== 1) return undefined;
  const px = item.positions.map((v, k) => at.rootPx[k % 2]! + PPP * v);
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

/**
 * Whether the part's texel under pixel (i, j) is in its part for the ID pass: at least half its region's largest
 * alpha, while the part draws at all (its alpha above 0); as a mask, whatever its own alpha.
 */
function inItsPart(p: Placed, i: number, j: number, asMask = false): boolean {
  return inPart(alphaAt(p, i, j), largest(p.item.region), asMask ? 1 : p.item.alpha);
}
const largestOf = new Map<string, number>();
function largest(name: string): number {
  const region = set.regions[name]!;
  if (!largestOf.has(name)) largestOf.set(name, largestAlpha(pages[region.page]!.data, pages[region.page]!.width, region));
  return largestOf.get(name)!;
}

/** The pixels a part's quads could touch, a pixel wider all round. */
function box(item: DrawItem, at = info): [number, number, number, number] {
  const xs = item.positions.filter((_, k) => k % 2 === 0).map((v) => at.rootPx[0] + PPP * v);
  const ys = item.positions.filter((_, k) => k % 2 === 1).map((v) => at.rootPx[1] + PPP * v);
  return [Math.floor(Math.min(...xs)) - 1, Math.floor(Math.min(...ys)) - 1, Math.ceil(Math.max(...xs)) + 1, Math.ceil(Math.max(...ys)) + 1];
}

/** Every part placed, its mask's placing, and the bending tail's box, where the CPU reference does not reach. */
function reference(shot = front) {
  const placed = shot.items.map((item) => [item, place(item, shot.info)] as const);
  const bent = placed.filter(([, p]) => !p).map(([item]) => item);
  assert.deepEqual(bent.map((i) => i.part), ["tail"], "every part but the bending tail is drawn unrotated on whole pixels");
  const tail = box(bent[0]!, shot.info);
  const inTail = (i: number, j: number) => i >= tail[0] && i <= tail[2] && j >= tail[1] && j <= tail[3];
  const byPart = new Map(placed.filter(([, p]) => p).map(([item, p]) => [item.part, p!]));
  const maskOf = (p: Placed) => (p.item.clipTo === undefined ? undefined : byPart.get(shot.items[p.item.clipTo]!.part)!);
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

/**
 * The white and black passes' alpha against the CPU's: premultiplied "over" in draw order, each texel times its part's
 * alpha. Over white and over black every channel moves by the same 255·(1 − alpha), give or take the 8-bit rounding of
 * each translucent layer, `spread` at most.
 */
function alphaCheck(shot: Shot, spread = 1) {
  const { info, white, black } = shot;
  const { placed, inTail, maskOf } = reference(shot);
  const [w, h] = info.sizePx;
  let worst = 0, compared = 0, soft = 0, widest = 0;
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const W = pixel(white, i, j), B = pixel(black, i, j);
      const gaps = [0, 1, 2].map((c) => W[c]! - B[c]!);
      widest = Math.max(widest, Math.max(...gaps) - Math.min(...gaps));
      assert.ok(Math.max(...gaps) - Math.min(...gaps) <= spread && Math.min(...gaps) >= 0, `pixel ${i}, ${j}: white ${W} and black ${B} disagree`);
      if (inTail(i, j)) continue;
      // Premultiplied "over" in draw order, a clipped part only where its mask's own texel alpha is 0.05 or more.
      let alpha = 0;
      for (const p of placed) {
        const mask = maskOf(p);
        if (mask && alphaAt(mask, i, j) / 255 < MASK_ALPHA) continue;
        const a = (alphaAt(p, i, j) / 255) * p.item.alpha;
        alpha = a + (1 - a) * alpha;
      }
      const measured = 1 - (gaps[0]! + gaps[1]! + gaps[2]!) / 3 / 255;
      worst = Math.max(worst, Math.abs(measured - alpha));
      compared++;
      if (alpha > 0 && alpha < 1) soft++;
    }
  }
  return { worst, compared, soft, widest };
}

test("alpha from the white and black passes is the package's own alpha", (t) => {
  const { worst, compared, soft } = alphaCheck(front);
  t.diagnostic(`alpha: ${compared} pixels (${soft} soft), worst difference ${(worst * 255).toFixed(2)}/255`);
  assert.ok(soft > 1000, "the comparison covers soft edges and the shadow");
  assert.ok(worst <= 2 / 255, `alpha differs by up to ${(worst * 255).toFixed(2)}/255`);
});

/**
 * The ID pass against the CPU's: each pixel the topmost part above alpha 0 whose texel is half its region's largest
 * or more, where its mask (cut the same way, whatever its alpha) covers it. Returns the pixels that differ.
 */
function idCheck(shot: Shot): number {
  const { info, ids } = shot;
  const { placed, inTail, maskOf } = reference(shot);
  const [w, h] = info.sizePx;
  const colourOf = new Map(Object.entries(info.parts).map(([name, p]) => [p.id, name]));
  let wrong = 0;
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const got = hex(pixel(ids, i, j).slice(0, 3));
      assert.ok(got === "#000000" || colourOf.has(got), `pixel ${i}, ${j} is ${got}, no part's colour`);
      if (inTail(i, j)) continue;
      let want = "#000000";
      for (const p of placed) {
        const mask = maskOf(p);
        if (mask && !inItsPart(mask, i, j, true)) continue;
        if (inItsPart(p, i, j)) want = info.parts[p.item.part]!.id;
      }
      if (got !== want) wrong++;
    }
  }
  return wrong;
}

/** How many pixels of the ID pass show a part. */
const idPixels = (shot: Shot, part: string) => {
  let n = 0;
  for (let k = 0; k < shot.ids.data.length; k += 4) if (hex([...shot.ids.data.subarray(k, k + 3)]) === shot.info.parts[part]!.id) n++;
  return n;
};

test("the ID pass paints each part flat where its alpha is half its largest or more, inside its mask", () => {
  const { byPart } = reference();
  const wrong = idCheck(front);
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

test("a still draws each part at its alpha; in the ID pass a part above 0 keeps its whole footprint, one at 0 none, and a faded mask still clips whole", (t) => {
  assert.deepEqual(Object.fromEntries(fadedItems.filter((i) => i.alpha !== 1).map((i) => [i.part, i.alpha])), fadedAlpha, "the faded still's draw list holds each part's alpha");
  assert.deepEqual(fadedShot.info.drawn, items.map((i) => i.part), "a part at alpha 0 stays in the draw list");
  // Up to three translucent layers stack here (the body, head.base at 0.3, the marking at 0.6), each rounded to 8 bits
  // over white and over black on its own, so the channels' gaps may differ by 2 where the opaque front's differ by 1.
  const { worst, compared, widest } = alphaCheck(fadedShot, 2);
  t.diagnostic(`faded alpha: ${compared} pixels, worst difference ${(worst * 255).toFixed(2)}/255, channel gaps apart by up to ${widest}`);
  assert.ok(worst <= 2 / 255, `alpha differs by up to ${(worst * 255).toFixed(2)}/255`);
  assert.ok(!fadedShot.white.data.equals(front.white.data), "the faded still looks different");
  const wrong = idCheck(fadedShot);
  assert.equal(wrong, 0, `${wrong} pixels show the wrong part`);
  // The level is white's and black's; the ID pass shows where each part is. Every pixel shows the part it shows at
  // full alpha, but eye.L's, at 0: there the part under it shows, inside its mask, so the clip group is whole.
  assert.equal(idPixels(fadedShot, "eye.L"), 0, "an eye at 0");
  const eye = info.parts["eye.L"]!.id;
  let changed = 0;
  for (let k = 0; k < ids.data.length; k += 4) {
    const before = hex([...ids.data.subarray(k, k + 3)]), after = hex([...fadedShot.ids.data.subarray(k, k + 3)]);
    if (before === eye) {
      changed++;
      assert.ok([info.parts["head.base"]!.id, info.parts["head.marking"]!.id].includes(after), `under eye.L at pixel ${k / 4} shows ${after}`);
    } else assert.equal(after, before, `pixel ${k / 4}`);
  }
  assert.ok(changed > 100, `eye.L covered ${changed} pixels`);
  // Each faded part keeps the pixels it showed at 1, the mask head.base at 0.3 and the soft shadow at 0.5 among them.
  for (const part of ["head.base", "head.marking", "shadow", "nose", "eye.R"]) assert.ok(idPixels(fadedShot, part) >= idPixels(front, part) && idPixels(front, part) > 0, part);
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

test("the ID pages hold a part's footprint, never its level: any alpha above 0 draws all of it, 0 only masks", () => {
  // A 4 × 1 region with alphas 127, 128, 200, 255 (largest 255): its footprint is a ≥ 127.5, whatever the part's alpha.
  const page = new Uint8Array(6 * 1 * 4);
  [127, 128, 200, 255].forEach((a, k) => page.set([9, 9, 9, a], (1 + k) * 4));
  const at = (alpha: number) => {
    const out = recolour(page, 6, 1, [{ x: 1, y: 0, w: 4, h: 1, colour: [10, 20, 30], alpha }]);
    return [1, 2, 3, 4].map((x) => out[x * 4 + 3]);
  };
  assert.deepEqual(at(1), [0, 255, 255, 255], "at full alpha as before");
  assert.deepEqual(at(0.35), [0, 255, 255, 255], "the blush's level keeps the whole footprint");
  assert.deepEqual(at(0.01), [0, 255, 255, 255]);
  assert.deepEqual(at(0), [0, MASK_ONLY, MASK_ONLY, MASK_ONLY], "at 0 the part only masks");
  assert.ok(MASK_ONLY / 255 >= MASK_ALPHA && MASK_ONLY / 255 < 0.5, "the renderer's mask cut keeps MASK_ONLY, and the ID pass's colour cut leaves it out");
  // A soft region's core (a blush drawn soft, largest 46) at 0.35 as at 1.
  assert.deepEqual([inPart(23, 46, 0.35), inPart(22, 46, 0.35), inPart(255, 255, 0.5), inPart(128, 255, 0.5), inPart(255, 255, 0)], [true, false, true, true, false]);
});

test("the ID pass shows the dog's blush by its footprint, never its level: keyed at 0.35 all of it, at 0 none, and its clip group's IDs unchanged", async () => {
  // The blush is drawn soft and rests at its sheet's level (model.json's blush), its alpha by the rig or a clip
  // (spec L474: 0 to 100%). The sheet match finds it in ids.png, and reads its level from white.png and black.png.
  const dog = await readSource("dog");
  const front = dog.clips.find((c) => c.name === "still_front")!;
  const blushAt = (name: string, level: number): Clip => ({ ...front, name, alpha: { "blush.L": [[0, level]], "blush.R": [[0, level]] } });
  const dogPkg = await buildPackage({ ...dog, clips: [...dog.clips, blushAt("still_blush35", 0.35), blushAt("still_blush0", 0)] });
  const shots: Record<string, { info: StillInfo; ids: PNG; white: PNG }> = {};
  await withPackage(dogPkg, PPP, async () => {
    for (const name of ["still_front", "still_blush35", "still_blush0"]) {
      const info = await stills.render(name, join(dir, `dog-${name}`));
      shots[name] = { info, ids: PNG.sync.read(read(`dog-${name}`, "ids.png")), white: PNG.sync.read(read(`dog-${name}`, "white.png")) };
    }
  });
  const { info: dogInfo } = shots.still_front!;
  const count = (png: PNG, part: string) => {
    let n = 0;
    for (let k = 0; k < png.data.length; k += 4) if (hex([...png.data.subarray(k, k + 3)]) === dogInfo.parts[part]!.id) n++;
    return n;
  };
  for (const cheek of ["blush.L", "blush.R"]) assert.ok(count(shots.still_front!.ids, cheek) > 200, `${cheek} shows at rest`);
  // At 0.35 the blush shows in the frame (against none at 0: the rig's rest alpha may itself be 0.35), and the ID pass
  // is the rest still's, byte for byte.
  assert.ok(!shots.still_blush35!.white.data.equals(shots.still_blush0!.white.data), "the blush's level shows in white.png");
  assert.ok(shots.still_blush35!.ids.data.equals(shots.still_front!.ids.data), "the blush at 0.35 keeps its whole footprint");
  // At 0 no blush pixel is left; every other pixel is as before, and where a cheek was, its mask's group shows through.
  const blush = new Set(["blush.L", "blush.R"].map((p) => dogInfo.parts[p]!.id));
  const group = new Set(Object.entries(dogInfo.parts).filter(([name, p]) => name === "head.base" || p.clipTo === "head.base").map(([, p]) => p.id));
  const [rest, gone] = [shots.still_front!.ids.data, shots.still_blush0!.ids.data];
  let under = 0;
  for (let k = 0; k < rest.length; k += 4) {
    const before = hex([...rest.subarray(k, k + 3)]), after = hex([...gone.subarray(k, k + 3)]);
    assert.ok(!blush.has(after), `a blush pixel at alpha 0, pixel ${k / 4}`);
    if (blush.has(before)) {
      under++;
      assert.ok(group.has(after) && !blush.has(after), `under the cheek at pixel ${k / 4} shows ${after}, not head.base or its group`);
    } else assert.equal(after, before, `pixel ${k / 4} changed`);
  }
  assert.equal(under, count(shots.still_front!.ids, "blush.L") + count(shots.still_front!.ids, "blush.R"));
});

test("the ground shadow, a soft part, shows in the ID pass", () => {
  // The test character's shadow is 0.18 opaque: under the old 0.5 cut it never showed.
  const shadow = info.parts.shadow!.id;
  let n = 0;
  for (let k = 0; k < ids.data.length; k += 4) if (hex([...ids.data.subarray(k, k + 3)]) === shadow) n++;
  assert.ok(n > 1000, `the shadow shows on ${n} pixels`);
});

test("the look loop reads a crash of the sheet match as a crash, never as the last run's checks", async () => {
  const out = join(dir, "look");
  mkdirSync(out, { recursive: true });
  const json = join(out, "match.json");
  const stale = JSON.stringify({ silhouette: { pass: false }, landmarks: { pass: true }, pass: false });
  // A stand-in for match.py: writes what it is given into match.json, if anything, and exits with a code.
  const matcher = (code: number, written?: unknown) =>
    ["-e", `${written === undefined ? "" : `require("fs").writeFileSync(${JSON.stringify(json)}, ${JSON.stringify(JSON.stringify(written))});`} console.error("said"); process.exit(${code});`];
  writeFileSync(json, stale);
  const crash = await matchVerdict(process.execPath, matcher(2), out);
  assert.equal(crash.verdict, "error");
  assert.match(crash.text, /^ERROR the sheet match crashed \(exit 2\): said/);
  assert.ok(!existsSync(json), "the old match.json is deleted before the match runs");
  writeFileSync(json, stale);
  const silent = await matchVerdict(process.execPath, matcher(1), out);
  assert.equal(silent.verdict, "error", "a 1 with no match.json of its own is not failed checks");
  assert.match(silent.text, /left no readable match.json/);
  const failed = await matchVerdict(process.execPath, matcher(1, { blush: { pass: false, cheeks: [{ name: "L", pass: false }] }, advisory: { gating: false, x: { pass: false } }, pass: false }), out);
  assert.deepEqual(failed, { verdict: "fail", text: "FAIL blush.cheeks.L" });
  assert.deepEqual(await matchVerdict(process.execPath, matcher(0, { pass: true }), out), { verdict: "pass", text: "pass" });
  assert.deepEqual(failures({ a: { pass: false }, b: [{ name: "x", pass: false }], c: { gating: false, pass: false } }), ["a", "b.x"]);
});

test("the look loop's faces mode checks every face clip against the rest front, and passes a package with none", async () => {
  // The test character with three face clips. A stand-in for facematch.py checks it was handed the face's still and
  // the rest front's, writes a match.json with a summary and exits by preset: happy passes, sly fails, shy crashes.
  const facesDir = join(dir, "faces-package");
  writePackage(await buildPackage({ ...source, clips: [...source.clips, still("still_front", "front"), ...["happy", "sly", "shy"].map((p) => still(`face_${p}`, "front"))] }), facesDir);
  assert.deepEqual(faceClips(facesDir), ["happy", "shy", "sly"]);
  assert.deepEqual(faceClips(join(dir, "package")), []);
  const script = `const fs = require("fs"), path = require("path"); const [still, rest, out] = process.argv.slice(1);
    const clip = JSON.parse(fs.readFileSync(path.join(still, "still.json"))).clip, restClip = JSON.parse(fs.readFileSync(path.join(rest, "still.json"))).clip;
    if (restClip !== "still_front") process.exit(3);
    const code = { face_happy: 0, face_sly: 1, face_shy: 2 }[clip];
    if (code < 2) { fs.mkdirSync(out, { recursive: true }); fs.writeFileSync(path.join(out, "match.json"), JSON.stringify({ pass: code === 0, summary: (code ? "FAIL: " : "pass: ") + clip })); }
    else console.error("crashed");
    process.exit(code);`;
  const matcher = (stillDir: string, rest: string, out: string): [string, string[]] => [process.execPath, ["-e", script, stillDir, rest, out]];
  const facesStills = await openStills(facesDir);
  try {
    await facesStills.load(PPP);
    const result = await lookFaces(facesStills, { packageDir: facesDir, stillsDir: join(dir, "face-stills"), qa: join(dir, "face-qa"), matcher });
    assert.equal(result.verdict, "error", "a crash outranks a failed face");
    assert.equal(result.lines.length, 3);
    assert.match(result.lines[0]!, /^happy {2}pass: face_happy {2}· /);
    assert.match(result.lines[1]!, /^shy {4}ERROR the sheet match crashed \(exit 2\): crashed/);
    assert.match(result.lines[2]!, /^sly {4}FAIL: face_sly {2}· /);
    assert.equal(JSON.parse(readFileSync(join(dir, "face-stills", "faces", "sly", "still.json"), "utf8")).clip, "face_sly");
    assert.equal(JSON.parse(readFileSync(join(dir, "face-stills", "front", "still.json"), "utf8")).clip, "still_front");
    const passing = await lookFaces(facesStills, { packageDir: facesDir, stillsDir: join(dir, "face-stills"), qa: join(dir, "face-qa"),
      matcher: (stillDir, rest, out) => (stillDir.endsWith("shy") ? matcher(stillDir.replace(/shy$/, "happy"), rest, out) : matcher(stillDir, rest, out)) });
    assert.equal(passing.verdict, "fail", "a failed face with no crash is a failure");
  } finally {
    await facesStills.close();
  }
  // A package with no face clip says so and passes.
  const none = await lookFaces(stills, { packageDir: join(dir, "package"), stillsDir: join(dir, "face-stills"), qa: join(dir, "face-qa"), matcher });
  assert.deepEqual(none, { verdict: "pass", lines: ["the package holds no face_<preset> clip, so no face is checked"] });
});

test("the command draws any built package, and several stills each into its own folder, the same bytes as one", () => {
  // blushcal.py renders a calibration package beside the built one, many stills in one Chromium.
  const out = join(dir, "cli");
  const run = spawnSync(process.execPath, [join(repo, "runtime-web/lab/still.ts"), "--package", join(dir, "package"), "--ppp", String(PPP), "--out", out,
    "--still", "still_front", "--still", "still_side.R"], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(readdirSync(out).sort(), ["still_front", "still_side.R"]);
  for (const name of ["white.png", "black.png", "ids.png"]) assert.ok(readFileSync(join(out, "still_front", name)).equals(read("a", name)), name);
  const one = spawnSync(process.execPath, [join(repo, "runtime-web/lab/still.ts"), "--package", join(dir, "package"), "--ppp", String(PPP), "--out", join(dir, "cli-one"),
    "--still", "still_side.R"], { encoding: "utf8" });
  assert.equal(one.status, 0, one.stderr);
  assert.ok(existsSync(join(dir, "cli-one", "still.json")), "one still goes into --out itself");
  const none = spawnSync(process.execPath, [join(repo, "runtime-web/lab/still.ts"), "--package", join(dir, "nothing"), "--still", "still_front", "--out", join(dir, "cli-none")], { encoding: "utf8" });
  assert.equal(none.status, 1);
  assert.match(none.stderr, /no package at/);
});

test("render.ts --stills poses each still as still.ts does, on the frames' stage: the same pixels, moved by whole pixels", () => {
  // The WebGL side of the dog's parity (ios.yml): every still and face clip of a package, into <out>/<clip>.png.
  const out = join(dir, "parity-stills");
  // Wide and tall enough for the test character at 3 px/pt with the root 24 px above the foot.
  const size = 600;
  const run = spawnSync(process.execPath, [join(repo, "runtime-web/lab/render.ts"), "--stills", "--package", join(dir, "package"), "--out", out,
    "--size", String(size), "--ppp", String(PPP), "--set", "3x"], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(readdirSync(out).sort(), ["report.json", "soft.json", "still_faded.png", "still_front.png", "still_side.R.png"]);
  const frame = PNG.sync.read(readFileSync(join(out, "still_front.png")));
  assert.deepEqual([frame.width, frame.height], [size, size]);
  // The root sits at size / 2 across and 24 px above the foot; the still's at rootPx: both on whole pixels.
  const [dx, dy] = [size / 2 - front.info.rootPx[0], size - 24 - front.info.rootPx[1]];
  // Everything the frame holds of the still: all of it but the margin below the root, under the frame's foot.
  let differ = 0, compared = 0;
  for (let y = Math.max(0, -dy); y < Math.min(front.white.height, size - dy); y++) {
    for (let x = Math.max(0, -dx); x < Math.min(front.white.width, size - dx); x++) {
      const a = 4 * (y * front.white.width + x), b = 4 * ((y + dy) * size + x + dx);
      compared++;
      for (let c = 0; c < 3; c++) if (front.white.data[a + c] !== frame.data[b + c]) differ++;
    }
  }
  assert.ok(compared > 0.9 * front.white.width * front.white.height, `${compared} pixels compared`);
  assert.equal(differ, 0, "render.ts --stills draws still_front as still.ts's white pass does");
  // soft.json: in each still, every part drawn at an alpha its clip keys (or its rig rests under 1) with its footprint's
  // box on the frame, the ID pass's footprint moved by the same whole pixels; the eye at 0 has none, so none is fitted.
  const soft = JSON.parse(readFileSync(join(out, "soft.json"), "utf8")) as { species: string; stills: Record<string, { part: string; box: number[]; pixels: number }[]> };
  assert.equal(soft.species, "test");
  assert.deepEqual(Object.keys(soft.stills), ["still_faded.png"], "only the faded still draws a part at another alpha");
  assert.deepEqual(soft.stills["still_faded.png"]!.map((e) => e.part), Object.keys(fadedAlpha).filter((part) => fadedAlpha[part]! > 0).sort());
  const [fx, fy] = [size / 2 - fadedShot.info.rootPx[0], size - 24 - fadedShot.info.rootPx[1]];
  for (const { part, box, pixels } of soft.stills["still_faded.png"]!) {
    const want = [Infinity, Infinity, -Infinity, -Infinity];
    let n = 0;
    for (let y = 0; y < fadedShot.ids.height; y++) {
      for (let x = 0; x < fadedShot.ids.width; x++) {
        const k = 4 * (y * fadedShot.ids.width + x);
        if (hex([...fadedShot.ids.data.subarray(k, k + 3)]) !== fadedShot.info.parts[part]!.id) continue;
        [want[0], want[1], want[2], want[3]] = [Math.min(want[0]!, x + fx), Math.min(want[1]!, y + fy), Math.max(want[2]!, x + fx), Math.max(want[3]!, y + fy)];
        n++;
      }
    }
    assert.deepEqual([box, pixels], [want, n], `${part}'s footprint is still.ts's ID pass's`);
  }
  const none = spawnSync(process.execPath, [join(repo, "runtime-web/lab/render.ts"), "--stills", "--clip", "x", "--out", out], { encoding: "utf8" });
  assert.equal(none.status, 2, "--stills and --clip are one or the other");
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
