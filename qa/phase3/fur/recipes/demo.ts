// The fur pass's shared recipes, each opted in on scratch copies of the front and side views (lane 1 of
// docs/phase3-fur-plan.md; DECISIONS 210 to 219): for each group, the sheet's crop, today's drawing and the drawing
// with that group's recipe, side by side at one scale, zoomed and at phone size, into qa/phase3/fur/recipes/<group>.png.
// The views themselves are never changed here; each view's lane opts in in its own file.
//
// node qa/phase3/fur/recipes/demo.ts [group...]
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { lineGate, lintDrawing } from "../../../../characters/draw/lint.ts";
import { GROUPS } from "./groups.ts";
import { rest, sheet, type Drawn } from "./render.ts";
import { scratch } from "./scratch.ts";

const here = dirname(fileURLToPath(import.meta.url));
/** The composites' scale, px/pt: enough for the zoomed rows, never upscaled past it. */
const SCALE = 8;
const VIEWS = { front: "front", side: "side.L" } as const;

/**
 * What the line gate (DECISIONS 219) would say of each drawing if its lane opted in: the problems it adds to the
 * build's lint. Today's drawings show what the gate catches; the recipe's, what is left for each view's lane.
 */
function gate(drawn: Drawn[]): string[] {
  return drawn.flatMap(({ part, state, piece }) => {
    const d = { region: state ? `${part}@${state}` : part, svg: piece.svg, anchor: [0, 0] as [number, number] };
    const before = new Set(lintDrawing({ ...d, meta: piece.meta }));
    return lintDrawing({ ...d, meta: lineGate(piece).meta }).filter((p) => !before.has(p));
  });
}

const wanted = process.argv.slice(2);
const todays = new Map<string, ReturnType<typeof rest>>();
const todaysGate = new Map<string, string[]>();
const report: string[] = [];
for (const g of GROUPS.filter((g) => !wanted.length || wanted.includes(g.id))) {
  const rows = [];
  for (const [view, rig] of Object.entries(VIEWS) as [keyof typeof VIEWS, string][]) {
    const edit = g[view];
    if (!edit) continue;
    const draw = async (edits: typeof edit.edits, prelude: string): Promise<Drawn[]> => {
      const m = await scratch<Record<string, (...a: unknown[]) => Drawn[]>>(view, edits, prelude);
      return view === "front" ? m.front!() : m.side!("L");
    };
    // The recipe's drawings first, so a row that breaks its rules fails before any compositing.
    const drawn = await draw(edit.edits, edit.prelude ?? "");
    if (!todays.has(view)) {
      const today = await draw([], "");
      todays.set(view, rest(rig, today, SCALE));
      todaysGate.set(view, gate(today));
    }
    const after = rest(rig, drawn, SCALE);
    for (const row of edit.rows) rows.push({ view: rig, before: todays.get(view)!, after, scale: SCALE, row });
    // The gate's problems today and with the recipe: those the recipe clears and any it brings.
    const recipe = gate(drawn);
    const changed = recipe.filter((p) => !todaysGate.get(view)!.includes(p));
    const fixed = todaysGate.get(view)!.filter((p) => !recipe.includes(p));
    report.push(`${g.id} ${rig}: the line gate finds ${todaysGate.get(view)!.length} problems today and ${recipe.length} with the recipe (${fixed.length} gone, ${changed.length} new)`);
    for (const p of fixed) report.push(`  gone: ${p}`);
    for (const p of changed) report.push(`  new:  ${p}`);
  }
  const out = join(here, `${g.id}.png`);
  sheet(g.title, rows, out);
  console.log(`${g.id}: ${out}`);
}
if (!wanted.length) writeFileSync(join(here, "gate.txt"), `${report.join("\n")}\n`);
console.log(report.filter((l) => !l.startsWith("  ")).join("\n"));
