# Gate A: the dog's look

Gate A (spec section 5b, Gates): the locked model and its marking map, a still of each view and every face preset,
each beside its sheet crop at the same size. It passes when the sheet match is green and you recognise the dog from
its sheets and approve the look. Nothing is animated before it. You waived the three fresh reviewers for this gate on
Oct 17 (`docs/GATES.md`), so the pack comes to you directly.

## What to look at

1. `views_1.png` and `views_2.png`: the six views (front, three-quarter and side facing each way, back), each beside
   its turnaround crop at the same size, with its sheet-match numbers.
2. `../faces/sheet.png`: the 17 face presets the sheets draw, each beside its expression panel.
3. `../faces/new/sheet.png`: the new faces no panel shows (hungry, huffy) beside the panels they borrow from, with the
   variants for you to pick, and the eyes you chose for Q2.
4. `../faces/turned/threeQuarter.L.png`, `threeQuarter.R.png`, `side.L.png`, `side.R.png`: every face state in the
   turned views.
5. `marking_map.png`: the marking map on the four turnaround crops (the head patches, the back patches, the rump patch,
   the tail base), from `characters/dog/model.json`.
6. `collar.png`: the collar blue (`#7DB7E8`) beside the sheet's in every view.
7. The locked model, `characters/dog/model.json` (proportions, landmarks per view, the palette, the outline widths,
   the marking map), and every decision with the crop that settled it, `characters/dog/DECISIONS.md`.

## The sheet match, every check green (c21521d and after)

| View | Silhouette IoU (min) | Worst landmark (max 2.8 pt) | Worst colour ΔE (max 3) | Collar ΔE | Markings in place |
| --- | --- | --- | --- | --- | --- |
| Front | 0.977 (0.9) | 2.12 pt | 1.92 | 1.69 | 4 of 4 |
| Three-quarter, left | 0.964 (0.9) | 2.40 pt | 1.92 | 1.42 | 5 of 5 |
| Three-quarter, right | 0.963 (0.9) | 2.47 pt | 1.92 | 1.42 | 4 of 4 |
| Side, left | 0.964 (0.85) | 2.44 pt | 2.21 | 0.60 | 4 of 4 |
| Side, right | 0.964 (0.85) | 2.44 pt | 2.21 | 0.60 | 3 of 3 |
| Back | 0.982 (0.85) | 2.47 pt | 2.33 | 1.21 | 3 of 3 |

The Faces check: all 19 presets pass (the 17 the sheets draw against their panels, hungry and huffy held on the head
and judged by eye), the blush at its levels (shy 0.80, blissful 0.69, every rest cheek 0.35). The turned faces' ID
check: 48 of 48. The line check is advisory (DECISIONS 306).

## What I need from you

- **The look:** approve the six views and the faces, or say what is off.
- **The model and the marking map:** approve them as drawn (the patches' places, the collar blue).
- **Hungry:** A (default: the wide eyes meeting on the food, the o, then the lick) or B (eyes straight out, the tongue
  over the o's foot).
- **Huffy:** A (default: flat shut lids, the puff inside the outline, the blush at rest, then the peek back), A
  flushed to 60%, or B (the head itself puffed at the cheeks).
- **Tender:** the sheet's half-lid (default, as the spec's table gives it), the softer lid, or the crescents with a
  50% blush.

Answer like "Gate A approved, hungry A, huffy A, tender softer lid". Silence on a choice keeps its default.

Built with `python3 qa/phase3/gateA/build.py` from each view's `qa/phase3/<view>/phone.png` and `match.json`.
