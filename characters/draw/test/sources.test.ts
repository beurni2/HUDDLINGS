// Rule R8 and decision E1: parts are drawn from hand-typed nodes, never from the
// sheets. Nothing in the drawing kit or a species' source may read the sheets,
// their crops or guides, or any image: checked in the code's text, and by
// watching every file the drawings actually read.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs, { readdirSync, readFileSync, statSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const characters = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const FORBIDDEN = /(^|[/"'`])(ref|reference|refmap|guides)\/|\.(png|jpe?g|webp)\b|potrace|vtracer/i;

function files(folder: string): string[] {
  return readdirSync(folder).flatMap((name) => {
    const path = join(folder, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

const sources = [
  ...files(join(characters, "draw")).filter((f) => !f.includes(`${join("draw", "test")}`)),
  ...readdirSync(characters).flatMap((species) => {
    const src = join(characters, species, "src");
    try {
      return statSync(src).isDirectory() ? files(src) : [];
    } catch {
      return [];
    }
  }),
];

test("no drawing source names the sheets, their crops or guides, or an image", () => {
  assert.ok(sources.some((f) => f.endsWith(join("dog", "src", "views", "front.ts"))), "the dog's front view is checked");
  for (const file of sources) {
    readFileSync(file, "utf8").split("\n").forEach((line, i) => {
      assert.ok(!FORBIDDEN.test(line), `${relative(characters, file)}:${i + 1} names a forbidden source: ${line.trim()}`);
    });
  }
});

test("making every species' drawings reads no sheet, crop, guide or image", async () => {
  const read: string[] = [];
  const watched = ["readFileSync", "readFile", "openSync", "open", "createReadStream", "readdirSync", "existsSync"] as const;
  const original = Object.fromEntries(watched.map((name) => [name, fs[name]]));
  for (const name of watched) {
    (fs as unknown as Record<string, unknown>)[name] = (path: unknown, ...rest: unknown[]) => {
      read.push(String(path instanceof URL ? fileURLToPath(path) : path));
      return (original[name] as (...a: unknown[]) => unknown)(path, ...rest);
    };
  }
  syncBuiltinESMExports();
  try {
    for (const species of readdirSync(characters)) {
      const drawings = join(characters, species, "src", "drawings.ts");
      try {
        statSync(drawings);
      } catch {
        continue;
      }
      // A fresh copy of the module, so what it reads when it loads is seen too.
      const module = (await import(`${pathToFileURL(drawings).href}?sources-test`)) as { drawings(): unknown[]; landmarks?(): unknown };
      assert.ok(module.drawings().length > 0);
      module.landmarks?.();
    }
  } finally {
    for (const name of watched) (fs as unknown as Record<string, unknown>)[name] = original[name];
    syncBuiltinESMExports();
  }
  assert.ok(read.some((p) => p.endsWith("model.json")), "the watch sees the reads");
  for (const path of read) assert.ok(!FORBIDDEN.test(path.replaceAll("\\", "/")), `the drawings read ${path}`);
});
