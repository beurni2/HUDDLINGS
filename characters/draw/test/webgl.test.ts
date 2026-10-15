// The rest frame through WebGL: the dog's still_front, drawn by the WebGL
// runtime in headless Chromium (runtime-web/lab/still.ts, the sheet match's
// own renders), holds its white and black passes to the resvg composite of the
// model-space drawings, and its ID pass shows the soft parts.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PNG } from "pngjs";
import type { Rig } from "../../../runtime-web/src/format.ts";
import { hex } from "../../../runtime-web/lab/ids.ts";
import { openStills, type StillInfo, type Stills } from "../../../runtime-web/lab/still.ts";
import { buildPackage, readSource, writePackage } from "../../build/build.ts";
import { front } from "../../dog/src/views/front.ts";
import { BOX, composite, resvgLayers } from "./composite.ts";

const SCALE = 3;
const W = BOX.w * SCALE, H = BOX.h * SCALE;
const source = await readSource("dog");
const rig = source.rig as Rig;
const dir = mkdtempSync(join(tmpdir(), "huddlings-webgl-"));
writePackage(await buildPackage(source), join(dir, "package"));
let stills: Stills;
let info: StillInfo;
const png = (name: string) => PNG.sync.read(readFileSync(join(dir, "front", name)));

before(async () => {
  stills = await openStills(join(dir, "package"));
  await stills.load(SCALE);
  info = await stills.render("still_front", join(dir, "front"));
});
after(async () => {
  await stills?.close();
  rmSync(dir, { recursive: true, force: true });
});

test("the WebGL still of the dog's front reproduces the resvg composite of its model-space drawings", (t) => {
  const white = png("white.png"), black = png("black.png");
  const pieces = new Map(front().map((d) => [d.part, d.piece]));
  const clipOf = (name: string) => rig.parts.find((p) => p.name === name)!.clipTo;
  assert.deepEqual([...info.drawn].sort(), [...pieces.keys()].sort(), "the still draws every drawing of the view");
  const reference = composite(resvgLayers(info.drawn, pieces, clipOf, SCALE), W, H);
  // Still pixel (i, j) and reference pixel (i − dx, j − dy) cover the same model points: both grids are whole pixels at 3 px/pt.
  const dx = info.rootPx[0] + SCALE * BOX.x, dy = info.rootPx[1] + SCALE * BOX.y;
  assert.ok(Number.isInteger(dx) && Number.isInteger(dy));
  const [w, h] = info.sizePx;
  /** Premultiplied colour (from black) and alpha (from white and black) against the reference moved by (ox, oy), in 255ths. */
  const compare = (ox: number, oy: number) => {
    let sum = 0, count = 0, worst = 0, at = "", covered = 0;
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const k = (j * w + i) * 4;
        // Over black a pixel is its premultiplied colour; white adds 255·(1 − alpha) to each channel.
        const alpha = 1 - (white.data[k]! - black.data[k]! + white.data[k + 1]! - black.data[k + 1]! + white.data[k + 2]! - black.data[k + 2]!) / 3 / 255;
        const u = i - dx + ox, v = j - dy + oy;
        const inside = u >= 0 && v >= 0 && u < W && v < H;
        const want = (c: number) => (inside ? reference[(v * W + u) * 4 + c]! : 0);
        for (const [got, c] of [[black.data[k]! / 255, 0], [black.data[k + 1]! / 255, 1], [black.data[k + 2]! / 255, 2], [alpha, 3]] as const) {
          const d = Math.abs(got - want(c)) * 255;
          sum += d;
          count++;
          if (d > worst) [worst, at] = [d, `${i}, ${j}`];
        }
        if (want(3) > 0.5) covered++;
      }
    }
    return { mean: sum / count, worst, at, covered };
  };
  const { mean, worst, at, covered } = compare(0, 0);
  t.diagnostic(`WebGL against resvg over ${w} × ${h} px (${covered} covered): mean difference ${mean.toFixed(4)}/255, largest ${worst.toFixed(2)}/255 at ${at}`);
  assert.ok(covered > 0.3 * w * h, "the dog covers the still");
  // The GPU blends in 8 bits, rounding once per layer: a small fraction of a level on average, two at most.
  assert.ok(mean < 0.1, `mean difference ${mean.toFixed(4)}/255`);
  assert.ok(worst <= 2, `largest difference ${worst.toFixed(2)}/255 at ${at}`);
  // The comparison sees a still drawn one pixel off.
  assert.ok(compare(1, 0).worst > 50 && compare(0, 1).mean > 10 * mean, "a still one pixel off goes unseen");
});

test("the dog's soft parts show in its ID pass: both cheeks' blush and the ground shadow", () => {
  const ids = png("ids.png");
  const count = new Map<string, number>();
  for (let k = 0; k < ids.data.length; k += 4) {
    const c = hex([...ids.data.subarray(k, k + 3)]);
    count.set(c, (count.get(c) ?? 0) + 1);
  }
  // The blush is 0.47 opaque at most, so the old 0.5 cut dropped it whole. (shadow.chin's core lies under the collar.)
  for (const part of ["blush.L", "blush.R", "shadow"]) {
    const n = count.get(info.parts[part]!.id) ?? 0;
    // At 3 px/pt a part of 10 pt² covers 90 px.
    assert.ok(n >= 90, `${part} shows on ${n} pixels of the ID pass`);
  }
});
