// Tests for the finish pass's shared recipes (DECISIONS 73 to 76, 78 to 84): every drawn view takes its eyes, its outer
// line, its topknot, its ear paint, its paws' toe lines and its tag from characters/dog/src/parts/; the line darkens and fills out from where the light
// falls to where the part meets the ground, on warm ladders with no grey; the eye's white is a crescent as wide as
// its view asks on its outer side and none on the other, under a large catchlight and a tiny one (Q26, DECISIONS 201); and the topknot and the ears keep
// their counts (3 to 5 curls, 4 to 7 locks over 2 or 3 clumps, or over a hem of 3 or 4 tips where the view builds the
// ear's edge, DECISIONS 215). A sole that takes the fur pass's ground term holds 216's pin instead of the darkest.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { smooth, type Node, type P } from "../../draw/geom.ts";
import { LIMITS } from "../../draw/lint.ts";
import type { Paint } from "../../draw/paint.ts";
import { earFur } from "../src/parts/ear.ts";
import { eye, eyeGeometry, type EyeSpec } from "../src/parts/eye.ts";
import { litRibbons, SOLE, type LitSpan } from "../src/parts/lines.ts";
import { topknot, type Curl } from "../src/parts/topknot.ts";
import { toes } from "../src/parts/paw.ts";
import { tagPaint } from "../src/parts/tag.ts";
import { C, LINES, palette } from "../src/palette.ts";
import { front } from "../src/views/front.ts";
import { side } from "../src/views/side.ts";
import { threeQuarter } from "../src/views/threeQuarter.ts";

const VIEWS = { front, threeQuarter, side };

test("every drawn view takes its eyes, line, topknot and ears from the shared parts", () => {
  for (const view of Object.keys(VIEWS)) {
    const src = readFileSync(new URL(`../src/views/${view}.ts`, import.meta.url), "utf8");
    for (const part of ["eye", "lines", "topknot", "ear", "paw", "tag"]) assert.match(src, new RegExp(`from "\\.\\./parts/${part}\\.ts"`), `${view} does not import parts/${part}.ts`);
    for (const call of ["topknot(", "earFur(", "litPart(", "toes(", "tagPaint("]) assert.ok(src.includes(call), `${view} never calls ${call.slice(0, -1)}`);
  }
});

test("every drawn view builds, its topknot and ears within their counts", () => {
  // The recipes throw on a topknot of other than 3 to 5 curls and an ear of other than 4 to 7 locks or 2 or 3 clumps.
  for (const [name, draw] of Object.entries(VIEWS)) assert.ok(draw().length > 0, `${name} draws nothing`);
});

// sRGB to CIE L*a*b* (D65), for the ladders' lightness, hue and chroma.
function lab(hex: string): [number, number, number] {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((u) => (u <= 0.04045 ? u / 12.92 : ((u + 0.055) / 1.055) ** 2.4));
  const [r, g, b] = c as [number, number, number];
  const X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047, Y = 0.2126 * r + 0.7152 * g + 0.0722 * b, Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (t * 24389) / 27 / 116 + 16 / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}

test("the line ladders darken from lit to the ground, warm all through, and are the palette's", () => {
  // The two ladders; their lit steps beyond the light end (DECISIONS 285) are held in furkit.test.ts.
  for (const [name, ladder] of [["cream", LINES.cream], ["tan", LINES.tan]] as const) {
    assert.equal(ladder.length, 11, `${name} has ${ladder.length} tones`);
    const L = ladder.map((h) => lab(h)[0]);
    for (let k = 1; k < L.length; k++) assert.ok(L[k]! < L[k - 1]!, `${name}[${k}] ${ladder[k]} is no darker than ${ladder[k - 1]}`);
    for (const h of ladder) {
      const [, a, b] = lab(h);
      const hue = (Math.atan2(b, a) * 180) / Math.PI, chroma = Math.hypot(a, b);
      assert.ok(hue > 45 && hue < 75 && chroma >= 15, `${name}'s ${h} is not a warm brown (hue ${hue.toFixed(1)}, C* ${chroma.toFixed(1)})`);
      assert.ok(palette.includes(h), `${h} is not in the palette`);
    }
  }
  // The darkest cream tone is the soles' line; the lit cream tone is the sheet's crown and topknot line at its core
  // (L* 60 to 67 in the three turnaround crops, DECISIONS 79), at the light end of the sheet's L* 66 to 85 on the cream.
  assert.equal(LINES.cream[10], C.soleLine);
  const lit = lab(LINES.cream[0]!)[0];
  assert.ok(lit >= 64 && lit <= 70, `the lit cream line ${LINES.cream[0]} is L* ${lit.toFixed(1)}, not the sheet's crown line (64 to 70)`);
});

// A round part sitting on the ground, typed clockwise from its top: its lit upper left, its foot on the ground.
const ball = smooth([[0, -30, "top"], [15, -15, "right"], [0, 0, "bottom"], [-15, -15, "left"]] as Node[]);
const tones = (svg: string, ladder: string[]) => [...svg.matchAll(/fill="(#[0-9A-Fa-f]{6})"/g)].map((m) => ladder.indexOf(m[1]!));

test("the line is lightest and thinnest where the light falls, darkest and fullest on the ground", () => {
  const lit = litRibbons(ball, [{ from: "left", to: "top" }], "lit");
  const ground = litRibbons(ball, [{ from: [8, -2], to: [-8, -2] }], "ground");
  const litTones = tones(lit.svg, LINES.cream), groundTones = tones(ground.svg, LINES.cream);
  assert.ok(litTones.length && litTones.every((t) => t >= 0 && t <= 3), `the lit span's tones ${litTones} are not the ladder's lightest`);
  assert.ok(groundTones.length && groundTones.every((t) => t >= 8), `the ground span's tones ${groundTones} are not the ladder's darkest`);
  const [l, g] = [lit.lines[0]!.drawn!, ground.lines[0]!.drawn!];
  assert.ok(l[1] <= 1.45, `the lit line swells to ${l[1]} pt`);
  assert.ok(g[0] >= 1.55, `the ground line thins to ${g[0]} pt`);
  for (const w of [...l, ...g]) assert.ok(w >= LIMITS.outer[0] && w <= LIMITS.outer[1], `a drawn width ${w} is outside the outer line's band`);
  // A sole whose view asks for the fur pass's ground term (DECISIONS 216, replacing 74's and 79's soles-darkest pin
  // there) is the sole tone under its middle, lighter than the darkest, and eases out toward its ends.
  const sole = tones(litRibbons(ball, [{ from: [8, -2], to: [-8, -2], ground: "sole" }], "sole").svg, LINES.cream);
  assert.equal(Math.max(...sole), Math.round(SOLE.depth * 10), `the sole's tones ${sole} do not peak at its own tone`);
  assert.ok(Math.max(...sole) < Math.min(...groundTones), "the sole is as dark as the ground line it replaces");
});

test("a span's place deepens the line whatever the light, and a span on the tan takes the tan ladder", () => {
  const under = litRibbons(ball, [{ from: "left", to: "top", under: 1 }], "under");
  assert.ok(tones(under.svg, LINES.cream).every((t) => t === 10), "a span with under 1 is not the darkest tone all along");
  const tan: LitSpan = { from: "left", to: "top", on: "tan" };
  const onTan = tones(litRibbons(ball, [tan], "tan").svg, LINES.tan);
  assert.ok(onTan.length && onTan.every((t) => t >= 0), "a span on the tan paints a colour off the tan ladder");
});

// A round eye, so the crescent's width and reach can be measured exactly.
const round: EyeSpec = {
  centre: [0, -100], rx: 8.8, ry: 8.8, turn: 0, noseward: 1, rim: { top: 1, side: 1, foot: 1 },
  lid: { from: -18, to: 122, width: 1.8, flick: 0.25 }, white: { at: -15, width: 1.6, span: 62 }, shine: { at: [1.8, 5.35], r: 1.8 },
};

test("the eye's white is a crescent as wide as asked on its outer side, and none opposite", () => {
  const { open, iris } = eyeGeometry(round);
  // Round from the outer side, up positive, in the eye's own frame (u toward the nose, w down).
  const edge = (deg: number): [number, number] => {
    const a = (deg * Math.PI) / 180;
    return [open.u - open.a * Math.cos(a), open.w - open.a * Math.sin(a)];
  };
  const inIris = (p: [number, number]) => ((p[0] - iris.u) / iris.a) ** 2 + ((p[1] - iris.w) / iris.b) ** 2 <= 1;
  // At its widest the white runs from the opening's edge in to the iris's edge, `width` across.
  const a = (round.white.at * Math.PI) / 180, d: [number, number] = [-Math.cos(a), -Math.sin(a)];
  const t = (() => {
    const [cu, cw] = [iris.u - open.u, iris.w - open.w];
    const bq = -2 * (d[0] * cu + d[1] * cw), cq = cu * cu + cw * cw - iris.a * iris.a;
    return (-bq + Math.sqrt(bq * bq - 4 * cq)) / 2;
  })();
  assert.ok(Math.abs(open.a - t - round.white.width) < 0.01, `the crescent is ${(open.a - t).toFixed(3)} pt wide at its widest, not ${round.white.width}`);
  // It reaches round about `span` either side of its widest, and the opening's edge lies inside the iris beyond.
  const reach = [...Array(180).keys()].filter((k) => !inIris(edge(round.white.at + k)) && !inIris(edge(round.white.at - k))).length;
  assert.ok(reach >= round.white.span && reach <= round.white.span + 15, `the crescent reaches ${reach}° either side, for a span of ${round.white.span}°`);
  assert.ok(inIris(edge(round.white.at + 180)), "there is white on the nose's side too");
});

// One large catchlight and one tiny one (docs/QUESTIONS.md Q26, decided by the founder Oct 16, 2026; DECISIONS 200, 201).
test("the eye has one large and one tiny catchlight, no strokes, and its lash line is an outer line", () => {
  const p = eye(round);
  assert.equal(p.svg.split(`fill="${C.light}"`).length - 1, 2, "the eye does not have exactly its large and its tiny catchlight");
  assert.ok(!/stroke=/.test(p.svg), "the eye strokes a ring or a ray");
  const [lid] = p.meta.lines;
  assert.ok(lid && lid.kind === "outer" && lid.width >= LIMITS.outer[0] && lid.width <= LIMITS.outer[1], "the lash line is not an outer line");
});

test("a topknot is 3 to 5 curls and an ear 4 to 7 locks over 2 or 3 clumps, or over a hem of 3 or 4 tips", () => {
  const curl: Curl = { nodes: [[0, -10], [5, -5], [0, 0], [-5, -5]], line: { from: [-5, -5], to: [5, -5] } };
  assert.throws(() => topknot([curl, curl], {} as Paint), /3 to 5 curls/);
  assert.throws(() => topknot(Array(6).fill(curl), {} as Paint), /3 to 5 curls/);
  const lock: P[] = [[0, -10], [0, 0]];
  const ear = { ear: smooth([[0, -20], [8, -10], [0, 0], [-8, -10]]), axis: [[0, -20], [0, 0]] as [P, P], light: "", under: [] };
  assert.throws(() => earFur({ ...ear, locks: Array(3).fill(lock), dips: [[0, 0]] }), /4 to 7 locks/);
  assert.throws(() => earFur({ ...ear, locks: Array(8).fill(lock), dips: [[0, 0]] }), /4 to 7 locks/);
  assert.throws(() => earFur({ ...ear, locks: Array(5).fill(lock), dips: [] }), /2 or 3 clumps/);
  assert.throws(() => earFur({ ...ear, locks: Array(5).fill(lock), dips: [[0, 0], [1, 0], [2, 0]] }), /2 or 3 clumps/);
  // An ear whose view builds its edge (DECISIONS 215, from the floppy-ears panel's 3 or 4 lock tips round the hem)
  // counts the hem's tips instead: 3 or 4, whatever its dips (furkit.test checks the edge itself).
  const edge = (tips: number) => ({ shape: ear.ear, span: { from: [0, 0] as P, to: [0, 0] as P }, tips: Array.from({ length: tips }, (_, k): P => [k - 2, 0]), notches: Array.from({ length: tips - 1 }, (_, k): P => [k - 1.5, -1]) });
  assert.throws(() => earFur({ ...ear, locks: Array(5).fill(lock), dips: [], edge: edge(2) }), /3 or 4 lock tips, not 2/);
  assert.throws(() => earFur({ ...ear, locks: Array(5).fill(lock), dips: [], edge: edge(5) }), /3 or 4 lock tips, not 5/);
});

test("the eye's rim is darker than the iris it rings, and the lower iris lightens down to its foot", () => {
  assert.ok(lab(C.eyeRim)[0] < lab(C.eyeDark)[0], `the rim ${C.eyeRim} is no darker than the iris ${C.eyeDark}`);
  // The lower iris's crescents, painted from the broadest (highest) to the narrowest (along the foot), each lighter.
  const svg = eye(round).svg;
  const order = [C.dark, C.irisWarm, C.irisLight].map((c) => svg.indexOf(`fill="${c}"`));
  assert.ok(order.every((i) => i > 0) && order[0]! < order[1]! && order[1]! < order[2]!, "the lower iris's crescents are not painted from the held brown down to the light at the foot");
  const L = [C.dark, C.irisWarm, C.irisLight].map((c) => lab(c)[0]);
  assert.ok(L[0]! < L[1]! && L[1]! < L[2]!, `the lower iris's tones ${L.map((l) => l.toFixed(1))} do not lighten toward the foot`);
});

test("a topknot's notches are V strokes running into the fur, never hooks", () => {
  // The recipe has no hooks: a curl's notch strokes ("into") are its only inner lines, each tapering out inward.
  const curl: Curl = { nodes: [[0, -10], [5, -5], [0, 0], [-5, -5]], line: { from: [-5, -5], to: [5, -5] }, into: [[[5, -5], [3, -4.6], [1, -4.4]]] };
  const p = topknot([curl, curl, curl], { fill: C.fur });
  const inner = p.meta.lines.filter((l) => l.kind === "inner");
  assert.equal(inner.length, 3, "each curl draws exactly its one notch stroke");
  assert.ok(!("hooks" in curl), "a curl carries hooks");
});

test("a paw carries two or three toe lines, fading out upward", () => {
  const line: P[] = [[0, 0], [0.4, -2], [0.4, -4], [0, -5.6]];
  assert.throws(() => toes({ lines: [line], fade: [0, -6] }), /two or three toe lines/);
  assert.throws(() => toes({ lines: [line, line, line, line], fade: [0, -6] }), /two or three toe lines/);
  const t = toes({ lines: [line, line], fade: [0, -6] });
  assert.equal(t.inner!.length, 2);
  for (const l of t.inner!) assert.ok(l.width >= LIMITS.inner[0] && l.width <= LIMITS.inner[1], `a toe line is ${l.width} pt, not an inner line`);
  const stops = [...t.under!.matchAll(/stop-opacity="([0-9.]+)"/g)].map((m) => Number(m[1]));
  assert.ok(stops.length === 2 && stops[0]! > stops[1]!, `the toe lines do not fade out upward (${stops})`);
});

test("the tag is matte gold with a warm rim, one soft light and embossed rings", () => {
  const ring = smooth([[0, -4], [3, 0], [0, 4], [-3, 0]]);
  const p = tagPaint({ emboss: [ring, ring], light: "M0 0Z" });
  assert.equal(p.fill, C.tag);
  assert.ok(p.highlight && p.highlight.opacity <= 0.5 && p.highlight.blur >= 1, "the tag's light is a glossy streak, not a soft matte light");
  assert.equal(p.outline?.colour, C.tagEdge);
  const [, a, b] = lab(C.tagEdge), hue = (Math.atan2(b, a) * 180) / Math.PI;
  // The sheet's tag rims sit at hue 77.5 to 81.3 (#A67A33, #B68531, #AE8430); the olive rim reviewers rejected, #A07C2D, at 83.1.
  assert.ok(hue > 72 && hue < 82, `the tag's rim ${C.tagEdge} is not the sheet's warm gold-brown (hue ${hue.toFixed(1)})`);
  assert.equal(p.inner?.length, 2, "each embossed heart is one ring");
  for (const r of p.inner!) assert.equal(r.colour, C.tagEmboss);
});
