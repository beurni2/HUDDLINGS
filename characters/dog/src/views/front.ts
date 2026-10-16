// The dog's front view: shapes first, every node typed by hand in model space
// (points, the ground under the seat at 0, 0, y down) at the extremes and
// inflections read off the front turnaround, then paint. Light groups share one
// light across joined parts (head and tuft, chest and front legs, haunches and
// hind paws); joins are feathered and carry no rim and no line.
import { furEdge, furSpan, type Lock } from "../../../draw/fur.ts";
import { arc, bbox, ellipse, fracAt, mirrorX, pathD, polyD, rotate, sample, smooth, spanPoints, symmetric, v, type Node, type P, type Seg, type Shape } from "../../../draw/geom.ts";
import { innerLine, mirrorSpans, strokeOf, type DrawnLine } from "../../../draw/line.ts";
import { marking, part, soft, type Fade, type Paint } from "../../../draw/paint.ts";
import { blur, join, pad, piece, uid, type Box, type Piece } from "../../../draw/svg.ts";
import { model } from "../model.ts";
import { C, LINES } from "../palette.ts";
import { brow } from "../parts/brow.ts";
import { eye as sharedEye, lidBand, type EyeSpec, type LidBand } from "../parts/eye.ts";
import { rolledFrame } from "../parts/face.ts";
import { MOUTH_STATES, mouth } from "../parts/mouth.ts";
import { stars, type Star } from "../parts/stars.ts";
import { litEdge, litMarking, litPart, type LitSpan } from "../parts/lines.ts";
import { curlShapes, topknot, type Curl } from "../parts/topknot.ts";
import { earFur } from "../parts/ear.ts";
import { toes } from "../parts/paw.ts";
import { tagPaint } from "../parts/tag.ts";

export interface Drawn {
  part: string;
  state?: string;
  piece: Piece;
}

const INNER = model.outline.innerPt;
/** Lines on fur spans and small parts: lighter, and never under 1.2 pt (a thinner line is a question for the founder). */
const THIN = 1.2;

/** The same shape on the dog's other side. */
const other = (nodes: Node[]) => smooth(mirrorX(nodes));
/** Lit line spans typed for the dog's right side, mirrored for its left. */
const litSide = (side: "L" | "R", spans: LitSpan[]) => (side === "R" ? spans : (mirrorSpans(spans) as LitSpan[]));
/**
 * A part's canvas grown to hold its shade where the light group reaches past
 * the part, so the part rasterized on its own canvas matches the whole frame
 * (the hind paws, whose light group's rim and blur reach past their edges).
 */
const roomy = (p: Piece, by: number): Piece => ({ ...p, box: pad(p.box, by) });
/** Inner lines typed for the dog's right side, mirrored for its left. */
const flipX = (pts: P[], side: "L" | "R") => (side === "R" ? pts : pts.map(([x, y]): P => [-x, y]));
/** The same fur locks on the dog's left side, whose path runs the other way: in reverse, leaning the other way. */
const lefthandOf = (locks: Lock[]): Lock[] => [...locks].reverse().map((l) => ({ ...l, lean: -(l.lean ?? 0) }));
/** Path data (absolute commands, each point an "x y" pair) mirrored across x = 0. */
const mirrorD = (d: string) => d.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (_m, x: string, y: string) => `${-Number(x)} ${y}`);

// The face frame. The turnaround's head is rolled about 4° toward the dog's
// right shoulder (DECISIONS 8): its outline is symmetric, but the eyes, the
// mouth and the patches sit on a tilted line. The face is drawn symmetric about
// its own centre line, between the eyes' landmarks, and rolled with them, so
// every eye lands on its landmark and its rig pivot.
const LM = model.landmarks.front!;
const EYE_L = LM["eye.L"]!, EYE_R = LM["eye.R"]!;
const FC: P = [(EYE_L[0] + EYE_R[0]) / 2, (EYE_L[1] + EYE_R[1]) / 2];
const ROLL = Math.atan2(EYE_L[1] - EYE_R[1], EYE_L[0] - EYE_R[0]);
const ROLL_DEG = (ROLL * 180) / Math.PI;
const cosR = Math.cos(ROLL), sinR = Math.sin(ROLL);
/** A point in the face frame (origin between the eyes, x along the eye line) in model space. */
const face = ([x, y]: P): P => [FC[0] + x * cosR - y * sinR, FC[1] + x * sinR + y * cosR];
/**
 * Nodes typed upright in the head's frame (model space with the face's midline at x = 0), rolled with the
 * face: moved onto its centre line and turned about its centre, as face() places a point (the ears, grafted
 * from front a, whose own roll was 2.9° about another centre).
 */
const rollN = (nodes: Node[]): Node[] => rotate(nodes.map((n): Node => (n.length === 3 ? [n[0] + FC[0], n[1], n[2]] : [n[0] + FC[0], n[1]])), ROLL_DEG, FC);
const rollP = (p: P): P => rollN([p])[0] as P;
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const fmt = (n: number) => r3(n).toString();
/** Path data typed upright in the head's frame (absolute M, L, C and Z, each point an "x y" pair), rolled point by point. */
const rollD = (d: string) => d.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (_m, x: string, y: string) => rollP([Number(x), Number(y)]).map(fmt).join(" "));
/** The face frame the face's parts are typed in (parts/face.ts): the eyes' midpoint, rolled with them. */
const FRAME = rolledFrame(FC, ROLL_DEG);

// Shapes.

// The haunches and the saddle over the shoulders: their outline is the body's
// silhouette from under the collar's ends down over the shoulder and round the
// haunch to the hind paw, as the sheet draws it, the chest lying in front of
// them a little inside it; the top lies under the chest and the collar. The
// shoulders' fur breaks into a few small locks just below the collar.
const backHalf = symmetric([[0, -54], [-17, -57.6], [-25.4, -63.4], [-29.4, -60.4], [-31.4, -56.6], [-33.4, -53], [-34.9, -50], [-36.4, -46.6], [-38.3, -43],
  [-39.6, -40.6], [-42, -38], [-46.4, -33], [-48.8, -27.4], [-49.6, -21], [-49.2, -15.4], [-47.6, -10.6], [-44.4, -6.8], [-36, -4.8], [-20, -2.4]], [0, -1.6]);
const shoulderLocks = [{ len: 0.55, w: 0.9, lean: 0.25 }, { len: 0.8, w: 1.2, lean: 0.3 }, { len: 0.6, w: 1, lean: 0.35 }];
const back = furEdge(furEdge(backHalf, [-30.6, -59], [-34.4, -50.8], shoulderLocks, 0.3), [34.4, -50.8], [30.6, -59], lefthandOf(shoulderLocks), 0.3);

// The hind paws: plump domes resting in front of the haunches, as the sheet draws them, each a round arc on
// top from where it comes out from behind the front paw over its crown (y -19 at x -38) and down its outer side
// (x -48.2), its sole rounded and sitting a little above the front paws' (the sheet's at y -3.1), one soft bump
// a toe with a small scallop at each toe line, its inner half behind the front paw.
const hindR: Node[] = [[-29.6, -15.2], [-33, -18], [-37.6, -19.2], [-42.4, -18.4], [-46.2, -15.4], [-48.2, -11], [-47.6, -6.8], [-45.4, -4.3], [-41.6, -3.3],
  [-38.6, -2.5], [-35.6, -3], [-32.4, -2.6], [-28.6, -4.4], [-25.4, -10.6]];
/** The scallops' notches in the sole (concave, so no corner rule applies). */
const HIND_TOES = [8, 10];
const hind = { R: smooth(hindR, { corners: HIND_TOES }), L: smooth(mirrorX(hindR), { corners: HIND_TOES.map((j) => (hindR.length - j) % hindR.length) }) };

// The chest: the cream bib in front of the saddle, its edge about 2 pt inside
// the silhouette from under the collar's end down the shoulder, so the saddle's
// tan shows along the shoulder as the sheet paints it, melting into the leg;
// its foot runs on down between the front paws.
const chest = symmetric([[0, -66], [-16, -65.4], [-25.6, -63.2], [-28, -60], [-29.6, -56.2], [-31, -51.4], [-32, -46], [-32.6, -40],
  [-32.4, -34], [-31.6, -26], [-29.6, -17], [-26.4, -9], [-20, -4.4], [-8, -3.2]], [0, -3]);

// The front legs: short chubby legs that come out of the chest side by side under the tag and come together going
// down, as the sheet draws them (the gap between their inner edges about 10 pt at y -30, 5 at -16 and under 2 between
// the paws), so the paws nearly touch over a narrow slot; each comes out from under the shoulder's saddle, its outer
// edge where the sheet draws the leg's fine line against the haunch (x -35.2 at y -41, -31.6 at -21), narrowing a
// little to the wrist (x -29.8 at y -16) and swelling into a round bun of a paw a little wider than the leg (x -30.6 at
// y -12 outside, -1 at -5.4 inside), its sole convex and dipping a little at the two toe lines (concave corners), so
// it rests on the ground in three round toes, as the sheet's does. Its top, hidden in the chest's fur, stays under the
// tag's point and clear of the heart's sides, so the tag hangs in front of the chest whole.
const legR: Node[] = [[-5.8, -33.6], [-5.2, -28], [-3.6, -20], [-2.2, -13], [-1.2, -8.8], [-1, -5.8], [-2.7, -2.4], [-6.4, -1], [-11.2, -0.9], [-16, -0.2],
  [-20.8, -0.9], [-25, -1.6], [-28.4, -4], [-30.4, -8], [-30.6, -12.2], [-29.8, -16], [-31.6, -21], [-33.6, -28], [-34.8, -35], [-35.2, -41],
  [-33, -47], [-26, -44], [-15, -40.4], [-8.2, -37.4]];
/** The sole's dips at the toe lines (concave, so no corner rule applies). */
const FRONT_TOES = [8, 10];
const legs = { R: smooth(legR, { corners: FRONT_TOES }), L: smooth(mirrorX(legR), { corners: FRONT_TOES.map((j) => (legR.length - j) % legR.length) }) };

// The collar: a band of nearly even width round the neck, following the chin down to a gentle dip at the front, as
// the sheet draws it: about 8.5 pt deep at the front with its rims (the sheet's 8.2 to 8.7 at x -14 to 16) and still
// about 6.5 pt where its blunt ends pass behind the cheeks' fur (the sheet's at x -25 and 25), never a crescent tapering
// to horns. The sheet's head roll tips it a little: its left end sits higher and reaches 2 pt further out.
const collar = smooth([[-26.6, -62.8], [-21, -61.2], [-10, -59], [0, -58.2], [10, -59.4], [20.5, -62], [26.4, -64], [28.2, -63.2], [28.6, -60.4],
  [28.2, -57.8], [25, -55.6], [18, -52.4], [10, -50.4], [0, -49.8], [-10, -50], [-17, -51.6], [-22.6, -54.2], [-26.2, -56.2], [-27.4, -58.2],
  [-27.6, -60.8]]);

// The tag: a true heart, as the sheet draws it: two round lobes with a clear
// cleft between them at the top, widest a little above mid-height (17.1 pt
// with its line, the sheet's 17.8 blurred), its sides running down nearly
// straight to a soft point at the foot, 15.9 pt tall, centred under its ring;
// and the smaller heart embossed in it, the same heart at 57% about its middle.
const shift = (shape: Shape, dx: number): Shape => ({ ...shape, segs: shape.segs.map((g) => g.map(([x, y]): P => [x + dx, y]) as Seg) });
const TAG_X = 0.4;
const HEART: Node[] = [[0, -48.8], [-1.1, -50.2], [-2.7, -51], [-4.5, -51], [-6, -50.3], [-7.5, -48.8], [-8.5, -46.8], [-8.85, -44.6], [-8.4, -42.4],
  [-7.2, -40.3], [-5.7, -38.5], [-4, -36.9], [-2, -35.7]];
const HEART_FOOT: Node = [0, -35.1];
const heart = shift(symmetric(HEART, HEART_FOOT, { corners: [0] }), TAG_X);
const inset = (k: number) => ([x, y]: Node): Node => [x * k, -43.6 + (y + 43.6) * k];
/** The two embossed hearts, at 70% and 44% of the tag about its middle. */
const embossed = [0.7, 0.44].map((k) => shift(symmetric(HEART.map(inset(k)), inset(k)(HEART_FOOT), { corners: [0] }), TAG_X));

// The ears (front a's): droplets hanging from high on the head's sides, narrow
// at the root (tucked under the crown fur), broad and rounded below, their inner
// edges running on behind the face. The lower edge hangs in three soft clumps of
// fur, as the sheet draws it, the fullest at the bottom outer corner, each notch
// between them a soft dip about 1.2 pt deep. The right ear is typed in the
// head's frame and rolled with the face.
const earR: Node[] = [[-37.5, -141.4], [-29.4, -138.6], [-28.2, -132.4], [-40, -86], [-39.4, -73], [-41.4, -66.6], [-46.6, -64], [-52.6, -62.6],
  [-58.6, -63.1], [-63.2, -65], [-66.6, -69.4], [-70.6, -70.6], [-74.4, -73.6], [-76.2, -78.2], [-80.4, -82], [-81, -88.4], [-80.4, -94.4],
  [-78.2, -100.2], [-73.6, -106.2], [-66.8, -111.6], [-60.8, -117.4], [-56, -125.6], [-50.6, -130.8], [-45.4, -135.2]];
/** The right ear's node where the left ear's typed upper edge ends (its outer side, at y -82). */
const EAR_SPLIT = earR.findIndex(([x, y]) => x === -80.4 && y === -82);
/** The notches between the clumps: a crisp dip each, as the sheet draws them (concave, so no corner rule applies). */
const EAR_NOTCHES = [[-66.6, -69.4], [-76.2, -78.2]].map(([x, y]) => earR.findIndex((n) => n[0] === x && n[1] === y));
/**
 * The left ear below its middle is the right one mirrored, hung 2.8° nearer the face about its root and 3%
 * longer down its length from its top (the face's roll sets the tips 7 pt apart in height, where the sheet
 * hangs them 3.1 apart), then rolled. A place on it, in the right ear's head frame.
 */
const EAR_L_HANG = 2.8, EAR_L_ROOT: P = [37.5, -138], EAR_TOP = -141.4, EAR_L_LENGTH = 1.03;
const hangL = (nodes: Node[]): Node[] => rollN(rotate(nodes.map(([x, y]): Node => [-x, EAR_TOP + (y - EAR_TOP) * EAR_L_LENGTH]), EAR_L_HANG, EAR_L_ROOT));
const lowerL = hangL([earR[0]!, ...earR.slice(1).reverse()]);
// Above its middle the sheet draws the left ear's outer edge as one full convex arc, 3.5 to 4.7 pt outside the
// mirror's (y -137 to -113): those nodes are typed where the sheet draws them, in model space, down to the outer
// clump, where the sheet's edge turns in at (76.4, -78.6) and the hung edge takes over.
const earL: Node[] = [lowerL[0]!, [42, -139.6], [51.4, -132.6], [58.2, -125], [64.6, -116], [71, -110], [75.6, -103.6], [78.6, -96], [79.6, -88], [78.8, -82],
  [76.4, -78.6], ...lowerL.slice(earR.length - EAR_SPLIT + 2)];
// Fitted closely (0.05 pt), so the fit keeps the lobes as round as the typed nodes make them.
// The left ear's lower nodes are the right's in reverse after its 10 typed ones, so a notch at the right's node j is the left's 9 + EAR_SPLIT - j;
// its outer notch is typed in place of the hung one (a smooth turn, so the join stays round).
const ears = { R: smooth(rollN(earR), { corners: EAR_NOTCHES }), L: smooth(earL, { tol: 0.05, corners: EAR_NOTCHES.slice(0, 1).map((j) => 9 + EAR_SPLIT - j) }) };
/** A head-frame place on the dog's right ear, or the same place on its left ear, in model space. */
const onEar = (side: "L" | "R", p: P): P => (side === "R" ? rollP(p) : (hangL([p])[0] as P));
/** Path data on the dog's right ear, or the same on its left (the hang is small enough to leave out of soft paint), rolled. */
const earD = (side: "L" | "R", d: string) => rollD(side === "R" ? d : mirrorD(d));

/**
 * The face's roll carried down into the cheeks and jaw (DECISIONS 8): below the
 * eyes each point is lifted on the dog's left and lowered on its right by its
 * distance from the midline times the roll, fading out above the eyes, where
 * the crown and the topknot stay level as the sheet draws them; under the jaw
 * three quarters of it under the chin (the sheet's chin meets the collar at
 * y -59.5 at x -20 and -61.2 at x 20), easing to about a third at the jaw's
 * corners, where the sheet's jaw lies near level over the collar's ends (y
 * -63.3 on the right and -64.5 on the left at x 31, where the full roll would
 * put them 4.3 pt apart, the left one off the collar's end).
 */
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const cheekRoll = ([x, y]: P): P => {
  const jaw = clamp01((-62 - y) / 12), under = 0.75 - 0.4 * clamp01((Math.abs(x) - 20) / 11);
  return [x, y + x * Math.tan(ROLL) * clamp01((y + 118) / 20) * (jaw + (1 - jaw) * under)];
};

/**
 * The crown to the right of the topknot sits higher on the sheet than its mirror on the left (the silhouette
 * there runs 1.5 to 2 pt above the typed half's mirror, at x 25 to 37): its nodes are lifted 1.8 pt, fading
 * out toward the topknot and down toward the ear root.
 */
const crownLift = ([x, y]: P): P => [x, y - 1.8 * Math.min(1, Math.max(0, (x - 18) / 6)) * Math.min(1, Math.max(0, (-140 - y) / 4))];
/**
 * The face's left side, where it lies over the ear, runs 2 to 2.8 pt inside its mirror: the sheet draws that
 * line at x 36.6 at y -126, 42.9 at -115, 44.4 at -108 to -100 and 43.6 at -96, against -38.6, -45, -46.5 to
 * -47.3 and -46.5 on the right (the face turned a hair toward the dog's left). Fades out toward the temple's
 * notch and above the cheek.
 */
const leftSide = ([x, y]: P): P => [x > 0 ? x - 2.4 * Math.min(1, Math.max(0, (y + 132) / 4)) * Math.min(1, Math.max(0, (-89 - y) / 5)) : x, y];

// The head: a soft round mass with a full crown, widest at the cheeks
// (93.3 pt between the ears' inner edges, DECISIONS 7). At each temple the
// crown's cream fur overhangs the ear's root, its underside a soft shallow arc,
// and under it the ear's tan shows in a soft crescent that rounds off into the
// face's side (the ear roots' landmarks, the tan's highest points, sit in those
// crescents). From there the face's side is a round curve that bows out over
// the ear and in again above the cheek, as the sheet's line draws it (x -42.6 at
// y -120, -45 at -115, -46.5 to -47.3 from -110 to -100 and -45.8 at -93 on the
// right). Below it each cheek is a round puff that comes out from under the
// side's line over the ear (a concave corner where it leaves the line) and
// bulges past it to x -47.5 at y -80 on the right, as the sheet draws it.
// Typed as its right half, mirrored, the crown lifted and the side drawn in on
// the left, and the cheeks rolled with the face. The crown's part under the
// topknot is hidden by it.
const headHalf: Node[] = [[0, -151.8], [-32.4, -146.8], [-37.6, -143.4], [-42.2, -139.6], [-46.2, -133.6], [-40.4, -135.3], [-33.8, -134.9],
  [-36.9, -129.4], [-41.6, -120.6], [-45.6, -114.4], [-47, -105], [-46.2, -97.4], [-43.4, -91.6], [-46, -87], [-46.8, -80.6],
  [-45, -74.4], [-40.2, -70], [-31, -64.2], [-9, -59.4]];
/**
 * The crown's overhang and the crescent's inner end, on the right: the lock's tip hanging just inside the ear's
 * edge, its underside arching over the root's tan to y -134.9, and the rounded turn into the face's side.
 */
const TEMPLE = [4, 5, 6];
/** Where each cheek's puff comes out from under the side's line: a concave corner. */
const PUFF = 12;
/**
 * The left temple, typed where the sheet draws it in place of the right's mirror: a shorter overhang, the crown
 * meeting the ear at (41, -140), its underside running in over the ear's tan at y -140.3 and the tan tapering
 * in under the crown's fur to a point at (28.2, -138.6), 4 pt higher and 5.6 pt further in than the right's;
 * from there the face's side runs down and out in one diagonal to (33.4, -130), where the sheet's line begins.
 */
const leftTemple: Node[] = [[41, -140], [34.4, -140.3], [28.2, -138.6], [33.4, -130]];
const mirroredHalf = mirrorX(headHalf, false).slice(0, -1);
// The mirror runs from the chin up to the crown, so the right's temple nodes come in reverse; the left's replace the
// face's side above the line, the turn, the lock's underside and its tip.
const at = mirroredHalf.length - TEMPLE[2]!;
const leftHalf = [...mirroredHalf.slice(0, at - 1).map(([x, y]): Node => leftSide([x, y])), ...[...leftTemple].reverse(),
  ...mirroredHalf.slice(at + TEMPLE.length + 1).map(([x, y]): Node => crownLift([x, y]))];
// The cheeks' puffs, and the inner end of each root's tan under the crown, a wedge pointing in under the crown's
// fur where the face's side comes down from it (concave corners, which the corner rule leaves alone).
const CORNERS = [PUFF, headHalf.length + headHalf.length - PUFF, TEMPLE[2]!, headHalf.length + 1 + at];
let head = smooth([...headHalf, [0, -58.4], ...leftHalf].map(([x, y]): Node => cheekRoll([x, y])), { typed: headHalf.length + 1 + leftTemple.length, corners: CORNERS });
// The cheeks' fluff, as the hero and the front turnaround draw it: each puff
// bulges out over the ear's inner foot and breaks along its outer and lower edge
// into a few round clumps of quite different sizes, each combed down and out to
// a soft point: the fullest high on the cheek, two smaller ones under it and a
// small hook where the cheek meets the neck; the two cheeks differ, as the
// sheet's do (on the left the second clump is the small one). Typed top to
// bottom; the path runs down the right cheek and up the left. And the chin hangs
// over the collar in a row of small soft tufts, uneven, combed out from its
// middle.
const cheekLocks = {
  R: [{ len: 1.3, w: 1.4, lean: 0.15 }, { len: 1.1, w: 1.1, lean: 0.2 }, { len: 1.25, w: 1.2, lean: 0.25 }, { len: 0.8, w: 0.85, lean: 0.3 }],
  L: [{ len: 1.4, w: 1.5, lean: 0.15 }, { len: 0.9, w: 0.9, lean: 0.2 }, { len: 1.2, w: 1.15, lean: 0.25 }, { len: 0.9, w: 0.9, lean: 0.3 }],
};
const chinLocks = [{ len: 0.6, w: 0.8, lean: -0.4 }, { len: 0.95, w: 1.1, lean: -0.3 }, { len: 0.65, w: 0.9, lean: -0.2 }, { len: 0.9, w: 1.2, lean: -0.05 },
  { len: 0.7, w: 1, lean: 0.1 }, { len: 0.95, w: 1.15, lean: 0.25 }, { len: 0.65, w: 0.85, lean: 0.4 }];
/** Each cheek clump's tip, root and notches (path order), for its line and the shade under it. */
const clumps: { tip: P; root: P; notches: [P, P] }[] = [];
const noteClump = (tip: P, root: P, notches: [P, P]) => clumps.push({ tip, root, notches });
head = furEdge(head, cheekRoll([-45, -89.2]), cheekRoll([-37.6, -68.8]), cheekLocks.R, 0.6, noteClump);
head = furEdge(head, cheekRoll([37.6, -68.8]), cheekRoll([45, -89.2]), lefthandOf(cheekLocks.L), 0.6, noteClump);
/** The chin's tufts' notches, in path order, for their lines. */
const chinTufts: [P, P][] = [];
head = furEdge(head, cheekRoll([-32.4, -65.4]), cheekRoll([32.4, -65.4]), chinLocks, 0.36, (_tip, _root, notches) => chinTufts.push(notches));
// The crown's fur where it overhangs each ear's root is a lock of fur, its tip a fur span, so the crown's line can
// run on round it into the ear's own line, unbroken, as the sheet draws it. Between the topknot and each ear the
// crown's outline breaks over a small lock of fur, as the sheet's does.
head = furSpan(furSpan(head, [-45, -135.6], [-44.4, -134.3]), [39.4, -140.4], [40.2, -141.6]);
const crownLocks = [{ len: 0.85, w: 1, lean: 0.35 }, { len: 0.55, w: 0.8, lean: 0.45 }];
head = furEdge(furEdge(head, [-35.6, -145.1], [-38.6, -142.6], crownLocks, 0.26), [38.4, -144.6], [35.4, -147], lefthandOf(crownLocks), 0.26);

// The topknot (parts/topknot.ts): three separate curls of fur, as the sheet draws them, back to front. The left
// curl low and broad, its crown at y -156.4, its pointed tip at the crown's line (-30.4, -150.2), where the line dips
// into a V and runs on along the curl's underside into the fur, and its other end tucking behind the middle one at
// the notch (-11.6, -153); the right curl a little higher (its crown at y -158), coming out from behind the middle one
// and ending in a V at (21.8, -153), where its underside's stroke runs back into the fur and the crown's line runs on
// down the head; and in front the middle curl, tall and round (its top at y -164.3, the head's highest point), its
// line dipping into the V at its left foot and on down into the fur, its right side coming down into the fur behind
// the right curl's start. Each curl's hidden foot runs along under the crown, feathered into it.
const TUFT_CREASE = uid("blur");
const CURLS: Curl[] = [
  { nodes: [[-30.4, -150.2], [-29.6, -152.8], [-27, -155], [-22.8, -156.3], [-18.2, -156.4], [-14.4, -155.4], [-11.6, -153], [-9.4, -149.6], [-13, -146.6],
    [-22, -146.4], [-27.6, -148.4]],
    line: { from: [-30.2, -150.4], to: [-11.6, -153], taper: [0.6, 1] }, into: [[[-30.6, -150.5], [-27.4, -149.9], [-23.6, -149.4]]], tip: [[-29.6, -149.4], [-30.8, -151.2]] },
  { nodes: [[3, -152], [5.4, -155.8], [8.8, -157.6], [13.2, -158], [17.6, -157.2], [20.6, -155.6], [21.8, -153], [21.2, -150.6], [16, -148.6], [8, -147.6]],
    line: { from: [5.2, -155.6], to: [21.2, -150.8], taper: [1, 0.4] }, into: [[[22, -152.9], [19.2, -152.6], [15.4, -152.2]]], tip: [[22, -153.8], [21.6, -151.6]] },
  { nodes: [[-11.8, -152.6], [-10.4, -156.8], [-7.6, -160.6], [-3.6, -163.4], [0.4, -164.3], [3.4, -163.4], [5.2, -161], [5.8, -158], [4.8, -155.2], [2.4, -151],
    [-4, -147], [-10, -148]],
    line: { from: [-11.8, -152.6], to: [3.6, -152.8], taper: [0.6, 2.4] },
    // A soft crease of the fur's tan down its lower middle, where the curl turns, as the sheet paints it.
    under: `<defs>${blur(TUFT_CREASE, [-8, -162, 10, 16], 0.7)}</defs>` +
      `<path d="${strokeOf([[-1.4, -158], [-2.6, -154], [-3.8, -150.4]], 1.8, { taper: 2.4, tip: 0.3 }).d}" fill="${C.marking}" opacity="0.3" filter="url(#${TUFT_CREASE})"/>`,
    into: [[[-12, -152.9], [-11.2, -151.4], [-10, -150.2]]] },
];
const tuftShapes = curlShapes(CURLS);

// The head patches, as the sheet paints them: a rounded hood over the top and outer side of each eye, its top edge
// one soft arch about 9 pt above the eye with the brow in the cream above it, breaking into a few short uneven tufts of
// fur where it meets the forehead's cream, its nose end coming down round the eye's inner top to about level with the
// eye's top, so a little cream shows between it and the inner half of the eye's rim (the sheet's ends at x -19.5 and
// 12.5); and a band of the same tan down the face's side, inside its line, from where the ear's root shows under the
// crown down to the cheek's puff. Between the two a strip of cream comes down from the forehead round the hood's outer
// top to a point about level with the hood's top (a concave corner at its tip); on the dog's left the hood rises
// smoothly into the root's tan. Below the eye and the hood the face is cream. Each is one even pale tan, as the front crop
// paints it (L* 80 to 81 by the eye and by the ear alike). Typed per side, as the sheet draws them (the left about 3 pt higher, with the
// head's roll), with about 4 pt of bleed past the head's edge; the eye covers what is typed under it. Their edges are
// soft but defined: a sigma of 0.55 pt.
const patches = {
  R: furEdge(smooth([[-43.4, -91.2], [-49.6, -91.4], [-50, -106], [-48.6, -124], [-44.4, -130.6], [-41.6, -130], [-40.2, -127], [-40.8, -123.4], [-40.4, -120.6],
    [-37.8, -119.2], [-33.6, -119.4], [-29.2, -119.6], [-25.4, -118.8], [-22.2, -116.8], [-20, -113.6], [-19.2, -109], [-20.6, -100], [-27, -94], [-33.4, -91.4],
    [-38.4, -90.8]]), [-37.6, -119.2], [-22.6, -117.2], [{ len: 1, w: 1, lean: 0.3 }, { len: 1.5, w: 1.3, lean: 0.25 }, { len: 0.8, w: 0.8, lean: 0.3 }, { len: 1.3, w: 1.1, lean: 0.35 }], 0.35),
  L: furEdge(smooth([[43.6, -94.6], [49, -94.4], [49.4, -110], [44.6, -125], [39.4, -131.8], [34, -131.6], [30.6, -127.6], [28.6, -123.8], [25.4, -122], [21, -121.4],
    [17.2, -119.4], [14.4, -115.6], [12.8, -110.6], [13.2, -104], [18, -96.6], [28, -95.2], [34.4, -95.6], [39.6, -95]]), [27.6, -123.2], [15.4, -117.4],
  [{ len: 1.2, w: 1.1, lean: 0.3 }, { len: 0.8, w: 0.8, lean: 0.25 }, { len: 1.5, w: 1.3, lean: 0.3 }, { len: 1, w: 0.9, lean: 0.35 }], 0.35),
};
/** Each hood's end toward the nose softens a little more than its edge, as the sheet's does. */
const patchFade = { R: { from: [-21.4, -110.4], to: [-18.6, -109.6] }, L: { from: [16.2, -112], to: [12.4, -111] } } satisfies Record<string, Fade>;
// The saddle's two halves where they show from the front, as the sheet paints them. The right half runs down the
// shoulder from under the collar's end as a narrow strip of tan along the line, and opens into a round soft patch
// over the outer thigh, out to the front leg's line (x -34.6 at y -30, the sheet's tan reaches x -34 there) and down
// behind the hind paw, as the sheet paints it, never a wedge with a straight inner edge. The left half is a narrow
// streak down the shoulder from under the collar's end, outside the front leg's line (the sheet's, x 36 to 41 from y
// -47 to -32), running out to a point at the top of the haunch, whose round is cream.
const saddleR = smooth([[-27, -64.2], [-31.6, -63.4], [-37.4, -55], [-43, -46], [-53, -36], [-54, -20], [-52, -10], [-44, -8], [-37, -12], [-36.2, -16],
  [-37.2, -19.8], [-36.2, -24], [-34.6, -29], [-34.4, -34], [-35.4, -38.4], [-35.2, -41.8], [-33.2, -46.2], [-31, -51.4], [-29.4, -57]]);
const saddleL = smooth([[27, -64.2], [31.6, -63.4], [36.2, -55.6], [38.8, -47.4], [40.2, -41], [40.6, -36.2], [40.2, -32.4], [39.2, -29.6], [37.8, -31.8], [36.6, -36.8],
  [35, -44], [32.6, -51], [29.6, -57.6]]);

// Paint.

// The one highlight: a small soft patch on the crown's left, toward the light, so the crown keeps its warm cream,
// and the cheeks' puffs out to their rims, which the sheet paints whitest at their outer edge, rim-lit against the ear.
const headLight = "M-27 -145 C-19 -151 -6 -151 -1 -146 C-4 -139 -17 -137 -25 -140Z " +
  "M-48 -82 C-47 -87.6 -42 -89 -37.6 -86.8 C-36.4 -81.6 -38.4 -75.6 -42.6 -72.6 C-46 -73.6 -48.4 -77.4 -48 -82Z " +
  "M48 -86.6 C47 -92.2 42 -93.6 37.6 -91.4 C36.4 -86.2 38.4 -80.2 42.6 -77.2 C46 -78.2 48.4 -82 48 -86.6Z";
const furShade = (group: Shape[], shapes: string[] = [], keep: string[] = [], rim = { inset: 2.5, toLight: 4 }) =>
  ({ multiply: C.furShadeBy, rim, shapes, keep, group, blur: 2.4 });
const bodyGroup = [chest, legs.R, legs.L];
const hipGroup = [back, hind.R, hind.L];
const headGroup = [head, ...tuftShapes];

const backPaint: Paint = { fill: C.fur, shade: furShade(hipGroup) };
/**
 * The back's line (parts/lines.ts): from under each collar's end down the shoulder and round the haunch. On the right
 * the saddle's tan reaches the line from the shoulder all down the haunch, so the line runs on the tan there; on the
 * left the tan streak lies along the shoulder only, and the haunch's line is the cream's, as the sheet draws them
 * (#A56F50 to #B67F5B on the right haunch, #B19378 to #B79277 on the left).
 */
const backLines: LitSpan[] = [{ from: [-29.2, -61.4], to: [-47.4, -11], on: "tan", taper: 6 },
  { from: [47.4, -11], to: [38.6, -38], taper: 6 }, { from: [40.2, -40.6], to: [29.2, -61.4], on: "tan", taper: 6 }];
const headPaint: Paint = {
  fill: C.fur,
  // Under the jaw, where the head turns under toward the collar; a faint wash in each hood just over the eye,
  // under the brow's overhang, where the sheet's tan deepens (#ECB888 against the hood's #F0BC92).
  shade: furShade(headGroup, ["M-38 -66 C-28 -61.2 -14 -59.2 0 -59.2 C14 -59.2 28 -61.2 38 -66 L46 -56 L-46 -56Z",
    ...[EYE_R, EYE_L].map(([x, y]) => `M${fmt(x - 8)} ${fmt(y - 9.6)} a8 2 0 1 0 16 0 a8 2 0 1 0 -16 0Z`)],
    // The crown stays light right out to its line, as the sheet paints it, the overhangs over the ears' roots
    // included; and so do the cheeks' puffs out to their rims, above the jaw.
    ["M-52 -172 L52 -172 L52 -137 L-52 -137Z", "M-52 -95 L-36 -95 L-36 -72 L-52 -72Z", "M52 -99 L36 -99 L36 -76 L52 -76Z"], { inset: 3, toLight: 4.5 }),
  highlight: { d: headLight, colour: C.light, opacity: 0.4, blur: 4 },
};
/**
 * The head's line (head.line), where the sheet draws one, by the dog's one line rule (parts/lines.ts, DECISIONS 74):
 * on the crown's fur one light line from the topknot down to just short of the overhang's tip, where the ear's own
 * line takes over; down each side, where the face lies over the ear, one round curve on the tan, deep where the face
 * tucks over the ear (the sheet's #9E5C2C there, DECISIONS 7), ending where the cheek's puff comes out over it; and
 * at each jaw's corner, where the cheek's last clump meets the collar's end, a short deep stroke under it. Over the
 * temples' tan and under the overhang the sheet draws no line; under the chin's tufts the collar's own dark rim
 * (chinOnCollar) is the edge.
 */
const headSpans: LitSpan[] = ([
  { from: [-39.9, -123.8], to: [-44.8, -93.2], on: "tan", under: 0.6, taper: 4 },
  { from: [44.4, -93.2], to: [33.7, -129.4], on: "tan", under: 0.6, taper: 4 },
  { from: [-37.8, -69], to: [-31.4, -64.6], under: 0.35, taper: [1, 2.6] },
  { from: [31.4, -64.6], to: [37.8, -69], under: 0.35, taper: [2.6, 1] },
] as LitSpan[]).map((span): LitSpan => ({ ...span, from: cheekRoll(span.from as P), to: cheekRoll(span.to as P) }));
/**
 * The crown's line, from under the topknot's side lobes over the crown's small lock and round the overhang's tip,
 * where it runs on into the ear's own line: its ends barely taper (the topknot hides the inner one), so the ear's
 * line, coming out from under the overhang at full width, takes it up with no pinch.
 */
const crownSpans: LitSpan[] = [{ from: [-24, -149.2], to: [-45.6, -134.6], taper: 1.4 }, { from: [40.8, -140.3], to: [19, -150.6], taper: 1.4 }];
/**
 * The cheeks' lines, as the sheet draws them: a thin, pale line round each clump, from the notch above it over its tip
 * and down into the notch below, tapering out at both, so the line breaks where the fur parts and the edge reads as
 * clumps of fur, not a cookie-cutter row; on the cream ladder, the fur's own pale warm line, never a dark chip on the
 * ear's tan. And in each of the fuller clumps one fine fur stroke, combed with it from inside the cheek out toward
 * its tip.
 */
function cheekLines(): { spans: LitSpan[]; strokes: P[][] } {
  const spans: LitSpan[] = clumps.map(({ notches }) => ({ from: notches[0], to: notches[1], taper: 1.6 }));
  const strokes = clumps.filter(({ tip, root }) => v.len(v.sub(tip, root)) >= 1.9).map(({ tip, root, notches }) => {
    // The path runs down the right cheek and up the left, so a clump's lower notch is its second on the right.
    const below = tip[0] < 0 ? notches[1] : notches[0];
    const along = v.sub(tip, root), aside = v.mul(v.sub(below, root), 0.3);
    return [v.add(v.add(root, v.mul(along, -0.9)), v.mul(aside, 0.7)), v.add(v.add(root, v.mul(along, -0.15)), v.mul(aside, 1.05)), v.add(v.add(root, v.mul(along, 0.55)), v.mul(aside, 0.85))];
  });
  return { spans, strokes };
}
/** head.line: the head's outline as its own unclipped region, drawn after the head's clip group, reaching 0.5 pt past the head. */
function headLinePiece(): Piece {
  const [x0, y0, x1, y1] = bbox(head.segs);
  // Room for the feathered cream round the cheeks' fluff, which reaches 3.8 pt past the head (half its width and
  // three times its blur), so the region's canvas holds all of it.
  const box = pad([x0, y0, x1 - x0, y1 - y0], 4);
  const cheeks = cheekLines();
  const r = litEdge(head, [...headSpans, ...crownSpans], "head.line", box, { reach: 0.5 });
  const c = litEdge(head, cheeks.spans, "cheek clump", box, { reach: 0.5, blur: 0.2 });
  const strokes = cheeks.strokes.map((pts) => innerLine(pts, 0.7, C.puffLine, { opacity: 0.45, taper: 1.4, tip: 0.15 }));
  const g = uid("blur");
  // Where the crown's fur and the face meet the ears' tan at the temples with no line, the sheet's edge is soft:
  // the crown's cream fur lies out over the root's tan in a feathered edge, softly along the underside of the
  // overhang and more broadly (about 3 pt from tan to cream) round the tan's inner end and down the face's side
  // to where its line begins, so the root's tan tucks in under the cream with no cut edge and no corner.
  const s = uid("blur");
  const feathered = (spans: [P, P][], width: number, offset = 0) => spans.map(([a, b]) =>
    strokeOf(spanPoints(head, fracAt(head, cheekRoll(a)), fracAt(head, cheekRoll(b))), width, { taper: 3, tip: 0.4, offset }).d).join("");
  // Under the right overhang the root's tan fades up into the cream; on the left the sheet's tan runs up to the crown.
  const under = feathered([[[-45.4, -134.6], [-34.6, -135]]], 2.6, 0.8);
  const side = feathered([[[-34.4, -134.4], [-41.4, -121.4]], [[39.2, -123.4], [31.6, -139.2]]], 3);
  return piece(`<defs>${r.defs}${c.defs}${blur(g, pad(box, 2), 0.35)}${blur(s, pad(box, 2), 0.9)}</defs>` +
    `<path d="${under}" fill="${C.fur}" opacity="0.95" filter="url(#${s})"/><path d="${side}" fill="${C.fur}" opacity="0.9" filter="url(#${s})"/>` +
    `${r.body}${c.body}<g filter="url(#${g})">${strokes.map((l) => l.svg).join("")}</g>`, box, {
    shapes: [{ name: "head.line", nodes: head.typed, segs: head.segs, outlined: [...r.outlined, ...c.outlined], fur: head.fur.map(([a, b]) => [fracAt(head, a), fracAt(head, b)]) }],
    lines: [...r.lines, ...c.lines, ...strokes.map((l) => ({ ...l.line, where: "cheek fur" }))],
  });
}

/**
 * An open eye at its landmark, by the dog's one eye recipe (parts/eye.ts, DECISIONS 73), shaped as this crop draws
 * it: an oval a little taller than it is wide (the sheet's dark eye fits 18.5 by 19.5 pt), its top turned 20° toward
 * the nose and rolled with the face; the white a crisp sliver low on the outer side, about 1.6 pt at its widest (the
 * sheet's 1.5 to 1.9), from a little above the outer side's level to below its foot; the catchlight where the
 * sheet's sits, high on the nose's side. `noseward` is +1 when the nose is to its right.
 */
function eyeSpec(landmark: P, noseward: 1 | -1): EyeSpec {
  const out = -noseward;
  // The ball sits a hair out from the landmark and 0.45 pt below it, so the dark eye's own centre (DECISIONS 10)
  // lands on the landmark with the eye's foot where the sheet's is.
  const centre: P = [landmark[0] + out * 0.65 * cosR - 0.6 * sinR, landmark[1] + out * 0.65 * sinR + 0.6 * cosR];
  return {
    centre, rx: 9.5, ry: 9.2, turn: 20 * noseward + ROLL_DEG, noseward,
    rim: { top: 1.3, side: 1, foot: 0.7 },
    lid: { from: -18, to: 122, width: 1.8, flick: 0.25 },
    white: { at: -28, width: 1.4, span: 32, fade: 0.6 },
    shine: { at: [2.3, 5.1], r: 1.8 },
    // The front crop's glow is the narrowest, right along the foot (its L* 27 to 30 within 2 pt of it).
    glow: { band: 5.6, warm: 1.8 },
  };
}
const eye = (landmark: P, noseward: 1 | -1): Piece => sharedEye(eyeSpec(landmark, noseward));

/**
 * The nose in the face frame, as the turnaround, the blush-cheeks panel and the hero draw it: a wide rounded
 * inverted triangle, its top nearly flat, broadest near its top with round shoulders (the sheet's is 12.5 pt wide
 * there and about 7.4 pt tall), its sides running in straight to a small round point that runs on into the
 * philtrum's top; near-black at its edge, warming a little to the printed dark brown in its middle, as the
 * turnaround paints it, and a soft grey-brown sheen across its upper left, as the hero paints it.
 */
const noseShape = symmetric([[0, 4.2], [-2.6, 4.25], [-4.6, 4.6], [-5.9, 5.3], [-6.45, 6.3], [-6.3, 7.5], [-5.6, 8.8], [-4.3, 10.1], [-2.7, 11.1], [-1.2, 11.65]],
  [0, 11.8]);
function nose(): Piece {
  const f = uid("blur"), g = uid("blur"), box: Box = [-8, 2, 16, 13];
  return piece(FRAME.place(`<defs>${blur(f, box, 0.7)}${blur(g, box, 1.1)}</defs><path d="${pathD(noseShape.segs)}" fill="${C.eyeDark}"/>` +
    `<ellipse cx="0.2" cy="8.2" rx="3.3" ry="1.9" fill="${C.dark}" opacity="0.55" filter="url(#${g})"/>` +
    `<ellipse cx="-1.3" cy="6.05" rx="2.9" ry="1.05" transform="rotate(-6 -1.3 6.05)" fill="${C.noseSheen}" opacity="0.8" filter="url(#${f})"/>`), FRAME.box(box));
}

/** A blush in the face frame, under the eye's outer side: an ellipse turned with the face. */
function blush(sx: number): Piece {
  const [cx, cy] = face([sx * 30, 13.4]);
  // As compact as the sheet's (its pink covers about 40% of what a 7 by 4.4 pt blush does), so the cream just under
  // the eye stays clear.
  const rx = 5.8, ry = 3.6;
  const [dx, dy] = [rx * cosR, rx * sinR], deg = r3((ROLL * 180) / Math.PI);
  const d = `M${r3(cx - dx)} ${r3(cy - dy)} a${rx} ${ry} ${deg} 1 0 ${r3(2 * dx)} ${r3(2 * dy)} a${rx} ${ry} ${deg} 1 0 ${r3(-2 * dx)} ${r3(-2 * dy)}Z`;
  // The blur takes the small blush's peak down by about a fifth: painted that much stronger, its core reads at the resting level.
  return soft(d, [cx - rx - 0.5, cy - ry - 0.6, 2 * rx + 1, 2 * ry + 1.2], C.blush, 2.2, Math.round(model.blush.restingLevel * 1.28 * 100) / 100);
}

/**
 * The tag and the ring it swings from, which the turnaround paints blue on the blue collar. The heart is painted by
 * the dog's one tag recipe (parts/tag.ts): matte gold inside a warm gold-brown line, warming toward orange in its soft
 * shade along its lower right, one soft light high on its left lobe, and two smaller hearts embossed in it as
 * concentric warm rings, as the sheet draws them. No bevel, no glint.
 */
function tagPiece(): Piece {
  // The ring's edge is a plain stroke, drawn exactly as wide as it is declared.
  const ringLine: DrawnLine = { kind: "inner", width: 0.6, where: "tag ring", drawn: [0.6, 0.6] };
  // It runs down into the heart's cleft, so the heart hangs from it with no gap between the lobes.
  const ring = piece(`<rect x="-0.9" y="-57.2" width="2.8" height="8.6" rx="1.4" fill="${C.collar}" stroke="${C.collarRim}" stroke-width="${ringLine.width}"/>` +
    `<rect x="-0.2" y="-56.6" width="0.8" height="6.6" rx="0.4" fill="${C.collarHighlight}"/>`, [-2, -58, 5, 10.4], { shapes: [], lines: [ringLine] });
  // Matte gold, warming toward orange along its lower right, one small soft light high on its left lobe, and the two
  // smaller hearts embossed in it as concentric warm rings (parts/tag.ts).
  return join(ring, part("tag", heart, tagPaint({ emboss: embossed, light: "M-7 -48.2 a2.4 1.6 -35 1 0 4.8 0 a2.4 1.6 -35 1 0 -4.8 0" })));
}

/**
 * An ear's paint, by the dog's one ear recipe (parts/ear.ts, DECISIONS 76), as the front crop paints it: the tan
 * lighter toward the root and the lit upper outer side, deepening down the ear to a browner tan at its lower clumps
 * (the sheet's #E09B6C mid-ear to #C17D50 and #BC7847 at the bottom); five long locks curving with the ear's bulge
 * from its upper middle down into its lower edge, the outer two into the dips between its three clumps; and the
 * shade on the rim away from the light, along the inner edge where the ear tucks under the head, where the cheek's
 * fluff hangs over it and across the root under the crown's overhang. Typed on the dog's right ear in the head's
 * frame and placed on either ear.
 */
function earPaint(side: "L" | "R"): Paint {
  const on = (p: P) => onEar(side, p);
  // Five locks of uneven length coming in from about the ear's middle and curving with its outer bulge down into its
  // lower edge, the outer two into the dips between its clumps, a short one in the outer clump.
  const locks: P[][] = [
    [[-69.4, -104], [-74, -96], [-76.4, -87.4], [-76.6, -79.6]],
    [[-62.6, -99], [-66.4, -90], [-67.8, -80], [-67, -70.6]],
    [[-56.8, -92], [-59, -83], [-59.4, -74], [-58.4, -65.8]],
    [[-50.6, -86], [-51.6, -78.6], [-51.2, -71.4]],
    [[-72.4, -89], [-73.4, -82.6], [-72.6, -76.8]],
  ];
  const shadeD = "M-90 -92 C-80 -80 -62 -72 -40 -70 L-40 -50 L-90 -50Z";
  const cheekD = "M-38 -98 C-43 -93 -48.6 -85 -49.8 -74 C-49 -66 -45 -62 -40 -60Z";
  // Along the inner edge, where the ear tucks under the head's side; and the crown's soft contact shadow across
  // the root's tan, right under the overhang's fur.
  const innerD = "M-44 -128 C-48.4 -118 -49.4 -104 -48.8 -94 L-43 -94 L-43 -128Z";
  const rootD = "M-54 -140 L-26 -140 L-27 -132.6 C-35 -132.2 -45 -131.8 -54 -130.6Z";
  return earFur({
    ear: ears[side],
    axis: [on([-58, -124]), on([-60, -62])],
    deepen: [0.3, 1],
    locks: locks.map((pts) => pts.map(on)),
    dips: ([[-66.6, -69.4], [-76.2, -78.2]] as P[]).map(on),
    // A soft sheen down the upper outer side, where the light falls.
    light: earD(side, "M-77 -97 C-76 -106 -69 -116 -61 -123 C-57 -122 -59 -115 -63.6 -108 C-67.6 -102 -72 -97 -77 -97Z"),
    under: [earD(side, shadeD), earD(side, cheekD), earD(side, innerD), earD(side, rootD)],
  });
}

/**
 * An ear's line (parts/lines.ts), on the tan: from where it comes out from under the cheek, round its foot and up its
 * outer side to its root, where it goes on under the crown at full width, so the crown's line runs on into it.
 */
function earSpans(side: "L" | "R"): LitSpan[] {
  const ends: [P, P] = [onEar(side, [-41.6, -67.2]), onEar(side, [-38.6, -140.6])];
  // Its foot, where it hangs over the shoulder, is a place under the head: deepest there (the sheet's #8A5334).
  const foot = (p: P) => Math.min(0.8, Math.max(0, (p[1] + 72) / 6) * 0.8);
  // Its inner edge, from under the crown down behind the face to just above where it comes out under the cheek:
  // hidden at rest, it shows where a lifted ear swings out from the cheek (DECISIONS 132), in the line of an ear tucked
  // under the head. It starts below the root's tight inner corner, which stays under the crown.
  const inner: [P, P] = [onEar(side, [-28.6, -129]), onEar(side, [-40.4, -71.6])];
  return side === "R"
    ? [{ from: ends[0], to: ends[1], on: "tan", under: foot, taper: 7 }, { from: inner[0], to: inner[1], on: "tan", under: 0.5, taper: [4, 6] }]
    : [{ from: ends[1], to: ends[0], on: "tan", under: foot, taper: 7 }, { from: inner[1], to: inner[0], on: "tan", under: 0.5, taper: [6, 4] }];
}

/**
 * Between the front legs the sheet paints a narrow warm-tan V, its point at the top: nothing at its top, about 32 pt
 * up just under the tag, where it fades up into the chest's cream with no edge, then deepening down the narrowing slot
 * between the legs (whose inner edges lie over its sides) to a deep warm tan between the paws, as the sheet's does
 * (L* 88 at y -22, 73 at -14 and 64 at -8). No line runs down its middle and nothing marks its top.
 */
function between(): string {
  const g = uid("between"), f = uid("blur");
  const v = smooth([[0, -34], [4, -30], [5, -24], [3.6, -14], [1.8, -5], [0, -2.4], [-1.8, -5], [-3.6, -14], [-5, -24], [-4, -30]]);
  return `<defs><linearGradient id="${g}" gradientUnits="userSpaceOnUse" x1="0" y1="-32" x2="0" y2="-2.4">` +
    `<stop offset="0" stop-color="${C.marking}" stop-opacity="0"/><stop offset="0.12" stop-color="${C.marking}" stop-opacity="0.35"/>` +
    `<stop offset="0.35" stop-color="${C.marking}" stop-opacity="0.6"/><stop offset="0.58" stop-color="${C.marking}" stop-opacity="0.85"/><stop offset="0.8" stop-color="${C.earDeep}" stop-opacity="0.9"/>` +
    `<stop offset="0.94" stop-color="${C.earDeep}" stop-opacity="0.8"/><stop offset="1" stop-color="${C.earDeep}" stop-opacity="0.2"/></linearGradient>` +
    `${blur(f, [-12, -36, 24, 36], 1)}</defs>` +
    `<path d="${pathD(v.segs)}" fill="url(#${g})" filter="url(#${f})"/>`;
}

/**
 * The chin's shadow on the collar (spec L396, DECISIONS 33), a part of its own on the head bone, clipped to the
 * collar, so it moves with the head and never leaves the band: where the chin's fur lies on the collar, as the
 * sheet paints it, the collar's dark rim right under the fur's edge, following its tufts, and a soft shade of the
 * band's own blue under that. Drawn centred on the chin's edge (the head's own path), so only its lower half shows
 * below the fur.
 */
function chinOnCollar(): Piece {
  const f = uid("blur"), g = uid("blur"), box: Box = [-34, -70, 68, 24];
  const chin = spanPoints(head, fracAt(head, cheekRoll([-32.4, -65.4])), fracAt(head, cheekRoll([32.4, -65.4])));
  const rim = strokeOf(chin, 2.1, { taper: 2.5, tip: 0.6 }).d;
  const shade = strokeOf(chin, 5, { taper: 4, tip: 1 }).d;
  return piece(`<defs>${blur(f, box, 0.3)}${blur(g, box, 0.9)}</defs>` +
    `<path d="${shade}" fill="${C.collarLine}" opacity="0.45" filter="url(#${g})"/><path d="${rim}" fill="${C.collarRim}" opacity="0.9" filter="url(#${f})"/>`, box);
}

export function front(): Drawn[] {
  const out: Drawn[] = [];
  const add = (name: string, p: Piece, state?: string) => out.push({ part: name, piece: p, ...(state ? { state } : {}) });
  // The ground shadow, and a soft contact shadow a little deeper under each paw where it sits.
  // The sheet's is a wide soft warm oval centred a little under the ground line, densest just below the paws.
  add("shadow", join(soft("M-62 -1.4 a62 4.8 0 1 0 124 0 a62 4.8 0 1 0 -124 0Z", [-62, -6.2, 124, 9.6], C.shadow, 2.4),
    soft("M-44 0.2 a44 2.6 0 1 0 88 0 a44 2.6 0 1 0 -88 0Z", [-44, -2.4, 88, 5.2], C.shadow, 1.8, 0.6),
    ...[-1, 1].flatMap((sx) => [
      soft(`M${sx * 15.6 - 12} -0.6 a12 1.8 0 1 0 24 0 a12 1.8 0 1 0 -24 0Z`, [sx * 15.6 - 12, -2.4, 24, 3.6], C.contact, 1.2, 0.7),
      soft(`M${sx * 38.4 - 8} -2 a8 1.6 0 1 0 16 0 a8 1.6 0 1 0 -16 0Z`, [sx * 38.4 - 8, -3.6, 16, 3.2], C.contact, 1.2, 0.6),
    ])));
  add("body.back", litPart("body.back", back, backPaint, backLines));
  add("back.patch.R", litMarking("back.patch.R", { shape: back, paint: backPaint, spans: backLines }, saddleR, { fill: C.marking, blur: 1.4 }));
  add("back.patch.L", litMarking("back.patch.L", { shape: back, paint: backPaint, spans: backLines }, saddleL, { fill: C.marking, blur: 1.3, fade: { from: [38, -40], to: [39.4, -29.4] } }));
  for (const side of ["R", "L"] as const) {
    const sx = side === "R" ? -1 : 1, cx = sx * 37.6, cy = -10.9;
    add(`hind.${side}`, roomy(litPart(`hind.${side}`, hind[side], {
      fill: C.fur,
      shade: furShade(hipGroup, [], [`M${cx - 12} ${cy - 12} L${cx + 12} ${cy - 12} L${cx + 12} ${cy - 4} L${cx - 12} ${cy - 4}Z`]),
      // Two toe lines rising from the sole's dips about 6 pt up the paw's front, each bowing away from the middle toe,
      // as the sheet draws them, so the paw reads as three round toes (parts/paw.ts).
      ...toes({ lines: ([[[-41.6, -3.6], [-42.3, -5.8], [-42.2, -8], [-41.4, -9.8]], [[-35.6, -3.3], [-35, -5.4], [-35.1, -7.6], [-35.8, -9.4]]] as P[][])
        .map((pts) => flipX(pts, side)), fade: [-3.4, -10] }),
    // A bun closed all round where it shows, as the sheet draws it: its line comes out from behind the front paw over
    // its top, where it lies on the haunch, runs on unbroken down its outer side and under its sole to where it goes
    // behind the front paw again, deepening to the darkest where it sits on the ground (parts/lines.ts).
    }, litSide(side, [{ from: [-31.4, -16.2], to: [-29.2, -4.6], taper: [3, 4] }])), 6));
  }
  // Its canvas a point roomier than the chest, so the light group's shade, which reaches 13.7 pt past it, stays
  // inside the paint's reach when the chest's top lands on a whole point.
  add("body.front", roomy(part("body.front", chest, {
    fill: C.fur,
    // The shade falls under the chin, just below the collar.
    shade: furShade(bodyGroup, ["M-22 -52 C-10 -48 10 -48 22 -52 L22 -58 L-22 -58Z"]),
    under: between(),
    // A few soft fur strokes on the bib, combed down from under the collar's ends and the tag, as the sheet draws them.
    inner: ([[[-23.4, -47], [-21.8, -42.4], [-21, -38.2]], [[23.4, -47.6], [21.8, -43], [21.2, -38.8]], [[-17.6, -44.6], [-16.6, -41], [-16.2, -38]],
      [[17.6, -45.2], [16.6, -41.6], [16.4, -38.6]], [[-6.4, -34.6], [-5.4, -31.8]], [[6.6, -34.6], [5.6, -31.8]]] as P[][])
      .map((pts) => ({ pts: sample(smooth(pts, { closed: false }).segs, 6, false), width: 0.75, colour: LINES.cream[2]!, opacity: 0.4 })),
    // Its edge lies on the saddle's tan inside the silhouette, with no line, as the sheet paints it; no lines beside
    // the tag, and nothing marks the V's top, which fades up into the chest's cream.
  }), 1));
  // The chin's and the cheeks' shadow on the chest, cast by the head (spec L396): a soft band under the jaw's
  // scalloped edge, about 3 pt deep, falling on the shoulders' fur beside the collar's ends (the collar hides the
  // middle of it). Typed in the head's frame, as its jaw is, and rolled with it.
  const jawShade = ([[-42, -71.6], [0, -61.6], [42, -71.6], [40.4, -66.6], [31, -61.6], [21, -58.6], [9, -56.4], [0, -55.8], [-9, -56.4], [-21, -58.6],
    [-31, -61.6], [-40.4, -66.6]] as P[]).map(cheekRoll);
  add("shadow.chin", soft(pathD(smooth(jawShade, { corners: [0, 2] }).segs), [-43, -74.6, 86, 20], C.furShade, 1.3));
  // The collar (the sheet's paint): the band's blue, lit along its middle; the keeper the tag's ring hangs from;
  // and a dark blue rim all round its lower edge and its ends (#597C8F on the sheet), tucked under the cheeks' fur
  // at the top. The chin's shadow on it is its own part (chinOnCollar), cast by the head.
  add("collar", part("collar", collar, {
    fill: C.collar,
    // The band's lower part in its shade, turning under toward the chest, and a lighter band along its top where
    // it faces the light, as the sheet paints it; its blue between them.
    shade: { multiply: C.shadeBy, shapes: ["M-32 -58.6 C-16 -50.4 16 -50.4 32 -59.6 L32 -46 L-32 -46Z"], blur: 1.5 },
    highlight: { d: "M-22 -61.4 C-11 -58.4 10 -58.4 22 -62.8 L22 -60.2 C10 -56.2 -11 -56.2 -22 -59Z", colour: C.collarHighlight, opacity: 0.35, blur: 0.8 },
    under: `<rect x="-1.5" y="-60" width="4.4" height="10.4" rx="1.2" fill="${C.collarLine}" opacity="0.3"/>`,
    outline: { colour: C.collarRim, width: THIN, taper: 3, blur: 0.2, spans: [{ from: [26.2, -64], to: [-26.2, -62.7] }] },
  }));
  add("shadow.chin.collar", chinOnCollar());
  add("tag", tagPiece());
  for (const side of ["R", "L"] as const) add(`ear.${side}`, litPart(`ear.${side}`, ears[side], earPaint(side), earSpans(side)));
  add("head.base", part("head.base", head, headPaint));
  for (const side of ["L", "R"] as const) {
    // One even pale tan from the eye to the ear's root, as the front crop paints it (L* 80 to 81 by the eye and by the
    // ear alike).
    add(`head.patch.${side}`, marking(`head.patch.${side}`, { shape: head, paint: headPaint }, patches[side], { fill: C.patch, blur: 0.55, clip: false, fade: patchFade[side] }));
  }
  add("blush.L", blush(1));
  add("blush.R", blush(-1));
  add("eye.L", eye(EYE_L, -1), "open");
  add("eye.R", eye(EYE_R, 1), "open");
  add("brow.L", brow("neutral", 1, FRAME).piece);
  add("brow.R", brow("neutral", -1, FRAME).piece);
  add("nose", nose());
  add("mouth", mouth("open", FRAME).piece, "open");
  add("head.line", headLinePiece());
  add("tuft", topknot(CURLS, {
    fill: C.fur,
    highlight: { d: headLight, colour: C.light, opacity: 0.4, blur: 4 },
    feather: { from: [0, -146.5], to: [0, -150.5] },
  }));
  for (const side of ["R", "L"] as const) {
    const sx = side === "R" ? -1 : 1;
    // No line runs down the leg's outer side from the collar: the shoulder's fur meets the leg with no line, as the
    // sheet paints it. The leg's lines change with the light, as the sheet's do: a fine warm line comes in from
    // nothing at the V's point and runs down the leg's inner side (the sheet's #AE7C58 low down); under the paw the
    // darkest line of the figure, the sole's (the sheet's #7B5330 to #835C3C), dipping at the toes; and up the
    // paw's outer side a warm line that lightens past the wrist and fades out below the shoulder, the fine line
    // the sheet draws between the leg and the haunch.
    // The one soft light on the leg's front, toward the light, so its cream is never one flat fill (the sheet's
    // varies by about 2 L* down the leg); the shade along its inner side, where it turns into the V; and no shade
    // band along the sole, whose line alone marks the paw's foot.
    const litX = side === "R" ? -19 : 13;
    // Two toe lines rising from the sole's dips about 5.5 pt up the paw's front, each bowing a little away from the
    // middle toe, as the sheet, the paw-stub and the stubby-paws panels draw them (parts/paw.ts).
    const toeLines = toes({ lines: ([[[-11.2, -1.2], [-10.6, -3.4], [-10.8, -5.4], [-11.6, -6.9]], [[-20.8, -1.2], [-21.4, -3.4], [-21.2, -5.4], [-20.4, -6.9]]] as P[][])
      .map((pts) => flipX(pts, side)), fade: [-1.2, -7] });
    add(`front.${side}`, litPart(`front.${side}`, legs[side], {
      fill: C.fur,
      shade: furShade(bodyGroup, [polyD(flipX([[-5, -26], [-4.2, -20], [-3, -12], [-2.2, -6], [-1.2, -6], [-2, -12], [-3, -20], [-3.8, -26]], side))],
        ["M-40 -60 L40 -60 L40 -36 L-40 -36Z", "M-40 -3.4 L40 -3.4 L40 4 L-40 4Z"], { inset: 2, toLight: 3 }),
      highlight: { d: `M${litX - 7} -24 a7 10 0 1 0 14 0 a7 10 0 1 0 -14 0Z`, colour: C.light, opacity: 0.25, blur: 3.5 },
      ...toeLines,
      // Its top fades in under the shoulder, so it comes out from under the saddle's tan with no edge.
      feather: { from: [sx * 31, -45.6], to: [sx * 31, -41.8] },
      // The chest is one fluffy mass down to the paws, as the sheet paints it: the leg's line comes in from nothing low
      // on its inner side, where the legs part, runs round the bun of the paw, darkest under its sole on the ground,
      // and up its outer side, fading out below the shoulder (parts/lines.ts). No lines beside the tag.
    }, litSide(side, [{ from: [-2.4, -15], to: [-35, -40], taper: [6, 16] }])));
  }
  return out;
}

// The face library (spec L440-498): every face state the front draws besides its rest, each from its panels by the
// shared face recipes (parts/eye.ts, mouth.ts, brow.ts, stars.ts), placed by this view's face frame. The rest face
// (open eyes, the open mouth, neutral brows and ears) is front()'s; the states' rotations of the ears are the face
// clips' (presets.ts, faceClips.ts).

/** Each eye's place along the eye line, out from the face frame's middle. */
const EYE_HALF = Math.hypot(EYE_L[0] - EYE_R[0], EYE_L[1] - EYE_R[1]) / 2;
/** A model-space point moved across and down in the face's level frame. */
const nudge = ([x, y]: P, [dx, dy]: P): P => [x + dx * cosR - dy * sinR, y + dx * sinR + dy * cosR];

/** The eye states the front draws besides the open eye (sparkle and squeeze are the happy crescent's region: rig.json). */
export const EYE_STATES = ["happy", "closed", "sleepy", "wink", "wide", "peek"] as const;

/**
 * An eye state, drawn from its panels. The closed states are the sheets' dark lash bands, placed by their middles where
 * the level panels place them from the nose (DECISIONS 130): the happy crescents (Excited, Laughing) 2.3 pt below the
 * open eye's centre and 1.9 pt further out, the closed lids (Sleepy) 2 pt below and 1.6 out, the wink (Mischievous,
 * Winking, Cheeky) at the open eye's height.
 */
function eyeState(state: (typeof EYE_STATES)[number], side: "L" | "R"): Piece {
  const sx = side === "L" ? 1 : -1, noseward: 1 | -1 = side === "L" ? -1 : 1;
  const spec = eyeSpec(side === "L" ? EYE_L : EYE_R, noseward);
  const band = (out: number, down: number, b: Omit<LidBand, "centre" | "tilt" | "noseward">) =>
    lidBand({ centre: FRAME.at([sx * (EYE_HALF + out), down]), tilt: ROLL_DEG, noseward, ...b });
  switch (state) {
    // A ∩ about as wide as the open eye, an even band about 5 pt thick with round ends, its outer end a little lower and
    // hooking down, as the master sheet's Laughing, Excited and Content paint it (20 to 20.6 pt across, 5 to 5.5 thick,
    // 92 to 108 pt² of dark).
    case "happy":
      return band(2.4, 1.45, { width: 17.4, rise: 4.6, drop: 0.8, thickness: 5, ends: [2.6, 3.2], fullness: 0.35, flick: { length: 0.9, hook: 25 } });
    // A ∪ a little narrower, as thick, its middle 2.6 pt below its ends, the outer end lifting in a lash flick, as
    // the master sheet's Sleepy paints it (18 to 18.8 pt across, 5 thick, 86 to 91 pt²).
    case "closed":
      return band(1.6, 2, { width: 16.6, rise: -2.6, drop: 0, thickness: 4.8, ends: [2.4, 2.2], fullness: 0.35, flick: { length: 1.2, hook: -30 } });
    // A flatter crescent at the open eye's height and 2.2 pt further out, its outer end lifted and running into a lash
    // flick, as Cheeky and Winking draw the wink (19.3 pt across, 4.9 thick, 88 pt², its middle 25.7 pt out from the
    // nose and 8 pt above it, the open eye's height).
    case "wink":
      return band(2.7, -0.6, { width: 17.6, rise: 3.2, drop: -1.2, thickness: 4.8, ends: [2.4, 2.4], fullness: 0.35, flick: { length: 1.6, hook: -60 } });
    // The open eye with its upper lid closed down to just below its middle, its edge bowing a little, as Sleepy half-lid
    // draws it; the catchlight just under the lash.
    case "sleepy":
      return sharedEye({ ...spec, cover: { level: 0.6, tilt: ROLL_DEG, lash: 1.9, overhang: 1, shine: { at: [2.7, -4], r: 1.2 } } });
    // Surprised round: 7% larger and a point higher, the white broader and longer, the catchlight bigger; its larger
    // pupil baked in (phase 3 has no pupil scale).
    case "wide":
      return sharedEye({ ...spec, centre: nudge(spec.centre, [-sx * 0.4, -0.9]), rx: 10.2, ry: 9.85, white: { at: -28, width: 2, span: 42, fade: 0.5 },
        shine: { at: [2.5, 5.6], r: 2.05 }, glow: { band: 6, warm: 2 } });
    // Side glance: the iris baked toward the viewer's right, as the panel looks, the white a broad crescent on the
    // other side; the catchlight stays on the iris.
    case "peek":
      return sharedEye({ ...spec, white: { at: side === "R" ? -6 : 186, width: 4.6, span: 58, fade: 0.3 }, shine: { at: [side === "R" ? 2.6 : -2.4, 5], r: 1.8 } });
  }
}

/** Proud's stars beside the head on the dog's right, where the panel puts them from the nose, its raised chin levelled. */
const STARS: Star[] = [{ at: [-74.9, -41.3], size: [11.4, 14.4], turn: 0 }, { at: [-60.3, -56.7], size: [9.6, 10.4], turn: 0 }];

// The one perked ear, as the One ear perked panel draws it (DECISIONS 133): flipped up over the head, a broad bean
// whose root rises from the crown's top corner beside the topknot and stands over the crown, the flap running out and a
// little down to its free end, which hangs just past the head's side (the panel's flap spans 0.2 to 1.2 of the head's
// half-width from the midline; its top stands about 11 pt above the topknot's). Where it turns over at the root the
// ear's inside shows in a darker wedge behind the fold. Typed on the dog's right ear in the head's frame from the
// panel levelled and scaled by its brows, mirrored for its left and rolled with the face. Ears draw behind the head in
// every state, so the crown's line hides the root's foot and the topknot its inner end, as the panel's crown meets it.
const perkedR: Node[] = [[-10.4, -152.6], [-10.6, -159], [-12.2, -166], [-15.8, -171.8], [-20, -175], [-24.8, -176], [-29.6, -175.4], [-34.8, -173.2],
  [-39.6, -169], [-44, -164.8], [-48.4, -161.6], [-53.2, -157.6], [-57, -152.6], [-59, -147.4], [-58.4, -142], [-56, -137.8], [-52, -135.4], [-46.4, -134.4],
  [-41, -135.4], [-36.4, -138.6], [-31.4, -143], [-25, -148.2], [-18.4, -150.6], [-13, -151.8]];
const perked = { R: smooth(rollN(perkedR)), L: smooth(rollN(mirrorX(perkedR))) };
const onPerk = (side: "L" | "R", p: P): P => rollP(side === "R" ? p : [-p[0], p[1]]);
const perkD = (side: "L" | "R", d: string) => rollD(side === "R" ? d : mirrorD(d));
/**
 * With the ear up, its root no longer fills the notch under the crown's overhang at the temple: the head's side runs on
 * round from the overhang's tip down into the face's side, and the panel paints it the root's tan, deepest under the
 * crown and paling down into the hood. Typed in model space on each side, as the head's temples are (they differ), its
 * inner part under the head; only the notch shows.
 */
const temples = {
  R: smooth([[-38, -140], [-44.6, -137.8], [-47.8, -133.6], [-48.4, -128.4], [-48.2, -122.6], [-47.4, -116.6], [-46.6, -111], [-40, -108], [-31, -122], [-29.6, -136.4]]),
  L: smooth([[28, -141.6], [36, -143], [40.6, -141.6], [43.2, -138.6], [43.7, -133], [43.6, -126.4], [43.6, -120], [44, -115], [44.6, -110.6], [38, -109], [29, -122], [26, -134]]),
};
/** Each temple's lined edge: from the overhang's tip, where the crown's line ends, down to where the face's side takes over. */
const templeEdge = { R: [[-47, -135.2], [-46.8, -112.4]] as [P, P], L: [[42, -140.4], [44.2, -113.6]] as [P, P] };

function perkedEar(side: "L" | "R"): Piece {
  const on = (p: P) => onPerk(side, p);
  const tan = uid("tan");
  const [[, y0], [, y1]] = templeEdge[side];
  const temple = litPart(`ear.${side} temple`, temples[side], {
    fill: C.patch,
    under: `<defs><linearGradient id="${tan}" gradientUnits="userSpaceOnUse" x1="0" y1="${fmt(y0 - 2)}" x2="0" y2="${fmt(y1)}">` +
      `<stop offset="0" stop-color="${C.earDeep}"/><stop offset="0.35" stop-color="${C.marking}"/><stop offset="1" stop-color="${C.patch}"/></linearGradient></defs>` +
      `<rect x="-60" y="${fmt(y0 - 6)}" width="120" height="${fmt(y1 - y0 + 12)}" fill="url(#${tan})"/>`,
  }, [{ from: templeEdge[side][0], to: templeEdge[side][1], on: "tan", taper: [0.8, 6] }]);
  const paint = earFur({
    ear: perked[side],
    axis: [on([-19.5, -172.6]), on([-55.1, -139.4])],
    deepen: [0.35, 1],
    // Four locks running out along the flap to its free end, as the panel paints its fur.
    locks: ([[[-30.6, -171], [-39.2, -166], [-47.6, -159.2], [-53.2, -151.9]], [[-32.3, -163.3], [-40.8, -157.4], [-48.3, -150.7], [-54, -144.2]],
      [[-33.8, -154.6], [-41.5, -148.8], [-48, -142.3], [-52.1, -137.9]], [[-38, -146.4], [-43, -141.4], [-46.6, -137.4]]] as P[][]).map((pts) => pts.map(on)),
    dips: [on([-54.4, -137.6])],
    light: perkD(side, "M-16 -171 C-20 -175 -28 -175.4 -36 -172 C-42 -168.8 -46 -164.6 -48 -162.4 C-42 -164 -36 -167.4 -29 -169.6 C-24 -170.6 -19.6 -170.2 -16 -171Z"),
    // Where the root sits down behind the crown, the crown's contact shade.
    under: [perkD(side, "M-8 -156 C-16 -152.6 -26 -150 -34 -143 C-38 -139.8 -42 -136.4 -46 -134 L-30 -130 L-8 -146Z")],
    // The fold where the root turns over, the ear's inside a little deeper behind it.
    fold: { line: ([[-21.7, -161.5], [-24.8, -156.8], [-26.9, -151.9], [-29, -146.9]] as P[]).map(on),
      back: perkD(side, "M-19.6 -160.4 L-21.7 -161.5 L-24.8 -156.8 L-26.9 -151.9 L-29 -146.9 L-18 -148Z") },
  });
  // Its line from its inner end, beside the topknot, over its top and round the free end, to where its underside goes
  // behind the crown.
  const [a, b] = [on([-10.8, -162]), on([-38.6, -136.8])];
  return join(temple, litPart(`ear.${side}`, perked[side], paint, [side === "R" ? { from: a, to: b, on: "tan", taper: [3, 4] } : { from: b, to: a, on: "tan", taper: [4, 3] }]));
}

/** Every face state the front draws besides its rest, each with its part and state. */
export function faceStates(): Drawn[] {
  const out: Drawn[] = [];
  for (const side of ["L", "R"] as const) for (const state of EYE_STATES) out.push({ part: `eye.${side}`, state, piece: eyeState(state, side) });
  for (const state of MOUTH_STATES) if (state !== "open") out.push({ part: "mouth", state, piece: mouth(state, FRAME).piece });
  for (const state of ["raised", "happy"] as const) {
    out.push({ part: "brow.L", state, piece: brow(state, 1, FRAME).piece }, { part: "brow.R", state, piece: brow(state, -1, FRAME).piece });
  }
  for (const side of ["L", "R"] as const) out.push({ part: `ear.${side}`, state: "onePerked", piece: perkedEar(side) });
  out.push({ part: "stars", state: "sparkle", piece: stars(STARS, FRAME) });
  return out;
}

/** The face frame and its roll, for the R3 guards (characters/dog/test/faces.test.ts), which hold what each recipe draws here. */
export const faceFrame = { frame: FRAME, rollDeg: ROLL_DEG };

/** Points the sheet has no finder for, where this drawing puts them (dev output for the sheet match). */
export const landmarks: Record<string, P> = {
  "paw.front.L": [15.4, -5.4],
  "paw.front.R": [-15.4, -5.4],
  "paw.hind.L": [37.6, -10.9],
  "paw.hind.R": [-37.6, -10.9],
  // The ring's top as it shows below the chin; it swings from its hidden top, the tag's pivot at (0.4, −57.5).
  "tag.ring": [0.4, -55.6],
  // The seat: the body's lowest point on the midline is at −1.6, showing between the front paws; taken 0.8 pt inside.
  seat: [0, -2.4],
};
