// The drawing lint (build time only): the build fails on any drawing that
// breaks the art rules it can check (spec section 5b, Art rules) or that resvg
// may draw wrongly or not at all.
import type { Drawing } from "../build/atlas.ts";
import { arc, minRadius, onSpan, sample } from "./geom.ts";

export const LIMITS = {
  /** Hand nodes in one shape: 8 to 20 is the aim. */
  nodes: 24,
  /** Outer lines, in points (spec L506). */
  outer: [1.2, 1.8] as [number, number],
  /** Inner lines, in points. */
  inner: [0.6, 0.9] as [number, number],
  /** No convex corner tighter than this on an outlined edge, outside fur (spec L510). */
  cornerPt: 4,
};

export interface LintRules {
  /** Every colour a drawing may paint (#RRGGBB): the species' palette.ts. */
  palette?: string[];
  /** Parts allowed a convex corner tighter than 4 pt on an outlined edge, each with its reason. */
  corners?: Record<string, string>;
}

const COLOUR_ATTRS = ["fill", "stroke", "stop-color", "flood-color", "lighting-color"];

function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [, k, value] of tag.matchAll(/\s([\w:-]+)="([^"]*)"/g)) out[k!] = value!;
  return out;
}

const isNumber = (s: string | undefined) => s !== undefined && /^-?\d+(\.\d+)?$/.test(s);
const inBand = (w: number, [lo, hi]: [number, number]) => w >= lo - 1e-9 && w <= hi + 1e-9;

/** Every problem with one drawing, as readable lines. */
export function lintDrawing(d: Drawing, rules: LintRules = {}): string[] {
  const problems: string[] = [];
  const say = (what: string) => problems.push(`${d.region}: ${what}`);
  const svg = d.svg;
  if (/<image\b/i.test(svg)) say("has an <image> element; parts are drawn, never pasted (rule R8)");
  if (/data:/i.test(svg)) say("has a data: URI; parts are drawn, never pasted (rule R8)");

  // The canvas: a whole number of points, so every set's scale gives whole pixels.
  const root = attrs(/<svg\b[^>]*>/.exec(svg)?.[0] ?? "");
  const view = (root.viewBox ?? "").split(/\s+/).map(Number);
  if (!/^\d+$/.test(root.width ?? "") || !/^\d+$/.test(root.height ?? "")) say(`canvas ${root.width} × ${root.height} is not whole points`);
  if (view.length !== 4 || view.some((n) => !Number.isFinite(n)) || view[2] !== Number(root.width) || view[3] !== Number(root.height))
    say(`viewBox "${root.viewBox}" does not match the canvas`);
  const [vx = 0, vy = 0, vw = 0, vh = 0] = view;
  // Regions and rects stay near the canvas: a far larger rect under a filtered mask aborts resvg 2.6.2.
  const margin = Math.max(16, 0.25 * Math.max(vw, vh));
  const bounded = (a: Record<string, string>) =>
    [a.x, a.y, a.width, a.height].every(isNumber) &&
    Number(a.x) >= vx - margin && Number(a.y) >= vy - margin &&
    Number(a.x) + Number(a.width) <= vx + vw + margin && Number(a.y) + Number(a.height) <= vy + vh + margin;
  for (const [tag] of svg.matchAll(/<filter\b[^>]*>/g)) {
    const a = attrs(tag);
    if (a.filterUnits !== "userSpaceOnUse" || !bounded(a)) say(`filter ${a.id} needs an explicit userSpaceOnUse region bounded to the part`);
    if (a["color-interpolation-filters"] !== "sRGB") say(`filter ${a.id} needs color-interpolation-filters="sRGB"`);
  }
  for (const [tag] of svg.matchAll(/<mask\b[^>]*>/g)) {
    const a = attrs(tag);
    if (a.maskUnits !== "userSpaceOnUse" || !bounded(a)) say(`mask ${a.id} needs an explicit userSpaceOnUse region bounded to the part`);
  }
  for (const [tag] of svg.matchAll(/<rect\b[^>]*>/g)) {
    if (!bounded(attrs(tag))) say(`a rect reaches far past the canvas: ${tag.slice(0, 80)}`);
  }

  if (rules.palette) {
    // Masks and clip paths hold luminance and geometry, not paint.
    const painted = svg.replace(/<mask\b[\s\S]*?<\/mask>/g, "").replace(/<clipPath\b[\s\S]*?<\/clipPath>/g, "");
    const palette = new Set(rules.palette.map((c) => c.toUpperCase()));
    const values = [
      ...[...painted.matchAll(new RegExp(`\\s(${COLOUR_ATTRS.join("|")})="([^"]*)"`, "g"))].map((m) => m[2]!),
      ...[...painted.matchAll(new RegExp(`(?:${COLOUR_ATTRS.join("|")})\\s*:\\s*([^;"]+)`, "g"))].map((m) => m[1]!.trim()),
    ];
    for (const value of new Set(values)) {
      if (value === "none" || value.startsWith("url(#")) continue;
      if (!/^#[0-9a-fA-F]{6}$/.test(value) || !palette.has(value.toUpperCase())) say(`colour ${value} is not in the species' palette`);
    }
    for (const [, w] of painted.matchAll(/stroke-width="([^"]*)"/g)) {
      if (!inBand(Number(w), LIMITS.outer) && !inBand(Number(w), LIMITS.inner)) say(`a stroke ${w} pt wide is neither an outer line (1.2 to 1.8) nor an inner one (0.6 to 0.9)`);
    }
  }

  const part = d.region.split("/")[0]!;
  for (const shape of d.meta?.shapes ?? []) {
    if (shape.nodes > LIMITS.nodes) say(`shape ${shape.name} has ${shape.nodes} hand nodes (at most ${LIMITS.nodes})`);
    if (!shape.outlined.length || rules.corners?.[part]) continue;
    // A fur span's own ends (where a lock rises from the base) count as fur, 1.5 pt either way.
    const pts = sample(shape.segs, 32);
    const length = arc([...pts, pts[0]!]).at(-1)!;
    const slack = 1.5 / length;
    const keep = (f: number) =>
      shape.outlined.some(([a, b]) => onSpan(f, a, b)) && !shape.fur.some(([a, b]) => onSpan(f, (a - slack + 1) % 1, (b + slack) % 1));
    const { convex } = minRadius(shape.segs, keep);
    if (convex.r < LIMITS.cornerPt)
      say(`shape ${shape.name} turns a ${convex.r.toFixed(2)} pt convex corner at (${convex.at.map((n) => n.toFixed(1)).join(", ")}) on an outlined edge (at least ${LIMITS.cornerPt} pt outside fur)`);
  }
  for (const line of d.meta?.lines ?? []) {
    const band = line.kind === "outer" ? LIMITS.outer : LIMITS.inner;
    if (!inBand(line.width, band)) say(`${line.kind} line ${line.width} pt in ${line.where} is outside ${band[0]} to ${band[1]} pt`);
  }
  return problems;
}

/** Every problem with a set of drawings. */
export function lint(drawings: Drawing[], rules: LintRules = {}): string[] {
  return drawings.flatMap((d) => lintDrawing(d, rules));
}
