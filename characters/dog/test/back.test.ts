// Tests for the dog's back view (the dog seen from behind, its left on the
// viewer's left): its pivots follow the front's rules from this view's own
// landmarks, mirrored where the back shows no landmark of its own; its draw
// order is the one the crop shows (the tail in front of the body, L298); it draws
// exactly the markings phase 2 sighted on its crop, each clipped to its part, and
// no face; its cast shadows ride the bone that casts them, clipped to what they
// fall on (L396); its outer lines are the line rule's (DECISIONS 74, 104); every
// part that turns reaches under the part covering it
// (L394); its placed landmarks lie on their own parts; and its WebGL rest frame
// is the resvg composite of its model-space drawings.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { PNG } from "pngjs";
import type { AtlasSet, Clip, Rig } from "../../../runtime-web/src/format.ts";
import { validate } from "../../../runtime-web/src/format.ts";
import { compile, drawList, evaluatePose } from "../../../runtime-web/src/rig.ts";
import { openStills, type StillInfo, type Stills } from "../../../runtime-web/lab/still.ts";
import { buildPackage, readSource, writePackage } from "../../build/build.ts";
import { restTransform, toBone } from "../../draw/frame.ts";
import { scopeIds } from "../../draw/svg.ts";
import { BOX, composite, type Layer } from "../../draw/test/composite.ts";
import { C, LINES } from "../src/palette.ts";
import { back, landmarks, TAIL_ROOT } from "../src/views/back.ts";

const VIEW = "back";
const json = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const rig = json("../src/rig.json") as Rig;
const model = json("../model.json") as {
  landmarks: Record<string, Record<string, [number, number]>>; proportions: { headHeight: number };
  markings: { id: string; part: string }[]; crops: Record<string, { crop: string }>;
};
const L = model.landmarks[VIEW]!, F = model.landmarks.front!;
const H = model.proportions.headHeight;
const drawn = back();
const pieces = new Map(drawn.map((d) => [d.part, d.piece]));
const order = rig.drawOrder[VIEW]!.flatMap((e) => (e === "@head" ? rig.drawOrder[`head.${VIEW}`]! : [e]));
const part = (name: string) => rig.parts.find((p) => p.name === name)!;

/** Each drawing rendered alone by resvg on BOX at a scale, straight RGBA. */
function rasters(scale: number): Map<string, PNG> {
  return new Map([...pieces].map(([name, p]) => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${BOX.w}" height="${BOX.h}" viewBox="${BOX.x} ${BOX.y} ${BOX.w} ${BOX.h}">${scopeIds(p.svg, "p")}</svg>`;
    return [name, PNG.sync.read(new Resvg(svg, { fitTo: { mode: "zoom", value: scale }, background: "rgba(0,0,0,0)" }).render().asPng())];
  }));
}
const alphaAt = (png: PNG, scale: number, [x, y]: [number, number]) =>
  png.data[(Math.floor((y - BOX.y) * scale) * png.width + Math.floor((x - BOX.x) * scale)) * 4 + 3]! / 255;

test("the back view's pivots follow the front's rules, from the back's own landmarks and the front's mirrored", () => {
  // The back has no chin (DECISIONS 10): the head's lower edge sits on the collar, whose centroid is the neck, as in
  // the profile. The hind paws show only their heels: the hips are as high above the heels' centres as those are
  // above the ground, where this drawing puts them (the sheet has no paw landmark from behind).
  const neck = L.collar!, chestY = neck[1] / 2, hipsY = landmarks["paw.hind.L"]![1] + landmarks["paw.hind.R"]![1];
  const mirror = ([x, y]: [number, number]): [number, number] => [-x, y];
  const rules: Record<string, [number, number]> = {
    root: [0, 0],
    body: [0, 0],
    hips: [0, hipsY],
    // The chest's centre, straight below the neck, halfway down.
    chest: [neck[0], chestY],
    neck,
    head: neck,
    collar: neck,
    // The ears at their roots, 3 pt inside the head, toward its middle (from behind the dog's left ear is on the left).
    "ear.L": [L["ear.L.root"]![0] + 3, L["ear.L.root"]![1]],
    "ear.R": [L["ear.R.root"]![0] - 3, L["ear.R.root"]![1]],
    // What the back hides sits where the front puts it, seen from behind: mirrored across the midline.
    tag: mirror(F["tag.ring"]!),
    "eye.L": mirror(F["eye.L"]!),
    "eye.R": mirror(F["eye.R"]!),
    "brow.L": mirror([F["eye.L"]![0], F["eye.L"]![1] - H / 4]),
    "brow.R": mirror([F["eye.R"]![0], F["eye.R"]![1] - H / 4]),
    mouth: mirror(F.nose!),
    "front.L": [-F["paw.front.L"]![0], chestY],
    "front.R": [-F["paw.front.R"]![0], chestY],
    tuft: [L["head.top"]![0], L["head.top"]![1] + 0.15 * H],
    // Every tail turns at its root.
    tail: TAIL_ROOT,
    "hind.L": [landmarks["paw.hind.L"]![0], hipsY],
    "hind.R": [landmarks["paw.hind.R"]![0], hipsY],
  };
  assert.deepEqual(rig.bones.map((b) => b.name).sort(), Object.keys(rules).sort());
  for (const [bone, [x, y]] of Object.entries(rules)) {
    const m = restTransform(rig, bone, VIEW);
    assert.ok(Math.abs(m.tx - x) < 1e-6 && Math.abs(m.ty - y) < 1e-6, `${bone} is at (${m.tx}, ${m.ty}), its rule puts it at (${x}, ${y})`);
    assert.ok(Math.abs(m.a - 1) < 1e-12 && Math.abs(m.b) < 1e-12, `${bone} is turned at rest`);
  }
  // Mirrored left to right: the dog's left parts are on the viewer's left.
  for (const side of ["ear", "eye", "brow", "front", "hind"]) {
    assert.ok(restTransform(rig, `${side}.L`, VIEW).tx < 0 && restTransform(rig, `${side}.R`, VIEW).tx > 0, `${side}.L is not on the viewer's left`);
  }
  // The tail's root lies on the tail, in its tan root.
  const r = rasters(2);
  assert.ok(alphaAt(r.get("tail")!, 2, TAIL_ROOT) >= 0.5 && alphaAt(r.get("tail.base")!, 2, TAIL_ROOT) >= 0.5, `the tail's pivot (${TAIL_ROOT}) is not on its tan root`);
});

test("the back view's clip and order are the crop's: the tail in front of the body, the ears behind the head", () => {
  const clip = json(`../src/clips/still_${VIEW}.json`) as Clip;
  assert.deepEqual(validate(rig, [clip]), []);
  assert.deepEqual(clip.views, { body: [[0, VIEW]], head: [[0, VIEW]] });
  const at = (name: string) => order.indexOf(name);
  assert.deepEqual([...order].sort(), [...pieces.keys()].sort(), "the order draws every drawing of the view, once");
  assert.ok(at("tail") > at("body.back") && at("tail") > at("back.patch.L") && at("tail") > at("back.patch.R"), "the tail is in front of the body and the saddle (L298)");
  assert.ok(at("ear.L") < at("head.base") && at("ear.R") < at("head.base"), "the ears are behind the head");
  assert.ok(at("tuft") > at("head.base"), "the topknot lies on the crown");
  assert.ok(at("hind.L") < at("body.back") && at("hind.R") < at("body.back"), "the heels peek out from behind the haunches");
  assert.ok(at("collar") > at("head.base") && at("collar") > at("body.back"), "the collar's band lies over the back of the head's foot and the shoulders");
  // Every marking and cast shadow draws right after its own part and the others clipped to it (L397).
  for (const name of order) {
    const clipTo = part(name).clipTo;
    if (clipTo) assert.ok(order.slice(at(clipTo) + 1, at(name)).every((p) => part(p).clipTo === clipTo), `${name} is not right after ${clipTo}`);
  }
});

test("the back view draws the markings phase 2 sighted on its crop, each an overlay clipped to its part, and no face", () => {
  const crop = model.crops[VIEW]!.crop;
  const sighted = (json("../ref/markings.json").evidence as { panel: string; marking: string }[]).filter((e) => e.panel === crop).map((e) => e.marking);
  const markings = new Map(model.markings.map((m) => [m.id, m.part]));
  const shown = [...pieces.keys()].filter((p) => markings.has(p));
  assert.deepEqual(shown.sort(), [...sighted].sort());
  for (const id of shown) {
    assert.equal(part(id).clipTo, markings.get(id), `${id} is clipped to ${part(id).clipTo}`);
    assert.equal(part(id).bone, part(markings.get(id)!).bone, `${id} rides its part's bone`);
  }
  for (const hidden of ["eye.L", "eye.R", "brow.L", "brow.R", "nose", "mouth", "blush.L", "blush.R", "tag", "body.front", "front.L", "front.R"]) {
    assert.ok(!pieces.has(hidden), `${hidden} is drawn from behind`);
  }
});

test("the back view's outer lines are the line rule's, as every view's (DECISIONS 104, 105)", () => {
  // Each lined part draws its line by parts/lines.ts: its ribbons are the ladders' tones.
  const tones = new Set([...LINES.cream, ...LINES.tan]);
  for (const name of ["body.back", "hind.L", "hind.R", "tail", "tuft", "ear.L", "ear.R", "head.line", "back.patch.L", "back.patch.R", "tail.base"]) {
    const fills = [...pieces.get(name)!.svg.matchAll(/<path fill="(#[0-9A-F]{6})" d=/g)].map((m) => m[1]!);
    assert.ok(fills.some((c) => tones.has(c)), `${name} draws no line by the line rule`);
  }
  // The only typed lines left: the collar's rim, as every view types it, and the crown's line over each ear's root (105).
  const src = readFileSync(new URL("../src/views/back.ts", import.meta.url), "utf8");
  assert.equal(src.match(/\boutline: /g)?.length, 1, "a part other than the collar types its own outline");
  assert.equal(src.match(/\bribbons\(/g)?.length, 1, "the back types a line other than the root's stretch");
  for (const gone of ["haunchLine", "haunchShadeLine", "crownWarm", "earFootLine"]) assert.ok(!(gone in C), `palette.ts still holds ${gone}`);
});

test("the back view's cast shadows ride the bone that casts them, clipped to the part they fall on (L396)", () => {
  const casts: Record<string, [string, string]> = { "shadow.ear.L": ["ear.L", "head.base"], "shadow.ear.R": ["ear.R", "head.base"], "shadow.tail": ["tail", "body.back"] };
  for (const [name, [bone, on]] of Object.entries(casts)) {
    assert.ok(pieces.has(name), `${name} is not drawn`);
    assert.equal(part(name).bone, bone, `${name} rides ${part(name).bone}`);
    assert.equal(part(name).clipTo, on, `${name} is clipped to ${part(name).clipTo}`);
  }
});

test("each placed landmark of the back view lies on its own part, the topmost there with alpha 0.5 or more", () => {
  const owner: Record<string, string> = { "paw.hind.L": "hind.L", "paw.hind.R": "hind.R" };
  assert.deepEqual(Object.keys(landmarks).sort(), Object.keys(owner).sort());
  const r = rasters(3);
  for (const [name, p] of Object.entries(landmarks)) {
    const top = order.filter((n) => n !== "shadow" && alphaAt(r.get(n)!, 3, p) >= 0.5).at(-1);
    assert.equal(top, owner[name], `${name} at (${p}) lies on ${top}`);
  }
});

test("every part of the back view that turns runs under the part covering it for 15% of its length or more (L394)", (t) => {
  // Each part, the part covering it where it joins, and its axis from its pivot to its far end (DECISIONS 40): each
  // ear joins the head along its inner side and runs on under it; each heel tucks up under its haunch.
  const scale = 2, r = rasters(scale);
  const covered = (name: string, cover: string, tip: [number, number]) => {
    const pivot = restTransform(rig, part(name).bone, VIEW);
    const ax = tip[0] - pivot.tx, ay = tip[1] - pivot.ty, length = Math.hypot(ax, ay);
    const own = r.get(name)!, over = r.get(cover)!;
    let lo = Infinity, hi = -Infinity, hidLo = Infinity, hidHi = -Infinity;
    for (let j = 0; j < own.height; j++) {
      for (let i = 0; i < own.width; i++) {
        const k = (j * own.width + i) * 4 + 3;
        if (own.data[k]! < 128) continue;
        const x = BOX.x + (i + 0.5) / scale, y = BOX.y + (j + 0.5) / scale;
        const s = ((x - pivot.tx) * ax + (y - pivot.ty) * ay) / length;
        lo = Math.min(lo, s);
        hi = Math.max(hi, s);
        if (over.data[k]! >= 128) {
          hidLo = Math.min(hidLo, s);
          hidHi = Math.max(hidHi, s);
        }
      }
    }
    return { share: (hidHi - hidLo) / (hi - lo), length: hi - lo };
  };
  const cases: [string, string, [number, number]][] = [
    ["ear.L", "head.base", L["ear.L.tip"]!], ["ear.R", "head.base", L["ear.R.tip"]!],
    ["hind.L", "body.back", [landmarks["paw.hind.L"]![0], 0]], ["hind.R", "body.back", [landmarks["paw.hind.R"]![0], 0]],
  ];
  for (const [name, cover, tip] of cases) {
    const { share, length } = covered(name, cover, tip);
    t.diagnostic(`${name}: ${(share * 100).toFixed(0)}% of its ${length.toFixed(0)} pt under ${cover}`);
    assert.ok(share >= 0.15, `${name} reaches ${(share * 100).toFixed(0)}% of its ${length.toFixed(0)} pt under ${cover}`);
  }
});

test("the back view's ears come out from under the crown: above the crown's lowest lock tips no ear shows", () => {
  // The sheet draws each ear's root under the crown's fringe, its top never seen: the crown's line runs on into the
  // ear's outer edge at the lowest lock's tip, (-41.6, -144) on the left and (44, -143.6) on the right (DECISIONS 89).
  const scale = 3, r = rasters(scale), head = r.get("head.base")!;
  for (const [side, tipY] of [["L", -144], ["R", -143.6]] as const) {
    const ear = r.get(`ear.${side}`)!;
    let shown = 0, at = "";
    for (let j = 0; j < ear.height; j++) {
      const y = BOX.y + (j + 0.5) / scale;
      if (y > tipY - 0.6) break;
      for (let i = 0; i < ear.width; i++) {
        const k = (j * ear.width + i) * 4 + 3;
        if (ear.data[k]! >= 128 && head.data[k]! < 128) {
          shown++;
          at ||= `(${(BOX.x + (i + 0.5) / scale).toFixed(1)}, ${y.toFixed(1)})`;
        }
      }
    }
    assert.equal(shown, 0, `ear.${side} shows ${shown} px above its root's lock tip, from ${at}`);
  }
});

test("the back view's head rests on the collar's ends: beside each end the ground shows only below the band's middle", () => {
  // On the sheet the head's lower fur stays full down onto the collar, and the notch between the ear, the head and the
  // shoulder opens only from y -71 (the band's ends run from -70 to -62): no gap above it beside either end.
  const r = rasters(2);
  const drawn = order.filter((n) => n !== "shadow").map((n) => r.get(n)!);
  const gaps: string[] = [];
  for (const sx of [-1, 1]) {
    for (let x = 30; x <= 37.6; x += 0.5) {
      for (let y = -82; y <= -71.8; y += 0.5) {
        if (!drawn.some((png) => alphaAt(png, 2, [sx * x, y]) >= 0.5)) gaps.push(`(${sx * x}, ${y})`);
      }
    }
  }
  assert.equal(gaps.length, 0, `the ground shows beside the collar's ends at ${gaps.slice(0, 4).join(" ")}`);
});

test("moving a pivot leaves the back view's rest frame where it was", () => {
  const moved: Rig = { ...rig, bones: rig.bones.map((b, i) => {
    if (!b.parent) return b;
    const v = b.views?.[VIEW] ?? {};
    return { ...b, views: { ...b.views, [VIEW]: { ...v, x: (v.x ?? b.x ?? 0) + 0.37 * i, y: (v.y ?? b.y ?? 0) - 0.21 * i } } };
  }) };
  const quads = (rr: Rig) => {
    const set: AtlasSet = { name: "1x", scale: 1, pages: [{ file: "p", scale: 1, width: 4096, height: 4096 }], regions: {} };
    for (const d of drawn.map((x) => toBone(x.part, rr, VIEW, x.piece, x.state))) {
      const [, , w, h] = /viewBox="([^"]+)"/.exec(d.svg)![1]!.split(" ").map(Number);
      set.regions[d.region] = { page: 0, x: 0, y: 0, w: w!, h: h!, anchorX: d.anchor[0], anchorY: d.anchor[1] };
    }
    const c = compile(rr);
    const views = { body: VIEW, head: VIEW };
    return new Map(drawList(c, evaluatePose(c, { channels: {}, views }), set, { views, states: {} }).map((i) => [i.region, i.positions]));
  };
  const before = quads(rig), after = quads(moved);
  assert.equal(before.size, pieces.size, "every back drawing is in the draw list");
  for (const [region, positions] of before) after.get(region)!.forEach((v, k) => assert.ok(Math.abs(v - positions[k]!) < 1e-9, `${region} moved`));
});

// The rest frame through WebGL, as webgl.test.ts holds the front's.
const SCALE = 3;
const dir = mkdtempSync(join(tmpdir(), "huddlings-back-"));
let stills: Stills;
let info: StillInfo;
before(async () => {
  writePackage(await buildPackage(await readSource("dog")), join(dir, "package"));
  stills = await openStills(join(dir, "package"));
  await stills.load(SCALE);
  info = await stills.render(`still_${VIEW}`, join(dir, VIEW));
});
after(async () => {
  await stills?.close();
  rmSync(dir, { recursive: true, force: true });
});

test("the back view's rest frame has no hole: every pixel inside the dog's outline is covered", () => {
  // Where parts meet (the ears under the crown's crescents, the heels under the haunches, the collar's ends) a gap
  // would show the ground through the dog: flood the background in from the still's border, and every pixel it cannot
  // reach must be covered by half or more.
  const white = PNG.sync.read(readFileSync(join(dir, VIEW, "white.png"))), black = PNG.sync.read(readFileSync(join(dir, VIEW, "black.png")));
  const [w, h] = info.sizePx;
  const covered = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const k = i * 4;
    const alpha = 1 - (white.data[k]! - black.data[k]! + white.data[k + 1]! - black.data[k + 1]! + white.data[k + 2]! - black.data[k + 2]!) / 3 / 255;
    covered[i] = alpha >= 0.5 ? 1 : 0;
  }
  const outside = new Uint8Array(w * h);
  const stack: number[] = [];
  for (let i = 0; i < w; i++) stack.push(i, (h - 1) * w + i);
  for (let j = 0; j < h; j++) stack.push(j * w, j * w + w - 1);
  while (stack.length) {
    const i = stack.pop()!;
    if (outside[i] || covered[i]) continue;
    outside[i] = 1;
    const x = i % w, y = (i - x) / w;
    if (x > 0) stack.push(i - 1);
    if (x < w - 1) stack.push(i + 1);
    if (y > 0) stack.push(i - w);
    if (y < h - 1) stack.push(i + w);
  }
  const holes: string[] = [];
  for (let i = 0; i < w * h; i++) {
    if (!covered[i] && !outside[i]) holes.push(`(${((i % w - info.rootPx[0]) / SCALE).toFixed(1)}, ${((Math.floor(i / w) - info.rootPx[1]) / SCALE).toFixed(1)})`);
  }
  assert.equal(holes.length, 0, `${holes.length} uncovered pixels inside the outline, from ${holes.slice(0, 4).join(" ")}`);
});

test("the WebGL still of the back view reproduces the resvg composite of its model-space drawings", (t) => {
  const png = (name: string) => PNG.sync.read(readFileSync(join(dir, VIEW, name)));
  const white = png("white.png"), black = png("black.png");
  assert.deepEqual([...info.drawn].sort(), [...pieces.keys()].sort(), "the still draws every drawing of the view");
  const W = BOX.w * SCALE, HH = BOX.h * SCALE;
  const r = rasters(SCALE);
  const layers: Layer[] = info.drawn.map((name) => {
    const clipTo = part(name).clipTo;
    return { rgba: r.get(name)!.data, part: name, ...(clipTo ? { clipTo } : {}) };
  });
  const reference = composite(layers, W, HH);
  const dx = info.rootPx[0] + SCALE * BOX.x, dy = info.rootPx[1] + SCALE * BOX.y;
  assert.ok(Number.isInteger(dx) && Number.isInteger(dy));
  const [w, h] = info.sizePx;
  let sum = 0, count = 0, worst = 0, covered = 0;
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
      if (want(3) > 0.5) covered++;
    }
  }
  const mean = sum / count;
  t.diagnostic(`WebGL against resvg over ${w} × ${h} px (${covered} covered): mean difference ${mean.toFixed(4)}/255, largest ${worst.toFixed(2)}/255`);
  assert.ok(covered > 0.3 * w * h, "the dog covers the still");
  assert.ok(mean < 0.1, `mean difference ${mean.toFixed(4)}/255`);
  assert.ok(worst <= 2, `largest difference ${worst.toFixed(2)}/255`);
});
