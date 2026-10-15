// Lines (build time only): tapered ribbons drawn as filled polygons, so resvg
// paints them as plain fills. An outer line is drawn at twice its width centred
// on the edge, inside the shape's clip, so the silhouette stays exactly the
// path; each span has its own width and colour (fur spans take a lighter line).
// The wobble never takes a line out of its band (lint.ts LIMITS), and every
// line reports the widths it actually draws, for the lint to hold.
import { arc, area, fracAt, rng, spanPoints, v, polyD, type At, type P, type Shape } from "./geom.ts";
import { LIMITS } from "./lint.ts";
import type { LineMeta } from "./svg.ts";

/** A line as the lint sees it, with the narrowest and widest width it draws away from its tapered ends, in points. */
export interface DrawnLine extends LineMeta {
  drawn?: [number, number];
}

export interface Span {
  from: At;
  to: At;
  /** This span's width in points; the outline's own by default. */
  width?: number;
  colour?: string;
}

export interface Outline {
  colour: string;
  width: number;
  /** Where the line runs; the whole edge when left out. */
  spans?: Span[];
  /** How long each end takes to taper, in points. */
  taper?: number;
  /** A soft edge (σ in points), drawn in sRGB. */
  blur?: number;
  /** A low, slow width wobble, as a share of the width: a drawn line is never mechanically even. */
  wobble?: number;
}

export interface Stroke {
  taper?: number;
  /** The width the ends taper to. */
  tip?: number;
  wobble?: number;
  seed?: number;
  /** A closed loop: no taper. */
  closed?: boolean;
  /** Moves the centre line this far along each point's normal, (−t_y, t_x): the right of travel on screen. */
  offset?: number;
  /** The widths the wobble keeps the line's full width within (a width outside them is the lint's to refuse, never moved). */
  band?: [number, number];
}

/** The longest step between a line's points, in points. */
const STEP = 0.5;

/** The polygon of a line of varying width, and the narrowest and widest it is away from its tapered ends (or its widest, when it never reaches full width). */
export function strokeOf(given: P[], width: number, opts: Stroke = {}): { d: string; drawn: [number, number] } {
  // A point at least every half point, so a line of two or three points still swells to its width between its
  // tapered ends instead of staying as thin as its tips.
  const line: P[] = [];
  given.forEach((p, i) => {
    const q = given[i - 1];
    const steps = q ? Math.ceil(v.len(v.sub(p, q)) / STEP) : 0;
    for (let k = 1; k < steps; k++) line.push(v.add(q!, v.mul(v.sub(p, q!), k / steps)));
    line.push(p);
  });
  const at = arc(line), length = at[at.length - 1]!;
  const taper = opts.taper ?? Math.min(6, length / 3), tip = opts.tip ?? 0.15;
  const random = rng(opts.seed ?? 7);
  const phase = [random() * 6.28, random() * 6.28];
  const wobble = (s: number) => 1 + (opts.wobble ?? 0) * (0.6 * Math.sin(s / 9 + phase[0]!) + 0.4 * Math.sin(s / 3.7 + phase[1]!));
  const [lo, hi] = opts.band ? [Math.min(opts.band[0], width), Math.max(opts.band[1], width)] : [-Infinity, Infinity];
  const left: P[] = [], right: P[] = [];
  let narrowest = Infinity, widest = -Infinity, peak = 0;
  for (let i = 0; i < line.length; i++) {
    const s = at[i]!;
    const e = opts.closed ? 1 : Math.min(1, s / taper, (length - s) / taper);
    const k = wobble(s);
    const full = Math.min(hi, Math.max(lo, width * k));
    const w = tip * k + (full - tip * k) * e * e * (3 - 2 * e);
    if (e >= 1) {
      narrowest = Math.min(narrowest, w);
      widest = Math.max(widest, w);
    }
    peak = Math.max(peak, w);
    const t = v.norm(v.sub(line[Math.min(line.length - 1, i + 1)]!, line[Math.max(0, i - 1)]!));
    const n: P = [-t[1], t[0]];
    const c = v.add(line[i]!, v.mul(n, opts.offset ?? 0));
    left.push(v.add(c, v.mul(n, w / 2)));
    right.push(v.sub(c, v.mul(n, w / 2)));
  }
  return { d: polyD([...left, ...right.reverse()]), drawn: narrowest <= widest ? [narrowest, widest] : [peak, peak] };
}

/** A line of varying width as a filled polygon: full width in the middle, tapering to `tip` at both ends. */
export function taperedStroke(line: P[], width: number, opts: Stroke = {}): string {
  return strokeOf(line, width, opts).d;
}

/** The spans of a mirrored shape (mirrorX): each runs the other way, from the mirror of its end to the mirror of its start. */
export function mirrorSpans(spans: Span[]): Span[] {
  const flip = (at: At): At =>
    typeof at === "number" ? 1 - at : typeof at === "string" ? at.replace(/\.(L|R)\b/g, (_m, s: string) => (s === "L" ? ".R" : ".L")) : [-at[0], at[1]];
  return spans.map((span) => ({ ...span, from: flip(span.to), to: flip(span.from) }));
}

/** Each span as shares of the shape's length; the whole edge when no spans are given. */
export function spansOf(shape: Shape, o: Outline): { from: number; to: number; span: Span }[] {
  const spans = o.spans ?? [{ from: 0, to: 1 }];
  return spans.map((span) => ({ from: fracAt(shape, span.from), to: fracAt(shape, span.to), span }));
}

/**
 * The outline's ribbons, at twice each span's width and centred on the edge:
 * painted inside the shape's clip, `width` of each shows. With `reach`, the
 * ribbon is drawn unclipped instead, `width` wide, reaching `reach` pt past the
 * path (head.line, which covers the stencil's hard edge past the head's own).
 */
export function ribbons(shape: Shape, o: Outline, where: string, reach?: number): { svg: string; lines: DrawnLine[]; outlined: [number, number][] } {
  // The outside is to the left of travel on a path that runs clockwise on screen.
  const outward = area(spanPoints(shape, 0, 1)) > 0 ? 1 : -1;
  const lines: DrawnLine[] = [];
  const outlined: [number, number][] = [];
  const paths = spansOf(shape, o).map(({ from, to, span }, k) => {
    const width = span.width ?? o.width;
    outlined.push([from, to]);
    const whole = from === to || (from === 0 && to === 1);
    const opts: Stroke = { taper: o.taper, closed: whole, wobble: o.wobble ?? 0.1, seed: 11 + k };
    // Clipped, half the ribbon shows: its band is twice the line's.
    const shows = reach === undefined ? 2 : 1;
    const band: [number, number] = [LIMITS.outer[0] * shows, LIMITS.outer[1] * shows];
    const s = reach === undefined
      ? strokeOf(spanPoints(shape, from, to), width * 2, { ...opts, band })
      : strokeOf(spanPoints(shape, from, to), width, { ...opts, band, offset: -outward * (reach - width / 2) });
    lines.push({ kind: "outer", width, where, drawn: [s.drawn[0] / shows, s.drawn[1] / shows] });
    return `<path ${span.colour ? `fill="${span.colour}" ` : ""}d="${s.d}"/>`;
  });
  return { svg: paths.join(""), lines, outlined };
}

/** An inner line (toe lines, fur strokes, the muzzle): 0.6 to 0.9 pt. */
export function innerLine(pts: P[], width: number, colour: string, opts: Stroke & { opacity?: number } = {}): { svg: string; line: DrawnLine } {
  const opacity = opts.opacity === undefined || opts.opacity === 1 ? "" : ` opacity="${opts.opacity}"`;
  const s = strokeOf(pts, width, { wobble: 0.08, band: LIMITS.inner, ...opts });
  return { svg: `<path d="${s.d}" fill="${colour}"${opacity}/>`, line: { kind: "inner", width, where: "inner", drawn: s.drawn } };
}
