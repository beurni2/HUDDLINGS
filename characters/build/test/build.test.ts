// Tests for the package build, from characters/format/README.md (Files, Atlas, Rendering).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { PNG } from "pngjs";
import { buildPackage, pngChunks, readSource, SETS } from "../build.ts";

const source = await readSource("test");
const pkg = await buildPackage(source);

test("the test character builds every atlas set with every region its rig uses", () => {
  const used = new Set(source.rig.parts.flatMap((p) => Object.values(p.regions)));
  assert.deepEqual(pkg.atlas.sets.map((s) => s.name), SETS.map((s) => s.name));
  for (const set of pkg.atlas.sets) {
    assert.deepEqual(new Set(Object.keys(set.regions)), used, `set ${set.name}`);
    for (const page of set.pages) {
      assert.equal(page.width & (page.width - 1), 0, `${page.file} is not a power of two`);
      assert.ok(page.width <= 2048, `${page.file} is wider than 2048 px`);
    }
  }
});

test("package.json records the SHA-256 of every other file", () => {
  const manifest = JSON.parse(pkg.files.get("package.json")!.toString("utf8"));
  assert.equal(manifest.format, 1);
  assert.equal(manifest.species, "test");
  const names = [...pkg.files.keys()].filter((n) => n !== "package.json").sort();
  assert.deepEqual(Object.keys(manifest.files), names);
  for (const name of names) assert.equal(manifest.files[name], createHash("sha256").update(pkg.files.get(name)!).digest("hex"), name);
});

test("atlas pages are 8-bit RGBA PNGs with no colour chunk that would change their bytes", () => {
  for (const [name, bytes] of pkg.files) {
    if (!name.endsWith(".png")) continue;
    const chunks = pngChunks(bytes);
    assert.equal(chunks[0], "IHDR", name);
    assert.equal(chunks.at(-1), "IEND", name);
    for (const bad of ["gAMA", "cHRM", "iCCP"]) assert.ok(!chunks.includes(bad), `${name} has ${bad}`);
    // IHDR: bit depth 8, colour type 6 (RGBA).
    assert.equal(bytes[24], 8, name);
    assert.equal(bytes[25], 6, name);
    PNG.sync.read(bytes);
  }
});

test("the same source builds the same bytes", async () => {
  const again = await buildPackage(source);
  assert.deepEqual([...again.files.keys()].sort(), [...pkg.files.keys()].sort());
  for (const [name, bytes] of pkg.files) assert.ok(bytes.equals(again.files.get(name)!), `${name} changed between builds`);
});

test("the build refuses a region nobody draws, a drawing nobody uses, and a broken rig", async () => {
  const missing = { ...source, drawings: source.drawings.filter((d) => d.region !== "nose/front") };
  await assert.rejects(buildPackage(missing), /region nose\/front: the rig uses it but nothing draws it/);
  const extra = { ...source, drawings: [...source.drawings, { ...source.drawings[0]!, region: "spare" }] };
  await assert.rejects(buildPackage(extra), /drawing spare: no part uses it/);
  const broken = { ...source, rig: { ...source.rig, drawOrder: { ...source.rig.drawOrder, front: ["ghost"] } } };
  await assert.rejects(buildPackage(broken), /unknown part ghost/);
});
