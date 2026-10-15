// Tests for fur edges and lines.
import { test } from "node:test";
import assert from "node:assert/strict";
import { furEdge, furSpan } from "../fur.ts";
import { arc, fracAt, onSpan, sample, smooth, spanPoints, v, type Node, type P } from "../geom.ts";
import { mirrorSpans, ribbons, taperedStroke } from "../line.ts";

const ring: Node[] = Array.from({ length: 10 }, (_, i): Node => [30 * Math.cos((i / 10) * 2 * Math.PI), 30 * Math.sin((i / 10) * 2 * Math.PI)]);

test("furEdge keeps the base exactly outside its span and adds two cubics a lock", () => {
  // A cubic between each pair of nodes; the span runs from the middle of the third to the middle of the fourth.
  const base = smooth(ring, { corners: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] });
  assert.equal(base.segs.length, 10);
  const fur = furEdge(base, [0, 30], [-17.6, 24.3], [{ len: 2 }, { len: 3, lean: 0.4 }, { len: 2, w: 0.8 }]);
  assert.equal(fur.segs.length, base.segs.length + 2 * 3);
  assert.deepEqual(fur.segs.slice(0, 2), base.segs.slice(0, 2));
  assert.deepEqual(fur.segs.slice(-6), base.segs.slice(-6));
  assert.equal(fur.fur.length, 1);
  // The locks stand out from the base, up to their length.
  const baseline = sample(base.segs, 64);
  const off = (p: P) => Math.min(...baseline.map((q) => v.len(v.sub(p, q))));
  const out = Math.max(...spanPoints(fur, fracAt(fur, fur.fur[0]![0]), fracAt(fur, fur.fur[0]![1])).map(off));
  assert.ok(out > 2.5 && out < 3.6, `the tallest lock stands ${out} pt out`);
  assert.throws(() => furEdge(base, [-17.6, 24.3], [0, 30], [{ len: 2 }]), /must not wrap/);
});

test("furEdge tells each lock's tip, root and notches, the notches on the path and shared by neighbours", () => {
  const base = smooth(ring, { corners: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] });
  const heard: { tip: P; root: P; notches: [P, P] }[] = [];
  const fur = furEdge(base, [0, 30], [-17.6, 24.3], [{ len: 2 }, { len: 3, lean: 0.4 }, { len: 2, w: 0.8 }], 0.3, (tip, root, notches) => heard.push({ tip, root, notches }));
  assert.equal(heard.length, 3);
  const path = sample(fur.segs, 64);
  const onPath = (p: P) => Math.min(...path.map((q) => v.len(v.sub(p, q)))) < 0.05;
  for (const { tip, root, notches } of heard) {
    assert.ok(onPath(tip) && notches.every(onPath), "the tip and the notches lie on the furred path");
    // The tip stands out from its root by about the lock's length (2 or 3 pt), never inward.
    assert.ok(v.len(tip) > v.len(root) + 1.5, `the tip at ${tip} stands outside its root at ${root}`);
  }
  for (let i = 1; i < heard.length; i++) assert.deepEqual(heard[i]!.notches[0], heard[i - 1]!.notches[1]);
});

test("furSpan declares a span of hand nodes as fur", () => {
  const s = furSpan(smooth(ring), [30, 0], [0, 30]);
  const [a, b] = s.fur[0]!.map((p) => fracAt(s, p)) as [number, number];
  assert.ok(onSpan(0.1, a, b) && !onSpan(0.6, a, b));
});

test("a tapered stroke is its width in the middle and thin at its ends", () => {
  const line: P[] = Array.from({ length: 41 }, (_, i) => [i, 0]);
  const d = taperedStroke(line, 2, { taper: 5, tip: 0.2 });
  const ys = [...d.matchAll(/([-\d.]+) ([-\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
  const at = (x: number) => Math.max(...ys.filter((p) => p[0] === x).map((p) => Math.abs(p[1]!)));
  assert.equal(at(20), 1);
  assert.ok(Math.abs(at(0) - 0.1) < 1e-9);
});

test("an outline span runs where it is told; mirrored spans run from the mirror of the end", () => {
  const shape = smooth(ring);
  const r = ribbons(shape, { colour: "#000000", width: 1.5, spans: [{ from: 0.1, to: 0.3, width: 1.2 }, { from: 0.6, to: 0.7 }] }, "test");
  assert.deepEqual(r.outlined, [[0.1, 0.3], [0.6, 0.7]]);
  assert.deepEqual(r.lines.map((l) => l.width), [1.2, 1.5]);
  assert.deepEqual(mirrorSpans([{ from: 0.1, to: 0.3 }, { from: [2, 3], to: "ear.L" }]), [{ from: 0.7, to: 0.9 }, { from: "ear.R", to: [-2, 3] }]);
});

test("an unclipped line reaches the asked distance past the path, on the outside", () => {
  const shape = smooth(ring);
  const length = arc([...spanPoints(shape, 0, 1)]).at(-1)!;
  const r = ribbons(shape, { colour: "#000000", width: 1.5 }, "line", 0.5);
  const radii = [...r.svg.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map((m) => Math.hypot(Number(m[1]), Number(m[2])));
  assert.ok(length > 180);
  assert.ok(Math.abs(Math.max(...radii) - 30.5) < 0.3, `reaches ${Math.max(...radii)}`);
  assert.ok(Math.abs(Math.min(...radii) - 29) < 0.3, `starts ${Math.min(...radii)}`);
});
