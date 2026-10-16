// The dog's paws, one recipe for every view (DECISIONS 82), as the turnaround's paws and the stubby-paws and paw-stub
// panels draw them: each paw a round bun a little wider than the leg above it, its outline closed all round where it
// shows (over its top where it comes out from behind its neighbour, round its toe end and under its sole, the line
// rule darkening it where it sits on the ground), and two or three toe lines: soft curved creases rising from the
// sole's small dips about a third of the way up the paw's front (5 to 6 pt), following its dome, strongest at the sole
// and fading out upward, never ticks on the sole's line (which read as claws). Each view types its paws' nodes and
// its toe lines from its own crop.
// The fur pass (DECISIONS 216) adds the bun itself, for a view to put into its leg's outline where the paw is: 10 to
// 20% wider than the leg, its sole a row of 2 or 3 round toe lobes scalloping up 0.5 to 0.8 pt at each toe line, its
// lower corners the outer toes' own round (tighter than 4 pt where the stubby-paws panel draws them so, Q29), and its
// toe lines rising 40 to 50% of the paw's height round the middle toe in the warm line at about half strength, never
// darker than the outline. A view that does not ask for it draws its paws as before.
import { sample, smooth, type Node, type P, type Shape } from "../../../draw/geom.ts";
import type { Paint } from "../../../draw/paint.ts";
import { uid } from "../../../draw/svg.ts";
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
}

/** The soft toe line's strength at the sole and at its top (DECISIONS 216). */
export const SOFT_TOES = { foot: 0.55, top: 0.2 };

/** A paw's toe lines as paint: their fading colour (under the shade, in `under`) and the lines (`inner`). */
export function toes(t: Toes): Pick<Paint, "under" | "inner"> {
  if (t.lines.length < 2 || t.lines.length > 3) throw new Error(`a paw has two or three toe lines, not ${t.lines.length}`);
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
   * Where the bun leaves the leg on each side, typed from the crop, in the order the leg's outline runs through the
   * paw: [where it comes down into the paw, where it goes back up]. The leg is as wide as these two lie apart.
   */
  wrist: [P, P];
  /** How far the bun bulges out past each wrist point, in points, so it is 10 to 20% wider than the leg (the stubby-paws panel's bun, DECISIONS 47). */
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

/** What a bun must be (DECISIONS 216). */
export const BUN = { wider: [1.1, 1.2] as [number, number], lobes: [2, 3] as [number, number], scallop: [0.5, 0.8] as [number, number], rise: [0.4, 0.5] as [number, number] };

/**
 * A round bun of a paw where the leg comes down to the ground, as the stubby-paws panel draws it: from each wrist point
 * the side bulges out to its fullest low on the paw and turns under in a round corner into the sole, which runs across
 * in 2 or 3 round toe lobes, each a little dome on the ground, the sole scalloping up between them where a toe line
 * rises. Throws when the bun breaks its rules.
 */
export function bun(b: BunSpec): Bun {
  const [w0, w1] = b.wrist;
  const leg = Math.abs(w1[0] - w0[0]), wide = (leg + b.bulge[0] + b.bulge[1]) / leg;
  const rise = b.rise ?? 0.45, full = b.full ?? 0.4;
  const problems: string[] = [];
  if (wide < BUN.wider[0] - 1e-9 || wide > BUN.wider[1] + 1e-9) problems.push(`the bun is ${wide.toFixed(2)} times the leg's width, not ${BUN.wider[0]} to ${BUN.wider[1]}`);
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
