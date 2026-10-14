// Tests for the drawing lint: every rule fails on a planted fault and passes a clean drawing.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Drawing } from "../../build/atlas.ts";
import { furSpan } from "../fur.ts";
import { smooth, type Node } from "../geom.ts";
import { lintDrawing } from "../lint.ts";
import { part } from "../paint.ts";
import { blur, mask, type Piece } from "../svg.ts";

const PALETTE = ["#FFF4E8", "#91694A", "#FDEDDC", "#FFFFFF"];
const round: Node[] = Array.from({ length: 10 }, (_, i): Node => [20 * Math.cos((i / 10) * 2 * Math.PI), 20 * Math.sin((i / 10) * 2 * Math.PI)]);

/** A piece on a whole-point canvas, as frame.ts makes one. */
function drawing(p: Piece, region = "part/front", size = 60): Drawing {
  const h = size / 2;
  return { region, anchor: [h, h], meta: p.meta, svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${-h} ${-h} ${size} ${size}">${p.svg}</svg>` };
}
const raw = (body: string, size = "60") => ({ region: "raw/front", anchor: [0, 0] as [number, number], svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="60" viewBox="-30 -30 ${size} 60">${body}</svg>` });
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

test("a filter or mask without an explicit, bounded sRGB region fails, and so does a rect far past the canvas", () => {
  assert.match(lintOf(raw(`<filter id="f"><feGaussianBlur stdDeviation="2"/></filter>`)).join("\n"), /filter f needs an explicit userSpaceOnUse region/);
  assert.match(lintOf(raw(`<filter id="f" filterUnits="userSpaceOnUse" x="-30" y="-30" width="60" height="60"><feGaussianBlur stdDeviation="2"/></filter>`)).join("\n"), /sRGB/);
  assert.match(lintOf(raw(`<filter id="f" filterUnits="userSpaceOnUse" x="-500" y="-500" width="1000" height="1000" color-interpolation-filters="sRGB"/>`)).join("\n"), /bounded/);
  assert.deepEqual(lintOf(raw(blur("f", [-30, -30, 60, 60], 2))), []);
  assert.match(lintOf(raw(`<mask id="m"><rect x="-30" y="-30" width="60" height="60" fill="#FFFFFF"/></mask>`)).join("\n"), /mask m needs an explicit userSpaceOnUse region/);
  // The shape of the SVG that aborts resvg 2.6.2: a huge rect under a filtered mask.
  assert.match(lintOf(raw(`<rect x="-500" y="-500" width="1000" height="1000" fill="#FDEDDC"/>`)).join("\n"), /rect reaches far past the canvas/);
});

test("a canvas that is not whole points fails", () => {
  assert.match(lintOf(raw("", "60.5")).join("\n"), /not whole points/);
});

test("an <image> element or a data: URI fails (rule R8)", () => {
  assert.match(lintOf(raw(`<image href="x"/>`)).join("\n"), /<image>/);
  assert.match(lintOf(raw(`<rect x="0" y="0" width="1" height="1" fill="url(data:image/png;base64,AAAA)"/>`)).join("\n"), /data: URI/);
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
