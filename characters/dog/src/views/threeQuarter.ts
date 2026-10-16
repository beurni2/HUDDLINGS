// The dog's three-quarter view facing the sheet's left (threeQuarter.L, DECISIONS 1): the dog has turned to its
// right, so its left side is near. Shapes first, every node typed by hand in model space (points, the ground under
// the seat at 0, 0, y down) at the extremes and inflections read off the three-quarter turnaround, then paint. The
// paint is the front view's (front.ts): the same recipes for the ears, eyes, nose, mouth, collar, tag and paws,
// each part's nodes typed again from this view's own crop. Light comes from the top left, as in every view.
// threeQuarter.R is this view mirrored (views/facing.ts): threeQuarter() takes the facing.
import { furEdge, furSpan, type Lock } from "../../../draw/fur.ts";
import { bbox, ellipse, fracAt, pathD, rotate, sample, smooth, spanPoints, v, type Node, type P, type Shape } from "../../../draw/geom.ts";
import { innerLine, strokeOf, type DrawnLine, type Stroke } from "../../../draw/line.ts";
import { LIMITS } from "../../../draw/lint.ts";
import { marking, part, soft, type Paint } from "../../../draw/paint.ts";
import { blur, join, pad, piece, uid, type Box, type Piece } from "../../../draw/svg.ts";
import { model } from "../model.ts";
import { C, LINES } from "../palette.ts";
import type { BrowState } from "../parts/brow.ts";
import { eye, type EyeSpec, type LidBand } from "../parts/eye.ts";
import type { Star } from "../parts/stars.ts";
import { browState, drawLid, foreshortened, TURNED_MOUTHS, turnedMouth, turnedStars, type LidState, type TurnedEyeLid, type TurnedFrame, type TurnedMouthState } from "../parts/turned.ts";
import { litEdge, litMarking, litPart, withDefaults, type LitSpan } from "../parts/lines.ts";
import { curlShapes, topknot, type Curl } from "../parts/topknot.ts";
import { earFur } from "../parts/ear.ts";
import { toes } from "../parts/paw.ts";
import { tagPaint } from "../parts/tag.ts";
import { strands } from "../parts/marking.ts";
import { EYE_STATES, type Drawn } from "./front.ts";
import { facing, type Facing, type Side } from "./facing.ts";

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
/** A shape's middle across, about which a light typed toward the top left is reflected for the other facing. */
const middle = (s: Shape) => {
  const [x0, , x1] = bbox(s.segs);
  return (x0 + x1) / 2;
};

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
// to where it passes behind the near ear, as the sheet draws it: deepest (7.5 pt) under the near side of the chin,
// 6 pt toward its rounded end under the chin and still about 7 pt where it goes behind the ear, no point. Its top lies
// under the head's fur.
const collar = smooth([[-72.6, -61.8], [-60, -63], [-45, -62], [-30, -63.6], [-24.6, -65], [-21.8, -64.2], [-21, -61.4], [-21.6, -58.4], [-24.4, -56],
  [-30, -53.2], [-37.6, -50.6], [-45.4, -49.2], [-52.6, -49.8], [-60.6, -51.4], [-67, -52.4], [-70.6, -55.4], [-72.6, -58.4]]);

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
/** The two embossed hearts, the tag's own heart at 70% and 44% about its middle (x on the ring's line, y -44). */
const embossed = [0.7, 0.44].map((k) => smooth(rotate(mirrored(heartHalf.map(([x, y]): Node => [x * k, -44 + (y + 44) * k]), [0, -44 + (-36.2 + 44) * k], TAG_X),
  TAG_TILT, TAG_HANG), { corners: [0], typed: heartHalf.length + 1 }));

// The ears. The far ear (the dog's right) hangs out past the far cheek from high on the head's far side, its
// upper edge one long round convex arc from the root down to its widest (the sheet's runs x -86 at y -141, -94 at
// -136, -98.5 at -129); its lower edge hangs in three layered locks of fur, the outer one's tip lowest at the left
// (x -117.6), each tucked under the next at a soft dip (concave corners), as the sheet draws them; its inner edge
// runs on behind the face. The near ear hangs from just under the crown's overhang down beside the near cheek over
// the shoulder, broad and rounded below, its lower edge three soft clumps of uneven size, the outer one round over
// the ear's outer foot; its upper corner by the face is round and tucked under the overhang's underside, so no
// corner shows between the crown and the face's side. Each reaches well under the head at its root and along its
// inner edge (spec L394), its hidden end rounded.
// The far ear's upper edge rises from a small notch on its outer side as a round shoulder with one fur bump partway
// up (x -92.6, y -138.6), into the head behind the crown's fur, as the sheet draws it, no corner at its top.
const EAR_R_NOTCHES = [8, 10, 15];
const earR = smooth([[-80.8, -144], [-75.4, -141.6], [-76.6, -132], [-86.4, -108], [-94, -84], [-99.8, -78.5], [-104.4, -79.2], [-107.4, -80.4],
  [-109.2, -82.6], [-112.8, -84.9], [-115.4, -88.4], [-119.4, -91.4], [-120.8, -96.6], [-120.8, -105.6], [-119.8, -110.6], [-118.2, -113.2], [-116.6, -117.4],
  [-112.2, -122.8], [-104, -129.6], [-96, -135], [-92.6, -138.4], [-88.4, -141.2], [-84.4, -143.4]], { corners: EAR_R_NOTCHES });
const EAR_L_NOTCHES = [12, 15];
const earL = smooth([[-5, -140.6], [7.6, -130.4], [12, -125.6], [15, -118.4], [18.8, -111.4], [25.8, -105.2], [29, -95.4], [30.9, -88.6],
  [30.8, -80.6], [29.2, -74.4], [25.4, -68.4], [18.6, -63.2], [9.8, -61.2], [5.4, -59.2], [1.6, -58.6], [-4.4, -60.4], [-9.4, -61.8],
  [-18.6, -71], [-20.4, -80], [-20.2, -95], [-21.8, -114], [-21.4, -125], [-18, -133.4]], { corners: EAR_L_NOTCHES });
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
// Under the chin the fur hangs over the collar in four soft, shallow tufts of quite uneven size, not a row of even scallops.
const chinLocks: Lock[] = [{ len: 0.8, w: 1.5, lean: 0.35 }, { len: 0.45, w: 0.8, lean: 0.2 }, { len: 1, w: 1.9, lean: 0.25 }, { len: 0.55, w: 1.1, lean: 0.05 }];
/** Each cheek clump's tip, root and notches (path order), for its line. */
const clumps: { tip: P; root: P; notches: [P, P] }[] = [];
head = furEdge(head, [-24, -61.8], [-70, -61.6], chinLocks, 0.34);
head = furEdge(head, [-91.4, -75], [-99.2, -94.2], cheekLocks, 0.4, (tip, root, notches) => clumps.push({ tip, root, notches }));
// The crown's fur where it overhangs the near ear's root is a lock of fur, its tip a fur span.
head = furSpan(head, [3.2, -137.4], [0.4, -135.5]);
// Under the overhang the crown's cream fur comes down over the near ear's root in one long soft flame, as the sheet
// draws it, so the root has no flat top edge and no row of teeth.
head = furEdge(head, [-1.6, -135.2], [-12.8, -132.6], [{ len: 3.4, w: 1, lean: 0.3 }], 0.24);
// The near cheek's puff breaks into two soft tufts where it laps over the near ear's inner edge, as the sheet draws it.
head = furEdge(head, [-14.4, -88], [-17.2, -75.4], [{ len: 1.4, w: 1.2, lean: 0.3 }, { len: 1, w: 1, lean: 0.35 }], 0.4);
// Over the far ear's root the crown's fur breaks into two small wisps, its line broken by them at the top.
head = furEdge(head, [-86.8, -127.4], [-81.8, -139.8], [{ len: 1.2, w: 1, lean: 0.3 }, { len: 0.8, w: 0.8, lean: 0.35 }], 0.3);

// The topknot (parts/topknot.ts): three separate curls of fur, seen turned, as the sheet draws them, back to front.
// The left curl low and broad, a leaf pointing out to its tip at the left (x -67.2), the crown's line running in
// under it to a V at its underside, and its own line from there along its underside, round the tip and over its
// crown (y -158.4) to where it tucks behind the middle one; the right curl low, rising from behind the middle one
// over its crown (y -157.4) to a V at the right (x -12.2), where the crown's line runs on down the head and a stroke
// runs back along its underside into the fur; and in front the tall middle curl, its top the head's highest point
// (y -164.5), its line dipping into the V at its left foot and running on down into the fur, its right side coming
// down into the fur behind the right curl's start. Each curl's hidden foot lies in the crown, feathered into it.
const CURLS: Curl[] = [
  { nodes: [[-67.2, -153.8], [-65.4, -156.2], [-61.4, -157.8], [-56.6, -158.4], [-52.2, -157.6], [-48.8, -154.8], [-46.4, -151], [-50, -147.4], [-56, -148.2],
    [-61.4, -150.4], [-64.6, -151.8]],
    line: { from: [-61.6, -150.4], to: [-48.8, -154.8], taper: [0.8, 1] }, tip: [[-66.6, -152.8], [-66.8, -154.8]] },
  { nodes: [[-32, -152], [-30, -155.4], [-26.4, -157.2], [-21, -157.6], [-16.4, -156.6], [-13.4, -154.6], [-12.2, -152.4], [-11.4, -149.6], [-16.6, -147.6],
    [-24, -147], [-31, -148.4]],
    line: { from: [-30.4, -155.2], to: [-11.4, -149.8], taper: [1, 0.4] }, into: [[[-12.4, -152.3], [-15.6, -151.6], [-19.4, -151.1]]],
    tip: [[-12.6, -153.4], [-11.8, -151.2]] },
  { nodes: [[-48.6, -154.4], [-46.4, -159.4], [-41.6, -163], [-35.6, -164.5], [-31, -162.8], [-29.4, -159.4], [-30.2, -155.6], [-31.6, -153.6], [-33, -150],
    [-40, -146.6], [-46, -149]],
    line: { from: [-48.6, -154.4], to: [-31.6, -153.6], taper: [0.6, 2.2] }, into: [[[-48.7, -154.7], [-48.2, -152.8], [-47.2, -151.2]]] },
];
const tuftShapes = curlShapes(CURLS);

// The head patches, in the paler tan (DECISIONS 18). The near one (the dog's left) is a broad hood arching over
// the top and the outer side of the near eye, its top edge about 9 pt above the eye with the brow in the cream above
// it, its nose end down to about the eye's middle; it runs down the face's side behind the eye to the cheek and
// rises along the face's side into the near ear's root, a wedge of the crown's cream coming down between the hood
// and that band to a point (x -20.2, y -106.2), as the sheet paints it. The far one is a small round hood over the far eye's outer top,
// from the face's far side to about the eye's middle, running up the face's far side in a narrow band toward the far ear's
// root; below the hood, beside the eye, the face is cream, as the sheet paints it. Each is typed with bleed
// past the head's edge; the eyes cover what lies under them.
const patchL = smooth([[-46.4, -104.8], [-43.6, -110.4], [-38, -113.8], [-31, -115], [-26, -113.4], [-22.4, -108.6], [-20.2, -106.2], [-18, -112], [-17.4, -123],
  [-20.4, -127.4], [-14.8, -131.8], [-10, -128], [-8, -116], [-8, -100], [-11, -86], [-15, -79.6], [-21, -79.6], [-25.4, -82.4], [-27.6, -87], [-28.6, -95],
  [-33, -103.6], [-40, -105.6], [-44.6, -102.6]], { corners: [6] });
const patchR = smooth([[-95, -140], [-89.6, -140.4], [-86.6, -136.4], [-84.8, -130.4], [-83, -126.4], [-79, -125], [-75.6, -122.6], [-73.4, -118.6],
  [-73.4, -114.6], [-75.8, -111.6], [-80, -110.6], [-84.4, -111.6], [-88.6, -114.6], [-95, -118]]);

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
// Its foot breaks into two soft, uneven tufts, combed back toward the haunch.
const fringeLocks: Lock[] = [{ len: 0.8, w: 1.6, lean: 0.35 }, { len: 0.5, w: 0.9, lean: 0.3 }];
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

const backPaint = (F: Facing): Paint => ({
  fill: C.fur,
  // The haunch's rear and its underside, away from the light; and the gap beside the thigh in the fur's shade.
  shade: furShade(hipGroup, [pathD(smooth(gapNodes).segs)], ["M-24 -70 L4 -58 L14 -42 L6 -36 L-20 -50Z"]),
  under: thighLayers,
  inner: [{ pts: sample(smooth(thighPts, { closed: false }).segs, 8, false), width: 0.8, colour: `url(#${THIGH})` }],
  light: F.light,
});
/**
 * The back's line (parts/lines.ts): from under the ear down the sloping back, where the saddle's tan reaches it, on
 * the tan; round the rump on the cream, and on the tan again where the rump's spot meets it (the sheet's #A35F32
 * there), on the cream in a facing with no rump spot (threeQuarter.R); then round the haunch's rear and along the
 * ground under it, deepening to the darkest.
 */
const backLines = (F: Facing): LitSpan[] => [{ from: [-17, -62], to: [9.8, -39.6], on: "tan", taper: 5 }, { from: [7.4, -42.2], to: [14.4, -34], taper: 4 },
  { from: [13.6, -36.2], to: [14.4, -14], on: F.shows("rump.patch.L") ? "tan" : "cream", taper: 4 }, { from: [14.6, -16.6], to: [-31, -5.4], taper: 5 }];

/** The face's middle across, halfway between the far cheek's puff (x -100.4) and the near face's side (x -14.2). */
const FACE_MID = (-100.4 + -14.2) / 2;
/**
 * The head's light, one for the head and the topknot's light group: along the crown under the topknot, and on the
 * cheek toward the light, the far cheek's puff here; in the other facing the crown's light across the head's middle
 * and the cheek's across the face's, on the near cheek, which faces the light there.
 */
const headLight = (F: Facing) => `${F.lit("M-64 -150 C-52 -158 -30 -158 -18 -152 C-24 -142 -50 -140 -62 -144Z", middle(head))} ` +
  F.lit("M-99.4 -90 C-99 -95 -95.4 -97.6 -91.6 -96.4 C-90.2 -92 -91.4 -86 -94.6 -83.4 C-97.6 -84.2 -99.6 -86.8 -99.4 -90Z", FACE_MID);
const headPaint = (F: Facing): Paint => ({
  fill: C.fur,
  // Under the jaw over the collar, where the head turns under; the far side of the jaw away from the light; and
  // a faint wash in the near hood just over the eye, under the brow.
  shade: furShade(headGroup, ["M-74 -64 C-56 -60 -36 -59 -14 -64 L-14 -52 L-74 -52Z", "M-94 -74 C-86 -68.4 -80 -65.6 -72 -64 L-72 -54 L-102 -60Z",
    `M${fmt(LM["eye.L"]![0] - 8)} ${fmt(LM["eye.L"]![1] - 10.4)} a8 2 0 1 0 16 0 a8 2 0 1 0 -16 0Z`],
    // The crown stays light right out to its line, as the sheet paints it, the overhang over the near ear's root
    // included; and so does the far cheek's puff.
    // The crown, the far cheek's puff and the near cheek stay light right out to their edges, as the sheet paints them
    // (L* 95 to 97 down to the jaw), only the jaw's edge in shade.
    ["M-100 -172 L10 -172 L10 -140 L-100 -140Z", "M-30 -141 L10 -141 L10 -131 L-30 -131Z", "M-103 -101 L-88 -101 L-88 -80 L-103 -80Z",
      "M-52 -84 L-12 -84 L-12 -66.4 C-26 -64.6 -40 -64.4 -52 -65.6Z"], { inset: 3, toLight: 4.5 }),
  highlight: { d: headLight(F), colour: C.light, opacity: 0.4, blur: 4 },
  light: F.light,
});

/**
 * The head's line (head.line), where the sheet draws one, by the dog's one line rule (parts/lines.ts): the crown's
 * light line, from the topknot's left lobe down to the far ear's root and from its right lobe down round the
 * overhang over the near ear; down each side, where the face lies over an ear, a round curve on the tan, deep where
 * the face tucks over it (the sheet's #995727 and #9F582C, DECISIONS 7), ending where the cheek comes out over it;
 * and under the chin, down the far side of the jaw, a deeper line (the sheet's #BC997D). The far cheek's clumps each
 * carry their own line, on the far ear's tan, broken at each notch.
 */
/** The near side's curve, where the face lies over the near ear. */
const NEAR_SIDE: LitSpan = { from: [-16.4, -120], to: [-14.4, -88.6], on: "tan", under: 0.45, taper: [4, 2] };
const headSpans: LitSpan[] = [
  { from: [-91, -102], to: [-87.4, -127], on: "tan", under: 0.3, taper: [4, 6] },
  NEAR_SIDE,
  { from: [-74, -62.6], to: [-91, -74.8], under: 0.15, taper: 4 },
  { from: [-83.6, -141], to: [-61.8, -149.8], taper: [1.4, 0.4] },
  { from: [-15, -149.6], to: [0.8, -135.4], taper: 1.4 },
];
/**
 * head.line: the head's outline as its own unclipped region, drawn after the head's clip group, reaching 0.5 pt past the
 * head. `temple`: the near ear perked, where the head runs on behind the face's side into the nape the perked ear
 * uncovers, so the near side's curve, which would lie inside it as a crease, is left out, as the front's temple states
 * leave theirs. It is keyed by the front lane's name for that ear raised alone (templeL, or templeR in .R), which every
 * preset gives only a perked ear; `temples` (both ears raised, the lifted presets) keeps the rest line, since this view
 * draws no lifted ear and the ear hangs there still (DECISIONS 176).
 */
function headLinePiece(F: Facing, temple = false): Piece {
  const [x0, y0, x1, y1] = bbox(head.segs);
  const box = pad([x0, y0, x1 - x0, y1 - y0], 2);
  // Left out by shortening it to its first step along the outline, too short to draw, so every other span keeps its
  // place in the list (the line rule wobbles each span's width by its place) and draws exactly as the rest line's.
  const step = spanPoints(head, fracAt(head, NEAR_SIDE.from), fracAt(head, NEAR_SIDE.to)).slice(0, 2) as [P, P];
  const spans = temple ? headSpans.map((s) => (s === NEAR_SIDE ? { ...s, from: step[0], to: step[1] } : s)) : headSpans;
  const r = litEdge(head, spans, "head.line", box, { reach: 0.5, light: F.light });
  const c = litEdge(head, clumps.map(({ notches }): LitSpan => ({ from: notches[0], to: notches[1], taper: 1.4 })), "cheek clump", box, { reach: 0.5, blur: 0.2, light: F.light });
  // Where the crown's fur meets each ear's root with no line, the sheet's edge is soft: the crown's cream lies out
  // over the root's tan in a feathered edge.
  const s = uid("blur");
  const roots: [P, P][] = [[[-1.2, -135.4], [-20.4, -128]], [[-20.6, -127.4], [-15.6, -117.4]]];
  const feathered = roots.map(([a, b]) => strokeOf(spanPoints(head, ...([fracAt(head, a), fracAt(head, b)].sort((p, q) => p - q) as [number, number])), 1.6, { taper: 3, tip: 0.4 }).d).join("");
  return piece(`<defs>${r.defs}${c.defs}${blur(s, pad(box, 2), 0.6)}</defs>` +
    `<path d="${feathered}" fill="${C.fur}" opacity="0.6" filter="url(#${s})"/>${r.body}${c.body}`, box, {
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
    centre: [-38.1, -95.15], rx: 9.5, ry: 9.5, turn: -4, noseward: -1,
    rim: { top: 1.2, side: 0.9, foot: 0.6 }, lid: { from: -35, to: 120, width: 1.8, flick: 0.2 },
    white: { at: -25, width: 1.5, span: 35, fade: 0.5 }, shine: { at: [3.4, 4.8], r: 1.75 },
  },
  R: {
    centre: [-78.3, -104.8], rx: 6.6, ry: 8.65, turn: 15, noseward: 1,
    rim: { top: 1, side: 0.8, foot: 0.5 }, lid: { from: -30, to: 120, width: 1.6, flick: 0.15 },
    white: { at: -10, width: 1.2, span: 36, fade: 0.5 }, shine: { at: [2.2, 3.9], r: 1.4 },
    glow: { band: 5, warm: 2.2 },
  },
};

/** Each brow's centre line from its inner end (by the nose) to its outer, and its width, where the sheet paints it. */
const BROWS = {
  L: { pts: [[-36.9, -124.4], [-35.2, -125.5], [-33.4, -125.9], [-31.2, -125], [-29.4, -122.8]] as P[], width: 2.2 },
  R: { pts: [[-71.2, -131.4], [-72.8, -132], [-74.6, -131.6], [-76, -130.4]] as P[], width: 1.8 },
};

/** A brow, as the sheet paints it: a short, thick, rounded dab of tan, domed, its inner end no lower than its outer one; soft at its edges. */
function brow(pts: P[], width: number): Piece {
  const f = uid("blur"), [x0, y0, x1, y1] = bbox([[pts[0]!, pts[0]!, pts.at(-1)!, pts.at(-1)!], ...pts.map((p): [P, P, P, P] => [p, p, p, p])]);
  const box = pad([x0, y0, x1 - x0, y1 - y0], 4);
  return piece(`<defs>${blur(f, box, 0.35)}</defs><g filter="url(#${f})">` +
    `<path d="${strokeOf(pts, width, { taper: 2.2, tip: 1 }).d}" fill="${C.marking}" opacity="0.72"/></g>`, box);
}

/**
 * The nose (front.ts's recipe, turned): a rounded inverted triangle, broad and nearly flat across its top (12.2 pt
 * across, as the sheet draws it), narrowing to a small round point at its foot (x -66.9), where the philtrum starts; a
 * soft grey-brown sheen across its upper left.
 */
const noseShape = smooth([[-69.3, -95.9], [-65.3, -95.9], [-63.1, -95.3], [-61.9, -93.7], [-62.3, -91.9], [-63.9, -90.1], [-65.5, -88.7], [-66.9, -88.0],
  [-68.5, -88.6], [-70.9, -90.3], [-73.3, -92.1], [-74.1, -93.9], [-72.9, -95.5]]);
function nose(): Piece {
  const f = uid("blur"), e = uid("blur"), box: Box = [-76, -99, 18, 13];
  // Its edge a little soft, as the sheet paints it (the eyes' own edge blur).
  return piece(`<defs>${blur(f, box, 0.7)}${blur(e, box, 0.22)}</defs><path d="${pathD(noseShape.segs)}" fill="${C.eyeDark}" filter="url(#${e})"/>` +
    `<ellipse cx="-67.6" cy="-94" rx="3.1" ry="1.05" transform="rotate(-6 -67.6 -94)" fill="${C.noseSheen}" opacity="0.8" filter="url(#${f})"/>`, box);
}

/**
 * The open happy mouth (front.ts's recipe, turned), as the sheet draws it: the upper lip one inner line from the
 * far corner's curl, over the opening's top in a shallow w that rises to meet the short philtrum, down to the near
 * corner's curl, deep red-brown over the opening and the printed dark brown out along its ends. The opening hangs
 * from it skewed with the turn: its far side steep, just under the nose, its foot a round curve left of its middle
 * (x -68.6) 14.5 pt below the lip's corners, its near side one long diagonal up to the near corner; the dark red
 * shows as a band under the lip, deepest into the far corner; the pink tongue a dome in its lower half, its top
 * peaking left of the middle, with a soft lighter middle and no groove; a dark red-brown rim runs down the opening's
 * sides and round its foot.
 */
/** The rest mouth's upper lip, from the far corner's curl to the near one's; the philtrum meets it at (−69.4, −85.8). */
const REST_LIP: P[] = [[-77.6, -87.4], [-76.4, -86], [-74.8, -85.2], [-72.6, -85.3], [-70.6, -85.8], [-69.4, -85.8], [-67.2, -84.5], [-64.2, -83],
  [-61.2, -82.3], [-58.6, -82.1], [-56.6, -82.5], [-55.3, -83.4], [-54.8, -84.4]];
function mouth(): Piece {
  const lipShape = smooth(REST_LIP, { closed: false });
  const lip = tapered(sample(lipShape.segs, 12, false), 0.9, "inner", "upper lip", { taper: 2.2, tip: 0.3 });
  const opening = smooth([[-75.2, -85.2], [-72.8, -85.6], [-70.6, -86], [-69.6, -85.8], [-67.2, -84.4], [-64.2, -82.9], [-61.2, -82.2], [-58.2, -81.9],
    [-59, -79.2], [-60.6, -76.2], [-62.8, -73.4], [-65.6, -71.6], [-68.6, -71], [-71.4, -71.8], [-73.4, -74], [-74.6, -77.4],
    [-75.2, -81.2]], { corners: [0, 7] });
  const m = pathD(opening.segs);
  // The rim down the sides and round the foot: drawn twice its width centred on the edge inside the opening's clip,
  // so the half that shows lies inside the opening.
  const edge = sample(opening.segs, 16).filter(([, y]) => y > -81.4);
  const start = edge.findIndex(([x], i) => i > 0 && x > -59.2 && edge[i - 1]![0] <= -59.2);
  const along = start > 0 ? [...edge.slice(start), ...edge.slice(0, start)] : edge;
  const doubled: [number, number] = [LIMITS.inner[0] * 2, LIMITS.inner[1] * 2];
  const sides = strokeOf(along.filter(([x, y]) => y < -74 || x < -60), 1.6, { taper: 2.4, tip: 0.2, band: doubled });
  const rimLine: DrawnLine = { kind: "inner", width: 0.8, where: "mouth rim", drawn: [sides.drawn[0] / 2, sides.drawn[1] / 2] };
  const clip = uid("mouth"), softB = uid("blur"), lit = uid("blur"), lipFade = uid("lip"), rimB = uid("blur");
  const TONGUE = "M-76 -69 L-75.4 -77.6 C-73.6 -79.8 -71.2 -80.8 -68.6 -80.8 C-65.6 -80.8 -62.8 -79.8 -60.2 -77.6 L-58 -69Z";
  const philtrum = innerLine([[-67, -88.4], [-67.8, -87.2], [-69.4, -85.8]], 0.9, C.eyeDark, { taper: 0.8, tip: 0.6, wobble: 0 });
  const box: Box = [-80, -91, 28, 23];
  const svg = `<defs><clipPath id="${clip}"><path d="${m}"/></clipPath>${blur(softB, box, 0.4)}${blur(lit, box, 1.2)}${blur(rimB, box, 0.2)}` +
    `<linearGradient id="${lipFade}" gradientUnits="userSpaceOnUse" x1="-78" y1="0" x2="-55" y2="0">` +
    `<stop offset="0.08" stop-color="${C.dark}"/><stop offset="0.25" stop-color="${C.lipLine}"/><stop offset="0.75" stop-color="${C.lipLine}"/>` +
    `<stop offset="0.92" stop-color="${C.dark}"/></linearGradient></defs>` +
    `<path d="${m}" fill="${C.mouthInside}"/><g clip-path="url(#${clip})">` +
    // Deepest right under the lip and back into the far corner.
    `<path d="M-76 -86.6 L-57 -83.4 L-57 -82.4 C-62 -82.6 -67 -83.8 -71 -84 C-73 -83.2 -74 -81.6 -75 -79.6Z" fill="${C.mouthDeep}" opacity="0.3" filter="url(#${softB})"/>` +
    `<path d="${TONGUE}" fill="${C.tongue}" filter="url(#${softB})"/>` +
    `<ellipse cx="-68" cy="-76" rx="3.4" ry="2.4" fill="${C.tongueShine}" opacity="0.45" filter="url(#${lit})"/>` +
    `<path d="${sides.d}" fill="${C.mouthRim}" opacity="0.85" filter="url(#${rimB})"/></g>` +
    `<path d="${lip.d}" fill="url(#${lipFade})"/>${philtrum.svg}`;
  return piece(svg, box, { shapes: [], lines: [lip.line, rimLine, { ...philtrum.line, where: "philtrum" }] });
}

/** The near cheek's blush, a broad, faint, soft oval under the near eye spreading along the cheek, where the sheet's is (phase 2 found no blush box on the far cheek, so the blush check holds it to none there). */
function blush(): Piece {
  // Broad and faint, as the sheet's melts into the cheek: wider than the first pass's oval, softer at its edge.
  const [cx, cy] = [-35.4, -78.4], rx = 10, ry = 5, deg = -8;
  const d = pathD(ellipse([cx, cy], rx, ry, deg));
  return soft(d, [cx - rx - 0.5, cy - ry - 0.8, 2 * rx + 1, 2 * ry + 1.6], C.blush, 3, Math.round(model.blush.restingLevel * 1.1 * 100) / 100);
}

/** The tag and its small round ring, by the dog's one tag recipe (parts/tag.ts). */
function tagPiece(F: Facing): Piece {
  // The ring: a small rounded loop in the collar's light blue, leaning with the heart.
  const ringLine: DrawnLine = { kind: "inner", width: 0.6, where: "tag ring", drawn: [0.6, 0.6] };
  const [rx, ry] = [TAG_X - 1.6, LM["tag.ring"]![1] - 0.2];
  // The ring: a narrow loop in the collar's light blue hanging from the band to the heart's cleft, as the sheet draws it.
  const ring = piece(`<rect x="${fmt(TAG_X - 1.2)}" y="${fmt(ry)}" width="2.4" height="6.4" rx="1.2" transform="rotate(${TAG_TILT + 4} ${fmt(TAG_X)} ${fmt(ry + 3.5)})" ` +
    `fill="${C.collarHighlight}" stroke="${C.collarLine}" stroke-width="${ringLine.width}"/>`, [rx - 2, ry - 1, 7.2, 8.6], { shapes: [], lines: [ringLine] });
  // The dog's one tag recipe (parts/tag.ts): matte gold warming toward orange along its lower right, one small soft
  // light on its upper left lobe, no glossy streak, and two smaller hearts embossed as concentric warm rings.
  // Its light on the lobe toward the light, across the heart's middle in either facing.
  return join(ring, part("tag", heart, { ...tagPaint({ emboss: embossed, light: F.lit(`M${fmt(TAG_X - 6.4)} -47.2 a2.2 1.5 -40 1 0 4.4 0 a2.2 1.5 -40 1 0 -4.4 0`, middle(heart)),
    rim: 1.25 }), light: F.light }));
}

/**
 * An ear's paint, by the dog's one ear recipe (parts/ear.ts, DECISIONS 76), as this crop paints it: lighter and more
 * golden at the root, in the head patches' paler tan (the sheet's #EAAE7F by the near ear's root), deepening down the
 * ear, the far ear, turned away, from higher up; long locks curving down with the ear's outer contour into the dips
 * of its lower edge; a soft light on its upper outer side; and its rim of shade away from the light. The head's
 * shadow where the ear goes under it is the head's own part (headShadow).
 */
function earPaint(side: "L" | "R", F: Facing): Paint {
  return { ...(side === "R"
    ? earFur({
      ear: ears.R, axis: [[-95, -137], [-108, -80]], deepen: [0.3, 1.12],
      locks: [[[-115.6, -110], [-117.8, -103], [-118.6, -96]], [[-111.4, -106], [-114, -99], [-115.2, -92], [-115.4, -88.8]],
        [[-103.6, -103], [-106.6, -96], [-108.6, -88.4], [-109.2, -83.2]], [[-97.2, -99], [-99.8, -91.6], [-101.2, -84.6]],
        [[-92.4, -96], [-94.2, -89], [-95.4, -83.6]]],
      dips: [[-109.2, -82.6], [-115.4, -88.4]],
      // On its upper outer side, toward the light; in the other facing across the ear's middle, toward the light there.
      light: F.lit("M-114 -110 C-112 -118 -104 -126 -94 -132 C-90 -130 -92 -122 -98 -116 C-104 -110 -110 -106 -114 -110Z", middle(ears.R)),
      under: [],
    })
    : earFur({
      ear: ears.L, axis: [[5, -134], [8, -60]], deepen: [0.45, 1.12],
      locks: [[[15.4, -95], [18.4, -86], [18.8, -76.4]], [[21.6, -91], [24.4, -82], [24.6, -72.4]], [[6.6, -92], [9.4, -82], [10, -71.4], [9.8, -62]],
        [[-4.4, -87], [-4.8, -75.6], [-4.4, -61.4]], [[-12.4, -84], [-12, -74.6], [-10.8, -67]]],
      // Along its outer edge from its top down to its outer bump, the fold where the ear turns over, the back layer beyond it.
      fold: { line: [[4.2, -131.6], [10, -124.4], [14.6, -116.4], [18.4, -109.6], [22.6, -103.6]],
        back: "M2 -134 L10.4 -126.8 L16.4 -118 L20.6 -110.8 L25.8 -104.4 L34 -104 L34 -142 L2 -142Z" },
      dips: [[9.8, -61.2], [-4.4, -60.4]],
      // On its outer turn, as the crop paints it; mirrored with the ear in the other facing, where that turn faces the light.
      light: "M0 -130 C6 -128 14 -120 20 -110 C24 -104 22 -98 16 -98 C10 -100 4 -110 0 -118 C-2 -124 -3 -130 0 -130Z",
      under: [],
    })), light: F.light };
}

/**
 * An ear's line (parts/lines.ts), on the tan: each lock carries its own, breaking at the notches, as the sheet draws
 * them; the near ear's foot, where it hangs over the back and the collar's end, lies under the head and runs deepest.
 */
function earSpans(side: "L" | "R"): LitSpan[] {
  // The near ear's foot hangs over the back and the collar's end, a place under the head: deepest there.
  const foot = (p: P) => Math.min(0.7, Math.max(0, (p[1] + 74) / 6) * 0.7);
  return withDefaults({ on: "tan", taper: 2.6 }, side === "R"
    ? [{ from: [-93, -86], to: [-109.2, -82.6] }, { from: [-109.2, -82.6], to: [-115.4, -88.4] }, { from: [-115.4, -88.4], to: [-120.4, -104.6] },
      { from: [-120.6, -100], to: [-118.2, -113.2] }, { from: [-118.2, -113.2], to: [-83, -143.8], taper: [2.6, 1] }]
    : [{ from: [-1, -135.4], to: [9.8, -61.2], under: foot }, { from: [9.8, -61.2], to: [-4.4, -60.4], under: 0.7 }, { from: [-4.4, -60.4], to: [-15.2, -68], under: 0.7 }]);
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

/** The three-quarter view in a facing: threeQuarter.L as the crop draws it, or threeQuarter.R, its mirror lit from the top left (views/facing.ts). */
export function threeQuarter(facingSide: Side = "L"): Drawn[] {
  const F = facing(facingSide);
  const backPaintF = backPaint(F), backLinesF = backLines(F), headPaintF = headPaint(F);
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
    light: F.light,
  };
  // Round the hook and over each lobe its own line, breaking at the notches (parts/lines.ts); round the foot, where
  // the tan root reaches the edge, on the tan.
  const tailLines = withDefaults({ taper: 1.4 }, [{ from: [14.2, -34.6], to: [24.2, -56.6] }, { from: [24.2, -56.6], to: [31.6, -58.4] },
    { from: [31.6, -58.4], to: [37.6, -55.6] }, { from: [37.6, -55.6], to: [42.9, -47.6] }, { from: [42.9, -47.6], to: [41.8, -24] },
    { from: [41.8, -24], to: [30.4, -12.6] }, { from: [30.4, -12.6], to: [13.6, -10.8], on: "tan" }]);
  add("tail", litPart("tail", tail, tailPaint, tailLines));
  // The tail's tan root painted as a flame of brush strokes, as the sheet paints it (parts/marking.ts): darkest at the
  // root, a few darker strands and lighter streaks of cream radiating up and out along the plume's fur from the root,
  // its edge soft and fading up into the cream.
  add("tail.base", join(litMarking("tail.base", { shape: tail, paint: tailPaint, spans: tailLines }, tailBase, { fill: C.marking, blur: 0.8, fade: { from: [19.5, -22], to: [22.5, -41] } }),
    strands("tail.base", tailBase, 0.8, [[[13.4, -14.4], [16.6, -22], [18.4, -30]], [[15.6, -13.2], [20.4, -19.4], [24, -26.4]], [[17.4, -12.6], [23, -16.4], [27.4, -21]]],
      { colour: C.earLow, opacity: 0.4, width: 0.85 }),
    strands("tail.base", tailBase, 0.8, [[[15.4, -16.4], [18.6, -24.4], [20.4, -33]], [[18.2, -15], [22.6, -21.4], [25.6, -28.6]]],
      { colour: C.fur, opacity: 0.4, width: 0.9 })));
  add("body.back", litPart("body.back", back, backPaintF, backLinesF));
  add("back.patch.L", litMarking("back.patch.L", { shape: back, paint: backPaintF, spans: backLinesF }, saddleL, { fill: C.marking, blur: 0.8 }));
  // The rump's spot is the left side's only (model.json's marking map): threeQuarter.R shows none.
  if (F.shows("rump.patch.L")) add("rump.patch.L", litMarking("rump.patch.L", { shape: back, paint: backPaintF, spans: backLinesF }, rumpL, { fill: C.marking, blur: 1 }));
  add("hind.L", roomy(litPart("hind.L", hind, {
    fill: C.fur,
    shade: furShade(hipGroup, [], ["M-34 -24 L-4 -24 L-4 -9 L-34 -9Z"]),
    // Two toe lines rising from the sole's scallops a third of the way up the turned paw's front (parts/paw.ts).
    ...toes({ lines: [[[-16.2, -2.2], [-16.8, -4.4], [-16.9, -6.6], [-16.4, -8.4]], [[-22.7, -3.4], [-23.4, -5.4], [-23.5, -7.4], [-23, -9.2]]], fade: [-2.6, -9.4] }),
    // Its back end runs on into the haunch, where the sheet's line along the ground carries on unbroken.
    feather: { from: [-5.8, -8], to: [-10, -8] },
    light: F.light,
    // Its line, a bun closed where it shows: from where its sole meets the haunch's line along the ground, round its toe
    // end and over its whole crown, fading only where its back end runs on into the haunch, as the sheet draws it.
  }, [{ from: [-9.4, -1.9], to: [-9.6, -15.4], taper: [5, 6] }]), 6));
  // The far front leg: the fur most of the way to its own warm shade (palette.ts, farFur), 6.2% darker than the
  // near leg; from where it comes out from under the chest it eases in from the fur over 11 pt, so the two join
  // with no edge. The sheet keeps it light: no rim of shade down its front, only a soft shade down its inner side
  // in the slot beside the near leg, under the chest's lower edge. Its line comes in light from under the chest
  // down its front and deepens to the paws' line round the paw.
  const farTop = uid("fartop");
  add("front.R", litPart("front.R", legR, {
    fill: C.farFur,
    shade: { multiply: C.furShadeBy, shapes: ["M-67 -34 C-63 -30 -59 -26 -57 -20 L-54 -3 L-60 -3 C-61 -11 -62.4 -19 -66 -26 L-70 -33Z"], blur: 1.8 },
    ...((): Pick<Paint, "under" | "inner"> => {
      // Two toe lines rising from the sole's scallops a third of the way up its round front (parts/paw.ts), with the
      // gradient that eases the far leg in from the fur.
      const t = toes({ lines: [[[-72.6, -4.2], [-73.2, -6.2], [-73.2, -8.2], [-72.6, -9.8]], [[-78.6, -5.6], [-79.4, -7.4], [-79.4, -9.4], [-78.8, -11]]], fade: [-4.4, -11.4] });
      return { under: `<defs><linearGradient id="${farTop}" gradientUnits="userSpaceOnUse" x1="0" y1="-33.4" x2="0" y2="-22">` +
        `<stop offset="0" stop-color="${C.fur}"/><stop offset="1" stop-color="${C.fur}" stop-opacity="0"/></linearGradient></defs>` +
        `<rect x="-86" y="-48" width="34" height="26" fill="url(#${farTop})"/>` + t.under, inner: t.inner };
    })(),
    light: F.light,
  }, [{ from: [-59.2, -5.2], to: [-77.6, -45], taper: [5, 8] }]));
  add("body.front", roomy(litPart("body.front", chest, {
    fill: C.fur,
    // Down the chest's far side, away from the light; the jaw's shadow on it is shadow.chin's, which turns with the head.
    shade: furShade(bodyGroup),
    under: between(),
    // A few soft fur strokes down the chest's far side under the collar's end, as the sheet draws them.
    // Over the slot between the legs, where the chest's fur lies on the far leg, a few short tapered fur strokes part the
    // legs, as the sheet draws them, instead of one long crease.
    inner: [[[-72, -47.4], [-72.8, -43], [-72.4, -38.6]], [[-67.6, -45.6], [-68.6, -41.6], [-69.2, -37.8]], [[-59.8, -27.6], [-59, -25.8], [-58.8, -24.2]]]
      .map((pts) => ({ pts: sample(smooth(pts as P[], { closed: false }).segs, 6, false), width: 0.7, colour: C.crownLine, opacity: 0.4 }))
      .concat([[[-70.2, -34.2], [-67.6, -31.6], [-65.4, -29.4]], [[-64.6, -29.6], [-61.8, -26.8], [-59.6, -24.6]], [[-58.8, -24.8], [-57, -22.4], [-55.8, -20.4]]]
        .map((pts) => ({ pts: sample(smooth(pts as P[], { closed: false }).segs, 6, false), width: 0.8, colour: LINES.cream[3]!, opacity: 0.8 }))),
    // The chest's front edge, the silhouette from the collar down to the far leg (the sheet's #B89778); and its lower
    // edge's long diagonal from under the tag to the slot between the legs, coming in faint as fur and deepening
    // where it meets the slot.
    light: F.light,
  }, [{ from: [-77.2, -37.6], to: [-73.4, -57.6], taper: 4 }]), 1));
  // The jaw's shadow on the chest, cast by the head (spec L396): a soft band under the jaw's edge, about 3 pt deep,
  // falling on the chest beside the collar's ends (the collar hides the middle of it).
  const jawShade: P[] = [[-14, -68], [-26, -63.2], [-43, -59.6], [-62, -61.6], [-74, -64.2], [-82, -69], [-80, -64.4], [-72, -59.2], [-62, -56.4],
    [-43, -54.6], [-26, -58.2], [-15, -63.4]];
  add("shadow.chin", soft(pathD(smooth(jawShade, { corners: [0, 5] }).segs), [-83, -70, 70, 16], C.furShade, 1.3));
  add("collar", part("collar", collar, {
    fill: C.collar,
    // Its lower part in shade, turning under toward the chest, and a lighter band along its top where it faces the
    // light, under the chin's fur, as the sheet paints it.
    shade: { multiply: C.shadeBy, shapes: ["M-76 -56.4 C-60 -51 -40 -50 -18 -59 L-18 -46 L-76 -46Z"], blur: 0.9 },
    highlight: { d: "M-71 -60.2 C-58 -59.4 -42 -58.4 -24 -62.6 L-24 -60.4 C-42 -56.6 -58 -57.4 -71 -58Z", colour: C.collarHighlight, opacity: 0.45, blur: 0.8 },
    // The keeper the tag's ring hangs from, a lighter loop across the band, and the jaw's contact on the collar.
    under: `<rect x="${fmt(TAG_X - 2.6)}" y="-61" width="4.4" height="9.4" rx="1.2" fill="${C.collarHighlight}" opacity="0.4"/>` + collarContact(),
    outline: { colour: C.collarRim, width: THIN, taper: 3, blur: 0.2, spans: [{ from: [-22.8, -59.2], to: [-72.6, -58.4] }] },
    light: F.light,
  }));
  add("tag", tagPiece(F));
  for (const side of ["R", "L"] as const) {
    add(`ear.${side}`, litPart(`ear.${side}`, ears[side], earPaint(side, F), earSpans(side)));
    add(`shadow.head.${side}`, headShadow(side));
  }
  add("head.base", part("head.base", head, headPaintF));
  add("head.patch.L", marking("head.patch.L", { shape: head, paint: headPaintF }, patchL, { fill: C.patch, blur: 0.55, clip: false, fade: { from: [-43, -106], to: [-47, -103.4] } }));
  add("head.patch.R", marking("head.patch.R", { shape: head, paint: headPaintF }, patchR, { fill: C.patch, blur: 0.6, clip: false, fade: { from: [-74, -114], to: [-69.8, -112.6] } }));
  add("blush.L", blush());
  add("eye.L", eye(EYES.L), "open");
  add("eye.R", eye(EYES.R), "open");
  add("brow.L", brow(BROWS.L.pts, BROWS.L.width));
  add("brow.R", brow(BROWS.R.pts, BROWS.R.width));
  add("nose", nose());
  add("mouth", mouth(), "open");
  add("head.line", headLinePiece(F));
  add("tuft", topknot(CURLS, { fill: C.fur, highlight: { d: headLight(F), colour: C.light, opacity: 0.4, blur: 4 }, feather: { from: [-38, -146.2], to: [-38, -149.8] }, light: F.light }));
  // The near leg's line: up its back edge from the paw's heel it fades out before the thigh, as the sheet's does,
  // so the leg is no column; round the paw it is the paws' grey-brown line; up its front from the wrist it lightens
  // and fades out where the leg leaves the chest. Inside its back edge, the leg's own shade where it turns away
  // against the thigh.
  add("front.L", litPart("front.L", legL, {
    fill: C.fur,
    shade: furShade(bodyGroup, [], ["M-70 -70 L-20 -70 L-20 -36 L-70 -36Z", "M-34 -40 L-18 -40 L-18 -16 L-34 -16Z"]),
    // Two toe lines rising from the sole's scallops a third of the way up the turned paw's front (parts/paw.ts), and the
    // soft crease where the bun of the paw meets the leg, from the wrist back over its top, as the sheet draws it.
    ...((): Pick<Paint, "under" | "inner"> => {
      const t = toes({ lines: [[[-46.8, -2.1], [-47.4, -4.2], [-47.4, -6.4], [-46.8, -8.2]], [[-54.4, -3.2], [-55.1, -5.2], [-55.1, -7.4], [-54.4, -9]]], fade: [-2.4, -9.4] });
      const crease = { pts: sample(smooth([[-54.6, -15.2], [-51, -16.2], [-46, -16], [-41.4, -14.6]], { closed: false }).segs, 6, false), width: 0.8, colour: C.warmLine, opacity: 0.45 };
      return { under: t.under, inner: [...t.inner!, crease] };
    })(),
    feather: { from: [-40, -46], to: [-40, -38] },
    light: F.light,
  }, [{ from: [-25.2, -16], to: [-50.9, -27.6], taper: [9, 8] }]));
  return F.finish(out);
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

// The face states (spec L440-498; DECISIONS 170 to 176, 179, 181 to 185): every state the front draws, seen from this
// view, each from this view's own rest drawing where its rest feature sits, in the front's shape language
// foreshortened: the eye states by the dog's one eye recipe on each eye's own spec (parts/eye.ts), the far eye's
// narrower as its open eye is; the mouths the front's own shapes carried onto this muzzle (parts/turned.ts); the brows
// this view's dabs moved as the front's are. The motion sheet's turned heads settle what they show: Soft landing the
// happy crescents on a turned head, Curious lean the closed smile. threeQuarter.R is each drawn again in its facing
// (views/facing.ts).

/**
 * This view's muzzle, the front's face frame carried onto it (parts/turned.ts): the front's lip centre lands where this
 * view's rest philtrum meets its lip; across runs along the line through the rest mouth's corners (7.5°, the far curl
 * at (−77.6, −87.4), the near one at (−54.8, −84.4)), the far half shortened to 0.64 and the near one drawn 1.14 times
 * the front's, as the rest mouth's corners lie from its philtrum (8.2 and 14.6 pt, the front's 12.9); down leans 3°
 * toward the near side, so the front's open foot lands on the rest mouth's (−68.6, −71).
 */
const muzzle = (light: P, k: [number, number] = [0.64, 1.14]): TurnedFrame => foreshortened({ origin: [-69.4, -85.8], acrossDeg: 7.5, downDeg: -3, k, light });
/**
 * The o and the yawn are shortened half as much (0.82 and 1.07): a small round opening on the muzzle's front faces the
 * person more than the lip's corners, which wrap round the muzzle's sides; shortened as the lip is, the o's soft point
 * read as a thin red seed.
 */
const ROUND: [number, number] = [0.82, 1.07];
/** Where this view's rest philtrum leaves the nose's foot. */
const NOSE_FOOT: P = [-67, -88.4];

/** How much smaller the far eye is than the near one, across (its open eye's 6.6 pt half-width against 9.5). */
const FAR = EYES.R.rx / EYES.L.rx;
/**
 * Each eye's crescents and lids lean (degrees, clockwise): 2.5° outward from the muzzle's level (7.5°), the near eye's
 * toward the viewer's right and the far eye's toward the left, so both lie as the front's pair do, a touch lower at
 * their outer ends, as Soft landing lays its crescents along the turned face. Laid along one lean, the far lid ran down
 * toward the nose on screen, and beside the near one's outward droop the pair read as a skeptical squint.
 */
const LID_TILT = { L: 10, R: 5 };

/**
 * An eye state on this view's eye (`side` L the near eye, R the far one), from its open eye (EYES): the closed states are
 * the front's lash bands (DECISIONS 130), placed from the open eye's centre as the front places its own (the crescent
 * 2.35 pt lower and 1.9 pt further out, the closed lid 2 pt lower and 1.6 out, the wink at the open eye's height), out
 * shortened on the far eye, and as wide as each eye: the near band the front's 17.6 pt, the far one shortened with its
 * eye; the half-lid, the wide eye and the peek the open eye's own spec changed as the front changes its own.
 */
function lidOf(state: LidState, side: "L" | "R"): TurnedEyeLid {
  const spec = EYES[side], near = side === "L", k = near ? 1 : FAR, out = near ? 1 : -FAR;
  const band = (o: number, down: number, b: Omit<LidBand, "centre" | "tilt" | "noseward">): TurnedEyeLid =>
    ({ band: { centre: [spec.centre[0] + out * o, spec.centre[1] + down], tilt: LID_TILT[side], noseward: spec.noseward, ...b } });
  switch (state) {
    case "happy":
      return band(1.9, 2.35, { width: 17.6 * k, rise: near ? 4.4 : 3.8, drop: near ? 1 : 0.8, thickness: near ? 3.3 : 3, ends: near ? [1.5, 0.8] : [1.3, 0.7],
        flick: { length: near ? 1.4 : 1.1, hook: -10 } });
    case "closed":
      return band(1.6, 2, { width: 17 * k, rise: near ? -3 : -2.6, drop: 0, thickness: near ? 3 : 2.7, ends: near ? [1.3, 0.8] : [1.2, 0.7],
        flick: { length: near ? 1.3 : 1, hook: -30 } });
    case "wink":
      return band(0.5, 0.6, { width: 17.6 * k, rise: near ? 4 : 3.5, drop: near ? -1.4 : -1.1, thickness: near ? 3.3 : 3, ends: near ? [1.5, 0.8] : [1.3, 0.7],
        flick: { length: near ? 1.8 : 1.4, hook: -75 } });
    // The upper lid closed over about two fifths of the eye, as the front's: its middle 1.4 pt above the middle of an
    // eye 9.2 pt tall, its ends 3.2 pt above it where they meet the ball's sides, each eye's grown with its height; a
    // pale lid over the ball above it, the lash running past the ball at its outer corner only, the catchlight just
    // under the lash (Q28's default; parts/turned.ts).
    case "sleepy": {
      const s = spec.ry / 9.2;
      return { spec, lid: { level: -3.2 * s, bow: 1.8 * s, tilt: LID_TILT[side], lash: near ? 1.9 : 1.6, overhang: near ? 0.5 : 0.4, shine: { at: near ? [2.7, -0.4] : [1.8, -0.4], r: near ? 1.4 : 1.1 } } };
    }
  }
}

function eyeState(state: (typeof EYE_STATES)[number], side: "L" | "R"): Piece {
  const spec = EYES[side], near = side === "L";
  switch (state) {
    case "happy":
    case "closed":
    case "wink":
    case "sleepy":
      return drawLid(lidOf(state, side));
    // Surprised round: 7% larger and a point higher, a little toward the nose, the white broader, the catchlight bigger.
    case "wide":
      return eye({ ...spec, centre: [spec.centre[0] + spec.noseward * 0.4, spec.centre[1] - 0.9], rx: spec.rx * 1.07, ry: spec.ry * 1.07,
        white: { at: spec.white.at, width: spec.white.width * 1.35, span: spec.white.span + 8, fade: 0.5 },
        shine: { at: [spec.shine.at[0] * 1.07, spec.shine.at[1] * 1.15], r: spec.shine.r * 1.15 }, glow: near ? { band: 6, warm: 2 } : { band: 5.4, warm: 2.4 } });
    // Side glance: the iris toward the viewer's right, back toward the person, as the front's looks; the white a broad
    // crescent on the side away from the look (the near eye's nose side, the far eye's outer side), the catchlight on the iris.
    case "peek":
      return eye({ ...spec, white: { at: near ? 186 : -6, width: near ? 4.6 : 3.4, span: 58, fade: 0.3 }, shine: { at: [near ? -2.4 : 2.2, near ? 5 : 4.2], r: spec.shine.r } });
  }
}

// The one perked ear, as One ear perked draws it (DECISIONS 133, 176): a bean flipped up over the crown from its root,
// standing above it and running out and a little down to a round free end past the head's side, its inside showing in a
// darker wedge behind the fold at the root, painted by the ear recipe with its locks running out to the free end. Seen
// from this view each ear flips out to its own side: the near ear up behind the crown's near corner and out over the
// back of the head (to the viewer's right), the far ear up behind the topknot's far curl and out past the far cheek.
// The ears draw behind the head in every state, so the crown and the topknot hide each root.

/** The near ear flipped up: from its root under the crown's near corner, up behind the near curl, out to its free end over the back of the head. */
const perkedNear = smooth([[-19, -147], [-19.4, -155], [-16.6, -162.4], [-11.6, -168.6], [-5, -172.6], [2.6, -173.6], [10.2, -171.6], [16.8, -167], [22, -160.6],
  [25.8, -153.2], [27.6, -146], [26.8, -139.6], [23.8, -135.8], [19, -135.2], [14.4, -137.4], [10, -140.8], [5, -143.2], [0.6, -144.6], [-4, -145.2], [-10, -145.6],
  [-15.4, -146]]);
/** The far ear flipped up: from its root under the crown's far side, up behind the far curl, out past the far cheek. */
const perkedFar = smooth([[-58, -150], [-61, -158], [-66.4, -164.6], [-73.8, -169], [-82.2, -170.8], [-90.4, -169.4], [-97.8, -165.4], [-104, -159.6], [-108.6, -152.6],
  [-110.4, -145.6], [-108.8, -140], [-104.8, -137.4], [-99.8, -138.4], [-94.6, -141.4], [-88.6, -143.8], [-82, -145.4], [-75, -146.6], [-66, -148.4]]);

/**
 * With the near ear up, the back of the head and the nape it hung over show: the head's round runs on from under the
 * crown's overhang (3.6, −136.8) round the back of the skull, widest (x 11) a little above the eyes' height, and in
 * under it, where the skull meets the neck (x 2.4 at y −89), then down the neck to the back's line at (−6.6, −53), where
 * the back runs on down; the neck's fur hangs over the collar's near end in a few soft locks. As One ear perked paints
 * the head under its raised ear, the skull there is the patch's tan, deepest at the ear's root and paling down into the
 * cream of the neck, which lies in the skull's shade just under it. Its inner side lies under the head.
 */
let nape = smooth([[-12, -146], [2, -142.6], [6.6, -138], [9.8, -130.4], [11.4, -121], [11.2, -111], [9.2, -101.4], [5.8, -94], [2.4, -89.4], [1.2, -83],
  [0, -74], [-2.2, -65], [-4.6, -57.4], [-6.6, -53], [-10, -55.6], [-14, -57.6], [-19.6, -60.4], [-24, -66], [-23, -90], [-21, -120], [-18, -138]], { corners: [13] });
nape = furEdge(nape, [-7.4, -53.8], [-19.6, -60.4], [{ len: 0.9, w: 1.4, lean: 0.3 }, { len: 0.6, w: 1, lean: 0.25 }, { len: 1, w: 1.5, lean: 0.35 }], 0.4);

function perkedEar(side: "L" | "R", F: Facing): Piece {
  const near = side === "L", shape = near ? perkedNear : perkedFar;
  const paint = earFur(near ? {
    ear: shape, axis: [[-6, -172], [25, -139]], deepen: [0.35, 1],
    locks: [[[1, -170.4], [9.4, -167.6], [17, -161.6], [22.6, -153.6]], [[-1, -163.4], [7.6, -160.4], [15, -154.4], [21.2, -146.4]],
      [[-2.4, -155.6], [5.6, -152.6], [12.6, -147.6], [18.2, -141.2]], [[3, -149], [8.8, -146.2], [13.4, -142]]],
    dips: [[20.8, -135.6]],
    light: F.lit("M-14 -166 C-8 -171.6 2 -173.4 11 -171 C5 -169.4 -2 -168 -9 -163.4Z", middle(shape)),
    under: ["M-20 -150 C-12 -147.4 -4 -146.6 4 -143.6 L4 -138 L-20 -140Z"],
    fold: { line: [[-9.6, -167.4], [-7, -161.6], [-4.4, -155.6], [-2, -149.4]], back: "M-9.6 -167.4 L-7 -161.6 L-4.4 -155.6 L-2 -149.4 L-16 -147 L-17 -160Z" },
  } : {
    ear: shape, axis: [[-74, -169], [-106, -139]], deepen: [0.3, 1.05],
    locks: [[[-82, -169], [-91.6, -166.4], [-100, -160.4], [-106, -152.4]], [[-79, -162.6], [-88.4, -159.6], [-96.6, -153.6], [-103, -145.6]],
      [[-77.4, -155.4], [-86.2, -152.4], [-94, -147.4], [-99.6, -141.4]], [[-82.6, -148.6], [-89.2, -146.4], [-94, -143]]],
    dips: [[-102.4, -137.6]],
    light: F.lit("M-64 -163 C-70 -168.6 -80 -170.8 -90 -169 C-84 -167.4 -76 -165.8 -68 -160.6Z", middle(shape)),
    under: ["M-56 -150 C-64 -148.4 -72 -147.4 -80 -146 L-80 -140 L-56 -142Z"],
    fold: { line: [[-66.6, -164.6], [-68, -158.6], [-69.6, -152.6]], back: "M-66.6 -164.6 L-68 -158.6 L-69.6 -152.6 L-58 -150 L-60 -160Z" },
  });
  // Its line from beside the root over its top and round the free end back under it, on the tan, breaking at the dip.
  const spans: LitSpan[] = near
    ? [{ from: [-19.2, -153], to: [20.8, -135.4], on: "tan", taper: [3, 2] }, { from: [20.8, -135.4], to: [1.2, -144.4], on: "tan", taper: [2, 5] }]
    : [{ from: [-60.6, -156], to: [-103.2, -137.6], on: "tan", taper: [3, 2] }, { from: [-103.2, -137.6], to: [-80, -145.8], on: "tan", taper: [2, 5] }];
  const flap = litPart(`ear.${side}`, shape, { ...paint, light: F.light }, spans);
  if (!near) return flap;
  const tan = uid("tan"), band = uid("band"), neck = uid("neck"), fade = uid("blur"), under = uid("blur");
  const back = litPart("ear.L nape", nape, {
    fill: C.fur,
    // The skull's tan, from the ear's root under the crown's overhang, deepest there, over the back of the skull and
    // paling out into the cream above the neck; the near hood's band up the face's side (38), which ran on under the
    // hanging ear, so the face's line there lies on the tan, as it did on the ear; and the skull's shade on the neck
    // just under it, which turns the head's round in where it meets the neck.
    under: `<defs><linearGradient id="${tan}" gradientUnits="userSpaceOnUse" x1="-2" y1="-144" x2="2" y2="-94">` +
      `<stop offset="0" stop-color="${C.earDeep}" stop-opacity="0.8"/><stop offset="0.22" stop-color="${C.patch}" stop-opacity="0.9"/>` +
      `<stop offset="0.62" stop-color="${C.patch}" stop-opacity="0.75"/><stop offset="1" stop-color="${C.patch}" stop-opacity="0"/></linearGradient>` +
      `<linearGradient id="${band}" gradientUnits="userSpaceOnUse" x1="-9" y1="0" x2="3" y2="0">` +
      `<stop offset="0" stop-color="${C.patch}"/><stop offset="1" stop-color="${C.patch}" stop-opacity="0"/></linearGradient>` +
      `<linearGradient id="${neck}" gradientUnits="userSpaceOnUse" x1="0" y1="-96" x2="0" y2="-60">` +
      `<stop offset="0" stop-color="${C.furShade}" stop-opacity="0.95"/><stop offset="1" stop-color="${C.furShade}" stop-opacity="0.35"/></linearGradient>` +
      `${blur(fade, [-30, -150, 46, 76], 2)}${blur(under, [-30, -104, 46, 60], 2.4)}</defs>` +
      `<g filter="url(#${fade})"><path d="M-24 -148 L14 -148 L14 -104 C10 -98 4 -95 -4 -95 C-12 -95 -18 -97 -24 -100Z" fill="url(#${tan})"/></g>` +
      `<path d="M-24 -132 L-2 -132 C-2 -118 -4 -104 -7 -94 C-9 -88 -12 -84 -16 -82 L-24 -82Z" fill="url(#${band})" filter="url(#${fade})"/>` +
      `<path d="M-24 -96 C-12 -93 0 -93.4 12 -97 L12 -50 L-24 -50Z" fill="url(#${neck})" filter="url(#${under})"/>`,
    shade: furShade([nape]),
    light: F.light,
  }, [{ from: [5.6, -137], to: [-5, -59], taper: [6, 8] }]);
  // Its canvas grown to hold its rim of shade's whole reach (front.ts's roomy rule).
  return join(roomy(back, 2), flap);
}

/**
 * Proud's stars beside the head on the dog's right (DECISIONS 138), here the far side: the larger out past the far ear's
 * top and the smaller above it, clear of the ear in every state, as the front puts them from its head.
 */
const STARS: Star[] = [{ at: [-122, -150], size: [11.4, 14.4], turn: 0 }, { at: [-104.6, -164], size: [9.6, 10.4], turn: 0 }];

/** The face states this view draws besides its rest, in a facing: threeQuarter.L's, or threeQuarter.R's drawn again in it. */
export function threeQuarterFaces(facingSide: Side = "L"): Drawn[] {
  const F = facing(facingSide);
  const out: Drawn[] = [];
  for (const side of ["L", "R"] as const) for (const state of EYE_STATES) out.push({ part: `eye.${side}`, state, piece: eyeState(state, side) });
  for (const state of TURNED_MOUTHS) {
    out.push({ part: "mouth", state, piece: turnedMouth(state, muzzle(F.light, state === "o" || state === "yawn" ? ROUND : undefined), NOSE_FOOT).piece });
  }
  for (const state of ["raised", "happy"] as const) {
    for (const side of ["L", "R"] as const) out.push({ part: `brow.${side}`, state, piece: brow(browState(BROWS[side].pts, state), BROWS[side].width) });
  }
  for (const side of ["L", "R"] as const) out.push({ part: `ear.${side}`, state: "onePerked", piece: perkedEar(side, F) });
  // The head's line beside the near ear perked: the state names the dog's side (the front's), so .R's near ear is its right.
  out.push({ part: "head.line", state: facingSide === "L" ? "templeL" : "templeR", piece: headLinePiece(F, true) });
  return F.finish(out);
}

/**
 * The face states drawn and tested but held out of the package for now, in a facing: the sparkle's stars. The rig holds
 * the stars to the front (faces.test.ts holds that no turned view draws them, and the turned views' order tests hold
 * their draw orders), so the review build of the turned faces' evidence adds them (qa/phase3/faces/turned/render.ts;
 * DECISIONS 183).
 */
export function threeQuarterHeld(facingSide: Side = "L"): Drawn[] {
  const F = facing(facingSide);
  return F.finish([{ part: "stars", state: "sparkle", piece: turnedStars(STARS, F.light) }]);
}

/** What the face states are drawn from, for the R3 guards (characters/dog/test/faces.turned.test.ts). */
export const threeQuarterFace = {
  muzzle: (light: P, state: TurnedMouthState | "open") => muzzle(light, state === "o" || state === "yawn" ? ROUND : undefined),
  nose: NOSE_FOOT,
  rest: { lip: REST_LIP, lipCentre: [-69.4, -85.8] as P },
  brows: (state: BrowState) => ({ L: browState(BROWS.L.pts, state), R: browState(BROWS.R.pts, state) }),
  eyes: EYES,
  /** The lid each closing eye state draws, on each eye (the R3 guard reads its lean). */
  lids: lidOf,
  perked: { L: perkedNear, R: perkedFar },
  /** The muzzle's level, the line through the rest mouth's corners (7.5°): the R3 guards' level frame here (DECISIONS 179). */
  levelDeg: 7.5,
};
