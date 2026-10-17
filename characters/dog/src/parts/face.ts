// The face's own frame, shared by the face recipes (parts/mouth.ts, parts/brow.ts, parts/stars.ts): each face part
// is typed once, front-on, in the face's frame (points, the origin midway between the eyes, x along the eye line
// toward the viewer's right, y down), and each view says where that frame lies on its head and where the light
// falls in it. The front view's frame is the face's roll (DECISIONS 27); a turned view's narrows it toward its turn.
import { v, type P } from "../../../draw/geom.ts";
import { LIGHT } from "../../../draw/paint.ts";
import type { Box } from "../../../draw/svg.ts";

export interface FaceFrame {
  /** SVG typed in the face frame, placed in model space. */
  place(svg: string): string;
  /** A face-frame point in model space. */
  at(p: P): P;
  /** A face-frame box as the model-space box that holds it. */
  box(b: Box): Box;
  /** Toward the light (top left on screen), as a unit direction in the face frame. */
  light: P;
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** A frame turned `rollDeg` about `centre` (a face drawn level and rolled with the head, as the front's is). */
export function rolledFrame(centre: P, rollDeg: number): FaceFrame {
  const a = (rollDeg * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
  const at = ([x, y]: P): P => [centre[0] + x * cos - y * sin, centre[1] + x * sin + y * cos];
  return {
    place: (svg) => `<g transform="translate(${r3(centre[0])} ${r3(centre[1])}) rotate(${r3(rollDeg)})">${svg}</g>`,
    at,
    box([x, y, w, h]) {
      const corners = ([[x, y], [x + w, y], [x, y + h], [x + w, y + h]] as P[]).map(at);
      const xs = corners.map((p) => p[0]), ys = corners.map((p) => p[1]);
      return [Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
    },
    // The screen's light turned back by the roll, so a highlight typed toward it lands toward the top left.
    light: v.norm([LIGHT[0] * cos + LIGHT[1] * sin, -LIGHT[0] * sin + LIGHT[1] * cos]),
  };
}
