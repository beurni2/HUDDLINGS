// The fur pass's shared recipes, each opted in on scratch copies of the front and side views (lane 1 of
// docs/phase3-fur-plan.md; DECISIONS 210 to 219): for each group, the sheet's crop, today's drawing and the drawing
// with that group's recipe, side by side at one scale, zoomed and at phone size, into qa/phase3/fur/recipes/<group>.png.
// The views themselves are never changed here; each view's lane opts in in its own file.
//
// node qa/phase3/fur/recipes/demo.ts [--gate] [group...]   (--gate: the gate's report only, no pictures)
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Rig } from "../../../../runtime-web/src/format.ts";
import { decisionsOf, gateProblems, lineGate } from "../../../../characters/draw/lint.ts";
import { GROUPS } from "./groups.ts";
import { rest, sheet, type Drawn } from "./render.ts";
import { repo, scratch } from "./scratch.ts";

const here = dirname(fileURLToPath(import.meta.url));
/** The composites' scale, px/pt: enough for the zoomed rows, never upscaled past it. */
const SCALE = 8;
const VIEWS = { front: "front", side: "side.L" } as const;

const rig = JSON.parse(readFileSync(join(repo, "characters/dog/src/rig.json"), "utf8")) as Rig;
/** The dog's DECISIONS entries, so a demo span's cite is held to a current entry, as the build's lint will hold a lane's. */
const decisions = decisionsOf(readFileSync(join(repo, "characters/dog/DECISIONS.md"), "utf8"));

/**
 * What the line gate (DECISIONS 219) would say of the view if its lane opted every drawing in: the view composited in
 * rig.json's draw order, as the build's lint composites it. Today's drawings show what the gate catches; the recipe's,
 * what is left for each view's lane.
 */
function gate(view: string, drawn: Drawn[]): string[] {
  return gateProblems(drawn.map(({ part, state, piece }) => ({ region: `${part}/${view}${state ? `:${state}` : ""}`, svg: "", anchor: [0, 0] as [number, number], meta: lineGate(piece).meta })), { rig, decisions });
}

/** A problem with its numbers taken out: the same problem on an outline the recipe moved reads the same. */
const norm = (p: string) => p.replace(/-?\d+(?:\.\d+)?/g, "#");

/** Today's problems against the recipe's: those it clears, those left as today's (the same or with moved numbers) and those it brings. */
function compare(today: string[], recipe: string[]) {
  const pool = new Map<string, number>();
  for (const p of today) pool.set(norm(p), (pool.get(norm(p)) ?? 0) + 1);
  const kept: string[] = [], added: string[] = [];
  for (const p of recipe) {
    const k = norm(p), n = pool.get(k) ?? 0;
    if (n > 0) (pool.set(k, n - 1), kept.push(p));
    else added.push(p);
  }
  return { kept, added, cleared: today.length - kept.length };
}

const pictures = !process.argv.includes("--gate");
const wanted = process.argv.slice(2).filter((a) => a !== "--gate");
const todays = new Map<string, ReturnType<typeof rest>>();
const todaysGate = new Map<string, string[]>();
const report: string[] = [];
for (const g of GROUPS.filter((g) => !wanted.length || wanted.includes(g.id))) {
  const rows = [];
  for (const [view, name] of Object.entries(VIEWS) as [keyof typeof VIEWS, string][]) {
    const edit = g[view];
    if (!edit) continue;
    const draw = async (edits: typeof edit.edits, prelude: string): Promise<Drawn[]> => {
      const m = await scratch<Record<string, (...a: unknown[]) => Drawn[]>>(view, edits, prelude);
      return view === "front" ? m.front!() : m.side!("L");
    };
    // The recipe's drawings first, so a row that breaks its rules fails before any compositing.
    const drawn = await draw(edit.edits, edit.prelude ?? "");
    if (!todaysGate.has(view)) {
      const today = await draw([], "");
      if (pictures) todays.set(view, rest(name, today, SCALE));
      todaysGate.set(view, gate(name, today));
    }
    if (pictures) {
      const after = rest(name, drawn, SCALE);
      for (const row of edit.rows) rows.push({ view: name, before: todays.get(view)!, after, scale: SCALE, row });
    }
    // The gate's problems today and with the recipe: those the recipe clears, those it leaves and any it brings, each
    // it brings or leaves named with whose it is (the group's notes), or "unexplained".
    const recipe = gate(name, drawn), { kept, added, cleared } = compare(todaysGate.get(view)!, recipe);
    const note = (p: string) => edit.notes?.find(([re]) => re.test(p))?.[1];
    report.push(`${g.id} ${name}: the line gate finds ${todaysGate.get(view)!.length} problems today and ${recipe.length} with the recipe: ${cleared} cleared, ${kept.length} left as today's, ${added.length} new`);
    for (const p of added) report.push(`  new:  ${p} [${note(p) ?? "unexplained"}]`);
    if (g.all) for (const p of kept) report.push(`  left: ${p} [${note(p) ?? "as today"}]`);
  }
  if (!pictures) continue;
  const out = join(here, `${g.id}.png`);
  sheet(g.title, rows, out);
  console.log(`${g.id}: ${out}`);
}
// The whole report, whenever every group ran (the gate's report is the same with or without the pictures).
const HEAD = [
  "# The line gate (DECISIONS 219) on each group's opt-in, on scratch copies of the front and side.L, against today's views.",
  "# A problem 'left as today's' is one today's view also has, its numbers aside (an outline the recipe moved shifts them);",
  "# 'new' ones are listed, each with whose it is. The line and head fur recipes (g1, g4) list every problem left, the",
  "# view lanes' work list. Made by: node qa/phase3/fur/recipes/demo.ts",
];
if (!wanted.length) writeFileSync(join(here, "gate.txt"), `${[...HEAD, ...report].join("\n")}\n`);
// The gate-only run prints its whole report; a picture run, its summary and anything unexplained.
console.log(report.filter((l) => !pictures || !l.startsWith("  ") || l.includes("unexplained")).join("\n"));
