// The line gate (DECISIONS 219, 264) on the front, as the build's lint holds it and as it counts only what shows: every
// front drawing (the rest and its face states) wrapped into its bone (drawings.ts), the gate run with the rig and the
// dog's DECISIONS, twice: as the build runs it (219, every full-width point of every line counts) and with
// LintRules.shown (264, a line counts only where it shows in the composite). The lint composites a state by its own
// name only (ear "lifted" with the temple and head.line at rest), so this script also composites each face as it is
// drawn: every face clip (src/clips/face_*.json, each part's state at its first key) and the raised-ear faces no clip
// draws yet (perkedR, liftedR, liftedL), each part's state together under the face's own name (DECISIONS 221, 222,
// 267). With --all, every drawing is held as if gated, so what the lane has not yet moved shows too. Prints each
// problem and a count; exits 1 when the gated drawings have any under either gate.
//
// node qa/phase3/fur/front/gate.ts [--all]
import { readdirSync, readFileSync } from "node:fs";
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
// Each face as it is drawn: the parts' states together, each drawing under the face's own name. The clips' own, and the
// raised-ear faces no clip draws yet.
const FACES: Record<string, Record<string, string>> = {
  perkedR: { "ear.R": "onePerked", "temple.R": "up", "head.line": "templeR" },
  liftedR: { "ear.R": "lifted", "temple.R": "up", "head.line": "templeR" },
  liftedL: { "ear.L": "lifted", "temple.L": "up", "head.line": "templeL" },
};
for (const f of readdirSync(join(repo, "characters/dog/src/clips")).filter((f) => f.startsWith("face_")).sort()) {
  const clip = JSON.parse(readFileSync(join(repo, "characters/dog/src/clips", f), "utf8")) as { name: string; states: Record<string, [number, string][]> };
  FACES[clip.name] = Object.fromEntries(Object.entries(clip.states).map(([part, keys]) => [part, keys[0]![1]]));
}
const faces = Object.entries(FACES).flatMap(([face, parts]) => Object.entries(parts).flatMap(([part, state]) => {
  const d = drawn.find((x) => x.region === `${part}/front:${state}`);
  // A part whose state is its rest, or a rotation the clip keys (an ear's "relaxed"), is the rest drawing, as the clip draws it.
  return d ? [{ ...d, region: `${part}/front:${face}` }] : [];
}));
const held = all
  ? drawn.map((d) => (d.meta ? { ...d, meta: { ...d.meta, lines: d.meta.lines.map((l) => ("span" in l && l.span ? { ...l, span: { ...(l.span as object), gate: true } } : l)) } } : d))
  : drawn;
const gated = new Set(drawn.filter((d) => d.meta?.lines.some((l) => "span" in l && (l.span as { gate?: boolean } | undefined)?.gate)).map((d) => d.region));
console.log(`gated: ${[...gated].join(", ") || "none"}`);
console.log(`faces composited as drawn: ${Object.keys(FACES).join(", ")}`);
const lint = drawn.flatMap((d) => lintDrawing(d, rules));
const build = gateProblems([...held, ...faces] as typeof drawn, { rig, decisions });
const shown = gateProblems([...held, ...faces] as typeof drawn, { rig, decisions, shown: true });
for (const p of lint) console.log(`lint: ${p}`);
for (const p of build) console.log(`gate: ${p}`);
for (const p of shown) console.log(`shown: ${p}`);
const count = lint.length + build.length + shown.length;
console.log(`${lint.length} lint, ${build.length} gate (219), ${shown.length} counting only what shows (264): ${count} problems${all ? " (every drawing held as gated)" : ""}`);
process.exit(count && !all ? 1 : 0);
