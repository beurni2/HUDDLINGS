// The dog's outer line, one rule in every view (DECISIONS 74): its colour and weight come from the light and the
// place, never typed span by span. Where the edge faces the top-left light the line is lightest and thinnest (1.2 pt,
// the cream ladder's L* 74, toward the sheet's L* 66 to 85 on the crown and the cream); where it turns away it
// deepens and fills out (1.55 pt); where a part meets the ground, and where the span says the place lies under
// another part (under the chin, an ear on the body, a haunch's underside), it is darkest and fullest (1.7 pt, the
// sole's line). Round the ears, and where the line lies on the tan, the same rule runs on the tan ladder, a warm
// brown. Each span tapers to nothing at both ends, so the line breaks where the fur breaks it. Colours come from
// palette.ts's LINES ladders, 11 tones each, so every colour is the palette's.
// The fur pass's options (DECISIONS 210 to 212, 216), each off unless a span or a view asks for it, so a view draws
// as it did until its lane opts in: `ends` gives one span per visible edge, tapering only where it ends in open fur;
// `contact` keeps a line where one part lies over another as dark in both facings (Q31); `ground: "sole"` puts the
// ground's dark only under the middle of a paw's sole; `crisp` keeps head.line's outer edge sharp.
import { arc, area, fracAt, sample, spanPoints, v, type At, type P, type Shape } from "../../../draw/geom.ts";
import type { DrawnLine } from "../../../draw/line.ts";
import { LIMITS, shapeKey, type EndKind, type SpanMeta } from "../../../draw/lint.ts";
import { LIGHT, marking, part, type Fade, type Paint } from "../../../draw/paint.ts";
import { blur, mask, pad, piece, region, uid, type Box, type Piece } from "../../../draw/svg.ts";
import { LINES } from "../palette.ts";

/** How a span's end finishes (DECISIONS 210): in open fur, tapering over 1.5 to 2 pt; on another line's end, at full width; or running on under the part that covers it. */
export type SpanEnd = "free" | "join" | "under";

export interface LitSpan {
  from: At;
  to: At;
  /** The ladder: round the cream fur (the default) or on the tan, along the span or at each point (a cheek's line runs from the tan over the ear onto the cream). */
  on?: "cream" | "tan" | ((p: P) => "cream" | "tan");
  /** How deep the place lies whatever the light, 0 to 1, along the span or at each point: a floor under the light's own depth (1 is the sole's). */
  under?: number | ((p: P) => number);
  /** How deep the line may lie at most, 0 to 1, along the span or at each point: a ceiling, lighter and thinner, where the sheet lines a fur edge lightly (the chin's and the cheeks' fur, DECISIONS 214). */
  most?: number | ((p: P) => number);
  /** How long each end tapers, in points: both ends alike, or [its start, its end]. With `ends`, how long a free end tapers (1.8 pt when left out). */
  taper?: number | [number, number];
  /**
   * How each end finishes (DECISIONS 210), [its start, its end]: a `free` end, where the line ends in open fur, tapers
   * over `taper` (1.8 pt by default); a `join` end meets another line on a shared point at full width, with a round
   * cap so the two meet at any angle; an `under` end runs on 1.5 pt past where it is typed at full width, under the
   * part that covers it, and then fades out over 1.8 pt there, so an end that no part covers fades rather than stopping
   * in a square cut (the line gate, lint.ts, checks that a part does cover it). Left out, both ends taper as before (74).
   */
  ends?: [SpanEnd, SpanEnd];
  /** A line where one part lies over another (DECISIONS 211, Q31): its depth is its place's, never the light's, and at least 0.5, so it keeps the sheet's darkness in both facings. */
  contact?: boolean;
  /** Where the ground darkens the line (DECISIONS 216): along the whole edge that faces it (the default), or only under the middle 60% of a paw's sole, where it presses, the line lighter, thinner and more varied round it. */
  ground?: "sole";
  /** The DECISIONS entry that lets this span break the line gate's rules (lint.ts), where the sheet draws it so: a current entry, or the gate fails the cite. */
  cites?: number;
  /** With `cites`: how far past each end, in points, the sheet leaves the edge unlined, [before its start, after its end], which the cite lets through and no further. */
  bare?: [number, number];
}

export interface LitOptions {
  /** The light, toward it (paint.ts's LIGHT; a mirrored facing passes its own). */
  light?: P;
  /** A soft edge, σ in points, drawn in sRGB. */
  blur?: number;
  /** Drawn unclipped, reaching this far past the path (head.line covers the stencil's edge), instead of inside the part's clip. */
  reach?: number;
  /** With `reach`: the soft edge kept inside the path grown by `reach`, so the silhouette's own edge stays crisp and only the line's inner side is soft (DECISIONS 212). */
  crisp?: boolean;
}

/** The widths: lit, turned away, darkest (the sheet's soft line peaks at about 1 to 1.5 pt even under the paws). */
const WIDTH = { lit: 1.2, away: 1.45, deep: 1.6 };
/** The line's soft falloff, σ in points: the sheet's line is a soft peak, never a flat plateau with hard edges. */
const SOFT = 0.3;
/** A free end's taper, in points (DECISIONS 210: 1.5 to 2 pt, the spec's "slightly tapered where it ends"). */
export const FREE_TAPER = 1.8;
/** How far an `under` end runs on past where it is typed, at full width, under the part that covers it (at least 1 pt), before it fades out over FREE_TAPER. */
export const UNDER_RUN = 1.5;
/** A contact line's least depth (Q31): the ladder's middle, the sheet's dark brown over a haunch's or an ear's edge. */
export const CONTACT_DEPTH = 0.5;
/**
 * Under a paw's sole (DECISIONS 216): the ground's dark only under the middle 60% of the sole, easing out over the
 * 20% at each end; there the line is tone 7 (L* 51.5, the sheet's front soles 51 ± 5.5 and hind soles 44 ± 3.6) and
 * 1.45 pt; elsewhere round the paw it is the light's own tone, from 1.2 pt where lit; and it wobbles ±15% along its
 * length, as the sheet's paw lines vary (the founder's "a lighter, warmer, varied line").
 */
export const SOLE = { depth: 0.7, width: [1.2, 1.45] as [number, number], middle: 0.6, wobble: 0.15 };

/** How deep a point of an edge lies, 0 to 1, from the light and the ground. */
function depth(p: P, out: P, light: P): number {
  // Facing the light, 0; side on to it, 0.15; turned away, 0.3; and deeper the nearer the ground the edge lies,
  // furthest from the light over the top, easing in from 45 pt up to 0.35 at the ground (the sheet's lines darken
  // from the crown's L* 68 to 81 and the chest's 67 to the haunches' 61 to 67 and the paws' 49 to 61).
  const t = Math.min(1, Math.max(0, (p[1] + 45) / 43));
  const lit = 0.3 * ((1 - v.dot(out, light)) / 2) + 0.35 * t * t * (3 - 2 * t);
  // Where the edge faces down onto the ground, it runs on to the darkest.
  const ground = Math.min(1, Math.max(0, (p[1] + 6.5) / 4.5)) * Math.min(1, Math.max(0, (out[1] - 0.15) / 0.5));
  return Math.min(1, lit + (1 - lit) * ground);
}

/** depth()'s two terms apart, for the fur pass's options: the light and the place (`lit`), and how much the edge faces the ground. */
function terms(p: P, out: P, light: P | undefined): { lit: number; ground: number } {
  const t = Math.min(1, Math.max(0, (p[1] + 45) / 43));
  // With no light (a contact line), the edge counts as side on to it, whichever way it faces.
  const facing = light ? (1 - v.dot(out, light)) / 2 : 0.5;
  return {
    lit: 0.3 * facing + 0.35 * t * t * (3 - 2 * t),
    ground: Math.min(1, Math.max(0, (p[1] + 6.5) / 4.5)) * Math.min(1, Math.max(0, (out[1] - 0.15) / 0.5)),
  };
}

const widthAt = (d: number) => WIDTH.lit + (WIDTH.away - WIDTH.lit) * Math.min(1, d / 0.5) + (WIDTH.deep - WIDTH.away) * Math.max(0, (d - 0.5) / 0.5);
/** Round a paw (DECISIONS 216): 1.2 pt where lit, 1.45 pt at the sole's middle. */
const soleWidthAt = (d: number) => SOLE.width[0] + (SOLE.width[1] - SOLE.width[0]) * Math.min(1, d / SOLE.depth);
const smoothstep = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

/**
 * How much of the ground's dark each point of a span takes under `ground: "sole"`: within each run of points that face
 * the ground, all of it over the run's middle 60%, easing out to none at the run's ends, so the dark lies only where
 * the paw presses.
 */
function soleWindow(ground: number[], at: number[]): number[] {
  const out = ground.map(() => 0);
  let i = 0;
  while (i < ground.length) {
    if (ground[i]! <= 0.05) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < ground.length && ground[j + 1]! > 0.05) j++;
    const s0 = at[i]!, length = at[j]! - s0, edge = (length * (1 - SOLE.middle)) / 2;
    for (let k = i; k <= j; k++) {
      const s = at[k]! - s0;
      out[k] = edge > 0 ? smoothstep(Math.min(s, length - s) / edge) : 1;
    }
    i = j + 1;
  }
  return out;
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const xy = (p: P) => `${r3(p[0])} ${r3(p[1])}`;
const poly = (pts: P[]) => pts.map((p, i) => `${i ? "L" : "M"}${xy(p)}`).join("") + "Z";
/** A round cap: a disc as a 16-sided polygon, so resvg paints it as a plain fill. */
const disc = (c: P, r: number) => poly(Array.from({ length: 16 }, (_, k): P => [c[0] + r * Math.cos((k * Math.PI) / 8), c[1] + r * Math.sin((k * Math.PI) / 8)]));

/** A drawn line with what the line gate reads of its span (lint.ts). */
export type LitLine = DrawnLine & { span: SpanMeta };

/**
 * The lit line's ribbons along each span of a closed shape: drawn twice their width centred on the edge for a part's
 * clip, so the silhouette stays the path, or `reach` past it unclipped. Each run of one tone is its own polygon,
 * overlapping its neighbours by a sample, filled from the ladder.
 */
export function litRibbons(shape: Shape, spans: LitSpan[], where: string, o: LitOptions = {}): { svg: string; lines: LitLine[]; outlined: [number, number][] } {
  const light = o.light ?? LIGHT;
  const cw = area(spanPoints(shape, 0, 1)) > 0;
  const lines: LitLine[] = [];
  const outlined: [number, number][] = [];
  const key = shapeKey(shape.segs);
  let total: number | undefined;
  const pathLength = () => (total ??= arc([...spanPoints(shape, 0, 1), spanPoints(shape, 0, 1)[0]!]).at(-1)!);
  let svg = "";
  spans.forEach((span, k) => {
    let from = fracAt(shape, span.from), to = fracAt(shape, span.to);
    // An end that runs on under the part over it is drawn on past where it is typed, at full width, then fades out under it.
    if (span.ends?.[0] === "under") from = (from - (UNDER_RUN + FREE_TAPER) / pathLength() + 1) % 1;
    if (span.ends?.[1] === "under") to = (to + (UNDER_RUN + FREE_TAPER) / pathLength()) % 1;
    outlined.push([from, to]);
    const pts = spanPoints(shape, from, to);
    if (pts.length < 3) return;
    const at = [0];
    for (let i = 1; i < pts.length; i++) at.push(at[i - 1]! + v.len(v.sub(pts[i]!, pts[i - 1]!)));
    const length = at[at.length - 1]!;
    const tan = pts.map((_, i) => v.norm(v.sub(pts[Math.min(pts.length - 1, i + 1)]!, pts[Math.max(0, i - 1)]!)));
    const out = tan.map((t): P => (cw ? [t[1], -t[0]] : [-t[1], t[0]]));
    // Depth from the light and the ground, floored by the place, then eased along the line over about 1.5 pt each way.
    const under = (p: P) => (typeof span.under === "function" ? span.under(p) : span.under ?? 0);
    const most = (p: P) => (typeof span.most === "function" ? span.most(p) : span.most ?? 1);
    let raw: number[];
    if (!span.contact && !span.ground) raw = pts.map((p, i) => Math.max(under(p), depth(p, out[i]!, light)));
    else {
      // A contact line takes no light, and is never lighter than the ladder's middle; a paw's line takes the ground's
      // dark only under the middle of its sole.
      const t = pts.map((p, i) => terms(p, out[i]!, span.contact ? undefined : light));
      const g = span.ground === "sole" ? soleWindow(t.map((x) => x.ground), at).map((w, i) => w * t[i]!.ground) : t.map((x) => x.ground);
      const deepest = span.ground === "sole" ? SOLE.depth : 1;
      raw = pts.map((p, i) => {
        const lit = t[i]!.lit;
        const d = Math.min(1, lit + Math.max(0, deepest - lit) * g[i]!);
        return Math.max(under(p), span.contact ? CONTACT_DEPTH : 0, d);
      });
    }
    const d = raw.map((_, i) => {
      let sum = 0, n = 0;
      for (let j = i; j >= 0 && at[i]! - at[j]! <= 1.5; j--) (sum += raw[j]!, n++);
      for (let j = i + 1; j < pts.length && at[j]! - at[i]! <= 1.5; j++) (sum += raw[j]!, n++);
      // The ceiling after the easing, so a line that comes and goes with its fur keeps its rhythm.
      return span.most === undefined ? sum / n : Math.min(most(pts[i]!), sum / n);
    });
    let t0: number, t1: number;
    if (!span.ends) {
      const [a0, a1] = typeof span.taper === "object" ? span.taper : [span.taper ?? Math.min(5, length / 3), span.taper ?? Math.min(5, length / 3)];
      // A short span tapers over no more than three quarters of its length, so it always swells to its full width.
      const fit = Math.min(1, (0.75 * length) / (a0 + a1));
      (t0 = a0 * fit), (t1 = a1 * fit);
    } else {
      // A free end tapers where it ends; an under end fades out past its full-width run, under its part; a join end is at full width to its last point.
      const asked = typeof span.taper === "object" ? span.taper : [span.taper ?? FREE_TAPER, span.taper ?? FREE_TAPER];
      const [a0, a1] = span.ends.map((e, i) => (e === "free" ? asked[i]! : e === "under" ? FREE_TAPER : 0)) as [number, number];
      const fit = a0 + a1 > 0 ? Math.min(1, (0.75 * length) / (a0 + a1)) : 1;
      (t0 = a0 * fit), (t1 = a1 * fit);
    }
    const phase = [(k * 2.39) % 6.28, (k * 4.11) % 6.28];
    const wobble = span.ground === "sole" ? SOLE.wobble : 0.06;
    const widthOf = span.ground === "sole" ? soleWidthAt : widthAt;
    const w = d.map((di, i) => {
      const s = at[i]!;
      const e = Math.min(1, t0 > 0 ? s / t0 : 1, t1 > 0 ? (length - s) / t1 : 1);
      const full = Math.min(LIMITS.outer[1], Math.max(LIMITS.outer[0], widthOf(di) * (1 + wobble * (0.6 * Math.sin(s / 9 + phase[0]!) + 0.4 * Math.sin(s / 3.7 + phase[1]!)))));
      return { full, e, shown: 0.15 + (full - 0.15) * e * e * (3 - 2 * e) };
    });
    // Clipped, the ribbon is twice the line and half of it shows; unclipped, it is the line, moved out to reach past the path.
    const twice = o.reach === undefined ? 2 : 1;
    const centre = pts.map((p, i) => (o.reach === undefined ? p : v.add(p, v.mul(out[i]!, o.reach - w[i]!.shown / 2))));
    // A crisp line runs on past its outer edge by twice its blur, so the blur's falloff lies past the mask that cuts it
    // there (crispened) and the line is full to its edge.
    const bleed = o.crisp && o.reach !== undefined ? 2 * (o.blur ?? SOFT) : 0;
    const left = centre.map((c, i) => v.add(c, v.mul(out[i]!, (w[i]!.shown * twice) / 2 + bleed)));
    const right = centre.map((c, i) => v.sub(c, v.mul(out[i]!, (w[i]!.shown * twice) / 2)));
    // Each point's colour: its depth's tone on its ladder (a span may cross from the tan onto the cream).
    const ladder = (p: P) => LINES[(typeof span.on === "function" ? span.on(p) : span.on) ?? "cream"];
    const colour = d.map((di, i) => ladder(pts[i]!)[Math.max(0, Math.min(10, Math.round(di * 10)))]!);
    let a = 0;
    while (a < pts.length) {
      let b = a;
      while (b + 1 < pts.length && colour[b + 1] === colour[a]) b++;
      const i0 = Math.max(0, a - 1), i1 = Math.min(pts.length - 1, b + 1);
      svg += `<path fill="${colour[a]}" d="${poly([...left.slice(i0, i1 + 1), ...right.slice(i0, i1 + 1).reverse()])}"/>`;
      a = b + 1;
    }
    // A joined end ends round, so it meets the other line at any angle with no notch: clipped, a disc as deep as the line shows; unclipped, as wide as the line.
    span.ends?.forEach((e, i) => {
      if (e !== "join") return;
      const j = i === 0 ? 0 : pts.length - 1;
      svg += `<path fill="${colour[j]}" d="${disc(centre[j]!, (w[j]!.shown * twice) / 2)}"/>`;
    });
    const full = w.filter((x) => x.e >= 1).map((x) => x.full);
    const shown = full.length ? full : [Math.max(...w.map((x) => x.shown))];
    const drawn: [number, number] = [Math.min(...shown), Math.max(...shown)];
    const ends: [EndKind, EndKind] = span.ends ? [span.ends[0], span.ends[1]] : ["taper", "taper"];
    lines.push({ kind: "outer", width: r3((drawn[0] + drawn[1]) / 2), where, drawn,
      span: { shape: key, from, to, length: r3(length), ends, taper: [r3(t0), r3(t1)], ...(span.contact ? { contact: true } : {}), ...(span.cites ? { cites: span.cites } : {}), ...(span.cites && span.bare ? { bare: span.bare } : {}) } });
  });
  return { svg, lines, outlined };
}

/** The ribbons in a group with their soft edge, its filter's region over `box`. */
function softened(r: { svg: string }, box: Box, sd: number): { defs: string; body: string } {
  const f = uid("blur");
  return { defs: blur(f, pad(box, 2), sd), body: `<g filter="url(#${f})">${r.svg}</g>` };
}

/**
 * The ribbons' soft edge kept inside the shape grown by `reach` (DECISIONS 212): a mask of the path filled and stroked
 * round 2·reach wide (the path grown by a disc, with no loops at its notches), so whatever the blur spreads past the
 * line's outer edge is cut there and the silhouette's edge is crisp; the stencil's edge under it stays covered, since
 * the line's own outer edge lies on the mask's.
 */
function crispened(shape: Shape, s: { defs: string; body: string }, box: Box, reachPt: number): { defs: string; body: string } {
  const id = uid("crisp"), d = shapePath(shape);
  return {
    defs: s.defs + mask(id, pad(box, 2), `<path d="${d}" fill="#FFFFFF" stroke="#FFFFFF" stroke-width="${r3(2 * reachPt)}" stroke-linejoin="round"/>`),
    body: `<g mask="url(#${id})">${s.body}</g>`,
  };
}

/** A feathered join's mask, as paint.ts draws a part's: transparent at `from`, opaque at `to`. */
function feather(f: { from: P; to: P }, area: Box): { defs: string; id: string } {
  const id = uid("feather"), g = uid("fade");
  return {
    id,
    defs: mask(id, area, `<linearGradient id="${g}" gradientUnits="userSpaceOnUse" x1="${r3(f.from[0])}" y1="${r3(f.from[1])}" x2="${r3(f.to[0])}" y2="${r3(f.to[1])}">` +
      `<stop offset="0" stop-color="#000000"/><stop offset="1" stop-color="#FFFFFF"/></linearGradient><rect ${region(area)} fill="url(#${g})"/>`),
  };
}

/** How faint a feathered part may lie and its line still count as drawn at full width (the line gate, lint.ts). */
const FADED = 0.9;

/**
 * Where a part's feather fades its own lines (paint.ts's feather: transparent at `from`, opaque at `to`): the runs of
 * the shape's outline, as shares (as the line gate measures them), where the mask is below FADED, so the gate holds
 * them as below full width, as they are drawn.
 */
function fadedRuns(shape: Shape, f: { from: P; to: P }): [number, number][] {
  const pts = sample(shape.segs, 48), at = arc([...pts, pts[0]!]), total = at.at(-1)!;
  const along = v.sub(f.to, f.from), l2 = v.dot(along, along);
  const faded = pts.map((p) => Math.min(1, Math.max(0, v.dot(v.sub(p, f.from), along) / l2)) < FADED);
  const runs: [number, number][] = [];
  for (let i = 0; i < pts.length; i++) {
    if (!faded[i] || (i > 0 && faded[i - 1])) continue;
    let j = i;
    while (j + 1 < pts.length && faded[j + 1]) j++;
    runs.push([at[i]! / total, (j + 1 < pts.length ? at[j + 1]! : total) / total]);
  }
  // A run through the path's start is one run.
  if (runs.length > 1 && faded[0] && faded[pts.length - 1]) runs[0] = [runs.pop()![0], runs[0]![1]];
  return runs;
}

/** The lines drawn inside a shape's clip (and its feather), as defs and a body. */
function clippedLines(name: string, shape: Shape, spans: LitSpan[], box: Box, paint: Paint, o: LitOptions) {
  const r = litRibbons(shape, spans, name, { ...o, light: o.light ?? paint.light });
  // Under a feather the lines fade with the part: their spans say where, for the line gate.
  if (paint.feather) {
    const faded = fadedRuns(shape, paint.feather);
    if (faded.length) for (const l of r.lines) l.span.faded = faded;
  }
  const clip = uid("clip");
  const s = softened(r, box, o.blur ?? SOFT);
  let defs = `<clipPath id="${clip}"><path d="${shapePath(shape)}"/></clipPath>${s.defs}`;
  let body = `<g clip-path="url(#${clip})">${s.body}</g>`;
  if (paint.feather) {
    const m = feather(paint.feather, pad(box, 2));
    defs += m.defs;
    body = `<g mask="url(#${m.id})">${body}</g>`;
  }
  return { defs, body, r };
}

const shapePath = (shape: Shape) => {
  const s = shape.segs;
  let d = `M${xy(s[0]![0])}`;
  for (const g of s) d += `C${xy(g[1])} ${xy(g[2])} ${xy(g[3])}`;
  return d + "Z";
};

/** A shape whose spans of its own path are declared toe lobes (parts/paw.ts): the lint lets them turn tighter than 4 pt, as the stubby-paws panel draws them (Q29). */
export type Lobed = Shape & { lobes?: [P, P][] };

/** A part painted by paint.ts (its fill, shade and highlight) with the lit line along `spans` instead of a typed outline. */
export function litPart(name: string, shape: Shape, paint: Paint, spans: LitSpan[], o: LitOptions = {}): Piece {
  const base = part(name, shape, { ...paint, outline: undefined });
  const l = clippedLines(name, shape, spans, base.box, paint, o);
  const [meta] = base.meta.shapes;
  const lobes = (shape as Lobed).lobes;
  return piece(`${base.svg}<defs>${l.defs}</defs>${l.body}`, base.box, {
    shapes: [{ ...meta!, outlined: l.r.outlined, ...(lobes ? { lobes: lobes.map(([a, b]) => [fracAt(shape, a), fracAt(shape, b)]) } : {}) }],
    lines: [...base.meta.lines, ...l.r.lines],
  });
}

/**
 * A marking clipped to its part (paint.ts's marking), carrying its part's lit line over itself inside its own soft
 * edge, as a marking carries its part's typed outline.
 */
export function litMarking(name: string, on: { shape: Shape; paint: Paint; spans: LitSpan[] }, patch: Shape, opts: { fill: string; blur: number; fade?: Fade }, o: LitOptions = {}): Piece {
  const base = marking(name, { shape: on.shape, paint: { ...on.paint, outline: undefined } }, patch, { ...opts, clip: true });
  const l = clippedLines(name, on.shape, on.spans, base.box, { ...on.paint, feather: undefined }, o);
  // The marking draws through its patch's mask: `<defs>…</defs><g mask="…">…</g>`; the line goes in as its last layer.
  if (!base.svg.endsWith("</g>")) throw new Error("litMarking: a marking's drawing no longer ends in its masked group");
  return piece(`<defs>${l.defs}</defs>${base.svg.slice(0, -4)}${l.body}</g>`, base.box, {
    shapes: base.meta.shapes,
    lines: [...base.meta.lines, ...l.r.lines.map((line) => ({ ...line, where: `${name} over ${line.where}` }))],
  });
}

/** Spans that share their settings: each span's own settings win. */
export const withDefaults = (defaults: Omit<LitSpan, "from" | "to">, spans: LitSpan[]): LitSpan[] => spans.map((s) => ({ ...defaults, ...s }));

/** head.line's lit spans: unclipped, reaching `reach` past the path, as one group with its soft edge (kept inside the grown path when `crisp`). */
export function litEdge(shape: Shape, spans: LitSpan[], where: string, box: Box, o: LitOptions & { reach: number }) {
  const r = litRibbons(shape, spans, where, o);
  let s = softened(r, box, o.blur ?? SOFT);
  if (o.crisp) s = crispened(shape, s, box, o.reach);
  return { defs: s.defs, body: s.body, lines: r.lines, outlined: r.outlined };
}
