// From model space to a bone's space (build time only). Parts are drawn in
// model.json's space (points, the ground under the seat at 0, 0, y down); each
// drawing is wrapped in the inverse of its bone's rest transform, as the
// runtime computes it (runtime-web/src/rig.ts), so the anchor always comes from
// the pivot in rig.json and is never typed by hand (a hand-typed anchor once
// drew a part 508 px off).
import type { Drawing } from "../build/atlas.ts";
import type { Rig } from "../../runtime-web/src/format.ts";
import { apply, invert, type Affine } from "../../runtime-web/src/math.ts";
import { compile, evaluatePose, partMatrix } from "../../runtime-web/src/rig.ts";
import { scopeIds, type Piece } from "./svg.ts";

/** A bone's rest transform in a view: its frame and its own scale, from bone space to model space. */
export function restTransform(rig: Rig, bone: string, view: string): Affine {
  const c = compile(rig);
  const i = c.index.get(bone);
  if (i === undefined) throw new Error(`no bone ${bone}`);
  return partMatrix(evaluatePose(c, { channels: {}, views: { body: view, head: view } }), i);
}

const num = (n: number) => (Math.round(n * 1e9) / 1e9).toString();

/**
 * One part's drawing for a view (and a state) as an atlas drawing. The canvas is
 * a whole number of points; it sits on whole model points when the bone is not
 * turned at rest, so the runtime's rest frame lands on the same pixels as the
 * model-space drawing.
 */
export function toBone(partName: string, rig: Rig, view: string, drawn: Piece, state?: string): Drawing {
  const part = rig.parts.find((p) => p.name === partName);
  if (!part) throw new Error(`no part ${partName} in the rig`);
  const m = restTransform(rig, part.bone, view);
  const pivot: [number, number] = [m.tx, m.ty];
  // The drawing's frame is the bone's space moved so the pivot keeps its model-space place.
  const inv = invert(m);
  const t: Affine = { ...inv, tx: inv.tx + pivot[0], ty: inv.ty + pivot[1] };
  const moved = Math.abs(t.a - 1) + Math.abs(t.b) + Math.abs(t.c) + Math.abs(t.d - 1) + Math.abs(t.tx) + Math.abs(t.ty) > 1e-9;
  const [bx, by, bw, bh] = drawn.box;
  const corners = [apply(t, bx, by), apply(t, bx + bw, by), apply(t, bx, by + bh), apply(t, bx + bw, by + bh)];
  const x = Math.floor(Math.min(...corners.map((p) => p[0])) + 1e-9);
  const y = Math.floor(Math.min(...corners.map((p) => p[1])) + 1e-9);
  const w = Math.ceil(Math.max(...corners.map((p) => p[0])) - 1e-9) - x;
  const h = Math.ceil(Math.max(...corners.map((p) => p[1])) - 1e-9) - y;
  const body = moved ? `<g transform="matrix(${[t.a, t.b, t.c, t.d, t.tx, t.ty].map(num).join(" ")})">${drawn.svg}</g>` : drawn.svg;
  const region = `${partName}/${view}${state ? `:${state}` : ""}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${x} ${y} ${w} ${h}">${body}</svg>`;
  return { region, svg: scopeIds(svg, `${region.replace(/[^A-Za-z0-9]+/g, "_")}_`), anchor: [pivot[0] - x, pivot[1] - y], meta: drawn.meta };
}
