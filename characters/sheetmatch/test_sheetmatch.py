"""Tests for the sheet match (spec section 5b, The sheet match): the resampling
on analytic shapes, the crop itself fed through as a render, and failures
planted in a still that passes, each of which must fail.

    python3 -m unittest discover -s characters/sheetmatch -v

The passing still is built from the turnaround crop: phase 2's own finders
give each region (eyes, nose, mouth, ears, collar, tag, patches, cheeks), each
is repainted flat in the value model.json holds it to and becomes its own part,
and the whole is enlarged into the still format. It never leaves the test."""
import contextlib
import copy
import io
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

import match

measure, palette, sheets = match.measure, match.palette, match.sheets
markings = __import__("markings")
MODEL = json.loads((sheets.ROOT / "characters/dog/model.json").read_text())
SCALE = 3  # still pixels per crop pixel in the fixtures, so the round trip back to the crop's grid is exact
PAD = 16  # crop pixels of empty canvas around the crop in the fixtures (more than 8 pt)
SHADOW_ALPHA = 0.6
REST = 0.35  # the blush's resting level on the turnaround (model.json blush.restingLevel)


def hexes(name):
    table, key = name
    value = MODEL[table][key]
    return sheets.hex_to_rgb(value["value"] if isinstance(value, dict) else value)


def id_colours(count):
    """Distinct ID colours, far apart and never the background's black."""
    found, n = [], 0
    while len(found) < count:
        n += 1
        c = np.array([(n * 97) % 251 + 4, (n * 53) % 241 + 8, (n * 151) % 239 + 12])
        if all(np.linalg.norm(c - f) > 4 * match.ID_TOLERANCE for f in found):
            found.append(c)
    return [sheets.rgb_to_hex(c) for c in found]


class Fixture:
    """A still of the dog at rest in one turnaround view, built from the crop: colour and part per crop pixel,
    enlarged SCALE times. Parts can be moved, recoloured or renamed before it is written."""

    ORDER = ["shadow", "body.back", "tail", "hind.L", "hind.R", "body.front", "collar", "tag", "ear.L", "ear.R",
             "head.base", "head.patch.L", "head.patch.R", "blush.L", "blush.R", "eye.L", "eye.R", "nose", "mouth",
             "front.L", "front.R", "back.patch.L", "back.patch.R", "rump.patch.L", "tail.base"]
    HOSTS = {"head.patch.L": "head.base", "head.patch.R": "head.base", "blush.L": "head.base", "blush.R": "head.base",
             "back.patch.L": "body.back", "back.patch.R": "body.back", "rump.patch.L": "body.back", "tail.base": "tail"}

    def __init__(self, view):
        self.view = view
        rec = MODEL["crops"][view]
        self.rec = rec
        folder = sheets.ROOT / "characters/dog"
        crop = match.read_rgb(folder / "ref/panels" / rec["sheet"] / f"{rec['crop']}.png").astype(np.uint8)
        sil = np.asarray(Image.open(folder / rec["mask"])) > 0
        self.k = rec["ptPerCropPx"]
        self.ground = np.array(rec["anchorsCropPx"]["ground"]) + PAD
        h, w = sil.shape
        self.rgb = np.zeros((h + 2 * PAD, w + 2 * PAD, 3), np.float64)
        self.rgb[PAD:PAD + h, PAD:PAD + w] = crop
        self.sil = np.pad(sil, PAD)
        self.alpha = self.sil.astype(np.float64)
        self.part = np.full(self.sil.shape, -1)
        self.names = list(self.ORDER)
        self.clip = dict(self.HOSTS)
        self.gone = set()  # parts folded into others, left out of still.json
        self.paint(np.pad(crop, ((PAD, PAD), (PAD, PAD), (0, 0)), constant_values=255), view)

    def at(self, name, mask, colour=None):
        mask = mask & (self.sil | (name == "shadow"))
        self.part[mask] = self.names.index(name)
        if colour is not None:
            self.rgb[mask] = colour

    def paint(self, crop, view):
        sil = self.sil
        cls = measure.Classes(crop, sil)
        found = palette.regions(crop, sil, view)
        band, _ = measure.collar(cls)
        count = 1 if view == "side.L" else 2
        _, ears = measure.ears(cls, count, band)
        tag, _ = measure.tag(cls)
        above = measure.above_collar(band)
        ys, xs = np.nonzero(sil)
        yy, xx = np.mgrid[:sil.shape[0], :sil.shape[1]]
        gx, gy = self.ground
        shadow = (((xx - gx) / (0.45 * np.ptp(xs))) ** 2 + ((yy - gy - 2) / 5) ** 2 <= 1) & ~sil
        self.part[shadow] = 0
        self.alpha[shadow] = SHADOW_ALPHA
        self.rgb[shadow] = sheets.hex_to_rgb(MODEL["palette"]["shadow"])
        self.at("body.back", ~above)
        self.at("head.base", above)
        self.rgb[found["fur"]] = hexes(("palette", "fur"))
        self.rgb[found["furShade"]] = hexes(("palettePainted", "furShade"))
        hand = json.loads((sheets.ROOT / "characters/dog/refmap/landmarks.json").read_text())["hand"].get(view, {})
        x0, y0 = self.rec["boxSheetPx"][:2]
        for name, xy in hand.items():
            if name.startswith("paw."):
                x, y = xy
                disc = (xx - (x - x0 + PAD)) ** 2 + (yy - (y - y0 + PAD)) ** 2 <= 25
                self.at(name.replace("paw.", ""), disc)
        self.at("collar", found["collar"], hexes(("palette", "collar")))
        ring = self.to_px(MODEL["landmarks"][view]["tag.ring"]) if "tag.ring" in MODEL["landmarks"][view] else None
        if tag is not None:
            column = np.zeros_like(sil)
            if ring is not None:
                rx, ry = int(round(ring[0])), int(round(ring[1]))
                column[ry - 1:np.nonzero(tag)[0].min() + 1, rx - 1:rx + 2] = True
            self.at("tag", column)
            self.at("tag", tag, hexes(("palette", "tag")))
        sides = ["L"] if view == "side.L" else ["L", "R"] if view == "back" else ["R", "L"]
        for side, ear in zip(sides, ears):
            self.at(f"ear.{side}", ndimage.binary_dilation(ear) & above, hexes(("palette", "marking")))
        self.marking_masks(crop, view)
        if view != "back":
            eyes = measure.eyes(cls, count)
            for side, eye in zip(["L"] if view == "side.L" else ["R", "L"], eyes):
                self.at(f"eye.{side}", ndimage.binary_dilation(eye))
            self.rgb[found["eyes"]] = hexes(("palettePainted", "eyeDark"))
            self.rgb[found["lowerIris"]] = hexes(("palette", "dark"))
            self.at("nose", ndimage.binary_dilation(found["nose"]))
            self.rgb[found["nose"]] = hexes(("palettePainted", "eyeDark"))
            if "tongue" in found:
                self.at("mouth", ndimage.binary_dilation(found["tongue"] | found["mouthInside"]))
                self.rgb[found["tongue"]] = hexes(("palettePainted", "tongue"))
                self.rgb[found["mouthInside"]] = hexes(("palettePainted", "mouthInside"))
            self.blush(crop, REST)
        # The sheet's brows and the deep creases it paints tan are not markings: brows are parts of their own and
        # a drawing shades with the fur's shade, so the fixture does too.
        stray = measure.Classes(self.rgb.astype(np.uint8), sil).tan & np.isin(self.part, [self.names.index(n) for n in ("head.base", "body.back", "tail")])
        self.rgb[stray] = hexes(("palettePainted", "furShade"))

    def marking_masks(self, crop, view):
        plan = json.loads((sheets.ROOT / "characters/dog/refmap/markings.json").read_text())
        entry = next(e for e in plan["evidence"] if e["panel"] == self.rec["crop"])
        x0, y0 = self.rec["boxSheetPx"][:2]
        area = np.pad(markings.tan(crop[PAD:-PAD, PAD:-PAD].copy()), PAD)
        for name, places in entry["seeds"].items():
            mask = np.zeros(area.shape, bool)
            for where in places if isinstance(places, list) else [places]:
                seed = [where["seed"][0] - x0 + PAD, where["seed"][1] - y0 + PAD]
                clip = [where["clip"][0] - x0 + PAD, where["clip"][1] - y0 + PAD, *where["clip"][2:]] if "clip" in where else None
                mask |= markings.patch(area, seed, clip)
            if name == "tail.base":
                self.at("tail", ndimage.binary_dilation(mask, iterations=3))
            light = name.startswith("head.")
            self.at(name, mask, hexes(("palettePainted", "markingLight") if light else ("palette", "marking")))

    def blush(self, crop, level):
        """Each cheek's light pixels in phase 2's box, the printed pink over the printed fur at a level."""
        plan = json.loads((sheets.ROOT / "characters/dog/refmap/palette.json").read_text())
        boxes = [b["box"] for b in plan["blush"] if b["panel"] == self.rec["crop"]]
        x0, y0 = self.rec["boxSheetPx"][:2]
        fur, pink = hexes(("palette", "fur")).astype(float), hexes(("palette", "blush")).astype(float)
        lab = sheets.to_lab(crop.astype(np.uint8))
        light = (lab[..., 0] > 70) & (np.hypot(lab[..., 1], lab[..., 2]) < 30)
        cheeks = sorted(boxes, key=lambda b: b[0])
        names = ["blush.L"] if len(cheeks) == 1 else ["blush.R", "blush.L"]
        for name, (x, y, w, h) in zip(names, cheeks):
            box = np.zeros(self.sil.shape, bool)
            box[y - y0 + PAD + 2:y - y0 + PAD + h - 2, x - x0 + PAD + 2:x - x0 + PAD + w - 2] = True
            self.at(name, box & light & (self.part == self.names.index("head.base")), np.round(fur + level * (pink - fur)))

    def to_px(self, pt):
        return [self.ground[0] + pt[0] / self.k, self.ground[1] + pt[1] / self.k]

    def move(self, name, dx, dy, under):
        """Moves a part by whole crop pixels, the part under it (with its colour) left where it was."""
        index = self.names.index(name)
        mask = self.part == index
        colours = np.roll(self.rgb, (dy, dx), axis=(0, 1))
        self.part[mask] = self.names.index(under)
        self.rgb[mask] = np.median(self.rgb[(self.part == self.names.index(under)) & ~mask], axis=0)
        moved = match.shifted(mask, dx, dy)
        self.part[moved] = index
        self.rgb[moved] = colours[moved]

    def relabel(self, name, into, colour=None):
        """Gives a part's pixels to another part, repainted when a colour is given."""
        if name in self.names:
            mask = self.part == self.names.index(name)
            self.part[mask] = self.names.index(into)
            if colour is not None:
                self.rgb[mask] = colour

    def recolour(self, old, new):
        self.rgb[(self.rgb == old).all(axis=2) & self.sil] = new

    def bake(self):
        """The body's markings painted into their host parts instead of drawn as parts of their own."""
        for name, host in self.HOSTS.items():
            if host != "head.base":
                self.relabel(name, host)
                self.gone.add(name)

    def swap_names(self):
        """Every side's name swapped, as a facing generated from the other side names its parts."""
        self.names = [match.swap_sides(n) for n in self.names]
        self.clip = {match.swap_sides(k): v for k, v in self.clip.items()}
        self.gone = {match.swap_sides(n) for n in self.gone}

    def right_side(self):
        """The facing the turnaround never draws, done properly before the still is mirrored: every side's name
        swapped, and the marking only the left side has (the rump patch) left out."""
        self.relabel("rump.patch.L", "body.back", hexes(("palette", "fur")))
        self.gone.add("rump.patch.L")
        self.swap_names()

    def write(self, folder, view=None, mirror=False, scale=1.0, root_shift=(0, 0)):
        """The still files: white.png, black.png, ids.png and still.json, SCALE times the crop's pixels."""
        folder = Path(folder)
        folder.mkdir(parents=True, exist_ok=True)
        alpha = np.kron(self.alpha, np.ones((SCALE, SCALE)))
        rgb = np.kron(self.rgb, np.ones((SCALE, SCALE, 1)))
        part = np.kron(self.part, np.ones((SCALE, SCALE), int))
        root = (self.ground + 0.5) * SCALE + np.array(root_shift) * SCALE
        if scale != 1.0:
            alpha, rgb, part, root = rescale(alpha, rgb, part, root, scale)
        if mirror:
            alpha, rgb, part = alpha[:, ::-1], rgb[:, ::-1], part[:, ::-1]
            root = np.array([alpha.shape[1] - root[0], root[1]])
        premult = rgb * alpha[..., None]
        ids = id_colours(len(self.names))
        id_image = np.zeros(rgb.shape, np.uint8)
        for index, colour in enumerate(ids):
            id_image[part == index] = sheets.hex_to_rgb(colour)
        sheets.save_png(folder / "white.png", np.round(premult + (1 - alpha[..., None]) * 255).astype(np.uint8))
        sheets.save_png(folder / "black.png", np.round(premult).astype(np.uint8))
        sheets.save_png(folder / "ids.png", id_image)
        view = view or self.view
        parts = {}
        for index, name in enumerate(self.names):
            if name not in self.gone:
                parts[name] = {"id": ids[index], "bone": name}
                if name in self.clip:
                    parts[name]["clipTo"] = self.clip[name]
        meta = {"species": "dog", "still": "fixture", "clip": f"still_{view}", "views": {"body": view, "head": view},
                "ppp": SCALE / self.k, "sizePx": [alpha.shape[1], alpha.shape[0]], "rootPx": [float(root[0]), float(root[1])],
                "parts": parts, "drawn": list(parts)}
        (folder / "still.json").write_text(json.dumps(meta, indent=1))
        return folder

    def source(self, view=None, mirror=False):
        """The source's landmarks for the points the sheet has no finder for: where the sheet has them."""
        view = view or self.view
        points = {n: v for n, v in MODEL["landmarks"][self.view].items() if n.startswith("paw.") or n == "tag.ring"}
        seat = match.hand_seat(match.Frame("dog", MODEL, self.view))
        if seat is not None:
            points["seat"] = seat
        if mirror:
            points = {match.swap_sides(n): [-x, y] for n, (x, y) in points.items()}
        return {view: points}


def rescale(alpha, rgb, part, root, scale):
    """Everything scaled by scale about the root, nearest pixel."""
    h, w = alpha.shape
    yy, xx = np.mgrid[:h, :w]
    sx = np.clip(np.floor((xx + 0.5 - root[0]) / scale + root[0]).astype(int), 0, w - 1)
    sy = np.clip(np.floor((yy + 0.5 - root[1]) / scale + root[1]).astype(int), 0, h - 1)
    return alpha[sy, sx], rgb[sy, sx], part[sy, sx], root


def run(fixture, folder, **options):
    fixture.write(folder, **options)
    landmarks = Path(folder) / "landmarks.json"
    landmarks.write_text(json.dumps(fixture.source(options.get("view"), options.get("mirror", False))))
    result, _ = match.match("dog", folder, landmarks)
    return result


def analytic_still(shapes, ppp, root, size, supersample=16):
    """A still of analytic shapes in model points: each a disc (x, y, r) or a box (x0, y0, x1, y1), drawn dark,
    with its alpha the share of each pixel it covers (supersampled for discs, exact for boxes)."""
    w, h = size
    alpha = np.zeros((h, w))
    part = np.full((h, w), -1)
    names = []
    for index, (name, shape) in enumerate(shapes.items()):
        names.append(name)
        cover = np.zeros((h, w))
        if len(shape) == 4:
            x0, y0, x1, y1 = (root[i % 2] + ppp * v for i, v in enumerate(shape))
            cx = np.clip(np.minimum(np.arange(w) + 1, x1) - np.maximum(np.arange(w), x0), 0, 1)
            cy = np.clip(np.minimum(np.arange(h) + 1, y1) - np.maximum(np.arange(h), y0), 0, 1)
            cover = cy[:, None] * cx[None, :]
        else:
            x, y, r = root[0] + ppp * shape[0], root[1] + ppp * shape[1], ppp * shape[2]
            i0, i1, j0, j1 = int(x - r) - 1, int(x + r) + 2, int(y - r) - 1, int(y + r) + 2
            sub = (np.arange(supersample) + 0.5) / supersample
            xs = (np.arange(i0, i1)[:, None] + sub[None, :]).ravel()
            ys = (np.arange(j0, j1)[:, None] + sub[None, :]).ravel()
            inside = ((xs[None, :] - x) ** 2 + (ys[:, None] - y) ** 2 <= r * r).astype(float)
            cover[j0:j1, i0:i1] = inside.reshape(j1 - j0, supersample, i1 - i0, supersample).mean(axis=(1, 3))
        alpha += cover
        part[cover >= 0.5] = index
    alpha = np.round(alpha * 255) / 255  # as an 8-bit still carries it
    meta = {"parts": {n: {"id": c, "bone": n} for n, c in zip(names, id_colours(len(names)))}, "ppp": ppp,
            "rootPx": list(root), "sizePx": [w, h], "views": {"body": "front", "head": "front"}}
    return match.Still(meta, alpha, alpha[..., None] * (np.array([40, 20, 10]) / 255), part)


class ResampleTest(unittest.TestCase):
    """The render comes back onto the crop's grid where it was drawn, within a quarter of a crop pixel."""

    SHAPES = {"a": (-20.3, -90.7, 9.1), "b": (25.6, -40.2, 6.0), "c": (-50.2, -20.4, -30.7, -3.3)}

    def setUp(self):
        self.frame = match.Frame("dog", MODEL, "front")

    def centroids(self, still, mirror=False):
        """Each shape's centre on the grid, from its alpha and from its ID pixels, in model points."""
        grid = match.Grid(self.frame, still)
        render = match.Render(grid, self.frame)
        ys, xs = np.mgrid[:grid.shape[0], :grid.shape[1]]
        found = {}
        for name, shape in self.SHAPES.items():
            if len(shape) == 4:
                centre = [(shape[0] + shape[2]) / 2, (shape[1] + shape[3]) / 2]
                reach = max(shape[2] - shape[0], shape[3] - shape[1])
            else:
                centre, reach = list(shape[:2]), 2 * shape[2]
            if mirror:
                centre = [-centre[0], centre[1]]
            # Each shape in a window of its own: they lie far apart.
            x, y = grid.to_index(centre)
            r = int(reach / self.frame.k) + 2
            window = np.zeros(grid.shape, bool)
            window[int(y) - r:int(y) + r, int(x) - r:int(x) + r] = True
            weights, ids = render.alpha * window, render.coverage[name]
            by_alpha = [float((weights * xs).sum() / weights.sum()), float((weights * ys).sum() / weights.sum())]
            by_id = [float((ids * xs).sum() / ids.sum()), float((ids * ys).sum() / ids.sum())]
            found[name] = (grid.to_pt(by_alpha), grid.to_pt(by_id), centre, float(weights.sum()))
        return found

    def assertWithinQuarterPixel(self, got, want):
        self.assertLessEqual(np.hypot(got[0] - want[0], got[1] - want[1]) / self.frame.k, 0.25, f"{got} against {want}")

    def test_shapes_come_back_where_they_were_drawn(self):
        for ppp, root in ((3.0, (301.0, 612.0)), (2.9, (301.37, 612.81)), (4.4, (447.5, 901.25))):
            still = analytic_still(self.SHAPES, ppp, root, (int(root[0] * 2), int(root[1] + 40 * ppp)))
            for name, (by_alpha, by_id, centre, area) in self.centroids(still).items():
                with self.subTest(ppp=ppp, shape=name):
                    self.assertWithinQuarterPixel(by_alpha, centre)
                    self.assertWithinQuarterPixel(by_id, centre)
                    shape = self.SHAPES[name]
                    want = (shape[2] - shape[0]) * (shape[3] - shape[1]) if len(shape) == 4 else np.pi * shape[2] ** 2
                    self.assertAlmostEqual(area * self.frame.k ** 2 / want, 1, delta=0.01)

    def test_an_edge_comes_back_where_it_was_drawn(self):
        still = analytic_still({"c": self.SHAPES["c"]}, 2.9, (301.37, 612.81), (602, 730))
        grid = match.Grid(self.frame, still)
        render = match.Render(grid, self.frame)
        x0, y0, x1, y1 = self.SHAPES["c"]
        row = int(grid.to_index([0, (y0 + y1) / 2])[1])
        first = int(np.nonzero(render.alpha[row] > 0.004)[0][0])
        edge = first + 1 - render.alpha[row, first]  # continuous: pixel i spans [i, i + 1)
        self.assertLessEqual(abs(edge - (grid.to_index([x0, 0])[0] + 0.5)), 0.25)

    def test_a_mirrored_still_mirrors_about_the_origin(self):
        still = analytic_still(self.SHAPES, 2.9, (301.37, 612.81), (602, 730))
        for name, (by_alpha, _, centre, _) in self.centroids(still.mirrored(), mirror=True).items():
            with self.subTest(shape=name):
                self.assertWithinQuarterPixel(by_alpha, centre)

    def test_area_weights_spread_each_input_pixel_once(self):
        weights = match.area_weights(10, 30, 2.3, 2.37)
        np.testing.assert_allclose(weights.sum(axis=1), 1, atol=1e-6)
        np.testing.assert_allclose(weights.sum(axis=0)[3:24] * 2.37, 1, atol=1e-5)

    def test_the_best_shift_finds_a_planted_shift(self):
        yy, xx = np.mgrid[:80, :80]
        sheet = (xx - 40) ** 2 + (yy - 40) ** 2 <= 400
        for dx, dy in ((0, 0), (3, 0), (-4, 2)):
            with self.subTest(shift=(dx, dy)):
                shift, _ = match.best_shift(match.shifted(sheet, -dx, -dy), sheet)
                self.assertLessEqual(np.hypot(shift[0] - dx, shift[1] - dy), 0.5)


class NamesTest(unittest.TestCase):
    def test_a_mirror_swaps_sides(self):
        self.assertEqual(match.swap_sides("paw.front.L"), "paw.front.R")
        self.assertEqual(match.swap_sides("collar.line.sheetLeft"), "collar.line.sheetRight")
        self.assertEqual(match.swap_sides("tail.base"), "tail.base")

    def test_an_id_a_little_off_still_names_its_part(self):
        ids = np.array([[[0, 0, 0], [200, 10, 10], [203, 12, 9], [100, 100, 100]]], dtype=np.float64)
        self.assertEqual(match.decode_ids(ids, ["#C80A0A"]).tolist(), [[-1, 0, 0, -1]])
        with self.assertRaises(ValueError):
            match.decode_ids(ids, ["#000000"])

    def test_each_painted_value_holds_only_the_regions_its_text_names(self):
        # Q24: each palettePainted entry for its own regions (its "for" text), never whichever is nearest.
        held = {}
        for region, (_, where) in match.REGIONS.items():
            held.setdefault(where, []).append(region)
        self.assertEqual(sorted(held[("palettePainted", "eyeDark")]), ["eyes", "nose"])
        self.assertEqual(held[("palette", "dark")], ["lowerIris"])
        self.assertEqual(held[("palettePainted", "markingLight")], ["headPatches"])
        self.assertEqual(held[("palettePainted", "furShade")], ["furShade"])
        self.assertEqual(held[("palettePainted", "tongue")], ["tongue"])
        self.assertEqual(held[("palettePainted", "mouthInside")], ["mouthInside"])
        self.assertEqual(sorted(held[("palette", "marking")]), ["bodyMarkings", "ears"])
        self.assertEqual({key for table, key in held if table == "palettePainted"}, set(MODEL["palettePainted"]))


class CropSelfCheckTest(unittest.TestCase):
    """The crop itself fed through as a render, one still pixel per crop pixel, gives phase 2's numbers back."""

    def test_the_crop_as_a_render_gives_back_phase_2s_landmarks(self):
        measured = json.loads((sheets.ROOT / "characters/dog/ref/measurements.json").read_text())["views"]
        for view in MODEL["crops"]:
            with self.subTest(view=view):
                frame = match.Frame("dog", MODEL, view)
                gx, gy = frame.rec["anchorsCropPx"]["ground"]
                h, w = frame.sil.shape
                meta = {"parts": {"body.back": {"id": "#808080", "bone": "body"}}, "ppp": 1 / frame.k,
                        "rootPx": [gx + 0.5, gy + 0.5], "sizePx": [w, h], "views": {"body": view, "head": view}}
                premult = frame.crop / 255 * frame.sil[..., None]
                still = match.Still(meta, frame.sil.astype(float), premult, np.where(frame.sil, 0, -1))
                grid = match.Grid(frame, still)
                render = match.Render(grid, frame)
                sheet = grid.pad(frame.sil, False)
                self.assertEqual(match.iou(render.sil, sheet), 1.0)
                self.assertEqual(match.best_shift(render.sil, sheet)[0], [0.0, 0.0])
                result, _, _ = match.check_landmarks(frame, grid, render, still, {})
                auto = [n for n, how in measured[view]["method"].items() if how.startswith("auto")]
                self.assertGreaterEqual(len(auto), 9)
                for name in auto:
                    row = result["rows"][name]
                    self.assertEqual(row["how"], "finder", name)
                    # model.json keeps a tenth of a point, so the same pixels differ only by its rounding.
                    self.assertLessEqual(row["errPt"], 0.071, name)


class PlantedTest(unittest.TestCase):
    """A still that passes every check, and the same still with one fault planted, which must fail."""

    @classmethod
    def setUpClass(cls):
        cls.folder = tempfile.TemporaryDirectory()
        cls.fixtures = {view: Fixture(view) for view in MODEL["crops"]}

    @classmethod
    def tearDownClass(cls):
        cls.folder.cleanup()

    def run_still(self, fixture, name, **options):
        return run(fixture, Path(self.folder.name) / name, **options)

    def fixture(self, view="front"):
        return copy.deepcopy(self.fixtures[view])

    def assertFailed(self, result, failed):
        self.assertEqual(result["failed"], failed, json.dumps({k: result[k] for k in result["failed"]})[:3000])

    def test_each_view_passes(self):
        for view in MODEL["crops"]:
            with self.subTest(view=view):
                result = self.run_still(self.fixture(view), f"pass-{view}")
                self.assertFailed(result, [])
                self.assertEqual(result["silhouette"]["iou"], 1.0)
                self.assertEqual(result["alignment"]["bestFitShiftPx"], [0.0, 0.0])

    def test_an_eye_moved_3_pt_fails_and_2_pt_passes(self):
        k = MODEL["crops"]["front"]["ptPerCropPx"]
        for px, fails in ((round(3 / k), True), (round(2 / k), False)):
            with self.subTest(moved_pt=round(px * k, 2)):
                fixture = self.fixture()
                fixture.move("eye.L", px, 0, "head.patch.L")
                result = self.run_still(fixture, f"eye-{px}")
                row = result["landmarks"]["rows"]["eye.L"]
                self.assertAlmostEqual(row["errPt"], px * k, delta=0.15)
                self.assertEqual(row["pass"], not fails)
                self.assertFailed(result, ["landmarks"] if fails else [])

    def test_a_4_px_shift_fails(self):
        result = self.run_still(self.fixture(), "shift", root_shift=(4, 0))
        self.assertIn("alignment", result["failed"])
        self.assertAlmostEqual(result["alignment"]["bestFitShiftPx"][0], 4, delta=0.5)
        self.assertLess(result["silhouette"]["iou"], 1.0)

    def test_a_marking_outside_its_part_fails(self):
        fixture = self.fixture()
        index = fixture.names.index("head.patch.L")
        patch = fixture.part == index
        grown = ndimage.binary_dilation(patch, iterations=5) & ~patch
        fixture.part[grown] = index
        fixture.rgb[grown] = hexes(("palettePainted", "markingLight"))
        fixture.alpha[grown] = 1
        fixture.sil |= grown
        del fixture.clip["head.patch.L"]
        result = self.run_still(fixture, "marking")
        row = result["markings"]["rows"]["head.patch.L"]
        self.assertFalse(row["clipped"])
        self.assertGreater(row["pxBesideOutside"], 0)
        self.assertIn("markings", result["failed"])

    def test_a_fur_tint_of_delta_e_4_fails(self):
        fur = hexes(("palette", "fur")).astype(float)
        tint = next(fur - [0, 0, d] for d in range(60) if palette.delta(fur - [0, 0, d], MODEL["palette"]["fur"]) >= 4)
        fixture = self.fixture()
        fixture.recolour(fur, tint)
        result = self.run_still(fixture, "tint")
        self.assertAlmostEqual(result["palette"]["rows"]["fur"]["deltaE2000"], 4, delta=0.3)
        self.assertFailed(result, ["palette"])

    def test_blush_at_60_percent_fails(self):
        fixture = self.fixture()
        fur, pink = hexes(("palette", "fur")).astype(float), hexes(("palette", "blush")).astype(float)
        for name in ("blush.L", "blush.R"):
            fixture.rgb[fixture.part == fixture.names.index(name)] = np.round(fur + 0.6 * (pink - fur))
        result = self.run_still(fixture, "blush")
        self.assertEqual(len(result["blush"]["cheeks"]), 2)
        for cheek in result["blush"]["cheeks"]:
            self.assertAlmostEqual(cheek["level"], 0.6, delta=0.02)
            self.assertLessEqual(cheek["coreDeltaE2000"], 3)
        self.assertFailed(result, ["blush"])

    def test_fewer_cheeks_than_the_sheet_shows_fails(self):
        fixture = self.fixture()
        fixture.relabel("blush.R", "head.base", hexes(("palette", "fur")))
        result = self.run_still(fixture, "one-cheek")
        # The cheek that is left passes on its own; before, that was the whole check.
        self.assertEqual([c["pass"] for c in result["blush"]["cheeks"]], [True])
        self.assertEqual(result["blush"]["sheetCheeks"], 2)
        self.assertEqual(result["blush"]["problem"], "1 cheek blush; the sheet shows 2")
        self.assertFailed(result, ["blush"])

    def test_a_cheek_with_no_light_pixels_fails_with_its_reason(self):
        fixture = self.fixture()
        ys, xs = np.nonzero(fixture.part == fixture.names.index("blush.L"))
        fixture.rgb[ys.min():ys.max() + 1, xs.min():xs.max() + 1] = hexes(("palettePainted", "eyeDark"))
        result = self.run_still(fixture, "dark-cheek")
        problems = [c["problem"] for c in result["blush"]["cheeks"] if "problem" in c]
        self.assertEqual(problems, ["no light pixels in its box, so no level can be fitted"])
        self.assertIn("blush", result["failed"])

    def test_a_marking_away_from_the_sheets_place_fails(self):
        fixture = self.fixture()
        ys, _ = np.nonzero(fixture.part == fixture.names.index("head.patch.L"))
        fixture.move("head.patch.L", 0, int(np.ptp(ys)) + 2, "head.base")
        result = self.run_still(fixture, "marking-moved")
        row = result["markings"]["rows"]["head.patch.L"]
        # What the check looked at before still holds: the right name, clipped to its host, shown.
        self.assertTrue(row["clipped"] and row["shows"] and row["expected"])
        self.assertEqual((row["place"]["renderCentroidInSheetPatch"], row["place"]["sheetCentroidInRender"]), (False, False))
        self.assertGreater(row["place"]["advisory"]["centroidDistancePt"], 10)
        self.assertIn("markings", result["failed"])
        # Unmoved, every marking is where the sheet has it, at its size (less what the eyes cover in the fixture).
        for name, row in self.run_still(self.fixture(), "marking-kept")["markings"]["rows"].items():
            if row.get("shows"):
                self.assertTrue(row["place"]["pass"], name)
                self.assertAlmostEqual(row["place"]["advisory"]["areaRatio"], 1.0, delta=0.05, msg=name)
                self.assertLess(row["place"]["advisory"]["centroidDistancePt"], 0.5, name)

    def test_a_marking_far_smaller_than_the_sheets_fails(self):
        fixture = self.fixture()
        index = fixture.names.index("back.patch.R")
        patch = fixture.part == index
        ys, xs = np.nonzero(patch)
        # Only a sliver at its outer edge is left: the sheet's centroid falls outside it.
        sliver = patch & (np.arange(patch.shape[1])[None, :] < xs.min() + 4)
        fixture.relabel("back.patch.R", "body.back", hexes(("palette", "fur")))
        fixture.part[sliver] = index
        fixture.rgb[sliver] = hexes(("palette", "marking"))
        result = self.run_still(fixture, "marking-sliver")
        row = result["markings"]["rows"]["back.patch.R"]
        self.assertTrue(row["shows"])
        self.assertFalse(row["place"]["sheetCentroidInRender"])
        self.assertLess(row["place"]["advisory"]["areaRatio"], 0.5)
        self.assertIn("markings", result["failed"])

    def test_a_mirrored_facing_is_held_to_the_mirrored_patch_of_its_own_sides_marking(self):
        fixture = self.fixture("threeQuarter.L")
        fixture.right_side()
        ys, _ = np.nonzero(fixture.part == fixture.names.index("back.patch.R"))
        fixture.move("back.patch.R", 0, -(int(np.ptp(ys)) + 2), "body.back")
        result = self.run_still(fixture, "right-moved", view="threeQuarter.R", mirror=True)
        place = result["markings"]["rows"]["back.patch.R"]["place"]
        self.assertFalse(place["pass"])
        # Reported in the facing's own coordinates: moved up, so a negative y offset.
        self.assertLess(place["advisory"]["centroidOffsetPt"][1], -5)
        self.assertIn("markings", result["failed"])

    def test_a_silhouette_scaled_5_percent_fails(self):
        result = self.run_still(self.fixture(), "scaled", scale=1.05)
        self.assertIn("landmarks", result["failed"])
        self.assertGreater(result["landmarks"]["rows"]["head.top"]["errPt"], 7)

    def test_a_plainly_mirrored_facing_fails(self):
        for view in ("threeQuarter", "side"):
            with self.subTest(view=view, names="kept"):
                # The left side's paws where the right side's belong, and the left side's markings.
                result = self.run_still(self.fixture(f"{view}.L"), f"plain-{view}", view=f"{view}.R", mirror=True)
                self.assertFailed(result, ["landmarks", "markings"])
                wrong = {n for n, r in result["landmarks"]["rows"].items() if not r["pass"]}
                self.assertEqual(wrong, {n for n in wrong if n.startswith("paw.")})
                self.assertTrue(wrong)
                self.assertIn("rump.patch.L", result["markings"]["shown"])
                self.assertIn("back.patch.R", result["markings"]["expected"])
            with self.subTest(view=view, names="swapped"):
                # Named for its own side, but still the left side's markings: the rump patch crosses over.
                fixture = self.fixture(f"{view}.L")
                fixture.swap_names()
                result = self.run_still(fixture, f"plain-named-{view}", view=f"{view}.R", mirror=True)
                self.assertFailed(result, ["markings"])
                self.assertEqual(result["markings"]["rows"]["rump.patch.R"]["problem"], "not in the marking map")

    def test_a_facing_mirrored_with_its_own_side_passes(self):
        for view in ("threeQuarter", "side"):
            with self.subTest(view=view):
                fixture = self.fixture(f"{view}.L")
                fixture.right_side()
                result = self.run_still(fixture, f"right-{view}", view=f"{view}.R", mirror=True)
                self.assertFailed(result, [])
                self.assertIn("paw.front.R", result["landmarks"]["rows"])
                left = MODEL["landmarks"][f"{view}.L"]["eye.L"]
                self.assertEqual(result["landmarks"]["rows"]["eye.R"]["model"], [-left[0], left[1]])

    def test_markings_painted_into_their_parts_are_found_and_a_plain_mirror_of_them_fails(self):
        fixture = self.fixture("threeQuarter.L")
        fixture.bake()
        result = self.run_still(fixture, "baked")
        self.assertFailed(result, [])
        self.assertTrue(result["markings"]["rows"]["rump.patch.L"]["paintedIntoHost"])
        fixture.swap_names()
        result = self.run_still(fixture, "baked-plain", view="threeQuarter.R", mirror=True)
        self.assertFailed(result, ["markings"])
        self.assertTrue(result["markings"]["unexpectedTan"])

    def test_the_command_writes_its_evidence_and_exits_by_its_verdict(self):
        for name, plant, code in (("cli-pass", {}, 0), ("cli-fail", {"root_shift": (4, 0)}, 1)):
            with self.subTest(still=name):
                folder = Path(self.folder.name) / name
                self.fixture().write(folder, **plant)
                (folder / "landmarks.json").write_text(json.dumps(self.fixtures["front"].source()))
                out = folder / "out"
                args = ["dog", "--still", str(folder), "--out", str(out), "--landmarks", str(folder / "landmarks.json")]
                self.assertEqual(match.main(args), code)
                for file in ("match.json", "compare.png", "phone.png"):
                    self.assertTrue((out / file).exists(), file)
                with Image.open(out / "phone.png") as phone:
                    self.assertGreater(phone.height, 164 * match.PHONE_PPP)
        with contextlib.redirect_stderr(io.StringIO()) as said:
            self.assertEqual(match.main(["dog", "--still", str(Path(self.folder.name) / "none"), "--out", str(out)]), 2)
        self.assertIn("still.json", said.getvalue())

    def test_match_json_names_paths_from_the_repository_and_records_every_threshold(self):
        # Inside the repository, as the look loop's stills and landmarks are.
        folder = sheets.ROOT / "build" / "sheetmatch-test"
        try:
            self.fixture().write(folder)
            (folder / "landmarks.json").write_text(json.dumps(self.fixtures["front"].source()))
            result, _ = match.match("dog", folder, folder / "landmarks.json")
        finally:
            shutil.rmtree(folder, ignore_errors=True)
        self.assertEqual(result["landmarkSource"], "build/sheetmatch-test/landmarks.json")
        self.assertNotIn(str(sheets.ROOT), json.dumps(result))
        recorded = result["thresholds"]
        self.assertEqual((recorded["shownPt2"], recorded["bakedMinPx"], recorded["silhouetteIoUMin"]), (match.SHOWN_PT2, match.BAKED_MIN_PX, match.IOU_MIN["front"]))
        self.assertEqual(recorded["blushRestingSpread"], MODEL["blush"]["restingSpread"])
        # Every numeric constant of the module is a threshold match.json records, but the images' own settings.
        constants = {name: value for name, value in vars(match).items() if name.isupper() and isinstance(value, (int, float))}
        for name, value in constants.items():
            if name not in ("PHONE_PPP", "ZOOM"):
                self.assertIn(value, recorded.values(), name)

    def test_any_error_exits_2_and_leaves_no_verdict(self):
        """1 means only that a gating check failed: a crash anywhere is 2, and no match.json, old or half-made, stays."""
        folder = Path(self.folder.name) / "crash"
        self.fixture().write(folder)
        (folder / "landmarks.json").write_text(json.dumps(self.fixtures["front"].source()))
        out = folder / "out"
        args = ["dog", "--still", str(folder), "--out", str(out), "--landmarks", str(folder / "landmarks.json")]
        self.assertEqual(match.main(args), 0)
        self.assertTrue((out / "match.json").exists())
        # A check that crashes (a box with no light pixels once raised IndexError here).
        original = match.check_blush
        match.check_blush = lambda *_: [][0]
        try:
            with contextlib.redirect_stderr(io.StringIO()) as said:
                self.assertEqual(match.main(args), 2)
        finally:
            match.check_blush = original
        self.assertIn("IndexError", said.getvalue())
        self.assertFalse((out / "match.json").exists(), "the last run's match.json stays beside a crash")
        # A landmarks file that is not there is an error, not a run without the source's points.
        with contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(match.main(args[:-1] + [str(folder / "missing.json")]), 2)
        # Run as a command, an error before any check, even in an import, exits 2.
        fake = folder / "fake"
        fake.mkdir()
        (fake / "numpy.py").write_text("raise ImportError('planted')\n")
        script = Path(match.__file__).resolve()
        env = dict(os.environ, PYTHONPATH=str(fake))
        ran = subprocess.run([sys.executable, str(script), *args], capture_output=True, text=True, env=env)
        self.assertEqual(ran.returncode, 2, ran.stderr)
        self.assertIn("planted", ran.stderr)
        ran = subprocess.run([sys.executable, str(script), *args], capture_output=True, text=True)
        self.assertEqual(ran.returncode, 0, ran.stderr)


if __name__ == "__main__":
    unittest.main()
