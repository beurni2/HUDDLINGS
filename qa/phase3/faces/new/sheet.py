"""The new faces' review sheet, phone size: hungry and huffy, each variant beside the sheet panels it borrows from, and
Q2's alternative eyes beside the kitty's and the bear's panels that draw them, each labelled "new drawing" or "not on
the dog sheet". The renders come from new.ts (a scratch package that never ships); the panels are the dog's crops
(characters/dog/ref/panels) and, for Q2, the kitty's and the bear's expression sheets cut at fixed boxes, for review
only.

    python3 qa/phase3/faces/new/sheet.py <new.ts out folder> <out.png>"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[4]
PANELS = ROOT / "characters" / "dog" / "ref" / "panels"
SHEETS = ROOT / "characters" / "reference"
WIDTH = 1170  # an iPhone's width in pixels
HEAD_BOX = (-88, -178, 88, -52)  # model points round the head, lifted ears and stars included
RENDER_H = 228
PANEL_H = 120
GAP = 8

# For Q2: the kitty's and the bear's own panels, by their box on the 1280 x 960 sheet (x, y, w, h), as new.ts's
# alternatives copy them.
OTHER = {
    "kitty Excited": ("kitty", (285, 150, 220, 150)),
    "kitty Sparkle eye": ("kitty", (332, 826, 96, 52)),
    "bear Excited": ("bear", (282, 150, 230, 150)),
    "bear Sparkle eye": ("bear", (336, 826, 96, 52)),
}

GROUPS = [
    {"title": "hungry: new drawing (no panel; drawn from these)",
     "panels": ["expressions.expression.surprised", "expressions.expression.happy", "expressions.mouth.tiny-o", "master.expression.cheeky"],
     "stills": ["hungry-A-o", "hungry-A", "hungry-B-o", "hungry-B"],
     "captions": ["A ships: the o", "A ships: o.tongue", "B: the o", "B: o.tongue"]},
    {"title": "huffy: new drawing (no panel; drawn from these)",
     "panels": ["expressions.eyes.closed", "expressions.eyes.side-glance", "expressions.mouth.small-smile", "master.expression.content"],
     "stills": ["huffy-A", "huffy-A-peek", "huffy-B"],
     "captions": ["A ships: the huff", "A: the peek back", "B: the head puffed"]},
    {"title": "Q2 eyes: the alternatives are not on the dog sheet (the kitty's and the bear's)",
     "panels": ["kitty Excited", "bear Excited", "kitty Sparkle eye", "bear Sparkle eye"],
     "stills": ["q2-squeeze-default", "q2-squeeze-alt", "q2-sparkle-default", "q2-sparkle-alt"],
     "captions": ["squeeze, default: crescent", "squeeze, alt: > <", "sparkle, default", "sparkle, alt: star eyes"]},
]


def font(size):
    return ImageFont.load_default(size=size)


def head(still):
    """The still's head, cut at HEAD_BOX in model points, on white."""
    info = json.loads((still / "still.json").read_text())
    ppp, (rx, ry) = info["ppp"], info["rootPx"]
    im = Image.open(still / "white.png").convert("RGB")
    x0, y0, x1, y1 = HEAD_BOX
    size = (round((x1 - x0) * ppp), round((y1 - y0) * ppp))
    return im.transform(size, Image.EXTENT, (rx + x0 * ppp, ry + y0 * ppp, rx + x1 * ppp, ry + y1 * ppp), Image.BICUBIC, fillcolor=(255, 255, 255))


def panel(name):
    if name in OTHER:
        species, (x, y, w, h) = OTHER[name]
        return Image.open(SHEETS / species / "expressions.jpg").convert("RGB").crop((x, y, x + w, y + h))
    return Image.open(PANELS / name.split(".")[0] / f"{name}.png").convert("RGB")


def scaled(im, height):
    return im.resize((round(im.width * height / im.height), height), Image.LANCZOS)


def strip(images, captions, height, size):
    """Images side by side at one height, each captioned under it, scaled down together if they overflow the width."""
    tiles = [scaled(im, height) for im in images]
    # Each tile at least as wide as its caption, so no caption runs into the next.
    room = [max(t.width, round(font(size).getlength(c)) + 4) for t, c in zip(tiles, captions)]
    total = sum(room) + GAP * (len(tiles) - 1)
    if total > WIDTH:
        k = WIDTH / total
        tiles = [scaled(t, max(1, round(t.height * k))) for t in tiles]
        room = [max(t.width, round(font(size).getlength(c)) + 4) for t, c in zip(tiles, captions)]
    h = max(t.height for t in tiles) + size + 8
    out = Image.new("RGB", (WIDTH, h), "white")
    draw = ImageDraw.Draw(out)
    x = 0
    for t, caption, w in zip(tiles, captions, room):
        out.paste(t, (x, 0))
        draw.text((x + 2, t.height + 2), caption, fill=(40, 40, 40), font=font(size))
        x += w + GAP
    return out


def main(folder, out):
    folder = Path(folder)
    labels = {e["still"]: e for e in json.loads((folder / "new.json").read_text())}
    rows = []
    for g in GROUPS:
        title = Image.new("RGB", (WIDTH, 34), "white")
        ImageDraw.Draw(title).text((2, 6), g["title"], fill=(0, 0, 0), font=font(22))
        rows.append(title)
        rows.append(strip([panel(p) for p in g["panels"]], [p.split(".", 1)[-1] if p not in OTHER else p for p in g["panels"]], PANEL_H, 14))
        captions = [f"{c} · {labels[s]['label']}" for s, c in zip(g["stills"], g["captions"])]
        rows.append(strip([head(folder / s) for s in g["stills"]], captions, RENDER_H, 15))
        rows.append(Image.new("RGB", (WIDTH, 14), "white"))
    full = Image.new("RGB", (WIDTH, sum(r.height for r in rows)), "white")
    y = 0
    for r in rows:
        full.paste(r, (0, y))
        y += r.height
    # 256 colours keep it small enough to open from a pull request on a phone.
    full.quantize(colors=256).save(out, optimize=True)
    print(out, full.size)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
