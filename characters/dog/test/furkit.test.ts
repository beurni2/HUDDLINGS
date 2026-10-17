// Tests for the fur pass's shared recipes (docs/phase3-fur-plan.md, lane 1; DECISIONS 210 to 219): each is an option
// that changes nothing until a view asks for it, and each does what its decision promises when one does. The line
// (parts/lines.ts): one span per edge, tapering only at a free end, joined ends at full width with a round cap, covered
// ends running on under their part, contact lines as dark in both facings, the ground's dark under the middle of the
// sole only, and a crisp outer edge on head.line. The paws' bun and soft toe lines (paw.ts), the ears' edge
// (ear.ts), the head's fur (headfur.ts), the markings' brushed edge (marking.ts) and the ground shadow (shadow.ts).
import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { Resvg } from "@resvg/resvg-js";
import { PNG } from "pngjs";
import type { Drawing } from "../../build/atlas.ts";
import type { Rig } from "../../../runtime-web/src/format.ts";
import { furEdge, type Lock } from "../../draw/fur.ts";
import { decisionsOf, gateProblems, lineGate, LIMITS } from "../../draw/lint.ts";
import { arc, fracAt, mirrorX, sample, smooth, spanPoints, v, type Node, type P, type Shape } from "../../draw/geom.ts";
import { scopeIds, type Piece } from "../../draw/svg.ts";
import { EAR, earEdge, earFur, type EarEdgeSpec } from "../src/parts/ear.ts";
import { HEAD_FUR, headFur, type HeadFurSpec } from "../src/parts/headfur.ts";
import { drawings } from "../src/drawings.ts";
import { CONTACT_DEPTH, FREE_TAPER, litEdge, litPart, litRibbons, SOLE, UNDER_RUN, WEIGHT, type LitLine, type LitSpan } from "../src/parts/lines.ts";
import { brush, type Brush } from "../src/parts/marking.ts";
import { BUN, bun, DOME_TOES, meridian, SOFT_TOES, toes, type BunSpec, type Dome } from "../src/parts/paw.ts";
import { CRISP, topknot, type Curl } from "../src/parts/topknot.ts";
import { groundShadow } from "../src/parts/shadow.ts";
import { C, LINES } from "../src/palette.ts";
import { mirrorPiece } from "../src/views/facing.ts";

/** A plump part sitting on the ground, typed clockwise from its top: its lit upper left, its sole along the ground. */
const paw = smooth([[0, -30, "top"], [14, -24], [17, -12, "right"], [14, -1.2], [0, 0, "sole"], [-14, -1.2], [-17, -12, "left"], [-14, -24]] as Node[]);
const tonesOf = (svg: string, ladder: string[]) => [...svg.matchAll(/fill="(#[0-9A-Fa-f]{6})"/g)].map((m) => ladder.indexOf(m[1]!));
/** The ribbons' polygons, each as its points. */
const polygons = (svg: string) => [...svg.matchAll(/d="([^"]+)"/g)].map((m) => [...m[1]!.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map((p): P => [Number(p[1]), Number(p[2])]));

test("left out, the fur pass's options draw exactly what the line drew before them", () => {
  const span: LitSpan = { from: "left", to: "right", taper: 4 };
  const a = litRibbons(paw, [span], "a"), b = litRibbons(paw, [{ ...span, ends: undefined, contact: undefined, ground: undefined, cites: undefined, bare: undefined, most: undefined }], "a");
  assert.equal(a.svg, b.svg);
  assert.deepEqual(a.lines[0]!.span.ends, ["taper", "taper"]);
  assert.deepEqual(a.lines[0]!.span.taper, [4, 4]);
});

test("a free end tapers over 1.8 pt, a joined end is full width to its point with a round cap, and a covered end runs on under its part and fades there", () => {
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
  // Covered at its start: it runs on 1.5 pt before where it is typed at full width, then fades out over 1.8 pt, so an
  // end that no part covers fades rather than stopping square (the line gate checks that one does).
  const total = arc([...spanPoints(paw, 0, 1), spanPoints(paw, 0, 1)[0]!]).at(-1)!;
  const under = litRibbons(paw, [{ from: "left", to: "right", ends: ["under", "free"] }], "under");
  const [f0] = under.outlined[0]!;
  const ran = ((fracAt(paw, "left") - f0 + 1) % 1) * total;
  assert.ok(Math.abs(ran - UNDER_RUN - FREE_TAPER) < 0.05, `the covered end runs on ${ran.toFixed(2)} pt past where it is typed`);
  assert.ok(UNDER_RUN >= 1, "a covered end runs on at least 1 pt at full width");
  assert.deepEqual(under.lines[0]!.span.taper, [FREE_TAPER, FREE_TAPER]);
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

test("a light line's ceiling keeps it light and thin where the sheet lines a fur edge lightly, whatever the light and the ground", () => {
  const sole: LitSpan = { from: "right", to: "left" };
  const full = litRibbons(paw, [sole], "s"), deep = tonesOf(full.svg, LINES.cream);
  assert.ok(Math.max(...deep) >= 8, "under the sole the line runs on to the darkest");
  const light = litRibbons(paw, [{ ...sole, most: 0.25 }], "s");
  assert.ok(tonesOf(light.svg, LINES.cream).every((t) => t <= 3), `the light line's tones ${tonesOf(light.svg, LINES.cream)}`);
  // As thin as the light rule draws a lit edge, with its wobble: 1.2 to 1.4 pt, where the sole's is 1.6.
  assert.ok(light.lines[0]!.drawn[1] <= 1.41 && light.lines[0]!.drawn[1] < full.lines[0]!.drawn[1] - 0.15, `the light line is ${light.lines[0]!.drawn[1]} pt at its widest`);
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

const BUN_SPEC: BunSpec = { leg: [[-6, -22], [6, -22]], wrist: [[-6, -15], [6, -15]], bulge: [0.9, 0.9], ground: 0, lobes: [0.32, 0.36, 0.32], scallop: 0.6 };

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
  assert.throws(() => bun({ ...BUN_SPEC, bulge: [0.2, 0.2] }), /1\.03 times the leg's column, not 1\.1 to 1\.2/);
  // Measured against the column, not the wrist: a bun that passes by pinching the wrist (the first demo's hourglass) fails.
  assert.throws(() => bun({ ...BUN_SPEC, wrist: [[-5.4, -15], [5.4, -15]], bulge: [1.2, 1.2] }), /narrows 10% into the wrist .* more than 5%/);
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
  steps: [{ from: [11.4, -27], to: [12.9, -19.6], lock: { len: 1.2, width: 7.4, lean: 0.45 } }],
  hem: { from: [10, -4], to: [-10, -4], locks: HEM, tipRound: 0.4 },
  axis: [[0, -40], [0, 0]],
  // Seen from the front, the ear hangs behind the head: both ends run on under it.
  line: { from: [-12, -24], to: [6, -36], ends: ["under", "under"] },
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
  // A step is one broad low lock leaning along the edge (fur.ts's STEP): the first ears' steps, leaning 0.7 and more, read as barbs.
  assert.throws(() => earEdge({ ...EDGE, steps: [{ ...EDGE.steps[0]!, lock: { len: 1.4, width: 6.6, lean: 0.7 } }] }), /leans 0.7, not 0.2 to 0.5/);
  assert.throws(() => earEdge({ ...EDGE, steps: [{ ...EDGE.steps[0]!, lock: { len: 2.4, width: 6.6, lean: 0.4 } }] }), /stands 2.4 pt out/);
});

test("an ear's line is one span on the tan, ending as its view states, light at the top and deepest at the hem", () => {
  const { span } = earEdge(EDGE);
  assert.equal(span.on, "tan");
  assert.deepEqual(span.ends, ["under", "under"]);
  // In profile the ear lies over the head: its front end is free (or joins the head's line), as the view says.
  assert.deepEqual(earEdge({ ...EDGE, line: { ...EDGE.line, ends: ["free", "under"] } }).span.ends, ["free", "under"]);
  const under = span.under as (p: P) => number;
  const depths = [-40, -30, -20, -10, 0].map((y) => under([0, y]));
  assert.equal(depths[0], 0, "the line is the light's own at the ear's top");
  assert.ok(Math.abs(depths[4]! - 0.7) < 1e-9, `the line lies ${depths[4]} deep at the hem`);
  for (let k = 1; k < depths.length; k++) assert.ok(depths[k]! > depths[k - 1]!, `the line does not deepen down the ear (${depths})`);
  // Drawn, it is lighter at the top than at the hem.
  const drawn = litRibbons(earEdge(EDGE).shape, [{ ...span, from: [-11.6, -26], to: [10.6, -31] }], "ear");
  assert.ok(drawn.lines.length === 1 && drawn.lines[0]!.span.ends.join() === "under,under");
});

test("an ear's paint over an edge takes the hem's 3 or 4 tips for its clumps and keeps its locks uneven and fanned", () => {
  const edge = earEdge(EDGE);
  const ear = { ear: edge.shape, axis: EDGE.axis, light: "", under: [], dips: [] };
  // Uneven in length and spacing, and fanning out toward the hem with the ear's droop (15° from the first to the last).
  const uneven: P[][] = [[[-8.5, -26], [-10, -14], [-11, -5]], [[-4.6, -20], [-5.4, -10], [-5.8, -2]], [[2.4, -30], [2.7, -16], [3, -1]], [[6.8, -22], [8, -12], [9.4, -4]]];
  assert.doesNotThrow(() => earFur({ ...ear, locks: uneven, edge }));
  const comb: P[][] = [-7.5, -2.5, 2.5, 7.5].map((x): P[] => [[x, -22], [x, -12], [x, -2]]);
  assert.throws(() => earFur({ ...ear, locks: comb, edge }), /too even .* read as a comb/);
  // Uneven but parallel, as the side's first locks (within 7 to 10° of each other): still a comb.
  const parallel: P[][] = [[[-8.5, -26], [-9, -14], [-9, -5]], [[-4.6, -14], [-4.8, -8], [-4.8, -2]], [[2.4, -34], [2.4, -16], [2.6, -1]], [[6.8, -22], [7, -12], [7.4, -4]]];
  assert.throws(() => earFur({ ...ear, locks: parallel, edge }), /parallel strokes read as a comb/);
  assert.throws(() => earFur({ ...ear, locks: uneven, edge: { ...edge, notches: edge.notches.slice(0, 1) } }), /hem is 3 or 4 lock tips, not 2/);
});

/** A round head: 24 nodes round a circle of radius 40, clockwise on screen from its right, and a place on it by angle. */
const ring = (r: number, c: P, n = 24): Shape => smooth(Array.from({ length: n }, (_, k): Node => [c[0] + r * Math.cos((k / n) * 2 * Math.PI), c[1] + r * Math.sin((k / n) * 2 * Math.PI)]));
const on = (deg: number, r = 40, c: P = [0, -100]): P => [c[0] + r * Math.cos((deg * Math.PI) / 180), c[1] + r * Math.sin((deg * Math.PI) / 180)];
const HEAD: HeadFurSpec = {
  base: ring(40, [0, -100]),
  crown: [{ side: "R", from: on(220), to: on(233.2), locks: [{ len: 1.9, width: 4.8, lean: 0.5, dip: 0.45 }, { len: 1.45, width: 4.3, lean: 0.45 }], tipRound: 0.24, line: { from: on(250), to: on(205) } }],
  cheeks: [{
    side: "R", from: on(155), to: on(179), tipRound: 0.22, raised: on(170), line: { from: on(140), to: on(195) },
    clumps: [{ len: 2.4, width: 5.4, lean: 0.35, dip: 0.6 }, { len: 3, width: 6.6, lean: 0.45, dip: 0.7 }, { len: 2, width: 4.6, lean: 0.4 }],
  }],
  chin: {
    from: on(60), to: on(120), tipRound: 0.25, corners: [on(50), on(130)], line: { from: on(40), to: on(140) },
    scallops: [{ len: 1.3, width: 6.2, lean: 0.1, dip: 0.3 }, { len: 1.9, width: 7.8, lean: 0.2, dip: 0.4 }, { len: 1.4, width: 6.4, dip: 0.2 }, { len: 1.8, width: 5.6, lean: 0.1, dip: 0.3 },
      { len: 1.5, width: 7.4, lean: 0.2, dip: 0.4 }, { len: 1.9, width: 7.9 }],
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
  // The lower face's lines come and go with the fur, as the sheet's: lightest over each wisp's tip, darker in its notches,
  // and the light rule's own away from the wisps.
  for (const [line, tufts] of [[h.chin!, h.tufts.chin], [h.cheeks[0]!, h.tufts.cheeks]] as const) {
    const most = line.most as (p: P) => number;
    for (const t of tufts) {
      assert.equal(most(t.tip), HEAD_FUR.wisps.tip);
      assert.ok(Math.abs(most(t.notches[1]) - HEAD_FUR.wisps.notch) < 1e-9 || t === tufts.at(-1), "a notch is the darkest");
    }
    assert.equal(most(on(0)), 1, "no ceiling away from the wisps");
  }
  assert.equal(h.spans().length, 3, "one line per place");
  // Under a raised ear the cheek's line starts lower, at `raised`, from open fur.
  const raised = h.spans({ R: true })[1]!;
  assert.deepEqual(raised.to, on(170));
  assert.deepEqual(raised.ends, ["join", "free"]);
  assert.deepEqual(h.spans({ L: true })[1], h.cheeks[0], "a raised ear on the other side moves this cheek's line");
});

test("the crown's line joins the ear's where the two outlines cross, and the root's stretch past it is cited by its length and feathered", () => {
  // An ear of radius 10 whose centre lies 48 pt out at 230°: the outlines cross 7.85° either side of it.
  const ear = ring(10, on(230, 48), 24);
  const spec: HeadFurSpec = { ...HEAD, crown: [{ ...HEAD.crown![0]!, line: { from: on(200), to: on(223) }, ear }] };
  const h = headFur(spec);
  const join = h.crown[0]!.to as P;
  const off = (shape: Shape) => Math.min(...sample(shape.segs, 64).map((q) => v.len(v.sub(q, join))));
  assert.ok(off(h.head) < 0.3 && off(ear) < 0.3, `the join (${join}) lies ${off(h.head).toFixed(2)} and ${off(ear).toFixed(2)} pt off the two outlines`);
  // From the cheek's upper end (195°) to the crossing (222.15°) the head's edge lies over the root: 27.15° of a 40 pt ring.
  const length = (27.15 * Math.PI * 40) / 180;
  assert.equal(h.roots.length, 1);
  assert.ok(Math.abs(h.roots[0]!.length - length) < 0.6, `the root's stretch is ${h.roots[0]!.length.toFixed(2)} pt, not ${length.toFixed(2)}`);
  const cheek = h.cheeks[0]!;
  assert.deepEqual(cheek.ends, ["join", "free"], "the cheek's line comes out of the root's overlap free");
  assert.equal(cheek.cites, 214);
  assert.ok(Math.abs(cheek.bare![1] - (h.roots[0]!.length + 0.5)) < 1e-9 && cheek.bare![0] === 0, `the cheek cites ${cheek.bare} pt`);
  assert.match(h.soften(C.fur, [-60, -160, 120, 120]).body, /<path d="M/, "the root's stretch is feathered");
  assert.equal(h.soften(C.fur, [-60, -160, 120, 120], { R: true }).body, "", "not under a raised ear");
  // Under a raised ear the cheek's line ends lower, at `raised` (170°), free; its upper end here is its `to` (the line
  // runs up toward the root, as a left cheek's does), so its jaw end still joins, and the stretch it cites runs from the
  // crossing down to `raised`: the root's stretch and the head's edge from 170° (in the cheek's fur) to 195°.
  const up = h.spans({ R: true }).find((s) => s.cites === 214)!;
  assert.deepEqual(up.to, on(170));
  assert.deepEqual(up.ends, ["join", "free"], "a raised side's line frees its jaw end instead of its upper end");
  const upLength = h.roots[0]!.length + arc(spanPoints(h.head, fracAt(h.head, on(170)), fracAt(h.head, on(195)))).at(-1)!;
  assert.ok(Math.abs(up.bare![1] - (upLength + 0.5)) < 0.6 && up.bare![0] === 0, `the raised cheek cites ${up.bare} pt, not [0, ${(upLength + 0.5).toFixed(2)}]`);
  // Without its ear, a crown root's line ends where it is typed and no stretch is cited.
  assert.deepEqual(headFur(HEAD).cheeks[0]!.cites, undefined);
  // An ear whose outline does not cross the head's near the typed join is refused.
  assert.throws(() => headFur({ ...spec, crown: [{ ...spec.crown![0]!, ear: ring(10, on(230, 60), 24) }] }), /outlines cross nowhere from the crown's join/);
  assert.throws(() => headFur({ ...spec, crown: [{ ...spec.crown![0]!, ear: ring(10, on(246, 48), 24) }] }), /outlines cross \d+\.\d\d pt from the crown's join .* at most 4/);
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
  // The first recipe's chin and cheeks, which read as a cookie-cutter cloud: broad round scallops, round clumps.
  const cloud: Lock[] = [{ len: 1.2, width: 12, lean: -0.35, dip: 0.3 }, { len: 1, width: 13.5, lean: -0.25, dip: 0.25 }, { len: 1.4, width: 12.5, lean: -0.1, dip: 0.3 },
    { len: 1.1, width: 13, lean: 0.1, dip: 0.25 }, { len: 1.3, width: 12, lean: 0.25, dip: 0.3 }, { len: 0.9, width: 13, lean: 0.35 }];
  assert.throws(() => headFur({ ...HEAD, chin: { ...chin, tipRound: 0.4, scallops: cloud } }), /tipRound 0.4 is blunter than 0.25.*a repeat, not fur/);
  const cheek = HEAD.cheeks![0]!;
  assert.throws(() => headFur({ ...HEAD, cheeks: [{ ...cheek, tipRound: 0.3 }] }), /tipRound 0.3 is blunter than 0.25/);
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
  // Nothing lighter than the marking, by how light it reads: cream, white, the fur's shade, the eyes' white.
  for (const light of [C.fur, C.light, C.furShade, C.furShadeBy, C.eyeWhite]) {
    assert.throws(() => brush("patch", PART, PATCH, 0.9, { ...BRUSH, colour: light }), /no light streaks/, `${light} as the marking's own colour`);
    assert.throws(() => brush("patch", PART, PATCH, 0.9, { ...BRUSH, inside: { ...BRUSH.inside, colour: light } }), /lighter than the marking's own/, `${light} as its inner strands`);
  }
  assert.throws(() => brush("patch", PART, PATCH, 0.9, { ...BRUSH, inside: { ...BRUSH.inside, colour: C.patch } }), /lighter than the marking's own/, "the head patches' paler tan inside the tan");
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

// The line gate (DECISIONS 219) on the dog's own views, each composited in rig.json's draw order.
const rig = JSON.parse(readFileSync(new URL("../src/rig.json", import.meta.url), "utf8")) as Rig;

test("a right-facing view's gated spans are found through facing.ts's mirror and held as in the facing they were typed in", () => {
  // A fur edge lined by two spans, in a piece mirrored as a .R view mirrors its .L piece: its spans keep the .L key.
  const furred = furEdge(paw, [-16, -8], [-16, -18], [{ len: 2.4, width: 3.4, lean: 0.4, dip: 0.6 }, { len: 3, width: 4.4, lean: 0.5, dip: 0.6 }, { len: 2.2, width: 3.4, lean: 0.35 }], 0.2);
  const two: LitSpan[] = [{ from: [0, -30], to: [-17, -12], ends: ["join", "join"] }, { from: [-17, -12], to: [0, -30], ends: ["join", "join"] }];
  const one: LitSpan[] = [{ from: 0, to: 1, ends: ["join", "join"] }];
  const view = (spans: LitSpan[], R: boolean): Drawing => {
    const p = lineGate(litPart("tail", furred, { fill: C.fur }, spans));
    return { region: `tail/side.${R ? "R" : "L"}`, svg: "", anchor: [0, 0], meta: (R ? mirrorPiece(p) : p).meta };
  };
  for (const R of [false, true]) {
    assert.match(gateProblems([view(two, R)], { rig }).join("\n"), /is drawn as 2 spans/, `the planted two-span fur edge is found in side.${R ? "R" : "L"}`);
    assert.deepEqual(gateProblems([view(one, R)], { rig }), [], `one span all round passes in side.${R ? "R" : "L"}`);
  }
});

test("a part's feather fades its own line, and the line gate holds the faded run as below full width", () => {
  // The paw lined all round, then with its right side feathered away (transparent at x 16, opaque from x 10): the
  // line there fades with the part, as the side's hind paw's back did against the haunch.
  const one: LitSpan[] = [{ from: 0, to: 1, ends: ["join", "join"] }];
  const view = (feather?: { from: P; to: P }): Drawing => {
    const p = lineGate(litPart("tail", paw, { fill: C.fur, ...(feather ? { feather } : {}) }, one));
    return { region: "tail/side.L", svg: "", anchor: [0, 0], meta: p.meta };
  };
  assert.deepEqual(gateProblems([view()], { rig }), []);
  const faded = view({ from: [16, -8], to: [10, -8] });
  assert.ok(((faded.meta!.lines[0] as LitLine).span.faded ?? []).length > 0, "the span says where the feather fades it");
  assert.match(gateProblems([faded], { rig }).join("\n"), /the edge of tail shows \d+\.\d\d pt below full line width/);
});

test("today's views, gated whole, fail the line gate, and each right-facing view as its left-facing view does", () => {
  // No view has opted in, so the build passes; were every rest drawing gated, the gate would find today's broken lines,
  // and every check, not only the tapers, would run in both facings (the markings each facing shows aside, DECISIONS 102).
  const all = drawings();
  const gated = (view: string) => all.map((d) => (d.region.split("/")[1] === view && d.meta
    ? { ...d, meta: { ...d.meta, lines: d.meta.lines.map((l) => ((l as LitLine).span ? { ...l, span: { ...(l as LitLine).span, gate: true } } : l)) } } : d));
  const kinds = (view: string) => {
    const p = gateProblems(gated(view), { rig }).filter((x) => !/patch/.test(x.split(":")[0]!));
    return { edges: p.filter((x) => / shows .* below full line width/.test(x)).length, fur: p.filter((x) => /drawn as \d+ spans|middle of fur/.test(x)).length };
  };
  assert.ok(kinds("front").edges > 0, "today's front has broken lines the gate finds");
  for (const view of ["threeQuarter", "side"]) assert.deepEqual(kinds(`${view}.R`), kinds(`${view}.L`), `${view}.R is held as ${view}.L`);
});

test("counting only what shows (`shown`), the gate finds the front's head side bare under temple.L's line in every face that raises the left ear (DECISIONS 264)", () => {
  // Each raised-ear face composited as it is drawn, every part's state under the face's own name, as the front lane's
  // gate script composites them (qa/phase3/fur/front/gate.ts).
  const front = drawings().filter((d) => d.region.split("/")[1]!.split(":")[0] === "front");
  const FACES: Record<string, Record<string, string>> = {
    perkedL: { "ear.L": "onePerked", "temple.L": "up", "head.line": "templeL" },
    liftedL: { "ear.L": "lifted", "temple.L": "up", "head.line": "templeL" },
    listening: { "ear.L": "lifted", "ear.R": "lifted", "temple.L": "up", "temple.R": "up", "head.line": "temples" },
  };
  const decisions = decisionsOf(readFileSync(new URL("../DECISIONS.md", import.meta.url), "utf8"));
  for (const [face, parts] of Object.entries(FACES)) {
    const drawn = [...front.filter((d) => !d.region.includes(":")), ...Object.entries(parts).map(([part, state]) => ({ ...front.find((d) => d.region === `${part}/front:${state}`)!, region: `${part}/front:${face}` }))];
    const temple = (shown: boolean) => gateProblems(drawn, { rig, decisions, shown }).filter((p) => p.startsWith(`temple.L/front:${face}`));
    assert.deepEqual(temple(false), [], `${face}: the first gate takes temple.L's line under head.base as lining the head's side`);
    const found = temple(true).join("\n");
    assert.match(found, /the edge of temple\.L shows (\d+\.\d\d) pt below full line width from \(42\.\d, -11[67]\.\d\)/, `${face}: the break the reviewers saw, found`);
    const pt = Number(/shows (\d+\.\d\d) pt/.exec(found)![1]);
    assert.ok(pt > 2 && pt < 4, `${face}: ${pt} pt bare, the reviewers' 2.2 pt and its free end's taper`);
  }
});

test("the dog's DECISIONS, as the line gate reads them: the fur pass's entries stand, and the entries they replace cannot be cited", () => {
  const d = decisionsOf(readFileSync(new URL("../DECISIONS.md", import.meta.url), "utf8"));
  for (let n = 210; n <= 219; n++) assert.ok(d.entries.includes(n) && !d.replaced[n], `${n} is a current entry`);
  // 68 (the profile ear's top feathered under the crown) and 89 (the crown's line into each ear's) still stand.
  for (const n of [68, 89]) assert.ok(d.entries.includes(n) && !d.replaced[n], `${n} is a current entry`);
  // What the fur pass replaced, in whole or in part, each by the entry that says so.
  for (const [n, by] of [[74, 210], [79, 212], [72, 213], [85, 213], [7, 214], [33, 214], [76, 215], [81, 215], [64, 216], [82, 216], [45, 218]] as const)
    assert.ok(d.replaced[n]?.includes(by), `${n} is replaced by ${by}`);
});

// The fur kit's second round (DECISIONS 260 to 263): four more options, each drawing exactly what it drew before until
// a view asks for it.

/** Each point's width along an unclipped line (`reach`), from its polygons: [where it is, how wide]. */
function widths(svg: string): [P, number][] {
  const out: [P, number][] = [];
  for (const pts of polygons(svg)) {
    if (pts.length === 16) continue; // a join's disc
    const n = pts.length / 2;
    for (let j = 0; j < n; j++) out.push([v.mul(v.add(pts[j]!, pts[pts.length - 1 - j]!), 0.5), v.len(v.sub(pts[j]!, pts[pts.length - 1 - j]!))]);
  }
  return out;
}
const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
const cv = (xs: number[]) => Math.sqrt(mean(xs.map((x) => (x - mean(xs)) ** 2))) / mean(xs);

test("a living weight is fixed by its span's seed, stays inside the outer band, and changes nothing until a span asks for it", () => {
  const span: LitSpan = { from: "top", to: "left", ends: ["join", "join"] };
  assert.equal(litRibbons(paw, [span], "a").svg, litRibbons(paw, [{ ...span, weight: undefined }], "a").svg, "no weight, the line as before");
  const a = litRibbons(paw, [{ ...span, weight: { seed: 3 } }], "a", { reach: 1 });
  assert.equal(a.svg, litRibbons(paw, [{ ...span, weight: { seed: 3 } }], "a", { reach: 1 }).svg, "the same seed, the same line in every build");
  assert.notEqual(a.svg, litRibbons(paw, [{ ...span, weight: { seed: 4 } }], "a", { reach: 1 }).svg, "another seed, another line");
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const l = litRibbons(paw, [{ ...span, weight: { seed } }], "a").lines[0]!;
    assert.ok(l.drawn[0] >= LIMITS.outer[0] - 1e-9 && l.drawn[1] <= LIMITS.outer[1] + 1e-9, `seed ${seed}: ${l.drawn} pt, outside ${LIMITS.outer}`);
  }
  // With none of the band, the line is the band's thinnest all along.
  for (const [, w] of widths(litRibbons(paw, [{ ...span, weight: { seed: 3, amount: 0 } }], "a", { reach: 1 }).svg).slice(8, -8)) assert.ok(Math.abs(w - LIMITS.outer[0]) < 0.01, `${w} pt`);
});

test("a living weight is thick where the part turns under and thin on its lit top, its strokes coming and going along the top where the depth's width is even", () => {
  // Round the paw from its right down under its sole and up its left side to its top, its lit top on the upper left.
  const span: LitSpan = { from: "right", to: "top", ends: ["join", "join"] };
  const isTop = (p: P) => p[1] < -22 && p[0] < 0, isUnder = (p: P) => p[1] > -10 && p[1] < -3;
  const top: number[] = [], under: number[] = [], alongTop: number[] = [];
  for (const seed of [11, 12, 13, 14, 15, 16]) {
    const w = widths(litRibbons(paw, [{ ...span, weight: { seed } }], "a", { reach: 1 }).svg).slice(6, -6);
    for (const [p, x] of w) {
      if (isTop(p)) top.push(x);
      if (isUnder(p)) under.push(x);
    }
    alongTop.push(cv(w.filter(([p]) => isTop(p)).map(([, x]) => x)));
  }
  const today = cv(widths(litRibbons(paw, [span], "a", { reach: 1 }).svg).slice(6, -6).filter(([p]) => isTop(p)).map(([, x]) => x));
  assert.ok(mean(under) - mean(top) > 0.15, `turning under ${mean(under).toFixed(2)} pt, its lit top ${mean(top).toFixed(2)} pt`);
  assert.ok(mean(top) < 1.4, `its lit top ${mean(top).toFixed(2)} pt: at the band's thin end`);
  assert.ok(mean(alongTop) > 1.3 * today, `along its lit top its widths vary by ${mean(alongTop).toFixed(3)} (CV), the depth's by ${today.toFixed(3)}`);
});

test("under a paw's sole a living weight stays as fine as the sheet's where the paw presses", () => {
  const sole: LitSpan = { from: "right", to: "left", ground: "sole", ends: ["join", "join"] };
  for (const seed of [21, 22, 23, 24]) {
    const w = widths(litRibbons(paw, [{ ...sole, weight: { seed } }], "a", { reach: 1 }).svg).filter(([p]) => Math.abs(p[0]) < 3);
    assert.ok(w.length > 0);
    // Read back from the polygons' points, written to a thousandth of a point.
    for (const [p, x] of w) assert.ok(x <= LIMITS.outer[0] + (LIMITS.outer[1] - LIMITS.outer[0]) * WEIGHT.sole + 0.003, `seed ${seed}: ${x.toFixed(3)} pt under the sole's middle at x ${p[0].toFixed(1)}`);
  }
});

const SOFT_CHIN: HeadFurSpec = {
  ...HEAD,
  chin: { ...HEAD.chin!, scallops: [], soft: { wisps: [{ at: on(78), len: 1.7, width: 2.2, lean: -0.4 }, { at: on(97), len: 1.1, width: 1.7, lean: 0.35 }, { at: on(108), len: 2, width: 2.6, lean: 0.45 }], firm: [14, 14] } },
};

test("a soft chin is a smooth arc breaking into a few fine wisps, lined firm only at its sides, its bare bottom cited and feathered", () => {
  const h = headFur(SOFT_CHIN);
  assert.equal(h.chin, undefined, "no one line along the chin");
  assert.equal(h.tufts.chin.length, 3, "a wisp each");
  const [left, right] = h.chins;
  assert.equal(h.chins.length, 2, "its two firm sides");
  assert.deepEqual([left!.ends, right!.ends], [["join", "free"], ["free", "join"]], "each side joins the jaw's line and ends free in the chin's fur");
  assert.deepEqual(h.spans().slice(-2), h.chins);
  // The bottom between the firm sides is unlined, and the first side cites its length along the outline as drawn, its
  // wisps and all: longer than the arc's own (the chin's 100° of a 40 pt ring less 14 pt a side).
  const bare = arc(spanPoints(h.head, fracAt(h.head, left!.to as P), fracAt(h.head, right!.from as P))).at(-1)!;
  assert.ok(bare > (100 * Math.PI * 40) / 180 - 28, `the bottom is ${bare.toFixed(2)} pt along the outline`);
  assert.equal(left!.cites, 261);
  assert.ok(Math.abs(left!.bare![1] - (bare + 0.5)) < 0.6 && left!.bare![0] === 0, `the bottom cites ${left!.bare} pt, not [0, ${(bare + 0.5).toFixed(2)}]`);
  // Each wisp hangs past the arc where it is typed, by about its length.
  for (const w of SOFT_CHIN.chin!.soft!.wisps) {
    const out = Math.max(...sample(h.head.segs, 96).filter((p) => v.len(v.sub(p, w.at)) < w.width).map((p) => v.len(v.sub(p, [0, -100])) - 40));
    assert.ok(out > 0.6 * w.len && out < 1.3 * w.len, `the wisp at (${w.at.map((n) => n.toFixed(1))}) hangs ${out.toFixed(2)} pt, typed ${w.len}`);
  }
  assert.match(h.fringe(C.fur, [-60, -160, 120, 120]).body, /<path d="M.*filter="url\(#/, "the bare bottom is feathered");
  // A chin lined all along is as before: its one line, and no fringe.
  const lined = headFur(HEAD);
  assert.deepEqual(lined.chins, [lined.chin]);
  assert.deepEqual(lined.fringe(C.fur, [-60, -160, 120, 120]), { defs: "", body: "" });
});

test("a soft chin's wisps are never an even row: 2 to 4 of them, each its own size and spacing, fine and leaning out along the flow", () => {
  const soft = SOFT_CHIN.chin!.soft!;
  const withWisps = (wisps: typeof soft.wisps, extra = {}) => headFur({ ...SOFT_CHIN, chin: { ...SOFT_CHIN.chin!, soft: { ...soft, wisps, ...extra } } });
  // An even row: the same wisp at even steps.
  assert.throws(() => withWisps([75, 90, 105].map((deg, i) => ({ at: on(deg), len: 1.5, width: 2.4, lean: i === 0 ? -0.4 : 0.4 }))), /differ by 0%, under 25%: a row.*evenly spaced/);
  assert.throws(() => withWisps([66, 72, 80, 97, 104].map((deg, i) => ({ at: on(deg), len: [1, 1.8, 1.2, 2.2, 1.4][i]!, width: [1.7, 3, 2, 3.8, 2.2][i]!, lean: deg < 90 ? -0.4 : 0.4 }))), /5 wisps, not 2 to 4/);
  assert.throws(() => withWisps([{ ...soft.wisps[0]!, lean: 0.4 }, ...soft.wisps.slice(1)]), /wisp 0 leans toward the chin's middle/);
  assert.throws(() => withWisps([{ ...soft.wisps[0]!, len: 3.4, width: 5 }, ...soft.wisps.slice(1)]), /wisp 0 hangs 3\.4 pt, not 0\.9 to 2\.8; wisp 0 is 5 pt wide, not 1\.6 to 4\.5/);
  assert.throws(() => withWisps(soft.wisps, { flow: [-1, 0] }), /wisp 0 leans against the fur's flow/);
  assert.throws(() => headFur({ ...SOFT_CHIN, chin: { ...SOFT_CHIN.chin!, scallops: HEAD.chin!.scallops } }), /a soft chin has wisps, not scallops/);
});

/** A piece rendered alone on transparent at `zoom` px/pt, and how much darker than the fur it is at a model point (L*). */
function darknessOf(p: Piece, zoom: number): (at: P) => number {
  const [x, y, w, h] = p.box;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${x} ${y} ${w} ${h}">${p.svg}</svg>`;
  const png = PNG.sync.read(new Resvg(svg, { fitTo: { mode: "zoom", value: zoom }, background: "rgba(0,0,0,0)" }).render().asPng());
  const fur = lightness(C.fur);
  return ([px, py]) => {
    const i = Math.floor((px - x) * zoom), j = Math.floor((py - y) * zoom), k = (j * png.width + i) * 4;
    const hex = "#" + [0, 1, 2].map((c) => png.data[k + c]!.toString(16).padStart(2, "0")).join("");
    return fur - lightness(hex);
  };
}

/** Four small locks along a crown, back to front: a broad one on the left, a small flick, one on the right and the tall middle one in front. */
function lock(c: P, r: [number, number], line: [number, number], into?: P[]): Curl {
  const at = (deg: number): P => [c[0] + r[0] * Math.cos((deg * Math.PI) / 180), c[1] + r[1] * Math.sin((deg * Math.PI) / 180)];
  return { nodes: Array.from({ length: 10 }, (_, k): Node => at(36 * k)), line: { from: at(line[0]), to: at(line[1]), taper: [0.6, 3] }, ...(into ? { into: [into] } : {}) };
}
const LOCKS: Curl[] = [
  lock([-22, -151], [8, 5], [185, 335], [[-29.9, -151.4], [-26.6, -150.2], [-23, -149.6]]),
  lock([-13.5, -152], [3.2, 3.4], [200, 330], [[-16.6, -152.6], [-15.4, -151.2], [-14.2, -150.4]]),
  lock([12, -152], [9, 5.6], [195, 345]),
  lock([-3, -155], [8, 8.6], [190, 350], [[-10.9, -156.4], [-9.8, -154.4], [-8.4, -152.8]]),
];
const TUFT_PAINT = { fill: C.fur };

test("a crisp topknot is 4 or 5 small locks in a crisp thin line, each lock's base tucked into a short soft stroke, never a dark sliver", () => {
  assert.throws(() => topknot(LOCKS.slice(0, 3), TUFT_PAINT, { crisp: true }), /a crisp topknot is 4 or 5 small locks, not 3/);
  const today = topknot(LOCKS, TUFT_PAINT), crisp = topknot(LOCKS, TUFT_PAINT, { crisp: true });
  // The line's own soft edge (σ 0.3) is gone: the silhouette's side of each lock is its clip's own edge.
  assert.match(today.svg, /stdDeviation="0\.3"/);
  assert.doesNotMatch(crisp.svg, /stdDeviation="0\.3"/);
  for (const l of crisp.meta.lines.filter((l) => l.kind === "outer") as LitLine[]) {
    assert.ok(l.span.taper.every((t) => t <= FREE_TAPER + 1e-9), `a lock's line tapers over ${l.span.taper} pt, more than a free end's ${FREE_TAPER}`);
    assert.ok(l.drawn[1] <= 1.4, `a lock's line is ${l.drawn[1]} pt at its widest: thin, at the band's light end`);
  }
  // Each tuck: in the notch strokes' light tone, at the V full and round, thinning out toward its inner end, nothing
  // past the V outside the lock.
  assert.match(crisp.svg, new RegExp(`fill="${LINES.cream[1]}" opacity="${CRISP.tuck.opacity}" filter=`));
  const alpha = alphaOf(crisp, 16), dark = darknessOf(crisp, 16);
  const [v0, v1, v2] = LOCKS[0]!.into![0]!;
  const into = v.norm(v.sub(v1!, v0!)), near = v.add(v0!, v.mul(into, 0.7));
  assert.ok(dark(near) > 8, `the tuck at the V is ${dark(near).toFixed(1)} L* darker than the fur`);
  assert.ok(dark(v2!) < 0.5 * dark(near), `the tuck thins out toward its inner end: ${dark(v2!).toFixed(1)} L* there`);
  assert.ok(lightness(LINES.cream[1]!) > lightness(LINES.cream[3]!), "its tone the ladder's light end");
  assert.ok(alpha(v.sub(v0!, v.mul(into, 0.8))) < 0.1, `past the V outside the lock: alpha ${alpha(v.sub(v0!, v.mul(into, 0.8))).toFixed(2)}`);
});

test("a toe line along the paw's dome is the ball's meridian through its foot, round at both ends, never a straight pointed tick", () => {
  const dome: Dome = { centre: [0, -5], size: [9, 6] };
  const m = meridian(dome, [-5, -1.2], -8);
  assert.ok(v.len(v.sub(m.pts[0]!, [-5, -1.2])) < 1e-9);
  assert.ok(Math.abs(m.pts.at(-1)![1] + 8) < 1e-9);
  // From below the ball's widest it bows out round it and comes back in over its top: the turnaround's "(".
  assert.ok(Math.min(...m.pts.map((p) => p[0])) < -5.3 && m.pts.at(-1)![0] > Math.min(...m.pts.map((p) => p[0])));
  assert.ok(m.bow > 0.04, `it bows ${m.bow.toFixed(3)} of its length`);
  const t = toes({ lines: [[[-5, -1.2], [-5.5, -8]], [[5, -1.2], [5.5, -8]]], fade: [-1.2, -8], soft: true, width: 0.9, dome });
  assert.deepEqual(t.inner, [], "drawn as paint under the shade");
  const caps = [...t.under!.matchAll(/a([0-9.]+) \1 0 1 0/g)].map((c) => Number(c[1]));
  assert.deepEqual(caps, [0.9 * DOME_TOES.foot / 2, 0.9 * DOME_TOES.foot / 2, 0.9 * DOME_TOES.top / 2, 0.9 * DOME_TOES.top / 2, 0.9 * DOME_TOES.foot / 2, 0.9 * DOME_TOES.foot / 2, 0.9 * DOME_TOES.top / 2, 0.9 * DOME_TOES.top / 2].map((r) => +r.toFixed(3)),
    "each line round at its foot and at its top, never a point");
  assert.match(t.under!, new RegExp(`stdDeviation="${DOME_TOES.blur}"`), "soft");
  assert.throws(() => toes({ lines: [[[-1, -1.2], [-1, -8]], [[5, -1.2], [5.5, -8]]], fade: [-1.2, -8], dome }), /lies 0\.1\d of its paw's half-width off the ball's middle, under 0\.25: it would run straight up the middle/);
  assert.throws(() => toes({ lines: [[[-5, -1.2], [-5, -12]], [[5, -1.2], [5.5, -8]]], fade: [-1.2, -8], dome }), /a toe line at y -12 lies off its paw's ball/);
  assert.throws(() => toes({ lines: [[[-5, -1.2], [-5, -8]], [[5, -1.2], [5.5, -8]]], fade: [-1.2, -8], width: 1.2, dome }), /a toe line is 1\.2 pt, not an inner line's 0\.6 to 0\.9/);
  // Without a dome, the toe lines as before.
  assert.deepEqual(toes({ lines: [[[-5, -1.2], [-5.5, -8]], [[5, -1.2], [5.5, -8]]], fade: [-1.2, -8], soft: true }).inner!.length, 2);
});
