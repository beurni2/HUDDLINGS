// The dog's paws, one recipe for every view (DECISIONS 82), as the turnaround's paws and the stubby-paws and paw-stub
// panels draw them: each paw a round bun a little wider than the leg above it, its outline closed all round where it
// shows (over its top where it comes out from behind its neighbour, round its toe end and under its sole, the line
// rule darkening it where it sits on the ground), and two or three toe lines: soft curved creases rising from the
// sole's small dips about a third of the way up the paw's front (5 to 6 pt), following its dome, strongest at the sole
// and fading out upward, never ticks on the sole's line (which read as claws). Each view types its paws' nodes and
// its toe lines from its own crop.
// The fur pass (DECISIONS 216) adds the bun itself, for a view to put into its leg's outline where the paw is: 10 to
// 20% wider than the leg's column above it, the leg running straight down into it, its sole a row of 2 or 3 round toe lobes scalloping up 0.5 to 0.8 pt at each toe line, its
// lower corners the outer toes' own round (tighter than 4 pt where the stubby-paws panel draws them so, Q29), and its
// toe lines rising 40 to 50% of the paw's height round the middle toe in the warm line at about half strength, never
// darker than the outline. A view that does not ask for it draws its paws as before.
import { polyD, sample, smooth, v, type Node, type P, type Shape } from "../../../draw/geom.ts";
import type { DrawnLine } from "../../../draw/line.ts";
import { LIMITS } from "../../../draw/lint.ts";
import type { Paint } from "../../../draw/paint.ts";
import { blur, pad, uid, type Box } from "../../../draw/svg.ts";
import { C } from "../palette.ts";
import type { Lobed } from "./lines.ts";

export interface Toes {
  /** Each toe line typed from the sole up along the paw's dome (2 or 3 per paw), in model space. */
  lines: P[][];
  /** Where the lines are full (at the sole) and where they have faded out (their tops), as y in model space. */
  fade: [number, number];
  /** Inner-line width, 0.6 to 0.9 pt. */
  width?: number;
  /** The fur pass's soft toe line (DECISIONS 216): about half strength at the sole, fading gently to a fifth at its top, as the stubby-paws panel draws them, where the first lines ran from 0.8 to nearly nothing and only their dark feet showed. */
  soft?: boolean;
  /**
   * The toe line that follows the paw's dome (DECISIONS 263): each line, from its foot (its first point) up to its top's
   * height (its last point's y), runs along the paw's ball as a meridian of it, so it bows out round the ball's widest
   * and comes back in over its top, as the turnaround's and the stubby-paws panel's ")" and "(" do; its ends round and
   * soft, never a pointed tick. Its points in between are left out: the dome sets the curve. Left out, the lines run as
   * typed, as before.
   */
  dome?: Dome;
  /**
   * How many of the paw's toe lines lie out of sight (DECISIONS 287): a far paw turned away shows only one of its two or
   * three, its other behind the near paw or round its far side (the three-quarter crop's far paw draws one faint toe
   * line, at x -73.2), so `lines` and `hidden` together are the paw's two or three. Left out, none: every line shows.
   */
  hidden?: number;
}

/**
 * The dome toe lines' inner-line metas (DECISIONS 286, the lead's L4: every stroke inside the silhouette an inner line
 * the lint checks), keyed by the paint drawn for them: lines.ts's litPart reads back the metas of every set its part's
 * `under` paint holds (innerLinesIn), wherever the view puts that paint, so they reach the lint with no change to the
 * view or to paint.ts.
 */
const DOME_LINES = new Map<string, DrawnLine[]>();

/** The inner-line metas of every set of dome toe lines drawn in `under` (DECISIONS 286). */
export function innerLinesIn(under: string | undefined): DrawnLine[] {
  if (!under) return [];
  return [...DOME_LINES].filter(([drawn]) => under.includes(drawn)).flatMap(([, lines]) => lines);
}

/** A paw's ball as the crop draws it (DECISIONS 263): its centre, where the bun is fullest, and its half-width and half-height, in points. */
export interface Dome {
  centre: P;
  size: [number, number];
}

/**
 * The toe line along the dome (DECISIONS 263): its width at its foot and at its top as shares of its full width, each
 * end a round cap, so it starts from the sole's dip as a round soft stroke and ends in a round soft top, never a point;
 * full from `full` of its length to `ease`, where it starts to narrow to its top; softened by `blur` (σ, pt); faded
 * along its length as the soft toe line is (SOFT_TOES). Its foot lies at least `off` of the ball's half-width off the
 * ball's middle meridian, which runs straight up the middle (a foot there would make a straight tick, and throws).
 */
export const DOME_TOES = { foot: 0.8, top: 0.6, full: 0.2, ease: 0.55, blur: 0.25, off: 0.25 };

/** The soft toe line's strength at the sole and at its top (DECISIONS 216). */
export const SOFT_TOES = { foot: 0.55, top: 0.2 };

/**
 * The meridian of the dome `d` through `foot`, from the foot up to the height `top`; how far off the ball's middle
 * meridian it lies, as a share of the ball's half-width (`off`); and how far it bows off its chord, as a share of its length.
 */
export function meridian(d: Dome, foot: P, top: number, n = 24): { pts: P[]; off: number; bow: number } {
  const [cx, cy] = d.centre, [rx, ry] = d.size;
  const lat = (y: number) => {
    const k = (cy - y) / ry;
    if (Math.abs(k) >= 1) throw new Error(`a toe line at y ${y} lies off its paw's ball (${cy - ry} to ${cy + ry})`);
    return Math.asin(k);
  };
  const f0 = lat(foot[1]), f1 = lat(top);
  // The meridian's own half-width: where it crosses the ball's widest, it is its foot's offset over the foot's latitude's cos.
  const along = (foot[0] - cx) / Math.cos(f0);
  if (Math.abs(along) > rx + 1e-9) throw new Error(`a toe line's foot at x ${foot[0]} lies off its paw's ball (${cx - rx} to ${cx + rx})`);
  const pts = Array.from({ length: n + 1 }, (_, i): P => {
    const f = f0 + ((f1 - f0) * i) / n;
    return [cx + along * Math.cos(f), cy - ry * Math.sin(f)];
  });
  const a = pts[0]!, b = pts[n]!, chord = v.sub(b, a), l = v.len(chord);
  let length = 0, off = 0;
  pts.forEach((p, i) => {
    if (i) length += v.len(v.sub(p, pts[i - 1]!));
    off = Math.max(off, Math.abs(chord[0] * (p[1] - a[1]) - chord[1] * (p[0] - a[0])) / l);
  });
  return { pts, off: Math.abs(along) / rx, bow: off / length };
}

/** One toe line along the dome as a filled outline: round at both ends, its width easing as DOME_TOES says. */
function domeStroke(pts: P[], width: number): string {
  const { foot, top, full, ease } = DOME_TOES;
  const at = [0];
  for (let i = 1; i < pts.length; i++) at.push(at[i - 1]! + v.len(v.sub(pts[i]!, pts[i - 1]!)));
  const length = at.at(-1)!;
  const smooth = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
  const w = (u: number) => width * Math.min(foot + (1 - foot) * smooth(u / full), 1 - (1 - top) * smooth((u - ease) / (1 - ease)));
  const left: P[] = [], right: P[] = [];
  pts.forEach((p, i) => {
    const t = v.norm(v.sub(pts[Math.min(pts.length - 1, i + 1)]!, pts[Math.max(0, i - 1)]!));
    const n: P = [-t[1], t[0]], h = w(at[i]! / length) / 2;
    left.push(v.add(p, v.mul(n, h)));
    right.push(v.sub(p, v.mul(n, h)));
  });
  const cap = ([x, y]: P, r: number) => {
    const k = +r.toFixed(3);
    return `${polyD([[x - r, y]], false)}a${k} ${k} 0 1 0 ${2 * k} 0a${k} ${k} 0 1 0 ${-2 * k} 0Z`;
  };
  return polyD([...left, ...right.reverse()]) + cap(pts[0]!, w(0) / 2) + cap(pts.at(-1)!, w(1) / 2);
}

/** A paw's toe lines along its dome (DECISIONS 263): soft round strokes under the shade, faded as the soft toe line is. Throws on a straight line or one off the ball. */
function domeToes(t: Toes, d: Dome): Pick<Paint, "under" | "inner"> {
  const width = t.width ?? 0.8;
  if (width < LIMITS.inner[0] || width > LIMITS.inner[1]) throw new Error(`a toe line is ${width} pt, not an inner line's ${LIMITS.inner[0]} to ${LIMITS.inner[1]}`);
  const lines = t.lines.map((pts) => {
    const m = meridian(d, pts[0]!, pts.at(-1)![1]);
    if (m.off < DOME_TOES.off) throw new Error(`a toe line from (${pts[0]!.join(", ")}) lies ${m.off.toFixed(2)} of its paw's half-width off the ball's middle, under ${DOME_TOES.off}: it would run straight up the middle`);
    return m.pts;
  });
  const all = lines.flat(), xs = all.map((p) => p[0]), ys = all.map((p) => p[1]);
  const box: Box = pad([Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)], width + 2);
  const id = uid("toe"), f = uid("blur");
  const stops = `<stop offset="0" stop-color="${C.warmLine}" stop-opacity="${SOFT_TOES.foot}"/><stop offset="1" stop-color="${C.warmLine}" stop-opacity="${SOFT_TOES.top}"/>`;
  const drawn = `<path d="${lines.map((pts) => domeStroke(pts, width)).join("")}" fill="url(#${id})" filter="url(#${f})"/>`;
  // Each line an inner line for the lint: full width between its round ends, which narrow it to DOME_TOES.foot and .top.
  DOME_LINES.set(drawn, lines.map((): DrawnLine => ({ kind: "inner", width, where: "toe line", drawn: [width, width] })));
  return {
    under: `<defs><linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" y1="${t.fade[0]}" x2="0" y2="${t.fade[1]}">${stops}</linearGradient>${blur(f, box, DOME_TOES.blur)}</defs>` + drawn,
    inner: [],
  };
}

/** A paw's toe lines as paint: their fading colour (under the shade, in `under`) and the lines (`inner`); along the paw's dome with `dome` (DECISIONS 263). */
export function toes(t: Toes): Pick<Paint, "under" | "inner"> {
  const hidden = t.hidden ?? 0;
  if (t.lines.length < 1 || t.lines.length + hidden < 2 || t.lines.length + hidden > 3)
    throw new Error(`a paw has two or three toe lines, not ${t.lines.length}${hidden ? ` and ${hidden} hidden` : ""}`);
  if (t.dome) return domeToes(t, t.dome);
  const id = uid("toe");
  const stops = t.soft
    ? `<stop offset="0" stop-color="${C.warmLine}" stop-opacity="${SOFT_TOES.foot}"/><stop offset="1" stop-color="${C.warmLine}" stop-opacity="${SOFT_TOES.top}"/>`
    : `<stop offset="0.2" stop-color="${C.warmLine}" stop-opacity="0.8"/><stop offset="1" stop-color="${C.warmLine}" stop-opacity="0.08"/>`;
  const under = `<defs><linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" y1="${t.fade[0]}" x2="0" y2="${t.fade[1]}">${stops}</linearGradient></defs>`;
  return {
    under,
    inner: t.lines.map((pts) => ({ pts: sample(smooth(pts, { closed: false }).segs, 6, false), width: t.width ?? 0.8, colour: `url(#${id})` })),
  };
}

export interface BunSpec {
  /**
   * The leg's column above the paw, typed across it from the crop where it runs straight (its two sides at one
   * height): what the bun is measured against, so a bun cannot pass by pinching the wrist instead of widening the paw.
   */
  leg: [P, P];
  /**
   * Where the bun leaves the leg on each side, typed from the crop, in the order the leg's outline runs through the
   * paw: [where it comes down into the paw, where it goes back up]. It is the leg's own width there, narrowing from the
   * column by no more than BUN.pinch (the sheet's legs run straight down into the bun).
   */
  wrist: [P, P];
  /** How far the bun bulges out past each wrist point, in points, so it is 10 to 20% wider than the leg's column (the stubby-paws panel's bun, DECISIONS 47). */
  bulge: [number, number];
  /** The ground's y under the sole: 0 under the seat, a little higher under a paw that sits back. */
  ground: number;
  /** Each toe lobe's share of the sole, in path order: 2 or 3 lobes, as many as the crop shows. */
  lobes: number[];
  /** How far the sole scallops up at each toe line, 0.5 to 0.8 pt. */
  scallop: number;
  /** Where the bun is fullest, as a share of the paw's height from the sole (0.4 by default: the bun's round lies low, as the panel's). */
  full?: number;
  /** How far the toe lines rise along the dome, as a share of the paw's height: 0.4 to 0.5 (0.45 by default). */
  rise?: number;
}

export interface Bun {
  /** The bun's nodes from the first wrist point to the second, both included, for the view to put into its leg's outline in their place. */
  nodes: Node[];
  /** Which of `nodes` are the toe lines' notches: concave corners, for smooth()'s `corners` (offset by where the bun sits in the leg's nodes). */
  notches: number[];
  /** Each toe lobe's span along the outline, from its first end to its second in path order, for the lint (lobed()). */
  lobes: [P, P][];
  /** The toe lines, each from its notch up round the middle toe, for toes(). */
  toes: P[][];
  /** Where the toe lines are full and where they have faded, for toes()'s `fade`. */
  fade: [number, number];
  /** The sole's two ends: the lower corners where the bun's sides turn under, for the line's span along it. */
  sole: [P, P];
}

/**
 * What a bun must be (DECISIONS 216): 10 to 20% wider than the leg's column, the wrist at most 5% narrower than the
 * column (the first demo's bun met the 10% by pinching the wrist 9%, an hourglass at the ankle the sheet never draws).
 */
export const BUN = { wider: [1.1, 1.2] as [number, number], pinch: 0.05, lobes: [2, 3] as [number, number], scallop: [0.5, 0.8] as [number, number], rise: [0.4, 0.5] as [number, number] };

/**
 * A round bun of a paw where the leg comes down to the ground, as the stubby-paws panel draws it: from each wrist point
 * the side bulges out to its fullest low on the paw and turns under in a round corner into the sole, which runs across
 * in 2 or 3 round toe lobes, each a little dome on the ground, the sole scalloping up between them where a toe line
 * rises. Throws when the bun breaks its rules.
 */
export function bun(b: BunSpec): Bun {
  const [w0, w1] = b.wrist;
  const column = Math.abs(b.leg[1][0] - b.leg[0][0]), wrist = Math.abs(w1[0] - w0[0]), wide = (wrist + b.bulge[0] + b.bulge[1]) / column;
  const rise = b.rise ?? 0.45, full = b.full ?? 0.4;
  const problems: string[] = [];
  if (wide < BUN.wider[0] - 1e-9 || wide > BUN.wider[1] + 1e-9) problems.push(`the bun is ${wide.toFixed(2)} times the leg's column, not ${BUN.wider[0]} to ${BUN.wider[1]}`);
  if (1 - wrist / column > BUN.pinch + 1e-9) problems.push(`the leg narrows ${((1 - wrist / column) * 100).toFixed(0)}% into the wrist (${wrist.toFixed(1)} pt from a ${column.toFixed(1)} pt column), more than ${BUN.pinch * 100}%`);
  if (b.lobes.length < BUN.lobes[0] || b.lobes.length > BUN.lobes[1]) problems.push(`${b.lobes.length} toe lobes, not ${BUN.lobes[0]} to ${BUN.lobes[1]}`);
  if (b.scallop < BUN.scallop[0] - 1e-9 || b.scallop > BUN.scallop[1] + 1e-9) problems.push(`the sole scallops ${b.scallop} pt, not ${BUN.scallop[0]} to ${BUN.scallop[1]}`);
  if (rise < BUN.rise[0] - 1e-9 || rise > BUN.rise[1] + 1e-9) problems.push(`the toe lines rise ${rise} of the paw, not ${BUN.rise[0]} to ${BUN.rise[1]}`);
  if (problems.length) throw new Error(`bun: ${problems.join("; ")}`);
  // The path runs from w0 to w1 across the paw: `dir` is its way across, so each side's outside is away from it.
  const dir = Math.sign(w1[0] - w0[0]);
  const height = b.ground - (w0[1] + w1[1]) / 2;
  const y = b.ground - full * height;
  const out0 = w0[0] - dir * b.bulge[0], out1 = w1[0] + dir * b.bulge[1];
  // Each lower corner a quarter round from the bun's fullest down to the sole: its radius the bun's fullest height.
  const r = full * height, k = 1 - Math.SQRT1_2;
  const corner0: P = [out0 + dir * r * k, b.ground - r * k], corner1: P = [out1 - dir * r * k, b.ground - r * k];
  // The sole between the corners' feet, in its lobes: each lobe's lowest point on the ground at its middle, a notch between.
  const s0 = out0 + dir * r * 0.55, s1 = out1 - dir * r * 0.55;
  const total = b.lobes.reduce((s, x) => s + x, 0);
  const cut = b.lobes.reduce<number[]>((acc, x) => [...acc, acc.at(-1)! + x / total], [0]);
  const across = (t: number) => s0 + (s1 - s0) * t;
  const sole: Node[] = [];
  const notches: number[] = [];
  b.lobes.forEach((_, i) => {
    if (i > 0) {
      notches.push(3 + sole.length);
      sole.push([across(cut[i]!), b.ground - b.scallop]);
    }
    sole.push([across((cut[i]! + cut[i + 1]!) / 2), b.ground]);
  });
  const nodes: Node[] = [w0, [out0, y], corner0, ...sole, corner1, [out1, y], w1];
  const notchAt = notches.map((i) => nodes[i] as P);
  // Each lobe from its outer end (a corner for the outer toes) to its notch.
  const ends: P[] = [corner0, ...notchAt, corner1];
  const lobes = ends.slice(0, -1).map((p, i): [P, P] => [p, ends[i + 1]!]);
  // Each toe line rises from its notch round the middle toe: out a little away from it, then back in over its top, as
  // the panel draws them (and the turnaround's ")" and "(" round the middle toe).
  const middle = (out0 + out1) / 2, up = rise * height;
  const toeLines = notchAt.map(([x, yN]) => {
    const away = Math.sign(x - middle) || 1, bow = up / 6;
    return ([[0, 0], [0.6, 0.38], [0.45, 0.72], [-0.3, 1]] as P[]).map(([a, t]): P => [x + away * bow * a, yN - 0.2 - t * up]);
  });
  return { nodes, notches, lobes, toes: toeLines, fade: [b.ground - b.scallop, b.ground - b.scallop - up], sole: [corner0, corner1] };
}

/** A shape whose toe lobes are declared, so the lint holds them to the toe lobes' own floor instead of the 4 pt rule (Q29). */
export function lobed(shape: Shape, lobes: [P, P][]): Lobed {
  return { ...shape, lobes };
}
