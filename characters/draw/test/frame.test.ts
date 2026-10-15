// Tests for wrapping model-space drawings into their bones' spaces, and for ids.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Rig } from "../../../runtime-web/src/format.ts";
import { apply } from "../../../runtime-web/src/math.ts";
import { restTransform, toBone } from "../frame.ts";
import { piece, scopeIds } from "../svg.ts";

const rig: Rig = {
  format: 1, species: "frame", height: 164, views: ["front"], headBone: "head",
  bones: [
    { name: "root" },
    { name: "body", parent: "root", y: -10 },
    { name: "head", parent: "body", x: 0.4, y: -47.3 },
    { name: "ear", parent: "head", x: 30, y: -60, rest: 20 },
  ],
  parts: [
    { name: "body", bone: "body", group: "body", regions: { front: "body/front" } },
    { name: "head", bone: "head", group: "head", regions: { front: "head/front" } },
    { name: "ear", bone: "ear", group: "head", regions: { front: "ear/front" } },
  ],
  drawOrder: { front: ["body", "@head"], "head.front": ["ear", "head"] },
};

const viewBox = (svg: string) => /viewBox="([^"]+)"/.exec(svg)![1]!.split(" ").map(Number);

test("an unturned bone keeps model space: whole-point canvas on whole model points, anchor at the pivot", () => {
  const d = toBone("head", rig, "front", piece(`<circle cx="0" cy="-100" r="40"/>`, [-40.2, -140.5, 80.4, 80.6]));
  const [x, y, w, h] = viewBox(d.svg);
  assert.deepEqual([x, y, w, h], [-41, -141, 82, 82]);
  assert.match(d.svg, /width="82" height="82"/);
  assert.ok(!d.svg.includes("transform"), "no transform for a bone that is not turned at rest");
  // The head's pivot is at (0.4, −57.3) in model space; the anchor is that point on the canvas.
  assert.ok(Math.abs(d.anchor[0] - 41.4) < 1e-9 && Math.abs(d.anchor[1] - 83.7) < 1e-9, `anchor ${d.anchor}`);
  assert.equal(d.region, "head/front");
});

test("a turned bone wraps the drawing in the inverse of its rest transform, so the runtime turns it back", () => {
  const m = restTransform(rig, "ear", "front");
  const pivot: [number, number] = [m.tx, m.ty];
  const d = toBone("ear", rig, "front", piece(`<rect x="20" y="-120" width="20" height="30"/>`, [20, -120, 20, 30]));
  const t = /matrix\(([^)]+)\)/.exec(d.svg)![1]!.split(" ").map(Number);
  // A model point p is drawn at t(p) on the canvas; the runtime puts canvas point q at m(q − pivot).
  for (const p of [[20, -120], [40, -90], [pivot[0], pivot[1]]] as [number, number][]) {
    const q = [t[0]! * p[0] + t[2]! * p[1] + t[4]!, t[1]! * p[0] + t[3]! * p[1] + t[5]!];
    const back = apply(m, q[0]! - pivot[0], q[1]! - pivot[1]);
    assert.ok(Math.abs(back[0] - p[0]) < 1e-6 && Math.abs(back[1] - p[1]) < 1e-6, `${p} comes back as ${back}`);
  }
  const [x, y, w, h] = viewBox(d.svg);
  assert.ok(Number.isInteger(w) && Number.isInteger(h) && Number.isInteger(x) && Number.isInteger(y));
});

test("ids are renamed per drawing, references with them", () => {
  const svg = `<defs><clipPath id="clip7"><path d="M0 0"/></clipPath><filter id="blur3"/></defs><g clip-path="url(#clip7)" filter="url(#blur3)"><use href="#clip7"/></g>`;
  assert.equal(scopeIds(svg, "a_"), `<defs><clipPath id="a_0"><path d="M0 0"/></clipPath><filter id="a_1"/></defs><g clip-path="url(#a_0)" filter="url(#a_1)"><use href="#a_0"/></g>`);
  // The same drawing made later in the process gets the same text.
  const once = toBone("body", rig, "front", piece(`<g id="x9"/>`, [0, 0, 1, 1])).svg;
  const again = toBone("body", rig, "front", piece(`<g id="x10"/>`, [0, 0, 1, 1])).svg;
  assert.equal(once, again);
});
