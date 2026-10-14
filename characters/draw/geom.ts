// Geometry for drawing parts (build time only): hand-typed nodes become few,
// smooth cubic Béziers. Points are in points (pt), y down, in model space (the
// ground under the seat is 0, 0). Every shape starts from nodes typed by hand
// at its extremes and inflections; nothing here moves a node toward a sheet.

export type P = [number, number];
/** A hand-typed node: a point, or a point with a name that spans and corners can use, so they survive edits. */
export type Node = P | [number, number, string];
/** A cubic Bézier: start, two controls, end. */
export type Seg = [P, P, P, P];
/** Where on a closed shape: a share of its length from its first node, a node's name, or the point nearest a place. */
export type At = number | string | P;

export interface Shape {
  nodes: Node[];
  /** How many of the nodes were typed by hand (a symmetric shape's other half is mirrored): the lint caps them. */
  typed: number;
  segs: Seg[];
  closed: boolean;
  /** Spans drawn as fur (fur.ts), as their two ends on the path; the corner lint leaves them alone. */
  fur: [P, P][];
}

const add = (a: P, b: P): P => [a[0] + b[0], a[1] + b[1]];
const sub = (a: P, b: P): P => [a[0] - b[0], a[1] - b[1]];
const mul = (a: P, k: number): P => [a[0] * k, a[1] * k];
const dot = (a: P, b: P) => a[0] * b[0] + a[1] * b[1];
const cross = (a: P, b: P) => a[0] * b[1] - a[1] * b[0];
const len = (a: P) => Math.hypot(a[0], a[1]);
const norm = (a: P): P => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l];
};
export const v = { add, sub, mul, dot, cross, len, norm };

const point = (n: Node): P => [n[0], n[1]];
const nameOf = (n: Node) => (n.length === 3 ? n[2] : undefined);

/** Centripetal Catmull–Rom through the points, as cubics: no cusps or loops between close nodes. Corners turn sharply. */
export function catmullRom(pts: P[], closed = true, corners: number[] = []): Seg[] {
  const n = pts.length;
  const at = (i: number) => (closed ? pts[(i + n) % n]! : pts[Math.max(0, Math.min(n - 1, i))]!);
  const segs: Seg[] = [];
  const count = closed ? n : n - 1;
  for (let i = 0; i < count; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    const d01 = Math.sqrt(len(sub(p1, p0))) || 1e-6;
    const d12 = Math.sqrt(len(sub(p2, p1))) || 1e-6;
    const d23 = Math.sqrt(len(sub(p3, p2))) || 1e-6;
    // Tangents in the Barry–Goldman form, scaled to the segment's own parameter span.
    let m1 = mul(add(sub(mul(sub(p1, p0), 1 / d01), mul(sub(p2, p0), 1 / (d01 + d12))), mul(sub(p2, p1), 1 / d12)), d12);
    let m2 = mul(add(sub(mul(sub(p2, p1), 1 / d12), mul(sub(p3, p1), 1 / (d12 + d23))), mul(sub(p3, p2), 1 / d23)), d12);
    if (!closed && i === 0) m1 = sub(p2, p1);
    if (!closed && i === count - 1) m2 = sub(p2, p1);
    if (corners.includes(i % n)) m1 = mul(sub(p2, p1), 0.5);
    if (corners.includes((i + 1) % n)) m2 = mul(sub(p2, p1), 0.5);
    segs.push([p1, add(p1, mul(m1, 1 / 3)), sub(p2, mul(m2, 1 / 3)), p2]);
  }
  return segs;
}

export function bez(s: Seg, t: number): P {
  const u = 1 - t;
  const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
  return [a * s[0][0] + b * s[1][0] + c * s[2][0] + d * s[3][0], a * s[0][1] + b * s[1][1] + c * s[2][1] + d * s[3][1]];
}

function bezD(s: Seg, t: number): P {
  const u = 1 - t;
  return [
    3 * u * u * (s[1][0] - s[0][0]) + 6 * u * t * (s[2][0] - s[1][0]) + 3 * t * t * (s[3][0] - s[2][0]),
    3 * u * u * (s[1][1] - s[0][1]) + 6 * u * t * (s[2][1] - s[1][1]) + 3 * t * t * (s[3][1] - s[2][1]),
  ];
}

function bezDD(s: Seg, t: number): P {
  const u = 1 - t;
  return [
    6 * u * (s[2][0] - 2 * s[1][0] + s[0][0]) + 6 * t * (s[3][0] - 2 * s[2][0] + s[1][0]),
    6 * u * (s[2][1] - 2 * s[1][1] + s[0][1]) + 6 * t * (s[3][1] - 2 * s[2][1] + s[1][1]),
  ];
}

/** Dense samples along the segments, `per` to a segment; an open path also gets its end point. */
export function sample(segs: Seg[], per = 32, closed = true): P[] {
  const out: P[] = [];
  segs.forEach((s, i) => {
    for (let k = 0; k < per; k++) out.push(bez(s, k / per));
    if (!closed && i === segs.length - 1) out.push(bez(s, 1));
  });
  return out;
}

/** Cumulative length along a polyline. */
export function arc(pts: P[]): number[] {
  const a = [0];
  for (let i = 1; i < pts.length; i++) a.push(a[i - 1]! + len(sub(pts[i]!, pts[i - 1]!)));
  return a;
}

/** Signed area of a closed polyline: positive when it runs clockwise on screen (y down). */
export function area(pts: P[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) s += cross(pts[i]!, pts[(i + 1) % pts.length]!);
  return s / 2;
}

/** The bounds of a path: [left, top, right, bottom]. Controls bound a cubic, so this never undershoots. */
export function bbox(segs: Seg[]): [number, number, number, number] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of segs) for (const [x, y] of s) {
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  return [x0, y0, x1, y1];
}

// Schneider's curve fit (Graphics Gems, 1990), as paper.js simplify uses it.

function chordParams(pts: P[], a: number, b: number): number[] {
  const u = [0];
  for (let i = a + 1; i <= b; i++) u.push(u[u.length - 1]! + len(sub(pts[i]!, pts[i - 1]!)));
  const total = u[u.length - 1]! || 1;
  return u.map((x) => x / total);
}

function generate(pts: P[], a: number, b: number, u: number[], t1: P, t2: P): Seg {
  const p0 = pts[a]!, p3 = pts[b]!;
  let c00 = 0, c01 = 0, c11 = 0, x0 = 0, x1 = 0;
  for (let i = 0; i <= b - a; i++) {
    const t = u[i]!, s = 1 - t;
    const b0 = s * s * s, b1 = 3 * t * s * s, b2 = 3 * t * t * s, b3 = t * t * t;
    const a1 = mul(t1, b1), a2 = mul(t2, b2);
    c00 += dot(a1, a1);
    c01 += dot(a1, a2);
    c11 += dot(a2, a2);
    const rest = sub(pts[a + i]!, add(mul(p0, b0 + b1), mul(p3, b2 + b3)));
    x0 += dot(a1, rest);
    x1 += dot(a2, rest);
  }
  const det = c00 * c11 - c01 * c01;
  let alpha1 = 0, alpha2 = 0;
  if (Math.abs(det) > 1e-12) {
    alpha1 = (x0 * c11 - x1 * c01) / det;
    alpha2 = (c00 * x1 - c01 * x0) / det;
  }
  // A degenerate solve falls back to Wu and Barsky's heuristic: a third of the chord.
  const chord = len(sub(p3, p0));
  if (alpha1 < 1e-6 * chord || alpha2 < 1e-6 * chord) alpha1 = alpha2 = chord / 3;
  return [p0, add(p0, mul(t1, alpha1)), add(p3, mul(t2, alpha2)), p3];
}

function maxError(pts: P[], a: number, b: number, s: Seg, u: number[]): { d: number; i: number } {
  let d = 0, at = Math.floor((a + b) / 2);
  for (let i = a + 1; i < b; i++) {
    const e = len(sub(bez(s, u[i - a]!), pts[i]!));
    if (e > d) {
      d = e;
      at = i;
    }
  }
  return { d, i: at };
}

function reparameterize(pts: P[], a: number, u: number[], s: Seg): number[] {
  return u.map((t, k) => {
    const diff = sub(bez(s, t), pts[a + k]!);
    const d1 = bezD(s, t), d2 = bezDD(s, t);
    const den = dot(d1, d1) + dot(diff, d2);
    return Math.abs(den) < 1e-12 ? t : Math.min(1, Math.max(0, t - dot(diff, d1) / den));
  });
}

function fitRange(pts: P[], a: number, b: number, t1: P, t2: P, tol: number, out: Seg[]): void {
  if (b - a === 1) {
    const d = len(sub(pts[b]!, pts[a]!)) / 3;
    out.push([pts[a]!, add(pts[a]!, mul(t1, d)), add(pts[b]!, mul(t2, d)), pts[b]!]);
    return;
  }
  let u = chordParams(pts, a, b);
  let s = generate(pts, a, b, u, t1, t2);
  let e = maxError(pts, a, b, s, u);
  if (e.d < tol) {
    out.push(s);
    return;
  }
  if (e.d < tol * 4) {
    for (let k = 0; k < 6; k++) {
      u = reparameterize(pts, a, u, s);
      s = generate(pts, a, b, u, t1, t2);
      e = maxError(pts, a, b, s, u);
      if (e.d < tol) {
        out.push(s);
        return;
      }
    }
  }
  const centre = norm(sub(pts[e.i - 1]!, pts[e.i + 1]!));
  fitRange(pts, a, e.i, t1, centre, tol, out);
  fitRange(pts, e.i, b, mul(centre, -1), t2, tol, out);
}

/**
 * Schneider's fit of an open polyline: as few cubics as stay within `tol` pt of
 * it. The end tangents point along the curve at the start and back along it at
 * the end; by default they come from the polyline's end points.
 */
export function fitCubic(pts: P[], tol = 0.2, t1?: P, t2?: P): Seg[] {
  const out: Seg[] = [];
  const n = pts.length - 1;
  if (n < 1) return out;
  fitRange(pts, 0, n, t1 ?? norm(sub(pts[1]!, pts[0]!)), t2 ?? norm(sub(pts[n - 1]!, pts[n]!)), tol, out);
  return out;
}

/** The index of a node given by index or by name. */
function nodeIndex(nodes: Node[], which: number | string): number {
  if (typeof which === "number") return which;
  const i = nodes.findIndex((n) => nameOf(n) === which);
  if (i < 0) throw new Error(`no node named ${which}`);
  return i;
}

/**
 * Hand nodes to a smooth path: centripetal Catmull–Rom through them, sampled,
 * then refitted by Schneider into few cubics, one run between each pair of
 * corners so a corner stays a corner (25 ear nodes become about 13 cubics).
 */
export function smooth(nodes: Node[], opts: { closed?: boolean; corners?: (number | string)[]; tol?: number; typed?: number } = {}): Shape {
  const closed = opts.closed ?? true;
  const pts = nodes.map(point);
  const corners = (opts.corners ?? []).map((c) => nodeIndex(nodes, c));
  const cr = catmullRom(pts, closed, corners);
  // Runs start at node 0 and at each corner; each is fitted with the Catmull–Rom
  // tangents at its ends, so the joins between runs stay smooth where they should.
  const breaks = [...new Set([0, ...corners])].sort((a, b) => a - b);
  const segs: Seg[] = [];
  for (let k = 0; k < breaks.length; k++) {
    const from = breaks[k]!;
    const to = k + 1 < breaks.length ? breaks[k + 1]! : cr.length;
    const run = cr.slice(from, to);
    if (!run.length) continue;
    const first = run[0]!, last = run[run.length - 1]!;
    const t1 = norm(sub(first[1], first[0]));
    const t2 = norm(sub(last[2], last[3]));
    segs.push(...fitCubic(sample(run, 24, false), opts.tol ?? 0.2, t1, t2));
  }
  return { nodes, segs, closed, fur: [], typed: opts.typed ?? nodes.length };
}

/**
 * A shape symmetric about x = 0, typed as its half on the viewer's left from
 * the top centre down, and its bottom centre; the other half is the mirror.
 */
export function symmetric(half: Node[], bottom: Node, opts: { corners?: (number | string)[]; tol?: number } = {}): Shape {
  return smooth([...half, bottom, ...mirrorX(half, false).slice(0, -1)], { ...opts, typed: half.length + 1 });
}

/** de Casteljau: one cubic split at t. */
export function split(s: Seg, t: number): [Seg, Seg] {
  const l = (a: P, b: P): P => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const p01 = l(s[0], s[1]), p12 = l(s[1], s[2]), p23 = l(s[2], s[3]);
  const p012 = l(p01, p12), p123 = l(p12, p23), m = l(p012, p123);
  return [[s[0], p01, p012, m], [m, p123, p23, s[3]]];
}

/** Dense samples of a closed path with their share of its length, from its start. */
function measured(segs: Seg[]): { pts: P[]; at: number[]; length: number } {
  const pts = sample(segs, 48);
  const a = arc([...pts, pts[0]!]);
  const length = a[a.length - 1]!;
  return { pts, at: a.slice(0, pts.length).map((s) => s / length), length };
}

/** A named node's place. */
export function nodeAt(shape: Shape, name: string): P {
  return point(shape.nodes[nodeIndex(shape.nodes, name)]!);
}

/** The share of a closed path's length, from its start, at the point nearest a place, a named node or a share itself. */
export function fracAt(shape: Shape, at: At): number {
  if (typeof at === "number") return at;
  const p = typeof at === "string" ? nodeAt(shape, at) : at;
  const m = measured(shape.segs);
  let best = 0, bestD = Infinity;
  m.pts.forEach((q, i) => {
    const d = len(sub(q, p));
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return m.at[best]!;
}

/** True when share f lies on the span from `from` to `to` (shares of a closed path), which may wrap past the start. */
export function onSpan(f: number, from: number, to: number): boolean {
  return from <= to ? f >= from && f <= to : f >= from || f <= to;
}

/** The points of a closed path from one share of its length to another, wrapping past its start when `to` < `from`. */
export function spanPoints(shape: Shape, from: number, to: number): P[] {
  const m = measured(shape.segs);
  const out: P[] = [];
  const n = m.pts.length;
  const whole = from === to || (from === 0 && to === 1);
  let start = m.at.findIndex((s) => s >= from);
  if (start < 0) start = 0;
  for (let k = 0; k <= n; k++) {
    const i = (start + k) % n;
    if (k > 0 && !whole && !onSpan(m.at[i]!, from, to)) break;
    if (k === n && !whole) break;
    out.push(m.pts[i]!);
  }
  return out;
}

/**
 * Mirrors nodes across x = 0, swapping .L and .R in their names. The path runs
 * the other way, so it keeps its turning sense; a closed shape keeps its first
 * node first, so a share f of its length becomes 1 − f on the mirror.
 */
export function mirrorX(nodes: Node[], closed = true): Node[] {
  const swap = (name: string) => name.replace(/\.(L|R)\b/g, (_m, s: string) => (s === "L" ? ".R" : ".L"));
  const mirrored = nodes.map((n): Node => (n.length === 3 ? [-n[0], n[1], swap(n[2])] : [-n[0], n[1]])).reverse();
  return closed ? [mirrored[mirrored.length - 1]!, ...mirrored.slice(0, -1)] : mirrored;
}

/**
 * The tightest radius of curvature on a closed path where `keep` allows (a share
 * of its length), convex and concave apart. A kink between two cubics (a corner)
 * counts as radius 0.
 */
export function minRadius(segs: Seg[], keep: (f: number) => boolean = () => true): { convex: { r: number; at: P }; concave: { r: number; at: P } } {
  const per = 64;
  const pts: P[] = [];
  const turns: number[] = [];
  for (const s of segs) {
    for (let k = 0; k < per; k++) {
      const t = k / per, d1 = bezD(s, t), d2 = bezDD(s, t);
      const speed = len(d1);
      pts.push(bez(s, t));
      turns.push(speed < 1e-9 ? 0 : cross(d1, d2) / (speed * speed * speed));
    }
  }
  const a = arc([...pts, pts[0]!]);
  const total = a[a.length - 1]! || 1;
  const sign = Math.sign(area(pts)) || 1;
  const convex = { r: Infinity, at: [0, 0] as P }, concave = { r: Infinity, at: [0, 0] as P };
  const note = (r: number, turn: number, i: number) => {
    if (!keep(a[i]! / total)) return;
    const side = Math.sign(turn) === sign ? convex : concave;
    if (r < side.r) {
      side.r = r;
      side.at = pts[i]!;
    }
  };
  turns.forEach((k, i) => {
    if (k !== 0) note(1 / Math.abs(k), k, i);
  });
  // The direction a cubic leaves its start, and arrives at its end (from the nearest control that is not on the end).
  const leaving = (s: Seg) => norm(sub(len(sub(s[1], s[0])) > 1e-9 ? s[1] : s[2], s[0]));
  const arriving = (s: Seg) => norm(sub(s[3], len(sub(s[3], s[2])) > 1e-9 ? s[2] : s[1]));
  segs.forEach((s, i) => {
    const before = arriving(segs[(i - 1 + segs.length) % segs.length]!), after = leaving(s);
    const turn = Math.atan2(cross(before, after), dot(before, after));
    if (Math.abs(turn) > 0.05) note(0, turn, i * per);
  });
  return { convex, concave };
}

const fmt = (n: number) => (Math.round(n * 1000) / 1000).toString();

/** SVG path data for cubics. */
export function pathD(segs: Seg[], closed = true): string {
  if (!segs.length) return "";
  let d = `M${fmt(segs[0]![0][0])} ${fmt(segs[0]![0][1])}`;
  for (const s of segs) d += `C${fmt(s[1][0])} ${fmt(s[1][1])} ${fmt(s[2][0])} ${fmt(s[2][1])} ${fmt(s[3][0])} ${fmt(s[3][1])}`;
  return closed ? d + "Z" : d;
}

/** SVG path data for a polyline. */
export function polyD(pts: P[], closed = true): string {
  return pts.map((p, i) => `${i ? "L" : "M"}${fmt(p[0])} ${fmt(p[1])}`).join("") + (closed ? "Z" : "");
}

/** The runtime's own random source (mulberry32), so anything seeded never changes between builds. */
export { mulberry32 as rng } from "../../runtime-web/src/math.ts";
