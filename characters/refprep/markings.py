"""Shows the proposed marking map on the sheets (spec section 5b, phase 2): each
patch of refmap/markings.json coloured where it appears on each panel that
settles it, for the founder to judge at Gate A and for drawing the parts.

    python3 characters/refprep/markings.py dog

A patch is the tan region (measure.Classes) holding its seed point, inside its
clip box when it has one. Fails when a seed is not on tan, so a seed that misses
its patch is caught rather than drawn. Writes ref/markings.json (each patch's
area, centroid in the panel's pixels and dominant colour against the printed tan;
run palette.py first) and ref/overlays/markings-<panel>.png: the panel beside the
same panel with its patches coloured and named, and ref/overlays/markings-colours.png,
each patch's colour where it shows against the printed tan."""
import sys

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

import measure
import palette
import sheets
import silhouette

COLOURS = {"head.patch.L": (215, 50, 30), "head.patch.R": (30, 110, 215), "back.patch.L": (230, 120, 0),
           "back.patch.R": (20, 150, 70), "tail.base": (150, 40, 170), "rump.patch.L": (0, 150, 160)}
ZOOM = 2


def tan(rgb):
    """The tan areas of a panel's drawing, with specks and one-pixel bridges opened away."""
    cls = measure.Classes(rgb, silhouette.cut_out(rgb))
    return ndimage.binary_opening(cls.tan, np.ones((3, 3), bool))


def patch(area, seed, clip):
    x, y = seed
    region = area.copy()
    if clip:
        cx, cy, cw, ch = clip
        inside = np.zeros_like(area)
        inside[max(cy, 0):cy + ch, max(cx, 0):cx + cw] = True
        region &= inside
    if not (0 <= y < region.shape[0] and 0 <= x < region.shape[1] and region[y, x]):
        return None
    labels, _ = ndimage.label(region)
    return labels == labels[y, x]


def evidence(rgb, found, path):
    tinted = (rgb * 0.45 + 140).astype(np.uint8)
    for name, mask in found.items():
        tinted[mask] = COLOURS.get(name, (90, 90, 90))
    image = Image.fromarray(np.concatenate([rgb, tinted], axis=1))
    image = image.resize((image.width * ZOOM, image.height * ZOOM), Image.NEAREST)
    draw = ImageDraw.Draw(image)
    width = rgb.shape[1]
    taken = []
    for name, mask in found.items():
        x, y = measure.centroid(mask)
        left, top, right, bottom = draw.textbbox((0, 0), name)
        w, h = right - left + 2, bottom - top + 2
        tx, ty = (x + width) * ZOOM + 4, y * ZOOM - 6
        # Move a name down past any name already drawn where it would land.
        while any(tx < b[2] and b[0] < tx + w and ty < b[3] and b[1] < ty + h for b in taken):
            ty += h + 1
        taken.append((tx, ty, tx + w, ty + h))
        draw.text((tx, ty - top), name, fill=(0, 0, 0), stroke_width=1, stroke_fill=(255, 255, 255))
    sheets.save_png(path, np.asarray(image))


def colour_chart(plan, records, tan_printed, path):
    """Each patch's colour where it shows, against the printed tan: one row per marking."""
    rows = [("markings", [(None, "printed")] + [(None, "sightings, dE2000 to the printed tan")])]
    for marking in plan["markings"]:
        seen = [r for r in records if r["marking"] == marking["id"]]
        cells = [(sheets.hex_to_rgb(tan_printed), tan_printed)]
        cells += [(sheets.hex_to_rgb(r["dominant"]), f"{r['panel'].split('.')[-1].replace('main', 'hero')[:9]} {r['deltaE2000']}") for r in seen]
        rows.append((marking["id"], cells))
    palette.chip_image(rows, path)


def show(species):
    ref = sheets.ROOT / "characters" / species / "ref"
    plan = sheets.json.loads((sheets.ROOT / "characters" / species / "refmap" / "markings.json").read_text())
    panels = {p["id"]: p for p in sheets.json.loads((ref / "panels.json").read_text())["panels"]}
    ids = {m["id"] for m in plan["markings"]}
    tan_printed = sheets.json.loads((ref / "palette.json").read_text())["printed"]["marking"]
    problems, records = [], []
    for entry in plan["evidence"]:
        panel = panels[entry["panel"]]
        x0, y0, w, h = panel["box"]
        rgb = sheets.load_sheet(species, panel["sheet"])[y0:y0 + h, x0:x0 + w]
        area = tan(rgb)
        found = {}
        for name, places in entry["seeds"].items():
            if name not in ids:
                problems.append(f"{entry['panel']}: {name} is not in the marking map")
                continue
            # A patch can show as more than one region on a panel (a tail curling over it, a flank's edge).
            mask = np.zeros(area.shape, bool)
            for where in places if isinstance(places, list) else [places]:
                seed = [where["seed"][0] - x0, where["seed"][1] - y0]
                clip = [where["clip"][0] - x0, where["clip"][1] - y0, where["clip"][2], where["clip"][3]] if "clip" in where else None
                region = patch(area, seed, clip)
                if region is None:
                    problems.append(f"{entry['panel']}: the seed of {name} at {where['seed']} is not on tan")
                    continue
                mask |= region
            if not mask.any():
                continue
            found[name] = mask
            # Its colour away from its soft edge, against the printed tan.
            core = ndimage.binary_erosion(mask)
            colour, _ = palette.dominant(rgb, core if core.any() else mask)
            records.append({"panel": entry["panel"], "marking": name, "areaPx": int(mask.sum()),
                            "centroidPx": [round(v, 1) for v in measure.centroid(mask)],
                            "dominant": sheets.rgb_to_hex(colour), "deltaE2000": round(palette.delta(colour, tan_printed), 2)})
        evidence(rgb, found, ref / "overlays" / f"markings-{entry['panel']}.png")
    if problems:
        raise SystemExit("markings: " + "; ".join(problems))
    shown = {name for record in records for name in [record["marking"]]}
    missing = ids - shown
    if missing:
        raise SystemExit(f"markings: no panel shows {sorted(missing)}")
    colour_chart(plan, records, tan_printed, ref / "overlays" / "markings-colours.png")
    result = {"species": species, "markings": plan["markings"], "evidence": records}
    sheets.write_json(ref / "markings.json", result)
    return result


def main(argv):
    if len(argv) != 1:
        print(__doc__)
        return 2
    result = show(argv[0])
    print(f"markings: {len(result['markings'])} patches proposed, {len(result['evidence'])} sightings on "
          f"{len({r['panel'] for r in result['evidence']})} panels")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
