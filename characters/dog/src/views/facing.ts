// A facing of a turned view (spec L367-368, model.json's mirroredViews). The turnaround draws the side and the
// three-quarter views facing the sheet's left (.L, DECISIONS 1) and never facing right; each right-facing view (.R) is
// its .L view's own nodes mirrored, every .L and .R swapped in its part names, lit again from the top left, and
// showing the right side's own markings from the marking map. A plain mirror would carry the shade and the light
// over to the wrong side.
//
// A view is typed once, in the .L facing's frame. For .R it is drawn there lit from the top right, then mirrored as a
// whole: the same as drawing the mirrored nodes lit from the top left, since every rule in the kit that reads the light
// (paint.ts's rim of shade and its highlight from the light, parts/lines.ts's line by light) is the same rule
// mirrored. The few lights typed by hand where the .L crop paints them toward the light are placed again, across their
// own feature (`lit`); everything else typed by hand (overhangs, cast and contact shadows, the cheeks the sheet keeps
// light, markings, catchlights on the nose's side) belongs to its place on the dog and mirrors with it.
import type { P } from "../../../draw/geom.ts";
import { LIGHT } from "../../../draw/paint.ts";
import { piece, type Box, type Piece } from "../../../draw/svg.ts";
import { model } from "../model.ts";
import type { Drawn } from "./front.ts";

export type Side = "L" | "R";

/** A name seen in a mirror: .L and .R swap (model.json's mirror rule). */
export const swapSides = (name: string) => name.replace(/\.(L|R)\b/g, (_m, s: string) => (s === "L" ? ".R" : ".L"));

/** Path data reflected about the line x = about: absolute x mirrored, relative dx negated, each arc's turn and sweep flipped. */
export function reflectPath(d: string, about: number): string {
  const tokens = d.match(/[A-Za-z]|[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g) ?? [];
  const per: Record<string, number> = { m: 2, l: 2, t: 2, h: 1, v: 1, c: 6, s: 4, q: 4, a: 7, z: 0 };
  const out: string[] = [];
  let command = "";
  const fmt = (n: number) => (Math.round(n * 1000) / 1000).toString();
  for (let i = 0; i < tokens.length; ) {
    if (/[A-Za-z]/.test(tokens[i]!)) {
      command = tokens[i++]!;
      out.push(command);
      if (/z/i.test(command)) continue;
    }
    const lower = command.toLowerCase(), abs = command !== lower, n = per[lower];
    if (n === undefined || n === 0) throw new Error(`reflectPath: cannot read ${d}`);
    const args = tokens.slice(i, i + n).map(Number);
    if (args.length < n || args.some((x) => !Number.isFinite(x))) throw new Error(`reflectPath: cannot read ${d}`);
    i += n;
    const x = (k: number) => (abs ? 2 * about - args[k]! : -args[k]!);
    const mirrored = lower === "a" ? [args[0]!, args[1]!, -args[2]!, args[3]!, 1 - args[4]!, x(5), args[6]!]
      : lower === "h" ? [x(0)]
      : lower === "v" ? args
      : args.map((a, k) => (k % 2 === 0 ? x(k) : a));
    out.push(mirrored.map(fmt).join(" "));
  }
  return out.join(" ");
}

/** A finished piece mirrored about model x = 0: its drawing, its box, and the shapes and line names its meta reports to the lint. */
export function mirrorPiece(p: Piece): Piece {
  const [x, y, w, h] = p.box;
  const box: Box = [-(x + w), y, w, h];
  return piece(`<g transform="scale(-1 1)">${p.svg}</g>`, box, {
    shapes: p.meta.shapes.map((s) => ({ ...s, name: swapSides(s.name), segs: s.segs.map((seg) => seg.map(([sx, sy]): P => [-sx, sy]) as typeof seg) })),
    lines: p.meta.lines.map((l) => ({ ...l, where: swapSides(l.where) })),
  });
}

const markings = new Set(model.markings.map((m) => m.id));

export interface Facing {
  side: Side;
  /** The light toward which the view is lit, in the .L frame it is typed in: the top left, or for .R its mirror, the top right. */
  light: P;
  /** A part's name in this facing (.L and .R swap in .R). */
  name(part: string): string;
  /** Whether this facing shows a marking the .L drawing names: the marking map holds its own side's (no right rump spot). */
  shows(marking: string): boolean;
  /**
   * A light typed by hand where the .L crop paints it toward the light, on a feature whose middle is x = about: in .R
   * it is reflected across that middle, so that once the view is mirrored it lies on the same side of its feature,
   * toward the top-left light, as on the crop.
   */
  lit(d: string, about: number): string;
  /** The facing's drawings: .L as typed; .R mirrored and renamed. */
  finish(drawn: Drawn[]): Drawn[];
}

export function facing(side: Side): Facing {
  const R = side === "R";
  const name = (part: string) => (R ? swapSides(part) : part);
  return {
    side,
    light: R ? [-LIGHT[0], LIGHT[1]] : LIGHT,
    name,
    shows: (marking) => !R || !markings.has(marking) || markings.has(name(marking)),
    lit: (d, about) => (R ? reflectPath(d, about) : d),
    finish: (drawn) => (R ? drawn.map((d) => ({ ...d, part: name(d.part), piece: mirrorPiece(d.piece) })) : drawn),
  };
}

/** A facing's source landmarks: .L's own, or for .R mirrored, their names swapped. */
export function landmarksFor(side: Side, own: Record<string, P>): Record<string, P> {
  return side === "L" ? own : Object.fromEntries(Object.entries(own).map(([n, p]) => [swapSides(n), [-p[0], p[1]] as P]));
}
