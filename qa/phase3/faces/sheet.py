"""The face library's contact sheets, phone size.

Presets: each face preset's front still beside its primary panel at the panel's own scale, both drawn the same height
and labelled. A panel with a face crop record (model.json's faceCrops) places the render by its scale and its nose;
Content, which has none, by the scale its crescents' spacing gives (the render's are 49.9 pt apart) and its nose's dark
blob. Neither is rolled: the panels' own tilt shows. Each cell is the panel's frame grown to hold the whole render
across and above it (a perked ear, the stars), the panel padded with white, so nothing the render draws is cut off.

    python3 qa/phase3/faces/sheet.py <stills folder> <out.png>

<stills folder> holds a still per preset (runtime-web/lab/still.ts), named by the preset.

States: the stills states.ts renders, each the head and its labels, in a row of three.

    python3 qa/phase3/faces/sheet.py states <states folder> <out.png>"""
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


def primary(model, preset):
    """The panel the Faces check holds a preset to: the face crop record primary for it (model.json, DECISIONS 110),
    the first of presets.ts `crops`."""
    return next(pid for pid, rec in model["faceCrops"].items() if preset in rec["primaryFor"])


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


def drawn_box(still):
    """The model-space box of everything the still draws: alpha is 1 - (white - black)/255."""
    info = json.loads((still / "still.json").read_text())
    white = np.asarray(Image.open(still / "white.png").convert("RGB"), float)
    black = np.asarray(Image.open(still / "black.png").convert("RGB"), float)
    alpha = 1 - (white - black).mean(axis=2) / 255
    ys, xs = np.nonzero(alpha > 0.1)
    ppp, (rx, ry) = info["ppp"], info["rootPx"]
    return (xs.min() - rx) / ppp, (ys.min() - ry) / ppp, (xs.max() + 1 - rx) / ppp, (ys.max() + 1 - ry) / ppp


def render_tile(still, model, panel, k, nose_px, by_nose):
    """The panel and the render in one frame, both at the panel's scale: the panel's own frame grown across and up to
    hold the whole render, the panel padded with white."""
    info = json.loads((still / "still.json").read_text())
    im = Image.open(still / "white.png").convert("RGB")
    ppp, (rx, ry) = info["ppp"], info["rootPx"]
    front = model["landmarks"]["front"]
    # The panel's pixel (u, v) shows model point anchor + k·((u, v) - panel's anchor).
    anchor = np.array(front["nose"] if by_nose else front["head.top"], float)
    w, h = panel.size
    x0, y0 = anchor - k * nose_px
    dx0, dy0, dx1, _ = drawn_box(still)
    X0, Y0, X1, Y1 = min(x0, dx0), min(y0, dy0), max(x0 + k * w, dx1), y0 + k * h
    size = (round((X1 - X0) / k), round((Y1 - Y0) / k))
    box = (rx + ppp * X0, ry + ppp * Y0, rx + ppp * X1, ry + ppp * Y1)
    render = im.transform(size, Image.EXTENT, box, Image.BICUBIC, fillcolor=(255, 255, 255))
    padded = Image.new("RGB", size, "white")
    padded.paste(panel, (round((x0 - X0) / k), round((y0 - Y0) / k)))
    return padded, render


def main(stills, out):
    model = json.loads((DOG / "model.json").read_text())
    tiles = []
    for p in PRESETS:
        crop = primary(model, p)
        sheet = crop.split(".")[0]
        panel = Image.open(DOG / "ref" / "panels" / sheet / f"{crop}.png").convert("RGB")
        k, nose_px, by_nose = placing(model, crop, np.asarray(panel).astype(float))
        panel, render = render_tile(Path(stills) / p, model, panel, k, nose_px, by_nose)
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


def states(folder, out):
    """The states.ts stills, each its head (model x -88 to 88, y -186 to -50) at its still's scale, labelled."""
    folder = Path(folder)
    tiles = []
    for entry in json.loads((folder / "states.json").read_text()):
        still = folder / entry["still"]
        info = json.loads((still / "still.json").read_text())
        ppp, (rx, ry) = info["ppp"], info["rootPx"]
        im = Image.open(still / "white.png").convert("RGB")
        size = (round(176 * 1.6), round(136 * 1.6))
        head = im.transform(size, Image.EXTENT, (rx - 88 * ppp, ry - 186 * ppp, rx + 88 * ppp, ry - 50 * ppp), Image.BICUBIC, fillcolor=(255, 255, 255))
        tile = Image.new("RGB", (size[0], size[1] + 16), "white")
        tile.paste(head, (0, 16))
        ImageDraw.Draw(tile).text((3, 2), entry["name"], fill=(0, 0, 0))
        tiles.append(tile)
    w, h = tiles[0].size
    rows = (len(tiles) + COLS - 1) // COLS
    full = Image.new("RGB", (w * COLS + 8 * (COLS - 1), rows * (h + 6)), "white")
    for i, t in enumerate(tiles):
        full.paste(t, ((i % COLS) * (w + 8), (i // COLS) * (h + 6)))
    full.quantize(colors=256).save(out, optimize=True)
    print(out, full.size)


if __name__ == "__main__":
    if sys.argv[1] == "states":
        states(sys.argv[2], sys.argv[3])
    else:
        main(sys.argv[1], sys.argv[2])
