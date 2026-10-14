# Master sheets

These 16 sheets define how Huddlings' four companions look and move. They are concept art made with an image generator (spec rule R8): never ship them, never slice them into the app, and never ship an automatic trace of them. The companions are drawn as parts in code from them (spec sections 5 and 5b).

| Folder | Companion | Sheets |
| --- | --- | --- |
| `dog/` | cream puppy with tan droplet ears | `master.jpg`, `rigging.jpg`, `motion.jpg`, `expressions.jpg` |
| `kitty/` | cream kitten with caramel patches | `master.jpg`, `rigging.jpg`, `motion.jpg`, `expressions.jpg` |
| `rabbit/` | cream lop-eared bunny | `master.jpg`, `rigging.jpg`, `motion.jpg`, `expressions.jpg` |
| `bear/` | light-brown plush teddy | `master.jpg`, `rigging.jpg`, `motion.jpg`, `expressions.jpg` |

Every sheet is a 1280 × 960 JPEG except `rabbit/master.jpg` (1280 × 853).

## What each sheet holds

- `master.jpg`: the hero illustration; the turnaround (front, side, back, three-quarter); proportions; the colour palette; key features; the simple shape breakdown; a row of expressions.
- `rigging.jpg`: the exploded parts; the pivot guide (the sheets call it a skeleton); a draw order; animation rules; do and avoid.
- `motion.jpg`: key poses (idle and breathing, blink, head tilt left and right, ear twitch or the bear's paw wave, sit, stand); side-view movement poses (walk, run, jump, soft landing, curious lean, happy bounce, envelope carry); a four-frame walk cycle; a four-frame run cycle; animator notes.
- `expressions.jpg`: ten expressions; eye states; mouth states; ear positions; face assemblies.

## When sheets disagree

The turnaround on `master.jpg` wins, then the hero, then the rigging parts, then the motion poses, then the expression panels. The known contradictions (the pivot dots, the layer lists, the markings, the printed proportions, the collar and tag colours, the bear's mouth and walk, the side views' facings) are already decided in spec section 5b. Record anything new in the species' `DECISIONS.md`, with the crop that settled it.

## Never used

The Sad (teary), Angry and Pout faces, and drooped ears for sorrow. Rule R3: Mochi acts out feelings for fun but never suffers. The acted faces the scenes need (the huff in Grumpy, the hungry eyes in Hungry) are new drawings the founder approves at a gate.

## Palette

The canonical values are in spec section 5 (Palettes). The dog and rabbit sheets print their values; the kitty and bear values are sampled from their swatches and confirmed at Gate A; one shared collar `#7DB7E8` and one shared heart tag `#F4C542` for all four, the founder confirming them at the dog's Gate A.

## Leave this folder as it is

Crops, cut-outs and measurements go in `characters/<species>/ref/`, never here.
