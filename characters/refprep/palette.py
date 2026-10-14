"""Samples the palette (spec section 5b, phase 2): each swatch the master sheet
prints, and the dominant colour of each region of the drawn turnaround, against
the printed values, as CIEDE2000.

    python3 characters/refprep/palette.py dog

Reads ref/panels.json, ref/measurements.json and the swatches' roles in
refmap/palette.json (run crop.py and measure.py first). Writes ref/palette.json
and the evidence image ref/overlays/palette.png: per role, the printed value, the
swatch as the sheet's JPEG holds it, and the dominant colour of the region in
each view.

The printed values are the palette (spec section 5b: "the dog and rabbit values
are their sheets' printed labels"); this records how far the sheet's own pixels
are from them. A region's dominant colour is the mean of the pixels in the
fullest 3-unit L*a*b* bin, so a highlight or a shade never pulls it."""
import re
import sys

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

import measure
import sheets

BIN = 3.0  # L*a*b* units per histogram bin for the dominant colour
CHIP = 0.3  # the share of a swatch crop's smaller side sampled around its centre, inside the printed disc


def dominant(rgb, mask):
    """The mean colour of the fullest L*a*b* bin among the masked pixels, and how many pixels the region has."""
    pixels = rgb[mask]
    if len(pixels) == 0:
        return None, 0
    keys = np.floor(sheets.to_lab(pixels) / BIN).astype(np.int64)
    _, inverse, counts = np.unique(keys, axis=0, return_inverse=True, return_counts=True)
    return pixels[inverse.ravel() == counts.argmax()].mean(axis=0), int(len(pixels))


def delta(rgb_a, hex_b):
    return float(sheets.delta_e2000(sheets.to_lab(np.asarray(rgb_a, dtype=np.float64).round().astype(np.uint8)),
                                    sheets.to_lab(sheets.hex_to_rgb(hex_b))))


def swatch(rgb):
    """The median colour of the disc at the swatch's centre."""
    h, w = rgb.shape[:2]
    y, x = np.mgrid[:h, :w]
    disc = (x - (w - 1) / 2) ** 2 + (y - (h - 1) / 2) ** 2 <= (CHIP * min(w, h)) ** 2
    return np.median(rgb[disc], axis=0)


def regions(rgb, sil, landmarks, view):
    """The masks of the palette's regions in one turnaround crop."""
    cls = measure.Classes(rgb, sil)
    lab = sheets.to_lab(rgb)
    L, a, b = lab[..., 0], lab[..., 1], lab[..., 2]
    C = np.hypot(a, b)
    hue = np.degrees(np.arctan2(b, a)) % 360
    eyes = measure.eyes(cls, {"front": 2, "threeQuarter.L": 2, "side.L": 1}.get(view, 0)) if view != "back" else []
    eye_area = np.any([ndimage.binary_dilation(e, iterations=3) for e in eyes], axis=0) if eyes else np.zeros_like(sil)
    collar = ndimage.binary_dilation(cls.blue, iterations=3)
    tag = ndimage.binary_dilation(cls.gold, iterations=3)
    inside = ndimage.binary_erosion(sil, iterations=3)
    tag_mask, _ = measure.tag(cls)
    dark = None
    if eyes:
        nose, _ = measure.nose_and_mouth(cls, eyes, "front" if view == "front" else "left")
        dark = (np.any(eyes, axis=0) | nose) & (L < 40)
    found = {
        "fur": inside & (L >= 88) & (C < 20) & ~eye_area & ~collar & ~tag,
        "marking": cls.tan & ~collar & ~tag,
        "dark": dark,
        "collar": cls.blue,
        "tag": tag_mask,
    }
    # The blush: the faint pink wash on the cheeks, below the eyes and above the chin, the mouth left out.
    if eyes and "chin" in landmarks:
        face = np.zeros_like(sil)
        top = int(max(np.nonzero(e)[0].max() for e in eyes)) - 4
        face[top:int(landmarks["chin"][1]), :] = True
        mouth = ndimage.binary_dilation(cls.pink | (cls.line & face), iterations=4)
        wash = inside & face & (a > 4) & (L > 84) & (C < 24) & (hue < 66) & ~mouth & ~cls.tan
        found["blush"] = np.any(measure.components(wash, 30), axis=0) if measure.components(wash, 30) else None
    # The outline: the core of the outer line, within two pixels of the silhouette's edge.
    edge_band = sil & ~ndimage.binary_erosion(sil, iterations=2)
    found["outline"] = edge_band & (L < 55) & (C > 8)
    # The ground shadow: below the body, outside the silhouette, darker than the card and nearly neutral.
    ys = np.nonzero(sil)[0]
    low = np.zeros_like(sil)
    low[int(ys.max() - 0.08 * (ys.max() - ys.min())):, :] = True
    card = np.median(np.concatenate([lab[0], lab[:, 0], lab[:, -1]]), axis=0)
    away = sheets.delta_e2000(lab, card[None, None, :]) > 2.5
    found["shadow"] = low & ~ndimage.binary_dilation(sil, iterations=2) & away & (C < 12)
    return {k: v for k, v in found.items() if v is not None and v.any()}


def blush_opacity(rgb, mask, fur_hex, blush_hex):
    """How opaque a wash of the printed blush over the printed fur must be to give the reddest tenth of the
    cheeks' pixels, fitted in sRGB."""
    lab = sheets.to_lab(rgb)
    values = lab[..., 1][mask]
    peak = rgb[mask][values >= np.quantile(values, 0.9)].mean(axis=0)
    fur, blush = sheets.hex_to_rgb(fur_hex).astype(float), sheets.hex_to_rgb(blush_hex).astype(float)
    direction = blush - fur
    alpha = float(np.clip(np.dot(peak - fur, direction) / np.dot(direction, direction), 0, 1))
    return alpha, peak


def chip_image(rows, path):
    """One row per role: the printed value, the swatch as sampled, then each view's dominant colour, with ΔE."""
    size, pad, label_w = 44, 6, 120
    columns = max(len(r[2]) for r in rows)
    width = label_w + (columns + 2) * (size + pad) + pad
    height = pad + len(rows) * (size + 22 + pad) + 20
    image = Image.new("RGB", (width, height), (255, 255, 255))
    draw = ImageDraw.Draw(image)
    for column, name in enumerate(["printed"] + [name for name, _ in rows[0][2]]):
        draw.text((label_w + column * (size + pad), 4), name[:8], fill=(60, 60, 60))
    y = 20
    for role, printed, cells in rows:
        draw.text((pad, y + size // 2 - 6), role, fill=(30, 30, 30))
        x = label_w
        entries = [("printed", printed)] + cells
        for _, (fill, note) in entries:
            if fill is not None:
                draw.rectangle([x, y, x + size, y + size], fill=tuple(int(round(v)) for v in fill), outline=(120, 120, 120))
                draw.text((x, y + size + 2), note, fill=(60, 60, 60))
            x += size + pad
        y += size + 22 + pad
    sheets.save_png(path, np.asarray(image))


def sample(species):
    ref = sheets.ROOT / "characters" / species / "ref"
    roles = sheets.json.loads((sheets.ROOT / "characters" / species / "refmap" / "palette.json").read_text())["swatches"]
    panels = {p["id"]: p for p in sheets.json.loads((ref / "panels.json").read_text())["panels"]}
    measured = sheets.json.loads((ref / "measurements.json").read_text())
    printed, swatches = {}, {}
    for panel_id, role in roles.items():
        panel = panels[panel_id]
        value = re.search(r"#[0-9A-Fa-f]{6}", panel["label"]).group(0).upper()
        x0, y0, w, h = panel["box"]
        rgb = sheets.load_sheet(species, panel["sheet"])[y0:y0 + h, x0:x0 + w]
        got = swatch(rgb)
        printed[role] = value
        swatches[role] = {"panel": panel_id, "printed": value, "sampled": sheets.rgb_to_hex(got),
                          "deltaE2000": round(delta(got, value), 2)}
    views = {}
    masks = {}
    for view, record in measured["views"].items():
        x0, y0, w, h = record["box"]
        rgb = sheets.load_sheet(species, record["sheet"])[y0:y0 + h, x0:x0 + w]
        sil = np.asarray(Image.open(ref / record["silhouette"])) > 0
        found = regions(rgb, sil, record["landmarksPx"], view)
        masks[view] = (rgb, found)
        views[view] = {}
        for role, mask in found.items():
            colour, count = dominant(rgb, mask)
            entry = {"dominant": sheets.rgb_to_hex(colour), "pixels": count}
            if role in printed:
                entry["deltaE2000"] = round(delta(colour, printed[role]), 2)
            views[view][role] = entry
    rgb, found = masks["front"]
    alpha, peak = blush_opacity(rgb, found["blush"], printed["fur"], printed["blush"])
    outline = [sheets.hex_to_rgb(v[role]["dominant"]) for v in views.values() for role in ("outline",) if role in v]
    result = {
        "species": species, "printed": printed, "swatches": swatches, "views": views,
        "outline": sheets.rgb_to_hex(np.mean(outline, axis=0)),
        "blush": {"peak": sheets.rgb_to_hex(peak), "opacityOverFur": round(alpha, 2),
                  "peakDeltaE2000": round(delta(peak, printed["blush"]), 2)},
    }
    sheets.write_json(ref / "palette.json", result)
    rows = []
    for role in list(printed) + ["outline"]:
        cells = [("swatch", (sheets.hex_to_rgb(swatches[role]["sampled"]) if role in swatches else None,
                             f"dE {swatches[role]['deltaE2000']}" if role in swatches else ""))]
        for view in views:
            entry = views[view].get(role)
            note = "" if entry is None else (f"dE {entry['deltaE2000']}" if "deltaE2000" in entry else entry["dominant"])
            cells.append((view, (sheets.hex_to_rgb(entry["dominant"]) if entry else None, note)))
        value = printed.get(role, result["outline"])
        rows.append((role, (sheets.hex_to_rgb(value), value), cells))
    chip_image(rows, ref / "overlays" / "palette.png")
    for view, (rgb, found) in masks.items():
        tiles = []
        for role, mask in found.items():
            tile = (rgb * 0.25 + 191).astype(np.uint8)
            tile[mask] = rgb[mask]
            tiles.append(tile)
        sheets.save_png(ref / "overlays" / f"palette-regions-{view}.png", np.concatenate(tiles, axis=1))
    return result


def main(argv):
    if len(argv) != 1:
        print(__doc__)
        return 2
    result = sample(argv[0])
    worst = max(s["deltaE2000"] for s in result["swatches"].values())
    print(f"palette: {len(result['swatches'])} swatches, largest ΔE2000 {worst} against the printed values; "
          f"outline {result['outline']}; blush wash {result['blush']['opacityOverFur']} opaque")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
