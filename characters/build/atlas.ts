// Rasterizes a character's parts and packs them into atlas pages
// (characters/format/README.md, Atlas): straight alpha, power-of-two pages
// up to 2048 px, regions 16 px apart with a 2 px extruded ring.
import { Resvg } from "@resvg/resvg-js";
import { PNG } from "pngjs";
import type { Atlas, Region } from "../../runtime-web/src/format.ts";

export const GAP = 16;
export const EXTRUDE = 2;
export const MAX_PAGE = 2048;

/** One part's drawing for one view and state: an SVG in points, and its pivot in points. */
export interface Drawing {
  region: string;
  svg: string;
  anchor: [number, number];
}

export interface Raster {
  region: string;
  w: number;
  h: number;
  /** Straight (non-premultiplied) RGBA. */
  data: Buffer;
  anchorX: number;
  anchorY: number;
}

/** Renders a drawing at a scale (pixels per point) and trims it to its visible pixels. */
export function rasterize(drawing: Drawing, scale: number): Raster {
  // resvg's raw pixels are premultiplied; its PNG is straight alpha, as the atlas needs.
  const rendered = new Resvg(drawing.svg, { fitTo: { mode: "zoom", value: scale }, background: "rgba(0,0,0,0)" }).render();
  const png = PNG.sync.read(rendered.asPng());
  const { width, height, data } = png;
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3]! > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) {
    minX = minY = 0;
    maxX = maxY = 0;
  }
  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  const trimmed = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) data.copy(trimmed, y * w * 4, ((y + minY) * width + minX) * 4, ((y + minY) * width + minX + w) * 4);
  return { region: drawing.region, w, h, data: trimmed, anchorX: drawing.anchor[0] * scale - minX, anchorY: drawing.anchor[1] * scale - minY };
}

interface Placed {
  raster: Raster;
  page: number;
  x: number;
  y: number;
}

function nextPowerOfTwo(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/** Shelf packing, tallest first, into the smallest square power-of-two pages that fit. */
export function packRasters(rasters: Raster[]): { placed: Placed[]; sizes: number[] } {
  const order = [...rasters].sort((a, b) => b.h - a.h || b.w - a.w || a.region.localeCompare(b.region));
  for (const r of order) {
    if (r.w + 2 * GAP > MAX_PAGE || r.h + 2 * GAP > MAX_PAGE) throw new Error(`region ${r.region} is too big for a ${MAX_PAGE} px page`);
  }
  const area = order.reduce((sum, r) => sum + (r.w + GAP) * (r.h + GAP), 0);
  let size = Math.min(MAX_PAGE, Math.max(64, nextPowerOfTwo(Math.ceil(Math.sqrt(area)))));
  for (;;) {
    const attempt = shelve(order, size);
    if (attempt.pages === 1 || size === MAX_PAGE) return { placed: attempt.placed, sizes: Array(attempt.pages).fill(size) };
    size *= 2;
  }
}

function shelve(order: Raster[], size: number): { placed: Placed[]; pages: number } {
  const placed: Placed[] = [];
  let page = 0, x = GAP, y = GAP, shelf = 0;
  for (const r of order) {
    if (x + r.w + GAP > size) {
      x = GAP;
      y += shelf + GAP;
      shelf = 0;
    }
    if (y + r.h + GAP > size) {
      page++;
      x = GAP;
      y = GAP;
      shelf = 0;
    }
    placed.push({ raster: r, page, x, y });
    x += r.w + GAP;
    shelf = Math.max(shelf, r.h);
  }
  return { placed, pages: page + 1 };
}

/** Writes the placed rasters into page images, extruding each region's edge pixels by EXTRUDE px. */
export function paintPages(placed: Placed[], sizes: number[]): PNG[] {
  const pages = sizes.map((size) => new PNG({ width: size, height: size }));
  for (const page of pages) page.data.fill(0);
  for (const { raster: r, page, x, y } of placed) {
    const target = pages[page]!;
    for (let dy = -EXTRUDE; dy < r.h + EXTRUDE; dy++) {
      const sy = Math.min(Math.max(dy, 0), r.h - 1);
      for (let dx = -EXTRUDE; dx < r.w + EXTRUDE; dx++) {
        const sx = Math.min(Math.max(dx, 0), r.w - 1);
        const from = (sy * r.w + sx) * 4;
        const to = ((y + dy) * target.width + (x + dx)) * 4;
        r.data.copy(target.data, to, from, from + 4);
      }
    }
  }
  return pages;
}

/** Rasterizes every drawing at a scale and packs them: the page images and their atlas entries. */
export function buildAtlas(drawings: Drawing[], scale: number, file: (page: number) => string): { atlas: Atlas; images: Buffer[] } {
  const rasters = drawings.map((d) => rasterize(d, scale));
  const { placed, sizes } = packRasters(rasters);
  const pages = paintPages(placed, sizes);
  const regions: Record<string, Region> = {};
  for (const { raster: r, page, x, y } of placed) {
    regions[r.region] = { page, x, y, w: r.w, h: r.h, anchorX: r.anchorX, anchorY: r.anchorY };
  }
  return {
    atlas: { pages: sizes.map((size, i) => ({ file: file(i), scale, width: size, height: size })), regions },
    images: pages.map((p) => PNG.sync.write(p)),
  };
}
