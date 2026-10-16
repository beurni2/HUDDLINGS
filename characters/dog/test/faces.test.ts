// Rule R3's guards on the dog's face library (spec section 3, R3; 5b, The face, L440-498): Mochi acts out feelings
// but never suffers, so no face state is named or drawn sad, angry, pouting, teary or drooped. Held here on what the
// front actually draws: every state's name is on the allowlist; no mouth turns down (a lip's ends never below its
// centre, an o symmetric and round at its foot); every brow is an arc that bows upward, its inner end never below its
// outer and within the sheets' own tilt above it; no face clip turns an ear further in than the lowered state or further
// out than the lifted one, only the sleepy face lowers it and only the lifted faces turn it out. Each guard is shown
// failing on a planted fault. Also: the face clips are what presets.ts writes, and the stars draw only beside the
// sparkle eyes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import type { Clip, Rig } from "../../../runtime-web/src/format.ts";
import { validate } from "../../../runtime-web/src/format.ts";
import { regionFor } from "../../../runtime-web/src/rig.ts";
import type { P } from "../../draw/geom.ts";
import { scopeIds } from "../../draw/svg.ts";
import { blushAlpha, clipText, earRot, faceClips, stillOf } from "../src/faceClips.ts";
import { BROW_STATES, brow } from "../src/parts/brow.ts";
import { MOUTH_STATES, mouth, type Mouth } from "../src/parts/mouth.ts";
import { BLUSH_REFERENCE, EAR_ANGLES, EAR_STATES, EYE_STATES, PRESETS, type EarState } from "../src/presets.ts";
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

/** The face's midline across, in the level frame. */
const midline = () => level([faceFrame.frame.at([0, 0])])[0]![0];

/**
 * The mouth guard (R3: never a downturned mouth). A lipped mouth keeps both ends of its lip line (its farthest reach each
 * way across, the curls' tips) at or above the lip's centre, where the philtrum meets it: a frown's ends hang below it,
 * closed or open, however deep the opening under it. A mouth drawn as an opening alone (the o, the yawn) has no corners
 * to hold: it is symmetric about the face's midline, and round at its foot, which hangs below its widest by at least a
 * quarter of its width (the sheets' o: 0.32 on Surprised, 0.5 on Tiny o; a frown's ∩ of an opening has its widest at
 * its foot, 0).
 */
const O_FOOT = 0.25;
function mouthProblem(m: Pick<Mouth, "lip" | "opening">): string | undefined {
  if (m.lip) {
    const pts = level(m.lip.line), [, cy] = level([m.lip.centre])[0]!;
    const left = pts.reduce((a, b) => (b[0] < a[0] ? b : a)), right = pts.reduce((a, b) => (b[0] > a[0] ? b : a));
    for (const [name, end] of [["left", left], ["right", right]] as const) {
      if (end[1] > cy + 1e-9) return `its lip's ${name} end hangs ${(end[1] - cy).toFixed(2)} pt below its centre`;
    }
    return undefined;
  }
  const pts = level(m.opening!), axis = midline();
  // Symmetric: every point's mirror across the midline lies on the edge (the polyline through its samples).
  const toEdge = ([x, y]: P) => Math.min(...pts.map(([ax, ay], i) => {
    const [bx, by] = pts[(i + 1) % pts.length]!, [dx, dy] = [bx - ax, by - ay];
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(x - ax - t * dx, y - ay - t * dy);
  }));
  const off = Math.max(...pts.map(([x, y]) => toEdge([2 * axis - x, y])));
  if (off > 0.25) return `it is lopsided: a point's mirror lies ${off.toFixed(2)} pt off its edge`;
  const xs = pts.map(([x]) => x), ys = pts.map(([, y]) => y);
  const width = Math.max(...xs) - Math.min(...xs), foot = Math.max(...ys);
  const widest = (pts.reduce((a, b) => (b[0] < a[0] ? b : a))[1] + pts.reduce((a, b) => (b[0] > a[0] ? b : a))[1]) / 2;
  if (foot - widest < O_FOOT * width) return `its foot hangs only ${((foot - widest) / width).toFixed(2)} of its width below its widest, a frown's corners`;
  return undefined;
}

/**
 * The brows' tilt on the sheets, measured on all nine expression panels the Faces check holds (DECISIONS 131): each
 * brow's end zones (its outer and inner fifth across) in the panel's own level frame (qa/phase3/faces/brows.py). Every
 * sheet brow has its inner end 1.38 to 2.34 pt higher than its outer, and none has it lower. So the guard is one-sided:
 * the inner end never sits below the outer (an angry slant, R3, and the plan's own rule) and stands no more than the
 * sheets' largest 2.34 pt above it (past it, a worried slant).
 */
const BROW_TILT_PT = 2.34;
/**
 * The least a brow bows up at its middle above its ends' mean. The sheet's brows bow up 0.75 to 1.16 pt, all but the
 * one over Mischievous's wink, a longer stroke on a turned head (−0.51); 0.3 keeps every arc an arc.
 */
const BROW_BOW_PT = 0.3;

/** A brow arc's shape in the face's level frame: how far its inner end stands above its outer, and how far its middle bows up. */
function browShape(arc: P[], sx: 1 | -1): { rise: number; bow: number } {
  const pts = level(arc);
  const xs = pts.map(([x]) => x), lo = Math.min(...xs), hi = Math.max(...xs), span = hi - lo;
  const mean = (keep: (x: number) => boolean) => {
    const ys = pts.filter(([x]) => keep(x)).map(([, y]) => y);
    return ys.reduce((a, b) => a + b, 0) / ys.length;
  };
  const low = mean((x) => x <= lo + 0.2 * span), high = mean((x) => x >= hi - 0.2 * span), middle = mean((x) => Math.abs(x - (lo + hi) / 2) <= 0.15 * span);
  // The inner end is the one nearer the face's middle: the low-x end on the dog's left, the high-x end on its right (y down).
  const [inner, outer] = sx > 0 ? [low, high] : [high, low];
  return { rise: outer - inner, bow: (inner + outer) / 2 - middle };
}

/** The brow guard: an arc bowing up, its inner end at or above its outer and no more than the sheets' tilt above it. `sx` is +1 on the dog's left (the viewer's right). */
function browProblem(arc: P[], sx: 1 | -1): string | undefined {
  const { rise, bow } = browShape(arc, sx);
  if (rise < -1e-9) return `its inner end sits ${(-rise).toFixed(2)} pt below its outer end, an angry slant`;
  if (rise > BROW_TILT_PT) return `its inner end stands ${rise.toFixed(2)} pt above its outer end, past the sheets' ${BROW_TILT_PT} pt, a worried slant`;
  if (bow < BROW_BOW_PT) return `it bows ${bow.toFixed(2)} pt, not up by ${BROW_BOW_PT} pt or more`;
  return undefined;
}

/**
 * The same arc sheared in the face's level frame so its inner end stands `rise` pt above its outer (a planted slant; the
 * rise is linear in the shear, so two measures find it).
 */
function slanted(arc: P[], sx: 1 | -1, rise: number): P[] {
  const a = (faceFrame.rollDeg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  const pts = level(arc), mid = pts.reduce((m, [x]) => m + x / pts.length, 0);
  const shear = (k: number) => pts.map(([x, y]): P => [x, y + k * (x - mid)]).map(([x, y]): P => [x * c - y * s, x * s + y * c]);
  const r0 = browShape(shear(0), sx).rise, r1 = browShape(shear(1), sx).rise;
  return shear((rise - r0) / (r1 - r0));
}

/** How far a key turns an ear in toward the face, in degrees: clockwise is inward for the dog's left ear (on the viewer's right). */
const inward = (ear: "ear.L" | "ear.R", rot: number) => (ear === "ear.L" ? rot : -rot);
const LOWERED = -EAR_ANGLES.lowered, RELAXED = -EAR_ANGLES.relaxed, LIFTED = EAR_ANGLES.lifted;

/**
 * The ear guard on one face clip: no key turns an ear in past the lowered state, and only a lowered face reaches past
 * relaxed; and none turns it out past the lifted state, and only a lifted face turns it out at all. The sheets' drooped
 * ear (Both drooped, R3) hangs lower and splays out, so an outward turn past lifted is the droop's splay, and an inward
 * one past lowered tucks the ear toward going behind the head.
 */
function earProblem(clip: Clip, ears: EarState): string | undefined {
  for (const ear of ["ear.L", "ear.R"] as const) {
    for (const [, rot] of clip.tracks?.[ear]?.rot ?? []) {
      const turn = inward(ear, rot as number);
      if (turn > LOWERED + 1e-9) return `${ear} turns ${turn}° in, past the lowered state's ${LOWERED}°`;
      if (turn > RELAXED + 1e-9 && ears !== "lowered") return `${ear} turns ${turn}° in, past relaxed, in a face the table does not lower`;
      if (-turn > LIFTED + 1e-9) return `${ear} turns ${-turn}° out, past the lifted state's ${LIFTED}°`;
      if (-turn > 1e-9 && ears !== "lifted") return `${ear} turns ${-turn}° out, in a face the table does not lift`;
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
      // The turned views keep their rest mouths (the side's smile, its fallback too); every state is the part's allowed one.
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

test("no mouth turns down: every lip's ends at or above its centre, every o symmetric and round at its foot, as drawn in the front", () => {
  const drawn = new Map([...front(), ...faceStates()].filter((d) => d.part === "mouth").map((d) => [d.state, scopeIds(d.piece.svg, "m")]));
  for (const state of MOUTH_STATES) {
    const m = mouth(state, faceFrame.frame);
    assert.equal(scopeIds(m.piece.svg, "m"), drawn.get(state), `the guarded ${state} mouth is the one the front draws`);
    assert.ok(!!m.lip !== !!m.opening, `the ${state} mouth is lipped or an opening alone`);
    assert.equal(mouthProblem(m), undefined, `the ${state} mouth`);
  }
  const a = (faceFrame.rollDeg * Math.PI) / 180;
  const unlevel = (pts: P[]) => pts.map(([x, y]): P => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)]);
  // Planted: the smile's lip turned upside down about its centre, a closed frown, fails.
  const smile = mouth("smile", faceFrame.frame).lip!;
  const [, sy] = level([smile.centre])[0]!;
  assert.match(mouthProblem({ lip: { line: unlevel(level(smile.line).map(([x, y]) => [x, 2 * sy - y])), centre: smile.centre } }) ?? "", /hangs .* below its centre/);
  // Planted: the open and the laughing mouths' lips with their ends bent down 1 pt below the centre, an open frown, fail.
  // (The first guard measured from halfway down the whole opening, 7.1 pt below the open lip's centre, so a review's
  // probe with the open lip's ends 6.6 pt below its centre passed it.)
  for (const state of ["open", "laugh"] as const) {
    const lip = mouth(state, faceFrame.frame).lip!;
    const pts = level(lip.line), [cx, cy] = level([lip.centre])[0]!;
    const reach = Math.max(...pts.map(([x]) => Math.abs(x - cx)));
    const end = Math.max(...pts.filter(([x]) => Math.abs(Math.abs(x - cx) - reach) < 1e-9).map(([, y]) => y));
    const bent = pts.map(([x, y]): P => [x, y + (cy + 1 - end) * ((x - cx) / reach) ** 4]);
    assert.match(mouthProblem({ lip: { line: unlevel(bent), centre: lip.centre } }) ?? "", /hangs 1\.00 pt below its centre/, `${state} bent down`);
  }
  // Planted: the o cut flat at its widest, a ∩ with its corners at its foot, and the o hung lower on one side, fail.
  const o = level(mouth("o", faceFrame.frame).opening!), axis = midline();
  const wide = (o.reduce((p, q) => (q[0] < p[0] ? q : p))[1] + o.reduce((p, q) => (q[0] > p[0] ? q : p))[1]) / 2;
  assert.match(mouthProblem({ opening: unlevel(o.map(([x, y]): P => [x, Math.min(y, wide)])) }) ?? "", /a frown's corners/, "an o cut flat");
  assert.match(mouthProblem({ opening: unlevel(o.map(([x, y]): P => [x, y + 0.15 * (x - axis)])) }) ?? "", /lopsided/, "an o hung on one side");
});

test("every brow is an arc that bows up, its inner end at or above its outer and within the sheets' tilt, as drawn in the front", () => {
  const drawn = new Map([...front(), ...faceStates()].filter((d) => d.part.startsWith("brow.")).map((d) => [`${d.part}:${d.state ?? "neutral"}`, scopeIds(d.piece.svg, "b")]));
  for (const state of BROW_STATES) {
    for (const [part, sx] of [["brow.L", 1], ["brow.R", -1]] as const) {
      const b = brow(state, sx, faceFrame.frame);
      assert.equal(scopeIds(b.piece.svg, "b"), drawn.get(`${part}:${state}`), `the guarded ${part} ${state} is the one the front draws`);
      assert.equal(browProblem(b.arc, sx), undefined, `${part} ${state}`);
    }
  }
  // Planted on both brows: the inner end 1 pt below the outer (an angry slant inside the sheets' 2.34 pt band, which a
  // symmetric tolerance let through), turned 45° inner end down, and 2.6 pt inner end up (worried) fail; a level brow and
  // one bowed down (knitted) are told apart.
  for (const sx of [1, -1] as const) {
    const neutral = brow("neutral", sx, faceFrame.frame).arc;
    assert.match(browProblem(slanted(neutral, sx, -1), sx) ?? "", /below its outer end, an angry slant/, "inner end 1 pt down");
    assert.match(browProblem(slanted(neutral, sx, -0.2), sx) ?? "", /below its outer end/, "inner end 0.2 pt down");
    assert.match(browProblem(slanted(neutral, sx, 2.6), sx) ?? "", /a worried slant/, "inner end 2.6 pt up");
    assert.equal(browProblem(slanted(neutral, sx, 0), sx), undefined, "a level brow is neither");
    const c = neutral.reduce((s, p) => [s[0] + p[0] / neutral.length, s[1] + p[1] / neutral.length] as P, [0, 0] as P);
    // Turned anticlockwise on screen, the brow on the viewer's right drops its inner end; the one on the left lifts it.
    const turn = (deg: number) => neutral.map(([x, y]): P => {
      const a = (deg * Math.PI) / 180;
      return [c[0] + (x - c[0]) * Math.cos(a) - (y - c[1]) * Math.sin(a), c[1] + (x - c[0]) * Math.sin(a) + (y - c[1]) * Math.cos(a)];
    });
    assert.match(browProblem(turn(-45 * sx), sx) ?? "", /an angry slant/, "turned 45° inner end down");
    // Bowed down with its ends at the neutral's own tilt, so only its bow is wrong.
    const knitted = slanted(neutral.map(([x, y]): P => [x, 2 * c[1] - y]), sx, browShape(neutral, sx).rise);
    assert.match(browProblem(knitted, sx) ?? "", /bows -/, "a brow bowed down");
  }
});

test("no face clip turns an ear in past the lowered state or out past the lifted one, and only sleepy lowers and only the lifted faces lift", () => {
  // The risk designer's measure: ears turned 14 to 18° in disappear behind the head; the bones' limits keep the spec's 14° either way.
  assert.ok(LOWERED > RELAXED && LOWERED < 14, `lowered is ${LOWERED}° in`);
  assert.ok(LIFTED > 0 && LIFTED <= 14, `lifted is ${LIFTED}° out`);
  for (const ear of ["ear.L", "ear.R"]) assert.deepEqual(rig.bones.find((b) => b.name === ear)!.rot, [-14, 14], `${ear}'s limits`);
  for (const clip of faces) {
    const preset = PRESETS[clip.name.slice("face_".length)]!;
    assert.equal(earProblem(clip, preset.ears), undefined, clip.name);
  }
  const lowered = Object.entries(PRESETS).filter(([, p]) => p.ears === "lowered").map(([name]) => name);
  assert.deepEqual(lowered, ["sleepy"], "the table lowers the ears only for sleepy");
  // Planted: an ear drooped in past the lowered state, the lowered ear in a face that is not sleepy, an ear splayed 20°
  // out (Both drooped's splay) in a lifted face, and an ear turned out in a face that is not lifted, fail.
  const happy = faces.find((c) => c.name === "face_happy")!, listening = faces.find((c) => c.name === "face_listening")!;
  const drooped: Clip = { ...happy, tracks: { ...happy.tracks, "ear.R": { rot: [[0, -(LOWERED + 5)]] } } };
  assert.match(earProblem(drooped, "lowered") ?? "", /past the lowered state/);
  const low: Clip = { ...happy, tracks: { ...happy.tracks, "ear.L": { rot: [[0, LOWERED]] } } };
  assert.match(earProblem(low, "neutral") ?? "", /does not lower/);
  const splayed: Clip = { ...listening, tracks: { ...listening.tracks, "ear.L": { rot: [[0, -20]] } } };
  assert.match(earProblem(splayed, "lifted") ?? "", /20° out, past the lifted state/);
  const out: Clip = { ...happy, tracks: { ...happy.tracks, "ear.R": { rot: [[0, 5]] } } };
  assert.match(earProblem(out, "neutral") ?? "", /does not lift/);
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
    // The blush at the preset's level: both cheeks' alpha the level over the reference level they are drawn at
    // (DECISIONS 144); a preset that names none keys none, so the rest alpha keeps the resting level.
    const clip = written.find((c) => c.name === `face_${name}`)!;
    if (p.blush === null) assert.equal(clip.alpha, undefined, `${name} keys no blush`);
    else {
      for (const cheek of ["blush.L", "blush.R"]) {
        assert.deepEqual(clip.alpha?.[cheek], [[0, blushAlpha(p.blush)]], `${name}'s ${cheek}`);
        assert.ok(Math.abs(blushAlpha(p.blush) * BLUSH_REFERENCE - p.blush) < 0.001, `${name}'s ${cheek} draws its level`);
      }
    }
  }
  assert.deepEqual(Object.entries(PRESETS).filter(([, p]) => p.blush !== null && !p.next).map(([n, p]) => [n, p.blush]), [["shy", 0.8], ["blissful", 0.7]]);
});

test("each preset's first panel is its primary in model.json, and its still winks the eye its primary winks", () => {
  // The Faces check holds each preset to the one panel model.json's faceCrops names primary for it (DECISIONS 110);
  // presets.ts lists that panel first, the still is drawn from it, and a wink closes the eye it closes (DECISIONS 141).
  const model = JSON.parse(readFileSync(new URL("../model.json", import.meta.url), "utf8")) as {
    faceCrops: Record<string, { primaryFor: string[]; presets: string[]; drawn: { wink?: string } }>;
  };
  const records = Object.entries(model.faceCrops);
  for (const [name, p] of Object.entries(PRESETS)) {
    if (p.next) continue;
    const primary = records.filter(([, r]) => r.primaryFor.includes(name)).map(([id]) => id);
    assert.deepEqual(primary, [p.crops[0]], `${name}'s first panel is its primary`);
    assert.deepEqual(new Set(p.crops), new Set(records.filter(([, r]) => r.presets.includes(name)).map(([id]) => id)), `${name}'s panels are its records'`);
    const wink = model.faceCrops[p.crops[0]!]!.drawn.wink;
    const s = stillOf(p);
    if (wink) {
      const side = wink.slice(-1) as "L" | "R", other = side === "L" ? "R" : "L";
      assert.equal(s.eyes[side], "wink", `${name} winks ${wink}, as its primary does`);
      assert.equal(s.eyes[other], "open", `${name} keeps its other eye open`);
    } else {
      assert.ok(s.eyes.L !== "wink" && s.eyes.R !== "wink", `${name}'s primary draws no wink`);
    }
  }
  // Planted: the wink on the dog's right eye, as it was, fails against Cheeky.
  const s = stillOf({ ...PRESETS.mischievous!, wink: "R" });
  assert.notEqual(s.eyes.L, "wink");
});

test("every face state draws a region, or a deliberate null, in every view that draws its part", () => {
  // The face clips key only the front, but phase 4 lays head turns over a face, so a state must never fall through to
  // nothing in a turned view: there it draws the view's rest drawing (the turned views' own states are next round's).
  // Of "view:state", "view" and "view:defaultState", the first key present decides (regionFor); none present is the fault.
  const deciding = (part: Rig["parts"][number], view: string, state: string) =>
    [`${view}:${state}`, view, `${view}:${part.defaultState ?? "open"}`].find((key) => Object.hasOwn(part.regions, key));
  for (const [name, states] of Object.entries(ALLOWED)) {
    const part = rig.parts.find((p) => p.name === name)!;
    for (const view of rig.views.filter((v) => Object.keys(part.regions).some((k) => k.split(":")[0] === v))) {
      for (const state of states) assert.ok(deciding(part, view, state), `${name} in ${view} draws nothing for ${state}`);
    }
  }
  // Planted: the side's mouth with only its smile, as it was, draws nothing for the open mouth in a turned head.
  const mouthPart = rig.parts.find((p) => p.name === "mouth")!;
  const smileOnly = { ...mouthPart, regions: Object.fromEntries(Object.entries(mouthPart.regions).filter(([k]) => k !== "side.L")) };
  assert.equal(deciding(smileOnly, "side.L", "open"), undefined);
  assert.equal(regionFor(mouthPart, "side.L", "laugh"), "mouth/side.L:smile");
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
