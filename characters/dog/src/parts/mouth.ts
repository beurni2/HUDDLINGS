// The dog's mouths, one recipe per state for every view, each typed once in the face's own frame (parts/face.ts:
// the origin midway between the eyes, y down, the nose's foot at y 11.7) from the expression sheet's panels, and
// placed by the view's frame. Rule R3, never a downturned mouth (characters/dog/test/faces.test.ts holds each one to
// it): a lipped mouth keeps its lip's ends at or above where the philtrum meets it; the o and the yawn, which have no
// corners, are symmetric and round at the foot.
// - smile: the sheets' small smile (Small smile, Content, Winking): the philtrum down from the nose into two
//   bowed arcs, broad and lowest about halfway out, that curl up at their tips, a W, never a single frown;
// - open: the turnaround's open happy mouth (the rest; DECISIONS 50, 85);
// - openWide: the open mouth as the master sheet's Excited draws it, wider and deeper (excited only; DECISIONS 144);
// - laugh: the master sheet's Laughing, the widest and deepest, the tongue a big dome;
// - o: Surprised's small o, an egg pointed at its top and widest low, the tongue filling its lower half;
// - cheeky: Mischievous's and Cheeky's open mouth with the tongue out over the lower lip;
// - yawn: a tall o with the tongue low, drawn for yawns (no panel), the o's egg grown taller;
// - pant: the open mouth with the tongue further out, drawn for panting (no panel);
// - o.tongue: hungry's beat after the o, new (no panel): the small smile with the tongue's tip peeking out at its corner;
// - pressed: huffy's, new (no panel): a short flat line, the lips pressed together under the puffed cheeks, never a
//   pout (no lower lip pushed out, its ends never below its middle);
// - tinySmile: huffy's peek back, new (no panel): the small smile's W at about three fifths of its width, its tips curling up.
import { mirrorX, pathD, sample, smooth, type Node, type P, type Seg } from "../../../draw/geom.ts";
import { innerLine, strokeOf, type DrawnLine, type Stroke } from "../../../draw/line.ts";
import { LIMITS } from "../../../draw/lint.ts";
import { blur, piece, uid, union, type Box, type Piece } from "../../../draw/svg.ts";
import { C } from "../palette.ts";
import type { FaceFrame } from "./face.ts";

export const MOUTH_STATES = ["smile", "open", "openWide", "laugh", "o", "cheeky", "yawn", "pant", "o.tongue", "pressed", "tinySmile"] as const;
export type MouthState = (typeof MOUTH_STATES)[number];

export interface Mouth {
  piece: Piece;
  /**
   * What it draws, for the R3 guard, in model space: a lipped mouth's upper lip, its line evenly sampled from end to
   * end and its centre, where the philtrum meets it; a mouth drawn as an opening alone (o, yawn), its edge.
   */
  lip?: { line: P[]; centre: P };
  opening?: P[];
}

/**
 * A tapered line drawn as a filled polygon, with its meta for the lint built from what strokeOf draws: the
 * width it is declared and the narrowest and widest it is drawn, held to its band (outer 1.2 to 1.8 pt,
 * inner 0.6 to 0.9).
 */
function tapered(pts: P[], width: number, kind: "outer" | "inner", where: string, opts: Stroke = {}): { d: string; line: DrawnLine } {
  const s = strokeOf(pts, width, { band: LIMITS[kind], ...opts });
  return { d: s.d, line: { kind, width, where, drawn: s.drawn } };
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** The lip line from one half typed on the dog's left (the viewer's right), from the philtrum's foot out to its curl. */
const lipOf = (half: P[]) => smooth([...mirrorX(half, false).slice(0, -1), ...half], { closed: false });

/** An open mouth's shape, typed in the face frame. */
interface Opened {
  /** The upper lip, from the philtrum's foot out to its curl's tip, on the dog's left. */
  half: P[];
  /** The opening, round from the philtrum's foot along the lip and down into its U, and its sharp nodes. */
  opening: Node[];
  corners: number[];
  /** Where the philtrum, from the nose's foot, meets the lip. */
  philtrumTo: number;
  /** The opening's node where its right side starts down, and the lip's lower edge: points above `lip[0]` and within `lip[1]` across are on the lip. */
  sideFrom: P;
  lip: [number, number];
  /** How far down the side rims run, and where the foot's begins. */
  sidesTo: number;
  footFrom: number;
  /** The shade right under the lip and back into its upper corners, as path data. */
  deep: string;
  deepCorners: string;
  /** The tongue inside the opening, and its soft shine (centre and radii). */
  tongue: string;
  shine: [number, number, number, number];
  /** A tongue hanging out over the lower lip: its right half (the viewer's right), from the top of its middle inside the opening round to its tip. */
  out?: P[];
  box: Box;
}

/**
 * An open mouth, as the turnaround, the hero and the expression sheet's happy face draw it. The upper lip is one line
 * (the muzzle line, an inner line, 0.9 pt, tapering to fine points at its tips), a deep red-brown over the opening and
 * the printed dark brown out along its ends: from the philtrum's foot down to the opening's top corners, then on in
 * a short flick that hooks up into a small curl at each tip. The lip IS the opening's top edge: the opening hangs
 * from it in a round, full U, never a V. Inside, a band of deep maroon right under the lip and back into the upper
 * corners, easing to the mouth's red; the tongue fills the lower half, a wide coral dome, lighter in its middle, with
 * no groove. A dark red-brown rim runs down the opening's sides and a warm brown one round its foot, under the tongue.
 */
function opened(o: Opened, f: FaceFrame): Mouth {
  const lipShape = lipOf(o.half);
  const lip = tapered(sample(lipShape.segs, 12, false), 0.9, "inner", "upper lip", { taper: 2.2, tip: 0.3 });
  const opening = smooth(o.opening, { corners: o.corners });
  const m = pathD(opening.segs);
  // The rim down each side, from the top corner to where the tongue meets the side, drawn twice its width centred
  // on the edge inside the opening's clip, so the half that shows lies inside the opening; and a warm one round
  // the foot under the tongue.
  const [lipY, lipX] = o.lip;
  const edgePts = sample(opening.segs.slice(opening.segs.findIndex((g) => g[0][0] === o.sideFrom[0] && g[0][1] === o.sideFrom[1])), 16, false)
    .filter(([x, y]) => y > lipY || Math.abs(x) > lipX);
  const end = edgePts.findIndex(([x, y], i) => i > 4 && x < -lipX && y < lipY);
  const along = end > 0 ? edgePts.slice(0, end + 1) : edgePts;
  const doubled: [number, number] = [LIMITS.inner[0] * 2, LIMITS.inner[1] * 2];
  const sides = ([1, -1] as const).map((sx) => strokeOf(along.filter(([x, y]) => sx * x > 0 && y < o.sidesTo).sort((a, b) => a[1] - b[1]), 1.8, { taper: 2.6, tip: 0.2, band: doubled }));
  const foot = strokeOf(along.filter(([, y]) => y > o.footFrom), 1.5, { taper: 3, tip: 0.1, band: doubled });
  const rimLines: DrawnLine[] = [...sides.map((s) => ({ kind: "inner" as const, width: 0.9, where: "mouth side", drawn: [s.drawn[0] / 2, s.drawn[1] / 2] as [number, number] })),
    { kind: "inner", width: 0.75, where: "mouth foot", drawn: [foot.drawn[0] / 2, foot.drawn[1] / 2] }];
  const clip = uid("mouth"), soft = uid("blur"), lit = uid("blur"), edge = uid("blur"), lipFade = uid("lip");
  const philtrum = innerLine([[0, 11.7], [0, o.philtrumTo]], 0.9, C.eyeDark, { taper: 0.9, tip: 0.75, wobble: 0 });
  const span = Math.ceil(Math.abs(o.half[o.half.length - 1]![0]));
  const [sx, sy, srx, sry] = o.shine;
  let out = "";
  const outLines: DrawnLine[] = [];
  const lobe = o.out ? smooth([...o.out, ...mirrorX(o.out.slice(1, -1), false)]) : undefined;
  if (o.out && lobe) {
    // The tongue over the lower lip: its coral lobe from inside the opening down past the foot, lighter where the
    // light falls, a soft groove down its middle, and the tongue's warm rim round the part that hangs out below the
    // opening's foot.
    const foot = Math.max(...sample(opening.segs, 12, true).map(([, y]) => y));
    const tip = o.out[o.out.length - 1]![1];
    const rimPts = sample(lobe.segs, 16, true).filter(([, y]) => y > foot - 2.2).sort((a, b) => a[0] - b[0]);
    const rim = tapered(rimPts, 0.8, "inner", "tongue rim", { taper: 2.4, tip: 0.15 });
    // The groove: a short soft crease down the tongue's middle, faint, as the panels draw it, never a split.
    const groove = innerLine([[0, (o.out[0]![1] + tip) / 2 - 1.5], [0, (o.out[0]![1] + tip) / 2 + 1.5], [0, tip - 3.4]], 0.6, C.tongueRim, { taper: 1.8, tip: 0.1, opacity: 0.35, wobble: 0 });
    const lobeLit = uid("blur"), lobeSoft = uid("blur");
    const [lx, ly] = [f.light[0] * 2.2, (o.out[0]![1] + tip) / 2 + f.light[1] * 2.2];
    out = `<defs>${blur(lobeLit, o.box, 1.4)}${blur(lobeSoft, o.box, 0.25)}</defs>` +
      `<g filter="url(#${lobeSoft})"><path d="${pathD(lobe.segs)}" fill="${C.tongue}"/></g>` +
      `<ellipse cx="${r3(lx)}" cy="${r3(ly)}" rx="3.2" ry="2.8" fill="${C.tongueShine}" opacity="0.5" filter="url(#${lobeLit})"/>` +
      `<path d="${rim.d}" fill="${C.tongueRim}"/>${groove.svg}`;
    outLines.push(rim.line, { ...groove.line, where: "tongue groove" });
  }
  const svg = `<defs><clipPath id="${clip}"><path d="${m}"/></clipPath>${blur(soft, o.box, 0.45)}${blur(lit, o.box, 1.3)}${blur(edge, o.box, 0.2)}` +
    `<linearGradient id="${lipFade}" gradientUnits="userSpaceOnUse" x1="${-span}" y1="0" x2="${span}" y2="0">` +
    `<stop offset="0.08" stop-color="${C.dark}"/><stop offset="0.25" stop-color="${C.lipLine}"/><stop offset="0.75" stop-color="${C.lipLine}"/>` +
    `<stop offset="0.92" stop-color="${C.dark}"/></linearGradient></defs>` +
    `<path d="${m}" fill="${C.mouthInside}"/><g clip-path="url(#${clip})">` +
    // Deepest right under the lip and back into its corners, easing to the mouth's own red.
    `<path d="${o.deep}" fill="${C.mouthDeep}" opacity="0.55" filter="url(#${soft})"/>` +
    `<path d="${o.deepCorners}" fill="${C.mouthDeep}" opacity="0.35" filter="url(#${soft})"/>` +
    // The tongue, a dome in the lower half, its top soft where it meets the dark, lighter in its middle, no groove.
    `<path d="${o.tongue}" fill="${C.tongue}" filter="url(#${soft})"/>` +
    `<ellipse cx="${sx}" cy="${sy}" rx="${srx}" ry="${sry}" fill="${C.tongueShine}" opacity="0.5" filter="url(#${lit})"/>` +
    `<g filter="url(#${edge})">${sides.map((s) => `<path d="${s.d}" fill="${C.mouthRim}"/>`).join("")}<path d="${foot.d}" fill="${C.tongueRim}"/></g></g>` +
    out + `<path d="${lip.d}" fill="url(#${lipFade})"/>${philtrum.svg}`;
  return {
    piece: piece(f.place(svg), f.box(o.box), { shapes: [], lines: [lip.line, ...rimLines, ...outLines, { ...philtrum.line, where: "philtrum" }] }),
    lip: { line: sample(lipShape.segs, 12, false).map(f.at), centre: f.at(o.half[0]!) },
  };
}

/** The turnaround's open mouth (DECISIONS 50, 85): the rest. */
const OPEN: Opened = {
  half: [[0, 14.2], [1.4, 15], [3.2, 15.8], [5.4, 16.5], [7.6, 16.95], [9.3, 17.05], [10.6, 16.75], [11.7, 16], [12.5, 15], [12.9, 14]],
  opening: [[0, 14.4], [3.2, 16], [5.4, 16.75], [7.6, 17.15], [9.2, 17.25], [8.6, 20.2], [7.3, 23], [5.6, 25.6], [3.8, 27.4], [1.9, 28.3], [0, 28.55],
    [-1.9, 28.3], [-3.8, 27.4], [-5.6, 25.6], [-7.3, 23], [-8.6, 20.2], [-9.2, 17.25], [-7.6, 17.15], [-5.4, 16.75], [-3.2, 16]],
  corners: [0, 4, 16],
  philtrumTo: 14.4,
  sideFrom: [9.2, 17.25],
  lip: [17.6, 9],
  sidesTo: 23.2,
  footFrom: 21,
  deep: "M-10 14 L10 14 L10 18 C6 17.8 3 17.1 0 16.9 C-3 17.1 -6 17.8 -10 18Z",
  deepCorners: "M-10 17 L-7.8 17.4 C-7.9 18.4 -8 19.4 -8.4 20.8 L-10 20.8Z M10 17 L7.8 17.4 C7.9 18.4 8 19.4 8.4 20.8 L10 20.8Z",
  // The tongue's top: a wide convex mound peaking 4.7 pt under the lip and running down to meet each side 3 pt lower.
  tongue: "M-9.4 31 L-9.4 23.6 C-8 21.8 -5 20.5 0 20.4 C5 20.5 8 21.8 9.4 23.6 L9.4 31Z",
  shine: [-0.3, 23.8, 4, 2.2],
  box: [-15, 10, 30, 21],
};

/**
 * Laughing's mouth, as the master sheet's Laughing draws it (DECISIONS 144), the primary for laughing and ticklish: the
 * open mouth at its widest and deepest, its curls out to 15.4 pt either side of the nose (the panel's 15.9 and 14.7),
 * the opening's top corners 12.2 pt out and its U a full round one 35.6 pt below the eyes (the panel's 35.8), the
 * tongue a big dome filling its lower half. Wider than Excited's open mouth, as the master sheet draws them.
 */
const LAUGH: Opened = {
  half: [[0, 14], [1.8, 14.9], [4.2, 15.8], [7, 16.5], [9.8, 16.9], [12, 16.85], [13.6, 16.3], [14.7, 15.4], [15.2, 14.5], [15.4, 13.7]],
  opening: [[0, 14.2], [4.2, 16.05], [7, 16.8], [9.8, 17.15], [12.2, 17.3], [12.1, 21.5], [11.4, 25.6], [10.1, 29.2], [8.2, 32.1], [5.8, 34.2], [3, 35.3],
    [0, 35.6], [-3, 35.3], [-5.8, 34.2], [-8.2, 32.1], [-10.1, 29.2], [-11.4, 25.6], [-12.1, 21.5], [-12.2, 17.3], [-9.8, 17.15], [-7, 16.8], [-4.2, 16.05]],
  corners: [0, 4, 18],
  philtrumTo: 14.2,
  sideFrom: [12.2, 17.3],
  lip: [17.6, 12],
  sidesTo: 29,
  footFrom: 27,
  deep: "M-13.5 14 L13.5 14 L13.5 18.4 C8.4 17.9 3.8 17.1 0 16.9 C-3.8 17.1 -8.4 17.9 -13.5 18.4Z",
  deepCorners: "M-13.5 17 L-10.8 17.4 C-10.9 18.8 -11 20.2 -11.5 22.2 L-13.5 22.2Z M13.5 17 L10.8 17.4 C10.9 18.8 11 20.2 11.5 22.2 L13.5 22.2Z",
  tongue: "M-12 38 L-12 27.4 C-10.2 24.4 -6.4 22.6 0 22.4 C6.4 22.6 10.2 24.4 12 27.4 L12 38Z",
  shine: [-0.4, 27.6, 5.4, 3],
  box: [-18, 10, 36, 28],
};

/**
 * The panting mouth's opening: the expression sheet's Laughing mouth (the laugh as first drawn), the open mouth wider
 * and deeper, its curls 14.3 pt out, its U 3.9 pt deeper than the open mouth's, so a long tongue hangs well past it.
 */
const PANT_OPENING: Opened = {
  half: [[0, 14], [1.6, 14.9], [3.6, 15.8], [6, 16.5], [8.4, 16.95], [10.4, 17.05], [12, 16.6], [13.2, 15.8], [14, 14.8], [14.3, 13.7]],
  opening: [[0, 14.2], [3.6, 16], [6, 16.75], [8.4, 17.15], [10.4, 17.25], [9.9, 20.8], [8.7, 24.5], [6.9, 27.9], [4.7, 30.6], [2.4, 31.95], [0, 32.4],
    [-2.4, 31.95], [-4.7, 30.6], [-6.9, 27.9], [-8.7, 24.5], [-9.9, 20.8], [-10.4, 17.25], [-8.4, 17.15], [-6, 16.75], [-3.6, 16]],
  corners: [0, 4, 16],
  philtrumTo: 14.2,
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

/**
 * Excited's open mouth, as the master sheet's Excited draws it (DECISIONS 144): the open mouth grown about as wide as
 * the laugh, its curls out to 15.3 pt either side of the nose (the panel's 15.2 and 15.6, the rest mouth's 12.9), the
 * opening's top corners 11.6 pt out and its U a full round one about as deep as the laugh's, the tongue a broad dome
 * filling its lower part. The rest mouth stays the turnaround's.
 */
const OPEN_WIDE: Opened = {
  half: [[0, 14], [1.8, 14.95], [4, 15.85], [6.6, 16.55], [9.2, 16.95], [11.6, 17.05], [13.2, 16.6], [14.4, 15.7], [15.1, 14.6], [15.3, 13.6]],
  opening: [[0, 14.2], [4, 16.05], [6.6, 16.8], [9.2, 17.15], [11.6, 17.25], [11.3, 20.6], [10.4, 24], [8.8, 27.2], [6.6, 29.8], [4.2, 31.3], [2, 31.95], [0, 32.15],
    [-2, 31.95], [-4.2, 31.3], [-6.6, 29.8], [-8.8, 27.2], [-10.4, 24], [-11.3, 20.6], [-11.6, 17.25], [-9.2, 17.15], [-6.6, 16.8], [-4, 16.05]],
  corners: [0, 4, 18],
  philtrumTo: 14.2,
  sideFrom: [11.6, 17.25],
  lip: [17.6, 11.4],
  sidesTo: 27.6,
  footFrom: 24.6,
  deep: "M-13 14 L13 14 L13 18.2 C8 17.9 3.6 17.1 0 16.9 C-3.6 17.1 -8 17.9 -13 18.2Z",
  deepCorners: "M-13 17 L-10.2 17.4 C-10.3 18.6 -10.4 19.8 -10.9 21.6 L-13 21.6Z M13 17 L10.2 17.4 C10.3 18.6 10.4 19.8 10.9 21.6 L13 21.6Z",
  tongue: "M-11.6 34 L-11.6 25.4 C-10 23 -6.2 21.6 0 21.5 C6.2 21.6 10 23 11.6 25.4 L11.6 34Z",
  shine: [-0.4, 25.4, 5, 2.7],
  box: [-18, 10, 36, 25],
};

/** Cheeky's: the open mouth with the tongue out over the lower lip and hanging past it, broad and round, as Mischievous and Cheeky draw it. */
const CHEEKY: Opened = {
  ...OPEN,
  out: [[0, 21.4], [3.4, 21.8], [5.9, 23.2], [6.8, 25.6], [6.7, 28.4], [5.8, 30.9], [4.1, 32.8], [2.1, 33.8], [0, 34.1]],
  box: [-15, 10, 30, 27],
};

/** Pant: a laughing mouth's wide opening with the tongue further out, longer and narrower, hanging straight down to just above the chin. */
const PANT: Opened = {
  ...PANT_OPENING,
  out: [[0, 22.4], [3.2, 22.8], [5.4, 24.4], [6, 27], [5.8, 30.2], [5.1, 33.2], [3.8, 35.6], [2, 36.9], [0, 37.2]],
  box: [-17, 10, 34, 30],
};

/** A mouth drawn as an opening alone, an upright egg (o, yawn), typed in the face frame. */
interface Oval {
  /** The opening's right half (the viewer's right), from its top round to its foot. */
  half: P[];
  /** The tongue low in it, and its shine (centre and radii). */
  tongue: string;
  shine: [number, number, number, number];
  /** How far down the philtrum runs from the nose's foot. */
  philtrumTo: number;
  /** The tongue's tip peeking out over the rim (o.tongue): its outline, round from inside the opening out to its tip and back. */
  tip?: P[];
  box: Box;
}

/**
 * The o, as Surprised and the expression sheet's Tiny o draw it: an egg with its soft point up, widest low in it and
 * round under a broad foot; the mouth's deep red darkest under its top, the tongue's coral dome filling its lower
 * half, a dark red-brown rim down its sides and a warm one round its foot; the philtrum a short tick under the nose,
 * the o standing clear below it.
 */
function oval(o: Oval, f: FaceFrame): Mouth {
  // The right half fitted from its point to its foot (level there, so the two halves meet smoothly) and mirrored, so
  // the two sides are exact mirrors; a fit of the whole loop splits each side differently.
  const right = smooth(o.half, { closed: false }).segs;
  const flip = ([x, y]: P): P => [-x, y];
  const shape = { segs: [...right, ...right.map(([a, b, c, d]): Seg => [flip(d), flip(c), flip(b), flip(a)]).reverse()] };
  const m = pathD(shape.segs);
  const top = o.half[0]![1], footY = o.half[o.half.length - 1]![1];
  const doubled: [number, number] = [LIMITS.inner[0] * 2, LIMITS.inner[1] * 2];
  const edge = sample(shape.segs, 16, true);
  const mid = (top + footY) / 2;
  const sides = ([1, -1] as const).map((sx) => strokeOf(edge.filter(([x, y]) => sx * x > 0 && y < mid + 1.5).sort((a, b) => a[1] - b[1]), 1.8, { taper: 2.2, tip: 0.3, band: doubled }));
  const foot = strokeOf(edge.filter(([, y]) => y > mid).sort((a, b) => a[0] - b[0]), 1.5, { taper: 2.4, tip: 0.2, band: doubled });
  const rimLines: DrawnLine[] = [...sides.map((s) => ({ kind: "inner" as const, width: 0.9, where: "mouth side", drawn: [s.drawn[0] / 2, s.drawn[1] / 2] as [number, number] })),
    { kind: "inner", width: 0.75, where: "mouth foot", drawn: [foot.drawn[0] / 2, foot.drawn[1] / 2] }];
  const philtrum = innerLine([[0, 11.7], [0, o.philtrumTo]], 0.8, C.eyeDark, { taper: 0.45, tip: 0.35, wobble: 0 });
  const clip = uid("mouth"), soft = uid("blur"), lit = uid("blur"), edgeBlur = uid("blur");
  const [sx, sy, srx, sry] = o.shine;
  const svg = `<defs><clipPath id="${clip}"><path d="${m}"/></clipPath>${blur(soft, o.box, 0.45)}${blur(lit, o.box, 1.1)}${blur(edgeBlur, o.box, 0.2)}</defs>` +
    `<path d="${m}" fill="${C.mouthInside}"/><g clip-path="url(#${clip})">` +
    `<path d="M-8 ${r3(top - 1)} L8 ${r3(top - 1)} L8 ${r3(top + 3.2)} C3 ${r3(top + 2)} -3 ${r3(top + 2)} -8 ${r3(top + 3.2)}Z" fill="${C.mouthDeep}" opacity="0.6" filter="url(#${soft})"/>` +
    `<path d="${o.tongue}" fill="${C.tongue}" filter="url(#${soft})"/>` +
    `<ellipse cx="${sx}" cy="${sy}" rx="${srx}" ry="${sry}" fill="${C.tongueShine}" opacity="0.5" filter="url(#${lit})"/>` +
    `<g filter="url(#${edgeBlur})">${sides.map((s) => `<path d="${s.d}" fill="${C.mouthRim}"/>`).join("")}<path d="${foot.d}" fill="${C.tongueRim}"/></g></g>` +
    philtrum.svg;
  const tip = o.tip ? tongueTip(o.tip, f, o.box, (p) => insideOf(edge, p)) : undefined;
  return {
    piece: piece(f.place(svg + (tip?.svg ?? "")), f.box(o.box), { shapes: [], lines: [...rimLines, { ...philtrum.line, where: "philtrum" }, ...(tip ? [tip.line] : [])] }),
    opening: edge.map(f.at),
  };
}

/** Whether a point lies inside a closed polygon (even-odd). */
function insideOf(poly: P[], [x, y]: P): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!, [xj, yj] = poly[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * The tongue's tip peeking out of the mouth (o.tongue, and the smile's in the review-only variant): a small coral
 * lobe, lighter where the light falls, with the tongue's warm rim round the part that shows outside the mouth (`inside`
 * says which points lie within it), so it reads as the tip of the tongue the mouth already shows, poking out.
 */
function tongueTip(outline: P[], f: FaceFrame, box: Box, inside: (p: P) => boolean): { svg: string; line: DrawnLine } {
  const lobe = smooth(outline);
  const pts = sample(lobe.segs, 16, true);
  // The rim runs round the outside part only, from where the lobe leaves the mouth to where it goes back in.
  const k0 = pts.findIndex((p, i) => inside(p) && !inside(pts[(i + 1) % pts.length]!));
  const ring = [...pts.slice(k0 + 1), ...pts.slice(0, k0 + 1)];
  const out = ring.slice(0, ring.findIndex((p) => inside(p)));
  const rim = tapered(out, 0.8, "inner", "tongue tip", { taper: 1.6, tip: 0.15 });
  const soft = uid("blur"), lit = uid("blur");
  const [cx, cy] = outline.reduce((s, p) => [s[0] + p[0] / outline.length, s[1] + p[1] / outline.length], [0, 0]);
  const svg = `<defs>${blur(soft, box, 0.25)}${blur(lit, box, 0.9)}</defs>` +
    `<g filter="url(#${soft})"><path d="${pathD(lobe.segs)}" fill="${C.tongue}"/></g>` +
    `<ellipse cx="${r3(cx + f.light[0] * 1.1)}" cy="${r3(cy + f.light[1] * 1.1)}" rx="1.5" ry="1.2" fill="${C.tongueShine}" opacity="0.55" filter="url(#${lit})"/>` +
    `<path d="${rim.d}" fill="${C.tongueRim}"/>`;
  return { svg, line: rim.line };
}

/**
 * An egg's right half, pointed end up, from its top down to its foot: `top` and `height` down the face, `half` its
 * half-width at its widest, `widest` how far down that is (0 top, 1 foot). Above its widest its side is a superellipse
 * of exponent 1.7, which runs up to a soft point; below, one of 2.2, which rounds under a broad foot. Its last two
 * nodes lie level, so the mirrored halves meet smoothly there.
 */
function egg(top: number, height: number, half: number, widest: number): P[] {
  const yc = top + widest * height, above = yc - top, below = top + height - yc;
  const side = (s: number, n: number) => half * Math.max(0, 1 - s ** n) ** (1 / n);
  const r = (n: number) => Math.round(n * 100) / 100;
  return [
    ...[1, 0.97, 0.88, 0.7, 0.5, 0.3, 0.12, 0].map((s): P => [r(side(s, 1.7)), r(yc - s * above)]),
    ...[0.4, 0.7, 0.9].map((s): P => [r(side(s, 2.2)), r(yc + s * below)]),
    [r(side(0.98, 2.2)), r(top + height - 0.02)], [0, top + height],
  ];
}

/**
 * Surprised's o, measured in its level frame (DECISIONS 134): an egg drawn 10.5 pt tall and 9.4 wide, widest 0.63 of
 * the way down (the panel's 0.62 to 0.67), its widest 14.3 pt below the nose's middle, where the panel's corners are;
 * its top a soft point, its sides full, its foot broad and round, as the panel draws them.
 */
const O: Oval = {
  half: egg(14.9, 10.5, 4.75, 0.64),
  // A round dome, its top 2 pt above where it meets the sides, as the panel's tongue rises.
  tongue: "M-5.5 26.5 L-5.5 22.6 C-4.2 21.2 -2.2 20.6 0 20.6 C2.2 20.6 4.2 21.2 5.5 22.6 L5.5 26.5Z",
  shine: [-0.4, 22.6, 2, 1.1],
  philtrumTo: 13,
  box: [-7, 10, 14, 21],
};

/** The yawn: the o's egg grown to 18.3 pt tall and 12 wide, with the tongue low in its foot. */
const YAWN: Oval = {
  half: egg(15.6, 18.3, 6, 0.64),
  tongue: "M-7.5 35 L-7.5 30.8 C-5.4 29.2 -2.8 28.6 0 28.6 C2.8 28.6 5.4 29.2 7.5 30.8 L7.5 35Z",
  shine: [-0.6, 31, 2.6, 1.2],
  philtrumTo: 13.6,
  box: [-9, 10, 18, 27],
};

/**
 * Review-only (qa/phase3/faces/new), hungry's variant B: the tongue at a corner read as the o's own, its tip poking out
 * over the o's foot a little to the dog's left, round and short; the package's o.tongue is the lick at the smile's corner.
 */
const O_TONGUE: Oval = {
  ...O,
  tip: [[-0.6, 23], [1.6, 22.3], [3.6, 23], [4.3, 24.9], [4.1, 26.9], [3, 28.1], [1.5, 28.4], [0.1, 27.6], [-0.6, 25.9]],
  box: [-7, 10, 14, 21],
};
/** The o with the tongue's tip out over its foot (hungry's variant B, review-only). */
export const oTongue = (f: FaceFrame): Mouth => oval(O_TONGUE, f);

/** A closed mouth's lip from its right half (philtrum's foot out to the tip), in the smile's colours: the pressed mouth and the tiny smile. */
function closedLip(half: P[], philtrumTo: number, where: string, f: FaceFrame): Mouth {
  const lipShape = lipOf(half);
  const along = sample(lipShape.segs, 12, false);
  const lip = tapered(along, 0.9, "inner", where, { taper: 1.4, tip: 0.3 });
  const philtrum = innerLine([[0, 11.7], [0, philtrumTo]], 0.9, C.eyeDark, { taper: 0.9, tip: 0.75, wobble: 0 });
  const lipFade = uid("lip"), span = r3(half[half.length - 1]![0] + 0.5);
  const box: Box = [-span - 2, 10, 2 * span + 4, 10];
  const svg = `<defs><linearGradient id="${lipFade}" gradientUnits="userSpaceOnUse" x1="${-span}" y1="0" x2="${span}" y2="0">` +
    `<stop offset="0.05" stop-color="${C.dark}"/><stop offset="0.3" stop-color="${C.lipLine}"/><stop offset="0.7" stop-color="${C.lipLine}"/>` +
    `<stop offset="0.95" stop-color="${C.dark}"/></linearGradient></defs>` +
    `<path d="${lip.d}" fill="url(#${lipFade})"/>${philtrum.svg}`;
  return {
    piece: piece(f.place(svg), f.box(box), { shapes: [], lines: [lip.line, { ...philtrum.line, where: "philtrum" }] }),
    lip: { line: along.map(f.at), centre: f.at(half[0]!) },
  };
}

/**
 * Huffy's pressed mouth (new drawing, no panel): the lips pressed together in a short, nearly level line about a third
 * of the smile's width, dipping a hair at the philtrum's foot either side and its ends tucked 0.2 pt above where the
 * philtrum meets it, so it never turns down and never pushes out into a pout.
 */
export const PRESSED: P[] = [[0, 14.5], [1.2, 14.72], [2.5, 14.82], [3.7, 14.72], [4.6, 14.5], [5.1, 14.3]];

/** The tiny smile of huffy's peek back (new drawing, no panel): the smile's W at about three fifths of its width, its tips curling up. */
export const TINY_SMILE: P[] = [[0, 14.6], [1.6, 15.3], [3.4, 15.9], [5.2, 16.05], [6.8, 15.7], [7.9, 15], [8.5, 14.2]];

/**
 * Hungry's o.tongue (new drawing, no panel), the beat after the o: the mouth closes into the small smile and the
 * tongue's tip peeks out at its corner on the dog's left (the viewer's right), under the arc just inside its curl, as
 * a dog licks its lips at a treat: a round coral lobe about 6 pt long and 5.5 wide, its rim warm, its foot 5 pt below
 * the lip, never hanging toward the chin, so it reads as a lick, not a pant. The lip keeps its ends above its middle (R3).
 */
function lick(f: FaceFrame): Mouth {
  const m = smile(f);
  // The lip's line dips to 17.6 pt about 8 pt out; the lobe comes out from under it there and shows below it.
  const box: Box = [-16, 10, 32, 14];
  // Its top lies along the lip's line, which is drawn over it; inside the mouth is above that line.
  const tip = tongueTip([[7.6, 17.55], [9.8, 17.4], [11.8, 16.9], [13.3, 17.7], [13.9, 19.7], [13.3, 21.8], [11.6, 22.9], [9.6, 22.4], [8.2, 20.4]], f, box,
    ([x, y]) => y < 17.9 - 0.035 * (x - 8) ** 2);
  return { ...m, piece: { svg: f.place(tip.svg) + m.piece.svg, box: union(m.piece.box, f.box(box)), meta: { ...m.piece.meta, lines: [...m.piece.meta.lines, tip.line] } } };
}

/**
 * The small smile, as the expression sheet's Small smile and the master sheet's Content and Winking draw it: the
 * philtrum down from the nose into two broad bowed arcs, a W, each lowest about halfway out and curling up at its
 * tip, its tips a little above its middle, never a frown; the line a deep red-brown in its middle and the printed dark
 * brown out along its ends, as the open mouth's lip is. Measured on Content in its level frame (DECISIONS 143): the
 * W runs 13.4 pt out either side of the nose (12.8 and 14), its arcs bottom out 17.6 pt below the eyes' midpoint
 * about 8 pt out, and its tips curl back up to about the philtrum's foot.
 */
function smile(f: FaceFrame): Mouth {
  const half: P[] = [[0, 14.5], [1.4, 15.2], [2.9, 16.05], [4.5, 16.8], [6.2, 17.35], [8, 17.6], [9.8, 17.4], [11.3, 16.85], [12.5, 16], [13.4, 15.1], [14, 14.15]];
  const lipShape = lipOf(half);
  const along = sample(lipShape.segs, 12, false);
  const lip = tapered(along, 0.9, "inner", "smile", { taper: 1.8, tip: 0.3 });
  const philtrum = innerLine([[0, 11.7], [0, 14.7]], 0.9, C.eyeDark, { taper: 0.9, tip: 0.75, wobble: 0 });
  const lipFade = uid("lip");
  const box: Box = [-16, 10, 32, 10];
  const svg = `<defs><linearGradient id="${lipFade}" gradientUnits="userSpaceOnUse" x1="-14.5" y1="0" x2="14.5" y2="0">` +
    `<stop offset="0.08" stop-color="${C.dark}"/><stop offset="0.3" stop-color="${C.lipLine}"/><stop offset="0.7" stop-color="${C.lipLine}"/>` +
    `<stop offset="0.92" stop-color="${C.dark}"/></linearGradient></defs>` +
    `<path d="${lip.d}" fill="url(#${lipFade})"/>${philtrum.svg}`;
  return {
    piece: piece(f.place(svg), f.box(box), { shapes: [], lines: [lip.line, { ...philtrum.line, where: "philtrum" }] }),
    lip: { line: along.map(f.at), centre: f.at(half[0]!) },
  };
}

export function mouth(state: MouthState, f: FaceFrame): Mouth {
  switch (state) {
    case "smile":
      return smile(f);
    case "open":
      return opened(OPEN, f);
    case "openWide":
      return opened(OPEN_WIDE, f);
    case "laugh":
      return opened(LAUGH, f);
    case "o":
      return oval(O, f);
    case "cheeky":
      return opened(CHEEKY, f);
    case "yawn":
      return oval(YAWN, f);
    case "pant":
      return opened(PANT, f);
    case "o.tongue":
      return lick(f);
    case "pressed":
      return closedLip(PRESSED, 14.5, "pressed mouth", f);
    case "tinySmile":
      return closedLip(TINY_SMILE, 14.6, "tiny smile", f);
  }
}
