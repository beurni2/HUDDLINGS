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
  /** A tongue hanging out over the lower lip: its outline, typed from where it leaves the opening's left side round its tip. */
  out?: Node[];
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
  if (o.out) {
    // The tongue over the lower lip: its coral lobe from inside the opening down past the foot, a soft groove down its
    // middle, lighter where the light falls, and the tongue's warm rim round the part that hangs out.
    const lobe = smooth([...o.out, ...mirrorX(o.out, false).reverse()], { corners: [0, 2 * o.out.length - 1] });
    const lobeD = pathD(lobe.segs);
    const rimPts = sample(lobe.segs, 16, true).filter(([, y]) => y > o.footFrom + 1);
    const tip = Math.max(...rimPts.map(([, y]) => y));
    const rim = tapered(rimPts.sort((a, b) => a[0] - b[0]), 0.75, "inner", "tongue rim", { taper: 2.4, tip: 0.15 });
    const groove = innerLine([[0, o.footFrom - 1], [0, (o.footFrom + tip) / 2], [0, tip - 2.2]], 0.7, C.tongueRim, { taper: 2, tip: 0.1, opacity: 0.6, wobble: 0 });
    const lobeLit = uid("blur");
    out = `<defs>${blur(lobeLit, o.box, 1.4)}</defs><path d="${lobeD}" fill="${C.tongue}"/>` +
      `<ellipse cx="${-1.6}" cy="${(o.footFrom + tip) / 2 - 1}" rx="3.2" ry="2.6" fill="${C.tongueShine}" opacity="0.45" filter="url(#${lobeLit})"/>` +
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
  const drawn = [...sample(lipShape.segs, 12, false), ...sample(opening.segs, 12, true),
    ...(o.out ? sample(smooth([...o.out, ...mirrorX(o.out, false).reverse()]).segs, 12, true) : [])];
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

export function mouth(state: MouthState, f: FaceFrame): Mouth {
  switch (state) {
    case "open":
      return opened(OPEN, f);
    default:
      throw new Error(`no ${state} mouth yet`);
  }
}
