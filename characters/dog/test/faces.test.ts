// Rule R3's guards on the dog's face library (spec section 3, R3; 5b, The face, L440-498): Mochi acts out feelings
// but never suffers, so no face state is named or drawn sad, angry, pouting, teary or drooped. Held here on what the
// front actually draws: every state's name is on the allowlist; every mouth keeps its corners at or above its middle;
// every brow is an arc that bows upward with its ends level within the sheets' own tilt; no face clip turns an ear
// further in than the lowered state, and only the sleepy face lowers it. Each guard is shown failing on a planted
// fault. Also: the face clips are what presets.ts writes, and the stars draw only beside the sparkle eyes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import type { Clip, Rig } from "../../../runtime-web/src/format.ts";
import { validate } from "../../../runtime-web/src/format.ts";
import { regionFor } from "../../../runtime-web/src/rig.ts";
import type { P } from "../../draw/geom.ts";
import { scopeIds } from "../../draw/svg.ts";
import { clipText, earRot, faceClips, stillOf } from "../src/faceClips.ts";
import { BROW_STATES, brow } from "../src/parts/brow.ts";
import { MOUTH_STATES, mouth } from "../src/parts/mouth.ts";
import { EAR_ANGLES, EAR_STATES, EYE_STATES, PRESETS } from "../src/presets.ts";
import { faceFrame, faceStates, front } from "../src/views/front.ts";

const rig = JSON.parse(readFileSync(new URL("../src/rig.json", import.meta.url), "utf8")) as Rig;
const clipsDir = new URL("../src/clips/", import.meta.url);
const clips = readdirSync(clipsDir).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(new URL(f, clipsDir), "utf8")) as Clip);
const faces = clips.filter((c) => c.name.startsWith("face_"));

/** Names for sorrow and anger, which no face state, part or preset may carry (rule R3). */
const SORROW = /sad|angry|anger|pout|tear|cry|droop|frown|sorrow|sulk|grief/i;
/** The face states each face part may take: the spec's eye, mouth, brow and ear states (L450-472), and the sparkle's stars. */
const ALLOWED: Record<string, readonly string[]> = {
  "eye.L": EYE_STATES, "eye.R": EYE_STATES, mouth: MOUTH_STATES, "brow.L": BROW_STATES, "brow.R": BROW_STATES,
  "ear.L": EAR_STATES, "ear.R": EAR_STATES, stars: ["sparkle"],
};

/** A point list turned into the face's level frame (the front's face is rolled with the head, DECISIONS 27). */
const level = (pts: P[]): P[] => {
  const a = (-faceFrame.rollDeg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return pts.map(([x, y]): P => [x * c - y * s, x * s + y * c]);
};

/**
 * The mouth guard: its corners (its farthest reach each way across: a lip's curled tips, an o's sides) never below its
 * middle (halfway between the top and the foot of what it draws). A frown's ends hang below its middle.
 */
function mouthProblem(outline: P[]): string | undefined {
  const pts = level(outline);
  const ys = pts.map(([, y]) => y);
  const middle = (Math.min(...ys) + Math.max(...ys)) / 2;
  const left = pts.reduce((a, b) => (b[0] < a[0] ? b : a)), right = pts.reduce((a, b) => (b[0] > a[0] ? b : a));
  for (const [name, corner] of [["left", left], ["right", right]] as const) {
    if (corner[1] > middle + 0.05) return `its ${name} corner sits ${(corner[1] - middle).toFixed(2)} pt below its middle`;
  }
  return undefined;
}

/**
 * The brows' tilt on the sheets, measured on all nine expression panels the Faces check holds (DECISIONS 131): each
 * brow's end zones (its outer and inner fifth across) in the panel's own level frame (qa/phase3/faces/brows.py). Every
 * sheet brow has its inner end 1.38 to 2.34 pt higher than its outer; the largest, 2.34 pt (Excited's and Shy's left
 * brows), is the most either end may stand above the other, either way: past it a brow slants, inner end up (worried)
 * or down (angry).
 */
const BROW_TILT_PT = 2.34;
/**
 * The least a brow bows up at its middle above its ends' mean. The sheet's brows bow up 0.75 to 1.16 pt, all but the
 * one over Mischievous's wink, a longer stroke on a turned head (−0.51); 0.3 keeps every arc an arc.
 */
const BROW_BOW_PT = 0.3;

/** The brow guard: an arc bowing up, its ends level within the sheets' tilt. `sx` is +1 on the dog's left (the viewer's right). */
function browProblem(arc: P[], sx: 1 | -1): string | undefined {
  const pts = level(arc);
  const xs = pts.map(([x]) => x), lo = Math.min(...xs), hi = Math.max(...xs), span = hi - lo;
  const mean = (keep: (x: number) => boolean) => {
    const ys = pts.filter(([x]) => keep(x)).map(([, y]) => y);
    return ys.reduce((a, b) => a + b, 0) / ys.length;
  };
  const low = mean((x) => x <= lo + 0.2 * span), high = mean((x) => x >= hi - 0.2 * span), middle = mean((x) => Math.abs(x - (lo + hi) / 2) <= 0.15 * span);
  // The inner end is the one nearer the face's middle: the low-x end on the dog's left, the high-x end on its right.
  const [inner, outer] = sx > 0 ? [low, high] : [high, low];
  if (Math.abs(inner - outer) > BROW_TILT_PT) return `its ${inner < outer ? "inner" : "outer"} end stands ${Math.abs(inner - outer).toFixed(2)} pt above the other, past the sheets' ${BROW_TILT_PT} pt`;
  const bow = (inner + outer) / 2 - middle;
  if (bow < BROW_BOW_PT) return `it bows ${bow.toFixed(2)} pt, not up by ${BROW_BOW_PT} pt or more`;
  return undefined;
}

/** How far a key turns an ear in toward the face, in degrees: clockwise is inward for the dog's left ear (on the viewer's right). */
const inward = (ear: "ear.L" | "ear.R", rot: number) => (ear === "ear.L" ? rot : -rot);
const LOWERED = -EAR_ANGLES.lowered, RELAXED = -EAR_ANGLES.relaxed;

/** The ear guard on one face clip: no key turns an ear in past the lowered state, and only a lowered face reaches past relaxed. */
function earProblem(clip: Clip, lowered: boolean): string | undefined {
  for (const ear of ["ear.L", "ear.R"] as const) {
    for (const [, rot] of clip.tracks?.[ear]?.rot ?? []) {
      const turn = inward(ear, rot as number);
      if (turn > LOWERED + 1e-9) return `${ear} turns ${turn}° in, past the lowered state's ${LOWERED}°`;
      if (turn > RELAXED + 1e-9 && !lowered) return `${ear} turns ${turn}° in, past relaxed, in a face the table does not lower`;
    }
  }
  return undefined;
}

test("every face state is on the allowlist, and no state, part or preset is named for sorrow", () => {
  for (const list of Object.values(ALLOWED)) for (const s of list) assert.ok(!SORROW.test(s), `allowed state ${s}`);
  for (const part of rig.parts) {
    assert.ok(!SORROW.test(part.name), `part ${part.name}`);
    for (const [key, region] of Object.entries(part.regions)) {
      assert.ok(!SORROW.test(key) && !SORROW.test(region ?? ""), `${part.name} ${key}`);
      const state = key.split(":")[1];
      // The turned views keep their rest mouths (the side's smile); every state is the part's allowed one.
      if (state && ALLOWED[part.name]) assert.ok(ALLOWED[part.name]!.includes(state), `${part.name} has a region for ${state}, not an allowed state`);
    }
  }
  for (const clip of clips) {
    for (const [part, keys] of Object.entries(clip.states ?? {})) {
      for (const [, state] of keys) {
        assert.ok(!SORROW.test(String(state)), `${clip.name}: ${part} ${state}`);
        if (ALLOWED[part]) assert.ok(ALLOWED[part]!.includes(String(state)), `${clip.name}: ${part} takes ${state}, not an allowed state`);
      }
    }
  }
  for (const d of faceStates()) {
    assert.ok(ALLOWED[d.part]?.includes(d.state!), `the front draws ${d.part} ${d.state}, not an allowed state`);
  }
  for (const [name, p] of Object.entries(PRESETS)) {
    assert.ok(!SORROW.test(name), `preset ${name}`);
    for (const s of p.eyes) assert.ok(EYE_STATES.includes(s), `${name}: eyes ${s}`);
    for (const s of p.mouth) assert.ok(MOUTH_STATES.includes(s), `${name}: mouth ${s}`);
    assert.ok(EAR_STATES.includes(p.ears), `${name}: ears ${p.ears}`);
  }
  // Planted: a sorrowful state is caught.
  assert.ok(SORROW.test("drooped") && SORROW.test("teary") && SORROW.test("pout") && !EAR_STATES.includes("drooped" as never));
});

test("every mouth keeps its corners at or above its middle, as drawn in the front", () => {
  const drawn = new Map([...front(), ...faceStates()].filter((d) => d.part === "mouth").map((d) => [d.state, scopeIds(d.piece.svg, "m")]));
  for (const state of MOUTH_STATES) {
    const m = mouth(state, faceFrame.frame);
    assert.equal(scopeIds(m.piece.svg, "m"), drawn.get(state), `the guarded ${state} mouth is the one the front draws`);
    assert.equal(mouthProblem(m.outline), undefined, `the ${state} mouth`);
  }
  // Planted: the smile turned upside down, a frown, fails.
  const smile = level(mouth("smile", faceFrame.frame).outline);
  const middle = (Math.min(...smile.map(([, y]) => y)) + Math.max(...smile.map(([, y]) => y))) / 2;
  const a = (faceFrame.rollDeg * Math.PI) / 180;
  const frown = smile.map(([x, y]): P => [x, 2 * middle - y]).map(([x, y]): P => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)]);
  assert.match(mouthProblem(frown) ?? "", /below its middle/);
});

test("every brow is an arc that bows up with its ends level within the sheets' tilt, as drawn in the front", () => {
  const drawn = new Map([...front(), ...faceStates()].filter((d) => d.part.startsWith("brow.")).map((d) => [`${d.part}:${d.state ?? "neutral"}`, scopeIds(d.piece.svg, "b")]));
  for (const state of BROW_STATES) {
    for (const [part, sx] of [["brow.L", 1], ["brow.R", -1]] as const) {
      const b = brow(state, sx, faceFrame.frame);
      assert.equal(scopeIds(b.piece.svg, "b"), drawn.get(`${part}:${state}`), `the guarded ${part} ${state} is the one the front draws`);
      assert.equal(browProblem(b.arc, sx), undefined, `${part} ${state}`);
    }
  }
  // Planted: the neutral brow turned 25° inner end up (worried) or 45° inner end down (angry, past its own 2 pt tilt the
  // other way), and one bowed down (knitted), fail.
  const neutral = brow("neutral", 1, faceFrame.frame).arc;
  const c = neutral.reduce((s, p) => [s[0] + p[0] / neutral.length, s[1] + p[1] / neutral.length] as P, [0, 0] as P);
  const turn = (deg: number) => neutral.map(([x, y]): P => {
    const a = (deg * Math.PI) / 180;
    return [c[0] + (x - c[0]) * Math.cos(a) - (y - c[1]) * Math.sin(a), c[1] + (x - c[0]) * Math.sin(a) + (y - c[1]) * Math.cos(a)];
  });
  // Turned clockwise on screen, the brow on the viewer's right lifts its inner end; anticlockwise, its outer end.
  assert.match(browProblem(turn(25), 1) ?? "", /inner end stands/, "a worried slant");
  assert.match(browProblem(turn(-45), 1) ?? "", /outer end stands/, "an angry slant");
  const knitted = neutral.map(([x, y]): P => [x, 2 * c[1] - y]);
  assert.match(browProblem(knitted, 1) ?? "", /bows/, "a brow bowed down");
});

test("no face clip turns an ear in past the lowered state, only the sleepy face lowers it, and the lowered ear stays in sight", () => {
  // The risk designer's measure: ears turned 14 to 18° in disappear behind the head.
  assert.ok(LOWERED > RELAXED && LOWERED < 14, `lowered is ${LOWERED}° in`);
  assert.ok(EAR_ANGLES.lifted > 0, "lifted turns the ears out");
  for (const clip of faces) {
    const preset = PRESETS[clip.name.slice("face_".length)]!;
    assert.equal(earProblem(clip, preset.ears === "lowered"), undefined, clip.name);
  }
  const lowered = Object.entries(PRESETS).filter(([, p]) => p.ears === "lowered").map(([name]) => name);
  assert.deepEqual(lowered, ["sleepy"], "the table lowers the ears only for sleepy");
  // Planted: an ear drooped past the lowered state, and the lowered ear in a face that is not sleepy, fail.
  const happy = faces.find((c) => c.name === "face_happy")!;
  const drooped: Clip = { ...happy, tracks: { ...happy.tracks, "ear.R": { rot: [[0, -(LOWERED + 5)]] } } };
  assert.match(earProblem(drooped, true) ?? "", /past the lowered state/);
  const low: Clip = { ...happy, tracks: { ...happy.tracks, "ear.L": { rot: [[0, LOWERED]] } } };
  assert.match(earProblem(low, false) ?? "", /does not lower/);
});

test("the face clips are what presets.ts writes: one per preset drawn now, sound, at the frame each primary panel draws", () => {
  // The spec's table (L480-498): 19 presets, of which hungry and huffy are next round's new drawings.
  assert.deepEqual(Object.keys(PRESETS).sort(), ["blissful", "content", "curious", "excited", "happy", "huffy", "hungry", "laughing", "listening", "mischievous",
    "neutral", "proud", "shy", "singing", "sleepy", "sly", "surprised", "tender", "ticklish"]);
  const written = faceClips();
  assert.equal(written.length, 17);
  assert.deepEqual(faces.map((c) => c.name).sort(), written.map((c) => c.name).sort());
  for (const clip of written) assert.equal(readFileSync(new URL(`${clip.name}.json`, clipsDir), "utf8"), clipText(clip), `${clip.name}.json is stale: node characters/dog/src/faceClips.ts`);
  assert.deepEqual(validate(rig, written), []);
  for (const [name, p] of Object.entries(PRESETS)) {
    if (p.next) {
      assert.ok(!faces.some((c) => c.name === `face_${name}`), `${name} is next round's`);
      continue;
    }
    const s = stillOf(p);
    // The still's states are the preset's own (the dog's squeeze and sparkle are its happy crescents, Q2).
    for (const eye of [s.eyes.L, s.eyes.R]) assert.ok(eye === "open" || p.eyes.includes(eye) || (eye === "sparkle" && p.eyes.includes("sparkle")), `${name}: eyes ${eye}`);
    assert.ok(p.mouth.includes(s.mouth), `${name}: mouth ${s.mouth}`);
    assert.ok(p.crops.length > 0, `${name} has a primary panel`);
    for (const ear of ["L", "R"] as const) assert.equal(earRot(ear, s.ears[ear]), (ear === "R" ? 1 : -1) * EAR_ANGLES[s.ears[ear]] + 0);
  }
});

test("the stars draw only beside the sparkle eyes, and every eye state draws its own drawing", () => {
  const stars = rig.parts.find((p) => p.name === "stars")!;
  assert.equal(regionFor(stars, "front", "sparkle"), "stars/front:sparkle");
  for (const state of [undefined, ...EYE_STATES.filter((s) => s !== "sparkle")]) assert.equal(regionFor(stars, "front", state), undefined, `stars in ${state}`);
  for (const view of rig.views.filter((v) => v !== "front")) assert.equal(regionFor(stars, view, "sparkle"), undefined, `stars in ${view}`);
  const eye = rig.parts.find((p) => p.name === "eye.L")!;
  // No closed state falls back to the open eye: each has a region of its own, so nothing of the open eye draws under it.
  for (const state of EYE_STATES) {
    const region = regionFor(eye, "front", state)!;
    assert.ok(region, `eye.L ${state}`);
    if (state !== "open") assert.notEqual(region, "eye.L/front:open", `eye.L ${state} draws the open eye`);
  }
  // The squeeze and the sparkle are the happy crescent (Q2).
  assert.equal(regionFor(eye, "front", "squeeze"), "eye.L/front:happy");
  assert.equal(regionFor(eye, "front", "sparkle"), "eye.L/front:happy");
});
