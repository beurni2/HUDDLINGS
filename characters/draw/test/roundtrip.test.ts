// The round trip: the runtime's rest frame, drawn from the built atlas through
// the rig (compile, evaluatePose, drawList) as both renderers draw it, equals
// the plain resvg composite of the model-space drawings. It holds the frame
// (anchors from pivots, whole-point canvases), the trim, the packer and the
// atlas to the drawings themselves. Clip groups use the renderers' stencil rule
// on both sides: a clipped part shows where its mask's alpha is 0.05 or more.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";
import { PNG } from "pngjs";
import type { AtlasSet, Rig } from "../../../runtime-web/src/format.ts";
import { compile, drawList, evaluatePose } from "../../../runtime-web/src/rig.ts";
import { buildPackage, readSource } from "../../build/build.ts";
import { scopeIds } from "../svg.ts";
import { front } from "../../dog/src/views/front.ts";

const SCALE = 3;
/** The model-space canvas, in whole points: the dog with room around it. */
const BOX = { x: -100, y: -180, w: 200, h: 190 };
const W = BOX.w * SCALE, H = BOX.h * SCALE;

interface Layer {
  /** Straight RGBA on the canvas. */
  rgba: Uint8Array;
  clipTo?: string;
  part: string;
}

/** Premultiplied over, with the stencil: a clipped layer shows only where its mask's alpha is 0.05 or more. */
function composite(layers: Layer[]): Float64Array {
  const out = new Float64Array(W * H * 4);
  const byPart = new Map(layers.map((l) => [l.part, l]));
  for (const layer of layers) {
    const mask = layer.clipTo ? byPart.get(layer.clipTo)!.rgba : undefined;
    for (let i = 0; i < W * H; i++) {
      if (mask && mask[i * 4 + 3]! / 255 < 0.05) continue;
      const a = layer.rgba[i * 4 + 3]! / 255;
      for (let k = 0; k < 3; k++) out[i * 4 + k] = (layer.rgba[i * 4 + k]! / 255) * a + out[i * 4 + k]! * (1 - a);
      out[i * 4 + 3] = a + out[i * 4 + 3]! * (1 - a);
    }
  }
  return out;
}

/** The largest and the mean difference between two composites, in 255ths. */
function difference(a: Float64Array, b: Float64Array): { mean: number; worst: number } {
  let sum = 0, worst = 0;
  for (let i = 0; i < a.length; i++) {
    const d = Math.abs(a[i]! - b[i]!) * 255;
    sum += d;
    worst = Math.max(worst, d);
  }
  return { mean: sum / a.length, worst };
}

test("the runtime's rest frame equals the resvg composite of the dog's model-space drawings", async (t) => {
  const source = await readSource("dog");
  const pkg = await buildPackage(source);
  const set = pkg.atlas.sets.find((s) => s.scale === SCALE)!;
  const pages = set.pages.map((p) => PNG.sync.read(pkg.files.get(p.file)!));
  const rig = JSON.parse(readFileSync(new URL("../../dog/src/rig.json", import.meta.url), "utf8")) as Rig;
  const c = compile(rig);
  const views = { body: "front", head: "front" };
  const clipOf = (name: string) => rig.parts.find((p) => p.name === name)!.clipTo;

  // The runtime's side: each region's quad, axis-aligned at rest, copied from its page.
  const runtime = (regions: AtlasSet["regions"]): Layer[] =>
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
  const order = runtime(set.regions).map((l) => l.part);
  const drawn: Layer[] = order.map((part) => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${BOX.w}" height="${BOX.h}" viewBox="${BOX.x} ${BOX.y} ${BOX.w} ${BOX.h}">` +
      `${scopeIds(pieces.get(part)!.svg, "p")}</svg>`;
    const png = PNG.sync.read(new Resvg(svg, { fitTo: { mode: "zoom", value: SCALE }, background: "rgba(0,0,0,0)" }).render().asPng());
    const clipTo = clipOf(part);
    return { rgba: png.data, part, ...(clipTo ? { clipTo } : {}) };
  });
  const reference = composite(drawn);
  let covered = 0;
  for (let i = 3; i < reference.length; i += 4) if (reference[i]! > 0.5) covered++;
  assert.ok(covered > 0.3 * W * H, "the dog covers the canvas");
  assert.equal(order.length, pieces.size, "every drawing is in the frame");

  const { mean, worst } = difference(composite(runtime(set.regions)), reference);
  t.diagnostic(`mean difference ${mean.toFixed(4)}/255, largest ${worst.toFixed(3)}/255, over ${covered} covered pixels`);
  assert.ok(mean < 0.01, `mean difference ${mean.toFixed(4)}/255`);
  assert.ok(worst < 1, `largest difference ${worst.toFixed(2)}/255`);

  // A planted fault: one anchor a point off, as a hand-typed anchor would be, shows.
  const off = { ...set.regions, "tag/front": { ...set.regions["tag/front"]!, anchorX: set.regions["tag/front"]!.anchorX + SCALE } };
  assert.ok(difference(composite(runtime(off)), reference).worst > 50, "a misplaced anchor goes unseen");
});
