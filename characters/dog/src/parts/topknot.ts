// The dog's topknot, one recipe for every view (DECISIONS 75, 80): 3 to 5 separate soft curls of fur, the middle one
// taller, smaller ones stepping down to each side, never one lumpy cap. Each curl is its own shape, drawn back to
// front, in the crown's cream, lit toward the top left and softly shaded along its edges away from the light, the curl
// in front casting a soft shade on the one behind where it tucks under it, and its own line by the dog's line rule
// (parts/lines.ts), swelling over its crown. Where two curls meet, or a curl meets the crown's line, the sheet's line
// dips into a simple V and runs on as one short stroke into the fur, tapering out: never a hook curling back on
// itself. Each view types its curls' nodes, lines and notch strokes from its own crop.
import { furSpan } from "../../../draw/fur.ts";
import { arc, pathD, polyD, sample, smooth, v, type Node, type P, type Shape } from "../../../draw/geom.ts";
import { LIGHT, type Paint } from "../../../draw/paint.ts";
import { blur, join, pad, piece, uid, type Piece } from "../../../draw/svg.ts";
import { C, LINES } from "../palette.ts";
import { FREE_TAPER, litPart, type LitSpan } from "./lines.ts";

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
 * never the long tapered wedge that read as a dark sliver spike, and each lock's base tucked into a short inner stroke
 * from its V: curved as typed, starting at the V at `width` with a round end, so the lock's line turns into it as the
 * sheet's line does, and thinning out to `tip` toward its inner end only, in the notch strokes' tone at `opacity`,
 * softened by `blur` (σ, pt), so it reads as the line tucking into the fur, never a dark spike. Unclipped: a stroke
 * clipped to a pointed lock is a sliver.
 */
export const CRISP = { count: [4, 5] as [number, number], most: 0.2, tuck: { width: 1, tip: 0.1, opacity: 0.9, blur: 0.2 } };

/** How the topknot is drawn: as before (the default), or crisp with its locks' bases tucked (DECISIONS 262). */
export interface TopknotStyle {
  crisp?: boolean;
}

/** One tuck stroke along `pts` from its V: `width` at the V, with a round end there, easing out to `tip` at its inner end. */
function tuck(pts: P[]): string {
  const { width, tip } = CRISP.tuck;
  // Its round end's outer edge on the V, so no part of it pokes out past a pointed lock's tip.
  const start = v.add(pts[0]!, v.mul(v.norm(v.sub(pts[1]!, pts[0]!)), width / 2));
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
  return `${polyD([...left, ...right.reverse()])}M${f(x - r)} ${f(y)}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
}

/** A crisp topknot's tuck strokes: each `into` path from its V (tuck). */
function tucks(c: Curl, box: [number, number, number, number]): string {
  if (!c.into?.length) return "";
  const { opacity, blur: sd } = CRISP.tuck, f = uid("blur");
  return `<defs>${blur(f, pad(box, 2), sd)}</defs><path d="${c.into.map(tuck).join("")}" fill="${LINES.cream[1]}" opacity="${opacity}" filter="url(#${f})"/>`;
}

/**
 * The topknot as one part (`tuft`): its curls back to front, each painted by `paint` (the fill, the highlight, the
 * feather into the crown), with its own soft rim of shade away from the light, the shade of the curls in front of it
 * falling on it, its own line and its notch strokes. With `style.crisp`, the crisp topknot (DECISIONS 262).
 */
export function topknot(curls: Curl[], paint: Paint, style: TopknotStyle = {}): Piece {
  if (style.crisp) return crispTopknot(curls, paint);
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

/** The crisp topknot (DECISIONS 262; topknot(…, { crisp: true })). Throws when it is not 4 or 5 locks. */
function crispTopknot(curls: Curl[], paint: Paint): Piece {
  if (curls.length < CRISP.count[0] || curls.length > CRISP.count[1]) throw new Error(`a crisp topknot is ${CRISP.count[0]} or ${CRISP.count[1]} small locks, not ${curls.length}`);
  const shapes = curlShapes(curls);
  const light = paint.light ?? LIGHT;
  const away: P = [-Math.sign(light[0]) * 0.9, -Math.sign(light[1]) * 1.1];
  // A free end tapers over a free end's taper at most, so no lock's line runs out into a long wedge.
  const short = (t: LitSpan["taper"]): LitSpan["taper"] => (t === undefined ? FREE_TAPER : typeof t === "number" ? Math.min(t, FREE_TAPER) : [Math.min(t[0], FREE_TAPER), Math.min(t[1], FREE_TAPER)]);
  return join(...curls.map((c, k) => {
    const cast = shapes.slice(k + 1).map((s) => pathD(s.segs.map((g) => g.map(([x, y]): P => [x + away[0], y + away[1]]) as typeof g)));
    const lock = litPart("tuft", shapes[k]!, {
      ...paint,
      under: (paint.under ?? "") + (c.under ?? ""),
      shade: { multiply: C.furShadeBy, rim: { inset: 1.3, toLight: 2.2 }, shapes: cast, keep: [`M-400 ${foot(c) - 0.6}H400V400H-400Z`], blur: 1.2 },
    }, [{ ...c.line, taper: short(c.line.taper), most: Math.min(CRISP.most, typeof c.line.most === "number" ? c.line.most : 1) }], { blur: 0 });
    const t = tucks(c, lock.box);
    return t ? join(lock, piece(t, lock.box)) : lock;
  }));
}
