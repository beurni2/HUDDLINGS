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
no lines.json. About two seconds a view.

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

The regions are the still's own, so ours is read in place and the sheet moved:
each piece of a region (its band's connected parts) by the whole-pixel shift,
within SHIFT_PX, that lays the two images' lines round it best. A line is a
dark valley: a black top-hat on L* (radius TOPHAT_PX) above the sheet's tau
(where its skeleton's length plateaus), carried on above tau / 2, in warm hues.
One image's line is held to the other's at a lower level, so a line just over
tau in one and just under it in the other is the same line: the sheet's strong
line (tau) is drawn where ours draws any line (FAINT of tau), and ours' dark mark
(MARK_TAU) is the sheet's where the sheet draws a weak line (tau / 2) at least
1 / MARK_DARKER as dark. Measured on the crop's grid:
(a) recall: the share of the sheet's strong line ours draws;
(b) precision: the share of ours' dark line the sheet draws, and the longest of
    ours' dark marks the sheet does not (a tick, a hook, a cuff), in pt;
(c) gap: the longest run of the sheet's line ours does not draw, in pt; and the
    longest break, where ours draws it with under WEAK_SHARE of its own level of
    the sheet's ink across it (a taper, a span's end in mid-line);
(e) tone: the line's core L* along the sheet's line (L* averaged over
    TONE_SIGMA_PX in warm hues, its darkest within MATCH_PX), ours read at the
    same places, ours less the sheet's over windows of TONE_WINDOW_PX each way;
    in a .R facing on contact edges only, where one part lies over another (the
    light rule lightens the outer edge), and there never more than
    CONTACT_LIGHTER_L lighter (the plan's 10 L*);
    ink: the line's ink across it (the warm top-hat on the averaged L*, summed
    across) along the sheet's line over the same windows, the worst log of ours
    over the sheet's either way; and the region's ink, all the warm ink each
    draws in the region, however faint;
(h) seams: the longest run of a boundary inside the silhouette that ours steps
    by more than SEAM_STEP_L with no line where the sheet steps by less than
    SEAM_FLAT_L, or that ours draws lighter than both sides by more than
    SEAM_LIGHT_L where the sheet does not.
Measured on the render alone at its own 3 px/pt, against the sheet's larger
panels (the hero, the stubby paws) and a reference ribbon:
(d) weight: the line's width at the hero's scale, its lower quartile held under
    the hero's width for its class plus WIDTH_MARGIN_PT (a line uniformly
    heavier fails), the median over a sole's middle SOLE_MIDDLE the same (the
    plan's ground term), and its variation, at least WIDTH_CV_SHARE of the
    hero's (the crops cannot resolve a width's variation);
(f) fur: how far the edge leaves itself smoothed over FUR_SIGMA_PT, less that
    distance's own trend (a smooth curve's sag is its shape, not its fur), as
    an RMS and as crossings per 10 pt, held to FUR_SHARE of the gentlest the
    panels draw above their pixels' staircase on the ears, cheeks, chin, tail,
    paw soles and haunch bottoms;
(g) crispness: the 10-90% rise of the alpha across the outer edge from the
    plateau either side, held to the crisp reference ribbon's.
The thresholds per region are the sheet's own spread against perturbed copies
of itself (linecal.py), never tuned to a render, and never finer than a
measure's resolution; a share is never held finer than two pixels of its line,
nor at all under MIN_SHARE_PX. A region the calibration's build did not have is
held to its view's median and counted in the summary, as is a calibration whose
regions the still has moved. look.ts runs it advisory: its verdict never
changes look's exit code until the lead makes it gating."""
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
import copy  # noqa: E402
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
SHIFT_PX = 4  # crop px: how far a piece of a region may be moved to match: the plan's scale of 2% and turn of 1 degree
# together move the crop's ends by 3 to 4 px about its middle, and a part's place is the sheet match's to judge
TONE_WINDOW_PX = 6  # crop px either way along a line: the stretch whose tone is compared, about 10 pt
MIN_LINE_PX = 4  # skeleton px: fewer and a region's recall or precision is not even reported
MIN_WIDTH_PX = 8  # skeleton px away from junctions: fewer and a line's width has no spread to read
TONE_SIGMA_PX = 1.0  # crop px: the line's tone and its ink across it are read on L* averaged this much (tone_map, line_map)
MIN_TONE_PX = 8  # the sheet's line px (about 6 pt) a region and a window hold before its ink and tone are read (half across)
SHIFT_CAP_PX = 3  # crop px: a skeleton pixel farther than this from the other's counts as this far, choosing a shift
INK_REACH_PX = 3  # crop px each way across a line its ink is summed over (the sheet's lines are 2 to 3 px wide)
WEAK_SHARE = 0.5  # a break: ours draws a stretch of the sheet's line with under this share of its level of ink
# Of tau: the darkness a mark of ours reaches before it counts as a mark the sheet may not draw. A JPEG at the plan's
# quality 70 draws ghosts of the crops' lines 2 to 4 px long at 1 to 1.6 tau beside them (DECISIONS 251).
MARK_TAU = 2.0
MARK_DARKER = 2.0  # ours' dark mark is the sheet's line only where the sheet's is at least half as dark
TONE_RESOLUTION_L = 3.0  # L*: no tone threshold is finer (the plan's seams call a step under 3 L* flat)
CONTACT_LIGHTER_L = 10.0  # L*: the plan's (e): on a contact edge ours is never more than this lighter than the sheet
SHARE_RESOLUTION_PX = 2  # a share is never held finer than this many pixels of its line (the plan's 1.5 pt)
MIN_SHARE_PX = 10  # a share is judged only on at least this many pixels (about 8 pt of line)
INK_RESOLUTION_LOG = float(np.log(4 / 3))  # no ink threshold is finer: the crops resolve no width under 0.4 pt (the plan, C) of a 1.2 pt line
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
WIDTH_CV_SHARE = 0.5  # the plan's (d): ours' width varies at least half as much as the sheet's
SOLE_MIDDLE = 0.6  # the share of a sole's length in its middle, where the paw presses (the plan's ground term, G6)
RISE_REACH_PX = 5.0  # still px either side of an edge its alpha's rise is read over
RISE_STEP = 0.5  # the least step in alpha across an edge for its rise to be read
MIN_RISE_POINTS = 12  # profiles (every other point of the alpha's contour: about 5 pt of edge) before a region's rise is judged
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
# Each measure: its direction (+1 higher is better) and where it is measured (the crop's grid, or the render's own scale).
MEASURES = {"recall": (1, "grid"), "precision": (1, "grid"), "gapPt": (-1, "grid"), "weakPt": (-1, "grid"), "extraPt": (-1, "grid"),
            "toneDelta": (-1, "grid"), "inkLog": (-1, "grid"), "regionInkLog": (-1, "grid"), "hardSeamPt": (-1, "grid"), "lightSeamPt": (-1, "grid"),
            "widthPt": (-1, "fine"), "soleMiddlePt": (-1, "fine"), "widthCv": (1, "fine"), "furRmsPt": (1, "fine"), "furCrossings10Pt": (1, "fine"),
            "risePt": (-1, "fine")}
TWO_SIDED = ("toneDelta", "inkLog", "regionInkLog")  # held on their size either way


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
    ink = np.where(warm, np.maximum(tophat, 0), 0)
    # The skeleton where its line reaches tau (the skeleton may lie a pixel off the line's darkest), and any weak line
    # (half tau, connected to a strong one or not): one image's strong line is held to the other's weak or faint one,
    # so a line near tau in one and a little under it in the other is never read as missing or extra.
    # The same ink on L* averaged over TONE_SIGMA_PX (a top-hat as wide as the averaged line), read across a line in
    # pairs: a halving or a blur spreads a thin line beside a tan field into a step the narrow top-hat no longer sees.
    soft_L = ndimage.gaussian_filter(L, TONE_SIGMA_PX)
    soft = np.where((lab[..., 1] > WARM_A) & (lab[..., 2] > WARM_B / 2) & keep,
                    np.maximum(ndimage.grey_closing(soft_L, footprint=disk(radius + 1)) - soft_L, 0), 0)
    peak = ndimage.grey_dilation(ink, size=3)
    strong = skeleton & (peak > tau)
    dark = skeleton & (peak > MARK_TAU * tau)
    weak = (tophat > tau / 2) & warm
    # Any line at all, however faint: whether a render draws a line where the sheet does (a blurred or JPEG-softened
    # line fades; one deleted, or tapered to nothing, is gone). Its hue may be paler too, by half the warm gate's b*:
    # a thin outline blurred into the card loses its chroma before its darkness (never so far as the collar's blue).
    faint = (tophat > FAINT * tau) & (lab[..., 1] > WARM_A) & (lab[..., 2] > WARM_B / 2) & keep
    # Where a line runs alone: away from every junction (three or more neighbours) by JUNCTION_PX.
    neighbours = ndimage.convolve(skeleton.astype(np.int16), np.ones((3, 3), np.int16), mode="constant") - 1
    plain = skeleton & ~ndimage.binary_dilation(skeleton & (neighbours >= 3), disk(JUNCTION_PX))
    return {"lines": lines, "skeleton": skeleton, "strong": strong, "dark": dark, "plain": plain, "weak": weak, "faint": faint, "ink": ink, "soft": soft,
            "tophat": tophat, "L": L, "warm": warm}


def tone_map(lines):
    """Each pixel's line tone: the darkest warm L* within MATCH_PX, on L* averaged over the warm pixels within
    TONE_SIGMA_PX (a Gaussian), so a line a JPEG, a halving or a blur softens by a pixel reads as the same line, and the
    collar's blue or the nose never reads as a line's tone. NaN where no warm pixel is near."""
    warm = lines["warm"].astype(np.float64)
    share = ndimage.gaussian_filter(warm, TONE_SIGMA_PX)
    mean = ndimage.gaussian_filter(lines["L"] * warm, TONE_SIGMA_PX) / np.maximum(share, 1e-9)
    core = ndimage.grey_erosion(np.where(share > 0.25, mean, 1000.0), footprint=disk(MATCH_PX))
    return np.where(core < 1000.0, core, np.nan)


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


def widths(tophat, points, normals, reach=4.0, step=0.25, peaks=False):
    """The full width at half maximum of the top-hat across the line at each point (px), its peak found within a
    quarter of the reach (and with peaks, each peak's height)."""
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
    return (out, profile[np.arange(len(points)), peak_at]) if peaks else out


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
        crop = grid.pad(frame.crop, 0).astype(np.uint8)
        crop[~grid.pad(np.ones(frame.sil.shape, bool), False)] = frame.card
        self.crop = crop
        self.place(hosts_map(self.render, seen))
        crops = (calibration or {}).get("crops", {})
        self.tau = crops[frame.source]["tau"] if frame.source in crops else plateau_tau(crop, self.keep)[0]

    def place(self, hosts):
        """The regions from a hosts map (the still's own, or linecal's moved with a perturbed copy of the crop)."""
        self.hosts = hosts
        self.names, self.boundary, self.band = regions(hosts)
        self.keep = face_keep(self.frame, self.grid, hosts) & (self.band >= 0)
        self.contact = {n for n in self.names if "|" in n and n != LEFT_OUT and OUTSIDE not in n.split("|") and GROUND not in n.split("|")}

    def rehosted(self, hosts):
        """The scene with another hosts map: its regions, where lines are read and which edges are contact edges."""
        other = copy.copy(self)
        other.place(hosts)
        return other

    def sheet_map(self):
        return line_map(self.crop, self.tau, self.keep)

    def ours_map(self, rgb=None):
        return line_map(self.render.rgb if rgb is None else rgb, self.tau, self.keep)


def across_lines(line_normals, edge_normals, nearest, pts):
    """Which skeleton pixels (pts, each with the boundary pixel nearest it) run across their region's boundary rather
    than along it (their direction more than 45 degrees from the boundary's nearest stretch): toe lines and ticks off a
    sole, a lock's notch, a tuft's strokes."""
    if not len(pts):
        return np.zeros(0, bool)
    return np.abs((line_normals[tuple(pts.T)] * edge_normals[tuple(nearest.T)]).sum(-1)) < np.cos(np.radians(45))


def measure_lines(scene, sheet, ours, s_pts, o_pts, hit_s, hit_o, d_s, maps, least=MIN_LINE_PX, tone_at=None, marks=None):
    """The measures of one set of lines: recall, precision, the longest gap and extra run, the longest break, the
    worst local ink and tone, from the sheet's and ours' skeleton pixels in the region and which of each matched the
    other's line; d_s is each sheet pixel's shift (rows, cols: the sheet's p lies beside ours' p - d). The break, the
    ink and the tone are read in pairs: ours where the sheet draws its line, so the two are compared on the same
    stretch of line, whatever either's skeleton does at a junction or a faint end. tone_at (a mask on s_pts) is where
    the tone is read; least, the fewest of the sheet's line pixels a window holds before its ink or tone is read;
    marks, ours' dark pixels the sheet does not draw (compare's), else ours' unmatched dark skeleton pixels."""
    h, w = scene.band.shape
    k = scene.grid.k
    # Recall and the gap count the sheet's strong line; precision and the extra marks ours' dark line, a mark as dark as
    # the ticks, hooks, cuffs and dashes the plan names (line_map, MARK_TAU).
    s_on, o_on = sheet["strong"][tuple(s_pts.T)], ours["dark"][tuple(o_pts.T)]
    row = {"sheetPx": int(s_on.sum()), "oursPx": int(o_on.sum())}
    row["recall"] = r(hit_s[s_on].mean()) if s_on.sum() >= MIN_LINE_PX else None
    row["precision"] = r(hit_o[o_on].mean()) if o_on.sum() >= MIN_LINE_PX else None
    missing = np.zeros((h, w), bool)
    missing[tuple(s_pts[s_on & ~hit_s].T)] = True
    row["gapPt"] = r(longest_run(missing, k), 2)
    if marks is None:
        marks = np.zeros((h, w), bool)
        marks[tuple(o_pts[o_on & ~hit_o].T)] = True
    row["extraPt"] = r(longest_run(marks, k), 2)
    row["toneDelta"] = row["weakPt"] = row["inkLog"] = None
    if len(s_pts) < least:
        return row
    at = np.clip(s_pts - d_s, 0, [h - 1, w - 1])
    normals = maps["normals"][tuple(s_pts.T)]
    # Ink across the line, on L* averaged over TONE_SIGMA_PX in both images alike (line_map's soft ink), so a line a
    # halving or a blur spreads past the top-hat still counts whole.
    ink_s = ink_across(sheet["soft"], s_pts.astype(float), normals)
    ink_o = ink_across(ours["soft"], at.astype(float), normals)
    # (c') a break is local: against ours' own level along the region (its median share of the sheet's ink, no lower
    # than WEAK_SHARE and no higher than 1), so a line a blur thins all along is not broken anywhere, and a line paler
    # or heavier all along is ink's to judge.
    floor = scene.tau
    share = (ink_o + floor) / (ink_s + floor)
    level = float(np.clip(np.median(share[s_on]), WEAK_SHARE, 1.0)) if s_on.any() else 1.0
    weak = np.zeros((h, w), bool)
    weak[tuple(s_pts[s_on & (share < WEAK_SHARE * level)].T)] = True
    row["weakPt"] = r(longest_run(weak, k), 2)
    # (e) ink: the line's ink summed along the sheet's line over windows of TONE_WINDOW_PX, ours read at the same
    # places: the worst log of ours over the sheet's either way.
    row["inkLog"], row["inkAt"] = local_ink(s_pts, ink_s, ink_o, scene, least)
    # (e) tone: the line's core L* (tone_map) along the sheet's line, ours read at the same places.
    keep = np.ones(len(s_pts), bool) if tone_at is None else tone_at
    if keep.sum() >= least:
        core_s = maps["core_s"][tuple(s_pts[keep].T)]
        core_o = maps["core_o"][tuple(at[keep].T)]
        row["toneDelta"], row["toneAt"] = local_tone(s_pts[keep], core_s, core_o, scene, least)
    return row


SHIFTS = np.array([(dx, dy) for dy in range(-SHIFT_PX, SHIFT_PX + 1) for dx in range(-SHIFT_PX, SHIFT_PX + 1)])


def region_shift(s_near, o_near, near_s, near_o):
    """The whole-pixel shift d (within SHIFT_PX) that lays the sheet's lines on ours' round a piece of a region (ours'
    pixel q beside the sheet's q + d): the least mean distance (capped at SHIFT_CAP_PX) from each skeleton pixel to
    the other's skeleton, over the lines of each image near the piece (an empty side is left out, never scored), the
    smaller shift on a tie. The lines near the piece are a fixed set, so no shift is chosen for what it moves out of
    the region."""
    h, w = near_s.shape
    cost, sides = np.zeros(len(SHIFTS)), 0
    for pts, near, sign in ((s_near, near_o, -1), (o_near, near_s, 1)):
        if len(pts):
            ys = np.clip(pts[None, :, 0] + sign * SHIFTS[:, None, 1], 0, h - 1)
            xs = np.clip(pts[None, :, 1] + sign * SHIFTS[:, None, 0], 0, w - 1)
            cost += np.minimum(near[ys, xs], SHIFT_CAP_PX).mean(axis=1)
            sides += 1
    if not sides:
        return 0, 0
    best = min(range(len(SHIFTS)), key=lambda i: (round(float(cost[i] / sides), 9), abs(SHIFTS[i]).sum()))
    return int(SHIFTS[best][0]), int(SHIFTS[best][1])


def compare(scene, sheet, ours):
    """Every measure on the crop's grid in each region, ours (line_map's) against the sheet's. The regions are the
    still's own (its ID pass), so ours is read in place and the sheet moved: each piece of a region (its band's
    connected parts: a head's outline runs round both cheeks) by the whole-pixel shift d that lays its lines best on
    ours' (region_shift), ours' pixel q read beside the sheet's q + d. Each boundary's lines that run across it are also
    measured alone, as "<region> across": a toe line read as a short dark tick hides among the sole's own line. Returns
    {region: measures}."""
    band = scene.band
    h, w = band.shape
    # A strong skeleton pixel matches when the other's line (not only its skeleton) is within MATCH_PX: the sheet's
    # needs any line of ours, however faint (a render has no JPEG noise to read); ours needs one of the sheet's weak
    # lines (its faint pixels are JPEG noise too).
    dist_s = ndimage.distance_transform_edt(~sheet["weak"])
    dist_o = ndimage.distance_transform_edt(~ours["faint"])
    near_s = ndimage.distance_transform_edt(~sheet["skeleton"])
    near_o = ndimage.distance_transform_edt(~ours["skeleton"])
    edge = scene.boundary >= 0
    edge_distance, nearest = ndimage.distance_transform_edt(~edge, return_indices=True)
    nearest = np.stack(nearest, -1)
    edge_normals = orientation(edge)
    maps = {"normals": orientation(sheet["skeleton"]), "core_s": tone_map(sheet), "core_o": tone_map(ours)}
    line_o = orientation(ours["skeleton"])
    sheet_peak = ndimage.grey_dilation(sheet["ink"], footprint=disk(MATCH_PX + 1))
    sheet_reach = ndimage.grey_dilation(sheet["ink"], footprint=disk(SHIFT_PX))
    ours_peak = ndimage.grey_dilation(ours["ink"], size=3)
    dark_px = ours["ink"] > MARK_TAU * scene.tau
    s_all, o_all = np.argwhere(sheet["skeleton"]), np.argwhere(ours["skeleton"])
    o_band = band[tuple(o_all.T)]
    out, shifts = {}, {}
    for index, name in enumerate(scene.names):
        if name == LEFT_OUT:
            continue
        inside = band == index
        labels, count = ndimage.label(inside, structure=np.ones((3, 3)))
        o_pts = o_all[o_band == index]
        o_piece = labels[tuple(o_pts.T)]
        s_parts, d_parts, d_o, piece_shifts = [], [], np.zeros((len(o_pts), 2), int), []
        taken = np.zeros(len(s_all), bool)
        reach = int(np.ceil(SHIFT_PX + MATCH_PX))
        for piece, box in enumerate(ndimage.find_objects(labels), start=1):
            mine = labels == piece
            # The lines of either image within SHIFT_PX + MATCH_PX of the piece, read in the piece's box.
            y0, x0 = max(box[0].start - reach, 0), max(box[1].start - reach, 0)
            y1, x1 = min(box[0].stop + reach, h), min(box[1].stop + reach, w)
            around = np.zeros((h, w), bool)
            around[y0:y1, x0:x1] = ndimage.binary_dilation(mine[y0:y1, x0:x1], disk(SHIFT_PX + MATCH_PX))
            dx, dy = region_shift(s_all[around[tuple(s_all.T)]], o_all[around[tuple(o_all.T)]], near_s, near_o)
            piece_shifts.append([dx, dy, int(mine.sum())])
            # The sheet's pixels whose place in ours (p - d) lies in this piece; ours' in the piece in place.
            back = s_all - [dy, dx]
            valid = (back[:, 0] >= 0) & (back[:, 0] < h) & (back[:, 1] >= 0) & (back[:, 1] < w) & ~taken
            pick = np.zeros(len(s_all), bool)
            pick[valid] = mine[tuple(back[valid].T)]
            taken |= pick
            s_parts.append(s_all[pick])
            d_parts.append(np.tile([dy, dx], (int(pick.sum()), 1)))
            d_o[o_piece == piece] = [dy, dx]
        shifts[name] = (labels, piece_shifts)
        s_pts = np.concatenate(s_parts) if s_parts else s_all[:0]
        d_s = np.concatenate(d_parts) if d_parts else np.zeros((0, 2), int)
        at = np.clip(s_pts - d_s, 0, [h - 1, w - 1])
        hit_s = dist_o[tuple(at.T)] <= MATCH_PX
        moved = np.clip(o_pts + d_o, 0, [h - 1, w - 1])
        # Ours' mark matches the sheet's line only where that is at least 1 / MARK_DARKER as dark: a dark tick on a
        # faint line is a mark the sheet does not draw.
        hit_o = (dist_s[tuple(moved.T)] <= MATCH_PX) & (MARK_DARKER * sheet_peak[tuple(moved.T)] >= ours_peak[tuple(o_pts.T)])
        largest = max(piece_shifts, key=lambda p: p[2]) if piece_shifts else [0, 0, 0]
        # Ours' dark marks the sheet does not draw, whole (not only their skeleton, so a dot as short as it is wide
        # still has its length): ours' dark pixels in the region darker than MARK_DARKER times the sheet's line there
        # (within MATCH_PX + 1: a dark tick on a faint line), or with no line of the sheet's within MATCH_PX and none
        # as dark within SHIFT_PX (a mark where the sheet draws nothing; a line a pixel or two from where a turn
        # leaves the sheet's is the same line, and the gap and the recall judge its place).
        marks = np.zeros((h, w), bool)
        for piece, (dx, dy, _) in enumerate(piece_shifts, start=1):
            q = np.argwhere(dark_px & (labels == piece))
            moved_q = np.clip(q + [dy, dx], 0, [h - 1, w - 1])
            ink_q = ours["ink"][tuple(q.T)]
            unmatched = ((MARK_DARKER * sheet_peak[tuple(moved_q.T)] < ink_q)
                         | ((dist_s[tuple(moved_q.T)] > MATCH_PX) & (MARK_DARKER * sheet_reach[tuple(moved_q.T)] < ink_q)))
            marks[tuple(q[unmatched].T)] = True
        # (e) the region's ink: all the warm ink each image draws in the region (the sheet's moved by each piece's
        # shift), however faint: strokes under tau, as the chin's scallops over the collar are in the crops, count.
        ink_o = sum(float(ours["soft"][labels == piece].sum()) for piece in range(1, count + 1))
        ink_s = sum(float(match.shifted(sheet["soft"], -dx, -dy)[labels == piece].sum()) for piece, (dx, dy, _) in enumerate(piece_shifts, start=1))
        floor = INK_FLOOR * scene.tau
        row = {"shiftPx": largest[:2], "piecesShiftPx": [p[:2] for p in piece_shifts],
               **measure_lines(scene, sheet, ours, s_pts, o_pts, hit_s, hit_o, d_s, maps, MIN_TONE_PX, marks=marks),
               "regionInkLog": r(np.log((ink_o + floor) / (ink_s + floor)))}
        out[name] = row
        if "|" in name:
            s_x = across_lines(maps["normals"], edge_normals, nearest[tuple(at.T)], s_pts)
            o_x = across_lines(line_o, edge_normals, nearest[tuple(o_pts.T)], o_pts)
            # A line across the boundary is toned on its own pixels clear of the edge's line: a toe line drawn as a
            # dark tick is darker there, where the sole's own line no longer darkens its neighbours.
            clear = edge_distance[tuple(at[s_x].T)] >= ACROSS_OFF_PX
            sub = measure_lines(scene, sheet, ours, s_pts[s_x], o_pts[o_x], hit_s[s_x], hit_o[o_x], d_s[s_x], maps,
                                MIN_TONE_PX // 2, tone_at=clear)
            out[f"{name} {ACROSS}"] = {"shiftPx": largest[:2], **sub, "inkLog": None, "inkAt": None, "regionInkLog": None, "hardSeamPt": None, "lightSeamPt": None}
    seam = seams(scene, sheet, ours, dist_o, shifts)
    for name, row in out.items():
        row.update(seam.get(name, {"hardSeamPt": None, "lightSeamPt": None}) if not name.endswith(" " + ACROSS) else {})
    return out


def ink_across(ink, points, normals, reach=None):
    """The line's ink across it at each point: the warm top-hat summed along the normal over INK_REACH_PX each way
    (a line's darkness times its width, which a blur spreads but keeps)."""
    reach = INK_REACH_PX + TONE_SIGMA_PX if reach is None else reach
    step = 0.5
    t = np.arange(-reach, reach + step / 2, step)
    ys = points[:, None, 0] + t[None, :] * normals[:, None, 0]
    xs = points[:, None, 1] + t[None, :] * normals[:, None, 1]
    return ndimage.map_coordinates(ink, [ys.ravel(), xs.ravel()], order=1, mode="nearest").reshape(ys.shape).sum(axis=1) * step


ACROSS_OFF_PX = 2  # crop px: a line across a boundary is toned this far from it, clear of the edge's own line


def local_ink(s_pts, ink_s, ink_o, scene, least):
    """How much line each image draws along the sheet's line, window by window: the ink across the line (ink_across)
    summed over the sheet's line pixels within TONE_WINDOW_PX of each (least at least), ours read at the same places.
    The worst log of ours over the sheet's (positive: ours draws more: heavier, darker, doubled; negative: less:
    paler, thinner, missing), and where (pt). Each sum is floored at INK_FLOOR px of a line at tau, so a window that
    draws next to nothing reads as nothing."""
    hits = [h for h in cKDTree(s_pts).query_ball_point(s_pts, TONE_WINDOW_PX)]
    full = [i for i, h in enumerate(hits) if len(h) >= least]
    if not full:
        return None, None
    floor = INK_FLOOR * scene.tau
    ratio = np.array([np.log((ink_o[hits[i]].sum() + floor) / (ink_s[hits[i]].sum() + floor)) for i in full])
    i = int(np.abs(ratio).argmax())
    y, x = s_pts[full[i]]
    return r(ratio[i]), [r(v, 1) for v in scene.grid.to_pt([x, y])]


ACROSS = "across"


def local_tone(s_pts, core_s, core_o, scene, least=MIN_LINE_PX):
    """The worst difference along the sheet's line between ours' core L* and the sheet's, read at the same pixels and
    each averaged over the line within TONE_WINDOW_PX (least pixels at least): ours less the sheet's (positive: ours is
    lighter), and where (pt)."""
    if len(s_pts) < least:
        return None, None
    # Only where both images have a warm line tone (tone_map).
    both = ~(np.isnan(core_s) | np.isnan(core_o))
    s_pts, core_s, core_o = s_pts[both], core_s[both], core_o[both]
    if len(s_pts) < least:
        return None, None
    hits = cKDTree(s_pts).query_ball_point(s_pts, TONE_WINDOW_PX)
    ok = np.array([len(h) >= least for h in hits])
    if not ok.any():
        return None, None
    delta = np.array([core_o[h].mean() - core_s[h].mean() if len(h) >= least else 0.0 for h in hits])
    i = int(np.abs(delta).argmax())
    y, x = s_pts[i]
    return r(delta[i], 1), [r(v, 1) for v in scene.grid.to_pt([x, y])]


def seams(scene, sheet, ours, dist_o, shifts):
    """The plan's seams (h) on each boundary inside the silhouette, ours against the sheet on the same boundary (the
    sheet moved by each piece's shift, compare's): the longest run (pt) of a hard unlined seam and of a light seam. A
    side is the mean L* of that side's part from 1.5 to SEAM_SIDE_PX px off the boundary; its band, within 1.5 px.
    Each image's own lines are left out of both. A light seam is a band lighter than the rest of its side by more
    than SEAM_LIGHT_L: a paler strip between a marking and the line it should reach, or between two parts (lighter
    than both sides, as the plan words it, is lighter than each)."""
    hosts, boundary, k = scene.hosts, scene.boundary, scene.grid.k
    h, w = boundary.shape
    near_edge = ndimage.distance_transform_edt(boundary < 0) <= 1.5
    far, close = disk(SEAM_SIDE_PX).astype(np.float64), disk(2).astype(np.float64)
    margin = SEAM_SIDE_PX + SHIFT_PX + 2
    out = {}
    for name in scene.contact:
        a, b = name.split("|")
        on_region = boundary == scene.names.index(name)
        labels, piece_shifts = shifts[name]
        flags = {"hardSeamPt": np.zeros((h, w), bool), "lightSeamPt": np.zeros((h, w), bool)}
        for piece, (dx, dy, _) in enumerate(piece_shifts, start=1):
            on = on_region & (labels == piece)
            if not on.any():
                continue
            ys, xs = np.nonzero(on)
            box = (slice(max(ys.min() - margin, 0), min(ys.max() + margin + 1, h)), slice(max(xs.min() - margin, 0), min(xs.max() + margin + 1, w)))
            # Ours in place; the sheet's pixel s read as ours' s - d, so its parts and its boundary are ours' moved by d.
            frames = {"o": (ours, hosts, near_edge, (ys, xs)),
                      "s": (sheet, match.shifted(hosts, dx, dy), match.shifted(near_edge, dx, dy), (np.clip(ys + dy, 0, h - 1), np.clip(xs + dx, 0, w - 1)))}
            side = {}
            for img, (m, parts, near_band, (py, px)) in frames.items():
                L, lines, parts, near_band = m["L"][box], m["lines"][box], parts[box], near_band[box]
                at = (py - box[0].start, px - box[1].start)
                for part in (a, b):
                    for near in (False, True):
                        mask = ((parts == part) & (near_band if near else ~near_band) & ~lines).astype(np.float64)
                        window = close if near else far
                        total = ndimage.correlate(L * mask, window, mode="constant")[at]
                        count = ndimage.correlate(mask, window, mode="constant")[at]
                        side[img, part, near] = np.where(count > 0, total / np.maximum(count, 1e-9), np.nan)
            sa, sb, oa, ob = side["s", a, False], side["s", b, False], side["o", a, False], side["o", b, False]
            lined = dist_o[on] <= MATCH_PX
            known = ~(np.isnan(sa) | np.isnan(sb) | np.isnan(oa) | np.isnan(ob))
            # Each also steps by more than the sheet does there by SEAM_FLAT_L, so a step or a band a little over its
            # limit in ours and a little under it in the sheet is the same picture, not a seam.
            step_o, step_s = np.abs(oa - ob), np.abs(sa - sb)
            flags["hardSeamPt"][on] = known & (step_o > SEAM_STEP_L) & ~lined & (step_s < SEAM_FLAT_L) & (step_o - step_s > SEAM_FLAT_L)
            light = np.zeros(on.sum(), bool)
            for part in (a, b):
                o_lift = side["o", part, True] - side["o", part, False]
                s_lift = side["s", part, True] - side["s", part, False]
                light |= (o_lift > SEAM_LIGHT_L) & (s_lift <= SEAM_LIGHT_L) & (o_lift - s_lift > SEAM_LIGHT_L)
            flags["lightSeamPt"][on] = light
        out[name] = {key: r(longest_run(mask, k), 2) for key, mask in flags.items()}
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
    """The 10-90% rise of the alpha across its edge at each contour point (pt), along the alpha's gradient, between
    the plateaus either side of the edge (the least alpha within RISE_REACH_PX outside, the most inside), each level
    found walking out from the edge: the ground shadow's faint haze lies outside its own ID and grows away from the
    paw, and an edge over it rises from the haze at the edge, not from nothing nor from the haze's far side. A profile
    whose step is under RISE_STEP is not an edge on the card and is left out."""
    gy, gx = np.gradient(ndimage.gaussian_filter(alpha, 0.7))
    t = np.arange(-RISE_REACH_PX, RISE_REACH_PX + 0.001, 0.1)
    middle = int(np.argmin(np.abs(t)))
    out = []
    for y, x in points:
        n = np.array([gy[int(round(y)), int(round(x))], gx[int(round(y)), int(round(x))]])
        size = np.hypot(*n)
        if size < 1e-4:
            continue
        n /= size
        profile = ndimage.map_coordinates(alpha, [y + t * n[0], x + t * n[1]], order=1)
        low, high = profile[:middle + 1].min(), profile[middle:].max()
        if high - low < RISE_STEP:
            continue
        lo, hi = low + 0.1 * (high - low), low + 0.9 * (high - low)
        below = np.flatnonzero(profile[:middle + 1] < lo)  # outward from the edge: the last point still under 10%
        above = np.flatnonzero(profile[middle:] >= hi)  # inward: the first point at 90%
        if len(below) and len(above):
            out.append((t[middle + above[0]] - t[below[-1] + 1]) / ppp)
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
    return width_stats(lines, band, scene.names, ppp)


def width_stats(lines, band, names, ppp):
    """Each region's line widths on a line map at ppp px per pt (pt): the lower quartile of the full width at half
    maximum (widthPt: even the line's thinner quarter), its coefficient of variation where the line runs alone, away
    from junctions (widthCv), and on a sole (a region on the ground) the median over the middle SOLE_MIDDLE of its
    length, where the paw presses (soleMiddlePt, the plan's ground term)."""
    pts = np.argwhere(lines["skeleton"])
    out = {}
    if not len(pts):
        return out
    normals = orientation(lines["skeleton"])[tuple(pts.T)]
    found = widths(lines["tophat"], pts.astype(float), normals, reach=FINE_TOPHAT_PT * ppp * 1.5, step=0.25) / ppp
    plain = lines["plain"][tuple(pts.T)]
    where = band[tuple(pts.T)]
    for index, name in enumerate(names):
        mine = where == index
        if name == LEFT_OUT or mine.sum() < MIN_LINE_PX * ppp:
            continue
        row = {"widthPt": r(np.quantile(found[mine], WIDTH_QUANTILE)), "widthMedianPt": r(np.median(found[mine]))}
        alone = found[mine & plain]
        if len(alone) >= MIN_WIDTH_PX * ppp:
            row["widthCv"] = r(alone.std() / alone.mean())
        if name.endswith("|" + GROUND):
            x = pts[mine, 1]
            lo, hi = np.quantile(x, [(1 - SOLE_MIDDLE) / 2, (1 + SOLE_MIDDLE) / 2])
            middle = found[mine][(x >= lo) & (x <= hi)]
            if len(middle) >= MIN_LINE_PX * ppp:
                row["soleMiddlePt"] = r(np.median(middle))
        out[name] = row
    return out


def fine_measures(scene, width_ppp=None):
    """The render-only measures in each region: the line's width (lower quartile, pt, at width_ppp), the fur
    amplitude of the edge that shows, and the alpha's rise across the outer edge."""
    fine = Fine(scene)
    ppp = fine.ppp
    out = {name: {} for name in scene.names if name != LEFT_OUT}
    for name, row in line_widths(scene, width_ppp or ppp).items():
        out[name].update(row)
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
            if name != LEFT_OUT and name.endswith("|" + OUTSIDE):
                found = rises(fine.alpha, points[where == index], ppp)
                if len(found) >= MIN_RISE_POINTS:
                    out[name]["risePt"] = r(np.median(found))
    return out


def region_class(name, classes):
    return next((c for c, patterns in classes.items() if matches_any(name, patterns)), None)


def base(name):
    """The region an across region's lines lie in."""
    return name[:-len(ACROSS) - 1] if name.endswith(" " + ACROSS) else name


def thresholds_for(scene, names, calibration):
    """Each region's threshold for every measure: the calibrated region's own, else (a region the calibration's
    build did not have) the median the view's calibrated regions hold, marked uncalibrated (a guess, which the
    summary counts). The render-only measures hold a whole region, never its lines across."""
    view = calibration["views"].get(scene.view, {"regions": {}})["regions"]
    panels, crisp = calibration["panels"], calibration["crisp"]
    out = {}
    for name in names:
        rows = {}
        for measure, (sign, where) in MEASURES.items():
            if where != "grid":
                continue
            if name in view:
                # A measure the sheet's copies never read in a calibrated region (too little line there) is not judged.
                rows[measure] = view[name].get(measure, {}).get("threshold")
            else:
                held = [v[measure]["threshold"] for v in view.values() if v.get(measure, {}).get("threshold") is not None]
                rows[measure] = r(np.median(held)) if held else None
        whole = "|" in name and base(name) == name
        width = region_class(name, WIDTH_CLASSES)
        rows["widthPt"] = r(panels["widthPt"][width] + WIDTH_MARGIN_PT) if width in panels["widthPt"] and whole else None
        rows["widthCv"] = r(WIDTH_CV_SHARE * panels["widthCv"][width]) if width in panels.get("widthCv", {}) and whole else None
        sole = whole and name.endswith("|" + GROUND) and "sole" in panels.get("soleMiddlePt", {})
        rows["soleMiddlePt"] = r(panels["soleMiddlePt"]["sole"] + WIDTH_MARGIN_PT) if sole else None
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
            if measure in ("recall", "precision") and threshold is not None:
                # A share is never held finer than two pixels of its line, and not at all under MIN_SHARE_PX: a few
                # pixels' share is one pixel's luck, and their run (the gap, the extra mark) is judged instead.
                count = values.get("sheetPx" if measure == "recall" else "oursPx") or 0
                threshold = r(min(threshold, 1 - SHARE_RESOLUTION_PX / count)) if count >= MIN_SHARE_PX else None
            row = {"value": value, "threshold": threshold}
            if value is not None and threshold is not None:
                if measure in TWO_SIDED:
                    row["pass"] = abs(value) <= threshold
                    if measure == "toneDelta" and base(name) in scene.contact and threshold > CONTACT_LIGHTER_L:
                        # The plan's (e): on a contact edge ours is never more than 10 L* lighter than the sheet.
                        row["lighterThreshold"] = CONTACT_LIGHTER_L
                        row["pass"] = row["pass"] and value <= CONTACT_LIGHTER_L
                else:
                    row["pass"] = value >= threshold if sign > 0 else value <= threshold
            rows[measure] = row
        extra = {k: values[k] for k in ("shiftPx", "piecesShiftPx", "sheetPx", "oursPx", "toneAt", "inkAt", "widthMedianPt", "furLengthPt") if k in values}
        failed = [m for m, row in rows.items() if row.get("pass") is False]
        out[name] = {"what": what(name), "contact": base(name) in scene.contact, "calibrated": held[name]["calibrated"],
                     "measures": rows, "detail": extra, "failed": failed, "pass": not failed}
    return out


def badness(measure, row, region=None):
    """How far a failed measure is past its threshold, as a ratio, weighed by how much of the drawing it concerns, to
    name the worst: a share (recall, precision) by the longest run it leaves out (gapPt, extraPt) over SEEN_PT, so a few
    scattered pixels of a fur stroke never outrank a 10 pt break in an outline."""
    sign = MEASURES[measure][0]
    value, threshold = (abs(row["value"]), row["threshold"]) if measure in TWO_SIDED else (row["value"], row["threshold"])
    ratio = threshold / max(value, 0.1) if sign > 0 else value / max(threshold, 1e-3)
    run = {"recall": "gapPt", "precision": "extraPt"}.get(measure)
    if run and region is not None:
        ratio *= min(1.0, (region["measures"].get(run, {}).get("value") or 0.0) / SEEN_PT)
    return ratio


SEEN_PT = 10.0  # pt: a run this long or longer counts in full when the worst failure is named


def worst(regions):
    found = [(badness(m, row["measures"][m], row), name, m) for name, row in regions.items() for m in row["failed"]]
    if not found:
        return None
    _, name, m = max(found)
    row = regions[name]["measures"][m]
    return {"region": name, "measure": m, "value": row["value"], "threshold": row["threshold"]}


def summary(result):
    """The one line the look loop prints: the regions failing and the worst, and any doubt about the calibration
    (regions it lacks, or regions the still has moved since it was made)."""
    regions = result["regions"]
    failed = result["failed"]
    doubts = []
    if result.get("uncalibrated"):
        doubts.append(f"{len(result['uncalibrated'])} regions uncalibrated (held to their view's median)")
    if (result.get("regionsMoved") or 0) > STALE_SHARE:
        doubts.append(f"the parts' edges moved over {result['regionsMoved']:.0%} of the crop since the calibration")
    doubt = f"; {' and '.join(doubts)}: rerun linecal.py" if doubts else ""
    if not failed:
        return f"lines pass ({len(regions)} regions){doubt}"
    w = result["worst"]
    return (f"lines FAIL {len(failed)} of {len(regions)} regions: {', '.join(failed[:4])}{f' and {len(failed) - 4} more' if len(failed) > 4 else ''}"
            f"; worst {w['region']} {w['measure']} {w['value']} (threshold {w['threshold']}){doubt}")


STALE_SHARE = 0.02  # of the drawn crop: the parts' edges moved over more since the calibration and its regions are stale


def regions_moved(scene, calibration):
    """The share of the crop's drawn pixels whose part differs from the calibration's region map, or None when the
    calibration has no map for the view."""
    rec = calibration["views"].get(scene.view)
    if not rec or "hostsMap" not in rec:
        return None
    then = np.array(rec["hosts"], dtype=object)[np.asarray(Image.open(sheets.ROOT / rec["hostsMap"]))]
    h, w = scene.frame.sil.shape
    now = scene.hosts[scene.grid.top:scene.grid.top + h, scene.grid.left:scene.grid.left + w]
    if now.shape != then.shape:
        return 1.0
    drawn = (then != OUTSIDE) | (now != OUTSIDE)
    return r(float((then != now)[drawn].mean()), 4) if drawn.any() else 0.0


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
              "regions": regions, "failed": failed, "worst": worst(regions),
              "uncalibrated": sorted(n for n, row in regions.items() if not row["calibrated"]), "regionsMoved": regions_moved(scene, calibration),
              "advisory": True, "pass": not failed}
    result["summary"] = summary(result)
    result["seconds"] = r(time.perf_counter() - started, 2)
    return result, {"scene": scene, "sheet": sheet, "ours": ours, "rows": grid_rows}


def picture(result, parts, path, zoom=3):
    """sheet | ours | the line maps (sheet blue, ours red, both black; the sheet moved as each piece of a region matched
    it) | the key:
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
        failed = [(badness(m, result["regions"][n]["measures"][m], result["regions"][n]), n, m) for n in (name, f"{name} {ACROSS}")
                  if n in result["regions"] for m in result["regions"][n]["failed"]]
        if failed:
            maps[inside] = (255, 214, 214) if "|" in name else (255, 236, 236)
        # Ours in place; the sheet's skeleton moved back by each piece's shift (its p beside ours' p - d).
        pieces, _ = ndimage.label(inside, structure=np.ones((3, 3)))
        drawn = np.zeros(band.shape, bool)
        for piece, (dx, dy) in enumerate(rows[name].get("piecesShiftPx", [rows[name]["shiftPx"]]), start=1):
            drawn |= match.shifted(sheet["skeleton"], -dx, -dy) & (pieces == piece)
        moved = ours["skeleton"] & inside
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
