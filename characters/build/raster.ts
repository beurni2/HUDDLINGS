// Rasterizes drawings outside the build's own process: resvg 2.6.2 aborts the
// whole process on some SVGs (a panic at geom.rs:27, exit 134), so each batch
// runs in a child process, and a batch that dies is rerun one drawing at a time
// to name the culprit. Rasters are cached under build/cache/ by the SHA-256 of
// what makes them (the SVG, the scale, resvg's and pngjs's versions and the
// rasterizing code's own text), so an unchanged part is never drawn twice and a
// change to how parts are drawn never reads a stale one.
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { availableParallelism, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { rasterize, type Drawing, type Raster } from "./atlas.ts";

const here = dirname(fileURLToPath(import.meta.url));
const WORKER = join(here, "raster-worker.ts");
const version = (name: string) => (createRequire(import.meta.url)(`${name}/package.json`) as { version: string }).version;
/**
 * What makes a raster besides its SVG and scale: the libraries' versions and the
 * code that draws, trims, writes and reads it (atlas.ts's rasterize, this file
 * and the worker), by its text, so the same code in another checkout (the
 * pre-commit hook's) shares the cache and changed code never reads it.
 */
export const RASTERIZER = createHash("sha256")
  .update([`@resvg/resvg-js ${version("@resvg/resvg-js")}`, `pngjs ${version("pngjs")}`, rasterize.toString(),
    readFileSync(fileURLToPath(import.meta.url), "utf8"), readFileSync(WORKER, "utf8")].join("\n"))
  .digest("hex");

export interface Job {
  /** The drawing's region, for the worker's own errors. */
  region: string;
  svg: string;
  scale: number;
  /** Where the worker writes the raster. */
  file: string;
}

/** A raster on disk: width, height and the trim's left and top (uint32 each), then straight RGBA. */
export function writeRaster(file: string, r: { w: number; h: number; minX: number; minY: number; data: Buffer }): void {
  const head = Buffer.alloc(16);
  head.writeUInt32LE(r.w, 0);
  head.writeUInt32LE(r.h, 4);
  head.writeUInt32LE(r.minX, 8);
  head.writeUInt32LE(r.minY, 12);
  writeFileSync(file, Buffer.concat([head, r.data]));
}

function readRaster(file: string, d: Drawing, scale: number): Raster {
  const bytes = readFileSync(file);
  const w = bytes.readUInt32LE(0), h = bytes.readUInt32LE(4), minX = bytes.readUInt32LE(8), minY = bytes.readUInt32LE(12);
  return { region: d.region, w, h, data: bytes.subarray(16), anchorX: d.anchor[0] * scale - minX, anchorY: d.anchor[1] * scale - minY };
}

export function rasterKey(svg: string, scale: number): string {
  return createHash("sha256").update(`${RASTERIZER}\n${scale}\n${svg}`).digest("hex");
}

/** Runs the worker on some jobs: the exit code, or the signal that killed it, and what it said. */
function run(jobs: Job[], folder: string, name: string): Promise<{ ok: boolean; why: string }> {
  const list = join(folder, `${name}.json`);
  writeFileSync(list, JSON.stringify(jobs));
  return new Promise((done) => {
    const child = spawn(process.execPath, [WORKER, list], { stdio: ["ignore", "ignore", "pipe"] });
    let said = "";
    child.stderr.on("data", (chunk: Buffer) => (said += chunk.toString()));
    child.on("close", (code, signal) => {
      rmSync(list, { force: true });
      const lines = said.split("\n").map((l) => l.trim()).filter(Boolean);
      const first = lines.find((l) => /^(?:[A-Za-z]*Error:|thread .* panicked)/.test(l)) ?? lines[0] ?? "";
      done({ ok: code === 0, why: `${signal ? `killed by ${signal}` : `exit ${code}`}${first ? `: ${first}` : ""}` });
    });
  });
}

export interface RasterOptions {
  /** The cache folder; without one, rasters go to a temporary folder that is removed afterwards. */
  cache?: string;
  /** Drawings per child process. */
  batch?: number;
  /** Child processes at once. */
  workers?: number;
}

/**
 * Every drawing at every scale, as trimmed rasters (the map's keys are
 * "<scale>:<region>"). Throws naming every drawing resvg could not draw.
 */
export async function rasterizeAll(drawings: Drawing[], scales: number[], opts: RasterOptions = {}): Promise<Map<string, Raster>> {
  const folder = opts.cache ? resolve(opts.cache) : mkdtempSync(join(tmpdir(), "raster-"));
  mkdirSync(folder, { recursive: true });
  try {
    const wanted = drawings.flatMap((d) => scales.map((scale) => ({ d, scale, file: join(folder, `${rasterKey(d.svg, scale)}.rgba`) })));
    const missing = [...new Map(wanted.filter((w) => !existsSync(w.file)).map((w) => [w.file, w])).values()];
    const size = opts.batch ?? Math.max(1, Math.min(24, Math.ceil(missing.length / (opts.workers ?? availableParallelism()))));
    const batches: (typeof missing)[] = [];
    for (let i = 0; i < missing.length; i += size) batches.push(missing.slice(i, i + size));
    const failures: string[] = [];
    const pending = [...batches.entries()];
    const lane = async () => {
      for (let next = pending.shift(); next; next = pending.shift()) {
        const [i, batch] = next;
        const jobs = (b: typeof batch) => b.map(({ d, scale, file }) => ({ region: d.region, svg: d.svg, scale, file }));
        if ((await run(jobs(batch), folder, `batch-${process.pid}-${i}`)).ok) continue;
        // The batch died: one drawing at a time names the culprit.
        for (const [k, one] of batch.entries()) {
          const result = await run(jobs([one]), folder, `one-${process.pid}-${i}-${k}`);
          if (!result.ok) failures.push(`drawing ${one.d.region} at ${one.scale}x could not be drawn (${result.why})`);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(batches.length, opts.workers ?? availableParallelism()) }, lane));
    if (failures.length) throw new Error(failures.join("\n"));
    return new Map(wanted.map(({ d, scale, file }) => [`${scale}:${d.region}`, readRaster(file, d, scale)]));
  } finally {
    if (!opts.cache) rmSync(folder, { recursive: true, force: true });
  }
}
