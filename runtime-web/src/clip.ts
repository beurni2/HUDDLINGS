// Sampling a clip's keys at a time (characters/format/README.md, Clips).

import type { Channel, Clip, Key } from "./format.ts";
import { ease } from "./math.ts";

/** The easing of a key that names none: motion is never evenly spaced unless a key asks for linear. */
export const DEFAULT_EASING = "easeInOut";

/**
 * A channel's value at time t (ms). A key's easing shapes the segment that ends
 * at it; before the first key and after the last, the channel holds.
 */
export function sampleKeys(keys: readonly Key[], t: number): number {
  const first = keys[0];
  if (!first) throw new Error("a channel needs at least one key");
  if (t <= first[0]) return first[1];
  for (let i = 1; i < keys.length; i++) {
    const to = keys[i]!;
    if (t < to[0]) {
      const from = keys[i - 1]!;
      const span = to[0] - from[0];
      const u = span > 0 ? (t - from[0]) / span : 1;
      return from[1] + (to[1] - from[1]) * ease(to[2] ?? DEFAULT_EASING, u);
    }
  }
  return keys[keys.length - 1]![1];
}

/** A discrete track's value at time t: each value holds from its key until the next. */
export function sampleDiscrete<T = string>(keys: readonly (readonly [number, T])[], t: number): T {
  if (keys.length === 0) throw new Error("a discrete track needs at least one key");
  let value = keys[0]![1];
  for (const [time, v] of keys) {
    if (time <= t) value = v;
    else break;
  }
  return value;
}

/** The value a channel has when a clip does not key it. */
export function restValue(channel: Channel): number {
  return channel === "squash" || channel === "scale" ? 1 : 0;
}

/** A clip's local time for a time since it started, wrapping when it loops. */
export function localTime(clip: Clip, elapsedMs: number): number {
  if (!clip.loop) return Math.min(Math.max(elapsedMs, 0), clip.lengthMs);
  const t = elapsedMs % clip.lengthMs;
  return t < 0 ? t + clip.lengthMs : t;
}
