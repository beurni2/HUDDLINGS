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
import { LIMITS, reach } from "../../../draw/lint.ts";
import { marking, part, soft, type Fade, type Paint } from "../../../draw/paint.ts";
import { blur, join, mask, pad, piece, region, uid, type Box, type Piece } from "../../../draw/svg.ts";
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
// ground behind the hind paw, then up the thigh's front, one round arc that
// sweeps up and back from behind the hind paw's top (x -28.8 at y -14.6) to
// under the saddle (x -20.4 at y -35.6), as the sheet draws it; above that it
// runs on up under the chest to the collar, hidden.
const back = smooth([[-30, -62.8], [-20, -63.6], [-11.6, -62.6], [-4, -59.4], [2.6, -54.6], [8, -49.2], [12.4, -43], [16.2, -34.8], [18.6, -27.8],
  [19.4, -21], [18.8, -15.4], [17.2, -10.8], [14.6, -6.6], [10.6, -3.6], [4, -2], [-24, -1.6], [-28.6, -3.6], [-29.2, -9],
  [-28.8, -14.6], [-27.6, -20], [-25.6, -25.6], [-23, -31], [-20.4, -35.6], [-26, -46]]);

// The chest (body.front): from under the chin and the collar down its front,
// hidden behind the tag, to the tag's foot (x -63.6 at y -35.2), where its edge
// shows for a short way, slanting back over the far leg to meet the near leg's
// front (x -55.8 at y -25), as the sheet draws it; behind the near leg down to
// the belly between the paws; its back reaches well in under the back body, so
// the hips can turn without opening a gap.
const chest = smooth([[-61.8, -50], [-60.6, -58.6], [-50, -64.8], [-36, -66], [-22, -64.4], [-12.4, -60.4], [-5.6, -53.6], [-4, -44], [-7.6, -32], [-16, -20],
  [-26.6, -10.6], [-29.8, -4.4], [-34, -2.6], [-44, -2.4], [-53, -3.6], [-55.4, -12], [-55.2, -22.4], [-55.8, -25], [-59.8, -29.6], [-63.6, -35.2], [-63.2, -42]]);

// The near front leg (front.L): it comes out of the chest at the wrist (x
// -55.8 at y -25), where the chest's edge over the far leg meets it, and swells
// forward at once into a round bun of a paw, its top-front arching out from the
// wrist (x -59.8 at y -19.2) round a domed toe end (x -64.8 at y -8.6), its
// sole on the ground from x -63 to the heel at x -35.6, which turns up round
// into the belly's shade; its back edge lies on the chest with no line, and its
// top, hidden in the chest's fur, is feathered.
const legNear = smooth([[-45, -44], [-52.4, -40.4], [-54, -32.4], [-55.8, -25], [-57.4, -21.6], [-59.8, -19.2], [-62.4, -16.6], [-64.2, -13], [-64.8, -8.6],
  [-63.6, -5], [-60.6, -2.6], [-55.4, -1], [-49.6, -0.6], [-44.6, -0.9], [-41, -1.6], [-37.8, -3.2], [-36, -6.6], [-35.4, -10.6], [-36.4, -20],
  [-38.6, -32], [-41, -41]]);

// The far front leg (front.R): only its front shows, a wedge from the tag's
// foot (x -63.6 at y -35.2) widening down to a round bun of a paw that sits a
// little ahead of the near one and higher, its top bulging out from the leg (x
// -71.6 at y -18.6) round a domed toe end (x -75) to its sole at y -4.6; the
// rest lies behind the chest and the near leg, up to its top, hidden, by the
// shoulder both front legs turn at (DECISIONS 38).
const legFar = smooth([[-46, -40], [-53, -45], [-60.4, -42], [-63.6, -35.2], [-66.2, -29.4], [-67.8, -23.8], [-69.4, -20.6], [-71.8, -18.6], [-74, -16],
  [-75, -12], [-74.4, -8.2], [-72.2, -5.6], [-68.4, -4.6], [-61, -4.6], [-57, -8], [-55, -18], [-52.6, -28], [-48.6, -35]]);

// The near hind paw (hind.L): a plump round stub tucked forward under the
// thigh, about as tall as the front paw, its front domed (its toe end x -30.8
// at y -8.4), its top arching up from there into the thigh's front and fading
// by x -21, its back hidden in the haunch, its sole on the ground running on
// into the haunch's underside.
const hindNear = smooth([[-30.8, -8.4], [-30, -12.4], [-27.6, -15.2], [-23.4, -16.6], [-18.6, -16.6], [-14.2, -15], [-11.6, -11.8], [-10.8, -7.4],
  [-12.2, -3.2], [-16, -1.1], [-21, -0.7], [-25.6, -0.9], [-28.6, -2.2], [-30.4, -4.8]]);

// The tail: a fluffy plume behind the rump, its tan root hugging the body from
// y -10 to -35, its front contour rising from the rump to a curl that hooks
// down and back toward the body at its front (x 15.4 at y -53), as the sheet
// draws it; its outline one soft line broken only by a few uneven locks of fur:
// a small one at the top of the curl, a bump where the plume turns down its
// back, a smaller one lower on its back, and a little fringe notch on its
// underside; its root hidden under the rump.
const tail = furSpan(furEdge(furEdge(furEdge(furEdge(smooth([[10, -22], [17.4, -35.2], [19.8, -39.4], [20.8, -43.8], [19.6, -47.6], [17.2, -50.4], [15.4, -53.2],
  [15.8, -56.4], [18.4, -59], [22.4, -60.6], [29, -61.6], [35.8, -59.2], [40.8, -55.2], [44, -50], [46, -42.4], [46.4, -35], [45.4, -28.6], [42.6, -22.8], [37.6, -18],
  [31.4, -13.4], [24.4, -10.6], [16.6, -9.8]]), [20.6, -59.6], [27.2, -61.8], [{ len: 1.5, w: 1, lean: 0.35 }], 0.3),
[41.2, -54.8], [44.8, -48.4], [{ len: 1.3, w: 1, lean: 0.25 }], 0.32), [46.6, -37.4], [45.8, -30], [{ len: 1, w: 1, lean: 0.25 }], 0.34),
[42.2, -22.4], [38.6, -18.8], [{ len: 0.8, w: 1, lean: 0.4 }], 0.3), [17.2, -50.4], [38.6, -18.8]);

// The collar: a band round the neck, almost as thick at its back as at its
// front (10 pt under the chin, 7 pt by the ear), its front end a round turn
// under the jaw (x -62.2) where the band wraps round the throat, its top edge
// rising under the jaw to the ear's foot, its bottom edge rising steeply behind
// the shoulder so its back end goes up square under the ear's foot (hidden
// from x -18), as the sheet draws it.
const collar = smooth([[-62.2, -56], [-61.2, -59.2], [-55.9, -60.5], [-48.8, -61.7], [-41.7, -62.6], [-34.7, -63.6], [-27.6, -64.7], [-22, -65.5], [-17, -66.2],
  [-14.6, -65.6], [-14.8, -63.6], [-17.6, -62.8], [-20.6, -60.8], [-24, -58.7], [-27.6, -57.3], [-34.7, -54.8], [-41.7, -52.7], [-48.8, -51.3], [-55.9, -51.1],
  [-60.2, -52.2]]);

// The tag, a little turned: a round, coin-like heart (12.4 pt wide, 14.4 pt
// tall; the front's is 17.9 wide), the dip between its lobes shallow, its foot
// blunt and round, its left side, where the coin's edge shows, the fuller,
// hanging right under the collar's front from a small ring, as the sheet draws
// it.
const heart = smooth([[-60.4, -51.2], [-62.4, -52], [-64.6, -51.4], [-66.2, -49.4], [-66.8, -46.4], [-66.4, -43], [-65, -40.2], [-62.8, -38.2], [-60.4, -37.6],
  [-58, -38.2], [-56, -40], [-54.8, -42.8], [-54.4, -46], [-54.9, -49.2], [-56.4, -51.2], [-58.4, -52]], { corners: [0] });
// The embossed heart in its middle, a little left of the coin's middle, as a turned coin shows it.
const innerHeart = smooth([[-61.7, -48.2], [-62.9, -49.2], [-64.3, -48.6], [-64.8, -46.6], [-64.1, -44.2], [-61.9, -41.8], [-59.8, -43.8], [-58.9, -46.2], [-59.2, -48.4],
  [-60.4, -49.2]], { corners: [0, 5] });

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
[{ len: 0.6, w: 1, lean: -0.4 }, { len: 0.8, w: 1.1, lean: -0.35 }, { len: 0.5, w: 0.9, lean: -0.3 }, { len: 0.7, w: 1.1, lean: -0.25 }, { len: 0.5, w: 0.8, lean: -0.2 }], 0.3);

// The head: the muzzle's profile from the upper lip's front (x -95.2 at y
// -85.6) down to the lip's notch (x -92.8 at y -80.2), the chin and the jaw
// sweeping back to the collar's front end (x -70 at y -63.8, where the sheet
// draws the jaw's line); up from the lip round the nose's
// front, where the nose's own edge is the profile's tip (the nose, clipped to
// the head, fills it to its edge), and from the nose's top into the short
// bridge, the stop (x -85 at y -104.4) and the forehead rising into
// the crown's fur; over the crown under the topknot, down its back past a last
// small lock above the ear (x 3 at y -143), and behind the ear and along the
// collar's top, hidden.
/** Each forehead lock's tip, its root and its notches (path order), for the hook drawn into it. */
const foreLocks: { tip: P; root: P; notches: [P, P] }[] = [];
const noteLock = (tip: P, root: P, notches: [P, P]) => foreLocks.push({ tip, root, notches });
const head = furEdge(furEdge(smooth([[-60.8, -59.6], [-70, -63.8], [-80.6, -67.4], [-91.8, -76.2], [-92.8, -80.2], [-95.2, -85.6], [-96.6, -92.2],
  [-96, -97.2], [-92.4, -100.3], [-85, -104.4], [-84, -112.6], [-81, -124.4], [-77.8, -132.6], [-74, -140.2], [-69, -146.4], [-62.6, -151.4],
  [-20, -155.8], [-4, -149], [10, -131], [17, -110], [14, -78], [-28, -64.6], [-44, -61.8]]), [-80.9, -127], [-65.8, -149.6],
// The forehead's fur breaks into two locks below the topknot, their tips combed forward and hooking back in under
// themselves, as the sheet draws them.
[{ len: 2.3, w: 1, lean: -0.45 }, { len: 3, w: 1.2, lean: -0.5 }], 0.38, noteLock),
// Down the back of the head, between the topknot and the ear's top, one small lock, its tip hooking in, as the sheet draws it.
[-1.6, -147.6], [5, -138.6], [{ len: 1.1, w: 1, lean: -0.35 }], 0.32, noteLock);

// The topknot (tuft): three fur locks on the crown, front to back, as the
// sheet draws them: a low one over the forehead, its tip combed forward (x
// -59.8 at y -155.2) and hooking back under itself; the tall middle one, a
// round dome (the head's top, x -37.7) whose front curls in on itself; and a
// lower one at the back whose tip hooks back in (x -6.4 at y -153). Each notch
// between them is a soft dip; its foot lies on the crown, feathered.
const TUFT_NOTCHES = [6, 16];
const tuft = furSpan(smooth([[-63, -150.6], [-61.8, -153.4], [-59.8, -155.2], [-57.4, -156.6], [-54.2, -157.2], [-51, -156.4], [-48.4, -154.6], [-46, -157],
  [-43.4, -161.2], [-40.6, -163.6], [-37.4, -164.5], [-33.8, -164.2], [-30.2, -163.2], [-27, -161.4], [-24.4, -159], [-22.6, -157], [-21, -156.4], [-16.6, -156.8],
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
// The saddle's left half, as the sheet paints it: its front end below the
// topline just behind the ear's foot (x -13), lying along the topline from x 0
// down the back to above the rump (x 14), its lower edge dipping lowest under
// its front half (y -40 at x 0) and rounding up to the topline at each end;
// soft but defined, its lower edge breaking into a few uneven locks of fur
// combed back; typed with bleed above the topline, which the back body's clip
// takes off.
const saddle = furEdge(smooth([[-12.8, -57.4], [-7, -59.2], [-1, -58.8], [4, -56.6], [10.6, -48.6], [16.6, -39.4], [15.4, -35.6], [11, -36.2], [5.4, -37.4],
  [0, -38.8], [-5, -40.4], [-9.8, -43.6], [-12.6, -48], [-13.6, -53.4]]), [15, -35.8], [-11.2, -45.6],
[{ len: 1.2, w: 0.9, lean: -0.25 }, { len: 1.9, w: 1.3, lean: -0.3 }, { len: 1.1, w: 0.8, lean: -0.2 }, { len: 1.7, w: 1.2, lean: -0.3 }, { len: 1, w: 0.9, lean: -0.2 }], 0.32);
// The rump's tan spot, where the tail's tan crosses the body's outline at the
// tail's root (x 11.7 to the outline, y -32 to -18), distinct, paling only a
// little away from the outline, as the sheet paints it.
const rump = smooth([[20.4, -33], [22.4, -24], [21.6, -16], [17, -16.6], [13, -19.6], [11.8, -25.6], [13.8, -31.4]]);
const rumpFade: Fade = { from: [14.2, -24], to: [8.6, -24] };
// The tail's tan root: from the rump, where it reaches highest (y -37), its
// upper edge slanting down and back to about x 30 at y -24, and its back edge
// down to the plume's foot, both breaking into streaks combed out along the fur
// away from the rump, the plume above and behind it cream, as the sheet paints
// it; typed with bleed past the tail's edges.
const tailBase = furEdge(smooth([[8, -37], [15.6, -37.4], [20, -36.6], [23.4, -34.4], [26.4, -30.6], [28.8, -26], [30, -21], [29.4, -15.4], [26.4, -10.6], [21, -7],
  [12, -6], [6, -22]]), [19.4, -36.8], [29.8, -17.4],
[{ len: 2, w: 0.6, lean: 0.25 }, { len: 4, w: 1.2, lean: 0.2 }, { len: 1.6, w: 0.5, lean: 0.15 }, { len: 3.2, w: 1, lean: 0.1 }, { len: 2.6, w: 0.8, lean: 0 },
  { len: 1.4, w: 0.5, lean: -0.1 }, { len: 2.8, w: 0.9, lean: -0.15 }], 0.14);

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
  shade: furShade(bodyGroup, ["M-30 -66 L-6 -66 L-8 -55 C-14 -49 -22 -49 -30 -53Z"]),
  // The topline in the warm line the sheet draws round the back (#9C673F to #A86C47 at its core); round the rump the
  // ears' deep warm brown, where the sheet's line runs deeper and more orange beside the tail's tan (#A8622E to
  // #AB673A); along the underside the paws' line; and up the thigh's front one round arc, in the paws' line where it
  // rises from the hind paw's top and on in the haunch's lighter line, tapering out as it sweeps up under the saddle,
  // as the sheet draws it.
  outline: { ...OUTLINE, colour: C.haunchLine, width: 1.3, taper: 6, spans: [
    { from: [-11, -62.4], to: [14.6, -38.6], colour: C.warmLine },
    { from: [12.6, -42.6], to: [12, -4.6], width: 1.45, colour: C.earLine },
    { from: [14.6, -6.6], to: [-6, -1.6], width: 1.4, colour: C.pawLine },
    { from: [-29.2, -7.4], to: [-26.4, -23.4], width: 1.3, colour: C.pawLine },
    { from: [-28.2, -17], to: [-21, -34.6], width: 1.25 },
  ] },
};

/** The chest's edge over the far leg: the paws' line at the wrist, fading lighter up to the tag's foot, as the sheet draws it. */
const chestEdge = (id: string) => `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" y1="-24" x2="0" y2="-35">` +
  `<stop offset="0" stop-color="${C.pawLine}"/><stop offset="1" stop-color="${C.softLine}"/></linearGradient>`;

function chestPaint(): Paint {
  const edge = uid("edge");
  return {
  fill: C.fur,
  // In shade under the collar, a little way down the chest; a soft band of shade in front of the thigh's round, where the belly turns away under
  // it; and deep warm shade on the belly between the paws, as the sheet paints it there.
  shade: furShade(bodyGroup, ["M-62 -52 C-50 -45 -32 -45 -18 -52 L-18 -62 L-62 -62Z",
    "M-30.6 -6 C-31.2 -14 -29.4 -22 -26.6 -28 C-24.8 -32 -22.8 -35 -20.6 -38 L-24.6 -40.4 C-28.2 -35 -31.4 -28.6 -33.4 -21 C-34.6 -15 -34.8 -9 -34.4 -4Z"]),
  under: belly() + `<defs>${chestEdge(edge)}</defs>`,
  // Only its front edge between the tag's foot and the near leg shows, a line as the sheet draws it over the far leg.
  outline: { ...OUTLINE, colour: C.softLine, width: 1.25, taper: 3, spans: [{ from: [-55.8, -25], to: [-62.8, -34], colour: `url(#${edge})` }] },
  };
}

/**
 * The belly between the front paw's heel and the hind paw, in deep warm shade, as the sheet paints it (#C29067 to
 * #AB7B57 low down): a wedge rising from the ground to a point by the haunch's front, deepening toward the ground
 * through the ears' deeper tans, its top fading out.
 */
function belly(): string {
  const g = uid("belly"), f = uid("blur");
  const d = pathD(smooth([[-37, -2], [-35.4, -8], [-31.6, -14.4], [-27, -18.6], [-25.6, -16], [-27.6, -9], [-28.6, -2]], { corners: [0, 6] }).segs);
  return `<defs><linearGradient id="${g}" gradientUnits="userSpaceOnUse" x1="0" y1="-19" x2="0" y2="-3">` +
    `<stop offset="0" stop-color="${C.marking}" stop-opacity="0.2"/><stop offset="0.45" stop-color="${C.earDeep}" stop-opacity="0.7"/>` +
    `<stop offset="1" stop-color="${C.earLow}" stop-opacity="0.9"/></linearGradient>${blur(f, [-42, -24, 20, 26], 0.8)}</defs>` +
    `<path d="${d}" fill="url(#${g})" filter="url(#${f})"/>`;
}

/** The paws' toe lines fade out toward their tops, as the front's do. */
function toeFade(id: string, y0: number, y1: number): string {
  return `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" y1="${y0}" x2="0" y2="${y1}">` +
    `<stop offset="0.35" stop-color="${C.pawLine}"/><stop offset="1" stop-color="${C.pawLine}" stop-opacity="0.1"/></linearGradient>`;
}

/** A paw's line darkening from the paws' line round its toe end to the sole's line where it meets the ground. */
function soleFade(id: string, y0: number, y1: number): string {
  return `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" y1="${y0}" x2="0" y2="${y1}">` +
    `<stop offset="0" stop-color="${C.pawLine}"/><stop offset="1" stop-color="${C.soleLine}"/></linearGradient>`;
}

/** Toe lines, typed from the sole up: each curves with the paw's dome, as the sheet draws them. */
const toes = (lines: P[][], id: string, width = 0.8) => lines.map((pts) => ({ pts: sample(smooth(pts, { closed: false }).segs, 6, false), width, colour: `url(#${id})` }));

function legNearPaint(): Paint {
  const sole = uid("sole"), toe = uid("toe");
  return {
    fill: C.fur,
    shade: furShade(bodyGroup, [], ["M-70 -60 L-30 -60 L-30 -30 L-70 -30Z"]),
    under: `<defs>${soleFade(sole, -13, -3)}${toeFade(toe, -0.6, -10)}</defs>`,
    // Three toe lines rising from the sole at the paw's front, curving with its dome, the third the faintest, as the
    // sheet draws them. Its back lies on the chest's fur with no line.
    inner: toes([[[-61.2, -2.4], [-62, -5], [-61.8, -7.8], [-60.8, -10.2]], [[-57.4, -1.2], [-58, -3.8], [-57.8, -6.4], [-57, -8.6]],
      [[-53.6, -0.9], [-53.9, -3.2], [-53.6, -5.4], [-53, -7]]], toe),
    // From the wrist, where the chest's edge meets it, round the paw's domed front and along its sole to the heel, the
    // paws' line deepening to the sole's line where it meets the ground (the sheet's #795030 at its toe end).
    outline: { ...OUTLINE, colour: C.pawLine, width: 1.4, taper: 5, spans: [{ from: [-55.8, -25.2], to: [-35.8, -7.2], colour: `url(#${sole})` }] },
    // Its top fades in on the chest, so it comes out of the chest's fur with no edge.
    feather: { from: [-44, -42], to: [-46, -36] },
  };
}

function legFarPaint(): Paint {
  const toe = uid("toe");
  return {
    fill: C.farFur,
    // In shade under the chest and the tag, where it comes out from behind them, as the sheet paints the wedge; the paw
    // below it only along its rim away from the light.
    shade: { multiply: C.furShadeBy, rim: { inset: 1.4, toLight: 2.2 }, shapes: ["M-66 -40 L-56 -40 L-56 -22 C-60 -21 -64 -22 -67 -23Z"], blur: 2 },
    // The paw's dome catches the light from the top left, so it reads as the sheet's near-cream paw below the shaded wedge.
    highlight: { d: "M-74 -13 C-73.6 -16.4 -70.6 -18.4 -67.6 -17.6 C-66 -14.4 -66.6 -10 -68.6 -7.4 C-71.4 -7 -73.8 -9 -74 -13Z", colour: C.fur, opacity: 0.55, blur: 1.6 },
    under: `<defs>${toeFade(toe, -4.6, -14)}</defs>`,
    // Two toe lines curving up its front, as the sheet draws them.
    inner: toes([[[-72.6, -6], [-73.3, -8.6], [-73.1, -11.4], [-72.2, -13.8]], [[-69.8, -5], [-70.3, -7.8], [-70.1, -10.6], [-69.4, -12.8]]], toe, 0.75),
    outline: { ...OUTLINE, colour: C.pawLine, width: 1.35, taper: 4, spans: [{ from: [-63.6, -35.2], to: [-66.6, -4.8] }] },
  };
}

function hindPaint(): Paint {
  const toe = uid("toe"), sole = uid("sole"), top = uid("top");
  return {
    fill: C.fur,
    shade: furShade(bodyGroup),
    under: `<defs>${toeFade(toe, -0.8, -10)}${soleFade(sole, -11, -3)}` +
      // Its top's line fades out along the thigh, as the sheet's does.
      `<linearGradient id="${top}" gradientUnits="userSpaceOnUse" x1="-30" y1="0" x2="-12" y2="0"><stop offset="0" stop-color="${C.pawLine}"/>` +
      `<stop offset="0.45" stop-color="${C.haunchLine}" stop-opacity="0.7"/><stop offset="1" stop-color="${C.haunchLine}" stop-opacity="0"/></linearGradient></defs>`,
    // Three toe lines rising from the sole at its front, curving with its dome, as the sheet draws them.
    inner: toes([[[-27.6, -2], [-28.1, -4.6], [-27.9, -7.4], [-27.1, -9.8]], [[-24, -1.2], [-24.4, -3.8], [-24.2, -6.4], [-23.6, -8.6]],
      [[-20.6, -0.9], [-20.8, -3.2], [-20.6, -5.4], [-20.1, -7.2]]], toe),
    // Its domed front and its sole, deepening to the sole's line on the ground; over its top, where it rises into the
    // thigh, a line that fades out along it.
    outline: { ...OUTLINE, colour: C.pawLine, width: 1.45, taper: 4, spans: [
      { from: [-30, -12.2], to: [-12.4, -14.6], width: 1.25, colour: `url(#${top})` },
      { from: [-11.8, -2.6], to: [-30.2, -11.8], colour: `url(#${sole})` },
    ] },
    feather: { from: [-10.8, -9], to: [-14.6, -9] },
  };
}

const tailPaint: Paint = {
  fill: C.fur,
  // Its foot away from the light, and the tan root's core by the rump, where the sheet's tan is deepest.
  shade: { multiply: C.furShadeBy, rim: { inset: 2.5, toLight: 4 }, shapes: ["M10 -14 C24 -6 40 -12 48 -24 L48 -4 L10 -4Z",
    "M16 -34 C20 -33 24 -27 24.6 -20 C24.8 -15 23 -12 20 -11 L16 -11Z"], blur: 2.4 },
  highlight: { d: "M22 -57 C28 -61 36 -60 41 -55 C36 -52 28 -52 22 -54Z", colour: C.light, opacity: 0.35, blur: 3 },
  inner: [
    // The curl's hook turns in under itself at the plume's front, its tip pointing back toward the body, as the sheet draws it.
    { pts: sample(smooth([[15.8, -53.4], [18.4, -52.2], [20.8, -50.2], [22.2, -47.6]], { closed: false }).segs, 6, false), width: 0.85, colour: C.crownLine, opacity: 0.9 },
    // A few soft strands of fur along the plume, combed round its curl and down its back.
    ...[[[26.4, -56.4], [30.6, -56.2], [34.4, -54]], [[39.6, -46.6], [41.6, -42.4], [42.2, -38]], [[31, -48.6], [33.8, -45.6], [35.2, -41.8]],
      [[38.4, -29.6], [37.6, -26.2], [35.6, -23.2]]].map((pts) => ({ pts: sample(smooth(pts as P[], { closed: false }).segs, 6, false), width: 0.7, colour: C.crownLine, opacity: 0.3 })),
  ],
  // One soft line all round, as the sheet draws it: the warm line up its front where it leaves the rump; the light fur
  // line over the curl and the top; the crown's line down its back, in shade; and the warm line along its underside by
  // the tan root, the spans overlapping so the line runs on unbroken.
  outline: { ...OUTLINE, colour: C.crownLine, width: 1.25, taper: 3, spans: [
    { from: [17.6, -35.8], to: [20.6, -45.4], width: 1.3, colour: C.warmLine },
    { from: [20.4, -43.6], to: [40.8, -55.4], width: THIN, colour: C.fluffLine },
    { from: [38.6, -57.2], to: [44.8, -26.2] },
    { from: [45.6, -29.4], to: [17.4, -9.8], width: 1.35, colour: C.warmLine },
  ] },
};

const headLight = "M-82 -128 C-74 -146 -56 -154 -38 -152 C-46 -146 -62 -140 -72 -126Z " +
  "M-90 -103 C-87 -106 -80 -107 -76 -104 C-79 -101 -86 -100 -90 -103Z";
const headPaint: Paint = {
  fill: C.fur,
  // Under the jaw, where the head turns under toward the collar; and down the cheek along the ear's front, where the
  // ear hangs over it, deepest under the ear's foot, as the sheet paints it (#F8CAA6 to #FEDAB8 there).
  shade: furShade(headGroup, ["M-92 -76 C-84 -66 -72 -63 -56 -61 L-30 -62 L-30 -56 L-92 -56Z",
    "M-33 -106 C-37.4 -100 -40 -94 -40.4 -86 C-41 -80 -42.6 -74 -45 -70 C-46 -66 -46 -60 -45 -56 L-22 -56 L-22 -62.6 L-30 -62.6 L-30 -106Z"],
    ["M-100 -172 L20 -172 L20 -140 L-100 -140Z"], { inset: 3, toLight: 4.5 }),
  highlight: { d: headLight, colour: C.light, opacity: 0.4, blur: 4 },
  // Each lock's tip hooks back in under itself, a hair stroke in the crown's line running back along the lock's
  // underside, as the sheet draws them (its "<" under each tip).
  inner: foreLocks.map(({ tip, root, notches }) => {
    const into = v.norm(v.sub(root, tip)), up = v.norm(v.sub(notches[1], notches[0]));
    const at = (a: number, b: number): P => v.add(tip, v.add(v.mul(into, a), v.mul(up, b)));
    return { pts: [at(0.15, 0), at(1.4, -0.6), at(2.9, -0.8), at(4.4, -0.5)], width: 0.9, colour: C.puffLine };
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
  { from: [-61.6, -60.2], to: [-92.5, -79.4], width: 1.3, colour: C.furLine },
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
 * a slightly darker rim; behind it, toward the ear, a thin crescent of white, narrow at the top, where the lid's soft
 * shade falls on it, and widest at its lower back, where it cools into a soft pale blue-grey shade; the lid line sitting right on the iris's top and
 * running round its back, heaviest along the top and the back corner and tapering away down the back; a faint pale
 * halo round the iris's foot and front; and one catchlight high on its front, toward the nose, as the sheet draws it
 * (Q26's default: the side crop shows one).
 */
function eye(): Piece {
  // The iris as the sheet's dark oval measures (its extremes x -73.4 to -62, y -110.8 to -89.7).
  const c: P = [-67.7, -100.2], rx = 5.6, ry = 10.5, lean = 6;
  const iris = pathD(ellipse(c, rx, ry, lean));
  const clip = uid("eye"), glow = uid("glow"), cool = uid("cool"), lidShade = uid("shade"), shine = uid("blur"), edge = uid("blur"), white = uid("blur"), halo = uid("blur"), rimSoft = uid("blur");
  const box: Box = [c[0] - 10, c[1] - 15, 24, 30];
  /** A point on the iris's oval at an angle (degrees, 0 toward the back, 90 down), grown by `grow`. */
  const on = (deg: number, grow = 0): P => {
    const a = (deg * Math.PI) / 180, t = (lean * Math.PI) / 180;
    const x = (rx + grow) * Math.cos(a), y = (ry + grow) * Math.sin(a);
    return [c[0] + x * Math.cos(t) - y * Math.sin(t), c[1] + x * Math.sin(t) + y * Math.cos(t)];
  };
  // The white: from the iris's top round its back, just inside the lid line, down to its lower back, where it is widest.
  const whiteShape = smooth([on(-100), [-63.6, -108.6], [-61, -106.4], [-59.6, -104.2], [-58.7, -101.6], [-58.3, -98.8], [-58.7, -96], [-59.8, -93.6],
    [-61.4, -91.8], [-63.4, -91.2], on(55), on(0), on(-50)], { corners: [0, 10] });
  // The lid: along the iris's top from its front and round its back to its lower back; a heavier stroke along the top
  // and the back corner over it.
  const lidArc = smooth([on(-150, 0.1), on(-118, 0.25), on(-92, 0.35), [-63.8, -109.4], [-60.8, -107.2], [-59, -104.8], [-57.9, -101.8], [-57.5, -98.8], [-57.6, -96],
    [-58.3, -93.8]], { closed: false });
  const topArc = smooth([on(-140, 0.2), on(-110, 0.35), on(-88, 0.4), [-63.8, -109.5], [-60.8, -107.3], [-59.2, -105]], { closed: false });
  const lid = tapered(sample(lidArc.segs, 10, false), 1.3, "outer", "eye lid", { taper: 7, tip: 0.25 });
  const lidTop = tapered(sample(topArc.segs, 10, false), 1.8, "outer", "eye lid", { taper: 4, tip: 0.6 });
  // A faint pale halo just outside the rim round the iris's foot and front, between the eye and the fur, as the sheet paints it.
  const ring = strokeOf(Array.from({ length: 25 }, (_, k) => on(95 + (k * 120) / 24, 1.1)), 1.6, { taper: 5, tip: 0.2 });
  // And just outside the lid, round the eye's top and back, where the patch's tan stops short of it, as the sheet paints it.
  const outer = strokeOf(sample(smooth([on(-150, 1.4), on(-110, 1.7), on(-88, 1.8), [-63.4, -111.2], [-59.8, -108.8], [-57.6, -105.4], [-56.3, -101.2], [-56, -96.6],
    [-56.8, -93.2]], { closed: false }).segs, 8, false), 1.5, { taper: 5, tip: 0.2 });
  // The iris's own darker rim, round its front, foot and back, inside its edge.
  const rim = tapered(Array.from({ length: 31 }, (_, k) => on(-160 + (k * 250) / 30, -0.35)), 0.8, "inner", "eye rim", { taper: 5, tip: 0.3 });
  // The catchlight where the sheet's sits, high on the iris's front (x -68.3, y -104.3).
  const big: P = [-68.3, -104.3];
  const n = (p: P) => `${fmt(p[0])}" cy="${fmt(p[1])}`;
  const [tx, ty] = on(-90), [bx, by] = on(90);
  const svg = `<defs><clipPath id="${clip}"><path d="${iris}"/></clipPath>` +
    // Down the iris's own axis: near-black over its upper half, glowing smoothly into the printed lower iris's warm dark
    // brown and, at its foot, the warm light low in the iris.
    `<linearGradient id="${glow}" gradientUnits="userSpaceOnUse" x1="${fmt(tx)}" y1="${fmt(ty)}" x2="${fmt(bx)}" y2="${fmt(by)}">` +
    `<stop offset="0.42" stop-color="${C.eyeDark}"/><stop offset="0.7" stop-color="${C.dark}"/><stop offset="0.86" stop-color="${C.dark}"/>` +
    `<stop offset="1" stop-color="${C.irisWarm}"/></linearGradient>` +
    // The lid's soft shade over the white's top, the printed soft shadow, as the sheet paints it there (#E7DAD1).
    `<linearGradient id="${lidShade}" gradientUnits="userSpaceOnUse" x1="0" y1="-109" x2="0" y2="-100">` +
    `<stop offset="0" stop-color="${C.shadow}" stop-opacity="0.95"/><stop offset="1" stop-color="${C.shadow}" stop-opacity="0"/></linearGradient>` +
    `<linearGradient id="${cool}" gradientUnits="userSpaceOnUse" x1="0" y1="-97" x2="0" y2="-90.4">` +
    `<stop offset="0" stop-color="${C.collarHighlight}" stop-opacity="0"/><stop offset="1" stop-color="${C.collarHighlight}" stop-opacity="0.32"/></linearGradient>` +
    `${blur(shine, box, 0.1)}${blur(edge, box, 0.2)}${blur(white, box, 0.3)}${blur(halo, box, 0.55)}${blur(rimSoft, box, 0.45)}</defs>` +
    `<path d="${ring.d}" fill="${C.fur}" opacity="0.8" filter="url(#${halo})"/><path d="${outer.d}" fill="${C.fur}" opacity="0.5" filter="url(#${halo})"/>` +
    `<g filter="url(#${white})"><path d="${pathD(whiteShape.segs)}" fill="${C.eyeWhite}"/><path d="${pathD(whiteShape.segs)}" fill="url(#${cool})"/><path d="${pathD(whiteShape.segs)}" fill="url(#${lidShade})"/></g>` +
    `<g filter="url(#${edge})"><path d="${iris}" fill="url(#${glow})"/></g>` +
    `<g clip-path="url(#${clip})"><path d="${rim.d}" fill="${C.eyeDark}" opacity="0.7" filter="url(#${rimSoft})"/></g>` +
    `<g filter="url(#${edge})"><path d="${lid.d}" fill="${C.eyeDark}"/><path d="${lidTop.d}" fill="${C.eyeDark}"/></g>` +
    `<ellipse cx="${n(big)}" rx="1.55" ry="1.5" fill="${C.light}" filter="url(#${shine})"/>`;
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

/**
 * The blush under the eye, where the sheet's sits: the front's soft ellipse, at its level, as broad and faint a wash
 * as the sheet's across the cheek (its pink reaches from x -68 to -53 and peaks at x -59, y -85.5 on the crop).
 */
function blush(): Piece {
  const [cx, cy] = [-60, -84.6], rx = 7.4, ry = 3.9;
  const d = `M${r3(cx - rx)} ${cy} a${rx} ${ry} 0 1 0 ${2 * rx} 0 a${rx} ${ry} 0 1 0 ${-2 * rx} 0Z`;
  return soft(d, [cx - rx - 0.5, cy - ry - 0.6, 2 * rx + 1, 2 * ry + 1.2], C.blush, 2.8, Math.round(model.blush.restingLevel * 1.28 * 100) / 100);
}

/**
 * The tag (the front's recipe), as the side crop paints it: flat matte gold, a deeper orange-gold rim inside its line
 * down its left side and round its foot, where the turned coin's edge shows, one soft light high on its left, and the
 * smaller heart embossed, soft: a lighter face with a soft darker edge low on its right. It hangs from a small gold
 * ring just under the band, held by a strap in the band's own darker blue at its front turn (the tag's pivot, the
 * ring's top on the collar, rig.json), so at rest the strap is the band's front turn itself.
 */
function tagPiece(): Piece {
  const strapLine: DrawnLine = { kind: "inner", width: 0.7, where: "tag ring", drawn: [0.7, 0.7] };
  const f = uid("blur"), box: Box = [-64, -61, 8, 11];
  const strap = piece(`<defs>${blur(f, box, 0.5)}</defs>` +
    `<path d="M-61.6 -58.6 C-61.8 -56.6 -61.6 -54.4 -61 -52.8 L-58.8 -52.8 C-58.4 -54.6 -58.4 -56.8 -58.6 -58.8 C-59.6 -59.6 -60.8 -59.4 -61.6 -58.6Z" ` +
    `fill="${C.collarLine}" opacity="0.7" filter="url(#${f})"/>` +
    `<ellipse cx="-60.4" cy="-52.1" rx="1" ry="0.85" fill="${C.tag}" stroke="${C.tagLine}" stroke-width="${strapLine.width}"/>`, box, { shapes: [], lines: [strapLine] });
  const g = uid("blur"), emboss = pathD(innerHeart.segs);
  const rim = sample(innerHeart.segs, 10);
  rim.push(rim[0]!);
  return join(strap, part("tag", heart, {
    fill: C.tag,
    shade: { multiply: C.tagShadeBy, rim: { inset: 1.2, toLight: 1.4 }, shapes: ["M-67 -50 C-66 -44 -64 -40 -60.6 -38.6 L-60 -36 L-68 -36Z"], blur: 1 },
    highlight: { d: "M-64.6 -47.6 a2.2 1.5 -50 1 0 4.4 0 a2.2 1.5 -50 1 0 -4.4 0", colour: C.tagShine, opacity: 0.4, blur: 1.3 },
    under: `<defs>${blur(g, [-68, -54, 16, 18], 0.4)}</defs><path d="${emboss}" fill="${C.tagShine}" opacity="0.3" filter="url(#${g})"/>`,
    inner: [{ pts: rim, width: 0.7, colour: C.tagLine, opacity: 0.45 }],
    outline: { colour: C.tagLine, width: THIN, taper: 2, blur: 0.25 },
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
  // Few and uneven, low on the ear, as the sheet paints them: two close together under its middle, curving with its
  // round, one short toward its back.
  const hairs: P[][] = [[[-19.4, -86], [-19.4, -78], [-17.6, -71]], [[-14.6, -84], [-14.2, -77], [-12.8, -71.4]], [[3.4, -88], [4.4, -80], [3.8, -73]]];
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

/**
 * Paint inside a marking, through its own soft edge (a mask of its shape, blurred as the marking is), so it never
 * shows past the marking's edge: the darker fur strands the sheet paints in its patches, or a deepening of the tan.
 * Pieces under a clip group (rig.json's clipTo) are held to their part by it as well.
 */
function within(name: string, shape: Shape, soft: number, content: (box: Box) => string, lines: DrawnLine[] = []): Piece {
  const [x0, y0, x1, y1] = bbox(shape.segs);
  const box = pad([x0, y0, x1 - x0, y1 - y0], 2), area = pad(box, reach(soft, 0));
  const m = uid("within"), e = uid("blur");
  return piece(`<defs>${blur(e, area, soft)}${mask(m, area, `<path d="${pathD(shape.segs)}" fill="#FFFFFF" filter="url(#${e})"/>`)}</defs>` +
    `<g mask="url(#${m})">${content(box)}</g>`, box, { shapes: [], lines: lines.map((l) => ({ ...l, where: `${name} ${l.where}` })) });
}

/** Fur strands, typed as a few nodes each, drawn as tapered inner lines in one colour, soft at their edges. */
function strands(name: string, shape: Shape, soft: number, lines: P[][], o: { colour: string; opacity: number; width: number }): Piece {
  const drawn = lines.map((pts, k) => strokeOf(sample(smooth(pts, { closed: false }).segs, 8, false), o.width, { taper: 3, tip: 0.15, band: LIMITS.inner, wobble: 0.08, seed: 5 + k }));
  const f = uid("blur");
  return within(name, shape, soft, (box) => `<defs>${blur(f, pad(box, 2), 0.3)}</defs>` +
    `<g fill="${o.colour}" opacity="${o.opacity}" filter="url(#${f})">${drawn.map((d) => `<path d="${d.d}"/>`).join("")}</g>`,
  drawn.map((d) => ({ kind: "inner" as const, width: o.width, where: "strands", drawn: d.drawn })));
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
  // The tail's tan root, soft but defined, with a few darker streaks in it radiating from the rump along the fur.
  add("tail.base", join(marking("tail.base", { shape: tail, paint: tailPaint }, tailBase, { fill: C.marking, blur: 0.75, clip: true }),
    strands("tail.base", tailBase, 0.75, [[[15.6, -31.4], [20.4, -33], [24.6, -32.2]], [[16.6, -25.4], [21.6, -26], [26.4, -24.6]], [[16.4, -19.2], [21.4, -18.2], [25.6, -15.6]],
      [[14.4, -13.4], [18.6, -11.4], [22.2, -9.6]]], { colour: C.earLow, opacity: 0.35, width: 0.8 })));
  add("front.R", part("front.R", legFar, legFarPaint()));
  add("body.front", roomy(part("body.front", chest, chestPaint()), 1));
  add("body.back", roomy(part("body.back", back, backPaint), 1));
  // The saddle, soft but defined, with a few darker strands in it following the back's curve, as the sheet paints them.
  add("back.patch.L", join(marking("back.patch.L", { shape: back, paint: backPaint }, saddle, { fill: C.marking, blur: 0.45, clip: true }),
    strands("back.patch.L", saddle, 0.45, [[[-8, -55], [-2.6, -52.4], [3.4, -47.6]], [[-4.4, -47.4], [1.6, -44.8], [7.4, -41]], [[3, -56], [7.6, -51.6], [11.8, -45.4]],
      [[-11, -51], [-7.4, -48], [-3.6, -45]]], { colour: C.earDeep, opacity: 0.38, width: 0.8 })));
  add("rump.patch.L", marking("rump.patch.L", { shape: back, paint: backPaint }, rump, { fill: C.marking, blur: 0.7, clip: true, fade: rumpFade }));
  add("hind.L", roomy(part("hind.L", hindNear, hindPaint()), 6));
  add("front.L", roomy(part("front.L", legNear, legNearPaint()), 1));
  const turn = uid("blur");
  add("collar", part("collar", collar, {
    fill: C.collar,
    // Its lower half in shade, lit along its middle, its front end a darker round turn where the band wraps round the
    // throat, and a dark blue rim round its foot, as the sheet paints it.
    shade: { multiply: C.shadeBy, shapes: ["M-64 -53.6 C-50 -49 -32 -51 -14 -60.6 L-14 -46 L-64 -46Z"], blur: 0.9 },
    highlight: { d: "M-58 -57.4 C-46 -58 -32 -60 -18 -63.4 L-18 -61.4 C-32 -58 -46 -56 -58 -55.4Z", colour: C.collarHighlight, opacity: 0.3, blur: 0.9 },
    under: `<path d="M-63 -60 C-61 -60.4 -59.4 -60 -58.4 -59 C-58 -56.4 -58.2 -53.6 -59 -51 C-60.6 -50.4 -62 -51 -63 -52Z" fill="${C.collarLine}" opacity="0.55" filter="url(#${turn})"/>` +
      `<defs>${blur(turn, [-66, -63, 12, 15], 0.6)}</defs>` + collarContact(),
    outline: { colour: C.collarRim, width: THIN, taper: 3, blur: 0.2, spans: [{ from: [-17.8, -62.6], to: [-62, -57.4] }] },
  }));
  add("tag", tagPiece());
  add("head.base", part("head.base", head, headPaint));
  // The head patch, soft but defined, deepening a little toward the ear, as the sheet paints it.
  const deepen = uid("deepen");
  add("head.patch.L", join(marking("head.patch.L", { shape: head, paint: headPaint }, patch, { fill: C.patch, blur: 0.5, clip: false }),
    within("head.patch.L", patch, 0.5, (box) => `<defs><linearGradient id="${deepen}" gradientUnits="userSpaceOnUse" x1="-46" y1="0" x2="-28" y2="0">` +
      `<stop offset="0" stop-color="${C.marking}" stop-opacity="0"/><stop offset="1" stop-color="${C.marking}" stop-opacity="0.5"/></linearGradient></defs>` +
      `<rect ${region(box)} fill="url(#${deepen})"/>`)));
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
      { pts: [[-59.6, -154.8], [-58, -153.4], [-55.6, -152.4], [-52.4, -152]], width: 0.9, colour: C.puffLine },
      { pts: [[-42.6, -161.2], [-43.2, -158.8], [-42, -156.6], [-39.4, -155.3], [-36.4, -154.9]], width: 0.9, colour: C.puffLine },
      { pts: [[-5.9, -152.6], [-7.6, -151.4], [-10.2, -151], [-13.2, -151.2]], width: 0.9, colour: C.puffLine },
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
  // hind paw's toe (x -30.8), and from its toe lines' top (y -10.2) to its sole (y -0.6).
  "paw.front.L": [-47.8, -5.4],
  // The far front paw: only its toe end shows, so the centre of what shows, from its toe end (x -75) to the near paw's
  // front (x -64.8) and from its top (y -20.4) to its sole (y -4.6).
  "paw.front.R": [-69.9, -12.5],
  // The hind paw: from its toe end (x -30.8) to where its top line fades (x -12), and from its toe lines' top (y -9.8)
  // to its sole (y -0.7).
  "paw.hind.L": [-21.4, -5.25],
  // The ring's top, where it rests on the collar: the tag's pivot (rig.json).
  "tag.ring": [-59.1, -58.3],
  // The seat: the middle of the haunch's underside, 1 pt inside it (DECISIONS 9).
  seat: [0, -3],
};
