// Huffy's puffed cheeks (spec L497: "puffed cheeks, a small pressed mouth"), a new drawing no sheet panel shows, for
// the founder to approve (R3). Variant A puffs them inside the head's outline: a round ball of air either side of the
// pressed mouth, below the eyes and inside the blush, shown by its light and shade alone, as the sheets model every
// round of fur: a soft light dome on its upper side toward the light, a soft warm shade round its lower side, deepest
// where it tucks in toward the chin, and a fine crease where it meets the muzzle beside the mouth. No line round the
// ball's top: the cheek is fur, and the sheet draws no line inside the face but the mouth's and the brows'. A part of
// its own on the head (`cheeks`), clipped to the head base, drawn only in the puffed state (`"front": null` elsewhere).
import { ellipse, pathD, type P } from "../../../draw/geom.ts";
import { innerLine } from "../../../draw/line.ts";
import { blur, piece, uid, type Box, type Piece } from "../../../draw/svg.ts";
import { C } from "../palette.ts";
import type { FaceFrame } from "./face.ts";

export const CHEEK_STATES = ["puffed"] as const;
export type CheekState = (typeof CHEEK_STATES)[number];

export interface Puff {
  /** Each ball's middle on the dog's left (the viewer's right), in the face frame, mirrored for its right, and its half-axes. */
  at: P;
  rx: number;
  ry: number;
  /** How far the shade is pushed in from the ball's edge toward the light, and how strong it is (0 to 1). */
  shade: { inset: number; opacity: number };
  /** The light dome's half-axes and strength. */
  light: { rx: number; ry: number; opacity: number };
  /** The crease beside the mouth: degrees round the ball's inner side it runs, from above to below its middle (0 is level). */
  crease: [number, number];
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** The puff the package draws (variant A). */
// Each ball beside the pressed mouth and under the eye's inner half, reaching in to just outside the mouth's ends,
// its crease a ")" hugging the mouth's side, where the air pushes the cheek in round it (a crease run under the ball
// instead read as jowls, and one further out as a grin's line).
export const PUFF: Puff = {
  at: [17.4, 18.8],
  rx: 10.8,
  ry: 9,
  shade: { inset: 3, opacity: 1 },
  light: { rx: 6, ry: 4.2, opacity: 0.7 },
  crease: [-40, 30],
};

/**
 * A puffed cheek on a turned head (DECISIONS 208), in model space: the front's ball (PUFF) where the view's muzzle puts
 * it, `rx` and `ry` its half-axes there (the across one shortened with the muzzle) and `turn` the muzzle's level
 * (degrees, clockwise); `mouthward` +1 when the mouth lies to its right on screen, −1 when to its left, where its
 * crease hugs the mouth's end.
 */
export interface TurnedPuff {
  c: P;
  rx: number;
  ry: number;
  turn: number;
  mouthward: 1 | -1;
}

/**
 * The puffed cheeks of a turned head, each ball painted as the front's are (light dome, warm shade, the crease), the
 * dome's light at two thirds of the front's: at its full 0.7 a turned ball, seen over the blush's side of the cheek,
 * read as a cotton ball stuck on.
 */
export function turnedCheeks(balls: TurnedPuff[], facing: { light: P; lit(d: string, about: number): string }, p: Puff = { ...PUFF, light: { ...PUFF.light, opacity: 0.45 } }): Piece {
  const light = facing.light;
  // The dome is a light typed toward the top left in the .L frame and placed again across its ball in .R (Facing.lit).
  const typed: P = [-Math.abs(light[0]), light[1]];
  const boxes = balls.map((b): Box => [b.c[0] - b.rx - 4, b.c[1] - b.ry - 4, 2 * b.rx + 8, 2 * b.ry + 8]);
  const box = boxes.reduce((a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0] + a[2], b[0] + b[2]) - Math.min(a[0], b[0]), Math.max(a[1] + a[3], b[1] + b[3]) - Math.min(a[1], b[1])]);
  const shadeBlur = uid("blur"), lightBlur = uid("blur"), ring = uid("ring"), soft = uid("blur");
  let defs = `${blur(shadeBlur, box, 1.5)}${blur(lightBlur, box, 1.8)}${blur(soft, box, 0.25)}`;
  let body = "";
  const lines = [];
  for (const [k, b] of balls.entries()) {
    const t = (b.turn * Math.PI) / 180, cos = Math.cos(t), sin = Math.sin(t);
    /** A point in the ball's own frame (x along the muzzle's level, y down), in model space. */
    const at = ([x, y]: P): P => [b.c[0] + x * cos - y * sin, b.c[1] + x * sin + y * cos];
    const s = b.rx / p.rx, q = b.ry / p.ry;
    const ball = pathD(ellipse(b.c, b.rx, b.ry, b.turn));
    const lit: P = [b.c[0] + light[0] * p.shade.inset, b.c[1] + light[1] * p.shade.inset];
    const id = `${ring}${k}`;
    defs += `<clipPath id="${id}"><path d="${ball}"/></clipPath>`;
    body += `<g filter="url(#${shadeBlur})" opacity="${p.shade.opacity}"><g clip-path="url(#${id})"><path d="M${r3(b.c[0] - 40)} ${r3(b.c[1] - 40)}H${r3(b.c[0] + 40)}V${r3(b.c[1] + 40)}H${r3(b.c[0] - 40)}Z${pathD(ellipse(lit, b.rx + 0.4, b.ry + 0.4, b.turn))}" ` +
      `fill="${C.furShade}" fill-rule="evenodd"/></g></g>`;
    const top: P = [b.c[0] + typed[0] * b.ry * 0.38, b.c[1] + typed[1] * b.ry * 0.38];
    body += `<path d="${facing.lit(pathD(ellipse(top, p.light.rx * s, p.light.ry * q, 0)), b.c[0])}" fill="${C.light}" opacity="${p.light.opacity}" filter="url(#${lightBlur})"/>`;
    const n = 10, [a0, a1] = p.crease;
    const crease = Array.from({ length: n + 1 }, (_, i): P => {
      const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
      return at([b.mouthward * b.rx * Math.cos(a), b.ry * Math.sin(a)]);
    });
    const l = innerLine(crease, 0.75, C.puffLine, { opacity: 0.7, taper: 2.2, tip: 0.1, wobble: 0 });
    body += `<g filter="url(#${soft})">${l.svg}</g>`;
    lines.push({ ...l.line, where: "cheek crease" });
  }
  return piece(`<defs>${defs}</defs>${body}`, box, { shapes: [], lines });
}

export function puffedCheeks(f: FaceFrame, p: Puff = PUFF): Piece {
  const box: Box = [-(p.at[0] + p.rx + 4), p.at[1] - p.ry - 4, 2 * (p.at[0] + p.rx + 4), 2 * p.ry + 8];
  const shadeBlur = uid("blur"), lightBlur = uid("blur"), ring = uid("ring"), soft = uid("blur");
  let defs = `${blur(shadeBlur, box, 1.5)}${blur(lightBlur, box, 1.8)}${blur(soft, box, 0.25)}`;
  let body = "";
  const lines = [];
  for (const sx of [1, -1] as const) {
    const c: P = [sx * p.at[0], p.at[1]];
    const ball = pathD(ellipse(c, p.rx, p.ry, 0));
    // The shade: the ball less itself moved toward the light, a crescent round its lower side away from the light.
    const lit: P = [c[0] + f.light[0] * p.shade.inset, c[1] + f.light[1] * p.shade.inset];
    const id = `${ring}${sx > 0 ? "L" : "R"}`;
    defs += `<clipPath id="${id}"><path d="${ball}"/></clipPath>`;
    // Blurred after the clip, so its outer edge is as soft as its inner one: no line round the ball.
    body += `<g filter="url(#${shadeBlur})" opacity="${p.shade.opacity}"><g clip-path="url(#${id})"><path d="M${r3(c[0] - 40)} ${r3(c[1] - 40)}H${r3(c[0] + 40)}V${r3(c[1] + 40)}H${r3(c[0] - 40)}Z${pathD(ellipse(lit, p.rx + 0.4, p.ry + 0.4, 0))}" ` +
      `fill="${C.furShade}" fill-rule="evenodd"/></g></g>`;
    // The light dome high on the ball, toward the light.
    const top: P = [c[0] + f.light[0] * p.ry * 0.38, c[1] + f.light[1] * p.ry * 0.38];
    body += `<path d="${pathD(ellipse(top, p.light.rx, p.light.ry, 0))}" fill="${C.light}" opacity="${p.light.opacity}" filter="url(#${lightBlur})"/>`;
    // The crease beside the mouth, along the ball's inner edge.
    const n = 10, [a0, a1] = p.crease;
    const crease = Array.from({ length: n + 1 }, (_, k): P => {
      const a = ((a0 + ((a1 - a0) * k) / n) * Math.PI) / 180;
      return [c[0] - sx * p.rx * Math.cos(a), c[1] + p.ry * Math.sin(a)];
    });
    const l = innerLine(crease, 0.75, C.puffLine, { opacity: 0.7, taper: 2.2, tip: 0.1, wobble: 0 });
    body += `<g filter="url(#${soft})">${l.svg}</g>`;
    lines.push({ ...l.line, where: "cheek crease" });
  }
  return piece(f.place(`<defs>${defs}</defs>${body}`), f.box(box), { shapes: [], lines });
}
