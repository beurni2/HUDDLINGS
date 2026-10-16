// The dog's face states in the turned views (threeQuarter and side; spec L512 "each species is drawn in its four
// views, with every face state"; docs/phase3-plan.md section 5), the recipes the front's face recipes cannot serve.
// The eyes need little: parts/eye.ts draws their states from a view's own eye (its open eye, its lash bands), so each
// turned view types only its numbers; only the half-lid is drawn here (`halfLid`). The brows are the rest brow moved
// (`browState`). The mouths need most: parts/mouth.ts types each state front-on in the face's frame and places it by
// an affine frame (a roll and a move), and a turned muzzle shortens its far half more than its near half, which no
// affine frame gives. Drawn through an uneven SVG
// transform, a line would be thinner on one side than the width its meta reports (the lint holds every line to its
// band by that meta). So here each mouth's nodes are carried onto the turned muzzle first (`foreshortened`), and the
// same layers as the front's and the turned views' rest mouths are drawn on them: lines keep their widths, and the
// shapes are the front's, seen turned. The profile's mouths are typed in model space by the side view and painted
// here by the same layers.
import { ellipse, mirrorX, pathD, sample, smooth, v, type Node, type P, type Shape } from "../../../draw/geom.ts";
import { innerLine, strokeOf, type DrawnLine, type Stroke } from "../../../draw/line.ts";
import { LIMITS } from "../../../draw/lint.ts";
import { blur, pad, piece, uid, type Box, type Piece } from "../../../draw/svg.ts";
import { C } from "../palette.ts";
import type { BrowState } from "./brow.ts";
import { eye, type EyeSpec } from "./eye.ts";
import { stars, type Star } from "./stars.ts";

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const fmt = (n: number) => r3(n).toString();
const xy = (p: P) => `${fmt(p[0])} ${fmt(p[1])}`;

/** A tapered line drawn as a filled polygon, with its meta for the lint built from what strokeOf draws (mouth.ts's rule). */
function tapered(pts: P[], width: number, kind: "outer" | "inner", where: string, opts: Stroke = {}): { d: string; line: DrawnLine } {
  const s = strokeOf(pts, width, { band: LIMITS[kind], ...opts });
  return { d: s.d, line: { kind, width, where, drawn: s.drawn } };
}

/** The box round some points, grown by `by`. */
export function boxOf(pts: P[], by = 0): Box {
  const xs = pts.map(([x]) => x), ys = pts.map(([, y]) => y);
  return pad([Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)], by);
}

/** Absolute path data (M, L, C, Z with "x y" pairs) with every point carried by `at`. */
export const mapD = (d: string, at: (p: P) => P) => d.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (_m, x: string, y: string) => xy(at([Number(x), Number(y)])));

/**
 * The front's face frame carried onto a turned muzzle: a front face-frame point (parts/face.ts: the eyes' midpoint at
 * 0, 0, x toward the viewer's right, y down, the nose's foot at y 11.7) in model space.
 */
export interface TurnedFrame {
  at(p: P): P;
  /** The muzzle's level line, as the view's rest mouth lays it (degrees, clockwise on screen): the R3 guard's frame. */
  levelDeg: number;
  /** How much each half is shortened: the half on the viewer's left (x < 0) and on its right. */
  k: [number, number];
  /** Toward the light the view is drawn in (the facing's, views/facing.ts), in model space. */
  light: P;
  /** A model-space point in the muzzle's own level frame: how far along its across and its down, from the origin (the R3 guard's frame). */
  level(p: P): P;
}

/** The front's lip centre, where its philtrum meets the open mouth's lip (parts/mouth.ts, OPEN). */
export const LIP_Y = 14.2;

/**
 * A three-quarter muzzle: a front point's x shortened by `k[0]` left of the midline and `k[1]` right of it, laid
 * along `across` (the line through the view's rest mouth corners) and its y down `down`, from `origin`, where the
 * front's lip centre (0, LIP_Y) lands.
 */
export function foreshortened(o: { origin: P; acrossDeg: number; downDeg: number; k: [number, number]; light: P }): TurnedFrame {
  const a = (o.acrossDeg * Math.PI) / 180, d = (o.downDeg * Math.PI) / 180;
  const across: P = [Math.cos(a), Math.sin(a)], down: P = [-Math.sin(d), Math.cos(d)];
  return {
    at: ([x, y]) => v.add(o.origin, v.add(v.mul(across, x * (x < 0 ? o.k[0] : o.k[1])), v.mul(down, y - LIP_Y))),
    levelDeg: o.acrossDeg,
    k: o.k,
    light: o.light,
    level: (p) => {
      // p − origin = across·s + down·t, solved for (s, t).
      const [dx, dy] = v.sub(p, o.origin), det = v.cross(across, down);
      return [v.cross([dx, dy], down) / det, v.cross(across, [dx, dy]) / det];
    },
  };
}

// The front's mouth shapes (parts/mouth.ts, DECISIONS 134), typed in the face frame, each with its own words there.
// They are the front's numbers, carried onto each turned muzzle by its frame.

/** The small smile's half on the dog's left, from the philtrum's foot out to its curl. */
const SMILE_HALF: P[] = [[0, 14.4], [1.4, 15.6], [3.1, 16.6], [5.1, 17.15], [7.1, 17.05], [8.9, 16.5], [10.4, 15.6], [11.6, 14.5], [12.3, 13.4]];

interface Opened {
  half: P[];
  opening: Node[];
  corners: number[];
  sideFrom: P;
  lip: [number, number];
  sidesTo: number;
  footFrom: number;
  deep: string;
  deepCorners: string;
  tongue: string;
  shine: [number, number, number, number];
  out?: P[];
  box: Box;
}

const OPEN: Opened = {
  half: [[0, 14.2], [1.4, 15], [3.2, 15.8], [5.4, 16.5], [7.6, 16.95], [9.3, 17.05], [10.6, 16.75], [11.7, 16], [12.5, 15], [12.9, 14]],
  opening: [[0, 14.4], [3.2, 16], [5.4, 16.75], [7.6, 17.15], [9.2, 17.25], [8.6, 20.2], [7.3, 23], [5.6, 25.6], [3.8, 27.4], [1.9, 28.3], [0, 28.55],
    [-1.9, 28.3], [-3.8, 27.4], [-5.6, 25.6], [-7.3, 23], [-8.6, 20.2], [-9.2, 17.25], [-7.6, 17.15], [-5.4, 16.75], [-3.2, 16]],
  corners: [0, 4, 16],
  sideFrom: [9.2, 17.25],
  lip: [17.6, 9],
  sidesTo: 23.2,
  footFrom: 21,
  deep: "M-10 14 L10 14 L10 18 C6 17.8 3 17.1 0 16.9 C-3 17.1 -6 17.8 -10 18Z",
  deepCorners: "M-10 17 L-7.8 17.4 C-7.9 18.4 -8 19.4 -8.4 20.8 L-10 20.8Z M10 17 L7.8 17.4 C7.9 18.4 8 19.4 8.4 20.8 L10 20.8Z",
  tongue: "M-9.4 31 L-9.4 23.6 C-8 21.8 -5 20.5 0 20.4 C5 20.5 8 21.8 9.4 23.6 L9.4 31Z",
  shine: [-0.3, 23.8, 4, 2.2],
  box: [-15, 10, 30, 21],
};

const LAUGH: Opened = {
  half: [[0, 14], [1.6, 14.9], [3.6, 15.8], [6, 16.5], [8.4, 16.95], [10.4, 17.05], [12, 16.6], [13.2, 15.8], [14, 14.8], [14.3, 13.7]],
  opening: [[0, 14.2], [3.6, 16], [6, 16.75], [8.4, 17.15], [10.4, 17.25], [9.9, 20.8], [8.7, 24.5], [6.9, 27.9], [4.7, 30.6], [2.4, 31.95], [0, 32.4],
    [-2.4, 31.95], [-4.7, 30.6], [-6.9, 27.9], [-8.7, 24.5], [-9.9, 20.8], [-10.4, 17.25], [-8.4, 17.15], [-6, 16.75], [-3.6, 16]],
  corners: [0, 4, 16],
  sideFrom: [10.4, 17.25],
  lip: [17.6, 10.2],
  sidesTo: 26.4,
  footFrom: 23.6,
  deep: "M-11.5 14 L11.5 14 L11.5 18.2 C7 17.9 3.4 17.1 0 16.9 C-3.4 17.1 -7 17.9 -11.5 18.2Z",
  deepCorners: "M-11.5 17 L-9 17.4 C-9.1 18.6 -9.2 19.8 -9.7 21.6 L-11.5 21.6Z M11.5 17 L9 17.4 C9.1 18.6 9.2 19.8 9.7 21.6 L11.5 21.6Z",
  tongue: "M-10.6 34 L-10.6 25.8 C-9 23.2 -5.6 21.8 0 21.7 C5.6 21.8 9 23.2 10.6 25.8 L10.6 34Z",
  shine: [-0.4, 25.8, 4.8, 2.7],
  box: [-17, 10, 34, 26],
};

const CHEEKY: Opened = { ...OPEN, out: [[0, 21.4], [3.4, 21.8], [5.9, 23.2], [6.8, 25.6], [6.7, 28.4], [5.8, 30.9], [4.1, 32.8], [2.1, 33.8], [0, 34.1]], box: [-15, 10, 30, 27] };
const PANT: Opened = { ...LAUGH, out: [[0, 22.4], [3.2, 22.8], [5.4, 24.4], [6, 27], [5.8, 30.2], [5.1, 33.2], [3.8, 35.6], [2, 36.9], [0, 37.2]], box: [-17, 10, 34, 30] };

/**
 * An egg's right half, pointed end up, from its top down to its foot (parts/mouth.ts's egg()), its top rounder (a
 * superellipse of 2 where the front's is 1.7): shortened across on a turned muzzle, the front's soft point read as a
 * red seed.
 */
function egg(top: number, height: number, half: number, widest: number): P[] {
  const yc = top + widest * height, above = yc - top, below = top + height - yc;
  const side = (s: number, n: number) => half * Math.max(0, 1 - s ** n) ** (1 / n);
  const r = (n: number) => Math.round(n * 100) / 100;
  return [
    ...[1, 0.97, 0.88, 0.7, 0.5, 0.3, 0.12, 0].map((s): P => [r(side(s, 2)), r(yc - s * above)]),
    ...[0.4, 0.7, 0.9].map((s): P => [r(side(s, 2.2)), r(yc + s * below)]),
    [r(side(0.98, 2.2)), r(top + height - 0.02)], [0, top + height],
  ];
}

interface Oval {
  half: P[];
  tongue: string;
  shine: [number, number, number, number];
  philtrumTo: number;
}

const O: Oval = {
  half: egg(14.9, 10.5, 4.75, 0.64),
  tongue: "M-5.5 26.5 L-5.5 22.6 C-4.2 21.2 -2.2 20.6 0 20.6 C2.2 20.6 4.2 21.2 5.5 22.6 L5.5 26.5Z",
  shine: [-0.4, 22.6, 2, 1.1],
  philtrumTo: 13,
};
const YAWN: Oval = {
  half: egg(15.6, 18.3, 6, 0.64),
  // The front's tongue 1.6 pt higher, so a turned yawn's narrower foot still shows it.
  tongue: "M-7.5 35 L-7.5 29.2 C-5.4 27.6 -2.8 27 0 27 C2.8 27 5.4 27.6 7.5 29.2 L7.5 35Z",
  shine: [-0.6, 31, 2.6, 1.2],
  philtrumTo: 13.6,
};

/** What a turned mouth draws, for the R3 guard, in model space (parts/mouth.ts's Mouth). */
export interface TurnedMouth {
  piece: Piece;
  /** A lipped mouth's upper lip, evenly sampled from end to end, and where the philtrum meets it. */
  lip?: { line: P[]; centre: P };
  /** A mouth drawn as an opening alone (o, yawn): its edge. */
  opening?: P[];
}

/**
 * The layers of an open mouth, as the front's and the turned views' rest mouths paint them, on geometry given in model
 * space: the opening in the mouth's red, deepest in a band right under the lip and back into its upper corners; the
 * tongue a coral dome in its lower half with a soft lighter middle; a dark red-brown rim down the opening's sides and a
 * warm one round its foot under the tongue; a tongue hanging out over the lower lip where the state has one, with its
 * rim and a faint groove; the upper lip one inner line (0.9 pt), deep red-brown over the opening and the printed dark
 * brown out along its ends; and the philtrum down from the nose's foot.
 */
export interface OpenMouth {
  lip: P[];
  /** The lip's gradient runs from one end to the other. */
  lipEnds: [P, P];
  opening: Shape;
  deep: string[];
  tongue: string;
  shine: { at: P; r: [number, number] };
  /** Rim centre lines: down each side, and round the foot under the tongue. */
  sides: P[][];
  foot: P[];
  out?: { lobe: Shape; rim: P[]; groove: P[]; shine: P };
  /** From the nose's foot down to the lip; the profile has none (its upper lip is the head's own line, head.line). */
  philtrum?: P[];
  box: Box;
}

export function paintOpen(o: OpenMouth): Piece {
  const lip = tapered(o.lip, 0.9, "inner", "upper lip", { taper: 2.2, tip: 0.3 });
  const m = pathD(o.opening.segs);
  const doubled: [number, number] = [LIMITS.inner[0] * 2, LIMITS.inner[1] * 2];
  const sides = o.sides.map((pts) => strokeOf(pts, 1.8, { taper: 2.6, tip: 0.2, band: doubled }));
  const foot = strokeOf(o.foot, 1.5, { taper: 3, tip: 0.1, band: doubled });
  const rimLines: DrawnLine[] = [...sides.map((s) => ({ kind: "inner" as const, width: 0.9, where: "mouth side", drawn: [s.drawn[0] / 2, s.drawn[1] / 2] as [number, number] })),
    { kind: "inner", width: 0.75, where: "mouth foot", drawn: [foot.drawn[0] / 2, foot.drawn[1] / 2] }];
  const clip = uid("mouth"), soft = uid("blur"), lit = uid("blur"), edge = uid("blur"), lipFade = uid("lip");
  const philtrum = o.philtrum ? innerLine(o.philtrum, 0.9, C.eyeDark, { taper: 0.9, tip: 0.75, wobble: 0 }) : undefined;
  let out = "";
  const outLines: DrawnLine[] = [];
  if (o.out) {
    const rim = tapered(o.out.rim, 0.8, "inner", "tongue rim", { taper: 2.4, tip: 0.15 });
    const groove = innerLine(o.out.groove, 0.6, C.tongueRim, { taper: 1.8, tip: 0.1, opacity: 0.35, wobble: 0 });
    const lobeLit = uid("blur"), lobeSoft = uid("blur");
    out = `<defs>${blur(lobeLit, o.box, 1.4)}${blur(lobeSoft, o.box, 0.25)}</defs>` +
      `<g filter="url(#${lobeSoft})"><path d="${pathD(o.out.lobe.segs)}" fill="${C.tongue}"/></g>` +
      `<ellipse cx="${fmt(o.out.shine[0])}" cy="${fmt(o.out.shine[1])}" rx="3" ry="2.6" fill="${C.tongueShine}" opacity="0.5" filter="url(#${lobeLit})"/>` +
      `<path d="${rim.d}" fill="${C.tongueRim}"/>${groove.svg}`;
    outLines.push(rim.line, { ...groove.line, where: "tongue groove" });
  }
  const [e0, e1] = o.lipEnds;
  const svg = `<defs><clipPath id="${clip}"><path d="${m}"/></clipPath>${blur(soft, o.box, 0.45)}${blur(lit, o.box, 1.3)}${blur(edge, o.box, 0.2)}` +
    `<linearGradient id="${lipFade}" gradientUnits="userSpaceOnUse" x1="${fmt(e0[0])}" y1="${fmt(e0[1])}" x2="${fmt(e1[0])}" y2="${fmt(e1[1])}">` +
    `<stop offset="0.08" stop-color="${C.dark}"/><stop offset="0.25" stop-color="${C.lipLine}"/><stop offset="0.75" stop-color="${C.lipLine}"/>` +
    `<stop offset="0.92" stop-color="${C.dark}"/></linearGradient></defs>` +
    `<path d="${m}" fill="${C.mouthInside}"/><g clip-path="url(#${clip})">` +
    o.deep.map((d, k) => `<path d="${d}" fill="${C.mouthDeep}" opacity="${k === 0 ? 0.55 : 0.35}" filter="url(#${soft})"/>`).join("") +
    `<path d="${o.tongue}" fill="${C.tongue}" filter="url(#${soft})"/>` +
    `<ellipse cx="${fmt(o.shine.at[0])}" cy="${fmt(o.shine.at[1])}" rx="${fmt(o.shine.r[0])}" ry="${fmt(o.shine.r[1])}" fill="${C.tongueShine}" opacity="0.5" filter="url(#${lit})"/>` +
    `<g filter="url(#${edge})">${sides.map((s) => `<path d="${s.d}" fill="${C.mouthRim}"/>`).join("")}<path d="${foot.d}" fill="${C.tongueRim}"/></g></g>` +
    out + `<path d="${lip.d}" fill="url(#${lipFade})"/>${philtrum?.svg ?? ""}`;
  return piece(svg, o.box, { shapes: [], lines: [lip.line, ...rimLines, ...outLines, ...(philtrum ? [{ ...philtrum.line, where: "philtrum" }] : [])] });
}

/**
 * The layers of a mouth drawn as an opening alone (o, yawn), as parts/mouth.ts paints them: the mouth's red darkest
 * under its top, the tongue's coral dome in its lower half, a dark red-brown rim down its sides and a warm one round its
 * foot, the philtrum a short tick under the nose, in model space.
 */
export interface OvalMouth {
  opening: Shape;
  top: string;
  tongue: string;
  shine: { at: P; r: [number, number] };
  sides: P[][];
  foot: P[];
  philtrum?: P[];
  box: Box;
}

export function paintOval(o: OvalMouth): Piece {
  const m = pathD(o.opening.segs);
  const doubled: [number, number] = [LIMITS.inner[0] * 2, LIMITS.inner[1] * 2];
  const sides = o.sides.map((pts) => strokeOf(pts, 1.8, { taper: 2.2, tip: 0.3, band: doubled }));
  const foot = strokeOf(o.foot, 1.5, { taper: 2.4, tip: 0.2, band: doubled });
  const lines: DrawnLine[] = [...sides.map((s) => ({ kind: "inner" as const, width: 0.9, where: "mouth side", drawn: [s.drawn[0] / 2, s.drawn[1] / 2] as [number, number] })),
    { kind: "inner", width: 0.75, where: "mouth foot", drawn: [foot.drawn[0] / 2, foot.drawn[1] / 2] }];
  const philtrum = o.philtrum ? innerLine(o.philtrum, 0.8, C.eyeDark, { taper: 0.45, tip: 0.35, wobble: 0 }) : undefined;
  if (philtrum) lines.push({ ...philtrum.line, where: "philtrum" });
  const clip = uid("mouth"), soft = uid("blur"), lit = uid("blur"), edgeBlur = uid("blur");
  const svg = `<defs><clipPath id="${clip}"><path d="${m}"/></clipPath>${blur(soft, o.box, 0.45)}${blur(lit, o.box, 1.1)}${blur(edgeBlur, o.box, 0.2)}</defs>` +
    `<path d="${m}" fill="${C.mouthInside}"/><g clip-path="url(#${clip})">` +
    `<path d="${o.top}" fill="${C.mouthDeep}" opacity="0.6" filter="url(#${soft})"/>` +
    `<path d="${o.tongue}" fill="${C.tongue}" filter="url(#${soft})"/>` +
    `<ellipse cx="${fmt(o.shine.at[0])}" cy="${fmt(o.shine.at[1])}" rx="${fmt(o.shine.r[0])}" ry="${fmt(o.shine.r[1])}" fill="${C.tongueShine}" opacity="0.5" filter="url(#${lit})"/>` +
    `<g filter="url(#${edgeBlur})">${sides.map((s) => `<path d="${s.d}" fill="${C.mouthRim}"/>`).join("")}<path d="${foot.d}" fill="${C.tongueRim}"/></g></g>` +
    (philtrum?.svg ?? "");
  return piece(svg, o.box, { shapes: [], lines });
}

/**
 * A closed smile: one inner line (0.9 pt) from end to end, deep red-brown in its middle and the printed dark brown out
 * along its ends, as the front's small smile and the side's are; and the philtrum, where the view draws one.
 */
export function paintSmile(lip: P[], ends: [P, P], philtrum: P[] | undefined, box: Box, where = "smile"): Piece {
  const line = tapered(lip, 0.9, "inner", where, { taper: 2.4, tip: 0.3 });
  const p = philtrum ? innerLine(philtrum, 0.9, C.eyeDark, { taper: 0.9, tip: 0.75, wobble: 0 }) : undefined;
  const fade = uid("lip");
  const svg = `<defs><linearGradient id="${fade}" gradientUnits="userSpaceOnUse" x1="${fmt(ends[0][0])}" y1="${fmt(ends[0][1])}" x2="${fmt(ends[1][0])}" y2="${fmt(ends[1][1])}">` +
    `<stop offset="0.08" stop-color="${C.dark}"/><stop offset="0.3" stop-color="${C.lipLine}"/><stop offset="0.7" stop-color="${C.lipLine}"/>` +
    `<stop offset="0.92" stop-color="${C.dark}"/></linearGradient></defs><path d="${line.d}" fill="url(#${fade})"/>${p?.svg ?? ""}`;
  return piece(svg, box, { shapes: [], lines: [line.line, ...(p ? [{ ...p.line, where: "philtrum" }] : [])] });
}

/** The full lip line from a half typed on the dog's left (the viewer's right), from the philtrum's foot out to its curl. */
const lipNodes = (half: P[]): P[] => [...(mirrorX(half, false) as P[]).slice(0, -1), ...half];

/**
 * The mouth states each turned view draws, named here rather than read off parts/mouth.ts's list, so a state the front
 * adds later is not drawn in a turned view by accident (it falls back to the view's rest mouth until it is drawn).
 * The three-quarter's rest is its open mouth, the profile's its smile.
 */
export const TURNED_MOUTHS = ["smile", "laugh", "o", "cheeky", "yawn", "pant"] as const;
export type TurnedMouthState = (typeof TURNED_MOUTHS)[number];
export const PROFILE_MOUTHS = ["open", "laugh", "o", "cheeky", "yawn", "pant"] as const;
export type ProfileMouthState = (typeof PROFILE_MOUTHS)[number];

/**
 * A mouth state on a three-quarter muzzle: the front's own shape (parts/mouth.ts) carried onto the turned muzzle by the
 * view's frame, and painted by the front's layers there. `nose` is the nose's foot in model space, where the philtrum
 * starts, as the view's rest mouth starts it.
 */
export function turnedMouth(state: TurnedMouthState, f: TurnedFrame, nose: P): TurnedMouth {
  const at = f.at;
  if (state === "smile") {
    const lip = smooth(lipNodes(SMILE_HALF).map(at), { closed: false });
    const line = sample(lip.segs, 12, false);
    const centre = at(SMILE_HALF[0]!);
    const box = boxOf([...line, nose], 3);
    return { piece: paintSmile(line, [at([-13, 15]), at([13, 15])], [nose, v.add(v.mul(nose, 0.4), v.mul(at([0, 14.6]), 0.6)), at([0, 14.6])], box), lip: { line, centre } };
  }
  if (state === "o" || state === "yawn") {
    const o = state === "o" ? O : YAWN;
    const loop = [...o.half, ...(mirrorX(o.half, false) as P[]).slice(1, -1)];
    const opening = smooth(loop.map(at));
    const top = o.half[0]![1], footY = o.half[o.half.length - 1]![1], mid = (top + footY) / 2;
    // The rims as the front picks them, from the typed egg: down each side above its middle, round its foot below it.
    const edge = sample(smooth(loop).segs, 16, true);
    const sides = ([1, -1] as const).map((sx) => edge.filter(([x, y]) => sx * x > 0 && y < mid + 1.5).sort((a, b) => a[1] - b[1]).map(at));
    const foot = edge.filter(([, y]) => y > mid).sort((a, b) => a[0] - b[0]).map(at);
    const ring = sample(opening.segs, 16, true);
    const [sx, sy, srx, sry] = o.shine;
    const k = (x: number) => (x < 0 ? f.k[0] : f.k[1]);
    const box = boxOf([...ring, nose], 2);
    return {
      piece: paintOval({
        opening, top: mapD(`M-8 ${fmt(top - 1)} L8 ${fmt(top - 1)} L8 ${fmt(top + 3.2)} C3 ${fmt(top + 2)} -3 ${fmt(top + 2)} -8 ${fmt(top + 3.2)}Z`, at),
        tongue: mapD(o.tongue, at), shine: { at: at([sx, sy]), r: [srx * k(sx), sry] }, sides, foot,
        philtrum: [nose, at([0, o.philtrumTo])], box,
      }),
      opening: ring,
    };
  }
  const o = state === "laugh" ? LAUGH : state === "cheeky" ? CHEEKY : PANT;
  const lip = smooth(lipNodes(o.half).map(at), { closed: false });
  const line = sample(lip.segs, 12, false);
  // The opening, typed with its corners, carried node by node; the rims picked from the typed opening as the front picks them.
  const opening = smooth(o.opening.map((n) => at([n[0], n[1]])), { corners: o.corners });
  const typed = smooth(o.opening, { corners: o.corners });
  const [lipY, lipX] = o.lip;
  const from = typed.segs.findIndex((g) => g[0][0] === o.sideFrom[0] && g[0][1] === o.sideFrom[1]);
  const edgePts = sample(typed.segs.slice(from), 16, false).filter(([x, y]) => y > lipY || Math.abs(x) > lipX);
  const end = edgePts.findIndex(([x, y], i) => i > 4 && x < -lipX && y < lipY);
  const along = end > 0 ? edgePts.slice(0, end + 1) : edgePts;
  const sides = ([1, -1] as const).map((sx) => along.filter(([x, y]) => sx * x > 0 && y < o.sidesTo).sort((a, b) => a[1] - b[1]).map(at));
  const foot = along.filter(([, y]) => y > o.footFrom).map(at);
  const k = (x: number) => (x < 0 ? f.k[0] : f.k[1]);
  const [sx, sy, srx, sry] = o.shine;
  let out: OpenMouth["out"];
  const ring = sample(opening.segs, 16, true);
  let extent = [...ring, ...line, nose];
  if (o.out) {
    const lobeTyped = [...o.out, ...(mirrorX(o.out.slice(1, -1), false) as P[])];
    const lobe = smooth(lobeTyped.map(at));
    const footY = Math.max(...sample(typed.segs, 12, true).map(([, y]) => y));
    const tip = o.out[o.out.length - 1]![1];
    const rim = sample(smooth(lobeTyped).segs, 16, true).filter(([, y]) => y > footY - 2.2).sort((a, b) => a[0] - b[0]).map(at);
    const groove = ([[0, (o.out[0]![1] + tip) / 2 - 1.5], [0, (o.out[0]![1] + tip) / 2 + 1.5], [0, tip - 3.4]] as P[]).map(at);
    // Its soft light toward the light, as the front's (2.2 pt from the lobe's middle).
    const mid = at([0, (o.out[0]![1] + tip) / 2]);
    out = { lobe, rim, groove, shine: v.add(mid, v.mul(f.light, 2.2)) };
    extent = [...extent, ...sample(lobe.segs, 8, true)];
  }
  const box = boxOf(extent, 3);
  return {
    piece: paintOpen({
      lip: line, lipEnds: [at([-14, 15]), at([14, 15])], opening, deep: [mapD(o.deep, at), mapD(o.deepCorners, at)], tongue: mapD(o.tongue, at),
      shine: { at: at([sx, sy]), r: [srx * k(sx), sry] }, sides, foot, ...(out ? { out } : {}),
      philtrum: [nose, v.add(v.mul(nose, 0.4), v.mul(at(o.half[0]!), 0.6)), at(o.half[0]!)], box,
    }),
    lip: { line, centre: at(o.half[0]!) },
  };
}

/**
 * The sleepy half-lid on a turned eye (the expression sheet's Sleepy half-lid): the open eye closed down to a level line
 * `level` pt from its middle (up negative), its edge bowing down `bow` pt in its middle, as parts/eye.ts closes it
 * (EyeSpec.cover), with a lash line along that edge and the catchlight just under it (Q28's default). parts/eye.ts
 * paints the lid as the hood's pale tan over the whole upper eye: the front's eyes sit inside their hoods, but a turned
 * view's sit half in the cream (the three-quarter's near hood arches over its eye's outer top, the far one only over
 * its outer side), where that tan lid read as a cap stuck on the face. So here the open eye is drawn only below the
 * lid's edge, and above it the face's own fur shows, whatever colour it is round that eye, with a soft crease of the
 * lid's shade just above the lash.
 */
export function halfLid(e: EyeSpec, c: NonNullable<EyeSpec["cover"]> & { bow?: number }): Piece {
  const base = eye(e);
  const t = (c.tilt * Math.PI) / 180, cos = Math.cos(t), sin = Math.sin(t);
  const L = (x: number, y: number): P => [e.centre[0] + x * cos - y * sin, e.centre[1] + x * sin + y * cos];
  const reach = Math.max(e.rx, e.ry) + 1, half = reach + c.overhang;
  // The lid's edge bows down a little in its middle, as an eyelid's does (parts/eye.ts's).
  const edge = Array.from({ length: 25 }, (_, k): P => {
    const x = -half + (2 * half * k) / 24;
    return L(x, c.level + (c.bow ?? 1.6) * (1 - (x / half) ** 2));
  });
  const below = uid("below"), crease = uid("crease"), soft = uid("blur"), lash = uid("blur"), shine = uid("blur");
  const under = `M${edge.map(xy).join("L")}L${xy(L(half, reach + 6))}L${xy(L(-half, reach + 6))}Z`;
  // The crease: a soft band of the lid's shade 2.4 pt deep just above the lash, fading upward.
  const lift = (p: P, by: number): P => [p[0] + by * sin, p[1] - by * cos];
  const creaseD = `M${edge.slice(3, -3).map(xy).join("L")}L${[...edge.slice(3, -3)].reverse().map((p) => xy(lift(p, 2.4))).join("L")}Z`;
  const mid = c.level + (c.bow ?? 1.6), [g0, g1] = [L(0, mid - 3.2), L(0, mid - 0.6)];
  const band = strokeOf(edge.slice(2, -2), c.lash, { taper: 3.2, tip: 0.7 });
  const a = (e.turn * Math.PI) / 180;
  const [u, w] = [c.shine.at[0], -c.shine.at[1]];
  const spot: P = [e.centre[0] + e.noseward * u * Math.cos(a) - w * Math.sin(a), e.centre[1] + e.noseward * u * Math.sin(a) + w * Math.cos(a)];
  const svg = `<defs><clipPath id="${below}"><path d="${under}"/></clipPath>` +
    `<linearGradient id="${crease}" gradientUnits="userSpaceOnUse" x1="${fmt(g0[0])}" y1="${fmt(g0[1])}" x2="${fmt(g1[0])}" y2="${fmt(g1[1])}">` +
    `<stop offset="0" stop-color="${C.lidShade}" stop-opacity="0"/><stop offset="1" stop-color="${C.lidShade}" stop-opacity="0.55"/></linearGradient>` +
    `${blur(soft, base.box, 0.6)}${blur(lash, base.box, 0.2)}${blur(shine, base.box, 0.22)}</defs>` +
    `<g clip-path="url(#${below})">${base.svg}</g>` +
    `<g filter="url(#${soft})"><path d="${creaseD}" fill="url(#${crease})"/></g>` +
    `<g filter="url(#${lash})"><path d="${band.d}" fill="${C.eyeRim}"/></g>` +
    `<path d="${pathD(ellipse(spot, c.shine.r, c.shine.r * 0.94, e.turn))}" fill="${C.light}" filter="url(#${shine})"/>`;
  return piece(svg, base.box, base.meta);
}

/**
 * The sparkle's stars in a turned view (parts/stars.ts, Proud's stars, Q2's default), typed in model space where the
 * view puts them beside its head, their warm cores toward the light the view is drawn in.
 */
export function turnedStars(list: Star[], light: P): Piece {
  return stars(list, { place: (svg) => svg, at: (p) => p, box: (b) => b, light });
}

/**
 * A brow state from a turned view's rest brow (its centre line, from end to end): raised sits 3 pt higher and arches
 * 0.4 pt more at its middle; happy sits 3.5 pt lower, as the front's (parts/brow.ts, DECISIONS 131): the same arc moved,
 * never turned, so its ends keep the rest brow's own tilt.
 */
export function browState(rest: P[], state: BrowState): P[] {
  if (state === "neutral") return rest;
  const n = rest.length - 1;
  return rest.map(([x, y], i): P => (state === "raised" ? [x, y - 3 - 0.4 * Math.sin((Math.PI * i) / n)] : [x, y + 3.5]));
}
