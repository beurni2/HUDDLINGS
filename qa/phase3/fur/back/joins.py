# The back view's joins sheet (the fur pass's back lane, docs/phase3-fur-plan.md): one row per join the audit names
# (qa/phase3/audit/defects.json, view "back"), each the sheet's crop | before (the fur pass's base, fbbe6d3) | after
# (this build's still), cut to the same box in model points and zoomed to the same scale, labelled, at a size that
# reads on a phone. The sheet's crop is placed as the sheet match places it: the root on its ground anchor (model.json).
#
# python3 qa/phase3/fur/back/joins.py [--after build/stills/dog/back/white.png] [--out qa/phase3/fur/back/joins.png]
import argparse
import json
import os

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "../../../.."))

# Each join: its label, its box in model points [x, y, width, height] (y down, the ground at 0) and its zoom in output
# pixels per point (the crop is 1.27 px/pt, so 4 to 5 px/pt is 3 to 4 times the crop).
ROWS = [
    ("1  crown over the left ear's root (audit #1)", [-52, -162, 32, 26], 5),
    ("1  crown over the right ear's root (audit #1)", [20, -162, 32, 26], 5),
    ("2  topknot and the crown's line (audit #2)", [-26, -168, 52, 24], 4.5),
    ("11 head's side over the left ear (audit #11)", [-48, -142, 22, 66], 3.4),
    ("4/5 head's lower edge into the collar's left end (audit #4, #5)", [-50, -88, 32, 30], 5),
    ("4/5 head's lower edge into the collar's right end (audit #4, #5)", [18, -88, 32, 30], 5),
    ("3  left ear: outer edge and hem (audit #3)", [-82, -130, 46, 66], 3.4),
    ("3  right ear: outer edge and hem (audit #3)", [36, -130, 46, 66], 3.4),
    ("6  left shoulder down to the haunch (audit #6)", [-50, -66, 24, 36], 4.5),
    ("6  right shoulder down to the haunch (audit #6)", [24, -66, 24, 36], 4.5),
    ("7/8 left haunch and heel (audit #7, #8)", [-56, -32, 34, 36], 4.5),
    ("7/8 right haunch and heel (audit #7, #8)", [22, -32, 34, 36], 4.5),
    ("9  tail plume and its curl (audit #9)", [-16, -54, 50, 58], 3.4),
    ("7/10 rump, the left heel to the tail's foot, ground shadow (audit #7, #10)", [-68, -22, 70, 26], 3.4),
    ("7/10 rump, the tail's foot to the right heel, ground shadow (audit #7, #10)", [-2, -22, 70, 26], 3.4),
]


def load_crop():
    model = json.load(open(os.path.join(REPO, "characters/dog/model.json")))
    crop = model["crops"]["back"]
    img = Image.open(os.path.join(REPO, "characters/dog/ref/panels/master", crop["crop"] + ".png")).convert("RGB")
    return img, crop["ptPerCropPx"], crop["anchorsCropPx"]["ground"]


def load_still(path):
    """A still on white, and where its root lies in its pixels, at its scale (still.json beside it, or the base's)."""
    info_path = os.path.join(os.path.dirname(path), "still.json")
    info = json.load(open(info_path)) if os.path.exists(info_path) else {"ppp": 3, "rootPx": [257, 517]}
    return Image.open(path).convert("RGB"), info["ppp"], info["rootPx"]


def cut(img, origin, ppp, box, zoom):
    """The box (model points) of an image whose root lies at `origin` px at `ppp` px/pt, resampled to `zoom` px/pt."""
    x, y, w, h = box
    ox, oy = origin
    # The crop's pixel centres: the root lies on the middle of its anchor pixel (the sheet match's alignment).
    left, top = ox + x * ppp, oy + y * ppp
    out = (round(w * zoom), round(h * zoom))
    return img.transform(out, Image.AFFINE, (1 / zoom * ppp, 0, left, 0, 1 / zoom * ppp, top), resample=Image.BICUBIC, fillcolor=(255, 255, 255))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--before", default=os.path.join(HERE, "before.png"))
    ap.add_argument("--after", default=os.path.join(REPO, "build/stills/dog/back/white.png"))
    ap.add_argument("--out", default=os.path.join(HERE, "joins.png"))
    ap.add_argument("--title", default="back: the joins, sheet | before (fbbe6d3) | after")
    ap.add_argument("--zoom", type=float, default=1, help="every row's zoom times this (for a closer look than a phone's)")
    a = ap.parse_args()
    crop, pt_per_px, ground = load_crop()
    crop_ppp = 1 / pt_per_px
    crop_origin = (ground[0] + 0.5, ground[1] + 0.5)
    before, bppp, broot = load_still(a.before)
    after, appp, aroot = load_still(a.after)
    font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 15)
    small = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 12)
    gap, label = 8, 22
    panels = []
    for name, box, zoom in ROWS:
        zoom *= a.zoom
        row = [cut(crop, crop_origin, crop_ppp, box, zoom), cut(before, broot, bppp, box, zoom), cut(after, aroot, appp, box, zoom)]
        panels.append((name, row))
    width = max(sum(p.width for p in row) + gap * 4 for _, row in panels)
    height = 34 + sum(label + row[0].height + gap for _, row in panels)
    sheet = Image.new("RGB", (width, height), (255, 255, 255))
    d = ImageDraw.Draw(sheet)
    d.text((gap, 8), a.title, fill=(58, 42, 32), font=font)
    yy = 34
    for name, row in panels:
        d.text((gap, yy + 3), name, fill=(58, 42, 32), font=font)
        yy += label
        xx = gap
        for tag, p in zip(("sheet", "before", "after"), row):
            sheet.paste(p, (xx, yy))
            d.rectangle([xx, yy, xx + p.width - 1, yy + p.height - 1], outline=(200, 192, 184))
            d.text((xx + 4, yy + p.height - 16), tag, fill=(122, 106, 94), font=small)
            xx += p.width + gap
        yy += row[0].height + gap
    sheet.save(a.out, optimize=True)
    print(a.out, sheet.size)


if __name__ == "__main__":
    main()
