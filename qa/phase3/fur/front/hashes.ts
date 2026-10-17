// Every drawing of the dog (its SVG, anchor and meta, as the build wraps it into its bone) hashed by region, one line
// per view: how the front lane proves a shared recipe's change leaves the other views' drawings byte-identical.
//
// node qa/phase3/fur/front/hashes.ts [--regions]
import { createHash } from "node:crypto";
import { drawings } from "../../../../characters/dog/src/drawings.ts";

const byView = new Map<string, ReturnType<typeof createHash>>();
const lines: string[] = [];
for (const d of drawings().sort((a, b) => a.region.localeCompare(b.region))) {
  const view = d.region.split("/")[1]!.split(":")[0]!;
  const text = JSON.stringify([d.region, d.svg, d.anchor, d.meta ?? null]);
  if (!byView.has(view)) byView.set(view, createHash("sha256"));
  byView.get(view)!.update(text);
  lines.push(`${d.region} ${createHash("sha256").update(text).digest("hex").slice(0, 16)}`);
}
if (process.argv.includes("--regions")) console.log(lines.join("\n"));
for (const [view, h] of [...byView].sort()) console.log(`${view} ${h.digest("hex")}`);
