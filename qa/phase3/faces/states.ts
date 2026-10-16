// The face states no preset's still shows, each rendered as a front still from a copy of the built package with a
// clip of its own (the package's clips are the presets'): peek, the yawn, the pant, the wink and the perked ear on the
// dog's other side, raised brows over the wide eyes with the o, and the half-lid. sheet.py lays them out.
//
// node qa/phase3/faces/states.ts <out folder>     (after node characters/build/build.ts dog)
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { openStills } from "../../../runtime-web/lab/still.ts";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const out = resolve(process.argv[2]!);
const clip = (states: Record<string, string>) => ({
  lengthMs: 1000, views: { body: [[0, "front"]], head: [[0, "front"]] },
  states: Object.fromEntries(Object.entries(states).map(([part, state]) => [part, [[0, state]]])),
  events: [{ at: 0, type: "keyPose" }],
});
export const STATES: Record<string, ReturnType<typeof clip>> = {
  "peek": clip({ "eye.L": "peek", "eye.R": "peek", mouth: "smile" }),
  "yawn, closed": clip({ "eye.L": "closed", "eye.R": "closed", mouth: "yawn" }),
  "pant": clip({ "eye.L": "happy", "eye.R": "happy", mouth: "pant", "brow.L": "happy", "brow.R": "happy" }),
  "wink R, perked R": clip({ "eye.R": "wink", mouth: "cheeky", "ear.R": "onePerked", "head.line": "templeR" }),
  "lifted L, perked R": clip({ "ear.L": "lifted", "ear.R": "onePerked", "head.line": "temples", mouth: "smile" }),
  "raised, wide, o": clip({ "eye.L": "wide", "eye.R": "wide", mouth: "o", "brow.L": "raised", "brow.R": "raised" }),
  "sleepy half-lid": clip({ "eye.L": "sleepy", "eye.R": "sleepy", mouth: "smile" }),
};
const slug = (name: string) => name.replace(/[^a-z]+/gi, "-");

const pkg = join(out, "package");
rmSync(out, { recursive: true, force: true });
cpSync(join(repo, "build/characters/dog"), pkg, { recursive: true });
const manifest = JSON.parse(readFileSync(join(pkg, "package.json"), "utf8"));
for (const [name, c] of Object.entries(STATES)) {
  const text = JSON.stringify({ name: `state_${slug(name)}`, ...c });
  writeFileSync(join(pkg, "clips", `state_${slug(name)}.json`), text);
  manifest.files[`clips/state_${slug(name)}.json`] = createHash("sha256").update(text).digest("hex");
}
writeFileSync(join(pkg, "package.json"), JSON.stringify(manifest));
const stills = await openStills(pkg);
try {
  await stills.load(3);
  mkdirSync(out, { recursive: true });
  for (const name of Object.keys(STATES)) await stills.render(`state_${slug(name)}`, join(out, slug(name)));
  writeFileSync(join(out, "states.json"), JSON.stringify(Object.keys(STATES).map((name) => ({ name, still: slug(name) }))));
} finally {
  await stills.close();
}
