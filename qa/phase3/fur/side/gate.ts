// The line gate (DECISIONS 219) on the side views, as the build's lint runs it: each view's rest drawings and face
// states composited in rig.json's draw order, every drawing this lane has moved onto the fur pass's recipes held by it
// (lineGate); and again counting a line only where it shows in the composite (LintRules.shown, DECISIONS 264), which
// the build's lint does not set yet. With --all, every drawing is held as if it were gated, to list what is left unmoved.
//
// node qa/phase3/fur/side/gate.ts [--all]
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Rig } from "../../../../runtime-web/src/format.ts";
import { decisionsOf, gateProblems, lineGate } from "../../../../characters/draw/lint.ts";
import { side, sideFaces } from "../../../../characters/dog/src/views/side.ts";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const rig = JSON.parse(readFileSync(join(repo, "characters/dog/src/rig.json"), "utf8")) as Rig;
const decisions = decisionsOf(readFileSync(join(repo, "characters/dog/DECISIONS.md"), "utf8"));
const all = process.argv.includes("--all");
let total = 0;
for (const f of ["L", "R"] as const) {
  const view = `side.${f}`;
  const drawn = [...side(f), ...sideFaces(f)];
  const held = drawn.map(({ part, state, piece }) => ({ region: `${part}/${view}${state ? `:${state}` : ""}`, svg: "", anchor: [0, 0] as [number, number],
    meta: (all ? lineGate(piece) : piece).meta }));
  for (const shown of [false, true]) {
    const problems = gateProblems(held, { rig, decisions, shown });
    total += problems.length;
    console.log(`${view}: ${problems.length} problems${shown ? " counting only what shows (264)" : ""}${all ? " (every drawing held)" : ""}`);
    for (const p of problems) console.log(`  ${p}`);
  }
}
process.exit(total ? 1 : 0);
