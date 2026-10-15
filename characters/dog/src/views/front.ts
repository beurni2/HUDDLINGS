// The dog's front view: shapes first, every node typed by hand in model space
// (points, the ground under the seat at 0, 0, y down) at the extremes and
// inflections read off the front turnaround, then paint. Light groups share one
// light across joined parts (head and tuft, chest and front legs, haunches and
// hind paws); joins are feathered and carry no rim and no line.
import { furEdge, furSpan } from "../../../draw/fur.ts";
import { bbox, ellipse, fracAt, mirrorX, pathD, rotate, sample, smooth, symmetric, type Node, type P, type Shape } from "../../../draw/geom.ts";
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

// The hind paws (front c's): round buns in front of the haunches, their soles rounded and sitting a little
// above the front paws' (the sheet's at y -3.1), their inner halves behind the front paws.
const hindR: Node[] = [[-29.4, -17.6], [-34.6, -19.8], [-40.8, -19.6], [-45.4, -16.6], [-47.4, -11.4], [-46.4, -6.4], [-43, -3.6], [-37.6, -2.6],
  [-32, -2.9], [-27.6, -5.4], [-25.2, -11], [-26.4, -15.6]];
const hind = { R: smooth(hindR), L: other(hindR) };

// The chest: its edge is the silhouette from under the cheek to the top of the
// haunch, then the soft line where the chest meets the haunch, melting into the
// leg; its foot runs on down between the front paws.
let chest = symmetric([[0, -66], [-16, -65.4], [-25.6, -63.2], [-30, -59.6], [-32.6, -55.4], [-34.4, -50.6], [-35.2, -45.4], [-35, -40],
  [-34.2, -34], [-33, -26], [-31, -17], [-28, -9], [-20, -4.4], [-8, -3.2]], [0, -3]);
// The shoulders' fluff: under each of the collar's ends the chest's edge breaks into two soft round tufts
// combed down, as the turnaround draws its chest fur (spec L508); the chest itself carries no other fur marks.
const shoulderLocks = [{ len: 1.2, lean: 0.25 }, { len: 1.5, w: 1.2, lean: 0.3 }];
chest = furEdge(chest, [-30.4, -59], [-34.2, -51.6], shoulderLocks, 0.42);
chest = furEdge(chest, [34.2, -51.6], [30.4, -59], [...shoulderLocks].reverse().map((l) => ({ ...l, lean: -l.lean })), 0.42);

// The front legs (front c's): short chubby columns that melt into the chest,
// sloping down toward the middle so they pass under the tag, where the chest
// shows between them in a soft tan V. Each tapers gently down its outer side
// into a round bun of a paw (the sheet's outer contour at x -33 at y -22, -30.5
// at -15 and -29 at the paw, so the hind paw shows outside it), its sole in
// three toe lobes, notched where the toe lines meet it.
const legR: Node[] = [[-1.2, -31], [-3.2, -24], [-3.4, -17], [-2.4, -11.6], [-1.2, -6.8], [-2.4, -2.6], [-6.4, -0.4], [-11.2, -0.9], [-15.6, -0.05],
  [-20.2, -0.9], [-24.6, -0.35], [-27.6, -1.7], [-29.3, -4.8], [-29.6, -10.4], [-30.6, -15.4], [-32.2, -21], [-33.6, -29.4], [-34.2, -40], [-34.4, -46.4],
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
 * The head's left side, from under the crown's fur to the cheek, runs 2.4 pt inside its mirror: the sheet draws
 * the line where it meets the ear at x 41 at y -136, 43.4 at -124 and 44 to 44.5 lower down, against -45.5,
 * -46.6 and -47 on the right (the face turned a hair toward the dog's left). Fades out into the crown and
 * above the cheek.
 */
const leftSide = ([x, y]: P): P => [x > 0 ? x - 2.4 * Math.min(1, Math.max(0, (y + 141) / 5)) * Math.min(1, Math.max(0, (-88 - y) / 6)) : x, y];

// The head: a soft round mass with a full crown, widest at the cheeks. Its
// sides run along the ears' inner edges, 93.3 pt apart (DECISIONS 7), bowing
// out a little toward the ears at eye level as the skull does (the sheet's line
// there is at x -45.5 at y -135, -47 at -115 and -45.2 at -92). Typed as its
// right half, mirrored, then the crown lifted and the side drawn in on the
// left, and the cheeks rolled with the face.
const headHalf: Node[] = [[0, -151.8], [-16, -151.2], [-26, -149.4], [-32.4, -146.8], [-37.6, -143.4], [-41.6, -139.8], [-44.4, -136.2], [-45.8, -129.4],
  [-46.8, -120], [-47, -111], [-46.4, -101.6], [-45.6, -95.4], [-44.8, -90.8], [-45.1, -86], [-45.2, -81], [-44.5, -77.4], [-43, -74],
  [-40.8, -71], [-37.8, -68.4], [-34.6, -66], [-31, -63.8], [-21, -61.2], [-9, -58.6]];
let head = smooth([...headHalf, [0, -57.5], ...mirrorX(headHalf, false).slice(0, -1)].map(([x, y]): Node => cheekRoll(leftSide(crownLift([x, y])))), { typed: headHalf.length + 1 });
// The cheeks' fluff, as the hero and the front turnaround draw it: on each
// side two broad round puffs (about 5 and 4 pt across) and a small third at the
// jaw's corner, spilling a little over the ear's inner edge, and under the jaw
// two soft scallops over the collar's ends. Each puff carries at most one short
// fur flick, drawn in its paint.
const cheekLocks = [{ len: 2.9, w: 1.3, lean: 0.1 }, { len: 2.1, w: 1, lean: 0.14 }, { len: 1.1, w: 0.5, lean: 0.2 }];
const jawLocks = [{ len: 0.8, w: 1, lean: 0.1 }];
const lefthand = (locks: typeof cheekLocks) => [...locks].reverse().map((l) => ({ ...l, lean: -l.lean }));
head = furSpan(furSpan(head, cheekRoll([-44.8, -90.8]), cheekRoll([-34.6, -66])), cheekRoll([34.6, -66]), cheekRoll([44.8, -90.8]));
head = furEdge(head, cheekRoll([-44.8, -90.4]), cheekRoll([-39.4, -70]), cheekLocks, 0.34);
head = furEdge(head, cheekRoll([39.4, -70]), cheekRoll([44.8, -90.4]), lefthand(cheekLocks), 0.34);
head = furEdge(head, cheekRoll([-36.8, -67.6]), cheekRoll([-30.4, -63.8]), jawLocks, 0.4);
head = furEdge(head, cheekRoll([30.4, -63.8]), cheekRoll([36.8, -67.6]), lefthand(jawLocks), 0.4);
/** One short curled flick in each cheek's upper puff, typed on the dog's right. */
const cheekFlick: P[] = [[-41, -86.4], [-43, -85.4], [-44.4, -83.6], [-44.6, -82]];

// The topknot: three fur lobes, the middle one tallest, each ending in a curl,
// typed node by node (the sheet's tuft).
const tuft = furSpan(smooth([[-31, -149.2], [-29.6, -152.8], [-26.6, -155.6], [-22, -157], [-17.4, -157.4], [-13.4, -156.4], [-11.2, -154],
  [-9.6, -158], [-6.8, -161.4], [-3.4, -163.6], [0.4, -164.2], [3.4, -163.2], [5, -160.8], [5.2, -158], [8.6, -159.4], [12.4, -160.2], [16.6, -159.8],
  [20.8, -158.4], [23.2, -155.6], [22.6, -152.2], [14, -146.6], [0, -145.4], [-18, -146.2]], { corners: [6, 13] }), [-30.6, -150.4], [22.8, -153]);

// The head patches: peach crescents round the upper and outer side of each eye,
// as the sheet paints them: the top edge at about brow height (the brow lies in
// the cream above it), a lobe running up the head's side toward the ear's root,
// down the eye's outer side to the cheek's puff, and none under the eye on the
// nose side, where it fades out. Typed per side, as the sheet draws them (the
// left 4 pt higher, with the head's roll), with about 4 pt of bleed past the
// head's edge; the eye covers the part typed under it.
const patches = {
  R: smooth([[-49, -127.6], [-44.8, -128], [-41, -126.4], [-38.8, -122.4], [-38.4, -118.2], [-35.6, -117.1], [-29.6, -117], [-24, -116.6], [-20, -114.4],
    [-17.4, -111.4], [-16.2, -107.6], [-17.6, -102], [-24, -94], [-30, -91.2], [-35.6, -89.8], [-40.6, -88], [-44.4, -86.6], [-49.6, -86.4], [-50.6, -106]]),
  L: smooth([[48.4, -133.6], [41.6, -133.4], [36.8, -132.4], [34, -128.6], [33, -123.4], [29.4, -121.2], [24.6, -121], [20.2, -120.6], [16.6, -118.6],
    [14.2, -115], [13.2, -110.6], [14.6, -106], [19.6, -98.4], [27, -95], [33.2, -94.8], [38.6, -93.4], [42.4, -91.6], [48.6, -90.6], [49.4, -110]]),
};
/** Each patch fades out toward the nose, as the sheet's do, fully shown from the eye's outer half. */
const patchFade = { R: { from: [-27, -108], to: [-13, -104] }, L: { from: [25, -112], to: [11, -108] } } satisfies Record<string, Fade>;
// Above each patch the sheet shows the ear's root, its own tan reaching in under
// the crown's fur, and melting down into the patch with no line or crease: a
// wedge painted with the patch, fading into it, wider on the dog's left.
const earRoots = {
  R: smooth([[-47, -134.6], [-44, -135.6], [-40, -135.8], [-36.6, -135.3], [-35.2, -133.8], [-35.8, -131], [-37.2, -128.6], [-38.4, -126], [-40, -123.6],
    [-42.6, -122.2], [-47.6, -122]]),
  L: smooth([[43.4, -136.6], [40.4, -138.4], [37.2, -138.9], [33.6, -138.8], [30.8, -137.6], [30.2, -134], [31.4, -130], [33.6, -127], [37, -125.4], [41.6, -125.2],
    [46, -126], [47, -133]]),
};
const rootFade = { R: { from: [-41, -130], to: [-42.6, -119.6] }, L: { from: [36, -137], to: [37, -129] } } satisfies Record<string, Fade>;
// The saddle's two halves where they show from the front: the right half down
// the right haunch's outer side, the left half a narrow strip down the flank
// beside the chest (the sheet's, x 33 to 40 from y -47 to -31).
const saddleR = smooth([[-34.6, -50], [-35.2, -42], [-35.6, -35.4], [-37.4, -29.4], [-39.6, -24.6], [-41.6, -20.6], [-44.6, -18], [-52, -16], [-53, -40], [-41, -54]]);
const saddleL = smooth([[34, -49.4], [36.2, -46.6], [37.8, -42.2], [39.6, -38.2], [40.6, -34.6], [39.6, -31.4], [36.6, -29.8], [33, -30.6], [31.8, -40], [32.2, -48.4]]);

// Paint.

// The one highlight: the crown toward the light, and the tops of the cheeks' puffs, which the sheet paints whiter than the face.
const headLight = "M-30 -146 C-18 -154 2 -154 10 -147 C6 -136 -18 -134 -28 -138Z " +
  "M-44 -81.2 C-42 -85.2 -36 -86.4 -31 -84.8 C-30 -80.8 -34 -76.6 -39 -75.4 C-42 -76.2 -44 -78.2 -44 -81.2Z " +
  "M44 -86.8 C42 -90.8 36 -91.6 31 -89.2 C30 -85.2 34 -81.4 39 -80.6 C42 -81.8 44 -83.8 44 -86.8Z";
const furShade = (group: Shape[], shapes: string[] = [], keep: string[] = [], rim = { inset: 2.5, toLight: 4 }) =>
  ({ multiply: C.furShadeBy, rim, shapes, keep, group, blur: 2.4 });
const bodyGroup = [chest, legs.R, legs.L];
const hipGroup = [back, hind.R, hind.L];
const headGroup = [head, tuft];

const backPaint: Paint = {
  fill: C.fur,
  shade: furShade(hipGroup),
  // The haunch's line is the warm line the sheet draws there, lighter on the side toward the light.
  outline: { ...OUTLINE, colour: C.warmLine, width: 1.25, taper: 8, spans: [{ from: [-34.6, -51], to: [-47.4, -11] }, { from: [47.4, -11], to: [34.6, -51], width: 1.5 }] },
};
const headPaint: Paint = {
  fill: C.fur,
  // Under the jaw, where the head turns under toward the collar.
  shade: furShade(headGroup, ["M-38 -69 C-28 -63.6 -14 -61.6 0 -61.6 C14 -61.6 28 -63.6 38 -69 L46 -58 L-46 -58Z"], [], { inset: 3, toLight: 4.5 }),
  highlight: { d: headLight, colour: C.light, opacity: 0.4, blur: 4 },
  inner: ([1, -1] as const).map((sx) => ({ pts: cheekFlick.map(([x, y]) => cheekRoll([sx * x, y])), width: 0.7, colour: C.furLine, opacity: 0.22 })),
};
// The head's line runs all round it: a light line on the crown's fur in the
// light; down each side, where the head lies over the ear, one crisp curve in
// the ear's deep tan (the sheet's #AB6839 there, DECISIONS 7), from where the
// crown's fur covers the ear's root to the cheek's puff; a lighter warm line
// round the puffs; and under the chin, over the collar, the heavier warm line.
const headLine: Outline = { ...OUTLINE, taper: 5, blur: 0.15, spans: [
  { from: [-27, -148.2], to: [-44, -137], width: THIN, colour: C.fluffLine },
  { from: [-45.2, -133.4], to: [-45.2, -91.4], width: 1.25, colour: C.earLine },
  { from: [-45.4, -90.6], to: [-35, -64.8], width: THIN, colour: C.puffLine },
  { from: [-31, -63.6], to: [31, -63.6], width: 1.5, colour: C.warmLine },
  { from: [35, -64.8], to: [45.4, -90.6], width: THIN, colour: C.puffLine },
  { from: [43.4, -91.4], to: [41.6, -136.2], width: 1.25, colour: C.earLine },
  { from: [44, -137], to: [17, -150.8], width: THIN, colour: C.fluffLine },
].map((span) => ({ ...span, from: cheekRoll(span.from as P), to: cheekRoll(span.to as P) })) };

/** head.line: the head's outline as its own unclipped region, drawn after the head's clip group, reaching 0.5 pt past the head. */
function headLinePiece(): Piece {
  const r = ribbons(head, headLine, "head.line", 0.5);
  const f = uid("blur");
  const [x0, y0, x1, y1] = bbox(head.segs);
  const box = pad([x0, y0, x1 - x0, y1 - y0], 2);
  return piece(`<defs>${blur(f, pad(box, 2), headLine.blur!)}</defs><g fill="${headLine.colour}" filter="url(#${f})">${r.svg}</g>`, box, {
    shapes: [{ name: "head.line", nodes: head.typed, segs: head.segs, outlined: r.outlined, fur: head.fur.map(([a, b]) => [fracAt(head, a), fracAt(head, b)]) }],
    lines: r.lines,
  });
}

/**
 * An open eye at its landmark, as the turnaround and the hero paint it: a slightly tall oval, its top leaning
 * toward the nose (and rolled with the face), with a dark rim and a heavy dark lid along its top that thins
 * down its sides; a crisp crescent of white low on the outer side only, inside the rim (about 6:50 to 10:55
 * on the viewer's left eye, mirrored on the other, 2.1 pt at its widest); the iris the printed brown round a
 * darker pupil, in the lid's shadow above and warming a little toward its foot (DECISIONS 18); one large
 * catchlight high on the nose side, where the sheet's sits (3.6 pt toward the nose and 3.9 pt up from the
 * landmark), and a faint small one low on the outer side. `noseward` is +1 when the nose is to its right.
 */
function eye(landmark: P, noseward: number): Piece {
  const rx = 9.2, ry = 9.75, turn = 14 * noseward + ROLL_DEG, out = -noseward;
  // The ball sits a hair out and down from the landmark, the dark iris's own centre (DECISIONS 10).
  const [cx, cy]: P = [landmark[0] + out * 0.5 * cosR - 0.3 * sinR, landmark[1] + out * 0.5 * sinR + 0.3 * cosR];
  /** A point in the eye's own frame, rolled with the face: x toward the nose, y down. */
  const S = (x: number, y: number): P => [cx + noseward * x * cosR - y * sinR, cy + noseward * x * sinR + y * cosR];
  const oval = (c: P, a: number, b: number, deg = turn) => pathD(ellipse(c, a, b, deg));
  const clip = uid("eye"), iris = uid("iris"), lid = uid("lid"), outside = uid("crescent"), pupil = uid("blur"), shine = uid("blur");
  const box: Box = [cx - 14, cy - 14, 28, 28];
  const ball = oval([cx, cy], rx, ry);
  // The white: the ball inside its rim, less a disc 13 pt in radius set 6.4 pt toward the nose and a little up,
  // which leaves a crescent 2.1 pt wide at about 8:50 that thins to nothing 62° either side of it.
  const rim = 0.8, [bx, by] = S(6.4 * 0.9945, -6.4 * 0.1045);
  const cut = `M${fmt(cx - 30)} ${fmt(cy - 30)}H${fmt(cx + 30)}V${fmt(cy + 30)}H${fmt(cx - 30)}Z` + pathD(ellipse([bx, by], 12.975, 12.975));
  // The iris: the printed brown round a darker pupil, warming toward its foot, under the lid's shadow.
  const [gx, gy] = S(0.5, -1), [px, py] = S(0.6, -0.4), [t0x, t0y] = S(0, -ry), [t1x, t1y] = S(0, -0.5);
  // The lid: from below the outer corner, over the top, to high on the nose side, on the ball's rim, heaviest on top.
  const lidPts: P[] = Array.from({ length: 41 }, (_, k) => {
    const a = ((-20 + (170 * k) / 40) * Math.PI) / 180;
    return S(-(rx + 0.2) * Math.cos(a), -(ry + 0.2) * Math.sin(a));
  });
  const lidLine = tapered(lidPts, 1.8, "outer", "eye lid", { taper: 8, tip: 0.3 });
  const big = S(3.6, -3.9), small = S(-4.6, 4.8);
  const n = (p: P) => `${fmt(p[0])}" cy="${fmt(p[1])}`;
  const svg = `<defs><clipPath id="${clip}"><path d="${ball}"/></clipPath>` +
    `<clipPath id="${outside}"><path d="${cut}" clip-rule="evenodd"/></clipPath>` +
    `<radialGradient id="${iris}" gradientUnits="userSpaceOnUse" cx="${fmt(gx)}" cy="${fmt(gy)}" r="10">` +
    `<stop offset="0.5" stop-color="${C.dark}"/><stop offset="0.66" stop-color="${C.dark}"/><stop offset="0.96" stop-color="${C.irisWarm}"/></radialGradient>` +
    `<linearGradient id="${lid}" gradientUnits="userSpaceOnUse" x1="${fmt(t0x)}" y1="${fmt(t0y)}" x2="${fmt(t1x)}" y2="${fmt(t1y)}">` +
    `<stop offset="0.35" stop-color="${C.eyeDark}"/><stop offset="1" stop-color="${C.eyeDark}" stop-opacity="0"/></linearGradient>` +
    `${blur(pupil, box, 0.7)}${blur(shine, box, 0.25)}</defs>` +
    `<path d="${ball}" fill="${C.eyeDark}"/>` +
    `<g clip-path="url(#${clip})"><path d="${oval([cx, cy], rx - rim, ry - rim)}" fill="url(#${iris})"/>` +
    `<ellipse cx="${n([px, py])}" rx="3.8" ry="4.2" fill="${C.eyeDark}" opacity="0.75" filter="url(#${pupil})"/>` +
    `<path d="${ball}" fill="url(#${lid})"/>` +
    `<path d="${oval([cx, cy], rx - rim, ry - rim)}" fill="${C.eyeWhite}" clip-path="url(#${outside})"/></g>` +
    `<path d="${lidLine.d}" fill="${C.eyeDark}"/>` +
    `<ellipse cx="${n(big)}" rx="1.95" ry="1.85" fill="${C.light}" filter="url(#${shine})"/>` +
    `<circle cx="${n(small)}" r="0.55" fill="${C.light}" opacity="0.22"/>`;
  return piece(svg, box, { shapes: [], lines: [lidLine.line] });
}

/** A brow in the face frame: a short thin arch in pale tan, about 1.7 pt at its fullest, its inner end higher. */
function brow(sx: number): Piece {
  const pts: P[] = [[sx * 26.6, -25.4], [sx * 24.9, -27.8], [sx * 22.2, -29.2], [sx * 19, -28.4]];
  const f = uid("blur"), box = faceBox([sx > 0 ? 15 : -31, -33, 16, 12]);
  return piece(`<defs>${blur(f, box, 0.3)}</defs><g filter="url(#${f})">` +
    inFace(`<path d="${strokeOf(pts, 1.7, { taper: 2.6, tip: 0.7 }).d}" fill="${C.marking}" opacity="0.85"/>`) + "</g>", box);
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
 * The open happy mouth in the face frame, as the sheet draws it: the upper lip is one line, thickest through
 * the middle, from a sharp peak under the philtrum down into two round cups and, at each corner, curling up
 * steeply into a short tapered end. The lip IS the opening's top edge: the opening hangs from the cups' low
 * points and narrows steadily to a rounded bottom (about 70% of its top width at mid-height), with no line
 * round it. Inside, the dark red deepens under the lip and into the corners and blends softly into the tongue,
 * which fills the lower part with a lighter middle.
 */
function mouth(): Piece {
  // One half of the lip, typed on the dog's left (the viewer's right), from the peak to the curl's end.
  const half: P[] = [[0, 13.9], [1.3, 14.85], [2.9, 15.85], [4.9, 16.7], [7, 17.2], [9.1, 17.3], [10.6, 17.1], [11.8, 16.6], [12.7, 15.9], [13.3, 15.1]];
  const lipShape = smooth([...mirrorX(half, false).slice(0, -1), ...half], { closed: false });
  const lip = tapered(sample(lipShape.segs, 12, false), 1.5, "outer", "upper lip", { taper: 5.2, tip: 0.3 });
  // The opening: along the lip's cups from corner to corner, then down sides that slope in to a round bottom.
  const opening = smooth([[0, 14.3], [2.9, 16.2], [4.9, 17.1], [7, 17.55], [9.2, 17.65], [9.3, 20.2], [7.7, 23.8], [5.8, 26.6], [3.2, 28.3], [0, 28.8],
    [-3.2, 28.3], [-5.8, 26.6], [-7.7, 23.8], [-9.3, 20.2], [-9.2, 17.65], [-7, 17.55], [-4.9, 17.1], [-2.9, 16.2]], { corners: [0, 4, 14] });
  const m = pathD(opening.segs);
  const clip = uid("mouth"), soft = uid("blur"), deep = uid("blur"), lit = uid("blur");
  const philtrum = innerLine([[0, 11.2], [0, 14.2]], 0.9, C.dark, { taper: 0.8, tip: 0.7, wobble: 0 });
  const box: Box = [-15, 10, 30, 21];
  const svg = `<defs><clipPath id="${clip}"><path d="${m}"/></clipPath>${blur(soft, box, 0.55)}${blur(deep, box, 1.1)}${blur(lit, box, 1.6)}</defs>` +
    `<path d="${m}" fill="${C.mouthInside}"/><g clip-path="url(#${clip})">` +
    // Deeper under the lip and into the corners.
    `<path d="M-10 15 L10 15 L10 18.2 C6 18 3 17.6 0 17.6 C-3 17.6 -6 18 -10 18.2Z M-10 17.4 L-7.4 17.4 L-8.8 22 Z M10 17.4 L7.4 17.4 L8.8 22Z" fill="${C.mouthDeep}" opacity="0.85" filter="url(#${deep})"/>` +
    `<path d="M-10.4 23.8 C-7.4 20.6 -3.8 19.5 0 19.5 C3.8 19.5 7.4 20.6 10.4 23.8 L10.4 31 L-10.4 31Z" fill="${C.tongue}" filter="url(#${soft})"/>` +
    `<ellipse cx="-0.6" cy="24.6" rx="4.2" ry="2.4" fill="${C.tongueShine}" opacity="0.4" filter="url(#${lit})"/></g>` +
    `<path d="${lip.d}" fill="${C.dark}"/>${philtrum.svg}`;
  return piece(inFace(svg), faceBox(box), { shapes: [], lines: [lip.line, { ...philtrum.line, where: "philtrum" }] });
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
 * painted as the sheet paints it: a matte warm gold whose soft shade deepens toward orange, a soft light high
 * on its left lobe, and the smaller heart debossed in it, a warm line with the light catching its lower edge.
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
    shade: { multiply: C.tagShadeBy, rim: { inset: 1.1, toLight: 1.8 }, blur: 1.5 },
    // A soft matte light on the upper left lobe, not a bevel's glint.
    highlight: { d: "M-6.4 -47.5 a2.6 1.8 -40 1 0 5.2 0 a2.6 1.8 -40 1 0 -5.2 0", colour: C.tagShine, opacity: 0.4, blur: 1.4 },
    inner: [{ pts: emboss, width: 0.7, colour: C.tagLine, opacity: 0.55 }, { pts: emboss.map(([x, y]): P => [x + 0.35, y + 0.45]), width: 0.6, colour: C.tagShine, opacity: 0.5 }],
    outline: { colour: C.tagLine, width: THIN, taper: 2, blur: 0.2 },
  }));
}

/**
 * An ear's paint (front c's, on front a's ears), as the sheet paints it: the tan deepening down the ear to a
 * darker brown at its lower clumps (the sheet's #E09B6C mid-ear to #C17D50 at the bottom) under the fur's own
 * warm shade; the shade on the rim away from the light, along the inner edge where the ear tucks under the
 * head, and where the cheek's fluff hangs over it, none where the root shows under the crown; a small soft
 * light on its upper outer side; long faint fur strands, darker and lighter, running down its length into the
 * notches between the clumps of its lower edge; and its line in the ear's own deep brown (the sheet's #B57549),
 * from where it comes out from under the cheek round the bottom and up the outside to where it tucks under
 * the crown.
 */
function earPaint(side: "L" | "R"): Paint {
  const k = side === "R" ? 1 : -1;
  const ear = ears[side];
  const deep = uid("deep"), [ex0, ey0, ex1, ey1] = bbox(ear.segs);
  const under = `<defs><linearGradient id="${deep}" gradientUnits="userSpaceOnUse" x1="${-k * 52}" y1="-100" x2="${-k * 58}" y2="-60">` +
    `<stop offset="0" stop-color="${C.earDeep}" stop-opacity="0"/><stop offset="0.35" stop-color="${C.earDeep}"/>` +
    `<stop offset="0.72" stop-color="${C.earDeeper}"/><stop offset="1" stop-color="${C.earLow}"/></linearGradient></defs>` +
    `<rect x="${fmt(ex0)}" y="${fmt(ey0)}" width="${fmt(ex1 - ex0)}" height="${fmt(ey1 - ey0)}" fill="url(#${deep})"/>`;
  const shadeD = "M-90 -92 C-80 -80 -62 -72 -40 -70 L-40 -50 L-90 -50Z";
  const cheekD = "M-38 -98 C-43 -93 -48.6 -85 -49.8 -74 C-49 -66 -45 -62 -40 -60Z";
  // Along the inner edge, where the ear tucks under the head's side.
  const innerD = "M-44 -128 C-48.4 -118 -49.4 -104 -48.8 -94 L-43 -94 L-43 -128Z";
  const root = "M-50 -146 L-30 -146 L-30 -122 L-50 -122Z";
  // Darker strands into the notches between the clumps and up the ear's middle; lighter ones between them.
  const dark: P[][] = [[[-76.2, -78.2], [-77.8, -83.4], [-78.4, -90]], [[-67.2, -69.2], [-68.8, -75.4], [-69.6, -84]], [[-58.4, -65.6], [-59.6, -73], [-60.6, -88], [-60, -100]]];
  const light: P[][] = [[[-72.6, -73.4], [-74.4, -81], [-75, -94], [-73.6, -104]], [[-63, -67.6], [-64.4, -76], [-65, -90]]];
  const ends: [P, P] = [onEar(side, [-41.6, -67.2]), onEar(side, [-44.6, -135.4])];
  return {
    fill: C.marking,
    under,
    shade: { multiply: C.furShadeBy, rim: { inset: 2.2, toLight: 3.6 }, shapes: [earD(side, shadeD), earD(side, cheekD), earD(side, innerD)], keep: [earD(side, root)], blur: 3.2 },
    highlight: { d: earD(side, "M-74 -101 C-74 -106 -70 -111 -66 -112 C-64 -109 -66 -102 -69.6 -99 C-72 -98 -74 -99 -74 -101Z"), colour: C.patch, opacity: 0.3, blur: 2.6 },
    inner: [
      ...dark.map((pts) => ({ pts: pts.map((p) => onEar(side, p)), width: 0.75, colour: C.earLine, opacity: 0.32 })),
      ...light.map((pts) => ({ pts: pts.map((p) => onEar(side, p)), width: 0.7, colour: C.patch, opacity: 0.3 })),
    ],
    // A little lighter on the ear toward the light, heavier on the one away from it.
    outline: { ...OUTLINE, colour: C.earEdge, width: side === "R" ? 1.4 : 1.6, taper: 6, blur: 0.15, spans: [side === "R" ? { from: ends[0], to: ends[1] } : { from: ends[1], to: ends[0] }] },
  };
}

/**
 * Between the front legs the sheet paints a soft inverted V of the body's tan, with no line down its middle:
 * it starts below the tag, about mid-chest, and widens and deepens down to the ground between the paws.
 */
function between(): string {
  const g = uid("between"), f = uid("blur");
  return `<defs><linearGradient id="${g}" gradientUnits="userSpaceOnUse" x1="0" y1="-38" x2="0" y2="-2">` +
    `<stop offset="0" stop-color="${C.marking}" stop-opacity="0"/><stop offset="0.45" stop-color="${C.marking}" stop-opacity="0.55"/>` +
    `<stop offset="1" stop-color="${C.earDeep}" stop-opacity="0.9"/></linearGradient>${blur(f, [-12, -42, 24, 44], 1.4)}</defs>` +
    `<path d="M0 -38 C-1.6 -31 -4 -21 -5.2 -11 L-5.8 -1 L5.8 -1 L5.2 -11 C4 -21 1.6 -31 0 -38Z" fill="url(#${g})" filter="url(#${f})"/>`;
}

export function front(): Drawn[] {
  const out: Drawn[] = [];
  const add = (name: string, p: Piece, state?: string) => out.push({ part: name, piece: p, ...(state ? { state } : {}) });
  add("shadow", soft("M-64 -3 a64 4.6 0 1 0 128 0 a64 4.6 0 1 0 -128 0Z", [-64, -7.6, 128, 9.2], C.shadow, 2.5));
  add("body.back", part("body.back", back, backPaint));
  add("back.patch.R", marking("back.patch.R", { shape: back, paint: backPaint }, saddleR, { fill: C.marking, blur: 1.2, clip: true }));
  add("back.patch.L", marking("back.patch.L", { shape: back, paint: backPaint }, saddleL, { fill: C.marking, blur: 1.2, clip: true }));
  for (const side of ["R", "L"] as const) {
    const sx = side === "R" ? -1 : 1, cx = sx * 37.6, cy = -10.9;
    add(`hind.${side}`, roomy(part(`hind.${side}`, hind[side], {
      fill: C.fur,
      shade: furShade(hipGroup, [], [`M${cx - 12} ${cy - 12} L${cx + 12} ${cy - 12} L${cx + 12} ${cy - 4} L${cx - 12} ${cy - 4}Z`]),
      // Over the top and round the outside, then heavier along the sole, to where it goes behind the front paw.
      outline: { ...OUTLINE, colour: C.warmLine, width: 1.3, taper: 4, spans: bySide(side, [{ from: [-30.2, -18.4], to: [-46.4, -6.4] }, { from: [-47.4, -11.4], to: [-29.2, -4.6], width: 1.7 }]) },
      // Two short toe lines curving up from the sole, bowing apart like the paw stub's.
      inner: [[[-41.4, -3.9], [-42.2, -6.1], [-41.8, -8.5]], [[-35.6, -3.1], [-35, -5.3], [-35.4, -7.7]]].map((pts) => ({ pts: flipX(pts as P[], side), width: INNER, colour: C.warmLine, opacity: 0.8 })),
    }), 6));
  }
  add("body.front", part("body.front", chest, {
    fill: C.fur,
    // The shade falls under the chin, just below the collar, and down between the paws.
    shade: furShade(bodyGroup, ["M-22 -52 C-10 -48 10 -48 22 -52 L22 -58 L-22 -58Z", "M-4 -8 L4 -8 L5 0 L-5 0Z"]),
    under: between(),
    // From under the collar's end down over the shoulder's fluff to where the chest lies on the haunch, the lighter fur line.
    outline: { ...OUTLINE, taper: 4.5, spans: [{ from: [-28.8, -61], to: [-34.8, -38], width: THIN, colour: C.furLine }, { from: [34.8, -38], to: [28.8, -61], width: THIN, colour: C.furLine }] },
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
    add(`head.patch.${side}`, join(
      marking(`head.patch.${side}`, { shape: head, paint: headPaint }, patches[side], { fill: C.patch, blur: 0.9, clip: false, fade: patchFade[side] }),
      // The ear root's tan is the ear's own, unshaded as the ear is there, fading down into the patch.
      marking(`head.patch.${side}`, { shape: head, paint: { ...headPaint, shade: undefined, highlight: undefined } }, earRoots[side], { fill: C.marking, blur: 0.8, clip: false, fade: rootFade[side] }),
    ));
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
    shade: { multiply: C.furShadeBy, rim: { inset: 3, toLight: 4.5 }, group: headGroup, keep: ["M-40 -152 L40 -152 L40 -130 L-40 -130Z"], blur: 2.4 },
    highlight: { d: headLight, colour: C.light, opacity: 0.4, blur: 4 },
    // The curls where the tall middle lock overlaps the locks either side, one where the right lock tucks in,
    // short enough to stay inside the edge, and the one curl stroke inside the middle lock.
    inner: [
      { pts: [[-13.4, -155.4], [-11.6, -153.6], [-11.2, -151.2]], width: 0.9, colour: C.furLine, opacity: 0.7 },
      { pts: [[5.2, -160.4], [5, -157.4], [3, -154.6]], width: 0.9, colour: C.furLine, opacity: 0.7 },
      { pts: [[21.6, -154.8], [20.4, -152.8], [18.4, -151.6]], width: 0.8, colour: C.furLine, opacity: 0.5 },
      { pts: [[-4.2, -152.6], [-3.6, -156.6], [-1.6, -159.8]], width: 0.75, colour: C.furLine, opacity: 0.4 },
    ],
    outline: { ...OUTLINE, colour: C.fluffLine, width: THIN, spans: [{ from: [-30.6, -150.4], to: [22.8, -153] }], taper: 4 },
    feather: { from: [0, -146.5], to: [0, -150.5] },
  }));
  for (const side of ["R", "L"] as const) {
    const sx = side === "R" ? -1 : 1;
    add(`front.${side}`, part(`front.${side}`, legs[side], {
      fill: C.fur,
      shade: furShade(bodyGroup, [], ["M-40 -60 L40 -60 L40 -34 L-40 -34Z"]),
      // Two short toe lines curving up from the sole's notches, bowing apart like the paw stub's.
      inner: [[[-20.2, -1.1], [-20.9, -3.3], [-20.5, -5.7]], [[-11.2, -1.1], [-10.6, -3.3], [-11, -5.7]]].map((pts) => ({ pts: flipX(pts as P[], side), width: INNER, colour: C.warmLine, opacity: 0.8 })),
      // A light line down the inside from mid-chest, where the leg lies on the chest's tan; the warm line round
      // the paw and up the outside's lower half, where the sheet draws the leg against the haunch.
      outline: { ...OUTLINE, taper: 5, spans: bySide(side, [
        { from: [-3.3, -22], to: [-1.3, -8], width: THIN, colour: C.furLine },
        { from: [-1.4, -6], to: [-29.5, -8.6], width: 1.6, colour: C.warmLine },
        { from: [-29.8, -10.4], to: [-33.4, -30], width: THIN, colour: C.warmLine },
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
