// Tests for lines (characters/draw/line.ts): the wobble never takes a line out
// of its band, a short line still swells to its width, and the lint holds what
// is drawn, not only what is declared.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Drawing } from "../../build/atlas.ts";
import { smooth, type Node, type P } from "../geom.ts";
import { innerLine, ribbons, strokeOf, type DrawnLine } from "../line.ts";
import { LIMITS, lintDrawing } from "../lint.ts";
import type { Meta } from "../svg.ts";

const round: Node[] = Array.from({ length: 10 }, (_, i): Node => [40 * Math.cos((i / 10) * 2 * Math.PI), 40 * Math.sin((i / 10) * 2 * Math.PI)]);
const loop: P[] = Array.from({ length: 400 }, (_, i) => [40 * Math.cos((i / 400) * 2 * Math.PI), 40 * Math.sin((i / 400) * 2 * Math.PI)]);
const drawing = (meta: Meta): Drawing => ({ region: "part/front", anchor: [0, 0], meta, svg: `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="-50 -50 100 100"></svg>` });

test("the default wobble would draw a 1.2 pt outline 1.08 pt wide; held to its band it never goes under 1.2", () => {
  // Clipped, half of the ribbon shows.
  const free = strokeOf(loop, 2.4, { closed: true, wobble: 0.1, seed: 11 });
  assert.ok(free.drawn[0] / 2 < 1.1, `free, it draws ${free.drawn[0] / 2} pt`);
  for (const width of [1.2, 1.54, 1.8]) {
    const [line] = ribbons(smooth(round), { colour: "#91694A", width }, "part").lines as DrawnLine[];
    assert.ok(line!.drawn![0] >= LIMITS.outer[0] - 1e-9 && line!.drawn![1] <= LIMITS.outer[1] + 1e-9, `a ${width} pt outline draws ${line!.drawn}`);
    assert.ok(line!.drawn![1] - line!.drawn![0] > 0.05, "and still wobbles");
  }
  const inner = innerLine([[0, 0], [0, 30]], 0.6, "#91694A").line;
  assert.ok(inner.drawn![0] >= 0.6 - 1e-9 && inner.drawn![1] <= 0.9 + 1e-9, `a 0.6 pt inner line draws ${inner.drawn}`);
});

test("a width outside the band is never moved into it, so the lint still refuses it", () => {
  const thin = ribbons(smooth(round), { colour: "#91694A", width: 1.1 }, "part");
  // The wobble only keeps it from going further out.
  assert.ok(Math.abs(thin.lines[0]!.drawn![0] - 1.1) < 1e-9, `${thin.lines[0]!.drawn}`);
  assert.match(lintDrawing(drawing({ shapes: [], lines: thin.lines })).join("\n"), /outer line 1.1 pt in part is outside 1.2 to 1.8 pt/);
});

test("a line of two points swells to its width between its tapered ends", () => {
  // Before, a two-point toe line stayed as thin as its tips (0.16 pt) all along.
  const toe = innerLine([[0, 0], [0, 3]], 0.75, "#91694A", { wobble: 0 }).line;
  assert.ok(Math.abs(toe.drawn![0] - 0.75) < 1e-9 && Math.abs(toe.drawn![1] - 0.75) < 1e-9, `${toe.drawn}`);
  // A taper longer than half the line never lets it reach its width: its widest is what counts.
  const short = strokeOf([[0, 0], [0, 2]], 0.75, { taper: 5 });
  assert.equal(short.drawn[0], short.drawn[1]);
  assert.ok(short.drawn[0] < 0.6);
});

test("the lint holds the width a line draws, not only the width it declares", () => {
  const say = (lines: DrawnLine[]) => lintDrawing(drawing({ shapes: [], lines })).join("\n");
  assert.equal(say([{ kind: "outer", width: 1.2, where: "part", drawn: [1.2, 1.32] }]), "");
  assert.match(say([{ kind: "outer", width: 1.2, where: "part", drawn: [1.08, 1.32] }]), /outer line 1.2 pt in part is drawn 1.08 to 1.32 pt wide, outside 1.2 to 1.8 pt/);
  assert.match(say([{ kind: "outer", width: 1.7, where: "part", drawn: [1.53, 1.87] }]), /drawn 1.53 to 1.87 pt wide/);
  assert.match(say([innerLine([[0, 0], [0, 2]], 0.75, "#91694A", { taper: 5 }).line]), /inner line 0.75 pt in inner is drawn 0.\d+ to 0.\d+ pt wide, outside 0.6 to 0.9 pt/);
});
