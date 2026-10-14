// Tests for clip sampling and package validation, from characters/format/README.md.
import { test } from "node:test";
import assert from "node:assert/strict";
import { localTime, sampleDiscrete, sampleKeys } from "../src/clip.ts";
import { validate, type Clip, type Key, type Rig } from "../src/format.ts";

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
  // A key without an easing is linear: 420 → 1200 holds −16.
  close(sampleKeys(headTilt, 800), -16);
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
  const keys: Key[] = [[0, 0], [100, 1], [100, 3], [200, 3]];
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
  ],
  views: ["front"],
  parts: [
    { name: "body", bone: "body", group: "body", regions: { front: "body/front" } },
    { name: "head.base", bone: "head", group: "head", regions: { front: "head/front" } },
    { name: "eye.L", bone: "head", group: "head", clipTo: "head.base", regions: { front: "eye.L/front", "front:closed": "eye.L/front/closed" } },
    { name: "ear.L", bone: "ear.L", group: "head", regions: { front: "ear.L/front" } },
  ],
  drawOrder: { front: ["body", "@head"], "head.front": ["ear.L", "head.base", "eye.L"] },
  drawOrderVariants: { "front:low": ["@head", "body"] },
};

test("a sound rig and clip pass validation", () => {
  const clip: Clip = { name: "ok", lengthMs: 1000, tracks: { body: { squash: [[0, 1], [500, 0.95]] }, head: { rot: [[0, 0], [500, 12]] } },
    events: [{ at: 500, type: "order", name: "front:low" }], views: { body: [[0, "front"]] } };
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
  const problems = validate(broken, [{ name: "c", lengthMs: 100, events: [{ at: 200, type: "sound" }, { at: 10, type: "order", name: "nope" }] }]);
  for (const expected of ["parent nope must come first", "bone body: listed twice", "unknown bone ghost", "unknown view side",
    "clipTo missing is not a part", "unknown part phantom", "outside the clip", "unknown variant nope"]) {
    assert.ok(problems.some((p) => p.includes(expected)), `expected "${expected}" in:\n${problems.join("\n")}`);
  }
});
