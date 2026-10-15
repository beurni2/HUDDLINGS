// The dog's ear paint, one recipe for every view (DECISIONS 76): painted fur, never stripes. The tan is lighter toward
// the top and where the light falls (the head patches' paler tan, softly), and deepens down the ear to a browner
// tan along its lower edge and where it tucks under the head (the fur's own warm shade, multiplied, as the sheet's
// lower ear deepens to about #D89464 and #C17D50); over it lie 4 to 7 long darker locks of fur, each a broad soft
// stroke tapering at both ends that follows the ear's curve down into the lower edge, with a faint lighter strand
// along its lit side, and a short soft crease rising from each dip of the softly scalloped lower edge (2 or 3 clumps,
// in each view's shape). No hairlines. Each view types its locks, its light and its shade from its own crop.
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
  /** 4 to 7 locks, each typed from its upper end down along the ear's curve into the lower edge. */
  locks: P[][];
  /** The dips of the lower edge between its clumps, each a crease rising up into the ear. */
  dips: P[];
  /** Where the light falls on the upper outer side, as path data. */
  light: string;
  /** Shade where the ear tucks under the head or the cheek, as path data. */
  under: string[];
  /** The light, toward it (the creases' and strands' sides). */
  toLight?: P;
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** The ear's paint: fill, the painted fur under the shade, the shade and the light. Its line is the line rule's (parts/lines.ts). */
export function earFur(e: EarFur): Paint {
  const [x0, y0, x1, y1] = e.ear.segs.flat().reduce((b, [x, y]) => [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)], [Infinity, Infinity, -Infinity, -Infinity]);
  const box: Box = pad([x0, y0, x1 - x0, y1 - y0], 2);
  const [d0, d1] = e.deepen ?? [0.3, 0.95];
  const deep = uid("deep"), top = uid("top"), fade = uid("fade"), lockBlur = uid("blur"), litBlur = uid("blur"), creaseBlur = uid("blur");
  const [a, b] = e.axis;
  const at = (t: number): P => v.add(a, v.mul(v.sub(b, a), t));
  const toLight = e.toLight ?? v.norm([-1, -1.25]);
  const along = (pts: P[]) => sample(smooth(pts, { closed: false }).segs, 8, false);
  // Each lock: a broad soft stroke, widest a little above its middle, tapering to nothing at both ends.
  const locks = e.locks.map((pts) => strokeOf(along(pts), 2.6, { taper: 9, tip: 0.2, wobble: 0.12 }).d).join("");
  // Beside each lock on its lit side, a faint lighter strand, the next lock's crest catching the light.
  const strands = e.locks.map((pts) => {
    const n = (p: P, q: P): P => {
      const t = v.norm(v.sub(q, p)), side: P = [-t[1], t[0]];
      return v.mul(side, v.dot(side, toLight) >= 0 ? 1.7 : -1.7);
    };
    const moved = pts.map((p, i) => v.add(p, n(pts[Math.max(0, i - 1)]!, pts[Math.min(pts.length - 1, i + 1)]!)));
    return strokeOf(along(moved.slice(0, -1)), 1.6, { taper: 7, tip: 0.2 }).d;
  }).join("");
  // From each dip of the lower edge, a short crease rising into the ear, following the nearest lock.
  const creases = e.dips.map((dip) => {
    const near = e.locks.map((pts) => pts[pts.length - 1]!).reduce((best, p) => (v.len(v.sub(p, dip)) < v.len(v.sub(best, dip)) ? p : best));
    const lock = e.locks.find((pts) => pts[pts.length - 1] === near)!;
    const up = v.norm(v.sub(lock[Math.max(0, lock.length - 3)]!, near));
    return strokeOf([dip, v.add(dip, v.mul(up, 3.5)), v.add(dip, v.mul(up, 7))], 1.3, { taper: 3, tip: 0.15 }).d;
  }).join("");
  const [t0, t1] = [at(0), at(1)];
  const under = `<defs><linearGradient id="${deep}" gradientUnits="userSpaceOnUse" x1="${r3(t0[0])}" y1="${r3(t0[1])}" x2="${r3(t1[0])}" y2="${r3(t1[1])}">` +
    `<stop offset="${d0}" stop-color="${C.earDeep}" stop-opacity="0"/><stop offset="${r3(d0 + (d1 - d0) * 0.4)}" stop-color="${C.earDeep}"/>` +
    `<stop offset="${r3(d0 + (d1 - d0) * 0.8)}" stop-color="${C.earDeeper}"/><stop offset="${d1}" stop-color="${C.earFoot}"/></linearGradient>` +
    `<linearGradient id="${top}" gradientUnits="userSpaceOnUse" x1="${r3(t0[0])}" y1="${r3(t0[1])}" x2="${r3(t1[0])}" y2="${r3(t1[1])}">` +
    `<stop offset="0" stop-color="${C.patch}" stop-opacity="0.35"/><stop offset="${r3(d0 + 0.2)}" stop-color="${C.patch}" stop-opacity="0"/></linearGradient>` +
    // The locks come in from nothing near the top and show most down the lower half, where the fur hangs.
    `<linearGradient id="${fade}" gradientUnits="userSpaceOnUse" x1="${r3(t0[0])}" y1="${r3(t0[1])}" x2="${r3(t1[0])}" y2="${r3(t1[1])}">` +
    `<stop offset="${r3(d0 * 0.5)}" stop-color="${C.earLow}" stop-opacity="0"/><stop offset="${r3(d0 + (d1 - d0) * 0.5)}" stop-color="${C.earLow}"/></linearGradient>` +
    `${blur(lockBlur, box, 0.7)}${blur(litBlur, box, 0.8)}${blur(creaseBlur, box, 0.45)}</defs>` +
    `<rect x="${r3(x0)}" y="${r3(y0)}" width="${r3(x1 - x0)}" height="${r3(y1 - y0)}" fill="url(#${deep})"/>` +
    `<rect x="${r3(x0)}" y="${r3(y0)}" width="${r3(x1 - x0)}" height="${r3(y1 - y0)}" fill="url(#${top})"/>` +
    `<path d="${strands}" fill="${C.patch}" opacity="0.3" filter="url(#${litBlur})"/>` +
    `<path d="${locks}" fill="url(#${fade})" opacity="0.32" filter="url(#${lockBlur})"/>` +
    `<path d="${creases}" fill="${C.earLow}" opacity="0.45" filter="url(#${creaseBlur})"/>`;
  return {
    fill: C.marking,
    under,
    // The rim away from the light, and where it tucks under the head or the cheek.
    shade: { multiply: C.furShadeBy, rim: { inset: 2.2, toLight: 3.6 }, shapes: e.under, blur: 3 },
    highlight: { d: e.light, colour: C.patch, opacity: 0.35, blur: 2.8 },
  };
}
