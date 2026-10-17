// The dog's topknot, one recipe for every view (DECISIONS 75, 80): 3 to 5 separate soft curls of fur, the middle one
// taller, smaller ones stepping down to each side, never one lumpy cap. Each curl is its own shape, drawn back to
// front, in the crown's cream, lit toward the top left and softly shaded along its edges away from the light, the curl
// in front casting a soft shade on the one behind where it tucks under it, and its own line by the dog's line rule
// (parts/lines.ts), swelling over its crown. Where two curls meet, or a curl meets the crown's line, the sheet's line
// dips into a simple V and runs on as one short stroke into the fur, tapering out: never a hook curling back on
// itself. Each view types its curls' nodes, lines and notch strokes from its own crop.
import { furSpan } from "../../../draw/fur.ts";
import { arc, bbox, pathD, polyD, sample, smooth, v, type Node, type P, type Shape } from "../../../draw/geom.ts";
import type { DrawnLine } from "../../../draw/line.ts";
import { LIMITS } from "../../../draw/lint.ts";
import { LIGHT, type Paint } from "../../../draw/paint.ts";
import { join, pad, piece, union, type Piece } from "../../../draw/svg.ts";
import { C, LINES } from "../palette.ts";
import { FREE_TAPER, lineEnd, litPart, type LitOptions, type LitSpan, type Weight } from "./lines.ts";

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
 * The crisp topknot (DECISIONS 262), as master.turnaround.front and master.hero.main draw it: 4 or 5 small locks, each
 * outlined by a crisp thin line (no blur, so the silhouette's side is the clip's own edge; no deeper than `most`, so it
 * stays at the band's thin, light end), its line ending in open fur over no more than a free end's taper (1.8 pt),
 * never the long tapered wedge that read as a dark sliver spike, and each lock's base turning into the fur at its V.
 * `tuck`: each such stroke is an inner line (DECISIONS 286, the lead's L4: 0.6 to 0.9 pt, the spec's inner band, L506),
 * `width` where it leaves the line (the inner band's widest; 262's 1 pt is gone), easing out to `tip` toward its inner
 * end only; a copy that draws it on its own (back.ts's tuckD) takes `opacity` and `blur` (σ, pt). The crisp topknot's
 * own hooks (hook()) carry the lock's line on in its own colour, unblurred and whole. Unclipped: a stroke clipped to a
 * pointed lock is a sliver. From behind (`behind`), the topknot is the back crop's one tuft of two lobes, a notch
 * between them (`lobes`).
 */
export const CRISP = { count: [4, 5] as [number, number], lobes: { count: 1, notches: 1 }, most: 0.2, tuck: { width: LIMITS.inner[1], tip: 0.1, opacity: 0.9, blur: 0.2 } };

/** How the topknot is drawn: as before (the default), or crisp with its locks' bases tucked (DECISIONS 262). */
export interface TopknotStyle {
  crisp?: boolean;
  /**
   * The living weight every lock's line takes (DECISIONS 286; lines.ts's `weight`, with its `life` if it asks), each
   * lock's seed this seed plus its place, unless its own line types one; left out, as typed.
   */
  weight?: Weight;
  /** With `crisp`: the topknot seen from behind, as master.turnaround.back draws it, one tuft of two lobes with a notch between them (one curl, one of its `corners`), its own paint's shade kept (DECISIONS 286). */
  behind?: boolean;
}

/**
 * One tuck or hook (DECISIONS 286, the lead's L4), an inner line: along `pts`, `width` at its start with a round end
 * there, easing out to `tip` at its inner end, and its line meta for the lint (an inner line drawn all of a taper reads
 * its widest). With `inset`, its round end's outer edge lies on its first point (a tuck typed from a V, so no part of it
 * pokes out past a pointed lock's tip); else it is centred there (a hook that starts inside the line it carries on).
 */
export function tuck(pts: P[], o: { width?: number; tip?: number; inset?: boolean; where?: string } = {}): { d: string; line: DrawnLine } {
  const width = o.width ?? CRISP.tuck.width, tip = o.tip ?? CRISP.tuck.tip;
  if (width < LIMITS.inner[0] - 1e-9 || width > LIMITS.inner[1] + 1e-9) throw new Error(`a tuck is ${width} pt, not an inner line's ${LIMITS.inner[0]} to ${LIMITS.inner[1]}`);
  const start = o.inset === false ? pts[0]! : v.add(pts[0]!, v.mul(v.norm(v.sub(pts[1]!, pts[0]!)), width / 2));
  const line = sample(smooth([start, ...pts.slice(1)], { closed: false }).segs, 8, false);
  const at = arc(line), length = at[at.length - 1]!;
  const left: P[] = [], right: P[] = [];
  line.forEach((p, i) => {
    const u = at[i]! / length, w = tip + (width - tip) * (1 - u * u * (3 - 2 * u));
    const t = v.norm(v.sub(line[Math.min(line.length - 1, i + 1)]!, line[Math.max(0, i - 1)]!));
    const n: P = [-t[1], t[0]];
    left.push(v.add(p, v.mul(n, w / 2)));
    right.push(v.sub(p, v.mul(n, w / 2)));
  });
  const [x, y] = line[0]!, r = width / 2, f = (n: number) => +n.toFixed(2);
  return { d: `${polyD([...left, ...right.reverse()])}M${f(x - r)} ${f(y)}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`,
    line: { kind: "inner", width, where: o.where ?? "tuck", drawn: [width, width] } };
}

/**
 * A lock's hook (DECISIONS 286): its line carried on into the fur along `into` (typed from its V inward) as one stroke,
 * never a separate darker wedge starting off the line's end. Where the lock's line ends at the V (within HOOK.near pt),
 * the hook takes it up where its taper has thinned to the tuck's width (HOOK.over of its taper back from its end), on
 * its middle, running on along it to its end and turning in along `into`; where the V lies along the line, it branches
 * off the line's middle there. In the line's own colour at that end, unblurred, as the line is.
 */
export function hook(shape: Shape, line: LitSpan, into: P[], o: LitOptions = {}): { pts: P[]; colour: string } {
  const v0 = into[0]!;
  const ends = ([0, 1] as const).map((e) => ({ e, end: lineEnd(shape, line, e, o) })).sort((a, b) => v.len(v.sub(a.end.at, v0)) - v.len(v.sub(b.end.at, v0)));
  const { e, end } = ends[0]!;
  const half = CRISP.tuck.width / 2;
  if (v.len(v.sub(end.at, v0)) > HOOK.near) {
    // The V lies along the line: the hook branches off the line's middle at the V.
    const mid = lineEnd(shape, { ...line, from: v0, to: v0 }, 0, o);
    return { pts: [v.add(v0, v.mul(mid.inward, half)), ...into.slice(1)], colour: end.colour };
  }
  const taper = typeof line.taper === "number" ? line.taper : line.taper?.[e] ?? FREE_TAPER;
  const back = line.ends?.[e] === "join" ? 0 : HOOK.over * Math.min(taper, FREE_TAPER);
  const at = v.sub(end.at, v.mul(end.along, back));
  return { pts: [v.add(at, v.mul(end.inward, half)), v.add(end.at, v.mul(end.inward, half)), ...into.slice(1)], colour: end.colour };
}

/** Where a hook takes up its lock's line (hook()): the line's end within `near` pt of the V, taken up `over` of its taper back from its end (where a 1.2 pt line tapering to 0.15 has thinned to about the tuck's 0.9 pt). */
export const HOOK = { near: 1.5, over: 0.65 };

/** A crisp topknot's hooks: each `into` path of a curl carried on from its line (hook()), each an inner line with its meta. */
function hooks(c: Curl, shape: Shape, o: LitOptions): { svg: string; lines: DrawnLine[] } {
  if (!c.into?.length) return { svg: "", lines: [] };
  const drawn = c.into.map((pts) => {
    const h = hook(shape, c.line, pts, o), t = tuck(h.pts, { inset: false, where: "tuft hook" });
    return { svg: `<path d="${t.d}" fill="${h.colour}"/>`, line: t.line };
  });
  return { svg: drawn.map((x) => x.svg).join(""), lines: drawn.map((x) => x.line) };
}

/**
 * The topknot as one part (`tuft`): its curls back to front, each painted by `paint` (the fill, the highlight, the
 * feather into the crown), with its own soft rim of shade away from the light, the shade of the curls in front of it
 * falling on it, its own line and its notch strokes. With `style.crisp`, the crisp topknot (DECISIONS 262).
 */
export function topknot(curls: Curl[], paint: Paint, style: TopknotStyle = {}): Piece {
  if (style.crisp) return crispTopknot(curls, paint, style);
  if (curls.length < 3 || curls.length > 5) throw new Error(`a topknot is 3 to 5 curls, not ${curls.length}`);
  const shapes = curlShapes(curls);
  const notchTone = LINES.cream[1]!;
  // The curls drawn after this one lie in front of it: each casts its shade down and across away from the light (down
  // and right under the top-left light; a facing drawn in its mirror passes the light it is drawn in).
  const light = paint.light ?? LIGHT;
  const away: P = [-Math.sign(light[0]) * 0.9, -Math.sign(light[1]) * 1.1];
  return join(...curls.map((c, k) => {
    const cast = shapes.slice(k + 1).map((s) => pathD(s.segs.map((g) => g.map(([x, y]): P => [x + away[0], y + away[1]]) as typeof g)));
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

/** The crisp topknot (DECISIONS 262, 286; topknot(…, { crisp: true })). Throws when it is not 4 or 5 locks, or from behind not one tuft of two lobes. */
function crispTopknot(curls: Curl[], paint: Paint, style: TopknotStyle): Piece {
  if (style.behind) {
    const notches = curls[0]?.corners?.length ?? 0;
    if (curls.length !== CRISP.lobes.count || notches !== CRISP.lobes.notches)
      throw new Error(`a crisp topknot from behind is one tuft of two lobes (one curl, one notch between its lobes), not ${curls.length} curls with ${notches} notches`);
  } else if (curls.length < CRISP.count[0] || curls.length > CRISP.count[1]) throw new Error(`a crisp topknot is ${CRISP.count[0]} or ${CRISP.count[1]} small locks, not ${curls.length}`);
  const shapes = curlShapes(curls);
  const light = paint.light ?? LIGHT;
  const away: P = [-Math.sign(light[0]) * 0.9, -Math.sign(light[1]) * 1.1];
  // A free end tapers over a free end's taper at most, so no lock's line runs out into a long wedge.
  const short = (t: LitSpan["taper"]): LitSpan["taper"] => (t === undefined ? FREE_TAPER : typeof t === "number" ? Math.min(t, FREE_TAPER) : [Math.min(t[0], FREE_TAPER), Math.min(t[1], FREE_TAPER)]);
  return join(...curls.map((c, k) => {
    const cast = shapes.slice(k + 1).map((s) => pathD(s.segs.map((g) => g.map(([x, y]): P => [x + away[0], y + away[1]]) as typeof g)));
    const weight = c.line.weight ?? (style.weight ? { ...style.weight, seed: style.weight.seed + k } : undefined);
    const line: LitSpan = { ...c.line, taper: short(c.line.taper), most: Math.min(CRISP.most, typeof c.line.most === "number" ? c.line.most : 1), ...(weight ? { weight } : {}) };
    const o: LitOptions = { blur: 0, light };
    const lock = litPart("tuft", shapes[k]!, {
      ...paint,
      under: (paint.under ?? "") + (c.under ?? ""),
      // From behind, the tuft's own shade as its view types it; else each lock's rim and the shade of the locks in front.
      shade: style.behind && paint.shade ? paint.shade : { multiply: C.furShadeBy, rim: { inset: 1.3, toLight: 2.2 }, shapes: cast, keep: [`M-400 ${foot(c) - 0.6}H400V400H-400Z`], blur: 1.2 },
    }, [line], o);
    const h = hooks({ ...c, line }, shapes[k]!, o);
    if (!h.svg) return lock;
    // The hooks' own box, round every point they run through (and their width), with the lock's.
    const [x0, y0, x1, y1] = bbox([(c.into ?? []).flat().map((q): [P, P, P, P] => [q, q, q, q])].flat());
    return join(lock, piece(h.svg, union(lock.box, pad([x0, y0, x1 - x0, y1 - y0], 2)), { shapes: [], lines: h.lines }));
  }));
}
