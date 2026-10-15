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
  /** The far legs of a turned view (spec L369: 6 to 10% darker than the near ones), kept warm: the fur in its own
   * warm shade, #FDE3C8, 6.1% darker by luminance (7.0% by the channels' mean), the lightest that holds by either
   * measure, as the sheet paints the far paw hardly darker than the near one; the spec's plain darkening would turn
   * it grey (#EEE4D9). */
  farFur: furShade,
  /** The ears' tan under the fur's own warm shade (about #D79768), and under it twice (about #D58D5A): the sheet's
   * lower ear deepens to about #D89464. */
  earDeep: multiply(marking, furShadeBy),
  earDeeper: multiply(multiply(marking, furShadeBy), furShadeBy),
  /** The ear's lowest clumps, its deeper shade 8% darker: about #C48253 against the sheet's #C17D50. */
  earLow: darken(multiply(multiply(marking, furShadeBy), furShadeBy), 0.08),
  /** The ear's lowest clumps, browner: its deeper shade 30% of the way to the warm line, about #BA7D51 against the
   * sheet's #BC7847 to #C48359. */
  earFoot: mix(darken(multiply(multiply(marking, furShadeBy), furShadeBy), 0.08), mix(outline, mix(darken(multiply(marking, marking), 0.12), marking, 0.33), 0.4), 0.3),
  /** The crown's and the topknot's one light warm line: the outline 30% of the way to the cream, #B29379 against the
   * sheet's #B29576 on the crown. */
  crownLine: mix(outline, fur, 0.3),
  /** The outline warmed toward the ears' deep brown: the sheet's line round the haunches, the paws and under the
   * chin, #9F6D4A against the sheet's #A06D48 to #A36E4F there. */
  warmLine: mix(outline, mix(darken(multiply(marking, marking), 0.12), marking, 0.33), 0.4),
  /** The line under the paws' soles, the darkest of the outer lines, where the light is furthest: the warm line a
   * fifth of the way to the printed dark brown, #8B5E3F (L* 44) against the sheet's L* 37 to 51 under the paws
   * (#876144, #89644A, #9A7250 in front, #7F5338 to #855C3E in the turned views), whose soft line peaks lighter than
   * its core. */
  soleLine: mix(mix(outline, mix(darken(multiply(marking, marking), 0.12), marking, 0.33), 0.4), dark, 0.2),
  /** The faint line where one part lies over another (a leg over the haunch, a hind paw's top): the warm line
   * halfway to the fur's shade, #CEA889 against the sheet's #CCAB8C to #D6AE8B. */
  softLine: mix(mix(outline, mix(darken(multiply(marking, marking), 0.12), marking, 0.33), 0.4), furShade, 0.5),
  /** The lighter warm line round the cheeks' puffs: the outline warmed toward the tan (the sheet's #B17B4C there). */
  puffLine: mix(outline, marking, 0.3),
  /** The line the front turnaround draws where the head's side meets the ear: the ear's tan in its own deep shade
   * (the tan multiplied by itself, 12% darker), #A35C32 against the sheet's #9E5C2C. */
  earLine: darken(multiply(marking, marking), 0.12),
  /** The ears' outline: their deep tan a third of the way back to the tan, #B5734A against the sheet's #B57549. */
  earEdge: mix(darken(multiply(marking, marking), 0.12), marking, 0.33),
  /** A contact shadow under a paw: the ground shadow 8% darker. */
  contact: darken(need(printed, "shadow"), 0.08),
  collarLine: darken(collar, 0.25),
  /** The collar's dark rim: its blue 30% darker and a quarter of the way to the outline's brown, #647789 against the
   * sheet's #597C8F. */
  collarRim: mix(darken(collar, 0.3), outline, 0.25),
  /** The tag's edge: the outline's brown warmed toward the gold, as the sheet draws it, not a darker olive gold. */
  tagLine: mix(outline, tag, 0.35),
  /** The tag's rim: its gold 45% of the way to the printed dark brown, #A07C2D against the sheet's #A2782A. */
  tagRim: mix(tag, dark, 0.45),
  /** The embossed heart's edge: the gold a tenth of the way to the dark brown, #E2B53D against the sheet's #E7AE42. */
  tagEmboss: mix(tag, dark, 0.1),
  /** The tag's shade: its own gold at 40% multiplied in, toward orange as the sheet's gold darkens. */
  tagShadeBy: mix(light, tag, 0.4),
  tagShine: mix(tag, light, 0.6),
  eyeWhite: mix(fur, light, 0.75),
  /** The eye's rim and lash line, darker than the iris it rings: the pupils' near-black 35% darker, #150801 (L* 3)
   * against the turnaround's #140405 to #180804 (L* 2 to 4) round an iris of L* 5 to 8. */
  eyeRim: darken(eyeDark, 0.35),
  /** The warm light low in the iris: the printed iris brown a fifth of the way to the mouth's red and a tenth
   * toward the gold, #5F331A against the sheet's #5B3119. */
  irisWarm: mix(mix(dark, mouthInside, 0.2), tag, 0.1),
  /** The upper lip over the open mouth: the mouth's red a little over halfway to the near-black, #591710 against
   * the sheet's #581A0F. */
  lipLine: mix(mouthInside, eyeDark, 0.55),
  /** The nose's sheen: the printed dark brown 15% toward the light, #584437 against the hero's #594338. */
  noseSheen: mix(dark, light, 0.15),
  /** The lower iris's warm light near its foot: the iris's warm brown a tenth of the way to the light, #6F4731
   * against the turnaround's #694632 there. */
  irisLight: mix(mix(mix(dark, mouthInside, 0.2), tag, 0.1), light, 0.1),
  /** The mouth's inside in its own shade under the lip and in the corners: a quarter darker. */
  mouthDeep: darken(mouthInside, 0.25),
  /** The thin rim round the opening's sides: the mouth's inside halfway to the printed dark brown, #6C2417. */
  mouthRim: mix(mouthInside, dark, 0.5),
  /** The rim where the tongue meets the opening's foot: the tongue a third of the way to the printed dark brown,
   * #BB7362 against the sheet's #BA7766. */
  tongueRim: mix(tongue, dark, 0.33),
  tongueShine: mix(tongue, light, 0.5),
};

/** Stops evenly spaced along a chain of colours, each pair mixed channel by channel. */
const ladder = (stops: string[], n: number) => Array.from({ length: n }, (_, k) => {
  const t = (k / (n - 1)) * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(t));
  return mix(stops[i]!, stops[i + 1]!, t - i);
});

/**
 * The outer line by light and place (parts/lines.ts, DECISIONS 74, 79), each a ladder of 11 tones from lit (0)
 * through the side away from the light (0.5) to the darkest place (1), where a part meets the ground or tucks under
 * another:
 * - `cream`, round the cream fur: the warm line a third of the way to the cream where the light falls (#BF9A7E,
 *   L* 66, against the sheet's crown and topknot lines at their core, #B49880, #BC9A77, #BD9B80, #B19371, #C49A78,
 *   L* 60 to 67), 12% of the way where it turns away (about L* 56, against the sheet's 50 to 62 down the paws' and
 *   haunches' far sides), and the sole's line under the paws (#8B5E3F, L* 44, against the sheet's 37 to 51);
 * - `tan`, round the ears and where the line lies on the tan: the ears' outline where lit (#B57349, L* 55),
 *   halfway between the warm line and the ears' deep line away from the light (#A1653E, L* 49), and the deep line a
 *   fifth of the way to the printed dark brown where an ear lies on the body (#8E512C, L* 41), against the sheet's
 *   L* 46 to 54 round the ears and 45 where the side's ear meets the back.
 * Warm all through (hue 55 to 66, C* 18 to 44): no grey-taupe.
 */
export const LINES = {
  cream: ladder([mix(C.warmLine, fur, 0.33), mix(C.warmLine, fur, 0.12), C.soleLine], 11),
  tan: ladder([C.earEdge, mix(C.warmLine, C.earLine, 0.5), mix(C.earLine, dark, 0.2)], 11),
};

/** Every colour a dog part may paint. */
export const palette = [...new Set([...Object.values(C), ...LINES.cream, ...LINES.tan])];
