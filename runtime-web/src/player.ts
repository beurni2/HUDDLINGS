// Playing clips on a rig: the clock, blending, springs at a fixed 120 Hz, discrete
// tracks and events (characters/format/README.md, Playing, blending and the clock;
// Springs). The host gives absolute times; the player never reads a wall clock.
import type { Channel, Clip, ClipEvent, Spring } from "./format.ts";
import { localTime, restValue, sampleDiscrete, sampleKeys } from "./clip.ts";
import { DEG, ease } from "./math.ts";
import { evaluatePose, springAngle, type Channels, type CompiledRig, type FrameState, type Pose } from "./rig.ts";

export const STEP_HZ = 120;
const H = 1 / STEP_HZ;
const CHANNELS: Channel[] = ["rot", "x", "y", "squash", "scale", "yaw", "pitch"];
/** Times closer than this (seconds) count as equal, so n/120 computed two ways still matches. */
const EPS = 1e-9;
export const DEFAULT_BLEND_MS = 200;

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
  /** Over the last three steps, newest last: the pivot's world position, the parent's world angle, the bone's own rest + clip angle. */
  pivots: [number, number][];
  parentAngles: number[];
  ownAngles: number[];
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
  private springOf: Map<number, SpringState>;
  private pending: ClipEvent[] = [];
  private defaultViews: { body: string; head: string };
  private lastStepViews: { body: string; head: string } | undefined;
  private cutPending = false;

  constructor(rig: CompiledRig, clips: Clip[]) {
    this.rig = rig;
    this.clips = new Map(clips.map((c) => [c.name, c]));
    this.springs = rig.rig.bones.flatMap((bone, i) =>
      bone.spring && bone.rot
        ? [{ bone: i, spring: bone.spring, limit: bone.rot, theta: 0, velocity: 0, previousTheta: 0, pivots: [], parentAngles: [], ownAngles: [] }]
        : [],
    );
    this.springOf = new Map(this.springs.map((sp) => [sp.bone, sp]));
    const first = rig.rig.views[0]!;
    this.defaultViews = { body: first, head: first };
  }

  /**
   * Starts a clip at time t (seconds), blending from whatever plays over blendMs
   * (the clip's blendInMs, else 200 ms). The old clip's events up to t still reach
   * the next frame; after t only the new clip's fire.
   */
  play(name: string, t: number, blendMs?: number): void {
    const clip = this.clips.get(name);
    if (!clip) throw new Error(`no clip named ${name}`);
    this.checkTime(t);
    const blend = (blendMs ?? clip.blendInMs ?? DEFAULT_BLEND_MS) / 1000;
    if (this.mixer) {
      this.pending.push(...this.collectEvents(this.mixer, t));
      if (blend <= 0) this.cutPending = true;
    }
    this.mixer = { clip, start: t, from: this.mixer, blendSeconds: this.mixer ? blend : 0, firedTo: -Infinity };
  }

  /** Tells the springs the companion jumped (placed somewhere new): they keep swinging but feel no kick. */
  cut(): void {
    this.cutPending = true;
  }

  /** Runs the springs up to time t (seconds) and returns the frame to draw at t. */
  advanceTo(t: number): Frame {
    this.checkTime(t);
    while ((this.steps + 1) / STEP_HZ <= t + EPS) {
      this.steps++;
      this.step(this.steps / STEP_HZ, (this.steps - 1) / STEP_HZ);
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
      const local = localTime(m.clip, (t - m.start) * 1000);
      if (m.clip.views?.body) views.body = sampleDiscrete(m.clip.views.body, local);
      if (m.clip.views?.head) views.head = sampleDiscrete(m.clip.views.head, local);
      for (const [part, keys] of Object.entries(m.clip.states ?? {})) states[part] = sampleDiscrete(keys, local);
      const order = m.clip.order ? sampleDiscrete(m.clip.order, local) : null;
      if (order !== null && this.rig.rig.drawOrderVariants?.[`${views.body}:${order}`]) variant = `${views.body}:${order}`;
    }
    return { views, states, variant };
  }

  /** The clip's events with elapsed time in (firedTo, t], in time order, counting each loop. */
  private collectEvents(m: Mixer, t: number): ClipEvent[] {
    const events = m.clip.events ?? [];
    const to = (t - m.start) * 1000 + EPS * 1000;
    if (events.length === 0 || to <= m.firedTo) return [];
    const fired: [number, number, ClipEvent][] = [];
    forEachCrossing(m.clip, events.map((e) => e.at), m.firedTo, to, (at, i) => fired.push([at, i, events[i]!]));
    m.firedTo = to;
    return fired.sort((a, b) => a[0] - b[0] || a[1] - b[1]).map(([, , e]) => e);
  }

  /** True when a channel jumps (a `step` key) between two step times in any clip that is mixing. */
  private stepKeyCrossed(m: Mixer | undefined, from: number, to: number): boolean {
    for (; m; m = m.from) {
      const a = (from - m.start) * 1000 + EPS * 1000;
      const b = (to - m.start) * 1000 + EPS * 1000;
      for (const tracks of Object.values(m.clip.tracks ?? {})) {
        for (const keys of Object.values(tracks)) {
          const jumps = keys!.filter((k) => k[2] === "step").map((k) => k[0]);
          let crossed = false;
          if (jumps.length) forEachCrossing(m.clip, jumps, a, b, () => (crossed = true));
          if (crossed) return true;
        }
      }
    }
    return false;
  }

  /** One spring step at time s: the springs feel their parents' motion in this step's pose. */
  private step(s: number, previous: number): void {
    if (this.springs.length === 0) return;
    const views = this.stateAt(s).views;
    const viewsChanged = this.lastStepViews !== undefined && (views.body !== this.lastStepViews.body || views.head !== this.lastStepViews.head);
    const cut = this.cutPending || viewsChanged || this.stepKeyCrossed(this.mixer, previous, s);
    this.cutPending = false;
    this.lastStepViews = views;
    // Bones come parents first, so a spring feels its parent's spring from this same step.
    evaluatePose(this.rig, { channels: this.channelsAt(s), views }, (bone, pivot, parentAngle, rest, clipRot) => {
      const sp = this.springOf.get(bone)!;
      integrate(sp, cut, pivot, parentAngle, rest, clipRot);
      return sp.theta;
    });
  }
}

/**
 * Calls back for each time in `times` (ms within the clip) whose elapsed position
 * lies in (from, to], counting a looping clip's every pass.
 */
function forEachCrossing(clip: Clip, times: number[], from: number, to: number, hit: (at: number, index: number) => void): void {
  const length = clip.lengthMs;
  const loops = clip.loop && length > 0;
  const first = loops ? Math.max(0, Math.floor(from / length)) : 0;
  const last = loops ? Math.floor(to / length) : 0;
  for (let k = first; k <= last; k++) {
    times.forEach((time, i) => {
      const at = k * length + time;
      if (at > from && at <= to) hit(at, i);
    });
  }
}

function push<T>(history: T[], value: T, cut: boolean): void {
  if (cut) history.length = 0;
  history.push(value);
  if (history.length > 3) history.shift();
}

/** Second difference over the last three steps, per second squared; zero until there are three. */
function accel(h: number[]): number {
  return h.length === 3 ? (h[2]! - 2 * h[1]! + h[0]!) / (H * H) : 0;
}

/** Semi-implicit Euler for one spring (README, Springs). */
function integrate(sp: SpringState, cut: boolean, pivot: [number, number], parentAngle: number, rest: number, clipRot: number): void {
  push(sp.pivots, pivot, cut);
  push(sp.parentAngles, parentAngle, cut);
  push(sp.ownAngles, rest + clipRot, cut);
  const ax = accel(sp.pivots.map((p) => p[0]));
  const ay = accel(sp.pivots.map((p) => p[1]));
  const { spring } = sp;
  // The centre of mass in world space, turned by the bone's drawn world angle before this step.
  const turn = (parentAngle + rest + clipRot + springAngle(sp.theta, clipRot, sp.limit)) * DEG;
  const cos = Math.cos(turn), sin = Math.sin(turn);
  const rx = cos * spring.com[0] - sin * spring.com[1];
  const ry = sin * spring.com[0] + cos * spring.com[1];
  const swing = (-(rx * ay - ry * ax) / (rx * rx + ry * ry)) / DEG;
  const omega = 2 * Math.PI * spring.hz;
  const thetaAccel =
    -omega * omega * sp.theta -
    2 * spring.damping * omega * sp.velocity -
    spring.follow * accel(sp.parentAngles) -
    (spring.selfFollow ?? 0) * accel(sp.ownAngles) +
    spring.inertia * swing;
  sp.previousTheta = sp.theta;
  sp.velocity += H * thetaAccel;
  sp.theta += H * sp.velocity;
}
