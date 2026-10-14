// Lines (build time only): tapered ribbons drawn as filled polygons, so resvg
// paints them as plain fills. An outer line is drawn at twice its width centred
// on the edge, inside the shape's clip, so the silhouette stays exactly the
// path; each span has its own width and colour (fur spans take a lighter line).
import { arc, area, fracAt, rng, spanPoints, v, polyD, type At, type P, type Shape } from "./geom.ts";
import type { LineMeta } from "./svg.ts";

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
}

/** A line of varying width as a filled polygon: full width in the middle, tapering to `tip` at both ends. */
export function taperedStroke(line: P[], width: number, opts: Stroke = {}): string {
  const at = arc(line), length = at[at.length - 1]!;
  const taper = opts.taper ?? Math.min(6, length / 3), tip = opts.tip ?? 0.15;
  const random = rng(opts.seed ?? 7);
  const phase = [random() * 6.28, random() * 6.28];
  const wobble = (s: number) => 1 + (opts.wobble ?? 0) * (0.6 * Math.sin(s / 9 + phase[0]!) + 0.4 * Math.sin(s / 3.7 + phase[1]!));
  const left: P[] = [], right: P[] = [];
  for (let i = 0; i < line.length; i++) {
    const s = at[i]!;
    const e = opts.closed ? 1 : Math.min(1, s / taper, (length - s) / taper);
    const w = (tip + (width - tip) * e * e * (3 - 2 * e)) * wobble(s);
    const t = v.norm(v.sub(line[Math.min(line.length - 1, i + 1)]!, line[Math.max(0, i - 1)]!));
    const n: P = [-t[1], t[0]];
    const c = v.add(line[i]!, v.mul(n, opts.offset ?? 0));
    left.push(v.add(c, v.mul(n, w / 2)));
    right.push(v.sub(c, v.mul(n, w / 2)));
  }
  return polyD([...left, ...right.reverse()]);
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
export function ribbons(shape: Shape, o: Outline, where: string, reach?: number): { svg: string; lines: LineMeta[]; outlined: [number, number][] } {
  // The outside is to the left of travel on a path that runs clockwise on screen.
  const outward = area(spanPoints(shape, 0, 1)) > 0 ? 1 : -1;
  const lines: LineMeta[] = [];
  const outlined: [number, number][] = [];
  const paths = spansOf(shape, o).map(({ from, to, span }, k) => {
    const width = span.width ?? o.width;
    lines.push({ kind: "outer", width, where });
    outlined.push([from, to]);
    const whole = from === to || (from === 0 && to === 1);
    const opts: Stroke = { taper: o.taper, closed: whole, wobble: o.wobble ?? 0.1, seed: 11 + k };
    const d = reach === undefined
      ? taperedStroke(spanPoints(shape, from, to), width * 2, opts)
      : taperedStroke(spanPoints(shape, from, to), width, { ...opts, offset: -outward * (reach - width / 2) });
    return `<path ${span.colour ? `fill="${span.colour}" ` : ""}d="${d}"/>`;
  });
  return { svg: paths.join(""), lines, outlined };
}

/** An inner line (toe lines, fur strokes, the muzzle): 0.6 to 0.9 pt. */
export function innerLine(pts: P[], width: number, colour: string, opts: Stroke & { opacity?: number } = {}): { svg: string; line: LineMeta } {
  const opacity = opts.opacity === undefined || opts.opacity === 1 ? "" : ` opacity="${opts.opacity}"`;
  return { svg: `<path d="${taperedStroke(pts, width, { wobble: 0.08, ...opts })}" fill="${colour}"${opacity}/>`, line: { kind: "inner", width, where: "inner" } };
}
