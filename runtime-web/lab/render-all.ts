// Phase 1's Visual QA job (spec section 5b): every clip of every built character
// package rendered on WebGL on the fixed clock, as a contact sheet at 8 frames per
// second and an MP4 at 48, so each motion can be looked at. Visual QA's checks join
// in phase 4, each proven by a planted failure (docs/PLAN.md).
//
// node runtime-web/lab/render-all.ts --out build/qa/web
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const { values: args } = parseArgs({ options: { out: { type: "string" } } });
if (!args.out) {
  console.error("usage: node runtime-web/lab/render-all.ts --out <folder>");
  process.exit(2);
}

const built = join(repo, "build", "characters");
const species = existsSync(built) ? readdirSync(built).filter((s) => existsSync(join(built, s, "package.json"))).sort() : [];
if (species.length === 0) {
  console.error(`no packages in ${built}; build one first (npm run build:test-character)`);
  process.exit(1);
}
let failed = 0;
for (const name of species) {
  const manifest = JSON.parse(readFileSync(join(built, name, "package.json"), "utf8")) as { files: Record<string, string> };
  const clips = Object.keys(manifest.files).filter((f) => f.startsWith("clips/")).map((f) => f.slice("clips/".length, -".json".length)).sort();
  for (const clip of clips) {
    // 48 fps with every 6th frame on the sheet: 8 frames per second, as section 5b asks.
    const run = spawnSync(process.execPath, [join(repo, "runtime-web/lab/render.ts"), "--species", name, "--clip", clip,
      "--out", join(args.out, name, clip), "--fps", "48", "--every", "6"], { stdio: "inherit" });
    if (run.status !== 0) {
      console.error(`render-all: ${name}/${clip} failed`);
      failed++;
    }
  }
}
process.exit(failed ? 1 : 0);
