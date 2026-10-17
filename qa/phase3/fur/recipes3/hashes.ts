// Every drawing of the dog hashed by region, its SVG apart from its meta (the build's own drawings, as drawings.ts wraps
// them into their bones): how the third round proves that its options left every drawing a view does not opt in
// byte-identical, and that the changes the lead's L4 makes everywhere (DECISIONS 286) touch the meta alone where they
// add an inner line's meta (a dome toe line) and the drawing itself only where a tuck changes. One line per drawing:
// region, the SVG's hash, the anchor's and the meta's.
//
// node qa/phase3/fur/recipes3/hashes.ts > <file>     (run in a checkout of any commit, then diff the two files)
import { createHash } from "node:crypto";
import { drawings } from "../../../../characters/dog/src/drawings.ts";

const h = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);
for (const d of drawings().sort((a, b) => a.region.localeCompare(b.region))) {
  console.log(`${d.region} svg ${h(d.svg)} anchor ${h(JSON.stringify(d.anchor))} meta ${h(JSON.stringify(d.meta ?? null))}`);
}
