// The face states in the turned views, rendered for the contact sheets (sheet.py): every state and the 19 presets'
// stills (presets.ts, faceClips.ts's stillOf) in threeQuarter.L, threeQuarter.R, side.L and side.R, each a still of a
// review build of the dog with a clip of its own that sets the view and the states (a face preset's states apply in any
// view at runtime, so the package itself gets no new clip). The review build is the package's own source plus the
// turned views' stars and the profile's mouths and puffed cheek, which the package holds out for now (DECISIONS 183, 208), and these
// clips. Also the ID-pass check of
// "nothing of the open eye under a closed one": under every closed eye state (happy, squeeze, closed, wink, flat), in
// every view that draws an eye, none of the open eye's own pixels shows, and under each view's sleepy half-lid nothing
// dark of the open eye shows over the eye's top (ids.json).
//
// node qa/phase3/faces/turned/render.ts <out folder> [--cache <raster cache>]
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { PNG } from "pngjs";
import type { Clip, Rig } from "../../../../runtime-web/src/format.ts";
import { regionFor } from "../../../../runtime-web/src/rig.ts";
import { openStills } from "../../../../runtime-web/lab/still.ts";
import { buildPackage, readSource, writePackage } from "../../../../characters/build/build.ts";
import { toBone } from "../../../../characters/draw/frame.ts";
import { earRot, stillOf } from "../../../../characters/dog/src/faceClips.ts";
import { EAR_STATES, PRESETS, type EarState } from "../../../../characters/dog/src/presets.ts";
import { sideHeld } from "../../../../characters/dog/src/views/side.ts";
import { threeQuarterHeld } from "../../../../characters/dog/src/views/threeQuarter.ts";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const { values: args, positionals } = parseArgs({ allowPositionals: true, options: { cache: { type: "string" } } });
const out = resolve(positionals[0] ?? join(repo, "build/dev/turnedfaces"));
const VIEWS = ["threeQuarter.L", "threeQuarter.R", "side.L", "side.R"] as const;
type View = (typeof VIEWS)[number] | "front";
/** The package's own rig, before the review build adds the held states to its copy. */
const rig = JSON.parse(readFileSync(join(repo, "characters/dog/src/rig.json"), "utf8")) as Rig;
const restStill = (view: string) => JSON.parse(readFileSync(join(repo, `characters/dog/src/clips/still_${view}.json`), "utf8")) as { states?: Record<string, [number, string][]> };

/**
 * A cell: its label, the states it keys and the ears' turns, in one view; and what it shows that the package on this
 * branch does not play (`review`): a state held out of the package (DECISIONS 183).
 */
interface Cell {
  label: string;
  group: "state" | "preset";
  states: Record<string, string>;
  ears?: { L: EarState; R: EarState };
  review?: "held"[];
}

/**
 * The head's line beside a raised ear, as the face clips key it (faceClips.ts, DECISIONS 146): an ear raised off its
 * temple, perked or lifted, leaves the line to the temple's edge on its side (templeL, templeR, temples); the
 * three-quarter draws its own line beside either ear perked (DECISIONS 176, 234).
 */
const temple = (ears: { L: string; R: string }): Record<string, string> => {
  const up = (e: string) => e === "onePerked" || e === "lifted";
  const [l, r] = [up(ears.L), up(ears.R)];
  return l || r ? { "head.line": l && r ? "temples" : l ? "templeL" : "templeR" } : {};
};

/** The near eye in a view: the one the view shows nearest the person (the side views draw no other). */
const nearEye = (view: View) => (view.endsWith(".L") ? "eye.L" : "eye.R");
const both = (state: string) => ({ "eye.L": state, "eye.R": state });

function cells(view: View): Cell[] {
  const rest = Object.fromEntries(Object.entries(restStill(view).states ?? {}).map(([p, k]) => [p, k[0]![1]]));
  const near = nearEye(view);
  const state = (label: string, states: Record<string, string>, ears?: Cell["ears"]): Cell => ({ label, group: "state", states: { ...rest, ...states, ...(ears ? temple(ears) : {}) }, ...(ears ? { ears } : {}) });
  const list: Cell[] = [
    state("rest", {}),
    state("eyes happy", both("happy")),
    state("eyes squeeze (Q2)", both("squeeze")),
    state("eyes closed", both("closed")),
    state("eyes sleepy half-lid", both("sleepy")),
    state(`wink (${near})`, { [near]: "wink" }),
    state("eyes wide", both("wide")),
    state("eyes peek", both("peek")),
    state("eyes sparkle (Q2)", both("sparkle")),
    state("eyes eager (hungry)", both("eager")),
    state("eyes flat (huffy)", both("flat")),
    state("eyes peekBack (huffy)", both("peekBack")),
    state("stars (proud)", { stars: "sparkle" }),
    ...["smile", "open", "laugh", "o", "cheeky", "yawn", "pant", "o.tongue", "pressed", "tinySmile"].filter((m) => m !== rest.mouth).map((m) => state(`mouth ${m}`, { mouth: m })),
    state("cheeks puffed (huffy)", { cheeks: "puffed", mouth: "pressed" }),
    state("brows raised", { "brow.L": "raised", "brow.R": "raised" }),
    state("brows happy", { "brow.L": "happy", "brow.R": "happy" }),
    ...EAR_STATES.filter((e) => e !== "neutral" && e !== "onePerked").map((e) => state(`ears ${e}`, { "ear.L": e, "ear.R": e }, { L: e, R: e })),
    state("ear.L perked", { "ear.L": "onePerked" }, { L: "onePerked", R: "neutral" }),
    state("ear.R perked", { "ear.R": "onePerked" }, { L: "neutral", R: "onePerked" }),
  ];
  const preset = (label: string, s: ReturnType<typeof stillOf>): Cell => ({
    label, group: "preset",
    states: { "eye.L": s.eyes.L, "eye.R": s.eyes.R, mouth: s.mouth, "brow.L": s.brows.L, "brow.R": s.brows.R, "ear.L": s.ears.L, "ear.R": s.ears.R,
      ...(s.stars ? { stars: "sparkle" } : {}), ...(s.cheeks ? { cheeks: s.cheeks } : {}), ...temple(s.ears) },
    ears: s.ears,
  });
  for (const [name, p] of Object.entries(PRESETS)) list.push(preset(name, stillOf(p)));
  // Huffy's peek back (no package clip, DECISIONS 156), and hungry's first beat, the o.
  list.push(preset("huffy, its peek back", stillOf(PRESETS.huffy!, true)), preset("hungry, its o", { ...stillOf(PRESETS.hungry!), mouth: "o" }));
  return list;
}

const slug = (s: string) => s.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
function clip(name: string, view: View, c: Cell) {
  return {
    name, lengthMs: 1000, views: { body: [[0, view]], head: [[0, view]] },
    states: Object.fromEntries(Object.entries(c.states).map(([part, s]) => [part, [[0, s]]])),
    ...(c.ears ? { tracks: { "ear.L": { rot: [[0, earRot("L", c.ears.L)]] }, "ear.R": { rot: [[0, earRot("R", c.ears.R)]] } } } : {}),
    events: [{ at: 0, type: "keyPose" }],
  };
}

/** The closed eye states the ID check covers, and the views it covers them in: every view that draws an eye. */
const CLOSED = ["happy", "squeeze", "closed", "wink", "flat"];
const ID_VIEWS: View[] = ["front", ...VIEWS];

const pkg = join(out, "package");
rmSync(out, { recursive: true, force: true });
const source = await readSource("dog");
// The states the package holds out for now, in the review build only (DECISIONS 183): the turned views' stars, a
// sparkle region and nothing otherwise, last in each turned head; the profile's mouths, each keyed to its state; and the
// profile's puffed cheek, in the cheeks slot the rig now gives every turned head after the blush (DECISIONS 208, 234),
// which the three-quarter's package fills and the profile's does not yet (side.ts holds its puff out).
const part = (name: string) => source.rig.parts.find((p) => p.name === name)!;
for (const [view, drawn] of [["threeQuarter.L", threeQuarterHeld("L")], ["threeQuarter.R", threeQuarterHeld("R")], ["side.L", sideHeld("L")], ["side.R", sideHeld("R")]] as const) {
  for (const d of drawn) {
    source.drawings.push(toBone(d.part, source.rig, view, d.piece, d.state));
    part(d.part).regions[`${view}:${d.state}`] = `${d.part}/${view}:${d.state}`;
  }
  part("stars").regions[view] = null;
  source.rig.drawOrder[`head.${view}`]!.push("stars");
}
const add = (c: ReturnType<typeof clip>) => source.clips.push(c as unknown as Clip);
const plan: { view: View; cells: (Cell & { clip: string })[] }[] = VIEWS.map((view) => ({
  view, cells: cells(view).map((c, i) => ({ ...c, clip: `turned_${slug(view)}_${String(i).padStart(2, "0")}_${slug(c.label)}` })),
}));
for (const { view, cells: cs } of plan) for (const c of cs) add(clip(c.clip, view, c));
// The ID check's stills: each eye state alone on both eyes, on the rest face, in every view that draws an eye.
const idClips: { view: View; state: string; clip: string }[] = [];
for (const view of ID_VIEWS) {
  for (const state of ["open", ...CLOSED, "sleepy"]) {
    const name = `ids_${slug(view)}_${state}`;
    add(clip(name, view, { label: state, group: "state", states: both(state) }));
    idClips.push({ view, state, clip: name });
  }
}
// Each cell's states the package does not play: a region the review build adds.
for (const { view, cells: cs } of plan) {
  for (const c of cs) {
    const held = Object.entries(c.states).some(([name, state]) => regionFor(rig.parts.find((q) => q.name === name)!, view, state) !== regionFor(part(name), view, state));
    if (held) c.review = ["held"];
  }
}
writePackage(await buildPackage(source, { cache: resolve(args.cache ?? join(repo, "build/cache")) }), pkg);

const stills = await openStills(pkg);
try {
  await stills.load(3);
  for (const { view, cells: cs } of plan) for (const c of cs) await stills.render(c.clip, join(out, "stills", c.clip));
  for (const c of idClips) await stills.render(c.clip, join(out, "stills", c.clip));
} finally {
  await stills.close();
}
writeFileSync(join(out, "cells.json"), JSON.stringify(plan, null, 1));

// The ID check. In each still the eye parts' ID colours give each eye's footprint. Under a closed state, nothing the
// open eye paints may show: none of its light pixels (its white, its catchlights, its iris's glow: white.png lighter
// than L* 30 within the open eye's footprint, which no lash band or squeeze ever paints) may come out the same in the
// closed still (within 1/255 a channel), as they would were the open eye drawn under the band, in its region or in
// another part's; and no dark iris of the open eye may be left outside the band (white.png's pixels darker than L* 30
// within the open eye's footprint but outside the band's own footprint grown by 2 px). This looks for the open eye
// itself rather than holding the band's footprint under a share of the open eye's (60% until DECISIONS 202): a share
// says nothing about where the pixels come from, and the bolder squeeze sat 0.012 under it.
const read = (path: string) => PNG.sync.read(readFileSync(path));
const lum = (d: Buffer, k: number) => 0.2126 * d[k]! + 0.7152 * d[k + 1]! + 0.0722 * d[k + 2]!;
/** Whether two stills' pixels are the same, within 1/255 a channel. */
const same = (a: Buffer, b: Buffer, k: number) => Math.abs(a[k]! - b[k]!) <= 1 && Math.abs(a[k + 1]! - b[k + 1]!) <= 1 && Math.abs(a[k + 2]! - b[k + 2]!) <= 1;
const results: Record<string, unknown>[] = [];
for (const view of ID_VIEWS) {
  const eyes = ["eye.L", "eye.R"].filter((e) => (rig.drawOrder[`head.${view}`] ?? []).includes(e));
  const footprint = (clipName: string, eye: string) => {
    const info = JSON.parse(readFileSync(join(out, "stills", clipName, "still.json"), "utf8")) as { parts: Record<string, { id: string }> };
    const ids = read(join(out, "stills", clipName, "ids.png"));
    const id = info.parts[eye]!.id, [r, g, b] = [1, 3, 5].map((i) => parseInt(id.slice(i, i + 2), 16));
    const mask = new Uint8Array(ids.width * ids.height);
    for (let p = 0; p < mask.length; p++) mask[p] = +(ids.data[p * 4] === r && ids.data[p * 4 + 1] === g && ids.data[p * 4 + 2] === b);
    return { mask, w: ids.width, h: ids.height, white: read(join(out, "stills", clipName, "white.png")) };
  };
  for (const eye of eyes) {
    const open = footprint(`ids_${slug(view)}_open`, eye);
    const openArea = open.mask.reduce((a, b) => a + b, 0);
    for (const state of CLOSED) {
      const closed = footprint(`ids_${slug(view)}_${state}`, eye);
      const area = closed.mask.reduce((a, b) => a + b, 0);
      const grown = new Uint8Array(closed.mask);
      for (let pass = 0; pass < 2; pass++) {
        const prev = new Uint8Array(grown);
        for (let j = 1; j < closed.h - 1; j++) for (let i = 1; i < closed.w - 1; i++) {
          const p = j * closed.w + i;
          if (prev[p] || prev[p - 1] || prev[p + 1] || prev[p - closed.w] || prev[p + closed.w]) grown[p] = 1;
        }
      }
      let dark = 0, lit = 0, shows = 0;
      for (let p = 0; p < open.mask.length; p++) {
        if (!open.mask[p]) continue;
        if (!grown[p] && lum(closed.white.data, p * 4) < 66) dark++;
        if (lum(open.white.data, p * 4) >= 66) (lit++, shows += +same(open.white.data, closed.white.data, p * 4));
      }
      const pass = area > 0 && dark === 0 && shows === 0;
      results.push({ view, eye, state, area, openArea, share: Math.round((area / openArea) * 1000) / 1000, openLit: lit, openLitShowing: shows, darkOutsideBand: dark, pass });
    }
    // A half-lid closes the open eye over its top: the lid's pale fur and its lash lie over the ball's upper part, so
    // nothing dark of the open eye (its rim, its iris) shows in the top fifth of the open eye's footprint, which the
    // lid covers in every view (about two fifths at its middle, a third at its ends). The lid is drawn in the eye's own
    // part, so the footprint itself is the ball's, as the front's always was.
    const sleepy = footprint(`ids_${slug(view)}_sleepy`, eye);
    const rows = (m: Uint8Array, w: number) => {
      const ys: number[] = [];
      for (let p = 0; p < m.length; p++) if (m[p]) ys.push(Math.floor(p / w));
      return [Math.min(...ys), Math.max(...ys)] as const;
    };
    const [openTop, openFoot] = rows(open.mask, open.w), topRows = openTop + 0.2 * (openFoot - openTop + 1);
    let dark = 0;
    for (let p = 0; p < open.mask.length; p++) if (open.mask[p] && Math.floor(p / open.w) < topRows && lum(sleepy.white.data, p * 4) < 66) dark++;
    const area = sleepy.mask.reduce((a, b) => a + b, 0);
    results.push({ view, eye, state: "sleepy", area, openArea, share: Math.round((area / openArea) * 1000) / 1000, darkUnderLid: dark, pass: area > 0 && dark === 0 });
  }
}
writeFileSync(join(out, "ids.json"), JSON.stringify(results, null, 1));
const failed = results.filter((r) => !r.pass);
console.log(`rendered ${plan.reduce((n, p) => n + p.cells.length, 0)} cells and ${idClips.length} ID stills into ${out}; ID check: ${results.length - failed.length} of ${results.length} pass`);
for (const f of failed) console.log(`  FAIL ${JSON.stringify(f)}`);
mkdirSync(out, { recursive: true });
