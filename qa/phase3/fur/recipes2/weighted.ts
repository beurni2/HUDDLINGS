// The living weight (DECISIONS 260) opted in on every lit span of a scratch view, for the demo: litPart, litEdge and
// litMarking as lines.ts exports them, each span given `weight` with a seed of its own fixed from the shape it runs on
// and its place in that shape's list of spans (what a view's lane types by hand, one seed per span), so a marking's copy
// of its part's line (litMarking) draws the same line. Spans that already carry a weight keep it. `only` limits it to
// the parts named.
import type { Shape } from "../../../../characters/draw/geom.ts";
import { shapeKey } from "../../../../characters/draw/lint.ts";
import { litEdge as edge, litMarking as marking, litPart as part, type LitSpan } from "../../../../characters/dog/src/parts/lines.ts";

/** A fixed seed from a shape and a span's place: the same in every build. */
export function seedOf(shape: Shape, k: number): number {
  let h = 2166136261;
  for (const c of `${shapeKey(shape.segs)}#${k}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h % 100000;
}

export function weighting(only?: (name: string) => boolean, amount?: number) {
  const amountOf = (_s: LitSpan) => amount;
  const weigh = (name: string, shape: Shape, spans: LitSpan[]) =>
    only && !only(name) ? spans : spans.map((s, k) => (s.weight ? s : { ...s, weight: { seed: seedOf(shape, k), ...(amountOf(s) !== undefined ? { amount: amountOf(s) } : {}) } }));
  return {
    litPart: ((name, shape, paint, spans, o) => part(name, shape, paint, weigh(name, shape, spans), o)) as typeof part,
    litEdge: ((shape, spans, where, box, o) => edge(shape, weigh(where, shape, spans), where, box, o)) as typeof edge,
    litMarking: ((name, on, patch, opts, o) => marking(name, { ...on, spans: weigh(name, on.shape, on.spans) }, patch, opts, o)) as typeof marking,
  };
}
