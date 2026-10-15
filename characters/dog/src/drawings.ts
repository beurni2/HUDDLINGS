// The dog's drawings, one per part, view and state, wrapped into their bones'
// spaces from the rig's rest pivots. This is where an illustrator's layered SVGs
// would plug in instead (spec L736), with the same part names and pivots.
import { readFileSync } from "node:fs";
import type { Drawing } from "../../build/atlas.ts";
import { toBone } from "../../draw/frame.ts";
import type { LintRules } from "../../draw/lint.ts";
import type { Rig } from "../../../runtime-web/src/format.ts";
import { palette } from "./palette.ts";
import { back, landmarks as backLandmarks } from "./views/back.ts";
import { front, landmarks as frontLandmarks } from "./views/front.ts";
import { side, landmarks as sideLandmarks } from "./views/side.ts";
import { threeQuarter, landmarks as threeQuarterLandmarks } from "./views/threeQuarter.ts";

const rig = JSON.parse(readFileSync(new URL("./rig.json", import.meta.url), "utf8")) as Rig;

const VIEWS = { front, "threeQuarter.L": threeQuarter, "side.L": side, back };

export function drawings(): Drawing[] {
  return Object.entries(VIEWS).flatMap(([view, draw]) => draw().map((d) => toBone(d.part, rig, view, d.piece, d.state)));
}

/** Where each view's drawing puts the points the sheet has no finder for, in model space. */
export function landmarks(): Record<string, Record<string, [number, number]>> {
  return { front: frontLandmarks, "threeQuarter.L": threeQuarterLandmarks, "side.L": sideLandmarks, back: backLandmarks };
}

export const lint: LintRules = {
  palette,
  corners: {
    collar: "the band's narrow rounded ends tuck under the cheek fur (spec L394), as the turnaround draws them",
    tag: "the heart's point, as the sheet draws it",
  },
};
