// The dog's three-quarter view facing the sheet's left (threeQuarter.L, DECISIONS 1): the dog has turned to its
// right, so its left side is near. Shapes first, every node typed by hand in model space (points, the ground under
// the seat at 0, 0, y down) at the extremes and inflections read off the three-quarter turnaround, then paint. The
// paint is the front view's (front.ts): the same recipes for the ears, eyes, nose, mouth, collar, tag and paws,
// each part's nodes typed again from this view's own crop. Light comes from the top left, as in every view.
import { furEdge, furSpan, type Lock } from "../../../draw/fur.ts";
import { bbox, ellipse, fracAt, pathD, rotate, sample, smooth, spanPoints, v, type Node, type P, type Shape } from "../../../draw/geom.ts";
import { innerLine, strokeOf, type DrawnLine, type Stroke } from "../../../draw/line.ts";
import { LIMITS } from "../../../draw/lint.ts";
import { marking, part, soft, type Paint } from "../../../draw/paint.ts";
import { blur, join, pad, piece, uid, type Box, type Piece } from "../../../draw/svg.ts";
import { model } from "../model.ts";
import { C } from "../palette.ts";
import { eye, type EyeSpec } from "../parts/eye.ts";
import { litEdge, litMarking, litPart, withDefaults, type LitSpan } from "../parts/lines.ts";
import { curlShapes, topknot, type Curl } from "../parts/topknot.ts";
import type { Drawn } from "./front.ts";

const INNER = model.outline.innerPt;
/** Lines on fur spans and small parts: lighter, and never under 1.2 pt, as in the front view. */
const THIN = 1.2;
const LM = model.landmarks["threeQuarter.L"]!;

/** A tapered line drawn as a filled polygon, with its meta for the lint (front.ts's rule). */
function tapered(pts: P[], width: number, kind: "outer" | "inner", where: string, opts: Stroke = {}): { d: string; line: DrawnLine } {
  const s = strokeOf(pts, width, { band: LIMITS[kind], ...opts });
  return { d: s.d, line: { kind, width, where, drawn: s.drawn } };
}
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const fmt = (n: number) => r3(n).toString();
/** A part's canvas grown to hold its light group's shade where that reaches past the part (front.ts's rule). */
const roomy = (p: Piece, by: number): Piece => ({ ...p, box: pad(p.box, by) });

// Shapes.

// The back and the near haunch: the back's line comes out from under the near ear's lower corner and runs down
// the sloping back to the rump, round the haunch's rear and down to the ground behind the hind paw, then along
// the haunch's underside under the paw; the rest lies hidden under the chest, the near front leg and the collar.
const back = smooth([[-36, -63], [-25, -66.5], [-17, -62], [-10, -55.3], [0.2, -48.5], [8.7, -40.9], [12.6, -34.4], [14.7, -26], [14.7, -17.5],
  [12, -10.2], [7.8, -5.9], [1.5, -1.8], [-9, -1.2], [-17, -1.6], [-23.4, -3.2], [-27.8, -4.2], [-31.4, -5.6], [-35, -20], [-36, -42]]);

// The near hind paw: a round bun of a paw tucked in at the haunch's front, as the sheet draws it, its own shape
// under the thigh: its top an arc from its toe end (x -26.8), where it comes out beside the near front paw, up
// over its crown (y -16.7 at x -18), where the sheet's line fades into the thigh; its sole on the ground with a
// small scallop at each of its two toe lines (x -22.7 and -16.2); its back end runs on into the haunch.
const hindNodes: Node[] = [[-26.8, -9.4], [-25.8, -12.6], [-24, -14.7], [-21.4, -16.1], [-18, -16.7], [-14, -16.5], [-10.2, -15.2], [-7.2, -12.4], [-5.8, -8.4],
  [-6.6, -4], [-9.4, -1.9], [-13, -1.5], [-16.2, -1.95], [-19.4, -1.8], [-22.7, -2.9], [-25.2, -4.6], [-26.5, -7]];
const hind = smooth(hindNodes, { corners: [12] });

// The near front leg: short and plump, coming down out of the chest in front of the haunch and swelling at the
// wrist into a round bun of a paw that bulges forward past the leg (the leg's front edge at x -53.9 at the wrist,
// the paw's at -59.1), as the sheet draws it; its back edge slopes down from the shoulder to the paw's heel
// (x -24.6 at y -18, -30.2 at -6.6), a little in front of the thigh; its sole on the ground with a small scallop
// at each of its two toe lines (x -54.4 and -46.8). Its top melts into the chest.
const legL = smooth([[-50, -47], [-38, -47.5], [-27, -45], [-23.4, -37], [-22.8, -30], [-23.4, -23], [-25.4, -16.4], [-28, -10.8], [-30.4, -6.8],
  [-33.2, -3.9], [-38.6, -1.7], [-46.8, -1.5], [-52.6, -1.9], [-56.4, -3.4], [-58.6, -6.2], [-59.1, -9.6], [-57.9, -12.8], [-55.6, -14.8], [-53.9, -15.8],
  [-52.6, -21], [-50.8, -28], [-49.4, -37]], { corners: [18] });

// The far front leg: behind the chest (spec L369), showing down the silhouette's front edge below the chest
// (x -77) to its wrist (y -19.6), where the paw swells out round to x -83.2; its sole runs on behind the near
// paw, with a small scallop at each of its two toe lines (x -72.6 and -78.6). Its inner side shows only in the
// slot beside the near leg (x -55.6), under the chest's lower edge.
const legR = smooth([[-75.6, -50], [-61, -46], [-58.4, -36], [-56.6, -28], [-55.6, -21], [-55.4, -15.6], [-56.2, -10], [-57.8, -6.4], [-60.6, -4.4],
  [-64.6, -3.6], [-68.4, -3.3], [-72.6, -3.75], [-76.4, -3.9], [-79.6, -5], [-82.1, -7.2], [-83.2, -10.4], [-82.6, -13.8], [-80.8, -16.4], [-79, -18],
  [-78, -19.8], [-77.8, -24], [-78, -30], [-78.1, -38], [-77.6, -45]], { corners: [11, 19] });

// The chest: from under the collar down to the paws, its front edge the silhouette from the collar's end down to
// the far leg, which comes out from under it; its lower edge runs level across the far leg's top, then down the
// long diagonal the sheet draws from under the tag (x -69.5) to the slot between the legs (x -55.4 at y -20.8),
// and on under the near paw. Its right side lies on the haunch's cream under the near leg and the collar, with
// no line.
let chest = smooth([[-72.6, -60.8], [-60, -64], [-40, -64.5], [-24, -64], [-21, -58], [-23, -50], [-26.5, -42], [-29, -32], [-33, -14], [-40, -4],
  [-52, -3.5], [-54.2, -16.6], [-55.6, -20.6], [-58.4, -24], [-61.6, -27.2], [-65.6, -30.6], [-69.5, -33.5], [-73.6, -32.4], [-75.8, -30.2], [-77, -36],
  [-77.9, -42.4], [-77.4, -48.6], [-74.6, -54.8]], { corners: [18] });
// Under the collar's end the chest's front edge breaks into a few small locks of fur combed down, as the sheet draws it.
const chestLocks: Lock[] = [{ len: 0.8, w: 0.9, lean: -0.3 }, { len: 1.3, w: 1.3, lean: -0.35 }, { len: 0.7, w: 0.8, lean: -0.3 }, { len: 1.1, w: 1.2, lean: -0.3 },
  { len: 0.8, w: 0.9, lean: -0.25 }];
chest = furEdge(chest, [-77.6, -38.8], [-74.9, -54.2], chestLocks, 0.32);

// The collar: the band round the neck from under the chin, where its rounded end shows, along the near side
// to where it turns away round the neck just short of the near ear; deepest (7.5 pt) under the near side of the
// chin, 6 pt toward its rounded end under the chin and narrowing to 3 pt where it turns away. Its top lies under the head's fur.
const collar = smooth([[-72.6, -61.8], [-60, -63], [-45, -62], [-30, -63.4], [-24.6, -64.6], [-22.2, -63.4], [-21.8, -61.2], [-22.8, -59.2], [-26, -56.4],
  [-30, -53.8], [-37.6, -51], [-45.4, -49.4], [-52.6, -50], [-60.6, -51.6], [-67, -52.4], [-70.6, -55.4], [-72.6, -58.4]]);

// The tag: the plump gold heart, hanging straight under its ring, a little narrower and shorter than the front's
// as the turn shows it (16 pt across with its line, under 15 pt tall); and the smaller heart embossed in it.
const TAG_X = LM["tag.ring"]![0];
const heartHalf: Node[] = [[0, -49.8], [-1.5, -50.7], [-3.4, -51], [-5.4, -50.4], [-7, -48.9], [-7.9, -46.9], [-8.1, -44.9], [-7.6, -43],
  [-6.8, -41.2], [-5.6, -39.6], [-4, -38.1], [-2.1, -36.9]];
const mirrored = (half: Node[], bottom: Node, dx: number): Node[] =>
  [...half, bottom, ...[...half].reverse().slice(0, -1).map(([x, y]): Node => [-x, y])].map(([x, y]): Node => [x + dx, y]);
/** The heart hangs a little turned on its ring, its point 1.5 pt toward the far side, as the sheet draws it. */
const TAG_TILT = 6, TAG_HANG: P = [TAG_X, -51];
const heart = smooth(rotate(mirrored(heartHalf, [0, -36.2], TAG_X), TAG_TILT, TAG_HANG), { corners: [0], typed: heartHalf.length + 1 });
const innerHeart = smooth(rotate(mirrored([[0, -46.6], [-1.6, -48], [-3.5, -48.1], [-4.8, -46.9], [-5, -45], [-4.3, -43.1], [-2.7, -41.5]], [0, -40.3], TAG_X),
  TAG_TILT, TAG_HANG), { corners: [0], typed: 8 });

// The ears. The far ear (the dog's right) hangs out past the far cheek from high on the head's far side, its
// upper edge one long convex arc from the root down to its widest, with a small lock where it steps out below the
// root; its lower edge hangs in three layered locks of fur, the outer one's tip
// lowest at the left (x -117.6), each tucked under the next at a notch (concave corners), as the sheet draws them;
// its inner edge runs on behind the face. The near ear hangs from just under the crown's overhang down beside the
// near cheek over the shoulder, broad and rounded below, its lower edge four rounded locks of uneven size with a
// notch between each, and a small step high on its outer side. Each reaches well under the head at its root and
// along its inner edge (spec L394), its hidden end rounded.
const EAR_R_NOTCHES = [9, 11, 21];
const earR = smooth([[-80.8, -143.4], [-75.4, -141.6], [-76.6, -132], [-86.4, -108], [-94, -84], [-96.2, -80.4], [-99.8, -78.5], [-104.4, -79.2], [-107.4, -80.4],
  [-109.2, -82.6], [-112.8, -84.9], [-115.4, -88.4], [-117.2, -89.3], [-119.4, -91.4], [-120.6, -94.8], [-121, -99], [-120.6, -105.6], [-119.2, -111.8],
  [-115.6, -117.6], [-106, -124.8], [-96.6, -131.2], [-93.8, -133.4], [-88.4, -140.2]], { corners: EAR_R_NOTCHES });
const EAR_L_NOTCHES = [7, 11, 14, 17];
const earL = smooth([[-5, -140.6], [7.6, -130.4], [12, -125.6], [15, -118.4], [18.8, -111.4], [25.8, -105.2], [28.7, -100.4], [29, -95.4], [30.9, -88.6],
  [30.8, -80.6], [29.6, -75.2], [25.6, -71], [21.6, -66.2], [16.8, -62.8], [9.8, -61.2], [5.4, -59.2], [1.6, -58.6], [-4.4, -60.4], [-9.4, -61.8],
  [-18.6, -71], [-20.4, -80], [-20.2, -95], [-22, -115], [-22.6, -131]], { corners: EAR_L_NOTCHES });
const ears = { R: earR, L: earL };

// The head: the crown under the topknot; on the near side the crown's fur overhangs the near ear's root, and the
// face's side runs down over the ear to the near cheek; the jaw lies along the collar's top from the near cheek
// to the chin, dipping lowest under the near cheek, and rises from the chin up the far side of the jaw to the far
// cheek's puff, which bulges out over the far ear; above it the face's far side runs up over the far ear to its
// root and the crown.
const headNodes: Node[] = [[-68.6, -149.6], [-11.2, -149.6], [-2.4, -144.2], [3.6, -136.8], [1.4, -135.6], [-17.4, -132], [-20.6, -127.6], [-13.6, -115.4],
  [-11.4, -105], [-14.2, -91], [-17.4, -78], [-15.8, -67.2], [-26, -61.4], [-48, -58.4], [-73.5, -62.4], [-84.2, -68.6], [-90.6, -74.4],
  [-96.4, -79.2], [-99.6, -84.4], [-100.4, -90.4], [-96.6, -97.4], [-91.2, -100.6], [-88.8, -121.6], [-79.6, -143.8]];
/**
 * The overhang's tip over the near ear's root; where the face's near side leaves the overhang's underside, a concave
 * corner; and where the far cheek's puff comes out from under the side's line.
 */
const OVERHANG = 4, TEMPLE = 6, PUFF = 21;
let head = smooth(headNodes, { corners: [OVERHANG, TEMPLE, PUFF] });
// The far cheek's puff breaks into a few soft clumps of fur along its lower and outer edge, and the jaw's fur
// hangs over the collar in a row of small uneven tufts, as the sheet draws them.
const cheekLocks: Lock[] = [{ len: 0.6, w: 0.9, lean: 0.25 }, { len: 1.1, w: 1.4, lean: 0.35 }, { len: 0.5, w: 0.8, lean: 0.3 }, { len: 0.9, w: 1.2, lean: 0.4 },
  { len: 0.6, w: 0.9, lean: 0.35 }];
// Under the chin the fur hangs over the collar in a few soft tufts of uneven size, not a row of even scallops.
const chinLocks: Lock[] = [{ len: 0.9, w: 1.3, lean: 0.35 }, { len: 0.5, w: 0.7, lean: 0.25 }, { len: 1.3, w: 1.6, lean: 0.3 }, { len: 0.6, w: 0.8, lean: 0.1 },
  { len: 1.1, w: 1.4, lean: -0.05 }, { len: 0.7, w: 0.9, lean: -0.15 }];
/** Each cheek clump's tip, root and notches (path order), for its line. */
const clumps: { tip: P; root: P; notches: [P, P] }[] = [];
head = furEdge(head, [-24, -61.8], [-70, -61.6], chinLocks, 0.34);
head = furEdge(head, [-91.4, -75], [-99.2, -94.2], cheekLocks, 0.4, (tip, root, notches) => clumps.push({ tip, root, notches }));
// The crown's fur where it overhangs the near ear's root is a lock of fur, its tip a fur span.
head = furSpan(head, [3.2, -137.4], [0.4, -135.5]);
// Under the overhang the crown's cream fur hangs down over the near ear's root in a few soft locks, as the sheet
// draws them, so the root has no flat top edge.
head = furEdge(head, [-3.8, -135], [-15.4, -131], [{ len: 1.8, w: 1.3, lean: 0.3 }, { len: 0.9, w: 0.9, lean: 0.25 }, { len: 1.4, w: 1.1, lean: 0.3 }], 0.42);

// The topknot (parts/topknot.ts): three separate curls of fur, seen turned, as the sheet draws them, back to front.
// The left curl low and broad, pointing out to its tip at the left (x -67.2), its line running from under the tip
// round it and over its crown (y -158.4) to where it tucks behind the middle one; the right curl low, rising from
// behind the middle one over its crown (y -157) to its tip at the right (x -9.6), which hooks back in under itself;
// and in front the tall middle curl, its top the head's highest point (y -164.5), its right foot looping in under it.
// Each curl's hidden foot lies in the crown, feathered into it.
const CURLS: Curl[] = [
  { nodes: [[-67.2, -153.8], [-65.4, -156.2], [-61.4, -157.8], [-56.6, -158.4], [-52.2, -157.6], [-48.8, -154.8], [-46.4, -151], [-50, -147.4], [-56, -148.2],
    [-61.4, -150.4], [-64.6, -151.8]],
    line: { from: [-61.6, -150.4], to: [-48.8, -154.8], taper: [2, 2.4] }, hooks: [[[-64.4, -152.6], [-62, -152.4], [-59.4, -151.6]]] },
  { nodes: [[-32, -152], [-30, -155.2], [-26.4, -156.6], [-21.4, -157], [-16.4, -156.2], [-12.2, -153.8], [-9.6, -151], [-11.4, -148.8], [-16.6, -147.6],
    [-24, -147], [-31, -148.4]],
    line: { from: [-30.4, -155], to: [-16.6, -147.6], taper: [2.4, 1.4] }, hooks: [[[-10.4, -151.2], [-12.6, -150.4], [-15.2, -150.2]]] },
  { nodes: [[-48.6, -154.4], [-46.4, -159.4], [-41.6, -163], [-35.6, -164.5], [-31, -162.8], [-29.4, -159.4], [-30.2, -155.6], [-31.6, -153.6], [-33, -150],
    [-40, -146.6], [-46, -149]],
    line: { from: [-48.6, -154.4], to: [-31.6, -153.6], taper: [2, 2.2] }, hooks: [[[-31.4, -153.8], [-33, -153.2], [-34.8, -153.8], [-35.6, -155.2]]] },
];
const tuftShapes = curlShapes(CURLS);

// The head patches, in the paler tan (DECISIONS 18). The near one (the dog's left) is a broad hood arching over
// the top and the outer side of the near eye, its top edge about 9 pt above the eye with the brow in the cream above
// it, its nose end down to about the eye's middle; it runs down the face's side behind the eye to the cheek and
// rises along the face's side into the near ear's root, a wedge of the crown's cream coming down between the hood
// and that band to a point (x -20.2, y -106.2), as the sheet paints it. The far one is a small hood over the far eye's top, from the
// face's far side over to the eye's nose side, running up the face's far side in a narrow band toward the far ear's
// root; below the hood, beside the eye, the face is cream, as the sheet paints it. Each is typed with bleed
// past the head's edge; the eyes cover what lies under them.
const patchL = smooth([[-46.4, -104.8], [-43.6, -110.4], [-38, -113.8], [-31, -115], [-26, -113.4], [-22.4, -108.6], [-20.2, -106.2], [-18, -112], [-17.4, -123],
  [-20.4, -127.4], [-14.8, -131.8], [-10, -128], [-8, -116], [-8, -100], [-11, -86], [-15, -79.6], [-21, -79.6], [-25.4, -82.4], [-27.6, -87], [-28.6, -95],
  [-33, -103.6], [-40, -105.6], [-44.6, -102.6]], { corners: [6] });
const patchR = smooth([[-95, -140], [-89.6, -140.4], [-86.6, -136.4], [-84.8, -130.4], [-83.2, -126.6], [-78.8, -125.4], [-74.2, -123.2], [-71, -119.6],
  [-70.4, -114], [-73, -110.8], [-78, -110], [-84, -111.4], [-88.6, -114.6], [-95, -118]]);

// The body's markings, each clipped to its part (L395). The near half of the saddle, a clear patch on the upper
// back behind the near ear, as the sheet paints it: its top the back's line from x -9 down to x 10, its lower edge
// a soft round sweep from under the line at x -14.8 down to y -40.2 and back up to the line, breaking into small
// locks of fur along its lower left; typed with bleed past the line. The rump's patch: an upright oval at the
// haunch's back edge, from y -34.6 to -14, running out under the line. The tail's tan root is the tail's.
let saddleL = smooth([[-14.8, -52.6], [-13.4, -48], [-10.6, -43.6], [-6, -40.8], [0, -40], [5.6, -40.2], [11.4, -42], [10.4, -45.6], [4, -51.6], [-3, -56.6],
  [-9.4, -58.6], [-12.6, -56.4]]);
saddleL = furEdge(saddleL, [-14.6, -51.4], [-1.6, -40.2], [{ len: 0.9, w: 1, lean: 0.3 }, { len: 1.3, w: 1.3, lean: 0.35 }, { len: 0.8, w: 0.9, lean: 0.3 },
  { len: 1.1, w: 1.2, lean: 0.4 }], 0.3);
const rumpL = smooth([[8.4, -33], [11.4, -34.6], [15.6, -32], [16.6, -24], [15.6, -14.4], [12.4, -13.8], [9.2, -17], [7.4, -22], [7.4, -28]]);

// The tail: a plume rising from behind the rump, as the sheet draws it, narrow where it comes out from behind the
// haunch's line (y -33.6) and widening as it rises; its tip curls over toward the head at the top left in a hook
// whose underside tucks into a notch on the plume's inner edge (x 18.9, y -47.5). From the hook over the top and
// down the far side to its foot the plume is five lobes of fur of uneven size, each a soft arc that ends tucked into
// a notch under the start of the next (concave corners), as the sheet draws them; its foot breaks into a small
// fringe. Its root lies hidden behind the rump.
const tailNodes: Node[] = [[6, -30], [13.4, -33.6], [18.4, -37.6], [20.6, -42.4], [18.9, -47.5], [17, -49.4], [17, -52.8], [19.6, -55.6],
  [24.2, -56.6], [28.6, -60], [31.6, -58.4], [35.8, -57], [37.6, -55.6], [41.6, -52.6], [42.9, -47.6], [45.6, -44.2], [46.5, -37], [45.6, -30.4],
  [43.6, -26.4], [41.8, -24], [38.6, -18.4], [30.4, -12.6], [13.6, -10.8], [9, -14.4]];
/** The notches where each lobe of the plume tucks under the next, in path order: shallow steps in the silhouette. */
const TAIL_NOTCHES = [8, 10, 12, 14, 19, 21];
let tail = smooth(tailNodes, { corners: [4, ...TAIL_NOTCHES] });
// The hook's tip and the lobes are fur (the tail tip, L509).
tail = furSpan(furSpan(tail, [17.6, -48.6], [18.2, -54.6]), [24.2, -56.6], [30.4, -12.6]);
// Its foot breaks into a small fringe of tan tufts, combed back toward the haunch.
const fringeLocks: Lock[] = [{ len: 1, w: 1.2, lean: 0.35 }, { len: 0.7, w: 0.8, lean: 0.3 }, { len: 1.2, w: 1.4, lean: 0.35 }];
tail = furEdge(tail, [29.4, -12.2], [15.4, -10.6], fringeLocks, 0.42);

// The tail's tan root, as the sheet paints it: deep at the foot behind the haunch and rising up the plume's lower
// half in long flames of fur combed up along the plume, split by narrow streaks of cream, the tallest at x 15 to 21
// to y -40, lower ones to the right, and down its far side (x 29.6) short tongues combed up and out, to the fringe.
// Typed with bleed past the tail's edge, under the haunch and below the foot.
const tailBase = smooth([[8, -40], [13.4, -37.4], [15.4, -39.8], [16.6, -38.4], [17.2, -33.8], [18.4, -38.2], [20, -40.2], [21.8, -37.8], [22.4, -33.2],
  [23.6, -36.6], [24.8, -31.8], [26.6, -35.4], [28, -31.6], [29.6, -30.2], [28.6, -26.6], [31, -24.6], [28.8, -21.4], [31.2, -18.4], [29.8, -15],
  [33, -8], [12, -6], [6, -20]], { corners: [2, 4, 6, 8, 9, 10, 11, 14, 15, 16, 17] });

// Paint.

const furShade = (group: Shape[], shapes: string[] = [], keep: string[] = [], rim = { inset: 2.5, toLight: 4 }) =>
  ({ multiply: C.furShadeBy, rim, shapes, keep, group, blur: 2.4 });
const hipGroup = [back, hind];
/** The chest and both front legs share one light, so neither leg's join with the chest takes a rim of shade. */
const bodyGroup = [chest, legL, legR];
const headGroup = [head, ...tuftShapes];

/** The thigh's front line, the gap's shade beside it and the line's fade, painted into the back body (thighLayers). */
const THIGH = uid("thigh"), GAP = uid("gap"), GAP_BLUR = uid("blur");
/**
 * The thigh as the sheet draws it: one round arc of a fur line from mid-flank (x -15.4 at y -33) down round the
 * thigh's front to the hind paw's crown (x -23.5 at y -15), coming in faint at the top; and in the narrow gap
 * between it and the near front leg's back edge, and between the two paws, the flank in a warm shade, as the
 * sheet paints it there. The shade stays lighter than a marking's tan (L* 86 and up), as it is a shade, not a
 * patch; the sheet's own gap is darker.
 */
const thighPts: P[] = [[-15.4, -33], [-17.6, -30], [-19.8, -26.4], [-21.6, -22], [-22.8, -18], [-23.6, -14.6]];
const gapNodes: P[] = [[-24.4, -27], [-22.8, -21.6], [-23.4, -16.4], [-25.2, -11.8], [-26.6, -6.4], [-28.2, -4.6], [-30.8, -5.8], [-28.6, -11.4],
  [-26.8, -16.6], [-25.6, -22]];
const thighLayers = `<defs><linearGradient id="${THIGH}" gradientUnits="userSpaceOnUse" x1="0" y1="-33" x2="0" y2="-20">` +
  `<stop offset="0" stop-color="${C.softLine}" stop-opacity="0"/><stop offset="1" stop-color="${C.softLine}"/></linearGradient>` +
  `<linearGradient id="${GAP}" gradientUnits="userSpaceOnUse" x1="0" y1="-28" x2="0" y2="-6">` +
  `<stop offset="0" stop-color="${C.earDeep}" stop-opacity="0"/><stop offset="0.45" stop-color="${C.earDeep}" stop-opacity="0.26"/>` +
  `<stop offset="0.8" stop-color="${C.earDeep}" stop-opacity="0.28"/><stop offset="1" stop-color="${C.earDeep}" stop-opacity="0.08"/></linearGradient>` +
  `${blur(GAP_BLUR, [-36, -32, 18, 30], 0.7)}</defs>` +
  `<path d="${pathD(smooth(gapNodes).segs)}" fill="url(#${GAP})" filter="url(#${GAP_BLUR})"/>`;

const backPaint: Paint = {
  fill: C.fur,
  // The haunch's rear and its underside, away from the light; and the gap beside the thigh in the fur's shade.
  shade: furShade(hipGroup, [pathD(smooth(gapNodes).segs)], ["M-24 -70 L4 -58 L14 -42 L6 -36 L-20 -50Z"]),
  under: thighLayers,
  inner: [{ pts: sample(smooth(thighPts, { closed: false }).segs, 8, false), width: 0.8, colour: `url(#${THIGH})` }],
};
/**
 * The back's line (parts/lines.ts): from under the ear down the sloping back, where the saddle's tan reaches it, on
 * the tan; round the rump on the cream, and on the tan again where the rump's spot meets it (the sheet's #A35F32
 * there); then round the haunch's rear and along the ground under it, deepening to the darkest.
 */
const backLines: LitSpan[] = [{ from: [-17, -62], to: [9.8, -39.6], on: "tan", taper: 5 }, { from: [7.4, -42.2], to: [14.4, -34], taper: 4 },
  { from: [13.6, -36.2], to: [14.4, -14], on: "tan", taper: 4 }, { from: [14.6, -16.6], to: [-31, -5.4], taper: 5 }];

const headLight = "M-64 -150 C-52 -158 -30 -158 -18 -152 C-24 -142 -50 -140 -62 -144Z " +
  "M-99.4 -90 C-99 -95 -95.4 -97.6 -91.6 -96.4 C-90.2 -92 -91.4 -86 -94.6 -83.4 C-97.6 -84.2 -99.6 -86.8 -99.4 -90Z";
const headPaint: Paint = {
  fill: C.fur,
  // Under the jaw over the collar, where the head turns under; the far side of the jaw away from the light; and
  // a faint wash in the near hood just over the eye, under the brow.
  shade: furShade(headGroup, ["M-74 -64 C-56 -60 -36 -59 -14 -64 L-14 -52 L-74 -52Z", "M-96 -79 C-87 -70 -80 -66 -72 -64 L-72 -54 L-102 -60Z",
    `M${fmt(LM["eye.L"]![0] - 8)} ${fmt(LM["eye.L"]![1] - 10.4)} a8 2 0 1 0 16 0 a8 2 0 1 0 -16 0Z`],
    // The crown stays light right out to its line, as the sheet paints it, the overhang over the near ear's root
    // included; and so does the far cheek's puff.
    ["M-100 -172 L10 -172 L10 -140 L-100 -140Z", "M-30 -141 L10 -141 L10 -131 L-30 -131Z", "M-103 -101 L-88 -101 L-88 -80 L-103 -80Z"], { inset: 3, toLight: 4.5 }),
  highlight: { d: headLight, colour: C.light, opacity: 0.4, blur: 4 },
};

/**
 * The head's line (head.line), where the sheet draws one, by the dog's one line rule (parts/lines.ts): the crown's
 * light line, from the topknot's left lobe down to the far ear's root and from its right lobe down round the
 * overhang over the near ear; down each side, where the face lies over an ear, a round curve on the tan, deep where
 * the face tucks over it (the sheet's #995727 and #9F582C, DECISIONS 7), ending where the cheek comes out over it;
 * and under the chin, down the far side of the jaw, a deeper line (the sheet's #BC997D). The far cheek's clumps each
 * carry their own line, on the far ear's tan, broken at each notch.
 */
const headSpans: LitSpan[] = [
  { from: [-91, -102], to: [-82.4, -139.6], on: "tan", under: 0.6, taper: 4 },
  { from: [-16.4, -120], to: [-17, -73], on: "tan", under: 0.6, taper: 4 },
  { from: [-74, -62.6], to: [-91, -74.8], under: 0.45, taper: 4 },
  { from: [-85.4, -138.6], to: [-66, -150.6], taper: 1.4 },
  { from: [-11.4, -149.6], to: [0.8, -135.4], taper: 1.4 },
];
/** head.line: the head's outline as its own unclipped region, drawn after the head's clip group, reaching 0.5 pt past the head. */
function headLinePiece(): Piece {
  const [x0, y0, x1, y1] = bbox(head.segs);
  const box = pad([x0, y0, x1 - x0, y1 - y0], 2);
  const r = litEdge(head, headSpans, "head.line", box, { reach: 0.5 });
  const c = litEdge(head, clumps.map(({ notches }): LitSpan => ({ from: notches[0], to: notches[1], on: "tan", taper: 1.4 })), "cheek clump", box, { reach: 0.5, blur: 0.2 });
  // Where the crown's fur meets each ear's root with no line, the sheet's edge is soft: the crown's cream lies out
  // over the root's tan in a feathered edge.
  const s = uid("blur");
  const roots: [P, P][] = [[[-1.2, -135.4], [-20.4, -128]]];
  const feathered = roots.map(([a, b]) => strokeOf(spanPoints(head, ...([fracAt(head, a), fracAt(head, b)].sort((p, q) => p - q) as [number, number])), 2.4, { taper: 3, tip: 0.4 }).d).join("");
  return piece(`<defs>${r.defs}${c.defs}${blur(s, pad(box, 2), 0.8)}</defs>` +
    `<path d="${feathered}" fill="${C.fur}" opacity="0.75" filter="url(#${s})"/>${r.body}${c.body}`, box, {
    shapes: [{ name: "head.line", nodes: head.typed, segs: head.segs, outlined: [...r.outlined, ...c.outlined], fur: head.fur.map(([a, b]) => [fracAt(head, a), fracAt(head, b)]) }],
    lines: [...r.lines, ...c.lines],
  });
}

/**
 * The open eyes, by the dog's one eye recipe (parts/eye.ts, DECISIONS 73), each shaped as this crop draws it. The
 * near eye a slightly tall oval (the sheet's dark eye runs x −46.5 to −28.4 and y −105.3 to −85.6), its white a
 * crisp crescent down its outer side from about two o'clock round to its foot, widest (1.9 pt) low on the outer
 * side; the far eye narrower and turned 15° toward the nose, its white up its outer side above the level, 1.3 pt at
 * its widest; one catchlight each where the sheet's sits, high on the nose's side.
 */
const EYES: Record<"L" | "R", EyeSpec> = {
  L: {
    centre: [-37.45, -95.45], rx: 9.05, ry: 9.85, turn: -4, noseward: -1,
    rim: { top: 1.2, side: 0.9, foot: 0.7 }, lid: { from: -35, to: 120, width: 1.8, flick: 0.2 },
    white: { at: -24, width: 1.9, span: 56 }, shine: { at: [3.2, 5], r: 1.6 },
  },
  R: {
    centre: [-78.3, -104.8], rx: 6.6, ry: 8.8, turn: 15, noseward: 1,
    rim: { top: 1, side: 0.8, foot: 0.6 }, lid: { from: -30, to: 120, width: 1.6, flick: 0.15 },
    white: { at: -5, width: 1.3, span: 50 }, shine: { at: [2.2, 3.9], r: 1.3 },
  },
};

/** A brow, as the sheet paints it: a short, thick, rounded dab of tan, domed, its inner end no lower than its outer one; soft at its edges. */
function brow(pts: P[], width: number): Piece {
  const f = uid("blur"), [x0, y0, x1, y1] = bbox([[pts[0]!, pts[0]!, pts.at(-1)!, pts.at(-1)!], ...pts.map((p): [P, P, P, P] => [p, p, p, p])]);
  const box = pad([x0, y0, x1 - x0, y1 - y0], 4);
  return piece(`<defs>${blur(f, box, 0.35)}</defs><g filter="url(#${f})">` +
    `<path d="${strokeOf(pts, width, { taper: 2.2, tip: 1 }).d}" fill="${C.marking}" opacity="0.72"/></g>`, box);
}

/**
 * The nose (front.ts's recipe, turned): a rounded trapezoid, broad across its top and reaching further toward the
 * near side, as the sheet draws it (11.9 pt across, 7.7 tall), its near end lower with the turn, its foot a round
 * curve that runs on into the philtrum's top; a soft grey-brown sheen across its upper left.
 */
const noseShape = smooth([[-69.2, -96.5], [-65.4, -96.1], [-62.6, -95.1], [-61.2, -93.1], [-61.9, -91.2], [-64.1, -89.9], [-66.4, -89.1], [-67.9, -88.7],
  [-69.6, -89.2], [-71.4, -90.5], [-72.6, -92.3], [-72.7, -94.3], [-71.4, -95.9]]);
function nose(): Piece {
  const f = uid("blur"), e = uid("blur"), box: Box = [-76, -99, 18, 13];
  // Its edge a little soft, as the sheet paints it (the eyes' own edge blur).
  return piece(`<defs>${blur(f, box, 0.7)}${blur(e, box, 0.22)}</defs><path d="${pathD(noseShape.segs)}" fill="${C.eyeDark}" filter="url(#${e})"/>` +
    `<ellipse cx="-68.4" cy="-94.4" rx="3.1" ry="1.05" transform="rotate(-6 -68.4 -94.4)" fill="${C.noseSheen}" opacity="0.8" filter="url(#${f})"/>`, box);
}

/**
 * The open happy mouth (front.ts's recipe, turned), as the sheet draws it: the upper lip one inner line from the
 * far corner's curl, over the opening's top in a shallow w that rises to meet the short philtrum, down to the near
 * corner's curl, deep red-brown over the opening and the printed dark brown out along its ends. The opening hangs
 * from it in a round U (its far side nearly upright, its near side sloping, its foot a full round curve 15.7 pt
 * below the lip's corners); the dark red shows only as a band under the lip, deepest into the far corner; the broad
 * pink tongue fills the rest from wall to wall, a little domed at its top, with a soft lighter middle and a faint
 * groove down its centre; a dark red-brown rim runs down the opening's sides and round its foot.
 */
function mouth(): Piece {
  const lipPts: P[] = [[-77.6, -87.4], [-76.4, -86], [-74.8, -85.2], [-72.6, -85.3], [-70.6, -85.8], [-69.4, -85.8], [-67.2, -84.5], [-64.2, -83],
    [-61.2, -82.3], [-58.6, -82.1], [-56.6, -82.5], [-55.3, -83.4], [-54.8, -84.4]];
  const lipShape = smooth(lipPts, { closed: false });
  const lip = tapered(sample(lipShape.segs, 12, false), 0.9, "inner", "upper lip", { taper: 2.2, tip: 0.3 });
  const opening = smooth([[-74.4, -84.9], [-72.4, -85.2], [-70.4, -85.6], [-69.4, -85.5], [-67.2, -84.3], [-64.2, -82.8], [-61.2, -82.1], [-58, -81.8],
    [-58.2, -80.4], [-59.4, -77.6], [-60.8, -74.6], [-62.7, -72.3], [-65, -70.7], [-67.8, -70.1], [-70.4, -71.1], [-71.9, -73.9], [-72.8, -77.8],
    [-73.6, -81.6]], { corners: [0, 7] });
  const m = pathD(opening.segs);
  // The rim down the sides and round the foot: drawn twice its width centred on the edge inside the opening's clip,
  // so the half that shows lies inside the opening.
  const edge = sample(opening.segs, 16).filter(([, y]) => y > -81.4);
  const start = edge.findIndex(([x], i) => i > 0 && x > -59 && edge[i - 1]![0] <= -59);
  const along = start > 0 ? [...edge.slice(start), ...edge.slice(0, start)] : edge;
  const doubled: [number, number] = [LIMITS.inner[0] * 2, LIMITS.inner[1] * 2];
  const sides = strokeOf(along.filter(([x, y]) => y < -74 || x < -60), 1.6, { taper: 2.4, tip: 0.2, band: doubled });
  const rimLine: DrawnLine = { kind: "inner", width: 0.8, where: "mouth rim", drawn: [sides.drawn[0] / 2, sides.drawn[1] / 2] };
  const clip = uid("mouth"), softB = uid("blur"), lit = uid("blur"), lipFade = uid("lip"), rimB = uid("blur");
  const TONGUE = "M-75.4 -69 L-74.4 -79.6 C-72.2 -81.4 -69.4 -82.2 -66.2 -82 C-63 -81.8 -60.4 -81.2 -57.6 -79.8 L-56.6 -69Z";
  const groove = innerLine([[-66.5, -80.8], [-66.8, -78], [-67.2, -75]], 0.7, C.tongueRim, { taper: 1.2, tip: 0.1, opacity: 0.22 });
  const philtrum = innerLine([[-68.3, -88.9], [-68.7, -87.5], [-69.4, -85.8]], 0.9, C.eyeDark, { taper: 0.8, tip: 0.6, wobble: 0 });
  const box: Box = [-80, -91, 28, 23];
  const svg = `<defs><clipPath id="${clip}"><path d="${m}"/></clipPath>${blur(softB, box, 0.4)}${blur(lit, box, 1.2)}${blur(rimB, box, 0.2)}` +
    `<linearGradient id="${lipFade}" gradientUnits="userSpaceOnUse" x1="-78" y1="0" x2="-55" y2="0">` +
    `<stop offset="0.08" stop-color="${C.dark}"/><stop offset="0.25" stop-color="${C.lipLine}"/><stop offset="0.75" stop-color="${C.lipLine}"/>` +
    `<stop offset="0.92" stop-color="${C.dark}"/></linearGradient></defs>` +
    `<path d="${m}" fill="${C.mouthInside}"/><g clip-path="url(#${clip})">` +
    // Deepest right under the lip and back into the far corner.
    `<path d="M-76 -86.6 L-57 -83.4 L-57 -82.4 C-62 -82.6 -67 -83.8 -71 -84 C-73 -83.2 -74 -81.6 -75 -79.6Z" fill="${C.mouthDeep}" opacity="0.3" filter="url(#${softB})"/>` +
    `<path d="${TONGUE}" fill="${C.tongue}" filter="url(#${softB})"/>` +
    `<ellipse cx="-66.6" cy="-76.4" rx="3.6" ry="2.6" fill="${C.tongueShine}" opacity="0.45" filter="url(#${lit})"/>${groove.svg}` +
    `<path d="${sides.d}" fill="${C.mouthRim}" opacity="0.85" filter="url(#${rimB})"/></g>` +
    `<path d="${lip.d}" fill="url(#${lipFade})"/>${philtrum.svg}`;
  return piece(svg, box, { shapes: [], lines: [lip.line, rimLine, { ...groove.line, where: "tongue groove" }, { ...philtrum.line, where: "philtrum" }] });
}

/** The near cheek's blush, a broad soft oval under the near eye spreading along the cheek, where the sheet's is (the far cheek shows none). */
function blush(): Piece {
  const [cx, cy] = [-35.6, -78.6], rx = 8.4, ry = 4.2, deg = -8;
  const d = pathD(ellipse([cx, cy], rx, ry, deg));
  return soft(d, [cx - rx - 0.5, cy - ry - 0.8, 2 * rx + 1, 2 * ry + 1.6], C.blush, 2.2, Math.round(model.blush.restingLevel * 1.28 * 100) / 100);
}

/** The tag and its ring (front.ts's recipe): flat matte gold, one soft light high on its left lobe, the smaller heart raised in it. */
function tagPiece(): Piece {
  // The ring: a small rounded loop in the collar's light blue, leaning with the heart.
  const ringLine: DrawnLine = { kind: "inner", width: 0.6, where: "tag ring", drawn: [0.6, 0.6] };
  const [rx, ry] = [TAG_X - 1.6, LM["tag.ring"]![1] - 0.2];
  const ring = piece(`<rect x="${fmt(rx)}" y="${fmt(ry)}" width="3.2" height="6.6" rx="1.6" transform="rotate(${TAG_TILT + 4} ${fmt(TAG_X)} ${fmt(ry + 3.3)})" ` +
    `fill="${C.collarHighlight}" stroke="${C.collarRim}" stroke-width="${ringLine.width}"/>`, [rx - 2, ry - 1, 7.2, 8.6], { shapes: [], lines: [ringLine] });
  const emboss = sample(innerHeart.segs, 10);
  emboss.push(emboss[0]!);
  const lit = uid("blur"), raised = sample(innerHeart.segs, 10).filter(([x, y]) => x < TAG_X && y < -44.2);
  return join(ring, part("tag", heart, {
    fill: C.tag,
    // A soft shade round its lower right; the smaller heart raised in it, lit along its upper left and only faintly
    // edged, as the sheet paints it, not engraved.
    shade: { multiply: C.tagShadeBy, rim: { inset: 1, toLight: 1.8 }, blur: 1.2 },
    under: `<defs>${blur(lit, [TAG_X - 8, -51, 10, 10], 0.35)}</defs><path d="${strokeOf(raised, 1, { taper: 1.6, tip: 0.2 }).d}" fill="${C.tagShine}" opacity="0.8" filter="url(#${lit})"/>`,
    highlight: { d: `M${fmt(TAG_X - 6.6)} -47.4 a2.6 1.8 -40 1 0 5.2 0 a2.6 1.8 -40 1 0 -5.2 0`, colour: C.tagShine, opacity: 0.5, blur: 1.4 },
    inner: [{ pts: emboss, width: 0.7, colour: C.tagLine, opacity: 0.3 }],
    outline: { colour: C.tagLine, width: 1.2, taper: 2, blur: 0.25 },
  }));
}

/**
 * An ear's paint (front.ts's recipe): the tan deepening down the ear to a browner tan at its lower clumps under the
 * fur's own warm shade; the shade on the rim away from the light and along the inner edge where the ear tucks
 * under the head; a small soft light on its upper outer side; a few soft fur locks curving down into the notches
 * of its lower edge; and its line in the warm brown the sheet draws round the ears, heavier along the bottom,
 * lightening to the crown's line toward the root.
 */
function earPaint(side: "L" | "R"): Paint {
  const ear = ears[side];
  const deep = uid("deep"), parting = uid("blur"), along = uid("blur"), [ex0, ey0, ex1, ey1] = bbox(ear.segs);
  const earBox = pad([ex0, ey0, ex1 - ex0, ey1 - ey0], 2);
  // The locks' partings, curving down the ear with its outer contour into the notches between the locks of its lower
  // edge, and the lighter strokes between them, as the sheet paints them.
  const dark: P[][] = side === "R"
    ? [[[-108, -120], [-112.4, -110], [-114.6, -100], [-115.2, -92], [-115.4, -88.4]], [[-100, -118], [-104.6, -106], [-107.6, -94], [-109, -86], [-109.2, -82.6]],
      [[-94, -122], [-98, -108], [-100.6, -94], [-102, -84]]]
    : [[[12, -118], [19, -104], [23.4, -90], [25, -78], [25.6, -71]], [[2, -112], [7, -98], [9.4, -84], [10, -70], [9.8, -61.2]],
      [[-8, -100], [-6.6, -86], [-5, -72], [-4.4, -60.4]], [[20.6, -106], [25.6, -99.6], [29, -95.4]]];
  const light: P[][] = side === "R"
    ? [[[-104, -121], [-108.6, -110], [-111.6, -98], [-112.6, -88]], [[-96, -122], [-101, -110], [-104, -96], [-105.6, -84]]]
    : [[[6, -116], [13, -102], [17, -88], [18.6, -74]], [[-3, -108], [1, -94], [3, -80], [3.4, -66]]];
  const softly = (pts: P[][], width: number) => pts.map((l) => strokeOf(sample(smooth(l, { closed: false }).segs, 8, false), width, { taper: 6, tip: 0.2 }).d).join("");
  // Lighter and more golden at the root, in the head patches' paler tan, deepening down the ear (the sheet's
  // #EAAE7F by the near ear's root).
  const rootLight = uid("root");
  // The far ear, turned away, deepens from higher up than the near one, as the sheet paints it.
  const under = `<defs><linearGradient id="${deep}" gradientUnits="userSpaceOnUse" x1="0" y1="${side === "R" ? -118 : -100}" x2="0" y2="${fmt(ey1)}">` +
    `<stop offset="0" stop-color="${C.earDeep}" stop-opacity="0"/><stop offset="0.35" stop-color="${C.earDeep}"/>` +
    `<stop offset="0.72" stop-color="${C.earDeeper}"/><stop offset="1" stop-color="${C.earFoot}"/></linearGradient>` +
    `<linearGradient id="${rootLight}" gradientUnits="userSpaceOnUse" x1="0" y1="${side === "R" ? -143 : -136}" x2="0" y2="${side === "R" ? -125 : -117}">` +
    `<stop offset="0" stop-color="${C.patch}" stop-opacity="0.35"/><stop offset="1" stop-color="${C.patch}" stop-opacity="0"/></linearGradient>` +
    `${blur(parting, earBox, 0.7)}${blur(along, earBox, 1)}</defs>` +
    `<rect x="${fmt(ex0)}" y="${fmt(ey0)}" width="${fmt(ex1 - ex0)}" height="${fmt(ey1 - ey0)}" fill="url(#${deep})"/>` +
    `<rect x="${fmt(ex0)}" y="${fmt(ey0)}" width="${fmt(ex1 - ex0)}" height="${fmt(ey1 - ey0)}" fill="url(#${rootLight})"/>` +
    `<path d="${softly(light, 2.2)}" fill="${C.patch}" opacity="0.3" filter="url(#${along})"/>` +
    `<path d="${softly(dark, 1.5)}" fill="${C.earLow}" opacity="0.25" filter="url(#${parting})"/>`;
  const highlight = side === "R"
    ? "M-114 -110 C-112 -118 -104 -126 -94 -132 C-90 -130 -92 -122 -98 -116 C-104 -110 -110 -106 -114 -110Z"
    : "M0 -130 C6 -128 14 -120 20 -110 C24 -104 22 -98 16 -98 C10 -100 4 -110 0 -118 C-2 -124 -3 -130 0 -130Z";
  return {
    fill: C.marking,
    under,
    // The rim away from the light; the head's shadow where the ear goes under it is the head's own part (headShadow).
    shade: { multiply: C.furShadeBy, rim: { inset: 2.2, toLight: 3.6 }, blur: 3.2 },
    highlight: { d: highlight, colour: C.patch, opacity: 0.4, blur: 3 },
    // Each parting's last stretch into its notch drawn as a fine strand.
    inner: dark.map((pts) => ({ pts: sample(smooth(pts.slice(-3), { closed: false }).segs, 8, false), width: 0.75, colour: C.earLine, opacity: 0.45 })),
  };
}

/**
 * An ear's line (parts/lines.ts), on the tan: each lock carries its own, breaking at the notches, as the sheet draws
 * them; the near ear's foot, where it hangs over the back and the collar's end, lies under the head and runs deepest.
 */
function earSpans(side: "L" | "R"): LitSpan[] {
  return withDefaults({ on: "tan", taper: 2.6 }, side === "R"
    ? [{ from: [-93, -86], to: [-109.2, -82.6] }, { from: [-109.2, -82.6], to: [-115.4, -88.4] }, { from: [-115.4, -88.4], to: [-120.4, -104.6] },
      { from: [-120.4, -102], to: [-93.8, -133.4] }, { from: [-93.8, -133.4], to: [-85, -140.8] }]
    : [{ from: [-1, -135.4], to: [29, -95.4] }, { from: [29, -95.4], to: [25.6, -71] }, { from: [25.6, -71], to: [9.8, -61.2] },
      { from: [9.8, -61.2], to: [-4.4, -60.4], under: 0.7 }, { from: [-4.4, -60.4], to: [-15.2, -68], under: 0.7 }]);
}

/**
 * The head's shadow on an ear (spec L396: cast by the head, so it turns with the head, clipped to the ear it falls on):
 * a soft band of the ear's tan in the fur's warm shade just outside the face's side where the ear goes under it, and,
 * on the near ear, under the crown's overhang across its root. Typed along the head's edge, its inner side under the head.
 */
function headShadow(side: "L" | "R"): Piece {
  const band: P[] = side === "R"
    ? [[-78, -144.4], [-84.4, -128], [-87.4, -115], [-89, -102], [-91.6, -96.6], [-95.8, -98.2], [-93.4, -104], [-91.8, -116], [-89.4, -130], [-82.6, -145.4]]
    : [[2, -137.6], [-18.2, -134.4], [-21.4, -129.6], [-16.4, -115], [-14.2, -104], [-16, -91], [-19.2, -78], [-17.6, -66.4], [-13.6, -66.2], [-14.6, -78],
      [-11.4, -91], [-9.4, -104], [-11.4, -115], [-15.8, -126.6], [-15.2, -129.8], [1.6, -132.4]];
  const shape = smooth(band);
  const [x0, y0, x1, y1] = bbox(shape.segs);
  return soft(pathD(shape.segs), [x0, y0, x1 - x0, y1 - y0], C.earDeep, 1.4, side === "R" ? 0.8 : 0.5);
}

/**
 * Between the two front legs, as the sheet paints it: the chest's lower edge over the slot in a warm shade, deepening
 * down the narrow slot between the far leg and the near one to a deep warm tan just above the paws (the sheet's
 * #D7A074 to #C58F64 there).
 */
function between(): string {
  const g = uid("between"), f = uid("blur");
  const v = smooth([[-61, -29.6], [-57.6, -26.6], [-54.6, -23.4], [-53.2, -19], [-53.4, -14], [-55.4, -13.6], [-56.4, -18], [-58, -22.4]]);
  return `<defs><linearGradient id="${g}" gradientUnits="userSpaceOnUse" x1="0" y1="-30" x2="0" y2="-14">` +
    `<stop offset="0" stop-color="${C.marking}" stop-opacity="0.1"/><stop offset="0.45" stop-color="${C.marking}" stop-opacity="0.5"/>` +
    `<stop offset="1" stop-color="${C.earDeep}" stop-opacity="0.85"/></linearGradient>` +
    `${blur(f, [-66, -34, 18, 24], 0.7)}</defs>` +
    `<path d="${pathD(v.segs)}" fill="url(#${g})" filter="url(#${f})"/>`;
}

/**
 * Where the jaw's fur lies on the collar, as the sheet paints it: the chin's tufts lie over the band softly, with only
 * a little shade of its blue under them (front.ts's recipe without its dark rim, which here read as a lace edge).
 */
function collarContact(): string {
  const g = uid("blur"), f = uid("blur");
  const jaw = spanPoints(head, fracAt(head, [-24, -61.8]), fracAt(head, [-70, -61.6]));
  const shade = strokeOf(jaw, 5, { taper: 4, tip: 1 }).d;
  const rim = strokeOf(jaw, 2, { taper: 3, tip: 0.6 }).d;
  return `<defs>${blur(g, [-76, -66, 58, 14], 1)}${blur(f, [-76, -66, 58, 14], 0.6)}</defs>` +
    `<path d="${shade}" fill="${C.collarLine}" opacity="0.4" filter="url(#${g})"/><path d="${rim}" fill="${C.collarLine}" opacity="0.35" filter="url(#${f})"/>`;
}

export function threeQuarter(): Drawn[] {
  const out: Drawn[] = [];
  const add = (name: string, p: Piece, state?: string) => out.push({ part: name, piece: p, ...(state ? { state } : {}) });
  // The ground shadow, as tight as the sheet's (gone 2 to 3 pt below the ground line): a long soft warm oval under the
  // paws and the haunch, from under the far paw to under the tail, and a soft contact shadow a little deeper under each paw.
  add("shadow", join(soft("M-88 -0.6 a62 2.6 0 1 0 124 0 a62 2.6 0 1 0 -124 0Z", [-88, -3.2, 124, 5.2], C.shadow, 1.8, 0.85),
    ...([[-69, 11], [-44, 13], [-19, 10]] as const).map(([x, r]) => soft(`M${x - r} -0.6 a${r} 1.8 0 1 0 ${2 * r} 0 a${r} 1.8 0 1 0 ${-2 * r} 0Z`,
      [x - r, -2.4, 2 * r, 3.6], C.contact, 1.2, 0.7))));
  // The tail's line, light where its fur curls over at the top, a warmer brown down its far side's tufts and the
  // outline's brown round its foot (the sheet's #CABB9C on the curl, #BC9E7C down its side and #916F49 at its foot);
  // and a fur stroke running in from the notch at the foot of each tuft, as the sheet draws them. The foot behind the
  // haunch lies in the haunch's shade.
  // Each lobe's line ends in a short flick running on into the plume past the notch, as the sheet draws it.
  const flicks: P[][] = [[[30.4, -58.6], [31.6, -57.6], [32.4, -56], [32.4, -54]], [[36.6, -55.8], [37.6, -54.8], [38.2, -53.2], [38, -51.2]],
    [[42.6, -48.8], [42.8, -47], [42.4, -45], [41.4, -42.8]], [[42.8, -24.6], [41.6, -23.4], [40.2, -22.4], [38.4, -21.8]]];
  const strokes = flicks.map((pts) => ({ pts: sample(smooth(pts, { closed: false }).segs, 6, false), width: 0.8, colour: C.crownLine, opacity: 0.85 }));
  const tailPaint: Paint = {
    fill: C.fur,
    shade: furShade([tail], ["M6 -32 C12 -26 18 -20 30 -14 L32 -6 L6 -6Z"], ["M14 -64 L48 -64 L48 -46 L14 -46Z"]),
    inner: strokes,
  };
  // Round the hook and over each lobe its own line, breaking at the notches (parts/lines.ts); round the foot, where
  // the tan root reaches the edge, on the tan.
  const tailLines = withDefaults({ taper: 1.4 }, [{ from: [14.2, -34.6], to: [24.2, -56.6] }, { from: [24.2, -56.6], to: [31.6, -58.4] },
    { from: [31.6, -58.4], to: [37.6, -55.6] }, { from: [37.6, -55.6], to: [42.9, -47.6] }, { from: [42.9, -47.6], to: [41.8, -24] },
    { from: [41.8, -24], to: [30.4, -12.6] }, { from: [30.4, -12.6], to: [13.6, -10.8], on: "tan" }]);
  add("tail", litPart("tail", tail, tailPaint, tailLines));
  add("tail.base", litMarking("tail.base", { shape: tail, paint: tailPaint, spans: tailLines }, tailBase, { fill: C.marking, blur: 0.55, fade: { from: [19.5, -24], to: [22.5, -41] } }));
  add("body.back", litPart("body.back", back, backPaint, backLines));
  add("back.patch.L", litMarking("back.patch.L", { shape: back, paint: backPaint, spans: backLines }, saddleL, { fill: C.marking, blur: 0.8 }));
  add("rump.patch.L", litMarking("rump.patch.L", { shape: back, paint: backPaint, spans: backLines }, rumpL, { fill: C.marking, blur: 1 }));
  add("hind.L", roomy(litPart("hind.L", hind, {
    fill: C.fur,
    shade: furShade(hipGroup, [], ["M-34 -24 L-4 -24 L-4 -9 L-34 -9Z"]),
    inner: [[[-16.2, -2.3], [-16.4, -4.6], [-16.1, -7]], [[-22.7, -3.6], [-22.9, -5.8], [-22.6, -8]]]
      .map((pts) => ({ pts: pts as P[], width: 0.75, colour: C.warmLine, opacity: 0.5 })),
    // Its back end runs on into the haunch, where the sheet's line along the ground carries on unbroken.
    feather: { from: [-5.8, -8], to: [-10, -8] },
    // Its line, from where its sole meets the haunch's line along the ground, round its toe end and up over its crown,
    // where it fades into the thigh, as the sheet draws it.
  }, [{ from: [-9.4, -1.9], to: [-15.4, -16.6], taper: [5, 7] }]), 6));
  // The far front leg: the fur most of the way to its own warm shade (palette.ts, farFur), 6.2% darker than the
  // near leg; from where it comes out from under the chest it eases in from the fur over 11 pt, so the two join
  // with no edge. The sheet keeps it light: no rim of shade down its front, only a soft shade down its inner side
  // in the slot beside the near leg, under the chest's lower edge. Its line comes in light from under the chest
  // down its front and deepens to the paws' line round the paw.
  const farTop = uid("fartop");
  add("front.R", litPart("front.R", legR, {
    fill: C.farFur,
    under: `<defs><linearGradient id="${farTop}" gradientUnits="userSpaceOnUse" x1="0" y1="-33.4" x2="0" y2="-22">` +
      `<stop offset="0" stop-color="${C.fur}"/><stop offset="1" stop-color="${C.fur}" stop-opacity="0"/></linearGradient></defs>` +
      `<rect x="-86" y="-48" width="34" height="26" fill="url(#${farTop})"/>`,
    shade: { multiply: C.furShadeBy, shapes: ["M-67 -34 C-63 -30 -59 -26 -57 -20 L-54 -3 L-60 -3 C-61 -11 -62.4 -19 -66 -26 L-70 -33Z"], blur: 1.8 },
    inner: [[[-72.6, -4.2], [-72.8, -5.9], [-72.6, -7.6]], [[-78.6, -5.6], [-78.9, -7.2], [-78.7, -8.8]]]
      .map((pts) => ({ pts: pts as P[], width: 0.75, colour: C.warmLine, opacity: 0.45 })),
  }, [{ from: [-59.2, -5.2], to: [-77.6, -45], taper: [5, 8] }]));
  add("body.front", roomy(litPart("body.front", chest, {
    fill: C.fur,
    // Down the chest's far side, away from the light; the jaw's shadow on it is shadow.chin's, which turns with the head.
    shade: furShade(bodyGroup),
    under: between(),
    // A few soft fur strokes down the chest's far side under the collar's end, as the sheet draws them.
    inner: [[[-72, -47.4], [-72.8, -43], [-72.4, -38.6]], [[-67.6, -45.6], [-68.6, -41.6], [-69.2, -37.8]], [[-59.8, -27.6], [-59, -25.8], [-58.8, -24.2]]]
      .map((pts) => ({ pts: sample(smooth(pts as P[], { closed: false }).segs, 6, false), width: 0.7, colour: C.crownLine, opacity: 0.4 })),
    // The chest's front edge, the silhouette from the collar down to the far leg (the sheet's #B89778); and its lower
    // edge's long diagonal from under the tag to the slot between the legs, coming in faint as fur and deepening
    // where it meets the slot.
  }, [{ from: [-77.2, -37.6], to: [-73.4, -57.6], taper: 4 }, { from: [-55.2, -19.8], to: [-69.4, -33.4], taper: [3, 8] }]), 1));
  // The jaw's shadow on the chest, cast by the head (spec L396): a soft band under the jaw's edge, about 3 pt deep,
  // falling on the chest beside the collar's ends (the collar hides the middle of it).
  const jawShade: P[] = [[-14, -68], [-26, -63.2], [-43, -59.6], [-62, -61.6], [-74, -64.2], [-82, -69], [-80, -64.4], [-72, -59.2], [-62, -56.4],
    [-43, -54.6], [-26, -58.2], [-15, -63.4]];
  add("shadow.chin", soft(pathD(smooth(jawShade, { corners: [0, 5] }).segs), [-83, -70, 70, 16], C.furShade, 1.3));
  add("collar", part("collar", collar, {
    fill: C.collar,
    shade: { multiply: C.shadeBy, shapes: ["M-76 -55 C-60 -49 -40 -48 -18 -57 L-18 -46 L-76 -46Z"], blur: 0.9 },
    highlight: { d: "M-70 -57.4 C-58 -55 -42 -54 -24 -59 L-24 -57 C-42 -52 -58 -53 -70 -55.4Z", colour: C.collarHighlight, opacity: 0.3, blur: 0.9 },
    // The keeper the tag's ring hangs from, a lighter loop across the band, and the jaw's contact on the collar.
    under: `<rect x="${fmt(TAG_X - 2.6)}" y="-61" width="4.4" height="9.4" rx="1.2" fill="${C.collarHighlight}" opacity="0.4"/>` + collarContact(),
    outline: { colour: C.collarRim, width: THIN, taper: 3, blur: 0.2, spans: [{ from: [-22.8, -59.2], to: [-72.6, -58.4] }] },
  }));
  add("tag", tagPiece());
  for (const side of ["R", "L"] as const) {
    add(`ear.${side}`, litPart(`ear.${side}`, ears[side], earPaint(side), earSpans(side)));
    add(`shadow.head.${side}`, headShadow(side));
  }
  add("head.base", part("head.base", head, headPaint));
  add("head.patch.L", marking("head.patch.L", { shape: head, paint: headPaint }, patchL, { fill: C.patch, blur: 0.55, clip: false, fade: { from: [-43, -106], to: [-47, -103.4] } }));
  add("head.patch.R", marking("head.patch.R", { shape: head, paint: headPaint }, patchR, { fill: C.patch, blur: 0.6, clip: false, fade: { from: [-74, -114], to: [-69.8, -112.6] } }));
  add("blush.L", blush());
  add("eye.L", eye(EYES.L), "open");
  add("eye.R", eye(EYES.R), "open");
  add("brow.L", brow([[-36.9, -124.4], [-35.2, -125.5], [-33.4, -125.9], [-31.2, -125], [-29.4, -122.8]], 2.2));
  add("brow.R", brow([[-71.2, -131.4], [-72.8, -132], [-74.6, -131.6], [-76, -130.4]], 1.8));
  add("nose", nose());
  add("mouth", mouth(), "open");
  add("head.line", headLinePiece());
  add("tuft", topknot(CURLS, { fill: C.fur, highlight: { d: headLight, colour: C.light, opacity: 0.4, blur: 4 }, feather: { from: [-38, -146.2], to: [-38, -149.8] } }));
  // The near leg's line: up its back edge from the paw's heel it fades out before the thigh, as the sheet's does,
  // so the leg is no column; round the paw it is the paws' grey-brown line; up its front from the wrist it lightens
  // and fades out where the leg leaves the chest. Inside its back edge, the leg's own shade where it turns away
  // against the thigh.
  add("front.L", litPart("front.L", legL, {
    fill: C.fur,
    shade: furShade(bodyGroup, [], ["M-70 -70 L-20 -70 L-20 -36 L-70 -36Z", "M-34 -40 L-18 -40 L-18 -16 L-34 -16Z"]),
    // Two toe lines rising from the sole's scallops toward the paw's front, where the sheet draws them on the turned paw.
    inner: [[[-46.8, -2.2], [-47, -4.1], [-46.8, -6]], [[-54.4, -3.3], [-54.6, -5.1], [-54.4, -7]]]
      .map((pts) => ({ pts: pts as P[], width: 0.75, colour: C.warmLine, opacity: 0.5 })),
    feather: { from: [-40, -46], to: [-40, -38] },
  }, [{ from: [-25.2, -16], to: [-50.9, -27.6], taper: [9, 8] }]));
  return out;
}

/** Points the sheet has no finder for, where this drawing puts them (dev output for the sheet match). */
export const landmarks: Record<string, P> = {
  // Each paw's centre (DECISIONS 11), the middle of its rounded end: midway between its sides and between the wrist,
  // where its round begins, and its sole. The near front paw: from its front (x -59.1) to its heel (-30.2), round from
  // the wrist (y -15.8) to its sole (-1.5).
  "paw.front.L": [-44.7, -8.7],
  // The far front paw: from its toe end (x -83.2) to where it goes behind the near paw (-59.1), round from its wrist
  // (y -19.6) to its sole (-3.5).
  "paw.front.R": [-71.2, -11.6],
  // The near hind paw: from its toe end (x -26.8) to where its back end begins to fade into the haunch (-10), round
  // from its crown (y -16.7) to its sole (-1.5).
  "paw.hind.L": [-18.4, -9.1],
  // The ring's top as it shows below the jaw, from which the tag swings.
  "tag.ring": [TAG_X, LM["tag.ring"]![1] + 0.4],
  // The seat: the haunch's underside on the midline, behind the hind paw, at y -1.6, taken 0.8 pt inside.
  seat: [0, -2.4],
};
