# The fur pass in the three-quarter view

The joins the audit names in this view (three-quarter D1 to D15, `qa/phase3/audit/defects.json`), one row each: the
sheet's crop, the base's drawing (fbbe6d3, before this lane) and this branch's, then the whole dog at phone size.
DECISIONS 228 to 234 in `characters/dog/DECISIONS.md`.

- `threeQuarter.L/joins.png`: the left-facing view against its crop.
- `threeQuarter.R/joins.png`: the right-facing view (the .L drawing mirrored and lit again) against the crop mirrored.

```
node qa/phase3/fur/threeQuarter/joins.ts            # both sheets, and what the line gate finds in each facing
node qa/phase3/fur/threeQuarter/joins.ts --gate     # the line gate only
node qa/phase3/fur/threeQuarter/joins.ts --facing L --only D7   # one row, into the temp folder
```

## Partly open, row by row

Each row's "after" is closer to the crop than the base's, but these still differ by eye (the fresh review of Oct 16
and this lane's look rounds; DECISIONS 228 to 234 say why each stands):

- D2, the far cheek: two round lobes and a soft notch now, as the crop's puff; the crop's puff reads larger and softer
  at phone size.
- D5, the ears: the near ear's lock step is lower (0.8 pt) but still shows; both ears' outlines carry more ink than the
  crop's (the ear recipe's line, 215; the line check's inkLog 1.1 to 1.4).
- D6, the topknot: the centre curl's strand line is not drawn (topknot.ts, the shared lane's).
- D7, the chin: six scallops at the chin rule's floor still read as lace beside the crop's nearly straight edge
  (headFur's chin, 214; the recipe lane's to weigh).
- D8, the collar: no navy top line, and the clasp is still a pale pill.
- D10, the chest's lower edge: it fades in where the crop's does, but the branch strokes barely show and the near leg's
  front edge stays a dark contact line (211, Q31).
- D13, the gap between the near front paw and the hind paw: a warm shade at 0.36, lighter than the crop's wedge, the
  most the sheet match takes before it reads the wedge as an unmapped tan marking.
- D14, the tail: the plume's five lobes still read as even cloud lobes at phone size.

The perked-ear states are judged in `qa/phase3/faces/turned/` (the line gate composites a temple state with the rest ears).
