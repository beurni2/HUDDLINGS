// Tests for painting a part, rendered with resvg as the build renders it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Resvg } from "@resvg/resvg-js";
import { PNG } from "pngjs";
import { pathD, smooth, type Node } from "../geom.ts";
import { LIGHT, darken, marking, mix, part, ratio } from "../paint.ts";
import type { Piece } from "../svg.ts";

const FUR = "#FFF4E8", FUR_SHADE = "#FDE3C8", TAN = "#D9A379";
const disc = smooth(Array.from({ length: 12 }, (_, i): Node => [20 * Math.cos((i / 12) * 2 * Math.PI), 20 * Math.sin((i / 12) * 2 * Math.PI)]));
const everywhere = "M-40 -40 H40 V40 H-40Z";

/** A piece rendered at 3 px a point on a 60 pt canvas centred on 0, 0. */
function render(...pieces: Piece[]) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" viewBox="-30 -30 60 60">${pieces.map((p) => p.svg).join("")}</svg>`;
  const png = PNG.sync.read(new Resvg(svg, { fitTo: { mode: "zoom", value: 3 } }).render().asPng());
  const at = (x: number, y: number) => {
    const i = (Math.floor((y + 30) * 3) * png.width + Math.floor((x + 30) * 3)) * 4;
    return Array.from(png.data.subarray(i, i + 4));
  };
  const hex = (x: number, y: number) => "#" + at(x, y).slice(0, 3).map((c) => c.toString(16).padStart(2, "0")).join("").toUpperCase();
  return { png, at, hex };
}

test("the derived colours follow their rules", () => {
  assert.equal(ratio(FUR, FUR_SHADE), "#FDEDDC");
  assert.equal(mix("#000000", "#FFFFFF", 0.5), "#808080");
  assert.equal(darken("#FFFFFF", 0.1), "#E6E6E6");
});

test("a full shade turns cream into the sheet's #FDE3C8, and a tan marking under the same shade into about #D79768", () => {
  const shade = { multiply: ratio(FUR, FUR_SHADE), shapes: [everywhere], blur: 1.5 };
  assert.equal(render(part("fur", disc, { fill: FUR, shade })).hex(0, 0), FUR_SHADE);
  const tan = render(marking("patch", { shape: disc, paint: { fill: FUR, shade } }, disc, { fill: TAN, blur: 1.5, clip: true })).hex(0, 0);
  assert.equal(tan, "#D79768");
});

test("the silhouette is exactly the path: shade, highlight and outline stay inside it", () => {
  const plain = render({ svg: `<path d="${pathD(disc.segs)}" fill="${FUR}"/>`, box: [-20, -20, 40, 40], meta: { shapes: [], lines: [] } });
  const painted = render(part("painted", disc, {
    fill: FUR,
    shade: { multiply: ratio(FUR, FUR_SHADE), rim: { inset: 2.5, toLight: 4 }, blur: 2.4 },
    highlight: { colour: "#FFFFFF", opacity: 0.8, blur: 2, auto: { inset: 3, toLight: 5 } },
    outline: { colour: "#91694A", width: 1.54, blur: 0.3 },
  }));
  for (let i = 3; i < plain.png.data.length; i += 4) assert.equal(painted.png.data[i], plain.png.data[i], `alpha differs at pixel ${(i - 3) / 4}`);
});

test("the shade falls away from the light and the highlight toward it; a mirrored facing passes its own light", () => {
  const paint = (light: [number, number]) => part("lit", disc, {
    fill: FUR,
    light,
    shade: { multiply: ratio(FUR, FUR_SHADE), rim: { inset: 2.5, toLight: 4 }, blur: 2.4 },
    highlight: { colour: "#FFFFFF", opacity: 1, blur: 2, auto: { inset: 3, toLight: 5 } },
  });
  const sum = (c: number[]) => c[0]! + c[1]! + c[2]!;
  const left = render(paint(LIGHT));
  // 16 pt out from the centre, toward the light and away from it.
  assert.ok(sum(left.at(-11, -11)) > sum(left.at(11, 11)), "lit at the top left, shaded at the bottom right");
  const right = render(paint([-LIGHT[0], LIGHT[1]]));
  assert.ok(sum(right.at(11, -11)) > sum(right.at(-11, 11)), "a light from the top right shades the bottom left");
});
