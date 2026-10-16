"""The Faces check's shape thresholds, measured (DECISIONS.md 117): every face
panel laid as a render on every other panel's record, and the rest front's
render on each when --rest names its still, and the spread of each shape
measure between pairs that draw the same state and pairs that draw different
ones, among the pairs whose places pass.

    python3 characters/sheetmatch/facecal.py dog [--rest <still_front dir>] [--json <file>]

Each threshold in facematch.py lies halfway between the worst same-state pair
and the best different-state pair (geometrically for a ratio). This prints both
ends of each measure, the threshold they give, the one facematch.py uses, and
every pair on the wrong side of it. A pair's places pass when its held anchors
do: each anchor on a level record, the pair's spacing on a record that turns
the head. It takes a little over a minute.

PanelStill, a panel carried into a still the way a render arrives, is the
fixture the tests use too."""
import argparse
import copy
import json
import sys

import numpy as np
from scipy import ndimage

import facematch
import match

faces, sheets = facematch.faces, match.sheets
# The states each measure compares, as the sheets draw them. The wide eye is the open eye with a ring of white round
# its iris (expressions.eyes.surprised-round), which no dark mark sees: one class. Open, laughing and cheeky mouths
# are each an open mouth, which the master sheet's Excited and Laughing and the expression sheet's Mischievous draw
# alike (DECISIONS.md 118).
EYE_CLASS = {"open": "open", "wide": "open", "happy": "crescent", "closed": "closed"}
MOUTH_CLASS = {"smile": "smile", "open": "open", "laugh": "open", "cheeky": "open", "o": "o", "downturned": "downturned"}


class PanelStill:
    """A panel as a still: its crop, the left-out boxes in the card's colour, carried into model space by its record's
    scale and roll, its face left at the front view's own roll as a render's is, with its nose (or, with no face, its
    head top) on the turnaround's front landmark, opaque over the crop and clear over the card round it, all of it
    head.base. Faults are planted in the still's own pixels, as a drawing's would be."""

    def __init__(self, model, pid, ppp=3.0):
        self.panel = facematch.Panel("dog", model, pid)
        panel = self.panel
        self.pin = "nose" if "nose" in panel.anchors else "head.top"
        self.origin = panel.origin(self.pin, model["landmarks"]["front"][self.pin])
        h, w = panel.shape
        corners = np.array([[0, 0], [w, 0], [0, h], [w, h]], float)
        q = (corners - self.origin) @ facematch.rotation(-panel.turn).T * panel.k
        low, high = q.min(axis=0) - 2, q.max(axis=0) + 2
        size = np.ceil((high - low) * ppp).astype(int)
        self.ppp, self.root = ppp, -low * ppp
        vs, us = np.mgrid[:size[1], :size[0]]
        points = np.stack([(us + 0.5 - self.root[0]) / ppp, (vs + 0.5 - self.root[1]) / ppp], axis=-1)
        crop = points @ facematch.rotation(panel.turn).T / panel.k + self.origin
        self.crop_at = crop  # each still pixel's place on the panel's canvas, continuous pixels
        p = panel.pad
        inside = (crop[..., 0] >= p) & (crop[..., 1] >= p) & (crop[..., 0] < w - p) & (crop[..., 1] < h - p)
        coords = [crop[..., 1].ravel() - 0.5, crop[..., 0].ravel() - 0.5]
        self.rgb = np.stack([ndimage.map_coordinates(panel.shown[..., c].astype(float), coords, order=1, mode="nearest")
                             .reshape(inside.shape) for c in range(3)], axis=-1)
        self.alpha = inside.astype(float)
        self.part = np.where(inside, 0, -1)
        self.names = ["head.base"]

    def still(self, clip="face_fixture"):
        # "panel" names the sheet panel the still carries: its cheeks are the sheet's own, with no blush part to fit.
        meta = {"species": "dog", "still": "panel", "panel": self.panel.pid, "clip": clip, "views": {"body": "front", "head": "front"},
                "ppp": self.ppp, "sizePx": [self.alpha.shape[1], self.alpha.shape[0]], "rootPx": [float(v) for v in self.root],
                "parts": {n: {"id": c, "bone": "head"} for n, c in zip(self.names, ("#808080", "#20A040", "#A02040", "#2040A0", "#A0A020"))},
                "drawn": list(self.names)}
        return match.Still(meta, self.alpha, self.rgb / 255 * self.alpha[..., None], self.part)

    def feature(self, name):
        """A feature's mark on the panel (faces.py's rules), as the still's pixels it covers, grown by two crop pixels so it
        takes the sheet's soft edge with it."""
        panel = self.panel
        _, masks = faces.find_face(panel.canvas, panel.keep, {n: list(q) for n, q in panel.anchors.items()},
                                   panel.width_px, panel.roll)
        mark = masks[name]
        x = np.clip(np.floor(self.crop_at[..., 0]).astype(int), 0, mark.shape[1] - 1)
        y = np.clip(np.floor(self.crop_at[..., 1]).astype(int), 0, mark.shape[0] - 1)
        grow = int(np.ceil(2 * panel.rec["ptPerCropPx"] * self.ppp))
        return ndimage.binary_dilation(mark[y, x] & (self.alpha > 0), iterations=grow)

    def move(self, mask, dx_pt, dy_pt=0.0):
        """Moves the pixels of a mask by whole still pixels, the place they left filled with the fur around them."""
        dx, dy = int(round(dx_pt * self.ppp)), int(round(dy_pt * self.ppp))
        ring = ndimage.binary_dilation(mask, iterations=4) & ~ndimage.binary_dilation(mask, iterations=2)
        fur = np.median(self.rgb[ring], axis=0)
        moved = match.shifted(mask, dx, dy)
        colours = np.roll(self.rgb, (dy, dx), axis=(0, 1))
        self.rgb[mask] = fur
        self.rgb[moved] = colours[moved]

    def label(self, mask, name):
        """Gives the mask's pixels a part of their own, as a drawing's ID pass would."""
        if name not in self.names:
            self.names.append(name)
        self.part[mask] = self.names.index(name)


def places_pass(row, names):
    """Whether a render's places pass for the named anchors on a record: each anchor's place on a level record, the
    pair's spacing on one that turns the head (judge's rows, every anchor counted as held)."""
    if row["turned"]:
        feature = "eyes" if names[0].startswith("eye") else "mouth"
        return row["spacing"].get(feature, {}).get("pass", False)
    return all(n in row["rows"] and "errPt" in row["rows"][n] and row["rows"][n]["errPt"] <= row["tolerance"] for n in names)


def everything(panel):
    """The panel as a record judged on every feature it draws, as if a preset held them all (preset "all")."""
    out = copy.copy(panel)
    out.rec = dict(panel.rec, gates={"all": [n for n in ("eye.R", "eye.L", "mouth.R", "mouth.L") if n in panel.rec["anchorsCropPx"]]})
    return out


def feature_rows(a, arec, b, rec, row):
    """A render's judged row (everything) on a record as one row per feature: the two states, whether the places
    pass and the shape measures."""
    out = []
    if "problem" in row:
        return out
    turned = rec["turned"]
    for name in ("eye.R", "eye.L"):
        if name in row["shapes"]:
            out.append({"render": a, "record": b, "feature": name, "mine": EYE_CLASS[arec["eyeStates"][name]],
                        "theirs": EYE_CLASS[rec["eyeStates"][name]],
                        "placesPass": places_pass(row, ["eye.R", "eye.L"] if turned else [name]),
                        "areaRatio": row["shapes"][name]["areaRatio"], "iou": row["shapes"][name]["iou"]})
    if "mouth" in row["shapes"] and "mouth.R" in rec["anchorsCropPx"]:
        shape = row["shapes"]["mouth"]
        out.append({"render": a, "record": b, "feature": "mouth", "mine": MOUTH_CLASS[arec["drawn"]["mouth"]],
                    "theirs": MOUTH_CLASS[rec["drawn"]["mouth"]], "placesPass": places_pass(row, ["mouth.R", "mouth.L"]),
                    "iou": shape["iou"], "openRatio": shape["openRatio"], "redShare": shape["redShare"],
                    "recordRedShare": shape["recordRedShare"]})
    return out


def pairs(model, rest=None):
    """Every render (each face panel, and the rest front) on every other face panel's record: one row per feature
    the record draws."""
    records = [pid for pid, r in model["faceCrops"].items() if "nose" in r["anchorsCropPx"]]
    renders = {pid: (PanelStill(model, pid).still(), model["faceCrops"][pid]) for pid in records}
    if rest is not None:
        renders["rest front"] = (rest, {"eyeStates": {"eye.R": "open", "eye.L": "open"}, "drawn": {"mouth": "open"}})
    tolerance = match.LANDMARK_SHARE * model["proportions"]["headWidth"]
    front = model["landmarks"]["front"]
    out = []
    for b in records:
        panel = everything(facematch.Panel("dog", model, b))
        for a, (still, arec) in renders.items():
            if a != b:
                row = facematch.judge(facematch.measure_on(still, panel, front), panel, "all", tolerance)
                out += feature_rows(a, arec, b, model["faceCrops"][b], dict(row, tolerance=tolerance))
    return out


def fold(ratio):
    """A ratio as how far it is from 1 either way: 2 for both 2 and 0.5."""
    return max(ratio, 1 / ratio) if ratio > 0 else float("inf")


def spread(rows):
    """For each measure: the worst same-state pair, the best different-state pair the measure must separate, the
    threshold halfway between, and the one facematch.py uses."""
    passing = [r for r in rows if r["placesPass"]]
    eyes = [r for r in passing if r["feature"] != "mouth"]
    mouths = [r for r in passing if r["feature"] == "mouth"]
    same = lambda rs: [r for r in rs if r["mine"] == r["theirs"]]  # noqa: E731
    sized = [r for r in eyes if (r["mine"] == "open") != (r["theirs"] == "open")]  # an open eye against an arc
    arcs = [r for r in eyes if r["mine"] != r["theirs"] and "open" not in (r["mine"], r["theirs"])]  # crescent, closed arc
    smile_open = [r for r in mouths if {r["mine"], r["theirs"]} == {"smile", "open"}]
    measures = {
        "eyeAreaRatio": (max(fold(r["areaRatio"]) for r in same(eyes)), min(fold(r["areaRatio"]) for r in sized), True,
                         facematch.EYE_AREA_RATIO, "open against crescent or closed"),
        "eyeIoU": (min(r["iou"] for r in same(eyes)), max(r["iou"] for r in arcs), False, facematch.EYE_IOU,
                   "crescent against closed arc, whose areas are alike"),
        "mouthIoU": (min(r["iou"] for r in same(mouths)), max(r["iou"] for r in smile_open), False, facematch.MOUTH_IOU,
                     "smile against open"),
        "mouthOpenRatio": (max(fold(r["openRatio"]) for r in same(mouths)), min(fold(r["openRatio"]) for r in smile_open), True,
                           facematch.MOUTH_OPEN_RATIO, "smile against open"),
    }
    out = {}
    for name, (worst_same, best_other, ratio, used, kind) in measures.items():
        halfway = float(np.sqrt(worst_same * best_other)) if ratio else (worst_same + best_other) / 2
        out[name] = {"worstSame": round(worst_same, 3), "bestDifferent": round(best_other, 3), "different": kind,
                     "halfway": round(halfway, 3), "used": used}
    return out, passing


def wrong_side(passing):
    """The pairs whose places pass and whose verdict on the shape gates is not what their states say: a same-state
    pair that fails, or a different-state pair that passes (each measure's own gate)."""
    out = []
    for r in passing:
        if r["feature"] == "mouth":
            ok = r["iou"] >= facematch.MOUTH_IOU and facematch.ratio_ok(r["openRatio"], facematch.MOUTH_OPEN_RATIO)
        else:
            ok = facematch.ratio_ok(r["areaRatio"], facematch.EYE_AREA_RATIO) and r["iou"] >= facematch.EYE_IOU
        if ok != (r["mine"] == r["theirs"]):
            out.append(r)
    return out


def main(argv):
    parser = argparse.ArgumentParser(usage=__doc__)
    parser.add_argument("species")
    parser.add_argument("--rest")
    parser.add_argument("--json")
    args = parser.parse_args(argv)
    model = json.loads((sheets.ROOT / "characters" / args.species / "model.json").read_text())
    rest = match.Still.load(args.rest) if args.rest else None
    rows = pairs(model, rest)
    measures, passing = spread(rows)
    print(f"facecal: {len(rows)} feature rows, {len(passing)} with their places passing")
    for name, m in measures.items():
        print(f"  {name:15s} same-state worst {m['worstSame']:6.3f}   different best {m['bestDifferent']:6.3f} ({m['different']})"
              f"   halfway {m['halfway']:6.3f}   used {m['used']}")
    odd = wrong_side(passing)
    for r in odd:
        print(f"  on the wrong side: {r['render']} on {r['record']} {r['feature']} {r['mine']} against {r['theirs']}: "
              + ", ".join(f"{k} {r[k]}" for k in ("areaRatio", "iou", "openRatio") if k in r))
    if args.json:
        sheets.write_json(args.json, {"measures": measures, "wrongSide": odd, "rows": rows})
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
