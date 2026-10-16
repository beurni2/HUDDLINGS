// The reference the rest-frame tests hold the runtimes to: each of a view's
// model-space drawings rendered by resvg on one canvas and composited in draw
// order, premultiplied "over", with the runtimes' stencil rule for clip groups (a
// clipped part shows where its mask's alpha is 0.05 or more).
import { Resvg } from "@resvg/resvg-js";
import { PNG } from "pngjs";
import { scopeIds, type Piece } from "../svg.ts";

/** The model-space canvas, in whole points: the dog with room around it. */
export const BOX = { x: -100, y: -180, w: 200, h: 190 };

export interface Layer {
  /** Straight RGBA on the canvas. */
  rgba: Uint8Array;
  clipTo?: string;
  part: string;
  /** The part's alpha (its rest alpha in a rest frame, 1 when the rig gives none), multiplying its texels' (format README, Rendering). */
  alpha?: number;
}

/**
 * Premultiplied over, with the stencil: a clipped layer shows only where its mask's alpha is 0.05 or more, whatever
 * the mask's own part alpha; each layer drawn at its part's alpha.
 */
export function composite(layers: Layer[], w: number, h: number): Float64Array {
  const out = new Float64Array(w * h * 4);
  const byPart = new Map(layers.map((l) => [l.part, l]));
  for (const layer of layers) {
    const mask = layer.clipTo ? byPart.get(layer.clipTo)!.rgba : undefined;
    for (let i = 0; i < w * h; i++) {
      if (mask && mask[i * 4 + 3]! / 255 < 0.05) continue;
      const a = (layer.rgba[i * 4 + 3]! / 255) * (layer.alpha ?? 1);
      for (let k = 0; k < 3; k++) out[i * 4 + k] = (layer.rgba[i * 4 + k]! / 255) * a + out[i * 4 + k]! * (1 - a);
      out[i * 4 + 3] = a + out[i * 4 + 3]! * (1 - a);
    }
  }
  return out;
}

/** The largest and the mean difference between two composites, in 255ths. */
export function difference(a: Float64Array, b: Float64Array): { mean: number; worst: number } {
  let sum = 0, worst = 0;
  for (let i = 0; i < a.length; i++) {
    const d = Math.abs(a[i]! - b[i]!) * 255;
    sum += d;
    worst = Math.max(worst, d);
  }
  return { mean: sum / a.length, worst };
}

/** The model-space drawings of the parts in order, each rendered by resvg on BOX at a scale, at its part's alpha where `alphaOf` gives one. */
export function resvgLayers(order: string[], pieces: Map<string, Piece>, clipOf: (part: string) => string | undefined, scale: number,
  alphaOf: (part: string) => number | undefined = () => undefined): Layer[] {
  return order.map((part) => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${BOX.w}" height="${BOX.h}" viewBox="${BOX.x} ${BOX.y} ${BOX.w} ${BOX.h}">` +
      `${scopeIds(pieces.get(part)!.svg, "p")}</svg>`;
    const png = PNG.sync.read(new Resvg(svg, { fitTo: { mode: "zoom", value: scale }, background: "rgba(0,0,0,0)" }).render().asPng());
    const clipTo = clipOf(part), alpha = alphaOf(part);
    return { rgba: png.data, part, ...(clipTo ? { clipTo } : {}), ...(alpha !== undefined ? { alpha } : {}) };
  });
}
