// The dog's front view: shapes first, every node typed by hand in model space
// (points, the ground under the seat at 0, 0, y down) at the extremes and
// inflections read off the front turnaround, then paint. Ported from the phase 3
// art design's front view. Light groups share one light across joined parts
// (head and tuft, chest and front legs, haunches and hind paws); joins are
// feathered and carry no rim and no line.
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

// Shapes.

const back = symmetric([[0, -52], [-22, -51], [-36, -45], [-44.5, -35], [-48.5, -25], [-49, -17], [-47, -9], [-41.4, -2.9], [-30, -1.5]], [0, -1.4]);

const hindR: Node[] = [[-45.6, -12.9], [-42.1, -18.4], [-36.6, -19.4], [-31.1, -16.9], [-29, -9.9], [-31.5, -4.8], [-37.6, -3.3], [-43.9, -3.9], [-46.4, -8.9]];
const hind = { R: smooth(hindR), L: other(hindR) };

let chest = symmetric([[0, -74], [-20, -73], [-29.5, -66], [-31, -57], [-33.5, -49], [-36, -41], [-34, -31], [-30, -20], [-27, -10]], [0, -8]);
// Chest fur at the shoulders, under the collar's ends.
chest = furEdge(chest, [-24, -70.5], [-31.5, -55], [{ len: 1.8, lean: 0.5 }, { len: 2.4, w: 1.1, lean: 0.3 }, { len: 2, lean: 0 }], 0.25);
chest = furEdge(chest, [31.5, -55], [24, -70.5], [{ len: 2, lean: 0 }, { len: 2.4, w: 1.1, lean: -0.3 }, { len: 1.8, lean: -0.5 }], 0.25);

const legR: Node[] = [[-4.5, -46], [-4.2, -30], [-3.6, -16], [-3.5, -8], [-4.4, -3.9], [-6.6, -1.7], [-10, -1], [-16, -1], [-22.5, -1.8], [-26.6, -4.8], [-27.6, -11], [-27.4, -24], [-26.5, -38], [-24, -48]];
const legs = { R: smooth(legR), L: other(legR) };

const collar = smooth([[-27, -62], [-13, -58.4], [0, -57.6], [13, -59], [27.6, -64], [28.4, -56.6], [14, -51.4], [0, -50], [-13, -50.6], [-26.6, -54.6]], { corners: [0, 4, 5, 9] });

const heart = smooth([[0, -46.8], [-3.6, -50.6], [-7.2, -49.6], [-8.2, -45], [-6, -40.2], [0, -35.2], [6, -40.2], [8.2, -45], [7.2, -49.6], [3.6, -50.6]], { corners: [0, 5] });

const earR: Node[] = [[-33, -139], [-42, -136.5], [-50.5, -132], [-57.5, -125], [-64, -116], [-72, -107], [-78, -99], [-81.5, -90], [-82, -81.5], [-80, -74.5],
  [-76, -69.5], [-70, -66], [-64, -63], [-52.5, -59.6], [-46.5, -60.2], [-42.3, -62], [-40.3, -66.4], [-42.4, -71.5],
  [-44.8, -81], [-44.6, -92], [-43, -103], [-40.5, -114], [-36, -124], [-31, -131.5]];
const ears = { R: smooth(earR), L: other(earR) };

let head = symmetric([[0, -154.5], [-12, -153.2], [-22, -150.4], [-31, -146.2], [-38, -140.5], [-42.5, -134], [-44, -124], [-45.2, -112], [-46, -100],
  [-47, -90], [-47.8, -82], [-46, -75], [-42, -69.6], [-36, -65.4], [-28, -61.4], [-18, -58.4], [-9, -57.1]], [0, -56.7]);
// Fur strokes: for each lock a short tapered stroke from inside the edge out toward its tip, as the sheet's fur lines run.
const furStrokes: P[][] = [];
const strokeTo = (tip: P, root: P) => {
  const d: P = [tip[0] - root[0], tip[1] - root[1]], l = Math.hypot(d[0], d[1]) || 1, u: P = [d[0] / l, d[1] / l];
  furStrokes.push([[root[0] - u[0] * 3.4, root[1] - u[1] * 3.4], [root[0] + u[0] * 0.4, root[1] + u[1] * 0.4], [tip[0] - u[0] * 1.2, tip[1] - u[1] * 1.2]]);
};
// Cheek fluff, as the hero and the front turnaround draw it: locks combed down and out.
head = furEdge(head, [-47.4, -92], [-33, -63.5], [{ len: 2.2, w: 0.8, lean: 0.2 }, { len: 3.6, lean: 0.35 }, { len: 4.2, w: 1.1, lean: 0.5 }, { len: 3.4, lean: 0.6 }, { len: 2.4, w: 0.8, lean: 0.7 }], 0.22, strokeTo);
head = furEdge(head, [33, -63.5], [47.4, -92], [{ len: 2.4, w: 0.8, lean: -0.7 }, { len: 3.4, lean: -0.6 }, { len: 4.2, w: 1.1, lean: -0.5 }, { len: 3.6, lean: -0.35 }, { len: 2.2, w: 0.8, lean: -0.2 }], 0.22, strokeTo);
// Wisps on the crown's sides, between the tuft and the ears.
head = furEdge(head, [-24, -150], [-38, -142.5], [{ len: 1.6, lean: 0.4 }, { len: 1.3, w: 0.8, lean: 0.5 }], 0.22, strokeTo);
head = furEdge(head, [38, -142.5], [24, -150], [{ len: 1.3, w: 0.8, lean: -0.5 }, { len: 1.6, lean: -0.4 }], 0.22, strokeTo);

// The topknot's lobes are fur, typed node by node (the sheet's tuft).
const tuft = furSpan(smooth([[-22, -150.5], [-21, -154.5], [-16.5, -157.6], [-11, -156.2], [-7.5, -160.6], [-2.5, -163.8], [3.5, -163.4], [7.5, -159.8],
  [11, -157.4], [15.5, -158.4], [19.5, -155], [20.5, -150.5], [8, -146], [-10, -146]], { corners: [3, 8] }), [-21, -154.5], [19.5, -155]);

// The head patches: around each eye and down behind its outer side, typed with
// about 4 pt of bleed past the head's edge, where the ear's root hides them.
const patchR: Node[] = [[-50, -121], [-37.2, -124.1], [-23, -121.5], [-17.6, -115.6], [-17.6, -108.5], [-24.5, -110], [-31.5, -108.2],
  [-37.1, -100.5], [-40.5, -91.5], [-44.6, -87.8], [-51, -88.5], [-50.5, -104.8]];
const patches = { R: smooth(patchR), L: other(patchR) };
// The saddle's two halves where they show from the front: the right half down the
// right haunch's side, the left half's tip at the top of the left haunch.
const saddleR = smooth([[-36, -47], [-40.4, -34.6], [-41, -20], [-43.1, -14.3], [-50, -13], [-52, -44]], { corners: [4, 5] });
const saddleL = smooth([[38, -46], [43, -41], [47, -37], [50.5, -41], [50, -46]]);

// Paint.

const headLight = "M-30 -146 C-18 -154 2 -154 10 -147 C6 -136 -18 -134 -28 -138Z";
const furShade = (group: Shape[], shapes: string[] = [], keep: string[] = [], rim = { inset: 2.5, toLight: 4 }) =>
  ({ multiply: C.furShadeBy, rim, shapes, keep, group, blur: 2.4 });
const bodyGroup = [chest, legs.R, legs.L];
const hipGroup = [back, hind.R, hind.L];
const headGroup = [head, tuft];
const mirrorD = (d: string) => d.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (_m, x: string, y: string) => `${-Number(x)} ${y}`);

const backPaint: Paint = { fill: C.fur, shade: furShade(hipGroup), outline: { ...OUTLINE, spans: [{ from: 0.12, to: 0.88 }] } };
const headPaint: Paint = {
  fill: C.fur,
  shade: furShade(headGroup, ["M-40 -76 C-30 -67 -16 -63 0 -63 C16 -63 30 -67 40 -76 L46 -58 L-46 -58Z"], [], { inset: 3, toLight: 4.5 }),
  highlight: { d: headLight, colour: C.light, opacity: 0.75, blur: 4 },
  inner: furStrokes.map((pts) => ({ pts, width: 0.65, colour: C.furLine, opacity: 0.45 })),
};
// The head's line runs all round it: a lighter line on the fur, the ear's tan where a patch meets its ear (DECISIONS 7).
const headLine: Outline = { ...OUTLINE, taper: 5, spans: [
  { from: [-19, -151.5], to: [-43.5, -128], width: THIN, colour: C.furLine },
  { from: [-44.5, -126], to: [-46.8, -94], width: 1.39, colour: C.junction },
  { from: [-46.6, -96], to: [-44, -72], width: THIN, colour: C.furLine },
  { from: [-44, -72], to: [44, -72] },
  { from: [44, -72], to: [46.6, -96], width: THIN, colour: C.furLine },
  { from: [46.8, -94], to: [44.5, -126], width: 1.39, colour: C.junction },
  { from: [43.5, -128], to: [19, -151.5], width: THIN, colour: C.furLine },
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

function eye(cx: number, cy: number, noseward: number): Piece {
  const rx = 9.7, ry = 10;
  const ix = cx + noseward * 0.75, iy = cy - 0.35;
  const clip = uid("eye"), iris = uid("iris"), shine = uid("blur");
  const box: Box = [cx - 12, cy - 12, 24, 24];
  const lid: P[] = Array.from({ length: 33 }, (_, k) => {
    const a = Math.PI * (0.95 + 1.1 * (k / 32));
    return [cx + Math.cos(a) * rx * -noseward, cy + Math.sin(a) * ry];
  });
  const svg = `<defs><clipPath id="${clip}"><ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"/></clipPath>` +
    // The iris: near-black above, the lighter printed brown below (DECISIONS 18).
    `<radialGradient id="${iris}" gradientUnits="userSpaceOnUse" cx="${ix}" cy="${iy + 3}" r="11" fx="${ix}" fy="${iy + 8.8}">` +
    `<stop offset="0.2" stop-color="${C.dark}"/><stop offset="0.62" stop-color="${C.eyeDark}"/></radialGradient>` +
    `${blur(shine, box, 0.22)}</defs>` +
    `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${C.eyeWhite}"/>` +
    `<g clip-path="url(#${clip})"><ellipse cx="${ix}" cy="${iy}" rx="${rx - 0.35}" ry="${ry - 0.1}" fill="url(#${iris})"/></g>` +
    `<path d="${taperedStroke(lid, 1.25, { taper: 7, tip: 0.25 })}" fill="${C.eyeDark}"/>` +
    `<ellipse cx="${cx + noseward * 3.4}" cy="${cy - 4.4}" rx="2.6" ry="2.4" fill="${C.light}" filter="url(#${shine})"/>` +
    `<circle cx="${cx - noseward * 3.3}" cy="${cy + 5}" r="0.9" fill="${C.light}" opacity="0.7"/>`;
  return piece(svg, box, { shapes: [], lines: [{ kind: "outer", width: 1.25, where: "eye lid" }] });
}

function brow(sx: number): Piece {
  // An arch, thickest in the middle.
  const pts: P[] = [[sx * 30, -124.6], [sx * 27.6, -127.4], [sx * 24, -128.4], [sx * 20.6, -127.2]];
  return piece(`<path d="${taperedStroke(pts, 2.2, { taper: 2.6, tip: 0.6 })}" fill="${C.marking}"/>`, [sx > 0 ? 18 : -33, -132, 15, 10]);
}

function nose(): Piece {
  return piece(`<path d="M-6 -94.4 C-5.4 -97 5.4 -97 6 -94.4 C6.2 -91.6 2.8 -88.6 0 -88.4 C-2.8 -88.6 -6.2 -91.6 -6 -94.4Z" fill="${C.eyeDark}"/>` +
    `<ellipse cx="-1.8" cy="-94.8" rx="2.1" ry="0.9" fill="${C.light}" opacity="0.4"/>`, [-8, -99, 16, 13]);
}

function mouth(): Piece {
  const m = "M-11.4 -84.6 C-8 -83.6 -3.6 -83.8 0 -86.2 C3.6 -83.8 8 -83.6 11.4 -84.6 C10.6 -76.5 6.2 -68.6 0 -68 C-6.2 -68.6 -10.6 -76.5 -11.4 -84.6Z";
  const clip = uid("mouth");
  const smile = (sx: number): P[] => [[sx * 14.4, -86.8], [sx * 12.9, -84.9], [sx * 9, -83.7], [sx * 4, -83.9], [0, -86.4]];
  const lines = [smile(-1), smile(1)].map((pts) => `<path d="${taperedStroke(pts, 1.2, { taper: 2, tip: 0.35 })}" fill="${C.dark}"/>`).join("");
  const philtrum = innerLine([[0, -88.6], [0, -86.2]], 0.9, C.dark, { taper: 1, tip: 0.6, wobble: 0 });
  const svg = `<defs><clipPath id="${clip}"><path d="${m}"/></clipPath></defs>` +
    `<path d="${m}" fill="${C.mouthInside}"/><g clip-path="url(#${clip})"><ellipse cx="0" cy="-70.4" rx="9.2" ry="7.6" fill="${C.tongue}"/>` +
    `<path d="M0 -76.5 L0 -70" stroke="${C.tongueLine}" stroke-width="0.7" stroke-linecap="round"/>` +
    `<ellipse cx="-3.2" cy="-74" rx="2.6" ry="1.3" fill="${C.tongueShine}" opacity="0.55"/></g>${lines}${philtrum.svg}`;
  return piece(svg, [-17, -91, 34, 25], { shapes: [], lines: [{ kind: "outer", width: 1.2, where: "mouth" }, philtrum.line] });
}

function blush(sx: number): Piece {
  return soft(`M${sx * 31.5 - 7} -84 a7 4.4 0 1 0 14 0 a7 4.4 0 1 0 -14 0Z`, [sx * 31.5 - 7, -88.4, 14, 8.8], C.blush, 2.4, Math.round(model.blush.restingLevel * 1.45 * 100) / 100);
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

export function front(): Drawn[] {
  const out: Drawn[] = [];
  const add = (name: string, p: Piece, state?: string) => out.push({ part: name, piece: p, ...(state ? { state } : {}) });
  add("shadow", soft("M-62 -1.5 a62 4.5 0 1 0 124 0 a62 4.5 0 1 0 -124 0Z", [-62, -6, 124, 9], C.shadow, 2.5));
  add("body.back", part("body.back", back, backPaint));
  add("back.patch.R", marking("back.patch.R", { shape: back, paint: backPaint }, saddleR, { fill: C.marking, blur: 1, clip: true }));
  add("back.patch.L", marking("back.patch.L", { shape: back, paint: backPaint }, saddleL, { fill: C.marking, blur: 1, clip: true }));
  for (const side of ["R", "L"] as const) {
    const sx = side === "R" ? -1 : 1, cx = sx * 37.6, cy = -10.9;
    add(`hind.${side}`, part(`hind.${side}`, hind[side], {
      fill: C.fur,
      shade: furShade(hipGroup, [], [`M${cx - 12} ${cy - 12} L${cx + 12} ${cy - 12} L${cx + 12} ${cy - 3} L${cx - 12} ${cy - 3}Z`]),
      // Round the outside and the sole; the top lies under the haunch and the inner side against the front leg.
      outline: { ...OUTLINE, taper: 4, spans: bySide(side, [{ from: [-29.7, -12.2], to: [-43.2, -16.6] }]) },
      feather: { from: [cx, cy - 8.5], to: [cx, cy - 4] },
      inner: [-2.6, 2.6].map((dx) => ({ pts: [[cx + dx, cy + 2.5], [cx + dx * 1.1, cy + 7]] as P[], width: INNER, colour: C.outline, opacity: 0.55 })),
    }));
  }
  add("body.front", part("body.front", chest, { fill: C.fur, shade: furShade(bodyGroup), outline: { ...OUTLINE, spans: [{ from: 0.02, to: 0.36 }, { from: 0.64, to: 0.98 }] } }));
  // The chin's shadow on the chest, cast by the head (spec L396).
  add("shadow.chin", soft("M-26 -59 C-12 -53 12 -53 26 -59 L26 -66 L-26 -66Z", [-26, -66, 52, 10], C.furShade, 2.4));
  add("collar", part("collar", collar, {
    fill: C.collar,
    shade: { multiply: C.shadeBy, shapes: ["M-30 -53 C-10 -47 10 -47 30 -55 L30 -48 L-30 -48Z"], blur: 1.5 },
    highlight: { d: "M-24 -60 C-10 -56.5 10 -56.5 25 -62 L25 -60 C10 -54.8 -10 -54.8 -24 -58.2Z", colour: C.collarHighlight, opacity: 0.9, blur: 0.7 },
    outline: { colour: C.collarLine, width: THIN, spans: [{ from: 0.5, to: 0.99 }], taper: 4, blur: 0.25 },
  }));
  add("tag", tagPiece());
  for (const side of ["R", "L"] as const) {
    const k = side === "R" ? 1 : -1;
    const shadeD = "M-92 -88 C-74 -86 -54 -82 -38 -78 L-38 -50 L-92 -50Z";
    const inner = [[[-71, -94], [-72, -81], [-70, -71]], [[-62, -96], [-63, -81], [-61, -67]], [[-53.5, -100], [-54, -85], [-52.5, -66]]];
    add(`ear.${side}`, part(`ear.${side}`, ears[side], {
      fill: C.marking,
      shade: { multiply: C.shadeBy, rim: { inset: 2, toLight: 3.5 }, shapes: [k > 0 ? shadeD : mirrorD(shadeD)], blur: 5 },
      highlight: { d: k > 0 ? "M-63 -110 C-54 -122 -42 -127 -39 -119 C-41 -107 -52 -99 -60 -101Z" : "M44 -118 C48 -126 56 -121 61 -111 C57 -101 48 -103 44 -110Z", colour: C.patch, opacity: 0.85, blur: 3.2 },
      inner: inner.map((pts) => ({ pts: pts.map(([x, y]) => [k * x!, y!] as P), width: INNER, colour: C.outline, opacity: 0.4 })),
      // From where the ear comes out from behind the head, round to where its inner edge goes back under the cheek.
      outline: { ...OUTLINE, spans: bySide(side, [{ from: [-40, -137.2], to: [-42.4, -71.5] }]), taper: 7 },
    }));
  }
  add("head.base", part("head.base", head, headPaint));
  for (const side of ["L", "R"] as const) {
    add(`head.patch.${side}`, marking(`head.patch.${side}`, { shape: head, paint: headPaint }, patches[side], { fill: C.patch, blur: 1.1, clip: false }));
  }
  add("blush.L", blush(1));
  add("blush.R", blush(-1));
  const eyeY = -99.6, eyeX = 23;
  add("eye.L", eye(eyeX, eyeY, -1), "open");
  add("eye.R", eye(-eyeX, eyeY, 1), "open");
  add("brow.L", brow(1));
  add("brow.R", brow(-1));
  add("nose", nose());
  add("mouth", mouth(), "open");
  add("head.line", headLinePiece());
  add("tuft", part("tuft", tuft, {
    fill: C.fur,
    shade: { multiply: C.furShadeBy, rim: { inset: 3, toLight: 4.5 }, group: headGroup, keep: ["M-40 -152 L40 -152 L40 -130 L-40 -130Z"], blur: 2.4 },
    highlight: { d: headLight, colour: C.light, opacity: 0.75, blur: 4 },
    inner: [{ pts: [[-11, -155.8], [-9.6, -153.2], [-9, -151]], width: 0.65, colour: C.furLine, opacity: 0.5 }, { pts: [[11, -157], [10.2, -154.4], [9.6, -152.4]], width: 0.65, colour: C.furLine, opacity: 0.5 }],
    outline: { ...OUTLINE, colour: C.furLine, width: THIN, spans: [{ from: [-21.3, -153.5], to: [20.2, -153.5] }], taper: 5 },
    feather: { from: [0, -146.5], to: [0, -151] },
  }));
  for (const side of ["R", "L"] as const) {
    const sx = side === "R" ? -1 : 1, cx = sx * 15.5;
    add(`front.${side}`, part(`front.${side}`, legs[side], {
      fill: C.fur,
      shade: furShade(bodyGroup, [], ["M-40 -60 L40 -60 L40 -36 L-40 -36Z"]),
      inner: [-3.4, 3.4].map((dx) => ({ pts: [[cx + dx, -5.6], [cx + dx * 1.06, -1.4]] as P[], width: INNER, colour: C.outline, opacity: 0.6 })),
      // Down the inside, round the paw and up the outside, fading into the feathered top.
      outline: { ...OUTLINE, spans: bySide(side, [{ from: [-4.4, -40], to: [-26.9, -40] }]), taper: 12 },
      feather: { from: [0, -44], to: [0, -36] },
    }));
  }
  return out;
}

/** Points the sheet has no finder for, where this drawing puts them (dev output for the sheet match). */
export const landmarks: Record<string, P> = {
  "paw.front.L": [15.5, -5.4],
  "paw.front.R": [-15.5, -5.4],
  "paw.hind.L": [37.6, -10.9],
  "paw.hind.R": [-37.6, -10.9],
  // The ring's top as it shows below the chin; it swings from its hidden top, the tag's pivot at (0.4, −57.5).
  "tag.ring": [0.4, -55.6],
  // The seat: the body's lowest point on the midline is at −1.4; taken 0.6 pt inside, so it lies in the body's own pixels.
  seat: [0, -2],
};
