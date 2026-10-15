// The part-ID pass of a still (still.ts): every part drawn flat in its own colour
// wherever its alpha is 0.5 or more, so the sheet match can tell each part's
// pixels apart. The pass draws a recoloured copy of the atlas pages through the
// same renderer, so draw order and clip groups are the runtime's own.

/** The ring of repeated edge pixels around every region (characters/format/README.md, Atlas). */
export const RING = 2;

/** The first alpha byte at or above 0.5: from here a texel belongs to its part in the ID pass. */
export const ID_ALPHA = 128;

/**
 * The ID colour of the part at this index in rig.parts, so it never changes
 * between stills: hues a golden angle apart, in three saturations and three
 * values, never darker than 160 in its brightest channel, so never the black
 * background.
 */
export function idColour(index: number): [number, number, number] {
  const hue = (index * 0.6180339887498949) % 1;
  const saturation = [1, 0.65, 0.4][index % 3]!;
  const value = [1, 0.82, 0.63][Math.floor(index / 3) % 3]!;
  return hsv(hue, saturation, value);
}

function hsv(h: number, s: number, v: number): [number, number, number] {
  const f = (n: number) => {
    const k = (n + h * 6) % 6;
    return Math.round(255 * (v - v * s * Math.max(0, Math.min(k, 4 - k, 1))));
  };
  return [f(5), f(3), f(1)];
}

export const hex = (c: readonly number[]) => `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;

/** A region's rectangle on its page, and the ID colour of the part that draws it. */
export interface IdRect {
  x: number;
  y: number;
  w: number;
  h: number;
  colour: [number, number, number];
}

/**
 * A copy of an atlas page (straight RGBA) for the ID pass: inside each region and
 * its ring, a texel with alpha ID_ALPHA or more takes the region's colour at full
 * alpha; every other texel is clear. Sampled nearest, the copy draws only flat ID
 * colours, and a mask cuts where its own alpha falls below 0.5.
 */
export function recolour(page: Uint8Array | Uint8ClampedArray, width: number, height: number, rects: IdRect[]): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(width * height * 4);
  for (const r of rects) {
    for (let y = Math.max(0, r.y - RING); y < Math.min(height, r.y + r.h + RING); y++) {
      for (let x = Math.max(0, r.x - RING); x < Math.min(width, r.x + r.w + RING); x++) {
        const i = (y * width + x) * 4;
        if (page[i + 3]! < ID_ALPHA) continue;
        out.set(r.colour, i);
        out[i + 3] = 255;
      }
    }
  }
  return out;
}
