// The dog's outer line, one rule in every view (DECISIONS 74): its colour and weight come from the light and the
// place, never typed span by span. Where the edge faces the top-left light the line is lightest and thinnest (1.2 pt,
// the cream ladder's L* 74, toward the sheet's L* 66 to 85 on the crown and the cream); where it turns away it
// deepens and fills out (1.55 pt); where a part meets the ground, and where the span says the place lies under
// another part (under the chin, an ear on the body, a haunch's underside), it is darkest and fullest (1.7 pt, the
// sole's line). Round the ears, and where the line lies on the tan, the same rule runs on the tan ladder, a warm
// brown. Each span tapers to nothing at both ends, so the line breaks where the fur breaks it. Colours come from
// palette.ts's LINES ladders, 11 tones each, so every colour is the palette's.
import { area, fracAt, spanPoints, v, type At, type P, type Shape } from "../../../draw/geom.ts";
import type { DrawnLine } from "../../../draw/line.ts";
import { LIMITS } from "../../../draw/lint.ts";
import { LIGHT, marking, part, type Fade, type Paint } from "../../../draw/paint.ts";
import { blur, mask, pad, piece, region, uid, type Box, type Piece } from "../../../draw/svg.ts";
import { LINES } from "../palette.ts";

export interface LitSpan {
  from: At;
  to: At;
  /** The ladder: round the cream fur (the default) or on the tan. */
  on?: "cream" | "tan";
  /** How deep the place lies whatever the light, 0 to 1, along the span or at each point: a floor under the light's own depth (1 is the sole's). */
  under?: number | ((p: P) => number);
  /** How long each end tapers, in points: both ends alike, or [its start, its end]. */
  taper?: number | [number, number];
}

export interface LitOptions {
  /** The light, toward it (paint.ts's LIGHT; a mirrored facing passes its own). */
  light?: P;
  /** A soft edge, σ in points, drawn in sRGB. */
  blur?: number;
  /** Drawn unclipped, reaching this far past the path (head.line covers the stencil's edge), instead of inside the part's clip. */
  reach?: number;
}

/** The widths: lit, turned away, darkest (the sheet's soft line peaks at about 1 to 1.5 pt even under the paws). */
const WIDTH = { lit: 1.2, away: 1.45, deep: 1.6 };
/** The line's soft falloff, σ in points: the sheet's line is a soft peak, never a flat plateau with hard edges. */
const SOFT = 0.3;

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

const widthAt = (d: number) => WIDTH.lit + (WIDTH.away - WIDTH.lit) * Math.min(1, d / 0.5) + (WIDTH.deep - WIDTH.away) * Math.max(0, (d - 0.5) / 0.5);

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const xy = (p: P) => `${r3(p[0])} ${r3(p[1])}`;
const poly = (pts: P[]) => pts.map((p, i) => `${i ? "L" : "M"}${xy(p)}`).join("") + "Z";

/**
 * The lit line's ribbons along each span of a closed shape: drawn twice their width centred on the edge for a part's
 * clip, so the silhouette stays the path, or `reach` past it unclipped. Each run of one tone is its own polygon,
 * overlapping its neighbours by a sample, filled from the ladder.
 */
export function litRibbons(shape: Shape, spans: LitSpan[], where: string, o: LitOptions = {}): { svg: string; lines: DrawnLine[]; outlined: [number, number][] } {
  const light = o.light ?? LIGHT;
  const cw = area(spanPoints(shape, 0, 1)) > 0;
  const lines: DrawnLine[] = [];
  const outlined: [number, number][] = [];
  let svg = "";
  spans.forEach((span, k) => {
    const from = fracAt(shape, span.from), to = fracAt(shape, span.to);
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
    const raw = pts.map((p, i) => Math.max(under(p), depth(p, out[i]!, light)));
    const d = raw.map((_, i) => {
      let sum = 0, n = 0;
      for (let j = i; j >= 0 && at[i]! - at[j]! <= 1.5; j--) (sum += raw[j]!, n++);
      for (let j = i + 1; j < pts.length && at[j]! - at[i]! <= 1.5; j++) (sum += raw[j]!, n++);
      return sum / n;
    });
    const [a0, a1] = typeof span.taper === "object" ? span.taper : [span.taper ?? Math.min(5, length / 3), span.taper ?? Math.min(5, length / 3)];
    // A short span tapers over no more than three quarters of its length, so it always swells to its full width.
    const fit = Math.min(1, (0.75 * length) / (a0 + a1)), t0 = a0 * fit, t1 = a1 * fit;
    const phase = [(k * 2.39) % 6.28, (k * 4.11) % 6.28];
    const w = d.map((di, i) => {
      const s = at[i]!;
      const e = Math.min(1, s / t0, (length - s) / t1);
      const full = Math.min(LIMITS.outer[1], Math.max(LIMITS.outer[0], widthAt(di) * (1 + 0.06 * (0.6 * Math.sin(s / 9 + phase[0]!) + 0.4 * Math.sin(s / 3.7 + phase[1]!)))));
      return { full, e, shown: 0.15 + (full - 0.15) * e * e * (3 - 2 * e) };
    });
    // Clipped, the ribbon is twice the line and half of it shows; unclipped, it is the line, moved out to reach past the path.
    const twice = o.reach === undefined ? 2 : 1;
    const centre = pts.map((p, i) => (o.reach === undefined ? p : v.add(p, v.mul(out[i]!, o.reach - w[i]!.shown / 2))));
    const left = centre.map((c, i) => v.add(c, v.mul(out[i]!, (w[i]!.shown * twice) / 2)));
    const right = centre.map((c, i) => v.sub(c, v.mul(out[i]!, (w[i]!.shown * twice) / 2)));
    const family = LINES[span.on ?? "cream"];
    const tone = d.map((di) => Math.max(0, Math.min(10, Math.round(di * 10))));
    let a = 0;
    while (a < pts.length) {
      let b = a;
      while (b + 1 < pts.length && tone[b + 1] === tone[a]) b++;
      const i0 = Math.max(0, a - 1), i1 = Math.min(pts.length - 1, b + 1);
      svg += `<path fill="${family[tone[a]!]}" d="${poly([...left.slice(i0, i1 + 1), ...right.slice(i0, i1 + 1).reverse()])}"/>`;
      a = b + 1;
    }
    const full = w.filter((x) => x.e >= 1).map((x) => x.full);
    const shown = full.length ? full : [Math.max(...w.map((x) => x.shown))];
    const drawn: [number, number] = [Math.min(...shown), Math.max(...shown)];
    lines.push({ kind: "outer", width: r3((drawn[0] + drawn[1]) / 2), where, drawn });
  });
  return { svg, lines, outlined };
}

/** The ribbons in a group with their soft edge, its filter's region over `box`. */
function softened(r: { svg: string }, box: Box, sd: number): { defs: string; body: string } {
  const f = uid("blur");
  return { defs: blur(f, pad(box, 2), sd), body: `<g filter="url(#${f})">${r.svg}</g>` };
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

/** The lines drawn inside a shape's clip (and its feather), as defs and a body. */
function clippedLines(name: string, shape: Shape, spans: LitSpan[], box: Box, paint: Paint, o: LitOptions) {
  const r = litRibbons(shape, spans, name, { ...o, light: o.light ?? paint.light });
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

/** A part painted by paint.ts (its fill, shade and highlight) with the lit line along `spans` instead of a typed outline. */
export function litPart(name: string, shape: Shape, paint: Paint, spans: LitSpan[], o: LitOptions = {}): Piece {
  const base = part(name, shape, { ...paint, outline: undefined });
  const l = clippedLines(name, shape, spans, base.box, paint, o);
  const [meta] = base.meta.shapes;
  return piece(`${base.svg}<defs>${l.defs}</defs>${l.body}`, base.box, {
    shapes: [{ ...meta!, outlined: l.r.outlined }],
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

/** head.line's lit spans: unclipped, reaching `reach` past the path, as one group with its soft edge. */
export function litEdge(shape: Shape, spans: LitSpan[], where: string, box: Box, o: LitOptions & { reach: number }) {
  const r = litRibbons(shape, spans, where, o);
  const s = softened(r, box, o.blur ?? SOFT);
  return { defs: s.defs, body: s.body, lines: r.lines, outlined: r.outlined };
}
