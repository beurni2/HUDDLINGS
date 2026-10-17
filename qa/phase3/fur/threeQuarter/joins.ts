// The three-quarter view's joins sheets for the fur pass (docs/phase3-fur-plan.md; DECISIONS 228 to 234, 272 to 275): for
// each facing, one row per join the audit names (qa/phase3/audit/defects.json, three-quarter D1 to D15), each the sheet's
// crop, the base's drawing (46011a2, before the fur kit's third round) and this branch's, side by side, drawn at 10 px/pt and shown at 7 to 9 (2.3
// to 3 times the phone's 3), and a last row of the whole dog at phone size. threeQuarter.R is held against the .L crop
// mirrored (DECISIONS 2, 254).
// Each view's rest drawings are composited as the rest-frame tests composite them (each part rendered by resvg in model
// space, in rig.json's draw order, clip groups by the runtimes' stencil rule, at each part's rest alpha). It also prints
// what the line gate (DECISIONS 219) finds in each facing, rest and face states, as the build's lint would, and again
// counting only what shows (LintRules.shown, DECISIONS 264), with each perked ear composited with its own temple state
// (perkedL and perkedR, as the face clips draw them).
//
// node qa/phase3/fur/threeQuarter/joins.ts [--only <row label part>] [--gate]
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import { PNG } from "pngjs";
import type { Rig } from "../../../../runtime-web/src/format.ts";
import { decisionsOf, gateProblems } from "../../../../characters/draw/lint.ts";
import { scopeIds, type Piece } from "../../../../characters/draw/svg.ts";
import { composite } from "../../../../characters/draw/test/composite.ts";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../../../..");
const BASE = "46011a2";
const rig = JSON.parse(readFileSync(join(repo, "characters/dog/src/rig.json"), "utf8")) as Rig;
const model = JSON.parse(readFileSync(join(repo, "characters/dog/model.json"), "utf8")) as {
  crops: Record<string, { crop: string; ptPerCropPx: number; anchorsCropPx: { ground: [number, number] } }>;
};
const decisions = decisionsOf(readFileSync(join(repo, "characters/dog/DECISIONS.md"), "utf8"));

interface Drawn {
  part: string;
  state?: string;
  piece: Piece;
}
type View = { threeQuarter: (s: "L" | "R") => Drawn[]; threeQuarterFaces: (s: "L" | "R") => Drawn[] };

/** The model-space canvas in a facing, in whole points: threeQuarter.L's dog reaches x -121 to 47, and .R's, its mirror, -47 to 121. */
const boxOf = (facing: "L" | "R") => ({ x: facing === "L" ? -130 : -60, y: -180, w: 190, h: 190 });
/** The composites' scale, px/pt: the zoomed rows' own, never upscaled. */
const SCALE = 10;

/** The base's view: its source at BASE, its relative imports made absolute, imported from a scratch folder. */
async function baseView(): Promise<View> {
  const file = join(repo, "characters/dog/src/views/threeQuarter.ts");
  const src = execFileSync("git", ["-C", repo, "show", `${BASE}:characters/dog/src/views/threeQuarter.ts`], { encoding: "utf8" })
    .replace(/from "(\.\.?\/[^"]+)"/g, (_m, spec: string) => `from "${pathToFileURL(resolve(dirname(file), spec)).href}"`);
  const path = join(mkdtempSync(join(tmpdir(), "tq-joins-")), "threeQuarter.base.ts");
  writeFileSync(path, src);
  return (await import(pathToFileURL(path).href)) as View;
}

interface Image {
  w: number;
  h: number;
  data: Buffer;
}

/** The view's rest drawings composited on white over its facing's box at `scale` px/pt. */
function rest(view: string, drawn: Drawn[], scale: number): Image {
  const BOX = boxOf(view.endsWith(".R") ? "R" : "L");
  const pieces = new Map(drawn.filter((d) => !d.state || d.state === "open").map((d) => [d.part, d.piece]));
  const order = rig.drawOrder[view]!.flatMap((p) => (p === "@head" ? rig.drawOrder[`head.${view}`]! : [p])).filter((p) => pieces.has(p));
  const part = (name: string) => rig.parts.find((p) => p.name === name);
  const w = BOX.w * scale, h = BOX.h * scale;
  const layers = order.map((name) => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${BOX.w}" height="${BOX.h}" viewBox="${BOX.x} ${BOX.y} ${BOX.w} ${BOX.h}">${scopeIds(pieces.get(name)!.svg, "p")}</svg>`;
    const png = PNG.sync.read(new Resvg(svg, { fitTo: { mode: "zoom", value: scale }, background: "rgba(0,0,0,0)" }).render().asPng());
    const clipTo = part(name)?.clipTo, alpha = part(name)?.alpha;
    return { rgba: png.data, part: name, ...(clipTo ? { clipTo } : {}), ...(alpha !== undefined ? { alpha } : {}) };
  });
  const c = composite(layers, w, h);
  const data = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const a = c[i * 4 + 3]!;
    for (let k = 0; k < 3; k++) data[i * 4 + k] = Math.round(255 * Math.min(1, c[i * 4 + k]! + (1 - a)));
    data[i * 4 + 3] = 255;
  }
  return { w, h, data };
}

/** A box of an image, in its pixels, as a PNG, mirrored left to right when asked. */
function cut(img: Image, x: number, y: number, w: number, h: number, flip = false): Buffer {
  const png = new PNG({ width: w, height: h });
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const sx = Math.min(img.w - 1, Math.max(0, x + (flip ? w - 1 - i : i))), sy = Math.min(img.h - 1, Math.max(0, y + j));
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

/** A region of the dog in model points, [x, y, width, height], typed in the .L frame. */
type Box = [number, number, number, number];

/** The sheet's crop of a region (in the .L frame): whole crop pixels and the region's place in them; mirrored for .R. */
function sheetRegion(box: Box, flip: boolean): { png: Buffer; pw: number; ph: number; vb: [number, number, number, number] } {
  const crop = model.crops["threeQuarter.L"]!;
  const img = readPng(join(repo, "characters/dog/ref/panels/master", `${crop.crop}.png`));
  const k = 1 / crop.ptPerCropPx, [gx, gy] = crop.anchorsCropPx.ground;
  // The root lies on the crop's ground anchor, at the middle of its pixel (the sheet match's alignment).
  const x0 = gx + 0.5 + box[0] * k, y0 = gy + 0.5 + box[1] * k, x1 = x0 + box[2] * k, y1 = y0 + box[3] * k;
  const ix = Math.floor(x0), iy = Math.floor(y0), iw = Math.ceil(x1) - ix, ih = Math.ceil(y1) - iy;
  // Mirrored, the region's left edge lies as far in from the cut's right edge as it lay from its left.
  const vx = flip ? ix + iw - x1 : x0 - ix;
  return { png: cut(img, ix, iy, iw, ih, flip), pw: iw, ph: ih, vb: [vx, y0 - iy, x1 - x0, y1 - y0] };
}

function panel(png: Buffer, pw: number, ph: number, view: [number, number, number, number], x: number, y: number, w: number, h: number): string {
  return `<svg x="${x}" y="${y}" width="${w}" height="${h}" viewBox="${view.join(" ")}" preserveAspectRatio="none">` +
    `<image width="${pw}" height="${ph}" href="data:image/png;base64,${png.toString("base64")}" preserveAspectRatio="none"/></svg>` +
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="#C8C0B8" stroke-width="1"/>`;
}

interface Row {
  label: string;
  /** In the .L frame. */
  box: Box;
  /** Output pixels per point. */
  zoom: number;
}

/** The joins the audit names in this view (defects.json, D1 to D15), each where the .L crop draws it. */
const ROWS: Row[] = [
  { label: "D1 the crown over the far ear's root", box: [-100, -152, 32, 30], zoom: 9 },
  { label: "D2 the far cheek over the far ear, and the far jaw", box: [-108, -108, 30, 44], zoom: 9 },
  { label: "D4 the crown over the near ear's root", box: [-26, -150, 32, 30], zoom: 9 },
  { label: "D3 the near cheek over the near ear", box: [-28, -122, 22, 66], zoom: 9 },
  { label: "D5 the far ear's outer edge and hem", box: [-124, -146, 46, 72], zoom: 7 },
  { label: "D5 the near ear's outer edge and hem", box: [-24, -140, 58, 84], zoom: 7 },
  { label: "D6 the crown and the topknot", box: [-74, -168, 66, 26], zoom: 8 },
  { label: "D7 D8 the chin over the collar, the collar's ends", box: [-82, -78, 64, 28], zoom: 8 },
  { label: "D9 D11 the chest under the collar's end, the far leg's top", box: [-84, -64, 30, 40], zoom: 9 },
  { label: "D10 between the front legs, the chest's lower edge", box: [-80, -42, 34, 40], zoom: 9 },
  { label: "D12 the front paws", box: [-86, -24, 60, 26], zoom: 8 },
  { label: "D13 the hind paw, the thigh and the haunch's foot", box: [-36, -40, 40, 42], zoom: 9 },
  { label: "D14 the tail's plume and tan root; the back's rump", box: [2, -66, 48, 62], zoom: 7 },
  { label: "D8 the back under the near ear and the collar's near end", box: [-30, -72, 44, 30], zoom: 8 },
  { label: "D15 the ground shadow", box: [-110, -16, 160, 20], zoom: 4 },
];
const PHONE: Row = { label: "the whole dog at phone size (3 px/pt)", box: [-126, -172, 178, 176], zoom: 3 };

function sheet(title: string, facing: "L" | "R", before: Image, after: Image, rows: Row[], out: string): void {
  const GAP = 10, HEAD = 34, LABEL = 20;
  let y = HEAD, width = 0, body = "";
  const flip = facing === "R";
  for (const row of rows) {
    // The .R frame's box is the .L box mirrored.
    const [lx, by, bw, bh] = row.box, bx = flip ? -(lx + bw) : lx;
    const w = Math.round(bw * row.zoom), h = Math.round(bh * row.zoom);
    body += `<text x="${GAP}" y="${y + 15}" font-family="DejaVu Sans" font-size="14" fill="#3A2A20">${row.label}</text>`;
    y += LABEL;
    const s = sheetRegion(row.box, flip);
    const BOX = boxOf(facing);
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
    `<text x="${GAP}" y="22" font-family="DejaVu Sans" font-size="16" font-weight="600" fill="#3A2A20">${title}</text>${body}</svg>`;
  const png = new Resvg(svg, { font: { loadSystemFonts: true, defaultFontFamily: "DejaVu Sans" } }).render().asPng();
  const decoded = PNG.sync.read(png);
  const rgb = new PNG({ width: decoded.width, height: decoded.height, colorType: 2 });
  decoded.data.copy(rgb.data);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, PNG.sync.write(rgb, { colorType: 2 }));
}

/**
 * What the line gate finds in a facing: the rest and every face state, as the build's lint composites them; and, with
 * `shown`, counting only what shows (DECISIONS 264), each perked ear also composited with head.line's temple state on
 * its side, as the face clips draw them (perkedL, perkedR).
 */
function gate(view: string, drawn: Drawn[], shown = false): string[] {
  const own = drawn.map(({ part, state, piece }) => ({ region: `${part}/${view}${state ? `:${state}` : ""}`, svg: "", anchor: [0, 0] as [number, number], meta: piece.meta }));
  const perked = shown
    ? (["L", "R"] as const).flatMap((side) => [[`ear.${side}`, "onePerked"], ["head.line", `temple${side}`]].flatMap(([part, state]) => {
      const d = drawn.find((x) => x.part === part && x.state === state);
      return d ? [{ region: `${part}/${view}:perked${side}`, svg: "", anchor: [0, 0] as [number, number], meta: d.piece.meta }] : [];
    }))
    : [];
  return gateProblems([...own, ...perked], { rig, decisions, ...(shown ? { shown: true } : {}) });
}

const arg = (name: string) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : undefined);
const only = arg("--only");
const facings = (arg("--facing") ? [arg("--facing")] : ["L", "R"]) as ("L" | "R")[];
const gateOnly = process.argv.includes("--gate");

/** The base's composite, kept between runs: the base never changes. */
function baseRest(view: string, b: View, facing: "L" | "R"): Image {
  const path = join(tmpdir(), `tq-joins-base-${BASE}-${facing}-${SCALE}-${boxOf(facing).x}.png`);
  try {
    return readPng(path);
  } catch {
    const img = rest(view, b.threeQuarter(facing), SCALE);
    const png = new PNG({ width: img.w, height: img.h });
    img.data.copy(png.data);
    writeFileSync(path, PNG.sync.write(png));
    return img;
  }
}
const now = (await import(pathToFileURL(join(repo, "characters/dog/src/views/threeQuarter.ts")).href)) as View;
const base = gateOnly ? undefined : await baseView();
for (const facing of facings) {
  const view = `threeQuarter.${facing}`;
  const drawn = [...now.threeQuarter(facing), ...now.threeQuarterFaces(facing)];
  const problems = gate(view, drawn), shown = gate(view, drawn, true);
  console.log(`${view}: the line gate finds ${problems.length} problems`);
  for (const p of problems) console.log(`  ${p}`);
  console.log(`${view}: counting only what shows, with the perked composites, ${shown.length} problems`);
  for (const p of shown) console.log(`  ${p}`);
  if (gateOnly) continue;
  const before = baseRest(view, base!, facing), after = rest(view, now.threeQuarter(facing), SCALE);
  const rows = only ? ROWS.filter((r) => r.label.includes(only)) : [...ROWS, PHONE];
  const out = only ? join(tmpdir(), `tq-joins-${facing}.png`) : join(here, view, "joins.png");
  sheet(`${view}: the joins, the sheet | before (${BASE}) | now`, facing, before, after, rows, out);
  console.log(`${view}: ${out}`);
}
