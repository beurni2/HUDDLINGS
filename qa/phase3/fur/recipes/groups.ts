// Each group's opt-in on the scratch front and side views (demo.ts), as text edits to the views' own source, and the
// regions its picture shows. A first pass of what each view's lane will type from its crop: enough to show the recipe
// at work beside the sheet, not the lane's finished drawing.
import type { Row } from "./render.ts";
import { at, type Edit } from "./scratch.ts";

/** One view's opt-in: its edits, the rows its picture shows, and whose each gate problem it leaves or brings is (by pattern). */
export interface ViewEdit {
  prelude?: string;
  edits: Edit[];
  rows: Row[];
  notes?: [RegExp, string][];
}

export interface Group {
  id: string;
  title: string;
  /** List every problem the gate still finds with the recipe, not only those it brings (the line recipe's, the lanes' work list). */
  all?: boolean;
  front?: ViewEdit;
  side?: ViewEdit;
}

const imp = (names: string, path: string) => `import { ${names} } from "${at(path)}";\n`;

// The phone row: the whole dog at the size it shows on a phone, 3 px/pt (164 pt tall).
const phoneFront: Row = { label: "front at phone size (3 px/pt)", box: [-90, -170, 180, 176], zoom: 3 };
const phoneSide: Row = { label: "side at phone size (3 px/pt)", box: [-100, -170, 150, 176], zoom: 3 };

// The front legs' paws as buns (G6): the leg's column runs straight down into the paw, which flares out 15% wider than
// the column into three toe lobes (measured against the column, never a pinched wrist).
const FRONT_LEG_BUN = `const BUN = bun({ leg: [[-4.4, -22], [-32, -22]], wrist: [[-4, -15], [-31.6, -16.5]], bulge: [2.1, 2.1], ground: -0.1, lobes: [0.31, 0.38, 0.31], scallop: 0.8, full: 0.42, rise: 0.45 });
const legR: Node[] = [[-5.8, -33.6], [-5.2, -28], [-4.4, -20], ...BUN.nodes, [-32, -21], [-33.6, -28], [-34.8, -35], [-35.2, -41],
  [-33, -47], [-26, -44], [-15, -40.4], [-8.2, -37.4]];
/** The sole's dips at the toe lines (concave, so no corner rule applies). */
const FRONT_TOES = BUN.notches.map((i) => i + 3);
const mirrorLobes = (l: [P, P][]): [P, P][] => l.map(([a, b]) => [[-b[0], b[1]], [-a[0], a[1]]]);
const legs = { R: lobed(smooth(legR, { corners: FRONT_TOES }), BUN.lobes), L: lobed(smooth(mirrorX(legR), { corners: FRONT_TOES.map((j) => (legR.length - j) % legR.length) }), mirrorLobes(BUN.lobes)) };`;

// The front's ears (G5): the hem's three clumps typed as a smooth convex base, and the edge built on it, a step part way
// down the outer edge and four rounded tips at the hem, as the floppy-ears panel draws them; typed on the right ear in the
// head's frame and placed on either ear (onEar), the left's rows reversed with its path.
const FRONT_EAR_EDGE = `
/** A row of locks typed along one ear's path, for the other ear, whose path runs the other way. */
const reversedRow = (locks: Lock[]): Lock[] => locks.map((_, k) => {
  const l = locks[locks.length - 1 - k]!, before = locks[locks.length - 2 - k];
  return { ...l, lean: -(l.lean ?? 0), dip: before?.dip };
});
const HEM: Lock[] = [{ len: 1.5, width: 9, lean: 0.2, dip: 0.45 }, { len: 1.9, width: 12, lean: 0.25, dip: 0.3 }, { len: 1.4, width: 8.5, lean: 0.3, dip: 0.4 }, { len: 1.8, width: 10.5, lean: 0.35 }];
// One broad step down the outer edge, a third of the way down, where the panel's top lobe overlaps the next: one broad
// low lock leaning down the edge (fur.ts's STEP); two small ones read as barbs at phone size.
const STEPS: [P, P, Lock][] = [[[-74.6, -105.6], [-67.6, -111.2], { len: 1.5, width: 9.2, lean: -0.45 }]];
function earEdgeOf(side: "L" | "R") {
  const on = (p: P) => onEar(side, p), R = side === "R";
  const steps = STEPS.map(([a, b, lock]) => (R ? { from: on(a), to: on(b), lock, tipRound: 0.35 } : { from: on(b), to: on(a), lock: { ...lock, lean: -(lock.lean ?? 0) }, tipRound: 0.35 }));
  return earEdge({
    base: ears[side], steps: R ? steps : steps.reverse(),
    hem: R ? { from: on([-46.6, -64]), to: on([-80.4, -82]), locks: HEM, tipRound: 0.36 } : { from: on([-80.4, -82]), to: on([-46.6, -64]), locks: reversedRow(HEM), tipRound: 0.36 },
    axis: [on([-58, -124]), on([-60, -62])],
    // Seen from the front the ear hangs behind the head: its line runs on under the head at both ends, its cheek end
    // typed (in model space) 1.5 pt in under the cheek, so its run and fade lie under it.
    line: R ? { from: [-38.8, -68], to: on([-38.6, -140.6]), ends: ["under", "under"] } : { from: on([-38.6, -140.6]), to: [37.1, -71.6], ends: ["under", "under"] },
  });
}
const EDGES = { R: earEdgeOf("R"), L: earEdgeOf("L") };
`;

// The front's head fur (G4): the crown's locks over each ear's root, each cheek a convex puff of clumps with one line
// from the face's side to the jaw, the chin a round mass with its scalloped line over the collar, all from headFur(),
// the puffed head (huffy's variant B) and the temple states through the same builder.
const FRONT_HEAD_FUR = `
/** A row of locks typed along the right side's path, for the left side, whose path runs the other way. */
const reversedRow = (locks: Lock[]): Lock[] => locks.map((_, k) => {
  const l = locks[locks.length - 1 - k]!, before = locks[locks.length - 2 - k];
  return { ...l, lean: -(l.lean ?? 0), dip: before?.dip };
});
// Hanging from the overhang's underside over the root's tan, two broad low locks combed hard down and out: no line
// along them (the sheet's soft cream over the tan, feathered), the crown's line joining the ear's where they cross.
const CROWN_R: Lock[] = [{ len: 1.9, width: 6, lean: -0.55, dip: 0.45 }, { len: 1.45, width: 4.9, lean: -0.5 }];
const CROWN_L: Lock[] = [{ len: 1.55, width: 6, lean: 0.5, dip: 0.45 }, { len: 2, width: 6.2, lean: 0.55 }];
// Each cheek's puff over the ear: four pointed wisps combed down the face's side, as the crop's.
const CHEEK: Lock[] = [{ len: 2.2, width: 5, lean: 0.35, dip: 0.5 }, { len: 2.8, width: 6, lean: 0.45, dip: 0.6 }, { len: 1.8, width: 4.6, lean: 0.4, dip: 0.45 }, { len: 2.4, width: 5.4, lean: 0.5 }];
// The chin's middle over the collar: seven small low scallops of uneven size combed down and out from the middle, the
// jaw's round sides plain.
const CHIN: Lock[] = [{ len: 1.1, width: 6.2, lean: -0.35, dip: 0.3 }, { len: 1.7, width: 7.6, lean: -0.25, dip: 0.35 }, { len: 1.3, width: 7.7, lean: -0.1, dip: 0.25 },
  { len: 1, width: 5.8, dip: 0.3 }, { len: 1.3, width: 6, lean: 0.1, dip: 0.35 }, { len: 1.3, width: 7.7, lean: 0.25, dip: 0.25 }, { len: 1.1, width: 6, lean: 0.35 }];
function headOf(puff = 0) {
  const swell = ([x, y]: P): P => {
    const t = clamp01((y + 104) / 44), across = clamp01((Math.abs(x) - 22) / 14);
    return [x + Math.sign(x) * puff * Math.sin(Math.PI * t) ** 2 * across, y];
  };
  const at = (p: P) => cheekRoll(swell(p));
  const base = smooth([...headHalf, [0, -58.4], ...leftHalf].map(([x, y]): Node => at([x, y])), { typed: headHalf.length + 1 + leftTemple.length, corners: CORNERS });
  // Deep on the tan where the face's side tucks over the ear (DECISIONS 7's #9E5C2C); round the cheek's clumps the
  // fur's own light line, as the front crop draws only a short light line low on the cheek.
  const sideLadder = (p: P): "cream" | "tan" => (p[1] < -96 ? "tan" : "cream");
  const sideFace = (p: P) => (p[1] < -96 ? 0.6 : 0.1);
  const sideMost = (p: P) => (p[1] < -96 ? 1 : 0.35);
  const fur = headFur({
    base, at,
    crown: [
      { side: "R", from: [-46, -133.8], to: [-35.2, -135], locks: CROWN_R, tipRound: 0.25, line: { from: [-24, -149.2], to: [-44, -137] }, ear: ears.R },
      { side: "L", from: [28.8, -138.8], to: [40.8, -140.1], locks: CROWN_L, tipRound: 0.25, line: { from: [41.2, -140.2], to: [19, -150.6] }, ends: ["join", "under"], ear: ears.L },
    ],
    cheeks: [
      // From where the face's side comes out of the root's soft overlap, down over the ear to the puff, deep on the tan;
      // the puff's wisps unlined (its gap); a short light line low on the cheek round the last wisp to the jaw, as the
      // front crop draws it. headFur frees the line where it borders the root's and the gap's unlined stretches and
      // cites each by its length (DECISIONS 214).
      { side: "R", from: [-48.2, -91], to: [-44, -70.8], clumps: CHEEK, tipRound: 0.22, line: { from: [-39.9, -123.8], to: [-42.6, -69.4], ends: ["free", "join"], on: sideLadder, under: sideFace, most: sideMost, gap: [[-47.8, -92], [-46.8, -76.4]] }, raised: [-46.2, -113.4] },
      { side: "L", from: [44, -70.8], to: [47.2, -91], clumps: reversedRow(CHEEK), tipRound: 0.22, line: { from: [42.6, -69.4], to: [33.7, -129.4], ends: ["join", "free"], on: sideLadder, under: sideFace, most: sideMost, gap: [[46.8, -76.4], [46.8, -92]] }, raised: [44.9, -113.8] },
    ],
    chin: { from: [-24, -61.4], to: [24, -61.4], scallops: CHIN, tipRound: 0.25, line: { from: [-42.6, -69.4], to: [42.6, -69.4] }, corners: [[-42.6, -69.4], [42.6, -69.4]] },
  });
  return { head: fur.head, fur, clumps: [] as Clump[] };
}
function headLinePiece(up: { L: boolean; R: boolean } = { L: false, R: false }, h = HEAD): Piece {
  const head = h.head;
  const [x0, y0, x1, y1] = bbox(head.segs);
  const box = pad([x0, y0, x1 - x0, y1 - y0], 4);
  const r = litEdge(head, h.fur.spans(up), "head.line", box, { reach: 0.5, crisp: true });
  // The crown's cream feathered out over each root's unlined stretch, under the lines.
  const soft = h.fur.soften(C.fur, box, up);
  return piece(\`<defs>\${r.defs}\${soft.defs}</defs>\${soft.body}\${r.body}\`, box, {
    shapes: [{ name: "head.line", nodes: head.typed, segs: head.segs, outlined: r.outlined, fur: head.fur.map(([a, b]) => [fracAt(head, a), fracAt(head, b)]) }],
    lines: r.lines,
  });
}
`;

// The side's tail plume (G3): its back as five broad clumps of uneven size leaning down the plume, each ending in a point
// where it tucks under the next (the sheet's lobes; tuft-sized locks here read as a saw), the curl's top as one hooked
// clump, its line one span all round (G1).
const SIDE_TAIL_FIND = `const tail = furSpan(furEdge(furEdge(smooth([[10, -22], [17.4, -35.2], [19.8, -39.4], [20.8, -43.8], [19.6, -47.6], [17.2, -50.4], [15.4, -53.2],
  [15.8, -56.4], [18.4, -59], [22.4, -60.6], [29, -61.6], [35.8, -59.2], [39.8, -55.4], [43, -50], [45, -42.4], [45.2, -35], [44.2, -28.6], [41.6, -23], [37, -18.4],
  [31.4, -13.4], [24.4, -10.6], [16.6, -9.8]]), [20.6, -59.6], [27.2, -61.8], [{ len: 1.5, w: 1, lean: 0.35 }], 0.3),
[36.4, -58.6], [38.8, -17.2], [{ len: 1.4, w: 0.8, lean: 0.35 }, { len: 2.3, w: 1.6, lean: 0.25 }, { len: 1.1, w: 0.7, lean: 0.3 }, { len: 1.9, w: 1.5, lean: 0.15 },
  { len: 1.2, w: 0.9, lean: 0.3 }], 0.36, (_tip, _root, notches) => tailLobes.push(notches)), [17.2, -50.4], [38.8, -17.2]);`;
const SIDE_TAIL_TUFTS = `const tailPlain = smooth([[10, -22], [17.4, -35.2], [19.8, -39.4], [20.8, -43.8], [19.6, -47.6], [17.2, -50.4], [15.4, -53.2],
  [15.8, -56.4], [18.4, -59], [22.4, -60.6], [29, -61.6], [35.8, -59.2], [39.8, -55.4], [43, -50], [45, -42.4], [45.2, -35], [44.2, -28.6], [41.6, -23], [37, -18.4],
  [31.4, -13.4], [24.4, -10.6], [16.6, -9.8]]);
const tailRows: [P, P, Lock[], number, FurRules][] = [
  [[20.6, -59.6], [27.2, -61.8], [{ len: 1.4, width: 6.8, lean: 0.45 }], 0.3, CLUMPS],
  [[36.4, -58.6], [38.8, -17.2], [{ len: 1.7, width: 7.8, lean: 0.3, dip: 0.3 }, { len: 2.3, width: 9.6, lean: 0.55, dip: 0.4 }, { len: 1.6, width: 10, lean: 0.4, dip: 0.25 },
    { len: 2.05, width: 8.4, lean: 0.6, dip: 0.35 }, { len: 1.5, width: 9.2, lean: 0.35 }], 0.3, CLUMPS],
];
const tail = furSpan(tailRows.reduce((s, [a, b, locks, round, rules]) => furEdge(s, a, b, locks, round, (_tip, _root, notches) => tailLobes.push(notches), rules), tailPlain), [17.2, -50.4], [38.8, -17.2]);`;
// One line round the plume (G1's), light over the cream plume, as the tail-curve panel draws it (L* about 80), so the
// lobes' notches read as soft partings, not dark cuts.
const SIDE_TAIL_LINE = `  const tailLines: LitSpan[] = [{ from: [15.6, -32.8], to: [15, -11], on: (p: P) => (p[0] < 23 ? "tan" : "cream"), most: (p: P) => (p[0] < 23 ? 1 : 0.2), ends: ["under", "under"] }];`;
const SIDE_TAIL_LINE_FIND = `  const tailLines: LitSpan[] = [{ from: [17.6, -35.8], to: [20.6, -45.4], on: "tan", taper: 3 }, { from: [20.4, -43.6], to: tailLobes[0]![0], taper: [3, 1.4] },
    ...tailLobes.map(([a, b]): LitSpan => ({ from: a, to: b, taper: 1.4 })), { from: tailLobes.at(-1)![1], to: [30, -13.4], taper: [1.4, 3] },
    { from: [31.6, -12.8], to: [17.4, -9.8], on: "tan", taper: 3 }];`;

export const GROUPS: Group[] = [
  {
    id: "g3-locks",
    title: "G3 fur locks typed per crop (draw/fur.ts width, dip, TUFTS, CLUMPS; DECISIONS 213): typed tufts and clumps, uneven and leaning, checked against their rules",
    front: {
      prelude: imp("STEP", "characters/draw/fur.ts"),
      edits: [
        {
          find: `const back = furEdge(furEdge(backHalf, [-30.6, -59], [-34.4, -50.8], shoulderLocks, 0.3), [34.4, -50.8], [30.6, -59], lefthandOf(shoulderLocks), 0.3);`,
          // Under each collar's end one small low step of fur leaning down the shoulder's line, not a row of teeth or a horn.
          replace: `const SHOULDER: Lock[] = [{ len: 1, width: 5.2, lean: 0.45 }];
const back = furEdge(furEdge(backHalf, [-30.6, -59], [-32.8, -54.6], SHOULDER, 0.3, undefined, STEP), [32.8, -54.6], [30.6, -59], lefthandOf(SHOULDER), 0.3, undefined, STEP);`,
        },
        // The chest's dash strokes beside the tag, which the sheet does not draw, go.
        { find: `    inner: ([[[-23.4, -47], [-21.8, -42.4], [-21, -38.2]],`, replace: `    innerGone: ([[[-23.4, -47], [-21.8, -42.4], [-21, -38.2]],` },
        {
          find: `const backLines: LitSpan[] = [{ from: [-29.2, -61.4], to: [-47.4, -11], on: "tan", taper: 6 },
  { from: [47.4, -11], to: [38.6, -38], taper: 6 }, { from: [40.2, -40.6], to: [29.2, -61.4], on: "tan", taper: 6 }];`,
          // The back's sides as G1 draws them, each one span from under the head to under the hind paw.
          replace: `const backLines: LitSpan[] = [{ from: [-25.6, -63.3], to: [-47.4, -11], on: "tan", ends: ["under", "under"] },
  { from: [47.4, -11], to: [26.9, -62.9], on: (p: P) => (p[1] < -39.4 ? "tan" : "cream"), ends: ["under", "under"] }];`,
        },
      ],
      rows: [{ label: "front: the chest and the shoulders under the collar's ends (zoom 7)", box: [-46, -64, 92, 34], zoom: 7 }, phoneFront],
    },
    side: {
      prelude: imp("CLUMPS, TUFTS, type Lock as Lock, type FurRules as FurRules", "characters/draw/fur.ts"),
      edits: [
        { find: SIDE_TAIL_FIND, replace: SIDE_TAIL_TUFTS },
        { find: SIDE_TAIL_LINE_FIND, replace: SIDE_TAIL_LINE },
      ],
      rows: [{ label: "side: the tail's plume (zoom 7), beside the tail-curve panel", box: [8, -66, 44, 60], zoom: 7, panel: "master.shape.tail-curve" }, phoneSide],
    },
  },
  {
    id: "g8-markings",
    title: "G8 markings with brushed edges (parts/marking.ts brush; DECISIONS 217): feathered strands along the fur, darker strands inside, no white streaks",
    front: {
      prelude: imp("brush", "characters/dog/src/parts/marking.ts"),
      edits: [{
        find: `  add("back.patch.R", litMarking("back.patch.R", { shape: back, paint: backPaint, spans: backLines }, saddleR, { fill: C.marking, blur: 1.4 }));`,
        replace: `  add("back.patch.R", join(litMarking("back.patch.R", { shape: back, paint: backPaint, spans: backLines }, saddleR, { fill: C.marking, blur: 1 }),
    brush("back.patch.R", back, saddleR, 1, { flow: (p: P) => [p[0] + 30, 60], seed: 2171, edge: 30, out: [1.8, 3.6], in: [2, 3.4], width: [0.8, 1.3], soft: 0.4, opacity: 0.9,
      inside: { count: 6, length: [4, 8], colour: C.earDeep, opacity: 0.35, width: 0.8 }, colour: C.marking })));`,
      }],
      rows: [{ label: "front: the saddle's right half over the haunch (zoom 7)", box: [-56, -66, 30, 60], zoom: 7 }],
    },
    side: {
      prelude: imp("brush", "characters/dog/src/parts/marking.ts"),
      edits: [
        {
          find: `    strands("tail.base", tailBase, 0.9, [[[18, -29], [22.6, -29.6], [27.6, -27.6]], [[18.4, -22.4], [23, -21.8], [27.6, -19.6]]], { colour: C.fur, opacity: 0.4, width: 0.9 })));`,
          // The tail's root: brushed strands radiating from the rump, darkest at the root; the cream streaks go.
          replace: `    brush("tail.base", tail, tailBase, 0.9, { flow: (p: P) => [p[0] - 10, p[1] + 23], seed: 2172, edge: 22, out: [1, 2.6], in: [1.5, 3], width: [0.7, 1.2],
      inside: { count: 5, length: [4, 7], colour: C.earLow, opacity: 0.4, width: 0.8 }, colour: C.marking })));`,
        },
        {
          find: `      [[-11, -51], [-7.4, -48], [-3.6, -45]]], { colour: C.earDeep, opacity: 0.38, width: 0.8 })));`,
          // The saddle: its edge brushed along the back's curve, combed down and back.
          replace: `      [[-11, -51], [-7.4, -48], [-3.6, -45]]], { colour: C.earDeep, opacity: 0.38, width: 0.8 }),
    brush("back.patch.L", back, saddle, 0.45, { flow: [0.6, 1], seed: 2173, edge: 24, out: [0.8, 2.2], in: [1.5, 2.8], width: [0.7, 1.1],
      inside: { count: 3, length: [4, 7], colour: C.earDeep, opacity: 0.3, width: 0.8 }, colour: C.marking })));`,
        },
      ],
      rows: [{ label: "side: the saddle and the tail's root (zoom 5)", box: [-20, -66, 54, 62], zoom: 5 }],
    },
  },
  {
    id: "g1-lines",
    title: "G1 one line per visible edge (parts/lines.ts ends, contact; DECISIONS 210, 211): free ends taper 1.8 pt, joins at full width, ends run on under their part",
    all: true,
    front: {
      notes: [
        [/^tuft\//, "the topknot's curls (topknot.ts): the front lane's"],
        [/^head\.line\/front/, "the chin over the collar: G4's chin line (headFur), shown in g4-headfur; the front lane's"],
        [/^body\.back\/front: the edge of body\.back shows/, "the back's foot between the front paws: G7's shade and lines between the legs; the front lane's"],
      ],
      edits: [
        {
          // The back's sides, each one span from under the head (the collar's end on the left) down to under the hind paw.
          find: `const backLines: LitSpan[] = [{ from: [-29.2, -61.4], to: [-47.4, -11], on: "tan", taper: 6 },
  { from: [47.4, -11], to: [38.6, -38], taper: 6 }, { from: [40.2, -40.6], to: [29.2, -61.4], on: "tan", taper: 6 }];`,
          replace: `const backLines: LitSpan[] = [{ from: [-25.6, -63.3], to: [-47.4, -11], on: "tan", ends: ["under", "under"] },
  { from: [47.4, -11], to: [26.9, -62.9], on: (p: P) => (p[1] < -39.4 ? "tan" : "cream"), ends: ["under", "under"] }];`,
        },
        // The face's side over each ear: it comes out from the root's soft overlap, free, and joins the cheek's line; the
        // head's edge over the root above it stays unlined, the crown's cream over the tan (DECISIONS 214, its length cited).
        { find: `{ from: [-39.9, -123.8], to: [-44.8, -93.2], on: "tan", under: 0.6, taper: 4 },`, replace: `{ from: [-39.9, -123.8], to: [-44.8, -93.2], on: "tan", under: 0.6, ends: ["free", "join"], cites: 214, bare: [24, 0] },` },
        { find: `  { from: [44.4, -93.2], to: [33.7, -129.4], on: "tan", under: 0.6, taper: 4 },`, replace: `  { from: [44.4, -93.2], to: [33.7, -129.4], on: "tan", under: 0.6, ends: ["join", "free"], cites: 214, bare: [0, 21.5] },` },
        {
          find: `const crownSpans: LitSpan[] = [{ from: [-24, -149.2], to: [-45.6, -134.6], taper: 1.4 }, { from: [40.8, -140.3], to: [19, -150.6], taper: 1.4 }];`,
          replace: `const crownSpans: LitSpan[] = [{ from: [-24, -149.2], to: [-45.6, -134.6], ends: ["under", "join"] }, { from: [40.8, -140.3], to: [19, -150.6], ends: ["join", "under"] }];`,
        },
        {
          // One span round each cheek's clumps, from where the face's side line ends to the jaw's stroke.
          find: `  const spans: LitSpan[] = clumps.map(({ notches }) => ({ from: notches[0], to: notches[1], taper: 1.6 }));`,
          replace: `  const R = clumps.filter((c) => c.tip[0] < 0), L = clumps.filter((c) => c.tip[0] > 0);
  const spans: LitSpan[] = [{ from: cheekRoll([-44.8, -93.2]), to: R.at(-1)!.notches[1], ends: ["join", "join"] }, { from: L[0]!.notches[0], to: cheekRoll([44.4, -93.2]), ends: ["join", "join"] }];`,
        },
        // The jaw's short lines take up the cheeks' at full width, their other ends as today's (the chin is G4's).
        { find: `{ from: [-37.8, -69], to: [-31.4, -64.6], under: 0.35, taper: [1, 2.6] },`, replace: `{ from: [-37.8, -69], to: [-31.4, -64.6], under: 0.35, ends: ["join", "free"], taper: [0, 2.6] },` },
        { find: `{ from: [31.4, -64.6], to: [37.8, -69], under: 0.35, taper: [2.6, 1] },`, replace: `{ from: [31.4, -64.6], to: [37.8, -69], under: 0.35, ends: ["free", "join"], taper: [2.6, 0] },` },
        // Each hind paw's outer side, from behind the front paw over its top round to behind it again.
        { find: `litSide(side, [{ from: [-31.4, -16.2], to: [-29.2, -4.6], taper: [3, 4] }])), 6));`, replace: `litSide(side, [{ from: [-28.1, -14], to: [-27.7, -5.4], ends: ["under", "under"] }])), 6));` },
        // Each front leg's line from its inner side at the chest round its paw and up its outer side, free at both ends
        // where the leg's top melts into the chest, which the sheet leaves unlined (DECISIONS 216, its length cited).
        { find: `litSide(side, [{ from: [-2.4, -15], to: [-35, -40], taper: [6, 16] }])));`, replace: `litSide(side, [{ from: [-4.8, -28], to: [-34.8, -38], ends: ["free", "free"], cites: 216, bare: [0, 47] }])));` },
        // Each ear's line from under the cheek round its foot and up its outer side to under the crown.
        { find: `? [{ from: ends[0], to: ends[1], on: "tan", under: foot, taper: 7 }`, replace: `? [{ from: [-38.8, -68], to: ends[1], on: "tan", under: foot, ends: ["under", "under"] }` },
        { find: `: [{ from: ends[1], to: ends[0], on: "tan", under: foot, taper: 7 }`, replace: `: [{ from: ends[1], to: [37.1, -71.6], on: "tan", under: foot, ends: ["under", "under"] }` },
      ],
      rows: [
        { label: "front: the cheek over the ear, the jaw and the ear's root (zoom 7)", box: [-62, -140, 40, 80], zoom: 7 },
        { label: "front: the legs, the paws and the haunches (zoom 5)", box: [-56, -48, 112, 50], zoom: 5 },
        phoneFront,
      ],
    },
    side: {
      notes: [
        [/^tuft\//, "the topknot's curls (topknot.ts): the side lane's"],
        [/^head\.line\/side\.L: the edge of head\.base shows 2\.\d\d pt/, "the crown between the topknot's curls (topknot.ts): the side lane's"],
        [/^head\.line\/side\.L: the edge of head\.base shows/, "the head's foot over the collar behind the chin: G4's profile chin and G9's collar; the side lane's"],
      ],
      edits: [
        {
          find: `const backLines = (F: Facing): LitSpan[] => [{ from: [-11, -62.4], to: [14.6, -38.6], on: "tan", taper: 6 },
  { from: [12.6, -42.6], to: [12, -4.6], on: F.shows("rump.patch.L") ? "tan" : "cream", taper: 6 }, { from: [14.6, -6.6], to: [-6, -1.6], taper: 6 }];`,
          // The topline, the rump over the tail (a contact line, as dark in both facings: Q31) and the haunch's underside,
          // each joined to the next, running on under the collar and under the hind paw.
          // The thigh's front over the chest, a light line rising from under the hind paw and fading out upward over 6 pt,
          // where the haunch's front melts into the chest unlined, as the sheet draws it (DECISIONS 216, its fade and
          // its length cited).
          replace: `const backLines = (F: Facing): LitSpan[] => [{ from: [-11, -62.4], to: [13.4, -41], on: "tan", ends: ["under", "join"] },
  { from: [13.4, -41], to: [13.4, -7], on: F.shows("rump.patch.L") ? "tan" : "cream", contact: true, ends: ["join", "join"] }, { from: [13.4, -7], to: [-21.5, -1.3], ends: ["join", "under"] },
  { from: [-29.2, -9], to: [-20.4, -35.6], most: 0.3, ends: ["under", "free"], taper: 6, cites: 216, bare: [0, 22] }];`,
        },
        // The forehead one line from the nose's edge over its locks to under the topknot; the back of the head from under
        // the topknot to under the ear, where the ear's own line takes it up; the chin's line free where it meets the collar.
        { find: `  { from: [-91.2, -100.9], to: lock1.notches[0], under: (p: P) => 0.65 * Math.min(1, Math.max(0, (p[1] + 124) / 20)), taper: [0.3, 1.2] },`, replace: `  { from: [-92, -100.5], to: [-60.4, -152.2], under: (p: P) => 0.65 * Math.min(1, Math.max(0, (p[1] + 124) / 20)), ends: ["join", "under"] },` },
        { find: `  { from: lock1.notches[0], to: lock1.notches[1], taper: 1.4 },\n`, replace: `` },
        { find: `  { from: lock2.notches[0], to: lock2.notches[1], taper: 1.4 },\n`, replace: `` },
        { find: `  { from: lock2.notches[1], to: [-62.2, -151.2], taper: [1.2, 3] },\n`, replace: `` },
        { find: `{ from: [-14, -154], to: [6.6, -136.4], taper: [3, 4] },`, replace: `{ from: [-14, -154], to: [12.6, -126], ends: ["under", "under"] },` },
        { find: `(p[0] + 84) / -8)), taper: [4, 0.6] },`, replace: `(p[0] + 84) / -8)), ends: ["free", "join"] },` },
        {
          // The ear lies over the head: its line takes up the head's at its back, runs down round its foot and up its front
          // to y -123, and its top, feathered over the crown, is unlined (DECISIONS 68, its length cited).
          find: `const earSpans: LitSpan[] = [{ from: [4.6, -135.8], to: [-30.4, -71.6], on: "tan", under: (p: P) => Math.min(0.55, Math.max(0, (p[1] + 76) / 5) * 0.55), taper: [12, 6] },
  { from: [-26.4, -67.4], to: [-31.4, -123], on: "tan", taper: [4, 12] }];`,
          replace: `const earSpans: LitSpan[] = [{ from: [11.7, -127.9], to: [-31.4, -123], on: "tan", under: (p: P) => Math.min(0.55, Math.max(0, (p[1] + 76) / 5) * 0.55), ends: ["join", "free"], cites: 68, bare: [0, 50] }];`,
        },
        {
          // The tail's outline one line round the plume, from under the rump to under it again.
          find: `  const tailLines: LitSpan[] = [{ from: [17.6, -35.8], to: [20.6, -45.4], on: "tan", taper: 3 }, { from: [20.4, -43.6], to: tailLobes[0]![0], taper: [3, 1.4] },
    ...tailLobes.map(([a, b]): LitSpan => ({ from: a, to: b, taper: 1.4 })), { from: tailLobes.at(-1)![1], to: [30, -13.4], taper: [1.4, 3] },
    { from: [31.6, -12.8], to: [17.4, -9.8], on: "tan", taper: 3 }];`,
          replace: `  const tailLines: LitSpan[] = [{ from: [15.6, -32.8], to: [15, -11], on: (p: P) => (p[0] < 23 ? "tan" : "cream"), ends: ["under", "under"] }];`,
        },
        // The far front leg's front from under the chest down round its paw to under the near paw.
        { find: `[{ from: [-63.6, -35.2], to: [-66.6, -4.8], taper: 4 }]`, replace: `[{ from: [-63.1, -36.8], to: [-61.3, -4.6], ends: ["under", "under"] }]` },
        // The near hind paw closed all round, its back against the haunch included (a ring joined on itself), its back no
        // longer feathered into the haunch, which faded its line there.
        { find: `[{ from: [-15.4, -1.3], to: [-12.6, -14.4], taper: [4, 8] }]`, replace: `[{ from: [-11.6, -11.8], to: [-11.6, -11.8], ends: ["join", "join"] }]` },
        { find: `    feather: { from: [-10.8, -9], to: [-14.6, -9] },\n`, replace: `` },
        // The near front paw from the wrist round its toes and sole to its heel, free at both; its back on the chest
        // unlined, as the sheet leaves it (DECISIONS 216, its length cited).
        { find: `[{ from: [-55.8, -25.2], to: [-35.8, -7.2], taper: 5 }]`, replace: `[{ from: [-55.8, -25.2], to: [-35.8, -7.2], ends: ["free", "free"], cites: 216, bare: [0, 64] }]` },
      ],
      rows: [
        { label: "side: the crown, the forehead and the ear's top (zoom 6)", box: [-96, -162, 108, 40], zoom: 6 },
        { label: "side: the body, the paws and the tail (zoom 5)", box: [-80, -64, 130, 66], zoom: 5 },
        phoneSide,
      ],
    },
  },
  {
    id: "g4-headfur",
    title: "G4 head fur (parts/headfur.ts, DECISIONS 214): the crown's line joined to each ear's, the roots and cheek puffs soft and unlined, a round chin scalloped over the collar",
    all: true,
    front: {
      notes: [
        [/^tuft\//, "the topknot's curls (topknot.ts): the front lane's"],
        [/^(body\.back|front\.[LR]|hind\.[LR])\//, "the body's and legs' lines: G1's and G6's recipes (g1-lines, g6-paws)"],
        [/^ear\.[LR]\//, "the ears' lines: G1's and G5's recipes (g1-lines, g5-ears)"],
      ],
      prelude: imp("headFur, chinShadow", "characters/dog/src/parts/headfur.ts"),
      edits: [
        {
          find: `[-36.9, -129.4], [-41.6, -120.6], [-45.6, -114.4], [-47, -105], [-46.2, -97.4], [-43.4, -91.6], [-46, -87], [-46.8, -80.6],
  [-45, -74.4], [-40.2, -70], [-31, -64.2], [-9, -59.4]];`,
          replace: `[-36.9, -129.4], [-41.6, -120.6], [-45.6, -114.4], [-47, -105], [-47, -97.6], [-48.2, -89.4], [-48.4, -81.4],
  [-46.6, -74.6], [-42.6, -69.4], [-36, -65.2], [-24, -61.4], [-9, -59.4]];`,
        },
        { find: `const CORNERS = [PUFF, headHalf.length + headHalf.length - PUFF, TEMPLE[2]!, headHalf.length + 1 + at];`, replace: `const CORNERS = [TEMPLE[2]!, headHalf.length + 1 + at];` },
        { find: `function headOf(puff = 0): { head: Shape; clumps: Clump[] } {`, replace: `${FRONT_HEAD_FUR}\nfunction headOfOld(puff = 0): { head: Shape; clumps: Clump[] } {` },
        { find: `function headLinePiece(up: { L: boolean; R: boolean } = { L: false, R: false }, { head, clumps } = HEAD): Piece {`, replace: `function headLinePieceOld(up: { L: boolean; R: boolean } = { L: false, R: false }, { head, clumps } = HEAD): Piece {` },
        { find: `["M-52 -172 L52 -172 L52 -137 L-52 -137Z", "M-52 -95 L-36 -95 L-36 -72 L-52 -72Z", "M52 -99 L36 -99 L36 -76 L52 -76Z"]`, replace: `["M-52 -172 L52 -172 L52 -137 L-52 -137Z"]` },
        { find: `add("shadow.chin.collar", chinOnCollar());`, replace: `add("shadow.chin.collar", chinShadow(head, cheekRoll([-38, -66.2]), cheekRoll([38, -66.2]), C.collarLine, [-44, -74, 88, 22]));` },
        // Each ear's line runs on under the head at both ends (G1's), so the crown's line meets it at full width.
        { find: `? [{ from: ends[0], to: ends[1], on: "tan", under: foot, taper: 7 }`, replace: `? [{ from: [-38.8, -68], to: ends[1], on: "tan", under: foot, ends: ["under", "under"] }` },
        { find: `: [{ from: ends[1], to: ends[0], on: "tan", under: foot, taper: 7 }`, replace: `: [{ from: ends[1], to: [37.1, -71.6], on: "tan", under: foot, ends: ["under", "under"] }` },
      ],
      rows: [
        { label: "front: the crown over the dog's right ear's root (zoom 12)", box: [-56, -152, 30, 24], zoom: 12 },
        { label: "front: the crown over the dog's left ear's root (zoom 12)", box: [24, -154, 30, 24], zoom: 12 },
        { label: "front: the cheeks and the chin over the collar (zoom 6)", box: [-58, -104, 116, 50], zoom: 6 },
        phoneFront,
      ],
    },
  },
  {
    id: "g5-ears",
    title: "G5 ears (parts/ear.ts earEdge, earFur edge; DECISIONS 215): a stepped outer edge, a hem of rounded lock tips, one line light at the top and deeper at the hem",
    front: {
      prelude: imp("earEdge", "characters/dog/src/parts/ear.ts") + imp("type Lock as Lock", "characters/draw/fur.ts"),
      edits: [
        { find: `[-58.6, -63.1], [-63.2, -65], [-66.6, -69.4], [-70.6, -70.6], [-74.4, -73.6], [-76.2, -78.2], [-80.4, -82],`, replace: `[-58.6, -63.1], [-65, -65.8], [-71, -69.4], [-76.2, -74.8], [-80.4, -82],` },
        { find: `const EAR_NOTCHES = [[-66.6, -69.4], [-76.2, -78.2]].map(([x, y]) => earR.findIndex((n) => n[0] === x && n[1] === y));`, replace: `const EAR_NOTCHES: number[] = [];` },
        { find: `function earPaint(side: "L" | "R"): Paint {`, replace: `${FRONT_EAR_EDGE}\nfunction earPaint(side: "L" | "R"): Paint {` },
        { find: `    ear: ears[side],`, replace: `    ear: EDGES[side].shape, edge: EDGES[side],` },
        // The locks a little more uneven in length (ear.ts's UNEVEN, 0.2): the outer one comes in from higher up, the
        // inner short one starts lower.
        { find: `    [[-69.4, -104], [-74, -96], [-76.4, -87.4], [-76.6, -79.6]],`, replace: `    [[-69.8, -110], [-72.6, -102], [-74.8, -94], [-76.4, -87.4], [-76.6, -79.6]],` },
        { find: `    [[-50.6, -86], [-51.6, -78.6], [-51.2, -71.4]],`, replace: `    [[-50.6, -82], [-51.4, -76.6], [-51.2, -71.4]],` },
        { find: `add(\`ear.\${side}\`, litPart(\`ear.\${side}\`, ears[side], earPaint(side), earSpans(side)));`, replace: `add(\`ear.\${side}\`, litPart(\`ear.\${side}\`, EDGES[side].shape, earPaint(side), [EDGES[side].span, earSpans(side)[1]!]));` },
      ],
      rows: [
        { label: "front: the dog's right ear (zoom 6), beside the floppy-ears panel", box: [-86, -146, 52, 88], zoom: 6, panel: "master.feature.floppy-ears" },
        { label: "front: the dog's left ear (zoom 6)", box: [34, -146, 52, 88], zoom: 6 },
        phoneFront,
      ],
    },
    side: {
      prelude: imp("earEdge", "characters/dog/src/parts/ear.ts"),
      edits: [
        {
          find: `(tip, root, notches) => earClumps.push({ tip, root, notches }));`,
          replace: `(tip, root, notches) => earClumps.push({ tip, root, notches }));
// The ear's edge (G5): the same droplet, a step a third of the way down its back edge and four rounded tips round its
// foot, the rearmost curling up its back edge.
const EDGE = earEdge({
  base: smooth([[8.6, -133.6], [13.4, -124.6], [17.6, -114.6], [21, -104.4], [22.4, -94], [21.6, -84.4], [18.6, -76.6], [12.6, -70.4],
    [4, -66], [-13, -62.8], [-21.4, -64], [-28.8, -69], [-35, -77], [-37.6, -86.4], [-37, -96], [-34.6, -106], [-32.4, -115.4],
    [-31.2, -124], [-29.6, -130.6], [-23.6, -138], [-17.8, -142.2], [-12.9, -143.8], [-4.4, -142.4], [2.6, -138.8]]),
  // One broad, low step high on the back edge, a gentle shelf: the side crop's back edge is nearly smooth.
  steps: [{ from: [16.3, -117.6], to: [19.6, -109.8], lock: { len: 0.9, width: 8.8, lean: 0.4 }, tipRound: 0.35 }],
  hem: { from: [20.4, -81], to: [-29.4, -70], locks: [{ len: 1.8, width: 12, lean: -0.45, dip: 0.4 }, { len: 1.5, width: 16.5, lean: -0.2, dip: 0.3 },
    { len: 2, width: 17, lean: -0.1, dip: 0.5 }, { len: 1.4, width: 14.5, lean: 0.15 }], tipRound: 0.38 },
  axis: [[-6, -143], [-8, -63]],
  // In profile the ear lies over the head: its line takes up the head's at its back, where the head's outline goes
  // under the ear, and its front edge fades out at y -123, the ear's top left unlined as the sheet feathers it over the
  // crown (DECISIONS 68, its length cited).
  line: { from: [11.7, -127.9], to: [-31.4, -123], ends: ["join", "free"], cites: 68, bare: [0, 50] },
});`,
        },
        // The back of the head's line runs on under the ear, where the ear's line takes it up (G1's).
        { find: `{ from: [-14, -154], to: [6.6, -136.4], taper: [3, 4] },`, replace: `{ from: [-14, -154], to: [12.6, -126], ends: ["under", "under"] },` },
        { find: `      ear, axis: [[-6, -143], [-8, -63]], deepen: [0.4, 1.1],`, replace: `      ear: EDGE.shape, edge: EDGE, axis: [[-6, -143], [-8, -63]], deepen: [0.4, 1.1],` },
        {
          find: `      locks: [[[-26.6, -97], [-28.6, -87], [-27.8, -77.4]], [[-17.4, -93], [-18.8, -83], [-17.2, -70.4]], [[-6, -99], [-6.2, -87], [-4.6, -75], [-2.6, -67.6]],
        [[6.6, -95], [7.8, -85], [6.8, -73.6]]],`,
          // Uneven and fanning out toward the hem with the ear's droop, the front ones leaning forward, the back ones back.
          replace: `      locks: [[[-27, -99], [-29.4, -88], [-30, -76]], [[-20.6, -86], [-21.8, -78], [-22, -70]], [[-8, -103], [-8.4, -90], [-7.6, -78], [-6.4, -68]],
        [[2.4, -89], [3.6, -81], [4.2, -72]], [[11.4, -101], [14, -91], [15.2, -80]]],`,
        },
        { find: `add("ear.L", litPart("ear.L", ear, earPaint(F), earSpans));`, replace: `add("ear.L", litPart("ear.L", EDGE.shape, earPaint(F), [EDGE.span]));` },
      ],
      rows: [
        { label: "side: the ear (zoom 6), beside the floppy-ears panel", box: [-44, -148, 70, 90], zoom: 6, panel: "master.feature.floppy-ears" },
        phoneSide,
      ],
    },
  },
  {
    id: "g6-paws",
    title: "G6 paws (parts/paw.ts bun, soft toes; parts/lines.ts ground sole; DECISIONS 216): a bun with toe lobes, a scalloped sole, soft toe lines, the ground term on the middle of the sole",
    front: {
      prelude: imp("bun, lobed", "characters/dog/src/parts/paw.ts"),
      edits: [
        {
          find: `const legR: Node[] = [[-5.8, -33.6], [-5.2, -28], [-3.6, -20], [-2.2, -13], [-1.2, -8.8], [-1, -5.8], [-2.7, -2.4], [-6.4, -1], [-11.2, -0.9], [-16, -0.2],
  [-20.8, -0.9], [-25, -1.6], [-28.4, -4], [-30.4, -8], [-30.6, -12.2], [-29.8, -16], [-31.6, -21], [-33.6, -28], [-34.8, -35], [-35.2, -41],
  [-33, -47], [-26, -44], [-15, -40.4], [-8.2, -37.4]];
/** The sole's dips at the toe lines (concave, so no corner rule applies). */
const FRONT_TOES = [8, 10];
const legs = { R: smooth(legR, { corners: FRONT_TOES }), L: smooth(mirrorX(legR), { corners: FRONT_TOES.map((j) => (legR.length - j) % legR.length) }) };`,
          replace: FRONT_LEG_BUN,
        },
        { find: `.map((pts) => flipX(pts, side)), fade: [-3.4, -10] }),`, replace: `.map((pts) => flipX(pts, side)), fade: [-3.4, -10], soft: true }),` },
        { find: `litSide(side, [{ from: [-31.4, -16.2], to: [-29.2, -4.6], taper: [3, 4] }])), 6));`, replace: `litSide(side, [{ from: [-28.1, -14], to: [-27.7, -5.4], ends: ["under", "under"], ground: "sole" }])), 6));` },
        {
          find: `    const toeLines = toes({ lines: ([[[-11.2, -1.2], [-10.6, -3.4], [-10.8, -5.4], [-11.6, -6.9]], [[-20.8, -1.2], [-21.4, -3.4], [-21.2, -5.4], [-20.4, -6.9]]] as P[][])
      .map((pts) => flipX(pts, side)), fade: [-1.2, -7] });`,
          replace: `    const toeLines = toes({ lines: BUN.toes.map((pts) => flipX(pts, side)), fade: BUN.fade, soft: true });`,
        },
        { find: `litSide(side, [{ from: [-2.4, -15], to: [-35, -40], taper: [6, 16] }])));`, replace: `litSide(side, [{ from: [-4.8, -28], to: [-34.8, -38], ends: ["free", "free"], ground: "sole", cites: 216, bare: [0, 47] }])));` },
      ],
      rows: [
        { label: "front: the paws (zoom 7), beside the stubby-paws panel", box: [-52, -30, 104, 33], zoom: 7, panel: "master.feature.stubby-paws" },
        { label: "front: the right paws (zoom 12)", box: [-50, -22, 50, 24], zoom: 12 },
        phoneFront,
      ],
    },
    side: {
      edits: [
        { find: `[[-53.4, -1], [-53.8, -2.8], [-53.6, -4.6]]], fade: [-1.2, -9] });`, replace: `[[-53.4, -1], [-53.8, -2.8], [-53.6, -4.6]]], fade: [-1.2, -9], soft: true });` },
        { find: `[[-69.8, -5], [-70.6, -7], [-70.6, -9.2], [-69.9, -10.8]]], fade: [-5, -12] });`, replace: `[[-69.8, -5], [-70.6, -7], [-70.6, -9.2], [-69.9, -10.8]]], fade: [-5, -12], soft: true });` },
        { find: `      [[-20.6, -1], [-21.1, -2.8], [-21, -4.8]]], fade: [-1.4, -9] }),`, replace: `      [[-20.6, -1], [-21.1, -2.8], [-21, -4.8]]], fade: [-1.4, -9], soft: true }),` },
        // The near hind paw closed all round on the haunch (G1's ring, its feather lifted), the ground's dark under its middle.
        { find: `[{ from: [-15.4, -1.3], to: [-12.6, -14.4], taper: [4, 8] }]`, replace: `[{ from: [-11.6, -11.8], to: [-11.6, -11.8], ends: ["join", "join"], ground: "sole" }]` },
        { find: `    feather: { from: [-10.8, -9], to: [-14.6, -9] },\n`, replace: `` },
        // The near front paw from the wrist to the heel (G1's), its back on the chest unlined (DECISIONS 216, cited).
        { find: `[{ from: [-55.8, -25.2], to: [-35.8, -7.2], taper: 5 }]`, replace: `[{ from: [-55.8, -25.2], to: [-35.8, -7.2], ends: ["free", "free"], ground: "sole", cites: 216, bare: [0, 64] }]` },
        // The haunch's underside along the ground on under the hind paw.
        { find: `{ from: [14.6, -6.6], to: [-6, -1.6], taper: 6 }];`, replace: `{ from: [14.6, -6.6], to: [-21.5, -1.3], ends: ["free", "under"], ground: "sole" }];` },
      ],
      rows: [
        // The profile bun (one lobe and a heel) is not built: the side's toe lines are only softened, still short ticks.
        { label: "side: the paws (zoom 7): the hind paw closed on the haunch, soft toe lines; no profile bun yet (the side lane's)", box: [-80, -28, 100, 30], zoom: 7 },
        phoneSide,
      ],
    },
  },
  {
    id: "g10-shadow",
    title: "G10 the ground shadow (parts/shadow.ts, DECISIONS 218): wide, soft, darkest under the paws",
    front: {
      prelude: imp("groundShadow", "characters/dog/src/parts/shadow.ts"),
      edits: [{
        find: `  add("shadow", join(soft("M-62 -1.4 a62 4.8 0 1 0 124 0 a62 4.8 0 1 0 -124 0Z", [-62, -6.2, 124, 9.6], C.shadow, 2.4),`,
        replace: `  add("shadow", groundShadow({ reach: [-68, 63], presses: [{ x: -15.4, half: 13 }, { x: 15.4, half: 13 }, { x: -38.4, half: 9 }, { x: 38.4, half: 9 }] }));\n` +
          `  if (false) add("shadow", join(soft("M-62 -1.4 a62 4.8 0 1 0 124 0 a62 4.8 0 1 0 -124 0Z", [-62, -6.2, 124, 9.6], C.shadow, 2.4),`,
      }],
      rows: [{ label: "front: the ground under the paws", box: [-80, -22, 160, 30], zoom: 5 }, phoneFront],
    },
    side: {
      prelude: imp("groundShadow", "characters/dog/src/parts/shadow.ts"),
      edits: [{
        find: `  add("shadow", join(soft("M-80 -1.4 a64 4.2 0 1 0 128 0 a64 4.2 0 1 0 -128 0Z", [-80, -5.6, 128, 8.4], C.shadow, 2.4, 0.75),`,
        replace: `  add("shadow", groundShadow({ reach: [-95, 42], presses: [{ x: -50, half: 13 }, { x: -69, half: 6 }, { x: -21, half: 10 }, { x: 4, half: 10 }] }));\n` +
          `  if (false) add("shadow", join(soft("M-80 -1.4 a64 4.2 0 1 0 128 0 a64 4.2 0 1 0 -128 0Z", [-80, -5.6, 128, 8.4], C.shadow, 2.4, 0.75),`,
      }],
      rows: [{ label: "side: the ground under the paws and the tail", box: [-100, -22, 150, 30], zoom: 5 }, phoneSide],
    },
  },
  {
    id: "g2-crisp",
    title: "G2 a crisp outer line (parts/lines.ts litEdge crisp; DECISIONS 212): no blur past the silhouette, soft inside",
    front: {
      edits: [
        { find: `const r = litEdge(head, [...sides, ...crownSpans], "head.line", box, { reach: 0.5 });`, replace: `const r = litEdge(head, [...sides, ...crownSpans], "head.line", box, { reach: 0.5, crisp: true });` },
        { find: `const c = litEdge(head, cheeks.spans, "cheek clump", box, { reach: 0.5, blur: 0.2 });`, replace: `const c = litEdge(head, cheeks.spans, "cheek clump", box, { reach: 0.5, blur: 0.2, crisp: true });` },
      ],
      rows: [{ label: "front: the crown's line (zoom 10)", box: [-48, -160, 36, 26], zoom: 10 }],
    },
    side: {
      edits: [{ find: `const r = litEdge(head, headSpans, "head.line", box, { reach: 0.5, light: F.light }),`, replace: `const r = litEdge(head, headSpans, "head.line", box, { reach: 0.5, light: F.light, crisp: true }),` }],
      rows: [{ label: "side: the forehead and the crown (zoom 10)", box: [-90, -156, 36, 30], zoom: 10 }],
    },
  },
];
