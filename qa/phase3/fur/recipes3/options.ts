// Each option of the fur kit's third round (DECISIONS 284 to 289) opted in on scratch copies of the views, as text edits
// to the views' own source (../recipes/scratch.ts): a first pass of what each view's lane will type from its crop, enough
// to show the option at work beside the sheet, not the lane's finished drawing. The views themselves are never changed.
import { at, type Edit } from "../recipes/scratch.ts";

export type ViewFile = "front" | "threeQuarter" | "side" | "back";
export type Opt = Partial<Record<ViewFile, { edits: Edit[]; prelude?: string }>>;

const LINES = at("characters/dog/src/parts/lines.ts");
const LIVELY = at("qa/phase3/fur/recipes3/lively.ts");

/** The line's life (DECISIONS 284) on every lit span of the view, each by its part's class, on its own living weight. */
export function life(file: ViewFile): { edits: Edit[] } {
  const names: Record<ViewFile, string> = {
    front: "litEdge, litMarking, litPart, type LitSpan",
    back: "litEdge, litMarking, litPart, type LitSpan",
    side: "FREE_TAPER, litEdge, litMarking, litPart, type LitSpan",
    threeQuarter: "litEdge, litMarking, litPart, withDefaults, type LitSpan",
  };
  const keep = names[file].replace("litEdge, litMarking, litPart, ", "");
  return {
    edits: [{
      find: `import { ${names[file]} } from "${LINES}";`,
      replace: `import { ${keep} } from "${LINES}";\nimport { lively } from "${LIVELY}";\nconst { litEdge, litMarking, litPart } = lively();`,
    }],
  };
}

/**
 * The typed options, by name, each its views' edits, each typed from its crop (read beside a 5 pt grid on the crop,
 * never traced):
 * - `swell`: the profile's back as master.turnaround.side draws it (DECISIONS 284, L1 d), read down columns and across
 *   rows of the crop at 8 px per pt (L* of each line run under 62, its height or width): the topline all but gone where
 *   it leaves the ear's hem (x -8: no run under 62, the edge at L* 70 to 82; a break at x -9), dark from x -4 on (L* 42
 *   to 45, 1 to 1.25 pt), easing a little down the back (y -45 to -35: L* 41 to 50, 1.25 pt); the rump over the tail
 *   even (L* 46 to 50, 1.4 to 1.9 pt), not 276's third of the band; the haunch along the ground at L* 44 to 47 and 1.1
 *   to 1.25 pt, pressed darker and fuller under its middle (x -5: L* 36, 1.5 pt), lighter as it runs on under the leg.
 *   A living line's tone follows its swell (lighter as it thins), so the haunch, dark but fine on the crop, is typed at
 *   the band's middle and up (0.5 to 0.85) for its tone, a little fuller than the crop's.
 */
export const OPTIONS: Record<string, Opt> = {
  /**
   * The chin over the collar (DECISIONS 287, the lead's L3): its wisps as hair flicks typed from master.hero.main's
   * lower face (its flicks at hero px x 158, 178, 192, 210 and 222, 2 to 4 px long on 1 to 1.5 px at 0.47 pt per px,
   * placed on each view's chin as the hero's lie across its own), longer than wide and of uneven lengths, hair-fine in
   * profile; the fringe in the chin's warm fur tone (fringe() with no colour); in front, the crease under the fur on the
   * collar with the shadow narrowed (the turned views draw no chinShadow: their lanes add one).
   */
  chin: {
    front: { edits: [{
      find: "  wisps: [{ at: [-18, -61.2], len: 1.4, width: 3.2, lean: -0.7 }, { at: [-9.5, -59.6], len: 1, width: 2.4, lean: -0.5 },\n    { at: [5, -59.2], len: 1.6, width: 3.6, lean: 0.65 }, { at: [13, -60.6], len: 1.1, width: 2.6, lean: 0.75 }],\n  firm: [14, 14],",
      replace: "  wisps: [{ at: [-18, -61.2], len: 1.6, width: 0.6, lean: -0.85 }, { at: [-9.4, -59.6], len: 1, width: 0.5, lean: -0.8 }, { at: [-3.6, -59.3], len: 1.9, width: 0.7, lean: -0.7 },\n" +
        "    { at: [5.5, -59.3], len: 1.3, width: 0.6, lean: 0.75 }, { at: [10.6, -60], len: 2, width: 0.7, lean: 0.85 }],\n  firm: [14, 14], flicks: true,",
    }, {
      find: "  const fringe = h.fur.fringe(C.furShade, box);",
      replace: "  const fringe = h.fur.fringe(undefined, box);",
    }, {
      find: "const CHIN_SHADOW = { width: 6, blur: 1, opacity: 0.85 };",
      replace: "const CHIN_SHADOW = { width: 3.2, blur: 0.9, opacity: 0.6, crease: true };",
    }] },
    threeQuarter: { edits: [{
      find: "    soft: { wisps: [{ at: [-29.5, -62], len: 1.6, width: 2.4, lean: -0.6 }, { at: [-42, -59.4], len: 1.1, width: 1.8, lean: -0.45 },\n      { at: [-62, -60.4], len: 1.9, width: 2.8, lean: 0.6 }], firm: [8, 21] } },",
      replace: "    soft: { wisps: [{ at: [-29.5, -62], len: 1.7, width: 0.6, lean: -0.8 }, { at: [-35, -61.1], len: 1.1, width: 0.5, lean: -0.7 }, { at: [-45, -59.7], len: 2, width: 0.7, lean: -0.65 },\n" +
        "      { at: [-64, -60.5], len: 1.4, width: 0.6, lean: 0.75 }], firm: [8, 21], flicks: true } },",
    }, {
      find: "  const soft = softRoots(temple, box), fringe = FUR.fringe(C.furShade, box);",
      replace: "  const soft = softRoots(temple, box), fringe = FUR.fringe(undefined, box);",
    }] },
    side: { edits: [{
      find: "    soft: { wisps: [{ at: [-47, -59.6], len: 0.9, width: 1.8, lean: -0.6 }, { at: [-56.5, -59.2], len: 1.3, width: 2.4, lean: -0.7 }], firm: [0, 40], flow: [1, 0] } },",
      replace: "    soft: { wisps: [{ at: [-40, -59.8], len: 1.4, width: 0.5, lean: -0.8 }, { at: [-49, -59.5], len: 2, width: 0.6, lean: -0.85 }, { at: [-55, -59.3], len: 1.1, width: 0.5, lean: -0.75 }], firm: [0, 40], flow: [1, 0], flicks: true } },",
    }, {
      find: "  const fr = HEAD_FUR.fringe(C.furShade, box);",
      replace: "  const fr = HEAD_FUR.fringe(undefined, box);",
    }, {
      // The bare jaw's length is measured along the outline as drawn, its wisps and all (277): the flicks, longer than
      // the old wisps, lengthen that outline by 4.4 pt (the line gate's own measure, 46.50 pt at rest and 47.00 under
      // the perked ear, against the 42.10 that 40.3 lets through), not the stretch of jaw the crop leaves unlined. The
      // side's lane remeasures it when it takes the flicks.
      find: "const CHIN_BARE = 40.3;",
      replace: "const CHIN_BARE = 44.7;",
    }] },
  },
  swell: {
    side: { edits: [{
      find: "const backLines = (F: Facing): LitSpan[] => [{ from: [-16.6, -63.4], to: RUMP_TOP, on: \"tan\", ends: [\"under\", \"join\"], weight: { seed: SEED.topline } },\n" +
        "  { from: RUMP_TOP, to: RUMP_FOOT, on: F.shows(\"rump.patch.L\") ? \"tan\" : \"cream\", contact: true, under: byHeight(0.7, 1, -16, -10), ends: [\"join\", \"join\"], weight: { seed: SEED.rump, amount: 0.35 } },\n" +
        "  { from: RUMP_FOOT, to: [-17, -1.7], ground: \"sole\", ends: [\"join\", \"under\"], weight: { seed: SEED.haunch } },",
      replace: "const backLines = (F: Facing): LitSpan[] => [{ from: [-16.6, -63.4], to: RUMP_TOP, on: \"tan\", ends: [\"under\", \"join\"], cites: 284, breaks: [{ at: [-9, -61.6], gap: 1.6 }],\n" +
        "    weight: { seed: SEED.topline, life: \"back\", swell: [{ at: [-16.6, -63.4], to: 0 }, { at: [-8, -60.6], to: 0.05 }, { at: [-6, -59.8], to: 0.3 }, { at: [-4, -59.2], to: 0.55 }, { at: [-1, -57.1], to: 0.75 }, { at: [2.6, -54.6], to: 0.85 }, { at: [8, -49.2], to: 0.8 }, { at: [12.4, -43], to: 0.7 }, { at: [16.2, -34.8], to: 0.6 }] } },\n" +
        "  { from: RUMP_TOP, to: RUMP_FOOT, on: F.shows(\"rump.patch.L\") ? \"tan\" : \"cream\", contact: true, under: byHeight(0.7, 1, -16, -10), ends: [\"join\", \"join\"], weight: { seed: SEED.rump, life: \"back\", swell: [{ at: RUMP_TOP, to: 0.6 }, { at: RUMP_FOOT, to: 0.5 }] } },\n" +
        "  { from: RUMP_FOOT, to: [-17, -1.7], ground: \"sole\", ends: [\"join\", \"under\"], weight: { seed: SEED.haunch, life: \"back\", swell: [{ at: RUMP_FOOT, to: 0.55 }, { at: [10, -4.2], to: 0.6 }, { at: [4, -2.6], to: 0.6 }, { at: [-5, -2.3], to: 0.85 }, { at: [-10, -2.4], to: 0.6 }, { at: [-17, -1.7], to: 0.5 }] } },",
    }] },
  },
};

/** Several options' edits on one view file, in order. */
export function merged(...opts: Opt[]): Opt {
  const out: Opt = {};
  for (const o of opts) {
    for (const [file, e] of Object.entries(o) as [ViewFile, { edits: Edit[]; prelude?: string }][]) {
      const was = out[file] ?? { edits: [], prelude: "" };
      out[file] = { edits: [...was.edits, ...e.edits], prelude: (was.prelude ?? "") + (e.prelude ?? "") };
    }
  }
  return out;
}
