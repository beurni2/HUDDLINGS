# The founder's check after the third fur round

The founder asked to check this round by eye instead of with agent reviewers. Each image sets the sheet beside our
render at 6dc6ac6 (before the founder's note on the fur edges) and at c21521d (after the third round), at phone size,
cropped from each commit's `qa/phase3/<view>/phone.png` (the panels are aligned by the sheet match).

- `views_1.png`: front, three-quarter facing left and right. `views_2.png`: side facing left and right, back.
- `chin_vs_screenshot.png`: the founder's own screenshot (sheet and ours then) beside now.
- `zoom_<view>.png`: the chin over the collar, legs and paws, the tail, the topknot and the ear's edge, enlarged.

Built with `PACK=<folder> python3 build.py views` and `python3 build.py zooms` (boxes in `boxes.json`), the folder
holding each commit's phone images as `before_<view>.png` and `now_<view>.png`; the chin image sets the screenshot's two
halves beside the front's now, framed alike.
