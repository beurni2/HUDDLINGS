// A quick scratch build of one option on some views, its checks' summary printed (the look loop's for a scratch view).
//
// node qa/phase3/fur/recipes2/try.ts <out folder> weight <view...>
import { resolve } from "node:path";
import { scratchBuild } from "./build.ts";
import { CHIN, TOES, TOPKNOT, weight, type ViewFile } from "./options.ts";

const [out, option, ...views] = process.argv.slice(2);
if (!out || !option || !views.length) throw new Error("usage: try.ts <out> <option> <view...>");
const fileOf = (v: string) => v.split(".")[0] as ViewFile;
const files = [...new Set(views.map(fileOf))];
const edits = Object.assign({}, ...files.map((f) => (option === "weight" ? weight(f) : option === "chin" ? CHIN[f as keyof typeof CHIN] : option === "topknot" ? TOPKNOT[f as keyof typeof TOPKNOT] : option === "toes" ? TOES[f as keyof typeof TOES] : option === "today" ? { [f]: { edits: [] } } : {})));
const r = await scratchBuild(resolve(out), edits, views);
console.log(r.lines.join("\n"));
if (r.problems.length) console.log(`lint: ${r.problems.length} problems\n  ${r.problems.slice(0, 20).join("\n  ")}`);
