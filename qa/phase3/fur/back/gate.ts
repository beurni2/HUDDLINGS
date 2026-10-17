// The line gate (DECISIONS 219) on the back view, as the build's lint composites it: every drawing of the view wrapped
// in lineGate() (--all, what is left to opt in), or only those the view wraps itself (the build's own verdict).
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
const problems = gateProblems(drawn.map(({ part, state, piece }) => ({
  region: `${part}/back${state ? `:${state}` : ""}`, svg: "", anchor: [0, 0] as [number, number], meta: (all ? lineGate(piece) : piece).meta,
})), { rig, decisions });
const gated = drawn.filter((d) => d.piece.meta.lines.some((l) => (l as { span?: { gate?: boolean } }).span?.gate)).map((d) => d.part);
console.log(`back: ${all ? "every drawing" : `${gated.length} drawings (${gated.join(", ") || "none"})`} gated, ${problems.length} problems`);
for (const p of problems) console.log(`  ${p}`);
