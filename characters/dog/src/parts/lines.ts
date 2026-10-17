// The dog's outer line, one rule in every view (DECISIONS 74): its colour and weight come from the light and the
// place, never typed span by span. Where the edge faces the top-left light the line is lightest and thinnest (1.2 pt,
// the cream ladder's L* 74, toward the sheet's L* 66 to 85 on the crown and the cream); where it turns away it
// deepens and fills out (1.55 pt); where a part meets the ground, and where the span says the place lies under
// another part (under the chin, an ear on the body, a haunch's underside), it is darkest and fullest (1.7 pt, the
// sole's line). Round the ears, and where the line lies on the tan, the same rule runs on the tan ladder, a warm
// brown. Each span tapers to nothing at both ends, so the line breaks where the fur breaks it. Colours come from
// palette.ts's LINES ladders, 11 tones each, so every colour is the palette's.
// The fur pass's options (DECISIONS 210 to 212, 216), each off unless a span or a view asks for it, so a view draws
// as it did until its lane opts in: `ends` gives one span per visible edge, tapering only where it ends in open fur;
// `contact` keeps a line where one part lies over another as dark in both facings (Q31); `ground: "sole"` puts the
// ground's dark only under the middle of a paw's sole; `crisp` keeps head.line's outer edge sharp.
import { arc, area, fracAt, sample, spanPoints, v, type At, type P, type Shape } from "../../../draw/geom.ts";
import type { DrawnLine } from "../../../draw/line.ts";
import { GATE, LIMITS, shapeKey, type EndKind, type SpanMeta } from "../../../draw/lint.ts";
import { LIGHT, marking, part, type Fade, type Paint } from "../../../draw/paint.ts";
import { blur, mask, pad, piece, region, uid, type Box, type Piece } from "../../../draw/svg.ts";
import { LINES } from "../palette.ts";
import { innerLinesIn } from "./paw.ts";

/** How a span's end finishes (DECISIONS 210): in open fur, tapering over 1.5 to 2 pt; on another line's end, at full width; or running on under the part that covers it. */
export type SpanEnd = "free" | "join" | "under";

export interface LitSpan {
  from: At;
  to: At;
  /** The ladder: round the cream fur (the default) or on the tan, along the span or at each point (a cheek's line runs from the tan over the ear onto the cream). */
  on?: "cream" | "tan" | ((p: P) => "cream" | "tan");
  /** How deep the place lies whatever the light, 0 to 1, along the span or at each point: a floor under the light's own depth (1 is the sole's). */
  under?: number | ((p: P) => number);
  /** How deep the line may lie at most, 0 to 1, along the span or at each point: a ceiling, lighter and thinner, where the sheet lines a fur edge lightly (the chin's and the cheeks' fur, DECISIONS 214). */
  most?: number | ((p: P) => number);
  /** How long each end tapers, in points: both ends alike, or [its start, its end]. With `ends`, how long a free end tapers (1.8 pt when left out). */
  taper?: number | [number, number];
  /**
   * How each end finishes (DECISIONS 210), [its start, its end]: a `free` end, where the line ends in open fur, tapers
   * over `taper` (1.8 pt by default); a `join` end meets another line on a shared point at full width, with a round
   * cap so the two meet at any angle; an `under` end runs on 1.5 pt past where it is typed at full width, under the
   * part that covers it, and then fades out over 1.8 pt there, so an end that no part covers fades rather than stopping
   * in a square cut (the line gate, lint.ts, checks that a part does cover it). Left out, both ends taper as before (74).
   */
  ends?: [SpanEnd, SpanEnd];
  /** A line where one part lies over another (DECISIONS 211, Q31): its depth is its place's, never the light's, and at least 0.5, so it keeps the sheet's darkness in both facings. */
  contact?: boolean;
  /** Where the ground darkens the line (DECISIONS 216): along the whole edge that faces it (the default), or only under the middle 60% of a paw's sole, where it presses, the line lighter, thinner and more varied round it. */
  ground?: "sole";
  /** The DECISIONS entry that lets this span break the line gate's rules (lint.ts), where the sheet draws it so: a current entry, or the gate fails the cite. */
  cites?: number;
  /** With `cites`: how far past each end, in points, the sheet leaves the edge unlined, [before its start, after its end], which the cite lets through and no further. */
  bare?: [number, number];
  /**
   * Line weight that lives (DECISIONS 260): the line's width follows its own profile along the span instead of its
   * depth, thick where the part presses or turns under (a sole, the bottom of a curve, under an overhang: the edge facing
   * down, or deep), swelling through each turn, thin on the lit top and along long gentle runs, with a gentle wobble from
   * the span's own fixed seed. Its tone still follows the light and the place, as without it. Left out, the width
   * follows the depth as before. With its `life` (DECISIONS 284), the line's life made visible (LIFE).
   */
  weight?: Weight;
  /**
   * Short tapered breaks where the crop's line comes and goes on a lit run (DECISIONS 284, the lead's L1 c), each typed
   * from the crop: where it lies on the span and how long its gap is (BREAK.gap pt). The line tapers out over
   * BREAK.taper either side and comes back; each break must lie on a lit run (the swell there no more than BREAK.lit)
   * and the span must cite the entry that explains it (`cites`), which the line gate holds. Left out, none.
   */
  breaks?: Break[];
}

/** A span's living weight (DECISIONS 260). */
export interface Weight {
  /** The span's own seed for its wobble, typed once and never changed, so its line is the same in every build and every state and never shimmers. */
  seed: number;
  /** How much of the outer band (1.2 to 1.8 pt) it swells across, 0 to 1 (1 by default). */
  amount?: number;
  /**
   * The line's life made visible (DECISIONS 284, the lead's L1 a, b, e): which class of edge the span is, whose sheet
   * figures set it (LIFE): the whole band used boldly, thin on lit tops and full where the edge presses, turns under or
   * meets the ground, its seeded strokes breathing on a lit run and swelling on a pressed one; its tone running with
   * its weight, lighter on the lit runs (into the lit steps, palette.ts's LINES.lit) and darker where pressed; both
   * easing to one width and tone at a joined end, and never beading. Left out, the living weight as before (260).
   */
  life?: LifeClass;
  /**
   * A typed swell profile (DECISIONS 284, the lead's L1 d), with `life`: where along the span the crop's line is thin
   * (0, the band's thin end) and where full (1), each at a point on the span, eased between them along it; it takes the
   * place of the edge's own (from the light and the place), so a view puts the swell where its crop does (thin under an
   * ear's hem, fuller down the rump and round a haunch's bottom). Left out, the edge's own.
   */
  swell?: Swell[];
}

/** The classes of edge whose life the sheet's figures set (LIFE): the legs, the back, the soles, the tail, the ears and the head's outline. */
export type LifeClass = "legs" | "back" | "soles" | "tail" | "ears" | "head";

/** One point of a typed swell profile: where on the span, and how full the line is there, 0 (the band's thin end) to 1 (its full end). */
export interface Swell {
  at: P;
  to: number;
}

/** One typed break in a span's line: where on the span its middle lies, and how long its gap is, in points. */
export interface Break {
  at: P;
  gap: number;
}

export interface LitOptions {
  /** The light, toward it (paint.ts's LIGHT; a mirrored facing passes its own). */
  light?: P;
  /** A soft edge, σ in points, drawn in sRGB. */
  blur?: number;
  /** Drawn unclipped, reaching this far past the path (head.line covers the stencil's edge), instead of inside the part's clip. */
  reach?: number;
  /** With `reach`: the soft edge kept inside the path grown by `reach`, so the silhouette's own edge stays crisp and only the line's inner side is soft (DECISIONS 212). */
  crisp?: boolean;
}

/** The widths: lit, turned away, darkest (the sheet's soft line peaks at about 1 to 1.5 pt even under the paws). */
const WIDTH = { lit: 1.2, away: 1.45, deep: 1.6 };
/** The line's soft falloff, σ in points: the sheet's line is a soft peak, never a flat plateau with hard edges. */
const SOFT = 0.3;
/** A free end's taper, in points (DECISIONS 210: 1.5 to 2 pt, the spec's "slightly tapered where it ends"). */
export const FREE_TAPER = 1.8;
/** How far an `under` end runs on past where it is typed, at full width, under the part that covers it (at least 1 pt), before it fades out over FREE_TAPER. */
export const UNDER_RUN = 1.5;
/** A contact line's least depth (Q31): the ladder's middle, the sheet's dark brown over a haunch's or an ear's edge. */
export const CONTACT_DEPTH = 0.5;
/**
 * Under a paw's sole (DECISIONS 216): the ground's dark only under the middle 60% of the sole, easing out over the
 * 20% at each end; there the line is tone 7 (L* 51.5, the sheet's front soles 51 ± 5.5 and hind soles 44 ± 3.6) and
 * 1.45 pt; elsewhere round the paw it is the light's own tone, from 1.2 pt where lit; and it wobbles ±15% along its
 * length, as the sheet's paw lines vary (the founder's "a lighter, warmer, varied line").
 */
export const SOLE = { depth: 0.7, width: [1.2, 1.45] as [number, number], middle: 0.6, wobble: 0.15 };

/** How deep a point of an edge lies, 0 to 1, from the light and the ground. */
function depth(p: P, out: P, light: P): number {
  // Facing the light, 0; side on to it, 0.15; turned away, 0.3; and deeper the nearer the ground the edge lies,
  // furthest from the light over the top, easing in from 45 pt up to 0.35 at the ground (the sheet's lines darken
  // from the crown's L* 68 to 81 and the chest's 67 to the haunches' 61 to 67 and the paws' 49 to 61).
  const t = Math.min(1, Math.max(0, (p[1] + 45) / 43));
  const lit = 0.3 * ((1 - v.dot(out, light)) / 2) + 0.35 * t * t * (3 - 2 * t);
  // Where the edge faces down onto the ground, it runs on to the darkest.
  const ground = Math.min(1, Math.max(0, (p[1] + 6.5) / 4.5)) * Math.min(1, Math.max(0, (out[1] - 0.15) / 0.5));
  return Math.min(1, lit + (1 - lit) * ground);
}

/** depth()'s two terms apart, for the fur pass's options: the light and the place (`lit`), and how much the edge faces the ground. */
function terms(p: P, out: P, light: P | undefined): { lit: number; ground: number } {
  const t = Math.min(1, Math.max(0, (p[1] + 45) / 43));
  // With no light (a contact line), the edge counts as side on to it, whichever way it faces.
  const facing = light ? (1 - v.dot(out, light)) / 2 : 0.5;
  return {
    lit: 0.3 * facing + 0.35 * t * t * (3 - 2 * t),
    ground: Math.min(1, Math.max(0, (p[1] + 6.5) / 4.5)) * Math.min(1, Math.max(0, (out[1] - 0.15) / 0.5)),
  };
}

const widthAt = (d: number) => WIDTH.lit + (WIDTH.away - WIDTH.lit) * Math.min(1, d / 0.5) + (WIDTH.deep - WIDTH.away) * Math.max(0, (d - 0.5) / 0.5);
/** Round a paw (DECISIONS 216): 1.2 pt where lit, 1.45 pt at the sole's middle. */
const soleWidthAt = (d: number) => SOLE.width[0] + (SOLE.width[1] - SOLE.width[0]) * Math.min(1, d / SOLE.depth);
const smoothstep = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

/**
 * How much of the ground's dark each point of a span takes under `ground: "sole"`: within each run of points that face
 * the ground, all of it over the run's middle 60%, easing out to none at the run's ends, so the dark lies only where
 * the paw presses.
 */
function soleWindow(ground: number[], at: number[]): number[] {
  const out = ground.map(() => 0);
  let i = 0;
  while (i < ground.length) {
    if (ground[i]! <= 0.05) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < ground.length && ground[j + 1]! > 0.05) j++;
    const s0 = at[i]!, length = at[j]! - s0, edge = (length * (1 - SOLE.middle)) / 2;
    for (let k = i; k <= j; k++) {
      const s = at[k]! - s0;
      out[k] = edge > 0 ? smoothstep(Math.min(s, length - s) / edge) : 1;
    }
    i = j + 1;
  }
  return out;
}

/**
 * The living weight's terms (DECISIONS 260), summed into how far the line swells across the outer band (0 at 1.2 pt,
 * 1 at 1.8). Above all the edge's own way: thin where it faces the light and swelling as it turns away from it
 * (`shade.away`) and down onto what it presses on or turns under (`shade.down`, from its outward normal's downward part,
 * none at `from` and all at `to`), and under an overhang (`shade.under`, the span's own floor), raised to `curve`, up
 * to `most` of the band. Over it the sheet's strokes: a seeded run of strokes `length` pt long, each full through its
 * middle and thinning where the next takes over, swelling the line by up to a seeded share (`peak`) of `weight` about
 * its place (less `centre` of it), only `lit` of that where the edge is fully lit, so a lit top stays at the band's thin
 * end and the strokes swell most where the edge turns away; a swell through each turn (`turn`, full at a radius of
 * `radius` pt or tighter, read over `reach` pt each way); less a little everywhere (`bias`); and a seeded wobble
 * (`wobble`, its wavelengths in points and weights). Under the middle of a sole the whole swell scales down to `sole`
 * of the band (at most 1.4 pt drawn, so the soft line renders within the sheet's 1.44 pt there).
 */
export const WEIGHT = {
  shade: { away: 0.5, down: 0.75, from: -0.2, to: 0.8, under: 0.25, curve: 1, most: 0.45 },
  stroke: { length: [5, 11] as [number, number], peak: [0.7, 1] as [number, number], weight: 0.9, centre: 0.1, lit: 0.6 },
  turn: { weight: 0.2, radius: 4, reach: 1.2 },
  bias: 0.1,
  wobble: { amount: 0.06, waves: [[3.1, 1]] as [number, number][] },
  sole: 0.33,
};

/** A fixed pseudo-random value in [0, 1) for a seed and a lattice point (an integer hash: the same in every build). */
function lattice(seed: number, k: number): number {
  let h = (Math.imul(seed | 0, 0x2c1b3c6d) ^ Math.imul(k | 0, 0x297a2d39)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth value noise along a line, -1 to 1, of one wavelength, from a fixed seed. */
function noise(seed: number, s: number, wave: number): number {
  const x = s / wave, k = Math.floor(x), t = x - k, u = t * t * (3 - 2 * t);
  return 2 * (lattice(seed, k) * (1 - u) + lattice(seed, k + 1) * u) - 1;
}

/**
 * How far a span's line swells across the band at each point, 0 to 1, under its living weight (DECISIONS 260), from the
 * span's arc lengths, tangents and outward normals, the light and the place's floor at each point.
 */
function swellOf(weight: Weight, at: number[], tan: P[], out: P[], light: P, floor: number[], pressed: number[]): number[] {
  const { shade, stroke, turn, wobble } = WEIGHT;
  // The strokes: from a seeded place before the span's start, each a seeded length and peak, laid on to its end.
  const length = at.at(-1)!;
  const strokes: { from: number; to: number; peak: number }[] = [];
  for (let k = 0, s = -lattice(weight.seed, 999) * stroke.length[1]; s < length; k++) {
    const l = stroke.length[0] + (stroke.length[1] - stroke.length[0]) * lattice(weight.seed, 1000 + k);
    strokes.push({ from: s, to: s + l, peak: stroke.peak[0] + (stroke.peak[1] - stroke.peak[0]) * lattice(weight.seed, 2000 + k) });
    s += l;
  }
  // Each stroke full through its middle, thinning over its last quarter or so into the next.
  const strokeAt = (s: number) => {
    const k = strokes.find((x) => s >= x.from && s < x.to) ?? strokes.at(-1)!;
    const e = Math.sin(Math.PI * Math.min(1, Math.max(0, (s - k.from) / (k.to - k.from))));
    return k.peak * smoothstep((e - 0.25) / 0.55);
  };
  // How tightly the edge turns at each point, read over `turn.reach` either way: the angle it turns by over that length.
  const turning = at.map((s, i) => {
    let j0 = i, j1 = i;
    while (j0 > 0 && s - at[j0]! < turn.reach) j0--;
    while (j1 < at.length - 1 && at[j1]! - s < turn.reach) j1++;
    const span = at[j1]! - at[j0]!;
    if (span <= 0) return 0;
    const a = tan[j0]!, b = tan[j1]!;
    return Math.abs(Math.atan2(a[0] * b[1] - a[1] * b[0], a[0] * b[0] + a[1] * b[1])) / span;
  });
  return at.map((s, i) => {
    const away = (1 - v.dot(out[i]!, light)) / 2;
    const down = smoothstep((out[i]![1] - shade.from) / (shade.to - shade.from));
    const shaded = shade.most * Math.min(1, shade.away * away + shade.down * down + shade.under * floor[i]!) ** shade.curve;
    const tight = smoothstep(turning[i]! * turn.radius);
    const wob = wobble.waves.reduce((sum, [wave, w], k) => sum + w * noise(weight.seed * 7 + k, s, wave), 0);
    // Under the middle of a sole, where the paw presses, the whole swell scales down to `sole` of the band.
    const x = Math.min(1, Math.max(0, shaded + stroke.weight * (strokeAt(s) - stroke.centre) * (stroke.lit + (1 - stroke.lit) * (shaded / shade.most)) + turn.weight * tight - WEIGHT.bias + wobble.amount * wob));
    return x * (1 - (1 - WEIGHT.sole) * pressed[i]!);
  });
}

/**
 * The line's life by class (DECISIONS 284, the lead's L1), each from the sheet's own line as the line check reads it
 * (linematch.py's widthCv and its advisory tone along the line) on master.hero.main, never on a render
 * (qa/phase3/fur/recipes3/sheettone.py, sheettone.json):
 * - `tone`: how far the line's tone runs along it, in ladder units (a unit is a ladder from its lightest to its darkest,
 *   22 L* on the cream and 13.7 on the tan, the lit steps 16.3 and 12.8 more), from the hero's spread of the line's core
 *   L* along it (its lighter tenth less its darker, averaged over 1.5 pt): the legs 24.6 L*, the back 23.6, the tail
 *   29.5, the head's outline 14.8, the ears 10.2, the soles 8.0, each over 0.8 of a unit (a run spans about 0.8 of its
 *   range between its tenths) of 19 L* (the cream's ladder and lit steps between them) or, round the ears, 13;
 * - `breathe`: how far the seeded strokes move a run's width about its place in the band, from the hero's width
 *   variation (widthCv: the legs 0.46, the back 0.29, the tail 0.31, the ears 0.32, the head 0.25, the soles 0.19):
 *   1.75 times it, at most 0.8, so the band's narrow room (a width held to 1.2 to 1.8 pt varies by 0.2 at most, 260)
 *   is shared out in the sheet's own proportions.
 */
export const LIFE = {
  tone: { legs: 1.62, back: 1.55, tail: 1.94, head: 0.97, ears: 0.98, soles: 0.53 } as Record<LifeClass, number>,
  breathe: { legs: 0.8, back: 0.5, tail: 0.54, head: 0.44, ears: 0.56, soles: 0.33 } as Record<LifeClass, number>,
};

/**
 * How a living line is laid along its span (DECISIONS 284). `place`: the edge's own place in the band, 0 (the thin
 * end) where it faces the light, rising as it faces away (`away`), down onto what it presses on or turns under (`down`,
 * its outward normal's downward part from `from` to `to`), under an overhang (`under`, the span's floor) and onto the
 * ground (in full), eased from `lo` to `hi`. `stroke`: the seeded strokes, each `length` pt and a raised sine to a
 * seeded `peak`: a run at place b takes half the class's breathe toward each stroke's peak, so a lit run (b 0) breathes
 * up from the thin end and a pressed run (b 1) dips below the full end between its strokes and swells back. `join`:
 * within `ease` pt of a joined end the swell eases to `swell` and the tone to the place's own, so two spans that join
 * meet at one width and tone (no knot). `free`: the strokes ease out over `ease` pt before a free end's taper, so the
 * taper starts from the run's own width (no bead before it). `short`: a span shorter than `short[0]` pt takes no
 * strokes and their full swing only from `short[1]` (a short span never beads). `pivot`: the swell at which the tone
 * is the place's own: lighter below it by the class's `tone`, darker above it by `darker` of that (the light end has
 * the lit steps' room beyond it, the dark end none past the soles' line, where the place's own depth already lies); and
 * where the edge meets the ground, the soles' tone (the sheet's soles vary least, 8 L* along them).
 */
export const LIVE = {
  place: { away: 0.5, down: 0.75, from: -0.2, to: 0.8, under: 0.5, lo: 0.15, hi: 0.85 },
  stroke: { length: [6, 14] as [number, number], peak: [0.45, 1] as [number, number] },
  join: { ease: 1.5, swell: 0.5 },
  free: { ease: 1.5 },
  short: [3, 9] as [number, number],
  pivot: 0.5,
  darker: 0.5,
};

/**
 * A typed break (DECISIONS 284, the lead's L1 c): its gap's length (pt), how far the line tapers out and back in either
 * side of it (pt, within the line gate's 2), and how full the line may be where it breaks (on a lit run only).
 */
export const BREAK = { gap: [0.4, 2.5] as [number, number], taper: 1.2, lit: 0.35 };

/** The edge's own place in the band at each point of a span (LIVE.place): 0 facing the light, 1 where it presses or turns under. */
function placeOf(out: P[], light: P, floor: number[], ground: number[]): number[] {
  const { away: wa, down: wd, from, to, under: wu, lo, hi } = LIVE.place;
  return out.map((n, i) => {
    const away = (1 - v.dot(n, light)) / 2;
    const down = smoothstep((n[1] - from) / (to - from));
    return Math.max(smoothstep((wa * away + wd * down + wu * floor[i]! - lo) / (hi - lo)), ground[i]!);
  });
}

/** A typed swell profile along a span's points (DECISIONS 284): each typed value at its nearest point, eased between them along the span, held before the first and after the last. */
function typedSwell(swell: Swell[], pts: P[], at: number[]): number[] {
  const placed = swell.map((s) => {
    if (s.to < 0 || s.to > 1) throw new Error(`a typed swell is 0 to 1, not ${s.to}`);
    let best = 0, d = Infinity;
    pts.forEach((p, i) => {
      const e = v.len(v.sub(p, s.at));
      if (e < d) (d = e, best = i);
    });
    if (d > 1) throw new Error(`a typed swell at (${s.at.join(", ")}) lies ${d.toFixed(2)} pt off its span`);
    return { s: at[best]!, to: s.to };
  }).sort((a, b) => a.s - b.s);
  return at.map((s) => {
    if (s <= placed[0]!.s) return placed[0]!.to;
    if (s >= placed.at(-1)!.s) return placed.at(-1)!.to;
    const k = placed.findIndex((x) => x.s >= s), a = placed[k - 1]!, b = placed[k]!;
    return a.to + (b.to - a.to) * smoothstep((s - a.s) / Math.max(1e-9, b.s - a.s));
  });
}

/**
 * A living line's swell along its span before its joined ends are settled, 0 to 1 (DECISIONS 284): its place (the typed
 * profile, else the edge's own), the class's seeded strokes about it, eased out before a free end's taper and on a short
 * span, as LIVE says.
 */
function liveSwell(weight: Weight, place: number[], at: number[], ends: [EndKind, EndKind], taper: [number, number]): number[] {
  const breathe = LIFE.breathe[weight.life!], length = at.at(-1)!;
  const [l0, l1] = LIVE.stroke.length, [p0, p1] = LIVE.stroke.peak;
  const strokes: { from: number; to: number; peak: number }[] = [];
  for (let k = 0, s = -lattice(weight.seed, 999) * l1; s < length; k++) {
    const l = l0 + (l1 - l0) * lattice(weight.seed, 1000 + k);
    strokes.push({ from: s, to: s + l, peak: p0 + (p1 - p0) * lattice(weight.seed, 2000 + k) });
    s += l;
  }
  const strokeAt = (s: number) => {
    const k = strokes.find((x) => s >= x.from && s < x.to) ?? strokes.at(-1)!;
    return k.peak * Math.sin(Math.PI * Math.min(1, Math.max(0, (s - k.from) / (k.to - k.from))));
  };
  const short = smoothstep((length - LIVE.short[0]) / (LIVE.short[1] - LIVE.short[0]));
  return at.map((s, i) => {
    const b = place[i]!;
    // Before a free end's taper the strokes ease out, so the taper starts from the run's own width.
    let strokes = short;
    ends.forEach((e, j) => {
      if (e === "free" || e === "taper") strokes = Math.min(strokes, short * smoothstep(((j === 0 ? s : length - s) - taper[j]!) / LIVE.free.ease));
    });
    return b + 0.5 * breathe * strokes * (strokeAt(s) - b);
  });
}

/** sRGB to CIE L*. */
function lightness(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as [number, number, number];
  const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return Y > 216 / 24389 ? 116 * Math.cbrt(Y) - 16 : (Y * 24389) / 27;
}
/**
 * Where each lit step lies on its ladder's own scale (DECISIONS 285): its ladder carried on past its lightest at the
 * ladder's own L* per unit (the cream's 22.3 L* from end to end, the tan's 13.7), so a tone 0.3 below the lightest is as
 * much lighter as 0.3 above it is darker: the cream's steps at -0.07, -0.28, -0.5 and -0.7, the tan's at -0.47 and -0.93.
 */
const LIT_AT = Object.fromEntries((["cream", "tan"] as const).map((on) => {
  const L = LINES[on].map(lightness), unit = L[0]! - L[10]!;
  return [on, LINES.lit[on].map((hex) => -(lightness(hex) - L[0]!) / unit)];
})) as Record<"cream" | "tan", number[]>;
/** A line's colour at a tone on its ladder (0 its lightest, 1 its darkest), or, below 0, the lit step (DECISIONS 285) nearest it on the ladder's own scale (LIT_AT). */
function toneColour(on: "cream" | "tan", u: number): string {
  if (u >= 0) return LINES[on][Math.max(0, Math.min(10, Math.round(u * 10)))]!;
  const at = [0, ...LIT_AT[on]], k = at.reduce((b, x, i) => (Math.abs(x - u) < Math.abs(at[b]! - u) ? i : b), 0);
  return k === 0 ? LINES[on][0]! : LINES.lit[on][k - 1]!;
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const xy = (p: P) => `${r3(p[0])} ${r3(p[1])}`;
const poly = (pts: P[]) => pts.map((p, i) => `${i ? "L" : "M"}${xy(p)}`).join("") + "Z";
/** A round cap: a disc as a 16-sided polygon, so resvg paints it as a plain fill. */
const disc = (c: P, r: number) => poly(Array.from({ length: 16 }, (_, k): P => [c[0] + r * Math.cos((k * Math.PI) / 8), c[1] + r * Math.sin((k * Math.PI) / 8)]));

/** A drawn line with what the line gate reads of its span (lint.ts). */
export type LitLine = DrawnLine & { span: SpanMeta };

/** A span on its shape as litRibbons lays it out: where it runs (its `under` ends run on), its points, their arc lengths, tangents and outward normals, its floor and ceiling, its depth eased along it, and its ends' tapers. */
interface Edge {
  from: number;
  to: number;
  pts: P[];
  at: number[];
  length: number;
  tan: P[];
  out: P[];
  under: (p: P) => number;
  most: (p: P) => number;
  d: number[];
  t0: number;
  t1: number;
}

/** A span laid out on its shape (see Edge); `pts` alone, too short to draw, when it has under 3 points. */
function edgeOf(shape: Shape, span: LitSpan, light: P, cw: boolean, pathLength: () => number): Edge | { from: number; to: number; pts: P[] } {
  let from = fracAt(shape, span.from), to = fracAt(shape, span.to);
  // An end that runs on under the part over it is drawn on past where it is typed, at full width, then fades out under it.
  if (span.ends?.[0] === "under") from = (from - (UNDER_RUN + FREE_TAPER) / pathLength() + 1) % 1;
  if (span.ends?.[1] === "under") to = (to + (UNDER_RUN + FREE_TAPER) / pathLength()) % 1;
  const pts = spanPoints(shape, from, to);
  if (pts.length < 3) return { from, to, pts };
  const at = [0];
  for (let i = 1; i < pts.length; i++) at.push(at[i - 1]! + v.len(v.sub(pts[i]!, pts[i - 1]!)));
  const length = at[at.length - 1]!;
  const tan = pts.map((_, i) => v.norm(v.sub(pts[Math.min(pts.length - 1, i + 1)]!, pts[Math.max(0, i - 1)]!)));
  const out = tan.map((t): P => (cw ? [t[1], -t[0]] : [-t[1], t[0]]));
  // Depth from the light and the ground, floored by the place, then eased along the line over about 1.5 pt each way.
  const under = (p: P) => (typeof span.under === "function" ? span.under(p) : span.under ?? 0);
  const most = (p: P) => (typeof span.most === "function" ? span.most(p) : span.most ?? 1);
  let raw: number[];
  if (!span.contact && !span.ground) raw = pts.map((p, i) => Math.max(under(p), depth(p, out[i]!, light)));
  else {
    // A contact line takes no light, and is never lighter than the ladder's middle; a paw's line takes the ground's
    // dark only under the middle of its sole.
    const t = pts.map((p, i) => terms(p, out[i]!, span.contact ? undefined : light));
    const g = span.ground === "sole" ? soleWindow(t.map((x) => x.ground), at).map((w, i) => w * t[i]!.ground) : t.map((x) => x.ground);
    const deepest = span.ground === "sole" ? SOLE.depth : 1;
    raw = pts.map((p, i) => {
      const lit = t[i]!.lit;
      const d = Math.min(1, lit + Math.max(0, deepest - lit) * g[i]!);
      return Math.max(under(p), span.contact ? CONTACT_DEPTH : 0, d);
    });
  }
  const d = raw.map((_, i) => {
    let sum = 0, n = 0;
    for (let j = i; j >= 0 && at[i]! - at[j]! <= 1.5; j--) (sum += raw[j]!, n++);
    for (let j = i + 1; j < pts.length && at[j]! - at[i]! <= 1.5; j++) (sum += raw[j]!, n++);
    // The ceiling after the easing, so a line that comes and goes with its fur keeps its rhythm.
    return span.most === undefined ? sum / n : Math.min(most(pts[i]!), sum / n);
  });
  let t0: number, t1: number;
  if (!span.ends) {
    const [a0, a1] = typeof span.taper === "object" ? span.taper : [span.taper ?? Math.min(5, length / 3), span.taper ?? Math.min(5, length / 3)];
    // A short span tapers over no more than three quarters of its length, so it always swells to its full width.
    const fit = Math.min(1, (0.75 * length) / (a0 + a1));
    (t0 = a0 * fit), (t1 = a1 * fit);
  } else {
    // A free end tapers where it ends; an under end fades out past its full-width run, under its part; a join end is at full width to its last point.
    const asked = typeof span.taper === "object" ? span.taper : [span.taper ?? FREE_TAPER, span.taper ?? FREE_TAPER];
    const [a0, a1] = span.ends.map((e, i) => (e === "free" ? asked[i]! : e === "under" ? FREE_TAPER : 0)) as [number, number];
    const fit = a0 + a1 > 0 ? Math.min(1, (0.75 * length) / (a0 + a1)) : 1;
    (t0 = a0 * fit), (t1 = a1 * fit);
  }
  return { from, to, pts, at, length, tan, out, under, most, d, t0, t1 };
}

/** Whether a span draws as a living line (DECISIONS 284): it asks for its life, or is broken by typed breaks. */
const lively = (span: LitSpan) => !!span.weight?.life || !!span.breaks?.length;

/**
 * Where a span's line is drawn at one of its ends (0 its start, 1 its end), as litRibbons draws it alone on its shape:
 * the point on the edge, the way the line runs into that end, the inward normal, the width its full line has there
 * and its colour, for a stroke that carries the line on into the fur (topknot.ts's hooks, DECISIONS 286).
 */
export function lineEnd(shape: Shape, span: LitSpan, end: 0 | 1, o: LitOptions = {}): { at: P; along: P; inward: P; width: number; colour: string } {
  const light = o.light ?? LIGHT, cw = area(spanPoints(shape, 0, 1)) > 0;
  let total: number | undefined;
  const pathLength = () => (total ??= arc([...spanPoints(shape, 0, 1), spanPoints(shape, 0, 1)[0]!]).at(-1)!);
  const e = edgeOf(shape, span, light, cw, pathLength);
  if (!("d" in e)) throw new Error("lineEnd: the span is too short to draw");
  const i = end === 0 ? 0 : e.pts.length - 1;
  const on = (typeof span.on === "function" ? span.on(e.pts[i]!) : span.on) ?? "cream";
  const along = end === 0 ? v.mul(e.tan[i]!, -1) : e.tan[i]!, inward = v.mul(e.out[i]!, -1);
  if (!lively(span)) return { at: e.pts[i]!, along, inward, width: widthAt(e.d[i]!), colour: LINES[on][Math.max(0, Math.min(10, Math.round(e.d[i]! * 10)))]! };
  const x = layLife({ shape, span, where: "", key: "", light, o, edge: e, total: pathLength() });
  settleJoins([x]);
  return { at: e.pts[i]!, along, inward, width: LIMITS.outer[0] + (LIMITS.outer[1] - LIMITS.outer[0]) * (span.weight!.amount ?? 1) * x.swell[i]!, colour: toneColour(on, x.tone[i]!) };
}

/**
 * The lit line's ribbons along each span of a closed shape: drawn twice their width centred on the edge for a part's
 * clip, so the silhouette stays the path, or `reach` past it unclipped. Each run of one tone is its own polygon,
 * overlapping its neighbours by a sample, filled from the ladder.
 */
export function litRibbons(shape: Shape, spans: LitSpan[], where: string, o: LitOptions = {}): { svg: string; lines: LitLine[]; outlined: [number, number][] } {
  const light = o.light ?? LIGHT;
  const cw = area(spanPoints(shape, 0, 1)) > 0;
  const lines: LitLine[] = [];
  const outlined: [number, number][] = [];
  const key = shapeKey(shape.segs);
  let total: number | undefined;
  const pathLength = () => (total ??= arc([...spanPoints(shape, 0, 1), spanPoints(shape, 0, 1)[0]!]).at(-1)!);
  // The living lines (DECISIONS 284) are laid out first, so two that join here meet at one width and tone.
  const living = new Map<number, Living>();
  spans.forEach((span, k) => {
    if (span.weight?.swell?.length && !span.weight.life) throw new Error("a typed swell is a living line's: give its weight its life (DECISIONS 284)");
    if (!lively(span)) return;
    const e = edgeOf(shape, span, light, cw, pathLength);
    if ("d" in e) living.set(k, layLife({ shape, span, where, key, light, o, edge: e, total: pathLength() }));
  });
  settleJoins([...living.values()]);
  let svg = "";
  spans.forEach((span, k) => {
    const e = edgeOf(shape, span, light, cw, pathLength);
    outlined.push([e.from, e.to]);
    if (!("d" in e)) return;
    const live = living.get(k);
    if (live) {
      // Drawn in pieces between its breaks, each reported to the line gate as its own span (outlined where it runs), so
      // a break is a bare stretch the gate sees.
      outlined.pop();
      const r = livelyRibbons(live);
      svg += r.svg;
      lines.push(...r.lines);
      outlined.push(...r.outlined);
      return;
    }
    const { from, to, pts, at, length, tan, out, under, d, t0, t1 } = e;
    const phase = [(k * 2.39) % 6.28, (k * 4.11) % 6.28];
    const wobble = span.ground === "sole" ? SOLE.wobble : 0.06;
    const widthOf = span.ground === "sole" ? soleWidthAt : widthAt;
    // A living weight sets the width from its own profile (DECISIONS 260); without one, the width follows the depth.
    // Where the line lies along the ground it stays as fine as the sheet's there: under a sole's middle (`ground: "sole"`), or wherever the edge faces the ground.
    const along = span.weight ? pts.map((p, i) => terms(p, out[i]!, light).ground) : [];
    const pressed = span.ground === "sole" ? soleWindow(along, at) : along;
    const swell = span.weight ? swellOf(span.weight, at, tan, out, light, pts.map((p) => under(p)), pressed) : undefined;
    const band = LIMITS.outer[1] - LIMITS.outer[0];
    const w = d.map((di, i) => {
      const s = at[i]!;
      const e = Math.min(1, t0 > 0 ? s / t0 : 1, t1 > 0 ? (length - s) / t1 : 1);
      const full = swell
        ? LIMITS.outer[0] + band * (span.weight!.amount ?? 1) * swell[i]!
        : Math.min(LIMITS.outer[1], Math.max(LIMITS.outer[0], widthOf(di) * (1 + wobble * (0.6 * Math.sin(s / 9 + phase[0]!) + 0.4 * Math.sin(s / 3.7 + phase[1]!)))));
      return { full, e, shown: 0.15 + (full - 0.15) * e * e * (3 - 2 * e) };
    });
    // Clipped, the ribbon is twice the line and half of it shows; unclipped, it is the line, moved out to reach past the path.
    const twice = o.reach === undefined ? 2 : 1;
    const centre = pts.map((p, i) => (o.reach === undefined ? p : v.add(p, v.mul(out[i]!, o.reach - w[i]!.shown / 2))));
    // A crisp line runs on past its outer edge by twice its blur, so the blur's falloff lies past the mask that cuts it
    // there (crispened) and the line is full to its edge.
    const bleed = o.crisp && o.reach !== undefined ? 2 * (o.blur ?? SOFT) : 0;
    const left = centre.map((c, i) => v.add(c, v.mul(out[i]!, (w[i]!.shown * twice) / 2 + bleed)));
    const right = centre.map((c, i) => v.sub(c, v.mul(out[i]!, (w[i]!.shown * twice) / 2)));
    // Each point's colour: its depth's tone on its ladder (a span may cross from the tan onto the cream).
    const ladder = (p: P) => LINES[(typeof span.on === "function" ? span.on(p) : span.on) ?? "cream"];
    const colour = d.map((di, i) => ladder(pts[i]!)[Math.max(0, Math.min(10, Math.round(di * 10)))]!);
    let a = 0;
    while (a < pts.length) {
      let b = a;
      while (b + 1 < pts.length && colour[b + 1] === colour[a]) b++;
      const i0 = Math.max(0, a - 1), i1 = Math.min(pts.length - 1, b + 1);
      svg += `<path fill="${colour[a]}" d="${poly([...left.slice(i0, i1 + 1), ...right.slice(i0, i1 + 1).reverse()])}"/>`;
      a = b + 1;
    }
    // A joined end ends round, so it meets the other line at any angle with no notch: clipped, a disc as deep as the line shows; unclipped, as wide as the line.
    span.ends?.forEach((e, i) => {
      if (e !== "join") return;
      const j = i === 0 ? 0 : pts.length - 1;
      svg += `<path fill="${colour[j]}" d="${disc(centre[j]!, (w[j]!.shown * twice) / 2)}"/>`;
    });
    const full = w.filter((x) => x.e >= 1).map((x) => x.full);
    const shown = full.length ? full : [Math.max(...w.map((x) => x.shown))];
    const drawn: [number, number] = [Math.min(...shown), Math.max(...shown)];
    const ends: [EndKind, EndKind] = span.ends ? [span.ends[0], span.ends[1]] : ["taper", "taper"];
    lines.push({ kind: "outer", width: r3((drawn[0] + drawn[1]) / 2), where, drawn,
      span: { shape: key, from, to, length: r3(length), ends, taper: [r3(t0), r3(t1)], ...(span.contact ? { contact: true } : {}), ...(span.cites ? { cites: span.cites } : {}), ...(span.cites && span.bare ? { bare: span.bare } : {}) } });
  });
  return { svg, lines, outlined };
}

/** A living span as litRibbons lays it out (DECISIONS 284): its edge, its place, its swell and its tone (settled at its joined ends by settleJoins). */
interface Living {
  shape: Shape;
  span: LitSpan;
  where: string;
  key: string;
  light: P;
  o: LitOptions;
  edge: Edge;
  /** The shape's length, in points. */
  total: number;
  ends: [EndKind, EndKind];
  /** How much each point faces the ground (under a sole's middle only, with `ground: "sole"`). */
  ground: number[];
  /** Its swell (0 the band's thin end, 1 its full end) and its tone (0 the ladder's lightest, 1 its darkest, below 0 the lit steps), as laid and then settled. */
  swell: number[];
  tone: number[];
}

/** A living span's tone from its swell at one point (DECISIONS 284): its depth's, lighter as its swell falls below the pivot by the class's `tone` (the soles' where it meets the ground), darker above it by LIVE.darker of that; its floor and ceiling held, a contact line never lighter than the ladder's middle. */
function toneAt(x: Living, i: number, swell: number): number {
  const { span, edge } = x, life = span.weight!.life!;
  const R = LIFE.tone[life] + (LIFE.tone.soles - LIFE.tone[life]) * x.ground[i]!, by = swell - LIVE.pivot;
  return held(x, i, edge.d[i]! + R * (by < 0 ? by : LIVE.darker * by));
}

/** A tone held to its span's floor (contact, `under`) and ceiling (`most`), and to the ladder and its lit steps. */
function held(x: Living, i: number, u: number): number {
  const { span, edge } = x, p = edge.pts[i]!;
  if (span.contact) u = Math.max(u, CONTACT_DEPTH);
  // A floor of 0 (no overhang there) is no floor: the line may lighten past its ladder's lightest into the lit steps.
  const floor = edge.under(p);
  if (floor > 0) u = Math.max(u, floor);
  if (span.most !== undefined) u = Math.min(u, edge.most(p));
  return Math.max(-1, Math.min(1, u));
}

/** A living span laid out (DECISIONS 284): its place in the band (its typed profile, else its edge's own), its swell (liveSwell) and its tone from it. */
function layLife(x: Omit<Living, "ends" | "ground" | "swell" | "tone">): Living {
  const { span, edge, light } = x;
  if (!span.weight?.life) throw new Error("a span's breaks are its living line's: give it a weight with its life (DECISIONS 284)");
  const ends: [EndKind, EndKind] = span.ends ? [span.ends[0], span.ends[1]] : ["taper", "taper"];
  const raw = edge.pts.map((p, i) => terms(p, edge.out[i]!, light).ground);
  const ground = span.ground === "sole" ? soleWindow(raw, edge.at).map((w, i) => w * raw[i]!) : raw;
  const place = span.weight.swell?.length ? typedSwell(span.weight.swell, edge.pts, edge.at) : placeOf(edge.out, light, edge.pts.map((p) => edge.under(p)), ground);
  const swell = liveSwell(span.weight, place, edge.at, ends, [edge.t0, edge.t1]);
  const living: Living = { ...x, ends, ground, swell, tone: [] };
  living.tone = swell.map((s, i) => toneAt(living, i, s));
  return living;
}

/**
 * Each joined end of the living spans laid out together eased to one width and one tone (DECISIONS 284, the lead's L1 e):
 * two that join each other here (their ends within the line gate's 0.5 pt) to the mean of their two, so they meet as one
 * line with no knot; a joined end whose line lies on another shape, to the band's middle (LIVE.join.swell) and its
 * depth's own tone, as that line does too, so the two meet at one width (their tones each their depth's, as without
 * their life: a floor on the tone there, tried, darkened two light lines meeting at the 3/4's chest lobe into a bead).
 * Each within LIVE.join.ease pt of its end; then each span's ceiling (its `most`) holds its swell and its tone.
 */
function settleJoins(all: Living[]) {
  const endOf = (x: Living, j: number) => (j === 0 ? 0 : x.edge.pts.length - 1);
  const target = new Map<string, { swell: number; tone: number }>();
  all.forEach((x, a) => x.ends.forEach((e, j) => {
    if (e !== "join") return;
    const i = endOf(x, j), p = x.edge.pts[i]!;
    let pair: { swell: number; tone: number } | undefined;
    all.forEach((y, b) => y.ends.forEach((f, k) => {
      if (f !== "join" || (a === b && j === k) || pair) return;
      const q = y.edge.pts[endOf(y, k)]!;
      if (v.len(v.sub(p, q)) <= GATE.joinPt) pair = { swell: (x.swell[i]! + y.swell[endOf(y, k)]!) / 2, tone: (x.tone[i]! + y.tone[endOf(y, k)]!) / 2 };
    }));
    target.set(`${a}:${j}`, pair ?? { swell: LIVE.join.swell, tone: held(x, i, x.edge.d[i]!) });
  }));
  all.forEach((x, a) => {
    const length = x.edge.length;
    const swell = [...x.swell], tone = [...x.tone];
    x.ends.forEach((e, j) => {
      const t = target.get(`${a}:${j}`);
      if (!t) return;
      x.edge.at.forEach((s, i) => {
        const w = smoothstep((j === 0 ? s : length - s) / LIVE.join.ease);
        swell[i] = t.swell + (swell[i]! - t.swell) * w;
        tone[i] = t.tone + (tone[i]! - t.tone) * w;
      });
    });
    const ceiling = (i: number) => (x.span.most === undefined ? 1 : x.edge.most(x.edge.pts[i]!));
    x.swell = swell.map((s, i) => Math.max(0, Math.min(ceiling(i), s)));
    x.tone = tone.map((u, i) => held(x, i, u));
  });
}


/**
 * A living line drawn (DECISIONS 284, the lead's L1): its width from its swell across the whole band (by its weight's
 * `amount`), its tone its own (lighter on the lit runs, into the lit steps; darker where pressed); and drawn in pieces
 * between its typed breaks, each piece tapering BREAK.taper into its gap and reported as its own span.
 */
function livelyRibbons(x: Living): { svg: string; lines: LitLine[]; outlined: [number, number][] } {
  const { shape, span, o, edge, ends } = x;
  const { pts, at, out } = edge;
  const length = edge.length;
  // The breaks: each typed on a lit run, away from the span's ends' tapers, never two overlapping.
  const cuts = (span.breaks ?? []).map((b) => {
    let i = 0, e = Infinity;
    pts.forEach((p, j) => {
      const q = v.len(v.sub(p, b.at));
      if (q < e) (e = q, i = j);
    });
    const where = `a break at (${b.at.join(", ")})`;
    if (e > 1) throw new Error(`${where} lies ${e.toFixed(2)} pt off its span`);
    if (b.gap < BREAK.gap[0] - 1e-9 || b.gap > BREAK.gap[1] + 1e-9) throw new Error(`${where} is ${b.gap} pt long, not ${BREAK.gap[0]} to ${BREAK.gap[1]}`);
    if (x.swell[i]! > BREAK.lit + 1e-9) throw new Error(`${where} lies where the line is ${x.swell[i]!.toFixed(2)} of the band full, not on a lit run (at most ${BREAK.lit})`);
    const g: [number, number] = [at[i]! - b.gap / 2, at[i]! + b.gap / 2];
    if (g[0] - BREAK.taper < edge.t0 + 0.5 || g[1] + BREAK.taper > length - edge.t1 - 0.5) throw new Error(`${where} lies within its taper of its span's end`);
    return g;
  }).sort((a, b) => a[0] - b[0]);
  if (cuts.length && !span.cites) throw new Error("a span's breaks must cite the DECISIONS entry that explains them (cites)");
  cuts.forEach((c, i) => {
    if (i > 0 && c[0] - cuts[i - 1]![1] < 2 * BREAK.taper + 0.5) throw new Error(`two breaks lie ${(c[0] - cuts[i - 1]![1]).toFixed(2)} pt apart, under ${2 * BREAK.taper + 0.5}`);
  });
  const pieces: [number, number][] = [];
  let s0 = 0;
  for (const c of cuts) (pieces.push([s0, c[0]]), (s0 = c[1]));
  pieces.push([s0, length]);
  const band = LIMITS.outer[1] - LIMITS.outer[0];
  const amount = span.weight!.amount ?? 1;
  const twice = o.reach === undefined ? 2 : 1;
  const bleed = o.crisp && o.reach !== undefined ? 2 * (o.blur ?? SOFT) : 0;
  const on = (p: P) => (typeof span.on === "function" ? span.on(p) : span.on) ?? "cream";
  const f0 = fracAt(shape, pts[0]!);
  const frac = (i: number) => (f0 + at[i]! / x.total) % 1;
  let svg = "";
  const lines: LitLine[] = [], outlined: [number, number][] = [];
  pieces.forEach(([a0, a1], k) => {
    const first = k === 0, last = k === pieces.length - 1;
    const idx = at.map((_, i) => i).filter((i) => at[i]! >= a0 - 1e-9 && at[i]! <= a1 + 1e-9);
    if (idx.length < 2) return;
    const tp: [number, number] = [first ? edge.t0 : BREAK.taper, last ? edge.t1 : BREAK.taper];
    const w = idx.map((i) => {
      const s = at[i]!, e = Math.min(1, tp[0] > 0 ? (s - a0) / tp[0] : 1, tp[1] > 0 ? (a1 - s) / tp[1] : 1);
      const full = LIMITS.outer[0] + band * amount * x.swell[i]!;
      return { full, e, shown: 0.15 + (full - 0.15) * smoothstep(e) };
    });
    const centre = idx.map((i, j) => (o.reach === undefined ? pts[i]! : v.add(pts[i]!, v.mul(out[i]!, o.reach - w[j]!.shown / 2))));
    const left = centre.map((c, j) => v.add(c, v.mul(out[idx[j]!]!, (w[j]!.shown * twice) / 2 + bleed)));
    const right = centre.map((c, j) => v.sub(c, v.mul(out[idx[j]!]!, (w[j]!.shown * twice) / 2)));
    const colour = idx.map((i) => toneColour(on(pts[i]!), x.tone[i]!));
    let a = 0;
    while (a < idx.length) {
      let b = a;
      while (b + 1 < idx.length && colour[b + 1] === colour[a]) b++;
      const i0 = Math.max(0, a - 1), i1 = Math.min(idx.length - 1, b + 1);
      svg += `<path fill="${colour[a]}" d="${poly([...left.slice(i0, i1 + 1), ...right.slice(i0, i1 + 1).reverse()])}"/>`;
      a = b + 1;
    }
    // A joined end of the span ends round, as a line without its life does.
    if (first && ends[0] === "join") svg += `<path fill="${colour[0]}" d="${disc(centre[0]!, (w[0]!.shown * twice) / 2)}"/>`;
    if (last && ends[1] === "join") svg += `<path fill="${colour.at(-1)}" d="${disc(centre.at(-1)!, (w.at(-1)!.shown * twice) / 2)}"/>`;
    const full = w.filter((q) => q.e >= 1).map((q) => q.full);
    const shown = full.length ? full : [Math.max(...w.map((q) => q.shown))];
    const drawn: [number, number] = [Math.min(...shown), Math.max(...shown)];
    const from = first ? edge.from : frac(idx[0]!), to = last ? edge.to : frac(idx.at(-1)!);
    // The bare stretch a break leaves is its gap and the tapers either side of it, where the line is below full width.
    const bare: [number, number] = [first ? span.bare?.[0] ?? 0 : 0, last ? span.bare?.[1] ?? 0 : r3(cuts[k]![1] - cuts[k]![0] + 2 * BREAK.taper)];
    outlined.push([from, to]);
    lines.push({ kind: "outer", width: r3((drawn[0] + drawn[1]) / 2), where: x.where, drawn,
      span: { shape: x.key, from, to, length: r3(a1 - a0), ends: [first ? ends[0] : "free", last ? ends[1] : "free"], taper: [r3(tp[0]), r3(tp[1])],
        ...(span.contact ? { contact: true } : {}), ...(span.cites ? { cites: span.cites } : {}), ...(span.cites && (bare[0] || bare[1]) ? { bare } : {}) } });
  });
  return { svg, lines, outlined };
}

/** The ribbons in a group with their soft edge, its filter's region over `box`. */
function softened(r: { svg: string }, box: Box, sd: number): { defs: string; body: string } {
  // No blur asked (a crisp line, DECISIONS 262): the ribbons as they are, inside the part's clip.
  if (sd <= 0) return { defs: "", body: `<g>${r.svg}</g>` };
  const f = uid("blur");
  return { defs: blur(f, pad(box, 2), sd), body: `<g filter="url(#${f})">${r.svg}</g>` };
}

/**
 * The ribbons' soft edge kept inside the shape grown by `reach` (DECISIONS 212): a mask of the path filled and stroked
 * round 2·reach wide (the path grown by a disc, with no loops at its notches), so whatever the blur spreads past the
 * line's outer edge is cut there and the silhouette's edge is crisp; the stencil's edge under it stays covered, since
 * the line's own outer edge lies on the mask's.
 */
function crispened(shape: Shape, s: { defs: string; body: string }, box: Box, reachPt: number): { defs: string; body: string } {
  const id = uid("crisp"), d = shapePath(shape);
  return {
    defs: s.defs + mask(id, pad(box, 2), `<path d="${d}" fill="#FFFFFF" stroke="#FFFFFF" stroke-width="${r3(2 * reachPt)}" stroke-linejoin="round"/>`),
    body: `<g mask="url(#${id})">${s.body}</g>`,
  };
}

/** A feathered join's mask, as paint.ts draws a part's: transparent at `from`, opaque at `to`. */
function feather(f: { from: P; to: P }, area: Box): { defs: string; id: string } {
  const id = uid("feather"), g = uid("fade");
  return {
    id,
    defs: mask(id, area, `<linearGradient id="${g}" gradientUnits="userSpaceOnUse" x1="${r3(f.from[0])}" y1="${r3(f.from[1])}" x2="${r3(f.to[0])}" y2="${r3(f.to[1])}">` +
      `<stop offset="0" stop-color="#000000"/><stop offset="1" stop-color="#FFFFFF"/></linearGradient><rect ${region(area)} fill="url(#${g})"/>`),
  };
}

/** How faint a feathered part may lie and its line still count as drawn at full width (the line gate, lint.ts). */
const FADED = 0.9;

/**
 * Where a part's feather fades its own lines (paint.ts's feather: transparent at `from`, opaque at `to`): the runs of
 * the shape's outline, as shares (as the line gate measures them), where the mask is below FADED, so the gate holds
 * them as below full width, as they are drawn.
 */
function fadedRuns(shape: Shape, f: { from: P; to: P }): [number, number][] {
  const pts = sample(shape.segs, 48), at = arc([...pts, pts[0]!]), total = at.at(-1)!;
  const along = v.sub(f.to, f.from), l2 = v.dot(along, along);
  const faded = pts.map((p) => Math.min(1, Math.max(0, v.dot(v.sub(p, f.from), along) / l2)) < FADED);
  const runs: [number, number][] = [];
  for (let i = 0; i < pts.length; i++) {
    if (!faded[i] || (i > 0 && faded[i - 1])) continue;
    let j = i;
    while (j + 1 < pts.length && faded[j + 1]) j++;
    runs.push([at[i]! / total, (j + 1 < pts.length ? at[j + 1]! : total) / total]);
  }
  // A run through the path's start is one run.
  if (runs.length > 1 && faded[0] && faded[pts.length - 1]) runs[0] = [runs.pop()![0], runs[0]![1]];
  return runs;
}

/** The lines drawn inside a shape's clip (and its feather), as defs and a body. */
function clippedLines(name: string, shape: Shape, spans: LitSpan[], box: Box, paint: Paint, o: LitOptions) {
  const r = litRibbons(shape, spans, name, { ...o, light: o.light ?? paint.light });
  // Under a feather the lines fade with the part: their spans say where, for the line gate.
  if (paint.feather) {
    const faded = fadedRuns(shape, paint.feather);
    if (faded.length) for (const l of r.lines) l.span.faded = faded;
  }
  const clip = uid("clip");
  const s = softened(r, box, o.blur ?? SOFT);
  let defs = `<clipPath id="${clip}"><path d="${shapePath(shape)}"/></clipPath>${s.defs}`;
  let body = `<g clip-path="url(#${clip})">${s.body}</g>`;
  if (paint.feather) {
    const m = feather(paint.feather, pad(box, 2));
    defs += m.defs;
    body = `<g mask="url(#${m.id})">${body}</g>`;
  }
  return { defs, body, r };
}

const shapePath = (shape: Shape) => {
  const s = shape.segs;
  let d = `M${xy(s[0]![0])}`;
  for (const g of s) d += `C${xy(g[1])} ${xy(g[2])} ${xy(g[3])}`;
  return d + "Z";
};

/** A shape whose spans of its own path are declared toe lobes (parts/paw.ts): the lint lets them turn tighter than 4 pt, as the stubby-paws panel draws them (Q29). */
export type Lobed = Shape & { lobes?: [P, P][] };

/** A part painted by paint.ts (its fill, shade and highlight) with the lit line along `spans` instead of a typed outline. */
export function litPart(name: string, shape: Shape, paint: Paint, spans: LitSpan[], o: LitOptions = {}): Piece {
  const base = part(name, shape, { ...paint, outline: undefined });
  const l = clippedLines(name, shape, spans, base.box, paint, o);
  const [meta] = base.meta.shapes;
  const lobes = (shape as Lobed).lobes;
  return piece(`${base.svg}<defs>${l.defs}</defs>${l.body}`, base.box, {
    shapes: [{ ...meta!, outlined: l.r.outlined, ...(lobes ? { lobes: lobes.map(([a, b]) => [fracAt(shape, a), fracAt(shape, b)]) } : {}) }],
    // The dome toe lines drawn in its paint carry their inner-line metas (paw.ts, DECISIONS 286).
    lines: [...base.meta.lines, ...l.r.lines, ...innerLinesIn(paint.under)],
  });
}

/**
 * A marking clipped to its part (paint.ts's marking), carrying its part's lit line over itself inside its own soft
 * edge, as a marking carries its part's typed outline.
 */
export function litMarking(name: string, on: { shape: Shape; paint: Paint; spans: LitSpan[] }, patch: Shape, opts: { fill: string; blur: number; fade?: Fade }, o: LitOptions = {}): Piece {
  const base = marking(name, { shape: on.shape, paint: { ...on.paint, outline: undefined } }, patch, { ...opts, clip: true });
  const l = clippedLines(name, on.shape, on.spans, base.box, { ...on.paint, feather: undefined }, o);
  // The marking draws through its patch's mask: `<defs>…</defs><g mask="…">…</g>`; the line goes in as its last layer.
  if (!base.svg.endsWith("</g>")) throw new Error("litMarking: a marking's drawing no longer ends in its masked group");
  return piece(`<defs>${l.defs}</defs>${base.svg.slice(0, -4)}${l.body}</g>`, base.box, {
    shapes: base.meta.shapes,
    lines: [...base.meta.lines, ...l.r.lines.map((line) => ({ ...line, where: `${name} over ${line.where}` }))],
  });
}

/** Spans that share their settings: each span's own settings win. */
export const withDefaults = (defaults: Omit<LitSpan, "from" | "to">, spans: LitSpan[]): LitSpan[] => spans.map((s) => ({ ...defaults, ...s }));

/** head.line's lit spans: unclipped, reaching `reach` past the path, as one group with its soft edge (kept inside the grown path when `crisp`). */
export function litEdge(shape: Shape, spans: LitSpan[], where: string, box: Box, o: LitOptions & { reach: number }) {
  const r = litRibbons(shape, spans, where, o);
  let s = softened(r, box, o.blur ?? SOFT);
  if (o.crisp) s = crispened(shape, s, box, o.reach);
  return { defs: s.defs, body: s.body, lines: r.lines, outlined: r.outlined };
}
