// The dog's front view: shapes first, every node typed by hand in model space
// (points, the ground under the seat at 0, 0, y down) at the extremes and
// inflections read off the front turnaround, then paint. Light groups share one
// light across joined parts (head and tuft, chest and front legs, haunches and
// hind paws); joins are feathered and carry no rim and no line.
import { furEdge, furSpan, type Lock } from "../../../draw/fur.ts";
import { arc, bbox, ellipse, fracAt, mirrorX, pathD, rotate, sample, smooth, spanPoints, symmetric, v, type Node, type P, type Seg, type Shape } from "../../../draw/geom.ts";
import { innerLine, mirrorSpans, ribbons, strokeOf, type DrawnLine, type Outline, type Span, type Stroke } from "../../../draw/line.ts";
import { LIMITS } from "../../../draw/lint.ts";
import { marking, part, soft, type Fade, type Paint } from "../../../draw/paint.ts";
import { blur, join, pad, piece, uid, type Box, type Piece } from "../../../draw/svg.ts";
import { model } from "../model.ts";
import { C } from "../palette.ts";

export interface Drawn {
  part: string;
  state?: string;
  piece: Piece;
}

const OUTER = model.outline.outerPt;
const INNER = model.outline.innerPt;
/** Lines on fur spans and small parts: lighter, and never under 1.2 pt (a thinner line is a question for the founder). */
const THIN = 1.2;
const OUTLINE: Outline = { colour: C.outline, width: OUTER, taper: 6, blur: 0.2 };

/** The same shape on the dog's other side. */
const other = (nodes: Node[]) => smooth(mirrorX(nodes));
/** Outline spans typed for the dog's right side (the viewer's left), mirrored for its left. */
const bySide = (side: "L" | "R", spans: Span[]) => (side === "R" ? spans : mirrorSpans(spans));
/**
 * A part's canvas grown to hold its shade where the light group reaches past
 * the part, so the part rasterized on its own canvas matches the whole frame
 * (the hind paws, whose light group's rim and blur reach past their edges).
 */
const roomy = (p: Piece, by: number): Piece => ({ ...p, box: pad(p.box, by) });
/** Inner lines typed for the dog's right side, mirrored for its left. */
const flipX = (pts: P[], side: "L" | "R") => (side === "R" ? pts : pts.map(([x, y]): P => [-x, y]));
/**
 * A tapered line drawn as a filled polygon, with its meta for the lint built from what strokeOf draws: the
 * width it is declared and the narrowest and widest it is drawn, held to its band (outer 1.2 to 1.8 pt,
 * inner 0.6 to 0.9).
 */
function tapered(pts: P[], width: number, kind: "outer" | "inner", where: string, opts: Stroke = {}): { d: string; line: DrawnLine } {
  const s = strokeOf(pts, width, { band: LIMITS[kind], ...opts });
  return { d: s.d, line: { kind, width, where, drawn: s.drawn } };
}
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
/** SVG drawn in the face frame, placed in model space. */
const inFace = (svg: string) => `<g transform="translate(${r3(FC[0])} ${r3(FC[1])}) rotate(${r3((ROLL * 180) / Math.PI)})">${svg}</g>`;
/** A box in the face frame, as the model-space box that holds it. */
function faceBox([x, y, w, h]: Box): Box {
  const corners = ([[x, y], [x + w, y], [x, y + h], [x + w, y + h]] as P[]).map(face);
  const xs = corners.map((p) => p[0]), ys = corners.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
}

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
  [-32.4, -34], [-31.8, -26], [-30.6, -17], [-28, -9], [-20, -4.4], [-8, -3.2]], [0, -3]);

// The front legs: short chubby legs that come out of the chest in a soft V, as
// the sheet draws them (their inner edges at x -5.6 at y -30, -2.6 at -19 and
// -1.8 at -12), each coming out from under the shoulder's saddle, its outer
// edge where the sheet's tan meets the cream (x -33.5 from y -44 to -31, -33 at
// -24, -32 at -19), tapering to a waist at the wrist (x -30.5 at y -13.8),
// then swelling into a round bun of a paw (x -31.4 at y -8.8 outside, -1.2
// inside), so the hind paw still shows outside it. Its sole is three soft toes,
// a small scallop at each toe line (concave notches, so no corner rule
// applies).
const legR: Node[] = [[-6.6, -33], [-4.4, -25.4], [-2.6, -19], [-1.8, -13.4], [-1.2, -9], [-1.4, -5.2], [-2.9, -2.2], [-6.2, -0.7], [-11, -1.2], [-15.5, -0.1],
  [-20, -1.2], [-24.6, -0.5], [-28.6, -2], [-30.9, -5], [-31.4, -8.8], [-30.5, -13.8], [-31.9, -19], [-32.9, -24.4], [-33.5, -31], [-33.6, -38],
  [-33.4, -44.6], [-30, -47.4], [-26, -44], [-15, -40]];
/** The scallops' notches in the sole. */
const TOES = [8, 10];
const legs = { R: smooth(legR, { corners: TOES }), L: smooth(mirrorX(legR), { corners: TOES.map((j) => (legR.length - j) % legR.length) }) };

// The collar: a band round the neck, following the chin down to a dip at the
// front, as the sheet draws it: about 8.5 pt deep at the front with its rims
// (the sheet's 8.2 to 8.7 at x -14 to 16), 6.5 at x 20 and 4 where its ends
// tuck in against the neck under the cheeks, each end a rounded square where it
// turns away round the neck, both the same. The sheet's head roll tips it a
// little: its left end sits higher and reaches 2 pt further out.
const collar = smooth([[-26.4, -62.6], [-21, -61.2], [-10, -59], [0, -58.2], [10, -59.4], [20.5, -62], [26.4, -63.9], [28, -63.4], [28.5, -61.6],
  [27.4, -59.6], [22.6, -55.4], [17, -52.6], [10, -50.4], [0, -49.8], [-10, -50], [-15, -50.8], [-19.4, -52.6], [-22.6, -55], [-25, -57.2], [-26.8, -59],
  [-27.4, -60.8]]);

// The tag: a plump, coin-like gold heart, as the sheet draws it: full round
// lobes with a shallow notch, widest at mid-height (17.9 pt with its line, the
// sheet's 17.8), its sides staying wide low down before a blunt rounded point
// (the sheet's is 12.5 pt wide 3 pt above its foot), 16 pt tall, centred under
// its ring; and the smaller heart embossed in it.
const shift = (shape: Shape, dx: number): Shape => ({ ...shape, segs: shape.segs.map((g) => g.map(([x, y]): P => [x + dx, y]) as Seg) });
const TAG_X = 0.4;
const heart = shift(symmetric([[0, -50.4], [-1.6, -51.3], [-3.6, -51.7], [-5.8, -51.1], [-7.6, -49.3], [-8.7, -47.1], [-8.95, -45], [-8.5, -43], [-7.8, -41],
  [-6.6, -39], [-4.8, -37.3], [-2.6, -36.1]], [0, -35.6], { corners: [0] }), TAG_X);
const innerHeart = shift(symmetric([[0, -46.4], [-1.8, -48], [-3.9, -48.1], [-5.3, -46.8], [-5.6, -44.6], [-4.8, -42.4], [-3, -40.6]], [0, -39.2], { corners: [0] }), TAG_X);

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
const headHalf: Node[] = [[0, -151.8], [-32.4, -146.8], [-37.6, -143.4], [-42.2, -139.6], [-46.2, -133.6], [-41.2, -135.1], [-35.8, -134.5],
  [-38.2, -128.6], [-42.4, -120.6], [-45.6, -114.4], [-47, -105], [-46.4, -97.4], [-44.4, -93], [-46.2, -90.2], [-46.2, -84], [-45.4, -77.8],
  [-42.6, -73.4], [-38.6, -70.2], [-31, -64.2], [-9, -59.4]];
/**
 * The crown's overhang and the crescent's inner end, on the right: the lock's tip hanging just inside the ear's
 * edge, its underside arching over the root's tan to y -134.9, and the rounded turn into the face's side.
 */
const TEMPLE = [4, 5, 6];
/** Where each cheek's puff comes out from under the side's line: a concave corner. */
const PUFF = 12;
/**
 * The left temple, typed where the sheet draws it in place of the right's mirror: a shorter overhang, the crown
 * meeting the ear at (41, -140), its underside arching in over the ear's tan to y -140.4 and rounding off into
 * the face's side at (30.8, -138.6), 5 pt higher and 6 pt further in than the right's.
 */
const leftTemple: Node[] = [[41, -140], [36.2, -140.4], [31.4, -139.6]];
const mirroredHalf = mirrorX(headHalf, false).slice(0, -1);
// The mirror runs from the chin up to the crown, so the right's temple nodes come in reverse; the left's replace the lock's tip and underside and the turn.
const at = mirroredHalf.length - TEMPLE[2]!;
const leftHalf = [...mirroredHalf.slice(0, at).map(([x, y]): Node => leftSide([x, y])), ...[...leftTemple].reverse(),
  ...mirroredHalf.slice(at + TEMPLE.length + 1).map(([x, y]): Node => crownLift([x, y]))];
// The cheeks' puffs, and the inner end of each root's tan under the crown, a wedge pointing in under the crown's
// fur where the face's side comes down from it (concave corners, which the corner rule leaves alone).
const CORNERS = [PUFF, headHalf.length + headHalf.length - PUFF, TEMPLE[2]!, headHalf.length + 1 + at];
let head = smooth([...headHalf, [0, -58.4], ...leftHalf].map(([x, y]): Node => cheekRoll([x, y])), { typed: headHalf.length + 1 + leftTemple.length, corners: CORNERS });
// The cheeks' fluff, as the hero and the front turnaround draw it: each puff
// breaks along its outer and lower edge into five irregular, slightly pointed
// clumps, combed down and out, uneven in size (the second and the fourth the
// fullest), the last a small tuft hooking down where the cheek meets the neck,
// each lined in a soft warm brown; and the chin hangs over the collar in a row
// of small pointed tufts, uneven, combed out from its middle.
const cheekLocks = [{ len: 1.1, w: 0.8, lean: 0.05 }, { len: 2.1, w: 1.4, lean: 0.15 }, { len: 1.3, w: 0.95, lean: 0.2 }, { len: 1.8, w: 1.25, lean: 0.3 },
  { len: 1.3, w: 0.9, lean: 0.6 }];
const chinLocks = [{ len: 0.55, w: 0.8, lean: -0.35 }, { len: 0.85, w: 1.1, lean: -0.3 }, { len: 0.6, w: 0.9, lean: -0.2 }, { len: 0.9, w: 1.2, lean: -0.1 },
  { len: 0.7, w: 1, lean: 0 }, { len: 0.85, w: 1.15, lean: 0.1 }, { len: 0.6, w: 0.9, lean: 0.2 }, { len: 0.8, w: 1.05, lean: 0.3 }, { len: 0.55, w: 0.85, lean: 0.35 }];
/** Each cheek clump's tip, root and notches (path order), for its line and the shade under it. */
const clumps: { tip: P; root: P; notches: [P, P] }[] = [];
const noteClump = (tip: P, root: P, notches: [P, P]) => clumps.push({ tip, root, notches });
head = furEdge(head, cheekRoll([-45.4, -91.8]), cheekRoll([-36.4, -68.8]), cheekLocks, 0.24, noteClump);
head = furEdge(head, cheekRoll([36.4, -68.8]), cheekRoll([45.4, -91.8]), lefthandOf(cheekLocks), 0.24, noteClump);
head = furEdge(head, cheekRoll([-32.4, -65.4]), cheekRoll([32.4, -65.4]), chinLocks, 0.24);
// The crown's fur where it overhangs each ear's root is a lock of fur, its tip a fur span, so the crown's line can
// run on round it into the ear's own line, unbroken, as the sheet draws it. Between the topknot and each ear the
// crown's outline breaks over a small lock of fur, as the sheet's does.
head = furSpan(furSpan(head, [-45, -135.6], [-44.4, -134.3]), [39.4, -140.4], [40.2, -141.6]);
const crownLocks = [{ len: 0.85, w: 1, lean: 0.35 }, { len: 0.55, w: 0.8, lean: 0.45 }];
head = furEdge(furEdge(head, [-35.6, -145.1], [-38.6, -142.6], crownLocks, 0.26), [38.4, -144.6], [35.4, -147], lefthandOf(crownLocks), 0.26);

// The topknot: three fur lobes, typed node by node (the sheet's tuft): the side
// lobes low and broad, the middle one tall and a little pointed, like a flame
// leaning right, each ending in a curl.
const tuft = furSpan(smooth([[-31, -149.2], [-29.6, -152.8], [-26.6, -155.6], [-22, -157], [-17.4, -157.4], [-13.4, -156.4], [-11.2, -154],
  [-9.6, -158], [-6.8, -161.4], [-3.6, -163.5], [0.7, -164.4], [3.4, -163.2], [5, -160.8], [5.2, -158], [8.6, -159.4], [12.4, -160.2], [16.6, -159.8],
  [20.8, -158.4], [23.2, -155.6], [22.6, -152.2], [14, -146.6], [0, -145.4], [-18, -146.2]], { corners: [6, 13] }), [-30.6, -150.4], [22.8, -153]);

// The head patches, as the sheet paints them: a rounded hood over the top and
// outer side of each eye, like the rim of a pair of round spectacles, its top
// edge about 9 pt above the eye with the brow in the cream above it, its nose
// end down the eye's inner side to about mid-eye; and a band of the same tan
// down the face's side, inside its line, from where the line begins to the
// cheek's puff. Between the two a crescent of cream comes down from the
// forehead round the hood's outer top to about the eye's top (a concave corner
// at its tip). Below the eye and the hood the face is cream. Typed per side,
// as the sheet draws them (the left about 3 pt higher, with the head's roll),
// with about 4 pt of bleed past the head's edge; the eye covers what is typed
// under it. Their edges are soft but defined: a sigma of 0.5 pt; along each
// hood's top the tan breaks into a row of small soft points of fur where the
// cream above runs down into it, as the sheet paints it, not a clean curve.
const hoodLocks = [{ len: 0.65, w: 1, lean: 0.2 }, { len: 0.95, w: 1.3, lean: 0.1 }, { len: 0.55, w: 0.9, lean: -0.1 }, { len: 0.85, w: 1.2, lean: -0.2 },
  { len: 0.5, w: 0.8, lean: -0.3 }];
const patches = {
  R: furEdge(smooth([[-43, -86.6], [-49.6, -86], [-50, -106], [-48.4, -121.4], [-41.6, -122.6], [-39.6, -118], [-38.4, -112.6], [-35.8, -114.8], [-32.2, -117.2],
    [-28, -117.8], [-22, -116.8], [-18.2, -113.2], [-15.8, -108.2], [-15.6, -102.4], [-18, -98], [-26, -93.4], [-33.4, -90.2], [-38.4, -88.4]], { corners: [6] }),
    [-34.6, -115.8], [-19.6, -115], hoodLocks, 0.28),
  L: furEdge(smooth([[43.4, -91.4], [49, -90.4], [49.4, -110], [44.6, -125], [37.6, -131.4], [35.4, -126], [35, -121], [34.6, -117.4], [32.6, -119.4], [29.6, -120.8],
    [26, -121.2], [20.2, -121], [16.2, -118.6], [13.6, -114], [12.6, -108.4], [13.2, -103.4], [18, -96.6], [28, -94.4], [34.4, -94.2], [39.6, -93.2]], { corners: [7] }),
    [33.6, -118.6], [17.4, -119.6], lefthandOf(hoodLocks), 0.28),
};
/** Each hood's end toward the nose softens a little more than its edge, as the sheet's does. */
const patchFade = { R: { from: [-16.8, -105.4], to: [-13.6, -104.4] }, L: { from: [14.2, -109.6], to: [11, -108.6] } } satisfies Record<string, Fade>;
// The saddle's two halves where they show from the front, as the sheet paints
// them. The right half runs down the shoulder from under the collar's end, a
// strip of tan along the line, and widens over the upper outer haunch, its tan
// running in under the front leg down to y -30; below that its inner edge runs
// out across the thigh in a broken edge of fur (x -38 at y -28, -40 at -23),
// leaving a streak of cream beside the leg, and the outer thigh's tan runs on
// down the line to the hind paw, so the lower thigh above the hind paw is
// cream. The left half is a
// narrow streak down the shoulder from under the collar's end along the edge of
// the front leg (the sheet's, x 33 to 39 from y -47 to -32), running out at the
// top of the haunch, whose round is cream.
const saddleR = smooth([[-27, -64.2], [-31.6, -63.4], [-37, -54], [-42, -45.6], [-53, -36], [-53, -17.6], [-47.6, -15.4], [-44.6, -17], [-42.2, -18.4], [-40.6, -20.4],
  [-41.2, -22.2], [-39.6, -24.4], [-38.6, -26.6], [-37.4, -28.2], [-34.4, -30.6], [-32.4, -34], [-31.8, -40], [-30.6, -46], [-28.8, -53], [-27.4, -58.6]],
  { corners: [9, 10, 11] });
const saddleL = smooth([[27, -64.2], [31.6, -63.4], [36.4, -55], [39.6, -47], [40.4, -42.4], [39.2, -38.6], [37.4, -34.4], [35.8, -30.6], [34.4, -28.4], [33.4, -31],
  [32.4, -38], [31.6, -46], [30.4, -52], [28.6, -57.6]], { corners: [8] });

// Paint.

// The one highlight: the crown toward the light, and the cheeks' puffs out to their rims, which the sheet paints
// whitest at their outer edge, rim-lit against the ear.
const headLight = "M-30 -146 C-18 -154 2 -154 10 -147 C6 -136 -18 -134 -28 -138Z " +
  "M-48 -82 C-47 -87.6 -42 -89 -37.6 -86.8 C-36.4 -81.6 -38.4 -75.6 -42.6 -72.6 C-46 -73.6 -48.4 -77.4 -48 -82Z " +
  "M48 -86.6 C47 -92.2 42 -93.6 37.6 -91.4 C36.4 -86.2 38.4 -80.2 42.6 -77.2 C46 -78.2 48.4 -82 48 -86.6Z";
const furShade = (group: Shape[], shapes: string[] = [], keep: string[] = [], rim = { inset: 2.5, toLight: 4 }) =>
  ({ multiply: C.furShadeBy, rim, shapes, keep, group, blur: 2.4 });
const bodyGroup = [chest, legs.R, legs.L];
const hipGroup = [back, hind.R, hind.L];
const headGroup = [head, tuft];

const backPaint: Paint = {
  fill: C.fur,
  shade: furShade(hipGroup),
  // From under the collar's end down the shoulder, the lighter fur line, coming out from under the collar; round
  // the haunch, the light grey-brown line the sheet draws there (#BB9370 to #BE997E), thinner and lighter than
  // the head's, lighter on the side toward the light. The two cross-fade where the shoulder meets the haunch,
  // their tapers overlapping.
  outline: { ...OUTLINE, colour: C.haunchLine, width: 1.2, taper: 6, spans: [
    { from: [-29.2, -61.4], to: [-38.8, -42.6], width: THIN, colour: C.furLine }, { from: [-35.6, -47.6], to: [-47.4, -11] },
    { from: [47.4, -11], to: [35.6, -47.6], width: 1.35 }, { from: [38.8, -42.6], to: [29.2, -61.4], width: THIN, colour: C.furLine }] },
};
const headPaint: Paint = {
  fill: C.fur,
  // Under the jaw, where the head turns under toward the collar; and a faint wash in each hood just over the eye,
  // under the brow's overhang, where the sheet's tan deepens (#ECB888 against the hood's #F0BC92).
  shade: furShade(headGroup, ["M-38 -66 C-28 -61.2 -14 -59.2 0 -59.2 C14 -59.2 28 -61.2 38 -66 L46 -56 L-46 -56Z",
    ...[EYE_R, EYE_L].map(([x, y]) => `M${fmt(x - 8)} ${fmt(y - 9.6)} a8 2 0 1 0 16 0 a8 2 0 1 0 -16 0Z`)],
    // The crown stays light right out to its line, as the sheet paints it, the overhangs over the ears' roots
    // included; and so do the cheeks' puffs out to their rims, above the jaw.
    ["M-52 -172 L52 -172 L52 -137 L-52 -137Z", "M-52 -95 L-36 -95 L-36 -72 L-52 -72Z", "M52 -99 L36 -99 L36 -76 L52 -76Z"], { inset: 3, toLight: 4.5 }),
  highlight: { d: headLight, colour: C.light, opacity: 0.4, blur: 4 },
};
/**
 * The side's line, thinner than the ear's silhouette line, comes in light from the ear's root and deepens only
 * from the brow down to the ear's deep tan by the eye's middle, where the sheet's is darkest.
 */
const SEAM = uid("seam");
// The head's line, where the sheet draws one: on the crown's fur one
// continuous light warm line from the topknot down to just short of the
// overhang's tip, where the ear's own line takes over; down each side, where
// the face lies over the ear, one round curve that comes in lighter from the
// ear's root and deepens to the ear's deep tan (the sheet's #9E5C2C there,
// DECISIONS 7), ending where the cheek's puff comes out over it; and under the
// chin's scallops, over the collar, a soft warm line. Over the temples' tan
// and under the overhang the sheet draws no line. The cheeks' clumps carry
// their own lines (clumpLines).
const headLine: Outline = { ...OUTLINE, taper: 4, blur: 0.15, spans: [
  { from: [-39.4, -126.6], to: [-44.8, -93.2], width: THIN, colour: `url(#${SEAM})` },
  { from: [44.4, -93.2], to: [36.2, -127.6], width: THIN, colour: `url(#${SEAM})` },
].map((span) => ({ ...span, from: cheekRoll(span.from as P), to: cheekRoll(span.to as P) })) };
/**
 * The crown's line, from under the topknot's side lobes over the crown's small lock and round the overhang's tip,
 * where it runs on into the ear's own line: its ends barely taper (the topknot hides the inner one), so the ear's
 * line, coming out from under the overhang at full width, takes it up with no pinch.
 */
const crownLine: Outline = { ...headLine, taper: 1.4, spans: [
  { from: [-24, -149.2], to: [-45.6, -134.6], width: THIN, colour: C.crownLine },
  { from: [40.8, -140.3], to: [19, -150.6], width: THIN, colour: C.crownLine },
] };
/**
 * The cheek clumps' lines, following the scalloped edge on through the notches as the sheet draws them, in two
 * tapered runs a cheek: the upper clumps in the lighter warm brown where they lie on the ear's light tan, the
 * lower ones deeper where they lie on its shaded foot (the sheet's #B17546 above to #9D5C31 below).
 */
function clumpLines(): Outline {
  const n = cheekLocks.length, spans: Span[] = [];
  for (let c = 0; c < clumps.length; c += n) {
    const cheek = clumps.slice(c, c + n);
    // The path runs down the right cheek and up the left, so the upper clumps come first on the right.
    const rightSide = cheek[0]!.tip[0] < 0;
    [cheek.slice(0, n / 2), cheek.slice(n / 2)].forEach((run, k) => {
      const upper = rightSide === (k === 0);
      spans.push({ from: fracAt(head, run[0]!.notches[0]), to: fracAt(head, run.at(-1)!.notches[1]), colour: upper ? C.earEdge : C.earLine });
    });
  }
  return { ...OUTLINE, width: THIN, taper: 2.2, blur: 0.2, spans };
}
/** Two sets of ribbons as one. */
const join2 = (a: ReturnType<typeof ribbons>, b: ReturnType<typeof ribbons>): ReturnType<typeof ribbons> =>
  ({ svg: a.svg + b.svg, lines: [...a.lines, ...b.lines], outlined: [...a.outlined, ...b.outlined] });
/** head.line: the head's outline as its own unclipped region, drawn after the head's clip group, reaching 0.5 pt past the head. */
function headLinePiece(): Piece {
  const r = join2(ribbons(head, headLine, "head.line", 0.5), ribbons(head, crownLine, "head.line", 0.5));
  const c = ribbons(head, clumpLines(), "head.line", 0.5);
  const f = uid("blur"), g = uid("blur");
  const [x0, y0, x1, y1] = bbox(head.segs);
  const box = pad([x0, y0, x1 - x0, y1 - y0], 2);
  // Where the crown's fur and the face meet the ears' tan at the temples with no line, the sheet's edge is soft:
  // the crown's cream fur lies out over the root's tan in a feathered edge along the underside of the overhang and
  // down the face's side to where its line begins, so the root's tan comes out from under the cream.
  const s = uid("blur");
  const temples = ([[[-45.6, -134.8], [-39.6, -126]], [[36.4, -127], [40.6, -140.6]]] as [P, P][]).map(([a, b]): [P, P] => [cheekRoll(a), cheekRoll(b)]);
  const soft = temples.map(([a, b]) => strokeOf(spanPoints(head, fracAt(head, a), fracAt(head, b)), 2.4, { taper: 3, tip: 0.4 }).d).join("");
  return piece(`<defs>${blur(f, pad(box, 2), headLine.blur!)}${blur(g, pad(box, 2), 0.35)}${blur(s, pad(box, 2), 0.8)}` +
    `<linearGradient id="${SEAM}" gradientUnits="userSpaceOnUse" x1="0" y1="-120" x2="0" y2="-102">` +
    `<stop offset="0" stop-color="${C.earEdge}"/><stop offset="1" stop-color="${C.earLine}"/></linearGradient></defs>` +
    `<path d="${soft}" fill="${C.fur}" opacity="0.8" filter="url(#${s})"/>` +
    `<g fill="${headLine.colour}" filter="url(#${f})">${r.svg}</g>` +
    `<g filter="url(#${g})">${c.svg}</g>`, box, {
    shapes: [{ name: "head.line", nodes: head.typed, segs: head.segs, outlined: [...r.outlined, ...c.outlined], fur: head.fur.map(([a, b]) => [fracAt(head, a), fracAt(head, b)]) }],
    lines: [...r.lines, ...c.lines.map((l) => ({ ...l, where: "cheek clump" }))],
  });
}

/**
 * An open eye at its landmark, as the turnaround, the hero and the expression sheet's open eyes paint it: an
 * oval about as tall as it is wide (19.4 pt on the sheet), its top leaning toward the nose (and rolled with the
 * face), its edge a little soft. The rim is a lash line, heaviest along the upper lid and the upper outer side,
 * near-black there and warming to the printed dark brown round the eye's foot, thinnest along the lower inner
 * side; a thin sliver of white lies high on the outer side inside the rim (from about 60 degrees above level to
 * 25 below, 1.15 pt at its widest, its inner edge soft). The iris is the near-black of the pupils down to a
 * distinct lower band in the printed dark brown (DECISIONS 18), as the hero paints it, warming in its middle;
 * and one catchlight, high on the nose side where the sheet's sits, crisp, with a faint grey core. The sheets
 * draw no small catchlight (the turnaround, the hero, the glossy-eyes panel and the expression sheet's open
 * eyes each draw exactly one), so none is drawn: the spec's "one or two small ones" (L446, L509) is a question
 * for the founder. A faint pale halo lies outside the rim round its lower outer side, between the eye and the
 * hood's tan. `noseward` is +1 when the nose is to its right.
 */
function eye(landmark: P, noseward: number): Piece {
  const rx = 9.4, ry = 9.35, turn = 14 * noseward + ROLL_DEG, out = -noseward;
  // The ball sits a hair out from the landmark and 0.55 pt below it, so the dark iris's own centre (DECISIONS 10)
  // lands on the landmark with the eye's foot where the sheet's is.
  const [cx, cy]: P = [landmark[0] + out * 0.2 * cosR - 0.55 * sinR, landmark[1] + out * 0.2 * sinR + 0.55 * cosR];
  /** A point in the eye's own frame, rolled with the face: x toward the nose, y down. */
  const S = (x: number, y: number): P => [cx + noseward * x * cosR - y * sinR, cy + noseward * x * sinR + y * cosR];
  const oval = (c: P, a: number, b: number, deg = turn) => pathD(ellipse(c, a, b, deg));
  const clip = uid("eye"), irisClip = uid("eye"), outside = uid("crescent"), above = uid("band"), rimFade = uid("rim");
  const warm = uid("blur"), shine = uid("blur"), edge = uid("blur"), white = uid("blur"), band = uid("blur"), halo = uid("blur"), core = uid("blur");
  const box: Box = [cx - 14, cy - 14, 28, 28];
  const ball = oval([cx, cy], rx, ry);
  // The iris inside the rim, set 0.35 pt toward the nose and 0.4 pt down, so the rim is 1.4 pt over the top and
  // the outer side and 0.6 pt along the lower inner side.
  const rim = 1, irisAt: [number, number] = [0.35, 0.4], irisOval = oval(S(...irisAt), rx - rim, ry - rim);
  /** A disc's clip: everything round it but the disc, so what it clips is the iris less the disc. */
  const less = (c: P, r: number) => `M${fmt(cx - 30)} ${fmt(cy - 30)}H${fmt(cx + 30)}V${fmt(cy + 30)}H${fmt(cx - 30)}Z` + pathD(ellipse(c, r, r));
  // The white: the iris less a disc 13.85 pt in radius set 6.6 pt from the iris's centre toward the nose and 12
  // degrees down, which leaves a sliver 1.15 pt wide about 12 degrees above level on the outer side that thins to
  // nothing about 45 degrees either side.
  const cut = less(S(irisAt[0] + 6.6 * Math.cos(0.21), irisAt[1] + 6.6 * Math.sin(0.21)), 13.85);
  // The lower band: the iris less a disc 12.55 pt in radius set 8 pt above its centre, 3.8 pt deep at the foot and
  // running out about 80 degrees either side of it, so its top follows the eye's round.
  const lower = less(S(irisAt[0], irisAt[1] - 8), 12.55);
  const [t0x, t0y] = S(0, -ry);
  // The lash line: from below the outer corner, over the top, to the nose side's upper quarter, on the ball's rim.
  const around = (from: number, to: number, grow: number, n = 41): P[] => Array.from({ length: n }, (_, k) => {
    const a = ((from + ((to - from) * k) / (n - 1)) * Math.PI) / 180;
    return S(-(rx + grow) * Math.cos(a), -(ry + grow) * Math.sin(a));
  });
  const lidLine = tapered(around(-35, 120, 0.25), 1.8, "outer", "eye lid", { taper: 9, tip: 0.3 });
  // The halo: a soft pale band just outside the rim, from below the eye round its outer side.
  const haloBand = strokeOf(around(-125, 25, 1.1, 31), 1.7, { taper: 5, tip: 0.2 });
  const big = S(3.6, -4.55), warmAt = S(irisAt[0], irisAt[1] + 7.25);
  const n = (p: P) => `${fmt(p[0])}" cy="${fmt(p[1])}`;
  const svg = `<defs><clipPath id="${clip}"><path d="${ball}"/></clipPath><clipPath id="${irisClip}"><path d="${irisOval}"/></clipPath>` +
    `<clipPath id="${outside}"><path d="${cut}" clip-rule="evenodd"/></clipPath><clipPath id="${above}"><path d="${lower}" clip-rule="evenodd"/></clipPath>` +
    // The rim warms from near-black along the lid to the printed dark brown round the eye's foot, as the sheet's does.
    `<linearGradient id="${rimFade}" gradientUnits="userSpaceOnUse" x1="${fmt(t0x)}" y1="${fmt(t0y)}" x2="${fmt(2 * cx - t0x)}" y2="${fmt(2 * cy - t0y)}">` +
    `<stop offset="0.62" stop-color="${C.eyeDark}"/><stop offset="0.85" stop-color="${C.dark}"/></linearGradient>` +
    `${blur(warm, box, 0.45)}${blur(shine, box, 0.15)}${blur(edge, box, 0.22)}${blur(white, box, 0.25)}${blur(band, box, 0.55)}${blur(halo, box, 0.55)}${blur(core, box, 0.3)}</defs>` +
    `<path d="${haloBand.d}" fill="${C.fur}" opacity="0.8" filter="url(#${halo})"/>` +
    `<g filter="url(#${edge})"><path d="${ball}" fill="url(#${rimFade})"/><path d="${lidLine.d}" fill="${C.eyeDark}"/></g>` +
    `<g clip-path="url(#${clip})"><path d="${irisOval}" fill="${C.eyeDark}"/>` +
    // The lower band, its top edge soft but defined, warming through its middle above the foot.
    `<g clip-path="url(#${irisClip})"><g filter="url(#${band})"><path d="${irisOval}" fill="${C.dark}" clip-path="url(#${above})"/></g>` +
    `<ellipse cx="${n(warmAt)}" rx="3.7" ry="0.85" fill="${C.irisLight}" opacity="0.85" filter="url(#${warm})"/>` +
    `<g filter="url(#${white})"><path d="${irisOval}" fill="${C.eyeWhite}" clip-path="url(#${outside})"/></g></g></g>` +
    `<ellipse cx="${n(big)}" rx="1.75" ry="1.65" fill="${C.light}" filter="url(#${shine})"/>` +
    `<ellipse cx="${n(big)}" rx="0.7" ry="0.6" fill="${C.dark}" opacity="0.1" filter="url(#${core})"/>`;
  return piece(svg, box, { shapes: [], lines: [lidLine.line] });
}

/**
 * A brow in the face frame, as the sheet paints it: a short, thick, rounded dab of tan in the cream above the
 * hood, about 7.5 pt long and 2.2 pt thick, domed, its peak a third of the way in from its inner end and that
 * end lower than the peak, so the face reads happy rather than worried; soft at its edges.
 */
function brow(sx: number): Piece {
  const pts: P[] = [[sx * 26.3, -25.9], [sx * 24.4, -28.6], [sx * 21.9, -29.8], [sx * 19, -28.4]];
  const f = uid("blur"), box = faceBox([sx > 0 ? 15 : -31, -34, 16, 12]);
  return piece(`<defs>${blur(f, box, 0.35)}</defs><g filter="url(#${f})">` +
    inFace(`<path d="${strokeOf(pts, 2.2, { taper: 2.4, tip: 1 }).d}" fill="${C.marking}" opacity="0.72"/>`) + "</g>", box);
}

/**
 * The nose in the face frame, as the turnaround, the blush-cheeks panel and the hero draw it: a soft inverted
 * triangle, its top a gentle dome, broadest a little above its middle with round shoulders (the sheet's is 12.2 pt
 * wide there and about 7.7 pt tall), its sides running in full to a rounded point at the bottom centre that runs on
 * into the philtrum's top; a soft grey-brown sheen across its upper left, as the hero paints it.
 */
const noseShape = symmetric([[0, 4.35], [-2.3, 4.55], [-4, 5.05], [-5.1, 5.7], [-5.85, 6.55], [-6.1, 7.5], [-5.9, 8.6], [-5.1, 9.65], [-3.8, 10.6], [-2.3, 11.35],
  [-1.1, 11.9], [-0.5, 12.3]], [0, 12.5]);
function nose(): Piece {
  const f = uid("blur"), box: Box = [-8, 2, 16, 13];
  return piece(inFace(`<defs>${blur(f, box, 0.7)}</defs>` +`<path d="${pathD(noseShape.segs)}" fill="${C.eyeDark}"/>` +
    `<ellipse cx="-1.3" cy="6.05" rx="2.9" ry="1.05" transform="rotate(-6 -1.3 6.05)" fill="${C.noseSheen}" opacity="0.8" filter="url(#${f})"/>`), faceBox(box));
}

/**
 * The open happy mouth in the face frame, as the turnaround, the hero and the expression sheet's happy face draw
 * it. The upper lip is one line (the muzzle line, an inner line, 0.9 pt, tapering to fine points at its tips), a
 * deep red-brown over the opening and the printed dark brown out along its ends: from the philtrum's foot down
 * to the opening's top corners, about 9.3 pt either side, then on in a short flick that hooks up into a small
 * curl at each tip (12.9 pt out and 3 pt up). The lip IS the opening's top edge: the opening hangs straight
 * from it, widest at the top and narrowing in a rounded wedge to its foot (29.4 pt, as deep as the sheet's).
 * Inside, the dark red fills the opening right up to the line across its width and runs down both sides; the
 * tongue is a rounded pink lobe set low and centred, its top a convex mound (the sheet's peaks 4.6 pt under the
 * lip and meets the sides about 6 pt lower), with dark red showing round it at both sides and a soft light on
 * its top. The opening's sides carry a dark red-brown rim, heavier than the light one where the tongue meets
 * its foot.
 */
function mouth(): Piece {
  // One half of the lip, typed on the dog's left (the viewer's right), from the philtrum's foot to the curl's tip.
  const half: P[] = [[0, 14.2], [1.4, 15], [3.2, 15.8], [5.4, 16.5], [7.6, 16.95], [9.3, 17.05], [10.6, 16.75], [11.7, 16], [12.5, 15], [12.9, 14]];
  const lipShape = smooth([...mirrorX(half, false).slice(0, -1), ...half], { closed: false });
  const lip = tapered(sample(lipShape.segs, 12, false), 0.9, "inner", "upper lip", { taper: 2.2, tip: 0.3 });
  // The opening: along the lip from corner to corner, then down sides that slope in to a round foot.
  const opening = smooth([[0, 14.4], [3.2, 16], [5.4, 16.75], [7.6, 17.15], [9.2, 17.25], [8.55, 20.2], [7.45, 22.9], [6.3, 25.2], [4.85, 27.3], [2.7, 28.8], [0, 29.4],
    [-2.7, 28.8], [-4.85, 27.3], [-6.3, 25.2], [-7.45, 22.9], [-8.55, 20.2], [-9.2, 17.25], [-7.6, 17.15], [-5.4, 16.75], [-3.2, 16]], { corners: [0, 4, 16] });
  const m = pathD(opening.segs);
  // The rim down each side, from the top corner to where the tongue meets the side, drawn twice its width centred
  // on the edge inside the opening's clip, so the half that shows lies inside the opening; and a lighter one round
  // the foot under the tongue.
  const edgePts = sample(opening.segs.slice(opening.segs.findIndex((g) => g[0][0] === 9.2 && g[0][1] === 17.25)), 16, false)
    .filter(([x, y]) => y > 17.6 || Math.abs(x) > 9);
  const end = edgePts.findIndex(([x, y], i) => i > 4 && x < -9 && y < 17.6);
  const along = end > 0 ? edgePts.slice(0, end + 1) : edgePts;
  const doubled: [number, number] = [LIMITS.inner[0] * 2, LIMITS.inner[1] * 2];
  const sides = ([1, -1] as const).map((sx) => strokeOf(along.filter(([x, y]) => sx * x > 0 && y < 24.4).sort((a, b) => a[1] - b[1]), 1.8, { taper: 2.6, tip: 0.2, band: doubled }));
  const foot = strokeOf(along.filter(([, y]) => y > 21.6), 1.2, { taper: 3, tip: 0.1, band: doubled });
  const rimLines: DrawnLine[] = [...sides.map((s) => ({ kind: "inner" as const, width: 0.9, where: "mouth side", drawn: [s.drawn[0] / 2, s.drawn[1] / 2] as [number, number] })),
    { kind: "inner", width: 0.6, where: "mouth foot", drawn: [foot.drawn[0] / 2, foot.drawn[1] / 2] }];
  const clip = uid("mouth"), soft = uid("blur"), deep = uid("blur"), lit = uid("blur"), edge = uid("blur"), lipFade = uid("lip");
  // The tongue's top: a convex mound peaking 5 pt under the lip and running down to meet each side 5.5 pt lower.
  const TONGUE = "M-7.6 31 L-7.6 25.6 C-7.1 24.2 -6.6 23 -6 22 C-4.7 20.3 -2.6 19.4 0 19.35 C2.6 19.4 4.7 20.3 6 22 C6.6 23 7.1 24.2 7.6 25.6 L7.6 31Z";
  const philtrum = innerLine([[0, 11.4], [0, 14.4]], 0.9, C.eyeDark, { taper: 0.9, tip: 0.75, wobble: 0 });
  const box: Box = [-15, 10, 30, 21];
  const svg = `<defs><clipPath id="${clip}"><path d="${m}"/></clipPath>${blur(soft, box, 0.4)}${blur(deep, box, 0.8)}${blur(lit, box, 1.1)}${blur(edge, box, 0.2)}` +
    `<linearGradient id="${lipFade}" gradientUnits="userSpaceOnUse" x1="-13" y1="0" x2="13" y2="0">` +
    `<stop offset="0.08" stop-color="${C.dark}"/><stop offset="0.25" stop-color="${C.lipLine}"/><stop offset="0.75" stop-color="${C.lipLine}"/>` +
    `<stop offset="0.92" stop-color="${C.dark}"/></linearGradient></defs>` +
    `<path d="${m}" fill="${C.mouthInside}"/><g clip-path="url(#${clip})">` +
    // Deepest right under the lip and back into its corners, easing to the mouth's own red.
    `<path d="M-10 14 L10 14 L10 18 C6 18.1 3 17.2 0 17 C-3 17.2 -6 18.1 -10 18Z" fill="${C.mouthDeep}" opacity="0.6" filter="url(#${soft})"/>` +
    // The cavity in shade down both sides beside the tongue, as the sheet paints it a deeper maroon there.
    `<path d="M-10 17 L-7 17.4 C-7.2 19.6 -7.4 22.4 -8 25.4 L-10 25.4Z M10 17 L7 17.4 C7.2 19.6 7.4 22.4 8 25.4 L10 25.4Z" fill="${C.mouthDeep}" opacity="0.4" filter="url(#${soft})"/>` +
    // The tongue, its top soft where it meets the dark, with a soft light on its mound.
    `<path d="${TONGUE}" fill="${C.tongue}" filter="url(#${soft})"/>` +
    `<ellipse cx="-0.4" cy="21.6" rx="2.9" ry="1.25" fill="${C.tongueShine}" opacity="0.55" filter="url(#${lit})"/>` +
    `<g filter="url(#${edge})">${sides.map((s) => `<path d="${s.d}" fill="${C.mouthRim}"/>`).join("")}<path d="${foot.d}" fill="${C.tongueRim}"/></g></g>` +
    `<path d="${lip.d}" fill="url(#${lipFade})"/>${philtrum.svg}`;
  return piece(inFace(svg), faceBox(box), { shapes: [], lines: [lip.line, ...rimLines, { ...philtrum.line, where: "philtrum" }] });
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
 * The tag and the ring it swings from, which the turnaround paints blue on the blue collar. The heart is
 * painted as the sheet paints it: a flat matte gold, a slightly darker gold rim inside its line, one soft light
 * high on its left lobe, and the smaller heart engraved in it as one faint warm line: no bevel, no raised face.
 */
function tagPiece(): Piece {
  // The ring's edge is a plain stroke, drawn exactly as wide as it is declared.
  const ringLine: DrawnLine = { kind: "inner", width: 0.6, where: "tag ring", drawn: [0.6, 0.6] };
  const ring = piece(`<rect x="-0.9" y="-57.2" width="2.8" height="7.6" rx="1.4" fill="${C.collar}" stroke="${C.collarRim}" stroke-width="${ringLine.width}"/>` +
    `<rect x="-0.2" y="-56.6" width="0.8" height="6" rx="0.4" fill="${C.collarHighlight}"/>`, [-2, -58, 5, 9.4], { shapes: [], lines: [ringLine] });
  const emboss = sample(innerHeart.segs, 10);
  emboss.push(emboss[0]!);
  // The embossed heart's light, along its upper left lobe, where the light catches its raised edge.
  const lit = uid("blur"), raised = sample(innerHeart.segs, 10).filter(([x, y]) => x < TAG_X && y < -43.8);
  return join(ring, part("tag", heart, {
    fill: C.tag,
    shade: { multiply: C.tagShadeBy, rim: { inset: 1.3, toLight: 1.3 }, blur: 1 },
    under: `<defs>${blur(lit, [-8, -51, 10, 10], 0.35)}</defs><path d="${strokeOf(raised, 0.9, { taper: 1.6, tip: 0.2 }).d}" fill="${C.tagShine}" opacity="0.7" filter="url(#${lit})"/>`,
    // A soft matte light on the upper left lobe, not a bevel's glint.
    highlight: { d: "M-6.6 -47.4 a2.8 1.9 -40 1 0 5.6 0 a2.8 1.9 -40 1 0 -5.6 0", colour: C.tagShine, opacity: 0.45, blur: 1.4 },
    // The embossed heart's own rim, a little darker than the tag's gold.
    inner: [{ pts: emboss, width: 0.7, colour: C.tagLine, opacity: 0.6 }],
    outline: { colour: C.tagLine, width: 1.3, taper: 2, blur: 0.2 },
  }));
}

/**
 * An ear's paint (front c's, on front a's ears), as the sheet paints it: the tan deepening down the ear to a
 * browner tan at its lower clumps (the sheet's #E09B6C mid-ear to #C17D50 and #BC7847 at the bottom) under the
 * fur's own warm shade; the shade on the rim away from the light, along the inner edge where the ear tucks
 * under the head, and where the cheek's fluff hangs over it; a small soft light on its upper outer side; a few
 * soft fur locks, darker partings and lighter strokes along them, curving with the ear's bulge from its upper
 * middle down into the notches between the clumps of its lower edge, the partings' lower thirds drawn as fine
 * curved strands that fade out upward; and its line in the warm brown the sheet draws round the ears (#A47049
 * to #9D6C4B), heavier along the bottom, from where it comes out from under the cheek round the bottom and up
 * the outside, thinning and lightening to the crown's own line toward the root, where it goes on under the
 * crown at full width, so the crown's line runs on into it with no pinch.
 */
function earPaint(side: "L" | "R"): Paint {
  const k = side === "R" ? 1 : -1;
  const ear = ears[side];
  const deep = uid("deep"), parting = uid("blur"), along = uid("blur"), [ex0, ey0, ex1, ey1] = bbox(ear.segs);
  const earBox = pad([ex0, ey0, ex1 - ex0, ey1 - ey0], 2);
  // The locks' partings: curving down from the ear's upper middle with its outer contour into the notches between
  // the clumps, and a short one low toward the face; the lighter strokes run along the locks between them. Painted
  // soft, as the sheet paints them, not drawn as lines; only the partings' last few points into the notches are
  // drawn, as short fine strokes.
  const dark: P[][] = [[[-61.6, -115], [-67.6, -107.6], [-72.4, -98.4], [-75.2, -88.6], [-76, -79.6]], [[-56.6, -103.4], [-61.8, -94], [-65.4, -83.6], [-67, -72]],
    [[-50.8, -92], [-54, -82], [-55.6, -70.4]]];
  const light: P[][] = [[[-58.4, -110.4], [-64.4, -100.6], [-69, -90.6], [-71.2, -80.4]], [[-53.2, -98.4], [-58.4, -88.4], [-61.4, -77]]];
  const soft = (pts: P[][], width: number) => pts.map((l) => strokeOf(sample(smooth(l.map((p) => onEar(side, p)), { closed: false }).segs, 8, false), width, { taper: 6, tip: 0.2 }).d).join("");
  const under = `<defs><linearGradient id="${deep}" gradientUnits="userSpaceOnUse" x1="${-k * 52}" y1="-100" x2="${-k * 58}" y2="-60">` +
    `<stop offset="0" stop-color="${C.earDeep}" stop-opacity="0"/><stop offset="0.35" stop-color="${C.earDeep}"/>` +
    `<stop offset="0.72" stop-color="${C.earDeeper}"/><stop offset="1" stop-color="${C.earFoot}"/></linearGradient>` +
    `${blur(parting, earBox, 0.7)}${blur(along, earBox, 1)}</defs>` +
    `<rect x="${fmt(ex0)}" y="${fmt(ey0)}" width="${fmt(ex1 - ex0)}" height="${fmt(ey1 - ey0)}" fill="url(#${deep})"/>` +
    `<path d="${soft(light, 2.2)}" fill="${C.patch}" opacity="0.3" filter="url(#${along})"/>` +
    `<path d="${soft(dark, 1.5)}" fill="${C.earLow}" opacity="0.4" filter="url(#${parting})"/>`;
  const shadeD = "M-90 -92 C-80 -80 -62 -72 -40 -70 L-40 -50 L-90 -50Z";
  const cheekD = "M-38 -98 C-43 -93 -48.6 -85 -49.8 -74 C-49 -66 -45 -62 -40 -60Z";
  // Along the inner edge, where the ear tucks under the head's side.
  const innerD = "M-44 -128 C-48.4 -118 -49.4 -104 -48.8 -94 L-43 -94 L-43 -128Z";
  // The line begins under the crown at the root's top, so it comes out from under the crown at full weight,
  // carrying on the crown's own line; its upper run lightens toward the root and its lower run, heavier, takes
  // over down the outer side, the two cross-fading where their tapers overlap.
  const ends: [P, P] = [onEar(side, [-41.6, -67.2]), onEar(side, [-38.6, -140.6])];
  const [upper, lower] = [onEar(side, [-80.7, -84.6]), onEar(side, [-80.8, -91.6])];
  const toRoot = uid("earline"), strand = uid("strand");
  const lines = `<defs><linearGradient id="${toRoot}" gradientUnits="userSpaceOnUse" x1="0" y1="-136" x2="0" y2="-112">` +
    `<stop offset="0" stop-color="${C.crownLine}"/><stop offset="1" stop-color="${C.warmLine}"/></linearGradient>` +
    // The strands fade out upward, from their notches into the ear.
    `<linearGradient id="${strand}" gradientUnits="userSpaceOnUse" x1="0" y1="-66" x2="0" y2="-88">` +
    `<stop offset="0" stop-color="${C.earLine}" stop-opacity="0.55"/><stop offset="1" stop-color="${C.earLine}" stop-opacity="0"/></linearGradient></defs>`;
  return {
    fill: C.marking,
    under: under + lines,
    shade: { multiply: C.furShadeBy, rim: { inset: 2.2, toLight: 3.6 }, shapes: [earD(side, shadeD), earD(side, cheekD), earD(side, innerD)], blur: 3.2 },
    highlight: { d: earD(side, "M-74 -101 C-74 -106 -70 -111 -66 -112 C-64 -109 -66 -102 -69.6 -99 C-72 -98 -74 -99 -74 -101Z"), colour: C.patch, opacity: 0.3, blur: 2.6 },
    inner: dark.map((pts) => ({ pts: sample(smooth(pts.slice(-3).map((p) => onEar(side, p)), { closed: false }).segs, 8, false), width: 0.7, colour: `url(#${strand})` })),
    // A little lighter on the ear toward the light, heavier on the one away from it, and along each one's bottom.
    outline: { ...OUTLINE, colour: C.warmLine, width: 1.2, taper: 7, blur: 0.25, spans: side === "R"
      ? [{ from: ends[0], to: lower, width: 1.4 }, { from: upper, to: ends[1], colour: `url(#${toRoot})` }]
      : [{ from: ends[1], to: lower, width: 1.3, colour: `url(#${toRoot})` }, { from: upper, to: ends[0], width: 1.65 }] },
  };
}

/**
 * Between the front legs the sheet paints a warm-tan V: wide and light at its top, about 31 pt up, where the
 * chest's cream tuft hangs into its middle, narrowing and deepening down the slot between the legs (whose inner
 * edges lie over its sides) to a shadowed tan just above the paws, then easing out where the paws meet, so the
 * floor shows light under them. No line runs down its middle.
 */
function between(): string {
  const g = uid("between"), f = uid("blur");
  // The V's top: two horns either side of the chest's tuft, which hangs into it to y -27.6.
  const v = smooth([[-7.4, -32], [-4.8, -30.4], [-2.4, -28.6], [0.4, -27.6], [3, -28.6], [5.4, -30.4], [7.8, -32], [6.6, -25], [3.2, -14], [2.4, -3], [-2, -3],
    [-2.8, -14], [-6.2, -25]], { corners: [0, 6] });
  return `<defs><linearGradient id="${g}" gradientUnits="userSpaceOnUse" x1="0" y1="-32" x2="0" y2="-3">` +
    `<stop offset="0" stop-color="${C.marking}" stop-opacity="0.05"/><stop offset="0.25" stop-color="${C.marking}" stop-opacity="0.25"/>` +
    `<stop offset="0.55" stop-color="${C.marking}" stop-opacity="0.65"/><stop offset="0.8" stop-color="${C.earDeep}" stop-opacity="0.8"/>` +
    `<stop offset="1" stop-color="${C.earDeep}" stop-opacity="0"/></linearGradient>` +
    `${blur(f, [-12, -36, 24, 36], 0.9)}</defs>` +
    `<path d="${pathD(v.segs)}" fill="url(#${g})" filter="url(#${f})"/>`;
}

/**
 * Where the chin's fur lies on the collar, as the sheet paints it: the collar's dark rim right under the fur's
 * edge, following its tufts, and a soft shade of the band's own blue under that. Drawn centred on the chin's edge
 * (the head's own path), so only its lower half shows below the fur.
 */
function collarContact(): string {
  const f = uid("blur"), g = uid("blur");
  const chin = spanPoints(head, fracAt(head, cheekRoll([-32.4, -65.4])), fracAt(head, cheekRoll([32.4, -65.4])));
  const rim = strokeOf(chin, 2.1, { taper: 2.5, tip: 0.6 }).d;
  const shade = strokeOf(chin, 5, { taper: 4, tip: 1 }).d;
  return `<defs>${blur(f, [-31, -67, 62, 18], 0.3)}${blur(g, [-31, -67, 62, 18], 0.9)}</defs>` +
    `<path d="${shade}" fill="${C.collarLine}" opacity="0.45" filter="url(#${g})"/><path d="${rim}" fill="${C.collarRim}" opacity="0.9" filter="url(#${f})"/>`;
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
  add("body.back", part("body.back", back, backPaint));
  add("back.patch.R", marking("back.patch.R", { shape: back, paint: backPaint }, saddleR, { fill: C.marking, blur: 1.2, clip: true }));
  add("back.patch.L", marking("back.patch.L", { shape: back, paint: backPaint }, saddleL, { fill: C.marking, blur: 1.2, clip: true }));
  for (const side of ["R", "L"] as const) {
    const sx = side === "R" ? -1 : 1, cx = sx * 37.6, cy = -10.9;
    add(`hind.${side}`, roomy(part(`hind.${side}`, hind[side], {
      fill: C.fur,
      shade: furShade(hipGroup, [], [`M${cx - 12} ${cy - 12} L${cx + 12} ${cy - 12} L${cx + 12} ${cy - 4} L${cx - 12} ${cy - 4}Z`]),
      // Over its top, where it lies on the haunch, a soft light line that tapers off into the haunch at each end, as
      // the sheet draws it; then the warm line down its outer side and along the sole, to where it goes behind the
      // front paw. The two cross-fade on its outer side.
      outline: { ...OUTLINE, colour: C.pawLine, width: 1.3, taper: 4, spans: bySide(side, [{ from: [-33.4, -17.6], to: [-48.4, -13.6], width: THIN, colour: C.softLine },
        { from: [-47, -15.8], to: [-29.2, -4.6], width: 1.45 }]) },
      // Two toe lines rising from the sole about 6.5 pt up the paw, each bowing a little away from the middle toe.
      inner: [[[-41.6, -3.4], [-42.3, -5.8], [-42.2, -8.1], [-41.6, -10]], [[-35.6, -3.1], [-34.9, -5.5], [-34.9, -7.8], [-35.4, -9.7]]]
        .map((pts) => ({ pts: flipX(pts as P[], side), width: INNER, colour: C.pawLine, opacity: 0.65 })),
    }), 6));
  }
  // Its canvas a point roomier than the chest, so the light group's shade, which reaches 13.7 pt past it, stays
  // inside the paint's reach when the chest's top lands on a whole point.
  add("body.front", roomy(part("body.front", chest, {
    fill: C.fur,
    // The shade falls under the chin, just below the collar.
    shade: furShade(bodyGroup, ["M-22 -52 C-10 -48 10 -48 22 -52 L22 -58 L-22 -58Z"]),
    under: between(),
    // Its edge lies on the saddle's tan inside the silhouette, with no line, as the sheet paints it. The chest's
    // tuft hangs into the V's top in a few short pointed locks, its fur strokes combed down into the V as the
    // sheet and the hero draw them; no lines beside the tag.
    inner: [[[-3.4, -32.4], [-2.4, -30.4], [-1.4, -28.8]], [[3.8, -32.6], [2.9, -30.6], [2, -29]]]
      .map((pts) => ({ pts: pts as P[], width: 0.6, colour: C.softLine, opacity: 0.3 })),
  }), 1));
  // The chin's and the cheeks' shadow on the chest, cast by the head (spec L396): a soft band under the jaw's
  // scalloped edge, about 3 pt deep, falling on the shoulders' fur beside the collar's ends (the collar hides the
  // middle of it). Typed in the head's frame, as its jaw is, and rolled with it.
  const jawShade = ([[-42, -71.6], [0, -61.6], [42, -71.6], [40.4, -66.6], [31, -61.6], [21, -58.6], [9, -56.4], [0, -55.8], [-9, -56.4], [-21, -58.6],
    [-31, -61.6], [-40.4, -66.6]] as P[]).map(cheekRoll);
  add("shadow.chin", soft(pathD(smooth(jawShade, { corners: [0, 2] }).segs), [-43, -74.6, 86, 20], C.furShade, 1.3));
  // The collar (the sheet's paint): its dark rim right under the chin's fur, then the band's blue, lit along its
  // middle; the keeper the tag's ring hangs from; and a dark blue rim all round its lower edge and its ends
  // (#597C8F on the sheet), tucked under the cheeks' fur at the top.
  add("collar", part("collar", collar, {
    fill: C.collar,
    shade: { multiply: C.shadeBy, shapes: ["M-32 -57.4 C-16 -49.4 16 -49.4 32 -58.4 L32 -46 L-32 -46Z"], blur: 0.9 },
    highlight: { d: "M-21 -57.6 C-11 -54.4 10 -54.4 21 -58.8 L21 -56.6 C10 -52.4 -11 -52.4 -21 -55.6Z", colour: C.collarHighlight, opacity: 0.3, blur: 0.9 },
    under: `<rect x="-1.5" y="-60" width="4.4" height="10.4" rx="1.2" fill="${C.collarLine}" opacity="0.3"/>` + collarContact(),
    outline: { colour: C.collarRim, width: THIN, taper: 3, blur: 0.2, spans: [{ from: [26.2, -64], to: [-26.2, -62.7] }] },
  }));
  add("tag", tagPiece());
  for (const side of ["R", "L"] as const) add(`ear.${side}`, part(`ear.${side}`, ears[side], earPaint(side)));
  add("head.base", part("head.base", head, headPaint));
  for (const side of ["L", "R"] as const) {
    add(`head.patch.${side}`, marking(`head.patch.${side}`, { shape: head, paint: headPaint }, patches[side], { fill: C.patch, blur: 0.5, clip: false, fade: patchFade[side] }));
  }
  add("blush.L", blush(1));
  add("blush.R", blush(-1));
  add("eye.L", eye(EYE_L, -1), "open");
  add("eye.R", eye(EYE_R, 1), "open");
  add("brow.L", brow(1));
  add("brow.R", brow(-1));
  add("nose", nose());
  add("mouth", mouth(), "open");
  add("head.line", headLinePiece());
  const crease = uid("blur");
  add("tuft", part("tuft", tuft, {
    fill: C.fur,
    shade: { multiply: C.furShadeBy, rim: { inset: 3, toLight: 4.5 }, group: headGroup, keep: ["M-40 -152 L40 -152 L40 -130 L-40 -130Z"], blur: 2.4 },
    highlight: { d: headLight, colour: C.light, opacity: 0.4, blur: 4 },
    // A soft crease of the fur's shade down the middle lock, as the sheet paints it.
    under: `<defs>${blur(crease, [-8, -166, 12, 18], 0.7)}</defs>` +
      `<path d="${strokeOf([[-1.2, -161.6], [-2, -158], [-2.6, -153.4]], 1.8, { taper: 2.4, tip: 0.3 }).d}" fill="${C.marking}" opacity="0.35" filter="url(#${crease})"/>`,
    // The lines curl into the lobes as hair strokes: the left lobe's hooked start, its line curling down into the
    // notch under the tall middle lock, the middle lock's right side curling in over the right lobe, and the right
    // lobe's end hooking back under itself, as the sheet draws them.
    inner: [
      { pts: [[-26.8, -150.2], [-28.8, -150.4], [-30.3, -151.4]], width: 0.85, colour: C.crownLine, opacity: 0.8 },
      { pts: [[-12.6, -155.8], [-11.4, -154], [-11.8, -152.4]], width: 0.8, colour: C.crownLine, opacity: 0.7 },
      { pts: [[5.2, -159.8], [5, -157.6], [3.9, -156.2], [2.6, -155.9]], width: 0.8, colour: C.crownLine, opacity: 0.7 },
      { pts: [[22.6, -153.8], [21.2, -152.6], [19, -152.3]], width: 0.85, colour: C.crownLine, opacity: 0.8 },
    ],
    // Each lobe's line its own tapered stroke, stopping short at the notches, where the curls take over.
    outline: { ...OUTLINE, colour: C.crownLine, width: THIN, taper: 2.6, spans: [{ from: [-30.6, -150.4], to: [-11.8, -154.8] },
      { from: [-10.8, -155.8], to: [5.1, -159.2] }, { from: [6.4, -158.8], to: [22.8, -153] }] },
    feather: { from: [0, -146.5], to: [0, -150.5] },
  }));
  for (const side of ["R", "L"] as const) {
    const sx = side === "R" ? -1 : 1;
    // The leg's outer line comes in faint where the saddle's tan meets it and deepens to the paw's warm line at the
    // wrist, as the sheet's does: from y -36 on the side toward the light, from -37 on the other. Its inner line down the V
    // is a light warm line that deepens toward the paw (the sheet's #DCB896 at y -25 to #B9825B at -16).
    const top = side === "R" ? -36 : -37, fade = uid("legline"), inside = uid("legline"), toe = uid("toe");
    add(`front.${side}`, part(`front.${side}`, legs[side], {
      fill: C.fur,
      shade: furShade(bodyGroup, [], ["M-40 -60 L40 -60 L40 -34 L-40 -34Z"]),
      under: `<defs><linearGradient id="${fade}" gradientUnits="userSpaceOnUse" x1="0" y1="${top}" x2="0" y2="-14">` +
        `<stop offset="0" stop-color="${C.softLine}" stop-opacity="0.3"/><stop offset="0.35" stop-color="${C.softLine}"/><stop offset="1" stop-color="${C.pawLine}"/></linearGradient>` +
        `<linearGradient id="${inside}" gradientUnits="userSpaceOnUse" x1="0" y1="-31" x2="0" y2="-12">` +
        `<stop offset="0" stop-color="${C.softLine}" stop-opacity="0.4"/><stop offset="0.45" stop-color="${C.softLine}"/><stop offset="1" stop-color="${C.pawLine}"/></linearGradient>` +
        // The toe lines fade out toward their tops.
        `<linearGradient id="${toe}" gradientUnits="userSpaceOnUse" x1="0" y1="-1.4" x2="0" y2="-8">` +
        `<stop offset="0.35" stop-color="${C.pawLine}"/><stop offset="1" stop-color="${C.pawLine}" stop-opacity="0.1"/></linearGradient></defs>`,
      // Two toe lines rising from the sole's scallops about 6.5 pt up the paw (45% of it), each bowing a little away
      // from the middle toe, as the paw-stub and stubby-paws panels draw them.
      inner: [[[-20, -1.4], [-20.7, -3.6], [-20.8, -5.9], [-20.3, -8]], [[-11, -1.5], [-10.3, -3.7], [-10.2, -6], [-10.7, -8.1]]]
        .map((pts) => ({ pts: flipX(pts as P[], side), width: 0.8, colour: `url(#${toe})` })),
      outline: { ...OUTLINE, taper: 5, spans: bySide(side, [
        { from: [-5.8, -30.4], to: [-1.7, -12], width: THIN, colour: `url(#${inside})` },
        { from: [-1.4, -10.6], to: [-33.6, top], width: 1.35, colour: `url(#${fade})` },
      ]) },
      // Its top fades in under the shoulder, so it comes out from under the saddle's tan with no edge.
      feather: { from: [sx * 31, -45.6], to: [sx * 31, -41.8] },
    }));
  }
  return out;
}

/** Points the sheet has no finder for, where this drawing puts them (dev output for the sheet match). */
export const landmarks: Record<string, P> = {
  "paw.front.L": [15.2, -5.4],
  "paw.front.R": [-15.2, -5.4],
  "paw.hind.L": [37.6, -10.9],
  "paw.hind.R": [-37.6, -10.9],
  // The ring's top as it shows below the chin; it swings from its hidden top, the tag's pivot at (0.4, −57.5).
  "tag.ring": [0.4, -55.6],
  // The seat: the body's lowest point on the midline is at −1.6, showing between the front paws; taken 0.8 pt inside.
  seat: [0, -2.4],
};
