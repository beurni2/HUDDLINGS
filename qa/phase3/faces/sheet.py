"""The face library's contact sheet, phone size: each face preset's front still beside its primary panel at the
panel's own scale, both drawn the same height and labelled. A panel with a face crop record (model.json's faceCrops)
places the render by its scale and its nose; Content, which has none, by the scale its crescents' spacing gives
(the render's are 49.9 pt apart) and its nose's dark blob. Neither is rolled: the panels' own tilt shows.

    python3 qa/phase3/faces/sheet.py <stills folder> <out.png>

<stills folder> holds a still per preset (runtime-web/lab/still.ts), named by the preset."""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage
from skimage import color

ROOT = Path(__file__).resolve().parents[3]
DOG = ROOT / "characters" / "dog"
PRESETS = ["neutral", "happy", "excited", "laughing", "curious", "surprised", "shy", "proud", "mischievous",
           "content", "sleepy", "listening", "tender", "singing", "blissful", "ticklish", "sly"]
# Each preset's primary panel: the first of presets.ts `crops`.
PRIMARY = {"neutral": "expressions.expression.happy", "happy": "expressions.expression.happy", "excited": "expressions.expression.excited",
           "laughing": "expressions.expression.laughing", "curious": "expressions.expression.curious", "surprised": "expressions.expression.surprised",
           "shy": "expressions.expression.shy", "proud": "expressions.expression.proud", "mischievous": "expressions.expression.mischievous",
           "content": "master.expression.content", "sleepy": "expressions.expression.sleepy", "listening": "expressions.ears.lifted-slightly",
           "tender": "master.expression.content", "singing": "expressions.expression.laughing", "blissful": "master.expression.content",
           "ticklish": "expressions.expression.laughing", "sly": "expressions.expression.mischievous"}
CRESCENTS_PT = 49.9  # the render's happy crescents, apart
HEIGHT = 196  # each tile's height on the sheet, px
COLS = 3


def dark_blobs(rgb):
    lab = color.rgb2lab(rgb / 255.0)
    mask = lab[..., 0] < 35
    labels, n = ndimage.label(mask)
    out = []
    for i in range(1, n + 1):
        ys, xs = np.nonzero(labels == i)
        if len(xs) >= 12:
            out.append((len(xs), xs.mean(), ys.mean()))
    return out


def placing(model, crop, rgb):
    """The panel's scale (pt per px) and the panel pixel its nose is on."""
    rec = model["faceCrops"].get(crop)
    if rec:
        anchors = rec["anchorsCropPx"]
        nose = anchors.get("nose", anchors["head.top"])
        return rec["ptPerCropPx"], np.array(nose, float) + 0.5, "nose" in anchors
    blobs = sorted(dark_blobs(rgb), key=lambda b: -b[0])[:3]
    nose = max(blobs, key=lambda b: b[2])
    eyes = sorted([b for b in blobs if b is not nose], key=lambda b: b[1])
    k = CRESCENTS_PT / abs(eyes[1][1] - eyes[0][1])
    return k, np.array([nose[1], nose[2]]) + 0.5, True


def render_tile(still, model, crop, k, nose_px, by_nose, shape):
    info = json.loads((still / "still.json").read_text())
    im = Image.open(still / "white.png").convert("RGB")
    ppp, (rx, ry) = info["ppp"], info["rootPx"]
    front = model["landmarks"]["front"]
    # The panel's pixel (u, v) shows model point anchor + k·((u, v) - panel's anchor).
    anchor = np.array(front["nose"] if by_nose else front["head.top"], float)
    h, w = shape
    x0, y0 = anchor - k * nose_px
    box = (rx + ppp * x0, ry + ppp * y0, rx + ppp * (x0 + k * w), ry + ppp * (y0 + k * h))
    return im.transform((w, h), Image.EXTENT, box, Image.BICUBIC, fillcolor=(255, 255, 255))


def main(stills, out):
    model = json.loads((DOG / "model.json").read_text())
    tiles = []
    for p in PRESETS:
        crop = PRIMARY[p]
        sheet = crop.split(".")[0]
        panel = Image.open(DOG / "ref" / "panels" / sheet / f"{crop}.png").convert("RGB")
        k, nose_px, by_nose = placing(model, crop, np.asarray(panel).astype(float))
        render = render_tile(Path(stills) / p, model, crop, k, nose_px, by_nose, (panel.height, panel.width))
        z = HEIGHT / panel.height
        size = (round(panel.width * z), HEIGHT)
        pair = Image.new("RGB", (size[0] * 2 + 4, HEIGHT + 16), "white")
        pair.paste(panel.resize(size, Image.LANCZOS), (0, 16))
        pair.paste(render.resize(size, Image.LANCZOS), (size[0] + 4, 16))
        ImageDraw.Draw(pair).text((3, 2), f"{p}  (sheet: {crop.split('.', 1)[1]})", fill=(0, 0, 0))
        tiles.append(pair)
    width = max(t.width for t in tiles)
    rows = (len(tiles) + COLS - 1) // COLS
    full = Image.new("RGB", (width * COLS + 8 * (COLS - 1), rows * (HEIGHT + 22)), "white")
    for i, t in enumerate(tiles):
        full.paste(t, ((i % COLS) * (width + 8), (i // COLS) * (HEIGHT + 22)))
    # 256 colours keep it small enough to open from a pull request on a phone.
    full.quantize(colors=256).save(out, optimize=True)
    print(out, full.size)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
