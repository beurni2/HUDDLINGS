// The dog's colours: model.json's printed palette and the colours the sheet
// paints that it lacks (palettePainted, DECISIONS 18, Q24), and every other
// colour derived from those by a rule. The lint refuses a colour not listed here.
import { darken, mix, ratio } from "../../draw/paint.ts";
import { model } from "./model.ts";

const printed = model.palette;
const painted = Object.fromEntries(Object.entries(model.palettePainted).map(([k, v]) => [k, v.value]));
const need = (from: Record<string, string>, k: string) => {
  const c = from[k];
  if (!c) throw new Error(`model.json has no colour ${k}`);
  return c;
};

const fur = need(printed, "fur"), marking = need(printed, "marking"), dark = need(printed, "dark"), outline = need(printed, "outline");
const collar = need(printed, "collar"), tag = need(printed, "tag");
const furShade = need(painted, "furShade"), eyeDark = need(painted, "eyeDark"), tongue = need(painted, "tongue");
/** White: the light's own colour, for catchlights and shines. No sheet colour defines it. */
const light = "#FFFFFF";

export const C = {
  fur,
  marking,
  dark,
  outline,
  collar,
  tag,
  furShade,
  eyeDark,
  tongue,
  light,
  blush: need(printed, "blush"),
  shadow: need(printed, "shadow"),
  collarHighlight: need(printed, "collarHighlight"),
  /** The head patches' paler tan. */
  patch: need(painted, "markingLight"),
  mouthInside: need(painted, "mouthInside"),
  /** The fur's shade as a multiply: cream becomes the sheet's #FDE3C8, and a tan patch under it about #D79768. */
  furShadeBy: ratio(fur, furShade),
  /** Every other fill's shade, 10% darker (spec L507: the fill 8 to 12% darker). */
  shadeBy: darken(light, 0.1),
  /** The lighter line on fur spans. */
  furLine: mix(outline, fur, 0.14),
  /** The faint line round the cheeks' fluff, which the sheet barely outlines. */
  fluffLine: mix(outline, fur, 0.45),
  /** Where a patch meets its ear, the sheet draws no outline: a line in the ear's own tan, a little deeper (DECISIONS 7). */
  junction: mix(marking, outline, 0.25),
  collarLine: darken(collar, 0.25),
  tagLine: darken(tag, 0.25),
  tagShine: mix(tag, light, 0.6),
  eyeWhite: mix(fur, light, 0.75),
  tongueLine: darken(tongue, 0.1),
  tongueShine: mix(tongue, light, 0.5),
};

/** Every colour a dog part may paint. */
export const palette = [...new Set(Object.values(C))];
