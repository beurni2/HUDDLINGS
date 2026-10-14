// The character package format, version 1 (characters/format/README.md),
// and the checks that refuse a package breaking it.

import type { Easing } from "./math.ts";

export const FORMAT = 1;

export interface Spring {
  hz: number;
  damping: number;
  /** The part's centre of mass in the bone's own space, in points. */
  com: [number, number];
  follow: number;
  inertia: number;
}

export interface Bone {
  name: string;
  parent?: string;
  x?: number;
  y?: number;
  rest?: number;
  /** Rotation limits in degrees, around the rest angle. */
  rot?: [number, number];
  /** Volume-keeping squash: y scale s, x scale 1/s. */
  squash?: [number, number];
  /** Uniform scale. */
  scale?: [number, number];
  spring?: Spring;
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
  /** Region name per view, or per view and state ("front" or "front:closed"). */
  regions: Record<string, string>;
  clipTo?: string;
  warp?: Warp;
}

export interface Rig {
  format: number;
  species: string;
  height: number;
  bones: Bone[];
  views: string[];
  parts: Part[];
  drawOrder: Record<string, string[]>;
  drawOrderVariants?: Record<string, string[]>;
}

export type Key = [number, number] | [number, number, Easing];
export type DiscreteKey = [number, string];
export type Channel = "rot" | "x" | "y" | "squash" | "scale" | "yaw" | "pitch";

export interface ClipEvent {
  at: number;
  type: "keyPose" | "sound" | "haptic" | "order" | "effect" | "plant" | "lift" | "footstep";
  name?: string;
}

export interface Clip {
  name: string;
  lengthMs: number;
  loop?: boolean;
  interruptAt?: number[];
  tracks?: Record<string, Partial<Record<Channel, Key[]>>>;
  states?: Record<string, DiscreteKey[]>;
  views?: Partial<Record<"body" | "head", DiscreteKey[]>>;
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

export interface Atlas {
  pages: { file: string; scale: number; width: number; height: number }[];
  regions: Record<string, Region>;
}

const CHANNELS: Channel[] = ["rot", "x", "y", "squash", "scale", "yaw", "pitch"];

/** Every problem with a rig and its clips, as readable lines. An empty list means the package is sound. */
export function validate(rig: Rig, clips: Clip[], atlas?: Atlas): string[] {
  const problems: string[] = [];
  const bones = new Map<string, Bone>();
  if (rig.format !== FORMAT) problems.push(`rig: format ${rig.format}, expected ${FORMAT}`);
  for (const bone of rig.bones) {
    if (bones.has(bone.name)) problems.push(`bone ${bone.name}: listed twice`);
    if (bone.parent !== undefined && !bones.has(bone.parent)) problems.push(`bone ${bone.name}: parent ${bone.parent} must come first`);
    if (bone.parent === undefined && bone.name !== "root") problems.push(`bone ${bone.name}: only root has no parent`);
    if (bone.name === "root" && (bone.rot || bone.spring)) problems.push("bone root: never rotates");
    for (const key of ["rot", "squash", "scale"] as const) {
      const range = bone[key];
      if (range && !(range[0] <= range[1])) problems.push(`bone ${bone.name}: ${key} range is reversed`);
    }
    if (bone.spring) {
      const s = bone.spring;
      if (!(s.hz > 0) || !(s.damping >= 0)) problems.push(`bone ${bone.name}: spring needs hz > 0 and damping >= 0`);
      if (s.com[0] === 0 && s.com[1] === 0) problems.push(`bone ${bone.name}: spring com cannot be the pivot`);
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
    for (const [view, region] of Object.entries(part.regions)) {
      const viewName = view.split(":")[0]!;
      if (!rig.views.includes(viewName)) problems.push(`part ${part.name}: unknown view ${viewName}`);
      if (atlas && !atlas.regions[region]) problems.push(`part ${part.name}: region ${region} is not in the atlas`);
    }
    if (part.warp) {
      for (const b of part.warp.chain) if (!bones.has(b)) problems.push(`part ${part.name}: warp chain bone ${b} is unknown`);
      if (part.warp.columns !== 1 || part.warp.rows < 1) problems.push(`part ${part.name}: a warp grid is 1 column by n rows`);
    }
  }
  for (const part of rig.parts) {
    if (part.clipTo && !parts.has(part.clipTo)) problems.push(`part ${part.name}: clipTo ${part.clipTo} is not a part`);
  }

  const orders = { ...rig.drawOrder, ...(rig.drawOrderVariants ?? {}) };
  for (const [name, order] of Object.entries(orders)) {
    for (const entry of order) {
      if (entry === "@head") continue;
      if (!parts.has(entry)) problems.push(`draw order ${name}: unknown part ${entry}`);
    }
  }
  for (const view of rig.views) {
    if (!rig.drawOrder[view]) problems.push(`draw order: none for view ${view}`);
  }

  for (const clip of clips) {
    for (const [boneName, channels] of Object.entries(clip.tracks ?? {})) {
      const bone = bones.get(boneName);
      if (!bone) {
        problems.push(`clip ${clip.name}: unknown bone ${boneName}`);
        continue;
      }
      for (const [channel, keys] of Object.entries(channels) as [Channel, Key[]][]) {
        if (!CHANNELS.includes(channel)) problems.push(`clip ${clip.name}: ${boneName} has unknown channel ${channel}`);
        let last = -Infinity;
        for (const key of keys) {
          if (key[0] < last) problems.push(`clip ${clip.name}: ${boneName}.${channel} keys out of order at ${key[0]} ms`);
          if (key[0] < 0 || key[0] > clip.lengthMs) problems.push(`clip ${clip.name}: ${boneName}.${channel} key at ${key[0]} ms is outside the clip`);
          last = key[0];
          const v = key[1];
          if (channel === "rot" && bone.rot && (v < bone.rot[0] || v > bone.rot[1]))
            problems.push(`clip ${clip.name}: ${boneName}.rot ${v} leaves its limit [${bone.rot[0]}, ${bone.rot[1]}]`);
          if (channel === "squash" && (!bone.squash || v < bone.squash[0] || v > bone.squash[1]))
            problems.push(`clip ${clip.name}: ${boneName}.squash ${v} is not allowed (scale channels, section 5b)`);
          if (channel === "scale" && (!bone.scale || v < bone.scale[0] || v > bone.scale[1]))
            problems.push(`clip ${clip.name}: ${boneName}.scale ${v} is not allowed (scale channels, section 5b)`);
        }
      }
    }
    for (const event of clip.events ?? []) {
      if (event.at < 0 || event.at > clip.lengthMs) problems.push(`clip ${clip.name}: event ${event.type} at ${event.at} ms is outside the clip`);
      if (event.type === "order" && !(event.name && rig.drawOrderVariants?.[event.name]))
        problems.push(`clip ${clip.name}: order event names an unknown variant ${event.name}`);
    }
    for (const [group, keys] of Object.entries(clip.views ?? {})) {
      for (const [, view] of keys ?? []) if (!rig.views.includes(view)) problems.push(`clip ${clip.name}: ${group} view ${view} is unknown`);
    }
  }
  return problems;
}
