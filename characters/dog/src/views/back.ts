// The dog's back view (the dog seen from behind: its left on the viewer's left,
// format README), shapes first, every node typed by hand in model space
// (points, the ground under the seat at 0, 0, y down) at the extremes and
// inflections read off the back turnaround (master.turnaround.back) at its own
// scale (DECISIONS 5), then paint by the front's and the side's recipes. There is
// no face: the head from behind is the crown and its two-lobed topknot, the ears
// hanging at its sides, the back of the head and the collar's band round the
// neck. The tail lies in front of the body (spec L298), its tan root showing
// inside its curl. One light group holds the haunches and the hind heels, one the
// head and its topknot.
// The fur pass (DECISIONS 242 to 248) puts the back on the shared recipes: one line per visible edge, ending only where
// the sheet ends it (parts/lines.ts's `ends`), head.line crisp on its outside; the head's fur over the ears' roots and
// down its sides by headFur(); the ears' edges by earEdge() and their paint by earFur(); the heels as small buns under
// the haunches' notches; the tail's plume in typed clumps; the markings brushed; the collar's ends rounded; the ground
// shadow by groundShadow(). Every drawing with a lit line is held by the line gate (lineGate()).
import { CLUMPS, furEdge, furSpan, STEP, type FurRules, type Lock } from "../../../draw/fur.ts";
import { arc, bbox, ellipse, fracAt, mirrorX, pathD, polyD, sample, smooth, v, type Node, type P, type Shape } from "../../../draw/geom.ts";
import { ribbons, strokeOf, type DrawnLine, type Outline, type Stroke } from "../../../draw/line.ts";
import { LIMITS, lineGate } from "../../../draw/lint.ts";
import { part, type Paint } from "../../../draw/paint.ts";
import { blur, join, mask, pad, piece, region, uid, type Box, type Piece } from "../../../draw/svg.ts";
import { earEdge, earFur } from "../parts/ear.ts";
import { CRISP } from "../parts/topknot.ts";
import { headFur } from "../parts/headfur.ts";
import { litEdge, litMarking, litPart, type LitSpan } from "../parts/lines.ts";
import { brush } from "../parts/marking.ts";
import { groundShadow } from "../parts/shadow.ts";
import { C, LINES } from "../palette.ts";
import type { Drawn } from "./front.ts";

/** The collar's rim: never under 1.2 pt (as the front draws it), heavier along the band's underside (247). */
const THIN = 1.2, UNDERSIDE = 1.55;
/**
 * Each part's seed for its lines' living weight (DECISIONS 260, 280), typed once here and never drawn from anything that
 * changes, so each line is the same in every build and never shimmers; a part's spans take its seed plus their place.
 */
const SEED = { body: 4201, hind: { L: 4211, R: 4216 }, ear: { L: 4221, R: 4226 }, crown: 4231, side: 4241, tuft: 4251, tail: 4261 } as const;
/** A part's spans with their living weight (DECISIONS 260, 280), each its seed plus its place; a span that carries one keeps it. */
const weighed = (seed: number, spans: LitSpan[]): LitSpan[] => spans.map((s, k) => (s.weight ? s : { ...s, weight: { seed: seed + k } }));

/** A tapered line drawn as a filled polygon, with its meta for the lint built from what strokeOf draws (as the front's). */
function tapered(pts: P[], width: number, kind: "outer" | "inner", where: string, opts: Stroke = {}): { d: string; line: DrawnLine } {
  const s = strokeOf(pts, width, { band: LIMITS[kind], ...opts });
  return { d: s.d, line: { kind, width, where, drawn: s.drawn } };
}
/** A part's canvas grown to hold its light group's shade where the group reaches past the part. */
const roomy = (p: Piece, by: number): Piece => ({ ...p, box: pad(p.box, by) });
/** A smooth open line through typed points, sampled for a stroke. */
const curve = (pts: P[], per = 8) => sample(smooth(pts, { closed: false }).segs, per, false);
/**
 * A row of locks typed along one side's path, for the other side, whose path runs the other way: in reverse, leaning
 * the other way, each notch's dip moved with it (the dip after a lock is the notch it shares with the next).
 */
const reversedRow = (locks: Lock[]): Lock[] => locks.map((_, k) => {
  const l = locks[locks.length - 1 - k]!, before = locks[locks.length - 2 - k];
  return { ...l, lean: -(l.lean ?? 0), dip: before?.dip };
});
/** Typed for the viewer's left, mirrored to the right. */
const flipX = (lines: P[][]): P[][] => lines.map((l) => l.map(([x, y]): P => [-x, y]));
const boxOf = (s: Shape, by = 1): Box => {
  const [x0, y0, x1, y1] = bbox(s.segs);
  return pad([x0, y0, x1 - x0, y1 - y0], by);
};
/** How far along a closed outline from one place to the next in path order, in points. */
function along(shape: Shape, from: P, to: P): number {
  const pts = sample(shape.segs, 48), total = arc([...pts, pts[0]!]).at(-1)!;
  return ((((fracAt(shape, to) - fracAt(shape, from)) % 1) + 1) % 1) * total;
}
/** Where two closed outlines cross, the crossing nearest `near` (their samples' segments, as headFur finds the crown's join). */
function crossing(a: Shape, b: Shape, near: P): P {
  const pa = sample(a.segs, 32), pb = sample(b.segs, 32), found: P[] = [];
  for (let i = 0; i < pa.length; i++) {
    const p = pa[i]!, q = pa[(i + 1) % pa.length]!;
    for (let j = 0; j < pb.length; j++) {
      const r = pb[j]!, t = pb[(j + 1) % pb.length]!;
      const d = (q[0] - p[0]) * (t[1] - r[1]) - (q[1] - p[1]) * (t[0] - r[0]);
      if (Math.abs(d) < 1e-12) continue;
      const u = ((r[0] - p[0]) * (t[1] - r[1]) - (r[1] - p[1]) * (t[0] - r[0])) / d, w = ((r[0] - p[0]) * (q[1] - p[1]) - (r[1] - p[1]) * (q[0] - p[0])) / d;
      if (u >= 0 && u < 1 && w >= 0 && w < 1) found.push([p[0] + u * (q[0] - p[0]), p[1] + u * (q[1] - p[1])]);
    }
  }
  const best = found.sort((x, y) => v.len(v.sub(x, near)) - v.len(v.sub(y, near)))[0];
  if (!best || v.len(v.sub(best, near)) > 4) throw new Error(`back: the outlines cross ${best ? `${v.len(v.sub(best, near)).toFixed(2)} pt` : "nowhere"} from (${near.join(", ")})`);
  return best;
}

// Shapes.

// The ears from behind: broad tan droplets hanging at the head's sides from
// high on the crown, as the sheet draws them. Each runs up under the crown to
// its root, its top hidden there, and comes out where the crown's line runs on
// into its outer edge (DECISIONS 89, 243); the outer edge steps out once, a third
// of the way down, where its top lobe lies over the next, and swells to its
// widest (x -77.4 on the left at y -92, 76 on the right at -97); its hem hangs in
// three rounded lock tips, the outer one small and highest, the inner one the
// lowest (the silhouette's -66.3 at x -49), with a notch 1 to 2 pt deep between
// each (244); its inner edge runs up under the head's side, hidden, its foot
// staying under the head's lower lobe down to the notch below it and turning out
// into the hem only there, so the head's cream lies over the ear's foot with no
// ground between them (the sheet's notch opens below y -71.4 on the left and
// -72.3 on the right, its line at x -37.3 to -37.8 from y -76 to -74 and 38.1 to
// 38.8 on the right; 243). Each typed from its own crop.
const earLNodes: Node[] = [[-28.4, -141.8], [-34.6, -144.6], [-38.6, -144.6], [-42, -143], [-43.8, -141], [-49.6, -135.1], [-56.6, -128.6], [-62.6, -120.2],
  [-68.2, -114.2], [-72.2, -108.6], [-75.8, -101.2], [-77.4, -92.4], [-76.6, -87.4], [-73.4, -82.2], [-68.4, -77.2], [-61.8, -72.4], [-54, -69.6], [-47, -68.6],
  [-41.6, -69.7], [-38.5, -71.7], [-36.7, -75.3], [-35.6, -88], [-34.4, -104], [-31.6, -126]];
const earRNodes: Node[] = [[28.6, -142.6], [36.4, -145.2], [41, -145.4], [44, -143.4], [47.4, -140.6], [49.6, -138], [55.8, -131.5], [60.6, -124.6], [65.8, -118.8],
  [70.2, -112.4], [74.4, -105], [77.3, -96.4], [76.8, -88.6], [73.4, -82.4], [67.8, -77], [61, -72.4], [53.4, -69.8], [47.4, -69], [42.8, -70.2],
  [39.7, -71.5], [37.8, -74.5], [36.2, -88], [35.4, -104], [31.8, -126]];
/** The hem's three tips, from the outer side in: the small outer lock, the broad middle one, the inner one hanging lowest. */
const HEM: Lock[] = [{ len: 1.3, width: 11.6, lean: 0.35, dip: 0.45 }, { len: 1.8, width: 17, lean: 0.15, dip: 0.3 }, { len: 1.4, width: 14.4, lean: 0.1 }];
/** The step down the outer edge, a third of the way down, where the top lobe lies over the next: one broad low lock leaning down the edge. */
const STEP_LOCK: Lock = { len: 1.1, width: 9.2, lean: 0.35 };
function earOf(side: "L" | "R") {
  const R = side === "R", k = R ? 1 : -1;
  const base = smooth(R ? earRNodes : earLNodes);
  return earEdge({
    base,
    steps: [{ from: R ? [69.4, -113.4] : [-69.4, -112.8], to: R ? [74.2, -105.2] : [-74.6, -104.8], lock: STEP_LOCK, tipRound: 0.35 }],
    hem: { from: R ? [76.5, -87.6] : [-76.8, -88.2], to: R ? [42.2, -70.4] : [-41.6, -70.6], locks: HEM, tipRound: 0.4 },
    axis: [[k * 46, -140], [k * 54, -68]],
    // From behind the ear hangs behind the head: its line comes out from under the crown, where the crown's line joins
    // it (its start is set to that crossing below), and runs on under the head's side at its inner end.
    line: { from: R ? [44, -143.4] : [-41.8, -143.6], to: R ? [37.4, -80] : [-37.8, -80], ends: ["under", "under"] },
    deep: 0.75,
  });
}
const edges = { L: earOf("L"), R: earOf("R") };
const ears = { L: edges.L.shape, R: edges.R.shape };

// The collar from behind: a band round the back of the neck, arching up over the
// nape (its top 74.9 pt high at the middle, its foot 65.5), about 10 pt deep at
// the middle and 8 at its ends, which drop as they turn round the neck and round
// off there, sunk in the fur, the right reaching a little further out, as the
// sheet draws it (247).
const collar = smooth([[-26.4, -70.6], [-23, -72.1], [-18, -73.4], [-9, -74.6], [0, -74.9], [9, -74.6], [17, -73.6], [23.6, -72], [28, -70.4], [30.2, -68.2],
  [30.6, -65.6], [29.8, -63.2], [27.6, -62.5], [24, -63.2], [16, -64.6], [6, -65.5], [-6, -65.5], [-16, -64.8], [-23.4, -63.2], [-26.8, -62.6], [-28.7, -63.8],
  [-29.2, -66.4], [-28.4, -69.2]]);

// The head from behind: a full round mass. Its crown runs out from under the
// topknot's feet in two broad locks a side, as the sheet draws it: on the left
// the first flat at y -156 out to its tip at x -31, where the line steps down to
// the second, which runs down to its tip over the ear's root (-41.6, -144, the
// silhouette's step there); on the right the first runs further out, to x 39.6,
// and the second is short. Past each lowest tip the crown's line runs on into the
// ear's (headFur), and under it the crown's fur hangs over the ear's root in
// broad low locks combed down and out, so the ear's tan shows below them and
// rises to a point under the head's side (the crescent, -30.6, -138.8). From
// there the side runs down over the ear's inner edge, widest at x -39.4 (the
// sheet's line at -39.4 to -38.6 from y -118 to -96), to its lower lobe, which
// lies over the ear's foot down to the notch under it and rests on the collar's
// end (98): from the notch, where the ear's foot comes out from under it, its
// edge runs down a diagonal into the collar's end, the sheet's line there (its
// darkest at y -75.3 by x -36.7, -73.8 by -35.1, -73 by -33.5, -72.2 from -32.8
// to -30.4 and -71.4 by -29.6), the ground showing under it, as the sheet's card
// does (243, 282). Its foot lies behind the collar and the shoulders. Typed as its
// left half (the viewer's left, the dog's left), mirrored, the right crown typed
// where the sheet draws it.
const headHalf: Node[] = [[0, -152.6], [-16.4, -155.6], [-26.4, -156.2], [-30.6, -153.8], [-32.4, -150.4], [-37.6, -147.8], [-41.6, -144],
  [-37.6, -142.4], [-30.8, -138.8], [-33.2, -128.4], [-37.8, -119.8], [-39.4, -108], [-38.8, -88], [-38.6, -79.6], [-35.4, -74], [-30.2, -71.9], [-20, -63]];
const HEAD_FOOT: Node = [0, -58.6];
/** The notch between the crown's two locks, the lowest lock's tip, and the crescent under it (indices in headHalf). */
const NOTCH = 4, CRESCENT = 8;
/**
 * The right crown is not the left's mirror on the sheet: its first lock runs on to x 39.6 at y -150.4 before the
 * line steps down to the second, short one, whose tip (44, -143.6) is where the ear comes out under it. Typed from
 * the crescent up; the rest of the right side is the left's mirror.
 */
const rightCrown: Node[] = [[32, -139.5], [38.2, -142.5], [44, -143.6], [40.4, -147.8], [39.4, -150.6], [30.4, -155.4]];
/**
 * Down the right ear the head's side stands further out than the left's mirror on the sheet (its line at x 40 to 40.8
 * from y -122 to -102, against -38 to -39.6 on the left; its cream out to 34.4 by y -129, against -32.4): pushed out
 * by up to 2.4 pt round y -119, nothing below y -102 or above -136 (243).
 */
const widen = ([x, y]: Node): Node => [x + 2.4 * Math.max(0, 1 - ((y + 119) / 17) ** 2), y];
const mirrored = mirrorX(headHalf, false).slice(0, -1);
const at = headHalf.length - 1 - CRESCENT;
const headNodes: Node[] = [...headHalf, HEAD_FOOT, ...mirrored.slice(0, at).map(widen), ...rightCrown, ...mirrored.slice(headHalf.length - 2)];
const RIGHT_CRESCENT = headHalf.length + 1 + at, RIGHT_NOTCH = RIGHT_CRESCENT + 3;
const headBase = smooth(headNodes, { typed: headHalf.length + 1 + rightCrown.length, corners: [NOTCH, CRESCENT, RIGHT_CRESCENT, RIGHT_NOTCH] });
/**
 * Over each ear's root, from the lowest lock's tip in toward the crescent: two broad low locks combed down and out, as
 * short and as little leaning as the crown's rules let them (HEAD_FUR.crown), since the sheet's cream ends over the tan
 * there in a soft, nearly straight edge sloping down toward the crescent (x -37 to -30 from y -142.75 to -138.25 on the
 * left; 33 to 35 at -139.6 to -140.1 on the right), the inner lock the longer; narrower and longer, three to the right
 * root, they read as white teeth on the tan (DECISIONS 214, 243).
 */
const CROWN: Lock[] = [{ len: 1.65, width: 6.4, lean: -0.4, dip: 0.4 }, { len: 2.15, width: 5.6, lean: -0.45 }];
/** The right root is longer on the sheet (its crescent sits further in): its two locks broader, typed in its path's order, from the crescent out. */
const CROWN_R: Lock[] = [{ len: 1.65, width: 6.45, lean: 0.4, dip: 0.4 }, { len: 2.1, width: 6.45, lean: 0.45 }];
/** Where each lower lobe's edge goes under the collar's end. */
const JAW = { L: crossing(headBase, collar, [-29.6, -70.2]), R: crossing(headBase, collar, [29.6, -70.2]) };
const fur = headFur({
  base: headBase,
  crown: [
    { side: "L", from: [-41.6, -144], to: [-30.8, -138.8], locks: CROWN, tipRound: 0.25, line: { from: [-15.2, -155.7], to: [-41.6, -144] }, ear: ears.L },
    { side: "R", from: [32, -139.5], to: [44, -143.6], locks: CROWN_R, tipRound: 0.25, line: { from: [44, -143.6], to: [15.2, -155.7] }, ends: ["join", "under"], ear: ears.R },
  ],
});
// The crown's locks from each of the topknot's feet to the lowest tip are fur (the dog's head tuft, L508), lined as one span.
const head = furSpan(furSpan(fur.head, [-16.6, -155.6], [-41.4, -143.6]), [43.8, -143.4], [16.6, -155.6]);
/** Where the crown's line joins each ear's outer line (headFur's crossing), so the ear's line starts there. */
const JOIN = { L: fur.crown[0]!.to as P, R: fur.crown[1]!.from as P };
/**
 * The head's side line over each ear (DECISIONS 243, 282): from y -120.6, where the sheet's line begins (none above it,
 * down from the root, which headFur leaves unlined under the crown's locks), down the side over the ear's foot, on the
 * tan and as dark as the sheet's (#A96737 by y -100), a contact line (the head lies over the ear, Q31); then from the
 * notch, where the ear's own line comes out from under the lobe and takes the side's on round the foot into the hem,
 * round the lobe's corner and down its diagonal under the collar's end, on the cream and lightening to the cream
 * ladder's light end, as the sheet's (its darkest L* 61 to 64 from |x| 30 to 36). The stretch above it to the crown's
 * join is cited by its length.
 */
const SIDE = { L: { top: [-37.8, -120.6] as P }, R: { top: widen([37.8, -120.6]) as P } };
const ROOT_PT = { L: along(head, JOIN.L, SIDE.L.top), R: along(head, SIDE.R.top, JOIN.R) };
/** Past the notch (|x| under 37.4, below y -78), the lobe's diagonal over the ground, off the ear's tan. */
const onLobe = (p: P) => Math.abs(p[0]) < 37.4 && p[1] > -78;
const sideOn = (p: P): "cream" | "tan" => (onLobe(p) ? "cream" : "tan");
/** Low on the side, over the ear's foot, the sheet's line is lighter than the contact floor's (its L* 50 to 56 from y -83 to -79, ours had read 47 to 48), and lighter again down the lobe's diagonal. */
const sideMost = (p: P) => (onLobe(p) ? 0.1 : p[1] > -84 ? 0.2 : 1);
const sideSpans: LitSpan[] = weighed(SEED.side, [
  { from: SIDE.L.top, to: JAW.L, ends: ["free", "under"], on: sideOn, contact: true, most: sideMost, cites: 243, bare: [ROOT_PT.L + 0.5, 0] },
  { from: JAW.R, to: SIDE.R.top, ends: ["under", "free"], on: sideOn, contact: true, most: sideMost, cites: 243, bare: [0, ROOT_PT.R + 0.5] },
]);

// The topknot: two round fur lobes on the crown, as the sheet draws them from
// behind, the left one a little the taller (the head's top, -164 at x -9.6),
// the right one fuller on its outer side (its line still at y -161.5 by x 22,
// dropping to the crown at x 23.6); their lines meeting in a V at the notch
// between them; each comes down to the crown's line at its foot; its base lies
// on the crown, hidden.
const TUFT_NOTCH = 7;
/** Where the right lobe's line comes down onto the crown's and joins it. */
const TUFT_FOOT_R: P = [19.6, -155.8];
const tuft = furSpan(smooth([[-16.6, -155.4], [-16.4, -158.6], [-14.6, -161.8], [-11.6, -163.8], [-8, -164.3], [-4.6, -163.4], [-1.8, -161], [2.4, -155.8],
  [4.6, -159.4], [8.4, -162.2], [12.8, -163], [17.6, -163.5], [21.4, -162.3], [23.7, -159.6], [23.8, -156.8], [22.4, -155.7], [19.6, -155.8], [10, -150.6],
  [-4, -150.6], [-13.6, -152.4]], { corners: [TUFT_NOTCH] }), [-16.6, -155.4], TUFT_FOOT_R);
/**
 * The crisp topknot's tucks (DECISIONS 262, 281), typed here because from behind the topknot is the sheet's two lobes, not
 * the 4 or 5 locks `topknot()` builds: at each V (each lobe's foot on the crown's line, and the notch between the lobes)
 * the lobe's line turns into a short stroke running in under the lobe, `CRISP.tuck`'s width at the V with a round end
 * whose edge lies on it, easing out to its tip toward its inner end only, in the notch strokes' light tone, softened a
 * little; the strokes they replace, tapering at both ends in the crown line's darker tone, read as dark sliver spikes.
 * Each typed from the V inward: the left foot's down and in under the left lobe (the sheet's dark from (-14.5, -155) to
 * (-13.5, -154)), the notch's straight down (the sheet's V reaching on to y -154.5); at the right foot the lobe's line
 * itself hooks back in under the lobe, as the sheet's does, and its tuck runs on from the hook's end along the crown to
 * x 17.4 (the sheet's hook reaching x 18 at y -155.2); typed first from the foot's V under the hook, it doubled the
 * hook's own line into a dark knot.
 */
const TUCKS: P[][] = [[[-16.3, -155.5], [-14.4, -154.7], [-12.6, -154.3], [-11.2, -154.3]], [[2.4, -155.8], [2.3, -154.6], [1.9, -153.4]],
  [[19.8, -155.8], [18.7, -155.5], [17.4, -155.2]]];
/** One tuck along `pts` from its V: `CRISP.tuck.width` at the V with a round end there, easing out to `tip` at its inner end. */
function tuckD(pts: P[]): string {
  const { width, tip } = CRISP.tuck;
  const start = v.add(pts[0]!, v.mul(v.norm(v.sub(pts[1]!, pts[0]!)), width / 2));
  const line = curve([start, ...pts.slice(1)], 8);
  const at = arc(line), length = at[at.length - 1]!;
  const left: P[] = [], right: P[] = [];
  line.forEach((p, i) => {
    const u = at[i]! / length, w = tip + (width - tip) * (1 - u * u * (3 - 2 * u));
    const t = v.norm(v.sub(line[Math.min(line.length - 1, i + 1)]!, line[Math.max(0, i - 1)]!)), n: P = [-t[1], t[0]];
    left.push(v.add(p, v.mul(n, w / 2)));
    right.push(v.sub(p, v.mul(n, w / 2)));
  });
  const [x, y] = line[0]!, r = width / 2, f = (n: number) => +n.toFixed(2);
  return `${polyD([...left, ...right.reverse()])}M${f(x - r)} ${f(y)}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
}
/** How much of the outer band the topknot's line swells across (260, 281): its thin end, as the crisp topknot's ceiling keeps its tone; at the whole band its feet's turns swelled into dark knots. */
const TUFT_WEIGHT = 0.4;
/** The tucks as one piece over the topknot, unclipped (a stroke clipped to a pointed V is a sliver). */
function tucks(box: Box): Piece {
  const f = uid("blur");
  return piece(`<defs>${blur(f, pad(box, 2), CRISP.tuck.blur)}</defs><path d="${TUCKS.map(tuckD).join("")}" fill="${LINES.cream[1]}" opacity="${CRISP.tuck.opacity}" filter="url(#${f})"/>`, box);
}

// The body from behind: the shoulders come out from under the collar's ends
// and run down and out, a lock stepping out a little under each collar end, to a
// notch at y -40 where the haunch's round begins outside them; each haunch bulges
// out to its widest at y -22 (the sheet's line at x -48.5 on the left and 47.3 on
// the right) and turns in under itself to a small notch (y -14.2), where the heel
// bulges out below it as a little bun; the haunch's underside runs from that notch
// down over the heel to the ground, and the bottom runs along the ground between
// the heels, lowest under the tail (245). Typed as its left half, mirrored, the
// right haunch drawn in.
const bodyHalf: Node[] = [[0, -67], [-24, -66.4], [-29.4, -62], [-32.6, -58.6], [-36.2, -52.4], [-38.4, -46.8], [-39.6, -43.2], [-40.4, -40.4], [-43, -37.4],
  [-45.6, -34], [-47.6, -30], [-48.8, -26], [-49.2, -21.8], [-48.6, -17.4], [-47.4, -15.2], [-46.6, -14.2], [-43.8, -10.6], [-40.4, -6.8], [-36.6, -3.6],
  [-30.6, -2.8], [-22.4, -1.8], [-12, -0.9]];
const BODY_FOOT: Node = [0, -0.7];
/** The notch where each haunch's round begins outside the shoulder, and the heel's notch under the haunch (concave corners). */
const NOTCH_B = 7, HEEL_NOTCH = 15;
/** Where each heel's line meets the bottom's, on the ground (the end of the haunch's underside). */
const MEET = 18;
/** The right haunch is a little narrower than the left on the sheet (its line at x 47.3 against -48.5): drawn in by up to 1.2 pt round y -23. */
const narrow = ([x, y]: Node): Node => [x - 1.2 * Math.max(0, 1 - ((y + 23) / 14) ** 2), y];
const bodyNodes: Node[] = [...bodyHalf, BODY_FOOT, ...mirrorX(bodyHalf, false).slice(0, -1).map(narrow)];
const mirrorIndex = (i: number) => bodyNodes.length - i;
/** Under each collar end the shoulder steps out once, a broad low lock (fur.ts's STEP; the sheet's line jumps at y -55). */
const SHOULDER: Lock = { len: 0.9, width: 5.4, lean: 0.35 };
const bodyBase = smooth(bodyNodes, { typed: bodyHalf.length + 1, corners: [NOTCH_B, HEEL_NOTCH, mirrorIndex(NOTCH_B), mirrorIndex(HEEL_NOTCH)] });
/**
 * Along the bottom each haunch's underside waves in two low fur bumps (245), each one broad low lock as gentle as the
 * sheet's bottom line (fur.ts's STEP: 0.6 to 1.6 pt high and 4 to 10 wide, one lock to a call); the plume's CLUMPS,
 * whose lobes stand at least 0.15 as high as they are wide, read along the ground as a chewed edge.
 */
const BUMPS: [P, P, Lock][] = [[[-33.6, -3.2], [-25.8, -2.3], { len: 0.8, width: 7.8, lean: 0.3 }], [[-22.8, -1.9], [-15.4, -1.2], { len: 0.65, width: 7.4, lean: 0.25 }]];
const body = [...BUMPS, ...BUMPS.map(([a, b, l]): [P, P, Lock] => [[-b[0], b[1]], [-a[0], a[1]], { ...l, lean: -l.lean! }])].reduce(
  (shape, [a, b, lock]) => furEdge(shape, a, b, [lock], 0.35, undefined, STEP),
  furEdge(furEdge(bodyBase, [-33, -57.9], [-36, -52.6], [SHOULDER], 0.3, undefined, STEP), [36, -52.6], [33, -57.9], [{ ...SHOULDER, lean: -SHOULDER.lean! }], 0.3, undefined, STEP));

// The hind heels: from behind only each heel shows, a small round bun under the
// haunch's notch (y -14.2), bulging out a little below it (the sheet's line at
// x -46.1 from y -12.6 to -9.4) and round its corner onto the ground, where its
// line runs on into the bottom's (245); the rest lies behind the haunch. Each
// passes through the haunch's notch and the meeting on the ground, so the lines
// meet on shared points.
const heelL: Node[] = [[-46.6, -14.2], [-47, -11.2], [-46.5, -8.4], [-45, -6], [-42.6, -4.4], [-39.8, -3.6], [-36.6, -3.6], [-33.2, -4.2], [-30.6, -6.2],
  [-29.8, -10], [-31.6, -15.6], [-35.4, -19.8], [-40.4, -21.6], [-44.8, -20.6], [-46.5, -17.4]];
const hind = { L: smooth(heelL), R: smooth(mirrorX(heelL).map(narrow)) };
const HEEL = { L: { notch: bodyNodes[HEEL_NOTCH] as P, meet: bodyNodes[MEET] as P }, R: { notch: bodyNodes[mirrorIndex(HEEL_NOTCH)] as P, meet: bodyNodes[mirrorIndex(MEET)] as P } };

// The tail, in front of the body: a round fluffy plume sitting between the
// haunches, as the sheet draws it. Its tip curls up and over to the left above
// the saddle and hooks down into it, ending in a pointed tuft (-9.8, -24.2); the
// hook's underside runs up from there over the saddle to the curl's inner bend
// (0.9, -33.8), then up its left side to the round head of the curl (its top at
// y -49.6); down its right side the plume is one big round arc, the sheet's line
// out at x 28.5 by y -37, 30.5 at -26 and 28.5 at -17, sweeping in to 22.5 at
// -9.5 and down onto the ground by x 10, in the sheet's four broad soft lobes,
// each lying over the one below, its line hooking on into the plume from the
// notch (246, 283);
// its foot rests on the ground on the body's own line there, so the two read as
// the one ground line the sheet draws under it, its middle dipping 0.5 pt below
// it from x 0 to 8, as the sheet's lowest lobe does (its ground line at y -1
// there, -2 to -2.25 beside it); and up its left side over the left haunch to
// the hook. Its top right is the sheet's arc (its line at x 24.5 by y -44).
/** The pointed tuft at the hook's end, and the hook's inner bend over the saddle. */
const TAIL_TIP = 0;
/**
 * The plume's right side in the sheet's four lobes (DECISIONS 283): the crop's line notches at (28.6, -31.8), (27.7, -18)
 * and (21, -7.5), so its lobes run 10.7, 14, 12.5 and 7 pt along the edge, uneven, never a repeat, broad and soft; the
 * five clumps of 9.2 to 9.9 pt typed before notched it twice where the sheet does not, an even ripple.
 */
const PLUME: Lock[] = [{ len: 1.7, width: 10.7, lean: 0.3, dip: 0.35 }, { len: 2.2, width: 14.6, lean: 0.3, dip: 0.45 }, { len: 1.8, width: 11.6, lean: 0.5, dip: 0.55 },
  { len: 1.2, width: 7, lean: 0.35 }];
/**
 * CLUMPS (213) as the back's plume needs them: its lobes up to 15 pt wide along the edge, where the rules' 10 pt (the
 * tail-curve panel's and the profile's plume) refuses the back crop's 12.5 and 14; the rest of the rules as they are.
 */
const PLUME_RULES: FurRules = { ...CLUMPS, width: [4, 15] };
/** Each clump of the plume: its tip, root and notches, for the shades and partings drawn inside it. */
const tailLocks: { tip: P; root: P; notches: [P, P] }[] = [];
const tail = furSpan(furEdge(smooth([[-9.8, -24.2], [-5.6, -28.4], [-1.4, -31.2], [0.9, -33.8], [0.8, -39.6], [2.6, -45], [7, -48.6], [13.6, -49.6],
  [21, -47.1], [25.8, -42.1], [28.4, -33.6], [29.5, -25.9], [28.5, -20.4], [25.4, -12.6], [20.6, -7.4], [15.6, -3.2], [9.6, -0.95], [4, -0.25], [-1.4, -0.8],
  [-6.4, -0.95], [-10.6, -6.8], [-12.2, -13.6], [-11.6, -19.6]], { corners: [TAIL_TIP] }),
[25.8, -42.1], [15.6, -3.2], PLUME, 0.35, (tip, root, notches) => tailLocks.push({ tip, root, notches }), PLUME_RULES), [-9, -25.2], [-10.4, -21.6]);
/**
 * The tail's root, where it leaves the rump (rig.json's tail pivot in this view): the middle of its tan root as it shows
 * from behind (phase 2's patch there centres on -5.7, -23.7), at the side view's root height (-23), on the tail.
 */
export const TAIL_ROOT: P = [-5, -24];

// Markings.

// The saddle from behind (DECISIONS 23, 24): it crosses the spine just behind
// the collar (its top 6 pt below the collar's foot), its upper edge reaching as
// far to the dog's right (x 21.6) as to its left (x -21.4); below that it lies
// left of the spine down to the tail's root, its left edge breaking into small
// rounded lumps of fur, and the tail covers the rest. The left half
// (back.patch.L) runs on 3.6 pt past the spine under the right half, so the two
// meet with no seam; on the left flank a strip of it shows just inside the
// outline from y -54 to -40, where the saddle wraps round the side, inside the
// body's line (246). Typed with bleed under the tail, which the tail hides.
const saddleL = furEdge(furEdge(smooth([[3.6, -59.6], [-3, -59.6], [-8.6, -58.4], [-12.8, -56.6], [-15.4, -54.2], [-17.6, -50.4], [-20.2, -46.4], [-21, -41.6],
  [-20.2, -37], [-18.4, -32.6], [-15.4, -29.4], [-11.6, -26.8], [-8.4, -24.8], [-3, -24.4], [3, -30], [4.6, -40], [4.2, -52]]), [-1, -59.6], [-13.6, -56],
[{ len: 0.8, w: 1, lean: 0.1 }, { len: 1.1, w: 1.3, lean: 0 }, { len: 0.7, w: 0.8, lean: -0.1 }, { len: 0.9, w: 1, lean: 0 }], 0.48), [-14.8, -55.4], [-16.6, -30],
[{ len: 0.9, w: 0.9, lean: 0.1 }, { len: 1.2, w: 1.2, lean: 0 }, { len: 0.7, w: 0.8, lean: -0.1 }, { len: 1.1, w: 1.1, lean: -0.1 }, { len: 0.8, w: 0.9, lean: 0 }], 0.48);
const flankL = smooth([[-39.4, -53.6], [-36.6, -54.4], [-34.8, -50.8], [-34.8, -45.6], [-36.2, -41.6], [-38.8, -40.2], [-40.6, -45.2]]);
const saddleR = furEdge(smooth([[-1.2, -60], [4, -59.2], [8.4, -58.2], [12.4, -56.8], [16, -54.8], [19, -52.2], [20.8, -48.8], [21.4, -45], [19, -42], [10, -44],
  [1, -44], [-1.4, -52]]), [1.4, -59.6], [20.4, -49.4], [{ len: 0.8, w: 1, lean: 0.1 }, { len: 1.1, w: 1.2, lean: 0.1 }, { len: 0.8, w: 0.9, lean: 0.15 },
  { len: 0.9, w: 1, lean: 0.2 }], 0.48);
// The tail's tan root, where it shows from behind inside the curl, under the hook: pale, the paler painted tan, as
// the sheet paints it there (#F0BC8B; DECISIONS 17), fading into the plume's cream below.
const tailBase = smooth([[-12.6, -19.4], [-11.6, -26.6], [-7.6, -30.6], [-2.4, -33.6], [1.2, -32.4], [0.8, -27], [-1.6, -21.4], [-6.6, -18.2]]);

// Paint.

/** The fur's one shade (the front's recipe): the fur's own warm multiply on the rim away from the light and under overhangs. */
const furShade = (group: Shape[], shapes: string[] = [], keep: string[] = [], rim = { inset: 2.5, toLight: 4 }, sd = 2.4) =>
  ({ multiply: C.furShadeBy, rim, shapes, keep, group, blur: sd });
const hipGroup = [body, hind.L, hind.R];
const headGroup = [head, tuft];
/** Under each haunch, deepest at its outer bottom, turning under toward the ground, across the heel with no seam (245). */
const HIP_SHADE = [pathD(ellipse([-31, -3], 19, 9.4, -8)), pathD(ellipse([30, -3], 19, 9.6, 8))];

const backPaint: Paint = {
  fill: C.fur,
  // Broad and soft, as the sheet paints it: the shoulders under the collar, where the neck turns in under it; each
  // haunch's lower half, turning under toward the ground; the right haunch's round, away from the light; and the rim
  // away from the light.
  shade: furShade(hipGroup, ["M-31 -63.6 C-20 -57 20 -57 31 -63.6 L31 -70 L-31 -70Z", ...HIP_SHADE, pathD(ellipse([47, -24], 4, 13, 0))], [], { inset: 2.5, toLight: 4 }, 4.2),
  // The light from the top left on the left haunch's round and the left shoulder.
  highlight: { d: `${pathD(ellipse([-36, -29], 7.5, 11, 10))} ${pathD(ellipse([-27, -52], 5, 3.4, -30))}`, colour: C.light, opacity: 0.3, blur: 4.5 },
};
/** Where the saddle's strip wraps round the left flank, the body's line lies on the tan (246). */
const onFlank = (p: P): "cream" | "tan" => (p[0] < -33 && p[1] > -55.5 && p[1] < -39.6 ? "tan" : "cream");
/**
 * The body's lines (parts/lines.ts; DECISIONS 242, 245): down each shoulder from under the collar's end, over the step
 * and the notch where the haunch's round begins, round the haunch to the heel's notch, where it meets the heel's line;
 * the haunch's underside over the heel unlined, as the sheet draws it (a notch, the heel's line running on round the
 * bun), cited by its length; and along the ground from heel to heel, the ground's dark under the middle of the run.
 * The shoulders' lines are the sheet's darker brown (L* 47 to 58 on the left, 55 to 68 on the right; a floor of 0.3, where
 * 0.45 read 42 to 50), the haunches' lighter than the light rule's, as the sheet's are (a ceiling: 65 to 71 on the left,
 * 61 to 68 and 54 to 61 down the right's round; the rule's read 58 to 64 and 51 to 61).
 */
const COLLAR_BODY = { L: crossing(body, collar, [-28.6, -63.2]), R: crossing(body, collar, [29.6, -63.2]) };
const UNDERSIDE_PT = { L: along(body, HEEL.L.notch, HEEL.L.meet), R: along(body, HEEL.R.meet, HEEL.R.notch) };
const shoulderUnder = (p: P) => (p[1] < -40 ? 0.3 : 0);
/** Round each haunch the sheet's line is lighter than the light rule's: L* 65 to 71 on the left, 60 to 72 down the right's round and 54 to 61 low on it. */
const haunchMost = (p: P) => (p[1] < -40 || p[1] > -16 ? 1 : p[0] < 0 ? 0 : p[1] < -26 ? 0.1 : 0.3);
const bodySpans: LitSpan[] = weighed(SEED.body, [
  { from: COLLAR_BODY.L, to: HEEL.L.notch, ends: ["under", "join"], on: onFlank, under: shoulderUnder, most: haunchMost, cites: 245, bare: [0, UNDERSIDE_PT.L + 0.5] },
  { from: HEEL.L.meet, to: HEEL.R.meet, ends: ["join", "join"], ground: "sole", cites: 245, bare: [UNDERSIDE_PT.L + 0.5, UNDERSIDE_PT.R + 0.5] },
  { from: HEEL.R.notch, to: COLLAR_BODY.R, ends: ["join", "under"], under: shoulderUnder, most: haunchMost, cites: 245, bare: [UNDERSIDE_PT.R + 0.5, 0] },
]);

const hindPaint: Paint = { fill: C.fur, shade: furShade(hipGroup, HIP_SHADE, [], { inset: 2.5, toLight: 4 }, 4.2) };
/** A heel's line: from under the haunch at its notch round the bun onto the ground, where it joins the bottom's line on a shared point (245). */
const hindSpans = (side: "L" | "R"): LitSpan[] => weighed(SEED.hind[side], [side === "L"
  ? { from: HEEL.L.notch, to: HEEL.L.meet, ends: ["under", "join"], ground: "sole", most: 0.35 }
  : { from: HEEL.R.meet, to: HEEL.R.notch, ends: ["join", "under"], ground: "sole", most: 0.35 }]);

/** The shade under each of the plume's clumps, where it tucks under the one above, and the plume's foot. */
const tailShades = tailLocks.map(({ tip, notches }) => {
  const [, b] = notches, mid = v.mul(v.add(tip, b), 0.5);
  const inward = v.norm(v.sub([12, -24], mid));
  const c = v.add(mid, v.mul(inward, 2.2));
  const ang = (Math.atan2(b[1] - tip[1], b[0] - tip[0]) * 180) / Math.PI;
  return pathD(ellipse(c, 4.6, 1.9, ang));
});

const tailPaint: Paint = {
  fill: C.fur,
  // Its right side and foot away from the light; under each clump where it tucks under the one above; and in the
  // hook's inner bend, where the curl rolls over the saddle.
  shade: { multiply: C.furShadeBy, rim: { inset: 2, toLight: 3.4 }, shapes: ["M-12 -4 C-2 0 14 -1 28 -7 L28 1 L-12 1Z", ...tailShades], blur: 2 },
  highlight: { d: `${pathD(ellipse([8.6, -44], 7.6, 3.6, -8))} ${pathD(ellipse([-4, -12], 4.4, 6, 0))}`, colour: C.light, opacity: 0.4, blur: 2.8 },
  // One fur stroke under the curl's top, where its lock lies over the plume.
  inner: [{ pts: curve([[23.2, -45.6], [21.9, -43.8], [21, -42.2]], 6), width: 0.7, colour: C.softLine, opacity: 0.7 }],
};
/**
 * Where each of the plume's lobes lies over the one below, the sheet's line runs on past the notch into the plume, the
 * upper lobe's own outline hooking in over the lower one's top and thinning out (DECISIONS 283): from the upper notch a
 * short tick (the crop's line on 1 pt past it), from the middle one 3.5 pt down and in (to (24.5, -15.7) on the crop),
 * and from the lowest a long hook, 5 pt, nearly level, in over the foot's lobe (to (16.7, -7.85)); each as dark and as
 * wide as the outline it runs on from, starting 0.6 pt back up that outline inside its ribbon so it grows out of the
 * line, never floats, and tapering out where it ends. Typed from each notch as laid out (`tailLocks`), so they move with
 * the lobes. The faint partings 0.75 pt wide in the soft line that stood there read as nothing at phone size.
 */
const PLUME_HOOKS: { at: number; pts: P[]; tone: number }[] = [
  { at: 0, pts: [[0.25, -0.55], [0, 0], [-0.8, 0.7], [-1.5, 1.5]], tone: 0 },
  { at: 1, pts: [[0.35, -0.5], [0, 0], [-1, 0.6], [-2, 1.3], [-2.8, 2.1]], tone: 1 },
  { at: 2, pts: [[0.55, -0.3], [0, 0], [-1.3, 0.35], [-2.9, 0.5], [-4.4, 0.6]], tone: 1 },
];
function plumeHooks(box: Box): Piece {
  const hooks = PLUME_HOOKS.map(({ at, pts, tone }) => {
    const n = tailLocks[at]!.notches[1];
    return { ...tapered(curve(pts.map((p) => v.add(n, p)), 6), 1.3, "outer", "plume hook", { taper: 1.2, tip: 0.15 }), tone };
  });
  return piece(hooks.map((h) => `<path d="${h.d}" fill="${LINES.cream[h.tone]}"/>`).join(""), box, { shapes: [], lines: hooks.map((h) => h.line) });
}
/**
 * The tail's line (parts/lines.ts; DECISIONS 242, 246), where the sheet draws one, and as light as it draws it: from its
 * left side under the hook, over the hook's tip (the cream ladder's 0.3 there, the sheet's L* 59 to 61, where the tan
 * ladder's lightest read 54), under the hook and up to the curl's inner bend, where the plume lies over the saddle (the
 * sheet's L* 52 to 60 there, the tan ladder's lightest); then none up the curl's left side above
 * y -37.5 and round the curl's top over the saddle to x 21.6, where the sheet's cream meets the saddle's tan with no line
 * (its darkest within 3 L* of the tan's 71 to 74 at x 3 to 20, 67 up the curl's side); then from where the plume leaves
 * the saddle (x 21.6) down its right side in the cream ladder's lightest (the sheet's 66 to 75 above y -26), a little deeper
 * over the lower clumps (63 to 67), deepening only at its foot on the ground, where it lies over the bottom's own line
 * as the sheet's one ground line there, as the bottom's own does: the ground's dark only under the middle of the foot,
 * the line thinner and more varied round it (L* 50 to 55 from x 0 to 13.5; at the line rule's full depth all along the
 * foot it read 10 L* dark and 0.2 pt wide, the line check's tone and width there); to its left side above the ground.
 * Up its left side over the left haunch, from y -9.2 to -20.6, the sheet leaves the plume unlined too (its L* 83 to 95
 * there; its line fades in below, 72 by y -8). Two spans, each unlined stretch cited by its length (246).
 */
/** Over the saddle, the hook's underside in from its tip (x -7.5 on): the tan ladder's lightest. */
const overSaddle = (p: P) => p[0] < 1.4 && p[0] > -7.5 && p[1] < -24;
const tailMost = (p: P) => (p[1] > -5 ? 1 : overSaddle(p) ? 0 : p[0] < -7.5 && p[1] < -20 ? 0.3 : p[1] < -26 ? 0 : 0.1);
const tailOn = (p: P): "cream" | "tan" => (overSaddle(p) ? "tan" : "cream");
/** Where the sheet leaves the plume unlined: up its left side over the haunch, and over the saddle from the curl's side round its top. */
const TAIL_SIDE: [P, P] = [[-11.1, -9.2], [-11.4, -20.6]];
const TAIL_TOP: [P, P] = [[0.8, -37.5], [21.6, -46.5]];
const SIDE_PT = along(tail, TAIL_SIDE[0], TAIL_SIDE[1]), TOP_PT = along(tail, TAIL_TOP[0], TAIL_TOP[1]);
const tailSpans: LitSpan[] = weighed(SEED.tail, [
  { from: TAIL_SIDE[1], to: TAIL_TOP[0], ends: ["free", "free"], contact: true, most: tailMost, on: tailOn, cites: 246, bare: [SIDE_PT + 0.5, TOP_PT + 0.5] },
  { from: TAIL_TOP[1], to: TAIL_SIDE[0], ends: ["free", "free"], contact: true, ground: "sole", most: tailMost, on: tailOn, cites: 246, bare: [TOP_PT + 0.5, SIDE_PT + 0.5] },
]);
const headLight = `${pathD(ellipse([-9, -140], 15, 9, -10))}`;
const WHORL: P = [2, -151.6];
/** The crown's whorl under the topknot's V: long soft strokes parting from it, combed down and out over the head's upper third, some toward the ears' roots. */
const whorl: { pts: P[]; light: boolean }[] = [
  { pts: [WHORL, [-1.6, -146], [-5.4, -139], [-8.4, -131]], light: false },
  { pts: [WHORL, [4.4, -146], [7.6, -139.4], [9.4, -132]], light: false },
  { pts: [WHORL, [-4.4, -149.6], [-12, -145.6], [-19, -139.4]], light: false },
  { pts: [WHORL, [7, -149.2], [14.6, -145], [21.4, -139.4]], light: false },
  { pts: [[-8, -148.8], [-16.4, -146.4], [-24, -142.6], [-28.6, -139.4]], light: false },
  { pts: [[11, -148.6], [19.4, -146.4], [26.6, -142.6], [30.6, -139.4]], light: false },
  { pts: [WHORL, [1.4, -145], [0.6, -137], [0.4, -128]], light: true },
  { pts: [WHORL, [-2.8, -147.6], [-9, -141.4], [-13.6, -134.4]], light: true },
  { pts: [WHORL, [5.6, -147.6], [11.6, -141.6], [15.6, -134.6]], light: true },
];

const headPaint: Paint = {
  fill: C.fur,
  under: whorlStrokes(),
  // Low on the back of the head, where it warms toward the collar and turns under it; and the rim away from the
  // light. The crown stays light out to its line, as the sheet paints it.
  shade: furShade(headGroup, ["M-41 -92 C-32 -78 -14 -75 0 -75 C14 -75 32 -78 41 -92 L41 -60 L-41 -60Z"], ["M-50 -172 L50 -172 L50 -138 L-50 -138Z"], { inset: 3, toLight: 4.5 }, 3.6),
  highlight: { d: headLight, colour: C.light, opacity: 0.32, blur: 6 },
};

/** The whorl's strokes: soft tone in the cream, a little darker and a little lighter than the fill, no line ends. */
function whorlStrokes(): string {
  const f = uid("blur");
  const box: Box = [-34, -156, 68, 30];
  const strokes = (light: boolean) => whorl.filter((w) => w.light === light)
    .map((w) => strokeOf(curve(w.pts, 6), light ? 1.4 : 1.1, { taper: 4, tip: 0.1, wobble: 0.1, seed: 3 }).d).join("");
  return `<defs>${blur(f, pad(box, 3), 0.9)}</defs><g filter="url(#${f})">` +
    `<path d="${strokes(false)}" fill="${C.furShade}" opacity="0.75"/><path d="${strokes(true)}" fill="${C.light}" opacity="0.25"/></g>`;
}

/**
 * The head's line, where the sheet draws one, by the line rule (parts/lines.ts) and headFur(): the crown's line from
 * under each of the topknot's feet over its two locks, on into the ear's outer line where the two cross; none over the
 * ear's root, where the crown's locks hang over the tan, nor down the head's side above y -120.6, as the sheet's (the
 * root's stretch, cited by its length, 214, 243); then down each side over the ear, on the tan, to the notch, where the
 * ear's own line comes out and takes it on into the hem, and on round the lobe's corner, down its diagonal, under the
 * collar's end (282). Crisp on its outside (212).
 */
/**
 * Over the right ear's root, from where the crown's line meets the ear's to the first lock's tip, the sheet paints the
 * crown's line in a light warm tan (#C2A07B, #CAA27F; L* 65 to 80, C* 20 to 35) that neither ladder holds, and phase 2's
 * right ear root sits on it (DECISIONS 105, which stands): this one stretch keeps the sheet's colour, typed over the lit
 * line, turning from the lit cream tone to the root's tan along the lock.
 */
const ROOT = { R: uid("root") };
const rootLine: Outline = { colour: C.rootTan, width: 1.45, taper: 1.2, blur: 0.15, spans: [{ from: JOIN.R, to: [37, -151.4], colour: `url(#${ROOT.R})`, width: 1.6 }] };
const rootGradient = (id: string, from: P, to: P) =>
  `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${from[0]}" y1="${from[1]}" x2="${to[0]}" y2="${to[1]}">` +
  `<stop offset="0.5" stop-color="${LINES.cream[0]}"/><stop offset="0.85" stop-color="${C.rootTan}"/></linearGradient>`;

/*
 * No feather over the roots (headFur's soften(), HEAD_FUR.soft): from behind the sheet ends the crown's cream over
 * each root's tan in a defined edge, from L* 91 to 76 within 1 pt at x -37 and 3 pt at 37, the tan full at once below
 * it; the recipe's band (3 pt wide, 0.8 pt out over the tan, σ 0.9) and every narrower one tried (0.35 pt out at 0.6;
 * centred, 1.6 pt wide, σ 0.6) read as a pale smudge 3 to 6 pt deep on the ear's top, which the line check measures as
 * a light seam along the locks (7.5 pt on the left, 10.5 to 11.3 on the right; none without it). Down the head's side
 * the sheet paints the head's tan band against the ear's tan with no cream between (90). 243.
 */

function headLinePiece(): Piece {
  const box = boxOf(head, 4);
  const r = litEdge(head, [...weighed(SEED.crown, fur.spans()), ...sideSpans], "head.line", box, { reach: 0.5, crisp: true }), root = ribbons(head, rootLine, "head.line", 0.5);
  // Under each first lock's tip the outline itself curls back in, where the lock lies over the next, as the sheet draws
  // it: from the notch between the two locks the line runs on in under the first lock, 4 to 6 pt, as dark as the
  // outline there (the sheet's L* 64 to 77 along it, at y -150.3 from x -30.5 to -26 on the left and -148.3 to -149 from
  // x 38 to 34 on the right), its start inside the outline's own ribbon, so it grows out of the line, never floats.
  const f = uid("blur");
  const hooks = [[[-31.7, -150.7], [-29.8, -150.5], [-27.6, -150.4], [-26.2, -150.7]], [[39.7, -148.1], [38, -148.5], [36, -148.5], [34.2, -149]],
    // Under each lowest lock's tip, over the ear's root, the sheet's line curls in the same way along the lock's underside,
    // 3 to 4 pt, then leaves the rest of the root's edge unlined (its L* 59 to 67 at x -40 to -38 and 42 to 43); on the
    // right in the root's light tan, as the crown's line there (105).
    [[-41.3, -143.9], [-40.2, -143.6], [-38.6, -143.1], [-37.4, -142.8]], [[43.6, -143.7], [42.6, -143.6], [41.2, -143.3], [40, -143]]]
    .map((pts) => tapered(curve(pts as P[], 6), 0.9, "inner", "crown lock", { taper: 1.2, tip: 0.15 }));
  return piece(`<defs>${r.defs}${blur(f, pad(box, 2), 0.15)}${rootGradient(ROOT.R, [35.4, -152.4], [40.6, -148.4])}</defs>${r.body}` +
    `<g filter="url(#${f})">${root.svg}</g><g fill="${LINES.cream[1]}" filter="url(#${f})">${hooks.map((h, i) => `<path d="${h.d}"${i === 3 ? ` fill="${C.rootTan}"` : ""}/>`).join("")}</g>`, box, {
    shapes: [{ name: "head.line", nodes: head.typed, segs: head.segs, outlined: [...r.outlined, ...root.outlined], fur: head.fur.map(([a, b]) => [fracAt(head, a), fracAt(head, b)]) }],
    lines: [...r.lines, ...root.lines, ...hooks.map((h) => h.line)],
  });
}

/**
 * An ear's paint (parts/ear.ts, the shared recipe; DECISIONS 244): the tan lighter at its top and deepening to its
 * hem, a few soft locks of uneven length fanning out with the ear's droop into the hem's tips, the head's shade along
 * its inner edge where it tucks under the head's side, and a soft light high on its outer side. Typed for the left
 * ear (the viewer's left) and mirrored for the right.
 */
function earPaint(side: "L" | "R"): Paint {
  const k = side === "L" ? 1 : -1;
  const flip = (pts: P[][]) => (side === "L" ? pts : flipX(pts));
  const locks = flip([[[-59.6, -114], [-65, -103], [-69.4, -92], [-72, -84]], [[-55.6, -106], [-59.2, -95], [-61.8, -84], [-62.6, -74]],
    [[-50.2, -100], [-52.8, -91.6], [-54.8, -80]], [[-46.2, -96], [-47.4, -86], [-48.2, -74]], [[-70.2, -100], [-72, -92], [-73.6, -85]]]);
  const innerD = side === "L" ? "M-38 -132 C-42.6 -118 -43.4 -100 -42.4 -84 L-34 -84 L-34 -132Z" : "M38 -132 C42.6 -118 43.4 -100 42.4 -84 L34 -84 L34 -132Z";
  const lightD = side === "L" ? pathD(ellipse([-60, -118], 6, 13, 35)) : pathD(ellipse([48, -128], 5, 10, 32));
  const paint = earFur({
    ear: ears[side], axis: [[-k * 48, -140], [-k * 56, -68]], deepen: [0.5, 1.15], locks, dips: [], light: lightD, under: [innerD], edge: edges[side],
  });
  // From each notch of the hem a parting rises into the ear between the two locks, up the ear's droop, in the ears' deep
  // line, as the sheet draws it (DECISIONS 244): the outer lock's inner edge, the sheet's dark stroke straight up from its
  // notch (x -70.5 from y -82 to -91 on the left, 69.9 from -81 to -90 on the right), and fainter ones 4 to 6 pt long
  // over the others.
  const up = v.norm(v.sub([-k * 48, -140], [-k * 56, -68]));
  const partings = edges[side].notches.map((n, i) => {
    // The outer lock's inner edge runs straight up from its notch, leaning a little out, 11 pt (the sheet's at x -70.5
    // and 69.9 up to y -91 on each ear, L* 44 by -83 fading to 62 by -91); the others follow the droop, 4.4 pt and
    // faint (282: at 5.2 pt and 0.7 they read at phone size as two more stripes down the ear, where the sheet's are faint).
    if (i === 0) return { pts: curve([n, v.add(n, [-k * 0.45, -5.5]), v.add(n, [-k * 0.7, -11])], 6), width: 0.9, colour: C.earLine, opacity: 1 };
    return { pts: curve([n, v.add(n, v.mul(up, 2.2)), v.add(v.add(n, v.mul(up, 4.4)), [k * 0.4, 0])], 6), width: 0.75, colour: C.earLine, opacity: 0.45 };
  });
  return { ...paint, under: (paint.under ?? "") + earWarmth(side), inner: [...(paint.inner ?? []), ...partings] };
}

/**
 * The ear's warmth (DECISIONS 282): the sheet paints each ear a deeper, warmer tan than the recipe's from high on it
 * down (L* 71.6, a* 17.9, b* 33.9 from y -125 to -115 and 68.8, 19.7, 34.7 from -105 to -95 on the left, against our
 * 73.3, 14.7, 29.4 and 70.4, 15.9, 30.8), its fur strokes faint in it; ours, paler, read at phone size as a beige ear
 * striped by its locks. The ears' deep tan laid over the recipe's paint, under its shade and its light, warms it and
 * sinks the locks into it, most down the middle of the ear, less at its lit top, deepening to the deeper tan at the hem.
 */
function earWarmth(side: "L" | "R"): string {
  const [x0, y0, x1, y1] = bbox(ears[side].segs), g = uid("warm");
  return `<defs><linearGradient id="${g}" gradientUnits="userSpaceOnUse" x1="0" y1="${y0}" x2="0" y2="${y1}">` +
    `<stop offset="0" stop-color="${C.earDeep}" stop-opacity="${EAR_WARMTH[0]}"/><stop offset="0.45" stop-color="${C.earDeep}" stop-opacity="${EAR_WARMTH[1]}"/>` +
    `<stop offset="1" stop-color="${C.earDeeper}" stop-opacity="${EAR_WARMTH[2]}"/></linearGradient></defs>` +
    `<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" fill="url(#${g})"/>`;
}
/** How much of the ears' deep tan lies over the recipe's paint: at the ear's top, a little below its middle, and of the deeper tan at its hem. */
const EAR_WARMTH = [0.3, 0.55, 0.45] as const;

/**
 * An ear's line (earEdge's one span, DECISIONS 215, 244): from where the crown's line joins it, down its outer edge, round
 * the hem's tips, and up its inner side under the head; down the middle of its outer edge (y -112 to -86) no deeper than
 * the sheet's there (its darkest L* 49 to 56 on both ears, where the deepening read 44 to 47), the hem's deep line as it was.
 */
const earMost = (p: P) => (p[1] > -112 && p[1] < -86 && Math.abs(p[0]) > 60 ? 0.1 : 1);
const earSpans = (side: "L" | "R"): LitSpan[] => weighed(SEED.ear[side], [{ ...edges[side].span, from: JOIN[side], most: earMost }]);

/**
 * The tail's cast shadow on the haunches (spec L396; on the tail's bone, clipped to the body): the tail's own shape
 * moved down and a little away from the light, soft, in the fur's warm shade, so it shows under the tail's foot, as
 * the sheet paints it, and hardly beside it.
 */
function tailOnBody(): Piece {
  const [x0, y0, x1, y1] = bbox(tail.segs);
  const f = uid("blur"), m = uid("mask"), box = pad([x0 + 1.2, y0 + 2.4, x1 - x0, y1 - y0], 1), canvas = pad(box, 6);
  // It lies on the fur, never on the body's line: kept off a band along the body's edge as wide as the line is inside
  // it, where it would pale the bottom's line under the tail's foot (the line check's tone there, 12 L* light).
  const off = `<rect ${region(canvas)} fill="#fff"/><path d="${pathD(body.segs)}" fill="none" stroke="#000" stroke-width="${2 * LIMITS.outer[1]}"/>`;
  return piece(`<defs>${blur(f, canvas, 2)}${mask(m, canvas, off)}</defs><g mask="url(#${m})"><g filter="url(#${f})"><path d="${pathD(tail.segs)}" transform="translate(1.2 2.4)" fill="${C.furShade}" opacity="0.75"/></g></g>`,
    canvas);
}

// The ears' soft contact shadow on the head (DECISIONS 25, 77, 90): the warm band
// inside the head's side, in the head patches' paler tan deepening to the ears'
// tan at the head's edge, as the sheet paints it (#E6B280 to #F2B589 there): from
// the crescent under the crown, where the ear's tan shows below the crown's
// locks, down to y -86; its inner edge, where the cream lies over it, a soft wave
// (x -33.6 at y -126, -35.8 at -121, in to -32.2 from y -116 to -102, out to -37.4
// by -88), as the sheet's; typed with bleed past the head's edge, which the
// head's clip takes off. Its top tints the lowest of the crown's locks over the
// root a little (L* 86 to 90 against the sheet's 91 to 96 there): kept, since it is
// what joins the root's tan to the crown's line, where phase 2's ear roots lie (89);
// with the locks clean the finder reads each root 4.8 and 8.9 pt low. The right band is typed from its own side of the crop,
// which stands further out (the cream to 33.6 to 36.8 from y -132 to -120, 33.6 to
// 34.4 down the side, 36.8 by -93), its tan deepening out to the side's line at x 41.
const earShadowL: Node[] = [[-44, -146], [-38.6, -143], [-33.8, -139.4], [-30.4, -137.6], [-30.6, -132.4], [-33.9, -126.6], [-35.1, -123.2], [-35.5, -120.2],
  [-34.2, -118.2], [-32.9, -116.2], [-32.7, -113.4], [-32.8, -109], [-32.2, -102.6], [-33.2, -98], [-35.6, -92.6], [-37.4, -88.2], [-39.6, -85], [-46, -90], [-46, -130]];
const earShadowR: Node[] = [[44, -146], [37.8, -142.8], [33.8, -139.6], [31.2, -137.6], [34.4, -132.4], [35.2, -126.6], [36.4, -122.8], [37.3, -119.8],
  [36.2, -117.6], [35.1, -115.9], [34.9, -113.4], [35, -109], [34.6, -103], [35.4, -99], [36.8, -95.6], [37.6, -92.4], [38, -88.2], [39.6, -85], [46, -90], [46, -130]];
/**
 * The tuft's tip in each band's edge (DECISIONS 282): the cream's lowest lock reaching out over the tan to a soft point
 * at y -120.2 on the left and -119.8 on the right, its underside going back in along a diagonal over 4 pt, as the
 * sheet's (where its b* crosses 20, the cream's edge stands at x -35.1 by y -120 and comes back in to -33.7 by -117.7
 * and -32.7 by -116.1; on the right 37.1 by -119.3, 36.2 by -117.7 and 35.2 by -116.1), never the right-angled step
 * typed before (its tip at y -117.2, 1.4 pt further out, its underside cut back in within 1 pt).
 */
const TUFT_TIP = 7;
const earShadow = { L: smooth(earShadowL, { corners: [TUFT_TIP] }), R: smooth(earShadowR, { corners: [TUFT_TIP] }) };
/**
 * How soft each band's edge is, σ in points (282): the sheet's cream fades into the band over 2.5 to 4.5 pt (b* from 31
 * to 14 over x -36.7 to -34.3 at y -122, 33 to 11 over -35.9 to -31.2 at -112), and with the tuft's underside a diagonal
 * the edge can be as soft as that without smoothing the step away (the 0.6 that kept the right angle's corner read hard).
 */
const BAND_SOFT = 0.85;
/** Where each band is the ears' tan (at the side's line) and where it has paled to the head patches' tan. */
const BAND = { L: [-39, -33], R: [41, 35] };
function earOnHead(side: "L" | "R"): Piece {
  const s = earShadow[side], [x1, x2] = BAND[side];
  const box = boxOf(s, 0), g = uid("band"), f = uid("blur");
  return piece(`<defs>${blur(f, pad(box, 3), BAND_SOFT)}<linearGradient id="${g}" gradientUnits="userSpaceOnUse" x1="${x1}" y1="0" x2="${x2}" y2="0">` +
    `<stop offset="0" stop-color="${C.marking}"/><stop offset="1" stop-color="${C.patch}"/></linearGradient></defs>` +
    `<path d="${pathD(s.segs)}" fill="url(#${g})" opacity="0.95" filter="url(#${f})"/>`, pad(box, 3));
}

/** A marking's brushed edge (parts/marking.ts, DECISIONS 217, 246): strands combed along the fur, from a fixed seed per marking, and a few darker strands inside. */
const brushed = (name: string, on: Shape, patch: Shape, soft: number, seed: number, flow: P | ((p: P) => P), edge: number, inside: number) =>
  brush(name, on, patch, soft, { flow, seed, edge, out: [0.8, 1.8], in: [0.6, 1.4], width: [0.7, 1.1], colour: C.marking,
    inside: { count: inside, length: [4, 8], colour: C.earDeep, opacity: 0.25, width: 0.75 } });
/** The fur over the back runs down and out from the spine; over the flank it runs down the side. */
const backFlow = (p: P): P => [Math.sign(p[0] || -1) * 0.45, 1];

export function back(): Drawn[] {
  const out: Drawn[] = [];
  const add = (name: string, p: Piece, state?: string) => out.push({ part: name, piece: p, ...(state ? { state } : {}) });
  // The ground shadow (parts/shadow.ts, DECISIONS 218, 247): a broad soft oval reaching past both haunches, as the
  // crop paints it (about 20/255 under its card from x -61 to 64, from y -12 to 2), darkest under the heels and the
  // tail's foot.
  add("shadow", groundShadow({ reach: [-61, 64], lift: 5, depth: 7, presses: [{ x: -40, half: 6 }, { x: 39, half: 6 }, { x: 4, half: 8 }] }));
  for (const side of ["L", "R"] as const) add(`hind.${side}`, lineGate(roomy(litPart(`hind.${side}`, hind[side], hindPaint, hindSpans(side)), 6)));
  for (const side of ["L", "R"] as const) add(`ear.${side}`, lineGate(litPart(`ear.${side}`, ears[side], earPaint(side), earSpans(side))));
  add("head.base", part("head.base", head, headPaint));
  add("shadow.ear.L", earOnHead("L"));
  add("shadow.ear.R", earOnHead("R"));
  add("head.line", lineGate(headLinePiece()));
  const lobes = litPart("tuft", tuft, {
    fill: C.fur,
    // The lobes' undersides where they sit on the crown, and the rim away from the light.
    shade: { multiply: C.furShadeBy, rim: { inset: 3, toLight: 4.5 }, group: headGroup, shapes: ["M-16 -152.6 C-10 -155.4 -2 -155 2.4 -153.2 C6 -155.6 14 -155.6 20 -153 L20 -150 L-16 -150Z"],
      keep: ["M-40 -168 L40 -168 L40 -157.4 L-40 -157.4Z"], blur: 1.2 },
    highlight: { d: `${pathD(ellipse([-8.6, -160.6], 4.6, 2.2, -10))} ${pathD(ellipse([11.4, -159.8], 4.6, 2, 6))}`, colour: C.light, opacity: 0.45, blur: 1.6 },
    feather: { from: [0, -150.8], to: [0, -154.6] },
    // One line round both lobes and into the notch between them, from where the left lobe meets the crown's line to
    // where the right one does, joining it at each foot; its base on the crown unlined and feathered, as the sheet
    // draws it (242), cited by its length. Crisp (262, 281): no blur, so the lobes' outer edge is the clip's own, and no
    // deeper than the crisp topknot's ceiling, the band's thin light end; each foot and the notch turn into a tuck.
  }, [{ from: [-16.6, -155.4], to: TUFT_FOOT_R, ends: ["join", "join"], most: CRISP.most, weight: { seed: SEED.tuft, amount: TUFT_WEIGHT }, cites: 242, bare: [0, along(tuft, TUFT_FOOT_R, [-16.6, -155.4]) + 0.5] }], { blur: 0 });
  add("tuft", lineGate(join(lobes, tucks(lobes.box))));
  add("body.back", lineGate(roomy(litPart("body.back", body, backPaint, bodySpans), 1)));
  // The saddle's left half, its edge brushed, a few darker strands in it following the back's round; its strip on the
  // left flank, inside the body's line; its right half over the spine above the tail.
  const onBody = { shape: body, paint: backPaint, spans: bodySpans };
  add("back.patch.L", lineGate(join(litMarking("back.patch.L", onBody, saddleL, { fill: C.marking, blur: 0.4 }), litMarking("back.patch.L", onBody, flankL, { fill: C.marking, blur: 0.5 }),
    brushed("back.patch.L", body, saddleL, 0.4, 2401, backFlow, 26, 4))));
  add("back.patch.R", lineGate(join(litMarking("back.patch.R", onBody, saddleR, { fill: C.marking, blur: 0.4 }), brushed("back.patch.R", body, saddleR, 0.4, 2402, backFlow, 14, 1))));
  add("shadow.tail", tailOnBody());
  const plume = litPart("tail", tail, tailPaint, tailSpans);
  add("tail", lineGate(join(plume, plumeHooks(plume.box))));
  const onTail = { shape: tail, paint: tailPaint, spans: tailSpans };
  add("tail.base", lineGate(join(litMarking("tail.base", onTail, tailBase, { fill: C.patch, blur: 0.9, fade: { from: [-5, -21.8], to: [-4, -17.2] } }))));
  // The collar (the front's recipe, from behind): the band's blue, a lighter stripe along its top toward the light and
  // a few faint painted streaks, its lower part in shade where it turns under toward the shoulders, and the front's
  // dark slate rim all round, heavier along its underside, as the sheet draws it (247).
  const streaks = [[[-24, -69.8], [-8, -72], [10, -71.8], [24, -69.6]], [[-20, -67.4], [0, -69], [18, -67.6]]] as P[][];
  add("collar", part("collar", collar, {
    fill: C.collar,
    under: `<path d="${streaks.map((l) => strokeOf(curve(l), 0.8, { taper: 6, tip: 0.1, wobble: 0.2, seed: 2 }).d).join("")}" fill="${C.collarHighlight}" opacity="0.3"/>`,
    // Its lower part in shade, where it turns under toward the shoulders: about two fifths of the band, as the sheet paints it.
    shade: { multiply: C.shadeBy, shapes: ["M-32 -66.2 C-16 -69.2 16 -69.2 32 -66.2 L32 -58 L-32 -58Z", pathD(ellipse([-29.4, -66], 2.6, 6, 0)), pathD(ellipse([31.2, -66], 2.6, 6, 0))], blur: 0.9 },
    highlight: { d: "M-25 -71.2 C-15 -73.6 0 -74.4 16 -73.8 C22 -73.4 25 -72.6 28 -71 L28 -68.6 C20 -71 0 -72 -25 -68.4Z", colour: C.collarHighlight, opacity: 0.4, blur: 0.8 },
    outline: { colour: C.collarRim, width: THIN, taper: 2, blur: 0.2, spans: [{ from: 0, to: 1 }, { from: [24, -63.2], to: [-23.4, -63.2], width: UNDERSIDE }] },
  }));
  return out;
}

/**
 * Points the sheet has no finder for, where this drawing puts them (dev output for the sheet match): each hind paw's
 * heel at the middle of what shows of it (between its outer side and where its sole goes behind the haunch, and
 * between where it comes out from under the haunch and its sole). The seat, on the body's midline at its foot, lies
 * behind the tail's foot in this view, so the sheet match finds the ground itself (DECISIONS 9).
 */
export const landmarks: Record<string, P> = {
  "paw.hind.L": [-42.4, -5.4],
  "paw.hind.R": [41.2, -5],
};
