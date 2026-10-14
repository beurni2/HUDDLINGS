// SVG pieces (build time only). A piece is SVG in model space with the bounds
// it may paint and what the lint needs to know about it. Every filter and mask
// gets an explicit userSpaceOnUse region bounded to its part and
// color-interpolation-filters="sRGB": resvg's default region cuts a 4 pt blur
// to nothing, linearRGB lifts a dark edge from 135 to 193, and a rect far
// larger than the canvas under a filtered mask aborts resvg 2.6.2 (geom.rs:27).
import type { Seg } from "./geom.ts";

/** [x, y, width, height] in points. */
export type Box = [number, number, number, number];

export interface ShapeMeta {
  name: string;
  /** Nodes typed by hand. */
  nodes: number;
  segs: Seg[];
  /** Spans with an outer line, as shares of the path's length (to may be below from: the span wraps). */
  outlined: [number, number][];
  /** Spans drawn as fur. */
  fur: [number, number][];
}

export interface LineMeta {
  kind: "outer" | "inner";
  width: number;
  where: string;
}

export interface Meta {
  shapes: ShapeMeta[];
  lines: LineMeta[];
}

export interface Piece {
  svg: string;
  box: Box;
  meta: Meta;
}

export const noMeta = (): Meta => ({ shapes: [], lines: [] });

export function piece(svg: string, box: Box, meta: Meta = noMeta()): Piece {
  return { svg, box, meta };
}

export function union(a: Box, b: Box): Box {
  const x = Math.min(a[0], b[0]), y = Math.min(a[1], b[1]);
  return [x, y, Math.max(a[0] + a[2], b[0] + b[2]) - x, Math.max(a[1] + a[3], b[1] + b[3]) - y];
}

export function pad(b: Box, by: number): Box {
  return [b[0] - by, b[1] - by, b[2] + 2 * by, b[3] + 2 * by];
}

/** Pieces drawn one over the other, as one piece. */
export function join(...pieces: Piece[]): Piece {
  return {
    svg: pieces.map((p) => p.svg).join(""),
    box: pieces.map((p) => p.box).reduce(union),
    meta: { shapes: pieces.flatMap((p) => p.meta.shapes), lines: pieces.flatMap((p) => p.meta.lines) },
  };
}

const num = (n: number) => (Math.round(n * 1000) / 1000).toString();

/** x, y, width and height attributes. */
export const region = (b: Box) => `x="${num(b[0])}" y="${num(b[1])}" width="${num(b[2])}" height="${num(b[3])}"`;

let counter = 0;
/** An id unique in this process; frame.ts renames ids per drawing, so they never depend on what was drawn before. */
export function uid(stem: string): string {
  return `${stem}${++counter}`;
}

/** A filter over a bounded region, in sRGB. */
export function filter(id: string, box: Box, primitives: string): string {
  return `<filter id="${id}" filterUnits="userSpaceOnUse" ${region(box)} color-interpolation-filters="sRGB">${primitives}</filter>`;
}

export function blur(id: string, box: Box, sd: number): string {
  return filter(id, box, `<feGaussianBlur stdDeviation="${num(sd)}"/>`);
}

/** A luminance mask over a bounded region, its luminance taken in sRGB. */
export function mask(id: string, box: Box, content: string): string {
  return `<mask id="${id}" maskUnits="userSpaceOnUse" ${region(box)} color-interpolation="sRGB">${content}</mask>`;
}

/**
 * Renames every id in one drawing's SVG to prefix0, prefix1, … in order of
 * appearance, with the references to them, so an id never depends on what was
 * drawn before (the raster cache keys on the SVG) and never clashes when
 * drawings are composited into one document.
 */
export function scopeIds(svg: string, prefix: string): string {
  const names = new Map<string, string>();
  for (const [, id] of svg.matchAll(/\sid="([^"]+)"/g)) if (!names.has(id!)) names.set(id!, `${prefix}${names.size}`);
  const swap = (id: string) => names.get(id) ?? id;
  return svg
    .replace(/(\sid=")([^"]+)"/g, (_m, head: string, id: string) => `${head}${swap(id)}"`)
    .replace(/url\(#([^)]+)\)/g, (_m, id: string) => `url(#${swap(id)})`)
    .replace(/href="#([^"]+)"/g, (_m, id: string) => `href="#${swap(id)}"`);
}
