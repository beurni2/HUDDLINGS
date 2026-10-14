"""Samples the palette (spec section 5b, phase 2): each swatch the master sheet
prints, and the dominant colour of each region of the drawn turnaround, against
the printed values, as CIEDE2000.

    python3 characters/refprep/palette.py dog

Reads ref/panels.json, ref/measurements.json, and refmap/palette.json for the
swatches' roles and the boxes drawn around the blushing cheeks (run crop.py and
measure.py first). Writes ref/palette.json and the evidence image
ref/overlays/palette.png: each swatch against its printed value, each region's
dominant colour in every view against the printed value it is held to, and the
blush's level on each cheek sampled; ref/overlays/palette-regions-<view>.png
shows each region, and ref/overlays/palette-blush.png each cheek's box.

The printed values are the palette (spec section 5, L189: "the dog and rabbit
values are their sheets' printed labels"); this records how far the sheet's own
pixels are from them. A region's dominant colour is the mean of the pixels in the
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


# Each region of the drawing, and the printed value it is held to (spec section 5, Palettes; L507 makes the
# printed Soft Shadow the fur's soft shade, "the fill 8-12% darker"). None: the sheet prints no value for it.
HELD_TO = {
    "fur": "fur", "furShade": "shadow", "ears": "marking", "eyes": "dark", "lowerIris": "dark", "nose": "dark",
    "tongue": "blush", "mouthInside": None, "collar": "collar", "tag": "tag", "groundShadow": "shadow", "outline": None,
}


def lower_iris(eye_masks, L):
    """The lighter lower iris: each eye's lowest quarter, catchlights and the white rim left out."""
    lower = np.zeros(L.shape, bool)
    for eye in eye_masks:
        rows = np.nonzero(eye)[0]
        band_eye = eye.copy()
        band_eye[:int(rows.max() - 0.25 * (rows.max() - rows.min())), :] = False
        lower |= band_eye & (L > 12) & (L < 50)
    return lower


def mouth_inside(lab, near, opening):
    """The open mouth's dark red inside, near its pink opening (the tongue) and not part of it."""
    L, a, b = lab[..., 0], lab[..., 1], lab[..., 2]
    hue = np.degrees(np.arctan2(b, a)) % 360
    return near & (a > 20) & (L < 50) & (hue < 45) & ~opening


def fur_shade(cls, lab, inside, fur_l, eye_area):
    """The fur's soft shade: cream 3 to 12 L* darker than the fur (fur_l), not tan, not a line, not a feature,
    and yellower than the blush's wash (hue above 65 degrees; the blush sits at 50 to 60)."""
    hue = np.degrees(np.arctan2(lab[..., 2], lab[..., 1])) % 360
    others = ndimage.binary_dilation(cls.tan | cls.line | cls.pink | cls.blue | cls.gold, iterations=2) | eye_area
    return (inside & ~others & (cls.L >= fur_l - 12) & (cls.L <= fur_l - 3) & (cls.C < 26)
            & (hue > 65) & (hue < 100))


def regions(rgb, sil, view):
    """The masks of the palette's regions in one turnaround crop."""
    cls = measure.Classes(rgb, sil)
    lab = sheets.to_lab(rgb)
    L, a, b = lab[..., 0], lab[..., 1], lab[..., 2]
    C = np.hypot(a, b)
    band, _ = measure.collar(cls)
    _, ears = measure.ears(cls, 1 if view == "side.L" else 2, band)
    tag_mask, _ = measure.tag(cls)
    inside = ndimage.binary_erosion(sil, iterations=3)
    # The ears' tan region also holds the head patches that run into their roots with no line between; the
    # ears are far larger, so its dominant colour is theirs. The patches are sampled alone in markings.py.
    found = {"ears": np.any(ears, axis=0), "collar": cls.blue, "tag": tag_mask}
    eye_area = np.zeros_like(sil)
    if view != "back":
        eye_masks = measure.eyes(cls, 1 if view == "side.L" else 2)
        eye_area = np.any([ndimage.binary_dilation(e, iterations=3) for e in eye_masks], axis=0)
        nose, mouth_open = measure.nose_and_mouth(cls, eye_masks, "front" if view == "front" else "left")
        found["eyes"] = np.any(eye_masks, axis=0) & (L < 40)
        found["lowerIris"] = lower_iris(eye_masks, L)
        found["nose"] = nose & (L < 40)
        if mouth_open is not None:
            found["tongue"] = mouth_open
            found["mouthInside"] = mouth_inside(lab, ndimage.binary_dilation(mouth_open, iterations=6), mouth_open)
    fur = inside & (L >= 88) & (C < 20) & ~eye_area & ~ndimage.binary_dilation(cls.blue | cls.gold, iterations=3)
    found["fur"] = fur
    found["furShade"] = fur_shade(cls, lab, inside, float(np.median(L[fur])), eye_area)
    # The outline: the core of the outer line, within two pixels of the silhouette's edge.
    found["outline"] = sil & ~ndimage.binary_erosion(sil, iterations=2) & (L < 55) & (C > 8)
    # The ground shadow: below the body, outside the silhouette, darker than the card and nearly neutral.
    ys = np.nonzero(sil)[0]
    low = np.zeros_like(sil)
    low[int(ys.max() - 0.08 * (ys.max() - ys.min())):, :] = True
    card = np.median(np.concatenate([lab[0], lab[:, 0], lab[:, -1]]), axis=0)
    away = sheets.delta_e2000(lab, card[None, None, :]) > 2.5
    found["groundShadow"] = low & ~ndimage.binary_dilation(sil, iterations=2) & away & (C < 12)
    return {k: v for k, v in found.items() if v is not None and v.any()}


def check_blush_box(where, panels):
    """A cheek box must lie inside the panel it names, so a box moved onto another panel fails."""
    panel = panels[where["panel"]]
    if not inside(where["box"], panel["box"]):
        raise ValueError(f"the blush box {where['box']} is not inside {where['panel']} {panel['box']}")
    return panel


def inside(box, outer):
    """Whether a box [x, y, width, height] lies wholly inside another."""
    x, y, w, h = box
    ox, oy, ow, oh = outer
    return ox <= x and oy <= y and x + w <= ox + ow and y + h <= oy + oh


def blush(rgb, fur_hex, blush_hex):
    """The blush in a box drawn around a cheek: the reddest tenth of its light pixels (L* above 70, the eye
    and its lines left out), and how opaque the printed blush over the printed fur must be to give it,
    fitted in sRGB. The spec makes the blush a level from 0 to 100% (L474)."""
    pixels = rgb.reshape(-1, 3)
    lab = sheets.to_lab(pixels)
    light = (lab[:, 0] > 70) & (np.hypot(lab[:, 1], lab[:, 2]) < 30)
    values = lab[light, 1]
    peak = pixels[light][values >= np.quantile(values, 0.9)].astype(float).mean(axis=0)
    fur, pink = sheets.hex_to_rgb(fur_hex).astype(float), sheets.hex_to_rgb(blush_hex).astype(float)
    direction = pink - fur
    alpha = float(np.clip(np.dot(peak - fur, direction) / np.dot(direction, direction), 0, 1))
    return alpha, peak


def chip_image(rows, path):
    """One row per entry: a label, then chips, each with a note under it; a row of notes alone is a heading."""
    size, pad, label_w = 40, 6, 150
    columns = max(len(cells) for _, cells in rows)
    width = label_w + columns * (size + 30 + pad) + pad
    height = pad + sum((18 if all(f is None for f, _ in cells) else size + 22) + pad for _, cells in rows)
    image = Image.new("RGB", (width, height), (255, 255, 255))
    draw = ImageDraw.Draw(image)
    y = pad
    for label, cells in rows:
        heading = all(fill is None for fill, _ in cells)
        draw.text((pad, y + (4 if heading else size // 2 - 6)), label, fill=(30, 30, 30))
        x = label_w
        for fill, note in cells:
            if fill is not None:
                draw.rectangle([x, y, x + size, y + size], fill=tuple(int(round(v)) for v in fill), outline=(120, 120, 120))
            draw.text((x, y + (4 if heading else size + 2)), note, fill=(60, 60, 60))
            x += size + 30 + pad
        y += (18 if heading else size + 22) + pad
    sheets.save_png(path, np.asarray(image))


def sample(species):
    ref = sheets.ROOT / "characters" / species / "ref"
    plan = sheets.json.loads((sheets.ROOT / "characters" / species / "refmap" / "palette.json").read_text())
    panels = {p["id"]: p for p in sheets.json.loads((ref / "panels.json").read_text())["panels"]}
    measured = sheets.json.loads((ref / "measurements.json").read_text())
    printed, swatches = {}, {}
    for panel_id, role in plan["swatches"].items():
        panel = panels[panel_id]
        found = re.search(r"#[0-9A-Fa-f]{6}", panel.get("label", ""))
        if not found:
            raise ValueError(f"{panel_id}: its label prints no colour")
        value = found.group(0).upper()
        x0, y0, w, h = panel["box"]
        got = swatch(sheets.load_sheet(species, panel["sheet"])[y0:y0 + h, x0:x0 + w])
        printed[role] = value
        swatches[role] = {"panel": panel_id, "printed": value, "sampled": sheets.rgb_to_hex(got),
                          "deltaE2000": round(delta(got, value), 2)}
    views, masks = {}, {}
    for view, record in measured["views"].items():
        x0, y0, w, h = record["box"]
        rgb = sheets.load_sheet(species, record["sheet"])[y0:y0 + h, x0:x0 + w]
        sil = np.asarray(Image.open(ref / record["silhouette"])) > 0
        found = regions(rgb, sil, view)
        masks[view] = (rgb, found)
        views[view] = {}
        for role in HELD_TO:
            if role not in found:
                continue
            colour, count = dominant(rgb, found[role])
            entry = {"dominant": sheets.rgb_to_hex(colour), "pixels": count}
            if HELD_TO[role]:
                entry["heldTo"] = HELD_TO[role]
                entry["deltaE2000"] = round(delta(colour, printed[HELD_TO[role]]), 2)
            views[view][role] = entry
    cheeks, tiles = [], []
    for where in plan["blush"]:
        panel = check_blush_box(where, panels)
        x, y, w, h = where["box"]
        px, py, pw, ph = panel["box"]
        sheet = sheets.load_sheet(species, panel["sheet"])
        alpha, peak = blush(sheet[y:y + h, x:x + w], printed["fur"], printed["blush"])
        cheeks.append({"panel": where["panel"], "box": where["box"], "note": where["note"],
                       "peak": sheets.rgb_to_hex(peak), "opacity": round(alpha, 2)})
        crop = Image.fromarray(sheet[py:py + ph, px:px + pw]).resize((pw * 2, ph * 2), Image.NEAREST)
        draw = ImageDraw.Draw(crop)
        draw.rectangle([(x - px) * 2, (y - py) * 2, (x - px + w) * 2 - 1, (y - py + h) * 2 - 1], outline=(0, 110, 255), width=2)
        # The label goes above the panel, on a strip as wide as it needs.
        label = f"{where['panel']}: {alpha:.0%}"
        width = max(crop.width, int(draw.textlength(label)) + 8)
        tile = Image.new("RGB", (width, crop.height + 16), (255, 255, 255))
        tile.paste(crop, (0, 16))
        ImageDraw.Draw(tile).text((4, 2), label, fill=(0, 60, 160))
        tiles.append(np.asarray(tile))
    resting = [c["opacity"] for c in cheeks if c["panel"].startswith("master.turnaround.")]
    outline = [sheets.hex_to_rgb(v["outline"]["dominant"]) for v in views.values() if "outline" in v]
    result = {
        "species": species, "printed": printed, "swatches": swatches, "views": views,
        "outline": sheets.rgb_to_hex(np.mean(outline, axis=0)),
        "blush": {"turnaroundOpacity": round(float(np.mean(resting)), 2), "cheeks": cheeks},
    }
    sheets.write_json(ref / "palette.json", result)
    rows = [("swatches", [(None, "printed"), (None, "sampled")])]
    rows += [(f"{role} swatch", [(sheets.hex_to_rgb(s["printed"]), s["printed"]), (sheets.hex_to_rgb(s["sampled"]), f"dE {s['deltaE2000']}")])
             for role, s in swatches.items()]
    rows.append(("regions (held to)", [(None, "printed")] + [(None, view[:10]) for view in views]))
    for role, held in HELD_TO.items():
        reference = printed[held] if held else result["outline"] if role == "outline" else None
        cells = [(sheets.hex_to_rgb(reference) if reference else None, reference or "no value")]
        for view in views:
            entry = views[view].get(role)
            note = "" if entry is None else (f"dE {entry['deltaE2000']}" if "deltaE2000" in entry else entry["dominant"])
            cells.append((sheets.hex_to_rgb(entry["dominant"]) if entry else None, note))
        rows.append((f"{role} ({held or 'sampled'})", cells))
    rows.append(("blush cheeks", [(None, "printed")] + [(None, c["panel"].split(".")[-1].replace("main", "hero")[:10]) for c in cheeks]))
    rows.append(("blush (level)", [(sheets.hex_to_rgb(printed["blush"]), printed["blush"])] +
                 [(sheets.hex_to_rgb(c["peak"]), f"{c['opacity']:.0%}") for c in cheeks]))
    chip_image(rows, ref / "overlays" / "palette.png")
    width = max(t.shape[1] for t in tiles)
    sheets.save_png(ref / "overlays" / "palette-blush.png",
                    np.concatenate([np.pad(t, ((0, 6), (0, width - t.shape[1]), (0, 0)), constant_values=255) for t in tiles]))
    for view, (rgb, found) in masks.items():
        tiles = []
        for role in HELD_TO:
            if role in found:
                tile = (rgb * 0.25 + 191).astype(np.uint8)
                tile[found[role]] = rgb[found[role]]
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
          f"outline {result['outline']}; the turnaround's blush at {result['blush']['turnaroundOpacity']:.0%}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
