// Fur edges (build time only): a row of locks on a span of a shape, where the
// sheet draws fur (the dog's head tuft, cheeks and chest). Each lock is two
// direct cubics: up from a notch on the base curve to a rounded tip leaning
// along the edge, and back down to the next notch. The base path outside the
// span is kept exactly (split, never resampled).
// Methods tried and rejected in the phase 3 designs: Catmull–Rom tufts made
// loops; procedural scallops read as a zigzag; evenly spaced lobes read as
// notches; round lobes read as cloud scallops. The fur pass (dog DECISIONS 213)
// types each lock per crop instead, by its width in points, and checks the row
// against the rules its use asks (furCheck): taller than the first locks, uneven,
// leaning, the notches dipping a little inside the base. A lock's tip may turn
// tighter than the 4 pt corner rule where the sheet draws it so (Q29's default):
// the lint leaves declared fur spans out of that rule.
import { area, bez, nodeAt, split, v, type P, type Seg, type Shape } from "./geom.ts";

export interface Lock {
  /** How far the tip stands out from the base curve, in points. */
  len: number;
  /** Its share of the span, relative to the other locks (1 by default). */
  w?: number;
  /** Lean along the edge, −1 to 1; positive leans the way the path runs, so the lock looks combed. */
  lean?: number;
  /** Its width along the edge in points, typed from the crop: a row whose every lock has one is laid out by them, fitted to its span (furCheck holds the fit). */
  width?: number;
  /** How far the notch after it dips inside the base curve, in points (not after the row's last lock, which ends on the base). */
  dip?: number;
  /**
   * How the edge runs through the notch after it, 0 to 1: left out (0) it turns sharply out of the notch, as every row
   * first did, so the notches are the points and the locks round bumps; toward 1 it flows through the notch along the
   * base, so the notch is soft and the tips are the points, as the sheet's wisps (the chin's and the cheeks', dog
   * DECISIONS 214), where sharp notches between low bumps read as a cloud's scallops.
   */
  notch?: number;
}

/** What a typed row of locks must be, for one use (DECISIONS 213): each range is [least, most]. */
export interface FurRules {
  /** How many locks in the row. */
  count?: [number, number];
  /** How far each tip stands out, in points. */
  len: [number, number];
  /** Each lock's width along the edge as laid out, in points. */
  width: [number, number];
  /** The row's tipRound, the most it may be (a blunt tip reads as a cloud scallop). */
  tipRound: number;
  /** How far each leans along the fur's flow, as |lean|. */
  lean: [number, number];
  /** Each lock's length over its width, at least: a short wide lock reads as lace. */
  ratio: number;
  /** How much each lock differs from its neighbour, at least, in length or width (a share of the larger): an even row reads as a cog. */
  vary: number;
  /** How far each notch between two locks dips inside the base, in points. */
  dip: [number, number];
  /** How deep a lock's notches lie below its tip, at most, as a share of its width (its length and the deeper notch beside it): a deep notch on a broad lobe reads as a saw tooth. */
  depth?: number;
  /** A row of 4 or more may not alternate wide and narrow all along: broad lobes spaced so read as a repeat (the tail's first clumps). */
  noRepeat?: boolean;
  /** How far the typed widths may be stretched or squeezed to fill their span, as a share. */
  fit: number;
}

/**
 * Tufts where the sheet draws fur locks (the cheeks, the chin's sides, the chest, the crown, the tail; the fur plan's
 * G3): 2 to 4 pt long, 3 to 5 pt wide, sharp-tipped, leaning 0.3 to 0.6 along the flow, no lock within 20% of its
 * neighbour, the notches dipping 0.5 to 1 pt.
 */
export const TUFTS: FurRules = { len: [2, 4], width: [3, 5], tipRound: 0.25, lean: [0.3, 0.6], ratio: 0.5, vary: 0.2, dip: [0.5, 1], fit: 0.15 };

/**
 * Clumps where the sheet draws broad soft lobes of fur instead (the tail plume's back): 4 to 10 pt wide, 1 to 3 pt
 * long, leaning 0.15 to 0.6 so each ends where it tucks under the next, their notches shallow: a lobe's length and the
 * deeper notch beside it at most 0.3 of its width (the tail-curve panel's notches are about 1 pt into 8 to 10 pt
 * lobes), and spaced irregularly. Locks of tuft size along a whole plume read as a saw, and clumps notched 3 pt deep,
 * alternating big and small, as a saw's teeth (dog DECISIONS 213).
 */
export const CLUMPS: FurRules = { len: [1, 3], width: [4, 10], tipRound: 0.35, lean: [0.15, 0.6], ratio: 0.15, vary: 0.2, dip: [0.2, 0.6], depth: 0.3, noRepeat: true, fit: 0.15 };

/**
 * A step in a fur edge (an ear's outer edge part way down, the chest under each end of the collar): one broad low lock
 * leaning along the edge, so the edge steps out below it as the floppy-ears panel draws it, 4 to 10 pt wide and 0.6 to
 * 1.6 pt high, never a hook or a horn (a step leaning 0.7 or more read as a barb, dog DECISIONS 213 and 215).
 */
export const STEP: FurRules = { count: [1, 1], len: [0.6, 1.6], width: [4, 10], tipRound: 0.35, lean: [0.2, 0.5], ratio: 0.08, vary: 0, dip: [0, 0], depth: 0.3, fit: 0.15 };

/** Every way a typed row breaks its rules, in words; none for a row that keeps them. `span` is the span's length in points. */
export function furCheck(locks: Lock[], tipRound: number, rules: FurRules, span: number): string[] {
  const problems: string[] = [];
  const within = (x: number, [lo, hi]: [number, number]) => x >= lo - 1e-9 && x <= hi + 1e-9;
  const n = locks.length;
  if (rules.count && !within(n, rules.count)) problems.push(`${n} locks, not ${rules.count[0]} to ${rules.count[1]}`);
  if (!locks.every((l) => l.width !== undefined)) return [...problems, "every lock needs its width in points, typed from the crop"];
  const typed = locks.reduce((sum, l) => sum + l.width!, 0);
  const scale = span / typed;
  if (Math.abs(scale - 1) > rules.fit) problems.push(`the locks are typed ${typed.toFixed(1)} pt wide for a span of ${span.toFixed(1)} pt (within ${rules.fit * 100}%)`);
  if (tipRound > rules.tipRound + 1e-9) problems.push(`tipRound ${tipRound} is blunter than ${rules.tipRound}`);
  locks.forEach((l, i) => {
    const w = l.width! * scale, lean = Math.abs(l.lean ?? 0);
    if (!within(l.len, rules.len)) problems.push(`lock ${i} stands ${l.len} pt out, not ${rules.len[0]} to ${rules.len[1]}`);
    if (!within(w, rules.width)) problems.push(`lock ${i} is ${w.toFixed(2)} pt wide, not ${rules.width[0]} to ${rules.width[1]}`);
    if (!within(lean, rules.lean)) problems.push(`lock ${i} leans ${lean}, not ${rules.lean[0]} to ${rules.lean[1]}`);
    if (l.len / w < rules.ratio - 1e-9) problems.push(`lock ${i} is ${(l.len / w).toFixed(2)} as long as it is wide, under ${rules.ratio}`);
    if (i < n - 1 && !within(l.dip ?? 0, rules.dip)) problems.push(`the notch after lock ${i} dips ${l.dip ?? 0} pt, not ${rules.dip[0]} to ${rules.dip[1]}`);
    const deeper = Math.max(i > 0 ? locks[i - 1]!.dip ?? 0 : 0, i < n - 1 ? l.dip ?? 0 : 0);
    if (rules.depth !== undefined && (l.len + deeper) / w > rules.depth + 1e-9)
      problems.push(`lock ${i}'s notches lie ${(l.len + deeper).toFixed(2)} pt below its tip, ${((l.len + deeper) / w).toFixed(2)} of its width, over ${rules.depth}`);
    const next = locks[i + 1];
    if (next) {
      const differ = Math.max(Math.abs(l.len - next.len) / Math.max(l.len, next.len), Math.abs(l.width! - next.width!) / Math.max(l.width!, next.width!));
      if (differ < rules.vary - 1e-9) problems.push(`locks ${i} and ${i + 1} differ by ${(differ * 100).toFixed(0)}%, under ${rules.vary * 100}%`);
    }
  });
  // A row of broad lobes whose widths go wide, narrow, wide, narrow all along reads as a repeat, not fur.
  const turns = locks.slice(1).map((l, i) => Math.sign(l.width! - locks[i]!.width!));
  if (rules.noRepeat && n >= 4 && turns.every((t, i) => t !== 0 && (i === 0 || t === -turns[i - 1]!))) problems.push(`the locks' widths alternate wide and narrow all along (${locks.map((l) => l.width).join(", ")}): a repeat, not fur`);
  return problems;
}

/**
 * Replaces the span of a closed shape between the path points nearest `from`
 * and `to` (in path order, not wrapping past its start) with fur locks.
 * `tipRound` sets how round a tip is, as a share of its lock's width. `onLock`
 * hears each lock's tip, its root (the base curve under the tip) and the two
 * notches it rises between, in path order, for fur strokes and shades drawn
 * inside the edge. A row whose every lock has a `width` is laid out by those
 * widths, fitted to the span, each notch dipping its lock's `dip` inside the
 * base; with `rules`, the row is checked first and refused if it breaks them.
 */
export function furEdge(base: Shape, from: string | P, to: string | P, locks: Lock[], tipRound = 0.3, onLock?: (tip: P, root: P, notches: [P, P]) => void, rules?: FurRules): Shape {
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
  if (rules) {
    const problems = furCheck(locks, tipRound, rules, B.s - A.s);
    if (problems.length) throw new Error(`furEdge: the typed row of locks from (${A.p.map((n) => n.toFixed(1)).join(", ")}) to (${B.p.map((n) => n.toFixed(1)).join(", ")}), ${(B.s - A.s).toFixed(1)} pt along the path, breaks its rules: ${problems.join("; ")}`);
  }
  const typed = locks.every((l) => l.width !== undefined);
  const at = (s: number) => {
    // A typed row reads a place that falls on a sample as that sample whatever the rounding in the walked length, so the
    // same row on a moved outline (a face state's) lies exactly where it did, its tangents included.
    let k = samples.findIndex((x) => x.s >= s - (typed ? 1e-9 : 0));
    if (k < 1) k = 1;
    const x = samples[k]!, y = samples[k - 1]!;
    // A typed row is laid out to its widths, so its places are read between samples (1 to 2 pt apart on a long cubic).
    const p = typed && x.s > y.s ? v.add(y.p, v.mul(v.sub(x.p, y.p), Math.min(1, Math.max(0, (s - y.s) / (x.s - y.s))))) : x.p;
    return { p, tan: v.norm(v.sub(x.p, y.p)) };
  };
  const cw = area(samples.map((x) => x.p)) > 0;
  const outward = (tan: P): P => (cw ? [tan[1], -tan[0]] : [-tan[1], tan[0]]);
  const out: Seg[] = base.segs.slice(0, A.i);
  out.push(split(base.segs[A.i]!, A.t)[0]);
  const total = typed ? locks.reduce((sum, l) => sum + l.width!, 0) : locks.reduce((sum, l) => sum + (l.w ?? 1), 0);
  let s = A.s;
  locks.forEach((l, k) => {
    const w = ((typed ? l.width! : l.w ?? 1) / total) * (B.s - A.s);
    const v0 = at(s), v1 = at(s + w), mid = at(s + w / 2);
    const n0 = outward(v0.tan), n1 = outward(v1.tan), nm = outward(mid.tan);
    // A notch between two locks dips inside the base by the lock before it's `dip`; the row's own ends stay on the base.
    const dipBefore = k > 0 ? locks[k - 1]!.dip ?? 0 : 0, dipAfter = k < locks.length - 1 ? l.dip ?? 0 : 0;
    const p0 = dipBefore ? v.sub(v0.p, v.mul(n0, dipBefore)) : v0.p, p1 = dipAfter ? v.sub(v1.p, v.mul(n1, dipAfter)) : v1.p;
    const lean = l.lean ?? 0;
    const tip = v.add(v.add(mid.p, v.mul(nm, l.len)), v.mul(mid.tan, lean * l.len * 0.7));
    // The tip's tangent runs along the edge, turned by the lean.
    const angle = Math.atan2(mid.tan[1], mid.tan[0]) + (cw ? -1 : 1) * lean * 0.5;
    const tt: P = [Math.cos(angle), Math.sin(angle)];
    const h = w * tipRound;
    onLock?.(tip, mid.p, [p0, p1]);
    // Out of a notch the edge turns sharply up, or with `notch` flows on along the base through it.
    const flowBefore = k > 0 ? locks[k - 1]!.notch ?? 0 : 0, flowAfter = k < locks.length - 1 ? l.notch ?? 0 : 0;
    const rise = (flow: number) => 0.55 * (1 - 0.6 * flow), along = (flow: number) => w * (0.05 + 0.3 * flow);
    out.push([p0, v.add(p0, v.add(v.mul(n0, (l.len + dipBefore) * rise(flowBefore)), v.mul(v0.tan, along(flowBefore)))), v.sub(tip, v.mul(tt, h)), tip]);
    out.push([tip, v.add(tip, v.mul(tt, h)), v.add(p1, v.sub(v.mul(n1, (l.len + dipAfter) * rise(flowAfter)), v.mul(v1.tan, along(flowAfter)))), p1]);
    s += w;
  });
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
