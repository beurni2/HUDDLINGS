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
import { PROFILE_MOUTHS, TURNED_MOUTHS, turnedMouth, type TurnedMouth } from "../src/parts/turned.ts";
import { LIGHT } from "../../draw/paint.ts";
import { EAR_STATES, EYE_STATES } from "../src/presets.ts";
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
  "ear.L": EAR_STATES, "ear.R": EAR_STATES, stars: ["sparkle"],
  // The head's line beside a raised ear (the front lane's states, named for the dog's side: left, right, both).
  "head.line": ["templeL", "templeR", "temples"],
};
/**
 * The states each face part draws as a drawing of its own in a view; the others are the rest drawing (ears turned by
 * the clip) or its alias (Q2). The three-quarter's mouths are its own list (parts/turned.ts) with its rest; the
 * profile's are drawn but held out of the package for now (sideHeld, DECISIONS 183), so it keys its smile alone.
 */
const OWN = (view: string): Record<string, readonly string[]> => ({
  "eye.L": ["happy", "closed", "sleepy", "wink", "wide", "peek"], "eye.R": ["happy", "closed", "sleepy", "wink", "wide", "peek"],
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
  // The eyes the profile hides draw nothing there, in every state; the squeeze and the sparkle are the crescent (Q2).
  for (const view of TURNED) {
    for (const eye of ["eye.L", "eye.R"]) {
      const part = rig.parts.find((p) => p.name === eye)!;
      const hidden = view.startsWith("side") && !view.endsWith(eye.slice(-1));
      for (const state of EYE_STATES) {
        const region = regionFor(part, view, state);
        if (hidden) assert.equal(region, undefined, `${eye} draws in ${view}, which hides it`);
        else if (state === "squeeze" || state === "sparkle") assert.equal(region, regionFor(part, view, "happy"), `${eye} ${state} in ${view}`);
        else if (state !== "open") assert.notEqual(region, regionFor(part, view, "open"), `${eye} ${state} in ${view} draws the open eye`);
      }
    }
  }
  // Both ears raised is the near ear's line; the far ear raised leaves the rest line, its side a true edge still.
  const line = rig.parts.find((p) => p.name === "head.line")!;
  for (const [view, near, far] of [["threeQuarter.L", "templeL", "templeR"], ["threeQuarter.R", "templeR", "templeL"]] as const) {
    assert.equal(regionFor(line, view, "temples"), regionFor(line, view, near), `head.line temples in ${view}`);
    assert.equal(regionFor(line, view, far), `head.line/${view}`, `head.line ${far} in ${view}`);
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
 * centre there, so its one corner holds to it). A mouth drawn as an opening alone (o, yawn) is symmetric in its own
 * frame (a turned o with each half's shortening undone, a profile o about its own leaning axis) and round at its foot,
 * which hangs below its widest by at least a quarter of its width.
 */
const O_FOOT = 0.25;
type Level = (p: P) => P;
function mouthProblem(m: Pick<TurnedMouth, "lip" | "opening">, lv: Level): string | undefined {
  if (m.lip) {
    const pts = m.lip.line.map(lv), [, cy] = lv(m.lip.centre);
    const left = pts.reduce((a, b) => (b[0] < a[0] ? b : a)), right = pts.reduce((a, b) => (b[0] > a[0] ? b : a));
    for (const [name, end] of [["left", left], ["right", right]] as const) {
      if (end[1] > cy + 1e-9) return `its lip's ${name} end hangs ${(end[1] - cy).toFixed(2)} pt below its centre`;
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
