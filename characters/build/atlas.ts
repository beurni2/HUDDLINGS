// Rasterizes a character's parts and packs them into atlas pages
// (characters/format/README.md, Atlas): straight alpha, power-of-two pages
// up to 2048 px, regions 16 px apart with a 2 px extruded ring.
import { Resvg } from "@resvg/resvg-js";
import { PNG } from "pngjs";
import type { AtlasSet, Region } from "../../runtime-web/src/format.ts";
import type { Meta } from "../draw/svg.ts";

export const GAP = 16;
export const EXTRUDE = 2;
export const MAX_PAGE = 2048;

/** One part's drawing for one view and state: an SVG in points, and its pivot in points. */
export interface Drawing {
  region: string;
  svg: string;
  anchor: [number, number];
  /** What the drawing kit knows about it (characters/draw), for the lint. */
  meta?: Meta;
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
  // resvg would stretch a drawing to a rounded canvas; refuse one that is not whole pixels at this scale.
  const size = /<svg[^>]*\swidth="([\d.]+)"[^>]*\sheight="([\d.]+)"/.exec(drawing.svg);
  if (size) {
    for (const v of [Number(size[1]) * scale, Number(size[2]) * scale]) {
      if (Math.abs(v - Math.round(v)) > 1e-9) throw new Error(`drawing ${drawing.region}: ${size[1]} × ${size[2]} pt at scale ${scale} is not a whole number of pixels`);
    }
  }
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

export interface PageSize {
  width: number;
  height: number;
}

function nextPowerOfTwo(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/**
 * Shelf packing, tallest first, into the smallest square power-of-two pages
 * that fit. When it takes several pages, the last is cut to the smallest
 * power-of-two rectangle that holds its regions (texture memory is the budget,
 * spec L717); a set that fits one page keeps its square page.
 */
export function packRasters(rasters: Raster[]): { placed: Placed[]; pages: PageSize[] } {
  const order = [...rasters].sort((a, b) => b.h - a.h || b.w - a.w || a.region.localeCompare(b.region));
  for (const r of order) {
    if (r.w + 2 * GAP > MAX_PAGE || r.h + 2 * GAP > MAX_PAGE) throw new Error(`region ${r.region} is too big for a ${MAX_PAGE} px page`);
  }
  const area = order.reduce((sum, r) => sum + (r.w + GAP) * (r.h + GAP), 0);
  const widest = order.reduce((most, r) => Math.max(most, r.w + 2 * GAP, r.h + 2 * GAP), 0);
  let size = Math.min(MAX_PAGE, Math.max(64, nextPowerOfTwo(Math.ceil(Math.sqrt(area))), nextPowerOfTwo(widest)));
  for (;;) {
    const attempt = shelve(order, size);
    if (attempt.pages === 1 || size === MAX_PAGE) {
      const pages: PageSize[] = Array.from({ length: attempt.pages }, () => ({ width: size, height: size }));
      if (pages.length > 1) {
        const last = attempt.placed.filter((p) => p.page === pages.length - 1);
        const used = (end: (p: Placed) => number) => nextPowerOfTwo(Math.max(...last.map(end)) + GAP);
        pages[pages.length - 1] = { width: used((p) => p.x + p.raster.w), height: used((p) => p.y + p.raster.h) };
      }
      return { placed: attempt.placed, pages };
    }
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
    if (x + r.w + GAP > size || y + r.h + GAP > size) {
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
export function paintPages(placed: Placed[], sizes: PageSize[]): PNG[] {
  const pages = sizes.map((size) => new PNG({ width: size.width, height: size.height }));
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

/** Packs rasters made at one scale: the page images and their atlas set. */
export function packAtlas(name: string, rasters: Raster[], scale: number, file: (page: number) => string): { atlas: AtlasSet; images: Buffer[] } {
  const { placed, pages: sizes } = packRasters(rasters);
  const pages = paintPages(placed, sizes);
  const regions: Record<string, Region> = {};
  for (const { raster: r, page, x, y } of placed) {
    regions[r.region] = { page, x, y, w: r.w, h: r.h, anchorX: r.anchorX, anchorY: r.anchorY };
  }
  return {
    atlas: { name, scale, pages: sizes.map((size, i) => ({ file: file(i), scale, width: size.width, height: size.height })), regions },
    images: pages.map((p) => PNG.sync.write(p)),
  };
}

/** Rasterizes every drawing at a scale, in this process, and packs them. */
export function buildAtlas(name: string, drawings: Drawing[], scale: number, file: (page: number) => string): { atlas: AtlasSet; images: Buffer[] } {
  return packAtlas(name, drawings.map((d) => rasterize(d, scale)), scale, file);
}
