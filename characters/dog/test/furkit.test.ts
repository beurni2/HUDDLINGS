// Tests for the fur pass's shared recipes (docs/phase3-fur-plan.md, lane 1; DECISIONS 210 to 219): each is an option
// that changes nothing until a view asks for it, and each does what its decision promises when one does. The line
// (parts/lines.ts): one span per edge, tapering only at a free end, joined ends at full width with a round cap, covered
// ends running on under their part, contact lines as dark in both facings, the ground's dark under the middle of the
// sole only, and a crisp outer edge on head.line. The paws' bun and soft toe lines (paw.ts), the ears' edge
// (ear.ts), the head's fur (headfur.ts), the markings' brushed edge (marking.ts) and the ground shadow (shadow.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { Resvg } from "@resvg/resvg-js";
import { PNG } from "pngjs";
import type { Lock } from "../../draw/fur.ts";
import { arc, fracAt, mirrorX, smooth, spanPoints, v, type Node, type P, type Shape } from "../../draw/geom.ts";
import { scopeIds, type Piece } from "../../draw/svg.ts";
import { EAR, earEdge, earFur, type EarEdgeSpec } from "../src/parts/ear.ts";
import { HEAD_FUR, headFur, type HeadFurSpec } from "../src/parts/headfur.ts";
import { CONTACT_DEPTH, FREE_TAPER, litEdge, litRibbons, SOLE, UNDER_RUN, type LitSpan } from "../src/parts/lines.ts";
import { brush, type Brush } from "../src/parts/marking.ts";
import { BUN, bun, SOFT_TOES, toes, type BunSpec } from "../src/parts/paw.ts";
import { groundShadow } from "../src/parts/shadow.ts";
import { C, LINES } from "../src/palette.ts";

/** A plump part sitting on the ground, typed clockwise from its top: its lit upper left, its sole along the ground. */
const paw = smooth([[0, -30, "top"], [14, -24], [17, -12, "right"], [14, -1.2], [0, 0, "sole"], [-14, -1.2], [-17, -12, "left"], [-14, -24]] as Node[]);
const tonesOf = (svg: string, ladder: string[]) => [...svg.matchAll(/fill="(#[0-9A-Fa-f]{6})"/g)].map((m) => ladder.indexOf(m[1]!));
/** The ribbons' polygons, each as its points. */
const polygons = (svg: string) => [...svg.matchAll(/d="([^"]+)"/g)].map((m) => [...m[1]!.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map((p): P => [Number(p[1]), Number(p[2])]));

test("left out, the fur pass's options draw exactly what the line drew before them", () => {
  const span: LitSpan = { from: "left", to: "right", taper: 4 };
  const a = litRibbons(paw, [span], "a"), b = litRibbons(paw, [{ ...span, ends: undefined, contact: undefined, ground: undefined, cites: undefined }], "a");
  assert.equal(a.svg, b.svg);
  assert.deepEqual(a.lines[0]!.span.ends, ["taper", "taper"]);
  assert.deepEqual(a.lines[0]!.span.taper, [4, 4]);
});

test("a free end tapers over 1.8 pt, a joined end is full width to its point with a round cap, and a covered end runs on under its part", () => {
  const free = litRibbons(paw, [{ from: "left", to: "right", ends: ["free", "free"] }], "free").lines[0]!.span;
  assert.deepEqual(free.taper, [FREE_TAPER, FREE_TAPER]);
  assert.ok(FREE_TAPER >= 1.5 && FREE_TAPER <= 2, "a free end tapers over 1.5 to 2 pt");
  // Joined at both ends: no taper, and a cap at each end as deep as the line there.
  const joined = litRibbons(paw, [{ from: "left", to: "right", ends: ["join", "join"] }], "join", { reach: 0.5 });
  assert.deepEqual(joined.lines[0]!.span.taper, [0, 0]);
  const shapes = polygons(joined.svg);
  const caps = shapes.filter((pts) => pts.length === 16);
  assert.equal(caps.length, 2, "each joined end has its round cap");
  const left = spanPoints(paw, fracAt(paw, "left"), fracAt(paw, "left") + 0.001)[0]!;
  const capAtLeft = caps.find((pts) => v.len(v.sub(pts.reduce((s, p) => v.add(s, v.mul(p, 1 / 16)), [0, 0] as P), left)) < 1)!;
  const r = v.len(v.sub(capAtLeft[0]!, capAtLeft.reduce((s, p) => v.add(s, v.mul(p, 1 / 16)), [0, 0] as P)));
  assert.ok(r >= 0.59 && r <= 0.9, `the cap at the joined end is ${r.toFixed(2)} pt round, half a full-width line`);
  // Covered at its start: it runs on 1.5 pt before where it is typed, at full width.
  const total = arc([...spanPoints(paw, 0, 1), spanPoints(paw, 0, 1)[0]!]).at(-1)!;
  const under = litRibbons(paw, [{ from: "left", to: "right", ends: ["under", "free"] }], "under");
  const [f0] = under.outlined[0]!;
  const ran = ((fracAt(paw, "left") - f0 + 1) % 1) * total;
  assert.ok(Math.abs(ran - UNDER_RUN) < 0.05, `the covered end runs on ${ran.toFixed(2)} pt past where it is typed`);
  assert.ok(UNDER_RUN >= 1, "a covered end runs on at least 1 pt");
  assert.deepEqual(under.lines[0]!.span.taper, [0, FREE_TAPER]);
});

test("a contact line keeps the same darkness in both facings, never lighter than the ladder's middle; an outer line lightens toward the light", () => {
  // The same edge in a facing and in its mirror, lit from the top left in each: the edge faces the light in one.
  const right: LitSpan = { from: [16, -20], to: [16, -6] };
  const mirrored = smooth(mirrorX(paw.nodes));
  const left: LitSpan = { from: [-16, -6], to: [-16, -20] };
  const outer = [tonesOf(litRibbons(paw, [right], "o").svg, LINES.cream), tonesOf(litRibbons(mirrored, [left], "o").svg, LINES.cream)];
  const mean = (t: number[]) => t.reduce((a, b) => a + b, 0) / t.length;
  assert.ok(mean(outer[1]!) < mean(outer[0]!) - 1, `the outer line is no lighter facing the light (${outer[1]} against ${outer[0]})`);
  const contact = [tonesOf(litRibbons(paw, [{ ...right, contact: true }], "c").svg, LINES.cream), tonesOf(litRibbons(mirrored, [{ ...left, contact: true }], "c").svg, LINES.cream)];
  assert.deepEqual([...contact[0]!].sort(), [...contact[1]!].sort(), "the contact line's tones differ between the facings");
  assert.ok(contact.flat().every((t) => t >= Math.round(CONTACT_DEPTH * 10)), `a contact line is lighter than the ladder's middle (${contact.flat()})`);
});

test("under a paw's sole the ground's dark lies only under the middle 60%, lighter, thinner and varied round it", () => {
  const sole: LitSpan = { from: [15.6, -4], to: [-15.6, -4] };
  // Read the tone at each point along the sole from its polygons: each polygon is a run of one tone.
  const toneAt = (svg: string, x: number) => {
    const runs = polygons(svg).map((pts, k) => ({ tone: tonesOf(svg, LINES.cream)[k]!, xs: pts.map((p) => p[0]) }));
    return runs.filter((r) => Math.min(...r.xs) <= x && Math.max(...r.xs) >= x).map((r) => r.tone);
  };
  // Before the fur pass the sole is the darkest tone nearly out to the paw's sides.
  const before = litRibbons(paw, [sole], "before").svg;
  assert.ok([0, 12, -12].every((x) => toneAt(before, x).every((t) => t >= 9)), "the line along the ground is not the darkest before the fur pass");
  const after = litRibbons(paw, [{ ...sole, ground: "sole" }], "after");
  const middle = Math.round(SOLE.depth * 10);
  assert.ok([-5, 0, 5].every((x) => toneAt(after.svg, x).every((t) => t === middle)), `the sole's middle is tone ${toneAt(after.svg, 0)}, not ${middle}`);
  // Toward the sole's ends the ground's dark eases out, leaving the light's own tone: lighter than before at both ends,
  // and on the lit side lighter than the sole's middle (on the side away from the light the light rule alone runs about
  // as deep as the sole's middle).
  for (const x of [15.5, -15.5])
    assert.ok(Math.max(...toneAt(after.svg, x)) < Math.min(...toneAt(before, x)), `at x ${x} the sole's end is tone ${toneAt(after.svg, x)}, as dark as before (${toneAt(before, x)})`);
  assert.ok(Math.max(...toneAt(after.svg, -15.5)) < middle, `the lit end of the sole is tone ${toneAt(after.svg, -15.5)}, as dark as its middle`);
  const [lo, hi] = after.lines[0]!.drawn;
  assert.ok(hi <= SOLE.width[1] * (1 + SOLE.wobble) + 1e-9 && hi > SOLE.width[1], `the sole's line peaks at ${hi} pt`);
  assert.ok(lo >= 1.2 - 1e-9, `the line round the paw thins to ${lo} pt, under the outer band`);
  // Up the paw's side, off the ground, the line is the light rule's alone: as it is with no ground under it at all.
  const up = (s: LitSpan) => tonesOf(litRibbons(paw, [s], "side").svg, LINES.cream);
  assert.deepEqual(up({ from: "right", to: [16.6, -8], ground: "sole" }), up({ from: "right", to: [16.6, -8] }));
});

/** head.line round a ring, rendered alone on transparent at 12 px/pt, and its alpha along a ray out through its edge. */
function edgeProfile(crisp: boolean): number[] {
  const ring: Shape = smooth(Array.from({ length: 12 }, (_, i): Node => [20 * Math.cos((i / 12) * 2 * Math.PI), 20 * Math.sin((i / 12) * 2 * Math.PI)]));
  const e = litEdge(ring, [{ from: 0.05, to: 0.45 }], "head.line", [-22, -22, 44, 44], { reach: 0.5, crisp });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="-24 -24 48 48"><defs>${e.defs}</defs>${e.body}</svg>`;
  const png = PNG.sync.read(new Resvg(svg, { fitTo: { mode: "zoom", value: 12 }, background: "rgba(0,0,0,0)" }).render().asPng());
  // Straight down from the ring's middle: the span's middle (the path runs clockwise on screen from the ring's right).
  const a = Math.PI / 2;
  return Array.from({ length: 48 }, (_, k) => {
    const r = 18.5 + k / 12, x = Math.round((24 + r * Math.cos(a)) * 12), y = Math.round((24 + r * Math.sin(a)) * 12);
    return png.data[(y * png.width + x) * 4 + 3]! / 255;
  });
}

test("a crisp head.line keeps the silhouette's edge sharp: its outer alpha rises from 10% to 90% within 0.45 pt", () => {
  const rise = (profile: number[]) => {
    const peak = Math.max(...profile), at = profile.indexOf(peak);
    const outer = profile.slice(at);
    const p90 = outer.findIndex((a) => a < 0.9 * peak), p10 = outer.findIndex((a) => a < 0.1 * peak);
    return (p10 - p90) / 12;
  };
  const soft = rise(edgeProfile(false)), crisp = rise(edgeProfile(true));
  assert.ok(soft > 0.45, `the soft line's outer edge rises over ${soft} pt (the falloff it had)`);
  assert.ok(crisp <= 0.45, `the crisp line's outer edge rises over ${crisp} pt`);
  // The crisp line still covers the path's own edge, where head.base's stencil cuts, and is full right out to its own
  // edge (0.5 pt past the path, about 20.35 pt from the ring's middle there), the blur's falloff cut off past it.
  const profile = edgeProfile(true);
  assert.ok(profile[18]! > 0.95, `the crisp line's alpha on the path itself is ${profile[18]}`);
  assert.ok(profile[21]! > 0.9, `the crisp line's alpha 0.1 pt inside its outer edge is ${profile[21]}`);
});

// sRGB to CIE L*, and a colour laid over another at an opacity, for the toe lines against the outline.
function lightness(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((u) => (u <= 0.04045 ? u / 12.92 : ((u + 0.055) / 1.055) ** 2.4)) as [number, number, number];
  const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return Y > 216 / 24389 ? 116 * Math.cbrt(Y) - 16 : (Y * 24389) / 27;
}
const over = (top: string, under: string, opacity: number) =>
  `#${[1, 3, 5].map((i) => Math.round(parseInt(top.slice(i, i + 2), 16) * opacity + parseInt(under.slice(i, i + 2), 16) * (1 - opacity)).toString(16).padStart(2, "0")).join("")}`;

const BUN_SPEC: BunSpec = { wrist: [[-6, -15], [6, -15]], bulge: [0.9, 0.9], ground: 0, lobes: [0.32, 0.36, 0.32], scallop: 0.6 };

test("a bun is 10 to 20% wider than its leg, its sole 2 or 3 toe lobes scalloping up 0.5 to 0.8 pt, its toe lines rising 40 to 50% of the paw", () => {
  const b = bun(BUN_SPEC);
  const xs = b.nodes.map((n) => n[0]);
  const wide = (Math.max(...xs) - Math.min(...xs)) / 12;
  assert.ok(wide >= BUN.wider[0] && wide <= BUN.wider[1], `the bun is ${wide.toFixed(2)} times the leg`);
  assert.equal(b.lobes.length, 3);
  // Each lobe's lowest point on the ground, each notch between two lobes the scallop above it.
  const notches = b.notches.map((i) => b.nodes[i]!);
  assert.equal(notches.length, 2);
  for (const n of notches) assert.ok(Math.abs(n[1] - (BUN_SPEC.ground - BUN_SPEC.scallop)) < 1e-9, `a notch lies at y ${n[1]}`);
  assert.equal(b.nodes.filter((n) => n[1] === BUN_SPEC.ground).length, 3, "each toe lobe touches the ground once, at its middle");
  // The lobes run from corner to notch to notch to corner, so the line round the sole is one closed run.
  assert.deepEqual(b.lobes[0]![0], b.sole[0]);
  assert.deepEqual(b.lobes.at(-1)![1], b.sole[1]);
  for (const t of b.toes) {
    const rise = (t[0]![1] - t.at(-1)![1]) / 15;
    assert.ok(rise >= BUN.rise[0] && rise <= BUN.rise[1], `a toe line rises ${rise.toFixed(2)} of the paw`);
  }
  assert.throws(() => bun({ ...BUN_SPEC, bulge: [0.2, 0.2] }), /1\.03 times the leg's width, not 1\.1 to 1\.2/);
  assert.throws(() => bun({ ...BUN_SPEC, lobes: [1, 1, 1, 1] }), /4 toe lobes, not 2 to 3/);
  assert.throws(() => bun({ ...BUN_SPEC, scallop: 1 }), /scallops 1 pt, not 0\.5 to 0\.8/);
  assert.throws(() => bun({ ...BUN_SPEC, rise: 0.6 }), /rise 0\.6 of the paw, not 0\.4 to 0\.5/);
});

test("a soft toe line is never darker than the outline: at its strongest it is lighter than the line's lightest tone", () => {
  const line: P[] = [[0, 0], [0.4, -2], [0.4, -4], [0, -5.6]];
  const stops = (soft?: boolean) => [...toes({ lines: [line, line], fade: [0, -6], soft }).under!.matchAll(/stop-opacity="([0-9.]+)"/g)].map((m) => Number(m[1]));
  assert.deepEqual(stops(), [0.8, 0.08], "the toe lines a view does not soften are as they were");
  const soft = stops(true);
  assert.deepEqual(soft, [SOFT_TOES.foot, SOFT_TOES.top]);
  assert.ok(soft[0]! > soft[1]!, "the soft toe line does not fade out upward");
  const lit = lightness(LINES.cream[0]!);
  assert.ok(lightness(over(C.warmLine, C.fur, soft[0]!)) > lit, `the soft toe line at its foot is L* ${lightness(over(C.warmLine, C.fur, soft[0]!)).toFixed(1)}, darker than the lit outline's ${lit.toFixed(1)}`);
  // The first toe lines, at 0.8 at the foot, were darker than the outline there.
  assert.ok(lightness(over(C.warmLine, C.fur, 0.8)) < lit);
});

/** An ear's droplet typed clockwise on screen from its top: its outer edge down the right, its hem across the foot. */
const droplet = smooth([[0, -40], [10, -30], [13, -15], [10, -4], [0, 0], [-10, -4], [-13, -15], [-10, -30]] as Node[]);
const HEM: Lock[] = [{ len: 1.4, width: 5, lean: 0.2, dip: 0.4 }, { len: 1.8, width: 6.5, lean: 0.2, dip: 0.3 }, { len: 1.2, width: 4.6, lean: 0.25, dip: 0.5 }, { len: 1.6, width: 5.4, lean: 0.3 }];
const EDGE: EarEdgeSpec = {
  base: droplet,
  steps: [{ from: [11.4, -27], to: [12.9, -19.6], lock: { len: 1.2, width: 7.4, lean: 0.6 } }],
  hem: { from: [10, -4], to: [-10, -4], locks: HEM, tipRound: 0.4 },
  axis: [[0, -40], [0, 0]],
  line: { from: [-12, -24], to: [6, -36] },
};

test("an ear's edge is a lock step or two down its outer edge and a hem of 3 or 4 rounded tips, its notches 1 to 2 pt deep", () => {
  const e = earEdge(EDGE);
  assert.equal(e.tips.length, 4);
  assert.equal(e.notches.length, 3, "only the notches between two tips are notches");
  assert.equal(e.shape.fur.length, 2, "the step and the hem are each declared fur");
  // Each tip stands out below the base's foot and each notch lies above its neighbouring tips.
  e.notches.forEach((n, i) => assert.ok(n[1] < e.tips[i]![1] && n[1] < e.tips[i + 1]![1], `notch ${i} is no higher than its tips`));
  assert.throws(() => earEdge({ ...EDGE, steps: [] }), /1 or 2 lock steps, not 0/);
  assert.throws(() => earEdge({ ...EDGE, steps: [EDGE.steps[0]!, EDGE.steps[0]!, EDGE.steps[0]!] }), /1 or 2 lock steps, not 3/);
  assert.throws(() => earEdge({ ...EDGE, hem: { ...EDGE.hem, locks: [{ ...HEM[0]!, dip: 1 }, ...HEM.slice(1)] } }), /notch after tip 0 is 2\.40 pt deep, not 1 to 2/);
  assert.throws(() => earEdge({ ...EDGE, hem: { ...EDGE.hem, locks: [{ ...HEM[0]!, len: 0.6, dip: 0.2 }, ...HEM.slice(1)] } }), /notch after tip 0 is 0\.80 pt deep/);
  assert.throws(() => earEdge({ ...EDGE, hem: { ...EDGE.hem, locks: [{ ...HEM[0]!, width: 10 }, { ...HEM[1]!, width: 11.5, dip: undefined }] } }), /2 locks, not 3 to 4/);
  assert.deepEqual(EAR.hem.count, [3, 4]);
});

test("an ear's line is one span on the tan, running on under the head at both ends, light at the top and deepest at the hem", () => {
  const { span } = earEdge(EDGE);
  assert.equal(span.on, "tan");
  assert.deepEqual(span.ends, ["under", "under"]);
  const under = span.under as (p: P) => number;
  const depths = [-40, -30, -20, -10, 0].map((y) => under([0, y]));
  assert.equal(depths[0], 0, "the line is the light's own at the ear's top");
  assert.ok(Math.abs(depths[4]! - 0.7) < 1e-9, `the line lies ${depths[4]} deep at the hem`);
  for (let k = 1; k < depths.length; k++) assert.ok(depths[k]! > depths[k - 1]!, `the line does not deepen down the ear (${depths})`);
  // Drawn, it is lighter at the top than at the hem.
  const drawn = litRibbons(earEdge(EDGE).shape, [{ ...span, from: [-11.6, -26], to: [10.6, -31] }], "ear");
  assert.ok(drawn.lines.length === 1 && drawn.lines[0]!.span.ends.join() === "under,under");
});

test("an ear's paint over an edge takes the hem's 3 or 4 tips for its clumps and keeps its locks uneven", () => {
  const edge = earEdge(EDGE);
  const ear = { ear: edge.shape, axis: EDGE.axis, light: "", under: [], dips: [] };
  const uneven: P[][] = [[[-8.5, -26], [-9.4, -14], [-8.5, -5]], [[-4.6, -20], [-5, -10], [-4.6, -2]], [[2.4, -30], [2.7, -16], [2.3, -1]], [[6.8, -22], [7.4, -12], [6.8, -4]]];
  assert.doesNotThrow(() => earFur({ ...ear, locks: uneven, edge }));
  const comb: P[][] = [-7.5, -2.5, 2.5, 7.5].map((x): P[] => [[x, -22], [x, -12], [x, -2]]);
  assert.throws(() => earFur({ ...ear, locks: comb, edge }), /too even .* read as a comb/);
  assert.throws(() => earFur({ ...ear, locks: uneven, edge: { ...edge, notches: edge.notches.slice(0, 1) } }), /hem is 3 or 4 lock tips, not 2/);
});

/** A round head: 24 nodes round a circle of radius 40, clockwise on screen from its right, and a place on it by angle. */
const ring = (r: number, c: P, n = 24): Shape => smooth(Array.from({ length: n }, (_, k): Node => [c[0] + r * Math.cos((k / n) * 2 * Math.PI), c[1] + r * Math.sin((k / n) * 2 * Math.PI)]));
const on = (deg: number, r = 40, c: P = [0, -100]): P => [c[0] + r * Math.cos((deg * Math.PI) / 180), c[1] + r * Math.sin((deg * Math.PI) / 180)];
const HEAD: HeadFurSpec = {
  base: ring(40, [0, -100]),
  crown: [{ side: "R", from: on(222), to: on(233.2), locks: [{ len: 2.6, width: 4.2, lean: 0.4, dip: 0.6 }, { len: 2, width: 3.6, lean: 0.5 }], tipRound: 0.22, line: { from: on(250), to: on(205) } }],
  cheeks: [{
    side: "R", from: on(150), to: on(185), tipRound: 0.3, raised: on(170), line: { from: on(140), to: on(195) },
    clumps: [{ len: 2.4, width: 8, lean: 0.3, dip: 0.6 }, { len: 3.2, width: 9.5, lean: 0.4, dip: 0.8 }, { len: 2, width: 7, lean: 0.35 }],
  }],
  chin: {
    from: on(60), to: on(120), tipRound: 0.5, corners: [on(50), on(130)], line: { from: on(40), to: on(140) },
    scallops: [{ len: 1.2, width: 7, lean: 0.1, dip: 0.3 }, { len: 0.8, width: 6, lean: 0.2, dip: 0.4 }, { len: 1.4, width: 8, dip: 0.2 }, { len: 0.9, width: 6.5, lean: 0.1, dip: 0.3 },
      { len: 1.3, width: 7.5, lean: 0.2, dip: 0.4 }, { len: 1, width: 6.9 }],
  },
};

test("the head's fur lies where the view types it, each place with its one line", () => {
  const h = headFur(HEAD);
  assert.deepEqual([h.tufts.crown.length, h.tufts.cheeks.length, h.tufts.chin.length], [2, 3, 6]);
  assert.equal(h.head.fur.length, 3, "the crown, the cheek and the chin are each declared fur");
  assert.deepEqual(h.crown[0]!.ends, ["under", "join"], "the crown's line does not run on under the topknot and join the ear's line");
  assert.equal(h.cheeks[0]!.on, "tan");
  assert.deepEqual(h.cheeks[0]!.ends, ["join", "join"]);
  assert.deepEqual(h.chin!.ends, ["join", "join"]);
  assert.equal(h.spans().length, 3, "one line per place");
  // Under a raised ear the cheek's line starts lower, at `raised`, from open fur.
  const raised = h.spans({ R: true })[1]!;
  assert.deepEqual(raised.to, on(170));
  assert.deepEqual(raised.ends, ["join", "free"]);
  assert.deepEqual(h.spans({ L: true })[1], h.cheeks[0], "a raised ear on the other side moves this cheek's line");
});

test("a state that moves the head's outline moves every typed place with it, so the fur never pops", () => {
  const d: P = [1.5, -0.8];
  const moved = headFur({ ...HEAD, base: { ...HEAD.base, segs: HEAD.base.segs.map((s) => s.map((p) => v.add(p, d)) as typeof s) }, at: (p) => v.add(p, d) });
  const still = headFur(HEAD);
  moved.head.segs.forEach((s, i) => s.forEach((p, k) => assert.ok(v.len(v.sub(p, v.add(still.head.segs[i]![k]!, d))) < 1e-6, `segment ${i} point ${k} moves apart from the outline`)));
  assert.deepEqual(moved.spans()[2]!.from, v.add(still.spans()[2]!.from as P, d));
});

test("the head's fur keeps its counts and the chin stays a rounded mass", () => {
  const lock = HEAD.crown![0]!.locks;
  assert.throws(() => headFur({ ...HEAD, crown: [{ ...HEAD.crown![0]!, locks: [...lock, { len: 2.6, width: 4.2, lean: 0.4 }, { len: 2, width: 3.6, lean: 0.5 }].map((l, i, all) => (i < all.length - 1 ? { ...l, dip: 0.6 } : l)) }] }), /4 locks, not 2 to 3/);
  const chin = HEAD.chin!;
  assert.throws(() => headFur({ ...HEAD, chin: { ...chin, scallops: chin.scallops.slice(0, 4).map((l, i) => (i === 3 ? { ...l, dip: undefined } : l)) } }), /4 locks, not 5 to 7/);
  assert.throws(() => headFur({ base: ring(5, [0, -100]), chin: { ...chin, corners: [on(50, 5)] } }), /jaw turns r [0-5]\.\d\d pt .* at least 6: the chin is a rounded mass/);
  assert.equal(HEAD_FUR.cornerPt, 6);
});

/** A piece rendered alone on transparent at `zoom` px/pt, and its alpha at a model point. */
function alphaOf(p: Piece, zoom: number): (at: P) => number {
  const [x, y, w, h] = p.box;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${x} ${y} ${w} ${h}">${p.svg}</svg>`;
  const png = PNG.sync.read(new Resvg(svg, { fitTo: { mode: "zoom", value: zoom }, background: "rgba(0,0,0,0)" }).render().asPng());
  return ([px, py]) => {
    const i = Math.floor((px - x) * zoom), j = Math.floor((py - y) * zoom);
    return i < 0 || j < 0 || i >= png.width || j >= png.height ? 0 : png.data[(j * png.width + i) * 4 + 3]! / 255;
  };
}

const PART = ring(20, [0, 0]), PATCH = ring(9, [8, 0]);
const BRUSH: Brush = { flow: [1, 0.3], seed: 7, edge: 24, out: [1, 2.6], in: [1.5, 3], width: [0.7, 1.2], inside: { count: 4, length: [4, 7], colour: C.earDeep, opacity: 0.35, width: 0.8 }, colour: C.marking };

test("a brushed marking is the same from its seed every build, darker strands inside, nothing light, and all of it inside its part", () => {
  const a = brush("patch", PART, PATCH, 0.9, BRUSH), b = brush("patch", PART, PATCH, 0.9, BRUSH);
  assert.equal(scopeIds(a.svg, "x"), scopeIds(b.svg, "x"), "the same seed lays different strands");
  assert.notEqual(scopeIds(brush("patch", PART, PATCH, 0.9, { ...BRUSH, seed: 8 }).svg, "x"), scopeIds(a.svg, "x"));
  assert.equal(a.meta.lines.length, 4);
  for (const l of a.meta.lines) assert.equal(l.kind, "inner");
  assert.throws(() => brush("patch", PART, PATCH, 0.9, { ...BRUSH, colour: C.fur }), /no light streaks/);
  assert.throws(() => brush("patch", PART, PATCH, 0.9, { ...BRUSH, inside: { ...BRUSH.inside, colour: C.light } }), /no light streaks/);
  // Every fill is the marking's or its darker strands' (the white is only the masks').
  const fills = new Set([...a.svg.matchAll(/fill="(#[0-9A-Fa-f]{6})"/g)].map((m) => m[1]!).filter((c) => c !== "#FFFFFF"));
  assert.deepEqual([...fills].sort(), [C.earDeep, C.marking].sort());
  // Out past the patch's edge the strands show, and nothing comes within `keep` (2 pt) of the part's edge.
  const alpha = alphaOf(a, 8);
  const shown = Array.from({ length: 72 }, (_, k) => alpha(on(k * 5, 9.8, [8, 0]))).filter((x) => x > 0.2).length;
  assert.ok(shown >= 12, `only ${shown} of 72 places 0.8 pt past the patch's edge carry a strand`);
  for (let k = 0; k < 360; k += 3) for (const r of [18.4, 19, 20, 21]) assert.equal(alpha(on(k, r, [0, 0])), 0, `a strand shows ${r} pt from the part's middle at ${k}°`);
});

test("the ground shadow is soft all round, reaches as far as it is asked and is darkest where the paws press", () => {
  const s = groundShadow({ reach: [-60, 60], presses: [{ x: -20, half: 6 }, { x: 20, half: 6 }] });
  const fills = new Set([...s.svg.matchAll(/fill="(#[0-9A-Fa-f]{6})"/g)].map((m) => m[1]!));
  assert.deepEqual([...fills].sort(), [C.contact, C.shadow].sort());
  const alpha = alphaOf(s, 4);
  const core = alpha([0, -6.5]);
  assert.ok(core > 0.9, `the shadow's core is ${core}`);
  assert.ok(alpha([-57, -6.5]) > 0.3 * core && alpha([57, -6.5]) > 0.3 * core, "the shadow does not reach near its ends");
  assert.ok(alpha([-64, -6.5]) < 0.05 && alpha([64, -6.5]) < 0.05, "the shadow reaches past its ends");
  // No hard edge: down through its middle and out along it, the alpha never jumps by more than 0.1 in a quarter point.
  for (const line of [(t: number): P => [0, -18 + t], (t: number): P => [-66 + t, -6.5], (t: number): P => [-66 + t, -0.5]]) {
    const xs = Array.from({ length: 4 * 24 }, (_, k) => alpha(line(k / 4)));
    for (let k = 1; k < xs.length; k++) assert.ok(Math.abs(xs[k]! - xs[k - 1]!) <= 0.1, `the shadow's edge jumps by ${Math.abs(xs[k]! - xs[k - 1]!).toFixed(2)} at ${line(k / 4)}`);
  }
  // Along the ground it is darkest under each paw.
  const ground = (x: number) => alpha([x, -0.3]);
  assert.ok(ground(-20) > ground(0) && ground(20) > ground(0), `under the paws ${ground(-20)}, ${ground(20)}, between them ${ground(0)}`);
});
