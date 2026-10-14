// One batch of rasters, in its own process (raster.ts): if resvg aborts, only
// this process dies. Run: node characters/build/raster-worker.ts <jobs.json>
import { readFileSync, renameSync } from "node:fs";
import { rasterize } from "./atlas.ts";
import { writeRaster, type Job } from "./raster.ts";

const jobs = JSON.parse(readFileSync(process.argv[2]!, "utf8")) as Job[];
for (const job of jobs) {
  // With the anchor at 0, 0 the raster's anchor is minus the trim's corner.
  const r = rasterize({ region: job.file, svg: job.svg, anchor: [0, 0] }, job.scale);
  // Written aside and moved into place, so a half-written file is never read as a cached raster.
  writeRaster(`${job.file}.part`, { w: r.w, h: r.h, minX: -r.anchorX, minY: -r.anchorY, data: r.data });
  renameSync(`${job.file}.part`, job.file);
}
