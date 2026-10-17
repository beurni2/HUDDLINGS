// The build's lint on today's drawings as drawings.ts's rules hold them (counting only what shows, DECISIONS 264, set
// in every view by DECISIONS 288), per view: what each view's lane would see at its next build. With --faces, also
// each face clip's composite as drawn (the front's face clips; each turned view's perked ears, as recipes2/gate.ts
// composites them).
//
// node qa/phase3/fur/recipes3/gate.ts [--faces]
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Drawing } from "../../../../characters/build/atlas.ts";
import { lint as lintAll } from "../../../../characters/draw/lint.ts";
import { drawings, lint } from "../../../../characters/dog/src/drawings.ts";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const all = drawings();
const viewOf = (d: Drawing) => d.region.split("/")[1]!.split(":")[0]!;

function faces(view: string): Record<string, Record<string, string>> {
  if (view === "front") {
    const out: Record<string, Record<string, string>> = {};
    for (const f of readdirSync(join(repo, "characters/dog/src/clips")).filter((f) => f.startsWith("face_"))) {
      const clip = JSON.parse(readFileSync(join(repo, "characters/dog/src/clips", f), "utf8")) as { name: string; states: Record<string, [number, string][]> };
      out[clip.name] = Object.fromEntries(Object.entries(clip.states).map(([part, keys]) => [part, keys[0]![1]]));
    }
    return out;
  }
  if (view.startsWith("threeQuarter")) return { perkedL: { "ear.L": "onePerked", "head.line": "templeL" }, perkedR: { "ear.R": "onePerked", "head.line": "templeR" } };
  return {};
}

let total = 0;
for (const view of ["front", "threeQuarter.L", "threeQuarter.R", "side.L", "side.R", "back"]) {
  const mine = all.filter((d) => viewOf(d) === view);
  const extra: Drawing[] = [];
  if (process.argv.includes("--faces")) {
    for (const [face, parts] of Object.entries(faces(view))) {
      for (const [part, state] of Object.entries(parts)) {
        const d = mine.find((x) => x.region === `${part}/${view}:${state}`);
        if (d) extra.push({ ...d, region: `${part}/${view}:${face}` });
      }
    }
  }
  const problems = lintAll([...mine, ...extra], lint);
  total += problems.length;
  console.log(`${view}: ${problems.length} problems`);
  for (const p of problems) console.log(`  ${p}`);
}
console.log(`${total} problems in all`);
