// The character package format, version 1 (characters/format/README.md),
// and the checks that refuse a package breaking it.

import type { Easing } from "./math.ts";
import { sampleKeys } from "./clip.ts";

export const FORMAT = 1;

export interface Spring {
  hz: number;
  damping: number;
  /** The part's centre of mass in the bone's own space, in points; at least 2 pt from the pivot. */
  com: [number, number];
  /** How much the part lags its parent's turns; 1 by default. */
  follow?: number;
  /** How much the part lags its own clip rotation (an ear turning to a new state); 0 by default. */
  selfFollow?: number;
  /** How much the pivot's acceleration swings the part; 1 by default. */
  inertia?: number;
}

export interface Bone {
  name: string;
  parent?: string;
  x?: number;
  y?: number;
  rest?: number;
  /** Rotation limits in degrees, around the rest angle: for the clip's rotation and, with a spring, for the total. */
  rot?: [number, number];
  /** Volume-keeping squash: y scale s, x scale 1/s. Never on the root. */
  squash?: [number, number];
  /** Uniform scale. On the root it scales the whole companion (perspective); elsewhere only the bone's own parts. */
  scale?: [number, number];
  /** Limits of the fake turn's channels, on the fake turn's bone. */
  yaw?: [number, number];
  pitch?: [number, number];
  spring?: Spring;
  /** Rest placement in other views, where the drawing moves the pivot (a tail roots at the side in front view, at the back in side view). */
  views?: Record<string, { x?: number; y?: number; rest?: number }>;
}

export interface Warp {
  chain: string[];
  columns: 1;
  rows: number;
}

export interface Part {
  name: string;
  bone: string;
  group: "body" | "head";
  /** Region name per view, or per view and state ("front" or "front:closed"); null draws nothing there (regionFor). */
  regions: Record<string, string | null>;
  clipTo?: string;
  warp?: Warp;
  /** The state drawn when no clip sets one (for parts whose regions are all "view:state"). */
  defaultState?: string;
  /** Its rest alpha, 0 to 1, 1 by default: its alpha where no clip keys it (the blush, drawn at full strength, rests at its sheet's level). */
  alpha?: number;
}

export type TurnRole = "face" | "marking" | "ear";

/** The fake turn (section 5b, The rig; Appendix F's fakeTurn). */
export interface FakeTurn {
  /** The bone whose yaw and pitch channels drive it. */
  bone: string;
  /** The yaw and pitch at which the front drawing's shifts are full. */
  yawDeg: number;
  pitchDeg: number;
  /** Shares of the head's width (face, marking, ear) and height (nod) a part slides at full yaw or pitch. */
  faceShift: number;
  markingShift: number;
  earShift: number;
  nodShift: number;
  /** How much the far eye narrows at full yaw, as a share of its width. */
  farEyeNarrow: number;
  /** The head views the fake turn acts in, with the head's width and height there, in points. */
  views: Record<string, { size: [number, number] }>;
  roles: Record<string, TurnRole>;
  /** The eye that narrows when yaw is positive, and when it is negative. */
  farEye: { positive: string; negative: string };
}

export interface Rig {
  format: number;
  species: string;
  /** The character's version, written into the package. */
  version?: string;
  height: number;
  bones: Bone[];
  views: string[];
  parts: Part[];
  drawOrder: Record<string, string[]>;
  /** Other body orders a clip's order track can choose, named "<view>:<variant>". */
  drawOrderVariants?: Record<string, string[]>;
  /** The bone whose subtree takes the head's view; "head" by default. */
  headBone?: string;
  fakeTurn?: FakeTurn;
}

export type Key = [number, number] | [number, number, Easing];
export type DiscreteKey = [number, string];
export type Channel = "rot" | "x" | "y" | "squash" | "scale" | "yaw" | "pitch";

export interface ClipEvent {
  at: number;
  type: "keyPose" | "sound" | "haptic" | "effect" | "plant" | "lift" | "footstep";
  name?: string;
}

export interface Clip {
  name: string;
  lengthMs: number;
  loop?: boolean;
  /** How long switching to this clip blends, 150 to 300 ms; 200 by default. */
  blendInMs?: number;
  interruptAt?: number[];
  tracks?: Record<string, Partial<Record<Channel, Key[]>>>;
  /** Each part's opacity over time, 0 to 1; where no clip keys it, its rest alpha, 1 unless the rig gives one (README, Clips: alpha). */
  alpha?: Record<string, Key[]>;
  states?: Record<string, DiscreteKey[]>;
  views?: Partial<Record<"body" | "head", DiscreteKey[]>>;
  /** The body's draw-order variant over time; null is the view's own order. */
  order?: [number, string | null][];
  events?: ClipEvent[];
}

export interface Region {
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  anchorX: number;
  anchorY: number;
}

/** The regions at one scale: 2x, 3x, 5x or the small page. */
export interface AtlasSet {
  name: string;
  scale: number;
  pages: { file: string; scale: number; width: number; height: number }[];
  regions: Record<string, Region>;
}

export interface Atlas {
  sets: AtlasSet[];
}

const CHANNELS: Channel[] = ["rot", "x", "y", "squash", "scale", "yaw", "pitch"];
const LIMITED: ("rot" | "squash" | "scale" | "yaw" | "pitch")[] = ["rot", "squash", "scale", "yaw", "pitch"];

/** The body orders a rig can draw: each view's own order and every variant. */
function bodyOrders(rig: Rig): [string, string[]][] {
  return [...Object.entries(rig.drawOrder).filter(([name]) => !name.startsWith("head.")), ...Object.entries(rig.drawOrderVariants ?? {})];
}

const EASING_NAMES = new Set(["linear", "step", "easeIn", "easeOut", "easeInOut", "easeOutBack"]);
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
/** A JSON object: not a list, not null. */
const isMap = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Why a key's easing is not one the README names, or undefined when it is: a name, ["easeOutBack", s]
 * or ["bezier", x1, y1, x2, y2], every number finite. A file is JSON, so anything can arrive here.
 */
function easingProblem(easing: unknown): string | undefined {
  if (typeof easing === "string") return EASING_NAMES.has(easing) ? undefined : `an unknown easing ${JSON.stringify(easing)}`;
  if (Array.isArray(easing) && easing[0] === "easeOutBack" && easing.length === 2 && finite(easing[1])) return undefined;
  if (Array.isArray(easing) && easing[0] === "bezier" && easing.length === 5 && easing.slice(1).every(finite)) return undefined;
  return `an easing that is not a name, ["easeOutBack", s] or ["bezier", x1, y1, x2, y2] with finite numbers: ${JSON.stringify(easing)}`;
}

/**
 * The checks every keyed track gets, a bone's channel or a part's alpha: at least one key, each
 * [time, value] or [time, value, easing] with a finite time and value and an easing the README
 * names, keys in time order and inside the clip, CSS's rule for a Bézier's x1 and x2, each key's
 * value (valueProblem), and, given a limit, no overshoot past it between keys. The runtimes sample
 * only what passes: an empty track has no value, and a value or easing of another shape reaches
 * the arithmetic as NaN or a string.
 */
function keyProblems(clip: Clip, what: string, keys: Key[], limit: readonly [number, number] | undefined, valueProblem: (v: number) => string | undefined): string[] {
  if (!Array.isArray(keys)) return [`clip ${clip.name}: ${what} is not a list of keys`];
  if (keys.length === 0) return [`clip ${clip.name}: ${what} has no keys; a track needs at least one`];
  const problems: string[] = [];
  let last = -Infinity;
  let shapes = true;
  for (const [index, key] of keys.entries()) {
    if (!Array.isArray(key) || (key.length !== 2 && key.length !== 3) || !finite(key[0]) || !finite(key[1])) {
      problems.push(`clip ${clip.name}: ${what} key ${index} is not [time, value] or [time, value, easing] with a finite time and value: ${JSON.stringify(key) ?? String(key)}`);
      shapes = false;
      continue;
    }
    const easingIssue = key.length === 3 ? easingProblem(key[2]) : undefined;
    if (easingIssue) {
      problems.push(`clip ${clip.name}: ${what} key at ${key[0]} ms has ${easingIssue}`);
      shapes = false;
    }
    if (key[0] < last) problems.push(`clip ${clip.name}: ${what} keys out of order at ${key[0]} ms`);
    if (key[0] < 0 || key[0] > clip.lengthMs) problems.push(`clip ${clip.name}: ${what} key at ${key[0]} ms is outside the clip`);
    last = key[0];
    const easing = key[2];
    if (Array.isArray(easing) && easing[0] === "bezier" && !(easing[1] >= 0 && easing[1] <= 1 && easing[3] >= 0 && easing[3] <= 1))
      problems.push(`clip ${clip.name}: ${what} key at ${key[0]} ms has a bezier with x1 or x2 outside 0 to 1`);
    const problem = valueProblem(key[1]);
    if (problem) problems.push(`clip ${clip.name}: ${problem}`);
  }
  // Between keys an easing can overshoot (easeOutBack, a bezier): sample each segment finely, once every key reads.
  if (limit && shapes) {
    for (let k = 1; k < keys.length; k++) {
      const [t0, t1] = [keys[k - 1]![0], keys[k]![0]];
      for (let i = 1; i < 256 && t1 > t0; i++) {
        const v = sampleKeys(keys, t0 + ((t1 - t0) * i) / 256);
        if (v < limit[0] - 1e-9 || v > limit[1] + 1e-9) {
          problems.push(`clip ${clip.name}: ${what} overshoots to ${v.toFixed(2)} between ${t0} and ${t1} ms, past its limit [${limit[0]}, ${limit[1]}]`);
          break;
        }
      }
    }
  }
  return problems;
}

/** Every problem with a rig and its clips, as readable lines. An empty list means the package is sound. */
export function validate(rig: Rig, clips: Clip[], atlas?: AtlasSet): string[] {
  const problems: string[] = [];
  const bones = new Map<string, Bone>();
  if (rig.format !== FORMAT) problems.push(`rig: format ${rig.format}, expected ${FORMAT}`);
  for (const bone of rig.bones) {
    if (bones.has(bone.name)) problems.push(`bone ${bone.name}: listed twice`);
    if (bone.parent !== undefined && !bones.has(bone.parent)) problems.push(`bone ${bone.name}: parent ${bone.parent} must come first`);
    if (bone.parent === undefined && bone.name !== "root") problems.push(`bone ${bone.name}: only root has no parent`);
    if (bone.name === "root" && (bone.rot || bone.spring || bone.squash || bone.rest)) problems.push("bone root: never rotates or squashes");
    for (const key of LIMITED) {
      const range = bone[key];
      if (range && !(range[0] <= range[1])) problems.push(`bone ${bone.name}: ${key} range is reversed`);
    }
    if (bone.rot && !(bone.rot[0] <= 0 && bone.rot[1] >= 0)) problems.push(`bone ${bone.name}: rot limits must contain the rest angle (0)`);
    if (bone.spring) {
      const s = bone.spring;
      if (!(s.hz > 0) || !(s.damping >= 0)) problems.push(`bone ${bone.name}: spring needs hz > 0 and damping >= 0`);
      if (!(Math.hypot(s.com[0], s.com[1]) >= 2)) problems.push(`bone ${bone.name}: spring com must be at least 2 pt from the pivot`);
      if (!bone.rot) problems.push(`bone ${bone.name}: a spring needs a rot limit`);
    }
    bones.set(bone.name, bone);
  }
  if (!bones.has("root")) problems.push("rig: no root bone");

  const parts = new Map<string, Part>();
  for (const part of rig.parts) {
    if (parts.has(part.name)) problems.push(`part ${part.name}: listed twice`);
    parts.set(part.name, part);
    if (!bones.has(part.bone)) problems.push(`part ${part.name}: unknown bone ${part.bone}`);
    if (part.alpha !== undefined && !(finite(part.alpha) && part.alpha >= 0 && part.alpha <= 1)) problems.push(`part ${part.name}: its rest alpha ${JSON.stringify(part.alpha)} is not a number from 0 to 1`);
    // Per view: whether any of its keys names a region. A null needs nothing in the atlas.
    const drawsIn = new Map<string, boolean>();
    for (const [view, region] of Object.entries(part.regions)) {
      const viewName = view.split(":")[0]!;
      if (!rig.views.includes(viewName)) problems.push(`part ${part.name}: unknown view ${viewName}`);
      drawsIn.set(viewName, (drawsIn.get(viewName) ?? false) || region !== null);
      if (region !== null && atlas && !atlas.regions[region]) problems.push(`part ${part.name}: region ${region} is not in the atlas`);
    }
    for (const [view, draws] of drawsIn) if (!draws) problems.push(`part ${part.name}: every region in view ${view} is null; leave the view out instead`);
    if (part.warp) {
      const chain = part.warp.chain;
      for (const b of chain) if (!bones.has(b)) problems.push(`part ${part.name}: warp chain bone ${b} is unknown`);
      if (chain[0] !== part.bone) problems.push(`part ${part.name}: a warp chain starts at the part's bone`);
      for (let k = 1; k < chain.length; k++) {
        if (bones.get(chain[k]!)?.parent !== chain[k - 1]) problems.push(`part ${part.name}: warp chain bone ${chain[k]} must be a child of ${chain[k - 1]}`);
      }
      if (chain.length < 2) problems.push(`part ${part.name}: a warp chain needs at least two bones`);
      if (part.warp.columns !== 1 || part.warp.rows < 1) problems.push(`part ${part.name}: a warp grid is 1 column by n rows`);
    }
  }

  // Clipping (README, Rig: clipTo and clip groups).
  for (const part of rig.parts) {
    if (!part.clipTo) continue;
    const mask = parts.get(part.clipTo);
    if (!mask) {
      problems.push(`part ${part.name}: clipTo ${part.clipTo} is not a part`);
      continue;
    }
    if (mask.clipTo) problems.push(`part ${part.name}: its mask ${mask.name} is itself clipped; clips do not nest in version 1`);
    if (part.warp || mask.warp) problems.push(`part ${part.name}: a bending part can neither be clipped nor be a mask in version 1`);
  }

  for (const [name, order] of Object.entries({ ...rig.drawOrder, ...(rig.drawOrderVariants ?? {}) })) {
    for (const entry of order) {
      if (entry === "@head") continue;
      if (!parts.has(entry)) problems.push(`draw order ${name}: unknown part ${entry}`);
    }
  }
  for (const view of rig.views) {
    if (!rig.drawOrder[view]) problems.push(`draw order: none for view ${view}`);
  }
  for (const name of Object.keys(rig.drawOrderVariants ?? {})) {
    const [view, variant] = name.split(":");
    if (!variant || !rig.views.includes(view!)) problems.push(`draw order variant ${name}: must be named <view>:<variant>`);
  }
  // Each clip group (the parts sharing a mask) is contiguous and drawn after its mask, in every order the rig can draw.
  const heads = Object.entries(rig.drawOrder).filter(([name]) => name.startsWith("head."));
  for (const [bodyName, body] of bodyOrders(rig)) {
    for (const [headName, head] of heads.length ? heads : [["(no head order)", []] as [string, string[]]]) {
      const order = body.flatMap((entry) => (entry === "@head" ? head : [entry]));
      const where = `${bodyName} with ${headName}`;
      const seen = new Set<string>();
      let open: string | undefined;
      for (const entry of order) {
        const mask = parts.get(entry)?.clipTo;
        if (mask !== open && mask !== undefined && seen.has(`group:${mask}`)) problems.push(`draw order ${where}: the parts clipped to ${mask} are not together`);
        if (mask !== undefined) {
          seen.add(`group:${mask}`);
          if (order.includes(mask) && !seen.has(mask)) problems.push(`draw order ${where}: ${entry} comes before its mask ${mask}`);
        }
        open = mask;
        seen.add(entry);
      }
    }
  }

  const ft = rig.fakeTurn;
  if (ft) {
    if (!bones.has(ft.bone)) problems.push(`fake turn: unknown bone ${ft.bone}`);
    if (!(ft.yawDeg > 0) || !(ft.pitchDeg > 0)) problems.push("fake turn: yawDeg and pitchDeg must be positive");
    for (const [view, { size }] of Object.entries(ft.views)) {
      if (!rig.views.includes(view)) problems.push(`fake turn: unknown view ${view}`);
      if (!(size[0] > 0 && size[1] > 0)) problems.push(`fake turn: the head size in ${view} must be positive`);
    }
    for (const [name, role] of Object.entries(ft.roles)) {
      const part = parts.get(name);
      if (!part) problems.push(`fake turn: unknown part ${name}`);
      else if (role !== "ear" && !part.clipTo) problems.push(`fake turn: ${name} slides with the face, so it must be clipped (section 5b)`);
    }
    for (const eye of [ft.farEye.positive, ft.farEye.negative]) {
      if (ft.roles[eye] !== "face") problems.push(`fake turn: far eye ${eye} must be a face part`);
    }
  }

  for (const clip of clips) {
    if (clip.blendInMs !== undefined && !(clip.blendInMs >= 150 && clip.blendInMs <= 300)) problems.push(`clip ${clip.name}: blendInMs ${clip.blendInMs} is outside 150 to 300 ms (section 5b)`);
    // A clip file is JSON: a map of tracks that is not an object is named here, not iterated. A clip's own field may be
    // null, which both runtimes read as absent; a bone's channels may not.
    const entries = (what: string, of: string, map: unknown, absent = map === undefined || map === null): [string, unknown][] => {
      if (absent) return [];
      if (isMap(map)) return Object.entries(map);
      problems.push(`clip ${clip.name}: ${what} is not a map of ${of}: ${JSON.stringify(map)}`);
      return [];
    };
    for (const [boneName, channels] of entries("tracks", "bones", clip.tracks)) {
      const bone = bones.get(boneName);
      if (!bone) {
        problems.push(`clip ${clip.name}: unknown bone ${boneName}`);
        continue;
      }
      for (const [channel, keys] of entries(`tracks of ${boneName}`, "channels", channels, false) as [Channel, Key[]][]) {
        if (!CHANNELS.includes(channel)) problems.push(`clip ${clip.name}: ${boneName} has unknown channel ${channel}`);
        if ((channel === "yaw" || channel === "pitch") && boneName !== ft?.bone) problems.push(`clip ${clip.name}: ${boneName}.${channel}: only the fake turn's bone has ${channel}`);
        const limit = channel === "x" || channel === "y" ? undefined : bone[channel];
        problems.push(...keyProblems(clip, `${boneName}.${channel}`, keys, limit, (v) => {
          if ((channel === "rot" || channel === "yaw" || channel === "pitch") && !bone[channel]) return `${boneName} has no ${channel} limit, so it cannot be keyed`;
          if ((channel === "rot" || channel === "yaw" || channel === "pitch") && (v < bone[channel]![0] || v > bone[channel]![1]))
            return `${boneName}.${channel} ${v} leaves its limit [${bone[channel]![0]}, ${bone[channel]![1]}]`;
          if ((channel === "squash" || channel === "scale") && (!bone[channel] || v < bone[channel][0] || v > bone[channel][1]))
            return `${boneName}.${channel} ${v} is not allowed (scale channels, section 5b)`;
        }));
      }
    }
    // A part's alpha keys like a channel, inside 0 to 1 (README, Clips: alpha).
    for (const [partName, keys] of entries("alpha", "parts", clip.alpha) as [string, Key[]][]) {
      if (!parts.has(partName)) problems.push(`clip ${clip.name}: alpha of unknown part ${partName}`);
      problems.push(...keyProblems(clip, `alpha of ${partName}`, keys, [0, 1], (v) => (v >= 0 && v <= 1 ? undefined : `alpha of ${partName} ${v} leaves 0 to 1`)));
    }
    for (const event of clip.events ?? []) {
      if (event.at < 0 || event.at > clip.lengthMs) problems.push(`clip ${clip.name}: event ${event.type} at ${event.at} ms is outside the clip`);
      if (clip.loop && event.at === clip.lengthMs) problems.push(`clip ${clip.name}: on a loop, an event at ${clip.lengthMs} ms is the event at 0 ms; put it at 0`);
    }
    // A discrete track holds its first value before its first key, so it needs one, as a keyed track does. Each key is
    // [time, name] (an order key's name may be null, the view's own order), in time order, the order both samplers
    // read them in; a name is looked up only once its key reads.
    type Discrete = [what: string, keys: unknown, nullable: boolean, nameProblem: (name: string | null) => string | undefined];
    const discrete: Discrete[] = [
      ...entries("states", "parts", clip.states).map(([part, keys]): Discrete => [`states of ${part}`, keys, false, () => undefined]),
      ...entries("views", "groups", clip.views).map(([group, keys]): Discrete =>
        [`${group} views`, keys, false, (view) => (rig.views.includes(view!) ? undefined : `${group} view ${view} is unknown`)]),
      ...(clip.order === undefined || clip.order === null ? [] : [["order", clip.order, true, (variant) =>
        (variant === null || rig.views.some((view) => rig.drawOrderVariants?.[`${view}:${variant}`]) ? undefined : `order variant ${variant} exists in no view`)] as Discrete]),
    ];
    for (const [what, keys, nullable, nameProblem] of discrete) {
      if (!Array.isArray(keys)) {
        problems.push(`clip ${clip.name}: ${what} is not a list of keys`);
        continue;
      }
      if (keys.length === 0) problems.push(`clip ${clip.name}: ${what} has no keys; a track needs at least one`);
      let last = -Infinity;
      for (const [index, key] of keys.entries()) {
        if (!Array.isArray(key) || key.length !== 2 || !finite(key[0]) || !(typeof key[1] === "string" || (nullable && key[1] === null))) {
          problems.push(`clip ${clip.name}: ${what} key ${index} is not [time, name] with a finite time and a name${nullable ? " or null" : ""}: ${JSON.stringify(key) ?? String(key)}`);
          continue;
        }
        if (key[0] < last) problems.push(`clip ${clip.name}: ${what} keys out of order at ${key[0]} ms`);
        last = key[0];
        const problem = nameProblem(key[1]);
        if (problem) problems.push(`clip ${clip.name}: ${problem}`);
      }
    }
  }
  return problems;
}
