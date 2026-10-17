// Each option of the fur kit's second round (DECISIONS 260 to 263) opted in on scratch copies of the views, as text
// edits to the views' own source (../recipes/scratch.ts). A first pass of what each view's lane will type from its crop:
// enough to show the option at work beside the sheet, not the lane's finished drawing. The views themselves are never
// changed here.
import { at, type Edit } from "../recipes/scratch.ts";

export type ViewFile = "front" | "threeQuarter" | "side" | "back";
export type Opt = Partial<Record<ViewFile, { edits: Edit[]; prelude?: string }>>;

const LINES = at("characters/dog/src/parts/lines.ts");
const WEIGHTED = at("qa/phase3/fur/recipes2/weighted.ts");

/**
 * The soft chin (DECISIONS 261) on the front, the three-quarter and the profile, typed from the hero's lower face and each
 * view's crop: the smooth arc, 2 or 3 fine wisps of different sizes, unevenly spaced, leaning out along the fur's flow,
 * the line firm only at the sides. In profile the view's own row of jaw wisps goes (the soft chin's wisps take their
 * place), and its head.line takes the chin's lines from `chins`.
 */
export const CHIN: Record<"front" | "threeQuarter" | "side", Opt> = {
  front: { front: { edits: [{
    find: "chin: { from: [-16.3, -59.6], to: [16.3, -59.6], scallops: CHIN, tipRound: 0.15, line: { from: [-39.6, -70.4], to: [39.6, -70.4] }, corners: [[-39.6, -70.4], [39.6, -70.4]] },",
    replace: "chin: { from: [-16.3, -59.6], to: [16.3, -59.6], scallops: [], tipRound: 0.15, line: { from: [-39.6, -70.4], to: [39.6, -70.4] }, corners: [[-39.6, -70.4], [39.6, -70.4]],\n" +
      "      soft: { wisps: [{ at: [-12, -59.9], len: 1.7, width: 2.2, lean: -0.4 }, { at: [4, -58.6], len: 1.1, width: 1.7, lean: 0.35 }, { at: [11, -59.4], len: 2, width: 2.6, lean: 0.45 }], firm: [14, 14] } },",
  }, {
    // The fringe in head.line, under its lines.
    find: "  return lineGate(piece(`<defs>${r.defs}${blur(f, pad(box, 2), 0.4)}",
    replace: "  const fr = h.fur.fringe(C.furShade, box);\n  return lineGate(piece(`<defs>${fr.defs}${r.defs}${blur(f, pad(box, 2), 0.4)}",
  }, {
    find: "</defs>${roots}${puffs}${r.body}`, box, {",
    replace: "</defs>${fr.body}${roots}${puffs}${r.body}`, box, {",
  }] } },
  threeQuarter: { threeQuarter: { edits: [{
    find: "chin: { from: [-29.8, -61], to: [-66, -61.4], scallops: CHIN, tipRound: 0.25, line: { from: [-18.6, -64.4], to: [-88.4, -72.4], under: 0.15 },",
    replace: "chin: { from: [-29.8, -61], to: [-66, -61.4], scallops: [], tipRound: 0.25, line: { from: [-18.6, -64.4], to: [-88.4, -72.4], under: 0.15 },\n" +
      "    soft: { wisps: [{ at: [-34, -61.2], len: 1.5, width: 2.2, lean: -0.4 }, { at: [-56, -61.6], len: 2, width: 2.6, lean: 0.45 }, { at: [-63, -61.6], len: 1.1, width: 1.7, lean: 0.35 }], firm: [10, 17] },",
  }, {
    // head.line takes the chin's lines from `chins`, and draws the fringe under them.
    find: "const [farCrown, nearCrown] = FUR.crown as [LitSpan, LitSpan], chin = FUR.chin!;",
    replace: "const [farCrown, nearCrown] = FUR.crown as [LitSpan, LitSpan], chin = FUR.chins;",
  }, {
    find: "{ ...NEAR_LOWER, ends: [\"free\", \"join\"], cites: 214, bare: [rootBare(NEAR_JOIN, NEAR_RAISED), 0] }, FAR_CHEEK, chin];",
    replace: "{ ...NEAR_LOWER, ends: [\"free\", \"join\"], cites: 214, bare: [rootBare(NEAR_JOIN, NEAR_RAISED), 0] }, FAR_CHEEK, ...chin];",
  }, {
    find: "{ ...far, on: \"cream\", ends: [\"join\", \"join\"] }, chin];",
    replace: "{ ...far, on: \"cream\", ends: [\"join\", \"join\"] }, ...chin];",
  }, {
    find: "return [farCrown, nearCrown, NEAR_UPPER, NEAR_LOWER, FAR_CHEEK, chin];",
    replace: "return [farCrown, nearCrown, NEAR_UPPER, NEAR_LOWER, FAR_CHEEK, ...chin];",
  }, {
    find: "  const soft = softRoots(temple, box);\n  return lineGate(piece(`<defs>${r.defs}${soft.defs}</defs>${soft.body}${r.body}`, box, {",
    replace: "  const soft = softRoots(temple, box), fr = FUR.fringe(C.furShade, box);\n  return lineGate(piece(`<defs>${r.defs}${soft.defs}${fr.defs}</defs>${fr.body}${soft.body}${r.body}`, box, {",
  }] } },
  side: { side: { edits: [{
    // The view's own row of four even jaw wisps goes: the soft chin's two wisps take their place.
    find: "const HEAD_BASE = furEdge(furEdge(furEdge(HEAD_OUTLINE,\n// The jaw's fur over the collar's top behind the chin breaks into a few low white wisps, as the crop draws it (audit\n" +
      "// side #6), combed back down the neck, unlined, the collar's own rim their edge (DECISIONS 236; JAW_WISPS).\n" +
      "[-43, -60.4], [-55, -59.1], [{ len: 0.7, width: 3.2, lean: -0.55, dip: 0.2, notch: 0.6 }, { len: 0.55, width: 2.5, lean: -0.4, dip: 0.2, notch: 0.6 },\n" +
      "  { len: 0.75, width: 3.4, lean: -0.5, dip: 0.2, notch: 0.6 }, { len: 0.6, width: 2.6, lean: -0.45 }], 0.18, undefined, JAW_WISPS), [-78.9, -129.6], [-65.8, -149.6],",
    replace: "const HEAD_BASE = furEdge(furEdge(HEAD_OUTLINE, [-78.9, -129.6], [-65.8, -149.6],",
  }, {
    find: "  chin: { from: [-60.8, -59.6], to: [-65.8, -62], scallops: CHIN, tipRound: 0.22, profile: true, corners: [],\n    line: { from: [-60.8, -59.6], to: [-92.7, -80], ends: [\"free\", \"join\"], under: 0.55 } },",
    replace: "  chin: { from: [-60.8, -59.6], to: [-65.8, -62], scallops: [], tipRound: 0.22, profile: true, corners: [],\n    line: { from: [-60.8, -59.6], to: [-92.7, -80], ends: [\"free\", \"join\"], under: 0.55 },\n" +
      "    soft: { wisps: [{ at: [-47, -59.6], len: 0.9, width: 1.8, lean: -0.6 }, { at: [-56.5, -59.2], len: 1.3, width: 2.4, lean: -0.7 }], firm: [0, 40], flow: [1, 0] } },",
  }, {
    // head.line takes the chin's lines from `chins`; the jaw on the collar behind the chin stays unlined (40.3 pt with the soft chin's wisps on it, measured by the gate).
    find: "  { ...HEAD_FUR.chin!, under: chinDepth, cites: 236, bare: [36.5, 0] },",
    replace: "  ...HEAD_FUR.chins.map((c, i) => ({ ...c, under: chinDepth, ...(i === 0 ? { cites: 261, bare: [40.3 + (c.bare?.[0] ?? 0), c.bare?.[1] ?? 0] as [number, number] } : {}) })),",
  }, {
    find: "  return lineGate(piece(`<defs>${r.defs}${blur(f, pad(box, 2), 0.15)}</defs>${r.body}<g fill=\"${noseEdge.colour}\"",
    replace: "  const fr = HEAD_FUR.fringe(C.furShade, box);\n  return lineGate(piece(`<defs>${r.defs}${fr.defs}${blur(f, pad(box, 2), 0.15)}</defs>${fr.body}${r.body}<g fill=\"${noseEdge.colour}\"",
  }] } },
};

/**
 * The crisp topknot (DECISIONS 262) on the front and the three-quarter, typed from master.turnaround.front,
 * master.turnaround.three-quarter and master.hero.main: each crop's three locks and the small flicked lock its line
 * kinks over before the tall one (the front's at x -15, the three-quarter's at x -52), the flick coming out from behind
 * the left lock, whose own line ends at the kink and turns down into a short tuck there, as the crop's line does; each
 * lock's base tucked into a short inner stroke from its V.
 */
export const TOPKNOT: Record<"front" | "threeQuarter", Opt> = {
  front: { front: { edits: [{
    find: "  { nodes: [[-30.4, -150.2], [-29.6, -152.8], [-27, -155], [-22.8, -156.3], [-18.2, -156.4], [-14.4, -155.4], [-11.6, -153], [-9.4, -149.6], [-13, -146.6],\n" +
      "    [-22, -146.4], [-27.6, -148.4]],\n" +
      "    line: { from: [-30.2, -150.4], to: [-11.6, -153], taper: [0.6, 1] }, into: [[[-30.6, -150.5], [-27.4, -149.9], [-23.6, -149.4]]], tip: [[-29.6, -149.4], [-30.8, -151.2]] },",
    replace: "  { nodes: [[-16.4, -155.4], [-14.6, -156], [-12.9, -155.8], [-11.3, -154.4], [-10.4, -152], [-10.8, -149.8], [-13.6, -148.8], [-16.4, -150.4], [-17, -153.2]],\n" +
      "    line: { from: [-15.6, -156], to: [-11.2, -153.6], taper: [1, 1] } },\n" +
      "  { nodes: [[-30.4, -150.2], [-29.6, -152.8], [-27, -155], [-22.8, -156.3], [-18.2, -156.4], [-15.4, -156], [-14.2, -154.4], [-13.8, -151.6], [-15.4, -148],\n" +
      "    [-22, -146.4], [-27.6, -148.4]],\n" +
      "    line: { from: [-30.2, -150.4], to: [-14.9, -155.6], taper: [0.6, 0.6] }, into: [[[-30.6, -150.5], [-27.4, -149.9], [-23.6, -149.4]], [[-14.9, -155.6], [-14.3, -154.5], [-13.9, -153.4]]],\n" +
      "    tip: [[-29.6, -149.4], [-30.8, -151.2]] },",
  }, {
    find: "    feather: { from: [0, -146.5], to: [0, -150.5] },\n  }));",
    replace: "    feather: { from: [0, -146.5], to: [0, -150.5] },\n  }, { crisp: true }));",
  }] } },
  threeQuarter: { threeQuarter: { edits: [{
    find: "  { nodes: [[-67.2, -153.8], [-65.4, -156.2], [-61.4, -157.8], [-56.6, -158.4], [-52.2, -157.6], [-48.8, -154.8], [-46.4, -151], [-50, -147.4], [-56, -148.2],\n" +
      "    [-61.4, -150.4], [-64.6, -151.8]],\n" +
      "    line: { from: [-61.6, -150.4], to: [-48.8, -154.8], taper: [0.8, 1] }, tip: [[-66.6, -152.8], [-66.8, -154.8]] },",
    replace: "  { nodes: [[-53.4, -157.2], [-51.4, -157.5], [-49.8, -157], [-48.4, -155], [-47.8, -152.6], [-48.4, -150.2], [-51, -149.4], [-53.6, -151], [-54, -154.4]],\n" +
      "    line: { from: [-52.6, -157.5], to: [-48.6, -154.6], taper: [1, 1] } },\n" +
      "  { nodes: [[-67.2, -153.8], [-65.4, -156.2], [-61.4, -157.8], [-56.6, -158.4], [-53.2, -157.9], [-51.6, -156.6], [-51, -153.6], [-52, -149.6], [-56, -148.2],\n" +
      "    [-61.4, -150.4], [-64.6, -151.8]],\n" +
      "    line: { from: [-61.6, -150.4], to: [-51.9, -157], taper: [0.8, 0.6] }, into: [[[-51.9, -157], [-51.4, -155.8], [-51, -154.8]]], tip: [[-66.6, -152.8], [-66.8, -154.8]] },",
  }, {
    find: "feather: { from: [-38, -146.2], to: [-38, -149.8] }, light: F.light }));",
    replace: "feather: { from: [-38, -146.2], to: [-38, -149.8] }, light: F.light }, { crisp: true }));",
  }] } },
};

/**
 * The toe lines along the paw's dome (DECISIONS 263) on the front and the profile: each paw's ball typed from its crop
 * (its centre where the bun is fullest, its half-width and half-height), the lines' feet and tops as the views type them.
 * In profile the ball is the paw's toe end, so the lines curve forward over it as they rise, as the crop's do.
 */
export const TOES: Record<"front" | "side", Opt> = {
  front: { front: { edits: [{
    find: "fade: [-3.4, -10], soft: true }),",
    replace: "fade: [-3.4, -10], soft: true, dome: { centre: flipX([[-38.6, -6.5]], side)[0]!, size: [8, 5.5] } }),",
  }, {
    find: "fade: [-1.2, -7], soft: true, width: 0.9 });",
    replace: "fade: [-1.2, -7], soft: true, width: 0.9, dome: { centre: flipX([[-16, -4.4]], side)[0]!, size: [10.5, 6] } });",
  }] } },
  side: { side: { edits: [{
    find: "fade: [-1, -8], width: 0.85, soft: true });",
    replace: "fade: [-1, -8], width: 0.85, soft: true, dome: { centre: [-50, -7], size: [13, 14] } });",
  }, {
    find: "fade: [-1, -6.6], width: 0.85, soft: true }),",
    replace: "fade: [-1, -6.6], width: 0.85, soft: true, dome: { centre: [-18, -6], size: [13, 9] } }),",
  }] } },
};

/** The living weight (DECISIONS 260) on every lit span of the view (its own seed per span), with `amount` of the band. */
export function weight(file: ViewFile, amount?: number): Opt {
  const names = file === "threeQuarter" ? "litEdge, litMarking, litPart, withDefaults, type LitSpan" : "litEdge, litMarking, litPart, type LitSpan";
  const keep = file === "threeQuarter" ? "withDefaults, type LitSpan" : "type LitSpan";
  return {
    [file]: {
      edits: [{
        find: `import { ${names} } from "${LINES}";`,
        replace: `import { ${keep} } from "${LINES}";\nimport { weighting } from "${WEIGHTED}";\nconst { litEdge, litMarking, litPart } = weighting(undefined${amount !== undefined ? `, ${amount}` : ""});`,
      }],
    },
  };
}
