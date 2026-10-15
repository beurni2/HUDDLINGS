// The dog's mouths, one recipe per state for every view, each typed once in the face's own frame (parts/face.ts:
// the origin midway between the eyes, y down, the nose's foot at y 11.7) from the expression sheet's panels, and
// placed by the view's frame. Every state keeps its corners at or above the mouth's middle (rule R3: never a
// downturned mouth; characters/dog/test/faces.test.ts holds each one to it).
// - smile: the sheet's small smile (Small smile, Content, Winking): the philtrum down from the nose into two small
//   bowed arcs that curl up at their tips, a W, never a single frown;
// - open: the turnaround's open happy mouth (the rest; DECISIONS 50, 85);
// - laugh: Laughing's, wider and deeper, the tongue a bigger dome;
// - o: Surprised's small o, an upright egg with the tongue low in it;
// - cheeky: Mischievous's and Cheeky's open mouth with the tongue out over the lower lip;
// - yawn: a tall o with the tongue low, drawn for yawns (no panel);
// - pant: the open mouth with the tongue further out, drawn for panting (no panel).
import { mirrorX, pathD, sample, smooth, type Node, type P } from "../../../draw/geom.ts";
import { innerLine, strokeOf, type DrawnLine, type Stroke } from "../../../draw/line.ts";
import { LIMITS } from "../../../draw/lint.ts";
import { blur, piece, uid, type Box, type Piece } from "../../../draw/svg.ts";
import { C } from "../palette.ts";
import type { FaceFrame } from "./face.ts";

export const MOUTH_STATES = ["smile", "open", "laugh", "o", "cheeky", "yawn", "pant"] as const;
export type MouthState = (typeof MOUTH_STATES)[number];

export interface Mouth {
  piece: Piece;
  /** What it draws, for the R3 guard: the lip line and the opening's edge, evenly sampled, in model space. */
  outline: P[];
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
  const drawn = [...sample(lipShape.segs, 12, false), ...sample(opening.segs, 12, true), ...(lobe ? sample(lobe.segs, 12, true) : [])];
  return {
    piece: piece(f.place(svg), f.box(o.box), { shapes: [], lines: [lip.line, ...rimLines, ...outLines, { ...philtrum.line, where: "philtrum" }] }),
    outline: drawn.map(f.at),
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
 * Laughing's mouth, as the Laughing panel and the expression sheet's Laughing mouth draw it: the open mouth wider and
 * deeper, its curls out at the corners the panel's (14 pt either side of the nose, the open mouth's 12.9), its U
 * running 3.9 pt deeper, the tongue a bigger dome.
 */
const LAUGH: Opened = {
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

/** Cheeky's: the open mouth with the tongue out over the lower lip and hanging past it, broad and round, as Mischievous and Cheeky draw it. */
const CHEEKY: Opened = {
  ...OPEN,
  out: [[0, 21.4], [3.4, 21.8], [5.9, 23.2], [6.8, 25.6], [6.7, 28.4], [5.8, 30.9], [4.1, 32.8], [2.1, 33.8], [0, 34.1]],
  box: [-15, 10, 30, 27],
};

/** Pant: the laughing mouth's wide opening with the tongue further out, longer and narrower, hanging straight down to just above the chin. */
const PANT: Opened = {
  ...LAUGH,
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
  box: Box;
}

/**
 * The o, as Surprised and the expression sheet's Tiny o draw it: an upright egg a little pointed at its top, the
 * mouth's deep red darkest under its top, the tongue's coral dome filling its lower part, a dark red-brown rim down its
 * sides and a warm one round its foot; the philtrum a short tick under the nose, the o standing clear below it.
 */
function oval(o: Oval, f: FaceFrame): Mouth {
  const shape = smooth([...o.half, ...mirrorX(o.half.slice(1, -1), false)], { corners: [0] });
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
  return {
    piece: piece(f.place(svg), f.box(o.box), { shapes: [], lines: [...rimLines, { ...philtrum.line, where: "philtrum" }] }),
    outline: edge.map(f.at),
  };
}

/** Surprised's small o (its sides 4.2 pt either side of the nose's middle, 14.3 pt below it). */
const O: Oval = {
  half: [[0, 17.2], [1.75, 17.75], [3.25, 19.05], [4.1, 20.7], [4.2, 22], [3.9, 24], [3.1, 26], [1.75, 27.55], [0, 28.1]],
  tongue: "M-5 29 L-5 25 C-3.6 23.7 -1.8 23.3 0 23.3 C1.8 23.3 3.6 23.7 5 25 L5 29Z",
  shine: [-0.4, 25.2, 1.8, 1.1],
  philtrumTo: 13,
  box: [-7, 10, 14, 21],
};

/** The yawn: a tall o, twice the o's height, with the tongue low in its foot. */
const YAWN: Oval = {
  half: [[0, 15.8], [2.7, 16.6], [4.8, 18.8], [5.8, 21.6], [6, 24.3], [5.6, 27.6], [4.3, 30.8], [2.3, 33], [0, 33.8]],
  tongue: "M-7 35 L-7 31 C-5 29.5 -2.6 28.9 0 28.9 C2.6 28.9 5 29.5 7 31 L7 35Z",
  shine: [-0.6, 31.2, 2.4, 1.2],
  philtrumTo: 13.6,
  box: [-9, 10, 18, 27],
};

/**
 * The small smile, as the expression sheet's Small smile, Content and Winking draw it: the philtrum down from the
 * nose into two small bowed arcs, a W, each curling up at its tip, its tips above its middle, never a frown; the line
 * a deep red-brown in its middle and the printed dark brown out along its ends, as the open mouth's lip is.
 */
function smile(f: FaceFrame): Mouth {
  const half: P[] = [[0, 14.4], [1.4, 15.6], [3.1, 16.6], [5.1, 17.15], [7.1, 17.05], [8.9, 16.5], [10.4, 15.6], [11.6, 14.5], [12.3, 13.4]];
  const lipShape = lipOf(half);
  const along = sample(lipShape.segs, 12, false);
  const lip = tapered(along, 0.9, "inner", "smile", { taper: 2.4, tip: 0.3 });
  const philtrum = innerLine([[0, 11.7], [0, 14.6]], 0.9, C.eyeDark, { taper: 0.9, tip: 0.75, wobble: 0 });
  const lipFade = uid("lip");
  const box: Box = [-15, 10, 30, 10];
  const svg = `<defs><linearGradient id="${lipFade}" gradientUnits="userSpaceOnUse" x1="-13" y1="0" x2="13" y2="0">` +
    `<stop offset="0.08" stop-color="${C.dark}"/><stop offset="0.3" stop-color="${C.lipLine}"/><stop offset="0.7" stop-color="${C.lipLine}"/>` +
    `<stop offset="0.92" stop-color="${C.dark}"/></linearGradient></defs>` +
    `<path d="${lip.d}" fill="url(#${lipFade})"/>${philtrum.svg}`;
  return {
    piece: piece(f.place(svg), f.box(box), { shapes: [], lines: [lip.line, { ...philtrum.line, where: "philtrum" }] }),
    outline: along.map(f.at),
  };
}

export function mouth(state: MouthState, f: FaceFrame): Mouth {
  switch (state) {
    case "smile":
      return smile(f);
    case "open":
      return opened(OPEN, f);
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
  }
}
