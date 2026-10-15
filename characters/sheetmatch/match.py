"""The automated sheet match (spec section 5b, The sheet match): a still of the
built character beside its turnaround crop, measured with the rulers phase 2
used on the sheet (characters/refprep), so a render and the sheet are judged
alike.

    python3 characters/sheetmatch/match.py dog --still <dir> --out <dir> [--landmarks <json>]

Reads the still that runtime-web/lab/still.ts writes (still.json, white.png,
black.png, ids.png), characters/<species>/model.json and ref/, and the
source's landmarks (default build/dev/<species>/landmarks.json, from the build):
the points the sheet has no finder for (paws, tag ring, seat). Writes
<out>/match.json (every check, its numbers, its threshold, its verdict),
compare.png (crop | render | outlines and landmarks | onion skin) and
phone.png (the render at 3x, 164 pt tall, beside the crop at the same size).
Exits 1 when a gating check fails, 2 when the inputs are unusable.

The render is area-averaged onto the crop's own pixel grid (ptPerCropPx) with
model point (0, 0) on the crop's ground anchor, and is never moved to fit:
the shift that would fit it best is reported, and more than 2 px of it is a
drawing error. A .R facing the turnaround never draws is held to the mirror of
its .L crop (model.json mirroredViews); the render is mirrored instead, which
is the same comparison, so phase 2's finders, written for left-facing views,
run unchanged.

Gating: the silhouette's IoU, the alignment, the landmarks, the palette per
region (each against its own value, docs/QUESTIONS.md Q24), the blush as a
level (Q25) and the markings. Advisory, never pass or fail: edge distances,
IoU per part where the sheet gives the part, and the atlas share. The numbers
are guard rails: the comparison images are looked at every time."""
import argparse
import fnmatch
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "refprep"))
import measure  # noqa: E402
import palette  # noqa: E402
import sheets  # noqa: E402

IOU_MIN = {"front": 0.90, "threeQuarter": 0.90, "side": 0.85, "back": 0.85}  # L522
LANDMARK_SHARE = 0.03  # of the head's width (L523)
DELTA_E_MAX = 3.0  # L524
SHIFT_MAX_PX = 2.0  # crop px: a better fit further away than this is a drawing error (phase 3 plan, section 4)
SHIFT_SEARCH_PX = 8
ID_TOLERANCE = 6.0  # RGB distance: an ID colour a renderer's filtering moved slightly still names its part
SHOWN_PT2 = 4.0  # a marking part shows when this much of it is in view
BAKED_MIN_PX = 20  # crop px: tan smaller than this on a host part is a speck, not a marking
MATCH_RADIUS_SHARE = 0.2  # of the head's width: how near a marking painted into its part must be to the sheet's
EDGE_P95_PT = 2.0  # advisory target for the edge distance
PART_IOU = 0.85  # advisory target for each part the sheet's finders give
PHONE_PPP = 3
ZOOM = 3
CARD = (251, 245, 236)  # a light card for areas outside the crop

# The ground shadow is left out of the silhouette (L522: the cut-out has none).
GROUND_SHADOW = "shadow"
# Parts by name (fnmatch). The art may split a part into layers (eye.L.white, eye.L.iris), which match too.
FUR_PARTS = ("head.base", "tuft*", "body.*", "tail", "front.L", "front.R", "hind.*", "paw.*", "cheek*")
EYE_PARTS = ("eye.L*", "eye.R*")
MOUTH_PARTS = ("mouth*", "tongue*")
# Each palette region, the parts it reads and the value it is held to: model.json's entry for that region by
# its "for" text (Q24), never whichever entry is nearest.
REGIONS = {
    "fur": (FUR_PARTS, ("palette", "fur")),
    "furShade": (FUR_PARTS, ("palettePainted", "furShade")),
    "eyes": (EYE_PARTS, ("palettePainted", "eyeDark")),  # the pupils and the upper iris
    "lowerIris": (EYE_PARTS, ("palette", "dark")),
    "nose": (("nose*",), ("palettePainted", "eyeDark")),
    "tongue": (MOUTH_PARTS, ("palettePainted", "tongue")),
    "mouthInside": (MOUTH_PARTS, ("palettePainted", "mouthInside")),
    "ears": (("ear.L*", "ear.R*"), ("palette", "marking")),
    "headPatches": (("head.patch.*",), ("palettePainted", "markingLight")),
    "bodyMarkings": ((), ("palette", "marking")),  # the body's markings: their own parts, or painted into their hosts
    "collar": (("collar*",), ("palette", "collar")),
    "tag": (("tag*",), ("palette", "tag")),
}
BLUSH_PARTS = ("blush*",)
# The part each source landmark must lie on: the spec's part names, then the art prototype's.
SOURCE_PARTS = {
    "paw.front.L": ("front.L", "paw.front.L"), "paw.front.R": ("front.R", "paw.front.R"),
    "paw.hind.L": ("hind.L", "paw.hind.L"), "paw.hind.R": ("hind.R", "paw.hind.R"),
    "tag.ring": ("tag",), "seat": ("body.back", "body"),
}
SWAP = {"L": "R", "R": "L", "sheetLeft": "sheetRight", "sheetRight": "sheetLeft"}


def swap_sides(name):
    """A name seen in a mirror (model.json's mirror rule): .L and .R swap, and so do sheetLeft and sheetRight."""
    return ".".join(SWAP.get(token, token) for token in name.split("."))


def matches(name, patterns):
    return any(fnmatch.fnmatchcase(name, p) for p in patterns)


def read_rgb(path):
    with Image.open(path) as image:
        return np.asarray(image.convert("RGB"), dtype=np.float64)


def decode_ids(ids, colours):
    """Each pixel's part: the index of the ID colour it shows (within ID_TOLERANCE), else -1, the background."""
    table = np.array([sheets.hex_to_rgb(c) for c in colours], dtype=np.float64).reshape(-1, 3)
    if (table == 0).all(axis=1).any():
        raise ValueError("a part's ID colour is #000000, the ID pass's background")
    packed = ids.astype(np.int64) @ np.array([1 << 16, 1 << 8, 1])
    keys, inverse = np.unique(packed.ravel(), return_inverse=True)
    lut = np.full(len(keys), -1)
    for index, key in enumerate(keys):
        rgb = np.array([key >> 16, (key >> 8) & 255, key & 255], dtype=np.float64)
        distance = np.linalg.norm(table - rgb, axis=1)
        if key and len(distance) and distance.min() <= ID_TOLERANCE:
            lut[index] = int(distance.argmin())
    return lut[inverse.ravel()].reshape(ids.shape[:2])


class Still:
    """A still as runtime-web/lab/still.ts writes it: alpha and premultiplied colour from the frame over white
    and over black, and each pixel's part from the ID pass."""

    def __init__(self, meta, alpha, premult, part):
        self.meta = meta
        self.alpha, self.premult, self.part = alpha, premult, part
        self.names = list(meta["parts"])
        self.drawn = list(meta.get("drawn", self.names))
        self.ppp = float(meta["ppp"])
        self.root = np.array(meta["rootPx"], dtype=np.float64)

    @classmethod
    def load(cls, folder):
        folder = Path(folder)
        meta = json.loads((folder / "still.json").read_text())
        white, black, ids = (read_rgb(folder / name) for name in ("white.png", "black.png", "ids.png"))
        w, h = meta["sizePx"]
        for name, image in (("white.png", white), ("black.png", black), ("ids.png", ids)):
            if image.shape[:2] != (h, w):
                raise ValueError(f"{name} is {image.shape[1]} x {image.shape[0]} px; still.json says {w} x {h}")
        # Over black a pixel is its premultiplied colour; over white it gains (1 - alpha) of white.
        alpha = np.clip(1 - (white - black).mean(axis=2) / 255, 0, 1)
        part = decode_ids(ids, [meta["parts"][n]["id"] for n in meta["parts"]])
        return cls(meta, alpha, np.clip(black / 255, 0, 1), part)

    def mirrored(self):
        """The still in a mirror about model x = 0: continuous x becomes width - x."""
        meta = dict(self.meta, rootPx=[self.alpha.shape[1] - self.root[0], self.root[1]])
        return Still(meta, self.alpha[:, ::-1], self.premult[:, ::-1], self.part[:, ::-1])


class Frame:
    """The crop a facing is held to, in the left-facing frame phase 2 measured: the crop, its cut-out, its scale
    and its anchors. A mirrored facing is measured in its .L crop's frame and reported in its own."""

    def __init__(self, species, model, view):
        self.species, self.model, self.view = species, model, view
        if view in model["crops"]:
            self.source, self.mirrored = view, False
        elif view in model.get("mirroredViews", {}):
            self.source, self.mirrored = model["mirroredViews"][view]["from"], True
        else:
            raise ValueError(f"model.json has no crop for the view {view!r}")
        self.rec = model["crops"][self.source]
        self.kind = self.rec["view"]
        self.k = float(self.rec["ptPerCropPx"])
        self.folder = sheets.ROOT / "characters" / species
        self.crop = read_rgb(self.folder / "ref" / "panels" / self.rec["sheet"] / f"{self.rec['crop']}.png").astype(np.uint8)
        with Image.open(self.folder / self.rec["mask"]) as image:
            self.sil = np.asarray(image) > 0
        edge = np.concatenate([self.crop[0], self.crop[-1], self.crop[:, 0], self.crop[:, -1]])
        self.card = np.median(edge, axis=0)
        self.head_width = float(model["proportions"]["headWidth"])

    def to_still_name(self, name):
        """A name in this frame as the still names it: a mirrored facing's near side is the dog's right."""
        return swap_sides(name) if self.mirrored else name

    def to_frame_point(self, xy):
        return [-xy[0], xy[1]] if self.mirrored else list(xy)


class Grid:
    """The crop's pixel grid padded to hold the whole still plus the shift search: crop pixel (i, j) is grid pixel
    (i + left, j + top). Model point p sits at grid position ground + (left, top) + 0.5 + p / k, in continuous
    pixels: phase 2 measured the anchors as pixel indices, whose centres are at +0.5."""

    def __init__(self, frame, still):
        self.k = frame.k
        f = still.ppp * frame.k  # still pixels per crop pixel
        gx, gy = frame.rec["anchorsCropPx"]["ground"]
        h, w = frame.sil.shape
        x0 = gx + 0.5 - still.root[0] / f
        y0 = gy + 0.5 - still.root[1] / f
        x1 = x0 + still.alpha.shape[1] / f
        y1 = y0 + still.alpha.shape[0] / f
        m = SHIFT_SEARCH_PX + 1
        self.left = int(max(0, np.ceil(-x0))) + m
        self.top = int(max(0, np.ceil(-y0))) + m
        self.shape = (self.top + max(h, int(np.ceil(y1))) + m, self.left + max(w, int(np.ceil(x1))) + m)
        self.ground = np.array([gx + self.left, gy + self.top], dtype=np.float64)
        self.f = f
        self.still = still

    def pad(self, image, fill=0):
        h, w = image.shape[:2]
        out = np.empty(self.shape + image.shape[2:], image.dtype)
        out[...] = fill
        out[self.top:self.top + h, self.left:self.left + w] = image
        return out

    def to_pt(self, xy):
        """Grid pixel indices (as phase 2's finders return them) to model points."""
        return [(xy[0] - self.ground[0]) * self.k, (xy[1] - self.ground[1]) * self.k]

    def to_index(self, pt):
        return [self.ground[0] + pt[0] / self.k, self.ground[1] + pt[1] / self.k]

    def sample(self, layers, shift=(0.0, 0.0)):
        """Area averages of the still's layers (H x W x C) over each grid pixel, the render moved by shift (grid px)."""
        st = self.still
        h, w = self.shape
        start_x = st.root[0] + self.f * (-self.ground[0] - 0.5 - shift[0])
        start_y = st.root[1] + self.f * (-self.ground[1] - 0.5 - shift[1])
        wx = area_weights(w, layers.shape[1], start_x, self.f)
        wy = area_weights(h, layers.shape[0], start_y, self.f)
        rows = np.tensordot(wy, layers, axes=(1, 0))
        return np.moveaxis(np.tensordot(rows, wx, axes=(1, 1)), -1, 1)


def area_weights(count, size, start, step):
    """Weights averaging input pixels [j, j + 1) over each output pixel's span [start + i step, start + (i + 1) step)."""
    edges = start + step * np.arange(count + 1)
    j = np.arange(size)
    overlap = np.minimum(edges[1:, None], j[None, :] + 1) - np.maximum(edges[:-1, None], j[None, :])
    return (np.clip(overlap, 0, None) / step).astype(np.float32)


class Render:
    """The still on the crop's grid: alpha, colour over the card, each part's coverage, and the silhouette."""

    def __init__(self, grid, frame, shift=(0.0, 0.0), parts=True):
        st = grid.still
        present = [int(p) for p in np.unique(st.part) if p >= 0 and (parts or st.names[p] == GROUND_SHADOW)]
        channel = np.full(len(st.names) + 1, -1)
        channel[present] = np.arange(len(present))
        layers = np.zeros(st.part.shape + (4 + len(present),), np.float32)
        layers[..., 0] = st.alpha
        layers[..., 1:4] = st.premult
        ys, xs = np.nonzero(channel[st.part] >= 0)
        layers[ys, xs, 4 + channel[st.part[ys, xs]]] = 1
        sampled = grid.sample(layers, shift).astype(np.float64)
        self.alpha = np.clip(sampled[..., 0], 0, 1)
        self.coverage = {st.names[p]: sampled[..., 4 + i] for i, p in enumerate(present)}
        premult = sampled[..., 1:4]
        over = premult + (1 - self.alpha[..., None]) * (frame.card / 255)
        self.rgb = np.clip(np.round(over * 255), 0, 255).astype(np.uint8)
        shadow = self.coverage.get(GROUND_SHADOW, np.zeros(grid.shape))
        self.sil = (self.alpha >= 0.5) & (shadow < 0.5)

    def mask(self, names, threshold=0.5):
        """Where the named parts together cover at least threshold of a pixel."""
        total = np.zeros(self.alpha.shape)
        for name in names:
            if name in self.coverage:
                total += self.coverage[name]
        return total >= threshold


def iou(a, b):
    union = (a | b).sum()
    return float((a & b).sum() / union) if union else 0.0


def shifted(mask, dx, dy):
    out = np.zeros_like(mask)
    h, w = mask.shape
    out[max(dy, 0):h + min(dy, 0), max(dx, 0):w + min(dx, 0)] = mask[max(-dy, 0):h + min(-dy, 0), max(-dx, 0):w + min(-dx, 0)]
    return out


def best_shift(sil, sheet):
    """The shift of the render that would fit the sheet's cut-out best: whole pixels, then a parabola through the
    best one's neighbours for the fraction. Reported, never applied."""
    r = SHIFT_SEARCH_PX
    scores = np.array([[iou(shifted(sil, dx, dy), sheet) for dx in range(-r, r + 1)] for dy in range(-r, r + 1)])
    iy, ix = np.unravel_index(int(scores.argmax()), scores.shape)

    def vertex(a, b, c):
        bend = a - 2 * b + c
        return 0.0 if bend >= 0 else float(np.clip(0.5 * (a - c) / bend, -0.5, 0.5))

    fx = vertex(scores[iy, ix - 1], scores[iy, ix], scores[iy, ix + 1]) if 0 < ix < 2 * r else 0.0
    fy = vertex(scores[iy - 1, ix], scores[iy, ix], scores[iy + 1, ix]) if 0 < iy < 2 * r else 0.0
    return [ix - r + fx, iy - r + fy], float(scores[iy, ix])


def round2(values):
    return [round(float(v), 2) + 0.0 for v in values]  # + 0.0: a mirrored zero reads 0.0, not -0.0


def in_part(still, indices, pt):
    """Whether a model point lies on one of the parts' ID pixels, or within one still pixel of them."""
    x, y = still.root + still.ppp * np.asarray(pt, dtype=np.float64)
    i, j = int(np.floor(x)), int(np.floor(y))
    window = still.part[max(j - 1, 0):j + 2, max(i - 1, 0):i + 2]
    return bool(np.isin(window, indices).any())


def hand_seat(frame):
    """Phase 2's seat, placed by hand on the sheet (refmap/landmarks.json), in model points."""
    hand = json.loads((frame.folder / "refmap" / "landmarks.json").read_text())["hand"].get(frame.source, {})
    if "seat" not in hand:
        return None
    x0, y0 = frame.rec["boxSheetPx"][:2]
    gx, gy = frame.rec["anchorsCropPx"]["ground"]
    return [(hand["seat"][0] - x0 - gx) * frame.k, (hand["seat"][1] - y0 - gy) * frame.k]


def source_on_part(frame, still, name, pt):
    """Whether a source landmark lies on the part it names (SOURCE_PARTS), as the ID pass draws it."""
    names = [frame.to_still_name(p) for p in SOURCE_PARTS.get(name, ())]
    return in_part(still, [still.names.index(n) for n in names if n in still.names], pt)


def check_landmarks(frame, grid, render, still, source):
    """Phase 2's own finders on the render (measure.measure_view, with the render's silhouette), and the source's
    points for what the sheet has no finder for, each held to model.json within 3% of the head's width."""
    tolerance = LANDMARK_SHARE * frame.head_width
    model = frame.model["landmarks"][frame.source]
    result = {"thresholdPt": round(tolerance, 2), "rows": {}}
    seat = source.get("seat") or hand_seat(frame)
    hand = {"seat": grid.to_index(seat)} if seat is not None and frame.kind in ("threeQuarter", "side") else {}
    found, shape = {}, None
    try:
        _, _, points, _, shape = measure.measure_view(frame.source, render.rgb, hand, sil=render.sil)
        found = {name: grid.to_pt(xy) for name, xy in points.items() if name != "seat"}
    except Exception as error:  # a finder that cannot find its feature fails the check, by name
        result["error"] = f"{type(error).__name__}: {error}"
    rows = result["rows"]
    for name, want in model.items():
        if name in found:
            got, row = found[name], {"how": "finder"}
        elif name in source:
            got, row = source[name], {"how": "source", "onItsPart": source_on_part(frame, still, name, source[name])}
        else:
            rows[name] = {"model": want, "missing": True, "pass": False}
            continue
        err = float(np.hypot(got[0] - want[0], got[1] - want[1]))
        rows[name] = dict(row, found=round2(got), model=want, errPt=round(err, 2), errShareOfHead=round(err / frame.head_width, 3),
                          **{"pass": err <= tolerance and row.get("onItsPart", True)})
    if "seat" in source:
        ok = source_on_part(frame, still, "seat", source["seat"])
        rows["seat"] = {"found": round2(source["seat"]), "how": "source", "onItsPart": ok, "pass": ok}
    result["pass"] = "error" not in result and all(r["pass"] for r in rows.values())
    return result, found, shape


def masks_for(render, still, patterns):
    names = [n for n in still.names if matches(n, patterns)]
    return names, render.mask(names)


def interior(mask):
    """A region without its edge pixels, which mix with what lies beside it; a sliver keeps them."""
    inner = ndimage.binary_erosion(mask)
    return inner if inner.any() else mask


def marking_hosts(frame):
    """The model's markings by id, with each one's host part."""
    return {m["id"]: m["part"] for m in frame.model["markings"]}


def expected_markings(frame):
    """The markings the facing shows: the ones phase 2 found on its crop (ref/markings.json), and for a mirrored
    facing the right side's own, so a left-only marking (the dog's rump patch) does not cross over."""
    evidence = json.loads((frame.folder / "ref" / "markings.json").read_text())["evidence"]
    seen = {e["marking"]: e for e in evidence if e["panel"] == frame.rec["crop"]}
    hosts = marking_hosts(frame)
    # In this frame each one keeps the sheet's name; the still names it from its own side.
    return {name: e for name, e in seen.items() if frame.to_still_name(name) in hosts}


def baked_tan(render, frame, host_mask):
    """Tan areas painted into a host part, as markings.py finds them on the sheet."""
    tan = measure.Classes(render.rgb, render.sil).tan & host_mask
    return measure.components(ndimage.binary_opening(tan, np.ones((3, 3), bool)), BAKED_MIN_PX)


def reach_outside(still, index, host):
    """An unclipped marking part's ID pixels beside the background or beside a part drawn under its host: where it
    can show past its host's edge."""
    order = still.drawn
    under = [still.names.index(n) for n in order[:order.index(host)] if n in still.names] if host in order else []
    own = still.part == index
    beside = ndimage.binary_dilation(own) & ~own & ((still.part == -1) | np.isin(still.part, under))
    return int((own & ndimage.binary_dilation(beside)).sum())


def check_markings(frame, grid, render, still):
    """Each facing shows exactly the markings the marking map gives it, and each marking part is clipped to its
    host part, so the runtime keeps every pixel of it inside (format README, clipTo: the host's alpha 0.05 or
    more). A marking painted into its host part instead is found as tan on the host near where the sheet has it."""
    hosts = marking_hosts(frame)
    expected = {frame.to_still_name(n): e for n, e in expected_markings(frame).items()}  # in the still's names
    rows, painted = {}, {}
    for name in sorted(set(hosts) | {swap_sides(n) for n in hosts} | set(expected)):
        if name not in still.names:
            if name in expected:
                painted.setdefault(hosts[name], []).append(name)
            continue
        index = still.names.index(name)
        area = float((still.part == index).sum()) / still.ppp ** 2
        row = {"part": name, "shownPt2": round(area, 1), "shows": area >= SHOWN_PT2, "expected": name in expected}
        if name not in hosts:
            row.update(problem="not in the marking map", **{"pass": not row["shows"]})
        else:
            clip = still.meta["parts"][name].get("clipTo")
            row.update(host=hosts[name], clipTo=clip, clipped=clip == hosts[name])
            if not row["clipped"]:
                row["pxBesideOutside"] = reach_outside(still, index, hosts[name])
            row["pass"] = row["clipped"] and row["shows"] == row["expected"]
        rows[name] = row
    # Tan painted into a host part: each area goes to the nearest marking expected there on the sheet; tan with no
    # marking near it is one the facing should not show (a plain mirror shows the left side's on the right).
    radius = MATCH_RADIUS_SHARE * frame.head_width / frame.k
    unexpected = []
    for host in sorted(set(hosts.values())):
        wanted = painted.get(host, [])
        if host not in still.names:
            rows.update({n: {"host": host, "problem": "its host part is not drawn", "pass": False} for n in wanted})
            continue
        sheet_at = {n: np.array(expected[n]["centroidPx"]) + [grid.left, grid.top] for n in wanted}
        tan = {n: 0 for n in wanted}
        for blob in baked_tan(render, frame, render.mask([host])):
            centre = np.array(measure.centroid(blob))
            near = min(((float(np.hypot(*(centre - xy))), n) for n, xy in sheet_at.items()), default=None)
            if near is not None and near[0] <= radius:
                tan[near[1]] += int(blob.sum())
            else:
                unexpected.append({"host": host, "centrePt": round2(grid.to_pt(centre)), "px": int(blob.sum())})
        rows.update({n: {"host": host, "paintedIntoHost": True, "tanPx": px, "shows": px > 0, "expected": True,
                         "pass": px > 0} for n, px in tan.items()})
    if frame.mirrored:
        for item in unexpected:
            item["centrePt"][0] = -item["centrePt"][0]
    shown = sorted(n for n, r in rows.items() if r.get("shows"))
    result = {"expected": sorted(expected), "shown": shown, "rows": rows, "unexpectedTan": unexpected}
    result["pass"] = all(r["pass"] for r in rows.values()) and not unexpected and set(expected) <= set(shown)
    return result


def held(frame, where):
    table, key = where
    value = frame.model[table][key]
    return value["value"] if isinstance(value, dict) else value


def expected_regions(frame):
    """The regions phase 2 found on the crop (ref/palette.json), and the markings the facing shows."""
    found = json.loads((frame.folder / "ref" / "palette.json").read_text())["views"][frame.source]
    regions = {r for r in REGIONS if r in found}
    hosts = marking_hosts(frame)
    for name in expected_markings(frame):
        regions.add("headPatches" if hosts[frame.to_still_name(name)] == "head.base" else "bodyMarkings")
    return regions


def palette_masks(frame, render, still):
    """Each region's pixels: its parts' ID pixels, and inside a part with two held colours, phase 2's own rule
    for which pixels are which (palette.py)."""
    rgb = render.rgb
    lab = sheets.to_lab(rgb)
    cls = measure.Classes(rgb, render.sil)
    found = {}
    _, fur = masks_for(render, still, FUR_PARTS)
    fur = interior(fur)
    eye_masks = []
    for side in EYE_PARTS:
        _, eye = masks_for(render, still, (side,))
        if eye.any():
            eye_masks.append(ndimage.binary_fill_holes(eye & cls.dark))
    eye_area = np.any([ndimage.binary_dilation(e, iterations=3) for e in eye_masks], axis=0) if eye_masks else np.zeros_like(fur)
    found["fur"] = fur
    if fur.any():
        found["furShade"] = palette.fur_shade(cls, lab, fur, float(np.median(cls.L[fur])), eye_area)
    if eye_masks:
        found["eyes"] = np.any(eye_masks, axis=0) & (cls.L < 40)
        found["lowerIris"] = palette.lower_iris([e for e in eye_masks if e.any()], cls.L)
    found["nose"] = masks_for(render, still, ("nose*",))[1] & (cls.L < 40)
    _, mouth = masks_for(render, still, MOUTH_PARTS)
    found["tongue"] = mouth & cls.pink
    found["mouthInside"] = palette.mouth_inside(lab, mouth, cls.pink)
    for region in ("ears", "headPatches", "collar", "tag"):
        found[region] = interior(masks_for(render, still, REGIONS[region][0])[1])
    # The body's markings: their own parts, and tan painted into the parts they belong to.
    hosts = marking_hosts(frame)
    body = [n for n in hosts if hosts[n] != "head.base"]
    found["bodyMarkings"] = interior(masks_for(render, still, tuple(body))[1])
    for host in {hosts[n] for n in body}:
        for blob in baked_tan(render, frame, render.mask([host])):
            found["bodyMarkings"] |= blob
    return found


def check_palette(frame, render, still):
    """Each region's dominant colour (palette.dominant: the fullest L*a*b* bin) against its own held value."""
    expected = expected_regions(frame)
    masks = palette_masks(frame, render, still)
    rows = {}
    for region, (_, where) in REGIONS.items():
        mask = masks.get(region, np.zeros(render.sil.shape, bool))
        target = held(frame, where)
        if not mask.any():
            if region in expected:
                rows[region] = {"heldTo": target, "heldBy": ".".join(where), "missing": True, "pass": False}
            continue
        colour, count = palette.dominant(render.rgb, mask)
        de = palette.delta(colour, target)
        rows[region] = {"dominant": sheets.rgb_to_hex(colour), "heldTo": target, "heldBy": ".".join(where),
                        "deltaE2000": round(de, 2), "pixels": count, "pass": de <= DELTA_E_MAX}
    return {"thresholdDeltaE2000": DELTA_E_MAX, "rows": rows, "pass": all(r["pass"] for r in rows.values())}


def check_blush(frame, render, still):
    """The blush as a level (Q25): each cheek fitted as palette.py fits the sheet's, in a box around the blush part,
    within the sheet's resting spread; and the blush part's own colour, the cheek carried along the fitted blend
    from the fur to full strength, within ΔE2000 3 of the printed pink."""
    fur_hex, pink_hex = frame.model["palette"]["fur"], frame.model["palette"]["blush"]
    lo, hi = frame.model["blush"]["restingSpread"]
    fur, pink = sheets.hex_to_rgb(fur_hex).astype(float), sheets.hex_to_rgb(pink_hex).astype(float)
    cheeks = []
    names, mask = masks_for(render, still, BLUSH_PARTS)
    for blob in measure.components(mask, 6):
        ys, xs = np.nonzero(blob)
        box = render.rgb[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
        level, peak = palette.blush(box, fur_hex, pink_hex)
        core = fur + (peak - fur) / level if level > 0.05 else peak
        de = palette.delta(np.clip(core, 0, 255), pink_hex)
        cheeks.append({"centrePx": round2(measure.centroid(blob)), "level": round(level, 3), "peak": sheets.rgb_to_hex(peak),
                       "coreColour": sheets.rgb_to_hex(np.clip(core, 0, 255)), "coreDeltaE2000": round(de, 2),
                       "pass": lo <= level <= hi and de <= DELTA_E_MAX})
    plan = json.loads((frame.folder / "refmap" / "palette.json").read_text())
    wanted = any(b["panel"] == frame.rec["crop"] for b in plan["blush"])
    result = {"parts": names, "restingSpread": [lo, hi], "heldTo": pink_hex, "thresholdDeltaE2000": DELTA_E_MAX,
              "cheeks": cheeks, "sheetShowsBlush": wanted}
    result["pass"] = all(c["pass"] for c in cheeks) and (bool(cheeks) or not wanted)
    return result


def edge_distances(sil, sheet, k):
    """How far each edge pixel of one outline lies from the other's, in points: more telling than IoU."""
    def edge(m):
        return m & ~ndimage.binary_erosion(m)
    rs, ss = edge(sil), edge(sheet)
    if not rs.any() or not ss.any():
        return None
    to_sheet = ndimage.distance_transform_edt(~ss)[rs] * k
    to_render = ndimage.distance_transform_edt(~rs)[ss] * k
    p95 = max(float(np.percentile(to_sheet, 95)), float(np.percentile(to_render, 95)))
    return {"meanRenderToSheetPt": round(float(to_sheet.mean()), 2), "p95RenderToSheetPt": round(float(np.percentile(to_sheet, 95)), 2),
            "meanSheetToRenderPt": round(float(to_render.mean()), 2), "p95SheetToRenderPt": round(float(np.percentile(to_render, 95)), 2),
            "targetP95Pt": EDGE_P95_PT, "meetsTarget": p95 <= EDGE_P95_PT}


def part_ious(frame, grid, render, still):
    """IoU per part where phase 2's finders give the part on the sheet: the ears, the collar and the tag."""
    crop, sil = grid.pad(frame.crop, 255), grid.pad(frame.sil, False)
    cls = measure.Classes(crop, sil)
    out = {}
    try:
        band, _ = measure.collar(cls)
        sheet = {"collar": band}
        tag, _ = measure.tag(cls)
        if tag is not None:
            sheet["tag"] = tag
        count = 1 if frame.kind == "side" else 2
        _, ears = measure.ears(cls, count, band)
        # Named as measure.measure_view names them: from the sheet's left, the dog's right, except from behind.
        sides = ["L"] if frame.kind == "side" else ["L", "R"] if frame.kind == "back" else ["R", "L"]
        sheet.update({f"ear.{s}": m for s, m in zip(sides, ears)})
    except Exception as error:
        return {"error": f"{type(error).__name__}: {error}"}
    for name, mask in sheet.items():
        still_name = frame.to_still_name(name)
        names = [n for n in still.names if n == still_name or n.startswith(still_name + ".")]
        if names:
            score = iou(render.mask(names), mask)
            out[still_name] = {"iou": round(score, 3), "target": PART_IOU, "meetsTarget": score >= PART_IOU}
    return out


def atlas_share(species, still, views):
    """The share of the 3x atlas pages the still's drawn parts take in its views (the 48 MB budget, section 5b)."""
    path = sheets.ROOT / "build" / "characters" / species / "atlas.json"
    if not path.exists():
        return {"note": f"no package at {path.parent}"}
    sets = {s["name"]: s for s in json.loads(path.read_text())["sets"]}
    chosen = sets.get("3x") or max(sets.values(), key=lambda s: s["scale"])
    pages = sum(p["width"] * p["height"] for p in chosen["pages"])
    regions = chosen["regions"]
    drawn = {n for n in still.drawn}
    mine = sum(r["w"] * r["h"] for key, r in regions.items()
               if key.split("/")[0] in drawn and len(key.split("/")) > 1 and key.split("/")[1] in views)
    total = sum(r["w"] * r["h"] for r in regions.values())
    return {"set": chosen["name"], "pages": len(chosen["pages"]), "pageAreaPx": pages,
            "allRegionsShare": round(total / pages, 3), "thisStillShare": round(mine / pages, 3)}


def match(species, still_dir, landmarks_path=None):
    """Every check on one still. Returns the result and what the images need."""
    model = json.loads((sheets.ROOT / "characters" / species / "model.json").read_text())
    still = Still.load(still_dir)
    views = still.meta["views"]
    if views["body"] != views["head"]:
        raise ValueError(f"the still's body is in {views['body']} and its head in {views['head']}: the turnaround draws one view")
    frame = Frame(species, model, views["body"])
    source = {}
    path = Path(landmarks_path) if landmarks_path else sheets.ROOT / "build" / "dev" / species / "landmarks.json"
    if path.exists():
        given = json.loads(path.read_text()).get(frame.view, {})
        source = {frame.to_still_name(n): frame.to_frame_point(xy) for n, xy in given.items()}
    seen = still.mirrored() if frame.mirrored else still
    grid = Grid(frame, seen)
    render = Render(grid, frame)
    sheet = grid.pad(frame.sil, False)
    result = {"species": species, "still": {k: still.meta.get(k) for k in ("still", "clip", "views", "ppp", "sizePx", "rootPx")},
              "view": frame.view, "crop": frame.rec["crop"], "mirroredFrom": frame.source if frame.mirrored else None,
              "ptPerCropPx": frame.k, "landmarkSource": str(path) if source else None}

    score = iou(render.sil, sheet)
    shift, shifted_iou = best_shift(render.sil, sheet)
    shift_out = [0.0 - shift[0], shift[1]] if frame.mirrored else shift
    result["alignment"] = {"rootOnCropGroundPlusHalf": True, "bestFitShiftPx": round2(shift_out),
                           "bestFitShiftPt": round2(np.multiply(shift_out, frame.k)), "iouAtBestWholePixelShift": round(shifted_iou, 4),
                           "thresholdPx": SHIFT_MAX_PX, "pass": float(np.hypot(*shift)) <= SHIFT_MAX_PX}
    lm, found, shape = check_landmarks(frame, grid, render, seen, source)
    silhouette = {"iou": round(score, 4), "threshold": IOU_MIN[frame.kind], "groundShadowLeftOut": GROUND_SHADOW in still.names,
                  "pass": score >= IOU_MIN[frame.kind]}
    if shape is not None and "head.top" in found:
        top = grid.to_index(found["head.top"])[1]
        head = measure.head_region(render.sil, shape["earMasks"], top, shape["headBottom"])
        centre = measure.centroid(head)
        want = np.array(frame.rec["anchorsCropPx"]["headCentre"]) + [grid.left, grid.top]
        dx = float(want[0] - centre[0])
        aligned = Render(grid, frame, (dx, 0.0), parts=False)
        silhouette["iouHeadAligned"] = round(iou(aligned.sil, sheet), 4)
        offset = [(centre[0] - want[0]) * frame.k, (centre[1] - want[1]) * frame.k]
        silhouette["headCentreOffsetPt"] = round2([-offset[0], offset[1]] if frame.mirrored else offset)
    result["silhouette"] = silhouette
    result["landmarks"] = lm
    result["palette"] = check_palette(frame, render, seen)
    result["blush"] = check_blush(frame, render, seen)
    result["markings"] = check_markings(frame, grid, render, seen)
    result["advisory"] = {"edgeDistance": edge_distances(render.sil, sheet, frame.k),
                          "partIoU": part_ious(frame, grid, render, seen),
                          "atlas": atlas_share(species, still, {views["body"], views["head"]})}
    if frame.mirrored:
        mirror_rows(result)
    gating = ("silhouette", "alignment", "landmarks", "palette", "blush", "markings")
    result["failed"] = [name for name in gating if not result[name]["pass"]]
    result["pass"] = not result["failed"]
    return result, {"frame": frame, "grid": grid, "render": render, "sheet": sheet, "still": still}


def mirror_rows(result):
    """Landmarks in the facing's own names and coordinates, as its source and readers name them."""
    rows = {}
    for name, row in result["landmarks"]["rows"].items():
        row = dict(row)
        for key in ("found", "model"):
            if key in row:
                row[key] = [0.0 - row[key][0], row[key][1]]
        rows[swap_sides(name)] = row
    result["landmarks"]["rows"] = rows


def upscale(image, zoom=ZOOM):
    return np.kron(image, np.ones((zoom, zoom, 1) if image.ndim == 3 else (zoom, zoom), image.dtype))


def label(draw, xy, text, fill):
    draw.text(xy, text, fill=fill, stroke_width=1, stroke_fill=(255, 255, 255))


def compare_image(result, parts, path):
    """crop | render | outlines (sheet blue, render red) with landmarks (model blue, found red, source green) | onion
    skin, at ZOOM times the crop's pixels, in the facing's own orientation, with the verdict above."""
    frame, grid, render, sheet = parts["frame"], parts["grid"], parts["render"], parts["sheet"]
    crop = grid.pad(frame.crop, 0)
    outside = ~grid.pad(np.ones(frame.sil.shape, bool), False)
    crop[outside] = CARD
    rows, cols = np.nonzero(sheet | (render.alpha > 0.05) | ~outside)
    y0, y1 = max(rows.min() - 2, 0), rows.max() + 3
    x0, x1 = max(cols.min() - 2, 0), cols.max() + 3
    view = (slice(y0, y1), slice(x0, x1))
    edges = (crop * 0.3 + 178).astype(np.uint8)
    edges[sheet & ~ndimage.binary_erosion(sheet)] = (30, 110, 255)
    edges[render.sil & ~ndimage.binary_erosion(render.sil)] = (230, 30, 60)
    onion = ((crop.astype(float) + render.rgb) / 2).astype(np.uint8)
    tiles = [upscale(t[view]) for t in (crop, render.rgb, edges, onion)]
    if frame.mirrored:
        tiles = [t[:, ::-1] for t in tiles]
    gap = 6
    width = tiles[0].shape[1]
    body = np.concatenate([np.pad(t, ((0, 0), (0, gap), (0, 0)), constant_values=255) for t in tiles], axis=1)
    image = Image.fromarray(body)
    draw = ImageDraw.Draw(image)

    def at(pt):
        x, y = grid.to_index(frame.to_frame_point(pt))
        X = (x - x0 + 0.5) * ZOOM
        if frame.mirrored:
            X = width - X
        return 2 * (width + gap) + X, (y - y0 + 0.5) * ZOOM

    for name, row in result["landmarks"]["rows"].items():
        marks = [("model", (30, 110, 255))] + ([("found", (0, 150, 60) if row.get("how") == "source" else (230, 30, 60))] if "found" in row else [])
        for key, colour in marks:
            if key in row:
                X, Y = at(row[key])
                draw.line([X - 5, Y, X + 5, Y], fill=colour, width=2)
                draw.line([X, Y - 5, X, Y + 5], fill=colour, width=2)
        if not row["pass"] and "model" in row:
            X, Y = at(row["model"])
            label(draw, (X + 6, Y - 12), name, (170, 0, 40))
    for i, title in enumerate(("sheet", "render", "outlines: sheet blue, render red", "onion skin")):
        label(draw, (i * (width + gap) + 4, 4), title, (40, 40, 40))
    lines = [verdict(result)]
    s, lm = result["silhouette"], result["landmarks"]
    lines.append(f"IoU {s['iou']:.3f} (min {s['threshold']}), head-aligned {s.get('iouHeadAligned', 'n/a')}; "
                 f"best-fit shift {result['alignment']['bestFitShiftPx']} px; landmarks {sum(r['pass'] for r in lm['rows'].values())}/{len(lm['rows'])} "
                 f"within {lm['thresholdPt']} pt" + (f"; {lm['error']}" if "error" in lm else ""))
    pal = result["palette"]["rows"]
    lines.append("palette: " + ", ".join(f"{k} {v.get('deltaE2000', 'missing')}" + ("" if v["pass"] else " FAIL") for k, v in pal.items()))
    lines.append("blush: " + (", ".join(f"{c['level']:.0%} core dE {c['coreDeltaE2000']}" for c in result["blush"]["cheeks"]) or "none")
                 + f"; markings shown {result['markings']['shown']} expected {result['markings']['expected']}")
    strip = Image.new("RGB", (image.width, 16 * len(lines) + 6), "white")
    sd = ImageDraw.Draw(strip)
    for i, text in enumerate(lines):
        sd.text((6, 4 + 16 * i), text, fill=(0, 0, 0) if i else ((0, 120, 40) if result["pass"] else (200, 0, 30)))
    full = Image.new("RGB", (image.width, image.height + strip.height), "white")
    full.paste(strip, (0, 0))
    full.paste(image, (0, strip.height))
    sheets.save_png(path, np.asarray(full))


def verdict(result):
    return (f"{result['view']} {result['still'].get('still')}: " + ("PASS" if result["pass"] else "FAIL: " + ", ".join(result["failed"])))


def phone_image(parts, path):
    """The render at PHONE_PPP pixels per point beside the crop drawn the same size, both on the ground line, so the
    two can be compared on a phone from the pull request."""
    frame, still = parts["frame"], parts["still"]
    crop = np.ascontiguousarray(frame.crop[:, ::-1]) if frame.mirrored else frame.crop
    h, w = frame.sil.shape
    gx, gy = frame.rec["anchorsCropPx"]["ground"]
    if frame.mirrored:
        gx = w - 1 - gx
    zoom = PHONE_PPP * frame.k
    size = (int(round(w * zoom)), int(round(h * zoom)))
    sheet = np.asarray(Image.fromarray(crop).resize(size, Image.LANCZOS))
    # The same window of model space, from the still, area-averaged (or repeated, below 3 ppp).
    f = still.ppp / PHONE_PPP
    start_x = still.root[0] + still.ppp * (-(gx + 0.5) * frame.k)
    start_y = still.root[1] + still.ppp * (-(gy + 0.5) * frame.k)
    layers = np.concatenate([still.alpha[..., None], still.premult], axis=2)
    wx = area_weights(size[0], layers.shape[1], start_x, f)
    wy = area_weights(size[1], layers.shape[0], start_y, f)
    sampled = np.moveaxis(np.tensordot(np.tensordot(wy, layers, axes=(1, 0)), wx, axes=(1, 1)), -1, 1)
    over = sampled[..., 1:] + (1 - sampled[..., :1]) * (frame.card / 255)
    render = np.clip(np.round(over * 255), 0, 255).astype(np.uint8)
    gap, top = 12, 22
    image = Image.new("RGB", (2 * size[0] + gap, size[1] + top), "white")
    image.paste(Image.fromarray(sheet), (0, top))
    image.paste(Image.fromarray(render), (size[0] + gap, top))
    draw = ImageDraw.Draw(image)
    draw.text((4, 5), f"sheet: {frame.rec['crop']}" + (" (mirrored)" if frame.mirrored else ""), fill=(40, 40, 40))
    draw.text((size[0] + gap + 4, 5), f"render: {still.meta.get('still')} at {PHONE_PPP}x", fill=(40, 40, 40))
    sheets.save_png(path, np.asarray(image))


def main(argv):
    parser = argparse.ArgumentParser(usage=__doc__)
    parser.add_argument("species")
    parser.add_argument("--still", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--landmarks")
    args = parser.parse_args(argv)
    try:
        result, parts = match(args.species, args.still, args.landmarks)
    except (OSError, ValueError, KeyError) as error:
        print(f"match: {type(error).__name__}: {error}", file=sys.stderr)
        return 2
    out = Path(args.out)
    sheets.write_json(out / "match.json", result)
    compare_image(result, parts, out / "compare.png")
    phone_image(parts, out / "phone.png")
    print(f"match: {verdict(result)}; IoU {result['silhouette']['iou']:.3f}; written to {out}")
    return 0 if result["pass"] else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
