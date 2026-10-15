// The dog's paws, one recipe for every view (DECISIONS 82), as the turnaround's paws and the stubby-paws and paw-stub
// panels draw them: each paw a round bun a little wider than the leg above it, its outline closed all round where it
// shows (over its top where it comes out from behind its neighbour, round its toe end and under its sole, the line
// rule darkening it where it sits on the ground), and two or three toe lines: soft curved creases rising from the
// sole's small dips about a third of the way up the paw's front (5 to 6 pt), following its dome, strongest at the sole
// and fading out upward, never ticks on the sole's line (which read as claws). Each view types its paws' nodes and
// its toe lines from its own crop.
import { sample, smooth, type P } from "../../../draw/geom.ts";
import type { Paint } from "../../../draw/paint.ts";
import { uid } from "../../../draw/svg.ts";
import { C } from "../palette.ts";

export interface Toes {
  /** Each toe line typed from the sole up along the paw's dome (2 or 3 per paw), in model space. */
  lines: P[][];
  /** Where the lines are full (at the sole) and where they have faded out (their tops), as y in model space. */
  fade: [number, number];
  /** Inner-line width, 0.6 to 0.9 pt. */
  width?: number;
}

/** A paw's toe lines as paint: their fading colour (under the shade, in `under`) and the lines (`inner`). */
export function toes(t: Toes): Pick<Paint, "under" | "inner"> {
  if (t.lines.length < 2 || t.lines.length > 3) throw new Error(`a paw has two or three toe lines, not ${t.lines.length}`);
  const id = uid("toe");
  const under = `<defs><linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" y1="${t.fade[0]}" x2="0" y2="${t.fade[1]}">` +
    `<stop offset="0.2" stop-color="${C.warmLine}" stop-opacity="0.8"/><stop offset="1" stop-color="${C.warmLine}" stop-opacity="0.08"/></linearGradient></defs>`;
  return {
    under,
    inner: t.lines.map((pts) => ({ pts: sample(smooth(pts, { closed: false }).segs, 6, false), width: t.width ?? 0.8, colour: `url(#${id})` })),
  };
}
