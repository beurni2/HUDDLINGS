"""Tests for the Faces check (spec section 5b, The sheet match: Faces, L525).
Until the face library is drawn there is no face clip to render, so each panel
itself is carried into a still the way a render arrives (upright, in model
points, its nose where the turnaround's front nose is) and must pass against
its own record; every primary panel laid on every other primary's record must
fail wherever the two draw different states; the same still with a fault
planted (an eye moved 3 pt, a mouth corner moved 3 pt, the nose moved, an open
eye on a crescent panel) must fail; and the turnaround's front, the rest front's
stand-in, passes as neutral, fails as laughing, singing and excited, and fails
with its face moved 4 pt on its head. Its cheeks, the printed pink over the fur
at a known level, are held to the level each preset asks for: a level half way
where shy asks for 80% fails, and so do the neighbouring levels the presets name.

    python3 -m unittest discover -s characters/sheetmatch -p test_facematch.py -v"""
import contextlib
import copy
import functools
import io
import json
import tempfile
import unittest
from pathlib import Path

import numpy as np
from scipy import ndimage

import facecal
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
EYE_CLASS = facecal.EYE_CLASS  # the shape classes of the dark marks the check compares (DECISIONS.md 117)
# Pairs of primary panels that the spec names apart but the sheets draw alike where the preset holds them (render
# panel, record panel, preset): the master sheet's Excited and Laughing, whose mouths' corners lie within 0.5 pt and
# whose open parts differ less (1.25 times) than Happy's and Excited's open mouths do (1.27 times).
DRAWN_ALIKE = {(M + "excited", M + "laughing", "laughing"), (M + "excited", M + "laughing", "ticklish"),
               (M + "laughing", M + "excited", "excited")}
# Pairs that draw the same held states and lie in the same places on a level record, so they legitimately match
# (render, record, preset): both draw happy crescents and singing holds only the eyes on Laughing; Surprised's eyes are
# the open eyes neutral holds on Happy. On a record that turns the head (Curious, Shy, Sleepy) the eyes are held by
# their shapes and spacing, so every panel that draws the same eyes as far apart passes there.
SAME_STATES = {(M + "excited", M + "laughing", "singing"), (M + "content", M + "laughing", "singing"),
               (E + "surprised", M + "happy", "neutral")}
# A stand-in for the build's presets.json (presets.ts's data): every face preset at the resting level but the two the
# spec's table blushes, shy at 80% and blissful at 70% (L486, L494). The check holds whatever levels it is given.
PRESETS = {"PRESETS": {name: {"blush": {"shy": 0.8, "blissful": 0.7}.get(name)} for name in faces.PRESETS}}


def check(still, rest, preset=None, presets=None):
    return facematch.check("dog", still, rest, preset, PRESETS if presets is None else presets)


@functools.cache
def panel(pid):
    return facematch.Panel("dog", MODEL, pid)


def PanelStill(pid, ppp=PPP):
    return facecal.PanelStill(MODEL, pid, ppp)


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

    def test_a_record_that_turns_the_head_holds_each_pair_by_its_spacing(self):
        # The expression sheet's Happy taken as if it turned the head: one mouth corner moved 3 pt changes the corners'
        # spacing and fails; the whole mouth moved 3 pt keeps it and passes there, where on the level record its corners
        # fail by place. Each eye's place is reported, the eyes' spacing held.
        turned = copy.copy(panel(E + "happy"))
        turned.turned = True

        def corner(fixture):
            mouth = fixture.feature("mouth")
            xs = np.nonzero(mouth)[1]
            fixture.move(mouth & (np.arange(mouth.shape[1])[None, :] <= xs.min() + 0.25 * np.ptp(xs)), 0.0, 3.0)

        def whole(fixture):
            fixture.move(fixture.feature("mouth"), 0.0, 3.0)
        for plant, on_turned in ((corner, False), (whole, True)):
            with self.subTest(plant=plant.__name__):
                fixture = PanelStill(E + "happy")
                plant(fixture)
                still = fixture.still()
                row = facematch.check_panel(still, turned, "happy", FRONT, TOLERANCE, picture=False)[0]
                self.assertEqual(row["pass"], on_turned, failed(row))
                self.assertEqual(sorted(row["spacing"]), ["eyes", "mouth"])
                self.assertFalse(any(row["rows"][n]["held"] for n in ("eye.R", "eye.L", "mouth.R", "mouth.L")))
                self.assertEqual(row["spacing"]["mouth"]["pass"], on_turned)
                self.assertTrue(row["spacing"]["eyes"]["pass"])
                level = facematch.check_panel(still, panel(E + "happy"), "happy", FRONT, TOLERANCE, picture=False)[0]
                self.assertFalse(level["pass"])
                self.assertFalse(level["rows"]["mouth.R"]["pass"])

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
    primary of: where a held feature draws another state, it fails; where the two draw the same held states, a level
    record passes only where they lie in the same places too (SAME_STATES), and a record that turns the head passes
    where the eyes are as far apart; DRAWN_ALIKE lists the states the spec names apart that the sheets draw alike."""

    @classmethod
    def setUpClass(cls):
        stills = {pid: PanelStill(pid).still() for pid in PRIMARIES}
        cls.rows, cls.features = {}, []
        for a in PRIMARIES:
            for b in PRIMARIES:
                if a != b:
                    measured = facematch.measure_on(stills[a], panel(b), FRONT)
                    for preset in panel(b).rec["primaryFor"]:
                        cls.rows[a, b, preset] = facematch.judge(measured, panel(b), preset, TOLERANCE)
                    everything = facecal.everything(panel(b))
                    row = facematch.judge(measured, everything, "all", TOLERANCE)
                    cls.features += facecal.feature_rows(a, MODEL["faceCrops"][a], b, MODEL["faceCrops"][b], dict(row, tolerance=TOLERANCE))

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
        counts = {"differ": 0, "turned": 0}
        for (a, b, preset), row in self.rows.items():
            differ = self.differ(a, b, preset)
            with self.subTest(render=a, record=b, preset=preset, differ=differ):
                if (a, b, preset) in DRAWN_ALIKE:
                    self.assertEqual(differ, ["mouth"])
                    self.assertTrue(row["pass"], failed(row))
                elif differ:
                    counts["differ"] += 1
                    self.assertFalse(row["pass"])
                elif MODEL["faceCrops"][b]["turned"]:
                    # The same eyes on a turned record: held by their shapes and spacing, which they share.
                    counts["turned"] += 1
                    self.assertTrue(row["pass"], failed(row))
                    self.assertTrue(row["spacing"]["eyes"]["pass"])
                    self.assertFalse(any(r["held"] for n, r in row["rows"].items() if n.startswith("eye")))
                elif (a, b, preset) in SAME_STATES:
                    self.assertTrue(row["pass"], failed(row))
                else:
                    # The same states in other places: what differs is where the anchors lie, never their shapes.
                    self.assertFalse(row["pass"])
                    self.assertTrue(all(r["pass"] for r in row["shapes"].values()), failed(row))
        self.assertEqual(counts, {"differ": 114, "turned": 6})

    def test_the_shape_gates_lie_between_the_same_states_and_the_different(self):
        # Over every feature the primaries draw, each laid on the others (facecal.py runs the same over every panel and
        # the rest front): the worst same-state pair passes each gate and the best different-state pair it must
        # separate fails it, among the pairs whose places pass.
        measures, passing = facecal.spread(self.features)
        for name, m in measures.items():
            with self.subTest(measure=name, **m):
                low, high = sorted((m["worstSame"], m["bestDifferent"]))
                self.assertLess(low, m["used"])
                self.assertGreater(high, m["used"])
        self.assertEqual(facecal.wrong_side(passing), [])

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

    def test_an_open_mouth_passes_cheeky_s_mouth_its_red_reported(self):
        # Cheeky draws its tongue out over a closed smile; the expression sheet's Mischievous draws its cheeky mouth
        # open with the tongue in it, as Happy draws the open mouth. No gate tells them apart (DECISIONS.md 118,
        # docs/QUESTIONS.md Q27): an open mouth passes Cheeky's mouth rows, and only the share of its open part that
        # is the inside's deep red, reported, tells it from the tongue out. Its open eye fails the wink.
        for render in (M + "happy", M + "excited"):
            with self.subTest(render=render):
                row = own_on(render, M + "cheeky", "mischievous")
                self.assertTrue(all(row["rows"][n]["pass"] for n in ("mouth.R", "mouth.L")))
                mouth = row["shapes"]["mouth"]
                self.assertTrue(mouth["pass"], mouth)
                self.assertGreater(mouth["redShare"], 2 * mouth["recordRedShare"])
                self.assertFalse(row["pass"])
                self.assertFalse(row["shapes"]["eye.R"]["pass"] and row["shapes"]["eye.L"]["pass"])


def own_on(a, b, preset):
    return facematch.check_panel(PanelStill(a).still(), panel(b), preset, FRONT, TOLERANCE, picture=False)[0]


class Turnaround:
    """The turnaround's front as a still (test_sheetmatch's fixture: the crop, each region its own part): the rest
    front's stand-in, its face where model.json's landmarks are. Faults are planted in the fixture's crop pixels."""

    @staticmethod
    def still(folder, move_face=None, plant=None, root_shift=(0, 0)):
        fixture = test_sheetmatch.Fixture("front")
        if move_face:
            dx, dy = move_face
            for name in ("eye.L", "eye.R", "nose", "mouth"):
                fixture.move(name, dx, dy, "head.base")
        if plant:
            plant(fixture)
        fixture.write(folder, root_shift=root_shift)
        return match.Still.load(folder)


def blushed(level):
    """The fixture's cheeks repainted at a level: the printed pink over the printed fur, flat over each blush part."""
    def plant(fixture):
        fur, pink = (sheets.hex_to_rgb(MODEL["palette"][k]).astype(float) for k in ("fur", "blush"))
        for name in ("blush.L", "blush.R"):
            fixture.rgb[fixture.part == fixture.names.index(name)] = np.round(fur + level * (pink - fur))
    return plant


def fur_of(fixture):
    return np.median(fixture.rgb[fixture.part == fixture.names.index("head.base")], axis=0)


def half_lids(fixture):
    """Each eye drawn as the sleepy half-lid is (expressions.eyes.sleepy-half-lid): its upper half covered by a lid in
    the fur's colour with no outline, a dark lash line across its middle, every pixel still the eye's own part."""
    fur = fur_of(fixture)
    rows = np.arange(fixture.part.shape[0])[:, None]
    for name in ("eye.R", "eye.L"):
        eye = fixture.part == fixture.names.index(name)
        ys = np.nonzero(eye)[0]
        middle = (ys.min() + ys.max()) / 2
        fixture.rgb[eye & (rows < middle)] = fur
        fixture.rgb[eye & (np.abs(rows - middle) <= 1)] = (32, 12, 2)


def unnamed_eyes(fixture):
    """The eyes' pixels given to the head, as a still whose ID pass names no eye part draws them."""
    for name in ("eye.R", "eye.L"):
        fixture.relabel(name, "head.base")
        fixture.gone.add(name)


def puffed(points):
    """head.base widened by so many points each side over its lower half, as cheeks drawn fuller into it would be."""
    def plant(fixture):
        head = fixture.part == fixture.names.index("head.base")
        ys = np.nonzero(head)[0]
        grow = int(round(points / fixture.k))
        lower = (np.arange(head.shape[0]) > (ys.min() + ys.max()) / 2)[:, None]
        # Only the card and the body round the head take it: the ears, and the face and patches on the head, stay.
        kept = ("ear.L", "ear.R", "head.patch.L", "head.patch.R", "blush.L", "blush.R", "eye.L", "eye.R", "nose", "mouth")
        added = ndimage.binary_dilation(head, structure=np.ones((1, 2 * grow + 1), bool)) & lower & ~head
        added &= ~np.isin(fixture.part, [fixture.names.index(n) for n in kept])
        fixture.part[added] = fixture.names.index("head.base")
        fixture.rgb[added] = fur_of(fixture)
        fixture.sil |= added
        fixture.alpha[added] = 1.0
    return plant


class RestFrontTest(unittest.TestCase):
    """The turnaround's front, open eyes and an open mouth, against the presets, and moved on its head."""

    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.rest = Turnaround.still(Path(cls.tmp.name) / "rest")

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def planted(self, name, **kwargs):
        return Turnaround.still(Path(self.tmp.name) / name, **kwargs)

    def test_it_passes_as_neutral_and_fails_as_laughing_singing_and_excited(self):
        result, _ = check(self.rest, self.rest, "neutral")
        self.assertTrue(result["pass"], result["summary"])
        self.assertEqual((result["anchorsHeld"], result["shapesHeld"]), (2, 2))
        for preset in ("laughing", "singing", "excited"):
            with self.subTest(preset=preset):
                result, _ = check(self.rest, self.rest, preset)
                self.assertFalse(result["pass"])
                shapes = result["records"][result["primary"]]["shapes"]
                # Its round open eyes are about three times the crescents' area.
                for name in ("eye.R", "eye.L"):
                    self.assertFalse(shapes[name]["pass"], name)
                    self.assertGreater(shapes[name]["areaRatio"], facematch.EYE_AREA_RATIO)

    def test_its_open_eyes_pass_curious_and_shy_whose_panels_turn_the_head(self):
        # Curious and Shy draw open eyes on a head turned 4 to 5 pt toward the sheet's left: held by place against the
        # nose, the front's eyes lay 5 to 6 pt off. They are held by their shapes and spacing, and on the head. Shy
        # blushes at 80% (its cheeks repainted so; the turnaround's rest at 35%).
        shy = self.planted("shy", plant=blushed(0.8))
        for preset, still in (("curious", self.rest), ("shy", shy)):
            with self.subTest(preset=preset):
                result, _ = check(still, self.rest, preset)
                self.assertTrue(result["pass"], result["summary"])
                primary = result["records"][result["primary"]]
                self.assertTrue(primary["turned"])
                self.assertGreater(abs(primary["turnAcrossPt"]), TOLERANCE)
                self.assertEqual((result["anchorsHeld"], result["spacingsHeld"], result["shapesHeld"]), (0, 1, 2))
                self.assertLess(primary["spacing"]["eyes"]["errPt"], TOLERANCE)
                self.assertGreater(max(primary["rows"][n]["errPt"] for n in ("eye.R", "eye.L")), TOLERANCE)
                self.assertIn("eyes' spacing", result["summary"])
        # Sleepy's panel turns the head too, and draws closed arcs further apart than open eyes, as the crescents are:
        # the open eyes fail by their shape and their spacing.
        result, _ = check(self.rest, self.rest, "sleepy")
        primary = result["records"][result["primary"]]
        self.assertTrue(primary["turned"])
        self.assertFalse(result["pass"])
        self.assertFalse(primary["shapes"]["eye.R"]["pass"] or primary["shapes"]["eye.L"]["pass"])

    def test_the_face_moved_4_pt_on_its_head_fails_and_in_place_passes(self):
        k = MODEL["crops"]["front"]["ptPerCropPx"]
        gate = check(self.rest, self.rest, "neutral")[0]["headGate"]
        self.assertTrue(gate["pass"])
        self.assertEqual(gate["headShiftPt"], [0.0, 0.0])
        for move in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            px = int(round(4 / k))  # whole crop pixels, about 4 pt
            with self.subTest(move=move):
                moved = self.planted(f"moved{move}", move_face=(move[0] * px, move[1] * px))
                result, _ = check(moved, self.rest, "neutral")
                # Pinned at its own nose the face still matches the panel; on its head it does not.
                self.assertTrue(result["records"][result["primary"]]["pass"], result["summary"])
                self.assertFalse(result["headGate"]["pass"])
                self.assertFalse(result["pass"])
                for row in result["headGate"]["rows"].values():
                    self.assertGreater(row["errPt"], TOLERANCE)

    def test_a_half_lid_is_placed_by_its_eye_not_its_dark_mark(self):
        # The half-lid's dark mark (the lower iris and the lash line) sits about 4 pt below the open eye's; the eye's own
        # pixels do not move. In place it passes; the same eyes moved 4 pt fail; read from the dark marks alone (a still
        # whose ID pass names no eye part), the half-lid in place would fail.
        lids = check(self.planted("lids", plant=half_lids), self.rest, "tender")[0]["headGate"]
        self.assertTrue(lids["pass"], lids)
        self.assertLess(lids["rows"]["eyes.middle"]["errPt"], 0.5)
        self.assertIn("parts' pixels", lids["rows"]["eyes.middle"]["measuredBy"])
        px = int(round(4 / MODEL["crops"]["front"]["ptPerCropPx"]))

        def moved_lids(fixture):
            for name in ("eye.R", "eye.L"):
                fixture.move(name, 0, px, "head.base")
            half_lids(fixture)
        moved = check(self.planted("lids-moved", plant=moved_lids), self.rest, "tender")[0]["headGate"]
        self.assertFalse(moved["pass"])
        self.assertGreater(moved["rows"]["eyes.middle"]["errPt"], TOLERANCE)

        def marks_only(fixture):
            half_lids(fixture)
            unnamed_eyes(fixture)
        dark = check(self.planted("lids-unnamed", plant=marks_only), self.rest, "tender")[0]["headGate"]
        self.assertIn("dark mark", dark["rows"]["eyes.middle"]["measuredBy"])
        self.assertGreater(dark["rows"]["eyes.middle"]["errPt"], TOLERANCE)

    def test_the_head_is_found_by_its_whole_shape(self):
        # Cheeks drawn up to 3 pt fuller into head.base, and the whole dog drawn 5 pt off: the face stays on its head.
        for points in (1.0, 2.0, 3.0):
            with self.subTest(puffed_pt=points):
                result = check(self.planted(f"puff{points}", plant=puffed(points)), self.rest, "neutral")[0]
                self.assertTrue(result["headGate"]["pass"], result["headGate"])
                self.assertLess(float(np.hypot(*result["headGate"]["headShiftPt"])), 0.5)
        shift = int(round(5 / MODEL["crops"]["front"]["ptPerCropPx"]))
        away = check(self.planted("away", root_shift=(shift, -shift)), self.rest, "neutral")[0]
        self.assertTrue(away["pass"], away["summary"])
        self.assertAlmostEqual(float(np.hypot(*away["headGate"]["headShiftPt"])), np.hypot(shift, shift) * MODEL["crops"]["front"]["ptPerCropPx"], delta=0.3)
        self.assertGreater(away["headGate"]["headIoU"], 0.99)

    def test_the_head_is_head_base_and_what_is_clipped_to_it(self):
        mask = facematch.head_mask(self.rest)
        indices = [self.rest.names.index(n) for n in ("head.base", "head.patch.L", "head.patch.R", "blush.L", "blush.R")]
        self.assertTrue(mask[np.isin(self.rest.part, indices)].all())
        # The face's features lie inside it, holes filled.
        self.assertTrue(mask[np.isin(self.rest.part, [self.rest.names.index(n) for n in ("eye.L", "eye.R", "nose")])].all())
        no_head = match.Still(dict(self.rest.meta, parts={n: v for n, v in self.rest.meta["parts"].items() if n != "head.base"}),
                              self.rest.alpha, self.rest.premult, self.rest.part)
        with self.assertRaisesRegex(ValueError, "head.base"):
            facematch.head_mask(no_head)

    def test_a_render_with_no_nose_says_so_and_holds_nothing(self):
        def no_nose(fixture):
            fixture.relabel("nose", "head.base", fur_of(fixture))
        result, _ = check(self.planted("nonose", plant=no_nose), self.rest, "laughing")
        primary = result["records"][result["primary"]]
        self.assertFalse(result["pass"])
        self.assertEqual((primary["anchorsHeld"], primary["spacingsHeld"], primary["shapesHeld"]), (0, 0, 0))
        self.assertIn("no nose near the record's", result["summary"])
        self.assertNotIn("anchors", result["summary"].split(";")[0])


class BlushTest(unittest.TestCase):
    """The blush as a level (docs/QUESTIONS.md Q25), on the turnaround's front: each cheek fitted as match.py fits a
    view's, held to the resting spread where the preset names no level and within BLUSH_LEVEL_TOLERANCE of its level
    otherwise (DECISIONS.md 190)."""

    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.stills = {}

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def at(self, level, **kwargs):
        """The turnaround's front with its cheeks at a level (None: as the sheet paints them, at rest)."""
        key = (level, tuple(sorted(kwargs)))
        if key not in self.stills:
            plant = blushed(level) if level is not None else None
            self.stills[key] = Turnaround.still(Path(self.tmp.name) / f"blush{len(self.stills)}", plant=plant, **kwargs)
        return self.stills[key]

    def blush(self, still, preset, presets=None):
        return facematch.check_blush("dog", MODEL, still, facematch.blush_asked(presets or PRESETS, preset))[0]

    def test_at_rest_each_cheek_lies_in_the_sheet_s_resting_spread(self):
        result, drawn = check(self.at(None), self.at(None), "neutral")
        blush = result["blush"]
        self.assertTrue(blush["measured"] and blush["pass"], blush)
        self.assertEqual(sorted(c["part"] for c in blush["cheeks"]), ["blush.L", "blush.R"])
        for cheek in blush["cheeks"]:
            self.assertAlmostEqual(cheek["level"], 0.35, delta=0.02)
        self.assertEqual(blush["restingSpread"], MODEL["blush"]["restingSpread"])
        self.assertIsNone(blush.get("asked"))
        self.assertIn("blush held (", result["summary"])
        self.assertIn("rest 0.29 to 0.43", result["summary"])
        self.assertEqual(result["thresholds"]["blushLevelTolerance"], facematch.BLUSH_LEVEL_TOLERANCE)
        self.assertEqual(result["thresholds"]["blushRestingSpread"], MODEL["blush"]["restingSpread"])
        with tempfile.TemporaryDirectory() as tmp:
            facematch.beside_image(result, drawn, Path(tmp) / "beside.png")
            self.assertTrue((Path(tmp) / "beside.png").exists())

    def test_a_level_half_way_where_shy_asks_for_80_percent_fails(self):
        # Planted: the cheeks at 50% where the preset asks for 80%.
        result, _ = check(self.at(0.5), self.at(None), "shy")
        blush = result["blush"]
        self.assertFalse(blush["pass"])
        self.assertFalse(result["pass"])
        self.assertEqual((blush["asked"], blush["tolerance"]), (0.8, facematch.BLUSH_LEVEL_TOLERANCE))
        for cheek in blush["cheeks"]:
            self.assertAlmostEqual(cheek["level"], 0.5, delta=0.02)
            self.assertAlmostEqual(cheek["levelErr"], -0.3, delta=0.02)
            self.assertFalse(cheek["pass"])
        self.assertIn("blush FAILS (", result["summary"])
        self.assertIn("0.8 asked, within 0.05", result["summary"])
        # The primary panel and the head pass: the blush alone fails it.
        self.assertTrue(result["records"][result["primary"]]["pass"] and result["headGate"]["pass"])
        self.assertTrue(self.blush(self.at(0.8), "shy")["pass"])

    def test_the_neighbouring_levels_the_presets_name_are_told_apart(self):
        # Shy at 80% and blissful at 70%: each passes its own and fails the other's, and the resting preset's spread
        # takes neither. Within the tolerance of the level asked a cheek passes; past it, it fails.
        for level, preset, passes in ((0.8, "shy", True), (0.7, "shy", False), (0.7, "blissful", True), (0.8, "blissful", False),
                                      (0.8, "neutral", False), (0.7, "neutral", False), (0.35, "neutral", True), (0.35, "shy", False)):
            with self.subTest(level=level, preset=preset):
                self.assertEqual(self.blush(self.at(level), preset)["pass"], passes)
        tolerance = facematch.BLUSH_LEVEL_TOLERANCE
        for off, passes in ((tolerance - 0.02, True), (-(tolerance - 0.02), True), (tolerance + 0.02, False), (-(tolerance + 0.02), False)):
            with self.subTest(off=off):
                self.assertEqual(self.blush(self.at(round(0.8 + off, 3)), "shy")["pass"], passes)

    def test_the_level_asked_is_the_presets_own(self):
        # Whatever presets.json says is what is held: shy asking 50% passes the 50% cheeks.
        asking = {"PRESETS": dict(PRESETS["PRESETS"], shy={"blush": 0.5})}
        self.assertTrue(self.blush(self.at(0.5), "shy", asking)["pass"])
        with self.assertRaisesRegex(ValueError, "name no preset 'shy'"):
            facematch.blush_asked({"PRESETS": {}}, "shy")
        with self.assertRaisesRegex(ValueError, "not a level from 0 to 1"):
            facematch.blush_asked({"PRESETS": {"shy": {"blush": 1.5}}}, "shy")

    def test_a_missing_cheek_fails_as_the_sheet_match_s_does(self):
        def one_cheek(fixture):
            fixture.relabel("blush.R", "head.base", fur_of(fixture))
        blush = self.blush(Turnaround.still(Path(self.tmp.name) / "onecheek", plant=one_cheek), "neutral")
        self.assertFalse(blush["pass"])
        self.assertEqual(blush["problem"], "1 cheek blush; the sheet shows 2")
        self.assertEqual([c["part"] for c in blush["cheeks"]], ["blush.L"])

    def test_a_still_naming_no_blush_part_fails_wherever_a_blush_is_asked_for(self):
        # Planted: the rest front with its blush parts renamed, the pixels the same. Shy asks for 80% and the front's
        # crop shows two blushing cheeks, so neither passes without a cheek to fit (match.py fails it the same way).
        def renamed(fixture):
            for side in ("L", "R"):
                fixture.names[fixture.names.index(f"blush.{side}")] = f"pinkcheek.{side}"
                fixture.clip[f"pinkcheek.{side}"] = fixture.clip.pop(f"blush.{side}")
        still = Turnaround.still(Path(self.tmp.name) / "renamed", plant=renamed)
        result, _ = check(still, self.at(None), "shy")
        self.assertEqual((result["blush"]["measured"], result["blush"]["pass"], result["pass"]), (False, False, False))
        self.assertIn("blush FAILS (the still names no blush part, so no cheek is held to the 0.8 its preset asks for)", result["summary"])
        blush = self.blush(still, "neutral")
        self.assertEqual((blush["pass"], blush["sheetCheeks"]), (False, 2))
        self.assertEqual(blush["problem"], "the still names no blush part; the sheet shows 2 cheeks blushing")
        # A sheet panel carried into a still is one part, head.base, its cheeks the sheet's own: judged by eye where its
        # preset asks for no level, and failed where it asks for one. Without the panel's mark it is a still like any.
        fixture = PanelStill(M + "laughing").still("face_laughing")
        result, _ = check(fixture, fixture)
        self.assertEqual((result["blush"]["measured"], result["blush"]["pass"]), (False, True))
        self.assertIn(f"blush held (a sheet panel ({M}laughing), its cheeks the sheet's own: judged by eye)", result["summary"])
        self.assertFalse(self.blush(fixture, "shy")["pass"])
        del fixture.meta["panel"]
        self.assertFalse(self.blush(fixture, "laughing")["pass"])


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
            (tmp / "presets.json").write_text(json.dumps(PRESETS))
            rest = ["--rest", str(tmp / "pass"), "--presets", str(tmp / "presets.json")]
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
                self.assertEqual(facematch.main(["dog", "--still", str(tmp / "pass"), "--out", str(tmp / "out-pass"), "--rest", str(tmp / "none"),
                                                 "--presets", str(tmp / "presets.json")]), 2)
                # And no presets: the build writes them, and nothing stands in for them.
                said = io.StringIO()
                with contextlib.redirect_stderr(said):
                    self.assertEqual(facematch.main(["dog", "--still", str(tmp / "pass"), "--out", str(tmp / "out-pass"), "--rest", str(tmp / "pass"),
                                                     "--presets", str(tmp / "nopresets.json")]), 2)
                self.assertIn("no presets at", said.getvalue())
            self.assertFalse((tmp / "out-pass" / "match.json").exists())

    def test_a_preset_no_panel_holds_is_judged_by_eye_and_its_head_still_held(self):
        fixture = PanelStill(M + "content").still("face_hungry")
        result, drawn = check(fixture, fixture, None)
        self.assertEqual((result["records"], result["anchorsHeld"]), ({}, 0))
        self.assertIn("judged by eye", result["summary"])
        self.assertIn("nose", result["headGate"]["rows"])
        fixture = PanelStill("expressions.ears.lifted-slightly").still("face_listening")
        result, drawn = check(fixture, fixture, None)
        self.assertEqual((result["primary"], result["anchorsHeld"]), ("expressions.ears.lifted-slightly", 0))
        self.assertIn("judged by eye", result["summary"])
        with tempfile.TemporaryDirectory() as tmp:
            facematch.beside_image(result, drawn, Path(tmp) / "beside.png")
            self.assertTrue((Path(tmp) / "beside.png").exists())

    def test_a_still_in_another_view_is_an_error(self):
        still = PanelStill(M + "happy").still("face_happy")
        rest = PanelStill(M + "happy").still("still_front")
        still.meta["views"] = {"body": "side.L", "head": "side.L"}
        with self.assertRaisesRegex(ValueError, "draws the front view"):
            check(still, rest)


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
        for name in ("eyeAreaRatio", "eyeIoU", "mouthIoU", "mouthOpenRatio", "mouthOpenFloorShare", "turnedShareOfHead"):
            self.assertIn(name, recorded)
        # A panel turns the head where the turn alone would put a front-on face's eyes past the landmark tolerance.
        self.assertEqual(faces.TURNED_SHARE, match.LANDMARK_SHARE)


if __name__ == "__main__":
    unittest.main()
