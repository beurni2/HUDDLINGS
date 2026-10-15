// The dog's three-quarter view facing the sheet's left (threeQuarter.L, DECISIONS 1): the dog has turned to its
// right, so its left side is near. Shapes first, every node typed by hand in model space (points, the ground under
// the seat at 0, 0, y down) at the extremes and inflections read off the three-quarter turnaround, then paint. The
// paint is the front view's (front.ts): the same recipes for the ears, eyes, nose, mouth, collar, tag and paws,
// each part's nodes typed again from this view's own crop. Light comes from the top left, as in every view.
import { furEdge, furSpan, type Lock } from "../../../draw/fur.ts";
import { bbox, ellipse, fracAt, pathD, sample, smooth, spanPoints, type Node, type P, type Shape } from "../../../draw/geom.ts";
import { innerLine, ribbons, strokeOf, type DrawnLine, type Outline, type Span, type Stroke } from "../../../draw/line.ts";
import { LIMITS } from "../../../draw/lint.ts";
import { marking, part, soft, type Paint } from "../../../draw/paint.ts";
import { blur, join, pad, piece, uid, type Box, type Piece } from "../../../draw/svg.ts";
import { model } from "../model.ts";
import { C } from "../palette.ts";
import type { Drawn } from "./front.ts";

const OUTER = model.outline.outerPt;
const INNER = model.outline.innerPt;
/** Lines on fur spans and small parts: lighter, and never under 1.2 pt, as in the front view. */
const THIN = 1.2;
const OUTLINE: Outline = { colour: C.outline, width: OUTER, taper: 6, blur: 0.2 };
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

// Shapes.

// The back and the near haunch: the back's line comes out from under the near ear's lower corner and runs down
// the sloping back to the rump, round the haunch's rear and down to the ground behind the hind paw, then along
// the haunch's underside under the paw; the rest lies hidden under the chest, the near front leg and the collar.
const back = smooth([[-36, -63], [-25, -66.5], [-17, -62], [-10, -55.3], [0.2, -48.5], [8.7, -40.9], [12.6, -34.4], [14.7, -26], [14.7, -17.5],
  [12, -10.2], [7.8, -5.9], [1.5, -1.8], [-9, -0.4], [-21, -0.6], [-31, -3], [-35, -20], [-36, -42]]);

// The near hind paw: the round stub at the haunch's front, as the sheet draws it (its top at y -17, from where
// it comes out from behind the near front paw to where its top line fades into the haunch at x -9), its sole on
// the ground with a small scallop at each of its two toe lines; its back end runs on into the haunch.
const hindNodes: Node[] = [[-29.6, -11.6], [-26.6, -15], [-22, -16.9], [-17, -17.1], [-12.4, -15.6], [-8.6, -12], [-6.4, -7], [-7.6, -2.4], [-13, -1.1],
  [-16.6, -1.6], [-19.8, -1], [-24.6, -1.3], [-28.8, -3], [-30.6, -7.6]];
const hind = smooth(hindNodes, { corners: [9] });

// The near front leg: a short, broad leg coming down from the chest in front of the haunch (its outer edge where
// the sheet's line runs from y -35 down to the paw, its inner edge from y -31 down to the paw's top), into a
// round bun of a paw that sits lowest of the three and spreads a little wider than the leg; its sole rests on
// the ground with a small scallop at each of its two toe lines. Its top melts into the chest.
const legL = smooth([[-51.5, -46], [-40, -47], [-29, -44], [-25.6, -35], [-24.9, -27], [-25.8, -19.4], [-27.3, -13.8], [-28.2, -9.4], [-29.4, -5.6],
  [-31.8, -2.9], [-36, -1.6], [-41.6, -1.2], [-47, -1.3], [-51.6, -1.5], [-55.6, -2.6], [-58.6, -6], [-59.8, -10.6], [-58.4, -15.6],
  [-55.4, -19.8], [-53.2, -26], [-52, -33], [-52, -40]]);

// The far front leg: behind the chest (spec L369), showing down the silhouette's front edge below the chest and
// in the slot beside the near leg, into its paw, smaller and a little higher than the near one, whose near side
// lies behind the near paw.
const legR = smooth([[-77, -46], [-61, -46], [-59.4, -36], [-58.6, -30.6], [-55.6, -24], [-53, -18.6], [-52, -13.4], [-53, -7.6], [-57, -4.2],
  [-62, -3.3], [-68, -2.9], [-74, -3.1], [-79, -4.6], [-82.3, -7.6], [-83.1, -11.6], [-82, -15.4], [-79.4, -18.4], [-77, -21.8], [-76.8, -28],
  [-77.4, -36]]);

// The chest: from under the collar down to the paws, its front edge the silhouette from the collar's end down to
// the far leg, which comes out from under it; its lower edge runs across the far leg's top and down the slot
// between the legs, where the sheet draws the far leg's line, to under the near paw. Its right side lies on the
// haunch's cream under the near leg and the collar, with no line.
const chest = smooth([[-74.5, -61], [-60, -64], [-40, -64.5], [-24, -64], [-21, -58], [-23, -50], [-26.5, -42], [-29, -32], [-33, -14], [-40, -4],
  [-52, -3.5], [-56.2, -16.4], [-58.6, -21.8], [-61.4, -27.4], [-64.2, -31.6], [-68.5, -33.4], [-74, -33.6], [-77.3, -34.6], [-77, -41],
  [-76, -48.5], [-74.8, -55]], { corners: [17] });

// The collar: the band round the neck from under the chin, where its rounded end shows, along the near side
// to where it turns away round the neck just short of the near ear; deepest (7.5 pt) under the near side of the
// chin, 6 pt toward its rounded end under the chin and narrowing to 3 pt where it turns away. Its top lies under the head's fur.
const collar = smooth([[-72.6, -61.8], [-60, -63], [-45, -62], [-30, -63.4], [-24.6, -64.6], [-22.2, -63.4], [-21.8, -61.2], [-22.8, -59.2], [-26, -56.4],
  [-30, -53.8], [-37.6, -51], [-45.4, -49.4], [-52.6, -50], [-60.6, -51.6], [-67, -52.4], [-70.6, -55.4], [-72.6, -58.4]]);

// The tag: the plump gold heart, hanging straight under its ring, a little narrower and shorter than the front's
// as the turn shows it (16 pt across with its line, under 15 pt tall); and the smaller heart embossed in it.
const TAG_X = LM["tag.ring"]![0];
const heartHalf: Node[] = [[0, -49.8], [-1.5, -50.7], [-3.4, -51], [-5.4, -50.4], [-7, -48.9], [-7.9, -46.9], [-8.1, -44.9], [-7.6, -43],
  [-6.8, -41.2], [-5.6, -39.6], [-4, -38.1], [-2.1, -36.9]];
const mirrored = (half: Node[], bottom: Node, dx: number): Node[] =>
  [...half, bottom, ...[...half].reverse().slice(0, -1).map(([x, y]): Node => [-x, y])].map(([x, y]): Node => [x + dx, y]);
const heart = smooth(mirrored(heartHalf, [0, -36.2], TAG_X), { corners: [0], typed: heartHalf.length + 1 });
const innerHeart = smooth(mirrored([[0, -46.6], [-1.6, -48], [-3.5, -48.1], [-4.8, -46.9], [-5, -45], [-4.3, -43.1], [-2.7, -41.5]], [0, -40.3], TAG_X),
  { corners: [0], typed: 8 });

// The ears. The far ear (the dog's right) hangs out past the far cheek from high on the head's far side, its
// upper edge one long convex arc from the root down to its widest, its lower edge breaking into soft clumps
// of fur; its inner edge runs on behind the face. The near ear hangs from just under the crown's overhang down
// beside the near cheek over the shoulder, broad and rounded below with a clump at its lower outer corner; its
// inner edge runs on behind the face.
const earR = smooth([[-80.8, -143.4], [-79.4, -138], [-82.6, -124], [-86.4, -108], [-90, -94], [-94, -84], [-96.8, -80.2], [-100.6, -78.3],
  [-105.2, -79.4], [-109.6, -82.4], [-113.4, -86.2], [-116.4, -90.8], [-119, -93.8], [-120.2, -97.6], [-120.4, -104.6], [-119.4, -111.6],
  [-116.6, -117], [-111.8, -121.7], [-105.2, -126.4], [-98.6, -131.6], [-92.9, -135.8], [-86.6, -140.4]], { corners: [11] });
const earL = smooth([[-2.2, -136], [6, -130.6], [10.8, -126], [14.6, -120.2], [17.6, -114.6], [25.8, -105.2], [28.7, -100.4], [30.2, -94.6], [30.8, -86],
  [30.6, -77.6], [28.6, -71.2], [25.6, -68.6], [22.6, -65.6], [17.2, -62.6], [10.4, -60.4], [3, -59.1], [-9.2, -61.9], [-13.4, -65.6], [-15, -70.6],
  [-15.6, -78], [-17, -95], [-17, -115], [-12, -130]], { corners: [11] });
const ears = { R: earR, L: earL };

// The head: the crown under the topknot; on the near side the crown's fur overhangs the near ear's root, and the
// face's side runs down over the ear to the near cheek; the jaw lies along the collar's top from the near cheek
// to the chin, dipping lowest under the near cheek, and rises from the chin up the far side of the jaw to the far
// cheek's puff, which bulges out over the far ear; above it the face's far side runs up over the far ear to its
// root and the crown.
const headNodes: Node[] = [[-70, -149.3], [-46, -154], [-13, -150.6], [-2.6, -144.6], [2.3, -136.6], [0.4, -135.4], [-6.6, -134.4], [-10.8, -126.4],
  [-10.6, -108], [-12.6, -94], [-15.8, -80], [-15.6, -67.6], [-26, -61.4], [-42.8, -57.9], [-61.7, -59.8], [-73.5, -62.4], [-82.5, -68.4], [-89.6, -76],
  [-96.6, -84.2], [-97.6, -93.4], [-91.2, -100.6], [-89.8, -115], [-86.4, -128], [-80.6, -143.2]];
/** The overhang's tip over the near ear's root, and where the far cheek's puff comes out from under the side's line. */
const OVERHANG = 5, PUFF = 20;
let head = smooth(headNodes, { corners: [OVERHANG, PUFF] });
// The far cheek's puff breaks into a few soft clumps of fur along its lower and outer edge, and the jaw's fur
// hangs over the collar in a row of small uneven tufts, as the sheet draws them.
const cheekLocks: Lock[] = [{ len: 0.6, w: 1.4, lean: 0.2 }, { len: 0.9, w: 1, lean: 0.3 }];
const chinLocks: Lock[] = [{ len: 0.5, w: 0.8, lean: 0.3 }, { len: 0.8, w: 1.1, lean: 0.25 }, { len: 0.6, w: 0.9, lean: 0.2 }, { len: 0.85, w: 1.2, lean: 0.15 },
  { len: 0.6, w: 0.9, lean: 0.1 }, { len: 0.8, w: 1.1, lean: 0 }, { len: 0.55, w: 0.8, lean: -0.1 }];
/** Each cheek clump's tip, root and notches (path order), for its line. */
const clumps: { tip: P; root: P; notches: [P, P] }[] = [];
head = furEdge(head, [-24, -61.8], [-70, -61.6], chinLocks, 0.24);
head = furEdge(head, [-89.6, -76], [-97.4, -94], cheekLocks, 0.5, (tip, root, notches) => clumps.push({ tip, root, notches }));
// The crown's fur where it overhangs the near ear's root is a lock of fur, its tip a fur span.
head = furSpan(head, [2.2, -137.4], [-1.6, -135]);

// The topknot: three fur lobes, typed node by node (the sheet's tuft, seen turned): the left lobe low and broad,
// the middle one tallest, its top the head's highest point, curling at its right foot, and the right lobe low.
const tuft = furSpan(smooth([[-66.6, -150.6], [-64.4, -155.4], [-59.4, -157.6], [-54.7, -157.7], [-50.9, -156.8], [-48.6, -155.2], [-46.6, -159.4],
  [-42.8, -162.6], [-37.8, -163.8], [-34.4, -164.2], [-31, -163.2], [-29.4, -159.6], [-30.4, -155.8], [-25.4, -157.2], [-20.6, -157.3], [-16.4, -156.2],
  [-13.6, -154.2], [-13.2, -151.6], [-16, -146.5], [-38, -145.5], [-62, -146.5]], { corners: [5, 12] }), [-66.4, -151], [-13.4, -151.8]);

// The head patches, in the paler tan (DECISIONS 18). The near one (the dog's left) is a broad hood over the
// top and the outer side of the near eye, its top edge about 9 pt above the eye with the brow in the cream above
// it, its nose end down to about the eye's middle; it runs down the face's side behind the eye to the cheek and
// rises behind the brow into the near ear's root. The far one is a smaller hood over the far eye's outer top,
// rising along the face's far side into the far ear's root. Each is typed with bleed past the head's edge; the
// eyes cover what lies under them.
const patchL = smooth([[-46.4, -104.8], [-43.6, -110.4], [-38, -113.6], [-31, -114.6], [-25, -113.8], [-21, -115.8], [-19.8, -123], [-18.4, -131], [-12, -133.4],
  [-5, -134.8], [-6, -120], [-8, -100], [-11, -86], [-15, -79.6], [-21, -79.6], [-25.4, -82.4], [-27.6, -87], [-28.6, -95], [-33, -103.6], [-40, -105.6],
  [-44.6, -102.6]]);
const patchR = smooth([[-95, -142], [-85, -143], [-80.4, -139.6], [-79, -130], [-76.6, -121], [-72.4, -116.4], [-69.4, -112.6], [-72, -111.2],
  [-76, -112.6], [-81, -111.6], [-84.6, -107.6], [-86.2, -102], [-87.2, -97.6], [-95, -97]]);

// The body's markings, each clipped to its part (L395): the near half of the saddle, a streak of tan down the
// sloping back from under the near ear toward the rump, lying along the back's line; the small soft spot on the
// rump where the tail's tan crosses the haunch's outline; and the tail's tan root.
const saddleL = smooth([[-24, -64.6], [-17, -62.6], [-10, -58], [-2, -52], [5, -46.5], [9.6, -41], [10.4, -38.2], [7, -38.8], [2, -41.6], [-4, -44.6],
  [-10, -48.2], [-15, -51.8], [-19.6, -55.6], [-24, -59]]);
const rumpL = smooth([[14, -33.6], [17, -28], [17, -21], [13.6, -18.4], [10.4, -20], [8.6, -25], [9.6, -30.6]]);
const tailBase = smooth([[10, -36.4], [19, -36], [25.4, -31.4], [29.6, -23.4], [30.4, -15.6], [27, -10.6], [19, -9.4], [11.4, -10], [8.4, -23]]);

// The tail: a fluffy curl rising behind the haunch, its root hidden behind the rump; its upper edge breaks into
// soft clumps of fur where it curls over, and it rounds down the far side to its foot behind the haunch.
let tail = smooth([[6, -32], [13.6, -34.4], [16.4, -37.4], [18.2, -43], [17.8, -49.4], [18.6, -53.6], [22.9, -57.2], [27, -59], [31.6, -56.4], [38, -51.4],
  [41.8, -47.6], [44.2, -43], [45.4, -36], [45.6, -29.6], [45, -23.6], [43.4, -18.8], [40.6, -15.2], [36, -12.4], [30.6, -10.4], [24.8, -9.6],
  [18.6, -9.8], [13.6, -11.4], [8, -16], [5.6, -24]]);
const tailLocks: Lock[] = [{ len: 1.2, w: 1, lean: 0.25 }, { len: 1.6, w: 1.2, lean: 0.3 }, { len: 1.1, w: 0.9, lean: 0.35 }, { len: 1.4, w: 1.1, lean: 0.3 }];
tail = furEdge(tail, [18.4, -52.6], [37.4, -51.8], tailLocks, 0.3);

// Paint.

const furShade = (group: Shape[], shapes: string[] = [], keep: string[] = [], rim = { inset: 2.5, toLight: 4 }) =>
  ({ multiply: C.furShadeBy, rim, shapes, keep, group, blur: 2.4 });
const hipGroup = [back, hind];
const bodyGroup = [chest, legL];
const headGroup = [head, tuft];

const backPaint: Paint = {
  fill: C.fur,
  // The haunch's rear and its underside away from the light, and under the near ear, which overhangs the back.
  shade: furShade(hipGroup, ["M-20 -66 C-10 -64 2 -60 14 -56 L14 -50 C2 -53 -8 -56 -20 -60Z"]),
  // The back's line, from under the ear down the sloping back and round the rump to the ground, in the outline's
  // brown the sheet draws there (#865C43 to #86512F), lighter where it comes out from under the ear; along the
  // ground under the haunch, the same line, deepening.
  outline: { ...OUTLINE, width: 1.45, taper: 5, spans: [{ from: [-17, -62], to: [8.7, -40.9], width: 1.3, colour: C.warmLine }, { from: [6, -43], to: [-21, -0.6] }] },
};

const headLight = "M-64 -150 C-52 -158 -30 -158 -18 -152 C-24 -142 -50 -140 -62 -144Z " +
  "M-97 -91 C-96.6 -96 -93 -98 -89.6 -96.6 C-88.4 -92 -89.6 -87 -92.6 -84.6 C-95.4 -85.4 -97.2 -88 -97 -91Z";
const headPaint: Paint = {
  fill: C.fur,
  // Under the jaw over the collar, where the head turns under; the far side of the jaw away from the light; and
  // a faint wash in the near hood just over the eye, under the brow.
  shade: furShade(headGroup, ["M-74 -64 C-56 -60 -36 -59 -14 -64 L-14 -52 L-74 -52Z", "M-94 -80 C-86 -70 -80 -66 -72 -64 L-72 -54 L-100 -60Z",
    `M${fmt(LM["eye.L"]![0] - 8)} ${fmt(LM["eye.L"]![1] - 10.4)} a8 2 0 1 0 16 0 a8 2 0 1 0 -16 0Z`],
    // The crown stays light right out to its line, as the sheet paints it; and so does the far cheek's puff.
    ["M-100 -172 L10 -172 L10 -140 L-100 -140Z", "M-100 -100 L-88 -100 L-88 -80 L-100 -80Z"], { inset: 3, toLight: 4.5 }),
  highlight: { d: headLight, colour: C.light, opacity: 0.4, blur: 4 },
};

const SEAM_R = uid("seam"), SEAM_L = uid("seam");
// The head's line, where the sheet draws one: the crown's one light warm line, from the topknot's left lobe down
// to the far ear's root and from its right lobe down round the overhang over the near ear; down each side, where
// the face lies over an ear, a round curve that comes in light from the root and deepens to the ear's deep tan
// (the sheet's #995727 and #9F582C there, DECISIONS 7), ending where the cheek comes out over it; and down the
// far side of the jaw to the chin, a soft light line (the sheet's #BC997D). The far cheek's clumps carry their
// own lines.
const headLine: Outline = { ...OUTLINE, taper: 4, blur: 0.15, spans: [
  { from: [-91, -102], to: [-85.6, -131], width: THIN, colour: `url(#${SEAM_R})` },
  { from: [-10.4, -124], to: [-15.6, -72], width: THIN, colour: `url(#${SEAM_L})` },
  { from: [-74, -62.6], to: [-89.4, -75.8], width: THIN, colour: C.crownLine },
] };
const crownLine: Outline = { ...headLine, taper: 1.4, spans: [
  { from: [-87.6, -136.4], to: [-66, -150.6], width: THIN, colour: C.crownLine },
  { from: [-14.6, -150.6], to: [-1.6, -134.2], width: THIN, colour: C.crownLine },
] };
/** The far cheek's clumps' line, following the scalloped edge on through the notches, in the lighter warm line the front's cheek puffs take. */
function clumpLines(): Outline {
  const spans: Span[] = [{ from: fracAt(head, clumps[0]!.notches[0]), to: fracAt(head, clumps.at(-1)!.notches[1]), colour: C.puffLine }];
  return { ...OUTLINE, width: THIN, taper: 2.2, blur: 0.2, spans };
}
const join2 = (a: ReturnType<typeof ribbons>, b: ReturnType<typeof ribbons>): ReturnType<typeof ribbons> =>
  ({ svg: a.svg + b.svg, lines: [...a.lines, ...b.lines], outlined: [...a.outlined, ...b.outlined] });
/** head.line: the head's outline as its own unclipped region, drawn after the head's clip group, reaching 0.5 pt past the head. */
function headLinePiece(): Piece {
  const r = join2(ribbons(head, headLine, "head.line", 0.5), ribbons(head, crownLine, "head.line", 0.5));
  const c = ribbons(head, clumpLines(), "head.line", 0.5);
  const f = uid("blur"), g = uid("blur");
  const [x0, y0, x1, y1] = bbox(head.segs);
  const box = pad([x0, y0, x1 - x0, y1 - y0], 2);
  // Where the crown's fur meets each ear's root with no line, the sheet's edge is soft: the crown's cream lies out
  // over the root's tan in a feathered edge.
  const s = uid("blur");
  const roots: [P, P][] = [[[-1.6, -135], [-10.4, -126]]];
  const feathered = roots.map(([a, b]) => strokeOf(spanPoints(head, ...([fracAt(head, a), fracAt(head, b)].sort((p, q) => p - q) as [number, number])), 2.4, { taper: 3, tip: 0.4 }).d).join("");
  const seam = (id: string, top: number, bottom: number) => `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" y1="${top}" x2="0" y2="${bottom}">` +
    `<stop offset="0" stop-color="${C.earEdge}"/><stop offset="1" stop-color="${C.earLine}"/></linearGradient>`;
  return piece(`<defs>${blur(f, pad(box, 2), headLine.blur!)}${blur(g, pad(box, 2), 0.35)}${blur(s, pad(box, 2), 0.8)}` +
    seam(SEAM_R, -132, -114) + seam(SEAM_L, -122, -106) + `</defs>` +
    `<path d="${feathered}" fill="${C.fur}" opacity="0.8" filter="url(#${s})"/>` +
    `<g fill="${headLine.colour}" filter="url(#${f})">${r.svg}</g>` +
    `<g filter="url(#${g})">${c.svg}</g>`, box, {
    shapes: [{ name: "head.line", nodes: head.typed, segs: head.segs, outlined: [...r.outlined, ...c.outlined], fur: head.fur.map(([a, b]) => [fracAt(head, a), fracAt(head, b)]) }],
    lines: [...r.lines, ...c.lines.map((l) => ({ ...l, where: "cheek clump" }))],
  });
}

/**
 * An open eye (front.ts's recipe, turned with the view): a dark oval, its rim a lash line heaviest along the upper
 * lid; the iris near-black down to a lower band in the printed dark brown, warming in its middle; a thin white
 * crescent inside the rim on the outer side, where the sheet draws it (`white`: its middle's angle below level, in
 * degrees); and one catchlight high on the nose's side (`shine`: toward the nose, up, radius). `noseward` is +1
 * when the nose is to the eye's right; `turn` turns the oval clockwise, in degrees.
 */
function eye(c: P, o: { rx: number; ry: number; turn: number; noseward: 1 | -1; white: number; whiteWidth?: number; shine: [number, number, number] }): Piece {
  const { rx, ry, turn, noseward } = o;
  const a = (turn * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
  /** A point in the eye's own frame, turned with it: x toward the nose, y down. */
  const S = (x: number, y: number): P => [c[0] + noseward * x * cos - y * sin, c[1] + noseward * x * sin + y * cos];
  const oval = (at: P, ax: number, ay: number) => pathD(ellipse(at, ax, ay, turn));
  const clip = uid("eye"), irisClip = uid("eye"), outside = uid("crescent"), above = uid("band"), rimFade = uid("rim");
  const warm = uid("blur"), shine = uid("blur"), edge = uid("blur"), white = uid("blur"), band = uid("blur"), halo = uid("blur"), core = uid("blur");
  const box: Box = [c[0] - rx - 5, c[1] - ry - 5, 2 * rx + 10, 2 * ry + 10];
  const ball = oval(c, rx, ry);
  const rim = 1, irisAt: [number, number] = [0.35, 0.4], ix = rx - rim, iy = ry - rim, irisOval = oval(S(...irisAt), ix, iy);
  const less = (at: P, r: number) => `M${fmt(c[0] - 30)} ${fmt(c[1] - 30)}H${fmt(c[0] + 30)}V${fmt(c[1] + 30)}H${fmt(c[0] - 30)}Z` + pathD(ellipse(at, r, r));
  // The white: the iris less a disc set 6.6 pt from its centre toward the nose, turned so the sliver left on the
  // outer side is `whiteWidth` wide at its middle (1.15 pt, the front's, by default), `white` degrees below level.
  const w = (-o.white * Math.PI) / 180, reach = Math.hypot(ix * Math.cos(w), iy * Math.sin(w));
  const cut = less(S(irisAt[0] + 6.6 * Math.cos(w), irisAt[1] + 6.6 * Math.sin(w)), 6.6 + reach - (o.whiteWidth ?? 1.15));
  // The lower band: the iris less a disc above its centre, about 3.8 pt deep at the foot for the front's eye, in
  // proportion here.
  const k = iy / 8.35;
  const lower = less(S(irisAt[0], irisAt[1] - 8 * k), 12.55 * k);
  const [t0x, t0y] = S(0, -ry);
  const around = (from: number, to: number, grow: number, n = 41): P[] => Array.from({ length: n }, (_, i) => {
    const t = ((from + ((to - from) * i) / (n - 1)) * Math.PI) / 180;
    return S(-(rx + grow) * Math.cos(t), -(ry + grow) * Math.sin(t));
  });
  const lidLine = tapered(around(-35, 120, 0.25), 1.8, "outer", "eye lid", { taper: 9, tip: 0.3 });
  const haloBand = strokeOf(around(-125, 25, 1.1, 31), 1.7, { taper: 5, tip: 0.2 });
  const big = S(o.shine[0], -o.shine[1]), warmAt = S(irisAt[0], irisAt[1] + 7.25 * k);
  const n = (p: P) => `${fmt(p[0])}" cy="${fmt(p[1])}`;
  const svg = `<defs><clipPath id="${clip}"><path d="${ball}"/></clipPath><clipPath id="${irisClip}"><path d="${irisOval}"/></clipPath>` +
    `<clipPath id="${outside}"><path d="${cut}" clip-rule="evenodd"/></clipPath><clipPath id="${above}"><path d="${lower}" clip-rule="evenodd"/></clipPath>` +
    `<linearGradient id="${rimFade}" gradientUnits="userSpaceOnUse" x1="${fmt(t0x)}" y1="${fmt(t0y)}" x2="${fmt(2 * c[0] - t0x)}" y2="${fmt(2 * c[1] - t0y)}">` +
    `<stop offset="0.62" stop-color="${C.eyeDark}"/><stop offset="0.85" stop-color="${C.dark}"/></linearGradient>` +
    `${blur(warm, box, 0.45)}${blur(shine, box, 0.15)}${blur(edge, box, 0.22)}${blur(white, box, 0.25)}${blur(band, box, 0.55)}${blur(halo, box, 0.55)}${blur(core, box, 0.3)}</defs>` +
    `<path d="${haloBand.d}" fill="${C.fur}" opacity="0.8" filter="url(#${halo})"/>` +
    `<g filter="url(#${edge})"><path d="${ball}" fill="url(#${rimFade})"/><path d="${lidLine.d}" fill="${C.eyeDark}"/></g>` +
    `<g clip-path="url(#${clip})"><path d="${irisOval}" fill="${C.eyeDark}"/>` +
    `<g clip-path="url(#${irisClip})"><g filter="url(#${band})"><path d="${irisOval}" fill="${C.dark}" clip-path="url(#${above})"/></g>` +
    `<ellipse cx="${n(warmAt)}" rx="${fmt(3.7 * k)}" ry="${fmt(0.85 * k)}" transform="rotate(${fmt(turn)} ${fmt(warmAt[0])} ${fmt(warmAt[1])})" fill="${C.irisLight}" opacity="0.85" filter="url(#${warm})"/>` +
    `<g filter="url(#${white})"><path d="${irisOval}" fill="${C.eyeWhite}" clip-path="url(#${outside})"/></g></g></g>` +
    `<ellipse cx="${n(big)}" rx="${fmt(o.shine[2])}" ry="${fmt(o.shine[2] * 0.94)}" fill="${C.light}" filter="url(#${shine})"/>` +
    `<ellipse cx="${n(big)}" rx="${fmt(o.shine[2] * 0.4)}" ry="${fmt(o.shine[2] * 0.35)}" fill="${C.dark}" opacity="0.1" filter="url(#${core})"/>`;
  return piece(svg, box, { shapes: [], lines: [lidLine.line] });
}

/** A brow, as the sheet paints it: a short, thick, rounded dab of tan, domed, its inner end no lower than its outer one; soft at its edges. */
function brow(pts: P[], width: number): Piece {
  const f = uid("blur"), [x0, y0, x1, y1] = bbox([[pts[0]!, pts[0]!, pts.at(-1)!, pts.at(-1)!], ...pts.map((p): [P, P, P, P] => [p, p, p, p])]);
  const box = pad([x0, y0, x1 - x0, y1 - y0], 4);
  return piece(`<defs>${blur(f, box, 0.35)}</defs><g filter="url(#${f})">` +
    `<path d="${strokeOf(pts, width, { taper: 2.2, tip: 1 }).d}" fill="${C.marking}" opacity="0.72"/></g>`, box);
}

/**
 * The nose (front.ts's recipe, turned): a soft rounded wedge, broad across its top, its near side fuller than its
 * far side, running to a rounded point a little left of its middle that runs on into the philtrum's top; a soft
 * grey-brown sheen across its upper left.
 */
const noseShape = smooth([[-68.4, -96], [-65.6, -95.6], [-63.6, -94.2], [-62.8, -92.4], [-63.8, -90.8], [-65.8, -89.6], [-67.6, -88.7], [-69.2, -89.2],
  [-71.4, -90.6], [-72.9, -92.4], [-72.6, -94.2], [-70.8, -95.5]]);
function nose(): Piece {
  const f = uid("blur"), box: Box = [-76, -99, 16, 13];
  return piece(`<defs>${blur(f, box, 0.7)}</defs><path d="${pathD(noseShape.segs)}" fill="${C.eyeDark}"/>` +
    `<ellipse cx="-68.9" cy="-94.3" rx="2.7" ry="1" transform="rotate(-8 -68.9 -94.3)" fill="${C.noseSheen}" opacity="0.8" filter="url(#${f})"/>`, box);
}

/**
 * The open happy mouth (front.ts's recipe, turned): the upper lip one inner line from the far corner's curl,
 * dipping under the philtrum's foot, down to the near corner's curl, deep red-brown over the opening and the
 * printed dark brown out along its ends; the opening hangs from it in a rounded wedge, deeper on the near side, the
 * dark red right up to the lip; the tongue a broad pink mound low in it with a soft light on its top.
 */
function mouth(): Piece {
  const lipPts: P[] = [[-77.6, -87.9], [-77.1, -86.8], [-75.8, -85.7], [-73.8, -84.9], [-71.6, -84.6], [-69.8, -85], [-67.6, -84.6], [-64.6, -83.4],
    [-61.4, -82.2], [-58.6, -81.7], [-56.4, -82.2], [-55.2, -83.3], [-54.8, -84.6]];
  const lipShape = smooth(lipPts, { closed: false });
  const lip = tapered(sample(lipShape.segs, 12, false), 0.9, "inner", "upper lip", { taper: 2.2, tip: 0.3 });
  const opening = smooth([[-74.8, -85.2], [-71.6, -84.4], [-69.8, -84.8], [-67.6, -84.4], [-64.6, -83.2], [-61.4, -82], [-58.8, -81.6], [-60.4, -79.2],
    [-62.3, -75.4], [-64.7, -71.8], [-68, -70.6], [-70.8, -71.6], [-72.7, -74.4], [-73.7, -78.2], [-74.4, -81.8]], { corners: [0, 6] });
  const m = pathD(opening.segs);
  const clip = uid("mouth"), softB = uid("blur"), lit = uid("blur"), lipFade = uid("lip");
  const TONGUE = "M-73 -68 L-72.6 -76.4 C-71.6 -79 -70 -80.4 -67.4 -80.6 C-64.8 -80.7 -63.2 -79.6 -62 -77.2 L-61 -68Z";
  const philtrum = innerLine([[-68.6, -88.9], [-69.6, -85.2]], 0.9, C.eyeDark, { taper: 0.9, tip: 0.75, wobble: 0 });
  const box: Box = [-80, -91, 28, 23];
  const svg = `<defs><clipPath id="${clip}"><path d="${m}"/></clipPath>${blur(softB, box, 0.4)}${blur(lit, box, 1.1)}` +
    `<linearGradient id="${lipFade}" gradientUnits="userSpaceOnUse" x1="-78" y1="0" x2="-55" y2="0">` +
    `<stop offset="0.08" stop-color="${C.dark}"/><stop offset="0.25" stop-color="${C.lipLine}"/><stop offset="0.75" stop-color="${C.lipLine}"/>` +
    `<stop offset="0.92" stop-color="${C.dark}"/></linearGradient></defs>` +
    `<path d="${m}" fill="${C.mouthInside}"/><g clip-path="url(#${clip})">` +
    `<path d="M-77 -88 L-55 -84 L-56 -81.4 C-62 -81.8 -68 -83.4 -77 -84.2Z" fill="${C.mouthDeep}" opacity="0.45" filter="url(#${softB})"/>` +
    `<path d="${TONGUE}" fill="${C.tongue}" filter="url(#${softB})"/>` +
    `<ellipse cx="-67.6" cy="-78.6" rx="2.4" ry="1.1" fill="${C.tongueShine}" opacity="0.55" filter="url(#${lit})"/></g>` +
    `<path d="${lip.d}" fill="url(#${lipFade})"/>${philtrum.svg}`;
  return piece(svg, box, { shapes: [], lines: [lip.line, { ...philtrum.line, where: "philtrum" }] });
}

/** The near cheek's blush, under the near eye's outer side, where the sheet's is (the far cheek shows none). */
function blush(): Piece {
  const [cx, cy] = [-34.8, -78.4], rx = 5.8, ry = 3.6, deg = -6;
  const d = pathD(ellipse([cx, cy], rx, ry, deg));
  return soft(d, [cx - rx - 0.5, cy - ry - 0.8, 2 * rx + 1, 2 * ry + 1.6], C.blush, 2.2, Math.round(model.blush.restingLevel * 1.28 * 100) / 100);
}

/** The tag and its ring (front.ts's recipe): flat matte gold, a darker gold rim, one soft light high on its left lobe, the smaller heart engraved as one faint warm line. */
function tagPiece(): Piece {
  const ringLine: DrawnLine = { kind: "inner", width: 0.6, where: "tag ring", drawn: [0.6, 0.6] };
  const [rx, ry] = [TAG_X - 1.4, LM["tag.ring"]![1] - 0.2];
  const ring = piece(`<rect x="${fmt(rx)}" y="${fmt(ry)}" width="2.8" height="7.6" rx="1.4" fill="${C.collar}" stroke="${C.collarRim}" stroke-width="${ringLine.width}"/>` +
    `<rect x="${fmt(rx + 0.7)}" y="${fmt(ry + 0.6)}" width="0.8" height="6" rx="0.4" fill="${C.collarHighlight}"/>`, [rx - 1, ry - 1, 5, 9.6], { shapes: [], lines: [ringLine] });
  const emboss = sample(innerHeart.segs, 10);
  emboss.push(emboss[0]!);
  const lit = uid("blur"), raised = sample(innerHeart.segs, 10).filter(([x, y]) => x < TAG_X && y < -44.2);
  return join(ring, part("tag", heart, {
    fill: C.tag,
    shade: { multiply: C.tagShadeBy, rim: { inset: 1.3, toLight: 1.3 }, blur: 1 },
    under: `<defs>${blur(lit, [TAG_X - 8, -51, 10, 10], 0.35)}</defs><path d="${strokeOf(raised, 0.9, { taper: 1.6, tip: 0.2 }).d}" fill="${C.tagShine}" opacity="0.7" filter="url(#${lit})"/>`,
    highlight: { d: `M${fmt(TAG_X - 6.4)} -47.6 a2.6 1.8 -40 1 0 5.2 0 a2.6 1.8 -40 1 0 -5.2 0`, colour: C.tagShine, opacity: 0.45, blur: 1.4 },
    inner: [{ pts: emboss, width: 0.7, colour: C.tagLine, opacity: 0.6 }],
    outline: { colour: C.tagLine, width: 1.3, taper: 2, blur: 0.2 },
  }));
}

/**
 * An ear's paint (front.ts's recipe): the tan deepening down the ear to a browner tan at its lower clumps under the
 * fur's own warm shade; the shade on the rim away from the light and along the inner edge where the ear tucks
 * under the head; a small soft light on its upper outer side; a few soft fur locks curving down into the notches
 * of its lower edge; and its line in the warm brown the sheet draws round the ears, heavier along the bottom,
 * lightening to the crown's line toward the root.
 */
function earPaint(side: "L" | "R"): Paint {
  const ear = ears[side];
  const deep = uid("deep"), parting = uid("blur"), along = uid("blur"), [ex0, ey0, ex1, ey1] = bbox(ear.segs);
  const earBox = pad([ex0, ey0, ex1 - ex0, ey1 - ey0], 2);
  // The locks' partings and the lighter strokes between them, curving down the ear with its outer contour.
  const dark: P[][] = side === "R"
    ? [[[-96, -127], [-104, -117], [-110, -106], [-113, -95], [-113.6, -86]], [[-92.4, -118], [-98.4, -108], [-102.4, -96], [-104.4, -84]]]
    : [[[8, -122], [16, -110], [22, -98], [25, -86], [25.6, -72]], [[1, -116], [7, -104], [12, -92], [14.6, -78], [15.4, -64]]];
  const light: P[][] = side === "R"
    ? [[[-94, -123], [-101.4, -112], [-106.4, -100], [-108.8, -89]]]
    : [[[4, -120], [11, -107], [17, -95], [20, -82]]];
  const softly = (pts: P[][], width: number) => pts.map((l) => strokeOf(sample(smooth(l, { closed: false }).segs, 8, false), width, { taper: 6, tip: 0.2 }).d).join("");
  const under = `<defs><linearGradient id="${deep}" gradientUnits="userSpaceOnUse" x1="0" y1="${side === "R" ? -110 : -100}" x2="0" y2="${fmt(ey1)}">` +
    `<stop offset="0" stop-color="${C.earDeep}" stop-opacity="0"/><stop offset="0.35" stop-color="${C.earDeep}"/>` +
    `<stop offset="0.72" stop-color="${C.earDeeper}"/><stop offset="1" stop-color="${C.earFoot}"/></linearGradient>` +
    `${blur(parting, earBox, 0.7)}${blur(along, earBox, 1)}</defs>` +
    `<rect x="${fmt(ex0)}" y="${fmt(ey0)}" width="${fmt(ex1 - ex0)}" height="${fmt(ey1 - ey0)}" fill="url(#${deep})"/>` +
    `<path d="${softly(light, 2.2)}" fill="${C.patch}" opacity="0.3" filter="url(#${along})"/>` +
    `<path d="${softly(dark, 1.5)}" fill="${C.earLow}" opacity="0.25" filter="url(#${parting})"/>`;
  // Along the inner edge, where the ear tucks under the head's side; for the near ear, under the near cheek too.
  const innerD = side === "R" ? "M-80 -144 C-84 -128 -88 -110 -92 -96 L-98 -82 L-86 -82 L-76 -144Z" : "M-4 -140 C-12 -124 -14 -100 -15 -80 L-15 -62 L-4 -62 L4 -140Z";
  const highlight = side === "R"
    ? "M-114 -110 C-113 -116 -108 -121 -103 -123 C-102 -119 -105 -113 -109 -109 C-111 -107 -114 -107 -114 -110Z"
    : "M14 -116 C16 -114 20 -110 22 -106 C20 -104 17 -106 15 -110Z";
  // The line comes out from under the crown at full weight at the root, lightening toward it, and deepens round the bottom.
  const toRoot = uid("earline");
  const lines = `<defs><linearGradient id="${toRoot}" gradientUnits="userSpaceOnUse" x1="0" y1="${side === "R" ? -140 : -134}" x2="0" y2="${side === "R" ? -118 : -112}">` +
    `<stop offset="0" stop-color="${C.crownLine}"/><stop offset="1" stop-color="${C.warmLine}"/></linearGradient></defs>`;
  const spans: Span[] = side === "R"
    ? [{ from: [-93, -86], to: [-120.2, -97.6], width: 1.6 }, { from: [-120.4, -104.6], to: [-85, -140.8], colour: `url(#${toRoot})` }]
    : [{ from: [-1, -135.4], to: [30.8, -86], colour: `url(#${toRoot})` }, { from: [30.6, -90], to: [-15, -70.6], width: 1.6 }];
  return {
    fill: C.marking,
    under: under + lines,
    shade: { multiply: C.furShadeBy, rim: { inset: 2.2, toLight: 3.6 }, shapes: [innerD], blur: 3.2 },
    highlight: { d: highlight, colour: C.patch, opacity: 0.3, blur: 2.6 },
    inner: dark.map((pts) => ({ pts: sample(smooth(pts.slice(-3), { closed: false }).segs, 8, false), width: 0.7, colour: C.earLine, opacity: 0.2 })),
    outline: { ...OUTLINE, colour: C.warmLine, width: 1.3, taper: 7, blur: 0.25, spans },
  };
}

/** Between the two front legs, the slot where the chest lies in shade, as the sheet paints it: warm tan deepening toward the paws. */
function between(): string {
  const g = uid("between"), f = uid("blur");
  const v = smooth([[-63.4, -33], [-58.4, -31], [-52.6, -31.6], [-52.8, -24], [-54.6, -17], [-56.4, -16.6], [-58.6, -21.4], [-61.4, -27.2]]);
  return `<defs><linearGradient id="${g}" gradientUnits="userSpaceOnUse" x1="0" y1="-33" x2="0" y2="-15">` +
    `<stop offset="0" stop-color="${C.marking}" stop-opacity="0.05"/><stop offset="0.45" stop-color="${C.marking}" stop-opacity="0.35"/>` +
    `<stop offset="1" stop-color="${C.earDeep}" stop-opacity="0.55"/></linearGradient>` +
    `${blur(f, [-68, -38, 20, 26], 0.9)}</defs>` +
    `<path d="${pathD(v.segs)}" fill="url(#${g})" filter="url(#${f})"/>`;
}

/** Where the jaw's fur lies on the collar (front.ts's recipe): the collar's dark rim right under the fur's edge, and a soft shade of its blue under that. */
function collarContact(): string {
  const f = uid("blur"), g = uid("blur");
  const jaw = spanPoints(head, fracAt(head, [-24, -61.8]), fracAt(head, [-70, -61.6]));
  const rim = strokeOf(jaw, 2.1, { taper: 2.5, tip: 0.6 }).d;
  const shade = strokeOf(jaw, 5, { taper: 4, tip: 1 }).d;
  return `<defs>${blur(f, [-76, -66, 58, 14], 0.3)}${blur(g, [-76, -66, 58, 14], 0.9)}</defs>` +
    `<path d="${shade}" fill="${C.collarLine}" opacity="0.45" filter="url(#${g})"/><path d="${rim}" fill="${C.collarRim}" opacity="0.9" filter="url(#${f})"/>`;
}

export function threeQuarter(): Drawn[] {
  const out: Drawn[] = [];
  const add = (name: string, p: Piece, state?: string) => out.push({ part: name, piece: p, ...(state ? { state } : {}) });
  // The ground shadow, as tight as the sheet's (gone 2 to 3 pt below the ground line): a long soft warm oval under the
  // paws and the haunch, from under the far paw to under the tail, and a soft contact shadow a little deeper under each paw.
  add("shadow", join(soft("M-88 -0.6 a62 2.6 0 1 0 124 0 a62 2.6 0 1 0 -124 0Z", [-88, -3.2, 124, 5.2], C.shadow, 1.8, 0.85),
    ...([[-69, 11], [-44, 13], [-19, 10]] as const).map(([x, r]) => soft(`M${x - r} -0.6 a${r} 1.8 0 1 0 ${2 * r} 0 a${r} 1.8 0 1 0 ${-2 * r} 0Z`,
      [x - r, -2.4, 2 * r, 3.6], C.contact, 1.2, 0.7))));
  add("tail", part("tail", tail, {
    fill: C.fur,
    shade: furShade([tail], ["M4 -40 C10 -30 12 -20 10 -8 L0 -8 L0 -40Z"], ["M16 -64 L48 -64 L48 -46 L16 -46Z"]),
    // The tail's line, light where its fur curls over at the top and down its far side, the outline's brown
    // round its foot (the sheet's #CABB9C on the curl, #BC9E7C down its side and #916F49 at its foot).
    outline: { ...OUTLINE, colour: C.crownLine, width: THIN, taper: 4, spans: [{ from: [14.2, -34.6], to: [44.6, -40] , colour: C.fluffLine },
      { from: [45, -44], to: [36, -12.4] }, { from: [40.6, -15.2], to: [13.6, -11.4], width: 1.4, colour: C.outline }] },
  }));
  add("tail.base", marking("tail.base", { shape: tail, paint: { fill: C.fur, shade: furShade([tail]) } }, tailBase, { fill: C.marking, blur: 1.6, clip: true }));
  add("body.back", part("body.back", back, backPaint));
  add("back.patch.L", marking("back.patch.L", { shape: back, paint: backPaint }, saddleL, { fill: C.marking, blur: 1.2, clip: true }));
  add("rump.patch.L", marking("rump.patch.L", { shape: back, paint: backPaint }, rumpL, { fill: C.marking, blur: 1.4, clip: true }));
  add("hind.L", roomy(part("hind.L", hind, {
    fill: C.fur,
    shade: furShade(hipGroup, [], ["M-34 -24 L-4 -24 L-4 -9 L-34 -9Z"]),
    // A short soft light line over its top, where it lies on the haunch, tapering off at each end as the sheet
    // draws it; its sole in the paws' grey-brown line.
    outline: { ...OUTLINE, colour: C.pawLine, width: 1.3, taper: 4, spans: [{ from: [-23.4, -16.6], to: [-12.4, -15.6], width: THIN, colour: C.softLine },
      { from: [-11, -1.3], to: [-30.6, -7.6], width: 1.4 }] },
    inner: [[[-22.7, -2], [-23, -4.4], [-22.8, -6.6]], [[-16.6, -1.8], [-16.4, -4.2], [-16.8, -6.4]]].map((pts) => ({ pts: pts as P[], width: INNER, colour: C.pawLine, opacity: 0.45 })),
    // Its back end runs on into the haunch, where the sheet's line along the ground carries on unbroken.
    feather: { from: [-6.4, -8], to: [-10.6, -8] },
  }), 6));
  // The far front leg: the fur under its own warm shade and a quarter of it again (palette.ts, farFur), 8.5% darker
  // than the near leg; its top, under the chest, eases back to the fur so the two join with no edge.
  const farTop = uid("fartop");
  add("front.R", part("front.R", legR, {
    fill: C.farFur,
    under: `<defs><linearGradient id="${farTop}" gradientUnits="userSpaceOnUse" x1="0" y1="-36" x2="0" y2="-24">` +
      `<stop offset="0" stop-color="${C.fur}"/><stop offset="1" stop-color="${C.fur}" stop-opacity="0"/></linearGradient></defs>` +
      `<rect x="-86" y="-48" width="34" height="26" fill="url(#${farTop})"/>`,
    shade: furShade([legR], [], ["M-90 -60 L-50 -60 L-50 -30 L-90 -30Z"]),
    outline: { ...OUTLINE, colour: C.pawLine, width: 1.35, taper: 5, spans: [{ from: [-58.5, -3.6], to: [-82.3, -7.6], width: 1.4 },
      { from: [-82.3, -7.6], to: [-77.2, -34], colour: C.crownLine, width: THIN }] },
    inner: [[[-70.9, -3.2], [-71.2, -5.4], [-71, -7.4]], [[-64.4, -3.4], [-64.2, -5.6], [-64.6, -7.4]]].map((pts) => ({ pts: pts as P[], width: 0.75, colour: C.pawLine, opacity: 0.5 })),
  }));
  add("body.front", roomy(part("body.front", chest, {
    fill: C.fur,
    // Under the collar, where the head's shade falls, and down the chest's far side away from the light.
    shade: furShade(bodyGroup, ["M-76 -58 C-60 -52 -40 -50 -22 -54 L-22 -62 L-76 -62Z"]),
    under: between(),
    // The chest's front edge, the silhouette from the collar down to the far leg, a light warm line (the sheet's
    // #B89778); and down the slot, the far leg's line where it comes out from under the chest.
    outline: { ...OUTLINE, colour: C.crownLine, width: THIN, taper: 4, spans: [{ from: [-77.2, -35.6], to: [-74.8, -55] },
      { from: [-56.6, -17.2], to: [-63.6, -31.2], colour: C.softLine }] },
  }), 1));
  add("collar", part("collar", collar, {
    fill: C.collar,
    shade: { multiply: C.shadeBy, shapes: ["M-76 -55 C-60 -49 -40 -48 -18 -57 L-18 -46 L-76 -46Z"], blur: 0.9 },
    highlight: { d: "M-70 -57.4 C-58 -55 -42 -54 -24 -59 L-24 -57 C-42 -52 -58 -53 -70 -55.4Z", colour: C.collarHighlight, opacity: 0.3, blur: 0.9 },
    // The keeper the tag's ring hangs from, a lighter loop across the band, and the jaw's contact on the collar.
    under: `<rect x="${fmt(TAG_X - 2.6)}" y="-61" width="4.4" height="9.4" rx="1.2" fill="${C.collarHighlight}" opacity="0.4"/>` + collarContact(),
    outline: { colour: C.collarRim, width: THIN, taper: 3, blur: 0.2, spans: [{ from: [-22.8, -59.2], to: [-72.6, -58.4] }] },
  }));
  add("tag", tagPiece());
  for (const side of ["R", "L"] as const) add(`ear.${side}`, part(`ear.${side}`, ears[side], earPaint(side)));
  add("head.base", part("head.base", head, headPaint));
  add("head.patch.L", marking("head.patch.L", { shape: head, paint: headPaint }, patchL, { fill: C.patch, blur: 0.8, clip: false, fade: { from: [-43, -106], to: [-47, -103.4] } }));
  add("head.patch.R", marking("head.patch.R", { shape: head, paint: headPaint }, patchR, { fill: C.patch, blur: 0.8, clip: false, fade: { from: [-74, -114], to: [-69.8, -112.6] } }));
  add("blush.L", blush());
  add("eye.L", eye([-37.8, -95.2], { rx: 10.1, ry: 10, turn: -4, noseward: -1, white: 38, whiteWidth: 1.5, shine: [3.6, 5.1, 1.75] }), "open");
  add("eye.R", eye([-78.3, -104.8], { rx: 6.4, ry: 9, turn: 15, noseward: 1, white: 40, whiteWidth: 1.4, shine: [2.5, 4.1, 1.35] }), "open");
  add("brow.L", brow([[-36.9, -124.4], [-35.2, -125.5], [-33.4, -125.9], [-31.2, -125], [-29.4, -122.8]], 2.2));
  add("brow.R", brow([[-71.2, -131.4], [-72.8, -132], [-74.6, -131.6], [-76, -130.4]], 1.8));
  add("nose", nose());
  add("mouth", mouth(), "open");
  add("head.line", headLinePiece());
  add("tuft", part("tuft", tuft, {
    fill: C.fur,
    shade: { multiply: C.furShadeBy, rim: { inset: 3, toLight: 4.5 }, group: headGroup, keep: ["M-80 -152 L10 -152 L10 -130 L-80 -130Z"], blur: 2.4 },
    highlight: { d: headLight, colour: C.light, opacity: 0.4, blur: 4 },
    inner: [
      { pts: [[-31.4, -159.4], [-30.6, -157.6], [-31.4, -156.2]], width: 0.8, colour: C.crownLine, opacity: 0.7 },
      { pts: [[-49.8, -156.4], [-48.4, -154.8], [-48.8, -153.2]], width: 0.8, colour: C.crownLine, opacity: 0.7 },
    ],
    outline: { ...OUTLINE, colour: C.crownLine, width: THIN, taper: 2.6, spans: [{ from: [-66.4, -151], to: [-49.2, -156.2] },
      { from: [-48, -156.4], to: [-30.2, -157.2] }, { from: [-29.6, -157.6], to: [-13.4, -152] }] },
    feather: { from: [-38, -146.5], to: [-38, -150.5] },
  }));
  // The near leg's outer line comes in faint where it leaves the chest and deepens to the paw's line at the
  // wrist, as the sheet's does; its inner line down the slot is a light warm line deepening toward the paw.
  const outerFade = uid("legline"), innerFade = uid("legline");
  add("front.L", part("front.L", legL, {
    fill: C.fur,
    shade: furShade(bodyGroup, [], ["M-70 -70 L-20 -70 L-20 -36 L-70 -36Z"]),
    under: `<defs><linearGradient id="${outerFade}" gradientUnits="userSpaceOnUse" x1="0" y1="-33" x2="0" y2="-12">` +
      `<stop offset="0" stop-color="${C.softLine}" stop-opacity="0.3"/><stop offset="0.4" stop-color="${C.softLine}"/><stop offset="1" stop-color="${C.pawLine}"/></linearGradient>` +
      `<linearGradient id="${innerFade}" gradientUnits="userSpaceOnUse" x1="0" y1="-31" x2="0" y2="-14">` +
      `<stop offset="0" stop-color="${C.softLine}" stop-opacity="0.4"/><stop offset="0.5" stop-color="${C.softLine}"/><stop offset="1" stop-color="${C.pawLine}"/></linearGradient></defs>`,
    // Two faint toe lines rising from the sole's scallops, as the sheet draws them.
    inner: [[[-37.8, -1.8], [-38.1, -3.9], [-38, -6.1], [-37.6, -8]], [[-45.6, -1.8], [-45.4, -3.9], [-45.5, -6.1], [-45.9, -8]]]
      .map((pts) => ({ pts: pts as P[], width: 0.75, colour: C.pawLine, opacity: 0.5 })),
    outline: { ...OUTLINE, colour: C.pawLine, taper: 5, spans: [
      { from: [-25.4, -33], to: [-28.2, -9.4], width: 1.3, colour: `url(#${outerFade})` },
      { from: [-29.4, -5.6], to: [-58.6, -6], width: 1.4 },
      { from: [-58.6, -6], to: [-52.4, -30], width: THIN, colour: `url(#${innerFade})` },
    ] },
    feather: { from: [-40, -46], to: [-40, -38] },
  }));
  return out;
}

/** Points the sheet has no finder for, where this drawing puts them (dev output for the sheet match). */
export const landmarks: Record<string, P> = {
  "paw.front.L": [-44.6, -6.8],
  "paw.front.R": [-71, -10.6],
  "paw.hind.L": [-19.6, -6.8],
  // The ring's top as it shows below the jaw, from which the tag swings.
  "tag.ring": [TAG_X, LM["tag.ring"]![1] + 0.4],
  // The seat: the haunch's underside on the midline, behind the hind paw, at y -1.6, taken 0.8 pt inside.
  seat: [0, -2.4],
};
