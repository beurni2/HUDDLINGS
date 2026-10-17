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
import { regionFor } from "../../../runtime-web/src/rig.ts";
import { validate } from "../../../runtime-web/src/format.ts";
import { openStills, type StillInfo, type Stills } from "../../../runtime-web/lab/still.ts";
import { buildPackage, readSource, writePackage } from "../../build/build.ts";
import { restTransform } from "../../draw/frame.ts";
import { bbox } from "../../draw/geom.ts";
import { LIGHT } from "../../draw/paint.ts";
import { scopeIds, type Piece } from "../../draw/svg.ts";
import { composite, type Layer } from "../../draw/test/composite.ts";
import { landmarks as placed } from "../src/drawings.ts";
import { LINES } from "../src/palette.ts";
import { mirrorPiece, reflectPath, swapSides } from "../src/views/facing.ts";
import type { Drawn } from "../src/views/front.ts";
import { side, sideFace, sideFaces, sideHeld } from "../src/views/side.ts";
import { threeQuarter, threeQuarterFace, threeQuarterFaces, threeQuarterHeld } from "../src/views/threeQuarter.ts";

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
    // Every part the order lists draws at rest but the cheeks, whose slot draws only huffy's puffed state (DECISIONS 234).
    const resting = order(`${k}.R`).filter((n) => regionFor(rig.parts.find((q) => q.name === n)!, `${k}.R`, undefined) !== undefined);
    assert.deepEqual([...resting].sort(), right.sort(), "the order draws every drawing of the view, once");
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

/** A ribbon sample of a lined edge (parts/lines.ts): its centre and outward normal in model space, its tone and its width. */
interface LineSample {
  x: number;
  y: number;
  nx: number;
  ny: number;
  tone: number;
  width: number;
}
const MIRROR = '<g transform="scale(-1 1)">';
/** sRGB to CIE L*, to place the lit steps on their ladder's scale. */
const lightness = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as [number, number, number];
  const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return Y > 216 / 24389 ? 116 * Math.cbrt(Y) - 16 : (Y * 24389) / 27;
};
/**
 * Each line colour's place on its ladder, 0 (its lightest) to 10: and each lit step (palette.ts LINES.lit, DECISIONS
 * 285) past the lightest, below 0, where lines.ts places it on the ladder's own L* scale, so a living line that thins
 * into the lit steps on a lit edge (DECISIONS 284, 294, 298) is still sampled, as the lightest of all.
 */
const TONES = new Map([...LINES.cream.map((c, i) => [c, i] as const), ...LINES.tan.map((c, i) => [c, i] as const),
  ...(["cream", "tan"] as const).flatMap((on) => LINES.lit[on].map((c) => [c, (-10 * (lightness(c) - lightness(LINES[on][0]!))) / (lightness(LINES[on][0]!) - lightness(LINES[on][10]!))] as const))]);

/**
 * Every lined edge's samples in a view's drawings, keyed by their centre. lines.ts draws each run of one tone as a
 * polygon, its left side (out from the edge) and then its right side back, one point a sample: so each sample's
 * width and normal are its two sides' gap, its tone the run's place on its ladder. A run's end samples are shared
 * with its neighbours, so only its inner ones count. A .R drawing is its .L-frame drawing mirrored (mirrorPiece).
 */
function lineSamples(drawings: Piece[]): Map<string, LineSample> {
  const out = new Map<string, LineSample | undefined>();
  for (const p of drawings) {
    const flip = p.svg.startsWith(MIRROR) ? -1 : 1;
    for (const m of p.svg.matchAll(/<path fill="(#[0-9A-F]{6})" d="(M[-0-9. L]+Z)"\/>/g)) {
      const tone = TONES.get(m[1]!);
      if (tone === undefined) continue;
      const n = m[2]!.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
      const pts: [number, number][] = [];
      for (let i = 0; i < n.length; i += 2) pts.push([flip * n[i]!, n[i + 1]!]);
      for (let k = 1; k < pts.length / 2 - 1; k++) {
        const l = pts[k]!, r = pts[pts.length - 1 - k]!, w = Math.hypot(l[0] - r[0], l[1] - r[1]);
        if (w === 0) continue;
        const s = { x: (l[0] + r[0]) / 2, y: (l[1] + r[1]) / 2, nx: (l[0] - r[0]) / w, ny: (l[1] - r[1]) / w, tone, width: w };
        const key = `${s.x.toFixed(2)} ${s.y.toFixed(2)}`;
        // A marking carries its part's line over itself, the same samples; two different edges through one point
        // are left out, since which is which cannot be told.
        const seen = out.get(key);
        const same = seen && seen.tone === s.tone && Math.abs(seen.nx - s.nx) < 1e-3 && Math.abs(seen.ny - s.ny) < 1e-3 && Math.abs(seen.width - s.width) < 1e-3;
        out.set(key, !out.has(key) || same ? s : undefined);
      }
    }
  }
  return new Map([...out].filter((e): e is [string, LineSample] => e[1] !== undefined));
}

test("the lines are lit from the top left in both facings: a .R edge facing left is lighter and thinner than its .L twin, one facing right darker and wider, where a plain mirror changes nothing", (t) => {
  // Each .R edge is a .L edge mirrored: drawn by the same rule (DECISIONS 74, 100), under the same light, the one
  // facing left faces the light more than its twin did and the one facing right less, so it is lighter and thinner,
  // or darker and wider. lines.ts's shade by place (under the chin, the ground) is the same for both and cancels.
  for (const kind of KINDS) {
    const L = drawn.get(`${kind}.L`)!, R = drawn.get(`${kind}.R`)!;
    const twins = lineSamples(L.map((d) => mirrorPiece(d.piece)));
    const against = (right: Piece[]) => {
      const sum = { left: [0, 0, 0], right: [0, 0, 0] };
      let matched = 0;
      for (const [key, s] of lineSamples(right)) {
        const twin = twins.get(key);
        if (!twin || Math.abs(twin.nx - s.nx) > 1e-3) continue;
        matched++;
        const g = s.nx < -0.5 ? sum.left : s.nx > 0.5 ? sum.right : undefined;
        if (g) (g[0]!++, (g[1]! += s.tone - twin.tone), (g[2]! += s.width / twin.width));
      }
      const mean = (g: number[]) => ({ n: g[0]!, tone: g[1]! / g[0]!, width: g[2]! / g[0]! });
      return { matched, left: mean(sum.left), right: mean(sum.right) };
    };
    const lit = against(R.map((d) => d.piece)), plain = against(L.map((d) => mirrorPiece(d.piece)));
    const f = (g: { n: number; tone: number; width: number }) => `${g.n} samples, ${g.tone >= 0 ? "+" : ""}${g.tone.toFixed(2)} tones, width ×${g.width.toFixed(3)}`;
    t.diagnostic(`${kind}.R against its .L twins (${lit.matched} samples matched): facing left ${f(lit.left)}; facing right ${f(lit.right)}`);
    assert.ok(lit.matched > 1000 && lit.left.n > 300 && lit.right.n > 300, `${kind}: too few edge samples matched (${lit.matched})`);
    assert.ok(lit.left.tone < -0.7 && lit.left.width < 0.98, `${kind}.R: its edges facing left are not lighter and thinner than their .L twins: ${f(lit.left)}`);
    assert.ok(lit.right.tone > 0.7 && lit.right.width > 1.02, `${kind}.R: its edges facing right are not darker and wider than their .L twins: ${f(lit.right)}`);
    assert.ok(Math.abs(plain.left.tone) < 1e-9 && Math.abs(plain.right.tone) < 1e-9, `${kind}: a plain mirror moves the lines' tones (${f(plain.left)}; ${f(plain.right)}), which this test would not catch`);
  }
});

test("in both .R facings, lined edges facing up-left are lighter and thinner than those facing down-right, and lighter than those facing up-right, which a plain mirror reverses", (t) => {
  const toward = (samples: Map<string, LineSample>, dx: number, dy: number) => {
    const g = [...samples.values()].filter((s) => (s.nx * dx + s.ny * dy) / Math.hypot(dx, dy) > Math.SQRT1_2);
    return { n: g.length, tone: g.reduce((a, s) => a + s.tone, 0) / g.length, width: g.reduce((a, s) => a + s.width, 0) / g.length };
  };
  // head.line's ribbon is drawn unclipped at the line's own width, where every other part's is twice the line with
  // half of it under the part's clip: its widths are not comparable with theirs, so it is left out here.
  const clipped = (view: string, mirror = false) => drawn.get(view)!.filter((d) => d.part !== "head.line").map((d) => (mirror ? mirrorPiece(d.piece) : d.piece));
  for (const kind of KINDS) {
    const gap: Record<string, number> = {};
    for (const [label, drawings] of [[`${kind}.R`, clipped(`${kind}.R`)], [`${kind}.L mirrored`, clipped(`${kind}.L`, true)]] as const) {
      const s = lineSamples(drawings);
      const [ul, ur, dr] = [toward(s, -1, -1), toward(s, 1, -1), toward(s, 1, 1)];
      const f = (g: { n: number; tone: number; width: number }) => `tone ${g.tone.toFixed(2)}, width ${g.width.toFixed(2)} (${g.n})`;
      t.diagnostic(`${label}: up-left ${f(ul)}; up-right ${f(ur)}; down-right ${f(dr)}`);
      assert.ok(ul.n > 300 && ur.n > 300 && dr.n > 300, `${label}: too few samples`);
      // Up-left against down-right holds for the plain mirror too, the light being higher than it is wide: up-left
      // against up-right, at the same height, is what tells the light's side.
      assert.ok(ul.tone < dr.tone - 2 && ul.width < dr.width, `${label}: edges facing up-left (${f(ul)}) are not lighter and thinner than those facing down-right (${f(dr)})`);
      if (label.endsWith(".R")) assert.ok(ul.tone < ur.tone - 1, `${label}: edges facing up-left (${f(ul)}) are not lighter than those facing up-right (${f(ur)})`);
      gap[label.endsWith(".R") ? "lit" : "plain"] = ur.tone - ul.tone;
    }
    // A plain mirror keeps the .L drawing's own balance between its up-left and up-right edges. In the three-quarter that
    // balance follows the crop's tone along its lines (DECISIONS 294: its lightest line, the plume's top and hook, L* 75 to
    // 83, faces up and right, and its far ear's outer edge, L* 50 to 60, up and left), so a plain mirror no longer reverses
    // it there: the light must move .R's up-left edges lighter against its up-right ones by over a tone more than a plain
    // mirror's do, which a plain mirror never does.
    assert.ok(gap.lit! - gap.plain! > 1, `${kind}.R: the light moves its up-left edges against its up-right ones by ${(gap.lit! - gap.plain!).toFixed(2)} tones over a plain mirror's, not over 1`);
  }
});

/** Each subpath of path data as its absolute points (every end and control point), walked as SVG reads it. */
function subpaths(d: string): [number, number][][] {
  const tokens = d.match(/[A-Za-z]|[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g) ?? [];
  const per: Record<string, number> = { m: 2, l: 2, t: 2, h: 1, v: 1, c: 6, s: 4, q: 4, a: 7, z: 0 };
  const out: [number, number][][] = [];
  let cmd = "", x = 0, y = 0, sx = 0, sy = 0, first = true;
  for (let i = 0; i < tokens.length; ) {
    if (/[A-Za-z]/.test(tokens[i]!)) cmd = tokens[i++]!;
    const lower = cmd.toLowerCase(), rel = cmd === lower && !(first && lower === "m");
    if (lower === "z") {
      [x, y] = [sx, sy];
      if (i < tokens.length && !/[A-Za-z]/.test(tokens[i]!)) throw new Error(`subpaths: cannot read ${d}`);
      continue;
    }
    const a = tokens.slice(i, i + per[lower]!).map(Number);
    i += per[lower]!;
    const at = (px: number, py: number): [number, number] => (rel ? [x + px, y + py] : [px, py]);
    let pts: [number, number][];
    if (lower === "h") pts = [[rel ? x + a[0]! : a[0]!, y]];
    else if (lower === "v") pts = [[x, rel ? y + a[0]! : a[0]!]];
    else if (lower === "a") pts = [at(a[5]!, a[6]!)];
    else pts = Array.from({ length: a.length / 2 }, (_, k) => at(a[2 * k]!, a[2 * k + 1]!));
    if (lower === "m") {
      out.push([]);
      [sx, sy] = pts[0]!;
      // Pairs after a moveto's first are linetos, relative after an m (a leading one included).
      cmd = cmd === "M" ? "L" : "l";
    }
    first = false;
    out.at(-1)!.push(...pts);
    [x, y] = pts.at(-1)!;
  }
  return out;
}

/** The highlights typed by hand in a drawing, in order: paint.ts draws each as a blurred path of its own. */
const handLights = (svg: string) => [...svg.matchAll(/<path d="([^"]+)" fill="#[0-9A-F]{6}" opacity="[\d.]+" filter="url\(#[^)]+\)"\/>/g)].map((m) => m[1]!);

test("each light typed by hand toward the light (Facing.lit) is, in .R, the .L light reflected about the middle its view states for its feature; every other light typed by hand is where .L types it", () => {
  // The middles the views pass to Facing.lit, worked out again here from the .L drawings: a feature's middle across
  // (side.ts's and threeQuarter.ts's middle(), the box of its shape's segments), the far paw's centre for its dome
  // (side.ts), and for the three-quarter far cheek's light the face's middle, halfway between the far cheek's puff
  // (x -100.4) and the near face's side (x -14.2): threeQuarter.ts's FACE_MID, restated as that file keeps it to itself.
  const middle = (view: string, part: string) => {
    const shapes = pieces(view).get(part)!.meta.shapes.filter((s) => s.name === part);
    assert.equal(shapes.length, 1, `${view} ${part}: its shape`);
    const [x0, , x1] = bbox(shapes[0]!.segs);
    return (x0 + x1) / 2;
  };
  const tail = middle("side.L", "tail"), head = middle("side.L", "head.base");
  const head3 = middle("threeQuarter.L", "head.base"), FACE_MID = (-100.4 + -14.2) / 2;
  // For each .L drawing carrying such lights, the middle of each light placed again, in the order the drawing paints
  // them (DECISIONS 101): the ear's sheen, the plume's top (the tail and its marking), the forehead's or crown's light
  // (the head, its patches and the topknot's curls, which share the head's light: the profile's four crisp locks,
  // DECISIONS 278, and the three-quarter's four, its crisp topknot's small flicked lock among them, DECISIONS 262, 272;
  // in three-quarter with the far cheek's), the tag's and the far paw's dome. Every other drawing's lights belong to
  // their place and mirror with it.
  const stated: Record<Kind, Record<string, number[]>> = {
    side: {
      "ear.L": [middle("side.L", "ear.L")], tail: [tail], "tail.base": [tail], "head.base": [head], "head.patch.L": [head], tuft: [head, head, head, head],
      tag: [middle("side.L", "tag")], "front.R": [placed()["side.L"]!["paw.front.R"]![0]],
    },
    threeQuarter: {
      "ear.R": [middle("threeQuarter.L", "ear.R")], "head.base": [head3, FACE_MID], "head.patch.L": [head3, FACE_MID], "head.patch.R": [head3, FACE_MID],
      tuft: [head3, FACE_MID, head3, FACE_MID, head3, FACE_MID, head3, FACE_MID], tag: [middle("threeQuarter.L", "tag")],
    },
  };
  for (const kind of KINDS) {
    const R = pieces(`${kind}.R`);
    for (const [name, l] of pieces(`${kind}.L`)) {
      const r = R.get(swapSides(name));
      if (!r) continue; // The left side's own marking, which .R does not draw.
      const where = `${kind}.R ${swapSides(name)}`;
      assert.ok(r.svg.startsWith(MIRROR), `${where} is not its .L drawing mirrored`);
      // In the .R drawing, before its mirror: the frame the view is typed in.
      const [lights, again] = [handLights(l.svg), handLights(r.svg.slice(MIRROR.length))];
      assert.equal(again.length, lights.length, `${where}: the facings paint different numbers of lights`);
      const abouts = stated[kind][name] ?? [];
      let moved = 0;
      lights.forEach((dl, k) => {
        const [sl, sr] = [subpaths(dl), subpaths(again[k]!)];
        assert.equal(sr.length, sl.length, `${where}: light ${k}'s subpaths`);
        sl.forEach((pl, j) => {
          const pr = sr[j]!;
          assert.equal(pr.length, pl.length, `${where}: light ${k}.${j}'s points`);
          if (pl.every((p, i) => Math.abs(p[0] - pr[i]![0]) < 1e-3 && Math.abs(p[1] - pr[i]![1]) < 1e-3)) return; // Where .L types it.
          const about = abouts[moved++];
          assert.ok(about !== undefined, `${where}: light ${k}.${j} is placed again across its part, where its view states no middle`);
          // Reflected about the stated middle: every point, arcs' ends included.
          for (const [i, p] of pl.entries()) {
            assert.ok(Math.abs(pr[i]![0] - (2 * about - p[0])) < 2e-3 && Math.abs(pr[i]![1] - p[1]) < 2e-3,
              `${where}: light ${k}.${j} is reflected about x = ${((p[0] + pr[i]![0]) / 2).toFixed(2)}, not its feature's middle x = ${about.toFixed(2)}`);
          }
        });
      });
      assert.equal(moved, abouts.length, `${where}: ${moved} of its ${abouts.length} lights typed toward the light are placed again across their features; the rest lie where a plain mirror puts them, away from the top-left light`);
    }
  }
});

test("no paint or line in side('R') or threeQuarter('R') falls back to the default light: the facing's own mirror of LIGHT is the only read of it", () => {
  // Instrumented: every read of LIGHT's two numbers is recorded with its caller. In .L, LIGHT is the facing's light and
  // paint.ts and lines.ts read it; in .R the facing reads it once to mirror it, and anything else reading it has
  // fallen back to the default light, the plain mirror's.
  const own = [LIGHT[0], LIGHT[1]] as const;
  const reads: string[] = [];
  for (const i of [0, 1] as const) {
    Object.defineProperty(LIGHT, i, { configurable: true, enumerable: true, get: () => (reads.push(new Error().stack!.split("\n").slice(2, 5).join(" <- ")), own[i]) });
  }
  try {
    for (const kind of KINDS) {
      reads.length = 0;
      VIEWS[kind]("L");
      assert.ok(reads.some((r) => /draw\/paint\.ts/.test(r)) && reads.some((r) => /parts\/lines\.ts/.test(r)), `${kind}.L: the instrument sees no read from paint.ts and lines.ts`);
      reads.length = 0;
      VIEWS[kind]("R");
      const fallbacks = reads.filter((r) => !/^\s*at facing \(.*views\/facing\.ts:/.test(r));
      assert.ok(reads.length > fallbacks.length, `${kind}.R: the facing never read LIGHT`);
      assert.deepEqual([...new Set(fallbacks)], [], `${kind}.R falls back to the default light`);
    }
  } finally {
    for (const i of [0, 1] as const) Object.defineProperty(LIGHT, i, { configurable: true, enumerable: true, writable: true, value: own[i] });
  }
  assert.deepEqual([LIGHT[0], LIGHT[1]], own);
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
      // Every drawn part (the cheeks' slot draws nothing at rest).
      const top = order(`${kind}.R`).filter((part) => part !== "shadow" && alpha.has(part) && at(alpha.get(part)!) >= 0.5).at(-1);
      assert.equal(top, owner[name], `${kind}.R ${name} at (${x}, ${y}) lies on ${top}`);
    }
  }
});

// The turned views' face states in both facings (DECISIONS 170 to 185): each .R state is its .L state's geometry
// mirrored, names swapped, and lit again from the top left, as the rest drawings above are; the states held out of the
// package for now (DECISIONS 183) with them.
const FACES = {
  threeQuarter: (s: "L" | "R") => [...threeQuarterFaces(s), ...threeQuarterHeld(s)],
  side: (s: "L" | "R") => [...sideFaces(s), ...sideHeld(s)],
} as const;
/** A face state's key in the other facing: its part's side swapped, and a state named for the dog's side (the head's line beside a raised ear) too. */
const swapKey = (key: string) => swapSides(key).replace(/:temple(L|R)$/, (_m, s: string) => `:temple${s === "L" ? "R" : "L"}`);
const faceDrawn = new Map(KINDS.flatMap((k) => (["L", "R"] as const).map((s) => [`${k}.${s}`, FACES[k](s)] as [string, Drawn[]])));
const facePieces = (view: string) => new Map(faceDrawn.get(view)!.map((d) => [`${d.part}:${d.state}`, d.piece]));

test("each right-facing view's face states are its left-facing ones mirrored, names swapped: every state's shape and coverage", () => {
  for (const kind of KINDS) {
    const L = facePieces(`${kind}.L`), R = facePieces(`${kind}.R`);
    assert.deepEqual([...R.keys()].sort(), [...L.keys()].map(swapKey).sort(), `${kind}: the facings draw the same states`);
    // Every face state, hungry's and huffy's and Q2's squeeze and sparkle among them (DECISIONS 202 to 208), with the held
    // stars, puffed cheeks and profile mouths.
    assert.equal(R.size, kind === "side" ? 25 : 41, `${kind}.R draws ${R.size} face states`);
    for (const [key, r] of R) {
      const l = L.get(swapKey(key))!;
      assert.ok(r.svg.startsWith(MIRROR), `${kind}.R ${key} is not its .L drawing mirrored`);
      assert.deepEqual(r.box, [-(l.box[0] + l.box[2]), l.box[1], l.box[2], l.box[3]], `${key}'s box`);
      assert.deepEqual(r.meta.shapes.map((s) => s.segs), l.meta.shapes.map((s) => s.segs.map((seg) => seg.map(([x, y]) => [-x, y]))), `${key}'s shapes`);
      // The stars' warm cores glow a little past their drawn-in sides and sit toward the light, so their coverage moves
      // with it: their bodies are held here, their cores by the next test.
      // Huffy's puffed cheeks are all light and shade but their creases (parts/cheeks.ts turnedCheeks): their shade lies
      // away from the light and their domes toward it (held by the next test), so their creases are held here.
      const body = (svg: string) => (key === "stars:sparkle" ? svg.replace(/<ellipse [^>]*\/>/g, "")
        : key === "cheeks:puffed" ? svg.replace(/<g filter="url\(#[^)]+\)" opacity="[^"]+"><g clip-path="url\(#[^)]+\)"><path [^>]*\/><\/g><\/g>/g, "")
          .replace(/<path d="[^"]+" fill="#FFFFFF" opacity="[^"]+" filter="url\(#[^)]+\)"\/>/g, "") : svg);
      if (key.startsWith("head.line:")) {
        // The head's line follows the light on its inner side (the line rule's width), so, as the rest test above, its
        // coverage is not held to the mirror's; it is held to its own facing's rest line, which that test holds. Beside
        // the near ear perked: the same line with only the near side's curve left out, on the near ear's side of the face.
        // Beside the far ear perked (DECISIONS 234; .R's templeL, .L's templeR): the same line with the far root's
        // stretch lined and its feathering gone, every change on the far side of the face about the far root.
        const far = key === "head.line:templeL";
        for (const [view, p, near] of [[`${kind}.L`, l, -1], [`${kind}.R`, r, 1]] as const) {
          const t = raster(p.svg, 2), rest = raster(pieces(view).get("head.line")!.svg, 2);
          let extra = 0, added = 0, gone = 0, gx = 0, mass = 0, mx = 0, inner = Infinity;
          for (let k = 0; k < t.width * t.height; k++) {
            const d = (t.data[k * 4 + 3]! - rest.data[k * 4 + 3]!) / 255, x = BOX.x + ((k % t.width) + 0.5) / 2;
            extra = Math.max(extra, d);
            if (d > 0) added += d;
            if (d < 0) (gone -= d), (gx += -d * x);
            if (Math.abs(d) >= 2 / 255) (mass += Math.abs(d)), (mx += Math.abs(d) * x), (inner = Math.min(inner, near * x));
          }
          if (far) {
            assert.ok(added > 5 && gone > 5, `${view} ${key} adds ${added.toFixed(1)} px and leaves out ${gone.toFixed(1)}: the far root's stretch is not lined`);
            // The far side lies at x < 0 in .L (the far root about x -83) and its mirror in .R: near * x reads it as positive.
            assert.ok(near * (mx / mass) > 75 && inner > 55, `${view} ${key} changes the line about x = ${(mx / mass).toFixed(1)}, as far in as x = ${(near * inner).toFixed(1)}: not only the far root`);
            continue;
          }
          assert.ok(extra < 2 / 255, `${view} ${key} draws ${(extra * 255).toFixed(1)}/255 where its rest line draws nothing`);
          assert.ok(gone > 0 && near * (gx / gone) > 10, `${view} ${key} leaves out ${gone.toFixed(1)} px about x = ${(gx / gone).toFixed(1)}, not the near side's curve`);
        }
        continue;
      }
      const a = raster(body(r.svg), 2), b = raster(body(l.svg), 2);
      let off = 0, cover = 0;
      for (let j = 0; j < a.height; j++) {
        for (let i = 0; i < a.width; i++) {
          const ar = a.data[(j * a.width + i) * 4 + 3]! / 255, al = b.data[flipped(a, i, j) * 4 + 3]! / 255;
          off += Math.abs(ar - al);
          cover += al;
        }
      }
      assert.ok(off / cover < 0.01, `${kind}.R ${key}'s coverage differs from the mirror of .L's by ${(100 * off / cover).toFixed(2)}%`);
    }
  }
});

test("the perked ears are lit from the top left in both facings: each one's shade sits right of and below where its outline alone puts it, where a plain mirror moves it left", (t) => {
  const units: Record<Kind, string[]> = { threeQuarter: ["ear.L:onePerked", "ear.R:onePerked"], side: ["ear.L:onePerked"] };
  for (const kind of KINDS) {
    const L = facePieces(`${kind}.L`), R = facePieces(`${kind}.R`);
    for (const key of units[kind]) {
      const svgs = { L: [L.get(key)!.svg], R: [R.get(swapKey(key))!.svg], plain: [mirrorPiece(L.get(key)!).svg] };
      const shift = Object.fromEntries(Object.entries(svgs).map(([k, s]) => [k, shadeShift(s)])) as Record<keyof typeof svgs, [number, number]>;
      const f = ([x, y]: [number, number]) => `(${x.toFixed(1)}, ${y.toFixed(1)})`;
      t.diagnostic(`${kind} ${key}: .L ${f(shift.L)}, .R ${f(shift.R)}, a plain mirror ${f(shift.plain)}`);
      for (const facing of ["L", "R"] as const) {
        const [dx, dy] = shift[facing];
        assert.ok(dx > 0.5 && dy > 0.5, `${kind}.${facing} ${key}: the shade shifts ${f(shift[facing])} pt, not right and down, away from the top-left light`);
      }
      assert.ok(shift.plain[0] < -0.5, `${kind} ${key}: a plain mirror shifts the shade ${f(shift.plain)} pt, which this test would not catch`);
    }
  }
});

test("the sparkle's stars are lit from the top left in both facings: .R's warm cores sit left of where a plain mirror of .L's puts them", (t) => {
  // Where the light paint (bluer than the stars' gold: their pale cores) sits, weighted by how light it is. A plain
  // mirror carries .L's cores, typed left of each star's middle toward the light, to the right of it; .R's are typed
  // again toward the light, so they sit twice that offset left of the plain mirror's (a plain mirror would be 0).
  const coreAt = (svg: string): [number, number] => {
    const png = raster(svg, 4);
    let lx = 0, ly = 0, lw = 0;
    for (let j = 0; j < png.height; j++) {
      for (let i = 0; i < png.width; i++) {
        const k = (j * png.width + i) * 4, light = (png.data[k + 3]! / 255) * Math.max(0, png.data[k + 2]! - 120);
        lx += (BOX.x + (i + 0.5) / 4) * light;
        ly += (BOX.y + (j + 0.5) / 4) * light;
        lw += light;
      }
    }
    assert.ok(lw > 0, "the stars paint no light");
    return [lx / lw, ly / lw];
  };
  for (const kind of KINDS) {
    const l = facePieces(`${kind}.L`).get("stars:sparkle")!, r = facePieces(`${kind}.R`).get("stars:sparkle")!;
    const [rx, ry] = coreAt(r.svg), [px, py] = coreAt(mirrorPiece(l).svg);
    t.diagnostic(`${kind}: .R's cores sit (${(rx - px).toFixed(2)}, ${(ry - py).toFixed(2)}) pt from a plain mirror's`);
    assert.ok(rx - px < -0.3, `${kind}.R: the stars' cores sit ${(rx - px).toFixed(2)} pt across from a plain mirror's, not toward the top-left light`);
    assert.ok(Math.abs(ry - py) < 0.05, `${kind}.R: the stars' cores move ${(ry - py).toFixed(2)} pt up or down from a plain mirror's`);
  }
});

test("each face state's light typed by hand toward the light is, in .R, its .L light reflected about its feature's middle; every other light lies where .L types it", () => {
  // The perked ears' sheen on the flap's upper side (Facing.lit), about the flap's middle across; the other face states'
  // hand-placed lights (the eyes' catchlights and halos on the nose's side, the mouths' shades) belong to their place.
  const across = (shape: { segs: [number, number][][] }) => {
    const [x0, , x1] = bbox(shape.segs as never);
    return (x0 + x1) / 2;
  };
  const stated: Record<Kind, Record<string, number[]>> = {
    // And huffy's puffed cheeks' light domes, each about its ball's middle (parts/cheeks.ts turnedCheeks, DECISIONS 208).
    threeQuarter: { "ear.L:onePerked": [across(threeQuarterFace.perked.L)], "ear.R:onePerked": [across(threeQuarterFace.perked.R)],
      "cheeks:puffed": threeQuarterFace.puffs(LIGHT).map((b) => b.c[0]) },
    side: { "ear.L:onePerked": [across(sideFace.perked.L)], "cheeks:puffed": [sideFace.puff.c[0]] },
  };
  for (const kind of KINDS) {
    const R = facePieces(`${kind}.R`);
    for (const [key, l] of facePieces(`${kind}.L`)) {
      const r = R.get(swapKey(key))!, where = `${kind}.R ${swapKey(key)}`;
      const [lights, again] = [handLights(l.svg), handLights(r.svg.slice(MIRROR.length))];
      assert.equal(again.length, lights.length, `${where}: the facings paint different numbers of lights`);
      const abouts = stated[kind][key] ?? [];
      let moved = 0;
      lights.forEach((dl, k) => {
        const [sl, sr] = [subpaths(dl), subpaths(again[k]!)];
        sl.forEach((pl, j) => {
          const pr = sr[j]!;
          if (pl.every((p, i) => Math.abs(p[0] - pr[i]![0]) < 1e-3 && Math.abs(p[1] - pr[i]![1]) < 1e-3)) return;
          const about = abouts[moved++];
          assert.ok(about !== undefined, `${where}: light ${k}.${j} is placed again across its part, where its view states no middle`);
          for (const [i, p] of pl.entries()) assert.ok(Math.abs(pr[i]![0] - (2 * about - p[0])) < 2e-3 && Math.abs(pr[i]![1] - p[1]) < 2e-3, `${where}: light ${k}.${j} is not reflected about x = ${about.toFixed(2)}`);
        });
      });
      assert.equal(moved, abouts.length, `${where}: ${moved} of its ${abouts.length} lights typed toward the light are placed again`);
    }
  }
});

test("no face state in the .R views (threeQuarter, side; held ones too) falls back to the default light", () => {
  const own = [LIGHT[0], LIGHT[1]] as const;
  const reads: string[] = [];
  for (const i of [0, 1] as const) {
    Object.defineProperty(LIGHT, i, { configurable: true, enumerable: true, get: () => (reads.push(new Error().stack!.split("\n").slice(2, 5).join(" <- ")), own[i]) });
  }
  try {
    for (const kind of KINDS) {
      reads.length = 0;
      FACES[kind]("R");
      const fallbacks = reads.filter((r) => !/^\s*at facing \(.*views\/facing\.ts:/.test(r));
      assert.ok(reads.length > fallbacks.length, `${kind}.R's face states never read the facing's light`);
      assert.deepEqual([...new Set(fallbacks)], [], `${kind}.R's face states fall back to the default light`);
    }
  } finally {
    for (const i of [0, 1] as const) Object.defineProperty(LIGHT, i, { configurable: true, enumerable: true, writable: true, value: own[i] });
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
      return { rgba: raster(R.get(part)!.svg, SCALE).data, part, ...(clipTo ? { clipTo } : {}), alpha: rig.parts.find((p) => p.name === part)!.alpha };
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
