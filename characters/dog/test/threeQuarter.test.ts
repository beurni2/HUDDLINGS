// Tests for the dog's three-quarter view (threeQuarter.L): its rest pivots follow
// the front's rules from this view's own landmarks in model.json, its draw order
// is the one the crop shows (L298, L369), it draws exactly the markings phase 2
// sighted on its crop, each clipped to its part, every part that turns reaches
// under the part covering it (L394), its far legs are darker and warm (L369), and
// its WebGL rest frame is the resvg composite of its model-space drawings.
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
import { scopeIds, type Piece } from "../../draw/svg.ts";
import { composite, type Layer } from "../../draw/test/composite.ts";
import { C } from "../src/palette.ts";
import { landmarks, threeQuarter } from "../src/views/threeQuarter.ts";

const VIEW = "threeQuarter.L";
const json = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const rig = json("../src/rig.json") as Rig;
const model = json("../model.json") as {
  landmarks: Record<string, Record<string, [number, number]>>; proportions: { headWidth: number; headHeight: number };
  markings: { id: string; part: string }[]; crops: Record<string, { crop: string }>;
};
const L = model.landmarks[VIEW]!;
const H = model.proportions.headHeight;
const drawn = threeQuarter();
const pieces = new Map(drawn.map((d) => [d.part, d.piece]));
const order = rig.drawOrder[VIEW]!.flatMap((e) => (e === "@head" ? rig.drawOrder[`head.${VIEW}`]! : [e]));

/** The model-space canvas for this view, in whole points: the turned dog with room around it. */
const BOX = { x: -130, y: -180, w: 190, h: 190 };
/** Each drawing rendered alone by resvg on BOX at a scale, straight RGBA. */
function rasters(scale: number): Map<string, PNG> {
  return new Map([...pieces].map(([part, p]) => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${BOX.w}" height="${BOX.h}" viewBox="${BOX.x} ${BOX.y} ${BOX.w} ${BOX.h}">${scopeIds(p.svg, "p")}</svg>`;
    return [part, PNG.sync.read(new Resvg(svg, { fitTo: { mode: "zoom", value: scale }, background: "rgba(0,0,0,0)" }).render().asPng())];
  }));
}
const alphaAt = (png: PNG, scale: number, [x, y]: [number, number]) =>
  png.data[(Math.floor((y - BOX.y) * scale) * png.width + Math.floor((x - BOX.x) * scale)) * 4 + 3]! / 255;

test("the three-quarter view's pivots are set by the front's rules from its own landmarks", () => {
  const chin = L.chin!, hipsY = 2 * L["paw.hind.L"]![1], chestY = chin[1] / 2;
  // The head turns at the neck: the centre of the head's lower edge (the collar's centre across), at the chin.
  const neckX = L.collar![0];
  const rules: Record<string, [number, number]> = {
    root: [0, 0],
    body: [0, 0],
    // The top of the hind legs, as high above the hind paw's centre as that is above the ground (one hind paw shows).
    hips: [0, hipsY],
    // The chest's centre, under the neck and halfway up to the chin.
    chest: [neckX, chestY],
    neck: [neckX, chin[1]],
    head: [neckX, chin[1]],
    collar: [neckX, chin[1]],
    tag: L["tag.ring"]!,
    // Ears at their roots, 3 pt inside the head: the near (left) ear's toward the face, the far one's toward it too.
    "ear.L": [L["ear.L.root"]![0] - 3, L["ear.L.root"]![1]],
    "ear.R": [L["ear.R.root"]![0] + 3, L["ear.R.root"]![1]],
    "eye.L": L["eye.L"]!,
    "eye.R": L["eye.R"]!,
    "brow.L": [L["eye.L"]![0], L["eye.L"]![1] - H / 4],
    "brow.R": [L["eye.R"]![0], L["eye.R"]![1] - H / 4],
    mouth: L.nose!,
    tuft: [L["head.top"]![0], L["head.top"]![1] + 0.15 * H],
    // Legs at the shoulder and the hip, straight above their paws.
    "front.L": [L["paw.front.L"]![0], chestY],
    "front.R": [L["paw.front.R"]![0], chestY],
    "hind.L": [L["paw.hind.L"]![0], hipsY],
  };
  for (const [bone, [x, y]] of Object.entries(rules)) {
    const m = restTransform(rig, bone, VIEW);
    assert.ok(Math.abs(m.tx - x) < 1e-6 && Math.abs(m.ty - y) < 1e-6, `${bone} is at (${m.tx}, ${m.ty}), its rule puts it at (${x}, ${y})`);
    assert.ok(Math.abs(m.a - 1) < 1e-12 && Math.abs(m.b) < 1e-12, `${bone} is turned at rest`);
  }
  // The tail turns at its root: on the tail and hidden under the haunch, so it swings about a point the body covers.
  const scale = 2, r = rasters(scale), t = restTransform(rig, "tail", VIEW);
  assert.ok(alphaAt(r.get("tail")!, scale, [t.tx, t.ty]) >= 0.5 && alphaAt(r.get("body.back")!, scale, [t.tx, t.ty]) >= 0.5, `the tail's pivot (${t.tx}, ${t.ty}) is not at its hidden root`);
  // The far hind leg is hidden in this view and draws nothing.
  assert.equal(rig.parts.find((p) => p.name === "hind.R")!.regions[VIEW], undefined);
});

test("the three-quarter view's clip and order are the crop's: ears behind the head, the tail and the far leg behind the body, the near front paw in front", () => {
  const clips = ["still_front", `still_${VIEW}`].map((name) => json(`../src/clips/${name}.json`) as Clip);
  assert.deepEqual(validate(rig, clips), []);
  assert.deepEqual(clips[1]!.views, { body: [[0, VIEW]], head: [[0, VIEW]] });
  const at = (part: string) => order.indexOf(part);
  assert.deepEqual([...order].sort(), [...pieces.keys()].sort(), "the order draws every drawing of the view, once");
  assert.ok(at("tail") < at("body.back"), "the tail is behind the body (L298)");
  assert.ok(at("ear.R") < at("head.base") && at("ear.L") < at("head.base"), "the ears are behind the head (L298)");
  assert.ok(at("front.R") < at("body.front"), "the far front leg sits behind the chest (L369)");
  assert.ok(at("front.L") > at("body.front") && at("front.L") > at("collar"), "the near front paw is in front of the chest (L298)");
  assert.ok(at("hind.L") > at("body.back") && at("hind.L") < at("body.front"), "the near hind paw lies on the haunch, behind the chest");
  assert.ok(at("collar") < at("head.base") && at("tag") < at("head.base"), "the chin overlaps the collar");
  // Every marking draws right after its own part and the markings before it (L397).
  for (const part of order) {
    const clipTo = rig.parts.find((p) => p.name === part)!.clipTo;
    if (clipTo) assert.ok(order.slice(at(clipTo) + 1, at(part)).every((p) => rig.parts.find((q) => q.name === p)!.clipTo === clipTo), `${part} is not right after ${clipTo}`);
  }
});

test("the three-quarter view draws the markings phase 2 sighted on its crop, each an overlay clipped to its part", () => {
  const crop = model.crops[VIEW]!.crop;
  const sighted = (json("../ref/markings.json").evidence as { panel: string; marking: string }[]).filter((e) => e.panel === crop).map((e) => e.marking);
  const markings = new Map(model.markings.map((m) => [m.id, m.part]));
  const shown = [...pieces.keys()].filter((p) => markings.has(p) || /\.patch\.|tail\.base/.test(p));
  assert.deepEqual(shown.sort(), [...sighted].sort());
  for (const id of shown) {
    const part = rig.parts.find((p) => p.name === id)!;
    assert.equal(part.clipTo, markings.get(id), `${id} is clipped to ${part.clipTo}`);
    assert.equal(part.bone, rig.parts.find((p) => p.name === markings.get(id))!.bone, `${id} rides its part's bone`);
  }
});

test("each placed landmark of the three-quarter view lies on its own part, the topmost there with alpha 0.5 or more, near the sheet's", () => {
  const owner: Record<string, string> = { "paw.front.L": "front.L", "paw.front.R": "front.R", "paw.hind.L": "hind.L", "tag.ring": "tag", seat: "body.back" };
  assert.deepEqual(Object.keys(landmarks).sort(), Object.keys(owner).sort());
  const scale = 3, r = rasters(scale);
  for (const [name, p] of Object.entries(landmarks)) {
    const top = order.filter((part) => part !== "shadow" && alphaAt(r.get(part)!, scale, p) >= 0.5).at(-1);
    assert.equal(top, owner[name], `${name} at (${p}) lies on ${top}`);
    const sheet = L[name];
    if (sheet) assert.ok(Math.hypot(p[0] - sheet[0], p[1] - sheet[1]) < 0.03 * model.proportions.headWidth, `${name} is ${Math.hypot(p[0] - sheet[0], p[1] - sheet[1]).toFixed(1)} pt from the sheet's`);
  }
});

test("every part of the three-quarter view that turns runs under the part covering it for 15% of its length or more (L394)", (t) => {
  // Each part, the part covering it where it joins, and its axis, from its pivot to its far end. What lies under the
  // cover is measured along that axis: the tail's and the far leg's ends tuck under the body at their roots, while in
  // this view each ear joins the head along its inner side, so what keeps a turn from opening a gap is how far along
  // its length it runs on under the head (DECISIONS 40).
  const scale = 2, r = rasters(scale);
  const covered = (part: string, cover: string, tip: [number, number]) => {
    const pivot = restTransform(rig, rig.parts.find((p) => p.name === part)!.bone, VIEW);
    const ax = tip[0] - pivot.tx, ay = tip[1] - pivot.ty, length = Math.hypot(ax, ay);
    const own = r.get(part)!, over = r.get(cover)!;
    let lo = Infinity, hi = -Infinity, hidLo = Infinity, hidHi = -Infinity;
    for (let j = 0; j < own.height; j++) {
      for (let i = 0; i < own.width; i++) {
        const k = (j * own.width + i) * 4 + 3;
        if (own.data[k]! < 128) continue;
        const x = BOX.x + (i + 0.5) / scale, y = BOX.y + (j + 0.5) / scale;
        const t = ((x - pivot.tx) * ax + (y - pivot.ty) * ay) / length;
        lo = Math.min(lo, t);
        hi = Math.max(hi, t);
        if (over.data[k]! >= 128) {
          hidLo = Math.min(hidLo, t);
          hidHi = Math.max(hidHi, t);
        }
      }
    }
    return { share: (hidHi - hidLo) / (hi - lo), length: hi - lo };
  };
  const cases: [string, string, [number, number]][] = [
    ["ear.L", "head.base", L["ear.L.tip"]!], ["ear.R", "head.base", L["ear.R.tip"]!],
    ["front.R", "body.front", L["paw.front.R"]!], ["tail", "body.back", [40, -50]],
  ];
  for (const [part, cover, tip] of cases) {
    const { share, length } = covered(part, cover, tip);
    t.diagnostic(`${part}: ${(share * 100).toFixed(0)}% of its ${length.toFixed(0)} pt under ${cover}`);
    assert.ok(share >= 0.15, `${part} reaches ${(share * 100).toFixed(0)}% of its ${length.toFixed(0)} pt under ${cover}`);
  }
});

test("the far front leg is 6 to 10% darker than the near one and stays warm (L369)", () => {
  const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const mean = (h: string) => rgb(h).reduce((a, b) => a + b) / 3;
  const darker = 1 - mean(C.farFur) / mean(C.fur);
  assert.ok(darker >= 0.06 && darker <= 0.1, `the far leg is ${(darker * 100).toFixed(1)}% darker`);
  // Warm, not grey: its red channel stays the highest and its blue falls furthest, as the fur's own shade does.
  const [r, g, b] = rgb(C.farFur), [fr, fg, fb] = rgb(C.fur);
  assert.ok(r! > g! && g! > b! && r! - b! > fr! - fb!, `${C.farFur} is not warmer than the fur ${C.fur}`);
  assert.equal(drawn.filter((d) => d.part === "front.R").length, 1);
  assert.ok(pieces.get("front.R")!.svg.includes(`fill="${C.farFur}"`), "the far leg is drawn in the far legs' fur");
});

test("moving a pivot leaves the three-quarter rest frame where it was", () => {
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
  assert.equal(before.size, pieces.size);
  for (const [region, positions] of before) after.get(region)!.forEach((v, k) => assert.ok(Math.abs(v - positions[k]!) < 1e-9, `${region} moved`));
});

// The rest frame through WebGL, as webgl.test.ts holds the front's.
const SCALE = 3;
const dir = mkdtempSync(join(tmpdir(), "huddlings-3q-"));
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

test("the WebGL still of the three-quarter view reproduces the resvg composite of its model-space drawings", (t) => {
  const png = (name: string) => PNG.sync.read(readFileSync(join(dir, VIEW, name)));
  const white = png("white.png"), black = png("black.png");
  assert.deepEqual([...info.drawn].sort(), [...pieces.keys()].sort(), "the still draws every drawing of the view");
  const W = BOX.w * SCALE, HH = BOX.h * SCALE;
  const r = rasters(SCALE);
  const layers: Layer[] = info.drawn.map((part) => {
    const clipTo = rig.parts.find((p) => p.name === part)!.clipTo;
    return { rgba: r.get(part)!.data, part, ...(clipTo ? { clipTo } : {}) };
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
