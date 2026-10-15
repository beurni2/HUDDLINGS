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
import { ellipse, pathD, type P } from "../../../draw/geom.ts";
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
    `<path d="${ell(big, e.shine.r, e.shine.r * 0.94)}" fill="${C.light}" filter="url(#${shineBlur})"/>`;
  const lidLine: DrawnLine = { kind: "outer", width: e.lid.width, where: "eye lid", drawn: lid.drawn };
  return piece(svg, box, { shapes: [], lines: [lidLine] });
}
