# The dog: decisions

Every choice where the dog's sheets disagree, say nothing or need reading, each with the crop that settled it (spec section 5b). Crops are in `ref/panels/<sheet>/`, overlays in `ref/overlays/`. The decisions already taken in spec section 5b (the priority between sheets, the pivots, the layer lists, the printed proportions, the shared collar and tag, the side views' facings, rule R3's faces) are not repeated here.

Status: **proposed**. The model, the marking map and these decisions are locked when the founder approves the look at Gate A (end of phase 3).

## Views and sides

**1. The turnaround's side view is `side.L` and its three-quarter view is `threeQuarter.L`.** Both face the sheet's left, so the dog has turned to its right and shows its left side (format README: `.L` and `.R` are the companion's own sides). The motion sheet's side poses face right and show the right side, as section 5b says; between them the sheets show both sides.
Crops: `master.turnaround.side.png`, `master.turnaround.three-quarter.png`, `motion/motion.movement.walk.png`.

**2. The hero's head faces front, but its body is turned a little to the sheet's right**, so its tail shows on the sheet's left and the dog's right flank is in view. It is the evidence for the right side's markings, with the motion sheet's side poses.
Crop: `master.hero.main.png`.

**3. The rigging sheet names left and right as seen on the sheet**, not as the dog's own: its "Left ear (flipped)" is the ear on the sheet's left in a front view, the dog's right ear, and its pivot guide puts the "left" pivots on the sheet's left. Parts are named by the dog's own sides, from the turnaround, and the rigging labels are read as sheet sides.
Crops: `rigging/rigging.part.ear-left.png`, `rigging/rigging.pivot.guide.png`.

## Size and proportions

**4. Each view is scaled to the companion's 164 pt by its own height**, ground to the top of the head (spec section 5: "ears included"; here the tuft is highest). The sheet draws its views at slightly different sizes: the three-quarter view is 217 px tall against the front's and side's 211 and the back's 209, about 3% larger, which no real turn explains. A single scale would make the three-quarter dog 169 pt tall. Each view's scale is in `model.json` (`crops`).
Crops: the four `master.turnaround.*.png`; numbers in `ref/measurements.json` (`heightPx`, `scale`).

**5. The head is 65.4% of the sitting height** (107 pt of 164): from the top of the tuft to the chin, where the chin overlaps the collar, in the front view. The sheet's printed "Head ~2/3" agrees; section 5 asks for 60 to 65%, and the dog sits at the top of that range.
Crop: `master.turnaround.front.png`; overlay `landmarks-front.png`.

**6. The head's width is 86 pt: the cheeks, between the ears' inner outlines,** in the front view (the green line on the overlay). The ears hang over the skull's sides in every view, so its full width never shows; the rigging sheet's Head base shows the whole head for drawing it (phase 3). The eyes are 53% of that width apart, each eye 18% of the head's height tall, the eye line 60% of the way down the head.
Overlay: `landmarks-front.png`.

**7. The front view's head is rolled about 4° toward the dog's right shoulder**: its left eye sits 3.2 pt higher than its right, its left ear root 4.7 pt higher. The landmarks keep the sheet's numbers. Proposed for phase 3: draw the head's parts symmetric and give the front rest pose that small roll, so the drawing matches the sheet without baking a tilt into the parts.
Overlay: `landmarks-front.png`.

## Landmarks

**8. How each landmark is found** (each one's method is also in `ref/measurements.json`):
- eye centre: the centroid of the dark iris and pupil, catchlights filled;
- nose: the centroid of its dark blob, without the thin lines that join it to the mouth;
- mouth corners: the ends of the smile's line, at the tips of its little upturned curls; the profile shows only the back corner;
- ear root: the ear's highest tan point, where it comes out from behind the head; ear tip: its lowest point, the shaded lower half included;
- collar: the blue band's centroid, and its two ends, named by the sheet's sides (`collar.line.sheetLeft`, `collar.line.sheetRight`) since `.L` and `.R` are the dog's own;
- tag ring: the top of the gold tag; chin: the collar's top under the nose (front and three-quarter only);
- ground: the lowest row of the silhouette, under the centre of the body below the collar; every landmark is measured from it, y down.
Overlays: `landmarks-*.png`.

**9. The paws are placed by hand** (`refmap/landmarks.json`), because the sheet draws no line between a paw and its leg: each point is the centre of the paw's rounded end, midway between its side outlines and from the top of its toe lines to its sole. The back view draws no paws: the haunches and the tail sit on the ground. The side and three-quarter views show three, the far hind paw hidden; in the side view only the far front paw's toe end shows, ahead of the near one, and its point is the centre of what shows.
Overlays: `landmarks-front.png`, `landmarks-side.L.png`, `landmarks-threeQuarter.L.png`.

## Silhouettes

**10. The cut-outs follow the outline and leave out the card, the ground shadow and the motion marks.** The cream fur is nearly the card's colour and the outline fades at the tuft and the tail's curl, so the method (in `refprep/silhouette.py`) fills from the border with the outline as the wall, then puts the edge on the outline with a watershed. Each of its steps is tested on the point of the dog's sheets it exists for, from the tuft to the warm shadow beside the front paws (`refprep/test_refprep.py`).
Silhouettes: `ref/silhouettes/*.png`; overlays `landmarks-*.png` (the blue edge).

## Palette

**11. The palette is the sheet's printed values** (section 5b), with the collar's highlight `#A7C7E8` shared by all four and the outline sampled from the linework: `#91694A`, the mean of the outline's core in the four views.

**12. What the sheet's pixels say about those values** (CIEDE2000, `ref/palette.json`; overlay `palette.png`):
- The swatches themselves, as the JPEG holds them, are 1.5 to 4.6 from their printed values; three are over 3: Eyes / Nose 4.6, Gold Tag 3.9, Collar Blue 3.1. The printed values stay.
- In the drawn dog, the fur (0.5 to 1.2), the tan (2.8 to 2.9), the ground shadow (1.9 to 3.0) and the tag (3.0 to 3.4) are at or near the printed values in every view. The collar's most common colour is its shaded lower half in the front view (6.3) and its lit band elsewhere (2.6 to 4.7): the one soft shade the spec allows.
- **The eyes and nose are painted near-black, `#200C02`, 8 to 10 from the printed `#3A2314`,** which shows only low in the iris. Open for Gate A (`docs/QUESTIONS.md`, Q24).
- **The blush is a faint wash**: at its reddest, `#FFDED0`, 12 from the printed `#F7B3A6`. That is the printed pink laid over the fur at 34% opacity. Open for Gate A (Q25).
Crops: `master.palette.*.png`; overlays `palette.png`, `palette-regions-*.png`.

## Outline

**13. The outline is 1.54 pt wide** (2.0 px at the sheet's scale), within the spec's 1.2 to 1.8 pt: the width of the line darker than halfway between the fur and the line's core, area over centre line, in all four views.

**14. Inner lines are 0.75 pt, the middle of the spec's 0.6 to 0.9 pt**, because the sheet's are too faint to measure. Its toe lines, the clearest inner lines, measure 1.3 pt wide at half their depth but only 11 L* deep against the outline's 40; at the sheet's resolution that width is blur. They are also drawn lighter than the outline, which the parts follow (phase 3).
Overlay: `landmarks-front.png` (the paws); numbers in `ref/measurements.json` (`outlinePx`).

## Markings (proposed, approved at Gate A)

**15. Five patches, all tan `#D9A379`, each clipped to its part:**
- `head.patch.L` and `head.patch.R` on the head base: around each eye, rising into that ear's root, which hides their upper edge. The front view and the hero show both.
- `back.patch.L` on the back body: the left half of a saddle, high on the back behind the collar, down to the top of the haunch (the side and three-quarter views, the motion sheet's Stand, and a little at the front view's edge).
- `back.patch.R` on the back body: the right half, from behind the collar diagonally down the flank toward the haunch, larger than the left (the hero and the motion sheet's side poses, and at the front view's edge).
- `tail.base` on the tail: tan at its root; the curl stays cream.
Each patch is coloured where it shows in `ref/overlays/markings-*.png`, from seed points in `refmap/markings.json`.

**16. Where the sheets disagree on the markings:** from behind, the saddle shows as one patch a little to the dog's left, curving into the tail's root, and the right half does not show, while the front view and the hero clearly show it on the right flank. Following the priority (the turnaround, then the hero), both halves stay, and the right half sits low on the flank, out of the back view's sight.
Overlays: `markings-master.turnaround.back.png`, `markings-master.turnaround.front.png`, `markings-master.hero.main.png`.

**17. Not markings:** the tan brows are face parts (section 5b's dog features), the ears are their own parts, and the warm tan between the front legs is the body's soft shade, not a patch.
Crops: `master.turnaround.front.png`, `master.hero.main.png`.

## The panels

**18. 116 panels** (34 on the master sheet, 27 rigging, 26 motion, 29 expressions), each mapped by one agent and checked by a second; every choice is in its panel's note in `refmap/panels.json`. Where two drawings interleave so that no pair of rectangles separates them, both drawings stay whole and a sliver of the neighbour stays in the crop, to be masked when that crop is compared: Excited and Laughing (a 3 × 5 px tip of a motion line), Lifted slightly and One ear perked (2 px of the other's ear), Walk and Run (14 px of a speed line), Happy bounce and Curious lean (2 px of an ear's outline).
Overlays: `panels-*.jpg`.

**19. The rigging sheet draws two paws above "Back paw (left)"** and one above "Back paw (right)"; all three are cropped, the left pair as `paw-back-left-1` and `-2`.
Crop: `rigging/rigging.part.paw-back-left-*.png`.

**20. The expression sheet's Sleepy face assembly pairs the face with drooped ears.** Drooped ears for sorrow are never used (rule R3); the sleepy face uses the `lowered` ear state of section 5b, the neutral ear turned on its pivot, never the Both drooped drawing.
Crops: `expressions/expressions.assembly.sleepy.png`, `expressions/expressions.ears.both-drooped.png`.
