// The stars round the head, one recipe for every view, as the dog's Proud panel draws them beside its happy crescents
// (proud's still, DECISIONS 138, 205): four-pointed gold stars, taller than wide, their sides drawn in toward the
// middle, the points a little rounded, a lighter warm core and no line, as the panel paints them. A part of their own
// on the head (`stars`), drawn only in its `sparkle` state, which only proud's clip keys; each view says where they sit
// beside its head, in the face's frame. The sparkle eye's own small gold stars, beside each eye, are the eye's
// (parts/eye.ts, Q2, DECISIONS 203).
import { type P } from "../../../draw/geom.ts";
import { blur, piece, uid, union, type Box, type Piece } from "../../../draw/svg.ts";
import { C } from "../palette.ts";
import type { FaceFrame } from "./face.ts";

export interface Star {
  /** Its middle in the face frame, its full width and height, and its turn (degrees, clockwise). */
  at: P;
  size: [number, number];
  turn: number;
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** One star's outline: four points, top, right, bottom and left, each side a curve drawn in toward the middle. */
function starD([cx, cy]: P, [w, h]: [number, number], turn: number): string {
  const a = (turn * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
  const at = ([x, y]: P) => `${r3(cx + x * cos - y * sin)} ${r3(cy + x * sin + y * cos)}`;
  const tips: P[] = [[0, -h / 2], [w / 2, 0], [0, h / 2], [-w / 2, 0]];
  // Each side's two controls a third of the way out to its points, so the sides curve in gently and the star stays
  // plump, as the panel's do (a fifth read as a thin glint).
  const k = 0.34;
  return `M${at(tips[0]!)}` + tips.map((p, i) => {
    const q = tips[(i + 1) % 4]!;
    return `C${at([p[0] * k, p[1] * k])} ${at([q[0] * k, q[1] * k])} ${at(q)}`;
  }).join("") + "Z";
}

export function stars(list: Star[], f: FaceFrame): Piece {
  const soft = uid("blur"), glow = uid("blur");
  const boxes: Box[] = list.map(({ at, size }) => [at[0] - size[0] / 2 - 2, at[1] - size[1] / 2 - 2, size[0] + 4, size[1] + 4]);
  const box = boxes.reduce(union);
  // The warm core sits toward the light, as the panel's lighter middle does.
  const body = list.map(({ at, size, turn }) => {
    const core: P = [at[0] + f.light[0] * size[0] * 0.06, at[1] + f.light[1] * size[1] * 0.06];
    return `<path d="${starD(at, size, turn)}" fill="${C.tag}" filter="url(#${soft})"/>` +
      `<ellipse cx="${r3(core[0])}" cy="${r3(core[1])}" rx="${r3(size[0] * 0.13)}" ry="${r3(size[1] * 0.13)}" fill="${C.tagShine}" opacity="0.8" filter="url(#${glow})"/>`;
  }).join("");
  return piece(f.place(`<defs>${blur(soft, box, 0.22)}${blur(glow, box, 0.8)}</defs>${body}`), f.box(box));
}
