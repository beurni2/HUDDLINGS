// The runtime's math, written to characters/format/README.md. The SpriteKit
// runtime has a twin of every function here; the test vectors in
// characters/format/vectors/ hold both to the same numbers. Powers are
// written as products and every loop runs a fixed number of times, so the
// two languages compute the same doubles.

export type Easing =
  | "linear"
  | "step"
  | "easeIn"
  | "easeOut"
  | "easeInOut"
  | "easeOutBack"
  | ["easeOutBack", number]
  | ["bezier", number, number, number, number];

export const BACK_OVERSHOOT = 1.70158;

/** The eased progress of a segment, u in 0..1. */
export function ease(easing: Easing | undefined, u: number): number {
  if (easing === undefined || easing === "linear") return u;
  if (easing === "step") return u >= 1 ? 1 : 0;
  if (easing === "easeIn") return u * u * u;
  if (easing === "easeOut") {
    const v = 1 - u;
    return 1 - v * v * v;
  }
  if (easing === "easeInOut") {
    if (u < 0.5) return 4 * u * u * u;
    const w = -2 * u + 2;
    return 1 - (w * w * w) / 2;
  }
  if (easing === "easeOutBack") return easeOutBack(u, BACK_OVERSHOOT);
  if (easing[0] === "easeOutBack") return easeOutBack(u, easing[1]);
  return cubicBezier(easing[1], easing[2], easing[3], easing[4], u);
}

function easeOutBack(u: number, s: number): number {
  const v = u - 1;
  return 1 + (s + 1) * v * v * v + s * v * v;
}

/** CSS's cubic-bezier(x1, y1, x2, y2) at progress x, solved as WebKit's UnitBezier does. */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number, x: number): number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t;
  const sampleDX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  const epsilon = 1e-7;

  let t = x;
  for (let i = 0; i < 8; i++) {
    const error = sampleX(t) - x;
    if (Math.abs(error) < epsilon) return sampleY(t);
    const d = sampleDX(t);
    if (Math.abs(d) < 1e-6) break;
    t = t - error / d;
  }
  let lo = 0;
  let hi = 1;
  t = x;
  for (let i = 0; i < 64; i++) {
    const value = sampleX(t);
    if (Math.abs(value - x) < epsilon) break;
    if (x > value) lo = t;
    else hi = t;
    t = (hi - lo) / 2 + lo;
  }
  return sampleY(t);
}

/** mulberry32: the seeded random source of deterministic mode. Returns numbers in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const DEG = Math.PI / 180;

/** A 2D affine transform: (x, y) maps to (a·x + c·y + tx, b·x + d·y + ty). y grows downward. */
export interface Affine {
  a: number;
  b: number;
  c: number;
  d: number;
  tx: number;
  ty: number;
}

export const IDENTITY: Affine = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };

/** parent × translate(x, y) × rotate(degrees) × scale(sx, sy). A positive angle turns +x toward +y. */
export function compose(parent: Affine, x: number, y: number, degrees: number, sx: number, sy: number): Affine {
  const r = degrees * DEG;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  // Local matrix: translate · rotate · scale.
  const la = cos * sx;
  const lb = sin * sx;
  const lc = -sin * sy;
  const ld = cos * sy;
  return {
    a: parent.a * la + parent.c * lb,
    b: parent.b * la + parent.d * lb,
    c: parent.a * lc + parent.c * ld,
    d: parent.b * lc + parent.d * ld,
    tx: parent.a * x + parent.c * y + parent.tx,
    ty: parent.b * x + parent.d * y + parent.ty,
  };
}

export function apply(m: Affine, x: number, y: number): [number, number] {
  return [m.a * x + m.c * y + m.tx, m.b * x + m.d * y + m.ty];
}

/** The inverse transform. Rig transforms always have a non-zero determinant. */
export function invert(m: Affine): Affine {
  const det = m.a * m.d - m.b * m.c;
  const a = m.d / det;
  const b = -m.b / det;
  const c = -m.c / det;
  const d = m.a / det;
  return { a, b, c, d, tx: -(a * m.tx + c * m.ty), ty: -(b * m.tx + d * m.ty) };
}

/** Catmull–Rom interpolation through p1 and p2 at t in 0..1, with p0 and p3 as neighbours. */
export function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}
