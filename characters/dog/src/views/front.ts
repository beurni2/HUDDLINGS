// The dog's front view: shapes first, every node typed by hand in model space
// (points, the ground under the seat at 0, 0, y down) at the extremes and
// inflections read off the front turnaround, then paint. Light groups share one
// light across joined parts (head and tuft, chest and front legs, haunches and
// hind paws); joins are feathered and carry no rim and no line.
import { furEdge, furSpan } from "../../../draw/fur.ts";
import { bbox, fracAt, mirrorX, sample, smooth, symmetric, type Node, type P, type Shape } from "../../../draw/geom.ts";
import { innerLine, mirrorSpans, ribbons, taperedStroke, type Outline, type Span } from "../../../draw/line.ts";
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
/** Inner lines typed for the dog's right side, mirrored for its left. */
const flipX = (pts: P[], side: "L" | "R") => (side === "R" ? pts : pts.map(([x, y]): P => [-x, y]));

// The face frame. The turnaround's head is rolled about 4° toward the dog's
// right shoulder (DECISIONS 8): its outline is symmetric, but the eyes, the
// mouth and the patches sit on a tilted line. The face is drawn symmetric about
// its own centre line, between the eyes' landmarks, and rolled with them, so
// every eye lands on its landmark and its rig pivot.
const LM = model.landmarks.front!;
const EYE_L = LM["eye.L"]!, EYE_R = LM["eye.R"]!;
const FC: P = [(EYE_L[0] + EYE_R[0]) / 2, (EYE_L[1] + EYE_R[1]) / 2];
const ROLL = Math.atan2(EYE_L[1] - EYE_R[1], EYE_L[0] - EYE_R[0]);
const cosR = Math.cos(ROLL), sinR = Math.sin(ROLL);
/** A point in the face frame (origin between the eyes, x along the eye line) in model space. */
const face = ([x, y]: P): P => [FC[0] + x * cosR - y * sinR, FC[1] + x * sinR + y * cosR];
const r3 = (n: number) => Math.round(n * 1000) / 1000;
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

// The hind paws: round stubs in front of the haunch's foot, a little higher than the front paws.
const hindR: Node[] = [[-48.6, -14], [-46.6, -17.2], [-42.6, -19.1], [-37.6, -19.4], [-33.2, -18], [-30.6, -14.2], [-29.4, -10], [-30, -6.8],
  [-31.8, -4.6], [-35, -3.7], [-42.6, -4], [-46.4, -6], [-48.4, -9.6]];
const hind = { R: smooth(hindR), L: other(hindR) };

// The chest: its edge is the silhouette from under the cheek to the top of the
// haunch, then the soft line where the chest meets the haunch, melting into the leg.
const chest = symmetric([[0, -66], [-16, -65.4], [-25.6, -63.2], [-30, -59.6], [-32.6, -55.4], [-34.4, -50.6], [-35.2, -45.4], [-35, -40],
  [-34.2, -34], [-33, -26], [-31, -17], [-28, -9], [-20, -5.6], [-8, -5]], [0, -5]);

// The front legs: short chubby columns from the chest to round stub paws, the
// two paws nearly touching at the middle; the toe lines divide each sole.
const legR: Node[] = [[-6.4, -42], [-4.8, -31], [-3.2, -21], [-2.2, -13], [-1.4, -8.6], [-2.2, -4.8], [-5, -2.1], [-9, -1],
  [-15.4, -0.7], [-21.6, -1.2], [-26.2, -2.6], [-28.6, -5], [-29.9, -9.6], [-30.6, -15.4], [-31.8, -21.4], [-33.2, -28], [-34.4, -35], [-35, -43]];
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

// The ears: tan droplets hanging from high on the head's sides, narrow at the
// root, widest low down, their tops hidden under the crown. The sheet draws the
// left one a little narrower and higher (the head's roll), so each is typed.
const earR = smooth([[-36, -138], [-44.8, -135.8], [-51, -132.2], [-55.4, -127.8], [-59.6, -120.4], [-62.4, -115], [-67.8, -109.6], [-74, -104],
  [-78.4, -97], [-81, -90], [-81.8, -84], [-81, -78.4], [-78.2, -72.6], [-73.6, -67.6], [-66.8, -63], [-59.4, -60.2], [-53, -59.8], [-47, -60.8],
  [-43, -63.6], [-40.4, -68], [-38.6, -78], [-37.6, -96], [-36.6, -114], [-35.4, -130]]);
const earL = smooth([[34, -142.4], [43, -138.6], [48.2, -136], [52.8, -132], [56.2, -127.6], [61.6, -120], [65.4, -116], [69.4, -112], [75, -105],
  [78.6, -96], [79.4, -88.6], [78.6, -84], [76.6, -79.6], [73, -75.8], [70, -72], [65, -68.6], [58.6, -65.4], [52, -63.8], [46.4, -64.2], [42.4, -66.4],
  [39.4, -71], [37.4, -90], [36.2, -112], [34.6, -132]]);
const fringe = [{ len: 1.1, w: 0.8, lean: 0.35 }, { len: 1.5, lean: 0.3 }, { len: 1.2, w: 1.1, lean: 0.2 }];
const ears = {
  R: furEdge(earR, [-80.4, -76.6], [-61, -61], fringe, 0.42),
  L: furEdge(earL, [76, -78.6], [59.4, -65.6], fringe, 0.42),
};

// The head: a soft round mass with a full crown, widest at the cheeks. Its
// sides run along the ears' inner edges, 93.3 pt apart (DECISIONS 7).
let head = symmetric([[0, -151.8], [-16, -151.2], [-26, -149.4], [-32.4, -146.8], [-37.6, -143.4], [-41.6, -139.8], [-44.4, -136.2], [-45.8, -130],
  [-46.4, -120], [-46.6, -110], [-46.4, -100], [-46, -94], [-47.6, -89.6], [-49.4, -85], [-49.8, -80.4], [-48.8, -76.4], [-47.2, -72.8],
  [-44.8, -70.2], [-41.4, -68.2], [-37.6, -66.4], [-31, -63.8], [-21, -61.2], [-9, -58.6]], [0, -57.5]);
// The cheeks' fluff, as the hero and the front turnaround draw it: a round puff
// on each side, spilling over the ear's inner edge and down over the collar,
// with soft fur lines along its lower edge. Typed as nodes above, drawn as fur.
// Two shallow notches part each puff into round locks, as the sheet draws them.
const puffLocks = [{ len: 0.7, w: 1.1, lean: 0.2 }, { len: 0.9, lean: 0.3 }, { len: 0.7, w: 0.9, lean: 0.4 }];
head = furSpan(furSpan(head, [-47.6, -89.6], [-37.6, -66.4]), [37.6, -66.4], [47.6, -89.6]);
head = furEdge(head, [-49.4, -84.6], [-40.4, -68], puffLocks, 0.75);
head = furEdge(head, [40.4, -68], [49.4, -84.6], [...puffLocks].reverse().map((l) => ({ ...l, lean: -l.lean })), 0.75);
// Short curved fur lines run in from each notch.
const cheekStrokes: P[][] = [[[-49.6, -79.2], [-48, -80], [-46.8, -81.4]], [[-46.4, -72.4], [-44.8, -73.2], [-43.8, -74.6]], [[-38.6, -67.6], [-37.6, -69], [-37.2, -70.6]]];
const furStrokes: P[][] = [...cheekStrokes, ...cheekStrokes.map((pts) => pts.map(([x, y]): P => [-x, y]))];

// The topknot: three fur lobes, the middle one tallest, each ending in a curl,
// typed node by node (the sheet's tuft).
const tuft = furSpan(smooth([[-31, -149.2], [-29.6, -152.6], [-26.6, -154.9], [-22, -156], [-17.4, -156.4], [-13.4, -155.6], [-11.2, -153.8],
  [-9.6, -158], [-6.8, -161.4], [-3.4, -163.6], [0.4, -164.2], [3.4, -163.2], [5, -160.8], [5.2, -158], [8.6, -158.8], [12.4, -159.4], [16.4, -159.1],
  [20.2, -157.8], [22.8, -155.4], [22.4, -152.2], [14, -146.6], [0, -145.4], [-18, -146.2]], { corners: [6, 13] }), [-30.6, -150.4], [22.6, -153]);

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
  "M-44 -84 C-42 -88 -36 -89 -31 -87 C-30 -83 -34 -79 -39 -78 C-42 -79 -44 -81 -44 -84Z " +
  "M44 -84 C42 -88 36 -89 31 -87 C30 -83 34 -79 39 -78 C42 -79 44 -81 44 -84Z";
const furShade = (group: Shape[], shapes: string[] = [], keep: string[] = [], rim = { inset: 2.5, toLight: 4 }) =>
  ({ multiply: C.furShadeBy, rim, shapes, keep, group, blur: 2.4 });
const bodyGroup = [chest, legs.R, legs.L];
const hipGroup = [back, hind.R, hind.L];
const headGroup = [head, tuft];
const mirrorD = (d: string) => d.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (_m, x: string, y: string) => `${-Number(x)} ${y}`);

const backPaint: Paint = {
  fill: C.fur,
  shade: furShade(hipGroup),
  outline: { ...OUTLINE, width: 1.4, spans: [{ from: [-34.6, -51], to: [-47.4, -11] }, { from: [47.4, -11], to: [34.6, -51] }] },
};
const headPaint: Paint = {
  fill: C.fur,
  // Under the jaw, where the head turns under toward the collar.
  shade: furShade(headGroup, ["M-38 -69 C-28 -63.6 -14 -61.6 0 -61.6 C14 -61.6 28 -63.6 38 -69 L46 -58 L-46 -58Z"], [], { inset: 3, toLight: 4.5 }),
  highlight: { d: headLight, colour: C.light, opacity: 0.75, blur: 4 },
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
  { from: [-45.6, -131.6], to: [-46.1, -122], width: THIN, colour: C.marking },
  { from: [-46.3, -120], to: [-46.4, -115], width: THIN, colour: C.junction },
  { from: [-46.5, -113], to: [-46.4, -92], width: THIN, colour: C.earLine },
  { from: [-46.2, -92], to: [-35, -64.6], width: THIN, colour: C.fluffLine },
  { from: [-30, -63.4], to: [30, -63.4], width: THIN, colour: C.fluffLine },
  { from: [35, -64.6], to: [46.2, -92], width: THIN, colour: C.fluffLine },
  { from: [46.4, -92], to: [46.5, -113], width: THIN, colour: C.earLine },
  { from: [46.4, -115], to: [46.3, -120], width: THIN, colour: C.junction },
  { from: [46.1, -122], to: [45.6, -131.6], width: THIN, colour: C.marking },
  { from: [44, -137], to: [17, -150.8], width: THIN, colour: C.fluffLine },
] };

/** Where each ear's tan tip melts into the head, the sheet draws the ear's inner edge on across it, down to the head's side. */
const earTipEdges: P[][] = [[[-37.6, -128.4], [-39.6, -125], [-41.6, -121.6], [-43.6, -118], [-45.2, -115], [-46.3, -112.4]],
  [[36.6, -128], [38.2, -125], [40.2, -122], [42.2, -119], [44.2, -116], [46.2, -112.4]]];

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

/** An open eye at (cx, cy) in model space, its landmark; `noseward` is +1 when the nose is to its right. The eye is round, so only its lid and iris turn with the face. */
function eye([cx, cy]: P, noseward: number): Piece {
  const rx = 9.6, ry = 9.6;
  const at = (dx: number, dy: number): P => [cx + dx * cosR - dy * sinR, cy + dx * sinR + dy * cosR];
  const [ix, iy] = at(noseward * 1.4, -0.3);
  const [gx, gy] = at(noseward * 1.4, 2.6), [fx, fy] = at(noseward * 1.4, 8.4);
  const [sx, sy] = at(noseward * 3.6, -3.8), [dx, dy] = at(-noseward * 2.6, 5.4);
  const clip = uid("eye"), iris = uid("iris"), shine = uid("blur");
  const box: Box = [cx - 12, cy - 12, 24, 24];
  const lid: P[] = Array.from({ length: 41 }, (_, k) => {
    const a = Math.PI * (1.05 + 1.35 * (k / 40));
    return at(Math.cos(a) * rx * -noseward, Math.sin(a) * ry);
  });
  const n = (v: number) => r3(v);
  const svg = `<defs><clipPath id="${clip}"><ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${rx}" ry="${ry}"/></clipPath>` +
    // The iris: near-black above, the lighter printed brown below (DECISIONS 18).
    `<radialGradient id="${iris}" gradientUnits="userSpaceOnUse" cx="${n(gx)}" cy="${n(gy)}" r="12" fx="${n(fx)}" fy="${n(fy)}">` +
    `<stop offset="0.42" stop-color="${C.dark}"/><stop offset="0.78" stop-color="${C.eyeDark}"/></radialGradient>` +
    `${blur(shine, box, 0.22)}</defs>` +
    `<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${rx}" ry="${ry}" fill="${C.eyeWhite}"/>` +
    `<g clip-path="url(#${clip})"><ellipse cx="${n(ix)}" cy="${n(iy)}" rx="${rx - 0.4}" ry="${ry - 0.2}" fill="url(#${iris})"/></g>` +
    `<path d="${taperedStroke(lid, 1.7, { taper: 8, tip: 0.3 })}" fill="${C.eyeDark}"/>` +
    `<ellipse cx="${n(sx)}" cy="${n(sy)}" rx="1.9" ry="1.8" fill="${C.light}" filter="url(#${shine})"/>` +
    `<circle cx="${n(dx)}" cy="${n(dy)}" r="0.7" fill="${C.light}" opacity="0.45"/>`;
  return piece(svg, box, { shapes: [], lines: [{ kind: "outer", width: 1.7, where: "eye lid" }] });
}

/** A brow in the face frame: a short soft arch in tan, thickest in the middle, its inner end higher. */
function brow(sx: number): Piece {
  const pts: P[] = [[sx * 27.2, -24.6], [sx * 25.4, -27.4], [sx * 22.4, -29], [sx * 19, -28.2]];
  const f = uid("blur"), box = faceBox([sx > 0 ? 15 : -31, -33, 16, 12]);
  return piece(`<defs>${blur(f, box, 0.35)}</defs><g filter="url(#${f})">` +
    inFace(`<path d="${taperedStroke(pts, 2.6, { taper: 3, tip: 1.1 })}" fill="${C.marking}" opacity="0.85"/>`) + "</g>", box);
}

/** The nose in the face frame: a rounded triangle, wide on top, its bottom round. */
function nose(): Piece {
  return piece(inFace(`<path d="M-6.4 6.8 C-6.8 4.6 -3.4 4 0 4 C3.4 4 6.8 4.6 6.4 6.8 C6 9.4 3.2 11.8 0 11.9 C-3.2 11.8 -6 9.4 -6.4 6.8Z" fill="${C.eyeDark}"/>` +
    `<ellipse cx="-1.8" cy="5.7" rx="1.7" ry="0.8" fill="${C.light}" opacity="0.3"/>`), faceBox([-8, 2, 16, 12]));
}

/** The open happy mouth in the face frame: a small opening under a short line from the nose, its corners curling up, the tongue filling most of it. */
function mouth(): Piece {
  const m = "M0 14.4 C2.8 16.4 6.4 18.2 9.4 18.4 C9.6 22.6 5.8 28.6 0 28.8 C-5.8 28.6 -9.6 22.6 -9.4 18.4 C-6.4 18.2 -2.8 16.4 0 14.4Z";
  const clip = uid("mouth");
  const corner = (sx: number): P[] => [[sx * 9, 18.4], [sx * 11.2, 17.8], [sx * 12.5, 16.4], [sx * 12.9, 15]];
  const lines = [corner(-1), corner(1)].map((pts) => `<path d="${taperedStroke(pts, 1.2, { taper: 2.4, tip: 0.3 })}" fill="${C.dark}"/>`).join("");
  const philtrum = innerLine([[0, 11.8], [0, 14.6]], 0.9, C.dark, { taper: 1, tip: 0.6, wobble: 0 });
  const rim = `<path d="${m}" fill="none" stroke="${C.dark}" stroke-width="0.7"/>`;
  const svg = `<defs><clipPath id="${clip}"><path d="${m}"/></clipPath></defs>` +
    `<path d="${m}" fill="${C.mouthInside}"/><g clip-path="url(#${clip})"><path d="M-10 20.8 C-6.4 18.4 6.4 18.4 10 20.8 L10 30 L-10 30Z" fill="${C.tongue}"/>` +
    `<ellipse cx="-3" cy="22.4" rx="2.2" ry="1.1" fill="${C.tongueShine}" opacity="0.55"/></g>${rim}${lines}${philtrum.svg}`;
  return piece(inFace(svg), faceBox([-15, 10, 30, 21]), { shapes: [], lines: [{ kind: "inner", width: 0.7, where: "mouth" }, { kind: "outer", width: 1.2, where: "mouth corners" }, philtrum.line] });
}

/** A blush in the face frame, under the eye's outer side: an ellipse turned with the face. */
function blush(sx: number): Piece {
  const [cx, cy] = face([sx * 30, 13]);
  const [dx, dy] = [7 * cosR, 7 * sinR], deg = r3((ROLL * 180) / Math.PI);
  const d = `M${r3(cx - dx)} ${r3(cy - dy)} a7 4.4 ${deg} 1 0 ${r3(2 * dx)} ${r3(2 * dy)} a7 4.4 ${deg} 1 0 ${r3(-2 * dx)} ${r3(-2 * dy)}Z`;
  return soft(d, [cx - 7.5, cy - 5, 15, 10], C.blush, 2.4, Math.round(model.blush.restingLevel * 1.45 * 100) / 100);
}

/** The tag and the ring it swings from, which the turnaround paints blue on the blue collar. */
function tagPiece(): Piece {
  const ring = piece(`<rect x="-1.4" y="-57.2" width="2.8" height="7.2" rx="1.4" fill="${C.collar}" stroke="${C.collarLine}" stroke-width="0.6"/>` +
    `<rect x="-0.7" y="-56.6" width="0.8" height="5.6" rx="0.4" fill="${C.collarHighlight}"/>`, [-2.5, -58, 5, 9], { shapes: [], lines: [{ kind: "inner", width: 0.6, where: "tag ring" }] });
  const emboss = sample(innerHeart.segs, 10);
  return join(ring, part("tag", heart, {
    fill: C.tag,
    shade: { multiply: C.shadeBy, rim: { inset: 1.3, toLight: 2.2 }, blur: 1.5 },
    highlight: { d: "M-6.6 -47.4 a1.9 1.2 -40 1 0 3.8 0 a1.9 1.2 -40 1 0 -3.8 0", colour: C.tagShine, opacity: 0.8, blur: 0.6 },
    inner: [{ pts: [...emboss, emboss[0]!], width: 0.7, colour: C.tagLine, opacity: 0.7 }],
    outline: { colour: C.tagLine, width: THIN, taper: 2, blur: 0.2 },
  }));
}

/** The deeper tan along an ear's outer edge and fringe (k = 1 for the right ear, −1 for the left). */
function earEdge(k: number): string {
  const f = uid("blur"), box: Box = k > 0 ? [-90, -140, 52, 84] : [38, -144, 52, 84];
  const d = "M-54 -134 C-58 -126 -66 -114 -71 -104 C-75 -96 -76.4 -86 -75.6 -79 C-74.8 -72 -68 -68 -60 -66 C-55 -65 -50 -65.4 -46 -66 L-46 -54 L-92 -54 L-92 -134Z";
  return `<defs>${blur(f, box, 3)}</defs><path d="${k > 0 ? d : mirrorD(d)}" fill="${C.junction}" opacity="0.8" filter="url(#${f})"/>`;
}

/** The warm shadow between the front legs, painted into the chest under its shade. */
function legGap(): string {
  const f = uid("blur"), box: Box = [-9, -36, 18, 36];
  return `<defs>${blur(f, box, 1)}</defs><path d="M-3.2 -26 C-2.2 -18 -1.6 -10 -1.4 -3.4 L1.4 -3.4 C1.6 -10 2.2 -18 3.2 -26 C1.2 -28 -1.2 -28 -3.2 -26Z" ` +
    `fill="${C.marking}" opacity="0.7" filter="url(#${f})"/>`;
}

export function front(): Drawn[] {
  const out: Drawn[] = [];
  const add = (name: string, p: Piece, state?: string) => out.push({ part: name, piece: p, ...(state ? { state } : {}) });
  add("shadow", soft("M-64 -3 a64 4.6 0 1 0 128 0 a64 4.6 0 1 0 -128 0Z", [-64, -7.6, 128, 9.2], C.shadow, 2.5));
  add("body.back", part("body.back", back, backPaint));
  add("back.patch.R", marking("back.patch.R", { shape: back, paint: backPaint }, saddleR, { fill: C.marking, blur: 1.2, clip: true }));
  add("back.patch.L", marking("back.patch.L", { shape: back, paint: backPaint }, saddleL, { fill: C.marking, blur: 1.2, clip: true }));
  for (const side of ["R", "L"] as const) {
    const sx = side === "R" ? -1 : 1, cx = sx * 38.8, cy = -11.4;
    add(`hind.${side}`, part(`hind.${side}`, hind[side], {
      fill: C.fur,
      shade: furShade(hipGroup, [], [`M${cx - 12} ${cy - 12} L${cx + 12} ${cy - 12} L${cx + 12} ${cy - 3} L${cx - 12} ${cy - 3}Z`]),
      // Round the outside, over the top and down the inner side to the front paw.
      // A lighter line over the top, where the paw lies on the haunch; the dark line round the outside and the sole.
      outline: { ...OUTLINE, width: 1.4, taper: 4, spans: bySide(side, [{ from: [-48.4, -15.2], to: [-30.4, -12.6], width: THIN, colour: C.furLine }, { from: [-29.8, -10.8], to: [-48.6, -13] }]) },
      inner: [[[-41.2, -11], [-41.5, -7.4], [-41.8, -3.8]], [[-35.2, -11.2], [-35.2, -7.6], [-35.2, -3.6]]].map((pts) => ({ pts: flipX(pts as P[], side), width: 0.8, colour: C.outline, opacity: 0.75 })),
    }));
  }
  add("body.front", part("body.front", chest, {
    fill: C.fur,
    // The gap between the front legs is in shade, and deepest where they press together (a contact shadow).
    shade: furShade(bodyGroup, ["M-5.4 -34 C-3 -30 -2 -12 -1.2 -3 L1.2 -3 C2 -12 3 -30 5.4 -34Z"]),
    under: legGap(),
    outline: { ...OUTLINE, spans: [
      { from: [-29, -61], to: [-34.6, -48.6] }, { from: [-34.8, -47.6], to: [-34.8, -38], width: THIN, colour: C.furLine },
      { from: [34.8, -38], to: [34.8, -47.6], width: THIN, colour: C.furLine }, { from: [34.6, -48.6], to: [29, -61] },
    ] },
  }));
  // The chin's shadow on the chest, cast by the head (spec L396).
  add("shadow.chin", soft("M-26 -59 C-12 -53 12 -53 26 -59 L26 -66 L-26 -66Z", [-26, -66, 52, 10], C.furShade, 2.4));
  add("collar", part("collar", collar, {
    fill: C.collar,
    shade: { multiply: C.shadeBy, shapes: ["M-32 -57 C-12 -51 12 -51 32 -59 L32 -46 L-32 -46Z"], blur: 1.5 },
    highlight: { d: "M-24 -59.8 C-10 -56.4 10 -56.4 25 -60.8 L25 -59.4 C10 -55.2 -10 -55.2 -24 -58.6Z", colour: C.collarHighlight, opacity: 0.8, blur: 0.6 },
    outline: { colour: C.collarLine, width: THIN, spans: [{ from: [28.2, -61.6], to: [-26.9, -60.4] }], taper: 4, blur: 0.25 },
  }));
  add("tag", tagPiece());
  for (const side of ["R", "L"] as const) {
    const k = side === "R" ? 1 : -1;
    const shape = ears[side];
    const shadeD = "M-92 -88 C-74 -84 -56 -79 -38 -74 L-38 -50 L-92 -50Z M-56 -138 C-62 -124 -72 -110 -76 -96 C-78 -88 -77 -80 -74 -74 L-92 -74 L-92 -138Z";
    const inner = [[[-74.4, -86], [-74, -78], [-71.4, -71.6]], [[-65.4, -84], [-64.8, -74], [-62.4, -66.6]], [[-56.6, -80], [-56, -71.4], [-54, -65.8]]];
    add(`ear.${side}`, part(`ear.${side}`, shape, {
      fill: C.marking,
      under: earEdge(k),
      // The tan's own warm shade, deepest toward the bottom and the outer edge, as the sheet paints its ears.
      shade: { multiply: C.furShadeBy, rim: { inset: 2.4, toLight: 4 }, shapes: [k > 0 ? shadeD : mirrorD(shadeD)], blur: 3.2 },
      // The upper ear is lighter where it leaves the head.
      // Lighter on its inner side and where it leaves the head.
      highlight: { d: k > 0 ? "M-58 -126 C-53 -132 -46 -137 -40 -134 L-38 -90 L-47.6 -90 C-48.4 -100 -49 -112 -51 -118 C-54 -120 -57 -122 -58 -126Z" : "M58 -126 C53 -132 46 -139 40 -137 L38 -90 L47.6 -90 C48.4 -100 49 -112 51 -118 C54 -120 57 -122 58 -126Z", colour: C.patch, opacity: 0.8, blur: 2.4 },
      inner: inner.map((pts) => ({ pts: pts.map(([x, y]) => [k * x!, y!] as P), width: INNER, colour: C.outline, opacity: 0.32 })),
      // From where the ear comes out from behind the head, round to where its inner edge goes back under the cheek.
      outline: { ...OUTLINE, width: 1.3, spans: side === "R" ? [{ from: [-41.4, -136.8], to: [-40.2, -68.8] }] : [{ from: [40.6, -139.6], to: [40.2, -70.4] }], taper: 10 },
    }));
  }
  add("head.base", part("head.base", head, headPaint));
  for (const side of ["L", "R"] as const) {
    add(`head.patch.${side}`, join(
      marking(`head.patch.${side}`, { shape: head, paint: headPaint }, patches[side], { fill: C.patch, blur: 1.5, clip: false }),
      marking(`head.patch.${side}`, { shape: head, paint: headPaint }, earTips[side], { fill: C.marking, blur: 1.4, clip: false }),
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
    highlight: { d: headLight, colour: C.light, opacity: 0.75, blur: 4 },
    // The curls where each lobe ends, and a stroke where the left lobe leaves the crown.
    inner: [
      { pts: [[-13.4, -155.4], [-11.6, -153.6], [-11.2, -151.2]], width: 0.9, colour: C.furLine, opacity: 0.7 },
      { pts: [[5.2, -160.4], [5, -157.4], [3, -154.6]], width: 0.9, colour: C.furLine, opacity: 0.7 },
      { pts: [[22.8, -155.2], [21.2, -152.2], [17.6, -150.6]], width: 0.9, colour: C.furLine, opacity: 0.7 },
      { pts: [[-30.2, -150.6], [-26.4, -149.2], [-22.2, -148.4]], width: 0.9, colour: C.furLine, opacity: 0.6 },
    ],
    outline: { ...OUTLINE, colour: C.fluffLine, width: THIN, spans: [{ from: [-30.6, -150.4], to: [22.6, -153] }], taper: 4 },
    feather: { from: [0, -146.5], to: [0, -150.5] },
  }));
  for (const side of ["R", "L"] as const) {
    const sx = side === "R" ? -1 : 1;
    add(`front.${side}`, part(`front.${side}`, legs[side], {
      fill: C.fur,
      shade: furShade(bodyGroup, [], ["M-40 -60 L40 -60 L40 -34 L-40 -34Z"]),
      inner: [
        // The toes, and the soft line down the leg's inner side where it presses on the other leg.
        ...[[[-20, -10.6], [-20.3, -5.6], [-20.6, -1.2]], [[-9.8, -10.8], [-10.1, -5.8], [-10.4, -1]]].map((pts) => ({ pts: flipX(pts as P[], side), width: 0.85, colour: C.outline, opacity: 0.8 })),
        { pts: flipX([[-4.6, -29], [-3.4, -19], [-2.2, -9], [-1.8, -5]], side), width: 0.8, colour: C.outline, opacity: 0.6 },
      ],
      // Up the inner side from the toes, round the paw and up the outer side, where the line lightens toward the chest.
      outline: { ...OUTLINE, width: 1.4, spans: bySide(side, [{ from: [-1.7, -9], to: [-30.2, -13] }, { from: [-30.4, -14], to: [-34.2, -35], width: THIN, colour: C.furLine }]), taper: 5 },
      feather: { from: [sx * 15, -44], to: [sx * 15, -36] },
    }));
  }
  return out;
}

/** Points the sheet has no finder for, where this drawing puts them (dev output for the sheet match). */
export const landmarks: Record<string, P> = {
  "paw.front.L": [15.4, -5.4],
  "paw.front.R": [-15.4, -5.4],
  "paw.hind.L": [38.6, -10.9],
  "paw.hind.R": [-38.6, -10.9],
  // The ring's top as it shows below the chin; it swings from its hidden top, the tag's pivot at (0.4, −57.5).
  "tag.ring": [0.4, -55.6],
  // The seat: the body's lowest point on the midline is at −1.6, showing between the front paws; taken 0.8 pt inside.
  seat: [0, -2.4],
};
