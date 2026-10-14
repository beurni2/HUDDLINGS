"""Crops every panel of a species' four master sheets at its original size
(spec section 5b, phase 2), from the hand-written panel map in
characters/<species>/refmap/panels.json.

    python3 characters/refprep/crop.py dog
    python3 characters/refprep/crop.py dog --map <panels.json> --only <sheet> --out <folder>

Writes characters/<species>/ref/panels/<sheet>/<id>.png, the index
ref/panels.json (each panel's final box, kind, view, facing, label and hash),
and ref/overlays/panels-<sheet>.jpg, every box drawn on its sheet for review.
Fails when a box leaves its sheet, an id repeats, or a drawn item on a sheet
belongs to no panel and no label: every panel is cropped.

A panel's box is tightened to what is drawn inside it (plus PAD pixels) unless
the map says "tighten": false, so a hand-drawn box need only enclose its panel.
What is drawn is the ink, and the soft ground shadow under a figure, which is
too pale to count as ink but is an airborne pose's only ground line."""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

import sheets

PAD = 4
SHADOW_DELTA = 3.0  # ΔE2000 from the card
SHADOW_WARMER = 2.5  # C* above the card's
SHADOW_AREA = 150  # px: smaller warm specks are JPEG noise
# A drawn item this large (in pixels of ink) must belong to a panel or a label.
MIN_ITEM = 40
KINDS = {"hero", "view", "pose", "cycle", "expression", "face", "eyes", "mouth", "ears", "part", "feature",
         "shape", "swatch", "guide", "text", "assembly"}


def load_map(species, path=None):
    path = Path(path) if path else sheets.ROOT / "characters" / species / "refmap" / "panels.json"
    return sheets.json.loads(path.read_text(encoding="utf-8"))


def ground_shadows(rgb, box):
    """The soft ground shadows inside a box: patches of at least SHADOW_AREA pixels more than SHADOW_DELTA
    from the card (the median of the box's border), warmer than the card by SHADOW_WARMER in C* and paler
    than ink. The card's own frame and tints are as grey as the card, and the fur is lighter."""
    x, y, w, h = box
    lab = sheets.to_lab(rgb[y:y + h, x:x + w])
    card = np.median(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]), axis=0)
    C = np.hypot(lab[..., 1], lab[..., 2])
    soft = ((sheets.delta_e2000(lab, card[None, None, :]) > SHADOW_DELTA) & (C > np.hypot(card[1], card[2]) + SHADOW_WARMER)
            & (C < 14) & (lab[..., 0] >= 80) & (lab[..., 0] < 94))
    labels, count = ndimage.label(soft)
    sizes = ndimage.sum(soft, labels, range(1, count + 1)) if count else np.array([])
    found = np.zeros(rgb.shape[:2], bool)
    found[y:y + h, x:x + w] = np.isin(labels, 1 + np.nonzero(sizes >= SHADOW_AREA)[0])
    return found


def tighten(ink, box):
    x, y, w, h = box
    region = ink[y:y + h, x:x + w]
    rows, cols = np.nonzero(region)
    if len(rows) == 0:
        return box
    x0, x1 = max(x + cols.min() - PAD, x), min(x + cols.max() + PAD + 1, x + w)
    y0, y1 = max(y + rows.min() - PAD, y), min(y + rows.max() + PAD + 1, y + h)
    return [int(x0), int(y0), int(x1 - x0), int(y1 - y0)]


def panel_box(rgb, ink, entry):
    """A panel's final box: its hand-drawn box, tightened unless the map says not to."""
    if not entry.get("tighten", True):
        return list(entry["box"])
    return tighten(ink | ground_shadows(rgb, entry["box"]), entry["box"])


def check_box(box, shape, where):
    x, y, w, h = box
    if w <= 0 or h <= 0 or x < 0 or y < 0 or x + w > shape[1] or y + h > shape[0]:
        raise SystemExit(f"crop: {where}: box {box} leaves the {shape[1]} x {shape[0]} sheet")


def uncovered_items(ink, boxes):
    """Drawn items (connected ink, after closing small gaps) that touch no box."""
    covered = np.zeros(ink.shape, bool)
    for x, y, w, h in boxes:
        covered[y:y + h, x:x + w] = True
    items, count = ndimage.label(ndimage.binary_closing(ink, np.ones((3, 3), bool)))
    missing = []
    for index, found in enumerate(ndimage.find_objects(items), start=1):
        mask = items[found] == index
        if mask.sum() >= MIN_ITEM and not (covered[found] & mask).any():
            ys, xs = found
            missing.append([xs.start, ys.start, xs.stop - xs.start, ys.stop - ys.start])
    return missing


def crop(species, map_path=None, only=None, out=None):
    panel_map = load_map(species, map_path)
    out = Path(out) if out else sheets.ROOT / "characters" / species / "ref"
    index, seen, problems = [], set(), []
    for sheet in sheets.SHEETS if only is None else (only,):
        rgb = sheets.load_sheet(species, sheet)
        ink = sheets.ink_mask(rgb)
        entries = panel_map["sheets"][sheet]
        overlay = Image.fromarray(rgb).convert("RGB")
        draw = ImageDraw.Draw(overlay)
        boxes = []
        for entry in entries:
            pid = entry["id"]
            where = f"{sheet}/{pid}"
            if pid in seen:
                raise SystemExit(f"crop: {where}: the id is used twice")
            seen.add(pid)
            if entry["kind"] not in KINDS:
                raise SystemExit(f"crop: {where}: unknown kind {entry['kind']!r}")
            check_box(entry["box"], rgb.shape, where)
            box = panel_box(rgb, ink, entry)
            x, y, w, h = box
            path = out / "panels" / sheet / f"{pid}.png"
            sheets.save_png(path, rgb[y:y + h, x:x + w])
            record = {"id": pid, "sheet": sheet, "box": box, "kind": entry["kind"], "file": str(path.relative_to(out))}
            for key in ("label", "view", "facing", "note"):
                if key in entry:
                    record[key] = entry[key]
            if "labelBox" in entry:
                check_box(entry["labelBox"], rgb.shape, where + " label")
                record["labelBox"] = entry["labelBox"]
                boxes.append(entry["labelBox"])
                lx, ly, lw, lh = entry["labelBox"]
                draw.rectangle([lx, ly, lx + lw - 1, ly + lh - 1], outline=(40, 120, 255), width=1)
            record["pixelsSha256"] = sheets.pixels_sha256(rgb[y:y + h, x:x + w])
            index.append(record)
            boxes.append(box)
            draw.rectangle([x, y, x + w - 1, y + h - 1], outline=(230, 30, 30), width=1)
            draw.text((x + 2, y + 1), pid, fill=(200, 0, 0))
        for extra in panel_map.get("labels", {}).get(sheet, []):
            check_box(extra, rgb.shape, f"{sheet} label")
            boxes.append(extra)
            lx, ly, lw, lh = extra
            draw.rectangle([lx, ly, lx + lw - 1, ly + lh - 1], outline=(40, 120, 255), width=1)
        for item in uncovered_items(ink, boxes):
            problems.append(f"{sheet}: a drawn item at {item} (x, y, w, h) belongs to no panel or label")
            ix, iy, iw, ih = item
            draw.rectangle([ix, iy, ix + iw - 1, iy + ih - 1], outline=(255, 0, 255), width=2)
        sheets.save_jpeg(out / "overlays" / f"panels-{sheet}.jpg", np.asarray(overlay))
    sheets.write_json(out / "panels.json", {"species": species, "panels": index})
    return index, problems


def main(argv):
    import argparse
    parser = argparse.ArgumentParser(usage=__doc__)
    parser.add_argument("species")
    parser.add_argument("--map")
    parser.add_argument("--only", choices=sheets.SHEETS)
    parser.add_argument("--out")
    args = parser.parse_args(argv)
    if args.only and not args.out:
        parser.error("--only writes one sheet's index, so it needs --out (it would replace ref/panels.json)")
    index, problems = crop(args.species, args.map, args.only, args.out)
    for problem in problems:
        print(f"crop: {problem}")
    print(f"crop: {len(index)} panels" + (f", {len(problems)} item(s) uncovered" if problems else ""))
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
