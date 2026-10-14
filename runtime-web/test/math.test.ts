// Tests for the runtime's math, from characters/format/README.md.
import { test } from "node:test";
import assert from "node:assert/strict";
import { apply, catmullRom, compose, cubicBezier, ease, IDENTITY, mulberry32, type Easing } from "../src/math.ts";

const close = (a: number, b: number, eps = 1e-12) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);

test("every easing starts at 0 and ends at 1", () => {
  const easings: Easing[] = ["linear", "easeIn", "easeOut", "easeInOut", "easeOutBack", ["easeOutBack", 0.5], ["bezier", 0.42, 0, 0.58, 1]];
  for (const e of easings) {
    close(ease(e, 0), 0, 1e-9);
    close(ease(e, 1), 1, 1e-9);
  }
});

test("step holds until the key, then jumps", () => {
  assert.equal(ease("step", 0), 0);
  assert.equal(ease("step", 0.999), 0);
  assert.equal(ease("step", 1), 1);
});

test("easeInOut is symmetric and passes through the middle", () => {
  close(ease("easeInOut", 0.5), 0.5);
  for (const u of [0.1, 0.25, 0.4]) close(ease("easeInOut", u) + ease("easeInOut", 1 - u), 1);
});

test("easeOutBack overshoots by about 10% with the default, and less with a smaller s", () => {
  let peak = 0;
  for (let i = 0; i <= 1000; i++) peak = Math.max(peak, ease("easeOutBack", i / 1000));
  assert.ok(peak > 1.09 && peak < 1.11, `peak ${peak}`);
  let small = 0;
  for (let i = 0; i <= 1000; i++) small = Math.max(small, ease(["easeOutBack", 0.5], i / 1000));
  assert.ok(small > 1 && small < 1.03, `peak ${small}`);
});

test("the Bézier solver matches CSS's ease-in-out and is monotonic", () => {
  // CSS ease-in-out is cubic-bezier(0.42, 0, 0.58, 1): symmetric about the middle.
  close(cubicBezier(0.42, 0, 0.58, 1, 0.5), 0.5, 1e-6);
  let last = -1;
  for (let i = 0; i <= 200; i++) {
    const y = cubicBezier(0.42, 0, 0.58, 1, i / 200);
    assert.ok(y >= last - 1e-12);
    last = y;
  }
  // linear control points give the identity
  for (const x of [0.1, 0.33, 0.9]) close(cubicBezier(1 / 3, 1 / 3, 2 / 3, 2 / 3, x), x, 1e-6);
});

test("the Bézier solver falls back to bisection on a flat start", () => {
  // x1 = 0 and x2 = 1 make dx/dt vanish at both ends, where Newton stalls.
  const y = cubicBezier(0, 0.5, 1, 0.5, 0.02);
  assert.ok(Number.isFinite(y) && y > 0 && y < 0.5);
});

test("mulberry32 gives the published sequence and stays in [0, 1)", () => {
  const next = mulberry32(1);
  // Reference values from the canonical JavaScript implementation, seed 1.
  const first = [next(), next(), next()];
  close(first[0]!, 0.6270739405881613);
  close(first[1]!, 0.002735721180215478);
  close(first[2]!, 0.5274470399599522);
  const r = mulberry32(0xdeadbeef);
  for (let i = 0; i < 10000; i++) {
    const v = r();
    assert.ok(v >= 0 && v < 1);
  }
});

test("compose turns +x toward +y for a positive angle (clockwise on screen)", () => {
  const m = compose(IDENTITY, 0, 0, 90, 1, 1);
  const [x, y] = apply(m, 1, 0);
  close(x, 0, 1e-12);
  close(y, 1, 1e-12);
});

test("compose applies translate, then rotate, then scale, under the parent", () => {
  const parent = compose(IDENTITY, 10, 20, 0, 1, 1);
  const child = compose(parent, 5, 0, 90, 2, 0.5);
  // A point (1, 1) in the child: scaled to (2, 0.5), turned 90° to (-0.5, 2), moved by (5, 0) and (10, 20).
  const [x, y] = apply(child, 1, 1);
  close(x, 14.5, 1e-12);
  close(y, 22, 1e-12);
});

test("Catmull–Rom passes through its inner points", () => {
  close(catmullRom(0, 1, 3, 4, 0), 1);
  close(catmullRom(0, 1, 3, 4, 1), 3);
  close(catmullRom(0, 1, 2, 3, 0.5), 1.5);
});
