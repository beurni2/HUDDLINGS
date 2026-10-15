// The dog's topknot, one recipe for every view (DECISIONS 75): 3 to 5 separate soft curls of fur, the middle one
// taller and looping, smaller ones stepping down to each side, never one lumpy cap. Each curl is its own shape, drawn
// back to front, in the crown's flat cream, the curl in front casting a soft shade on the one behind where it tucks
// under it, and its own line by the dog's line rule (parts/lines.ts), swelling over its crown and tapering to nothing
// where it tucks behind its neighbour; each curl's end hooks back in under itself in a fine stroke, and the tall one's
// foot loops in under it. Each view types its curls' nodes, lines and hooks from its own crop.
import { furSpan } from "../../../draw/fur.ts";
import { pathD, sample, smooth, type Node, type P, type Shape } from "../../../draw/geom.ts";
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
  /** Its end hooking back in under itself, or the tall curl's loop inside its top: points typed by hand, an inner line. */
  hooks?: P[][];
  /** A tip the sheet draws pointed (a hook's turn), declared fur so the corner rule leaves it be. */
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

/**
 * The topknot as one part (`tuft`): its curls back to front, each painted by `paint` (the fill, the highlight, the
 * feather into the crown), with its own rim of shade, the shade of the curls in front of it falling on it, its own
 * line and its hooks.
 */
export function topknot(curls: Curl[], paint: Paint): Piece {
  const shapes = curlShapes(curls);
  const hookTone = LINES.cream[2]!;
  return join(...curls.map((c, k) => {
    // The curls drawn after this one lie in front of it: each casts its shade down and right, away from the light.
    const cast = shapes.slice(k + 1).map((s) => pathD(s.segs.map((g) => g.map(([x, y]): P => [x + 0.9, y + 1.1]) as typeof g)));
    return litPart("tuft", shapes[k]!, {
      ...paint,
      under: (paint.under ?? "") + (c.under ?? ""),
      // No rim: the curl stays the crown's flat cream, as the sheet paints it, and only the curl in front shades it.
      shade: { multiply: C.furShadeBy, shapes: cast, blur: 1.2 },
      // Its hooks, fine strokes in the line's own light tone, inside the curl.
      inner: (c.hooks ?? []).map((pts) => ({ pts: sample(smooth(pts, { closed: false }).segs, 8, false), width: 0.8, colour: hookTone, opacity: 0.85 })),
    }, [c.line]);
  }));
}
