// The founder's eye decisions (docs/QUESTIONS.md Q2, Q26, Q28; DECISIONS 200 to 204), rendered for eyes.py: the
// squeeze, the sparkle and the open eye with its two catchlights, and the states whose catchlights ride the iris
// (peek, huffy's peek back, hungry's eager eye, the half-lid), each on the rest face in the front and the turned views,
// from a copy of the built package with a clip of its own per cell (the package's clips are the presets').
//
// node qa/phase3/faces/eyes.ts <out folder>     (after node characters/build/build.ts dog)
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { openStills } from "../../../runtime-web/lab/still.ts";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const out = resolve(process.argv[2] ?? join(repo, "build/stills/dog/eyes"));
const VIEWS = ["front", "threeQuarter.L", "threeQuarter.R", "side.L", "side.R"] as const;
export const EYES = ["open", "squeeze", "sparkle", "peek", "peekBack", "eager", "sleepy", "wide"] as const;
/** The rest still's states in a view, so each cell changes the eyes alone. */
const rest = (view: string) => {
  const c = JSON.parse(readFileSync(join(repo, `characters/dog/src/clips/still_${view}.json`), "utf8")) as { states?: Record<string, [number, string][]> };
  return Object.fromEntries(Object.entries(c.states ?? {}).map(([p, k]) => [p, k[0]![1]]));
};
const clip = (name: string, view: string, states: Record<string, string>) => ({
  name, lengthMs: 1000, views: { body: [[0, view]], head: [[0, view]] },
  states: Object.fromEntries(Object.entries(states).map(([part, state]) => [part, [[0, state]]])),
  events: [{ at: 0, type: "keyPose" }],
});
const cells = VIEWS.flatMap((view) => EYES.map((eye) => ({ view, eye, name: `eyes_${view.replace(".", "")}_${eye}` })));

const pkg = join(out, "package");
rmSync(out, { recursive: true, force: true });
cpSync(join(repo, "build/characters/dog"), pkg, { recursive: true });
const manifest = JSON.parse(readFileSync(join(pkg, "package.json"), "utf8"));
for (const c of cells) {
  const text = JSON.stringify(clip(c.name, c.view, { ...rest(c.view), "eye.L": c.eye, "eye.R": c.eye }));
  writeFileSync(join(pkg, "clips", `${c.name}.json`), text);
  manifest.files[`clips/${c.name}.json`] = createHash("sha256").update(text).digest("hex");
}
writeFileSync(join(pkg, "package.json"), JSON.stringify(manifest));
const stills = await openStills(pkg);
try {
  await stills.load(3);
  mkdirSync(out, { recursive: true });
  for (const c of cells) await stills.render(c.name, join(out, c.name));
  writeFileSync(join(out, "cells.json"), JSON.stringify(cells));
} finally {
  await stills.close();
}
