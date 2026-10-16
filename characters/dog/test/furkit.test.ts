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
import { arc, fracAt, mirrorX, smooth, spanPoints, v, type Node, type P, type Shape } from "../../draw/geom.ts";
import { CONTACT_DEPTH, FREE_TAPER, litEdge, litRibbons, SOLE, UNDER_RUN, type LitSpan } from "../src/parts/lines.ts";
import { BUN, bun, SOFT_TOES, toes, type BunSpec } from "../src/parts/paw.ts";
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
