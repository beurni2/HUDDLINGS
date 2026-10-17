"""Gate A's pack for the founder (spec section 5b, Gates: A, Look), phone size: each view's still beside its turnaround
crop at the same size with its sheet-match numbers, the marking map on the four crops, and the collar's blue beside
the sheet's in every view, each saved in 256 colours. The faces, the new faces and the turned faces are the face
library's own sheets, which README.md points to (qa/phase3/faces/).

    python3 qa/phase3/gateA/build.py

It reads each view's qa/phase3/<view>/phone.png (the sheet match's aligned pair) and match.json, and the marking
overlays phase 2 made (characters/dog/ref/overlays/)."""
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parent
QA = ROOT / "qa" / "phase3"
VIEWS = ["front", "threeQuarter.L", "threeQuarter.R", "side.L", "side.R", "back"]
NAMES = {"front": "Front", "threeQuarter.L": "Three-quarter, facing left", "threeQuarter.R": "Three-quarter, facing right",
         "side.L": "Side, facing left", "side.R": "Side, facing right", "back": "Back"}
# The collar on each view's phone panels (panel pixels: x0, y0, x1, y1), found by eye on the aligned pairs.
COLLAR = {"front": (150, 300, 370, 380), "threeQuarter.L": (120, 300, 340, 390), "threeQuarter.R": (190, 300, 410, 390),
          "side.L": (90, 290, 290, 400), "side.R": (160, 290, 360, 400), "back": (120, 250, 360, 330)}
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"


def font(n):
    try:
        return ImageFont.truetype(FONT, n)
    except OSError:
        return ImageFont.load_default()


def panels(path):
    """The sheet and the render from a phone.png: its two panels either side of the white gap, below their labels."""
    im = Image.open(path).convert("RGB")
    a = np.asarray(im).astype(int)
    h, w, _ = a.shape
    white = (a.min(axis=2) >= 250).mean(axis=0)
    mid = [x for x in range(int(w * 0.3), int(w * 0.7)) if white[x] > 0.98]
    return im.crop((0, 22, mid[0], h)), im.crop((mid[-1] + 1, 22, w, h))


def row(ims, heads, title, sub="", gap=12):
    subs = sub.split("\n") if sub else []
    th = 46 + 30 * len(subs)
    hh = 40
    W = sum(i.width for i in ims) + gap * (len(ims) - 1)
    H = th + hh + max(i.height for i in ims)
    out = Image.new("RGB", (W, H), "white")
    d = ImageDraw.Draw(out)
    d.text((4, 6), title, fill=(30, 30, 30), font=font(30))
    for k, line in enumerate(subs):
        d.text((4, 46 + 30 * k), line, fill=(70, 70, 70), font=font(22))
    x = 0
    for i, hd in zip(ims, heads):
        d.text((x + 4, th + 6), hd, fill=(90, 90, 90), font=font(24))
        out.paste(i, (x, th + hh))
        x += i.width + gap
    return out


def save(im, name):
    im.quantize(256, method=Image.Quantize.MEDIANCUT).save(OUT / name, optimize=True)


def stack(rows, gap=28):
    W = max(r.width for r in rows)
    out = Image.new("RGB", (W, sum(r.height for r in rows) + gap * (len(rows) - 1)), "white")
    y = 0
    for r in rows:
        out.paste(r, (0, y))
        y += r.height + gap
    return out


def numbers(view):
    m = json.loads((QA / view / "match.json").read_text())
    lm = max((r.get("errPt") or 0, n) for n, r in m["landmarks"]["rows"].items())
    de = max((r.get("deltaE2000") or 0, n) for n, r in m["palette"]["rows"].items())
    mk = m["markings"]
    return m, (f"silhouette IoU {m['silhouette']['iou']:.3f} (min {m['silhouette']['threshold']}) · worst landmark {lm[0]:.2f} pt (max 2.8)\n"
               f"worst colour ΔE {de[0]:.2f} (max 3) · markings {len(mk['shown'])}/{len(mk['expected'])} in place")


def views():
    for name, vs in [("views_1.png", VIEWS[:3]), ("views_2.png", VIEWS[3:])]:
        rows = []
        for v in vs:
            m, sub = numbers(v)
            sheet, ours = panels(QA / v / "phone.png")
            rows.append(row([sheet, ours], ["Sheet", "Ours"], f"{NAMES[v]}: {'passes' if m['pass'] else 'FAILS'}", sub))
        save(stack(rows), name)


def marking_map():
    crops = ["front", "three-quarter", "side", "back"]
    ims = [Image.open(ROOT / "characters" / "dog" / "ref" / "overlays" / f"markings-master.turnaround.{c}.png").convert("RGB") for c in crops]
    w = 1100
    ims = [i.resize((w, int(i.height * w / i.width)), Image.LANCZOS) for i in ims]
    rows = [row([i], [""], f"Marking map: the {c} turnaround (sheet | the patches it holds)") for i, c in zip(ims, crops)]
    save(stack(rows), "marking_map.png")


def collar():
    rows = []
    for v in VIEWS:
        m, _ = numbers(v)
        c = m["palette"]["rows"]["collar"]
        sheet, ours = panels(QA / v / "phone.png")
        box = COLLAR[v]
        crops = [i.crop(box).resize(((box[2] - box[0]) * 2, (box[3] - box[1]) * 2), Image.LANCZOS) for i in (sheet, ours)]
        sw = Image.new("RGB", (220, crops[0].height), "white")
        d = ImageDraw.Draw(sw)
        d.rectangle((10, 10, 100, 90), fill=c["dominant"])
        d.rectangle((120, 10, 210, 90), fill=c["heldTo"])
        d.text((10, 96), "sheet", fill=(60, 60, 60), font=font(20))
        d.text((120, 96), "ours", fill=(60, 60, 60), font=font(20))
        d.text((10, 124), c["dominant"], fill=(60, 60, 60), font=font(18))
        d.text((120, 124), c["heldTo"], fill=(60, 60, 60), font=font(18))
        rows.append(row(crops + [sw], ["Sheet", "Ours", ""], f"{NAMES[v]}: the collar, ΔE {c['deltaE2000']:.2f} (limit 3)"))
    save(stack(rows), "collar.png")


if __name__ == "__main__":
    views()
    marking_map()
    collar()
    print("gateA: written to", OUT)
