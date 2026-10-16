// The head's fur where the sheet draws it over the ears' roots, the ears and the collar, one builder for every view
// (DECISIONS 214, the fur plan's G4): each view types its own places on its own head's outline and calls headFur(),
// which puts the fur on the outline and gives back the head and its lines.
// - The crown over each ear's root: 2 or 3 locks hang over the root, and the crown's line runs on unbroken round them
//   into the ear's outer line (DECISIONS 89, 210), so the ear's top never shows as a cut.
// - The cheek over the ear: a convex puff in 2 to 4 clumps, with one line from the face's side round every clump to
//   the jaw, on the tan where it lies on the ear (replacing 7's "no line between").
// - The chin: a rounded mass, its corners r 6 pt or more, its lower edge one lit line with 5 to 7 small scallops
//   dipping onto the collar (replacing 33's and 72's handoff of the chin's edge to the collar's dark rim, whose soft
//   shade alone stays, chinShadow()).
// The face states drawn on these parts use the same builder, so a state swap never pops: a state that reshapes the
// head (huffy's puffed head) passes its own outline and moves every typed place with it (`at`), and a state that
// raises an ear off its temple (head.line's temple states) starts that side's cheek line lower (`raised`).
import { CLUMPS, furEdge, type FurRules, type Lock } from "../../../draw/fur.ts";
import { fracAt, minRadius, sample, spanPoints, arc, type P, type Shape } from "../../../draw/geom.ts";
import { strokeOf } from "../../../draw/line.ts";
import { blur, pad, piece, uid, type Box, type Piece } from "../../../draw/svg.ts";
import type { LitSpan, SpanEnd } from "./lines.ts";

/** The rows each place's fur must keep (DECISIONS 214, with 213's rules for locks). */
export const HEAD_FUR = {
  /** The crown's locks over an ear's root: 2 or 3 tufts. */
  crown: { count: [2, 3], len: [2, 4], width: [3, 5], tipRound: 0.25, lean: [0.3, 0.6], ratio: 0.5, vary: 0.2, dip: [0.5, 1], fit: 0.15 } as FurRules,
  /** The cheek's clumps over the ear: 2 to 4 convex clumps (CLUMPS), broader than a tuft, uneven, combed down and out. */
  cheek: { ...CLUMPS, count: [2, 4] } as FurRules,
  /** The chin's small scallops over the collar: 5 to 7 (a profile shows 2 or 3 of them, in its wiggle at the collar). */
  chin: { count: [5, 7], len: [0.6, 1.6], width: [4, 14], tipRound: 0.5, lean: [0, 0.6], ratio: 0.05, vary: 0.15, dip: [0, 0.6], fit: 0.15 } as FurRules,
  profileChin: { count: [2, 3], len: [0.6, 2], width: [2, 8], tipRound: 0.5, lean: [0, 0.7], ratio: 0.1, vary: 0.15, dip: [0, 0.6], fit: 0.15 } as FurRules,
  /** The chin's corners, where the jaw turns under: at least this round. */
  cornerPt: 6,
};

type Side = "L" | "R";

export interface CrownRoot {
  side: Side;
  /** The span of the head's outline the locks lie on, over the root, in path order. */
  from: P;
  to: P;
  locks: Lock[];
  tipRound: number;
  /** The crown's line, in path order: from under the topknot over the locks to where it meets the ear's outer line, on a shared point. */
  line: { from: P; to: P };
  /** Its line's ends: by default it runs on under the topknot at one end and joins the ear's line at the other, whichever way the path runs. */
  ends?: [SpanEnd, SpanEnd];
}

export interface CheekPuff {
  side: Side;
  /** The span of the head's outline the clumps lie on, over the ear, in path order. */
  from: P;
  to: P;
  clumps: Lock[];
  tipRound: number;
  /** The cheek's one line, in path order: from the face's side round every clump to the jaw, on the tan by default. */
  line: { from: P; to: P; ends?: [SpanEnd, SpanEnd]; on?: LitSpan["on"]; under?: number | ((p: P) => number) };
  /** Where the line's upper end (the end nearer this place) lies instead when this side's ear is raised off its temple, where the temple's own edge fades out; that end is then free. */
  raised?: P;
}

export interface Chin {
  /** The span of the head's outline the scallops lie on, in path order. */
  from: P;
  to: P;
  scallops: Lock[];
  tipRound: number;
  /** The chin's line from jaw to jaw (or, in profile, from the lip's notch to the collar), in path order. */
  line: { from: P; to: P; ends?: [SpanEnd, SpanEnd]; under?: number };
  /** Where the jaw turns under on each side, each held round (HEAD_FUR.cornerPt). */
  corners: P[];
  /** A profile's chin: 2 or 3 tufts in its wiggle at the collar instead of 5 to 7 scallops. */
  profile?: boolean;
}

export interface HeadFurSpec {
  /** The head's outline before its fur, typed by the view (a state's own outline, for a state that reshapes the head). */
  base: Shape;
  /** Moves every typed place as a state moves the outline (huffy's puff); the rest's places as typed by default. */
  at?: (p: P) => P;
  crown?: CrownRoot[];
  cheeks?: CheekPuff[];
  chin?: Chin;
}

export interface Tuft {
  tip: P;
  root: P;
  notches: [P, P];
}

export interface HeadFur {
  head: Shape;
  /** The lines, by place: one per crown root, one per cheek, the chin's. */
  crown: LitSpan[];
  cheeks: LitSpan[];
  chin?: LitSpan;
  /** Each lock, clump and scallop, for the strokes and shades a view paints inside the edge. */
  tufts: { crown: Tuft[]; cheeks: Tuft[]; chin: Tuft[] };
  /** Every line, with the cheek lines of the raised sides started lower (head.line's temple states). */
  spans(raised?: Partial<Record<Side, boolean>>): LitSpan[];
}

/** How round the outline turns within `within` pt of a place, outside its fur. */
function roundness(shape: Shape, at: P, within: number): number {
  const pts = sample(shape.segs, 32);
  const total = arc([...pts, pts[0]!]).at(-1)!;
  const f = fracAt(shape, at), slack = within / total;
  const near = (g: number) => Math.min(Math.abs(g - f), 1 - Math.abs(g - f)) <= slack;
  const furred = shape.fur.map(([a, b]) => [fracAt(shape, a), fracAt(shape, b)] as [number, number]);
  const inFur = (g: number) => furred.some(([a, b]) => (a <= b ? g >= a && g <= b : g >= a || g <= b));
  return minRadius(shape.segs, (g) => near(g) && !inFur(g)).convex.r;
}

/** The head with its fur where the view places it, and its lines (see the file's head). Throws when a row or a corner breaks its rules. */
export function headFur(h: HeadFurSpec): HeadFur {
  const at = h.at ?? ((p: P) => p);
  let head = h.base;
  const tufts: HeadFur["tufts"] = { crown: [], cheeks: [], chin: [] };
  const note = (into: Tuft[]) => (tip: P, root: P, notches: [P, P]) => into.push({ tip, root, notches });
  // The chin's corners are held on the outline before any fur lies on it.
  if (h.chin) {
    for (const c of h.chin.corners) {
      const r = roundness(head, at(c), 3);
      if (r < HEAD_FUR.cornerPt) throw new Error(`headFur: the jaw turns r ${r.toFixed(2)} pt at (${at(c).map((n) => n.toFixed(1)).join(", ")}), at least ${HEAD_FUR.cornerPt}: the chin is a rounded mass`);
    }
    head = furEdge(head, at(h.chin.from), at(h.chin.to), h.chin.scallops, h.chin.tipRound, note(tufts.chin), h.chin.profile ? HEAD_FUR.profileChin : HEAD_FUR.chin);
  }
  for (const c of h.cheeks ?? []) head = furEdge(head, at(c.from), at(c.to), c.clumps, c.tipRound, note(tufts.cheeks), HEAD_FUR.cheek);
  for (const c of h.crown ?? []) head = furEdge(head, at(c.from), at(c.to), c.locks, c.tipRound, note(tufts.crown), HEAD_FUR.crown);
  const crown = (h.crown ?? []).map((c): LitSpan => ({ from: at(c.line.from), to: at(c.line.to), ends: c.ends ?? ["under", "join"] }));
  const cheek = (c: CheekPuff, raised: boolean): LitSpan => {
    const ends: [SpanEnd, SpanEnd] = [c.line.ends?.[0] ?? "join", c.line.ends?.[1] ?? "join"];
    const span: LitSpan = { from: at(c.line.from), to: at(c.line.to), on: c.line.on ?? "tan", under: c.line.under ?? 0.3, ends };
    if (!raised || !c.raised) return span;
    // Under a raised ear the temple's own edge carries the line above: the cheek's line starts lower, from open fur.
    const d = (p: P) => Math.hypot(p[0] - c.raised![0], p[1] - c.raised![1]);
    return d(c.line.from) <= d(c.line.to)
      ? { ...span, from: at(c.raised), ends: ["free", ends[1]] }
      : { ...span, to: at(c.raised), ends: [ends[0], "free"] };
  };
  const cheeks = (h.cheeks ?? []).map((c) => cheek(c, false));
  const chin = h.chin ? { from: at(h.chin.line.from), to: at(h.chin.line.to), under: h.chin.line.under ?? 0.35, ends: h.chin.line.ends ?? ["join", "join"] } satisfies LitSpan : undefined;
  return {
    head, crown, cheeks, chin, tufts,
    spans: (raised = {}) => [...crown, ...(h.cheeks ?? []).map((c) => cheek(c, !!raised[c.side])), ...(chin ? [chin] : [])],
  };
}

/**
 * The chin's soft shadow on the collar, cast by the head (spec L396; DECISIONS 33's part, `shadow.chin.collar`): the
 * band's own darker blue, soft, along under the chin's scalloped edge, centred on the head's own edge so only its lower
 * half shows below the fur. No dark rim: the chin's own line is its edge (214).
 */
export function chinShadow(head: Shape, from: P, to: P, colour: string, box: Box, o = { width: 5, blur: 0.9, opacity: 0.45 }): Piece {
  const f = uid("blur");
  const chin = spanPoints(head, fracAt(head, from), fracAt(head, to));
  const d = strokeOf(chin, o.width, { taper: 4, tip: 1 }).d;
  return piece(`<defs>${blur(f, pad(box, 2), o.blur)}</defs><path d="${d}" fill="${colour}" opacity="${o.opacity}" filter="url(#${f})"/>`, box);
}
