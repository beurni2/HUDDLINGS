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
    { name: "tail.1", parent: "body", x: 38, y: -20, rot: [-40, 40], spring },
    { name: "tail.2", parent: "tail.1", y: -20, rot: [-40, 40], spring: { ...spring, com: [0, -10] } },
    { name: "tag", parent: "body", y: -40, rot: [-5, 5], spring: { ...spring, hz: 4, com: [0, 12] } },
    // On the body's own pivot, so turning the body cannot move it: only follow acts.
    { name: "tuft", parent: "body", rot: [-20, 20], spring: { ...spring, com: [0, -10] } },
    // Turned 90° at rest, so its mass lies along x, in line with a sideways push.
    { name: "flag", parent: "body", x: 10, y: -30, rest: 90, rot: [-30, 30], spring: { ...spring, follow: 0, com: [0, -20] } },
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
  { name: "jolt", lengthMs: 200, tracks: { body: { x: [[0, 0], [16, 30, "step"], [33, -30, "step"], [50, 30, "step"], [66, -30, "step"], [83, 0, "step"]] } } },
  {
    name: "loop",
    lengthMs: 1000,
    loop: true,
    states: { eye: [[0, "open"], [600, "closed"]] },
    events: [
      { at: 0, type: "keyPose" },
      { at: 250, type: "order", name: "front:tailFront" },
      { at: 500, type: "sound", name: "hm" },
      { at: 750, type: "order" },
    ],
  },
  { name: "front", lengthMs: 1000, loop: true, events: [{ at: 500, type: "order", name: "front:tailFront" }] },
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

test("a spring at its limit loses its speed, so it comes off the limit as soon as the push ends", () => {
  const p = new Player(c, clips);
  p.play("push", 0);
  const tag = (t: number) => p.advanceTo(t).pose.angle[c.index.get("tag")!]!;
  close(tag(24 / 120), 5, 1e-12, "pinned at the limit while pushed");
  // The push ends at step 24; from step 26 the second difference no longer sees it.
  assert.ok(tag(27 / 120) < 5 - 0.1, "the tag should leave its limit within two steps of the push ending");
});

test("a violent jolt never takes a spring past its limit", () => {
  const p = new Player(c, clips);
  p.play("jolt", 0);
  let hitLimit = false;
  for (let i = 0; i <= 120; i++) {
    const f = p.advanceTo(i / 120);
    const body = f.pose.angle[c.index.get("body")!]!;
    const tag = f.pose.angle[c.index.get("tag")!]! - body;
    assert.ok(tag >= -5 - 1e-12 && tag <= 5 + 1e-12, `tag at ${tag}° at frame ${i}`);
    if (Math.abs(Math.abs(tag) - 5) < 1e-12) hitLimit = true;
  }
  assert.ok(hitLimit, "the jolt should be strong enough to reach the tag's limit");
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
  const expected = ["keyPose:", "order:front:tailFront", "sound:hm", "order:", "keyPose:", "order:front:tailFront", "sound:hm", "order:", "keyPose:", "order:front:tailFront", "sound:hm"];
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

test("an order event sets the draw-order variant, an unnamed one restores it, across loops", () => {
  const p = new Player(c, clips);
  p.play("loop", 0);
  const variant = (t: number) => p.advanceTo(t).state.variant;
  assert.equal(variant(0.1), undefined);
  assert.equal(variant(0.3), "front:tailFront");
  assert.equal(variant(0.8), undefined);
  assert.equal(variant(1.1), undefined);
  assert.equal(variant(1.3), "front:tailFront");
  // A variant set late in a loop holds through the wrap until the clip sets it again.
  const q = new Player(c, clips);
  q.play("front", 0);
  assert.equal(q.advanceTo(0.4).state.variant, undefined);
  assert.equal(q.advanceTo(1.1).state.variant, "front:tailFront");
});

test("time never goes backwards", () => {
  const p = new Player(c, clips);
  p.play("slide", 0);
  p.advanceTo(1);
  assert.throws(() => p.advanceTo(0.5), /backwards/);
  assert.throws(() => p.play("lean", 0.9), /backwards/);
});
