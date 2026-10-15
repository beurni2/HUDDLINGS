// Tests for the dog's source: the rest rig's pivots follow their rules from
// model.json, the draw order follows spec L397, markings are overlays on their
// own parts, and the package builds lint clean, its landmarks and report kept
// out of it as development output for build/dev/dog/.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { PNG } from "pngjs";
import type { AtlasSet, Clip, Rig } from "../../../runtime-web/src/format.ts";
import { validate } from "../../../runtime-web/src/format.ts";
import { compile, drawList, evaluatePose } from "../../../runtime-web/src/rig.ts";
import { buildPackage, devFolder, packageFolder, readSource } from "../../build/build.ts";
import { restTransform, toBone } from "../../draw/frame.ts";
import { scopeIds } from "../../draw/svg.ts";
import { front, landmarks } from "../src/views/front.ts";

const json = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const rig = json("../src/rig.json") as Rig;
const model = json("../model.json") as { landmarks: { front: Record<string, [number, number]> }; proportions: { headWidth: number; headHeight: number }; markings: { id: string; part: string }[] };
const L = model.landmarks.front;
const H = model.proportions.headHeight;

test("the front view's pivots are set by rule from model.json's landmarks", () => {
  const chin = L.chin!, hipsY = L["paw.hind.L"]![1] + L["paw.hind.R"]![1], chestY = chin[1] / 2;
  const rules: Record<string, [number, number]> = {
    // The ground under the seat, which the body sits on (DECISIONS 9).
    root: [0, 0],
    body: [0, 0],
    // The top of the hind legs, as high above the hind paws' centres as those are above the ground; the chest's centre, halfway up to the chin.
    hips: [0, hipsY],
    chest: [0, chestY],
    // The head turns at the neck: the head's lower edge on the midline, at the chin (spec, the contradictions table).
    neck: [0, chin[1]],
    head: [0, chin[1]],
    collar: [0, chin[1]],
    // The tag swings from its ring.
    tag: L["tag.ring"]!,
    // Ears at their roots, 3 pt inside the head.
    "ear.L": [L["ear.L.root"]![0] - 3, L["ear.L.root"]![1]],
    "ear.R": [L["ear.R.root"]![0] + 3, L["ear.R.root"]![1]],
    "eye.L": L["eye.L"]!,
    "eye.R": L["eye.R"]!,
    // Each brow's centre a quarter of the head's height above its eye.
    "brow.L": [L["eye.L"]![0], L["eye.L"]![1] - H / 4],
    "brow.R": [L["eye.R"]![0], L["eye.R"]![1] - H / 4],
    // The mouth under the nose.
    mouth: L.nose!,
    // The tuft's root, 15% of the head's height below the head's top.
    tuft: [L["head.top"]![0], L["head.top"]![1] + 0.15 * H],
    // The tail roots behind the hips in the front view.
    tail: [0, hipsY],
    // Legs at the shoulder and the hip, straight above their paws, hidden under the body.
    "front.L": [L["paw.front.L"]![0], chestY],
    "front.R": [L["paw.front.R"]![0], chestY],
    "hind.L": [L["paw.hind.L"]![0], hipsY],
    "hind.R": [L["paw.hind.R"]![0], hipsY],
  };
  assert.deepEqual(rig.bones.map((b) => b.name).sort(), Object.keys(rules).sort());
  for (const [bone, [x, y]] of Object.entries(rules)) {
    const m = restTransform(rig, bone, "front");
    assert.ok(Math.abs(m.tx - x) < 1e-6 && Math.abs(m.ty - y) < 1e-6, `${bone} is at (${m.tx}, ${m.ty}), its rule puts it at (${x}, ${y})`);
    assert.ok(Math.abs(m.a - 1) < 1e-12 && Math.abs(m.b) < 1e-12, `${bone} is turned at rest`);
  }
});

test("the rig and its clips are sound, and the front order is spec L397's", () => {
  const clips = ["still_front"].map((name) => json(`../src/clips/${name}.json`) as Clip);
  assert.deepEqual(validate(rig, clips), []);
  assert.deepEqual(clips[0]!.views, { body: [[0, "front"]], head: [[0, "front"]] });
  assert.equal(clips[0]!.lengthMs, 1000);
  const order = rig.drawOrder.front!.flatMap((e) => (e === "@head" ? rig.drawOrder["head.front"]! : [e]));
  const stages = [
    ["shadow"], ["tail"], ["body.back", "back.patch.R", "back.patch.L"], ["hind.L", "hind.R"], ["body.front", "shadow.chin"], ["collar", "shadow.chin.collar"], ["tag"],
    ["ear.L", "ear.R"], ["head.base"], ["head.patch.L", "head.patch.R"], ["blush.L", "blush.R", "eye.L", "eye.R", "brow.L", "brow.R", "nose", "mouth"],
    // The sparkle's stars (a face state's part beside the head, drawn only in that state) come last in the head.
    ["head.line"], ["tuft"], ["stars"], ["front.L", "front.R"],
  ];
  assert.deepEqual(order, stages.flat());
});

test("each marking is an overlay clipped to the part model.json gives it; head patches slide as markings", () => {
  const parts = new Map(rig.parts.map((p) => [p.name, p]));
  const drawn = new Set(front().map((d) => d.part));
  for (const m of model.markings) {
    const part = parts.get(m.id);
    if (!part) continue;
    assert.equal(part.clipTo, m.part, `${m.id} is clipped to ${part.clipTo}`);
    assert.equal(part.bone, parts.get(m.part)!.bone, `${m.id} rides its part's bone`);
  }
  for (const id of ["head.patch.L", "head.patch.R", "back.patch.L", "back.patch.R"]) assert.ok(drawn.has(id), `the front view draws ${id}`);
  assert.equal(rig.fakeTurn!.roles["head.patch.L"], "marking");
  assert.equal(rig.fakeTurn!.roles["head.patch.R"], "marking");
  // head.line is drawn after the head's clip group and is not clipped, so it covers the stencil's edge.
  assert.equal(parts.get("head.line")!.clipTo, undefined);
});

test("each placed landmark lies on its own part, the topmost there with alpha 0.5 or more", () => {
  const owner: Record<string, string> = { "paw.front.L": "front.L", "paw.front.R": "front.R", "paw.hind.L": "hind.L", "paw.hind.R": "hind.R", "tag.ring": "tag", seat: "body.back" };
  assert.deepEqual(Object.keys(landmarks).sort(), Object.keys(owner).sort());
  const order = rig.drawOrder.front!.flatMap((e) => (e === "@head" ? rig.drawOrder["head.front"]! : [e]));
  const pieces = new Map(front().map((d) => [d.part, d.piece]));
  const alpha = new Map<string, (p: [number, number]) => number>();
  for (const [part, p] of pieces) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="190" viewBox="-100 -180 200 190">${scopeIds(p.svg, "p")}</svg>`;
    const png = PNG.sync.read(new Resvg(svg, { fitTo: { mode: "zoom", value: 3 } }).render().asPng());
    alpha.set(part, ([x, y]) => png.data[(Math.floor((y + 180) * 3) * png.width + Math.floor((x + 100) * 3)) * 4 + 3]! / 255);
  }
  for (const [name, p] of Object.entries(landmarks)) {
    const top = order.filter((part) => part !== "shadow" && alpha.get(part)?.(p)! >= 0.5).at(-1);
    assert.equal(top, owner[name], `${name} at (${p}) lies on ${top}`);
  }
});

test("moving a pivot leaves the rest frame where it was", () => {
  // Every bone moved by its own odd amount: anchors follow the pivots, so the drawings land in the same place.
  const moved: Rig = { ...rig, bones: rig.bones.map((b, i) => (b.parent ? { ...b, x: (b.x ?? 0) + 0.37 * i, y: (b.y ?? 0) - 0.21 * i } : b)) };
  const quads = (r: Rig) => {
    const drawings = front().map((d) => toBone(d.part, r, "front", d.piece, d.state));
    const set: AtlasSet = { name: "1x", scale: 1, pages: [{ file: "p", scale: 1, width: 4096, height: 4096 }], regions: {} };
    for (const d of drawings) {
      const [, , w, h] = /viewBox="([^"]+)"/.exec(d.svg)![1]!.split(" ").map(Number);
      set.regions[d.region] = { page: 0, x: 0, y: 0, w: w!, h: h!, anchorX: d.anchor[0], anchorY: d.anchor[1] };
    }
    const c = compile(r);
    const views = { body: "front", head: "front" };
    return new Map(drawList(c, evaluatePose(c, { channels: {}, views }), set, { views, states: {} }).map((i) => [i.region, i.positions]));
  };
  const before = quads(rig), after = quads(moved);
  for (const [region, positions] of before) {
    after.get(region)!.forEach((v, k) => assert.ok(Math.abs(v - positions[k]!) < 1e-9, `${region} moved`));
  }
});

test("the dog builds, lint clean, with its landmarks and report as development output for build/dev/dog/, outside the package", async () => {
  const source = await readSource("dog");
  const pkg = await buildPackage(source);
  const manifest = JSON.parse(pkg.files.get("package.json")!.toString("utf8"));
  assert.equal(manifest.species, "dog");
  // The package (build/characters/dog/, which the app bundles whole) holds neither; the build writes them to build/dev/dog/.
  assert.deepEqual([...pkg.dev.keys()].sort(), ["landmarks.json", "report.json"]);
  for (const file of pkg.dev.keys()) assert.ok(!pkg.files.has(file) && !(file in manifest.files), `${file} is in the package`);
  assert.equal(relative(packageFolder("dog"), devFolder("dog")), join("..", "..", "dev", "dog"));
  const landmarks = JSON.parse(pkg.dev.get("landmarks.json")!.toString("utf8"));
  for (const name of ["paw.front.L", "paw.front.R", "paw.hind.L", "paw.hind.R", "tag.ring", "seat"]) assert.equal(landmarks.front[name].length, 2, name);
  // Each placed point lies within 3 pt of model.json's, where the sheet has one.
  for (const [name, p] of Object.entries(landmarks.front as Record<string, [number, number]>)) {
    const sheet = L[name];
    if (sheet) assert.ok(Math.hypot(p[0] - sheet[0], p[1] - sheet[1]) < 3, `${name} is ${Math.hypot(p[0] - sheet[0], p[1] - sheet[1]).toFixed(1)} pt from the sheet's`);
  }
  const report = JSON.parse(pkg.dev.get("report.json")!.toString("utf8"));
  assert.ok(report.nodes["head.base"]["head.base/front"] > 0);
  for (const set of pkg.atlas.sets) assert.ok(report.pageShare[set.name].share > 0 && report.pageShare[set.name].share <= 1);
});
