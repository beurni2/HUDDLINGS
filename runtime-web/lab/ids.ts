// The part-ID pass of a still (still.ts): every part drawn flat in its own colour
// wherever its alpha is at least half its region's own largest alpha, so the
// sheet match can tell each part's pixels apart, soft parts included (the
// ground shadow at 0.18, the blush at its level, shadow.chin). The pass draws a
// recoloured copy of the atlas pages through the same renderer, so draw order
// and clip groups are the runtime's own.

/** The ring of repeated edge pixels around every region (characters/format/README.md, Atlas). */
export const RING = 2;

/**
 * Whether a texel of alpha a (0 to 255) belongs to its part in the ID pass: at
 * least half its region's largest alpha. An opaque part keeps its texels from
 * 128 up; a soft one keeps its own core instead of vanishing under 0.5.
 */
export const inPart = (a: number, most: number) => a > 0 && 2 * a >= most;

/** The largest alpha among a region's own texels (its ring only repeats its edge). */
export function largestAlpha(page: Uint8Array | Uint8ClampedArray, width: number, r: { x: number; y: number; w: number; h: number }): number {
  let most = 0;
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) most = Math.max(most, page[(y * width + x) * 4 + 3]!);
  return most;
}

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
 * its ring, a texel in its part (inPart, against the region's largest alpha,
 * found once from its texels) takes the region's colour at full alpha; every
 * other texel is clear. Sampled nearest, the copy draws only flat ID colours, and
 * a mask cuts where its own part ends.
 */
export function recolour(page: Uint8Array | Uint8ClampedArray, width: number, height: number, rects: IdRect[]): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(width * height * 4);
  for (const r of rects) {
    const most = largestAlpha(page, width, r);
    for (let y = Math.max(0, r.y - RING); y < Math.min(height, r.y + r.h + RING); y++) {
      for (let x = Math.max(0, r.x - RING); x < Math.min(width, r.x + r.w + RING); x++) {
        const i = (y * width + x) * 4;
        if (!inPart(page[i + 3]!, most)) continue;
        out.set(r.colour, i);
        out[i + 3] = 255;
      }
    }
  }
  return out;
}
