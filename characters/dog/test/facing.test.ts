// Tests for the right-facing views (threeQuarter.R and side.R; spec L367-368, model.json's mirroredViews,
// views/facing.ts): each is its .L view's geometry mirrored with every .L and .R swapped in its names, its pivots and
// draw orders mirrored, lit again from the top left (a plain mirror would carry the shade over to the wrong side),
// showing exactly the right side's markings from the marking map, its placed landmarks on their own parts, and its
// WebGL rest frame the resvg composite of its drawings.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { PNG } from "pngjs";
import type { Clip, Rig } from "../../../runtime-web/src/format.ts";
import { validate } from "../../../runtime-web/src/format.ts";
import { openStills, type StillInfo, type Stills } from "../../../runtime-web/lab/still.ts";
import { buildPackage, readSource, writePackage } from "../../build/build.ts";
import { restTransform } from "../../draw/frame.ts";
import { scopeIds, type Piece } from "../../draw/svg.ts";
import { composite, type Layer } from "../../draw/test/composite.ts";
import { landmarks as placed } from "../src/drawings.ts";
import { mirrorPiece, reflectPath, swapSides } from "../src/views/facing.ts";
import type { Drawn } from "../src/views/front.ts";
import { side } from "../src/views/side.ts";
import { threeQuarter } from "../src/views/threeQuarter.ts";

const json = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const rig = json("../src/rig.json") as Rig;
const model = json("../model.json") as { markings: { id: string; part: string }[]; crops: Record<string, { crop: string }> };
const marked = new Set(model.markings.map((m) => m.id));
const VIEWS = { threeQuarter, side } as const;
type Kind = keyof typeof VIEWS;
const KINDS = Object.keys(VIEWS) as Kind[];
const drawn = new Map(KINDS.flatMap((k) => (["L", "R"] as const).map((s) => [`${k}.${s}`, VIEWS[k](s)] as [string, Drawn[]])));
const pieces = (view: string) => new Map(drawn.get(view)!.map((d) => [d.part, d.piece]));
const order = (view: string) => rig.drawOrder[view]!.flatMap((e) => (e === "@head" ? rig.drawOrder[`head.${view}`]! : [e]));

/** A model-space canvas wide enough for either facing of either turned view, in whole points. */
const BOX = { x: -135, y: -180, w: 270, h: 190 };
function raster(svg: string, scale: number): PNG {
  const doc = `<svg xmlns="http://www.w3.org/2000/svg" width="${BOX.w}" height="${BOX.h}" viewBox="${BOX.x} ${BOX.y} ${BOX.w} ${BOX.h}">${scopeIds(svg, "p")}</svg>`;
  return PNG.sync.read(new Resvg(doc, { fitTo: { mode: "zoom", value: scale }, background: "rgba(0,0,0,0)" }).render().asPng());
}
/** The pixel that pixel (i, j) lands on in a mirror about model x = 0 (BOX is symmetric about it). */
const flipped = (png: PNG, i: number, j: number) => j * png.width + (png.width - 1 - i);

test("each right-facing view's pivots are its left-facing view's, mirrored, every .L and .R swapped", () => {
  for (const kind of KINDS) {
    for (const bone of rig.bones.map((b) => b.name)) {
      const r = restTransform(rig, bone, `${kind}.R`), l = restTransform(rig, swapSides(bone), `${kind}.L`);
      assert.ok(Math.abs(r.tx + l.tx) < 1e-9 && Math.abs(r.ty - l.ty) < 1e-9, `${bone} in ${kind}.R is at (${r.tx}, ${r.ty}); the mirror of ${swapSides(bone)} in ${kind}.L is (${-l.tx}, ${l.ty})`);
      assert.ok(Math.abs(r.a - 1) < 1e-12 && Math.abs(r.b) < 1e-12, `${bone} is turned at rest in ${kind}.R`);
    }
  }
});

test("each right-facing view draws its left-facing view's parts in the same order, names swapped, the left side's own marking left out", () => {
  const clips = KINDS.map((k) => json(`../src/clips/still_${k}.R.json`) as Clip);
  assert.deepEqual(validate(rig, clips), []);
  for (const [k, clip] of KINDS.map((kind, i) => [kind, clips[i]!] as const)) {
    assert.deepEqual(clip.views, { body: [[0, `${k}.R`]], head: [[0, `${k}.R`]] });
    assert.deepEqual(clip.states ?? {}, (json(`../src/clips/still_${k}.L.json`) as Clip).states ?? {}, "the facings hold the same states");
    for (const head of ["", "head."]) {
      const own = (n: string) => !marked.has(n) || marked.has(swapSides(n));
      assert.deepEqual(rig.drawOrder[`${head}${k}.R`], rig.drawOrder[`${head}${k}.L`]!.filter(own).map((e) => (e === "@head" ? e : swapSides(e))), `${head}${k}.R`);
    }
    const left = [...pieces(`${k}.L`).keys()], right = [...pieces(`${k}.R`).keys()];
    assert.deepEqual(right.sort(), left.filter((n) => !marked.has(n) || marked.has(swapSides(n))).map(swapSides).sort());
    assert.deepEqual([...order(`${k}.R`)].sort(), right.sort(), "the order draws every drawing of the view, once");
  }
});

test("each right-facing view is its left-facing view's geometry mirrored: every part's shape and coverage", (t) => {
  const scale = 2;
  for (const kind of KINDS) {
    const L = pieces(`${kind}.L`), R = pieces(`${kind}.R`);
    let union: [Float64Array, Float64Array] | undefined;
    for (const [name, r] of R) {
      const l = L.get(swapSides(name))!;
      // The shapes the lint reads are the .L shapes mirrored, point for point, and the canvas is mirrored.
      assert.deepEqual(r.box, [-(l.box[0] + l.box[2]), l.box[1], l.box[2], l.box[3]], `${name}'s box`);
      assert.deepEqual(r.meta.shapes.map((s) => s.segs), l.meta.shapes.map((s) => s.segs.map((seg) => seg.map(([x, y]) => [-x, y]))), `${name}'s shapes`);
      // Its coverage is the .L part's mirrored. head.line, the head's outline drawn past its edge, follows the light
      // on its inner side (the line rule's width), which lies over the head; the union below holds its outer edge.
      const a = raster(r.svg, scale), b = raster(l.svg, scale);
      union ??= [new Float64Array(a.width * a.height), new Float64Array(a.width * a.height)];
      let off = 0, cover = 0;
      for (let j = 0; j < a.height; j++) {
        for (let i = 0; i < a.width; i++) {
          const p = j * a.width + i, q = flipped(a, i, j);
          const ar = a.data[p * 4 + 3]! / 255, al = b.data[q * 4 + 3]! / 255;
          union[0][p] = 1 - (1 - union[0][p]!) * (1 - ar);
          union[1][p] = 1 - (1 - union[1][p]!) * (1 - al);
          off += Math.abs(ar - al);
          cover += al;
        }
      }
      // How much of the part's coverage lies elsewhere than its mirror's, soft parts (a brow, the blush) included.
      if (name !== "head.line") assert.ok(off / cover < 0.01, `${kind}.R ${name}'s coverage differs from the mirror of ${kind}.L ${swapSides(name)}'s by ${(100 * off / cover).toFixed(2)}%`);
    }
    let worst = 0, at = 0, off = 0, cover = 0;
    for (let p = 0; p < union![0].length; p++) {
      const d = Math.abs(union![0][p]! - union![1][p]!);
      if (d > worst) (worst = d, at = p);
      off += d;
      cover += union![1][p]!;
    }
    const w = BOX.w * scale;
    t.diagnostic(`${kind}: the dog's coverage differs from the .L dog's mirror by ${(100 * off / cover).toFixed(3)}%, at most ${(worst * 255).toFixed(1)}/255 at (${(BOX.x + (at % w) / scale).toFixed(1)}, ${(BOX.y + Math.floor(at / w) / scale).toFixed(1)})`);
    assert.ok(off / cover < 0.005, `${kind}.R's silhouette differs from the mirror of ${kind}.L's by ${(100 * off / cover).toFixed(3)}%`);
  }
});

test("each facing shows exactly its own side's markings, as the marking map gives them, each clipped to its part", () => {
  const evidence = json("../ref/markings.json").evidence as { panel: string; marking: string }[];
  for (const kind of KINDS) {
    const sighted = evidence.filter((e) => e.panel === model.crops[`${kind}.L`]!.crop).map((e) => e.marking);
    // The .R facing shows the right side's marking for each the .L crop shows, where the marking map has one.
    const want = sighted.map(swapSides).filter((n) => marked.has(n)).sort();
    const shows = [...pieces(`${kind}.R`).keys()].filter((p) => marked.has(p) || /patch|tail\.base/.test(p)).sort();
    assert.deepEqual(shows, want, `${kind}.R shows ${shows.join(", ")}`);
    assert.ok(!shows.some((p) => p.startsWith("rump.patch")), "the rump spot is the left side's only");
    for (const id of shows) {
      const part = rig.parts.find((p) => p.name === id)!, host = model.markings.find((m) => m.id === id)!.part;
      assert.equal(part.clipTo, host, `${id} is clipped to ${part.clipTo}`);
      assert.equal(part.bone, rig.parts.find((p) => p.name === host)!.bone, `${id} rides its part's bone`);
    }
  }
});

/**
 * Each part's shade, as the light places it, and its centroid's shift from where the same shade lies with the light's
 * move taken out. paint.ts's shade is a rim (the part, or its light group, less itself eroded and moved toward the
 * light) plus overhang shapes typed in place; the overhangs belong to the dog, not the light, so they are taken out
 * here (the white shapes in each shade mask), and the move toward the light is set to nothing to give the rim the
 * outline alone would cast. Measured on the part's own drawing: how much each pixel darkens when the shade's multiply
 * is white instead.
 */
function shadeShift(svgs: string[], scale = 2): [number, number] {
  let masks = 0, moves = 0;
  const shades = (svg: string, still: boolean) => svg.replace(/(<mask id="shade[^"]*"[^>]*>)([\s\S]*?)(<\/mask>)/g, (_m, open: string, body: string, close: string) => {
    masks++;
    let rim = body.replace(/<path d="[^"]*" fill="#FFFFFF"\/>/g, "");
    if (still) rim = rim.replace(/<g transform="translate\([^)]*\)">/, () => (moves++, '<g transform="translate(0 0)">'));
    return open + rim + close;
  });
  const unshaded = (svg: string) => svg.replace(/fill="#[0-9A-F]{6}"( mask="url\(#[^)]*\)" style="mix-blend-mode:multiply")/g, 'fill="#FFFFFF"$1');
  const centroid = (still: boolean): [number, number] => {
    let sx = 0, sy = 0, sw = 0;
    for (const svg of svgs.map((s) => shades(s, still))) {
      const a = raster(svg, scale), b = raster(unshaded(svg), scale);
      const lum = (d: Buffer, k: number) => ((d[k]! + d[k + 1]! + d[k + 2]!) / 3) * (d[k + 3]! / 255);
      for (let j = 0; j < a.height; j++) {
        for (let i = 0; i < a.width; i++) {
          const k = (j * a.width + i) * 4, dark = Math.max(0, lum(b.data, k) - lum(a.data, k));
          sx += (BOX.x + (i + 0.5) / scale) * dark;
          sy += (BOX.y + (j + 0.5) / scale) * dark;
          sw += dark;
        }
      }
    }
    assert.ok(sw > 0, "the part casts no shade");
    return [sx / sw, sy / sw];
  };
  const lit = centroid(false), still = centroid(true);
  assert.ok(masks > 0 && moves > 0, "the drawing has no rim of shade moved toward the light (paint.ts's markup changed?)");
  return [lit[0] - still[0], lit[1] - still[1]];
}

test("the light stays at the top left in both facings: each part's shade sits right of and below where its outline alone puts it, where a plain mirror moves it left", (t) => {
  // Each part painted with a rim of shade, a light group (its rim found on the union of its parts) as one. The
  // topknot holds its shade to its curls' crowns (DECISIONS 80), so its shade cannot drop below their feet: it is held
  // to the right only.
  const units: Record<Kind, string[][]> = {
    threeQuarter: [["tail"], ["body.back", "hind.L"], ["body.front", "front.L"], ["tag"], ["ear.L"], ["ear.R"], ["head.base"], ["tuft"]],
    side: [["tail"], ["front.R"], ["body.back", "body.front", "front.L", "hind.L"], ["tag"], ["ear.L"], ["head.base"], ["tuft"]],
  };
  for (const kind of KINDS) {
    const L = pieces(`${kind}.L`), R = pieces(`${kind}.R`);
    for (const unit of units[kind]) {
      const svgs = { L: unit.map((p) => L.get(p)!.svg), R: unit.map((p) => R.get(swapSides(p))!.svg), plain: unit.map((p) => mirrorPiece(L.get(p)!).svg) };
      const shift = Object.fromEntries(Object.entries(svgs).map(([k, s]) => [k, shadeShift(s)])) as Record<keyof typeof svgs, [number, number]>;
      const f = ([x, y]: [number, number]) => `(${x.toFixed(1)}, ${y.toFixed(1)})`;
      t.diagnostic(`${kind} ${unit.join(" + ")}: .L ${f(shift.L)}, .R ${f(shift.R)}, a plain mirror ${f(shift.plain)}`);
      const below = unit.includes("tuft") ? -0.2 : 0.5;
      for (const facing of ["L", "R"] as const) {
        const [dx, dy] = shift[facing];
        assert.ok(dx > 0.5 && dy > below, `${kind}.${facing} ${unit.join(" + ")}: the shade shifts ${f(shift[facing])} pt, not right and down, away from the top-left light`);
      }
      assert.ok(shift.plain[0] < -0.5, `${kind} ${unit.join(" + ")}: a plain mirror shifts the shade ${f(shift.plain)} pt, which this test would not catch`);
    }
  }
});

test("a light typed by hand is reflected across its feature's middle, arcs included", () => {
  const d = "M-64.4 -47.2 a2 1.4 -50 1 0 4 0 a2 1.4 -50 1 0 -4 0 M-82 -128 C-74 -146 -56 -154 -38 -152 L-40 -150 H-60 V-140Z";
  assert.equal(reflectPath(reflectPath(d, -60), -60).replace(/\s+/g, " "), "M -64.4 -47.2 a 2 1.4 -50 1 0 4 0 a 2 1.4 -50 1 0 -4 0 M -82 -128 C -74 -146 -56 -154 -38 -152 L -40 -150 H -60 V -140 Z");
  // Drawn, the reflection is the drawing mirrored about the line: about x = 0 here, so the canvas flips onto itself.
  const a = raster(`<path d="${d}" fill="#000000"/>`, 2), b = raster(`<path d="${reflectPath(d, 0)}" fill="#000000"/>`, 2);
  let differ = 0;
  for (let j = 0; j < a.height; j++) for (let i = 0; i < a.width; i++) differ += +(Math.abs(a.data[(j * a.width + i) * 4 + 3]! - b.data[flipped(a, i, j) * 4 + 3]!) > 64);
  assert.ok(differ <= 4, `${differ} pixels differ from the mirror`);
});

test("a path's leading relative moveto is reflected as SVG reads it, absolute, about a line off the middle", () => {
  // SVG reads a path's first m as absolute and the pairs after it as relative linetos (SVG 1.1, 8.3.2).
  assert.equal(reflectPath("m10 0 l5 0", 20), "M 30 0 l -5 0");
  assert.equal(reflectPath("m10 0 5 5 3 1z m2 2 l1 1", 20), "M 30 0 l -5 5 -3 1 z m -2 2 l -1 1");
  // Drawn, the reflection about x = 7 is the drawing mirrored about that line.
  const d = "m-20 -40 c4 -8 14 -10 18 -2 l-2 9 a3 2 20 1 0 -6 1z m-30 4 l6 -6 4 6z";
  const a = raster(`<g transform="matrix(-1 0 0 1 14 0)"><path d="${d}" fill="#000000"/></g>`, 2), b = raster(`<path d="${reflectPath(d, 7)}" fill="#000000"/>`, 2);
  let differ = 0, cover = 0;
  for (let k = 3; k < a.data.length; k += 4) (differ += +(Math.abs(a.data[k]! - b.data[k]!) > 64), (cover += +(a.data[k]! > 128)));
  assert.ok(cover > 400 && differ <= 4, `${differ} pixels differ from the mirror about x = 7, of ${cover} covered`);
});

test("each right-facing view's placed landmarks are the left-facing view's mirrored, each on its own part", () => {
  const all = placed();
  for (const kind of KINDS) {
    const left = all[`${kind}.L`]!, right = all[`${kind}.R`]!;
    assert.deepEqual(right, Object.fromEntries(Object.entries(left).map(([n, [x, y]]) => [swapSides(n), [-x, y]])));
    const owner: Record<string, string> = { "paw.front.L": "front.L", "paw.front.R": "front.R", "paw.hind.R": "hind.R", "tag.ring": "tag", seat: "body.back" };
    assert.deepEqual(Object.keys(right).sort(), Object.keys(owner).sort());
    const R = pieces(`${kind}.R`), scale = 3;
    const alpha = new Map([...R].map(([part, p]) => [part, raster(p.svg, scale)]));
    for (const [name, [x, y]] of Object.entries(right)) {
      const at = (png: PNG) => png.data[(Math.floor((y - BOX.y) * scale) * png.width + Math.floor((x - BOX.x) * scale)) * 4 + 3]! / 255;
      const top = order(`${kind}.R`).filter((part) => part !== "shadow" && at(alpha.get(part)!) >= 0.5).at(-1);
      assert.equal(top, owner[name], `${kind}.R ${name} at (${x}, ${y}) lies on ${top}`);
    }
  }
});

// The rest frames through WebGL, as the left-facing views' tests hold theirs.
const SCALE = 3;
const dir = mkdtempSync(join(tmpdir(), "huddlings-facing-"));
let stills: Stills;
const infos = new Map<string, StillInfo>();
before(async () => {
  writePackage(await buildPackage(await readSource("dog")), join(dir, "package"));
  stills = await openStills(join(dir, "package"));
  await stills.load(SCALE);
  for (const kind of KINDS) infos.set(kind, await stills.render(`still_${kind}.R`, join(dir, kind)));
});
after(async () => {
  await stills?.close();
  rmSync(dir, { recursive: true, force: true });
});

test("the WebGL stills of the right-facing views reproduce the resvg composite of their model-space drawings", (t) => {
  for (const kind of KINDS) {
    const info = infos.get(kind)!, view = `${kind}.R`;
    const png = (name: string) => PNG.sync.read(readFileSync(join(dir, kind, name)));
    const white = png("white.png"), black = png("black.png");
    const R: Map<string, Piece> = pieces(view);
    assert.deepEqual([...info.drawn].sort(), [...R.keys()].sort(), "the still draws every drawing of the view");
    const W = BOX.w * SCALE, HH = BOX.h * SCALE;
    const layers: Layer[] = info.drawn.map((part) => {
      const clipTo = rig.parts.find((p) => p.name === part)!.clipTo;
      return { rgba: raster(R.get(part)!.svg, SCALE).data, part, ...(clipTo ? { clipTo } : {}) };
    });
    const reference = composite(layers, W, HH);
    const dx = info.rootPx[0] + SCALE * BOX.x, dy = info.rootPx[1] + SCALE * BOX.y;
    assert.ok(Number.isInteger(dx) && Number.isInteger(dy));
    const [w, h] = info.sizePx;
    let sum = 0, count = 0, worst = 0;
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const k = (j * w + i) * 4;
        const alpha = 1 - (white.data[k]! - black.data[k]! + white.data[k + 1]! - black.data[k + 1]! + white.data[k + 2]! - black.data[k + 2]!) / 3 / 255;
        const u = i - dx, v = j - dy;
        const inside = u >= 0 && v >= 0 && u < W && v < HH;
        const want = (c: number) => (inside ? reference[(v * W + u) * 4 + c]! : 0);
        for (const [got, c] of [[black.data[k]! / 255, 0], [black.data[k + 1]! / 255, 1], [black.data[k + 2]! / 255, 2], [alpha, 3]] as const) {
          const d = Math.abs(got - want(c)) * 255;
          sum += d;
          count++;
          worst = Math.max(worst, d);
        }
      }
    }
    t.diagnostic(`${view}: WebGL against resvg over ${w} × ${h} px, mean difference ${(sum / count).toFixed(4)}/255, largest ${worst.toFixed(2)}/255`);
    assert.ok(sum / count < 0.1, `${view}: mean difference ${(sum / count).toFixed(4)}/255`);
    assert.ok(worst <= 2, `${view}: largest difference ${worst.toFixed(2)}/255`);
  }
});
