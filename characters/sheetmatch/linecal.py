"""The line check's calibration (docs/phase3-fur-plan.md, C): every threshold
linematch.py holds, measured on the sheet itself, never on a render.

    python3 characters/sheetmatch/linecal.py dog [--stills <dir>] [--out <json>] [--evidence <dir>]

1. Per region: each view's turnaround crop against perturbed copies of itself
   (PERTURBATIONS: the plan's shifted 1 px each way, scaled 2% each way, turned
   1 degree each way, re-encoded as a JPEG at quality 70, Lanczos down and up
   2x and a Gaussian of 0.5 px, and one more, moved half a pixel each way by
   area, the phase at which a render's lines land on the crop's pixels),
   measured by linematch.compare in the regions of a build's stills (--stills,
   default build/stills/<species>: the look loop's; only the regions' places
   come from the build, never its lines). Each threshold is the worst a
   perturbed copy scored, 10% looser, and no run is held finer than
   RESOLUTION_PT. Each crop's tau is where its own skeleton's length plateaus.
2. Absolute widths and the fur's floor, from the sheet's larger panels (the
   hero at about 2.2 px per pt and the stubby paws, PANEL_EDGES; the turnaround
   crops are only about 1.3 px per pt): each edge's line width (the median
   full width at half maximum, pt) and its fur amplitude (linematch.fur_stats),
   per class the widest width the hero draws and the gentlest fur any panel
   draws (a class's edges on one panel taken together). The floppy-ears panel
   is left out: its circle cuts the ear at the top and the right, it draws the
   ear's edge with no outline, and no feature it shares with the hero gives its
   scale.
3. Crispness: a reference ribbon (an edge at every angle) rasterized as resvg
   does, by area, then sampled as WebGL does at a whole, a quarter and half a
   texel off, with no blur and with the soft line's 0.3 pt: the threshold is the
   crisp ribbon's worst rise plus the margin, and the soft one must lie above it.

Writes the calibration (default characters/sheetmatch/lines/<species>.json)
and each view's regions as the build drew them (lines/<species>/<view>.png,
indices into the JSON's hosts, on the crop's own pixels: the tests' fixtures),
and with --evidence a picture of the panels' edges. Exits 0, or 2 on any error.
It takes about a minute."""
import argparse
import io
import json
import sys
import traceback
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

import linematch as lm
import match

sheets = match.sheets
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "refprep"))
import measure  # noqa: E402
import silhouette  # noqa: E402

# The plan's perturbations, then the same kinds sampled finer within the same sizes: twelve draws left each region's
# worst a noisy statistic, which the same sizes held out of the twelve broke in one region or another (DECISIONS 252).
PLAN_PERTURBATIONS = (("shift", (1, 0)), ("shift", (-1, 0)), ("shift", (0, 1)), ("shift", (0, -1)), ("scale", 1.02), ("scale", 0.98),
                      ("rotate", 1.0), ("rotate", -1.0), ("jpeg", 70), ("downup", 2), ("blur", 0.5))
FINER = (("shift", (1, 1)), ("shift", (-1, -1)), ("shift", (1, -1)), ("shift", (-1, 1)), ("scale", 1.01), ("scale", 0.99),
         ("rotate", 0.5), ("rotate", -0.5), ("jpeg", 80), ("jpeg", 90), ("blur", 0.25), ("phase", (0.5, 0.5)),
         ("phase", (0.25, 0.25)), ("phase", (0.5, 0.0)), ("phase", (0.0, 0.5)), ("phase", (0.75, 0.25)))
PERTURBATIONS = PLAN_PERTURBATIONS + FINER
# Held out of the calibration, for the tests: the same kinds at sizes between those it samples.
HELD_OUT = (("scale", 1.015), ("scale", 0.985), ("rotate", 0.75), ("rotate", -0.25), ("jpeg", 75), ("jpeg", 85),
            ("blur", 0.4), ("phase", (0.33, 0.67)), ("phase", (0.67, 0.0)))
# The panels' edges (hand-placed boxes, panel px): what each source draws of each class, and how its edge is found:
# the cut-out's outline ("silhouette"), the boundary of the ears' tan ("tan") or of the collar's blue ("blue").
HERO = "master/master.hero.main"
PANEL_EDGES = (
    {"panel": HERO, "class": "ear", "kind": "silhouette", "box": [5, 95, 100, 248], "note": "the dog's right ear: outer edge and hem"},
    {"panel": HERO, "class": "ear", "kind": "silhouette", "box": [270, 40, 358, 205], "note": "the dog's left ear: outer edge and hem"},
    {"panel": HERO, "class": "cheek", "kind": "tan", "box": [95, 175, 125, 245], "note": "the right cheek's puff over its ear"},
    {"panel": HERO, "class": "cheek", "kind": "tan", "box": [262, 128, 296, 190], "note": "the left cheek's puff over its ear"},
    {"panel": HERO, "class": "chin", "kind": "blue", "box": [140, 205, 255, 232], "note": "the chin's fur over the collar"},
    {"panel": HERO, "class": "tail", "kind": "silhouette", "box": [5, 240, 76, 352], "note": "the tail's plume"},
    {"panel": HERO, "class": "sole", "kind": "silhouette", "box": [82, 350, 146, 372], "note": "a front paw's sole"},
    {"panel": HERO, "class": "sole", "kind": "silhouette", "box": [155, 350, 205, 372], "note": "a front paw's sole"},
    {"panel": HERO, "class": "sole", "kind": "silhouette", "box": [214, 350, 260, 372], "note": "a front paw's sole"},
    {"panel": "master/master.feature.stubby-paws", "class": "sole", "kind": "silhouette", "box": [42, 88, 116, 116], "note": "the stubby paw's sole"},
    {"panel": HERO, "class": "head", "kind": "silhouette", "box": [80, 20, 262, 70], "note": "the crown and topknot"},
    {"panel": HERO, "class": "body", "kind": "silhouette", "box": [258, 215, 300, 330], "note": "the left flank and haunch"},
    {"panel": "turnaround:back", "class": "haunch", "kind": "silhouette", "box": [38, 192, 165, 218], "note": "the haunches' underside from behind (the only panel that draws it)"},
)
# Each panel's scale (pt per px). The hero's comes from its eyes' spacing (model.json); a feature panel's from one
# feature it shares with the hero, measured in both (hand-read chords, panel px).
SCALE_CHORDS = {"master/master.feature.stubby-paws": {"panelPx": 83, "heroPx": 72, "what": "the front paw's width at its sole"}}
CRISP_OFFSETS = ((0.0, 0.0), (0.25, 0.4), (0.5, 0.5))
GRID_MEASURES = tuple(m for m, (_, where) in lm.MEASURES.items() if where == "grid")
SOFT_SIGMA_PT = 0.3  # today's soft line (parts/lines.ts SOFT)


def perturb(image, kind, amount, centre, card):
    """A perturbed copy of the crop on its grid (uint8 RGB), the card filling what moves in."""
    im = Image.fromarray(image)
    cx, cy = centre
    fill = tuple(int(c) for c in card)
    if kind == "shift":
        dx, dy = amount
        return np.asarray(im.transform(im.size, Image.AFFINE, (1, 0, -dx, 0, 1, -dy), resample=Image.NEAREST, fillcolor=fill))
    if kind == "scale":
        s = amount
        return np.asarray(im.transform(im.size, Image.AFFINE, (1 / s, 0, cx - cx / s, 0, 1 / s, cy - cy / s), resample=Image.BICUBIC, fillcolor=fill))
    if kind == "rotate":
        return np.asarray(im.rotate(amount, resample=Image.BICUBIC, center=(cx, cy), fillcolor=fill))
    if kind == "jpeg":
        buffer = io.BytesIO()
        im.save(buffer, "JPEG", quality=amount)
        return np.asarray(Image.open(buffer).convert("RGB"))
    if kind == "downup":
        w, h = im.size
        return np.asarray(im.resize((w // amount, h // amount), Image.LANCZOS).resize((w, h), Image.LANCZOS))
    if kind == "phase":
        # Half a pixel each way, area-sampled: the phase at which a render's lines fall on the crop's pixels.
        dx, dy = amount
        shifted = ndimage.shift(image.astype(np.float64), (dy, dx, 0), order=1, mode="nearest")
        return np.clip(np.round(shifted), 0, 255).astype(np.uint8)
    if kind == "blur":
        return np.clip(np.round(ndimage.gaussian_filter(image.astype(np.float64), (amount, amount, 0))), 0, 255).astype(np.uint8)
    raise ValueError(f"no perturbation {kind!r}")


def perturbed(scene, kind, amount):
    """The scene's crop perturbed in its own frame (so a JPEG's blocks and a halving fall on the crop's own pixels,
    wherever a build lays the crop on its grid), laid back on the grid."""
    h, w = scene.frame.sil.shape
    top, left = scene.grid.top, scene.grid.left
    copy = scene.crop.copy()
    copy[top:top + h, left:left + w] = perturb(scene.crop[top:top + h, left:left + w], kind, amount, (w / 2, h / 2), scene.frame.card)
    return copy


def perturbed_rows(scene, perturbations=PERTURBATIONS):
    """linematch.compare on each perturbed copy of the crop, against the crop: [(perturbation, rows)]."""
    sheet = scene.sheet_map()
    return [((kind, amount), lm.compare(scene, sheet, scene.ours_map(perturbed(scene, kind, amount)))) for kind, amount in perturbations]


def scores(results, name, measure):
    """A region's score under each perturbation (None where it had too little line to measure, or None for all)."""
    values = [rows.get(name, {}).get(measure) for _, rows in results]
    return None if all(v is None for v in values) else values


def thresholds(results):
    """Each region's threshold per measure from the perturbed copies' rows: the worst, less the margin."""
    out = {}
    names = sorted({n for _, rows in results for n in rows})
    for name in names:
        region = {}
        for measure, (sign, where) in lm.MEASURES.items():
            if where != "grid":
                continue
            values = [rows[name][measure] for _, rows in results if rows.get(name, {}).get(measure) is not None]
            if not values:
                region[measure] = {"worst": None, "threshold": None}
                continue
            if measure in lm.TWO_SIDED:
                worst = max(abs(v) for v in values)
                threshold = worst * (1 + lm.MARGIN)
            elif sign > 0:
                worst = min(values)
                threshold = worst * (1 - lm.MARGIN)
            else:
                worst = max(values)
                threshold = worst * (1 + lm.MARGIN)
                if measure in lm.RUNS:
                    threshold = max(threshold, lm.RESOLUTION_PT)
            region[measure] = {"worst": lm.r(worst), "threshold": lm.r(threshold)}
        out[name] = region
    return out


def panel_image(name, species="dog"):
    """A panel's pixels and its own silhouette: the turnaround's from phase 2's cut-out, any other's cut now."""
    folder = sheets.ROOT / "characters" / species / "ref"
    if name.startswith("turnaround:"):
        model = json.loads((sheets.ROOT / "characters" / species / "model.json").read_text())
        rec = model["crops"][name.split(":")[1]]
        rgb = np.asarray(Image.open(folder / "panels" / rec["sheet"] / f"{rec['crop']}.png").convert("RGB"))
        return rgb, np.asarray(Image.open(folder.parent / rec["mask"])) > 0, float(rec["ptPerCropPx"])
    rgb = np.asarray(Image.open(folder / "panels" / f"{name}.png").convert("RGB"))
    return rgb, silhouette.cut_out(rgb), None


def hero_scale(species="dog"):
    """The hero's pt per px: model.json's eye spacing over the hero's own (the centroids of its two eyes)."""
    model = json.loads((sheets.ROOT / "characters" / species / "model.json").read_text())
    rgb, sil, _ = panel_image(HERO, species)
    eyes = measure.eyes(measure.Classes(rgb, sil), 2)
    (x0, y0), (x1, y1) = (measure.centroid(e) for e in eyes)
    spacing = model["proportions"]["eyeSpacingShareOfHead"] * model["proportions"]["headWidth"]
    return spacing / float(np.hypot(x1 - x0, y1 - y0))


def edge_field(rgb, sil, kind):
    """A field whose level EDGE_LEVEL[kind] is the edge: the cut-out (smoothed) for an outline, chroma for the ears'
    tan against the cream (its outline is as saturated as the tan), minus b* for the collar's blue, each on the panel
    blurred by EDGE_BLUR_PX so JPEG noise does not read as fur."""
    if kind == "silhouette":
        return ndimage.gaussian_filter(sil.astype(np.float64), 0.6)
    lab = sheets.to_lab(rgb)
    lab = np.stack([ndimage.gaussian_filter(lab[..., i], EDGE_BLUR_PX) for i in range(3)], axis=-1)
    if kind == "tan":
        return np.hypot(lab[..., 1], lab[..., 2])
    if kind == "blue":
        return -lab[..., 2]
    raise ValueError(f"no edge kind {kind!r}")


# The levels between each side's colour: cream fur has a chroma of about 12, the tan about 35; cream's b* is about
# +12, the collar's blue about -30.
EDGE_LEVEL = {"silhouette": 0.5, "tan": 23.0, "blue": 9.0}
EDGE_BLUR_PX = 0.7


def panel_edge(edge, scale, species="dog"):
    """One panel edge: its contour pieces (pt) inside the box, its fur stats and its line's median width (pt)."""
    rgb, sil, own = panel_image(edge["panel"], species)
    k = own or scale
    x0, y0, x1, y1 = edge["box"]
    field = edge_field(rgb, sil, edge["kind"])
    runs = lm.contour_runs(field, lambda c: (c[:, 1] >= x0) & (c[:, 1] < x1) & (c[:, 0] >= y0) & (c[:, 0] < y1), level=EDGE_LEVEL[edge["kind"]])
    pieces = [np.stack([run[:, 1] * k, run[:, 0] * k], axis=1) for run in runs]
    fur = lm.fur_stats(pieces)
    # The line along the edge: the panel's own line map within 3 px of the edge, its width at each skeleton pixel.
    radius = lm.FINE_TOPHAT_PT / k
    tau, _ = lm.plateau_tau(rgb, np.ones(sil.shape, bool))
    near = np.zeros(field.shape, bool)
    for run in runs:
        near[np.clip(np.round(run[:, 0]).astype(int), 0, field.shape[0] - 1), np.clip(np.round(run[:, 1]).astype(int), 0, field.shape[1] - 1)] = True
    near = ndimage.binary_dilation(near, lm.disk(3))
    lines = lm.line_map(rgb, tau, near, radius=radius)
    pts = np.argwhere(lines["skeleton"])
    width = None
    if len(pts) >= lm.MIN_LINE_PX:
        w = lm.widths(lines["tophat"], pts.astype(float), lm.orientation(lines["skeleton"])[tuple(pts.T)], reach=radius * 1.5, step=0.25)
        width = lm.r(float(np.median(w)) * k)
    return {**edge, "ptPerPx": lm.r(k, 4), "fur": fur, "widthPt": width, "runs": runs, "pieces": pieces, "skeleton": pts}


def panels(species="dog", evidence=None):
    """Each class's sheet width (the widest the hero draws; the render is held to it at the hero's scale, so both
    are blurred alike by their pixels) and fur (the gentlest any source draws)."""
    scales = {HERO: hero_scale(species)}
    for name, chord in SCALE_CHORDS.items():
        scales[name] = scales[HERO] * chord["heroPx"] / chord["panelPx"]
    measured = [panel_edge(e, scales.get(e["panel"]), species) for e in PANEL_EDGES]
    width, fur = {}, {}
    for m in measured:
        if m["widthPt"] is not None and m["panel"] == HERO:
            width[m["class"]] = max(width.get(m["class"], 0), m["widthPt"])
    # A class's fur on one panel is all its edges there taken together (a single paw's sole is too short to read
    # alone); across panels, the gentlest.
    for c in dict.fromkeys(m["class"] for m in measured):
        for panel in dict.fromkeys(m["panel"] for m in measured if m["class"] == c):
            pooled = lm.fur_stats([p for m in measured if m["class"] == c and m["panel"] == panel for p in m["pieces"]])
            if pooled:
                fur[c] = {key: min(pooled[key], fur.get(c, pooled)[key]) for key in ("rmsPt", "crossings10Pt")}
    if evidence:
        panel_picture(measured, Path(evidence) / "panels.png", species)
    sources = [{k: m[k] for k in ("panel", "class", "kind", "box", "note", "ptPerPx", "fur", "widthPt")} for m in measured]
    return {"widthPt": width, "widthPpp": lm.r(1 / scales[HERO], 4), "fur": fur, "sources": sources,
            "scales": {k: lm.r(v, 4) for k, v in scales.items()}, "scaleChords": SCALE_CHORDS}


def panel_picture(measured, path, species="dog", zoom=3):
    """Each panel with its boxes, the edges read in them (red) and their lines' skeletons (blue), each box labelled."""
    tiles = []
    for name in dict.fromkeys(m["panel"] for m in measured):
        rgb, _, _ = panel_image(name, species)
        image = Image.fromarray(match.upscale(rgb, zoom))
        draw = ImageDraw.Draw(image)
        for m in (m for m in measured if m["panel"] == name):
            x0, y0, x1, y1 = m["box"]
            draw.rectangle([x0 * zoom, y0 * zoom, x1 * zoom, y1 * zoom], outline=(40, 160, 40), width=2)
            for y, x in m["skeleton"]:
                if x0 <= x < x1 and y0 <= y < y1:
                    draw.point([(x * zoom + 1, y * zoom + 1)], fill=(30, 90, 230))
            for run in m["runs"]:
                draw.line([(x * zoom, y * zoom) for y, x in run], fill=(225, 30, 40), width=1)
            fur = m["fur"] or {}
            match.label(draw, (x0 * zoom + 2, y0 * zoom + 2), f"{m['class']}: fur {fur.get('rmsPt')} pt, {fur.get('crossings10Pt')}/10 pt; line {m['widthPt']} pt", (20, 20, 20))
        tiles.append(np.asarray(image))
    height = max(t.shape[0] for t in tiles)
    row = np.concatenate([np.pad(t, ((0, height - t.shape[0]), (0, 8), (0, 0)), constant_values=255) for t in tiles], axis=1)
    path.parent.mkdir(parents=True, exist_ok=True)
    sheets.save_png(path, row)


def ribbon(sigma_pt, offset, ppp=3, radius_pt=12.0, supersample=16):
    """A disc's alpha (an edge at every angle) rasterized by area at ppp px per pt after a Gaussian of sigma_pt, then
    sampled bilinearly at a sub-texel offset, as WebGL samples an atlas."""
    size = int(2 * radius_pt * ppp + 20)
    n = size * supersample
    centre = n / 2 + 0.37 * supersample
    y, x = np.mgrid[0:n, 0:n] + 0.5
    hi = (((x - centre) ** 2 + (y - centre) ** 2) <= (radius_pt * ppp * supersample) ** 2).astype(np.float32)
    if sigma_pt:
        hi = ndimage.gaussian_filter(hi, sigma_pt * ppp * supersample)
    alpha = hi.reshape(size, supersample, size, supersample).mean(axis=(1, 3))
    if offset != (0.0, 0.0):
        yy, xx = np.mgrid[0:size, 0:size].astype(np.float64)
        alpha = ndimage.map_coordinates(alpha, [yy + offset[1], xx + offset[0]], order=1)
    return alpha


def crisp(ppp=3):
    """The crispness threshold: the crisp ribbon's worst median rise (over the sampling offsets) plus the margin,
    beside the soft ribbon's best, which must lie above it."""
    def median_rise(alpha):
        from skimage import measure as skmeasure
        points = np.concatenate(skmeasure.find_contours(alpha, 0.5))[::2]
        return float(np.median(lm.rises(alpha, points, ppp)))

    hard = [median_rise(ribbon(0.0, o, ppp)) for o in CRISP_OFFSETS]
    soft = [median_rise(ribbon(SOFT_SIGMA_PT, o, ppp)) for o in CRISP_OFFSETS]
    threshold = max(hard) * (1 + lm.MARGIN)
    if min(soft) <= threshold:
        raise ValueError(f"the soft ribbon's rise ({min(soft):.3f} pt) does not lie above the crisp one's threshold ({threshold:.3f} pt)")
    return {"crispWorstPt": lm.r(max(hard)), "softBestPt": lm.r(min(soft)), "thresholdPt": lm.r(threshold),
            "crispPt": [lm.r(v) for v in hard], "softPt": [lm.r(v) for v in soft], "offsetsPx": [list(o) for o in CRISP_OFFSETS],
            "softSigmaPt": SOFT_SIGMA_PT}


def views_of(model):
    return list(model["crops"]) + list(model.get("mirroredViews", {}))


SHEET_SCALE = 3  # still px per crop px in the sheet's own still, so its round trip to the crop's grid is exact
SHEET_PAD = 16  # crop px of card round the crop in it



def sheet_parts(species, view, calibration):
    """The sheet's own crop, hosts map (the regions the calibration's build drew, lines/<species>/<view>.png) and
    coverage (opaque), each on the crop's pixels in the crop's own (left-facing) frame, where a fault is planted."""
    model = json.loads((sheets.ROOT / "characters" / species / "model.json").read_text())
    rec = calibration["views"][view]
    frame = match.Frame(species, model, view)
    hosts = np.array(rec["hosts"])[np.asarray(Image.open(sheets.ROOT / rec["hostsMap"]))]
    # Opaque over the whole crop, so the still laid back on the crop's grid is the crop, pixel for pixel.
    return frame.crop.copy(), hosts, np.ones(frame.sil.shape)


def sheet_still(species, view, out, calibration, parts=None):
    """The sheet drawn as a still (runtime-web/README.md, Stills): the crop enlarged SHEET_SCALE times by
    repetition, over its coverage, with an ID pass of its hosts map; parts (rgb, hosts, cover from sheet_parts,
    perhaps with a fault planted) replace the sheet's own. A .R facing's still is its .L crop's, mirrored back into
    the facing, as a render of it would be. Returns the folder."""
    model = json.loads((sheets.ROOT / "characters" / species / "model.json").read_text())
    frame = match.Frame(species, model, view)
    crop, hosts, cover = parts if parts is not None else sheet_parts(species, view, calibration)
    names = sorted(set(hosts.ravel()))
    gx, gy = frame.rec["anchorsCropPx"]["ground"]
    h, w = frame.sil.shape
    if frame.mirrored:
        crop, hosts, cover = crop[:, ::-1], hosts[:, ::-1], cover[:, ::-1]
        gx = w - 1 - gx
    p, s = SHEET_PAD, SHEET_SCALE
    k = frame.k

    def big(a, fill):
        padded = np.pad(a, ((p, p), (p, p)) + ((0, 0),) * (a.ndim - 2), constant_values=fill)
        return np.repeat(np.repeat(padded, s, axis=0), s, axis=1)

    colour = big(crop.astype(np.float64), 255) / 255
    a = big(cover, 0.0)[..., None]
    white = np.clip(np.round((colour * a + (1 - a)) * 255), 0, 255).astype(np.uint8)
    black = np.clip(np.round(colour * a * 255), 0, 255).astype(np.uint8)
    ids_parts = {}
    ids = np.zeros(white.shape, np.uint8)
    hosts_big = big(hosts, lm.OUTSIDE)
    colours = id_colours(len(names) + 2)
    for i, name in enumerate(n for n in names if n not in (lm.OUTSIDE, lm.LEFT_OUT)):
        part = match.GROUND_SHADOW if name == lm.GROUND else name
        ids_parts[part] = {"id": sheets.rgb_to_hex(colours[i]), "bone": "root"}
        ids[hosts_big == name] = colours[i]
    if lm.LEFT_OUT in names:
        # The face and the tag: one part the line check leaves out, as it leaves out the eyes.
        ids_parts["eye.L"] = {"id": sheets.rgb_to_hex(colours[-1]), "bone": "root"}
        ids[hosts_big == lm.LEFT_OUT] = colours[-1]
    folder = Path(out)
    folder.mkdir(parents=True, exist_ok=True)
    for name, image in (("white.png", white), ("black.png", black), ("ids.png", ids)):
        sheets.save_png(folder / name, image)
    root = [(gx + 0.5 + p) * s, (gy + 0.5 + p) * s]
    meta = {"species": species, "still": f"sheet_{view}", "clip": f"sheet_{view}", "views": {"body": view, "head": view},
            "ppp": s / k, "sizePx": [white.shape[1], white.shape[0]], "rootPx": root, "parts": ids_parts, "drawn": list(ids_parts)}
    sheets.write_json(folder / "still.json", meta)
    return folder


def id_colours(count):
    """Distinct ID colours, far apart and never the ID pass's black background."""
    found, n = [], 0
    while len(found) < count:
        n += 1
        c = np.array([(n * 97) % 251 + 4, (n * 53) % 241 + 8, (n * 151) % 239 + 12])
        if all(np.linalg.norm(c - f) > 4 * match.ID_TOLERANCE for f in found):
            found.append(c)
    return [c.astype(np.uint8) for c in found]


def calibrate(species, stills, out, evidence=None):
    model = json.loads((sheets.ROOT / "characters" / species / "model.json").read_text())
    folder = out.parent / species
    folder.mkdir(parents=True, exist_ok=True)
    crops, views = {}, {}
    for view in views_of(model):
        scene = lm.Scene(species, Path(stills) / view, {"crops": crops})
        source = scene.frame.source
        if source not in crops:
            tau, curve = lm.plateau_tau(scene.crop, scene.keep)
            crops[source] = {"tau": tau, "skeletonPxByTau": curve}
            scene.tau = tau
        results = perturbed_rows(scene)
        h, w = scene.frame.sil.shape
        hosts = scene.hosts[scene.grid.top:scene.grid.top + h, scene.grid.left:scene.grid.left + w]
        names = sorted(set(hosts.ravel()))
        if len(names) > 255:
            raise ValueError("more than 255 hosts")
        sheets.save_png(folder / f"{view}.png", np.array([names.index(v) for v in hosts.ravel()], np.uint8).reshape(hosts.shape))
        views[view] = {"crop": source, "hosts": names, "hostsMap": match.repo_path(folder / f"{view}.png"),
                       "regions": thresholds(results),
                       # each region's score under each perturbation, in the order of the top-level "perturbations"
                       "perturbed": {n: {m: scores(results, n, m) for m in GRID_MEASURES}
                                     for n in sorted({n for _, rows in results for n in rows})}}
        print(f"linecal: {view}: tau {crops[source]['tau']}, {len(views[view]['regions'])} regions", flush=True)
    result = {"species": species, "note": "linecal.py's output: every threshold linematch.py holds, measured on the sheet (docs/phase3-fur-plan.md, C)",
              "regionsFrom": match.repo_path(stills), "margin": lm.MARGIN, "resolutionPt": lm.RESOLUTION_PT,
              "perturbations": [f"{k} {a}" for k, a in PERTURBATIONS], "crops": crops,
              "panels": panels(species, evidence), "crisp": crisp(), "views": views}
    sheets.write_json(out, result)
    return result


def main(argv):
    parser = argparse.ArgumentParser(usage=__doc__)
    parser.add_argument("species")
    parser.add_argument("--stills")
    parser.add_argument("--out")
    parser.add_argument("--evidence")
    args = parser.parse_args(argv)
    stills = Path(args.stills or sheets.ROOT / "build" / "stills" / args.species)
    out = Path(args.out or Path(__file__).resolve().parent / "lines" / f"{args.species}.json")
    try:
        result = calibrate(args.species, stills, out, args.evidence)
    except Exception as error:
        traceback.print_exc()
        print(f"linecal: {type(error).__name__}: {error}", file=sys.stderr)
        return 2
    c = result["crisp"]
    print(f"linecal: crisp ribbon {c['crispWorstPt']} pt, soft {c['softBestPt']} pt, threshold {c['thresholdPt']} pt; "
          f"panel widths {result['panels']['widthPt']}; fur {result['panels']['fur']}; written to {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
