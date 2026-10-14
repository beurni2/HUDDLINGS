// The look loop (phase 3): builds a species' package, renders each view's still
// (the clip still_<view>) at 3 px/pt into build/stills/<species>/<view>/ and runs
// the sheet match on it into qa/phase3/<view>/, one line per view. With --watch,
// Chromium stays open and the loop runs again on every change to the species'
// source or the drawing kit.
//
// node runtime-web/lab/look.ts <species> <view...> [--watch]
import { spawn } from "node:child_process";
import { existsSync, readFileSync, watch } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { performance } from "node:perf_hooks";
import { openStills } from "./still.ts";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
/** The stills the sheet match reads: the 3x set, one texel per pixel. */
const PPP = 3;

const { values: args, positionals } = parseArgs({ allowPositionals: true, options: { watch: { type: "boolean", default: false } } });
const [species, ...views] = positionals;
if (!species || views.length === 0) {
  console.error("usage: node runtime-web/lab/look.ts <species> <view...> [--watch]");
  process.exit(2);
}

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
function failures(value: unknown, path: string[] = []): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((v, i) => failures(v, [...path, typeof v?.name === "string" ? v.name : String(i)]));
  }
  if (!value || typeof value !== "object") return [];
  const o = value as Record<string, unknown>;
  if (o.gating === false) return [];
  const inner = Object.entries(o).flatMap(([k, v]) => failures(v, [...path, k]));
  return inner.length === 0 && o.pass === false && path.length > 0 ? [path.join(".")] : inner;
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
const packageDir = join(repo, "build", "characters", species);
const landmarks = join(packageDir, "dev", "landmarks.json");
const width = Math.max(...views.map((v) => v.length));
const stills = await openStills(packageDir);

/** One pass of the loop; true when every view's sheet match passes. */
async function loop(): Promise<boolean> {
  const start = performance.now();
  const built = await run(process.execPath, [join(repo, "characters/build/build.ts"), species!]);
  const builtAt = performance.now();
  if (built.code !== 0) {
    console.log(`look ${species}: the build failed (${seconds(builtAt - start)})\n${built.err.trim()}`);
    return false;
  }
  if (!existsSync(landmarks)) console.log(`look ${species}: no dev/landmarks.json in the build, so source landmarks go unchecked`);
  let ok = true;
  try {
    await stills.load(PPP);
  } catch (error) {
    console.log(`look ${species}: ${(error as Error).message}`);
    return false;
  }
  // Stills render one after another in the one page; each match runs as soon as its still is written.
  const matches: Promise<string>[] = [];
  for (const view of views) {
    const still = join(repo, "build", "stills", species!, view);
    const out = join(repo, "qa", "phase3", view);
    const label = view.padEnd(width);
    const t0 = performance.now();
    try {
      await stills.render(`still_${view}`, still);
    } catch (error) {
      ok = false;
      matches.push(Promise.resolve(`  ${label}  ERROR ${(error as Error).message}`));
      continue;
    }
    const t1 = performance.now();
    const argv = [join(repo, "characters/sheetmatch/match.py"), species!, "--still", still, "--out", out, ...(existsSync(landmarks) ? ["--landmarks", landmarks] : [])];
    matches.push(run("python3", argv).then((m) => {
      const t2 = performance.now();
      const times = `still ${seconds(t1 - t0)} · match ${seconds(t2 - t1)} · ${relative(repo, out)}`;
      if (m.code !== 0) ok = false;
      if (m.code === 0) return `  ${label}  pass  ·  ${times}`;
      if (m.code !== 1) return `  ${label}  ERROR match.py exited ${m.code}: ${m.err.trim().split("\n").at(-1) ?? ""}  ·  ${times}`;
      let failed: string[];
      try {
        failed = failures(JSON.parse(readFileSync(join(out, "match.json"), "utf8")));
      } catch (error) {
        failed = [`match.json unreadable (${(error as Error).message})`];
      }
      const shown = failed.length > 4 ? [...failed.slice(0, 4), `${failed.length - 4} more`] : failed;
      return `  ${label}  FAIL ${shown.join(", ") || "(match.json names no failed check)"}  ·  ${times}`;
    }));
  }
  for (const line of matches) console.log(await line);
  console.log(`look ${species}: built in ${seconds(builtAt - start)}, loop ${seconds(performance.now() - start)}`);
  return ok;
}

if (!args.watch) {
  const ok = await loop();
  await stills.close();
  process.exit(ok ? 0 : 1);
}

// Watching: a change starts the loop again after a short pause, and one that
// lands while the loop runs starts it once more when it ends.
const roots = [join(repo, "characters", species, "src"), join(repo, "characters", "draw")].filter((root) => existsSync(root));
let running = false, again = false, timer: NodeJS.Timeout | undefined;
async function kick(): Promise<void> {
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
}
for (const root of roots) {
  watch(root, { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(() => void kick(), 100);
  });
}
// On ctrl-c Playwright closes Chromium itself and exits with 130 (its handleSIGINT).
await kick();
