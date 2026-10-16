// The dog's ear paint, one recipe for every view (DECISIONS 76, 81): painted fur, never stripes. The tan is lighter
// toward the top and where the light falls (the head patches' paler tan, softly, and a soft sheen on the upper outer
// side), and deepens down the ear to a browner tan along its lower edge and where it tucks under the head (the fur's
// own warm shade, multiplied, as the sheet's lower ear deepens to about #D89464 and #C17D50); over it lie 4 to 7 locks
// of fur, each a soft darker stroke tapering at both ends, of uneven lengths, that come in from nothing partway down
// and follow the ear's droop into the lower edge, gathering in its lower half, as the sheets paint them (no lock runs
// the ear's whole length and none has a lighter twin beside it, which read as corduroy); the softly scalloped lower edge
// (2 or 3 clumps) is a little darker, with a short soft crease rising from each dip. Where the ear turns over at its
// back or outer edge, the sheet draws the fold as a soft inner contour with the back layer a little deeper beyond it
// (`fold`). Each view types its locks, its light, its shade and its fold from its own crop.
// The fur pass (DECISIONS 215) adds the ear's edge, built by earEdge() from the view's own outline: a lock step or two
// down the outer edge, a hem of 3 or 4 rounded lock tips, and one line round it, thin and light at the top and heavier
// and darker at the hem, as the floppy-ears panel draws it; earFur() then takes the hem's notches for its creases and
// ends its locks in the hem's tips. Every ear state with its own outline (the perked and lifted ears, the turned perked
// ears) builds its edge the same way. A view that passes no edge paints its ears as before.
import { furEdge, type FurRules, type Lock } from "../../../draw/fur.ts";
import { sample, smooth, v, type P, type Shape } from "../../../draw/geom.ts";
import { strokeOf } from "../../../draw/line.ts";
import type { Paint } from "../../../draw/paint.ts";
import { blur, pad, uid, type Box } from "../../../draw/svg.ts";
import { C } from "../palette.ts";
import type { LitSpan, SpanEnd } from "./lines.ts";

export interface EarFur {
  /** The ear's shape, its whole box painted. */
  ear: Shape;
  /** From the top of the ear to its lower edge: the tan's light-to-deep axis. */
  axis: [P, P];
  /** Where along the axis the deepening starts and where it is deepest, as shares (0 the top, 1 the lower edge). */
  deepen?: [number, number];
  /** 4 to 7 locks, each typed from where it comes in, partway down, along the ear's curve into the lower edge. */
  locks: P[][];
  /** The dips of the lower edge between its clumps, each a crease rising up into the ear (with `edge`, its hem's notches instead). */
  dips: P[];
  /** Where the light falls on the upper outer side, as path data. */
  light: string;
  /** Shade where the ear tucks under the head or the cheek, as path data. */
  under: string[];
  /** The fold where the ear turns over along its back or outer edge: its contour, typed from the top down, and the back layer beyond it, as path data. */
  fold?: { line: P[]; back: string };
  /** The edge earEdge() built (DECISIONS 215): its hem's notches are the creases' dips, and each lock ends in the hem tip nearest its end, its spacing and lengths uneven. */
  edge?: EarEdge;
}

/** A row of rules for the ear's edge (DECISIONS 215, from the floppy-ears panel). */
export const EAR = {
  /** The hem: 3 or 4 rounded lock tips, each notch between two 1 to 2 pt deep (a tip's length and the notch's dip together), no two alike. */
  hem: { count: [3, 4], len: [0.6, 2], width: [4, 18], tipRound: 0.6, lean: [0, 0.6], ratio: 0.05, vary: 0.2, dip: [0, 1], fit: 0.15 } as FurRules,
  /** How deep a hem notch lies below the tips beside it: a tip's length and the notch's dip, in points. */
  notch: [1, 2] as [number, number],
  /** A lock step down the outer edge: one lock leaning hard down along the edge, so the edge steps out below it. */
  step: { count: [1, 1], len: [0.7, 2], width: [2.5, 9], tipRound: 0.35, lean: [0.3, 0.9], ratio: 0.1, vary: 0, dip: [0, 0], fit: 0.15 } as FurRules,
  /** How many steps down the outer edge. */
  steps: [1, 2] as [number, number],
};

export interface EarEdgeSpec {
  /** The ear's outline before its fur: the view's own droplet, or a state's (the perked, the lifted, a turned perked ear). */
  base: Shape;
  /** 1 or 2 lock steps down the outer edge, each one lock on a short span of it, in path order (one about 40% of the way down). */
  steps: { from: P; to: P; lock: Lock }[];
  /** The hem: 3 or 4 rounded lock tips across the ear's lower edge, typed from the crop with their widths (in profile the rearmost leaning up the back edge). */
  hem: { from: P; to: P; locks: Lock[]; tipRound: number };
  /** From the ear's top to its hem: its line is thin and light at the top, heavier and darker at the hem. */
  axis: [P, P];
  /** Where the line runs, in path order: from where it comes out from under the head round the hem and up the outer edge to the root under the crown. */
  line: { from: P; to: P; ends?: [SpanEnd, SpanEnd] };
  /** How deep the line lies at the hem, whatever the light (0.7 by default, the ears' deep line where they hang over the body). */
  deep?: number;
}

export interface EarEdge {
  shape: Shape;
  /** One continuous span round the ear, on the tan. */
  span: LitSpan;
  /** The hem's lock tips and the notches between them, in path order. */
  tips: P[];
  notches: P[];
}

/**
 * The ear's edge, as the floppy-ears panel draws it: its outline with a lock step or two down the outer edge and its
 * hem in 3 or 4 rounded lock tips, and one line round it all. Throws when the typed rows break the ear's rules.
 */
export function earEdge(e: EarEdgeSpec): EarEdge {
  if (e.steps.length < EAR.steps[0] || e.steps.length > EAR.steps[1]) throw new Error(`an ear's outer edge has 1 or 2 lock steps, not ${e.steps.length}`);
  e.hem.locks.forEach((l, i) => {
    if (i === e.hem.locks.length - 1) return;
    const depth = Math.min(l.len, e.hem.locks[i + 1]!.len) + (l.dip ?? 0);
    if (depth < EAR.notch[0] - 1e-9 || depth > EAR.notch[1] + 1e-9) throw new Error(`the ear's hem notch after tip ${i} is ${depth.toFixed(2)} pt deep, not ${EAR.notch[0]} to ${EAR.notch[1]}`);
  });
  const tips: P[] = [], notches: P[] = [];
  // furEdge keeps the path outside its span exactly, so the steps and the hem go on without moving each other.
  const stepped = e.steps.reduce((shape, st) => furEdge(shape, st.from, st.to, [st.lock], 0.3, undefined, EAR.step), e.base);
  const shape = furEdge(stepped, e.hem.from, e.hem.to, e.hem.locks, e.hem.tipRound, (tip, _root, [, b]) => (tips.push(tip), notches.push(b)), EAR.hem);
  // The notch after the last tip is the hem's own end, on the base: only those between two tips are notches.
  notches.pop();
  const [a, b] = e.axis, deep = e.deep ?? 0.7, along = v.sub(b, a), length2 = v.dot(along, along);
  const t = (p: P) => Math.min(1, Math.max(0, v.dot(v.sub(p, a), along) / length2));
  const span: LitSpan = { from: e.line.from, to: e.line.to, on: "tan", ends: e.line.ends ?? ["under", "under"], under: (p: P) => deep * t(p) ** 1.5 };
  return { shape, span, tips, notches };
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** How evenly a set of numbers lies: their spread over their mean. */
const spread = (xs: number[]) => {
  const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
  return Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / xs.length) / mean;
};
/** The least spread the locks' lengths and their spacing across the ear may have, so they never read as a comb (the side's and back's first ears). */
export const UNEVEN = 0.15;

/** The ear's paint: fill, the painted fur under the shade, the shade and the light. Its line is the line rule's (parts/lines.ts). */
export function earFur(e: EarFur): Paint {
  if (e.locks.length < 4 || e.locks.length > 7) throw new Error(`an ear carries 4 to 7 locks, not ${e.locks.length}`);
  let locksAt = e.locks, dips = e.dips;
  if (e.edge) {
    if (e.edge.notches.length < 2 || e.edge.notches.length > 3) throw new Error(`an ear's hem is 3 or 4 lock tips, not ${e.edge.notches.length + 1}`);
    dips = e.edge.notches;
    // Each lock ends a little inside the hem tip nearest its end, so the painted fur runs out into the locks of the edge.
    locksAt = e.locks.map((pts) => {
      const end = pts[pts.length - 1]!, before = pts[pts.length - 2] ?? pts[0]!;
      const tip = e.edge!.tips.reduce((best, p) => (v.len(v.sub(p, end)) < v.len(v.sub(best, end)) ? p : best));
      return [...pts.slice(0, -1), v.add(tip, v.mul(v.norm(v.sub(before, tip)), 1.6))];
    });
    const [a, b] = e.axis, across: P = v.norm([-(b[1] - a[1]), b[0] - a[0]]);
    const lengths = locksAt.map((pts) => pts.slice(1).reduce((s, p, i) => s + v.len(v.sub(p, pts[i]!)), 0));
    const starts = locksAt.map((pts) => v.dot(pts[0]!, across)).sort((x, y) => x - y);
    const gaps = starts.slice(1).map((x, i) => x - starts[i]!);
    if (spread(lengths) < UNEVEN || spread(gaps) < UNEVEN)
      throw new Error(`an ear's locks are too even (lengths ${spread(lengths).toFixed(2)}, spacing ${spread(gaps).toFixed(2)}, at least ${UNEVEN}): they read as a comb`);
  } else if (e.dips.length < 1 || e.dips.length > 2) throw new Error(`an ear's lower edge is 2 or 3 clumps, not ${e.dips.length + 1}`);
  const [x0, y0, x1, y1] = e.ear.segs.flat().reduce((b, [x, y]) => [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)], [Infinity, Infinity, -Infinity, -Infinity]);
  const box: Box = pad([x0, y0, x1 - x0, y1 - y0], 2);
  const [d0, d1] = e.deepen ?? [0.3, 0.95];
  const deep = uid("deep"), top = uid("top"), lockBlur = uid("blur"), creaseBlur = uid("blur"), backBlur = uid("blur");
  const [a, b] = e.axis;
  const at = (t: number): P => v.add(a, v.mul(v.sub(b, a), t));
  const along = (pts: P[]) => sample(smooth(pts, { closed: false }).segs, 8, false);
  // Each lock: a soft stroke, widest a little below its middle, tapering to nothing at both ends, its lengths uneven.
  const locks = locksAt.map((pts, k) => strokeOf(along(pts), 1.9, { taper: 5, tip: 0.15, wobble: 0.15, seed: 3 + k }).d).join("");
  // From each dip of the lower edge, a short crease rising into the ear, following the nearest lock.
  const creases = dips.map((dip) => {
    const near = locksAt.map((pts) => pts[pts.length - 1]!).reduce((best, p) => (v.len(v.sub(p, dip)) < v.len(v.sub(best, dip)) ? p : best));
    const lock = locksAt.find((pts) => pts[pts.length - 1] === near)!;
    const up = v.norm(v.sub(lock[Math.max(0, lock.length - 3)]!, near));
    return strokeOf([dip, v.add(dip, v.mul(up, 3)), v.add(dip, v.mul(up, 6))], 1.2, { taper: 2.6, tip: 0.15 }).d;
  }).join("");
  const [t0, t1] = [at(0), at(1)];
  const under = `<defs><linearGradient id="${deep}" gradientUnits="userSpaceOnUse" x1="${r3(t0[0])}" y1="${r3(t0[1])}" x2="${r3(t1[0])}" y2="${r3(t1[1])}">` +
    `<stop offset="${d0}" stop-color="${C.earDeep}" stop-opacity="0"/><stop offset="${r3(d0 + (d1 - d0) * 0.4)}" stop-color="${C.earDeep}"/>` +
    `<stop offset="${r3(d0 + (d1 - d0) * 0.8)}" stop-color="${C.earDeeper}"/><stop offset="${d1}" stop-color="${C.earFoot}"/></linearGradient>` +
    `<linearGradient id="${top}" gradientUnits="userSpaceOnUse" x1="${r3(t0[0])}" y1="${r3(t0[1])}" x2="${r3(t1[0])}" y2="${r3(t1[1])}">` +
    `<stop offset="0" stop-color="${C.patch}" stop-opacity="0.4"/><stop offset="${r3(d0 + 0.2)}" stop-color="${C.patch}" stop-opacity="0"/></linearGradient>` +
    `${blur(lockBlur, box, 0.55)}${blur(creaseBlur, box, 0.4)}${blur(backBlur, box, 1.4)}</defs>` +
    `<rect x="${r3(x0)}" y="${r3(y0)}" width="${r3(x1 - x0)}" height="${r3(y1 - y0)}" fill="url(#${deep})"/>` +
    `<rect x="${r3(x0)}" y="${r3(y0)}" width="${r3(x1 - x0)}" height="${r3(y1 - y0)}" fill="url(#${top})"/>` +
    (e.fold ? `<path d="${e.fold.back}" fill="${C.earDeep}" opacity="0.5" filter="url(#${backBlur})"/>` : "") +
    `<path d="${locks}" fill="${C.earLow}" opacity="0.4" filter="url(#${lockBlur})"/>` +
    `<path d="${creases}" fill="${C.earLow}" opacity="0.5" filter="url(#${creaseBlur})"/>`;
  return {
    fill: C.marking,
    under,
    // The rim away from the light, and where it tucks under the head or the cheek.
    shade: { multiply: C.furShadeBy, rim: { inset: 2.2, toLight: 3.6 }, shapes: e.under, blur: 3 },
    highlight: { d: e.light, colour: C.patch, opacity: 0.45, blur: 2.8 },
    // The fold's soft inner contour, in the ears' deep line.
    ...(e.fold ? { inner: [{ pts: along(e.fold.line), width: 0.8, colour: C.earLine, opacity: 0.5 }] } : {}),
  };
}
