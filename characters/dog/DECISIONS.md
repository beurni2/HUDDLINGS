# The dog: decisions

Every choice where the dog's sheets disagree, say nothing or need reading, each with the crop that settled it (spec section 5b). Crops are in `ref/panels/<sheet>/`, overlays in `ref/overlays/`. The decisions already taken in spec section 5b (the priority between sheets, the pivots, the layer lists, the printed proportions, the shared collar and tag, the side views' facings, rule R3's faces) are not repeated here.

Status: **proposed**. The model, the marking map and these decisions are locked when the founder approves the look at Gate A (end of phase 3).

## Views and sides

**1. The turnaround's side view is `side.L` and its three-quarter view is `threeQuarter.L`.** Both face the sheet's left, so the dog has turned to its right and shows its left side (format README: `.L` and `.R` are the companion's own sides). The motion sheet's side poses face right and show the right side, as section 5b says.
Crops: `master.turnaround.side.png`, `master.turnaround.three-quarter.png`, `motion/motion.movement.walk.png`.

**2. The right-facing views are the left-facing ones mirrored.** The turnaround draws no `side.R` or `threeQuarter.R` at rest, so their silhouette and landmarks are those of `side.L` and `threeQuarter.L` mirrored: x negated, `.L` and `.R` swapped in every landmark name (the near eye of `side.R` is `eye.R`), `sheetLeft` and `sheetRight` swapped (`model.json`, `mirroredViews`). They show the right side's patches (section 5b: each facing shows its own side's markings), as the hero and the motion sheet's right-side poses draw them.
Crops: `master.hero.main.png`, `motion/motion.movement.walk.png`.

**3. The hero's head faces front but is rolled about 16° toward the dog's right shoulder** (the eye line rises 28 px over 95), and its body is turned a little to the sheet's right, so its tail shows on the sheet's left and its right flank is in view. It is evidence for the right side's markings, not an untilted front head.
Crop: `master.hero.main.png`.

**4. The rigging sheet names left and right as seen on the sheet**, not as the dog's own: its "Left ear (flipped)" is the ear on the sheet's left in a front view, the dog's right ear, and its pivot guide puts the "left" pivots on the sheet's left. Parts are named by the dog's own sides, from the turnaround.
Crops: `rigging/rigging.part.ear-left.png`, `rigging/rigging.pivot.guide.png`.

## Size and proportions

**5. Each view is scaled to the companion's 164 pt by its own height**, ground to the top of the head (section 5: "ears included"; here the tuft is highest). The sheet draws its views at slightly different sizes: the three-quarter view is 217 px tall against the front's and side's 211 and the back's 209, about 3% larger; its soles sit only about 1% lower, so a turn doesn't explain it. One scale would make the three-quarter dog 169 pt tall. Each view's scale is in `model.json` (`crops`, `ptPerCropPx`).
Crops: the four `master.turnaround.*.png`; numbers in `ref/measurements.json` (`heightPx`, `scale`).

**6. The head is 65.4% of the sitting height** (107 pt of 164), just above section 5's "about 60 to 65%"; the sheet's printed "Head ~2/3" agrees. It runs from the tuft's outer edge to the chin, the collar's top under the nose, where the chin's line meets the collar.
Overlay: `landmarks-front.png`.

**7. The head is 93 pt wide: the cheeks, between the ears' inner edges** (the green line on the overlay), where the cheek fur meets the ears' tan with no line between. The ears hang over the head's sides in every drawing, the rigging sheet's Head base included, so the head base's outline runs along the ears' inner edges; no crop shows a wider head. The eyes are 49% of that width apart, each eye 18% of the head's height tall, the eye line 60% of the way down the head.
Overlay: `landmarks-front.png`; crop `rigging/rigging.part.head-base.png`.

**8. The front view's head is rolled about 4° toward the dog's right shoulder**: its left eye sits 3.2 pt higher than its right, its left ear root 4.7 pt higher. The landmarks keep the sheet's numbers. Proposed for phase 3: draw the head's parts symmetric and give the front rest pose that small roll.
Overlay: `landmarks-front.png`.

## Landmarks

**9. The origin is the ground under the seat.** Section 5b puts the root on "the ground, under the body's centre" (L416) and the body bone at "the centre of the seat, where the body meets the ground" (L417), and Appendix F places the body bone straight above the root; so the root, and the point every landmark is measured from, is the ground under the seat. Facing or turned away, the seat is on the body's midline, the middle of the body below the collar. In the side and three-quarter views it is the middle of the haunch's underside, behind the hind paw, placed by hand, and a turned view without one fails the run: the body's centroid there lies over the hind paw, 15 to 21 pt ahead of the seat, even with the tail pulling it back.
Overlays: `landmarks-side.L.png`, `landmarks-threeQuarter.L.png` (`ground`).

**10. How each landmark is found** (each one's method is also in `ref/measurements.json`):
- eye centre: the centroid of the dark iris and pupil, catchlights filled;
- nose: the centroid of its dark blob, without the thin lines that join it to the mouth;
- mouth corners: the ends of the smile's line, at the tips of its little upturned curls; the profile shows only the back corner;
- ear root: the ear's highest tan point, where it comes out from behind the head; ear tip: its lowest point, the shaded lower half included, stopping at the ear's bottom line;
- collar: the blue band's centroid, and its two ends, named by the sheet's sides (`collar.line.sheetLeft`, `collar.line.sheetRight`), since `.L` and `.R` are the dog's own;
- tag: `tag.ring`, the top of the ring where it rests on the collar, from which the tag swings (section 5b); `tag.top`, the top of the gold heart, where it hangs from the ring;
- chin: the collar's top under the nose (front and three-quarter only);
- head top: the middle of the silhouette's top row (on the back view's two-lobed tuft, one lobe, not the gap);
- ground: the silhouette's lowest row, under the seat (9).
Each view must show its set (refmap/landmarks.json, `required`): section 5b's list, less what the view hides. The back shows no face, tag or paws; the profile shows one eye, one mouth corner and one ear; neither of those shows the far hind paw. A finder that comes back empty fails the run.
Overlays: `landmarks-*.png`.

**11. Placed by hand** (`refmap/landmarks.json`), with the rule for each:
- the paws, because the sheet draws no line between a paw and its leg: the centre of the paw's rounded end, midway between its side outlines and from the top of its toe lines to its sole. In the side and three-quarter views the hind paw is the round stub at the haunch's front (x 712 to 737 and 1148 to 1176 on the sheet); behind it the line along the ground is the haunch's underside. In the side view only the far front paw's toe end shows, ahead of the near one;
- the tag's ring, which the turnaround paints blue on the blue collar;
- the seat (9).
Overlays: `landmarks-front.png`, `landmarks-side.L.png`, `landmarks-threeQuarter.L.png`.

## Silhouettes

**12. The cut-outs follow the outline and leave out the card, the ground shadow and the motion marks.** The cream fur is nearly the card's colour and the outline fades at the tuft and the tail's curl, so the method (`refprep/silhouette.py`) fills from the border with the outline as the wall, then puts the edge on the outline with a watershed. Each of its steps is tested on the point of the dog's sheets it exists for (`refprep/test_refprep.py`). A few card pixels remain where the edge cuts straight across a narrow notch, each about 0.3% of the area or less (about 100 px at most): under the dog's right ear by the cheek in the front view, under the chin by the collar and under the ear's back corner in the side view, under the left ear from behind. No landmark sits there, and the silhouette check's thresholds (IoU 0.85 to 0.90) are far coarser; a rule that removed them leaked into the fur at the faded tuft.
Silhouettes: `ref/silhouettes/*.png`; overlays `landmarks-*.png` (the blue edge).

## The panels

**13. 116 panels** (34 on the master sheet, 27 rigging, 26 motion, 29 expressions), each mapped by one agent and checked by a second; every choice is in its panel's note in `refmap/panels.json`. A hand-drawn box is tightened to what is drawn in it, the soft ground shadow included, so an airborne pose keeps the shadow that is its only ground line (Jump, Run, the run cycle's Airborne).
Overlays: `panels-*.jpg`; crop `motion/motion.movement.jump.png`.

**14. Where two drawings interleave so that no pair of rectangles separates them, both stay whole** and a sliver of the neighbour stays in the crop: Excited and Laughing (a 3 × 5 px tip of a motion line), Lifted slightly and One ear perked (2 px of the other's ear), Walk and Run (14 px of a speed line), Happy bounce and Curious lean (2 px of an ear's outline). The masks that remove slivers, props, motion lines and labels (section 5b, the sheet match) are made when each crop is first compared: the face panels' records join `model.json` in phase 3, before Gate A, for the Faces check; the motion poses' in phase 4, for the Poses check, added to the locked model then.
Overlays: `panels-*.jpg`.

**15. The rigging sheet draws two paws above "Back paw (left)"** and one above "Back paw (right)"; all three are cropped, the left pair as `paw-back-left-1` and `-2`.
Crop: `rigging/rigging.part.paw-back-left-*.png`.

## Palette

**16. The palette is the sheet's printed values** (section 5, L189), with the collar's highlight `#A7C7E8` shared by all four (L189) and the outline sampled from the linework: `#91694A`, the mean of the outline's core in the four views.
Overlay: `palette.png`; crops `master.palette.*.png`.

**17. How the sheet's pixels compare with the printed values** (CIEDE2000, `ref/palette.json`):
- The swatches, as the JPEG holds them, are 1.5 to 4.6 from their printed values; three are over 3: Eyes / Nose 4.6, Gold Tag 3.9, Collar Blue 3.1. The printed values stay.
- In the drawn dog the fur (0.5 to 1.2), the ears' tan (2.8 to 2.9), the saddle (2.3 to 3.7 on the master sheet, 3.9 to 4.5 on the motion sheet's poses), the tail's root (2.2 to 2.8, 4.3 in the motion sheet's Stand; 6.8 where it shows pale inside the curl from behind), the tag (3.0 to 3.4) and the ground shadow (1.9 to 3.0) are at or near the printed values. The printed Soft Shadow is the ground shadow's colour. The collar's most common colour is its shaded lower half in the front view (6.3) and its lit band elsewhere (2.6 to 4.7). The printed Eyes / Nose brown is nearest the eye's lighter lower iris in the front view (2.8; 5.4 and 8.0 in the side and three-quarter views).
Overlays: `palette.png`, `palette-regions-*.png`, `markings-colours.png`; numbers in `ref/palette.json` and `ref/markings.json`.

**18. Where the sheet paints colours the printed palette lacks**, the dog is drawn in the values sampled on the front view (the view on Home, first in priority), held in `model.json` (`palettePainted`), each for its own region; the founder decided this on Oct 14, 2026 (`docs/QUESTIONS.md`, Q24):
- the pupils and the upper iris: near-black `#200C02`, 8.5 to 9.6 from the printed `#3A2314`. The nose is near-black too: 14.6 and 8.8 from `#3A2314` in the front and side views (4.2 in the three-quarter, which carries a large shine); `#200C02` matches the side's nose (0.4), and the front's is darker still (8.1);
- the head patches: a paler tan, `#F0BC92`, 6.3 to 7.7 from the printed `#D9A379` on every panel that shows them;
- the fur's soft shade: `#FDE3C8`, 6.2 to 7.5 from the printed Soft Shadow. The printed value is the fur × 0.91 in every channel, exactly section 5b's "the fill 8–12% darker" (L507); the sheet's shade is a warmer hue instead;
- the tongue: `#FB9A88`, 6.9 to 9.5 from the printed pink;
- the open mouth's inside: `#9E241A` in the front view, `#69190C` in the three-quarter (10.8 apart, one deep-red gradient sampled at two places); the sheet prints no value for it.
Overlays: `palette.png`, `palette-regions-front.png`, `markings-colours.png`.

**19. The blush is the printed pink at a level** (spec L474: the blush is a level from 0 to 100%, deepening with each stage and rising with touch). On the turnaround's cheeks it sits at 29 to 43%, 35% on average, which `model.json` records as its resting level at the Grown stage the sheets draw (L663); the hero shows it at 44 to 51%, the Blush cheeks close-up at 68%, and the rigging sheet's blush part is the pink itself. The levels of the Little and Growing stages belong to `rig.json`'s stages (phase 4). The palette check holds the blush part's colour to the printed pink and the rendered cheek's level to the turnaround's range at rest, 29 to 43% (`model.json`'s `blush`), and to each clip's level otherwise; the founder decided this on Oct 14, 2026 (`docs/QUESTIONS.md`, Q25).
Overlays: `palette-blush.png` (each cheek's box on its panel), `palette.png` (the blush row).

## Outline

**20. The outline is 1.54 pt wide** (2.0 px at the sheet's scale), within the spec's 1.2 to 1.8 pt: the width of the line darker than halfway between the fur and the line's core, area over centre line, in all four views.
Overlays: `landmarks-*.png`; numbers in `ref/measurements.json` (`outlinePx`).

**21. Inner lines are 0.75 pt, the middle of the spec's 0.6 to 0.9 pt**, because the sheet's are too faint to measure. Its toe lines, the clearest inner lines, measure 1.3 pt wide at half their depth but only 11 L* deep against the outline's 40; at the sheet's resolution that width is blur. They are also drawn lighter than the outline, which the parts follow (phase 3).
Overlay: `landmarks-front.png` (the paws); numbers in `ref/measurements.json` (`outlinePx`).

## Faces

**22. The expression sheet's Sleepy face assembly pairs the face with drooped ears.** Drooped ears for sorrow are never used (rule R3); the sleepy face uses the `lowered` ear state of section 5b, the neutral ear turned on its pivot, never the Both drooped drawing.
Crops: `expressions/expressions.assembly.sleepy.png`, `expressions/expressions.ears.both-drooped.png`.

## Markings (proposed, approved at Gate A)

**23. Six patches, each clipped to its part:**
- `head.patch.L` and `head.patch.R` on the head base: around each eye and down behind its outer side to the cheek, rising into that ear's root, which hides their upper edge, in the paler tan of 18. The front view and the hero show both.
- `back.patch.L` and `back.patch.R` on the back body: the two halves of a saddle over the back, just behind the collar. The left half lies high on the back and down to the top of the haunch (the side and three-quarter views, the motion sheet's Stand); the right half runs from the spine down the right flank toward the haunch, lower than the left (the front view, the hero), and reaches the topline at the rump in the motion sheet's right-side poses: sitting, the saddle runs down the sloping back to the haunch; standing, it lies along the level topline to the rump.
- `tail.base` on the tail: tan at its root; the curl stays cream.
- `rump.patch.L` on the back body: a small, soft spot where the tail's tan crosses the body's outline at the tail's root, fading paler away from the outline (2.7 to 4.5 from the printed tan), in the side and three-quarter views; no right-side panel shows one.
Each patch is coloured where it shows in `ref/overlays/markings-*.png`, from seed points in `refmap/markings.json`, and its colours are in `markings-colours.png`.

**24. How the views agree.** From behind, the saddle crosses the spine just behind the collar, its upper edge reaching as far to the dog's right as to its left; below that it lies left of the spine, and the tail's curl covers the rest. That fits a saddle whose right half runs down the flank, below what the back view sees, as the front view and the hero draw it.
Overlays: `markings-master.turnaround.back.png`, `markings-master.turnaround.front.png`, `markings-master.hero.main.png`, `markings-motion.movement.walk.png`.

**25. Not markings:** the tan brows are face parts (section 5b's dog features); the ears are their own parts; the warm tan between the front legs is the body's soft shade; and the warm band along each ear's inner edge in the back view is the ear's soft contact shadow on the head (section 5b: "soft contact shadows sit where parts overlap").
Crops: `master.turnaround.front.png`, `master.turnaround.back.png`, `master.hero.main.png`.

## Drawing the front view (phase 3)

**26. Parts are drawn in model space** (points at the 164 pt height, the ground under the seat at 0, 0, y down) and wrapped into their bones' spaces from the rig's rest pivots (`characters/draw/frame.ts`), so no anchor is typed by hand. The WebGL rest frame of the dog's still matches the resvg composite of the drawings (`characters/draw/test/webgl.test.ts`).

**27. The head's roll (8, revisited).** The head's parts are typed upright in the face's frame and rolled with it by the eyes' own roll, about 4°, so the eyes, ear roots, nose and mouth corners land on their landmarks. The roll lives in the drawing, not as a rest angle in the rig: a rest angle turns the head about the chin and swings the crown about 4 pt sideways off the sheet's. It fades out above the eyes, where the crown is level, and eases to 45% under the jaw, where the sheet's jaw lies nearly level over the collar (y −63.3 on the right and −64.5 on the left at x 31). Phase 4 decides whether the rest pose carries it as well.
Crop: `master.turnaround.front.png`.

**28. Where the turnaround is not symmetric, the drawing follows it:** the crown sits 1.8 pt higher to the right of the topknot; the head's left side comes in 2.4 pt between the ear's root and the cheek; the left ear hangs 2.8° further out and 3% longer, with its upper outer edge typed where the sheet draws it. Each rule is named in `characters/dog/src/views/front.ts`.
Crop: `master.turnaround.front.png`.

**29. The eyes:** tilted ovals, half-axes 8.8 × 9.5 pt inside their soft edge, a little taller than wide, their tops turned 20° toward the nose before the face's roll (an ellipse fitted to the sheet's dark eye has half-axes 9.3 × 9.8 and 9.1 × 10.0 pt, its top turned 20° and 26°; the render's, 9.1 × 9.8 pt); a dark rim whose upper lid thickens a little over the outer top corner; the near-black pupil and upper iris over a lower third that warms through the printed dark brown (held #3A2314) to a soft reddish-brown glow above the foot; the white a thin warm sliver low on the outer side, about 1.5 pt at its widest (8% of the eye's width, as the sheet's measures), tapering to nothing at both ends, crisp on its inner edge so it reads as the eye's white and not a reflection; and one catchlight high on the nose's side, as every sheet draws it (`QUESTIONS.md` Q26).
Crops: `master.turnaround.front.png`, `master.feature.large-glossy-eyes.png`, `master.hero.main.png`.

**30. Lines and derived colours.** Every colour is the printed palette, the painted one (18) or derived from them by a stated rule (`characters/dog/src/palette.ts` lists each with its rule and the sheet colour it was matched to). The outer line is 1.2 to 1.7 pt as drawn and changes with the light, as the sheet's does: lightest where it runs over fur toward the light (the crown's and topknot's line, #B29379, against the sheet's #B29576), the warm brown round the ears, haunches, cheeks and paws' sides, and darkest under the paws' soles, away from the light (`soleLine`, #81573A, against the sheet's #7B5330 to #835C3C); and broken where the sheet's fur breaks it.

**31. The blush part is drawn at 1.17 × the resting level,** so that the rendered cheek, blurred over the fur, fits at the resting level (0.34 and 0.35 on the two cheeks) by `palette.blush`'s own fit, the one that measured the sheet's.

**32. Fur and corners.** The crown's fur where it overhangs each ear's root is declared fur, as the sheet draws it, so the 4 pt corner rule (L510) does not round it away. The lint's only part exceptions are the collar's narrow ends, which tuck under the cheek fur, and the tag's point (`characters/dog/src/drawings.ts`).

**33. The chin's shadow on the collar is a cast shadow (done).** It was painted as the collar's own contact shade; spec L396 wants a cast shadow on the bone that casts it, clipped to the part it falls on, so it moves with the head. It is now its own part, `shadow.chin.collar`, on the head bone and clipped to the collar: the collar's dark rim right under the chin's fur and a soft shade of the band's blue under that, drawn right after the collar as the collar's clip group (a clip group is contiguous and comes after its mask, `characters/format/README.md`), before the tag. The chin's shade on the shoulders is `shadow.chin`, on the head bone and clipped to the chest.
Crop: `master.turnaround.front.png`.

**34. The saddle seen from the front runs up to the shoulders,** where the sheet paints tan beside the front legs. Its area is 1.2 (right) and 1.4 (left) times phase 2's patches, because phase 2's patch finder did not join that tan to the haunch patches. The marking check holds each patch's place both ways (its centroid inside the sheet's patch and the sheet's inside it), and passes.
Crops: `master.turnaround.front.png`, overlay `markings-master.turnaround.front.png`.
