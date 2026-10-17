// The dog's side view, facing the sheet's left (side.L: the dog's left side
// toward the viewer, DECISIONS 1): shapes first, every node typed by hand in
// model space (points, the ground under the seat at 0, 0, y down) at the
// extremes and inflections read off the side turnaround
// (master.turnaround.side), then paint, by the front view's recipes where the
// part is the same thing turned (the ear, the eye, the nose, the collar, the
// tag, the paws). One light group holds the whole near side of the body (back
// and haunch, chest, near legs), so their joins carry no rim; the far front
// leg is painted on its own, darker. side.R is this view mirrored (views/facing.ts): side() takes the facing.
import { CLUMPS, furEdge, furSpan, STEP, type FurRules, type Lock } from "../../../draw/fur.ts";
import { bbox, ellipse, fracAt, pathD, sample, smooth, spanPoints, v, type P, type Shape } from "../../../draw/geom.ts";
import { ribbons, strokeOf, type DrawnLine, type Outline, type Stroke } from "../../../draw/line.ts";
import { LIMITS, lineGate, reach } from "../../../draw/lint.ts";
import { LIGHT, marking, part, soft, type Fade, type Paint } from "../../../draw/paint.ts";
import { blur, join, mask, pad, piece, region, uid, type Box, type Piece } from "../../../draw/svg.ts";
import { model } from "../model.ts";
import { C } from "../palette.ts";
import type { BrowState } from "../parts/brow.ts";
import { chevron, eye, riding, type Chevron, type EyeSpec, type LidBand } from "../parts/eye.ts";
import { turnedCheeks, type TurnedPuff } from "../parts/cheeks.ts";
import type { Star } from "../parts/stars.ts";
import { browState, drawLid, lickTip, paintOpen, paintOval, PROFILE_MOUTHS, turnedStars, type LidState, type ProfileMouthState, type TurnedEyeLid, type TurnedMouth } from "../parts/turned.ts";
import { litEdge, litMarking, litPart, type LitSpan } from "../parts/lines.ts";
import { curlShapes, topknot, type Curl } from "../parts/topknot.ts";
import { earEdge, earFur } from "../parts/ear.ts";
import { headFur } from "../parts/headfur.ts";
import { lobed, toes } from "../parts/paw.ts";
import { tagPaint } from "../parts/tag.ts";
import { brush, deepen, strands } from "../parts/marking.ts";
import { groundShadow } from "../parts/shadow.ts";
import { type Drawn } from "./front.ts";

// The eye states this view draws besides its open eye, on its one eye: every state the front draws (DECISIONS 170 to
// 172, 200 to 207).
const EYE_STATES = ["happy", "squeeze", "closed", "sleepy", "wink", "wide", "peek", "sparkle", "eager", "flat", "peekBack"] as const;
import { facing, type Facing, type Side } from "./facing.ts";

const INNER = model.outline.innerPt;
/** Lines on fur spans and small parts: lighter, and never under 1.2 pt (as the front draws them). */
const THIN = 1.2;
const LM = model.landmarks["side.L"]!;

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const fmt = (n: number) => r3(n).toString();
/** A tapered line drawn as a filled polygon, with its meta for the lint built from what strokeOf draws (as the front's). */
function tapered(pts: P[], width: number, kind: "outer" | "inner", where: string, opts: Stroke = {}): { d: string; line: DrawnLine } {
  const s = strokeOf(pts, width, { band: LIMITS[kind], ...opts });
  return { d: s.d, line: { kind, width, where, drawn: s.drawn } };
}
/** A part's canvas grown to hold its light group's shade where the group reaches past the part. */
const roomy = (p: Piece, by: number): Piece => ({ ...p, box: pad(p.box, by) });
/** A shape's middle across, about which a light typed toward the top left is reflected for the other facing. */
const middle = (s: Shape) => {
  const [x0, , x1] = bbox(s.segs);
  return (x0 + x1) / 2;
};
/** A box round some points. */
const boxOf = (pts: P[], by = 0): Box => {
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  return pad([Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)], by);
};

// Shapes.

// The back and the haunch (body.back): the topline from under the collar's
// back end, sloping down over the back to the rump (x 19.4 at y -21, where the
// tail's tan crosses it), round the haunch's back and its underside along the
// ground behind the hind paw, then up the thigh's front, one round arc that
// sweeps up and back from behind the hind paw's top (x -28.8 at y -14.6) to
// under the saddle (x -20.4 at y -35.6), as the sheet draws it; above that it
// runs on up under the chest to the collar, hidden.
// The thigh's front comes out from behind the hind paw's top at x -26 (y -16.4) and rises upright to y -21, then curves
// up and back, x -24.2 at y -25 and -21.8 at -30, as the crop's thin line runs (its line map: x -25.6 from y -16 to
// -21.8, -24.1 at -25.6, -21.8 at -29.5; DECISIONS 238), not slanting forward from the paw's toe; left of it, above the
// hind paw, the belly's warm shade fills the crease up to it (belly()).
const back = smooth([[-30, -62.8], [-20, -63.6], [-11.6, -62.6], [-4, -59.4], [2.6, -54.6], [8, -49.2], [12.4, -43], [16.2, -34.8], [18.6, -27.8],
  [19.4, -21], [18.8, -15.4], [17.2, -10.8], [14.6, -6.6], [10.6, -3.6], [4, -2], [-24, -2.4], [-27.4, -3.6], [-28, -9],
  [-26.6, -14.6], [-25.5, -20], [-24.2, -25], [-21.8, -30], [-20.4, -35.6], [-26, -46]]);

// The chest (body.front): from under the chin and the collar down its front,
// hidden behind the tag, to the tag's foot (x -63.6 at y -35.2), where its edge
// shows for a short way, slanting back over the far leg to meet the near leg's
// front (x -55.8 at y -25), as the sheet draws it; behind the near leg down to
// the belly between the paws; its back reaches well in under the back body, so
// the hips can turn without opening a gap.
// Between the near paw's heel and the hind paw's toe, where the two buns lean on each other, the chest's belly shows
// in a small triangle on the ground (DECISIONS 238), its foot on the ground line there.
const chest = smooth([[-61.8, -50], [-60.6, -58.6], [-50, -64.8], [-36, -66], [-22, -64.4], [-12.4, -60.4], [-5.6, -53.6], [-4, -44], [-7.6, -32], [-16, -20],
  [-26.4, -10.4], [-28.8, -4.6], [-31.4, -2.2], [-36, -1.5], [-44, -2.6], [-53, -3.6], [-55.4, -12], [-55.4, -21.6], [-56.6, -24.6], [-58.2, -27.4], [-61.2, -30.4],
  [-63.2, -35], [-63.2, -42]]);

// The near front leg (front.L): it comes out of the chest at the wrist (x
// -55.8 at y -25), where the chest's edge over the far leg meets it, and swells
// forward at once into a round bun of a paw, its top-front arching out from the
// wrist (x -59.8 at y -19.2) round a domed toe end (x -64.8 at y -8.6), its
// sole on the ground from x -63 to the heel at x -35.6, which turns up round
// into the belly's shade; its back edge lies on the chest with no line, and its
// top, hidden in the chest's fur, is feathered.
// As the crop draws it (DECISIONS 238): the leg comes straight down from the wrist (x -56.6 at y -24.6) to y -18,
// where the bun swells out round its toe end (x -64.6); its heel turns up round and leans on the hind paw's toe, the
// two buns crossing in a small inverted V over the belly's shade (the crop's apex at about x -33, y -6 to -9).
// Its sole lies flat on the ground in three low toe lobes, scalloping up half a point between them (x -56 and -51.2),
// as the crop's sole line dips there; its toe lines rise where the crop's line map has them (legNearPaint).
const legNear = lobed(smooth([[-48, -43], [-54.8, -32.4], [-56.6, -24.6], [-57, -20.2], [-58.6, -17], [-62, -14.4], [-64.2, -10.6], [-64.6, -7], [-63.4, -3.6],
  [-61.2, -1.4], [-58.4, -0.55], [-56, -0.9], [-53.6, -0.5], [-51.2, -0.9], [-48, -0.5], [-44, -0.65], [-40, -1.8], [-36.6, -4], [-34.2, -6.6], [-33, -9.2],
  [-33, -11.4], [-34, -14], [-37.2, -22], [-41.4, -39]], { corners: [11, 13] }),
// Its sole's toe lobes, as round as the crop draws them (Q29).
[[[-63.4, -3.6], [-56, -0.9]], [[-56, -0.9], [-51.2, -0.9]], [[-51.2, -0.9], [-44, -0.65]]]);

// The far front leg (front.R): only its front shows, a wedge from the tag's
// foot (x -63.6 at y -35.2) widening down to a round bun of a paw that sits a
// little ahead of the near one and higher, its top bulging out from the leg (x
// -71.6 at y -18.6) round a domed toe end (x -75) to its sole at y -4.6; the
// rest lies behind the chest and the near leg, up to its top, hidden, by the
// shoulder both front legs turn at (DECISIONS 60).
const legFar = smooth([[-46, -40], [-53, -45], [-60.4, -42], [-63.6, -35.2], [-66.2, -29.4], [-67.8, -23.8], [-69.4, -20.6], [-71.8, -18.6], [-74, -16],
  [-75, -12], [-74.4, -8.2], [-72.2, -5.6], [-68.4, -4.6], [-61, -4.6], [-57, -8], [-55, -18], [-52.6, -28], [-48.6, -35]]);

// The near hind paw (hind.L): a plump round bun tucked forward under the
// thigh, about as tall as the front paw, its front domed (its toe end x -32
// at y -8.6), its top arching up from there under the thigh's front and on
// over its crown, its back hidden in the haunch, its sole on the ground running
// on into the haunch's underside.
const hindNear = lobed(smooth([[-33.2, -9], [-31.8, -12.4], [-28.8, -15.4], [-24, -16.8], [-18.6, -16.6], [-14.2, -15], [-11.6, -11.8], [-10.8, -7.4],
  [-12.2, -3.2], [-16, -1.1], [-18.8, -0.6], [-21.8, -0.95], [-24.8, -0.6], [-27.6, -0.95], [-30, -1.2], [-31.8, -2.4], [-33, -5.8]], { corners: [11, 13] }),
// Its sole's toe lobes, as round as the crop draws them (Q29: tighter than the 4 pt corner rule, within the toe lobes' own floor).
[[[-16, -1.1], [-21.8, -0.95]], [[-21.8, -0.95], [-27.6, -0.95]], [[-27.6, -0.95], [-33, -5.8]]]);

// The tail: a fluffy plume behind the rump, its tan root hugging the body from
// y -10 to -35, its front contour rising from the rump to a curl that hooks
// down and back toward the body at its front (x 15.4 at y -53), as the sheet
// draws it; its outline one soft line round a small lock at the top of the curl
// and the flame-like locks down its back (below); its underside rounding down
// (lowest at x 20, y -8.3) and rolling up along the haunch's line, as the crop's
// does (audit side #16), its root hidden under the rump.
/** The plume's back's notches between its locks, in path order (each where one lock's tip hangs over the next). */
const tailNotches: P[] = [];
// Down its back the plume breaks into flame-like locks, each pointed and leaning down the plume, its tip hanging over
// the lock below, which comes out from behind it a little further out, as the side crop and the tail-curve panel draw
// them (draw/fur.ts CLUMPS, DECISIONS 213, 237): the crop's line map has the notches at x 38.3 y -57.6, 42 at -50, 45.4
// at -31.5 and 42 at -22.5, the edge stepping out 1 to 3 pt below each; the long run between -50 and -31.5 is two locks
// with a shallow notch between them (0.25 pt) and no tuck; never tuft-sized teeth, nor even round lobes (a cloud).
const TAIL_ROWS: [P, P, Lock[], number, boolean][] = [
  [[20.6, -59.6], [27.2, -61.8], [{ len: 1.4, width: 6.8, lean: 0.45 }], 0.3, false],
  [[38, -57.4], [38.8, -17.2], [{ len: 1.9, width: 9, lean: 0.6, dip: 0.45 }, { len: 1.5, width: 10, lean: 0.45, dip: 0.25 }, { len: 1.9, width: 9.6, lean: 0.6, dip: 0.45 },
    { len: 1.4, width: 8.6, lean: 0.55, dip: 0.4 }, { len: 1.1, width: 6.4, lean: 0.4 }], 0.14, true],
];
const tail = furSpan(TAIL_ROWS.reduce((s, [a, b, locks, round, back]) => furEdge(s, a, b, locks, round, (_tip, _root, [, n]) => void (back && tailNotches.push(n)), CLUMPS),
  smooth([[10, -22], [17.4, -35.2], [19.8, -39.4], [20.8, -43.8], [19.6, -47.6], [17.2, -50.4], [15.4, -53.2],
    [15.8, -56.4], [18.4, -59], [22.4, -60.6], [29, -61.6], [35.8, -59.2], [39.8, -55.4], [43, -50], [45, -42.4], [45.2, -35], [44.2, -28.6], [41.6, -23], [37, -18.4],
    [31.4, -13.4], [24.4, -9.5], [20, -8.3], [16.8, -9.8], [14.6, -13.6]])), [17.2, -50.4], [38.8, -17.2]);
/**
 * The plume's back's notches where a lock's tip hangs over the next (the crop's x 38.3 y -57.6, 42 at -50, 45.4 at
 * -31.5, 42 at -22.5): the row's start, and the notches after its first, third and fourth locks (the second's is soft).
 */
const tailTuckAt = (): P[] => [[38, -57.4], tailNotches[0]!, tailNotches[2]!, tailNotches[3]!];
/** Each notch's tuck: the way the lock above it runs on inside, and how far, from the crop's line map. */
const TAIL_TUCKS: [P, number][] = [[[0.3, 1], 4], [[0, 1], 4.4], [[-0.45, 1], 2], [[-1, 0.35], 3]];
/** How near a point lies to a notch of the plume's back, 1 in it, 0 well clear of it (the line deepens into each notch). */
const nearNotch = (p: P) => Math.max(0, ...tailTuckAt().map((n) => Math.exp(-((v.len(v.sub(p, n)) / 1.6) ** 2))));

// The collar: a band round the neck, almost as thick at its back as at its
// front (about 11 pt under the chin, where the jaw's fur lies over its top,
// about 9 pt of it showing, as the sheet's does, and 8 pt by the ear), its front end a round turn
// under the jaw (x -62.2) where the band wraps round the throat, its top edge
// rising under the jaw to the ear's foot, its bottom edge rising steeply behind
// the shoulder so its back end goes up square under the ear's foot (hidden
// from x -18), as the sheet draws it.
const collar = smooth([[-62.6, -55.4], [-61.4, -59.2], [-55.9, -60.5], [-48.8, -61.7], [-41.7, -62.6], [-34.7, -63.6], [-27.6, -64.7], [-22, -65.5], [-17, -66.2],
  [-14.6, -65.6], [-14.8, -63.6], [-17.6, -62.4], [-20.6, -59.8], [-24, -57.4], [-27.6, -55.8], [-34.7, -53.2], [-41.7, -51.2], [-48.8, -50], [-55.9, -50.2],
  [-60.6, -51.4]]);

// The tag, a little turned: a round, coin-like heart (12.5 pt wide, 13.5 pt
// tall; the front's is 17.9 wide), its lobe toward us the higher, the dip between
// them shallow where its ring holds it, widest a little below its middle and
// narrowing to a soft round foot left of its middle, hanging right under the
// collar's front from a small ring, as the side crop draws it (its gold by phase
// 2's tag finder x -65.3 to -54.4, y -51.3 to -38.9, its rim round that; audit
// side #7; DECISIONS 240).
const HEART_NODES: P[] = [[-60.4, -51], [-62.4, -52], [-64.6, -51.2], [-65.9, -49.4], [-66.2, -46.6], [-65.9, -43.6], [-64.8, -41.2], [-63.2, -39.4], [-61.7, -38.6],
  [-60.1, -39.2], [-57.8, -41], [-55.4, -43], [-54, -45.4], [-53.7, -47.6], [-54.4, -49.8], [-56.2, -51.1], [-58.4, -51.4]];
const heart = smooth(HEART_NODES, { corners: [0] });
/** The embossed heart, a little left of the coin's middle, as a turned coin shows it (the side crop shows one ring on so small a coin): a heart of its own, its lobes rounder and its foot a soft point. */
const EMBOSS: P[] = [[-61.4, -48.4], [-62.6, -49.4], [-64.2, -49.2], [-65, -47.6], [-64.6, -45.6], [-63.2, -43.8], [-61.4, -42.4], [-59.6, -43.8], [-58.4, -45.6],
  [-58.1, -47.6], [-58.8, -49.2], [-60.3, -49.4]];
const embossed = [smooth(EMBOSS, { corners: [0] })];

// The ear: a broad droplet hanging over the head's side, its top under the
// crown's fur (the root, the ear's highest tan, at x -12.9, y -143.8), a
// narrower, rounder top than a flat dome, its front coming down from a round
// shoulder (x -30.8 at y -132) behind the head patch, curving in (x -29.4 at y
// -124) then out round the cheek (x -37.2 at y -86), its foot broad and round
// (lowest at x -13), and its back edge along the back of the head, out to x
// 21.6, as the sheet draws it.
// Its edge, by the dog's one ear recipe (parts/ear.ts earEdge, DECISIONS 215), as the floppy-ears panel and the side
// crop draw it: one broad low step 40% of the way down its front edge, where the crop draws a small lock's S-curve
// (audit side #3), its back edge smooth; its hem a round U of four low lock tips of uneven width (below). Its top, where
// it comes out from under the crown, lies under the crown's fur with no line (DECISIONS 68): the crown's locks hang
// over it (crownFur()).
const EAR_BASE = smooth([[8.6, -133.6], [13.4, -124.6], [16.2, -114.6], [19, -104.4], [22.2, -94], [21.6, -84.4], [18.6, -76.6], [12.6, -70.4],
  [4, -66], [-13, -62.8], [-21.4, -64], [-28.8, -69], [-35, -77], [-37.6, -86.4], [-37, -96], [-34.6, -106], [-32.4, -115.4],
  [-31.2, -124], [-30.6, -133.6], [-25, -140.2], [-18.6, -143.2], [-12.9, -143.8], [-5, -143], [1.6, -139.6]]);

// The head: the muzzle's profile from the upper lip's front (x -95.2 at y
// -85.6) down to the lip's notch (x -92.8 at y -80.2), the chin and the jaw
// sweeping back to the collar's front end (x -70 at y -63.8, where the sheet
// draws the jaw's line); up from the lip round the nose's
// front, where the nose's own edge is the profile's tip (the nose, clipped to
// the head, fills it to its edge), and from the nose's top into the short
// bridge, the stop (x -85 at y -104.4) and the forehead rising into
// the crown's fur; over the crown under the topknot, down its back past a last
// small lock above the ear (x 3 at y -143), and behind the ear and along the
// collar's top, hidden.
/** Each forehead lock's tip, its root and its notches (path order), for the hook drawn into it. */
type ForeLock = { tip: P; root: P; notches: [P, P] };
const foreLocks: ForeLock[] = [];
const noteLock = (tip: P, root: P, notches: [P, P]) => foreLocks.push({ tip, root, notches });
/** Each forehead lock's underside line from its tip, as offsets from the tip (the crop's line map, DECISIONS 236): the lower lock's, then the upper's. */
const FORE_HOOKS: P[][] = [[[0.3, -0.1], [3.6, -0.2], [6.6, -2.2], [9.4, -4.7], [11.8, -6.9]], [[0.3, -0.1], [2.4, 0], [4.8, -0.3]]];
/**
 * The jaw's wisps over the collar (DECISIONS 236): low and soft, 0.5 to 1.4 pt over 2.5 to 4.5 pt (at least a fifth as long as wide), as the crop's white
 * strands just cross the band's top; the tufts' 2 to 4 pt (draw/fur.ts TUFTS), and an even row of four 1 pt wisps, hung
 * over the band as a row of teeth.
 */
/** The crown's cream over the ear's top (crownFur): three broad low locks, uneven, as CLUMPS but lower for their width (the crop's soft edge there dips under 2 pt). */
const CROWN_LOCKS: FurRules = { count: [2, 4], len: [0.6, 2], width: [5, 12], tipRound: 0.35, lean: [0.2, 0.6], ratio: 0.08, vary: 0.2, dip: [0.3, 0.8], fit: 0.15 };
const JAW_WISPS: FurRules = { count: [3, 5], len: [0.5, 1.4], width: [2.5, 4.5], tipRound: 0.25, lean: [0.3, 0.6], ratio: 0.2, vary: 0.2, dip: [0.2, 0.5], fit: 0.15 };
/**
 * The forehead's two locks, as the side crop draws them (DECISIONS 236): the lower from the small notch where the
 * forehead's line turns in (the crop's x -77.7, y -130.6) to its tip (x -78.5, y -134.5), the upper running on up the
 * forehead to its own tip (x -69.2, y -147.3), 16 pt along it; each tip a sharp "<" pointing forward, its underside
 * folding back into the fur (FORE_HOOKS). The upper is broader than any shared row allows (fur.ts CLUMPS and STEP stop at
 * 10 pt), so the row is held by its own rules, its widths the crop's (8 to 16 pt) and its tips as sharp as TUFTS'.
 */
const FOREHEAD: FurRules = { count: [2, 2], len: [1.2, 2.6], width: [8, 16], tipRound: 0.25, lean: [0.3, 0.6], ratio: 0.1, vary: 0.2, dip: [0, 0.6], fit: 0.15 };
// The head before the chin's fur, its path starting under the ear behind the jaw, so the jaw's wisps over the collar
// and the chin's row each lie on one run of it.
const HEAD_OUTLINE = smooth([[-28, -63.8], [-50, -58.8], [-60.8, -59.6], [-70, -63.8], [-80.6, -67.4], [-91.2, -75.8], [-92.8, -80.2], [-95.2, -85.6], [-96.6, -92.2],
  [-96, -97.2], [-92.4, -100.3], [-85, -104.4], [-84, -112.6], [-81, -124.4], [-77.8, -132.6], [-74, -140.2], [-69, -146.4], [-62.6, -151.4],
  [-20, -155.8], [-4, -149], [10, -131], [15.4, -110], [14, -78]]);
const HEAD_BASE = furEdge(furEdge(furEdge(HEAD_OUTLINE,
// The jaw's fur over the collar's top behind the chin breaks into a few low white wisps, as the crop draws it (audit
// side #6), combed back down the neck, unlined, the collar's own rim their edge (DECISIONS 236; JAW_WISPS).
[-43, -60.4], [-55, -59.1], [{ len: 0.7, width: 3.2, lean: -0.55, dip: 0.2, notch: 0.6 }, { len: 0.55, width: 2.5, lean: -0.4, dip: 0.2, notch: 0.6 },
  { len: 0.75, width: 3.4, lean: -0.5, dip: 0.2, notch: 0.6 }, { len: 0.6, width: 2.6, lean: -0.45 }], 0.18, undefined, JAW_WISPS), [-78.9, -129.6], [-65.8, -149.6],
// The forehead's fur breaks into two locks below the topknot, their tips combed forward and hooking back in under
// themselves, as the sheet draws them.
[{ len: 1.4, width: 8.6, lean: -0.5, dip: 0.3 }, { len: 2.2, width: 15.4, lean: -0.5 }], 0.18, noteLock, FOREHEAD),
// Down the back of the head, between the topknot and the ear's top, one small low lock, its tip hooking in, as the sheet
// draws it (a step in the edge: draw/fur.ts STEP).
[-0.4, -146.9], [4.4, -139.8], [{ len: 0.8, width: 8.8, lean: -0.35 }], 0.32, noteLock, STEP);
/**
 * The chin in profile (parts/headfur.ts, DECISIONS 214, 236): its line runs from the lip's notch round the chin and
 * along the jaw to the collar's front, where it ends in a small wiggle of two tufts on the collar's top front, as the
 * crop draws it; behind them the jaw's wisps lie over the collar unlined.
 */
const CHIN: Lock[] = [{ len: 0.8, width: 2.8, lean: -0.3, dip: 0.2 }, { len: 1, width: 2.6, lean: -0.4 }];
const HEAD_FUR = headFur({
  base: HEAD_BASE,
  chin: { from: [-60.8, -59.6], to: [-65.8, -62], scallops: CHIN, tipRound: 0.22, profile: true, corners: [],
    line: { from: [-60.8, -59.6], to: [-92.7, -80], ends: ["free", "join"], under: 0.55 } },
});
const head = HEAD_FUR.head;

/** Where two closed outlines cross nearest a place, from their samples (the ear's line takes up the head's there). */
function crossing(a: Shape, b: Shape, near: P): P {
  const pa = sample(a.segs, 32), pb = sample(b.segs, 32);
  let best: P | undefined, d = Infinity;
  for (let i = 0; i < pa.length; i++) {
    const p = pa[i]!, q = pa[(i + 1) % pa.length]!;
    for (let j = 0; j < pb.length; j++) {
      const r = pb[j]!, t = pb[(j + 1) % pb.length]!;
      const den = (q[0] - p[0]) * (t[1] - r[1]) - (q[1] - p[1]) * (t[0] - r[0]);
      if (Math.abs(den) < 1e-12) continue;
      const u = ((r[0] - p[0]) * (t[1] - r[1]) - (r[1] - p[1]) * (t[0] - r[0])) / den, w = ((r[0] - p[0]) * (q[1] - p[1]) - (r[1] - p[1]) * (q[0] - p[0])) / den;
      if (u < 0 || u >= 1 || w < 0 || w >= 1) continue;
      const x: P = [p[0] + u * (q[0] - p[0]), p[1] + u * (q[1] - p[1])];
      if (Math.hypot(x[0] - near[0], x[1] - near[1]) < d) (best = x), (d = Math.hypot(x[0] - near[0], x[1] - near[1]));
    }
  }
  if (!best || d > 4) throw new Error(`side: the outlines cross ${best ? `${d.toFixed(2)} pt from (${near.join(", ")}), at (${best.map((n) => n.toFixed(2)).join(", ")})` : `nowhere near (${near.join(", ")})`}`);
  return best;
}
/** Where the back of the head goes under the ear: the ear's line takes up the head's there (DECISIONS 215, 236). */
const EAR_JOIN = crossing(head, EAR_BASE, [9, -133]);
const EAR_EDGE = earEdge({
  base: EAR_BASE,
  // The step down its front where the crop's line forks (x -31.2, y -113.2): the edge only kinks there, a lock 0.6 pt
  // low, and the upper lock's edge runs on inside, up and back (EAR_FORK); the first, a 1 pt lock 8.6 pt wide, stood
  // out as a nub at phone size.
  steps: [{ from: [-32.8, -109.4], to: [-31.7, -115.6], lock: { len: 0.6, width: 6.2, lean: -0.25 }, tipRound: 0.3 }],
  // The hem as the crop draws it: a round U whose lowest run (y -63 from x -18.7 to -4.7) rises gently to the front and
  // more steeply to the back, its locks low tips along it (0.75 to 1 pt), parted at the crop's creases (x 13 at y
  // -74.5, -1 at -64.5, -13 at -63), the rearmost a small lock hanging down off the back edge, its tip pointing down
  // along the hem where the crop's edge steps in by 3 pt (x 15.5 to 12.4 at y -74.6), never rolling up into a knob.
  hem: { from: [20.4, -81], to: [-29.4, -70], locks: [{ len: 0.8, width: 9.5, lean: 0.45, dip: 0.4 }, { len: 0.95, width: 17.5, lean: 0.25, dip: 0.35 },
    { len: 0.75, width: 13.5, lean: 0.1, dip: 0.4 }, { len: 1, width: 17.4, lean: -0.15 }], tipRound: 0.22 },
  axis: [[-6, -143], [-8, -63]], deep: 0.3,
  // In profile the ear lies over the head: its line takes up the head's at its back, where the head's outline goes
  // under the ear, runs down round the hem and up its front to y -123, where it ends in open fur; its top, feathered
  // over the crown, is unlined (DECISIONS 68, its length cited).
  line: { from: EAR_JOIN, to: [-31.4, -123], ends: ["join", "free"], cites: 68, bare: [0, 52.3] },
});
const ear = EAR_EDGE.shape;
/** The upper lock's edge running on inside the ear from the front step's fork (the crop's line map). */
const EAR_FORK: P[] = [[-31.9, -112.6], [-30.9, -116.4], [-29.8, -119.6], [-28.8, -122.4]];

// The topknot (parts/topknot.ts): five curls in profile, stepping up from the forehead to the tall one and down the
// back of the head, as the sheet draws them. The forehead's two locks are the head's own edge (above), each with its
// own line; the topknot proper is three separate curls, back to front: a low one over the forehead, its tip combed
// forward (x -63.2), where the forehead's line meets its underside in a V and a stroke runs back along its underside
// into the fur, its crown at y -158.2; a lower one at the back, coming out from behind the tall one over its crown
// (y -158.6) to a V at its tip (x -7.2), where the head's line runs on down the back of the head; and in front the tall
// middle one, swept back, its top the head's highest point (y -164.6), its front curling round from the V at its foot
// (x -43.6), where its stroke runs back into the fur, its back coming down into the V behind it. Each curl's foot
// lies on the crown, feathered into it.
const CURLS: Curl[] = [
  { nodes: [[-63.2, -150.8], [-62.2, -154], [-59.6, -156.6], [-56, -158.2], [-52.4, -158.2], [-49.4, -156.8], [-46.6, -155.4], [-44.4, -152.6], [-44, -150],
    [-52, -147.4], [-58, -147.6], [-61.6, -149]],
    line: { from: [-63, -150.6], to: [-46.6, -155.4], taper: 0.6, ends: ["free", "free"], cites: 236, bare: [0, 22.1] }, into: [[[-63, -151], [-60, -151.5], [-56.4, -151.7]]] },
  { nodes: [[-27.6, -152.8], [-26.8, -156.4], [-24, -158.4], [-21, -158.7], [-16, -158.4], [-11.4, -157], [-8.4, -154.6], [-7.2, -152.2], [-8.2, -149.6], [-14, -148.4], [-22, -148]],
    line: { from: [-24.8, -157.6], to: [-7.2, -152.2], taper: 0.5, ends: ["under", "free"], cites: 236, bare: [0, 16.3] }, into: [[[-7.4, -152], [-10.6, -151.5], [-14.4, -151.2]]], tip: [[-7.4, -153.2], [-7.6, -151]] },
  { nodes: [[-43.6, -155.4], [-46.4, -158.4], [-45.6, -162.2], [-42.4, -164.4], [-37.6, -164.7], [-32.4, -164.3], [-28, -162.6], [-25, -160], [-23.6, -157.4],
    [-24.6, -152], [-32, -148], [-40, -148], [-43.6, -151]],
    line: { from: [-43.6, -155.4], to: [-23.6, -157.4], taper: [0.5, 1], ends: ["free", "free"], cites: 236, bare: [0, 27.5] }, into: [[[-43.8, -155.6], [-40.4, -155], [-36.6, -154.8]]], tip: [[-43.4, -154.6], [-44.6, -156.4]] },
];
const tuftShapes = curlShapes(CURLS);

/**
 * The crown's fur over the ear's top (audit side #2, DECISIONS 237): the crop paints the patch and the ear's top as one
 * broad tan mass, nearly flat (y -142.2 at x -32, -144.3 at -15, -143 at -4), its top edge soft where the crown's cream
 * lies over it, a little uneven, never a smooth dome with a crisp edge. Thin cream strands over it read as white cuts
 * (the first try), and a row of five even locks as teeth (this lane's first), so the cream comes down over the tan in
 * three broad, low locks of uneven size, soft (σ 0.8 pt). Drawn with the topknot, over the ear, from x -34 to -4,
 * inside the head's outline.
 */
const CROWN_FUR = furEdge(smooth([[-34, -149], [-4, -149], [-4, -144.4], [-12, -144.8], [-20, -144.4], [-28, -143.6], [-34, -142.8]], { corners: [0, 1, 2, 6] }),
  [-4, -144.4], [-34, -142.8], [{ len: 1.3, width: 10.4, lean: -0.4, dip: 0.5 }, { len: 0.9, width: 8, lean: -0.3, dip: 0.4 }, { len: 1.6, width: 11.6, lean: -0.45 }],
  0.3, undefined, CROWN_LOCKS);
function crownFur(): Piece {
  const f = uid("blur"), box: Box = [-36, -151, 34, 13];
  return piece(`<defs>${blur(f, box, 0.8)}</defs><path d="${pathD(CROWN_FUR.segs)}" fill="${C.fur}" filter="url(#${f})"/>`, box);
}

// Markings.

// The head patch, as the sheet paints it: a rounded hood over the eye (its top
// about 12 pt above the eye), coming down its front to about the eye's top; a
// notch of cream comes down between the hood and the ear's front (to y -115 at
// x -48.2); behind it the tan rises along the ear's front to y -131 and runs on
// under the ear; its lower edge slants from behind the eye's foot down to the
// ear at y -80.6, so the cheek and the blush below are cream.
const patch = smooth([[-73.6, -106], [-73.2, -112], [-71.4, -116.4], [-68.6, -120.6], [-64.5, -122.6], [-59.5, -122.5], [-54.8, -120.9], [-51.2, -118.4],
  [-48.2, -115.2], [-41.6, -120.2], [-38.6, -127.6], [-37.8, -134.6], [-35, -140.2], [-28, -142], [-19, -142.6], [-24, -84], [-33, -80.2], [-37, -81],
  [-41, -83.6], [-45.4, -86], [-50, -88.4], [-54.4, -90.6], [-58.6, -92.4], [-64, -94]], { corners: [8] });
// The saddle's left half, as the sheet paints it: its front end below the
// topline just behind the ear's foot (x -13), lying along the topline from x 0
// down the back to above the rump (x 14), its lower edge dipping lowest under
// its front half (y -40 at x 0) and rounding up to the topline at each end;
// soft but defined, its lower edge breaking into a few uneven locks of fur
// combed back; typed with bleed above the topline, which the back body's clip
// takes off.
const saddle = furEdge(smooth([[-12.8, -57.4], [-7, -59.2], [-1, -58.8], [4, -56.6], [10.6, -48.6], [16.6, -39.4], [15.4, -35.6], [11, -36.2], [5.4, -37.4],
  [0, -38.8], [-5, -40.4], [-9.8, -43.6], [-12.6, -48], [-13.6, -53.4]]), [15, -35.8], [-11.2, -45.6],
[{ len: 1.2, w: 0.9, lean: -0.25 }, { len: 1.9, w: 1.3, lean: -0.3 }, { len: 1.1, w: 0.8, lean: -0.2 }, { len: 1.7, w: 1.2, lean: -0.3 }, { len: 1, w: 0.9, lean: -0.2 }], 0.32);
// The rump's tan spot, where the tail's tan crosses the body's outline at the
// tail's root (x 11.7 to the outline, y -32 to -18), distinct, paling only a
// little away from the outline, as the sheet paints it.
const rump = smooth([[20.4, -33], [22.4, -24], [21.6, -16], [17, -16.6], [13, -19.6], [11.8, -25.6], [13.8, -31.4]]);
const rumpFade: Fade = { from: [14.2, -24], to: [8.6, -24] };
// The tail's tan root: from the rump, where it reaches highest (y -37), its
// upper edge slanting down and back to about x 30 at y -24, and its back edge
// down to the plume's foot, both breaking into streaks combed out along the fur
// away from the rump, the plume above and behind it cream, as the sheet paints
// it; typed with bleed past the tail's edges.
const tailBase = furEdge(smooth([[8, -37], [15.6, -37.4], [20, -36.6], [23.4, -34.4], [26.4, -30.6], [28.8, -26], [30, -21], [29.4, -15.4], [26.4, -10.6], [21, -7],
  [12, -6], [6, -22]]), [19.4, -36.8], [29.8, -17.4],
[{ len: 2, w: 0.6, lean: 0.25 }, { len: 4, w: 1.2, lean: 0.2 }, { len: 1.6, w: 0.5, lean: 0.15 }, { len: 3.2, w: 1, lean: 0.1 }, { len: 2.6, w: 0.8, lean: 0 },
  { len: 1.4, w: 0.5, lean: -0.1 }, { len: 2.8, w: 0.9, lean: -0.15 }], 0.14);

/** The tail's root on the rump, where it turns (DECISIONS 59): rig.json's tail pivot in this view. */
export const TAIL_ROOT: P = [15, -23];

// Paint.

/** The fur's one shade (the front's recipe): the fur's own warm multiply on the rim away from the light and under overhangs. */
const furShade = (group: Shape[], shapes: string[] = [], keep: string[] = [], rim = { inset: 2.5, toLight: 4 }) =>
  ({ multiply: C.furShadeBy, rim, shapes, keep, group, blur: 2.4 });
/** The near side of the body is one light group: back and haunch, chest, near legs. */
const bodyGroup = [back, chest, legNear, hindNear];
const headGroup = [head, ...tuftShapes];

const backPaint = (F: Facing): Paint => ({
  fill: C.fur,
  // The haunch's underside and its back, away from the light; and under the ear and the collar's back end, where the
  // ear hangs over the neck.
  shade: furShade(bodyGroup, ["M-30 -66 L-6 -66 L-8 -55 C-14 -49 -22 -49 -30 -53Z"]),
  light: F.light,
});
/** Where the tail comes out from behind the rump, above and below (the rump's line over it is a contact line). */
const RUMP_TOP = crossing(back, tail, [16.5, -36]);
const RUMP_FOOT = crossing(back, tail, [17, -10.5]);
/** Where the thigh's front comes out from behind the hind paw's top, and where the hind paw's sole leaves the haunch's underside on the ground. */
const THIGH_FOOT = crossing(back, hindNear, [-26, -16.4]);
const HIND_BACK = crossing(back, hindNear, [-14.2, -1.9]);
/**
 * How deep the thigh's line lies at most: as light as the cream's line is drawn (its tone 0 and 1.2 pt, L* 66), and the
 * lightest of it from y -19 up, so on the crop's grid it reads as the crop's (L* 70 from y -16 to -21, 75 to 81 to y
 * -25.6, 86 to 90 by -29.5): a thin soft line fading out upward, where the first, at 0.4 (L* 58, 1.4 pt) and straight,
 * read as a dark spur (the line check's ink +0.52 against 0.29).
 */
const thighMost = (p: P) => 0.06 * Math.min(1, Math.max(0, (p[1] + 23) / 4));
/** A place's depth that eases from `a` to `b` between two heights, y0 to y1 (deeper toward the ground, or toward a rump). */
const byHeight = (a: number, b: number, y0: number, y1: number) => (p: P) => a + (b - a) * Math.min(1, Math.max(0, (p[1] - y0) / (y1 - y0)));
/**
 * The back's lines (parts/lines.ts; DECISIONS 210, 211, 238), each one span along its visible edge: the topline, where
 * the saddle's tan lies along it, on the tan (the sheet's #9C673F to #A86C47), from under the collar's back end to where
 * the tail comes out from behind the rump; the rump over the tail, a contact line (Q31: as dark in both facings), on the
 * tan where the rump's spot lies on it and on the cream in a facing with no rump spot (side.R); the haunch's underside
 * along the ground, its dark under the middle of the run (`ground: "sole"`), on under the hind paw, whose sole's line
 * takes it up; and the thigh's front where the haunch lies over the chest, a contact line rising from under the hind
 * paw's top, lightening as it rises and fading out over 6 pt, the haunch's front above it melting into the chest
 * unlined, as the crop draws it (DECISIONS 216, its length cited).
 */
const backLines = (F: Facing): LitSpan[] => [{ from: [-16.6, -63.4], to: RUMP_TOP, on: "tan", ends: ["under", "join"] },
  { from: RUMP_TOP, to: RUMP_FOOT, on: F.shows("rump.patch.L") ? "tan" : "cream", contact: true, under: byHeight(0.5, 0.65, -30, -10), ends: ["join", "join"] },
  { from: RUMP_FOOT, to: [-17, -1.7], ground: "sole", ends: ["join", "under"] },
  { from: THIGH_FOOT, to: [-22.75, -28.35], contact: true, most: thighMost, ends: ["under", "free"], taper: 10.8, cites: 216, bare: [0, 26.5] }];

function chestPaint(F: Facing): Paint {
  return {
  fill: C.fur,
  // In shade under the collar, a little way down the chest, as the sheet paints it there; the belly's warm shade in the
  // small inverted V between the near paw's heel and the hind paw's toe (belly()).
  shade: furShade(bodyGroup, ["M-62 -52 C-50 -45 -32 -45 -18 -52 L-18 -62 L-62 -62Z"]),
  under: belly(),
  light: F.light,
  };
}

/**
 * The belly in the small inverted V where the near paw's heel and the hind paw's toe lean on each other, in the warm
 * shade the crop paints it (#D7B49C to #E1BDA4 at y -3 to -4, against the fur's #FFF4E8), deepest at the ground; the
 * paws cover all of it but the V.
 */
function belly(): string {
  const g = uid("belly"), f = uid("blur"), h = uid("crease"), k = uid("blur");
  const d = "M-40.6 -0.8 L-34.4 -10.4 L-30.4 -10.4 L-27.6 -0.8Z";
  // Above the hind paw, the crease between the near leg's back and the thigh: the same warm shade, deepest at the hind
  // paw's top and fading up the thigh's line, its right edge under the haunch, so it ends on the thigh's line (audit
  // side #11; the crop's wedge from about x -31 to the line, y -13 to -26).
  const crease = "M-34.6 -10.6 L-33.8 -14.4 C-32 -18.6 -29.4 -22 -27 -25 L-22 -25 L-24 -18 L-25 -13 L-28 -10.6Z";
  return `<defs><linearGradient id="${g}" gradientUnits="userSpaceOnUse" x1="0" y1="-9" x2="0" y2="-1.5">` +
    `<stop offset="0" stop-color="${C.marking}" stop-opacity="0.35"/><stop offset="1" stop-color="${C.marking}" stop-opacity="0.6"/></linearGradient>` +
    `<linearGradient id="${h}" gradientUnits="userSpaceOnUse" x1="0" y1="-21" x2="0" y2="-11">` +
    `<stop offset="0" stop-color="${C.marking}" stop-opacity="0"/><stop offset="1" stop-color="${C.marking}" stop-opacity="0.35"/></linearGradient>` +
    `${blur(f, [-44, -14, 20, 16], 0.5)}${blur(k, [-38, -31, 19, 23], 0.9)}</defs><path d="${d}" fill="url(#${g})" filter="url(#${f})"/>` +
    `<path d="${crease}" fill="url(#${h})" filter="url(#${k})"/>`;
}

/** Where the near paw's heel leans on the hind paw's toe: its line ends there on the hind paw's, which runs on up into the thigh's. */
const APEX = crossing(legNear, hindNear, [-32.4, -10.8]);
/** The wrist, where the chest's edge over the far leg meets the near leg's front, a node of both outlines. */
const WRIST: P = [-56.6, -24.6];

function legNearPaint(F: Facing): Paint {
  // In profile the sole lies flat on the ground; the toes show as the bun's round toe end and two faint toe lines
  // rising from the sole behind it, where the crop's line map has them (x -60.6, 6.3 pt tall, and x -54.4, 4.7 pt), soft
  // and light (parts/paw.ts `soft`, DECISIONS 216, 238), each curving forward over the bun's dome as it rises, as the
  // crop's do: never straight ticks that read as claws.
  const t = toes({ lines: [[[-60.2, -1.2], [-60.3, -3.4], [-60.8, -5.6], [-61.6, -7.4]], [[-54.2, -0.6], [-54.3, -2.4], [-54.8, -4.1], [-55.4, -5.2]]], fade: [-1, -8], width: 0.85, soft: true });
  return {
    fill: C.fur,
    shade: furShade(bodyGroup, [], ["M-70 -60 L-30 -60 L-30 -30 L-70 -30Z"]),
    under: t.under,
    // No line across the leg's top: it melts into the paw (audit side #10).
    inner: t.inner!,
    // Its top fades in on the chest, so it comes out of the chest's fur with no edge.
    feather: { from: [-44, -42], to: [-46, -36] },
    light: F.light,
  };
}

function legFarPaint(F: Facing): Paint {
  const t = toes({ lines: [[[-72.4, -5.6], [-72.8, -7.2], [-72.7, -8.6]], [[-68.8, -4.7], [-69.3, -7.6], [-69.8, -10.6], [-70.1, -13.4]]], fade: [-5, -14], width: 0.85, soft: true });
  return {
    fill: C.farFur,
    // Its own darker fur is the wedge's colour as the sheet paints it (#FFDDBC); in shade only right under the tag and
    // along its rim away from the light.
    shade: { multiply: C.furShadeBy, rim: { inset: 1.4, toLight: 2.2 }, shapes: ["M-66 -40 L-58 -40 L-58 -34 C-61 -33 -64 -33 -66.4 -34Z"], blur: 2 },
    // The paw's dome catches the light from the top left, so it reads as the sheet's near-cream paw below the shaded
    // wedge; the light lies on the dome's side toward the light in either facing (across the paw's middle, its centre).
    highlight: { d: F.lit("M-74 -13 C-73.6 -16.4 -70.6 -18.4 -67.6 -17.6 C-66 -14.4 -66.6 -10 -68.6 -7.4 C-71.4 -7 -73.8 -9 -74 -13Z", landmarks["paw.front.R"]![0]),
      colour: C.fur, opacity: 0.55, blur: 1.6 },
    // Two faint toe lines rising from its sole, as the crop's line map has them (x -69.5, up to y -13.4, and a short one
    // at -72.5), soft (parts/paw.ts);
    // no crease across the leg where its bun swells out (the crop draws its front kinking out there, no line across it).
    under: t.under,
    inner: t.inner!,
    light: F.light,
  };
}

function hindPaint(F: Facing): Paint {
  return {
    fill: C.fur,
    shade: furShade(bodyGroup),
    // Two faint toe lines rising from the sole toward its front, as the crop's line map has them (x -27.6 and -21.8, 4 to
    // 6 pt), soft (parts/paw.ts, DECISIONS 216, 238), curving forward over the bun as they rise. Its crown and back lie on the haunch in its light group with no
    // rim: no feather is needed for them to melt into it, and none fades the sole's line where it takes up the haunch's.
    ...toes({ lines: [[[-27.6, -0.95], [-27.8, -3], [-28.3, -4.8], [-29, -6.2]], [[-21.8, -0.95], [-21.9, -2.7], [-22.4, -4.2], [-23, -5.1]]], fade: [-1, -6.6], width: 0.85, soft: true }),
    light: F.light,
  };
}

const tailPaint = (F: Facing): Paint => ({
  fill: C.fur,
  // Its foot away from the light, and the tan root's core by the rump, where the sheet's tan is deepest.
  shade: { multiply: C.furShadeBy, rim: { inset: 2.5, toLight: 4 }, shapes: ["M10 -14 C24 -6 40 -12 48 -24 L48 -4 L10 -4Z",
    "M16 -34 C20 -33 24 -27 24.6 -20 C24.8 -15 23 -12 20 -11 L16 -11Z"], blur: 2.4 },
  // The plume's top, toward the light, across the plume's middle in either facing.
  highlight: { d: F.lit("M22 -57 C28 -61 36 -60 41 -55 C36 -52 28 -52 22 -54Z", middle(tail)), colour: C.light, opacity: 0.35, blur: 3 },
  inner: [
    // The curl hooks in at the plume's front where its lower edge tucks under (x 19.6, y -47.6): the outline itself turns
    // there, and only a short faint tuck runs on from it into the plume (the crop's line map: 2.3 pt at L* 84 to 89), so
    // the hook is the outline's own, never a stroke of its own.
    { pts: [[19.2, -47.7], [20.6, -47.5], [22.2, -47.1]], width: 0.7, colour: C.crownLine, opacity: 0.45 },
  ],
  // Under each notch of the plume's back the lock above hangs its tip over the one below: its edge runs on a little way
  // inside, down the plume, as the crop's line map draws it (4, 4.4, 2 and 3 pt), fainter than the outline (L* 83 to 90
  // against 72 to 77), so the locks read as overlapping flames: each from the notch at the outline's width, thinning to
  // nothing at its inner end (a stroke tapered at both ends read as a slit cut into the plume).
  under: TAIL_TUCKS.map(([dir, length], k) => {
    const n = tailTuckAt()[k]!, d = v.norm(dir), side: P = [-d[1], d[0]];
    const pts = [0, 0.25, 0.5, 0.75, 1].map((t): P => v.add(v.add(n, v.mul(d, length * t - 0.4)), v.mul(side, 0.3 * t * t)));
    const w = (t: number) => 0.55 * (1 - t) ** 0.8 + 0.06;
    const left = pts.map((p, i) => v.add(p, v.mul(side, w(i / 4)))), right = pts.map((p, i) => v.sub(p, v.mul(side, w(i / 4))));
    return `<path d="M${[...left, ...right.reverse()].map((p) => `${fmt(p[0])} ${fmt(p[1])}`).join(" L")}Z" fill="${C.crownLine}" opacity="0.55"/>`;
  }).join(""),
  light: F.light,
});

/**
 * The head's light, one for the head and the topknot's light group: on the forehead's slope up to the crown, toward
 * the top-left light (in the other facing across the head's middle, on the back of the crown, toward the light), and
 * along the bridge's top, which faces up in either facing.
 */
const headLight = (F: Facing) => `${F.lit("M-82 -128 C-74 -146 -56 -154 -38 -152 C-46 -146 -62 -140 -72 -126Z", middle(head))} ` +
  "M-90 -103 C-87 -106 -80 -107 -76 -104 C-79 -101 -86 -100 -90 -103Z";
const headPaint = (F: Facing): Paint => ({
  fill: C.fur,
  // Under the jaw, where the head turns under toward the collar; and down the cheek along the ear's front, where the
  // ear hangs over it, deepest under the ear's foot, as the sheet paints it (#F8CAA6 to #FEDAB8 there).
  shade: furShade(headGroup, ["M-92 -76 C-84 -66 -72 -63 -56 -61 L-30 -62 L-30 -56 L-92 -56Z",
    "M-33 -106 C-37.4 -100 -40 -94 -40.4 -86 C-41 -80 -42.6 -74 -45 -70 C-46 -66 -46 -60 -45 -56 L-22 -56 L-22 -62.6 L-30 -62.6 L-30 -106Z"],
    ["M-100 -172 L20 -172 L20 -140 L-100 -140Z"], { inset: 3, toLight: 4.5 }),
  highlight: { d: headLight(F), colour: C.light, opacity: 0.4, blur: 4 },
  // Each forehead lock's underside, as the crop draws its "<": from the lock's tip the line folds back into the fur along
  // the lock's underside, ending free, the lower lock's long and sweeping up (the crop's line map: 14 pt, level for its
  // first 3.5 pt and then rising, to 8 pt inside the outline), the upper's short and nearly level (4.7 pt); at the
  // crown line's own light tone, so the hook is the lock's own line turning back, never a spike across the outline (the
  // first, one dark stroke through the notch between the locks, audit side #8).
  inner: foreLocks.slice(0, 2).map(({ tip }, k) => {
    const path: P[] = FORE_HOOKS[k]!.map(([dx, dy]): P => [tip[0] + dx, tip[1] + dy]);
    return { pts: sample(smooth(path, { closed: false }).segs, 8, false), width: k === 0 ? 0.85 : 0.75, colour: C.crownLine, opacity: 0.8 };
  }),
  light: F.light,
});

/** How deep the chin's line lies: as dark as the mouth's line by the lip's notch, lightening back along the jaw (the sheet's #977A67 by the notch, #A78A70 to #B09074 along the jaw). */
const chinDepth = (p: P) => 0.45 + 0.3 * Math.min(1, Math.max(0, (p[0] + 84) / -8));
/**
 * The head's lines (DECISIONS 210, 212, 236), each one span along its visible edge, ending where it joins another line
 * or goes under the part over it: the bridge and the forehead from the nose's top (joined to the nose's own edge) over
 * the forehead's two locks, one line dipping into each notch, on in under the topknot's front curl; the crown between
 * the front curl and the tall one, from under the one to under the other; the back of the head from under the
 * topknot's back curl, over its small lock, on under the ear, whose own line takes it up where the head's outline goes
 * under it (EAR_JOIN); and the chin's, from the lip's notch, where it joins the lip's line, round the chin and along the
 * jaw to the collar's front (parts/headfur.ts), where it ends among its tufts. Behind them the jaw's fur lies over the
 * collar unlined, the band's own rim its edge, as the crop draws it (DECISIONS 236, its length cited). Round the nose's
 * front the nose's own near-black (noseEdge), and the lip's line from the nose down to the smile is the lip's (lipEdge).
 * The back of the head's line runs on down under the hanging ear to y -84, so where the ear turns off the head (the
 * relaxed and lowered ears, which the clips turn about its root) the head's edge it bares is lined.
 */
const headSpans: LitSpan[] = [
  { from: [-92, -100.5], to: [-60.4, -152.2], under: (p: P) => 0.65 * Math.min(1, Math.max(0, (p[1] + 124) / 20)), ends: ["join", "under"] },
  { from: [-50.2, -152.7], to: [-41, -153.6], ends: ["under", "under"] },
  { from: [-14, -154], to: [14.2, -84], ends: ["under", "under"] },
  { ...HEAD_FUR.chin!, under: chinDepth, cites: 236, bare: [36.5, 0] },
];
/**
 * Round the nose's front, where the nose is the head's edge, a line in the nose's own near-black, so the stencil's
 * hard edge is covered and the nose has no rim of any other colour, as the sheet draws it.
 */
const noseEdge: Outline = { colour: C.eyeDark, width: THIN, taper: 1.5, blur: 0.15, spans: [{ from: [-96.2, -90.6], to: [-92, -100.5] }] };
/**
 * The upper lip's line down the profile from the nose's foot to the lip's notch, on the head's edge: drawn here,
 * unclipped, so the head's stencil never cuts it into steps (the mouth draws the smile from the notch on, inside the
 * head), in the printed dark brown seen through 90% of itself, as the smile is.
 */
const lipEdge: Outline = { colour: C.dark, width: THIN, taper: 0.8, blur: 0.15, spans: [{ from: [-92.7, -80], to: [-96.4, -90.9] }] };

function headLinePiece(F: Facing): Piece {
  const f = uid("blur");
  const [x0, y0, x1, y1] = bbox(head.segs);
  const box = pad([x0, y0, x1 - x0, y1 - y0], 2);
  // Its outer edge crisp (DECISIONS 212): the silhouette is the line's own edge, soft only on its inner side.
  const r = litEdge(head, headSpans, "head.line", box, { reach: 0.5, light: F.light, crisp: true }), n = ribbons(head, noseEdge, "head.line", 0.5), l = ribbons(head, lipEdge, "upper lip", 0.5);
  return lineGate(piece(`<defs>${r.defs}${blur(f, pad(box, 2), 0.15)}</defs>${r.body}<g fill="${noseEdge.colour}" filter="url(#${f})">${n.svg}</g>` +
    `<g fill="${lipEdge.colour}" opacity="0.9" filter="url(#${f})">${l.svg}</g>`, box, {
    shapes: [{ name: "head.line", nodes: head.typed, segs: head.segs, outlined: [...r.outlined, ...n.outlined, ...l.outlined], fur: head.fur.map(([a, b]) => [fracAt(head, a), fracAt(head, b)]) }],
    lines: [...r.lines, ...n.lines, ...l.lines],
  }));
}

/**
 * The near eye in profile, by the dog's one eye recipe (parts/eye.ts, DECISIONS 73), as the side crop draws it: a
 * tall oval (the sheet's eye runs x −74.3 to −58 and y −110.6 to −89.3, its iris x −73.8 to −63) leaning 6° back at
 * its top; the rim dark all round, heaviest over the top and down the back, where the lash line lies on it; the
 * white a crisp crescent between the rim and the iris all down the back, widest (2.9 pt, the sheet's 2.7 to 3.1) a
 * little below the back's level; the large catchlight where the sheet's sits (x −68.3, y −104.3), and the tiny one
 * below it that every view's open eye carries (Q26, DECISIONS 201; the side crop draws only the large one).
 */
const EYE: EyeSpec = {
  centre: [-66.4, -99.7], rx: 7.6, ry: 10.4, turn: 4, noseward: -1,
  rim: { top: 1.3, side: 0.8, foot: 0.5 }, lid: { from: -45, to: 150, width: 1.8, flick: 0.3 },
  white: { at: -18, width: 3.4, span: 62, fade: 0.15 }, shine: { at: [2.3, 4.0], r: 1.6 },
};

/** The brow's centre line, from its front (inner) end by the nose's side to its back end, where the sheet paints it. */
const BROW: P[] = [[-62, -129.8], [-59.6, -131.3], [-57, -131], [-54.9, -128.8]];
/** The brow: a short, thick, rounded dab of tan above the hood, domed, its back end lower, soft at its edges (the front's recipe). */
function brow(pts: P[] = BROW): Piece {
  // The rest brow's own canvas, a moved state's moved with it.
  const [x0, y0] = [Math.min(...pts.map(([x]) => x)), Math.min(...pts.map(([, y]) => y))];
  const f = uid("blur"), box: Box = [x0 - 4, y0 - 4.7, 16, 12];
  return piece(`<defs>${blur(f, box, 0.35)}</defs><g filter="url(#${f})">` +
    `<path d="${strokeOf(pts, 2.4, { taper: 2.4, tip: 1 }).d}" fill="${C.marking}" opacity="0.85"/></g>`, box);
}

/**
 * The nose at the snout's tip, as the sheet draws it in profile: a near-black rounded wedge (7.7 pt across, 10.4
 * tall), its top nearly flat where it runs on into the bridge's line, its front full and round, its back running down
 * in a diagonal to a slightly pointed lower-back corner where the lip's line starts; its front the head's own edge, a
 * touch past it so it fills the head's clip to its edge; a soft dull sheen across its top.
 */
const noseShape = smooth([[-93.6, -101], [-91.4, -101.3], [-89.6, -100.6], [-88.9, -98.8], [-89.5, -96.4], [-90.9, -93.9], [-92.5, -92], [-94.1, -90.7], [-95.5, -90.2],
  [-96.6, -91.1], [-97, -93.2], [-97, -95.8], [-96.5, -98.2], [-95.2, -99.8]]);
function nose(): Piece {
  const f = uid("blur"), e = uid("blur"), box: Box = [-99, -103, 12, 16];
  // Its edge a touch soft, as the sheet's, so it does not read as cut out.
  return piece(`<defs>${blur(f, box, 0.7)}${blur(e, box, 0.15)}</defs><path d="${pathD(noseShape.segs)}" fill="${C.eyeDark}" filter="url(#${e})"/>` +
    `<ellipse cx="-93.2" cy="-98.4" rx="2.3" ry="0.95" transform="rotate(-6 -93.2 -98.4)" fill="${C.noseSheen}" opacity="0.7" filter="url(#${f})"/>`, box);
}

/**
 * The lip and the closed smile in profile, as the side turnaround draws them: one line that drops from the nose's
 * foot down the upper lip's front (the head's edge there) and turns in at the lip's notch into the smile, a shallow
 * curve back along the muzzle that ends in a small upturned curl at the corner (mouth.L). The lip's part is an outer
 * line on the head's edge, tapering into the notch; the smile is an inner line growing out of it. Both are the
 * printed dark brown, seen through 90% of itself, as the sheet's soft grey-brown (#705F4F to #584B45 at its core),
 * lighter than the front's open lip.
 */
/** The rest smile, from the lip's notch back to its upturned curl at the corner. */
const REST_SMILE: P[] = [[-92.8, -80.2], [-91.4, -79.6], [-89.4, -79.4], [-87.6, -79.7], [-86.2, -80.4], [-85.3, -81.4], [-84.9, -82.6]];
function mouth(): Piece {
  // The smile, from the lip's notch, where the head's line (lipEdge) brings the upper lip down, a short curve back along
  // the muzzle ending in a definite upturned hook at its corner (mouth.L), as the sheet draws it; inside the head, so
  // its edge is its own soft edge, never the stencil's.
  const smilePts = sample(smooth(REST_SMILE, { closed: false }).segs, 8, false);
  const smile = tapered(smilePts, 0.9, "inner", "smile", { taper: 1, tip: 0.5 });
  const f = uid("blur"), box: Box = [-98, -93, 16, 15];
  return piece(`<defs>${blur(f, box, 0.15)}</defs><g fill="${C.dark}" opacity="0.9" filter="url(#${f})"><path d="${smile.d}"/></g>`, box,
    { shapes: [], lines: [smile.line] });
}

/**
 * The blush under the eye, where the sheet's sits: the front's soft ellipse, at its level, as broad and faint a wash
 * as the sheet's across the cheek (its pink reaches from x -68 to -53 and peaks at x -59, y -85.5 on the crop).
 */
function blush(): Piece {
  // Drawn at the blush's reference level, as the front's is (DECISIONS 145, 160): the printed pink blurred, its alpha
  // stretched past the blurred oval's peak (0.78 of its fill at 3x) so the reddest tenth of the cheek is the full pink
  // and match.py's fit reads 1 at alpha 1; the part's rest alpha (rig.json) sets the resting level.
  const [cx, cy] = [-60, -84.6], rx = 7.4, ry = 3.9, sd = 2.8, stretch = 1.522;
  const d = `M${r3(cx - rx)} ${cy} a${rx} ${ry} 0 1 0 ${2 * rx} 0 a${rx} ${ry} 0 1 0 ${-2 * rx} 0Z`;
  const f = uid("blush"), box = pad([cx - rx - 0.5, cy - ry - 0.6, 2 * rx + 1, 2 * ry + 1.2], 3 * sd);
  const filter = blur(f, box, sd).replace("</filter>", `<feComponentTransfer><feFuncA type="linear" slope="${stretch}"/></feComponentTransfer></filter>`);
  return piece(`<defs>${filter}</defs><path d="${d}" fill="${C.blush}" filter="url(#${f})"/>`, box);
}

/**
 * The tag (the front's recipe), as the side crop paints it: flat matte gold, a deeper orange-gold rim inside its line
 * down its left side and round its foot, where the turned coin's edge shows, one soft light high on its left, and the
 * smaller heart embossed as a soft line with a lighter face. It hangs from a small dark ring just under the band, on
 * the collar's darker blue loop band round the band's front end, its back edge crisp, as the side crop draws them
 * (audit side #7: the band x -62.2 to -58.6, the ring at x -60.6, y -52.3; DECISIONS 240). The tag's pivot, the ring's
 * top on the collar (rig.json), lies on the loop band, so at rest the band is the collar's own.
 */
function tagPiece(F: Facing): Piece {
  const ringLine: DrawnLine = { kind: "inner", width: 0.6, where: "tag ring", drawn: [0.6, 0.6] };
  const f = uid("blur"), box: Box = [-64, -61, 8, 11];
  const strap = piece(`<defs>${blur(f, box, 0.5)}</defs>` +
    `<path d="M-60.8 -58.8 C-61 -57.6 -60.8 -56.6 -60.4 -55.8 L-58.6 -55.8 C-58.3 -56.8 -58.3 -57.8 -58.5 -58.9 C-59.2 -59.5 -60.2 -59.4 -60.8 -58.8Z" ` +
    `fill="${C.collarLine}" opacity="0.6" filter="url(#${f})"/>` +
    `<ellipse cx="-60.5" cy="-51.7" rx="0.85" ry="0.7" fill="none" stroke="${C.tagEdge}" stroke-width="${ringLine.width}"/>`, box, { shapes: [], lines: [ringLine] });
  // The dog's one tag recipe (parts/tag.ts), its turned coin's edge down its left side in the deeper shade; its light
  // on the upper left toward the light, across the coin's middle in either facing.
  return join(strap, part("tag", heart, { ...tagPaint({ emboss: embossed, light: F.lit("M-64.8 -48.6 a2 1.4 -50 1 0 4 0 a2 1.4 -50 1 0 -4 0", middle(heart)),
    shade: ["M-67.6 -50 C-66.8 -45 -65.2 -41.6 -61.8 -39.8 L-61 -37 L-68 -37Z"], rim: THIN, shadeRim: { inset: 0.9, toLight: 1 } }), light: F.light }));
}

/**
 * The ear's paint, by the dog's one ear recipe (parts/ear.ts, DECISIONS 76), matte, as the side crop paints it: the
 * tan a little lighter toward its top and the front shoulder where the light falls, deepening down the ear to a
 * browner tan at its foot and along its back; long locks running down its length with its round, the one at the back
 * the fold where it turns over the back of the head (the sheet's #A76640 there), into the dips of its foot's three
 * soft clumps; its back, away from the light, in the fur's warm shade. Its top lies under the crown's fur, feathered
 * into it, with no light band and no line.
 */
const FOLD_BLUR = uid("blur");
function earPaint(F: Facing): Paint {
  const fur = earFur({
      ear, edge: EAR_EDGE, axis: [[-6, -143], [-8, -63]], deepen: [0.4, 1.1],
      // Uneven, and fanning out toward the hem with the ear's droop, the front ones leaning forward, the back ones back
      // (parts/ear.ts UNEVEN and FAN); earFur ends each in the hem tip nearest it.
      locks: [[[-27, -99], [-29.4, -88], [-30, -76]], [[-20.6, -86], [-21.8, -78], [-22, -70]], [[-8, -103], [-8.4, -90], [-7.6, -78], [-6.4, -68]],
        [[2.4, -89], [3.6, -81], [4.2, -72]], [[11.4, -101], [14, -91], [15.2, -80]]],
      // Along its back edge from its top to about two thirds down, the fold where the ear turns over the back of the
      // head, as the sheet draws it, the back layer beyond it.
      // Its fold where it turns over the back of the head, where the crop draws it (from x -3.4 at y -132 down to 13.4
      // at -111.6, where it meets the back edge); the turned-over layer beyond it a little lighter, as the crop paints it.
      fold: { line: [[-6.6, -138.2], [-4.2, -135.4], [-1.8, -132.4], [1.4, -129], [3.8, -125.9], [6.2, -122.8], [8.5, -118.9], [10.8, -116], [12.4, -114.2], [14, -111.8]], back: "" },
      dips: EAR_EDGE.notches,
      // On its front shoulder, toward the light; across the ear's middle, on its back shoulder, in the other facing.
      light: F.lit("M-33 -100 C-33 -112 -29 -124 -20 -132 C-14 -134 -12 -128 -16 -120 C-20 -112 -24 -104 -27.6 -98 C-30 -95 -33 -96 -33 -100Z", middle(ear)),
      under: ["M-6 -142 C4 -136 11 -126 15.6 -114 C18 -106 22 -96 22 -82 L30 -82 L30 -142Z"],
  });
  return {
    ...fur,
    // The fold as the crop draws it (DECISIONS 237): its contour a soft line in the ears' deep line, running down from
    // under the crown along the back, the turned-over layer beyond it a little lighter.
    // and where the front's step forks, the upper lock's edge running on up and back inside the ear, fading, as the crop
    // draws it (from x -31.2 at y -113.2 to -28.7 at -122.3).
    inner: [...(fur.inner ?? []).map((l) => ({ ...l, opacity: 0.4 })), { pts: EAR_FORK, width: 0.8, colour: C.earLine, opacity: 0.5 }],
    under: `${fur.under}<defs>${blur(FOLD_BLUR, [-10, -146, 34, 40], 0.8)}</defs><path d="M-3.4 -132.2 L4.4 -125.2 L11 -117.2 L13.4 -111.6 L15.4 -116 L13 -124 L8 -132 L1 -139Z" fill="${C.patch}" opacity="0.45" filter="url(#${FOLD_BLUR})"/>`,
    // Its top lies under the crown's fur, which overlaps it softly all along (audit side #2): it fades out upward into the
    // crown from y -141, so no edge and no line show along it (DECISIONS 68).
    feather: { from: [0, -147], to: [0, -141] },
    light: F.light,
  };
}

/**
 * The ear's line (parts/ear.ts earEdge, DECISIONS 215): one span on the tan from where the head's outline goes under
 * it, down its back, round its hem, light at the top and deepening to the hem, and up its front to y -123, where it ends
 * in open fur; its top, feathered into the crown's fur, has none (DECISIONS 68, its length cited). Its depth at most
 * (210's `most`): near the light's own at the top (0.1, 1.2 pt), deepening down the ear to 0.3 at the hem and a little
 * more into each of the hem's notches, so it comes and goes with the locks and is thinnest and lightest at the top, as
 * the floppy-ears panel draws it and the crop's hem line (1.47 pt) is; the first, the recipe's 0.3 floor at the hem and
 * the light's depth above, drew the top of its back edge as heavy as its hem. A ceiling is the same in both facings, so
 * it is kept above the lit side's own depth (0.1), and the light rule still lightens side.R's back edge (facing.test.ts).
 */
const earSpans: LitSpan[] = [{ ...EAR_EDGE.span, most: (p: P) => 0.1 + 0.2 * Math.min(1, Math.max(0, (p[1] + 135) / 65)) ** 1.4 +
  0.15 * Math.max(0, ...EAR_EDGE.notches.map((n) => Math.exp(-((v.len(v.sub(p, n)) / 1.8) ** 2)))) }];

/** The collar's loop band's back edge, from the band's top to its foot. */
const LOOP_BACK = "M-58.6 -59.7 C-58.2 -57.4 -58.3 -54.4 -58.9 -51.4";
/**
 * Where the chin's fur lies on the collar, as the sheet paints it (the front's recipe): the collar's dark rim right
 * under the fur's edge and a soft shade of the band's own blue under that, drawn centred on the head's own edge from the
 * jaw's meeting with the collar's front back to under the ear, so only its lower half shows below the fur. It follows
 * the head's edge before the jaw's wisps, so the wisps hang soft over a smooth rim, as the crop's do, and are not each
 * outlined in blue like a row of teeth (audit side #6).
 */
function collarContact(): string {
  const f = uid("blur"), g = uid("blur");
  const chin = spanPoints(HEAD_OUTLINE, fracAt(HEAD_OUTLINE, [-36, -62.4]), fracAt(HEAD_OUTLINE, [-60.4, -58.6]));
  const rim = strokeOf(chin, 1.8, { taper: 2.5, tip: 0.6 }).d;
  const shade = strokeOf(chin, 4.4, { taper: 4, tip: 1 }).d;
  return `<defs>${blur(f, [-64, -68, 32, 14], 0.3)}${blur(g, [-64, -68, 32, 14], 0.9)}</defs>` +
    `<path d="${shade}" fill="${C.collarLine}" opacity="0.4" filter="url(#${g})"/><path d="${rim}" fill="${C.collarRim}" opacity="0.55" filter="url(#${f})"/>`;
}

/** The side view in a facing: side.L as the crop draws it, or side.R, its mirror lit from the top left (views/facing.ts). */
export function side(facingSide: Side = "L"): Drawn[] {
  const F = facing(facingSide);
  const backPaintF = backPaint(F), backLinesF = backLines(F), tailPaintF = tailPaint(F), headPaintF = headPaint(F);
  const out: Drawn[] = [];
  const add = (name: string, p: Piece, state?: string) => out.push({ part: name, piece: p, ...(state ? { state } : {}) });
  // The ground shadow (parts/shadow.ts, DECISIONS 218): the sheet's broad soft oval, from in front of the far paw to
  // under the tail's plume, darkest under the paws and the haunch where they press.
  add("shadow", lineGate(groundShadow({ reach: [-92, 40], presses: [{ x: -50, half: 13 }, { x: -69, half: 6 }, { x: -21, half: 10 }, { x: 4, half: 10 }] })));
  // The tail's one line all round (DECISIONS 210, 237): from under the rump up its front by the tan root, over the
  // curl and the top, down its clumps and along its underside to under the rump again; light over the cream plume, as
  // the tail-curve panel draws its lobes (L* about 80), so its notches read as soft partings, not dark cuts.
  // On the tan where the root lies along it by the rump, and deeper along its foot by the ground, as the crop draws it.
  // Over the plume it comes and goes with the locks, light over each lock (at most 0.2, as before) and deepening into
  // each notch where one lock's tip hangs over the next (to 0.45; 210's `most`). Along the underside it is the crop's dark under the tan root (L* 40 to 48 from x 16 to 26), lightening
  // toward the plume's foot (57 to 63 by x 28 to 31): on the tan to x 27, easing to the tan's tone 5 there, and on the
  // cream from there at the same darkness (its tone 8), easing to the light's own by x 31, so neither its tone nor its
  // width steps where it leaves the tan (the first switched ladders at x 23, a seam of 7 L* in 1 pt).
  const underside = (p: P) => p[1] > -16;
  const ease = (x: number, x0: number, x1: number, a: number, b: number) => a + (b - a) * Math.min(1, Math.max(0, (x - x0) / (x1 - x0)));
  const footDepth = (p: P) => (p[0] < 27 ? ease(p[0], 20, 27, 0.65, 0.5) : p[0] < 31 ? ease(p[0], 27, 31, 0.8, 0.45) : ease(p[0], 31, 35, 0.45, 0.12));
  const tailLines: LitSpan[] = [{ from: [15.6, -32.8], to: [15, -11], on: (p: P) => (underside(p) ? (p[0] < 27 ? "tan" : "cream") : p[0] < 23 && p[1] > -38 ? "tan" : "cream"),
    most: (p: P) => (underside(p) ? footDepth(p) : p[0] < 23 && p[1] > -38 ? 0.6 : 0.2 + 0.25 * nearNotch(p)),
    under: (p: P) => (underside(p) ? footDepth(p) : 0), ends: ["under", "under"] }];
  add("tail", lineGate(litPart("tail", tail, tailPaintF, tailLines)));
  // The tail's tan root, its edge brushed into strands radiating from the rump along the fur, darkest at the root, with
  // a few darker strands inside (parts/marking.ts brush, DECISIONS 217): no light streaks.
  add("tail.base", lineGate(join(litMarking("tail.base", { shape: tail, paint: tailPaintF, spans: tailLines }, tailBase, { fill: C.marking, blur: 0.9 }),
    brush("tail.base", tail, tailBase, 0.9, { flow: (p: P) => [p[0] - 10, p[1] + 23], seed: 2352, edge: 22, out: [1, 2.6], in: [1.5, 3], width: [0.7, 1.2],
      inside: { count: 5, length: [4, 7], colour: C.earLow, opacity: 0.4, width: 0.8 }, colour: C.marking }))));
  // The far front leg's front, from under the chest at the tag's foot down round its bun and along its sole to under
  // the near paw, as dark as the crop's (L* 45 to 55 round the bun).
  add("front.R", lineGate(litPart("front.R", legFar, legFarPaint(F), [{ from: [-62.8, -37], to: [-63.2, -4.6], under: byHeight(0, 0.5, -16, -8), ground: "sole", ends: ["under", "under"] }])));
  // The chest's front edge over the far leg, from under the tag down to the near leg's wrist, where the near leg's line
  // takes it on: a contact line (Q31), at most 0.3, the crop's light line there (0.4 read 2.8 L* darker and its ink
  // 0.40 against the line check's 0.31); and the belly's foot on the ground in the small V between the near paw's heel
  // and the hind paw's toe, from under the one to under the other, light as the crop's (L* about 72 there).
  add("body.front", lineGate(roomy(litPart("body.front", chest, chestPaint(F), [{ from: WRIST, to: [-63.3, -42.4], contact: true, most: 0.3, ends: ["join", "under"] },
    { from: [-29.8, -3], to: [-41.2, -2], most: 0.1, ends: ["under", "under"] }]), 1)));
  add("body.back", lineGate(roomy(litPart("body.back", back, backPaintF, backLinesF), 1)));
  // The saddle, its edge brushed along the back's curve, combed down and back, with a few darker strands in it
  // following the back's curve (parts/marking.ts, DECISIONS 217).
  add("back.patch.L", lineGate(join(litMarking("back.patch.L", { shape: back, paint: backPaintF, spans: backLinesF }, saddle, { fill: C.marking, blur: 0.45 }),
    strands("back.patch.L", saddle, 0.45, [[[-8, -55], [-2.6, -52.4], [3.4, -47.6]], [[-4.4, -47.4], [1.6, -44.8], [7.4, -41]], [[3, -56], [7.6, -51.6], [11.8, -45.4]],
      [[-11, -51], [-7.4, -48], [-3.6, -45]]], { colour: C.earDeep, opacity: 0.55, width: 0.8 }),
    brush("back.patch.L", back, saddle, 0.45, { flow: [0.6, 1], seed: 2353, edge: 24, out: [0.8, 2.2], in: [1.5, 2.8], width: [0.7, 1.1],
      inside: { count: 3, length: [4, 7], colour: C.earDeep, opacity: 0.3, width: 0.8 }, colour: C.marking }))));
  // The rump's spot is the left side's only (model.json's marking map): side.R shows none.
  if (F.shows("rump.patch.L")) add("rump.patch.L", lineGate(litMarking("rump.patch.L", { shape: back, paint: backPaintF, spans: backLinesF }, rump, { fill: C.marking, blur: 0.7, fade: rumpFade })));
  // The hind paw's line (DECISIONS 216, 238): from where its sole takes up the haunch's underside on the ground, along
  // its sole (the ground's dark under its middle), round its toe end, up its front past where the near paw's heel
  // leans on it and up into the thigh's line, as the crop draws one line from the ground into the thigh; its crown and
  // back lie on the haunch unlined, as the crop leaves them (its length cited). Its top, over the haunch, is the light's
  // own thin line (at most 0.2 above y -13), as the crop's light line there is (the line check: its ink there 0.55
  // against 0.36 at 0.4).
  add("hind.L", lineGate(roomy(litPart("hind.L", hindNear, hindPaint(F), [{ from: HIND_BACK, to: [-20.8, -16.7], under: byHeight(0.1, 0.45, -12, -4), most: (p: P) => (p[1] > -3 ? 0.55 : byHeight(0.2, 1, -13, -8)(p)), ground: "sole", ends: ["join", "free"], taper: 2, cites: 238, bare: [0, 19.3] }]), 6)));
  // The near leg's line (DECISIONS 216, 238): from the wrist, where it takes up the chest's edge, down the leg and round
  // its bun's toe end, along its sole (the ground's dark under its middle) and round its heel up to where the heel leans
  // on the hind paw's toe, ending on the hind paw's line; its back above and its top lie on the chest unlined, as the
  // crop leaves them (its length cited).
  add("front.L", lineGate(roomy(litPart("front.L", legNear, legNearPaint(F), [{ from: [-55.4, -29.4], to: APEX, under: byHeight(0, 0.5, -14, -6), ground: "sole", ends: ["free", "join"], taper: 2, cites: 216, bare: [0, 51.1] }]), 1)));
  const turn = uid("blur");
  add("collar", lineGate(part("collar", collar, {
    fill: C.collar,
    // Its lower half in shade, lit along its middle, its front end a darker round turn where the band wraps round the
    // throat, and a dark blue rim round its foot, as the sheet paints it.
    shade: { multiply: C.shadeBy, shapes: ["M-64 -53.6 C-50 -49 -32 -51 -14 -60.6 L-14 -46 L-64 -46Z"], blur: 0.9 },
    highlight: { d: "M-58 -57.4 C-46 -58 -32 -60 -18 -63.4 L-18 -61.4 C-32 -58 -46 -56 -58 -55.4Z", colour: C.collarHighlight, opacity: 0.3, blur: 0.9 },
    // Its front end's darker loop band, where the tag's ring hangs, its back edge crisp, as the side crop draws it
    // (audit side #7: x -62.2 to -58.6; DECISIONS 240).
    under: `<path d="M-62.4 -59.6 C-61.2 -60.1 -59.6 -60.1 ${LOOP_BACK.slice(1)} C-60 -51.3 -61.2 -51.4 -62.2 -52 C-62.8 -54.6 -62.9 -57.4 -62.4 -59.6Z" fill="${C.collarLine}" opacity="0.6" filter="url(#${turn})"/>` +
      `<path d="${LOOP_BACK}" fill="none" stroke="${C.collarRim}" stroke-width="0.6" stroke-linecap="round" opacity="0.6"/>` +
      `<defs>${blur(turn, [-66, -63, 12, 15], 0.35)}</defs>` + collarContact(),
    outline: { colour: C.collarRim, width: THIN, taper: 3, blur: 0.2, spans: [{ from: [-17.8, -62.6], to: [-62, -57.4] }] },
    light: F.light,
  })));
  add("tag", lineGate(tagPiece(F)));
  add("head.base", lineGate(part("head.base", head, headPaintF)));
  // The head patch, soft but defined, deepening a little toward the ear, as the sheet paints it.
  // Its edge brushed into the fur, its top breaking into small feathered strands against the cream crown and its foot
  // combed down the cheek, as the crop paints it (parts/marking.ts brush, DECISIONS 217; audit side #3).
  add("head.patch.L", lineGate(join(marking("head.patch.L", { shape: head, paint: headPaintF }, patch, { fill: C.patch, blur: 0.5, clip: false }),
    deepen("head.patch.L", patch, 0.5, [-46, 0], [-28, 0], 0.5),
    brush("head.patch.L", head, patch, 0.5, { flow: (p: P): P => (p[1] < -112 ? [0.25, -1] : [0.45, 1]), seed: 2354, edge: 22, out: [0.6, 1.6], in: [1, 2.2],
      width: [0.6, 1], inside: { count: 2, length: [3, 5], colour: C.marking, opacity: 0.3, width: 0.7 }, colour: C.patch }))));
  add("blush.L", blush());
  add("eye.L", eye(EYE), "open");
  add("brow.L", brow());
  add("nose", nose());
  add("mouth", mouth(), "smile");
  add("head.line", headLinePiece(F));
  add("ear.L", lineGate(litPart("ear.L", ear, earPaint(F), earSpans)));
  add("tuft", lineGate(join(crownFur(), topknot(CURLS, { fill: C.fur, highlight: { d: headLight(F), colour: C.light, opacity: 0.4, blur: 4 }, feather: { from: [0, -146.4], to: [0, -150.4] }, light: F.light }))));
  return F.finish(out);
}

/**
 * Points the sheet has no finder for, where this drawing puts them (dev output for the sheet match), each measured on
 * the drawing as phase 2 measured it on the sheet (refmap/landmarks.json, DECISIONS 11; DECISIONS 62).
 */
export const landmarks: Record<string, P> = {
  // The near front paw: midway along it as phase 2 boxed it, from its toe end (x -64.8) on over the belly's shade to the
  // hind paw's toe (x -30.8), and from its toe lines' top (y -10.2) to its sole (y -0.6).
  "paw.front.L": [-47.8, -5.4],
  // The far front paw: only its toe end shows, so the centre of what shows, from its toe end (x -75) to the near paw's
  // front (x -64.8) and from its top (y -20.4) to its sole (y -4.6).
  "paw.front.R": [-69.9, -12.5],
  // The hind paw: from its toe end (x -30.8) to where its top line fades (x -12), and from its toe lines' top (y -9.8)
  // to its sole (y -0.7).
  "paw.hind.L": [-21.4, -5.25],
  // The ring's top, where it rests on the collar: the tag's pivot (rig.json).
  "tag.ring": [-59.1, -58.3],
  // The seat: the middle of the haunch's underside, 1 pt inside it (DECISIONS 9).
  seat: [0, -3],
};

// The face states (spec L440-498; DECISIONS 170 to 185): every state the front draws, seen in profile, each from this
// view's own rest drawing where its rest feature sits: the eye states by the dog's one eye recipe on the profile's eye
// (parts/eye.ts), the lash bands as wide as the profile eye; the mouths typed here from the profile's rest smile and the
// motion sheet's Jump (the open mouth in profile: an opening hanging under the upper lip from the lip's notch back to
// the corner, the tongue in its lower half), painted by the turned views' mouth layers (parts/turned.ts); the brow
// this view's dab moved as the front's is. The profile draws one eye, one brow and the near ear (61); the mouth is
// clipped to the head (rig.json), so every opening lies inside the head's outline, its front along the chin's line,
// which head.line draws over it as the lower lip's edge. side.R is each drawn again in its facing (views/facing.ts).

/**
 * The profile's lash bands: placed from the open eye's centre as the front places its own, the band about as wide as the
 * profile eye's opening, at the front's weight (DECISIONS 141, 202): the master sheet's even band with round ends, the
 * crescent 5 pt, the closed lid and the wink 4.8, as the profile's eye is the near one.
 */
function lidOf(state: LidState): TurnedEyeLid {
  const band = (out: number, down: number, b: Omit<LidBand, "centre" | "tilt" | "noseward">): TurnedEyeLid =>
    ({ band: { centre: [EYE.centre[0] + out, EYE.centre[1] + down], tilt: 0, noseward: EYE.noseward, ...b } });
  switch (state) {
    // The crescent 2.6 pt below the open eye's centre and 1.3 pt back (the profile eye is taller than the front's: the
    // front's 2.35 grown with it), 14 pt across, the profile eye's 15.2 less its soft edge, its back end a little lower.
    case "happy":
      return band(1.3, 2.6, { width: 14, rise: 4.2, drop: 1, thickness: 5, ends: [2.6, 3.2], fullness: 0.35, flick: { length: 1.3, hook: -10 } });
    case "closed":
      return band(1.1, 2.2, { width: 13.4, rise: -2.8, drop: 0, thickness: 4.8, ends: [2.4, 2.2], fullness: 0.35, flick: { length: 1.2, hook: -30 } });
    case "wink":
      return band(0.4, 0.6, { width: 14, rise: 3.8, drop: -1.2, thickness: 4.8, ends: [2.4, 2.4], fullness: 0.35, flick: { length: 1.7, hook: -75 } });
    // The three-quarter's half-lid (parts/turned.ts), over the same two fifths of the eye, so the lid never changes as
    // the head turns between the two; the catchlight on the iris just under the lash, its top tucked under it (Q28),
    // the tiny one below it (Q26).
    case "sleepy": {
      const s = EYE.ry / 9.2;
      return { spec: EYE, lid: { level: -3.2 * s, bow: 1.8 * s, tilt: 0, lash: 1.9, overhang: 0.5, shine: { at: [2.2, 0.1], r: 1.3 } } };
    }
    // Huffy's flat lid (DECISIONS 153, 207), as the front's: shut and level, a hair lower in its middle than at its ends,
    // as wide as the profile's closed lid, at the front's weight (4.4 pt, a little lighter than the crescent).
    case "flat":
      return band(1.1, 1.3, { width: 13.4, rise: -1, drop: 0, thickness: 4.4, ends: [2.6, 1.8], fullness: 0.45, flick: { length: 1.1, hook: 10 } });
  }
}

/** The profile's wide eye: 7% larger and a point higher, a hair toward the nose, the white broader, the catchlight bigger. */
const WIDE: EyeSpec = { ...EYE, centre: [EYE.centre[0] - 0.3, EYE.centre[1] - 0.9], rx: EYE.rx * 1.07, ry: EYE.ry * 1.07,
  white: { ...EYE.white, width: EYE.white.width * 1.15, span: EYE.white.span + 6 }, shine: { at: [2.4, 4.6], r: 1.85 }, glow: { band: 6.4, warm: 2.2 } };

/** The profile eye's ball states (exported for the R3 gaze guard): the open eye changed as the front changes its own. */
export function profileEyeSpec(state: "open" | "wide" | "peek" | "sparkle" | "eager" | "peekBack", light: P = LIGHT): EyeSpec {
  switch (state) {
    case "open":
      return EYE;
    case "wide":
      return WIDE;
    // Side glance back toward the person (the viewer's right), as the front's and the three-quarter's look: the white a
    // broad crescent in front, on the nose's side; the catchlights ride the iris at half its travel (Q28).
    case "peek": {
      const e = { ...EYE, white: { at: 186, width: 4, span: 58, fade: 0.3 } };
      return { ...e, shine: riding(e, EYE, EYE.shine) };
    }
    // The sparkle (Q2, DECISIONS 203): the star in the lower iris, and the two plump gold stars just past the eye's back
    // top, on the head's patch, the larger five-pointed and the smaller four.
    case "sparkle":
      return { ...EYE, sparkle: { star: { at: [1.4, -5], r: 3.3 }, level: 0, light, stars: [{ at: [-11.8, 10.2], r: 3.6, points: 5 }, { at: [-13.8, 2.8], r: 2.5, points: 4 }] } };
    // Hungry's eager eye (DECISIONS 151, 207): the wide eye, its pupil larger, the iris baked toward the nose and a hair
    // down, on the food in front of the nose, the white a crescent down its back; the catchlights ride the iris (Q28).
    case "eager": {
      const e = { ...WIDE, white: { at: 10, width: 2.6, span: 55, fade: 0.3 }, glow: { band: 3, warm: 1.2 } };
      return { ...e, shine: riding(e, WIDE, { at: WIDE.shine.at, r: WIDE.shine.r * 1.1 }) };
    }
    // Huffy's peek back (DECISIONS 153, 159, 207): the eye open and bright, looking back at the person as the peek does,
    // level, never up: the white in front a little below its level (168°), the catchlights riding the iris (Q28).
    case "peekBack": {
      const e = { ...EYE, white: { at: 168, width: 3, span: 56, fade: 0.3 } };
      return { ...e, shine: riding(e, EYE, EYE.shine) };
    }
  }
}

/**
 * The profile's squeeze (Q2, DECISIONS 202): the front's `>` `<` on the one eye, its point 7 pt in from the ball's middle
 * toward the nose, its arms' run across shortened to the profile eye's width (0.8 of the front's), their rise kept; at
 * the profile crescent's weight, the front's 5 pt.
 */
export function profileSqueeze(): Chevron {
  const k = EYE.rx / 9.5;
  const foreshorten = (len: number, deg: number): [number, number] => {
    const a = (deg * Math.PI) / 180, [x, y] = [len * Math.cos(a) * k, len * Math.sin(a)];
    return [Math.hypot(x, y), (Math.atan2(y, x) * 180) / Math.PI];
  };
  const [lu, au] = foreshorten(16.8, 14), [ll, al] = foreshorten(15.8, 26);
  return { tip: [EYE.centre[0] + EYE.noseward * 8.8 * k, EYE.centre[1]], tilt: 0, noseward: EYE.noseward, length: [lu, ll], angle: [au, al],
    thickness: 5, ends: 4.3, bow: 0.8, point: 1 };
}

function eyeState(state: (typeof EYE_STATES)[number], light: P): Piece {
  switch (state) {
    case "happy":
    case "closed":
    case "wink":
    case "sleepy":
    case "flat":
      return drawLid(lidOf(state));
    case "squeeze":
      return chevron(profileSqueeze());
    default:
      return eye(profileEyeSpec(state, light));
  }
}

/** The lip's notch, where the head's line brings the upper lip down from the nose (lipEdge) and the smile begins. */
const NOTCH: P = [-92.8, -80.2];

/**
 * An open mouth in profile, typed in model space: the upper lip from the notch back to the corner's upturned curl
 * (mouth.L); the opening under it, from the notch back to the corner and down round its foot to the chin's line at
 * its front; its rims down its back and round its foot; the tongue in its lower half; the deep band under the lip.
 */
interface Profile {
  lip: P[];
  opening: P[];
  /** The opening's sharp nodes: the front under the notch and the back corner. */
  corners: number[];
  back: P[];
  foot: P[];
  tongue: string;
  deep: string;
  shine: P;
}

// The chin's line under the notch, as the head draws it (its front edge, measured on the rest still's ID pass): x −91.7
// at y −79, −91 at −77, −89.3 at −75, −88.3 at −74, −87.3 at −73, −86 at −72. Each opening's front and foot run along
// it, within the chin's own line (head.line, about 0.9 pt of which lies inside the head), so the line is the lower lip's.

/** Jump's open mouth (the motion sheet): from the notch back past the rest smile's corner, 9 pt across and 8 deep, deepest behind its middle. */
const OPEN: Profile = {
  lip: [NOTCH, [-91, -80.5], [-89, -80.95], [-87, -81.65], [-85.2, -82.5], [-84, -83.4], [-83.5, -84.6]],
  opening: [[-92.6, -80.3], [-90.8, -80.6], [-88.8, -81.1], [-86.9, -81.8], [-85, -82.6], [-83.9, -83.3], [-83.8, -81.6], [-84.3, -79.6], [-85.2, -77.6],
    [-86.4, -75.9], [-87.8, -75], [-89.2, -75.4], [-90.4, -76.3], [-91.3, -77.6], [-92.1, -79]],
  corners: [0, 5],
  back: [[-83.9, -83.1], [-83.8, -81.6], [-84.3, -79.6], [-85.2, -77.6], [-86.4, -75.9]],
  foot: [[-85.2, -77.6], [-86.4, -75.9], [-87.8, -75], [-89.2, -75.4], [-90.4, -76.3]],
  tongue: "M-93 -73 L-93 -79.2 C-91 -79.9 -88.4 -80.1 -86 -79.6 C-85 -79.3 -84.2 -78.7 -83.6 -77.9 L-83.6 -73Z",
  deep: "M-93.5 -81.2 L-83.2 -84.2 L-83.2 -81.6 C-86 -80.8 -89.5 -79.8 -93.5 -79.3Z",
  shine: [-88.8, -76.9],
};

/** Laughing in profile: the corner 1.5 pt further back and higher, the opening 1.4 pt deeper. */
const LAUGH: Profile = {
  lip: [NOTCH, [-90.8, -80.6], [-88.5, -81.2], [-86.3, -82], [-84.3, -83], [-82.6, -84.2], [-82, -85.5]],
  opening: [[-92.6, -80.3], [-90.6, -80.7], [-88.4, -81.3], [-86.3, -82.1], [-84.2, -83.1], [-82.4, -84.2], [-82.3, -82.2], [-82.8, -79.8], [-83.8, -77.3],
    [-85, -75.2], [-86.5, -73.9], [-88, -73.9], [-89.3, -74.8], [-90.4, -76], [-91.3, -77.4], [-92.1, -79]],
  corners: [0, 5],
  back: [[-82.4, -84], [-82.3, -82.2], [-82.8, -79.8], [-83.8, -77.3], [-85, -75.2]],
  foot: [[-83.8, -77.3], [-85, -75.2], [-86.5, -73.9], [-88, -73.9], [-89.3, -74.8]],
  tongue: "M-93 -71.5 L-93 -78.8 C-91 -79.6 -88.2 -79.8 -85.6 -79.2 C-84.4 -78.9 -83.4 -78.1 -82.8 -77.1 L-82.8 -71.5Z",
  deep: "M-93.5 -81.3 L-81.8 -85 L-81.8 -82.2 C-85 -81 -89.5 -79.8 -93.5 -79.3Z",
  shine: [-88.4, -76.1],
};

/**
 * The tongue pushed forward and up to the opening's front, filling it to the lower lip under the notch (cheeky, pant):
 * a tongue out past the chin cannot draw in profile, where the mouth is clipped to the head and the chin's line drawn
 * over it (DECISIONS 180).
 */
const TONGUE_FORWARD = { open: "M-93 -73 L-93 -80 C-91.6 -80.2 -89.6 -80 -88 -79.2 C-86.8 -78.6 -85.8 -77.6 -85.2 -76.4 L-85.2 -73Z",
  laugh: "M-93 -71.5 L-93 -80.1 C-91.4 -80.4 -89.2 -80.2 -87.3 -79.4 C-85.8 -78.7 -84.6 -77.6 -83.9 -76.2 L-83.9 -71.5Z" };

function profileOpen(p: Profile, tongue = p.tongue): TurnedMouth {
  const opening = smooth(p.opening, { corners: p.corners });
  const lip = sample(smooth(p.lip, { closed: false }).segs, 12, false);
  const along = (pts: P[]) => sample(smooth(pts, { closed: false }).segs, 8, false);
  return {
    piece: paintOpen({
      lip, lipEnds: [p.lip[0]!, p.lip[p.lip.length - 1]!], opening, deep: [p.deep], tongue,
      shine: { at: p.shine, r: [2, 1.1] }, sides: [along(p.back)], foot: along(p.foot), box: boxOf([...sample(opening.segs, 8, true), ...lip], 3),
    }),
    lip: { line: lip, centre: NOTCH },
  };
}

/**
 * An opening alone in profile (o, yawn): an egg with its soft point up, as the front's, seen from the side: narrower, its
 * top leaning toward the nose, its front at the chin's line under the notch.
 */
function profileOval(centre: P, half: number, height: number, lean: number): TurnedMouth {
  const a = (lean * Math.PI) / 180;
  const at = ([x, y]: P): P => [centre[0] + x * Math.cos(a) - y * Math.sin(a), centre[1] + x * Math.sin(a) + y * Math.cos(a)];
  const top = -height / 2, widest = top + 0.64 * height;
  const side = (s: number, n: number) => half * Math.max(0, 1 - s ** n) ** (1 / n);
  // Rounder over its top than the front's (2 against 1.7): seen from the side the o's soft point reads as a seed.
  const right: P[] = [...[1, 0.97, 0.88, 0.7, 0.5, 0.3, 0.12, 0].map((s): P => [side(s, 2), widest - s * (widest - top)]),
    ...[0.4, 0.7, 0.9, 0.98].map((s): P => [side(s, 2.2), widest + s * (height / 2 - widest)]), [0, height / 2]];
  const loop = [...right, ...right.slice(1, -1).reverse().map(([x, y]): P => [-x, y])];
  const opening = smooth(loop.map(at));
  const edge = sample(smooth(loop).segs, 16, true);
  const mid = 0;
  const sides = ([1, -1] as const).map((sx) => edge.filter(([x, y]) => sx * x > 0 && y < mid + 1.5).sort((p, q) => p[1] - q[1]).map(at));
  const foot = edge.filter(([, y]) => y > mid).sort((p, q) => p[0] - q[0]).map(at);
  const ring = sample(opening.segs, 16, true);
  const tongueTop = height * 0.12;
  return {
    piece: paintOval({
      opening, top: `M${[[-half - 2, top - 1], [half + 2, top - 1], [half + 2, top + 3.2], [0, top + 2], [-half - 2, top + 3.2]].map((q) => at(q as P).map((n) => Math.round(n * 1000) / 1000).join(" ")).join(" L")}Z`,
      tongue: `M${[[-half - 2, height], [-half - 2, tongueTop + 1.4], [0, tongueTop], [half + 2, tongueTop + 1.4], [half + 2, height]].map((q) => at(q as P).map((n) => Math.round(n * 1000) / 1000).join(" ")).join(" L")}Z`,
      shine: { at: at([-0.3, tongueTop + 1.6]), r: [half * 0.4, 1] }, sides, foot, box: boxOf(ring, 3),
    }),
    opening: ring,
  };
}

function profileMouth(state: ProfileMouthState): TurnedMouth {
  switch (state) {
    case "open":
      return profileOpen(OPEN);
    case "laugh":
      return profileOpen(LAUGH);
    case "cheeky":
      return profileOpen(OPEN, TONGUE_FORWARD.open);
    case "pant":
      return profileOpen(LAUGH, TONGUE_FORWARD.laugh);
    case "o":
    case "yawn": {
      const o = OVALS[state];
      return profileOval(o.centre, o.half, o.height, o.lean);
    }
    case "pressed":
      return profileClosed(PRESSED_SIDE, "pressed mouth");
    case "tinySmile":
      return profileClosed(TINY_SMILE_SIDE, "tiny smile");
    case "o.tongue": {
      // Hungry's lick (DECISIONS 154, 207): the rest smile, and the tongue's tip peeking out under its arc just inside the
      // corner's curl, its top along the smile's line, which lies over it, a lobe about 3.5 pt across and 3.5 below it.
      const rest = profileClosed(REST_SMILE, "smile");
      const lip = smooth(REST_SMILE, { closed: false });
      const line = sample(lip.segs, 16, false);
      const under = (x: number) => {
        for (let i = 1; i < line.length; i++) {
          const [a, b] = [line[i - 1]!, line[i]!];
          if ((x - a[0]) * (x - b[0]) <= 0) return a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0] || 1);
        }
        return -80.2;
      };
      const tip = lickTip(LICK_SIDE, LICK_SHINE, ([x, y]) => y < under(x) + 0.15);
      return { piece: { svg: tip.piece.svg + rest.piece.svg, box: unionBox(rest.piece.box, tip.piece.box), meta: { shapes: [], lines: [...rest.piece.meta.lines, ...tip.piece.meta.lines] } }, lip: rest.lip };
    }
  }
}

/** Where the lick's soft shine sits on its lobe, up and toward the nose: as the profile's other tongues' shines, it belongs to its place. */
const LICK_SHINE: P = [-0.6, -0.8];
const unionBox = (a: Box, b: Box): Box => {
  const x = Math.min(a[0], b[0]), y = Math.min(a[1], b[1]);
  return [x, y, Math.max(a[0] + a[2], b[0] + b[2]) - x, Math.max(a[1] + a[3], b[1] + b[3]) - y];
};

/**
 * Huffy's pressed mouth in profile (DECISIONS 153, 207): the smile drawn in from the lip's notch only a third of its run
 * back, nearly level, its end tucked a hair above the notch (no frown, no pout); and the peek back's tiny smile, the
 * rest smile at about three fifths of its run, its curl turning up.
 */
const PRESSED_SIDE: P[] = [[-92.8, -80.2], [-91.6, -80.02], [-90.3, -79.98], [-89.2, -80.1], [-88.5, -80.35]];
const TINY_SMILE_SIDE: P[] = [[-92.8, -80.2], [-91.7, -79.75], [-90.3, -79.6], [-89.1, -79.85], [-88.3, -80.5], [-88, -81.3]];
/** The lick's lobe in profile: under the smile's arc just inside its curl, at the corner's end of the mouth. */
const LICK_SIDE: P[] = [[-89.6, -79.55], [-88, -79.62], [-86.6, -80.2], [-85.6, -79.3], [-85.5, -77.6], [-86.3, -76.4], [-87.7, -76.3], [-88.8, -77.2], [-89.4, -78.4]];

/** A closed mouth in profile, as the rest smile is painted (mouth()): one inner line in the printed dark brown at 90%, from the notch back. */
function profileClosed(pts: P[], where: string): TurnedMouth {
  const line = sample(smooth(pts, { closed: false }).segs, 8, false);
  const s = tapered(line, 0.9, "inner", where, { taper: 1, tip: 0.5 });
  const f = uid("blur"), box: Box = [-98, -93, 16, 15];
  return {
    piece: piece(`<defs>${blur(f, box, 0.15)}</defs><g fill="${C.dark}" opacity="0.9" filter="url(#${f})"><path d="${s.d}"/></g>`, box, { shapes: [], lines: [s.line] }),
    lip: { line, centre: NOTCH },
  };
}

/**
 * Huffy's puffed cheek in profile (DECISIONS 208): the near ball (parts/cheeks.ts PUFF) behind the mouth's corner and
 * under the eye, where the front's sits beside the mouth, a little narrower across as the profile's muzzle is, its
 * crease hugging the pressed mouth's end. Held out of the package: `cheeks` has no place in the profile's draw order.
 */
const PUFF_SIDE: TurnedPuff = { c: [-76.2, -80.6], rx: 7.4, ry: 8, turn: 0, mouthward: -1 };

/**
 * The profile's openings alone: the o a small egg 5.8 pt across and 7.4 tall just behind the lip's front, leaning 8°
 * back from its top; the yawn the o grown to 7.2 pt across and 10.4 tall, the upper lip lifting with it.
 */
const OVALS = { o: { centre: [-88.4, -78.4] as P, half: 2.9, height: 7.4, lean: 8 }, yawn: { centre: [-87.6, -78] as P, half: 3.6, height: 10.4, lean: 12 } };

// The one perked ear in profile, as One ear perked draws it (DECISIONS 133, 178): the ear flipped up over the head from
// its root on the crown behind the topknot, standing above the crown and running back and a little down to a round free
// end over the back of the head, its inside showing in a darker wedge behind the fold at the root. In profile the ear
// draws over the head (61), so its root is feathered into the crown's fur, as the hanging ear's top is, and the topknot
// draws over its foot. With the ear up, the side of the head it hung over shows: the head patch, which ran on under the
// ear and was cut off there, runs on back toward the ear's root as the root's tan and fades out (the front's temple,
// DECISIONS 133), and the back of the head and its lower edge over the collar carry the head's line, which the hanging
// ear covered.

/** The ear flipped up over the crown, from its root behind the topknot's back curl to its free end over the back of the head. */
const PERKED_BASE = smooth([[-17, -151.8], [-16.4, -158], [-13.4, -165], [-8.2, -170.6], [-1.4, -173.8], [6.4, -174], [13.8, -171.2], [19.8, -165.8], [24.4, -158.8],
  [27, -151.4], [27.4, -144.6], [25, -139.6], [20.8, -137.8], [16, -139.4], [11.6, -142.6], [7, -145.8], [2, -148.2], [-4, -150], [-10.4, -151.8]]);
/**
 * The perked flap's edge by the rest ear's recipe (parts/ear.ts earEdge, DECISIONS 215, 237), so the state swap keeps
 * the ear's fur: one low step along its top 40% of the way out, its free end a hem of three low rounded lock tips of
 * uneven width, and one line round its free edge from the crown's fur at its root, over its top and round its hem, back
 * along its underside to the crown, where it goes under the topknot's back curl; thin and light over its top, deepening
 * round its hem.
 */
const PERKED_EDGE = earEdge({
  base: PERKED_BASE,
  steps: [{ from: [2.2, -174.1], to: [9.2, -173.4], lock: { len: 0.7, width: 6.6, lean: -0.3 }, tipRound: 0.3 }],
  hem: { from: [25.6, -156], to: [14, -140.6], locks: [{ len: 0.75, width: 9.5, lean: 0.2, dip: 0.35 }, { len: 1, width: 11.5, lean: 0.1, dip: 0.4 },
    { len: 0.7, width: 8.5, lean: -0.1 }], tipRound: 0.24 },
  axis: [[-4, -173], [25, -139]], deep: 0.3,
  line: { from: [-16.4, -157.4], to: [-12.4, -151.6], ends: ["free", "under"] },
});
const perked = PERKED_EDGE.shape;
/**
 * Where the patch ran on under the hanging ear and was cut off there (x −24), its tan runs on up the side of the head to
 * the ear's root on the crown, as One ear perked paints the side of the head under its perked ear, its back edge soft.
 */
const rootTan = smooth([[-31, -130], [-27, -136], [-21.6, -142.4], [-15, -148.6], [-8, -150.6], [-3, -148], [-4.6, -140], [-9, -130], [-13.4, -118], [-16.6, -106],
  [-19, -95], [-21.6, -86], [-26, -82], [-31, -86], [-32, -108]]);

function perkedEar(F: Facing): Piece {
  // Its locks fan out from the root toward the free end, uneven in length and spacing, each ending in the hem tip nearest
  // it (UNEVEN, FAN): the first four ran within a few degrees of each other, a comb.
  const paint = earFur({
    ear: perked, edge: PERKED_EDGE, axis: [[-4, -173], [25, -139]], deepen: [0.35, 1],
    locks: [[[2, -170], [10, -168.4], [17.5, -165], [24, -160]], [[3, -163.5], [11, -160], [17.5, -153.5]], [[-2, -156], [6.5, -153], [13.5, -148], [19, -142.5]],
      [[6, -150], [11, -146], [14, -140.5]]],
    dips: [],
    light: F.lit("M-12 -167 C-6 -172.4 4 -174 13 -171.4 C7 -169.8 0 -168.6 -7 -164.4Z", middle(perked)),
    under: ["M-18 -154 C-10 -152 -2 -151 6 -148 L6 -140 L-18 -142Z"],
    fold: { line: [[-7.6, -168.6], [-5, -162.6], [-2.6, -156.6], [-0.2, -150.6]], back: "M-7.6 -168.6 L-5 -162.6 L-2.6 -156.6 L-0.2 -150.6 L-14 -151 L-15 -162Z" },
  });
  // Its root on the crown, under the topknot's back curl, which draws over it: its line (PERKED_EDGE's one span) starts in
  // the crown's fur at the flap's root, runs over its top, round its hem and back along its underside to the crown,
  // where it goes under the curl (DECISIONS 210, 237); light over the top and deepening round the hem's tips, at most
  // 0.3 there, as the rest ear's.
  const flap = litPart("ear.L", perked, { ...paint, inner: (paint.inner ?? []).map((l) => ({ ...l, opacity: 0.4 })), light: F.light },
    [{ ...PERKED_EDGE.span, most: (p: P) => 0.1 + 0.2 * Math.max(0, ...PERKED_EDGE.tips.map((t) => Math.exp(-((v.len(v.sub(p, t)) / 9) ** 2)))) }]);
  // The root's tan: the patch's own tan, deepened as the patch is toward the ear (its marking tan at half), and the
  // ears' deep tan by the root, soft at its edge, so it runs on from the patch with no edge.
  const deep = uid("root"), f = uid("blur");
  const box = pad([-34, -153, 33, 73], 4);
  const d = pathD(rootTan.segs);
  const tan = piece(`<defs><linearGradient id="${deep}" gradientUnits="userSpaceOnUse" x1="-8" y1="-150" x2="-14" y2="-124">` +
    `<stop offset="0" stop-color="${C.earDeep}" stop-opacity="0.6"/><stop offset="1" stop-color="${C.earDeep}" stop-opacity="0"/></linearGradient>${blur(f, box, 1.4)}</defs>` +
    `<g filter="url(#${f})"><path d="${d}" fill="${C.patch}"/><path d="${d}" fill="${C.marking}" opacity="0.45"/><path d="${d}" fill="url(#${deep})"/></g>`, box);
  // The head's line down the back of the head and along its lower edge over the collar, where the hanging ear covered
  // it, by the line rule (parts/lines.ts), joining head.line's span over the crown and ending in the fur over the collar.
  const [x0, y0, x1, y1] = bbox(head.segs);
  const lineBox = pad([x0, y0, x1 - x0, y1 - y0], 2);
  // head.line's own span now runs on down the back of the head under the hanging ear (to y -84), so with the ear up this
  // line takes it up there and runs on along the head's lower edge.
  const line = litEdge(head, [{ from: [14.2, -84], to: [-26.6, -64.2], under: (p: P) => (p[1] > -80 ? 0.35 : 0), ends: ["join", "free"] }], "back of the head", lineBox, { reach: 0.5, light: F.light });
  const back = piece(`<defs>${line.defs}</defs>${line.body}`, lineBox, { shapes: [], lines: line.lines });
  return join(tan, back, flap);
}
/**
 * Proud's stars (DECISIONS 138). Their side, the dog's right, is behind the head in profile, so they stand where the
 * profile shows them clear of it: up in front of the forehead, the larger lower, as the front stacks them.
 */
const STARS: Star[] = [{ at: [-93, -146], size: [11.4, 14.4], turn: 0 }, { at: [-80.6, -162], size: [9.6, 10.4], turn: 0 }];

/** The face states this view draws besides its rest, in a facing: side.L's, or side.R's drawn again in it. */
export function sideFaces(facingSide: Side = "L"): Drawn[] {
  const F = facing(facingSide);
  const out: Drawn[] = [];
  for (const state of EYE_STATES) out.push({ part: "eye.L", state, piece: eyeState(state, F.light) });
  for (const state of ["raised", "happy"] as const) out.push({ part: "brow.L", state, piece: brow(browState(BROW, state)) });
  out.push({ part: "ear.L", state: "onePerked", piece: lineGate(perkedEar(F)) });
  return F.finish(out);
}

/**
 * The face states drawn and tested but held out of the package for now, in a facing: the sparkle's stars and huffy's
 * puffed cheek, as threeQuarterHeld's, and the profile's mouths, which faces.test.ts still holds to the rest smile in
 * profile (its planted fault reads the side's mouth keys as they were before this round). The review build of the
 * turned faces' evidence adds them (qa/phase3/faces/turned/render.ts; DECISIONS 183, 208).
 */
export function sideHeld(facingSide: Side = "L"): Drawn[] {
  const F = facing(facingSide);
  const out: Drawn[] = [{ part: "stars", state: "sparkle", piece: turnedStars(STARS, F.light) }, { part: "cheeks", state: "puffed", piece: turnedCheeks([PUFF_SIDE], F) }];
  for (const state of PROFILE_MOUTHS) out.push({ part: "mouth", state, piece: profileMouth(state).piece });
  return F.finish(out);
}

/** What the face states are drawn from, for the R3 guards (characters/dog/test/faces.turned.test.ts). */
export const sideFace = {
  mouth: profileMouth,
  notch: NOTCH,
  rest: { smile: REST_SMILE },
  ovals: OVALS,
  brow: (state: BrowState) => browState(BROW, state),
  eye: EYE,
  /** Each ball state's spec, the squeeze, and the puffed cheek (the R3 guards read where the iris looks, the squeeze's arms, the puff). */
  spec: profileEyeSpec,
  squeeze: profileSqueeze,
  puff: PUFF_SIDE,
  /** The lid each closing eye state draws (the R3 guard reads its lean). */
  lids: lidOf,
  perked: { L: perked },
  /** The muzzle's level, as the profile is drawn upright (DECISIONS 179): the screen's. */
  levelDeg: 0,
};
