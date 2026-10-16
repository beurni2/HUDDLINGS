# The face states in the turned views

One phone-size contact sheet per turned view: every face state (the squeeze and the sparkle drawn as the founder
chose them, hungry's and huffy's eyes and mouths among them), then the 19 presets' stills, huffy's peek back and
hungry's o, each the head at 3x from the WebGL runtime, labelled, with the motion sheet's crop beside the cells it
settles (mirrored for a .L view, as the motion sheet faces right). DECISIONS 170 to 186 and 201 to 208 in
`characters/dog/DECISIONS.md`.

- `threeQuarter.L.png`, `threeQuarter.R.png`, `side.L.png`, `side.R.png`: the sheets.
- `ids.json`: the ID-pass check that nothing of the open eye draws under a closed one, in the front and the four
  turned views: under each closed state none of the open eye's light pixels (its white, catchlights and glow) comes
  out the same and none of its dark iris shows outside the band; and that nothing dark of the open eye shows over the
  eye's top under a half-lid (182, 202). 48 of 48 pass. `share` (the band's footprint over the open eye's) is kept as
  a number to read, no longer a bound.

The stills come from a review build: the package's own source, plus what the package does not play yet, each cell
that shows it marked. `*`: the turned stars, huffy's turned puffed cheeks and the profile's mouths, which the package
holds out for now (183, 208).
`**`: the three-quarter's head line beside its near ear perked, keyed as p3/faces2's face clips key head.line (an ear
raised off its temple, perked or lifted, gives templeL, templeR or temples); this branch's face clips key no head.line
state, so its package draws the rest line there, with its crease, until that merges (176). A face preset's states
apply in any view at runtime, so the package gets no new clip. The ears' lifted, relaxed and lowered cells are the
neutral ear turned by the clip, as at this lane's base.

```
node qa/phase3/faces/turned/render.ts build/dev/turnedfaces --cache build/cache
python3 qa/phase3/faces/turned/sheet.py build/dev/turnedfaces qa/phase3/faces/turned
cp build/dev/turnedfaces/ids.json qa/phase3/faces/turned/
```
