// The look loop (phase 3): builds a species' package, renders each view's still
// (the clip still_<view>) at 3 px/pt into build/stills/<species>/<view>/ and runs
// the sheet match on it into qa/phase3/<view>/ (or --qa <folder>/<view>/), one
// line per view. It exits 0 when every view's match passes, 1 when a check
// fails, and 2 when anything errs: the build, a still, or match.py itself (its
// exit 2), which is never read as failed checks. With --watch, Chromium stays
// open and the loop runs again on every change to the species' source or the
// drawing kit.
//
// With --faces it checks every face clip the package holds instead (face_<preset>,
// spec section 5b, The sheet match: Faces): the rest front (still_front) and
// each face clip rendered at 3 px/pt, and facematch.py run on each into
// qa/phase3/faces/<preset>/ (match.json, beside.png), one line per preset: pass
// or fail, how many anchors and shapes its primary panel held, the head, the
// blush's level against the one its preset asks for (build/dev/<species>/
// presets.json, from presets.ts), and "judged by eye" where nothing is held. A package with no face clip says so and
// passes. The exit codes are the views' own.
//
// node runtime-web/lab/look.ts <species> <view...> [--watch] [--qa <folder>] [--cache <folder>]
// node runtime-web/lab/look.ts <species> --faces [--watch] [--qa <folder>] [--cache <folder>]
import { spawn } from "node:child_process";
import { existsSync, readFileSync, rmSync, watch } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { performance } from "node:perf_hooks";
import { openStills, type Stills } from "./still.ts";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
/** The stills the sheet match reads: the 3x set, one texel per pixel. */
const PPP = 3;

/** Runs a command from the repository's root to its end. */
function run(command: string, argv: string[]): Promise<{ code: number; out: string; err: string }> {
  return new Promise((done) => {
    const child = spawn(command, argv, { cwd: repo });
    let out = "", err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => done({ code: -1, out, err: e.message }));
    child.on("close", (code) => done({ code: code ?? -1, out, err }));
  });
}

/**
 * The failed checks in a match.json, whatever its shape: every object with
 * "pass": false that holds no failed check of its own, named by its path (a
 * list's entries by their name). Checks marked "gating": false never count.
 */
export function failures(value: unknown, path: string[] = []): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((v, i) => failures(v, [...path, typeof v?.name === "string" ? v.name : String(i)]));
  }
  if (!value || typeof value !== "object") return [];
  const o = value as Record<string, unknown>;
  if (o.gating === false) return [];
  const inner = Object.entries(o).flatMap(([k, v]) => failures(v, [...path, k]));
  return inner.length === 0 && o.pass === false && path.length > 0 ? [path.join(".")] : inner;
}

export type Verdict = "pass" | "fail" | "error";

/**
 * Runs the sheet match (a command that writes <out>/match.json and exits 0 when
 * every gating check passes, 1 when one fails, 2 on any error) and reads its
 * verdict. The old match.json is deleted first, so a crash can never be read as
 * the last run's checks, and any exit but 0 or 1, or a 1 with no match.json,
 * is an error, never failed checks.
 */
export async function matchVerdict(command: string, argv: string[], out: string): Promise<{ verdict: Verdict; text: string }> {
  const json = join(out, "match.json");
  rmSync(json, { force: true });
  const m = await run(command, argv);
  const said = m.err.trim().split("\n").at(-1) ?? "";
  if (m.code === 0) return { verdict: "pass", text: "pass" };
  if (m.code !== 1) return { verdict: "error", text: `ERROR the sheet match crashed (exit ${m.code}): ${said}` };
  let failed: string[];
  try {
    failed = failures(JSON.parse(readFileSync(json, "utf8")));
  } catch (error) {
    return { verdict: "error", text: `ERROR the sheet match exited 1 but left no readable match.json (${(error as Error).message.split("\n")[0]}): ${said}` };
  }
  const shown = failed.length > 4 ? [...failed.slice(0, 4), `${failed.length - 4} more`] : failed;
  return { verdict: "fail", text: `FAIL ${shown.join(", ") || "(match.json names no failed check)"}` };
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

/** The face presets a built package holds a clip for (clips/face_<preset>.json in its package.json), sorted. */
export function faceClips(packageDir: string): string[] {
  const manifest = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8")) as { files: Record<string, string> };
  return Object.keys(manifest.files).flatMap((file) => /^clips\/face_(.+)\.json$/.exec(file)?.[1] ?? []).sort();
}

/**
 * A preset's line from its Faces check: facematch.py's own summary in match.json
 * (pass or fail, the anchors and shapes held on the primary panel, the head, or
 * "judged by eye"), or the crash, never a stale match.json's.
 */
export function faceLine(preset: string, verdict: Verdict, text: string, out: string): string {
  if (verdict === "error") return `${preset}  ${text}`;
  try {
    const summary = (JSON.parse(readFileSync(join(out, "match.json"), "utf8")) as { summary?: unknown }).summary;
    if (typeof summary === "string") return `${preset}  ${summary}`;
  } catch {
    // matchVerdict has read it already; a summary missing here is reported as the verdict alone
  }
  return `${preset}  ${text}`;
}

export interface FacesOptions {
  packageDir: string;
  /** Where the stills go: <stillsDir>/front for the rest front, <stillsDir>/faces/<preset> for each face. */
  stillsDir: string;
  /** Where each preset's evidence goes: <qa>/faces/<preset>/. */
  qa: string;
  /** The Faces check's command and arguments for one face still, its rest front and its evidence folder. */
  matcher: (still: string, rest: string, out: string) => [string, string[]];
}

/**
 * Every face clip a loaded package holds, against its rest front (still_front):
 * each still rendered, then the Faces check run on it as soon as it is written.
 * The worst verdict among the presets, and one line each; a package with no face
 * clip says so and passes.
 */
export async function lookFaces(stills: Stills, o: FacesOptions): Promise<{ verdict: Verdict; lines: string[] }> {
  const presets = faceClips(o.packageDir);
  if (presets.length === 0) return { verdict: "pass", lines: [`the package holds no face_<preset> clip, so no face is checked`] };
  const rest = join(o.stillsDir, "front");
  try {
    await stills.render("still_front", rest);
  } catch (error) {
    return { verdict: "error", lines: [`the rest front (still_front): ERROR ${(error as Error).message}`] };
  }
  const pad = Math.max(...presets.map((p) => p.length));
  const matches: Promise<{ verdict: Verdict; line: string }>[] = [];
  for (const preset of presets) {
    const still = join(o.stillsDir, "faces", preset);
    const out = join(o.qa, "faces", preset);
    try {
      await stills.render(`face_${preset}`, still);
    } catch (error) {
      matches.push(Promise.resolve({ verdict: "error", line: `${preset.padEnd(pad)}  ERROR ${(error as Error).message}` }));
      continue;
    }
    const [command, argv] = o.matcher(still, rest, out);
    matches.push(matchVerdict(command, argv, out).then(({ verdict, text }) => ({ verdict, line: `${faceLine(preset.padEnd(pad), verdict, text, out)}  ·  ${relative(repo, out)}` })));
  }
  const results = await Promise.all(matches);
  const verdicts = results.map((r) => r.verdict);
  return { verdict: verdicts.includes("error") ? "error" : verdicts.includes("fail") ? "fail" : "pass", lines: results.map((r) => r.line) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values: args, positionals } = parseArgs({
    allowPositionals: true,
    options: { watch: { type: "boolean", default: false }, faces: { type: "boolean", default: false }, qa: { type: "string" }, cache: { type: "string" } },
  });
  const [species, ...views] = positionals;
  if (!species || (views.length === 0) === !args.faces) {
    console.error("usage: node runtime-web/lab/look.ts <species> <view...> [--watch] [--qa <folder>] [--cache <folder>]");
    console.error("       node runtime-web/lab/look.ts <species> --faces [--watch] [--qa <folder>] [--cache <folder>]");
    process.exit(2);
  }
  const qa = resolve(args.qa ?? join(repo, "qa", "phase3"));
  const packageDir = join(repo, "build", "characters", species);
  const landmarks = join(repo, "build", "dev", species, "landmarks.json");
  // The presets' data the build writes from src/presets.ts: each face's blush level, which the Faces check holds.
  const presets = join(repo, "build", "dev", species, "presets.json");
  const width = Math.max(...views.map((v) => v.length));
  const stills = await openStills(packageDir);

  /** One pass of the loop: the worst verdict among the views. */
  const loop = async (): Promise<Verdict> => {
    const start = performance.now();
    const built = await run(process.execPath, [join(repo, "characters/build/build.ts"), species, ...(args.cache ? ["--cache", resolve(args.cache)] : [])]);
    const builtAt = performance.now();
    if (built.code !== 0) {
      console.log(`look ${species}: the build failed (${seconds(builtAt - start)})\n${built.err.trim()}`);
      return "error";
    }
    if (!existsSync(landmarks)) console.log(`look ${species}: no build/dev/${species}/landmarks.json from the build, so source landmarks go unchecked`);
    try {
      await stills.load(PPP);
    } catch (error) {
      console.log(`look ${species}: ${(error as Error).message}`);
      return "error";
    }
    if (args.faces) {
      const matcher = (still: string, rest: string, out: string): [string, string[]] =>
        ["python3", [join(repo, "characters/sheetmatch/facematch.py"), species, "--still", still, "--rest", rest, "--out", out, "--presets", presets]];
      const { verdict, lines } = await lookFaces(stills, { packageDir, stillsDir: join(repo, "build", "stills", species), qa, matcher });
      for (const line of lines) console.log(`  ${line}`);
      console.log(`look ${species}: faces built in ${seconds(builtAt - start)}, loop ${seconds(performance.now() - start)}`);
      return verdict;
    }
    // Stills render one after another in the one page; each match runs as soon as its still is written.
    const matches: Promise<{ verdict: Verdict; line: string }>[] = [];
    for (const view of views) {
      const still = join(repo, "build", "stills", species, view);
      const out = join(qa, view);
      const label = view.padEnd(width);
      const t0 = performance.now();
      try {
        await stills.render(`still_${view}`, still);
      } catch (error) {
        matches.push(Promise.resolve({ verdict: "error", line: `  ${label}  ERROR ${(error as Error).message}` }));
        continue;
      }
      const t1 = performance.now();
      const argv = [join(repo, "characters/sheetmatch/match.py"), species, "--still", still, "--out", out, ...(existsSync(landmarks) ? ["--landmarks", landmarks] : [])];
      matches.push(matchVerdict("python3", argv, out).then(({ verdict, text }) => {
        const times = `still ${seconds(t1 - t0)} · match ${seconds(performance.now() - t1)} · ${relative(repo, out)}`;
        return { verdict, line: `  ${label}  ${text}  ·  ${times}` };
      }));
    }
    const results = await Promise.all(matches);
    for (const { line } of results) console.log(line);
    console.log(`look ${species}: built in ${seconds(builtAt - start)}, loop ${seconds(performance.now() - start)}`);
    const verdicts = results.map((r) => r.verdict);
    return verdicts.includes("error") ? "error" : verdicts.includes("fail") ? "fail" : "pass";
  };

  if (!args.watch) {
    const verdict = await loop();
    await stills.close();
    process.exit({ pass: 0, fail: 1, error: 2 }[verdict]);
  }

  // Watching: a change starts the loop again after a short pause, and one that
  // lands while the loop runs starts it once more when it ends.
  const roots = [join(repo, "characters", species, "src"), join(repo, "characters", "draw")].filter((root) => existsSync(root));
  let running = false, again = false, timer: NodeJS.Timeout | undefined;
  const kick = async (): Promise<void> => {
    if (running) {
      again = true;
      return;
    }
    running = true;
    do {
      again = false;
      await loop();
    } while (again);
    running = false;
    console.log(`watching ${roots.map((root) => relative(repo, root)).join(" and ")}; ctrl-c stops`);
  };
  for (const root of roots) {
    watch(root, { recursive: true }, () => {
      clearTimeout(timer);
      timer = setTimeout(() => void kick(), 100);
    });
  }
  // On ctrl-c Playwright closes Chromium itself and exits with 130 (its handleSIGINT).
  await kick();
}
