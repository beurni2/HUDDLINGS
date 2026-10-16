// The head's fur where the sheet draws it over the ears' roots, the ears and the collar, one builder for every view
// (DECISIONS 214, the fur plan's G4): each view types its own places on its own head's outline and calls headFur(),
// which puts the fur on the outline and gives back the head and its lines.
// - The crown over each ear's root: the crown's line runs down to where the head's outline crosses the ear's and joins
//   the ear's outer line there at full width, so the two run on as one line and the ear's top never shows as a cut
//   (DECISIONS 89, 210); past that point the head's edge lies over the root's tan, and there 2 or 3 broad low locks hang
//   over the root, unlined and feathered, as the sheet paints the crown's cream softly over the tan (soften()).
// - The cheek over the ear: a convex puff in 2 to 4 pointed wisps, with one line from the face's side round every wisp
//   to the jaw, on the tan where it lies on the ear (replacing 7's "no line between"), light over each wisp's tip and
//   darker in its notches, as the sheet's comes and goes with the fur; where the crop draws only a short low line on
//   the puff, the line breaks over the puff's gap.
// Every stretch the builder leaves unlined (each root's, each gap) it measures and cites by its length (DECISIONS 214,
// the line gate's `bare`), and soften() feathers it.
// - The chin: a rounded mass, its corners r 6 pt or more, its lower edge one lit line, coming and going the same way,
//   with 5 to 7 small pointed wisps dipping onto the collar (replacing 33's and 72's handoff of the chin's edge to the collar's dark rim, whose
//   soft shade alone stays, chinShadow()).
// The face states drawn on these parts use the same builder, so a state swap never pops: a state that reshapes the
// head (huffy's puffed head) passes its own outline and moves every typed place with it (`at`), and a state that
// raises an ear off its temple (head.line's temple states) starts that side's cheek line lower (`raised`).
import { furEdge, type FurRules, type Lock } from "../../../draw/fur.ts";
import { fracAt, minRadius, sample, spanPoints, arc, type P, type Shape } from "../../../draw/geom.ts";
import { strokeOf } from "../../../draw/line.ts";
import { blur, pad, piece, uid, type Box, type Piece } from "../../../draw/svg.ts";
import type { LitSpan, SpanEnd } from "./lines.ts";

/** The rows each place's fur must keep (DECISIONS 214, with 213's rules for locks). */
export const HEAD_FUR = {
  /**
   * The crown's locks over an ear's root: 2 or 3 broad low locks combed hard down and out over the tan, so the crown's
   * fur overlaps the root softly as the sheet paints it; tufts 2 to 4 pt tall there (213's TUFTS) read as a row of teeth.
   */
  crown: { count: [2, 3], len: [1.2, 2.5], width: [3.5, 6.5], tipRound: 0.25, lean: [0.4, 0.6], ratio: 0.25, vary: 0.2, dip: [0.3, 0.7], fit: 0.15 } as FurRules,
  /**
   * The cheek's puff over the ear: 2 to 4 pointed wisps combed down and out, 3 to 7 pt wide, sharp-tipped, as the front
   * crop draws them; round clumps there (the first recipe's 6.5 to 8 pt at tipRound 0.3) read as a cloud's scallops.
   */
  cheek: { count: [2, 4], len: [1.5, 3.5], width: [3, 7], tipRound: 0.25, lean: [0.3, 0.6], ratio: 0.3, vary: 0.2, dip: [0.3, 0.8], fit: 0.15 } as FurRules,
  /**
   * The chin's small scallops over the collar, as the front crop draws them ("small outlined scallops and fur points
   * dipping onto the collar"): 5 to 7, 4 to 8 pt wide and at least 0.15 as long, never in a repeat (a profile shows 2 or
   * 3 of them, in its wiggle at the collar); the first recipe's, 12 to 13.5 pt wide and 1 to 1.4 pt high (0.08 to 0.11),
   * read as a cookie-cutter cloud, and the second's, 1.2 to 1.9 pt high on 6 to 8 pt with flowing notches, as lace.
   */
  chin: { count: [5, 7], len: [0.8, 2], width: [4, 8], tipRound: 0.25, lean: [0, 0.6], ratio: 0.15, vary: 0.2, dip: [0, 0.6], noRepeat: true, fit: 0.15 } as FurRules,
  profileChin: { count: [2, 3], len: [0.8, 2], width: [2.5, 6], tipRound: 0.25, lean: [0, 0.6], ratio: 0.2, vary: 0.2, dip: [0, 0.6], fit: 0.15 } as FurRules,
  /** The chin's corners, where the jaw turns under: at least this round. */
  cornerPt: 6,
  /** How far from the crown's typed join end the head's and the ear's outlines must cross, in points. */
  crossPt: 4,
  /** An unlined stretch, feathered (soften()): the band's width and how far out over the tan it lies, its blur and its opacity, as the front's root and face's side were (σ 0.9), how far past the cheek line's free end a root's band runs on, and how far from the crown's join it starts. */
  soft: { width: 3, offset: 0.8, blur: 0.9, opacity: 0.95, past: 5, clear: 3 },
  /**
   * How deep the chin's and the cheeks' lines lie at most along their wisps (lines.ts's `most`), over each tip and in
   * each notch: the sheet's line round the lower face's fur comes and goes with it, L* 53 to 81 along the front's chin
   * (65 on average), lightest over the wisps' tips and darkest in their notches; the first recipe's even line, L* 62 to
   * 65 all along, ringed the chin like a cookie cutter. Away from the wisps (more than `near` pt) the line is the light
   * rule's own.
   */
  wisps: { tip: 0, notch: 0.55, near: 3 },
  /** How the chin's and the cheeks' edge flows through each notch between two wisps (fur.ts's `notch`), unless a lock is typed with its own: the notches soft, the tips the points. */
  flow: 0.8,
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
  /**
   * The ear this root lies over, as it is drawn at rest. Its line's join end is then where the head's outline crosses
   * the ear's, the crossing nearest the typed end (HEAD_FUR.crossPt at most), so the crown's line meets the ear's outer
   * line on a shared point; and the head's edge from there to the cheek's line, over the root, is the root's unlined
   * stretch, which the cheek's line cites (DECISIONS 214) by its measured length and soften() feathers.
   */
  ear?: Shape;
}

export interface CheekPuff {
  side: Side;
  /** The span of the head's outline the clumps lie on, over the ear, in path order. */
  from: P;
  to: P;
  clumps: Lock[];
  tipRound: number;
  /**
   * The cheek's line, in path order: from the face's side round every wisp to the jaw, on the tan by default, coming
   * and going with the wisps (HEAD_FUR.wisps) and no deeper than `most` says. Where the crop leaves the puff's wisps
   * unlined and draws only a short low line (the front's), `gap` says where, in path order: the line breaks there,
   * free on either side, cites the gap by its measured length (DECISIONS 214), and soften() feathers it.
   */
  line: { from: P; to: P; ends?: [SpanEnd, SpanEnd]; on?: LitSpan["on"]; under?: number | ((p: P) => number); most?: (p: P) => number; gap?: [P, P] };
  /** Where the line's upper end (the end nearer this place) lies instead when this side's ear is raised off its temple, where the temple's own edge fades out; that end is then free. */
  raised?: P;
}

export interface Chin {
  /** The span of the head's outline the scallops lie on, in path order. */
  from: P;
  to: P;
  scallops: Lock[];
  tipRound: number;
  /** The chin's line from jaw to jaw (or, in profile, from the lip's notch to the collar), in path order, coming and going with the wisps (HEAD_FUR.wisps). */
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
  /** The lines, by place: one per crown root, one per cheek (two where it breaks over its gap), the chin's. */
  crown: LitSpan[];
  cheeks: LitSpan[];
  chin?: LitSpan;
  /** Each lock, clump and scallop, for the strokes and shades a view paints inside the edge. */
  tufts: { crown: Tuft[]; cheeks: Tuft[]; chin: Tuft[] };
  /** Every line, with the cheek lines of the raised sides started lower (head.line's temple states). */
  spans(raised?: Partial<Record<Side, boolean>>): LitSpan[];
  /** Each root's unlined stretch of the head's edge over the ear (a crown root with its `ear`), from the crossing to the cheek's line, in path order, and its length in points. */
  roots: { side: Side; from: P; to: P; length: number }[];
  /**
   * The cream feathered out over each unlined stretch, as the sheet paints it soft: each root's (89's feathered edge)
   * and each cheek's gap: a soft band of `colour` along the stretch, a little out over the tan, drawn in head.line under
   * its lines. Under a raised ear (the temple states) there is no tan at the root to feather, so its root is left out.
   */
  soften(colour: string, box: Box, raised?: Partial<Record<Side, boolean>>): { defs: string; body: string };
}

/** Where two closed outlines cross, every point, from their samples. */
function crossings(a: Shape, b: Shape): P[] {
  const pa = sample(a.segs, 32), pb = sample(b.segs, 32), out: P[] = [];
  for (let i = 0; i < pa.length; i++) {
    const p = pa[i]!, q = pa[(i + 1) % pa.length]!;
    for (let j = 0; j < pb.length; j++) {
      const r = pb[j]!, t = pb[(j + 1) % pb.length]!;
      const d = (q[0] - p[0]) * (t[1] - r[1]) - (q[1] - p[1]) * (t[0] - r[0]);
      if (Math.abs(d) < 1e-12) continue;
      const u = ((r[0] - p[0]) * (t[1] - r[1]) - (r[1] - p[1]) * (t[0] - r[0])) / d, w = ((r[0] - p[0]) * (q[1] - p[1]) - (r[1] - p[1]) * (q[0] - p[0])) / d;
      if (u >= 0 && u < 1 && w >= 0 && w < 1) out.push([p[0] + u * (q[0] - p[0]), p[1] + u * (q[1] - p[1])]);
    }
  }
  return out;
}

/** How far along a closed outline from one place to another, the shorter way round, in points, and which way (true: in path order). */
function between(shape: Shape, a: P, b: P): { length: number; forward: boolean } {
  const pts = sample(shape.segs, 48);
  const total = arc([...pts, pts[0]!]).at(-1)!;
  const ahead = ((((fracAt(shape, b) - fracAt(shape, a)) % 1) + 1) % 1);
  return ahead <= 0.5 ? { length: ahead * total, forward: true } : { length: (1 - ahead) * total, forward: false };
}

/** A row of wisps whose edge flows through its notches (HEAD_FUR.flow), each lock typed with its own `notch` keeping it. */
const flowing = (locks: Lock[]): Lock[] => locks.map((l) => ({ notch: HEAD_FUR.flow, ...l }));

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

/**
 * How deep a line along a row of wisps may lie at each point (lines.ts's `most`): HEAD_FUR.wisps.tip over each tip,
 * .notch in each notch, between them by how near each lies, and no ceiling more than .near pt from the row.
 */
export function wispy(tufts: Tuft[]): (p: P) => number {
  const { tip, notch, near } = HEAD_FUR.wisps;
  const tips = tufts.map((t) => t.tip), notches = tufts.flatMap((t) => t.notches);
  const nearest = (p: P, at: P[]) => Math.min(...at.map((q) => Math.hypot(q[0] - p[0], q[1] - p[1])));
  return (p) => {
    const dt = nearest(p, tips), dn = nearest(p, notches);
    if (Math.min(dt, dn) > near) return 1;
    return tip + ((notch - tip) * dt) / (dt + dn || 1);
  };
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
    head = furEdge(head, at(h.chin.from), at(h.chin.to), flowing(h.chin.scallops), h.chin.tipRound, note(tufts.chin), h.chin.profile ? HEAD_FUR.profileChin : HEAD_FUR.chin);
  }
  for (const c of h.cheeks ?? []) head = furEdge(head, at(c.from), at(c.to), flowing(c.clumps), c.tipRound, note(tufts.cheeks), HEAD_FUR.cheek);
  for (const c of h.crown ?? []) head = furEdge(head, at(c.from), at(c.to), c.locks, c.tipRound, note(tufts.crown), HEAD_FUR.crown);
  // Each crown line's join end, on the crossing of the head's outline and its ear's.
  const joined = (c: CrownRoot): { span: LitSpan; join?: P } => {
    const ends = c.ends ?? ["under", "join"];
    const span: LitSpan = { from: at(c.line.from), to: at(c.line.to), ends };
    const i = ends.indexOf("join");
    if (!c.ear || i < 0) return { span };
    const typed = i === 0 ? span.from as P : span.to as P;
    const near = crossings(head, c.ear).map((p) => ({ p, d: Math.hypot(p[0] - typed[0], p[1] - typed[1]) })).sort((x, y) => x.d - y.d)[0];
    if (!near || near.d > HEAD_FUR.crossPt)
      throw new Error(`headFur: the head's and the ${c.side} ear's outlines cross ${near ? `${near.d.toFixed(2)} pt` : "nowhere"} from the crown's join (${typed.map((n) => n.toFixed(1)).join(", ")}), at most ${HEAD_FUR.crossPt}: the crown's line joins the ear's where they cross`);
    return { span: i === 0 ? { ...span, from: near.p } : { ...span, to: near.p }, join: near.p };
  };
  const crowns = (h.crown ?? []).map((c) => ({ c, ...joined(c) }));
  const crown = crowns.map((x) => x.span);
  // Each root's unlined stretch: the head's edge from the crown's join to the upper end of that side's cheek line.
  const upper = (c: CheekPuff, raised: boolean, p: P) => {
    const from = at(c.line.from), to = at(c.line.to);
    // The end nearer the root is the one nearer its join, as typed; under a raised ear that end lies at `raised` instead
    // (whichever end of the line it is: a left cheek's line runs up from the jaw, so its upper end is its `to`).
    const end = Math.hypot(from[0] - p[0], from[1] - p[1]) <= Math.hypot(to[0] - p[0], to[1] - p[1]) ? (0 as const) : (1 as const);
    return { end, at: raised && c.raised ? at(c.raised) : end === 0 ? from : to };
  };
  const rootOf = (side: Side, raised: boolean) => {
    const x = crowns.find((k) => k.c.side === side && k.join), c = (h.cheeks ?? []).find((k) => k.side === side);
    if (!x || !c) return undefined;
    const u = upper(c, raised, x.join!), b = between(head, x.join!, u.at);
    return { side, from: b.forward ? x.join! : u.at, to: b.forward ? u.at : x.join!, length: b.length, end: u.end, cheekAt: (b.forward ? 1 : 0) as 0 | 1 };
  };
  // Each cheek's line comes and goes with its wisps, and lies no deeper than the view's own ceiling, made once so a
  // state's spans are the rest's own.
  const cheekWisps = wispy(tufts.cheeks);
  const mostOf = new Map((h.cheeks ?? []).map((c) => [c, c.line.most ? (p: P) => Math.min(c.line.most!(p), cheekWisps(p)) : cheekWisps]));
  // A cheek's line, in one or two spans in path order: broken over its gap, where the sheet leaves the puff unlined.
  const cheek = (c: CheekPuff, raised: boolean): LitSpan[] => {
    const ends: [SpanEnd, SpanEnd] = [c.line.ends?.[0] ?? "join", c.line.ends?.[1] ?? "join"];
    let span: LitSpan = { from: at(c.line.from), to: at(c.line.to), on: c.line.on ?? "tan", under: c.line.under ?? 0, most: mostOf.get(c), ends };
    if (raised && c.raised) {
      // Under a raised ear the temple's own edge carries the line above: the cheek's line starts lower, from open fur.
      const d = (p: P) => Math.hypot(p[0] - c.raised![0], p[1] - c.raised![1]);
      span = d(c.line.from) <= d(c.line.to) ? { ...span, from: at(c.raised), ends: ["free", ends[1]] } : { ...span, to: at(c.raised), ends: [ends[0], "free"] };
    }
    // Every unlined stretch the line borders is cited by its measured length (DECISIONS 214), with half a point for
    // the outline's sampling; the line ends free where it borders one.
    const parts: LitSpan[] = c.line.gap
      ? [{ ...span, to: at(c.line.gap[0]), ends: [span.ends![0], "free"], cites: 214, bare: [0, between(head, at(c.line.gap[0]), at(c.line.gap[1])).length + 0.5] },
        { ...span, from: at(c.line.gap[1]), ends: ["free", span.ends![1]], cites: 214, bare: [0, 0] }]
      : [span];
    // Its upper end comes out of the root's soft overlap: the stretch above it to the crown's join is the root's.
    const root = rootOf(c.side, raised);
    if (!root) return parts;
    const k = root.end === 0 ? 0 : parts.length - 1, part = parts[k]!;
    const e = [...part.ends!] as [SpanEnd, SpanEnd];
    e[root.end] = "free";
    const bare: [number, number] = [...(part.bare ?? [0, 0])] as [number, number];
    bare[root.end] = root.length + 0.5;
    parts[k] = { ...part, ends: e, cites: 214, bare };
    return parts;
  };
  const cheeks = (h.cheeks ?? []).flatMap((c) => cheek(c, false));
  const chin = h.chin
    ? { from: at(h.chin.line.from), to: at(h.chin.line.to), under: h.chin.line.under ?? 0, most: wispy(tufts.chin), ends: h.chin.line.ends ?? ["join", "join"] } satisfies LitSpan
    : undefined;
  const rooted = (["R", "L"] as const).map((side) => rootOf(side, false)).filter((r) => !!r);
  const roots = rooted.map(({ side, from, to, length }) => ({ side, from, to, length }));
  // A root's band runs on past the cheek line's free end, under its taper, so the face's side where the line comes out
  // of the overlap stays soft; never past the crown's join, where the edge is the silhouette.
  const total = arc([...sample(head.segs, 48), sample(head.segs, 48)[0]!]).at(-1)!;
  // It starts a little in from the join, so the crown's line runs on visibly into the ear's under no cream.
  const rootBand = (r: (typeof rooted)[number]): [number, number] => {
    const a = fracAt(head, r.from), b = fracAt(head, r.to), more = HEAD_FUR.soft.past / total, clear = HEAD_FUR.soft.clear / total;
    return r.cheekAt === 1 ? [(a + clear) % 1, (b + more) % 1] : [(a - more + 1) % 1, (b - clear + 1) % 1];
  };
  return {
    head, crown, cheeks, chin, tufts, roots,
    spans: (raised = {}) => [...crown, ...(h.cheeks ?? []).flatMap((c) => cheek(c, !!raised[c.side])), ...(chin ? [chin] : [])],
    soften: (colour, box, raised = {}) => {
      const f = uid("blur"), { width, offset, blur: sd, opacity } = HEAD_FUR.soft;
      const stretches: [number, number][] = [...rooted.filter((r) => !raised[r.side]).map(rootBand),
        ...(h.cheeks ?? []).flatMap((c) => (c.line.gap ? [[fracAt(head, at(c.line.gap[0])), fracAt(head, at(c.line.gap[1]))] as [number, number]] : []))];
      const d = stretches.map(([a, b]) => strokeOf(spanPoints(head, a, b), width, { taper: 3, tip: 0.4, offset }).d).join("");
      return d ? { defs: blur(f, pad(box, 2), sd), body: `<path d="${d}" fill="${colour}" opacity="${opacity}" filter="url(#${f})"/>` } : { defs: "", body: "" };
    },
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
