// The line gate (DECISIONS 219) on the back view, as the build's lint composites it: every drawing of the view wrapped
// in lineGate() (--all, what is left to opt in), or only those the view wraps itself (the build's own verdict). It runs
// the gate twice: as the build's lint runs it (219), and counting a line only where it shows in the composite
// (LintRules.shown, 264), which the build does not set yet; it exits 1 when either finds a problem.
//
// node qa/phase3/fur/back/gate.ts [--all]
import { readFileSync } from "node:fs";
import type { Rig } from "../../../../runtime-web/src/format.ts";
import { decisionsOf, gateProblems, lineGate } from "../../../../characters/draw/lint.ts";
import { back } from "../../../../characters/dog/src/views/back.ts";

const repo = new URL("../../../../", import.meta.url);
const rig = JSON.parse(readFileSync(new URL("characters/dog/src/rig.json", repo), "utf8")) as Rig;
const decisions = decisionsOf(readFileSync(new URL("characters/dog/DECISIONS.md", repo), "utf8"));
const all = process.argv.includes("--all");
const drawn = back();
const drawings = drawn.map(({ part, state, piece }) => ({
  region: `${part}/back${state ? `:${state}` : ""}`, svg: "", anchor: [0, 0] as [number, number], meta: (all ? lineGate(piece) : piece).meta,
}));
const gated = drawn.filter((d) => d.piece.meta.lines.some((l) => (l as { span?: { gate?: boolean } }).span?.gate)).map((d) => d.part);
let found = 0;
for (const shown of [false, true]) {
  const problems = gateProblems(drawings, { rig, decisions, shown });
  found += problems.length;
  console.log(`back${shown ? " (shown, 264)" : ""}: ${all ? "every drawing" : `${gated.length} drawings (${gated.join(", ") || "none"})`} gated, ${problems.length} problems`);
  for (const p of problems) console.log(`  ${p}`);
}
process.exitCode = found ? 1 : 0;
