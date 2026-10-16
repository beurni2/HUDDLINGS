# The face states in the turned views

One phone-size contact sheet per turned view: every face state, then the 17 presets' stills, each the head at 3x from
the WebGL runtime, labelled, with the motion sheet's crop beside the cells it settles (mirrored for a .L view, as the
motion sheet faces right). DECISIONS 170 to 185 in `characters/dog/DECISIONS.md`.

- `threeQuarter.L.png`, `threeQuarter.R.png`, `side.L.png`, `side.R.png`: the sheets.
- `ids.json`: the ID-pass check that nothing of the open eye draws under a closed one, in the front and the four
  turned views, and that a turned half-lid draws the open eye below its lid only (182). 46 of 46 pass.

The stills come from a review build: the package's own source, plus the turned stars and the profile's mouths, which
the package holds out for now (183), and one clip per cell. A face preset's states apply in any view at runtime, so the
package gets no new clip. The ears' lifted, relaxed and lowered cells are the neutral ear turned by the clip, as at
this lane's base.

```
node qa/phase3/faces/turned/render.ts build/dev/turnedfaces --cache build/cache
python3 qa/phase3/faces/turned/sheet.py build/dev/turnedfaces qa/phase3/faces/turned
cp build/dev/turnedfaces/ids.json qa/phase3/faces/turned/
```
