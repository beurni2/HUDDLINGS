// The rest frame's placing, on the CPU: the dog's rest frame laid out by the
// runtime's own draw list (compile, evaluatePose, drawList) from the built
// atlas, each region's texels copied to where its quad lands and composited on
// the CPU, equals the plain resvg composite of the model-space drawings. It
// holds the frame (anchors from pivots, whole-point canvases), the trim, the
// packer and the atlas to the drawings themselves. It runs no renderer:
// webgl.test.ts holds the WebGL runtime's own still to the same composite.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PNG } from "pngjs";
import type { AtlasSet, Rig } from "../../../runtime-web/src/format.ts";
import { compile, drawList, evaluatePose } from "../../../runtime-web/src/rig.ts";
import { buildPackage, readSource } from "../../build/build.ts";
import { front } from "../../dog/src/views/front.ts";
import { BOX, composite, difference, resvgLayers, type Layer } from "./composite.ts";

const SCALE = 3;
const W = BOX.w * SCALE, H = BOX.h * SCALE;

test("the draw list's rest frame, composited on the CPU, equals the resvg composite of the dog's model-space drawings", async (t) => {
  const source = await readSource("dog");
  const pkg = await buildPackage(source);
  const set = pkg.atlas.sets.find((s) => s.scale === SCALE)!;
  const pages = set.pages.map((p) => PNG.sync.read(pkg.files.get(p.file)!));
  const rig = JSON.parse(readFileSync(new URL("../../dog/src/rig.json", import.meta.url), "utf8")) as Rig;
  const c = compile(rig);
  const views = { body: "front", head: "front" };
  const clipOf = (name: string) => rig.parts.find((p) => p.name === name)!.clipTo;

  // The draw list's side: each region's quad, axis-aligned at rest, its texels copied from its page.
  const laidOut = (regions: AtlasSet["regions"]): Layer[] =>
    drawList(c, evaluatePose(c, { channels: {}, views }), { ...set, regions }, { views, states: {} }).map((item) => {
      const region = regions[item.region]!;
      const page = pages[region.page]!;
      const left = (Math.min(item.positions[0]!, item.positions[2]!) - BOX.x) * SCALE;
      const top = (Math.min(item.positions[1]!, item.positions[5]!) - BOX.y) * SCALE;
      assert.ok(Math.abs(left - Math.round(left)) < 1e-6 && Math.abs(top - Math.round(top)) < 1e-6, `${item.region} lands between pixels (${left}, ${top})`);
      const rgba = new Uint8Array(W * H * 4);
      for (let y = 0; y < region.h; y++) {
        for (let x = 0; x < region.w; x++) {
          const from = ((region.y + y) * page.width + region.x + x) * 4;
          rgba.set(page.data.subarray(from, from + 4), ((Math.round(top) + y) * W + Math.round(left) + x) * 4);
        }
      }
      const clipTo = clipOf(item.part);
      return { rgba, part: item.part, ...(clipTo ? { clipTo } : {}) };
    });

  // The drawings' side: each model-space piece rendered on the canvas by resvg, in the same order.
  const pieces = new Map(front().map((d) => [d.part, d.piece]));
  const order = laidOut(set.regions).map((l) => l.part);
  const reference = composite(resvgLayers(order, pieces, clipOf, SCALE), W, H);
  let covered = 0;
  for (let i = 3; i < reference.length; i += 4) if (reference[i]! > 0.5) covered++;
  assert.ok(covered > 0.3 * W * H, "the dog covers the canvas");
  assert.equal(order.length, pieces.size, "every drawing is in the frame");

  const { mean, worst } = difference(composite(laidOut(set.regions), W, H), reference);
  t.diagnostic(`mean difference ${mean.toFixed(4)}/255, largest ${worst.toFixed(3)}/255, over ${covered} covered pixels`);
  assert.ok(mean < 0.01, `mean difference ${mean.toFixed(4)}/255`);
  assert.ok(worst < 1, `largest difference ${worst.toFixed(2)}/255`);

  // A planted fault: one anchor a point off, as a hand-typed anchor would be, shows.
  const off = { ...set.regions, "tag/front": { ...set.regions["tag/front"]!, anchorX: set.regions["tag/front"]!.anchorX + SCALE } };
  assert.ok(difference(composite(laidOut(off), W, H), reference).worst > 50, "a misplaced anchor goes unseen");
});
