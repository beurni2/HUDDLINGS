"""Lays out the turned views' face states (render.ts) as one phone-size contact sheet per view: every state, then the 17
presets' stills, each cell the head at 3x cut from the still and labelled, and beside a cell the motion sheet's crop of
the dog's turned head where one draws that state (the motion sheet faces right, so a .L view shows it mirrored).

python3 qa/phase3/faces/turned/sheet.py <render.ts's out folder> <qa folder>
"""
import json
import os
import sys

from PIL import Image, ImageDraw, ImageFont

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../.."))
MOTION = os.path.join(REPO, "characters/dog/ref/panels/motion")
# The head in model space (points), per facing: x from, x to, y from, y to. The .R views are the .L ones mirrored.
HEAD = {"threeQuarter": (-128, 36, -190, -52), "side": (-108, 34, -190, -56)}
COLS, CELL_W, LABEL_H, PAD = 4, 290, 24, 6
# The motion sheet's crops of the turned head (panel pixels: left, top, right, bottom), and the cells each settles.
CROPS = {
    "movement.soft-landing": (70, 20, 177, 100),
    "movement.curious-lean": (60, 30, 169, 120),
    "movement.walk": (90, 0, 175, 90),
    "movement.run": (100, 0, 200, 80),
    "movement.jump": (80, 0, 166, 90),
    "movement.happy-bounce": (10, 2, 145, 85),
}
BESIDE = {
    "threeQuarter": {"eyes happy (squeeze, Q2)": "movement.soft-landing", "mouth smile": "movement.curious-lean", "mouth laugh": "movement.happy-bounce",
                     "content": "movement.soft-landing", "curious": "movement.curious-lean", "laughing": "movement.happy-bounce"},
    "side": {"rest": "movement.walk", "mouth open": "movement.jump", "happy": "movement.jump", "neutral": "movement.run"},
}


# What a cell shows that the package on this branch does not play (render.ts's `review`), and its footnote.
MARKS = {"held": "*", "temple": "**"}
NOTES = [
    "* review build: a state held out of the package for now (the turned stars, the profile's mouths; DECISIONS 183)",
    "** the three-quarter's line beside its near ear perked: keyed only by p3/faces2's face clips; here the package draws the rest line (176)",
]


def font(size):
    for f in ["/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/opentype/inter/Inter-Regular.otf"]:
        if os.path.exists(f):
            return ImageFont.truetype(f, size)
    return ImageFont.load_default()


def head(still, view):
    info = json.load(open(os.path.join(still, "still.json")))
    kind, facing = view.split(".")
    x0, x1, y0, y1 = HEAD[kind]
    if facing == "R":
        x0, x1 = -x1, -x0
    ppp = info["ppp"]
    rx, ry = info["rootPx"]
    im = Image.open(os.path.join(still, "white.png")).convert("RGB")
    box = (round(rx + x0 * ppp), round(ry + y0 * ppp), round(rx + x1 * ppp), round(ry + y1 * ppp))
    canvas = Image.new("RGB", (box[2] - box[0], box[3] - box[1]), "white")
    canvas.paste(im.crop((max(0, box[0]), max(0, box[1]), min(im.width, box[2]), min(im.height, box[3]))), (max(0, -box[0]), max(0, -box[1])))
    return canvas


def motion(name, mirror, size):
    im = Image.open(os.path.join(MOTION, f"motion.{name}.png")).convert("RGB").crop(CROPS[name])
    if mirror:
        im = im.transpose(Image.FLIP_LEFT_RIGHT)
    k = min(size[0] / im.width, size[1] / im.height)
    im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
    out = Image.new("RGB", size, "white")
    out.paste(im, ((size[0] - im.width) // 2, (size[1] - im.height) // 2))
    return out


def sheet(view, cells, out_dir, qa):
    kind, facing = view.split(".")
    x0, x1, y0, y1 = HEAD[kind]
    cell_h = round(CELL_W * (y1 - y0) / (x1 - x0))
    tiles = []
    for c in cells:
        marks = "".join(MARKS[r] for r in c.get("review", []))
        tiles.append((c["label"] + (f" {marks}" if marks else ""), head(os.path.join(out_dir, "stills", c["clip"]), view).resize((CELL_W, cell_h), Image.LANCZOS), c["group"]))
        crop = BESIDE[kind].get(c["label"])
        if crop:
            tiles.append((f"sheet: {crop.split('.')[1]}{' (mirrored)' if facing == 'L' else ''}", motion(crop, facing == "L", (CELL_W, cell_h)), c["group"] + "-ref"))
    big, small = font(26), font(15)
    sections = [("Every face state", [t for t in tiles if t[2].startswith("state")]), ("The 17 presets' stills", [t for t in tiles if t[2].startswith("preset")])]
    W = COLS * (CELL_W + PAD) + PAD
    H = 50 + sum(36 + -(-len(ts) // COLS) * (cell_h + LABEL_H + PAD) for _, ts in sections) + 30 + 20 * len(NOTES)
    page = Image.new("RGB", (W, H), "white")
    d = ImageDraw.Draw(page)
    d.text((PAD, 10), f"{view}: face states at 3x, WebGL (review build, cells marked * and ** below)", fill=(40, 30, 20), font=font(22))
    y = 50
    for title, ts in sections:
        d.text((PAD, y + 6), title, fill=(90, 60, 40), font=font(20))
        y += 36
        for i, (label, im, group) in enumerate(ts):
            x = PAD + (i % COLS) * (CELL_W + PAD)
            yy = y + (i // COLS) * (cell_h + LABEL_H + PAD)
            page.paste(im, (x, yy))
            ref = group.endswith("-ref")
            d.rectangle((x, yy, x + CELL_W - 1, yy + cell_h - 1), outline=(150, 170, 210) if ref else (225, 215, 205))
            d.text((x + 4, yy + cell_h + 3), label, fill=(60, 90, 150) if ref else (40, 30, 20), font=small)
        y += -(-len(ts) // COLS) * (cell_h + LABEL_H + PAD)
    for k, note in enumerate(NOTES):
        d.text((PAD, H - 24 - 20 * (len(NOTES) - k)), note, fill=(110, 90, 70), font=small)
    d.text((PAD, H - 24), "python3 qa/phase3/faces/turned/sheet.py, from node qa/phase3/faces/turned/render.ts", fill=(140, 130, 120), font=small)
    page.save(os.path.join(qa, f"{view}.png"), optimize=True)


def main():
    out_dir, qa = sys.argv[1], sys.argv[2]
    os.makedirs(qa, exist_ok=True)
    for entry in json.load(open(os.path.join(out_dir, "cells.json"))):
        sheet(entry["view"], entry["cells"], out_dir, qa)


if __name__ == "__main__":
    main()
