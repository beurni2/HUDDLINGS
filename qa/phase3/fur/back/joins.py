# The back view's joins sheet (the fur pass's back lane, docs/phase3-fur-plan.md): first the whole dog at about the size
# a phone shows it, then one row per join the audit names (qa/phase3/audit/defects.json, view "back") and per place the
# third round changed, each the sheet's crop | before (the third round's base, 46011a2) | after (this build's still), cut
# to the same box in model points and zoomed to the same scale, labelled. The sheet's crop is placed as the sheet match
# places it: the root on its ground anchor (model.json). A zoom under the still's own 3 px per pt is area-sampled down.
#
# python3 qa/phase3/fur/back/joins.py [--after build/stills/dog/back/white.png] [--out qa/phase3/fur/back/joins.png]
import argparse
import json
import os

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "../../../.."))

# Each row: its label, its box in model points [x, y, width, height] (y down, the ground at 0) and its zoom in output
# pixels per point (the crop is 1.27 px/pt; 2.4 px/pt is about the dog on a phone, 4 to 8 a closer look).
ROWS = [
    ("phone size: the whole dog (sheet | 46011a2 | now)", [-86, -170, 172, 174], 2.4),
    ("1  crown over the left ear's root (audit #1)", [-52, -162, 32, 26], 5),
    ("1  crown over the right ear's root (audit #1)", [20, -162, 32, 26], 5),
    ("2  topknot: its line, its feet and its notch (audit #2; 304)", [-24, -168, 50, 18], 6),
    ("3  left ear: its upper edge, the upper step and the break (302, 303)", [-80, -140, 34, 40], 5),
    ("3  right ear: its upper edge, the upper step and the break (302, 303)", [46, -140, 34, 40], 5),
    ("3  left ear: outer edge and hem (audit #3)", [-82, -130, 46, 66], 3.4),
    ("3  right ear: outer edge and hem (audit #3)", [36, -130, 46, 66], 3.4),
    ("11 head's side over the left ear (audit #11; 302)", [-48, -124, 20, 56], 4),
    ("11 head's side over the right ear (audit #11; 302)", [30, -124, 20, 56], 4),
    ("4/5 head's lower edge into the collar's left end (audit #4, #5)", [-50, -88, 32, 30], 5),
    ("4/5 head's lower edge into the collar's right end (audit #4, #5)", [18, -88, 32, 30], 5),
    ("6  left shoulder down to the haunch (audit #6; 302)", [-50, -66, 24, 36], 4.5),
    ("6  right shoulder down to the haunch (audit #6; 302)", [24, -66, 24, 36], 4.5),
    ("7/8 left haunch and heel (audit #7, #8)", [-56, -32, 34, 36], 4.5),
    ("7/8 right haunch and heel (audit #7, #8)", [22, -32, 34, 36], 4.5),
    ("7/8 left heel's notch and meet, zoomed (302)", [-52, -20, 22, 20], 8),
    ("7/8 right heel's notch and meet, zoomed (302)", [30, -20, 22, 20], 8),
    ("9  tail plume: its lobes, hooks and peach (audit #9; 305)", [-16, -54, 50, 58], 3.4),
    ("9  plume's right side, zoomed (305)", [8, -50, 26, 50], 6),
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
    if zoom < ppp:
        # Smaller than the image's own scale (the phone row): cut at its own scale, then area-sample down.
        big = img.transform((round(w * ppp), round(h * ppp)), Image.AFFINE, (1, 0, left, 0, 1, top), resample=Image.BICUBIC, fillcolor=(255, 255, 255))
        return big.resize(out, Image.LANCZOS)
    return img.transform(out, Image.AFFINE, (1 / zoom * ppp, 0, left, 0, 1 / zoom * ppp, top), resample=Image.BICUBIC, fillcolor=(255, 255, 255))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--before", default=os.path.join(HERE, "before.png"))
    ap.add_argument("--after", default=os.path.join(REPO, "build/stills/dog/back/white.png"))
    ap.add_argument("--out", default=os.path.join(HERE, "joins.png"))
    ap.add_argument("--title", default="back: the joins, sheet | before (46011a2) | after (now)")
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
        for tag, p in zip(("sheet", "46011a2", "now"), row):
            sheet.paste(p, (xx, yy))
            d.rectangle([xx, yy, xx + p.width - 1, yy + p.height - 1], outline=(200, 192, 184))
            d.text((xx + 4, yy + p.height - 16), tag, fill=(122, 106, 94), font=small)
            xx += p.width + gap
        yy += row[0].height + gap
    sheet.save(a.out, optimize=True)
    print(a.out, sheet.size)


if __name__ == "__main__":
    main()
