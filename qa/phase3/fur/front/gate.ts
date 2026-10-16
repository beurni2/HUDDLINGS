// The line gate (DECISIONS 219) on the front, as the build's lint holds it: every front drawing (the rest and its face
// states) wrapped into its bone (drawings.ts), the gate run with the rig and the dog's DECISIONS. With --all, every
// drawing is held as if gated, so what the lane has not yet moved shows too. Prints each problem and a count; exits 1
// when the gated drawings have any (the build would fail).
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
const held = all
  ? drawn.map((d) => (d.meta ? { ...d, meta: { ...d.meta, lines: d.meta.lines.map((l) => ("span" in l && l.span ? { ...l, span: { ...(l.span as object), gate: true } } : l)) } } : d))
  : drawn;
const gated = new Set(drawn.filter((d) => d.meta?.lines.some((l) => "span" in l && (l.span as { gate?: boolean } | undefined)?.gate)).map((d) => d.region));
console.log(`gated: ${[...gated].join(", ") || "none"}`);
const problems = [...drawn.flatMap((d) => lintDrawing(d, rules)), ...gateProblems(held as typeof drawn, { rig, decisions })];
for (const p of problems) console.log(p);
console.log(`${problems.length} problems${all ? " (every drawing held as gated)" : ""}`);
process.exit(problems.length && !all ? 1 : 0);
