// The side view's joins (the fur pass's side lane, DECISIONS 235 to 241, its second round, 276 to 279, and its third,
// 298 to 301): one row per join this round's blocking items and minors name (and, with --audit, per join the audit
// named), each the sheet's crop, the drawing at this round's base (46011a2, the "before") and the drawing now, side by
// side at one zoom, labelled; then the head and the whole dog at phone size. For side.R the crop is the side crop
// mirrored (DECISIONS 2). The base's drawing is drawn from the base's own source tree (characters/ and the runtime's
// sources at 46011a2, read from git into a scratch folder, removed after), so "before" is the base as it was drawn
// there, whatever this branch or its shared recipes change.
//
// node qa/phase3/fur/side/joins.ts [side.L|side.R ...] [--only <word>,...] [--audit] [--out <folder>]
//   (writes joins.png and joins.R.png here, or into --out; --only keeps the rows whose label holds one of the words)
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { Resvg } from "@resvg/resvg-js";
import { PNG } from "pngjs";
import { BOX } from "../../../../characters/draw/test/composite.ts";
import { rest, type Drawn, type Image } from "../recipes/render.ts";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../../../..");
const BASE = "46011a2";
/** What the base's drawing is drawn from: the dog's source, its model and decisions, the drawing kit and the runtime's sources. */
const TREE = ["characters/dog/src", "characters/dog/model.json", "characters/dog/DECISIONS.md", "characters/draw", "characters/build", "runtime-web/src"];
/** The composites' scale, px/pt: every row is drawn down from it. */
const SCALE = 8;

/** The base's side view, drawn from the base's own source tree in a scratch folder (removed once it is drawn). */
function baseSide(): { side: Promise<(f: "L" | "R") => Drawn[]>; done: () => void } {
  const root = mkdtempSync(join(tmpdir(), "side-joins-"));
  const tar = execFileSync("git", ["archive", BASE, ...TREE], { cwd: repo, maxBuffer: 1 << 28 });
  execFileSync("tar", ["-x", "-C", root], { input: tar });
  symlinkSync(join(repo, "node_modules"), join(root, "node_modules"));
  const side = import(pathToFileURL(join(root, "characters/dog/src/views/side.ts")).href).then((m: { side: (f: "L" | "R") => Drawn[] }) => m.side);
  return { side, done: () => rmSync(root, { recursive: true, force: true }) };
}

/** A region of the dog, in model points: [x, y, width, height] (in side.L's frame; mirrored for side.R). */
type Box = [number, number, number, number];
interface Row {
  label: string;
  box: Box;
  zoom: number;
}

/** The joins the audit names in profile (qa/phase3/audit/defects.json, side #1 to #19), each at about 3 to 4 times the crop's own scale (with --audit). */
const AUDIT: Row[] = [
  { label: "crown: the forehead's locks and the topknot (#1, #8)", box: [-98, -168, 108, 34], zoom: 4 },
  { label: "the back of the head into the ear's top, the patch at the ear's root (#2, #3)", box: [-50, -160, 72, 46], zoom: 4 },
  { label: "the ear's outer edge and hem over the collar and the back (#4, #5)", box: [-42, -146, 68, 88], zoom: 3.4 },
  { label: "chest, the collar's front and the tag (#7)", box: [-80, -68, 34, 40], zoom: 5 },
  { label: "the front legs: the near leg's top, back and elbow, the far leg (#10, #11, #14)", box: [-80, -48, 56, 30], zoom: 5 },
  { label: "the tail's plume and its tan root (#15, #16)", box: [6, -66, 46, 62], zoom: 3.6 },
  { label: "the ground shadow (#19)", box: [-104, -16, 156, 18], zoom: 2 },
];
/** This round's joins (DECISIONS 298 to 301): the five blocking items, then the minors, closer. */
const ROWS: Row[] = [
  { label: "1. the line's life: thin under the ear's hem, fuller down the rump and round the haunch", box: [-26, -70, 52, 72], zoom: 4 },
  { label: "1. the rump over the tail, the haunch's underside and the tail-foot knot", box: [-2, -40, 26, 40], zoom: 7 },
  { label: "2. the plume: its line and tucks as light as the crop's, no second line", box: [8, -66, 42, 60], zoom: 7 },
  { label: "3. the chin over the collar: hair-fine flicks, the warm band, no cut", box: [-98, -84, 72, 28], zoom: 6 },
  { label: "4. the topknot: flicked locks, continuous joins", box: [-72, -168, 72, 24], zoom: 7 },
  { label: "5. the far paw: no claw", box: [-80, -24, 28, 24], zoom: 9 },
  { label: "minor: the near and hind paws' toe lines", box: [-68, -16, 58, 16], zoom: 7 },
  { label: "minor: the thigh's thin line", box: [-36, -36, 26, 36], zoom: 7 },
];
const PHONE: Row = { label: "the whole dog at phone size (3 px/pt)", box: [-100, -170, 150, 176], zoom: 3 };
const PHONE_HEAD: Row = { label: "the head and the chin at phone size (3 px/pt)", box: [-100, -170, 124, 116], zoom: 3 };

const model = JSON.parse(readFileSync(join(repo, "characters/dog/model.json"), "utf8")) as {
  crops: Record<string, { crop: string; ptPerCropPx: number; anchorsCropPx: { ground: [number, number] } }>;
};

function readPng(path: string): Image {
  const png = PNG.sync.read(readFileSync(path));
  const data = Buffer.alloc(png.width * png.height * 4);
  for (let i = 0; i < png.width * png.height; i++) {
    const a = png.data[i * 4 + 3]! / 255;
    for (let k = 0; k < 3; k++) data[i * 4 + k] = Math.round(png.data[i * 4 + k]! * a + 255 * (1 - a));
    data[i * 4 + 3] = 255;
  }
  return { w: png.width, h: png.height, data };
}
const flip = (img: Image): Image => {
  const data = Buffer.alloc(img.data.length);
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) img.data.copy(data, (y * img.w + x) * 4, (y * img.w + (img.w - 1 - x)) * 4, (y * img.w + (img.w - 1 - x)) * 4 + 4);
  return { ...img, data };
};
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

/** The crop's region at the root's place (the sheet match's alignment), mirrored for side.R. */
function sheetRegion(view: string, box: Box): { png: Buffer; pw: number; ph: number; vb: [number, number, number, number] } {
  const crop = model.crops["side.L"]!;
  let img = readPng(join(repo, "characters/dog/ref/panels/master", `${crop.crop}.png`));
  let [gx, gy] = crop.anchorsCropPx.ground;
  if (view === "side.R") (img = flip(img)), (gx = img.w - 1 - gx);
  const k = 1 / crop.ptPerCropPx;
  const x0 = gx + 0.5 + box[0] * k, y0 = gy + 0.5 + box[1] * k, x1 = x0 + box[2] * k, y1 = y0 + box[3] * k;
  const ix = Math.floor(x0), iy = Math.floor(y0), iw = Math.ceil(x1) - ix, ih = Math.ceil(y1) - iy;
  return { png: cut(img, ix, iy, iw, ih), pw: iw, ph: ih, vb: [x0 - ix, y0 - iy, x1 - x0, y1 - y0] };
}

function panel(png: Buffer, pw: number, ph: number, view: [number, number, number, number], x: number, y: number, w: number, h: number): string {
  return `<svg x="${x}" y="${y}" width="${w}" height="${h}" viewBox="${view.join(" ")}" preserveAspectRatio="none">` +
    `<image width="${pw}" height="${ph}" href="data:image/png;base64,${png.toString("base64")}" preserveAspectRatio="none"/></svg>` +
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="#C8C0B8" stroke-width="1"/>`;
}

function sheet(view: string, before: Image, after: Image, out: string, rows: Row[]): void {
  const GAP = 10, LABEL = 20, TOP = 46;
  let y = TOP, width = 0, body = "";
  for (const row of rows) {
    const box: Box = view === "side.R" ? [-(row.box[0] + row.box[2]), row.box[1], row.box[2], row.box[3]] : row.box;
    const [bx, by, bw, bh] = box, w = Math.round(bw * row.zoom), h = Math.round(bh * row.zoom);
    body += `<text x="${GAP}" y="${y + 15}" font-family="DejaVu Sans" font-size="14" fill="#3A2A20">${row.label}${row === PHONE || row === PHONE_HEAD ? "" : ` · ${row.zoom} px/pt`}</text>`;
    y += LABEL;
    const s = sheetRegion(view, box);
    const px = (x: number) => Math.round((x - BOX.x) * SCALE), py = (v: number) => Math.round((v - BOX.y) * SCALE);
    const sw = Math.round(bw * SCALE), sh = Math.round(bh * SCALE);
    const own = (img: Image) => cut(img, px(bx), py(by), sw, sh);
    let x = GAP;
    for (const [name, png, pw, ph, vb] of [["sheet", s.png, s.pw, s.ph, s.vb], [`before (${BASE})`, own(before), sw, sh, [0, 0, sw, sh]], ["now", own(after), sw, sh, [0, 0, sw, sh]]] as const) {
      body += panel(png, pw, ph, vb as [number, number, number, number], x, y, w, h);
      body += `<text x="${x + 5}" y="${y + h - 6}" font-family="DejaVu Sans" font-size="12" fill="#7A6A5E">${name}</text>`;
      x += w + GAP;
    }
    y += h + GAP;
    width = Math.max(width, x);
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${y}" viewBox="0 0 ${width} ${y}"><rect width="${width}" height="${y}" fill="#FFFFFF"/>` +
    `<text x="${GAP}" y="20" font-family="DejaVu Sans" font-size="16" font-weight="600" fill="#3A2A20">${view}: the fur pass's joins, the sheet | before (${BASE}) | now</text>` +
    `<text x="${GAP}" y="38" font-family="DejaVu Sans" font-size="13" fill="#3A2A20">the fur pass's third round in profile (DECISIONS 298 to 301); with --audit, the audit's rows (235 to 241, 276 to 279)</text>${body}</svg>`;
  const png = PNG.sync.read(new Resvg(svg, { font: { loadSystemFonts: true, defaultFontFamily: "DejaVu Sans" } }).render().asPng());
  const rgb = new PNG({ width: png.width, height: png.height, colorType: 2 });
  png.data.copy(rgb.data);
  writeFileSync(out, PNG.sync.write(rgb, { colorType: 2 }));
}

const { values: opts, positionals } = parseArgs({ allowPositionals: true, options: { only: { type: "string" }, out: { type: "string" }, audit: { type: "boolean" } } });
const views = positionals.length ? positionals : ["side.L", "side.R"];
const words = opts.only?.split(",").filter(Boolean);
const rows = [...ROWS, ...(opts.audit ? AUDIT : []), PHONE_HEAD, PHONE].filter((r) => !words || words.some((w) => r.label.includes(w)));
const base = baseSide();
try {
  const before = await base.side;
  const { side } = (await import("../../../../characters/dog/src/views/side.ts")) as { side: (f: "L" | "R") => Drawn[] };
  for (const view of views) {
    const f = view === "side.R" ? "R" : "L";
    const out = join(opts.out ? resolve(opts.out) : here, view === "side.R" ? "joins.R.png" : "joins.png");
    sheet(view, rest(view, before(f), SCALE), rest(view, side(f), SCALE), out, rows);
    console.log(out);
  }
} finally {
  base.done();
}
