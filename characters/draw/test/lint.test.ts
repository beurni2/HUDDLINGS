// Tests for the drawing lint: every rule fails on a planted fault and passes a clean drawing.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Drawing } from "../../build/atlas.ts";
import { rasterizeAll } from "../../build/raster.ts";
import { furSpan } from "../fur.ts";
import { smooth, type Node } from "../geom.ts";
import { lintDrawing, reach } from "../lint.ts";
import { part } from "../paint.ts";
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
  };
  for (const [name, d] of Object.entries(cases)) {
    const refused = lintOf(d).length > 0;
    const aborts = await rasterizeAll([d], [3]).then(() => false, (e: Error) => /SIGABRT|exit 134/.test(e.message));
    assert.equal(refused, aborts, `${name}: the lint ${refused ? "refuses" : "passes"} it, and resvg ${aborts ? "aborts" : "draws it"}`);
  }
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
