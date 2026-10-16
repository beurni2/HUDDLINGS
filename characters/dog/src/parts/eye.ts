// The dog's open eye, one recipe for every view (DECISIONS 73, 78), as the turnaround, the hero and the glossy-eyes
// panel paint it: a near-black rim all round, darker than the iris it rings (the sheets' L* 2 to 4 round an iris of
// L* 5 to 8), heaviest over the top, where a lash line lies on it, and thinning to a warm brown along the foot; inside
// it the iris, near-black over its upper part (the pupil and the upper iris, #200C02), lightening down its lower part
// through the held lower-iris brown (#3A2314) to the sheets' russet glow, lightest right along its foot, where it
// follows the eye's lower contour as a crescent (the turnaround's L* rises from about 10 halfway down to 25 to 30 at
// the foot); between the rim and the iris on the outer, lower side a warm-white crescent, the eye's white, as wide
// and as long as each crop draws it, crisp on the rim's side and a little soft on the iris's, greying toward its
// upper end; no rays, rings or spokes; and one catchlight high on the nose's side (Q26's default), white with a
// soft halo where it meets the iris.
import { ellipse, pathD, v, type P } from "../../../draw/geom.ts";
import { strokeOf, type DrawnLine } from "../../../draw/line.ts";
import { LIMITS } from "../../../draw/lint.ts";
import { blur, piece, uid, type Box, type Piece } from "../../../draw/svg.ts";
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
  /** The catchlight: `at` toward the nose and up from the ball's centre, and its radius, in points. */
  shine: { at: [number, number]; r: number };
  /** How far up from the iris's foot the lower iris lightens: the held brown's band and the russet glow, in points (6 and 2.6 by default). */
  glow?: { band: number; warm: number };
  /**
   * The sleepy half-lid, as the expression sheet's Sleepy half-lid draws it: the upper lid closed down over the eye to a
   * level line `level` pt below the ball's centre (up negative), turned with the face by `tilt` degrees, its fur the
   * hood's pale tan deepening toward its edge, a lash line `lash` pt thick along that edge that runs `overhang` pt
   * past the ball either side, and the catchlight moved just under it (`shine`, as `shine` above); `bow`, how far the
   * edge bows down in its middle below its ends (1.6 pt by default).
   */
  cover?: { level: number; tilt: number; lash: number; overhang: number; shine: { at: [number, number]; r: number }; bow?: number };
  /**
   * A white four-pointed star in the lower iris, as the kitty's and the bear's Sparkle (Star Highlight) draw it: `at`
   * toward the nose and up from the ball's centre, its half-height `r` (Q2's review-only alternative: the dog's sheets
   * draw no star eye).
   */
  star?: { at: [number, number]; r: number };
}

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

export function eye(e: EyeSpec): Piece {
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
  const box: Box = [e.centre[0] - e.ry - 4, e.centre[1] - e.ry - 4, 2 * e.ry + 8, 2 * e.ry + 8];
  const clip = uid("eye"), irisClip = uid("iris"), whiteClip = uid("white"), rimFade = uid("rim"), whiteFade = uid("fade");
  const edge = uid("blur"), soft = uid("blur"), shineBlur = uid("blur"), haloBlur = uid("blur");
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
  const big = S(e.shine.at[0], -e.shine.at[1]);
  const ell = (c: P, a: number, b: number) => pathD(ellipse(c, a, b, e.turn));
  const svg = `<defs><clipPath id="${clip}"><path d="${g.opening}"/></clipPath><clipPath id="${irisClip}"><path d="${g.irisD}"/></clipPath>` +
    `<clipPath id="${whiteClip}"><path d="${far(e.centre)}${g.irisD}" clip-rule="evenodd"/></clipPath>` +
    bandCuts.map((d, k) => `<clipPath id="${bands[k]}"><path d="${d}" clip-rule="evenodd"/></clipPath>`).join("") +
    `<linearGradient id="${rimFade}" gradientUnits="userSpaceOnUse" x1="${fmt(t0[0])}" y1="${fmt(t0[1])}" x2="${fmt(t1[0])}" y2="${fmt(t1[1])}">` +
    `<stop offset="0.5" stop-color="${C.eyeRim}"/><stop offset="0.74" stop-color="${C.eyeDark}"/><stop offset="0.9" stop-color="${C.dark}"/>` +
    `<stop offset="1" stop-color="${C.irisWarm}"/></linearGradient>` +
    `<linearGradient id="${whiteFade}" gradientUnits="userSpaceOnUse" x1="${fmt(w0[0])}" y1="${fmt(w0[1])}" x2="${fmt(w1[0])}" y2="${fmt(w1[1])}">` +
    `<stop offset="0.1" stop-color="${C.eyeDark}" stop-opacity="${r3(fade)}"/><stop offset="1" stop-color="${C.eyeDark}" stop-opacity="0"/></linearGradient>` +
    `${blur(edge, box, 0.18)}${blur(soft, box, 0.2)}${lifts.map(([, , sd], k) => blur(bandBlur[k]!, box, sd)).join("")}` +
    `${blur(shineBlur, box, 0.22)}${blur(haloBlur, box, 0.5)}</defs>` +
    // The ball, the rim's dark all round it, and the lash line over its top, its edge a touch soft so it is not cut out.
    `<g filter="url(#${edge})"><path d="${g.ball}" fill="url(#${rimFade})"/><path d="${lid.d}" fill="${C.eyeRim}"/></g>` +
    `<g clip-path="url(#${clip})">` +
    // The iris: near-black, lightening down its lower part to the russet glow along its foot.
    `<path d="${g.opening}" fill="${C.eyeDark}"/>` +
    `<g clip-path="url(#${irisClip})">${fills.map(([colour, opacity], k) =>
      `<g filter="url(#${bandBlur[k]})"><path d="${g.opening}" fill="${colour}"${opacity < 1 ? ` opacity="${opacity}"` : ""} clip-path="url(#${bands[k]})"/></g>`).join("")}</g>` +
    // The white beside the iris, crisp on the rim's side (the opening's clip) and a little soft on the iris's.
    `<g filter="url(#${soft})"><g clip-path="url(#${whiteClip})"><path d="${g.opening}" fill="${C.eyeWhite}"/><path d="${g.opening}" fill="url(#${whiteFade})"/></g></g></g>` +
    // One catchlight, high on the nose's side: white, its soft halo where it meets the iris.
    `<path d="${ell(big, e.shine.r * 1.3, e.shine.r * 1.25)}" fill="${C.eyeWhite}" opacity="0.35" filter="url(#${haloBlur})"/>` +
    `<path d="${ell(big, e.shine.r, e.shine.r * 0.94)}" fill="${C.light}" filter="url(#${shineBlur})"/>` +
    (e.star ? starShine(S(e.star.at[0], -e.star.at[1]), e.star.r, e.turn, shineBlur) : "");
  const lidLine: DrawnLine = { kind: "outer", width: e.lid.width, where: "eye lid", drawn: lid.drawn };
  if (!e.cover) return piece(svg, box, { shapes: [], lines: [lidLine] });
  return piece(svg + halfLid(e, e.cover, box), box, { shapes: [], lines: [lidLine] });
}

/** A white four-pointed star at `c`, `r` from its middle to its top and bottom points, a little narrower across, its sides drawn in. */
function starShine(c: P, r: number, turn: number, soft: string): string {
  const a = (turn * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
  const at = ([x, y]: P) => `${fmt(c[0] + x * cos - y * sin)} ${fmt(c[1] + x * sin + y * cos)}`;
  const tips: P[] = [[0, -r], [r * 0.85, 0], [0, r], [-r * 0.85, 0]];
  const k = 0.3;
  const d = `M${at(tips[0]!)}` + tips.map((p, i) => {
    const q = tips[(i + 1) % 4]!;
    return `C${at([p[0] * k, p[1] * k])} ${at([q[0] * k, q[1] * k])} ${at(q)}`;
  }).join("") + "Z";
  return `<path d="${d}" fill="${C.light}" filter="url(#${soft})"/>`;
}

/** The half-lid over an open eye (EyeSpec.cover): drawn over it, inside the ball grown to cover its lash line. */
function halfLid(e: EyeSpec, c: NonNullable<EyeSpec["cover"]>, box: Box): string {
  const t = (c.tilt * Math.PI) / 180, cos = Math.cos(t), sin = Math.sin(t);
  /** A point level with the face: `x` across the eye (toward the viewer's right), `y` down, from the ball's centre. */
  const L = (x: number, y: number): P => [e.centre[0] + x * cos - y * sin, e.centre[1] + x * sin + y * cos];
  const reach = Math.max(e.rx, e.ry) + 1, half = reach + c.overhang;
  // The lid's edge bows down a little in its middle, as an eyelid's does.
  const edge = Array.from({ length: 25 }, (_, k): P => {
    const x = -half + (2 * half * k) / 24;
    return L(x, c.level + (c.bow ?? 1.6) * (1 - (x / half) ** 2));
  });
  const ball = uid("ball"), shade = uid("lidshade"), soft = uid("blur"), lash = uid("blur"), shine = uid("blur");
  // Grown past the ball by the open eye's lash line and its flick, so none of its rim shows round the lid.
  const grown = pathD(ellipse(e.centre, e.rx + e.lid.width + e.lid.flick + 0.3, e.ry + e.lid.width + e.lid.flick + 0.3, e.turn));
  const xy = (p: P) => `${fmt(p[0])} ${fmt(p[1])}`;
  const top = `M${edge.map(xy).join("L")}L${xy(L(half, -reach - 2))}L${xy(L(-half, -reach - 2))}Z`;
  const [g0, g1] = [L(0, c.level - 6), L(0, c.level)];
  const band = strokeOf(edge.slice(2, -2), c.lash, { taper: 3.2, tip: 0.7 });
  const a = (e.turn * Math.PI) / 180;
  const [u, w] = [c.shine.at[0], -c.shine.at[1]];
  const spot: P = [e.centre[0] + e.noseward * u * Math.cos(a) - w * Math.sin(a), e.centre[1] + e.noseward * u * Math.sin(a) + w * Math.cos(a)];
  return `<defs><clipPath id="${ball}"><path d="${grown}"/></clipPath>` +
    `<linearGradient id="${shade}" gradientUnits="userSpaceOnUse" x1="${fmt(g0[0])}" y1="${fmt(g0[1])}" x2="${fmt(g1[0])}" y2="${fmt(g1[1])}">` +
    `<stop offset="0" stop-color="${C.patch}"/><stop offset="1" stop-color="${C.lidShade}"/></linearGradient>` +
    `${blur(soft, box, 0.25)}${blur(lash, box, 0.2)}${blur(shine, box, 0.22)}</defs>` +
    // The lid's fur over the ball's upper part, deepening to its edge, its rim soft so it melts into the hood.
    `<g filter="url(#${soft})"><g clip-path="url(#${ball})"><path d="${top}" fill="url(#${shade})"/></g></g>` +
    // The lash line along its edge, running a little past the ball either side, and the catchlight just under it.
    `<g filter="url(#${lash})"><path d="${band.d}" fill="${C.eyeRim}"/></g>` +
    `<path d="${pathD(ellipse(spot, c.shine.r, c.shine.r * 0.94, e.turn))}" fill="${C.light}" filter="url(#${shine})"/>`;
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
 * The squeezed eye as the kitty's and the bear's Excited draw it, `>` and `<` (Q2's review-only alternative: the dog's
 * sheets draw none, and the dog's squeeze is its happy crescent): two short arms of the lash band's near-black,
 * thickest where they meet in a soft point toward the nose and rounding off at their outer ends, their opening
 * `spread` degrees, a touch soft at the edge as the open eye's is.
 */
export interface Chevron {
  /** Where the point sits, in model space, and the face's roll (degrees). */
  tip: P;
  tilt: number;
  /** +1 when the nose lies to the eye's right on screen, −1 when to its left. */
  noseward: 1 | -1;
  /** Each arm's length from the point, the angle between the arms, and the band's thickness at the point and at the arms' ends. */
  length: number;
  spread: number;
  thickness: [number, number];
}

export function chevron(c: Chevron): Piece {
  const t = (c.tilt * Math.PI) / 180;
  const n = 24;
  const arm = (sign: 1 | -1) => {
    // From the point outward (away from the nose), turned up or down by half the spread, then rolled with the face.
    const a = t + (c.noseward > 0 ? Math.PI : 0) - c.noseward * sign * ((c.spread / 2) * Math.PI) / 180;
    const dir: P = [Math.cos(a), Math.sin(a)];
    const pts = Array.from({ length: n + 1 }, (_, k): P => v.add(c.tip, v.mul(dir, (c.length * k) / n)));
    const w = (k: number) => c.thickness[0] + (c.thickness[1] - c.thickness[0]) * (k / n) ** 1.4;
    const nrm: P = [-dir[1], dir[0]];
    const left = pts.map((p, k) => v.add(p, v.mul(nrm, w(k) / 2))), right = pts.map((p, k) => v.sub(p, v.mul(nrm, w(k) / 2)));
    // A round cap at the outer end, a half circle of the end's width.
    const end = pts[n]!, r = w(n) / 2;
    const cap = Array.from({ length: 9 }, (_, k): P => {
      const b = Math.PI / 2 - (Math.PI * (k + 1)) / 10;
      return v.add(end, v.add(v.mul(dir, r * Math.cos(b)), v.mul(nrm, r * Math.sin(b))));
    });
    return [...left, ...cap, ...right.reverse()];
  };
  const shapes = [arm(1), arm(-1)];
  // A round knuckle at the point, so the two arms meet in a soft point rather than a notch.
  const knuckle = Array.from({ length: 16 }, (_, k): P => v.add(c.tip, [Math.cos((k * Math.PI) / 8) * c.thickness[0] / 2, Math.sin((k * Math.PI) / 8) * c.thickness[0] / 2]));
  const all = [...shapes.flat(), ...knuckle];
  const [x0, y0, x1, y1] = all.reduce((q, [x, y]) => [Math.min(q[0], x), Math.min(q[1], y), Math.max(q[2], x), Math.max(q[3], y)], [Infinity, Infinity, -Infinity, -Infinity]);
  const box: Box = [x0 - 2, y0 - 2, x1 - x0 + 4, y1 - y0 + 4];
  const g = uid("blur");
  // Each its own path, so their overlaps fill whatever way each one winds.
  const paths = [...shapes, knuckle].map((s) => `<path d="M${s.map((p) => `${fmt(p[0])} ${fmt(p[1])}`).join("L")}Z" fill="${C.eyeRim}"/>`).join("");
  return piece(`<defs>${blur(g, box, 0.2)}</defs><g filter="url(#${g})">${paths}</g>`, box);
}
