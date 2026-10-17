"""Each place the line gate finds when it counts only what shows (gate.txt, DECISIONS 264), pictured: the sheet's crop
there and the still that draws it (the rest still, or the face's still), zoomed, the bare stretch marked beside it.
Composites no clip draws (a state among the rest of the parts at rest) have no still and are listed only.

    python3 qa/phase3/fur/recipes2/gatepic.py [--stills build/stills/dog]
"""
import json
import re
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

here = Path(__file__).resolve().parent
repo = here.parents[3]
ZOOM, MARGIN = 14, 6.0  # px per pt in the picture; pt round the finding


def sheet_tile(view, box):
    m = json.loads((repo / "characters/dog/model.json").read_text())["crops"][view]
    im = Image.open(repo / "characters/dog/ref/panels/master" / f"{m['crop']}.png").convert("RGB")
    k, (gx, gy) = m["ptPerCropPx"], m["anchorsCropPx"]["ground"]
    x0, y0, x1, y1 = box
    src = (gx + 0.5 + x0 / k, gy + 0.5 + y0 / k, gx + 0.5 + x1 / k, gy + 0.5 + y1 / k)
    return im.transform((round((x1 - x0) * ZOOM), round((y1 - y0) * ZOOM)), Image.EXTENT, src, Image.BICUBIC)


def still_tile(still, box, mark):
    meta = json.loads((still / "still.json").read_text())
    p, (rx, ry) = meta["ppp"], meta["rootPx"]
    im = Image.open(still / "white.png").convert("RGB")
    x0, y0, x1, y1 = box
    tile = im.transform((round((x1 - x0) * ZOOM), round((y1 - y0) * ZOOM)), Image.EXTENT, (rx + x0 * p, ry + y0 * p, rx + x1 * p, ry + y1 * p), Image.BICUBIC)
    marked = tile.copy()
    d = ImageDraw.Draw(marked)
    (ax, ay), (bx, by) = mark
    r = 0.9 * ZOOM
    for x, y in ((ax, ay), (bx, by)):
        cx, cy = (x - x0) * ZOOM, (y - y0) * ZOOM
        d.ellipse((cx - r, cy - r, cx + r, cy + r), outline=(220, 30, 60), width=2)
    return tile, marked


def main(argv):
    stills = Path(argv[argv.index("--stills") + 1]) if "--stills" in argv else repo / "build/stills/dog"
    found = re.compile(r"^\s+([\w.]+)/(\w+)(?::([\w]+))?: the edge of ([\w.]+) shows ([\d.]+) pt below full line width from \(([-\d.]+), ([-\d.]+)\) to \(([-\d.]+), ([-\d.]+)\)")
    rows, seen, listed = [], set(), []
    for line in (here / "gate.txt").read_text().splitlines():
        m = found.match(line)
        if not m:
            continue
        part, view, state, shape, pt = m.group(1), m.group(2), m.group(3), m.group(4), m.group(5)
        a, b = (float(m.group(6)), float(m.group(7))), (float(m.group(8)), float(m.group(9)))
        if state is None:
            still, label = stills / view, f"{view} at rest"
        elif state.startswith("face_"):
            still, label = stills / "faces" / state[5:], f"{view}, face {state[5:]}"
        else:
            listed.append(f"{part}/{view}:{state}: {shape}'s edge {pt} pt bare at ({a[0]}, {a[1]}) (no clip draws this composite)")
            continue
        key = (shape, a, b)
        if key in seen:  # the same break in another face: pictured once, named in the label
            for r in rows:
                if r["key"] == key:
                    r["faces"].append(state[5:] if state else "rest")
            continue
        seen.add(key)
        box = (min(a[0], b[0]) - MARGIN, min(a[1], b[1]) - MARGIN, max(a[0], b[0]) + MARGIN, max(a[1], b[1]) + MARGIN)
        rows.append({"key": key, "label": f"{shape}'s edge, {pt} pt below full width ({label})", "faces": [state[5:] if state else "rest"], "view": view, "still": still, "box": box, "mark": (a, b)})
    font = ImageFont.load_default()
    tiles = []
    for r in rows:
        sheet = sheet_tile(r["view"], r["box"])
        plain, marked = still_tile(r["still"], r["box"], r["mark"])
        tiles.append((f"{r['label']}; in: {', '.join(r['faces'])}", [sheet, plain, marked]))
    W = max(sum(t.width for t in ts) + 12 * (len(ts) + 1) for _, ts in tiles)
    H = sum(max(t.height for t in ts) + 34 for _, ts in tiles) + 40 + 16 * len(listed)
    out = Image.new("RGB", (W, H), "white")
    d = ImageDraw.Draw(out)
    d.text((12, 8), "What the line gate finds counting only what shows (DECISIONS 264): sheet | today's still | the bare stretch's ends ringed", fill=(40, 30, 20), font=font)
    y = 30
    for text, ts in tiles:
        d.text((12, y), text, fill=(40, 30, 20), font=font)
        y += 16
        x = 12
        for t in ts:
            out.paste(t, (x, y))
            x += t.width + 12
        y += max(t.height for t in ts) + 18
    for text in listed:
        d.text((12, y), text, fill=(90, 70, 60), font=font)
        y += 16
    out.save(here / "gate.png", optimize=True)
    print(f"{len(rows)} pictured, {len(listed)} listed: {here / 'gate.png'}")


if __name__ == "__main__":
    main(sys.argv[1:])
