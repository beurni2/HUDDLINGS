"""Measures the turnaround (spec section 5b, phase 2; Appendix F): landmarks per
view, proportions and outline widths, in points at the companion's 164 pt
sitting height, from the ground point under its seat (where the body bone sits,
section 5b), y growing downward.

    python3 characters/refprep/measure.py dog

Reads the crops listed in ref/panels.json (run crop.py first), and the
hand-placed points and each view's required landmark set in refmap/landmarks.json;
fails when a view lacks one of its set or a hand point is off the drawing. Writes ref/measurements.json, the cut-out
silhouettes ref/silhouettes/<view>.png and an overlay per view in
ref/overlays/landmarks-<view>.png, every point drawn and named, to be checked by eye.

Every landmark records how it was found. "auto" points come from the colours the
sheet paints (the dark eyes and nose, the pink mouth, the blue collar, the gold
tag, the tan ears) and the silhouette; "hand" points were placed on a zoomed crop
and are checked on the overlay like the rest. The rules are in the functions
below, one per landmark."""
import sys

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage
from skimage.morphology import skeletonize

import sheets
import silhouette

NOSE_CORE = 5  # px: the mouth's lines are 2 to 4 px thick on the master sheet, the nose 8 or more
EAR_EDGE = 4  # px: an ear's outline beyond its tan
LINE_MAX = 5  # px: no line on the master sheet is this thick
TOE_DEPTH = 6  # L* units: a toe line's dip below the fur beside it
OUTER_BAND = 4  # px inside the silhouette's edge that hold its outline (2 to 3 px wide on the master sheet)
HEIGHT_PT = 164  # spec section 5: ground to the top of the head, sitting, front view
TURNAROUND = {"front": "master.turnaround.front", "threeQuarter.L": "master.turnaround.three-quarter",
              "side.L": "master.turnaround.side", "back": "master.turnaround.back"}


class Classes:
    """Masks of the colours the sheets paint, inside a silhouette."""

    def __init__(self, rgb, sil):
        lab = sheets.to_lab(rgb)
        L, a, b = lab[..., 0], lab[..., 1], lab[..., 2]
        C = np.hypot(a, b)
        hue = np.degrees(np.arctan2(b, a)) % 360
        self.L, self.C = L, C
        self.sil = sil
        self.dark = sil & (L < 32)
        self.line = sil & (L < 60)
        self.pink = sil & (a > 16) & (L > 45) & (hue < 40)
        self.blue = sil & (b < -12)
        self.gold = sil & (b > 40) & (L > 65)
        self.tan = sil & (C > 20) & (hue > 40) & (hue < 80) & (L >= 64) & (L < 86)
        # The tan in shade, as on the ears' lower half: darker, as saturated, but lighter than an outline, so
        # an ear's grown region stops at its bottom line instead of leaking into the tan below it.
        self.shaded_tan = sil & (C > 30) & (hue > 40) & (hue < 80) & (L >= 55) & (L < 86)


def disk(radius):
    y, x = np.mgrid[-radius:radius + 1, -radius:radius + 1]
    return x * x + y * y <= radius * radius + radius


def components(mask, minimum=1):
    labels, count = ndimage.label(mask)
    found = []
    for index in range(1, count + 1):
        part = labels == index
        if part.sum() >= minimum:
            found.append(part)
    return sorted(found, key=lambda m: -m.sum())


def centroid(mask):
    y, x = ndimage.center_of_mass(mask)
    return [float(x), float(y)]


def middle_of_longest_run(row):
    xs = np.nonzero(row)[0]
    runs = np.split(xs, np.nonzero(np.diff(xs) > 1)[0] + 1)
    longest = max(runs, key=len)
    return float((longest[0] + longest[-1]) / 2)


def head_top(sil):
    """The middle of the longest run of the silhouette's top row: on a tuft with two lobes, one of them, never
    the gap between."""
    top = int(np.nonzero(sil)[0].min())
    return [middle_of_longest_run(sil[top]), float(top)]


def top_point(mask, rows=2):
    """The middle of a region's top edge: the mean x of its top rows, which JPEG grain breaking one row into
    pieces cannot move far."""
    ys, xs = np.nonzero(mask)
    top = ys.min()
    return [float(xs[ys < top + rows].mean()), float(top)]


def bottom_point(mask, rows=2):
    ys, xs = np.nonzero(mask)
    low = ys.max()
    return [float(xs[ys > low - rows].mean()), float(low)]


def eyes(cls, count):
    """The largest dark blobs (iris and pupil, catchlights filled) in the top 60% of the drawing."""
    ys = np.nonzero(cls.sil)[0]
    upper = np.zeros(cls.sil.shape, bool)
    upper[:int(ys.min() + 0.6 * (ys.max() - ys.min())), :] = True
    blobs = [m for m in components(ndimage.binary_fill_holes(cls.dark) & upper, 30)][:count]
    return sorted(blobs, key=lambda m: centroid(m)[0])


def nose_and_mouth(cls, eye_masks, facing):
    """The nose is the dark blob nearest the eyes' centre line below them (on the profile, the one at the
    snout's tip); the mouth is the pink opening and the dark line around it."""
    eye_bottom = max(np.nonzero(m)[0].max() for m in eye_masks)
    eye_top = min(np.nonzero(m)[0].min() for m in eye_masks)
    candidates = [m for m in components(cls.dark, 8) if not any((m & e).any() for e in eye_masks)]
    if facing == "left":
        candidates = [m for m in candidates if np.nonzero(m)[0].min() >= eye_top]
        merged = min(candidates, key=lambda m: np.nonzero(m)[1].min())
    else:
        candidates = [m for m in candidates if np.nonzero(m)[0].min() >= eye_top]
        mid = np.mean([centroid(e)[0] for e in eye_masks])
        merged = min(candidates, key=lambda m: abs(centroid(m)[0] - mid) + abs(np.nonzero(m)[0].min() - eye_bottom))
    # A thin dark line joins the nose to the smile on these sheets, as dark as the nose itself. The nose is
    # the blob thicker than NOSE_CORE px: an opening with that disk leaves out the lines.
    nose = components(ndimage.binary_opening(merged, disk(NOSE_CORE // 2)), 4)[0]
    mouth_open = None
    below = [m for m in components(cls.pink, 6) if np.nonzero(m)[0].min() > np.nonzero(nose)[0].min()]
    if below:
        # The mouth opening is the pink blob just below the nose.
        mouth_open = min(below, key=lambda m: abs(centroid(m)[0] - centroid(nose)[0]))
    return nose, mouth_open


def mouth_corners(cls, nose, mouth_open, eye_masks):
    """The ends of the mouth's line, below the nose. Open, it is the dark line joined to the pink opening,
    down to 40% of the opening's height.
    Closed (the profile's smile), it is the first dark line under the nose inside the head, between the
    nose and the eye, the eye's own lines left out: the outline is left out too, so the smile's front end
    stops where it meets the snout's edge. Returns the leftmost and rightmost ends."""
    line = cls.line.copy()
    if mouth_open is not None:
        # The smile's ends can curl up level with the nose's bottom, so only the nose itself and what lies
        # above its middle are left out.
        line[:int(centroid(nose)[1]), :] = False
        line &= ~nose
        seed = ndimage.binary_dilation(mouth_open, iterations=2)
        pieces, _ = ndimage.label(line | (seed & cls.sil), np.ones((3, 3), bool))
        keep = np.unique(pieces[seed & (pieces > 0)])
        mouth = np.isin(pieces, keep[keep > 0])
        # The corners are where the smile's upper line ends, level with the top of the opening; the
        # lower lip's line (lower down, turned toward the viewer on the three-quarter) is not a corner.
        rows = np.nonzero(mouth_open)[0]
        mouth[int(rows.min() + 0.4 * (rows.max() - rows.min())) + 1:, :] = False
    else:
        line[:np.nonzero(nose)[0].max() + 1, :] = False
        inside = line & ndimage.binary_erosion(cls.sil, iterations=3)
        nose_left = np.nonzero(nose)[1].min()
        eye_x = min(centroid(e)[0] for e in eye_masks)
        inside[:, :nose_left] = False
        inside[:, int(eye_x):] = False
        for eye in eye_masks:
            inside &= ~ndimage.binary_dilation(eye, iterations=4)
        mouth = min(components(inside, 5), key=lambda m: np.nonzero(m)[0].min())
    ys, xs = np.nonzero(mouth)
    left, right = xs.argmin(), xs.argmax()
    return [float(xs[left]), float(ys[left])], [float(xs[right]), float(ys[right])]


def above_collar(band):
    """Everything above the collar: in each column it crosses, above its top; elsewhere above its lowest row."""
    rows = np.arange(band.shape[0])[:, None]
    limit = np.where(band.any(axis=0), band.argmax(axis=0), np.nonzero(band)[0].max())
    return rows < limit[None, :]


def ears(cls, count, band):
    """The largest tan regions above the collar. Each one's topmost point, where it comes out from behind the
    head, is the ear's root. Its tip is the lowest point once the region is grown into the shaded tan of
    the ear's lower half (downward only, so the head's tan patches higher up never join it)."""
    above = above_collar(band)
    found = components(ndimage.binary_opening(cls.tan & above, np.ones((2, 2), bool)), 200)[:count]
    if len(found) < count:
        raise ValueError(f"found {len(found)} ear(s) of the {count} this view shows")
    found = sorted(found, key=lambda m: centroid(m)[0])
    grown = []
    for core in found:
        lower = np.zeros_like(core)
        lower[int(centroid(core)[1]):, :] = True
        grown.append(core | ndimage.binary_propagation(core & lower, mask=(cls.shaded_tan | core) & above & lower))
    return found, grown


def collar(cls):
    band = components(cls.blue, 50)[0]
    ys, xs = np.nonzero(band)
    left = xs == xs.min()
    right = xs == xs.max()
    # The collar line's ends are named by the sheet's sides: .L and .R are the companion's own.
    return band, {"collar": centroid(band), "collar.line.sheetLeft": [float(xs.min()), float(ys[left].mean())],
                  "collar.line.sheetRight": [float(xs.max()), float(ys[right].mean())]}


def tag(cls):
    """The gold heart, and its top: the heart's middle (its centroid's x) on its top row, where it hangs from
    its ring; a heart's top row is its two lobes, with the notch between."""
    found = components(cls.gold, 40)
    if not found:
        return None, None
    top = float(np.nonzero(found[0])[0].min())
    return found[0], [centroid(found[0])[0], top]


def line_width(ink):
    """The mean width of a set of lines: their area over the length of their centre lines."""
    length = skeletonize(ink).sum()
    return float(ink.sum() / length) if length else 0.0


def outer_width(cls):
    """The mean width of the outer outline, in px: the line within OUTER_BAND px of the silhouette's edge.
    A line pixel is one darker than halfway between the fur and the line's core (L* 70) and warm (C* above
    12), so a line's soft edge counts as much as it covers. Dark areas thicker than LINE_MAX px are fills
    (the ears' shaded tan), not lines."""
    ink = cls.sil & (cls.L < 70) & (cls.C > 12)
    fills = ndimage.binary_dilation(ndimage.binary_opening(ink, disk(LINE_MAX // 2)), iterations=1)
    line = ink & ~fills
    near_edge = cls.sil & ~ndimage.binary_erosion(cls.sil, iterations=OUTER_BAND)
    outer = components(line & near_edge, 20)
    return line_width(np.any(outer, axis=0) if outer else line & near_edge)


def toe_lines(L, sil, paws):
    """The toe lines, the sheet's clearest inner lines: their width at half their depth, measured along the
    rows through each paw (they run down the paw), and their depth in L* below the fur beside them. A toe
    line is a dip in L* at least TOE_DEPTH deep, lighter than L* 58 (darker dips are outlines), away from
    the silhouette's edge."""
    inside = ndimage.binary_erosion(sil, iterations=3)
    found = []
    for cx, cy in paws:
        cx, cy = int(round(cx)), int(round(cy))
        for y in range(cy - 3, cy + 7):
            for x in range(cx - 14, cx + 15):
                if not inside[y, x] or not (L[y, x] < L[y, x - 1] and L[y, x] <= L[y, x + 1]):
                    continue
                depth = min(L[y, x - 5:x].max(), L[y, x + 1:x + 6].max()) - L[y, x]
                if depth < TOE_DEPTH or L[y, x] < 58:
                    continue
                half = L[y, x] + depth / 2
                i, j = x, x
                while L[y, i - 1] < half:
                    i -= 1
                while L[y, j + 1] < half:
                    j += 1
                left = i - (half - L[y, i]) / (L[y, i - 1] - L[y, i])
                right = j + (half - L[y, j]) / (L[y, j + 1] - L[y, j])
                found.append((right - left, depth))
    if not found:
        return None
    widths, depths = zip(*found)
    return {"widthPx": round(float(np.median(widths)), 2), "depthL": round(float(np.median(depths)), 1),
            "samples": len(found)}


def check_hand(view, hand, sil):
    """A hand-placed point must sit on the drawing: a typo or a point placed on the wrong panel fails."""
    for name, (x, y) in hand.items():
        x, y = int(round(x)), int(round(y))
        if not (0 <= y < sil.shape[0] and 0 <= x < sil.shape[1] and sil[y, x]):
            raise ValueError(f"{view}: the hand-placed {name} at {[x, y]} (crop px) is outside the silhouette")


def check_required(view, points, required, hand=()):
    """Every landmark the view shows must have been found, and every hand-placed point must be one of them or
    the seat: a finder that comes back empty, or a misspelt hand point, fails the run."""
    missing = sorted(set(required) - set(points))
    if missing:
        raise ValueError(f"{view}: no {', '.join(missing)}; refmap/landmarks.json says this view shows them")
    unknown = sorted(set(hand) - set(required) - {"seat"})
    if unknown:
        raise ValueError(f"{view}: the hand-placed {', '.join(unknown)} is not in this view's required set")


def measure_view(view, rgb, hand):
    sil = silhouette.cut_out(rgb)
    cls = Classes(rgb, sil)
    ys, xs = np.nonzero(sil)
    points, method = {}, {}

    def put(name, xy, how):
        points[name] = [round(float(xy[0]), 2), round(float(xy[1]), 2)]
        method[name] = how

    facing = {"front": "front", "back": "back"}.get(view, "left")
    put("head.top", head_top(sil), "auto: the middle of the longest run of the silhouette's top row")
    ground_y = float(ys.max())
    band, collar_points = collar(cls)
    for name, xy in collar_points.items():
        put(name, xy, "auto: the blue band's centroid" if name == "collar" else "auto: the blue band's end on that side of the sheet")
    collar_top = int(np.nonzero(band)[0].min())
    check_hand(view, hand, sil)
    hand = dict(hand)
    seat = hand.pop("seat", None)
    if seat is None and facing == "left":
        raise ValueError(f"{view}: no seat; a turned view's origin is the seat placed by hand (refmap/landmarks.json)")
    if seat is not None:
        put("ground", [seat[0], ground_y], "hand: the silhouette's lowest row, under the seat placed by hand (the haunch's underside)")
    else:
        # Facing or turned away, the seat is on the body's midline: the middle of the body below the collar,
        # which the tail does not shift in these views.
        body = sil.copy()
        body[:int(np.nonzero(band)[0].max()) + 1, :] = False
        put("ground", [centroid(body)[0], ground_y], "auto: the silhouette's lowest row, under the middle of the body below the collar")
    tag_mask, tag_top = tag(cls)
    if tag_top is not None:
        put("tag.top", tag_top, "auto: the gold heart's top row, at its middle, where it hangs from its ring")
    eye_masks = []
    if view != "back":
        eye_masks = eyes(cls, 1 if view == "side.L" else 2)
        if view == "side.L":
            put("eye.L", centroid(eye_masks[0]), "auto: the dark eye's centroid, catchlights filled")
        else:
            put("eye.R", centroid(eye_masks[0]), "auto: the left-hand dark eye's centroid on the sheet (the dog's right eye)")
            put("eye.L", centroid(eye_masks[1]), "auto: the right-hand dark eye's centroid on the sheet (the dog's left eye)")
        nose, mouth_open = nose_and_mouth(cls, eye_masks, facing)
        put("nose", centroid(nose), "auto: the centroid of the nose's dark blob, the lines that join it to the mouth left out")
        left, right = mouth_corners(cls, nose, mouth_open, eye_masks)
        if view == "side.L":
            put("mouth.L", right, "auto: the mouth line's back end (the profile shows one corner)")
        else:
            put("mouth.R", left, "auto: the left end of the mouth line on the sheet")
            put("mouth.L", right, "auto: the right end of the mouth line on the sheet")
    ear_masks, ear_reach = ears(cls, 1 if view == "side.L" else 2, band)
    if view == "side.L":
        names = ["L"]
    elif view == "back":
        names = ["L", "R"]  # seen from behind, the dog's left ear is on the sheet's left
    else:
        names = ["R", "L"]
    for side, mask, reach in zip(names, ear_masks, ear_reach):
        put(f"ear.{side}.root", top_point(mask), "auto: the ear's topmost point, where it comes out from behind the head")
        put(f"ear.{side}.tip", bottom_point(reach), "auto: the ear's lowest point, its shaded lower half included")
    for name, xy in hand.items():
        put(name, xy, "hand: placed on the sheet zoomed six to ten times, checked on the overlay")
    # The head runs from its top to the chin: the collar's top under the nose, where the chin overlaps the
    # collar. Where the collar doesn't pass under the nose (the profile, the back), the head is measured
    # down to the collar's top and no chin is recorded.
    head_bottom = float(collar_top)
    if "nose" in points:
        nose_x = int(round(points["nose"][0]))
        column = np.nonzero(band[:, nose_x])[0]
        if len(column):
            head_bottom = float(column.min())
            put("chin", [nose_x, head_bottom], "auto: the collar's top under the nose (the chin overlaps the collar)")
    shape = {"earMasks": ear_reach, "headBottom": head_bottom,
             "eyeHeightsPx": [int(np.ptp(np.nonzero(m)[0]) + 1) for m in eye_masks]}
    return sil, cls, points, method, shape


def head_region(sil, ear_masks, top, bottom):
    """The head between its top and its bottom, the ears and their outlines taken out: what stays joined to
    its middle once the ears, grown by EAR_EDGE px, are cut away."""
    head = sil.copy()
    head[:int(top), :] = False
    head[int(bottom):, :] = False
    for ear in ear_masks:
        head &= ~ndimage.binary_dilation(ndimage.binary_fill_holes(ear), iterations=EAR_EDGE)
    return components(head)[0]


def head_width(sil, ear_masks, top, bottom, middle_x):
    """The head's widest row, between its top and its bottom: on each row, the run of the drawing through the
    face's middle (under the nose), stopped by the ears. On the dog's front view that is the cheeks, which
    meet the ears' tan with no line between, so the ears are grown by one pixel only."""
    blocked = ~sil
    for ear in ear_masks:
        blocked |= ndimage.binary_dilation(ndimage.binary_fill_holes(ear))
    x = int(round(middle_x))
    widths = []
    for row in range(int(top), int(bottom)):
        if blocked[row, x]:
            continue
        left = right = x
        while left > 0 and not blocked[row, left - 1]:
            left -= 1
        while right < blocked.shape[1] - 1 and not blocked[row, right + 1]:
            right += 1
        widths.append((right - left + 1, row, left, right))
    return max(widths)


def to_points(points, origin, scale):
    return {k: [round((x - origin[0]) * scale, 1), round((y - origin[1]) * scale, 1)] for k, (x, y) in points.items()}


def overlay(rgb, sil, points, path, span=None):
    """The crop at four times its size, the silhouette's edge in blue, every landmark a red cross with its
    name, and the head's widest row as a green line."""
    zoom = 4
    image = Image.fromarray(rgb).resize((rgb.shape[1] * zoom, rgb.shape[0] * zoom), Image.NEAREST)
    edge = sil & ~ndimage.binary_erosion(sil)
    pixels = np.asarray(image).copy()
    big = np.kron(edge, np.ones((zoom, zoom), bool))
    pixels[big] = (40, 110, 255)
    image = Image.fromarray(pixels)
    draw = ImageDraw.Draw(image)
    if span:
        _, row, left, right = span
        y = row * zoom + zoom / 2
        draw.line([left * zoom, y, (right + 1) * zoom, y], fill=(0, 170, 60), width=2)
    # Crosses first, then each name beside its cross where it overlaps no other name.
    taken = []
    for name, (x, y) in points.items():
        cx, cy = x * zoom + zoom / 2, y * zoom + zoom / 2
        draw.line([cx - 6, cy, cx + 6, cy], fill=(230, 0, 60), width=2)
        draw.line([cx, cy - 6, cx, cy + 6], fill=(230, 0, 60), width=2)
    for name, (x, y) in sorted(points.items(), key=lambda item: (item[1][1], item[1][0])):
        cx, cy = x * zoom + zoom / 2, y * zoom + zoom / 2
        left, top, right, bottom = draw.textbbox((0, 0), name)
        w, h = right - left + 2, bottom - top + 2
        for dx, dy in [(5, 3), (5, -h - 3), (-w - 5, 3), (-w - 5, -h - 3), (5, h + 4), (5, -2 * h - 4),
                       (-w - 5, h + 4), (-w - 5, -2 * h - 4), (5, 2 * h + 6), (-w - 5, 2 * h + 6)]:
            box = (cx + dx, cy + dy, cx + dx + w, cy + dy + h)
            if not any(box[0] < b[2] and b[0] < box[2] and box[1] < b[3] and b[1] < box[3] for b in taken):
                break
        taken.append(box)
        draw.text((box[0] + 1, box[1] - top + 1), name, fill=(150, 0, 40), stroke_width=1, stroke_fill=(255, 255, 255))
    sheets.save_png(path, np.asarray(image))


def measure(species):
    ref = sheets.ROOT / "characters" / species / "ref"
    panels = {p["id"]: p for p in sheets.json.loads((ref / "panels.json").read_text())["panels"]}
    hand_file = sheets.json.loads((sheets.ROOT / "characters" / species / "refmap" / "landmarks.json").read_text())
    views, raw = {}, {}
    for view, panel_id in TURNAROUND.items():
        panel = panels[panel_id]
        x0, y0, w, h = panel["box"]
        rgb = sheets.load_sheet(species, panel["sheet"])[y0:y0 + h, x0:x0 + w]
        hand = {k: v for k, v in hand_file["hand"].get(view, {}).items() if not k.startswith("_")}
        # Hand points are written in the sheet's pixels; measurement works in the crop's.
        hand = {k: [v[0] - x0, v[1] - y0] for k, v in hand.items()}
        sil, cls, points, method, shape = measure_view(view, rgb, hand)
        check_required(view, points, hand_file["required"][view], hand)
        head = head_region(sil, shape["earMasks"], points["head.top"][1], shape["headBottom"])
        shape["headCentre"] = [round(v, 2) for v in centroid(head)]
        # The head's width is the front view's: elsewhere the ears or the turn hide its sides.
        span = (head_width(sil, shape["earMasks"], points["head.top"][1], shape["headBottom"], points["nose"][0])
                if view == "front" else None)
        sheets.save_png(ref / "silhouettes" / f"{view}.png", (sil * 255).astype(np.uint8))
        overlay(rgb, sil, points, ref / "overlays" / f"landmarks-{view}.png", span)
        raw[view] = (panel, sil, cls, points, method, shape, span)
    for view, (panel, sil, cls, points, method, shape, span) in raw.items():
        origin = points["ground"]
        # Each view to the companion's height: the sheet draws its views at slightly different sizes.
        scale = HEIGHT_PT / (origin[1] - points["head.top"][1])
        paws = [xy for name, xy in points.items() if name.startswith("paw.")]
        outer = outer_width(cls)
        toes = toe_lines(cls.L, sil, paws) if paws else None
        # The outline's own depth below the fur, to compare with the toe lines'.
        fur = float(np.median(cls.L[sil & (cls.L >= 88) & (cls.C < 20)]))
        outline_depth = fur - float(np.median(cls.L[sil & ~ndimage.binary_erosion(sil, iterations=2) & (cls.L < 70)]))
        views[view] = {
            "crop": panel["id"], "sheet": panel["sheet"], "box": panel["box"], "facing": panel.get("facing"),
            "scale": round(scale, 5),
            "anchors": {"ground": origin, "headTop": points["head.top"], "headCentre": shape["headCentre"]},
            "silhouette": f"silhouettes/{view}.png", "silhouetteAreaPx": int(sil.sum()),
            "heightPx": round(origin[1] - points["head.top"][1], 2),
            "headBottomPx": shape["headBottom"],
            "outlinePx": {"outer": round(outer, 2), "outerDepthL": round(outline_depth, 1), "toeLines": toes},
            "eyeHeightsPx": shape["eyeHeightsPx"],
            "landmarksPx": points, "landmarks": to_points(points, origin, scale), "method": method,
        }
    front = views["front"]
    scale = front["scale"]
    lm = front["landmarks"]
    head_height = (front["headBottomPx"] - front["landmarksPx"]["head.top"][1]) * scale
    width_px, row, left, right = raw["front"][6]
    front["headWidthPx"] = {"width": width_px, "row": row, "left": left, "right": right}
    head_w = width_px * scale
    outer = float(np.mean([v["outlinePx"]["outer"] * v["scale"] for v in views.values()]))
    toes = [(v["outlinePx"]["toeLines"], v["scale"]) for v in views.values() if v["outlinePx"]["toeLines"]]
    toe_width = float(np.mean([t["widthPx"] * k for t, k in toes]))
    toe_depth = float(np.mean([t["depthL"] for t, _ in toes]))
    proportions = {
        "headShareOfHeight": round(head_height / HEIGHT_PT, 3),
        "headWidth": round(head_w, 1),
        "headHeight": round(head_height, 1),
        "eyeSpacingShareOfHead": round(abs(lm["eye.L"][0] - lm["eye.R"][0]) / head_w, 3),
        "eyeHeightShareOfHead": round(float(np.mean(front["eyeHeightsPx"])) * scale / head_height, 3),
        "eyeLineShareOfHead": round((float(np.mean([lm["eye.L"][1], lm["eye.R"][1]])) - lm["head.top"][1]) / head_height, 3),
    }
    result = {"species": species, "unit": "pt", "height": HEIGHT_PT, "proportions": proportions,
              "outline": {"outerPt": round(outer, 2), "toeLinesHalfDepthPt": round(toe_width, 2),
                          "toeLinesDepthL": round(toe_depth, 1)},
              "views": views}
    sheets.write_json(ref / "measurements.json", result)
    return result


def main(argv):
    if len(argv) != 1:
        print(__doc__)
        return 2
    result = measure(argv[0])
    print(f"measure: {len(result['views'])} views; proportions {result['proportions']}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
