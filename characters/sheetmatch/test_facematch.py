"""Tests for the Faces check (spec section 5b, The sheet match: Faces, L525).
Until the face library is drawn there is no face clip to render, so each panel
itself is carried into a still the way a render arrives (upright, in model
points, its nose where the turnaround's front nose is) and must pass against
its own record; every primary panel laid on every other primary's record must
fail wherever the two draw different states; the same still with a fault
planted (an eye moved 3 pt, a mouth corner moved 3 pt, the nose moved, an open
eye on a crescent panel) must fail; and the turnaround's front, the rest front's
stand-in, passes as neutral, fails as laughing, singing and excited, and fails
with its face moved 4 pt on its head.

    python3 -m unittest discover -s characters/sheetmatch -p test_facematch.py -v"""
import contextlib
import functools
import io
import json
import tempfile
import unittest
from pathlib import Path

import numpy as np
from scipy import ndimage

import facematch
import match
import test_sheetmatch

faces, sheets = facematch.faces, match.sheets
MODEL = json.loads((sheets.ROOT / "characters/dog/model.json").read_text())
FRONT = MODEL["landmarks"]["front"]
PPP = 3.0  # still pixels per point, the look loop's
TOLERANCE = match.LANDMARK_SHARE * MODEL["proportions"]["headWidth"]
M, E = "master.expression.", "expressions.expression."
PRIMARIES = sorted({pid for pid, r in MODEL["faceCrops"].items() if r["primaryFor"] and "nose" in r["anchorsCropPx"]})
# Shape classes of the dark marks the check compares. The sheets draw the wide eye as the open eye with a ring of white
# round its iris (expressions.eyes.surprised-round), which no dark mark sees: one class (DECISIONS.md 117).
EYE_CLASS = {"open": "open", "wide": "open", "happy": "crescent", "closed": "closed"}
# Pairs of primary panels that the spec names apart but the sheets draw alike where the preset holds them (render
# panel, record panel, preset): the master sheet's Excited and Laughing, whose mouths' corners lie within 0.5 pt and
# whose open parts differ less (1.25 times) than Happy's and Excited's open mouths do (1.27 times).
DRAWN_ALIKE = {(M + "excited", M + "laughing", "laughing"), (M + "excited", M + "laughing", "ticklish"),
               (M + "laughing", M + "excited", "excited")}
# Pairs that draw the same held states and lie in the same places, so they legitimately match (render, record, preset):
# both draw happy crescents and singing holds only the eyes on Laughing; Curious and Shy both draw open eyes where the
# other does, with downturned mouths no preset is held to; Surprised's eyes are the open eyes neutral holds on Happy.
SAME_STATES = {(M + "excited", M + "laughing", "singing"), (M + "content", M + "laughing", "singing"),
               (M + "curious", E + "shy", "shy"), (E + "shy", M + "curious", "curious"),
               (E + "surprised", M + "happy", "neutral")}


@functools.cache
def panel(pid):
    return facematch.Panel("dog", MODEL, pid)


class PanelStill:
    """A panel as a still: its crop, the left-out boxes in the card's colour, carried into model space by its record's
    scale and roll, its face left at the front view's own roll as a render's is, with its nose (or, with no face, its
    head top) on the turnaround's front landmark, opaque over the crop and clear over the card round it, all of it
    head.base. Faults are planted in the still's own pixels, as a drawing's would be."""

    def __init__(self, pid, ppp=PPP):
        self.panel = facematch.Panel("dog", MODEL, pid)
        panel = self.panel
        self.pin = "nose" if "nose" in panel.anchors else "head.top"
        self.origin = panel.origin(self.pin, MODEL["landmarks"]["front"][self.pin])
        h, w = panel.shape
        corners = np.array([[0, 0], [w, 0], [0, h], [w, h]], float)
        q = (corners - self.origin) @ facematch.rotation(-panel.turn).T * panel.k
        low, high = q.min(axis=0) - 2, q.max(axis=0) + 2
        size = np.ceil((high - low) * ppp).astype(int)
        self.ppp, self.root = ppp, -low * ppp
        vs, us = np.mgrid[:size[1], :size[0]]
        model = np.stack([(us + 0.5 - self.root[0]) / ppp, (vs + 0.5 - self.root[1]) / ppp], axis=-1)
        crop = model @ facematch.rotation(panel.turn).T / panel.k + self.origin
        self.crop_at = crop  # each still pixel's place on the panel's canvas, continuous pixels
        p = panel.pad
        inside = (crop[..., 0] >= p) & (crop[..., 1] >= p) & (crop[..., 0] < w - p) & (crop[..., 1] < h - p)
        coords = [crop[..., 1].ravel() - 0.5, crop[..., 0].ravel() - 0.5]
        self.rgb = np.stack([ndimage.map_coordinates(panel.shown[..., c].astype(float), coords, order=1, mode="nearest")
                             .reshape(inside.shape) for c in range(3)], axis=-1)
        self.alpha = inside.astype(float)
        self.part = np.where(inside, 0, -1)
        self.names = ["head.base"]

    def still(self, clip="face_fixture"):
        meta = {"species": "dog", "still": "panel", "clip": clip, "views": {"body": "front", "head": "front"},
                "ppp": self.ppp, "sizePx": [self.alpha.shape[1], self.alpha.shape[0]], "rootPx": [float(v) for v in self.root],
                "parts": {n: {"id": c, "bone": "head"} for n, c in zip(self.names, ("#808080", "#20A040", "#A02040", "#2040A0", "#A0A020"))},
                "drawn": list(self.names)}
        return match.Still(meta, self.alpha, self.rgb / 255 * self.alpha[..., None], self.part)

    def feature(self, name):
        """A feature's mark on the panel (faces.py's rules), as the still's pixels it covers, grown by two crop pixels so it
        takes the sheet's soft edge with it."""
        panel = self.panel
        _, masks = faces.find_face(panel.canvas, panel.keep, {n: list(q) for n, q in panel.anchors.items()},
                                   panel.width_px, panel.roll)
        mark = masks[name]
        x = np.clip(np.floor(self.crop_at[..., 0]).astype(int), 0, mark.shape[1] - 1)
        y = np.clip(np.floor(self.crop_at[..., 1]).astype(int), 0, mark.shape[0] - 1)
        grow = int(np.ceil(2 * panel.rec["ptPerCropPx"] * self.ppp))
        return ndimage.binary_dilation(mark[y, x] & (self.alpha > 0), iterations=grow)

    def move(self, mask, dx_pt, dy_pt=0.0):
        """Moves the pixels of a mask by whole still pixels, the place they left filled with the fur around them."""
        dx, dy = int(round(dx_pt * self.ppp)), int(round(dy_pt * self.ppp))
        ring = ndimage.binary_dilation(mask, iterations=4) & ~ndimage.binary_dilation(mask, iterations=2)
        fur = np.median(self.rgb[ring], axis=0)
        moved = match.shifted(mask, dx, dy)
        colours = np.roll(self.rgb, (dy, dx), axis=(0, 1))
        self.rgb[mask] = fur
        self.rgb[moved] = colours[moved]

    def label(self, mask, name):
        """Gives the mask's pixels a part of their own, as a drawing's ID pass would."""
        if name not in self.names:
            self.names.append(name)
        self.part[mask] = self.names.index(name)


def own(pid, preset=None, plant=None):
    """A panel's still checked against its own record for one of its presets, after an optional plant(fixture)."""
    fixture = PanelStill(pid)
    if plant:
        plant(fixture)
    preset = preset or panel(pid).rec["presets"][0]
    row, *_ = facematch.check_panel(fixture.still(), panel(pid), preset, FRONT, TOLERANCE, picture=False)
    return row


def failed(row):
    return [n for n, r in row["rows"].items() if not r["pass"]] + [f"{n} shape" for n, r in row["shapes"].items() if not r["pass"]]


class OwnPanelTest(unittest.TestCase):
    """Each panel fed through as a render passes against its own record, every eye, nose and mouth anchor within half a
    point (a sixth of the tolerance) after two resamplings, up to the still and back onto the panel, and each mark's
    shape within 12% of its area (a smile's 2 px line loses a tenth of its pixels to the two resamplings) and an IoU of
    0.88."""

    def test_each_panel_as_its_own_render_passes(self):
        for pid, rec in MODEL["faceCrops"].items():
            measured = facematch.measure_on(PanelStill(pid).still(), panel(pid), FRONT)
            for preset in rec["presets"]:
                with self.subTest(panel=pid, preset=preset):
                    row = facematch.judge(measured, panel(pid), preset, TOLERANCE)
                    self.assertTrue(row["pass"], json.dumps(row)[:1500])
                    self.assertEqual(row["gating"], preset in rec["primaryFor"])
                    self.assertEqual(sorted(row["heldTo"]), sorted(rec["gates"][preset]))
                    for name, r in row["rows"].items():
                        self.assertNotIn("missing", r, name)
                        if name != "head.top":
                            self.assertLessEqual(r["errPt"], 0.5, f"{name}: {r}")
                    for name, r in row["shapes"].items():
                        self.assertAlmostEqual(r["areaRatio"], 1, delta=0.12, msg=name)
                        self.assertGreaterEqual(r["iou"], 0.88, name)

    def test_the_render_is_pinned_at_the_nose_wherever_it_lies(self):
        # Moved 10 pt right and 10 pt down as a whole, the face is the same face on the panel: the nose places it (the
        # head gate is what sees a face moved on its head).
        def shift(fixture):
            fixture.root = fixture.root + 10 * fixture.ppp
        row = own(M + "happy", "happy", shift)
        self.assertTrue(row["pass"], json.dumps(row)[:1500])
        self.assertAlmostEqual(float(np.hypot(*row["alignment"]["shiftFromModelPt"])), 10 * np.sqrt(2), delta=1.0)

    def test_the_record_s_marks_are_the_ones_faces_py_measured(self):
        # The check finds the record's marks again on the padded, enlarged canvas: the same areas as model.json keeps.
        for pid, rec in MODEL["faceCrops"].items():
            p = panel(pid)
            for name, shape in rec["shapesPt2"].items():
                with self.subTest(panel=pid, mark=name):
                    self.assertAlmostEqual(float(p.marks[name].sum()) * p.k ** 2, shape["areaPt2"], delta=0.06)
                    if name == "mouth":
                        self.assertAlmostEqual(float(p.marks["mouth.open"].sum()) * p.k ** 2, shape["openPt2"], delta=0.06)

    def test_a_head_standing_higher_is_laid_whole(self):
        # The canvas holds a quarter of the head's width of card round the panel: the render's tuft, cut off at the
        # crop's top edge before, now lies on it.
        p = panel(M + "happy")
        self.assertEqual(p.pad, round(facematch.PAD_SHARE * p.width_px))
        self.assertTrue((p.shown[:p.pad] == np.round(p.card)).all())
        self.assertGreater(p.anchors["head.top"][1], p.pad)


class PlantedTest(unittest.TestCase):
    """The panel's own still with one fault planted, which must fail."""

    def test_an_eye_moved_3_pt_fails_and_2_pt_passes(self):
        for pid in (M + "happy", M + "excited"):  # an open eye and a crescent
            for moved, fails in ((3.0, True), (2.0, False)):
                with self.subTest(panel=pid, moved_pt=moved):
                    row = own(pid, plant=lambda f: f.move(f.feature("eye.L"), moved))
                    r = row["rows"]["eye.L"]
                    self.assertAlmostEqual(r["errPt"], moved, delta=0.35)
                    self.assertEqual(r["pass"], not fails)
                    self.assertTrue(row["shapes"]["eye.L"]["pass"])
                    self.assertEqual(row["pass"], not fails)

    def test_a_mouth_corner_moved_3_pt_fails_where_the_mouth_is_held(self):
        def corner(dx, dy):
            def plant(fixture):
                mouth = fixture.feature("mouth")
                xs = np.nonzero(mouth)[1]
                near = mouth & (np.arange(mouth.shape[1])[None, :] <= xs.min() + 0.25 * np.ptp(xs))
                fixture.move(near, dx, dy)
            return plant
        for pid in (M + "happy", E + "happy"):
            for move in ((-3.0, 0.0), (3.0, 0.0), (0.0, 3.0), (0.0, -3.0)):
                with self.subTest(panel=pid, move=move):
                    row = own(pid, "happy", corner(*move))
                    self.assertTrue(row["rows"]["mouth.L"]["pass"])
                    self.assertAlmostEqual(row["rows"]["mouth.R"]["errPt"], 3.0, delta=0.35)
                    if pid == M + "happy" and move == (-3.0, 0.0):
                        # Outward on the master sheet's 1 px curl the round trip's own 0.28 pt inward lean takes it to
                        # 2.71 pt, inside the 2.8 pt tolerance: the fixture's double resampling, not a render's.
                        self.assertLess(row["rows"]["mouth.R"]["errPt"], TOLERANCE)
                        continue
                    self.assertFalse(row["rows"]["mouth.R"]["pass"])
                    self.assertFalse(row["pass"])
        # neutral's mouth is the smile, which the Happy panel does not draw: reported, not held.
        row = own(M + "happy", "neutral", corner(0.0, 3.0))
        self.assertFalse(row["rows"]["mouth.R"]["held"])
        self.assertFalse(row["shapes"]["mouth"]["held"])
        self.assertGreater(row["rows"]["mouth.R"]["errPt"], TOLERANCE)
        self.assertTrue(row["pass"])

    def test_a_nose_moved_3_pt_fails_the_face_it_places(self):
        row = own(E + "surprised", plant=lambda f: f.move(f.feature("nose"), 0.0, 3.0))
        self.assertFalse(row["pass"])
        self.assertTrue(all(not row["rows"][n]["pass"] for n in ("eye.R", "eye.L")))

    def test_an_open_eye_on_a_crescent_panel_fails_by_its_shape(self):
        # Each crescent of Excited painted over with a dark disc of the open eye's size (Happy's, in square points), on
        # the crescent's own centroid: the eyes are where the sheet's are, and their shape fails.
        open_pt2 = MODEL["faceCrops"][M + "happy"]["shapesPt2"]["eye.L"]["areaPt2"]

        def paint(fixture):
            for name in ("eye.R", "eye.L"):
                mark = fixture.feature(name)
                ys, xs = np.nonzero(mark)
                vv, uu = np.mgrid[:mark.shape[0], :mark.shape[1]]
                radius = np.sqrt(open_pt2 / np.pi) * fixture.ppp
                fixture.rgb[mark] = np.median(fixture.rgb[ndimage.binary_dilation(mark, iterations=4) & ~mark], axis=0)
                fixture.rgb[(uu - xs.mean()) ** 2 + (vv - ys.mean()) ** 2 <= radius ** 2] = (32, 12, 2)
        row = own(M + "excited", "excited", paint)
        self.assertFalse(row["pass"])
        for name in ("eye.R", "eye.L"):
            self.assertLessEqual(row["rows"][name]["errPt"], TOLERANCE, name)
            shape = row["shapes"][name]
            self.assertFalse(shape["pass"], name)
            self.assertGreater(shape["areaRatio"], facematch.EYE_AREA_RATIO, name)
            self.assertLess(shape["iou"], facematch.EYE_IOU, name)

    def test_a_feature_is_found_among_its_own_parts(self):
        # The eye moved 16 pt and a dark spot of some other part left where it was: with the eye named in the ID pass,
        # the eye is found where it went and fails; read from the pixels alone, the spot would pass for it.
        def plant(fixture, named):
            eye = fixture.feature("eye.L")
            fixture.move(eye, 16.0)
            ys, xs = np.nonzero(eye)
            vv, uu = np.mgrid[:eye.shape[0], :eye.shape[1]]
            fixture.rgb[(uu - xs.mean()) ** 2 + (vv - ys.mean()) ** 2 <= (2.5 * fixture.ppp) ** 2] = (32, 12, 2)
            if named:
                fixture.label(match.shifted(eye, int(round(16 * fixture.ppp)), 0), "eye.L")
        named = own(M + "happy", plant=lambda f: plant(f, True))["rows"]["eye.L"]
        self.assertAlmostEqual(named["errPt"], 16.0, delta=0.5)
        self.assertFalse(named["pass"])
        unnamed = own(M + "happy", plant=lambda f: plant(f, False))["rows"]["eye.L"]
        self.assertLess(unnamed["errPt"], 1.0)
        self.assertTrue(unnamed["pass"])


class PairTest(unittest.TestCase):
    """Every primary panel laid as a render on every other primary panel's record, for each preset that record is the
    primary of: where a held feature draws another state, it fails; where the two draw the same held states, it passes
    only where they lie in the same places too (SAME_STATES), and DRAWN_ALIKE lists the states the spec names apart that
    the sheets draw alike."""

    @classmethod
    def setUpClass(cls):
        stills = {pid: PanelStill(pid).still() for pid in PRIMARIES}
        cls.rows = {}
        for a in PRIMARIES:
            for b in PRIMARIES:
                if a != b:
                    measured = facematch.measure_on(stills[a], panel(b), FRONT)
                    for preset in panel(b).rec["primaryFor"]:
                        cls.rows[a, b, preset] = facematch.judge(measured, panel(b), preset, TOLERANCE)

    @staticmethod
    def differ(a, b, preset):
        """The held features whose drawn state differs between the two panels."""
        ra, rb = MODEL["faceCrops"][a], MODEL["faceCrops"][b]
        held = rb["gates"][preset]
        out = [n for n in ("eye.R", "eye.L") if n in held and EYE_CLASS[ra["eyeStates"][n]] != EYE_CLASS[rb["eyeStates"][n]]]
        if "mouth.R" in held and ra["drawn"]["mouth"] != rb["drawn"]["mouth"]:
            out.append("mouth")
        return out

    def test_every_pair_of_primary_panels_that_draws_another_state_fails(self):
        self.assertEqual(len(PRIMARIES), 9)
        for (a, b, preset), row in self.rows.items():
            differ = self.differ(a, b, preset)
            with self.subTest(render=a, record=b, preset=preset, differ=differ):
                if (a, b, preset) in DRAWN_ALIKE:
                    self.assertEqual(differ, ["mouth"])
                    self.assertTrue(row["pass"], failed(row))
                elif differ:
                    self.assertFalse(row["pass"])
                elif (a, b, preset) in SAME_STATES:
                    self.assertTrue(row["pass"], failed(row))
                else:
                    # The same states in other places: what differs is where the anchors lie, never their shapes.
                    self.assertFalse(row["pass"])
                    self.assertTrue(all(r["pass"] for r in row["shapes"].values()), failed(row))

    def test_what_differs_between_excited_and_laughing_is_how_far_the_mouth_opens(self):
        # The master sheet's Laughing opens about a quarter more than Excited, with its corners within 0.5 pt: reported
        # on both records, and less than Happy's and Excited's open mouths differ, which must pass each other.
        laughing_on_excited = self.rows[M + "laughing", M + "excited", "excited"]
        excited_on_laughing = self.rows[M + "excited", M + "laughing", "laughing"]
        self.assertGreater(laughing_on_excited["shapes"]["mouth"]["openRatio"], 1.2)
        self.assertLess(excited_on_laughing["shapes"]["mouth"]["openRatio"], 1 / 1.2)
        for row in (laughing_on_excited, excited_on_laughing):
            for corner in ("mouth.R", "mouth.L"):
                self.assertLess(row["rows"][corner]["errPt"], 0.6)
        happy = own_on(M + "excited", M + "happy", "happy")["shapes"]["mouth"]
        self.assertGreater(abs(np.log(happy["openRatio"])), abs(np.log(laughing_on_excited["shapes"]["mouth"]["openRatio"])))


def own_on(a, b, preset):
    return facematch.check_panel(PanelStill(a).still(), panel(b), preset, FRONT, TOLERANCE, picture=False)[0]


class Turnaround:
    """The turnaround's front as a still (test_sheetmatch's fixture: the crop, each region its own part): the rest
    front's stand-in, its face where model.json's landmarks are."""

    @staticmethod
    def still(folder, move_face=None):
        fixture = test_sheetmatch.Fixture("front")
        if move_face:
            dx, dy = move_face
            for name in ("eye.L", "eye.R", "nose", "mouth"):
                fixture.move(name, dx, dy, "head.base")
        fixture.write(folder)
        return match.Still.load(folder)


class RestFrontTest(unittest.TestCase):
    """The turnaround's front, open eyes and an open mouth, against the presets, and moved on its head."""

    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.rest = Turnaround.still(Path(cls.tmp.name) / "rest")

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def test_it_passes_as_neutral_and_fails_as_laughing_singing_and_excited(self):
        result, _ = facematch.check("dog", self.rest, self.rest, "neutral")
        self.assertTrue(result["pass"], result["summary"])
        self.assertEqual((result["anchorsHeld"], result["shapesHeld"]), (2, 2))
        for preset in ("laughing", "singing", "excited"):
            with self.subTest(preset=preset):
                result, _ = facematch.check("dog", self.rest, self.rest, preset)
                self.assertFalse(result["pass"])
                shapes = result["records"][result["primary"]]["shapes"]
                # Its round open eyes are about three times the crescents' area.
                for name in ("eye.R", "eye.L"):
                    self.assertFalse(shapes[name]["pass"], name)
                    self.assertGreater(shapes[name]["areaRatio"], facematch.EYE_AREA_RATIO)

    def test_the_face_moved_4_pt_on_its_head_fails_and_in_place_passes(self):
        k = MODEL["crops"]["front"]["ptPerCropPx"]
        gate = facematch.check("dog", self.rest, self.rest, "neutral")[0]["headGate"]
        self.assertTrue(gate["pass"])
        for move in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            px = int(round(4 / k))  # whole crop pixels, about 4 pt
            with self.subTest(move=move), tempfile.TemporaryDirectory() as tmp:
                moved = Turnaround.still(Path(tmp) / "moved", (move[0] * px, move[1] * px))
                result, _ = facematch.check("dog", moved, self.rest, "neutral")
                # Pinned at its own nose the face still matches the panel; on its head it does not.
                self.assertTrue(result["records"][result["primary"]]["pass"], result["summary"])
                self.assertFalse(result["headGate"]["pass"])
                self.assertFalse(result["pass"])
                for row in result["headGate"]["rows"].values():
                    self.assertGreater(row["errPt"], TOLERANCE)

    def test_the_head_is_head_base_s_pixels(self):
        frame = facematch.head_frame(self.rest)
        part = self.rest.part == self.rest.names.index("head.base")
        ys, xs = np.nonzero(part)
        self.assertAlmostEqual(frame["topPt"], (ys.min() - self.rest.root[1]) / self.rest.ppp, places=2)
        self.assertAlmostEqual(frame["widthPt"], (xs.max() + 1 - xs.min()) / self.rest.ppp, places=2)
        no_head = match.Still(dict(self.rest.meta, parts={n: v for n, v in self.rest.meta["parts"].items() if n != "head.base"}),
                              self.rest.alpha, self.rest.premult, self.rest.part)
        with self.assertRaisesRegex(ValueError, "head.base"):
            facematch.head_frame(no_head)


class CommandTest(unittest.TestCase):
    def write(self, folder, fixture, clip):
        still = fixture.still(clip)
        folder.mkdir(parents=True, exist_ok=True)
        premult = still.premult * 255
        sheets.save_png(folder / "white.png", np.round(premult + (1 - still.alpha[..., None]) * 255).astype(np.uint8))
        sheets.save_png(folder / "black.png", np.round(premult).astype(np.uint8))
        ids = np.zeros(premult.shape, np.uint8)
        for index, name in enumerate(fixture.names):
            ids[still.part == index] = sheets.hex_to_rgb(still.meta["parts"][name]["id"])
        sheets.save_png(folder / "ids.png", ids)
        (folder / "still.json").write_text(json.dumps(still.meta))

    def test_the_command_writes_its_evidence_and_exits_by_its_verdict(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp = Path(tmp)
            passing = PanelStill(M + "laughing")
            self.write(tmp / "pass", passing, "face_laughing")
            failing = PanelStill(M + "laughing")
            failing.move(failing.feature("eye.R"), 3.0)
            self.write(tmp / "fail", failing, "face_laughing")
            rest = ["--rest", str(tmp / "pass")]
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(facematch.main(["dog", "--still", str(tmp / "pass"), "--out", str(tmp / "out-pass")] + rest), 0)
                self.assertEqual(facematch.main(["dog", "--still", str(tmp / "fail"), "--out", str(tmp / "out-fail")] + rest), 1)
            for name in ("out-pass", "out-fail"):
                self.assertTrue((tmp / name / "beside.png").exists())
                result = json.loads((tmp / name / "match.json").read_text())
                self.assertEqual((result["preset"], result["primary"]), ("laughing", M + "laughing"))
                self.assertEqual(result["thresholds"]["landmarkPt"], round(TOLERANCE, 2))
                # Only the primary panel gates; the panels beside it are measured and marked so.
                self.assertEqual([pid for pid, r in result["records"].items() if r["gating"]], [M + "laughing"])
                self.assertIn("headGate", result)
            failed_json = json.loads((tmp / "out-fail" / "match.json").read_text())
            self.assertFalse(failed_json["pass"])
            self.assertIn("eye.R", failed_json["summary"])
            # An error is 2 and leaves no verdict: a still that is not a face clip, no still at all, no rest still.
            self.write(tmp / "notface", passing, "still_front")
            with contextlib.redirect_stderr(io.StringIO()):
                self.assertEqual(facematch.main(["dog", "--still", str(tmp / "notface"), "--out", str(tmp / "out-pass")] + rest), 2)
                self.assertEqual(facematch.main(["dog", "--still", str(tmp / "none"), "--out", str(tmp / "out-pass")] + rest), 2)
                self.assertEqual(facematch.main(["dog", "--still", str(tmp / "pass"), "--out", str(tmp / "out-pass"), "--rest", str(tmp / "none")]), 2)
            self.assertFalse((tmp / "out-pass" / "match.json").exists())

    def test_a_preset_no_panel_holds_is_judged_by_eye_and_its_head_still_held(self):
        fixture = PanelStill(M + "content").still("face_hungry")
        result, drawn = facematch.check("dog", fixture, fixture, None)
        self.assertEqual((result["records"], result["anchorsHeld"]), ({}, 0))
        self.assertIn("judged by eye", result["summary"])
        self.assertIn("nose", result["headGate"]["rows"])
        fixture = PanelStill("expressions.ears.lifted-slightly").still("face_listening")
        result, drawn = facematch.check("dog", fixture, fixture, None)
        self.assertEqual((result["primary"], result["anchorsHeld"]), ("expressions.ears.lifted-slightly", 0))
        self.assertIn("judged by eye", result["summary"])
        with tempfile.TemporaryDirectory() as tmp:
            facematch.beside_image(result, drawn, Path(tmp) / "beside.png")
            self.assertTrue((Path(tmp) / "beside.png").exists())

    def test_a_still_in_another_view_is_an_error(self):
        still = PanelStill(M + "happy").still("face_happy")
        rest = PanelStill(M + "happy").still("still_front")
        still.meta["views"] = {"body": "side.L", "head": "side.L"}
        with self.assertRaises(ValueError):
            facematch.check("dog", still, rest)


class RecordsTest(unittest.TestCase):
    def test_no_face_crop_names_a_face_rule_r3_forbids(self):
        panels = {p["id"]: p for p in json.loads((sheets.ROOT / "characters/dog/ref/panels.json").read_text())["panels"]}
        for pid, rec in MODEL["faceCrops"].items():
            self.assertFalse(faces.forbidden(panels[pid]), pid)
            self.assertTrue(set(rec["presets"]) <= set(faces.PRESETS), pid)
            for name in ("sad", "angry", "pout", "drooped"):
                self.assertNotIn(name, pid)

    def test_thresholds_are_recorded(self):
        # Every numeric constant of the check and of the rules it measures with is in match.json, but the images' sizes
        # and faces.py's checks of the hand-written records.
        recorded = facematch.thresholds(MODEL["proportions"]["headWidth"])
        self.assertEqual(recorded["landmarkShareOfHead"], match.LANDMARK_SHARE)
        self.assertEqual(recorded["landmarkPt"], round(TOLERANCE, 2))
        values = [v for v in recorded.values() if not isinstance(v, list)]
        values += [x for v in recorded.values() if isinstance(v, list) for x in v]
        for module, skip in ((facematch, {"BESIDE_HEAD_PX"}), (faces, {"ZOOM", "SNAP_PX", "WIDEST_SHARE"})):
            for name, value in vars(module).items():
                if name.isupper() and isinstance(value, (int, float)) and name not in skip:
                    self.assertIn(value, values, f"{module.__name__}.{name}")
        self.assertEqual(recorded["softL"], list(faces.SOFT_L))
        for name in ("eyeAreaRatio", "eyeIoU", "mouthIoU", "mouthOpenRatio", "mouthOpenFloorShare"):
            self.assertIn(name, recorded)


if __name__ == "__main__":
    unittest.main()
