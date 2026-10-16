// Tests for fur edges and lines.
import { test } from "node:test";
import assert from "node:assert/strict";
import { CLUMPS, furCheck, furEdge, furSpan, STEP, TUFTS, type Lock } from "../fur.ts";
import { arc, fracAt, onSpan, sample, smooth, spanPoints, v, type Node, type P } from "../geom.ts";
import { mirrorSpans, ribbons, strokeOf, taperedStroke } from "../line.ts";

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

// A long straight edge to type tufts along: the bottom of a wide box, running left to right (the path runs clockwise on screen).
const box = smooth([[-40, -20], [40, -20], [40, 0], [-40, 0]] as Node[], { corners: [0, 1, 2, 3] });
/** Five tufts typed per crop (DECISIONS 213): 2 to 4 pt long, 3 to 5 pt wide, leaning, uneven, notches dipping. */
const tufts: Lock[] = [{ len: 2.4, width: 3.4, lean: 0.4, dip: 0.6 }, { len: 3.4, width: 4.6, lean: 0.5, dip: 0.9 }, { len: 2.2, width: 3.2, lean: 0.35, dip: 0.7 },
  { len: 3.2, width: 4.4, lean: 0.55, dip: 0.5 }, { len: 2.5, width: 3.4, lean: 0.4 }];
const span = tufts.reduce((s, l) => s + l.width!, 0);

test("a typed row of tufts keeps its rules, and each way of breaking them is named", () => {
  assert.deepEqual(furCheck(tufts, 0.2, TUFTS, span), []);
  const broken = (i: number, l: Partial<Lock>) => furCheck(tufts.map((x, k) => (k === i ? { ...x, ...l } : x)), 0.2, TUFTS, span).join("\n");
  assert.match(broken(1, { len: 1.1 }), /lock 1 stands 1.1 pt out/);
  assert.match(broken(2, { lean: 0.1 }), /lock 2 leans 0.1/);
  assert.match(broken(0, { dip: 0.2 }), /the notch after lock 0 dips 0.2 pt/);
  // The first locks' failure modes: short wide locks read as lace, an even row as a cog, blunt tips as a cloud.
  assert.match(furCheck(tufts.map((l) => ({ ...l, len: 2, width: 5 })), 0.2, TUFTS, 25).join("\n"), /as long as it is wide, under 0.5/);
  assert.match(furCheck(tufts.map(() => ({ len: 3, width: 4, lean: 0.4, dip: 0.6 })), 0.2, TUFTS, 20).join("\n"), /locks 0 and 1 differ by 0%/);
  assert.match(furCheck(tufts, 0.4, TUFTS, span).join("\n"), /tipRound 0.4 is blunter than 0.25/);
  assert.match(furCheck(tufts, 0.2, TUFTS, span * 1.4).join("\n"), /typed 19.0 pt wide for a span of 26.6 pt/);
  assert.match(furCheck([{ len: 3 }, { len: 2 }], 0.2, TUFTS, 8).join("\n"), /width in points/);
  assert.throws(() => furEdge(box, [20, 0], [20 - span, 0], tufts.map((l) => ({ ...l, len: 1 })), 0.2, undefined, TUFTS), /breaks its rules/);
});

test("broad clumps keep their notches shallow and their spacing irregular, and a step is one low broad lock, never a barb", () => {
  // Five tail lobes typed from the tail-curve panel: 1 to 3 pt long, notched about 1 pt, spaced unevenly.
  const lobes: Lock[] = [{ len: 1.6, width: 7.8, lean: 0.45, dip: 0.4 }, { len: 2.1, width: 9.2, lean: 0.5, dip: 0.5 }, { len: 1.5, width: 10, lean: 0.4, dip: 0.3 },
    { len: 1.9, width: 8.2, lean: 0.55, dip: 0.4 }, { len: 1.4, width: 8.8, lean: 0.35 }];
  const wide = lobes.reduce((s, l) => s + l.width!, 0);
  assert.deepEqual(furCheck(lobes, 0.3, CLUMPS, wide), []);
  // The first tail's clumps: 2.2 to 3.4 pt long with dips of 0.4 to 0.6 on 8 to 10 pt widths, big and small by turns: a saw.
  const saw: Lock[] = [{ len: 2.6, width: 8.6, lean: 0.5, dip: 0.5 }, { len: 3.4, width: 9.8, lean: 0.55, dip: 0.6 }, { len: 2.4, width: 8.2, lean: 0.45, dip: 0.4 },
    { len: 3.2, width: 9.7, lean: 0.6, dip: 0.5 }, { len: 2.2, width: 8.6, lean: 0.5 }];
  const said = furCheck(saw, 0.3, CLUMPS, saw.reduce((s, l) => s + l.width!, 0)).join("\n");
  assert.match(said, /lock 1's notches lie 4.00 pt below its tip, 0.41 of its width, over 0.3/);
  assert.match(said, /alternate wide and narrow all along/);
  // A step: one broad low lock leaning along the edge; the first ear's steps leaned 0.7 and 0.75 and read as barbs.
  assert.deepEqual(furCheck([{ len: 1.1, width: 6.4, lean: 0.4 }], 0.35, STEP, 6.4), []);
  assert.match(furCheck([{ len: 1.4, width: 6.6, lean: 0.7 }], 0.3, STEP, 6.6).join("\n"), /lock 0 leans 0.7, not 0.2 to 0.5/);
  assert.match(furCheck([{ len: 2.6, width: 4.9, lean: 0.4 }], 0.2, STEP, 4.9).join("\n"), /stands 2.6 pt out|0.53 of its width/);
});

test("a typed row lays each tuft out by its width, its notches dipping inside the base and its own ends on it", () => {
  const notches: [P, P][] = [], tips: P[] = [];
  const furred = furEdge(box, [20, 0], [20 - span, 0], tufts, 0.2, (tip, _root, n) => (tips.push(tip), notches.push(n)), TUFTS);
  assert.equal(notches.length, tufts.length);
  // The bottom edge runs right to left: each lock's width along it is its typed width.
  notches.forEach(([a, b], k) => assert.ok(Math.abs(a[0] - b[0] - tufts[k]!.width!) < 0.25, `lock ${k} is ${(a[0] - b[0]).toFixed(2)} pt wide`));
  // The notches between locks dip below the base (into the shape, y < 0), the row's ends lie on it.
  assert.ok(Math.abs(notches[0]![0][1]) < 0.05 && Math.abs(notches.at(-1)![1][1]) < 0.05, "the row's ends leave the base");
  notches.slice(0, -1).forEach(([, b], k) => assert.ok(Math.abs(-b[1] - tufts[k]!.dip!) < 0.05, `the notch after lock ${k} dips ${-b[1]} pt, not ${tufts[k]!.dip}`));
  // Each tip stands its length out from the base, leaning along the edge.
  tips.forEach((tip, k) => assert.ok(Math.abs(tip[1] - tufts[k]!.len) < 0.05, `tip ${k} stands ${tip[1]} pt out`));
  assert.deepEqual(furred.segs.slice(0, 2), box.segs.slice(0, 2), "the base before the span is kept");
});

test("furSpan declares a span of hand nodes as fur", () => {
  const s = furSpan(smooth(ring), [30, 0], [0, 30]);
  const [a, b] = s.fur[0]!.map((p) => fracAt(s, p)) as [number, number];
  assert.ok(onSpan(0.1, a, b) && !onSpan(0.6, a, b));
});

test("a tapered stroke is its width in the middle and thin at its ends, and reports the widths it draws", () => {
  const line: P[] = Array.from({ length: 41 }, (_, i) => [i, 0]);
  const { d, drawn } = taperedStroke(line, 2, { taper: 5, tip: 0.2 });
  assert.deepEqual(drawn, [2, 2]);
  assert.deepEqual(taperedStroke(line, 2, { taper: 5, tip: 0.2, wobble: 0.1 }).drawn, strokeOf(line, 2, { taper: 5, tip: 0.2, wobble: 0.1 }).drawn);
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
