// The dog's markings' own paint, one recipe for every view (DECISIONS 83): a marking is an overlay clipped to its part
// (paint.ts's marking, spec L395), soft but defined, never airbrushed; inside its own soft edge it may deepen toward
// where the sheet paints it darker (the head patches toward the ear's root) and carry a few darker fur strands (the
// saddle, the tail's root), drawn through a mask of the marking's own shape, blurred as the marking is, so nothing
// shows past its edge. Each view types its patches, their deepening and their strands from its own crop.
import { bbox, pathD, sample, smooth, type P, type Shape } from "../../../draw/geom.ts";
import { strokeOf, type DrawnLine } from "../../../draw/line.ts";
import { LIMITS, reach } from "../../../draw/lint.ts";
import { blur, mask, pad, piece, uid, type Box, type Piece } from "../../../draw/svg.ts";
import { C } from "../palette.ts";

/**
 * Paint inside a marking, through its own soft edge (a mask of its shape, blurred as the marking is), so it never
 * shows past the marking's edge. Pieces under a clip group (rig.json's clipTo) are held to their part by it as well.
 */
export function within(name: string, shape: Shape, soft: number, content: (box: Box) => string, lines: DrawnLine[] = []): Piece {
  const [x0, y0, x1, y1] = bbox(shape.segs);
  const box = pad([x0, y0, x1 - x0, y1 - y0], 2), area = pad(box, reach(soft, 0));
  const m = uid("within"), e = uid("blur");
  return piece(`<defs>${blur(e, area, soft)}${mask(m, area, `<path d="${pathD(shape.segs)}" fill="#FFFFFF" filter="url(#${e})"/>`)}</defs>` +
    `<g mask="url(#${m})">${content(box)}</g>`, box, { shapes: [], lines: lines.map((l) => ({ ...l, where: `${name} ${l.where}` })) });
}

/** Fur strands inside a marking, typed as a few nodes each, drawn as tapered inner lines in one colour, soft at their edges. */
export function strands(name: string, shape: Shape, soft: number, lines: P[][], o: { colour: string; opacity: number; width: number }): Piece {
  const drawn = lines.map((pts, k) => strokeOf(sample(smooth(pts, { closed: false }).segs, 8, false), o.width, { taper: 3, tip: 0.15, band: LIMITS.inner, wobble: 0.08, seed: 5 + k }));
  const f = uid("blur");
  return within(name, shape, soft, (box) => `<defs>${blur(f, pad(box, 2), 0.3)}</defs>` +
    `<g fill="${o.colour}" opacity="${o.opacity}" filter="url(#${f})">${drawn.map((d) => `<path d="${d.d}"/>`).join("")}</g>`,
  drawn.map((d) => ({ kind: "inner" as const, width: o.width, where: "strands", drawn: d.drawn })));
}

/** A marking deepening toward one side inside its own soft edge: the tan at nothing at `from`, at `opacity` at `to`. */
export function deepen(name: string, shape: Shape, soft: number, from: P, to: P, opacity: number): Piece {
  const g = uid("deepen");
  return within(name, shape, soft, (box) => `<defs><linearGradient id="${g}" gradientUnits="userSpaceOnUse" x1="${from[0]}" y1="${from[1]}" x2="${to[0]}" y2="${to[1]}">` +
    `<stop offset="0" stop-color="${C.marking}" stop-opacity="0"/><stop offset="1" stop-color="${C.marking}" stop-opacity="${opacity}"/></linearGradient></defs>` +
    `<rect x="${box[0]}" y="${box[1]}" width="${box[2]}" height="${box[3]}" fill="url(#${g})"/>`);
}
