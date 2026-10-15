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

**29. The eyes:** tilted ovals 9.3 × 9.6 pt, their tops turned 30° toward the nose before the face's roll (an ellipse fitted to the sheet's dark eye reads 9.5 × 10.0 pt, turned 26° and 29°); a dark rim, the near-black pupil and upper iris, a lower iris warmed toward its rim within its held #3A2314, a white crescent low on the outer side, and one catchlight high on the nose's side, as every sheet draws it (`QUESTIONS.md` Q26).
Crops: `master.turnaround.front.png`, `master.feature.large-glossy-eyes.png`, `master.hero.main.png`.

**30. Lines and derived colours.** Every colour is the printed palette, the painted one (18) or derived from them by a stated rule (`characters/dog/src/palette.ts` lists each with its rule and the sheet colour it was matched to). The outer line is 1.2 to 1.7 pt as drawn, lighter where it runs over fur (the crown's and topknot's line, #B29379, against the sheet's #B29576), warmer round the ears, haunches and paws, and broken where the sheet's fur breaks it.

**31. The blush part is drawn at 1.17 × the resting level,** so that the rendered cheek, blurred over the fur, fits at the resting level (0.34 and 0.35 on the two cheeks) by `palette.blush`'s own fit, the one that measured the sheet's.

**32. Fur and corners.** The crown's fur where it overhangs each ear's root is declared fur, as the sheet draws it, so the 4 pt corner rule (L510) does not round it away. The lint's only part exceptions are the collar's narrow ends, which tuck under the cheek fur, and the tag's point (`characters/dog/src/drawings.ts`).

**33. Known gap: the chin's shadow on the collar** is painted as the collar's own contact shade. Spec L396 wants a cast shadow on the bone that casts it, clipped to the part it falls on, so it moves with the head. That needs a new part (the chin's shadow on the head bone, clipped to the collar) and is done before Gate A. The chin's shade on the shoulders is already such a part.

**34. The saddle seen from the front runs up to the shoulders,** where the sheet paints tan beside the front legs. Its area is 1.4 (right) and 2.0 (left) times phase 2's patches, because phase 2's patch finder did not join that tan to the haunch patches. The marking check holds each patch's place both ways (its centroid inside the sheet's patch and the sheet's inside it), and passes.
Crops: `master.turnaround.front.png`, overlay `markings-master.turnaround.front.png`.

## Drawing the side view (phase 3)

**35. The side view is drawn once, facing the sheet's left (`side.L`, 1),** every node typed from its own crop in model space and wrapped into the bones from the rig's side pivots (26). Where a part is the same thing turned (the ear, the eye, the nose, the collar, the tag, the paws), it is painted by the front's recipe in the front's colours; `side.R` is the mirror (2) and is not drawn here.
Crop: `master.turnaround.side.png`.

**36. The side's pivots follow the front's rules from the side's landmarks.** The root and the body sit on the ground under the seat, the middle of the haunch's underside (9). The hips are as high above the hind paw's centre as that is above the ground (−12.4). The profile has no chin (10), and the head's lower edge rests on the collar, so the neck, the head and the collar turn at the collar band's centroid (−41.5, −57), and the chest's centre is straight below it, halfway down (−28.5). The tag swings from its ring, the eye turns at its landmark, the brow sits a quarter of the head's height above it, the mouth under the nose, the tuft 15% of the head's height below the head's top. The ear turns at its root moved 3 pt into the head: down, under the crown's fur it comes out from, where the front moves it 3 pt in toward the midline.
Overlay: `landmarks-side.L.png`; `characters/dog/test/side.test.ts` holds each rule.

**37. The tail turns at its root on the rump** (spec: "every tail turns at its root"). From the front the root hides behind the hips and shares their pivot; in profile it shows, so its pivot is the middle of the tail's base where it leaves the rump's outline (the tail's tan crosses the outline from y −10 to −35), about 4 pt inside the rump: (15, −23).
Crop: `master.turnaround.side.png` (the rump and the tail's tan root).

**38. Both front legs turn at the near shoulder,** straight above the near paw at the chest's height (−47.4, −28.5); the hind leg at the hip, straight above its paw (−20.2, −12.4). The front's rule (each leg straight above its own paw) puts the far shoulder at x −67.6, about 3 pt in front of the chest's edge, in the air, so the far leg's top would swing out from behind the chest as it turns. In profile the shoulders lie one behind the other; the far paw sits ahead and higher because the far leg reaches forward, so the far leg is drawn running back up behind the chest to the shared shoulder.
Crop: `master.turnaround.side.png` (the far leg shows only as a wedge in front of the chest's edge, from the tag's foot down).

**39. The side's draw order, read off the crop (L298):** the ground shadow; the tail and its tan root (the rump's line crosses over the tail's tan); the far front leg (it shows only in front of the chest's edge); the chest; the back and haunch with the saddle and the rump's spot (the haunch's front arc is drawn over the chest's fur); the hind paw and the near front leg in front of both; the collar; the tag (over the legs' tops); then the head: its base, patch, blush, eye, brow, nose and smile, its line, the near ear (over the head's side, its top under the crown's fur) and the topknot. The profile hides the far eye, ear, brow, cheek and hind paw, which are not drawn; if phase 4's gaits need the far hind paw, it is drawn then.
Crop: `master.turnaround.side.png`.

**40. The paws' points are measured on the drawing as phase 2 measured them on the sheet** (11, `refmap/landmarks.json`): the near front paw from its toe end on over the belly's shade to the hind paw's toe (phase 2's box for it, x 669 to 711, runs on to the hind paw) and from its toe lines' top to its sole, (−47.8, −5.4), 1.7 pt from phase 2's (−47.4, −7.0); the far front paw at the centre of what shows of it, (−69.9, −12.5); the hind paw from its toe end to where its top line fades and from its toe lines' top to its sole, (−21.4, −5.25). Measured on the paw alone (its toe end to its heel), the near paw's point would sit 2.5 pt further forward, at x −50.2.
Crops: `master.turnaround.side.png` (the paws, zoomed), overlay `landmarks-side.L.png`.

**41. The far front leg is 7.1% darker than the near one, and warm** (spec L369): its fill is the fur under its own warm shade and a quarter of that shade again, `#FDDFC1` (`palette.ts`, `farFur`), never the plain darkening, which turns grey (`#EBE0D5`). That fill is the colour the crop paints the far leg's wedge (#FFDDBC to #FFDEC0), so the wedge takes no shade but right under the tag and along its rim away from the light. The crop's far paw itself is only about 3% darker than its near paw (#FFF4E2 against #FEF4E2), and a reviewer asked for it near-cream; the spec's 6 to 10% wins, and the paw's one soft highlight, from the top left on its dome, brings it to about #FEE7D0, so it reads as cream under the shaded wedge without leaving the rule.
Crop: `master.turnaround.side.png` (the far front leg and paw).

**42. The near side of the body is one light group** (the back and haunch, the chest, the near front leg, the hind paw), so where they join there is no rim, as on the sheet, where the chest, the near leg and the haunch melt into one another with no line down the leg: the crop's near leg has no line on its back (a reviewer read the round 1 drawing's long strokes there as pillars), only the chest's short edge over the far leg, from the tag's foot to the wrist; the thigh's front, one round arc that sweeps from the hind paw's top up and back under the saddle (x −28.8 at y −14.6 to −20.4 at −35.6), strongest at its foot and fading upward, with a soft band of the chest's shade in front of it; and the hind paw's top, arching up from its toe end into the thigh and fading along it. The lines take the side crop's own colours, each from the palette's derived lines (30): the topline in the warm line (the sheet's #9C673F to #A86C47 at its core); round the rump the ears' deep warm brown, where the crop's line runs more orange beside the tail's tan (#A8622E to #AB673A; `earLine`); the jaw and the chin in the lighter fur line (#A9876C); the paws' line round their toe ends deepening to a new sole line where they meet the ground (`soleLine`, the outline 30% of the way to the printed dark, #775439 against the crop's #795535 under the hind paw and #795030 at the near paw's toe end, the crop's darkest line); and the chest's edge over the far leg from the paws' line at the wrist to the soft line at the tag's foot.
Crop: `master.turnaround.side.png`.

**43. The head in profile.** The nose at the snout's tip, a near-black egg (8 by 10 pt) whose front is the head's edge: the nose is clipped to the head (rig.json), so the head's edge runs round the nose's front and a line in the nose's own near-black covers the clip's hard edge; there is no rim of any other colour (round 1 drew that line in the outline's brown by mistake, which reviewers read as a socket; `side.test.ts` holds it). The bridge's line starts just above the nose's top, as the crop's does. The lip and the closed smile are one line, as the crop draws them: down the upper lip's front from the nose's foot (an outer line on the head's edge) and turning in at the lip's notch into the smile (an inner line), which ends in a small upturned curl at the corner (mouth.L); both are the printed dark brown seen through 90% of itself, the crop's grey-brown (#705F4F to #584B45 at its core, against the round 1 smile's near-black); the chin's line starts again just below the notch. The jaw's line lies where the crop draws it (x −70 at y −63.8), 1.6 pt above round 1's. The side's still sets the mouth's `smile` state; the side's other mouth and eye states come with the face library.
Crops: `master.turnaround.side.png` (the muzzle, zoomed).

**44. The crown and the topknot in profile:** one continuous line in the cheeks' puff line (`puffLine`, #A77A58 against the crop's #AC835F), warmer than the front's crown line, from the bridge's brown up the forehead, over two forehead locks and the topknot's three (a low one combed forward, the tall domed middle one, the head's top, whose front curls in on itself, and a lower one at the back), down the back of the head past a last small lock to the ear's top; tapered only at its two ends, and where it passes from the head's line to the topknot's, at a notch, under the topknot. Under each lock's tip a hair stroke in the same line hooks back along its underside, the crop's "<" under each lock. Round 1's crown line was the faint fluff line, broken into short strokes, which every reviewer read as a bald head.
Crop: `master.turnaround.side.png` (the crown, zoomed).

**45. The eye in profile:** a tall oval iris (11.2 by 21 pt) where the crop's dark oval measures (x −73.4 to −62, y −110.8 to −89.7), leaning 6° back at its top; near-black over its upper half and glowing smoothly into the printed lower iris's dark brown and, at its foot, the iris's warm brown, with no step, inside a slightly darker rim; the lid line on the iris's top, heaviest along the top and the back corner and tapering down the back; the white a thin crescent between them, under the lid's soft shade at its top (the printed soft shadow, the crop's #E7DAD1 there) and cooling at its narrow foot into the collar's pale blue; a pale halo round the iris's foot and outside the lid, where the patch's tan stops short of the eye; one pure white catchlight where the crop's sits (x −68.3, y −104.3). Reviewers asked for a second, small catchlight; the side crop shows one, so Q26's default (one, as the sheet draws it) stands. The blush is the front's soft ellipse at its level (0.34), as broad and faint as the crop's (its pink reaches from x −68 to −53 and peaks at x −59, y −85.5): centred at (−60, −84.6), 14.8 by 7.8 pt before its blur.
Crops: `master.turnaround.side.png` (the eye, zoomed), `master.feature.large-glossy-eyes.png`.

**46. The ear in profile hangs over the head's side,** narrower and rounder at the top than a flat dome, its top feathered under the crown's fur in a row of small soft points of fur, with no line; its line in the ears' deep warm brown (`earLine`, the crop's #A15E33) down its front from y −121, where the crop's starts, and round its foot and up its back in the warm line, the browner brown the crop draws there (#936242 to #9C603C); its foot in four soft, wavy clumps with short partings (a small one low on its back, the broadest under its middle, hanging lowest where the crop's does, and a smaller one at its front); matte, with no light streak along its fold (round 1's read as gloss), only the fold's soft darker crease (the crop's #A76640) where it turns over the back of the head, and a few short, uneven darker strands low on it, where the crop paints them.
Crop: `master.turnaround.side.png` (the ear, zoomed).

**47. The markings this facing shows** (`ref/markings.json`, the side crop), soft but defined, never airbrushed: the head patch as a hood over the eye with a notch of cream between it and the ear's front, rising along the ear's front and running on under it, its lower edge slanting from the eye's foot to the ear, deepening a little toward the ear, the blush and the cheek below it cream; the saddle on the back, its front end below the topline just behind the ear's foot, lying along the topline from x 0 to above the rump, its lower edge breaking into uneven locks combed back, with a few darker strands following the back's curve; the tail's tan root reaching highest at the rump and running back in streaks combed out along the fur, with a few darker streaks in it, deepest by the rump; the rump's spot distinct where the tail's tan crosses the outline, paling only a little inward. The darker strands are drawn through each marking's own soft edge, so they never show past it. Areas against phase 2's patches: head 1.33 (phase 2's patch for this sighting is clipped at x −35.7, short of the ear's front edge), saddle 1.11, rump 1.32, tail root 1.26 (down from 1.54 in round 1); the crop's tan in the tail runs on further along the plume's foot than phase 2's patch, which the drawing does not follow, so the marking check's centroids stay inside each other's patches.
Crops: `master.turnaround.side.png`, overlay `markings-master.turnaround.side.png`.

**48. The collar and the tag in profile.** The band is almost as thick at its back as at its front (10 pt under the chin, 7 pt by the ear, where round 1's tapered to a blade); its top edge rises under the jaw to the ear's foot, its bottom edge rises steeply behind the shoulder so its back end goes up square under the ear's foot, and its front end is a darker round turn where the band wraps round the throat, as the crop paints it (#628FB9 against the band's #7DB7E8). The tag is a round coin of a heart (12.4 by 14.4 pt), the dip between its lobes shallow and its foot blunt, a deeper orange-gold down its left side where the turned coin's edge shows, the smaller heart embossed as a soft line with a lighter face, hanging right under the band from a small gold ring. The tag must own its pivot, the ring's top on the band (tag.ring, rig.json, and the landmark test), so the strap there is drawn in the band's darker blue, the front turn itself at rest. A reviewer saw the crop's tag tilted 10 to 15°; on the crop its lobes and its foot lean opposite ways, which reads as a coin seen a little turned, not a tilt, so it is drawn upright and turned.
Crop: `master.turnaround.side.png` (the collar and tag, zoomed).

**49. Toe lines as the side crop draws them:** two on the far front paw, three on the near front paw (the third the faintest) and three on the hind paw, each a short curve rising from the sole at the paw's front and following its dome (the crop's paws, contrast-stretched); the spec's two or three. Each paw is a round bun: its top arches up into the leg or the thigh, its front is domed.
Crop: `master.turnaround.side.png` (the paws, zoomed).

**50. Known gap, as the front's (33): the cast shadows.** The chin's contact on the collar is painted as the collar's own contact shade; the shade under the ear's foot on the back as the back's own shade under an overhang; and the ear's shade down the cheek along its front, where the crop paints it deepest under the ear's foot (#F8CAA6), as the head's own shade under the ear's overhang, one shade level (#FDE3C8). Spec L396 wants each as a part on the casting bone clipped to the part it falls on, which needs new parts in the rig. Reviewers also asked for a few cheek wisps over the collar's top edge behind the jaw; at the crop's resolution it shows at most one faint light streak there, and drawn as locks they read as a lace edge, so none are drawn. The cream is the printed fur (#FFF4E8), held by the palette check, where a reviewer read the crop's cream a little warmer (#FEF4E2 in places).
Crop: `master.turnaround.side.png`.
