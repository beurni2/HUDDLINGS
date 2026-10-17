// The dog's front view: shapes first, every node typed by hand in model space
// (points, the ground under the seat at 0, 0, y down) at the extremes and
// inflections read off the front turnaround, then paint. Light groups share one
// light across joined parts (head and tuft, chest and front legs, haunches and
// hind paws); joins are feathered and carry no rim and no line.
import { furEdge, furSpan, STEP, type Lock } from "../../../draw/fur.ts";
import { lineGate } from "../../../draw/lint.ts";
import { bbox, fracAt, mirrorX, pathD, polyD, rotate, sample, smooth, spanPoints, symmetric, v, type Node, type P, type Seg, type Shape } from "../../../draw/geom.ts";
import { mirrorSpans, strokeOf, type DrawnLine } from "../../../draw/line.ts";
import { LIGHT, marking, part, soft, type Paint } from "../../../draw/paint.ts";
import { blur, filter, join, pad, piece, uid, type Box, type Piece } from "../../../draw/svg.ts";
import { model } from "../model.ts";
import { C, LINES } from "../palette.ts";
import { brow } from "../parts/brow.ts";
import { puffedCheeks } from "../parts/cheeks.ts";
import { chevron, eye as sharedEye, lidBand, riding, type Chevron, type EyeSpec, type LidBand } from "../parts/eye.ts";
import { rolledFrame } from "../parts/face.ts";
import { MOUTH_STATES, mouth, oTongue } from "../parts/mouth.ts";
import { stars, type Star } from "../parts/stars.ts";
import { litEdge, litMarking, litPart, type LitSpan } from "../parts/lines.ts";
import { curlShapes, topknot, type Curl } from "../parts/topknot.ts";
import { earEdge, earFur } from "../parts/ear.ts";
import { chinShadow, headFur, type HeadFur, type HeadFurSpec } from "../parts/headfur.ts";
import { toes } from "../parts/paw.ts";
import { brush, type Brush } from "../parts/marking.ts";
import { groundShadow } from "../parts/shadow.ts";
import { tagPaint } from "../parts/tag.ts";

export interface Drawn {
  part: string;
  state?: string;
  piece: Piece;
}

/** Lines on fur spans and small parts: lighter, and never under 1.2 pt (a thinner line is a question for the founder). */
const THIN = 1.2;

/** Lit line spans typed for the dog's right side, mirrored for its left. */
const litSide = (side: "L" | "R", spans: LitSpan[]) => (side === "R" ? spans : (mirrorSpans(spans) as LitSpan[]));
/**
 * A part's canvas grown to hold its shade where the light group reaches past
 * the part, so the part rasterized on its own canvas matches the whole frame
 * (the hind paws, whose light group's rim and blur reach past their edges).
 */
const roomy = (p: Piece, by: number): Piece => ({ ...p, box: pad(p.box, by) });
/** Inner lines typed for the dog's right side, mirrored for its left. */
const flipX = (pts: P[], side: "L" | "R") => (side === "R" ? pts : pts.map(([x, y]): P => [-x, y]));
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
/** The face frame the face's parts are typed in (parts/face.ts): the eyes' midpoint, rolled with them. */
const FRAME = rolledFrame(FC, ROLL_DEG);

// Shapes.

// The haunches and the saddle over the shoulders: their outline is the body's
// silhouette from under the collar's ends down over the shoulder and round the
// haunch to the hind paw, as the sheet draws it, the chest lying in front of
// them a little inside it; the top lies under the chest and the collar. The
// shoulders' fur breaks into a few small locks just below the collar.
// Each haunch bulges out of the flank from a small concave notch, where the shoulder's line meets it (audit front #13;
// DECISIONS 222), as the crop draws it: the flank runs down near straight (its edge at x -37.9 at y -43, -38.85 at -40),
// turns in a notch at (-39.3, -39.2), and the haunch flares out below it (-40.85 at -38, -42.25 at -37, -43.45 at -36;
// the left alike, its notch at (39.6, -39), a little quicker). The notch is a concave corner of the outline, never a
// lock standing out of it: a 0.7 pt step lock there read as a knob, 1 to 1.5 pt outside the crop's flank. The corners
// split the outline's fit into runs, and the run under the belly lies 0.18 pt below its nodes at the slot between the
// front paws (y -1.45 at x ±4 against -1.63), within the fit's 0.2 (a tighter fit shows the shoulder's top under the
// collar's end as a 3.3 pt corner); the slot's line is at the ladder's lightest, so the lower edge reads as the crop's.
const HAUNCH_NOTCH = 11;
const backHalf = symmetric([[0, -54], [-17, -57.6], [-21.4, -61], [-25.2, -63], [-28.8, -61.8], [-30.6, -59.4], [-31.4, -56.6], [-33.4, -53], [-34.9, -50], [-36.4, -46.6], [-37.9, -43],
  [-39.3, -39.2], [-41.3, -37.6], [-43.6, -35.8], [-46.4, -33], [-48.8, -27.4], [-49.6, -21], [-49.2, -15.4], [-47.6, -10.6], [-44.4, -6.8], [-36, -4.8], [-20, -2.4]], [0, -1.6],
{ corners: [HAUNCH_NOTCH, 44 - HAUNCH_NOTCH] });
// Under each collar's end one small low step of fur leaning down the shoulder's line (fur.ts's STEP, DECISIONS 213,
// 222), as the crop draws it ("a thin, smooth brown line with one small fur step"), not a row of teeth.
const SHOULDER: Lock[] = [{ len: 1, width: 5.2, lean: 0.45 }];
const back = [
  (s: Shape) => furEdge(s, [-30.6, -59], [-32.8, -54.6], SHOULDER, 0.3, undefined, STEP),
  (s: Shape) => furEdge(s, [32.8, -54.6], [30.6, -59], lefthandOf(SHOULDER), 0.3, undefined, STEP),
].reduce((s, f) => f(s), backHalf);

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

// The front legs: short chubby legs that come out of the chest side by side under the tag and come together going
// down, as the sheet draws them (the gap between their inner edges about 10 pt at y -30, 5 at -16 and under 2 between
// the paws), so the paws nearly touch over a narrow slot; each comes out from under the shoulder's saddle, its outer
// edge where the sheet draws the leg's fine line against the haunch (x -35.2 at y -41, -31.6 at -21), narrowing a
// little to the wrist (x -29.8 at y -16) and swelling into a round bun of a paw a little wider than the leg (x -30.6 at
// y -12 outside, -1 at -5.4 inside), its sole convex and dipping a little at the two toe lines (concave corners), so
// it rests on the ground in three round toes, as the sheet's does. Its top, hidden in the chest's fur, stays under the
// tag's point and clear of the heart's sides, so the tag hangs in front of the chest whole.
const legR: Node[] = [[-5.8, -33.6], [-4.6, -27.6], [-2.9, -20.6], [-2.3, -13.4], [-1.8, -9], [-1, -5.8], [-2.7, -2.4], [-6.4, -1], [-11.2, -0.9], [-16, -0.2],
  [-20.8, -0.9], [-25, -1.6], [-28.4, -4], [-30.4, -8], [-30.6, -12.2], [-29.8, -16], [-31.6, -21], [-33.6, -28], [-34.8, -35], [-35.2, -41],
  [-33, -47], [-26, -44], [-15, -40.4], [-8.2, -37.4]];
/** The sole's dips at the toe lines (concave, so no corner rule applies). */
const FRONT_TOES = [8, 10];
const legs = { R: smooth(legR, { corners: FRONT_TOES }), L: smooth(mirrorX(legR), { corners: FRONT_TOES.map((j) => (legR.length - j) % legR.length) }) };

// The collar: a band of nearly even width round the neck, following the chin down to a gentle dip at the front, as
// the sheet draws it: about 8.5 pt deep at the front with its rims (the sheet's 8.2 to 8.7 at x -14 to 16) and still
// about 6.5 pt where its blunt ends pass behind the cheeks' fur (the sheet's at x -25 and 25), never a crescent tapering
// to horns. The sheet's head roll tips it a little: its left end sits higher and reaches 2 pt further out.
const collar = smooth([[-26.6, -62.8], [-21, -61.2], [-10, -59], [0, -58.2], [10, -59.4], [20.5, -62], [26.4, -64], [28.2, -63.2], [28.6, -60.4],
  [28.2, -57.8], [25, -55.6], [18, -52.4], [10, -50.4], [0, -49.8], [-10, -50], [-17, -51.6], [-22.6, -54.2], [-26.2, -56.2], [-27.4, -58.2],
  [-27.6, -60.8]]);

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
const inset = (k: number) => ([x, y]: Node): Node => [x * k, -43.6 + (y + 43.6) * k];
/** The two embossed hearts, at 70% and 44% of the tag about its middle. */
const embossed = [0.7, 0.44].map((k) => shift(symmetric(HEART.map(inset(k)), inset(k)(HEART_FOOT), { corners: [0] }), TAG_X));

// The ears (front a's): droplets hanging from high on the head's sides, narrow
// at the root (tucked under the crown fur), broad and rounded below, their inner
// edges running on behind the face. The hem is typed here as one smooth convex
// curve from the foot round the outer corner, on which earEdge() builds its lock
// tips (DECISIONS 215, 221). The right ear is typed in the head's frame and
// rolled with the face.
const earR: Node[] = [[-37.5, -141.4], [-29.4, -138.6], [-28.2, -132.4], [-40, -86], [-39.4, -73], [-41.4, -66.6], [-46.6, -64], [-52.6, -62.6],
  [-58.6, -63.1], [-65, -65.8], [-71, -69.4], [-76.2, -74.8], [-80.4, -82], [-81, -88.4], [-79.9, -94.6],
  [-78.2, -100.2], [-73.6, -106.2], [-66.8, -111.6], [-60.8, -117.4], [-56, -125.6], [-50.6, -130.8], [-45.4, -135.2], [-42.7, -136.9]];
/** The right ear's node where the left ear's typed upper edge ends (its outer side, at y -82). */
const EAR_SPLIT = earR.findIndex(([x, y]) => x === -80.4 && y === -82);
/** The hem's notches are earEdge()'s now (DECISIONS 221): the typed outline has none. */
const EAR_NOTCHES: number[] = [];
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
const earL: Node[] = [lowerL[0]!, [42, -139.6], [51.4, -132.6], [58.2, -125], [64.6, -116], [70.8, -110], [75, -103.8], [78.6, -96], [79.6, -88], [78.8, -82],
  [76.4, -78.6], ...lowerL.slice(earR.length - EAR_SPLIT + 2)];
// Fitted closely (0.05 pt), so the fit keeps the lobes as round as the typed nodes make them.
// The left ear's lower nodes are the right's in reverse after its 10 typed ones, so a notch at the right's node j is the left's 9 + EAR_SPLIT - j;
// its outer notch is typed in place of the hung one (a smooth turn, so the join stays round).
const ears = { R: smooth(rollN(earR), { corners: EAR_NOTCHES }), L: smooth(earL, { tol: 0.05, corners: EAR_NOTCHES.slice(0, 1).map((j) => 9 + EAR_SPLIT - j) }) };
/** A head-frame place on the dog's right ear, or the same place on its left ear, in model space. */
const onEar = (side: "L" | "R", p: P): P => (side === "R" ? rollP(p) : (hangL([p])[0] as P));
/** Path data on the dog's right ear, or the same on its left (the hang is small enough to leave out of soft paint), rolled. */
const earD = (side: "L" | "R", d: string) => rollD(side === "R" ? d : mirrorD(d));

/** A row of locks typed along one side's path, for the other side, whose path runs the other way: reversed, leaning the other way, each notch's dip kept with it. */
const reversedRow = (locks: Lock[]): Lock[] => locks.map((_, k) => {
  const l = locks[locks.length - 1 - k]!, before = locks[locks.length - 2 - k];
  return { ...l, lean: -(l.lean ?? 0), dip: before?.dip };
});
// Each ear's edge (DECISIONS 215, 221), as the front crop and the floppy-ears panel draw it: four rounded lock tips
// across the hem, of uneven widths, the outer corner's the fullest; and one broad low step a third of the way down the
// outer edge, where the top lobe overlaps the next (fur.ts's STEP). The hem typed on the dog's right ear in the head's
// frame and placed on either ear; the step typed per ear where its crop notches the edge, a small inward kink with the
// edge a little further out below it (the crop's right edge turns in to x -78.1 at y -95 between -78.8 above and
// below, and is out at -80.4 by -92; its left stalls at 75.1 from -104 to -102 and is out at 77.4 by -99; a step 1.5 pt
// high read as a knob), its tip at the lower end.
const EAR_HEM: Lock[] = [{ len: 1.5, width: 9, lean: 0.2, dip: 0.45 }, { len: 1.9, width: 12, lean: 0.25, dip: 0.3 }, { len: 1.4, width: 8.5, lean: 0.3, dip: 0.4 },
  { len: 1.8, width: 10.5, lean: 0.35 }];
const EAR_STEP: Lock = { len: 0.7, width: 7.8, lean: -0.45 };
/** The step's ends, lower then upper, where each ear's crop draws them (in model space, the ears placed). */
const EAR_STEPS = { R: [[-78.8, -95.6], [-74.6, -102.2]] as [P, P], L: [[75.6, -102.2], [72.2, -108.8]] as [P, P] };
/** Where each ear's line goes under the cheek, in model space: on under it at full width, its fade under the cheek's fur. */
const EAR_UNDER = { R: [-38.8, -68] as P, L: [37.1, -71.6] as P };
/**
 * Where the right ear's line goes under the crown, in the head's frame (DECISIONS 267): just past where its outer edge
 * goes under the overhang's tip, so it runs on under the head at full width and fades there, clear of the root's tight
 * top (the left's runs on to the root's top, typed on its own below).
 */
const EAR_ROOT_R: P = [-41.6, -137.9];
function earEdgeOf(side: "L" | "R") {
  const on = (p: P) => onEar(side, p), R = side === "R";
  const [a, b] = EAR_STEPS[side];
  const steps = [R ? { from: a, to: b, lock: EAR_STEP, tipRound: 0.35 } : { from: b, to: a, lock: { ...EAR_STEP, lean: -(EAR_STEP.lean ?? 0) }, tipRound: 0.35 }];
  return earEdge({
    base: ears[side], steps,
    hem: R ? { from: on([-46.6, -64]), to: on([-80.4, -82]), locks: EAR_HEM, tipRound: 0.36 } : { from: on([-80.4, -82]), to: on([-46.6, -64]), locks: reversedRow(EAR_HEM), tipRound: 0.36 },
    axis: [on([-58, -124]), on([-60, -62])],
    // Seen from the front the ear hangs behind the head: its line runs on under the cheek at its foot and under the
    // crown at its root (DECISIONS 210).
    line: R ? { from: EAR_UNDER.R, to: on(EAR_ROOT_R), ends: ["under", "under"] } : { from: on([-38.6, -140.6]), to: EAR_UNDER.L, ends: ["under", "under"] },
  });
}
const EDGES = { R: earEdgeOf("R"), L: earEdgeOf("L") };

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
/**
 * The left cheek against its mirror, as the crop draws it, in the head's frame (the face's roll taken out, 3.1 pt at the
 * cheeks): its puff the right's own (the crop's cream at 42.5, 44.5, 46.5 and 44.2 at y -88.9, -86.9, -82.9 and -80.9,
 * against -42.7, -44.6, -46.5 and -44.4 on the right), its lower part running on 3 pt further down before the jaw (43.5
 * at -73.9 and 41.9 at -70.9, where the right has turned in to -41.5 by -76.1); an offset in x by the head frame's y,
 * eased between the typed rows.
 */
const LEFT_CHEEK: [number, number][] = [[-87, 0], [-84, 0.8], [-81, 0.6], [-78, 0.6], [-75, 1.8], [-72.5, 2.4], [-70.5, 1.2], [-68, 0]];
const leftPuff = ([x, y]: P): P => {
  if (x <= 0 || y <= LEFT_CHEEK[0]![0] || y >= LEFT_CHEEK.at(-1)![0]) return [x, y];
  const k = LEFT_CHEEK.findIndex(([at]) => at > y), [y0, d0] = LEFT_CHEEK[k - 1]!, [y1, d1] = LEFT_CHEEK[k]!;
  const t = (y - y0) / (y1 - y0);
  return [x + d0 + (d1 - d0) * t * t * (3 - 2 * t), y];
};

// The head: a soft round mass with a full crown, widest at the cheeks
// (93.3 pt between the ears' inner edges, DECISIONS 7). At each temple the
// crown's cream fur overhangs the ear's root, its underside a soft shallow arc,
// and under it the ear's tan shows in a soft crescent that rounds off into the
// face's side (the ear roots' landmarks, the tan's highest points, sit in those
// crescents). From there the face's side is a round curve that bows out over
// the ear and in again above the cheek, as the sheet's line draws it (x -42.6 at
// y -120, -45 at -115, -46.5 to -47.3 from -110 to -100 and -45.8 at -93 on the
// right). Below it each cheek is one convex puff over the ear, bulging out to
// x -48.4 at y -81 on the right, its fur headFur()'s (DECISIONS 214, 220), and
// under it the jaw turns round into the chin, a rounded mass over the collar.
// Typed as its right half, mirrored, the crown lifted and the side drawn in on
// the left, and the cheeks rolled with the face. The crown's part under the
// topknot is hidden by it.
const headHalf: Node[] = [[0, -151.8], [-32.4, -146.8], [-37.6, -143.4], [-42.2, -139.6], [-46.2, -133.6], [-40.4, -134.6], [-33, -134.2],
  [-35.4, -130], [-41.6, -120.6], [-45.6, -114.4], [-47, -105], [-45.8, -95.4], [-44.8, -91.6], [-44.8, -86.2], [-44, -80.4],
  [-43.6, -75.6], [-39.6, -70.4], [-30, -64.8], [-9, -59.4]];
/**
 * The crown's overhang and the root's tan under it, on the right: the lock's tip hanging just inside the ear's edge,
 * its underside running in over the root's tan at y -134.6, the tan tapering in under the crown's fur to a soft point
 * at (-33, -134.2), a smooth turn (r 0.3 pt) and no corner, and the face's side running down and out from it, as the
 * front crop draws the root (its L* 85 edge: the top at y -133.9 at x -43, -133.3 at -38 and -134 at the point, x -33;
 * the side at x -34 at y -132, -35.4 at -130 and -37 at -128; a wedge of about 45°; DECISIONS 220).
 */
const TEMPLE = [4, 5, 6];
/**
 * The left temple, typed where the sheet draws it in place of the right's mirror: a shorter overhang, the crown
 * meeting the ear at (41, -140), its underside running in over the ear's tan at y -140 and the tan tapering in under
 * the crown's fur to a soft point at (27.8, -137.8) (a smooth turn, r 1.1 pt), about 4 pt higher and 5 pt further in
 * than the right's (the crop's L* 85 edge: its point at (27.7, -137.3), its top at y -137.6 at x 28 rising to -138.9
 * at 38, its side at x 29.6 at y -135 and 31.9 at -132, a wedge of about 60°; DECISIONS 220); from there the face's
 * side runs down and out in one diagonal to (33.2, -130.2), where the sheet's line begins.
 */
const leftTemple: Node[] = [[41, -140], [35.4, -140.1], [27.8, -137.8], [33.2, -130.2]];
const mirroredHalf = mirrorX(headHalf, false).slice(0, -1);
// The mirror runs from the chin up to the crown, so the right's temple nodes come in reverse; the left's replace the
// face's side above the line, the turn, the lock's underside and its tip.
const at = mirroredHalf.length - TEMPLE[2]!;
const leftHalf = [...mirroredHalf.slice(0, at - 1).map(([x, y]): Node => leftSide(leftPuff([x, y]))), ...[...leftTemple].reverse(),
  ...mirroredHalf.slice(at + TEMPLE.length + 1).map(([x, y]): Node => crownLift([x, y]))];

// The head's fur (parts/headfur.ts, DECISIONS 214, 220), typed from the front crop on the dog's right side and carried
// to its left reversed. Over each ear's root two broad low locks of the crown's cream hang down and out over the tan,
// unlined, as low as headFur's rule lets them (1.2 pt) and leaning toward the root's point, so the cream band over them
// (headLinePiece) covers their tips and they show only as the soft edge's unevenness: the crop paints no locks there,
// only the crown's cream softly over the tan, and longer locks' tips showed as cream beads at phone size. The crown's
// line joins the ear's where their outlines cross.
const CROWN_R: Lock[] = [{ len: 1.25, width: 4.6, lean: -0.5, dip: 0.3 }, { len: 1.2, width: 3.6, lean: -0.55 }];
const CROWN_L: Lock[] = [{ len: 1.2, width: 3.6, lean: 0.55, dip: 0.3 }, { len: 1.25, width: 4.6, lean: 0.5 }];
// Each cheek's puff over the ear, as the crop draws it in the head's frame (alike on both sides): one full lobe, its
// round at y -83 to -82 (x 46.5), and a small low one under a shallow notch (44.4 at -81, 44.5 down to -77), turning in
// to the jaw by -76 (sharper or longer wisps read as teeth beside the sheet's round puff). The small one lies combed
// down along the edge (lean 0.6) and the notch between them is as shallow as headFur's rule lets it (0.3 pt): standing
// out (lean 0.3) over a 0.4 pt notch, the two read as a W pinch at phone size, like lips in profile.
const CHEEK: Lock[] = [{ len: 2, width: 6.6, lean: 0.4, dip: 0.3, notch: 1 }, { len: 1.5, width: 4.6, lean: 0.6 }];
/** The left cheek's row, in its path's order (up from the jaw): the right's reversed, the notch's flow carried with it. */
/** How light the left cheek's line lies in the notch between its wisps (a ceiling on its depth), easing back over `reach` pt. */
const PINCH = { depth: 0.15, reach: 2.5 };
const CHEEK_L: Lock[] = [{ len: 1.5, width: 4.6, lean: -0.6, dip: 0.3, notch: 1 }, { len: 2, width: 6.6, lean: -0.4 }];
// The chin's middle over the collar (x -16 to 16): seven small low scallops, as small as headFur's rules let them (0.8
// to 1 pt out, 4.1 to 5.3 wide), combed down and out from the middle, the jaw's round sides plain on to x ±24; their
// notches shallow (0.1 to 0.2 pt), so the edge reads as the crop's soft arc (its line's place off a smooth arc: 0.24 pt
// rms). Seven scallops 1 to 1.6 pt out over x -24 to 24 read as a wavy ribbon of line at phone size (0.61 pt rms);
// these read 0.51, the ripple finer and kept to the middle. Deeper notches (0.25 to 0.35) read wavy at 10 times.
/** The chin's line at its deepest along the scallops (a ceiling on headFur's notch depth there, 0.55). */
const CHIN_LINE = 0.3;
const CHIN: Lock[] = [{ len: 0.85, width: 5.3, lean: -0.45, dip: 0.15 }, { len: 0.8, width: 4.2, lean: -0.2, dip: 0.2 }, { len: 0.85, width: 5.3, lean: -0.3, dip: 0.1 },
  { len: 0.8, width: 4.2, lean: 0.05, dip: 0.15 }, { len: 1, width: 4.1, lean: 0.35, dip: 0.2 }, { len: 0.85, width: 5.3, lean: 0.2, dip: 0.1 }, { len: 0.8, width: 4.2, lean: 0.5 }];

/**
 * Each root's unlined stretch, where the ear's tan shows in the notch under the crown, in path order: `top` the crown's
 * underside from the overhang's tip in over the root, `side` the notch's inner side down to where the face's line
 * starts. The front crop paints the crown's cream over the root's top softly (L* 96 at y -136, 85 at -134 and 74 at
 * -131 on the right, x -44 to -34; 93 to 84 across x 30 to 36 at -138 on the left) and the root's tan right up to the
 * notch's side (L* 75 at x -38, y -128; 75 at x 36, y -126), never a pale band down the face's side.
 */
const NOTCHES = {
  R: { top: [[-45.9, -133.7], [-33.4, -134.8]] as [P, P], side: [[-33, -134.1], [-39.9, -123.8]] as [P, P] },
  L: { top: [[28.4, -138.8], [39.4, -141]] as [P, P], side: [[33.7, -129.4], [27.8, -137.6]] as [P, P] },
};
/** The crown's cream over each root's top (headLinePiece): how far it reaches in past the head's edge and out past the crown locks' tips, in points. */
const ROOT_CAP = { above: 0.8, below: 0.5 };
/**
 * Each root's point under the crown, where its tan fades out: the way into the tan's wedge from the point (between its
 * top and its side), how far in along it the fade's middle lies and its half-axes, in points.
 */
const ROOT_POINT = { R: { into: [-0.84, 0.55] as P, at: 1.1, r: [1.8, 0.9] }, L: { into: [0.93, 0.36] as P, at: 1.1, r: [1.8, 0.9] } };
/**
 * Where the right cheek's line breaks over its puff, in path order: the front crop's line down the face's side ends at y
 * -85 (L* 49 at x -45.5) and the puff below it is unlined, its cream meeting the ear's tan with no darker line (L* 60
 * then 94 at y -82). The left's puff it lines all round (L* 46 to 55 at x 47 to 48 from y -88 to -76), so the left's
 * line runs on unbroken.
 */
const GAPS = { R: [[-45.1, -86.8], [-44.4, -77.4]] as [P, P], L: [[44.4, -78.8], [44.7, -82]] as [P, P] };
/**
 * Where each cheek's line starts under a raised ear (head.line's temple states, DECISIONS 267), in the head's frame: the
 * temple's outer edge bows out past the head's side above and comes back to it on its way under the head, and the
 * cheek's line starts free on the head's side while the two are still 0.85 to 1.4 pt apart (y -118 on the left, -115.3
 * on the right, placed), so its taper lies along the inside of the temple's line and it is at full width by where they
 * come within 0.45 pt (y -116.6 and -113.6): the temple's line hands over to it with no thin stretch. A free start
 * 1.8 to 3 pt lower, the temple's line by then under the head, left the head's side unlined for 3 pt from y -117 on the
 * left and -114.8 on the right, in every face that raises an ear (the reviewers' 2.2 pt break; the gate counting only
 * what shows, 264). A join there would meet no line in the build's composite of head.line's state alone (no temple).
 */
const RAISED = { R: [-45, -115.7] as P, L: [41.2, -118.05] as P };

/**
 * The head's outline with its fur, and its lines (headFur()). `puff` swells each cheek's puff out sideways by up to
 * that many points (huffy's variant B, review-only: a puffed head.base with a matching head.line), most at the cheek's
 * fullest, about y -82, and not at all above the eyes' foot or under the jaw, so the crown, the temples and the chin
 * stay as they are; every typed place moves with it (headFur's `at`), so the puffed head's fur is the rest's.
 */
function headOf(puff = 0): { head: Shape; fur: HeadFur; notches: Record<"R" | "L", { top: [P, P]; side: [P, P] }>; gaps: [P, P][]; raised: Record<"R" | "L", P> } {
  const swell = ([x, y]: P): P => {
    const t = clamp01((y + 104) / 44), across = clamp01((Math.abs(x) - 22) / 14);
    return [x + Math.sign(x) * puff * Math.sin(Math.PI * t) ** 2 * across, y];
  };
  const at = (p: P) => cheekRoll(swell(p));
  // Each overhang's tip is a lock of the crown's fur, as sharp as the sheet draws it (Q29; DECISIONS 89), where the
  // crown's line runs on into the ear's: on the right, where the crown's line now reaches it (DECISIONS 267).
  const base = furSpan(furSpan(smooth([...headHalf, [0, -58.4], ...leftHalf].map(([x, y]): Node => at([x, y])), { typed: headHalf.length + 1 + leftTemple.length }),
    [-45.7, -135], [-44.8, -134.2]), [39.4, -140.4], [40.2, -141.6]);
  // The face's side over the ear: deep on the tan where it tucks over the ear (DECISIONS 7's #9E5C2C), down to the
  // puff's top (the crop's L* 37 to 50 at x -45.5 from y -92 to -85); round the left's puff the fur's own line, as dark
  // as the crop's there (L* 46 to 55 at x 47 to 48 from y -88 to -76), and on low on the cheek to the jaw (L* 47 to 50).
  const sideLadder = (p: P): "cream" | "tan" => (p[1] < -74 ? "tan" : "cream");
  const sideFace = (p: P) => (p[1] < -74 ? 0.6 : 0.1);
  // The line lies light in the notch between a puff's two wisps (headFur's rule darkens each notch to 0.55), so the
  // notch reads as a soft crease under the full lobe and not as a dark pinch (a W at phone size, like lips in profile).
  // The notches are headFur's own, found once it has laid the wisps (the line is drawn after).
  const pinches: P[] = [];
  const pinch = (p: P) => Math.min(1, ...pinches.map((q) => PINCH.depth + (1 - PINCH.depth) * Math.min(1, Math.hypot(p[0] - q[0], p[1] - q[1]) / PINCH.reach)));
  const spec: HeadFurSpec = {
    base, at,
    crown: [
      { side: "R", from: [-43.4, -134.05], to: [-35.2, -134.85], locks: CROWN_R, tipRound: 0.25, line: { from: [-24, -149.2], to: [-46, -134.4] }, ear: EDGES.R.shape },
      { side: "L", from: [30.6, -139.2], to: [38.8, -140.4], locks: CROWN_L, tipRound: 0.25, line: { from: [41.2, -140.2], to: [19, -150.6] }, ends: ["join", "under"], ear: EDGES.L.shape },
    ],
    cheeks: [
      // From where the face's side comes out of the root's soft overlap, down over the ear to the puff, deep on the tan;
      // the puff's wisps unlined (its gap); a short light line low on the cheek round the last wisp to the jaw, as the
      // front crop draws it. headFur frees the line where it borders the root's and the gap's unlined stretches and
      // cites each by its length (DECISIONS 214).
      { side: "R", from: [-45, -86.2], to: [-44.1, -75.4], clumps: CHEEK, tipRound: 0.22,
        line: { from: [-39.9, -123.8], to: [-39.6, -70.4], ends: ["free", "join"], on: sideLadder, under: sideFace, gap: GAPS.R }, raised: RAISED.R },
      { side: "L", from: [44.6, -76.2], to: [45, -86.2], clumps: CHEEK_L, tipRound: 0.22,
        line: { from: [39.6, -70.4], to: [33.7, -129.4], ends: ["join", "free"], on: sideLadder, under: sideFace, most: pinch, gap: GAPS.L }, raised: RAISED.L },
    ],
    chin: { from: [-16.3, -59.6], to: [16.3, -59.6], scallops: CHIN, tipRound: 0.15, line: { from: [-39.6, -70.4], to: [39.6, -70.4] }, corners: [[-39.6, -70.4], [39.6, -70.4]] },
  };
  const fur = headFur(spec);
  // Each row's notches between its wisps (not its two ends), in path order.
  for (let k = 0; k < fur.tufts.cheeks.length - 1; k++) if ((k + 1) % CHEEK.length !== 0) pinches.push(fur.tufts.cheeks[k]!.notches[1]);
  const placed = (n: { top: [P, P]; side: [P, P] }) => ({ top: n.top.map(at) as [P, P], side: n.side.map(at) as [P, P] });
  return { head: fur.head, fur, notches: { R: placed(NOTCHES.R), L: placed(NOTCHES.L) }, gaps: [GAPS.R].map(([a, b]): [P, P] => [at(a), at(b)]), raised: { R: at(RAISED.R), L: at(RAISED.L) } };
}
const HEAD = headOf();
const head = HEAD.head;

// The topknot (parts/topknot.ts): three separate curls of fur, as the sheet draws them, back to front. The left
// curl low and broad, its crown at y -156.4, its pointed tip at the crown's line (-30.4, -150.2), where the line dips
// into a V and runs on along the curl's underside into the fur, and its other end tucking behind the middle one at
// the notch (-11.6, -153); the right curl a little higher (its crown at y -158), coming out from behind the middle one
// and ending in a V at (21.8, -153), where its underside's stroke runs back into the fur and the crown's line runs on
// down the head; and in front the middle curl, tall and round (its top at y -164.3, the head's highest point), its
// line dipping into the V at its left foot and on down into the fur, its right side coming down into the fur behind
// the right curl's start. Each curl's hidden foot runs along under the crown, feathered into it.
const TUFT_CREASE = uid("blur");
const CURLS: Curl[] = [
  { nodes: [[-30.4, -150.2], [-29.6, -152.8], [-27, -155], [-22.8, -156.3], [-18.2, -156.4], [-14.4, -155.4], [-11.6, -153], [-9.4, -149.6], [-13, -146.6],
    [-22, -146.4], [-27.6, -148.4]],
    line: { from: [-30.2, -150.4], to: [-11.6, -153], taper: [0.6, 1] }, into: [[[-30.6, -150.5], [-27.4, -149.9], [-23.6, -149.4]]], tip: [[-29.6, -149.4], [-30.8, -151.2]] },
  { nodes: [[3, -152], [5.4, -155.8], [8.8, -157.6], [13.2, -158], [17.6, -157.2], [20.6, -155.6], [21.8, -153], [21.2, -150.6], [16, -148.6], [8, -147.6]],
    line: { from: [5.2, -155.6], to: [21.2, -150.8], taper: [1, 0.4] }, into: [[[22, -152.9], [19.2, -152.6], [15.4, -152.2]]], tip: [[22, -153.8], [21.6, -151.6]] },
  { nodes: [[-11.8, -152.6], [-10.4, -156.8], [-7.6, -160.6], [-3.6, -163.4], [0.4, -164.3], [3.4, -163.4], [5.2, -161], [5.8, -158], [4.8, -155.2], [2.4, -151],
    [-4, -147], [-10, -148]],
    line: { from: [-11.8, -152.6], to: [3.6, -152.8], taper: [0.6, 2.4] },
    // A soft crease of the fur's tan down its lower middle, where the curl turns, as the sheet paints it.
    under: `<defs>${blur(TUFT_CREASE, [-8, -162, 10, 16], 0.7)}</defs>` +
      `<path d="${strokeOf([[-1.4, -158], [-2.6, -154], [-3.8, -150.4]], 1.8, { taper: 2.4, tip: 0.3 }).d}" fill="${C.marking}" opacity="0.3" filter="url(#${TUFT_CREASE})"/>`,
    into: [[[-12, -152.9], [-11.2, -151.4], [-10, -150.2]]] },
];
const tuftShapes = curlShapes(CURLS);

// The head patches, as the sheet paints them: a rounded hood over the top and outer side of each eye, its top one
// smooth round arc about 10 pt above the eye with the brow in the cream above it, coming down round the eye's inner top
// on the nose's side so a rim of the tan shows beside the eye there (audit front #6: the hood's top was a bumpy, near
// level band of pre-213 locks, ending in a squarish corner above the eye's inner side); and a band of the same tan
// down the face's side, inside its line, from where the ear's root shows under the crown down to the cheek's puff.
// Between the two a strip of cream comes down from the forehead round the hood's outer top to a point below it, on
// the right from the notch's corner to (-38.2, -111.8), on the left a shorter one to (33.2, -116.6). Measured on the
// crop (DECISIONS 220), the hood's top (its L* 89 edge) on the right runs from (-37, -112.7) up to its crown at
// (-28, -117.8) and down round the eye's inner top through (-20, -114.9), (-17.4, -112) and (-16.2, -109) to (-15.6,
// -106), a tan rim 3 pt wide beside the eye; on the left from (33, -117.8) up to (24, -121.7) and down through (17,
// -119), (14.1, -115) and (12.6, -110) to (12.1, -106). Below the eye and the hood the face is cream. Each is one even
// pale tan, as the front crop paints it (L* 80 to 81 by the eye and by the ear alike), its edge soft all round (σ
// 0.7 pt), the crop's soft arc, never a scallop. Typed per side, as the sheet draws them (the left about 3 pt higher,
// with the head's roll), with about 4 pt of bleed past the head's edge; the eye covers what is typed under it.
const patches = {
  R: smooth([[-40.6, -91], [-44, -86.2], [-49.6, -88.4], [-50, -106], [-48.6, -124], [-44.4, -130.6], [-39.6, -131.4], [-37.6, -128], [-38.6, -124], [-39.6, -120],
    [-40, -116.4], [-38.2, -111.8], [-36.4, -113.8], [-33.8, -115.6], [-30.4, -117.3], [-26.4, -117.8], [-22.6, -116.7], [-19.6, -114.4], [-17.4, -111.8], [-16, -107.6],
    [-17, -101], [-27, -94], [-33.4, -91.4], [-38.4, -90.8]]),
  L: smooth([[43.6, -94.6], [49, -94.4], [49.4, -110], [44.6, -125], [39.4, -131.8], [31.2, -131.4], [33.6, -128.6], [35, -125.6], [35.6, -122],
    [35, -118.8], [33.2, -116.6], [31, -119], [28.6, -120.8], [24.4, -121.7], [20, -120.9], [16.8, -118.8], [14.2, -115.4], [12.6, -110.4], [12.2, -105.2], [15.6, -98.4],
    [28, -95.2], [34.4, -95.6], [39.6, -95]]),
};
/** The patches' soft edge (σ, pt), the hood's top the crop's soft arc (its L* 95 to 82 over about 2 pt). */
const PATCH_SOFT = 0.7;
// The saddle's two halves where they show from the front, as the sheet paints them. The right half runs down the
// shoulder from under the collar's end as a narrow strip of tan along the line, and opens into a round soft patch
// over the outer thigh, out to the front leg's line (x -34.6 at y -30, the sheet's tan reaches x -34 there) and down
// behind the hind paw, as the sheet paints it, never a wedge with a straight inner edge. The left half is a narrow
// streak down the shoulder from under the collar's end, outside the front leg's line (the sheet's, x 36 to 41 from y
// -47 to -32), running out to a point at the top of the haunch, whose round is cream.
const saddleR = smooth([[-27, -64.2], [-31.6, -63.4], [-37.4, -55], [-43, -46], [-53, -36], [-54, -20], [-52, -10], [-44, -8], [-37, -12], [-36.6, -16],
  [-40.6, -19.4], [-39.4, -23.4], [-37.8, -27.6], [-34.4, -31.4], [-32.6, -34], [-33.4, -38.4], [-33.4, -41.8], [-32, -46.2], [-30.4, -51.4], [-29.4, -57]]);
const saddleL = smooth([[27, -64.2], [31.6, -63.4], [36.2, -55.6], [38.8, -47.4], [40.2, -41], [40.6, -36.2], [40.2, -32.4], [39.2, -29.6], [37.8, -31.8], [36.6, -36.8],
  [35, -44], [32.6, -51], [29.6, -57.6]]);

/**
 * The saddles' brushed edges (DECISIONS 217): strands of the tan combed down and out over the haunch, short where the
 * fur runs along the edge and longer where it runs out across it, and on the right's broad haunch five darker strands
 * of the fur's deep tan, the crop's texture there (L* 64 to 70 strokes in its 71 to 75 tan); the left's narrow streak
 * carries none (strands that short read as specks), and is brushed only above its faded tail (saddleLTop), where
 * strands past the fade read as specks too. Each from its own fixed seed.
 */
const saddleLTop = smooth([[27, -64.2], [31.6, -63.4], [36.2, -55.6], [38.8, -47.4], [39.8, -42], [37.6, -42], [35, -44], [32.6, -51], [29.6, -57.6]]);
const SADDLE_BRUSH: Record<"R" | "L", Brush> = {
  R: { flow: [-0.35, 1], seed: 7301, edge: 26, out: [0.8, 2.2], in: [1.2, 2.6], width: [0.7, 1.1], colour: C.marking,
    inside: { count: 6, length: [4, 7], colour: C.earDeep, opacity: 0.55, width: 0.9 } },
  L: { flow: [0.3, 1], seed: 7302, edge: 14, out: [0.6, 1.6], in: [1, 2], width: [0.6, 0.9], colour: C.marking,
    inside: { count: 0, length: [3, 5], colour: C.earDeep, opacity: 0.25, width: 0.7 } },
};

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

const backPaint: Paint = { fill: C.fur, shade: furShade(hipGroup) };
/**
 * The back's line (parts/lines.ts), one span down each side (DECISIONS 210, 222): from under the head at the collar's
 * end down the shoulder and round the haunch to under the hind paw. On the right the saddle's tan reaches the line from
 * the shoulder all down the haunch, so the line runs on the tan there; on the left the tan streak lies along the
 * shoulder only, and the haunch's line is the cream's, as the sheet draws them (#A56F50 to #B67F5B on the right
 * haunch, #B19378 to #B79277 on the left).
 */
const backLines: LitSpan[] = [{ from: [-25.6, -63.3], to: [-47.4, -11], on: "tan", ends: ["under", "under"] },
  { from: [47.4, -11], to: [25.6, -63.3], on: (p: P) => (p[1] < -39.4 ? "tan" : "cream"), ends: ["under", "under"] },
  // Its foot on the ground in the slot between the front paws, where the sheet closes the gap with a short line, at the
  // ladder's lightest: the crop's slot is a mid tan down to the ground (sRGB 172 to 182 at x -2 to 2, y -2.6 to -1.6),
  // no darker than the tan above it, where the paws' lines beside it are dark (94 to 114).
  { from: [-4.14, -1.6], to: [4.14, -1.6], ends: ["join", "join"], most: 0 }];
/** The head's paint, its light group the head's outline (the rest's, or one drawn puffed) and the topknot's curls. */
const headPaintOf = (head: Shape): Paint => ({
  fill: C.fur,
  // Under the jaw, where the head turns under toward the collar; a faint wash in each hood just over the eye,
  // under the brow's overhang, where the sheet's tan deepens (#ECB888 against the hood's #F0BC92).
  shade: furShade([head, ...tuftShapes], ["M-38 -66 C-28 -61.2 -14 -59.2 0 -59.2 C14 -59.2 28 -61.2 38 -66 L46 -56 L-46 -56Z",
    ...[EYE_R, EYE_L].map(([x, y]) => `M${fmt(x - 8)} ${fmt(y - 9.6)} a8 2 0 1 0 16 0 a8 2 0 1 0 -16 0Z`)],
    // The crown stays light right out to its line, as the sheet paints it, the overhangs over the ears' roots
    // included; the cheeks' puffs take the rim's shade round their lower side, so the lower face reads round (G4).
    ["M-52 -172 L52 -172 L52 -137 L-52 -137Z"], { inset: 3, toLight: 4.5 }),
  highlight: { d: headLight, colour: C.light, opacity: 0.4, blur: 4 },
});
const headPaint = headPaintOf(head);
/**
 * head.line: the head's outline as its own unclipped region, drawn after the head's clip group, reaching 0.5 pt past
 * the head, crisp on its outer side (DECISIONS 212): the head fur's lines (headFur(), DECISIONS 214, 220), the crown's
 * running on into each ear's, each cheek's from the face's side over the ear round its puff to the jaw, the chin's from
 * jaw to jaw over the collar; and under them the crown's cream feathered out over each root's unlined stretch. `up` names
 * the sides whose ear is raised off the temple (head.line's states templeL, templeR and temples): that side's cheek
 * line starts lower, from open fur, and its root is not feathered (the temple, temple.<side>, is the head's own paint).
 */
function headLinePiece(up: { L: boolean; R: boolean } = { L: false, R: false }, h = HEAD): Piece {
  const head = h.head;
  const [x0, y0, x1, y1] = bbox(head.segs);
  // Room for the feathered cream over the roots, which reaches 3.6 pt past the head (its offset, half its width and
  // three times its blur), so the region's canvas holds all of it.
  const box = pad([x0, y0, x1 - x0, y1 - y0], 4);
  // The chin's line lies lighter in its scallops' notches than headFur's rule (0.55) lays it, so the scallops break
  // softly over the collar as the crop's fur points do, rather than ripple as one even wavy ribbon (audit front #3).
  const spans = h.fur.spans(up).map((s) => (s === h.fur.chin ? { ...s, most: (p: P) => Math.min(typeof s.most === "function" ? s.most(p) : s.most ?? 1, CHIN_LINE) } : s));
  const r = litEdge(head, spans, "head.line", box, { reach: 0.5, crisp: true });
  const f = uid("blur"), g = uid("blur"), k = uid("blur"), m = uid("blur");
  const along = (a: P, b: P, width: number, offset: number) => strokeOf(spanPoints(head, fracAt(head, a), fracAt(head, b)), width, { taper: 2, tip: 0.3, offset }).d;
  // Each root under the crown (DECISIONS 220), as the crop paints it: the crown's cream laid softly over the root's top,
  // from the head's edge down to the crown locks' tips, its lower edge blurred, so the locks show only as the soft edge's
  // unevenness (their round tips, crisp against the tan, read as cream beads at phone size) and the notches between them
  // are covered; a weak wider band below it, so the tan deepens down from the crown as the crop's does; the notch's side
  // only softened where it lies, so the root's tan shows right up to it and reads as the ear tucking under the crown
  // (soften()'s 3 pt band at 0.95 down the whole stretch read as a pale airbrushed cut); and the tan fading a little
  // into its point under the crown, as the crop's does (L* 77 to 86 within 2 pt of the point against 73 to 75 below),
  // so the root tapers to a soft point rather than ending in a corner (audit front #1). A raised ear's side has no notch.
  const sides = (["R", "L"] as const).filter((side) => !up[side]);
  const chord = ([a, b]: [P, P], width: number, offset: number) => strokeOf([a, b], width, { taper: 2, tip: 0.3, offset }).d;
  const tufts = { R: h.fur.tufts.crown.slice(0, CROWN_R.length), L: h.fur.tufts.crown.slice(CROWN_R.length) };
  const cap = (side: "R" | "L") => {
    const [a, b] = h.notches[side].top, d = v.norm(v.sub(b, a)), n: P = d[0] > 0 ? [d[1], -d[0]] : [-d[1], d[0]];
    const lift = (p: P, k: number): P => v.add(p, v.mul(n, k));
    return polyD([lift(a, ROOT_CAP.above), lift(b, ROOT_CAP.above), b, ...tufts[side].map((t) => lift(t.tip, -ROOT_CAP.below)).reverse(), a]);
  };
  const point = (side: "R" | "L") => {
    const [x, y] = side === "R" ? h.notches.R.side[0] : h.notches.L.side[1], [dx, dy] = ROOT_POINT[side].into, d = ROOT_POINT[side].at;
    const deg = r3((Math.atan2(dy, dx) * 180) / Math.PI), [rx, ry] = ROOT_POINT[side].r;
    return `<ellipse cx="${r3(x + dx * d)}" cy="${r3(y + dy * d)}" rx="${rx}" ry="${ry}" transform="rotate(${deg} ${r3(x + dx * d)} ${r3(y + dy * d)})"/>`;
  };
  const roots = `<path d="${sides.map(cap).join("")}" fill="${C.fur}" opacity="0.95" filter="url(#${m})"/>` +
    `<path d="${sides.map((side) => chord(h.notches[side].top, 2.4, 2)).join("")}" fill="${C.fur}" opacity="0.3" filter="url(#${k})"/>` +
    `<path d="${sides.map((side) => along(...h.notches[side].side, 1.6, 0.1)).join("")}" fill="${C.fur}" opacity="0.55" filter="url(#${k})"/>` +
    `<g fill="${C.fur}" opacity="0.35" filter="url(#${k})">${sides.map(point).join("")}</g>`;
  // Each cheek's unlined puff: its edge softened where it lies (a narrow band of the cream centred on it, not out over
  // the ear's tan, where soften()'s band read as a pale halo round the wisps), and its wisps' rim lit whiter, as the
  // crop paints the puff's tufts.
  const gapEdge = h.gaps.map(([a, b]) => along(a, b, 1, -0.55)).join(""), gapRim = h.gaps.map(([a, b]) => along(a, b, 1.4, -1.5)).join("");
  // Each puff's wisps flicked whiter along their middles, the crop's light tufts on the puff's rim: a soft stroke of the
  // light from inside each wisp out toward its tip, stopping short of the edge so the line keeps it, and a shorter one
  // beside it in the full lobe.
  const lerp = (a: P, b: P, t: number): P => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const flicks = h.fur.tufts.cheeks.flatMap((t, i) => {
    const one = strokeOf([lerp(t.root, t.tip, -0.6), lerp(t.root, t.tip, 0.7)], 0.7, { taper: 1, tip: 0.15 }).d;
    // The full lobe: the right row's first wisp, the left's (reversed) last.
    if (i !== 0 && i !== h.fur.tufts.cheeks.length - 1) return [one];
    const side = lerp(t.notches[0], t.notches[1], 0.3);
    return [one, strokeOf([lerp(side, t.tip, -0.4), lerp(side, t.tip, 0.55)], 0.6, { taper: 0.8, tip: 0.15 }).d];
  }).join("");
  const puffs = `<path d="${gapEdge}" fill="${C.fur}" opacity="0.6" filter="url(#${f})"/><path d="${gapRim}" fill="${C.light}" opacity="0.55" filter="url(#${g})"/>` +
    `<path d="${flicks}" fill="${C.light}" opacity="0.7" filter="url(#${f})"/>`;
  return lineGate(piece(`<defs>${r.defs}${blur(f, pad(box, 2), 0.4)}${blur(g, pad(box, 2), 0.5)}${blur(k, pad(box, 2), 0.8)}${blur(m, pad(box, 2), 0.65)}</defs>${roots}${puffs}${r.body}`, box, {
    shapes: [{ name: "head.line", nodes: head.typed, segs: head.segs, outlined: r.outlined, fur: head.fur.map(([a, b]) => [fracAt(head, a), fracAt(head, b)]) }],
    lines: r.lines,
  }));
}

/**
 * An open eye at its landmark, by the dog's one eye recipe (parts/eye.ts, DECISIONS 73), shaped as this crop draws
 * it: an oval a little taller than it is wide (the sheet's dark eye fits 18.5 by 19.5 pt), its top turned 20° toward
 * the nose and rolled with the face; the white a crisp sliver low on the outer side, about 1.6 pt at its widest (the
 * sheet's 1.5 to 1.9), from a little above the outer side's level to below its foot; the catchlight where the
 * sheet's sits, high on the nose's side. `noseward` is +1 when the nose is to its right.
 */
function eyeSpec(landmark: P, noseward: 1 | -1): EyeSpec {
  const out = -noseward;
  // The ball sits a hair out from the landmark and 0.45 pt below it, so the dark eye's own centre (DECISIONS 10)
  // lands on the landmark with the eye's foot where the sheet's is.
  const centre: P = [landmark[0] + out * 0.65 * cosR - 0.6 * sinR, landmark[1] + out * 0.65 * sinR + 0.6 * cosR];
  return {
    centre, rx: 9.5, ry: 9.2, turn: 20 * noseward + ROLL_DEG, noseward,
    rim: { top: 1.3, side: 1, foot: 0.7 },
    lid: { from: -18, to: 122, width: 1.8, flick: 0.25 },
    white: { at: -28, width: 1.4, span: 32, fade: 0.6 },
    shine: { at: [2.3, 5.1], r: 1.8 },
    // The front crop's glow is the narrowest, right along the foot (its L* 27 to 30 within 2 pt of it).
    glow: { band: 5.6, warm: 1.8 },
  };
}
const eye = (landmark: P, noseward: 1 | -1): Piece => sharedEye(eyeSpec(landmark, noseward));

/**
 * The nose in the face frame, as the turnaround, the blush-cheeks panel and the hero draw it: a wide rounded
 * inverted triangle, its top nearly flat, broadest near its top with round shoulders (the sheet's is 12.5 pt wide
 * there and about 7.4 pt tall), its sides running in straight to a small round point that runs on into the
 * philtrum's top; near-black at its edge, warming a little to the printed dark brown in its middle, as the
 * turnaround paints it, and a soft grey-brown sheen across its upper left, as the hero paints it.
 */
const noseShape = symmetric([[0, 4.2], [-2.6, 4.25], [-4.6, 4.6], [-5.9, 5.3], [-6.45, 6.3], [-6.3, 7.5], [-5.6, 8.8], [-4.3, 10.1], [-2.7, 11.1], [-1.2, 11.65]],
  [0, 11.8]);
function nose(): Piece {
  const f = uid("blur"), g = uid("blur"), box: Box = [-8, 2, 16, 13];
  return piece(FRAME.place(`<defs>${blur(f, box, 0.7)}${blur(g, box, 1.1)}</defs><path d="${pathD(noseShape.segs)}" fill="${C.eyeDark}"/>` +
    `<ellipse cx="0.2" cy="8.2" rx="3.3" ry="1.9" fill="${C.dark}" opacity="0.55" filter="url(#${g})"/>` +
    `<ellipse cx="-1.3" cy="6.05" rx="2.9" ry="1.05" transform="rotate(-6 -1.3 6.05)" fill="${C.noseSheen}" opacity="0.8" filter="url(#${f})"/>`), FRAME.box(box));
}

/**
 * A blush in the face frame, under the eye's outer side: an ellipse turned with the face, drawn at the blush's
 * reference level (DECISIONS 145, 160): the printed pink blurred, its alpha stretched so its core is the full #F7B3A6
 * across the reddest tenth of the cheek, where the blur alone takes its peak down by about a fifth. The part's rest
 * alpha (rig.json) sets it at the resting level, and a face clip keys its alpha for the levels the presets ask
 * (presets.ts BLUSH_REFERENCE).
 */
function blush(sx: number): Piece {
  const [cx, cy] = face([sx * 30, 13.4]);
  // As compact as the sheet's (its pink covers about 40% of what a 7 by 4.4 pt blush does), so the cream just under
  // the eye stays clear.
  const rx = 5.8, ry = 3.6, sd = 2.2;
  const [dx, dy] = [rx * cosR, rx * sinR], deg = r3((ROLL * 180) / Math.PI);
  const d = `M${r3(cx - dx)} ${r3(cy - dy)} a${rx} ${ry} ${deg} 1 0 ${r3(2 * dx)} ${r3(2 * dy)} a${rx} ${ry} ${deg} 1 0 ${r3(-2 * dx)} ${r3(-2 * dy)}Z`;
  const f = uid("blush"), box = pad([cx - rx - 0.5, cy - ry - 0.6, 2 * rx + 1, 2 * ry + 1.2], 3 * sd);
  // The blurred oval peaks at 0.81 of its fill at 3x (dog.test.ts holds the stretched core at full strength).
  // Stretched by 1.475, match.py's fit reads 1 at alpha 1 (1.229, the first stretch, read 0.95 and left 95 to 100% out of reach).
  const stretch = `<feComponentTransfer><feFuncA type="linear" slope="${BLUSH_STRETCH.front}"/></feComponentTransfer>`;
  return piece(`<defs>${filter(f, box, `<feGaussianBlur stdDeviation="${sd}"/>${stretch}`)}</defs><path d="${d}" fill="${C.blush}" filter="url(#${f})"/>`, box);
}
/** How far each view's blush is stretched past its blurred peak (DECISIONS 160); the turned views' are typed in their own blush(). */
const BLUSH_STRETCH = { front: 1.475 };

/**
 * The tag and the ring it swings from, which the turnaround paints blue on the blue collar. The heart is painted by
 * the dog's one tag recipe (parts/tag.ts): matte gold inside a warm gold-brown line, warming toward orange in its soft
 * shade along its lower right, one soft light high on its left lobe, and two smaller hearts embossed in it as
 * concentric warm rings, as the sheet draws them. No bevel, no glint.
 */
function tagPiece(): Piece {
  // The ring's edge is a plain stroke, drawn exactly as wide as it is declared.
  const ringLine: DrawnLine = { kind: "inner", width: 0.6, where: "tag ring", drawn: [0.6, 0.6] };
  // It runs down into the heart's cleft, so the heart hangs from it with no gap between the lobes.
  const ring = piece(`<rect x="-0.9" y="-57.2" width="2.8" height="8.6" rx="1.4" fill="${C.collar}" stroke="${C.collarRim}" stroke-width="${ringLine.width}"/>` +
    `<rect x="-0.2" y="-56.6" width="0.8" height="6.6" rx="0.4" fill="${C.collarHighlight}"/>`, [-2, -58, 5, 10.4], { shapes: [], lines: [ringLine] });
  // Matte gold, warming toward orange along its lower right, one small soft light high on its left lobe, and the two
  // smaller hearts embossed in it as concentric warm rings (parts/tag.ts).
  return join(ring, part("tag", heart, tagPaint({ emboss: embossed, light: "M-7 -48.2 a2.4 1.6 -35 1 0 4.8 0 a2.4 1.6 -35 1 0 -4.8 0" })));
}

/**
 * An ear's paint, by the dog's one ear recipe (parts/ear.ts, DECISIONS 76), as the front crop paints it: the tan
 * lighter toward the root and the lit upper outer side, deepening down the ear to a browner tan at its lower clumps
 * (the sheet's #E09B6C mid-ear to #C17D50 and #BC7847 at the bottom); five long locks curving with the ear's bulge
 * from its upper middle down into its lower edge, the outer two into the dips between its three clumps; and the
 * shade on the rim away from the light, along the inner edge where the ear tucks under the head, where the cheek's
 * fluff hangs over it and across the root under the crown's overhang. Typed on the dog's right ear in the head's
 * frame and placed on either ear.
 */
function earPaint(side: "L" | "R"): Paint {
  const on = (p: P) => onEar(side, p);
  // Five locks of uneven length coming in from about the ear's middle and curving with its outer bulge down into its
  // lower edge, the outer two into the dips between its clumps, a short one in the outer clump.
  const locks: P[][] = [
    [[-69.8, -110], [-72.6, -102], [-74.8, -94], [-76.4, -87.4], [-76.6, -79.6]],
    [[-62.6, -99], [-66.4, -90], [-67.8, -80], [-67, -70.6]],
    [[-56.8, -92], [-59, -83], [-59.4, -74], [-58.4, -65.8]],
    [[-50.6, -82], [-51.4, -76.6], [-51.2, -71.4]],
    [[-72.4, -89], [-73.4, -82.6], [-72.6, -76.8]],
  ];
  const shadeD = "M-90 -92 C-80 -80 -62 -72 -40 -70 L-40 -50 L-90 -50Z";
  const cheekD = "M-38 -98 C-43 -93 -48.6 -85 -49.8 -74 C-49 -66 -45 -62 -40 -60Z";
  // Along the inner edge, where the ear tucks under the head's side; and the crown's soft contact shadow across
  // the root's tan, right under the overhang's fur.
  const innerD = "M-44 -128 C-48.4 -118 -49.4 -104 -48.8 -94 L-43 -94 L-43 -128Z";
  const rootD = "M-54 -140 L-26 -140 L-27 -132.6 C-35 -132.2 -45 -131.8 -54 -130.6Z";
  return earFur({
    ear: EDGES[side].shape, edge: EDGES[side],
    axis: [on([-58, -124]), on([-60, -62])],
    deepen: [0.3, 1],
    locks: locks.map((pts) => pts.map(on)),
    dips: ([[-66.6, -69.4], [-76.2, -78.2]] as P[]).map(on),
    // A soft sheen down the upper outer side, where the light falls.
    light: earD(side, "M-77 -97 C-76 -106 -69 -116 -61 -123 C-57 -122 -59 -115 -63.6 -108 C-67.6 -102 -72 -97 -77 -97Z"),
    under: [earD(side, shadeD), earD(side, cheekD), earD(side, innerD), earD(side, rootD)],
  });
}

/**
 * An ear's line (parts/lines.ts), on the tan: from where it comes out from under the cheek, round its foot and up its
 * outer side to its root, where it goes on under the crown at full width, so the crown's line runs on into it.
 */
function earSpans(side: "L" | "R"): LitSpan[] {
  const ends: [P, P] = [onEar(side, [-41.6, -67.2]), onEar(side, [-38.6, -140.6])];
  // Its foot, where it hangs over the shoulder, is a place under the head: deepest there (the sheet's #8A5334).
  const foot = (p: P) => Math.min(0.8, Math.max(0, (p[1] + 72) / 6) * 0.8);
  // Its inner edge, from under the crown down behind the face to just above where it comes out under the cheek:
  // hidden at rest, it shows where a lifted ear swings out from the cheek (DECISIONS 132), in the line of an ear tucked
  // under the head. It starts below the root's tight inner corner, which stays under the crown.
  const inner: [P, P] = [onEar(side, [-28.6, -129]), onEar(side, [-40.4, -71.6])];
  return side === "R"
    ? [{ from: ends[0], to: ends[1], on: "tan", under: foot, taper: 7 }, { from: inner[0], to: inner[1], on: "tan", under: 0.5, taper: [4, 6] }]
    : [{ from: ends[1], to: ends[0], on: "tan", under: foot, taper: 7 }, { from: inner[1], to: inner[0], on: "tan", under: 0.5, taper: [6, 4] }];
}

/**
 * How deep each sole's line lies on the ground, at least, beyond the ground's own term (0.7, L* 51.5; DECISIONS 216,
 * 223): the front crop draws its soles darkest where each toe line meets the sole (L* 36 to 41 at x ±8 to ±10 and ±18 to
 * ±20), as light as the ground's term under the middle toe (51 at ±14 to ±16) and between the two elsewhere (44 to 50
 * at ±22 to ±26), and the hind soles dark all along (40 to 47 from ±30 to ±42). The ladder's darkest tone is L* 44.
 */
const FRONT_TOE_X = [11.2, 20.8];
function frontSole(p: P): number {
  if (p[1] < -2.6) return 0;
  const x = Math.abs(p[0]), toe = Math.min(...FRONT_TOE_X.map((t) => Math.abs(x - t)));
  if (toe < 1.8) return 0.9;
  if (x > 13 && x < 19) return 0;
  return x > 4 && x < 28 ? 0.78 : 0;
}
const hindSole = (p: P) => (p[1] > -5.6 && Math.abs(p[0]) > 29 && Math.abs(p[0]) < 46 ? 0.87 : 0);
/**
 * Between the front legs, under the chest's V, a warm tan down the slot, fading up into the V's cream with no edge
 * and deepening to a deep warm tan between the paws, as the sheet's does (L* 88 at y -22, 73 at -14 and 64 at -8):
 * its sides lie under the legs' inner lines, which now run up to the V (G7, DECISIONS 223). No line runs down its
 * middle and nothing marks its top.
 */
function between(): string {
  const g = uid("between"), f = uid("blur");
  const v = smooth([[0, -29.4], [4, -27], [5, -22], [3.6, -14], [1.8, -5], [0, -2.4], [-1.8, -5], [-3.6, -14], [-5, -22], [-4, -27]]);
  return `<defs><linearGradient id="${g}" gradientUnits="userSpaceOnUse" x1="0" y1="-26" x2="0" y2="-2.4">` +
    `<stop offset="0" stop-color="${C.marking}" stop-opacity="0"/><stop offset="0.08" stop-color="${C.marking}" stop-opacity="0.3"/>` +
    `<stop offset="0.19" stop-color="${C.marking}" stop-opacity="0.6"/><stop offset="0.47" stop-color="${C.marking}" stop-opacity="0.85"/><stop offset="0.75" stop-color="${C.earDeep}" stop-opacity="0.9"/>` +
    `<stop offset="0.94" stop-color="${C.earDeep}" stop-opacity="0.8"/><stop offset="1" stop-color="${C.earDeep}" stop-opacity="0.2"/></linearGradient>` +
    `${blur(f, [-12, -32, 24, 32], 1)}</defs>` +
    `<path d="${pathD(v.segs)}" fill="url(#${g})" filter="url(#${f})"/>`;
}

export function front(): Drawn[] {
  const out: Drawn[] = [];
  const add = (name: string, p: Piece, state?: string) => out.push({ part: name, piece: p, ...(state ? { state } : {}) });
  // The ground shadow (parts/shadow.ts, DECISIONS 218, 226): a broad soft oval reaching past both haunches, as the front
  // crop paints it (x -64 to 60), darkest where the paws press.
  add("shadow", groundShadow({ reach: [-68, 63], presses: [{ x: -15.4, half: 13 }, { x: 15.4, half: 13 }, { x: -38.4, half: 9 }, { x: 38.4, half: 9 }] }));
  add("body.back", lineGate(litPart("body.back", back, backPaint, backLines)));
  // Each saddle's edge brushed into the cream, and a few darker strands combed down its haunch, as the crop paints the
  // haunch's fur (audit front #13, G8; parts/marking.ts, DECISIONS 217): never a blurred blot.
  add("back.patch.R", lineGate(join(litMarking("back.patch.R", { shape: back, paint: backPaint, spans: backLines }, saddleR, { fill: C.marking, blur: 1.4 }),
    brush("back.patch.R", back, saddleR, 1.4, SADDLE_BRUSH.R))));
  add("back.patch.L", lineGate(join(litMarking("back.patch.L", { shape: back, paint: backPaint, spans: backLines }, saddleL, { fill: C.marking, blur: 1.3, fade: { from: [38, -40], to: [39.4, -29.4] } }),
    brush("back.patch.L", back, saddleLTop, 1.3, SADDLE_BRUSH.L))));
  for (const side of ["R", "L"] as const) {
    const sx = side === "R" ? -1 : 1, cx = sx * 37.6, cy = -10.9;
    add(`hind.${side}`, lineGate(roomy(litPart(`hind.${side}`, hind[side], {
      fill: C.fur,
      shade: furShade(hipGroup, [], [`M${cx - 12} ${cy - 12} L${cx + 12} ${cy - 12} L${cx + 12} ${cy - 4} L${cx - 12} ${cy - 4}Z`]),
      // Two toe lines rising from the sole's dips about 6 pt up the paw's front, each bowing away from the middle toe,
      // as the sheet draws them, so the paw reads as three round toes (parts/paw.ts).
      ...toes({ lines: ([[[-41.6, -3.6], [-42.3, -5.8], [-42.2, -8], [-41.4, -9.8]], [[-35.6, -3.3], [-35, -5.4], [-35.1, -7.6], [-35.8, -9.4]]] as P[][])
        .map((pts) => flipX(pts, side)), fade: [-3.4, -10], soft: true }),
    // A bun closed all round where it shows, as the sheet draws it: its line comes out from behind the front paw over
    // its top, where it lies on the haunch, runs on unbroken down its outer side and under its sole to where it goes
    // behind the front paw again, deepening to the darkest where it sits on the ground (parts/lines.ts).
    }, litSide(side, [{ from: [-28.9, -14.6], to: [-27.7, -5.4], ends: ["under", "under"], ground: "sole", most: (p: P) => (p[1] > -5 ? 1 : p[1] < -16 ? 0.1 : 0.4), under: hindSole }])), 6)));
  }
  // Its canvas a point roomier than the chest, so the light group's shade, which reaches 13.7 pt past it, stays
  // inside the paint's reach when the chest's top lands on a whole point.
  add("body.front", roomy(part("body.front", chest, {
    fill: C.fur,
    // The shade falls under the chin, just below the collar.
    shade: furShade(bodyGroup, ["M-22 -52 C-10 -48 10 -48 22 -52 L22 -58 L-22 -58Z"]),
    under: between(),
    // Under the tag the chest's fur ends in a soft V at the top of the slot between the legs, as the crop draws it
    // (audit front #10): the legs' inner lines run up into it, and over each a faint combed arm of the chest's fur
    // reaches up and out (the crop's x -9 to -5.6 from y -31.8 to -28.4), its own pale warm stroke.
    inner: ([[[-9, -31.8], [-7.2, -30.2], [-5.6, -28.4]], [[9, -31.8], [7.2, -30.2], [5.6, -28.4]]] as P[][])
      .map((pts) => ({ pts: sample(smooth(pts, { closed: false }).segs, 6, false), width: 0.6, colour: LINES.cream[1]!, opacity: 0.45 })),
  }), 1));
  // The chin's and the cheeks' shadow on the chest, cast by the head (spec L396): a soft band under the jaw's
  // scalloped edge, about 3 pt deep, falling on the shoulders' fur beside the collar's ends (the collar hides the
  // middle of it). Typed in the head's frame, as its jaw is, and rolled with it.
  const jawShade = ([[-42, -71.6], [0, -61.6], [42, -71.6], [40.4, -66.6], [31, -61.6], [21, -58.6], [9, -56.4], [0, -55.8], [-9, -56.4], [-21, -58.6],
    [-31, -61.6], [-40.4, -66.6]] as P[]).map(cheekRoll);
  add("shadow.chin", soft(pathD(smooth(jawShade, { corners: [0, 2] }).segs), [-43, -74.6, 86, 20], C.furShade, 1.3));
  // The collar (the sheet's paint): the band's blue, lit along its middle; the keeper the tag's ring hangs from;
  // and a dark blue rim along its lower edge and round each end (#597C8F on the sheet), its top soft under the chin's
  // shadow, unlined. Each end tucks under the fur by the cheek with its dark rim, as the crop draws it (L* 42 to 49 at
  // the ends' tips, x -27.5 to -25.2 at y -60 and 26.1 at -59; audit front #7, G9; DECISIONS 225): the rim tapers out
  // where the end's top goes under the jaw's fur. The chin's shadow on it is its own part (shadow.chin.collar), cast by
  // the head.
  add("collar", part("collar", collar, {
    fill: C.collar,
    // The band's lower part in its shade, turning under toward the chest, and a lighter band along its top where
    // it faces the light, as the sheet paints it; its blue between them.
    shade: { multiply: C.shadeBy, shapes: ["M-32 -58.6 C-16 -50.4 16 -50.4 32 -59.6 L32 -46 L-32 -46Z"], blur: 1.5 },
    highlight: { d: "M-22 -61.4 C-11 -58.4 10 -58.4 22 -62.8 L22 -60.2 C10 -56.2 -11 -56.2 -22 -59Z", colour: C.collarHighlight, opacity: 0.35, blur: 0.8 },
    under: `<rect x="-1.5" y="-60" width="4.4" height="10.4" rx="1.2" fill="${C.collarLine}" opacity="0.3"/>`,
    outline: { colour: C.collarRim, width: THIN, taper: 3, blur: 0.2, spans: [{ from: [26.2, -64], to: [-26.2, -62.7] }] },
  }));
  add("shadow.chin.collar", chinShadow(head, cheekRoll([-38, -66.2]), cheekRoll([38, -66.2]), C.collarLine, [-44, -74, 88, 22]));
  add("tag", tagPiece());
  for (const side of ["R", "L"] as const) add(`ear.${side}`, lineGate(litPart(`ear.${side}`, EDGES[side].shape, earPaint(side), [EDGES[side].span, earSpans(side)[1]!])));
  add("head.base", part("head.base", head, headPaint));
  for (const side of ["L", "R"] as const) {
    // One even pale tan from the eye to the ear's root, as the front crop paints it (L* 80 to 81 by the eye and by the
    // ear alike).
    add(`head.patch.${side}`, marking(`head.patch.${side}`, { shape: head, paint: headPaint }, patches[side], { fill: C.patch, blur: PATCH_SOFT, clip: false }));
  }
  add("blush.L", blush(1));
  add("blush.R", blush(-1));
  add("eye.L", eye(EYE_L, -1), "open");
  add("eye.R", eye(EYE_R, 1), "open");
  add("brow.L", brow("neutral", 1, FRAME).piece);
  add("brow.R", brow("neutral", -1, FRAME).piece);
  add("nose", nose());
  add("mouth", mouth("open", FRAME).piece, "open");
  add("head.line", headLinePiece());
  add("tuft", topknot(CURLS, {
    fill: C.fur,
    highlight: { d: headLight, colour: C.light, opacity: 0.4, blur: 4 },
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
    // The one soft light on the leg's front, toward the light, so its cream is never one flat fill (the sheet's
    // varies by about 2 L* down the leg); the shade along its inner side, where it turns into the V; and no shade
    // band along the sole, whose line alone marks the paw's foot.
    const litX = side === "R" ? -19 : 13;
    // Two toe lines rising from the sole's dips about 5.5 pt up the paw's front, each bowing a little away from the
    // middle toe, as the sheet, the paw-stub and the stubby-paws panels draw them (parts/paw.ts).
    const toeLines = toes({ lines: ([[[-11.2, -1.2], [-10.6, -3.4], [-10.8, -5.4], [-11.6, -6.9]], [[-20.8, -1.2], [-21.4, -3.4], [-21.2, -5.4], [-20.4, -6.9]]] as P[][])
      .map((pts) => flipX(pts, side)), fade: [-1.2, -7], soft: true, width: 0.9 });
    add(`front.${side}`, lineGate(litPart(`front.${side}`, legs[side], {
      fill: C.fur,
      shade: furShade(bodyGroup, [polyD(flipX([[-5, -26], [-4.2, -20], [-3, -12], [-2.2, -6], [-1.2, -6], [-2, -12], [-3, -20], [-3.8, -26]], side))],
        ["M-40 -60 L40 -60 L40 -36 L-40 -36Z", "M-40 -3.4 L40 -3.4 L40 4 L-40 4Z"], { inset: 2, toLight: 3 }),
      highlight: { d: `M${litX - 7} -24 a7 10 0 1 0 14 0 a7 10 0 1 0 -14 0Z`, colour: C.light, opacity: 0.25, blur: 3.5 },
      ...toeLines,
      // Its top fades in under the shoulder, so it comes out from under the saddle's tan with no edge.
      feather: { from: [sx * 31, -45.6], to: [sx * 31, -41.8] },
      // The chest is one fluffy mass down to the paws, as the sheet paints it: the leg's line comes in from nothing low
      // on its inner side, where the legs part, runs round the bun of the paw, darkest under its sole on the ground,
      // and up its outer side, fading out below the shoulder (parts/lines.ts). No lines beside the tag.
      // Its line light and fine up the leg's outer side, where the crop draws a faint thin line against the haunch, its
      // own down the inner side, faint at the V and deep in the slot between the paws, as the crop's are (L* 60 to 70
      // at y -26, 45 to 50 below -12), and the ground's term under the sole's middle (DECISIONS 216, 223).
    }, litSide(side, [{ from: [-5.4, -30.6], to: [-35.1, -39.4], ends: ["free", "free"], ground: "sole", most: (p: P) => (p[1] > -4 ? 1 : Math.abs(p[0]) < 9 ? (p[1] > -12 ? 1 : p[1] > -20 ? 0.5 : 0) : 0.1),
      under: (p: P) => Math.max(frontSole(p), Math.abs(p[0]) < 9 && p[1] > -12 ? (p[1] > -8 ? 0.9 : 0.7) : 0), cites: 216, bare: [0, 45] }]))));
  }
  return out;
}

// The face library (spec L440-498): every face state the front draws besides its rest, each from its panels by the
// shared face recipes (parts/eye.ts, mouth.ts, brow.ts, stars.ts), placed by this view's face frame. The rest face
// (open eyes, the open mouth, neutral brows and ears) is front()'s; the states' rotations of the ears are the face
// clips' (presets.ts, faceClips.ts).

/** Each eye's place along the eye line, out from the face frame's middle. */
const EYE_HALF = Math.hypot(EYE_L[0] - EYE_R[0], EYE_L[1] - EYE_R[1]) / 2;
/** A model-space point moved across and down in the face's level frame. */
const nudge = ([x, y]: P, [dx, dy]: P): P => [x + dx * cosR - dy * sinR, y + dx * sinR + dy * cosR];

/** The eye states the front draws besides the open eye. */
export const EYE_STATES = ["happy", "squeeze", "closed", "sleepy", "wink", "wide", "peek", "sparkle", "eager", "flat", "peekBack"] as const;

/** The eye states drawn on the open eye's ball (the rest are lash bands): their specs are what the R3 gaze guard holds. */
export const BALL_STATES = ["sleepy", "wide", "peek", "sparkle", "eager", "peekBack"] as const;

/** The open eye's spec on one side, and each ball state's (exported for the R3 guard, which holds where the iris looks). */
export function eyeStateSpec(state: "open" | (typeof BALL_STATES)[number], side: "L" | "R"): EyeSpec {
  const sx = side === "L" ? 1 : -1, noseward: 1 | -1 = side === "L" ? -1 : 1;
  const spec = eyeSpec(side === "L" ? EYE_L : EYE_R, noseward);
  switch (state) {
    case "open":
      return spec;
    // The open eye with its upper lid closed down over about two fifths of it, its edge bowing down a little, as Sleepy
    // half-lid draws it: the lid's ends 3.2 pt above the ball's middle, its middle 1.4. Closed down past the middle, as
    // it was, the flat lid across the iris read as unimpressed (DECISIONS 148). The catchlight on the iris just under
    // the lid, as the panel draws it, its top tucked under the lash (it rides up toward the open eye's place and the lid
    // covers it there, Q28), the tiny one below it (Q26).
    case "sleepy":
      return { ...spec, cover: { level: -3.2, bow: 1.8, tilt: ROLL_DEG, lash: 1.9, overhang: 1, shine: { at: [2.8, 0.1], r: 1.4 } } };
    // Surprised round: 7% larger and a point higher, the white broader and longer, the catchlight bigger; its larger
    // pupil baked in (phase 3 has no pupil scale).
    case "wide":
      return wide(spec, sx);
    // Side glance: the iris baked toward the viewer's right, as the panel looks, the white a broad crescent on the
    // other side; the catchlights ride the iris at half its travel (Q28).
    case "peek": {
      const e = { ...spec, white: { at: side === "R" ? -6 : 186, width: 4.6, span: 58, fade: 0.3 } };
      return { ...e, shine: riding(e, spec, spec.shine) };
    }
    // The sparkle (Q2, DECISIONS 203): the open eye, its catchlights where the open eye has them, a soft white star in
    // its lower iris as the bear's Sparkle draws it (its middle half the ball's radius below the ball's, its points
    // about a third of the radius out, as plump as the bear's), and two small gold stars beside it.
    case "sparkle":
      return { ...spec, sparkle: { star: { at: [0.2, -4.5], r: 3.3 }, stars: SPARKLE_STARS, level: ROLL_DEG, light: LIGHT } };
    // Hungry's (new drawing): the wide eye with its pupil larger (the iris's dark reaching further down, its warm foot a
    // thin glow) and fixed on the food just in front of its nose, the iris baked in toward the nose and a hair down, so
    // the two eyes meet on it, the white a crescent down the outer side, the catchlights riding the iris at half its
    // travel from the wide eye's (Q28), the large one 10% larger.
    case "eager":
      return eager(spec, sx, EAGER);
    // Huffy's peek back (new drawing): the eye open again, bright, no lid (a quarter-down lid read as a skeptical
    // side-eye, the huff kept up rather than melting), the iris baked toward the viewer's right and level, so with the
    // head glanced away to the dog's right (phase 4) it looks back at the viewer, never up at them: on the dog's left
    // eye, the one that peeks, the white lies on the nose's side 8° below the level, the open eye's white turned round
    // to the other side (DECISIONS 159). The catchlights ride the iris at half its travel (Q28).
    case "peekBack": {
      const e = { ...spec, white: { at: side === "R" ? -6 : 168, width: 3.2, span: 56, fade: 0.3 } };
      return { ...e, shine: riding(e, spec, spec.shine) };
    }
  }
}

/** The wide eye on the open eye's spec: 7% larger and 0.9 pt higher, the white broader, the catchlight 15% bigger. */
const wide = (spec: EyeSpec, sx: number): EyeSpec => ({
  ...spec, centre: nudge(spec.centre, [-sx * 0.4, -0.9]), rx: 10.2, ry: 9.85, white: { at: -28, width: 2, span: 42, fade: 0.5 },
  shine: { at: [2.5, 5.6], r: 2.05 }, glow: { band: 6, warm: 2 },
});

/**
 * The sparkle's small gold stars beside each eye, toward the nose and up from the ball's middle in the face's level
 * frame: two, as both sister sheets draw them beside their Sparkle eye, the larger five-pointed by the eye's outer top
 * and the smaller four-pointed below it, level with the eye's middle, on the hood. The sheets stack theirs about the
 * eye's middle on an empty panel; lowered so here, the smaller met the head's edge by the ear and the pair hung beside
 * the eye like earrings (DECISIONS 203).
 */
const SPARKLE_STARS = [{ at: [-13.6, 8.6] as [number, number], r: 3.8, points: 5 as const }, { at: [-15.8, 1.2] as [number, number], r: 2.6, points: 4 as const }];

/**
 * The squeeze (Q2, DECISIONS 202): the dog's own `>` `<`, as the kitty's and the bear's Excited draw theirs, at the
 * open eye's size: its point 8.2 pt in from the open eye's middle toward the nose, 0.6 below it, its arms reaching
 * out to the open eye's outer side (the upper 16.8 pt, turned 14° up, the lower 15.8, 26° down, as the sister sheets'
 * arms rise 11 to 14° and fall 18 to 27°), 5 pt thick, the crescent band's weight, each arm bowing out 0.8 pt, in the
 * lash bands' warm near-black, as dark as the sister sheets' (the outline's warm brown read faded beside them: 202).
 * The sisters' arms are 0.36 as thick as long; at 4.4 pt and straighter (0.27) the dog's read as typed `> <` beside
 * them, where the bear's are bold and curved.
 */
export function squeeze(side: "L" | "R"): Chevron {
  const sx = side === "L" ? 1 : -1;
  return { tip: FRAME.at([sx * (EYE_HALF - 8.2), 0.6]), tilt: ROLL_DEG, noseward: side === "L" ? -1 : 1, length: [16.8, 15.8], angle: [14, 26],
    thickness: 5, ends: 4.3, bow: 0.8, point: 1 };
}

/**
 * An eye state, drawn from its panels. The closed states are the sheets' dark lash bands, placed by their middles where
 * the level panels place them from the nose (DECISIONS 130): the happy crescents (Excited, Laughing) 2.3 pt below the
 * open eye's centre and 1.9 pt further out, the closed lids (Sleepy) 2 pt below and 1.6 out, the wink (Mischievous,
 * Winking, Cheeky) at the open eye's height. The others are the open eye's ball (eyeStateSpec).
 */
function eyeState(state: (typeof EYE_STATES)[number], side: "L" | "R"): Piece {
  const sx = side === "L" ? 1 : -1, noseward: 1 | -1 = side === "L" ? -1 : 1;
  const band = (out: number, down: number, b: Omit<LidBand, "centre" | "tilt" | "noseward">) =>
    lidBand({ centre: FRAME.at([sx * (EYE_HALF + out), down]), tilt: ROLL_DEG, noseward, ...b });
  switch (state) {
    // A ∩ about as wide as the open eye, an even band about 5 pt thick with round ends, its outer end a little lower and
    // hooking down, as the master sheet's Laughing, Excited and Content paint it (20 to 20.6 pt across, 5 to 5.5 thick,
    // 92 to 108 pt² of dark).
    case "happy":
      return band(2.4, 1.45, { width: 17.4, rise: 4.6, drop: 0.8, thickness: 5, ends: [2.6, 3.2], fullness: 0.35, flick: { length: 0.9, hook: 25 } });
    // A ∪ a little narrower, as thick, its middle 2.6 pt below its ends, the outer end lifting in a lash flick, as
    // the master sheet's Sleepy paints it (18 to 18.8 pt across, 5 thick, 86 to 91 pt²).
    case "closed":
      return band(1.6, 2, { width: 16.6, rise: -2.6, drop: 0, thickness: 4.8, ends: [2.4, 2.2], fullness: 0.35, flick: { length: 1.2, hook: -30 } });
    // A flatter crescent at the open eye's height and 2.2 pt further out, its outer end lifted and running into a lash
    // flick, as Cheeky and Winking draw the wink (19.3 pt across, 4.9 thick, 88 pt², its middle 25.7 pt out from the
    // nose and 8 pt above it, the open eye's height).
    case "wink":
      return band(2.7, -0.6, { width: 17.6, rise: 3.2, drop: -1.2, thickness: 4.8, ends: [2.4, 2.4], fullness: 0.35, flick: { length: 1.6, hook: -60 } });
    // Huffy's flat lid (new drawing): shut, nearly level, a hair lower in its middle than at its ends, thinner than the
    // happy crescent, the outer end lifting into a short lash; its inner end never below its outer (no angry slant).
    case "flat":
      return lidBand(flatLid(side));
    case "squeeze":
      return chevron(squeeze(side));
    default:
      return sharedEye(eyeStateSpec(state, side));
  }
}

/** Huffy's flat lid on one side (exported for the R3 guard, which holds its ends level). */
export function flatLid(side: "L" | "R"): LidBand {
  const sx = side === "L" ? 1 : -1;
  return { centre: FRAME.at([sx * (EYE_HALF + 1.4), 1.3]), tilt: ROLL_DEG, noseward: side === "L" ? -1 : 1,
    width: 16.4, rise: -1, drop: 0, thickness: 4.4, ends: [2.6, 1.8], fullness: 0.45, flick: { length: 1.2, hook: 10 } };
}

/** How the eager eye is baked: the white's place round the eye, its width and span, the pupil's warm foot, the catchlight. */
interface Eager { white: { at: number; width: number; span: number }; glow: { band: number; warm: number }; shine: number }
/** The package's eager eye (variant A): fixed on the food just in front, below the eyes. */
const EAGER: Eager = { white: { at: 10, width: 2, span: 55 }, glow: { band: 3, warm: 1.2 }, shine: 2.25 };
/** Review-only variant B: fixed on the food held out toward it, straight ahead, the wide eye's white round its outer foot. */
const EAGER_B: Eager = { white: { at: -28, width: 1.5, span: 42 }, glow: { band: 3.4, warm: 1.4 }, shine: 2.25 };
/**
 * The eager eye on the wide eye's ball (7% larger and 0.9 pt higher than the open eye), its large catchlight `shine`
 * in radius, riding the iris at half its travel from where the wide eye has it (Q28).
 */
const eager = (spec: EyeSpec, sx: number, e: Eager): EyeSpec => {
  const w = wide(spec, sx), eye = { ...w, white: { ...e.white, fade: 0.3 }, glow: e.glow };
  return { ...eye, shine: riding(eye, w, { at: w.shine.at, r: e.shine }) };
};

/** Proud's stars beside the head on the dog's right, where the panel puts them from the nose, its raised chin levelled. */
const STARS: Star[] = [{ at: [-74.9, -41.3], size: [11.4, 14.4], turn: 0 }, { at: [-60.3, -56.7], size: [9.6, 10.4], turn: 0 }];

// The one perked ear, as the One ear perked panel draws it (DECISIONS 133): flipped up over the head, a broad bean
// whose root rises from the crown's top corner beside the topknot and stands over the crown, the flap running out and a
// little down to its free end, which hangs just past the head's side (the panel's flap spans 0.2 to 1.2 of the head's
// half-width from the midline; its top stands about 11 pt above the topknot's). Where it turns over at the root the
// ear's inside shows in a darker wedge behind the fold. Typed on the dog's right ear in the head's frame from the
// panel levelled and scaled by its brows, mirrored for its left and rolled with the face. Ears draw behind the head in
// every state, so the crown's line hides the root's foot and the topknot its inner end, as the panel's crown meets it.
const perkedR: Node[] = [[-10.4, -147.6], [-10.6, -159], [-12.2, -166], [-15.8, -171.8], [-20, -175], [-24.8, -176], [-29.6, -175.4], [-34.8, -173.2],
  [-39.6, -169], [-44, -164.8], [-48.4, -161.6], [-53.2, -157.6], [-57, -152.6], [-59, -147.4], [-58.4, -142], [-56, -137.8], [-52, -135.4], [-46.4, -134.4],
  [-41, -135.4], [-36.4, -138.6], [-31.4, -143], [-25, -148.2], [-18.4, -150.6], [-13, -151.8]];
/**
 * The left's underside, where it crosses the resting head's notch (the left notch lies higher, under the crown at y
 * -140), 0.8 pt lower than the right's mirror, so its line shows whole below the notch's underside rather than as a
 * sliver beside it (DECISIONS 267). Every face that perks the left ear covers it with the temple.
 */
const PERK_L_UNDER: Record<string, Node> = { "-41,-135.4": [-41, -134.6], "-36.4,-138.6": [-36.4, -137.8] };
const perked = { R: smooth(rollN(perkedR)), L: smooth(rollN(mirrorX(perkedR.map((n) => PERK_L_UNDER[`${n[0]},${n[1]}`] ?? n)))) };
const onPerk = (side: "L" | "R", p: P): P => rollP(side === "R" ? p : [-p[0], p[1]]);
const perkD = (side: "L" | "R", d: string) => rollD(side === "R" ? d : mirrorD(d));
/**
 * With the ear up, its root no longer fills the notch under the crown's overhang at the temple: the head's side runs on
 * round from the overhang's tip down into the face's side. Typed in model space on each side, as the head's temples are
 * (they differ), its inner part under the head; only the notch shows. Its side runs down from under the overhang's tip
 * and bows in a little before the cheek, so the head stays round under a raised ear rather than walled (DECISIONS 147).
 */
const temples = {
  R: smooth([[-38, -140], [-44.2, -137.6], [-46.6, -134], [-46, -128.4], [-45.5, -122.6], [-45.6, -116.6], [-46.2, -112.4], [-45.6, -108.6], [-43.2, -105.8], [-38, -106.8],
    [-31, -122], [-29.6, -136.4]]),
  L: smooth([[28, -141.6], [35.8, -142.8], [40.4, -141.2], [42.8, -137.8], [42.9, -133], [42.5, -126.4], [42.4, -120], [43, -115], [43.7, -112], [43.3, -108.4], [41.2, -105.6],
    [36, -106.6], [29, -122], [26, -134]]),
};
/**
 * Each temple's line (DECISIONS 222), one span down its outer edge by the fur pass's recipes (DECISIONS 210): from where
 * the crown's line ends on the head (its join onto the resting ear's line, headFur's crossing, which a raised ear leaves
 * where it was), joined to it at full width, down to where the edge goes under the head's side, past the raised cheek
 * line's free end (`raised`), so the cheek's line takes over at full width with no thin stretch between them; on the
 * cream to where the hood's band reaches the edge, then on its tan, as deep there as the face's side at rest (0.6).
 * Before, two spans tapered over 2.5 and 6 pt, so the head's side faded where the line handed over (L* 66 at y -115
 * with the ear raised, 47 at rest).
 */
const TEMPLE_LINE = { R: { foot: [-45.9, -110.6] as P, tan: -129 }, L: { foot: [43.5, -110.2] as P, tan: -129 } };
function templeSpans(side: "L" | "R"): LitSpan[] {
  const join = (side === "R" ? HEAD.fur.crown[0]!.to : HEAD.fur.crown[1]!.from) as P, { foot, tan } = TEMPLE_LINE[side];
  return [{ from: join, to: foot, ends: ["join", "under"], on: (p: P) => (p[1] < tan ? "cream" : "tan"), under: (p: P) => (p[1] < tan ? 0 : 0.6) }];
}

/**
 * The temple a raised ear uncovers, its edge lined where the head's side now runs (the perked and the lifted ear's): a
 * part of its own on the head bone (temple.L, temple.R, state up), drawn after the ears and before the head, so the ear
 * swings on its spring behind a head that stays whole (R16). Painted as the head's own side, as Lifted slightly and One
 * ear perked paint it under a raised ear: the crown's cream coming down to the edge and the hood's tan band carrying on
 * up the side under it (the head's own patch, continued past the notch), shaded as the head is, with the notch filled
 * in, so neither the overhang's underside nor the notch's diagonal shows as an edge (DECISIONS 158).
 */
function templePiece(side: "L" | "R"): Piece {
  const g = uid("blur");
  // The hood's band as the head paints it (head.patch, the same shape and softness), so the swap never changes it.
  const band = `<defs>${blur(g, pad(bbox4(temples[side]), 3), PATCH_SOFT)}</defs><path d="${pathD(patches[side].segs)}" fill="${C.patch}" filter="url(#${g})"/>`;
  return lineGate(litPart(`temple.${side}`, temples[side], {
    fill: C.fur,
    under: band,
    // The head's own shade, from the same outline and light, so it runs on across the notch's edges with no seam.
    shade: headPaint.shade,
  }, templeSpans(side)));
}
/** A shape's bounds as a box. */
const bbox4 = (shape: Shape): Box => {
  const [x0, y0, x1, y1] = bbox(shape.segs);
  return [x0, y0, x1 - x0, y1 - y0];
};

/**
 * A raised ear's edge, by the rest ear's builder (earEdge(), DECISIONS 215, 221), so a swap between them never changes
 * the fur's hand: one low step on the flap's upper edge and the free end's hem in 3 or 4 rounded lock tips, as the One
 * ear perked and Lifted slightly panels draw them (each free end scalloped in soft lobes, the upper edge plain but for
 * one small step), and one line round it whose ends run on under the head. Typed on the dog's right ear in the head's
 * frame, in its path order (`step` and `hem` from the end nearer the root), and carried to the left reversed.
 */
function raisedEdge(side: "L" | "R", base: Shape, on: (p: P) => P, e: { step: [P, P]; hem: [P, P]; locks: Lock[]; line: [P, P]; lineL?: [P, P]; axis: [P, P] }) {
  const line = side === "L" && e.lineL ? e.lineL : e.line;
  const R = side === "R";
  const step = { lock: { ...EAR_STEP, lean: R ? 0.45 : -0.45 }, tipRound: 0.35 };
  return earEdge({
    base,
    steps: [R ? { ...step, from: on(e.step[0]), to: on(e.step[1]) } : { ...step, from: on(e.step[1]), to: on(e.step[0]) }],
    hem: R ? { from: on(e.hem[0]), to: on(e.hem[1]), locks: e.locks, tipRound: 0.4 } : { from: on(e.hem[1]), to: on(e.hem[0]), locks: reversedRow(e.locks), tipRound: 0.4 },
    axis: [on(e.axis[0]), on(e.axis[1])],
    line: R ? { from: on(line[0]), to: on(line[1]), ends: ["under", "under"] } : { from: on(line[1]), to: on(line[0]), ends: ["under", "under"] },
  });
}
// The perked flap's free end, over the head's side: three soft lobes round its end, the middle the fullest.
const PERK_HEM: Lock[] = [{ len: 1.2, width: 6.4, lean: 0.2, dip: 0.3 }, { len: 1.5, width: 8.4, lean: 0.3, dip: 0.3 }, { len: 1.1, width: 6.8, lean: 0.35 }];
const perkedEdge = (side: "L" | "R") => raisedEdge(side, perked[side], (p) => onPerk(side, p), {
  step: [[-43.6, -165.1], [-50.4, -160.2]], hem: [[-58.8, -149], [-47, -134.4]], locks: PERK_HEM,
  // Its line from its inner end, under the topknot, over its top and round the free end, to where its underside goes
  // behind the crown.
  line: [[-10.5, -154.6], [-37.6, -137.5]], axis: [[-19.5, -172.6], [-55.1, -139.4]],
});

function perkedEar(side: "L" | "R"): Piece {
  const on = (p: P) => onPerk(side, p);
  const edge = perkedEdge(side);
  const paint = earFur({
    ear: edge.shape, edge,
    axis: [on([-19.5, -172.6]), on([-55.1, -139.4])],
    deepen: [0.35, 1],
    // Four locks running out along the flap to its free end, as the panel paints its fur.
    locks: ([[[-30.6, -171], [-39.2, -166], [-47.6, -159.2], [-53.2, -151.9]], [[-32.3, -163.3], [-40.8, -157.4], [-48.3, -150.7], [-54, -144.2]],
      [[-33.8, -154.6], [-41.5, -148.8], [-48, -142.3], [-52.1, -137.9]], [[-38, -146.4], [-43, -141.4], [-46.6, -137.4]]] as P[][]).map((pts) => pts.map(on)),
    dips: [on([-54.4, -137.6])],
    light: perkD(side, "M-16 -171 C-20 -175 -28 -175.4 -36 -172 C-42 -168.8 -46 -164.6 -48 -162.4 C-42 -164 -36 -167.4 -29 -169.6 C-24 -170.6 -19.6 -170.2 -16 -171Z"),
    // Where the root sits down behind the crown, the crown's contact shade.
    under: [perkD(side, "M-8 -156 C-16 -152.6 -26 -150 -34 -143 C-38 -139.8 -42 -136.4 -46 -134 L-30 -130 L-8 -146Z")],
    // The fold where the root turns over, the ear's inside a little deeper behind it.
    fold: { line: ([[-21.7, -161.5], [-24.8, -156.8], [-26.9, -151.9], [-29, -146.9]] as P[]).map(on),
      back: perkD(side, "M-19.6 -160.4 L-21.7 -161.5 L-24.8 -156.8 L-26.9 -151.9 L-29 -146.9 L-18 -148Z") },
  });
  return lineGate(litPart(`ear.${side}`, edge.shape, paint, [edge.span]));
}

// The lifted ear, the listening tell, as Lifted slightly draws it (DECISIONS 146): the root raised behind the crown's
// top corner, so the flap stands out above the crown beside the topknot, and the flap tipped toward us, a broad round
// paddle running out and down at about 45° to a full lobe level with the brows, about two thirds of the hanging
// ear's length, its inside showing in a deeper band along its lower inner edge, where it tucks behind the head's side.
// Typed on the dog's right ear in the head's frame from the panel laid on the head by its width (1.04 pt a pixel)
// and its top, mirrored for the left and rolled with the face. The temple it uncovers is the perked ear's, on the head
// (templePiece). Its lower inner edge runs on in under the temple (drawn after it), so no card shows between the ear
// and the head, and the ear's spring swings it behind a head that stays whole.
const liftedR: Node[] = [[-27.6, -141.6], [-33, -155.8], [-42, -158.4], [-52, -157], [-62, -152.6], [-71.6, -146.8], [-79.6, -139], [-84.2, -129],
  [-84.4, -119.6], [-80.2, -110.6], [-73, -106.6], [-64.8, -108.4], [-57.6, -113.4], [-50.4, -117.6], [-45.6, -123.4], [-43.4, -130], [-40, -137.6],
  [-35, -143.6], [-31, -145.4]];
const lifted = { R: smooth(rollN(liftedR)), L: smooth(rollN(mirrorX(liftedR))) };

// The lifted paddle's lobe: four soft lock tips round its end and along its lower edge, as Lifted slightly draws them.
const LIFT_HEM: Lock[] = [{ len: 1.25, width: 7.4, lean: 0.2, dip: 0.25 }, { len: 1.6, width: 8.6, lean: 0.25, dip: 0.3 }, { len: 1.1, width: 6.2, lean: 0.3, dip: 0.3 },
  { len: 1.4, width: 6.8, lean: 0.35 }];
const liftedEdge = (side: "L" | "R") => raisedEdge(side, lifted[side], (p) => onPerk(side, p), {
  step: [[-63.6, -151.8], [-70.4, -147.6]], hem: [[-84.2, -124], [-66.4, -107.8]], locks: LIFT_HEM,
  // Its line from where the root comes out from behind the topknot, over its top, round the lobe and back along its
  // lower edge to where it goes behind the head (the temple's edge, or with the temple down the head's own notch, which
  // on the left lies higher).
  line: [[-28.8, -146.4], [-40.8, -136.6]], lineL: [[-28.8, -146.4], [-36.4, -142.6]], axis: [[-36, -152], [-76, -108]],
});

function liftedEar(side: "L" | "R"): Piece {
  const on = (p: P) => onPerk(side, p);
  const edge = liftedEdge(side);
  const paint = earFur({
    ear: edge.shape, edge,
    axis: [on([-36, -152]), on([-76, -108])],
    deepen: [0.3, 1],
    // Five locks running out along the paddle into its lobe, as the panel paints its fur.
    locks: ([[[-45, -154.6], [-56, -150], [-66, -143.4], [-74, -134.6], [-79, -124.4]], [[-46, -147.6], [-56, -142], [-64.4, -134], [-70.4, -124.6], [-73.6, -115]],
      [[-48.4, -140], [-56.4, -133.4], [-62.6, -124.6], [-65.6, -114.6]], [[-60, -150.4], [-70, -143], [-77.4, -134]], [[-53, -128.6], [-58, -120.4], [-60, -113]]] as P[][])
      .map((pts) => pts.map(on)),
    dips: [on([-82.6, -117])],
    light: perkD(side, "M-40 -157 C-50 -158.4 -62 -154.6 -72 -147 C-77 -143 -80 -138.4 -81.4 -134 C-76 -137.4 -70 -142.4 -62 -146.4 C-54 -150.2 -46 -152.4 -40 -153Z"),
    // Where the root goes down behind the crown, the crown's contact shade.
    under: [perkD(side, "M-24 -146 C-32 -148 -40 -144 -46 -138 L-50 -128 L-36 -130 L-24 -140Z")],
    // The flap tipped toward us shows its inside along the lower inner edge, behind a soft fold.
    fold: { line: ([[-38.4, -146.2], [-45.6, -139.4], [-51, -131.2], [-55.6, -122.4], [-60.4, -114.6]] as P[]).map(on),
      back: perkD(side, "M-30.6 -147.6 L-38.4 -146.2 L-45.6 -139.4 L-51 -131.2 L-55.6 -122.4 L-60.4 -114.6 L-57.6 -113.4 L-50.4 -117.6 L-45.6 -123.4 L-43.4 -130 L-40 -137.6 L-35 -143.6Z") },
  });
  return lineGate(litPart(`ear.${side}`, edge.shape, paint, [edge.span]));
}

/** Every face state the front draws besides its rest, each with its part and state. */
export function faceStates(): Drawn[] {
  const out: Drawn[] = [];
  for (const side of ["L", "R"] as const) for (const state of EYE_STATES) out.push({ part: `eye.${side}`, state, piece: eyeState(state, side) });
  for (const state of MOUTH_STATES) if (state !== "open") out.push({ part: "mouth", state, piece: mouth(state, FRAME).piece });
  for (const state of ["raised", "happy"] as const) {
    out.push({ part: "brow.L", state, piece: brow(state, 1, FRAME).piece }, { part: "brow.R", state, piece: brow(state, -1, FRAME).piece });
  }
  for (const side of ["L", "R"] as const) {
    out.push({ part: `ear.${side}`, state: "onePerked", piece: perkedEar(side) }, { part: `ear.${side}`, state: "lifted", piece: liftedEar(side) });
    // The temple under either raised ear, on the head: the ear's spring swings the flap, never the head's side.
    out.push({ part: `temple.${side}`, state: "up", piece: templePiece(side) });
  }
  out.push({ part: "stars", state: "sparkle", piece: stars(STARS, FRAME) });
  // Huffy's puffed cheeks, inside the head's outline (variant A).
  out.push({ part: "cheeks", state: "puffed", piece: puffedCheeks(FRAME) });
  // The head's line with an ear raised off its temple on one side or both (DECISIONS 147).
  out.push({ part: "head.line", state: "templeL", piece: headLinePiece({ L: true, R: false }) },
    { part: "head.line", state: "templeR", piece: headLinePiece({ L: false, R: true }) },
    { part: "head.line", state: "temples", piece: headLinePiece({ L: true, R: true }) });
  return out;
}

/**
 * The review-only drawings (qa/phase3/faces/new/new.ts), never in the package: the new faces' variant B and tender's
 * softer lid, each under a state of its own so one scratch package draws both variants. Variant B of hungry looks
 * straight out at the food held toward it, its tongue peeking from the smile's corner; variant B of huffy puffs the
 * head itself, its outline swelling 4.4 pt at each cheek, with the head's line to match. Q2's eyes, the founder's
 * choice, are in the package now (`squeeze`, `sparkle`).
 */
export function reviewStates(): Drawn[] {
  const out: Drawn[] = [];
  for (const side of ["L", "R"] as const) {
    const sx = side === "L" ? 1 : -1, noseward: 1 | -1 = side === "L" ? -1 : 1;
    const spec = eyeSpec(side === "L" ? EYE_L : EYE_R, noseward);
    out.push({ part: `eye.${side}`, state: "eagerB", piece: sharedEye(eager(spec, sx, EAGER_B)) });
    out.push({ part: `eye.${side}`, state: "sleepySoft", piece: sharedEye(softHalfLid(side)) });
    // The squeeze in the outline's warm brown, the other reading of "the warm line colour" (DECISIONS 202): not taken.
    out.push({ part: `eye.${side}`, state: "squeezeWarm", piece: chevron({ ...squeeze(side), colour: C.warmLine }) });
  }
  out.push({ part: "mouth", state: "o.tongueB", piece: oTongue(FRAME).piece });
  const puffed = headOf(PUFF_B);
  out.push({ part: "head.base", state: "puffed", piece: part("head.base", puffed.head, headPaintOf(puffed.head)) });
  out.push({ part: "head.line", state: "puffed", piece: headLinePiece({ L: false, R: false }, puffed) });
  return out;
}
/** How far variant B's cheeks swell past the head's outline at their fullest, in points. */
const PUFF_B = 4.4;

/**
 * A softer half-lid for tender, review-only (DECISIONS 162): the Sleepy half-lid's lid a little higher at its ends and
 * arched up over the iris instead of bowed down across it, its lash thinner, the catchlight under the arch's middle,
 * so the eye reads drowsy and soft rather than deadpan. Spec L457 gives tender the sleepy eye, so it is the founder's.
 */
function softHalfLid(side: "L" | "R"): EyeSpec {
  const spec = eyeStateSpec("sleepy", side), cover = spec.cover!;
  // The catchlight a point under the ball's middle, 2.2 pt under the arch's top; the open eye's own goes there too, so
  // none shows twice under the arch.
  const shine = { at: [cover.shine.at[0], -1] as [number, number], r: 1.5 };
  return { ...spec, shine, cover: { ...cover, level: -2.6, bow: -1.4, lash: 1.3, overhang: 0.6, shine } };
}

/** The face frame and its roll, for the R3 guards (characters/dog/test/faces.test.ts), which hold what each recipe draws here. */
export const faceFrame = { frame: FRAME, rollDeg: ROLL_DEG };

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
