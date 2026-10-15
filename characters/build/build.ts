// Builds a character package (characters/format/README.md, Files) from
// characters/<species>/src: checks the rig, clips and drawings, lints the
// drawings, rasterizes them into atlas sets, and writes
// build/characters/<species>/. Its development output (a build report and the
// landmarks the species' drawings place) goes to build/dev/<species>/, outside
// build/characters, which the app bundles whole (ios/project.yml).
// Run: node characters/build/build.ts <species> [out folder] [--dev <folder>] [--cache <folder>]
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { FORMAT, validate, type AtlasSet, type Clip, type Rig } from "../../runtime-web/src/format.ts";
import { lint, type LintRules } from "../draw/lint.ts";
import { packAtlas, type Drawing } from "./atlas.ts";
import { rasterizeAll, type RasterOptions } from "./raster.ts";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/** The atlas sets every package carries: 2x and 3x for the phone's screens, and the small set below 35% of full size. */
export const SETS = [
  { name: "2x", scale: 2, file: (page: number) => `atlas@2x-${page}.png` },
  { name: "3x", scale: 3, file: (page: number) => `atlas@3x-${page}.png` },
  { name: "small", scale: 1, file: (page: number) => `atlas-small-${page}.png` },
];

/** PNG chunks that make browsers or Apple's tools change the pixels on the way in (README, Rendering). */
const COLOUR_CHUNKS = ["gAMA", "cHRM", "iCCP"];

/** The chunk types of a PNG file, in order. */
export function pngChunks(png: Buffer): string[] {
  const types: string[] = [];
  for (let at = 8; at + 8 <= png.length; ) {
    const length = png.readUInt32BE(at);
    types.push(png.toString("latin1", at + 4, at + 8));
    at += 12 + length;
  }
  return types;
}

export interface Source {
  rig: Rig;
  clips: Clip[];
  params: unknown;
  drawings: Drawing[];
  /** The drawing lint's palette and exceptions, for a species drawn with characters/draw. */
  lint?: LintRules;
  /** Points the sheet has no finder for (paws, the tag's ring, the seat), per view, in model space. */
  landmarks?: Record<string, Record<string, [number, number]>>;
}

export async function readSource(species: string): Promise<Source> {
  const src = join(repo, "characters", species, "src");
  const json = (path: string) => JSON.parse(readFileSync(path, "utf8"));
  const clipFiles = readdirSync(join(src, "clips")).filter((f) => f.endsWith(".json")).sort();
  const module = (await import(pathToFileURL(join(src, "drawings.ts")).href)) as {
    drawings(): Drawing[];
    lint?: LintRules;
    landmarks?(): Record<string, Record<string, [number, number]>>;
  };
  return {
    rig: json(join(src, "rig.json")),
    clips: clipFiles.map((f) => json(join(src, "clips", f))),
    params: json(join(src, "params.json")),
    drawings: module.drawings(),
    ...(module.lint ? { lint: module.lint } : {}),
    ...(module.landmarks ? { landmarks: module.landmarks() } : {}),
  };
}

export interface Package {
  /** Every file of the package by name, as bytes. */
  files: Map<string, Buffer>;
  atlas: { sets: AtlasSet[] };
  /** Development output, never part of the package: written to build/dev/<species>/ (devFolder). */
  dev: Map<string, Buffer>;
  report: Report;
}

export interface Report {
  /** Hand nodes per part, per region. */
  nodes: Record<string, Record<string, number>>;
  /** How much of each set's page area its regions fill. */
  pageShare: Record<string, { pages: string[]; share: number }>;
}

function report(drawings: Drawing[], sets: AtlasSet[]): Report {
  const nodes: Report["nodes"] = {};
  for (const d of drawings) {
    const count = (d.meta?.shapes ?? []).reduce((sum, s) => sum + s.nodes, 0);
    if (!d.meta) continue;
    (nodes[d.region.split("/")[0]!] ??= {})[d.region] = count;
  }
  const pageShare: Report["pageShare"] = {};
  for (const set of sets) {
    const used = Object.values(set.regions).reduce((sum, r) => sum + r.w * r.h, 0);
    const total = set.pages.reduce((sum, p) => sum + p.width * p.height, 0);
    pageShare[set.name] = { pages: set.pages.map((p) => `${p.width}×${p.height}`), share: Math.round((used / total) * 1000) / 1000 };
  }
  return { nodes, pageShare };
}

/** Builds a package in memory; throws with every problem found. */
export async function buildPackage(source: Source, opts: RasterOptions = {}): Promise<Package> {
  const { rig, clips, params, drawings } = source;
  const problems: string[] = [];
  const drawn = new Set<string>();
  for (const d of drawings) {
    if (drawn.has(d.region)) problems.push(`drawing ${d.region}: drawn twice`);
    drawn.add(d.region);
  }
  // A null region draws nothing, so it needs no drawing.
  const used = new Set(rig.parts.flatMap((p) => Object.values(p.regions).filter((r) => r !== null)));
  for (const region of used) if (!drawn.has(region)) problems.push(`region ${region}: the rig uses it but nothing draws it`);
  for (const region of drawn) if (!used.has(region)) problems.push(`drawing ${region}: no part uses it`);
  const names = new Set<string>();
  for (const clip of clips) {
    if (names.has(clip.name)) problems.push(`clip ${clip.name}: two files have this name`);
    names.add(clip.name);
  }
  // Every drawing gets the lint's structural checks; a species drawn with the kit gets its palette and art rules too.
  problems.push(...lint(drawings, source.lint));
  if (problems.length) throw new Error(problems.join("\n"));

  const rasters = await rasterizeAll(drawings, SETS.map((s) => s.scale), opts);
  const files = new Map<string, Buffer>();
  const sets: AtlasSet[] = [];
  for (const set of SETS) {
    const { atlas, images } = packAtlas(set.name, drawings.map((d) => rasters.get(`${set.scale}:${d.region}`)!), set.scale, set.file);
    problems.push(...validate(rig, clips, atlas));
    images.forEach((image, i) => {
      const bad = pngChunks(image).filter((c) => COLOUR_CHUNKS.includes(c));
      if (bad.length) problems.push(`${set.file(i)}: has ${bad.join(", ")}, which would change its colours`);
      files.set(set.file(i), image);
    });
    sets.push(atlas);
  }
  if (problems.length) throw new Error([...new Set(problems)].join("\n"));

  const text = (value: unknown) => Buffer.from(JSON.stringify(value, null, 1) + "\n");
  files.set("atlas.json", text({ sets }));
  files.set("rig.json", text(rig));
  files.set("params.json", text(params));
  for (const clip of clips) files.set(`clips/${clip.name}.json`, text(clip));
  const hashes: Record<string, string> = {};
  for (const name of [...files.keys()].sort()) hashes[name] = createHash("sha256").update(files.get(name)!).digest("hex");
  files.set("package.json", text({ format: FORMAT, species: rig.species, version: rig.version ?? "0.0.0", minRuntime: FORMAT, files: hashes }));
  const built = report(drawings, sets);
  // Only a species drawn with the kit has development output.
  const dev = new Map<string, Buffer>();
  if (source.lint || source.landmarks) dev.set("report.json", text(built));
  if (source.landmarks) dev.set("landmarks.json", text(source.landmarks));
  return { files, atlas: { sets }, dev, report: built };
}

/** Where a species' package goes: the folder the app bundles whole. */
export const packageFolder = (species: string) => join(repo, "build", "characters", species);
/** Where a species' development output goes (report.json, landmarks.json): never inside a package folder. */
export const devFolder = (species: string) => join(repo, "build", "dev", species);

/** Writes the package into out and its development output, if it is given a folder, into dev; each folder is replaced whole. */
export function writePackage(pkg: Package, out: string, dev?: string): void {
  const write = (folder: string, files: Map<string, Buffer>) => {
    rmSync(folder, { recursive: true, force: true });
    for (const [name, bytes] of files) {
      mkdirSync(dirname(join(folder, name)), { recursive: true });
      writeFileSync(join(folder, name), bytes);
    }
  };
  write(out, pkg.files);
  if (dev) write(dev, pkg.dev);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values: args, positionals } = parseArgs({ allowPositionals: true, options: { dev: { type: "string" }, cache: { type: "string" } } });
  const [species, outArg] = positionals;
  if (!species) {
    console.error("usage: node characters/build/build.ts <species> [out folder] [--dev <folder>] [--cache <folder>]");
    process.exit(2);
  }
  const out = resolve(outArg ?? packageFolder(species));
  const dev = resolve(args.dev ?? devFolder(species));
  try {
    const pkg = await buildPackage(await readSource(species), { cache: resolve(args.cache ?? join(repo, "build", "cache")) });
    writePackage(pkg, out, dev);
    const pages = Object.entries(pkg.report.pageShare).map(([set, p]) => `${set}: ${p.pages.join(" + ")} (${Math.round(p.share * 100)}% filled)`).join(", ");
    console.log(`built ${species} into ${out} (${pkg.files.size} files; pages ${pages})${pkg.dev.size ? `; report and landmarks in ${dev}` : ""}`);
    const nodes = Object.entries(pkg.report.nodes).map(([part, regions]) => `${part} ${Object.values(regions).join("/")}`);
    if (nodes.length) console.log(`hand nodes: ${nodes.join(", ")}`);
  } catch (error) {
    console.error(`build of ${species} failed:\n${(error as Error).message}`);
    process.exit(1);
  }
}
