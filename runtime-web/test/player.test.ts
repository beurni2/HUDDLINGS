// Tests for the player, from characters/format/README.md (Playing, blending and the clock; Springs).
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Clip, Rig } from "../src/format.ts";
import { validate } from "../src/format.ts";
import { compile } from "../src/rig.ts";
import { Player, STEP_HZ } from "../src/player.ts";

const close = (a: number, b: number, eps = 1e-9, what = "") => assert.ok(Math.abs(a - b) <= eps, `${what} ${a} vs ${b}`);

const spring = { hz: 3, damping: 0.35, com: [0, -20] as [number, number], follow: 0.6, inertia: 1 };
const rig: Rig = {
  format: 1,
  species: "test",
  height: 164,
  bones: [
    { name: "root" },
    { name: "body", parent: "root", y: -8, rot: [-30, 30], squash: [0.9, 1.1] },
    { name: "tail.1", parent: "body", x: 38, y: -20, rot: [-40, 40], spring, views: { "side.R": { x: -40, y: -24 } } },
    { name: "tail.2", parent: "tail.1", y: -20, rot: [-40, 40], spring: { ...spring, com: [0, -10] } },
    { name: "tag", parent: "body", y: -40, rot: [-5, 5], spring: { ...spring, hz: 4, com: [0, 12] } },
    // On the body's own pivot, so turning the body cannot move it: only follow acts.
    { name: "tuft", parent: "body", rot: [-20, 20], spring: { ...spring, com: [0, -10] } },
    // Turned 90° at rest, so its mass lies along x, in line with a sideways push.
    { name: "flag", parent: "body", x: 10, y: -30, rest: 90, rot: [-30, 30], spring: { ...spring, follow: 0, com: [0, -20] } },
    // Feels only its own clip rotation.
    { name: "ear", parent: "body", x: 20, y: -50, rot: [-40, 40], spring: { ...spring, follow: 0, inertia: 0, selfFollow: 0.8, com: [0, -15] } },
  ],
  views: ["front", "side.R"],
  parts: [
    { name: "body", bone: "body", group: "body", regions: { front: "body" } },
    { name: "tail", bone: "tail.1", group: "body", regions: { front: "tail" } },
    { name: "eye", bone: "body", group: "body", defaultState: "open", regions: { "front:open": "eye/open", "front:closed": "eye/closed" } },
  ],
  drawOrder: { front: ["tail", "body", "eye"], "side.R": ["body", "tail", "eye"] },
  drawOrderVariants: { "front:tailFront": ["body", "tail", "eye"] },
};

const clips: Clip[] = [
  // The body slides 40 pt right over 300 ms, then stops dead: the tail must trail and settle.
  { name: "slide", lengthMs: 3000, tracks: { body: { x: [[0, 0], [300, 40, "easeInOut"]] } } },
  { name: "lean", lengthMs: 400, tracks: { body: { rot: [[0, 0], [400, 20, "easeInOut"]] } } },
  { name: "hold", lengthMs: 500, tracks: { body: { rot: [[0, -10]], x: [[0, 10]] } }, states: { eye: [[0, "closed"]] } },
  // The body speeds up for 200 ms, then glides at a steady speed: the push ends at once.
  { name: "push", lengthMs: 400, tracks: { body: { x: [[0, 0], [200, 60, "easeIn"], [400, 240]] } } },
  // The body jumps sideways between steps: a cut, not a push.
  { name: "jump", lengthMs: 200, tracks: { body: { x: [[0, 0], [16, 30, "step"], [33, -30, "step"], [50, 30, "step"], [66, -30, "step"], [83, 0, "step"]] } } },
  // The same shake as real motion, as fast as it can be.
  { name: "shake", lengthMs: 200, tracks: { body: { x: [[0, 0], [16, 30, "linear"], [33, -30, "linear"], [50, 30, "linear"], [66, -30, "linear"], [83, 0, "linear"]] } } },
  { name: "turn", lengthMs: 1000, views: { body: [[0, "front"], [500, "side.R"]] }, order: [[0, "tailFront"]] },
  { name: "perk", lengthMs: 1000, tracks: { ear: { rot: [[0, 0], [120, -30, "easeOut"]] } } },
  { name: "slow", lengthMs: 500, blendInMs: 300, tracks: { body: { rot: [[0, 20]] } } },
  {
    name: "loop",
    lengthMs: 1000,
    loop: true,
    states: { eye: [[0, "open"], [600, "closed"]] },
    order: [[0, null], [250, "tailFront"], [750, null]],
    events: [
      { at: 0, type: "keyPose" },
      { at: 250, type: "haptic", name: "tap" },
      { at: 500, type: "sound", name: "hm" },
      { at: 750, type: "effect", name: "sparkle" },
    ],
  },
  { name: "once", lengthMs: 300, events: [{ at: 0, type: "sound", name: "start" }, { at: 300, type: "sound", name: "end" }] },
];

const c = compile(rig);

test("the test rig and clips pass validation", () => {
  assert.deepEqual(validate(rig, clips), []);
});

function run(fps: number, seconds: number, clip = "slide"): Map<number, Record<string, number>> {
  const p = new Player(c, clips);
  p.play(clip, 0);
  const out = new Map<number, Record<string, number>>();
  for (let i = 0; i <= seconds * fps; i++) {
    const t = i / fps;
    const frame = p.advanceTo(t);
    const angles: Record<string, number> = {};
    for (const name of ["tail.1", "tail.2", "tag"]) angles[name] = frame.pose.angle[c.index.get(name)!]!;
    out.set(Math.round(t * 1000), angles);
  }
  return out;
}

test("springs give the same angles at 30, 60 and 120 frames per second", () => {
  const f120 = run(120, 2);
  for (const fps of [30, 60]) {
    for (const [ms, angles] of run(fps, 2)) {
      for (const [bone, a] of Object.entries(angles)) close(a, f120.get(ms)![bone]!, 1e-9, `${bone} at ${ms} ms, ${fps} fps`);
    }
  }
});

test("irregular frame times give the same springs at the same times", () => {
  const steady = run(120, 1.5);
  const p = new Player(c, clips);
  p.play("slide", 0);
  // Frames 4 to 37 ms apart, as a stuttering display would give.
  let t = 0;
  let i = 0;
  while (t < 1.5) {
    t = Math.min(1.5, t + (4 + ((i * 7919) % 34)) / 1000);
    i++;
    const frame = p.advanceTo(t);
    const ms = t * 1000;
    if (Math.abs(ms - Math.round(ms * 0.12) / 0.12) < 1e-6) {
      close(frame.pose.angle[c.index.get("tail.1")!]!, steady.get(Math.round(ms))!["tail.1"]!, 1e-9, `tail.1 at ${ms} ms`);
    }
  }
  const last = p.advanceTo(1.5);
  close(last.pose.angle[c.index.get("tail.2")!]!, steady.get(1500)!["tail.2"]!, 1e-9, "tail.2 at 1.5 s");
});

test("a body that slides and stops makes the tail trail, overshoot and settle", () => {
  const angles = run(120, 3);
  const tail = [...angles.entries()].map(([ms, a]) => [ms, a["tail.1"]! - 0] as const);
  // The pivot accelerates right, so a tail standing up (com above the pivot) swings left first: θ < 0.
  const early = tail.filter(([ms]) => ms > 0 && ms <= 150);
  assert.ok(Math.min(...early.map(([, a]) => a)) < -1, "the tail should trail the push");
  // Braking swings it the other way: it overshoots past rest.
  const late = tail.filter(([ms]) => ms > 150 && ms <= 800);
  assert.ok(Math.max(...late.map(([, a]) => a)) > 1, "the tail should overshoot when the body stops");
  // And it settles: within 0.1° after 2.5 s, never stopping dead before then.
  for (const [ms, a] of tail) if (ms >= 2500) assert.ok(Math.abs(a) < 0.1, `still swinging ${a.toFixed(3)}° at ${ms} ms`);
});

test("the swing uses the centre of mass turned into the world: a push along it swings nothing", () => {
  const p = new Player(c, clips);
  p.play("slide", 0);
  let tailSwing = 0;
  for (let i = 0; i <= 120; i++) {
    const f = p.advanceTo(i / 120);
    close(f.pose.angle[c.index.get("flag")!]!, 90, 1e-9, `flag at frame ${i}`);
    tailSwing = Math.max(tailSwing, Math.abs(f.pose.angle[c.index.get("tail.1")!]!));
  }
  assert.ok(tailSwing > 1, "the same push swings the upright tail");
});

test("a spring stays exactly at rest when nothing moves", () => {
  const p = new Player(c, clips);
  p.play("hold", 0);
  for (let i = 0; i <= 240; i++) {
    const f = p.advanceTo(i / 120);
    // The tail rides on the body's −10° but adds nothing of its own.
    assert.equal(f.pose.angle[c.index.get("tail.1")!], -10);
    assert.equal(f.pose.angle[c.index.get("tail.2")!], -10);
  }
});

test("follow makes a part lag its parent's turn", () => {
  const p = new Player(c, clips);
  p.play("lean", 0);
  let lagged = false;
  for (let i = 1; i <= 24; i++) {
    const f = p.advanceTo(i / 120);
    const body = f.pose.angle[c.index.get("body")!]!;
    const tail = f.pose.angle[c.index.get("tail.1")!]!;
    if (body > 0.5 && tail < body - 0.05) lagged = true;
  }
  assert.ok(lagged, "the tail should turn later than the body");
});

test("follow alone makes a part on its parent's pivot lag the turn", () => {
  const p = new Player(c, clips);
  p.play("lean", 0);
  const tuft = (t: number) => {
    const f = p.advanceTo(t);
    return f.pose.angle[c.index.get("tuft")!]! - f.pose.angle[c.index.get("body")!]!;
  };
  // The lean speeds up for its first 200 ms: the tuft falls behind (θ < 0), then catches up past it.
  const early = Array.from({ length: 20 }, (_, i) => tuft((i + 3) / 120));
  assert.ok(Math.min(...early) < -0.5, `the tuft should lag, least θ ${Math.min(...early).toFixed(3)}°`);
  const late = Array.from({ length: 30 }, (_, i) => tuft((i + 25) / 120));
  assert.ok(Math.max(...late) > 0.5, `the tuft should overshoot as the lean slows, most θ ${Math.max(...late).toFixed(3)}°`);
});

test("a spring pushed past its room eases into the limit, never reaches it, and is never frozen", () => {
  const p = new Player(c, clips);
  p.play("push", 0);
  let last: number | undefined;
  let deepest = 0;
  for (let i = 0; i <= 120; i++) {
    const tag = p.advanceTo(i / 120).pose.angle[c.index.get("tag")!]!;
    assert.ok(Math.abs(tag) < 5, `tag at ${tag}° at frame ${i}`);
    deepest = Math.max(deepest, Math.abs(tag));
    // The first steps after load feel no push (README, Springs), so start looking at frame 5.
    if (i >= 5 && i <= 30 && last !== undefined) assert.notEqual(tag, last, `the tag froze at frame ${i}`);
    last = tag;
  }
  assert.ok(deepest > 4.5, `the push should drive the tag deep into its knee, deepest ${deepest.toFixed(3)}°`);
  // Once the push is over it swings back out of the knee and settles.
  const later = Array.from({ length: 60 }, (_, i) => Math.abs(p.advanceTo(1 + (i + 1) / 120).pose.angle[c.index.get("tag")!]!));
  assert.ok(Math.min(...later) < 4, "the tag should come back out of its knee");
});

test("a violent shake keeps every spring inside its limit", () => {
  const p = new Player(c, clips);
  p.play("shake", 0);
  let deepest = 0;
  for (let i = 0; i <= 120; i++) {
    const f = p.advanceTo(i / 120);
    for (const name of ["tag", "tail.1", "tail.2"]) {
      const bone = c.index.get(name)!;
      const own = f.pose.angle[bone]! - f.pose.angle[c.rig.bones[bone]!.parent === "body" ? c.index.get("body")! : c.index.get("tail.1")!]!;
      const limit = c.rig.bones[bone]!.rot!;
      assert.ok(own > limit[0] && own < limit[1], `${name} at ${own}° at frame ${i}`);
    }
    deepest = Math.max(deepest, Math.abs(f.pose.angle[c.index.get("tag")!]!));
  }
  assert.ok(deepest > 4.5, "the shake should reach deep into the tag's knee");
});

test("a jump between steps (a step key) moves the body without kicking the springs", () => {
  const p = new Player(c, clips);
  p.play("jump", 0);
  for (let i = 0; i <= 60; i++) {
    const f = p.advanceTo(i / 120);
    assert.equal(f.pose.angle[c.index.get("tag")!], 0, `frame ${i}`);
    assert.equal(f.pose.angle[c.index.get("tail.1")!], 0, `frame ${i}`);
  }
});

test("a view swap that moves a pivot does not kick its spring", () => {
  const p = new Player(c, clips);
  p.play("turn", 0);
  for (let i = 0; i <= 120; i++) assert.equal(p.advanceTo(i / 120).pose.angle[c.index.get("tail.1")!], 0, `frame ${i}`);
});

test("a switch with no blend jumps the pose without kicking the springs", () => {
  const p = new Player(c, clips);
  p.play("hold", 0);
  p.advanceTo(0.5);
  // The body jumps from x = 10, −10° to the slide's start. The springs were at rest,
  // so from here they must swing exactly as they do when the slide starts fresh.
  p.play("slide", 0.5, 0);
  const fresh = new Player(c, clips);
  fresh.play("slide", 0);
  for (let i = 1; i <= 60; i++) {
    const a = p.advanceTo(0.5 + i / 120).pose.angle;
    const b = fresh.advanceTo(i / 120).pose.angle;
    for (const name of ["tail.1", "tail.2", "tag"]) close(a[c.index.get(name)!]!, b[c.index.get(name)!]!, 1e-9, `${name} at step ${i}`);
  }
});

test("selfFollow makes a part overshoot its own clip turn, then settle on it", () => {
  const p = new Player(c, clips);
  p.play("perk", 0);
  const ear = (t: number) => p.advanceTo(t).pose.angle[c.index.get("ear")!]!;
  const after = Array.from({ length: 48 }, (_, i) => ear((i + 15) / 120));
  assert.ok(Math.min(...after) < -31, `the ear should swing past −30°, least ${Math.min(...after).toFixed(3)}°`);
  close(ear(2.5), -30, 0.05, "and settle on −30°");
});

test("the frame draws springs between the last two steps", () => {
  const at = (t: number) => {
    const q = new Player(c, clips);
    q.play("slide", 0);
    return q.advanceTo(t).pose.angle[c.index.get("tail.1")!]!;
  };
  const a = at(10 / STEP_HZ);
  const b = at(11 / STEP_HZ);
  close(at(10.25 / STEP_HZ), a + (b - a) * 0.25, 1e-9, "a quarter of the way between steps");
});

test("switching clips blends without a pop, even from a blend in progress", () => {
  const p = new Player(c, clips);
  p.play("lean", 0);
  p.advanceTo(0.2);
  const before = p.channelsAt(0.2).body!.rot!;
  p.play("hold", 0.2, 200);
  close(p.channelsAt(0.2).body!.rot!, before, 1e-12, "at the switch");
  // A third clip 60 ms into the blend starts from the blended pose, not from either clip.
  const mid = p.channelsAt(0.26).body!.rot!;
  p.play("lean", 0.26, 200);
  close(p.channelsAt(0.26).body!.rot!, mid, 1e-12, "at the second switch");
  // Continuous all the way through: a microsecond never moves it more than a thousandth of a degree.
  for (let i = 0; i <= 880; i++) {
    const t = 0.26 + i * 0.0005;
    const v = p.channelsAt(t).body!.rot!;
    const next = p.channelsAt(t + 1e-6).body!.rot!;
    assert.ok(Math.abs(next - v) < 1e-3, `jump of ${(next - v).toFixed(5)}° at ${t.toFixed(4)} s`);
  }
  // After the blend the new clip plays alone.
  close(p.channelsAt(0.7).body!.rot!, 20);
});

test("a channel the new clip leaves alone blends back to rest", () => {
  const p = new Player(c, clips);
  p.play("hold", 0);
  p.play("lean", 0.1, 200);
  const x = (t: number) => p.channelsAt(t).body?.x ?? 0;
  close(x(0.1), 10);
  close(x(0.2), 5, 1e-12, "halfway, easeInOut is at 0.5");
  close(x(0.3), 0);
});

test("a clip's own blend time is used when the switch names none", () => {
  const p = new Player(c, clips);
  p.play("hold", 0);
  p.play("slow", 1);
  close(p.channelsAt(1.15).body!.rot!, 5, 1e-12, "halfway through a 300 ms blend");
});

test("discrete tracks switch to the new clip when its weight reaches 0.5", () => {
  const p = new Player(c, clips);
  p.play("hold", 0);
  p.play("loop", 1, 200);
  assert.equal(p.advanceTo(1.099).state.states.eye, "closed");
  assert.equal(p.advanceTo(1.1).state.states.eye, "open");
});

test("events fire once each, in order, across loop wraps, whatever the frame rate", () => {
  const collect = (times: number[]) => {
    const p = new Player(c, clips);
    p.play("loop", 0);
    return times.flatMap((t) => p.advanceTo(t).events.map((e) => `${e.type}:${e.name ?? ""}`));
  };
  const frames = (fps: number) => Array.from({ length: 2.6 * fps + 1 }, (_, i) => i / fps);
  const expected = ["keyPose:", "haptic:tap", "sound:hm", "effect:sparkle", "keyPose:", "haptic:tap", "sound:hm", "effect:sparkle", "keyPose:", "haptic:tap", "sound:hm"];
  assert.deepEqual(collect(frames(120)), expected);
  assert.deepEqual(collect(frames(30)), expected);
  assert.deepEqual(collect(frames(7)), expected);
  // One long frame still fires every crossing, in time order.
  assert.deepEqual(collect([0, 2.6]), expected);
});

test("a clip's events up to a switch still arrive, and a new clip fires its own from its start", () => {
  const p = new Player(c, clips);
  p.play("once", 0);
  assert.deepEqual(p.advanceTo(0).events.map((e) => e.name), ["start"]);
  p.advanceTo(0.2);
  p.play("loop", 0.35);
  // "end" at 300 ms happened before the switch at 350 ms.
  assert.deepEqual(p.advanceTo(0.35).events.map((e) => `${e.type}:${e.name ?? ""}`), ["sound:end", "keyPose:"]);
});

test("the order track picks the body's draw-order variant for the current view, and wraps with the loop", () => {
  const p = new Player(c, clips);
  p.play("loop", 0);
  const variant = (t: number) => p.advanceTo(t).state.variant;
  assert.equal(variant(0.1), undefined);
  assert.equal(variant(0.3), "front:tailFront");
  assert.equal(variant(0.8), undefined);
  assert.equal(variant(1.1), undefined);
  assert.equal(variant(1.3), "front:tailFront");
  // A variant the new view lacks falls back to that view's own order.
  const q = new Player(c, clips);
  q.play("turn", 0);
  assert.equal(q.advanceTo(0.2).state.variant, "front:tailFront");
  assert.equal(q.advanceTo(0.6).state.variant, undefined);
});

test("time never goes backwards", () => {
  const p = new Player(c, clips);
  p.play("slide", 0);
  p.advanceTo(1);
  assert.throws(() => p.advanceTo(0.5), /backwards/);
  assert.throws(() => p.play("lean", 0.9), /backwards/);
});
