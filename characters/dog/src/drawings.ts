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
import { landmarksFor } from "./views/facing.ts";
import { front, landmarks as frontLandmarks } from "./views/front.ts";
import { side, landmarks as sideLandmarks } from "./views/side.ts";
import { threeQuarter, landmarks as threeQuarterLandmarks } from "./views/threeQuarter.ts";

const rig = JSON.parse(readFileSync(new URL("./rig.json", import.meta.url), "utf8")) as Rig;

/** Each view's drawings: the turned views in both facings, each .R its .L view mirrored and lit again (views/facing.ts). */
const VIEWS = {
  front: () => front(),
  "threeQuarter.L": () => threeQuarter("L"),
  "threeQuarter.R": () => threeQuarter("R"),
  "side.L": () => side("L"),
  "side.R": () => side("R"),
  back: () => back(),
};

export function drawings(): Drawing[] {
  return Object.entries(VIEWS).flatMap(([view, draw]) => draw().map((d) => toBone(d.part, rig, view, d.piece, d.state)));
}

/** Where each view's drawing puts the points the sheet has no finder for, in model space. */
export function landmarks(): Record<string, Record<string, [number, number]>> {
  return {
    front: frontLandmarks,
    "threeQuarter.L": threeQuarterLandmarks,
    "threeQuarter.R": landmarksFor("R", threeQuarterLandmarks),
    "side.L": sideLandmarks,
    "side.R": landmarksFor("R", sideLandmarks),
    back: backLandmarks,
  };
}

export const lint: LintRules = {
  palette,
  corners: {
    collar: "the band's narrow rounded ends tuck under the cheek fur (spec L394), and from behind its near-square ends sit in the neck's fur, as the turnarounds draw them",
    tag: "the heart's point, as the sheet draws it",
  },
};
