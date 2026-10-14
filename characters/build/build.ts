// Builds a character package (characters/format/README.md, Files) from
// characters/<species>/src: checks the rig, clips and drawings, rasterizes the
// drawings into atlas sets, and writes build/characters/<species>/.
// Run: node characters/build/build.ts <species> [out folder]
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { FORMAT, validate, type AtlasSet, type Clip, type Rig } from "../../runtime-web/src/format.ts";
import { buildAtlas, type Drawing } from "./atlas.ts";

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
}

export async function readSource(species: string): Promise<Source> {
  const src = join(repo, "characters", species, "src");
  const json = (path: string) => JSON.parse(readFileSync(path, "utf8"));
  const clipFiles = readdirSync(join(src, "clips")).filter((f) => f.endsWith(".json")).sort();
  const module = (await import(pathToFileURL(join(src, "drawings.ts")).href)) as { drawings(): Drawing[] };
  return {
    rig: json(join(src, "rig.json")),
    clips: clipFiles.map((f) => json(join(src, "clips", f))),
    params: json(join(src, "params.json")),
    drawings: module.drawings(),
  };
}

export interface Package {
  /** Every file of the package by name, as bytes. */
  files: Map<string, Buffer>;
  atlas: { sets: AtlasSet[] };
}

/** Builds a package in memory; throws with every problem found. */
export function buildPackage(source: Source): Package {
  const { rig, clips, params, drawings } = source;
  const problems: string[] = [];
  const drawn = new Set<string>();
  for (const d of drawings) {
    if (drawn.has(d.region)) problems.push(`drawing ${d.region}: drawn twice`);
    drawn.add(d.region);
  }
  const used = new Set(rig.parts.flatMap((p) => Object.values(p.regions)));
  for (const region of used) if (!drawn.has(region)) problems.push(`region ${region}: the rig uses it but nothing draws it`);
  for (const region of drawn) if (!used.has(region)) problems.push(`drawing ${region}: no part uses it`);
  const names = new Set<string>();
  for (const clip of clips) {
    if (names.has(clip.name)) problems.push(`clip ${clip.name}: two files have this name`);
    names.add(clip.name);
  }
  if (problems.length) throw new Error(problems.join("\n"));

  const files = new Map<string, Buffer>();
  const sets: AtlasSet[] = [];
  for (const set of SETS) {
    const { atlas, images } = buildAtlas(set.name, drawings, set.scale, set.file);
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
  return { files, atlas: { sets } };
}

export function writePackage(pkg: Package, out: string): void {
  rmSync(out, { recursive: true, force: true });
  for (const [name, bytes] of pkg.files) {
    mkdirSync(dirname(join(out, name)), { recursive: true });
    writeFileSync(join(out, name), bytes);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const species = process.argv[2];
  if (!species) {
    console.error("usage: node characters/build/build.ts <species> [out folder]");
    process.exit(2);
  }
  const out = resolve(process.argv[3] ?? join(repo, "build", "characters", species));
  try {
    const pkg = buildPackage(await readSource(species));
    writePackage(pkg, out);
    const pages = pkg.atlas.sets.map((s) => `${s.name}: ${s.pages.map((p) => `${p.width}²`).join(" + ")}`).join(", ");
    console.log(`built ${species} into ${out} (${pkg.files.size} files; pages ${pages})`);
  } catch (error) {
    console.error(`build of ${species} failed:\n${(error as Error).message}`);
    process.exit(1);
  }
}
