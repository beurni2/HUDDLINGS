// Evaluating a pose: bone world transforms from channel values, springs and
// views, and the draw list both renderers draw (characters/format/README.md).
import type { AtlasSet, Bone, Channel, Part, Rig } from "./format.ts";
import { apply, catmullRom, compose, IDENTITY, invert, type Affine } from "./math.ts";

export type Channels = Partial<Record<Channel, number>>;

export interface PoseInput {
  /** The clip's channel values per bone; missing channels are at rest. */
  channels: Record<string, Channels>;
  /** Spring angles per bone, in degrees. */
  springs?: Record<string, number>;
  views: { body: string; head: string };
}

export interface Pose {
  world: Affine[];
  /** Each bone's world angle: the sum of the rotations along its chain, in degrees. */
  angle: number[];
}

export interface CompiledRig {
  rig: Rig;
  index: Map<string, number>;
  parent: number[];
  /** True for the head bone and its descendants: they take the head's view. */
  inHead: boolean[];
  parts: Map<string, Part>;
}

export function compile(rig: Rig): CompiledRig {
  const index = new Map<string, number>();
  const parent: number[] = [];
  const inHead: boolean[] = [];
  const headBone = rig.headBone ?? "head";
  rig.bones.forEach((bone, i) => {
    index.set(bone.name, i);
    const p = bone.parent === undefined ? -1 : index.get(bone.parent)!;
    parent.push(p);
    inHead.push(bone.name === headBone || (p >= 0 && inHead[p]!));
  });
  return { rig, index, parent, inHead, parts: new Map(rig.parts.map((p) => [p.name, p])) };
}

/** A bone's rest placement in a view: the view's override, or the bone's own. */
export function restOf(bone: Bone, view: string): { x: number; y: number; rest: number } {
  const o = bone.views?.[view];
  return { x: o?.x ?? bone.x ?? 0, y: o?.y ?? bone.y ?? 0, rest: o?.rest ?? bone.rest ?? 0 };
}

export function evaluatePose(c: CompiledRig, input: PoseInput): Pose {
  const n = c.rig.bones.length;
  const world: Affine[] = new Array(n);
  const angle: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const bone = c.rig.bones[i]!;
    const ch = input.channels[bone.name] ?? {};
    const view = c.inHead[i] ? input.views.head : input.views.body;
    const rest = restOf(bone, view);
    const spring = input.springs?.[bone.name] ?? 0;
    const rot = rest.rest + (ch.rot ?? 0) + spring;
    const squash = ch.squash ?? 1;
    const scale = ch.scale ?? 1;
    const p = c.parent[i]!;
    const parentWorld = p >= 0 ? world[p]! : IDENTITY;
    world[i] = compose(parentWorld, rest.x + (ch.x ?? 0), rest.y + (ch.y ?? 0), rot, scale / squash, scale * squash);
    angle[i] = (p >= 0 ? angle[p]! : 0) + rot;
  }
  return { world, angle };
}

export interface DrawItem {
  part: string;
  region: string;
  page: number;
  /** Mesh vertices in world points, row-major, (columns + 1) × (rows + 1). */
  positions: number[];
  /** Matching texture coordinates in 0..1 of the page. */
  uvs: number[];
  columns: number;
  rows: number;
  /** The index in the draw list of the part this one is clipped to. */
  clipTo?: number;
}

/** Sub-rows per control row when a bending part's grid is expanded (characters/format/README.md, Bending parts). */
export const WARP_SUBDIVISIONS = 4;

/** The region a part draws for a view and a state, or undefined when the part is not drawn in that view. */
export function regionFor(part: Part, view: string, state: string | undefined): string | undefined {
  if (state !== undefined && part.regions[`${view}:${state}`]) return part.regions[`${view}:${state}`];
  return part.regions[view] ?? part.regions[`${view}:${part.defaultState ?? "open"}`];
}

/** The parts in drawing order for the current views and draw-order variant. */
export function orderFor(rig: Rig, views: { body: string; head: string }, variant?: string): string[] {
  const body = (variant && rig.drawOrderVariants?.[variant]) || rig.drawOrder[views.body] || [];
  const head = rig.drawOrder[`head.${views.head}`] ?? [];
  return body.flatMap((entry) => (entry === "@head" ? head : [entry]));
}

export interface FrameState {
  views: { body: string; head: string };
  /** Discrete part states, such as an eye's "closed". */
  states: Record<string, string>;
  /** The draw-order variant a clip's order event set, if any. */
  variant?: string;
  /** The channels of the fake turn's bone (yaw, pitch), when the rig has one. */
  turn?: Channels;
}

/** How far the fake turn slides each face part, in points (section 5b, The rig). */
export function faceShift(rig: Rig, turn: Channels | undefined): Record<string, [number, number]> {
  const shifts: Record<string, [number, number]> = {};
  const ft = rig.fakeTurn;
  if (!ft || !turn) return shifts;
  const yaw = (turn.yaw ?? 0) / ft.yaw;
  const pitch = (turn.pitch ?? 0) / ft.pitch;
  for (const [name, [fx, fy]] of Object.entries(ft.parts)) shifts[name] = [yaw * fx, pitch * fy];
  return shifts;
}

export function drawList(c: CompiledRig, pose: Pose, atlas: AtlasSet, frame: FrameState): DrawItem[] {
  const items: DrawItem[] = [];
  const indexOfPart = new Map<string, number>();
  const shifts = faceShift(c.rig, frame.turn);
  for (const name of orderFor(c.rig, frame.views, frame.variant)) {
    const part = c.parts.get(name)!;
    const view = part.group === "head" ? frame.views.head : frame.views.body;
    const regionName = regionFor(part, view, frame.states[name]);
    if (!regionName) continue;
    const region = atlas.regions[regionName]!;
    const page = atlas.pages[region.page]!;
    const s = page.scale;
    // The region's rectangle in the part's bone space: its anchor sits on the pivot.
    const shift = shifts[name] ?? [0, 0];
    const left = -region.anchorX / s + shift[0];
    const top = -region.anchorY / s + shift[1];
    const width = region.w / s;
    const height = region.h / s;
    const u0 = region.x / page.width;
    const v0 = region.y / page.height;
    const u1 = (region.x + region.w) / page.width;
    const v1 = (region.y + region.h) / page.height;
    const item: DrawItem = { part: name, region: regionName, page: region.page, positions: [], uvs: [], columns: 1, rows: 1 };
    if (part.warp) {
      warpMesh(c, pose, part, frame.views, left, top, width, height, item);
      for (let r = 0; r <= item.rows; r++) {
        const v = v0 + (v1 - v0) * (r / item.rows);
        item.uvs.push(u0, v, u1, v);
      }
    } else {
      const m = pose.world[c.index.get(part.bone)!]!;
      for (const [x, y] of [[left, top], [left + width, top], [left, top + height], [left + width, top + height]] as const) {
        item.positions.push(...apply(m, x, y));
      }
      item.uvs.push(u0, v0, u1, v0, u0, v1, u1, v1);
    }
    if (part.clipTo !== undefined) {
      const mask = indexOfPart.get(part.clipTo);
      if (mask !== undefined) item.clipTo = mask;
    }
    indexOfPart.set(name, items.length);
    items.push(item);
  }
  return items;
}

/**
 * A bending part (characters/format/README.md, Bending parts). Each row of its
 * control grid, from the top of the region (row 0) to the bottom, belongs to the
 * chain bone that owns its place along the chain at rest: the row is carried into
 * that bone's space by the inverse of the bone's rest transform, then moved by the
 * bone's world transform. The grid is then expanded by Catmull–Rom along each
 * column into the dense mesh both runtimes draw as it is.
 */
function warpMesh(
  c: CompiledRig, pose: Pose, part: Part, views: { body: string; head: string },
  left: number, top: number, width: number, height: number, item: DrawItem,
) {
  const warp = part.warp!;
  const chain = warp.chain.map((b) => c.index.get(b)!);
  // Each chain bone's rest transform relative to the chain's first bone, the part's own bone.
  const restRel: Affine[] = [IDENTITY];
  for (let k = 1; k < chain.length; k++) {
    const i = chain[k]!;
    const r = restOf(c.rig.bones[i]!, c.inHead[i] ? views.head : views.body);
    restRel.push(compose(restRel[k - 1]!, r.x, r.y, r.rest, 1, 1));
  }
  const last = restRel[restRel.length - 1]!;
  const length = Math.hypot(last.tx, last.ty);
  const axisX = last.tx / length;
  const axisY = last.ty / length;
  const along = (x: number, y: number) => x * axisX + y * axisY;
  const inverses = restRel.map(invert);
  const centre = left + width / 2;

  const rows = warp.rows;
  const control: [number, number][][] = [];
  for (let r = 0; r <= rows; r++) {
    const y = top + height * (r / rows);
    const d = along(centre, y);
    let k = 0;
    for (let j = 1; j < chain.length; j++) if (along(restRel[j]!.tx, restRel[j]!.ty) <= d) k = j;
    const m = pose.world[chain[k]!]!;
    const inv = inverses[k]!;
    const row: [number, number][] = [];
    for (const x of [left, left + width]) {
      const [lx, ly] = apply(inv, x, y);
      row.push(apply(m, lx, ly));
    }
    control.push(row);
  }

  const dense = rows * WARP_SUBDIVISIONS;
  item.rows = dense;
  item.columns = 1;
  // Beyond the ends the grid continues in a straight line, so evenly spaced rows at
  // rest stay evenly spaced (repeating the end rows would squeeze the texture there).
  const p = (k: number, col: number): [number, number] => {
    if (k < 0) {
      const a = control[0]![col]!, b = control[1]![col]!;
      return [2 * a[0] - b[0], 2 * a[1] - b[1]];
    }
    if (k > rows) {
      const a = control[rows]![col]!, b = control[rows - 1]![col]!;
      return [2 * a[0] - b[0], 2 * a[1] - b[1]];
    }
    return control[k]![col]!;
  };
  for (let i = 0; i <= dense; i++) {
    const r = Math.min(rows - 1, Math.floor(i / WARP_SUBDIVISIONS));
    const f = i / WARP_SUBDIVISIONS - r;
    for (let col = 0; col < 2; col++) {
      item.positions.push(
        catmullRom(p(r - 1, col)[0], p(r, col)[0], p(r + 1, col)[0], p(r + 2, col)[0], f),
        catmullRom(p(r - 1, col)[1], p(r, col)[1], p(r + 1, col)[1], p(r + 2, col)[1], f),
      );
    }
  }
}
