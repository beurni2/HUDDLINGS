"""The Faces check (spec section 5b, The sheet match, L525): a face preset's
still beside each expression-sheet panel it is judged against, the landmark
check on its eyes and mouth, and a beside image for the eyes of the agent and
the founder.

    python3 characters/sheetmatch/facematch.py dog --still <dir> --out <dir> [--preset <name>]

Reads a still of a face clip as runtime-web/lab/still.ts writes it (still.json,
white.png, black.png, ids.png; the clip face_<preset> names the preset unless
--preset does), model.json's faceCrops (characters/refprep/faces.py) and each
panel's crop and mask. Writes <out>/match.json (each panel's rows, numbers and
verdict, and every threshold) and <out>/beside.png (for each panel: the panel |
the render on the panel's own pixels, the same size | the two blended with the
record's anchors in blue and the render's in red). Exits 0 when every anchor a
preset is held to passes, 1 when one fails, and 2 on any error, leaving no
match.json, as match.py does.

For each panel the render is laid on the panel's pixel grid at the record's
scale (points per crop pixel, from the panel's head width) and roll (its eye
line; the render's face already carries the front view's own roll, about 4
degrees, DECISIONS.md 27, so it turns by the rest), and moved so its nose lands
on the record's nose, laid again until it stays there. The nose pins the
face: the head top is reported, never used to place it, because the sheet draws
the tuft differently in every panel (2.7 pt apart across the expressions, and
11 pt nearer the nose under Proud's raised chin), and averaging it in would move
every eye by half that. Then the face rules of refprep/faces.py, the ones that
refined the record's anchors on the panel, find the render's eyes and mouth
corners, each within the render's own parts when its ID pass names them (an eye
among eye.* parts, the mouth among mouth* and tongue* parts). Each anchor the
record holds the preset to (its gates: the eyes when the panel draws the
preset's eye state, the mouth when it draws its mouth state) must lie within 3%
of the head's width (L523) of the record's; the others are reported. A preset
no panel judges, and a panel that holds nothing (the ear positions draw no
face), are judged by eye: match.json says so and the exit is 0."""
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
from scipy import ndimage  # noqa: E402

import match  # noqa: E402  (puts characters/refprep on the path)
import faces  # noqa: E402

sheets = match.sheets
LANDMARK_SHARE = match.LANDMARK_SHARE  # of the head's width (L523)
SUBSAMPLES = 4  # per crop pixel and axis: the render's area over each of the panel's pixels
# Of the head's width: how far from the record's nose the render's own is looked for before it is pinned. Wider than
# the rules' reach, which starts from a pinned render; under half the nose's distance from either eye (25 pt), so the
# nearest dark blob is still the nose.
PIN_REACH_SHARE = 0.2
PIN_ROUNDS = 4  # layings at most, each moved by what the last one's nose was off
PIN_SETTLED_PX = 0.05  # crop px: a pin moved less than this has settled
ZOOM = 3
FEATURE_PARTS = {"eye": match.EYE_PARTS, "nose": ("nose*",), "mouth": match.MOUTH_PARTS}


def thresholds(head_width):
    return {"landmarkShareOfHead": LANDMARK_SHARE, "landmarkPt": round(LANDMARK_SHARE * head_width, 2),
            "reachShareOfHead": faces.REACH_SHARE, "touchShareOfHead": faces.TOUCH_SHARE, "topShareOfHead": faces.TOP_SHARE,
            "pinReachShareOfHead": PIN_REACH_SHARE, "pinRounds": PIN_ROUNDS, "pinSettledPx": PIN_SETTLED_PX,
            "subsamples": SUBSAMPLES, "softL": list(faces.SOFT_L), "endPx": faces.END_PX, "eyeMinPx": faces.EYE_MIN_PX,
            "noseCorePx": faces.NOSE_CORE}


def face_roll(model):
    """The roll of the face a render draws at rest: the front view's eye line in model.json, as the face's parts are
    typed in a frame rolled with it (DECISIONS.md 27)."""
    front = model["landmarks"]["front"]
    return faces.roll_of(front["eye.R"], front["eye.L"])


def rotation(roll_deg):
    t = np.radians(roll_deg)
    return np.array([[np.cos(t), -np.sin(t)], [np.sin(t), np.cos(t)]])


class Panel:
    """A record's panel: its crop with the left-out boxes painted the card's colour, its mask and its frame."""

    def __init__(self, species, model, pid):
        self.pid, self.rec = pid, model["faceCrops"][pid]
        folder = sheets.ROOT / "characters" / species
        self.crop = match.read_rgb(folder / "ref" / "panels" / self.rec["sheet"] / f"{pid}.png").astype(np.uint8)
        with Image.open(folder / self.rec["mask"]) as image:
            self.keep = np.asarray(image) > 0
        edge = np.concatenate([self.crop[0], self.crop[-1], self.crop[:, 0], self.crop[:, -1]])
        self.card = np.median(edge, axis=0)
        self.shown = self.crop.copy()
        self.shown[~self.keep] = np.round(self.card).astype(np.uint8)
        self.k = float(self.rec["ptPerCropPx"])
        self.roll = float(self.rec["rollDeg"])
        # The render's face is already rolled as the turnaround's front is (DECISIONS.md 27): it turns by the rest.
        self.turn = self.roll - face_roll(model)
        self.anchors = {n: np.array(p, float) for n, p in self.rec["anchorsCropPx"].items()}
        self.width_px = float(self.rec["headWidthCropPx"])

    def origin(self, name, model_pt):
        """Where model point (0, 0) lies on the panel (continuous crop pixels) when model_pt lands on the anchor."""
        return self.anchors[name] + 0.5 - rotation(self.turn) @ (np.asarray(model_pt, float) / self.k)


def lay(still, panel, origin):
    """The still on the panel's pixel grid, rolled and scaled by the record, model (0, 0) at origin: colour over the
    panel's card, alpha, and each pixel's part (-1 for none), at the crop's size."""
    h, w = panel.crop.shape[:2]
    sub = (np.arange(SUBSAMPLES) + 0.5) / SUBSAMPLES
    ys, xs = np.mgrid[:h, :w]
    px = (xs[..., None, None] + sub[None, None, None, :]).reshape(h, w, -1)
    py = (ys[..., None, None] + sub[None, None, :, None]).reshape(h, w, -1)
    px, py = np.broadcast_arrays(px, py)
    inverse = rotation(-panel.turn)
    dx, dy = px - origin[0], py - origin[1]
    qx = panel.k * (inverse[0, 0] * dx + inverse[0, 1] * dy)
    qy = panel.k * (inverse[1, 0] * dx + inverse[1, 1] * dy)
    # Still pixel (u, v) covers [u, u + 1): its value sits at u + 0.5, which map_coordinates calls u.
    su = still.root[0] + still.ppp * qx - 0.5
    sv = still.root[1] + still.ppp * qy - 0.5
    layers = [still.alpha] + [still.premult[..., c] for c in range(3)]
    sampled = [ndimage.map_coordinates(layer, [sv.ravel(), su.ravel()], order=1, mode="constant", cval=0.0)
               .reshape(h, w, -1).mean(axis=2) for layer in layers]
    alpha = np.clip(sampled[0], 0, 1)
    premult = np.stack(sampled[1:], axis=-1)
    rgb = np.clip(np.round((premult + (1 - alpha[..., None]) * panel.card / 255) * 255), 0, 255).astype(np.uint8)
    cx, cy = np.meshgrid(np.arange(w) + 0.5, np.arange(h) + 0.5)
    qx = panel.k * (inverse[0, 0] * (cx - origin[0]) + inverse[0, 1] * (cy - origin[1]))
    qy = panel.k * (inverse[1, 0] * (cx - origin[0]) + inverse[1, 1] * (cy - origin[1]))
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


def check_panel(still, panel, preset, model_nose, tolerance):
    """One panel: the render laid on it and pinned at the nose, each anchor's row, and the verdict."""
    result = {"crop": panel.pid, "ptPerCropPx": panel.k, "rollDeg": panel.roll, "turnDeg": round(panel.turn, 2),
              "drawn": panel.rec["drawn"],
              "heldTo": panel.rec["gates"][preset]}
    keep = np.ones(panel.crop.shape[:2], bool)
    gated = set(panel.rec["gates"][preset])
    seeds = {n: list(p) for n, p in panel.anchors.items()}
    if "nose" in panel.anchors:
        pin, model_pin = "nose", model_nose["nose"]
    else:  # the ear positions draw no face: the head's top places the render beside it
        pin, model_pin = "head.top", model_nose["head.top"]
    origin = panel.origin(pin, model_pin)
    rgb, alpha, part = lay(still, panel, origin)
    found, _ = faces.find_face(rgb, keep, {pin: seeds[pin]}, panel.width_px, panel.roll, allowed_parts(still, part),
                               reach_share=PIN_REACH_SHARE)
    if pin not in found:
        result.update(problem=f"the render has no {pin} near the record's", rows={}, **{"pass": False})
        return result, rgb, alpha, None
    # Laid again where the pin says, until the pin stays on the record's: a mark resampled at another fraction of a
    # pixel can land a little apart.
    start = origin.copy()
    for _ in range(PIN_ROUNDS):
        shift = panel.anchors[pin] - np.asarray(found[pin])
        origin = origin + shift
        rgb, alpha, part = lay(still, panel, origin)
        found, _ = faces.find_face(rgb, keep, seeds, panel.width_px, panel.roll, allowed_parts(still, part))
        if pin not in found or np.hypot(*shift) < PIN_SETTLED_PX:
            break
    result["alignment"] = {"pinnedOn": pin, "shiftFromModelPt": head_offset(panel, origin - start, [0, 0])}
    rows = {}
    for name, want in panel.anchors.items():
        row = {"record": match.round2(want), "held": name in gated}
        if name not in found:
            row.update(missing=True, **{"pass": not row["held"]})
        else:
            err = float(np.hypot(*(np.asarray(found[name]) - want))) * panel.k
            row.update(found=match.round2(found[name]), errPt=round(err, 2), offsetPt=head_offset(panel, found[name], want),
                       **{"pass": err <= tolerance or not row["held"]})
        if name == pin:
            row["note"] = "the render is placed here"
        elif name == "head.top":
            row["note"] = "reported, never held: the sheet draws the tuft differently in every panel"
        rows[name] = row
    result["rows"] = rows
    result["pass"] = all(r["pass"] for r in rows.values())
    return result, rgb, alpha, found


def preset_of(still, given):
    if given:
        return given
    clip = str(still.meta.get("clip", ""))
    if not clip.startswith("face_"):
        raise ValueError(f"the still plays {clip!r}, not a face clip (face_<preset>); name the preset with --preset")
    return clip[len("face_"):]


def check(species, still_dir, preset=None):
    """Every panel that judges the preset. Returns the result and what the beside image needs."""
    model = json.loads((sheets.ROOT / "characters" / species / "model.json").read_text())
    still = match.Still.load(still_dir) if not isinstance(still_dir, match.Still) else still_dir
    preset = preset_of(still, preset)
    if preset not in faces.PRESETS:
        raise ValueError(f"{preset!r} is not one of the spec's face presets")
    head_width = float(model["proportions"]["headWidth"])
    tolerance = LANDMARK_SHARE * head_width
    views = still.meta.get("views", {})
    result = {"species": species, "preset": preset, "renderFaceRollDeg": round(face_roll(model), 2),
              "still": {k: still.meta.get(k) for k in ("still", "clip", "views", "ppp", "sizePx", "rootPx")},
              "thresholds": thresholds(head_width), "records": {}}
    parts = []
    front = model["landmarks"]["front"]
    for pid, rec in model["faceCrops"].items():
        if preset not in rec["presets"]:
            continue
        if views.get("head") != rec["view"]:
            raise ValueError(f"the still's head is in the {views.get('head')} view; {pid} draws the {rec['view']} view")
        panel = Panel(species, model, pid)
        row, rgb, alpha, found = check_panel(still, panel, preset, front, tolerance)
        result["records"][pid] = row
        parts.append((panel, row, rgb, found))
    held = sum(len(r["heldTo"]) for r in result["records"].values())
    result["held"] = held
    result["failed"] = [pid for pid, r in result["records"].items() if not r["pass"]]
    result["pass"] = not result["failed"]
    if not result["records"]:
        result["note"] = f"no panel judges {preset} (refmap/faces.json): it is judged by eye"
    elif not held:
        result["note"] = f"no panel holds {preset} to an anchor: it is judged by eye beside them"
    return result, parts


def verdict(result):
    if not result["records"]:
        return f"{result['preset']}: NO PANEL (judged by eye)"
    if not result["held"]:
        return f"{result['preset']}: BY EYE ONLY (nothing held)"
    return f"{result['preset']}: " + ("PASS" if result["pass"] else "FAIL: " + ", ".join(result["failed"]))


def beside_image(result, parts, path):
    """For each panel a row: the panel | the render on its pixels, the same size | the two blended, with the record's
    anchors in blue and the render's in red, held ones named when they fail; each row titled with its verdict."""
    rows = []
    for panel, row, rgb, found in parts:
        onion = ((panel.shown.astype(float) + rgb) / 2).astype(np.uint8)
        tiles = [match.upscale(t) for t in (panel.shown, rgb, onion)]
        gap = 6
        width = tiles[0].shape[1]
        body = Image.fromarray(np.concatenate([np.pad(t, ((0, 0), (0, gap), (0, 0)), constant_values=255) for t in tiles], axis=1))
        draw = ImageDraw.Draw(body)

        def at(p):
            return 2 * (width + gap) + (p[0] + 0.5) * ZOOM, (p[1] + 0.5) * ZOOM

        for name, r in row.get("rows", {}).items():
            X, Y = at(r["record"])
            draw.line([X - 5, Y, X + 5, Y], fill=(30, 110, 255), width=2)
            draw.line([X, Y - 5, X, Y + 5], fill=(30, 110, 255), width=2)
            if "found" in r:
                X, Y = at(r["found"])
                draw.line([X - 4, Y - 4, X + 4, Y + 4], fill=(230, 30, 60), width=2)
                draw.line([X - 4, Y + 4, X + 4, Y - 4], fill=(230, 30, 60), width=2)
            if not r["pass"]:
                match.label(draw, (X + 6, Y - 12), name, (170, 0, 40))
        for i, title in enumerate(("sheet", "render", "both: sheet's anchors blue, render's red")):
            match.label(draw, (i * (width + gap) + 4, 4), title, (40, 40, 40))
        held = [f"{n} {r['errPt']} pt" + ("" if r["pass"] else " FAIL") for n, r in row.get("rows", {}).items() if r["held"] and "errPt" in r]
        missing = [f"{n} not found" for n, r in row.get("rows", {}).items() if r["held"] and r.get("missing")]
        line = (f"{panel.pid}: " + ("pass" if row["pass"] else "FAIL") + f"; held {', '.join(held + missing) or 'nothing'}"
                + (f"; {row['problem']}" if "problem" in row else ""))
        strip = Image.new("RGB", (body.width, 20), "white")
        ImageDraw.Draw(strip).text((6, 4), line, fill=(0, 0, 0) if row["pass"] else (200, 0, 30))
        rows.extend([strip, body])
    head = Image.new("RGB", (max([r.width for r in rows] + [480]), 22), "white")
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
    parser.add_argument("--out", required=True)
    parser.add_argument("--preset")
    args = parser.parse_args(argv)
    out = Path(args.out)
    written = out / "match.json"
    try:
        written.unlink(missing_ok=True)
        result, parts = check(args.species, args.still, args.preset)
        out.mkdir(parents=True, exist_ok=True)
        beside_image(result, parts, out / "beside.png")
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
