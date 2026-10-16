"""The line check's calibration (docs/phase3-fur-plan.md, C): every threshold
linematch.py holds, measured on the sheet itself, never on a render.

    python3 characters/sheetmatch/linecal.py dog [--stills <dir>] [--out <json>] [--evidence <dir>]

1. Per region: each view's turnaround crop against perturbed copies of itself,
   measured by linematch.compare in the regions of a build's stills (--stills,
   default build/stills/<species>: the look loop's; only the regions' places
   come from the build, never its lines). The copies (PERTURBATIONS) are the
   plan's eleven (shifted 1 px each way, scaled 2% each way, turned 1 degree
   each way, a JPEG at quality 70, a Lanczos down and up by 2, a Gaussian of
   0.5 px), every corner of their kinds in combination (scale, turn, softening
   and JPEG at their extremes, at a seeded sub-pixel shift) and seeded draws
   from inside the same sizes. Each copy is made on the crop with card round
   it, and its regions moved with it: the copy plays the render, read on its
   own ID pass. Each threshold is the worst a copy would score in TAIL_DRAWS
   draws (an exponential tail on the region's worst fifth), 10% looser, and
   never finer than the measure's resolution (floors). Each crop's tau is
   where its own skeleton's length plateaus.
2. Absolute widths, their variation and the fur's floor, from the sheet's
   larger panels (the hero at about 2.1 px per pt and the stubby paws,
   PANEL_EDGES; the turnaround crops are only about 1.3 px per pt): each
   edge's line width (the median full width at half maximum, pt), its
   variation where it runs alone, a sole's middle width, and its fur amplitude
   (linematch.fur_stats) above the staircase a smooth edge reads at the
   panel's pixels; per class the widest width and the evenest variation the
   hero draws, and the gentlest fur any panel draws (a class's edges on one
   panel taken together). The floppy-ears panel is left out: its circle cuts
   the ear at the top and the right, it draws the ear's edge with no outline,
   and no feature it shares with the hero gives its scale.
3. Crispness: a reference ribbon (an edge at every angle) rasterized as resvg
   does, by area, then sampled as WebGL does at a whole, a quarter and half a
   texel off, with no blur and with the soft line's 0.3 pt: the threshold is the
   crisp ribbon's worst rise plus the margin, and the soft one must lie above it.

Writes the calibration (default characters/sheetmatch/lines/<species>.json)
and each view's regions as the build drew them (lines/<species>/<view>.png,
indices into the JSON's hosts, on the crop's own pixels: the tests' fixtures),
and with --evidence a picture of the panels' edges. Exits 0, or 2 on any error.
It takes about a minute and a half on four cores."""
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

# A perturbation (the plan, C) is a move (dx, dy px, a scale and a turn in degrees about the crop's centre, one
# bicubic resample), then a softening (a Gaussian of sigma px, or a Lanczos down and up by 2), then a JPEG quality,
# each or none. The plan's eleven, one kind each:
PLAN_PERTURBATIONS = ({"move": (1, 0, 1, 0)}, {"move": (-1, 0, 1, 0)}, {"move": (0, 1, 1, 0)}, {"move": (0, -1, 1, 0)},
                      {"move": (0, 0, 1.02, 0)}, {"move": (0, 0, 0.98, 0)}, {"move": (0, 0, 1, 1.0)}, {"move": (0, 0, 1, -1.0)},
                      {"jpeg": 70}, {"downup": True}, {"blur": 0.5})
# Their kinds in combination, within the plan's sizes: every corner of scale, turn, softening and JPEG (the extremes,
# where the measures stray furthest), each at a seeded sub-pixel phase, then CALIBRATION_DRAWS seeded draws from
# inside the sizes (DECISIONS 252).
CALIBRATION_SEED, CALIBRATION_DRAWS = 1, 40
HELD_OUT_SEED = 2  # the held-out draws (lineheld.py, the tests): the same kinds and sizes, never in the calibration
# Seventy-five draws leave a region's worst a noisy statistic (the held-out draws beat it in one region or another in
# a run in eight), so each threshold is the worst of TAIL_DRAWS draws, estimated by an exponential tail on the worst
# TAIL_SHARE of the region's own draws (tail_worst, DECISIONS 252).
TAIL_DRAWS, TAIL_SHARE, TAIL_MIN = 1000, 0.2, 5


def corners(seed=CALIBRATION_SEED):
    rng = np.random.default_rng(seed)
    out = []
    for scale in (0.98, 1.02):
        for turn in (-1.0, 1.0):
            for soften in ({}, {"blur": 0.5}, {"downup": True}):
                for jpeg in ({}, {"jpeg": 70}):
                    dx, dy = (round(float(v), 2) for v in rng.uniform(-1, 1, 2))
                    out.append({"move": (dx, dy, scale, turn), **soften, **jpeg})
    return tuple(out)


def draws(seed, count):
    """count perturbations drawn inside the plan's sizes: a move always, a softening and a JPEG sometimes."""
    rng = np.random.default_rng(seed)
    out = []
    for _ in range(count):
        dx, dy = rng.uniform(-1, 1, 2)
        spec = {"move": (round(float(dx), 2), round(float(dy), 2), round(float(rng.uniform(0.98, 1.02)), 4), round(float(rng.uniform(-1, 1)), 2))}
        soften = rng.uniform()
        if soften < 0.3:
            spec["blur"] = round(float(rng.uniform(0.05, 0.5)), 2)
        elif soften < 0.45:
            spec["downup"] = True
        if rng.uniform() < 0.5:
            spec["jpeg"] = int(rng.integers(70, 96))
        out.append(spec)
    return tuple(out)


PERTURBATIONS = PLAN_PERTURBATIONS + corners() + draws(CALIBRATION_SEED, CALIBRATION_DRAWS)
CHECKED = (0, 8)  # the plan's shift and its JPEG 70: their scores are kept, and the tests measure them again


def label(spec):
    """A perturbation's name, as the calibration lists it."""
    parts = []
    if "move" in spec:
        dx, dy, scale, turn = spec["move"]
        parts.append(f"move {dx:g},{dy:g} px x{scale:g} {turn:g} deg")
    if "blur" in spec:
        parts.append(f"blur {spec['blur']:g} px")
    if spec.get("downup"):
        parts.append("down-up 2x")
    if "jpeg" in spec:
        parts.append(f"jpeg {spec['jpeg']}")
    return " + ".join(parts)


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


def move_inverse(move, centre):
    """The affine that takes a moved pixel back to where it came from: (matrix, offset), source = matrix @ out + offset."""
    dx, dy, scale, turn = move
    t = np.radians(turn)
    forward = scale * np.array([[np.cos(t), -np.sin(t)], [np.sin(t), np.cos(t)]])
    inverse = np.linalg.inv(forward)
    c = np.asarray(centre, float)
    return inverse, c - inverse @ (c + np.array([dx, dy], float))


def perturb(image, hosts, spec, card):
    """A perturbed copy of the crop (uint8 RGB, the card filling what moves in) and its hosts moved with it (nearest:
    the parts a render of the moved drawing would name), on the crop's own pixels."""
    h, w = image.shape[:2]
    centre = (w / 2, h / 2)
    fill = tuple(int(c) for c in card)
    out = image
    if "move" in spec:
        inverse, offset = move_inverse(spec["move"], centre)
        coefficients = (inverse[0, 0], inverse[0, 1], offset[0], inverse[1, 0], inverse[1, 1], offset[1])
        out = np.asarray(Image.fromarray(out).transform((w, h), Image.AFFINE, coefficients, resample=Image.BICUBIC, fillcolor=fill))
        yy, xx = np.mgrid[:h, :w].astype(np.float64) + 0.5
        sx = np.floor(inverse[0, 0] * xx + inverse[0, 1] * yy + offset[0]).astype(int)
        sy = np.floor(inverse[1, 0] * xx + inverse[1, 1] * yy + offset[1]).astype(int)
        inside = (sx >= 0) & (sx < w) & (sy >= 0) & (sy < h)
        moved = np.full(hosts.shape, lm.OUTSIDE, dtype=object)
        moved[inside] = hosts[sy[inside], sx[inside]]
        hosts = moved
    if "blur" in spec:
        out = np.clip(np.round(ndimage.gaussian_filter(out.astype(np.float64), (spec["blur"], spec["blur"], 0))), 0, 255).astype(np.uint8)
    if spec.get("downup"):
        im = Image.fromarray(out)
        out = np.asarray(im.resize((w // 2, h // 2), Image.LANCZOS).resize((w, h), Image.LANCZOS))
    if "jpeg" in spec:
        buffer = io.BytesIO()
        Image.fromarray(out).save(buffer, "JPEG", quality=spec["jpeg"])
        out = np.asarray(Image.open(buffer).convert("RGB"))
    return out, hosts


def perturbed(scene, spec):
    """The scene's crop perturbed in its own frame, with PERTURB_PAD px of card round it so nothing a move carries
    out of the crop is lost (and a JPEG's blocks still fall on the crop's own pixels, wherever a build lays the crop
    on its grid), laid back on the grid; and the scene with its hosts moved with it: the perturbed copy plays the
    render, which is read on its own ID pass, as a render is."""
    h, w = scene.frame.sil.shape
    gh, gw = scene.crop.shape[:2]
    top, left = scene.grid.top - PERTURB_PAD, scene.grid.left - PERTURB_PAD
    pad_rgb = np.empty((h + 2 * PERTURB_PAD, w + 2 * PERTURB_PAD, 3), np.uint8)
    pad_rgb[:] = scene.frame.card
    pad_hosts = np.full(pad_rgb.shape[:2], lm.OUTSIDE, dtype=object)
    # The part of the padded window that lies on the grid (the grid may be tighter than the pad on a side).
    y0, x0, y1, x1 = max(top, 0), max(left, 0), min(top + pad_rgb.shape[0], gh), min(left + pad_rgb.shape[1], gw)
    window = (slice(y0 - top, y1 - top), slice(x0 - left, x1 - left))
    pad_rgb[window], pad_hosts[window] = scene.crop[y0:y1, x0:x1], scene.hosts[y0:y1, x0:x1]
    moved_rgb, moved_hosts = perturb(pad_rgb, pad_hosts, spec, scene.frame.card)
    copy, hosts = scene.crop.copy(), scene.hosts.copy()
    copy[y0:y1, x0:x1], hosts[y0:y1, x0:x1] = moved_rgb[window], moved_hosts[window]
    return copy, (scene.rehosted(hosts) if "move" in spec else scene)


PERTURB_PAD = 8  # px of card round the crop while it is perturbed: a whole JPEG block


def perturbed_rows(scene, perturbations=PERTURBATIONS):
    """linematch.compare on each perturbed copy of the crop (on its own moved hosts), against the crop:
    [(perturbation, rows)]."""
    out = []
    for spec in perturbations:
        image, moved = perturbed(scene, spec)
        out.append((spec, lm.compare(moved, moved.sheet_map(), moved.ours_map(image))))
    return out


def worse(measure, values):
    """A measure's values turned so a larger one is always worse: a share's miss, a two-sided measure's size."""
    sign = lm.MEASURES[measure][0]
    values = np.asarray(values, np.float64)
    return np.abs(values) if measure in lm.TWO_SIDED else (1 - values if sign > 0 else values)


def tail_worst(values, draws=TAIL_DRAWS):
    """The worst of draws perturbed copies, estimated from the region's own (a larger value worse): an exponential
    tail fitted to the worst TAIL_SHARE of them (from u, the best of those, by their mean excess), never under the
    worst seen. Returns (worst, tail, u, mean excess)."""
    x = np.sort(np.asarray(values, np.float64))
    n = len(x)
    m = max(TAIL_MIN, int(round(n * TAIL_SHARE)))
    if n <= m + 1:
        return float(x[-1]), float(x[-1]), float(x[-1]), 0.0
    u = float(x[n - m - 1])
    excess = float(np.mean(x[n - m:] - u))
    return float(x[-1]), max(float(x[-1]), u + excess * float(np.log(m * draws / n))), u, excess


def floors(k):
    """Each measure's resolution, under which no threshold is held (k: the crop's pt per px): a run of two pixels
    whichever way they lie (2.5 px, between two diagonal pixels' 2.4 and three in a row: the crops resolve no run
    under 1.5 pt, the plan's C, and a run's length counts its own pixels), a seam's window across (a seam is read
    through windows SEAM_SIDE_PX either side, so a short seam reads as one window long), 3 L* of tone (the plan's
    seams call a step under 3 L* flat), log(4/3) of ink along a line (the crops resolve no line width under 0.4 pt,
    the plan's C, a third of the hero's 1.2 pt line) and log(3/2) of a region's ink (it counts every pixel of the band,
    whose edges cut the lines beside it, so a shift of a pixel moves it by a third more). A share's floor (two pixels
    of its line) is linematch.judge's, since it counts the image judged."""
    run = RUN_FLOOR_PX * k
    seam = (2 * lm.SEAM_SIDE_PX + 1) * k
    return {"gapPt": run, "weakPt": run, "extraPt": run, "hardSeamPt": seam, "lightSeamPt": seam, "toneDelta": lm.TONE_RESOLUTION_L,
            "inkLog": lm.INK_RESOLUTION_LOG, "regionInkLog": float(np.log(3 / 2))}


RUN_FLOOR_PX = 2.5


def thresholds(results, k):
    """Each region's threshold per measure from the perturbed copies' rows: the worst a copy would score in TAIL_DRAWS
    draws (tail_worst), 10% looser (a share 10% lower), never finer than the measure's resolution (floors)."""
    out = {}
    names = sorted({n for _, rows in results for n in rows})
    floor = floors(k)
    for name in names:
        region = {}
        for measure, (sign, where) in lm.MEASURES.items():
            if where != "grid":
                continue
            values = [rows[name][measure] for _, rows in results if rows.get(name, {}).get(measure) is not None]
            if not values:
                region[measure] = {"worst": None, "threshold": None}
                continue
            worst, tail, u, excess = tail_worst(worse(measure, values))
            if sign > 0 and measure not in lm.TWO_SIDED:
                threshold = (1 - tail) * (1 - lm.MARGIN)
                worst, tail, u = 1 - worst, 1 - tail, 1 - u
            else:
                threshold = max(tail * (1 + lm.MARGIN), floor.get(measure, 0.0))
            region[measure] = {"worst": lm.r(worst, 6), "tail": lm.r(tail), "tailFrom": lm.r(u, 6), "tailExcess": lm.r(excess, 6),
                               "draws": len(values), "threshold": lm.r(threshold)}
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
    """One panel edge: its contour pieces (pt) inside the box, its fur stats (raw, the staircase a smooth edge reads
    at the panel's pixels, and above it), and its line's widths (pt: the median, the coefficient of variation where the
    line runs alone, and on a sole the median over its middle)."""
    rgb, sil, own = panel_image(edge["panel"], species)
    k = own or scale
    x0, y0, x1, y1 = edge["box"]
    field = edge_field(rgb, sil, edge["kind"])
    runs = lm.contour_runs(field, lambda c: (c[:, 1] >= x0) & (c[:, 1] < x1) & (c[:, 0] >= y0) & (c[:, 0] < y1), level=EDGE_LEVEL[edge["kind"]])
    pieces = [np.stack([run[:, 1] * k, run[:, 0] * k], axis=1) for run in runs]
    raw = lm.fur_stats(pieces)
    floor = staircase(runs, field, k) if edge["kind"] == "silhouette" else None
    # The line along the edge: the panel's own line map within 3 px of the edge, its width at each skeleton pixel.
    radius = lm.FINE_TOPHAT_PT / k
    tau, _ = lm.plateau_tau(rgb, np.ones(sil.shape, bool))
    near = np.zeros(field.shape, bool)
    for run in runs:
        near[np.clip(np.round(run[:, 0]).astype(int), 0, field.shape[0] - 1), np.clip(np.round(run[:, 1]).astype(int), 0, field.shape[1] - 1)] = True
    near = ndimage.binary_dilation(near, lm.disk(3))
    lines = lm.line_map(rgb, tau, near, radius=radius)
    box = np.full(field.shape, -1)
    box[y0:y1, x0:x1] = 0
    sole = edge["class"] == "sole"
    stats = lm.width_stats(lines, box, [f"x|{lm.GROUND}" if sole else "x|edge"], 1 / k).get(f"x|{lm.GROUND}" if sole else "x|edge", {})
    return {**edge, "ptPerPx": lm.r(k, 4), "fur": above(raw, floor), "furRaw": raw, "staircase": floor,
            "widthPt": stats.get("widthMedianPt"), "widthCv": stats.get("widthCv"), "soleMiddlePt": stats.get("soleMiddlePt"),
            "runs": runs, "pieces": pieces, "skeleton": np.argwhere(lines["skeleton"])}


def staircase(runs, field, k, sub=8, depth_px=10):
    """The fur a smooth edge reads at a panel's pixels: each run smoothed over FUR_SIGMA_PT along itself, filled to
    depth_px inside as a cut-out is (rasterized by area, then binary), and read as panel_edge reads the panel. Returns
    fur_stats over the runs' middles, away from where the fill ends."""
    from PIL import ImageDraw
    pieces = []
    for run in runs:
        if len(run) * k < 3 * lm.FUR_SIGMA_PT:
            continue
        line = lm.resample(np.asarray(run, np.float64), 0.25)
        line = np.stack([ndimage.gaussian_filter1d(line[:, i], lm.FUR_SIGMA_PT / k / 0.25, mode="nearest") for i in (0, 1)], 1)
        tangent = np.gradient(line, axis=0)
        tangent /= np.maximum(np.hypot(*tangent.T), 1e-9)[:, None]
        normal = np.stack([-tangent[:, 1], tangent[:, 0]], 1)
        mid = line[len(line) // 2]
        probe = [ndimage.map_coordinates(field, [[mid[0] + sign * 2 * normal[len(line) // 2, 0]], [mid[1] + sign * 2 * normal[len(line) // 2, 1]]], order=1)[0] for sign in (1, -1)]
        if probe[1] > probe[0]:
            normal = -normal  # inward: toward the cut-out
        outline = np.concatenate([line, (line + normal * depth_px)[::-1]])
        h, w = field.shape
        image = Image.new("L", (w * sub, h * sub), 0)
        ImageDraw.Draw(image).polygon([(x * sub, y * sub) for y, x in outline], fill=255)
        cut = np.asarray(image, np.float64).reshape(h, sub, w, sub).mean(axis=(1, 3)) >= 127.5
        steps = np.r_[0, np.cumsum(np.hypot(*np.diff(line, axis=0).T))]
        trim = lm.FUR_SIGMA_PT / k
        middle = line[(steps > trim) & (steps < steps[-1] - trim)]
        if len(middle) < 4:
            continue
        from scipy.spatial import cKDTree
        tree = cKDTree(middle)
        smooth = ndimage.gaussian_filter(cut.astype(np.float64), 0.6)
        for piece in lm.contour_runs(smooth, lambda c: tree.query(c)[0] < 1.5):
            pieces.append(np.stack([piece[:, 1] * k, piece[:, 0] * k], 1))
    return lm.fur_stats(pieces)


def above(raw, floor):
    """A panel edge's fur above its staircase: the RMS less the staircase's in quadrature, the crossings less the
    staircase's (neither under 0)."""
    if raw is None or floor is None:
        return raw
    return {"rmsPt": lm.r(np.sqrt(max(raw["rmsPt"] ** 2 - floor["rmsPt"] ** 2, 0.0))),
            "crossings10Pt": lm.r(max(raw["crossings10Pt"] - floor["crossings10Pt"], 0.0)), "lengthPt": raw["lengthPt"]}


def panels(species="dog", evidence=None):
    """Each class's sheet width (the widest the hero draws; the render is held to it at the hero's scale, so both
    are blurred alike by their pixels), its width's variation (the evenest the hero draws), a sole's middle width (the
    widest) and its fur (the gentlest any source draws above its staircase)."""
    scales = {HERO: hero_scale(species)}
    for name, chord in SCALE_CHORDS.items():
        scales[name] = scales[HERO] * chord["heroPx"] / chord["panelPx"]
    measured = [panel_edge(e, scales.get(e["panel"]), species) for e in PANEL_EDGES]
    width, cv, middle, fur = {}, {}, {}, {}
    for m in measured:
        if m["panel"] != HERO:
            continue
        if m["widthPt"] is not None:
            width[m["class"]] = max(width.get(m["class"], 0), m["widthPt"])
        if m["widthCv"] is not None:
            cv[m["class"]] = min(cv.get(m["class"], np.inf), m["widthCv"])
        if m["soleMiddlePt"] is not None:
            middle[m["class"]] = max(middle.get(m["class"], 0), m["soleMiddlePt"])
    # A class's fur on one panel is all its edges there taken together (a single paw's sole is too short to read
    # alone), above their staircase; across panels, the gentlest.
    for c in dict.fromkeys(m["class"] for m in measured):
        for panel in dict.fromkeys(m["panel"] for m in measured if m["class"] == c):
            mine = [m for m in measured if m["class"] == c and m["panel"] == panel]
            pooled = lm.fur_stats([p for m in mine for p in m["pieces"]])
            stairs = [m["staircase"] for m in mine if m["staircase"]]
            floor = {key: float(np.mean([f[key] for f in stairs])) for key in ("rmsPt", "crossings10Pt")} if stairs else None
            pooled = above(pooled, floor) if floor else pooled
            if pooled:
                fur[c] = {key: min(pooled[key], fur.get(c, pooled)[key]) for key in ("rmsPt", "crossings10Pt")}
    if evidence:
        panel_picture(measured, Path(evidence) / "panels.png", species)
    sources = [{k: m[k] for k in ("panel", "class", "kind", "box", "note", "ptPerPx", "fur", "furRaw", "staircase", "widthPt", "widthCv", "soleMiddlePt")}
               for m in measured]
    return {"widthPt": width, "widthCv": {c: lm.r(v) for c, v in cv.items()}, "soleMiddlePt": middle, "widthPpp": lm.r(1 / scales[HERO], 4),
            "fur": fur, "sources": sources, "scales": {k: lm.r(v, 4) for k, v in scales.items()}, "scaleChords": SCALE_CHORDS}


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


def calibrate_view(args):
    """One view's thresholds from its perturbed copies, and its regions as the build drew them."""
    species, stills, view, crops, folder = args
    scene = lm.Scene(species, Path(stills) / view, {"crops": crops})
    results = perturbed_rows(scene)
    h, w = scene.frame.sil.shape
    hosts = scene.hosts[scene.grid.top:scene.grid.top + h, scene.grid.left:scene.grid.left + w]
    names = sorted(set(hosts.ravel()))
    if len(names) > 255:
        raise ValueError("more than 255 hosts")
    sheets.save_png(Path(folder) / f"{view}.png", np.array([names.index(v) for v in hosts.ravel()], np.uint8).reshape(hosts.shape))
    again = [results[i] for i in CHECKED]
    return view, {"crop": scene.frame.source, "kPt": lm.r(scene.grid.k, 5), "hosts": names, "hostsMap": match.repo_path(Path(folder) / f"{view}.png"),
                  "regions": thresholds(results, scene.grid.k),
                  # each region's score under the perturbations "checked" names, which the tests measure again
                  "checkedScores": {n: {m: [rows.get(n, {}).get(m) for _, rows in again] for m in GRID_MEASURES}
                                    for n in sorted({n for _, rows in again for n in rows})}}


def calibrate(species, stills, out, evidence=None, workers=4):
    from multiprocessing import Pool
    model = json.loads((sheets.ROOT / "characters" / species / "model.json").read_text())
    folder = out.parent / species
    folder.mkdir(parents=True, exist_ok=True)
    crops = {}
    for view in views_of(model):
        scene = lm.Scene(species, Path(stills) / view, {"crops": crops})
        if scene.frame.source not in crops:
            tau, curve = lm.plateau_tau(scene.crop, scene.keep)
            crops[scene.frame.source] = {"tau": tau, "skeletonPxByTau": curve}
    jobs = [(species, str(stills), view, crops, str(folder)) for view in views_of(model)]
    with Pool(workers) as pool:
        views = dict(pool.map(calibrate_view, jobs))
    for view, rec in views.items():
        print(f"linecal: {view}: tau {crops[rec['crop']]['tau']}, {len(rec['regions'])} regions", flush=True)
    result = {"species": species, "note": "linecal.py's output: every threshold linematch.py holds, measured on the sheet (docs/phase3-fur-plan.md, C)",
              "regionsFrom": match.repo_path(stills), "margin": lm.MARGIN, "resolutionPt": lm.RESOLUTION_PT,
              "tail": {"draws": TAIL_DRAWS, "share": TAIL_SHARE, "least": TAIL_MIN},
              "perturbations": [label(spec) for spec in PERTURBATIONS], "checked": [label(PERTURBATIONS[i]) for i in CHECKED],
              "crops": crops, "panels": panels(species, evidence), "crisp": crisp(), "views": {v: views[v] for v in views_of(model)}}
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
