// The dog's side view, facing the sheet's left (side.L: the dog's left side
// toward the viewer, DECISIONS 1): shapes first, every node typed by hand in
// model space (points, the ground under the seat at 0, 0, y down) at the
// extremes and inflections read off the side turnaround
// (master.turnaround.side), then paint, by the front view's recipes where the
// part is the same thing turned (the ear, the eye, the nose, the collar, the
// tag, the paws). One light group holds the whole near side of the body (back
// and haunch, chest, near legs), so their joins carry no rim; the far front
// leg is painted on its own, darker.
import { furEdge, furSpan } from "../../../draw/fur.ts";
import { bbox, ellipse, fracAt, pathD, sample, smooth, v, type P, type Shape } from "../../../draw/geom.ts";
import { ribbons, strokeOf, type DrawnLine, type Outline, type Stroke } from "../../../draw/line.ts";
import { LIMITS } from "../../../draw/lint.ts";
import { marking, part, soft, type Fade, type Paint } from "../../../draw/paint.ts";
import { blur, join, pad, piece, uid, type Box, type Piece } from "../../../draw/svg.ts";
import { model } from "../model.ts";
import { C } from "../palette.ts";
import type { Drawn } from "./front.ts";

const OUTER = model.outline.outerPt;
const INNER = model.outline.innerPt;
/** Lines on fur spans and small parts: lighter, and never under 1.2 pt (as the front draws them). */
const THIN = 1.2;
const OUTLINE: Outline = { colour: C.outline, width: OUTER, taper: 6, blur: 0.2 };
const LM = model.landmarks["side.L"]!;

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const fmt = (n: number) => r3(n).toString();
/** A tapered line drawn as a filled polygon, with its meta for the lint built from what strokeOf draws (as the front's). */
function tapered(pts: P[], width: number, kind: "outer" | "inner", where: string, opts: Stroke = {}): { d: string; line: DrawnLine } {
  const s = strokeOf(pts, width, { band: LIMITS[kind], ...opts });
  return { d: s.d, line: { kind, width, where, drawn: s.drawn } };
}
/** A part's canvas grown to hold its light group's shade where the group reaches past the part. */
const roomy = (p: Piece, by: number): Piece => ({ ...p, box: pad(p.box, by) });
/** A box round some points. */
const boxOf = (pts: P[], by = 0): Box => {
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  return pad([Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)], by);
};

// Shapes.

// The back and the haunch (body.back): the topline from under the collar's
// back end, sloping down over the back to the rump (x 19.4 at y -21, where the
// tail's tan crosses it), round the haunch's back and its underside along the
// ground behind the hind paw, then up the haunch's front, a soft arc that rises
// from behind the hind paw's top (x -26.6 at y -15.6) to about y -31, as the
// sheet draws it faintly; above that it runs on up under the chest to the
// collar, hidden.
const back = smooth([[-30, -62.8], [-20, -63.6], [-11.6, -62.6], [-4, -59.4], [2.6, -54.6], [8, -49.2], [12.4, -43], [16.2, -34.8], [18.6, -27.8],
  [19.4, -21], [18.8, -15.4], [17.2, -10.8], [14.6, -6.6], [10.6, -3.6], [4, -2], [-4, -1.6], [-24, -1.6], [-28.6, -3.6], [-29.2, -9],
  [-25.6, -16.4], [-24.2, -23.4], [-21.2, -30.2], [-20, -36], [-26, -46]]);

// The chest (body.front): from under the chin and the collar down its front,
// hidden behind the tag, to the tag's foot (x -63.6 at y -35.2), where its edge
// shows for a short way, slanting back over the far leg to meet the near leg's
// front (x -55.8 at y -25), as the sheet draws it; behind the near leg down to
// the belly between the paws, and its back under the back body.
const chest = smooth([[-61.8, -50], [-60.6, -58.6], [-50, -64.8], [-36, -66], [-24, -64], [-18.6, -57], [-17.6, -46], [-19, -34], [-22, -22], [-26.6, -10.6],
  [-29.8, -4.4], [-34, -2.6], [-44, -2.4], [-53, -3.6], [-55.4, -12], [-55.2, -22.4], [-55.8, -25], [-59.8, -29.6], [-63.6, -35.2], [-63.2, -42]]);

// The near front leg (front.L): it comes out of the chest with a faint front
// edge (x -54 at y -32), runs down to a narrow wrist (x -56.6 at y -21.6) and
// swells forward into a round paw (its toe end at x -64.8 at y -8), its sole
// on the ground from x -63 to the heel at x -35.6; its back edge lies on the
// chest with no line, and its top, hidden in the chest's fur, is feathered.
const legNear = smooth([[-45, -44], [-52.4, -40.4], [-54, -32.4], [-55.8, -25], [-56.6, -21.6], [-58, -16.8], [-61.6, -14.8], [-64, -12], [-64.8, -8],
  [-63.4, -4.6], [-60, -2.2], [-54.6, -0.9], [-49.6, -0.6], [-44.6, -0.9], [-41, -1.6], [-37.8, -3.2], [-36, -6.6], [-35.4, -10.6], [-36.4, -20],
  [-38.6, -32], [-41, -41]]);

// The far front leg (front.R): only its front shows, a wedge from the tag's
// foot (x -63.6 at y -35.2) widening down to a paw that sits a little ahead of
// the near one and higher (its sole at y -4.8, its toe end at x -75); the rest
// lies behind the chest and the near leg, up to its top, hidden, by the
// shoulder both front legs turn at (DECISIONS 37).
const legFar = smooth([[-46, -40], [-53, -45], [-60.4, -42], [-63.6, -35.2], [-65.4, -29], [-66.8, -23.4], [-68.4, -20.2], [-71.6, -18.6], [-74.2, -15.4],
  [-75, -11.4], [-74.2, -7.8], [-71.8, -5.6], [-67.6, -4.8], [-61, -4.6], [-57, -8], [-55, -18], [-52.6, -28], [-48.6, -35]]);

// The near hind paw (hind.L): the round stub at the haunch's front, from its toe
// end (x -30.6) to where its top fades into the haunch (about x -11), its sole
// on the ground running on into the haunch's underside.
const hindNear = smooth([[-30.6, -9.6], [-29.6, -13.8], [-26.6, -16.2], [-20.6, -16.9], [-14.6, -16.2], [-9.6, -13.4], [-7.8, -8.4], [-9.4, -3.2],
  [-13.6, -1.1], [-19.6, -0.7], [-24.6, -0.9], [-28, -2], [-30.2, -5]]);

// The tail: a fluffy plume behind the rump, its tan root hugging the body from
// y -10 to -35, its front contour rising from the rump to a curl that hooks
// down at its front (x 16 at y -53), its top and back broken into soft locks
// of fur (notches at x 24 and 35.4 on the top, x 42 low on the back), as the
// sheet draws them; its root hidden under the rump.
const tailLocks = (lens: number[], lean: number) => lens.map((len, k) => ({ len, w: k % 2 ? 1.25 : 1, lean }));
const tail = furSpan(furEdge(furEdge(smooth([[10, -22], [17.4, -35.2], [20.4, -39], [21.2, -43.6], [20.2, -48.4], [17.8, -51.2], [16.2, -54.6], [18, -58.2],
  [22.6, -60.8], [29, -61.8], [35.4, -59.6], [41, -55.4], [45, -49], [47, -40], [46.8, -31.6], [44, -24.6], [38.6, -18], [32, -13.4], [24.4, -10.2],
  [16.6, -9.8]]), [19.4, -59.6], [41, -55.4], tailLocks([1.3, 1.8, 1.4], 0.35)), [45, -49], [39.6, -19], tailLocks([1.2, 1.6, 1.3], 0.3)),
  [17.8, -51.2], [39.6, -19]);

// The collar: a band round the neck, its front end round under the jaw (x
// -61.7), widening a little toward the front, its back end tucked behind the
// neck under the ear (x -17.6), as the sheet draws it.
const collar = smooth([[-61.8, -55.6], [-60.6, -58.6], [-55.3, -58.9], [-49.8, -59.4], [-44.2, -60.3], [-38.7, -61.4], [-33.1, -62.8], [-27.6, -64.1],
  [-23.4, -64.4], [-19.4, -63.4], [-17.4, -61.4], [-20.2, -59.2], [-24.8, -57.6], [-30.3, -55.3], [-35.9, -53.1], [-41.4, -51.4], [-47, -50.3], [-52.6, -50.1],
  [-57.6, -51.3], [-60.8, -53]]);

// The tag, seen a little edge-on: a round, coin-like heart (13.4 pt wide, the
// front's is 17.9), its notch barely showing, a blunt point at its foot,
// hanging from its ring on the collar's front.
const TAG_X = -59.5;
const heart = smooth([[TAG_X, -50.6], [-62.4, -51.6], [-65, -50.2], [-66.3, -47.4], [-66.2, -43.8], [-64.8, -40.6], [-62.4, -38.3], [TAG_X, -37.3], [-56.6, -38.2],
  [-54.2, -40.4], [-52.9, -43.8], [-53, -47.4], [-54.2, -50.2], [-56.7, -51.6]], { corners: [0] });
const innerHeart = smooth([[TAG_X, -47.4], [-61.4, -48.4], [-63.2, -47], [-63.4, -44.6], [-62.2, -42.2], [TAG_X, -40.2], [-57, -42.2], [-55.8, -44.6], [-56, -47],
  [-57.6, -48.4]], { corners: [0] });

// The ear: a broad droplet hanging over the head's side, its top under the
// crown's fur (the root, the ear's highest tan, at x -12.9, y -143.8), its
// front edge running down from there behind the head patch, curving in (x
// -29.4 at y -124) then out round the cheek (x -37.2 at y -86), its foot broad
// and round (lowest at x -13), and its back edge along the back of the head,
// out to x 22.6, as the sheet draws it.
/** Each clump of the ear's foot: its tip, root and notches (path order), for the creases drawn up into it. */
const earClumps: { tip: P; root: P; notches: [P, P] }[] = [];
// Its foot hangs in three soft clumps of fur, the broadest under its middle, as the sheet draws them, each notch a soft dip.
const ear = furEdge(smooth([[-12.9, -145.4], [-4, -144.6], [3.4, -142.2], [8.6, -134.4], [13.4, -125], [16.4, -114.6], [19.8, -104.6], [22.6, -95.4],
  [22.4, -85.4], [18.8, -77.6], [12.6, -71], [4, -66.4], [-5, -64], [-13, -62.8], [-21.2, -64.4], [-28.6, -69.6], [-34.6, -77], [-37.2, -85.6], [-36.8, -94.4],
  [-34, -103.6], [-30.8, -113.4], [-29.4, -124], [-30.2, -134], [-24, -143.2]]), [20.6, -81.6], [-29.4, -70.4],
[{ len: 0.9, w: 1, lean: 0.15 }, { len: 1.3, w: 2.2, lean: 0.05 }, { len: 1, w: 1.5, lean: -0.1 }], 0.42,
(tip, root, notches) => earClumps.push({ tip, root, notches }));

// The head: the muzzle's profile from the nose's front round its foot and the
// upper lip down to the chin (x -92.8 at y -80.2), the jaw sweeping back to the
// collar's front end; up from the nose the short bridge, the stop (x -85 at y
// -104.4) and the forehead rising into the crown's fur; over the crown under
// the topknot, down its back above the ear (x 0.4 at y -147.6), and behind the
// ear and along the collar's top, hidden.
/** Each forehead lock's tip, its root and its notches (path order), for the curl drawn into it. */
const foreLocks: { tip: P; root: P; notches: [P, P] }[] = [];
const head = furEdge(smooth([[-59.8, -58.4], [-70, -62.2], [-80.4, -65.6], [-91.8, -76.2], [-92.8, -80.2], [-95.2, -85.6], [-96.8, -92.6], [-95.6, -97.8],
  [-92.2, -100.2], [-87.4, -100.6], [-85, -104.4], [-84, -112.6], [-81, -124.4], [-77.8, -132.6], [-74, -140.2], [-69, -146.4], [-62.6, -151.4],
  [-20, -156], [0, -146.8], [10, -131], [17, -110], [14, -78], [-28, -62.4], [-44, -59.6]]), [-80.9, -127], [-65.8, -149.6],
// The forehead's fur breaks into two soft locks below the topknot, their tips hanging forward and curling in, as the sheet draws them.
[{ len: 1.3, w: 1, lean: -0.4 }, { len: 1.7, w: 1.2, lean: -0.45 }], 0.3, (tip, root, notches) => foreLocks.push({ tip, root, notches }));

// The topknot (tuft): three fur lobes on the crown, front to back: a low one
// over the forehead, the tall middle one (the head's top, x -37.7) and a
// lower one at the back that ends in a curl, each notch between them a soft
// dip, as the sheet draws them; its foot lies on the crown, feathered.
const TUFT_NOTCHES = [5, 15];
const tuft = furSpan(smooth([[-63, -150.4], [-61.4, -153.6], [-58.6, -156], [-55, -157.2], [-51.6, -156.6], [-48.6, -155.2], [-45.4, -156.6], [-43.2, -160],
  [-40.6, -163.6], [-37.2, -164.6], [-33, -164.3], [-28.6, -162.9], [-25.6, -161.5], [-23.4, -159.6], [-22, -157.4], [-20.6, -156.6], [-15.6, -157.2],
  [-10.6, -156.6], [-7, -155.2], [-4.8, -152.6], [-5.6, -149.8], [-14, -147.2], [-38, -146], [-58, -146.6]], { corners: TUFT_NOTCHES }), [-63, -150.4], [-4.8, -152.6]);

// Markings.

// The head patch, as the sheet paints it: a rounded hood over the eye (its top
// about 12 pt above the eye), coming down its front to about the eye's top; a
// notch of cream comes down between the hood and the ear's front (to y -115 at
// x -48.2); behind it the tan rises along the ear's front to y -131 and runs on
// under the ear; its lower edge slants from behind the eye's foot down to the
// ear at y -80.6, so the cheek and the blush below are cream.
const patch = smooth([[-73.6, -106], [-73.2, -112], [-71.4, -116.4], [-68.6, -120.6], [-64.5, -122.6], [-59.5, -122.5], [-54.8, -120.9], [-51.2, -118.4],
  [-48.2, -115.2], [-46, -118], [-42.6, -122.6], [-39.4, -127.6], [-36.6, -131.6], [-31, -136], [-24, -128], [-24, -84], [-33, -80.2], [-37, -81],
  [-41, -83.6], [-45.4, -86], [-50, -88.4], [-54.4, -90.6], [-58.6, -92.4], [-64, -94]], { corners: [8] });
// The saddle's left half: a soft-edged blob lying along the topline from just
// behind the collar's back end (x -12.6) down the back to above the rump (x 14),
// its lower edge dipping lowest under its front half (y -39 at x 0) and
// rounding up to the topline at each end, as the sheet paints it; typed with
// bleed above the topline, which the back body's clip takes off.
const saddle = smooth([[-15.4, -64.4], [-6, -60.6], [3, -55], [10.6, -47.6], [16.6, -39.4], [15.4, -35.6], [11, -36.2], [5.4, -37.4], [0, -38.8], [-5, -40.4],
  [-9.8, -43.6], [-12.6, -48], [-13.2, -53.4], [-14.6, -58.4]]);
// The rump's soft tan spot, where the tail's tan crosses the body's outline at
// the tail's root, fading paler away from the outline.
const rump = smooth([[20.4, -32.2], [22.4, -24], [21.6, -15.6], [17, -15.4], [13.2, -19.6], [12.4, -25.6], [14.6, -31]]);
const rumpFade: Fade = { from: [18.6, -23], to: [11.6, -23] };
// The tail's tan root: from the rump, where it reaches highest (y -40), its
// upper edge slanting down to about x 32 in a few soft streaks, the plume
// above it cream, as the sheet paints it; typed with bleed past the tail's
// edges.
const tailBase = furEdge(smooth([[8, -40], [17, -40.6], [21.4, -39.6], [25, -37.2], [27.6, -33], [29.6, -27.6], [32.4, -21.6], [33, -15], [30.4, -10], [24, -6],
  [12, -6], [6, -22]]), [24.4, -37.8], [32.6, -19.6],
// Its upper edge slants down to the right and breaks into a few soft streaks combed up into the cream, as the sheet paints them.
[{ len: 1.8, w: 1, lean: -0.45 }, { len: 2.4, w: 1.2, lean: -0.45 }, { len: 1.8, w: 1, lean: -0.45 }], 0.3);

/** The tail's root on the rump, where it turns (DECISIONS 37): rig.json's tail pivot in this view. */
export const TAIL_ROOT: P = [15, -23];

// Paint.

/** The fur's one shade (the front's recipe): the fur's own warm multiply on the rim away from the light and under overhangs. */
const furShade = (group: Shape[], shapes: string[] = [], keep: string[] = [], rim = { inset: 2.5, toLight: 4 }) =>
  ({ multiply: C.furShadeBy, rim, shapes, keep, group, blur: 2.4 });
/** The near side of the body is one light group: back and haunch, chest, near legs. */
const bodyGroup = [back, chest, legNear, hindNear];
const headGroup = [head, tuft];

const backPaint: Paint = {
  fill: C.fur,
  // The haunch's underside and its back, away from the light; and under the ear and the collar's back end, where the
  // ear hangs over the neck.
  shade: furShade(bodyGroup, ["M-30 -66 L-8 -66 L-10 -56 C-16 -54 -24 -56 -30 -58Z"]),
  // The topline in the lighter warm line the sheet draws over the back (#B08769), round the rump and the haunch's back
  // in the warm line, along the underside in the paws' line, and up the haunch's front a faint soft line that fades out
  // upward, as the sheet draws it.
  outline: { ...OUTLINE, colour: C.haunchLine, width: 1.3, taper: 6, spans: [
    { from: [-11, -62.4], to: [16.6, -33.6] },
    { from: [15.2, -37.6], to: [12, -4.6], width: 1.4, colour: C.warmLine },
    { from: [14.6, -6.6], to: [-6, -1.6], width: 1.4, colour: C.pawLine },
    { from: [-27.6, -13], to: [-23.8, -24.4], width: 1.3, colour: C.pawLine },
    { from: [-24.6, -21], to: [-20.4, -32.4], width: 1.3, colour: C.softLine },
  ] },
};

const chestPaint: Paint = {
  fill: C.fur,
  // In shade under the collar, and deep warm shade on the belly between the paws, as the sheet paints it there.
  shade: furShade(bodyGroup, ["M-60 -54 C-48 -48 -32 -48 -20 -54 L-20 -60 L-60 -60Z"]),
  under: belly(),
  // Only its front edge between the tag's foot and the near leg shows, a line as the sheet draws it over the far leg.
  outline: { ...OUTLINE, colour: C.haunchLine, width: THIN, taper: 3, spans: [{ from: [-55.8, -25], to: [-62.8, -34] }] },
};

/**
 * The belly between the front paw's heel and the hind paw, in deep warm shade, as the sheet paints it (#D39870):
 * a wedge rising from the ground to a point by the haunch's front, its top fading out.
 */
function belly(): string {
  const g = uid("belly"), f = uid("blur");
  const d = pathD(smooth([[-37, -2], [-35.4, -8], [-31.6, -14.4], [-27, -18.6], [-25.6, -16], [-27.6, -9], [-28.6, -2]], { corners: [0, 6] }).segs);
  return `<defs><linearGradient id="${g}" gradientUnits="userSpaceOnUse" x1="0" y1="-19" x2="0" y2="-3">` +
    `<stop offset="0" stop-color="${C.marking}" stop-opacity="0.15"/><stop offset="0.5" stop-color="${C.marking}" stop-opacity="0.6"/>` +
    `<stop offset="1" stop-color="${C.earDeep}" stop-opacity="0.9"/></linearGradient>${blur(f, [-42, -24, 20, 26], 0.8)}</defs>` +
    `<path d="${d}" fill="url(#${g})" filter="url(#${f})"/>`;
}

/** The near legs' toe lines fade out toward their tops, as the front's do. */
function toeFade(id: string, y0: number, y1: number): string {
  return `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" y1="${y0}" x2="0" y2="${y1}">` +
    `<stop offset="0.35" stop-color="${C.pawLine}"/><stop offset="1" stop-color="${C.pawLine}" stop-opacity="0.1"/></linearGradient>`;
}

function legNearPaint(): Paint {
  const fade = uid("legline"), toe = uid("toe");
  return {
    fill: C.fur,
    shade: furShade(bodyGroup, [], ["M-70 -60 L-30 -60 L-30 -30 L-70 -30Z"]),
    under: `<defs><linearGradient id="${fade}" gradientUnits="userSpaceOnUse" x1="0" y1="-33" x2="0" y2="-14">` +
      `<stop offset="0" stop-color="${C.softLine}" stop-opacity="0.2"/><stop offset="0.4" stop-color="${C.softLine}"/>` +
      `<stop offset="1" stop-color="${C.pawLine}"/></linearGradient>${toeFade(toe, -0.6, -7.6)}</defs>`,
    // Two toe lines rising from the sole at the paw's front, about 6 pt up, as the sheet draws them.
    inner: [[[-61, -2.2], [-61.5, -4.4], [-61.4, -6.6], [-60.8, -8.4]], [[-54.2, -1], [-54.5, -3.2], [-54.4, -5.6], [-53.8, -7.6]]]
      .map((pts) => ({ pts: pts as P[], width: 0.8, colour: `url(#${toe})` })),
    // Its front comes out of the chest faint and deepens to the paw's line at the wrist; round the toe end and along the
    // sole to the heel, the paw's line.
    outline: { ...OUTLINE, colour: C.pawLine, width: 1.35, taper: 5, spans: [
      { from: [-54, -32.4], to: [-60, -15.4], width: THIN, colour: `url(#${fade})` },
      { from: [-58.6, -16.4], to: [-35.6, -6.4], width: 1.4 },
    ] },
    // Its top fades in on the chest, so it comes out of the chest's fur with no edge.
    feather: { from: [-44, -42], to: [-46, -36] },
  };
}

function legFarPaint(): Paint {
  return {
    fill: C.farFur,
    // In shade under the chest and the tag, where it comes out from behind them, as the sheet paints the wedge.
    shade: { multiply: C.furShadeBy, rim: { inset: 2.5, toLight: 4 }, shapes: ["M-66 -40 L-56 -40 L-56 -21 C-60 -20 -64 -21 -68 -22Z"], blur: 2 },
    inner: [{ pts: [[-69.4, -5.4], [-69.8, -7.6], [-69.7, -9.8], [-69.2, -11.6]], width: 0.75, colour: C.pawLine, opacity: 0.6 }],
    outline: { ...OUTLINE, colour: C.pawLine, width: 1.35, taper: 4, spans: [{ from: [-63.6, -35.2], to: [-66.6, -4.8] }] },
  };
}

function hindPaint(): Paint {
  const toe = uid("toe");
  return {
    fill: C.fur,
    shade: furShade(bodyGroup),
    under: `<defs>${toeFade(toe, -0.8, -8.4)}</defs>`,
    inner: [[[-28, -2.4], [-28.4, -4.6], [-28.2, -6.8], [-27.6, -8.6]], [[-21.4, -1], [-21.6, -3.2], [-21.4, -5.4], [-20.9, -7.2]]]
      .map((pts) => ({ pts: pts as P[], width: 0.8, colour: `url(#${toe})` })),
    // Its toe end and its sole in the paw's line; over its top, where it lies on the haunch, a soft light line that tapers
    // off into the haunch, as the sheet draws it.
    outline: { ...OUTLINE, colour: C.pawLine, width: 1.4, taper: 4, spans: [
      { from: [-29.8, -13.4], to: [-23.6, -16.9] },
      { from: [-10.6, -1.6], to: [-29.6, -12.2] },
    ] },
    feather: { from: [-8.4, -9], to: [-12.6, -9] },
  };
}

const tailPaint: Paint = {
  fill: C.fur,
  // Its foot away from the light, and the tan root's core by the rump, where the sheet's tan is deepest.
  shade: { multiply: C.furShadeBy, rim: { inset: 2.5, toLight: 4 }, shapes: ["M10 -14 C24 -6 40 -12 48 -24 L48 -4 L10 -4Z",
    "M16 -34 C20 -33 24 -27 24.6 -20 C24.8 -15 23 -12 20 -11 L16 -11Z"], blur: 2.4 },
  highlight: { d: "M22 -57 C28 -61 36 -60 41 -55 C36 -52 28 -52 22 -54Z", colour: C.light, opacity: 0.35, blur: 3 },
  // The curl's hook turns in under itself at the plume's front, a short hair stroke, as the sheet draws it.
  inner: [{ pts: [[17.4, -52.6], [19.4, -53], [21.4, -54.4]], width: 0.8, colour: C.crownLine, opacity: 0.85 }],
  // The light fur line over the curl, the top and the back, and the warm line along its foot by the tan root and up its
  // front where it leaves the rump.
  outline: { ...OUTLINE, colour: C.crownLine, width: THIN, taper: 3, spans: [
    { from: [17.6, -35.8], to: [20.8, -44.6], width: 1.3, colour: C.warmLine },
    { from: [20.6, -43], to: [41.4, -21.2], colour: C.fluffLine },
    { from: [40.6, -19.6], to: [17.4, -9.8], width: 1.35, colour: C.warmLine },
  ] },
};

const headLight = "M-82 -128 C-74 -146 -56 -154 -38 -152 C-46 -146 -62 -140 -72 -126Z " +
  "M-90 -103 C-87 -106 -80 -107 -76 -104 C-79 -101 -86 -100 -90 -103Z";
const headPaint: Paint = {
  fill: C.fur,
  // Under the jaw, where the head turns under toward the collar, and the cheek's back under the ear's foot.
  shade: furShade(headGroup, ["M-92 -76 C-84 -66 -72 -63 -56 -61 L-30 -62 L-30 -56 L-92 -56Z", "M-40 -82 C-36 -72 -30 -66 -24 -64 L-24 -56 L-44 -56Z"],
    ["M-100 -172 L20 -172 L20 -140 L-100 -140Z"], { inset: 3, toLight: 4.5 }),
  highlight: { d: headLight, colour: C.light, opacity: 0.4, blur: 4 },
  // Each forehead lock's tip curls back in over the fur, a short hair stroke, as the sheet draws them.
  inner: foreLocks.map(({ tip, root, notches }) => {
    const into = v.norm(v.sub(root, tip)), up = v.norm(v.sub(notches[1], notches[0]));
    const at = (a: number, b: number): P => v.add(tip, v.add(v.mul(into, a), v.mul(up, b)));
    return { pts: [at(0.4, 0), at(1.4, -0.4), at(2.4, 0.2)], width: 0.8, colour: C.crownLine, opacity: 0.8 };
  }),
};

/**
 * The head's line, where the sheet draws one: the crown's light warm line over the forehead's fur and the crown's
 * back above the ear; round the nose's front the nose's own near-black, so the nose's edge is its own; down the lip,
 * the chin and the jaw the outline's brown; and along the collar's top, under the chin's fur, a soft warm line.
 */
const headLine: Outline = { ...OUTLINE, taper: 4, blur: 0.15, spans: [
  { from: [-86, -102.4], to: [-63.4, -151], width: THIN, colour: C.crownLine },
  { from: [-3.6, -148.4], to: [3.6, -142.2], width: THIN, colour: C.fluffLine },
  { from: [-61, -59], to: [-95.8, -88], width: 1.3 },
] };
/** The nose's front, on the head's edge: a line in the nose's own colour, so the stencil's hard edge is covered. */
const noseEdge: Outline = { colour: C.eyeDark, width: THIN, taper: 1.5, blur: 0.15, spans: [{ from: [-95.6, -87.8], to: [-91, -100.4] }] };

function headLinePiece(): Piece {
  const r = ribbons(head, headLine, "head.line", 0.5), n = ribbons(head, noseEdge, "head.line", 0.5);
  const f = uid("blur");
  const [x0, y0, x1, y1] = bbox(head.segs);
  const box = pad([x0, y0, x1 - x0, y1 - y0], 2);
  return piece(`<defs>${blur(f, pad(box, 2), 0.15)}</defs><g fill="${headLine.colour}" filter="url(#${f})">${r.svg}${n.svg}</g>`, box, {
    shapes: [{ name: "head.line", nodes: head.typed, segs: head.segs, outlined: [...r.outlined, ...n.outlined], fur: head.fur.map(([a, b]) => [fracAt(head, a), fracAt(head, b)]) }],
    lines: [...r.lines, ...n.lines],
  });
}

/**
 * The near eye in profile, as the side turnaround paints it: a tall oval iris (about 11 by 21 pt) leaning a little
 * back at its top, near-black down to a lower band in the printed dark brown; behind it, toward the ear, a crescent
 * of white inside a heavy dark lash line that arches from the iris's top round its back to below its middle; a thin
 * dark rim round the iris's front; and one catchlight high on its front, toward the nose, as the sheet draws it
 * (Q26's default).
 */
function eye(): Piece {
  const [lx, ly] = LM["eye.L"]!;
  // The iris: its centre 1.3 pt ahead of the landmark (the dark centroid takes in the lash line behind it).
  const c: P = [lx - 1.3, ly + 0.5], rx = 5.5, ry = 10.6, lean = 4;
  const iris = pathD(ellipse(c, rx, ry, lean));
  const clip = uid("eye"), above = uid("band"), warm = uid("blur"), shine = uid("blur"), edge = uid("blur"), white = uid("blur"), core = uid("blur");
  const box: Box = [c[0] - 10, c[1] - 15, 24, 30];
  /** A point on the iris's oval at an angle (degrees, 0 toward the back, 90 down), grown by `grow`. */
  const on = (deg: number, grow = 0): P => {
    const a = (deg * Math.PI) / 180, t = (lean * Math.PI) / 180;
    const x = (rx + grow) * Math.cos(a), y = (ry + grow) * Math.sin(a);
    return [c[0] + x * Math.cos(t) - y * Math.sin(t), c[1] + x * Math.sin(t) + y * Math.cos(t)];
  };
  // The white: from the iris's top round its back to its lower back, out to the lash line.
  const whiteShape = smooth([on(-100), [c[0] + 3.6, c[1] - 10.4], [c[0] + 7.6, c[1] - 7.4], [c[0] + 9.6, c[1] - 1.8], [c[0] + 9.2, c[1] + 4.6], [c[0] + 7.2, c[1] + 7.6],
    on(45), on(0), on(-45)], { corners: [0, 6] });
  const lashArc = smooth([on(-112, 0.2), [c[0] + 4.2, c[1] - 10.8], [c[0] + 8.2, c[1] - 7.4], [c[0] + 10.2, c[1] - 1.6], [c[0] + 9.8, c[1] + 4.2], [c[0] + 8.2, c[1] + 7.4]],
    { closed: false });
  const lash = tapered(sample(lashArc.segs, 10, false), 1.5, "outer", "eye lash", { taper: 7, tip: 0.3 });
  const rim = tapered(Array.from({ length: 25 }, (_, k) => on(80 + (k * 190) / 24, 0.15)), 0.9, "inner", "eye rim", { taper: 4, tip: 0.3 });
  // The lower band: the iris less a disc above, about 4.5 pt deep at the foot.
  const lower = `M${fmt(c[0] - 30)} ${fmt(c[1] - 40)}H${fmt(c[0] + 30)}V${fmt(c[1] + 40)}H${fmt(c[0] - 30)}Z` + pathD(ellipse([c[0] + 0.5, c[1] - 6.2], 9, 12.4, lean));
  const big = on(-130, -2.6), warmAt = on(90, -2.4);
  const n = (p: P) => `${fmt(p[0])}" cy="${fmt(p[1])}`;
  const svg = `<defs><clipPath id="${clip}"><path d="${iris}"/></clipPath><clipPath id="${above}"><path d="${lower}" clip-rule="evenodd"/></clipPath>` +
    `${blur(warm, box, 0.45)}${blur(shine, box, 0.15)}${blur(edge, box, 0.22)}${blur(white, box, 0.3)}${blur(core, box, 0.3)}</defs>` +
    `<g filter="url(#${white})"><path d="${pathD(whiteShape.segs)}" fill="${C.eyeWhite}"/></g>` +
    `<g filter="url(#${edge})"><path d="${iris}" fill="${C.eyeDark}"/><path d="${lash.d}" fill="${C.eyeDark}"/><path d="${rim.d}" fill="${C.eyeDark}"/></g>` +
    `<g clip-path="url(#${clip})"><g filter="url(#${warm})"><path d="${iris}" fill="${C.dark}" clip-path="url(#${above})"/></g>` +
    `<ellipse cx="${n(warmAt)}" rx="2.6" ry="0.9" fill="${C.irisLight}" opacity="0.8" filter="url(#${warm})"/></g>` +
    `<ellipse cx="${n(big)}" rx="1.55" ry="1.5" fill="${C.light}" filter="url(#${shine})"/>` +
    `<ellipse cx="${n(big)}" rx="0.6" ry="0.55" fill="${C.dark}" opacity="0.1" filter="url(#${core})"/>`;
  return piece(svg, box, { shapes: [], lines: [lash.line, rim.line] });
}

/** The brow: a short, thick, rounded dab of tan above the hood, domed, its back end lower, soft at its edges (the front's recipe). */
function brow(): Piece {
  const pts: P[] = [[-62, -129.8], [-59.6, -131.3], [-57, -131], [-54.9, -128.8]];
  const f = uid("blur"), box: Box = [-66, -136, 16, 12];
  return piece(`<defs>${blur(f, box, 0.35)}</defs><g filter="url(#${f})">` +
    `<path d="${strokeOf(pts, 2.4, { taper: 2.4, tip: 1 }).d}" fill="${C.marking}" opacity="0.85"/></g>`, box);
}

/**
 * The nose at the snout's tip, as the sheet draws it in profile: a near-black egg (8 pt across, 10 pt tall), its
 * round top just above the bridge, its front the snout's own edge, narrowing at its foot to the lip; a soft
 * grey-brown sheen across its upper back, as the front's.
 */
const noseShape = smooth([[-91.6, -100.2], [-89.4, -98.4], [-88.8, -95.6], [-90, -92.8], [-92.4, -91], [-94.8, -89.6], [-96.4, -91.2], [-97.2, -94.2],
  [-96.6, -97.4], [-94.4, -99.6]]);
function nose(): Piece {
  const f = uid("blur"), box: Box = [-99, -103, 12, 16];
  return piece(`<defs>${blur(f, box, 0.7)}</defs><path d="${pathD(noseShape.segs)}" fill="${C.eyeDark}"/>` +
    `<ellipse cx="-92" cy="-97.4" rx="2.2" ry="1" transform="rotate(-20 -92 -97.4)" fill="${C.noseSheen}" opacity="0.8" filter="url(#${f})"/>`, box);
}

/**
 * The closed smile in profile, as the side turnaround draws it: from the lip's turn under the nose a short curve
 * back along the muzzle, dipping a little and hooking up into a small curl at the corner (mouth.L).
 */
function mouth(): Piece {
  const pts = sample(smooth([[-93.2, -80.8], [-91, -79.8], [-88.4, -79.4], [-86.4, -80], [-85.2, -81], [-84.8, -82.2]], { closed: false }).segs, 8, false);
  const line = tapered(pts, 0.9, "inner", "smile", { taper: 2, tip: 0.3 });
  return piece(`<path d="${line.d}" fill="${C.dark}"/>`, [-96, -86, 14, 9], { shapes: [], lines: [line.line] });
}

/** The blush below the eye's back, where the sheet's sits: the front's soft ellipse, at its level. */
function blush(): Piece {
  const [cx, cy] = [-58.4, -85], rx = 5.8, ry = 3.6;
  const d = `M${r3(cx - rx)} ${cy} a${rx} ${ry} 0 1 0 ${2 * rx} 0 a${rx} ${ry} 0 1 0 ${-2 * rx} 0Z`;
  return soft(d, [cx - rx - 0.5, cy - ry - 0.6, 2 * rx + 1, 2 * ry + 1.2], C.blush, 2.2, Math.round(model.blush.restingLevel * 1.28 * 100) / 100);
}

/** The tag and its ring (the front's recipe): flat matte gold, a darker gold rim inside its line, one soft light high on it, the smaller heart engraved. */
function tagPiece(): Piece {
  const ringLine: DrawnLine = { kind: "inner", width: 0.6, where: "tag ring", drawn: [0.6, 0.6] };
  const ring = piece(`<rect x="-60.6" y="-58.6" width="2.6" height="8.6" rx="1.3" fill="${C.collar}" stroke="${C.collarRim}" stroke-width="${ringLine.width}"/>` +
    `<rect x="-59.7" y="-58" width="0.8" height="7" rx="0.4" fill="${C.collarHighlight}"/>`, [-62, -60, 6, 11.4], { shapes: [], lines: [ringLine] });
  const emboss = sample(innerHeart.segs, 10);
  emboss.push(emboss[0]!);
  return join(ring, part("tag", heart, {
    fill: C.tag,
    shade: { multiply: C.tagShadeBy, rim: { inset: 1.3, toLight: 1.3 }, blur: 1 },
    highlight: { d: "M-64 -46.4 a2.4 1.7 -40 1 0 4.8 0 a2.4 1.7 -40 1 0 -4.8 0", colour: C.tagShine, opacity: 0.45, blur: 1.4 },
    inner: [{ pts: emboss, width: 0.7, colour: C.tagLine, opacity: 0.6 }],
    outline: { colour: C.tagLine, width: 1.3, taper: 2, blur: 0.2 },
  }));
}

/**
 * The ear's paint (the front's recipe, turned): the tan deepening down the ear to a browner tan at its foot and
 * along its back, under the fur's own warm shade; a few soft locks, darker partings and lighter strokes, curving down
 * with its round; a fold along its upper back, a light streak beside a darker crease, where it turns over the back
 * of the head; and its line in the warm brown the sheet draws round the ears, from under the crown's fur down the
 * front, round the foot and up the back. Its top lies under the crown's fur, feathered, with no line.
 */
function earPaint(): Paint {
  const deep = uid("deep"), top = uid("top"), parting = uid("blur"), along = uid("blur"), [ex0, ey0, ex1, ey1] = bbox(ear.segs);
  const earBox = pad([ex0, ey0, ex1 - ex0, ey1 - ey0], 2);
  const dark: P[][] = [[[-14, -128], [-16.4, -112], [-17.2, -96], [-16, -80], [-14, -70]], [[0, -126], [2.6, -110], [4, -94], [2.6, -78]],
    [[-26, -112], [-29, -98], [-29.6, -86], [-27, -74]]];
  const light: P[][] = [[[-8, -124], [-9, -108], [-9, -92], [-7.6, -78]], [[-21, -118], [-23.2, -102], [-23.6, -88]]];
  const softStrokes = (pts: P[][], width: number) => pts.map((l) => strokeOf(sample(smooth(l, { closed: false }).segs, 8, false), width, { taper: 6, tip: 0.2 }).d).join("");
  const fold = strokeOf(sample(smooth([[-4.6, -135], [3, -128.6], [9.4, -120.6], [14.4, -112], [16.8, -106]], { closed: false }).segs, 8, false), 1.4, { taper: 5, tip: 0.2 }).d;
  const crease = strokeOf(sample(smooth([[0.6, -134.4], [6.6, -127.4], [11.6, -119.6], [15.4, -111.6]], { closed: false }).segs, 8, false), 0.9, { taper: 5, tip: 0.2 }).d;
  const under = `<defs><linearGradient id="${deep}" gradientUnits="userSpaceOnUse" x1="-14" y1="-120" x2="-4" y2="-64">` +
    `<stop offset="0" stop-color="${C.earDeep}" stop-opacity="0"/><stop offset="0.45" stop-color="${C.earDeep}" stop-opacity="0.8"/>` +
    `<stop offset="0.8" stop-color="${C.earDeeper}"/><stop offset="1" stop-color="${C.earLow}"/></linearGradient>` +
    // Its top is lighter, the head patch's paler tan, where it comes out from under the crown's fur, as the sheet paints it.
    `<linearGradient id="${top}" gradientUnits="userSpaceOnUse" x1="0" y1="-146" x2="0" y2="-122">` +
    `<stop offset="0.15" stop-color="${C.patch}" stop-opacity="0.85"/><stop offset="1" stop-color="${C.patch}" stop-opacity="0"/></linearGradient>` +
    `${blur(parting, earBox, 0.8)}${blur(along, earBox, 1.1)}</defs>` +
    `<rect x="${fmt(ex0)}" y="${fmt(ey0)}" width="${fmt(ex1 - ex0)}" height="${fmt(ey1 - ey0)}" fill="url(#${deep})"/>` +
    `<rect x="${fmt(ex0)}" y="${fmt(ey0)}" width="${fmt(ex1 - ex0)}" height="${fmt(ey1 - ey0)}" fill="url(#${top})"/>` +
    `<path d="${softStrokes(light, 2.4)}" fill="${C.patch}" opacity="0.2" filter="url(#${along})"/>` +
    `<path d="${softStrokes(dark, 1.6)}" fill="${C.earLow}" opacity="0.25" filter="url(#${parting})"/>` +
    `<path d="${fold}" fill="${C.patch}" opacity="0.7" filter="url(#${along})"/>` +
    `<path d="${crease}" fill="${C.earLine}" opacity="0.6" filter="url(#${parting})"/>`;
  const strand = uid("strand");
  const strands = `<defs><linearGradient id="${strand}" gradientUnits="userSpaceOnUse" x1="0" y1="-64" x2="0" y2="-72">` +
    `<stop offset="0" stop-color="${C.earLine}" stop-opacity="0.6"/><stop offset="1" stop-color="${C.earLine}" stop-opacity="0"/></linearGradient></defs>`;
  return {
    fill: C.marking,
    under: under + strands,
    // A short crease up from each notch between the foot's clumps, fading out upward, as the sheet draws them.
    inner: earClumps.slice(1).map(({ notches }) => {
      const n = notches[0];
      return { pts: [n, [n[0] + 0.3, n[1] - 2.6], [n[0] + 0.2, n[1] - 5]] as P[], width: 0.7, colour: `url(#${strand})` };
    }),
    // Its back, away from the light, and its foot.
    shade: { multiply: C.furShadeBy, rim: { inset: 2.4, toLight: 4 }, shapes: ["M0 -140 C14 -126 24 -100 22 -80 L30 -80 L30 -140Z"], keep: ["M-40 -72 C-20 -70 0 -70 16 -76 L16 -56 L-40 -56Z"], blur: 3.2 },
    highlight: { d: "M-30 -110 C-29 -120 -24 -130 -18 -132 C-19 -124 -24 -114 -27 -106 C-29 -104 -30 -106 -30 -110Z", colour: C.patch, opacity: 0.3, blur: 2.6 },
    outline: { ...OUTLINE, colour: C.warmLine, width: 1.3, taper: 6, blur: 0.25, spans: [
      { from: [5.2, -139.6], to: [22.6, -93.8], width: 1.4, colour: C.earLine },
      { from: [21.4, -98], to: [-30.4, -72], width: 1.3 },
      { from: [-26.4, -67.6], to: [-29.6, -130], colour: C.earEdge },
    ] },
    feather: { from: [-12, -147.4], to: [-12, -141.4] },
  };
}

export function side(): Drawn[] {
  const out: Drawn[] = [];
  const add = (name: string, p: Piece, state?: string) => out.push({ part: name, piece: p, ...(state ? { state } : {}) });
  // The ground shadow: a wide soft warm oval under the dog, densest under its paws and the haunch, as the sheet paints it.
  add("shadow", join(soft("M-80 -1.4 a64 4.2 0 1 0 128 0 a64 4.2 0 1 0 -128 0Z", [-80, -5.6, 128, 8.4], C.shadow, 2.4, 0.75),
    soft("M-70 0 a40 2.2 0 1 0 80 0 a40 2.2 0 1 0 -80 0Z", [-70, -2.2, 80, 4.4], C.shadow, 1.8, 0.5),
    ...([[-50, 13], [-20, 11], [6, 10], [-68.6, 7]] as [number, number][]).map(([x, rx]) =>
      soft(`M${x - rx} -0.4 a${rx} 1.6 0 1 0 ${2 * rx} 0 a${rx} 1.6 0 1 0 ${-2 * rx} 0Z`, [x - rx, -2, 2 * rx, 3.2], C.contact, 1.2, 0.6))));
  add("tail", part("tail", tail, tailPaint));
  add("tail.base", marking("tail.base", { shape: tail, paint: tailPaint }, tailBase, { fill: C.marking, blur: 1.3, clip: true }));
  add("front.R", part("front.R", legFar, legFarPaint()));
  add("body.front", roomy(part("body.front", chest, chestPaint), 1));
  add("body.back", roomy(part("body.back", back, backPaint), 1));
  add("back.patch.L", marking("back.patch.L", { shape: back, paint: backPaint }, saddle, { fill: C.marking, blur: 0.8, clip: true }));
  add("rump.patch.L", marking("rump.patch.L", { shape: back, paint: backPaint }, rump, { fill: C.marking, blur: 1.4, clip: true, fade: rumpFade }));
  add("hind.L", roomy(part("hind.L", hindNear, hindPaint()), 6));
  add("front.L", roomy(part("front.L", legNear, legNearPaint()), 1));
  add("collar", part("collar", collar, {
    fill: C.collar,
    // Its lower half in shade, lit along its middle, a dark blue rim round its foot, as the front's.
    shade: { multiply: C.shadeBy, shapes: ["M-64 -53 C-50 -48 -32 -50 -16 -58 L-16 -46 L-64 -46Z"], blur: 0.9 },
    highlight: { d: "M-58 -56.6 C-46 -57 -32 -59 -21 -62 L-21 -60 C-32 -57 -46 -55 -58 -54.6Z", colour: C.collarHighlight, opacity: 0.3, blur: 0.9 },
    under: `<rect x="-61" y="-59.6" width="4" height="10" rx="1.2" fill="${C.collarLine}" opacity="0.3"/>`,
    outline: { colour: C.collarRim, width: THIN, taper: 3, blur: 0.2, spans: [{ from: [-17.6, -61], to: [-61.6, -56] }] },
  }));
  add("tag", tagPiece());
  add("head.base", part("head.base", head, headPaint));
  add("head.patch.L", marking("head.patch.L", { shape: head, paint: headPaint }, patch, { fill: C.patch, blur: 0.7, clip: false }));
  add("blush.L", blush());
  add("eye.L", eye(), "open");
  add("brow.L", brow());
  add("nose", nose());
  add("mouth", mouth(), "smile");
  add("head.line", headLinePiece());
  add("ear.L", part("ear.L", ear, earPaint()));
  add("tuft", part("tuft", tuft, {
    fill: C.fur,
    shade: { multiply: C.furShadeBy, rim: { inset: 3, toLight: 4.5 }, group: headGroup, keep: ["M-70 -168 L0 -168 L0 -150 L-70 -150Z"], blur: 2.4 },
    highlight: { d: headLight, colour: C.light, opacity: 0.4, blur: 4 },
    // The lobes' curls, hair strokes curling in as the sheet draws them.
    inner: [
      { pts: [[-59.6, -155.6], [-57.4, -154.2], [-56.4, -152.2]], width: 0.85, colour: C.crownLine },
      { pts: [[-44.6, -157.6], [-42.6, -156.4], [-39.6, -155.4], [-36.4, -155]], width: 0.85, colour: C.crownLine },
      { pts: [[-5.8, -152.2], [-8, -151], [-11, -150.4], [-13.4, -150.6]], width: 0.85, colour: C.crownLine },
    ],
    outline: { ...OUTLINE, colour: C.fluffLine, width: THIN, taper: 2.6, spans: [{ from: [-62.6, -151.6], to: [-49.2, -155.6] },
      { from: [-48, -155.6], to: [-22.4, -158] }, { from: [-21.2, -156.8], to: [-4.9, -151.6] }] },
    feather: { from: [0, -146.4], to: [0, -150.4] },
  }));
  return out;
}

/** Points the sheet has no finder for, where this drawing puts them (dev output for the sheet match). */
export const landmarks: Record<string, P> = {
  // The centre of each paw's rounded end, midway between its outlines and from its toe lines' top to its sole (DECISIONS 11).
  "paw.front.L": [-47.4, -7],
  "paw.front.R": [-69.4, -11.4],
  "paw.hind.L": [-20.2, -8],
  // The ring's top, where it rests on the collar: the tag's pivot (rig.json).
  "tag.ring": [-59.1, -58.3],
  // The seat: the middle of the haunch's underside, 1 pt inside it (DECISIONS 9).
  seat: [0, -3],
};
