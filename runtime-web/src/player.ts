// Playing clips on a rig: the clock, blending, springs at a fixed 120 Hz, discrete
// tracks and events (characters/format/README.md, Playing, blending and the clock;
// Springs). The host gives absolute times; the player never reads a wall clock.
import type { Channel, Clip, ClipEvent, Spring } from "./format.ts";
import { localTime, restValue, sampleDiscrete, sampleKeys } from "./clip.ts";
import { apply, compose, DEG, ease, IDENTITY, type Affine } from "./math.ts";
import { evaluatePose, restOf, type Channels, type CompiledRig, type FrameState, type Pose } from "./rig.ts";

export const STEP_HZ = 120;
const H = 1 / STEP_HZ;
const CHANNELS: Channel[] = ["rot", "x", "y", "squash", "scale", "yaw", "pitch"];
/** Times closer than this (seconds) count as equal, so n/120 computed two ways still matches. */
const EPS = 1e-9;

interface Mixer {
  clip: Clip;
  /** When the clip started, in seconds. */
  start: number;
  /** The clip it blends from, until the blend ends. */
  from?: Mixer;
  blendSeconds: number;
  /** Elapsed ms up to which this clip's events have fired. */
  firedTo: number;
}

interface SpringState {
  bone: number;
  spring: Spring;
  limit: [number, number];
  /** θ and θ′ after the last step, and θ one step before (for drawing between steps). */
  theta: number;
  velocity: number;
  previousTheta: number;
  /** The pivot's world position and the parent's world angle over the last three steps, newest last. */
  pivots: [number, number][];
  angles: number[];
}

export interface Frame {
  pose: Pose;
  state: FrameState;
  /** Events crossed since the last frame, in time order. */
  events: ClipEvent[];
}

export class Player {
  readonly rig: CompiledRig;
  private clips: Map<string, Clip>;
  private mixer: Mixer | undefined;
  private steps = 0;
  private now = 0;
  private springs: SpringState[];
  private pending: ClipEvent[] = [];
  private defaultViews: { body: string; head: string };

  constructor(rig: CompiledRig, clips: Clip[]) {
    this.rig = rig;
    this.clips = new Map(clips.map((c) => [c.name, c]));
    this.springs = rig.rig.bones.flatMap((bone, i) =>
      bone.spring && bone.rot
        ? [{ bone: i, spring: bone.spring, limit: bone.rot, theta: 0, velocity: 0, previousTheta: 0, pivots: [], angles: [] }]
        : [],
    );
    const first = rig.rig.views[0]!;
    this.defaultViews = { body: first, head: first };
  }

  /**
   * Starts a clip at time t (seconds), blending from whatever plays over blendMs.
   * The old clip's events up to t still reach the next frame; after t only the new clip's fire.
   */
  play(name: string, t: number, blendMs = 200): void {
    const clip = this.clips.get(name);
    if (!clip) throw new Error(`no clip named ${name}`);
    this.checkTime(t);
    if (this.mixer) this.pending.push(...this.collectEvents(this.mixer, t));
    this.mixer = { clip, start: t, from: this.mixer, blendSeconds: this.mixer ? blendMs / 1000 : 0, firedTo: -Infinity };
  }

  /** Runs the springs up to time t (seconds) and returns the frame to draw at t. */
  advanceTo(t: number): Frame {
    this.checkTime(t);
    while ((this.steps + 1) / STEP_HZ <= t + EPS) {
      this.steps++;
      this.step(this.steps / STEP_HZ);
    }
    const alpha = Math.min(Math.max((t - this.steps / STEP_HZ) * STEP_HZ, 0), 1);
    const springs: Record<string, number> = {};
    for (const s of this.springs) springs[this.rig.rig.bones[s.bone]!.name] = s.previousTheta + (s.theta - s.previousTheta) * alpha;
    const state = this.stateAt(t);
    const channels = this.channelsAt(t);
    const pose = evaluatePose(this.rig, { channels, springs, views: state.views });
    const turnBone = this.rig.rig.fakeTurn?.bone;
    if (turnBone) state.turn = channels[turnBone];
    const events = this.pending;
    if (this.mixer) events.push(...this.collectEvents(this.mixer, t));
    this.pending = [];
    return { pose, state, events };
  }

  /** The clip channels at time t, blended. */
  channelsAt(t: number): Record<string, Channels> {
    return this.mixer ? this.evaluate(this.mixer, t) : {};
  }

  private checkTime(t: number): void {
    if (!(t >= this.now - EPS)) throw new Error(`time went backwards: ${t} s after ${this.now} s`);
    this.now = Math.max(this.now, t);
  }

  private evaluate(m: Mixer, t: number): Record<string, Channels> {
    const local = localTime(m.clip, (t - m.start) * 1000);
    const out: Record<string, Channels> = {};
    for (const [bone, tracks] of Object.entries(m.clip.tracks ?? {})) {
      const ch: Channels = {};
      for (const name of CHANNELS) {
        const keys = tracks[name];
        if (keys) ch[name] = sampleKeys(keys, local);
      }
      out[bone] = ch;
    }
    if (!m.from) return out;
    const w = this.weight(m, t);
    if (w >= 1) {
      m.from = undefined; // time only moves forward, so the blend is over for good
      return out;
    }
    const from = this.evaluate(m.from, t);
    const blended: Record<string, Channels> = {};
    for (const bone of new Set([...Object.keys(from), ...Object.keys(out)])) {
      const a = from[bone] ?? {};
      const b = out[bone] ?? {};
      const ch: Channels = {};
      for (const name of CHANNELS) {
        if (a[name] === undefined && b[name] === undefined) continue;
        const va = a[name] ?? restValue(name);
        const vb = b[name] ?? restValue(name);
        ch[name] = va + (vb - va) * w;
      }
      blended[bone] = ch;
    }
    return blended;
  }

  /** The blend weight of a clip over the one it replaces: easeInOut over its blend time. */
  private weight(m: Mixer, t: number): number {
    if (m.blendSeconds <= 0) return 1;
    const u = Math.min(Math.max((t - m.start) / m.blendSeconds, 0), 1);
    return ease("easeInOut", u);
  }

  /** The clip whose discrete tracks and draw order show at t: the newest once its weight reaches 0.5. */
  private discreteSource(t: number): Mixer | undefined {
    let m = this.mixer;
    while (m && m.from && this.weight(m, t) < 0.5) m = m.from;
    return m;
  }

  private stateAt(t: number): FrameState {
    const views = { ...this.defaultViews };
    const states: Record<string, string> = {};
    const m = this.discreteSource(t);
    let variant: string | undefined;
    if (m) {
      const elapsed = (t - m.start) * 1000;
      const local = localTime(m.clip, elapsed);
      if (m.clip.views?.body) views.body = sampleDiscrete(m.clip.views.body, local);
      if (m.clip.views?.head) views.head = sampleDiscrete(m.clip.views.head, local);
      for (const [part, keys] of Object.entries(m.clip.states ?? {})) states[part] = sampleDiscrete(keys, local);
      variant = variantAt(m.clip, elapsed);
    }
    return { views, states, variant };
  }

  /** The clip's events with elapsed time in (firedTo, t], in time order, counting each loop. */
  private collectEvents(m: Mixer, t: number): ClipEvent[] {
    const events = m.clip.events ?? [];
    const to = (t - m.start) * 1000 + EPS * 1000;
    if (events.length === 0 || to <= m.firedTo) return [];
    const length = m.clip.lengthMs;
    const fired: [number, number, ClipEvent][] = [];
    const firstLoop = m.clip.loop && length > 0 ? Math.max(0, Math.floor(m.firedTo / length)) : 0;
    const lastLoop = m.clip.loop && length > 0 ? Math.floor(to / length) : 0;
    for (let k = firstLoop; k <= lastLoop; k++) {
      events.forEach((e, i) => {
        const at = k * length + e.at;
        if (at > m.firedTo && at <= to) fired.push([at, i, e]);
      });
    }
    m.firedTo = to;
    return fired.sort((a, b) => a[0] - b[0] || a[1] - b[1]).map(([, , e]) => e);
  }

  /** One spring step at time s: the springs feel their parents' motion in this step's pose. */
  private step(s: number): void {
    if (this.springs.length === 0) return;
    const c = this.rig;
    const channels = this.channelsAt(s);
    const views = this.stateAt(s).views;
    const bones = c.rig.bones;
    const world: Affine[] = new Array(bones.length);
    const angle: number[] = new Array(bones.length);
    const springOf = new Map(this.springs.map((sp) => [sp.bone, sp]));
    // Bones come parents first, so a spring feels its parent's spring from this same step.
    for (let i = 0; i < bones.length; i++) {
      const bone = bones[i]!;
      const ch = channels[bone.name] ?? {};
      const rest = restOf(bone, c.inHead[i] ? views.head : views.body);
      const p = c.parent[i]!;
      const parentWorld = p >= 0 ? world[p]! : IDENTITY;
      const parentAngle = p >= 0 ? angle[p]! : 0;
      const x = rest.x + (ch.x ?? 0);
      const y = rest.y + (ch.y ?? 0);
      const clipRot = rest.rest + (ch.rot ?? 0);
      const sp = springOf.get(i);
      if (sp) integrate(sp, apply(parentWorld, x, y), parentAngle, clipRot);
      const rot = clipRot + (sp ? sp.theta : 0);
      const squash = ch.squash ?? 1;
      const scale = ch.scale ?? 1;
      world[i] = compose(parentWorld, x, y, rot, scale / squash, scale * squash);
      angle[i] = parentAngle + rot;
    }
  }
}

/** The draw-order variant at elapsed ms: the last order event passed, carried across a loop's wrap. */
function variantAt(clip: Clip, elapsed: number): string | undefined {
  const orders = (clip.events ?? []).filter((e) => e.type === "order").sort((a, b) => a.at - b.at);
  if (orders.length === 0) return undefined;
  const local = localTime(clip, elapsed);
  let last: ClipEvent | undefined;
  for (const e of orders) if (e.at <= local + EPS * 1000) last = e;
  if (!last && clip.loop && elapsed >= clip.lengthMs) last = orders[orders.length - 1];
  return last?.name;
}

/** Semi-implicit Euler for one spring (README, Springs). */
function integrate(sp: SpringState, pivot: [number, number], parentAngle: number, clipRot: number): void {
  sp.pivots.push(pivot);
  sp.angles.push(parentAngle);
  if (sp.pivots.length > 3) {
    sp.pivots.shift();
    sp.angles.shift();
  }
  let ax = 0, ay = 0, parentAccel = 0;
  if (sp.pivots.length === 3) {
    const [p0, p1, p2] = sp.pivots as [[number, number], [number, number], [number, number]];
    ax = (p2[0] - 2 * p1[0] + p0[0]) / (H * H);
    ay = (p2[1] - 2 * p1[1] + p0[1]) / (H * H);
    const [a0, a1, a2] = sp.angles as [number, number, number];
    parentAccel = (a2 - 2 * a1 + a0) / (H * H);
  }
  // The centre of mass in world space, turned by the bone's world angle (parent + clip + spring).
  const { spring } = sp;
  const turn = (parentAngle + clipRot + sp.theta) * DEG;
  const cos = Math.cos(turn), sin = Math.sin(turn);
  const rx = cos * spring.com[0] - sin * spring.com[1];
  const ry = sin * spring.com[0] + cos * spring.com[1];
  const swing = (-(rx * ay - ry * ax) / (rx * rx + ry * ry)) / DEG;
  const omega = 2 * Math.PI * spring.hz;
  const accel = -omega * omega * sp.theta - 2 * spring.damping * omega * sp.velocity - spring.follow * parentAccel + spring.inertia * swing;
  sp.previousTheta = sp.theta;
  sp.velocity += H * accel;
  sp.theta += H * sp.velocity;
  if (sp.theta < sp.limit[0] || sp.theta > sp.limit[1]) {
    sp.theta = Math.min(Math.max(sp.theta, sp.limit[0]), sp.limit[1]);
    sp.velocity = 0;
  }
}
