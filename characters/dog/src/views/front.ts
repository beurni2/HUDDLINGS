// The dog's front view: shapes first, every node typed by hand in model space
// (points, the ground under the seat at 0, 0, y down) at the extremes and
// inflections read off the front turnaround, then paint. Light groups share one
// light across joined parts (head and tuft, chest and front legs, haunches and
// hind paws); joins are feathered and carry no rim and no line.
import { furEdge, furSpan } from "../../../draw/fur.ts";
import { bbox, fracAt, mirrorX, smooth, symmetric, type Node, type P, type Shape } from "../../../draw/geom.ts";
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
const OUTLINE: Outline = { colour: C.outline, width: OUTER, taper: 6, blur: 0.3 };

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
const back = symmetric([[0, -52], [-20, -52.6], [-31, -55], [-35, -49.8], [-38.4, -43], [-42.6, -37.8], [-46.4, -32.8], [-48.8, -27], [-49.6, -21],
  [-49.2, -15.4], [-47.6, -10.6], [-44.4, -6.8], [-36, -4.8], [-20, -2.4]], [0, -1.6]);

// The hind paws: round stubs in front of the haunch's foot, a little higher than the front paws.
const hindR: Node[] = [[-48.6, -14], [-46.6, -17.2], [-42.6, -19.1], [-37.6, -19.4], [-33.2, -18], [-30.6, -14.2], [-29.4, -10], [-30, -6.8],
  [-31.8, -4.6], [-35, -3.7], [-42.6, -4], [-46.4, -6], [-48.4, -9.6]];
const hind = { R: smooth(hindR), L: other(hindR) };

// The chest: its edge is the silhouette from under the cheek to the top of the
// haunch, then the soft line where the chest meets the haunch, melting into the leg.
let chest = symmetric([[0, -66], [-16, -65.4], [-25.6, -63.2], [-30, -59.6], [-32.6, -55.4], [-34.4, -50.6], [-35.2, -45.4], [-35, -40],
  [-34.2, -34], [-33, -26], [-31, -17], [-28, -9], [-20, -5.6], [-8, -5]], [0, -5]);
// Fluff at the shoulders, just under the cheeks, as the sheet draws it.
chest = furEdge(chest, [-31.6, -57.4], [-34.2, -50.4], [{ len: 0.9, lean: 0.5 }, { len: 1.2, w: 1.2, lean: 0.4 }], 0.35);
chest = furEdge(chest, [34.2, -50.4], [31.6, -57.4], [{ len: 1.2, w: 1.2, lean: -0.4 }, { len: 0.9, lean: -0.5 }], 0.35);

// The front legs: short chubby columns from the chest to round stub paws, the
// two paws nearly touching at the middle.
const legR: Node[] = [[-6.4, -42], [-4.8, -31], [-3.2, -21], [-2.2, -13], [-1.4, -8.6], [-2.2, -4.8], [-5, -2.1], [-9, -1],
  [-15.4, -0.7], [-21.6, -1.2], [-26.2, -2.6], [-28.6, -5], [-29.9, -9.6], [-30.6, -15.4], [-31.8, -21.4], [-33.2, -28], [-34.4, -35], [-35, -43]];
const legs = { R: smooth(legR), L: other(legR) };

// The collar: a band round the neck, its ends running up under the cheek fur.
// The sheet's head roll tips it a little: its left end sits higher.
const collar = smooth([[-28.6, -63.4], [-21, -60.4], [-10, -58.2], [0, -57.6], [10, -58.6], [20.5, -61], [29.6, -64.6],
  [29.4, -62.2], [26.4, -59.4], [22.6, -55.8], [12, -52], [0, -51], [-12, -52], [-21.4, -55.2], [-25.6, -58.4], [-28, -61.4]]);

const heart = smooth([[0, -46.8], [-3.6, -50.6], [-7.2, -49.6], [-8.2, -45], [-6, -40.2], [0, -35.2], [6, -40.2], [8.2, -45], [7.2, -49.6], [3.6, -50.6]], { corners: [0, 5] });

// The ears: tan droplets hanging from high on the head's sides, narrow at the
// root, widest low down, their tops hidden under the crown. The sheet draws the
// left one a little narrower and higher (the head's roll), so each is typed.
const earR = smooth([[-35.6, -136.6], [-44, -133.8], [-53.4, -130.6], [-59.8, -123.8], [-66.6, -115], [-74.2, -105.2], [-78.8, -97.2], [-81.2, -88],
  [-81, -79.4], [-78.4, -73], [-74, -68.2], [-66.6, -63.6], [-59, -60.9], [-53.6, -60.3], [-47.6, -61.2], [-43.2, -63.8], [-40.4, -68], [-38.6, -76],
  [-37.6, -94], [-36.6, -112], [-34.4, -130]]);
const earL = smooth([[33.4, -143.2], [40.6, -138.8], [46.4, -135.2], [52.2, -129.8], [57.2, -124.4], [62.8, -117.6], [68.6, -110.8], [73.4, -104.8],
  [76.4, -98.8], [77.9, -92], [77.8, -85.4], [76.4, -79.4], [73.8, -73.8], [70, -69.4], [64.4, -65.8], [58.4, -64], [52.6, -63.2], [47, -63.6],
  [42.4, -65.8], [39, -71.4], [36.8, -90], [35.6, -112], [33.6, -132]]);
const ears = {
  R: furEdge(earR, [-81.1, -83], [-63, -62], [{ len: 0.9, w: 0.7, lean: 0.4 }, { len: 1.3, lean: 0.5 }, { len: 0.9, w: 0.8, lean: 0.5 }, { len: 1.1, lean: 0.4 }], 0.35),
  L: furEdge(earL, [77.8, -82], [62, -64.8], [{ len: 0.9, w: 0.7, lean: 0.4 }, { len: 1.3, lean: 0.5 }, { len: 0.9, w: 0.8, lean: 0.5 }, { len: 1.1, lean: 0.4 }], 0.35),
};

// The head: a soft round mass, widest at the cheeks, narrowing to the crown.
// Its sides run along the ears' inner edges (DECISIONS 7); high up, where the
// sheet shows each ear's tan tip reaching into the head, they draw in.
let head = symmetric([[0, -151.8], [-12, -151.2], [-22, -149.6], [-29.5, -147], [-35.2, -143.4], [-38.6, -139], [-39.6, -133.6], [-40, -127.6],
  [-41, -121.4], [-43.4, -116.6], [-45.2, -110.6], [-45.9, -103], [-45.6, -95], [-46.6, -88.6], [-47.6, -82], [-46.6, -75.4], [-43, -70.6], [-38.2, -66.6], [-31, -63],
  [-21, -60], [-10.5, -58.1]], [0, -57.5]);
// Fur strokes: for each lock a short tapered stroke from inside the edge out toward its tip, as the sheet's fur lines run.
const furStrokes: P[][] = [];
const strokeTo = (tip: P, root: P) => {
  const d: P = [tip[0] - root[0], tip[1] - root[1]], l = Math.hypot(d[0], d[1]) || 1, u: P = [d[0] / l, d[1] / l];
  furStrokes.push([[root[0] - u[0] * 3.4, root[1] - u[1] * 3.4], [root[0] + u[0] * 0.4, root[1] + u[1] * 0.4], [tip[0] - u[0] * 1.2, tip[1] - u[1] * 1.2]]);
};
// Cheek fluff, as the hero and the front turnaround draw it: locks combed down and out over the ears' inner edges and the collar.
const cheekLocks = [{ len: 1.2, w: 1.4, lean: 0.4 }, { len: 2.4, w: 1.2, lean: 0.55 }, { len: 2.2, lean: 0.65 }, { len: 1.4, w: 0.8, lean: 0.75 }];
head = furEdge(head, [-46.6, -86], [-36, -65.4], cheekLocks, 0.3, strokeTo);
head = furEdge(head, [36, -65.4], [46.6, -86], [...cheekLocks].reverse().map((l) => ({ ...l, lean: -l.lean })), 0.3, strokeTo);

// The topknot: three fur lobes, the middle one tallest, each ending in a curl,
// typed node by node (the sheet's tuft).
const tuft = furSpan(smooth([[-31, -149.2], [-29.6, -152.6], [-26.6, -154.9], [-22, -156], [-17.4, -156.4], [-13.4, -155.6], [-11.2, -153.8],
  [-9.6, -158], [-6.8, -161.4], [-3.4, -163.6], [0.4, -164.2], [3.4, -163.2], [5, -160.8], [5.2, -158], [8.6, -158.8], [12.4, -159.4], [16.4, -159.1],
  [20.2, -157.8], [22.8, -155.4], [22.4, -152.2], [14, -146.6], [0, -145.4], [-18, -146.2]], { corners: [6, 13] }), [-30.6, -150.4], [22.6, -153]);

// The head patches: pale tan rings round each eye, thick above it, thin below
// it and fading out on the nose side, open toward the ear (a little bay of
// cream above the eye's outer corner), and a band beside the ear that runs up
// to its root, where the sheet draws the ear's tip melting into the head.
// Typed for the dog's right eye with about 4 pt of bleed past the head's edge;
// the left is its mirror across the face's own centre line.
const patchR: Node[] = [[-42.4, -135], [-39.8, -133.4], [-37, -133], [-35.4, -131], [-36.2, -127], [-37.8, -122.6], [-39, -117.6],
  [-37.6, -113.6], [-35, -115.4], [-31, -117.4], [-25.4, -118.2], [-20, -116.4], [-16.2, -111.8], [-14.6, -105.6], [-14.8, -99.6], [-16.4, -93.8], [-20, -90],
  [-25, -88.4], [-31, -88.8], [-36.6, -89], [-41.6, -88], [-48.4, -86.4], [-50, -104], [-46.6, -122]];
/** A point mirrored across the face's centre line, the eyes' perpendicular bisector. */
const faceMirror = ([x, y]: P): P => {
  const along = (x - FC[0]) * cosR + (y - FC[1]) * sinR;
  return [x - 2 * along * cosR, y - 2 * along * sinR];
};
const patches = { R: smooth(patchR), L: smooth(mirrorX(patchR).map(([x, y]) => faceMirror([-x, y]))) };
// The saddle's two halves where they show from the front: the right half down
// the right haunch's outer side, the left half's tip at the top of the left haunch.
const saddleR = smooth([[-34.6, -50], [-35.2, -42], [-35.6, -35.4], [-37.4, -29.4], [-39.6, -24.6], [-41.6, -20.6], [-44.6, -18], [-52, -16], [-53, -40], [-41, -54]]);
const saddleL = smooth([[35.4, -48], [36.8, -42.6], [38.6, -37.6], [41, -34], [44.6, -32.2], [50, -38], [45, -50]]);

// Paint.

const headLight = "M-30 -146 C-18 -154 2 -154 10 -147 C6 -136 -18 -134 -28 -138Z";
const furShade = (group: Shape[], shapes: string[] = [], keep: string[] = [], rim = { inset: 2.5, toLight: 4 }) =>
  ({ multiply: C.furShadeBy, rim, shapes, keep, group, blur: 2.4 });
const bodyGroup = [chest, legs.R, legs.L];
const hipGroup = [back, hind.R, hind.L];
const headGroup = [head, tuft];
const mirrorD = (d: string) => d.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (_m, x: string, y: string) => `${-Number(x)} ${y}`);

const backPaint: Paint = {
  fill: C.fur,
  shade: furShade(hipGroup),
  outline: { ...OUTLINE, spans: [{ from: [-34.6, -51], to: [-47.4, -11] }, { from: [47.4, -11], to: [34.6, -51] }] },
};
const headPaint: Paint = {
  fill: C.fur,
  shade: furShade(headGroup, ["M-40 -76 C-30 -67 -16 -63 0 -63 C16 -63 30 -67 40 -76 L46 -58 L-46 -58Z"], [], { inset: 3, toLight: 4.5 }),
  highlight: { d: headLight, colour: C.light, opacity: 0.75, blur: 4 },
  inner: furStrokes.map((pts) => ({ pts, width: 0.65, colour: C.furLine, opacity: 0.45 })),
};
// The head's line runs all round it: a light line on the crown's fur; where the
// head meets an ear, a seam in the patches' tan where the ear's tip melts into
// the head and the ear's own tan below it (DECISIONS 7); a light line on the
// cheeks' fluff, and the jaw's line over the collar.
const headLine: Outline = { ...OUTLINE, taper: 5, spans: [
  { from: [-24, -149.2], to: [-38.4, -138], width: THIN, colour: C.furLine },
  { from: [-39.4, -135.6], to: [-40.6, -123], width: THIN, colour: C.patch },
  { from: [-41.4, -120.4], to: [-45.8, -96], width: THIN, colour: C.junction },
  { from: [-46.2, -92], to: [-35, -64.6], width: THIN, colour: C.furLine },
  { from: [-30, -62.6], to: [30, -62.6], width: THIN, colour: C.furLine },
  { from: [35, -64.6], to: [46.2, -92], width: THIN, colour: C.furLine },
  { from: [45.8, -96], to: [41.4, -120.4], width: THIN, colour: C.junction },
  { from: [40.6, -123], to: [39.4, -135.6], width: THIN, colour: C.patch },
  { from: [38.4, -138], to: [24, -149.2], width: THIN, colour: C.furLine },
] };

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

/** An open eye at (cx, cy) in model space, its landmark; `noseward` is +1 when the nose is to its right. The eye is round, so only its lid and iris turn with the face. */
function eye([cx, cy]: P, noseward: number): Piece {
  const rx = 9.6, ry = 9.6;
  const at = (dx: number, dy: number): P => [cx + dx * cosR - dy * sinR, cy + dx * sinR + dy * cosR];
  const [ix, iy] = at(noseward * 1.3, -0.2);
  const [gx, gy] = at(noseward * 1.3, 2.8), [fx, fy] = at(noseward * 1.3, 8.6);
  const [sx, sy] = at(noseward * 3.4, -4.2), [dx, dy] = at(-noseward * 3.3, 5);
  const clip = uid("eye"), iris = uid("iris"), shine = uid("blur");
  const box: Box = [cx - 12, cy - 12, 24, 24];
  const lid: P[] = Array.from({ length: 41 }, (_, k) => {
    const a = Math.PI * (1.05 + 1.35 * (k / 40));
    return at(Math.cos(a) * rx * -noseward, Math.sin(a) * ry);
  });
  const n = (v: number) => r3(v);
  const svg = `<defs><clipPath id="${clip}"><ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${rx}" ry="${ry}"/></clipPath>` +
    // The iris: near-black above, the lighter printed brown below (DECISIONS 18).
    `<radialGradient id="${iris}" gradientUnits="userSpaceOnUse" cx="${n(gx)}" cy="${n(gy)}" r="11" fx="${n(fx)}" fy="${n(fy)}">` +
    `<stop offset="0.3" stop-color="${C.dark}"/><stop offset="0.72" stop-color="${C.eyeDark}"/></radialGradient>` +
    `${blur(shine, box, 0.22)}</defs>` +
    `<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${rx}" ry="${ry}" fill="${C.eyeWhite}"/>` +
    `<g clip-path="url(#${clip})"><ellipse cx="${n(ix)}" cy="${n(iy)}" rx="${rx - 0.6}" ry="${ry - 0.2}" fill="url(#${iris})"/></g>` +
    `<path d="${taperedStroke(lid, 1.4, { taper: 8, tip: 0.3 })}" fill="${C.eyeDark}"/>` +
    `<ellipse cx="${n(sx)}" cy="${n(sy)}" rx="2.2" ry="2.1" fill="${C.light}" filter="url(#${shine})"/>` +
    `<circle cx="${n(dx)}" cy="${n(dy)}" r="0.9" fill="${C.light}" opacity="0.7"/>`;
  return piece(svg, box, { shapes: [], lines: [{ kind: "outer", width: 1.4, where: "eye lid" }] });
}

/** A brow in the face frame: a short soft arch in tan, thickest in the middle, its inner end higher. */
function brow(sx: number): Piece {
  const pts: P[] = [[sx * 27.2, -24.6], [sx * 25.4, -27.4], [sx * 22.4, -29], [sx * 19, -28.2]];
  const f = uid("blur"), box = faceBox([sx > 0 ? 15 : -31, -33, 16, 12]);
  return piece(`<defs>${blur(f, box, 0.35)}</defs><g filter="url(#${f})">` +
    inFace(`<path d="${taperedStroke(pts, 2.6, { taper: 3, tip: 1.1 })}" fill="${C.marking}"/>`) + "</g>", box);
}

/** The nose in the face frame: a rounded triangle, wide on top. */
function nose(): Piece {
  return piece(inFace(`<path d="M-6.8 6.6 C-7 4.2 -3.4 3.6 0 3.6 C3.4 3.6 7 4.2 6.8 6.6 C6.5 9.2 2.8 12.1 0 12.3 C-2.8 12.1 -6.5 9.2 -6.8 6.6Z" fill="${C.eyeDark}"/>` +
    `<ellipse cx="-2" cy="5.6" rx="2.2" ry="0.9" fill="${C.light}" opacity="0.25"/>`), faceBox([-8, 2, 16, 12]));
}

/** The open happy mouth in the face frame: a small opening under a short line from the nose, its corners curling up, the tongue filling most of it. */
function mouth(): Piece {
  const m = "M0 14.4 C2.8 16.4 6.4 18.2 9.6 18.4 C9.8 23.4 5.6 28.6 0 28.8 C-5.6 28.6 -9.8 23.4 -9.6 18.4 C-6.4 18.2 -2.8 16.4 0 14.4Z";
  const clip = uid("mouth");
  const corner = (sx: number): P[] => [[sx * 9.2, 18.4], [sx * 11.2, 17.8], [sx * 12.5, 16.4], [sx * 12.9, 15]];
  const lines = [corner(-1), corner(1)].map((pts) => `<path d="${taperedStroke(pts, 1.2, { taper: 2, tip: 0.35 })}" fill="${C.dark}"/>`).join("");
  const philtrum = innerLine([[0, 11.8], [0, 14.6]], 0.9, C.dark, { taper: 1, tip: 0.6, wobble: 0 });
  const rim = `<path d="${m}" fill="none" stroke="${C.dark}" stroke-width="0.8"/>`;
  const svg = `<defs><clipPath id="${clip}"><path d="${m}"/></clipPath></defs>` +
    `<path d="${m}" fill="${C.mouthInside}"/><g clip-path="url(#${clip})"><path d="M-10 20.8 C-6.4 18.4 6.4 18.4 10 20.8 L10 30 L-10 30Z" fill="${C.tongue}"/>` +
    `<path d="M0 20.6 L0 24.6" stroke="${C.tongueLine}" stroke-width="0.7" stroke-linecap="round"/>` +
    `<ellipse cx="-3" cy="22.4" rx="2.2" ry="1.1" fill="${C.tongueShine}" opacity="0.55"/></g>${rim}${lines}${philtrum.svg}`;
  return piece(inFace(svg), faceBox([-15, 10, 30, 21]), { shapes: [], lines: [{ kind: "inner", width: 0.8, where: "mouth" }, { kind: "outer", width: 1.2, where: "mouth corners" }, philtrum.line] });
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
  const ring = piece(`<rect x="-1.7" y="-58.2" width="3.4" height="8.4" rx="1.7" fill="${C.collar}" stroke="${C.collarLine}" stroke-width="0.6"/>` +
    `<rect x="-0.9" y="-57.5" width="0.9" height="6.6" rx="0.45" fill="${C.collarHighlight}"/>`, [-2.5, -59, 5, 10], { shapes: [], lines: [{ kind: "inner", width: 0.6, where: "tag ring" }] });
  return join(ring, part("tag", heart, {
    fill: C.tag,
    shade: { multiply: C.shadeBy, rim: { inset: 1.3, toLight: 2.2 }, blur: 1.5 },
    highlight: { d: "M-6.4 -46.2 a2.4 1.5 -40 1 0 4.8 0 a2.4 1.5 -40 1 0 -4.8 0", colour: C.tagShine, opacity: 0.85, blur: 0.7 },
    inner: [{ pts: [[0, -43], [-2.4, -45.2], [-4, -43.4], [-2.8, -40.8], [0, -38.8], [2.8, -40.8], [4, -43.4], [2.4, -45.2], [0, -43]], width: 0.65, colour: C.tagLine, opacity: 0.85 }],
    outline: { colour: C.tagLine, width: THIN, taper: 2, blur: 0.2 },
  }));
}

/** The warm shadow between the front legs, painted into the chest under its shade. */
function legGap(): string {
  const f = uid("blur"), box: Box = [-9, -36, 18, 36];
  return `<defs>${blur(f, box, 1.3)}</defs><path d="M-3.6 -28 C-2.4 -20 -1.8 -10 -1.6 -3.4 L1.6 -3.4 C1.8 -10 2.4 -20 3.6 -28 C1.4 -30 -1.4 -30 -3.6 -28Z" ` +
    `fill="${C.marking}" opacity="0.6" filter="url(#${f})"/>`;
}

export function front(): Drawn[] {
  const out: Drawn[] = [];
  const add = (name: string, p: Piece, state?: string) => out.push({ part: name, piece: p, ...(state ? { state } : {}) });
  add("shadow", soft("M-62 -1.5 a62 4.5 0 1 0 124 0 a62 4.5 0 1 0 -124 0Z", [-62, -6, 124, 9], C.shadow, 2.5));
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
      outline: { ...OUTLINE, taper: 4, spans: bySide(side, [{ from: [-48.4, -15.2], to: [-30.4, -12.6], width: THIN, colour: C.furLine }, { from: [-29.8, -10.8], to: [-48.6, -13] }]) },
      inner: [[[-41.6, -8.2], [-41.8, -4.4]], [[-35.4, -8.6], [-35.2, -4]]].map((pts) => ({ pts: flipX(pts as P[], side), width: INNER, colour: C.outline, opacity: 0.55 })),
    }));
  }
  add("body.front", part("body.front", chest, {
    fill: C.fur,
    // The gap between the front legs is in shade, and deepest where they press together (a contact shadow).
    shade: furShade(bodyGroup, ["M-5.4 -34 C-3 -30 -2 -12 -1.2 -3 L1.2 -3 C2 -12 3 -30 5.4 -34Z"]),
    under: legGap(),
    outline: { ...OUTLINE, spans: [{ from: [-29, -61], to: [-35.2, -42] }, { from: [35.2, -42], to: [29, -61] }] },
  }));
  // The chin's shadow on the chest, cast by the head (spec L396).
  add("shadow.chin", soft("M-26 -59 C-12 -53 12 -53 26 -59 L26 -66 L-26 -66Z", [-26, -66, 52, 10], C.furShade, 2.4));
  add("collar", part("collar", collar, {
    fill: C.collar,
    shade: { multiply: C.shadeBy, shapes: ["M-32 -55 C-12 -49 12 -49 32 -57 L32 -48 L-32 -48Z"], blur: 1.5 },
    highlight: { d: "M-24 -60.6 C-10 -57.2 10 -57.2 25 -61.6 L25 -59.6 C10 -55.4 -10 -55.4 -24 -58.8Z", colour: C.collarHighlight, opacity: 0.9, blur: 0.7 },
    outline: { colour: C.collarLine, width: THIN, spans: [{ from: [29.4, -62.2], to: [-28, -61.4] }], taper: 4, blur: 0.25 },
  }));
  add("tag", tagPiece());
  for (const side of ["R", "L"] as const) {
    const k = side === "R" ? 1 : -1;
    const shape = ears[side];
    const shadeD = "M-92 -88 C-74 -84 -56 -79 -38 -74 L-38 -50 L-92 -50Z M-56 -138 C-62 -124 -72 -110 -76 -96 C-78 -88 -77 -80 -74 -74 L-92 -74 L-92 -138Z";
    const inner = [[[-73.8, -84], [-73.6, -77], [-71.4, -71.4]], [[-64.6, -82], [-64.4, -73], [-62.2, -66.4]], [[-55.4, -80], [-55.2, -72], [-53.6, -65.4]]];
    add(`ear.${side}`, part(`ear.${side}`, shape, {
      fill: C.marking,
      // The tan's own warm shade, deepest toward the bottom and the outer edge, as the sheet paints its ears.
      shade: { multiply: C.furShadeBy, rim: { inset: 2.4, toLight: 4 }, shapes: [k > 0 ? shadeD : mirrorD(shadeD)], blur: 3.2 },
      // The upper ear is lighter where it leaves the head.
      highlight: { d: k > 0 ? "M-62 -118 C-56 -128 -47 -136 -41 -132 C-40 -120 -46 -104 -54 -100 C-60 -102 -63 -110 -62 -118Z" : "M41 -136 C48 -134 56 -126 60 -116 C58 -106 52 -102 46 -104 C41 -110 40 -126 41 -136Z", colour: C.patch, opacity: 0.8, blur: 3.6 },
      inner: inner.map((pts) => ({ pts: pts.map(([x, y]) => [k * x!, y!] as P), width: INNER, colour: C.outline, opacity: 0.32 })),
      // From where the ear comes out from behind the head, round to where its inner edge goes back under the cheek.
      outline: { ...OUTLINE, width: 1.4, spans: side === "R" ? [{ from: [-41.4, -136.8], to: [-40.2, -68.8] }] : [{ from: [40.6, -139.6], to: [40.2, -70.4] }], taper: 9 },
    }));
  }
  add("head.base", part("head.base", head, headPaint));
  for (const side of ["L", "R"] as const) {
    add(`head.patch.${side}`, marking(`head.patch.${side}`, { shape: head, paint: headPaint }, patches[side], { fill: C.patch, blur: 1.5, clip: false }));
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
      { pts: [[-13.4, -155.4], [-11.6, -153.6], [-11, -151.4]], width: 0.7, colour: C.furLine, opacity: 0.7 },
      { pts: [[5, -160.4], [5, -157.6], [3.4, -155.2]], width: 0.7, colour: C.furLine, opacity: 0.7 },
      { pts: [[22.8, -155.2], [21.4, -152.4], [18.6, -151]], width: 0.7, colour: C.furLine, opacity: 0.7 },
      { pts: [[-29.8, -150.6], [-26, -149.4], [-22.4, -148.4]], width: 0.7, colour: C.furLine, opacity: 0.6 },
    ],
    outline: { ...OUTLINE, colour: C.furLine, width: THIN, spans: [{ from: [-30.6, -150.4], to: [22.6, -153] }], taper: 4 },
    feather: { from: [0, -146.5], to: [0, -150.5] },
  }));
  for (const side of ["R", "L"] as const) {
    const sx = side === "R" ? -1 : 1;
    add(`front.${side}`, part(`front.${side}`, legs[side], {
      fill: C.fur,
      shade: furShade(bodyGroup, [], ["M-40 -60 L40 -60 L40 -34 L-40 -34Z"]),
      inner: [
        // The toes, and the soft lines down the leg's inner side where it meets the other leg.
        ...[[[-20.2, -7.6], [-20.3, -2.2]], [[-10.1, -7.8], [-10.2, -2.1]]].map((pts) => ({ pts: flipX(pts as P[], side), width: INNER, colour: C.outline, opacity: 0.55 })),
        { pts: flipX([[-5.4, -34], [-3.4, -22], [-2.2, -12]], side), width: INNER, colour: C.furLine, opacity: 0.6 },
      ],
      // Up the inner side from the toes, round the paw and up the outer side, where the line lightens toward the chest.
      outline: { ...OUTLINE, spans: bySide(side, [{ from: [-1.7, -9], to: [-30.2, -13] }, { from: [-30.4, -14], to: [-33.6, -30], width: THIN, colour: C.furLine }]), taper: 6 },
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
