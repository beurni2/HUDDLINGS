// Tests for clip sampling and package validation, from characters/format/README.md.
import { test } from "node:test";
import assert from "node:assert/strict";
import { localTime, sampleDiscrete, sampleKeys } from "../src/clip.ts";
import { validate, type AtlasSet, type Clip, type Key, type Rig } from "../src/format.ts";

const close = (a: number, b: number, eps = 1e-12) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);

// Appendix F's head_tilt example.
const headTilt: Key[] = [[0, 0, "easeInOut"], [420, -16, "easeOutBack"], [1200, -16], [1620, 14, "easeInOut"], [2200, 14], [2600, 0, "easeInOut"]];

test("a channel holds before its first key and after its last", () => {
  close(sampleKeys(headTilt, -50), 0);
  close(sampleKeys(headTilt, 2600), 0);
  close(sampleKeys(headTilt, 9999), 0);
});

test("a key's easing shapes the segment that ends at it", () => {
  // 0 → 420 uses the easing on the 420 key: easeOutBack overshoots past −16.
  let lowest = 0;
  for (let t = 0; t <= 420; t += 5) lowest = Math.min(lowest, sampleKeys(headTilt, t));
  assert.ok(lowest < -16.5, `easeOutBack should overshoot −16, lowest was ${lowest}`);
  // 1200 → 1620 uses easeInOut: at the midpoint it is exactly halfway.
  close(sampleKeys(headTilt, 1410), (-16 + 14) / 2);
  // Equal values hold whatever the easing: 420 → 1200 holds −16.
  close(sampleKeys(headTilt, 800), -16);
});

test("a key without an easing eases in and out; linear has to be asked for", () => {
  const keys: Key[] = [[0, 0], [100, 10]];
  close(sampleKeys(keys, 25), 10 * 4 * 0.25 * 0.25 * 0.25);
  close(sampleKeys(keys, 50), 5);
  close(sampleKeys([[0, 0], [100, 10, "linear"]], 25), 2.5);
});

test("keys land exactly on their values", () => {
  for (const [t, v] of headTilt) close(sampleKeys(headTilt, t), v);
});

test("a step key holds the previous value until its time", () => {
  const keys: Key[] = [[0, 1], [100, 5, "step"]];
  close(sampleKeys(keys, 99.9), 1);
  close(sampleKeys(keys, 100), 5);
});

test("two keys at the same time jump without dividing by zero", () => {
  const keys: Key[] = [[0, 0], [100, 1, "linear"], [100, 3], [200, 3]];
  close(sampleKeys(keys, 100), 3);
  close(sampleKeys(keys, 99), 0.99);
});

test("discrete tracks hold each value until the next key", () => {
  const eyes: [number, string][] = [[0, "open"], [1200, "closed"], [1340, "open"]];
  assert.equal(sampleDiscrete(eyes, 0), "open");
  assert.equal(sampleDiscrete(eyes, 1199), "open");
  assert.equal(sampleDiscrete(eyes, 1200), "closed");
  assert.equal(sampleDiscrete(eyes, 1339), "closed");
  assert.equal(sampleDiscrete(eyes, 5000), "open");
});

test("looping clips wrap; others clamp", () => {
  const loop = { name: "l", lengthMs: 1000, loop: true } as Clip;
  const once = { name: "o", lengthMs: 1000 } as Clip;
  assert.equal(localTime(loop, 2500), 500);
  assert.equal(localTime(once, 2500), 1000);
  assert.equal(localTime(once, -5), 0);
});

const rig: Rig = {
  format: 1,
  species: "test",
  height: 164,
  bones: [
    { name: "root", scale: [0.06, 1] },
    { name: "body", parent: "root", y: -10, rot: [-30, 30], squash: [0.93, 1.07] },
    { name: "head", parent: "body", y: -60, rot: [-18, 18] },
    { name: "ear.L", parent: "head", x: 20, y: -40, rot: [-14, 14], spring: { hz: 3, damping: 0.5, com: [0, 20], follow: 1, inertia: 1 } },
    { name: "tail.1", parent: "body", rot: [-20, 20] },
    { name: "tail.2", parent: "tail.1", y: -20, rot: [-20, 20] },
  ],
  views: ["front"],
  parts: [
    { name: "body", bone: "body", group: "body", regions: { front: "body/front" } },
    { name: "head.base", bone: "head", group: "head", regions: { front: "head/front" } },
    { name: "eye.L", bone: "head", group: "head", clipTo: "head.base", regions: { front: "eye.L/front", "front:closed": "eye.L/front/closed" } },
    { name: "eye.R", bone: "head", group: "head", clipTo: "head.base", regions: { front: "eye.R/front" } },
    { name: "ear.L", bone: "ear.L", group: "head", regions: { front: "ear.L/front" } },
    { name: "tail", bone: "tail.1", group: "body", regions: { front: "tail" }, warp: { chain: ["tail.1", "tail.2"], columns: 1, rows: 5 } },
  ],
  drawOrder: { front: ["tail", "body", "@head"], "head.front": ["ear.L", "head.base", "eye.L", "eye.R"] },
  drawOrderVariants: { "front:low": ["@head", "tail", "body"] },
};

test("a sound rig and clip pass validation", () => {
  const clip: Clip = { name: "ok", lengthMs: 1000, tracks: { body: { squash: [[0, 1], [500, 0.95]] }, head: { rot: [[0, 0], [500, 12]] } },
    order: [[0, null], [500, "low"]], views: { body: [[0, "front"]] }, blendInMs: 150 };
  assert.deepEqual(validate(rig, [clip]), []);
});

test("validation refuses scaling outside the scale channels, and limits broken by clips", () => {
  const clip: Clip = { name: "bad", lengthMs: 1000, tracks: { head: { rot: [[0, 0], [500, 30]], scale: [[0, 1], [500, 1.2]] }, body: { squash: [[0, 1.2]] } } };
  const problems = validate(rig, [clip]);
  assert.ok(problems.some((p) => p.includes("head.rot 30 leaves its limit")), problems.join("\n"));
  assert.ok(problems.some((p) => p.includes("head.scale 1.2 is not allowed")), problems.join("\n"));
  assert.ok(problems.some((p) => p.includes("body.squash 1.2 is not allowed")), problems.join("\n"));
});

test("validation refuses broken structure", () => {
  const broken: Rig = {
    ...rig,
    bones: [...rig.bones, { name: "tail", parent: "nope" }, { name: "body" }],
    parts: [...rig.parts, { name: "x", bone: "ghost", group: "body", regions: { side: "x" }, clipTo: "missing" }],
    drawOrder: { front: ["body", "@head", "phantom"] },
  };
  const problems = validate(broken, [{ name: "c", lengthMs: 100, events: [{ at: 200, type: "sound" }], order: [[10, "nope"]], blendInMs: 50 }]);
  for (const expected of ["parent nope must come first", "bone body: listed twice", "unknown bone ghost", "unknown view side",
    "clipTo missing is not a part", "unknown part phantom", "outside the clip", "order variant nope exists in no view", "blendInMs 50"]) {
    assert.ok(problems.some((p) => p.includes(expected)), `expected "${expected}" in:\n${problems.join("\n")}`);
  }
});

function expectProblem(problems: string[], expected: string) {
  assert.ok(problems.some((p) => p.includes(expected)), `expected "${expected}" in:\n${problems.join("\n")}`);
}

test("validation refuses rotating a bone that declares no rotation", () => {
  const problems = validate(rig, [{ name: "c", lengthMs: 100, tracks: { root: { rot: [[0, 5]] }, "tail.2": { rot: [[0, 1]] } } }]);
  expectProblem(problems, "root has no rot limit, so it cannot be keyed");
  assert.ok(!problems.some((p) => p.includes("tail.2")), problems.join("\n"));
});

test("validation refuses a root that squashes, and a spring whose mass sits on its pivot", () => {
  const bones = rig.bones.map((b) =>
    b.name === "root" ? { ...b, squash: [0.9, 1.1] as [number, number] } : b.name === "ear.L" ? { ...b, spring: { ...b.spring!, com: [1, 1] as [number, number] } } : b);
  const problems = validate({ ...rig, bones }, []);
  expectProblem(problems, "bone root: never rotates or squashes");
  expectProblem(problems, "spring com must be at least 2 pt from the pivot");
});

test("validation keeps each clip group together and after its mask, in every order", () => {
  expectProblem(validate({ ...rig, drawOrder: { ...rig.drawOrder, "head.front": ["head.base", "eye.L", "ear.L", "eye.R"] } }, []),
    "the parts clipped to head.base are not together");
  expectProblem(validate({ ...rig, drawOrder: { ...rig.drawOrder, "head.front": ["ear.L", "eye.L", "eye.R", "head.base"] } }, []),
    "eye.L comes before its mask head.base");
  // A variant is checked with every head order too.
  expectProblem(validate({ ...rig, drawOrderVariants: { "front:low": ["eye.L", "body", "@head"] } }, []), "front:low with head.front");
});

test("validation refuses nested clips and clips on bending parts, for now", () => {
  const parts = rig.parts.map((p) => (p.name === "eye.R" ? { ...p, clipTo: "eye.L" } : p.name === "ear.L" ? { ...p, clipTo: "tail" } : p));
  const problems = validate({ ...rig, parts }, []);
  expectProblem(problems, "its mask eye.L is itself clipped");
  expectProblem(problems, "a bending part can neither be clipped nor be a mask");
});

test("validation checks the fake turn: its parts, its views, and that face parts are clipped", () => {
  const fakeTurn = {
    bone: "head", yawDeg: 20, pitchDeg: 12, faceShift: 0.06, markingShift: 0.03, earShift: 0.03, nodShift: 0.05, farEyeNarrow: 0.06,
    views: { front: { size: [100, 80] as [number, number] }, back: { size: [0, 80] as [number, number] } },
    roles: { "eye.L": "face" as const, "ear.L": "face" as const, ghost: "marking" as const },
    farEye: { positive: "eye.L", negative: "eye.R" },
  };
  const problems = validate({ ...rig, fakeTurn }, [{ name: "c", lengthMs: 100, tracks: { body: { yaw: [[0, 5]] } } }]);
  for (const expected of ["fake turn: unknown view back", "the head size in back must be positive", "ear.L slides with the face, so it must be clipped",
    "unknown part ghost", "far eye eye.R must be a face part", "body.yaw: only the fake turn's bone has yaw"]) expectProblem(problems, expected);
});

test("validation refuses a bezier key whose x1 or x2 leaves 0 to 1, as CSS does", () => {
  const clip: Clip = { name: "c", lengthMs: 500, tracks: { head: { rot: [[0, 0], [200, 5, ["bezier", 1.2, 0, 0.5, 1]], [400, 0, ["bezier", 0.2, 3, 0.8, -2]]] } } };
  const problems = validate(rig, [clip]);
  expectProblem(problems, "key at 200 ms has a bezier with x1 or x2 outside 0 to 1");
  assert.ok(!problems.some((p) => p.includes("key at 400 ms")), "y1 and y2 may overshoot");
});

test("validation refuses an easing that overshoots a limit between keys", () => {
  // easeOutBack from 0 to 17 overshoots to about 18.7, past the head's 18.
  const over: Clip = { name: "over", lengthMs: 500, tracks: { head: { rot: [[0, 0], [400, 17, "easeOutBack"]] } } };
  expectProblem(validate(rig, [over]), "head.rot overshoots to 18.");
  const fine: Clip = { name: "fine", lengthMs: 500, tracks: { head: { rot: [[0, 0], [400, 16, "easeOutBack"]] } } };
  assert.deepEqual(validate(rig, [fine]), []);
});

test("validation keeps a part's alpha inside 0 to 1, at its keys and between them, and only on a part", () => {
  const ok: Clip = { name: "blush", lengthMs: 600, alpha: { "eye.L": [[0, 0.2], [300, 0.8, "easeOutBack"], [600, 0]], body: [[0, 1]] } };
  assert.deepEqual(validate(rig, [ok]), []);
  const bad: Clip = {
    name: "bad", lengthMs: 600,
    alpha: { "eye.L": [[0, 0], [300, 1.2]], ghost: [[0, 1]], "eye.R": [[0, 0.5], [400, 1, "easeOutBack"]], "head.base": [[700, 0.5], [100, -0.1]] },
  };
  const problems = validate(rig, [bad]);
  for (const expected of ["alpha of eye.L 1.2 leaves 0 to 1", "alpha of unknown part ghost", "alpha of eye.R overshoots to 1.0", "alpha of head.base key at 700 ms is outside the clip",
    "alpha of head.base keys out of order at 100 ms", "alpha of head.base -0.1 leaves 0 to 1"]) expectProblem(problems, expected);
  assert.equal(problems.length, 7, problems.join("\n"));
});

test("validation takes a null region, which needs nothing in the atlas, and names a view whose regions are all null", () => {
  const parts = rig.parts.map((p) =>
    p.name === "eye.L" ? { ...p, regions: { ...p.regions, "front:wink": null } } : p.name === "eye.R" ? { ...p, regions: { front: "eye.R/front", "front:closed": null } } : p);
  const named = parts.flatMap((p) => Object.values(p.regions)).filter((r) => r !== null);
  const atlas: AtlasSet = {
    name: "2x", scale: 2, pages: [{ file: "p.png", scale: 2, width: 64, height: 64 }],
    regions: Object.fromEntries(named.map((r) => [r, { page: 0, x: 0, y: 0, w: 2, h: 2, anchorX: 1, anchorY: 1 }])),
  };
  assert.deepEqual(validate({ ...rig, parts }, [], atlas), []);
  const allNull = parts.map((p) => (p.name === "eye.R" ? { ...p, regions: { "front:closed": null, "front:wink": null } } : p));
  assert.deepEqual(validate({ ...rig, parts: allNull }, [], atlas), ["part eye.R: every region in view front is null; leave the view out instead"]);
});

// A clip file is JSON, so a key can arrive in any shape; the validator names each, so neither runtime samples it.
// Cast through unknown: these are the files the types forbid.
const keyed = (track: unknown, alpha?: unknown): Clip =>
  ({ name: "c", lengthMs: 500, tracks: { head: { rot: track as Key[] } }, ...(alpha === undefined ? {} : { alpha: { "eye.L": alpha as Key[] } }) });

test("validation refuses an empty key list, on a bone's channel and on a part's alpha", () => {
  // Swift stops on an empty track (sampleKeys' precondition); the web throws.
  assert.deepEqual(validate(rig, [keyed([], [])]), ["clip c: head.rot has no keys; a track needs at least one", "clip c: alpha of eye.L has no keys; a track needs at least one"]);
  assert.deepEqual(validate(rig, [keyed(null)]), ["clip c: head.rot is not a list of keys"]);
});

test("validation refuses a key whose value is not a finite number: a string, null", () => {
  // On the web "5" would concatenate and null would read as 0; Swift refuses them at decode.
  assert.deepEqual(validate(rig, [keyed([[0, 0], [200, "5"]], [[0, null], [300, 0.5]])]), [
    'clip c: head.rot key 1 is not [time, value] or [time, value, easing] with a finite time and value: [200,"5"]',
    "clip c: alpha of eye.L key 0 is not [time, value] or [time, value, easing] with a finite time and value: [0,null]",
  ]);
});

test("validation refuses a key whose time is not a finite number", () => {
  assert.deepEqual(validate(rig, [keyed([["0", 0], [200, 5]], [[0, 0.5], [null, 1]])]), [
    'clip c: head.rot key 0 is not [time, value] or [time, value, easing] with a finite time and value: ["0",0]',
    "clip c: alpha of eye.L key 1 is not [time, value] or [time, value, easing] with a finite time and value: [null,1]",
  ]);
});

test("validation refuses a key that is not a list of two or three", () => {
  const problems = validate(rig, [keyed([[0], [100, 2, "linear", 4], 7], [{ t: 0, v: 1 }])]);
  for (const expected of ["head.rot key 0 is not [time, value] or [time, value, easing] with a finite time and value: [0]",
    'head.rot key 1 is not [time, value] or [time, value, easing] with a finite time and value: [100,2,"linear",4]',
    "head.rot key 2 is not [time, value] or [time, value, easing] with a finite time and value: 7",
    'alpha of eye.L key 0 is not [time, value] or [time, value, easing] with a finite time and value: {"t":0,"v":1}']) expectProblem(problems, expected);
  assert.equal(problems.length, 4, problems.join("\n"));
});

test("validation refuses an easing the README does not name, and takes every one it does", () => {
  // An unknown name reaches the shader as NaN on the web; Swift refuses it at decode.
  const problems = validate(rig, [keyed(
    [[0, 0], [100, 2, "bounce"], [200, 3, ["easeOutBack"]], [300, 4, ["easeOutBack", "2"]], [400, 5, ["bezier", 0.1, 0.2, 0.3]], [450, 6, 3]],
    [[0, 0], [100, 0.5, ["spring", 1]], [200, 0.6, ["bezier", 0.1, null, 0.3, 1]], [300, 0.7, ["easeOutBack", 1.2]], [400, 0.8, "easeIn"]],
  )]);
  const not = 'has an easing that is not a name, ["easeOutBack", s] or ["bezier", x1, y1, x2, y2] with finite numbers:';
  assert.deepEqual(problems, [
    'clip c: head.rot key at 100 ms has an unknown easing "bounce"',
    `clip c: head.rot key at 200 ms ${not} ["easeOutBack"]`,
    `clip c: head.rot key at 300 ms ${not} ["easeOutBack","2"]`,
    `clip c: head.rot key at 400 ms ${not} ["bezier",0.1,0.2,0.3]`,
    `clip c: head.rot key at 450 ms ${not} 3`,
    `clip c: alpha of eye.L key at 100 ms ${not} ["spring",1]`,
    `clip c: alpha of eye.L key at 200 ms ${not} ["bezier",0.1,null,0.3,1]`,
  ], "and a track with a broken key is never sampled for overshoot");
  const named: Key[] = [[0, 0], [50, 1, "linear"], [100, 2, "step"], [150, 3, "easeIn"], [200, 4, "easeOut"], [250, 5, "easeInOut"], [300, 6, "easeOutBack"],
    [350, 7, ["easeOutBack", 0.5]], [400, 8, ["bezier", 0.2, 1.5, 0.6, -0.3]], [450, 9]];
  assert.deepEqual(validate(rig, [keyed(named, named.map(([t, v, e]): Key => (e === undefined ? [t, v / 10] : [t, v / 10, e])))]), []);
});

test("validation refuses keys out of time order on a bone's channel, and takes two keys at one time, a jump", () => {
  assert.deepEqual(validate(rig, [keyed([[0, 0], [300, 5], [200, 2], [200, 4]])]), ["clip c: head.rot keys out of order at 200 ms"]);
  assert.deepEqual(validate(rig, [keyed([[0, 0], [200, 2], [200, 4]])]), []);
});

test("validation keeps a part's rest alpha inside 0 to 1", () => {
  const withRest = (alphas: Record<string, unknown>): Rig => ({ ...rig, parts: rig.parts.map((p) => (p.name in alphas ? { ...p, alpha: alphas[p.name] as number } : p)) });
  assert.deepEqual(validate(withRest({ "eye.L": 0.34, "eye.R": 0, body: 1 }), []), []);
  assert.deepEqual(validate(withRest({ "eye.L": 1.2, "eye.R": -0.1, body: "0.5", "head.base": null }), []), [
    "part body: its rest alpha \"0.5\" is not a number from 0 to 1", "part head.base: its rest alpha null is not a number from 0 to 1",
    "part eye.L: its rest alpha 1.2 is not a number from 0 to 1", "part eye.R: its rest alpha -0.1 is not a number from 0 to 1",
  ]);
});

test("validation refuses an empty discrete track", () => {
  const clip: Clip = { name: "c", lengthMs: 500, states: { "eye.L": [] }, views: { body: [], head: [[0, "front"]] }, order: [] };
  assert.deepEqual(validate(rig, [clip]), [
    "clip c: states of eye.L has no keys; a track needs at least one", "clip c: body views has no keys; a track needs at least one", "clip c: order has no keys; a track needs at least one",
  ]);
});

test("validation refuses a discrete key that is not [finite time, name], with null a name only on the order track", () => {
  // Swift refuses each at decode, a [time, number] state among them, which the web took.
  const clip = { name: "c", lengthMs: 500, states: { "eye.L": [[0, 5]], "eye.R": [[0, null], [100, "open"]] }, views: { head: [5, [Infinity, "front"]] },
    order: [[0, null], ["100", "low"], [200], [300, "low", "x"]] } as unknown as Clip;
  assert.deepEqual(validate(rig, [clip]), [
    "clip c: states of eye.L key 0 is not [time, name] with a finite time and a name: [0,5]",
    "clip c: states of eye.R key 0 is not [time, name] with a finite time and a name: [0,null]",
    "clip c: head views key 0 is not [time, name] with a finite time and a name: 5",
    "clip c: head views key 1 is not [time, name] with a finite time and a name: [null,\"front\"]",
    'clip c: order key 1 is not [time, name] with a finite time and a name or null: ["100","low"]',
    "clip c: order key 2 is not [time, name] with a finite time and a name or null: [200]",
    'clip c: order key 3 is not [time, name] with a finite time and a name or null: [300,"low","x"]',
  ]);
  const sound: Clip = { name: "c", lengthMs: 500, states: { "eye.L": [[0, "open"], [100, "closed"]] }, views: { body: [[0, "front"]], head: [[0, "front"]] }, order: [[0, null], [100, "low"]] };
  assert.deepEqual(validate(rig, [sound]), []);
});

test("validation refuses a discrete track that is not a list, naming it rather than reading it", () => {
  // The first two threw inside validate() on the web, walking a number; the states were called empty. Swift refuses each at decode.
  for (const [field, value, expected] of [["views", { body: 5 }, "clip c: body views is not a list of keys"], ["order", 5, "clip c: order is not a list of keys"],
    ["states", { "eye.L": null }, "clip c: states of eye.L is not a list of keys"], ["states", { "eye.L": { 0: "open" } }, "clip c: states of eye.L is not a list of keys"]] as const) {
    assert.deepEqual(validate(rig, [{ name: "c", lengthMs: 500, [field]: value } as unknown as Clip]), [expected], `${field} ${JSON.stringify(value)}`);
  }
});

test("validation refuses a map of tracks that is not an object: a clip's tracks, alpha, states or views, or a bone's channels", () => {
  // tracks {"head": null} threw inside validate() on the web; Swift refuses each at decode.
  const cases: [Record<string, unknown>, string][] = [
    [{ tracks: { head: null } }, "clip c: tracks of head is not a map of channels: null"], [{ tracks: { head: [[0, 1]] } }, "clip c: tracks of head is not a map of channels: [[0,1]]"],
    [{ tracks: 5 }, "clip c: tracks is not a map of bones: 5"], [{ alpha: [[0, 1]] }, "clip c: alpha is not a map of parts: [[0,1]]"],
    [{ states: "open" }, 'clip c: states is not a map of parts: "open"'], [{ views: [[0, "front"]] }, 'clip c: views is not a map of groups: [[0,"front"]]'],
  ];
  for (const [fields, expected] of cases) assert.deepEqual(validate(rig, [{ name: "c", lengthMs: 500, ...fields } as unknown as Clip]), [expected], JSON.stringify(fields));
});

test("validation refuses discrete keys out of time order, and takes two keys at one time", () => {
  // Both samplers walk the keys in order and stop at the first past the time, so a key out of order hides another:
  // here closed at 300 ms would never show.
  const clip: Clip = { name: "c", lengthMs: 500, states: { "eye.L": [[0, "open"], [300, "closed"], [200, "open"]] }, order: [[0, null], [100, "low"], [100, null]] };
  assert.deepEqual(validate(rig, [clip]), ["clip c: states of eye.L keys out of order at 200 ms"]);
});

test("validation names a states track for a part the rig lacks, and leaves its keys unread", () => {
  // The web took it silently, and Swift decodes it and never reads it: a face clip keying a part the rig renamed would
  // change nothing and pass.
  const clip = { name: "c", lengthMs: 500, states: { "eye.L": [[0, "closed"]], "eye.M": [[0, "closed"]], tongue: [] } } as unknown as Clip;
  assert.deepEqual(validate(rig, [clip]), ["clip c: states of unknown part eye.M", "clip c: states of unknown part tongue"]);
});

test("validation names a views track for a group other than the body and the head", () => {
  // Both runtimes read only the body's and the head's views (Swift's decoder drops any other key), so a clip setting a
  // tail's view, or a misspelt head, would draw the views it had before.
  const clip = { name: "c", lengthMs: 500, views: { body: [[0, "front"]], heads: [[0, "front"]], tail: [[0, "nope"]] } } as unknown as Clip;
  assert.deepEqual(validate(rig, [clip]), [
    "clip c: views of unknown group heads; a clip sets the body's view and the head's",
    "clip c: views of unknown group tail; a clip sets the body's view and the head's",
  ]);
});

test("validation names events that are not a list, and an event that is not an object, rather than throwing", () => {
  // An object or a number threw inside validate() on the web, walking it, and a string was walked letter by letter;
  // Swift refuses each at decode. Null is left out, as for every clip field.
  const cases: [unknown, string][] = [
    [{ at: 0, type: "keyPose" }, 'clip c: events is not a list of events: {"at":0,"type":"keyPose"}'], [5, "clip c: events is not a list of events: 5"],
    ["keyPose", 'clip c: events is not a list of events: "keyPose"'], [[null, { at: 0, type: "keyPose" }], "clip c: an event is not an object with its time and type: null"],
  ];
  for (const [events, expected] of cases) assert.deepEqual(validate(rig, [{ name: "c", lengthMs: 500, events } as unknown as Clip]), [expected], JSON.stringify(events));
  assert.deepEqual(validate(rig, [{ name: "c", lengthMs: 500, events: null } as unknown as Clip]), []);
  assert.deepEqual(validate(rig, [{ name: "c", lengthMs: 500, events: [{ at: 600, type: "sound" }] }]), ["clip c: event sound at 600 ms is outside the clip"]);
});

test("validation names an event whose time is not a finite number, whose type is none of the seven, or whose name is not a string", () => {
  // Each passed validate() on the web; Swift's ClipEvent (at: Double, type: String, name: String?) refuses the first and
  // the last at decode, and no runtime listens for an unknown type, so the runtimes would disagree on the clip.
  const types = "keyPose, sound, haptic, effect, plant, lift, footstep";
  const cases: [unknown, string[]][] = [
    [{}, [`clip c: an event's type is not one of ${types}: {}`, "clip c: an event's time is not a finite number: {}"]],
    [{ at: "x", type: "sound" }, ['clip c: an event\'s time is not a finite number: {"at":"x","type":"sound"}']],
    [{ at: NaN, type: "sound" }, ['clip c: an event\'s time is not a finite number: {"at":"NaN","type":"sound"}']],
    [{ at: null, type: "sound" }, ['clip c: an event\'s time is not a finite number: {"at":null,"type":"sound"}']],
    [{ type: "haptic" }, ['clip c: an event\'s time is not a finite number: {"type":"haptic"}']],
    [{ at: 10 }, [`clip c: an event's type is not one of ${types}: {"at":10}`]],
    [{ at: 10, type: "Sound" }, [`clip c: an event's type is not one of ${types}: {"at":10,"type":"Sound"}`]],
    [{ at: 10, type: 3 }, [`clip c: an event's type is not one of ${types}: {"at":10,"type":3}`]],
    [{ at: 10, type: "sound", name: 7 }, ['clip c: an event\'s name is not a string: {"at":10,"type":"sound","name":7}']],
  ];
  for (const [event, expected] of cases) assert.deepEqual(validate(rig, [{ name: "c", lengthMs: 500, events: [event] } as unknown as Clip]), expected, JSON.stringify(event));
  // Every type the format names, with a name or a null one, passes.
  const fine = types.split(", ").map((type, i) => ({ at: i * 10, type, ...(i % 2 ? { name: "n" } : { name: null }) }));
  assert.deepEqual(validate(rig, [{ name: "c", lengthMs: 500, events: fine } as unknown as Clip]), []);
});
