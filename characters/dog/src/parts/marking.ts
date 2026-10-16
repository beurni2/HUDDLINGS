// The dog's markings' own paint, one recipe for every view (DECISIONS 83): a marking is an overlay clipped to its part
// (paint.ts's marking, spec L395), soft but defined, never airbrushed; inside its own soft edge it may deepen toward
// where the sheet paints it darker (the head patches toward the ear's root) and carry a few darker fur strands (the
// saddle, the tail's root), drawn through a mask of the marking's own shape, blurred as the marking is, so nothing
// shows past its edge. Each view types its patches, their deepening and their strands from its own crop.
// The fur pass (DECISIONS 217) adds brush(): a marking's edge broken into uneven feathered strands combed along the
// fur, with a few darker strands inside it, from a fixed seed so they never shimmer, and no light streaks (the white
// hairlines the first markings carried read as scratches). A view that does not ask for it paints its markings as before.
import { area, arc, bbox, pathD, rng, sample, smooth, v, type P, type Shape } from "../../../draw/geom.ts";
import { strokeOf, type DrawnLine } from "../../../draw/line.ts";
import { LIMITS, reach } from "../../../draw/lint.ts";
import { blur, filter, mask, pad, piece, uid, type Box, type Piece } from "../../../draw/svg.ts";
import { C } from "../palette.ts";

/**
 * Paint inside a marking, through its own soft edge (a mask of its shape, blurred as the marking is), so it never
 * shows past the marking's edge. Pieces under a clip group (rig.json's clipTo) are held to their part by it as well.
 */
export function within(name: string, shape: Shape, soft: number, content: (box: Box) => string, lines: DrawnLine[] = []): Piece {
  const [x0, y0, x1, y1] = bbox(shape.segs);
  const box = pad([x0, y0, x1 - x0, y1 - y0], 2), area = pad(box, reach(soft, 0));
  const m = uid("within"), e = uid("blur");
  return piece(`<defs>${blur(e, area, soft)}${mask(m, area, `<path d="${pathD(shape.segs)}" fill="#FFFFFF" filter="url(#${e})"/>`)}</defs>` +
    `<g mask="url(#${m})">${content(box)}</g>`, box, { shapes: [], lines: lines.map((l) => ({ ...l, where: `${name} ${l.where}` })) });
}

/** Fur strands inside a marking, typed as a few nodes each, drawn as tapered inner lines in one colour, soft at their edges. */
export function strands(name: string, shape: Shape, soft: number, lines: P[][], o: { colour: string; opacity: number; width: number }): Piece {
  const drawn = lines.map((pts, k) => strokeOf(sample(smooth(pts, { closed: false }).segs, 8, false), o.width, { taper: 3, tip: 0.15, band: LIMITS.inner, wobble: 0.08, seed: 5 + k }));
  const f = uid("blur");
  return within(name, shape, soft, (box) => `<defs>${blur(f, pad(box, 2), 0.3)}</defs>` +
    `<g fill="${o.colour}" opacity="${o.opacity}" filter="url(#${f})">${drawn.map((d) => `<path d="${d.d}"/>`).join("")}</g>`,
  drawn.map((d) => ({ kind: "inner" as const, width: o.width, where: "strands", drawn: d.drawn })));
}

export interface Brush {
  /** The way the fur is combed over the marking, as a direction, or one per place. */
  flow: P | ((p: P) => P);
  /** The fixed seed its strands are laid from: one per marking, never changed, so they never shimmer between builds. */
  seed: number;
  /** How many strands feather its edge, about evenly round it but never evenly spaced. */
  edge: number;
  /** How far an edge strand runs out past the marking's edge and in from it, in points: [least, most] each. */
  out: [number, number];
  in: [number, number];
  /** An edge strand's width, in points (a painted stroke, not a line). */
  width: [number, number];
  /** The darker strands inside it: how many, how long, in what colour and how strong (inner lines, 0.6 to 0.9 pt). */
  inside: { count: number; length: [number, number]; colour: string; opacity: number; width: number };
  /** The marking's own colour, which its edge strands carry out past its edge. */
  colour: string;
  /** The edge strands' own softness and strength: soft enough to read as brushed fur, not spikes (σ 0.45 pt, 0.8 by default). */
  soft?: number;
  opacity?: number;
  /** How far inside the part's edge the strands stop, so they never cover its line (2 pt by default). */
  keep?: number;
}

/**
 * A marking's brushed edge and its darker strands (DECISIONS 217): `edge` strands laid round the patch's edge at
 * uneven spacing from a fixed seed, each combed along the fur from just inside the patch out past its edge, so the
 * edge reads as brushed fur rather than a blurred blot or a regular scallop; and `inside.count` darker strands along
 * the fur within the patch's own soft edge. All of it stays `keep` inside its part's edge, under the part's line.
 * Drawn after the marking (join it on), clipped to its part as the marking is.
 */
export function brush(name: string, on: Shape, patch: Shape, soft: number, b: Brush): Piece {
  if ([C.fur, C.light, C.furShade].includes(b.colour) || [C.fur, C.light, C.furShade].includes(b.inside.colour))
    throw new Error(`brush: ${name}'s strands are cream or white; a marking carries no light streaks (DECISIONS 217)`);
  const random = rng(b.seed);
  const between = ([lo, hi]: [number, number]) => lo + (hi - lo) * random();
  const flowAt = (p: P) => v.norm(typeof b.flow === "function" ? b.flow(p) : b.flow);
  // Round the patch's edge by length: each strand's place jittered by up to 40% of the spacing either way.
  const ring = sample(patch.segs, 24);
  const at = arc([...ring, ring[0]!]), total = at.at(-1)!;
  const cw = area(ring) > 0;
  const placeAt = (s: number) => {
    const k = Math.max(1, at.findIndex((x) => x >= s));
    const p = ring[(k - 1) % ring.length]!, q = ring[k % ring.length]!;
    const t = v.norm(v.sub(q, p));
    return { p, out: (cw ? [t[1], -t[0]] : [-t[1], t[0]]) as P };
  };
  const strokes: string[] = [];
  for (let i = 0; i < b.edge; i++) {
    const { p, out } = placeAt(((i + 0.5 + 0.8 * (random() - 0.5)) / b.edge) * total);
    const f = flowAt(p), facing = v.dot(f, out);
    const d = facing < 0 ? v.mul(f, -1) : f;
    // Where the fur runs along the edge, the strand is short; where it runs out across it, long.
    const reachOut = between(b.out) * (0.35 + 0.65 * Math.abs(facing)), reachIn = between(b.in);
    const w = between(b.width);
    const from = v.sub(p, v.mul(d, reachIn)), to = v.add(p, v.mul(d, reachOut));
    strokes.push(strokeOf([from, v.add(from, v.mul(v.sub(to, from), 0.5)), to], w, { taper: (reachIn + reachOut) / 2.5, tip: 0.1 }).d);
  }
  // The darker strands inside: places inside the patch, each combed along the fur.
  const [x0, y0, x1, y1] = bbox(patch.segs);
  const inside = (p: P) => {
    let wn = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [a, c] = [ring[i]!, ring[j]!];
      if (a[1] > p[1] !== c[1] > p[1] && p[0] < ((c[0] - a[0]) * (p[1] - a[1])) / (c[1] - a[1]) + a[0]) wn = !wn;
    }
    return wn;
  };
  const dark: { d: string; drawn: [number, number] }[] = [];
  for (let tries = 0; dark.length < b.inside.count && tries < 200; tries++) {
    const p: P = [x0 + (x1 - x0) * random(), y0 + (y1 - y0) * random()];
    if (!inside(p)) continue;
    const f = flowAt(p), half = between(b.inside.length) / 2, bend = v.mul([-f[1], f[0]], (random() - 0.5) * 0.8);
    const pts: P[] = [v.sub(p, v.mul(f, half)), v.add(p, bend), v.add(p, v.mul(f, half))];
    dark.push(strokeOf(sample(smooth(pts, { closed: false }).segs, 8, false), b.inside.width, { taper: half * 0.7, tip: 0.15, band: LIMITS.inner, wobble: 0.08, seed: 41 + dark.length }));
  }
  // All of it inside the part's edge by `keep`: the part's path eroded, as a mask, so no strand covers its line.
  const keep = b.keep ?? 2;
  const [px0, py0, px1, py1] = bbox(on.segs);
  // Its canvas is its part's, which its strands never leave.
  const partBox = pad([px0, py0, px1 - px0, py1 - py0], 2);
  const m = uid("keep"), e = uid("erode"), clip = uid("clip"), f = uid("blur"), g = uid("blur");
  const inner = within(name, patch, soft, (bx) => `<defs>${blur(f, pad(bx, 2), 0.3)}</defs>` +
    `<g fill="${b.inside.colour}" opacity="${b.inside.opacity}" filter="url(#${f})">${dark.map((s) => `<path d="${s.d}"/>`).join("")}</g>`,
  dark.map((s) => ({ kind: "inner" as const, width: b.inside.width, where: "strands", drawn: s.drawn })));
  const area2 = pad(partBox, reach(0, keep));
  return piece(`<defs><clipPath id="${clip}"><path d="${pathD(on.segs)}"/></clipPath>${filter(e, area2, `<feMorphology operator="erode" radius="${keep}"/>`)}` +
    `${mask(m, area2, `<g filter="url(#${e})"><path d="${pathD(on.segs)}" fill="#FFFFFF"/></g>`)}${blur(g, area2, b.soft ?? 0.45)}</defs>` +
    `<g clip-path="url(#${clip})"><g mask="url(#${m})"><path d="${strokes.join("")}" fill="${b.colour}" opacity="${b.opacity ?? 0.8}" filter="url(#${g})"/>${inner.svg}</g></g>`,
  partBox, { shapes: [], lines: inner.meta.lines });
}

/** A marking deepening toward one side inside its own soft edge: the tan at nothing at `from`, at `opacity` at `to`. */
export function deepen(name: string, shape: Shape, soft: number, from: P, to: P, opacity: number): Piece {
  const g = uid("deepen");
  return within(name, shape, soft, (box) => `<defs><linearGradient id="${g}" gradientUnits="userSpaceOnUse" x1="${from[0]}" y1="${from[1]}" x2="${to[0]}" y2="${to[1]}">` +
    `<stop offset="0" stop-color="${C.marking}" stop-opacity="0"/><stop offset="1" stop-color="${C.marking}" stop-opacity="${opacity}"/></linearGradient></defs>` +
    `<rect x="${box[0]}" y="${box[1]}" width="${box[2]}" height="${box[3]}" fill="url(#${g})"/>`);
}
