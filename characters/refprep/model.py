"""Writes the proposed locked model, characters/<species>/model.json (spec
section 5b, Appendix F), from the measurements, the palette and the marking map.

    python3 characters/refprep/model.py dog

Reads ref/measurements.json, ref/palette.json and refmap/markings.json (run
measure.py, palette.py and markings.py first). Landmarks are in points at the
164 pt height, from the ground point under the body, y down. The palette is the
sheet's printed values (spec section 5b), with the outline sampled from the
linework. The model is a proposal until the founder approves it at Gate A."""
import sys

import sheets

COLLAR_HIGHLIGHT = "#A7C7E8"  # spec section 5b: the rabbit sheet's lighter collar, shared by all four
INNER_LINE_PT = 0.75  # spec section 5b: inner lines are 0.6-0.9 pt; the sheet's are too faint to resolve
PALETTE_ORDER = ("fur", "marking", "dark", "blush", "shadow", "collar", "collarHighlight", "tag", "outline")


def build(species):
    folder = sheets.ROOT / "characters" / species
    measured = sheets.json.loads((folder / "ref" / "measurements.json").read_text())
    palette = sheets.json.loads((folder / "ref" / "palette.json").read_text())
    plan = sheets.json.loads((folder / "refmap" / "markings.json").read_text())
    colours = dict(palette["printed"], collarHighlight=COLLAR_HIGHLIGHT, outline=palette["outline"])
    landmarks, crops = {}, {}
    for view, record in measured["views"].items():
        landmarks[view] = {name: record["landmarks"][name] for name in sorted(record["landmarks"])}
        crops[view] = {
            "crop": record["crop"], "sheet": record["sheet"], "box": record["box"], "view": view.split(".")[0],
            "facing": record["facing"], "scale": record["scale"], "anchors": record["anchors"],
            "mask": f"ref/{record['silhouette']}",
        }
    return {
        "species": species,
        "status": "proposed; locked when the founder approves it at Gate A",
        "sheets": f"characters/reference/{species}",
        "unit": "pt",
        "height": measured["height"],
        "proportions": measured["proportions"],
        "landmarks": landmarks,
        "palette": {name: colours[name] for name in PALETTE_ORDER},
        "outline": {"outerPt": measured["outline"]["outerPt"], "innerPt": INNER_LINE_PT},
        "markings": plan["markings"],
        "crops": crops,
    }


def main(argv):
    if len(argv) != 1:
        print(__doc__)
        return 2
    model = build(argv[0])
    sheets.write_json(sheets.ROOT / "characters" / argv[0] / "model.json", model)
    print(f"model: {len(model['landmarks'])} views, {sum(len(v) for v in model['landmarks'].values())} landmarks, "
          f"{len(model['markings'])} markings")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
