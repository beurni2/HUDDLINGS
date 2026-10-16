// The ground shadow, one recipe for every view (DECISIONS 218, replacing 45's tight shadow): a wide soft ellipse in
// the palette's soft-shadow colour, reaching past both haunches and the tail as the sheet paints it, darkest under
// the paws where they press, its edge soft all round with no hard line at the ground. As the turnaround paints it,
// the ellipse lies on the ground seen a little from above, so its middle sits about 6.5 pt above the ground line,
// mostly behind the dog's feet, and shows beside them. It stays its own part (`shadow`), so the sheet match's
// silhouette still leaves it out. Each view sizes it from its own crop.
import { join, type Piece } from "../../../draw/svg.ts";
import { soft } from "../../../draw/paint.ts";
import { C } from "../palette.ts";

export interface GroundShadow {
  /** How far it reaches along the ground, from one end to the other, past both haunches and the tail: [x, x]. */
  reach: [number, number];
  /** Where each paw or haunch presses on the ground: its middle and half its width. The shadow is darkest under them. */
  presses: { x: number; half: number }[];
  /** How far its middle lies above the ground line, in points (6.5 by default, the turnaround's front and side). */
  lift?: number;
  /** Its half-height, in points (8 by default: the turnaround's shadows run from about 12 pt above the ground to 2 below, beside the dog and under it). */
  depth?: number;
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const oval = (cx: number, cy: number, rx: number, ry: number) => `M${r3(cx - rx)} ${r3(cy)} a${r3(rx)} ${r3(ry)} 0 1 0 ${r3(2 * rx)} 0 a${r3(rx)} ${r3(ry)} 0 1 0 ${r3(-2 * rx)} 0Z`;
/**
 * A fuller oval (a superellipse of power 3) as a polygon: the turnaround's shadow keeps most of its height out to its
 * ends (6 pt tall 1 pt from its end beside the front's hind paw), where an ellipse narrows to a point.
 */
const fuller = (cx: number, cy: number, rx: number, ry: number) => {
  const pts = Array.from({ length: 72 }, (_, k) => {
    const a = (k / 72) * 2 * Math.PI, c = Math.cos(a), s = Math.sin(a);
    return `${r3(cx + rx * Math.sign(c) * Math.abs(c) ** (2 / 3))} ${r3(cy + ry * Math.sign(s) * Math.abs(s) ** (2 / 3))}`;
  });
  return `M${pts.join("L")}Z`;
};

/** The ground shadow, as one piece: the broad soft oval, a denser band along the ground under the dog, and the contacts where it presses. */
export function groundShadow(g: GroundShadow): Piece {
  const [x0, x1] = g.reach, lift = g.lift ?? 6.5, depth = g.depth ?? 8;
  const cx = (x0 + x1) / 2, rx = (x1 - x0) / 2;
  // Its edge soft all round over about 4 pt, as the sheet's, its core the full soft-shadow colour (the sheet's shadow
  // lies about 20/255 under its card, the printed soft shadow 21 under it); drawn inside its reach by the blur, which
  // carries it out to it.
  const sd = 1.6, inset = sd;
  const broad = soft(fuller(cx, -lift, rx - inset, depth - inset), [x0 + inset, -lift - depth + inset, 2 * (rx - inset), 2 * (depth - inset)], C.shadow, sd);
  const band = soft(oval(cx, -0.6, rx * 0.7, 2.2), [cx - rx * 0.7, -2.8, rx * 1.4, 4.4], C.shadow, 1.4, 0.6);
  const presses = g.presses.map(({ x, half }) => soft(oval(x, -0.2, half * 1.1, 1.5), [x - half * 1.1, -1.7, half * 2.2, 3], C.contact, 1, 0.55));
  return join(broad, band, ...presses);
}
