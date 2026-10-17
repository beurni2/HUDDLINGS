"""The lit steps' colours (DECISIONS 285, the lead's L2): the sheet's own lit linework over the cream, read on the
turnaround crops and the hero where the light falls on the outline (the plume's top, the crown and the topknot, the
ears' tops, the back's top behind the ear), each box's line map as the line check reads it (linematch.line_map at the
crop's own tau, its skeleton where the line runs alone), each skeleton pixel's core colour (the darkest warm pixel
within 1 px, on L* averaged as tone_map does), and its centiles in L*, a* and b*. Never on a render. Prints each box and
writes litsteps.json beside this file.

    python3 qa/phase3/fur/recipes3/litsteps.py
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

here = Path(__file__).resolve().parent
repo = here.parents[3]
sys.path.insert(0, str(repo / "characters" / "sheetmatch"))
import linematch as lm  # noqa: E402

PANELS = repo / "characters" / "dog" / "ref" / "panels" / "master"
# Boxes [x0, y0, x1, y1] in each panel's px, on lit runs of the outline over the cream (read beside a 10 px grid). The
# side's back behind the ear ([128, 136, 150, 146]) holds no line to read: one skeleton px, the ear hem's (L* 51), the
# topline there all but gone (DECISIONS 284's side `swell`).
BOXES = (
    ("master.turnaround.side", "the plume's top and back", [150, 133, 193, 165]),
    ("master.turnaround.side", "the crown and the topknot", [28, 4, 132, 32]),
    ("master.turnaround.front", "the crown and the topknot", [60, 2, 160, 30]),
    ("master.turnaround.three-quarter", "the crown and the topknot", [60, 2, 170, 32]),
    ("master.turnaround.back", "the crown and the topknot", [55, 4, 145, 30]),
    ("master.turnaround.back", "the plume's top", [110, 120, 150, 150]),
    ("master.hero.main", "the crown and the topknot", [80, 5, 262, 50]),
    ("master.hero.main", "the plume's top", [10, 245, 75, 300]),
)
# The ears' lit tops, on the tan (the tan ladder's lit end), and for scale a hem the light never reaches.
TAN_BOXES = (
    ("master.turnaround.front", "the left ear's top", [18, 40, 58, 72]),
    ("master.turnaround.front", "the right ear's top", [160, 30, 205, 68]),
    ("master.turnaround.side", "the ear's top", [85, 28, 150, 46]),
    ("master.turnaround.three-quarter", "the near ear's top", [150, 28, 200, 60]),
    ("master.turnaround.front", "the left ear's hem (not lit)", [30, 160, 70, 200]),
)


def read(panel, box):
    rgb = np.asarray(Image.open(PANELS / f"{panel}.png").convert("RGB"))
    tau, _ = lm.plateau_tau(rgb, np.ones(rgb.shape[:2], bool))
    keep = np.zeros(rgb.shape[:2], bool)
    x0, y0, x1, y1 = box
    keep[y0:y1, x0:x1] = True
    lines = lm.line_map(rgb, tau, keep)
    lab = lm.sheets.to_lab(rgb)
    core = lm.tone_map(lines)
    pts = np.argwhere(lines["plain"])
    out = []
    for y, x in pts:
        if np.isnan(core[y, x]):
            continue
        # The darkest warm pixel within 1 px: its Lab.
        ys, xs = np.mgrid[max(y - 1, 0):y + 2, max(x - 1, 0):x + 2]
        cand = [(lab[j, i, 0], j, i) for j, i in zip(ys.ravel(), xs.ravel()) if lines["warm"][j, i]]
        if not cand:
            continue
        _, j, i = min(cand)
        out.append(lab[j, i])
    return np.array(out), tau


def lab_to_hex(lab):
    """CIE L*a*b* (D65) to sRGB hex."""
    L, a, b = lab
    fy = (L + 16) / 116
    fx, fz = fy + a / 500, fy - b / 200
    inv = lambda t: t ** 3 if t ** 3 > 0.008856 else (t - 16 / 116) / 7.787  # noqa: E731
    X, Y, Z = 0.95047 * inv(fx), 1.0 * inv(fy), 1.08883 * inv(fz)
    rl = 3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z
    gl = -0.9692660 * X + 1.8760108 * Y + 0.0415560 * Z
    bl = 0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z
    enc = lambda c: 255 * (12.92 * c if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055)  # noqa: E731
    return "#" + "".join(f"{int(round(min(255, max(0, enc(c))))):02X}" for c in (rl, gl, bl))


def main():
    rows = []
    for on, boxes in (("cream", BOXES), ("tan", TAN_BOXES)):
        for panel, what, box in boxes:
            found, tau = read(panel, box)
            if not len(found):
                print(f"{panel} {what}: no line")
                continue
            q = {name: [lm.r(v, 1) for v in np.quantile(found[:, i], [0.25, 0.5, 0.75])] for i, name in enumerate(("L", "a", "b"))}
            median = [float(np.median(found[:, i])) for i in range(3)]
            rows.append({"on": on, "panel": panel, "what": what, "box": box, "tau": tau, "px": int(len(found)), "quartiles": q, "medianHex": lab_to_hex(median)})
            print(f"{on:5} {panel:32} {what:32} px {len(found):4}  L* {q['L']}  a* {q['a']}  b* {q['b']}  median {lab_to_hex(median)}")
    for on in ("cream", "tan"):
        mine = [r["quartiles"]["L"][1] for r in rows if r["on"] == on]
        print(f"{on}: the boxes' median L* {min(mine)} to {max(mine)}")
    (here / "litsteps.json").write_text(json.dumps(rows, indent=1) + "\n")


if __name__ == "__main__":
    main()
