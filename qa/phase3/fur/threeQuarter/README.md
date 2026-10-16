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
