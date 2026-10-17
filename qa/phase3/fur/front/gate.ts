// The line gate (DECISIONS 219) on the front, as the build's lint holds it: every front drawing (the rest and its face
// states) wrapped into its bone (drawings.ts), the gate run with the rig and the dog's DECISIONS. The lint composites a
// state by its own name only (ear "lifted" with the temple and head.line at rest), so this script also composites each
// raised-ear face as it is drawn (DECISIONS 221, 222): the ear's state, its temple up and head.line's temple state
// together, under a name of their own (perkedR, liftedL, listening, ...). With --all, every drawing is held as if gated,
// so what the lane has not yet moved shows too. Prints each problem and a count; exits 1 when the gated drawings have
// any (the build would fail).
//
// node qa/phase3/fur/front/gate.ts [--all]
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Rig } from "../../../../runtime-web/src/format.ts";
import { toBone } from "../../../../characters/draw/frame.ts";
import { decisionsOf, gateProblems, lintDrawing } from "../../../../characters/draw/lint.ts";
import { lint as rules } from "../../../../characters/dog/src/drawings.ts";
import { faceStates, front } from "../../../../characters/dog/src/views/front.ts";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const rig = JSON.parse(readFileSync(join(repo, "characters/dog/src/rig.json"), "utf8")) as Rig;
const decisions = decisionsOf(readFileSync(join(repo, "characters/dog/DECISIONS.md"), "utf8"));
const all = process.argv.includes("--all");

const drawn = [...front(), ...faceStates()].map((d) => toBone(d.part, rig, "front", d.piece, d.state));
// Each raised-ear face as it is drawn: the parts' states together, each drawing under the face's own name.
const FACES: Record<string, Record<string, string>> = {
  perkedR: { "ear.R": "onePerked", "temple.R": "up", "head.line": "templeR" },
  perkedL: { "ear.L": "onePerked", "temple.L": "up", "head.line": "templeL" },
  liftedR: { "ear.R": "lifted", "temple.R": "up", "head.line": "templeR" },
  liftedL: { "ear.L": "lifted", "temple.L": "up", "head.line": "templeL" },
  listening: { "ear.L": "lifted", "ear.R": "lifted", "temple.L": "up", "temple.R": "up", "head.line": "temples" },
};
const faces = Object.entries(FACES).flatMap(([face, parts]) => Object.entries(parts).map(([part, state]) => {
  const d = drawn.find((x) => x.region === `${part}/front:${state}`);
  if (!d) throw new Error(`gate: no ${part}/front:${state} drawing`);
  return { ...d, region: `${part}/front:${face}` };
}));
const held = all
  ? drawn.map((d) => (d.meta ? { ...d, meta: { ...d.meta, lines: d.meta.lines.map((l) => ("span" in l && l.span ? { ...l, span: { ...(l.span as object), gate: true } } : l)) } } : d))
  : drawn;
const gated = new Set(drawn.filter((d) => d.meta?.lines.some((l) => "span" in l && (l.span as { gate?: boolean } | undefined)?.gate)).map((d) => d.region));
console.log(`gated: ${[...gated].join(", ") || "none"}`);
console.log(`faces composited as drawn: ${Object.keys(FACES).join(", ")}`);
const problems = [...drawn.flatMap((d) => lintDrawing(d, rules)), ...gateProblems([...held, ...faces] as typeof drawn, { rig, decisions })];
for (const p of problems) console.log(p);
console.log(`${problems.length} problems${all ? " (every drawing held as gated)" : ""}`);
process.exit(problems.length && !all ? 1 : 0);
