// The dog's back view (the dog seen from behind: its left on the viewer's left,
// format README), shapes first, every node typed by hand in model space
// (points, the ground under the seat at 0, 0, y down) at the extremes and
// inflections read off the back turnaround (master.turnaround.back) at its own
// scale (DECISIONS 5), then paint by the front's and the side's recipes. There is
// no face: the head from behind is the crown and its two-lobed topknot, the ears
// hanging at its sides, the back of the head and the collar's band round the
// neck. The tail lies in front of the body (spec L298), its tan root showing
// inside its curl. One light group holds the haunches and the hind paws, one the
// head and its topknot.
import { furEdge, furSpan, type Lock } from "../../../draw/fur.ts";
import { bbox, ellipse, fracAt, mirrorX, pathD, sample, smooth, spanPoints, v, type Node, type P, type Shape } from "../../../draw/geom.ts";
import { ribbons, strokeOf, type DrawnLine, type Outline, type Stroke } from "../../../draw/line.ts";
import { LIMITS, reach } from "../../../draw/lint.ts";
import { grain, marking, part, soft, type Paint } from "../../../draw/paint.ts";
import { blur, join, mask, pad, piece, uid, type Box, type Piece } from "../../../draw/svg.ts";
import { C } from "../palette.ts";
import type { Drawn } from "./front.ts";

/** Lines on fur spans and small parts: lighter, and never under 1.2 pt (as the front draws them). */
const THIN = 1.2;
const OUTLINE: Outline = { colour: C.outline, width: 1.54, taper: 6, blur: 0.2 };

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const fmt = (n: number) => r3(n).toString();
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
/** Typed for the viewer's left, mirrored to the right. */
const flipX = (lines: P[][]): P[][] => lines.map((l) => l.map(([x, y]): P => [-x, y]));
/** A painted fur grain under a part's shade (paint.ts grain): the sheet's fills vary by a few tenths of L* (DECISIONS 84). */
const furGrain = (box: Box, seed: number, amount = 0.08) => grain(box, { light: C.light, dark: C.furShade, amount, scale: [0.9, 3.4], seed });
const boxOf = (s: Shape, by = 1): Box => {
  const [x0, y0, x1, y1] = bbox(s.segs);
  return pad([x0, y0, x1 - x0, y1 - y0], by);
};

// Shapes.

// The head from behind: a full round mass. Its crown runs out from under the
// topknot's feet in two broad locks a side, as the sheet draws it: on the left
// the first flat at y -156 out to its tip at x -31, where the line steps down to
// the second, which runs down to its tip over the ear's root (-41.6, -144, the
// silhouette's step there); on the right the first runs further out, to x 39.6,
// and the second is short. Under each lowest tip the crown's fur turns in over
// the ear's root, hanging in a few small locks, so the ear's tan shows below it
// and rises to a point under the head's side (the crescent, -30.6, -138.8). From
// there the side runs down over the ear's inner edge, widest at x -39.4 (the
// sheet's line at -39.4 to -38.6 from y -118 to -96), and rounds into a full
// lower lobe that rests on the collar's end (the sheet's notch beside the collar
// begins only at y -71); its foot lies behind the collar and the shoulders.
// Typed as its left half (the viewer's left, the dog's left), mirrored, the right
// crown typed where the sheet draws it.
const headHalf: Node[] = [[0, -152.6], [-16.4, -155.6], [-26.4, -156.2], [-30.6, -153.8], [-32.4, -150.4], [-37.6, -147.8], [-41.6, -144],
  [-37.4, -142], [-30.6, -138.8], [-33.2, -128.4], [-37.8, -119.8], [-39.4, -108], [-39, -92], [-38.8, -80], [-36.8, -71.6], [-30.2, -70.2], [-20, -63]];
const HEAD_FOOT: Node = [0, -58.6];
/** The notch between the crown's two locks, the lowest lock's tip, and the crescent under it (indices in headHalf). */
const NOTCH = 4, CRESCENT = 8;
/**
 * The right crown is not the left's mirror on the sheet: its first lock runs on to x 39.6 at y -150.4 before the
 * line steps down to the second, short one, whose tip (44, -143.6) is where the ear comes out under it. Typed from
 * the crescent up; the rest of the right side is the left's mirror.
 */
const rightCrown: Node[] = [[30.8, -139.2], [38.4, -141.8], [44, -143.6], [40.4, -147.8], [39.4, -150.6], [30.4, -155.4]];
const mirrored = mirrorX(headHalf, false).slice(0, -1);
const at = headHalf.length - 1 - CRESCENT;
const headNodes: Node[] = [...headHalf, HEAD_FOOT, ...mirrored.slice(0, at), ...rightCrown, ...mirrored.slice(headHalf.length - 2)];
const RIGHT_CRESCENT = headHalf.length + 1 + at, RIGHT_NOTCH = RIGHT_CRESCENT + 3;
let head = smooth(headNodes, { typed: headHalf.length + 1 + rightCrown.length, corners: [NOTCH, CRESCENT, RIGHT_CRESCENT, RIGHT_NOTCH] });
// Under each lowest lock the crown's fur hangs over the ear's root in a few small, uneven locks, leaning out.
const overhang: Lock[] = [{ len: 0.9, w: 1, lean: -0.35 }, { len: 0.55, w: 0.7, lean: -0.3 }, { len: 1.1, w: 1.25, lean: -0.4 }];
// Round each of the head's lower lobes, over the ear's inner foot, the fur breaks into a few small clumps.
const corner: Lock[] = [{ len: 0.8, w: 1, lean: 0.3 }, { len: 1, w: 1.2, lean: 0.35 }, { len: 0.7, w: 0.9, lean: 0.3 }];
head = furEdge(head, [-40.8, -143.4], [-31.6, -139.2], overhang, 0.4);
head = furEdge(head, [-38.8, -82], [-33.6, -70.8], corner, 0.42);
head = furEdge(head, [33.6, -70.8], [38.8, -82], reversed(corner), 0.42);
head = furEdge(head, [31.8, -139.6], [43.2, -143.2], reversed(overhang), 0.4);
// The crown's locks from each of the topknot's feet to the lowest tip are fur (the dog's head tuft, L508).
head = furSpan(furSpan(head, [-16.6, -155.6], [-41.4, -143.6]), [43.8, -143.4], [16.6, -155.6]);

// The topknot: two round fur lobes on the crown, as the sheet draws them from
// behind, the left one a little the taller (the head's top, -164 at x -9.6),
// their lines meeting in a V at the notch between them; each comes down to the
// crown's line at its foot; its base lies on the crown, hidden.
const TUFT_NOTCH = 7;
const tuft = furSpan(smooth([[-16.6, -154.8], [-16.4, -158.6], [-14.6, -161.8], [-11.6, -163.8], [-8, -164.3], [-4.6, -163.4], [-1.8, -161], [2.4, -155.8],
  [4.6, -159.4], [8.4, -162.2], [12.8, -163], [17, -162.8], [20.8, -161], [22.6, -158], [21.6, -155.4], [18.8, -154], [10, -150.6], [-4, -150.6],
  [-13.6, -152.4]], { corners: [TUFT_NOTCH] }), [-16.6, -154.8], [18.8, -154]);

// The ears from behind: broad tan droplets hanging at the head's sides from
// high on the crown, as the sheet draws them. Each runs up under the crown to
// its root, its top hidden there, and comes out under the lowest lock's tip, its
// outer edge carrying on the crown's line down and out to the ear's widest
// (x -77.4 on the left at y -92, 76 on the right at -97); its foot hangs in two
// big, unequal clumps and a small step on its outer side, the inner clump the
// biggest and lowest (the tips), its inner bottom corner clear of the head's
// lower lobe; its inner edge runs up under the head's side, hidden.
const earLNodes: Node[] = [[-28.4, -141.8], [-34.6, -144.6], [-38.8, -145.6], [-41.8, -143.6], [-43.6, -141], [-49.6, -135.1], [-56.6, -128.6], [-62.6, -120.2],
  [-68.4, -114.4], [-73, -108.4], [-76.2, -101], [-77.4, -92.4], [-76.2, -86.6], [-73.4, -81.6], [-69, -76.8], [-63.6, -72.4], [-57, -69.4], [-49.6, -67.8],
  [-44.2, -68.4], [-40.4, -71.2], [-38.4, -76.2], [-35.6, -88], [-34.4, -104], [-31.6, -126]];
const earRNodes: Node[] = [[28.6, -142.6], [36.4, -145.2], [41, -145.4], [44, -143.4], [47.4, -140.6], [49.6, -138], [55.8, -131.5], [61.2, -124.6], [67, -118.8],
  [72.2, -112.6], [75, -105.8], [76, -97], [75.6, -88.6], [73.2, -82], [68.6, -76.8], [62.2, -72.4], [54, -69.8], [48, -68.8], [44, -69.6],
  [40.4, -71.8], [38.4, -76], [36.2, -88], [35.4, -104], [31.8, -126]];
/** Each ear's foot from its outer side in: a small step, a middle clump and the big inner clump, lowest under its middle. */
const footLocks: Lock[] = [{ len: 0.8, w: 0.55, lean: 0.3 }, { len: 1.5, w: 1.4, lean: 0.2 }, { len: 1.6, w: 2.2, lean: 0.05 }];
const footLocksR: Lock[] = [{ len: 0.8, w: 0.6, lean: 0.3 }, { len: 1.4, w: 1.3, lean: 0.2 }, { len: 1.6, w: 2.3, lean: 0.05 }];
/** Each clump of each ear's foot: its tip, root and notches, for the partings drawn up into it. */
const earClumps: Record<"L" | "R", { tip: P; root: P; notches: [P, P] }[]> = { L: [], R: [] };
const ears = {
  L: furEdge(smooth(earLNodes), [-76.6, -88.4], [-41.6, -69.8], footLocks, 0.45, (tip, root, notches) => earClumps.L.push({ tip, root, notches })),
  R: furEdge(smooth(earRNodes), [75.4, -86.6], [41.6, -71.6], footLocksR, 0.45, (tip, root, notches) => earClumps.R.push({ tip, root, notches })),
};

// The ears' soft contact shadow on the head (DECISIONS 25, 77): the warm band
// inside the head's side, in the head patches' paler tan deepening to the ears'
// tan at the head's edge, as the sheet paints it (#E6B280 to #F2B589 there): from
// the crescent under the crown, where the ear's tan shows below the crown's
// locks, down to y -86; its inner edge, where the cream lies over it, a soft wave
// (x -33.6 at y -126, -34.4 at -121, in to -32.8 from y -116 to -109, out to -37.4
// by -88), as the sheet's; typed with bleed past the head's edge, which the
// head's clip takes off.
const earShadowL: Node[] = [[-44, -146], [-36.4, -142.4], [-31.6, -138.6], [-31.8, -133.4], [-33.6, -126.4], [-34.4, -121.2], [-32.8, -116.4], [-32.8, -109],
  [-33.2, -103], [-34.2, -97.6], [-35.6, -92.6], [-37.4, -88.2], [-39.6, -85], [-46, -90], [-46, -130]];
const earShadow = { L: smooth(earShadowL), R: smooth(mirrorX(earShadowL)) };

// The collar from behind: a band round the back of the neck, arching up over the
// nape (its top 75.3 pt high at the middle, its foot 65.5), about 10 pt deep at
// the middle and 8 at its ends, which drop as they turn round the neck and end
// near square, sunk in the fur, the right reaching a little further out, as the
// sheet draws it.
const collar = smooth([[-27.6, -70.3], [-24.8, -71.5], [-18, -73.4], [-9, -74.6], [0, -74.9], [9, -74.6], [17, -73.6], [24.4, -71.7], [29.6, -70.2], [30.4, -69.2],
  [30.5, -66], [30.4, -62.9], [29.6, -62.2], [24, -63.2], [16, -64.6], [6, -65.5], [-6, -65.5], [-16, -64.8], [-23.6, -63.2], [-27.8, -61.9], [-28.6, -62.6],
  [-28.7, -66], [-28.6, -69.4]]);

// The body from behind: the shoulders come out from under the collar's ends
// and run down and out, a soft lock or two under each collar end, to a notch at
// y -40 where the haunch's round begins outside them; each haunch bulges out to
// its widest at y -23 (x -49.4 on the left; the right is 2.5 pt narrower, as the
// sheet draws it) and turns in under itself over the hind paw, whose heel peeks
// out below it; the bottom runs along the ground between the haunches, behind
// the tail's foot. Typed as its left half, mirrored, the right haunch drawn in.
const bodyHalf: Node[] = [[0, -67], [-24, -66.4], [-29.4, -61.8], [-32.8, -57.6], [-36.2, -51.6], [-38.4, -45.6], [-39.6, -40.6], [-43.4, -38.4],
  [-46.8, -34.6], [-48.9, -29], [-49.4, -23], [-48.6, -17], [-46.4, -12.6], [-42.2, -8], [-36, -4.4], [-28.4, -1.9], [-14, -1.5]];
const BODY_FOOT: Node = [0, -1.5];
/** The notch where each haunch's round begins outside the shoulder (a concave corner). */
const NOTCH_B = 6;
/** The right haunch is narrower than the left on the sheet (x 46.9 at its widest against -49.4): drawn in by up to 2.5 pt round y -24. */
const narrow = ([x, y]: Node): Node => [x - 2.5 * Math.max(0, 1 - ((y + 24) / 16) ** 2), y];
const bodyNodes: Node[] = [...bodyHalf, BODY_FOOT, ...mirrorX(bodyHalf, false).slice(0, -1).map(narrow)];
const shoulderLocks: Lock[] = [{ len: 0.7, w: 1, lean: 0.3 }];
const body = furEdge(furEdge(smooth(bodyNodes, { typed: bodyHalf.length + 1, corners: [NOTCH_B, bodyHalf.length + bodyHalf.length - NOTCH_B] }),
  [-33, -57.2], [-36, -52.4], shoulderLocks, 0.55), [36, -52.4], [33, -57.2], reversed(shoulderLocks), 0.55);

// The hind paws: from behind only each heel shows, a round foot peeking out
// under the haunch's lower outer corner (from its notch at y -12.6 on the left,
// -11.5 on the right) and sitting on the ground below it; the rest lies behind
// the haunch.
const hind = {
  L: smooth([[-46.2, -13.8], [-47.2, -10.4], [-46.4, -6.8], [-44.2, -4], [-40.6, -2.1], [-35, -1.3], [-28, -1.3], [-24, -3], [-24.4, -8], [-29, -13.6], [-36, -16.4],
    [-42, -16]]),
  R: smooth([[45.4, -13.6], [46.4, -10.2], [45.4, -6.6], [43, -3.8], [39.6, -2.1], [34.6, -1.3], [28, -1.3], [24, -3], [24.4, -8], [29, -13], [35.6, -15.8],
    [41.6, -15.4]]),
};

// The tail, in front of the body: a round fluffy plume sitting between the
// haunches, as the sheet draws it. Its tip curls up and over to the left above
// the saddle and hooks down into it, ending in a pointed tuft (-9.8, -24.2); the
// hook's underside runs up from there over the saddle to the curl's inner bend
// (0.9, -33.8), then up its left side to the round head of the curl (its top at
// y -48.8); down its right side the plume hangs in four clumps of different
// sizes, each tucked under the one above at a notch (the sheet's at y -30.7,
// -18.7 and x 20.7 and 7.3 along its foot), the lower right one the fullest;
// round its foot a broad lobe bulges out to the left over the left haunch and
// rests on the ground a little below the haunches' line.
/** The pointed tuft at the hook's end, and the hook's inner bend over the saddle. */
const TAIL_TIP = 0, TAIL_BEND = 3;
/** Each clump of the plume: its tip, root and notches, for the shades and partings drawn inside it. */
const tailLocks: { tip: P; root: P; notches: [P, P] }[] = [];
const tail = furSpan(furEdge(smooth([[-9.8, -24.2], [-5.6, -28.4], [-1.4, -31.2], [0.9, -33.8], [0.8, -39.6], [2.6, -45], [7, -48.6], [13.6, -49],
  [20.4, -46], [27.2, -39.8], [30.1, -31], [30, -24.6], [28.9, -18.4], [25, -10.2], [20.4, -5], [13, -2.6], [7.2, -2.1], [0, -1.2], [-5.6, -3.2],
  [-9.6, -8.2], [-11, -15]], { corners: [TAIL_TIP] }),
[20.4, -46], [7.2, -2.1], [{ len: 1.1, w: 1.9, lean: 0.3 }, { len: 1.4, w: 1.2, lean: 0.25 }, { len: 1.6, w: 1.6, lean: 0.25 }, { len: 1.1, w: 1.35, lean: 0.2 }], 0.42,
(tip, root, notches) => tailLocks.push({ tip, root, notches })), [-9, -25.2], [-10.4, -21.6]);
/**
 * The tail's root, where it leaves the rump (rig.json's tail pivot in this view): the middle of its tan root as it shows
 * from behind (phase 2's patch there centres on -5.7, -23.7), at the side view's root height (-23), on the tail.
 */
export const TAIL_ROOT: P = [-5, -24];

// Markings.

// The saddle from behind (DECISIONS 23, 24): it crosses the spine just behind
// the collar (its top 6 pt below the collar's foot), its upper edge reaching as
// far to the dog's right (x 21.6) as to its left (x -21.4); below that it lies
// left of the spine down to the tail's root, its left edge breaking into small
// rounded lumps of fur, and the tail covers the rest. The left half
// (back.patch.L) runs on 3.6 pt past the spine under the right half, so the two
// meet with no seam; on the left flank a strip of it shows just inside the
// outline from y -54 to -40, where the saddle wraps round the side. Typed with
// bleed under the tail and past the body's edge, which the tail and the body's
// clip hide.
const saddleL = furEdge(furEdge(smooth([[3.6, -59.6], [-3, -59.6], [-8.6, -58.4], [-12.8, -56.6], [-15.4, -54.2], [-17.6, -50.4], [-20.2, -46.4], [-21, -41.6],
  [-20.2, -37], [-18.4, -32.6], [-15.4, -29.4], [-11.6, -26.8], [-8.4, -24.8], [-3, -24.4], [3, -30], [4.6, -40], [4.2, -52]]), [-1, -59.6], [-13.6, -56],
[{ len: 0.8, w: 1, lean: 0.1 }, { len: 1.1, w: 1.3, lean: 0 }, { len: 0.7, w: 0.8, lean: -0.1 }, { len: 0.9, w: 1, lean: 0 }], 0.48), [-14.8, -55.4], [-16.6, -30],
[{ len: 0.9, w: 0.9, lean: 0.1 }, { len: 1.2, w: 1.2, lean: 0 }, { len: 0.7, w: 0.8, lean: -0.1 }, { len: 1.1, w: 1.1, lean: -0.1 }, { len: 0.8, w: 0.9, lean: 0 }], 0.48);
const flankL = smooth([[-41.6, -53], [-37.6, -54.6], [-35.4, -50.6], [-35.4, -45.4], [-36.8, -41.4], [-39.8, -39.2], [-42, -44]]);
const saddleR = furEdge(smooth([[-1.2, -60], [4, -59.2], [8.4, -58.2], [12.4, -56.8], [16, -54.8], [19, -52.2], [20.8, -48.8], [21.4, -45], [19, -42], [10, -44],
  [1, -44], [-1.4, -52]]), [1.4, -59.6], [20.4, -49.4], [{ len: 0.8, w: 1, lean: 0.1 }, { len: 1.1, w: 1.2, lean: 0.1 }, { len: 0.8, w: 0.9, lean: 0.15 },
  { len: 0.9, w: 1, lean: 0.2 }], 0.48);
// The tail's tan root, where it shows from behind inside the curl, under the hook: pale, the paler painted tan, as
// the sheet paints it there (#F0BC8B; DECISIONS 17), fading into the plume's cream below.
const tailBase = smooth([[-12.6, -19.4], [-11.6, -26.6], [-7.6, -30.6], [-2.4, -33.6], [1.2, -32.4], [0.8, -27], [-1.6, -21.4], [-6.6, -18.2]]);

// Paint.

/** The fur's one shade (the front's recipe): the fur's own warm multiply on the rim away from the light and under overhangs. */
const furShade = (group: Shape[], shapes: string[] = [], keep: string[] = [], rim = { inset: 2.5, toLight: 4 }, sd = 2.4) =>
  ({ multiply: C.furShadeBy, rim, shapes, keep, group, blur: sd });
const hipGroup = [body, hind.L, hind.R];
const headGroup = [head, tuft];

const backPaint: Paint = {
  fill: C.fur,
  under: furGrain(boxOf(body), 3),
  // Broad and soft, as the sheet paints it: the shoulders under the collar, where the neck turns in under it; each
  // haunch's lower half, turning under toward the ground, deepest at its outer bottom; the right haunch's round, away
  // from the light; and the rim away from the light.
  shade: furShade(hipGroup, ["M-31 -63.6 C-20 -57 20 -57 31 -63.6 L31 -70 L-31 -70Z",
    pathD(ellipse([-28, -3], 17, 7, -8)), pathD(ellipse([30, -3], 18, 7.6, 8)), pathD(ellipse([48, -24], 4, 13, 0))], [], { inset: 2.5, toLight: 4 }, 4.2),
  // The light from the top left on the left haunch's round and the left shoulder.
  highlight: { d: `${pathD(ellipse([-36, -29], 7.5, 11, 10))} ${pathD(ellipse([-27, -52], 5, 3.4, -30))}`, colour: C.light, opacity: 0.3, blur: 4.5 },
  // Lines as the sheet draws them from behind: down each shoulder from under the collar's end the haunches' line,
  // deepening at the notch; round each haunch's round the same, warmer on the right, away from the light; where the
  // haunch lies over the hind paw's heel a soft fold that fades out before the ground; along the ground the outline's
  // brown.
  outline: { ...OUTLINE, colour: C.haunchLine, width: 1.3, taper: 4, spans: [
    { from: [-29.4, -61.6], to: [-39.4, -41.4], width: THIN },
    { from: [-39.8, -40.2], to: [-46.6, -13.4], width: 1.25 },
    { from: [-46.2, -12.4], to: [-37.4, -6], width: 1.2, colour: C.softLine },
    { from: [-26, -1.7], to: [26, -1.7], width: 1.6, colour: C.outline },
    { from: [38.4, -6.4], to: [44.8, -11.6], width: 1.2, colour: C.softLine },
    { from: [45.4, -12.6], to: [39.8, -40.2], width: 1.35, colour: C.haunchShadeLine },
    { from: [39.4, -41.4], to: [29.4, -61.6], width: THIN },
  ] },
};

/** A heel's line: round its outer side and along the ground, the outline's brown, carrying on the haunch's line. */
function hindPaint(side: "L" | "R"): Paint {
  const sx = side === "L" ? -1 : 1, sole = uid("sole");
  return {
    fill: C.fur,
    shade: furShade(hipGroup, [pathD(ellipse([-28, -3], 17, 7, -8)), pathD(ellipse([30, -3], 18, 7.6, 8))], [], { inset: 2.5, toLight: 4 }, 4.2),
    under: `<defs><linearGradient id="${sole}" gradientUnits="userSpaceOnUse" x1="0" y1="-12" x2="0" y2="-3">` +
      `<stop offset="0" stop-color="${side === "L" ? C.haunchLine : C.warmLine}"/><stop offset="1" stop-color="${C.outline}"/></linearGradient></defs>`,
    outline: { ...OUTLINE, colour: `url(#${sole})`, width: 1.5, taper: 3, spans: side === "L"
      ? [{ from: [-46.8, -12.8], to: [-25, -1.6] }]
      : [{ from: [46.2, -11.4], to: [25, -1.6] }] },
    feather: { from: [sx * 30, -16], to: [sx * 32, -12] },
  };
}

/** The shade under each of the plume's clumps, where it tucks under the one above, and the plume's foot. */
const tailShades = tailLocks.map(({ tip, notches }) => {
  const [, b] = notches, mid = v.mul(v.add(tip, b), 0.5);
  const inward = v.norm(v.sub([12, -24], mid));
  const c = v.add(mid, v.mul(inward, 2.2));
  const ang = (Math.atan2(b[1] - tip[1], b[0] - tip[0]) * 180) / Math.PI;
  return pathD(ellipse(c, 4.6, 1.9, ang));
});

const TAIL_SIDE = uid("tailside");
const tailPaint: Paint = {
  fill: C.fur,
  under: furGrain(boxOf(tail), 9),
  // Its right side and foot away from the light; under each clump where it tucks under the one above; and in the
  // hook's inner bend, where the curl rolls over the saddle.
  shade: { multiply: C.furShadeBy, rim: { inset: 2, toLight: 3.4 }, shapes: ["M-12 -4 C-2 0 14 -1 28 -7 L28 1 L-12 1Z", ...tailShades], blur: 2 },
  highlight: { d: `${pathD(ellipse([8.6, -44], 7.6, 3.6, -8))} ${pathD(ellipse([-4, -12], 4.4, 6, 0))}`, colour: C.light, opacity: 0.4, blur: 2.8 },
  inner: [
    // Where each clump tucks under the one above, its edge runs on a little way into the plume, as the sheet draws it.
    // Each clump lies over the one above it: from each notch its upper edge runs on inside the plume, round the clump
    // a couple of points in from its edge, as the sheet draws it (the longest round the lower right clump).
    ...tailLocks.slice(1).map(({ notches, tip }) => {
      const n = notches[0], into = v.norm(v.sub([10, -22], n)), towards = v.sub(tip, n);
      const p1 = v.add(v.add(n, v.mul(towards, 0.3)), v.mul(into, 1.7)), p2 = v.add(v.add(n, v.mul(towards, 0.75)), v.mul(into, 2.6));
      return { pts: curve([n, p1, p2], 6), width: 0.7, colour: C.softLine, opacity: 0.85 };
    }),
    // The curl's head: its fur rolling over at the top, and a strand down the hook.
    { pts: curve([[14.6, -45.4], [18.4, -44], [21.4, -41.2]], 6), width: 0.7, colour: C.softLine, opacity: 0.85 },
  ],
  // A soft line as the sheet draws it: under the hook, where it lies over the saddle, the ears' deep line; up the
  // curl's left side, over the saddle, the ears' outline; over the curl's head toward the light the light warm line;
  // down its right side the haunches' line, deepening round its foot to the outline's brown; and up its left side over
  // the haunch, coming in light under the hook and deepening to the ground.
  outline: { ...OUTLINE, colour: C.haunchLine, width: 1.3, taper: 2.4, spans: [
    { from: [-9.6, -24.4], to: [0.9, -33.6], width: 1.4, colour: C.earEdge },
    { from: [0.8, -33.4], to: [4.6, -46.4], width: 1.3, colour: C.earEdge },
    { from: [4.2, -46.6], to: [21, -45.4], width: THIN, colour: C.crownWarm },
    { from: [20.6, -45.8], to: [26, -9.6], width: 1.3, colour: C.haunchLine },
    { from: [26.4, -10.4], to: [7, -1.4], width: 1.45, colour: C.warmLine },
    { from: [7.4, -1.6], to: [-9.6, -8.4], width: 1.6, colour: C.outline },
    { from: [-9.4, -7.6], to: [-10.2, -22.6], width: 1.25, colour: `url(#${TAIL_SIDE})` },
  ] },
};
const headLight = `${pathD(ellipse([-9, -140], 15, 9, -10))}`;
const WHORL: P = [2, -151.6];
/** The crown's whorl under the topknot's V: long soft strokes parting from it, combed down and out over the head's upper third, some toward the ears' roots. */
const whorl: { pts: P[]; light: boolean }[] = [
  { pts: [WHORL, [-1.6, -146], [-5.4, -139], [-8.4, -131]], light: false },
  { pts: [WHORL, [4.4, -146], [7.6, -139.4], [9.4, -132]], light: false },
  { pts: [WHORL, [-4.4, -149.6], [-12, -145.6], [-19, -139.4]], light: false },
  { pts: [WHORL, [7, -149.2], [14.6, -145], [21.4, -139.4]], light: false },
  { pts: [[-8, -148.8], [-16.4, -146.4], [-24, -142.6], [-28.6, -139.4]], light: false },
  { pts: [[11, -148.6], [19.4, -146.4], [26.6, -142.6], [30.6, -139.4]], light: false },
  { pts: [WHORL, [1.4, -145], [0.6, -137], [0.4, -128]], light: true },
  { pts: [WHORL, [-2.8, -147.6], [-9, -141.4], [-13.6, -134.4]], light: true },
  { pts: [WHORL, [5.6, -147.6], [11.6, -141.6], [15.6, -134.6]], light: true },
];

const headPaint: Paint = {
  fill: C.fur,
  under: furGrain(boxOf(head), 5) + whorlStrokes(),
  // Low on the back of the head, where it warms toward the collar and turns under it; and the rim away from the
  // light. The crown stays light out to its line, as the sheet paints it.
  shade: furShade(headGroup, ["M-38 -80 C-22 -73 22 -73 38 -80 L38 -60 L-38 -60Z"], ["M-50 -172 L50 -172 L50 -138 L-50 -138Z"], { inset: 3, toLight: 4.5 }, 3.2),
  highlight: { d: headLight, colour: C.light, opacity: 0.32, blur: 6 },
};

/** The whorl's strokes: soft tone in the cream, a little darker and a little lighter than the fill, no line ends. */
function whorlStrokes(): string {
  const f = uid("blur");
  const box: Box = [-34, -156, 68, 30];
  const strokes = (light: boolean) => whorl.filter((w) => w.light === light)
    .map((w) => strokeOf(curve(w.pts, 6), light ? 1.4 : 1.1, { taper: 4, tip: 0.1, wobble: 0.1, seed: 3 }).d).join("");
  return `<defs>${blur(f, pad(box, 3), 0.9)}</defs><g filter="url(#${f})">` +
    `<path d="${strokes(false)}" fill="${C.furShade}" opacity="0.75"/><path d="${strokes(true)}" fill="${C.light}" opacity="0.25"/></g>`;
}

/**
 * The head's line, where the sheet draws one: the crown's warm line from under each of the topknot's feet over its
 * two locks to the lowest lock's tip, where the ear's line takes it on; over the second lock it runs over the ear's
 * root and turns to the root's tan (DECISIONS 76), so the ear's own edge shows along the crown's. None under the
 * lowest lock, where the crown's fur hangs over the root's tan. Down each side, where the head lies over the ear, a
 * smooth line that comes in from nothing below the crescent, deepens to the ears' deep tan by y -100, where the
 * sheet's is darkest (#A96737), warms to the warm line by y -86 (#A56B45) and lightens to the haunches' light line
 * round the head's lower lobe toward the collar's end.
 */
const SIDE = uid("side"), ROOT = { L: uid("root"), R: uid("root") };
const headLine: Outline = { ...OUTLINE, taper: 1.2, blur: 0.15, spans: [
  { from: [-16.8, -155.7], to: [-41.6, -144], width: 1.45, colour: `url(#${ROOT.L})` },
  { from: [44, -143.6], to: [37, -151.4], width: 1.6, colour: `url(#${ROOT.R})` },
  { from: [37.6, -151.2], to: [16.8, -155.7], width: 1.35, colour: C.crownWarm },
] };
const sideLine: Outline = { ...OUTLINE, taper: 4, blur: 0.15, spans: [
  { from: [-37.6, -120.6], to: [-32, -70.4], width: 1.25, colour: `url(#${SIDE})` },
  { from: [32, -70.4], to: [37.6, -120.6], width: 1.25, colour: `url(#${SIDE})` },
] };

/** Each root's line turns from the crown's warm line to the root's tan along the lowest lock (the sheet's #C5A27F there). */
const rootGradient = (id: string, from: P, to: P) =>
  `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${from[0]}" y1="${from[1]}" x2="${to[0]}" y2="${to[1]}">` +
  `<stop offset="0.5" stop-color="${C.crownWarm}"/><stop offset="0.85" stop-color="${C.rootTan}"/></linearGradient>`;

/** Fur wisps: the cream lying out over the tan in a few soft, pointed locks, each wide at its root in the cream. */
const wispsL: P[][] = [
  // Down the head's side, over the band.
  [[-31, -123], [-33.2, -120.2], [-35, -118.4]], [[-30.8, -111], [-32.8, -108], [-34.6, -106.4]],
];

function headLinePiece(): Piece {
  const f = uid("blur"), s = uid("blur"), w = uid("blur");
  const r = join2(ribbons(head, headLine, "head.line", 0.5), ribbons(head, sideLine, "head.line", 0.5));
  const box = boxOf(head, 4);
  // Under each lowest lock and down to y -121 the crown's cream lies out over the root's tan in a feathered edge, so
  // the tan tucks in under the cream with no cut edge, as the sheet paints it.
  const feathered = (spans: [P, P][], width: number) => spans.map(([a, b]) =>
    strokeOf(spanPoints(head, fracAt(head, a), fracAt(head, b)), width, { taper: 3, tip: 0.4 }).d).join("");
  const edge = feathered([[[-40.6, -143.6], [-37.6, -121]], [[37.6, -121], [43.6, -143.4]]], 1.6);
  // At each first lock's tip the line curls in a little way under it, where the lock lies over the next, as the sheet
  // draws it: a short inner stroke from the outline, tapering to nothing.
  const hooks = [[[-30.4, -153.6], [-29.2, -152.6], [-27.4, -152.2]], [[39.2, -150.4], [37.8, -149.8], [35.8, -149.8]]]
    .map((pts) => tapered(curve(pts as P[], 6), 0.8, "inner", "crown lock", { taper: 1.2, tip: 0.15 }));
  const wisps = [...wispsL, ...flipX(wispsL)].map((pts) => strokeOf(curve(pts, 6), 2.2, { taper: 2.6, tip: 0.3, seed: 4 }).d).join("");
  return piece(`<defs>${blur(f, pad(box, 2), headLine.blur!)}${blur(s, pad(box, 2), 0.6)}${blur(w, pad(box, 2), 0.6)}` +
    `<linearGradient id="${SIDE}" gradientUnits="userSpaceOnUse" x1="0" y1="-121" x2="0" y2="-71">` +
    `<stop offset="0" stop-color="${C.earEdge}" stop-opacity="0"/><stop offset="0.16" stop-color="${C.earEdge}"/><stop offset="0.4" stop-color="${C.earLine}"/>` +
    `<stop offset="0.62" stop-color="${C.earLine}"/><stop offset="0.82" stop-color="${C.warmLine}"/><stop offset="1" stop-color="${C.softLine}"/></linearGradient>` +
    `${rootGradient(ROOT.L, [-32.4, -150.4], [-41.6, -144])}${rootGradient(ROOT.R, [35.4, -152.4], [40.6, -148.4])}</defs>` +
    `<path d="${edge}" fill="${C.fur}" opacity="0.5" filter="url(#${s})"/>` +
    `<path d="${wisps}" fill="${C.fur}" opacity="0.92" filter="url(#${w})"/>` +
    `<g fill="${headLine.colour}" filter="url(#${f})">${r.svg}</g>` +
    `<g fill="${C.crownWarm}" opacity="0.8" filter="url(#${f})">${hooks.map((h) => `<path d="${h.d}"/>`).join("")}</g>`, box, {
    shapes: [{ name: "head.line", nodes: head.typed, segs: head.segs, outlined: r.outlined, fur: head.fur.map(([a, b]) => [fracAt(head, a), fracAt(head, b)]) }],
    lines: [...r.lines, ...hooks.map((h) => h.line)],
  });
}

/**
 * An ear's paint (the front's recipe, seen from behind), matte: the tan lighter at its top toward the light and
 * deepening down the ear to a browner tan at its foot, under the fur's own warm shade; a few fine, uneven strands,
 * mostly in its lower half, running down into its clumps, and a parting up from each notch between them; the head's
 * shade along its inner edge, where it tucks under the head's side; a soft light high on the side toward the light;
 * and its line in the warm brown round its outer side, carrying on the crown's line from its root, and round its
 * foot in the ears' feet's deeper, warmer brown.
 */
function earPaint(side: "L" | "R"): Paint {
  const k = side === "L" ? -1 : 1;
  const ear = ears[side];
  const deep = uid("deep"), soft1 = uid("blur"), toRoot = uid("earline"), strand = uid("strand"), top = uid("top");
  const [ex0, ey0, ex1, ey1] = bbox(ear.segs);
  const earBox = pad([ex0, ey0, ex1 - ex0, ey1 - ey0], 2);
  const flip = (pts: P[][]) => (side === "L" ? pts : flipX(pts));
  // Fine strands, typed for the left ear (the viewer's left) and mirrored for the right: darker ones in the lower half,
  // a few lighter ones higher up on the side toward the light.
  const dark = flip([[[-70.4, -104], [-72.4, -96], [-73, -88]], [[-63.8, -106], [-66.4, -97], [-67.6, -88], [-67.6, -81]], [[-58, -98], [-59.4, -89], [-60, -80]],
    [[-52, -103], [-53.2, -93], [-53.8, -83], [-53.6, -76]], [[-46.6, -95], [-47.4, -86], [-47.8, -77]], [[-66.6, -86], [-65.4, -79.6]]]);
  const light = flip([[[-58.4, -118], [-62, -108], [-64, -98]], [[-50.4, -114], [-52.2, -103], [-53, -94]], [[-45, -106], [-46, -97]]]);
  const fine = (pts: P[][], width: number, seed: number) =>
    pts.map((l, i) => strokeOf(curve(l), width, { taper: 3, tip: 0.1, wobble: 0.12, seed: seed + i }).d).join("");
  const under = `<defs><linearGradient id="${deep}" gradientUnits="userSpaceOnUse" x1="0" y1="-120" x2="0" y2="-66">` +
    `<stop offset="0" stop-color="${C.earDeep}" stop-opacity="0"/><stop offset="0.45" stop-color="${C.earDeep}" stop-opacity="0.8"/>` +
    `<stop offset="0.8" stop-color="${C.earDeeper}"/><stop offset="1" stop-color="${C.earFoot}"/></linearGradient>` +
    `${blur(soft1, earBox, 0.35)}` +
    // From the crown's root tan the ear's line darkens to the warm brown within a few points of its root, as the
    // sheet's does (#C2A07B at the root, #A87A59 at y -140, its warm brown by -136).
    `<linearGradient id="${toRoot}" gradientUnits="userSpaceOnUse" x1="${k * 41}" y1="-144.6" x2="${k * 50}" y2="-134">` +
    `<stop offset="0" stop-color="${C.rootTan}"/><stop offset="1" stop-color="${C.warmLine}"/></linearGradient>` +
    `<linearGradient id="${strand}" gradientUnits="userSpaceOnUse" x1="0" y1="-66" x2="0" y2="-80">` +
    `<stop offset="0" stop-color="${C.earLine}" stop-opacity="0.5"/><stop offset="1" stop-color="${C.earLine}" stop-opacity="0"/></linearGradient>` +
    // Its top a little lighter where it comes out from under the crown's fur, in the head patches' paler tan.
    `<linearGradient id="${top}" gradientUnits="userSpaceOnUse" x1="0" y1="-146" x2="0" y2="-132">` +
    `<stop offset="0" stop-color="${C.patch}" stop-opacity="0.3"/><stop offset="1" stop-color="${C.patch}" stop-opacity="0"/></linearGradient></defs>` +
    `<rect x="${fmt(ex0)}" y="${fmt(ey0)}" width="${fmt(ex1 - ex0)}" height="${fmt(ey1 - ey0)}" fill="url(#${deep})"/>` +
    `<rect x="${fmt(ex0)}" y="${fmt(ey0)}" width="${fmt(ex1 - ex0)}" height="${fmt(ey1 - ey0)}" fill="url(#${top})"/>` +
    `<g filter="url(#${soft1})"><path d="${fine(light, 0.9, 21)}" fill="${C.patch}" opacity="0.22"/>` +
    `<path d="${fine(dark, 0.65, 31)}" fill="${C.earLow}" opacity="0.26"/></g>`;
  // Along the inner edge, where the ear tucks under the head's side; and its foot.
  const innerD = side === "L" ? "M-38 -132 C-42.6 -118 -43.4 -100 -42.4 -84 L-34 -84 L-34 -132Z" : "M38 -132 C42.6 -118 43.4 -100 42.4 -84 L34 -84 L34 -132Z";
  const footD = `M${k * 82} -90 C${k * 70} -78 ${k * 56} -74 ${k * 36} -74 L${k * 36} -60 L${k * 82} -60Z`;
  const lightD = side === "L" ? pathD(ellipse([-60, -118], 6, 13, 35)) : pathD(ellipse([48, -128], 5, 10, 32));
  const clumps = earClumps[side].slice(1).map(({ notches }) => notches[0]);
  return {
    fill: C.marking,
    under,
    shade: { multiply: C.furShadeBy, rim: { inset: 2.2, toLight: 3.6 }, shapes: [innerD, footD], blur: 3.2 },
    highlight: { d: lightD, colour: C.patch, opacity: 0.35, blur: 3.4 },
    // A parting up from each notch between the foot's clumps, fading out upward.
    inner: clumps.map((n) => ({ pts: curve([n, [n[0] - k * 0.4, n[1] - 3.6], [n[0] - k * 0.2, n[1] - 8]]), width: 0.75, colour: `url(#${strand})` })),
    outline: { ...OUTLINE, colour: C.warmLine, width: 1.3, taper: 1.4, blur: 0.15, spans: side === "L"
      ? [{ from: [-40.4, -145], to: [-76.6, -86.4], width: 1.3, colour: `url(#${toRoot})` }, { from: [-77.2, -91.4], to: [-38.6, -78], width: 1.45, colour: C.earFootLine }]
      : [{ from: [41, -145.4], to: [75.6, -87], width: 1.35, colour: `url(#${toRoot})` }, { from: [75.9, -92], to: [38.2, -80], width: 1.5, colour: C.earFootLine }] },
  };
}

/**
 * The tail's cast shadow on the haunches (spec L396; on the tail's bone, clipped to the body): the tail's own shape
 * moved down and a little away from the light, soft, in the fur's warm shade, so it shows under the tail's foot, as
 * the sheet paints it, and hardly beside it.
 */
function tailOnBody(): Piece {
  const [x0, y0, x1, y1] = bbox(tail.segs);
  const f = uid("blur"), box = pad([x0 + 1.2, y0 + 2.4, x1 - x0, y1 - y0], 1);
  return piece(`<defs>${blur(f, pad(box, 6), 2)}</defs><g filter="url(#${f})"><path d="${pathD(tail.segs)}" transform="translate(1.2 2.4)" fill="${C.furShade}" opacity="0.75"/></g>`,
    pad(box, 6));
}

/**
 * The ear's contact shadow on the head's side (DECISIONS 25, 77; a cast shadow drawn on the caster's bone and clipped to
 * the part it falls on, spec L396): the head patches' paler tan, deepening to the ears' tan toward the head's edge,
 * through a soft edge.
 */
function earOnHead(side: "L" | "R"): Piece {
  const s = earShadow[side], k = side === "L" ? -1 : 1;
  const box = boxOf(s, 0), g = uid("band"), f = uid("blur");
  return piece(`<defs>${blur(f, pad(box, 3), 0.7)}<linearGradient id="${g}" gradientUnits="userSpaceOnUse" x1="${k * 39}" y1="0" x2="${k * 33}" y2="0">` +
    `<stop offset="0" stop-color="${C.marking}"/><stop offset="1" stop-color="${C.patch}"/></linearGradient></defs>` +
    `<path d="${pathD(s.segs)}" fill="url(#${g})" opacity="0.95" filter="url(#${f})"/>`, pad(box, 3));
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
  // The ground shadow: a wide soft oval, behind and beside the haunches as the sheet paints it (L* 89 to 91 from x -60
  // to 60 at y -6, its foot at y 1), a little deeper under the heels and the tail's foot.
  add("shadow", join(soft("M-61 -5.4 a63 7 0 1 0 126 0 a63 7 0 1 0 -126 0Z", [-61, -12.4, 126, 14], C.shadow, 1.8, 1),
    ...([[-38, 11], [37, 10], [6, 12]] as [number, number][]).map(([x, rx]) =>
      soft(`M${x - rx} -0.8 a${rx} 1.8 0 1 0 ${2 * rx} 0 a${rx} 1.8 0 1 0 ${-2 * rx} 0Z`, [x - rx, -2.6, 2 * rx, 3.6], C.contact, 1.2, 0.5))));
  for (const side of ["L", "R"] as const) add(`hind.${side}`, roomy(part(`hind.${side}`, hind[side], hindPaint(side)), 6));
  for (const side of ["L", "R"] as const) add(`ear.${side}`, part(`ear.${side}`, ears[side], earPaint(side)));
  add("head.base", part("head.base", head, headPaint));
  add("shadow.ear.L", earOnHead("L"));
  add("shadow.ear.R", earOnHead("R"));
  add("head.line", headLinePiece());
  add("tuft", part("tuft", tuft, {
    fill: C.fur,
    // The lobes' undersides where they sit on the crown, and the rim away from the light.
    shade: { multiply: C.furShadeBy, rim: { inset: 3, toLight: 4.5 }, group: headGroup, shapes: ["M-16 -152.6 C-10 -155.4 -2 -155 2.4 -153.2 C6 -155.6 14 -155.6 20 -153 L20 -150 L-16 -150Z"],
      keep: ["M-40 -168 L40 -168 L40 -157.4 L-40 -157.4Z"], blur: 1.2 },
    highlight: { d: `${pathD(ellipse([-8.6, -160.6], 4.6, 2.2, -10))} ${pathD(ellipse([11.4, -159.8], 4.6, 2, 6))}`, colour: C.light, opacity: 0.45, blur: 1.6 },
    // The lobes' lines curl in at their feet and into the notch between them, as the sheet draws them.
    inner: [
      { pts: [[-16.2, -156.4], [-14.6, -155.2], [-12.6, -154.8]], width: 0.85, colour: C.crownWarm, opacity: 0.85 },
      { pts: [[1.6, -157.2], [2.4, -155.2], [1.8, -153.4]], width: 0.8, colour: C.crownWarm, opacity: 0.75 },
      { pts: [[22, -156.2], [20.6, -155.2], [18.2, -155]], width: 0.85, colour: C.crownWarm, opacity: 0.85 },
    ],
    // One line round both lobes and into the notch between them, from where the left lobe meets the crown to where the
    // right one does, a little heavier than the crown's, so the topknot and the crown's line read as one outline.
    outline: { ...OUTLINE, colour: C.crownWarm, width: 1.4, taper: 1.6, spans: [{ from: [-17.2, -154.6], to: [18.6, -153.8] }] },
    feather: { from: [0, -150.8], to: [0, -154.6] },
  }));
  add("body.back", roomy(part("body.back", body, backPaint), 1));
  // The saddle's left half, its edge lumpy, a few darker strands in it following the back's round; its strip on the
  // left flank; its right half over the spine above the tail.
  add("back.patch.L", join(marking("back.patch.L", { shape: body, paint: backPaint }, saddleL, { fill: C.marking, blur: 0.4, clip: true }),
    marking("back.patch.L", { shape: body, paint: backPaint }, flankL, { fill: C.marking, blur: 0.6, clip: true }),
    strands("back.patch.L", saddleL, 0.4, [[[-14, -50], [-15.6, -44], [-15.4, -37.4]], [[-8.4, -55], [-10.6, -48], [-10.8, -40]], [[-3.4, -56], [-5, -50], [-5.4, -43]]],
      { colour: C.earDeep, opacity: 0.25, width: 0.75 })));
  add("back.patch.R", marking("back.patch.R", { shape: body, paint: backPaint }, saddleR, { fill: C.marking, blur: 0.4, clip: true }));
  add("shadow.tail", tailOnBody());
  const side = `<defs><linearGradient id="${TAIL_SIDE}" gradientUnits="userSpaceOnUse" x1="0" y1="-21" x2="0" y2="-8">` +
    `<stop offset="0" stop-color="${C.softLine}"/><stop offset="1" stop-color="${C.warmLine}"/></linearGradient></defs>`;
  add("tail", part("tail", tail, { ...tailPaint, under: side + tailPaint.under }));
  add("tail.base", marking("tail.base", { shape: tail, paint: tailPaint }, tailBase, { fill: C.patch, blur: 0.9, clip: true, fade: { from: [-5, -21.8], to: [-4, -17.2] } }));
  // The collar (the front's recipe, from behind): the band's blue, a lighter stripe along its top toward the light and
  // a few faint painted streaks, its lower part in shade where it turns under toward the shoulders, and the front's
  // dark slate rim all round, as the sheet paints it.
  const streaks = [[[-24, -69.8], [-8, -72], [10, -71.8], [24, -69.6]], [[-20, -67.4], [0, -69], [18, -67.6]]] as P[][];
  add("collar", part("collar", collar, {
    fill: C.collar,
    under: `<path d="${streaks.map((l) => strokeOf(curve(l), 0.8, { taper: 6, tip: 0.1, wobble: 0.2, seed: 2 }).d).join("")}" fill="${C.collarHighlight}" opacity="0.3"/>`,
    // Its lower part in shade, where it turns under toward the shoulders: about two fifths of the band, as the sheet paints it.
    shade: { multiply: C.shadeBy, shapes: ["M-32 -66.2 C-16 -69.2 16 -69.2 32 -66.2 L32 -58 L-32 -58Z", pathD(ellipse([-29.6, -66], 2.6, 6, 0)), pathD(ellipse([31.4, -66], 2.6, 6, 0))], blur: 0.9 },
    highlight: { d: "M-27 -70.6 C-15 -73.6 0 -74.4 16 -73.8 C22 -73.4 26 -72.6 29.6 -71 L29.6 -68.6 C20 -71 0 -72 -27 -68Z", colour: C.collarHighlight, opacity: 0.4, blur: 0.8 },
    outline: { colour: C.collarRim, width: 1.3, taper: 2, blur: 0.2 },
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
