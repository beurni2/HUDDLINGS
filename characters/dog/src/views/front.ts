// The dog's front view: shapes first, every node typed by hand in model space
// (points, the ground under the seat at 0, 0, y down) at the extremes and
// inflections read off the front turnaround, then paint. Light groups share one
// light across joined parts (head and tuft, chest and front legs, haunches and
// hind paws); joins are feathered and carry no rim and no line.
import { furEdge, furSpan } from "../../../draw/fur.ts";
import { bbox, ellipse, fracAt, mirrorX, pathD, rotate, sample, smooth, symmetric, type Node, type P, type Shape } from "../../../draw/geom.ts";
import { innerLine, mirrorSpans, ribbons, strokeOf, type DrawnLine, type Outline, type Span, type Stroke } from "../../../draw/line.ts";
import { LIMITS } from "../../../draw/lint.ts";
import { marking, part, soft, type Paint } from "../../../draw/paint.ts";
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
const OUTLINE: Outline = { colour: C.outline, width: OUTER, taper: 6, blur: 0.45 };

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

// The hind paws (front c's): round stubs in front of the haunches, their inner halves behind the front paws.
const hindR: Node[] = [[-29.4, -17.6], [-34.6, -19.8], [-40.8, -19.6], [-45.4, -16.6], [-47.4, -11.4], [-46.4, -6], [-42.8, -2.8], [-37, -1.8],
  [-31, -2], [-26.6, -4.6], [-25.2, -11], [-26.4, -15.6]];
const hind = { R: smooth(hindR), L: other(hindR) };

// The chest: its edge is the silhouette from under the cheek to the top of the
// haunch, then the soft line where the chest meets the haunch, melting into the
// leg; its foot runs on down between the front paws.
const chest = symmetric([[0, -66], [-16, -65.4], [-25.6, -63.2], [-30, -59.6], [-32.6, -55.4], [-34.4, -50.6], [-35.2, -45.4], [-35, -40],
  [-34.2, -34], [-33, -26], [-31, -17], [-28, -9], [-20, -4.4], [-8, -3.2]], [0, -3]);

// The front legs (front c's): short chubby columns that melt into the chest,
// sloping down toward the middle so they pass under the tag. Their inner edges
// meet in a point under the tag and part into a narrow lens, closing again
// where the paws bulge back in. Each ends in a round bun of a paw a little
// wider than the column above it, its sole notched where the toe lines meet it.
const legR: Node[] = [[-1.2, -31], [-3.2, -24], [-3.6, -17], [-2.6, -11.6], [-1.4, -6.8], [-2.6, -2.6], [-6.6, -0.4], [-11.2, -0.8], [-15.4, -0.05],
  [-19.8, -0.8], [-24.6, -0.3], [-28.8, -2.6], [-31.4, -6.6], [-32, -11.2], [-31.2, -15.6], [-32, -21], [-33.4, -30], [-34.2, -40], [-34.4, -46.4],
  [-26, -44], [-15, -40], [-6, -35]];
const legs = { R: smooth(legR), L: other(legR) };

// The collar: a band round the neck, its ends running up under the cheek fur.
// The sheet's head roll tips it a little: its left end sits higher.
const collar = smooth([[-27.6, -62.8], [-21, -61.6], [-10, -59], [0, -58.2], [10, -59.4], [20.5, -62], [28.6, -63.6],
  [28.2, -61.6], [25.4, -58.4], [21.4, -54.4], [12, -51], [0, -50.2], [-12, -51], [-20.4, -53.8], [-24.8, -57.4], [-26.9, -60.4]]);

// The tag: a round gold heart with a shallow notch and a soft point, and the
// smaller heart embossed on it.
const heart = smooth([[0, -48.6], [-3.4, -51], [-6.8, -50.6], [-8.6, -47.8], [-8.4, -44], [-6.4, -40.4], [-3.2, -37.6], [0, -36.2], [3.2, -37.6],
  [6.4, -40.4], [8.4, -44], [8.6, -47.8], [6.8, -50.6], [3.4, -51]], { corners: [0, 7] });
const innerHeart = smooth([[0, -45.6], [-2.4, -47.6], [-4.8, -47.2], [-5.8, -44.8], [-4.8, -41.8], [-2.4, -39.8], [0, -38.8], [2.4, -39.8], [4.8, -41.8],
  [5.8, -44.8], [4.8, -47.2], [2.4, -47.6]], { corners: [0, 6] });

// The ears (front a's): droplets hanging from high on the head's sides, narrow
// at the root (tucked under the crown fur), broad and rounded below, the lower
// edge hanging in soft lobes, their inner edges running on behind the face.
// Typed in the head's frame for the dog's right side and rolled with the face;
// the dog's left ear hangs 2.8° nearer the face, as the sheet draws it.
const earR: Node[] = [[-37.5, -141.4], [-29.4, -138.6], [-28.2, -132.4], [-34, -114], [-39.6, -92], [-39.2, -74], [-41.4, -66.6], [-46.8, -63.8],
  [-53.4, -62.3], [-58.6, -63.5], [-63.6, -64.5], [-68.6, -67.9], [-73.4, -71], [-77.4, -76.4], [-80.4, -82], [-81, -88.4], [-80.4, -94.4],
  [-78.2, -100.2], [-73.6, -106.2], [-66.8, -111.6], [-60.8, -117.4], [-56, -125.6], [-50.2, -131.2], [-44.6, -135.6]];
const EAR_L_HANG = 2.8, EAR_L_ROOT: P = [37.5, -138];
const ears = { R: smooth(rollN(earR)), L: smooth(rollN(rotate(mirrorX(earR), EAR_L_HANG, EAR_L_ROOT))) };
/** A head-frame place on the dog's right ear, or the same place on its left ear, rolled. */
const onEar = (side: "L" | "R", p: P): P => rollP(side === "R" ? p : (rotate([[-p[0], p[1]]], EAR_L_HANG, EAR_L_ROOT)[0] as P));
/** Path data on the dog's right ear, or the same on its left (the hang is small enough to leave out of soft paint), rolled. */
const earD = (side: "L" | "R", d: string) => rollD(side === "R" ? d : mirrorD(d));

/**
 * The face's roll carried down into the cheeks and jaw (DECISIONS 8): below the
 * eyes each point is lifted on the dog's left and lowered on its right by its
 * distance from the midline times the roll, fading out above the eyes, where
 * the crown and the topknot stay level as the sheet draws them.
 */
const cheekRoll = ([x, y]: P): P => [x, y + x * Math.tan(ROLL) * Math.min(1, Math.max(0, (y + 118) / 20))];

// The head: a soft round mass with a full crown, widest at the cheeks. Its
// sides run along the ears' inner edges, 93.3 pt apart (DECISIONS 7). Typed as
// its right half, mirrored, then the cheeks rolled with the face.
const headHalf: Node[] = [[0, -151.8], [-16, -151.2], [-26, -149.4], [-32.4, -146.8], [-37.6, -143.4], [-41.6, -139.8], [-44.4, -136.2], [-45.8, -130],
  [-46.4, -120], [-46.6, -110], [-46.4, -100], [-46, -94], [-47.6, -89.6], [-49.4, -85], [-49.8, -80.4], [-48.8, -76.4], [-47.2, -72.8],
  [-44.8, -70.2], [-41.4, -68.2], [-37.6, -66.4], [-31, -63.8], [-21, -61.2], [-9, -58.6]];
let head = smooth([...headHalf, [0, -57.5], ...mirrorX(headHalf, false).slice(0, -1)].map(([x, y]): Node => cheekRoll([x, y])), { typed: headHalf.length + 1 });
// The cheeks' fluff, as the hero and the front turnaround draw it: a round puff
// on each side, spilling over the ear's inner edge and down over the collar,
// with soft fur lines along its lower edge. Typed as nodes above, drawn as fur.
// Two shallow notches part each puff into round locks, as the sheet draws them.
const puffLocks = [{ len: 0.7, w: 1.1, lean: 0.2 }, { len: 0.9, lean: 0.3 }, { len: 0.7, w: 0.9, lean: 0.4 }];
head = furSpan(furSpan(head, cheekRoll([-47.6, -89.6]), cheekRoll([-37.6, -66.4])), cheekRoll([37.6, -66.4]), cheekRoll([47.6, -89.6]));
head = furEdge(head, cheekRoll([-49.4, -84.6]), cheekRoll([-40.4, -68]), puffLocks, 0.75);
head = furEdge(head, cheekRoll([40.4, -68]), cheekRoll([49.4, -84.6]), [...puffLocks].reverse().map((l) => ({ ...l, lean: -l.lean })), 0.75);
// Short curved fur lines run in from each notch.
const cheekStrokes: P[][] = [[[-49.6, -79.2], [-48, -80], [-46.8, -81.4]], [[-46.4, -72.4], [-44.8, -73.2], [-43.8, -74.6]], [[-38.6, -67.6], [-37.6, -69], [-37.2, -70.6]]];
const furStrokes: P[][] = [...cheekStrokes, ...cheekStrokes.map((pts) => pts.map(([x, y]): P => [-x, y]))].map((pts) => pts.map(cheekRoll));

// The topknot: three fur lobes, the middle one tallest, each ending in a curl,
// typed node by node (the sheet's tuft).
const tuft = furSpan(smooth([[-31, -149.2], [-29.6, -152.8], [-26.6, -155.6], [-22, -157], [-17.4, -157.4], [-13.4, -156.4], [-11.2, -154],
  [-9.6, -158], [-6.8, -161.4], [-3.4, -163.6], [0.4, -164.2], [3.4, -163.2], [5, -160.8], [5.2, -158], [8.6, -159.4], [12.4, -160.2], [16.6, -159.8],
  [20.8, -158.4], [23.2, -155.6], [22.6, -152.2], [14, -146.6], [0, -145.4], [-18, -146.2]], { corners: [6, 13] }), [-30.6, -150.4], [22.8, -153]);

// The head patches: pale tan rings round each eye, thick above it, thin below
// it and fading out on the nose side, open toward the ear (a little bay of
// cream above the eye's outer corner), running out to the ear below its root.
// Typed per side, as the sheet draws them (the left a little higher, with the
// head's roll), with about 4 pt of bleed past the head's edge.
const patches = {
  R: smooth([[-50, -126], [-44.6, -125.6], [-41.4, -124.4], [-40.4, -121.4], [-40.8, -117.4],
    [-38.4, -113.6], [-35.4, -115.6], [-31, -117.6], [-25.4, -118.4], [-20, -116.6], [-16.2, -112], [-14.6, -105.6], [-16.4, -93.8], [-20, -90], [-25, -88.4],
    [-31, -89.4], [-36.6, -90.4], [-41.6, -89.8], [-50, -88], [-51, -112]]),
  L: smooth([[48.6, -122], [41.4, -122.6], [37.6, -122.8], [35.6, -120.6], [33.7, -118.6],
    [30.5, -120.2], [25.8, -121.6], [20.2, -121.6], [15.1, -119], [11.9, -114], [11.2, -107.4], [14.7, -96], [18.7, -92.7], [23.9, -91.8], [29.7, -93.6],
    [35.1, -95.4], [40.2, -95.5], [49.6, -94], [50.4, -118]]),
};
// Where the sheet shows each ear's tip melting into the head: the ear's own tan
// reaching in under the crown, its inner edge soft until the crease begins
// lower down. Painted with the patch (a part of the head's marking), typed per
// side: the left reaches further in and higher, with the head's roll.
const earTips = {
  R: smooth([[-50, -135], [-46.4, -132.6], [-41.2, -133.4], [-36.8, -134.2], [-34.4, -133.4], [-36.8, -131.2], [-39.4, -128], [-41, -124.4], [-42.6, -121],
    [-44.4, -117.6], [-46, -114.4], [-50.4, -112]]),
  L: smooth([[46, -140.4], [42.2, -137.6], [38, -138.4], [34, -138.8], [31, -137.6], [31.4, -134], [32.8, -130.8], [34.6, -127.8], [36.8, -125.2], [38.8, -122.6],
    [40.8, -119.8], [42.6, -116.8], [44.4, -113.8], [50.4, -112], [50.6, -136]]),
};
// The saddle's two halves where they show from the front: the right half down
// the right haunch's outer side, the left half's tip at the top of the left haunch.
const saddleR = smooth([[-34.6, -50], [-35.2, -42], [-35.6, -35.4], [-37.4, -29.4], [-39.6, -24.6], [-41.6, -20.6], [-44.6, -18], [-52, -16], [-53, -40], [-41, -54]]);
const saddleL = smooth([[35.4, -48], [36.8, -42.6], [38.6, -37.6], [41, -34], [44.6, -32.2], [50, -38], [45, -50]]);

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
  // The haunch's line is lighter than the head's, in the warm line the sheet draws there (L* 57 to 66).
  outline: { ...OUTLINE, colour: C.warmLine, width: 1.2, taper: 8, spans: [{ from: [-34.6, -51], to: [-47.4, -11] }, { from: [47.4, -11], to: [34.6, -51] }] },
};
const headPaint: Paint = {
  fill: C.fur,
  // Under the jaw, where the head turns under toward the collar.
  shade: furShade(headGroup, ["M-38 -69 C-28 -63.6 -14 -61.6 0 -61.6 C14 -61.6 28 -63.6 38 -69 L46 -58 L-46 -58Z"], [], { inset: 3, toLight: 4.5 }),
  highlight: { d: headLight, colour: C.light, opacity: 0.4, blur: 4 },
  inner: [
    ...furStrokes.map((pts) => ({ pts, width: 0.65, colour: C.furLine, opacity: 0.35 })),
    // The top of each cheek's fluff, where it spills over the patch and the ear.
    ...([1, -1] as const).map((sx) => ({ pts: ([[-37.6, -91.2], [-42.4, -90.4], [-46.4, -87.4]] as P[]).map(([x, y]): P => [sx * x, y]), width: 0.8, colour: C.furLine, opacity: 0.3 })),
  ],
};
// The head's line runs all round it: a light line on the crown's fur; where the
// head meets an ear, a seam in the patches' tan where the ear's tip melts into
// the head and the ear's own tan below it (DECISIONS 7); a light line on the
// cheeks' fluff, and the jaw's line over the collar.
const headLine: Outline = { ...OUTLINE, taper: 5, spans: [
  { from: [-27, -148.2], to: [-44, -137], width: THIN, colour: C.fluffLine },
  { from: [-45.6, -131.6], to: [-46.3, -116], width: THIN, colour: C.marking },
  { from: [-46.5, -113], to: [-46.4, -92], width: THIN, colour: C.earLine },
  { from: [-46.2, -92], to: [-35, -64.6], width: THIN, colour: C.fluffLine },
  { from: [-30, -63.4], to: [30, -63.4], width: THIN, colour: C.fluffLine },
  { from: [35, -64.6], to: [46.2, -92], width: THIN, colour: C.fluffLine },
  { from: [46.4, -92], to: [46.5, -113], width: THIN, colour: C.earLine },
  { from: [46.3, -116], to: [45.6, -131.6], width: THIN, colour: C.marking },
  { from: [44, -137], to: [17, -150.8], width: THIN, colour: C.fluffLine },
].map((span) => ({ ...span, from: cheekRoll(span.from as P), to: cheekRoll(span.to as P) })) };

/** Where each ear's tan tip melts into the head, the sheet draws the ear's inner edge on across it, down to the head's side. */
const earTipEdges: P[][] = [[[-38.4, -128.6], [-40.6, -124.6], [-42.8, -120.6], [-44.8, -116.2], [-46.3, -112.4]],
  [[37.4, -131], [40, -126], [42.6, -121], [44.4, -117], [45.8, -112.4]]];

/** head.line: the head's outline as its own unclipped region, drawn after the head's clip group, reaching 0.5 pt past the head. */
function headLinePiece(): Piece {
  const r = ribbons(head, headLine, "head.line", 0.5);
  const edges = earTipEdges.map((pts) => innerLine(pts, 0.9, C.earLine, { taper: 3, tip: 0.3 }));
  const f = uid("blur");
  const [x0, y0, x1, y1] = bbox(head.segs);
  const box = pad([x0, y0, x1 - x0, y1 - y0], 2);
  return piece(`<defs>${blur(f, pad(box, 2), headLine.blur!)}</defs><g fill="${headLine.colour}" filter="url(#${f})">${r.svg}${edges.map((e) => e.svg).join("")}</g>`, box, {
    shapes: [{ name: "head.line", nodes: head.typed, segs: head.segs, outlined: r.outlined, fur: head.fur.map(([a, b]) => [fracAt(head, a), fracAt(head, b)]) }],
    lines: [...r.lines, ...edges.map((e) => ({ ...e.line, where: "ear tip edge" }))],
  });
}

/**
 * An open eye at its landmark, as the turnaround paints it, with front c's geometry: slightly oval, its top
 * tilted about 10° toward the nose (and rolled with the face); a dark rim and a thin dark lid along its top;
 * a broad soft crescent of white low on the outer side, inside the rim; the iris near-black above and the
 * printed brown low down (DECISIONS 18), with a small warm band of reflected light at its foot; one large
 * catchlight high on the nose side and a small faint one low on the outer side. `noseward` is +1 when the
 * nose is to its right.
 */
function eye(landmark: P, noseward: number): Piece {
  const rx = 9, ry = 10, turn = 10 * noseward + ROLL_DEG, out = -noseward;
  // The ball sits a little out and down from the landmark, the dark iris's own centre (DECISIONS 10): the
  // crescent of white takes its lower outer side and the lid darkens its top.
  const [cx, cy]: P = [landmark[0] + out * 0.9 * cosR - sinR, landmark[1] + out * 0.9 * sinR + cosR];
  /** A point in the eye's own tilted frame, x toward the viewer's right. */
  const E = (x: number, y: number): P => rotate([[cx + x, cy + y]], turn, [cx, cy])[0] as P;
  const oval = (c: P, a: number, b: number) => pathD(ellipse(c, a, b, turn));
  const clip = uid("eye"), iris = uid("iris"), soft = uid("blur"), white = uid("blur"), shine = uid("blur");
  const box: Box = [cx - 14, cy - 14, 28, 28];
  const ball = oval([cx, cy], rx, ry);
  // The iris: the ball moved toward the nose and up, and a little smaller, so the white shows only as a crescent
  // low on the outer side, about 2 pt at its widest, thinning round the bottom and gone by the top.
  const ic = E(noseward * 1.5, -0.6);
  const [gx, gy] = E(noseward * 1.7, 2.6), [fx, fy] = E(noseward * 1.4, 8.2);
  const big = E(noseward * 3.4, -4.2), small = E(out * 2.8, 5.2);
  // The lid: from just below the outer corner, over the top, to high on the nose side, on the ball's rim.
  const lid: P[] = Array.from({ length: 41 }, (_, k) => {
    const a = ((-15 + (165 * k) / 40) * Math.PI) / 180;
    return E(out * (rx + 0.3) * Math.cos(a), -(ry + 0.3) * Math.sin(a));
  });
  const lidLine = tapered(lid, 1.4, "outer", "eye lid", { taper: 6, tip: 0.3 });
  const n = (p: P) => `${fmt(p[0])}" cy="${fmt(p[1])}`;
  const svg = `<defs><clipPath id="${clip}"><path d="${ball}"/></clipPath>` +
    `<radialGradient id="${iris}" gradientUnits="userSpaceOnUse" cx="${fmt(gx)}" cy="${fmt(gy)}" r="12" fx="${fmt(fx)}" fy="${fmt(fy)}">` +
    `<stop offset="0.05" stop-color="${C.irisWarm}"/><stop offset="0.2" stop-color="${C.dark}"/><stop offset="0.34" stop-color="${C.dark}"/>` +
    `<stop offset="0.6" stop-color="${C.eyeDark}"/></radialGradient>` +
    `${blur(soft, box, 0.4)}${blur(white, box, 0.3)}${blur(shine, box, 0.22)}</defs>` +
    `<path d="${ball}" fill="${C.eyeDark}"/>` +
    `<g clip-path="url(#${clip})"><path d="${oval([cx, cy], rx - 0.6, ry - 0.6)}" fill="${C.eyeWhite}" opacity="0.95" filter="url(#${white})"/>` +
    `<path d="${oval(ic, rx - 1, ry - 0.8)}" fill="url(#${iris})" filter="url(#${soft})"/></g>` +
    `<path d="${lidLine.d}" fill="${C.eyeDark}"/>` +
    `<ellipse cx="${n(big)}" rx="1.9" ry="1.8" fill="${C.light}" filter="url(#${shine})"/>` +
    `<circle cx="${n(small)}" r="0.7" fill="${C.light}" opacity="0.35"/>`;
  return piece(svg, box, { shapes: [], lines: [lidLine.line] });
}

/** A brow in the face frame: a short soft arch in tan, thickest in the middle, its inner end higher. */
function brow(sx: number): Piece {
  const pts: P[] = [[sx * 27.2, -24.6], [sx * 25.4, -27.4], [sx * 22.4, -29], [sx * 19, -28.2]];
  const f = uid("blur"), box = faceBox([sx > 0 ? 15 : -31, -33, 16, 12]);
  return piece(`<defs>${blur(f, box, 0.35)}</defs><g filter="url(#${f})">` +
    inFace(`<path d="${strokeOf(pts, 2.6, { taper: 3, tip: 1.1 }).d}" fill="${C.marking}" opacity="0.85"/>`) + "</g>", box);
}

/** The nose in the face frame (front a's): a rounded triangle with a flat top, broadest a little below it, with a soft shine on its upper left. */
function nose(): Piece {
  return piece(inFace(`<path d="M0 4.6 C3.9 4.5 6.4 5 6.4 6.9 C6.4 8.4 2.4 11 0 11.1 C-2.4 11 -6.4 8.4 -6.4 6.9 C-6.4 5 -3.9 4.5 0 4.6Z" fill="${C.eyeDark}"/>` +
    `<ellipse cx="-2.2" cy="6.4" rx="2" ry="0.85" fill="${C.light}" opacity="0.18"/>`), faceBox([-8, 2, 16, 12]));
}

/**
 * The open happy mouth in the face frame: under a short line from the nose, the upper lip peaks at the
 * middle and runs down to each corner, which ends in a tapered upward hook; below it the opening is a round
 * U, its sides and bottom a soft tapered lip (front a's), not a rim. The tongue fills it under a band of the
 * dark inside about 40% of the opening's height at the middle, thinning toward the corners.
 */
function mouth(): Piece {
  const m = "M0 14.4 C2.8 16.4 6.4 18.2 9.4 18.4 C9.9 23.4 6.8 28.7 0 28.9 C-6.8 28.7 -9.9 23.4 -9.4 18.4 C-6.4 18.2 -2.8 16.4 0 14.4Z";
  const clip = uid("mouth");
  // Each half of the upper lip, from the peak along the opening's top to the corner, then up into the hook.
  const top = sample([[[0, 14.4], [2.8, 16.4], [6.4, 18.2], [9.4, 18.4]]], 10, false);
  const upper = (sx: number): P[] => ([...top, [11.2, 17.8], [12.4, 16.6], [12.9, 15.1]] as P[]).map(([x, y]): P => [sx * x, y]);
  const lips = [upper(-1), upper(1)].map((pts) => tapered(pts, 1.2, "outer", "upper lip", { taper: 2.6, tip: 0.3 }));
  // The opening's own edge, down each side and round the bottom, dark and soft.
  const edge = sample([[[-9.4, 18.4], [-9.9, 23.4], [-6.8, 28.7], [0, 28.9]], [[0, 28.9], [6.8, 28.7], [9.9, 23.4], [9.4, 18.4]]], 10, false);
  const lower = tapered(edge, 0.75, "inner", "lower lip", { taper: 5, tip: 0.2 });
  const philtrum = innerLine([[0, 10.6], [0, 14.6]], 0.9, C.dark, { taper: 1, tip: 0.6, wobble: 0 });
  const svg = `<defs><clipPath id="${clip}"><path d="${m}"/></clipPath></defs>` +
    `<path d="${m}" fill="${C.mouthInside}"/><g clip-path="url(#${clip})"><path d="M-10 20.6 C-6 19.8 -2.4 20 0 20.4 C2.4 20 6 19.8 10 20.6 L10 30 L-10 30Z" fill="${C.tongue}"/>` +
    `<ellipse cx="-3" cy="23.4" rx="2.2" ry="1.1" fill="${C.tongueShine}" opacity="0.55"/></g>` +
    `<path d="${lower.d}" fill="${C.dark}" opacity="0.55"/>${lips.map((l) => `<path d="${l.d}" fill="${C.dark}"/>`).join("")}${philtrum.svg}`;
  return piece(inFace(svg), faceBox([-15, 10, 30, 21]), { shapes: [], lines: [...lips.map((l) => l.line), lower.line, { ...philtrum.line, where: "philtrum" }] });
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
 * painted as front a paints it: a warm gold whose shade deepens toward orange, a lit spot high on its left,
 * and the smaller heart embossed on it, a warm line with the light catching its lower edge.
 */
function tagPiece(): Piece {
  const ring = piece(`<rect x="-1.4" y="-57.2" width="2.8" height="7.2" rx="1.4" fill="${C.collar}" stroke="${C.collarLine}" stroke-width="0.6"/>` +
    `<rect x="-0.7" y="-56.6" width="0.8" height="5.6" rx="0.4" fill="${C.collarHighlight}"/>`, [-2.5, -58, 5, 9], { shapes: [], lines: [{ kind: "inner", width: 0.6, where: "tag ring" }] });
  const emboss = sample(innerHeart.segs, 10);
  emboss.push(emboss[0]!);
  return join(ring, part("tag", heart, {
    fill: C.tag,
    shade: { multiply: C.tagShadeBy, rim: { inset: 1.1, toLight: 1.8 }, blur: 1.5 },
    highlight: { d: "M-6.4 -47.2 a2.2 1.4 -40 1 0 4.4 0 a2.2 1.4 -40 1 0 -4.4 0", colour: C.tagShine, opacity: 0.85, blur: 0.7 },
    inner: [{ pts: emboss, width: 0.7, colour: C.tagLine, opacity: 0.55 }, { pts: emboss.map(([x, y]): P => [x + 0.35, y + 0.45]), width: 0.6, colour: C.tagShine, opacity: 0.5 }],
    outline: { colour: C.tagLine, width: THIN, taper: 2, blur: 0.2 },
  }));
}

/**
 * An ear's paint (front c's, on front a's ears): the tan deepening down the ear and toward its outer edge
 * under the fur's own warm shade, as the sheet paints it, reaching about the sheet's #D89464 low down; the
 * shade on the rim away from the light and where the cheek's fluff hangs over it, none where the root shows
 * under the crown, where it is the same flat tan as the root's tan on the head beside it; three faint lock
 * lines flowing down to the lobes of its lower edge; and its line in the warmer, lighter brown, from where it comes out from under
 * the cheek round the bottom and up the outside to where it tucks under the crown.
 */
function earPaint(side: "L" | "R"): Paint {
  const k = side === "R" ? 1 : -1;
  const ear = ears[side];
  const deep = uid("deep"), [ex0, ey0, ex1, ey1] = bbox(ear.segs);
  const under = `<defs><linearGradient id="${deep}" gradientUnits="userSpaceOnUse" x1="${-k * 52}" y1="-98" x2="${-k * 60}" y2="-62">` +
    `<stop offset="0" stop-color="${C.earDeep}" stop-opacity="0"/><stop offset="0.4" stop-color="${C.earDeep}"/>` +
    `<stop offset="1" stop-color="${C.earDeeper}"/></linearGradient></defs>` +
    `<rect x="${fmt(ex0)}" y="${fmt(ey0)}" width="${fmt(ex1 - ex0)}" height="${fmt(ey1 - ey0)}" fill="url(#${deep})"/>`;
  const shadeD = "M-90 -96 C-80 -84 -62 -76 -40 -74 L-40 -50 L-90 -50Z";
  const cheekD = "M-38 -96 C-44 -92 -50 -84 -51 -74 C-50 -66 -46 -62 -40 -60Z";
  const root = "M-50 -146 L-30 -146 L-30 -112 L-50 -112Z";
  const locks: P[][] = [[[-74.4, -92], [-76.8, -84], [-77.2, -77.8]], [[-67.6, -90], [-69.8, -80], [-68.6, -69.2]], [[-59, -88], [-60.6, -76], [-58.8, -65]]];
  const ends: [P, P] = [onEar(side, [-41.6, -67.2]), onEar(side, [-44.6, -135.4])];
  return {
    fill: C.marking,
    under,
    shade: { multiply: C.furShadeBy, rim: { inset: 2.2, toLight: 3.6 }, shapes: [earD(side, shadeD), earD(side, cheekD)], keep: [earD(side, root)], blur: 4 },
    inner: locks.map((pts) => ({ pts: pts.map((p) => onEar(side, p)), width: 0.9, colour: C.earLine, opacity: 0.26 })),
    outline: { ...OUTLINE, colour: C.warmLine, taper: 6, spans: [side === "R" ? { from: ends[0], to: ends[1] } : { from: ends[1], to: ends[0] }] },
  };
}

/**
 * Deep between the front legs the sheet paints the body's tan, deepening down toward the paws (front c's
 * wedge): a V that shows through the lens where the legs part under the tag.
 */
function between(): string {
  const g = uid("between");
  return `<defs><linearGradient id="${g}" gradientUnits="userSpaceOnUse" x1="0" y1="-27" x2="0" y2="-12">` +
    `<stop offset="0" stop-color="${C.marking}" stop-opacity="0"/><stop offset="1" stop-color="${C.marking}" stop-opacity="0.85"/></linearGradient></defs>` +
    `<path d="M0 -31 C-1.8 -24 -4.6 -16 -5 -8 L-4.6 -1 L4.6 -1 L5 -8 C4.6 -16 1.8 -24 0 -31Z" fill="url(#${g})"/>`;
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
      // Over the top, round the outside and the sole, to where it goes behind the front paw, in the warm line.
      outline: { ...OUTLINE, colour: C.warmLine, width: 1.3, taper: 4, spans: bySide(side, [{ from: [-30.2, -18.4], to: [-31.4, -2] }]) },
      // Two short toe lines up from the sole.
      inner: [[[-41.6, -3], [-41.6, -5.6], [-42.1, -8.2]], [[-35.8, -2.2], [-35.8, -4.8], [-36.3, -7.4]]].map((pts) => ({ pts: flipX(pts as P[], side), width: INNER, colour: C.outline, opacity: 0.6 })),
    }), 6));
  }
  add("body.front", part("body.front", chest, {
    fill: C.fur,
    // The shade falls between the legs, where the chest turns back from them.
    shade: furShade(bodyGroup, ["M0 -33 C-2 -28 -4.4 -20 -4.4 -12 L-3 -2 L3 -2 L4.4 -12 C4.4 -20 2 -28 0 -33Z"]),
    under: between(),
    outline: { ...OUTLINE, taper: 4.5, spans: [
      { from: [-29, -61], to: [-34.6, -48.6] }, { from: [-34.8, -47.6], to: [-34.8, -38], width: THIN, colour: C.furLine },
      { from: [34.8, -38], to: [34.8, -47.6], width: THIN, colour: C.furLine }, { from: [34.6, -48.6], to: [29, -61] },
    ] },
  }));
  // The chin's shadow on the chest, cast by the head (spec L396).
  add("shadow.chin", soft("M-26 -59 C-12 -53 12 -53 26 -59 L26 -66 L-26 -66Z", [-26, -66, 52, 10], C.furShade, 2.4));
  // The collar (front c's paint): in shade along its top, under the chin; lit along its lower half; the keeper
  // the tag's ring hangs from.
  add("collar", part("collar", collar, {
    fill: C.collar,
    shade: { multiply: C.shadeBy, shapes: ["M-32 -66 L32 -68 L32 -61.8 C14 -56.6 -12 -56.2 -32 -60Z"], blur: 0.9 },
    highlight: { d: "M-21 -55.2 C-11 -52.2 10 -52.2 21 -56.6 L21 -55 C10 -50.8 -11 -50.8 -21 -53.8Z", colour: C.collarHighlight, opacity: 0.55, blur: 0.6 },
    under: `<rect x="-2" y="-60" width="4.4" height="10" rx="1.2" fill="${C.collarLine}" opacity="0.3"/>`,
    outline: { colour: C.collarLine, width: THIN, spans: [{ from: [28.2, -61.6], to: [-26.9, -60.4] }], taper: 4, blur: 0.25 },
  }));
  add("tag", tagPiece());
  for (const side of ["R", "L"] as const) add(`ear.${side}`, part(`ear.${side}`, ears[side], earPaint(side)));
  add("head.base", part("head.base", head, headPaint));
  for (const side of ["L", "R"] as const) {
    add(`head.patch.${side}`, join(
      marking(`head.patch.${side}`, { shape: head, paint: headPaint }, patches[side], { fill: C.patch, blur: 0.8, clip: false }),
      // The ear root's tan is the ear's own, unshaded as the ear is there, with a crisp edge where the crown fur lies over it.
      marking(`head.patch.${side}`, { shape: head, paint: { ...headPaint, shade: undefined, highlight: undefined } }, earTips[side], { fill: C.marking, blur: 0.5, clip: false }),
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
    // The curls where each lobe ends, and a stroke where the left lobe leaves the crown.
    inner: [
      { pts: [[-13.4, -155.4], [-11.6, -153.6], [-11.2, -151.2]], width: 0.9, colour: C.furLine, opacity: 0.7 },
      { pts: [[5.2, -160.4], [5, -157.4], [3, -154.6]], width: 0.9, colour: C.furLine, opacity: 0.7 },
      { pts: [[22.8, -155.2], [21.2, -152.2], [17.6, -150.6]], width: 0.9, colour: C.furLine, opacity: 0.7 },
      { pts: [[-30.2, -150.6], [-26.4, -149.2], [-22.2, -148.4]], width: 0.9, colour: C.furLine, opacity: 0.6 },
    ],
    outline: { ...OUTLINE, colour: C.fluffLine, width: THIN, spans: [{ from: [-30.6, -150.4], to: [22.8, -153] }], taper: 4 },
    feather: { from: [0, -146.5], to: [0, -150.5] },
  }));
  for (const side of ["R", "L"] as const) {
    const sx = side === "R" ? -1 : 1;
    add(`front.${side}`, part(`front.${side}`, legs[side], {
      fill: C.fur,
      shade: furShade(bodyGroup, [], ["M-40 -60 L40 -60 L40 -34 L-40 -34Z"]),
      // Two short toe lines up from the sole's notches, fanning a little toward it.
      inner: [[[-19.8, -1.2], [-19.6, -3.8], [-19.1, -6.4]], [[-11.2, -1.2], [-11.4, -3.8], [-11.8, -6.4]]].map((pts) => ({ pts: flipX(pts as P[], side), width: INNER, colour: C.outline, opacity: 0.6 })),
      // A warm line down the inside, where the leg lies on the chest, and round the paw; a faint one up the
      // outside, where it lies on the haunch's fur.
      outline: { ...OUTLINE, taper: 5, spans: bySide(side, [
        { from: [-3.2, -24], to: [-1.5, -8], width: THIN, colour: C.warmLine },
        { from: [-1.6, -6], to: [-31.6, -8.4], width: 1.3, colour: C.warmLine },
        { from: [-31.9, -10], to: [-33.4, -36], width: THIN, colour: C.fluffLine },
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
