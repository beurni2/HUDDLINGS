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

## Drawing the three-quarter view (phase 3)

**35. The three-quarter view is drawn from its own crop, at its own scale, upright.** Every node of `characters/dog/src/views/threeQuarter.ts` is typed in model space (26) from the three-quarter turnaround at its own scale (5), the root on the ground under the seat (9); the paint is the front view's, recipe for recipe. The sheet tilts this head toward its far side (the far eye 9.4 pt higher than the near one) as part of the drawing, so the face is typed as drawn, with no face frame and no roll (unlike 27).
Crop: `master.turnaround.three-quarter.png`; overlay `landmarks-threeQuarter.L.png`.

**36. Its pivots follow the front's rules (26, rig.json's front pivots) from its own landmarks.** The head, the neck and the collar turn at the centre of the head's lower edge: across, the collar's centre (x −47.9), since this view's chin landmark sits under the turned nose at the front of the neck, not under its middle; down, at the chin (y −59.7). The chest sits under it, halfway up to the chin. The hips sit as high above the hind paw's centre as that is above the ground; one hind paw shows, so y −13.6 (the front's −21.8 doubles the mean of two). The ears turn 3 pt inside the head from their roots, toward its middle; the eyes, the brows, the mouth, the tuft, the tag and the legs by the front's rules. The tail turns at its root, 3 pt inside the haunch at the middle of the tail's foot (11.9, −23), on the tail and hidden under the haunch. The far hind leg is hidden and draws nothing.
Crop: `master.turnaround.three-quarter.png`; overlay `landmarks-threeQuarter.L.png`.

**37. The draw order is the crop's:** ground shadow, tail and its tan root, back body with the saddle's near half and the rump spot, the near hind paw, the far front leg, the chest and the jaw's shadow on it, the collar, the tag, then the head (the far ear and the head's shadow on it, the near ear and the head's shadow on it, the head base, the patches, the near blush, the eyes, the brows, the nose, the mouth, head.line, the tuft), and last the near front leg. The ears and the tail lie behind the head and the body (L298); the near front paw lies in front of the chest (L298); the far front leg sits behind the chest, its paw showing below it (L369). The near ear hangs over the back and the collar's near end, as the sheet draws it.
Crop: `master.turnaround.three-quarter.png`.

**38. This facing shows the five markings phase 2 sighted on the crop, each an overlay clipped to its part** (L395): the near head patch, a hood over the near eye that runs down behind it to the cheek and up into the near ear's root; the far head patch, a narrower hood over the far eye's outer top, along the face's far side; the saddle's near half, a streak down the sloping back from under the near ear; the rump spot where the tail's tan crosses the haunch; and the tail's tan root. The saddle's far half and the far cheek's blush are not drawn: the crop shows neither, and phase 2 found only the near cheek's blush box on it (`refmap/palette.json`). The blush is drawn as in the front view (31).
Crop: `master.turnaround.three-quarter.png`; overlay `markings-master.turnaround.three-quarter.png`.

**39. The near ear comes out from under the crown 21 pt wide.** The crown's fur overhangs the near ear's whole root; the face's near side leaves the overhang in a concave corner at x −19.8 and curves in over the ear to x −12.4 by the eye and out again to the cheek, where the sheet draws its line (x −9.8 to −11.3 from y −115 to −100, −14.4 to −15.9 below). The near hood then matches the sheet's patch (area 0.97 of it, centroids 0.2 pt apart).
Crop: `master.turnaround.three-quarter.png`.

**40. How far each turning part runs under its cover (L394) is measured along the part's own axis.** The tail's root and the far leg's top tuck under the body at their ends; in this view each ear joins the head along its inner side, so what keeps a turn from opening a gap is how far along its length it runs on under the head. The test (`characters/dog/test/threeQuarter.test.ts`) holds each to at least 15% of its length: the near ear runs 86% of its 83 pt under the head, the far ear 92% of 69 pt, the far leg 92% of 45 pt under the chest, the tail 32% of 49 pt under the haunch. Each hidden end is rounded. Swept to their limits (ears ±14°, tail ±25°, head ±12°, tag ±20°, legs ±20°), the joins show no gap; at −20° the far front leg's hidden top passes the chest's front edge, since its outer side is the silhouette there (phase 4's sweeps).

**41. The far front leg is 6.2% darker than the near one, kept warm** (L369): the fur 86% of the way to its own warm shade (`palette.ts`, `farFur`, #FDE5CC): its channels 6.2% darker on average, its luma 5.3%, the lightest L369 allows, against the spec's plain darkening, which turns grey (#EEE4D9; Q27). It eases in from the fur over 11 pt from where it comes out from under the chest, so the join shows no edge, and takes no rim of shade down its front, only a soft shade down its inner side in the slot beside the near leg. The sheet itself paints the far paw no darker than the near (#FEF3E3 against #FEF4E3, and #FCF0E1 against #FEF2E1 mid-leg), and the reviewers read the first pass's 8.5%, with its rim, as a tan sock: L369's floor is followed, no further.
Crop: `master.turnaround.three-quarter.png`.

**42. The eyes as this crop draws them:** the near eye a nearly round oval 20 × 20 pt, the far eye 12.8 × 18 pt turned 15° toward the nose; each iris near-black above a lower band in the printed dark brown, with a red-brown light across the band's upper part and five faint streaks rising from its foot toward the pupil, the band's foot keeping the printed brown the palette holds (`lowerIris`); a thin sliver of light inside the rim up the whole outer side, widest low down, white on the far eye and a softer grey on the near one (the eye's white at 0.7), as the sheet paints them; one catchlight each, high on the nose's side (Q26's default).
Crop: `master.turnaround.three-quarter.png`.

**43. Each paw's centre is the middle of its rounded end:** midway between its sides and between the wrist, where its round begins, and its sole: the near front paw at (−44.7, −8.7), from its front (x −59.1) to its heel (−30.2); the far one at (−71.2, −11.6), from its toe end to where it goes behind the near paw; the near hind paw at (−18.4, −9.1), from its toe end (−26.8) to where its back end begins to fade into the haunch (−10). They lie 1.9, 1.0 and 2.6 pt from phase 2's hand-placed points. The toe lines rise from the scallops of each sole toward the turned paw's front, where the sheet draws them (the near front paw's at x −54.4 and −46.8, the hind paw's at −22.7 and −16.2).
Crop: `master.turnaround.three-quarter.png`; overlay `landmarks-threeQuarter.L.png`.

**44. Cast shadows belong to their caster** (L396): the jaw's shadow on the chest is `shadow.chin`'s three-quarter drawing (on the head bone, clipped to the chest), and the head's shadow on each ear, where it goes under the face and, on the near ear, under the crown's overhang, is `shadow.head.L` and `.R` (on the head bone, clipped to the ear), painted in the ear's tan under the fur's warm shade. The front view still paints the head's shadow on the ears into the ears.

**45. The ground shadow is as tight as the sheet's:** a long soft oval from under the far paw to under the tail, gone 2 to 3 pt below the ground line as the sheet's is, at 0.85, so the silhouette's cut, which leaves the shadow out, ends at the paws.
Crop: `master.turnaround.three-quarter.png`.

**46. Line colours read off the crop:** the face's seams over each ear in the ear's deep tan, lighter toward the root (the sheet's #995727 and #9F582C); the crown, the chest's front edge and the tail's curl in the crown's light warm line (#B69778, #B89778, #BC9E7C on the sheet); the far cheek's line in the cheeks' lighter puff line, since the ears' line there reads as ear tan to phase 2's ear finder; the soles in the paws' grey-brown line; the back and the haunch in the outline's brown (#86512F to #835F3D on the sheet).
Crop: `master.turnaround.three-quarter.png`.

**47. The legs are short and plump and end in bun paws wider than the leg, as this crop draws them.** The near front leg swells at a wrist (a kink at y −15.8) into a round paw that bulges forward 5 pt past the leg; its back edge is lined only round the paw's heel and fades out before the thigh, so no line runs from the collar to the ground. The thigh is its own round arc of fur line from mid-flank (−15.4, −33) down to the hind paw's crown, faint at its top, and the near hind paw is a bun tucked in front of the haunch with its own line over its crown and two toe lines, its back end feathered into the haunch. The chest's lower edge is the sheet's long diagonal from under the tag (x −69.5) into the slot between the legs, where the flank lies in a warm shade (kept lighter than the marking tan, L* 86 and up, so it reads as shade).
Crop: `master.turnaround.three-quarter.png`.

**48. The tail is a plume of fur lobes, not a balloon.** It comes out narrow from behind the haunch and its tip curls over toward the head in a hook tucked into a notch on its inner edge; from the hook over the top and down the far side it is five lobes of uneven size, each tucked under the next at a concave notch where its line breaks and runs on into a short flick, as the sheet draws them; its foot breaks into a small fringe. Its tan root (`tail.base`) rises from deep at the foot in long flames split by streaks of cream, the tallest to y −40, its edge sharper (σ 0.55 pt) than the first pass's soft blot.
Crop: `master.turnaround.three-quarter.png`.

**49. The back and rump patches are clear patches in the ears' tan.** The saddle's near half is the sheet's patch on the upper back behind the near ear, its top the back's line from x −9 to 10 and its lower edge a round sweep to y −40 breaking into small locks along its lower left; the rump patch an upright oval at the haunch's back edge from y −34.6 to −14. Each is clipped to the back body with σ 0.8 to 1 pt edges; the upper back under the line stays out of the shade, so the line does not read as a shaded patch.
Crop: `master.turnaround.three-quarter.png`; overlay `markings-master.turnaround.three-quarter.png`.

**50. The mouth is the sheet's round U with a broad tongue.** The opening hangs from the lip in a U with a full round foot 15.7 pt below the lip's corners; the pink tongue fills it from wall to wall to just under the lip, with a lighter middle and a faint groove; the dark red shows as a band under the lip, deepest into the far corner, and a rim down the sides. The red stays the painted `mouthInside` (#9E241A, dominant ΔE 1.2), which the palette check holds; a reviewer's softer rose red (rgb 157, 62, 51) would need a new painted value in `model.json`, which phase 2 owns. The philtrum is short and curved; the nose is a rounded trapezoid 11.5 pt across reaching further toward the near side, its edge a little soft (σ 0.22, the eyes' own).
Crop: `master.turnaround.three-quarter.png`.

**51. The near blush is a broad oval along the cheek,** 16.8 × 8.4 pt under the near eye's outer side and turned 8° with the cheek, at rest level 0.40 (Q25), its centre inside phase 2's blush box.
Crop: `master.turnaround.three-quarter.png`; `refmap/palette.json`.

**52. The topknot is an upright sprig, and the crown's cream hangs over the near ear's root.** The topknot's side lobes are petals that point out to their tips and are drawn back under themselves along their lower edges, the middle lobe stands tall and curls in at its right foot, its line breaks at each notch where a strand runs down into the crown, and its shade is only a thin rim, so it reads as fur standing up rather than a cap. Under the overhang the crown's cream comes down over the near ear's root on a diagonal in three soft rounded locks, its edge feathered over the root's tan (σ 0.8), where the first pass drew a flat shelf over a dark strip.
Crop: `master.turnaround.three-quarter.png`.

**53. Each ear's lower edge is a row of locks tucked under one another.** The far ear's lower edge is three layered locks, the outer one lowest, and the near ear's four rounded locks of uneven size, each at a concave notch where the ear's line breaks and a darker parting runs down into it; the ears are lighter at the root in the head patches' paler tan. The far ear deepens from higher up than the near one and takes the head's shadow more strongly along the face (0.8 against 0.5); deepening it further moves the ears' dominant tan more than 3.0 from the printed one, which the palette check holds, so it stays a little lighter than the sheet's far ear (L* 64 to 75 against 59 to 70 at the same points).
Crop: `master.turnaround.three-quarter.png`.

**54. The head patches as this crop paints them:** the near hood arches over the eye and is parted from the band up the face's side by a wedge of the crown's cream that comes down to a point at (−20.2, −106.2); the far patch is a small hood over the far eye's top with a narrow band up the face's far side to the ear's root, the face below and beside it cream. Their edges are crisper (σ 0.55 and 0.6) than the first pass's airbrush.
Crop: `master.turnaround.three-quarter.png`; overlay `markings-master.turnaround.three-quarter.png`.

**55. The far cheek is a round puff out to the sheet's edge,** bulging to x −100.4 over the far ear, its edge in five soft clumps of uneven size with the cheeks' lighter line; the chin hangs over the collar in six uneven tufts with only a soft blue shade under them (the front's dark rim under the chin read as a lace edge here); the chest's front edge runs out to the sheet's line in fuller locks under the collar's end, with a few faint fur strokes down its far side.
Crop: `master.turnaround.three-quarter.png`.

**56. The tag hangs a little turned from a small round ring:** the heart is turned 6° about its top, its point toward the far side, as the sheet draws it, from a 3.2 × 6.6 pt rounded ring in the collar's light blue; its inner heart is raised, lit along its upper left and only faintly edged. The advisory part IoUs for the tag (0.67), the collar (0.71) and the ears (0.72, 0.77) stay under 0.85 because phase 2's finders take the gold, blue and tan classes, which leave out each part's own rim line and ring and join the head patches' tan to the ears; the parts' outlines lie on the sheet's (`compare.png`).
Crop: `master.turnaround.three-quarter.png`.
