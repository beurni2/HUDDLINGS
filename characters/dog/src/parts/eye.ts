// The dog's open eye, one recipe for every view (DECISIONS 73, 78), as the turnaround, the hero and the glossy-eyes
// panel paint it: a near-black rim all round, darker than the iris it rings (the sheets' L* 2 to 4 round an iris of
// L* 5 to 8), heaviest over the top, where a lash line lies on it, and thinning to a warm brown along the foot; inside
// it the iris, near-black over its upper part (the pupil and the upper iris, #200C02), lightening down its lower part
// through the held lower-iris brown (#3A2314) to the sheets' russet glow, lightest right along its foot, where it
// follows the eye's lower contour as a crescent (the turnaround's L* rises from about 10 halfway down to 25 to 30 at
// the foot); between the rim and the iris on the outer, lower side a warm-white crescent, the eye's white, as wide
// and as long as each crop draws it, crisp on the rim's side and a little soft on the iris's, greying toward its
// upper end; no rays, rings or spokes; one large catchlight high on the nose's side, white with a soft halo where it
// meets the iris, and one tiny one just below it, as the kitty's and the bear's Default (Large & Glossy) eyes draw
// them (docs/QUESTIONS.md Q26, DECISIONS 201). Where the iris looks aside, both ride it at about half its travel (Q28,
// `riding`), and under a lid they go under the lid.
import { ellipse, pathD, v, type P } from "../../../draw/geom.ts";
import { strokeOf, type DrawnLine } from "../../../draw/line.ts";
import { LIMITS } from "../../../draw/lint.ts";
import { blur, piece, uid, union, type Box, type Piece } from "../../../draw/svg.ts";
import { C } from "../palette.ts";

export interface EyeSpec {
  /** The ball's centre in model space, its half-axes (rim included) across and along the eye, and its turn (degrees, clockwise). */
  centre: P;
  rx: number;
  ry: number;
  turn: number;
  /** +1 when the nose lies to the eye's right on screen, −1 when to its left. */
  noseward: 1 | -1;
  /** The dark rim's width over the top, down the sides and along the foot. */
  rim: { top: number; side: number; foot: number };
  /**
   * The lash line on the rim: from and to (degrees round from the outer side, up positive, so 90 is the top), its
   * width, and how far it swells out past the ball over the outer top corner (`flick`, in points).
   */
  lid: { from: number; to: number; width: number; flick: number };
  /**
   * The white: widest (`width`, in points) at `at` degrees round from the outer side, fading to nothing a little past
   * `span` degrees either side (the opening being smaller than the iris, about 10° past for the views' eyes); `fade`,
   * how far it greys toward its upper end under the lid (0 none, 1 down to the iris's dark; 0.55 by default).
   */
  white: { at: number; width: number; span: number; fade?: number };
  /** The large catchlight: `at` toward the nose and up from the ball's centre, and its radius, in points. */
  shine: { at: [number, number]; r: number };
  /** The tiny catchlight (Q26), as `shine`; left out, it sits where `tinyOf` puts it from the large one. */
  tiny?: { at: [number, number]; r: number };
  /** How far up from the iris's foot the lower iris lightens: the held brown's band and the russet glow, in points (6 and 2.6 by default). */
  glow?: { band: number; warm: number };
  /**
   * The sleepy half-lid, as the expression sheet's Sleepy half-lid draws it: the upper lid closed down over the eye to a
   * level line `level` pt below the ball's centre (up negative), turned with the face by `tilt` degrees, its fur the
   * hood's pale tan deepening toward its edge, a lash line `lash` pt thick along that edge that runs `overhang` pt
   * past the ball either side, and the large catchlight just under it, its top tucked under the lash (`shine`, as
   * `shine` above), with its tiny one below it (Q26, Q28); `bow`, how far the edge bows down in its middle below its
   * ends (1.6 pt by default).
   */
  cover?: { level: number; tilt: number; lash: number; overhang: number; shine: { at: [number, number]; r: number }; bow?: number };
  /**
   * The sparkle (Q2, DECISIONS 203), as the kitty's and the bear's Sparkle (Star Highlight) draw it: a soft white
   * four-pointed star in the lower iris, the eye's largest light (`star`: `at` toward the nose and up from the ball's
   * centre, its half-height `r`), and small gold stars beside the eye (`stars`: each `at` toward the nose and up from
   * the ball's centre in the face's level frame, turned `level` degrees as the face is, its half-height `r`, and its
   * `points`, five on the larger and four on the smaller, as both sheets draw them).
   */
  sparkle?: { star: { at: [number, number]; r: number }; stars: { at: [number, number]; r: number; points: 4 | 5 }[]; level: number; light: P };
}

/**
 * The tiny catchlight from the large one (Q26, DECISIONS 201): a quarter its radius, 1.45 radii below its middle and
 * 0.3 radii toward the nose, as the sister sheets draw it, which the founder's choice follows. The kitty's Default
 * eyes put it 1.4 to 1.5 radii below and lean it toward the nose in both eyes; the bear's sit just under the large
 * one's edge (about one radius), a sheet pixel or two either way. (The decision's first wording said the outer side;
 * the sheets say the nose, and the sheets were what was chosen.)
 */
export const TINY = { scale: 0.25, below: 1.45, nose: 0.3 };
export const tinyOf = (shine: { at: [number, number]; r: number }) => ({
  at: [shine.at[0] + TINY.nose * shine.r, shine.at[1] - TINY.below * shine.r] as [number, number],
  r: shine.r * TINY.scale,
});

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const fmt = (n: number) => r3(n).toString();

/** The eye's own frame: u toward the nose, w down, turned with the eye; a point in model space. */
function frame(e: EyeSpec) {
  const a = (e.turn * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
  return (u: number, w: number): P => [e.centre[0] + e.noseward * u * cos - w * sin, e.centre[1] + e.noseward * u * sin + w * cos];
}

/** The eye's geometry: the ball, the opening inside the rim, and the iris whose edge leaves the white beside it. */
export function eyeGeometry(e: EyeSpec) {
  const S = frame(e);
  const { rim } = e;
  // The opening: the ball less its rim, which is heavier over the top than along the foot.
  const open = { u: 0, w: (rim.top - rim.foot) / 2, a: e.rx - rim.side, b: e.ry - (rim.top + rim.foot) / 2 };
  // The iris: the opening grown by `grow` and moved `shift` away from the white's widest point, so the white is a
  // crescent `width` wide there that runs out to nothing a little past `span` degrees either side, crisp along the iris's edge.
  const span = (e.white.span * Math.PI) / 180, at = (e.white.at * Math.PI) / 180;
  const shift = e.white.width / (1 - Math.cos(span)), grow = shift * Math.cos(span);
  const iris = { u: open.u + shift * Math.cos(at), w: open.w + shift * Math.sin(at), a: open.a + grow, b: open.b + grow };
  const oval = (o: { u: number; w: number; a: number; b: number }) => pathD(ellipse(S(o.u, o.w), o.a, o.b, e.turn));
  return { S, open, iris, ball: oval({ u: 0, w: 0, a: e.rx, b: e.ry }), opening: oval(open), irisD: oval(iris), oval };
}

/** A point in an eye's own frame, `at` toward the nose and up from the ball's centre, in model space. */
const spotOf = (e: EyeSpec, [u, up]: [number, number]): P => {
  const a = (e.turn * Math.PI) / 180;
  return [e.centre[0] + e.noseward * u * Math.cos(a) + up * Math.sin(a), e.centre[1] + e.noseward * u * Math.sin(a) - up * Math.cos(a)];
};

/**
 * The large catchlight and its tiny one (Q26): the large one white with its soft halo where it meets the iris, the tiny
 * one a crisp white dot, less blurred, so it stays a dot at phone size.
 */
export function lights(e: EyeSpec, shine: { at: [number, number]; r: number }, tiny: { at: [number, number]; r: number }, box: Box): string {
  const halo = uid("blur"), big = uid("blur"), small = uid("blur");
  const ell = (c: P, a: number, b: number) => pathD(ellipse(c, a, b, e.turn));
  const [c0, c1] = [spotOf(e, shine.at), spotOf(e, tiny.at)];
  return `<defs>${blur(halo, box, 0.5)}${blur(big, box, 0.22)}${blur(small, box, 0.12)}</defs>` +
    `<path d="${ell(c0, shine.r * 1.3, shine.r * 1.25)}" fill="${C.eyeWhite}" opacity="0.35" filter="url(#${halo})"/>` +
    `<path d="${ell(c0, shine.r, shine.r * 0.94)}" fill="${C.light}" filter="url(#${big})"/>` +
    `<path d="${ell(c1, tiny.r, tiny.r)}" fill="${C.light}" filter="url(#${small})"/>`;
}

/** An eye; with `lights` false, without its catchlights, for a lid that draws its own under it (parts/turned.ts halfLid). */
export function eye(e: EyeSpec, { lights: withLights = true } = {}): Piece {
  const g = eyeGeometry(e);
  const { S, open, iris } = g;
  /** A point on the ball's edge `deg` degrees round from the outer side (up positive), grown by `grow`. */
  const onBall = (deg: number, grow = 0): P => {
    const a = (deg * Math.PI) / 180;
    return S(-(e.rx + grow) * Math.cos(a), -(e.ry + grow) * Math.sin(a));
  };
  /** A point on the opening's edge `deg` degrees round from the outer side. */
  const onOpen = (deg: number): P => {
    const a = (deg * Math.PI) / 180;
    return S(open.u - open.a * Math.cos(a), open.w - open.b * Math.sin(a));
  };
  let box: Box = [e.centre[0] - e.ry - 4, e.centre[1] - e.ry - 4, 2 * e.ry + 8, 2 * e.ry + 8];
  const clip = uid("eye"), irisClip = uid("iris"), whiteClip = uid("white"), rimFade = uid("rim"), whiteFade = uid("fade");
  const edge = uid("blur"), soft = uid("blur");
  const bands = [uid("band"), uid("band"), uid("band")], bandBlur = [uid("blur"), uid("blur"), uid("blur")];
  // The lash line: along the ball's top, heaviest over the outer top corner, where it swells a little past the ball.
  const lidPts = Array.from({ length: 41 }, (_, k) => {
    const deg = e.lid.from + ((e.lid.to - e.lid.from) * k) / 40;
    return onBall(deg, 0.2 + e.lid.flick * Math.exp(-(((deg - 40) / 30) ** 2)));
  });
  const lid = strokeOf(lidPts, e.lid.width, { taper: Math.min(9, e.ry), tip: 0.3, band: LIMITS.outer });
  // The rim: the darkest over the top and down the sides, easing along the foot to the held brown and the glow's
  // warm brown, so the foot of the eye has no black ring, as the turnaround paints it.
  const [t0, t1] = [S(0, -e.ry), S(0, e.ry)];
  const far = (c: P) => `M${fmt(c[0] - 40)} ${fmt(c[1] - 40)}H${fmt(c[0] + 40)}V${fmt(c[1] + 40)}H${fmt(c[0] - 40)}Z`;
  // The lower iris as crescents along its foot, each the opening less itself moved up (and a little toward the outer
  // side, so it is fuller on the nose's side, where the sheets' glow sits), inside the iris: the held brown's broad
  // band, soft at its top; the russet glow inside it; and its lighter core right along the foot.
  const glow = e.glow ?? { band: 6, warm: 2.6 };
  const lifts: [number, number, number][] = [[glow.band, 0, 1.1], [glow.warm, -0.35, 0.65], [glow.warm * 0.45, -0.5, 0.4]];
  const bandCuts = lifts.map(([lift, out]) => `${far(e.centre)}${g.oval({ ...open, u: open.u + out, w: open.w - lift })}`);
  const fills: [string, number][] = [[C.dark, 1], [C.irisWarm, 0.95], [C.irisLight, 0.55]];
  // The white greys toward its upper end, under the lid, from its widest point up.
  const span = e.white.span + 10, fade = e.white.fade ?? 0.55;
  const [w0, w1] = [onOpen(e.white.at + span), onOpen(e.white.at)];
  let svg = `<defs><clipPath id="${clip}"><path d="${g.opening}"/></clipPath><clipPath id="${irisClip}"><path d="${g.irisD}"/></clipPath>` +
    `<clipPath id="${whiteClip}"><path d="${far(e.centre)}${g.irisD}" clip-rule="evenodd"/></clipPath>` +
    bandCuts.map((d, k) => `<clipPath id="${bands[k]}"><path d="${d}" clip-rule="evenodd"/></clipPath>`).join("") +
    `<linearGradient id="${rimFade}" gradientUnits="userSpaceOnUse" x1="${fmt(t0[0])}" y1="${fmt(t0[1])}" x2="${fmt(t1[0])}" y2="${fmt(t1[1])}">` +
    `<stop offset="0.5" stop-color="${C.eyeRim}"/><stop offset="0.74" stop-color="${C.eyeDark}"/><stop offset="0.9" stop-color="${C.dark}"/>` +
    `<stop offset="1" stop-color="${C.irisWarm}"/></linearGradient>` +
    `<linearGradient id="${whiteFade}" gradientUnits="userSpaceOnUse" x1="${fmt(w0[0])}" y1="${fmt(w0[1])}" x2="${fmt(w1[0])}" y2="${fmt(w1[1])}">` +
    `<stop offset="0.1" stop-color="${C.eyeDark}" stop-opacity="${r3(fade)}"/><stop offset="1" stop-color="${C.eyeDark}" stop-opacity="0"/></linearGradient>` +
    `${blur(edge, box, 0.18)}${blur(soft, box, 0.2)}${lifts.map(([, , sd], k) => blur(bandBlur[k]!, box, sd)).join("")}</defs>` +
    // The ball, the rim's dark all round it, and the lash line over its top, its edge a touch soft so it is not cut out.
    `<g filter="url(#${edge})"><path d="${g.ball}" fill="url(#${rimFade})"/><path d="${lid.d}" fill="${C.eyeRim}"/></g>` +
    `<g clip-path="url(#${clip})">` +
    // The iris: near-black, lightening down its lower part to the russet glow along its foot.
    `<path d="${g.opening}" fill="${C.eyeDark}"/>` +
    `<g clip-path="url(#${irisClip})">${fills.map(([colour, opacity], k) =>
      `<g filter="url(#${bandBlur[k]})"><path d="${g.opening}" fill="${colour}"${opacity < 1 ? ` opacity="${opacity}"` : ""} clip-path="url(#${bands[k]})"/></g>`).join("")}</g>` +
    // The white beside the iris, crisp on the rim's side (the opening's clip) and a little soft on the iris's.
    `<g filter="url(#${soft})"><g clip-path="url(#${whiteClip})"><path d="${g.opening}" fill="${C.eyeWhite}"/><path d="${g.opening}" fill="url(#${whiteFade})"/></g></g>` +
    // The sparkle's star in the lower iris, inside the opening.
    (e.sparkle ? starShine(e, e.sparkle.star, box) : "") + `</g>`;
  const lidLine: DrawnLine = { kind: "outer", width: e.lid.width, where: "eye lid", drawn: lid.drawn };
  // Under a half-lid the lid draws its own catchlights, under its lash: the open eye's would lie under the lid.
  if (e.cover) return piece(svg + halfLid(e, e.cover, box), box, { shapes: [], lines: [lidLine] });
  if (withLights) svg += lights(e, e.shine, e.tiny ?? tinyOf(e.shine), box);
  if (e.sparkle) {
    const beside = goldStars({ ...e, turn: e.sparkle.level }, e.sparkle.stars, e.sparkle.light);
    svg += beside.svg;
    box = union(box, beside.box);
  }
  return piece(svg, box, { shapes: [], lines: [lidLine] });
}

/** A four-pointed star's outline at `c`, `r` from its middle to its top and bottom points, `wide` of that across, its sides drawn in by `k` (0 a cross, 0.5 a diamond). */
function starPath(c: P, r: number, wide: number, k: number): string {
  const at = ([x, y]: P) => `${fmt(c[0] + x)} ${fmt(c[1] + y)}`;
  const tips: P[] = [[0, -r], [r * wide, 0], [0, r], [-r * wide, 0]];
  return `M${at(tips[0]!)}` + tips.map((p, i) => {
    const q = tips[(i + 1) % 4]!;
    return `C${at([p[0] * k, p[1] * k])} ${at([q[0] * k, q[1] * k])} ${at(q)}`;
  }).join("") + "Z";
}

/**
 * The sparkle's star in the lower iris, as the bear's Sparkle draws it (the kitty's has five points; the founder's is
 * the soft four-pointed one): white, upright, its four points a little rounded and its sides drawn in, a soft glow round it.
 */
function starShine(e: EyeSpec, s: { at: [number, number]; r: number }, box: Box): string {
  const c = spotOf(e, s.at), glow = uid("blur"), soft = uid("blur");
  return `<defs>${blur(glow, box, 0.6)}${blur(soft, box, 0.16)}</defs>` +
    `<path d="${starPath(c, s.r * 1.15, 0.92, 0.44)}" fill="${C.eyeWhite}" opacity="0.4" filter="url(#${glow})"/>` +
    `<path d="${starPath(c, s.r, 0.92, 0.4)}" fill="${C.light}" filter="url(#${soft})"/>`;
}

/**
 * A plump star's outline, as both sister sheets' Sparkle draws the gold stars beside its eye: `points` points (5 or 4),
 * one straight up, its valleys `inner` of the way out to its tips, tips and valleys rounded; `r` is half its height,
 * and `c` the middle of its height, so a five-pointed star, whose lower tips stand short of its radius, sits where asked.
 */
export function plumpStar(c: P, r: number, points: 4 | 5, inner: number): string {
  const n = points * 2, low = points === 5 ? Math.cos(Math.PI / 5) : 1;
  const R = (2 * r) / (1 + low), dy = (R - R * low) / 2;
  const pts = Array.from({ length: n }, (_, k): P => {
    const a = -Math.PI / 2 + (Math.PI * k) / points, rr = k % 2 ? R * inner : R;
    return [c[0] + rr * Math.cos(a), c[1] + dy + rr * Math.sin(a)];
  });
  // Each corner cut back along both its edges, a tip by a third of the edge and a valley by a fifth, and rounded
  // through the corner, so the tips are round and the valleys soft, as the sheets paint them.
  const cut = (k: number, toward: number) => {
    const p = pts[k]!, q = pts[(k + toward + n) % n]!, f = k % 2 ? 0.2 : 0.33;
    return [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f] as P;
  };
  const xy = (p: P) => `${fmt(p[0])} ${fmt(p[1])}`;
  return `M${xy(cut(0, 1))}` + Array.from({ length: n }, (_, i) => {
    const k = (i + 1) % n;
    return `L${xy(cut(k, -1))}Q${xy(pts[k]!)} ${xy(cut(k, 1))}`;
  }).join("") + "Z";
}

/**
 * The small gold stars beside a sparkle eye, as both sister sheets' Sparkle draws them beside its eye: plump, the
 * larger five-pointed and the smaller four-pointed (`points`), in the tag's gold (the sheets' stars are #F4C539 at their
 * middle, the tag #F4C542) with a lighter warm core toward the light and a soft rim of the tag's darker gold, as the
 * sheets' stars have a faint olive rim, which parts them from the hood's tan beside them; no line. They lie on the head
 * beside the eye, so the eye's clip to the head keeps them.
 */
function goldStars(e: EyeSpec, list: { at: [number, number]; r: number; points: 4 | 5 }[], light: P): { svg: string; box: Box } {
  const centres = list.map((s) => spotOf(e, s.at));
  const box = centres.map((c, k): Box => [c[0] - list[k]!.r - 1.5, c[1] - list[k]!.r - 1.5, 2 * list[k]!.r + 3, 2 * list[k]!.r + 3]).reduce(union);
  const soft = uid("blur"), glow = uid("blur");
  const body = list.map((s, k) => {
    const c = centres[k]!, core: P = [c[0] + light[0] * s.r * 0.12, c[1] + light[1] * s.r * 0.12];
    const inner = s.points === 5 ? 0.56 : 0.5;
    return `<path d="${plumpStar(c, s.r + 0.4, s.points, inner)}" fill="${C.tagRim}" opacity="0.55" filter="url(#${soft})"/>` +
      `<path d="${plumpStar(c, s.r, s.points, inner)}" fill="${C.tag}" filter="url(#${soft})"/>` +
      `<ellipse cx="${fmt(core[0])}" cy="${fmt(core[1])}" rx="${fmt(s.r * 0.28)}" ry="${fmt(s.r * 0.3)}" fill="${C.tagShine}" opacity="0.8" filter="url(#${glow})"/>`;
  }).join("");
  return { svg: `<defs>${blur(soft, box, 0.18)}${blur(glow, box, 0.45)}</defs>${body}`, box };
}

/** The half-lid's edge in model space, from the viewer's left to right: it bows down a little in its middle, as an eyelid's does. */
export function coverEdge(e: EyeSpec, c: NonNullable<EyeSpec["cover"]>): P[] {
  const t = (c.tilt * Math.PI) / 180, cos = Math.cos(t), sin = Math.sin(t);
  const L = (x: number, y: number): P => [e.centre[0] + x * cos - y * sin, e.centre[1] + x * sin + y * cos];
  const half = Math.max(e.rx, e.ry) + 1 + c.overhang;
  return Array.from({ length: 25 }, (_, k): P => {
    const x = -half + (2 * half * k) / 24;
    return L(x, c.level + (c.bow ?? 1.6) * (1 - (x / half) ** 2));
  });
}

/**
 * The half-lid over an open eye (EyeSpec.cover): drawn over it, inside the ball grown to cover its lash line. Its
 * catchlights lie on the iris just under the lid, the large one's top tucked under the lash (it rides up toward the
 * open eye's place and the lid covers what reaches past its edge, Q28) and the tiny one below it (Q26), each clipped
 * to below the lid's edge, so the lid always lies over them.
 */
function halfLid(e: EyeSpec, c: NonNullable<EyeSpec["cover"]>, box: Box): string {
  const t = (c.tilt * Math.PI) / 180, cos = Math.cos(t), sin = Math.sin(t);
  /** A point level with the face: `x` across the eye (toward the viewer's right), `y` down, from the ball's centre. */
  const L = (x: number, y: number): P => [e.centre[0] + x * cos - y * sin, e.centre[1] + x * sin + y * cos];
  const reach = Math.max(e.rx, e.ry) + 1, half = reach + c.overhang;
  const edge = coverEdge(e, c);
  const ball = uid("ball"), shade = uid("lidshade"), soft = uid("blur"), lash = uid("blur"), under = uid("below");
  // Grown past the ball by the open eye's lash line and its flick, so none of its rim shows round the lid.
  const grown = pathD(ellipse(e.centre, e.rx + e.lid.width + e.lid.flick + 0.3, e.ry + e.lid.width + e.lid.flick + 0.3, e.turn));
  const xy = (p: P) => `${fmt(p[0])} ${fmt(p[1])}`;
  const top = `M${edge.map(xy).join("L")}L${xy(L(half, -reach - 2))}L${xy(L(-half, -reach - 2))}Z`;
  const below = `M${edge.map(xy).join("L")}L${xy(L(half, reach + 2))}L${xy(L(-half, reach + 2))}Z`;
  const [g0, g1] = [L(0, c.level - 6), L(0, c.level)];
  const band = strokeOf(edge.slice(2, -2), c.lash, { taper: 3.2, tip: 0.7 });
  return `<defs><clipPath id="${ball}"><path d="${grown}"/></clipPath><clipPath id="${under}"><path d="${below}"/></clipPath>` +
    `<linearGradient id="${shade}" gradientUnits="userSpaceOnUse" x1="${fmt(g0[0])}" y1="${fmt(g0[1])}" x2="${fmt(g1[0])}" y2="${fmt(g1[1])}">` +
    `<stop offset="0" stop-color="${C.patch}"/><stop offset="1" stop-color="${C.lidShade}"/></linearGradient>` +
    `${blur(soft, box, 0.25)}${blur(lash, box, 0.2)}</defs>` +
    // The catchlights on the iris, below the lid's edge.
    `<g clip-path="url(#${under})">${lights(e, c.shine, tinyOf(c.shine), box)}</g>` +
    // The lid's fur over the ball's upper part, deepening to its edge, its rim soft so it melts into the hood.
    `<g filter="url(#${soft})"><g clip-path="url(#${ball})"><path d="${top}" fill="url(#${shade})"/></g></g>` +
    // The lash line along its edge, running a little past the ball either side, over the large catchlight's top.
    `<g filter="url(#${lash})"><path d="${band.d}" fill="${C.eyeRim}"/></g>`;
}

/**
 * Where an eye's iris shows, in the eye's own frame: the centroid of the iris inside the opening, toward the nose and
 * up from the ball's centre (the R3 gaze guard's measure, faces.test.ts), sampled every 0.1 pt.
 */
export function irisCentre(e: EyeSpec): [number, number] {
  const g = eyeGeometry(e);
  const inside = (o: { u: number; w: number; a: number; b: number }, u: number, w: number) => ((u - o.u) / o.a) ** 2 + ((w - o.w) / o.b) ** 2 <= 1;
  let [su, sw, n] = [0, 0, 0];
  for (let u = -16; u <= 16; u += 0.1) for (let w = -16; w <= 16; w += 0.1) {
    if (inside(g.open, u, w) && inside(g.iris, u, w)) (su += u, sw += w, n++);
  }
  return [su / n, -sw / n];
}

/**
 * Where a catchlight lies on its eye (the guards in faces.test.ts and faces.turned.test.ts): its middle and 16 points
 * round its edge, each on the dark iris inside the opening or not; under a lid, only the points below its `edge` (a
 * model-space polyline across the eye, leaning `tilt` degrees with the face) count, as the lid covers the rest.
 */
export function lightOnIris(e: EyeSpec, l: { at: [number, number]; r: number }, under?: { edge: P[]; tilt: number }): { shown: number; off: number } {
  const g = eyeGeometry(e), a = (e.turn * Math.PI) / 180, t = ((under?.tilt ?? 0) * Math.PI) / 180;
  const inside = (o: { u: number; w: number; a: number; b: number }, u: number, w: number) => ((u - o.u) / o.a) ** 2 + ((w - o.w) / o.b) ** 2 <= 1;
  const level = ([x, y]: P): P => [x * Math.cos(t) + y * Math.sin(t), -x * Math.sin(t) + y * Math.cos(t)];
  const lid = under?.edge.map(level).sort((p, q) => p[0] - q[0]);
  /** Whether a model-space point lies below the lid's edge, in the lid's own level frame. */
  const below = (p: P) => {
    if (!lid) return true;
    const [x, y] = level(p);
    const i = lid.findIndex((q) => q[0] >= x);
    if (i <= 0) return false;
    const [p0, p1] = [lid[i - 1]!, lid[i]!];
    return y > p0[1] + ((p1[1] - p0[1]) * (x - p0[0])) / (p1[0] - p0[0] || 1);
  };
  const pts = [[0, 0], ...Array.from({ length: 16 }, (_, k) => [Math.cos((k * Math.PI) / 8), Math.sin((k * Math.PI) / 8)])].map(([cu, cw]): [number, number] => [l.at[0] + l.r * cu!, -l.at[1] + l.r * cw!]);
  let shown = 0, off = 0;
  for (const [u, w] of pts) {
    const p: P = [e.centre[0] + e.noseward * u * Math.cos(a) - w * Math.sin(a), e.centre[1] + e.noseward * u * Math.sin(a) + w * Math.cos(a)];
    if (!below(p)) continue;
    shown++;
    if (!(inside(g.open, u, w) && inside(g.iris, u, w))) off++;
  }
  return { shown, off };
}

/** How far a catchlight moves with the iris: about half its travel, as a real eye's reflection lags its pupil (Q28). */
export const RIDE = 0.5;

/**
 * The large catchlight of an eye whose iris looks aside (Q28, DECISIONS 204): moved from `base`, where the eye with its
 * iris centred (`centred`) has it, by RIDE of the iris's travel from that eye's, its size kept; the tiny one follows it
 * (`tinyOf`). Where half the travel leaves either of them touching the white, it rides on a little further, in steps
 * of 0.05 of the travel, until both lie whole on the dark iris: the catchlight never leaves the iris (Q28). An eye where
 * no step does (an iris drawn too narrow or rolled away) gets the whole travel, and the catchlight and gaze guards
 * (faces.test.ts, faces.turned.test.ts) name what is wrong with it, rather than the build failing before they run.
 */
export function riding(e: EyeSpec, centred: EyeSpec, base: { at: [number, number]; r: number }, fraction = RIDE): { at: [number, number]; r: number } {
  const [a, b] = [irisCentre(e), irisCentre(centred)];
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const at = (f: number) => ({ at: [r2(base.at[0] + f * (a[0] - b[0])), r2(base.at[1] + f * (a[1] - b[1]))] as [number, number], r: base.r });
  for (let f = fraction; f <= 1 + 1e-9; f += 0.05) {
    const l = at(f);
    if (lightOnIris(e, l).off === 0 && lightOnIris(e, tinyOf(l)).off === 0) return l;
  }
  return at(1);
}

/**
 * A closed eye drawn as the sheets' dark lash band (no ball, no iris): the happy crescent (Happy crescent, Excited,
 * Laughing, Proud), a ∩ whose outer end hangs a little lower and runs out in a fine flick; the closed lid (Closed,
 * Sleepy), a ∪; and the wink (Winking, Cheeky, Mischievous), a ∩ whose outer end lifts. The band is thickest at its
 * middle, round at its inner end and tapering to its outer flick, near-black (the sheets' crescents are #160301 to
 * #1B0300 at their core, L* 2 to 3), a touch soft at its edge, as the open eye's is.
 */
export interface LidBand {
  /** Where the band's middle (its area's centroid) lies, in model space, and the face's roll (degrees). */
  centre: P;
  tilt: number;
  /** +1 when the nose lies to the eye's right on screen, −1 when to its left. */
  noseward: 1 | -1;
  /** From the inner end's middle to the outer end's, across. */
  width: number;
  /** How far the middle stands above the ends: positive a ∩ (crescent, wink), negative a ∪ (closed). */
  rise: number;
  /** How much lower the outer end sits than the inner one (negative: higher). */
  drop: number;
  /** Thick at its middle, and at its inner and outer ends, in points. */
  thickness: number;
  ends: [number, number];
  /**
   * How soon it reaches its full thickness from its ends: the power on its swell (0.7 by default; lower is fuller, an
   * even band with round ends, as the master sheet's crescents are).
   */
  fullness?: number;
  /** How far the outer end runs on as a fine flick, and how far it turns from the band's own direction (degrees, down positive). */
  flick: { length: number; hook: number };
}

export function lidBand(b: LidBand): Piece {
  const { shape } = bandGeometry(b);
  const [x0, y0, x1, y1] = shape.reduce((q, [x, y]) => [Math.min(q[0], x), Math.min(q[1], y), Math.max(q[2], x), Math.max(q[3], y)], [Infinity, Infinity, -Infinity, -Infinity]);
  const box: Box = [x0 - 2, y0 - 2, x1 - x0 + 4, y1 - y0 + 4];
  const g = uid("blur");
  const d = `M${shape.map((p) => `${fmt(p[0])} ${fmt(p[1])}`).join("L")}Z`;
  return piece(`<defs>${blur(g, box, 0.2)}</defs><path d="${d}" fill="${C.eyeRim}" filter="url(#${g})"/>`, box);
}

/** A band's centre line in model space, from its inner end to its outer end (its flick left out), for the R3 guard. */
export const lidLine = (b: LidBand): P[] => bandGeometry(b).line;

/** A band's outline and its centre line, placed in model space. */
function bandGeometry(b: LidBand): { shape: P[]; line: P[] } {
  const t = (b.tilt * Math.PI) / 180, cos = Math.cos(t), sin = Math.sin(t);
  const out = -b.noseward;
  // The centre line level with the face, from the inner end (s = 0) to the outer (s = 1), x across toward the outer side, y down.
  const n = 40;
  const pts: P[] = Array.from({ length: n + 1 }, (_, k): P => [(k / n - 0.5) * b.width, -b.rise * 4 * (k / n) * (1 - k / n) + b.drop * (k / n)]);
  // The flick: on past the outer end along its own direction, turned by the hook.
  const tip = pts[n]!, dir = v.norm(v.sub(tip, pts[n - 1]!));
  const h = (b.flick.hook * Math.PI) / 180;
  const flickDir: P = [dir[0] * Math.cos(h) - dir[1] * Math.sin(h), dir[0] * Math.sin(h) + dir[1] * Math.cos(h)];
  const m = Math.max(2, Math.round(b.flick.length / 0.5));
  for (let k = 1; k <= m; k++) pts.push(v.add(tip, v.mul(flickDir, (b.flick.length * k) / m)));
  // Its width: the inner end's, swelling to the middle's and down to the outer end's, then thinning along the flick.
  const total = pts.length - 1;
  const widthAt = (k: number) => {
    if (k > n) return b.ends[1] + (0.15 - b.ends[1]) * ((k - n) / m);
    const s = k / n, base = b.ends[0] + (b.ends[1] - b.ends[0]) * s;
    return base + (b.thickness - base) * Math.sin(Math.PI * s) ** (b.fullness ?? 0.7);
  };
  const left: P[] = [], right: P[] = [];
  for (let k = 0; k <= total; k++) {
    const tan = v.norm(v.sub(pts[Math.min(total, k + 1)]!, pts[Math.max(0, k - 1)]!));
    const nrm: P = [-tan[1], tan[0]];
    left.push(v.add(pts[k]!, v.mul(nrm, widthAt(k) / 2)));
    right.push(v.sub(pts[k]!, v.mul(nrm, widthAt(k) / 2)));
  }
  // A round cap on the inner end.
  const back = v.norm(v.sub(pts[0]!, pts[1]!)), side: P = [-back[1], back[0]], capR = b.ends[0] / 2;
  const cap: P[] = Array.from({ length: 7 }, (_, k) => {
    const a = -Math.PI / 2 + (Math.PI * (k + 1)) / 8;
    return v.add(pts[0]!, v.add(v.mul(back, capR * Math.cos(a)), v.mul(side, -capR * Math.sin(a))));
  });
  const outline: P[] = [...left, ...right.reverse(), ...cap];
  // Its area's centroid, so the band's middle lands where the view asks.
  let A = 0, cx = 0, cy = 0;
  outline.forEach((p, i) => {
    const q = outline[(i + 1) % outline.length]!, c = p[0] * q[1] - q[0] * p[1];
    A += c; cx += (p[0] + q[0]) * c; cy += (p[1] + q[1]) * c;
  });
  const mid: P = [cx / (3 * A), cy / (3 * A)];
  const place = ([x, y]: P): P => {
    const lx = out * (x - mid[0]), ly = y - mid[1];
    return [b.centre[0] + lx * cos - ly * sin, b.centre[1] + lx * sin + ly * cos];
  };
  return { shape: outline.map(place), line: pts.slice(0, n + 1).map(place) };
}

/**
 * The squeeze (Q2, DECISIONS 202): the dog's own `>` and `<`, drawn as the kitty's and the bear's Excited draw theirs
 * (the dog's sheets draw none): two short, plump arms meeting in a point toward the nose and opening toward the eye's
 * outer side, the upper arm a little flatter than the lower, each bowing out a hair and rounding off at its end, the
 * point's outer corner a soft point rather than a knuckle; in the lash bands' warm near-black, about as thick as the
 * dog's crescent band, at the eye's own size, a touch soft at the edge as the open eye's is.
 */
export interface Chevron {
  /** Where the point's middle sits (the arms' centre lines meet there), in model space, and the face's roll (degrees). */
  tip: P;
  tilt: number;
  /** +1 when the nose lies to the eye's right on screen, −1 when to its left. */
  noseward: 1 | -1;
  /** Each arm's length from the point, the upper and the lower. */
  length: [number, number];
  /** How far each arm turns from the face's level as it runs out from the point: the upper one up, the lower one down (degrees). */
  angle: [number, number];
  /** The arms' thickness along most of their length, and at their round ends. */
  thickness: number;
  ends: number;
  /** How far each arm's middle bows out, away from the opening between them. */
  bow: number;
  /** The radius the point's outer corner is rounded to, under half the thickness. */
  point: number;
  /** Its colour: the lash bands' near-black unless given. */
  colour?: string;
}

/** The arms' centre lines in model space, from the point out to each end, upper then lower (for the R3 guard). */
export function chevronArms(c: Chevron): [P[], P[]] {
  const g = chevronGeometry(c);
  return [g.arms[0], g.arms[1]];
}

function chevronGeometry(c: Chevron): { shape: P[]; arms: [P[], P[]] } {
  const t = (c.tilt * Math.PI) / 180, out = -c.noseward;
  /** A point in the squeeze's level frame (x toward the eye's outer side, y down, from the point), in model space. */
  const L = ([x, y]: P): P => [c.tip[0] + out * x * Math.cos(t) - y * Math.sin(t), c.tip[1] + out * x * Math.sin(t) + y * Math.cos(t)];
  const n = 24;
  const arm = (k: 0 | 1) => {
    const a = ((k === 0 ? -c.angle[0] : c.angle[1]) * Math.PI) / 180, len = c.length[k];
    const d: P = [Math.cos(a), Math.sin(a)];
    // Its normal away from the opening: up for the upper arm, down for the lower.
    const away = (tan: P): P => (k === 0 ? [tan[1], -tan[0]] : [-tan[1], tan[0]]);
    const line = Array.from({ length: n + 1 }, (_, i): P => v.add(v.mul(d, (len * i) / n), v.mul(away(d), 4 * c.bow * (i / n) * (1 - i / n))));
    // Even along most of its length, easing to the round end's width over its last third.
    const w = (i: number) => (i / n < 0.66 ? c.thickness : c.thickness + (c.ends - c.thickness) * ((i / n - 0.66) / 0.34) ** 1.2);
    const tanAt = (i: number) => v.norm(v.sub(line[Math.min(n, i + 1)]!, line[Math.max(0, i - 1)]!));
    const outer = line.map((p, i) => v.add(p, v.mul(away(tanAt(i)), w(i) / 2)));
    const inner = line.map((p, i) => v.sub(p, v.mul(away(tanAt(i)), w(i) / 2)));
    // A round cap at the end, a half circle of the end's width, from the inner edge round to the outer.
    const end = line[n]!, tan = tanAt(n), no = away(tan);
    const cap = Array.from({ length: 9 }, (_, i): P => {
      const b = -Math.PI / 2 + (Math.PI * (i + 1)) / 10;
      return v.add(end, v.add(v.mul(tan, (c.ends / 2) * Math.cos(b)), v.mul(no, (c.ends / 2) * Math.sin(b))));
    });
    return { line, outer, inner, cap, d: tanAt(0) };
  };
  const [u, l] = [arm(0), arm(1)];
  // Where two edges, each a point and a direction, meet.
  const meet = (p: P, d: P, q: P, e: P): P => {
    const det = d[0] * -e[1] - d[1] * -e[0];
    const s = ((q[0] - p[0]) * -e[1] - (q[1] - p[1]) * -e[0]) / det;
    return v.add(p, v.mul(d, s));
  };
  // The outer edges run on back toward the nose until they meet (M), and that corner is rounded to `point`: a fillet
  // tangent to both, its middle on the bisector. The inner edges meet inside the opening (I).
  const M = meet(u.outer[0]!, u.d, l.outer[0]!, l.d), I = meet(u.inner[0]!, u.d, l.inner[0]!, l.d);
  const h = Math.acos(Math.max(-1, Math.min(1, u.d[0] * l.d[0] + u.d[1] * l.d[1]))) / 2;
  const back = c.point / Math.tan(h), centre = v.add(M, v.mul(v.norm(v.add(u.d, l.d)), c.point / Math.sin(h)));
  const [t0, t1] = [v.add(M, v.mul(u.d, back)), v.add(M, v.mul(l.d, back))];
  const a0 = Math.atan2(t0[1] - centre[1], t0[0] - centre[0]);
  let sweep = Math.atan2(t1[1] - centre[1], t1[0] - centre[0]) - a0;
  while (sweep > Math.PI) sweep -= 2 * Math.PI;
  while (sweep < -Math.PI) sweep += 2 * Math.PI;
  const round = Array.from({ length: 9 }, (_, i): P => v.add(centre, [c.point * Math.cos(a0 + (sweep * i) / 8), c.point * Math.sin(a0 + (sweep * i) / 8)]));
  // Past the inner corner only: the inner edges' first stretch lies inside the other arm.
  const pastI = (pts: P[], d: P) => pts.filter((p) => v.dot(v.sub(p, I), d) > 0.05);
  // Out along the upper arm's outer edge from its end to the point, round the point, along the lower arm's outer edge
  // to its end, round its cap, back along its inner edge to the inner corner, out along the upper arm's inner edge,
  // and round its cap.
  const shape: P[] = [...[...u.outer].reverse(), ...round, ...l.outer, ...[...l.cap].reverse(), ...pastI([...l.inner].reverse(), l.d), I,
    ...pastI(u.inner, u.d), ...u.cap];
  return { shape: shape.map(L), arms: [u.line.map(L), l.line.map(L)] };
}

export function chevron(c: Chevron): Piece {
  const { shape } = chevronGeometry(c);
  const [x0, y0, x1, y1] = shape.reduce((q, [x, y]) => [Math.min(q[0], x), Math.min(q[1], y), Math.max(q[2], x), Math.max(q[3], y)], [Infinity, Infinity, -Infinity, -Infinity]);
  const box: Box = [x0 - 2, y0 - 2, x1 - x0 + 4, y1 - y0 + 4];
  const g = uid("blur");
  const d = `M${shape.map((p) => `${fmt(p[0])} ${fmt(p[1])}`).join("L")}Z`;
  return piece(`<defs>${blur(g, box, 0.2)}</defs><path d="${d}" fill="${c.colour ?? C.eyeRim}" filter="url(#${g})"/>`, box);
}
