"""Our lines' width variation as the line check reads it (lines.json's widthCv, widthPt and soleMiddlePt per region),
today against a scratch build, beside the sheet's (sheetcv.json, from the hero), grouped as DECISIONS 260 groups them:
the legs, the back, the soles and the tail.

    python3 qa/phase3/fur/recipes2/cv.py <today qa/<view>> <option qa/<view>> [...more pairs]
"""
import fnmatch
import json
import sys
from pathlib import Path

here = Path(__file__).resolve().parent
GROUPS = {
    "legs": ("body.front|front.*", "body.back|front.*", "front.*|outside", "front.L|front.R", "body.back|hind.*", "front.*|hind.*"),
    "back": ("body.back|outside", "body.front|outside", "body.back|body.front"),
    "soles": ("front.*|ground", "hind.*|ground", "body.back|ground"),
    "tail": ("tail|*", "body.back|tail"),
}


def rows(path):
    d = json.loads((Path(path) / "lines.json").read_text())
    out = {}
    for name, r in d["regions"].items():
        m = r.get("measures", {})
        get = lambda k: (m.get(k) or {}).get("value")  # noqa: E731
        out[name] = {"cv": get("widthCv"), "width": get("widthPt"), "sole": get("soleMiddlePt"), "cvMin": (m.get("widthCv") or {}).get("threshold")}
    return out


def main(argv):
    sheet = json.loads((here / "sheetcv.json").read_text())["hero"]
    for a, b in zip(argv[::2], argv[1::2]):
        ra, rb = rows(a), rows(b)
        print(f"== {Path(a).name}")
        for group, patterns in GROUPS.items():
            names = [n for n in ra if any(fnmatch.fnmatch(n, p) for p in patterns) and (ra[n]["cv"] is not None or rb.get(n, {}).get("cv") is not None)]
            s = sheet.get(group, {})
            print(f"  {group:5} sheet cv {s.get('min')} to {s.get('max')}")
            for n in names:
                x, y = ra[n], rb.get(n, {})
                print(f"    {n:24} cv {x['cv']} -> {y.get('cv')}   (check's floor {x['cvMin']})   width {x['width']} -> {y.get('width')} pt" + (f"   sole middle {x['sole']} -> {y.get('sole')}" if x["sole"] or y.get("sole") else ""))


if __name__ == "__main__":
    main(sys.argv[1:])
