// The part-ID pass of a still (still.ts): each part's footprint, never its level.
// Every part drawn at an alpha above 0 is painted flat in its own colour wherever
// its texel's alpha is at least half its region's own largest texel alpha, so the
// sheet match can tell each part's pixels apart, soft parts included (a shadow at
// 0.18, the blush drawn at full strength and resting at its sheet level); a part
// at alpha 0 paints none. Its level is read from white.png and black.png, so the
// part's alpha never scales the cut. The pass draws a recoloured copy of the atlas
// pages through the same renderer, so draw order and clip groups are the
// runtime's own, and a part's alpha never changes what its mask lets through.

/** The ring of repeated edge pixels around every region (characters/format/README.md, Atlas). */
export const RING = 2;

/**
 * Whether a texel of alpha a (0 to 255), drawn at the part's alpha (0 to 1), belongs
 * to its part in the ID pass: a at least half its region's largest alpha, whenever the
 * part draws at all. An opaque part keeps its texels from 128 up, and a soft one its
 * own core instead of vanishing under 0.5. The part's alpha only switches the
 * footprint on or off: the blush at 0.35 keeps all of it, at 0 none.
 */
export const inPart = (a: number, most: number, alpha = 1) => a > 0 && alpha > 0 && 2 * a >= most;

/**
 * The ID pages' alpha for a texel in the footprint of a part at alpha 0 (a mask faded
 * out): the renderer's mask cut (0.05) keeps it, and the pass's colour cut (ID_CUT)
 * leaves it out, so its clip group draws as before and the part paints no ID.
 */
export const MASK_ONLY = 64;

/** The colour cut the ID pass draws with: its pages' texels are 255, MASK_ONLY or 0. */
export const ID_CUT = 0.5;

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

/** A region's rectangle on its page, the ID colour of the part that draws it, and that part's alpha in the still (1 if not given; only 0 or not matters). */
export interface IdRect {
  x: number;
  y: number;
  w: number;
  h: number;
  colour: [number, number, number];
  alpha?: number;
}

/**
 * A copy of an atlas page (straight RGBA) for the ID pass: inside each region and
 * its ring, a texel in its part's footprint (inPart, against the region's largest
 * alpha, found once from its texels) takes the region's colour at full alpha when
 * the part draws, and at MASK_ONLY when it is at alpha 0; every other texel is
 * clear. Sampled nearest and drawn with ID_CUT, the copy draws only flat ID colours,
 * and a mask cuts where its own footprint ends, whatever its alpha.
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
        out[i + 3] = inPart(page[i + 3]!, most, r.alpha ?? 1) ? 255 : MASK_ONLY;
      }
    }
  }
  return out;
}
