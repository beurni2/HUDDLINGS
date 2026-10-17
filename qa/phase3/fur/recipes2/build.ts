// A scratch build of the dog for the fur kit's second round (DECISIONS 260 to 266): the package built from today's
// source with some views drawn by scratch copies of themselves (../recipes/scratch.ts: the view's own source with an
// option's opt-ins patched in as text edits), each view's still rendered by the WebGL runtime at 3 px/pt as the look loop
// renders it, and the sheet match and the line check run on each into <out>/qa/<view>/. The views in
// characters/dog/src/views/ are never touched; the build/ folder is never written (the package goes to <out>/package).
//
// import { scratchBuild } from "./build.ts"; await scratchBuild(out, { front: edits }, ["front"])
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { Drawing } from "../../../../characters/build/atlas.ts";
import { buildPackage, readSource, writePackage } from "../../../../characters/build/build.ts";
import { toBone } from "../../../../characters/draw/frame.ts";
import { lint } from "../../../../characters/draw/lint.ts";
import { repo, scratch, type Edit } from "../recipes/scratch.ts";

type Drawn = { part: string; state?: string; piece: Parameters<typeof toBone>[3] };
type Facing = "L" | "R";

/** The raster cache the main checkout's build keeps (rasters are keyed on what makes them). */
const CACHE = "/home/user/Huddlings/build/cache";

/** Each view's drawings, as drawings.ts lists them, from its module (today's or a scratch copy). */
const LISTS: Record<string, { file: string; draw: (m: Record<string, (...a: unknown[]) => Drawn[]>) => Drawn[] }> = {
  front: { file: "front", draw: (m) => [...m.front!(), ...m.faceStates!()] },
  "threeQuarter.L": { file: "threeQuarter", draw: (m) => [...m.threeQuarter!("L" as Facing), ...m.threeQuarterFaces!("L" as Facing)] },
  "threeQuarter.R": { file: "threeQuarter", draw: (m) => [...m.threeQuarter!("R" as Facing), ...m.threeQuarterFaces!("R" as Facing)] },
  "side.L": { file: "side", draw: (m) => [...m.side!("L" as Facing), ...m.sideFaces!("L" as Facing)] },
  "side.R": { file: "side", draw: (m) => [...m.side!("R" as Facing), ...m.sideFaces!("R" as Facing)] },
  back: { file: "back", draw: (m) => m.back!() },
};

export interface ScratchResult {
  /** What the build's lint finds with the scratch views (it still builds, so the option can be seen). */
  problems: string[];
  /** Each view's match and line check summary lines. */
  lines: string[];
}

/**
 * Builds the package with `edits` patched into each named source file's scratch copy (front, threeQuarter, side,
 * back), renders the stills of `views` and runs the checks on them into `out`.
 */
export async function scratchBuild(out: string, edits: Partial<Record<"front" | "threeQuarter" | "side" | "back", { edits: Edit[]; prelude?: string }>>, views: string[]): Promise<ScratchResult> {
  const source = await readSource("dog");
  const rig = source.rig;
  const modules = new Map<string, Record<string, (...a: unknown[]) => Drawn[]>>();
  for (const [file, e] of Object.entries(edits)) modules.set(file, await scratch(file, e!.edits, e!.prelude ?? ""));
  const replaced = new Set<string>();
  const drawings: Drawing[] = [];
  for (const [view, list] of Object.entries(LISTS)) {
    const m = modules.get(list.file);
    if (!m) continue;
    replaced.add(view);
    drawings.push(...list.draw(m).map((d) => toBone(d.part, rig, view, d.piece, d.state)));
  }
  const kept = source.drawings.filter((d) => !replaced.has(d.region.split("/")[1]!.split(":")[0]!));
  const all = [...kept, ...drawings];
  const problems = lint(all, source.lint);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  // Built without the kit's lint (its structural checks still run) and with the line gate's marks taken off, so an
  // option the lint refuses can still be seen; what the lint finds is reported (`problems`).
  const ungated = all.map((d) => (d.meta ? { ...d, meta: { ...d.meta, lines: d.meta.lines.map((l) => ("span" in l && l.span ? { ...l, span: { ...(l.span as object), gate: false } } : l)) } } : d));
  const pkg = await buildPackage({ ...source, drawings: ungated, lint: { corners: source.lint?.corners } }, { cache: CACHE });
  writePackage(pkg, join(out, "package"));
  const lines: string[] = [];
  const still = spawnSync(process.execPath, [join(repo, "runtime-web/lab/still.ts"), "--package", join(out, "package"), ...views.flatMap((v) => ["--still", `still_${v}`]),
    "--ppp", "3", "--out", join(out, "stills")], { cwd: repo, encoding: "utf8" });
  if (still.status !== 0) throw new Error(`still: ${still.stderr}`);
  for (const view of views) {
    const dir = views.length > 1 ? join(out, "stills", `still_${view}`) : join(out, "stills");
    const qa = join(out, "qa", view);
    const match = spawnSync("python3", [join(repo, "characters/sheetmatch/match.py"), "dog", "--still", dir, "--out", qa], { cwd: repo, encoding: "utf8", env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" } });
    const check = spawnSync("python3", [join(repo, "characters/sheetmatch/linematch.py"), "dog", "--still", dir, "--out", qa], { cwd: repo, encoding: "utf8", env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" } });
    lines.push(`${view}: match ${match.status === 0 ? "pass" : `exit ${match.status}`} ${match.stdout.trim().split("\n").at(-1) ?? ""}`, `${view}: lines ${check.stdout.trim().split("\n").at(-1) ?? ""}`);
  }
  return { problems, lines };
}
