// The dog's open eye, one recipe for every view (DECISIONS 73), as the turnaround, the hero and the glossy-eyes
// panel paint it: a dark rim all round, heaviest over the top, where a lash line lies on it; inside it the iris,
// near-black over its upper two thirds (the pupil and the upper iris, #200C02) above a lower third in the held
// lower-iris brown (#3A2314) that glows warm and lighter toward its foot, the sheets' russet light; between the rim
// and the iris on the outer, lower side a crisp warm-white crescent, the eye's white, as wide as each crop draws it;
// no rays, rings or spokes; and one catchlight high on the nose's side (Q26's default). Each view gives the shape,
// the size and the crescent from its own crop.
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
  /** The white: widest (`width`, in points) at `at` degrees round from the outer side, fading to nothing a little past `span` degrees either side (the opening being smaller than the iris, about 10° past for the views' eyes). */
  white: { at: number; width: number; span: number };
  /** The catchlight: `at` toward the nose and up from the ball's centre, and its radius, in points. */
  shine: { at: [number, number]; r: number };
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
  const { S, iris } = g;
  /** A point on the ball's edge `deg` degrees round from the outer side (up positive), grown by `grow`. */
  const onBall = (deg: number, grow = 0): P => {
    const a = (deg * Math.PI) / 180;
    return S(-(e.rx + grow) * Math.cos(a), -(e.ry + grow) * Math.sin(a));
  };
  const box: Box = [e.centre[0] - e.ry - 4, e.centre[1] - e.ry - 4, 2 * e.ry + 8, 2 * e.ry + 8];
  const clip = uid("eye"), irisClip = uid("iris"), whiteClip = uid("white"), bandClip = uid("band"), rimFade = uid("rim"), lidShade = uid("lid");
  const crisp = uid("blur"), band = uid("blur"), glow = uid("blur"), core = uid("blur"), shineBlur = uid("blur");
  // The lash line: along the ball's top, heaviest over the outer top corner, where it swells a little past the ball.
  const lidPts = Array.from({ length: 41 }, (_, k) => {
    const deg = e.lid.from + ((e.lid.to - e.lid.from) * k) / 40;
    return onBall(deg, 0.2 + e.lid.flick * Math.exp(-(((deg - 40) / 30) ** 2)));
  });
  const lid = strokeOf(lidPts, e.lid.width, { taper: Math.min(9, e.ry), tip: 0.3, band: LIMITS.outer });
  // The rim darkens from the printed lower-iris brown round the foot to the near-black over the top.
  const [t0, t1] = [S(0, -e.ry), S(0, e.ry)];
  // The lower third: the iris less itself moved up by a third of its height, a crescent along its foot, its top
  // edge soft but defined.
  const up = 2 * iris.b * 0.36;
  const bandCut = g.oval({ ...iris, w: iris.w - up });
  const far = (c: P) => `M${fmt(c[0] - 40)} ${fmt(c[1] - 40)}H${fmt(c[0] + 40)}V${fmt(c[1] + 40)}H${fmt(c[0] - 40)}Z`;
  // The russet glow low in the band, above its foot: a broad soft light of the iris's warm brown, a smaller lighter core.
  const glowAt = S(iris.u, iris.w + iris.b * 0.5), coreAt = S(iris.u, iris.w + iris.b * 0.53);
  const ell = (c: P, a: number, b: number) => pathD(ellipse(c, a, b, e.turn));
  // The white greys a little toward its top, under the lid's shade.
  const [w0, w1] = [S(0, -e.ry), S(0, e.ry * 0.2)];
  const big = S(e.shine.at[0], -e.shine.at[1]);
  const svg = `<defs><clipPath id="${clip}"><path d="${g.opening}"/></clipPath><clipPath id="${irisClip}"><path d="${g.irisD}"/></clipPath>` +
    `<clipPath id="${whiteClip}"><path d="${far(e.centre)}${g.irisD}" clip-rule="evenodd"/></clipPath>` +
    `<clipPath id="${bandClip}"><path d="${far(e.centre)}${bandCut}" clip-rule="evenodd"/></clipPath>` +
    `<linearGradient id="${rimFade}" gradientUnits="userSpaceOnUse" x1="${fmt(t0[0])}" y1="${fmt(t0[1])}" x2="${fmt(t1[0])}" y2="${fmt(t1[1])}">` +
    `<stop offset="0.6" stop-color="${C.eyeDark}"/><stop offset="0.92" stop-color="${C.dark}"/></linearGradient>` +
    `<linearGradient id="${lidShade}" gradientUnits="userSpaceOnUse" x1="${fmt(w0[0])}" y1="${fmt(w0[1])}" x2="${fmt(w1[0])}" y2="${fmt(w1[1])}">` +
    `<stop offset="0" stop-color="${C.dark}" stop-opacity="0.4"/><stop offset="1" stop-color="${C.dark}" stop-opacity="0"/></linearGradient>` +
    `${blur(crisp, box, 0.1)}${blur(band, box, 0.55)}${blur(glow, box, 1)}${blur(core, box, 0.55)}${blur(shineBlur, box, 0.1)}</defs>` +
    // The ball, the rim's dark all round it, and the lash line over its top, crisp.
    `<g filter="url(#${crisp})"><path d="${g.ball}" fill="url(#${rimFade})"/><path d="${lid.d}" fill="${C.eyeDark}"/></g>` +
    `<g clip-path="url(#${clip})">` +
    // The iris: near-black, its lower third the held brown with the russet glow above its foot.
    `<path d="${g.opening}" fill="${C.eyeDark}"/>` +
    `<g clip-path="url(#${irisClip})"><g filter="url(#${band})"><path d="${g.irisD}" fill="${C.dark}" clip-path="url(#${bandClip})"/></g>` +
    `<path d="${ell(glowAt, iris.a * 0.52, iris.b * 0.16)}" fill="${C.irisWarm}" opacity="1" filter="url(#${glow})"/>` +
    `<path d="${ell(coreAt, iris.a * 0.34, iris.b * 0.09)}" fill="${C.irisLight}" opacity="0.9" filter="url(#${core})"/></g>` +
    // The white beside the iris, crisp along both its edges.
    `<g clip-path="url(#${whiteClip})" filter="url(#${crisp})"><path d="${g.opening}" fill="${C.eyeWhite}"/><path d="${g.opening}" fill="url(#${lidShade})"/></g></g>` +
    // One catchlight, high on the nose's side.
    `<path d="${ell(big, e.shine.r, e.shine.r * 0.94)}" fill="${C.light}" filter="url(#${shineBlur})"/>`;
  const lidLine: DrawnLine = { kind: "outer", width: e.lid.width, where: "eye lid", drawn: lid.drawn };
  return piece(svg, box, { shapes: [], lines: [lidLine] });
}
