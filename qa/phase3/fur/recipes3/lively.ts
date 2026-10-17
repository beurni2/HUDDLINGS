// The line's life (DECISIONS 284) opted in on every lit span of a scratch view, for the demo: litPart, litEdge and
// litMarking as lines.ts exports them, each span given its class's life (by the part it lines, as a view's lane would
// type it) on its own living weight: a span that carries a weight keeps its seed and its amount, one that carries none
// takes a seed of its own fixed from the shape it runs on and its place in that shape's spans (what a lane types by
// hand, once). Typed swells and breaks are the view's own (options.ts patches them in as text).
import type { Shape } from "../../../../characters/draw/geom.ts";
import { litEdge as edge, litMarking as marking, litPart as part, type LifeClass, type LitSpan } from "../../../../characters/dog/src/parts/lines.ts";
import { seedOf } from "../recipes2/weighted.ts";

/** The class of edge a part's lines are, as a view's lane would type it: the sheet figures that set its life (LIFE). */
export function classOf(name: string): LifeClass {
  if (name.startsWith("ear.")) return "ears";
  if (name.includes("head") || name.startsWith("temple.") || name === "tuft") return "head";
  if (name.startsWith("tail")) return "tail";
  if (name.startsWith("front.") || name.startsWith("hind.")) return "legs";
  return "back";
}

export function lively(only?: (name: string) => boolean) {
  const live = (name: string, shape: Shape, spans: LitSpan[]): LitSpan[] =>
    only && !only(name) ? spans : spans.map((s, k) => ({ ...s, weight: { ...(s.weight ?? { seed: seedOf(shape, k) }), life: s.weight?.life ?? classOf(name) } }));
  return {
    litPart: ((name, shape, paint, spans, o) => part(name, shape, paint, live(name, shape, spans), o)) as typeof part,
    litEdge: ((shape, spans, where, box, o) => edge(shape, live(where, shape, spans), where, box, o)) as typeof edge,
    litMarking: ((name, on, patch, opts, o) => marking(name, { ...on, spans: live(name.replace(/\.patch\..*/, ""), on.shape, on.spans) }, patch, opts, o)) as typeof marking,
  };
}
