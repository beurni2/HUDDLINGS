// The dog's topknot, one recipe for every view (DECISIONS 75, 80): 3 to 5 separate soft curls of fur, the middle one
// taller, smaller ones stepping down to each side, never one lumpy cap. Each curl is its own shape, drawn back to
// front, in the crown's cream, lit toward the top left and softly shaded along its edges away from the light, the curl
// in front casting a soft shade on the one behind where it tucks under it, and its own line by the dog's line rule
// (parts/lines.ts), swelling over its crown. Where two curls meet, or a curl meets the crown's line, the sheet's line
// dips into a simple V and runs on as one short stroke into the fur, tapering out: never a hook curling back on
// itself. Each view types its curls' nodes, lines and notch strokes from its own crop.
import { furSpan } from "../../../draw/fur.ts";
import { pathD, sample, smooth, v, type Node, type P, type Shape } from "../../../draw/geom.ts";
import type { Paint } from "../../../draw/paint.ts";
import { join, type Piece } from "../../../draw/svg.ts";
import { C, LINES } from "../palette.ts";
import { litPart, type LitSpan } from "./lines.ts";

export interface Curl {
  /** Nodes typed by hand, closed, its hidden foot running along under the crown. */
  nodes: Node[];
  /** Concave notches among the nodes (by index). */
  corners?: number[];
  /** Where the curl's line runs: from where it comes out from behind its neighbour, over its crown, to where it tucks behind the next. */
  line: LitSpan;
  /** Where its line dips into a notch, the stroke running on from the V into the fur, typed by hand from the V inward; an inner line tapering out. */
  into?: P[][];
  /** A tip the sheet draws pointed (a notch's V), declared fur so the corner rule leaves it be. */
  tip?: [P, P];
  /** Paint under its shade, in model space (the tall curl's soft crease). */
  under?: string;
}

/**
 * The curls as shapes, back to front, also for a light group (the head's rim stays off where the topknot sits on it).
 * Each curl's lined edge is fur, the sheet's head tuft (spec L508), so the corner rule leaves its round tops be.
 */
export function curlShapes(curls: Curl[]): Shape[] {
  return curls.map((c) => {
    const s = furSpan(smooth(c.nodes, { corners: c.corners ?? [] }), c.line.from as P, c.line.to as P);
    return c.tip ? furSpan(s, c.tip[0], c.tip[1]) : s;
  });
}

/** The higher of a curl's line's two ends, its y: the curl's own crown lies above it, and below it the curl meets its neighbours and the crown's fur. */
const foot = (c: Curl) => Math.min(...[c.line.from, c.line.to].map((at) => (Array.isArray(at) ? at[1] : Infinity)));

/**
 * The topknot as one part (`tuft`): its curls back to front, each painted by `paint` (the fill, the highlight, the
 * feather into the crown), with its own soft rim of shade away from the light, the shade of the curls in front of it
 * falling on it, its own line and its notch strokes.
 */
export function topknot(curls: Curl[], paint: Paint): Piece {
  if (curls.length < 3 || curls.length > 5) throw new Error(`a topknot is 3 to 5 curls, not ${curls.length}`);
  const shapes = curlShapes(curls);
  const notchTone = LINES.cream[1]!;
  return join(...curls.map((c, k) => {
    // The curls drawn after this one lie in front of it: each casts its shade down and right, away from the light.
    const cast = shapes.slice(k + 1).map((s) => pathD(s.segs.map((g) => g.map(([x, y]): P => [x + 0.9, y + 1.1]) as typeof g)));
    return litPart("tuft", shapes[k]!, {
      ...paint,
      under: (paint.under ?? "") + (c.under ?? ""),
      // A soft rim of the fur's warm shade along its edges away from the light, so each curl reads as a round lock of
      // fur, and the curl in front shading it.
      // Only over its crown, above where its line meets its neighbours: lower down it runs on into them and the crown's fur with no edge.
      shade: { multiply: C.furShadeBy, rim: { inset: 1.3, toLight: 2.2 }, shapes: cast, keep: [`M-400 ${foot(c) - 0.6}H400V400H-400Z`], blur: 1.2 },
      // Its notch strokes, in the line's own light tone, running on from the V into the fur at full width, tapering
      // out only at their inner end (each starts a little outside the curl, where its clip hides its first taper).
      inner: (c.into ?? []).map((pts) => {
        const back = v.norm(v.sub(pts[0]!, pts[1]!));
        return { pts: sample(smooth([v.add(pts[0]!, v.mul(back, 2.4)), ...pts], { closed: false }).segs, 8, false), width: 0.85, colour: notchTone, opacity: 0.9 };
      }),
    }, [c.line]);
  }));
}
