# The face library in front: evidence

- `sheet.png`: each of the 17 face presets drawn now (front view) beside its primary panel at the panel's scale, labelled; made by `sheet.py` from the stills.
- `<preset>/beside.png` and `match.json`: the Faces check (`characters/sheetmatch/facematch.py`) on each face clip's still, made by
  `node runtime-web/lab/still.ts --species dog --still face_<preset> --ppp 3 --out build/stills/dog/faces/<preset>` and
  `python3 characters/sheetmatch/facematch.py dog --still build/stills/dog/faces/<preset> --out qa/phase3/faces/<preset>`.
  Why the turned and raised panels fail: `characters/dog/DECISIONS.md` 137.
- `states.png`: the states no preset's still shows (peek, yawn, pant, the wink and the perked ear on the other side, raised brows with the wide eyes, the half-lid).
- `brows.json` and `brows.png`: the sheets' brows measured by `brows.py`, the tilt the R3 brow guard holds to (DECISIONS 131).
- `r3-plants.txt`: each R3 guard (`characters/dog/test/faces.test.ts`) failing on a frown, a slanted brow and a drooped ear planted in the source, and passing once they are taken out.
