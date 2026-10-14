// Writes the test vectors both runtimes must reproduce (characters/format/README.md,
// Test vectors). The web runtime computes them; the SpriteKit runtime's tests
// read them and must match within 1e-9. Run: npm run vectors
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { apply, catmullRom, compose, ease, fnv1a32, IDENTITY, mulberry32, randomStream, softLimit, type Easing } from "../../runtime-web/src/math.ts";
import { sampleDiscrete, sampleKeys } from "../../runtime-web/src/clip.ts";
import type { DiscreteKey, Key } from "../../runtime-web/src/format.ts";

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
write("easing", easings.map((easing) => ({ easing, u: us, value: us.map((u) => ease(easing, u)) })));

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
