// The dog's colours: model.json's printed palette and the colours the sheet
// paints that it lacks (palettePainted, DECISIONS 18, Q24), and every other
// colour derived from those by a rule. The lint refuses a colour not listed here.
import { darken, mix, multiply, ratio } from "../../draw/paint.ts";
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
const mouthInside = need(painted, "mouthInside");
/** White: the light's own colour, for catchlights and shines. No sheet colour defines it. */
const light = "#FFFFFF";
/** The fur's shade as a multiply: cream becomes the sheet's #FDE3C8, and a tan patch under it about #D79768. */
const furShadeBy = ratio(fur, furShade);

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
  mouthInside,
  furShadeBy,
  /** Every other fill's shade, 10% darker (spec L507: the fill 8 to 12% darker). */
  shadeBy: darken(light, 0.1),
  /** The ears' tan under the fur's own warm shade (about #D79768), and under it twice (about #D58D5A): the sheet's
   * lower ear deepens to about #D89464. */
  earDeep: multiply(marking, furShadeBy),
  earDeeper: multiply(multiply(marking, furShadeBy), furShadeBy),
  /** The lighter line on fur spans. */
  furLine: mix(outline, fur, 0.14),
  /** The faint line round the cheeks' fluff and the topknot, which the sheet barely outlines. */
  fluffLine: mix(outline, fur, 0.45),
  /** The outline warmed toward the tan, lighter than the full outline: the sheet's line round the ears, the
   * haunches and the paws (L* 57 to 66 there against the outline's 48). */
  warmLine: mix(outline, marking, 0.3),
  /** Where a patch meets its ear, the sheet draws no outline: a line in the ear's own tan, a little deeper (DECISIONS 7). */
  junction: mix(marking, outline, 0.25),
  /** The line the front turnaround draws where the head's side meets the ear: the ear's tan in its own deep shade
   * (the tan multiplied by itself, 12% darker), #A35C32 against the sheet's #9E5C2C. */
  earLine: darken(multiply(marking, marking), 0.12),
  collarLine: darken(collar, 0.25),
  /** The tag's edge: the outline's brown warmed toward the gold, as the sheet draws it, not a darker olive gold. */
  tagLine: mix(outline, tag, 0.35),
  /** The tag's shade: its own gold at 40% multiplied in, toward orange as the sheet's gold darkens. */
  tagShadeBy: mix(light, tag, 0.4),
  tagShine: mix(tag, light, 0.6),
  eyeWhite: mix(fur, light, 0.75),
  /** The warm light low in the iris: the printed iris brown a fifth of the way to the mouth's red and a tenth
   * toward the gold, #5F331A against the sheet's #5B3119. */
  irisWarm: mix(mix(dark, mouthInside, 0.2), tag, 0.1),
  tongueLine: darken(tongue, 0.1),
  tongueShine: mix(tongue, light, 0.5),
};

/** Every colour a dog part may paint. */
export const palette = [...new Set(Object.values(C))];
