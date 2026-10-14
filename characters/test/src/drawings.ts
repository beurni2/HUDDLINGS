// The test character's parts: plain shapes, never shipped. Each risky runtime
// feature is easy to see in a frame: the banded tail shows its bend, the
// stripe and the eyes show the clip to the head, the ears and the tag swing on
// springs, the paws swap draw order, and every part has a front and a side view.
// Every drawing is in its bone's own space (points, y down), with the bone's
// pivot at (0, 0): the face sits on the head bone, whose pivot is at the neck.
import type { Drawing } from "../../build/atlas.ts";

const OUTLINE = "#6B4A35";
const STROKE = 1.5;
export const COLOURS = {
  fur: "#FFF4E8",
  shade: "#E8DED4",
  tan: "#D9A379",
  dark: "#3A2314",
  pink: "#F7B3A6",
  collar: "#7DB7E8",
  tag: "#F4C542",
  shadow: "#000000",
};

/** A drawing whose pivot is at (0, 0) of its own space; bounds are in points around the pivot. */
function part(region: string, bounds: [number, number, number, number], body: string): Drawing {
  const [x, y, w, h] = bounds;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${x} ${y} ${w} ${h}">` +
    `<g stroke="${OUTLINE}" stroke-width="${STROKE}" stroke-linejoin="round">${body}</g></svg>`;
  return { region, svg, anchor: [-x, -y] };
}

const ellipse = (cx: number, cy: number, rx: number, ry: number, fill: string, extra = "") =>
  `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}" ${extra}/>`;
const circle = (cx: number, cy: number, r: number, fill: string, extra = "") => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" ${extra}/>`;

function tail(region: string, far: boolean): Drawing {
  // 14 × 60 pt, pivot at the bottom centre, five bands so a bend reads at a glance.
  const bands = [0, 1, 2, 3, 4]
    .map((i) => `<rect x="-7" y="${-60 + i * 12}" width="14" height="12" fill="${i % 2 ? COLOURS.fur : COLOURS.tan}" stroke="none"/>`)
    .join("");
  const tint = far ? `<rect x="-7" y="-60" width="14" height="60" fill="#000" fill-opacity="0.08" stroke="none"/>` : "";
  return part(region, [-9, -62, 18, 64], `<clipPath id="t"><rect x="-7" y="-60" width="14" height="60" rx="7"/></clipPath>` +
    `<g clip-path="url(#t)">${bands}${tint}</g><rect x="-7" y="-60" width="14" height="60" rx="7" fill="none"/>`);
}

function eye(region: string, state: "open" | "closed", cx: number, cy: number): Drawing {
  if (state === "closed") {
    return part(region, [cx - 10, cy - 6, 20, 10], `<path d="M ${cx - 7} ${cy} Q ${cx} ${cy + 4} ${cx + 7} ${cy}" fill="none" stroke-width="2" stroke="${COLOURS.dark}"/>`);
  }
  return part(region, [cx - 10, cy - 10, 20, 20], circle(cx, cy, 7, COLOURS.dark, `stroke="none"`) + circle(cx - 2.5, cy - 2.5, 2.4, "#FFFFFF", `stroke="none"`));
}

/** Every region the test character uses, front and side (facing right). */
export function drawings(): Drawing[] {
  return [
    // Ground shadow: soft, on the root.
    part("shadow/front", [-50, -9, 100, 18], ellipse(0, 0, 46, 7, COLOURS.shadow, `fill-opacity="0.18" stroke="none"`)),
    part("shadow/side.R", [-60, -9, 124, 18], ellipse(6, 0, 56, 7, COLOURS.shadow, `fill-opacity="0.18" stroke="none"`)),
    // Body, pivot at the seat.
    part("body/front", [-46, -70, 92, 74], ellipse(0, -32, 44, 34, COLOURS.fur) + ellipse(-14, -18, 18, 10, COLOURS.shade, `stroke="none"`)),
    part("body/side.R", [-50, -66, 112, 70], ellipse(6, -30, 54, 32, COLOURS.fur) + ellipse(-24, -34, 16, 12, COLOURS.tan, `stroke="none"`)),
    // Tail, bent by its chain.
    tail("tail/front", false),
    tail("tail/side.R", true),
    // Paws.
    part("paw.L/front", [-14, -11, 28, 22], ellipse(0, 0, 12, 9, COLOURS.fur)),
    part("paw.R/front", [-14, -11, 28, 22], ellipse(0, 0, 12, 9, COLOURS.fur)),
    part("paw.L/side.R", [-14, -11, 28, 22], ellipse(0, 0, 12, 9, "#EDE3D8")),
    part("paw.R/side.R", [-14, -11, 28, 22], ellipse(0, 0, 12, 9, COLOURS.fur)),
    // Collar and the tag that swings from its ring.
    part("collar/front", [-30, -6, 60, 12], `<rect x="-28" y="-4" width="56" height="8" rx="4" fill="${COLOURS.collar}"/>`),
    part("collar/side.R", [-26, -6, 52, 12], `<rect x="-24" y="-4" width="48" height="8" rx="4" fill="${COLOURS.collar}"/>`),
    part("tag/front", [-9, -2, 18, 20], circle(0, 1, 1.6, COLOURS.tag) + circle(0, 9, 7, COLOURS.tag)),
    part("tag/side.R", [-9, -2, 18, 20], circle(0, 1, 1.6, COLOURS.tag) + circle(0, 9, 6, COLOURS.tag)),
    // Ears hang from their roots.
    part("ear.L/front", [-15, -3, 30, 52], ellipse(0, 22, 13, 24, COLOURS.tan)),
    part("ear.R/front", [-15, -3, 30, 52], ellipse(0, 22, 13, 24, COLOURS.tan)),
    part("ear.L/side.R", [-15, -3, 30, 52], ellipse(0, 22, 12, 23, "#C99168")),
    part("ear.R/side.R", [-15, -3, 30, 52], ellipse(0, 22, 13, 24, COLOURS.tan)),
    // Head base, pivot at the neck.
    part("head.base/front", [-48, -94, 96, 96], circle(0, -46, 46, COLOURS.fur)),
    part("head.base/side.R", [-46, -92, 100, 94], circle(6, -45, 44, COLOURS.fur)),
    // The stripe and the face are clipped to the head base.
    part("head.marking/front", [-64, -88, 128, 14], `<rect x="-62" y="-86" width="124" height="10" fill="${COLOURS.pink}" stroke="none"/>`),
    part("head.marking/side.R", [-64, -88, 128, 14], `<rect x="-62" y="-86" width="124" height="10" fill="${COLOURS.pink}" stroke="none"/>`),
    // .L is the companion's left: on the viewer's right in the front view.
    eye("eye.L/front:open", "open", 18, -50),
    eye("eye.L/front:closed", "closed", 18, -50),
    eye("eye.R/front:open", "open", -18, -50),
    eye("eye.R/front:closed", "closed", -18, -50),
    eye("eye.R/side.R:open", "open", 28, -50),
    eye("eye.R/side.R:closed", "closed", 28, -50),
    part("nose/front", [-7, -41, 14, 10], ellipse(0, -36, 5, 3.5, COLOURS.dark, `stroke="none"`)),
    part("nose/side.R", [37, -44, 14, 10], ellipse(44, -39, 4.5, 3.5, COLOURS.dark, `stroke="none"`)),
  ];
}
