# The fur pass in the three-quarter view

The joins the audit names in this view (three-quarter D1 to D15, `qa/phase3/audit/defects.json`), one row each: the
sheet's crop, 8912ced's drawing (before the fur kit's second round) and this branch's, then the whole dog at phone size.
DECISIONS 228 to 234 (the first pass) and 272 to 275 (the kit's second round: the soft chin, the living line weight,
the crisp topknot, the toe lines along each paw's ball, the chest's lower edge, the far cheek's puff) in
`characters/dog/DECISIONS.md`.

- `threeQuarter.L/joins.png`: the left-facing view against its crop.
- `threeQuarter.R/joins.png`: the right-facing view (the .L drawing mirrored and lit again) against the crop mirrored.

```
node qa/phase3/fur/threeQuarter/joins.ts            # both sheets, and what the line gate finds in each facing
node qa/phase3/fur/threeQuarter/joins.ts --gate     # the line gate only
node qa/phase3/fur/threeQuarter/joins.ts --facing L --only D7   # one row, into the temp folder
```

The gate runs twice per facing: as the build's lint runs it (219), and counting only what shows (264) with each perked
ear composited with head.line's temple state on its side, as the face clips draw them. Both find 0 problems.

## Partly open, row by row

Each row's "now" is closer to the crop than 8912ced's, but these still differ by eye (this round's look rounds;
DECISIONS 272 to 275 say why each stands):

- D2, the far cheek: framed in tan now (the far patch down to it, the ear's shade round it) and lined lightly, but the
  crop's puff is brighter than the face and has no line of its own; ours keeps the tan ladder's lightest round it.
- D5, the ears: both ears' outlines carry more ink than the crop's (the line check's inkLog 1.2 to 1.4); at less of the
  line's band the near ear's tip landmark moves past its tolerance.
- D6, the topknot: the flick's step sits in the left curl's line as the crop's does, with a small notch in the line's
  top edge where the two lines meet (24 px/pt; not seen at phone size); the centre curl's strand line is not drawn
  (topknot.ts, the shared lane's).
- D7, the chin: the soft arc and three wisps; the crop draws a faint warm line along the bottom that the soft chin
  leaves out (the hero draws none).
- D8, the collar: no navy top line, and the clasp is still a pale pill.
- D10, the chest's lower edge: it fades in from x -67.6, matching the crop's to x -64, then runs 8 to 14 L* darker than
  the crop's faint line to x -60 (a line at full width is never lighter than the ladder's lightest); the near leg's
  front edge stays a dark contact line (211, Q31).
- D12, the far paw: one notch and its faint toe line at x -73.2, as the crop draws it, plus the short branch at the
  outer toe that `toes()`'s two-line minimum asks for (273).
- D13, the gap between the near front paw and the hind paw: a warm shade at 0.36, lighter than the crop's wedge.
- D14, the tail: the plume's five lobes still read as even cloud lobes at phone size.

The perked-ear states are judged in `qa/phase3/faces/turned/` (`threeQuarter.L.png`, `threeQuarter.R.png`).
