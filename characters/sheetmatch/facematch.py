"""The Faces check (spec section 5b, The sheet match, L525): a face preset's
still beside the expression panels it is judged against, its eyes and mouth
held to its primary panel's by place and by shape, its face held to its head,
and a beside image for the eyes of the agent and the founder.

    python3 characters/sheetmatch/facematch.py dog --still <dir> --rest <dir> --out <dir> [--preset <name>]

Reads a still of a face clip as runtime-web/lab/still.ts writes it (still.json,
white.png, black.png, ids.png; the clip face_<preset> names the preset unless
--preset does), the still of the rest front (still_front) in --rest, drawn at
the same ppp, model.json's faceCrops (characters/refprep/faces.py) and each
panel's crop and mask. Writes <out>/match.json (each panel's rows, numbers and
verdict, the head's, and every threshold) and <out>/beside.png (the face on its
head, then for each panel: the panel | the render on the panel's pixels, the
same size | the two blended, the record's anchors and marks in blue and the
render's in red). Exits 0 when every gating check passes, 1 when one fails,
and 2 on any error, leaving no match.json, as match.py does.

Each preset has one primary panel (refmap/faces.json): its held anchors and
shapes gate. The preset's other panels are measured the same way and shown,
marked "gating": false, and never fail it. A still shows the state its primary
panel draws where the preset names two (singing and blissful the happy
crescents, sleepy the closed eyes, proud the crescents with the sparkle's
stars), and is held to that state.

On each panel the render is laid on the panel's pixel grid, padded all round
by a quarter of the head's width in the card's colour so a head that stands
higher is laid and drawn whole, at the record's scale (points per crop pixel,
from the panel's head width) and roll (its eye line; the render's face already
carries the front view's own roll, about 4 degrees, DECISIONS.md 27, so it
turns by the rest), and moved so its nose lands on the record's nose, laid
again until it stays there. The nose pins the face: the head top is reported,
never used to place it, because the sheet draws the tuft differently in every
panel. Then the face rules of refprep/faces.py, the ones that refined the
record's anchors on the panel, find the render's eyes and mouth corners and
their marks, each within the render's own parts when its ID pass names them
(an eye among eye.* parts, the mouth among mouth* and tongue* parts). For each
feature the record holds the preset to (its gates: the eyes when the panel
draws the preset's eye state, the mouth when it draws its mouth state):

- place: each anchor within 3% of the head's width (L523) of the record's. On
  a panel that turns the head (its record's turned: the eyes' middle further
  across from the nose than that, beside where the front puts it, as Curious,
  Shy and Sleepy draw it) each anchor's place is reported, and the pair is held
  by its spacing instead, the one's place from the other's within the same 3%:
  a face that keeps the front's head cannot land on a turned face's places,
  and the head gate holds where its eyes sit;
- shape: each eye's mark its area within EYE_AREA_RATIO of the record's and,
  with its centroid moved onto the record's, an IoU of at least EYE_IOU; the
  mouth's mark with its holes filled (its outline) an IoU of at least
  MOUTH_IOU, and its open part (pink or the inside's red) within
  MOUTH_OPEN_RATIO of the record's, each open area counted from
  MOUTH_OPEN_FLOOR_SHARE of the record's mouth up, so a closed smile (no open
  part) and an open mouth are told apart and two smiles are not. The share of
  the open part that is the inside's deep red is reported, never held.

Each threshold lies between the worst pair of panels that draw the same state
and the best pair that draw different ones, among pairs whose places pass:
each panel laid as a render on every other's record, and the rest front's
render on each (characters/sheetmatch/facecal.py; DECISIONS.md 117). Where two
states are drawn alike on the sheets (open and wide eyes; open and laughing
mouths on the master sheet; the open mouth and the expression sheet's cheeky
one), no threshold tells them apart and the place of the anchors must
(DECISIONS.md 118).

The head (lead decision: a face preset keeps the front's head): pinning at the
nose cannot see a whole face moved on its head, so the face is also held to
the render's own head. The head is head.base's pixels in the ID pass and those
of every part clipped to it, holes filled; the face's head is laid on the rest
front's by the shift that overlaps them most, so neither a notch between the
tuft's lobes nor a cheek drawn fuller moves it. The rest front's model.json
nose and eyes' middle, carried by that shift, are where the face's nose (found
by the face rules) and eyes' middle (each eye's parts' pixels in the ID pass,
which no eye state moves, or its dark mark where the ID pass names no eye
part) must be, within 3% of the head's width.

A preset no panel judges (hungry, huffy) and a primary panel that holds
nothing (the ear positions draw no face) are judged by eye beside the panels;
the head is still held."""
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
import json  # noqa: E402
from pathlib import Path  # noqa: E402

import numpy as np  # noqa: E402
from PIL import Image, ImageDraw  # noqa: E402
from scipy import ndimage, signal  # noqa: E402

import match  # noqa: E402  (puts characters/refprep on the path)
import faces  # noqa: E402

sheets = match.sheets
LANDMARK_SHARE = match.LANDMARK_SHARE  # of the head's width (L523)
SUBSAMPLES = 4  # per crop pixel and axis: the render's area over each of the panel's pixels
PAD_SHARE = 0.25  # of the head's width: the card laid round each panel, for a head standing higher than the panel's
# Of the head's width: how far from the record's nose the render's own is looked for before it is pinned. Wider than
# the rules' reach, which starts from a pinned render; under half the nose's distance from either eye (25 pt), so the
# nearest dark blob is still the nose.
PIN_REACH_SHARE = 0.2
PIN_ROUNDS = 4  # layings at most, each moved by what the last one's nose was off
PIN_SETTLED_PX = 0.05  # canvas px: a pin moved less than this has settled
WINDOW_SHARE = 0.35  # of the head's width: how far round the record's anchors the rules look
# The shape gates (DECISIONS.md 117). Each lies halfway (geometrically for a ratio) between the worst pair of panels
# that draw the same state and the best pair that draw different ones, among the pairs whose anchors pass: each panel
# laid as a render on every other's record, and the rest front's render on each.
EYE_AREA_RATIO = 1.9  # an eye's mark at most this many times the record's, or its inverse: same x1.33 at most, else x2.79 up
EYE_IOU = 0.58  # an eye's mark on the record's, centroid on centroid: same 0.67 and up, different 0.49 and down
MOUTH_IOU = 0.35  # the mouth's mark (holes filled) on the record's: same 0.53 and up, different 0.17 and down
MOUTH_OPEN_RATIO = 2.9  # the mouth's open part against the record's, from the floor: same x2.33 at most, else x3.57 up
MOUTH_OPEN_FLOOR_SHARE = 0.25  # of the record's mouth: what an open area is counted from, so a smile's none compares
# The head: the front's still laid at the turnaround front's scale, over this box of model points round the face.
HEAD_BOX_PT = (-70.0, -190.0, 70.0, -30.0)
BESIDE_HEAD_PX = 400  # about how wide each head is drawn in beside.png, whatever its panel's size
FEATURE_PARTS = {"eye": match.EYE_PARTS, "nose": ("nose*",), "mouth": match.MOUTH_PARTS}
HEAD_PART = "head.base"
PAIRS = {"eyes": ("eye.R", "eye.L"), "mouth": ("mouth.R", "mouth.L")}  # what a turned panel holds by its spacing
OUTLINED = ("eye.R", "eye.L", "mouth")  # the marks beside.png outlines


def thresholds(head_width):
    return {"landmarkShareOfHead": LANDMARK_SHARE, "landmarkPt": round(LANDMARK_SHARE * head_width, 2),
            "eyeAreaRatio": EYE_AREA_RATIO, "eyeIoU": EYE_IOU, "mouthIoU": MOUTH_IOU,
            "mouthOpenRatio": MOUTH_OPEN_RATIO, "mouthOpenFloorShare": MOUTH_OPEN_FLOOR_SHARE,
            "padShareOfHead": PAD_SHARE, "headBoxPt": list(HEAD_BOX_PT), "turnedShareOfHead": faces.TURNED_SHARE,
            "reachShareOfHead": faces.REACH_SHARE, "touchShareOfHead": faces.TOUCH_SHARE, "topShareOfHead": faces.TOP_SHARE,
            "pinReachShareOfHead": PIN_REACH_SHARE, "pinRounds": PIN_ROUNDS, "pinSettledPx": PIN_SETTLED_PX,
            "windowShareOfHead": WINDOW_SHARE,
            "subsamples": SUBSAMPLES, "softL": list(faces.SOFT_L), "endPx": faces.END_PX, "eyeMinPx": faces.EYE_MIN_PX,
            "noseCorePx": faces.NOSE_CORE, "openChroma": faces.OPEN_CHROMA, "openHue": faces.OPEN_HUE, "openL": faces.OPEN_L}


def face_roll(model):
    """The roll of the face a render draws at rest: the front view's eye line in model.json, as the face's parts are
    typed in a frame rolled with it (DECISIONS.md 27)."""
    front = model["landmarks"]["front"]
    return faces.roll_of(front["eye.R"], front["eye.L"])


def rotation(roll_deg):
    t = np.radians(roll_deg)
    return np.array([[np.cos(t), -np.sin(t)], [np.sin(t), np.cos(t)]])


def card_of(crop):
    edge = np.concatenate([crop[0], crop[-1], crop[:, 0], crop[:, -1]])
    return np.median(edge, axis=0)


class Panel:
    """A record's panel on its canvas: the crop enlarged by its record's zoom (faces.py measured it so), with a quarter
    of the head's width of card all round, the left-out boxes painted the card's colour where it is shown, the mask of
    what the record measured, its frame, and the record's marks found there by the record's own rules. Every length
    here is in canvas pixels; rows report points in the crop's own pixels, as the record keeps them."""

    def __init__(self, species, model, pid):
        self.pid, self.rec = pid, model["faceCrops"][pid]
        folder = sheets.ROOT / "characters" / species
        crop = match.read_rgb(folder / "ref" / "panels" / self.rec["sheet"] / f"{pid}.png").astype(np.uint8)
        with Image.open(folder / self.rec["mask"]) as image:
            keep = np.asarray(image) > 0
        self.zoom = int(self.rec["measureZoom"])
        crop, keep = faces.enlarge(crop, self.zoom), faces.enlarge_mask(keep, self.zoom)
        self.card = card_of(crop)
        self.width_px = float(self.rec["headWidthCropPx"]) * self.zoom
        self.pad = int(round(PAD_SHARE * self.width_px))
        p = self.pad
        self.canvas = np.empty((crop.shape[0] + 2 * p, crop.shape[1] + 2 * p, 3), np.uint8)
        self.canvas[...] = np.round(self.card).astype(np.uint8)
        self.canvas[p:-p, p:-p] = crop
        self.keep = np.pad(keep, p, constant_values=True)
        self.shown = self.canvas.copy()
        self.shown[~self.keep] = np.round(self.card).astype(np.uint8)
        self.k = float(self.rec["ptPerCropPx"]) / self.zoom  # points per canvas pixel
        self.roll = float(self.rec["rollDeg"])
        self.turned = bool(self.rec["turned"])
        # The render's face is already rolled as the turnaround's front is (DECISIONS.md 27): it turns by the rest.
        self.turn = self.roll - face_roll(model)
        self.anchors = {n: np.array(faces.to_canvas(q, self.zoom), float) + p for n, q in self.rec["anchorsCropPx"].items()}
        self.shape = self.canvas.shape[:2]
        _, masks = faces.find_face(self.canvas, self.keep, {n: list(q) for n, q in self.anchors.items()}, self.width_px,
                                   self.roll)
        self.marks = faces.shapes(self.canvas, masks)

    def origin(self, name, model_pt):
        """Where model point (0, 0) lies on the canvas (continuous pixels) when model_pt lands on the anchor."""
        return self.anchors[name] + 0.5 - rotation(self.turn) @ (np.asarray(model_pt, float) / self.k)

    def to_crop(self, point):
        """A canvas point in the crop's own pixels, as the record keeps its anchors."""
        return np.array(faces.to_crop(np.asarray(point, float) - self.pad, self.zoom))


class Canvas:
    """A plain grid to lay a still on: its size, scale, turn and card."""

    def __init__(self, shape, k, turn, card):
        self.shape, self.k, self.turn, self.card = shape, k, turn, np.asarray(card, float)


def lay(still, grid, origin):
    """The still on a grid (a Panel's canvas, or a Canvas), rolled and scaled by it, model (0, 0) at origin: colour over
    the grid's card, alpha, and each pixel's part (-1 for none)."""
    h, w = grid.shape
    sub = (np.arange(SUBSAMPLES) + 0.5) / SUBSAMPLES
    ys, xs = np.mgrid[:h, :w]
    px = (xs[..., None, None] + sub[None, None, None, :]).reshape(h, w, -1)
    py = (ys[..., None, None] + sub[None, None, :, None]).reshape(h, w, -1)
    px, py = np.broadcast_arrays(px, py)
    inverse = rotation(-grid.turn)
    dx, dy = px - origin[0], py - origin[1]
    qx = grid.k * (inverse[0, 0] * dx + inverse[0, 1] * dy)
    qy = grid.k * (inverse[1, 0] * dx + inverse[1, 1] * dy)
    # Still pixel (u, v) covers [u, u + 1): its value sits at u + 0.5, which map_coordinates calls u.
    su = still.root[0] + still.ppp * qx - 0.5
    sv = still.root[1] + still.ppp * qy - 0.5
    layers = [still.alpha] + [still.premult[..., c] for c in range(3)]
    sampled = [ndimage.map_coordinates(layer, [sv.ravel(), su.ravel()], order=1, mode="constant", cval=0.0)
               .reshape(h, w, -1).mean(axis=2) for layer in layers]
    alpha = np.clip(sampled[0], 0, 1)
    premult = np.stack(sampled[1:], axis=-1)
    rgb = np.clip(np.round((premult + (1 - alpha[..., None]) * grid.card / 255) * 255), 0, 255).astype(np.uint8)
    cx, cy = np.meshgrid(np.arange(w) + 0.5, np.arange(h) + 0.5)
    qx = grid.k * (inverse[0, 0] * (cx - origin[0]) + inverse[0, 1] * (cy - origin[1]))
    qy = grid.k * (inverse[1, 0] * (cx - origin[0]) + inverse[1, 1] * (cy - origin[1]))
    u = np.floor(still.root[0] + still.ppp * qx).astype(int)
    v = np.floor(still.root[1] + still.ppp * qy).astype(int)
    inside = (u >= 0) & (v >= 0) & (u < still.part.shape[1]) & (v < still.part.shape[0])
    part = np.full((h, w), -1)
    part[inside] = still.part[v[inside], u[inside]]
    return rgb, alpha, part


def allowed_parts(still, part):
    """For each feature the render's own parts, from its ID pass, grown by a pixel; none for a feature whose parts the
    still does not name (the rules then read the pixels alone)."""
    out = {}
    for feature, patterns in FEATURE_PARTS.items():
        indices = [i for i, n in enumerate(still.names) if match.matches(n, patterns)]
        if indices:
            out[feature] = ndimage.binary_dilation(np.isin(part, indices))
    return out


def head_offset(panel, found, want):
    """A found point's offset from the record's, across and down the head, in points."""
    across, down = faces.frame(panel.roll)
    d = (np.asarray(found) - np.asarray(want)) * panel.k
    return [round(float(d @ across), 2) + 0.0, round(float(d @ down), 2) + 0.0]


def ratio_ok(ratio, limit):
    return bool(1 / limit <= ratio <= limit)


def compare_shapes(mine, theirs, k):
    """Each feature's shape rows, the render's marks against the record's (both on the panel's canvas): areas in crop
    pixels and points squared, their ratio and the IoU centroid on centroid; for an eye the ratio and the IoU gate,
    for the mouth the IoU (its outline) and its open part against the record's, counted from the floor."""
    rows = {}
    for name in ("eye.R", "eye.L", "mouth"):
        if name not in theirs:
            continue
        a, b = mine.get(name), theirs[name]
        area = int(a.sum()) if a is not None else 0
        row = {"areaPx": area, "recordAreaPx": int(b.sum()), "areaPt2": round(area * k * k, 1),
               "areaRatio": round(area / max(int(b.sum()), 1), 3), "iou": round(faces.aligned_iou(a, b), 3) if a is not None else 0.0}
        if name.startswith("eye"):
            row["pass"] = a is not None and ratio_ok(row["areaRatio"], EYE_AREA_RATIO) and row["iou"] >= EYE_IOU
        else:
            row["pass"] = a is not None and row["iou"] >= MOUTH_IOU
        if name == "mouth":
            floor = MOUTH_OPEN_FLOOR_SHARE * float(b.sum())
            mine_open = int(mine["mouth.open"].sum()) if "mouth.open" in mine else 0
            theirs_open = int(theirs["mouth.open"].sum())
            row.update(openPx=mine_open, recordOpenPx=theirs_open,
                       openRatio=round((mine_open + floor) / (theirs_open + floor), 3))
            # Reported, never held (DECISIONS.md 118): the share of the open part that is the inside's deep red rather
            # than the tongue's pink, which tells Cheeky's tongue out over a closed smile from an open mouth.
            mine_red = int(mine["mouth.red"].sum()) if "mouth.red" in mine else 0
            row.update(redShare=round(mine_red / max(mine_open, 1), 3),
                       recordRedShare=round(int(theirs["mouth.red"].sum()) / max(theirs_open, 1), 3))
            row["pass"] = row["pass"] and ratio_ok(row["openRatio"], MOUTH_OPEN_RATIO)
        rows[name] = row
    return rows


def window_of(panel):
    """The part of the canvas the rules look at: the record's anchors' box grown by WINDOW_SHARE of the head's width, so
    every mark round an anchor lies whole inside it, within the canvas."""
    points = np.array(list(panel.anchors.values()))
    grow = WINDOW_SHARE * panel.width_px
    x0, y0 = np.maximum(np.floor(points.min(axis=0) - grow).astype(int), 0)
    x1, y1 = np.minimum(np.ceil(points.max(axis=0) + grow).astype(int) + 1, [panel.shape[1], panel.shape[0]])
    return int(x0), int(y0), int(x1), int(y1)


def measure_on(still, panel, model_front):
    """The render laid on a panel's canvas and pinned at the nose (at the head's top on a panel with no face): where
    its anchors are and its marks, in canvas pixels, found in the window round the record's anchors."""
    x0, y0, x1, y1 = window_of(panel)
    offset = np.array([x0, y0], float)
    window = Canvas((y1 - y0, x1 - x0), panel.k, panel.turn, panel.card)
    keep = np.ones(window.shape, bool)
    seeds = {n: list(np.asarray(p) - offset) for n, p in panel.anchors.items()}
    pin = "nose" if "nose" in panel.anchors else "head.top"
    origin = panel.origin(pin, model_front[pin])
    rgb, _, part = lay(still, window, origin - offset)
    found, masks = faces.find_face(rgb, keep, {pin: seeds[pin]}, panel.width_px, panel.roll, allowed_parts(still, part),
                                   reach_share=PIN_REACH_SHARE)
    measured = {"pin": pin, "start": origin.copy()}
    if pin not in found:
        return dict(measured, origin=origin, found={}, marks={}, problem=f"the render has no {pin} near the record's")
    # Laid again where the pin says, until the pin stays on the record's: a mark resampled at another fraction of a
    # pixel can land a little apart.
    for _ in range(PIN_ROUNDS):
        shift = np.asarray(seeds[pin]) - np.asarray(found[pin])
        origin = origin + shift
        rgb, _, part = lay(still, window, origin - offset)
        found, masks = faces.find_face(rgb, keep, seeds, panel.width_px, panel.roll, allowed_parts(still, part))
        if pin not in found or np.hypot(*shift) < PIN_SETTLED_PX:
            break
    marks = {}
    for name, mark in faces.shapes(rgb, masks).items():
        marks[name] = np.zeros(panel.shape, bool)
        marks[name][y0:y1, x0:x1] = mark
    return dict(measured, origin=origin, found={n: np.asarray(q) + offset for n, q in found.items()}, marks=marks)


def judge(measured, panel, preset, tolerance):
    """A panel's rows for a preset from what measure_on found: each anchor's place and each mark's shape, held where the
    preset's gates say, and the verdict, gating only where the panel is the preset's primary. On a panel that turns the
    head, a held pair (the eyes, the mouth's corners) is held by its spacing, the one's place from the other's, and
    each anchor's place is reported: a face that keeps the front's head cannot land on a turned face's places, and
    the head gate holds where it sits."""
    gated = set(panel.rec["gates"][preset])
    result = {"crop": panel.pid, "gating": preset in panel.rec["primaryFor"], "ptPerCropPx": panel.rec["ptPerCropPx"],
              "measureZoom": panel.zoom, "rollDeg": panel.roll, "turnDeg": round(panel.turn, 2), "padPx": panel.pad,
              "turned": panel.turned, "turnAcrossPt": panel.rec["turnAcrossPt"],
              "drawn": panel.rec["drawn"], "heldTo": panel.rec["gates"][preset]}
    if "problem" in measured:
        # Nothing was measured, so nothing is counted as held.
        return dict(result, problem=measured["problem"], rows={}, spacing={}, shapes={}, anchorsHeld=0, spacingsHeld=0,
                    shapesHeld=0, **{"pass": False})
    pin, found = measured["pin"], measured["found"]
    result["alignment"] = {"pinnedOn": pin, "shiftFromModelPt": head_offset(panel, measured["origin"] - measured["start"], [0, 0])}
    by_spacing = {n for pair in PAIRS.values() for n in pair if panel.turned and pair[0] in gated}
    rows = {}
    for name, want in panel.anchors.items():
        row = {"record": match.round2(panel.to_crop(want)), "held": name in gated and name not in by_spacing}
        if name not in found:
            row.update(missing=True, **{"pass": not row["held"]})
        else:
            err = float(np.hypot(*(found[name] - want))) * panel.k
            row.update(found=match.round2(panel.to_crop(found[name])), errPt=round(err, 2),
                       offsetPt=head_offset(panel, found[name], want), **{"pass": err <= tolerance or not row["held"]})
        if name == pin:
            row["note"] = "the render is placed here"
        elif name == "head.top":
            row["note"] = "reported, never held: the sheet draws the tuft differently in every panel"
        elif name in by_spacing:
            row["note"] = "reported: the panel turns the head, so the pair is held by its spacing and the eyes on the head"
        rows[name] = row
    spacing = {}
    for feature, (right, left) in PAIRS.items():
        if not panel.turned or right not in gated:
            continue
        row = {"held": True, "recordPt": head_offset(panel, panel.anchors[left], panel.anchors[right])}
        if right in found and left in found:
            # The one's place from the other's, against the record's: a turn moves both alike and drops out.
            got = np.asarray(found[left]) - np.asarray(found[right])
            want = panel.anchors[left] - panel.anchors[right]
            err = float(np.hypot(*(got - want))) * panel.k
            row.update(foundPt=head_offset(panel, got, [0, 0]), errPt=round(err, 2), **{"pass": err <= tolerance})
        else:
            row.update(missing=True, **{"pass": False})
        spacing[feature] = row
    shape_rows = compare_shapes(measured["marks"], panel.marks, panel.k)
    for name, row in shape_rows.items():
        row["held"] = name in gated or (name == "mouth" and "mouth.R" in gated)
        row["pass"] = row["pass"] or not row["held"]
    result["rows"], result["spacing"], result["shapes"] = rows, spacing, shape_rows
    result["anchorsHeld"] = sum(1 for r in rows.values() if r["held"])
    result["spacingsHeld"] = len(spacing)
    result["shapesHeld"] = sum(1 for r in shape_rows.values() if r["held"])
    result["pass"] = all(r["pass"] for group in (rows, spacing, shape_rows) for r in group.values())
    return result


def check_panel(still, panel, preset, model_front, tolerance, picture=True):
    """One panel: the render measured on it and judged for the preset. With picture, also the render laid on the whole
    canvas where it was pinned, for beside.png."""
    measured = measure_on(still, panel, model_front)
    rgb = lay(still, panel, measured["origin"])[0] if picture else None
    return judge(measured, panel, preset, tolerance), rgb, measured["found"], measured["marks"]


def head_mask(still):
    """The head in a still's ID pass: head.base's pixels and those of every part clipped to it (the face's features,
    its patches, the ears' shadows on it), holes filled. A face's state draws inside it and leaves it as it was."""
    if HEAD_PART not in still.names:
        raise ValueError(f"the still names no {HEAD_PART} part, so the face cannot be held to its head")
    indices = [i for i, n in enumerate(still.names) if n == HEAD_PART or still.meta["parts"][n].get("clipTo") == HEAD_PART]
    mask = ndimage.binary_fill_holes(np.isin(still.part, indices))
    if not mask.any():
        raise ValueError(f"the still's {HEAD_PART} draws no pixel")
    return mask


def peak(values):
    """Where a parabola through three samples peaks, from the middle one: -0.5 to 0.5."""
    a, b, c = values
    bend = a - 2 * b + c
    return 0.0 if bend >= 0 else float(np.clip(0.5 * (a - c) / bend, -0.5, 0.5))


def head_shift(still, rest):
    """Where the face's head lies against the rest front's, in model points: the shift that lays the rest's head
    pixels over the face's with the most overlap (a correlation, refined between pixels by a parabola), and that
    overlap's IoU. The whole head decides it, so a pixel's notch between the tuft's lobes or a cheek drawn fuller
    hardly moves it; the scale is the rest's, as a face preset keeps the front's head and both are drawn at one ppp."""
    if abs(still.ppp - rest.ppp) > 1e-9:
        raise ValueError(f"the face's still is drawn at {still.ppp} px/pt and the rest's at {rest.ppp}: render both alike")
    boxes, crops = [], []
    for mask in (head_mask(still), head_mask(rest)):
        ys, xs = np.nonzero(mask)
        boxes.append(np.array([xs.min(), ys.min()]))
        crops.append(mask[ys.min():ys.max() + 1, xs.min():xs.max() + 1].astype(float))
    a, b = crops
    overlap = signal.fftconvolve(a, b[::-1, ::-1], mode="full")
    iy, ix = np.unravel_index(int(np.argmax(overlap)), overlap.shape)
    fine = [0.0, 0.0]
    if 0 < ix < overlap.shape[1] - 1:
        fine[0] = peak(overlap[iy, ix - 1:ix + 2])
    if 0 < iy < overlap.shape[0] - 1:
        fine[1] = peak(overlap[iy - 1:iy + 2, ix])
    # overlap[iy, ix] lays the rest's crop pixel q on the face's crop pixel q + (ix, iy) - (b's width, height) + 1.
    pixels = np.array([ix - (b.shape[1] - 1), iy - (b.shape[0] - 1)], float) + fine + boxes[0] - boxes[1]
    shift = (pixels - still.root + rest.root) / still.ppp
    best = float(np.round(overlap[iy, ix]))
    return shift, best / (a.sum() + b.sum() - best)


def eye_place(still, name):
    """An eye's place on its head: the centroid of its parts' pixels in the ID pass (eye.R*, or eye.L*), in model
    points. That is the footprint of whatever the eye draws, which a lid closing over it does not move, where the
    centroid of its dark mark moves 3.9 pt. None when the still names no such part or it draws no pixel."""
    indices = [i for i, n in enumerate(still.names) if match.matches(n, (name + "*",))]
    ys, xs = np.nonzero(np.isin(still.part, indices))
    if not len(xs):
        return None
    return (np.array([xs.mean(), ys.mean()]) + 0.5 - still.root) / still.ppp


def check_head(still, rest, model):
    """The face on its head: the face's head laid on the rest front's (head_shift), the rest front's model.json nose
    and eyes' middle carried by that shift, and the face's own nose (found by the face rules) and eyes' middle (each
    eye's parts' pixels, or its dark mark in a still whose ID pass names no eye part) within 3% of the head's width."""
    front = model["landmarks"]["front"]
    shift, iou = head_shift(still, rest)
    want = {n: np.asarray(front[n], float) + shift for n in ("nose", "eye.R", "eye.L")}
    crop = model["crops"]["front"]
    k = float(crop["ptPerCropPx"])
    x0, y0, x1, y1 = HEAD_BOX_PT
    grid = Canvas((int(np.ceil((y1 - y0) / k)), int(np.ceil((x1 - x0) / k))), k, 0.0, (251, 245, 236))
    origin = np.array([-x0 / k, -y0 / k])
    rgb, _, part = lay(still, grid, origin)
    to_px = lambda p: list(origin - 0.5 + np.asarray(p) / k)  # noqa: E731
    to_pt = lambda q: (np.asarray(q) + 0.5 - origin) * k  # noqa: E731
    width = float(model["proportions"]["headWidth"])
    found, _ = faces.find_face(rgb, np.ones(grid.shape, bool), {n: to_px(p) for n, p in want.items()}, width / k,
                               face_roll(model), allowed_parts(still, part))
    tolerance = LANDMARK_SHARE * width
    result = {"headShiftPt": match.round2(shift), "headIoU": round(iou, 4), "thresholdPt": round(tolerance, 2), "rows": {}}
    points = {"nose": (want["nose"], to_pt(found["nose"]) if "nose" in found else None)}
    eyes = [eye_place(still, n) for n in ("eye.R", "eye.L")]
    measured_by = "each eye's parts' pixels in the ID pass"
    if any(e is None for e in eyes):
        eyes = [to_pt(found[n]) if n in found else None for n in ("eye.R", "eye.L")]
        measured_by = "each eye's dark mark (the ID pass names no eye part)"
    points["eyes.middle"] = ((want["eye.R"] + want["eye.L"]) / 2, None if any(e is None for e in eyes) else (eyes[0] + eyes[1]) / 2)
    for name, (expected, got) in points.items():
        row = {"model": match.round2(expected)}
        if got is None:
            row.update(missing=True, **{"pass": False})
        else:
            err = float(np.hypot(*(got - expected)))
            row.update(found=match.round2(got), errPt=round(err, 2), **{"pass": err <= tolerance})
        result["rows"][name] = row
    result["rows"]["eyes.middle"]["measuredBy"] = measured_by
    result["pass"] = all(r["pass"] for r in result["rows"].values())
    # For beside.png: the laid head, and each point where it should be and where it is, in its pixels.
    drawn = {"rgb": rgb, "width": width / k,
             "points": {n: (to_px(e), None if g is None else to_px(g)) for n, (e, g) in points.items()}}
    return result, drawn


def preset_of(still, given):
    if given:
        return given
    clip = str(still.meta.get("clip", ""))
    if not clip.startswith("face_"):
        raise ValueError(f"the still plays {clip!r}, not a face clip (face_<preset>); name the preset with --preset")
    return clip[len("face_"):]


def load(still):
    return still if isinstance(still, match.Still) else match.Still.load(still)


def check(species, still_dir, rest_dir, preset=None):
    """The head, and every panel that judges the preset, its primary first. Returns the result and what the beside
    image needs."""
    model = json.loads((sheets.ROOT / "characters" / species / "model.json").read_text())
    still, rest = load(still_dir), load(rest_dir)
    preset = preset_of(still, preset)
    if preset not in faces.PRESETS:
        raise ValueError(f"{preset!r} is not one of the spec's face presets")
    head_width = float(model["proportions"]["headWidth"])
    tolerance = LANDMARK_SHARE * head_width
    views = still.meta.get("views", {})
    result = {"species": species, "preset": preset, "renderFaceRollDeg": round(face_roll(model), 2),
              "still": {k: still.meta.get(k) for k in ("still", "clip", "views", "ppp", "sizePx", "rootPx")},
              "rest": {k: rest.meta.get(k) for k in ("still", "clip", "views", "ppp")},
              "thresholds": thresholds(head_width), "primary": None, "records": {}}
    if rest.meta.get("views", {}).get("head") != "front":
        raise ValueError(f"the rest still's head is in the {rest.meta.get('views', {}).get('head')} view, not the front")
    result["headGate"], head = check_head(still, rest, model)
    parts = []
    front = model["landmarks"]["front"]
    judged = [(pid, rec) for pid, rec in model["faceCrops"].items() if preset in rec["presets"]]
    judged.sort(key=lambda item: preset not in item[1]["primaryFor"])
    for pid, rec in judged:
        if views.get("head") != rec["view"]:
            raise ValueError(f"the still's head is in the {views.get('head')} view; {pid} draws the {rec['view']} view")
        panel = Panel(species, model, pid)
        row, rgb, found, marks = check_panel(still, panel, preset, front, tolerance)
        if row["gating"]:
            result["primary"] = pid
        result["records"][pid] = row
        parts.append((panel, row, rgb, found, marks))
    primary = result["records"].get(result["primary"], {})
    for count in ("anchorsHeld", "spacingsHeld", "shapesHeld"):
        result[count] = primary.get(count, 0)
    result["pass"] = result["headGate"]["pass"] and primary.get("pass", True)
    if not result["records"]:
        result["note"] = f"no panel judges {preset} (refmap/faces.json): it is judged by eye; the head is held"
    elif "problem" not in primary and not held_count(result):
        result["note"] = f"its primary panel holds nothing of {preset}: it is judged by eye beside it; the head is held"
    result["summary"] = summary(result)
    return result, {"head": head, "panels": parts}


def held_count(result):
    return result["anchorsHeld"] + result["spacingsHeld"] + result["shapesHeld"]


def summary(result):
    """One line: the verdict, what was held on the primary panel (or why nothing could be measured), and the head."""
    head = result["headGate"]["rows"]
    errs = ", ".join(f"{n} {r['errPt']} pt" if "errPt" in r else f"{n} not found" for n, r in head.items())
    head_text = ("head held (" if result["headGate"]["pass"] else "head FAILS (") + errs + ")"
    verdict = "pass" if result["pass"] else "FAIL"
    if not result["records"]:
        return f"{verdict}: no panel, judged by eye; {head_text}"
    pid = result["primary"]
    primary = result["records"][pid]
    if "problem" in primary:
        return f"{verdict}: nothing measured on {pid}, {primary['problem']}; {head_text}"
    if not held_count(result):
        return f"{verdict}: nothing held on {pid}, judged by eye; {head_text}"
    held = [f"{result['anchorsHeld']} anchors"] if result["anchorsHeld"] else []
    held += [f"the {name}' spacing" if name == "eyes" else f"the {name}'s spacing" for name in primary["spacing"]]
    held.append(f"{result['shapesHeld']} shapes")
    turned = " (it turns the head: each place reported, the eyes held on the head)" if primary["turned"] else ""
    failed = ([n for n, r in primary["rows"].items() if not r["pass"]] + [f"{n} spacing" for n, r in primary["spacing"].items() if not r["pass"]]
              + [f"{n} shape" for n, r in primary["shapes"].items() if not r["pass"]])
    return (f"{verdict}: {', '.join(held[:-1])} and {held[-1]} held on {pid}" if len(held) > 1 else f"{verdict}: {held[0]} held on {pid}") \
        + turned + (f" (failing: {', '.join(failed)})" if failed else "") + f"; {head_text}"


def verdict(result):
    return f"{result['preset']}: {result['summary']}"


def outline(mask):
    return mask & ~ndimage.binary_erosion(mask)


def cross(draw, X, Y, colour, size=5, upright=True):
    if upright:
        draw.line([X - size, Y, X + size, Y], fill=colour, width=2)
        draw.line([X, Y - size, X, Y + size], fill=colour, width=2)
    else:
        draw.line([X - size, Y - size, X + size, Y + size], fill=colour, width=2)
        draw.line([X - size, Y + size, X + size, Y - size], fill=colour, width=2)


def strip(width, text, colour):
    image = Image.new("RGB", (width, 20), "white")
    ImageDraw.Draw(image).text((6, 4), text, fill=colour)
    return image


def head_row(result, head):
    """The render's head as the head gate measured it: where the rest front's nose and eyes' middle go on this head in
    blue, where the face's are in red."""
    zoom = max(1, int(round(BESIDE_HEAD_PX / head["width"])))
    body = Image.fromarray(match.upscale(head["rgb"], zoom))
    draw = ImageDraw.Draw(body)
    for name, (want, got) in head["points"].items():
        cross(draw, (want[0] + 0.5) * zoom, (want[1] + 0.5) * zoom, (30, 110, 255), 7)
        if got is not None:
            cross(draw, (got[0] + 0.5) * zoom, (got[1] + 0.5) * zoom, (230, 30, 60), 6, upright=False)
    gate = result["headGate"]
    rows = ", ".join(f"{n} {r['errPt']} pt" if "errPt" in r else f"{n} not found" for n, r in gate["rows"].items())
    text = (f"the face on its head: " + ("pass" if gate["pass"] else "FAIL") + f"; {rows} (within {gate['thresholdPt']} pt); "
            "the rest front's nose and eyes' middle carried onto this head blue, the face's red")
    return [strip(max(body.width, 900), text, (0, 0, 0) if gate["pass"] else (200, 0, 30)), body]


def panel_rows(panel, row, rgb, marks):
    """One panel: the panel | the render on its pixels, the same size | the two blended, the record's anchors and marks'
    outlines in blue and the render's in red, failing rows named; titled with its verdict and whether it gates."""
    zoom = max(1, int(round(BESIDE_HEAD_PX / panel.width_px)))
    onion = ((panel.shown.astype(float) + rgb) / 2).astype(np.uint8)
    for name, mark in panel.marks.items():
        if name in OUTLINED:
            onion[outline(mark)] = (30, 110, 255)
    for name, mark in marks.items():
        if name in OUTLINED:
            onion[outline(mark)] = (230, 30, 60)
    tiles = [match.upscale(t, zoom) for t in (panel.shown, rgb, onion)]
    gap = 6
    width = tiles[0].shape[1]
    body = Image.fromarray(np.concatenate([np.pad(t, ((0, 0), (0, gap), (0, 0)), constant_values=255) for t in tiles], axis=1))
    draw = ImageDraw.Draw(body)

    def at(q):
        c = faces.to_canvas(q, panel.zoom)
        return 2 * (width + gap) + (c[0] + panel.pad + 0.5) * zoom, (c[1] + panel.pad + 0.5) * zoom

    for name, r in row.get("rows", {}).items():
        X, Y = at(r["record"])
        cross(draw, X, Y, (30, 110, 255))
        if "found" in r:
            X, Y = at(r["found"])
            cross(draw, X, Y, (230, 30, 60), 4, upright=False)
        if not r["pass"]:
            match.label(draw, (X + 6, Y - 12), name, (170, 0, 40))
    for i, title in enumerate(("sheet", "render", "both: the sheet's anchors and marks blue, the render's red")):
        match.label(draw, (i * (width + gap) + 4, 4), title, (40, 40, 40))
    held = [f"{n} {r['errPt']} pt" + ("" if r["pass"] else " FAIL") for n, r in row.get("rows", {}).items() if r["held"] and "errPt" in r]
    held += [f"{n} not found" for n, r in row.get("rows", {}).items() if r["held"] and r.get("missing")]
    held += [f"{n} spacing {r['errPt']} pt" + ("" if r["pass"] else " FAIL") if "errPt" in r else f"{n} spacing not found"
             for n, r in row.get("spacing", {}).items()]
    held += [f"{n} shape x{r['areaRatio']} IoU {r['iou']}" + (f" open x{r['openRatio']} red {r['redShare']}/{r['recordRedShare']}" if "openRatio" in r else "")
             + ("" if r["pass"] else " FAIL") for n, r in row.get("shapes", {}).items() if r["held"]]
    role = ("primary, gates" if row["gating"] else "beside, measured, does not gate") + ("; turns the head" if row["turned"] else "")
    line = (f"{panel.pid} ({role}): " + ("pass" if row["pass"] else "FAIL") + f"; held {', '.join(held) or 'nothing'}"
            + (f"; {row['problem']}" if "problem" in row else ""))
    colour = (0, 0, 0) if row["pass"] else (200, 0, 30) if row["gating"] else (150, 90, 0)
    return [strip(body.width, line, colour), body]


def beside_image(result, drawn, path):
    """The verdict, the face on its head, then each panel, the primary first."""
    rows = head_row(result, drawn["head"])
    for panel, row, rgb, found, marks in drawn["panels"]:
        rows += panel_rows(panel, row, rgb, marks)
    head = Image.new("RGB", (max(r.width for r in rows), 22), "white")
    ImageDraw.Draw(head).text((6, 5), verdict(result) + f"; landmarks within {result['thresholds']['landmarkPt']} pt",
                              fill=(0, 120, 40) if result["pass"] else (200, 0, 30))
    rows.insert(0, head)
    full = Image.new("RGB", (max(r.width for r in rows), sum(r.height for r in rows)), "white")
    y = 0
    for r in rows:
        full.paste(r, (0, y))
        y += r.height
    sheets.save_png(path, np.asarray(full))


def main(argv):
    parser = argparse.ArgumentParser(usage=__doc__)
    parser.add_argument("species")
    parser.add_argument("--still", required=True)
    parser.add_argument("--rest", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--preset")
    args = parser.parse_args(argv)
    out = Path(args.out)
    written = out / "match.json"
    try:
        written.unlink(missing_ok=True)
        result, drawn = check(args.species, args.still, args.rest, args.preset)
        out.mkdir(parents=True, exist_ok=True)
        beside_image(result, drawn, out / "beside.png")
        sheets.write_json(written, result)
    except Exception as error:  # any error is exit 2, never a failed check's 1
        traceback.print_exc()
        print(f"facematch: {type(error).__name__}: {error}", file=sys.stderr)
        written.unlink(missing_ok=True)
        return 2
    print(f"facematch: {verdict(result)}; written to {out}")
    return 0 if result["pass"] else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
