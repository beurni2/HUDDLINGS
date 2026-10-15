// The dog's brows, one recipe for every view, typed once in the face's own frame (parts/face.ts) as the sheets paint
// them: a paler tan comma with a thin darker brown upper edge in the cream above the hood, about 9 pt long and 2.6 pt
// thick at its middle, tapering round to both ends, one gentle arch whose crown sits a little nearer its inner end,
// soft at its edges. Three states, all arcs that bow upward with their ends level within the sheets' own tilt
// (rule R3: never knitted, never slanted either way; characters/dog/test/faces.test.ts holds each one to it):
// - neutral: the turnaround's (DECISIONS 85);
// - raised: curious and surprised, higher and a little more arched;
// - happy: the crescent-eyed faces (Excited, Laughing, Proud), lower over the squinting eyes, as those panels draw them.
import { sample, smooth, type P } from "../../../draw/geom.ts";
import { strokeOf, type DrawnLine } from "../../../draw/line.ts";
import { blur, piece, uid, type Box, type Piece } from "../../../draw/svg.ts";
import { C } from "../palette.ts";
import type { FaceFrame } from "./face.ts";

export const BROW_STATES = ["neutral", "raised", "happy"] as const;
export type BrowState = (typeof BROW_STATES)[number];

export interface Brow {
  piece: Piece;
  /** Its centre line from the outer end to the inner, evenly sampled, in model space, for the R3 guard. */
  arc: P[];
}

/** Each state's centre line on the dog's left (the viewer's right), from its outer end to its inner, and its canvas, in the face frame. */
// The inner end stands about 2 pt above the outer, the sheets' own tilt (their brows' 1.4 to 2.3 pt, DECISIONS 131).
const SHAPES: Record<BrowState, { pts: P[]; box: Box }> = {
  neutral: { pts: [[27.4, -25.4], [26, -27.4], [24.2, -28.8], [22.2, -29.4], [20.2, -28.85], [18.6, -27.7]], box: [15, -34, 16, 12] },
  // About 3 pt higher (a tenth of the brow's height over the eye) and arched 0.4 pt more, its ends as level as the neutral's.
  raised: { pts: [[27.7, -28.3], [26.2, -30.6], [24.3, -32.1], [22.2, -32.8], [20.1, -32.1], [18.5, -30.6]], box: [15, -37, 16, 12] },
  // About 3.5 pt lower, as the crescent-eyed panels draw it (4.3 pt nearer the nose than the Happy panel's), its arch the neutral's.
  happy: { pts: [[27.5, -21.9], [26.1, -23.9], [24.2, -25.3], [22.2, -25.9], [20.2, -25.35], [18.6, -24.2]], box: [15, -31, 16, 12] },
};

/** A brow: `sx` is +1 for the brow on the dog's left (the viewer's right), −1 for its right. */
export function brow(state: BrowState, sx: 1 | -1, f: FaceFrame): Brow {
  const shape = SHAPES[state];
  const pts: P[] = shape.pts.map(([x, y]): P => [sx * x, y]);
  const [bx, by, bw, bh] = shape.box;
  const g = uid("blur"), box = f.box([sx > 0 ? bx : -bx - bw, by, bw, bh]);
  const along = sample(smooth(pts, { closed: false }).segs, 8, false);
  // Its upper edge a thin, slightly darker brown, as the sheet draws it, inside the comma's top.
  const edge = strokeOf(along.map(([x, y]): P => [x, y - 0.9]), 0.75, { taper: 2.6, tip: 0.1 });
  return {
    piece: piece(`<defs>${blur(g, box, 0.35)}</defs><g filter="url(#${g})">` +
      f.place(`<path d="${strokeOf(along, 2.6, { taper: 3.4, tip: 0.6 }).d}" fill="${C.marking}" opacity="0.72"/><path d="${edge.d}" fill="${C.earEdge}" opacity="0.5"/>`) + "</g>", box,
    { shapes: [], lines: [{ kind: "inner", width: 0.75, where: "brow edge", drawn: edge.drawn } as DrawnLine] }),
    arc: along.map(f.at),
  };
}
