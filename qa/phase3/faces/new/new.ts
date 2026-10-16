// The new faces for the founder's review at Gate A (spec L496-497, R3; docs/phase3-plan.md section 5, New faces), and
// Q2's alternative eyes, rendered as front stills from a scratch package that never ships: the dog's source built with
// the review-only drawings added (views/front.ts reviewStates: hungry's and huffy's variant B, the dog-style `> <` and
// star eyes), each under a state of its own, and a clip per face. The package's own variant A comes from its own
// clips (face_hungry, face_huffy). Each still is labelled "new drawing" or "not on the dog sheet"; sheet.py lays them
// beside the sheet panels they borrow from.
//
// node qa/phase3/faces/new/new.ts <out folder> [--cache <raster cache>]
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import type { Clip } from "../../../../runtime-web/src/format.ts";
import { openStills } from "../../../../runtime-web/lab/still.ts";
import { buildPackage, readSource, writePackage } from "../../../../characters/build/build.ts";
import { toBone } from "../../../../characters/draw/frame.ts";
import { faceClip } from "../../../../characters/dog/src/faceClips.ts";
import { PRESETS, type Preset } from "../../../../characters/dog/src/presets.ts";
import { reviewStates } from "../../../../characters/dog/src/views/front.ts";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const { values: args, positionals } = parseArgs({ allowPositionals: true, options: { cache: { type: "string" } } });
const out = resolve(positionals[0] ?? join(repo, "build/stills/dog/new"));

/** A face clip with some parts' states changed (a review state, or a beat the package's still does not show). */
function variant(name: string, base: Clip, states: Record<string, string | null>): Clip {
  const s = { ...base.states } as Record<string, [number, string][]>;
  for (const [part, state] of Object.entries(states)) {
    if (state === null) delete s[part];
    else s[part] = [[0, state]];
  }
  return { ...base, name: `review_${name}`, states: s };
}

const hungry = PRESETS.hungry!, huffy = PRESETS.huffy!, ticklish = PRESETS.ticklish!, proud = PRESETS.proud!;
const clip = (name: string, p: Preset, peek = false) => faceClip(name, p, peek);
/** Each still: its clip, its label and what it shows. Variant A is the package's own clip. */
const STILLS: { still: string; clip: Clip; label: string; title: string }[] = [
  { still: "hungry-A", clip: { ...clip("hungry", hungry), name: "review_hungry_A" }, label: "new drawing", title: "hungry A (ships): eager, o.tongue" },
  { still: "hungry-A-o", clip: variant("hungry_A_o", clip("hungry", hungry), { mouth: "o" }), label: "new drawing", title: "hungry A, its first beat: o" },
  { still: "hungry-B", clip: variant("hungry_B", clip("hungry", hungry), { "eye.L": "eagerB", "eye.R": "eagerB", mouth: "o.tongueB" }), label: "new drawing", title: "hungry B: straight out, tongue at the smile's corner" },
  { still: "hungry-B-o", clip: variant("hungry_B_o", clip("hungry", hungry), { "eye.L": "eagerB", "eye.R": "eagerB", mouth: "o" }), label: "new drawing", title: "hungry B, its first beat: o" },
  { still: "huffy-A", clip: { ...clip("huffy", huffy), name: "review_huffy_A" }, label: "new drawing", title: "huffy A (ships): flat lids, pressed, cheeks puffed inside" },
  { still: "huffy-A-peek", clip: { ...clip("huffy", huffy, true), name: "review_huffy_A_peek" }, label: "new drawing", title: "huffy, its peek back: peekBack, tinySmile" },
  // The flush the first drawing keyed: the table names no level for huffy, so the package keeps the resting level
  // (DECISIONS 161) and this one is the founder's to choose.
  { still: "huffy-A-flush", clip: { ...clip("huffy", { ...huffy, blush: 0.6 }), name: "review_huffy_A_flush" }, label: "new drawing", title: "huffy A flushed to 60%, for the founder" },
  { still: "huffy-B", clip: variant("huffy_B", clip("huffy", huffy), { "head.base": "puffed", "head.line": "puffed" }), label: "new drawing", title: "huffy B: the head itself puffed as well" },
  { still: "q2-squeeze-default", clip: { ...clip("ticklish", ticklish), name: "review_q2_squeeze_default" }, label: "Q2 default", title: "squeeze, Q2's default: the happy crescent" },
  { still: "q2-squeeze-alt", clip: variant("q2_squeeze_alt", clip("ticklish", ticklish), { "eye.L": "squeezeAlt", "eye.R": "squeezeAlt" }), label: "not on the dog sheet", title: "squeeze, the alternative: > <" },
  { still: "q2-sparkle-default", clip: { ...clip("proud", proud), name: "review_q2_sparkle_default" }, label: "Q2 default", title: "sparkle, Q2's default: crescents and stars" },
  { still: "q2-sparkle-alt", clip: variant("q2_sparkle_alt", clip("proud", proud), { "eye.L": "sparkleAlt", "eye.R": "sparkleAlt" }), label: "not on the dog sheet", title: "sparkle, the alternative: a star in the eye, and the stars" },
];

const source = await readSource("dog");
// Each review drawing under a state of its own, so one scratch package draws every variant beside the package's own.
for (const d of reviewStates()) {
  const part = source.rig.parts.find((p) => p.name === d.part)!;
  part.regions[`front:${d.state}`] = `${d.part}/front:${d.state}`;
  source.drawings.push(toBone(d.part, source.rig, "front", d.piece, d.state));
}
source.clips.push(...STILLS.map((s) => s.clip));
const pkg = await buildPackage(source, { cache: resolve(args.cache ?? join(repo, "build/cache")) });
rmSync(out, { recursive: true, force: true });
writePackage(pkg, join(out, "package"));
const stills = await openStills(join(out, "package"));
try {
  await stills.load(3);
  mkdirSync(out, { recursive: true });
  for (const s of STILLS) await stills.render(s.clip.name, join(out, s.still));
  writeFileSync(join(out, "new.json"), JSON.stringify(STILLS.map(({ still, label, title }) => ({ still, label, title })), null, 1));
} finally {
  await stills.close();
}
console.log(`rendered ${STILLS.length} review stills into ${out}`);
