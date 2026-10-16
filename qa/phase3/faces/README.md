# The face library in front: evidence

## What the Faces check held

`node runtime-web/lab/look.ts dog --faces` with the full Faces check (`characters/sheetmatch/facematch.py`): each held
feature by its place and its shape, each face held on its own head, every preset against one primary panel
(`characters/dog/DECISIONS.md` 107 to 119). It writes each preset's `match.json` and `beside.png` here.

All 19 presets pass; no threshold was moved. The 17 the sheets draw pass on their primary panels, by their drawings
(DECISIONS 141 to 149); hungry and huffy are new drawings no panel shows (DECISIONS 150 to 157), judged by eye with
their heads held:

| Preset | Primary | Held anchors (pt off, gate 2.8) | Shapes (area ratio / IoU) |
| --- | --- | --- | --- |
| neutral | master Happy | eyes 1.08, 1.2 | eyes x0.99/0.90, x1.01/0.89 |
| happy | master Happy | eyes 1.08, 1.2; mouth 1.62, 1.4 | eyes x0.99/0.90, x1.01/0.89; mouth x0.71/0.71 |
| excited | master Excited | eyes 0.55, 0.21; mouth 1.46, 0.88 | eyes x1.04/0.87, x1.03/0.89; mouth x0.91/0.83 |
| laughing | master Laughing | eyes 0.46, 0.2; mouth 1.64, 1.24 | eyes x0.98/0.85, x0.97/0.90; mouth x0.91/0.90 |
| curious | master Curious (turned) | eyes' spacing 0.91 | eyes x1.07/0.88, x0.85/0.83 |
| surprised | expression Surprised | eyes 0.91, 1.57; mouth 1.36, 0.78 | eyes x1.04/0.82, x1.05/0.82; mouth x0.99/0.90 |
| shy | expression Shy (turned) | eyes' spacing 1.6 | eyes x1.06/0.85, x0.89/0.85 |
| proud | master Content | eyes 0.97, 1.2; mouth 0.5, 1.15 | eyes x1.12/0.87, x1.05/0.89; mouth x0.64/0.58 |
| mischievous | master Cheeky | eyes 0.74, 0.19; mouth 1.67, 2.2 | eyes x1.01/0.88, x1.07/0.85; mouth x0.75/0.74 |
| content | master Content | eyes 0.97, 1.2; mouth 0.5, 1.15 | eyes x1.12/0.87, x1.05/0.89; mouth x0.64/0.58 |
| sleepy | master Sleepy (turned) | eyes' spacing 2.05 | eyes x0.97/0.83, x0.93/0.87 |
| listening | Lifted slightly | nothing (judged by eye) | none |
| tender | master Content | mouth 0.5, 1.15 | mouth x0.64/0.58 |
| singing | master Laughing | eyes 0.46, 0.19 | eyes x0.98/0.85, x0.97/0.90 |
| blissful | master Content | eyes 0.97, 1.2; mouth 0.5, 1.15 | eyes x1.12/0.87, x1.05/0.89; mouth x0.64/0.58 |
| ticklish | master Laughing | mouth 1.64, 1.24 (its squeeze judged by eye, `eyes.png`) | mouth x0.91/0.90 |
| sly | master Cheeky | eyes 0.74, 0.19; mouth 1.67, 2.2 | eyes x1.01/0.88, x1.07/0.85; mouth x0.75/0.74 |
| hungry | none (new drawing) | nothing (judged by eye) | none |
| huffy | none (new drawing) | nothing (judged by eye) | none |

Every face holds its head (the nose 0.65 to 0.68 pt off, the eyes' middle 2.0 pt at most, on sleepy; hungry 0.65 and
0.89 pt, huffy 0.66 and 1.32 pt).

## The blush's levels

Every view's blush is drawn at the reference level, the reddest tenth of each cheek the full printed pink, so a part
alpha of 1 is 100% (the fit reads 0.999 to 1 at alpha 1) and the spec's whole range is drawable; the parts rest at
alpha 0.35 (DECISIONS 145, 160). Fitted by `characters/sheetmatch/match.py`'s own blush fit: the five blushing rest
views 0.349 to 0.351 (the resting level 0.35), shy 0.8 and 0.801 (asked 0.8), blissful 0.692 and 0.693 (asked 0.7),
huffy 0.349 and 0.35 (the resting level: the table names none for it, DECISIONS 161).

## The new faces, for Gate A

`new/sheet.png` (phone size) sets each beside the panels it borrows from, labelled "new drawing", with Q2's eyes as
the founder chose them beside the kitty's and the bear's panels, labelled "not on the dog sheet", and the squeeze in
the outline's warm brown, labelled "not taken" (DECISIONS 202). Variant A of each ships;
variant B, the huffy peek back, huffy flushed to 60%, tender's softer options and the warm brown squeeze live only in a
scratch package `new/new.ts` builds.

- Hungry, meant to feel eager and sweet ("ooh, a treat"): the wide eye with its pupil larger, the irises meeting on
  the food just in front of the nose, raised brows, lifted ears, the o, then the lick (the smile with the tongue's
  tip at its corner). It reads so at phone size; the look never goes up at the viewer, so it does not plead. A ships
  over B (eyes straight out, the tongue out over the o's foot), whose tongue under the o reads as a drip or a blep
  and whose straight eyes read as Surprised.
- Huffy, meant to feel like a playful little huff that will melt in a second: flat shut lids, cheeks puffed round a
  small pressed mouth, brows and ears at rest, the blush at its resting level (flushed to 60% for the founder to
  choose, DECISIONS 161); then the peek back, one eye open, bright and looking back level, with a tiny smile
  (DECISIONS 159). It reads as a mock huff, not cross: no slant, no frown, no pout. A (the puff inside the outline)
  ships over B (the head itself puffed 4.4 pt at each cheek): at phone size the two read alike, and A keeps the
  turnaround's silhouette and adds no head drawings to the atlas. Its glance away is phase 4's head turn.
- Tender (not a new face, but the last review's weakest read): the sleepy half-lid the table gives it reads deadpan at
  phone size, as the sheet's own half-lid panel does. It ships so; the sheet shows a softer lid, arched up over the
  iris with a thinner lash, and the crescents with a 50% blush beside it, for the founder (DECISIONS 162).

## Seventeen presets, sixteen faces

One pair draws the same still: mischievous and sly, told apart by sly's glance aside after the wink (phase 4).
Ticklish now squeezes its eyes shut, `>` `<` (Q2, DECISIONS 202), where laughing keeps its crescents. Content and blissful now differ by blissful's blush
at 70%.

## Read by eye

Every face reads as its panel. The lifted ears stand out above the crown as Lifted slightly draws them, so listening
now reads as listening; on excited, surprised, proud and singing they change the silhouette more than those panels
do, whose ears hang (the table lifts them). Under a raised ear the temple is the head's own side, cream with the
hood's band coming up it, as the panels paint it, and it stays put as the ear's spring swings the flap to its limits
(DECISIONS 158; `states.png`'s last four). Shy reads as blushing; its gaze down and tilt are phase 4's. Curious reads
alert more than inquisitive without its tilt and glance up. Tender's half-lid reads drowsy more than warm (its options are in
`new/sheet.png`). Nothing reads as sad, angry or drooped.

## The founder's eye decisions (Q2, Q26, Q28)

`eyes.png` (phone size) sets the squeeze beside the kitty's and the bear's Excited, the star sparkle beside their
Sparkle eyes, the open eye's two catchlights beside their Default eyes and the dog's own open eye panel, and the
catchlights riding the iris (peek, huffy's peek back, hungry's eager eye) and tucked under the half-lid, in the front,
the three-quarter and the profile (DECISIONS 200 to 206). At phone size the squeeze reads as the sister sheets' bold
`> <`, the star in the eye as the bear's, the gold stars beside it as both sheets' (plump, the larger five-pointed),
and the tiny catchlight as a second glint below the first.

## Files

- `eyes.png`: the eye decisions, from `node qa/phase3/faces/eyes.ts build/stills/dog/eyes` (after the build) and the
  Faces check's stills, then
  `python3 qa/phase3/faces/eyes.py build/stills/dog/eyes build/stills/dog/faces qa/phase3/faces/eyes.png`.

- `new/sheet.png`: the new faces and Q2's eyes for review, from `node qa/phase3/faces/new/new.ts build/stills/dog/new`
  (a scratch package that never ships; DECISIONS 150), then
  `python3 qa/phase3/faces/new/sheet.py build/stills/dog/new qa/phase3/faces/new/sheet.png`.
- `sheet.png`: the 17 presets the sheets draw, each beside its primary panel (model.json's) at the panel's scale, labelled.
  Each cell is the panel's frame grown across and up to hold the whole render (a raised ear, the stars), the panel
  padded with white. `python3 qa/phase3/faces/sheet.py build/stills/dog/faces qa/phase3/faces/sheet.png`.
- `<preset>/beside.png` and `match.json`: the Faces check on each face clip's still, made by
  `node runtime-web/lab/look.ts dog --faces`.
- `states.png`: the states no preset's still shows (peek, the yawn, the pant, the wink and the perked ear on the dog's
  right, a lifted ear beside a perked one, raised brows over the wide eyes, the half-lid, the sparkle as proud's
  second beat, its own gold stars in place of the head's, huffy's peek back, hungry's o with its eager eyes), and the lifted and the
  perked ears turned to the ear springs' limits, 14° out and in, behind a head that stays whole (DECISIONS 158).
  `node qa/phase3/faces/states.ts build/stills/dog/states`, then
  `python3 qa/phase3/faces/sheet.py states build/stills/dog/states qa/phase3/faces/states.png`.
- `perked.png`: One ear perked levelled and scaled by its brows, the two half and half, and the render (DECISIONS 133,
  147: no crease in the temple). `python3 qa/phase3/faces/perked.py build/stills/dog/faces/curious qa/phase3/faces/perked.png`.
- `lifted.png`: Neutral and Lifted slightly laid on the rest front and on listening by the head, the two half and half,
  and the render (DECISIONS 146); `--grid` draws the placement guide the lifted ear's nodes were read off.
  `python3 qa/phase3/faces/lifted.py build/stills/dog/front build/stills/dog/faces/listening qa/phase3/faces/lifted.png`.
- `brows.json` and `brows.png`: the sheets' brows measured by `brows.py`, the tilt the R3 brow guard holds to
  (DECISIONS 131).
- `r3-plants.txt`: the R3 guards (`characters/dog/test/faces.test.ts`) run on a copy of the committed tree with a fault
  planted in the source each time (an open mouth's lip ends bent below its centre, the neutral brow's inner end below
  its outer, shy's ear turned 12° in, listening's lifted ear turned 12° out, curious without its temple's head line;
  huffy's pressed mouth with its ends bent below its centre, its shut lids slanted inner end down, its left brow
  raised, its left ear turned 7° in, and the puffed cheeks keyed on happy; mischievous winking the right eye,
  listening keying no temple, the temple drawn into the lifted ear again, hungry's eye rolled up and the peek back
  looking up as it was; the squeeze's arms steepened into a scowl, the peek's catchlights left where the open eye has
  them, and the tiny catchlight grown to 0.6 of the large one), then with none; each fails, and none fails with the plants taken out. `python3 qa/phase3/faces/plants.py qa/phase3/faces/r3-plants.txt`.
- `atlas.json`: the atlas page shares before and after the face states, with round 2's, with the new faces, and after
  the review's fixes (DECISIONS 139, 147, 157, 158).
