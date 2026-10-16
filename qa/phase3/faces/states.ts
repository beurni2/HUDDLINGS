// The face states no preset's still shows, each rendered as a front still from a copy of the built package with a
// clip of its own (the package's clips are the presets'): peek, the yawn, the pant, the wink and the perked ear on the
// dog's other side, raised brows over the wide eyes with the o, the half-lid, the sparkle with proud's stars, huffy's
// peek back and hungry's o with its eager eyes; and the raised ears turned to the
// ear springs' limits, 14° out and in, behind a head that stays whole (DECISIONS 158). sheet.py lays them out.
//
// node qa/phase3/faces/states.ts <out folder>     (after node characters/build/build.ts dog)
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { openStills } from "../../../runtime-web/lab/still.ts";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const out = resolve(process.argv[2]!);
const clip = (states: Record<string, string>, turns: Record<string, number> = {}) => ({
  lengthMs: 1000, views: { body: [[0, "front"]], head: [[0, "front"]] },
  states: Object.fromEntries(Object.entries(states).map(([part, state]) => [part, [[0, state]]])),
  tracks: Object.fromEntries(Object.entries(turns).map(([part, rot]) => [part, { rot: [[0, rot]] }])),
  events: [{ at: 0, type: "keyPose" }],
});
/** Both ears lifted, or the dog's left one perked, with their temples and the head's line, turned out (+) or in (−); outward is clockwise for the dog's right ear. */
const lifted = { "ear.L": "lifted", "ear.R": "lifted", "temple.L": "up", "temple.R": "up", "head.line": "temples", mouth: "smile" };
const perkedL = { "ear.L": "onePerked", "temple.L": "up", "head.line": "templeL", mouth: "smile" };
export const STATES: Record<string, ReturnType<typeof clip>> = {
  "peek": clip({ "eye.L": "peek", "eye.R": "peek", mouth: "smile" }),
  "yawn, closed": clip({ "eye.L": "closed", "eye.R": "closed", mouth: "yawn" }),
  "pant": clip({ "eye.L": "happy", "eye.R": "happy", mouth: "pant", "brow.L": "happy", "brow.R": "happy" }),
  "wink R, perked R": clip({ "eye.R": "wink", mouth: "cheeky", "ear.R": "onePerked", "temple.R": "up", "head.line": "templeR" }),
  "lifted L, perked R": clip({ "ear.L": "lifted", "ear.R": "onePerked", "temple.L": "up", "temple.R": "up", "head.line": "temples", mouth: "smile" }),
  "raised, wide, o": clip({ "eye.L": "wide", "eye.R": "wide", mouth: "o", "brow.L": "raised", "brow.R": "raised" }),
  "sleepy half-lid": clip({ "eye.L": "sleepy", "eye.R": "sleepy", mouth: "smile" }),
  // Q2's sparkle, proud's second beat (DECISIONS 203, 205), and huffy's peek back (its preset's peek): no still shows them.
  "sparkle, stars": clip({ "eye.L": "sparkle", "eye.R": "sparkle", stars: "sparkle", mouth: "smile", "brow.L": "happy", "brow.R": "happy" }),
  "huffy's peek back": clip({ "eye.L": "peekBack", "eye.R": "flat", mouth: "tinySmile" }),
  "hungry's o": clip({ "eye.L": "eager", "eye.R": "eager", mouth: "o", "brow.L": "raised", "brow.R": "raised" }),
  "lifted, 14° out": clip(lifted, { "ear.L": -14, "ear.R": 14 }),
  "lifted, 14° in": clip(lifted, { "ear.L": 14, "ear.R": -14 }),
  "perked L, 14° out": clip(perkedL, { "ear.L": -14 }),
  "perked L, 14° in": clip(perkedL, { "ear.L": 14 }),
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
