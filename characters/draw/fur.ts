// Fur edges (build time only): a row of locks on a span of a shape, where the
// sheet draws fur (the dog's head tuft, cheeks and chest). Each lock is two
// direct cubics: up from a notch on the base curve to a rounded tip leaning
// along the edge, and back down to the next notch. The base path outside the
// span is kept exactly (split, never resampled).
// Methods tried and rejected in the phase 3 designs: Catmull–Rom tufts made
// loops; procedural scallops read as a zigzag; evenly spaced lobes read as
// notches; round lobes read as cloud scallops.
import { area, bez, nodeAt, split, v, type P, type Seg, type Shape } from "./geom.ts";

export interface Lock {
  /** How far the tip stands out from the base curve, in points. */
  len: number;
  /** Its share of the span, relative to the other locks (1 by default). */
  w?: number;
  /** Lean along the edge, −1 to 1; positive leans the way the path runs, so the lock looks combed. */
  lean?: number;
}

/**
 * Replaces the span of a closed shape between the path points nearest `from`
 * and `to` (in path order, not wrapping past its start) with fur locks.
 * `tipRound` sets how round a tip is, as a share of its lock's width. `onLock`
 * hears each lock's tip, its root (the base curve under the tip) and the two
 * notches it rises between, in path order, for fur strokes and shades drawn
 * inside the edge.
 */
export function furEdge(base: Shape, from: string | P, to: string | P, locks: Lock[], tipRound = 0.3, onLock?: (tip: P, root: P, notches: [P, P]) => void): Shape {
  const place = (at: string | P): P => (typeof at === "string" ? nodeAt(base, at) : at);
  const per = 64;
  const samples: { i: number; t: number; p: P; s: number }[] = [];
  let walked = 0;
  let last: P | undefined;
  base.segs.forEach((seg, i) => {
    for (let k = 0; k <= per; k++) {
      if (i > 0 && k === 0) continue;
      const t = k / per, p = bez(seg, t);
      if (last) walked += v.len(v.sub(p, last));
      samples.push({ i, t, p, s: walked });
      last = p;
    }
  });
  const nearest = (q: P) => samples.reduce((b, x) => (v.len(v.sub(x.p, q)) < v.len(v.sub(b.p, q)) ? x : b));
  const A = nearest(place(from)), B = nearest(place(to));
  if (B.s <= A.s) throw new Error("furEdge: the span must not wrap past the path's start; start the path elsewhere");
  const at = (s: number) => {
    let k = samples.findIndex((x) => x.s >= s);
    if (k < 1) k = 1;
    const x = samples[k]!, y = samples[k - 1]!;
    return { p: x.p, tan: v.norm(v.sub(x.p, y.p)) };
  };
  const cw = area(samples.map((x) => x.p)) > 0;
  const outward = (tan: P): P => (cw ? [tan[1], -tan[0]] : [-tan[1], tan[0]]);
  const out: Seg[] = base.segs.slice(0, A.i);
  out.push(split(base.segs[A.i]!, A.t)[0]);
  const total = locks.reduce((sum, l) => sum + (l.w ?? 1), 0);
  let s = A.s;
  for (const l of locks) {
    const w = ((l.w ?? 1) / total) * (B.s - A.s);
    const v0 = at(s), v1 = at(s + w), mid = at(s + w / 2);
    const n0 = outward(v0.tan), n1 = outward(v1.tan), nm = outward(mid.tan);
    const lean = l.lean ?? 0;
    const tip = v.add(v.add(mid.p, v.mul(nm, l.len)), v.mul(mid.tan, lean * l.len * 0.7));
    // The tip's tangent runs along the edge, turned by the lean.
    const angle = Math.atan2(mid.tan[1], mid.tan[0]) + (cw ? -1 : 1) * lean * 0.5;
    const tt: P = [Math.cos(angle), Math.sin(angle)];
    const h = w * tipRound;
    onLock?.(tip, mid.p, [v0.p, v1.p]);
    out.push([v0.p, v.add(v0.p, v.add(v.mul(n0, l.len * 0.55), v.mul(v0.tan, w * 0.05))), v.sub(tip, v.mul(tt, h)), tip]);
    out.push([tip, v.add(tip, v.mul(tt, h)), v.add(v1.p, v.sub(v.mul(n1, l.len * 0.55), v.mul(v1.tan, w * 0.05))), v1.p]);
    s += w;
  }
  const rest = split(base.segs[B.i]!, B.t)[1];
  const end = out[out.length - 1]![3];
  out.push([end, rest[1], rest[2], rest[3]]);
  out.push(...base.segs.slice(B.i + 1));
  return { ...base, segs: out, fur: [...base.fur, [split(base.segs[A.i]!, A.t)[0][3], end]] };
}

/** Declares a span of a shape's own nodes as fur, where the hand nodes already draw the locks (the dog's topknot). */
export function furSpan(shape: Shape, from: string | P, to: string | P): Shape {
  const place = (at: string | P): P => (typeof at === "string" ? nodeAt(shape, at) : at);
  return { ...shape, fur: [...shape.fur, [place(from), place(to)]] };
}
