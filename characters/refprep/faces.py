"""The face panels' crop records (spec section 5b, The sheet match: Faces, L525;
L529; DECISIONS.md 14): each expression-sheet panel a face preset is judged
against, with its view, facing, scale, roll, anchors and mask.

    python3 characters/refprep/faces.py dog

Reads refmap/faces.json (written by hand: which panels judge which preset,
what each panel draws, its anchors placed by hand in the sheet's pixels, the
head's width across its cheeks, and the boxes of labels, motion marks and
neighbours' slivers to leave out) and ref/panels.json (run crop.py first).
Writes ref/faces.json (the records model.py puts into model.json as
faceCrops), a mask per panel in ref/faces/<panel>.png (255 where the panel is
compared, 0 where a box leaves it out) and an overlay per panel in
ref/overlays/faces-<panel>.png, every anchor and the head's width drawn, to be
checked by eye.

Each anchor is placed by hand, because the automatic nose finder lands on an
eye in 4 of the 10 expression panels (phase 3 plan, section 5), then refined
by the rule for its feature below, the same rule the Faces check applies to a
render (characters/sheetmatch/facematch.py), so the two are measured alike. A
hand anchor further than SNAP_PX from its refined point, or one whose feature
is out of order (a nose that is not below and between the eyes, a corner on
the wrong side, a head top below the eyes), fails the run.

Rule R3: no record may name the Sad, Angry or Pout panels, the drooped ears,
or any panel whose label pairs a face with them, and no preset outside the
spec's list; a mouth the sheet draws with its ends below its middle gets no
corners, so nothing is ever held to it."""
import sys

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

import measure
import sheets

# Spec L476-498: the presets clips and playEmotion use. hungry and huffy are new drawings with no panel.
PRESETS = ("neutral", "happy", "excited", "laughing", "curious", "surprised", "shy", "proud", "mischievous", "content",
           "sleepy", "listening", "tender", "singing", "blissful", "ticklish", "hungry", "huffy", "sly")
# Rule R3: faces never drawn or used. A panel whose id or label holds one of these words gets no record.
FORBIDDEN = ("sad", "angry", "pout", "tear", "droop")
EYE_STATES = {"open", "happy", "squeeze", "closed", "sleepy", "wide", "wink", "sparkle"}  # L450-457
MOUTH_STATES = {"smile", "open", "laugh", "o", "cheeky", "yawn", "pant", "growl"}  # L461-468
# What a panel may draw that no preset uses: a short mouth with its ends below its middle (never held, R3), or
# no face at all (the ear positions).
UNHELD = {"downturned", "none"}
FACE_ANCHORS = ("head.top", "nose", "eye.R", "eye.L", "mouth.R", "mouth.L")
SNAP_PX = 2.5  # crop px: how far a hand anchor may lie from its feature as the rule finds it
REACH_SHARE = 0.08  # of the head's width: how far from a seed the rules look for its feature
TOUCH_SHARE = 0.05  # of the head's width: how near a seed a piece of the mouth must come to count as the mouth
TOP_SHARE = 0.15  # of the head's width: the head top is the highest line this near its seed (the tuft, not a perked ear)
NOSE_CORE = measure.NOSE_CORE
EYE_MIN_PX = 20  # an eye's mark is at least this many pixels; less is grain
SOFT_L = (50, 70)  # L*: a mark's pixel counts in full at the first, not at all at the second (around the line's 60)
END_PX = 2.0  # pixels' worth of a mouth's weight beyond its corner, so one pixel of grain does not move the corner
WIDEST_SHARE = 0.98  # the hand-placed row's run must be this share of the cheeks' widest at least
ZOOM = 4


def forbidden(panel):
    """Whether rule R3 bars a panel: its id or its printed label names a face or ears never used."""
    text = f"{panel['id']} {panel.get('label', '')}".lower()
    return any(word in text for word in FORBIDDEN)


def frame(roll_deg):
    """The head's own axes on the sheet: across, toward the dog's left (the sheet's right in a front view), and
    down, from its roll (the eye line's angle, clockwise, y down)."""
    t = np.radians(roll_deg)
    return np.array([np.cos(t), np.sin(t)]), np.array([-np.sin(t), np.cos(t)])


def roll_of(eye_r, eye_l):
    return float(np.degrees(np.arctan2(eye_l[1] - eye_r[1], eye_l[0] - eye_r[0])))


def coords(shape):
    ys, xs = np.mgrid[:shape[0], :shape[1]]
    return xs, ys


def near(mask, seed, reach):
    """The connected piece of a mask nearest a seed point, if one comes within reach of it."""
    best = None
    for piece in measure.components(mask):
        ys, xs = np.nonzero(piece)
        d = float(np.hypot(xs - seed[0], ys - seed[1]).min())
        if d <= reach and (best is None or d < best[0]):
            best = (d, piece)
    return None if best is None else best[1]


def classes(rgb, keep):
    """The colour classes of measure.py over the kept pixels (a panel without its left-out boxes, or a render)."""
    return measure.Classes(rgb, keep)


def soft_centroid(L, region, solid=None):
    """A mark's centroid with each pixel of its region weighted by how dark it is: in full at L* SOFT_L[0] and darker,
    not at all at SOFT_L[1], and solid pixels (a catchlight inside an eye) in full. A threshold moves a mark's edge by
    whole pixels as the drawing shifts by fractions of one; the weights move it smoothly, so the panel and a render
    laid on its pixels are measured alike."""
    weight = np.where(region, np.clip((SOFT_L[1] - L) / (SOFT_L[1] - SOFT_L[0]), 0, 1), 0.0)
    if solid is not None:
        weight[solid] = 1.0
    ys, xs = np.mgrid[:L.shape[0], :L.shape[1]]
    return [float((weight * xs).sum() / weight.sum()), float((weight * ys).sum() / weight.sum())]


def find_nose(cls, seed, reach, allowed=None):
    """The nose: of the dark blobs with a core thicker than the lines that join it to the mouth (measure.py's rule),
    the one nearest the seed; the soft centroid of its core grown back by the opening's radius and two pixels more
    for its edge. Returns the point and the core."""
    dark = cls.dark if allowed is None else cls.dark & allowed
    cored = [m for m in measure.components(dark, 8) if ndimage.binary_opening(m, measure.disk(NOSE_CORE // 2)).any()]
    blob = near(np.any(cored, axis=0), seed, reach) if cored else None
    if blob is None:
        return None, None
    core = ndimage.binary_opening(blob, measure.disk(NOSE_CORE // 2))
    region = ndimage.binary_dilation(core, measure.disk(NOSE_CORE // 2 + 2))
    if allowed is not None:
        region &= allowed
    return soft_centroid(cls.L, region), core


def find_eye(cls, seed, reach, exclude, allowed=None):
    """An eye: the dark mark nearest the seed (its line and fill darker than L* 60, holes such as the catchlight
    filled): an open eye's iris and rim, or a closed, happy or winking eye's arc. The soft centroid of the mark and
    two pixels round it, its filled holes counted in full."""
    line = cls.line if allowed is None else cls.line & allowed
    # Only holes smaller than the reach squared are filled (a catchlight, the eye's white): a closed outline round the
    # whole head, as a render draws it, holds no eye.
    holes, count = ndimage.label(ndimage.binary_fill_holes(line) & ~line)
    sizes = ndimage.sum(np.ones(holes.shape), holes, range(1, count + 1))
    line = (line | np.isin(holes, 1 + np.nonzero(sizes <= reach ** 2)[0])) & ~exclude
    marks = [m for m in measure.components(line, EYE_MIN_PX)]
    mark = near(np.any(marks, axis=0), seed, reach) if marks else None
    if mark is None:
        return None, None
    region = ndimage.binary_dilation(mark, iterations=2) & ~exclude
    if allowed is not None:
        region &= allowed
    return soft_centroid(cls.L, region, mark & ~cls.line), mark


def find_mouth(cls, seeds, nose, nose_core, across, down, reach, touch, allowed=None):
    """The mouth's corners: the ends of its line, at the tips of its upturned curls, or an open mouth's or an o's
    sides. The mouth is the line and pink below the nose's middle, the nose itself left out, in the pieces that
    come within touch of a seed; its corners are its farthest reaches each way across the head, found softly (see
    soft_end) over the mouth and a pixel round it, its pixels weighted by darkness and its pink in full."""
    xs, ys = coords(cls.L.shape)
    s = (xs - nose[0]) * across[0] + (ys - nose[1]) * across[1]
    t = (xs - nose[0]) * down[0] + (ys - nose[1]) * down[1]
    seed_s = [(p[0] - nose[0]) * across[0] + (p[1] - nose[1]) * across[1] for p in seeds]
    seed_t = [(p[0] - nose[0]) * down[0] + (p[1] - nose[1]) * down[1] for p in seeds]
    window = (s >= min(seed_s) - reach) & (s <= max(seed_s) + reach) & (t >= min(seed_t) - reach) & (t >= 0)
    window &= t <= max(seed_t) + 3 * reach
    mouth = (cls.line | cls.pink) & window & ~ndimage.binary_dilation(nose_core, iterations=2)
    if allowed is not None:
        mouth &= allowed
    pieces, count = ndimage.label(mouth, np.ones((3, 3), bool))
    keep = np.zeros(mouth.shape, bool)
    for index in range(1, count + 1):
        piece = pieces == index
        py, px = np.nonzero(piece)
        if any(np.hypot(px - x, py - y).min() <= touch for x, y in seeds):
            keep |= piece
    if not keep.any():
        return None, None, keep
    region = ndimage.binary_dilation(keep) & window
    if allowed is not None:
        region &= allowed
    weight = np.where(region, np.clip((SOFT_L[1] - cls.L) / (SOFT_L[1] - SOFT_L[0]), 0, 1), 0.0)
    weight[region & cls.pink] = 1.0
    return soft_end(-s, weight, xs, ys), soft_end(s, weight, xs, ys), keep


def soft_end(reach, weight, xs, ys):
    """Where a weighted mark ends along a direction: the reach at which END_PX pixels' worth of its weight lies beyond,
    then the weighted mean of the pixels over the last two pixels up to that reach, tapered linearly, so a single
    pixel of grain does not set the end and the end moves smoothly as the drawing shifts."""
    on = weight > 0
    order = np.argsort(-reach[on])
    far, w = reach[on][order], weight[on][order]
    end = far[min(int(np.searchsorted(np.cumsum(w), END_PX)), len(far) - 1)]
    taper = weight * np.clip((reach - end + 2.0) / 2.0, 0, 1)
    return [float((taper * xs).sum() / taper.sum()), float((taper * ys).sum() / taper.sum())]


def head_line(rgb):
    """Line and fill darker or warmer than the fur and the card: silhouette.py's wall, the outline the cut-out
    stops at, which is where the head ends at its faint top."""
    lab = sheets.to_lab(rgb)
    L, C = lab[..., 0], np.hypot(lab[..., 1], lab[..., 2])
    return ((L < 93) & (C > 11)) | (L < 82)


def find_head_top(rgb, keep, seed, radius, allowed=None):
    """The head's top: of the outline within radius of the seed (the tuft, and not a perked ear beside it), the
    highest pixels on the sheet (within 1.5 px of the highest row), their mean. Upright on the sheet rather than along
    the eye line's roll: on a tuft of lobes, a tilted axis slides the top from lobe to lobe."""
    xs, ys = coords(rgb.shape[:2])
    line = head_line(rgb) & keep & (np.hypot(xs - seed[0], ys - seed[1]) <= radius)
    if allowed is not None:
        line &= allowed
    if not line.any():
        return None
    pick = line & (ys <= ys[line].min() + 1.5)
    return [float(xs[pick].mean()), float(ys[pick].mean())]


def find_face(rgb, keep, seeds, head_width_px, roll_deg, allowed=None, reach_share=REACH_SHARE):
    """Every anchor's feature, seeded at the anchors given (a panel's hand anchors, or a record's anchors carried onto
    a render): {name: point}, and the masks found. allowed, when given, maps each feature to the pixels it may
    use (a render's own parts, from its ID pass)."""
    allowed = allowed or {}
    cls = classes(rgb, keep)
    reach = reach_share * head_width_px
    across, down = frame(roll_deg)
    found, masks = {}, {}
    nose, core = (None, None)
    if "nose" in seeds:
        nose, core = find_nose(cls, seeds["nose"], reach, allowed.get("nose"))
        if nose is not None:
            found["nose"], masks["nose"] = nose, core
    exclude = ndimage.binary_dilation(core, iterations=2) if core is not None else np.zeros(keep.shape, bool)
    for name in ("eye.R", "eye.L"):
        if name in seeds:
            point, mark = find_eye(cls, seeds[name], reach, exclude, allowed.get("eye"))
            if point is not None:
                found[name], masks[name] = point, mark
    corners = [n for n in ("mouth.R", "mouth.L") if n in seeds]
    if corners and nose is not None:
        given = [seeds[n] for n in corners]
        right, left, mouth = find_mouth(cls, given, nose, core, across, down, reach, TOUCH_SHARE * head_width_px,
                                        allowed.get("mouth"))
        if right is not None:
            masks["mouth"] = mouth
            ends = {"mouth.R": right, "mouth.L": left}
            for name in corners:
                found[name] = ends[name]
    if "head.top" in seeds:
        top = find_head_top(rgb, keep, seeds["head.top"], TOP_SHARE * head_width_px, allowed.get("head"))
        if top is not None:
            found["head.top"] = top
    return found, masks


def in_head_frame(points, roll_deg):
    """Points across and down the head from its nose."""
    across, down = frame(roll_deg)
    nose = np.array(points["nose"])
    return {n: [float((np.array(p) - nose) @ across), float((np.array(p) - nose) @ down)] for n, p in points.items()}


def check_order(where, points, roll_deg, head_width_px):
    """Each anchor names its own feature: the eyes above the nose, the dog's right eye on its right (the sheet's left
    in a front view) and its left on its left, the nose between them, the corners each on their side and below the
    nose's middle, the head top above the eyes. A nose anchor placed on an eye, for one, fails here."""
    if "nose" not in points:
        return
    frame_points = in_head_frame(points, roll_deg)
    # Across, each eye is well to its side; down, only above the nose's middle, as Proud's raised chin draws them.
    margin = 0.05 * head_width_px
    rules = [("eye.R", lambda s, t: s < -margin and t < 0, "is not above the nose on the dog's right"),
             ("eye.L", lambda s, t: s > margin and t < 0, "is not above the nose on the dog's left"),
             ("mouth.R", lambda s, t: s < 0 and t > 0, "is not below the nose's middle on the dog's right"),
             ("mouth.L", lambda s, t: s > 0 and t > 0, "is not below the nose's middle on the dog's left")]
    for name, rule, problem in rules:
        if name in frame_points and not rule(*frame_points[name]):
            raise ValueError(f"{where}: {name} at {np.round(points[name], 1).tolist()} {problem}")
    eyes = [frame_points[n][1] for n in ("eye.R", "eye.L") if n in frame_points]
    if "head.top" in frame_points and eyes and not frame_points["head.top"][1] < min(eyes) - 2 * margin:
        raise ValueError(f"{where}: head.top is not above the eyes")


def head_width(rgb, keep, nose, roll_deg, hand):
    """The head's width as measure.py takes the turnaround's: its widest run across the cheeks, between the ears' inner
    edges, here along the head's own across axis. Each run starts a quarter of the hand-placed width out from the nose
    on either side and stops at the first line (L* under 82, the cheek's outline over the ear) or tan (an ear, a
    patch); the blush's pink does not stop it. The widest within 3 px of the hand-placed row, which keeps it off rows
    a paw covers, gives the two ends."""
    lab = sheets.to_lab(rgb)
    L, C = lab[..., 0], np.hypot(lab[..., 1], lab[..., 2])
    hue = np.degrees(np.arctan2(lab[..., 2], lab[..., 1])) % 360
    fur = keep & (L >= 82) & ~((C > 20) & (hue > 40) & (hue < 90))
    across, down = frame(roll_deg)
    nose = np.array(nose, float)
    a, b = np.array(hand[0], float), np.array(hand[1], float)
    start = 0.25 * np.linalg.norm(b - a)
    row = float(((a + b) / 2 - nose) @ down)

    def inside(p):
        x, y = int(round(p[0])), int(round(p[1]))
        return 0 <= y < fur.shape[0] and 0 <= x < fur.shape[1] and fur[y, x]

    best = None
    for t in np.arange(row - 3, row + 3.01, 0.5):
        ends = []
        for sign in (-1, 1):
            s = sign * start
            if not inside(nose + down * t + across * s):
                break
            # Half-pixel steps; a single stray pixel of grain does not end the run.
            while inside(nose + down * t + across * (s + sign * 0.5)) or inside(nose + down * t + across * (s + sign)):
                s += sign * 0.5
            ends.append(nose + down * t + across * s)
        if len(ends) == 2 and (best is None or np.linalg.norm(ends[1] - ends[0]) > np.linalg.norm(best[1] - best[0])):
            best = ends
    return None if best is None else [[float(v) for v in best[0]], [float(v) for v in best[1]]]


def widest_run(rgb, keep, nose, roll_deg, width):
    """The cheeks' widest run on any row from a tenth of the head's width above the nose to 0.3 of it below, where
    the turnaround's lies (0.18 below): further down, a run escapes under the cheeks into the chest."""
    across, down = frame(roll_deg)
    nose = np.array(nose, float)
    best = 0.0
    for t in np.arange(-0.1 * width, 0.3 * width + 0.01, 3.0):
        ends = head_width(rgb, keep, nose, roll_deg, [list(nose + down * t - across * width / 2),
                                                     list(nose + down * t + across * width / 2)])
        if ends:
            best = max(best, float(np.hypot(*np.subtract(ends[1], ends[0]))))
    return best


def remove_mask(shape, boxes, origin):
    keep = np.ones(shape, bool)
    for x, y, w, h in boxes:
        keep[max(y - origin[1], 0):max(y - origin[1] + h, 0), max(x - origin[0], 0):max(x - origin[0] + w, 0)] = False
    return keep


def gates(drawn, preset, aliases):
    """The anchors a preset is held to on a panel: the eyes when the panel draws an eye state the preset uses, the
    mouth's corners when it draws a mouth state the preset uses (spec L476-498; the dog's squeeze and sparkle are its
    happy crescents, docs/QUESTIONS.md Q2). Anchors of a state the preset never shows are reported, never held."""
    eyes = {aliases.get(e, e) for e in preset["eyes"]}
    mouths = set(preset["mouth"])
    held = []
    if drawn["eyes"] in eyes:
        held += ["eye.R", "eye.L"]
    if drawn["mouth"] in mouths:
        held += ["mouth.R", "mouth.L"]
    return held


def measure_panel(species, pid, entry, panel, names, presets, aliases, head_width_pt, shared_width=None):
    """One panel's record: its anchors refined and checked, its head's width (measured, or shared_width for a panel
    whose cheeks the sheet hides), its scale and roll; with the panel's pixels and the mask of what is compared."""
    where = f"faces.json {pid}"
    drawn = entry["drawn"]
    if drawn["eyes"] not in EYE_STATES | UNHELD or drawn["mouth"] not in MOUTH_STATES | UNHELD:
        raise ValueError(f"{where}: draws {drawn}, outside the spec's eye and mouth states")
    x0, y0, w, h = panel["box"]
    rgb = sheets.load_sheet(species, panel["sheet"])[y0:y0 + h, x0:x0 + w]
    keep = remove_mask((h, w), [b for boxes in entry["remove"].values() for b in boxes], (x0, y0))
    hand = {n: [p[0] - x0, p[1] - y0] for n, p in entry["anchors"].items()}
    if set(hand) - set(FACE_ANCHORS):
        raise ValueError(f"{where}: unknown anchors {sorted(set(hand) - set(FACE_ANCHORS))}")
    if drawn["mouth"] in UNHELD and ({"mouth.R", "mouth.L"} & set(hand)):
        raise ValueError(f"{where}: a {drawn['mouth']} mouth gets no corners (R3: nothing is held to it)")
    if drawn["eyes"] in UNHELD and ({"eye.R", "eye.L", "nose"} & set(hand)):
        raise ValueError(f"{where}: a panel that draws no face gets no face anchors")
    for name, (x, y) in hand.items():
        if not (0 <= x < w and 0 <= y < h) or not keep[int(round(y)), int(round(x))]:
            raise ValueError(f"{where}: {name} at {[x + x0, y + y0]} is off the panel or in a left-out box")
    # The head's width: the cheeks' widest run near a row placed by hand (two ends); the expressions' median for a
    # panel that hides its cheeks ({"from": "expressions"}); or, on a drawing with no cheeks to run across, two ends
    # placed by hand on the head's outline ({"hand": ends}).
    given = entry["headWidth"]
    measured = isinstance(given, list)
    placed = given if measured else given.get("hand")
    hand_ends = [[p[0] - x0, p[1] - y0] for p in placed] if placed else None
    reach_width = float(np.hypot(*np.subtract(hand_ends[1], hand_ends[0]))) if hand_ends else shared_width
    hand_roll = roll_of(hand["eye.R"], hand["eye.L"]) if "eye.R" in hand else roll_of(*hand_ends)
    found, _ = find_face(rgb, keep, hand, reach_width, hand_roll)
    for name, point in hand.items():
        if name not in found:
            raise ValueError(f"{where}: no {name} near the hand anchor at {[point[0] + x0, point[1] + y0]}")
        off = float(np.hypot(found[name][0] - point[0], found[name][1] - point[1]))
        if off > SNAP_PX:
            raise ValueError(f"{where}: the hand anchor {name} at {[point[0] + x0, point[1] + y0]} is {off:.1f} px "
                             f"from its feature at {np.round(np.add(found[name], [x0, y0]), 1).tolist()}")
    roll = roll_of(found["eye.R"], found["eye.L"]) if "eye.R" in found else hand_roll
    record = {"crop": pid, "sheet": panel["sheet"], "boxSheetPx": panel["box"], "presets": names,
              "view": panel["view"], "facing": panel["facing"]}
    if measured:
        # A panel with no face takes the width's middle as the head's axis, where the nose would be.
        axis = found.get("nose", list(np.mean(hand_ends, axis=0)))
        ends = head_width(rgb, keep, axis, roll, hand_ends)
        across, _ = frame(roll)
        if ends is None or any(abs(np.subtract(e, k) @ across) > SNAP_PX for e, k in zip(ends, hand_ends)):
            got = "no run" if ends is None else np.round(np.add(ends, [x0, y0]), 1).tolist()
            raise ValueError(f"{where}: the head's width by hand, {entry['headWidth']}, is not the cheeks' widest run near "
                             f"that row ({got})")
        width_px = float(np.hypot(*np.subtract(ends[1], ends[0])))
        widest = widest_run(rgb, keep, axis, roll, width_px)
        if width_px < WIDEST_SHARE * widest:
            raise ValueError(f"{where}: the head's width by hand, {entry['headWidth']}, runs {width_px:.1f} px; the cheeks' "
                             f"widest run, from the nose's row down a third of the head, is {widest:.1f} px")
        record.update(headWidthCropPx=round(width_px, 2), headWidthEndsCropPx=[[round(v, 2) for v in e] for e in ends],
                      headWidthHandCropPx=hand_ends)
    elif hand_ends:
        line = keep & (sheets.to_lab(rgb)[..., 0] < 70)  # the outline's core, darker than a patch's tan
        for end in hand_ends:
            x, y = int(round(end[0])), int(round(end[1]))
            if not line[max(y - 1, 0):y + 2, max(x - 1, 0):x + 2].any():
                raise ValueError(f"{where}: the head's width placed by hand ends at {[end[0] + x0, end[1] + y0]}, off the head's outline")
        width_px = float(np.hypot(*np.subtract(hand_ends[1], hand_ends[0])))
        record.update(headWidthCropPx=round(width_px, 2), headWidthEndsCropPx=hand_ends, headWidthHandCropPx=hand_ends,
                      headWidthFrom="hand: the head's outline")
    else:
        width_px = shared_width
        record.update(headWidthCropPx=round(width_px, 2), headWidthFrom=given["from"])
    check_order(where, found, roll, width_px)
    record.update({
        "ptPerCropPx": round(head_width_pt / width_px, 5), "rollDeg": round(roll, 2),
        "anchorsCropPx": {n: [round(found[n][0], 2), round(found[n][1], 2)] for n in FACE_ANCHORS if n in found},
        "handCropPx": {n: hand[n] for n in FACE_ANCHORS if n in hand},
        "drawn": drawn,
        "gates": {name: gates(drawn, presets[name], aliases) for name in names},
        "mask": f"ref/faces/{pid}.png",
    })
    return record, rgb, keep


def build(species, plan=None, images=None):
    """Every record, from refmap/faces.json (or a plan given in its place). images, when given, collects each panel's
    pixels and mask for the files main() writes."""
    folder = sheets.ROOT / "characters" / species
    plan = plan or sheets.json.loads((folder / "refmap" / "faces.json").read_text())
    panels = {p["id"]: p for p in sheets.json.loads((folder / "ref" / "panels.json").read_text())["panels"]}
    head_width_pt = sheets.json.loads((folder / "ref" / "measurements.json").read_text())["proportions"]["headWidth"]
    presets, aliases = plan["presets"], plan["aliases"]
    unknown = sorted(set(presets) - set(PRESETS))
    if unknown:
        raise ValueError(f"faces.json names presets the spec does not: {', '.join(unknown)}")
    missing = sorted(set(PRESETS) - set(presets))
    if missing:
        raise ValueError(f"faces.json leaves out the presets {', '.join(missing)}; list each, with no panels if it has none")
    judged = {}
    for name, preset in presets.items():
        for pid in preset["panels"]:
            judged.setdefault(pid, []).append(name)
    for pid in sorted(set(judged) | set(plan["panels"])):
        where = f"faces.json {pid}"
        if pid not in panels:
            raise ValueError(f"{where}: no such panel in ref/panels.json")
        if forbidden(panels[pid]):
            raise ValueError(f"{where}: rule R3 bars this panel ({panels[pid].get('label', pid)}): its face is never drawn or used")
        if panels[pid]["sheet"] != "expressions":
            raise ValueError(f"{where}: the Faces check holds a preset to its expression-sheet panel (L525)")
        if pid not in judged:
            raise ValueError(f"{where}: no preset is judged against it")
        if pid not in plan["panels"]:
            raise ValueError(f"faces.json: {', '.join(judged[pid])} names {pid}, which has no entry")
    records = {}

    def one(pid, shared=None):
        names = sorted(judged[pid], key=PRESETS.index)
        record, rgb, keep = measure_panel(species, pid, plan["panels"][pid], panels[pid], names, presets, aliases,
                                          head_width_pt, shared)
        if images is not None:
            images[pid] = (rgb, keep)
        return record

    for pid, entry in plan["panels"].items():
        if isinstance(entry["headWidth"], list) or "hand" in entry["headWidth"]:
            records[pid] = one(pid)
    # The ten expressions are drawn at one size on the sheet: where one hides its cheeks (a paw, an ear across them),
    # it takes the median width of those that show theirs.
    shown = [r["headWidthCropPx"] for pid, r in records.items() if panels[pid]["kind"] == "expression"]
    for pid, entry in plan["panels"].items():
        if pid not in records:
            if entry["headWidth"].get("from") != "expressions" or panels[pid]["kind"] != "expression" or not shown:
                raise ValueError(f"faces.json {pid}: headWidth is two ends, or from the expressions for an expression panel")
            records[pid] = one(pid, float(np.median(shown)))
    records = {pid: records[pid] for pid in plan["panels"]}
    return {"species": species, "headWidthPt": head_width_pt, "records": records,
            "presets": {n: {"panels": presets[n]["panels"], "note": presets[n].get("note", "")} for n in PRESETS}}


def overlay(rgb, keep, record, path):
    """The panel at ZOOM times its size: left-out boxes greyed, the head's width by hand in green and as measured in red
    (its ends circled), the eye line in blue, each hand anchor a green cross and its refined point a red one, named."""
    image = rgb.copy()
    image[~keep] = (image[~keep] * 0.35 + 150).astype(np.uint8)
    big = Image.fromarray(image).resize((rgb.shape[1] * ZOOM, rgb.shape[0] * ZOOM), Image.NEAREST)
    draw = ImageDraw.Draw(big)

    def at(p):
        return (p[0] + 0.5) * ZOOM, (p[1] + 0.5) * ZOOM

    if "headWidthEndsCropPx" in record:
        a, b = record["headWidthHandCropPx"]
        draw.line([*at(a), *at(b)], fill=(0, 170, 60), width=1)
        a, b = record["headWidthEndsCropPx"]
        draw.line([*at(a), *at(b)], fill=(230, 0, 60), width=1)
        for end in (a, b):
            x, y = at(end)
            draw.ellipse([x - 3, y - 3, x + 3, y + 3], outline=(230, 0, 60), width=2)
    anchors = record["anchorsCropPx"]
    if "eye.R" in anchors:
        draw.line([*at(anchors["eye.R"]), *at(anchors["eye.L"])], fill=(40, 110, 255), width=1)
    for name, p in record["handCropPx"].items():
        x, y = at(p)
        draw.line([x - 7, y, x + 7, y], fill=(0, 160, 60), width=2)
        draw.line([x, y - 7, x, y + 7], fill=(0, 160, 60), width=2)
    for name, p in anchors.items():
        x, y = at(p)
        draw.line([x - 5, y - 5, x + 5, y + 5], fill=(230, 0, 60), width=2)
        draw.line([x - 5, y + 5, x + 5, y - 5], fill=(230, 0, 60), width=2)
        draw.text((x + 7, y + 4), name, fill=(150, 0, 40), stroke_width=1, stroke_fill=(255, 255, 255))
    width = f"; head width from {record['headWidthFrom']}" if "headWidthFrom" in record else ""
    draw.text((4, 4), f"{record['crop']}: roll {record['rollDeg']} deg, {record['ptPerCropPx']} pt/px{width}; "
                      f"hand + green, refined x red", fill=(40, 40, 40), stroke_width=1, stroke_fill=(255, 255, 255))
    sheets.save_png(path, np.asarray(big))


def main(argv):
    if len(argv) != 1:
        print(__doc__)
        return 2
    images = {}
    result = build(argv[0], images=images)
    ref = sheets.ROOT / "characters" / argv[0] / "ref"
    for pid, (rgb, keep) in images.items():
        sheets.save_png(ref / "faces" / f"{pid}.png", (keep * 255).astype(np.uint8))
        overlay(rgb, keep, result["records"][pid], ref / "overlays" / f"faces-{pid}.png")
    sheets.write_json(ref / "faces.json", result)
    print(f"faces: {len(result['records'])} panels for {sum(1 for p in result['presets'].values() if p['panels'])} presets")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
