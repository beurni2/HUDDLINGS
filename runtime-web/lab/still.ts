// Renders a named still of a built package for the sheet match (phase 3): a clip
// that sets the body and head views, at time 0 on the deterministic clock, drawn
// by the WebGL runtime in three passes, with still.json to read them by:
// - white.png and black.png: the frame on opaque white and black, so alpha is
//   1 − (white − black)/255 and colour is black/alpha;
// - ids.png: each part's footprint, never its level: a part at an alpha above 0 in
//   its own flat ID colour wherever its texel's alpha is at least half its region's
//   own largest texel alpha, and a part at 0 nowhere, still clipped by its mask's
//   footprint, on black (ids.ts), so soft parts (shadows, the blush) show too; the
//   level is white.png's and black.png's.
// Model point (x, y) is at pixel rootPx + ppp·(x, y), pixel (i, j) covering
// [i, i + 1) × [j, j + 1). The folder is replaced whole, and only once every
// file is written; a canvas Chromium will not give at full size fails.
//
// node runtime-web/lab/still.ts --species <s> --still <clip> --ppp <n> --out <folder>
// node runtime-web/lab/still.ts --package <folder> --still <clip> --still <clip>... --ppp <n> --out <folder>
// --package draws any built package folder (build/characters/<s>/ by default);
// with several --still, each goes into <out>/<clip>/, all from one Chromium.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { PNG } from "pngjs";
import { openLab } from "./browser.ts";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/** The least room around the character, in points. */
export const MARGIN = 8;

export interface StillInfo {
  species: string;
  still: string;
  clip: string;
  views: { body: string; head: string };
  ppp: number;
  sizePx: [number, number];
  rootPx: [number, number];
  parts: Record<string, { id: string; bone: string; clipTo?: string }>;
  drawn: string[];
}

export interface Stills {
  /** Loads the package, again after every build, for stills at ppp pixels per point; returns the atlas set they draw from. */
  load(ppp: number): Promise<string>;
  /** Renders a still of the loaded package into a folder, replaced whole once all are written: white.png, black.png, ids.png and still.json. */
  render(still: string, out: string): Promise<StillInfo>;
  /** The GPU Chromium draws with, so a still never passes on a missing device. */
  device(): Promise<string>;
  close(): Promise<void>;
}

/** The page's own error, without Playwright's prefix and the bundle's stack. */
function pageError(error: unknown): Error {
  return new Error((error as Error).message.split("\n")[0]!.replace(/^page\.evaluate: (Error: )?/, ""));
}

/** Opens the Lab in headless Chromium on the package at packageDir; it stays open for any number of stills. */
export async function openStills(packageDir: string): Promise<Stills> {
  const lab = await openLab(packageDir);
  const { page } = lab;
  let loaded: { ppp: number; species: string } | undefined;
  return {
    async load(ppp) {
      if (!(ppp > 0)) throw new Error(`ppp must be positive, not ${ppp}`);
      const manifest = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8")) as { species: string };
      const stage = { x: 0, y: 0, pixelsPerPoint: ppp };
      const { set } = await page.evaluate(([base, options]) => window.lab.load(base, options), [lab.packageUrl, { width: 1, height: 1, stage }] as const).catch((e) => {
        throw pageError(e);
      });
      loaded = { ppp, species: manifest.species };
      return set;
    },
    async render(still, out) {
      if (!loaded) throw new Error("load the package before rendering a still");
      const { ppp, species } = loaded;
      const posed = await page.evaluate((name) => window.lab.still(name), still).catch((e) => {
        throw pageError(e);
      });
      if (posed.drawn.length === 0) throw new Error(`still ${still} draws no part`);
      // A canvas of whole pixels around the quads with the margin, the root on a pixel corner.
      const [x0, y0, x1, y1] = posed.box;
      const left = Math.floor((x0 - MARGIN) * ppp);
      const top = Math.floor((y0 - MARGIN) * ppp);
      const width = Math.ceil((x1 + MARGIN) * ppp) - left;
      const height = Math.ceil((y1 + MARGIN) * ppp) - top;
      const stage = { x: -left, y: -top, pixelsPerPoint: ppp };
      // Every file is written into a folder beside out and moved into place only when all are: a pass that fails
      // leaves out as it was, never half a still.
      mkdirSync(dirname(out), { recursive: true });
      const partial = mkdtempSync(join(dirname(out), `.${basename(out)}.partial-`));
      try {
        const passes = [["white", [1, 1, 1], false], ["black", [0, 0, 0], false], ["ids", [0, 0, 0], true]] as const;
        for (const [name, background, ids] of passes) {
          const rgba = await page.evaluate((o) => window.lab.drawStill(o), { width, height, stage, background: [...background] as [number, number, number], ids }).catch((e) => {
            throw pageError(e);
          });
          const bytes = Buffer.from(rgba, "base64");
          if (bytes.length !== width * height * 4) throw new Error(`the ${name} pass read back ${bytes.length} bytes, not the ${width * height * 4} of ${width} × ${height} px`);
          const png = new PNG({ width, height });
          bytes.copy(png.data);
          writeFileSync(join(partial, `${name}.png`), PNG.sync.write(png));
        }
        const info: StillInfo = {
          species, still, clip: still, views: posed.views, ppp,
          sizePx: [width, height], rootPx: [stage.x, stage.y], parts: posed.parts, drawn: posed.drawn,
        };
        writeFileSync(join(partial, "still.json"), JSON.stringify(info, null, 1) + "\n");
        rmSync(out, { recursive: true, force: true });
        renameSync(partial, out);
        return info;
      } finally {
        rmSync(partial, { recursive: true, force: true });
      }
    },
    device: () => page.evaluate(() => window.lab.device()),
    close: () => lab.close(),
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values: args } = parseArgs({
    options: {
      species: { type: "string" }, package: { type: "string" }, still: { type: "string", multiple: true }, ppp: { type: "string", default: "3" }, out: { type: "string" },
    },
  });
  if ((!args.species && !args.package) || !args.still?.length || !args.out) {
    console.error("usage: node runtime-web/lab/still.ts --species <s> --still <clip> --ppp <n> --out <folder>");
    console.error("       node runtime-web/lab/still.ts --package <folder> --still <clip> [--still <clip>...] --ppp <n> --out <folder>");
    process.exit(2);
  }
  const packageDir = resolve(args.package ?? join(repo, "build", "characters", args.species!));
  if (!existsSync(join(packageDir, "package.json"))) {
    console.error(`no package at ${packageDir}; build it first (node characters/build/build.ts ${args.species ?? "<species>"})`);
    process.exit(1);
  }
  const stills = await openStills(packageDir);
  try {
    const set = await stills.load(Number(args.ppp));
    const several = args.still.length > 1;
    for (const name of args.still) {
      const out = resolve(args.out, several ? name : "");
      const info = await stills.render(name, out);
      console.log(`still ${info.still} of ${info.species} at ${info.ppp} px/pt from set ${set}: ${info.sizePx.join(" × ")} px, root at ${info.rootPx.join(", ")}, ` +
        `${info.drawn.length} parts drawn (${await stills.device()}) into ${out}`);
    }
  } catch (error) {
    console.error(`still: ${(error as Error).message}`);
    process.exitCode = 1;
  } finally {
    await stills.close();
  }
}
