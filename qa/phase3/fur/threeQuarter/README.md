# The fur pass in the three-quarter view

The joins the audit names in this view (three-quarter D1 to D15, `qa/phase3/audit/defects.json`), one row each: the
sheet's crop, 46011a2's drawing (before the fur kit's third round) and this branch's, then the whole dog at phone size.
DECISIONS 228 to 234 (the first pass), 272 to 275 (the kit's second round) and 294 to 297 (its third: the line's life
typed from the crop and lit again in .R, the lit steps over the cream, the chin over the collar, the second round's
findings) in `characters/dog/DECISIONS.md`.

- `threeQuarter.L/joins.png`: the left-facing view against its crop.
- `threeQuarter.R/joins.png`: the right-facing view (the .L drawing mirrored and lit again) against the crop mirrored.
- `../../threeQuarter.L/phone.png`, `../../threeQuarter.R/phone.png`: the sheet match's phone-size pair.

```
node qa/phase3/fur/threeQuarter/joins.ts            # both sheets, and what the line gate finds in each facing
node qa/phase3/fur/threeQuarter/joins.ts --gate     # the line gate only
node qa/phase3/fur/threeQuarter/joins.ts --facing L --only D7   # one row, into the temp folder
```

The gate runs twice per facing: as the build's lint runs it (219), and counting only what shows (264, 288) with each
perked ear composited with head.line's temple state on its side, as the face clips draw them. Both find 0 problems.

## Partly open, row by row

Each row's "now" is closer to the crop than 46011a2's, but these still differ by eye (DECISIONS 294 to 297 say why
each stands):

- The line's width: it uses the whole 1.2 to 1.8 pt band (Q32) where the crop's tone puts it, but at phone size the
  width change reads less than the sheet's; the tone change along the line carries most of the life (294).
- D14, the plume: its top and hook are as light as the crop's (L* 77 to 82 against 78 to 86), but its far side's lower
  half reads L* 62 at x 45, y -30 where the crop's is 70 (295); its five lobes still read as even cloud lobes.
- D12, the front paws: their lines read darker than the crop's (median L* 64.7 against 71.2; 46011a2's 68.9): the
  soles are typed full under their middles, as the crop's darkest, and the paws' sides follow.
- D7, the chin: the warm band and the crease read as the crop's and the hero's (L* 87, 80, 76 above the edge at
  x -45 against the crop's 90, 82, 70), but the band is warmer (b* 14 to 19 against 4 to 12) and the four hair flicks
  read as fine tan ticks on the blue at 2.3 times phone size, where the crop draws none (they are the hero's).
- D2, the far cheek: the crop's puff is brighter than the face and has no line of its own; ours keeps a light line.
- D8, the collar: no navy top line, and the clasp is still a pale pill.

The perked-ear states are judged in `qa/phase3/faces/turned/` (`threeQuarter.L.png`, `threeQuarter.R.png`).

## The line check (advisory; its calibration is stale, the lead reruns it)

Measures that newly failed at 46011a2 against 8912ced (DECISIONS 297): .L ear.L|head.base lightSeamPt 7.26 to 18.72 pt
(8.8), ear.L|outside widthPt 1.287 to 1.407 (1.401), front.L|front.R inkLog -0.239 to -0.317; .R ear.R|head.base
lightSeamPt 6.21 to 17.99, body.back|hind.R inkLog 0.44 to 0.514, body.front|outside widthPt 1.306 to 1.492 (1.474).
