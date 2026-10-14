// Evaluating a pose: bone world transforms from channel values, springs and
// views, and the draw list both renderers draw (characters/format/README.md).
import type { AtlasSet, Bone, Channel, Part, Rig } from "./format.ts";
import { apply, catmullRom, compose, IDENTITY, invert, softLimit, type Affine } from "./math.ts";

export type Channels = Partial<Record<Channel, number>>;

export interface PoseInput {
  /** The clip's channel values per bone; missing channels are at rest. */
  channels: Record<string, Channels>;
  /** Spring angles θ per bone, in degrees, before the soft limit. */
  springs?: Record<string, number>;
  views: { body: string; head: string };
}

export interface Pose {
  /**
   * Each bone's frame in world points: rotation and translation, and the root's
   * uniform scale. A bone's own squash and scale never reach its children's frames.
   */
  world: Affine[];
  /** Each bone's own x and y scale, from squash and scale: it scales the bone's parts and its children's pivot offsets. */
  scale: [number, number][];
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

/**
 * Supplies a spring's θ while a pose is built, bone by bone, parents first: the
 * player integrates there, given the pivot's world position, the parent's world
 * angle, and the bone's rest angle and clip rotation.
 */
export type SpringSource = (bone: number, pivot: [number, number], parentAngle: number, rest: number, clipRot: number) => number;

export function evaluatePose(c: CompiledRig, input: PoseInput, springSource?: SpringSource): Pose {
  const n = c.rig.bones.length;
  const world: Affine[] = new Array(n);
  const scale: [number, number][] = new Array(n);
  const angle: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const bone = c.rig.bones[i]!;
    const ch = input.channels[bone.name] ?? {};
    const rest = restOf(bone, c.inHead[i] ? input.views.head : input.views.body);
    const x = rest.x + (ch.x ?? 0);
    const y = rest.y + (ch.y ?? 0);
    const clipRot = ch.rot ?? 0;
    const p = c.parent[i]!;
    if (p < 0) {
      // The root: its uniform scale is the whole companion's (perspective), so its frame carries it.
      const s = ch.scale ?? 1;
      world[i] = compose(IDENTITY, x, y, 0, s, s);
      scale[i] = [1, 1];
      angle[i] = 0;
      continue;
    }
    const [psx, psy] = scale[p]!;
    let rot = rest.rest + clipRot;
    if (bone.spring && bone.rot) {
      const theta = springSource
        ? springSource(i, apply(world[p]!, psx * x, psy * y), angle[p]!, rest.rest, clipRot)
        : (input.springs?.[bone.name] ?? 0);
      rot += springAngle(theta, clipRot, bone.rot);
    }
    const squash = ch.squash ?? 1;
    const s = ch.scale ?? 1;
    world[i] = compose(world[p]!, psx * x, psy * y, rot, 1, 1);
    scale[i] = [s / squash, s * squash];
    angle[i] = angle[p]! + rot;
  }
  return { world, scale, angle };
}

/** The spring's share of a bone's rotation: θ through the soft limit, in the room the clip's rotation leaves. */
export function springAngle(theta: number, clipRot: number, limit: [number, number]): number {
  return softLimit(theta, limit[0] - clipRot, limit[1] - clipRot);
}

/** The transform a bone's parts are drawn with: its frame and its own scale. */
export function partMatrix(pose: Pose, bone: number): Affine {
  const m = pose.world[bone]!;
  const [sx, sy] = pose.scale[bone]!;
  return { a: m.a * sx, b: m.b * sx, c: m.c * sy, d: m.d * sy, tx: m.tx, ty: m.ty };
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

/** The parts in drawing order for the current views and draw-order variant (a variant of another view is ignored). */
export function orderFor(rig: Rig, views: { body: string; head: string }, variant?: string): string[] {
  const own = variant?.startsWith(`${views.body}:`) ? rig.drawOrderVariants?.[variant] : undefined;
  const body = own ?? rig.drawOrder[views.body] ?? [];
  const head = rig.drawOrder[`head.${views.head}`] ?? [];
  return body.flatMap((entry) => (entry === "@head" ? head : [entry]));
}

export interface FrameState {
  views: { body: string; head: string };
  /** Discrete part states, such as an eye's "closed". */
  states: Record<string, string>;
  /** The body's draw-order variant ("front:sniff"), when the clip's order track names one this view has. */
  variant?: string;
  /** The channels of the fake turn's bone (yaw, pitch), when the rig has one. */
  turn?: Channels;
}

export interface TurnEffect {
  /** How far each part slides, in points, in the fake turn bone's space. */
  shift: Record<string, [number, number]>;
  /** The far eye's x scale about its centre. */
  narrow: Record<string, number>;
}

const clamp1 = (v: number) => Math.min(Math.max(v, -1), 1);

/**
 * The fake turn (section 5b): at full yaw the face slides toward the turn by faceShift
 * of the head's width, markings by markingShift, the ears the other way by earShift,
 * and the far eye narrows by farEyeNarrow; full pitch slides the face by nodShift of
 * the head's height. Positive yaw slides toward +x, positive pitch toward +y (down).
 * Beyond full yaw or pitch the shifts hold. Nothing moves in a view the turn does not list.
 */
export function fakeTurn(rig: Rig, headView: string, turn: Channels | undefined): TurnEffect {
  const effect: TurnEffect = { shift: {}, narrow: {} };
  const ft = rig.fakeTurn;
  const view = ft?.views[headView];
  if (!ft || !view || !turn) return effect;
  const u = clamp1((turn.yaw ?? 0) / ft.yawDeg);
  const v = clamp1((turn.pitch ?? 0) / ft.pitchDeg);
  const [w, h] = view.size;
  for (const [part, role] of Object.entries(ft.roles)) {
    if (role === "face") effect.shift[part] = [ft.faceShift * w * u, ft.nodShift * h * v];
    else if (role === "marking") effect.shift[part] = [ft.markingShift * w * u, 0];
    else effect.shift[part] = [-ft.earShift * w * u, 0];
  }
  if (u > 0) effect.narrow[ft.farEye.positive] = 1 - ft.farEyeNarrow * u;
  if (u < 0) effect.narrow[ft.farEye.negative] = 1 + ft.farEyeNarrow * u;
  return effect;
}

export function drawList(c: CompiledRig, pose: Pose, atlas: AtlasSet, frame: FrameState): DrawItem[] {
  const items: DrawItem[] = [];
  const indexOfPart = new Map<string, number>();
  const turn = fakeTurn(c.rig, frame.views.head, frame.turn);
  const turnFrame = c.rig.fakeTurn ? pose.world[c.index.get(c.rig.fakeTurn.bone)!]! : IDENTITY;
  for (const name of orderFor(c.rig, frame.views, frame.variant)) {
    const part = c.parts.get(name)!;
    const view = part.group === "head" ? frame.views.head : frame.views.body;
    const regionName = regionFor(part, view, frame.states[name]);
    if (!regionName) continue;
    // A clipped part shows only inside its mask: no mask drawn, nothing shown.
    const mask = part.clipTo === undefined ? undefined : indexOfPart.get(part.clipTo);
    if (part.clipTo !== undefined && mask === undefined) continue;
    const region = atlas.regions[regionName]!;
    const page = atlas.pages[region.page]!;
    const s = page.scale;
    // The region's rectangle in the part's bone space: its anchor sits on the pivot.
    const left = -region.anchorX / s;
    const top = -region.anchorY / s;
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
      const m = partMatrix(pose, c.index.get(part.bone)!);
      const n = turn.narrow[name] ?? 1;
      const cx = left + width / 2;
      for (const [x, y] of [[left, top], [left + width, top], [left, top + height], [left + width, top + height]] as const) {
        item.positions.push(...apply(m, cx + (x - cx) * n, y));
      }
      item.uvs.push(u0, v0, u1, v0, u0, v1, u1, v1);
    }
    const shift = turn.shift[name];
    if (shift) {
      // The slide is in the turn bone's space: turn it into the world and move every vertex.
      const dx = turnFrame.a * shift[0] + turnFrame.c * shift[1];
      const dy = turnFrame.b * shift[0] + turnFrame.d * shift[1];
      for (let k = 0; k < item.positions.length; k += 2) {
        item.positions[k]! += dx;
        item.positions[k + 1]! += dy;
      }
    }
    if (mask !== undefined) item.clipTo = mask;
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
  // A place along the chain is a projection on the line from its first pivot to its
  // last; it needs no unit length, since only its order matters. A row exactly at a
  // joint belongs to the child bone.
  const last = restRel[restRel.length - 1]!;
  const along = (x: number, y: number) => x * last.tx + y * last.ty;
  const inverses = restRel.map(invert);
  const centre = left + width / 2;

  const rows = warp.rows;
  const control: [number, number][][] = [];
  for (let r = 0; r <= rows; r++) {
    const y = top + height * (r / rows);
    const d = along(centre, y);
    let k = 0;
    for (let j = 1; j < chain.length; j++) if (along(restRel[j]!.tx, restRel[j]!.ty) <= d) k = j;
    const m = partMatrix(pose, chain[k]!);
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
