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
import { bbox, ellipse, fracAt, pathD, sample, smooth, spanPoints, v, type P, type Shape } from "../../../draw/geom.ts";
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
// the belly between the paws; its back reaches well in under the back body, so
// the hips can turn without opening a gap.
const chest = smooth([[-61.8, -50], [-60.6, -58.6], [-50, -64.8], [-36, -66], [-22, -64.4], [-12.4, -60.4], [-5.6, -53.6], [-4, -44], [-7.6, -32], [-16, -20],
  [-26.6, -10.6], [-29.8, -4.4], [-34, -2.6], [-44, -2.4], [-53, -3.6], [-55.4, -12], [-55.2, -22.4], [-55.8, -25], [-59.8, -29.6], [-63.6, -35.2], [-63.2, -42]]);

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
// shoulder both front legs turn at (DECISIONS 38).
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
  [-24.4, -64.4], [-20.8, -63.6], [-18.8, -61.6], [-21.4, -59.2], [-24.8, -57.6], [-30.3, -55.3], [-35.9, -53.1], [-41.4, -51.4], [-47, -50.3], [-52.6, -50.1],
  [-57.6, -51.3], [-60.8, -53]]);

// The tag, seen a little edge-on: a round, coin-like heart (13.4 pt wide, the
// front's is 17.9), its notch barely showing, a blunt point at its foot,
// hanging from its ring on the collar's front.
const TAG_X = -59.5;
const heart = smooth([[TAG_X, -51.1], [-62.4, -51.6], [-65, -50.2], [-66.3, -47.4], [-66.2, -43.8], [-64.8, -40.6], [-62.4, -38.3], [TAG_X, -37.3], [-56.6, -38.2],
  [-54.2, -40.4], [-52.9, -43.8], [-53, -47.4], [-54.2, -50.2], [-56.7, -51.6]], { corners: [0] });
const innerHeart = smooth([[TAG_X, -47.4], [-61.4, -48.4], [-63.2, -47], [-63.4, -44.6], [-62.2, -42.2], [TAG_X, -40.2], [-57, -42.2], [-55.8, -44.6], [-56, -47],
  [-57.6, -48.4]], { corners: [0] });

// The ear: a broad droplet hanging over the head's side, its top under the
// crown's fur (the root, the ear's highest tan, at x -12.9, y -143.8), a
// narrower, rounder top than a flat dome, its front coming down from a round
// shoulder (x -30.8 at y -132) behind the head patch, curving in (x -29.4 at y
// -124) then out round the cheek (x -37.2 at y -86), its foot broad and round
// (lowest at x -13), and its back edge along the back of the head, out to x
// 21.6, as the sheet draws it.
/** Each clump of the ear's foot: its tip, root and notches (path order), for the creases drawn up into it. */
const earClumps: { tip: P; root: P; notches: [P, P] }[] = [];
// Its foot hangs in four soft, wavy clumps of fur with short partings between them, as the sheet draws them: a
// small one low on its back, a second, the broadest under its middle, hanging lowest, and a smaller one at its
// front. Its top, where it comes out from under the crown, breaks into a row of small soft points of fur, feathered
// into the crown, with no line.
const ear = furEdge(furEdge(smooth([[8.6, -134.4], [13.4, -125], [16.4, -114.6], [19.4, -104.6], [21.6, -95.4], [21.4, -85.4], [18.6, -77.6], [12.6, -71],
  [4, -66.4], [-13, -62.8], [-21.2, -64.4], [-28.6, -69.6], [-34.6, -77], [-37.2, -85.6], [-36.8, -94.4], [-34, -103.6], [-30.8, -113.4],
  [-29.4, -124], [-30.8, -132], [-27.4, -138.6], [-20.6, -142.6], [-12.9, -144], [-4.4, -142.6], [2.6, -139.4]]), [21.4, -86.4], [-29.4, -70.4],
[{ len: 1.2, w: 0.9, lean: 0.25 }, { len: 0.9, w: 1.2, lean: 0.05 }, { len: 1.3, w: 2.1, lean: -0.05 }, { len: 0.9, w: 1.1, lean: -0.2 }], 0.45,
(tip, root, notches) => earClumps.push({ tip, root, notches })), [-30.4, -134], [-6.4, -143],
[{ len: 0.9, w: 1, lean: -0.4 }, { len: 1.2, w: 1.1, lean: -0.35 }, { len: 0.8, w: 0.9, lean: -0.3 }, { len: 1.1, w: 1.1, lean: -0.25 }, { len: 0.7, w: 0.8, lean: -0.2 }], 0.35);

// The head: the muzzle's profile from the upper lip's front (x -95.2 at y
// -85.6) down to the lip's notch (x -92.8 at y -80.2), the chin and the jaw
// sweeping back to the collar's front end; up from the lip round the nose's
// front, where the nose's own edge is the profile's tip (the nose, clipped to
// the head, fills it to its edge), and from the nose's top into the short
// bridge, the stop (x -85 at y -104.4) and the forehead rising into
// the crown's fur; over the crown under the topknot, down its back past a last
// small lock above the ear (x 3 at y -143), and behind the ear and along the
// collar's top, hidden.
/** Each forehead lock's tip, its root and its notches (path order), for the hook drawn into it. */
const foreLocks: { tip: P; root: P; notches: [P, P] }[] = [];
const noteLock = (tip: P, root: P, notches: [P, P]) => foreLocks.push({ tip, root, notches });
const head = furEdge(furEdge(smooth([[-59.8, -58.4], [-70, -62.2], [-80.4, -65.6], [-91.8, -76.2], [-92.8, -80.2], [-95.2, -85.6], [-96.6, -92.2],
  [-96, -97.2], [-92.4, -100.3], [-85, -104.4], [-84, -112.6], [-81, -124.4], [-77.8, -132.6], [-74, -140.2], [-69, -146.4], [-62.6, -151.4],
  [-20, -155.8], [-4, -149], [10, -131], [17, -110], [14, -78], [-28, -63.8], [-44, -60.6]]), [-80.9, -127], [-65.8, -149.6],
// The forehead's fur breaks into two locks below the topknot, their tips combed forward and hooking back in under
// themselves, as the sheet draws them.
[{ len: 1.4, w: 1, lean: -0.45 }, { len: 1.8, w: 1.2, lean: -0.5 }], 0.3, noteLock),
// Down the back of the head, between the topknot and the ear's top, one small lock, its tip hooking in, as the sheet draws it.
[-1.6, -147.6], [5, -138.6], [{ len: 1.1, w: 1, lean: -0.35 }], 0.32, noteLock);

// The topknot (tuft): three fur locks on the crown, front to back, as the
// sheet draws them: a low one over the forehead, its tip combed forward (x
// -59.8 at y -155.2) and hooking back under itself; the tall middle one, a
// round dome (the head's top, x -37.7) whose front curls in on itself; and a
// lower one at the back whose tip hooks back in (x -6.4 at y -153). Each notch
// between them is a soft dip; its foot lies on the crown, feathered.
const TUFT_NOTCHES = [6, 16];
const tuft = furSpan(smooth([[-63, -150.6], [-61.8, -153.4], [-59.8, -155.2], [-57.4, -156.4], [-54, -156.9], [-50.6, -156.6], [-47.6, -156.2], [-45.2, -158],
  [-43.2, -161.4], [-40.6, -163.6], [-37.4, -164.5], [-33.8, -164.2], [-30.2, -163.2], [-27, -161.4], [-24.4, -159], [-22.6, -157], [-21, -156.4], [-16.6, -156.8],
  [-11.6, -156.4], [-7.8, -155], [-5.6, -152.6], [-6.2, -149.8], [-22, -147], [-56, -146.6]], { corners: TUFT_NOTCHES }), [-63, -150.6], [-5.6, -152.6]);

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
// The saddle's left half: a soft-edged blob on the back, its front end below
// the topline just behind the ear's foot (x -13), lying along the topline from
// x 0 down the back to above the rump (x 14),
// its lower edge dipping lowest under its front half (y -39 at x 0) and
// rounding up to the topline at each end, as the sheet paints it; typed with
// bleed above the topline, which the back body's clip takes off.
const saddle = smooth([[-12.8, -57.4], [-7, -59.2], [-1, -58.8], [4, -56.6], [10.6, -48.6], [16.6, -39.4], [15.4, -35.6], [11, -36.2], [5.4, -37.4], [0, -38.8],
  [-5, -40.4], [-9.8, -43.6], [-12.6, -48], [-13.6, -53.4]]);
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
  // The topline and the rump in the warm line the sheet draws round the back (#9C673F to #A86C47 at its core), along
  // the underside in the paws' line, and up the haunch's front a fainter line that fades out upward, as the sheet draws
  // it.
  outline: { ...OUTLINE, colour: C.haunchLine, width: 1.3, taper: 6, spans: [
    { from: [-11, -62.4], to: [16.6, -33.6], colour: C.warmLine },
    { from: [15.2, -37.6], to: [12, -4.6], width: 1.4, colour: C.warmLine },
    { from: [14.6, -6.6], to: [-6, -1.6], width: 1.4, colour: C.pawLine },
    { from: [-27.6, -13], to: [-22, -29.4], width: 1.25 },
  ] },
};

const chestPaint: Paint = {
  fill: C.fur,
  // In shade under the collar, and deep warm shade on the belly between the paws, as the sheet paints it there.
  shade: furShade(bodyGroup, ["M-60 -54 C-48 -48 -32 -48 -20 -54 L-20 -60 L-60 -60Z"]),
  under: belly(),
  // Only its front edge between the tag's foot and the near leg shows, a line as the sheet draws it over the far leg.
  outline: { ...OUTLINE, colour: C.softLine, width: THIN, taper: 3, spans: [{ from: [-55.8, -25], to: [-62.8, -34] }] },
};

/**
 * The belly between the front paw's heel and the hind paw, in deep warm shade, as the sheet paints it (#D39870):
 * a wedge rising from the ground to a point by the haunch's front, its top fading out.
 */
function belly(): string {
  const g = uid("belly"), f = uid("blur");
  const d = pathD(smooth([[-37, -2], [-35.4, -8], [-31.6, -14.4], [-27, -18.6], [-25.6, -16], [-27.6, -9], [-28.6, -2]], { corners: [0, 6] }).segs);
  return `<defs><linearGradient id="${g}" gradientUnits="userSpaceOnUse" x1="0" y1="-19" x2="0" y2="-3">` +
    `<stop offset="0" stop-color="${C.marking}" stop-opacity="0.1"/><stop offset="0.5" stop-color="${C.marking}" stop-opacity="0.4"/>` +
    `<stop offset="1" stop-color="${C.marking}" stop-opacity="0.7"/></linearGradient>${blur(f, [-42, -24, 20, 26], 0.8)}</defs>` +
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
    // Two toe lines rising from the sole at the paw's front, about 6 pt up, as the sheet draws them; and its back edge, a
    // faint soft line on the chest's fur.
    inner: [...[[[-61, -2.2], [-61.5, -4.4], [-61.4, -6.6], [-60.8, -8.4]], [[-54.2, -1], [-54.5, -3.2], [-54.4, -5.6], [-53.8, -7.6]]]
      .map((pts) => ({ pts: pts as P[], width: 0.8, colour: `url(#${toe})` })),
      { pts: [[-36.2, -13], [-37, -19.6], [-38.6, -26.4], [-40.4, -31]], width: 0.75, colour: C.softLine, opacity: 0.5 }],
    // Its front comes out of the chest faint and deepens to the paw's line at the wrist; round the toe end and along the
    // sole to the heel, the paw's line.
    outline: { ...OUTLINE, colour: C.pawLine, width: 1.35, taper: 5, spans: [
      { from: [-54, -32.4], to: [-60, -15.4], width: THIN, colour: `url(#${fade})` },
      { from: [-58.6, -16.4], to: [-35.6, -6.4], width: 1.4, colour: C.outline },
    ] },
    // Its top fades in on the chest, so it comes out of the chest's fur with no edge.
    feather: { from: [-44, -42], to: [-46, -36] },
  };
}

function legFarPaint(): Paint {
  return {
    fill: C.farFur,
    // In shade under the chest and the tag, where it comes out from behind them, as the sheet paints the wedge.
    shade: { multiply: C.furShadeBy, rim: { inset: 2, toLight: 3 }, shapes: ["M-66 -40 L-56 -40 L-56 -22 C-60 -21 -64 -22 -67 -23Z"], blur: 2 },
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
      { from: [-29.8, -13.4], to: [-11.4, -15.6], width: THIN, colour: C.softLine },
      { from: [-10.6, -1.6], to: [-29.6, -12.2], colour: C.outline },
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
  // Each lock's tip hooks back in under itself, a hair stroke in the crown's line running back along the lock's
  // underside, as the sheet draws them (its "<" under each tip).
  inner: foreLocks.map(({ tip, root, notches }) => {
    const into = v.norm(v.sub(root, tip)), up = v.norm(v.sub(notches[1], notches[0]));
    const at = (a: number, b: number): P => v.add(tip, v.add(v.mul(into, a), v.mul(up, b)));
    return { pts: [at(0.15, 0), at(1.3, -0.55), at(2.7, -0.75), at(4, -0.45)], width: 0.85, colour: C.puffLine };
  }),
};

/**
 * The head's line, where the sheet draws one, in one warm brown: up from the nose's top, the bridge and the stop in
 * the outline's brown, warming into the crown's line up the forehead, unbroken over its locks and on in under the
 * topknot; down the back of the head from under the topknot to the ear's top, the same line; the chin and the jaw
 * in the fur line (the sheet's #A9876C at its core), from just under the lip's notch, so the chin's line starts
 * again below where the smile turns in, as the sheet draws it. Round the nose's front the nose's own near-black
 * (noseEdge), and the lip's line from the nose down to the smile is the mouth's own (mouth). The crown's line is
 * the puffs' warm line (`puffLine`, #A77A58 against the sheet's #AC835F), where the front's crown is lighter. Along
 * the collar's top, under the chin's fur, the collar's own contact rim (collarContact).
 */
const headLine = (warming: string): Outline => ({ ...OUTLINE, taper: 4, blur: 0.15, spans: [
  { from: [-88.8, -100.6], to: [-54, -153.4], width: 1.25, colour: `url(#${warming})` },
  { from: [-14, -154], to: [6.6, -136.4], width: 1.25, colour: C.puffLine },
  { from: [-61, -59], to: [-92.5, -79.4], width: 1.3, colour: C.furLine },
] });
/**
 * Round the nose's front, where the nose is the head's edge, a line in the nose's own near-black, so the stencil's
 * hard edge is covered and the nose has no rim of any other colour, as the sheet draws it.
 */
const noseEdge: Outline = { colour: C.eyeDark, width: THIN, taper: 1.5, blur: 0.15, spans: [{ from: [-95.4, -90.4], to: [-91.4, -100.3] }] };

function headLinePiece(): Piece {
  const f = uid("blur"), g = uid("line");
  const line = headLine(g), r = ribbons(head, line, "head.line", 0.5), n = ribbons(head, noseEdge, "head.line", 0.5);
  const [x0, y0, x1, y1] = bbox(head.segs);
  const box = pad([x0, y0, x1 - x0, y1 - y0], 2);
  // The bridge's outline brown warms into the crown's line above the stop.
  const warm = `<linearGradient id="${g}" gradientUnits="userSpaceOnUse" x1="0" y1="-104" x2="0" y2="-118">` +
    `<stop offset="0" stop-color="${C.outline}"/><stop offset="1" stop-color="${C.puffLine}"/></linearGradient>`;
  return piece(`<defs>${blur(f, pad(box, 2), 0.15)}${warm}</defs><g fill="${line.colour}" filter="url(#${f})">${r.svg}</g><g fill="${noseEdge.colour}" filter="url(#${f})">${n.svg}</g>`, box, {
    shapes: [{ name: "head.line", nodes: head.typed, segs: head.segs, outlined: [...r.outlined, ...n.outlined], fur: head.fur.map(([a, b]) => [fracAt(head, a), fracAt(head, b)]) }],
    lines: [...r.lines, ...n.lines],
  });
}

/**
 * The near eye in profile, as the side turnaround paints it: a tall oval iris (11.2 by 21 pt) leaning 6° back at its
 * top, near-black over its upper half and glowing smoothly down into a warm brown at its foot, with no step, inside
 * a slightly darker rim; behind it, toward the ear, a thin crescent of white, narrow at the top and widest at its
 * lower back, where it cools into a soft pale blue-grey shade; the lid line sitting right on the iris's top and
 * running round its back, heaviest along the top and the back corner and tapering away down the back; a faint pale
 * halo round the iris's foot and front; and one catchlight high on its front, toward the nose, as the sheet draws it
 * (Q26's default: the side crop shows one).
 */
function eye(): Piece {
  // The iris as the sheet's dark oval measures (its extremes x -73.4 to -62, y -110.8 to -89.7).
  const c: P = [-67.7, -100.2], rx = 5.6, ry = 10.5, lean = 6;
  const iris = pathD(ellipse(c, rx, ry, lean));
  const clip = uid("eye"), glow = uid("glow"), cool = uid("cool"), shine = uid("blur"), edge = uid("blur"), white = uid("blur"), core = uid("blur"), halo = uid("blur"), rimSoft = uid("blur");
  const box: Box = [c[0] - 10, c[1] - 15, 24, 30];
  /** A point on the iris's oval at an angle (degrees, 0 toward the back, 90 down), grown by `grow`. */
  const on = (deg: number, grow = 0): P => {
    const a = (deg * Math.PI) / 180, t = (lean * Math.PI) / 180;
    const x = (rx + grow) * Math.cos(a), y = (ry + grow) * Math.sin(a);
    return [c[0] + x * Math.cos(t) - y * Math.sin(t), c[1] + x * Math.sin(t) + y * Math.cos(t)];
  };
  // The white: from the iris's top round its back, just inside the lid line, down to its lower back, where it is widest.
  const whiteShape = smooth([on(-100), [-63.8, -109.4], [-61.2, -107.4], [-59.8, -105.2], [-58.8, -102.2], [-58.4, -99.2], [-58.6, -96.2], [-59.4, -93.4],
    [-60.8, -91.4], [-62.8, -90.4], on(55), on(0), on(-50)], { corners: [0, 10] });
  // The lid: along the iris's top from its front and round its back to its lower back; a heavier stroke along the top
  // and the back corner over it.
  const lidArc = smooth([on(-150, 0.1), on(-118, 0.25), on(-92, 0.35), [-63.9, -109.9], [-61, -108], [-59.3, -105.6], [-58.1, -102.4], [-57.6, -99.2], [-57.7, -96.2],
    [-58.4, -94]], { closed: false });
  const topArc = smooth([on(-140, 0.2), on(-110, 0.35), on(-88, 0.4), [-63.9, -110], [-61, -108.1], [-59.4, -105.6]], { closed: false });
  const lid = tapered(sample(lidArc.segs, 10, false), 1.3, "outer", "eye lid", { taper: 7, tip: 0.25 });
  const lidTop = tapered(sample(topArc.segs, 10, false), 1.8, "outer", "eye lid", { taper: 4, tip: 0.6 });
  // A faint pale halo just outside the rim round the iris's foot and front, between the eye and the fur, as the sheet paints it.
  const ring = strokeOf(Array.from({ length: 25 }, (_, k) => on(95 + (k * 120) / 24, 1.1)), 1.6, { taper: 5, tip: 0.2 });
  // The iris's own darker rim, round its front, foot and back, inside its edge.
  const rim = tapered(Array.from({ length: 31 }, (_, k) => on(-160 + (k * 250) / 30, -0.35)), 0.8, "inner", "eye rim", { taper: 5, tip: 0.3 });
  const big = on(-128, -2.7);
  const n = (p: P) => `${fmt(p[0])}" cy="${fmt(p[1])}`;
  const [tx, ty] = on(-90), [bx, by] = on(90);
  const svg = `<defs><clipPath id="${clip}"><path d="${iris}"/></clipPath>` +
    // Down the iris's own axis: near-black over its upper half, glowing smoothly into the printed lower iris's warm dark
    // brown and, at its foot, the warm light low in the iris.
    `<linearGradient id="${glow}" gradientUnits="userSpaceOnUse" x1="${fmt(tx)}" y1="${fmt(ty)}" x2="${fmt(bx)}" y2="${fmt(by)}">` +
    `<stop offset="0.52" stop-color="${C.eyeDark}"/><stop offset="0.78" stop-color="${C.dark}"/><stop offset="0.9" stop-color="${C.dark}"/>` +
    `<stop offset="1" stop-color="${C.irisLight}"/></linearGradient>` +
    `<linearGradient id="${cool}" gradientUnits="userSpaceOnUse" x1="0" y1="-97" x2="0" y2="-90.4">` +
    `<stop offset="0" stop-color="${C.collarHighlight}" stop-opacity="0"/><stop offset="1" stop-color="${C.collarHighlight}" stop-opacity="0.32"/></linearGradient>` +
    `${blur(shine, box, 0.15)}${blur(edge, box, 0.2)}${blur(white, box, 0.3)}${blur(core, box, 0.3)}${blur(halo, box, 0.55)}${blur(rimSoft, box, 0.45)}</defs>` +
    `<path d="${ring.d}" fill="${C.fur}" opacity="0.8" filter="url(#${halo})"/>` +
    `<g filter="url(#${white})"><path d="${pathD(whiteShape.segs)}" fill="${C.eyeWhite}"/><path d="${pathD(whiteShape.segs)}" fill="url(#${cool})"/></g>` +
    `<g filter="url(#${edge})"><path d="${iris}" fill="url(#${glow})"/></g>` +
    `<g clip-path="url(#${clip})"><path d="${rim.d}" fill="${C.eyeDark}" opacity="0.7" filter="url(#${rimSoft})"/></g>` +
    `<g filter="url(#${edge})"><path d="${lid.d}" fill="${C.eyeDark}"/><path d="${lidTop.d}" fill="${C.eyeDark}"/></g>` +
    `<ellipse cx="${n(big)}" rx="1.55" ry="1.5" fill="${C.light}" filter="url(#${shine})"/>` +
    `<ellipse cx="${n(big)}" rx="0.6" ry="0.55" fill="${C.dark}" opacity="0.1" filter="url(#${core})"/>`;
  return piece(svg, box, { shapes: [], lines: [lid.line, lidTop.line, rim.line] });
}

/** The brow: a short, thick, rounded dab of tan above the hood, domed, its back end lower, soft at its edges (the front's recipe). */
function brow(): Piece {
  const pts: P[] = [[-62, -129.8], [-59.6, -131.3], [-57, -131], [-54.9, -128.8]];
  const f = uid("blur"), box: Box = [-66, -136, 16, 12];
  return piece(`<defs>${blur(f, box, 0.35)}</defs><g filter="url(#${f})">` +
    `<path d="${strokeOf(pts, 2.4, { taper: 2.4, tip: 1 }).d}" fill="${C.marking}" opacity="0.85"/></g>`, box);
}

/**
 * The nose at the snout's tip, as the sheet draws it in profile: a near-black egg (8 pt across, 10 pt tall), broad
 * at its top and front and narrowing to its foot, its front the head's own edge, a touch past it so it fills the
 * head's clip to its edge; a soft grey-brown sheen across its upper middle, as the front's.
 */
const noseShape = smooth([[-93, -100.3], [-90.6, -99.6], [-89.2, -98], [-88.8, -95.8], [-89.6, -93.4], [-91.4, -91.4], [-93.4, -90.2], [-95.4, -90.1],
  [-96.6, -92], [-97, -94.6], [-96.2, -97.8], [-94.8, -99.6]]);
function nose(): Piece {
  const f = uid("blur"), e = uid("blur"), box: Box = [-99, -103, 12, 16];
  // Its edge a touch soft, as the sheet's, so it does not read as cut out.
  return piece(`<defs>${blur(f, box, 0.7)}${blur(e, box, 0.15)}</defs><path d="${pathD(noseShape.segs)}" fill="${C.eyeDark}" filter="url(#${e})"/>` +
    `<ellipse cx="-92.4" cy="-97.4" rx="2.3" ry="1.05" transform="rotate(-16 -92.4 -97.4)" fill="${C.noseSheen}" opacity="0.8" filter="url(#${f})"/>`, box);
}

/**
 * The lip and the closed smile in profile, as the side turnaround draws them: one line that drops from the nose's
 * foot down the upper lip's front (the head's edge there) and turns in at the lip's notch into the smile, a shallow
 * curve back along the muzzle that ends in a small upturned curl at the corner (mouth.L). The lip's part is an outer
 * line on the head's edge, tapering into the notch; the smile is an inner line growing out of it. Both are the
 * printed dark brown, seen through 90% of itself, as the sheet's soft grey-brown (#705F4F to #584B45 at its core),
 * lighter than the front's open lip.
 */
function mouth(): Piece {
  const lipPts = sample(smooth([[-95.9, -90.4], [-96, -88.4], [-95.6, -86], [-94.8, -83.4], [-93.6, -81.4], [-92.5, -80.5]], { closed: false }).segs, 8, false);
  const smilePts = sample(smooth([[-93.2, -80.7], [-91.6, -79.9], [-89.6, -79.5], [-87.6, -79.6], [-86, -80.1], [-84.9, -80.9], [-84.4, -82.2]], { closed: false }).segs, 8, false);
  const lip = tapered(lipPts, 1.2, "outer", "upper lip", { taper: 2.6, tip: 0.5 });
  const smile = tapered(smilePts, 0.9, "inner", "smile", { taper: 1, tip: 0.5 });
  const f = uid("blur"), box: Box = [-98, -93, 16, 15];
  return piece(`<defs>${blur(f, box, 0.12)}</defs><g fill="${C.dark}" opacity="0.9" filter="url(#${f})"><path d="${lip.d}"/><path d="${smile.d}"/></g>`, box,
    { shapes: [], lines: [lip.line, smile.line] });
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
    inner: [{ pts: emboss, width: 0.7, colour: C.tagLine, opacity: 0.4 }],
    outline: { colour: C.tagLine, width: 1.3, taper: 2, blur: 0.2 },
  }));
}

/**
 * The ear's paint (the front's recipe, turned), matte, as the sheet paints it: the tan deepening down the ear to a
 * browner tan at its foot and along its back, under the fur's own warm shade; its top the tan itself, a little
 * lighter toward the front, feathered into the crown's fur; a few fine darker strands running down its length and
 * curving with its round, and a few lighter ones between them; the fold where it turns over the back of the head, a
 * soft darker crease (the sheet's #A76640 there), with no light streak; a short parting up from each notch of its
 * foot. Its line runs on its front from under the patch's tan down, in the ears' deep warm brown, as the side crop
 * draws it (#A15E33 there), and round its foot and up its back in the warm line, the browner brown the crop draws
 * there (#936242 to #9C603C); its top has none.
 */
function earPaint(): Paint {
  const deep = uid("deep"), top = uid("top"), parting = uid("blur"), along = uid("blur"), crisp = uid("blur"), [ex0, ey0, ex1, ey1] = bbox(ear.segs);
  const earBox = pad([ex0, ey0, ex1 - ex0, ey1 - ey0], 2);
  const light: P[][] = [[[-10, -112], [-10.6, -98], [-9.4, -84]], [[-21.4, -110], [-23, -98], [-22.6, -86]]];
  const softStrokes = (pts: P[][], width: number) => pts.map((l) => strokeOf(sample(smooth(l, { closed: false }).segs, 8, false), width, { taper: 6, tip: 0.2 }).d).join("");
  const crease = strokeOf(sample(smooth([[-3, -134.6], [1.6, -130.6], [6.8, -124.4], [11.4, -118.4], [15, -112.4], [17.6, -106.6], [18.8, -102.6]], { closed: false }).segs, 8, false),
    1.1, { taper: 6, tip: 0.2 }).d;
  const under = `<defs><linearGradient id="${deep}" gradientUnits="userSpaceOnUse" x1="-14" y1="-120" x2="-4" y2="-64">` +
    `<stop offset="0" stop-color="${C.earDeep}" stop-opacity="0"/><stop offset="0.45" stop-color="${C.earDeep}" stop-opacity="0.8"/>` +
    `<stop offset="0.8" stop-color="${C.earDeeper}"/><stop offset="1" stop-color="${C.earLow}"/></linearGradient>` +
    // Its top a little lighter toward the front, the head patch's paler tan, where it comes out from under the crown's fur.
    `<linearGradient id="${top}" gradientUnits="userSpaceOnUse" x1="-6" y1="-146" x2="6" y2="-120">` +
    `<stop offset="0.1" stop-color="${C.patch}" stop-opacity="0.35"/><stop offset="1" stop-color="${C.patch}" stop-opacity="0"/></linearGradient>` +
    `${blur(parting, earBox, 0.8)}${blur(along, earBox, 1.1)}${blur(crisp, earBox, 0.4)}</defs>` +
    `<rect x="${fmt(ex0)}" y="${fmt(ey0)}" width="${fmt(ex1 - ex0)}" height="${fmt(ey1 - ey0)}" fill="url(#${deep})"/>` +
    `<rect x="${fmt(ex0)}" y="${fmt(ey0)}" width="${fmt(ex1 - ex0)}" height="${fmt(ey1 - ey0)}" fill="url(#${top})"/>` +
    `<path d="${softStrokes(light, 2.2)}" fill="${C.patch}" opacity="0.22" filter="url(#${along})"/>` +
    `<path d="${crease}" fill="${C.earLine}" opacity="0.6" filter="url(#${crisp})"/>`;
  const strand = uid("strand"), hair = uid("strand");
  const strands = `<defs><linearGradient id="${strand}" gradientUnits="userSpaceOnUse" x1="0" y1="-64" x2="0" y2="-72">` +
    `<stop offset="0" stop-color="${C.earLine}" stop-opacity="0.6"/><stop offset="1" stop-color="${C.earLine}" stop-opacity="0"/></linearGradient>` +
    // The strands down its length fade in from nothing at their tops and out again just above the foot.
    `<linearGradient id="${hair}" gradientUnits="userSpaceOnUse" x1="0" y1="-106" x2="0" y2="-68">` +
    `<stop offset="0" stop-color="${C.earLine}" stop-opacity="0"/><stop offset="0.55" stop-color="${C.earLine}" stop-opacity="0.26"/>` +
    `<stop offset="1" stop-color="${C.earLine}" stop-opacity="0.08"/></linearGradient></defs>`;
  // Uneven, as the sheet paints them: two close together under the ear's middle, one short low at its front, one long
  // toward its back.
  const hairs: P[][] = [[[-26.8, -92], [-27.8, -82], [-26.8, -74]], [[-17.8, -98], [-18.2, -86], [-16.8, -75], [-15.4, -69]],
    [[-13.4, -94], [-13.6, -84], [-12.6, -74]], [[2.4, -104], [3.6, -91], [3.4, -78], [2.2, -70]], [[12.4, -92], [13.2, -84], [12.4, -77]]];
  return {
    fill: C.marking,
    under: under + strands,
    inner: [
      // A short crease up from each notch between the foot's clumps, fading out upward, as the sheet draws them.
      ...earClumps.slice(1).map(({ notches }) => {
        const n = notches[0];
        return { pts: [n, [n[0] + 0.3, n[1] - 2.6], [n[0] + 0.2, n[1] - 5]] as P[], width: 0.7, colour: `url(#${strand})` };
      }),
      ...hairs.map((pts) => ({ pts: sample(smooth(pts, { closed: false }).segs, 8, false), width: 0.65, colour: `url(#${hair})` })),
    ],
    // Its back, away from the light, and its foot.
    shade: { multiply: C.furShadeBy, rim: { inset: 2.4, toLight: 4 }, shapes: ["M-6 -142 C4 -136 11 -126 15.6 -114 C18 -106 22 -96 22 -82 L30 -82 L30 -142Z"], keep: ["M-40 -72 C-20 -70 0 -70 16 -76 L16 -56 L-40 -56Z"], blur: 3.2 },
    // A broad soft light down its front shoulder, from the top left.
    highlight: { d: "M-31 -110 C-31 -124 -25 -136 -13 -139 C-19 -132 -24 -122 -26.6 -108 C-28.6 -104 -31 -105 -31 -110Z", colour: C.patch, opacity: 0.22, blur: 3 },
    outline: { ...OUTLINE, colour: C.warmLine, width: 1.3, taper: 6, blur: 0.25, spans: [
      { from: [4.6, -136.6], to: [-30.4, -72], colour: C.warmLine },
      { from: [-26.4, -67.6], to: [-30.6, -121], colour: C.earLine },
    ] },
    feather: { from: [-12, -145.6], to: [-12, -140.6] },
  };
}

/**
 * Where the chin's fur lies on the collar, as the sheet paints it (the front's recipe): the collar's dark rim right
 * under the fur's edge and a soft shade of the band's own blue under that, drawn centred on the head's own edge from the
 * jaw's meeting with the collar's front back to under the ear, so only its lower half shows below the fur.
 */
function collarContact(): string {
  const f = uid("blur"), g = uid("blur");
  const chin = spanPoints(head, fracAt(head, [-36, -62.4]), fracAt(head, [-60.4, -58.6]));
  const rim = strokeOf(chin, 1.8, { taper: 2.5, tip: 0.6 }).d;
  const shade = strokeOf(chin, 4.4, { taper: 4, tip: 1 }).d;
  return `<defs>${blur(f, [-64, -68, 32, 14], 0.3)}${blur(g, [-64, -68, 32, 14], 0.9)}</defs>` +
    `<path d="${shade}" fill="${C.collarLine}" opacity="0.4" filter="url(#${g})"/><path d="${rim}" fill="${C.collarRim}" opacity="0.85" filter="url(#${f})"/>`;
}

export function side(): Drawn[] {
  const out: Drawn[] = [];
  const add = (name: string, p: Piece, state?: string) => out.push({ part: name, piece: p, ...(state ? { state } : {}) });
  // The ground shadow: a wide soft warm oval under the dog, densest under its paws and the haunch, as the sheet paints it.
  add("shadow", join(soft("M-80 -1.4 a64 4.2 0 1 0 128 0 a64 4.2 0 1 0 -128 0Z", [-80, -5.6, 128, 8.4], C.shadow, 2.4, 0.75),
    soft("M-70 0 a40 2.2 0 1 0 80 0 a40 2.2 0 1 0 -80 0Z", [-70, -2.2, 80, 4.4], C.shadow, 1.8, 0.5),
    ...([[-50, 13], [-20, 11], [6, 10], [-68.6, 7]] as [number, number][]).map(([x, rx]) =>
      soft(`M${x - rx} -0.4 a${rx} 1.6 0 1 0 ${2 * rx} 0 a${rx} 1.6 0 1 0 ${-2 * rx} 0Z`, [x - rx, -2, 2 * rx, 3.2], C.contact, 1.2, 0.45))));
  add("tail", part("tail", tail, tailPaint));
  add("tail.base", marking("tail.base", { shape: tail, paint: tailPaint }, tailBase, { fill: C.marking, blur: 1.3, clip: true }));
  add("front.R", part("front.R", legFar, legFarPaint()));
  add("body.front", roomy(part("body.front", chest, chestPaint), 1));
  add("body.back", roomy(part("body.back", back, backPaint), 1));
  add("back.patch.L", marking("back.patch.L", { shape: back, paint: backPaint }, saddle, { fill: C.marking, blur: 0.7, clip: true }));
  add("rump.patch.L", marking("rump.patch.L", { shape: back, paint: backPaint }, rump, { fill: C.marking, blur: 1.4, clip: true, fade: rumpFade }));
  add("hind.L", roomy(part("hind.L", hindNear, hindPaint()), 6));
  add("front.L", roomy(part("front.L", legNear, legNearPaint()), 1));
  add("collar", part("collar", collar, {
    fill: C.collar,
    // Its lower half in shade, lit along its middle, a dark blue rim round its foot, as the front's.
    shade: { multiply: C.shadeBy, shapes: ["M-64 -53 C-50 -48 -32 -50 -16 -58 L-16 -46 L-64 -46Z"], blur: 0.9 },
    highlight: { d: "M-58 -56.6 C-46 -57 -32 -59 -21 -62 L-21 -60 C-32 -57 -46 -55 -58 -54.6Z", colour: C.collarHighlight, opacity: 0.3, blur: 0.9 },
    under: `<rect x="-61" y="-59.6" width="4" height="10" rx="1.2" fill="${C.collarLine}" opacity="0.3"/>` + collarContact(),
    outline: { colour: C.collarRim, width: THIN, taper: 3, blur: 0.2, spans: [{ from: [-19, -61.2], to: [-61.6, -56] }] },
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
    // The locks' hooks, as the sheet draws them: under the front lock's tip, back along its underside; the middle
    // dome's front curling down and in on itself; under the back lock's tip, back along its underside.
    inner: [
      { pts: [[-59.6, -154.8], [-58, -153.4], [-55.6, -152.3], [-52.8, -151.8]], width: 0.85, colour: C.puffLine },
      { pts: [[-42.6, -161.2], [-43.2, -158.8], [-42, -156.6], [-39.4, -155.3], [-36.4, -154.9]], width: 0.85, colour: C.puffLine },
      { pts: [[-5.9, -152.6], [-7.6, -151.4], [-10.2, -151], [-13.2, -151.2]], width: 0.85, colour: C.puffLine },
    ],
    // One line over the three locks, unbroken, tapering only at its two ends, where it runs on into the head's line.
    outline: { ...OUTLINE, colour: C.puffLine, width: 1.25, taper: 1.6, spans: [{ from: [-63, -150.6], to: [-5.8, -151.6] }] },
    feather: { from: [0, -146.4], to: [0, -150.4] },
  }));
  return out;
}

/**
 * Points the sheet has no finder for, where this drawing puts them (dev output for the sheet match), each measured on
 * the drawing as phase 2 measured it on the sheet (refmap/landmarks.json, DECISIONS 11; DECISIONS 40).
 */
export const landmarks: Record<string, P> = {
  // The near front paw: midway along it as phase 2 boxed it, from its toe end (x -64.8) on over the belly's shade to the
  // hind paw's toe (x -30.6), and from its toe lines' top (y -8) to its sole (y -0.6).
  "paw.front.L": [-47.7, -4.3],
  // The far front paw: only its toe end shows, so the centre of what shows, from its toe end (x -75) to the near paw's
  // front (x -64) and from its top (y -20.2) to its sole (y -4.8).
  "paw.front.R": [-69.5, -12.5],
  // The hind paw: from its toe end (x -30.6) to where its top line fades (x -11), and from its toe lines' top (y -7.9)
  // to its sole (y -0.8).
  "paw.hind.L": [-20.8, -4.35],
  // The ring's top, where it rests on the collar: the tag's pivot (rig.json).
  "tag.ring": [-59.1, -58.3],
  // The seat: the middle of the haunch's underside, 1 pt inside it (DECISIONS 9).
  seat: [0, -3],
};
