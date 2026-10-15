// The dog's front view: shapes first, every node typed by hand in model space
// (points, the ground under the seat at 0, 0, y down) at the extremes and
// inflections read off the front turnaround, then paint. Light groups share one
// light across joined parts (head and tuft, chest and front legs, haunches and
// hind paws); joins are feathered and carry no rim and no line.
import { furEdge, furSpan, type Lock } from "../../../draw/fur.ts";
import { arc, bbox, ellipse, fracAt, mirrorX, pathD, polyD, rotate, sample, smooth, spanPoints, symmetric, v, type Node, type P, type Seg, type Shape } from "../../../draw/geom.ts";
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
  [-32.4, -34], [-31.6, -26], [-29.6, -17], [-26.4, -9], [-20, -4.4], [-8, -3.2]], [0, -3]);

// The front legs: short chubby columns that come out of the chest side by
// side, as the sheet draws them, their inner edges running down from the V's
// top just under the tag (x -1.8 at y -30) and parting a little toward the
// wrist (-4.7 at -10.6), so the V between them widens downward; each comes out
// from under the shoulder's saddle, its outer edge where the sheet draws the
// leg's fine line against the haunch (x -35.2 at y -41, -32.2 at -21),
// narrowing to the wrist (x -30 at y -15.8), then swelling into a round bun of a paw (x
// -30.7 at y -11.2 outside, -3.4 at -6.4 inside), its outer corner well
// rounded, its sole convex and dipping a little at the two toe lines (concave
// corners), so it rests on the ground in three round toes, as the sheet's does.
// Its top, hidden in the chest's fur, stays under the tag's point and clear of
// the heart's sides, so the tag hangs in front of the chest whole.
const legR: Node[] = [[-1.6, -33.4], [-1.8, -30], [-3.1, -22], [-4.5, -14.6], [-4.7, -10.6], [-3.4, -6.4], [-4.2, -2.9], [-7.6, -0.9], [-11.4, -1], [-16, -0.1],
  [-20.6, -1.05], [-24.2, -1.3], [-27.8, -3.2], [-30, -6.8], [-30.7, -11.2], [-30, -15.8], [-32.2, -21], [-33.8, -28], [-34.8, -35], [-35.2, -41],
  [-33, -47], [-26, -44], [-15, -40.4], [-6.8, -37.4]];
/** The sole's dips at the toe lines (concave, so no corner rule applies). */
const FRONT_TOES = [8, 10];
const legs = { R: smooth(legR, { corners: FRONT_TOES }), L: smooth(mirrorX(legR), { corners: FRONT_TOES.map((j) => (legR.length - j) % legR.length) }) };

// The collar: a band round the neck, following the chin down to a dip at the
// front, as the sheet draws it: about 8.5 pt deep at the front with its rims
// (the sheet's 8.2 to 8.7 at x -14 to 16), 6.5 at x 20 and 4 where its ends
// tuck in against the neck under the cheeks, each end a rounded square where it
// turns away round the neck, both the same. The sheet's head roll tips it a
// little: its left end sits higher and reaches 2 pt further out.
const collar = smooth([[-26.4, -62.6], [-21, -61.2], [-10, -59], [0, -58.2], [10, -59.4], [20.5, -62], [26.4, -63.9], [28, -63.4], [28.5, -61.6],
  [27.4, -59.6], [22.6, -55.4], [17, -52.6], [10, -50.4], [0, -49.8], [-10, -50], [-15, -50.8], [-19.4, -52.6], [-22.6, -55], [-25, -57.2], [-26.8, -59],
  [-27.4, -60.8]]);

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
const inset = ([x, y]: Node): Node => [x * 0.57, -43.6 + (y + 43.6) * 0.57];
const innerHeart = shift(symmetric(HEART.map(inset), inset(HEART_FOOT), { corners: [0] }), TAG_X);

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
  [-36.9, -129.4], [-41.6, -120.6], [-45.6, -114.4], [-47, -105], [-46.4, -97.4], [-44.4, -93], [-46.4, -88.6], [-45.4, -77.8],
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
  R: [{ len: 2.9, w: 1.5, lean: 0.35 }, { len: 2.1, w: 1.1, lean: 0.45 }, { len: 1.7, w: 0.85, lean: 0.55 }, { len: 0.9, w: 0.45, lean: 0.65 }],
  L: [{ len: 3.1, w: 1.6, lean: 0.3 }, { len: 1.6, w: 0.8, lean: 0.45 }, { len: 2.2, w: 1.1, lean: 0.55 }, { len: 0.9, w: 0.5, lean: 0.65 }],
};
const chinLocks = [{ len: 0.8, w: 0.8, lean: -0.4 }, { len: 1.2, w: 1.1, lean: -0.3 }, { len: 0.9, w: 0.9, lean: -0.2 }, { len: 1.3, w: 1.2, lean: -0.05 },
  { len: 1, w: 1, lean: 0.1 }, { len: 1.25, w: 1.15, lean: 0.25 }, { len: 0.85, w: 0.85, lean: 0.4 }];
/** Each cheek clump's tip, root and notches (path order), for its line and the shade under it. */
const clumps: { tip: P; root: P; notches: [P, P] }[] = [];
const noteClump = (tip: P, root: P, notches: [P, P]) => clumps.push({ tip, root, notches });
head = furEdge(head, cheekRoll([-45.4, -91.8]), cheekRoll([-36.4, -68.8]), cheekLocks.R, 0.42, noteClump);
head = furEdge(head, cheekRoll([36.4, -68.8]), cheekRoll([45.4, -91.8]), lefthandOf(cheekLocks.L), 0.42, noteClump);
/** The chin's tufts' notches, in path order, for their lines. */
const chinTufts: [P, P][] = [];
head = furEdge(head, cheekRoll([-32.4, -65.4]), cheekRoll([32.4, -65.4]), chinLocks, 0.36, (_tip, _root, notches) => chinTufts.push(notches));
// The crown's fur where it overhangs each ear's root is a lock of fur, its tip a fur span, so the crown's line can
// run on round it into the ear's own line, unbroken, as the sheet draws it. Between the topknot and each ear the
// crown's outline breaks over a small lock of fur, as the sheet's does.
head = furSpan(furSpan(head, [-45, -135.6], [-44.4, -134.3]), [39.4, -140.4], [40.2, -141.6]);
const crownLocks = [{ len: 0.85, w: 1, lean: 0.35 }, { len: 0.55, w: 0.8, lean: 0.45 }];
head = furEdge(furEdge(head, [-35.6, -145.1], [-38.6, -142.6], crownLocks, 0.26), [38.4, -144.6], [35.4, -147], lefthandOf(crownLocks), 0.26);

// The topknot: three fur lobes, typed node by node (the sheet's tuft): the side
// lobes low and broad, the middle one tall and a little pointed, like a flame
// leaning right, each ending in a curl, the side lobes coming down to the
// crown's line at their feet, where the two lines meet in a point.
const tuft = furSpan(smooth([[-31, -147.6], [-29.8, -152.6], [-26.6, -155.6], [-22, -157], [-17.4, -157.4], [-13.4, -156.4], [-11.2, -154],
  [-9.6, -158], [-6.8, -161.4], [-3.6, -163.5], [0.7, -164.4], [3.4, -163.2], [5, -160.8], [5.2, -158], [8.6, -159.4], [12.4, -160.2], [16.6, -159.8],
  [20.8, -158.4], [23.2, -155.6], [22.4, -150.6], [14, -146.6], [0, -145.4], [-18, -146.2]], { corners: [6, 13] }), [-31, -147.6], [22.4, -150.6]);

// The head patches, as the sheet paints them: a rounded hood over the top and
// outer side of each eye, like the rim of a pair of round spectacles, its top
// edge one smooth arch about 9 pt above the eye with the brow in the cream
// above it, its nose end down the eye's inner side to about mid-eye; and a band
// of the same tan down the face's side, inside its line, from where the ear's
// root shows under the crown down to the cheek's puff. Between the two a strip
// of cream comes down from the forehead round the hood's outer top to a point
// about level with the eye's top (a concave corner at its tip); on the right the
// band reaches up under the head's edge, so it runs on into the root's tan.
// Below the eye and the hood the face is cream. Typed per side, as the sheet
// draws them (the left about 3 pt higher, with the head's roll), with about 4
// pt of bleed past the head's edge; the eye covers what is typed under it.
// Their edges are soft but defined: a sigma of 0.5 pt.
const patches = {
  R: smooth([[-43, -86.6], [-49.6, -86], [-50, -106], [-48.6, -124], [-44.4, -130.6], [-39.6, -129.2], [-37.6, -126.4], [-38.8, -122.2], [-39.6, -119.2],
    [-39, -116.2], [-37.8, -113.4], [-35.4, -115.6], [-32.4, -118.4], [-28.4, -118.8], [-22.4, -117.6], [-18.4, -114.6], [-15.8, -108.6], [-15.6, -102.4],
    [-18, -98], [-26, -93.4], [-33.4, -90.2], [-38.4, -88.4]], { corners: [10] }),
  L: smooth([[43.4, -91.4], [49, -90.4], [49.4, -110], [44.6, -125], [39.4, -131.8], [34.6, -131.2], [33, -127], [32.4, -123.2], [31.2, -121.2],
    [28.4, -121.8], [24, -122.2], [19.6, -121.4], [16, -118.8], [13.6, -114], [12.6, -108.4], [13.2, -103.4], [18, -96.6], [28, -94.4], [34.4, -94.2], [39.6, -93.2]], { corners: [8] }),
};
/** Each hood's end toward the nose softens a little more than its edge, as the sheet's does. */
const patchFade = { R: { from: [-16.8, -105.4], to: [-13.6, -104.4] }, L: { from: [14.2, -109.6], to: [11, -108.6] } } satisfies Record<string, Fade>;
// The saddle's two halves where they show from the front, as the sheet paints
// them. The right half runs down the shoulder from under the collar's end, a
// strip of tan along the line, and widens into a rounded tear over the outer
// haunch down to the hind paw's top, its inner edge along the front leg's line
// down to y -30 and then out across the thigh (x -40 at y -24.6, -45 at -16.4),
// leaving a wedge of cream between it and the leg above the hind paw. The left
// half is a narrow streak down the shoulder from under the collar's end, outside
// the front leg's line (the sheet's, x 36 to 41 from y -47 to -32), running out
// to a point at the top of the haunch, whose round is cream.
const saddleR = smooth([[-27, -64.2], [-31.6, -63.4], [-37.4, -55], [-43, -46], [-53, -36], [-54, -20], [-49, -14.6], [-45, -16.4], [-42.4, -20.2], [-40, -24.6],
  [-38, -29], [-36.2, -34.4], [-35, -40], [-33.4, -46.4], [-30.8, -53], [-28.4, -58.6]]);
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
const headGroup = [head, tuft];

const backPaint: Paint = {
  fill: C.fur,
  shade: furShade(hipGroup),
  // From under the collar's end down the shoulder, the lighter fur line, coming out from under the collar; round
  // the haunch, the warm brown the sheet draws there (#9B6946 at its darkest), lighter and thinner on the side
  // toward the light. The two cross-fade where the shoulder meets the haunch, their tapers overlapping.
  outline: { ...OUTLINE, colour: C.warmLine, width: 1.25, taper: 6, spans: [
    { from: [-29.2, -61.4], to: [-38.8, -42.6], width: THIN, colour: C.furLine }, { from: [-35.6, -47.6], to: [-47.4, -11], colour: C.outline },
    { from: [47.4, -11], to: [35.6, -47.6], width: 1.4 }, { from: [38.8, -42.6], to: [29.2, -61.4], width: THIN, colour: C.furLine }] },
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
  { from: [-39.9, -123.8], to: [-44.8, -93.2], width: THIN, colour: `url(#${SEAM})` },
  { from: [44.4, -93.2], to: [33.7, -129.4], width: THIN, colour: `url(#${SEAM})` },
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
 * The cheeks' lines, as the sheet draws them: a thin warm line round each clump, from the notch above it over its
 * tip and down into the notch below, tapering out at both, so the line breaks where the fur parts and the edge
 * reads as clumps of fur, not a cookie-cutter row; lighter on the upper clumps, where they lie on the ear's lit
 * tan, deeper on the lower ones over its shaded foot (the sheet's #B17546 above to #A26842 below); and a fainter
 * one round each of the chin's tufts where they lie on the collar. And in each of the fuller clumps one fine fur
 * stroke, combed with it from inside the cheek out toward its tip.
 */
const CHEEK = uid("cheek");
function cheekLines(): { outline: Outline; strokes: P[][] } {
  const spans: Span[] = clumps.filter(({ tip, root }) => v.len(v.sub(tip, root)) >= 1.2).map(({ notches }) => ({ from: fracAt(head, notches[0]), to: fracAt(head, notches[1]), colour: `url(#${CHEEK})` }));
  // The chin's tufts where they lie on the collar, each with its own faint line, lighter than the cheeks'.
  spans.push(...chinTufts.slice(1, -1).map(([a, b]) => ({ from: fracAt(head, a), to: fracAt(head, b), colour: C.fluffLine })));
  const strokes = clumps.filter(({ tip, root }) => v.len(v.sub(tip, root)) >= 1.9).map(({ tip, root, notches }) => {
    // The path runs down the right cheek and up the left, so a clump's lower notch is its second on the right.
    const below = tip[0] < 0 ? notches[1] : notches[0];
    const along = v.sub(tip, root), aside = v.mul(v.sub(below, root), 0.3);
    return [v.add(v.add(root, v.mul(along, -0.9)), v.mul(aside, 0.7)), v.add(v.add(root, v.mul(along, -0.15)), v.mul(aside, 1.05)), v.add(v.add(root, v.mul(along, 0.55)), v.mul(aside, 0.85))];
  });
  return { outline: { ...OUTLINE, width: THIN, taper: 1.6, blur: 0.2, spans }, strokes };
}
/** Two sets of ribbons as one. */
const join2 = (a: ReturnType<typeof ribbons>, b: ReturnType<typeof ribbons>): ReturnType<typeof ribbons> =>
  ({ svg: a.svg + b.svg, lines: [...a.lines, ...b.lines], outlined: [...a.outlined, ...b.outlined] });
/** head.line: the head's outline as its own unclipped region, drawn after the head's clip group, reaching 0.5 pt past the head. */
function headLinePiece(): Piece {
  const r = join2(ribbons(head, headLine, "head.line", 0.5), ribbons(head, crownLine, "head.line", 0.5));
  const cheeks = cheekLines();
  const c = ribbons(head, cheeks.outline, "head.line", 0.5);
  const strokes = cheeks.strokes.map((pts) => innerLine(pts, 0.7, C.puffLine, { opacity: 0.45, taper: 1.4, tip: 0.15 }));
  const f = uid("blur"), g = uid("blur");
  const [x0, y0, x1, y1] = bbox(head.segs);
  // Room for the feathered cream round the cheeks' fluff, which reaches 3.8 pt past the head (half its width and
  // three times its blur), so the region's canvas holds all of it.
  const box = pad([x0, y0, x1 - x0, y1 - y0], 4);
  // Where the crown's fur and the face meet the ears' tan at the temples with no line, the sheet's edge is soft:
  // the crown's cream fur lies out over the root's tan in a feathered edge, softly along the underside of the
  // overhang and more broadly (about 3 pt from tan to cream) round the tan's inner end and down the face's side
  // to where its line begins, so the root's tan tucks in under the cream with no cut edge and no corner.
  const s = uid("blur");
  const feathered = (spans: [P, P][], width: number) => spans.map(([a, b]) =>
    strokeOf(spanPoints(head, fracAt(head, cheekRoll(a)), fracAt(head, cheekRoll(b))), width, { taper: 3, tip: 0.4 }).d).join("");
  const under = feathered([[[-45.6, -134.8], [-34.6, -135]], [[33, -139.6], [40.6, -140.6]]], 1.4);
  const side = feathered([[[-34.4, -134.4], [-41.4, -121.4]], [[39.2, -123.4], [31.6, -139.2]]], 1.6);
  return piece(`<defs>${blur(f, pad(box, 2), headLine.blur!)}${blur(g, pad(box, 2), 0.35)}${blur(s, pad(box, 2), 0.55)}` +
    `<linearGradient id="${SEAM}" gradientUnits="userSpaceOnUse" x1="0" y1="-131" x2="0" y2="-104">` +
    `<stop offset="0" stop-color="${C.crownLine}"/><stop offset="0.4" stop-color="${C.earEdge}"/><stop offset="1" stop-color="${C.earLine}"/></linearGradient>` +
    `<linearGradient id="${CHEEK}" gradientUnits="userSpaceOnUse" x1="0" y1="-92" x2="0" y2="-66">` +
    `<stop offset="0" stop-color="${C.earEdge}"/><stop offset="1" stop-color="${C.warmLine}"/></linearGradient></defs>` +
    `<path d="${under}" fill="${C.fur}" opacity="0.55" filter="url(#${s})"/><path d="${side}" fill="${C.fur}" opacity="0.6" filter="url(#${s})"/>` +
    `<g fill="${headLine.colour}" filter="url(#${f})">${r.svg}</g>` +
    `<g filter="url(#${g})">${c.svg}${strokes.map((l) => l.svg).join("")}</g>`, box, {
    shapes: [{ name: "head.line", nodes: head.typed, segs: head.segs, outlined: [...r.outlined, ...c.outlined], fur: head.fur.map(([a, b]) => [fracAt(head, a), fracAt(head, b)]) }],
    lines: [...r.lines, ...c.lines.map((l) => ({ ...l, where: "cheek clump" })), ...strokes.map((l) => ({ ...l.line, where: "cheek fur" }))],
  });
}

/**
 * An open eye at its landmark, as the turnaround, the hero and the expression sheet's open eyes paint it: an
 * oval a little taller than it is wide (the sheet's dark eye fits 18.5 by 19.5 pt), rolled with the face, its
 * edge a little soft. The rim is a lash line, heaviest along the upper lid and the upper outer side, where it
 * flicks a little out past the ball at the outer top corner, near-black there and warming to the printed dark
 * brown round the eye's foot, thinnest along the foot. Inside it the iris fills the eye: the near-black of the
 * pupil over its upper two thirds, then a lower third that warms through the printed dark brown (DECISIONS 18)
 * to a soft reddish-brown glow above the foot, as the hero paints it. The white of the eye is a thin warm sliver
 * between the rim and the iris low on the outer side, where the sheet draws it: from a little above level down
 * to below the eye's outer foot, widest (1.4 pt, about 8% of the eye's width, as the sheet's measures) a third
 * of the way round below level, tapering to nothing at both ends and greying toward its top in the lid's shade;
 * its inner edge crisp, so it reads as the eye's white, never as a reflection. One catchlight, high on the nose
 * side where the sheet's sits, crisp, with a faint grey core. The sheets draw no small catchlight (the
 * turnaround, the hero, the glossy-eyes panel and the expression sheet's open eyes each draw exactly one), so
 * none is drawn: the spec's "one or two small ones" (L446, L509) is a question for the founder (Q26). A faint
 * pale halo lies outside the rim round its lower outer side, between the eye and the hood's tan. `noseward` is
 * +1 when the nose is to its right.
 */
function eye(landmark: P, noseward: number): Piece {
  const rx = 8.8, ry = 9.5, turn = 20 * noseward + ROLL_DEG, out = -noseward;
  // The ball sits a hair out from the landmark and 0.45 pt below it, so the dark eye's own centre (DECISIONS 10)
  // lands on the landmark with the eye's foot where the sheet's is.
  const [cx, cy]: P = [landmark[0] + out * 0.15 * cosR - 0.45 * sinR, landmark[1] + out * 0.15 * sinR + 0.45 * cosR];
  /** A point in the eye's own frame, rolled with the face: x toward the nose, y down. */
  const S = (x: number, y: number): P => [cx + noseward * x * cosR - y * sinR, cy + noseward * x * sinR + y * cosR];
  const oval = (c: P, a: number, b: number, deg = turn) => pathD(ellipse(c, a, b, deg));
  const clip = uid("eye"), rimFade = uid("rim"), lowFade = uid("iris"), greys = uid("white");
  const shine = uid("blur"), edge = uid("blur"), crisp = uid("blur"), band = uid("blur"), halo = uid("blur"), core = uid("blur"), glow = uid("blur");
  const box: Box = [cx - 14, cy - 14, 28, 28];
  const ball = oval([cx, cy], rx, ry);
  // The eye's opening inside the dark rim, which is 1 pt wide down both sides, 1.3 pt over the top and 0.8 pt
  // along the foot; the iris fills it.
  const [ox, oy] = [rx - 1, ry - 1.05], oc = S(0, 0.25);
  const opening = oval(oc, ox, oy);
  /** A point on an oval about the opening's centre, `a` degrees round from the outer side (up positive), in the eye's frame turned with it. */
  const tilt = ((turn - ROLL_DEG) * Math.PI) / 180 * noseward;
  const onOpening = (a: number, inset: number): P => {
    const r = (a * Math.PI) / 180;
    const [x, y] = [-(ox - inset) * Math.cos(r), -(oy - inset) * Math.sin(r)];
    return S(0 + x * Math.cos(tilt) - y * Math.sin(tilt), 0.25 + x * Math.sin(tilt) + y * Math.cos(tilt));
  };
  // The white: a sliver from 26 degrees above the outer side's level to 64 below, its width rising and falling
  // like a beta curve that peaks a third of the way round below level, its outer edge just under the rim.
  const [a1, a2, wide] = [38, -74, 1.6];
  const steps = 28, peak = (t: number) => Math.pow(4 * Math.pow(t, 1.25) * (1 - Math.pow(t, 1.25)), 0.6);
  const top = 1;
  const outerEdge: P[] = [], innerEdge: P[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, a = a1 + (a2 - a1) * t;
    outerEdge.push(onOpening(a, -0.3));
    innerEdge.push(onOpening(a, (wide * peak(t)) / top));
  }
  const sliver = polyD([...outerEdge, ...innerEdge.reverse()]);
  const [s0, s1] = [onOpening(a1, 0.5), onOpening(-20, 0.5)];
  const [t0x, t0y] = S(0, -ry);
  // The lash line: from the outer side a little above level, over the top, to the nose side's upper quarter, on
  // the ball's rim; its outer end swings out a little past the ball, the lid's small flick at the outer corner.
  const around = (from: number, to: number, grow: (a: number) => number, n = 41): P[] => Array.from({ length: n }, (_, k) => {
    const deg = from + ((to - from) * k) / (n - 1), a = (deg * Math.PI) / 180;
    return S(-(rx + grow(deg)) * Math.cos(a), -(ry + grow(deg)) * Math.sin(a));
  });
  const flick = (a: number) => 0.25 + 0.25 * Math.exp(-(((a - 30) / 22) ** 2));
  const lidLine = tapered(around(-18, 122, flick), 1.8, "outer", "eye lid", { taper: 8, tip: 0.3 });
  // The halo: a soft pale band just outside the rim, from below the eye round its outer side.
  const haloBand = strokeOf(around(-125, 25, () => 1.1, 31), 1.7, { taper: 5, tip: 0.2 });
  const big = S(3.5, -4.6), glowAt = S(1, 5.2);
  const n = (p: P) => `${fmt(p[0])}" cy="${fmt(p[1])}`;
  // The lower third: down the eye's own axis, clear above, the printed dark brown from a little below level to
  // the foot, which the rim's warm brown meets.
  const [l0x, l0y] = S(0, -2.5), [l1x, l1y] = S(0, 5.4);
  const svg = `<defs><clipPath id="${clip}"><path d="${opening}"/></clipPath>` +
    // The rim warms from near-black along the lid to the printed dark brown round the eye's foot, as the sheet's does.
    `<linearGradient id="${rimFade}" gradientUnits="userSpaceOnUse" x1="${fmt(t0x)}" y1="${fmt(t0y)}" x2="${fmt(2 * cx - t0x)}" y2="${fmt(2 * cy - t0y)}">` +
    `<stop offset="0.62" stop-color="${C.eyeDark}"/><stop offset="0.85" stop-color="${C.dark}"/></linearGradient>` +
    `<linearGradient id="${lowFade}" gradientUnits="userSpaceOnUse" x1="${fmt(l0x)}" y1="${fmt(l0y)}" x2="${fmt(l1x)}" y2="${fmt(l1y)}">` +
    `<stop offset="0" stop-color="${C.dark}" stop-opacity="0"/><stop offset="0.55" stop-color="${C.dark}" stop-opacity="0.55"/><stop offset="1" stop-color="${C.dark}"/></linearGradient>` +
    // The white greys toward its top, under the lid's shade.
    `<linearGradient id="${greys}" gradientUnits="userSpaceOnUse" x1="${fmt(s0[0])}" y1="${fmt(s0[1])}" x2="${fmt(s1[0])}" y2="${fmt(s1[1])}">` +
    `<stop offset="0" stop-color="${C.dark}" stop-opacity="0.45"/><stop offset="1" stop-color="${C.dark}" stop-opacity="0"/></linearGradient>` +
    `${blur(shine, box, 0.15)}${blur(edge, box, 0.22)}${blur(crisp, box, 0.16)}${blur(band, box, 0.5)}${blur(halo, box, 0.55)}${blur(core, box, 0.3)}${blur(glow, box, 0.9)}</defs>` +
    `<path d="${haloBand.d}" fill="${C.fur}" opacity="0.8" filter="url(#${halo})"/>` +
    `<g filter="url(#${edge})"><path d="${ball}" fill="url(#${rimFade})"/><path d="${lidLine.d}" fill="${C.eyeDark}"/></g>` +
    // The iris in the opening: the pupil's near-black, its lower third warming through the dark brown to a soft
    // reddish glow above the foot; then the white over it, crisp.
    `<g clip-path="url(#${clip})"><path d="${opening}" fill="${C.eyeDark}"/>` +
    `<g filter="url(#${band})"><path d="${opening}" fill="url(#${lowFade})"/></g>` +
    `<ellipse cx="${n(glowAt)}" rx="4.6" ry="1.9" transform="rotate(${fmt(turn)} ${fmt(glowAt[0])} ${fmt(glowAt[1])})" fill="${C.irisWarm}" opacity="0.5" filter="url(#${glow})"/>` +
    `<g filter="url(#${crisp})"><path d="${sliver}" fill="${C.fur}"/><path d="${sliver}" fill="url(#${greys})"/></g></g>` +
    `<ellipse cx="${n(big)}" rx="1.85" ry="1.75" fill="${C.light}" filter="url(#${shine})"/>` +
    `<ellipse cx="${n(big)}" rx="0.7" ry="0.6" fill="${C.dark}" opacity="0.1" filter="url(#${core})"/>`;
  return piece(svg, box, { shapes: [], lines: [lidLine.line] });
}

/**
 * A brow in the face frame, as the sheet paints it: a thick tan comma in the cream above the hood, about 9 pt
 * long and 2.8 pt thick at its middle, tapering round to both ends, one gentle arch whose crown sits a little
 * nearer its inner end, which lies higher than its outer end, so the face reads happy rather than worried; soft
 * at its edges.
 */
function brow(sx: number): Piece {
  const pts: P[] = ([[27.4, -25.4], [26, -27.4], [24.2, -28.8], [22.2, -29.4], [20.2, -29.1], [18.6, -28.2]] as P[]).map(([x, y]): P => [sx * x, y]);
  const f = uid("blur"), box = faceBox([sx > 0 ? 15 : -31, -34, 16, 12]);
  return piece(`<defs>${blur(f, box, 0.35)}</defs><g filter="url(#${f})">` +
    inFace(`<path d="${strokeOf(sample(smooth(pts, { closed: false }).segs, 8, false), 2.8, { taper: 3.4, tip: 0.6 }).d}" fill="${C.marking}" opacity="0.85"/>`) + "</g>", box);
}

/**
 * The nose in the face frame, as the turnaround, the blush-cheeks panel and the hero draw it: a soft rounded
 * inverted triangle, its top a gentle dome, broadest a little above its middle with round shoulders (the sheet's
 * is 12.3 pt wide there and about 7.5 pt tall), its sides running in full to a round foot that runs on into the
 * philtrum's top; near-black at its edge, warming a little to the printed dark brown in its middle, as the
 * turnaround paints it, and a soft grey-brown sheen across its upper left, as the hero paints it.
 */
const noseShape = symmetric([[0, 4.35], [-2.4, 4.5], [-4.1, 5], [-5.2, 5.7], [-5.95, 6.6], [-6.15, 7.6], [-5.85, 8.8], [-4.8, 9.85], [-3.4, 10.9], [-1.9, 11.65],
  [-0.8, 12.05]], [0, 12.2]);
function nose(): Piece {
  const f = uid("blur"), g = uid("blur"), box: Box = [-8, 2, 16, 13];
  return piece(inFace(`<defs>${blur(f, box, 0.7)}${blur(g, box, 1.1)}</defs><path d="${pathD(noseShape.segs)}" fill="${C.eyeDark}"/>` +
    `<ellipse cx="0.2" cy="8.2" rx="3.3" ry="1.9" fill="${C.dark}" opacity="0.55" filter="url(#${g})"/>` +
    `<ellipse cx="-1.3" cy="6.05" rx="2.9" ry="1.05" transform="rotate(-6 -1.3 6.05)" fill="${C.noseSheen}" opacity="0.8" filter="url(#${f})"/>`), faceBox(box));
}

/**
 * The open happy mouth in the face frame, as the turnaround, the hero and the expression sheet's happy face draw
 * it. The upper lip is one line (the muzzle line, an inner line, 0.9 pt, tapering to fine points at its tips), a
 * deep red-brown over the opening and the printed dark brown out along its ends: from the philtrum's foot down
 * to the opening's top corners, about 9.3 pt either side, then on in a short flick that hooks up into a small
 * curl at each tip (12.9 pt out and 3 pt up). The lip IS the opening's top edge: the opening hangs from it in a
 * round, full U, its sides sloping in from the corners and rounding into a broad foot (14 pt deep at its middle,
 * as the sheet's is), never a V. Inside, a band of deep maroon right under the lip and back into the upper corners,
 * easing to the mouth's red; the tongue fills the lower half and more, a wide coral lobe whose top is a soft
 * convex mound (the sheet's peaks 4.7 pt under the lip and meets the sides about 3 pt lower), lighter in its
 * middle, with a faint groove down its centre. A dark red-brown rim runs down the opening's sides and a warm
 * brown one round its foot, under the tongue.
 */
function mouth(): Piece {
  // One half of the lip, typed on the dog's left (the viewer's right), from the philtrum's foot to the curl's tip.
  const half: P[] = [[0, 14.2], [1.4, 15], [3.2, 15.8], [5.4, 16.5], [7.6, 16.95], [9.3, 17.05], [10.6, 16.75], [11.7, 16], [12.5, 15], [12.9, 14]];
  const lipShape = smooth([...mirrorX(half, false).slice(0, -1), ...half], { closed: false });
  const lip = tapered(sample(lipShape.segs, 12, false), 0.9, "inner", "upper lip", { taper: 2.2, tip: 0.3 });
  // The opening: along the lip from corner to corner, then down sides that slope in and round into a full U.
  const opening = smooth([[0, 14.4], [3.2, 16], [5.4, 16.75], [7.6, 17.15], [9.2, 17.25], [8.75, 20.2], [7.75, 23], [6.25, 25.6], [4.35, 27.45], [2.2, 28.4], [0, 28.65],
    [-2.2, 28.4], [-4.35, 27.45], [-6.25, 25.6], [-7.75, 23], [-8.75, 20.2], [-9.2, 17.25], [-7.6, 17.15], [-5.4, 16.75], [-3.2, 16]], { corners: [0, 4, 16] });
  const m = pathD(opening.segs);
  // The rim down each side, from the top corner to where the tongue meets the side, drawn twice its width centred
  // on the edge inside the opening's clip, so the half that shows lies inside the opening; and a warm one round
  // the foot under the tongue.
  const edgePts = sample(opening.segs.slice(opening.segs.findIndex((g) => g[0][0] === 9.2 && g[0][1] === 17.25)), 16, false)
    .filter(([x, y]) => y > 17.6 || Math.abs(x) > 9);
  const end = edgePts.findIndex(([x, y], i) => i > 4 && x < -9 && y < 17.6);
  const along = end > 0 ? edgePts.slice(0, end + 1) : edgePts;
  const doubled: [number, number] = [LIMITS.inner[0] * 2, LIMITS.inner[1] * 2];
  const sides = ([1, -1] as const).map((sx) => strokeOf(along.filter(([x, y]) => sx * x > 0 && y < 23.2).sort((a, b) => a[1] - b[1]), 1.8, { taper: 2.6, tip: 0.2, band: doubled }));
  const foot = strokeOf(along.filter(([, y]) => y > 21), 1.5, { taper: 3, tip: 0.1, band: doubled });
  const rimLines: DrawnLine[] = [...sides.map((s) => ({ kind: "inner" as const, width: 0.9, where: "mouth side", drawn: [s.drawn[0] / 2, s.drawn[1] / 2] as [number, number] })),
    { kind: "inner", width: 0.75, where: "mouth foot", drawn: [foot.drawn[0] / 2, foot.drawn[1] / 2] }];
  const clip = uid("mouth"), soft = uid("blur"), lit = uid("blur"), edge = uid("blur"), lipFade = uid("lip"), groove = uid("blur");
  // The tongue's top: a wide convex mound peaking 4.7 pt under the lip and running down to meet each side 3 pt lower.
  const TONGUE = "M-9.4 31 L-9.4 22.2 C-8.2 20.4 -5.2 19 0 18.85 C5.2 19 8.2 20.4 9.4 22.2 L9.4 31Z";
  const philtrum = innerLine([[0, 11.7], [0, 14.4]], 0.9, C.eyeDark, { taper: 0.9, tip: 0.75, wobble: 0 });
  const grooveLine = tapered([[0, 19.9], [0.05, 21.6], [0, 23.4]], 0.7, "inner", "tongue groove", { taper: 1.1, tip: 0.1 });
  const box: Box = [-15, 10, 30, 21];
  const svg = `<defs><clipPath id="${clip}"><path d="${m}"/></clipPath>${blur(soft, box, 0.45)}${blur(lit, box, 1.3)}${blur(edge, box, 0.2)}${blur(groove, box, 0.35)}` +
    `<linearGradient id="${lipFade}" gradientUnits="userSpaceOnUse" x1="-13" y1="0" x2="13" y2="0">` +
    `<stop offset="0.08" stop-color="${C.dark}"/><stop offset="0.25" stop-color="${C.lipLine}"/><stop offset="0.75" stop-color="${C.lipLine}"/>` +
    `<stop offset="0.92" stop-color="${C.dark}"/></linearGradient></defs>` +
    `<path d="${m}" fill="${C.mouthInside}"/><g clip-path="url(#${clip})">` +
    // Deepest right under the lip and back into its corners, easing to the mouth's own red.
    `<path d="M-10 14 L10 14 L10 18 C6 17.8 3 17.1 0 16.9 C-3 17.1 -6 17.8 -10 18Z" fill="${C.mouthDeep}" opacity="0.55" filter="url(#${soft})"/>` +
    `<path d="M-10 17 L-7.8 17.4 C-7.9 18.4 -8 19.4 -8.4 20.8 L-10 20.8Z M10 17 L7.8 17.4 C7.9 18.4 8 19.4 8.4 20.8 L10 20.8Z" fill="${C.mouthDeep}" opacity="0.35" filter="url(#${soft})"/>` +
    // The tongue, its top soft where it meets the dark, lighter in its middle, with a faint groove down its centre.
    `<path d="${TONGUE}" fill="${C.tongue}" filter="url(#${soft})"/>` +
    `<ellipse cx="-0.3" cy="22.4" rx="4.2" ry="2.3" fill="${C.tongueShine}" opacity="0.5" filter="url(#${lit})"/>` +
    `<path d="${grooveLine.d}" fill="${C.tongueRim}" opacity="0.18" filter="url(#${groove})"/>` +
    `<g filter="url(#${edge})">${sides.map((s) => `<path d="${s.d}" fill="${C.mouthRim}"/>`).join("")}<path d="${foot.d}" fill="${C.tongueRim}"/></g></g>` +
    `<path d="${lip.d}" fill="url(#${lipFade})"/>${philtrum.svg}`;
  return piece(inFace(svg), faceBox(box), { shapes: [], lines: [lip.line, ...rimLines, { ...philtrum.line, where: "philtrum" }, grooveLine.line] });
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
 * painted as the sheet paints it: a flat matte gold inside a dark gold-brown line, a soft shade along its lower
 * right, one soft light high on its left lobe, and the smaller heart embossed in it: its edge a slightly deeper
 * gold, lit along its upper left lobe where the raised edge catches the light. No bevel, no glint, no second
 * line round the rim.
 */
function tagPiece(): Piece {
  // The ring's edge is a plain stroke, drawn exactly as wide as it is declared.
  const ringLine: DrawnLine = { kind: "inner", width: 0.6, where: "tag ring", drawn: [0.6, 0.6] };
  // It runs down into the heart's cleft, so the heart hangs from it with no gap between the lobes.
  const ring = piece(`<rect x="-0.9" y="-57.2" width="2.8" height="8.6" rx="1.4" fill="${C.collar}" stroke="${C.collarRim}" stroke-width="${ringLine.width}"/>` +
    `<rect x="-0.2" y="-56.6" width="0.8" height="6.6" rx="0.4" fill="${C.collarHighlight}"/>`, [-2, -58, 5, 10.4], { shapes: [], lines: [ringLine] });
  const emboss = sample(innerHeart.segs, 10);
  emboss.push(emboss[0]!);
  // The embossed heart's light, along its upper left lobe, where the light catches its raised edge.
  const lit = uid("blur"), raised = sample(innerHeart.segs, 10).filter(([x, y]) => x < TAG_X && y < -43.8);
  return join(ring, part("tag", heart, {
    fill: C.tag,
    shade: { multiply: C.tagShadeBy, rim: { inset: 1, toLight: 1.8 }, blur: 1.2 },
    under: `<defs>${blur(lit, [-8, -51, 10, 10], 0.35)}</defs><path d="${strokeOf(raised, 0.9, { taper: 1.6, tip: 0.2 }).d}" fill="${C.tagShine}" opacity="0.75" filter="url(#${lit})"/>`,
    // A soft matte light on the upper left lobe, not a bevel's glint.
    highlight: { d: "M-7.2 -48.4 a2.8 1.8 -35 1 0 5.6 0 a2.8 1.8 -35 1 0 -5.6 0", colour: C.tagShine, opacity: 0.45, blur: 1.4 },
    // The embossed heart's edge, a little deeper than the tag's gold.
    inner: [{ pts: emboss, width: 0.75, colour: C.tagEmboss, opacity: 0.9 }],
    outline: { colour: C.tagRim, width: 1.3, taper: 2, blur: 0.2 },
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
 * Between the front legs the sheet paints a narrow, light warm-tan V, its point at the top: nothing at its top,
 * about 32 pt up just under the tag, where it fades up into the chest's cream with no edge, then a pale tan down
 * the slot between the legs (whose inner edges lie over its sides), widening and deepening low down between the
 * paws, then easing out where the paws meet the floor. No line runs down its middle and nothing marks its top.
 */
function between(): string {
  const g = uid("between"), f = uid("blur");
  // A narrow V, its point at the top: 3.6 pt across at y -26 and 9.6 pt between the wrists.
  const v = smooth([[0, -33], [1.6, -29], [3.4, -20], [4.8, -10], [4.6, -2.6], [-4.6, -2.6], [-4.8, -10], [-3.4, -20], [-1.6, -29]]);
  return `<defs><linearGradient id="${g}" gradientUnits="userSpaceOnUse" x1="0" y1="-32" x2="0" y2="-2.6">` +
    `<stop offset="0" stop-color="${C.marking}" stop-opacity="0"/><stop offset="0.25" stop-color="${C.marking}" stop-opacity="0.18"/>` +
    `<stop offset="0.5" stop-color="${C.marking}" stop-opacity="0.5"/><stop offset="0.75" stop-color="${C.marking}" stop-opacity="0.75"/>` +
    `<stop offset="0.9" stop-color="${C.earDeep}" stop-opacity="0.7"/><stop offset="1" stop-color="${C.earDeep}" stop-opacity="0"/></linearGradient>` +
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
  add("body.back", part("body.back", back, backPaint));
  add("back.patch.R", marking("back.patch.R", { shape: back, paint: backPaint }, saddleR, { fill: C.marking, blur: 1.2, clip: true }));
  add("back.patch.L", marking("back.patch.L", { shape: back, paint: backPaint }, saddleL, { fill: C.marking, blur: 0.9, clip: true }));
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
      { pts: [[-26.2, -149.3], [-28.5, -148.9], [-30.5, -148.2]], width: 0.85, colour: C.crownLine, opacity: 0.8 },
      { pts: [[-12.6, -155.8], [-11.4, -154], [-11.8, -152.4]], width: 0.8, colour: C.crownLine, opacity: 0.7 },
      { pts: [[5.2, -159.8], [5, -157.6], [3.9, -156.2], [2.6, -155.9]], width: 0.8, colour: C.crownLine, opacity: 0.7 },
      { pts: [[22.6, -153.8], [21.2, -152.6], [19, -152.3]], width: 0.85, colour: C.crownLine, opacity: 0.8 },
    ],
    // One continuous line from where the left lobe meets the crown, round all three lobes and into their notches,
    // to where the right lobe meets it again, so the tuft and the crown's line read as one outline.
    outline: { ...OUTLINE, colour: C.crownLine, width: THIN, taper: 1.6, spans: [{ from: [-31, -147.6], to: [22.4, -150.6] }] },
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
    const fade = uid("legline"), rise = uid("legline"), toe = uid("toe");
    // The one soft light on the leg's front, toward the light, so its cream is never one flat fill (the sheet's
    // varies by about 2 L* down the leg); the shade along its inner side, where it turns into the V; and no shade
    // band along the sole, whose line alone marks the paw's foot.
    const litX = side === "R" ? -19 : 13;
    add(`front.${side}`, part(`front.${side}`, legs[side], {
      fill: C.fur,
      shade: furShade(bodyGroup, [polyD(flipX([[-1.4, -33], [-4.6, -28], [-6.8, -16], [-6.6, -8], [-3, -8], [-3.6, -16], [-2.2, -28]], side))],
        ["M-40 -60 L40 -60 L40 -36 L-40 -36Z", "M-40 -3.4 L40 -3.4 L40 4 L-40 4Z"], { inset: 2, toLight: 3 }),
      highlight: { d: `M${litX - 7} -24 a7 10 0 1 0 14 0 a7 10 0 1 0 -14 0Z`, colour: C.light, opacity: 0.25, blur: 3.5 },
      under: `<defs><linearGradient id="${fade}" gradientUnits="userSpaceOnUse" x1="0" y1="-31" x2="0" y2="-12">` +
        `<stop offset="0" stop-color="${C.softLine}" stop-opacity="0"/><stop offset="0.35" stop-color="${C.softLine}" stop-opacity="0.6"/><stop offset="1" stop-color="${C.warmLine}"/></linearGradient>` +
        `<linearGradient id="${rise}" gradientUnits="userSpaceOnUse" x1="0" y1="-42" x2="0" y2="-14">` +
        `<stop offset="0" stop-color="${C.softLine}" stop-opacity="0"/><stop offset="0.35" stop-color="${C.softLine}" stop-opacity="0.6"/><stop offset="1" stop-color="${C.warmLine}"/></linearGradient>` +
        // The toe lines fade out toward their tops.
        `<linearGradient id="${toe}" gradientUnits="userSpaceOnUse" x1="0" y1="-1" x2="0" y2="-6.6">` +
        `<stop offset="0.25" stop-color="${C.soleLine}"/><stop offset="1" stop-color="${C.warmLine}" stop-opacity="0.15"/></linearGradient></defs>`,
      // Two short curved toe lines rising from the sole's dips about 5.5 pt up the paw, each bowing a little away from
      // the middle toe and turning in at its top round it, as the paw-stub and stubby-paws panels draw them.
      inner: [[[-20.6, -1.1], [-21.3, -2.9], [-21.2, -4.8], [-20.3, -6.5]], [[-11.4, -1.05], [-10.8, -2.9], [-10.9, -4.8], [-11.8, -6.4]]]
        .map((pts) => ({ pts: flipX(pts as P[], side), width: 0.75, colour: `url(#${toe})`, opacity: 0.85 })),
      // From the V's point down the inner side; under the paw; up its outer side, fading out below the shoulder. Their tapers overlap, so
      // each line hands on to the next with no join.
      outline: { ...OUTLINE, taper: 4, spans: bySide(side, [{ from: [-1.8, -31], to: [-5.6, -1.6], width: 1.25, colour: `url(#${fade})` },
        { from: [-3.6, -4.2], to: [-30, -8.6], width: 1.4, colour: C.soleLine }, { from: [-29.4, -5.6], to: [-35, -40], width: 1.25, colour: `url(#${rise})` }]) },
      // Its top fades in under the shoulder, so it comes out from under the saddle's tan with no edge.
      feather: { from: [sx * 31, -45.6], to: [sx * 31, -41.8] },
    }));
  }
  return out;
}

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
