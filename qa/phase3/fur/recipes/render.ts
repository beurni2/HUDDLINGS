// The demo's pictures: a view's rest drawings composited as the rest-frame tests composite them (each part rendered by
// resvg in model space, in the rig's draw order, clip groups by the runtimes' stencil rule, at each part's rest alpha),
// and sheets of panels laying the sheet's crop, today's drawing and the recipe's side by side at one scale.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { PNG } from "pngjs";
import type { Rig } from "../../../../runtime-web/src/format.ts";
import type { Piece } from "../../../../characters/draw/svg.ts";
import { BOX, composite, resvgLayers } from "../../../../characters/draw/test/composite.ts";
import { repo } from "./scratch.ts";

export interface Drawn {
  part: string;
  state?: string;
  piece: Piece;
}

const rig = JSON.parse(readFileSync(join(repo, "characters/dog/src/rig.json"), "utf8")) as Rig;
const model = JSON.parse(readFileSync(join(repo, "characters/dog/model.json"), "utf8")) as {
  crops: Record<string, { crop: string; ptPerCropPx: number; anchorsCropPx: { ground: [number, number] } }>;
};

/** An image: straight RGBA, opaque over white. */
export interface Image {
  w: number;
  h: number;
  data: Buffer;
}

/** The view's rest drawings composited on white over the model-space canvas (BOX) at `scale` px/pt. */
export function rest(view: string, drawn: Drawn[], scale: number): Image {
  const pieces = new Map(drawn.map((d) => [d.part, d.piece]));
  const order = rig.drawOrder[view]!.flatMap((p) => (p === "@head" ? rig.drawOrder[`head.${view}`]! : [p])).filter((p) => pieces.has(p));
  const part = (name: string) => rig.parts.find((p) => p.name === name);
  const w = BOX.w * scale, h = BOX.h * scale;
  const c = composite(resvgLayers(order, pieces, (n) => part(n)?.clipTo, scale, (n) => part(n)?.alpha), w, h);
  const data = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const a = c[i * 4 + 3]!;
    for (let k = 0; k < 3; k++) data[i * 4 + k] = Math.round(255 * Math.min(1, c[i * 4 + k]! + (1 - a)));
    data[i * 4 + 3] = 255;
  }
  return { w, h, data };
}

/** A box of an image, in its pixels, as a PNG. */
function cut(img: Image, x: number, y: number, w: number, h: number): Buffer {
  const png = new PNG({ width: w, height: h });
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const sx = Math.min(img.w - 1, Math.max(0, x + i)), sy = Math.min(img.h - 1, Math.max(0, y + j));
      img.data.copy(png.data, (j * w + i) * 4, (sy * img.w + sx) * 4, (sy * img.w + sx) * 4 + 4);
    }
  }
  return PNG.sync.write(png);
}

function readPng(path: string): Image {
  const png = PNG.sync.read(readFileSync(path));
  // Flatten onto white.
  const data = Buffer.alloc(png.width * png.height * 4);
  for (let i = 0; i < png.width * png.height; i++) {
    const a = png.data[i * 4 + 3]! / 255;
    for (let k = 0; k < 3; k++) data[i * 4 + k] = Math.round(png.data[i * 4 + k]! * a + 255 * (1 - a));
    data[i * 4 + 3] = 255;
  }
  return { w: png.width, h: png.height, data };
}

/** A region of the dog, in model points: [x, y, width, height], whole points. */
export type Box = [number, number, number, number];

/** The SVG of one panel: an image's region scaled to `zoom` px/pt, at (x, y) in the sheet, with its frame. */
function panel(png: Buffer, pw: number, ph: number, view: [number, number, number, number], x: number, y: number, w: number, h: number): string {
  return `<svg x="${x}" y="${y}" width="${w}" height="${h}" viewBox="${view.join(" ")}" preserveAspectRatio="none">` +
    `<image width="${pw}" height="${ph}" href="data:image/png;base64,${png.toString("base64")}" preserveAspectRatio="none"/></svg>` +
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="#C8C0B8" stroke-width="1"/>`;
}

/** The sheet's crop of a region, as an image cut to whole crop pixels and the region's place in them. */
function sheetRegion(view: string, box: Box): { png: Buffer; pw: number; ph: number; vb: [number, number, number, number] } {
  const crop = model.crops[view === "side.R" || view === "threeQuarter.R" ? view.replace(".R", ".L") : view]!;
  const img = readPng(join(repo, "characters/dog/ref/panels/master", `${crop.crop}.png`));
  const k = 1 / crop.ptPerCropPx, [gx, gy] = crop.anchorsCropPx.ground;
  // The root lies on the crop's ground anchor, at the middle of its pixel (the sheet match's alignment).
  const x0 = gx + 0.5 + box[0] * k, y0 = gy + 0.5 + box[1] * k, x1 = x0 + box[2] * k, y1 = y0 + box[3] * k;
  const ix = Math.floor(x0), iy = Math.floor(y0), iw = Math.ceil(x1) - ix, ih = Math.ceil(y1) - iy;
  return { png: cut(img, ix, iy, iw, ih), pw: iw, ph: ih, vb: [x0 - ix, y0 - iy, x1 - x0, y1 - y0] };
}

export interface Row {
  /** What the row shows. */
  label: string;
  box: Box;
  /** Output pixels per point. */
  zoom: number;
  /** A feature panel the recipe is calibrated on, shown first at the row's height (its name in ref/panels/master). */
  panel?: string;
}

/** One sheet of rows: each the sheet's crop, today's drawing and the recipe's, side by side, with the row's label. */
export function sheet(title: string, rows: { view: string; before: Image; after: Image; scale: number; row: Row }[], out: string): void {
  const GAP = 12, HEAD = 50, LABEL = 22;
  let y = HEAD, width = 0, body = "";
  // The title on two lines, so a narrow sheet keeps it: the group and its option, then what it does.
  const [head, ...rest] = title.split(": ");
  for (const { view, before, after, scale, row } of rows) {
    const [bx, by, bw, bh] = row.box, w = Math.round(bw * row.zoom), h = Math.round(bh * row.zoom);
    body += `<text x="${GAP}" y="${y + 16}" font-family="Inter, DejaVu Sans" font-size="15" fill="#3A2A20">${row.label}</text>`;
    y += LABEL;
    const s = sheetRegion(view, row.box);
    const px = (x: number) => Math.round((x - BOX.x) * scale), py = (v: number) => Math.round((v - BOX.y) * scale);
    const own = (img: Image) => cut(img, px(bx), py(by), Math.round(bw * scale), Math.round(bh * scale));
    // A feature panel first, square at the row's height, when the row names one.
    let x = GAP;
    if (row.panel) {
      const img = readPng(join(repo, "characters/dog/ref/panels/master", `${row.panel}.png`));
      body += panel(cut(img, 0, 0, img.w, img.h), img.w, img.h, [0, 0, img.w, img.h], x, y, h, h);
      body += `<text x="${x + 6}" y="${y + h - 8}" font-family="Inter, DejaVu Sans" font-size="13" fill="#7A6A5E">${row.panel.replace("master.", "")}</text>`;
      x += h + GAP;
    }
    const sw = Math.round(bw * scale), sh = Math.round(bh * scale);
    for (const [name, png, pw, ph, vb] of [["sheet", s.png, s.pw, s.ph, s.vb], ["today", own(before), sw, sh, [0, 0, sw, sh]], ["recipe", own(after), sw, sh, [0, 0, sw, sh]]] as const) {
      body += panel(png, pw, ph, vb as [number, number, number, number], x, y, w, h);
      body += `<text x="${x + 6}" y="${y + h - 8}" font-family="Inter, DejaVu Sans" font-size="13" fill="#7A6A5E">${name}</text>`;
      x += w + GAP;
    }
    y += h + GAP;
    width = Math.max(width, x);
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${y}" viewBox="0 0 ${width} ${y}"><rect width="${width}" height="${y}" fill="#FFFFFF"/>` +
    `<text x="${GAP}" y="20" font-family="Inter, DejaVu Sans" font-size="17" font-weight="600" fill="#3A2A20">${head}</text>` +
    `<text x="${GAP}" y="40" font-family="Inter, DejaVu Sans" font-size="14" fill="#3A2A20">${rest.join(": ")}</text>${body}</svg>`;
  const png = new Resvg(svg, { font: { loadSystemFonts: true, defaultFontFamily: "DejaVu Sans" } }).render().asPng();
  // Small enough for the PR on a phone: quantised by pngjs as 8-bit RGB.
  const decoded = PNG.sync.read(png);
  const rgb = new PNG({ width: decoded.width, height: decoded.height, colorType: 2 });
  decoded.data.copy(rgb.data);
  writeFileSync(out, PNG.sync.write(rgb, { colorType: 2 }));
}
