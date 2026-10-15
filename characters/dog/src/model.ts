// The dog's locked model (model.json), read once for the source: the drawings
// take their line widths and blush level from it, palette.ts its colours.
import { readFileSync } from "node:fs";

export interface Model {
  height: number;
  proportions: { headWidth: number; headHeight: number };
  landmarks: Record<string, Record<string, [number, number]>>;
  palette: Record<string, string>;
  palettePainted: Record<string, { value: string }>;
  blush: { restingLevel: number };
  outline: { outerPt: number; innerPt: number };
}

export const model = JSON.parse(readFileSync(new URL("../model.json", import.meta.url), "utf8")) as Model;
