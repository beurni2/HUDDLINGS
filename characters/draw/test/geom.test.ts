// Tests for the drawing kit's geometry.
import { test } from "node:test";
import assert from "node:assert/strict";
import { bez, catmullRom, ellipse, fitCubic, fracAt, minRadius, mirrorX, rotate, sample, smooth, spanPoints, split, symmetric, v, type Node, type P } from "../geom.ts";

const near = (a: P, b: P, eps: number) => assert.ok(v.len(v.sub(a, b)) <= eps, `${a} is not within ${eps} of ${b}`);
/** The distance from a point to the nearest dense sample of a path. */
const distance = (segs: ReturnType<typeof smooth>["segs"], p: P) => Math.min(...sample(segs, 1000, false).map((q) => v.len(v.sub(q, p))));

// The ear from the phase 3 art design (24 nodes).
const ear: Node[] = [[-33, -139], [-42, -136.5], [-50.5, -132], [-57.5, -125], [-64, -116], [-72, -107], [-78, -99], [-81.5, -90], [-82, -81.5], [-80, -74.5],
  [-76, -69.5], [-70, -66], [-64, -63], [-52.5, -59.6], [-46.5, -60.2], [-42.3, -62], [-40.3, -66.4], [-42.4, -71.5],
  [-44.8, -81], [-44.6, -92], [-43, -103], [-40.5, -114], [-36, -124], [-31, -131.5]];

test("smooth passes within its tolerance of every hand node, with fewer cubics than nodes", () => {
  const shape = smooth(ear, { tol: 0.2 });
  for (const n of ear) assert.ok(distance(shape.segs, [n[0], n[1]]) <= 0.25, `node ${n} is off the path`);
  assert.ok(shape.segs.length < ear.length, `${shape.segs.length} cubics for ${ear.length} nodes`);
  assert.equal(shape.typed, ear.length);
});

test("Schneider's fit follows a dense curve within its tolerance", () => {
  const arc: P[] = Array.from({ length: 200 }, (_, i) => [30 * Math.cos((i / 199) * Math.PI), 30 * Math.sin((i / 199) * Math.PI)]);
  const segs = fitCubic(arc, 0.1);
  assert.ok(segs.length <= 4, `${segs.length} cubics for a half circle`);
  for (const p of arc) assert.ok(distance(segs, p) <= 0.15, `${p} is off the fit`);
});

test("centripetal Catmull–Rom makes no loop between close nodes", () => {
  // Two nodes very close together between far ones: a uniform spline would loop here.
  const segs = catmullRom([[0, 0], [10, 0], [10.2, 0.1], [20, 0]], false);
  const xs = sample(segs, 50, false).map((p) => p[0]);
  for (let i = 1; i < xs.length; i++) assert.ok(xs[i]! >= xs[i - 1]! - 1e-9, `x runs backwards at sample ${i}`);
});

test("a corner stays a corner, and a smooth path has no kink", () => {
  const square: Node[] = [[0, 0], [20, 0], [20, 20], [0, 20]];
  assert.equal(minRadius(smooth(square, { corners: [0, 1, 2, 3] }).segs).convex.r, 0);
  const circle = smooth(Array.from({ length: 12 }, (_, i): Node => [10 * Math.cos((i / 12) * 2 * Math.PI), 10 * Math.sin((i / 12) * 2 * Math.PI)]));
  const r = minRadius(circle.segs);
  // Twelve nodes on a 10 pt circle: Catmull–Rom bends a little between them, never into a kink.
  assert.ok(r.convex.r > 8 && r.convex.r < 12, `a 10 pt circle's tightest radius is ${r.convex.r}`);
  assert.equal(r.concave.r, Infinity);
});

test("minRadius tells convex from concave on a bean, whichever way the path runs", () => {
  // A bean: a dent on top, its tightest concave turn there.
  const bean: Node[] = [[-20, 0], [-14, -10], [-5, -8], [0, -5], [5, -8], [14, -10], [20, 0], [10, 10], [-10, 10]];
  for (const nodes of [bean, [...bean].reverse()]) {
    const r = minRadius(smooth(nodes).segs);
    assert.ok(r.concave.r < Infinity && r.concave.at[1] < -4, `the dent is concave (${r.concave.at})`);
    assert.ok(r.convex.r < r.concave.r * 3, "the bean's ends are convex");
  }
});

test("split keeps the curve", () => {
  const s = smooth(ear).segs[3]!;
  const [a, b] = split(s, 0.3);
  for (const t of [0, 0.25, 0.5, 0.75, 1]) {
    near(bez(a, t), bez(s, 0.3 * t), 1e-9);
    near(bez(b, t), bez(s, 0.3 + 0.7 * t), 1e-9);
  }
});

test("fracAt finds a named node and the nearest point; spanPoints runs between shares, wrapping", () => {
  const nodes: Node[] = [[0, -10, "top"], [10, 0, "right"], [0, 10, "bottom"], [-10, 0, "left"]];
  const ring = smooth(nodes);
  assert.equal(fracAt(ring, "top"), 0);
  assert.ok(Math.abs(fracAt(ring, "bottom") - 0.5) < 0.01);
  assert.ok(Math.abs(fracAt(ring, [12, 0]) - 0.25) < 0.01);
  const wrap = spanPoints(ring, 0.875, 0.125);
  assert.ok(wrap.every((p) => p[1] < -4), "a span across the start stays on the top");
  assert.ok(spanPoints(ring, 0, 1).length > 100);
});

test("mirrorX swaps sides and names, keeps the first node first, and turns shares f into 1 − f", () => {
  const nodes: Node[] = [[-5, -10, "ear.R"], [-10, 0], [-3, 8], [4, 3]];
  const m = mirrorX(nodes);
  assert.deepEqual(m[0], [5, -10, "ear.L"]);
  assert.deepEqual(m.slice(1), [[-4, 3], [3, 8], [10, 0]]);
  const a = smooth(nodes), b = smooth(m);
  for (const f of [0.1, 0.4, 0.7]) {
    const p = spanPoints(a, f, f)[0]!;
    assert.ok(Math.abs(fracAt(b, [-p[0], p[1]]) - (1 - f)) < 0.01, `share ${f}`);
  }
});

test("a symmetric shape counts only its typed half and mirrors it exactly", () => {
  const s = symmetric([[0, -20], [-10, -18], [-16, -8], [-12, 0]], [0, 2]);
  assert.equal(s.typed, 5);
  assert.equal(s.nodes.length, 8);
  for (const p of sample(s.segs, 20)) assert.ok(distance(s.segs, [-p[0], p[1]]) < 0.3, `${p} has no mirror`);
});

test("rotate turns nodes clockwise on screen about a point, keeping names and distances", () => {
  const about: P = [-1.2, -99.6];
  const nodes: Node[] = [[10, -99.6, "eye.L"], [-1.2, -89.6], [-20, -120]];
  const turned = rotate(nodes, 90, about);
  // A quarter turn clockwise on screen (y down): right of the point goes below it.
  near([turned[0]![0], turned[0]![1]], [-1.2, -88.4], 1e-9);
  assert.equal(turned[0]![2], "eye.L");
  near([turned[1]![0], turned[1]![1]], [-11.2, -99.6], 1e-9);
  const small = rotate(nodes, -3.98, about);
  nodes.forEach((n, i) => {
    const d0 = v.len(v.sub([n[0], n[1]], about)), d1 = v.len(v.sub([small[i]![0], small[i]![1]], about));
    assert.ok(Math.abs(d0 - d1) < 1e-9, `node ${i} moved off its circle`);
  });
  // Turning back undoes it.
  rotate(small, 3.98, about).forEach((n, i) => near([n[0], n[1]], [nodes[i]![0], nodes[i]![1]], 1e-9));
});

test("ellipse is four cubics on the turned ellipse, within a hundredth of a point", () => {
  const c: P = [-24.2, -98], rx = 8.8, ry = 10.3, deg = 6;
  const a = (deg * Math.PI) / 180;
  for (const p of sample(ellipse(c, rx, ry, deg), 50)) {
    // Back into the ellipse's own frame: it must lie on x²/rx² + y²/ry² = 1.
    const dx = p[0] - c[0], dy = p[1] - c[1];
    const x = dx * Math.cos(a) + dy * Math.sin(a), y = -dx * Math.sin(a) + dy * Math.cos(a);
    const off = (Math.hypot(x / rx, y / ry) - 1) * Math.min(rx, ry);
    assert.ok(Math.abs(off) < 0.01, `${p} is ${off} pt off the ellipse`);
  }
  // Its long axis leans the way it is turned: clockwise on screen, the bottom moves left.
  const bottom = ellipse(c, rx, ry, deg)[0]![3];
  assert.ok(bottom[0] < c[0] && bottom[1] > c[1]);
});
