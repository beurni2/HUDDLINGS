// Scratch copies of a view for the fur pass's recipe demo (lane 1): the view's own source, its relative imports made
// absolute, with a group's opt-ins patched in as plain text edits, written to a temporary folder and imported from
// there. The views in characters/dog/src/views/ are never touched: each view's lane opts in there itself.
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const folder = mkdtempSync(join(tmpdir(), "furkit-demo-"));
let made = 0;

/** One edit: `find` must occur in the source exactly once, and is replaced by `replace`. */
export interface Edit {
  find: string;
  replace: string;
}

/** The view's source with the edits made, its imports pointing at the repository's files. */
export function patched(view: string, edits: Edit[]): string {
  const file = join(repo, "characters/dog/src/views", `${view}.ts`);
  let src = readFileSync(file, "utf8").replace(/from "(\.\.?\/[^"]+)"/g, (_m, spec: string) => `from "${pathToFileURL(resolve(dirname(file), spec)).href}"`);
  for (const e of edits) {
    const n = src.split(e.find).length - 1;
    if (n !== 1) throw new Error(`demo: an edit to ${view}.ts finds its text ${n} times, not once: ${e.find.slice(0, 120)}`);
    src = src.replace(e.find, () => e.replace);
  }
  return src;
}

/** The scratch view's module: the view with the edits made, imported fresh. */
export async function scratch<T>(view: string, edits: Edit[], prelude = ""): Promise<T> {
  const path = join(folder, `${view}-${++made}.ts`);
  writeFileSync(path, prelude + patched(view, edits));
  return (await import(pathToFileURL(path).href)) as T;
}

/** The repository's file as a URL, for a scratch view's added imports. */
export const at = (path: string) => pathToFileURL(join(repo, path)).href;
export { repo };
