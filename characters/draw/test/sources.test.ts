// Rule R8 and decision E1: parts are drawn from hand-typed nodes, never from the
// sheets. Nothing in the drawing kit or a species' source may read the sheets,
// their crops or guides, or any image: checked in the code's text, and by
// watching every file the drawings actually read, through node:fs and
// node:fs/promises alike.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs, { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import fsp from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const characters = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
/** A path segment named for the sheets, their crops or guides, however it is joined (a/ref/b, "ref", 'ref'), or an image or a tracer. */
const FORBIDDEN = /(^|[/\\"'`])(ref|reference|refmap|guides)([/\\"'`]|$)|\.(png|jpe?g|webp)\b|potrace|vtracer/i;

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

/** Every function that reads, lists or opens a path, on node:fs and on node:fs/promises (the same object as fs.promises). */
const WATCHED: [Record<string, unknown>, string[]][] = [
  [fs as unknown as Record<string, unknown>, ["readFileSync", "readFile", "openSync", "open", "createReadStream", "readdirSync", "readdir", "existsSync", "exists",
    "statSync", "stat", "lstatSync", "lstat", "accessSync", "access", "opendirSync", "opendir", "copyFileSync", "copyFile", "cpSync", "cp", "readlinkSync",
    "readlink", "realpathSync", "realpath", "watch", "watchFile"]],
  [fsp as unknown as Record<string, unknown>, ["readFile", "open", "readdir", "stat", "lstat", "access", "opendir", "copyFile", "cp", "readlink", "realpath", "watch"]],
];

/** Every path read while run() runs, through either module, named imports included. */
async function reads(run: () => Promise<void>): Promise<string[]> {
  const read: string[] = [];
  const originals = WATCHED.map(([module, names]) => names.filter((name) => typeof module[name] === "function").map((name) => [module, name, module[name]] as const)).flat();
  for (const [module, name, original] of originals) {
    module[name] = (path: unknown, ...rest: unknown[]) => {
      read.push(String(path instanceof URL ? fileURLToPath(path) : path));
      return (original as (...a: unknown[]) => unknown)(path, ...rest);
    };
  }
  // Named imports (import { readFile } from "node:fs/promises") are live bindings to these properties.
  syncBuiltinESMExports();
  try {
    await run();
  } finally {
    for (const [module, name, original] of originals) module[name] = original;
    syncBuiltinESMExports();
  }
  return read;
}

test("no drawing source names the sheets, their crops or guides, or an image", () => {
  assert.ok(sources.some((f) => f.endsWith(join("dog", "src", "views", "front.ts"))), "the dog's front view is checked");
  for (const file of sources) {
    readFileSync(file, "utf8").split("\n").forEach((line, i) => {
      assert.ok(!FORBIDDEN.test(line), `${relative(characters, file)}:${i + 1} names a forbidden source: ${line.trim()}`);
    });
  }
});

test("a forbidden folder is caught however its path is joined", () => {
  for (const line of [
    `readFileSync(join(dir, "..", "ref", "panels.json"))`,
    `readdirSync(join(here, '..', 'refmap'))`,
    "await readFile(`${root}/reference/dog-master.png`)",
    `path.join(species, "guides")`,
    `new URL("../ref/model.json", import.meta.url)`,
    `"C:\\\\dog\\\\ref\\\\x"`,
    `const dir = "characters/dog/ref"`,
  ]) assert.ok(FORBIDDEN.test(line), line);
  for (const line of [`import { refine } from "./geom.ts";`, `const reference = 3;`, `// the sheet's reference crop`]) assert.ok(!FORBIDDEN.test(line), line);
});

test("the watch sees reads through node:fs/promises, named imports and fs.promises included", async () => {
  const dir = mkdtempSync(join(tmpdir(), "sources-test-"));
  try {
    const module = join(dir, "planted.ts");
    writeFileSync(module, [
      `import { readFile, readdir } from "node:fs/promises";`,
      `import fs from "node:fs";`,
      `import { join } from "node:path";`,
      `export async function plant(dir: string): Promise<void> {`,
      `  await readFile(join(dir, "..", "ref", "panels.json")).catch(() => undefined);`,
      `  await readdir(join(dir, "refmap")).catch(() => undefined);`,
      `  await fs.promises.readFile(join(dir, "guides", "front.json")).catch(() => undefined);`,
      `}`,
    ].join("\n"));
    const seen = await reads(async () => {
      const planted = (await import(pathToFileURL(module).href)) as { plant(dir: string): Promise<void> };
      await planted.plant(dir);
    });
    for (const end of [join("ref", "panels.json"), join(dir, "refmap"), join("guides", "front.json")]) {
      const path = seen.find((p) => p.endsWith(end));
      assert.ok(path, `the watch misses ${end}: it saw ${seen.join(", ")}`);
      assert.ok(FORBIDDEN.test(path.replaceAll("\\", "/")), `${path} passes the check`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("making every species' drawings reads no sheet, crop, guide or image", async () => {
  // Found before the watch starts, so the search's own look into characters/reference is not counted.
  const modules = readdirSync(characters).map((species) => join(characters, species, "src", "drawings.ts")).filter((path) => {
    try {
      return statSync(path).isFile();
    } catch {
      return false;
    }
  });
  assert.ok(modules.some((m) => m.includes(join("dog", "src"))));
  const read = await reads(async () => {
    for (const drawings of modules) {
      // A fresh copy of the module, so what it reads when it loads is seen too.
      const module = (await import(`${pathToFileURL(drawings).href}?sources-test`)) as { drawings(): unknown[]; landmarks?(): unknown };
      assert.ok(module.drawings().length > 0);
      module.landmarks?.();
    }
  });
  assert.ok(read.some((p) => p.endsWith("model.json")), "the watch sees the reads");
  for (const path of read) assert.ok(!FORBIDDEN.test(path.replaceAll("\\", "/")), `the drawings read ${path}`);
});
