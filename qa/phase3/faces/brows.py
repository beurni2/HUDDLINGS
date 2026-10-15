"""The sheets' brows, measured for the R3 brow guard (characters/dog/test/faces.test.ts, DECISIONS.md 131): on each
expression panel the Faces check holds (model.json's faceCrops), each brow is found as the topmost small dark-tan mark
above its eye (L* under 82, C* over 10, 15 to 250 px, clear of the search window's edge) and measured in the panel's own
level frame (its eye line), in points: its length across, how far its inner end stands above its outer (each end the
mean height of its fifth of the length nearest that end, each pixel weighed by its darkness), and how far its middle
(the middle 30% across) bows up above its ends' mean.

    python3 qa/phase3/faces/brows.py <out folder>

Writes brows.json and brows.png (each panel with the brows it found in green)."""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage
from skimage import color

ROOT = Path(__file__).resolve().parents[3]
DOG = ROOT / "characters" / "dog"


def measure(rgb, rec):
    lab = color.rgb2lab(rgb / 255.0)
    L, C = lab[..., 0], np.hypot(lab[..., 1], lab[..., 2])
    k, w = rec["ptPerCropPx"], rec["headWidthCropPx"]
    roll = np.radians(rec["rollDeg"])
    across, down = np.array([np.cos(roll), np.sin(roll)]), np.array([-np.sin(roll), np.cos(roll)])
    anchors = rec["anchorsCropPx"]
    ys, xs = np.mgrid[:rgb.shape[0], :rgb.shape[1]]
    found, marks = {}, []
    for eye in ("eye.R", "eye.L"):
        e = np.array(anchors[eye])
        d = np.stack([xs - e[0], ys - e[1]], -1)
        u, v = d @ across, d @ down
        window = (np.abs(u) < 0.2 * w) & (v > -0.45 * w) & (v < -0.12 * w)
        dark = window & (L < 82) & (C > 10)
        labels, n = ndimage.label(dark, structure=np.ones((3, 3)))
        edge = ndimage.binary_dilation(window & ~ndimage.binary_erosion(window))
        best = None
        for i in range(1, n + 1):
            blob = labels == i
            if not 15 <= blob.sum() <= 250 or (blob & edge).any():
                continue
            height = float(v[blob].mean())
            if best is None or height < best[0]:
                best = (height, blob)
        if best is None:
            continue
        blob = best[1]
        weight = 1 - L[blob] / 100
        uu, vv = u[blob], v[blob]
        span = uu.max() - uu.min()
        zone = lambda keep: float(np.average(vv[keep], weights=weight[keep]))
        low, high = zone(uu <= uu.min() + 0.2 * span), zone(uu >= uu.max() - 0.2 * span)
        middle = zone(np.abs(uu - (uu.min() + uu.max()) / 2) <= 0.15 * span)
        toward_nose = (np.array(anchors["nose"]) - e) @ across
        inner, outer = (high, low) if toward_nose > 0 else (low, high)
        found[eye] = {"lengthPt": round(float(span * k), 2), "innerAboveOuterPt": round(float((outer - inner) * k), 2),
                      "bowPt": round(float(((low + high) / 2 - middle) * k), 2), "px": int(blob.sum())}
        marks.append(blob)
    return found, marks


def main(out):
    out = Path(out)
    model = json.loads((DOG / "model.json").read_text())
    result, images = {}, []
    for pid, rec in model["faceCrops"].items():
        if "eye.R" not in rec["anchorsCropPx"]:
            continue
        rgb = np.asarray(Image.open(DOG / "ref" / "panels" / rec["sheet"] / f"{pid}.png").convert("RGB")).astype(float)
        found, marks = measure(rgb, rec)
        result[pid] = found
        shown = rgb.astype(np.uint8).copy()
        for m in marks:
            shown[m] = [0, 190, 0]
        images.append(Image.fromarray(shown))
    tilts = [b["innerAboveOuterPt"] for f in result.values() for b in f.values()]
    bows = [b["bowPt"] for f in result.values() for b in f.values()]
    summary = {"innerAboveOuterPt": [min(tilts), max(tilts)], "largestTiltPt": max(abs(t) for t in tilts), "bowPt": [min(bows), max(bows)]}
    (out / "brows.json").write_text(json.dumps({"panels": result, "summary": summary}, indent=1) + "\n")
    width = max(i.width for i in images)
    sheet = Image.new("RGB", (width * 3, sum(i.height for i in images[::3]) + 10), "white")
    x = y = 0
    for n, im in enumerate(images):
        sheet.paste(im, ((n % 3) * width, y))
        if n % 3 == 2:
            y += max(i.height for i in images[n - 2:n + 1])
    sheet.quantize(colors=96).save(out / "brows.png", optimize=True)
    print(json.dumps(summary))


if __name__ == "__main__":
    main(sys.argv[1])
