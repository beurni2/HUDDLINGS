# The face library in front: evidence

## What the Faces check held

Re-run after the merge with the full Faces check (`characters/sheetmatch/facematch.py`): each held feature by its
place and its shape, each face held on its own head, every preset against one primary panel (`characters/dog/DECISIONS.md`
107 to 119). `node runtime-web/lab/look.ts dog --faces` writes each preset's `match.json` and `beside.png` here.

- Pass (6): neutral, happy, surprised, curious and shy (their panels turn the head, so the eyes are held by their
  spacing and shapes: Q27), listening (nothing held: judged by eye, its head held).
- Fail (11), each on a measured difference the next round redraws:
  - laughing, singing, ticklish: eye.L's crescent is a thinner band than the sheet's (shape).
  - content, tender, blissful, proud: the smile's left end is short and its outline differs from Content's.
  - excited: both mouth corners; the panel's open mouth is wider than the rest mouth.
  - mischievous, sly: the wink is on the right eye, where Cheeky closes the left.
  - sleepy: the closed arcs' shape against the master Sleepy panel.
  - The head gate reads 2.33 pt for the crescent faces' eyes, inside its 2.8 pt limit.

## Seventeen presets, fourteen faces

Three pairs draw the same still: laughing and ticklish, mischievous and sly, content and blissful. What tells each
pair apart is timing or a level not keyed yet: ticklish's bounce, sly's glance aside after the wink, blissful's closed
eyes opening to the crescents (phase 4), and blissful's blush at 70% (next round). Shy differs from neutral only by its
ears turned 3° in, since its blush at 80% and its gaze down are not keyed yet.

## Read by eye

Neutral, happy, laughing, surprised, content, sleepy, proud and singing read as their panels. Curious reads alert more
than inquisitive: it has the perked ear and raised brows but no head tilt (phase 4). Excited reads close to happy: its
open mouth is narrower than the panel's and its ears turn only 10° out. Listening does not read as lifted: a turn about
the root cannot raise the ear as Lifted slightly does (DECISIONS 132). Shy reads as neutral, and tender's half-lid reads
a little deadpan at phone size. Nothing reads as sad, angry or drooped.

## Files

- `sheet.png`: the 17 presets drawn now, each beside its primary panel at the panel's scale, labelled. Each cell is
  the panel's frame grown across and up to hold the whole render (the perked ear, the stars), the panel padded with
  white. `python3 qa/phase3/faces/sheet.py build/stills/dog/faces qa/phase3/faces/sheet.png`.
- `<preset>/beside.png` and `match.json`: the Faces check on each face clip's still, made by
  `node runtime-web/lab/still.ts --species dog --still face_<preset> --ppp 3 --out build/stills/dog/faces/<preset>` and
  `python3 characters/sheetmatch/facematch.py dog --still build/stills/dog/faces/<preset> --out qa/phase3/faces/<preset>`.
- `states.png`: the states no preset's still shows (peek, the yawn, the pant, the wink and the perked ear on the
  other side, raised brows over the wide eyes, the half-lid). `node qa/phase3/faces/states.ts build/stills/dog/states`,
  then `python3 qa/phase3/faces/sheet.py states build/stills/dog/states qa/phase3/faces/states.png`.
- `perked.png`: One ear perked levelled and scaled by its brows, the two half and half, and the render (DECISIONS 133).
  `python3 qa/phase3/faces/perked.py build/stills/dog/faces/curious qa/phase3/faces/perked.png`.
- `brows.json` and `brows.png`: the sheets' brows measured by `brows.py`, the tilt the R3 brow guard holds to
  (DECISIONS 131).
- `r3-plants.txt`: the R3 guards (`characters/dog/test/faces.test.ts`) run on a copy of the committed tree with a fault
  planted in the source each time (an open mouth's lip ends bent below its centre, the neutral brow's inner end below
  its outer, shy's ear turned 12° in), then with none. `python3 qa/phase3/faces/plants.py qa/phase3/faces/r3-plants.txt`.
- `atlas.json`: the atlas page shares before and after the face states (DECISIONS 139).
