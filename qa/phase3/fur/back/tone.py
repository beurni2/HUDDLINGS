# The back's outline, its tone along it, the crop against our stills, read the same way on each (DECISIONS 302): each
# still area-sampled to the crop's own grid (as the line check reads ours), then at every 0.5 pt along the contour of the
# dog's silhouette in the last still (its ID pass, the ground shadow left out; or one part's, --part) the darkest L*
# across the edge (bilinear, from 2.4 pt inside to 1.2 pt outside along its normal). Prints each named place's median
# [10th..90th percentile] and spread, and writes a plot along the contour (<out>.png). Measures, never traces (R8).
#
# python3 qa/phase3/fur/back/tone.py [--stills qa/phase3/fur/back/before.png build/stills/dog/back/white.png]
#     [--names 46011a2 now] [--out qa/phase3/fur/back/tone]
import argparse, json, os
import numpy as np
from PIL import Image
from skimage import measure
from skimage.color import rgb2lab

HERE = os.path.dirname(os.path.abspath(__file__))
WT = os.path.abspath(os.path.join(HERE, "../../../.."))
model = json.load(open(WT + "/characters/dog/model.json"))["crops"]["back"]
S = model["ptPerCropPx"]
G = model["anchorsCropPx"]["ground"]
crop_rgb = np.asarray(Image.open(WT + "/characters/dog/ref/panels/master/" + model["crop"] + ".png").convert("RGB"))
CH, CW = crop_rgb.shape[:2]
L_crop = rgb2lab(crop_rgb / 255.0)[..., 0]


def still(path):
    meta = os.path.join(os.path.dirname(path), "still.json")
    # before.png sits beside no still.json: a 3x still with its root where look.ts puts it
    info = json.load(open(meta)) if os.path.exists(meta) else {"ppp": 3, "rootPx": [257, 517]}
    ppp, root = info["ppp"], info["rootPx"]
    im = Image.open(path).convert("RGB")
    # crop pixel i covers model x in [(i - G0 - 0.5) S, (i - G0 + 0.5) S]
    L0 = root[0] + (-G[0] - 0.5) * S * ppp
    T0 = root[1] + (-G[1] - 0.5) * S * ppp
    box = (L0, T0, L0 + CW * S * ppp, T0 + CH * S * ppp)
    small = np.asarray(im.resize((CW, CH), Image.BOX, box=box)).astype(float)
    return {"ppp": ppp, "root": root, "L": rgb2lab(small / 255.0)[..., 0], "full": np.asarray(im), "dir": os.path.dirname(path)}


def bil(a, px, py):
    # px, py in pixel-centre coordinates (pixel i's centre at i)
    h, w = a.shape
    x0 = int(np.floor(px)); y0 = int(np.floor(py)); fx = px - x0; fy = py - y0
    if x0 < 0 or y0 < 0 or x0 + 1 >= w or y0 + 1 >= h:
        return 100.0
    return a[y0, x0] * (1 - fx) * (1 - fy) + a[y0, x0 + 1] * fx * (1 - fy) + a[y0 + 1, x0] * (1 - fx) * fy + a[y0 + 1, x0 + 1] * fx * fy


def grid(x, y):
    # model pt -> crop pixel-centre coordinates
    return G[0] + x / S, G[1] + y / S


def contour(st, part=None):
    d = st["dir"]
    if not os.path.exists(os.path.join(d, "ids.png")):
        raise SystemExit(f"{d}: the contour is read on the last still's ID pass (ids.png beside it)")
    if part:
        info = json.load(open(os.path.join(d, "still.json")))
        hexid = info["parts"][part]["id"].lstrip("#")
        rgb = np.array([int(hexid[i:i + 2], 16) for i in (0, 2, 4)])
        ids = np.asarray(Image.open(os.path.join(d, "ids.png")).convert("RGB")).astype(int)
        mask = (np.abs(ids - rgb).sum(-1) < 6).astype(float)
    else:
        # the dog's own silhouette: every part's ID but the ground shadow's
        ids = np.asarray(Image.open(os.path.join(d, "ids.png")).convert("RGB")).astype(int)
        mask = ((ids.sum(-1) > 0) & ~((ids[..., 0] == 255) & (ids[..., 1] == 0) & (ids[..., 2] == 0))).astype(float)
    cs = measure.find_contours(mask, 0.5)
    c = max(cs, key=len)
    ppp, root = st["ppp"], st["root"]
    pts = np.stack([(c[:, 1] - root[0]) / ppp, (c[:, 0] - root[1]) / ppp], 1)
    seg = np.r_[0, np.cumsum(np.hypot(*np.diff(pts, axis=0).T))]
    s = np.arange(0, seg[-1], 0.5)
    P = np.stack([np.interp(s, seg, pts[:, 0]), np.interp(s, seg, pts[:, 1])], 1)
    # smooth for the normal
    k = 4
    Ps = np.array([P[max(0, i - k):i + k + 1].mean(0) for i in range(len(P))])
    t = np.gradient(Ps, axis=0)
    t /= np.linalg.norm(t, axis=1, keepdims=True) + 1e-9
    n = np.stack([t[:, 1], -t[:, 0]], 1)
    # outward: the mask is lower outside
    probe = P + n * 1.5
    def inside(p):
        x = root[0] + p[0] * ppp; y = root[1] + p[1] * ppp
        xi, yi = int(round(x)), int(round(y))
        if 0 <= yi < mask.shape[0] and 0 <= xi < mask.shape[1]:
            return mask[yi, xi]
        return 0
    flip = np.mean([inside(p) for p in probe]) > 0.5
    if flip:
        n = -n
    return P, n, s


def darkest(Lgrid, P, n, lo=-2.4, hi=1.2):
    out = []
    for p, q in zip(P, n):
        best = 100.0
        for u in np.arange(lo, hi + 1e-6, 0.1):
            x, y = p + q * u
            gx, gy = grid(x, y)
            best = min(best, bil(Lgrid, gx, gy))
        out.append(best)
    return np.array(out)


PLACES = [
    ("ear.L upper outer (y -130..-105)", lambda x, y: x < -50 and -130 <= y <= -105),
    ("ear.L mid outer (y -105..-86)", lambda x, y: x < -60 and -105 < y <= -86),
    ("ear.L hem (y > -86)", lambda x, y: x < -40 and -86 < y <= -66),
    ("ear.R upper outer (y -130..-105)", lambda x, y: x > 50 and -130 <= y <= -105),
    ("ear.R mid outer (y -105..-86)", lambda x, y: x > 60 and -105 < y <= -86),
    ("ear.R hem (y > -86)", lambda x, y: x > 40 and -86 < y <= -66),
    ("crown L (x -42..-17)", lambda x, y: -42 <= x <= -17 and y < -140),
    ("crown by topknot's L foot (x -22..-16.5)", lambda x, y: -22 <= x <= -16.5 and y < -150),
    ("topknot (x -16..24)", lambda x, y: -16 < x < 24 and y < -150),
    ("crown R (x 24..45)", lambda x, y: 24 <= x <= 45 and y < -140),
    ("shoulder L (y -64..-40)", lambda x, y: x < -25 and -64 <= y < -40),
    ("haunch L top (y -40..-16)", lambda x, y: x < -38 and -40 <= y < -16),
    ("heel L (y -16..-3)", lambda x, y: x < -28 and -16 <= y < -3 and x < -34),
    ("ground (y > -4, |x|<34)", lambda x, y: abs(x) < 34 and y >= -4),
    ("heel R", lambda x, y: x > 34 and -16 <= y < -3),
    ("haunch R top (y -40..-16)", lambda x, y: x > 38 and -40 <= y < -16),
    ("shoulder R (y -64..-40)", lambda x, y: x > 25 and -64 <= y < -40),
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--stills", nargs="+", default=[os.path.join(HERE, "before.png"), os.path.join(WT, "build/stills/dog/back/white.png")])
    ap.add_argument("--names", nargs="+", default=["46011a2", "now"])
    ap.add_argument("--out", default=os.path.join(HERE, "tone"))
    ap.add_argument("--part")
    ap.add_argument("--dump")
    ap.add_argument("--every", type=int, default=2)
    a = ap.parse_args()
    sts = [still(p) for p in a.stills]
    P, n, s = contour(sts[-1], a.part)
    rows = {"sheet": darkest(L_crop, P, n)}
    for name, st in zip(a.names, sts):
        rows[name] = darkest(st["L"], P, n)
    places = PLACES if not a.part else [("all", lambda x, y: True)]
    names = ["sheet"] + a.names
    print("%-42s " % "place (L* of the darkest across the edge, crop grid)" + "  ".join("%-26s" % k for k in names))
    for label, f in places:
        sel = np.array([f(x, y) for x, y in P])
        if not sel.any():
            continue
        cells = []
        for k in names:
            v = rows[k][sel]
            cells.append("%4.1f [%4.1f..%4.1f] sp %4.1f" % (np.median(v), np.percentile(v, 10), np.percentile(v, 90), np.percentile(v, 90) - np.percentile(v, 10)))
        print("%-42s " % label + "  ".join("%-26s" % c for c in cells))
    if a.dump:
        for label, f in places:
            if a.dump not in label:
                continue
            sel = np.where([f(x, y) for x, y in P])[0]
            print("\n" + label)
            for i in sel[:: a.every]:
                print("  (%6.1f, %6.1f)  " % tuple(P[i]) + "  ".join("%s %5.1f" % (k, np.mean(rows[k][max(0, i - 1):i + 2])) for k in names))
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    fig, ax = plt.subplots(figsize=(16, 4.5))
    colours = {"sheet": "#7a4a2a"}
    for k in names:
        ax.plot(s, rows[k], label=k, lw=1.4 if k == "sheet" else 1.0, color=colours.get(k))
    # label places along the x axis
    for label, f in places:
        sel = np.array([f(x, y) for x, y in P])
        if sel.any():
            idx = np.where(sel)[0]
            ax.axvspan(s[idx[0]], s[idx[-1]], alpha=0.06, color="k")
            ax.text(s[idx].mean(), 101, label.split(" (")[0], ha="center", fontsize=7, rotation=0)
    ax.set_ylim(35, 104)
    ax.set_ylabel("L* darkest across the edge")
    ax.set_xlabel("pt along the contour" + (f" of {a.part}" if a.part else " of the silhouette"))
    ax.legend(loc="lower right")
    fig.tight_layout()
    fig.savefig(a.out + ".png", dpi=80)


if __name__ == "__main__":
    main()
