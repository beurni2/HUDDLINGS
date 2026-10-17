"""The fur kit's second round, as evidence (DECISIONS 260 to 263): for each option, rows of the sheet's crop, today's
drawing and the drawing with the option, cut to the same box in model points from WebGL stills of scratch builds
(try.ts) and zoomed to the same scale, then each view whole at phone size (the stills' own 3 px/pt, not resampled).
A row that names a hero box shows master.hero.main's crop first, at the row's height (the hero is not placeable).

    node qa/phase3/fur/recipes2/try.ts <root>/today today front threeQuarter.L side.L back
    node qa/phase3/fur/recipes2/try.ts <root>/<option> <option> <views...>     (weight, chin, topknot, toes)
    python3 qa/phase3/fur/recipes2/sheet.py <root> [option...]
"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[3]
PANELS = REPO / "characters/dog/ref/panels/master"
CROPS = json.loads((REPO / "characters/dog/model.json").read_text())["crops"]

# Each view whole, as it shows on a phone (3 px/pt).
PHONE = {"front": [-90, -170, 180, 176], "threeQuarter.L": [-100, -170, 170, 176], "side.L": [-100, -170, 150, 176], "back": [-90, -170, 180, 176]}

# Each option's rows: its label, the view, the box in model points [x, y, w, h] (y down, the ground at 0), the zoom in
# output pixels per point, and a hero box in its pixels [x, y, w, h] when the row is shown beside the hero.
OPTIONS = {
    "weight": {
        "title": "260 the living line weight: lines.ts, a span's weight: { seed }",
        "rows": [
            ("front: the legs, the paws and the haunches (zoom 5)", "front", [-56, -48, 112, 50], 5, [80, 250, 210, 120]),
            ("three-quarter: the legs and the paws (zoom 4)", "threeQuarter.L", [-84, -62, 124, 64], 4, None),
            ("side: the body, the legs and the tail (zoom 3.5)", "side.L", [-100, -86, 150, 90], 3.5, None),
            ("back: the body, the haunches and the tail (zoom 3)", "back", [-70, -104, 140, 108], 3, None),
        ],
        "views": ["front", "threeQuarter.L", "side.L", "back"],
    },
    "chin": {
        "title": "261 the soft chin: headfur.ts, a chin's soft: { wisps, firm }",
        "rows": [
            ("front: the chin over the collar (zoom 8), beside the hero's", "front", [-30, -80, 60, 26], 8, [95, 168, 170, 74]),
            ("three-quarter: the chin over the collar (zoom 7)", "threeQuarter.L", [-92, -82, 76, 28], 7, None),
            ("side: the chin and the jaw over the collar (zoom 6)", "side.L", [-98, -88, 60, 34], 6, None),
        ],
        "views": ["front", "threeQuarter.L", "side.L"],
    },
    "topknot": {
        "title": "262 the crisp topknot: topknot.ts, topknot(curls, paint, { crisp: true })",
        "rows": [
            ("front: the topknot (zoom 10), beside the hero's", "front", [-34, -168, 60, 22], 10, [100, 0, 140, 52]),
            ("three-quarter: the topknot (zoom 9)", "threeQuarter.L", [-70, -170, 64, 24], 9, None),
        ],
        "views": ["front", "threeQuarter.L"],
    },
    "toes": {
        "title": "263 toe lines along the dome: paw.ts, toes({ ..., dome })",
        "rows": [
            ("front: the paws (zoom 8), beside the hero's", "front", [-48, -15, 96, 17], 8, [80, 318, 205, 52]),
            ("side: the near paws (zoom 8)", "side.L", [-68, -18, 56, 20], 8, None),
        ],
        "views": ["front", "side.L"],
    },
}


def font(size):
    for f in ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/TTF/DejaVuSans.ttf"):
        if Path(f).exists():
            return ImageFont.truetype(f, size)
    return ImageFont.load_default()


def sheet_crop(view, box, zoom):
    """The view's turnaround crop at the box, placed as the sheet match places it (its root on its ground anchor)."""
    m = CROPS[view]
    im = Image.open(PANELS / f"{m['crop']}.png").convert("RGB")
    k = m["ptPerCropPx"]
    gx, gy = m["anchorsCropPx"]["ground"]
    x, y, w, h = box
    src = (gx + 0.5 + x / k, gy + 0.5 + y / k, gx + 0.5 + (x + w) / k, gy + 0.5 + (y + h) / k)
    return im.transform((round(w * zoom), round(h * zoom)), Image.EXTENT, src, Image.BICUBIC, fillcolor="white")


def still_dir(root, view):
    many = root / "stills" / f"still_{view}"
    return many if many.exists() else root / "stills"


def still_crop(root, view, box, zoom):
    d = still_dir(root, view)
    meta = json.loads((d / "still.json").read_text())
    ppp, (rx, ry) = meta["ppp"], meta["rootPx"]
    im = Image.open(d / "white.png").convert("RGB")
    x, y, w, h = box
    # Past the still's own canvas, the card's white.
    l, t = round(rx + x * ppp), round(ry + y * ppp)
    crop = Image.new("RGB", (round(w * ppp), round(h * ppp)), "white")
    crop.paste(im, (-l, -t))
    size = (round(w * zoom), round(h * zoom))
    return crop if crop.size == size else crop.resize(size, Image.LANCZOS)


def hero_crop(box, height):
    im = Image.open(PANELS / "master.hero.main.png").convert("RGB")
    x, y, w, h = box
    return im.crop((x, y, x + w, y + h)).resize((round(w * height / h), height), Image.LANCZOS)


def build(root, option):
    spec = OPTIONS[option]
    GAP, LABEL = 12, 24
    rows = []
    for label, view, box, zoom, hero in spec["rows"]:
        tiles = [("sheet", sheet_crop(view, box, zoom)), ("today", still_crop(root / "today", view, box, zoom)), (option, still_crop(root / option, view, box, zoom))]
        if hero:
            tiles.insert(0, ("hero", hero_crop(hero, tiles[0][1].height)))
        rows.append((label, tiles))
    for view in spec["views"]:
        box = PHONE[view]
        rows.append((f"{view} at phone size (3 px/pt)", [("sheet", sheet_crop(view, box, 3)), ("today", still_crop(root / "today", view, box, 3)), (option, still_crop(root / option, view, box, 3))]))
    width = max(GAP + sum(t.width + GAP for _, t in tiles) for _, tiles in rows)
    height = 40 + sum(LABEL + max(t.height for _, t in tiles) + GAP for _, tiles in rows)
    out = Image.new("RGB", (width, height), "white")
    d = ImageDraw.Draw(out)
    d.text((GAP, 10), spec["title"], fill=(58, 42, 32), font=font(18))
    y = 40
    for label, tiles in rows:
        d.text((GAP, y + 3), label, fill=(58, 42, 32), font=font(15))
        y += LABEL
        x = GAP
        for name, t in tiles:
            out.paste(t, (x, y))
            d.text((x + 6, y + t.height - 18), name, fill=(122, 106, 94), font=font(13))
            x += t.width + GAP
        y += max(t.height for _, t in tiles) + GAP
    path = HERE / f"{option}.png"
    # Small enough to open on a phone: 256 colours.
    out.convert("P", palette=Image.Palette.ADAPTIVE, colors=256).save(path, optimize=True)
    print(path, out.size)


if __name__ == "__main__":
    root = Path(sys.argv[1])
    for option in sys.argv[2:] or list(OPTIONS):
        build(root, option)
