// The dog's three-quarter view facing the sheet's left (threeQuarter.L, DECISIONS 1): the dog has turned to its
// right, so its left side is near. Shapes first, every node typed by hand in model space (points, the ground under
// the seat at 0, 0, y down) at the extremes and inflections read off the three-quarter turnaround, then paint. The
// paint is the front view's (front.ts): the same recipes for the ears, eyes, nose, mouth, collar, tag and paws,
// each part's nodes typed again from this view's own crop. Light comes from the top left, as in every view.
// threeQuarter.R is this view mirrored (views/facing.ts): threeQuarter() takes the facing.
import { CLUMPS, furEdge, furSpan, STEP, TUFTS, type Lock } from "../../../draw/fur.ts";
import { bbox, ellipse, fracAt, pathD, rotate, sample, smooth, spanPoints, v, type Node, type P, type Shape } from "../../../draw/geom.ts";
import { innerLine, strokeOf, type DrawnLine, type Stroke } from "../../../draw/line.ts";
import { LIMITS, lineGate } from "../../../draw/lint.ts";
import { HEAD_FUR, headFur } from "../parts/headfur.ts";
import { groundShadow } from "../parts/shadow.ts";
import { LIGHT, marking, part, soft, type Paint } from "../../../draw/paint.ts";
import { blur, join, pad, piece, uid, type Box, type Piece } from "../../../draw/svg.ts";
import { model } from "../model.ts";
import { C, LINES } from "../palette.ts";
import type { BrowState } from "../parts/brow.ts";
import { chevron, eye, riding, type Chevron, type EyeSpec, type LidBand } from "../parts/eye.ts";
import type { Star } from "../parts/stars.ts";
import { browState, drawLid, foreshortened, TURNED_MOUTHS, turnedMouth, turnedStars, type LidState, type TurnedEyeLid, type TurnedFrame, type TurnedMouthState } from "../parts/turned.ts";
import { litEdge, litMarking, litPart, withDefaults, type LitSpan } from "../parts/lines.ts";
import { curlShapes, topknot, type Curl } from "../parts/topknot.ts";
import { earEdge, earFur } from "../parts/ear.ts";
import { bun, lobed, toes } from "../parts/paw.ts";
import { tagPaint } from "../parts/tag.ts";
import { brush, strands } from "../parts/marking.ts";
import { PUFF as CHEEK_PUFF, turnedCheeks, type TurnedPuff } from "../parts/cheeks.ts";
import { type Drawn } from "./front.ts";

// The eye states this view draws besides its open eye: every state the front draws (DECISIONS 170 to 172, 200 to 207).
const EYE_STATES = ["happy", "squeeze", "closed", "sleepy", "wink", "wide", "peek", "sparkle", "eager", "flat", "peekBack"] as const;
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
// Its underside stays on the ground until it is under the hind paw's first toe (x -12.2), so no background shows
// between the haunch and the paw's heel as it rounds up, then runs in under the paw's sole (y -3.4 under it), so the
// paw's own line is the one along the ground there, taking up the haunch's where the two meet (HIND_SOLE).
const back = smooth([[-36, -63], [-25, -66.5], [-17, -62], [-10, -55.3], [0.2, -48.5], [8.7, -40.9], [12.6, -34.4], [14.7, -26], [14.7, -17.5],
  [12, -10.2], [7.8, -5.9], [1.5, -1.8], [-6, -1.6], [-12.2, -2.6], [-17, -3.4], [-23.4, -3.6], [-27.8, -4.2], [-31.4, -5.6], [-35, -20], [-36, -42]]);

// The paws, by the dog's one paw recipe (parts/paw.ts bun, DECISIONS 216, 230): each a round bun 10 to 20% wider than
// its leg's column, its sole three toe lobes scalloping up a little at each toe line, two soft toe lines rising from the
// notches round the middle toe, as the stubby-paws panel and this crop draw them.
// The near front leg: short and plump, coming down out of the chest in front of the haunch, its back edge sloping down
// from the shoulder over the hind paw's toe to the heel (x -23.4 at y -23, -30.4 at -7.4), as the crop draws its line
// there (the slot's warm tan between it and the hind paw's top), its front edge from the chest's V down to the wrist
// (y -16.2), where the paw bulges forward 4.4 pt past the leg to its toe end. Turned so, the leg's back edge runs into
// the heel and the paw is no wider than the leg at the wrist, so bun()'s 10 to 20% (the front-on stubby-paws panel)
// does not hold for it (DECISIONS 230): its paw is typed by hand from the crop as the recipe's bun would draw it, its
// sole three toe lobes (declared, lobed()) scalloping up 0.55 pt at each toe line (x -46.6 and -53.2, the crop's toe
// lines), its toe lines the recipe's, rising 45% of the paw round the middle toe. Its top melts into the chest.
const NEAR_TOES: P[][] = [[[-46.6, -2.25], [-46, -4.6], [-46.15, -6.7], [-46.9, -8.3]], [[-53.2, -2.25], [-53.8, -4.6], [-53.65, -6.7], [-52.9, -8.3]]];
const legLNodes: Node[] = [[-50, -47], [-38, -47.5], [-26, -45], [-21.4, -38], [-21.4, -31], [-23.2, -24.6], [-25.6, -18.2], [-28, -12], [-30.4, -7.4],
  [-32.8, -3.9], [-36.6, -1.9], [-41.6, -1.5], [-46.6, -2.05], [-50, -1.5], [-53.2, -2.05], [-56, -2], [-58.4, -3.9], [-59.4, -7.2], [-58.6, -11.2],
  [-56.8, -14.2], [-55, -16.2], [-54.6, -22], [-53.4, -29], [-51.2, -38]];
const legL = lobed(smooth(legLNodes, { corners: [12, 14, 20] }), [[[-32.8, -3.9], [-46.6, -2.05]], [[-46.6, -2.05], [-53.2, -2.05]], [[-53.2, -2.05], [-58.4, -3.9]]]);

// The far front leg: behind the chest (spec L369), its outer edge the silhouette from under the chest's corner (y -35)
// down, gently convex, to its wrist (y -19.8), where the bun swells out 5 pt to its toe end; its heel runs on behind
// the near paw. Its inner side shows only in the slot beside the near leg, under the chest's lower edge. Its toe lines
// rise at x -71.1 and -75.3, on the crop's (its toe lines faint at about -70 and -76, its sole line darkening at -72.3);
// the lobe hidden behind the near paw is the broad one, and the outer lobe is kept 5.2 pt wide, so it turns no tighter
// than the toe lobes' 2.5 pt (the lint's lobePt): the crop's darker spot at -78.5 is where the sole turns up into it.
const FAR_BUN = bun({ leg: [[-53.6, -26], [-78.9, -26]], wrist: [[-54, -15.4], [-78.6, -19.8]], bulge: [0.4, 5.2], ground: -3.6, lobes: [0.6, 0.18, 0.22],
  scallop: 0.55, full: 0.42, rise: 0.45 });
/**
 * Its toe lines bow away from the middle toe, as the panel draws them round it: bun() bows each away from the bun's own
 * middle, which here lies behind the near paw, so the nearer one (x -71.1) is turned to bow away from the visible middle
 * toe between the two.
 */
const FAR_TOES = FAR_BUN.toes.map((t, i) => (i === 0 ? t.map(([x, y]): P => [2 * t[0]![0] - x, y]) : t));
const legR = lobed(smooth([[-75.6, -50], [-61, -46], [-56.2, -36], [-53.6, -26], ...FAR_BUN.nodes, [-78.8, -25], [-78.5, -31], [-77.6, -38], [-76.6, -46]],
  { corners: [...FAR_BUN.notches.map((i) => i + 4), 4 + FAR_BUN.nodes.length - 1] }), FAR_BUN.lobes);

// The near hind paw: a round bun tucked in at the haunch's front, its toe end against the near front paw's heel, as the
// sheet draws it: the bun across its sole, and over its top a low arc (y -16.6) from its toe end back to where its back
// end melts into the haunch.
const HIND_BUN = bun({ leg: [[-7.6, -14], [-26.4, -14]], wrist: [[-7.4, -12.2], [-27, -12.4]], bulge: [0.6, 2.2], ground: -1.5, lobes: [0.36, 0.34, 0.3],
  scallop: 0.55, full: 0.5, rise: 0.45 });
const hind = lobed(smooth([...HIND_BUN.nodes, [-24, -15.8], [-19.6, -16.9], [-14.6, -16.7], [-10, -15]], { corners: HIND_BUN.notches }), HIND_BUN.lobes);

// The chest: from under the collar down to the paws, its front edge the silhouette from under the collar's end down to
// its corner on the far leg's outer edge (y -35.4), where the far leg comes out from under it; its lower edge runs level
// across the far leg's top, then down the long diagonal the sheet draws to the slot between the legs (x -55.4 at
// y -20.4), and on under the near paw. Its right side lies on the haunch's cream under the near leg and the collar.
let chest = smooth([[-73, -59.6], [-60, -64], [-40, -64.5], [-24, -64], [-21, -58], [-23, -50], [-26.5, -42], [-29, -32], [-33, -14], [-40, -4],
  [-52, -3.5], [-53.6, -16.6], [-55.4, -20.4], [-58.4, -24], [-61.6, -27.4], [-65.4, -31], [-69.6, -34.3], [-74.6, -36.2], [-77.6, -38.9], [-78.7, -43],
  [-78.1, -47.6], [-75.8, -53.6]]);
// Under the collar's end the chest's front edge steps out once (fur.ts's STEP), as the crop's line steps at y -45 to -50.
// Its lower edge over the far leg is lined only from x -64.6 down into the slot, as the crop's line runs from (-66, -31)
// to the slot, light where it comes out of the fur and deepening into the slot, with short fur strokes branching off it,
// the crop's fluffy V (a row of tufts there read as a saw); from there up to its corner the crop leaves it unlined, the
// chest's cream on the far leg's (DECISIONS 231). Lined from x -67.4 it drew a long dark diagonal the crop does not.
chest = furEdge(chest, [-78.4, -42.8], [-77, -49.6], [{ len: 1, width: 7, lean: -0.4 }], 0.35, undefined, STEP);
/** How deep the chest's lower edge's line may lie: light (0.18) where it comes out over the far leg (x -64.6), 0.45 in the slot (x -55). */
const chestLower = (p: P) => 0.18 + 0.27 * Math.min(1, Math.max(0, (-p[0] - 64.6) / -9.6));

// The collar: the band round the neck from under the chin, where its rounded end shows, along the near side
// to where it passes behind the near ear, as the sheet draws it: deepest (7.5 pt) under the near side of the chin,
// 6 pt toward its rounded end under the chin, then narrowing behind the near cheek to a rounded point tucked under
// the jaw (x -22.6), where the back's line comes out from under it (DECISIONS 231, the crop's near end). Its top lies
// under the head's fur.
const collar = smooth([[-74.2, -61.6], [-60, -63], [-45, -62], [-30, -63.6], [-25, -64.9], [-21.6, -64], [-20.6, -61.6], [-21.4, -58.8], [-24.4, -56.2],
  [-30, -53.6], [-37.6, -50.6], [-45.4, -49.2], [-52.6, -49.8], [-60.6, -51.4], [-67, -52.4], [-71.6, -54.8], [-74.6, -58.4]]);

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
// The far ear's upper edge rises from its outer side as a round shoulder with one fur bump partway up (x -92.6,
// y -138.6), into the head behind the crown's fur, as the sheet draws it, no corner at its top.
// Each ear's outline is typed as a smooth droplet and its edge built on it by the dog's one ear recipe (parts/ear.ts
// earEdge, DECISIONS 215, 229), as the floppy-ears panel and this crop draw it: one lock step part way down the outer
// edge, where the top lobe overlaps the next (the far ear's at y -106 to -113, the near ear's at y -105 to -112, where
// the crop's edge steps out), and a hem of rounded lock tips of uneven size (the far ear's three, from where it comes
// out from under the far cheek, the near ear's four); one line round each, light at the top and deepening to the hem,
// running on under the head at both ends, where the crown's line and the cheek's take it up.
const earRBase = smooth([[-80.8, -144], [-76.6, -143], [-74.4, -139.4], [-76.6, -132], [-86.4, -108], [-94, -84], [-99.8, -78.4], [-105, -79.2], [-110.8, -81.8],
  [-115.8, -86], [-119.4, -91.4], [-120.9, -98], [-120.8, -105.6], [-119.4, -112], [-116.4, -118], [-111.2, -124], [-104, -129.6], [-96, -135],
  [-92.6, -138.4], [-88.4, -141.2], [-84.4, -143.4]]);
const earLBase = smooth([[-5, -140.6], [7.6, -130.4], [12, -125.6], [15, -118.4], [18.8, -111.4], [23.6, -104.4], [27.8, -97], [30.4, -89],
  [30.6, -81], [28.8, -74.6], [24.6, -69.2], [18.4, -64.8], [10.4, -62.2], [2.4, -61], [-4, -61.2], [-9.4, -62.2], [-18.6, -71], [-20.4, -80],
  [-20.2, -95], [-21.8, -114], [-21.4, -125], [-18, -133.4]]);
const EDGES = {
  R: earEdge({
    base: earRBase,
    steps: [{ from: [-120.6, -106.2], to: [-118.6, -113.8], lock: { len: 1.1, width: 7.8, lean: -0.35 }, tipRound: 0.35 }],
    hem: { from: [-104.6, -79.2], to: [-120.4, -94.4], locks: [{ len: 1.7, width: 7.6, lean: 0.25, dip: 0.3 }, { len: 1.2, width: 6.2, lean: 0.3, dip: 0.4 },
      { len: 1.6, width: 7, lean: 0.4 }], tipRound: 0.45 },
    axis: [[-96, -137], [-110, -80]],
    // From where it comes out from under the far cheek's puff, round the hem, up the outer edge and over the top to where
    // the crown's line takes it up, running on under the head at both ends.
    line: { from: [-96.4, -81.4], to: [-79.6, -143.8], ends: ["under", "under"] },
  }),
  L: earEdge({
    base: earLBase,
    steps: [{ from: [18.2, -112.6], to: [23.2, -105], lock: { len: 0.8, width: 9.6, lean: 0.3 }, tipRound: 0.35 }],
    hem: { from: [30.4, -77.4], to: [-8.6, -61.6], locks: [{ len: 1.4, width: 11, lean: 0.2, dip: 0.25 }, { len: 1.75, width: 15, lean: 0.25, dip: 0.35 },
      { len: 1.3, width: 16, lean: 0.3, dip: 0.5 }, { len: 1.1, width: 4.6, lean: 0.35 }], tipRound: 0.45 },
    axis: [[4, -134], [10, -61]],
    // From where the crown's line takes it up under the overhang, down the outer edge, round the hem and up its inner edge
    // to where it goes under the near cheek, running on under the head at both ends.
    line: { from: [1.5, -135.5], to: [-18.2, -70.6], ends: ["under", "under"] },
  }),
};
const ears = { R: EDGES.R.shape, L: EDGES.L.shape };

// The head: the crown under the topknot; on the near side the crown's fur overhangs the near ear's root, and the
// face's side runs down over the ear to the near cheek; the jaw lies along the collar's top from the near cheek
// to the chin, dipping lowest under the near cheek, and rises from the chin up the far side of the jaw to the far
// cheek's puff, which bulges out over the far ear in two round lobes, the upper the larger, a soft notch between them
// (the crop's puff: x -96.8 at y -85, the notch -96 at -89.5, -97.8 at -91, a point left of ours there being the head's
// own offset on the crop); above it the face's far side runs up over the far ear to its root and the crown. The face's
// near side is one smooth S from under the overhang down over the near ear to the jaw, as the crop draws it.
const headNodes: Node[] = [[-68.6, -149.6], [-11.2, -149.6], [-2.4, -144.2], [3.6, -136.8], [1.4, -135.6], [-17.4, -132], [-20.6, -127.6], [-13.6, -115.4],
  [-11.4, -105], [-14.6, -91], [-17.4, -70.2], [-22.4, -63.4], [-48, -58.4], [-73.5, -62.4], [-84.2, -68.6],
  [-95.8, -79.8], [-97.6, -84], [-96.3, -88.9], [-98.2, -92.2], [-96.8, -96.2], [-91.2, -100.6], [-88.8, -121.6], [-79.6, -143.8]];
/**
 * The overhang's tip over the near ear's root; where the face's near side leaves the overhang's underside, a concave
 * corner; and where the far cheek's puff comes out from under the side's line.
 */
const OVERHANG = 3, TEMPLE = 6, PUFF = 20;
const headBase = smooth(headNodes, { corners: [OVERHANG, TEMPLE, PUFF] });

// The head's fur, by the dog's one head-fur builder (parts/headfur.ts, DECISIONS 214, 228), each place typed from this
// crop. Over the far ear's root, where the far side of the face meets the crown, two broad low locks of the crown's cream
// lie over the ear's top, unlined and feathered; the crown's line runs down to where the head's outline crosses the far
// ear's and runs on into the ear's own line. Over the near ear's root the overhang's underside hangs in two broad locks
// combed down toward the face. The chin a rounded mass over the collar, its lower edge six small scallops of uneven
// width (4.2 to 6.6 pt) and height (0.8 to 1.2 pt), the smallest the recipe allows.
// The cheeks are not headFur's: its cheek is a puff of 2 to 4 pointed wisps, as the front crop draws its cheeks, and this
// crop draws neither cheek so (DECISIONS 228, Q30: the fur the sheet draws, nothing more). The far cheek's two lobes are
// the outline's own rounds, and the near cheek is the face's smooth S; each is lined by one span of this view's, and
// each root's unlined stretch is measured and feathered here as the builder measures and feathers its own (rootSpans).
const CROWN_FAR: Lock[] = [{ len: 1.25, width: 3.8, lean: -0.5, dip: 0.4 }, { len: 1.6, width: 4.4, lean: -0.45 }];
const CROWN_NEAR: Lock[] = [{ len: 1.8, width: 6.2, lean: 0.5, dip: 0.45 }, { len: 1.35, width: 5.2, lean: 0.55 }];
const CHIN: Lock[] = [{ len: 0.9, width: 5.2, lean: -0.3, dip: 0.1 }, { len: 1.2, width: 6.6, lean: -0.2, dip: 0 }, { len: 0.95, width: 5.4, lean: -0.05, dip: 0.15 },
  { len: 0.8, width: 4.2, lean: 0.1, dip: 0.05 }, { len: 1.1, width: 6.4, lean: 0.2, dip: 0.1 }, { len: 0.85, width: 4.8, lean: 0.3 }];
const FUR = headFur({
  base: headBase,
  crown: [
    { side: "R", from: [-83.6, -135.4], to: [-80.5, -142.4], locks: CROWN_FAR, tipRound: 0.25, line: { from: [-79.7, -143.6], to: [-62, -150] }, ends: ["join", "under"], ear: ears.R },
    { side: "L", from: [-1.6, -135.2], to: [-12.8, -132.6], locks: CROWN_NEAR, tipRound: 0.25, line: { from: [-15, -149.6], to: [1.5, -135.5] }, ear: ears.L },
  ],
  chin: { from: [-29.8, -61], to: [-66, -61.4], scallops: CHIN, tipRound: 0.25, line: { from: [-18.6, -64.4], to: [-88.4, -72.4], under: 0.15 },
    corners: [[-18.8, -64.2], [-84.2, -68.6]] },
});
// The crown's fur where it overhangs the near ear's root is a lock of fur, its tip a fur span; so is the far cheek's puff,
// its two lobes clumps of the cheek's fur, the notch between them tighter than the 4 pt corner rule as the crop draws it
// (Q29's default, DECISIONS 213).
const head = furSpan(furSpan(FUR.head, [3.2, -137.4], [0.4, -135.5]), [-95.8, -79.8], [-91.2, -100.6]);
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
// whose underside tucks into a notch on the plume's inner edge (x 18.2, y -47.4). From the hook over the top and
// down the far side to its foot the plume is five broad lobes of fur of uneven size (draw/fur.ts CLUMPS, DECISIONS 213,
// 232), each leaning down the plume to where it tucks under the next, as the crop's outer edge bumps; its foot breaks
// into two soft clumps combed back toward the haunch. Its root lies hidden behind the rump.
const tailNodes: Node[] = [[6, -30], [13.2, -33.4], [17.8, -37.6], [19.6, -42.8], [18.2, -47.4], [17, -50], [17.6, -54], [21, -57.6], [26, -59.4],
  [31.2, -57.6], [36, -55.2], [40.2, -50.8], [43, -44.6], [44, -37.4], [43.6, -30], [41.6, -24.4], [37.4, -18.6], [30.4, -13], [21, -11.2], [13.6, -10.8],
  [9, -14.4]];
/** Where each lobe tucks under the next, in path order: the notches, for the short flicks the crop draws running on from them. */
const tailNotches: [P, P][] = [];
const PLUME: Lock[] = [{ len: 1.3, width: 8.4, lean: 0.35, dip: 0.25 }, { len: 1.7, width: 9.8, lean: 0.5, dip: 0.2 }, { len: 1.2, width: 7.8, lean: 0.3, dip: 0.3 },
  { len: 1.6, width: 8.2, lean: 0.45, dip: 0.2 }, { len: 2.05, width: 8.6, lean: 0.55 }];
const FOOT: Lock[] = [{ len: 1.4, width: 8, lean: 0.3, dip: 0.3 }, { len: 1.55, width: 6.2, lean: 0.4 }];
// The hook's tip is fur (the tail tip, L509).
const tail = furEdge(furEdge(furSpan(smooth(tailNodes, { corners: [4] }), [17.6, -48.6], [18.2, -54.6]), [26.4, -59.3], [41.4, -25.6], PLUME, 0.3,
  (_tip, _root, notches) => tailNotches.push(notches), CLUMPS), [29.6, -13.2], [15.6, -10.8], FOOT, 0.3, undefined, CLUMPS);

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

/** The gap's shade beside the near leg's back edge, painted into the back body (thighLayers). */
const GAP = uid("gap"), GAP_BLUR = uid("blur");
/**
 * In the narrow gap between the near front leg's back edge and the hind paw's crown, the flank in a warm shade, as the
 * sheet paints it there (the crop's tan wedge). The shade stays lighter than a marking's tan (L* 86 and up), as it is a
 * shade, not a patch; the sheet's own gap is darker. The thigh's front is the near leg's back edge's own line, one line
 * from the heel up over the flank, as the crop draws it (DECISIONS 230): the separate thigh arc beside it, and the pale
 * strip between them, read as two lines and a seam where the crop draws one.
 */
const gapNodes: P[] = [[-21.8, -30], [-20.6, -24], [-21.6, -18.4], [-24, -13.4], [-26, -9], [-27.6, -7.2], [-28.6, -10.2], [-26.8, -15.4], [-24.8, -20.6],
  [-23.2, -26]];
const thighLayers = `<defs><linearGradient id="${GAP}" gradientUnits="userSpaceOnUse" x1="0" y1="-28" x2="0" y2="-6">` +
  `<stop offset="0" stop-color="${C.earDeep}" stop-opacity="0"/><stop offset="0.45" stop-color="${C.earDeep}" stop-opacity="0.26"/>` +
  `<stop offset="0.8" stop-color="${C.earDeep}" stop-opacity="0.28"/><stop offset="1" stop-color="${C.earDeep}" stop-opacity="0.08"/></linearGradient>` +
  `${blur(GAP_BLUR, [-36, -32, 18, 30], 0.7)}</defs>` +
  `<path d="${pathD(smooth(gapNodes).segs)}" fill="url(#${GAP})" filter="url(#${GAP_BLUR})"/>`;

const backPaint = (F: Facing): Paint => ({
  fill: C.fur,
  // The haunch's rear and its underside, away from the light; and the gap beside the thigh in the fur's shade.
  shade: furShade(hipGroup, [pathD(smooth(gapNodes).segs)], ["M-24 -70 L4 -58 L14 -42 L6 -36 L-20 -50Z"]),
  under: thighLayers,
  light: F.light,
});
/**
 * The back's line (parts/lines.ts), one line from where it comes out from under the jaw beside the collar's near end
 * (DECISIONS 231, the crop's back line starting at the collar's end) down the sloping back, where the saddle's tan
 * reaches it on the tan; round the rump, where the haunch lies over the tail, a contact line (DECISIONS 211), on the
 * tan where the rump's spot meets it (the sheet's #A35F32 there), on the cream in a facing with no rump spot
 * (threeQuarter.R); then along the haunch's underside on the ground, the ground's dark only under its middle (216),
 * running on under the hind paw.
 */
const backLines = (F: Facing): LitSpan[] => [
  { from: [-22.6, -64.8], to: [13.1, -33.8], on: (p) => (p[0] > -18 && p[0] < 9.6 ? "tan" : "cream"), ends: ["under", "join"] },
  { from: [13.1, -33.8], to: [12.7, -11.4], contact: true, on: (p) => (F.shows("rump.patch.L") && p[1] > -34.6 && p[1] < -14 ? "tan" : "cream"), ends: ["join", "join"] },
  { from: [12.7, -11.4], to: HIND_SOLE, ground: "sole", ends: ["join", "under"] },
];

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

/** Where each cheek's line ends by its root: the near one under the overhang, the far one up the face's far side. */
const NEAR_TOP: P = [-19.4, -125.6], FAR_TOP: P = [-84.2, -134.2];
/** Where the near cheek's line starts when the near ear is raised off its temple (head.line's near temple state), below the temple, from open fur. */
const NEAR_RAISED: P = [-11.6, -103.4];
/** Where each crown's line meets its ear's: headFur's, on the crossing of the head's outline and the ear's (DECISIONS 214). */
const FAR_JOIN = FUR.crown[0]!.from as P, NEAR_JOIN = FUR.crown[1]!.to as P;
/** Each root's unlined stretch, in points, with the half point for the outline's sampling (214's measure): from the far cheek's line to the far crown's join, and from the near crown's join to the near cheek's line, in path order. */
const rootBare = (from: P, to: P) => along(head, from, to) + 0.5;
/**
 * The cheeks' lines (DECISIONS 228). The far cheek's: from the chin's line at the far jaw round both lobes of its puff and
 * up the face's far side to its root's unlined stretch, on the far ear's tan where it lies on the ear. The near cheek's:
 * the crop's one S-line from under the overhang down over the near ear to the jaw, on the near ear's tan above y -69, in
 * two spans joined where the near temple state's line begins (NEAR_RAISED), so that state draws the lower span exactly as
 * the rest does. Each end by a root is free, and cites its root's stretch by its measured length (214).
 */
const FAR_CHEEK: LitSpan = { from: [-88.4, -72.4], to: FAR_TOP, on: (p) => (p[1] < -80.5 ? "tan" : "cream"), under: (p) => (p[1] < -98 ? 0.3 : 0.1),
  ends: ["join", "free"], cites: 214, bare: [0, rootBare(FAR_TOP, FAR_JOIN)] };
const nearOn = (p: P) => (p[1] < -69 ? "tan" : "cream"), nearUnder = (p: P) => (p[1] < -69 ? 0.3 : 0.15);
const NEAR_UPPER: LitSpan = { from: NEAR_TOP, to: NEAR_RAISED, on: nearOn, under: nearUnder, ends: ["free", "join"], cites: 214, bare: [rootBare(NEAR_JOIN, NEAR_TOP), 0] };
const NEAR_LOWER: LitSpan = { from: NEAR_RAISED, to: [-18.6, -64.4], on: nearOn, under: nearUnder, ends: ["join", "join"] };
/**
 * Which ear is raised off its temple beside head.line: none at rest; the near one perked (the nape it uncovers lies
 * behind the face's side); or the far one perked, which leaves the far side of the head the silhouette from the crown down
 * to the jaw.
 */
type Temple = "rest" | "near" | "far";

/**
 * head.line's spans, in one order in every state [the far crown's, the near crown's, the near cheek's two, the far
 * cheek's, the chin's], so every span a state does not change is drawn exactly as the rest draws it (the line rule wobbles
 * each span's width by its place in the list).
 * - At rest each root's stretch is unlined and feathered over the ear's tan, as the crop paints it (214).
 * - The near ear perked (176): the near cheek's upper span is left out, shortened to its first step along the outline, and
 *   its lower span starts from open fur at NEAR_RAISED, its stretch up to the near crown's join cited by its length, as
 *   headFur's `raised` starts a cheek's line under a raised ear.
 * - The far ear perked: nothing lies behind the far root any more, so the head's far side is its silhouette from the
 *   crown down to the jaw: the far crown's line runs on down over the root's locks to the far cheek's line and joins it,
 *   and the far cheek's line is the cream's own, since no ear lies under it.
 */
function headSpans(temple: Temple): LitSpan[] {
  const [farCrown, nearCrown] = FUR.crown as [LitSpan, LitSpan], chin = FUR.chin!;
  if (temple === "near") {
    const step = spanPoints(head, fracAt(head, NEAR_TOP), fracAt(head, NEAR_RAISED)).slice(0, 2) as [P, P];
    return [farCrown, nearCrown, { ...NEAR_UPPER, from: step[0], to: step[1] },
      { ...NEAR_LOWER, ends: ["free", "join"], cites: 214, bare: [rootBare(NEAR_JOIN, NEAR_RAISED), 0] }, FAR_CHEEK, chin];
  }
  if (temple === "far") {
    const { cites: _c, bare: _b, ...far } = FAR_CHEEK;
    return [{ ...farCrown, from: FAR_TOP, ends: ["join", "under"] }, nearCrown, NEAR_UPPER, NEAR_LOWER, { ...far, on: "cream", ends: ["join", "join"] }, chin];
  }
  return [farCrown, nearCrown, NEAR_UPPER, NEAR_LOWER, FAR_CHEEK, chin];
}

/**
 * The cream feathered out over each root's unlined stretch, under head.line's lines, as headFur's soften() feathers the
 * stretches it measures (HEAD_FUR.soft: a band 3 pt wide, 0.8 pt out over the tan, σ 0.9, from 3 pt clear of the crown's
 * join to 5 pt past the cheek line's free end); a root whose ear is raised has no tan under it, so it is left out.
 */
function softRoots(temple: Temple, box: Box): { defs: string; body: string } {
  const { width, offset, blur: sd, opacity, past, clear } = HEAD_FUR.soft;
  const total = along(head, [-68.6, -149.6], [-68.6, -149.6]) || 1;
  const at = (p: P) => fracAt(head, p), wrap = (f: number) => ((f % 1) + 1) % 1;
  const bands: [number, number][] = [];
  if (temple !== "far") bands.push([wrap(at(FAR_TOP) - past / total), wrap(at(FAR_JOIN) - clear / total)]);
  if (temple !== "near") bands.push([wrap(at(NEAR_JOIN) + clear / total), wrap(at(NEAR_TOP) + past / total)]);
  const f = uid("blur"), d = bands.map(([a, b]) => strokeOf(spanPoints(head, a, b), width, { taper: 3, tip: 0.4, offset }).d).join("");
  return { defs: blur(f, pad(box, 2), sd), body: `<path d="${d}" fill="${C.fur}" opacity="${opacity}" filter="url(#${f})"/>` };
}

/**
 * head.line: the head's outline as its own unclipped region, drawn after the head's clip group, reaching 0.5 pt past the
 * head, crisp on its outer side (DECISIONS 212): one span per visible edge (headSpans), the crown's lines headFur's
 * running on into each ear's own, and the cream feathered out over each root's unlined stretch under them (softRoots).
 * Its temple states are keyed by the front lane's name for an ear raised alone, by the dog's side (templeL, templeR),
 * which every preset gives only a perked ear: in threeQuarter.L the near ear is the left, so templeL is `near` and
 * templeR `far`, and in threeQuarter.R the other way round; `temples` (both ears raised, the lifted presets) keeps the
 * rest line, since this view draws no lifted ear and the ears hang there still (DECISIONS 176, 234).
 */
function headLinePiece(F: Facing, temple: Temple = "rest"): Piece {
  const [x0, y0, x1, y1] = bbox(head.segs);
  const box = pad([x0, y0, x1 - x0, y1 - y0], 4);
  const r = litEdge(head, headSpans(temple), "head.line", box, { reach: 0.5, crisp: true, light: F.light });
  const soft = softRoots(temple, box);
  return lineGate(piece(`<defs>${r.defs}${soft.defs}</defs>${soft.body}${r.body}`, box, {
    shapes: [{ name: "head.line", nodes: head.typed, segs: head.segs, outlined: r.outlined, fur: head.fur.map(([a, b]) => [fracAt(head, a), fracAt(head, b)]) }],
    lines: r.lines,
  }));
}

/**
 * The open eyes, by the dog's one eye recipe (parts/eye.ts, DECISIONS 73), each shaped as this crop draws it. The
 * near eye a slightly tall oval (the sheet's dark eye runs x −46.5 to −28.4 and y −105.3 to −85.6), its white a
 * crisp crescent down its outer side from about two o'clock round to its foot, widest (1.9 pt) low on the outer
 * side; the far eye narrower and turned 15° toward the nose, its white up its outer side above the level, 1.3 pt at
 * its widest; the large catchlight each where the sheet's sits, high on the nose's side, and the tiny one below it
 * that every view's open eye carries (Q26, DECISIONS 201; the crop draws only the large one).
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
  // Broad and faint, as the sheet's melts into the cheek: wider than the first pass's oval, softer at its edge. Drawn
  // at the blush's reference level, as the front's is (DECISIONS 145, 160): the printed pink blurred, its alpha
  // stretched past the blurred oval's peak (0.89 of its fill at 3x) so the reddest tenth of the cheek is the full pink
  // and match.py's fit reads 1 at alpha 1; the part's rest alpha (rig.json) sets the resting level.
  const [cx, cy] = [-35.4, -78.4], rx = 10, ry = 5, deg = -8, sd = 3, stretch = 1.224;
  const d = pathD(ellipse([cx, cy], rx, ry, deg));
  const f = uid("blush"), box = pad([cx - rx - 0.5, cy - ry - 0.8, 2 * rx + 1, 2 * ry + 1.6], 3 * sd);
  const filter = blur(f, box, sd).replace("</filter>", `<feComponentTransfer><feFuncA type="linear" slope="${stretch}"/></feComponentTransfer></filter>`);
  return piece(`<defs>${filter}</defs><path d="${d}" fill="${C.blush}" filter="url(#${f})"/>`, box);
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
      // Its locks fan with the droop toward the hem, of uneven length, each running out into the hem's nearest tip.
      locks: [[[-108.4, -118.6], [-116, -106], [-119.6, -94]], [[-108.6, -106], [-112.4, -96], [-115, -88]], [[-103, -122], [-106, -104], [-109.6, -84]],
        [[-98.6, -104], [-100.6, -92], [-102.6, -82]], [[-95, -100], [-97.6, -90], [-100.6, -82]]],
      dips: [],
      edge: EDGES.R,
      // On its upper outer side, toward the light; in the other facing across the ear's middle, toward the light there.
      light: F.lit("M-114 -110 C-112 -118 -104 -126 -94 -132 C-90 -130 -92 -122 -98 -116 C-104 -110 -110 -106 -114 -110Z", middle(ears.R)),
      under: [],
    })
    : earFur({
      ear: ears.L, axis: [[5, -134], [8, -60]], deepen: [0.45, 1.12],
      locks: [[[16, -104], [22, -90], [27.4, -76]], [[18, -88], [20.4, -74], [21, -66]], [[5.4, -100], [7.6, -84], [8.4, -64]],
        [[-4.4, -92], [-4.2, -78], [-3.6, -63]], [[-12, -80], [-9.6, -70], [-6, -63]]],
      // Along its outer edge from its top down to its lock step, the fold where the ear turns over, the back layer beyond it.
      fold: { line: [[4.2, -131.6], [10, -124.4], [14.6, -116.4], [18.4, -109.6], [22.6, -103.6]],
        back: "M2 -134 L10.4 -126.8 L16.4 -118 L20.6 -110.8 L25.8 -104.4 L34 -104 L34 -142 L2 -142Z" },
      dips: [],
      edge: EDGES.L,
      // On its outer turn, as the crop paints it; mirrored with the ear in the other facing, where that turn faces the light.
      light: "M0 -130 C6 -128 14 -120 20 -110 C24 -104 22 -98 16 -98 C10 -100 4 -110 0 -118 C-2 -124 -3 -130 0 -130Z",
      under: [],
    })), light: F.light };
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
 * Between the two front legs, as the sheet paints it: a soft warm shade down the slot under the chest's lower edge, no
 * stronger than the fur pass allows a shade there (0.35), its sides soft, since the legs' own lines are the edges
 * (DECISIONS 233; the first pass's deep tan, 0.85 at its foot, read as a stripe).
 */
function between(): string {
  const g = uid("between"), f = uid("blur");
  const v = smooth([[-61, -29.6], [-57.6, -26.6], [-54.6, -23.4], [-53.2, -19], [-53.4, -14], [-55.4, -13.6], [-56.4, -18], [-58, -22.4]]);
  return `<defs><linearGradient id="${g}" gradientUnits="userSpaceOnUse" x1="0" y1="-30" x2="0" y2="-14">` +
    `<stop offset="0" stop-color="${C.marking}" stop-opacity="0"/><stop offset="0.5" stop-color="${C.marking}" stop-opacity="0.2"/>` +
    `<stop offset="1" stop-color="${C.marking}" stop-opacity="0.35"/></linearGradient>` +
    `${blur(f, [-66, -34, 18, 24], 1.4)}</defs>` +
    `<path d="${pathD(v.segs)}" fill="url(#${g})" filter="url(#${f})"/>`;
}

/**
 * Where the jaw's fur lies on the collar, as the sheet paints it: the chin's tufts lie over the band softly, with only
 * a little shade of its blue under them (front.ts's recipe without its dark rim, which here read as a lace edge).
 */
function collarContact(): string {
  const g = uid("blur");
  const jaw = spanPoints(head, fracAt(head, [-24, -61.8]), fracAt(head, [-70, -61.6]));
  // No dark rim: the chin's own line is its edge (DECISIONS 214).
  const shade = strokeOf(jaw, 4.4, { taper: 4, tip: 1 }).d;
  return `<defs>${blur(g, [-76, -66, 58, 14], 1)}</defs><path d="${shade}" fill="${C.collarLine}" opacity="0.3" filter="url(#${g})"/>`;
}

/** How long a closed shape's outline runs from one place to another in path order, in points (a cited bare stretch's length). */
function along(shape: Shape, from: P, to: P): number {
  const a = fracAt(shape, from), b = fracAt(shape, to);
  const pts = spanPoints(shape, a, b);
  return pts.slice(1).reduce((s, p, i) => s + v.len(v.sub(p, pts[i]!)), 0);
}

/**
 * The near leg's lines' ends: where its back edge comes out from under the chest fur, where the crop's line on it
 * starts (it shades the edge above softly, unlined, and lines it only from here down to the hind paw), and where its
 * front edge's line ends.
 */
const NEAR_BACK_TOP: P = [-21.3, -34], NEAR_BACK_LINE: P = [-24.2, -22], NEAR_FRONT_TOP: P = [-53.2, -30];
/** How deep the near leg's back edge's line may lie: lighter where it comes out of the soft shade (y -22), full from y -19 down to the hind paw. */
const nearBack = (p: P) => 0.5 + 0.5 * Math.min(1, Math.max(0, (p[1] + 22) / 3));
/** The hind paw's line's ends: on its heel where the haunch's underside goes under it, joining the haunch's line, and on its crown where it fades out over the thigh. */
const HIND_SOLE: P = [-9.87, -2.15], HIND_CROWN: P = [-11.4, -15.6];
/** The chest's right side, where it lies on the haunch with no line (DECISIONS 231): from under the collar's near end to under the near leg. */
const CHEST_SIDE: [P, P] = [[-21.4, -60.6], [-30.4, -24]];
/**
 * Where the chest's lower edge's line ends, coming up out of the slot over the far leg: the crop leaves the edge from
 * here to its corner unlined, the chest's cream on the far leg's (DECISIONS 231).
 */
const CHEST_LOWER_END: P = [-64.6, -29.9];

/** The three-quarter view in a facing: threeQuarter.L as the crop draws it, or threeQuarter.R, its mirror lit from the top left (views/facing.ts). */
export function threeQuarter(facingSide: Side = "L"): Drawn[] {
  const F = facing(facingSide);
  const backPaintF = backPaint(F), backLinesF = backLines(F), headPaintF = headPaint(F);
  const out: Drawn[] = [];
  const add = (name: string, p: Piece, state?: string) => out.push({ part: name, piece: p, ...(state ? { state } : {}) });
  // The ground shadow, by the dog's one shadow recipe (parts/shadow.ts, DECISIONS 218, 232): a broad soft oval from past
  // the far paw to past the haunch's foot, as far as the crop's reaches (x -100 to 39, where it lies 8/255 or more under
  // its card, from 10.6 pt above the ground to 2 below), darkest where each paw and the haunch press.
  add("shadow", groundShadow({ reach: [-100, 39], presses: [{ x: -71, half: 11 }, { x: -44.6, half: 13 }, { x: -18, half: 10 }, { x: 2, half: 9 }] }));
  // Where each lobe of the plume tucks under the next, the crop's line runs on into the plume in a short flick.
  const centre: P = [31, -36];
  const flicks = tailNotches.slice(0, -1).map(([, n]) => {
    const d = v.norm(v.sub(centre, n));
    return { pts: [n, v.add(n, v.mul(d, 1.4)), v.add(n, v.mul(d, 2.8))], width: 0.75, colour: C.crownLine, opacity: 0.45 };
  });
  const tailPaint: Paint = {
    fill: C.fur,
    shade: furShade([tail], ["M6 -32 C12 -26 18 -20 30 -14 L32 -6 L6 -6Z"], ["M14 -64 L48 -64 L48 -46 L14 -46Z"]),
    inner: flicks,
    light: F.light,
  };
  // One line round the plume, from where it comes out from behind the haunch, round the hook and every lobe and its
  // foot, to where it goes back behind the haunch (DECISIONS 210, 232): light over the cream plume, as the crop's tail
  // line is (the tail-curve panel's L* about 80), the outline's warmer brown on the tan root at its foot.
  const tanFoot = (p: P) => p[1] > -15.6 && p[0] < 31;
  const tailLines: LitSpan[] = [{ from: [11.4, -32.8], to: [11.6, -12.4], on: (p) => (tanFoot(p) ? "tan" : "cream"), most: (p) => (tanFoot(p) ? 1 : 0.3),
    ends: ["under", "under"] }];
  add("tail", lineGate(litPart("tail", tail, tailPaint, tailLines)));
  // The tail's tan root painted as a flame of brush strokes, as the sheet paints it (parts/marking.ts): darkest at the
  // root, a few darker strands radiating up along the plume's fur from the root, its edge brushed into the cream
  // (DECISIONS 217), with no lighter streaks.
  const fromRoot = (p: P): P => v.sub(p, [16, -6]);
  add("tail.base", lineGate(join(litMarking("tail.base", { shape: tail, paint: tailPaint, spans: tailLines }, tailBase, { fill: C.marking, blur: 0.8, fade: { from: [19.5, -22], to: [22.5, -41] } }),
    strands("tail.base", tailBase, 0.8, [[[13.4, -14.4], [16.6, -22], [18.4, -30]], [[15.6, -13.2], [20.4, -19.4], [24, -26.4]], [[17.4, -12.6], [23, -16.4], [27.4, -21]]],
      { colour: C.earLow, opacity: 0.4, width: 0.85 }),
    brush("tail.base", tail, tailBase, 0.8, { flow: fromRoot, seed: 3317, edge: 20, out: [1.6, 3.2], in: [1.8, 3], width: [0.8, 1.2], soft: 0.45, opacity: 0.8,
      inside: { count: 3, length: [4, 7], colour: C.earLow, opacity: 0.3, width: 0.8 }, colour: C.marking }))));
  add("body.back", lineGate(litPart("body.back", back, backPaintF, backLinesF)));
  // The saddle's near half and the rump's spot, their edges brushed along the fur (DECISIONS 217): the saddle's combed
  // down and back along the sloping back, the rump's down the haunch.
  add("back.patch.L", lineGate(join(litMarking("back.patch.L", { shape: back, paint: backPaintF, spans: backLinesF }, saddleL, { fill: C.marking, blur: 0.8 }),
    brush("back.patch.L", back, saddleL, 0.8, { flow: [0.45, 1], seed: 2281, edge: 22, out: [1.6, 3.2], in: [1.8, 3], width: [0.8, 1.2], soft: 0.45, opacity: 0.8,
      inside: { count: 4, length: [4, 7], colour: C.earDeep, opacity: 0.3, width: 0.8 }, colour: C.marking }))));
  // The rump's spot is the left side's only (model.json's marking map): threeQuarter.R shows none.
  if (F.shows("rump.patch.L")) {
    add("rump.patch.L", lineGate(join(litMarking("rump.patch.L", { shape: back, paint: backPaintF, spans: backLinesF }, rumpL, { fill: C.marking, blur: 1 }),
      brush("rump.patch.L", back, rumpL, 1, { flow: [-0.15, 1], seed: 2291, edge: 12, out: [1.4, 2.6], in: [1.6, 2.6], width: [0.8, 1.1], soft: 0.45, opacity: 0.75,
        inside: { count: 2, length: [3, 5], colour: C.earDeep, opacity: 0.25, width: 0.8 }, colour: C.marking }))));
  }
  // The near hind paw (parts/paw.ts bun, DECISIONS 216, 230): its line one span from where the haunch's underside goes
  // under its sole, along the sole (the ground's dark only under its middle), round its toe end and over its crown,
  // lightening as it goes and ending in open fur over the thigh; its back, where it melts into the haunch, unlined, as
  // the crop draws it (230, its length measured). Two soft toe lines.
  const hindBare = along(hind, HIND_CROWN, HIND_SOLE);
  add("hind.L", lineGate(roomy(litPart("hind.L", hind, {
    fill: C.fur,
    shade: furShade(hipGroup, [], ["M-34 -24 L-4 -24 L-4 -9 L-34 -9Z"]),
    ...toes({ lines: HIND_BUN.toes, fade: HIND_BUN.fade, soft: true, width: 0.9 }),
    light: F.light,
  }, [{ from: HIND_SOLE, to: HIND_CROWN, ground: "sole", most: (p) => (p[1] < -12 ? 0.3 : 1), ends: ["join", "free"], cites: 230, bare: [0, hindBare + 0.5] }]), 6)));
  // The far front leg: the fur most of the way to its own warm shade (palette.ts, farFur), 6.2% darker than the
  // near leg; from where it comes out from under the chest it eases in from the fur over 11 pt, so the two join
  // with no edge. The sheet keeps it light: no rim of shade down its front, only a soft shade down its inner side
  // in the slot beside the near leg, under the chest's lower edge. Its line one span from under the near paw round its
  // bun and up its outer edge to under the chest's corner, the ground's dark only under its sole's middle.
  const farTop = uid("fartop");
  add("front.R", lineGate(litPart("front.R", legR, {
    fill: C.farFur,
    shade: { multiply: C.furShadeBy, shapes: ["M-67 -34 C-63 -30 -59 -26 -57 -20 L-54 -3 L-60 -3 C-61 -11 -62.4 -19 -66 -26 L-70 -33Z"], blur: 1.8 },
    ...((): Pick<Paint, "under" | "inner"> => {
      // Two soft toe lines rising from the sole's notches round the middle toe (parts/paw.ts), with the gradient that
      // eases the far leg in from the fur.
      const t = toes({ lines: FAR_TOES, fade: FAR_BUN.fade, soft: true, width: 0.9 });
      return { under: `<defs><linearGradient id="${farTop}" gradientUnits="userSpaceOnUse" x1="0" y1="-33.4" x2="0" y2="-22">` +
        `<stop offset="0" stop-color="${C.fur}"/><stop offset="1" stop-color="${C.fur}" stop-opacity="0"/></linearGradient></defs>` +
        `<rect x="-86" y="-48" width="34" height="26" fill="url(#${farTop})"/>` + t.under, inner: t.inner };
    })(),
    light: F.light,
  }, [{ from: [-54.2, -9], to: [-77.2, -41.5], ground: "sole", ends: ["under", "under"] }])));
  // The chest (DECISIONS 231): its front edge's line from its corner on the far leg, where it meets the far leg's own
  // line, up to under the collar's end; its lower edge's line from under the near leg up out of the slot, light, to
  // where it ends in the fur over the far leg; its right side, where it lies on the haunch, and its lower edge from that
  // end to its corner unlined, as the crop draws them (their lengths measured).
  const sideBare = along(chest, CHEST_SIDE[0], CHEST_SIDE[1]), lowerBare = along(chest, CHEST_LOWER_END, [-77.6, -38.9]);
  add("body.front", lineGate(roomy(litPart("body.front", chest, {
    fill: C.fur,
    // Down the chest's far side, away from the light; its right side, on the haunch, kept light, so no shade ends on
    // its unlined edge there (DECISIONS 233). The jaw's shadow on it is shadow.chin's, which turns with the head.
    shade: furShade(bodyGroup, [], ["M-36 -68 L-14 -68 L-14 -18 L-36 -18Z"]),
    under: between(),
    // A few soft fur strokes down the chest's far side under the collar's end, as the sheet draws them.
    inner: [[[-72, -47.4], [-72.8, -43], [-72.4, -38.6]], [[-67.6, -45.6], [-68.6, -41.6], [-69.2, -37.8]]]
      .map((pts) => ({ pts: sample(smooth(pts as P[], { closed: false }).segs, 6, false), width: 0.7, colour: C.crownLine, opacity: 0.4 }))
      // Short fur strokes branching down off the chest's lower edge toward the slot, the crop's fluffy V.
      .concat([[[-63.4, -30.2], [-62, -28], [-61.4, -25.8]], [[-60.2, -27.2], [-58.6, -25.2], [-57.8, -23]]]
        .map((pts) => ({ pts: sample(smooth(pts as P[], { closed: false }).segs, 6, false), width: 0.7, colour: C.crownLine, opacity: 0.55 }))),
    light: F.light,
  }, [{ from: [-53.7, -17], to: CHEST_LOWER_END, most: chestLower, ends: ["under", "free"], cites: 231, bare: [sideBare + 0.5, lowerBare + 0.5] },
    { from: [-77.6, -38.9], to: [-72.6, -58.6], ends: ["join", "under"] }]), 1)));
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
    // Its line along its lower edge, from its rounded end under the chin round to its near end's point, heavier along
    // the bottom (G9); its top lies under the chin's fur, unlined.
    outline: { colour: C.collarRim, width: THIN, taper: 3, blur: 0.2, spans: [{ from: [-22, -62], to: [-74.4, -60.2] }] },
    light: F.light,
  }));
  add("tag", tagPiece(F));
  for (const side of ["R", "L"] as const) {
    add(`ear.${side}`, lineGate(litPart(`ear.${side}`, ears[side], earPaint(side, F), [EDGES[side].span])));
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
  // The near front leg (DECISIONS 216, 230): its back edge shaded softly where it comes out from under the chest fur and
  // lined, as a contact line, only from y -22 down over the haunch to the paw, as the crop lines it (the stretch above
  // measured); the paw's line round its heel, sole (the ground's dark only under its middle) and toe end,
  // its front edge a contact line from the wrist up over the chest to the chest's V; its top, melting into the chest,
  // unlined (216, its length measured). Two soft toe lines, and no crease over the paw's top (the crop draws none).
  const topBare = along(legL, NEAR_FRONT_TOP, NEAR_BACK_TOP), backBare = along(legL, NEAR_BACK_TOP, NEAR_BACK_LINE);
  const heel: P = [-30.4, -7.4], toe: P = [-58.4, -3.9];
  add("front.L", lineGate(litPart("front.L", legL, {
    fill: C.fur,
    shade: furShade(bodyGroup, [], ["M-70 -70 L-20 -70 L-20 -36 L-70 -36Z", "M-34 -40 L-18 -40 L-18 -16 L-34 -16Z"]),
    ...toes({ lines: NEAR_TOES, fade: [-2.05, -8.3], soft: true, width: 0.9 }),
    feather: { from: [-40, -46], to: [-40, -38] },
    light: F.light,
  }, [{ from: NEAR_BACK_LINE, to: heel, contact: true, most: nearBack, ends: ["free", "join"], cites: 230, bare: [backBare + 0.5, 0] },
    { from: heel, to: toe, ground: "sole", under: (p) => (p[1] > -3.2 ? 0.55 : 0), ends: ["join", "join"] },
    { from: toe, to: NEAR_FRONT_TOP, contact: true, ends: ["join", "free"], cites: 216, bare: [0, topBare + 0.5] }])));
  return F.finish(out);
}

/** Points the sheet has no finder for, where this drawing puts them (dev output for the sheet match). */
export const landmarks: Record<string, P> = {
  // Each paw's centre (DECISIONS 11), the middle of its rounded end: midway between its sides and between the wrist,
  // where its round begins, and its sole. The near front paw: from its front (x -59.5) to its heel (-30.4), round from
  // the wrist (y -16.2) to its sole (-1.5).
  "paw.front.L": [-45, -8.9],
  // The far front paw: from its toe end (x -83.8) to where it goes behind the near paw (-59.5), round from its wrist
  // (y -19.6) to its sole (-3.6).
  "paw.front.R": [-71.7, -11.6],
  // The near hind paw: from its toe end (x -29.1) to where its back end melts into the haunch (-10), round from its
  // crown (y -17) to its sole (-1.5).
  "paw.hind.L": [-19.6, -9.2],
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
 * How much lighter the far eye's lash bands and squeeze are than the near one's (DECISIONS 202): as the far eye's own
 * lines are (its rim's top 1 pt to the near one's 1.2, its half-lid's lash 1.6 to 1.9), and as Soft landing draws its
 * far crescent, 0.81 as thick as its near one (3.3 px of dark to 4.1, measured column by column on the panel).
 */
const WEIGHT = 0.84;
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
 * eye; each at the front's weight, the master sheet's even 5 pt band with round ends (141, 202: the crescent 5 pt, the
 * closed lid and the wink 4.8), the far eye's lighter as its own lines are (WEIGHT); the half-lid, the wide
 * eye and the peek the open eye's own spec changed as the front changes its own.
 */
function lidOf(state: LidState, side: "L" | "R"): TurnedEyeLid {
  const spec = EYES[side], near = side === "L", k = near ? 1 : FAR, out = near ? 1 : -FAR, w = near ? 1 : WEIGHT;
  const band = (o: number, down: number, b: Omit<LidBand, "centre" | "tilt" | "noseward">): TurnedEyeLid =>
    ({ band: { centre: [spec.centre[0] + out * o, spec.centre[1] + down], tilt: LID_TILT[side], noseward: spec.noseward, ...b } });
  switch (state) {
    case "happy":
      return band(1.9, 2.35, { width: 17.6 * k, rise: near ? 4.4 : 3.8, drop: near ? 1 : 0.8, thickness: 5 * w, ends: [2.6 * w, 3.2 * w], fullness: 0.35,
        flick: { length: near ? 1.4 : 1.1, hook: -10 } });
    case "closed":
      return band(1.6, 2, { width: 17 * k, rise: near ? -3 : -2.6, drop: 0, thickness: 4.8 * w, ends: [2.4 * w, 2.2 * w], fullness: 0.35,
        flick: { length: near ? 1.3 : 1, hook: -30 } });
    case "wink":
      return band(0.5, 0.6, { width: 17.6 * k, rise: near ? 4 : 3.5, drop: near ? -1.4 : -1.1, thickness: 4.8 * w, ends: [2.4 * w, 2.4 * w], fullness: 0.35,
        flick: { length: near ? 1.8 : 1.4, hook: -75 } });
    // The upper lid closed over about two fifths of the eye, as the front's: its middle 1.4 pt above the middle of an
    // eye 9.2 pt tall, its ends 3.2 pt above it where they meet the ball's sides, each eye's grown with its height; a
    // pale lid over the ball above it, the lash running past the ball at its outer corner only, the catchlight on the
    // iris just under the lash, its top tucked under it (Q28), the tiny one below it (Q26; parts/turned.ts).
    case "sleepy": {
      const s = spec.ry / 9.2;
      return { spec, lid: { level: -3.2 * s, bow: 1.8 * s, tilt: LID_TILT[side], lash: near ? 1.9 : 1.6, overhang: near ? 0.5 : 0.4, shine: { at: near ? [2.7, 0] : [1.8, 0], r: near ? 1.4 : 1.1 } } };
    }
    // Huffy's flat lid (DECISIONS 153, 207), as the front's: shut, a hair lower in its middle than at its ends, 1.4 pt
    // further out and 1.3 pt lower than the open eye's middle, at the front's weight (4.4 pt, a little lighter than the
    // crescent), the far one shortened and lighter with its eye; both level with the muzzle (7.5°), its ends level in
    // the face's own frame as the front's are: leant outward as the crescents are (LID_TILT), the near lid's outer end
    // dropped 0.7 pt and the shut pair read tired, not huffy.
    case "flat": {
      const b = band(1.4, 1.3, { width: 16.4 * k, rise: -1, drop: 0, thickness: 4.4 * w, ends: [2.6 * w, 1.8 * w], fullness: 0.45,
        flick: { length: near ? 1.2 : 0.9, hook: 10 } });
      return "band" in b ? { band: { ...b.band, tilt: threeQuarterLevel } } : b;
    }
  }
}

/** The wide eye on each eye's open eye: 7% larger and a point higher, a little toward the nose, the white broader, the catchlight bigger. */
const wideOf = (side: "L" | "R"): EyeSpec => {
  const spec = EYES[side], near = side === "L";
  return { ...spec, centre: [spec.centre[0] + spec.noseward * 0.4, spec.centre[1] - 0.9], rx: spec.rx * 1.07, ry: spec.ry * 1.07,
    white: { at: spec.white.at, width: spec.white.width * 1.35, span: spec.white.span + 8, fade: 0.5 },
    shine: { at: [spec.shine.at[0] * 1.07, spec.shine.at[1] * 1.15], r: spec.shine.r * 1.15 }, glow: near ? { band: 6, warm: 2 } : { band: 5.4, warm: 2.4 } };
};

/**
 * The ball states' specs on each eye (exported for the R3 gaze guard, faces.turned.test.ts): the open eye's, changed as
 * the front changes its own (DECISIONS 172, 203 to 207).
 */
export function turnedEyeSpec(state: "open" | "wide" | "peek" | "sparkle" | "eager" | "peekBack", side: "L" | "R", light: P = LIGHT): EyeSpec {
  const spec = EYES[side], near = side === "L", s = spec.ry / 9.2;
  switch (state) {
    case "open":
      return spec;
    case "wide":
      return wideOf(side);
    // Side glance: the iris toward the viewer's right, back toward the person, as the front's looks; the white a broad
    // crescent on the side away from the look (the near eye's nose side, the far eye's outer side); the catchlights ride
    // the iris at half its travel (Q28).
    case "peek": {
      const e = { ...spec, white: { at: near ? 186 : -6, width: near ? 4.6 : 3.4, span: 58, fade: 0.3 } };
      return { ...e, shine: riding(e, spec, spec.shine) };
    }
    // The sparkle (Q2, DECISIONS 203), as the front's: the star in the lower iris, a little smaller in the far eye, and
    // the two plump gold stars just past each eye's outer top, the larger five-pointed and the smaller four, along the
    // eye's lean.
    case "sparkle":
      return { ...spec, sparkle: { star: { at: [0.2, -4.5 * s], r: near ? 3.3 : 2.8 }, level: LID_TILT[side], light,
        stars: near ? [{ at: [-13.6, 8.6], r: 3.8, points: 5 }, { at: [-15.8, 1.2], r: 2.6, points: 4 }] : [{ at: [-7.6, 10.8], r: 2.8, points: 5 }, { at: [-9.2, 4.4], r: 1.9, points: 4 }] } };
    // Hungry's eager eye (DECISIONS 151, 207), as the front's: the wide eye with its pupil larger, the iris baked in toward
    // the nose and a hair down, on the food just in front of the nose, the white a crescent down the outer side; the
    // catchlights ride the iris at half its travel from the wide eye's (Q28), the large one 10% larger.
    case "eager": {
      const w = wideOf(side), e = { ...w, white: { at: 10, width: near ? 2 : 1.6, span: 55, fade: 0.3 }, glow: { band: 3, warm: 1.2 } };
      return { ...e, shine: riding(e, w, { at: w.shine.at, r: w.shine.r * 1.1 }) };
    }
    // Huffy's peek back (DECISIONS 153, 159, 207): the eye open again and bright, looking back at the person (the viewer's
    // right in a .L view, as the peek looks), level, never up: the white on the side away from the look a little below
    // its level (the near eye's nose side at 168°, the far eye's outer side at 6°), the catchlights riding the iris (Q28).
    case "peekBack": {
      const e = { ...spec, white: { at: near ? 168 : 6, width: near ? 3.2 : 2.6, span: 56, fade: 0.3 } };
      return { ...e, shine: riding(e, spec, spec.shine) };
    }
  }
}

/**
 * The squeeze on each eye (Q2, DECISIONS 202), the front's `>` `<` placed from each eye's open eye as the front places
 * its own, along the eye's lean: the near one the front's, the far one shortened across with its eye (its arms' run
 * across times FAR, their rise kept, so they open a little wider on screen); each at its eye's crescent weight, the near
 * 5 pt and the far lighter as its own lines are (WEIGHT), so ticklish's `>` `<` and laughing's crescents weigh the same.
 */
/** The muzzle's level (the line through the rest mouth's corners), the face's level for the R3 guards (DECISIONS 179). */
const threeQuarterLevel = 7.5;
const SQUEEZE_TILT = threeQuarterLevel / 2;
export function turnedSqueeze(side: "L" | "R"): Chevron {
  const spec = EYES[side], near = side === "L", k = near ? 1 : FAR;
  const foreshorten = (len: number, deg: number): [number, number] => {
    const a = (deg * Math.PI) / 180, [x, y] = [len * Math.cos(a) * k, len * Math.sin(a)];
    return [Math.hypot(x, y), (Math.atan2(y, x) * 180) / Math.PI];
  };
  const [lu, au] = foreshorten(16.8, 14), [ll, al] = foreshorten(15.8, 26);
  // The point 8.8 pt in from the ball's middle toward the nose, level with it, as the front's (8.2 from its landmark),
  // both leaning half the muzzle's level: leant as the lids are (10° and 5°), the near `<` sheared, its lower arm
  // dropping 36° and its upper rising 4°, and the pair no longer read as one squeeze.
  const tilt = SQUEEZE_TILT, t = (tilt * Math.PI) / 180, back = 8.8 * k, out = -spec.noseward;
  return { tip: [spec.centre[0] - out * back * Math.cos(t), spec.centre[1] - out * back * Math.sin(t)], tilt,
    noseward: spec.noseward, length: [lu, ll], angle: [au, al], thickness: near ? 5 : 5 * WEIGHT, ends: near ? 4.3 : 4.3 * WEIGHT, bow: near ? 0.8 : 0.7, point: near ? 1 : 0.9 };
}

function eyeState(state: (typeof EYE_STATES)[number], side: "L" | "R", light: P): Piece {
  switch (state) {
    case "happy":
    case "closed":
    case "wink":
    case "sleepy":
    case "flat":
      return drawLid(lidOf(state, side));
    case "squeeze":
      return chevron(turnedSqueeze(side));
    default:
      return eye(turnedEyeSpec(state, side, light));
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
let nape = smooth([[-8, -141], [2, -142.6], [6.6, -138], [9.8, -130.4], [11.4, -121], [11.2, -111], [9.2, -101.4], [5.8, -94], [2.4, -89.4], [1.2, -83],
  [0, -74], [-2.2, -65], [-4.6, -57.4], [-6.6, -53], [-10, -55.6], [-14, -57.6], [-19.6, -60.4], [-24, -66], [-23, -90], [-22.6, -120], [-20, -136]], { corners: [13] });
nape = furEdge(nape, [-7.4, -53.8], [-19.6, -60.4], [{ len: 0.9, w: 1.4, lean: 0.3 }, { len: 0.6, w: 1, lean: 0.25 }, { len: 1, w: 1.5, lean: 0.35 }], 0.4);

/**
 * The nape's lines (DECISIONS 234), one per visible edge, through the line gate: from where its top comes out from under
 * the crown, between the crown and the raised flap, round the back of the skull and down the neck to where the neck meets
 * the back's line, on the skull's tan above y -100; and from there along the neck fur's lower edge, which lies on the
 * back's top, to where it goes under the jaw, one span over its locks. They first tapered out over 6 and 8 pt at both
 * ends, leaving 9.3 pt of the top unlined under the flap and the neck fur unlined over the back.
 */
const NAPE_CORNER: P = [-6.6, -53];
const NAPE_LINES: LitSpan[] = [
  { from: [-1.4, -142.2], to: NAPE_CORNER, on: (p) => (p[1] < -100 ? "tan" : "cream"), ends: ["under", "join"] },
  { from: NAPE_CORNER, to: [-23.2, -64.6], ends: ["join", "under"] },
];

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
  // Its line from beside the root over its top and round the free end back under it, on the tan: two spans meeting at
  // full width in the dip, each end running on under the head over its root (DECISIONS 210, 234), through the line gate.
  const spans: LitSpan[] = near
    ? [{ from: [-19.2, -153], to: [20.8, -135.4], on: "tan", ends: ["under", "join"] }, { from: [20.8, -135.4], to: [-5, -145.3], on: "tan", ends: ["join", "under"] }]
    : [{ from: [-60.6, -156], to: [-103.2, -137.6], on: "tan", ends: ["under", "join"] }, { from: [-103.2, -137.6], to: [-72, -147.3], on: "tan", ends: ["join", "under"] }];
  const flap = lineGate(litPart(`ear.${side}`, shape, { ...paint, light: F.light }, spans));
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
  }, NAPE_LINES);
  // Its canvas grown to hold its rim of shade's whole reach (front.ts's roomy rule); its lines gated as the flap's are.
  return join(lineGate(roomy(back, 2)), flap);
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
  for (const side of ["L", "R"] as const) for (const state of EYE_STATES) out.push({ part: `eye.${side}`, state, piece: eyeState(state, side, F.light) });
  for (const state of TURNED_MOUTHS) {
    out.push({ part: "mouth", state, piece: turnedMouth(state, muzzle(F.light, state === "o" || state === "yawn" ? ROUND : undefined), NOSE_FOOT).piece });
  }
  for (const state of ["raised", "happy"] as const) {
    for (const side of ["L", "R"] as const) out.push({ part: `brow.${side}`, state, piece: brow(browState(BROWS[side].pts, state), BROWS[side].width) });
  }
  for (const side of ["L", "R"] as const) out.push({ part: `ear.${side}`, state: "onePerked", piece: perkedEar(side, F) });
  // The head's line beside either ear perked: the state names the dog's side (the front's), so .R's near ear is its right
  // and its far ear its left (DECISIONS 234).
  out.push({ part: "head.line", state: facingSide === "L" ? "templeL" : "templeR", piece: headLinePiece(F, "near") });
  out.push({ part: "head.line", state: facingSide === "L" ? "templeR" : "templeL", piece: headLinePiece(F, "far") });
  // Huffy's puffed cheeks (DECISIONS 208), in the cheeks slot after the blush (rig.json).
  out.push({ part: "cheeks", state: "puffed", piece: turnedCheeks(puffs(F.light), F) });
  return F.finish(out);
}

/**
 * The face states drawn and tested but held out of the package for now, in a facing: proud's stars round the head. The
 * rig holds the stars to the front (faces.test.ts holds that no turned view draws them), so the review build of the
 * turned faces' evidence adds them (qa/phase3/faces/turned/render.ts; DECISIONS 183).
 */
export function threeQuarterHeld(facingSide: Side = "L"): Drawn[] {
  const F = facing(facingSide);
  return F.finish([{ part: "stars", state: "sparkle", piece: turnedStars(STARS, F.light) }]);
}

/**
 * Huffy's puffed cheeks seen from this view (DECISIONS 208, 234): the front's balls (parts/cheeks.ts PUFF) carried onto
 * the muzzle as its mouths are, the near one drawn 1.14 times as wide and the far one shortened to 0.64, along the
 * muzzle's level, each crease hugging the pressed mouth's end. Drawn in the cheeks slot after the blush in each turned
 * head's order (rig.json), keyed by huffy's clip.
 */
const puffs = (light: P): TurnedPuff[] => {
  const f = muzzle(light);
  // A little nearer the mouth and narrower than the front's (15.6 pt out, the near one its own width): carried as they
  // are, the near ball sat on the blush and read as a white muzzle, and the far one bulged at the face's far edge.
  return ([1, -1] as const).map((sx) => ({ c: f.at([sx * 15.6, CHEEK_PUFF.at[1]]), rx: CHEEK_PUFF.rx * (sx > 0 ? 0.95 : f.k[0]), ry: CHEEK_PUFF.ry * 0.92,
    turn: f.levelDeg, mouthward: (sx > 0 ? -1 : 1) as 1 | -1 }));
};

/** What the face states are drawn from, for the R3 guards (characters/dog/test/faces.turned.test.ts). */
export const threeQuarterFace = {
  muzzle: (light: P, state: TurnedMouthState | "open") => muzzle(light, state === "o" || state === "yawn" ? ROUND : undefined),
  nose: NOSE_FOOT,
  rest: { lip: REST_LIP, lipCentre: [-69.4, -85.8] as P },
  brows: (state: BrowState) => ({ L: browState(BROWS.L.pts, state), R: browState(BROWS.R.pts, state) }),
  eyes: EYES,
  /** Each ball state's spec, each squeeze, and the puffed cheeks (the R3 guards read where the iris looks, the squeeze's arms, the puff). */
  spec: turnedEyeSpec,
  squeeze: turnedSqueeze,
  puffs,
  /** The lid each closing eye state draws, on each eye (the R3 guard reads its lean). */
  lids: lidOf,
  perked: { L: perkedNear, R: perkedFar },
  /** The muzzle's level, the line through the rest mouth's corners (7.5°): the R3 guards' level frame here (DECISIONS 179). */
  levelDeg: 7.5,
};
