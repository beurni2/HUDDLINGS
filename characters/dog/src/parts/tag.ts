// The dog's heart tag, one recipe for every view (DECISIONS 84), as the turnaround's tags paint it: matte gold in the
// printed tag colour (held by the palette check), warming toward orange in its soft shade along the lower right, away
// from the light; two smaller hearts embossed in it as concentric warm lines (the sheet's #E7AE42 rings); one small
// soft light on the upper left lobe, never a glossy streak; and a warm gold-brown rim line, never an olive one. Each
// view types the heart's shape, its embossed hearts and its light from its own crop.
import { sample, type P, type Shape } from "../../../draw/geom.ts";
import type { Paint } from "../../../draw/paint.ts";
import { C } from "../palette.ts";

export interface TagSpec {
  /** The embossed hearts inside the tag, from the outer to the inner, closed. */
  emboss: Shape[];
  /** The soft light on the upper left lobe, as path data. */
  light: string;
  /** Shade beyond the rim's, as path data (a turned coin's edge). */
  shade?: string[];
  /** The rim line's width, 1.2 to 1.4 pt. */
  rim?: number;
  /** How far the shade's rim reaches in from the edge away from the light (a small turned coin takes less). */
  shadeRim?: { inset: number; toLight: number };
}

/** The tag's paint (its line is its outline). */
export function tagPaint(t: TagSpec): Paint {
  const ring = (s: Shape): P[] => {
    const pts = sample(s.segs, 10);
    return [...pts, pts[0]!];
  };
  return {
    fill: C.tag,
    // The rim away from the light in the gold's own warm shade, deeper toward orange, as the sheet's gold darkens.
    shade: { multiply: C.tagShadeBy, rim: t.shadeRim ?? { inset: 1.2, toLight: 2.2 }, shapes: t.shade ?? [], blur: 1.2 },
    highlight: { d: t.light, colour: C.tagShine, opacity: 0.4, blur: 1.4 },
    // The embossed hearts' rings, the outer one the stronger.
    inner: t.emboss.map((s, k) => ({ pts: ring(s), width: 0.7, colour: C.tagEmboss, opacity: k === 0 ? 0.95 : 0.75 })),
    outline: { colour: C.tagEdge, width: t.rim ?? 1.3, taper: 2, blur: 0.25 },
  };
}
