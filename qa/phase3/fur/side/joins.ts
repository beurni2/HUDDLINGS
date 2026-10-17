// The side view's joins (the fur pass's side lane, DECISIONS 235 to 241): one row per join the audit names, each the
// sheet's crop, the drawing at the pass's base (fbbe6d3, the "before") and the drawing now (the "after"), side by side
// at one zoom, labelled; and the whole dog at phone size. For side.R the crop is the side crop mirrored (DECISIONS 2).
// The base's drawing is its own source at fbbe6d3 (the view, its facing and its tag recipe, the lane's files), read from
// git into a scratch folder, so "before" is always the base whatever this branch changes; the shared recipes it imports
// draw as they did there unless a view opts in (DECISIONS 210 to 219).
//
// node qa/phase3/fur/side/joins.ts [side.L|side.R ...]   (writes qa/phase3/fur/side/joins.png and joins.R.png)
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import { PNG } from "pngjs";
import { BOX } from "../../../../characters/draw/test/composite.ts";
import { rest, type Drawn, type Image } from "../recipes/render.ts";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../../../..");
const BASE = "fbbe6d3";
/** The lane's own files the base's drawing is read from at the base; every other import is the branch's own file. */
const OWN = ["characters/dog/src/views/side.ts", "characters/dog/src/views/facing.ts", "characters/dog/src/parts/tag.ts"];
/** The composites' scale, px/pt: every row is drawn down from it. */
const SCALE = 8;

/** The base's side view: the lane's files at the base in a scratch tree, their other relative imports pointed at the branch's files. */
async function baseSide(): Promise<(f: "L" | "R") => Drawn[]> {
  const root = mkdtempSync(join(tmpdir(), "side-joins-"));
  for (const file of OWN) {
    const src = execFileSync("git", ["show", `${BASE}:${file}`], { cwd: repo, encoding: "utf8" });
    const out = join(root, file);
    mkdirSync(dirname(out), { recursive: true });
    const fixed = src.replace(/from "(\.\.?\/[^"]+)"/g, (m, spec: string) => {
      const target = resolve(dirname(join(repo, file)), spec);
      const rel = target.startsWith(repo) ? target.slice(repo.length + 1) : "";
      return OWN.includes(rel) ? m : `from "${pathToFileURL(target).href}"`;
    });
    writeFileSync(out, fixed);
  }
  const m = (await import(pathToFileURL(join(root, OWN[0]!)).href)) as { side: (f: "L" | "R") => Drawn[] };
  return m.side;
}

/** A region of the dog, in model points: [x, y, width, height] (in side.L's frame; mirrored for side.R). */
type Box = [number, number, number, number];
interface Row {
  label: string;
  box: Box;
  zoom: number;
}

/** The joins the audit names in profile (qa/phase3/audit/defects.json, side #1 to #19), each at about 3 to 4 times the crop's own scale. */
const ROWS: Row[] = [
  { label: "crown: the forehead's locks and the topknot (#1, #8)", box: [-98, -168, 108, 34], zoom: 4 },
  { label: "the back of the head into the ear's top, the patch at the ear's root (#2, #3)", box: [-50, -160, 72, 46], zoom: 4 },
  { label: "the ear's outer edge and hem over the collar and the back (#4, #5)", box: [-42, -146, 68, 88], zoom: 3.4 },
  { label: "chin over the collar, the jaw (#6)", box: [-100, -92, 62, 36], zoom: 5 },
  { label: "chest, the collar's front and the tag (#7)", box: [-80, -68, 34, 40], zoom: 5 },
  { label: "the front legs: the near leg's top, back and elbow, the far leg (#10, #11, #14)", box: [-80, -48, 56, 30], zoom: 5 },
  { label: "the front paws (#9)", box: [-80, -24, 50, 26], zoom: 5 },
  { label: "the hind paw, the heel crease and the haunch's underside (#11, #12, #13)", box: [-40, -40, 58, 42], zoom: 5 },
  { label: "the back's topline, the saddle and the rump over the tail (#17, #18)", box: [-24, -68, 50, 66], zoom: 3.4 },
  { label: "the tail's plume and its tan root (#15, #16)", box: [6, -66, 46, 62], zoom: 3.6 },
  { label: "the ground shadow (#19)", box: [-104, -16, 156, 18], zoom: 2 },
];
const PHONE: Row = { label: "the whole dog at phone size (3 px/pt)", box: [-100, -170, 150, 176], zoom: 3 };

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

function sheet(view: string, before: Image, after: Image, out: string): void {
  const GAP = 10, LABEL = 20, TOP = 46;
  let y = TOP, width = 0, body = "";
  for (const row of [...ROWS, PHONE]) {
    const box: Box = view === "side.R" ? [-(row.box[0] + row.box[2]), row.box[1], row.box[2], row.box[3]] : row.box;
    const [bx, by, bw, bh] = box, w = Math.round(bw * row.zoom), h = Math.round(bh * row.zoom);
    body += `<text x="${GAP}" y="${y + 15}" font-family="DejaVu Sans" font-size="14" fill="#3A2A20">${row.label}${row === PHONE ? "" : ` · ${row.zoom} px/pt`}</text>`;
    y += LABEL;
    const s = sheetRegion(view, box);
    const px = (x: number) => Math.round((x - BOX.x) * SCALE), py = (v: number) => Math.round((v - BOX.y) * SCALE);
    const sw = Math.round(bw * SCALE), sh = Math.round(bh * SCALE);
    const own = (img: Image) => cut(img, px(bx), py(by), sw, sh);
    let x = GAP;
    for (const [name, png, pw, ph, vb] of [["sheet", s.png, s.pw, s.ph, s.vb], ["before (fbbe6d3)", own(before), sw, sh, [0, 0, sw, sh]], ["after", own(after), sw, sh, [0, 0, sw, sh]]] as const) {
      body += panel(png, pw, ph, vb as [number, number, number, number], x, y, w, h);
      body += `<text x="${x + 5}" y="${y + h - 6}" font-family="DejaVu Sans" font-size="12" fill="#7A6A5E">${name}</text>`;
      x += w + GAP;
    }
    y += h + GAP;
    width = Math.max(width, x);
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${y}" viewBox="0 0 ${width} ${y}"><rect width="${width}" height="${y}" fill="#FFFFFF"/>` +
    `<text x="${GAP}" y="20" font-family="DejaVu Sans" font-size="16" font-weight="600" fill="#3A2A20">${view}: the fur pass's joins, the sheet | before | after</text>` +
    `<text x="${GAP}" y="38" font-family="DejaVu Sans" font-size="13" fill="#3A2A20">the audit's side defects #1 to #19 (qa/phase3/audit/defects.json); DECISIONS 235 to 241</text>${body}</svg>`;
  const png = PNG.sync.read(new Resvg(svg, { font: { loadSystemFonts: true, defaultFontFamily: "DejaVu Sans" } }).render().asPng());
  const rgb = new PNG({ width: png.width, height: png.height, colorType: 2 });
  png.data.copy(rgb.data);
  writeFileSync(out, PNG.sync.write(rgb, { colorType: 2 }));
}

const views = process.argv.slice(2).length ? process.argv.slice(2) : ["side.L", "side.R"];
const before = await baseSide();
const { side } = (await import("../../../../characters/dog/src/views/side.ts")) as { side: (f: "L" | "R") => Drawn[] };
for (const view of views) {
  const f = view === "side.R" ? "R" : "L";
  const out = join(here, view === "side.R" ? "joins.R.png" : "joins.png");
  sheet(view, rest(view, before(f), SCALE), rest(view, side(f), SCALE), out);
  console.log(out);
}
