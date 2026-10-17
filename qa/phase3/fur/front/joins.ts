// The front's joins sheet for the fur pass (docs/phase3-fur-plan.md, the front lane; DECISIONS 220 to 227, 267 to 271):
// one row per join the audit names (qa/phase3/audit/defects.json, view "front"), each the sheet's crop | the base (8912ced,
// before the fur kit's second round) | today's drawing, at one scale and 3 to 4 times the phone's 3 px/pt, labelled, a
// row that names a box on master.hero.main showing the hero's crop of the same place first; and the face states drawn
// on the same parts (the raised ears and their temples, huffy's puffed head), before and after, each raised ear beside
// its own panel (One ear perked levelled and scaled by its brows, DECISIONS 133; Lifted slightly by its record's scale
// with its head's top on the model's, 146), the rest beside the turnaround crop. Each region is composited as the
// rest-frame tests composite a view (characters/draw/test/composite.ts), from the drawings themselves.
//
// node qa/phase3/fur/front/joins.ts [--out <folder>]   → <folder>/joins.png and <folder>/states.png (qa/phase3/fur/front/ by default)
// node qa/phase3/fur/front/joins.ts --only <text> --out <folder>   → <folder>/peek.png: the rows (joins and states) whose label holds the text, for a quick look
// The committed joins.png and states.png are its output reduced to 256 colours (PIL's median cut, no dither), 1 MB
// and 0.5 MB instead of 3.4 and 1.3, so they open quickly on a phone.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { Resvg } from "@resvg/resvg-js";
import { PNG } from "pngjs";
import type { Rig } from "../../../../runtime-web/src/format.ts";
import { scopeIds, type Piece } from "../../../../characters/draw/svg.ts";
import { composite } from "../../../../characters/draw/test/composite.ts";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../../../..");
const BASE = "8912ced";
const { values: args } = parseArgs({ options: { out: { type: "string" }, only: { type: "string" } } });
const out = resolve(args.out ?? here);

interface Drawn {
  part: string;
  state?: string;
  piece: Piece;
}
interface FrontModule {
  front(): Drawn[];
  faceStates(): Drawn[];
  reviewStates(): Drawn[];
}
type Box = [number, number, number, number];

/** The front view as the base drew it: its source at fbbe6d3, its relative imports pointing at today's files (the recipes draw a view unchanged until it opts in, DECISIONS 210 to 219). */
async function baseFront(): Promise<FrontModule> {
  const file = join(repo, "characters/dog/src/views/front.ts");
  const src = execFileSync("git", ["show", `${BASE}:characters/dog/src/views/front.ts`], { cwd: repo, encoding: "utf8" })
    .replace(/from "(\.\.?\/[^"]+)"/g, (_m, spec: string) => `from "${pathToFileURL(resolve(dirname(file), spec)).href}"`);
  const path = join(mkdtempSync(join(tmpdir(), "front-base-")), "front.ts");
  writeFileSync(path, src);
  return (await import(pathToFileURL(path).href)) as FrontModule;
}

const rig = JSON.parse(readFileSync(join(repo, "characters/dog/src/rig.json"), "utf8")) as Rig;
const model = JSON.parse(readFileSync(join(repo, "characters/dog/model.json"), "utf8")) as {
  crops: Record<string, { crop: string; ptPerCropPx: number; anchorsCropPx: { ground: [number, number] } }>;
};

/** The pieces of the front's composite: the rest drawings, each part replaced by the state's drawing where `states` names one, in the rig's draw order. */
function layersOf(drawn: Drawn[], states: Record<string, string>): { order: string[]; pieces: Map<string, Piece> } {
  const pieces = new Map<string, Piece>();
  for (const d of drawn) if (!d.state && !pieces.has(d.part)) pieces.set(d.part, d.piece);
  // A part's rest drawing is its default state's where it has no plain one (the eyes' "open", the mouth's).
  for (const d of drawn) if (d.state && !pieces.has(d.part) && rig.parts.find((p) => p.name === d.part)?.regions["front"] === `${d.part}/front:${d.state}`) pieces.set(d.part, d.piece);
  for (const [part, state] of Object.entries(states)) {
    const s = drawn.find((d) => d.part === part && d.state === state);
    if (!s) throw new Error(`joins: no ${part}:${state} drawing`);
    pieces.set(part, s.piece);
  }
  return { order: rig.drawOrder["front"]!.flatMap((p) => (p === "@head" ? rig.drawOrder["head.front"]! : [p])).filter((p) => pieces.has(p)), pieces };
}

/**
 * A region of the front (model points) composited on white at `zoom` px/pt, as composite.ts composites a rest frame
 * (each part rendered by resvg, premultiplied over, a clipped part shown where its mask's alpha is 0.05 or more, each at
 * its rest alpha), rendered over the region only.
 */
const rendered = new Map<Piece, Map<number, { png: PNG; box: Box }>>();
/** A piece rendered once at `zoom` over its own canvas (whole points, so any whole-point region lies on its pixels at a whole zoom). */
function pieceAt(p: Piece, zoom: number): { png: PNG; box: Box } {
  let byZoom = rendered.get(p);
  if (!byZoom) rendered.set(p, (byZoom = new Map()));
  let r = byZoom.get(zoom);
  if (!r) {
    const [x, y, w, h] = p.box;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${x} ${y} ${w} ${h}">${scopeIds(p.svg, "p")}</svg>`;
    r = { png: PNG.sync.read(new Resvg(svg, { fitTo: { mode: "zoom", value: zoom }, background: "rgba(0,0,0,0)" }).render().asPng()), box: p.box as Box };
    byZoom.set(zoom, r);
  }
  return r;
}

function render(drawn: Drawn[], states: Record<string, string>, box: Box, zoom: number): Buffer {
  const { order, pieces } = layersOf(drawn, states);
  const part = (name: string) => rig.parts.find((p) => p.name === name);
  const w = Math.round(box[2] * zoom), h = Math.round(box[3] * zoom);
  const layers = order.map((name) => {
    const r = pieceAt(pieces.get(name)!, zoom);
    const dx = Math.round((box[0] - r.box[0]) * zoom), dy = Math.round((box[1] - r.box[1]) * zoom);
    const rgba = new Uint8Array(w * h * 4);
    for (let j = 0; j < h; j++) {
      const sy = j + dy;
      if (sy < 0 || sy >= r.png.height) continue;
      for (let i = 0; i < w; i++) {
        const sx = i + dx;
        if (sx < 0 || sx >= r.png.width) continue;
        const s = (sy * r.png.width + sx) * 4, t = (j * w + i) * 4;
        for (let k = 0; k < 4; k++) rgba[t + k] = r.png.data[s + k]!;
      }
    }
    const clipTo = part(name)?.clipTo, alpha = part(name)?.alpha;
    return { rgba, part: name, ...(clipTo ? { clipTo } : {}), ...(alpha !== undefined ? { alpha } : {}) };
  });
  const c = composite(layers, w, h);
  const png = new PNG({ width: w, height: h });
  for (let i = 0; i < w * h; i++) {
    const a = c[i * 4 + 3]!;
    for (let k = 0; k < 3; k++) png.data[i * 4 + k] = Math.round(255 * Math.min(1, c[i * 4 + k]! + (1 - a)));
    png.data[i * 4 + 3] = 255;
  }
  return PNG.sync.write(png);
}

interface Image {
  w: number;
  h: number;
  data: Buffer;
}

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
  const data = Buffer.alloc(png.width * png.height * 4);
  for (let i = 0; i < png.width * png.height; i++) {
    const a = png.data[i * 4 + 3]! / 255;
    for (let k = 0; k < 3; k++) data[i * 4 + k] = Math.round(png.data[i * 4 + k]! * a + 255 * (1 - a));
    data[i * 4 + 3] = 255;
  }
  return { w: png.width, h: png.height, data };
}

const crop = model.crops["front"]!;
const sheetImg = readPng(join(repo, "characters/dog/ref/panels/master", `${crop.crop}.png`));
const heroImg = readPng(join(repo, "characters/dog/ref/panels/master/master.hero.main.png"));
/** A box of the hero's pixels, cut to whole pixels. */
function heroRegion([x, y, w, h]: Box) {
  const ix = Math.floor(x), iy = Math.floor(y), iw = Math.ceil(x + w) - ix, ih = Math.ceil(y + h) - iy;
  return { png: cut(heroImg, ix, iy, iw, ih), pw: iw, ph: ih, vb: [x - ix, y - iy, w, h] as Box };
}

type Pt = [number, number];
/** A panel resampled (bilinear) over a model-space box at `zoom`, through the map from model points to its pixels. */
function panelRegion(img: Image, toPanel: (m: Pt) => Pt, box: Box, zoom: number) {
  const w = Math.round(box[2] * zoom), h = Math.round(box[3] * zoom), png = new PNG({ width: w, height: h });
  const at = (x: number, y: number, k: number) => img.data[(Math.min(img.h - 1, Math.max(0, y)) * img.w + Math.min(img.w - 1, Math.max(0, x))) * 4 + k]!;
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const [px, py] = toPanel([box[0] + (i + 0.5) / zoom, box[1] + (j + 0.5) / zoom]);
      const x0 = Math.floor(px - 0.5), y0 = Math.floor(py - 0.5), fx = px - 0.5 - x0, fy = py - 0.5 - y0;
      for (let k = 0; k < 4; k++) {
        png.data[(j * w + i) * 4 + k] = Math.round(at(x0, y0, k) * (1 - fx) * (1 - fy) + at(x0 + 1, y0, k) * fx * (1 - fy) + at(x0, y0 + 1, k) * (1 - fx) * fy + at(x0 + 1, y0 + 1, k) * fx * fy);
      }
    }
  }
  return { png: PNG.sync.write(png), pw: w, ph: h, vb: [0, 0, w, h] as Box };
}
const panels = join(repo, "characters/dog/ref/panels/expressions");
const lm = (model as unknown as { landmarks: Record<string, Record<string, Pt>> }).landmarks["front"]!;
const faceCrops = (model as unknown as { faceCrops: Record<string, { ptPerCropPx: number }> }).faceCrops;
/**
 * One ear perked, which has no face crop record, levelled and scaled by its brows onto the front's face frame, as
 * qa/phase3/faces/perked.py lays it (DECISIONS 133): its brows' middles at (49.5, 62) and (98.5, 55) px, the render's
 * 46 pt apart, 28.4 pt above the eyes' midpoint, rolled with the face.
 */
function perkedPanel() {
  const img = readPng(join(panels, "expressions.ears.one-ear-perked.png"));
  const bl: Pt = [49.5, 62], br: Pt = [98.5, 55], mid: Pt = [(bl[0] + br[0]) / 2, (bl[1] + br[1]) / 2];
  const a = -Math.atan2(br[1] - bl[1], br[0] - bl[0]), k = 46 / Math.hypot(br[0] - bl[0], br[1] - bl[1]);
  const el = lm["eye.L"]!, er = lm["eye.R"]!, fc: Pt = [(el[0] + er[0]) / 2, (el[1] + er[1]) / 2], roll = Math.atan2(el[1] - er[1], el[0] - er[0]);
  const t = roll + a, c = Math.cos(t) * k, sn = Math.sin(t) * k;
  // model = lin·panel + off, lin = k·rot(roll + a); off places the brows' middle 28.4 pt above the eyes' midpoint.
  const off: Pt = [fc[0] - Math.sin(roll) * -28.4 - (c * mid[0] - sn * mid[1]), fc[1] + Math.cos(roll) * -28.4 - (sn * mid[0] + c * mid[1])];
  const det = c * c + sn * sn;
  return { img, toPanel: ([x, y]: Pt): Pt => { const dx = x - off[0], dy = y - off[1]; return [(c * dx + sn * dy) / det, (-sn * dx + c * dy) / det]; } };
}
/** Lifted slightly at its record's scale (1.04 pt a pixel), its head's top (the tuft's highest point) on the model's, as qa/phase3/faces/lifted.py lays it (DECISIONS 146). */
function liftedPanel() {
  const img = readPng(join(panels, "expressions.ears.lifted-slightly.png"));
  const k = faceCrops["expressions.ears.lifted-slightly"]!.ptPerCropPx;
  // The tuft's highest point: the topmost row in the middle third with a pixel 12 off the card in any channel, the middle of its run.
  const card = [0, 1, 2].map((ch) => { const v: number[] = []; for (let x = 0; x < img.w; x++) v.push(img.data[x * 4 + ch]!, img.data[((img.h - 1) * img.w + x) * 4 + ch]!); v.sort((p, q) => p - q); return v[v.length >> 1]!; });
  let top: Pt = [img.w / 2, 0];
  find: for (let y = 0; y < img.h; y++) {
    const xs: number[] = [];
    for (let x = Math.floor(img.w / 3); x < Math.floor((2 * img.w) / 3); x++) if ([0, 1, 2].some((ch) => Math.abs(img.data[(y * img.w + x) * 4 + ch]! - card[ch]!) > 12)) xs.push(x);
    if (xs.length) { top = [xs.reduce((p, q) => p + q, 0) / xs.length, y + 0.5]; break find; }
  }
  const head = lm["head.top"]!;
  return { img, toPanel: ([x, y]: Pt): Pt => [top[0] + (x - head[0]) / k, top[1] + (y - head[1]) / k] };
}

/** The sheet's crop of a region of model space, cut to whole crop pixels, with the region's place in them (the root on the crop's ground anchor, as the sheet match aligns them). */
function sheetRegion(box: Box) {
  const k = 1 / crop.ptPerCropPx, [gx, gy] = crop.anchorsCropPx.ground;
  const x0 = gx + 0.5 + box[0] * k, y0 = gy + 0.5 + box[1] * k, x1 = x0 + box[2] * k, y1 = y0 + box[3] * k;
  const ix = Math.floor(x0), iy = Math.floor(y0), iw = Math.ceil(x1) - ix, ih = Math.ceil(y1) - iy;
  return { png: cut(sheetImg, ix, iy, iw, ih), pw: iw, ph: ih, vb: [x0 - ix, y0 - iy, x1 - x0, y1 - y0] as Box };
}

const panel = (png: Buffer, pw: number, ph: number, vb: Box, x: number, y: number, w: number, h: number) =>
  `<svg x="${x}" y="${y}" width="${w}" height="${h}" viewBox="${vb.join(" ")}" preserveAspectRatio="none">` +
  `<image width="${pw}" height="${ph}" href="data:image/png;base64,${png.toString("base64")}" preserveAspectRatio="none"/></svg>` +
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="#C8C0B8" stroke-width="1"/>`;

interface Row {
  label: string;
  box: Box;
  /** Output px per pt: 3 to 4 times the phone's 3. */
  zoom: number;
  /** The same place on master.hero.main, in its pixels (the hero is not placeable on the model, so it is boxed by hand). */
  hero?: Box;
}
interface Column {
  name: string;
  png: Buffer;
  pw: number;
  ph: number;
  vb: Box;
}

/** A sheet of rows, each its columns side by side at the row's zoom, labelled; written as 8-bit RGB, small enough to open on a phone. */
function write(title: string, rows: { row: Row; columns: Column[] }[], file: string) {
  const GAP = 10, HEAD = 34, LABEL = 20;
  let y = HEAD, width = 0, body = "";
  for (const { row, columns } of rows) {
    const w = Math.round(row.box[2] * row.zoom), h = Math.round(row.box[3] * row.zoom);
    body += `<text x="${GAP}" y="${y + 15}" font-family="DejaVu Sans" font-size="14" fill="#3A2A20">${row.label}</text>`;
    y += LABEL;
    let x = GAP;
    for (const c of columns) {
      body += panel(c.png, c.pw, c.ph, c.vb, x, y, w, h);
      body += `<rect x="${x + 3}" y="${y + h - 19}" width="${c.name.length * 7.4 + 8}" height="16" fill="#FFFFFF" opacity="0.8"/>` +
        `<text x="${x + 7}" y="${y + h - 7}" font-family="DejaVu Sans" font-size="12" fill="#5A4A3E">${c.name}</text>`;
      x += w + GAP;
    }
    y += h + GAP;
    width = Math.max(width, x);
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${y}" viewBox="0 0 ${width} ${y}"><rect width="${width}" height="${y}" fill="#FFFFFF"/>` +
    `<text x="${GAP}" y="22" font-family="DejaVu Sans" font-size="16" font-weight="bold" fill="#3A2A20">${title}</text>${body}</svg>`;
  const decoded = PNG.sync.read(new Resvg(svg, { font: { loadSystemFonts: true, defaultFontFamily: "DejaVu Sans" } }).render().asPng());
  const rgb = new PNG({ width: decoded.width, height: decoded.height, colorType: 2 });
  decoded.data.copy(rgb.data);
  writeFileSync(file, PNG.sync.write(rgb, { colorType: 2 }));
  console.log(`${file} (${decoded.width} × ${decoded.height})`);
}

/** Each join the audit names in front (defects.json #1 to #15), the dog's right side on the viewer's left. */
const JOINS: Row[] = [
  { label: "#1, #4 the crown over the dog's right ear's root (zoom 10)", box: [-58, -152, 32, 26], zoom: 10 },
  { label: "#1, #4 the crown over the dog's left ear's root (zoom 10)", box: [24, -158, 30, 26], zoom: 10 },
  { label: "#4 the topknot, whole, beside the hero's (zoom 8)", box: [-34, -168, 60, 22], zoom: 8, hero: [100, 0, 140, 51.3] },
  { label: "#4 the topknot and the crown, the dog's right half (zoom 10)", box: [-38, -168, 40, 24], zoom: 10 },
  { label: "#4 the topknot and the crown, the dog's left half (zoom 10)", box: [-2, -168, 40, 24], zoom: 10 },
  { label: "#6 the dog's right head patch: its hood, the cream strip and the root's tan (zoom 8)", box: [-52, -142, 36, 36], zoom: 8 },
  { label: "#6 the dog's left head patch: its hood, the cream strip and the root's tan (zoom 8)", box: [12, -144, 38, 36], zoom: 8 },
  { label: "#2 the dog's right cheek over its ear (zoom 10)", box: [-60, -108, 28, 46], zoom: 10 },
  { label: "#2 the dog's left cheek over its ear (zoom 10)", box: [32, -110, 28, 46], zoom: 10 },
  { label: "#3 the chin over the collar, whole, beside the hero's (zoom 8)", box: [-34, -80, 68, 26], zoom: 8, hero: [92, 168, 176, 67.3] },
  { label: "#3, #7 the chin over the collar, the dog's right half (zoom 10)", box: [-44, -76, 40, 22], zoom: 10 },
  { label: "#3, #7 the chin over the collar, the dog's left half (zoom 10)", box: [4, -78, 40, 22], zoom: 10 },
  { label: "#5 the dog's right ear: its outer edge and hem (zoom 10)", box: [-88, -120, 40, 60], zoom: 10 },
  { label: "#5 the dog's left ear: its outer edge and hem (zoom 10)", box: [48, -124, 40, 62], zoom: 10 },
  { label: "#8, #9 the chest under the dog's right collar end (zoom 10)", box: [-40, -66, 40, 30], zoom: 10 },
  { label: "#8, #9 the chest under the dog's left collar end (zoom 10)", box: [0, -66, 40, 30], zoom: 10 },
  { label: "#10 the chest's V and the legs' inner edges (zoom 10)", box: [-16, -42, 32, 42], zoom: 10 },
  { label: "#12, #13 the dog's right elbow, leg edge and haunch (zoom 10)", box: [-56, -56, 30, 46], zoom: 10 },
  { label: "#12, #13 the dog's left elbow, leg edge and haunch (zoom 10)", box: [26, -56, 30, 46], zoom: 10 },
  { label: "#11, #14 the paws, whole, beside the hero's (zoom 6)", box: [-52, -24, 104, 26], zoom: 6, hero: [70, 318, 225, 56.3] },
  { label: "#11, #14 the dog's right paws (zoom 10)", box: [-52, -24, 40, 26], zoom: 10 },
  { label: "#11, #14 the dog's left paws (zoom 10)", box: [12, -24, 40, 26], zoom: 10 },
  { label: "#15 the ground shadow (zoom 2)", box: [-82, -22, 164, 26], zoom: 2 },
];

/** The face states drawn on the fur pass's parts: each composite's parts and states, and the region shown. */
const STATES: { label: string; states: Record<string, string>; review?: boolean; box: Box; zoom: number; panel?: "perked" | "lifted" }[] = [
  { label: "rest (phone size, 3 px/pt)", states: {}, box: [-90, -180, 180, 76], zoom: 3 },
  { label: "the dog's left ear perked beside One ear perked: ear.L onePerked, temple.L up, head.line templeL (phone size, 3 px/pt)", states: { "ear.L": "onePerked", "temple.L": "up", "head.line": "templeL" }, box: [-90, -184, 180, 80], zoom: 3, panel: "perked" },
  { label: "the dog's left ear perked, the temple and the head's side (zoom 8)", states: { "ear.L": "onePerked", "temple.L": "up", "head.line": "templeL" }, box: [24, -150, 32, 44], zoom: 8, panel: "perked" },
  { label: "both ears lifted beside Lifted slightly: ears lifted, temples up, head.line temples (phone size, 3 px/pt)", states: { "ear.L": "lifted", "ear.R": "lifted", "temple.L": "up", "temple.R": "up", "head.line": "temples" }, box: [-90, -184, 180, 80], zoom: 3, panel: "lifted" },
  { label: "both ears lifted, the dog's right temple and the head's side (zoom 8)", states: { "ear.L": "lifted", "ear.R": "lifted", "temple.L": "up", "temple.R": "up", "head.line": "temples" }, box: [-58, -150, 32, 44], zoom: 8, panel: "lifted" },
  { label: "the build's composite of the dog's left ear perked alone, the resting head's notch under it (zoom 12)", states: { "ear.L": "onePerked" }, box: [24, -150, 26, 18], zoom: 12, panel: "perked" },
  { label: "both ears lifted, the dog's left temple and the head's side (zoom 8)", states: { "ear.L": "lifted", "ear.R": "lifted", "temple.L": "up", "temple.R": "up", "head.line": "temples" }, box: [26, -150, 32, 44], zoom: 8, panel: "lifted" },
  { label: "the dog's left ear lifted beside Lifted slightly: ear.L lifted, temple.L up, head.line templeL (phone size, 3 px/pt)", states: { "ear.L": "lifted", "temple.L": "up", "head.line": "templeL" }, box: [-90, -184, 180, 80], zoom: 3, panel: "lifted" },
  { label: "huffy A: cheeks puffed, flat lids, pressed mouth (phone size, 3 px/pt)", states: { cheeks: "puffed", "eye.L": "flat", "eye.R": "flat", mouth: "pressed" }, box: [-90, -150, 180, 96], zoom: 3 },
  { label: "huffy B (review only): the head puffed, head.base and head.line (phone size, 3 px/pt)", states: { "head.base": "puffed", "head.line": "puffed", "eye.L": "flat", "eye.R": "flat", mouth: "pressed" }, review: true, box: [-90, -150, 180, 96], zoom: 3 },
];

const before = await baseFront();
const after = (await import(pathToFileURL(join(repo, "characters/dog/src/views/front.ts")).href)) as FrontModule;
const all = (m: FrontModule, review: boolean) => [...m.front(), ...m.faceStates(), ...(review ? m.reviewStates() : [])];
const PANELS = { perked: perkedPanel(), lifted: liftedPanel() };
const columns = (box: Box, zoom: number, versions: [string, Drawn[]][], states: Record<string, string> = {}, panel?: keyof typeof PANELS, hero?: Box): Column[] => {
  const w = Math.round(box[2] * zoom), h = Math.round(box[3] * zoom);
  const sheet = panel ? { name: panel === "perked" ? "One ear perked" : "Lifted slightly", ...panelRegion(PANELS[panel].img, PANELS[panel].toPanel, box, zoom) } : { name: "sheet", ...sheetRegion(box) };
  return [...(hero ? [{ name: "hero", ...heroRegion(hero) }] : []), sheet, ...versions.map(([name, drawn]) => ({ name, png: render(drawn, states, box, zoom), pw: w, ph: h, vb: [0, 0, w, h] as Box }))];
};
const rest: [string, Drawn[]][] = [["before", all(before, false)], ["after", all(after, false)]];
const review: [string, Drawn[]][] = [["before", all(before, true)], ["after", all(after, true)]];
if (args.only) {
  const rows = JOINS.filter((r) => r.label.includes(args.only!)).map((row) => ({ row, columns: columns(row.box, row.zoom, rest, {}, undefined, row.hero) }));
  const states = STATES.filter((s) => s.label.includes(args.only!)).map((s) => ({
    row: { label: s.label, box: s.box, zoom: s.zoom }, columns: columns(s.box, s.zoom, s.review ? review : rest, s.states, s.panel),
  }));
  write(`Front: ${args.only}`, [...rows, ...states], join(out, "peek.png"));
  process.exit(0);
}
write(`Front: the joins the audit names, [hero |] sheet | before (${BASE}) | after`, JOINS.map((row) => ({ row, columns: columns(row.box, row.zoom, rest, {}, undefined, row.hero) })), join(out, "joins.png"));
write(`Front: the face states on the fur pass's parts, sheet | before (${BASE}) | after`, STATES.map((s) => ({
  row: { label: s.label, box: s.box, zoom: s.zoom }, columns: columns(s.box, s.zoom, s.review ? review : rest, s.states, s.panel),
})), join(out, "states.png"));
