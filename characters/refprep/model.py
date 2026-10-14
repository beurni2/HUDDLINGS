"""Writes the proposed locked model, characters/<species>/model.json (spec
section 5b, Appendix F), from the measurements, the palette and the marking map.

    python3 characters/refprep/model.py dog

Reads ref/measurements.json, ref/palette.json, ref/markings.json and
refmap/markings.json (run measure.py, palette.py and markings.py first).
Landmarks are in points at the 164 pt height, from the ground point under the
seat, y down. The palette is the sheet's printed values (spec section 5, L189),
with the outline sampled from the linework; paletteProposed holds the colours
the sheet paints that the printed palette lacks, for the founder to decide at
Gate A. Each crop record keeps its box in sheet pixels and its anchors in crop
pixels, with the crop's scale in points per crop pixel. The model is a proposal
until the founder approves it at Gate A."""
import sys

import numpy as np

import sheets

COLLAR_HIGHLIGHT = "#A7C7E8"  # spec section 5, L189: the rabbit sheet's lighter collar, shared by all four
INNER_LINE_PT = 0.75  # spec section 5b: inner lines are 0.6-0.9 pt; the sheet's are too faint to resolve
PALETTE_ORDER = ("fur", "marking", "dark", "blush", "shadow", "collar", "collarHighlight", "tag", "outline")
# The right-facing views the turnaround never draws: mirrors of its left-facing ones (DECISIONS.md).
MIRRORED = {"side.R": "side.L", "threeQuarter.R": "threeQuarter.L"}


def mean_hex(values):
    return sheets.rgb_to_hex(np.mean([sheets.hex_to_rgb(v).astype(float) for v in values], axis=0))


def build(species):
    folder = sheets.ROOT / "characters" / species
    measured = sheets.json.loads((folder / "ref" / "measurements.json").read_text())
    palette = sheets.json.loads((folder / "ref" / "palette.json").read_text())
    sightings = sheets.json.loads((folder / "ref" / "markings.json").read_text())["evidence"]
    plan = sheets.json.loads((folder / "refmap" / "markings.json").read_text())
    colours = dict(palette["printed"], collarHighlight=COLLAR_HIGHLIGHT, outline=palette["outline"])
    front = palette["views"]["front"]
    head_patches = [s["dominant"] for s in sightings
                    if s["panel"] == "master.turnaround.front" and s["marking"].startswith("head.patch")]
    proposed = {
        "eyeDark": {"value": front["eyes"]["dominant"], "for": "the pupils, the upper iris and the nose, which the sheet paints near-black; the printed dark stays for the lighter lower iris"},
        "markingLight": {"value": mean_hex(head_patches), "for": "the head patches, which the sheet paints paler than its other tan"},
        "furShade": {"value": front["furShade"]["dominant"], "for": "the fur's soft shade, warmer on the sheet than the printed Soft Shadow, which matches the ground shadow"},
        "tongue": {"value": front["tongue"]["dominant"], "for": "the tongue, deeper on the sheet than the printed pink"},
        "mouthInside": {"value": front["mouthInside"]["dominant"], "for": "the open mouth's inside, which the sheet prints no value for"},
    }
    landmarks, crops = {}, {}
    for view, record in measured["views"].items():
        landmarks[view] = {name: record["landmarks"][name] for name in sorted(record["landmarks"])}
        crops[view] = {
            "crop": record["crop"], "sheet": record["sheet"], "boxSheetPx": record["box"], "view": view.split(".")[0],
            "facing": record["facing"], "ptPerCropPx": record["scale"], "anchorsCropPx": record["anchors"],
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
        "mirroredViews": MIRRORED,
        "palette": {name: colours[name] for name in PALETTE_ORDER},
        "paletteProposed": proposed,
        "blush": {"restingLevel": palette["blush"]["turnaroundOpacity"],
                  "note": "the printed blush's level on the turnaround's cheeks (spec L474: the blush is a level from 0 to 100%)"},
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
