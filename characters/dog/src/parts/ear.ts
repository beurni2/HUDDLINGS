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
import { sample, smooth, v, type P, type Shape } from "../../../draw/geom.ts";
import { strokeOf } from "../../../draw/line.ts";
import type { Paint } from "../../../draw/paint.ts";
import { blur, pad, uid, type Box } from "../../../draw/svg.ts";
import { C } from "../palette.ts";

export interface EarFur {
  /** The ear's shape, its whole box painted. */
  ear: Shape;
  /** From the top of the ear to its lower edge: the tan's light-to-deep axis. */
  axis: [P, P];
  /** Where along the axis the deepening starts and where it is deepest, as shares (0 the top, 1 the lower edge). */
  deepen?: [number, number];
  /** 4 to 7 locks, each typed from where it comes in, partway down, along the ear's curve into the lower edge. */
  locks: P[][];
  /** The dips of the lower edge between its clumps, each a crease rising up into the ear. */
  dips: P[];
  /** Where the light falls on the upper outer side, as path data. */
  light: string;
  /** Shade where the ear tucks under the head or the cheek, as path data. */
  under: string[];
  /** The fold where the ear turns over along its back or outer edge: its contour, typed from the top down, and the back layer beyond it, as path data. */
  fold?: { line: P[]; back: string };
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** The ear's paint: fill, the painted fur under the shade, the shade and the light. Its line is the line rule's (parts/lines.ts). */
export function earFur(e: EarFur): Paint {
  if (e.locks.length < 4 || e.locks.length > 7) throw new Error(`an ear carries 4 to 7 locks, not ${e.locks.length}`);
  if (e.dips.length < 1 || e.dips.length > 2) throw new Error(`an ear's lower edge is 2 or 3 clumps, not ${e.dips.length + 1}`);
  const [x0, y0, x1, y1] = e.ear.segs.flat().reduce((b, [x, y]) => [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)], [Infinity, Infinity, -Infinity, -Infinity]);
  const box: Box = pad([x0, y0, x1 - x0, y1 - y0], 2);
  const [d0, d1] = e.deepen ?? [0.3, 0.95];
  const deep = uid("deep"), top = uid("top"), lockBlur = uid("blur"), creaseBlur = uid("blur"), backBlur = uid("blur");
  const [a, b] = e.axis;
  const at = (t: number): P => v.add(a, v.mul(v.sub(b, a), t));
  const along = (pts: P[]) => sample(smooth(pts, { closed: false }).segs, 8, false);
  // Each lock: a soft stroke, widest a little below its middle, tapering to nothing at both ends, its lengths uneven.
  const locks = e.locks.map((pts, k) => strokeOf(along(pts), 1.9, { taper: 5, tip: 0.15, wobble: 0.15, seed: 3 + k }).d).join("");
  // From each dip of the lower edge, a short crease rising into the ear, following the nearest lock.
  const creases = e.dips.map((dip) => {
    const near = e.locks.map((pts) => pts[pts.length - 1]!).reduce((best, p) => (v.len(v.sub(p, dip)) < v.len(v.sub(best, dip)) ? p : best));
    const lock = e.locks.find((pts) => pts[pts.length - 1] === near)!;
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
