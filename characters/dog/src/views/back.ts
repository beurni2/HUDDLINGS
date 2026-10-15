// The dog's back view (the dog seen from behind: its left on the viewer's left,
// format README), shapes first, every node typed by hand in model space
// (points, the ground under the seat at 0, 0, y down) at the extremes and
// inflections read off the back turnaround (master.turnaround.back) at its own
// scale (DECISIONS 5), then paint by the front's and the side's recipes. There is
// no face: the head from behind is the crown and its two-lobed topknot, the ears
// hanging at its sides, the back of the head and the collar's band round the
// neck. The tail lies in front of the body (spec L298), its tan root showing
// where it leaves the rump. One light group holds the haunches and the hind
// paws, one the head and its topknot.
import { furEdge, furSpan, type Lock } from "../../../draw/fur.ts";
import { bbox, ellipse, fracAt, mirrorX, pathD, sample, smooth, spanPoints, v, type Node, type P, type Shape } from "../../../draw/geom.ts";
import { ribbons, strokeOf, type DrawnLine, type Outline, type Stroke } from "../../../draw/line.ts";
import { LIMITS, reach } from "../../../draw/lint.ts";
import { marking, part, soft, type Paint } from "../../../draw/paint.ts";
import { blur, join, mask, pad, piece, uid, type Box, type Piece } from "../../../draw/svg.ts";
import { C } from "../palette.ts";
import type { Drawn } from "./front.ts";

/** Lines on fur spans and small parts: lighter, and never under 1.2 pt (as the front draws them). */
const THIN = 1.2;
const OUTLINE: Outline = { colour: C.outline, width: 1.54, taper: 6, blur: 0.2 };

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const fmt = (n: number) => r3(n).toString();
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
/** A tapered line drawn as a filled polygon, with its meta for the lint built from what strokeOf draws (as the front's). */
function tapered(pts: P[], width: number, kind: "outer" | "inner", where: string, opts: Stroke = {}): { d: string; line: DrawnLine } {
  const s = strokeOf(pts, width, { band: LIMITS[kind], ...opts });
  return { d: s.d, line: { kind, width, where, drawn: s.drawn } };
}
/** A part's canvas grown to hold its light group's shade where the group reaches past the part. */
const roomy = (p: Piece, by: number): Piece => ({ ...p, box: pad(p.box, by) });
/** Two sets of ribbons as one. */
const join2 = (a: ReturnType<typeof ribbons>, b: ReturnType<typeof ribbons>): ReturnType<typeof ribbons> =>
  ({ svg: a.svg + b.svg, lines: [...a.lines, ...b.lines], outlined: [...a.outlined, ...b.outlined] });
/** A smooth open line through typed points, sampled for a stroke. */
const curve = (pts: P[], per = 8) => sample(smooth(pts, { closed: false }).segs, per, false);
/** The same fur locks on a path that runs the other way: in reverse, leaning the other way. */
const reversed = (locks: Lock[]): Lock[] => [...locks].reverse().map((l) => ({ ...l, lean: -(l.lean ?? 0) }));

// Shapes.

// The head from behind: a full round mass, its crown running out from under the
// topknot to each ear's root in one line, the left with a small lock, where the
// crown's fur ends in a lock tip on the silhouette (the sheet's hook at each ear
// root); under that tip the crown's fur turns in over the ear's root in a short
// overhang, so the ear's tan shows below it in a soft crescent that rounds off
// into the head's side (the back of the head's own temples). From there the
// side runs down over the ear's inner edge, widest at x -39.8 (the sheet's line
// at -39.4 to -38.6 from y -114 to -98, the line inside the edge), and turns in
// round the head's lower corners into the collar's ends; its foot lies behind
// the collar and the shoulders. Typed as its left half (the viewer's left, the
// dog's left), mirrored; the right of the crown sits higher on the sheet.
const headHalf: Node[] = [[0, -152.6], [-16.4, -155.4], [-25, -154.8], [-32.4, -150.6], [-37.4, -145.8], [-41.8, -142.4], [-36, -141.6],
  [-30.8, -139.4], [-33.6, -131.6], [-37.6, -121], [-39.8, -108], [-39.4, -96], [-37, -86], [-33, -78.2], [-28.4, -72.2], [-21, -63]];
const HEAD_FOOT: Node = [0, -58.6];
/** The fringe's lowest lock tip on the silhouette over each ear's outer top, and the crescent's inner end under it (a concave corner). */
const TIP = 5, CRESCENT = 7;
/**
 * The right of the crown is not the left's mirror on the sheet: its line runs higher and further out before the ear
 * comes out under it, from (37.8, -150.1) at the ear's root (3.9 pt above the left's) down to the fringe's lowest
 * lock at (44.6, -143.2), where the ear's tan begins. Those nodes are typed where the sheet draws them; the rest of
 * the right side is the left's mirror.
 */
const rightCrown: Node[] = [[30.8, -139.4], [38.4, -141.8], [44.4, -143.2], [40.2, -148.2], [37.4, -150.4], [34.6, -152.4]];
const mirrored = mirrorX(headHalf, false).slice(0, -1);
const at = mirrored.length - CRESCENT;
const headNodes: Node[] = [...headHalf, HEAD_FOOT, ...mirrored.slice(0, at), ...rightCrown, ...mirrored.slice(at + 5)];
const RIGHT_TIP = headHalf.length + 1 + at + 2, RIGHT_CRESCENT = headHalf.length + 1 + at;
let head = smooth(headNodes, { typed: headHalf.length + 1 + rightCrown.length, corners: [CRESCENT, RIGHT_CRESCENT] });
// The crown's fringe, as the sheet draws it: a few small locks between the topknot and each ear, combed out toward
// the ears; under each lowest lock the fringe's underside breaks into two soft locks hanging over the ear's root; and
// round each of the head's lower corners, over the ear's inner foot, the fur breaks into a few small clumps.
const fringe: Lock[] = [{ len: 1.2, w: 1, lean: 0.25 }, { len: 1, w: 0.9, lean: 0.3 }];
const overhang: Lock[] = [{ len: 0.6, w: 1, lean: -0.3 }, { len: 0.5, w: 1.1, lean: -0.25 }];
const corner: Lock[] = [{ len: 0.9, w: 1.1, lean: 0.35 }, { len: 1.1, w: 1.2, lean: 0.4 }, { len: 0.7, w: 0.9, lean: 0.45 }];
head = furEdge(head, [-25.4, -154.6], [-35.4, -147.8], fringe, 0.42);
head = furEdge(head, [-40.2, -141.6], [-32, -140.2], overhang, 0.4);
head = furEdge(head, [-37.6, -88], [-29.8, -74.2], corner, 0.4);
head = furEdge(head, [29.8, -74.2], [37.6, -88], reversed(corner), 0.4);
// Down each side, where the head lies over the ear, the fur's edge breaks into a few small, uneven locks combed
// down, as the sheet draws it there, so the side does not read as a ruled line.
const side: Lock[] = [{ len: 0.6, w: 1, lean: 0.4 }, { len: 0.8, w: 1.3, lean: 0.45 }, { len: 0.5, w: 0.8, lean: 0.4 }];
head = furEdge(head, [-39.8, -112], [-38.6, -92.6], side, 0.35);
head = furEdge(head, [38.6, -92.6], [39.8, -112], reversed(side), 0.35);
head = furEdge(head, [32, -140.2], [42.8, -142.4], reversed(overhang), 0.4);
head = furEdge(head, [35.4, -151.8], [24.6, -154.6], [{ len: 1, w: 1, lean: -0.3 }, { len: 1.1, w: 1.1, lean: -0.25 }], 0.42);
/** Each lowest lock's tip: a fur span. */
const tipL = headNodes[TIP]! as P, tipR = headNodes[RIGHT_TIP]! as P;
head = furSpan(furSpan(head, [tipL[0] + 1, tipL[1] - 1.2], [tipL[0] + 1.2, tipL[1] + 0.6]), [tipR[0] - 1.2, tipR[1] + 0.8], [tipR[0] - 1, tipR[1] - 1.4]);

// The topknot: two round fur lobes on the crown, as the sheet draws them from
// behind, the left one a little the taller (the head's top, -164 at x -9.6),
// their lines meeting in a V at the notch between them; each comes down to the
// crown's line at its foot, where the lines meet in a point; its base lies on
// the crown, hidden.
const TUFT_NOTCH = 7;
const tuft = furSpan(smooth([[-16.6, -154.8], [-16.4, -158.6], [-14.6, -161.8], [-11.6, -163.8], [-8, -164.3], [-4.6, -163.4], [-1.8, -161], [2.4, -155.8],
  [4.6, -159.4], [8.4, -162.2], [12.8, -163], [17, -162.8], [20.8, -161], [22.6, -158], [21.6, -155.4], [18.8, -154], [10, -150.6], [-4, -150.6],
  [-13.6, -152.4]], { corners: [TUFT_NOTCH] }), [-16.6, -154.8], [18.8, -154]);

// The ears from behind: broad tan droplets hanging at the head's sides from
// high on the crown, as the sheet draws them. Each comes out from under the
// crown's lock tip at its root, the ear's highest tan (the landmarks), its outer
// edge running on from the crown's line down and out to the ear's widest
// (x -77.4 on the left at y -92, 76 on the right at -97), its foot broad and
// round, hanging in a few soft clumps, lowest under its middle (the tips), its
// inner bottom corner clear of the head's lower corner, its inner edge running
// up under the head's side, hidden.
const earLNodes: Node[] = [[-28.4, -141.8], [-34.6, -143.8], [-38.6, -144.2], [-42.2, -142.2], [-43.6, -141], [-49.6, -135.1], [-56.6, -128.6], [-62.6, -120.2], [-68.4, -114.4],
  [-73, -108.4], [-76.2, -101], [-77.4, -92.4], [-76.2, -86.6], [-73.4, -81.6], [-69, -76.8], [-63.6, -72.4], [-57, -69.4], [-49.6, -67.8], [-44.2, -68.4],
  [-40.4, -71.2], [-38.4, -76.2], [-35.6, -88], [-34.4, -104], [-31.6, -126]];
const earRNodes: Node[] = [[28.6, -142.6], [37.4, -145], [41.4, -146], [44.8, -143], [47.4, -140.6], [49.6, -138], [55.8, -131.5], [61.2, -124.6], [67, -118.8],
  [72.2, -112.6], [75, -105.8], [76, -97], [75.6, -88.6], [73.2, -82], [68.6, -76.8], [62.2, -72.4], [54, -69.8], [48, -68.8], [44, -69.6],
  [40.4, -71.8], [38.4, -76], [36.2, -88], [35.4, -104], [31.8, -126]];
/**
 * Each ear's foot, as the sheet draws it from behind: a full round clump at its outer corner, the broadest under its
 * middle, and a smaller one at its inner corner, each tucked under the next at a parting.
 */
const footLocks: Lock[] = [{ len: 2, w: 1.3, lean: 0.3 }, { len: 1.5, w: 1.9, lean: 0.1 }, { len: 0.9, w: 1, lean: 0 }];
/** The right ear's outer clump is the broader, so its lowest point lies under its middle, as the sheet's does (x 49.6). */
const footLocksR: Lock[] = [{ len: 2, w: 1.7, lean: 0.3 }, { len: 1.5, w: 1.9, lean: 0.1 }, { len: 0.9, w: 0.8, lean: 0 }];
/** Each clump of each ear's foot: its tip, root and notches, for the partings drawn up into it. */
const earClumps: Record<"L" | "R", { tip: P; root: P; notches: [P, P] }[]> = { L: [], R: [] };
const ears = {
  L: furEdge(smooth(earLNodes), [-76.6, -88.4], [-41.6, -69.8], footLocks, 0.42, (tip, root, notches) => earClumps.L.push({ tip, root, notches })),
  R: furEdge(smooth(earRNodes), [75.4, -86.6], [41.6, -71.6], footLocksR, 0.42, (tip, root, notches) => earClumps.R.push({ tip, root, notches })),
};

// The ears' soft contact shadow on the head (DECISIONS 25): a warm band of the
// ears' tan inside the head's side, from the crescent under the crown down to
// about y -92, widest (5 pt) at y -114 to -98 and fading into the cream, as the
// sheet paints it; typed with bleed past the head's edge, which the head's clip
// takes off.
const earShadow = {
  L: smooth([[-41, -142], [-34.4, -138.6], [-31.8, -134], [-33.4, -124], [-34, -112], [-34.6, -100], [-36.4, -93], [-40.4, -90], [-43.4, -110], [-43.4, -130]]),
  R: smooth([[41, -145], [34, -140], [32.6, -134], [34.4, -124], [34.2, -112], [34.8, -100], [36.4, -93.4], [40.4, -91], [43.4, -110], [43.4, -132]]),
};

// The collar from behind: a band round the back of the neck, arching up over
// the nape (its top 75.3 pt high at the middle, its foot 66.3), about 9 pt deep
// at the middle and 8 at its ends, which turn round the neck as small rounded
// squares, the right reaching a little further out, as the sheet draws it.
const collar = smooth([[-28.6, -70.4], [-25, -72.6], [-18, -74], [-9, -75], [0, -75.3], [9, -75], [17, -74.2], [24.6, -72.6], [29.4, -70.8], [30.4, -66.2],
  [29.8, -62.4], [24, -63.2], [16, -64.9], [6, -66], [-6, -66.1], [-16, -65.4], [-23.6, -63.8], [-28.8, -62], [-29.4, -66.2]]);

// The body from behind: the shoulders come out from under the collar's ends
// and run down and out, breaking into a small lock under each collar end, to a
// notch at y -40 where the haunch's round begins outside them; each haunch
// bulges out to its widest at y -23 (x -49.4 on the left; the right is 2.5 pt
// narrower, as the sheet draws it) and turns in under itself over the hind paw,
// whose heel peeks out below it; the bottom runs along the ground between the
// haunches, behind the tail's foot. Typed as its left half, mirrored, the right
// haunch drawn in.
const bodyHalf: Node[] = [[0, -67], [-24, -66.4], [-29.4, -61.8], [-32.8, -57.6], [-36.2, -51.6], [-38.4, -45.6], [-39.6, -40.6], [-43.4, -38.4],
  [-46.8, -34.6], [-48.9, -29], [-49.4, -23], [-48.6, -17], [-46.4, -12.6], [-42.2, -7.6], [-36, -3.8], [-28.6, -1.9], [-12, -1.6]];
const BODY_FOOT: Node = [0, -2.6];
/** The notch where each haunch's round begins outside the shoulder (a concave corner). */
const NOTCH = 6;
/** The right haunch is narrower than the left on the sheet (x 46.9 at its widest against -49.4): drawn in by up to 2.5 pt round y -24. */
const narrow = ([x, y]: Node): Node => [x - 2.5 * Math.max(0, 1 - ((y + 24) / 16) ** 2), y];
const bodyNodes: Node[] = [...bodyHalf, BODY_FOOT, ...mirrorX(bodyHalf, false).slice(0, -1).map(narrow)];
const shoulderLocks: Lock[] = [{ len: 0.7, w: 1, lean: 0.3 }, { len: 0.5, w: 0.8, lean: 0.35 }];
const body = furEdge(furEdge(smooth(bodyNodes, { typed: bodyHalf.length + 1, corners: [NOTCH, bodyHalf.length + bodyHalf.length - NOTCH] }),
  [-32.2, -58.4], [-35.6, -52.8], shoulderLocks, 0.3), [35.6, -52.8], [32.2, -58.4], reversed(shoulderLocks), 0.3);

// The hind paws: from behind only each heel shows, a round bun peeking out
// under the haunch's lower outer corner (from its notch at y -12.6 on the left,
// -11.5 on the right) and sitting on the ground below it; the rest lies behind
// the haunch.
const hind = {
  L: smooth([[-46.2, -13.8], [-47.2, -10.4], [-46.4, -6.8], [-44.2, -4], [-40.6, -2.1], [-35, -1.3], [-28, -1.3], [-24, -3], [-24.4, -8], [-29, -13.6], [-36, -16.4],
    [-42, -16]]),
  R: smooth([[45.4, -13.6], [46.4, -10.2], [45.4, -6.6], [43, -3.8], [39.6, -2.1], [34.6, -1.3], [28, -1.3], [24, -3], [24.4, -8], [29, -13], [35.6, -15.8],
    [41.6, -15.4]]),
};

// The tail, in front of the body: a fluffy plume whose tan root shows where it
// leaves the rump (its upper left, y -21 to -29); from there its edge runs up
// over the saddle, curving in a little at y -38 where the curl's tip turns in
// under its head, then over the round head of the curl (its top at y -49.4) and
// down its right side in four soft locks of fur of about 9 pt each, tucked
// under one another at short partings (the sheet's at y -43.5, -35, -27, -17),
// round its foot in three more, which rest on the ground between the haunches,
// and up its left side, as the sheet draws it.
const TAIL_NOTCH = 4;
/** Each lock of the plume: its tip, root and notches, for the partings drawn up into it. */
const tailLocks: { tip: P; root: P; notches: [P, P] }[] = [];
const noteTail = (tip: P, root: P, notches: [P, P]) => tailLocks.push({ tip, root, notches });
const tail = furEdge(furEdge(smooth([[-9.8, -23.2], [-5.6, -27], [-1.6, -29.2], [0.8, -32.4], [2.4, -37.6], [1.4, -42], [3.2, -46.4], [7, -48.9],
  [11.4, -49.4], [16, -48.4], [19.8, -45.4], [24.6, -41], [28, -33], [28.8, -23], [27.6, -13.4], [24, -8.4], [16.6, -5.6], [8, -3.6], [1, -1.6],
  [-6.6, -2.2], [-9.8, -6], [-10.2, -14]], { corners: [TAIL_NOTCH] }),
[19.6, -45.6], [25, -9], [{ len: 1.3, w: 1, lean: 0.25 }, { len: 1.6, w: 1.1, lean: 0.3 }, { len: 1.4, w: 1.1, lean: 0.25 }, { len: 1.2, w: 0.9, lean: 0.3 }], 0.38, noteTail),
[24, -8.4], [-3.4, -1.8], [{ len: 1.1, w: 1, lean: 0.25 }, { len: 1.2, w: 1.2, lean: 0.2 }, { len: 0.9, w: 0.9, lean: 0.15 }], 0.38, noteTail);
/**
 * The tail's root, where it leaves the rump (rig.json's tail pivot in this view): the middle of its tan root as it shows
 * from behind (phase 2's patch there centres on -5.7, -23.7), at the side view's root height (-23), on the tail.
 */
export const TAIL_ROOT: P = [-5, -24];

// Markings.

// The saddle from behind (DECISIONS 23, 24): it crosses the spine just behind
// the collar (its top 6 pt below the collar's foot), its upper edge reaching as
// far to the dog's right (x 21.6) as to its left (x -21.4); below that it lies
// left of the spine down to the tail's root, its left edge breaking into soft
// rounded lumps, and the tail covers the rest. The left half (back.patch.L) runs
// on 3.6 pt past the spine under the right half, so the two meet with no seam;
// on the left flank a strip of it shows just inside the outline from y -54 to
// -40, where the saddle wraps round the side. Typed with bleed under the tail
// and past the body's edge, which the tail and the body's clip hide.
const saddleL = furEdge(furEdge(smooth([[3.6, -59.6], [-3, -59.6], [-8.6, -58.4], [-12.8, -56.6], [-15.4, -54.2], [-17.6, -50.4], [-20.2, -46.4], [-21.4, -41.6],
  [-20.6, -37], [-18.8, -32.6], [-15.8, -29.4], [-11.8, -26.8], [-8.4, -24.8], [-3, -24.4], [3, -30], [4.6, -40], [4.2, -52]]), [-1, -59.6], [-13.6, -56],
[{ len: 0.8, w: 1, lean: 0.1 }, { len: 1, w: 1.2, lean: 0 }, { len: 0.7, w: 0.9, lean: -0.1 }], 0.45), [-14.8, -55.4], [-17, -30.4],
[{ len: 0.9, w: 1, lean: 0.1 }, { len: 1.2, w: 1.3, lean: 0 }, { len: 0.8, w: 1, lean: -0.1 }, { len: 1.1, w: 1.2, lean: -0.1 }], 0.45);
const flankL = smooth([[-41.6, -53], [-37.6, -54.6], [-35.4, -50.6], [-35.4, -45.4], [-36.8, -41.4], [-39.8, -39.2], [-42, -44]]);
const saddleR = furEdge(smooth([[-1.2, -60], [4, -59.2], [8.4, -58.2], [12.4, -56.8], [16, -54.8], [19, -52.2], [20.8, -48.8], [21.6, -45], [19, -42], [10, -44],
  [1, -44], [-1.4, -52]]), [1.4, -59.6], [20.4, -49.4], [{ len: 0.8, w: 1, lean: 0.1 }, { len: 1, w: 1.1, lean: 0.1 }, { len: 0.9, w: 1, lean: 0.15 },
  { len: 0.7, w: 0.9, lean: 0.2 }], 0.45);
// The tail's tan root, where it shows from behind at the tail's upper left, below the saddle's edge: pale, the paler
// painted tan, as the sheet paints it there (#F0BC8B; DECISIONS 17), fading into the plume's cream.
const tailBase = smooth([[-12, -20], [-11.4, -25], [-7.6, -29], [-2.4, -31.6], [0.6, -29.4], [-0.6, -25.4], [-3.6, -21.8], [-8, -19.4]]);

// Paint.

/** The fur's one shade (the front's recipe): the fur's own warm multiply on the rim away from the light and under overhangs. */
const furShade = (group: Shape[], shapes: string[] = [], keep: string[] = [], rim = { inset: 2.5, toLight: 4 }) =>
  ({ multiply: C.furShadeBy, rim, shapes, keep, group, blur: 2.4 });
const hipGroup = [body, hind.L, hind.R];
const headGroup = [head, tuft];

const backPaint: Paint = {
  fill: C.fur,
  // The shoulders just under the collar, where the neck turns in under it, and the haunches' undersides away from the light.
  shade: furShade(hipGroup, ["M-31 -63.6 C-20 -57 20 -57 31 -63.6 L31 -70 L-31 -70Z"]),
  // The light from the top left on the left haunch's round and the left shoulder.
  highlight: { d: `${pathD(ellipse([-37, -28], 6.5, 10, 10))} ${pathD(ellipse([-28, -52], 5, 3.4, -30))}`, colour: C.light, opacity: 0.3, blur: 4 },
  // Lines as the sheet draws them from behind: down each shoulder from under the collar's end the haunches' light
  // line (the sheet's #B2896B), deepening at the notch; round each haunch's round the faint fluff line, as light as the
  // sheet's (#C49F8C, #B38A76); where the haunch lies over the hind paw's heel a soft line; along the ground the
  // outline's brown (the sheet's #936845).
  outline: { ...OUTLINE, colour: C.haunchLine, width: 1.3, taper: 5, spans: [
    { from: [-29.4, -61.6], to: [-39.4, -41.4], width: THIN },
    { from: [-39.8, -40.2], to: [-46.4, -12.8], colour: C.fluffLine },
    { from: [-46.2, -12.4], to: [-29.4, -2], width: 1.25, colour: C.softLine },
    { from: [-30, -2], to: [30, -2], width: 1.35, colour: C.outline },
    { from: [29.4, -2], to: [45.2, -12], width: 1.25, colour: C.softLine },
    { from: [45.4, -12.6], to: [39.8, -40.2] },
    { from: [39.4, -41.4], to: [29.4, -61.6], width: THIN },
  ] },
};

/** A heel's line: the paws' grey-brown round its outer side (the sheet's #A68564), deepening to the outline's brown along the ground. */
function hindPaint(side: "L" | "R"): Paint {
  const sx = side === "L" ? -1 : 1, sole = uid("sole");
  return {
    fill: C.fur,
    shade: furShade(hipGroup),
    under: `<defs><linearGradient id="${sole}" gradientUnits="userSpaceOnUse" x1="0" y1="-12" x2="0" y2="-2">` +
      `<stop offset="0" stop-color="${C.pawLine}"/><stop offset="1" stop-color="${C.outline}"/></linearGradient></defs>`,
    outline: { ...OUTLINE, colour: `url(#${sole})`, width: 1.4, taper: 4, spans: side === "L"
      ? [{ from: [-46.4, -13.2], to: [-27, -1.3] }]
      : [{ from: [46.4, -10.8], to: [27, -1.3] }] },
    feather: { from: [sx * 30, -16], to: [sx * 32, -12] },
  };
}

const tailPaint: Paint = {
  fill: C.fur,
  // Its foot and its right side away from the light; under the curl's head, where it rolls over the plume.
  shade: { multiply: C.furShadeBy, rim: { inset: 2.5, toLight: 4 }, shapes: ["M-11 -6 C-2 0 14 -2 26 -8 L26 0 L-11 0Z"], blur: 2.4 },
  highlight: { d: pathD(ellipse([9, -45.4], 7.4, 3.6, -6)), colour: C.light, opacity: 0.35, blur: 3 },
  inner: [
    // A short soft parting up into the plume from each notch between its locks, as the sheet draws them.
    ...tailLocks.slice(1).map(({ notches }) => {
      const n = notches[0], into = v.norm(v.sub([12, -26], n));
      return { pts: [n, v.add(n, v.mul(into, 1.8)), v.add(n, v.mul(into, 3.4))] as P[], width: 0.7, colour: C.haunchLine, opacity: 0.5 };
    }),
    // A few soft strands combed round the curl and down the plume.
    ...([[[7, -45.6], [11.6, -46.4], [16, -44.2]], [[22.6, -38], [25.4, -34.4], [26.4, -29.6]], [[22.4, -16.4], [21.6, -12.8], [19.2, -10.2]]] as P[][])
      .map((pts) => ({ pts: curve(pts, 6), width: 0.7, colour: C.crownLine, opacity: 0.22 })),
  ],
  // A soft line as the sheet draws it: along the saddle's edge the ears' tan line (the sheet's #B58152), over the
  // curl's head toward the light and down its right side the light fluff line (#BAA288), round its lower lobes the
  // haunches' line (#C3986D), deepening to the outline's brown where its foot meets the ground (#926E4E); up its left
  // side, over the haunch's cream, none (#E7BF9B there), only its shade.
  outline: { ...OUTLINE, colour: C.haunchLine, width: 1.3, taper: 3, spans: [
    { from: [-9.6, -23.4], to: [2, -43.4], width: 1.25, colour: C.earEdge },
    { from: [1.8, -42.4], to: [29.8, -21.2], width: THIN, colour: C.fluffLine },
    { from: [29.8, -22], to: [9, -3.8], width: 1.25 },
    { from: [10, -4.4], to: [-8.8, -3], width: 1.35, colour: C.warmLine },
  ] },
};

const headLight = `${pathD(ellipse([-14, -146], 11, 4.6, -14))}`;
const headPaint: Paint = {
  fill: C.fur,
  // Low on the back of the head, where it turns under to the collar; and the rim away from the light. The crown stays
  // light out to its line, as the sheet paints it.
  shade: furShade(headGroup, ["M-36 -78 C-22 -70.6 22 -70.6 36 -78 L36 -60 L-36 -60Z"], ["M-50 -172 L50 -172 L50 -140 L-50 -140Z"], { inset: 3, toLight: 4.5 }),
  highlight: { d: headLight, colour: C.light, opacity: 0.4, blur: 4 },
  // The crown's whorl under the topknot: a few faint fur strokes parting from one point and combed down and out, as
  // the sheet draws them.
  inner: ([[[1.8, -146.2], [0, -142.4], [-2.8, -138.4]], [[2.2, -146.2], [4.6, -142.2], [7.8, -138.4]], [[1.4, -146.6], [-2.6, -145.6], [-6.8, -143.2]],
    [[2.6, -146.6], [6.6, -145.4], [10.6, -143]]] as P[][]).map((pts) => ({ pts: curve(pts, 6), width: 0.65, colour: C.crownLine, opacity: 0.14 })),
};

/**
 * The head's line, where the sheet draws one: the crown's light warm line from under each of the topknot's feet to
 * the crown's lock tip over each ear's root (none under the overhang, where the crown's cream lies out over the
 * root's tan); and down each side, where the head lies over the ear, a line that comes in from nothing below the
 * crescent and deepens to the ears' deep tan by y -100, where the sheet's is darkest (#A96737), warming to the warm
 * line by y -86 (#A56B45) and lightening to the haunches' light line round the head's lower corner into the collar's end.
 */
const SIDE = uid("side");
const headLine: Outline = { ...OUTLINE, taper: 4, blur: 0.15, spans: [
  { from: [-16.8, -155.3], to: [-37, -146.8], width: THIN, colour: C.fluffLine },
  { from: [-38, -119], to: [-29, -73.2], width: 1.3, colour: `url(#${SIDE})` },
  { from: [29, -73.2], to: [38, -119], width: 1.3, colour: `url(#${SIDE})` },
  { from: [38.2, -149.8], to: [17, -155.3], width: THIN, colour: C.fluffLine },
] };
/**
 * Where the crown's line runs on over each ear's root, from the root down to where the ear comes out under the
 * fringe, the sheet draws it in the ears' tan (L* 65 to 80 there, against 48 to 60 round the ears), the ear's own
 * edge showing along the crown's: a line in the tan, barely tapered at its foot, where the ear's line takes it on.
 */
const ROOT = { L: uid("root"), R: uid("root") };
const rootSpans = { L: [[-35.6, -147.6], [-41.8, -142.4]] as [P, P], R: [[36.2, -151], [44.4, -143.2]] as [P, P] };
const rootLine: Outline = { colour: C.marking, width: 1.8, taper: 1.2, blur: 0.15, spans: [
  { from: rootSpans.L[0], to: rootSpans.L[1], colour: `url(#${ROOT.L})` },
  { from: rootSpans.R[1], to: rootSpans.R[0], colour: `url(#${ROOT.R})` },
] };
/** Each root line comes out of the crown's light line and turns to the ears' tan by its middle. */
const rootGradient = (side: "L" | "R", tan: number) => {
  const [[x1, y1], [x2, y2]] = rootSpans[side];
  return `<linearGradient id="${ROOT[side]}" gradientUnits="userSpaceOnUse" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">` +
    `<stop offset="0" stop-color="${C.fluffLine}"/><stop offset="${tan}" stop-color="${C.marking}"/></linearGradient>`;
};

function headLinePiece(): Piece {
  const f = uid("blur"), s = uid("blur");
  const r = join2(ribbons(head, headLine, "head.line", 0.5), ribbons(head, rootLine, "head.line", 0.5));
  const [x0, y0, x1, y1] = bbox(head.segs);
  const box = pad([x0, y0, x1 - x0, y1 - y0], 4);
  // Under each overhang and round each crescent the crown's cream lies out over the root's tan in a feathered edge,
  // so the tan tucks in under the cream with no cut edge, as the sheet paints it.
  const feathered = (spans: [P, P][], width: number) => spans.map(([a, b]) =>
    strokeOf(spanPoints(head, fracAt(head, a), fracAt(head, b)), width, { taper: 3, tip: 0.4 }).d).join("");
  const edge = feathered([[[-40.6, -141.8], [-37.4, -121.4]], [[37.4, -121.4], [43.2, -142.6]]], 1.4);
  // The crown's lock tip hooks in over the ear's root, a short stroke curling back along the overhang's underside.
  const hooks = [[[-36.8, -147], [-35.4, -146.8], [-34.2, -146], [-33.6, -144.8]], [[37.6, -150.4], [36.2, -150], [35, -149.2], [34.4, -148]]]
    .map((pts) => tapered(curve(pts as P[], 6), 0.85, "inner", "crown hook", { taper: 1.4, tip: 0.2 }));
  return piece(`<defs>${blur(f, pad(box, 2), headLine.blur!)}${blur(s, pad(box, 2), 0.55)}` +
    `<linearGradient id="${SIDE}" gradientUnits="userSpaceOnUse" x1="0" y1="-120" x2="0" y2="-74">` +
    `<stop offset="0" stop-color="${C.earEdge}" stop-opacity="0"/><stop offset="0.25" stop-color="${C.earEdge}"/><stop offset="0.45" stop-color="${C.earLine}"/>` +
    `<stop offset="0.62" stop-color="${C.earLine}"/><stop offset="0.85" stop-color="${C.warmLine}"/><stop offset="1" stop-color="${C.haunchLine}"/></linearGradient>` +
    `${rootGradient("L", 0.5)}${rootGradient("R", 0.3)}</defs>` +
    `<path d="${edge}" fill="${C.fur}" opacity="0.4" filter="url(#${s})"/>` +
    `<g fill="${headLine.colour}" filter="url(#${f})">${r.svg}</g>` +
    `<g fill="${C.crownLine}" filter="url(#${f})">${hooks.map((h) => `<path d="${h.d}"/>`).join("")}</g>`, box, {
    shapes: [{ name: "head.line", nodes: head.typed, segs: head.segs, outlined: r.outlined, fur: head.fur.map(([a, b]) => [fracAt(head, a), fracAt(head, b)]) }],
    lines: [...r.lines, ...hooks.map((h) => h.line)],
  });
}

/**
 * An ear's paint (the front's recipe, seen from behind), matte: the tan deepening down the ear to a browner tan at its
 * foot, under the fur's own warm shade; a few soft locks, darker partings and lighter strokes along them, curving down
 * its length into the notches between the clumps of its foot; the head's shade along its inner edge, where it tucks
 * under the head's side; a soft light high on the side toward the light (the left ear's outer side, the right ear's
 * inner side); and its line in the warm brown round its outer side and its foot, heavier along the foot and on the ear
 * away from the light, lightening to the crown's own line toward the root, where it carries on the crown's line.
 */
function earPaint(side: "L" | "R"): Paint {
  const k = side === "L" ? -1 : 1;
  const ear = ears[side];
  const deep = uid("deep"), parting = uid("blur"), along = uid("blur"), toRoot = uid("earline"), strand = uid("strand"), top = uid("top");
  const [ex0, ey0, ex1, ey1] = bbox(ear.segs);
  const earBox = pad([ex0, ey0, ex1 - ex0, ey1 - ey0], 2);
  const flip = (pts: P[][]) => pts.map((l) => l.map(([x, y]): P => [-k * x, y]));
  // The partings and lighter strokes, typed for the left ear (the viewer's left) and mirrored for the right.
  const dark = flip([[[-52, -128], [-60, -116], [-66.6, -104], [-70.6, -92], [-72, -82]], [[-46.4, -118], [-52.6, -104], [-57, -90], [-58.6, -76]],
    [[-42.6, -104], [-45.4, -90], [-46.6, -78]]]);
  const light = flip([[[-49, -124], [-56.4, -110], [-62.6, -96], [-65.4, -82]], [[-44.4, -112], [-49.2, -98], [-51.6, -84]]]);
  const softStrokes = (pts: P[][], width: number) => pts.map((l) => strokeOf(curve(l), width, { taper: 6, tip: 0.2 }).d).join("");
  const under = `<defs><linearGradient id="${deep}" gradientUnits="userSpaceOnUse" x1="0" y1="-118" x2="0" y2="-66">` +
    `<stop offset="0" stop-color="${C.earDeep}" stop-opacity="0"/><stop offset="0.4" stop-color="${C.earDeep}" stop-opacity="0.85"/>` +
    `<stop offset="0.78" stop-color="${C.earDeeper}"/><stop offset="1" stop-color="${C.earFoot}"/></linearGradient>` +
    `${blur(parting, earBox, 0.8)}${blur(along, earBox, 1)}` +
    // The line lightens toward the root on the ear toward the light (the sheet's #BB9781 down to y -125 on the left), and
    // only right under the crown on the other (#9A6A46 there on the right).
    // From the root's tan line (rootLine) the ear's line darkens through the crown's light line to the warm brown.
    `<linearGradient id="${toRoot}" gradientUnits="userSpaceOnUse" x1="0" y1="-144" x2="0" y2="${side === "L" ? -112 : -132}">` +
    `<stop offset="0" stop-color="${C.marking}"/><stop offset="${side === "L" ? 0.2 : 0.4}" stop-color="${C.crownLine}"/>` +
    `<stop offset="1" stop-color="${C.warmLine}"/></linearGradient>` +
    `<linearGradient id="${strand}" gradientUnits="userSpaceOnUse" x1="0" y1="-66" x2="0" y2="-86">` +
    `<stop offset="0" stop-color="${C.earLine}" stop-opacity="0.55"/><stop offset="1" stop-color="${C.earLine}" stop-opacity="0"/></linearGradient></defs>` +
    // Its top a little lighter where it comes out from under the crown's fur, in the head patches' paler tan.
    `<linearGradient id="${top}" gradientUnits="userSpaceOnUse" x1="0" y1="-150" x2="0" y2="-138">` +
    `<stop offset="0" stop-color="${C.patch}" stop-opacity="0.4"/><stop offset="1" stop-color="${C.patch}" stop-opacity="0"/></linearGradient>` +
    `<rect x="${fmt(ex0)}" y="${fmt(ey0)}" width="${fmt(ex1 - ex0)}" height="${fmt(ey1 - ey0)}" fill="url(#${deep})"/>` +
    `<rect x="${fmt(ex0)}" y="${fmt(ey0)}" width="${fmt(ex1 - ex0)}" height="${fmt(ey1 - ey0)}" fill="url(#${top})"/>` +
    `<path d="${softStrokes(light, 2.2)}" fill="${C.patch}" opacity="0.14" filter="url(#${along})"/>` +
    `<path d="${softStrokes(dark, 1.5)}" fill="${C.earLow}" opacity="0.4" filter="url(#${parting})"/>`;
  // Along the inner edge, where the ear tucks under the head's side; and its foot.
  const innerD = side === "L" ? "M-38 -132 C-42.6 -118 -43.4 -100 -42.4 -84 L-34 -84 L-34 -132Z" : "M38 -132 C42.6 -118 43.4 -100 42.4 -84 L34 -84 L34 -132Z";
  const footD = `M${k * 82} -92 C${k * 70} -78 ${k * 56} -72 ${k * 36} -72 L${k * 36} -60 L${k * 82} -60Z`;
  const lightD = side === "L" ? pathD(ellipse([-66, -112], 4, 8, 35)) : pathD(ellipse([46, -126], 4, 7, 35));
  const clumps = earClumps[side].slice(1).map(({ notches }) => notches[0]);
  return {
    fill: C.marking,
    under,
    shade: { multiply: C.furShadeBy, rim: { inset: 2.2, toLight: 3.6 }, shapes: [innerD, footD], blur: 3.2 },
    highlight: { d: lightD, colour: C.patch, opacity: 0.3, blur: 2.6 },
    inner: [...dark.map((pts) => ({ pts: curve(pts.slice(-3)), width: 0.7, colour: `url(#${strand})` })),
      // A short parting up from each notch between the foot's clumps, fading out upward.
      ...clumps.map((n) => ({ pts: curve([n, [n[0] - k * 0.5, n[1] - 3.4], [n[0] - k * 0.4, n[1] - 7]]), width: 0.75, colour: `url(#${strand})` }))],
    outline: { ...OUTLINE, colour: C.warmLine, width: 1.3, taper: 2.5, blur: 0.15, spans: side === "L"
      ? [{ from: [-42.2, -142.2], to: [-76.8, -88], width: THIN, colour: `url(#${toRoot})` }, { from: [-77, -90], to: [-38.6, -78], width: 1.45, colour: C.soleLine }]
      : [{ from: [44.8, -143], to: [75.8, -88], width: 1.3, colour: `url(#${toRoot})` }, { from: [75.8, -90], to: [38.2, -80], width: 1.5, colour: C.soleLine }] },
  };
}

/**
 * The tail's cast shadow on the haunches (spec L396; on the tail's bone, clipped to the body): the tail's own shape
 * moved away from the light, soft, in the fur's warm shade, so a band of it shows beside the tail's right side and
 * under its lower lobes, as the sheet paints it there.
 */
function tailOnBody(): Piece {
  const [x0, y0, x1, y1] = bbox(tail.segs);
  const f = uid("blur"), box = pad([x0 + 2.4, y0 + 2, x1 - x0, y1 - y0], 1);
  return piece(`<defs>${blur(f, pad(box, 6), 1.8)}</defs><g filter="url(#${f})"><path d="${pathD(tail.segs)}" transform="translate(2.4 2)" fill="${C.furShade}" opacity="0.85"/></g>`,
    pad(box, 6));
}

/** A cast shadow (spec L396): a soft shape drawn on the caster's bone and clipped to the part it falls on. */
function earOnHead(side: "L" | "R"): Piece {
  const s = earShadow[side];
  const [x0, y0, x1, y1] = bbox(s.segs);
  return soft(pathD(s.segs), [x0, y0, x1 - x0, y1 - y0], C.marking, 1.4, 0.8);
}

/**
 * Paint inside a marking, through its own soft edge (a mask of its shape, blurred as the marking is), so it never
 * shows past the marking's edge (the side's recipe).
 */
function within(name: string, shape: Shape, sd: number, content: (box: Box) => string, lines: DrawnLine[] = []): Piece {
  const [x0, y0, x1, y1] = bbox(shape.segs);
  const box = pad([x0, y0, x1 - x0, y1 - y0], 2), area = pad(box, reach(sd, 0));
  const m = uid("within"), e = uid("blur");
  return piece(`<defs>${blur(e, area, sd)}${mask(m, area, `<path d="${pathD(shape.segs)}" fill="#FFFFFF" filter="url(#${e})"/>`)}</defs>` +
    `<g mask="url(#${m})">${content(box)}</g>`, box, { shapes: [], lines: lines.map((l) => ({ ...l, where: `${name} ${l.where}` })) });
}

/** Fur strands, a few nodes each, drawn as tapered inner lines in one colour inside a marking, soft at their edges. */
function strands(name: string, shape: Shape, sd: number, lines: P[][], o: { colour: string; opacity: number; width: number }): Piece {
  const drawn = lines.map((pts, k) => strokeOf(curve(pts), o.width, { taper: 3, tip: 0.15, band: LIMITS.inner, wobble: 0.08, seed: 5 + k }));
  const f = uid("blur");
  return within(name, shape, sd, (box) => `<defs>${blur(f, pad(box, 2), 0.3)}</defs>` +
    `<g fill="${o.colour}" opacity="${o.opacity}" filter="url(#${f})">${drawn.map((d) => `<path d="${d.d}"/>`).join("")}</g>`,
  drawn.map((d) => ({ kind: "inner" as const, width: o.width, where: "strands", drawn: d.drawn })));
}

export function back(): Drawn[] {
  const out: Drawn[] = [];
  const add = (name: string, p: Piece, state?: string) => out.push({ part: name, piece: p, ...(state ? { state } : {}) });
  // The ground shadow: a wide soft warm oval, behind and beside the haunches as the sheet paints it, a little deeper
  // under the heels and the tail's foot.
  add("shadow", join(soft("M-60 -3.4 a62 5.6 0 1 0 124 0 a62 5.6 0 1 0 -124 0Z", [-60, -9, 124, 11.2], C.shadow, 2.4, 0.85),
    ...([[-38, 11], [37, 10], [-2, 9]] as [number, number][]).map(([x, rx]) =>
      soft(`M${x - rx} -0.6 a${rx} 1.8 0 1 0 ${2 * rx} 0 a${rx} 1.8 0 1 0 ${-2 * rx} 0Z`, [x - rx, -2.4, 2 * rx, 3.6], C.contact, 1.2, 0.5))));
  for (const side of ["L", "R"] as const) add(`hind.${side}`, roomy(part(`hind.${side}`, hind[side], hindPaint(side)), 6));
  for (const side of ["L", "R"] as const) add(`ear.${side}`, part(`ear.${side}`, ears[side], earPaint(side)));
  add("head.base", part("head.base", head, headPaint));
  add("shadow.ear.L", earOnHead("L"));
  add("shadow.ear.R", earOnHead("R"));
  add("head.line", headLinePiece());
  add("tuft", part("tuft", tuft, {
    fill: C.fur,
    shade: { multiply: C.furShadeBy, rim: { inset: 3, toLight: 4.5 }, group: headGroup, keep: ["M-40 -168 L40 -168 L40 -150 L-40 -150Z"], blur: 2.4 },
    highlight: { d: headLight, colour: C.light, opacity: 0.4, blur: 4 },
    // The lobes' lines curl in at their feet and into the notch between them, as the sheet draws them.
    inner: [
      { pts: [[-16.2, -156.4], [-14.6, -155.2], [-12.6, -154.8]], width: 0.85, colour: C.crownLine, opacity: 0.8 },
      { pts: [[1.4, -157.2], [2.2, -155.2], [1.6, -153.4]], width: 0.8, colour: C.crownLine, opacity: 0.7 },
      { pts: [[22, -156.2], [20.6, -155.2], [18.2, -155]], width: 0.85, colour: C.crownLine, opacity: 0.8 },
    ],
    // One line round both lobes and into the notch between them, from where the left lobe meets the crown to where the
    // right one does, so the topknot and the crown's line read as one outline.
    outline: { ...OUTLINE, colour: C.fluffLine, width: THIN, taper: 1.6, spans: [{ from: [-17.2, -154.6], to: [18.6, -153.8] }] },
    feather: { from: [0, -150.8], to: [0, -154.6] },
  }));
  add("body.back", roomy(part("body.back", body, backPaint), 1));
  // The saddle's left half, soft but defined, with a few darker strands in it following the back's round; its strip on
  // the left flank; its right half over the spine above the tail.
  add("back.patch.L", join(marking("back.patch.L", { shape: body, paint: backPaint }, saddleL, { fill: C.marking, blur: 0.6, clip: true }),
    marking("back.patch.L", { shape: body, paint: backPaint }, flankL, { fill: C.marking, blur: 0.7, clip: true }),
    strands("back.patch.L", saddleL, 0.6, [[[-14, -50], [-15.6, -44], [-15.4, -37.4]], [[-8.4, -55], [-10.6, -48], [-10.8, -40]], [[-3.4, -56], [-5, -50], [-5.4, -43]]],
      { colour: C.earDeep, opacity: 0.2, width: 0.8 })));
  add("back.patch.R", marking("back.patch.R", { shape: body, paint: backPaint }, saddleR, { fill: C.marking, blur: 0.6, clip: true }));
  add("shadow.tail", tailOnBody());
  add("tail", part("tail", tail, tailPaint));
  add("tail.base", marking("tail.base", { shape: tail, paint: tailPaint }, tailBase, { fill: C.patch, blur: 0.9, clip: true }));
  // The collar (the front's recipe, from behind): the band's blue, lit along its top toward the light, its lower part in
  // shade where it turns under toward the shoulders, and a dark blue rim all round, as the sheet paints it.
  add("collar", part("collar", collar, {
    fill: C.collar,
    // Its lower part in shade, where it turns under toward the shoulders: about two fifths of the band, as the sheet paints it.
    shade: { multiply: C.shadeBy, shapes: ["M-32 -67.4 C-16 -69.8 16 -69.8 32 -67.4 L32 -58 L-32 -58Z"], blur: 0.8 },
    highlight: { d: "M-26 -71.4 C-15 -73.8 0 -74.4 16 -73.8 L16 -70.8 C0 -71.6 -15 -71.2 -26 -68.8Z", colour: C.collarHighlight, opacity: 0.5, blur: 1 },
    outline: { colour: C.collarLine, width: THIN, taper: 3, blur: 0.2 },
  }));
  return out;
}

/**
 * Points the sheet has no finder for, where this drawing puts them (dev output for the sheet match): each hind paw's
 * heel at the middle of what shows of it (between its outer side and where its sole goes behind the haunch, and
 * between where it comes out from under the haunch and its sole). The seat, on the body's midline at its foot, lies
 * behind the tail's foot in this view, so the sheet match finds the ground itself (DECISIONS 9).
 */
export const landmarks: Record<string, P> = {
  "paw.hind.L": [-42.4, -5.4],
  "paw.hind.R": [41.2, -5],
};
