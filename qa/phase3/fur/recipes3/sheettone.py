"""The sheet's line, how its width and its tone vary along it, by region class (DECISIONS 284), read with the line
check's own measures (characters/sheetmatch/linematch.py: width_stats's widthCv, and the advisory tone_along: the core
L* averaged along the line over 1.5 pt, its standard deviation and its spread from the darker tenth to the lighter),
never fitted to a render:
- on the hero (master.hero.main.png, 0.47 pt per px), in hand-placed boxes: 260's (qa/phase3/fur/recipes2/sheetcv.py)
  for the legs, the back, the soles and the tail, and linecal.PANEL_EDGES' for the ears and the crown;
- on each turnaround crop (about 0.77 pt per px), through the sheet's own still (linecal.sheet_still: the crop drawn as
  a still, its regions the calibration's region map), each region's advisory toneAlong.sheet, grouped by class.
With --ours, the line check's lines.json in each <qa>/<view>/ folder given, ours grouped the same way beside the sheet's:
on the crop's grid (toneAlong.ours) and at the hero's scale (toneAlongFine, widthCv).

    python3 qa/phase3/fur/recipes3/sheettone.py [--ours <label>=<qa folder> ...] [--out <json>]
"""
import argparse
import fnmatch
import json
import sys
import tempfile
from pathlib import Path

import numpy as np
from scipy import ndimage

here = Path(__file__).resolve().parent
repo = here.parents[3]
sys.path.insert(0, str(repo / "characters" / "sheetmatch"))
import linecal  # noqa: E402
import linematch as lm  # noqa: E402

HERO = linecal.HERO
CALIBRATION = repo / "characters" / "sheetmatch" / "lines" / "dog.json"
VIEWS = ("front", "threeQuarter.L", "side.L", "back")
# The classes, as 260 grouped the width (qa/phase3/fur/recipes2/cv.py) with the ears and the head's outline added; the
# first class a region matches holds it.
CLASSES = {
    "legs": ("body.front|front.*", "body.back|front.*", "front.*|outside", "front.L|front.R", "body.back|hind.*", "front.*|hind.*"),
    "back": ("body.back|outside", "body.front|outside", "body.back|body.front"),
    "soles": ("front.*|ground", "hind.*|ground", "body.back|ground"),
    "tail": ("tail|*", "body.back|tail"),
    "ears": ("ear.*|outside",),
    "head": ("head.base|outside", "tuft|outside"),
}
# The hero's boxes [x0, y0, x1, y1] in panel px: 260's for the legs, the back, the soles and the tail; linecal's for the
# ears and the crown. "line" reads the line map's skeleton inside the box, "silhouette" the cut-out's edge there.
EDGES = (
    {"class": "legs", "kind": "line", "box": [134, 262, 156, 338], "note": "the right front leg against its haunch"},
    {"class": "legs", "kind": "line", "box": [192, 282, 210, 346], "note": "the right front leg's inner edge"},
    {"class": "legs", "kind": "line", "box": [212, 282, 230, 346], "note": "the left front leg's inner edge"},
    {"class": "legs", "kind": "line", "box": [256, 256, 280, 330], "note": "the left front leg against its haunch"},
    {"class": "back", "kind": "silhouette", "box": [258, 215, 300, 330], "note": "the left flank and haunch"},
    {"class": "back", "kind": "line", "box": [70, 240, 104, 330], "note": "the right haunch over the tail"},
    {"class": "soles", "kind": "silhouette", "box": [82, 350, 146, 372], "note": "the right front sole"},
    {"class": "soles", "kind": "silhouette", "box": [155, 350, 205, 372], "note": "the middle sole"},
    {"class": "soles", "kind": "silhouette", "box": [214, 350, 260, 372], "note": "the left front sole"},
    {"class": "tail", "kind": "silhouette", "box": [5, 240, 76, 352], "note": "the tail's plume"},
    {"class": "ears", "kind": "silhouette", "box": [5, 95, 100, 248], "note": "the right ear: outer edge and hem"},
    {"class": "ears", "kind": "silhouette", "box": [270, 40, 358, 205], "note": "the left ear: outer edge and hem"},
    {"class": "head", "kind": "silhouette", "box": [80, 20, 262, 70], "note": "the crown and topknot"},
)


def class_of(region):
    if "|" not in region or region.endswith(" " + lm.ACROSS):
        return None
    return next((c for c, patterns in CLASSES.items() if any(fnmatch.fnmatchcase(region, p) for p in patterns)), None)


def hero_edge(edge, rgb, sil, k):
    """One hero box's line: width_stats on the line map near the edge (as linecal.panel_edge reads it) or in the box
    (as 260's line_edge does), with its advisory tone along the line at the hero's scale."""
    x0, y0, x1, y1 = edge["box"]
    tau, _ = lm.plateau_tau(rgb, np.ones(sil.shape, bool))
    if edge["kind"] == "line":
        keep = np.zeros(sil.shape, bool)
        keep[y0:y1, x0:x1] = True
    else:
        field = linecal.edge_field(rgb, sil, "silhouette")
        runs = lm.contour_runs(field, lambda c: (c[:, 1] >= x0) & (c[:, 1] < x1) & (c[:, 0] >= y0) & (c[:, 0] < y1), level=linecal.EDGE_LEVEL["silhouette"])
        near = np.zeros(sil.shape, bool)
        for run in runs:
            near[np.clip(np.round(run[:, 0]).astype(int), 0, sil.shape[0] - 1), np.clip(np.round(run[:, 1]).astype(int), 0, sil.shape[1] - 1)] = True
        keep = ndimage.binary_dilation(near, lm.disk(3))
    lines = lm.line_map(rgb, tau, keep, radius=lm.FINE_TOPHAT_PT / k)
    band = np.full(sil.shape, -1)
    band[y0:y1, x0:x1] = 0
    name = f"x|{lm.GROUND}" if edge["class"] == "soles" else "x|edge"
    return lm.width_stats(lines, band, [name], 1 / k).get(name, {})


def spread(values):
    values = [v for v in values if v is not None]
    if not values:
        return None
    return {"min": lm.r(min(values), 2), "median": lm.r(float(np.median(values)), 2), "max": lm.r(max(values), 2), "n": len(values)}


def summarise(rows, keys):
    """Per class, each key's min, median and max over the rows (each row: class plus its figures)."""
    out = {}
    for c in CLASSES:
        mine = [r for r in rows if r["class"] == c]
        if mine:
            out[c] = {key: spread([r.get(key) for r in mine]) for key in keys}
    return out


def hero():
    rgb, sil, _ = linecal.panel_image(HERO)
    k = linecal.hero_scale()
    rows = []
    for e in EDGES:
        s = hero_edge(e, rgb, sil, k)
        t = s.get("toneAlongFine") or {}
        rows.append({**e, "widthCv": s.get("widthCv"), "widthPt": s.get("widthMedianPt"), "sdL": t.get("sdL"), "spreadL": t.get("spreadL"), "meanL": t.get("meanL")})
    return rows, k


def crops():
    """Each turnaround crop's own still checked against itself: the sheet side of every region's toneAlong."""
    calibration = json.loads(CALIBRATION.read_text())
    out = {}
    with tempfile.TemporaryDirectory() as tmp:
        for view in VIEWS:
            folder = linecal.sheet_still("dog", view, Path(tmp) / view, calibration)
            result, _ = lm.check("dog", folder, CALIBRATION, shift=(0, 0), fine=False)
            rows = []
            for name, region in result["regions"].items():
                c = class_of(name)
                t = (region.get("advisory", {}).get("toneAlong") or {}).get("sheet")
                if c and t:
                    rows.append({"class": c, "region": name, **t})
            out[view] = rows
    return out


def ours(folder):
    """Our still's figures from its lines.json: on the crop's grid (toneAlong.ours, with the sheet's beside it at the
    same regions) and at the hero's scale (toneAlongFine; widthCv)."""
    d = json.loads((Path(folder) / "lines.json").read_text())
    rows = []
    for name, region in d["regions"].items():
        c = class_of(name)
        if not c:
            continue
        a = region.get("advisory", {})
        grid = a.get("toneAlong") or {}
        fine = a.get("toneAlongFine") or {}
        cv = (region["measures"].get("widthCv") or {}).get("value")
        rows.append({"class": c, "region": name, "sdL": (grid.get("ours") or {}).get("sdL"), "spreadL": (grid.get("ours") or {}).get("spreadL"),
                     "meanL": (grid.get("ours") or {}).get("meanL"), "sheetSdL": (grid.get("sheet") or {}).get("sdL"),
                     "sheetSpreadL": (grid.get("sheet") or {}).get("spreadL"), "sheetMeanL": (grid.get("sheet") or {}).get("meanL"),
                     "fineSdL": fine.get("sdL"), "fineSpreadL": fine.get("spreadL"), "fineMeanL": fine.get("meanL"), "widthCv": cv})
    return rows


def main(argv):
    parser = argparse.ArgumentParser(usage=__doc__)
    parser.add_argument("--ours", action="append", default=[], help="<label>=<qa root holding <view>/lines.json>")
    parser.add_argument("--out", default=str(here / "sheettone.json"))
    parser.add_argument("--no-sheet", action="store_true", help="reuse the sheet's figures already in --out")
    args = parser.parse_args(argv)
    out_path = Path(args.out)
    if args.no_sheet:
        report = json.loads(out_path.read_text())
    else:
        h, k = hero()
        c = crops()
        report = {"heroPtPerPx": lm.r(k, 4), "hero": {"edges": h, "byClass": summarise(h, ("widthCv", "sdL", "spreadL", "meanL"))},
                  "crops": {v: {"byClass": summarise(rows, ("sdL", "spreadL", "meanL")), "regions": rows} for v, rows in c.items()}}
    report["ours"] = {}
    for spec in args.ours:
        label, root = spec.split("=", 1)
        report["ours"][label] = {}
        for view in sorted(p.name for p in Path(root).iterdir() if (p / "lines.json").exists()):
            rows = ours(Path(root) / view)
            report["ours"][label][view] = {"byClass": summarise(rows, ("sdL", "spreadL", "meanL", "sheetSdL", "sheetSpreadL", "sheetMeanL", "fineSdL", "fineSpreadL", "fineMeanL", "widthCv")), "regions": rows}
    out_path.write_text(json.dumps(report, indent=1) + "\n")
    fmt = lambda s: "-" if not s else f"{s['min']:.2f} to {s['max']:.2f} (median {s['median']:.2f})"
    print("hero (0.47 pt/px), by class:")
    for c, row in report["hero"]["byClass"].items():
        print(f"  {c:6} widthCv {fmt(row['widthCv'])}; tone sd {fmt(row['sdL'])} L*; spread {fmt(row['spreadL'])} L*; mean {fmt(row['meanL'])}")
    for view, rec in report["crops"].items():
        print(f"crop {view}, by class:")
        for c, row in rec["byClass"].items():
            print(f"  {c:6} tone sd {fmt(row['sdL'])}; spread {fmt(row['spreadL'])}; mean {fmt(row['meanL'])}")
    for label, views in report["ours"].items():
        for view, rec in views.items():
            print(f"ours {label} {view}, by class (grid: ours vs the sheet's at the same regions; fine: at the hero's scale):")
            for c, row in rec["byClass"].items():
                print(f"  {c:6} grid sd {fmt(row['sdL'])} vs {fmt(row['sheetSdL'])}; spread {fmt(row['spreadL'])} vs {fmt(row['sheetSpreadL'])}; "
                      f"fine sd {fmt(row['fineSdL'])} spread {fmt(row['fineSpreadL'])} mean {fmt(row['fineMeanL'])}; widthCv {fmt(row['widthCv'])}")


if __name__ == "__main__":
    main(sys.argv[1:])
