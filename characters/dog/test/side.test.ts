// Tests for the dog's side view (side.L, facing the sheet's left): its pivots
// follow the front's rules from this view's landmarks, its draw order is the one
// read off the side crop, it draws every part the crop shows and the markings
// this facing shows, each clipped to its part, its nose has no rim of another
// colour, its placed landmarks lie on their own parts, its far leg is darker but
// warm, and its WebGL rest frame matches the resvg composite of its model-space
// drawings.
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
import { BOX, composite, resvgLayers } from "../../draw/test/composite.ts";
import { C } from "../src/palette.ts";
import { landmarks, side, TAIL_ROOT } from "../src/views/side.ts";

const VIEW = "side.L";
const json = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const rig = json("../src/rig.json") as Rig;
const model = json("../model.json") as { landmarks: Record<string, Record<string, [number, number]>>; proportions: { headHeight: number }; markings: { id: string; part: string; side: string }[] };
const L = model.landmarks[VIEW]!;
const H = model.proportions.headHeight;
const order = () => rig.drawOrder[VIEW]!.flatMap((e) => (e === "@head" ? rig.drawOrder[`head.${VIEW}`]! : [e]));

test("the side view's pivots follow the front's rules from its own landmarks", () => {
  // The profile has no chin (DECISIONS 10): the head's lower edge sits on the collar, whose centroid is the neck.
  const neck = L.collar!, hipsY = 2 * L["paw.hind.L"]![1], chestY = neck[1] / 2;
  const shoulder: [number, number] = [L["paw.front.L"]![0], chestY];
  const rules: Record<string, [number, number]> = {
    // The ground under the seat, which the body sits on, under the haunch (DECISIONS 9).
    root: [0, 0],
    body: [0, 0],
    // The top of the hind leg, as high above the hind paw's centre as that is above the ground; the chest's centre,
    // halfway up to the neck, straight below it.
    hips: [0, hipsY],
    chest: [neck[0], chestY],
    neck,
    head: neck,
    collar: neck,
    tag: L["tag.ring"]!,
    // The ear at its root, 3 pt inside the head: down, under the crown's fur it comes out from.
    "ear.L": [L["ear.L.root"]![0], L["ear.L.root"]![1] + 3],
    "eye.L": L["eye.L"]!,
    "brow.L": [L["eye.L"]![0], L["eye.L"]![1] - H / 4],
    mouth: L.nose!,
    tuft: [L["head.top"]![0], L["head.top"]![1] + 0.15 * H],
    // Every tail turns at its root: on the rump, where the drawing's tail leaves the body.
    tail: TAIL_ROOT,
    // Both front legs at the near shoulder, straight above the near paw (the far paw sits ahead of the chest's edge);
    // the hind leg at the hip, straight above its paw.
    "front.L": shoulder,
    "front.R": shoulder,
    "hind.L": [L["paw.hind.L"]![0], hipsY],
  };
  for (const [bone, [x, y]] of Object.entries(rules)) {
    const m = restTransform(rig, bone, VIEW);
    assert.ok(Math.abs(m.tx - x) < 1e-6 && Math.abs(m.ty - y) < 1e-6, `${bone} is at (${m.tx}, ${m.ty}), its rule puts it at (${x}, ${y})`);
    assert.ok(Math.abs(m.a - 1) < 1e-12 && Math.abs(m.b) < 1e-12, `${bone} is turned at rest`);
  }
  // Every bone a side part rides has its rule.
  const used = new Set(rig.parts.filter((p) => Object.keys(p.regions).some((k) => k.split(":")[0] === VIEW)).map((p) => p.bone));
  for (const bone of used) assert.ok(bone in rules, `${bone} carries a side part but has no rule`);
});

test("the side view's clip is sound and its order is the one read off the crop", () => {
  const clip = json(`../src/clips/still_${VIEW}.json`) as Clip;
  assert.deepEqual(validate(rig, [clip]), []);
  assert.deepEqual(clip.views, { body: [[0, VIEW]], head: [[0, VIEW]] });
  // The crop's mouth is the closed smile.
  assert.deepEqual(clip.states, { mouth: [[0, "smile"]] });
  const stages = [
    ["shadow"],
    // The tail lies behind the rump; the far front leg behind the chest, its paw ahead of the near one.
    ["tail", "tail.base"], ["front.R"],
    // The haunch lies over the chest (its front arc is drawn on it); the hind paw and the near front leg in front of both.
    ["body.front"], ["body.back", "back.patch.L", "rump.patch.L"], ["hind.L"], ["front.L"],
    // The collar over the neck, the tag over the legs' tops, the chin over the collar.
    ["collar"], ["tag"],
    ["head.base", "head.patch.L", "blush.L", "eye.L", "brow.L", "nose", "mouth"], ["head.line"],
    // The near ear lies over the head's side, its top under the topknot's fur.
    ["ear.L"], ["tuft"],
  ];
  assert.deepEqual(order(), stages.flat());
});

test("the side view draws every part the crop shows, and the markings this facing shows, each clipped to its part", () => {
  const drawn = side().map((d) => d.part);
  assert.deepEqual([...drawn].sort(), [...order()].sort(), "the view draws exactly the parts its order lists");
  // The profile hides the far eye, ear, brow, cheek and hind paw, and the right side's patches.
  for (const hidden of ["eye.R", "ear.R", "brow.R", "blush.R", "hind.R", "head.patch.R", "back.patch.R"]) assert.ok(!drawn.includes(hidden), `${hidden} is drawn`);
  const parts = new Map(rig.parts.map((p) => [p.name, p]));
  // ref/markings.json's sightings on the side crop.
  for (const id of ["head.patch.L", "back.patch.L", "tail.base", "rump.patch.L"]) {
    const m = model.markings.find((k) => k.id === id)!;
    assert.ok(drawn.includes(id), `${id} is not drawn`);
    assert.equal(parts.get(id)!.clipTo, m.part, `${id} is clipped to ${parts.get(id)!.clipTo}`);
    assert.equal(parts.get(id)!.bone, parts.get(m.part)!.bone, `${id} rides its part's bone`);
  }
});

test("the far leg is darker than the near one by 6 to 10%, and warm", () => {
  const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const luma = (h: string) => { const [r, g, b] = rgb(h); return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!; };
  const warmth = (h: string) => { const [r, , b] = rgb(h); return r! - b!; };
  const far = side().find((d) => d.part === "front.R")!.piece.svg, near = side().find((d) => d.part === "front.L")!.piece.svg;
  assert.ok(far.includes(`fill="${C.farFur}"`) && near.includes(`fill="${C.fur}"`), "the legs are filled with the fur and the far fur");
  const darker = 1 - luma(C.farFur) / luma(C.fur);
  assert.ok(darker >= 0.06 && darker <= 0.1, `the far fur is ${(darker * 100).toFixed(1)}% darker`);
  // Darkened through the fur's own warm shade, it is warmer than the fur, never greyer (spec L369, Q27).
  assert.ok(warmth(C.farFur) > warmth(C.fur), `the far fur ${C.farFur} is no warmer than the fur ${C.fur}`);
});

test("the nose is the profile's tip with no rim: the head's line round its front is the nose's own near-black", () => {
  // Each piece on its own at 4 px per pt over the head's front, as resvg draws it.
  const draw = (part: string) => {
    const p = side().find((d) => d.part === part)!.piece;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="-110 -110 20 20">${scopeIds(p.svg, "p")}</svg>`;
    return PNG.sync.read(new Resvg(svg, { fitTo: { mode: "zoom", value: 4 } }).render().asPng());
  };
  const nose = draw("nose"), line = draw("head.line");
  const at = (png: PNG, i: number, j: number) => [0, 1, 2, 3].map((c) => png.data[(j * png.width + i) * 4 + c]!);
  // Across the nose's height round its landmark, the head's line within 1 pt in front of the nose's own front edge.
  let seen = 0;
  for (let y = L.nose![1] - 3; y <= L.nose![1] + 3; y += 0.5) {
    const j = Math.floor((y + 110) * 4);
    const front = Array.from({ length: 80 }, (_, i) => i).find((i) => at(nose, i, j)[3]! >= 128);
    assert.ok(front !== undefined, `the nose has no pixels at y ${y}`);
    for (let i = Math.max(0, front - 4); i <= front + 1; i++) {
      const [r, g, b, a] = at(line, i, j);
      if (a! < 128) continue;
      seen++;
      assert.ok(Math.max(r!, g!, b!) < 80, `the head's line at (${(i / 4 - 110).toFixed(2)}, ${y}) is rgb(${r}, ${g}, ${b}), not the nose's near-black`);
    }
  }
  assert.ok(seen > 0, "the head's line covers the nose's front edge nowhere");
});

test("each placed landmark lies on its own part, the topmost there with alpha 0.5 or more", () => {
  const owner: Record<string, string> = { "paw.front.L": "front.L", "paw.front.R": "front.R", "paw.hind.L": "hind.L", "tag.ring": "tag", seat: "body.back" };
  assert.deepEqual(Object.keys(landmarks).sort(), Object.keys(owner).sort());
  const pieces = new Map(side().map((d) => [d.part, d.piece]));
  const alpha = new Map<string, (p: [number, number]) => number>();
  for (const [part, p] of pieces) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="190" viewBox="-100 -180 200 190">${scopeIds(p.svg, "p")}</svg>`;
    const png = PNG.sync.read(new Resvg(svg, { fitTo: { mode: "zoom", value: 3 } }).render().asPng());
    alpha.set(part, ([x, y]) => png.data[(Math.floor((y + 180) * 3) * png.width + Math.floor((x + 100) * 3)) * 4 + 3]! / 255);
  }
  for (const [name, p] of Object.entries(landmarks)) {
    const top = order().filter((part) => part !== "shadow" && alpha.get(part)?.(p)! >= 0.5).at(-1);
    assert.equal(top, owner[name], `${name} at (${p}) lies on ${top}`);
  }
});

test("moving a pivot leaves the side view's rest frame where it was", () => {
  const moved: Rig = { ...rig, bones: rig.bones.map((b, i) => (b.parent ? { ...b, views: { ...b.views, [VIEW]: { x: (b.views?.[VIEW]?.x ?? b.x ?? 0) + 0.37 * i, y: (b.views?.[VIEW]?.y ?? b.y ?? 0) - 0.21 * i } } } : b)) };
  const quads = (r: Rig) => {
    const drawings = side().map((d) => toBone(d.part, r, VIEW, d.piece, d.state));
    const set: AtlasSet = { name: "1x", scale: 1, pages: [{ file: "p", scale: 1, width: 4096, height: 4096 }], regions: {} };
    for (const d of drawings) {
      const [, , w, h] = /viewBox="([^"]+)"/.exec(d.svg)![1]!.split(" ").map(Number);
      set.regions[d.region] = { page: 0, x: 0, y: 0, w: w!, h: h!, anchorX: d.anchor[0], anchorY: d.anchor[1] };
    }
    const c = compile(r);
    const views = { body: VIEW, head: VIEW };
    return new Map(drawList(c, evaluatePose(c, { channels: {}, views }), set, { views, states: { mouth: "smile" } }).map((i) => [i.region, i.positions]));
  };
  const before = quads(rig), after = quads(moved);
  assert.equal(before.size, side().length, "every side drawing is in the draw list");
  for (const [region, positions] of before) {
    after.get(region)!.forEach((v, k) => assert.ok(Math.abs(v - positions[k]!) < 1e-9, `${region} moved`));
  }
});

// The rest frame through WebGL, as the front's (characters/draw/test/webgl.test.ts).
const SCALE = 3;
const W = BOX.w * SCALE, Hpx = BOX.h * SCALE;
const dir = mkdtempSync(join(tmpdir(), "huddlings-side-"));
let stills: Stills;
let info: StillInfo;
const png = (name: string) => PNG.sync.read(readFileSync(join(dir, "still", name)));

before(async () => {
  writePackage(await buildPackage(await readSource("dog")), join(dir, "package"));
  stills = await openStills(join(dir, "package"));
  await stills.load(SCALE);
  info = await stills.render(`still_${VIEW}`, join(dir, "still"));
});
after(async () => {
  await stills?.close();
  rmSync(dir, { recursive: true, force: true });
});

test("the WebGL still of the dog's side reproduces the resvg composite of its model-space drawings", () => {
  const white = png("white.png"), black = png("black.png");
  const pieces = new Map(side().map((d) => [d.part, d.piece]));
  const clipOf = (name: string) => rig.parts.find((p) => p.name === name)!.clipTo;
  assert.deepEqual([...info.drawn].sort(), [...pieces.keys()].sort(), "the still draws every drawing of the view");
  const reference = composite(resvgLayers(info.drawn, pieces, clipOf, SCALE), W, Hpx);
  const dx = info.rootPx[0] + SCALE * BOX.x, dy = info.rootPx[1] + SCALE * BOX.y;
  assert.ok(Number.isInteger(dx) && Number.isInteger(dy));
  const [w, h] = info.sizePx;
  let sum = 0, count = 0, worst = 0;
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const k = (j * w + i) * 4;
      const alpha = 1 - (white.data[k]! - black.data[k]! + white.data[k + 1]! - black.data[k + 1]! + white.data[k + 2]! - black.data[k + 2]!) / 3 / 255;
      const u = i - dx, v = j - dy;
      const inside = u >= 0 && v >= 0 && u < W && v < Hpx;
      const want = (c: number) => (inside ? reference[(v * W + u) * 4 + c]! : 0);
      for (const [got, c] of [[black.data[k]! / 255, 0], [black.data[k + 1]! / 255, 1], [black.data[k + 2]! / 255, 2], [alpha, 3]] as const) {
        const d = Math.abs(got - want(c)) * 255;
        sum += d;
        count++;
        worst = Math.max(worst, d);
      }
    }
  }
  assert.ok(sum / count < 0.1, `mean difference ${(sum / count).toFixed(4)}/255`);
  assert.ok(worst <= 2, `largest difference ${worst.toFixed(2)}/255`);
});
