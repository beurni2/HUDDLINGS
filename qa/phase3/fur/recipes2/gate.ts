// The line gate counting only what shows (LintRules.shown, DECISIONS 264) on today's six views, against the gate as the
// build runs it: every drawing as drawings.ts wraps it into its bone, each view composited as the build's lint
// composites it (the rest, and each state by its own name), and the faces as they are drawn: the front's every face
// clip (src/clips/face_*.json, each part's state at its first key) and each turned view's perked ears (the ear perked
// with head.line's temple state on that side). Only the drawings each view's lane has gated are held. Writes what the
// gate now finds that it did not, per view, to gate.txt beside this file; with --all, every drawing is held as gated.
//
// node qa/phase3/fur/recipes2/gate.ts [--all]
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Drawing } from "../../../../characters/build/atlas.ts";
import type { Rig } from "../../../../runtime-web/src/format.ts";
import { decisionsOf, gateProblems } from "../../../../characters/draw/lint.ts";
import { drawings } from "../../../../characters/dog/src/drawings.ts";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../../../..");
const rig = JSON.parse(readFileSync(join(repo, "characters/dog/src/rig.json"), "utf8")) as Rig;
const decisions = decisionsOf(readFileSync(join(repo, "characters/dog/DECISIONS.md"), "utf8"));
const all = process.argv.includes("--all");

const drawn = drawings();
const gatedLines = (d: Drawing): Drawing => (d.meta ? { ...d, meta: { ...d.meta, lines: d.meta.lines.map((l) => ("span" in l && l.span ? { ...l, span: { ...(l.span as object), gate: true } } : l)) } } : d);
const held = all ? drawn.map(gatedLines) : drawn;
const viewOf = (d: Drawing) => d.region.split("/")[1]!.split(":")[0]!;

/** The faces as they are drawn: each a set of part states under one name, per view. */
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

const lines: string[] = [
  "# What the line gate finds when it counts only what shows (LintRules.shown, DECISIONS 264) and did not before, per view,",
  "# on the drawings each view's lane has gated: the view as the build composites it (the rest, each state by its own name)",
  "# and the faces as they are drawn (the front's face clips; each turned view's perked ears). Made by:",
  "# node qa/phase3/fur/recipes2/gate.ts" + (all ? " --all (every drawing held as gated)" : ""),
];
let total = 0;
for (const view of ["front", "threeQuarter.L", "threeQuarter.R", "side.L", "side.R", "back"]) {
  const mine = held.filter((d) => viewOf(d) === view);
  const extra: Drawing[] = [];
  for (const [face, parts] of Object.entries(faces(view))) {
    for (const [part, state] of Object.entries(parts)) {
      const d = mine.find((x) => x.region === `${part}/${view}:${state}`);
      // A part whose state is its rest (or a state the view does not draw) is the rest drawing, as the clip draws it.
      if (d) extra.push({ ...d, region: `${part}/${view}:${face}` });
    }
  }
  const rules = { rig, decisions };
  const before = new Set(gateProblems([...mine, ...extra], rules));
  const now = gateProblems([...mine, ...extra], { ...rules, shown: true });
  const fresh = now.filter((p) => !before.has(p));
  total += fresh.length;
  lines.push("", `${view}: ${before.size} problems before, ${now.length} counting only what shows, ${fresh.length} new`);
  for (const p of fresh) lines.push(`  ${p}`);
}
writeFileSync(join(here, all ? "gate-all.txt" : "gate.txt"), `${lines.join("\n")}\n`);
console.log(lines.join("\n"));
console.log(`${total} new problems`);
