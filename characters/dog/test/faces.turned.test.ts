// The face states in the turned views (threeQuarter.L/R, side.L/R; spec L512, docs/phase3-plan.md section 5,
// DECISIONS 170 to 185): every face state of every face part draws its own region in each turned view that draws the
// part, or a deliberate null, and no closed eye falls back to the open one; rule R3's guards hold in every turned view,
// as characters/dog/test/faces.test.ts holds them in front (no mouth turned down, no brow slanted angry or worried,
// nothing named for sorrow, the perked ear never hanging), each shown failing on a planted fault. The .R views' states
// are their .L states mirrored and lit again from the top left (facing.test.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Rig } from "../../../runtime-web/src/format.ts";
import { regionFor } from "../../../runtime-web/src/rig.ts";
import { sample, smooth, v, type P } from "../../draw/geom.ts";
import { BROW_STATES } from "../src/parts/brow.ts";
import { MOUTH_STATES } from "../src/parts/mouth.ts";
import { lidEdge, PROFILE_MOUTHS, TURNED_MOUTHS, turnedMouth, type TurnedEyeLid, type TurnedMouth } from "../src/parts/turned.ts";
import { CHEEK_STATES } from "../src/parts/cheeks.ts";
import { chevronArms, irisCentre, lightOnIris, RIDE, tinyOf, TINY, type Chevron, type EyeSpec } from "../src/parts/eye.ts";
import { LIGHT } from "../../draw/paint.ts";
import { stillOf } from "../src/faceClips.ts";
import { EAR_STATES, EYE_STATES, PRESETS, type EarState } from "../src/presets.ts";
import { sideFace, sideFaces, sideHeld } from "../src/views/side.ts";
import { threeQuarterFace, threeQuarterFaces, threeQuarterHeld } from "../src/views/threeQuarter.ts";
import { swapSides } from "../src/views/facing.ts";

const rig = JSON.parse(readFileSync(new URL("../src/rig.json", import.meta.url), "utf8")) as Rig;
const TURNED = ["threeQuarter.L", "threeQuarter.R", "side.L", "side.R"] as const;
/** Names for sorrow and anger, which no face state, part or preset may carry (rule R3; faces.test.ts's list). */
const SORROW = /sad|angry|anger|pout|tear|cry|droop|frown|sorrow|sulk|grief/i;
/** The face states each face part may take (faces.test.ts's allowlist). */
const ALLOWED: Record<string, readonly string[]> = {
  "eye.L": EYE_STATES, "eye.R": EYE_STATES, mouth: MOUTH_STATES, "brow.L": BROW_STATES, "brow.R": BROW_STATES,
  "ear.L": EAR_STATES, "ear.R": EAR_STATES, stars: ["sparkle"], cheeks: CHEEK_STATES,
  // The head's line beside a raised ear (the front lane's states, named for the dog's side: left, right, both).
  "head.line": ["templeL", "templeR", "temples"],
};
/**
 * The states each face part draws as a drawing of its own in a view; the others are the rest drawing (ears turned by
 * the clip) or its alias (Q2). The three-quarter's mouths are its own list (parts/turned.ts) with its rest; the
 * profile's are drawn but held out of the package for now (sideHeld, DECISIONS 183), so it keys its smile alone.
 */
const TURNED_EYES = ["happy", "squeeze", "closed", "sleepy", "wink", "wide", "peek", "sparkle", "eager", "flat", "peekBack"];
const OWN = (view: string): Record<string, readonly string[]> => ({
  "eye.L": TURNED_EYES, "eye.R": TURNED_EYES,
  mouth: view.startsWith("side") ? ["smile"] : ["open", ...TURNED_MOUTHS],
  "brow.L": ["raised", "happy"], "brow.R": ["raised", "happy"], "ear.L": ["onePerked"], "ear.R": ["onePerked"],
  // The three-quarter's near ear raised uncovers the nape, so its line beside it is its own; the far ear's is the rest.
  ...(view.startsWith("threeQuarter") ? { "head.line": [view.endsWith("L") ? "templeL" : "templeR"] } : {}),
});
const drawsIn = (part: Rig["parts"][number], view: string) => Object.keys(part.regions).some((k) => k.split(":")[0] === view);
const deciding = (part: Rig["parts"][number], view: string, state: string) =>
  [`${view}:${state}`, view, `${view}:${part.defaultState ?? "open"}`].find((key) => Object.hasOwn(part.regions, key));

/** Where a part draws in a view for each state: a problem, or nothing. */
function regionProblem(r: Rig, view: string): string | undefined {
  for (const [name, states] of Object.entries(ALLOWED)) {
    const part = r.parts.find((p) => p.name === name)!;
    if (!drawsIn(part, view)) continue;
    for (const state of states) if (!deciding(part, view, state)) return `${name} in ${view} draws nothing for ${state}`;
    for (const state of OWN(view)[name] ?? []) {
      const region = regionFor(part, view, state);
      if (region !== `${name}/${view}:${state}`) return `${name} in ${view} falls back to ${region ?? "nothing"} for ${state}`;
    }
  }
  return undefined;
}

test("every face state of every face part draws its own region, or a deliberate null, in every turned view that draws the part", () => {
  for (const view of TURNED) assert.equal(regionProblem(rig, view), undefined, view);
  // The eyes the profile hides draw nothing there, in every state; every other state is a drawing of its own, the
  // squeeze and the sparkle (Q2, DECISIONS 202, 203) and hungry's and huffy's eyes (207) among them.
  for (const view of TURNED) {
    for (const eye of ["eye.L", "eye.R"]) {
      const part = rig.parts.find((p) => p.name === eye)!;
      const hidden = view.startsWith("side") && !view.endsWith(eye.slice(-1));
      for (const state of EYE_STATES) {
        const region = regionFor(part, view, state);
        if (hidden) assert.equal(region, undefined, `${eye} draws in ${view}, which hides it`);
        else if (state !== "open") assert.equal(region, `${eye}/${view}:${state}`, `${eye} ${state} in ${view} draws ${region}`);
      }
    }
  }
  // Each turned view's drawings are exactly the regions its keys name.
  const drawings = new Map(TURNED.map((v) => [v, (v.startsWith("side") ? sideFaces : threeQuarterFaces)(v.endsWith("L") ? "L" : "R")]));
  for (const [view, drawn] of drawings) {
    for (const d of drawn) {
      const part = rig.parts.find((p) => p.name === d.part)!;
      assert.ok(ALLOWED[d.part]?.includes(d.state!), `${view} draws ${d.part} ${d.state}, not an allowed state`);
      assert.equal(part.regions[`${view}:${d.state}`], `${d.part}/${view}:${d.state}`, `${view} draws ${d.part} ${d.state} but the rig does not use it`);
    }
  }
  // Planted: the three-quarter's happy crescent key taken out, its near eye falls back to the open eye, under the crescent's place.
  const eyeL = rig.parts.find((p) => p.name === "eye.L")!;
  const planted: Rig = { ...rig, parts: rig.parts.map((p) => (p === eyeL ? { ...p, regions: Object.fromEntries(Object.entries(p.regions).filter(([k]) => k !== "threeQuarter.L:happy")) } : p)) };
  assert.match(regionProblem(planted, "threeQuarter.L") ?? "", /eye\.L in threeQuarter\.L falls back to eye\.L\/threeQuarter\.L:open for happy/);
  // Planted: the three-quarter's laugh taken out falls back to the rest's open mouth.
  const mouth = rig.parts.find((p) => p.name === "mouth")!;
  const noLaugh: Rig = { ...rig, parts: rig.parts.map((p) => (p === mouth ? { ...p, regions: Object.fromEntries(Object.entries(p.regions).filter(([k]) => k !== "threeQuarter.L:laugh")) } : p)) };
  assert.match(regionProblem(noLaugh, "threeQuarter.L") ?? "", /mouth in threeQuarter\.L falls back to mouth\/threeQuarter\.L:open for laugh/);
  // The states held out of the package (DECISIONS 183) are allowed states too, and each view draws each state once.
  for (const view of TURNED) {
    const facingSide = view.endsWith("L") ? "L" : "R";
    const all = [...(view.startsWith("side") ? sideFaces : threeQuarterFaces)(facingSide), ...(view.startsWith("side") ? sideHeld : threeQuarterHeld)(facingSide)];
    for (const d of all) assert.ok(ALLOWED[d.part]?.includes(d.state!), `${view} draws ${d.part} ${d.state}, not an allowed state`);
    const keys = all.map((d) => `${d.part}:${d.state}`);
    assert.equal(new Set(keys).size, keys.length, `${view} draws a state twice`);
  }
});

/**
 * The head.line state a face clip keys beside its ears, by the front lane's rule (p3/faces2's faceClips.ts, DECISIONS
 * 146): an ear raised off its temple, perked or lifted, leaves the line to the temple's edge on its side: templeL,
 * templeR, or temples for both.
 */
const RAISED = new Set(["onePerked", "lifted"]);
const lineState = (ears: { L: string; R: string }) => {
  const [l, r] = [RAISED.has(ears.L), RAISED.has(ears.R)];
  return l && r ? "temples" : l ? "templeL" : r ? "templeR" : undefined;
};
/**
 * A problem with the three-quarter's line beside the ears, for each preset's still: its near-side curve is left out
 * (head.line's temple drawing) only where that view's near ear is perked, the one raised ear a turned view draws off
 * its temple (176). A lifted ear hangs there still (the turned views draw no lifted ear), so leaving the curve out
 * beside it would cut the face's line over the ear.
 */
function templeProblem(r: Rig, presets: [string, { L: EarState; R: EarState }][]): string | undefined {
  const line = r.parts.find((p) => p.name === "head.line")!;
  for (const [name, ears] of presets) {
    for (const [view, near] of [["threeQuarter.L", "L"], ["threeQuarter.R", "R"]] as const) {
      const region = regionFor(line, view, lineState(ears)), perked = ears[near] === "onePerked";
      if (perked !== (region !== `head.line/${view}`)) return `${name} in ${view} (ears ${ears.L}, ${ears.R}) draws ${region}`;
    }
  }
  return undefined;
}

test("a three-quarter view leaves its face's near-side line out only beside its near ear perked, for every preset", () => {
  const presets = Object.entries(PRESETS).map(([name, p]): [string, { L: EarState; R: EarState }] => [name, stillOf(p).ears]);
  assert.equal(templeProblem(rig, presets), undefined);
  // Every lifted preset keys temples (both ears raised), and the perked ones templeL: both are covered.
  assert.ok(presets.some(([, e]) => lineState(e) === "temples") && presets.some(([, e]) => lineState(e) === "templeL"));
  // Planted: temples read as the near ear's line, as this lane first keyed it, cuts the line over a lifted (hanging) ear.
  const line = rig.parts.find((p) => p.name === "head.line")!;
  const keyed: Rig = { ...rig, parts: rig.parts.map((p) => (p === line ? { ...p, regions: { ...p.regions, "threeQuarter.L:temples": "head.line/threeQuarter.L:templeL" } } : p)) };
  assert.match(templeProblem(keyed, presets) ?? "", /in threeQuarter\.L \(ears lifted, lifted\) draws head\.line\/threeQuarter\.L:templeL/);
  // Planted: an ear lifted alone keys its temple by the same name as a perked one; were a preset to lift one ear
  // alone, the guard fails, and the front's names must then tell perked from lifted.
  assert.match(templeProblem(rig, [["one ear lifted", { L: "lifted", R: "neutral" }]]) ?? "", /one ear lifted in threeQuarter\.L/);
});

test("nothing in a turned view is named for sorrow, and every state it draws is on the allowlist", () => {
  for (const part of rig.parts) {
    for (const [key, region] of Object.entries(part.regions)) {
      if (!TURNED.some((v) => key.split(":")[0] === v)) continue;
      assert.ok(!SORROW.test(key) && !SORROW.test(region ?? ""), `${part.name} ${key}`);
    }
  }
  for (const drawn of (["L", "R"] as const).flatMap((s) => [threeQuarterFaces(s), threeQuarterHeld(s), sideFaces(s), sideHeld(s)])) {
    for (const d of drawn) assert.ok(!SORROW.test(d.part) && !SORROW.test(d.state ?? ""), `${d.part} ${d.state}`);
  }
});

/** Points turned into a frame level with the muzzle: undone by its own lean (degrees, clockwise on screen). */
const level = (pts: P[], deg: number): P[] => {
  const a = (-deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return pts.map(([x, y]): P => [x * c - y * s, x * s + y * c]);
};
/** The same points in the other facing: mirrored, the lean mirrored with them. */
const mirror = (pts: P[]): P[] => pts.map(([x, y]): P => [-x, y]);
/**
 * The mouth guard in a turned view (faces.test.ts's), in the muzzle's own level frame (`lv`: how far along its across and
 * its down, parts/turned.ts; the profile's is the screen's). A lipped mouth keeps both ends of its lip line, its
 * farthest reach each way across, at or above where the philtrum meets it (the profile's lip begins at the notch, its
 * centre there, so its one corner holds to it); and each half of it hangs on or below the line from the centre to that
 * half's end, so neither half arches up between them, a pout's (an m of a lip whose ends are level still passes the
 * ends' test alone). A mouth drawn as an opening alone (o, yawn) is symmetric in its own
 * frame (a turned o with each half's shortening undone, a profile o about its own leaning axis) and round at its foot,
 * which hangs below its widest by at least a quarter of its width.
 */
const O_FOOT = 0.25;
const LIP_ARCH_PT = 0.05;
type Level = (p: P) => P;
function mouthProblem(m: Pick<TurnedMouth, "lip" | "opening">, lv: Level): string | undefined {
  if (m.lip) {
    const pts = m.lip.line.map(lv), [, cy] = lv(m.lip.centre);
    const left = pts.reduce((a, b) => (b[0] < a[0] ? b : a)), right = pts.reduce((a, b) => (b[0] > a[0] ? b : a));
    const centre = lv(m.lip.centre);
    for (const [name, end] of [["left", left], ["right", right]] as const) {
      if (end[1] > cy + 1e-9) return `its lip's ${name} end hangs ${(end[1] - cy).toFixed(2)} pt below its centre`;
    }
    for (const [name, end] of [["left", left], ["right", right]] as const) {
      const span = end[0] - centre[0];
      if (Math.abs(span) < 1e-9) continue;
      // How far above its chord each point of this half stands (y down), sampling noise aside (0.05 pt).
      const above = Math.max(0, ...pts.filter(([x]) => (x - centre[0]) / span > 0).map(([x, y]) => centre[1] + ((end[1] - centre[1]) * (x - centre[0])) / span - y));
      if (above > LIP_ARCH_PT) return `its lip's ${name} half arches ${above.toFixed(2)} pt above the line from its centre to its end, a pout`;
    }
    return undefined;
  }
  // In the opening's own frame (`lv`: the turned muzzle's, each half's shortening undone; the profile egg's own axis),
  // symmetric about its middle as the front's is (every point's mirror within 0.25 pt of its edge), and round at its foot.
  const pts = m.opening!.map(lv);
  const toEdge = ([x, y]: P) => Math.min(...pts.map(([ax, ay], i) => {
    const [bx, by] = pts[(i + 1) % pts.length]!, [dx, dy] = [bx - ax, by - ay];
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(x - ax - t * dx, y - ay - t * dy);
  }));
  const off = Math.max(...pts.map(([x, y]) => toEdge([-x, y])));
  if (off > 0.25) return `it is lopsided: a point's mirror lies ${off.toFixed(2)} pt off its edge`;
  const left = pts.reduce((a, b) => (b[0] < a[0] ? b : a)), right = pts.reduce((a, b) => (b[0] > a[0] ? b : a));
  const width = right[0] - left[0], foot = Math.max(...pts.map(([, y]) => y)), widest = (left[1] + right[1]) / 2;
  if (foot - widest < O_FOOT * width) return `its foot hangs only ${((foot - widest) / width).toFixed(2)} of its width below its widest, a frown's corners`;
  return undefined;
}

/** The same level frame in the other facing: the point mirrored back, levelled, and its across mirrored. */
const mirrored = (lv: Level): Level => ([x, y]) => {
  const [s, t] = lv([-x, y]);
  return [-s, t];
};
const screen: Level = (p) => p;
/** A level frame undone: its (across, down) back to model space (it is affine, so three probes give it). */
function unlevel(lv: Level): Level {
  const o = lv([0, 0]), x = v.sub(lv([1, 0]), o), y = v.sub(lv([0, 1]), o), det = x[0] * y[1] - y[0] * x[1];
  return (q) => {
    const [a, b] = v.sub(q, o);
    return [(a * y[1] - y[0] * b) / det, (x[0] * b - a * x[1]) / det];
  };
}

/** Every mouth a turned view draws, with its level frame: its states and its rest. */
function turnedMouths(): { label: string; m: Pick<TurnedMouth, "lip" | "opening">; lv: Level }[] {
  const out: { label: string; m: Pick<TurnedMouth, "lip" | "opening">; lv: Level }[] = [];
  const q = threeQuarterFace;
  for (const state of ["open", ...TURNED_MOUTHS] as const) {
    const f = q.muzzle(LIGHT, state);
    // An opening alone is held in its muzzle's frame with each half's shortening undone.
    const unshortened: Level = (p) => {
      const [x, y] = f.level(p);
      return [x / (x < 0 ? f.k[0] : f.k[1]), y];
    };
    if (state === "o" || state === "yawn") out.push({ label: `threeQuarter ${state}`, m: turnedMouth(state, f, q.nose), lv: unshortened });
    else if (state === "open") out.push({ label: "threeQuarter open (rest)", m: { lip: { line: sample(smooth(q.rest.lip, { closed: false }).segs, 12, false), centre: q.rest.lipCentre } }, lv: f.level });
    else out.push({ label: `threeQuarter ${state}`, m: turnedMouth(state, f, q.nose), lv: f.level });
  }
  for (const state of ["smile", ...PROFILE_MOUTHS] as const) {
    if (state === "smile") out.push({ label: "side smile (rest)", m: { lip: { line: sideFace.rest.smile, centre: sideFace.notch } }, lv: screen });
    else if (state === "o" || state === "yawn") {
      // The profile's egg in its own frame: about its centre, its lean undone.
      const { centre, lean } = sideFace.ovals[state], a = (-lean * Math.PI) / 180;
      const own: Level = ([x, y]) => [(x - centre[0]) * Math.cos(a) - (y - centre[1]) * Math.sin(a), (x - centre[0]) * Math.sin(a) + (y - centre[1]) * Math.cos(a)];
      out.push({ label: `side ${state}`, m: sideFace.mouth(state), lv: own });
    } else out.push({ label: `side ${state}`, m: sideFace.mouth(state), lv: screen });
  }
  return out;
}

test("no turned mouth turns down: every lip's ends at or above its centre, every o even in its own frame and round at its foot, in both facings", () => {
  for (const { label, m, lv } of turnedMouths()) {
    assert.equal(mouthProblem(m, lv), undefined, `${label}.L`);
    const flipped = m.lip ? { lip: { line: mirror(m.lip.line), centre: mirror([m.lip.centre])[0]! } } : { opening: mirror(m.opening!) };
    assert.equal(mouthProblem(flipped, mirrored(lv)), undefined, `${label}.R`);
  }
  const q = threeQuarterFace;
  // Planted: the three-quarter's smile turned over about its centre (in the screen's frame), a closed frown, fails.
  const smile = turnedMouth("smile", q.muzzle(LIGHT, "smile"), q.nose).lip!;
  const lv = q.muzzle(LIGHT, "smile").level;
  assert.match(mouthProblem({ lip: { line: smile.line.map(([x, y]): P => [x, 2 * smile.centre[1] - y]), centre: smile.centre } }, lv) ?? "", /hangs .* below its centre/);
  // Planted: the laugh's far end bent 1 pt below its centre (an open frown on the turned side) fails; the profile's
  // open mouth with its corner bent 1 pt below the notch fails.
  const laughF = q.muzzle(LIGHT, "laugh"), laugh = turnedMouth("laugh", laughF, q.nose).lip!;
  const [, ly] = laughF.level(laugh.centre), far = laugh.line.reduce((a, b) => (laughF.level(b)[0] < laughF.level(a)[0] ? b : a));
  const [fs, fy] = laughF.level(far), [cs] = laughF.level(laugh.centre);
  // Moved straight down the screen until the far end lies 1 pt below the centre in the muzzle's frame, the less the nearer the centre.
  const dy = (ly + 1 - fy) / (laughF.level([far[0], far[1] + 1])[1] - fy);
  const bent = laugh.line.map((p): P => {
    const [s] = laughF.level(p);
    return s < cs ? [p[0], p[1] + dy * ((cs - s) / (cs - fs)) ** 4] : p;
  });
  assert.match(mouthProblem({ lip: { line: bent, centre: laugh.centre } }, laughF.level) ?? "", /left end hangs 1\.00 pt below its centre/);
  const open = sideFace.mouth("open").lip!;
  const back = Math.max(...open.line.map(([x]) => x)), backY = open.line.find(([x]) => x === back)![1];
  const sagged = open.line.map(([x, y]): P => [x, y + (open.centre[1] + 1 - backY) * Math.max(0, (x - open.centre[0]) / (back - open.centre[0])) ** 4]);
  assert.match(mouthProblem({ lip: { line: sagged, centre: open.centre } }, screen) ?? "", /right end hangs 1\.00 pt below its centre/);
  // Planted: the smile's halves arched up into an m, its ends where they were (each half bowing 2.7 pt above its
  // centre, its curl ending level with it), carried onto the muzzle as the smile is: a pout, which the ends' test alone passes.
  const mHalf: P[] = [[0, 14.4], [1.4, 13.2], [3.1, 12.2], [5.1, 11.65], [7.1, 11.75], [8.9, 12.3], [10.4, 13.2], [11.6, 13.9], [12.3, 14.3]];
  const mF = q.muzzle(LIGHT, "smile");
  const mLine = sample(smooth([...mHalf.slice(1).reverse().map(([x, y]): P => [-x, y]), ...mHalf].map(mF.at), { closed: false }).segs, 12, false);
  const mLip = { lip: { line: mLine, centre: mF.at(mHalf[0]!) } };
  assert.match(mouthProblem(mLip, mF.level) ?? "", /half arches .* a pout/);
  assert.match(mouthProblem({ lip: { line: mirror(mLine), centre: mirror([mLip.lip.centre])[0]! } }, mirrored(mF.level)) ?? "", /half arches .* a pout/);
  // Planted: the turned o cut flat at its widest (a frown's corners at its foot), and hung 2 pt lower on one side, fail.
  const oF = q.muzzle(LIGHT, "o"), o = turnedMouth("o", oF, q.nose).opening!;
  const un: Level = (p) => {
    const [x, y] = oF.level(p);
    return [x / (x < 0 ? oF.k[0] : oF.k[1]), y];
  };
  const ol = o.map(un), wide = (ol.reduce((a, b) => (b[0] < a[0] ? b : a))[1] + ol.reduce((a, b) => (b[0] > a[0] ? b : a))[1]) / 2;
  const back2 = unlevel(oF.level);
  const flat = o.map((p): P => {
    const [s, t] = oF.level(p);
    return back2([s, Math.min(t, wide)]);
  });
  assert.match(mouthProblem({ opening: flat }, un) ?? "", /a frown's corners/);
  assert.match(mouthProblem({ opening: o.map((p): P => (oF.level(p)[0] > 0 ? [p[0], p[1] + 2] : p)) }, un) ?? "", /lopsided/);
});

/** The brows' tilt and bow on the sheets (faces.test.ts's, DECISIONS 131). */
const BROW_TILT_PT = 2.34, BROW_BOW_PT = 0.3;
/**
 * A brow's shape in a level frame: how far its inner end (the one toward the nose, `noseward` −1 when the nose lies to
 * its left on screen) stands above its outer end, and how far its middle bows up (each end the mean of its fifth across).
 */
function browShape(arc: P[], noseward: 1 | -1, deg: number): { rise: number; bow: number } {
  const pts = level(arc, deg);
  const xs = pts.map(([x]) => x), lo = Math.min(...xs), hi = Math.max(...xs), span = hi - lo;
  const mean = (keep: (x: number) => boolean) => {
    const ys = pts.filter(([x]) => keep(x)).map(([, y]) => y);
    return ys.reduce((a, b) => a + b, 0) / ys.length;
  };
  // A turned brow is a short dab of 4 or 5 nodes: each end is its fifth across, or its end node where that holds none.
  const low = mean((x) => x <= lo + 0.2 * span), high = mean((x) => x >= hi - 0.2 * span), middle = mean((x) => Math.abs(x - (lo + hi) / 2) <= 0.25 * span);
  const [inner, outer] = noseward < 0 ? [low, high] : [high, low];
  return { rise: outer - inner, bow: (inner + outer) / 2 - middle };
}
function browProblem(arc: P[], noseward: 1 | -1, deg: number): string | undefined {
  const { rise, bow } = browShape(arc, noseward, deg);
  if (rise < -1e-9) return `its inner end sits ${(-rise).toFixed(2)} pt below its outer end, an angry slant`;
  if (rise > BROW_TILT_PT) return `its inner end stands ${rise.toFixed(2)} pt above its outer end, past the sheets' ${BROW_TILT_PT} pt, a worried slant`;
  if (bow < BROW_BOW_PT) return `it bows ${bow.toFixed(2)} pt, not up by ${BROW_BOW_PT} pt or more`;
  return undefined;
}

test("every turned brow bows up, its inner end at or above its outer and within the sheets' tilt, in both facings", () => {
  const brows: { label: string; arc: P[]; noseward: 1 | -1; deg: number }[] = [];
  for (const state of BROW_STATES) {
    const q = threeQuarterFace.brows(state);
    // The near brow's nose lies to its left; the far brow's to its right (threeQuarter.ts EYES' noseward).
    brows.push({ label: `threeQuarter brow.L ${state}`, arc: q.L, noseward: -1, deg: threeQuarterFace.levelDeg });
    brows.push({ label: `threeQuarter brow.R ${state}`, arc: q.R, noseward: 1, deg: threeQuarterFace.levelDeg });
    brows.push({ label: `side brow.L ${state}`, arc: sideFace.brow(state), noseward: -1, deg: sideFace.levelDeg });
  }
  for (const { label, arc, noseward, deg } of brows) {
    assert.equal(browProblem(arc, noseward, deg), undefined, `${label} (.L)`);
    assert.equal(browProblem(mirror(arc), (-noseward) as 1 | -1, -deg), undefined, `${swapSides(label)} (.R)`);
  }
  // Planted on the near brow: its inner end turned 1 pt below its outer (angry), 2.6 pt above it (worried), and bowed down, fail.
  const near = threeQuarterFace.brows("neutral").L, deg = threeQuarterFace.levelDeg;
  const shear = (k: number) => level(level(near, deg).map(([x, y], i, a): P => [x, y + k * (x - a[0]![0])]), -deg);
  const at = (rise: number) => {
    const r0 = browShape(shear(0), -1, deg).rise, r1 = browShape(shear(1), -1, deg).rise;
    return shear((rise - r0) / (r1 - r0));
  };
  assert.match(browProblem(at(-1), -1, deg) ?? "", /an angry slant/);
  assert.match(browProblem(at(2.6), -1, deg) ?? "", /a worried slant/);
  const c = near.reduce((s, p) => [s[0] + p[0] / near.length, s[1] + p[1] / near.length] as P, [0, 0] as P);
  assert.match(browProblem(near.map(([x, y]): P => [x, 2 * c[1] - y]), -1, deg) ?? "", /bows -|angry|worried/);
});

/**
 * How far a closing lid may lean from the face's level, either way: the sheets' bands lie within 4.5° of it (Happy
 * crescent's outer end hangs 1 pt over 17.6, Winking's lifts 1.4), a turned one a few degrees more as its view leans
 * it; the Angry and Sad (teary) lids lean far past this.
 */
const LID_LEAN_DEG = 10;
/**
 * A closing lid's lean in a level frame (`deg`, the face's level, clockwise on screen): the angle of the line from its
 * inner end (the nose's side) to its outer end, positive with the outer end lower. A lash band's ends are its own
 * (parts/eye.ts LidBand: `width` across from the inner end to the outer, the outer `drop` lower, turned by `tilt`); a
 * half-lid's are its edge's (parts/turned.ts lidEdge).
 */
function lidLean(l: TurnedEyeLid, deg: number, mirrored = false): number {
  let d: P;
  if ("band" in l) {
    const { width, drop, tilt, noseward } = l.band, t = (tilt * Math.PI) / 180, out = -noseward;
    d = [out * width * Math.cos(t) - drop * Math.sin(t), out * width * Math.sin(t) + drop * Math.cos(t)];
  } else {
    const edge = lidEdge(l.spec, l.lid);
    d = v.sub(edge.at(-1)!, edge[0]!);
  }
  // In the other facing the lid is mirrored, and its level with it.
  const [x, y] = level([mirrored ? [-d[0], d[1]] : d], mirrored ? -deg : deg)[0]!;
  return (Math.atan2(y, Math.abs(x)) * 180) / Math.PI;
}
function lidProblem(l: TurnedEyeLid, deg: number, mirrored = false): string | undefined {
  const lean = lidLean(l, deg, mirrored);
  if (lean < -LID_LEAN_DEG) return `its nose's end sits ${(-lean).toFixed(1)}° below its outer end, an angry slant`;
  if (lean > LID_LEAN_DEG) return `its outer end droops ${lean.toFixed(1)}°, a sad slant`;
  return undefined;
}

test("no turned lid slants angry or droops sad: every crescent, closed lid, wink and half-lid lies near the face's level, in both facings", () => {
  const LIDS = ["happy", "closed", "wink", "sleepy", "flat"] as const;
  const lids: { label: string; lid: TurnedEyeLid; deg: number }[] = [];
  for (const state of LIDS) {
    for (const side of ["L", "R"] as const) lids.push({ label: `threeQuarter eye.${side} ${state}`, lid: threeQuarterFace.lids(state, side), deg: threeQuarterFace.levelDeg });
    lids.push({ label: `side eye.L ${state}`, lid: sideFace.lids(state), deg: sideFace.levelDeg });
  }
  for (const { label, lid, deg } of lids) {
    assert.equal(lidProblem(lid, deg), undefined, `${label} (.L)`);
    assert.equal(lidProblem(lid, deg, true), undefined, `${swapSides(label)} (.R)`);
  }
  // Planted: every three-quarter lid turned to -25° (on screen, anticlockwise): the near eye's runs down toward its
  // nose (angry) and the far eye's droops outward (sad); both fail, banded and half-lidded.
  const turned = (l: TurnedEyeLid): TurnedEyeLid => ("band" in l ? { band: { ...l.band, tilt: -25 } } : { spec: l.spec, lid: { ...l.lid, tilt: -25 } });
  const deg = threeQuarterFace.levelDeg;
  for (const state of LIDS) {
    assert.match(lidProblem(turned(threeQuarterFace.lids(state, "L")), deg) ?? "", /an angry slant/, `near ${state} at -25°`);
    assert.match(lidProblem(turned(threeQuarterFace.lids(state, "R")), deg) ?? "", /a sad slant/, `far ${state} at -25°`);
  }
});

test("the one perked ear stands above the eyes in every turned view, never hanging as the sheets' drooped ears do", () => {
  // The perked ear flips up over the crown (DECISIONS 133): all of it lies above the eyes' tops. A drooped ear (R3)
  // hangs down past them.
  const eyeTop = (e: { centre: P; ry: number }) => e.centre[1] - e.ry;
  const views: [string, { segs: [P, P, P, P][] }, number][] = [
    ["threeQuarter ear.L", threeQuarterFace.perked.L, Math.min(eyeTop(threeQuarterFace.eyes.L), eyeTop(threeQuarterFace.eyes.R))],
    ["threeQuarter ear.R", threeQuarterFace.perked.R, Math.min(eyeTop(threeQuarterFace.eyes.L), eyeTop(threeQuarterFace.eyes.R))],
    ["side ear.L", sideFace.perked.L, eyeTop(sideFace.eye)],
  ];
  for (const [label, shape, top] of views) {
    const lowest = Math.max(...sample(shape.segs, 16, true).map(([, y]) => y));
    assert.ok(lowest < top - 10, `${label}: its lowest point (y ${lowest.toFixed(1)}) is not well above the eyes' tops (y ${top.toFixed(1)})`);
    // Planted: the same ear hung 40 pt lower, as a drooped one, fails.
    const hung = Math.max(...sample(shape.segs, 16, true).map(([, y]) => y + 40));
    assert.ok(!(hung < top - 10), `${label}: hung lower, it would pass`);
  }
});

/**
 * Huffy's shut lids lie level in the face's own frame in every turned view, as the front's do (faces.test.ts): their
 * ends within 0.5 pt of each other across the face's level (DECISIONS 207), where the crescents lean 2.5° outward.
 */
type LidBandLike = Extract<TurnedEyeLid, { band: unknown }>["band"];
function flatProblem(l: TurnedEyeLid, deg: number): string | undefined {
  if (!("band" in l)) return "it is not a lash band";
  const { width, drop, tilt, noseward } = l.band, t = (tilt * Math.PI) / 180, out = -noseward;
  const d: P = [out * width * Math.cos(t) - drop * Math.sin(t), out * width * Math.sin(t) + drop * Math.cos(t)];
  const [, y] = level([d], deg)[0]!;
  return Math.abs(y) > 0.5 ? `its ends lie ${Math.abs(y).toFixed(2)} pt apart across the face's level` : undefined;
}

test("huffy's shut lids lie level in every turned view, and a slanted one fails", () => {
  // The .R facing is the .L lid mirrored, and its level with it: the same measure.
  for (const side of ["L", "R"] as const) assert.equal(flatProblem(threeQuarterFace.lids("flat", side), threeQuarterFace.levelDeg), undefined, `threeQuarter eye.${side}`);
  assert.equal(flatProblem(sideFace.lids("flat"), sideFace.levelDeg), undefined, "side eye.L");
  // Planted: the near flat lid turned 5° more, and its outer end dropped 1.2 pt; each fails.
  const near = (threeQuarterFace.lids("flat", "L") as { band: LidBandLike }).band;
  assert.match(flatProblem({ band: { ...near, tilt: near.tilt + 5 } }, threeQuarterFace.levelDeg) ?? "", /apart across the face's level/);
  assert.match(flatProblem({ band: { ...near, drop: 1.2 } }, threeQuarterFace.levelDeg) ?? "", /apart across the face's level/);
});

/**
 * The squeeze guard in the turned views (faces.test.ts's): each `>` `<` in its own frame (its lean undone, and its run
 * across stretched back by its eye's width over the front's, 9.5 pt, so the far and the profile eye's foreshortening is
 * undone) opens outward as the sister sheets' Excited draw it, its upper arm rising 4 to 20°, its lower falling 15 to
 * 35°, the opening's middle falling outward by 0 to 12°; and its lean lies within 10° of the face's level.
 */
function squeezeProblem(c: Chevron, levelDeg: number, k: number): string | undefined {
  if (Math.abs(c.tilt - levelDeg) > LID_LEAN_DEG) return `it leans ${(c.tilt - levelDeg).toFixed(1)}° from the face's level`;
  const [upper, lower] = chevronArms(c);
  const t = (-c.tilt * Math.PI) / 180, out = -c.noseward;
  const angle = (arm: P[]) => {
    const [x, y] = [arm.at(-1)![0] - arm[0]![0], arm.at(-1)![1] - arm[0]![1]];
    const [lx, ly] = [(x * Math.cos(t) - y * Math.sin(t)) / k, x * Math.sin(t) + y * Math.cos(t)];
    return out * lx <= 0 ? NaN : (Math.atan2(ly, Math.abs(lx)) * 180) / Math.PI;
  };
  const [up, down] = [-angle(upper), angle(lower)];
  if (!(up >= 4 && up <= 20)) return `its upper arm rises ${up.toFixed(1)}° outward, outside 4 to 20°`;
  if (!(down >= 15 && down <= 35)) return `its lower arm falls ${down.toFixed(1)}° outward, outside 15 to 35°`;
  const mid = (down - up) / 2;
  return mid >= 0 && mid <= 12 ? undefined : `its opening's middle falls ${mid.toFixed(1)}° outward, outside 0 to 12°`;
}

test("the squeeze never slants angry in a turned view: its arms open outward as the sister sheets' Excited draw them", () => {
  const front = 9.5;
  for (const side of ["L", "R"] as const) {
    assert.equal(squeezeProblem(threeQuarterFace.squeeze(side), threeQuarterFace.levelDeg, threeQuarterFace.eyes[side].rx / front), undefined, `threeQuarter eye.${side}`);
  }
  assert.equal(squeezeProblem(sideFace.squeeze(), sideFace.levelDeg, sideFace.eye.rx / front), undefined, "side eye.L");
  // Planted: the near squeeze's upper arm steepened to a frowning 30°, and the whole leant 15° off the face's level.
  const near = threeQuarterFace.squeeze("L");
  assert.match(squeezeProblem({ ...near, angle: [30, 40] }, threeQuarterFace.levelDeg, 1) ?? "", /upper arm rises/);
  assert.match(squeezeProblem({ ...near, tilt: 22.5 }, threeQuarterFace.levelDeg, 1) ?? "", /leans 15\.0°/);
});

/**
 * Where a turned eye looks (faces.test.ts's gaze guard): its iris's middle against the opening's, in the face's level
 * frame, y down. The new faces' open eyes (hungry's eager eye, huffy's peek back) never look up past the rest eye's,
 * within 0.25 pt (R3: looking up at the viewer would plead).
 */
const GAZE_UP_PT = 0.25;
function irisDown(e: EyeSpec, levelDeg: number): number {
  const [u, up] = irisCentre(e), a = (e.turn * Math.PI) / 180;
  const d: P = [e.noseward * u * Math.cos(a) + up * Math.sin(a), e.noseward * u * Math.sin(a) - up * Math.cos(a)];
  return level([d], levelDeg)[0]![1];
}

test("the new faces' open eyes never look up in a turned view: hungry's eager eye and huffy's peek back", () => {
  const eyes: [string, (s: "open" | "eager" | "peekBack") => EyeSpec, number][] = [
    ["threeQuarter eye.L", (s) => threeQuarterFace.spec(s, "L"), threeQuarterFace.levelDeg],
    ["threeQuarter eye.R", (s) => threeQuarterFace.spec(s, "R"), threeQuarterFace.levelDeg],
    ["side eye.L", (s) => sideFace.spec(s), sideFace.levelDeg],
  ];
  for (const [label, spec, deg] of eyes) {
    const rest = irisDown(spec("open"), deg);
    for (const state of ["eager", "peekBack"] as const) {
      const up = rest - irisDown(spec(state), deg);
      assert.ok(up <= GAZE_UP_PT, `${label} ${state}: its iris stands ${up.toFixed(2)} pt higher than the rest eye's, looking up`);
    }
  }
  // Planted: the near eager eye's white rolled under its iris (the iris rolled up) fails.
  const eager = threeQuarterFace.spec("eager", "L");
  const rolled = irisDown(threeQuarterFace.spec("open", "L"), threeQuarterFace.levelDeg) - irisDown({ ...eager, white: { at: -90, width: 3, span: 70 } }, threeQuarterFace.levelDeg);
  assert.ok(rolled > GAZE_UP_PT, `the near eager eye rolled up stands only ${rolled.toFixed(2)} pt higher`);
});

/**
 * The catchlights in the turned views (Q26, Q28; DECISIONS 201, 204), as faces.test.ts holds the front's: every eye
 * that shows its iris paints its large catchlight and a tiny one a quarter its size below it, both wholly on the dark
 * iris; under the half-lid, what shows below the lid lies on the iris and some of each shows; where the iris looks
 * aside the large one has moved about half the iris's travel.
 */
test("every turned eye that shows its iris has its large and its tiny catchlight on the dark iris, riding it at half its travel", () => {
  const eyes: [string, (s: "open" | "wide" | "peek" | "sparkle" | "eager" | "peekBack") => EyeSpec, TurnedEyeLid][] = [
    ["threeQuarter eye.L", (s) => threeQuarterFace.spec(s, "L"), threeQuarterFace.lids("sleepy", "L")],
    ["threeQuarter eye.R", (s) => threeQuarterFace.spec(s, "R"), threeQuarterFace.lids("sleepy", "R")],
    ["side eye.L", (s) => sideFace.spec(s), sideFace.lids("sleepy")],
  ];
  for (const [label, spec, half] of eyes) {
    for (const state of ["open", "wide", "peek", "sparkle", "eager", "peekBack"] as const) {
      const e = spec(state);
      for (const [name, l] of [["large", e.shine], ["tiny", tinyOf(e.shine)]] as const) {
        const { shown, off } = lightOnIris(e, l);
        assert.ok(shown > 0 && off === 0, `${label} ${state}: ${off} of the ${name} catchlight's ${shown} points lie off the dark iris`);
      }
      assert.ok(Math.abs(tinyOf(e.shine).r / e.shine.r - TINY.scale) < 1e-9);
    }
    assert.ok(!("band" in half), `${label}: the half-lid is not a lid over the eye`);
    const { spec: s, lid } = half as Extract<TurnedEyeLid, { lid: unknown }>;
    for (const [name, l] of [["large", lid.shine], ["tiny", tinyOf(lid.shine)]] as const) {
      const { shown, off } = lightOnIris(s, l, { edge: lidEdge(s, lid), tilt: lid.tilt });
      assert.ok(shown > 0 && off === 0, `${label} sleepy: its ${name} catchlight shows ${shown} points below the lid, ${off} off the dark iris`);
    }
    // Planted: the half-lid's catchlight at the open eye's place goes wholly under the lid.
    assert.equal(lightOnIris(s, s.shine, { edge: lidEdge(s, lid), tilt: lid.tilt }).shown, 0, `${label}: the open eye's catchlight under the half-lid`);
    for (const [state, centred] of [["peek", "open"], ["peekBack", "open"], ["eager", "wide"]] as const) {
      const [e, c] = [spec(state), spec(centred)];
      const [a, b] = [irisCentre(e), irisCentre(c)];
      const travel: P = [a[0] - b[0], a[1] - b[1]], moved: P = [e.shine.at[0] - c.shine.at[0], e.shine.at[1] - c.shine.at[1]];
      const share = Math.hypot(...moved) / Math.hypot(...travel), along = v.dot(moved, travel) / (Math.hypot(...moved) * Math.hypot(...travel));
      assert.ok(share > RIDE - 0.02 && share <= 1 && along > 0.999, `${label} ${state}: its catchlight moves ${share.toFixed(2)} of the iris's travel (${along.toFixed(3)} along it)`);
      // Past half only as far as it must: a step of 0.05 less would leave it, or its tiny one, touching the white.
      if (share > RIDE + 0.02) {
        const back = { at: [c.shine.at[0] + (share - 0.05) * travel[0], c.shine.at[1] + (share - 0.05) * travel[1]] as [number, number], r: e.shine.r };
        assert.ok(lightOnIris(e, back).off + lightOnIris(e, tinyOf(back)).off > 0, `${label} ${state}: its catchlight rides ${share.toFixed(2)} of the iris's travel where less would do`);
      }
    }
  }
});
