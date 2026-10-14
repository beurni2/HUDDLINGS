// Writes the test vectors both runtimes must reproduce (characters/format/README.md,
// Test vectors). The web runtime computes them; the SpriteKit runtime's tests
// read them and must match within 1e-9. Run: npm run vectors
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { apply, catmullRom, compose, ease, fnv1a32, IDENTITY, mulberry32, randomStream, softLimit, type Easing } from "../../runtime-web/src/math.ts";
import { sampleDiscrete, sampleKeys } from "../../runtime-web/src/clip.ts";
import { validate, type Clip, type DiscreteKey, type Key, type Rig } from "../../runtime-web/src/format.ts";
import { compile, drawList, evaluatePose, type Channels, type FrameState } from "../../runtime-web/src/rig.ts";
import { Player } from "../../runtime-web/src/player.ts";
import { readSource } from "../build/build.ts";
import { buildAtlas } from "../build/atlas.ts";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "vectors");
mkdirSync(out, { recursive: true });

function write(name: string, data: unknown) {
  writeFileSync(join(out, `${name}.json`), JSON.stringify(data, null, 1) + "\n");
  console.log(`wrote vectors/${name}.json`);
}

const us = Array.from({ length: 41 }, (_, i) => i / 40).concat([0.001, 0.333, 0.4999, 0.5001, 0.999]);
const easings: Easing[] = [
  "linear", "step", "easeIn", "easeOut", "easeInOut", "easeOutBack", ["easeOutBack", 0.5], ["easeOutBack", 2.5],
  ["bezier", 0.42, 0, 0.58, 1], ["bezier", 0.34, 1.56, 0.64, 1], ["bezier", 0, 0.5, 1, 0.5], ["bezier", 0.9, 0.1, 0.1, 0.9],
];
write("easing", [
  ...easings.map((easing) => ({ easing, u: us, value: us.map((u) => ease(easing, u)) })),
  // Curves where Newton gives up and bisection finishes the solve.
  ...([[0.8388511836528778, 1.525847083888948, 0.9993032873608172, -0.20658456766977906, 0.9958772968966514],
    [1, 0, 1, 1, 0.999], [0, 0, 0, 1, 0.001], [0.95, 0, 1, 1, 0.97], [0, 1, 0.05, 1, 0.02]] as const).map(([x1, y1, x2, y2, u]) => {
    const easing: Easing = ["bezier", x1, y1, x2, y2];
    return { easing, u: [u], value: [ease(easing, u)] };
  }),
]);

const seeds = [0, 1, 42, 0xdeadbeef, 0xffffffff];
write("random", seeds.map((seed) => {
  const next = mulberry32(seed);
  return { seed, values: Array.from({ length: 64 }, () => next()) };
}));

// Named random streams: FNV-1a of the name, XORed into the seed.
const names = ["blink", "gaze", "ear.L.twitch", "variation:head_tilt", "", "é and ü"];
write("streams", seeds.flatMap((seed) => names.map((name) => {
  const next = randomStream(seed, name);
  return { seed, name, hash: fnv1a32(name), values: Array.from({ length: 16 }, () => next()) };
})));

const transforms: { chain: [number, number, number, number, number][]; point: [number, number]; result: [number, number] }[] = [];
const rng = mulberry32(7);
for (let i = 0; i < 40; i++) {
  const chain: [number, number, number, number, number][] = [];
  let m = IDENTITY;
  for (let j = 0; j < 1 + (i % 5); j++) {
    const step: [number, number, number, number, number] = [
      (rng() - 0.5) * 200, (rng() - 0.5) * 200, (rng() - 0.5) * 360, 0.8 + rng() * 0.4, 0.8 + rng() * 0.4,
    ];
    chain.push(step);
    m = compose(m, ...step);
  }
  const point: [number, number] = [(rng() - 0.5) * 50, (rng() - 0.5) * 50];
  transforms.push({ chain, point, result: apply(m, point[0], point[1]) });
}
write("transform", transforms);

const catmull = Array.from({ length: 30 }, (_, i) => {
  const p = [rng() * 10, rng() * 10, rng() * 10, rng() * 10] as const;
  const t = i / 29;
  return { p, t, value: catmullRom(p[0], p[1], p[2], p[3], t) };
});
write("catmull", catmull);

// The soft limit, across and far beyond the knee, with rooms on both sides and none.
const limits = [[-40, 40], [-10, 25], [0, 14], [-14, 0], [-0.5, 0.5]] as const;
const limited: { x: number; lo: number; hi: number; value: number }[] = [];
for (const [lo, hi] of limits) {
  for (const share of [-50, -1.2, -1, -0.95, -0.8, -0.5, 0, 0.3, 0.8, 0.81, 0.9, 1, 1.5, 50]) {
    const x = share * (share < 0 ? -lo : hi) || share * 10;
    limited.push({ x, lo, hi, value: softLimit(x, lo, hi) });
  }
}
write("soft-limit", limited);

const headTilt: Key[] = [[0, 0, "easeInOut"], [420, -16, "easeOutBack"], [1200, -16], [1620, 14, "easeInOut"], [2200, 14], [2600, 0, "easeInOut"]];
const bezierKeys: Key[] = [[0, 1], [150, 0.95, ["bezier", 0.25, 0.1, 0.25, 1]], [300, 1.04, "easeOut"], [500, 1, "step"], [500, 1.02], [800, 1]];
// Keys that name no easing ease in and out; linear has to be asked for.
const plainKeys: Key[] = [[0, 0], [300, 10], [600, -5, "linear"], [900, 3]];
const times = Array.from({ length: 141 }, (_, i) => i * 20 - 10);
const discrete: DiscreteKey[] = [[0, "open"], [1200, "closed"], [1340, "open"]];
write("keys", {
  channels: [
    { keys: headTilt, t: times, value: times.map((t) => sampleKeys(headTilt, t)) },
    { keys: bezierKeys, t: times, value: times.map((t) => sampleKeys(bezierKeys, t)) },
    { keys: plainKeys, t: times, value: times.map((t) => sampleKeys(plainKeys, t)) },
  ],
  discrete: [{ keys: discrete, t: times, value: times.map((t) => sampleDiscrete(discrete, t)) }],
});

// Whole poses, draw lists and player runs of the test character (characters/test/src):
// the Swift engine reads the same rig and clips and must match every number.
const source = await readSource("test");
const rig: Rig = source.rig;
const c = compile(rig);
const { atlas } = buildAtlas("2x", source.drawings, 2, (i) => `atlas@2x-${i}.png`);
const poseRng = mulberry32(2026);
const pick = <T,>(list: readonly T[]) => list[Math.floor(poseRng() * list.length)]!;
const within = ([lo, hi]: readonly [number, number]) => lo + (hi - lo) * poseRng();

function randomInput() {
  const channels: Record<string, Channels> = {};
  const springs: Record<string, number> = {};
  for (const bone of rig.bones) {
    const ch: Channels = {};
    if (bone.rot) ch.rot = within(bone.rot);
    if (bone.squash) ch.squash = within(bone.squash);
    if (bone.scale) ch.scale = within(bone.scale);
    if (bone.yaw) ch.yaw = within(bone.yaw);
    if (bone.pitch) ch.pitch = within(bone.pitch);
    if (poseRng() < 0.5) ch.x = within([-10, 10]);
    if (poseRng() < 0.5) ch.y = within([-10, 10]);
    channels[bone.name] = ch;
    if (bone.spring) springs[bone.name] = within([-60, 60]);
  }
  const views = { body: pick(rig.views), head: pick(rig.views) };
  return { channels, springs, views };
}

const flat = (m: { a: number; b: number; c: number; d: number; tx: number; ty: number }) => [m.a, m.b, m.c, m.d, m.tx, m.ty];
write("poses", {
  rig: "characters/test/src/rig.json",
  cases: Array.from({ length: 24 }, () => {
    const input = randomInput();
    const pose = evaluatePose(c, input);
    return { ...input, world: pose.world.map(flat), scale: pose.scale, angle: pose.angle };
  }),
});

write("drawlists", {
  rig: "characters/test/src/rig.json",
  atlas,
  cases: Array.from({ length: 24 }, () => {
    const input = randomInput();
    const pose = evaluatePose(c, input);
    const state: FrameState = {
      views: input.views,
      states: { "eye.L": pick(["open", "closed"]), "eye.R": pick(["open", "closed"]) },
      variant: pick([undefined, "front:pawsBack"]),
      turn: input.channels.head,
    };
    return { ...input, state: { ...state, variant: state.variant ?? null }, items: drawList(c, pose, atlas, state).map((i) => ({ ...i, clipTo: i.clipTo ?? null })) };
  }),
});

// A player run: switches with a blend, a hard switch, and frames at uneven times.
const clips: Clip[] = source.clips;
const script: ({ play: string; t: number; blendMs?: number } | { frame: number })[] = [{ play: "test_dance", t: 0 }];
const gaps = [1 / 60, 1 / 60, 1 / 30, 0.005, 1 / 24, 1 / 120, 0.021];
let now = 0;
for (let i = 0; now < 7.6; i++) {
  script.push({ frame: now });
  if (now < 2 && now + gaps[i % gaps.length]! >= 2) script.push({ play: "idle", t: 2, blendMs: 250 }), (now = 2);
  else if (now < 3.2 && now + gaps[i % gaps.length]! >= 3.2) script.push({ play: "test_dance", t: 3.2, blendMs: 0 }), (now = 3.2);
  else now += gaps[i % gaps.length]!;
}
const player = new Player(c, clips);
const frames = script.flatMap((step) => {
  if ("play" in step) {
    player.play(step.play, step.t, step.blendMs);
    return [];
  }
  const f = player.advanceTo(step.frame);
  return [{
    t: step.frame,
    angle: f.pose.angle,
    world: f.pose.world.map(flat),
    views: f.state.views,
    states: f.state.states,
    variant: f.state.variant ?? null,
    events: f.events.map((e) => `${e.type}${e.name ? `:${e.name}` : ""}`),
  }];
});
write("player", { rig: "characters/test/src/rig.json", clips: "characters/test/src/clips", script, frames });

// A second run on clips written here, for what the test character's clips never do:
// jumps on step keys (cuts), events and the order track on a looping clip, a blend
// from a blend from a blend, and a cut the host asks for. The clips are in the file.
const runClips: Clip[] = [
  { name: "jumps", lengthMs: 1000, tracks: { body: { x: [[0, 0], [250, 12, "step"], [500, -12, "step"], [750, 0, "step"]], rot: [[0, 0], [1000, 10, "linear"]] } } },
  {
    name: "loopEvents", lengthMs: 600, loop: true,
    tracks: { "tail.1": { rot: [[0, -15], [300, 15], [600, -15]] }, head: { yaw: [[0, -25], [300, 25], [600, -25]] } },
    states: { "eye.L": [[0, "open"], [450, "closed"], [520, "open"]] },
    order: [[0, null], [300, "pawsBack"]],
    events: [{ at: 0, type: "keyPose" }, { at: 200, type: "sound", name: "tick" }, { at: 200, type: "haptic", name: "tick" }, { at: 400, type: "effect", name: "spark" }],
  },
  { name: "a", lengthMs: 1000, tracks: { body: { rot: [[0, 0], [1000, 20, "linear"]] } } },
  { name: "b", lengthMs: 1000, blendInMs: 300, tracks: { body: { rot: [[0, -15]], squash: [[0, 0.95]] } } },
  { name: "c", lengthMs: 1000, tracks: { body: { rot: [[0, 10]] }, head: { rot: [[0, 12]], pitch: [[0, -12]] } } },
];
const runProblems = validate(rig, runClips);
if (runProblems.length) throw new Error(runProblems.join("\n"));
const runScript: ({ play: string; t: number; blendMs?: number } | { frame: number } | { cut: true })[] = [];
const runPlays = new Map<number, { play: string; blendMs?: number }[]>([
  [0, [{ play: "loopEvents" }]],
  [1.3, [{ play: "jumps", blendMs: 0 }]],
  [2.5, [{ play: "a" }]],
  [2.6, [{ play: "b" }]],
  [2.65, [{ play: "c", blendMs: 200 }]],
  [3.5, [{ play: "loopEvents", blendMs: 150 }]],
]);
const runGaps = [1 / 60, 0.013, 1 / 30, 1 / 120, 0.029, 1 / 60, 0.004];
const runTimes = new Set<number>();
for (let t = 0, i = 0; t < 4.6; i++) {
  runTimes.add(Math.round(t * 1e9) / 1e9);
  t += runGaps[i % runGaps.length]!;
}
for (const t of runPlays.keys()) runTimes.add(t);
runTimes.add(2.4);
for (const t of [...runTimes].sort((x, y) => x - y)) {
  for (const p of runPlays.get(t) ?? []) runScript.push({ ...p, t });
  if (t === 2.4) runScript.push({ cut: true });
  runScript.push({ frame: t });
}
const runPlayer = new Player(c, runClips);
const runFrames = runScript.flatMap((step) => {
  if ("play" in step) {
    runPlayer.play(step.play, step.t, step.blendMs);
    return [];
  }
  if ("cut" in step) {
    runPlayer.cut();
    return [];
  }
  const f = runPlayer.advanceTo(step.frame);
  return [{
    t: step.frame,
    angle: f.pose.angle,
    world: f.pose.world.map(flat),
    views: f.state.views,
    states: f.state.states,
    variant: f.state.variant ?? null,
    turn: f.state.turn ?? null,
    events: f.events.map((e) => `${e.type}${e.name ? `:${e.name}` : ""}`),
  }];
});
write("player-cuts", { rig: "characters/test/src/rig.json", clips: runClips, script: runScript, frames: runFrames });
