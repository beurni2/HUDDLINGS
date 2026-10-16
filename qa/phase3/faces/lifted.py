"""The lifted ears beside their panels (DECISIONS 145): Neutral (default) and Lifted slightly, each laid on the render
by the head, since the ears hang from it: at Lifted slightly's own record's scale (its head 90 crop px wide, 1.04 pt a
pixel; the two panels sit side by side on the expression sheet, drawn at one size) and pinned at the head's top, the
tuft's highest point, on the render's (model.json's head.top); then for each the panel, the panel and the render half
and half, and the render, the top of the head at the still's scale. With --grid, a 5 pt model-space grid over the
panels: the placement guide the lifted ear's nodes were read off by eye (rule R8: a guide, never a trace).

    python3 qa/phase3/faces/lifted.py <rest front still> <lifted still> <out.png> [--grid]
    (the rest front: build/stills/dog/front; a still with both ears lifted: build/stills/dog/faces/listening)"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[3]
PANELS = ROOT / "characters/dog/ref/panels/expressions"
RECORD = "expressions.ears.lifted-slightly"


def head_top(rgb):
    """The tuft's highest point: the topmost pixel in the panel's middle third darker than its card by more than 12 in
    any channel, and the middle of that row's run there."""
    a = np.asarray(rgb).astype(int)
    card = np.median(np.concatenate([a[0], a[-1]]), axis=0)
    w = a.shape[1]
    mid = a[:, w // 3: 2 * w // 3]
    marked = (np.abs(mid - card) > 12).any(axis=2)
    row = int(np.argmax(marked.any(axis=1)))
    xs = np.nonzero(marked[row])[0] + w // 3
    return np.array([xs.mean(), row + 0.5])


def laid(model, name, size, ppp, root):
    """The panel laid on a still's pixels: scaled by the record's points per pixel, its head's top on model.json's."""
    k = model["faceCrops"][RECORD]["ptPerCropPx"]
    panel = Image.open(PANELS / f"expressions.ears.{name}.png").convert("RGB")
    top = head_top(panel)
    # Still pixel = root + ppp·(model), model = head.top + k·(panel − top); PIL wants still pixel to panel pixel.
    want = np.array(model["landmarks"]["front"]["head.top"], float)
    s = 1 / (ppp * k)
    t = top - (np.array(root) + ppp * want) * s
    return panel.transform(size, Image.AFFINE, (s, 0, t[0], 0, s, t[1]), Image.BICUBIC, fillcolor=(255, 255, 255))


def grid(img, ppp, root, box):
    """A 5 pt grid in model space, every 10 pt labelled."""
    draw = ImageDraw.Draw(img)
    x0, y0, x1, y1 = box
    for x in range(int(x0), int(x1) + 1, 5):
        X = root[0] + ppp * x
        draw.line([(X, root[1] + ppp * y0), (X, root[1] + ppp * y1)], fill=(120, 170, 255) if x % 10 else (40, 90, 220), width=1)
        if x % 10 == 0:
            draw.text((X + 2, root[1] + ppp * y0 + 2), str(x), fill=(20, 60, 200))
    for y in range(int(y0), int(y1) + 1, 5):
        Y = root[1] + ppp * y
        draw.line([(root[0] + ppp * x0, Y), (root[0] + ppp * x1, Y)], fill=(120, 170, 255) if y % 10 else (40, 90, 220), width=1)
        if y % 10 == 0:
            draw.text((root[0] + ppp * x0 + 2, Y + 2), str(y), fill=(20, 60, 200))


def main(rest, lifted, out, with_grid=False):
    model = json.loads((ROOT / "characters/dog/model.json").read_text())
    rows = []
    for name, still in (("neutral", rest), ("lifted-slightly", lifted)):
        info = json.loads((Path(still) / "still.json").read_text())
        ppp, root = info["ppp"], info["rootPx"]
        im = Image.open(Path(still) / "white.png").convert("RGB")
        panel = laid(model, name, im.size, ppp, root)
        area = (-95, -180, 95, -55)
        if with_grid:
            grid(panel, ppp, root, area)
        box = (root[0] + area[0] * ppp, root[1] + area[1] * ppp, root[0] + area[2] * ppp, root[1] + area[3] * ppp)
        size = (round(box[2] - box[0]), round(box[3] - box[1]))
        crop = lambda img: img.transform(size, Image.EXTENT, box, Image.BICUBIC, fillcolor=(255, 255, 255))
        rows.append([crop(panel), crop(Image.blend(im, laid(model, name, im.size, ppp, root), 0.5)), crop(im)])
    w, h = rows[0][0].size
    full = Image.new("RGB", (3 * w + 16, 2 * h + 8), "white")
    for r, tiles in enumerate(rows):
        for i, tile in enumerate(tiles):
            full.paste(tile, (i * (w + 8), r * (h + 8)))
    if not with_grid:
        full = full.resize((full.width * 2 // 3, full.height * 2 // 3), Image.LANCZOS)
    full.quantize(colors=256).save(out, optimize=True)
    print(out, full.size)


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if a != "--grid"]
    main(*args, with_grid="--grid" in sys.argv)
