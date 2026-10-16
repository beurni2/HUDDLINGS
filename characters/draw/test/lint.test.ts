// Tests for the drawing lint: every rule fails on a planted fault and passes a clean drawing.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Drawing } from "../../build/atlas.ts";
import { rasterizeAll } from "../../build/raster.ts";
import { furSpan } from "../fur.ts";
import { arc, ellipse, sample, smooth, type Node, type Shape } from "../geom.ts";
import { decisionsOf, LIMITS, lineGate, lint, lintDrawing, reach, shapeKey, type Decisions, type SpanMeta } from "../lint.ts";
import { marking, part } from "../paint.ts";
import { blur, mask, type Piece } from "../svg.ts";

const PALETTE = ["#FFF4E8", "#91694A", "#FDEDDC", "#FFFFFF"];
const round: Node[] = Array.from({ length: 10 }, (_, i): Node => [20 * Math.cos((i / 10) * 2 * Math.PI), 20 * Math.sin((i / 10) * 2 * Math.PI)]);

/** A piece on a whole-point canvas, as frame.ts makes one. */
function drawing(p: Piece, region = "part/front", size = 60): Drawing {
  const h = size / 2;
  return { region, anchor: [h, h], meta: p.meta, svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${-h} ${-h} ${size} ${size}">${p.svg}</svg>` };
}
const raw = (body: string, size = "60", origin = "-30 -30") => ({ region: "raw/front", anchor: [0, 0] as [number, number], svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="60" viewBox="${origin} ${size} 60">${body}</svg>` });
const lintOf = (d: Drawing, corners?: Record<string, string>) => lintDrawing(d, { palette: PALETTE, ...(corners ? { corners } : {}) });

const clean = () => part("part", smooth(round), {
  fill: "#FFF4E8",
  shade: { multiply: "#FDEDDC", rim: { inset: 2.5, toLight: 4 }, blur: 2.4 },
  highlight: { colour: "#FFFFFF", opacity: 0.8, blur: 2 },
  outline: { colour: "#91694A", width: 1.54, blur: 0.3 },
  inner: [{ pts: [[0, 0], [0, 5]], width: 0.75, colour: "#91694A" }],
});

test("a clean part passes", () => {
  assert.deepEqual(lintOf(drawing(clean())), []);
});

test("more than 24 hand nodes in a shape fails", () => {
  const many = Array.from({ length: 25 }, (_, i): Node => [20 * Math.cos((i / 25) * 2 * Math.PI), 20 * Math.sin((i / 25) * 2 * Math.PI)]);
  assert.match(lintOf(drawing(part("part", smooth(many), { fill: "#FFF4E8" }))).join("\n"), /25 hand nodes/);
});

test("a colour outside the palette fails, wherever it is painted; masks and clips are not paint", () => {
  assert.match(lintOf(drawing(part("part", smooth(round), { fill: "#FFF4E9" }))).join("\n"), /colour #FFF4E9/);
  assert.match(lintOf(raw(`<path d="M0 0H5V5Z" style="fill: red"/>`)).join("\n"), /colour red/);
  assert.match(lintOf(raw(`<linearGradient id="g"><stop stop-color="#123456"/></linearGradient>`)).join("\n"), /colour #123456/);
  assert.deepEqual(lintOf(raw(mask("m", [-30, -30, 60, 60], `<rect x="-30" y="-30" width="60" height="60" fill="#000000"/>`))), []);
});

test("lines outside their bands fail: outer 1.2 to 1.8 pt, inner 0.6 to 0.9 pt, raw strokes in one or the other", () => {
  const thin = part("part", smooth(round), { fill: "#FFF4E8", outline: { colour: "#91694A", width: 1.1 } });
  assert.match(lintOf(drawing(thin)).join("\n"), /outer line 1.1 pt/);
  const thick = part("part", smooth(round), { fill: "#FFF4E8", inner: [{ pts: [[0, 0], [0, 5]], width: 1, colour: "#91694A" }] });
  assert.match(lintOf(drawing(thick)).join("\n"), /inner line 1 pt/);
  assert.match(lintOf(raw(`<path d="M0 0H5" stroke="#91694A" stroke-width="1"/>`)).join("\n"), /stroke 1 pt wide/);
  assert.deepEqual(lintOf(raw(`<path d="M0 0H5" stroke="#91694A" stroke-width="0.7"/>`)), []);
});

test("a stroke is held to its band as wide as it is drawn: scaled by its transforms, evenly, its width inherited", () => {
  const say = (body: string) => lintOf(raw(body)).join("\n");
  const line = (width: string) => `<path d="M0 0H5" stroke="#91694A" stroke-width="${width}"/>`;
  // Scaled into a band it passes, out of both it fails, whatever it declares.
  assert.equal(say(`<g transform="scale(2)">${line("0.7")}</g>`), "", "0.7 pt drawn 1.4 pt wide is an outer line");
  assert.equal(say(`<g transform="scale(0.5)">${line("1.5")}</g>`), "", "1.5 pt drawn 0.75 pt wide is an inner line");
  assert.match(say(`<g transform="scale(1.5)">${line("0.7")}</g>`), /a stroke 0.7 pt wide is drawn 1.05 pt wide by its transform, neither an outer line/);
  assert.equal(say(`<g transform="matrix(0 3 -3 0 0 0)">${line("0.5")}</g>`), "", "turned a quarter and scaled 3 times, 0.5 pt is drawn 1.5 pt wide");
  assert.equal(say(`<g transform="rotate(30) translate(4 2)">${line("0.7")}</g>`), "", "turning and moving leave its width");
  // A shape scaled unevenly draws its line unevenly wide.
  assert.match(say(`<g transform="scale(1 1.1)">${line("1.5")}</g>`), /a stroked <path> is scaled unevenly \(1.000 to 1.100\), drawing its 1.5 pt line 1.5 to 1.65 pt wide/);
  assert.match(say(`<g transform="skewX(10)">${line("0.7")}</g>`), /scaled unevenly/);
  // Drawn through a <use>, scaled by it; inherited from a group; 1 pt when nothing says.
  assert.match(say(`<defs>${line("0.7").replace("<path", '<path id="p"')}</defs><use href="#p" transform="scale(1.5)"/>`), /a stroke 0.7 pt wide is drawn 1.05 pt wide/);
  assert.match(say(`<g stroke="#91694A" stroke-width="1"><path d="M0 0H5"/></g>`), /a stroke 1 pt wide is neither/);
  assert.match(say(`<path d="M0 0H5" stroke="#91694A"/>`), /a stroke 1 pt wide is neither/);
  assert.equal(say(`<g stroke-width="1"><path d="M0 0H5" fill="#91694A"/></g>`), "", "an unstroked shape draws no line");
  // A millionth of a point past an edge passes, what transforms leave in the last digits; more fails, and reads as
  // past the edge: 1.196 pt reads 1.19, never 1.20.
  assert.equal(say(`<g transform="scale(${(1.2 - 5e-7) / 0.6})">${line("0.6")}</g>`), "");
  const short = say(`<g transform="scale(2)">${line("0.598")}</g>`);
  assert.match(short, /a stroke 0.598 pt wide is drawn 1.19 pt wide by its transform/);
  assert.doesNotMatch(short, /drawn 1\.2/);
  assert.match(say(`<g transform="scale(2)">${line("0.9002")}</g>`), /drawn 1.81 pt wide/);
});

test("a filter or mask without an explicit, bounded sRGB region fails", () => {
  assert.match(lintOf(raw(`<filter id="f"><feGaussianBlur stdDeviation="2"/></filter>`)).join("\n"), /filter f needs an explicit userSpaceOnUse region/);
  assert.match(lintOf(raw(`<filter id="f" filterUnits="userSpaceOnUse" x="-30" y="-30" width="60" height="60"><feGaussianBlur stdDeviation="2"/></filter>`)).join("\n"), /sRGB/);
  assert.match(lintOf(raw(`<filter id="f" filterUnits="userSpaceOnUse" x="-500" y="-500" width="1000" height="1000" color-interpolation-filters="sRGB"/>`)).join("\n"), /within the canvas/);
  assert.deepEqual(lintOf(raw(blur("f", [-30, -30, 60, 60], 2))), []);
  assert.match(lintOf(raw(`<mask id="m"><rect x="-30" y="-30" width="60" height="60" fill="#FFFFFF"/></mask>`)).join("\n"), /mask m needs an explicit userSpaceOnUse region/);
  assert.match(lintOf(raw(`<mask id="m" maskUnits="userSpaceOnUse" x="-30" y="-30" width="60" height="60"/>`)).join("\n"), /mask m needs color-interpolation="sRGB"/);
});

/** A mask holding a blur, as paint.ts makes one, over the raw canvas. */
const blurred = blur("b", [-30, -30, 60, 60], 2) + mask("m", [-30, -30, 60, 60], `<rect x="-30" y="-30" width="60" height="60" fill="#FFFFFF"/><g filter="url(#b)"><path d="M-10 -10H10V10H-10Z" fill="#000000"/></g>`);
const FAR = "M-500 -500H500V500H-500Z";

test("every shape under a mask stays within the canvas and the paint's reach, paths and moved groups included", () => {
  const say = (body: string) => lintOf(raw(`<defs>${blurred}</defs>${body}`)).join("\n");
  // The SVG that aborts resvg 2.6.2: a shape far past the canvas under a mask that holds a blur.
  assert.match(say(`<rect x="-500" y="-500" width="1000" height="1000" fill="#FDEDDC" mask="url(#m)"/>`), /<rect> under a mask that reaches past/);
  assert.match(say(`<path d="${FAR}" fill="#FDEDDC" mask="url(#m)"/>`), /<path> under a mask that reaches past/);
  assert.match(say(`<g mask="url(#m)"><g><path d="${FAR}" fill="#FDEDDC"/></g></g>`), /<path> under a mask that reaches past/);
  assert.match(say(`<g mask="url(#m)"><circle cx="0" cy="0" r="400" fill="#FDEDDC"/></g>`), /<circle> under a mask/);
  // Moved by its groups' transforms; relative and arc commands read as resvg reads them.
  assert.match(say(`<g mask="url(#m)" transform="translate(-200 0)"><path d="m0 0h5v5z" fill="#FDEDDC"/></g>`), /<path> under a mask that reaches past/);
  assert.equal(say(`<g transform="translate(200, 0)"><g transform="translate(-200 0)" mask="url(#m)"><path d="m0 0h5v5z" fill="#FDEDDC"/></g></g>`), "");
  assert.match(say(`<g mask="url(#m)"><path d="M-20 0a60 4 0 1 0 40 0" fill="#FDEDDC"/></g>`), /<path> under a mask/);
  assert.equal(say(`<g mask="url(#m)"><path d="M-20 0a20 4 0 1 0 40 0a20 4 0 1 0 -40 0Z" fill="#FDEDDC"/></g>`), "");
  // Geometry the lint cannot bound under a mask fails rather than passing unseen.
  assert.match(say(`<g mask="url(#m)"><rect x="0" y="0" width="100%" height="10" fill="#FDEDDC"/></g>`), /cannot bound/);
  assert.match(say(`<g mask="url(#m)"><use href="#r"/></g>`), /cannot bound/);
  // A mask's own content and a filtered element are drawn in their bounded regions, so they may run past.
  assert.deepEqual(lintOf(raw(`<defs>${blur("b", [-30, -30, 60, 60], 2)}${mask("m", [-30, -30, 60, 60], `<g filter="url(#b)"><path d="${FAR}" fill="#FFFFFF"/></g>`)}</defs><rect x="-30" y="-30" width="60" height="60" fill="#FDEDDC" mask="url(#m)"/>`)), []);
  assert.equal(say(`<g mask="url(#m)"><g filter="url(#b)"><path d="${FAR}" fill="#FDEDDC"/></g></g>`), "");
});

test("the rule refuses exactly the masked shapes that abort resvg 2.6.2, and passes what it draws", async () => {
  const doc = (body: string) => raw(`<defs>${blurred}</defs><path d="M-20 -20H20V20H-20Z" fill="#FFF4E8"/>${body}`);
  const huge = "M-2500 -2500H2500V2500H-2500Z";
  const cases = {
    "a masked path far past the canvas": doc(`<path d="M-250 -250H250V250H-250Z" fill="#FDEDDC" mask="url(#m)"/>`),
    "a masked group with a far child": doc(`<g mask="url(#m)"><path d="M-250 -250H250V250H-250Z" fill="#FDEDDC"/></g>`),
    "a far shape in the mask's own filtered content": raw(`<defs>${blur("b", [-30, -30, 60, 60], 2)}${mask("m", [-30, -30, 60, 60], `<g filter="url(#b)"><path d="${huge}" fill="#FFFFFF"/></g>`)}</defs>` +
      `<rect x="-30" y="-30" width="60" height="60" fill="#FDEDDC" mask="url(#m)"/>`),
    "a far shape under a filtered group in a masked group": doc(`<g mask="url(#m)"><g filter="url(#b)"><path d="${huge}" fill="#FDEDDC"/></g></g>`),
    // Definitions are drawn where a <use> draws them, under its masks.
    "an unmasked use of a masked far group in defs": doc(`<defs><g id="x" mask="url(#m)"><path d="M-250 -250H250V250H-250Z" fill="#FDEDDC"/></g></defs><use href="#x"/>`),
    "a use of a symbol holding a masked far group": doc(`<defs><symbol id="s"><g mask="url(#m)"><path d="M-250 -250H250V250H-250Z" fill="#FDEDDC"/></g></symbol></defs><use href="#s"/>`),
    "a masked use of a far path in defs": doc(`<defs><path id="p" d="M-250 -250H250V250H-250Z" fill="#FDEDDC"/></defs><g mask="url(#m)"><use href="#p"/></g>`),
    "a use moving a small masked group far": doc(`<defs><g id="x" mask="url(#m)"><path d="M-5 -5H5V5H-5Z" fill="#FDEDDC"/></g></defs><use href="#x" x="-400"/>`),
    "a masked group in defs that nothing uses": doc(`<defs><g id="x" mask="url(#m)"><path d="M-250 -250H250V250H-250Z" fill="#FDEDDC"/></g></defs>`),
  };
  for (const [name, d] of Object.entries(cases)) {
    const refused = lintOf(d).length > 0;
    const aborts = await rasterizeAll([d], [3]).then(() => false, (e: Error) => /SIGABRT|exit 134/.test(e.message));
    assert.equal(refused, aborts, `${name}: the lint ${refused ? "refuses" : "passes"} it, and resvg ${aborts ? "aborts" : "draws it"}`);
  }
});

test("a masked shape is held to its own mask's reach, from the filters that mask uses, never raised by the rest of the drawing", () => {
  const say = (body: string) => lintOf(raw(`<defs>${blurred}</defs>${body}`)).join("\n");
  // Mask m blurs by 2 pt: it reaches 6 pt past the canvas, and a masked rect 10 pt past it fails.
  const past = `<rect x="-40" y="-20" width="20" height="20" fill="#FDEDDC" mask="url(#m)"/>`;
  assert.match(say(past), /<rect> under a mask that reaches past the canvas and mask m's reach \(6 pt\)/);
  // A wide blur the mask never uses, whether nothing uses it or another shape does, lends it nothing.
  const wide = blur("w", [-90, -90, 180, 180], 20);
  assert.match(say(`<defs>${wide}</defs>${past}`), /mask m's reach \(6 pt\)/);
  assert.match(say(`<defs>${wide}</defs><path d="M0 0H5V5Z" fill="#FDEDDC" filter="url(#w)"/>${past}`), /mask m's reach \(6 pt\)/);
  // Nor does a move in the mask that feeds no filter: paint.ts moves a light group only right under one.
  const moved = mask("n", [-30, -30, 60, 60], `<g filter="url(#b)"><rect x="-30" y="-30" width="60" height="60" fill="#FFFFFF"/></g><g transform="translate(300 0)"><rect x="-5" y="-5" width="10" height="10" fill="#000000"/></g>`);
  assert.match(say(`<defs>${moved}</defs>${past.replace("url(#m)", "url(#n)")}`), /mask n's reach \(6 pt\)/);
  const fed = mask("l", [-30, -30, 60, 60], `<rect x="-30" y="-30" width="60" height="60" fill="#FFFFFF"/><g filter="url(#b)"><g transform="translate(8 0)"><rect x="-5" y="-5" width="10" height="10" fill="#000000"/></g></g>`);
  assert.equal(say(`<defs>${fed}</defs>${past.replace("url(#m)", "url(#l)")}`), "", "the light group's 8 pt move counts: 6 + 8 pt");
  // A mask with no filter (paint.ts's feather) reaches 2 pt, and a part's paint inside it reaches no further.
  const feather = mask("f", [-30, -30, 60, 60], `<rect x="-30" y="-30" width="60" height="60" fill="#FFFFFF"/>`);
  assert.match(say(`<defs>${feather}</defs><g mask="url(#f)"><rect x="-33" y="-20" width="20" height="20" fill="#FDEDDC"/></g>`), /mask f's reach \(2 pt\)/);
  assert.equal(say(`<defs>${feather}</defs><g mask="url(#f)"><rect x="-31.5" y="-20" width="20" height="20" fill="#FDEDDC"/></g>`), "");
  // The innermost mask counts: the shade's rect inside a feathered part is held to the shade's reach.
  assert.equal(say(`<defs>${feather}</defs><g mask="url(#f)"><rect x="-35" y="-20" width="20" height="20" fill="#FDEDDC" mask="url(#m)"/></g>`), "");
});

test("paint.ts sizes each masked rect by its own mask's reach, so feathered parts and markings pass", () => {
  const shade = { multiply: "#FDEDDC", rim: { inset: 2.5, toLight: 4 }, blur: 2.4 };
  const feathered = part("part", smooth(round), { fill: "#FFF4E8", shade, highlight: { colour: "#FFFFFF", opacity: 0.8, blur: 2 }, feather: { from: [0, -20], to: [0, -10] } });
  assert.deepEqual(lintOf(drawing(feathered)), []);
  // The fill under the feather covers the part's box; the shade's and the highlight's rects their own reach past it.
  const paintOf = (body: string) => body.replace(/<mask\b[\s\S]*?<\/mask>/g, "");
  const rects = [...paintOf(feathered.svg).matchAll(/<rect x="([^"]+)"[^>]*? fill="([^"]+)"(?:[^>]*? mask="url\(#([a-z]+)\d+\)")?/g)].map((m) => [m[2], Number(m[1]), m[3]]);
  assert.deepEqual(rects, [["#FFF4E8", -21, undefined], ["#FDEDDC", -21 - reach(2.4, 6.5), "shade"], ["#FFFFFF", -21 - reach(2, 8), "lit"]]);
  const host = { shape: smooth(round), paint: { fill: "#FFF4E8", shade } };
  const patch = smooth(round.map(([x, y]): Node => [x / 2, y / 2]));
  for (const clip of [true, false]) assert.deepEqual(lintOf(drawing(marking("part", host, patch, { fill: "#91694A", blur: 1.2, clip }))), [], `clip ${clip}`);
});

test("definitions are bounded where a <use> draws them, moved and masked as it draws them", () => {
  const say = (body: string) => lintOf(raw(`<defs>${blurred}</defs>${body}`)).join("\n");
  const small = `<defs><g id="x" mask="url(#m)"><path d="M-5 -5H5V5H-5Z" fill="#FDEDDC"/></g></defs>`;
  assert.equal(say(`${small}<use href="#x"/>`), "");
  assert.match(say(`${small}<use href="#x" x="-400"/>`), /<path> under a mask that reaches past the canvas and mask m's reach/);
  assert.match(say(`${small}<use href="#x" transform="translate(0 300)"/>`), /<path> under a mask that reaches past/);
  assert.equal(say(`${small}<g transform="translate(400 0)"><use href="#x" x="-400"/></g>`), "");
  // A symbol sets up a viewport of its own, so drawing one is refused rather than bounded.
  assert.match(say(`<defs><symbol id="s" viewBox="0 0 10 10"><g mask="url(#m)"><path d="M-5 -5H5V5H-5Z" fill="#FDEDDC"/></g></symbol><use id="u" href="#s" width="400" height="400"/></defs><use href="#u"/>`), /<use> of a <symbol>, whose viewport cannot be bounded/);
  // Through <use> in <use>, and a far path in defs used under a mask, each reported once.
  assert.match(say(`<defs><g id="t" mask="url(#m)"><path d="${FAR}" fill="#FDEDDC"/></g><use id="u" href="#t"/></defs><use href="#u"/>`), /<path> under a mask that reaches past/);
  const twice = lintOf(raw(`<defs>${blurred}<path id="p" d="${FAR}" fill="#FDEDDC"/></defs><g mask="url(#m)"><use href="#p"/><use href="#p"/></g>`));
  assert.equal(twice.length, 1, twice.join("\n"));
  // A <use> that draws itself is refused, not followed for ever.
  assert.match(say(`<g id="a"><use href="#a"/></g>`), /<use> that draws itself/);
});

test("a nested <svg> or a marker fails: each sets up a viewport the bounds do not model", () => {
  assert.match(lintOf(raw(`<svg x="-400" viewBox="0 0 1 1" width="800" height="800"><path d="M0 0H1V1Z" fill="#FDEDDC"/></svg>`)).join("\n"), /nested <svg>/);
  assert.match(lintOf(raw(`<defs><marker id="k"><path d="M0 0H1V1Z" fill="#FDEDDC"/></marker></defs><path d="M0 0H5" stroke="#91694A" stroke-width="1.5" marker-end="url(#k)"/>`)).join("\n"), /marker/);
});

test("the reach is paint.ts's: a wide shade on a small part passes, and a region past it fails", () => {
  // A 12 pt part with a 5 pt shade blur reaches 3 · 5 + 2.5 + 4 = 21.5 pt past its bounds, more than the 16 pt
  // the lint used to allow a part this small.
  const small: Node[] = Array.from({ length: 8 }, (_, i): Node => [6 * Math.cos((i / 8) * 2 * Math.PI), 6 * Math.sin((i / 8) * 2 * Math.PI)]);
  const piece = part("part", smooth(small), { fill: "#FFF4E8", shade: { multiply: "#FDEDDC", rim: { inset: 2.5, toLight: 4 }, blur: 5 } });
  const tight = drawing(piece, "part/front", 18);
  const left = Math.min(...[...tight.svg.matchAll(/<(?:filter|mask)\b[^>]*\sx="([^"]+)"/g)].map((m) => Number(m[1])));
  assert.ok(left < -9 - 16, `the shade's regions reach ${-9 - left} pt past the canvas`);
  assert.deepEqual(lintOf(tight), []);
  assert.equal(reach(5, 6.5), 21.5);
  assert.equal(reach(0, 0), 2, "never less than 2 pt");
  // A region a point past the reach fails.
  const past = { ...tight, svg: tight.svg.replace(/(<filter\b[^>]*\sx=")[^"]+"/, `$1${-9 - 22.5}"`) };
  assert.match(lintOf(past).join("\n"), /needs an explicit userSpaceOnUse region within the canvas and the paint's reach \(21\.5 pt\)/);
});

test("attributes read the same in either quote, character references decoded", () => {
  assert.match(lintOf(raw(`<path d='M0 0H5V5Z' fill='#123456'/>`)).join("\n"), /colour #123456/);
  assert.match(lintOf(raw(`<path d="M0 0H5V5Z" fill="&#35;123456"/>`)).join("\n"), /colour #123456/);
  assert.match(lintOf(raw(`<path d='M0 0H5' stroke='#91694A' stroke-width = '1'/>`)).join("\n"), /stroke 1 pt wide/);
  assert.deepEqual(lintOf(raw(`<filter id='f' filterUnits='userSpaceOnUse' x='-30' y='-30' width='60' height='60' color-interpolation-filters='sRGB'/>`)), []);
  assert.match(lintOf(raw(`<defs>${blurred}</defs><rect x='-500' y='-500' width='1000' height='1000' fill='#FDEDDC' mask='url(#m)'/>`)).join("\n"), /reaches past/);
});

test("a canvas that is not whole points, or not on whole points, fails", () => {
  assert.match(lintOf(raw("", "60.5")).join("\n"), /not whole points/);
  assert.match(lintOf(raw("", "60", "-30.5 -30")).join("\n"), /does not start on whole points/);
  assert.match(lintOf(raw("", "60", "-30 -29.75")).join("\n"), /does not start on whole points/);
  assert.deepEqual(lintOf(raw("", "60", "-30,-30")), []);
});

test("an <image> element or a data: URI fails (rule R8)", () => {
  assert.match(lintOf(raw(`<image href="x"/>`)).join("\n"), /<image>/);
  assert.match(lintOf(raw(`<rect x="0" y="0" width="1" height="1" fill="url(data:image/png;base64,AAAA)"/>`)).join("\n"), /data: URI/);
});

test("anything that brings in a picture or another file fails, however it is written (rule R8)", () => {
  const refused: Record<string, string> = {
    "a namespaced image": `<svg:image xmlns:svg="http://www.w3.org/2000/svg" href="#a"/>`,
    "any prefix": `<x:image xmlns:x="http://www.w3.org/2000/svg"/>`,
    "a filter's image": `<filter id="f" filterUnits="userSpaceOnUse" x="-30" y="-30" width="60" height="60" color-interpolation-filters="sRGB"><feImage href="#a"/></filter>`,
    "foreign content": `<foreignObject width="10" height="10"/>`,
    "another file": `<use href="parts.svg#ear"/>`,
    "xlink in single quotes": `<use xlink:href='sheet.png' xmlns:xlink="http://www.w3.org/1999/xlink"/>`,
    "any prefix, spaced": `<use x:href = "https://example.com/a.svg#b"/>`,
    "a url() in quotes": `<rect x="0" y="0" width="1" height="1" fill="url('crop.png')"/>`,
    "a url() in a style": `<rect x="0" y="0" width="1" height="1" style="fill: url( other.svg#g )"/>`,
    "a data: URI behind a character reference": `<use href="&#100;ata:image/png;base64,AAAA"/>`,
    "a file behind a hex reference": `<use href="&#x73;heet.png"/>`,
    "an unquoted attribute the lint cannot read": `<image href=sheet.png />`,
    "a style element": `<style>rect { fill: url(sheet.png) }</style>`,
    "a CSS escape": `<rect x="0" y="0" width="1" height="1" style="fill: \\75 rl(a.png)"/>`,
  };
  for (const [name, body] of Object.entries(refused)) assert.ok(lintOf(raw(body)).length > 0, `${name} passes: ${body}`);
  // An entity can hide an element from everything but an XML parser.
  const doctype = raw("&e;");
  doctype.svg = `<!DOCTYPE svg [<!ENTITY e "<image href='sheet.png'/>">]>${doctype.svg}`;
  assert.match(lintOf(doctype).join("\n"), /DOCTYPE/);
  // References to the drawing's own elements are how parts are made, in either quote.
  const own = `<defs><linearGradient id="g"><stop stop-color="#FFFFFF"/></linearGradient><path id="r" d="M0 0H5V5Z"/></defs>` +
    `<rect x="0" y="0" width="1" height="1" fill="url(#g)"/><rect x="0" y="0" width="1" height="1" fill="url('#g')"/><use href='#r'/><!-- a <note> --><title>&lt;part&gt;</title>`;
  assert.deepEqual(lintOf(raw(own)), []);
});

test("a convex corner tighter than 4 pt on an outlined edge fails, unless it is fur or the part has an exception", () => {
  const corner: Node[] = [[0, -20], [20, 0], [0, 20], [-20, 0]];
  const sharp = smooth(corner, { corners: [0] });
  const outlined = (s: typeof sharp) => drawing(part("part", s, { fill: "#FFF4E8", outline: { colour: "#91694A", width: 1.54 } }));
  assert.match(lintOf(outlined(sharp)).join("\n"), /0\.00 pt convex corner at \(0\.0, -20\.0\)/);
  assert.deepEqual(lintOf(outlined(sharp), { part: "drawn as the sheet draws it" }), []);
  assert.deepEqual(lintOf(outlined(furSpan(sharp, [-8, -12], [8, -12]))), []);
  // Off the outlined spans, a corner is not the lint's business.
  const hidden = part("part", sharp, { fill: "#FFF4E8", outline: { colour: "#91694A", width: 1.54, spans: [{ from: 0.3, to: 0.7 }] } });
  assert.deepEqual(lintOf(drawing(hidden)), []);
});

test("toe lobes may turn tighter than 4 pt, down to their own floor; nothing else may (Q29)", () => {
  // A 3 pt round on an outlined edge: a corner under 4 pt, unless it is a declared toe lobe, as the stubby-paws panel draws them.
  const lobe = (r: number, lobes: [number, number][]) => {
    const p = part("part", { nodes: [], typed: 0, segs: ellipse([0, 0], r, r), closed: true, fur: [] }, { fill: "#FFF4E8", outline: { colour: "#91694A", width: 1.54 } });
    return drawing({ ...p, meta: { ...p.meta, shapes: p.meta.shapes.map((s) => ({ ...s, lobes })) } });
  };
  assert.match(lintOf(lobe(3, [])).join("\n"), /turns a [23]\.\d\d pt convex corner .* outside fur/);
  assert.deepEqual(lintOf(lobe(3, [[0, 1]])), []);
  assert.match(lintOf(lobe(LIMITS.lobePt - 0.5, [[0, 1]])).join("\n"), /on a toe lobe \(at least 2.5 pt\)/);
});

// The line gate (the fur plan's vector gate A), on a view composited in its rig's draw order: a ring with lit spans, as
// the dog's parts/lines.ts reports them, and a part that may lie over it ("over") or under it ("below").
const ring = smooth(round);
const ringPts = sample(ring.segs, 48);
const RING = arc([...ringPts, ringPts[0]!]).at(-1)!;
const rigPart = (name: string) => ({ name, bone: "root", group: "body" as const, regions: { front: `${name}/front` } });
const RIG = { drawOrder: { front: ["below", "ring", "over"] }, parts: ["below", "ring", "over"].map(rigPart) };
/** A drawing of a shape with lit spans (from and to as shares, as drawn), gated as a lane that has opted in, or not. */
function spanned(shape: Shape, spans: Partial<SpanMeta>[], gate = true, region = "ring/front"): Drawing {
  const base = part(region.split("/")[0]!, shape, { fill: "#FFF4E8" });
  const lines = spans.map((s) => ({ kind: "outer" as const, width: 1.4, where: region.split("/")[0]!, drawn: [1.3, 1.5] as [number, number],
    span: { shape: shapeKey(shape.segs), from: 0.1, to: 0.3, length: 25, ends: ["free", "free"], taper: [1.8, 1.8], ...s } as SpanMeta }));
  const p: Piece = { ...base, meta: { ...base.meta, lines } };
  return drawing(gate ? lineGate(p) : p, region);
}
/** A plain part over the ring's right half (or under it, as "below"), reaching past it at the top and the bottom. */
const coverOf = (region: string) => drawing(part(region.split("/")[0]!, smooth(Array.from({ length: 12 }, (_, i): Node => [14 + 24 * Math.cos((i / 12) * 2 * Math.PI), 34 * Math.sin((i / 12) * 2 * Math.PI)])), { fill: "#FFF4E8" }), region, 100);
/** A species' DECISIONS as the gate reads them: 210 replaces 74's rule, 214 stands. */
const DECISIONS: Decisions = { entries: [74, 210, 214], replaced: { 74: [210] } };
const gateOf = (...ds: Drawing[]) => gateWith(DECISIONS, ...ds);
const gateWith = (decisions: Decisions | undefined, ...ds: Drawing[]) =>
  lint(ds, { palette: PALETTE, rig: RIG, ...(decisions ? { decisions } : {}) }).filter((s) => /line gate|lit span|fur edge|edge of/.test(s)).join("\n");
const share = (pt: number) => pt / RING;
/** The whole ring lined by one span joined to itself, as drawn: no gate problem. */
const whole: Partial<SpanMeta> = { from: 0, to: 1, ends: ["join", "join"], taper: [0, 0] };

test("the line gate holds only drawings whose lane has opted in, and only on a view its rig can composite", () => {
  const long: Partial<SpanMeta> = { from: 0, to: 1, ends: ["taper", "taper"], taper: [5, 5] };
  assert.equal(gateOf(spanned(ring, [long], false)), "", "today's tapered spans pass where no lane has opted in");
  assert.equal(gateOf(spanned(ring, [whole])), "", "the ring lined all round at full width passes");
  assert.match(gateOf(spanned(ring, [long])), /tapers over 5.00 pt at its start/);
  // A long taper wholly under a part drawn over the ring is not seen; one under a part drawn below it is.
  const hiddenTaper: Partial<SpanMeta> = { from: 0.95, to: 0.05, ends: ["taper", "taper"], taper: [5, 5] };
  assert.doesNotMatch(gateOf(spanned(ring, [hiddenTaper]), coverOf("over/front")), /tapers over/, "a taper hidden under a part");
  assert.match(gateOf(spanned(ring, [hiddenTaper]), coverOf("below/front")), /tapers over 5.00 pt at its start/);
  assert.equal(gateOf(spanned(ring, [{ ...long, cites: 210 }])), "", "a span that cites a current DECISIONS entry is let through");
  // A cite stands only on a current entry: one that does not exist, one a later entry replaces, or any cite the lint cannot check, fails, and the span is held as if it cited nothing.
  const fake = gateOf(spanned(ring, [{ ...long, cites: 99999 }]));
  assert.match(fake, /cites 99999, which is no DECISIONS entry/);
  assert.match(fake, /tapers over 5.00 pt at its start/, "a span whose cite fails is held to every rule");
  assert.match(gateOf(spanned(ring, [{ ...long, cites: 74 }])), /cites 74, which 210 replaces/, "the entry 210 replaced cannot be cited");
  assert.match(gateWith(undefined, spanned(ring, [{ ...long, cites: 210 }])), /cites 210, and the lint was given no DECISIONS entries/);
  // A cite never makes a fake join or an uncovered under end true: the sheet draws neither.
  const fakeJoin: Partial<SpanMeta> = { from: 0.1, to: 0.9, ends: ["join", "join"], taper: [0, 0], cites: 210, bare: [30, 0] };
  assert.match(gateOf(spanned(ring, [fakeJoin])), /joins no line at its start/, "a cited span's join is held");
  assert.match(gateOf(spanned(ring, [{ ...fakeJoin, ends: ["under", "join"], taper: [1.8, 0] }])), /runs on under no part at its start/, "and so is its under end");
  assert.match(lint([spanned(ring, [whole])], { palette: PALETTE }).join("\n"), /composites ring's view|the lint was given none/, "a gated drawing with no rig to place it fails");
  assert.match(gateOf(spanned(ring, [{ ...whole, shape: "00000000" }])), /runs on a shape \(00000000\) that no drawing of front reports/, "a span whose shape cannot be found fails");
});

test("the line gate fails any visible stretch of edge below full width, however long, and passes one a part covers", () => {
  // Two spans round the ring joined at its far side (0.5), their other ends free, a gap of `gap` pt between them at 0.
  const pair = (gap: number, cites?: number): Partial<SpanMeta>[] => [
    { from: share(gap / 2), to: 0.5, ends: ["free", "join"], taper: [1.8, 0], ...(cites ? { cites } : {}) }, { from: 0.5, to: 1 - share(gap / 2), ends: ["join", "free"], taper: [0, 1.8] }];
  assert.match(gateOf(spanned(ring, pair(1))), /the edge of ring shows 4\.[5-7]\d pt below full line width/, "a handoff's tapers and gap");
  for (const gap of [6, 12]) assert.match(gateOf(spanned(ring, pair(gap))), new RegExp(`shows ${gap + 3}\\.\\d\\d pt below full line width`), `a ${gap} pt gap is a hole in the line`);
  assert.equal(gateOf(spanned(ring, pair(12)), coverOf("over/front")), "", "a gap under a part drawn over the ring is not on a visible edge");
  assert.match(gateOf(spanned(ring, pair(12)), coverOf("below/front")), /shows 15\.\d\d pt below/, "a part drawn under the ring covers nothing of it");
  // A cite lets a bare stretch beside its span through only as far as the span says the sheet leaves it unlined.
  const cited = (bare?: [number, number]) => pair(12).map((s, i) => (i === 0 ? { ...s, cites: 210, ...(bare ? { bare } : {}) } : s));
  assert.match(gateOf(spanned(ring, cited())), /shows 15\.\d\d pt below full line width/, "a cite alone waives no bare edge beside it");
  assert.equal(gateOf(spanned(ring, cited([13.5, 0]))), "", "a stretch beside a citing span, no longer than it says, is let through");
  assert.match(gateOf(spanned(ring, cited([8, 0]))), /shows 15\.\d\d pt below full line width .* past the 9.80 pt its cite lets through/, "and no further than its own taper and that");
  assert.match(gateOf(spanned(ring, cited([0, 13.5]))), /shows 15\.\d\d pt below/, "the stretch lies before the span's start, not after its end");
  assert.match(gateOf(spanned(ring, pair(12).map((s, i) => (i === 0 ? { ...s, cites: 74, bare: [13.5, 0] as [number, number] } : s)))), /shows 15\.\d\d pt below/, "a replaced entry's cite waives nothing");
});

test("a join end must meet another line at full width, and an under end must run on under a part drawn over its line", () => {
  // Two spans whose joined ends lie 6 pt apart, with nothing between: a fake join.
  const apartBy = (gap: number): Partial<SpanMeta>[] => [{ from: 0, to: 0.5, ends: ["join", "join"], taper: [0, 0] }, { from: 0.5 + share(gap), to: 1, ends: ["join", "join"], taper: [0, 0] }];
  assert.equal(gateOf(spanned(ring, apartBy(0))), "", "two spans joined on a shared point pass");
  assert.match(gateOf(spanned(ring, apartBy(6))), /joins no line at its end/);
  // One span over the ring's left half, its ends running on under a part (as lines.ts draws them: 1.5 pt at full width,
  // then a 1.8 pt fade, past where they are typed at 0.25 and 0.75).
  const run = share(1.5 + 1.8), half: Partial<SpanMeta> = { from: 0.25 - run, to: 0.75 + run, ends: ["under", "under"], taper: [1.8, 1.8] };
  assert.equal(gateOf(spanned(ring, [half]), coverOf("over/front")), "", "ends under a part drawn over the ring, the rest of its edge covered");
  const bare = gateOf(spanned(ring, [half]));
  assert.match(bare, /runs on under no part at its start/, "a fake under end: no part covers it");
  assert.match(bare, /runs on under no part at its end/);
  assert.match(gateOf(spanned(ring, [half]), coverOf("below/front")), /runs on under no part/, "a part drawn under the line does not cover its end");
});

test("the line gate fails a fur edge drawn as more than one span, and a span ending in the middle of fur", () => {
  // Fur over about a fifth of the way round, as shares of the ring's length (as the meta holds it).
  const furred = furSpan(ring, ringPts[Math.round(ringPts.length * 0.1)]!, ringPts[Math.round(ringPts.length * 0.3)]!);
  const [a, b] = part("ring", furred, { fill: "#FFF4E8" }).meta.shapes[0]!.fur[0]!;
  const mid = (a + b) / 2;
  assert.equal(gateOf(spanned(furred, [whole])), "", "one span over the fur edge passes");
  assert.match(gateOf(spanned(furred, [{ from: a - 0.05, to: mid, ends: ["join", "join"], taper: [0, 0] }, { from: mid, to: a - 0.05, ends: ["join", "join"], taper: [0, 0] }])),
    /is drawn as 2 spans/);
  assert.match(gateOf(spanned(furred, [{ from: mid, to: mid - 0.001, ends: ["free", "free"], taper: [1.8, 1.8] }])), /ends in the middle of fur at its start/);
});

test("a typed line (no span) lines its run of the edge and takes a join; a marking's copy of its part's line is held once", () => {
  // Half the ring lit, the other half drawn by a typed line (line.ts's ribbons, as the nose's edge on head.line): its
  // shape reports the run (ShapeMeta.outlined), so the edge is lined all round and the lit span's joins meet it.
  const half: Partial<SpanMeta> = { from: 0, to: 0.5, ends: ["join", "join"], taper: [0, 0] };
  const withTyped = (d: Drawing, runs: [number, number][]): Drawing => ({ ...d, meta: { ...d.meta!, shapes: d.meta!.shapes.map((m) => ({ ...m, outlined: [[0, 0.5], ...runs] })) } });
  assert.match(gateOf(withTyped(spanned(ring, [half]), [])), /shows \d+\.\d\d pt below full line width/, "half the ring bare");
  assert.match(gateOf(withTyped(spanned(ring, [half]), [])), /joins no line at its start/);
  assert.equal(gateOf(withTyped(spanned(ring, [half]), [[0.5, 1]])), "", "the typed line lines the rest and meets both joins");
  // A marking drawn over the ring carries the ring's line again inside its own soft edge (the dog's litMarking): the
  // same span on the same shape, one line, not a second span on its fur edge.
  const furred = furSpan(ring, ringPts[Math.round(ringPts.length * 0.1)]!, ringPts[Math.round(ringPts.length * 0.3)]!);
  const ringed = spanned(furred, [whole]);
  const marking: Drawing = { ...drawing(part("over", smooth(round.map(([x, y]): Node => [x * 0.5, y * 0.5])), { fill: "#FFF4E8" }), "over/front"), meta: { shapes: [], lines: ringed.meta!.lines } };
  assert.equal(gateOf(ringed, marking), "", "a marking's copy of its part's line is not a second span");
});

test("in a mirrored facing the gate finds each span's shape through the mirror and holds it as in the facing it was typed in", () => {
  // A right-facing view's piece is its left-facing piece mirrored about x = 0, its spans as they were (the dog's views/facing.ts).
  const furred = furSpan(ring, ringPts[Math.round(ringPts.length * 0.1)]!, ringPts[Math.round(ringPts.length * 0.3)]!);
  const [a, b] = part("ring", furred, { fill: "#FFF4E8" }).meta.shapes[0]!.fur[0]!;
  const two: Partial<SpanMeta>[] = [{ from: a - 0.05, to: (a + b) / 2, ends: ["join", "join"], taper: [0, 0] }, { from: (a + b) / 2, to: a - 0.05, ends: ["join", "join"], taper: [0, 0] }];
  const mirror = (d: Drawing): Drawing => ({ ...d, meta: { ...d.meta!, shapes: d.meta!.shapes.map((s) => ({ ...s, segs: s.segs.map((seg) => seg.map(([x, y]) => [-x, y]) as typeof seg) })) } });
  assert.match(gateOf(mirror(spanned(furred, two))), /is drawn as 2 spans/);
  assert.equal(gateOf(mirror(spanned(furred, [whole]))), "");
});

test("the gate reads a DECISIONS.md: every entry, and each one a later entry replaces, in whole or in part", () => {
  const md = [
    "## Outline",
    "**74. One outer line for every view.** Each span tapers to nothing at both ends.",
    "**79. The line's tones** (replaces 74's tones and widths).",
    "**85. Small locks.**",
    "## The fur pass",
    "**210. One line per visible edge; this replaces 74's \"every span tapers\".** At 0.8 pt, as 79 says.",
    "**213. Fur locks; this replaces 72's and 85's small locks, which were shrunk after reviewers read the broken line (210's cause) as lace.**",
    "**214. The head's fur; this replaces 7's \"no line between\", and 33's handoff.** It keeps 89's rule.",
  ].join("\n");
  const d = decisionsOf(md);
  assert.deepEqual(d.entries, [74, 79, 85, 210, 213, 214]);
  // Each entry that replaces one is named; an aside in brackets and a mention outside a "replaces" clause replace nothing.
  assert.deepEqual(d.replaced, { 74: [79, 210], 72: [213], 85: [213], 7: [214], 33: [214] });
});
