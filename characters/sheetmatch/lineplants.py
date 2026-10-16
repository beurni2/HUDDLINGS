"""Planted faults for the line check (docs/phase3-fur-plan.md, D): each fault the
plan names, planted where it belongs, must fail in its own region with every
other region's verdict unchanged.

Faults measured on the crop's grid are planted in the sheet's own still
(linecal.sheet_still), which passes every region of it: the fault is painted
into the crop at the crop's own resolution, in the crop's (left-facing) frame.
Faults only the render's own scale can show (an edge's softness, its fur) are
planted in a render's still (a build's, look's stills), at its own ppp, in a
region that passes today. Each plant returns what it changed, so the evidence
can name it. The taper (plan 2) is on every span, so it must fail in every
region a joint falls in; the pale contact line (plan 11) is also planted on
every contact edge of the right-facing views whose line the sheet draws.
Used by test_linematch.py; nothing here ships.

    python3 characters/sheetmatch/lineplants.py dog --out <dir> [--stills <build stills>]

plants every fault (the render's only with --stills), checks it and writes
<dir>/<crop|render>-<key>.png (before | after, with what failed) and
<dir>/plants.json. Exits 0 when each fails in its own regions only."""
import argparse
import json
import shutil
import sys
import tempfile
import traceback
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage
from skimage import morphology

import linecal
import linematch as lm
import match

sheets = match.sheets
TONE_10 = (0x81, 0x57, 0x3A)  # the darkest line tone (parts/lines.ts's soleLine; DECISIONS 30)
CREAM = (0xFF, 0xF5, 0xE6)  # the printed fur (model.json palette.fur)
TAN = (0xD9, 0xA3, 0x79)  # the printed marking tan
# pt a render plant keeps from the parts it does not plant in: a region's band and the shift it may match by
# (BAND_PX + SHIFT_PX crop px, at about 0.78 pt each)
CLEAR_PT = 4.0
PALE_CLEAR_PX = 2  # crop px past the other boundaries' bands a pale contact line is planted: their ink reads 4 px across


def sheet_scene(species, view, calibration, parts, folder):
    """The line check's scene of the sheet's still made from parts (written to folder)."""
    linecal.sheet_still(species, view, folder, calibration, parts)
    return lm.Scene(species, folder, calibration, shift=(0, 0))


def crop_frame(scene):
    """Grid pixels (rows, cols) to the crop's own pixels."""
    return np.array([scene.grid.top, scene.grid.left])


def region_skeleton(scene, sheet, region):
    """The sheet's skeleton pixels in a region, in crop px (rows, cols), ordered along the line from one end."""
    pts = np.argwhere(sheet["skeleton"] & (scene.band == scene.names.index(region))) - crop_frame(scene)
    return order(pts)


def order(pts):
    """Skeleton pixels ordered by walking from an end (the pixel farthest from the centroid) to its nearest unvisited
    neighbour each step: good enough for a run along one line."""
    if len(pts) < 2:
        return pts
    left = list(range(len(pts)))
    start = int(np.argmax(((pts - pts.mean(0)) ** 2).sum(1)))
    path = [start]
    left.remove(start)
    while left:
        d = ((pts[left] - pts[path[-1]]) ** 2).sum(1)
        path.append(left.pop(int(np.argmin(d))))
    return pts[path]


def run_of(pts, length_px, at=0.5):
    """A run of length_px along ordered pixels, centred at a fraction of the way along."""
    steps = np.r_[0, np.cumsum(np.hypot(*np.diff(pts, axis=0).T))]
    centre = at * steps[-1]
    near = np.abs(steps - centre) <= length_px / 2
    return pts[near] if near.any() else pts[[int(np.argmin(np.abs(steps - centre)))]]


def erase(rgb, where, grow=2):
    """The crop with the lines at where (a mask) painted out from the colours round them (OpenCV's Telea inpaint),
    as a fill drawn with no line there would look."""
    mask = ndimage.binary_dilation(where, lm.disk(grow)).astype(np.uint8) * 255
    return cv2.inpaint(np.ascontiguousarray(rgb), mask, 3, cv2.INPAINT_TELEA)


def mask_of(shape, pts):
    m = np.zeros(shape, bool)
    m[tuple(np.clip(pts, 0, np.array(shape) - 1).T.astype(int))] = True
    return m


def draw_line(rgb, pts, width_px, colour, soft=0.5):
    """A line of width_px through ordered points, in colour, its edge anti-aliased over soft px."""
    h, w = rgb.shape[:2]
    yy, xx = np.mgrid[:h, :w]
    near = np.full((h, w), np.inf)
    for (y0, x0), (y1, x1) in zip(pts[:-1], pts[1:]):
        d = np.array([y1 - y0, x1 - x0], float)
        n = max(np.hypot(*d), 1e-9)
        t = np.clip(((yy - y0) * d[0] + (xx - x0) * d[1]) / n ** 2, 0, 1)
        near = np.minimum(near, np.hypot(yy - (y0 + t * d[0]), xx - (x0 + t * d[1])))
    if len(pts) == 1:
        near = np.hypot(yy - pts[0][0], xx - pts[0][1])
    a = np.clip((width_px / 2 + soft - near) / (2 * soft), 0, 1)[..., None]
    return np.clip(np.round(rgb * (1 - a) + np.array(colour) * a), 0, 255).astype(np.uint8)


def crop_of(scene, grid_array):
    """A grid-sized array cut to the crop's own pixels."""
    h, w = scene.frame.sil.shape
    return grid_array[scene.grid.top:scene.grid.top + h, scene.grid.left:scene.grid.left + w]


def clear_of(scene, *regions, margin=lm.SHIFT_PX):
    """Crop pixels far enough from every other region's boundary that a fault painted there stays in its own regions:
    beyond another's band, and by default beyond the shift a region's lines may be moved by to match."""
    keep = [scene.names.index(n) for n in regions]
    others = (scene.boundary >= 0) & ~np.isin(scene.boundary, keep)
    return crop_of(scene, ndimage.distance_transform_edt(~others) > lm.BAND_PX + margin)


def longest_component(pts, shape):
    """The pixels of the longest connected run among pts."""
    m = mask_of(shape, pts)
    labels, count = ndimage.label(m, structure=np.ones((3, 3)))
    if not count:
        return pts[:0]
    sizes = ndimage.sum(m, labels, range(1, count + 1))
    return np.argwhere(labels == int(np.argmax(sizes)) + 1)


def inward(scene, region, pts):
    """At each crop pixel of a region's line, the unit direction (rows, cols) into the region's first part."""
    field = ndimage.gaussian_filter((crop_of(scene, scene.hosts) == region.split("|")[0]).astype(float), 2)
    gy, gx = np.gradient(field)
    out = np.stack([gy[tuple(pts.T)], gx[tuple(pts.T)]], axis=1)
    return out / np.maximum(np.hypot(*out.T), 1e-9)[:, None]


def line_of(scene, sheet, region):
    """The sheet's longest line in a region, ordered, in crop px."""
    return order(longest_component(region_skeleton(scene, sheet, region), scene.frame.sil.shape))


# Each crop plant takes the sheet's parts (rgb, hosts, cover), the base scene and the sheet's line map, and returns
# the new parts and what it painted (a crop-sized mask).

def cheek_gap(parts, scene, sheet, region="ear.R|head.base", pt=4.0):
    """pt of a region's line deleted, its fill painted on across."""
    rgb, hosts, cover = parts
    run = run_of(line_of(scene, sheet, region), pt / scene.grid.k)
    where = ndimage.binary_dilation(mask_of(rgb.shape[:2], run), lm.disk(1.5)) & ndimage.binary_dilation(crop_of(scene, sheet["lines"]), lm.disk(1))
    return (erase(rgb, where, 1), hosts, cover), where


def taper_joints(scene, sheet, every_pt=12.0, taper_pt=4.0):
    """Where tapers fall when every edge's line is cut into spans every_pt long, each fading to nothing over taper_pt
    at both ends: each skeleton pixel's fade (a crop-sized weight, 1 at a joint), and the joints in each region."""
    h, w = scene.frame.sil.shape
    skeleton, band = crop_of(scene, sheet["skeleton"]), crop_of(scene, scene.band)
    weight, joints = np.zeros((h, w)), {}
    for index, name in enumerate(scene.names):
        if "|" not in name:
            continue
        labels, count = ndimage.label(skeleton & (band == index), structure=np.ones((3, 3)))
        for c in range(1, count + 1):
            run = order(np.argwhere(labels == c))
            steps = np.r_[0, np.cumsum(np.hypot(*np.diff(run, axis=0).T))] * scene.grid.k
            for joint in np.arange(every_pt, steps[-1], every_pt):
                joints[name] = joints.get(name, 0) + 1
                near = np.abs(steps - joint) <= taper_pt
                for (y, x), at in zip(run[near], steps[near]):
                    weight[y, x] = max(weight[y, x], 1 - abs(at - joint) / taper_pt)
    return weight, joints


def tapers(parts, scene, sheet, every_pt=12.0, taper_pt=4.0):
    """Every edge's line cut into spans every_pt long, each fading to nothing over taper_pt at both ends: under
    full width for 2 taper_pt (8 pt) at every joint, as parts/lines.ts drew its spans before the fix."""
    rgb, hosts, cover = parts
    lines = crop_of(scene, sheet["lines"])
    clean = erase(rgb, lines, 1).astype(float)
    weight, _ = taper_joints(scene, sheet, every_pt, taper_pt)
    # Each skeleton pixel's fade carried across its line's width.
    weight = ndimage.grey_dilation(weight, footprint=lm.disk(2)) * ndimage.binary_dilation(lines, lm.disk(1))
    out = rgb * (1 - weight[..., None]) + clean * weight[..., None]
    return (np.clip(np.round(out), 0, 255).astype(np.uint8), hosts, cover), weight > 0.5


def claw_ticks(parts, scene, sheet, region="front.L|ground", pt=3.0, count=3):
    """count dark ticks pt long standing up from a sole, in the darkest line tone."""
    rgb, hosts, cover = parts
    sole = line_of(scene, sheet, region)
    out, painted = rgb, np.zeros(rgb.shape[:2], bool)
    for at in np.linspace(0.3, 0.7, count):
        base = run_of(sole, 1, at)[:1].astype(float)
        d = inward(scene, region, base.astype(int))[0]
        tick = np.array([base[0] + d * t for t in np.linspace(0, pt / scene.grid.k, 6)])
        out = draw_line(out, tick, 1.0 / scene.grid.k, TONE_10)
        painted |= mask_of(rgb.shape[:2], np.round(tick))
    return (out, hosts, cover), painted


def uniform_paw(parts, scene, sheet, region="front.L|ground", pt=1.75):
    """A sole's line redrawn pt wide and even, in the darkest line tone, along the sheet's own line."""
    rgb, hosts, cover = parts
    sole = line_of(scene, sheet, region)
    where = ndimage.binary_dilation(mask_of(rgb.shape[:2], sole), lm.disk(2)) & ndimage.binary_dilation(crop_of(scene, sheet["lines"]), lm.disk(1))
    return (draw_line(erase(rgb, where, 1), sole, pt / scene.grid.k, TONE_10), hosts, cover), where


def tan_stripe(parts, scene, sheet, pt=2.0):
    """A hard-edged tan stripe pt wide down the middle between the front legs, from under the chest to the ground,
    where it is clear of the legs' edges."""
    rgb, hosts, cover = parts
    clear = clear_of(scene, "body.front", margin=0)
    crop_hosts = crop_of(scene, scene.hosts)
    legs = [np.argwhere(crop_hosts == f"front.{s}") for s in ("L", "R")]
    rows = np.arange(max(int(leg[:, 0].min()) for leg in legs) + 4, min(int(leg[:, 0].max()) for leg in legs) - 2)
    out, painted = rgb.copy(), np.zeros(rgb.shape[:2], bool)
    half = pt / scene.grid.k / 2
    for y in rows:
        inner = [leg[leg[:, 0] == y, 1] for leg in legs]
        if not all(len(i) for i in inner):
            continue
        x = (inner[0].min() + inner[1].max()) / 2 if inner[0].mean() > inner[1].mean() else (inner[0].max() + inner[1].min()) / 2
        cols = np.arange(int(np.floor(x - half)), int(np.ceil(x + half)) + 1)
        cols = cols[(np.abs(cols - x) <= half + 0.5) & clear[y, cols] & (crop_hosts[y, cols] == "body.front")]
        out[y, cols] = TAN
        painted[y, cols] = True
    return (out, hosts, cover), painted


def cream_band(parts, scene, sheet, region="body.back|front.R", pt=0.8):
    """A cream band pt wide on the first part's side of a boundary's line, between its colour and the line, where it
    is clear of the other boundaries it runs into."""
    rgb, hosts, cover = parts
    a = region.split("|")[0]
    crop_hosts, lines = crop_of(scene, scene.hosts), crop_of(scene, sheet["lines"])
    edge = crop_of(scene, scene.boundary) == scene.names.index(region)
    band = (ndimage.binary_dilation(edge, lm.disk(3)) & (crop_hosts == a) & ~lines & clear_of(scene, region)
            & (ndimage.distance_transform_edt(~lines) <= max(1.0, pt / scene.grid.k)))
    out = rgb.copy()
    out[band] = CREAM
    return (out, hosts, cover), band


def chin_gone(parts, scene, sheet, region="head.base|outside", reach_pt=12.0):
    """The chin's line removed where it runs down to the collar: in profile, where the sheet draws it crisp and dark
    (the front crop shows no chin line apart from the collar's own blue edge), every line pixel of the head's outline
    within reach_pt of the collar's front end."""
    rgb, hosts, cover = parts
    marks = scene.frame.model["landmarks"][scene.frame.source]
    x, y = scene.grid.to_index(marks["collar.line.sheetLeft"])
    yy, xx = np.mgrid[:scene.band.shape[0], :scene.band.shape[1]]
    near = np.hypot(xx - x, yy - y) <= reach_pt / scene.grid.k
    lines = crop_of(scene, sheet["faint"] & near & (scene.band == scene.names.index(region)))
    return (erase(rgb, lines, 1), hosts, cover), lines


def pale_contact(parts, scene, sheet, region="body.back|tail", share=0.6, margin=PALE_CLEAR_PX):
    """A contact line drawn pale, as the line-by-light rule paints the haunch over the tail in side.R: each of its
    pixels share of the way to the cream, where it is clear of the other boundaries' bands by margin px (so a
    neighbour keeps its ink: its ink is read up to 4 px across its own line)."""
    rgb, hosts, cover = parts
    lines = (ndimage.binary_dilation(crop_of(scene, sheet["lines"]), lm.disk(1)) & (crop_of(scene, scene.band) == scene.names.index(region))
             & clear_of(scene, region, margin=margin))
    out = rgb.astype(float)
    out[lines] = out[lines] * (1 - share) + np.array(CREAM) * share
    return (np.clip(np.round(out), 0, 255).astype(np.uint8), hosts, cover), lines


def loose_tick(parts, scene, sheet, region="tuft|outside", pt=1.0, off_pt=2.0):
    """A dark tick pt long and 1.5 pt wide, off_pt outside the crown's line, on the card."""
    rgb, hosts, cover = parts
    base = run_of(line_of(scene, sheet, region), 1, 0.3)[:1]
    d = -inward(scene, region, base)[0]
    centre = base[0] + d * off_pt / scene.grid.k
    tangent = np.array([d[1], -d[0]])
    tick = np.array([centre - tangent * pt / scene.grid.k / 2, centre + tangent * pt / scene.grid.k / 2])
    return (draw_line(rgb, tick, 1.5 / scene.grid.k, TONE_10), hosts, cover), mask_of(rgb.shape[:2], np.round(tick))


def contact_lines(scene, sheet, margin=PALE_CLEAR_PX, least=lm.MIN_TONE_PX):
    """The contact edges (one part over another) where the sheet draws a stretch of its own line, clear of the other
    boundaries' bands by margin px, of at least least skeleton pixels in a row (a window's worth): the edges a pale
    contact line can be planted on and its tone read."""
    skeleton, band = crop_of(scene, sheet["skeleton"]), crop_of(scene, scene.band)
    out = []
    for name in scene.contact:
        stretch = skeleton & (band == scene.names.index(name)) & clear_of(scene, name, margin=margin)
        if len(longest_component(np.argwhere(stretch), stretch.shape)) >= least:
            out.append(name)
    return sorted(out)


def erased_segment(parts, scene, sheet, region="ear.L|outside", pt=6.0):
    """The sheet's own plant: one line segment erased."""
    return cheek_gap(parts, scene, sheet, region, pt)


def blurred_region(parts, scene, sheet, region="tail|outside", sigma_px=2.0):
    """The sheet's own plant: one region blurred, at twice the softest the calibration counts as noise (its blur of
    0.5 px after a down-up by 2, about 1 px): a softer blur is one of the sheet's own perturbed copies."""
    rgb, hosts, cover = parts
    inside = crop_of(scene, scene.band) == scene.names.index(region)
    soft = np.stack([ndimage.gaussian_filter(rgb[..., i].astype(float), sigma_px) for i in range(3)], -1)
    out = rgb.astype(float)
    out[inside] = soft[inside]
    return (np.clip(np.round(out), 0, 255).astype(np.uint8), hosts, cover), inside


JOINTS = "joints"  # the taper's regions: every region with a joint in it (taper_joints), each of which must fail
# (key, the plan's words, view, the region or regions it must fail in, the plant)
CROP_PLANTS = (
    ("1", "4 pt of the cheek-over-ear line deleted", "front", "ear.R|head.base", cheek_gap),
    ("2", "8 pt tapers at every span's joint, a span every 12 pt", "front", JOINTS, tapers),
    ("6", "three dark 3 pt claw ticks on a sole (standing into the paw)", "front", ("front.L|ground", "front.L"), claw_ticks),
    ("7", "a uniform 1.75 pt tone-10 line along a paw's sole", "front", "front.L|ground", uniform_paw),
    ("8", "a hard-edged tan stripe between the front legs", "front", "body.front", tan_stripe),
    ("9", "a 0.8 pt cream band along the haunch/leg boundary", "front", "body.back|front.R", cream_band),
    ("10", "the chin's line removed where it runs to the collar (in profile)", "side.L", ("collar|head.base", "head.base|outside"), chin_gone),
    ("11", "side.R's haunch-over-tail line turned pale", "side.R", "body.back|tail", pale_contact),
    ("12", "a detached 1 pt tick beside the crown line", "front", "tuft|outside", loose_tick),
    ("sheet-a", "the sheet's own: 6 pt of an ear's outline erased", "side.L", "ear.L|outside", erased_segment),
    ("sheet-b", "the sheet's own: the tail's edge blurred (2 px)", "side.L", "tail|outside", blurred_region),
)


def plant_crop(species, key, calibration_path, folder):
    """One crop plant in the sheet's own still: (the base result, the planted result, the painted mask, the plant's
    entry, the planted check's picture parts). Both are checked on the crop's grid only (fine=False)."""
    entry = next(p for p in CROP_PLANTS if p[0] == key)
    _, _, view, region, plant = entry
    calibration = json.loads(Path(calibration_path).read_text())
    parts = linecal.sheet_parts(species, view, calibration)
    base_scene = sheet_scene(species, view, calibration, parts, Path(folder) / "base")
    planted, painted = plant(parts, base_scene, base_scene.sheet_map())
    linecal.sheet_still(species, view, Path(folder) / "planted", calibration, planted)
    base, _ = lm.check(species, Path(folder) / "base", calibration_path, shift=(0, 0), fine=False)
    after, pieces = lm.check(species, Path(folder) / "planted", calibration_path, shift=(0, 0), fine=False)
    return base, after, painted, entry, pieces


class SheetJudge:
    """The sheet's own still in one view, made once, and any crop plant judged on it without writing a still: the
    planted crop laid on the grid is what the planted still reads back as, pixel for pixel (linecal.sheet_still)."""

    def __init__(self, species, view, calibration, folder):
        self.species, self.view, self.calibration = species, view, calibration
        self.parts = linecal.sheet_parts(species, view, calibration)
        self.scene = sheet_scene(species, view, calibration, self.parts, Path(folder))
        self.sheet = self.scene.sheet_map()

    def judge(self, rgb=None):
        """{region: verdict} for the crop (the sheet's own, or a planted one's rgb, in the crop's own frame)."""
        scene = self.scene
        image = scene.crop.copy()
        if rgb is not None:
            # The crop's own frame is the grid's (a .R facing is measured in its .L crop's frame).
            h, w = scene.frame.sil.shape
            image[scene.grid.top:scene.grid.top + h, scene.grid.left:scene.grid.left + w] = rgb
        rows = lm.compare(scene, self.sheet, scene.ours_map(image))
        return lm.judge(scene, rows, {}, self.calibration)

    def plant(self, plant, **options):
        """A crop plant's verdicts and what it painted."""
        (rgb, _, _), painted = plant(self.parts, self.scene, self.sheet, **options)
        return self.judge(rgb), painted


class RenderStill:
    """A render's still (still.ts's folder) opened to plant a fault at its own scale: its alpha, premultiplied colour
    and ID pass, each part's host, written back as still.ts writes them."""

    def __init__(self, folder):
        self.folder = Path(folder)
        self.meta = json.loads((self.folder / "still.json").read_text())
        still = match.Still.load(self.folder)
        self.alpha, self.premult, self.part = still.alpha.copy(), still.premult.copy(), still.part.copy()
        self.ids = np.asarray(Image.open(self.folder / "ids.png").convert("RGB")).copy()
        self.names = list(self.meta["parts"])
        self.ppp = float(self.meta["ppp"])
        hosts = [lm.host(n, self.meta["parts"]) for n in self.names]
        self.host = np.array(hosts + [lm.OUTSIDE])[self.part]

    def footprint(self, host):
        return self.host == host

    def paint_id(self, mask, part):
        """Pixels drawn as part in the ID pass (part None: as nothing, the background)."""
        colour = np.zeros(3, np.uint8) if part is None else sheets.hex_to_rgb(self.meta["parts"][part]["id"])
        self.ids[mask] = colour
        self.part[mask] = -1 if part is None else self.names.index(part)

    def write(self, out):
        out = Path(out)
        if out.exists():
            shutil.rmtree(out)
        out.mkdir(parents=True)
        a = self.alpha[..., None]
        white = np.clip(np.round((self.premult + (1 - a)) * 255), 0, 255).astype(np.uint8)
        black = np.clip(np.round(self.premult * 255), 0, 255).astype(np.uint8)
        for name, image in (("white.png", white), ("black.png", black), ("ids.png", self.ids)):
            sheets.save_png(out / name, image)
        sheets.write_json(out / "still.json", self.meta)
        return out


def edge_of(mask, against):
    """The pixels of a mask on its boundary with another mask (4-neighbours)."""
    grown = ndimage.binary_dilation(against)
    return mask & grown


def soft_edge(still, host="ear.R", sigma_pt=0.6, reach_pt=2.0):
    """An outer edge drawn soft, as head.line was before the fix but twice as soft: the alpha and colour within
    reach_pt of a part's edge on the card blurred at sigma_pt."""
    foot = still.footprint(host)
    others = ~np.isin(still.host, [host, lm.OUTSIDE])
    edge = edge_of(foot, still.host == lm.OUTSIDE) & (ndimage.distance_transform_edt(~others) > CLEAR_PT * still.ppp)
    near = ndimage.distance_transform_edt(~edge) <= reach_pt * still.ppp
    s = sigma_pt * still.ppp
    a = ndimage.gaussian_filter(still.alpha, s)
    p = np.stack([ndimage.gaussian_filter(still.premult[..., i], s) for i in range(3)], -1)
    still.alpha[near], still.premult[near] = a[near], p[near]
    return near


def move_outline(still, host, new_foot, over=(lm.OUTSIDE,)):
    """A part's outline moved to new_foot's edge where it lies on the card (or the hosts over), as the part draws it
    elsewhere: the new edge given the part's line (its tone nearest on the old edge) and what lies inside it the
    part's fill (its tone nearest just inside the old line), the old line now inside
    painted over, and what it gave up shown as what lies nearest beyond it, the ID pass with them. No other part's
    pixels change, so no other part's edge moves."""
    foot = still.footprint(host)
    beyond = np.isin(still.host, over)
    new_foot = new_foot & (foot | beyond)
    added, removed = new_foot & ~foot, foot & ~new_foot
    colour = still.premult / np.maximum(still.alpha, 1e-6)[..., None]
    solid = foot & (still.alpha > 0.95)
    rim = ndimage.distance_transform_edt(~edge_of(foot, beyond))
    lum = colour.mean(axis=2)
    dark, light = np.median(lum[solid & (rim < 1)]), np.median(lum[solid & (rim >= 3 * still.ppp) & (rim < 5 * still.ppp)])
    # the line runs in until the tone is halfway to the fill
    reach = next((d for d in np.arange(1, 4 * still.ppp) if np.median(lum[solid & (np.abs(rim - d) < 0.5)]) > (dark + light) / 2), still.ppp)
    line_px, fill_px = solid & (rim >= 1) & (rim < 0.75 * reach), solid & (rim > reach + 1) & (rim <= reach + 3)  # the line's core
    _, line_at = ndimage.distance_transform_edt(~line_px, return_indices=True)
    _, fill_at = ndimage.distance_transform_edt(~fill_px, return_indices=True)
    tones = {}
    for name, mask in (("line", line_px), ("fill", fill_px)):
        # each tone as it runs along the edge, averaged over 2 pt so one pixel's antialiasing does not streak
        weight = ndimage.gaussian_filter(mask.astype(np.float64), 2 * still.ppp)
        tones[name] = np.stack([ndimage.gaussian_filter(colour[..., i] * mask, 2 * still.ppp) for i in range(3)], -1) / np.maximum(weight, 1e-9)[..., None]
    near = ndimage.binary_dilation(added | removed, lm.disk(int(round(2 * reach + 2))))
    depth = ndimage.distance_transform_edt(new_foot)
    on_line = near & new_foot & (depth <= reach + 1)
    filled = near & new_foot & ~on_line & (added | (rim < reach + 1))
    # what lies beyond, read clear of the old edge's antialiased fringe (whose IDs are already beyond's)
    clean = beyond & (ndimage.distance_transform_edt(~foot) > 2)
    _, past_at = ndimage.distance_transform_edt(~clean, return_indices=True)
    under, below = still.alpha[past_at[0], past_at[1]], colour[past_at[0], past_at[1]]
    top = colour.copy()
    for mask, at, tone in ((on_line | (near & ~new_foot), line_at, tones["line"]), (filled, fill_at, tones["fill"])):
        top[mask] = tone[at[0][mask], at[1][mask]]
    # the line's inner edge soft over two pixels round reach, as the part's own line fades into its fill
    fade = np.clip((depth - reach + 1) / 2, 0, 1)[..., None]
    inner = on_line[..., None]
    top = np.where(inner, top * (1 - fade) + tones["fill"][fill_at[0], fill_at[1]] * fade, top)
    cover = np.where(depth > 1, 1.0, ndimage.gaussian_filter(new_foot.astype(np.float64), 0.5))  # the antialiasing
    write = near & (on_line | filled | (~new_foot & (beyond | foot)))
    alpha = cover + (1 - cover) * under  # the part over what lies beyond it, composited as the renderer does
    premult = cover[..., None] * top + ((1 - cover) * under)[..., None] * below
    still.alpha[write], still.premult[write] = alpha[write], premult[write]
    for layer in (still.ids, still.part, still.host):
        layer[removed] = layer[past_at[0][removed], past_at[1][removed]]
    still.paint_id(added, host)
    still.host[added] = host
    return write & ((cover > 0) | removed)


def hull_edge(still, host="ear.R", smooth_pt=1.0, clear_pt=CLEAR_PT):
    """A part's outer edge replaced by its smoothed hull: its notches and steps bridged by the convex hull of its
    footprint, the hull's corners rounded at smooth_pt, and the fill and line moved out to it; clear of the other
    parts by clear_pt so their bands stay where they are."""
    foot = still.footprint(host)
    hull = morphology.convex_hull_image(foot)
    hull = ndimage.gaussian_filter(hull.astype(np.float64), smooth_pt * still.ppp) > 0.5
    others = ~np.isin(still.host, [host, lm.OUTSIDE])
    clear = ndimage.distance_transform_edt(~others) > clear_pt * still.ppp
    return move_outline(still, host, foot | (hull & clear))


def flat_sole(still, host="front.R", corner_pt=4.0):
    """A paw's sole flattened: its round underside filled out to a flat line along its lowest row, as wide as the
    paw is corner_pt above it, with corners of corner_pt, its line and fill moved to the new edge."""
    foot = still.footprint(host)
    bottom = np.nonzero(foot)[0].max()
    r = int(round(corner_pt * still.ppp))
    xs = np.nonzero(foot[bottom - r])[0]
    x0, x1 = xs.min(), xs.max()
    yy, xx = np.mgrid[:foot.shape[0], :foot.shape[1]]
    box = (yy >= bottom - r) & (yy <= bottom) & (xx >= x0) & (xx <= x1)
    for cx in (x0 + r, x1 - r):
        side = (xx < cx) if cx == x0 + r else (xx > cx)
        box &= ~(side & (yy > bottom - r) & (np.hypot(yy - (bottom - r), xx - cx) > r))
    return move_outline(still, host, foot | box, over=(lm.OUTSIDE, lm.GROUND))


def heavy_line(still, host="front.R", pt=1.75, height_pt=8.0):
    """A uniform pt line in the darkest tone all round a paw's lower height_pt (its sole and sides on the ground and
    card), drawn into the colour and the alpha; it stops CLEAR_PT short of the other parts, so their bands keep their
    ink."""
    foot = still.footprint(host)
    rows = np.nonzero(foot)[0]
    low = np.arange(foot.shape[0])[:, None] >= rows.max() - height_pt * still.ppp
    others = ~np.isin(still.host, [host, lm.OUTSIDE, lm.GROUND])
    clear = ndimage.distance_transform_edt(~others) > CLEAR_PT * still.ppp
    edge = edge_of(foot, np.isin(still.host, [lm.OUTSIDE, lm.GROUND])) & low & clear
    d = ndimage.distance_transform_edt(~edge)
    a = np.clip(pt * still.ppp / 2 + 0.5 - d, 0, 1)
    tone = np.array(TONE_10) / 255
    still.premult = still.premult * (1 - a[..., None]) + tone * a[..., None]
    still.alpha = still.alpha * (1 - a) + a
    return a > 0.5


# (key, the plan's words, view, the region or regions it must fail in, the plant)
RENDER_PLANTS = (
    ("3", "an outer edge drawn soft at 0.6 pt, as head.line unclipped (on a crisp ear edge)", "front", "ear.R|outside", soft_edge),
    # The hull moves the ear's edge, and its band with it, out past where the sheet draws the edge: the ear's inside
    # then holds the sheet's outline, which ours no longer draws there.
    ("4", "one ear's outer edge replaced by its smoothed hull", "front", ("ear.R|outside", "ear.R"), hull_edge),
    ("5", "one paw's sole flattened, with square 4 pt corners", "front", "front.R|ground", flat_sole),
    ("7", "a uniform 1.75 pt tone-10 line all round a paw", "front", "front.R|ground", heavy_line),
)


def plant_render(species, key, stills, calibration_path, folder):
    """One render plant in a build's still (stills/<view>): (the base result, the planted result, the painted mask,
    the plant's entry, the planted check's picture parts)."""
    entry = next(p for p in RENDER_PLANTS if p[0] == key)
    _, _, view, _, plant = entry
    still = RenderStill(Path(stills) / view)
    painted = plant(still)
    planted = still.write(Path(folder) / "planted")
    base, _ = lm.check(species, Path(stills) / view, calibration_path)
    after, pieces = lm.check(species, planted, calibration_path)
    return base, after, painted, entry, pieces


def changed(base, after):
    """The regions whose verdict a plant changed, and those that fail after it."""
    flipped = sorted(n for n in after["regions"] if base["regions"].get(n, {}).get("pass", True) != after["regions"][n]["pass"])
    return flipped, sorted(after["failed"])


def new_failures(base, after, regions):
    """Each of the regions' measures that fails after the plant and did not before: {region: {measure: [value,
    threshold]}}."""
    out = {}
    for name in regions:
        row, was = after["regions"].get(name), base["regions"].get(name, {"failed": []})
        new = [m for m in row["failed"] if m not in was["failed"]] if row else []
        if new:
            out[name] = {m: [row["measures"][m]["value"], row["measures"][m]["threshold"]] for m in new}
    return out


def evidence_picture(before, after, path, caption, zoom=3, pad=36):
    """before | after, cut round what the plant changed (still px), zoomed, with the caption above."""
    a = np.asarray(Image.open(Path(before) / "white.png").convert("RGB"))
    b = np.asarray(Image.open(Path(after) / "white.png").convert("RGB"))
    ys, xs = np.nonzero(np.abs(a.astype(int) - b).max(axis=2) > 3)
    y0, y1 = max(ys.min() - pad, 0), min(ys.max() + pad, a.shape[0])
    x0, x1 = max(xs.min() - pad, 0), min(xs.max() + pad, a.shape[1])
    tiles = [match.upscale(t[y0:y1, x0:x1], zoom) for t in (a, b)]
    body = np.concatenate([tiles[0], np.full((tiles[0].shape[0], 8, 3), 255, np.uint8), tiles[1]], axis=1)
    lines = caption.split("\n")
    top = 14 * len(lines) + 8
    image = Image.new("RGB", (max(body.shape[1], 900), body.shape[0] + top), "white")
    image.paste(Image.fromarray(body), (0, top))
    draw = ImageDraw.Draw(image)
    for i, line in enumerate(lines):
        draw.text((4, 4 + 14 * i), line, fill=(170, 0, 40) if i == 0 else (40, 40, 40))
    sheets.save_png(path, np.asarray(image))


def evidence(species, stills, calibration_path, out):
    """Every plant planted, checked and pictured (out/<crop|render>-<key>.png), and what each changed
    (out/plants.json)."""
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    rows = []
    with tempfile.TemporaryDirectory() as tmp:
        for kind, table in (("crop", CROP_PLANTS), ("render", RENDER_PLANTS if stills else ())):
            for key, words, view, region, _ in table:
                folder = Path(tmp) / f"{kind}-{key}"
                if kind == "crop":
                    base, after, _, _, _ = plant_crop(species, key, calibration_path, folder)
                    before = folder / "base"
                else:
                    base, after, _, _, _ = plant_render(species, key, stills, calibration_path, folder)
                    before = Path(stills) / view
                flipped, _ = changed(base, after)
                names = own_regions(species, view, region, calibration_path)
                mine = {n for name in names for n in (name, f"{name} {lm.ACROSS}")}
                failing = new_failures(base, after, sorted(mine | set(flipped)))
                # The taper is on every span, so every edge is its own; each region with a joint must fail.
                elsewhere = sorted(n for n in flipped if "|" not in n) if region == JOINTS else sorted(set(flipped) - mine)
                caught = all({n, f"{n} {lm.ACROSS}"} & set(failing) for n in names) if region == JOINTS else bool(set(failing) & mine)
                rows.append({"plant": key, "planted": kind, "fault": words, "view": view, "regions": list(names),
                             "newFailures": failing, "flippedElsewhere": elsewhere, "ok": caught and not elsewhere})
                shown = "; ".join(f"{n}: " + ", ".join(f"{m} {v} ({t})" for m, (v, t) in ms.items()) for n, ms in list(failing.items())[:3])
                more = f" and {len(failing) - 3} more regions" if len(failing) > 3 else ""
                caption = (f"plant {key} ({kind}, {view}): {words}\nnewly failing, value (threshold): {shown}{more}\n"
                           f"any other region changed: {', '.join(elsewhere) or 'none'}.   before | after")
                evidence_picture(before, folder / "planted", out / f"{kind}-{key}.png", caption)
                print(f"lineplants: {kind} {key}: {'ok' if rows[-1]['ok'] else 'NOT OK'}: {shown}{more}; elsewhere {elsewhere or 'none'}", flush=True)
    contact = pale_everywhere(species, calibration_path)
    for row in contact:
        print(f"lineplants: pale {row['view']} {row['region']}: {'ok' if row['ok'] else 'NOT OK'}: {row['failing']}; elsewhere {row['elsewhere'] or 'none'}", flush=True)
    sheets.write_json(out / "plants.json", {"note": "lineplants.py's evidence: each of the plan's faults (D) planted and checked",
                                            "plants": rows, "paleOnEveryContactEdge": contact})
    return rows + contact


def own_regions(species, view, region, calibration_path):
    """A plant's own regions: the ones named, or for the taper every region with a joint."""
    if region != JOINTS:
        return (region,) if isinstance(region, str) else tuple(region)
    calibration = json.loads(Path(calibration_path).read_text())
    with tempfile.TemporaryDirectory() as tmp:
        scene = sheet_scene(species, view, calibration, linecal.sheet_parts(species, view, calibration), Path(tmp))
        return tuple(sorted(taper_joints(scene, scene.sheet_map())[1]))


def pale_everywhere(species, calibration_path, views=("threeQuarter.R", "side.R"), share=0.6):
    """The pale contact line (plant 11) on every contact edge of the right-facing views whose own line the sheet
    draws (contact_lines): each must fail in its own region and change no other region's verdict. A short edge, whose
    line lies within reach of a neighbour's (contact_lines at margin 0 only), is planted on all of its line clear of
    the neighbours' bands; it must fail in its own region, and the neighbours it shares a corner with may fail too
    ("short": true, its neighbours listed)."""
    calibration = json.loads(Path(calibration_path).read_text())
    rows = []
    with tempfile.TemporaryDirectory() as tmp:
        for view in views:
            judge = SheetJudge(species, view, calibration, Path(tmp) / view)
            base = judge.judge()
            clear = contact_lines(judge.scene, judge.sheet)
            for region in contact_lines(judge.scene, judge.sheet, margin=0):
                short = region not in clear
                after, painted = judge.plant(pale_contact, region=region, share=share, margin=0 if short else PALE_CLEAR_PX)
                flipped = sorted(n for n in after if after[n]["pass"] != base[n]["pass"])
                mine = {region, f"{region} {lm.ACROSS}"}
                failing = {n: {m: [after[n]["measures"][m]["value"], after[n]["measures"][m]["threshold"]] for m in after[n]["failed"]}
                           for n in sorted(mine) if n in after and after[n]["failed"]}
                elsewhere = sorted(set(flipped) - mine)
                rows.append({"plant": "11", "planted": "crop", "view": view, "region": region, "share": share, "paintedPx": int(painted.sum()),
                             "short": short, "failing": failing, "elsewhere": elsewhere, "ok": bool(failing) and (short or not elsewhere)})
    return rows


def main(argv):
    parser = argparse.ArgumentParser(usage=__doc__)
    parser.add_argument("species")
    parser.add_argument("--out", required=True)
    parser.add_argument("--stills")
    parser.add_argument("--calibration")
    args = parser.parse_args(argv)
    calibration = args.calibration or Path(__file__).resolve().parent / "lines" / f"{args.species}.json"
    try:
        rows = evidence(args.species, args.stills, calibration, args.out)
    except Exception as error:
        traceback.print_exc()
        print(f"lineplants: {type(error).__name__}: {error}", file=sys.stderr)
        return 2
    return 0 if all(r["ok"] for r in rows) else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
