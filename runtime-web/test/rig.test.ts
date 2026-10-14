// Tests for pose evaluation and the draw list, from characters/format/README.md.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { AtlasSet, Rig } from "../src/format.ts";
import { compile, drawList, evaluatePose, faceShift, orderFor, regionFor, WARP_SUBDIVISIONS } from "../src/rig.ts";
import { apply } from "../src/math.ts";

const close = (a: number, b: number, eps = 1e-9, what = "") => assert.ok(Math.abs(a - b) <= eps, `${what} ${a} vs ${b}`);

const rig: Rig = {
  format: 1,
  species: "test",
  height: 164,
  bones: [
    { name: "root" },
    { name: "body", parent: "root", y: -8, rot: [-30, 30], squash: [0.9, 1.1] },
    { name: "head", parent: "body", y: -60, rot: [-18, 18] },
    { name: "tail.1", parent: "body", x: 38, y: -20, rot: [-40, 40], views: { "side.R": { x: -40, y: -24, rest: -20 } } },
    { name: "tail.2", parent: "tail.1", y: -20, rot: [-40, 40] },
    { name: "tail.3", parent: "tail.2", y: -20, rot: [-40, 40] },
    { name: "ear.1", parent: "head", x: 30, y: -40, rot: [-40, 40] },
    { name: "ear.2", parent: "ear.1", y: 15, rot: [-40, 40] },
    { name: "ear.3", parent: "ear.2", y: 15, rot: [-40, 40] },
  ],
  views: ["front", "side.R"],
  parts: [
    { name: "body", bone: "body", group: "body", regions: { front: "body/front", "side.R": "body/side" } },
    { name: "tail", bone: "tail.1", group: "body", regions: { front: "tail", "side.R": "tail" }, warp: { chain: ["tail.1", "tail.2", "tail.3"], columns: 1, rows: 5 } },
    { name: "head.base", bone: "head", group: "head", regions: { front: "head", "side.R": "head" } },
    { name: "eye", bone: "head", group: "head", clipTo: "head.base", defaultState: "open", regions: { "front:open": "eye/open", "front:closed": "eye/closed" } },
    { name: "ear", bone: "ear.1", group: "head", regions: { front: "ear" }, warp: { chain: ["ear.1", "ear.2", "ear.3"], columns: 1, rows: 5 } },
  ],
  drawOrder: { front: ["tail", "body", "@head"], "side.R": ["body", "tail", "@head"], "head.front": ["ear", "head.base", "eye"], "head.side.R": ["head.base"] },
  drawOrderVariants: { "front:tailFront": ["body", "tail", "@head"] },
  fakeTurn: { bone: "head", yaw: 20, pitch: 12, parts: { eye: [6, 4] } },
};

// A 2x atlas: every region's anchor is where its drawing's pivot sits.
const atlas: AtlasSet = {
  name: "2x", scale: 2, pages: [{ file: "p.png", scale: 2, width: 1024, height: 1024 }],
  regions: {
    "body/front": { page: 0, x: 16, y: 16, w: 180, h: 140, anchorX: 90, anchorY: 136 },
    "body/side": { page: 0, x: 216, y: 16, w: 220, h: 130, anchorX: 100, anchorY: 126 },
    tail: { page: 0, x: 16, y: 200, w: 28, h: 120, anchorX: 14, anchorY: 120 },
    head: { page: 0, x: 80, y: 200, w: 184, h: 184, anchorX: 92, anchorY: 184 },
    "eye/open": { page: 0, x: 300, y: 200, w: 20, h: 20, anchorX: 10, anchorY: 10 },
    "eye/closed": { page: 0, x: 340, y: 200, w: 20, h: 10, anchorX: 10, anchorY: 5 },
    ear: { page: 0, x: 380, y: 200, w: 24, h: 90, anchorX: 12, anchorY: 0 },
  },
};

const c = compile(rig);
const front = { body: "front", head: "front" };

test("a pose at rest places each bone by its offsets along the chain", () => {
  const pose = evaluatePose(c, { channels: {}, views: front });
  const head = pose.world[c.index.get("head")!]!;
  close(head.tx, 0);
  close(head.ty, -68);
  close(pose.angle[c.index.get("tail.3")!]!, 0);
});

test("squash keeps the area: x scales by 1/s while y scales by s", () => {
  const pose = evaluatePose(c, { channels: { body: { squash: 0.9 } }, views: front });
  const m = pose.world[c.index.get("body")!]!;
  close(m.a, 1 / 0.9);
  close(m.d, 0.9);
  close(m.a * m.d - m.b * m.c, 1, 1e-12, "area");
});

test("rotations add up the chain into the world angle, springs included", () => {
  const pose = evaluatePose(c, { channels: { body: { rot: 10 }, "tail.1": { rot: 5 } }, springs: { "tail.2": 3 }, views: front });
  close(pose.angle[c.index.get("tail.2")!]!, 18);
});

test("a bone takes its view's rest placement; the head's subtree follows the head's view", () => {
  const side = evaluatePose(c, { channels: {}, views: { body: "side.R", head: "front" } });
  const tail = side.world[c.index.get("tail.1")!]!;
  close(tail.tx, -40);
  close(tail.ty, -32);
  close(side.angle[c.index.get("tail.1")!]!, -20);
});

test("the head's order is placed where @head stands, and a variant replaces the body's order", () => {
  assert.deepEqual(orderFor(rig, front), ["tail", "body", "ear", "head.base", "eye"]);
  assert.deepEqual(orderFor(rig, front, "front:tailFront"), ["body", "tail", "ear", "head.base", "eye"]);
  assert.deepEqual(orderFor(rig, { body: "side.R", head: "side.R" }), ["body", "tail", "head.base"]);
});

test("a part draws its state's region, its default state, or nothing in a view it lacks", () => {
  const eye = c.parts.get("eye")!;
  assert.equal(regionFor(eye, "front", "closed"), "eye/closed");
  assert.equal(regionFor(eye, "front", undefined), "eye/open");
  assert.equal(regionFor(eye, "side.R", undefined), undefined);
});

test("a quad's anchor sits on the bone's pivot, and clipped parts point at their mask", () => {
  const pose = evaluatePose(c, { channels: {}, views: front });
  const items = drawList(c, pose, atlas, { views: front, states: {} });
  const body = items.find((i) => i.part === "body")!;
  // Top-left corner: the pivot (0, −8) minus the anchor (90, 136) / 2.
  close(body.positions[0]!, -45);
  close(body.positions[1]!, -8 - 68);
  const eye = items.find((i) => i.part === "eye")!;
  assert.equal(items[eye.clipTo!]!.part, "head.base");
});

test("the fake turn slides face parts in proportion to yaw and pitch", () => {
  assert.deepEqual(faceShift(rig, { yaw: 10, pitch: -12 }), { eye: [3, -4] });
  const pose = evaluatePose(c, { channels: {}, views: front });
  const still = drawList(c, pose, atlas, { views: front, states: {} }).find((i) => i.part === "eye")!;
  const turned = drawList(c, pose, atlas, { views: front, states: {}, turn: { yaw: 20 } }).find((i) => i.part === "eye")!;
  close(turned.positions[0]! - still.positions[0]!, 6);
});

function meshRows(positions: number[]): [number, number, number, number][] {
  const rows: [number, number, number, number][] = [];
  for (let i = 0; i < positions.length; i += 4) rows.push([positions[i]!, positions[i + 1]!, positions[i + 2]!, positions[i + 3]!]);
  return rows;
}

test("at rest a bending part's dense mesh is its flat rectangle", () => {
  const pose = evaluatePose(c, { channels: {}, views: front });
  const tail = drawList(c, pose, atlas, { views: front, states: {} }).find((i) => i.part === "tail")!;
  const rows = meshRows(tail.positions);
  assert.equal(rows.length, 5 * WARP_SUBDIVISIONS + 1);
  assert.equal(tail.uvs.length, tail.positions.length);
  // The tail's pivot is at (38, −28); the region is 14 × 60 pt from the pivot up.
  rows.forEach(([lx, ly, rx, ry], i) => {
    const y = -28 - 60 + 60 * (i / (rows.length - 1));
    close(lx, 31, 1e-9, `row ${i} left x`);
    close(rx, 45, 1e-9, `row ${i} right x`);
    close(ly, y, 1e-9, `row ${i} left y`);
    close(ry, y, 1e-9, `row ${i} right y`);
  });
});

test("a bent part keeps its base on the pivot and curves smoothly toward the bend", () => {
  const pose = evaluatePose(c, { channels: { "tail.2": { rot: 30 }, "tail.3": { rot: 30 } }, views: front });
  const rows = meshRows(drawList(c, pose, atlas, { views: front, states: {} }).find((i) => i.part === "tail")!.positions);
  const base = rows[rows.length - 1]!;
  close(base[0], 31);
  close(base[2], 45);
  close(base[1], -28);
  // Positive angles turn +x toward +y; going up the chain, a clockwise bend leans the tip right.
  const tip = rows[0]!;
  assert.ok((tip[0] + tip[2]) / 2 > 38 + 15, `the tip should lean right, centre at ${(tip[0] + tip[2]) / 2}`);
  // No kinks: the centre line's direction changes by small steps.
  const centres = rows.map(([lx, ly, rx, ry]) => [(lx + rx) / 2, (ly + ry) / 2]);
  let lastAngle: number | undefined;
  for (let i = 1; i < centres.length; i++) {
    const a = Math.atan2(centres[i - 1]![1]! - centres[i]![1]!, centres[i - 1]![0]! - centres[i]![0]!);
    if (lastAngle !== undefined) assert.ok(Math.abs(a - lastAngle) < 0.2, `kink of ${(a - lastAngle).toFixed(3)} rad at row ${i}`);
    lastAngle = a;
  }
});

test("a part that hangs down from its root bends the same way", () => {
  const rest = evaluatePose(c, { channels: {}, views: front });
  const restRows = meshRows(drawList(c, rest, atlas, { views: front, states: {} }).find((i) => i.part === "ear")!.positions);
  // Ear root at (30, −108); the region is 12 × 45 pt hanging down from it.
  close(restRows[0]![0], 24);
  close(restRows[0]![1], -108);
  close(restRows[restRows.length - 1]![1], -108 + 45);
  const bent = evaluatePose(c, { channels: { "ear.2": { rot: 20 }, "ear.3": { rot: 20 } }, views: front });
  const rows = meshRows(drawList(c, bent, atlas, { views: front, states: {} }).find((i) => i.part === "ear")!.positions);
  close(rows[0]![1], -108, 1e-9, "the root row stays on the pivot");
  // A clockwise turn of a downward chain swings its tip toward −x.
  const tip = rows[rows.length - 1]!;
  assert.ok((tip[0] + tip[2]) / 2 < 30 - 5, `the tip should swing left, centre at ${(tip[0] + tip[2]) / 2}`);
  const [px, py] = apply(bent.world[c.index.get("ear.1")!]!, 0, 0);
  close(px, 30);
  close(py, -108);
});
