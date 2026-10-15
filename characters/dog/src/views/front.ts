// The dog's front view: shapes first, every node typed by hand in model space
// (points, the ground under the seat at 0, 0, y down) at the extremes and
// inflections read off the front turnaround, then paint. Light groups share one
// light across joined parts (head and tuft, chest and front legs, haunches and
// hind paws); joins are feathered and carry no rim and no line.
import { furEdge, furSpan } from "../../../draw/fur.ts";
import { bbox, ellipse, fracAt, mirrorX, pathD, rotate, sample, smooth, symmetric, v, type Node, type P, type Shape } from "../../../draw/geom.ts";
import { innerLine, mirrorSpans, ribbons, strokeOf, type DrawnLine, type Outline, type Span, type Stroke } from "../../../draw/line.ts";
import { LIMITS } from "../../../draw/lint.ts";
import { grain, marking, part, soft, type Fade, type Paint } from "../../../draw/paint.ts";
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

// The haunches: their outline is the body's silhouette from the shoulder down,
// round the saddle to the hind paw; the top lies under the chest.
const back = symmetric([[0, -52], [-20, -52.6], [-31, -55], [-35, -49.8], [-38, -43.6], [-42.4, -38], [-46.4, -33], [-48.8, -27.4], [-49.6, -21],
  [-49.2, -15.4], [-47.6, -10.6], [-44.4, -6.8], [-36, -4.8], [-20, -2.4]], [0, -1.6]);

// The hind paws (front c's): round buns in front of the haunches, as tall as the sheet's (their tops at y
// -20.6, their outer sides at x -48.2), their soles rounded and sitting a little above the front paws' (the
// sheet's at y -3.1), their inner halves behind the front paws.
const hindR: Node[] = [[-29.4, -18.2], [-34.6, -20.6], [-41, -20.4], [-45.8, -17.4], [-48.2, -12], [-47.2, -6.6], [-43.4, -3.6], [-37.6, -2.6],
  [-32, -2.9], [-27.6, -5.4], [-25.2, -11], [-26.4, -16]];
const hind = { R: smooth(hindR), L: other(hindR) };

// The chest: its edge is the silhouette from under the cheek to the top of the
// haunch, a smooth round shoulder as the sheet draws it, then the soft line
// where the chest meets the haunch, melting into the leg; its foot runs on down
// between the front paws.
const chest = symmetric([[0, -66], [-16, -65.4], [-25.6, -63.2], [-30, -59.6], [-32.6, -55.4], [-34.4, -50.6], [-35.2, -45.4], [-35, -40],
  [-34.2, -34], [-33, -26], [-31, -17], [-28, -9], [-20, -4.4], [-8, -3.2]], [0, -3]);

// The front legs (front c's): short chubby columns that melt into the chest,
// sloping down toward the middle so they pass under the tag, where the chest
// shows between them in a narrow soft tan band (the sheet's inner edges at x
// -3.4 at y -25, -3 at -18 and -2.2 at -8). Each tapers gently down its outer
// side into a round bun of a paw (the sheet's outer contour at x -33 at y -22,
// -30.5 at -15 and -29 at the paw, so the hind paw shows outside it), its sole a
// smooth dome barely dipping where the toe lines meet it.
const legR: Node[] = [[-2.4, -31], [-3.4, -24.6], [-3, -17.6], [-2.4, -11.4], [-2.3, -7.8], [-3.8, -3.8], [-7.2, -0.9], [-11.2, -0.6], [-15.6, -0.1],
  [-20.2, -0.6], [-24.4, -0.4], [-27.6, -2], [-29.3, -4.8], [-29.6, -10.4], [-30.6, -15.4], [-32.2, -21], [-33.6, -29.4], [-34.2, -40], [-34.4, -46.4],
  [-26, -44], [-15, -40], [-6, -35]];
const legs = { R: smooth(legR), L: other(legR) };

// The collar: a band round the neck, following it down to a dip at the front,
// about 4 pt deep where its square ends tuck behind the shoulders' fluff and
// 6.5 at the front, as the sheet draws it. The sheet's head roll tips it a
// little: its left end sits higher.
const collar = smooth([[-27.8, -62.6], [-21, -61.6], [-10, -59], [0, -58.2], [10, -59.4], [20.5, -62], [28.2, -62.9],
  [26.6, -58.9], [21.6, -54.8], [12, -51.2], [0, -50.4], [-12, -51.2], [-20.2, -54.2], [-26.4, -57.6]], { corners: [0, 6, 7, 13] });

// The tag: a plump gold heart, as the sheet draws it: full round lobes with a
// shallow notch, its sides staying wide low down before a short soft point,
// centred under its ring (x 0.4); and the smaller heart debossed in it.
const heart = smooth([[0.4, -48.6], [-2.6, -50.9], [-5.5, -50.7], [-7.3, -48.7], [-7.6, -45.6], [-6.8, -42.7], [-5, -40.4], [-1.9, -38.5], [0.4, -37.1],
  [2.7, -38.5], [5.8, -40.4], [7.6, -42.7], [8.4, -45.6], [8.1, -48.7], [6.3, -50.7], [3.4, -50.9]], { corners: [0] });
const innerHeart = smooth([[0.4, -46.1], [-1.8, -47.8], [-3.9, -47.5], [-4.8, -45.5], [-4.2, -43.1], [-2.6, -41.3], [0.4, -40.1], [3.4, -41.3], [5, -43.1],
  [5.6, -45.5], [4.7, -47.5], [2.6, -47.8]], { corners: [0] });

// The ears (front a's): droplets hanging from high on the head's sides, narrow
// at the root (tucked under the crown fur), broad and rounded below, their inner
// edges running on behind the face. The lower edge hangs in three soft clumps of
// fur, as the sheet draws it, each notch between them a shallow dip about 0.8 pt
// deep. The right ear is typed in the head's frame and rolled with the face.
const earR: Node[] = [[-37.5, -141.4], [-29.4, -138.6], [-28.2, -132.4], [-40, -86], [-39.4, -73], [-41.4, -66.6], [-46.6, -64], [-52.6, -62.6],
  [-58.6, -63.2], [-63.6, -65.2], [-67.4, -68.6], [-71.2, -69.8], [-74.4, -72.6], [-76.6, -77.4], [-80.4, -82], [-81, -88.4], [-80.4, -94.4],
  [-78.2, -100.2], [-73.6, -106.2], [-66.8, -111.6], [-60.8, -117.4], [-56, -125.6], [-50.2, -131.2], [-44.6, -135.6]];
/** The right ear's node where the left ear's typed upper edge ends (its outer side, at y -82). */
const EAR_SPLIT = earR.findIndex(([x, y]) => x === -80.4 && y === -82);
/** The notches between the clumps: a crisp dip each, as the sheet draws them (concave, so no corner rule applies). */
const EAR_NOTCHES = [[-67.4, -68.6], [-76.6, -77.4]].map(([x, y]) => earR.findIndex((n) => n[0] === x && n[1] === y));
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
const earL: Node[] = [lowerL[0]!, [41, -139.6], [50, -132.6], [57.6, -125], [64.6, -116], [71, -110], [75.6, -103.6], [78.6, -96], [79.6, -88], [78.8, -82],
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
 * the crown and the topknot stay level as the sheet draws them.
 */
const cheekRoll = ([x, y]: P): P => [x, y + x * Math.tan(ROLL) * Math.min(1, Math.max(0, (y + 118) / 20))];

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
// crown's fur overhangs the ear's root, and under it the ear's tan shows in a
// wedge up to the notch where the face begins (the ear roots' landmarks, the
// tan's highest points, sit in those wedges). From there the face's side is a
// round curve that bows out over the ear and in again above the cheek, as the
// sheet's line draws it (x -42.6 at y -120, -45 at -115, -46.5 to -47.3 from
// -110 to -100 and -45.8 at -93 on the right). Typed as its right half,
// mirrored, the crown lifted and the side drawn in on the left, and the cheeks
// rolled with the face. The crown's part under the topknot is hidden by it.
const headHalf: Node[] = [[0, -151.8], [-26, -149.4], [-32.4, -146.8], [-37.6, -143.4], [-41.6, -139.8], [-45.8, -134.4], [-40, -133.6], [-34.4, -133],
  [-37.4, -128.6], [-42.4, -120.6], [-45.6, -114.4], [-47, -105], [-46.6, -97], [-45.2, -90.6], [-45.6, -80.4], [-42.6, -71.6], [-37.4, -67.4],
  [-31, -63.8], [-21, -61.2], [-9, -58.6]];
/** The crown's overhang and the notch, on the right: the lock's tip, its underside, the notch (a concave corner). */
const TEMPLE = [5, 6, 7];
/**
 * The left temple, typed where the sheet draws it in place of the right's mirror: no overhang, the crown meeting
 * the ear at (40.8, -140.2), its lower edge running in along y -139.4 over the ear's tan to the notch at
 * (27.6, -138.4), 5 pt higher and 6 pt further in than the right's.
 */
const leftTemple: Node[] = [[40.8, -140.2], [34, -139.4], [27.6, -138.4]];
const mirroredHalf = mirrorX(headHalf, false).slice(0, -1);
// The mirror runs from the chin up to the crown, so the right's temple nodes come in reverse; the left's replace the lock's tip and underside and the notch.
const at = mirroredHalf.length - TEMPLE[2]!;
const leftHalf = [...mirroredHalf.slice(0, at).map(([x, y]): Node => leftSide([x, y])), ...[...leftTemple].reverse(),
  ...mirroredHalf.slice(at + TEMPLE.length + 1).map(([x, y]): Node => crownLift([x, y]))];
const NOTCH = { R: TEMPLE[2]!, L: headHalf.length + 1 + at };
let head = smooth([...headHalf, [0, -57.5], ...leftHalf].map(([x, y]): Node => cheekRoll([x, y])),
  { typed: headHalf.length + 1 + leftTemple.length, corners: [NOTCH.R, NOTCH.L] });
// The cheeks' fluff, as the hero and the front turnaround draw it: on each
// side one big round puff that bulges out over the ear (to x -48.5 on the
// right), a smaller one under it and a little third at the jaw's corner,
// combed down and out, and under the jaw two soft scallops over the collar's
// ends. The sheet draws no line round them: the cream lies on the ear's tan,
// with a few wisps over its edge and a soft shade on the ear below.
const cheekLocks = [{ len: 3.2, w: 1.5, lean: 0.16 }, { len: 2.2, w: 1, lean: 0.24 }, { len: 1.2, w: 0.55, lean: 0.3 }];
const jawLocks = [{ len: 0.9, w: 1, lean: 0.18 }];
const lefthand = (locks: typeof cheekLocks) => [...locks].reverse().map((l) => ({ ...l, lean: -l.lean }));
head = furSpan(furSpan(head, cheekRoll([-45.2, -90.6]), cheekRoll([-34.6, -66])), cheekRoll([34.6, -66]), cheekRoll([45.2, -90.6]));
/** Each cheek lock's tip and root, for the wisps that cross its edge onto the ear. */
const cheekTips: [P, P][] = [];
const noteTip = (tip: P, root: P) => cheekTips.push([tip, root]);
head = furEdge(head, cheekRoll([-45.2, -90.2]), cheekRoll([-39.6, -69.4]), cheekLocks, 0.4, noteTip);
head = furEdge(head, cheekRoll([39.6, -69.4]), cheekRoll([45.2, -90.2]), lefthand(cheekLocks), 0.4, noteTip);
head = furEdge(head, cheekRoll([-37, -67.2]), cheekRoll([-30.4, -63.8]), jawLocks, 0.4);
head = furEdge(head, cheekRoll([30.4, -63.8]), cheekRoll([37, -67.2]), lefthand(jawLocks), 0.4);
/** One short curled flick in each cheek's upper puff, typed on the dog's right. */
const cheekFlick: P[] = [[-41, -86.4], [-43, -85.4], [-44.4, -83.6], [-44.6, -82]];

// The topknot: three fur lobes, the middle one tallest, each ending in a curl,
// typed node by node (the sheet's tuft).
const tuft = furSpan(smooth([[-31, -149.2], [-29.6, -152.8], [-26.6, -155.6], [-22, -157], [-17.4, -157.4], [-13.4, -156.4], [-11.2, -154],
  [-9.6, -158], [-6.8, -161.4], [-3.4, -163.6], [0.4, -164.2], [3.4, -163.2], [5, -160.8], [5.2, -158], [8.6, -159.4], [12.4, -160.2], [16.6, -159.8],
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
// under it. Their edges are soft but defined: a sigma of 0.5 pt.
const patches = {
  R: smooth([[-28, -117.8], [-22, -116.8], [-18.2, -113.2], [-15.8, -108.2], [-15.6, -102.4], [-18, -98], [-26, -93.4], [-33.4, -90.2], [-38.4, -88.4],
    [-43, -86.6], [-49.6, -86], [-50, -106], [-48.4, -121.4], [-41.6, -122.6], [-39.6, -118], [-38.4, -112.6], [-35.8, -114.8], [-32.2, -117.2]], { corners: [15] }),
  L: smooth([[26, -121.2], [20.2, -121], [16.2, -118.6], [13.6, -114], [12.6, -108.4], [13.2, -103.4], [18, -96.6], [28, -94.4], [34.4, -94.2], [39.6, -93.2],
    [43.4, -91.4], [49, -90.4], [49.4, -110], [44.6, -125], [37.6, -131.4], [35.4, -126], [35, -121], [34.6, -117.4], [32.6, -119.4], [29.6, -120.8]], { corners: [17] }),
};
/** Each hood's end toward the nose softens a little more than its edge, as the sheet's does. */
const patchFade = { R: { from: [-16.8, -105.4], to: [-13.6, -104.4] }, L: { from: [14.2, -109.6], to: [11, -108.6] } } satisfies Record<string, Fade>;
// The saddle's two halves where they show from the front: the right half down
// the right haunch's outer side, the left half a narrow strip down the flank
// beside the chest (the sheet's, x 33 to 40 from y -47 to -31).
// The right half is the outer thigh's broad patch, widest low down, with a strip of cream between it and the
// front leg (its inner edge at x -36 at y -44, -40 at -32 and -39.4 at -22).
const saddleR = smooth([[-34.8, -50.4], [-35.8, -44], [-37.8, -37.6], [-39.8, -31.6], [-40.4, -26.4], [-39.4, -21.4], [-38, -17], [-44, -14], [-53, -16], [-53, -40],
  [-41, -54]]);
const saddleL = smooth([[34, -49.4], [36.2, -46.6], [37.8, -42.2], [39.6, -38.2], [40.6, -34.6], [39.6, -31.4], [36.6, -29.8], [33, -30.6], [31.8, -40], [32.2, -48.4]]);

// Paint.

// The one highlight: the crown toward the light, and the tops of the cheeks' puffs, which the sheet paints whiter than the face.
const headLight = "M-30 -146 C-18 -154 2 -154 10 -147 C6 -136 -18 -134 -28 -138Z " +
  "M-44 -81.2 C-42 -85.2 -36 -86.4 -31 -84.8 C-30 -80.8 -34 -76.6 -39 -75.4 C-42 -76.2 -44 -78.2 -44 -81.2Z " +
  "M44 -86.8 C42 -90.8 36 -91.6 31 -89.2 C30 -85.2 34 -81.4 39 -80.6 C42 -81.8 44 -83.8 44 -86.8Z";
const furShade = (group: Shape[], shapes: string[] = [], keep: string[] = [], rim = { inset: 2.5, toLight: 4 }) =>
  ({ multiply: C.furShadeBy, rim, shapes, keep, group, blur: 2.4 });
/**
 * The fur's painted grain, the sheet's soft brushwork in place of a flat fill: soft streaks about 1 pt across
 * and 3.2 pt along the fur, lightening the cream toward white and darkening it toward its own shade by up to about
 * a fifth of that step (a percent or two), each part with its own seed. On the ears' tan, toward the hoods' paler tan
 * and the ears' lowest brown by up to a fifth of the way.
 */
const furGrain = (shape: Shape, seed: number, tan = false) => {
  const [x0, y0, x1, y1] = bbox(shape.segs);
  return grain(pad([x0, y0, x1 - x0, y1 - y0], 0.5), tan ? { light: C.patch, dark: C.earLow, amount: 0.2, scale: [0.8, 3], seed }
    : { light: C.light, dark: C.furShade, amount: 0.22, scale: [1, 3.2], seed });
};
const bodyGroup = [chest, legs.R, legs.L];
const hipGroup = [back, hind.R, hind.L];
const headGroup = [head, tuft];

const backPaint: Paint = {
  fill: C.fur,
  under: furGrain(back, 11),
  shade: furShade(hipGroup),
  // The haunch's line is the warm line the sheet draws there, lighter on the side toward the light.
  outline: { ...OUTLINE, colour: C.warmLine, width: 1.25, taper: 8, spans: [{ from: [-34.6, -51], to: [-47.4, -11] }, { from: [47.4, -11], to: [34.6, -51], width: 1.5 }] },
};
const headPaint: Paint = {
  fill: C.fur,
  under: furGrain(head, 3),
  // Under the jaw, where the head turns under toward the collar.
  shade: furShade(headGroup, ["M-38 -67.4 C-28 -62.4 -14 -60.4 0 -60.4 C14 -60.4 28 -62.4 38 -67.4 L46 -56 L-46 -56Z"], [], { inset: 3, toLight: 4.5 }),
  highlight: { d: headLight, colour: C.light, opacity: 0.4, blur: 4 },
  inner: ([1, -1] as const).map((sx) => ({ pts: cheekFlick.map(([x, y]) => cheekRoll([sx * x, y])), width: 0.7, colour: C.furLine, opacity: 0.22 })),
};
// The head's line, where the sheet draws one: a light line on the crown's fur,
// broken in two on each side as the sheet's is, and ending before the
// overhang's tip, where the ear's own line takes over; down each side, where
// the face lies over the ear, one round curve in the ear's deep tan (the
// sheet's #9E5C2C there, DECISIONS 7), fading in from where it begins below
// the notch and out above the cheek's puff; and under the chin, over the
// collar, a faint warm line in the chin's shade. Round the cheeks' puffs, over
// the temples' tan and under the overhang the sheet draws no line.
const headLine: Outline = { ...OUTLINE, taper: 4, blur: 0.15, spans: [
  { from: [-27, -148.4], to: [-34.6, -145], width: THIN, colour: C.fluffLine },
  { from: [-36.4, -143.8], to: [-44.6, -136.2], width: THIN, colour: C.fluffLine },
  { from: [-40.4, -123.8], to: [-45.6, -91.2], width: 1.25, colour: C.earLine },
  { from: [-30, -63.4], to: [30, -63.4], width: THIN, colour: C.fluffLine },
  { from: [44.2, -92], to: [36.4, -127], width: 1.25, colour: C.earLine },
  { from: [39.6, -142], to: [32, -147.6], width: THIN, colour: C.fluffLine },
  { from: [30.4, -148.4], to: [17, -150.8], width: THIN, colour: C.fluffLine },
].map((span) => ({ ...span, from: cheekRoll(span.from as P), to: cheekRoll(span.to as P) })) };

/** head.line: the head's outline as its own unclipped region, drawn after the head's clip group, reaching 0.5 pt past the head. */
function headLinePiece(): Piece {
  const r = ribbons(head, headLine, "head.line", 0.5);
  const f = uid("blur"), w = uid("blur");
  const [x0, y0, x1, y1] = bbox(head.segs);
  const box = pad([x0, y0, x1 - x0, y1 - y0], 2);
  // The cheeks' wisps: from inside each puff out past its tip, combed down, a fine cream stroke lying over the
  // ear's tan, so the puff's edge breaks into fur as the sheet's does instead of ending in a cut line.
  const wisps = cheekTips.map(([tip, root]) => {
    const out = v.norm(v.sub(tip, root));
    return innerLine([v.add(root, v.mul(v.sub(tip, root), 0.4)), v.add(tip, v.mul(out, 0.2)), v.add(v.add(tip, v.mul(out, 0.9)), [0, 0.8]),
      v.add(v.add(tip, v.mul(out, 1.3)), [0, 1.8])], 0.9, C.fur, { taper: 1.8, tip: 0.15, wobble: 0 });
  });
  return piece(`<defs>${blur(f, pad(box, 2), headLine.blur!)}${blur(w, pad(box, 2), 0.3)}</defs><g fill="${headLine.colour}" filter="url(#${f})">${r.svg}</g>` +
    `<g filter="url(#${w})">${wisps.map((x) => x.svg).join("")}</g>`, box, {
    shapes: [{ name: "head.line", nodes: head.typed, segs: head.segs, outlined: r.outlined, fur: head.fur.map(([a, b]) => [fracAt(head, a), fracAt(head, b)]) }],
    lines: [...r.lines, ...wisps.map((x) => ({ ...x.line, where: "cheek wisp" }))],
  });
}

/**
 * An open eye at its landmark, as the turnaround, the hero and the expression sheet's open eyes paint it: a
 * slightly tall oval, its top leaning toward the nose (and rolled with the face), its edge a little soft. The
 * rim is heaviest along the upper lid and the outer side and thins toward the lower inner side, where the
 * iris sits closest to it; a wide crescent of white lies low on the outer side inside the rim (centred about
 * 15 degrees below level, 2.1 pt at its widest, its inner edge soft); the iris is the printed brown round a
 * darker pupil, in the lid's shadow above and warming toward its foot (DECISIONS 18); one large catchlight
 * high on the nose side, where the sheet's sits, with a faint soft glow round it, and the spec's small one
 * (L446, L509), crisp, low on the nose side of the iris (the sheet draws only the large one: a question for the founder). A
 * faint pale halo lies outside the rim round its lower outer side, between the eye and the hood's tan.
 * `noseward` is +1 when the nose is to its right.
 */
function eye(landmark: P, noseward: number): Piece {
  const rx = 9.5, ry = 9.95, turn = 14 * noseward + ROLL_DEG, out = -noseward;
  // The ball sits a hair out and down from the landmark, the dark iris's own centre (DECISIONS 10).
  const [cx, cy]: P = [landmark[0] + out * 0.5 * cosR - 0.3 * sinR, landmark[1] + out * 0.5 * sinR + 0.3 * cosR];
  /** A point in the eye's own frame, rolled with the face: x toward the nose, y down. */
  const S = (x: number, y: number): P => [cx + noseward * x * cosR - y * sinR, cy + noseward * x * sinR + y * cosR];
  const oval = (c: P, a: number, b: number, deg = turn) => pathD(ellipse(c, a, b, deg));
  const clip = uid("eye"), irisClip = uid("eye"), iris = uid("iris"), lid = uid("lid"), outside = uid("crescent");
  const pupil = uid("blur"), shine = uid("blur"), edge = uid("blur"), white = uid("blur"), glow = uid("blur"), halo = uid("blur");
  const box: Box = [cx - 14, cy - 14, 28, 28];
  const ball = oval([cx, cy], rx, ry);
  // The iris inside the rim, set 0.3 pt toward the nose and 0.35 pt down, so the rim is 1.4 pt over the top and
  // the outer side and 0.7 pt along the lower inner side.
  const rim = 1.05, irisOval = oval(S(0.3, 0.35), rx - rim, ry - rim);
  // The white: the iris less a disc 13.05 pt in radius set 6.6 pt toward the nose and 15 degrees up, which leaves a
  // crescent 2.1 pt wide at about half past 8 on the viewer's left eye that thins to nothing about 60 degrees either side.
  const [bx, by] = S(6.6 * 0.966, -6.6 * 0.259);
  const cut = `M${fmt(cx - 30)} ${fmt(cy - 30)}H${fmt(cx + 30)}V${fmt(cy + 30)}H${fmt(cx - 30)}Z` + pathD(ellipse([bx, by], 13.05, 13.05));
  // The iris: the printed brown round a darker pupil, warming toward its foot, under the lid's shadow.
  const [gx, gy] = S(0.8, -0.65), [px, py] = S(0.6, -0.4), [t0x, t0y] = S(0, -ry), [t1x, t1y] = S(0, -0.5);
  // The lid: from below the outer corner, over the top, to high on the nose side, on the ball's rim, heaviest on top.
  const around = (from: number, to: number, grow: number, n = 41): P[] => Array.from({ length: n }, (_, k) => {
    const a = ((from + ((to - from) * k) / (n - 1)) * Math.PI) / 180;
    return S(-(rx + grow) * Math.cos(a), -(ry + grow) * Math.sin(a));
  });
  const lidLine = tapered(around(-20, 150, 0.2), 1.7, "outer", "eye lid", { taper: 8, tip: 0.3 });
  // The halo: a soft pale band just outside the rim, from below the eye round its outer side.
  const haloBand = strokeOf(around(-125, 25, 1.1, 31), 1.7, { taper: 5, tip: 0.2 });
  const big = S(3.9, -4.3), small = S(2.4, 5.4);
  const n = (p: P) => `${fmt(p[0])}" cy="${fmt(p[1])}`;
  const svg = `<defs><clipPath id="${clip}"><path d="${ball}"/></clipPath><clipPath id="${irisClip}"><path d="${irisOval}"/></clipPath>` +
    `<clipPath id="${outside}"><path d="${cut}" clip-rule="evenodd"/></clipPath>` +
    `<radialGradient id="${iris}" gradientUnits="userSpaceOnUse" cx="${fmt(gx)}" cy="${fmt(gy)}" r="10">` +
    `<stop offset="0.5" stop-color="${C.dark}"/><stop offset="0.66" stop-color="${C.dark}"/><stop offset="0.92" stop-color="${C.irisWarm}"/></radialGradient>` +
    `<linearGradient id="${lid}" gradientUnits="userSpaceOnUse" x1="${fmt(t0x)}" y1="${fmt(t0y)}" x2="${fmt(t1x)}" y2="${fmt(t1y)}">` +
    `<stop offset="0.35" stop-color="${C.eyeDark}"/><stop offset="1" stop-color="${C.eyeDark}" stop-opacity="0"/></linearGradient>` +
    `${blur(pupil, box, 0.7)}${blur(shine, box, 0.2)}${blur(edge, box, 0.22)}${blur(white, box, 0.3)}${blur(glow, box, 0.8)}${blur(halo, box, 0.55)}</defs>` +
    `<path d="${haloBand.d}" fill="${C.fur}" opacity="0.8" filter="url(#${halo})"/>` +
    `<g filter="url(#${edge})"><path d="${ball}" fill="${C.eyeDark}"/><path d="${lidLine.d}" fill="${C.eyeDark}"/></g>` +
    `<g clip-path="url(#${clip})"><path d="${irisOval}" fill="url(#${iris})"/>` +
    `<ellipse cx="${n([px, py])}" rx="3.8" ry="4.2" fill="${C.eyeDark}" opacity="0.75" filter="url(#${pupil})"/>` +
    `<path d="${ball}" fill="url(#${lid})"/>` +
    `<g clip-path="url(#${irisClip})"><g filter="url(#${white})"><path d="${irisOval}" fill="${C.eyeWhite}" clip-path="url(#${outside})"/></g></g></g>` +
    `<circle cx="${n(big)}" r="2.9" fill="${C.light}" opacity="0.22" filter="url(#${glow})"/>` +
    `<ellipse cx="${n(big)}" rx="1.95" ry="1.85" fill="${C.light}" filter="url(#${shine})"/>` +
    `<circle cx="${n(small)}" r="0.7" fill="${C.light}" opacity="0.95"/>`;
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
 * The nose in the face frame: a rounded inverted triangle, domed on top, broadest a third of the way down with
 * round side corners, narrowing to a soft point over the philtrum (the sheet's is 11.7 pt wide and about 7.4 pt
 * tall), with a soft warm sheen on its upper middle.
 */
const noseShape = symmetric([[0, 4.5], [-2.8, 4.75], [-4.8, 5.35], [-5.8, 6.5], [-5.6, 8.3], [-4.6, 9.9], [-2.9, 11.1], [-1.3, 11.8]], [0, 12]);
function nose(): Piece {
  const f = uid("blur"), box: Box = [-8, 2, 16, 13];
  return piece(inFace(`<defs>${blur(f, box, 0.9)}</defs>` +`<path d="${pathD(noseShape.segs)}" fill="${C.eyeDark}"/>` +
    `<ellipse cx="-0.6" cy="6.3" rx="2.6" ry="1.1" fill="${C.irisWarm}" opacity="0.7" filter="url(#${f})"/>`), faceBox(box));
}

/**
 * The open happy mouth in the face frame, as the sheet draws it. The upper lip is one line (the muzzle line, an
 * inner line: 0.7 pt through the middle, 0.9 pt along the flicks, tapering to fine points at its tips) from the
 * philtrum's foot down to the opening's top corners, about 9.4 pt either side, then on in a short gentle flick up to its tips
 * (12.9 pt out and 1.75 pt up, about 22 degrees). The lip IS the opening's top edge: the opening hangs from it,
 * widest at the top and narrowing to a rounded bottom. Its sides and bottom carry a thin rim, dark red-brown at
 * the sides and lighter where the tongue meets it; the inside is the dark red, deepest under the lip, and the
 * tongue is a rounded lobe in the lower middle, filling about the lower 55%.
 */
function mouth(): Piece {
  // One half of the lip, typed on the dog's left (the viewer's right), from the philtrum's foot to the flick's tip.
  const half: P[] = [[0, 14.2], [1.4, 15], [3.2, 15.8], [5.4, 16.5], [7.6, 16.9], [9.4, 17], [10.7, 16.7], [11.9, 16], [12.9, 15.2]];
  const lipShape = smooth([...mirrorX(half, false).slice(0, -1), ...half], { closed: false });
  const lipPts = sample(lipShape.segs, 12, false);
  // Fine through the middle, bolder from the corners out along each flick, as the sheet's line is.
  const lip = tapered(lipPts, 0.7, "inner", "upper lip", { taper: 2.6, tip: 0.25 });
  const flicks = ([1, -1] as const).map((sx) => tapered(lipPts.filter(([x]) => sx * x >= 7.4).sort((a, b) => sx * (a[0] - b[0])), 0.9, "inner", "lip flick", { taper: 1.4, tip: 0.35 }));
  // The opening: along the lip from corner to corner, then down sides that slope in to a round bottom.
  const opening = smooth([[0, 14.4], [3.2, 16], [5.4, 16.7], [7.6, 17.1], [9.3, 17.2], [9, 19.8], [8.1, 22.5], [6.9, 24.9], [5.3, 26.7], [3, 28.1], [0, 28.7],
    [-3, 28.1], [-5.3, 26.7], [-6.9, 24.9], [-8.1, 22.5], [-9, 19.8], [-9.3, 17.2], [-7.6, 17.1], [-5.4, 16.7], [-3.2, 16]], { corners: [0, 4, 16] });
  const m = pathD(opening.segs);
  // The rim, from one top corner down round the bottom to the other, drawn twice its width centred on the edge
  // inside the opening's clip, so the half that shows lies inside the opening.
  const rimPts = sample(opening.segs.slice(opening.segs.findIndex((g) => g[0][0] === 9.3 && g[0][1] === 17.2)), 16, false)
    .filter(([x, y]) => y > 17.5 || Math.abs(x) > 9);
  const rimEnd = rimPts.findIndex(([x, y], i) => i > 4 && x < -9 && y < 17.5);
  const rimStroke = strokeOf(rimEnd > 0 ? rimPts.slice(0, rimEnd + 1) : rimPts, 1.3, { taper: 3, tip: 0.1, band: [LIMITS.inner[0] * 2, LIMITS.inner[1] * 2] });
  const rimLine: DrawnLine = { kind: "inner", width: 0.65, where: "mouth rim", drawn: [rimStroke.drawn[0] / 2, rimStroke.drawn[1] / 2] };
  const clip = uid("mouth"), soft = uid("blur"), deep = uid("blur"), lit = uid("blur"), edge = uid("blur"), rim = uid("rim");
  const philtrum = innerLine([[0, 11.2], [0, 14.4]], 0.8, C.dark, { taper: 0.8, tip: 0.6, wobble: 0 });
  const box: Box = [-15, 10, 30, 21];
  const svg = `<defs><clipPath id="${clip}"><path d="${m}"/></clipPath>${blur(soft, box, 0.5)}${blur(deep, box, 0.9)}${blur(lit, box, 1.4)}${blur(edge, box, 0.2)}` +
    `<linearGradient id="${rim}" gradientUnits="userSpaceOnUse" x1="0" y1="18" x2="0" y2="28.7">` +
    `<stop offset="0.35" stop-color="${C.mouthRim}"/><stop offset="1" stop-color="${C.tongueRim}"/></linearGradient></defs>` +
    `<path d="${m}" fill="${C.mouthInside}"/><g clip-path="url(#${clip})">` +
    // Deeper under the lip and into its corners.
    `<path d="M-10 14 L10 14 L10 18 C6 18.2 3 17.4 0 17.2 C-3 17.4 -6 18.2 -10 18Z" fill="${C.mouthDeep}" opacity="0.55" filter="url(#${deep})"/>` +
    // The tongue: a rounded lobe in the lower middle, lighter through its middle.
    `<path d="M-8.2 30 C-8.4 24.8 -6.6 20.4 0 19.9 C6.6 20.4 8.4 24.8 8.2 30Z" fill="${C.tongue}" filter="url(#${soft})"/>` +
    `<ellipse cx="-0.4" cy="23.8" rx="3.8" ry="2.2" fill="${C.tongueShine}" opacity="0.45" filter="url(#${lit})"/>` +
    `<path d="${rimStroke.d}" fill="url(#${rim})" filter="url(#${edge})"/></g>` +
    `<path d="${lip.d}" fill="${C.dark}"/>${flicks.map((f) => `<path d="${f.d}" fill="${C.dark}"/>`).join("")}${philtrum.svg}`;
  return piece(inFace(svg), faceBox(box), { shapes: [], lines: [lip.line, ...flicks.map((f) => f.line), rimLine, { ...philtrum.line, where: "philtrum" }] });
}

/** A blush in the face frame, under the eye's outer side: an ellipse turned with the face. */
function blush(sx: number): Piece {
  const [cx, cy] = face([sx * 30, 13]);
  const [dx, dy] = [7 * cosR, 7 * sinR], deg = r3((ROLL * 180) / Math.PI);
  const d = `M${r3(cx - dx)} ${r3(cy - dy)} a7 4.4 ${deg} 1 0 ${r3(2 * dx)} ${r3(2 * dy)} a7 4.4 ${deg} 1 0 ${r3(-2 * dx)} ${r3(-2 * dy)}Z`;
  return soft(d, [cx - 7.5, cy - 5, 15, 10], C.blush, 2.4, Math.round(model.blush.restingLevel * 1.17 * 100) / 100);
}

/**
 * The tag and the ring it swings from, which the turnaround paints blue on the blue collar. The heart is
 * painted as the sheet paints it: a flat matte gold, a slightly darker gold rim inside its line, one soft light
 * high on its left lobe, and the smaller heart engraved in it as one faint warm line: no bevel, no raised face.
 */
function tagPiece(): Piece {
  // The ring's edge is a plain stroke, drawn exactly as wide as it is declared.
  const ringLine: DrawnLine = { kind: "inner", width: 0.6, where: "tag ring", drawn: [0.6, 0.6] };
  const ring = piece(`<rect x="-1.4" y="-57.2" width="2.8" height="7.2" rx="1.4" fill="${C.collar}" stroke="${C.collarLine}" stroke-width="${ringLine.width}"/>` +
    `<rect x="-0.7" y="-56.6" width="0.8" height="5.6" rx="0.4" fill="${C.collarHighlight}"/>`, [-2.5, -58, 5, 9], { shapes: [], lines: [ringLine] });
  const emboss = sample(innerHeart.segs, 10);
  emboss.push(emboss[0]!);
  return join(ring, part("tag", heart, {
    fill: C.tag,
    shade: { multiply: C.tagShadeBy, rim: { inset: 1.2, toLight: 1.2 }, blur: 1 },
    // A soft matte light on the upper left lobe, not a bevel's glint.
    highlight: { d: "M-6.4 -47.5 a2.6 1.8 -40 1 0 5.2 0 a2.6 1.8 -40 1 0 -5.2 0", colour: C.tagShine, opacity: 0.4, blur: 1.4 },
    inner: [{ pts: emboss, width: 0.65, colour: C.tagLine, opacity: 0.4 }],
    outline: { colour: C.tagLine, width: THIN, taper: 2, blur: 0.2 },
  }));
}

/**
 * An ear's paint (front c's, on front a's ears), as the sheet paints it: the tan deepening down the ear to a
 * darker brown at its lower clumps (the sheet's #E09B6C mid-ear to #C17D50 at the bottom) under the fur's own
 * warm shade; the shade on the rim away from the light, along the inner edge where the ear tucks under the
 * head, and where the cheek's fluff hangs over it, none where the root shows under the crown; a small soft
 * light on its upper outer side; a few soft fur locks, darker strokes where they part and lighter ones along
 * them, curving with the ear's bulge from its upper middle down into the notches between the clumps of its
 * lower edge; and its line in the warm brown the sheet draws round the ears (#A47049 to #9D6C4B), a little
 * heavier along the bottom, from where it comes out from under the cheek round the bottom and up the outside
 * to where it tucks under the crown.
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
    `<stop offset="0.72" stop-color="${C.earDeeper}"/><stop offset="1" stop-color="${C.earLow}"/></linearGradient>` +
    `${blur(parting, earBox, 0.7)}${blur(along, earBox, 1)}</defs>` +
    `<rect x="${fmt(ex0)}" y="${fmt(ey0)}" width="${fmt(ex1 - ex0)}" height="${fmt(ey1 - ey0)}" fill="url(#${deep})"/>` +
    `<path d="${soft(light, 2.2)}" fill="${C.patch}" opacity="0.3" filter="url(#${along})"/>` +
    `<path d="${soft(dark, 1.5)}" fill="${C.earLow}" opacity="0.4" filter="url(#${parting})"/>` + furGrain(ear, side === "R" ? 29 : 31, true);
  const shadeD = "M-90 -92 C-80 -80 -62 -72 -40 -70 L-40 -50 L-90 -50Z";
  const cheekD = "M-38 -98 C-43 -93 -48.6 -85 -49.8 -74 C-49 -66 -45 -62 -40 -60Z";
  // Along the inner edge, where the ear tucks under the head's side.
  const innerD = "M-44 -128 C-48.4 -118 -49.4 -104 -48.8 -94 L-43 -94 L-43 -128Z";
  const root = "M-50 -146 L-30 -146 L-30 -122 L-50 -122Z";
  const ends: [P, P] = [onEar(side, [-41.6, -67.2]), onEar(side, [-44.6, -135.4])];
  return {
    fill: C.marking,
    under,
    shade: { multiply: C.furShadeBy, rim: { inset: 2.2, toLight: 3.6 }, shapes: [earD(side, shadeD), earD(side, cheekD), earD(side, innerD)], keep: [earD(side, root)], blur: 3.2 },
    highlight: { d: earD(side, "M-74 -101 C-74 -106 -70 -111 -66 -112 C-64 -109 -66 -102 -69.6 -99 C-72 -98 -74 -99 -74 -101Z"), colour: C.patch, opacity: 0.3, blur: 2.6 },
    inner: [
      ...dark.map((pts) => ({ pts: pts.slice(-2).map((p) => onEar(side, p)), width: 0.7, colour: C.earLine, opacity: 0.3 })),
    ],
    // A little lighter on the ear toward the light, heavier on the one away from it, and along each one's bottom.
    outline: { ...OUTLINE, colour: C.warmLine, width: side === "R" ? 1.3 : 1.5, taper: 6, blur: 0.15, spans: side === "R"
      ? [{ from: ends[0], to: onEar(side, [-80.4, -82]), width: 1.55 }, { from: onEar(side, [-80.4, -82]), to: ends[1] }]
      : [{ from: ends[1], to: onEar(side, [-80.4, -82]) }, { from: onEar(side, [-80.4, -82]), to: ends[0], width: 1.7 }] },
  };
}

/**
 * Between the front legs the sheet paints a soft narrow band of the body's tan, with no line down its middle:
 * it fades in below the tag, about mid-chest, and deepens down to a soft shadow on the ground between the paws.
 */
function between(): string {
  const g = uid("between"), f = uid("blur");
  // Deepest just above the paws' contact, where the sheet's is a shadowed brown (#905C34), then easing out onto the ground.
  return `<defs><linearGradient id="${g}" gradientUnits="userSpaceOnUse" x1="0" y1="-32" x2="0" y2="-1">` +
    `<stop offset="0" stop-color="${C.marking}" stop-opacity="0"/><stop offset="0.4" stop-color="${C.marking}" stop-opacity="0.65"/>` +
    `<stop offset="0.7" stop-color="${C.earDeep}" stop-opacity="0.95"/><stop offset="0.86" stop-color="${C.warmLine}" stop-opacity="0.85"/>` +
    `<stop offset="1" stop-color="${C.earLow}" stop-opacity="0.3"/></linearGradient>` +
    `${blur(f, [-12, -36, 24, 38], 1.2)}</defs>` +
    `<path d="M0 -32 C-2.4 -27 -4 -21 -4 -14 L-4.4 -1 L4.4 -1 L4 -14 C4 -21 2.4 -27 0 -32Z" fill="url(#${g})" filter="url(#${f})"/>`;
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
      under: furGrain(hind[side], side === "R" ? 13 : 17),
      shade: furShade(hipGroup, [], [`M${cx - 12} ${cy - 12} L${cx + 12} ${cy - 12} L${cx + 12} ${cy - 4} L${cx - 12} ${cy - 4}Z`]),
      // Faint over its top, where it lies on the haunch, as the sheet draws it; the warm line round the outside and,
      // heavier, along the sole, to where it goes behind the front paw.
      outline: { ...OUTLINE, colour: C.warmLine, width: 1.3, taper: 4, spans: bySide(side, [{ from: [-30.2, -18.8], to: [-46, -15.6], colour: C.softLine },
        { from: [-47.6, -13.6], to: [-29.2, -4.6], width: 1.6 }]) },
      // Two toe lines rising from the sole about 6.5 pt up the paw, bowing apart, soft as the sheet's.
      inner: [[[-41.6, -3.4], [-42.2, -6.6], [-41.6, -9.8]], [[-35.6, -3], [-35, -6.4], [-35.4, -9.6]]].map((pts) => ({ pts: flipX(pts as P[], side), width: INNER, colour: C.warmLine, opacity: 0.6 })),
    }), 6));
  }
  add("body.front", part("body.front", chest, {
    fill: C.fur,
    // The shade falls under the chin, just below the collar, and down between the paws.
    shade: furShade(bodyGroup, ["M-22 -52 C-10 -48 10 -48 22 -52 L22 -58 L-22 -58Z", "M-4 -8 L4 -8 L5 0 L-5 0Z"]),
    under: between() + furGrain(chest, 5),
    // From under the collar's end down over the shoulder to where the chest lies on the haunch, the lighter fur line.
    outline: { ...OUTLINE, taper: 4.5, spans: [{ from: [-28.8, -61], to: [-34.8, -38], width: THIN, colour: C.furLine }, { from: [34.8, -38], to: [28.8, -61], width: THIN, colour: C.furLine }] },
    // A few soft fur strokes in the chest's tuft under the collar, combed down and out.
    inner: [[[-5.4, -47], [-6.8, -43.4], [-6.6, -39.6]], [[5, -46.6], [6.6, -43], [6.4, -39.2]], [[-14.4, -48.4], [-16.4, -44.8], [-16.6, -41.2]],
      [[13.8, -48.2], [15.8, -44.6], [16.2, -41]]].map((pts) => ({ pts: pts as P[], width: 0.65, colour: C.furLine, opacity: 0.15 })),
  }));
  // The chin's shadow on the chest, cast by the head (spec L396).
  add("shadow.chin", soft("M-26 -59 C-12 -53 12 -53 26 -59 L26 -66 L-26 -66Z", [-26, -66, 52, 10], C.furShade, 2.4));
  // The collar (front c's paint): in shade along its top, under the chin; lit along its lower half; the keeper
  // the tag's ring hangs from.
  // The collar (the sheet's paint): in shade right under the chin and along its lower edge; lit along its upper
  // middle; the keeper the tag's ring hangs from; its line along the lower edge between its square ends.
  add("collar", part("collar", collar, {
    fill: C.collar,
    shade: { multiply: C.shadeBy, shapes: ["M-32 -66 L32 -68 L32 -62.6 C14 -57.6 -12 -57.2 -32 -61Z", "M-32 -57 C-16 -49 16 -49 32 -58 L32 -46 L-32 -46Z"], blur: 0.9 },
    highlight: { d: "M-21 -58.4 C-11 -55.2 10 -55.2 21 -59.6 L21 -57.6 C10 -53.4 -11 -53.4 -21 -56.6Z", colour: C.collarHighlight, opacity: 0.55, blur: 0.7 },
    under: `<rect x="-2" y="-60" width="4.4" height="10" rx="1.2" fill="${C.collarLine}" opacity="0.3"/>`,
    outline: { colour: C.collarLine, width: THIN, spans: [{ from: [26.6, -58.9], to: [-26.4, -57.6] }], taper: 3, blur: 0.2 },
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
  add("tuft", part("tuft", tuft, {
    fill: C.fur,
    under: furGrain(tuft, 7),
    shade: { multiply: C.furShadeBy, rim: { inset: 3, toLight: 4.5 }, group: headGroup, keep: ["M-40 -152 L40 -152 L40 -130 L-40 -130Z"], blur: 2.4 },
    highlight: { d: headLight, colour: C.light, opacity: 0.4, blur: 4 },
    // Each lobe's line ends in a curl hooked into the lobe, as the sheet draws its topknot: the left lobe's into the
    // notch under the tall middle lock, the middle lock's where it tucks over the right lobe, and the right lobe's
    // under its own tip; a little curl where the crown's line meets the left lobe; and a soft fur stroke along each lobe.
    inner: [
      { pts: [[-12.6, -155.8], [-11.4, -154], [-11.8, -152.4], [-13.4, -151.6]], width: 0.85, colour: C.furLine, opacity: 0.7 },
      { pts: [[5, -160.2], [5.1, -158], [4.2, -156.4], [2.6, -155.6]], width: 0.85, colour: C.furLine, opacity: 0.7 },
      { pts: [[23, -155.2], [22.4, -153.2], [20.8, -152], [18.4, -151.6]], width: 0.8, colour: C.furLine, opacity: 0.6 },
      { pts: [[-31.4, -148.8], [-30, -149.9], [-27.4, -150.3], [-24.4, -150]], width: 0.75, colour: C.furLine, opacity: 0.45 },
      { pts: [[-4.2, -152.6], [-3.6, -156.6], [-1.6, -159.8]], width: 0.7, colour: C.furLine, opacity: 0.35 },
      { pts: [[-24.4, -152], [-21.6, -154.2], [-17.8, -155.2]], width: 0.65, colour: C.furLine, opacity: 0.25 },
      { pts: [[9.6, -152.8], [12.4, -155.6], [16, -157]], width: 0.65, colour: C.furLine, opacity: 0.25 },
    ],
    // One line per lobe, broken at the notches between them.
    outline: { ...OUTLINE, colour: C.fluffLine, width: THIN, spans: [{ from: [-30.6, -150.4], to: [-12.2, -155.6] }, { from: [-10.4, -156.4], to: [4.9, -159.8] },
      { from: [5.9, -158.6], to: [22.8, -153] }], taper: 4 },
    feather: { from: [0, -146.5], to: [0, -150.5] },
  }));
  for (const side of ["R", "L"] as const) {
    const sx = side === "R" ? -1 : 1;
    add(`front.${side}`, part(`front.${side}`, legs[side], {
      fill: C.fur,
      under: furGrain(legs[side], side === "R" ? 19 : 23),
      shade: furShade(bodyGroup, [], ["M-40 -60 L40 -60 L40 -34 L-40 -34Z"]),
      // Two toe lines rising from the sole about 7 pt up the paw (the sheet's 6.5), bowing apart.
      inner: [[[-20.4, -1.3], [-21, -4.6], [-20.5, -8]], [[-11.2, -1.3], [-10.6, -4.8], [-11, -8.4]]].map((pts) => ({ pts: flipX(pts as P[], side), width: INNER, colour: C.warmLine, opacity: 0.65 })),
      // Faint lines where the leg lies over the chest's tan and over the haunch, as the sheet draws them (about
      // luminance 180 against the outline's 120), and the warm line round the paw.
      outline: { ...OUTLINE, taper: 5, spans: bySide(side, [
        { from: [-3.4, -26], to: [-2.3, -11.4], width: THIN, colour: C.fluffLine },
        { from: [-2.3, -9.6], to: [-29.5, -10.4], width: 1.5, colour: C.warmLine },
        { from: [-29.9, -13], to: [-34.3, -42], width: THIN, colour: C.softLine },
      ]) },
      feather: { from: [sx * 20, -41.6], to: [sx * 22.4, -35.2] },
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
