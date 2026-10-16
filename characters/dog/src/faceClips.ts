// The face clips, written from presets.ts: face_<preset> for each preset drawn now, in the front view (body and head),
// keying each face part's state and the ears' rest angles (presets.ts EAR_ANGLES), at the frame its primary panel
// draws (presets.ts `still`; a sequence's later beats are phase 4's timing). The clips are files the build reads
// (src/clips/), so this writes them and a test holds the files to what it writes:
//   node characters/dog/src/faceClips.ts
import { readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Clip } from "../../../runtime-web/src/format.ts";
import { BLUSH_REFERENCE, EAR_ANGLES, PRESETS, type EarState, type EyeState, type Preset } from "./presets.ts";

/** An ear's rotation for an ear state: outward is clockwise for the dog's right ear (on the viewer's left), anticlockwise for its left. */
export const earRot = (side: "L" | "R", state: EarState) => (side === "R" ? 1 : -1) * EAR_ANGLES[state] + 0;

/**
 * The states and angles a preset's still shows, part by part; with `peek`, huffy's peek back instead (presets.ts
 * `peek`): one eye open to look back, the other still shut, the tiny smile, the cheeks let go.
 */
export function stillOf(p: Preset, peek = false) {
  if (peek && !p.peek) throw new Error("this preset has no peek back");
  const eyes = p.still?.eyes ?? p.eyes[0]!;
  const mouth = peek ? p.peek!.mouth : p.still?.mouth ?? p.mouth[0]!;
  const eye = (side: "L" | "R"): EyeState => (peek ? (side === p.peek!.eye ? "peekBack" : eyes) : p.wink ? (side === p.wink ? eyes : "open") : eyes);
  const ear = (side: "L" | "R"): EarState => (p.ears === "onePerked" ? (side === p.perk ? "onePerked" : "neutral") : p.ears);
  const brow = (side: "L" | "R") => (typeof p.brows === "string" ? p.brows : p.brows[side]);
  const ears = { L: ear("L"), R: ear("R") };
  // An ear raised off its temple (perked or lifted) uncovers the temple, drawn on the head (temple.<side>), and leaves the
  // head's line to the temple's edge on that side (DECISIONS 147).
  const up = (side: "L" | "R") => RAISED.has(ears[side]);
  const headLine = up("L") && up("R") ? "temples" : up("L") ? "templeL" : up("R") ? "templeR" : undefined;
  return {
    eyes: { L: eye("L"), R: eye("R") },
    mouth,
    brows: { L: brow("L"), R: brow("R") },
    ears,
    temples: { L: up("L"), R: up("R") },
    headLine,
    // The sparkle's stars draw only beside the sparkle eyes.
    stars: eyes === "sparkle",
    cheeks: peek ? undefined : p.cheeks,
  };
}

/** The ear states drawn off the temple, whose head's line runs along the temple's edge instead. */
export const RAISED: ReadonlySet<EarState> = new Set(["onePerked", "lifted"]);

export function faceClip(name: string, p: Preset, peek = false): Clip {
  const s = stillOf(p, peek);
  const states: Record<string, [number, string][]> = {
    "eye.L": [[0, s.eyes.L]], "eye.R": [[0, s.eyes.R]], mouth: [[0, s.mouth]],
    "brow.L": [[0, s.brows.L]], "brow.R": [[0, s.brows.R]], "ear.L": [[0, s.ears.L]], "ear.R": [[0, s.ears.R]],
    ...(s.temples.L ? { "temple.L": [[0, "up"]] as [number, string][] } : {}),
    ...(s.temples.R ? { "temple.R": [[0, "up"]] as [number, string][] } : {}),
    ...(s.headLine ? { "head.line": [[0, s.headLine]] as [number, string][] } : {}),
    ...(s.stars ? { stars: [[0, "sparkle"]] as [number, string][] } : {}),
    ...(s.cheeks ? { cheeks: [[0, s.cheeks]] as [number, string][] } : {}),
  };
  // The blush's level where the table names one, as the cheeks' alpha over their drawing at the reference level
  // (DECISIONS 145, 160); elsewhere the parts' rest alpha keeps the resting level.
  const alpha = p.blush === null ? undefined : blushAlpha(p.blush);
  return {
    name: peek ? `face_${name}_peek` : `face_${name}`,
    lengthMs: 1000,
    views: { body: [[0, "front"]], head: [[0, "front"]] },
    states,
    tracks: { "ear.L": { rot: [[0, earRot("L", s.ears.L)]] }, "ear.R": { rot: [[0, earRot("R", s.ears.R)]] } },
    ...(alpha === undefined ? {} : { alpha: { "blush.L": [[0, alpha]], "blush.R": [[0, alpha]] } }),
    events: [{ at: 0, type: "keyPose" }],
  } as Clip;
}

/**
 * A blush level (0 to 1) as the blush parts' alpha: the level over the reference level each view's blush is drawn at.
 * A level past the reference cannot be drawn, so it is refused here rather than written into a clip the format refuses.
 */
export function blushAlpha(level: number): number {
  if (!(level >= 0 && level <= BLUSH_REFERENCE)) throw new Error(`a blush level of ${level} is past the 0 to ${BLUSH_REFERENCE} the blush is drawn to`);
  return Math.round((level / BLUSH_REFERENCE) * 1000) / 1000;
}

/** Every face clip: one per preset. Huffy's peek back is not one: look.ts --faces would take face_huffy_peek for a preset of that name. */
export function faceClips(): Clip[] {
  return Object.entries(PRESETS).map(([name, p]) => faceClip(name, p));
}

/** A value on one line, spaced as the hand-written clips are. */
function compact(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(compact).join(", ")}]`;
  if (v && typeof v === "object") return `{ ${Object.entries(v).map(([k, x]) => `${JSON.stringify(k)}: ${compact(x)}`).join(", ")} }`;
  return JSON.stringify(v);
}

/** A clip's file: one key a line. */
export const clipText = (clip: Clip) => `{\n${Object.entries(clip).map(([k, v]) => `  ${JSON.stringify(k)}: ${compact(v)}`).join(",\n")}\n}\n`;

export const clipsFolder = join(dirname(fileURLToPath(import.meta.url)), "clips");

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const f of readdirSync(clipsFolder)) if (f.startsWith("face_")) rmSync(join(clipsFolder, f));
  const clips = faceClips();
  for (const clip of clips) writeFileSync(join(clipsFolder, `${clip.name}.json`), clipText(clip));
  console.log(`wrote ${clips.length} face clips into ${clipsFolder}`);
}
