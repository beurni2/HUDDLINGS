// Tests for clip sampling and package validation, from characters/format/README.md.
import { test } from "node:test";
import assert from "node:assert/strict";
import { localTime, sampleDiscrete, sampleKeys } from "../src/clip.ts";
import { validate, type AtlasSet, type Clip, type Key, type Rig } from "../src/format.ts";

const close = (a: number, b: number, eps = 1e-12) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);

// Appendix F's head_tilt example.
const headTilt: Key[] = [[0, 0, "easeInOut"], [420, -16, "easeOutBack"], [1200, -16], [1620, 14, "easeInOut"], [2200, 14], [2600, 0, "easeInOut"]];

test("a channel holds before its first key and after its last", () => {
  close(sampleKeys(headTilt, -50), 0);
  close(sampleKeys(headTilt, 2600), 0);
  close(sampleKeys(headTilt, 9999), 0);
});

test("a key's easing shapes the segment that ends at it", () => {
  // 0 → 420 uses the easing on the 420 key: easeOutBack overshoots past −16.
  let lowest = 0;
  for (let t = 0; t <= 420; t += 5) lowest = Math.min(lowest, sampleKeys(headTilt, t));
  assert.ok(lowest < -16.5, `easeOutBack should overshoot −16, lowest was ${lowest}`);
  // 1200 → 1620 uses easeInOut: at the midpoint it is exactly halfway.
  close(sampleKeys(headTilt, 1410), (-16 + 14) / 2);
  // Equal values hold whatever the easing: 420 → 1200 holds −16.
  close(sampleKeys(headTilt, 800), -16);
});

test("a key without an easing eases in and out; linear has to be asked for", () => {
  const keys: Key[] = [[0, 0], [100, 10]];
  close(sampleKeys(keys, 25), 10 * 4 * 0.25 * 0.25 * 0.25);
  close(sampleKeys(keys, 50), 5);
  close(sampleKeys([[0, 0], [100, 10, "linear"]], 25), 2.5);
});

test("keys land exactly on their values", () => {
  for (const [t, v] of headTilt) close(sampleKeys(headTilt, t), v);
});

test("a step key holds the previous value until its time", () => {
  const keys: Key[] = [[0, 1], [100, 5, "step"]];
  close(sampleKeys(keys, 99.9), 1);
  close(sampleKeys(keys, 100), 5);
});

test("two keys at the same time jump without dividing by zero", () => {
  const keys: Key[] = [[0, 0], [100, 1, "linear"], [100, 3], [200, 3]];
  close(sampleKeys(keys, 100), 3);
  close(sampleKeys(keys, 99), 0.99);
});

test("discrete tracks hold each value until the next key", () => {
  const eyes: [number, string][] = [[0, "open"], [1200, "closed"], [1340, "open"]];
  assert.equal(sampleDiscrete(eyes, 0), "open");
  assert.equal(sampleDiscrete(eyes, 1199), "open");
  assert.equal(sampleDiscrete(eyes, 1200), "closed");
  assert.equal(sampleDiscrete(eyes, 1339), "closed");
  assert.equal(sampleDiscrete(eyes, 5000), "open");
});

test("looping clips wrap; others clamp", () => {
  const loop = { name: "l", lengthMs: 1000, loop: true } as Clip;
  const once = { name: "o", lengthMs: 1000 } as Clip;
  assert.equal(localTime(loop, 2500), 500);
  assert.equal(localTime(once, 2500), 1000);
  assert.equal(localTime(once, -5), 0);
});

const rig: Rig = {
  format: 1,
  species: "test",
  height: 164,
  bones: [
    { name: "root", scale: [0.06, 1] },
    { name: "body", parent: "root", y: -10, rot: [-30, 30], squash: [0.93, 1.07] },
    { name: "head", parent: "body", y: -60, rot: [-18, 18] },
    { name: "ear.L", parent: "head", x: 20, y: -40, rot: [-14, 14], spring: { hz: 3, damping: 0.5, com: [0, 20], follow: 1, inertia: 1 } },
    { name: "tail.1", parent: "body", rot: [-20, 20] },
    { name: "tail.2", parent: "tail.1", y: -20, rot: [-20, 20] },
  ],
  views: ["front"],
  parts: [
    { name: "body", bone: "body", group: "body", regions: { front: "body/front" } },
    { name: "head.base", bone: "head", group: "head", regions: { front: "head/front" } },
    { name: "eye.L", bone: "head", group: "head", clipTo: "head.base", regions: { front: "eye.L/front", "front:closed": "eye.L/front/closed" } },
    { name: "eye.R", bone: "head", group: "head", clipTo: "head.base", regions: { front: "eye.R/front" } },
    { name: "ear.L", bone: "ear.L", group: "head", regions: { front: "ear.L/front" } },
    { name: "tail", bone: "tail.1", group: "body", regions: { front: "tail" }, warp: { chain: ["tail.1", "tail.2"], columns: 1, rows: 5 } },
  ],
  drawOrder: { front: ["tail", "body", "@head"], "head.front": ["ear.L", "head.base", "eye.L", "eye.R"] },
  drawOrderVariants: { "front:low": ["@head", "tail", "body"] },
};

test("a sound rig and clip pass validation", () => {
  const clip: Clip = { name: "ok", lengthMs: 1000, tracks: { body: { squash: [[0, 1], [500, 0.95]] }, head: { rot: [[0, 0], [500, 12]] } },
    order: [[0, null], [500, "low"]], views: { body: [[0, "front"]] }, blendInMs: 150 };
  assert.deepEqual(validate(rig, [clip]), []);
});

test("validation refuses scaling outside the scale channels, and limits broken by clips", () => {
  const clip: Clip = { name: "bad", lengthMs: 1000, tracks: { head: { rot: [[0, 0], [500, 30]], scale: [[0, 1], [500, 1.2]] }, body: { squash: [[0, 1.2]] } } };
  const problems = validate(rig, [clip]);
  assert.ok(problems.some((p) => p.includes("head.rot 30 leaves its limit")), problems.join("\n"));
  assert.ok(problems.some((p) => p.includes("head.scale 1.2 is not allowed")), problems.join("\n"));
  assert.ok(problems.some((p) => p.includes("body.squash 1.2 is not allowed")), problems.join("\n"));
});

test("validation refuses broken structure", () => {
  const broken: Rig = {
    ...rig,
    bones: [...rig.bones, { name: "tail", parent: "nope" }, { name: "body" }],
    parts: [...rig.parts, { name: "x", bone: "ghost", group: "body", regions: { side: "x" }, clipTo: "missing" }],
    drawOrder: { front: ["body", "@head", "phantom"] },
  };
  const problems = validate(broken, [{ name: "c", lengthMs: 100, events: [{ at: 200, type: "sound" }], order: [[10, "nope"]], blendInMs: 50 }]);
  for (const expected of ["parent nope must come first", "bone body: listed twice", "unknown bone ghost", "unknown view side",
    "clipTo missing is not a part", "unknown part phantom", "outside the clip", "order variant nope exists in no view", "blendInMs 50"]) {
    assert.ok(problems.some((p) => p.includes(expected)), `expected "${expected}" in:\n${problems.join("\n")}`);
  }
});

function expectProblem(problems: string[], expected: string) {
  assert.ok(problems.some((p) => p.includes(expected)), `expected "${expected}" in:\n${problems.join("\n")}`);
}

test("validation refuses rotating a bone that declares no rotation", () => {
  const problems = validate(rig, [{ name: "c", lengthMs: 100, tracks: { root: { rot: [[0, 5]] }, "tail.2": { rot: [[0, 1]] } } }]);
  expectProblem(problems, "root has no rot limit, so it cannot be keyed");
  assert.ok(!problems.some((p) => p.includes("tail.2")), problems.join("\n"));
});

test("validation refuses a root that squashes, and a spring whose mass sits on its pivot", () => {
  const bones = rig.bones.map((b) =>
    b.name === "root" ? { ...b, squash: [0.9, 1.1] as [number, number] } : b.name === "ear.L" ? { ...b, spring: { ...b.spring!, com: [1, 1] as [number, number] } } : b);
  const problems = validate({ ...rig, bones }, []);
  expectProblem(problems, "bone root: never rotates or squashes");
  expectProblem(problems, "spring com must be at least 2 pt from the pivot");
});

test("validation keeps each clip group together and after its mask, in every order", () => {
  expectProblem(validate({ ...rig, drawOrder: { ...rig.drawOrder, "head.front": ["head.base", "eye.L", "ear.L", "eye.R"] } }, []),
    "the parts clipped to head.base are not together");
  expectProblem(validate({ ...rig, drawOrder: { ...rig.drawOrder, "head.front": ["ear.L", "eye.L", "eye.R", "head.base"] } }, []),
    "eye.L comes before its mask head.base");
  // A variant is checked with every head order too.
  expectProblem(validate({ ...rig, drawOrderVariants: { "front:low": ["eye.L", "body", "@head"] } }, []), "front:low with head.front");
});

test("validation refuses nested clips and clips on bending parts, for now", () => {
  const parts = rig.parts.map((p) => (p.name === "eye.R" ? { ...p, clipTo: "eye.L" } : p.name === "ear.L" ? { ...p, clipTo: "tail" } : p));
  const problems = validate({ ...rig, parts }, []);
  expectProblem(problems, "its mask eye.L is itself clipped");
  expectProblem(problems, "a bending part can neither be clipped nor be a mask");
});

test("validation checks the fake turn: its parts, its views, and that face parts are clipped", () => {
  const fakeTurn = {
    bone: "head", yawDeg: 20, pitchDeg: 12, faceShift: 0.06, markingShift: 0.03, earShift: 0.03, nodShift: 0.05, farEyeNarrow: 0.06,
    views: { front: { size: [100, 80] as [number, number] }, back: { size: [0, 80] as [number, number] } },
    roles: { "eye.L": "face" as const, "ear.L": "face" as const, ghost: "marking" as const },
    farEye: { positive: "eye.L", negative: "eye.R" },
  };
  const problems = validate({ ...rig, fakeTurn }, [{ name: "c", lengthMs: 100, tracks: { body: { yaw: [[0, 5]] } } }]);
  for (const expected of ["fake turn: unknown view back", "the head size in back must be positive", "ear.L slides with the face, so it must be clipped",
    "unknown part ghost", "far eye eye.R must be a face part", "body.yaw: only the fake turn's bone has yaw"]) expectProblem(problems, expected);
});

test("validation refuses a bezier key whose x1 or x2 leaves 0 to 1, as CSS does", () => {
  const clip: Clip = { name: "c", lengthMs: 500, tracks: { head: { rot: [[0, 0], [200, 5, ["bezier", 1.2, 0, 0.5, 1]], [400, 0, ["bezier", 0.2, 3, 0.8, -2]]] } } };
  const problems = validate(rig, [clip]);
  expectProblem(problems, "key at 200 ms has a bezier with x1 or x2 outside 0 to 1");
  assert.ok(!problems.some((p) => p.includes("key at 400 ms")), "y1 and y2 may overshoot");
});

test("validation refuses an easing that overshoots a limit between keys", () => {
  // easeOutBack from 0 to 17 overshoots to about 18.7, past the head's 18.
  const over: Clip = { name: "over", lengthMs: 500, tracks: { head: { rot: [[0, 0], [400, 17, "easeOutBack"]] } } };
  expectProblem(validate(rig, [over]), "head.rot overshoots to 18.");
  const fine: Clip = { name: "fine", lengthMs: 500, tracks: { head: { rot: [[0, 0], [400, 16, "easeOutBack"]] } } };
  assert.deepEqual(validate(rig, [fine]), []);
});

test("validation keeps a part's alpha inside 0 to 1, at its keys and between them, and only on a part", () => {
  const ok: Clip = { name: "blush", lengthMs: 600, alpha: { "eye.L": [[0, 0.2], [300, 0.8, "easeOutBack"], [600, 0]], body: [[0, 1]] } };
  assert.deepEqual(validate(rig, [ok]), []);
  const bad: Clip = {
    name: "bad", lengthMs: 600,
    alpha: { "eye.L": [[0, 0], [300, 1.2]], ghost: [[0, 1]], "eye.R": [[0, 0.5], [400, 1, "easeOutBack"]], "head.base": [[700, 0.5], [100, -0.1]] },
  };
  const problems = validate(rig, [bad]);
  for (const expected of ["alpha of eye.L 1.2 leaves 0 to 1", "alpha of unknown part ghost", "alpha of eye.R overshoots to 1.0", "alpha of head.base key at 700 ms is outside the clip",
    "alpha of head.base keys out of order at 100 ms", "alpha of head.base -0.1 leaves 0 to 1"]) expectProblem(problems, expected);
  assert.equal(problems.length, 7, problems.join("\n"));
});

test("validation takes a null region, which needs nothing in the atlas, and names a view whose regions are all null", () => {
  const parts = rig.parts.map((p) =>
    p.name === "eye.L" ? { ...p, regions: { ...p.regions, "front:wink": null } } : p.name === "eye.R" ? { ...p, regions: { front: "eye.R/front", "front:closed": null } } : p);
  const named = parts.flatMap((p) => Object.values(p.regions)).filter((r) => r !== null);
  const atlas: AtlasSet = {
    name: "2x", scale: 2, pages: [{ file: "p.png", scale: 2, width: 64, height: 64 }],
    regions: Object.fromEntries(named.map((r) => [r, { page: 0, x: 0, y: 0, w: 2, h: 2, anchorX: 1, anchorY: 1 }])),
  };
  assert.deepEqual(validate({ ...rig, parts }, [], atlas), []);
  const allNull = parts.map((p) => (p.name === "eye.R" ? { ...p, regions: { "front:closed": null, "front:wink": null } } : p));
  assert.deepEqual(validate({ ...rig, parts: allNull }, [], atlas), ["part eye.R: every region in view front is null; leave the view out instead"]);
});
