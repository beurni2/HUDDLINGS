"""The sheet's line-width variation on the legs, the back, the soles and the tail (DECISIONS 260), read with the line
check's own measure (characters/sheetmatch/linematch.py's width_stats: each skeleton pixel's full width at half maximum
of the warm top-hat, its coefficient of variation where the line runs alone, away from junctions), on the hero
(master.hero.main.png, 0.47 pt per px) and, for what they are worth, on the turnaround crops (about 0.75 pt per px,
too coarse to resolve a width's variation: DECISIONS 251). Never on a render.

Each edge is either the panel's own outline in a box (linecal.panel_edge, as the line check's calibration reads the
hero's classes) or, for a line inside the silhouette (a leg's inner edge, a haunch over a leg), the line map's
skeleton inside a hand-placed box. Prints one row per edge and writes sheetcv.json beside this file.

    python3 qa/phase3/fur/recipes2/sheetcv.py
"""
import json
import sys
from pathlib import Path

import numpy as np

here = Path(__file__).resolve().parent
repo = here.parents[3]
sys.path.insert(0, str(repo / "characters" / "sheetmatch"))
import linecal  # noqa: E402
import linematch as lm  # noqa: E402

HERO = linecal.HERO
# Hand-placed boxes [x0, y0, x1, y1] in panel px: what each draws, read from the panel beside a 20 px grid.
EDGES = (
    # The hero's front legs: their outer edges against the haunches and their inner edges down the slot.
    {"panel": HERO, "class": "legs", "kind": "line", "box": [134, 262, 156, 338], "note": "the hero's right front leg against its haunch"},
    {"panel": HERO, "class": "legs", "kind": "line", "box": [192, 282, 210, 346], "note": "the hero's right front leg's inner edge"},
    {"panel": HERO, "class": "legs", "kind": "line", "box": [212, 282, 230, 346], "note": "the hero's left front leg's inner edge"},
    {"panel": HERO, "class": "legs", "kind": "line", "box": [256, 256, 280, 330], "note": "the hero's left front leg against its haunch"},
    # The back: the hero's body outline down its left flank and haunch (the line check's body class) and the haunch's
    # round over the tail on its right side.
    {"panel": HERO, "class": "back", "kind": "silhouette", "box": [258, 215, 300, 330], "note": "the hero's left flank and haunch"},
    {"panel": HERO, "class": "back", "kind": "line", "box": [70, 240, 104, 330], "note": "the hero's right haunch over the tail"},
    # The soles: the hero's three (the line check's sole class).
    {"panel": HERO, "class": "soles", "kind": "silhouette", "box": [82, 350, 146, 372], "note": "the hero's right front sole"},
    {"panel": HERO, "class": "soles", "kind": "silhouette", "box": [155, 350, 205, 372], "note": "the hero's middle sole"},
    {"panel": HERO, "class": "soles", "kind": "silhouette", "box": [214, 350, 260, 372], "note": "the hero's left front sole"},
    # The tail: the hero's plume (the line check's tail class).
    {"panel": HERO, "class": "tail", "kind": "silhouette", "box": [5, 240, 76, 352], "note": "the hero's tail plume"},
    # The turnaround crops (about 0.75 pt per px).
    {"panel": "turnaround:side.L", "class": "back", "kind": "silhouette", "box": [60, 40, 190, 80], "note": "side: the topline"},
    {"panel": "turnaround:side.L", "class": "tail", "kind": "silhouette", "box": [150, 60, 215, 150], "note": "side: the tail"},
    {"panel": "turnaround:side.L", "class": "soles", "kind": "silhouette", "box": [10, 170, 160, 200], "note": "side: the soles"},
    {"panel": "turnaround:front", "class": "legs", "kind": "line", "box": [70, 150, 150, 210], "note": "front: the front legs"},
    {"panel": "turnaround:front", "class": "soles", "kind": "silhouette", "box": [50, 200, 170, 225], "note": "front: the soles"},
    {"panel": "turnaround:back", "class": "back", "kind": "silhouette", "box": [20, 90, 200, 190], "note": "back: the shoulders and haunches"},
)


def line_edge(edge, scale):
    """A line inside the silhouette: the line map's skeleton in the box, read as width_stats reads a region."""
    rgb, sil, own = linecal.panel_image(edge["panel"])
    k = own or scale
    x0, y0, x1, y1 = edge["box"]
    tau, _ = lm.plateau_tau(rgb, np.ones(sil.shape, bool))
    keep = np.zeros(sil.shape, bool)
    keep[y0:y1, x0:x1] = True
    lines = lm.line_map(rgb, tau, keep, radius=lm.FINE_TOPHAT_PT / k)
    band = np.where(keep, 0, -1)
    stats = lm.width_stats(lines, band, ["x|edge"], 1 / k).get("x|edge", {})
    return {"widthPt": stats.get("widthMedianPt"), "widthCv": stats.get("widthCv"), "ptPerPx": lm.r(k, 4)}


def main():
    scale = linecal.hero_scale()
    rows = []
    for e in EDGES:
        if e["kind"] == "line":
            m = line_edge(e, scale)
        else:
            m = linecal.panel_edge({**e, "class": "sole" if e["class"] == "soles" else e["class"]}, scale)
            m = {"widthPt": m["widthPt"], "widthCv": m["widthCv"], "ptPerPx": m["ptPerPx"]}
        rows.append({**e, **m})
        print(f"{e['class']:6} {e['panel'].split('/')[-1]:22} cv {m['widthCv']}  width {m['widthPt']} pt  ({m['ptPerPx']} pt/px)  {e['note']}")
    by = {}
    for r in rows:
        if r["panel"] == HERO and r["widthCv"] is not None:
            by.setdefault(r["class"], []).append(r["widthCv"])
    summary = {c: {"min": lm.r(min(v)), "median": lm.r(float(np.median(v))), "max": lm.r(max(v))} for c, v in by.items()}
    print("hero, by class:", json.dumps(summary))
    (here / "sheetcv.json").write_text(json.dumps({"hero": summary, "edges": rows}, indent=1) + "\n")


if __name__ == "__main__":
    main()
