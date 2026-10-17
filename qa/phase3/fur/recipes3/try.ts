// A quick scratch build of the third round's options on some views, its checks' summary printed.
//
// HUDDLINGS_CACHE=<raster cache> node qa/phase3/fur/recipes3/try.ts <out folder> <option[+option...]> <view...>
//   options: today (no edits), life (every lit span's life, by class), and the typed ones in OPTIONS (options.ts)
import { resolve } from "node:path";
import { scratchBuild } from "./build.ts";
import { life, merged, OPTIONS, type Opt, type ViewFile } from "./options.ts";

const [out, option, ...views] = process.argv.slice(2);
if (!out || !option || !views.length) throw new Error("usage: try.ts <out> <option[+option...]> <view...>");
const files = [...new Set(views.map((v) => v.split(".")[0] as ViewFile))];
const opts: Opt[] = option.split("+").map((name) => {
  if (name === "today") return Object.fromEntries(files.map((f) => [f, { edits: [] }]));
  if (name === "life") return Object.fromEntries(files.map((f) => [f, life(f)]));
  const o = OPTIONS[name];
  if (!o) throw new Error(`no option ${name}`);
  return Object.fromEntries(Object.entries(o).filter(([f]) => files.includes(f as ViewFile)));
});
const r = await scratchBuild(resolve(out), merged(...opts), views);
console.log(r.lines.join("\n"));
const mine = r.problems.filter((p) => views.some((v) => p.includes(`/${v}`)));
console.log(`lint (counting only what shows): ${mine.length} problems in these views`);
for (const p of mine.slice(0, 30)) console.log(`  ${p}`);
