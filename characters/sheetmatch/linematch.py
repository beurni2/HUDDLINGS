"""The line check (docs/phase3-fur-plan.md, The check that would have caught it):
a still's lines beside its turnaround crop's, region by region, where the
silhouette, landmark and palette gates of match.py cannot look: inside the
silhouette and under 2 pt.

    python3 characters/sheetmatch/linematch.py dog --still <dir> --out <dir> [--calibration <json>]

Reads the still that runtime-web/lab/still.ts writes and the calibration
linecal.py writes (default characters/sheetmatch/lines/<species>.json). Writes
<out>/lines.json (every region, every measure, its threshold and its verdict)
and lines.png (sheet | ours | the line maps by region, failing regions marked).
Exits 0 when every region passes, 1 when one fails and 2 on any error, leaving
no lines.json. About a second and a half per view.

The render is laid on the crop's grid as match.py lays it (model point 0, 0 on
the crop's ground anchor, area-averaged), moved by match.py's best-fit shift
rounded to whole pixels. A region is the band of BAND_PX crop px round one
boundary of the render's ID pass, named by the two parts it divides (each clip
group by its mask, the head's line by the head, the ground shadow as "ground",
the card as "outside"): ear.R|head.base is the cheek and crown over the right
ear, collar|head.base the chin. A part's inside beyond the bands is a region
named by the part alone (its toe lines, fur strokes, an ear's locks), and the
lines that cross a boundary rather than run along it (a toe line meeting the
sole) are judged apart, as "<pair> across". The eyes, nose, mouth, brows and
tag are left out, by ID and by the sheet's landmarks.

A line is a dark valley: a black top-hat on L* (radius TOPHAT_PX) above the
sheet's tau (where its skeleton's length plateaus), carried on above tau / 2,
in warm hues. A render has no JPEG noise, so where it draws a line at all
(above FAINT of tau) counts for the sheet's line being drawn. In each region
ours is moved by the whole-pixel shift (within SHIFT_PX) that matches the two
best, so a line a pixel off reads as there. Measured on the crop's grid, ours
against the sheet's:
(a) recall: the share of the sheet's line within MATCH_PX of ours;
(b) precision: the share of ours within MATCH_PX of the sheet's, and the longest
    of our marks the sheet does not draw (a tick, a hook, a cuff), in pt;
(c) gap: the longest run of the sheet's line ours does not draw, in pt;
(d) weight: the coefficient of variation of the line's width across it, away
    from junctions (where two lines merge and read as one wide one), ours over
    the sheet's;
(e) tone: the line's core L* along it, ours less the sheet's, the worst over
    windows of TONE_WINDOW_PX each way (a line across a boundary toned clear of
    the edge's own line); in a .R facing on contact edges only, where one part
    lies over another: the light rule lightens the outer edge;
    ink: the line's darkness summed across its width over the same windows, the
    worst log of ours over the sheet's either way: a line paler, thinner or
    missing, or heavier, darker or doubled, which a blur cannot hide;
(h) seams: the longest run of a boundary inside the silhouette that ours steps
    by more than SEAM_STEP_L with no line where the sheet steps by less than
    SEAM_FLAT_L, or that ours draws lighter than both sides by more than
    SEAM_LIGHT_L where the sheet does not.
Measured on the render alone at its own 3 px/pt, against the sheet's larger
panels (the hero, the stubby paws) and a reference ribbon:
(d) weight: the lower quartile of the line's width, held under the sheet's own
    width there plus WIDTH_MARGIN_PT (a line uniformly heavier fails);
(f) fur: how far the edge leaves itself smoothed over FUR_SIGMA_PT, less that
    distance's own trend (a smooth curve's sag is its shape, not its fur), as
    an RMS and as crossings per 10 pt, held to FUR_SHARE of the gentlest the
    panels draw on the ears, cheeks, chin, tail, paw soles and haunch bottoms;
(g) crispness: the 10-90% rise of the alpha across the outer edge, held to the
    crisp reference ribbon's.
The thresholds per region are the sheet's own spread against perturbed copies
of itself, the worst 10% looser (linecal.py), never tuned to a render; a run is
never held finer than RESOLUTION_PT, which the crops cannot resolve. A region
the calibration's build did not have is held to the loosest of its view's and
marked uncalibrated. look.ts runs it advisory: its verdict never changes look's
exit code until the lead makes it gating."""
import os
import sys
import traceback

if __name__ == "__main__":
    def crashed(kind, value, trace):
        """Any error, from the imports on, exits 2: an uncaught exception's own 1 would read as failed checks."""
        traceback.print_exception(kind, value, trace)
        sys.stderr.flush()
        os._exit(2)

    sys.excepthook = crashed

import argparse  # noqa: E402
import fnmatch  # noqa: E402
import json  # noqa: E402
import time  # noqa: E402
from pathlib import Path  # noqa: E402

import numpy as np  # noqa: E402
from PIL import Image, ImageDraw  # noqa: E402
from scipy import ndimage  # noqa: E402
from scipy.spatial import cKDTree  # noqa: E402
from skimage import measure as skmeasure  # noqa: E402
from skimage.morphology import skeletonize  # noqa: E402

import match  # noqa: E402

sheets = match.sheets
BAND_PX = 3  # crop px either side of a boundary (about 2.3 pt): the plan's region
TOPHAT_PX = 2  # crop px: the top-hat's radius; the sheet's lines are 2 to 3 px wide
WARM_A, WARM_B = -3.0, 8.0  # a* and b* above which a dark pixel is the warm line (yellow to red), not the blue collar
# nor grey. The plan's a* > 3 dropped the outline's faint grey-brown stretches, and a JPEG's chroma loss erased them (DECISIONS 251).
MATCH_PX = 1.5  # crop px: a line pixel matches the other's line within this
FAINT = 0.25  # of tau: a render draws a line wherever its top-hat reaches this (a render has no JPEG noise to read)
INK_FLOOR = 4  # px of a line at tau: the ink a window holds before its ratio means anything
SHIFT_PX = 2  # crop px: how far a region's lines may be moved to match
TONE_WINDOW_PX = 6  # crop px either way along a line: the stretch whose tone is compared, about 10 pt
MIN_LINE_PX = 4  # skeleton px: fewer and a region has no line to measure the recall, precision or tone of
MIN_WIDTH_PX = 8  # skeleton px away from junctions: fewer and a line's width has no spread to read
JUNCTION_PX = 2  # crop px round a junction where a line's width is not read
SEAM_STEP_L, SEAM_FLAT_L, SEAM_LIGHT_L = 6.0, 3.0, 3.0  # the plan's seam: a step of 6 L* where the sheet's is under 3
SEAM_SIDE_PX = 4  # crop px: how far either side of a boundary its two sides are read
FACE = ("eye.*", "brow.*", "nose*", "mouth*", "tongue*", "stars*", "teeth*")
TAG = ("tag*",)
FACE_GROW_PX = 3  # crop px round the face's and the tag's ID: the sheet's brows lie a pixel or two off ours
# Discs round the sheet's face landmarks (pt): an eye is about 19 pt tall (DECISIONS 7), the open mouth hangs about
# 16 pt below its corners (DECISIONS 50), the tag's heart about 14 pt across hangs from its top.
FACE_RADII_PT = {"eye": 12.0, "nose": 7.0, "mouth": 9.0, "tag": 8.0, "ring": 3.0}
RESOLUTION_PT = 1.5  # the turnaround crops (about 1.3 px per pt) resolve no run shorter (the plan, C)
MARGIN = 0.1  # the plan's margin on the worst perturbed score
FINE_TOPHAT_PT = 2.0  # the top-hat's radius on the render at its own scale and on the panels
WIDTH_MARGIN_PT = 0.3  # the plan's (d): a line uniformly at least the sheet's width plus this is too heavy
WIDTH_QUANTILE = 0.25  # "uniformly": even the line's thinner quarter
FUR_SIGMA_PT = 4.0  # the plan's (f): the edge against itself smoothed this much
FUR_STEP_PT = 0.25
FUR_DEADBAND_PT = 0.15  # a crossing counts once the edge is this far out on the other side (pixel noise is under it)
FUR_MIN_PT = 3 * FUR_SIGMA_PT  # an edge shorter has no shape of its own to smooth against
FUR_SHARE = 0.6  # the plan's (f): ours reaches at least this share of the sheet's
OUTSIDE, GROUND, LEFT_OUT = "outside", "ground", "-"
# The regions each panel-measured quantity holds, by class (fnmatch on the region's name).
FUR_CLASSES = {"ear": ("ear.*|outside",), "cheek": ("ear.*|head.base",), "chin": ("collar|head.base",),
               "tail": ("tail|outside",), "sole": ("front.*|ground", "hind.*|ground"), "haunch": ("body.back|ground",)}
WIDTH_CLASSES = {"sole": ("front.*|ground", "hind.*|ground", "body.back|ground", "body.front|ground", "tail|ground"),
                 "ear": ("ear.*|outside",),
                 "head": ("head.base|outside", "tuft|outside", "head.base|tuft", "ear.*|head.base", "collar|head.base"),
                 "tail": ("tail|*", "body.back|tail"),
                 "body": ("*",)}
# What each region is, as a person reads the dog (first match wins).
WHAT = (("ear.*|head.base", "the cheek and crown over the ear"), ("collar|head.base", "the chin over the collar"),
        ("ear.*|outside", "the ear's outer edge and hem"), ("tuft|outside", "the topknot"), ("head.base|tuft", "the topknot's foot"),
        ("head.base|outside", "the head's outline"), ("front.*|ground", "the front paw's sole"), ("hind.*|ground", "the hind paw's sole"),
        ("body.back|ground", "the haunch's underside"), ("body.front|front.*", "the front leg against the chest"),
        ("body.back|front.*", "the front leg against the haunch"), ("body.back|hind.*", "the hind paw against the haunch"),
        ("body.back|tail", "the tail against the haunch"), ("tail|*", "the tail's edge"), ("body.back|outside", "the back's outline"),
        ("body.front|outside", "the chest's outline"), ("front.*|outside", "the front leg's outline"),
        ("front.*|hind.*", "the front paw against the hind paw"), ("body.back|body.front", "the chest against the flank"),
        ("front.L|front.R", "the front legs against each other"), ("*collar*", "the collar's edge"), ("*", "a part's edge"))
# Each measure: its direction (+1 higher is better), where it is measured, and whether a run's resolution holds it.
MEASURES = {"recall": (1, "grid"), "precision": (1, "grid"), "gapPt": (-1, "grid"), "extraPt": (-1, "grid"),
            "widthCvRatio": (1, "grid"), "toneDelta": (-1, "grid"), "inkLog": (-1, "grid"), "hardSeamPt": (-1, "grid"), "lightSeamPt": (-1, "grid"),
            "widthPt": (-1, "fine"), "furRmsPt": (1, "fine"), "furCrossings10Pt": (1, "fine"), "risePt": (-1, "fine")}
RUNS = ("gapPt", "extraPt", "hardSeamPt", "lightSeamPt")
TWO_SIDED = ("toneDelta", "inkLog")  # held on their size either way


def disk(radius):
    r = int(np.ceil(radius))
    y, x = np.mgrid[-r:r + 1, -r:r + 1]
    return x * x + y * y <= radius * radius + 1e-9


def matches_any(name, patterns):
    return any(fnmatch.fnmatchcase(name, p) for p in patterns)


def what(region):
    if region.endswith(" " + ACROSS):
        return what(base(region)) + ": the lines across it (toe lines, notches, tufts)"
    if "|" not in region:
        return next(text for pattern, text in INNER if fnmatch.fnmatchcase(region, pattern))
    return next(text for pattern, text in WHAT if fnmatch.fnmatchcase(region, pattern))


# What each part's inside holds, as a region of its own.
INNER = (("front.*", "the front leg's inner lines: the toe lines"), ("hind.*", "the hind paw's inner lines: the toe lines"),
         ("ear.*", "the ear's locks"), ("head.base", "the face's and crown's inner lines"), ("body.front", "the chest's fur"),
         ("body.back", "the body's inner lines"), ("tail", "the tail's locks"), ("tuft", "the topknot's locks"), ("*", "a part's inner lines"))


def host(name, parts):
    """The part a still's part is judged as: a clip group's mask (recursively), the head's line as the head, the
    ground shadow as the ground; the face and the tag are left out."""
    if match.matches(name, FACE) or match.matches(name, TAG):
        return LEFT_OUT
    if name == match.GROUND_SHADOW:
        return GROUND
    if name == "head.line" or name.startswith("temple."):
        return "head.base"
    clip = parts.get(name, {}).get("clipTo")
    return host(clip, parts) if clip else name


def pair_name(a, b):
    """A region's name: its two parts in order, the card or the ground second."""
    last = {OUTSIDE: 2, GROUND: 1}
    a, b = sorted((a, b), key=lambda n: (last.get(n, 0), n))
    return f"{a}|{b}"


def hosts_map(render, still):
    """Each crop pixel's part (as host() names it), from the parts' coverage on the grid: the host covering most of
    it, or the ground or the card where the drawing covers less than half."""
    names = sorted({host(n, still.meta["parts"]) for n in render.coverage})
    stack = np.zeros((len(names),) + render.alpha.shape)
    for part, cover in render.coverage.items():
        stack[names.index(host(part, still.meta["parts"]))] += cover
    labels = np.array(names + [OUTSIDE])
    drawn = [i for i, n in enumerate(names) if n != GROUND]
    best = np.where(stack[drawn].sum(axis=0) >= match.COVERAGE, np.array(drawn)[stack[drawn].argmax(axis=0)], -1)
    if GROUND in names:
        g = names.index(GROUND)
        best = np.where((best < 0) & (stack[g] >= match.COVERAGE), g, best)
    return labels[best]


def regions(hosts):
    """The boundary pixels between parts, each named by its pair, and the band round each, and each part's inside
    beyond the bands: (names, boundary label, region label), labels indexing names, -1 for none. A boundary with the
    face or the tag is named LEFT_OUT, so its band is left out rather than given to the nearest region, as is the
    ground shadow's edge on the card."""
    h, w = hosts.shape
    pairs = np.full((h, w), "", dtype=object)
    for axis in (0, 1):
        a = hosts[:-1, :] if axis == 0 else hosts[:, :-1]
        b = hosts[1:, :] if axis == 0 else hosts[:, 1:]
        for y, x in zip(*np.nonzero(a != b)):
            pair = {a[y, x], b[y, x]}
            name = LEFT_OUT if LEFT_OUT in pair or pair == {GROUND, OUTSIDE} else pair_name(a[y, x], b[y, x])
            for yy, xx in ((y, x), (y + 1, x) if axis == 0 else (y, x + 1)):
                if not pairs[yy, xx]:
                    pairs[yy, xx] = name
    edge = pairs != ""
    distance, (iy, ix) = ndimage.distance_transform_edt(~edge, return_indices=True)
    # Beyond the bands, each part's inside is a region of its own, named by the part alone: its inner lines (toe
    # lines, fur strokes, an ear's locks).
    inner = (distance > BAND_PX) & ~np.isin(hosts, [LEFT_OUT, GROUND, OUTSIDE])
    names = sorted(set(pairs[edge]) | set(hosts[inner]))
    index = {n: i for i, n in enumerate(names)}
    boundary = np.full((h, w), -1)
    boundary[edge] = [index[p] for p in pairs[edge]]
    band = np.where(distance <= BAND_PX, boundary[iy, ix], -1)
    band[inner] = [index[p] for p in hosts[inner]]
    return names, boundary, band


def line_map(rgb, tau, keep, radius=TOPHAT_PX):
    """A line map: the black top-hat of L* (closing less the image) above tau, in warm hues, where keep is True, and
    on above tau / 2 where it carries on a line that reaches tau (a hysteresis, so a line's fainter stretch is not
    read as a break); with its skeleton, the top-hat itself and L*."""
    lab = sheets.to_lab(np.asarray(rgb))
    L = lab[..., 0]
    tophat = ndimage.grey_closing(L, footprint=disk(radius)) - L
    warm = (lab[..., 1] > WARM_A) & (lab[..., 2] > WARM_B) & keep
    labels, _ = ndimage.label((tophat > tau / 2) & warm, structure=np.ones((3, 3)))
    strong = np.unique(labels[(tophat > tau) & warm])
    lines = np.isin(labels, strong[strong > 0])
    skeleton = skeletonize(lines)
    # Any line at all, however faint: whether a render draws a line where the sheet does (a blurred or JPEG-softened
    # line fades; one deleted, or tapered to nothing, is gone).
    faint = (tophat > FAINT * tau) & warm
    # Where a line runs alone: away from every junction (three or more neighbours) by JUNCTION_PX.
    neighbours = ndimage.convolve(skeleton.astype(np.int16), np.ones((3, 3), np.int16), mode="constant") - 1
    plain = skeleton & ~ndimage.binary_dilation(skeleton & (neighbours >= 3), disk(JUNCTION_PX))
    return {"lines": lines, "skeleton": skeleton, "plain": plain, "faint": faint, "ink": np.where(warm, np.maximum(tophat, 0), 0),
            "tophat": tophat, "L": L}


def plateau_tau(rgb, keep, taus=range(2, 31)):
    """The sheet's tau: where its skeleton's length changes least for a change in tau, the plateau between the
    noise below and the lines thinning away above (the plan, B). Returns tau and the curve."""
    lab = sheets.to_lab(np.asarray(rgb))
    L = lab[..., 0]
    tophat = ndimage.grey_closing(L, footprint=disk(TOPHAT_PX)) - L
    warm = (lab[..., 1] > WARM_A) & (lab[..., 2] > WARM_B) & keep
    taus = np.array(list(taus))
    lengths = np.array([skeletonize((tophat > t) & warm).sum() for t in taus], dtype=np.float64)
    slope = (lengths[:-2] - lengths[2:]) / (2 * np.maximum(lengths[1:-1], 1))
    return float(taus[1:-1][int(np.argmin(slope))]), {int(t): int(n) for t, n in zip(taus, lengths)}


def face_keep(frame, grid, hosts):
    """Where lines are read: everywhere but the face and the tag, by the render's ID (grown FACE_GROW_PX) and by the
    sheet's own landmarks (model.json: a disc round each eye and the nose, the mouth's corners, the tag's heart and
    ring), so neither image's face is read as fur."""
    out = ndimage.binary_dilation(hosts == LEFT_OUT, disk(FACE_GROW_PX))
    marks = frame.model["landmarks"][frame.source]
    yy, xx = np.mgrid[:hosts.shape[0], :hosts.shape[1]]

    def disc(pt, radius_pt):
        x, y = grid.to_index(pt)
        return (xx - x) ** 2 + (yy - y) ** 2 <= (radius_pt / grid.k) ** 2

    for name in ("eye.L", "eye.R"):
        if name in marks:
            out |= disc(marks[name], FACE_RADII_PT["eye"])
    if "nose" in marks:
        out |= disc(marks["nose"], FACE_RADII_PT["nose"])
    corners = [marks[n] for n in ("mouth.L", "mouth.R") if n in marks]
    if corners and "nose" in marks:
        # The mouth hangs from the nose to below its corners: a disc on each corner and one under their middle.
        middle = [float(np.mean([c[0] for c in corners] + [marks["nose"][0]])), max(c[1] for c in corners)]
        for pt in corners + [middle]:
            out |= disc(pt, FACE_RADII_PT["mouth"])
    if "tag.top" in marks:
        top = marks["tag.top"]
        out |= disc([top[0], top[1] + FACE_RADII_PT["tag"]], FACE_RADII_PT["tag"])
    if "tag.ring" in marks:
        out |= disc(marks["tag.ring"], FACE_RADII_PT["ring"])
    return ~out


def orientation(skeleton):
    """Each skeleton pixel's normal (unit vectors, rows y then x), from the spread of the skeleton round it."""
    r = 2
    dy, dx = np.mgrid[-r:r + 1, -r:r + 1].astype(np.float64)
    s = skeleton.astype(np.float64)
    sxx = ndimage.correlate(s, dx * dx, mode="constant")
    syy = ndimage.correlate(s, dy * dy, mode="constant")
    sxy = ndimage.correlate(s, dx * dy, mode="constant")
    tangent = 0.5 * np.arctan2(2 * sxy, sxx - syy)  # the angle of (x, y) along the line
    return np.stack([np.cos(tangent), -np.sin(tangent)], axis=-1)  # (ny, nx): the tangent turned a quarter


def widths(tophat, points, normals, reach=4.0, step=0.25):
    """The full width at half maximum of the top-hat across the line at each point (px), its peak found within a
    quarter of the reach."""
    t = np.arange(-reach, reach + step / 2, step)
    ys = points[:, None, 0] + t[None, :] * normals[:, None, 0]
    xs = points[:, None, 1] + t[None, :] * normals[:, None, 1]
    profile = ndimage.map_coordinates(tophat, [ys.ravel(), xs.ravel()], order=1, mode="nearest").reshape(ys.shape)
    middle, near = len(t) // 2, max(1, int(round(reach / 4 / step)))
    peak_at = profile[:, middle - near:middle + near + 1].argmax(axis=1) + middle - near
    out = np.zeros(len(points))
    for i in range(len(points)):
        p, c = profile[i], peak_at[i]
        half = p[c] / 2
        lo, hi = c, c
        while lo > 0 and p[lo - 1] >= half:
            lo -= 1
        while hi < len(t) - 1 and p[hi + 1] >= half:
            hi += 1
        left = t[lo] - (step * (p[lo] - half) / (p[lo] - p[lo - 1]) if lo > 0 else 0)
        right = t[hi] + (step * (p[hi] - half) / (p[hi] - p[hi + 1]) if hi < len(t) - 1 else 0)
        out[i] = right - left
    return out


def extent(points):
    """How long a run of pixels is: the furthest two apart, plus one pixel."""
    if len(points) < 2:
        return float(len(points))
    d = points[:, None, :] - points[None, :, :]
    return float(np.sqrt((d ** 2).sum(-1)).max()) + 1.0


def longest_run(mask, k):
    """The longest connected run in a mask of thin pixels, in pt (k pt per px)."""
    labels, _ = ndimage.label(mask, structure=np.ones((3, 3)))
    best = 0.0
    for i, box in enumerate(ndimage.find_objects(labels), start=1):
        best = max(best, extent(np.argwhere(labels[box] == i)))
    return best * k


def r(value, places=3):
    return None if value is None else round(float(value), places) + 0.0


class Scene:
    """A still on its view's crop's grid: the sheet and the render, the render's parts as hosts, the regions."""

    def __init__(self, species, still_dir, calibration, shift=None):
        self.species = species
        self.model = json.loads((sheets.ROOT / "characters" / species / "model.json").read_text())
        still = match.Still.load(still_dir)
        views = still.meta["views"]
        if views["body"] != views["head"]:
            raise ValueError(f"the still's body is in {views['body']} and its head in {views['head']}: the turnaround draws one view")
        self.view = views["body"]
        self.meta = still.meta
        self.frame = frame = match.Frame(species, self.model, self.view)
        # A mirrored facing is measured in its .L crop's frame, as match.py does: the render is mirrored.
        self.still = seen = still.mirrored() if frame.mirrored else still
        self.grid = grid = match.Grid(frame, seen)
        sheet_sil = grid.pad(frame.sil, False)
        if shift is None:
            shift, _ = match.best_shift(match.Render(grid, frame, parts=False).sil, sheet_sil)
        # Whole pixels only: a fractional move would resample the render a second time, a blur the sheet never had;
        # what is left (half a pixel at most) each region's own shift and MATCH_PX absorb. A still whose alignment
        # is known (the sheet's own, linecal.sheet_still) passes it.
        self.shift = [float(round(s)) for s in shift]
        self.render = match.Render(grid, frame, tuple(self.shift))
        self.hosts = hosts_map(self.render, seen)
        self.names, self.boundary, self.band = regions(self.hosts)
        crop = grid.pad(frame.crop, 0).astype(np.uint8)
        crop[~grid.pad(np.ones(frame.sil.shape, bool), False)] = frame.card
        self.crop = crop
        self.keep = face_keep(frame, grid, self.hosts) & (self.band >= 0)
        crops = (calibration or {}).get("crops", {})
        self.tau = crops[frame.source]["tau"] if frame.source in crops else plateau_tau(crop, self.keep)[0]
        self.contact = {n for n in self.names if "|" in n and n != LEFT_OUT and OUTSIDE not in n.split("|") and GROUND not in n.split("|")}

    def sheet_map(self):
        return line_map(self.crop, self.tau, self.keep)

    def ours_map(self, rgb=None):
        return line_map(self.render.rgb if rgb is None else rgb, self.tau, self.keep)


def across(scene, skeleton):
    """Which skeleton pixels run across their region's boundary rather than along it (their direction more than 45
    degrees from the boundary's nearest stretch): toe lines and ticks off a sole, a lock's notch, a tuft's strokes."""
    edge = scene.boundary >= 0
    normals = orientation(edge)
    _, (iy, ix) = ndimage.distance_transform_edt(~edge, return_indices=True)
    line = orientation(skeleton)
    return skeleton & (np.abs((line * normals[iy, ix]).sum(-1)) < np.cos(np.radians(45)))


def measure_lines(scene, sheet, ours, s_pts, o_pts, hit_s, hit_o, shift, cores, normals):
    """The measures of one set of lines: recall, precision, the longest gap and extra run, the width's spread and
    the worst local tone, from the sheet's and ours' skeleton pixels in the region (ours as found, before the
    shift) and which of each matched the other's line."""
    h, w = scene.band.shape
    k = scene.grid.k
    dx, dy = shift
    row = {"sheetPx": int(len(s_pts)), "oursPx": int(len(o_pts))}
    row["recall"] = r(hit_s.mean()) if len(s_pts) >= MIN_LINE_PX else None
    row["precision"] = r(hit_o.mean()) if len(o_pts) >= MIN_LINE_PX else None
    missing = np.zeros((h, w), bool)
    missing[tuple(s_pts[~hit_s].T)] = True
    row["gapPt"] = r(longest_run(missing, k), 2)
    extra = np.zeros((h, w), bool)
    extra[tuple(o_pts[~hit_o].T)] = True
    row["extraPt"] = r(longest_run(extra, k), 2)
    row["widthCvRatio"] = row["toneDelta"] = None
    # A line's width is read only where it runs alone: at a junction the profile across it holds the other line.
    s_plain, o_plain = s_pts[sheet["plain"][tuple(s_pts.T)]], o_pts[ours["plain"][tuple(o_pts.T)]]
    if len(s_plain) >= MIN_WIDTH_PX and len(o_plain) >= MIN_WIDTH_PX:
        ws = widths(sheet["tophat"], s_plain.astype(float), normals[0][tuple(s_plain.T)])
        wo = widths(ours["tophat"], o_plain.astype(float), normals[1][tuple(o_plain.T)])
        cv_s, cv_o = ws.std() / ws.mean(), wo.std() / wo.mean()
        row["widthCvSheet"], row["widthCvOurs"] = r(cv_s), r(cv_o)
        row["widthCvRatio"] = r(cv_o / cv_s) if cv_s > 0 else None
    if len(s_pts) >= MIN_LINE_PX and len(o_pts) >= MIN_LINE_PX:
        row["toneDelta"], row["toneAt"] = local_tone(s_pts, o_pts + [dy, dx], cores[0][tuple(s_pts.T)], cores[1][tuple(o_pts.T)], scene)
    return row


def compare(scene, sheet, ours):
    """Every measure on the crop's grid in each region, ours (line_map's) against the sheet's, ours moved in each
    region by the whole-pixel shift that matches the two best. Each boundary's lines that run across it are also
    measured alone, as "<region> across": a toe line read as a short dark tick hides among the sole's own line.
    Returns {region: measures}."""
    band = scene.band
    # A skeleton pixel matches when the other's line (not only its skeleton) is within MATCH_PX: the sheet's needs
    # any line of ours, however faint; ours needs one of the sheet's lines (its faint pixels are JPEG noise too).
    dist_s = ndimage.distance_transform_edt(~sheet["lines"])
    dist_o = ndimage.distance_transform_edt(~ours["faint"])
    normals = orientation(sheet["skeleton"]), orientation(ours["skeleton"])
    cores = ndimage.grey_erosion(sheet["L"], size=3), ndimage.grey_erosion(ours["L"], size=3)
    cross_s, cross_o = across(scene, sheet["skeleton"]), across(scene, ours["skeleton"])
    edge_distance = ndimage.distance_transform_edt(scene.boundary < 0)
    seam = seams(scene, sheet, ours, dist_o)
    h, w = band.shape
    out = {}
    for index, name in enumerate(scene.names):
        if name == LEFT_OUT:
            continue
        inside = band == index
        s_pts = np.argwhere(sheet["skeleton"] & inside)
        best = None
        for dy in range(-SHIFT_PX, SHIFT_PX + 1):
            for dx in range(-SHIFT_PX, SHIFT_PX + 1):
                # Ours moved by d: its pixel q lands on q + d, so q is in the region where q + d is.
                o_pts = np.argwhere(ours["skeleton"] & match.shifted(inside, -dx, -dy))
                hit_s = dist_o[np.clip(s_pts[:, 0] - dy, 0, h - 1), np.clip(s_pts[:, 1] - dx, 0, w - 1)] <= MATCH_PX
                hit_o = dist_s[np.clip(o_pts[:, 0] + dy, 0, h - 1), np.clip(o_pts[:, 1] + dx, 0, w - 1)] <= MATCH_PX
                # Shares, not counts, so a shift is not chosen for bringing more of ours into the band.
                score = (hit_s.mean() if len(s_pts) else 0) + (hit_o.mean() if len(o_pts) else 0) - 0.001 * (abs(dx) + abs(dy))
                if best is None or score > best[0]:
                    best = (score, dx, dy, o_pts, hit_s, hit_o)
        _, dx, dy, o_pts, hit_s, hit_o = best
        row = {"shiftPx": [dx, dy], **measure_lines(scene, sheet, ours, s_pts, o_pts, hit_s, hit_o, (dx, dy), cores, normals)}
        row["inkLog"], row["inkAt"] = local_ink(scene, sheet, ours, inside, s_pts, o_pts + [dy, dx], (dx, dy))
        row.update(seam.get(name, {"hardSeamPt": None, "lightSeamPt": None}))
        out[name] = row
        if "|" in name:
            s_x, o_x = cross_s[tuple(s_pts.T)], cross_o[tuple(o_pts.T)]
            sub = measure_lines(scene, sheet, ours, s_pts[s_x], o_pts[o_x], hit_s[s_x], hit_o[o_x], (dx, dy), cores, normals)
            # A line across the boundary is toned on its own pixels clear of the edge's line: a toe line drawn as a
            # dark tick is darker there, where the sole's own line no longer darkens its neighbours.
            o_moved = o_pts + [dy, dx]
            off_s = s_x & (edge_distance[tuple(s_pts.T)] >= ACROSS_OFF_PX)
            off_o = o_x & (edge_distance[tuple(np.clip(o_moved, 0, [h - 1, w - 1]).T)] >= ACROSS_OFF_PX)
            sub["toneDelta"], sub["toneAt"] = local_tone(s_pts[off_s], o_moved[off_o], sheet["L"][tuple(s_pts[off_s].T)],
                                                         ours["L"][tuple(o_pts[off_o].T)], scene, least=2)
            out[f"{name} {ACROSS}"] = {"shiftPx": [dx, dy], **sub, "inkLog": None, "hardSeamPt": None, "lightSeamPt": None}
    return out


ACROSS_OFF_PX = 2  # crop px: a line across a boundary is toned this far from it, clear of the edge's own line


def local_ink(scene, sheet, ours, inside, s_pts, o_moved, shift):
    """How much line each image draws along a region, window by window: the sum of the warm top-hat (a line's
    darkness across its width, which a blur spreads but keeps) over the region within TONE_WINDOW_PX of each line
    pixel of either image, ours moved by the region's shift. The worst log of ours over the sheet's (positive: ours
    draws more: heavier, darker, a tick the sheet has not; negative: less: paler, thinner, missing), and where (pt).
    Each sum is floored at INK_FLOOR px of a line at tau, so a window that draws next to nothing reads as nothing."""
    dx, dy = shift
    centres = np.concatenate([s_pts, o_moved]) if len(o_moved) else s_pts
    if not len(centres):
        return None, None
    # Summed a little past the band, so a line a pixel or two off still counts whole in both.
    area = ndimage.binary_dilation(inside, disk(SHIFT_PX))
    p_s = np.argwhere(area)
    q = np.argwhere(match.shifted(area, -dx, -dy))
    floor = INK_FLOOR * scene.tau

    def sums(points, values):
        if not len(points):
            return np.zeros(len(centres))
        hits = cKDTree(points).query_ball_point(centres, TONE_WINDOW_PX)
        return np.array([values[h].sum() for h in hits])

    s = sums(p_s, sheet["ink"][tuple(p_s.T)])
    o = sums(q + [dy, dx], ours["ink"][tuple(q.T)])
    ratio = np.log((o + floor) / (s + floor))
    i = int(np.abs(ratio).argmax())
    y, x = centres[i]
    return r(ratio[i]), [r(v, 1) for v in scene.grid.to_pt([x, y])]


ACROSS = "across"


def local_tone(s_pts, o_moved, core_s, core_o, scene, least=MIN_LINE_PX):
    """The worst difference along a line between ours' core L* and the sheet's, each averaged over the line within
    TONE_WINDOW_PX of a point of the sheet's (least points of each at least): ours less the sheet's (positive: ours
    is lighter), and where (pt)."""
    if not len(o_moved) or not len(s_pts):
        return None, None
    d_ss = np.hypot(*(s_pts[:, None, :] - s_pts[None, :, :]).transpose(2, 0, 1))
    d_so = np.hypot(*(s_pts[:, None, :] - o_moved[None, :, :]).transpose(2, 0, 1))
    near_s, near_o = d_ss <= TONE_WINDOW_PX, d_so <= TONE_WINDOW_PX
    ok = (near_s.sum(1) >= least) & (near_o.sum(1) >= least)
    if not ok.any():
        return None, None
    mean_s = (near_s * core_s[None, :]).sum(1) / np.maximum(near_s.sum(1), 1)
    mean_o = (near_o * core_o[None, :]).sum(1) / np.maximum(near_o.sum(1), 1)
    delta = np.where(ok, mean_o - mean_s, 0)
    i = int(np.abs(delta).argmax())
    y, x = s_pts[i]
    return r(delta[i], 1), [r(v, 1) for v in scene.grid.to_pt([x, y])]


def seams(scene, sheet, ours, dist_o):
    """The plan's seams (h) on each boundary inside the silhouette, ours against the sheet on the same boundary: the
    longest run (pt) of a hard unlined seam and of a light seam. A side is the mean L* of that side's part from 1.5
    to SEAM_SIDE_PX px off the boundary; its band, within 1.5 px. Each image's own lines are left out of both. A
    light seam is a band lighter than the rest of its side by more than SEAM_LIGHT_L: a paler strip between a
    marking and the line it should reach, or between two parts (lighter than both sides, as the plan words it,
    is lighter than each)."""
    hosts, boundary, k = scene.hosts, scene.boundary, scene.grid.k
    near_edge = ndimage.distance_transform_edt(boundary < 0) <= 1.5
    far = disk(SEAM_SIDE_PX).astype(np.float64)
    close = disk(2).astype(np.float64)
    means = {}

    def mean(image, lines, part, near):
        """The mean L* of a part's pixels round each pixel: its band (near) or its side beyond the band."""
        key = (id(image), part, near)
        if key not in means:
            m = ((hosts == part) & (near_edge if near else ~near_edge) & ~lines).astype(np.float64)
            window = close if near else far
            total = ndimage.correlate(image * m, window, mode="constant")
            count = ndimage.correlate(m, window, mode="constant")
            means[key] = np.where(count > 0, total / np.maximum(count, 1e-9), np.nan)
        return means[key]

    out = {}
    for name in scene.contact:
        a, b = name.split("|")
        on = boundary == scene.names.index(name)
        side = {(img, p, near): mean(m["L"], m["lines"], p, near)[on] for img, m in (("s", sheet), ("o", ours))
                for p in (a, b) for near in (False, True)}
        sa, sb, oa, ob = side["s", a, False], side["s", b, False], side["o", a, False], side["o", b, False]
        lined = dist_o[on] <= MATCH_PX
        known = ~(np.isnan(sa) | np.isnan(sb) | np.isnan(oa) | np.isnan(ob))
        hard = known & (np.abs(oa - ob) > SEAM_STEP_L) & ~lined & (np.abs(sa - sb) < SEAM_FLAT_L)
        light = np.zeros(on.sum(), bool)
        for p in (a, b):
            o_band, s_band = side["o", p, True], side["s", p, True]
            o_side, s_side = side["o", p, False], side["s", p, False]
            light |= (o_band - o_side > SEAM_LIGHT_L) & (s_band - s_side <= SEAM_LIGHT_L)
        rows = {}
        for key, flags in (("hardSeamPt", hard), ("lightSeamPt", light)):
            mask = np.zeros(on.shape, bool)
            mask[on] = flags
            rows[key] = r(longest_run(mask, k), 2)
        out[name] = rows
    return out


def resample(points, step):
    """An ordered polyline resampled every step along its length."""
    seg = np.hypot(*np.diff(points, axis=0).T)
    at = np.concatenate([[0], np.cumsum(seg)])
    if at[-1] < step:
        return points[:1]
    s = np.arange(0, at[-1], step)
    return np.stack([np.interp(s, at, points[:, 0]), np.interp(s, at, points[:, 1])], axis=1)


def fur_stats(pieces):
    """The plan's fur amplitude (f) over ordered edges in pt: the RMS of each edge's distance from itself smoothed
    over FUR_SIGMA_PT (along its normal), and how often it crosses that smoothed edge per 10 pt, a crossing counted
    once the edge is FUR_DEADBAND_PT out on the other side. Edges shorter than FUR_MIN_PT are left out; the ends,
    where the smoothing has nothing on one side, are trimmed by FUR_SIGMA_PT. A smoothed curve sags inside the
    curve itself (a 15 pt bend by half a point), which is the edge's shape, not its fur: the distance's own trend
    over FUR_SIGMA_PT is taken off, so a smooth balloon reads as smooth however round."""
    sigma = FUR_SIGMA_PT / FUR_STEP_PT
    trim = int(round(sigma))
    deviations, crossings, length = [], 0, 0.0
    for piece in pieces:
        p = resample(np.asarray(piece, dtype=np.float64), FUR_STEP_PT)
        if len(p) * FUR_STEP_PT < FUR_MIN_PT:
            continue
        smooth = np.stack([ndimage.gaussian_filter1d(p[:, i], sigma, mode="nearest") for i in (0, 1)], axis=1)
        tangent = np.gradient(smooth, axis=0)
        tangent /= np.maximum(np.hypot(*tangent.T), 1e-9)[:, None]
        normal = np.stack([-tangent[:, 1], tangent[:, 0]], axis=1)
        dev = ((p - smooth) * normal).sum(axis=1)
        dev = (dev - ndimage.gaussian_filter1d(dev, sigma, mode="nearest"))[trim:len(p) - trim]
        state = 0
        for value in dev:
            side = 1 if value > FUR_DEADBAND_PT else -1 if value < -FUR_DEADBAND_PT else 0
            if side and side != state:
                crossings += state != 0
                state = side
        deviations.append(dev)
        length += len(dev) * FUR_STEP_PT
    if not length:
        return None
    dev = np.concatenate(deviations)
    return {"rmsPt": r(np.sqrt((dev ** 2).mean())), "crossings10Pt": r(crossings / length * 10), "lengthPt": r(length, 1)}


def contour_runs(mask_or_level, inside, level=0.5, closed_merge=True):
    """The contours of an image at a level, cut into the runs whose points lie where inside(points) is True:
    ordered point arrays (rows, cols)."""
    runs = []
    for c in skmeasure.find_contours(mask_or_level, level):
        keep = inside(c)
        if not keep.any():
            continue
        # Runs of consecutive kept points; a closed contour's last run joins its first.
        cut = np.flatnonzero(np.diff(keep.astype(int)))
        bounds = np.concatenate([[0], cut + 1, [len(c)]])
        pieces = [c[a:b] for a, b in zip(bounds[:-1], bounds[1:]) if keep[a]]
        if closed_merge and len(pieces) > 1 and keep[0] and keep[-1] and np.allclose(c[0], c[-1]):
            pieces = [np.concatenate([pieces[-1], pieces[0]])] + pieces[1:-1]
        runs.extend(pieces)
    return runs


def rises(alpha, points, ppp):
    """The 10-90% rise of the alpha across its edge at each contour point (pt), along the alpha's gradient."""
    gy, gx = np.gradient(ndimage.gaussian_filter(alpha, 0.7))
    t = np.arange(-5, 5.001, 0.1)
    out = []
    for y, x in points:
        n = np.array([gy[int(round(y)), int(round(x))], gx[int(round(y)), int(round(x))]])
        size = np.hypot(*n)
        if size < 1e-4:
            continue
        n /= size
        profile = ndimage.map_coordinates(alpha, [y + t * n[0], x + t * n[1]], order=1)
        lo, hi = np.flatnonzero(profile >= 0.1), np.flatnonzero(profile >= 0.9)
        if len(lo) and len(hi):
            out.append((t[hi[0]] - t[lo[0]]) / ppp)
    return np.array(out)


class Fine:
    """The render at its own scale (the still's ppp): its colour over the card, its alpha without the ground shadow,
    each pixel's host, and each pixel's region on the crop's grid."""

    def __init__(self, scene):
        st, g = scene.still, scene.grid
        self.ppp = st.ppp
        rgb = st.premult + (1 - st.alpha[..., None]) * (scene.frame.card / 255)
        self.rgb = np.clip(np.round(rgb * 255), 0, 255).astype(np.uint8)
        hosts = [host(n, st.meta["parts"]) for n in st.names]
        self.host_names = sorted(set(hosts))
        index = np.array([self.host_names.index(h) for h in hosts] + [-1])
        self.hosts = index[st.part]
        self.alpha = np.where(self.hosts == self.host_names.index(GROUND), 0, st.alpha) if GROUND in self.host_names else st.alpha
        h, w = st.alpha.shape
        # Still pixel (i, j) covers [j, j + 1): its centre lands on grid column (j + 0.5 - root) / f + ground + 0.5 + shift.
        self.gx = lambda x: (x + 0.5 - st.root[0]) / g.f + g.ground[0] + 0.5 + scene.shift[0]
        self.gy = lambda y: (y + 0.5 - st.root[1]) / g.f + g.ground[1] + 0.5 + scene.shift[1]
        cols = np.clip(np.floor(self.gx(np.arange(w))).astype(int), 0, scene.band.shape[1] - 1)
        rows = np.clip(np.floor(self.gy(np.arange(h))).astype(int), 0, scene.band.shape[0] - 1)
        self.band = scene.band[rows[:, None], cols[None, :]]
        self.keep = scene.keep[rows[:, None], cols[None, :]]
        self.scene = scene

    def region_of(self, points):
        """The region index under each still point (rows, cols, pixel indices)."""
        b = self.scene.band
        i = np.clip(np.floor(self.gy(points[:, 0])).astype(int), 0, b.shape[0] - 1)
        j = np.clip(np.floor(self.gx(points[:, 1])).astype(int), 0, b.shape[1] - 1)
        return b[i, j]

    def to_pt(self, points):
        """Still pixel indices (rows, cols) to model points (x, y)."""
        root = self.scene.still.root
        return np.stack([(points[:, 1] + 0.5 - root[0]) / self.ppp, (points[:, 0] + 0.5 - root[1]) / self.ppp], axis=1)

    def top(self, name):
        """Of a region's two parts, the one whose edge shows: the drawn one against the card or the ground, else the
        one drawn later (draw order, still.json)."""
        a, b = name.split("|")
        if b in (OUTSIDE, GROUND):
            return a
        order = self.scene.meta.get("drawn", self.scene.still.names)
        z = {h: max((i for i, n in enumerate(order) if host(n, self.scene.meta["parts"]) == h), default=-1) for h in (a, b)}
        return a if z[a] >= z[b] else b


def line_widths(scene, ppp):
    """Each region's line width (pt): the lower quartile of its full width at half maximum, on the render
    area-sampled to ppp px per pt, the scale of the panel the sheet's width was read on, so both lines are blurred
    alike by their pixels."""
    st, g = scene.still, scene.grid
    step = st.ppp / ppp  # still px per sampled px
    h, w = int(st.alpha.shape[0] / step), int(st.alpha.shape[1] / step)
    layers = np.concatenate([st.alpha[..., None], st.premult], axis=2)
    wy, wx = match.area_weights(h, layers.shape[0], 0.0, step), match.area_weights(w, layers.shape[1], 0.0, step)
    sampled = np.moveaxis(np.tensordot(np.tensordot(wy, layers, axes=(1, 0)), wx, axes=(1, 1)), -1, 1)
    rgb = np.clip(np.round((sampled[..., 1:] + (1 - sampled[..., :1]) * (scene.frame.card / 255)) * 255), 0, 255).astype(np.uint8)
    # A sampled pixel's centre is still coordinate (i + 0.5) step, which lands on the grid as Fine maps it.
    cols = np.clip(np.floor(((np.arange(w) + 0.5) * step - st.root[0]) / g.f + g.ground[0] + 0.5 + scene.shift[0]).astype(int), 0, scene.band.shape[1] - 1)
    rows = np.clip(np.floor(((np.arange(h) + 0.5) * step - st.root[1]) / g.f + g.ground[1] + 0.5 + scene.shift[1]).astype(int), 0, scene.band.shape[0] - 1)
    band = scene.band[rows[:, None], cols[None, :]]
    lines = line_map(rgb, scene.tau, scene.keep[rows[:, None], cols[None, :]], radius=FINE_TOPHAT_PT * ppp)
    pts = np.argwhere(lines["skeleton"])
    out = {}
    if not len(pts):
        return out
    normals = orientation(lines["skeleton"])[tuple(pts.T)]
    where = band[tuple(pts.T)]
    for index, name in enumerate(scene.names):
        mine = where == index
        if name != LEFT_OUT and mine.sum() >= MIN_LINE_PX * ppp:
            found = widths(lines["tophat"], pts[mine].astype(float), normals[mine], reach=FINE_TOPHAT_PT * ppp * 1.5, step=0.25) / ppp
            out[name] = r(np.quantile(found, WIDTH_QUANTILE))
    return out


def fine_measures(scene, width_ppp=None):
    """The render-only measures in each region: the line's width (lower quartile, pt, at width_ppp), the fur
    amplitude of the edge that shows, and the alpha's rise across the outer edge."""
    fine = Fine(scene)
    ppp = fine.ppp
    out = {name: {} for name in scene.names if name != LEFT_OUT}
    for name, width in line_widths(scene, width_ppp or ppp).items():
        out[name]["widthPt"] = width
    footprints = {}
    for index, name in enumerate(scene.names):
        if name == LEFT_OUT or not any(matches_any(name, p) for p in FUR_CLASSES.values()):
            continue
        top = fine.top(name)
        if top not in footprints:
            footprints[top] = ndimage.gaussian_filter((fine.hosts == fine.host_names.index(top)).astype(np.float64), 0.6)
        runs = contour_runs(footprints[top], lambda c, i=index: fine.region_of(c) == i)
        stats = fur_stats([fine.to_pt(run) for run in runs])
        if stats:
            out[name].update({"furRmsPt": stats["rmsPt"], "furCrossings10Pt": stats["crossings10Pt"], "furLengthPt": stats["lengthPt"]})
    contours = skmeasure.find_contours(fine.alpha, 0.5)
    if contours:
        points = np.concatenate(contours)[::2]
        where = fine.region_of(points)
        for index, name in enumerate(scene.names):
            if name != LEFT_OUT and name.endswith("|" + OUTSIDE) and (where == index).sum() >= 4:
                out[name]["risePt"] = r(np.median(rises(fine.alpha, points[where == index], ppp)))
    return out


def region_class(name, classes):
    return next((c for c, patterns in classes.items() if matches_any(name, patterns)), None)


def base(name):
    """The region an across region's lines lie in."""
    return name[:-len(ACROSS) - 1] if name.endswith(" " + ACROSS) else name


def thresholds_for(scene, names, calibration):
    """Each region's threshold for every measure: the calibrated region's own, else (a region the calibration's
    build did not have) the loosest the view's calibrated regions hold, marked uncalibrated. The render-only
    measures hold a whole region, never its lines across."""
    view = calibration["views"].get(scene.view, {"regions": {}})["regions"]
    panels, crisp = calibration["panels"], calibration["crisp"]
    out = {}
    for name in names:
        rows = {}
        for measure, (sign, where) in MEASURES.items():
            if where != "grid":
                continue
            if name in view and view[name].get(measure, {}).get("threshold") is not None:
                rows[measure] = view[name][measure]["threshold"]
            else:
                held = [v[measure]["threshold"] for v in view.values() if v.get(measure, {}).get("threshold") is not None]
                rows[measure] = (min(held) if sign > 0 else max(held)) if held else None
        whole = "|" in name and base(name) == name
        width = region_class(name, WIDTH_CLASSES)
        rows["widthPt"] = r(panels["widthPt"][width] + WIDTH_MARGIN_PT) if width in panels["widthPt"] and whole else None
        fur = region_class(name, FUR_CLASSES)
        if fur in panels["fur"] and whole:
            rows["furRmsPt"] = r(FUR_SHARE * panels["fur"][fur]["rmsPt"])
            rows["furCrossings10Pt"] = r(FUR_SHARE * panels["fur"][fur]["crossings10Pt"])
        rows["risePt"] = crisp["thresholdPt"] if whole and name.endswith("|" + OUTSIDE) else None
        out[name] = {"thresholds": rows, "calibrated": name in view}
    return out


def judge(scene, grid_rows, fine_rows, calibration):
    """Every region's measures against its thresholds: {region: {what, contact, calibrated, measures, pass}}. A
    measure with no value (too little line to measure) or no threshold is reported and never judged; tone in a .R
    facing is judged on contact edges only."""
    names = list(grid_rows)
    held = thresholds_for(scene, names, calibration)
    mirrored = scene.frame.mirrored
    out = {}
    for name in names:
        values = {**grid_rows.get(name, {}), **fine_rows.get(name, {})}
        rows = {}
        for measure, (sign, _) in MEASURES.items():
            value, threshold = values.get(measure), held[name]["thresholds"].get(measure)
            if measure == "toneDelta" and mirrored and base(name) not in scene.contact:
                threshold = None
            row = {"value": value, "threshold": threshold}
            if value is not None and threshold is not None:
                if measure in TWO_SIDED:
                    row["pass"] = abs(value) <= threshold
                else:
                    row["pass"] = value >= threshold if sign > 0 else value <= threshold
            rows[measure] = row
        extra = {k: values[k] for k in ("shiftPx", "sheetPx", "oursPx", "toneAt", "inkAt", "widthCvSheet", "widthCvOurs", "furLengthPt") if k in values}
        failed = [m for m, row in rows.items() if row.get("pass") is False]
        out[name] = {"what": what(name), "contact": base(name) in scene.contact, "calibrated": held[name]["calibrated"],
                     "measures": rows, "detail": extra, "failed": failed, "pass": not failed}
    return out


def badness(measure, row):
    """How far a failed measure is past its threshold, as a ratio, to name the worst."""
    sign = MEASURES[measure][0]
    value, threshold = (abs(row["value"]), row["threshold"]) if measure in TWO_SIDED else (row["value"], row["threshold"])
    if sign > 0:
        return threshold / max(value, 1e-3)
    return value / max(threshold, 1e-3)


def worst(regions):
    found = [(badness(m, row["measures"][m]), name, m) for name, row in regions.items() for m in row["failed"]]
    if not found:
        return None
    _, name, m = max(found)
    row = regions[name]["measures"][m]
    return {"region": name, "measure": m, "value": row["value"], "threshold": row["threshold"]}


def summary(result):
    """The one line the look loop prints."""
    regions = result["regions"]
    failed = result["failed"]
    if not failed:
        return f"lines pass ({len(regions)} regions)"
    w = result["worst"]
    return (f"lines FAIL {len(failed)} of {len(regions)} regions: {', '.join(failed[:4])}{f' and {len(failed) - 4} more' if len(failed) > 4 else ''}"
            f"; worst {w['region']} {w['measure']} {w['value']} (threshold {w['threshold']})")


def check(species, still_dir, calibration_path=None, shift=None, fine=True):
    """The line check on one still. Returns the result and what the picture needs. fine=False leaves out the
    render-only measures, for the sheet's own still (linecal.sheet_still), which carries the crop's resolution."""
    started = time.perf_counter()
    path = Path(calibration_path) if calibration_path else Path(__file__).resolve().parent / "lines" / f"{species}.json"
    calibration = json.loads(path.read_text())
    scene = Scene(species, still_dir, calibration, shift)
    sheet, ours = scene.sheet_map(), scene.ours_map()
    grid_rows = compare(scene, sheet, ours)
    fine_rows = fine_measures(scene, calibration["panels"].get("widthPpp")) if fine else {}
    regions = judge(scene, grid_rows, fine_rows, calibration)
    failed = [name for name, row in regions.items() if not row["pass"]]
    result = {"species": species, "view": scene.view, "still": {k: scene.meta.get(k) for k in ("still", "clip", "views", "ppp", "sizePx", "rootPx")},
              "crop": scene.frame.rec["crop"], "mirroredFrom": scene.frame.source if scene.frame.mirrored else None,
              "calibration": match.repo_path(path), "tau": scene.tau, "bestFitShiftPx": [r(s, 2) for s in scene.shift],
              "regions": regions, "failed": failed, "worst": worst(regions), "advisory": True, "pass": not failed}
    result["summary"] = summary(result)
    result["seconds"] = r(time.perf_counter() - started, 2)
    return result, {"scene": scene, "sheet": sheet, "ours": ours, "rows": grid_rows}


def picture(result, parts, path, zoom=3):
    """sheet | ours | the line maps (sheet blue, ours red, both black; ours moved as each region matched it) | the key:
    each failing region's band tinted and numbered on the maps, and named in the key with its worst measure and
    threshold. In the facing's own orientation."""
    scene, sheet, ours, rows = parts["scene"], parts["sheet"], parts["ours"], parts["rows"]
    band = scene.band
    maps = np.full(band.shape + (3,), 255, np.uint8)
    maps[band >= 0] = (238, 238, 238)
    labels = []
    for index, name in enumerate(scene.names):
        if name == LEFT_OUT or name not in rows:
            continue
        inside = band == index
        # A region and its lines across it share a band: it fails when either does.
        failed = [(badness(m, result["regions"][n]["measures"][m]), n, m) for n in (name, f"{name} {ACROSS}")
                  if n in result["regions"] for m in result["regions"][n]["failed"]]
        if failed:
            maps[inside] = (255, 214, 214) if "|" in name else (255, 236, 236)
        dx, dy = rows[name]["shiftPx"]
        moved = match.shifted(ours["skeleton"], dx, dy) & inside
        drawn = sheet["skeleton"] & inside
        maps[drawn & ~moved] = (30, 90, 230)
        maps[moved & ~drawn] = (225, 30, 40)
        maps[moved & drawn] = (20, 20, 20)
        if failed:
            ys, xs = np.nonzero(scene.boundary == index) if "|" in name else np.nonzero(inside)
            j = len(ys) // 2
            _, n, m = max(failed)
            row = result["regions"][n]["measures"][m]
            labels.append((xs[j], ys[j], f"{n} {m} {row['value']} ({row['threshold']})"))
    used = (band >= 0) | (scene.render.alpha > 0.05)
    ys, xs = np.nonzero(used)
    view = (slice(max(ys.min() - 2, 0), ys.max() + 3), slice(max(xs.min() - 2, 0), xs.max() + 3))
    tiles = [match.upscale(t[view], zoom) for t in (scene.crop, scene.render.rgb, maps)]
    width = tiles[0].shape[1]
    if scene.frame.mirrored:
        tiles = [t[:, ::-1] for t in tiles]
    gap, line = 6, 13
    labels.sort(key=lambda l: (l[1], l[0]))  # numbered top to bottom
    rows_per = max((tiles[0].shape[0] - 24) // line, 1)
    key = np.full((tiles[0].shape[0], 330 * (1 + (len(labels) - 1) // rows_per) if labels else 330, 3), 255, np.uint8)
    body = np.concatenate([np.pad(t, ((0, 0), (0, gap), (0, 0)), constant_values=255) for t in tiles] + [key], axis=1)
    image = Image.fromarray(body)
    draw = ImageDraw.Draw(image)
    left = 3 * (width + gap)
    for i, (x, y, text) in enumerate(labels, 1):
        X = (x - view[1].start + 0.5) * zoom
        X = width - X if scene.frame.mirrored else X
        X, Y = 2 * (width + gap) + X, (y - view[0].start) * zoom
        draw.rectangle((X - 1, Y - 6, X + 6 * len(str(i)) + 2, Y + 6), fill=(170, 0, 40))
        draw.text((X + 1, Y - 5), str(i), fill=(255, 255, 255))
        column, slot = divmod(i - 1, rows_per)
        match.label(draw, (left + 4 + 330 * column, 22 + slot * line), f"{i} {text}", (170, 0, 40))
    for i, title in enumerate(("sheet", "render", "lines: sheet blue, ours red, both black; failing regions pink",
                               "failing regions: worst measure (threshold)")):
        match.label(draw, (i * (width + gap) + 4, 4), title, (40, 40, 40))
    strip = Image.new("RGB", (image.width, 22), "white")
    ImageDraw.Draw(strip).text((6, 5), f"{result['view']}: {result['summary']}", fill=(0, 120, 40) if result["pass"] else (200, 0, 30))
    full = Image.new("RGB", (image.width, image.height + strip.height), "white")
    full.paste(strip, (0, 0))
    full.paste(image, (0, strip.height))
    sheets.save_png(path, np.asarray(full))


def main(argv):
    parser = argparse.ArgumentParser(usage=__doc__)
    parser.add_argument("species")
    parser.add_argument("--still", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--calibration")
    args = parser.parse_args(argv)
    out = Path(args.out)
    written = out / "lines.json"
    try:
        # An old verdict never stays beside a run that errs.
        written.unlink(missing_ok=True)
        result, parts = check(args.species, args.still, args.calibration)
        out.mkdir(parents=True, exist_ok=True)
        picture(result, parts, out / "lines.png")
        # Written last: a lines.json is always a whole run's.
        sheets.write_json(written, result)
    except Exception as error:  # any error is exit 2, never a failed region's 1
        traceback.print_exc()
        print(f"linematch: {type(error).__name__}: {error}", file=sys.stderr)
        written.unlink(missing_ok=True)
        return 2
    print(f"linematch: {result['view']}: {result['summary']}; written to {out}")
    return 0 if result["pass"] else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
