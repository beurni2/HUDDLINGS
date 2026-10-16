"""The founder's eye decisions on one sheet, phone size (docs/QUESTIONS.md Q2, Q26, Q28; DECISIONS 200 to 204): the
squeeze beside the kitty's and the bear's Excited, the star sparkle beside their Sparkle eyes, the open eye's two
catchlights beside their Default eyes and the dog's own open eye panel, and the catchlights riding the iris. The
renders come from eyes.ts (each eye state on the rest face) and the Faces check's stills (ticklish and proud, as the
package plays them); the other sheets' panels are cut at fixed boxes, for review only.

    python3 qa/phase3/faces/eyes.py <eyes.ts out folder> <faces stills folder> <out.png>"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[3]
PANELS = ROOT / "characters" / "dog" / "ref" / "panels"
SHEETS = ROOT / "characters" / "reference"
WIDTH = 1170  # an iPhone's width in pixels
GAP = 8

# The kitty's and the bear's own panels, by their box on the 1280 x 960 sheet (x, y, w, h).
OTHER = {
    "kitty Excited": ("kitty", (285, 150, 220, 150)),
    "bear Excited": ("bear", (282, 150, 230, 150)),
    "kitty Sparkle": ("kitty", (332, 826, 96, 52)),
    "bear Sparkle": ("bear", (336, 826, 96, 52)),
    "kitty Default": ("kitty", (22, 711, 96, 50)),
    "bear Default": ("bear", (22, 716, 96, 54)),
}

# Model-point boxes (x0, y0, x1, y1) round the head, and round one eye (the dog's left, the near one in a turned view)
# with room for the sparkle's gold stars, per view.
HEAD = (-88, -178, 88, -52)
ONE = {"front": (9, -116, 43, -87), "threeQuarterL": (-52, -110, -18, -81), "sideL": (-80, -115, -46, -86)}

GROUPS = [
    {"title": "Q2, the squeeze: ticklish's own > < (202), as the kitty's and the bear's Excited draw it",
     "rows": [[("panel", "kitty Excited", "kitty Excited"), ("panel", "bear Excited", "bear Excited"),
               ("face", "ticklish", HEAD, "ticklish, front"),
               ("eyes", "eyes_threeQuarterL_squeeze", HEAD, "three-quarter"), ("eyes", "eyes_sideL_squeeze", HEAD, "side")]]},
    {"title": "Q2, the sparkle: a soft four-point star in the eye and gold stars beside it (203)",
     "rows": [[("panel", "kitty Sparkle", "kitty Sparkle"), ("panel", "bear Sparkle", "bear Sparkle"),
               ("eyes", "eyes_front_sparkle", ONE["front"], "front"), ("eyes", "eyes_threeQuarterL_sparkle", ONE["threeQuarterL"], "three-quarter"),
               ("eyes", "eyes_sideL_sparkle", ONE["sideL"], "side")],
              [("face", "proud", HEAD, "proud's still: its panel (205)"), ("eyes", "eyes_front_sparkle", HEAD, "the sparkle beat, front"),
               ("eyes", "eyes_threeQuarterL_sparkle", HEAD, "three-quarter"), ("eyes", "eyes_sideL_sparkle", HEAD, "side")]]},
    {"title": "Q26: a tiny catchlight, a quarter the size, below the large one toward the outer side (201)",
     "rows": [[("panel", "kitty Default", "kitty Default"), ("panel", "bear Default", "bear Default"),
               ("dog", "expressions.eyes.open", "dog: eyes.open"),
               ("eyes", "eyes_front_open", ONE["front"], "front"), ("eyes", "eyes_threeQuarterL_open", ONE["threeQuarterL"], "three-quarter"),
               ("eyes", "eyes_sideL_open", ONE["sideL"], "side")]]},
    {"title": "Q28: the catchlights ride the iris at half its travel, and tuck under a lid (204)",
     "rows": [[("eyes", "eyes_front_open", ONE["front"], "open"), ("eyes", "eyes_front_peek", ONE["front"], "peek"),
               ("eyes", "eyes_front_peekBack", ONE["front"], "huffy's peek back"), ("eyes", "eyes_front_eager", ONE["front"], "hungry's eager"),
               ("eyes", "eyes_front_sleepy", ONE["front"], "half-lid")],
              [("eyes", "eyes_threeQuarterL_peek", ONE["threeQuarterL"], "3/4 peek"), ("eyes", "eyes_threeQuarterL_peekBack", ONE["threeQuarterL"], "3/4 peek back"),
               ("eyes", "eyes_threeQuarterL_sleepy", ONE["threeQuarterL"], "3/4 half-lid"), ("eyes", "eyes_sideL_peek", ONE["sideL"], "side peek"),
               ("eyes", "eyes_sideL_sleepy", ONE["sideL"], "side half-lid")]]},
]


def font(size):
    return ImageFont.load_default(size=size)


def cut(still, box):
    """The still cut at a box in model points, on white."""
    info = json.loads((still / "still.json").read_text())
    ppp, (rx, ry) = info["ppp"], info["rootPx"]
    im = Image.open(still / "white.png").convert("RGB")
    x0, y0, x1, y1 = box
    size = (round((x1 - x0) * ppp), round((y1 - y0) * ppp))
    return im.transform(size, Image.EXTENT, (rx + x0 * ppp, ry + y0 * ppp, rx + x1 * ppp, ry + y1 * ppp), Image.BICUBIC, fillcolor=(255, 255, 255))


def tile(cell, eyes, faces):
    kind = cell[0]
    if kind == "panel":
        species, (x, y, w, h) = OTHER[cell[1]]
        return Image.open(SHEETS / species / "expressions.jpg").convert("RGB").crop((x, y, x + w, y + h))
    if kind == "dog":
        return Image.open(PANELS / cell[1].split(".")[0] / f"{cell[1]}.png").convert("RGB")
    return cut((eyes if kind == "eyes" else faces) / cell[1], cell[2])


def strip(images, captions, height, size):
    """Images side by side at one height, each captioned under it, scaled down together if they overflow the width."""
    scaled = lambda im, h: im.resize((max(1, round(im.width * h / im.height)), h), Image.LANCZOS)
    tiles = [scaled(im, height) for im in images]
    room = [max(t.width, round(font(size).getlength(c)) + 4) for t, c in zip(tiles, captions)]
    total = sum(room) + GAP * (len(tiles) - 1)
    if total > WIDTH:
        k = WIDTH / total
        tiles = [scaled(t, max(1, round(t.height * k))) for t in tiles]
        room = [max(t.width, round(font(size).getlength(c)) + 4) for t, c in zip(tiles, captions)]
    out = Image.new("RGB", (WIDTH, max(t.height for t in tiles) + size + 8), "white")
    draw = ImageDraw.Draw(out)
    x = 0
    for t, caption, w in zip(tiles, captions, room):
        out.paste(t, (x, 0))
        draw.text((x + 2, t.height + 2), caption, fill=(40, 40, 40), font=font(size))
        x += w + GAP
    return out


def main(eyes, faces, out):
    eyes, faces = Path(eyes), Path(faces)
    rows = []
    for g in GROUPS:
        title = Image.new("RGB", (WIDTH, 34), "white")
        ImageDraw.Draw(title).text((2, 6), g["title"], fill=(0, 0, 0), font=font(21))
        rows.append(title)
        for r in g["rows"]:
            rows.append(strip([tile(c, eyes, faces) for c in r], [c[-1] for c in r], 230, 15))
            rows.append(Image.new("RGB", (WIDTH, 6), "white"))
        rows.append(Image.new("RGB", (WIDTH, 12), "white"))
    full = Image.new("RGB", (WIDTH, sum(r.height for r in rows)), "white")
    y = 0
    for r in rows:
        full.paste(r, (0, y))
        y += r.height
    # 256 colours keep it small enough to open from a pull request on a phone.
    full.quantize(colors=256).save(out, optimize=True)
    print(out, full.size)


if __name__ == "__main__":
    main(*sys.argv[1:4])
