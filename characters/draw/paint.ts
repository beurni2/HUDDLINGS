// Painting a part (build time only), by section 5b's art rules: a flat fill; one
// soft shade away from the light and under overhangs; one soft highlight from
// the top-left light; a tapered warm outline on the outer edge only.
// The shade is a multiply colour, painted inside an isolated group that holds
// its own copy of the fill: cream #FFF4E8 times #FDEDDC gives the sheet's
// #FDE3C8, and a tan marking under the same shade gives about #D79768, so a
// patch darkens exactly like the fur around it.
import { bbox, fracAt, pathD, v, type P, type Shape } from "./geom.ts";
import { innerLine, ribbons, type Outline } from "./line.ts";
import { blur, filter, mask, pad, piece, region, uid, type Box, type LineMeta, type Piece } from "./svg.ts";

/** The light comes from the top left, a little more from above. A mirrored facing passes its own. */
export const LIGHT: P = v.norm([-1, -1.25]);

export interface Shade {
  /** The colour the fill is multiplied by where the shade falls (palette.ts derives it from the sheet's shade). */
  multiply: string;
  /** The rim away from the light: everything but the shape eroded by `inset` and moved `toLight` pt toward the light. */
  rim?: { inset: number; toLight: number };
  /** Shade under overhangs, as path data in model space. */
  shapes?: string[];
  /** Where no shade falls (a feathered join is not an outer edge), as path data. */
  keep?: string[];
  /** A light group: the rim is found on the union of these shapes, so parts that join share one light. */
  group?: Shape[];
  /** σ of the one blur, in points; at least 1.5 so the 2x and 3x sets agree. */
  blur: number;
}

export interface Highlight {
  colour: string;
  opacity: number;
  blur: number;
  /** Placed from the light: the shape eroded by `inset`, minus itself moved `toLight` pt away from the light. */
  auto?: { inset: number; toLight: number };
  /** Or a shape placed by hand, as path data, for one highlight across a light group. */
  d?: string;
}

export interface Paint {
  fill: string;
  shade?: Shade;
  highlight?: Highlight;
  outline?: Outline;
  inner?: { pts: P[]; width: number; colour: string; opacity?: number }[];
  /** Layers painted over the fill and under the shade (a collar's keeper), in model space. */
  under?: string;
  /** A feathered join: the part fades in from transparent at `from` to opaque at `to`, for an end that lies on its own fur. */
  feather?: { from: P; to: P };
  light?: P;
}

const xy = (p: P) => `${(Math.round(p[0] * 1000) / 1000).toString()} ${(Math.round(p[1] * 1000) / 1000).toString()}`;

/** How far past the part's bounds its filters and masks reach. */
function reachOf(paint: Paint): number {
  const s = paint.shade, h = paint.highlight;
  return Math.max(2, s ? 3 * s.blur + (s.rim?.toLight ?? 0) + (s.rim?.inset ?? 0) : 0, h ? 3 * h.blur + (h.auto?.toLight ?? 0) : 0);
}

/** The shade's mask: the rim and the overhang shapes, minus the keep zones, through one blur. */
function shadeMask(shape: Shape, s: Shade, light: P, area: Box): { defs: string; id: string } {
  const id = uid("shade"), soft = uid("blur");
  let defs = blur(soft, area, s.blur);
  let content = "";
  if (s.rim) {
    const erode = uid("erode");
    const [dx, dy] = v.mul(light, s.rim.toLight);
    defs += filter(erode, area, `<feMorphology operator="erode" radius="${s.rim.inset}"/>`);
    const lit = (s.group ?? [shape]).map((g) => `<path d="${pathD(g.segs)}" fill="#000000"/>`).join("");
    content += `<rect ${region(area)} fill="#FFFFFF"/><g filter="url(#${erode})"><g transform="translate(${xy([dx, dy])})">${lit}</g></g>`;
  }
  for (const d of s.shapes ?? []) content += `<path d="${d}" fill="#FFFFFF"/>`;
  for (const d of s.keep ?? []) content += `<path d="${d}" fill="#000000"/>`;
  return { defs: defs + mask(id, area, `<g filter="url(#${soft})">${content}</g>`), id };
}

/** The highlight: from the light, or a hand-placed shape. */
function highlight(shape: Shape, h: Highlight, light: P, area: Box): string {
  const soft = uid("blur");
  let defs = blur(soft, area, h.blur);
  if (h.d) return `<defs>${defs}</defs><path d="${h.d}" fill="${h.colour}" opacity="${h.opacity}" filter="url(#${soft})"/>`;
  // The shape inset, minus itself moved away from the light: a lit crescent on the side toward the light, whichever way the part faces.
  const auto = h.auto ?? { inset: 3, toLight: 5 };
  const id = uid("lit"), erode = uid("erode");
  const d = pathD(shape.segs);
  defs += filter(erode, area, `<feMorphology operator="erode" radius="${auto.inset}"/>`) +
    mask(id, area, `<g filter="url(#${soft})"><g filter="url(#${erode})"><path d="${d}" fill="#FFFFFF"/></g>` +
      `<path d="${d}" fill="#000000" transform="translate(${xy(v.mul(light, -auto.toLight))})"/></g>`);
  return `<defs>${defs}</defs><rect ${region(area)} fill="${h.colour}" opacity="${h.opacity}" mask="url(#${id})"/>`;
}

/** Paint that sits inside the part's clip: the fill and its shade, the highlight, inner lines, the outline. */
function layers(name: string, shape: Shape, paint: Paint, fill: string, area: Box, fillBox = area): { defs: string; body: string; lines: LineMeta[]; outlined: [number, number][] } {
  const light = paint.light ?? LIGHT;
  let defs = "";
  // The isolated group carries its own copy of the fill, so the multiply darkens the fill and nothing behind the part.
  // It fills a rect: the clip around it draws the edge once, so the edge's coverage is the path's own, never squared.
  let shaded = `<rect ${region(fillBox)} fill="${fill}"/>${paint.under ?? ""}`;
  if (paint.shade) {
    const m = shadeMask(shape, paint.shade, light, area);
    defs += m.defs;
    shaded += `<rect ${region(area)} fill="${paint.shade.multiply}" mask="url(#${m.id})" style="mix-blend-mode:multiply"/>`;
  }
  let body = `<g style="isolation:isolate">${shaded}</g>`;
  if (paint.highlight) body += highlight(shape, paint.highlight, light, area);
  const lines: LineMeta[] = [];
  for (const line of paint.inner ?? []) {
    const l = innerLine(line.pts, line.width, line.colour, { opacity: line.opacity });
    body += l.svg;
    lines.push({ ...l.line, where: name });
  }
  let outlined: [number, number][] = [];
  if (paint.outline) {
    const o = paint.outline;
    const r = ribbons(shape, o, name);
    lines.push(...r.lines);
    outlined = r.outlined;
    let attrs = `fill="${o.colour}"`;
    if (o.blur) {
      const soft = uid("blur");
      defs += blur(soft, area, o.blur);
      attrs += ` filter="url(#${soft})"`;
    }
    body += `<g ${attrs}>${r.svg}</g>`;
  }
  return { defs, body, lines, outlined };
}

const shapeBox = (shape: Shape): Box => {
  const [x0, y0, x1, y1] = bbox(shape.segs);
  return [x0, y0, x1 - x0, y1 - y0];
};

/** A feathered join: a mask fading from transparent at `from` to opaque at `to`. */
function feather(f: NonNullable<Paint["feather"]>, area: Box): { defs: string; id: string } {
  const id = uid("feather"), g = uid("fade");
  const [a, b] = [f.from, f.to];
  // The gradient lives inside the mask: it is luminance, not paint.
  const fade = `<linearGradient id="${g}" gradientUnits="userSpaceOnUse" x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}">` +
    `<stop offset="0" stop-color="#000000"/><stop offset="1" stop-color="#FFFFFF"/></linearGradient>`;
  return { id, defs: mask(id, area, `${fade}<rect ${region(area)} fill="url(#${g})"/>`) };
}

/** One part: its shape painted and clipped to itself, so its silhouette is exactly the path. */
export function part(name: string, shape: Shape, paint: Paint): Piece {
  const box = pad(shapeBox(shape), 1);
  const area = pad(box, reachOf(paint));
  const clip = uid("clip");
  const l = layers(name, shape, paint, paint.fill, area);
  let defs = `<clipPath id="${clip}"><path d="${pathD(shape.segs)}"/></clipPath>${l.defs}`;
  let svg = `<g clip-path="url(#${clip})">${l.body}</g>`;
  if (paint.feather) {
    const f = feather(paint.feather, area);
    defs += f.defs;
    svg = `<g mask="url(#${f.id})">${svg}</g>`;
  }
  return piece(`<defs>${defs}</defs>${svg}`, box, {
    shapes: [{ name, nodes: shape.typed, segs: shape.segs, outlined: l.outlined, fur: shape.fur.map(([a, b]) => [fracAt(shape, a), fracAt(shape, b)]) }],
    lines: l.lines,
  });
}

/**
 * A marking: an overlay part clipped to the part it lies on (spec L395),
 * pre-shaded with that part's own paint so the shade runs on across it. Its
 * colour shows through its own soft-edged shape, typed with about 4 pt of bleed
 * past the part's edge. A marking that never slides (`clip`) is also clipped to
 * the part's path here and carries the part's outline over itself, so the edge
 * is the part's own; one that slides with the fake turn (head patches) relies
 * on the runtime's stencil, and head.line restores the edge over it.
 */
export function marking(name: string, on: { shape: Shape; paint: Paint }, patch: Shape, opts: { fill: string; blur: number; clip: boolean; fade?: Fade }): Piece {
  const patchBox = pad(shapeBox(patch), 3 * opts.blur);
  const box = opts.clip ? pad(shapeBox(on.shape), 1) : pad(patchBox, 1);
  const paint: Paint = { ...on.paint, inner: undefined, under: undefined, feather: undefined, outline: opts.clip ? on.paint.outline : undefined };
  const area = pad(box, reachOf(paint));
  // Clipped, the colour fills the part; sliding, it fills the patch's own bounds, bleed and all.
  const l = layers(name, on.shape, paint, opts.fill, area, opts.clip ? area : patchBox);
  const shows = uid("patch"), soft = uid("blur"), clip = uid("clip");
  // A faded patch shows through a gradient that lives inside its mask: luminance, not paint.
  let shown = `<path d="${pathD(patch.segs)}" fill="#FFFFFF" filter="url(#${soft})"/>`;
  if (opts.fade) {
    const g = uid("fade");
    shown = fadeGradient(g, opts.fade) + shown.replace('fill="#FFFFFF"', `fill="url(#${g})"`);
  }
  let defs = l.defs + blur(soft, area, opts.blur) + mask(shows, area, shown);
  let body = l.body;
  if (opts.clip) {
    defs += `<clipPath id="${clip}"><path d="${pathD(on.shape.segs)}"/></clipPath>`;
    body = `<g clip-path="url(#${clip})">${body}</g>`;
  }
  return piece(`<defs>${defs}</defs><g mask="url(#${shows})">${body}</g>`, box, {
    shapes: [{ name, nodes: patch.typed, segs: patch.segs, outlined: [], fur: [] }],
    lines: l.lines,
  });
}

/** A marking that fades: fully shown at `from`, gone at `to`, along the line between them (the sheet's head patches fading toward the nose). */
export interface Fade {
  from: P;
  to: P;
}

/** A luminance gradient for a mask, white at a fade's `from` and black at its `to`. */
function fadeGradient(id: string, f: Fade): string {
  return `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${xy(f.from).replace(" ", '" y1="')}" x2="${xy(f.to).replace(" ", '" y2="')}">` +
    `<stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#000000"/></linearGradient>`;
}

/**
 * A painted fur grain (build time only; spec 5b, Paint at build time): seeded fractal noise, stretched along the
 * fur, that lightens the fill under it toward `light` where the noise runs above its middle and darkens it toward
 * `dark` where it runs below, each by at most about `amount` of the way, so a flat fill reads as soft painted fur
 * and keeps its own colour as its mean. The noise lives in model space (`scale` is its feature size in points,
 * across and along the fur), so a part's grain is the same pattern at every pixel density, and its fixed seed
 * never changes between builds. It is drawn over `box`; put it in a part's `under`, inside the part's clip.
 */
export function grain(box: Box, o: { light: string; dark: string; amount: number; scale: [number, number]; seed: number }): string {
  const lit = uid("grain"), dim = uid("grain");
  // fractalNoise runs about 0.5 ± 0.25: a deviation of 0.25 reaches the full amount.
  const k = o.amount / 0.25;
  const n = (v: number) => (Math.round(v * 10000) / 10000).toString();
  const noise = `<feTurbulence type="fractalNoise" baseFrequency="${n(1 / o.scale[0])} ${n(1 / o.scale[1])}" numOctaves="2" seed="${o.seed}" result="n"/>`;
  const layer = (id: string, colour: string, sign: number) => filter(id, box, noise +
    `<feColorMatrix in="n" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 ${n(sign * k)} 0 0 0 ${n(-sign * k * 0.5)}" result="a"/>` +
    `<feFlood flood-color="${colour}" result="c"/><feComposite in="c" in2="a" operator="in"/>`);
  return `<defs>${layer(lit, o.light, 1)}${layer(dim, o.dark, -1)}</defs>` +
    `<rect ${region(box)} filter="url(#${lit})"/><rect ${region(box)} filter="url(#${dim})"/>`;
}

/** A soft shape with no line: the ground shadow, a cast shadow, the blush. */
export function soft(d: string, box: Box, colour: string, sd: number, opacity = 1): Piece {
  const f = uid("blur");
  const area = pad(box, 3 * sd);
  const alpha = opacity === 1 ? "" : ` opacity="${opacity}"`;
  return piece(`<defs>${blur(f, area, sd)}</defs><path d="${d}" fill="${colour}"${alpha} filter="url(#${f})"/>`, pad(box, 3 * sd));
}

// Colours derived by rule from a species' palette, so palette.ts can list every colour a part paints.

const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const hexOf = (c: number[]) => "#" + c.map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, "0")).join("").toUpperCase();

/** a, moved a share t of the way to b, channel by channel. */
export const mix = (a: string, b: string, t: number) => hexOf(channels(a).map((x, i) => x + (channels(b)[i]! - x) * t));

/** The colour k darker in every channel (the spec's shade is the fill 8 to 12% darker). */
export const darken = (hex: string, k: number) => hexOf(channels(hex).map((x) => x * (1 - k)));

/** The multiply colour that turns `base` into `shaded`: #FFF4E8 into #FDE3C8 is #FDEDDC. */
export const ratio = (base: string, shaded: string) => hexOf(channels(base).map((x, i) => (channels(shaded)[i]! / x) * 255));

/** a multiplied by b, channel by channel: what a multiply shade of colour b turns a fill of colour a into. */
export const multiply = (a: string, b: string) => hexOf(channels(a).map((x, i) => (x * channels(b)[i]!) / 255));
