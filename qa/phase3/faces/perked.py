"""The one perked ear beside its panel (DECISIONS 133): One ear perked, which has no face crop record, levelled and
scaled by its brows onto the front's face frame (the panel's brows' middles, read off it on a 5 px grid, at (49.5, 62)
and (98.5, 55); the render's 46 pt apart, brow.ts), then the panel, the two half and half, and the render, each the
top of the head at the still's scale.

    python3 qa/phase3/faces/perked.py <still folder> <out.png>      (a still with the dog's left ear perked: face_curious)"""
import json
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
PANEL = ROOT / "characters/dog/ref/panels/expressions/expressions.ears.one-ear-perked.png"
BROWS_PX = np.array([49.5, 62.0]), np.array([98.5, 55.0])
BROWS_PT, BROW_Y = 46.0, -28.4  # the render's brows apart, and their height in the face frame (brow.ts)


def to_model(model):
    """The affine map from a panel pixel to model space: level the panel's brows, scale them to the render's, and place
    them on the front's face frame (the eyes' midpoint, rolled with them)."""
    bl, br = BROWS_PX
    mid = (bl + br) / 2
    a = -math.atan2(br[1] - bl[1], br[0] - bl[0])
    k = BROWS_PT / np.linalg.norm(br - bl)
    lm = model["landmarks"]["front"]
    el, er = np.array(lm["eye.L"], float), np.array(lm["eye.R"], float)
    fc, roll = (el + er) / 2, math.atan2(el[1] - er[1], el[0] - er[0])
    rot = lambda t: np.array([[math.cos(t), -math.sin(t)], [math.sin(t), math.cos(t)]])
    lin = rot(roll) @ (k * rot(a))
    return lin, fc + rot(roll) @ np.array([0, BROW_Y]) - lin @ mid


def main(still, out):
    model = json.loads((ROOT / "characters/dog/model.json").read_text())
    info = json.loads((Path(still) / "still.json").read_text())
    ppp, (rx, ry) = info["ppp"], info["rootPx"]
    im = Image.open(Path(still) / "white.png").convert("RGB")
    lin, off = to_model(model)
    # Still pixel = root + ppp·(lin·panel + off); PIL wants the inverse, still pixel to panel pixel.
    m = ppp * lin
    inv = np.linalg.inv(m)
    t = -inv @ (np.array([rx, ry]) + ppp * off)
    panel = Image.open(PANEL).convert("RGB").transform(im.size, Image.AFFINE, (*inv[0], t[0], *inv[1], t[1]), Image.BICUBIC, fillcolor=(255, 255, 255))
    # The top of the head, cropped on white (the still's canvas ends a little above the perked ear).
    box = (rx - 75 * ppp, ry - 190 * ppp, rx + 75 * ppp, ry - 85 * ppp)
    size = (round(box[2] - box[0]), round(box[3] - box[1]))
    crop = lambda img: img.transform(size, Image.EXTENT, box, Image.BICUBIC, fillcolor=(255, 255, 255))
    tiles = [crop(panel), crop(Image.blend(im, panel, 0.5)), crop(im)]
    w, h = tiles[0].size
    full = Image.new("RGB", (3 * w + 16, h), "white")
    for i, tile in enumerate(tiles):
        full.paste(tile, (i * (w + 8), 0))
    full = full.resize((full.width * 2 // 3, full.height * 2 // 3), Image.LANCZOS)
    full.quantize(colors=256).save(out, optimize=True)
    print(out, full.size)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
